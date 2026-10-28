#!/usr/bin/env node
// Pedestrian velocity histogram: drives the crowd sim directly (clock paused, fixed steps) and records
// every member's per-step displacement speed (raw, d/h) and the smoothed m.speed that feeds the gait.
// Spikes (> --spike m/s) are reported with the party state, persona and the calling code line.
//   node scripts/ped-velocity.mjs [--seconds 240] [--speed 4] [--fps 60] [--spike 3.5] [--hours 11] [--out shots/w4/vel.json]
import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import fs from 'node:fs';
const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const seconds = parseFloat(args.seconds ?? '240'), speed = parseFloat(args.speed ?? '4'), fps = parseFloat(args.fps ?? '60');
const spike = parseFloat(args.spike ?? '3.5');
let url = (args.url ?? 'http://127.0.0.1:5173/') + '?nointro&noidle&skip=traffic,rail,boats,audio,postfx&time=' + (args.hours ?? '11') + (args.q ? '&' + args.q : '');
await acquireLock();
const { browser } = await launchBrowser({});
let res;
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.routeWebSocket(/.*/, () => {});
  page.on('pageerror', (e) => console.error('pageerror', String(e)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 3, null, { timeout: 300000 });
  res = await page.evaluate(([seconds, speed, fps, spike]) => {
    const c = window.__city;
    c.setSpeed(0);
    const crowd = c.ctx.services.pedestrians._crowd;
    const raw = new Array(40).fill(0), sm = new Array(40).fill(0);
    const spikes = [];
    const orig = crowd.moveMember.bind(crowd);
    let curH = 0;
    const prev = new WeakMap();
    crowd.moveMember = function (m, x, z, y, h, f, fx, fz) {
      const d = Math.hypot(x - m.x, z - m.z), v = d / h;
      const p0 = m.party, cur = { s: p0.s, delta: p0.delta, file: p0.file, offs: p0.offs ? p0.offs[m.idx] : 0, rail: p0.rail, bx: Math.hypot(m.bx, m.bz), state: p0.state };
      const pr = prev.get(m); prev.set(m, cur);
      raw[Math.min(39, Math.floor(v * 2))]++;
      if (v > spike && spikes.length < 4000) {
        const st = new Error().stack.split('\n').slice(2, 5).map((s) => s.trim().replace(/\(.*\/src\//, '(').replace(/\?t=\d+/, '')).join(' < ');
        const p = m.party;
        spikes.push({ v: +v.toFixed(2), d: +d.toFixed(3), h: +h.toFixed(4), state: p.state, persona: p.persona, pv: +(p.v ?? 0).toFixed(2), pspeed: +p.speed.toFixed(2), size: p.size, idx: m.idx, file: p.file, at: st,
          ds: pr ? +(cur.s - pr.s).toFixed(3) : null, dDelta: pr ? +(cur.delta - pr.delta).toFixed(3) : null, dFile: pr ? +(cur.file - pr.file).toFixed(3) : null,
          dOffs: pr ? +(cur.offs - pr.offs).toFixed(3) : null, newRail: pr ? pr.rail !== cur.rail : null, bx: +cur.bx.toFixed(3), prevState: pr?.state });
      }
      return orig(m, x, z, y, h, f, fx, fz);
    };
    const dt = speed / fps, n = Math.round(seconds * fps);
    let maxSm = 0;
    for (let i = 0; i < n; i++) {
      crowd.update(dt);
      for (const p of crowd.parties) for (const m of p.members) {
        if (!m.present) continue;
        sm[Math.min(39, Math.floor(m.speed * 2))]++;
        if (m.speed > maxSm) maxSm = m.speed;
      }
    }
    crowd.moveMember = orig;
    // summarise spikes by call site + state
    const groups = {};
    for (const s of spikes) { const k = s.state + '<' + s.prevState + ' newRail=' + s.newRail + ' ' + (Math.abs(s.ds) > s.d * 0.5 ? 'S' : '') + (Math.abs(s.dDelta) > 0.05 ? 'D' : '') + (Math.abs(s.dFile) > 0.01 ? 'F' : '') + (Math.abs(s.dOffs) > 0.05 ? 'O' : '') + (s.bx > 0.05 ? 'B' : ''); (groups[k] ??= { n: 0, maxV: 0, ex: s }).n++; groups[k].maxV = Math.max(groups[k].maxV, s.v); }
    return { raw, sm, maxSm, nSpikes: spikes.length, groups, spikes: spikes.slice(0, 60) };
  }, [seconds, speed, fps, spike]);
} finally { await browser.close(); releaseLock(); }
const fmt = (a) => a.map((n, i) => n ? `${(i / 2).toFixed(1)}-${((i + 1) / 2).toFixed(1)}: ${n}` : null).filter(Boolean).join('\n');
console.log('RAW d/h histogram (m/s):\n' + fmt(res.raw));
console.log('SMOOTHED m.speed histogram (present members, per step):\n' + fmt(res.sm));
console.log('max smoothed', res.maxSm.toFixed(2), ' spikes', res.nSpikes);
for (const [k, g] of Object.entries(res.groups).sort((a, b) => b[1].n - a[1].n)) console.log(g.n, 'max', g.maxV, k, JSON.stringify(g.ex));
if (args.out) fs.writeFileSync(args.out, JSON.stringify(res, null, 1));

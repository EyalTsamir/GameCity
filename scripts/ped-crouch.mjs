#!/usr/bin/env node
// Crouch probe: runs the city (sim at --speed) at several views and records, for every posed figure that is
// upright (not sitting / lying / riding), the pelvis drop below its standing height and the stance knee bend.
// Reports a histogram and the worst cases with party state, persona, speeds — a crouch at walking speed is a bug.
//   node scripts/ped-crouch.mjs [--views downtown,park,oldtown] [--seconds 25] [--speed 1] [--drop 0.08] [--hours 11] [--q extra]
import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const views = (args.views ?? 'downtown,park,oldtown').split(',');
const seconds = parseFloat(args.seconds ?? '25'), speed = parseFloat(args.speed ?? '1'), dropT = parseFloat(args.drop ?? '0.08');
let url = (args.url ?? 'http://127.0.0.1:5173/') + '?nointro&noidle&skip=traffic,rail,boats,audio&time=' + (args.hours ?? '11') + (args.q ? '&' + args.q : '');
await acquireLock();
const { browser } = await launchBrowser({});
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  await page.routeWebSocket(/.*/, () => {});
  page.on('pageerror', (e) => console.error('pageerror', String(e)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 3, null, { timeout: 300000 });
  await page.evaluate(([dropT]) => {
    const c = window.__city;
    const R = c.ctx.services.pedestrians._renderer;
    const S = (window.__crouch = { n: 0, hist: new Array(20).fill(0), worst: [], frames: 0 });
    R.probe = (m, o, r, lv) => {
      if (m.sit > 0.05 || m.lie > 0.05 || m.ground > 0.05 || m.rideG !== null || m.fade < 0.5) return;
      const drop = -o.rootY / r.s; // pelvis below the rig's hip height, in rig-scale metres
      S.n++;
      S.hist[Math.max(0, Math.min(19, Math.floor(drop * 50)))]++;
      if (drop > dropT) {
        const p = m.party;
        const e = { drop: +drop.toFixed(3), kL: +o.kneeL.toFixed(2), kR: +o.kneeR.toFixed(2), sp: +m.speed.toFixed(2), vx: +Math.hypot(m.vx, m.vz).toFixed(2), pv: +(p.v ?? 0).toFixed(2), pspeed: +(p.speed ?? 0).toFixed(2),
          state: p.state, persona: p.persona, size: p.size, kind: m.look.kind, age: m.look.age, sit: +m.sit.toFixed(2), lv, x: +m.x.toFixed(1), z: +m.z.toFixed(1), fr: R.frame };
        if (S.worst.length < 400) S.worst.push(e);
      }
    };
  }, [dropT]);
  // --bench 1: the people-bench sequence (setHours after load, 2.5 s, pause) — what does the pause freeze?
  if (args.bench) {
    await page.evaluate((h) => window.__city.setHours(h), parseFloat(args.hours ?? '11'));
    await page.waitForTimeout(2500);
    const sp = await page.evaluate(() => {
      const c = window.__city; c.setSpeed(0);
      const out = { hist: new Array(12).fill(0), fast: [] };
      for (const p of c.ctx.services.pedestrians._crowd.parties) for (const m of p.members) {
        if (!m.present || m.sit > 0.05) continue;
        out.hist[Math.min(11, Math.floor(m.speed * 2))]++;
        if (m.speed > 1.95 && p.persona !== 'jogger' && out.fast.length < 30) out.fast.push({ sp: +m.speed.toFixed(2), pv: +(p.v ?? 0).toFixed(2), state: p.state, persona: p.persona, size: p.size, x: +m.x.toFixed(1), z: +m.z.toFixed(1) });
      }
      return out;
    });
    console.log('member speed at the pause (0.5 m/s bins):', sp.hist.join(' '));
    await page.evaluate(() => (window.__crouchPaused = true));
    console.log('non-joggers > 1.95 m/s (jog gait) at the pause:', sp.fast.length, JSON.stringify(sp.fast.slice(0, 12)));
  }
  for (const v of views) {
    await page.evaluate(([v, speed]) => { window.__city.view(v); if (!window.__crouchPaused) window.__city.setSpeed(speed); }, [v, speed]);
    await page.waitForTimeout(seconds * 1000);
  }
  const S = await page.evaluate(() => window.__crouch);
  console.log('posed upright figure-frames', S.n);
  console.log('pelvis drop histogram (2 cm bins):\n' + S.hist.map((n, i) => (n ? `${i * 2}-${i * 2 + 2} cm: ${n}` : null)).filter(Boolean).join('\n'));
  const by = {};
  for (const e of S.worst) { const k = `${e.state} ${e.persona} kind=${e.kind}`; (by[k] ??= []).push(e); }
  for (const [k, a] of Object.entries(by)) console.log(a.length, k, JSON.stringify(a.sort((x, y) => y.drop - x.drop)[0]));
} finally { await browser.close(); releaseLock(); }

#!/usr/bin/env node
// F2 quick captures in ONE page load (lean: no line-of-sight search, small viewport, few pumped frames).
//   node scripts/agent-tools/f2shot.mjs --out shots/f2/x --shots "car:0:4:60:8,bus:0:6:40:6,boat:sail:0:5:90:8,actor:band:0:4:0:8"
// spec = kind:[sub:]pick:dist:yawOffDeg:pitchDeg   kinds: car | bus (traffic vehicles, nearest the downtown POI first),
// boat:<type> (fleet), actor:<role> (pedestrians/actorDefs ACTORS). The sim is paused after the subject is found.
// --q extra url params, --w/--h viewport (default 960×540), --pump n frames before each capture (default 3).
import { launchBrowser, acquireLock, releaseLock } from '../browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const out = path.resolve(args.out ?? 'shots/f2/q');
fs.mkdirSync(out, { recursive: true });
const W = Number(args.w ?? 960), H = Number(args.h ?? 540), PUMP = Number(args.pump ?? 3);
const url = `http://127.0.0.1:5173/?nointro&noidle&adaptive=0&time=${args.time ?? 11}${args.q ? '&' + args.q : ''}`;
const shots = (args.shots ?? '').split(',').filter(Boolean);
const report = { url, consoleErrors: [], pageErrors: [], caps: [] };
await acquireLock();
const { browser } = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { report.consoleErrors.push(m.text()); console.log('CONSOLE', m.text().slice(0, 1500)); } });
  page.on('pageerror', (e) => report.pageErrors.push(String(e)));
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 500 });
  await page.addStyleTag({ content: '#ui{display:none!important}' });
  const pump = async (n) => { for (let i = 0; i < n; i++) await page.screenshot({ type: 'jpeg', quality: 1 }).catch(() => {}); };
  await pump(2);
  console.log('loaded', ((Date.now() - t0) / 1000).toFixed(0), 's');
  for (const spec of shots) {
    // 'ao0' / 'ao1' / 'dof0' / 'dof1': switch a post effect for the following shots
    const fx = /^(ao|dof)([01])$/.exec(spec);
    if (fx) { await page.evaluate(([e, on]) => window.__city.ctx.services.postfx?.setEnabled?.(e, on === '1'), [fx[1], fx[2]]); continue; }
    const res = await page.evaluate((spec) => {
      const c = window.__city, p = spec.split(':');
      const kind = p[0];
      const sub = kind === 'boat' || kind === 'actor' ? p[1] : '';
      const q = kind === 'boat' || kind === 'actor' ? p.slice(2) : p.slice(1);
      const [pick, dist, yo, pitch] = q.map(Number);
      let x, y = 0, z, yaw, h = 1.2;
      if (kind === 'car' || kind === 'bus') {
        const poi = c.ctx.plan.pois.find((o) => o.id === 'downtown') ?? { x: 0, z: 0 };
        const tx = poi.target?.x ?? poi.x ?? 0, tz = poi.target?.z ?? poi.z ?? 0;
        const vs = c.ctx.services.traffic.vehicles().filter((V) => !V.dead && !V.twoWheel && (kind === 'bus' ? V.isBus : !V.isBus && ['compact', 'hatch', 'sedan', 'estate', 'mpv', 'suv'].includes(V.spec.model)));
        vs.sort((a, b) => (a.x - tx) ** 2 + (a.z - tz) ** 2 - ((b.x - tx) ** 2 + (b.z - tz) ** 2));
        const V = vs[pick];
        if (!V) return null;
        x = V.x; z = V.z; yaw = V.yaw; h = kind === 'bus' ? 1.9 : 1.15;
        if (kind === 'bus') { x += Math.sin(V.yaw) * 3.5; z += Math.cos(V.yaw) * 3.5; }
      } else if (kind === 'boat') {
        const b = c.ctx.services.boats.fleet.boats.filter((b) => b.type === sub)[pick];
        if (!b) return null;
        x = b.x; z = b.z; yaw = b.yaw; y = 0; h = 1.2;
      } else {
        const a = (window.__actors ?? []).filter((a) => a.role === sub)[pick];
        if (!a) return null;
        x = a.x; y = a.y; z = a.z; yaw = a.yaw; h = a.child ? 0.8 : 1.2;
      }
      c.setSpeed(0);
      c.view({ target: { x, y: y + h, z }, distance: dist, yaw: (yaw * 180) / Math.PI + yo, pitch });
      return { x, y, z };
    }, spec);
    if (!res) { console.log('missing', spec); continue; }
    await pump(PUMP);
    const file = path.join(out, String(report.caps.length).padStart(2, '0') + '_' + spec.replace(/:/g, '_') + '.png');
    await page.screenshot({ path: file, timeout: 240000 });
    report.caps.push({ spec, file, ...res });
    console.log('shot', spec, ((Date.now() - t0) / 1000).toFixed(0), 's');
  }
  report.stats = await page.evaluate(() => window.__city.stats().modules?.pedestrians ?? null).catch(() => null);
  report.invariants = await page.evaluate(() => window.__city.invariants()).catch((e) => String(e));
} finally {
  await browser.close();
  releaseLock();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log('errors', report.consoleErrors.length, report.pageErrors.length, JSON.stringify(report.invariants)?.slice(0, 200));
}

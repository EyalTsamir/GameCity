#!/usr/bin/env node
// F1 judge captures in one page load: frontal views of chosen lots (by kind / shopfront, n-th instance).
//   node scripts/.f1/judge.mjs --out shots/f1s2/j1 --list "shop:0:6,shop:1:6,tower:0:8" [--q extra] [--hours 11]
// item = <kind|shop|towershop>:<pick>:<distance>[:<yawOff>[:<targetY>[:<along>]]]  (along = metres along the front from its centre)
import { launchBrowser, acquireLock, releaseLock } from '../browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const out = path.resolve(args.out ?? 'shots/f1s2/j');
fs.mkdirSync(out, { recursive: true });
const items = (args.list ?? '').split(',').filter(Boolean);
let url = 'http://127.0.0.1:5173/?nointro&noidle' + (args.q ? '&' + args.q : '');
await acquireLock();
const { browser } = await launchBrowser();
const log = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && log.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => log.push('pageerror: ' + String(e)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
  await page.addStyleTag({ content: '#ui{display:none!important}' });
  await page.evaluate((h) => { window.__city.setHours(h); window.__city.setSpeed?.(0); }, Number(args.hours ?? 11));
  for (const it of items) {
    const [kind, pick, dist, yawOff = '8', ty = '2.2', along = '0'] = it.split(':');
    const v = await page.evaluate(([kind, pick, dist, yawOff, ty, along]) => {
      const plan = window.__city.ctx.plan;
      const YAW = { N: 180, E: 90, S: 0, W: -90 }, VEC = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
      const lots = plan.lots.filter((l) => (kind === 'shop' ? l.shopfront && l.kind !== 'tower' && l.kind !== 'office' : kind === 'towershop' ? l.shopfront && (l.kind === 'tower' || l.kind === 'office') : l.kind === kind));
      const l = lots[Math.min(+pick, lots.length - 1)];
      if (!l) return null;
      const f = l.footprint, [vx, vz] = VEC[l.front];
      const tx = -vz, tz = vx; // along the front
      const x = (f.x0 + f.x1) / 2 + vx * (f.x1 - f.x0) / 2 + tx * +along, z = (f.z0 + f.z1) / 2 + vz * (f.z1 - f.z0) / 2 + tz * +along;
      window.__city.view({ target: { x, y: +ty, z }, distance: +dist, yaw: YAW[l.front] + +yawOff, pitch: 4 });
      return { id: l.id, kind: l.kind, name: l.name, x, z, front: l.front };
    }, [kind, pick, dist, yawOff, ty, along]);
    for (let i = 0; i < 4; i++) await page.screenshot({ type: 'jpeg', quality: 1, timeout: 240000 }).catch(() => {});
    await page.waitForTimeout(800);
    const file = path.join(out, it.replace(/[:.]/g, '_') + '.png');
    await page.screenshot({ path: file, timeout: 240000 });
    console.log(it, JSON.stringify(v), file);
  }
  const inv = await page.evaluate(() => JSON.stringify(window.__city.invariants?.() ?? {}));
  console.log('invariants', inv);
} finally {
  console.log('console:', JSON.stringify(log.slice(0, 10)));
  await browser.close();
  releaseLock();
}

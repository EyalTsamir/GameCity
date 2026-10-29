#!/usr/bin/env node
// Which materials make three re-derive their program every frame? (getProgram → getParameters + the cache-key string:
// CPU + garbage per draw, although the cached program is reused.) Counts customProgramCacheKey() calls per material
// over --seconds, per view.
//   node scripts/agent-tools/progprobe.mjs [--url http://127.0.0.1:5173/] [--views "overview;street=5,1.5,-65,9,0,6"]

import { launchBrowser, acquireLock, releaseLock } from '../browser.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const baseUrl = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const views = (args.views ?? 'overview;street=5,1.5,-65,9,0,6').split(';').map((s) => (s.includes('=') ? s.split('=') : [s, s]));
const seconds = parseFloat(args.seconds ?? '3');

await acquireLock();
const { browser } = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1025 } });
  await page.routeWebSocket(/.*/, () => {});
  await page.goto(`${baseUrl}?nointro&noidle&adaptive=0`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 3, null, { timeout: 300000 });
  for (const [name, spec] of views) {
    await page.evaluate((sp) => {
      if (/^[a-z]/i.test(sp)) window.__city.view(sp);
      else {
        const [x, y, z, distance, yaw, pitch] = sp.split(',').map(Number);
        window.__city.view({ target: { x, y, z }, distance, yaw, pitch });
      }
    }, spec);
    await page.waitForTimeout(2500);
    const res = await page.evaluate(async (sec) => {
      const counts = new Map();
      const wrapped = [];
      window.__city.ctx.scene.traverse((o) => {
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of ms) {
          if (m.__pp) continue;
          m.__pp = true;
          const orig = m.customProgramCacheKey;
          const label = `${m.name || m.type} (${o.name || o.type})`;
          m.customProgramCacheKey = function () {
            counts.set(label, (counts.get(label) ?? 0) + 1);
            return orig.call(this);
          };
          wrapped.push([m, orig]);
        }
      });
      const f0 = window.__city.frames();
      await new Promise((r) => setTimeout(r, sec * 1000));
      const frames = window.__city.frames() - f0;
      for (const [m, orig] of wrapped) {
        m.customProgramCacheKey = orig;
        delete m.__pp;
      }
      return { frames, rows: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 25) };
    }, seconds);
    console.log(`\n== ${name}: ${res.frames} frames`);
    for (const [l, n] of res.rows) console.log(`${(n / Math.max(1, res.frames)).toFixed(2).padStart(7)} / frame  ${l}`);
  }
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}

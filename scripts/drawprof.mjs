#!/usr/bin/env node
// Rank the main view's draw calls by GPU time (timer query around every draw). One page load, several views/hours.
//
//   node scripts/drawprof.mjs --views "overview;street=5,1.5,-65,9,0,6" --hours 12,21.5 [--q "..."] [--top 40]
//
// Per-draw queries serialise the GPU a little (sum ≈ 1.1–1.3x the plain scene pass), so read the ranking, not the sum.

import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import { installDrawProfiler, resetDraws, readDraws } from './framerec.mjs';
import fs from 'node:fs';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const baseUrl = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const width = parseInt(args.width ?? '1920', 10);
const height = parseInt(args.height ?? '1025', 10);
const seconds = parseFloat(args.seconds ?? '3');
const top = parseInt(args.top ?? '40', 10);
const hours = (args.hours ?? '12').split(',').map(Number);
const views = (args.views ?? 'overview')
  .split(';')
  .filter(Boolean)
  .map((s) => (s.includes('=') ? { name: s.slice(0, s.indexOf('=')), spec: s.slice(s.indexOf('=') + 1) } : { name: s, spec: s }));
const q = [args.q, 'adaptive=0', 'nointro', 'noidle'].filter(Boolean).join('&');

await acquireLock();
const out = { url: `${baseUrl}?${q}`, results: [] };
const { browser } = await launchBrowser({ extraArgs: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  await page.goto(out.url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 3, null, { timeout: 300000 });
  await installDrawProfiler(page);
  for (const h of hours)
    for (const v of views) {
      await page.evaluate(
        ([spec, hh]) => {
          window.__city.setHours(hh);
          if (/^[a-z]/i.test(spec)) window.__city.view(spec);
          else {
            const [x, y, z, distance, yaw, pitch] = spec.split(',').map(Number);
            window.__city.view({ target: { x, y, z }, distance, yaw, pitch });
          }
        },
        [v.spec, h],
      );
      await page.waitForTimeout(2500);
      await resetDraws(page);
      await page.waitForTimeout(seconds * 1000);
      const rows = await readDraws(page);
      const total = rows.reduce((a, r) => a + r.ms, 0);
      const st = await page.evaluate(() => window.__city.stats());
      out.results.push({ view: v.name, hours: h, totalMs: +total.toFixed(2), drawCalls: st.drawCalls, triangles: st.triangles, rows });
      console.log(`\n== ${v.name} @ ${h}h  sum of draws ${total.toFixed(2)} ms  (${st.drawCalls} dc, ${(st.triangles / 1e6).toFixed(2)} M tris)`);
      for (const r of rows.slice(0, top)) console.log(`${r.ms.toFixed(3).padStart(8)} ms  x${String(r.calls).padEnd(4)} ${String(r.tris).padStart(9)} tris  ${r.label}`);
    }
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 1));

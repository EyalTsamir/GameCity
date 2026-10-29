#!/usr/bin/env node
// Real GPU/CPU frame cost (uncapped rAF: vsync + frame-rate limit disabled), per variant.
//
//   node scripts/perf.mjs --view downtown --hours 12 --variants ";skip=buildings;skip=buildings,vegetation"
//   node scripts/perf.mjs --q "only=sky,roads" --view "0,0,-65,60,30,45" --variants ";quality=low"
//   node scripts/perf.mjs --url http://127.0.0.1:5174/ …   (another dev server, e.g. a baseline worktree)
//   node scripts/perf.mjs … --gpu 1     (+ per-pass GPU ms from timer queries: shadow / scene / refl / post / other,
//                                        measured in a second window after the frame time — the queries cost a little)
//   node scripts/perf.mjs … --repeat 2  (run the whole variant list n times, interleaved: A B C A B C)
//
// Each variant is a query-string fragment appended to --q (empty = baseline). For every variant the
// page is loaded fresh, the view/time applied, then ms/frame is measured over --seconds (default 2.5).
// The difference between variants is what a module/feature costs. Uses the shared screenshot lock.
// Note: other processes on the machine add noise — compare variants within ONE run, repeat if close.

import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import { installGpuProfiler, resetGpu, readGpu } from './framerec.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const base = args.q ?? '';
const baseUrl = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const variants = [];
for (let k = 0; k < parseInt(args.repeat ?? '1', 10); k++) variants.push(...(args.variants ?? '').split(';'));
// --views "overview;street=5,1.5,-65,9,0,6" measures several views (x every hour of --hours 12,21.5) in ONE page load
const views = (args.views ?? args.view ?? 'overview')
  .split(args.views ? ';' : '\u0000')
  .filter(Boolean)
  .map((s) => (args.views && s.includes('=') ? { name: s.slice(0, s.indexOf('=')), spec: s.slice(s.indexOf('=') + 1) } : { name: s, spec: s }));
const view = args.views ?? args.view ?? 'overview';
const hoursList = String(args.hours ?? '12').split(',').map(Number);
const hours = hoursList.length === 1 ? hoursList[0] : hoursList;
const width = parseInt(args.width ?? '1300', 10);
const height = parseInt(args.height ?? '930', 10);
const seconds = parseFloat(args.seconds ?? '2.5');
const dpr = parseFloat(args.dpr ?? '1');

await acquireLock();

const rows = [];
const { browser, software } = await launchBrowser({ extraArgs: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
if (software) console.error('perf: software GL (SwiftShader) — absolute numbers are meaningless, compare variants within this run only');
try {
  for (const v of variants) {
    const q = [base, v, 'adaptive=0', 'nointro', 'noidle'].filter(Boolean).join('&');
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
    await page.routeWebSocket(/.*/, () => {});
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));
    await page.goto(`${baseUrl}?${q}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 3, null, { timeout: 300000 });
    if (args.gpu === '1') await installGpuProfiler(page);
    for (const h of hoursList)
      for (const vw of views) {
        await page.evaluate(([spec, hh]) => {
          window.__city.setHours(hh);
          if (/^[a-z]/i.test(spec)) window.__city.view(spec);
          else {
            const [x, y, z, distance, yaw, pitch] = spec.split(',').map(Number);
            window.__city.view({ target: { x, y, z }, distance, yaw, pitch });
          }
        }, [vw.spec, h]);
        await page.waitForTimeout(3000);
        const r = await page.evaluate(async (sec) => {
          const f0 = window.__city.frames(),
            t0 = performance.now();
          await new Promise((res) => setTimeout(res, sec * 1000));
          const f1 = window.__city.frames(),
            t1 = performance.now();
          const st = window.__city.stats();
          return { msPerFrame: +((t1 - t0) / Math.max(1, f1 - f0)).toFixed(2), drawCalls: st.drawCalls, triangles: st.triangles, cpuFrameMs: st.frameMs };
        }, seconds);
        let gpu = {};
        if (args.gpu === '1') {
          await resetGpu(page);
          await page.waitForTimeout(seconds * 1000);
          const g = await readGpu(page);
          gpu = Object.fromEntries(Object.entries(g).filter(([k]) => k !== 'frames').map(([k, val]) => [`g_${k}`, val]));
        }
        const at = views.length > 1 || hoursList.length > 1 ? { at: `${vw.name}@${h}` } : {};
        rows.push({ variant: v || '(baseline)', ...at, ...r, fps: +(1000 / r.msPerFrame).toFixed(1), ...gpu, errors: errors.length });
      }
    await page.close();
  }
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
console.table(rows);
console.log(JSON.stringify({ base, view, hours, width, height, softwareGL: software, rows }));

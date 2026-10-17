#!/usr/bin/env node
// Real GPU/CPU frame cost (uncapped rAF: vsync + frame-rate limit disabled), per variant.
//
//   node scripts/perf.mjs --view downtown --hours 12 --variants ";skip=buildings;skip=buildings,vegetation"
//   node scripts/perf.mjs --q "only=sky,roads" --view "0,0,-65,60,30,45" --variants ";quality=low"
//
// Each variant is a query-string fragment appended to --q (empty = baseline). For every variant the
// page is loaded fresh, the view/time applied, then ms/frame is measured over --seconds (default 2.5).
// The difference between variants is what a module/feature costs. Uses the shared screenshot lock.
// Note: other processes on the machine add noise — compare variants within ONE run, repeat if close.

import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const base = args.q ?? '';
const variants = (args.variants ?? '').split(';');
const view = args.view ?? 'overview';
const hours = parseFloat(args.hours ?? '12');
const width = parseInt(args.width ?? '1300', 10);
const height = parseInt(args.height ?? '930', 10);
const seconds = parseFloat(args.seconds ?? '2.5');

const lockDir = path.join(here, '.shotlock');
for (const t0 = Date.now(); ; ) {
  try {
    fs.mkdirSync(lockDir);
    break;
  } catch {
    try {
      if (Date.now() - fs.statSync(lockDir).mtimeMs > 300_000) fs.rmSync(lockDir, { recursive: true, force: true });
    } catch {
      /* */
    }
    if (Date.now() - t0 > 900_000) throw new Error('lock timeout');
    await new Promise((r) => setTimeout(r, 500));
  }
}
const release = () => fs.rmSync(lockDir, { recursive: true, force: true });
process.on('exit', release);

const rows = [];
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
try {
  for (const v of variants) {
    const q = [base, v, 'adaptive=0'].filter(Boolean).join('&');
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.routeWebSocket(/.*/, () => {});
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));
    await page.goto(`http://127.0.0.1:5173/?${q}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 3, null, { timeout: 120000 });
    await page.evaluate(([spec, h]) => {
      window.__city.setHours(h);
      if (/^[a-z]/i.test(spec)) window.__city.view(spec);
      else {
        const [x, y, z, distance, yaw, pitch] = spec.split(',').map(Number);
        window.__city.view({ target: { x, y, z }, distance, yaw, pitch });
      }
    }, [view, hours]);
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
    rows.push({ variant: v || '(baseline)', ...r, fps: +(1000 / r.msPerFrame).toFixed(1), errors: errors.length });
    await page.close();
  }
} finally {
  await browser.close().catch(() => {});
  release();
}
console.table(rows);
console.log(JSON.stringify({ base, view, hours, width, height, rows }));

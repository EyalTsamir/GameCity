#!/usr/bin/env node
// Long-run stability test: runs the whole city for a while (optionally sped up), sampling
// fps, JS heap, module stats and invariant violations; reports trends (leaks, deadlocks, drift).
//
//   node scripts/soak.mjs [--minutes 4] [--speed 4] [--every 10] [--view overview] [--q "..."]

import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const minutes = parseFloat(args.minutes ?? '4');
const speed = parseFloat(args.speed ?? '4');
const every = parseFloat(args.every ?? '10');
let url = args.url ?? 'http://127.0.0.1:5173/';
if (args.q) url += (url.includes('?') ? '&' : '?') + args.q;

const lockDir = path.join(here, '.shotlock');
for (const t0 = Date.now(); ; ) {
  try {
    fs.mkdirSync(lockDir);
    break;
  } catch {
    if (Date.now() - t0 > 900_000) throw new Error('lock timeout');
    await new Promise((r) => setTimeout(r, 500));
  }
}
const release = () => fs.rmSync(lockDir, { recursive: true, force: true });
process.on('exit', release);

const out = { url, minutes, speed, samples: [], consoleErrors: [], pageErrors: [], invariantHits: {} };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--enable-precise-memory-info'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // Freeze the page against other agents' file edits: swallow Vite's HMR websocket so no mid-run reloads happen.
  await page.routeWebSocket(/.*/, () => {});
  page.on('console', (m) => m.type() === 'error' && out.consoleErrors.push(m.text()));
  page.on('pageerror', (e) => out.pageErrors.push(String(e)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 3, null, { timeout: 120000 });
  out.failedModules = await page.evaluate(() => window.__city.failed.map((f) => f.name));
  await page.evaluate(([s, v]) => {
    window.__city.setSpeed(s);
    if (v) window.__city.view(v);
  }, [speed, args.view ?? 'overview']);
  const n = Math.max(1, Math.round((minutes * 60) / every));
  for (let i = 0; i < n; i++) {
    await page.waitForTimeout(every * 1000);
    const s = await page.evaluate(() => {
      const st = window.__city.stats();
      const inv = window.__city.invariants();
      const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1;
      return { st, inv, mem };
    });
    const brief = { t: Math.round((i + 1) * every), fps: s.st.fps, heapMB: s.mem, time: s.st.time, geo: s.st.geometries, tex: s.st.textures };
    for (const [k, v] of Object.entries(s.st)) if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'moduleMs' && k !== 'intersections') brief[k] = v;
    brief.invariantCount = Object.values(s.inv).reduce((a, b) => a + b.length, 0);
    for (const [k, v] of Object.entries(s.inv)) {
      out.invariantHits[k] ??= [];
      for (const msg of v) if (out.invariantHits[k].length < 30) out.invariantHits[k].push(`t=${brief.t}s ${msg}`);
    }
    out.samples.push(brief);
    process.stderr.write(`t=${brief.t}s fps=${brief.fps} heap=${brief.heapMB}MB inv=${brief.invariantCount} ${brief.time}\n`);
  }
  out.frameErrors = await page.evaluate(() => window.__city.frameErrors);
  out.intersections = await page.evaluate(() => window.__city.stats().intersections);
} catch (e) {
  out.harnessError = String(e?.stack ?? e);
} finally {
  await browser.close().catch(() => {});
  release();
}
console.log(JSON.stringify(out, null, 2));

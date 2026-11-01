#!/usr/bin/env node
// Long-run stability test: runs the whole city for a while (optionally sped up), sampling
// fps, JS heap, module stats and invariant violations; reports trends (leaks, deadlocks, drift).
//
//   node scripts/soak.mjs [--minutes 4] [--speed 4] [--every 10] [--view overview] [--q "..."] [--width 1920 --height 1025]
// Every sample window also reports the frame intervals as seen with vsync (framerec.mjs): mean / p99 / max ms,
// jank (> 25 ms), hitch (> 50 ms), freeze (> 100 ms), GC drops, JS allocation rate, long tasks, new shader programs.

import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import { installRecorder, recMark, readFrames, frameStats } from './framerec.mjs';
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

await acquireLock();

const out = { url, minutes, speed, samples: [], consoleErrors: [], pageErrors: [], invariantHits: {} };
const { browser, software } = await launchBrowser({ extraArgs: ['--enable-precise-memory-info'] });
out.softwareGL = software;
try {
  const page = await browser.newPage({ viewport: { width: parseInt(args.width ?? '1920', 10), height: parseInt(args.height ?? '1025', 10) } });
  await installRecorder(page);
  // Freeze the page against other agents' file edits: swallow Vite's HMR websocket so no mid-run reloads happen.
  await page.routeWebSocket(/.*/, () => {});
  page.on('console', (m) => m.type() === 'error' && out.consoleErrors.push(m.text()));
  page.on('pageerror', (e) => out.pageErrors.push(String(e)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 3, null, { timeout: 300000 });
  out.failedModules = await page.evaluate(() => window.__city.failed.map((f) => f.name));
  await page.evaluate(([s, v]) => {
    window.__city.setSpeed(s);
    if (v) window.__city.view(v);
  }, [speed, args.view ?? 'overview']);
  const n = Math.max(1, Math.round((minutes * 60) / every));
  let mark = await recMark(page);
  let progs = (await readFrames(page, mark)).programs;
  out.total = { frames: 0, jank25: 0, outliers: 0, hitch50: 0, freeze100: 0, gcDrops: 0, longTasks: 0, newPrograms: 0, max: 0 };
  for (let i = 0; i < n; i++) {
    await page.waitForTimeout(every * 1000);
    const sl = await readFrames(page, mark);
    mark = await recMark(page);
    const fs_ = frameStats(sl);
    const frame = { ...fs_, newPrograms: sl.programs - progs };
    progs = sl.programs;
    for (const k of Object.keys(out.total)) out.total[k] = k === 'max' ? Math.max(out.total[k], frame[k]) : out.total[k] + frame[k];
    const s = await page.evaluate(() => {
      const st = window.__city.stats();
      const inv = window.__city.invariants();
      const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1;
      return { st, inv, mem };
    });
    const { worst, ...fbrief } = frame;
    const brief = { t: Math.round((i + 1) * every), fps: s.st.fps, heapMB: s.mem, time: s.st.time, geo: s.st.geometries, tex: s.st.textures, frame: fbrief, worst, step: s.st.postfx?.step };
    for (const [k, v] of Object.entries(s.st)) if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'moduleMs' && k !== 'intersections') brief[k] = v;
    brief.invariantCount = Object.values(s.inv).reduce((a, b) => a + b.length, 0);
    for (const [k, v] of Object.entries(s.inv)) {
      out.invariantHits[k] ??= [];
      for (const msg of v) if (out.invariantHits[k].length < 30) out.invariantHits[k].push(`t=${brief.t}s ${msg}`);
    }
    out.samples.push(brief);
    process.stderr.write(
      `t=${brief.t}s fps=${brief.fps} heap=${brief.heapMB}MB inv=${brief.invariantCount} ${brief.time} | mean ${frame.meanMs} p99 ${frame.p99} max ${frame.max} ` +
        `jank ${frame.jank25} out ${frame.outliers} hitch ${frame.hitch50} freeze ${frame.freeze100} gc ${frame.gcDrops} alloc ${frame.allocMBs}MB/s lt ${frame.longTasks}/${frame.longTaskMax}ms prog+${frame.newPrograms} ${brief.step ?? ''}\n`,
    );
  }
  out.frameErrors = await page.evaluate(() => window.__city.frameErrors);
  out.intersections = await page.evaluate(() => window.__city.stats().intersections);
} catch (e) {
  out.harnessError = String(e?.stack ?? e);
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
console.log(JSON.stringify(out, null, 2));

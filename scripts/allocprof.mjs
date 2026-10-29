#!/usr/bin/env node
// Who allocates per frame? Chrome's sampling heap profiler (garbage included) over a steady window, aggregated by
// function + source line; optionally a CPU profile of the same window (self time per function).
//
//   node scripts/allocprof.mjs --view street=5,1.5,-65,9,0,6 --hours 12 [--seconds 8] [--speed 1] [--cpu 1] [--top 30]
//
// Uses the shared lock; vsync on (what a viewer runs). MB/s are of the sampled window.

import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import fs from 'node:fs';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const baseUrl = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const seconds = parseFloat(args.seconds ?? '8');
const top = parseInt(args.top ?? '30', 10);
const viewArg = args.view ?? 'overview';
const [vname, vspec] = viewArg.includes('=') ? viewArg.split('=') : [viewArg, viewArg];
const q = [args.q, 'nointro', 'noidle', args.speed ? `speed=${args.speed}` : ''].filter(Boolean).join('&');

await acquireLock();
const out = { url: `${baseUrl}?${q}`, view: vname };
const { browser } = await launchBrowser({ extraArgs: ['--enable-precise-memory-info'] });
try {
  const page = await browser.newPage({ viewport: { width: parseInt(args.width ?? '1920', 10), height: parseInt(args.height ?? '1025', 10) } });
  await page.routeWebSocket(/.*/, () => {});
  await page.goto(out.url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 3, null, { timeout: 300000 });
  await page.evaluate(
    ([spec, h]) => {
      window.__city.setHours(h);
      if (/^[a-z]/i.test(spec)) window.__city.view(spec);
      else {
        const [x, y, z, distance, yaw, pitch] = spec.split(',').map(Number);
        window.__city.view({ target: { x, y, z }, distance, yaw, pitch });
      }
    },
    [vspec, parseFloat(args.hours ?? '12')],
  );
  await page.waitForTimeout(4000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  if (args.cpu === '1') {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
  }
  const f0 = await page.evaluate(() => window.__city.frames());
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await page.waitForTimeout(seconds * 1000);
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  const frames = (await page.evaluate(() => window.__city.frames())) - f0;
  const rows = new Map();
  let total = 0;
  const walk = (n, stack) => {
    const cf = n.callFrame;
    const site = `${cf.functionName || '(anon)'} ${String(cf.url).replace(/^.*\/src\//, 'src/').replace(/\?.*$/, '')}:${cf.lineNumber + 1}`;
    if (n.selfSize > 0) {
      total += n.selfSize;
      const r = rows.get(site) ?? { bytes: 0, caller: stack[stack.length - 1] ?? '' };
      r.bytes += n.selfSize;
      rows.set(site, r);
    }
    for (const c of n.children) walk(c, [...stack, site]);
  };
  walk(profile.head, []);
  out.frames = frames;
  out.totalMBs = +(total / 1048576 / seconds).toFixed(2);
  out.kbPerFrame = +(total / 1024 / Math.max(1, frames)).toFixed(1);
  out.alloc = [...rows].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, top).map(([site, r]) => ({ kbPerFrame: +(r.bytes / 1024 / Math.max(1, frames)).toFixed(1), site, caller: r.caller }));
  if (args.cpu === '1') {
    const { profile: cp } = await cdp.send('Profiler.stop');
    const self = new Map();
    const byId = new Map(cp.nodes.map((n) => [n.id, n]));
    const dt = cp.timeDeltas;
    for (let i = 0; i < cp.samples.length; i++) {
      const n = byId.get(cp.samples[i]);
      const cf = n.callFrame;
      const site = `${cf.functionName || '(anon)'} ${String(cf.url).replace(/^.*\/src\//, 'src/').replace(/\?.*$/, '')}:${cf.lineNumber + 1}`;
      self.set(site, (self.get(site) ?? 0) + (dt[i] ?? 0));
    }
    out.cpu = [...self].sort((a, b) => b[1] - a[1]).slice(0, top).map(([site, us]) => ({ msPerFrame: +(us / 1000 / Math.max(1, frames)).toFixed(3), site }));
  }
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 1));
console.log(`${out.view}: ${out.totalMBs} MB/s, ${out.kbPerFrame} kB/frame over ${out.frames} frames`);
for (const r of out.alloc ?? []) console.log(`${String(r.kbPerFrame).padStart(8)} kB/f  ${r.site}   <- ${r.caller}`);
if (out.cpu) {
  console.log('\nCPU self time:');
  for (const r of out.cpu) console.log(`${String(r.msPerFrame).padStart(8)} ms/f  ${r.site}`);
}

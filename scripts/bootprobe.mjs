#!/usr/bin/env node
// Boot timeline: time to the first frame, the [boot] lines of ?debug (per-module build ms, warm-up ms, programs),
// and the long tasks of the first seconds — per variant (fresh browser profile each, i.e. no shader cache).
//
//   node scripts/bootprobe.mjs [--url http://127.0.0.1:5173/] [--variants ";nowarmup"] [--after 8]

import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import { installRecorder, recMark, readFrames, frameStats } from './framerec.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const baseUrl = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const variants = (args.variants ?? '').split(';');
const after = parseFloat(args.after ?? '8');

await acquireLock();
const rows = [];
try {
  for (const v of variants) {
    const { browser } = await launchBrowser({ extraArgs: ['--enable-precise-memory-info'] });
    try {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1025 } });
      await page.routeWebSocket(/.*/, () => {});
      const lines = [];
      page.on('console', (m) => /\[boot\]/.test(m.text()) && lines.push(m.text().slice(0, 140)));
      await installRecorder(page);
      const t0 = Date.now();
      await page.goto(`${baseUrl}?${['debug', 'noidle', v].filter(Boolean).join('&')}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
      await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 1, null, { timeout: 300000, polling: 50 });
      const readyS = (Date.now() - t0) / 1000;
      const m = await recMark(page);
      await page.waitForTimeout(after * 1000);
      const st = frameStats(await readFrames(page, m));
      const programs = await page.evaluate(() => window.__city.ctx.renderer.info.programs?.length ?? 0);
      rows.push({ variant: v || '(default)', readyS, programs, firstSeconds: { max: st.max, freeze100: st.freeze100, longTaskMax: st.longTaskMax }, boot: lines });
    } finally {
      await browser.close().catch(() => {});
    }
  }
} finally {
  releaseLock();
}
for (const r of rows) {
  console.log(`\n== ${r.variant}: first frame after ${r.readyS.toFixed(1)} s, ${r.programs} programs; next ${after} s: max frame ${r.firstSeconds.max} ms, long task ${r.firstSeconds.longTaskMax} ms`);
  for (const l of r.boot) console.log('  ' + l);
}

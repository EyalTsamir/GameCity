#!/usr/bin/env node
// Per-program compile + link time on this GPU (fresh profile = no shader cache): wraps linkProgram and polls
// KHR_parallel_shader_compile's COMPLETION_STATUS for every program; names come from three's SHADER_NAME define
// (+ the fragment source length, which tells the custom materials apart).
//   node scripts/agent-tools/compileprobe.mjs [--url http://127.0.0.1:5173/] [--top 25]

import { launchBrowser, acquireLock, releaseLock } from '../browser.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const baseUrl = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const top = parseInt(args.top ?? '25', 10);

await acquireLock();
const { browser } = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1025 } });
  await page.routeWebSocket(/.*/, () => {});
  await page.addInitScript(() => {
    const P = (window.__cp = { list: [] });
    const proto = WebGL2RenderingContext.prototype;
    const src = new WeakMap(),
      att = new WeakMap();
    const ss = proto.shaderSource;
    proto.shaderSource = function (sh, s) {
      src.set(sh, s);
      return ss.call(this, sh, s);
    };
    const at = proto.attachShader;
    proto.attachShader = function (pr, sh) {
      (att.get(pr) ?? att.set(pr, []).get(pr)).push(sh);
      return at.call(this, pr, sh);
    };
    const lp = proto.linkProgram;
    proto.linkProgram = function (pr) {
      const sh = att.get(pr) ?? [];
      const texts = sh.map((x) => src.get(x) ?? '');
      const name = (texts.join('\n').match(/#define SHADER_NAME (\S+)/) ?? [])[1] ?? '?';
      const fragLen = Math.max(...texts.map((t) => t.length), 0);
      const e = { name, fragLen, t0: performance.now(), t1: 0, gl: this, pr };
      P.list.push(e);
      return lp.call(this, pr);
    };
    setInterval(() => {
      for (const e of P.list) {
        if (e.t1) continue;
        const ext = e.gl.getExtension('KHR_parallel_shader_compile');
        if (!ext || e.gl.getProgramParameter(e.pr, ext.COMPLETION_STATUS_KHR)) e.t1 = performance.now();
      }
    }, 15);
  });
  const t0 = Date.now();
  await page.goto(`${baseUrl}?nointro&noidle`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 1, null, { timeout: 300000 });
  await page.waitForTimeout(3000);
  const rows = await page.evaluate(() => window.__cp.list.map((e) => ({ name: e.name, kb: Math.round(e.fragLen / 1024), ms: Math.round((e.t1 || performance.now()) - e.t0), start: Math.round(e.t0) })));
  rows.sort((a, b) => b.ms - a.ms);
  const sum = rows.reduce((a, r) => a + r.ms, 0);
  console.log(`first frame after ${((Date.now() - t0) / 1000).toFixed(1)} s; ${rows.length} programs; sum of compile times ${(sum / 1000).toFixed(1)} s`);
  for (const r of rows.slice(0, top)) console.log(`${String(r.ms).padStart(7)} ms  ${String(r.kb).padStart(4)} kB  ${r.name}  (started at ${(r.start / 1000).toFixed(1)} s)`);
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}

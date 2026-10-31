#!/usr/bin/env node
// Bake: run the city's own shaders once in the real browser and store the results as files the page loads
// (docs/progress/bake.md). Everything still comes from this repository's code; no external asset goes in.
//
//   node scripts/bake.mjs [--url http://127.0.0.1:5173/] [--only land0,land1] [--out public/bake]
//
// Needs the dev server (or --url of any server of this source tree) and Chrome (scripts/browser.mjs). Writes
// <out>/<name>.bct.gz (BC1 + mips: scripts/bc1.mjs) and <out>/manifest.json. The page finds them through src/core/bakeFiles.ts.

import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import { encodeBCT } from './bc1.mjs';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const baseUrl = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const outDir = path.resolve(args.out ?? path.join(here, '..', 'public', 'bake'));
const only = (args.only ?? '').split(',').filter(Boolean);
fs.mkdirSync(outDir, { recursive: true });

/** one bake job: page code for an RGBA8 render target, page code for the fingerprint of its inputs */
const JOBS = {
  land0: { rt: `__city.ctx.services.landscape.renderBake(0)`, key: `__city.ctx.services.landscape.bakeKey()` },
  land1: { rt: `__city.ctx.services.landscape.renderBake(1)`, key: `__city.ctx.services.landscape.bakeKey()` },
};

/** texels nothing was drawn on (alpha 0) take their nearest neighbour's colour, so that no filter or mip sees black */
function fillHoles(rgba, w, h) {
  const sweep = (y0, y1, dy, x0, x1, dx) => {
    for (let y = y0; y !== y1; y += dy)
      for (let x = x0; x !== x1; x += dx) {
        const o = (y * w + x) * 4;
        if (rgba[o + 3]) continue;
        const a = x - dx >= 0 && x - dx < w ? (y * w + x - dx) * 4 : -1,
          b = y - dy >= 0 && y - dy < h ? ((y - dy) * w + x) * 4 : -1;
        const from = a >= 0 && rgba[a + 3] ? a : b >= 0 && rgba[b + 3] ? b : -1;
        if (from < 0) continue;
        rgba[o] = rgba[from];
        rgba[o + 1] = rgba[from + 1];
        rgba[o + 2] = rgba[from + 2];
        rgba[o + 3] = 255;
      }
  };
  sweep(0, h, 1, 0, w, 1);
  sweep(h - 1, -1, -1, w - 1, -1, -1);
}

const manifestPath = path.join(outDir, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { files: {} };

await acquireLock();
const { browser } = await launchBrowser({});
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${baseUrl}?nobake&quality=high&adaptive=0&nointro&noidle&skip=ui,audio,traffic,pedestrians,boats,rail,scenes`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__city?.ready, null, { timeout: 600000 });
  for (const [name, job] of Object.entries(JOBS)) {
    if (only.length && !only.includes(name)) continue;
    const t0 = Date.now();
    const meta = await page.evaluate((c) => {
      const rt = (0, eval)(c);
      window.__bakeRT = rt;
      window.__bakeBuf = new Uint8Array(rt.width * rt.height * 4);
      __city.ctx.renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, window.__bakeBuf);
      return { w: rt.width, h: rt.height };
    }, job.rt);
    const key = await page.evaluate((c) => (0, eval)(c), job.key);
    const rgba = Buffer.alloc(meta.w * meta.h * 4);
    const CHUNK = 1 << 24;
    for (let o = 0; o < rgba.length; o += CHUNK) {
      const s = await page.evaluate(([a, n]) => {
        const b = window.__bakeBuf.subarray(a, a + n);
        let out = '';
        for (let i = 0; i < b.length; i += 32768) out += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
        return btoa(out);
      }, [o, Math.min(CHUNK, rgba.length - o)]);
      Buffer.from(s, 'base64').copy(rgba, o);
    }
    await page.evaluate(() => {
      window.__bakeRT.dispose();
      window.__bakeBuf = null;
    });
    const t1 = Date.now();
    fillHoles(rgba, meta.w, meta.h);
    const bct = encodeBCT(rgba, meta.w, meta.h);
    const gz = zlib.gzipSync(bct, { level: 9 });
    const file = `${name}.bct.gz`;
    fs.writeFileSync(path.join(outDir, file), gz);
    manifest.files[name] = { file, bytes: gz.length, key };
    console.log(`${name}: ${meta.w}x${meta.h}, gpu + readback ${((t1 - t0) / 1000).toFixed(1)} s, encode ${((Date.now() - t1) / 1000).toFixed(1)} s, ${(bct.length / 1e6).toFixed(1)} MB → ${(gz.length / 1e6).toFixed(1)} MB gzip`);
  }
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));

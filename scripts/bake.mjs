#!/usr/bin/env node
// Bake: run the city's own shaders once in the real browser and store the results as files the page loads
// (docs/progress/baking.md). Everything still comes from this repository's code; no external asset goes in.
//
//   npm run bake                      everything whose inputs changed (about a minute)
//   node scripts/bake.mjs [--url http://127.0.0.1:5210/] [--only fac0,fac1,fac2] [--force 1] [--out public/bake]
//
// Starts its own dev server unless --url names one of this source tree; needs Chrome (scripts/browser.mjs). Writes
// <out>/<name>.bct.gz (BC1 + mips: scripts/bc1.mjs), <out>/<name>.bin.gz and <out>/manifest.json, with the fingerprint of what
// each was made from. The page finds them through src/core/bakeFiles.ts and ignores a file whose fingerprint isn't its own.

import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import { encodeBCT } from './bc1.mjs';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
let baseUrl = args.url;
let server = null;
if (!baseUrl) {
  // our own dev server, on a port of its own
  baseUrl = 'http://127.0.0.1:5198/';
  server = spawn(process.execPath, [path.join(here, '..', 'node_modules', 'vite', 'bin', 'vite.js'), '--port', '5198', '--strictPort', '--host', '127.0.0.1'], { cwd: path.join(here, '..'), stdio: 'ignore' });
  for (let i = 0; ; i++) {
    const up = await fetch(baseUrl).then((r) => r.ok).catch(() => false);
    if (up) break;
    if (i > 120) throw new Error('the dev server did not start');
    await new Promise((done) => setTimeout(done, 500));
  }
}
baseUrl = baseUrl.replace(/\/?$/, '/');
const outDir = path.resolve(args.out ?? path.join(here, '..', 'public', 'bake'));
const only = (args.only ?? '').split(',').filter(Boolean);
fs.mkdirSync(outDir, { recursive: true });

/** one bake job: page code for an RGBA8 render target (or for base64 bytes), page code for the fingerprint of its inputs */
const JOBS = {
  // (off: src/render/pvs.ts. Only with --only pvs, some minutes)
  pvs: { bytes: `__city.ctx.services.pvs.bake()`, key: `__city.ctx.services.pvs.key()`, optIn: true },
  land0: { rt: `__city.ctx.services.landscape.renderBake(0)`, key: `__city.ctx.services.landscape.bakeKey()` },
  land1: { rt: `__city.ctx.services.landscape.renderBake(1)`, key: `__city.ctx.services.landscape.bakeKey()` },
  fac0: { rt: `__city.ctx.services.buildings.renderFarBake(0)`, key: `__city.ctx.services.buildings.farBakeKey()`, sharp: 0.35 },
  fac1: { rt: `__city.ctx.services.buildings.renderFarBake(1)`, key: `__city.ctx.services.buildings.farBakeKey()`, sharp: 0 },
  fac2: { rt: `__city.ctx.services.buildings.renderFarBake(2)`, key: `__city.ctx.services.buildings.farBakeKey()`, sharp: 0, linear: true },
};

/** texels nothing was drawn on (alpha 0) take the colour of the nearest drawn one, so that no filter or mip sees a seam */
function fillHoles(rgba, w, h) {
  const dist = new Uint16Array(w * h);
  for (let i = 0; i < w * h; i++) dist[i] = rgba[i * 4 + 3] ? 0 : 65535;
  const take = (i, j) => {
    if (dist[j] + 1 < dist[i]) {
      dist[i] = dist[j] + 1;
      rgba[i * 4] = rgba[j * 4];
      rgba[i * 4 + 1] = rgba[j * 4 + 1];
      rgba[i * 4 + 2] = rgba[j * 4 + 2];
    }
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) take(i, i - 1);
      if (y > 0) take(i, i - w);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x < w - 1) take(i, i + 1);
      if (y < h - 1) take(i, i + w);
    }
  for (let i = 0; i < w * h; i++) rgba[i * 4 + 3] = 255;
}

const manifestPath = path.join(outDir, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { files: {} };
/** the fingerprint is in the name: a browser's or a host's cache can never pair a new manifest with an old file */
function store(name, file, data, key) {
  const old = manifest.files[name]?.file;
  if (old && old !== file) fs.rmSync(path.join(outDir, old), { force: true });
  fs.writeFileSync(path.join(outDir, file), data);
  manifest.files[name] = { file, bytes: data.length, key };
}

await acquireLock();
const { browser } = await launchBrowser({});
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${baseUrl}?nobake&pvs&quality=high&adaptive=0&nointro&noidle&skip=ui,audio`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__city?.ready, null, { timeout: 600000 });
  for (const [name, job] of Object.entries(JOBS)) {
    if (only.length ? !only.includes(name) : job.optIn) continue;
    const t0 = Date.now();
    const have = manifest.files[name];
    if (!args.force && have && fs.existsSync(path.join(outDir, have.file)) && have.key === (await page.evaluate((c) => (0, eval)(c), job.key))) {
      console.log(`${name}: up to date`);
      continue;
    }
    if (job.bytes) {
      const b64 = await page.evaluate((c) => (0, eval)(c), job.bytes);
      const raw = Buffer.from(b64, 'base64');
      const key = await page.evaluate((c) => (0, eval)(c), job.key);
      const gz = zlib.gzipSync(raw, { level: 9 });
      const file = `${name}-${key}.bin.gz`;
      store(name, file, gz, key);
      console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s, ${raw.length} bytes → ${gz.length} gzip`);
      continue;
    }
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
    if (args.raw) fs.writeFileSync(path.join(args.raw, `${name}.rgba`), rgba);
    const bct = encodeBCT(rgba, meta.w, meta.h, !!job.linear, job.sharp ?? parseFloat(args.sharp ?? '0.8'));
    const gz = zlib.gzipSync(bct, { level: 9 });
    const file = `${name}-${key}.bct.gz`;
    store(name, file, gz, key);
    console.log(`${name}: ${meta.w}x${meta.h}, gpu + readback ${((t1 - t0) / 1000).toFixed(1)} s, encode ${((Date.now() - t1) / 1000).toFixed(1)} s, ${(bct.length / 1e6).toFixed(1)} MB → ${(gz.length / 1e6).toFixed(1)} MB gzip`);
  }
} finally {
  await browser.close().catch(() => {});
  releaseLock();
  server?.kill();
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));

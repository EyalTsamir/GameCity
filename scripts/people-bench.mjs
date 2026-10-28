#!/usr/bin/env node
// People close-up bench (W4): one page load, sim paused, N standing figures; per figure a face shot
// (~0.8 m), a hands shot and a full-body shot (~2.6 m), plus one 10 m group view. Writes PNGs + sheet.png.
//   node scripts/people-bench.mjs [--n 4] [--skip 0] [--out shots/w4/pb] [--q "extra"] [--hours 11]
//                                 [--shots face,hand,body] [--width 960 --height 720] [--url …]
// The bench.mjs pedestrian class frames from ≥ 3 m; this one is for faces, hands and fabric.

import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i];
}
const outDir = path.resolve(root, args.out ?? 'shots/w4/pb');
fs.mkdirSync(outDir, { recursive: true });
const width = parseInt(args.width ?? '960', 10);
const height = parseInt(args.height ?? '720', 10);
const n = parseInt(args.n ?? '4', 10);
const skip = parseInt(args.skip ?? '0', 10);
const hours = parseFloat(args.hours ?? '11');
const shots = (args.shots ?? 'face,hand,body').split(',');
// --persona jogger: only that persona's parties; --lods close,near: each shot once per forced level (same figure, same frame) — '' = by distance
const lods = (args.lods ?? '').split(',');
let url = args.url ?? 'http://127.0.0.1:5173/';
url += (url.includes('?') ? '&' : '?') + 'nointro&noidle' + (args.q ? '&' + args.q : '');

const report = { url, consoleErrors: [], pageErrors: [], captures: [] };
const t0 = Date.now();
await acquireLock();
const { browser } = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  page.on('console', (m) => m.type() === 'error' && report.consoleErrors.push(m.text()));
  page.on('pageerror', (e) => report.pageErrors.push(String(e?.stack ?? e)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
  await page.addStyleTag({ content: '#ui{display:none!important}' });
  report.failedModules = await page.evaluate(() => window.__city.failed);
  await page.evaluate((h) => window.__city.setHours(h), hours);
  await page.waitForTimeout(2500);
  // standing / slowly walking adults and children on open ground, spread over the crowd
  const figs = await page.evaluate(
    ([n, skip, persona]) => {
      const c = window.__city;
      c.setSpeed(0);
      const crowd = c.ctx.services.pedestrians._crowd;
      const all = [];
      for (const p of crowd.parties) {
        if (p.state === 'gone' || (persona && p.persona !== persona)) continue;
        for (const m of p.members) if (m.present && m.fade > 0.99 && m.sit < 0.05 && m.lie < 0.05 && m.rideG === null && !m.look.pram) all.push(m);
      }
      all.sort((a, b) => Math.hypot(a.x, a.z + 40) - Math.hypot(b.x, b.z + 40));
      const out = [];
      const step = Math.max(1, Math.floor(all.length / (n * 3)));
      for (let i = skip * step; i < all.length && out.length < n; i += step) {
        const m = all[i];
        const L = m.look;
        const H = L.kind === 'boy' || L.kind === 'girl' ? 1.25 : L.kind === 'woman' ? 1.64 : 1.76;
        out.push({ x: m.x, y: m.y, z: m.z, yaw: (m.yaw * 180) / Math.PI, H: H * (L.scale ?? 1) * (L.age < 13 ? 1 : 1), kind: L.kind, age: L.age });
      }
      return out;
    },
    [n, skip, args.persona ?? ''],
  );
  const SH = {
    face: { ty: 0.925, d: 0.75, dy: 18, pitch: 2 },
    hand: { ty: 0.47, d: 0.85, dy: 55, pitch: 10 },
    body: { ty: 0.52, d: 2.6, dy: 22, pitch: 5 },
    back: { ty: 0.52, d: 2.6, dy: 170, pitch: 5 },
  };
  for (let i = 0; i < figs.length; i++) {
    const f = figs[i];
    for (const s of shots) {
      const o = SH[s];
      // the free camera stops at 3 m: closer shots keep 3 m and narrow the field of view instead (the
      // crowd's LOD distances scale with the fov, so the figure gets the level its screen size asks for)
      await page.evaluate(([f, o]) => {
        const c = window.__city, cam = c.ctx.camera;
        if (!cam.__fov0) {
          cam.__fov0 = cam.fov;
          let v = cam.fov;
          Object.defineProperty(cam, 'fov', { get: () => (cam.__zoom ? 2 * Math.atan(Math.tan((v * Math.PI) / 360) * cam.__zoom) * 180 / Math.PI : v), set: (x) => (v = x), configurable: true });
        }
        cam.__zoom = o.d < 3 ? o.d / 3 : 0;
        c.view({ target: { x: f.x, y: f.y + f.H * o.ty, z: f.z }, distance: Math.max(3, o.d), yaw: f.yaw + o.dy, pitch: o.pitch });
        cam.updateProjectionMatrix();
      }, [f, o]);
      for (const lod of lods) {
        await page.evaluate((lod) => (window.__city.ctx.services.pedestrians._renderer.forceLod = lod === 'close' ? 0 : lod === 'near' ? 1 : -1), lod);
        await page.waitForTimeout(900);
        const file = path.join(outDir, `p${i}_${s}${lod ? '_' + lod : ''}.png`);
        await page.screenshot({ path: file, timeout: 240000 });
        report.captures.push({ label: `${f.kind} ${f.age} ${s}${lod ? ' ' + lod : ''}`, file });
      }
    }
  }
  if (figs.length && args.group !== '0') {
    const f = figs[0];
    await page.evaluate((f) => (window.__city.ctx.camera.__zoom = 0, window.__city.ctx.services.pedestrians._renderer.forceLod = -1, window.__city.view({ target: { x: f.x, y: f.y + 1, z: f.z }, distance: 10, yaw: f.yaw + 25, pitch: 12 })), f);
    await page.waitForTimeout(1200);
    const file = path.join(outDir, 'group_10m.png');
    await page.screenshot({ path: file, timeout: 240000 });
    report.captures.push({ label: 'group 10 m', file });
  }
  report.frameErrors = await page.evaluate(() => window.__city.frameErrors);
} catch (e) {
  report.harnessError = String(e?.stack ?? e);
} finally {
  await browser.close();
  releaseLock();
}
report.seconds = Math.round((Date.now() - t0) / 1000);
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
if (report.captures.length) {
  const sheet = path.join(outDir, 'sheet.png');
  try {
    execFileSync('python3', ['-I', path.join(here, 'agent-tools/sheet.py'), sheet, String(args.cols ?? shots.length * lods.length), String(args.tile ?? 480), ...report.captures.map((c) => `${c.label}|${c.file}`)]);
    report.sheet = path.relative(root, sheet);
  } catch (e) {
    report.sheetError = String(e.message ?? e).slice(0, 200);
  }
}
console.log(JSON.stringify({ seconds: report.seconds, captures: report.captures.length, sheet: report.sheet, consoleErrors: report.consoleErrors.slice(0, 3), pageErrors: report.pageErrors.slice(0, 3), failedModules: report.failedModules, frameErrors: (report.frameErrors ?? []).slice(0, 3), harnessError: report.harnessError }));

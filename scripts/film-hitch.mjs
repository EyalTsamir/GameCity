#!/usr/bin/env node
// Stutter recorder for the opening film: every frame interval as the viewer sees it (vsync on), per shot, plus shader
// programs / geometries / textures created while it plays.
//
//   node scripts/film-hitch.mjs --url http://127.0.0.1:5173/ [--width 1920 --height 1025] [--q "extra"] [--out shots/film/hitch.json]
//
// Windows: "prep" (behind the curtain) and one per shot. A clean film: new programs 0, no freeze (> 100 ms) outside
// the fades. Compare within one run: sibling sessions on the GPU move all the numbers.

import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import { installRecorder, recMark, readFrames, frameStats } from './framerec.mjs';
import fs from 'node:fs';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const baseUrl = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const width = parseInt(args.width ?? '1920', 10);
const height = parseInt(args.height ?? '1025', 10);
const q = ['film', 'noidle', args.q].filter(Boolean).join('&');
await acquireLock();
const out = { url: `${baseUrl}?${q}`, width, height, windows: [], consoleErrors: [], pageErrors: [] };
const { browser, software } = await launchBrowser({ headless: args.headed !== '1', extraArgs: ['--enable-precise-memory-info'] });
out.softwareGL = software;
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  page.on('console', (m) => m.type() === 'error' && out.consoleErrors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => out.pageErrors.push(String(e).slice(0, 200)));
  await installRecorder(page);
  await page.goto(out.url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 1, null, { timeout: 300000, polling: 50 });
  const film = () =>
    page.evaluate(() => {
      const f = window.__city.ctx.services.camera.film;
      const st = window.__city.stats();
      return { t: f.time(), shot: f.shot(), playing: f.playing(), active: f.active(), frames: window.__city.frames(), now: performance.now(), hours: window.__city.ctx.clock.label(), step: st.postfx?.step, gpuMs: st.postfx?.gpuMs, dc: st.drawCalls, tris: st.triangles, cap: window.__city.ctx.frameCap ?? 0 };
    });
  let m = await recMark(page);
  let before = await readFrames(page, m);
  let prevDraw = await film();
  const close = async (name) => {
    const sl = await readFrames(page, m);
    const st = frameStats(sl);
    const info = await film();
    // (with the 30 fps cadence the recorder still ticks every refresh: the drawn frames are counted here)
    const drawMs = Math.round(((info.now - prevDraw.now) / Math.max(1, info.frames - prevDraw.frames)) * 10) / 10;
    prevDraw = info;
    const w = {
      name,
      drawMs,
      cap: info.cap,
      ...st,
      newPrograms: sl.programs - before.programs,
      newGeometries: sl.geometries - before.geometries,
      newTextures: sl.textures - before.textures,
      newProgramKeys: sl.progKeys.filter((k) => !before.progKeys.includes(k)),
      step: info.step,
      gpuMs: info.gpuMs,
      dc: info.dc,
      tris: info.tris,
    };
    out.windows.push(w);
    process.stderr.write(
      `${name.padEnd(12)} draw ${String(w.drawMs).padStart(6)} cap ${w.cap} mean ${String(w.meanMs).padStart(6)} p99 ${String(w.p99).padStart(6)} max ${String(w.max).padStart(7)} jank ${String(w.jank25).padStart(3)} hitch ${String(w.hitch50).padStart(3)} freeze ${String(w.freeze100).padStart(2)} ` +
        `lt ${w.longTasks}/${w.longTaskMax}ms gc ${w.gcDrops} alloc ${w.allocMBs}MB/s prog+${w.newPrograms} geo+${w.newGeometries} tex+${w.newTextures} ${w.step ?? ''} gpu ${w.gpuMs ?? '-'} dc ${w.dc}${w.newProgramKeys.length ? ' new: ' + w.newProgramKeys.join(' | ') : ''}\n`,
    );
    m = await recMark(page);
    before = await readFrames(page, m);
  };
  await page.waitForFunction(() => window.__city.ctx.services.camera.film.playing(), null, { timeout: 120000, polling: 30 });
  await close('prep');
  let cur = (await film()).shot;
  while (true) {
    await page.waitForFunction(
      (s) => {
        const f = window.__city.ctx.services.camera.film;
        return !f.active() || f.shot() !== s;
      },
      cur,
      { timeout: 120000, polling: 30 },
    );
    const st = await film();
    await close(cur);
    if (!st.active) break;
    cur = st.shot;
  }
  await page.waitForTimeout(3000);
  await close('after');
  out.frameErrors = await page.evaluate(() => window.__city.frameErrors);
  out.invariants = await page.evaluate(() => window.__city.invariants());
} catch (e) {
  out.harnessError = String(e?.stack ?? e);
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 1));
const shots = out.windows.filter((w) => w.name !== 'prep');
const sum = (k) => shots.reduce((a, w) => a + (w[k] ?? 0), 0);
console.log(JSON.stringify({ harnessError: out.harnessError, frameErrors: out.frameErrors, invariants: out.invariants, consoleErrors: out.consoleErrors, pageErrors: out.pageErrors, newPrograms: sum('newPrograms'), hitch50: sum('hitch50'), freeze100: sum('freeze100'), max: Math.max(...shots.map((w) => w.max)) }));

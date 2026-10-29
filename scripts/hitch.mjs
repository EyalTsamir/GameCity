#!/usr/bin/env node
// Stutter / hitch recorder: every frame interval as the viewer sees it (vsync on by default), per view x hour.
//
//   node scripts/hitch.mjs --views "overview;street=5,1.5,-65,9,0,6;harbor" --hours 12,21.5 --seconds 10
//   node scripts/hitch.mjs ... --adaptive 0      (fixed quality, comparable A/B)   --uncapped 1 (no vsync)
//   node scripts/hitch.mjs ... --headed 1        (a real window: the desktop compositor's vsync)
//   node scripts/hitch.mjs ... --out shots/perf/hitch.json
//
// One page load (like a viewer): "boot" = from the city being ready through the opening glide (--boot s), then for every
// hour (setHours) and view (camera cut): "arrive" = the first --arrive s after the cut (shader compiles, uploads, LOD
// switches of what just came into view), "steady" = the next --seconds s. Per window: mean / p50 / p95 / p99 / max frame
// interval, jank (> 25 ms = a missed vsync), hitch (> 50 ms), freeze (> 100 ms), GC drops, JS allocation rate,
// long tasks, shader programs / geometries / textures created, adaptive quality step.
// Viewport default 1920x1025 at DPR 1 (= the dev machine's 1536x820 CSS px at 125 % scaling, the app caps DPR at 1.5).

import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import { installRecorder, recMark, readFrames, frameStats } from './framerec.mjs';
import fs from 'node:fs';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const baseUrl = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const width = parseInt(args.width ?? '1920', 10);
const height = parseInt(args.height ?? '1025', 10);
const dpr = parseFloat(args.dpr ?? '1');
const seconds = parseFloat(args.seconds ?? '10');
const arrive = parseFloat(args.arrive ?? '3');
const bootS = parseFloat(args.boot ?? '12');
const hours = (args.hours ?? '12,21.5').split(',').map(Number);
const views = (args.views ?? 'overview')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const eq = s.indexOf('=');
    return eq < 0 ? { name: s, spec: s } : { name: s.slice(0, eq), spec: s.slice(eq + 1) };
  });
const q = [args.q, args.adaptive !== undefined ? `adaptive=${args.adaptive}` : '', 'noidle'].filter(Boolean).join('&');
const extraArgs = ['--enable-precise-memory-info'];
if (args.uncapped === '1') extraArgs.push('--disable-gpu-vsync', '--disable-frame-rate-limit');

await acquireLock();
const out = { url: `${baseUrl}?${q}`, width, height, dpr, windows: [], consoleErrors: [], pageErrors: [] };
const { browser, software } = await launchBrowser({ headless: args.headed !== '1', extraArgs });
out.softwareGL = software;
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
  await page.routeWebSocket(/.*/, () => {});
  page.on('console', (m) => m.type() === 'error' && out.consoleErrors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => out.pageErrors.push(String(e).slice(0, 200)));
  await installRecorder(page);
  const t0 = Date.now();
  await page.goto(out.url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 1, null, { timeout: 300000, polling: 50 });
  out.bootMs = Date.now() - t0;
  const info = async () =>
    page.evaluate(() => {
      const st = window.__city.stats();
      return { step: st.postfx?.step, gpuMs: st.postfx?.gpuMs, cpuMs: st.frameMs, dc: st.drawCalls, tris: st.triangles };
    });
  const measure = async (name, sec, extra) => {
    const m = await recMark(page);
    const before = await readFrames(page, m);
    await page.waitForTimeout(sec * 1000);
    const sl = await readFrames(page, m);
    const st = frameStats(sl);
    const w = {
      name,
      ...extra,
      ...st,
      newPrograms: sl.programs - before.programs,
      newGeometries: sl.geometries - before.geometries,
      newTextures: sl.textures - before.textures,
      newProgramKeys: sl.progKeys.filter((k) => !before.progKeys.includes(k)),
      programs: sl.programs,
      ...(await info()),
    };
    out.windows.push(w);
    process.stderr.write(
      `${name.padEnd(24)} mean ${String(w.meanMs).padStart(6)} p99 ${String(w.p99).padStart(6)} max ${String(w.max).padStart(7)} ` +
        `jank ${String(w.jank25).padStart(3)} hitch ${String(w.hitch50).padStart(3)} freeze ${String(w.freeze100).padStart(2)} ` +
        `lt ${w.longTasks}/${w.longTaskMax}ms gc ${w.gcDrops} alloc ${w.allocMBs}MB/s prog+${w.newPrograms} geo+${w.newGeometries} ` +
        `tex+${w.newTextures} ${w.step ?? ''} gpu ${w.gpuMs ?? '-'} cpu ${w.cpuMs}${w.newProgramKeys.length ? ' new: ' + w.newProgramKeys.join(' | ') : ''}\n`,
    );
    return w;
  };
  await measure('boot', bootS, { phase: 'boot' });
  for (const h of hours) {
    for (const v of views) {
      await page.evaluate(
        ([spec, hh]) => {
          window.__city.setHours(hh);
          if (/^[a-z]/i.test(spec)) window.__city.view(spec);
          else {
            const [x, y, z, distance, yaw, pitch] = spec.split(',').map(Number);
            window.__city.view({ target: { x, y, z }, distance, yaw, pitch });
          }
        },
        [v.spec, h],
      );
      await measure(`${v.name}@${h} arrive`, arrive, { view: v.name, hours: h, phase: 'arrive' });
      await measure(`${v.name}@${h}`, seconds, { view: v.name, hours: h, phase: 'steady' });
    }
  }
  // --fly s: animated camera flights between consecutive views (what a viewer / the idle tour does): streaming of
  // near sets, LOD and culling changes while moving
  const fly = parseFloat(args.fly ?? '0');
  if (fly > 0 && views.length > 1) {
    for (let i = 0; i < views.length; i++) {
      const v = views[(i + 1) % views.length];
      await page.evaluate(
        ([spec, s]) => {
          const cam = window.__city.ctx.services.camera;
          const st = /^[a-z]/i.test(spec) ? window.__city.ctx.plan.pois.find((p) => p.id === spec) : (() => {
            const [x, y, z, distance, yaw, pitch] = spec.split(',').map(Number);
            return { target: { x, y, z }, distance, yaw, pitch };
          })();
          cam.flyTo(st, s);
        },
        [v.spec, fly],
      );
      await measure(`fly→${v.name}`, fly + 1, { view: v.name, phase: 'fly' });
    }
  }
  out.frameErrors = await page.evaluate(() => window.__city.frameErrors);
  out.invariants = await page.evaluate(() => window.__city.invariants());
} catch (e) {
  out.harnessError = String(e?.stack ?? e);
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 1));
const brief = out.windows.map(({ worst, ...w }) => w);
console.log(JSON.stringify({ ...out, windows: brief }));

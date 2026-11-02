#!/usr/bin/env node
// What temporal AA does to things that move by themselves: the city running, a still or barely drifting camera aimed so that a bus, a
// car and a walker pass through the picture. flicker.mjs hides traffic and people, which is how torn buses got through
// (docs/progress/sweep-flicker.md). Always read the frames.
//
//   node scripts/taa-city.mjs --url http://127.0.0.1:5234/ --out shots/flick/city --hours 12,21.5 --variants "taa=;notaa=notaa"
//     --subjects bus,car,walker   --modes still,nudge,settling   --shots 4   --gap 8 (frames between shots)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// TH_HARNESS=<main checkout>/scripts/browser.mjs: share the one browser lock with the other sessions from a worktree
const { launchBrowser, acquireLock, releaseLock } = await import(process.env.TH_HARNESS ? pathToFileURL(process.env.TH_HARNESS).href : './browser.mjs');

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const base = args.url ?? 'http://127.0.0.1:5173/';
const out = args.out ?? 'shots/flick/city';
const list = (s) => s.split(',').filter(Boolean);
const hours = list(args.hours ?? '12,21.5').map(Number);
const subjects = list(args.subjects ?? 'bus,car,walker');
const modes = list(args.modes ?? 'still,nudge');
const shots = parseInt(args.shots ?? '4', 10);
const gap = parseInt(args.gap ?? '8', 10);
const variants = (args.variants ?? 'taa=;notaa=notaa').split(';').map((v) => v.split('='));
fs.mkdirSync(out, { recursive: true });

/** the subject now and its heading; the camera stands off its path, ahead of it, looking across */
const aim = async ([subject, D, lead]) => {
  const c = window.__city.ctx;
  const pick = () => {
    if (subject === 'walker') {
      return c.services.pedestrians._crowd.parties.flatMap((p) => p.members);
    }
    const vs = c.services.traffic.vehicles().filter((V) => V.v > 2.5);
    return vs.filter((V) => V.isBus === (subject === 'bus'));
  };
  const before = pick()
    .slice(0, 400)
    .map((o) => ({ o, x: o.x, z: o.z }));
  await new Promise((r) => setTimeout(r, 400));
  let best = null;
  for (const b of before) {
    const dx = b.o.x - b.x,
      dz = b.o.z - b.z,
      l = Math.hypot(dx, dz);
    if (l < (subject === 'walker' ? 0.15 : 0.5)) continue;
    const nx = -dz / l,
      nz = dx / l;
    const fx = b.o.x + (dx / 0.4) * lead,
      fz = b.o.z + (dz / 0.4) * lead;
    for (const s of [1, -1]) {
      const cx = fx + nx * D * s,
        cz = fz + nz * D * s;
      const yaw = (Math.atan2(cx - fx, cz - fz) * 180) / Math.PI;
      const cy = (c.services.terrain?.height?.(cx, cz) ?? 0) + 1.6;
      best = { cx, cy, cz, fx, fz, yaw, keys: Object.keys(b.o).slice(0, 40) };
      break;
    }
    if (best) break;
  }
  if (!best) return null;
  const yr = (best.yaw * Math.PI) / 180;
  c.services.camera.flyTo({ target: { x: best.cx - Math.sin(yr) * D, y: best.cy, z: best.cz - Math.cos(yr) * D }, distance: D, yaw: best.yaw, pitch: 0 }, 0);
  return best;
};

/** waits n drawn frames; with drift the camera moves 0.15 px sideways each frame */
const frames = ([n, drift]) =>
  new Promise((res) => {
    const c = window.__city.ctx,
      cam = c.services.camera,
      st = cam.getState();
    const s0 = { target: { ...st.target }, distance: st.distance, yaw: st.yaw, pitch: st.pitch };
    const px = (2 * s0.distance * Math.tan((c.camera.fov * Math.PI) / 360)) / c.renderer.getContext().drawingBufferHeight;
    const yr = (s0.yaw * Math.PI) / 180;
    let k = 0;
    const tick = () => {
      k++;
      if (drift) cam.flyTo({ target: { x: s0.target.x + Math.cos(yr) * px * 0.15 * k, y: s0.target.y, z: s0.target.z - Math.sin(yr) * px * 0.15 * k }, distance: s0.distance, yaw: s0.yaw, pitch: s0.pitch }, 0);
      if (k >= n) res(k);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

await acquireLock();
const { browser } = await launchBrowser();
const report = { errors: [], taken: [] };
try {
  for (const [name, q] of variants) {
    for (const h of hours) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1025 } });
      // (no HMR: a source edit or Vite restart would reload the page mid-run)
      await page.routeWebSocket(/.*/, () => {});
      page.on('console', (m) => m.type() === 'error' && report.errors.push(m.text()));
      page.on('pageerror', (e) => report.errors.push(String(e)));
      const url = `${base}?${['nointro', 'noidle', 'nofilm', 'adaptive=0', 'quality=high', 'weather=clear', 'time=' + h, q].filter(Boolean).join('&')}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
      await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 5, null, { timeout: 300000, polling: 250 });
      // the city fills its streets
      await page.evaluate(() => window.__city.setSpeed(4));
      await page.waitForTimeout(12000);
      await page.evaluate(() => window.__city.setSpeed(1));
      await page.evaluate((hh) => window.__city.setHours(hh), h);
      for (const subject of subjects)
        for (const mode of modes) {
          const D = subject === 'walker' ? 5 : subject === 'car' ? 8 : 11;
          // settling: the frames come while the camera has just stopped; still: after it has come to rest (24 frames)
          const lead = mode === 'settling' ? 0.35 : subject === 'walker' ? 2 : 2.2;
          let a = null;
          for (let t = 0; t < 8 && !a; t++) {
            a = await page.evaluate(aim, [subject, D, lead]);
            if (!a) await page.waitForTimeout(1500);
          }
          const tag = `${name}_${String(h).replace('.', 'h')}_${subject}_${mode}`;
          if (!a) {
            report.taken.push({ tag, missing: true });
            continue;
          }
          await page.evaluate(frames, [mode === 'settling' ? 4 : 30, mode === 'nudge']);
          for (let i = 0; i < shots; i++) {
            await page.screenshot({ path: path.join(out, `${tag}_${i}.jpg`), type: 'jpeg', quality: 82 });
            await page.evaluate(frames, [gap, mode === 'nudge']);
          }
          report.taken.push({ tag, a });
        }
      await page.close();
    }
  }
} finally {
  await browser.close();
  releaseLock();
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ errors: report.errors.slice(0, 5), taken: report.taken.map((t) => t.tag + (t.missing ? ' MISSING' : '')) }));

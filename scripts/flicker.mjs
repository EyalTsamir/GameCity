#!/usr/bin/env node
// What trembles, measured: truly consecutive frames from fixed viewpoints, read back in the task that drew them.
// Stills can't show it, so nobody judged it; this is the number to judge by (docs/progress/sweep-flicker.md).
//
//   node scripts/flicker.mjs --url http://127.0.0.1:5234/ --out shots/flick/base
//   ... --views overview,downtown,street,market,wall-oldtown:3   a POI, "name=x,y,z,dist,yaw,pitch", or a close-set id[:metres]
//   ... --set quick|wide      preset view lists (default quick)
//   ... --hours 12,21.5  --conds still,wind,clock,nudge,pan  --frames 24  --settle 2500  --q "noao"
//   ... --variants "base=;noao=noao;nocontact=nocontact"     toggles, one page load each, compared with the first
//   ... --heat 0              numbers only
//
// Conditions (the camera never leaves its place except in nudge and pan):
//   still  clock and simulation stopped: whatever changes is pure rendering noise
//   wind   simulation running, hour held, moving things hidden (?hide=traffic,pedestrians): wind, water, smoke
//   clock  the same with the hour running: the sun moving, cloud shadows
//   nudge  stopped, the camera drifts sideways 2 mm/frame × distance-scale: a hand that isn't quite still
//   pan    stopped, the camera turns 0.1 px/frame: shimmer of fine detail under a slow look around
//   walk   simulation running, the camera walks 1.4 m/s (4.7 cm/frame) sideways: what a stroll looks like, ghosts behind things included
//   sweep  simulation running, the camera turns 4 px/frame: a look around with the mouse
//
// The score separates a trembling pixel from one that changes smoothly. With luma L(t), per pixel per frame:
//   d1 = |L(t+1) − L(t)|               any change, smooth motion included
//   d2 = |L(t+1) − 2 L(t) + L(t−1)|    only what reverses or jumps: steady drift gives 0, a flicker gives 2–4 × its size
// Reported, luma in 8-bit display values: sharp (mean fine contrast of the last frame), d1, d2 (means ×100), and area3 / area8 / area24: % of the picture where d2 reached
// 3 / 8 / 24 at least once in the run ("how much of the picture trembles"). Heat maps are the per-pixel mean d2.
// Writes <out>/report.json, <out>/<variant>_<view>_<hour>_<cond>_heat.png and, once per view, _frame.jpg.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// TH_HARNESS=<main checkout>/scripts/browser.mjs: share the one browser lock with the other sessions from a worktree
const { launchBrowser, acquireLock, releaseLock } = await import(process.env.TH_HARNESS ? pathToFileURL(process.env.TH_HARNESS).href : './browser.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[a.slice(2)] = '1';
  else args[a.slice(2)] = process.argv[++i];
}
const list = (s, sep = ',') => (s ?? '').split(sep).map((x) => x.trim()).filter(Boolean);
const close = JSON.parse(fs.readFileSync(path.join(here, 'closeset-views.json'), 'utf8'));
const SETS = {
  quick: 'overview,downtown,street=5,1.5,-65,9,0,6,market=27.5,1,78.5,16,200,28,wall-oldtown:3,tree-street:3,ground-lawn:3',
  wide: 'overview,downtown,harbor,park,oldtown,street=5,1.5,-65,9,0,6,market=27.5,1,78.5,16,200,28,wall-oldtown:3,wall-house:3,wall-factory:10,door-office:3,shop-market:3,ground-sidewalk:3,ground-lawn:3,ground-road:3,furn-bench:3,tree-street:3,tree-park:10,rail-platform:3,water-riverbank:10,country-field:10,country-forest:10',
};
// (street=x,y,z,... holds commas: a name only starts where a word with a letter stands after a comma)
const splitViews = (s) => s.split(/,(?=[a-zA-Z])/).map((x) => x.trim()).filter(Boolean);
const viewNames = splitViews(args.views ?? SETS[args.set ?? 'quick']);
const hours = list(args.hours ?? '12,21.5').map(Number);
const conds = list(args.conds ?? 'still,wind,nudge,pan');
const frames = parseInt(args.frames ?? '24', 10);
const settle = parseInt(args.settle ?? '2500', 10);
const width = parseInt(args.width ?? '1920', 10);
const height = parseInt(args.height ?? '1025', 10);
const wantHeat = args.heat !== '0';
const outDir = path.resolve(args.out ?? 'shots/flick');
fs.mkdirSync(outDir, { recursive: true });
const base = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const variants = list(args.variants ?? 'base=', ';').map((s) => {
  const k = s.indexOf('=');
  return k < 0 ? { name: s, q: s } : { name: s.slice(0, k), q: s.slice(k + 1) };
});
const HIDE = 'hide=traffic,pedestrians';
const urlFor = (extra) => `${base}?${['nointro', 'noidle', 'nofilm', 'adaptive=0', args.q, extra].filter(Boolean).join('&')}`;

// Installs the recorder: wraps ctx.render, reads the canvas right after each draw, and folds the score in place.
const installInPage = () => {
  const c = window.__city.ctx;
  if (c.__flick) return;
  const orig = c.render;
  const gl = c.renderer.getContext();
  const rec = { on: false, step: null };
  c.__flick = rec;
  // The readback slows the page to about 10 fps; the clock is fed a steady 1/30 s while recording, so what moves with time
  // moves per frame what it moves on the machine it is for, and two runs see the same frames.
  const update = c.clock.update.bind(c.clock);
  c.clock.update = (dt) => update(rec.on ? 1 / 30 : dt);
  c.render = (dt) => {
    orig(dt);
    if (rec.on) rec.grab();
    rec.step?.();
  };
  rec.start = (n, step) =>
    new Promise((resolve) => {
      const W = gl.drawingBufferWidth,
        H = gl.drawingBufferHeight,
        N = W * H;
      const raw = new Uint8Array(N * 4);
      let a = new Uint8ClampedArray(N),
        b = new Uint8ClampedArray(N),
        cc = new Uint8ClampedArray(N);
      const sum = new Float32Array(N);
      const peak = new Uint8Array(N);
      let seen = 0,
        d1 = 0,
        d2 = 0;
      const stamps = [];
      rec.step = step;
      rec.grab = () => {
        stamps.push(performance.now());
        c.renderer.state.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, raw);
        for (let i = 0, j = 0; i < N; i++, j += 4) cc[i] = (raw[j] * 54 + raw[j + 1] * 183 + raw[j + 2] * 19 + 128) >> 8;
        if (seen >= 1) {
          for (let i = 0; i < N; i++) {
            const e = cc[i] - b[i];
            d1 += e < 0 ? -e : e;
          }
        }
        if (seen >= 2) {
          for (let i = 0; i < N; i++) {
            let e = cc[i] - 2 * b[i] + a[i];
            if (e < 0) e = -e;
            d2 += e;
            sum[i] += e;
            if (e > peak[i]) peak[i] = e > 255 ? 255 : e;
          }
        }
        const t = a;
        a = b;
        b = cc;
        cc = t;
        seen++;
        if (seen < n) return;
        rec.on = false;
        rec.step = null;
        const m = n - 2;
        let a3 = 0,
          a8 = 0,
          a24 = 0;
        for (let i = 0; i < N; i++) {
          const p = peak[i];
          if (p >= 3) a3++;
          if (p >= 8) a8++;
          if (p >= 24) a24++;
        }
        // how much fine contrast the last frame has (mean |pixel − its 4 neighbours|): a fix must not buy calm with blur
        let sharp = 0;
        for (let y = 1; y < H - 1; y++)
          for (let x = 1, i = y * W + 1; x < W - 1; x++, i++) {
            const e = 4 * b[i] - b[i - 1] - b[i + 1] - b[i - W] - b[i + W];
            sharp += e < 0 ? -e : e;
          }
        const out = {
          sharp: +(sharp / (4 * N)).toFixed(3),
          d1: +((100 * d1) / (N * (n - 1))).toFixed(2),
          d2: +((100 * d2) / (N * m)).toFixed(2),
          area3: +((100 * a3) / N).toFixed(2),
          area8: +((100 * a8) / N).toFixed(2),
          area24: +((100 * a24) / N).toFixed(2),
          msPerFrame: +((stamps[stamps.length - 1] - stamps[0]) / (stamps.length - 1)).toFixed(1),
        };
        rec.last = { W, H, sum, m, raw };
        resolve(out);
      };
      rec.on = true;
    });
  // heat map: mean d2 at half size (each block keeps its hottest pixel, so a thin line stays visible), colour = how much
  rec.heat = () => {
    const { W, H, sum, m } = rec.last;
    const w = W >> 1,
      h = H >> 1;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d');
    const im = g.createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const s = sum[(H - 1 - (2 * y + dy)) * W + 2 * x + dx];
            if (s > v) v = s;
          }
        v /= m;
        // 0 black, 2 blue, 6 magenta, 16 orange, 40+ white (display values of d2)
        const t = Math.min(1, Math.sqrt(v / 40));
        const o = (y * w + x) * 4;
        im.data[o] = 255 * Math.min(1, Math.max(0, t * 2.2 - 0.25));
        im.data[o + 1] = 255 * Math.min(1, Math.max(0, t * 2 - 1));
        im.data[o + 2] = 255 * (t < 0.45 ? Math.min(1, t * 3.4) : Math.max(0, 1 - (t - 0.45) * 2.6) + Math.max(0, t - 0.8) * 5);
        im.data[o + 3] = 255;
      }
    g.putImageData(im, 0, 0);
    return cv.toDataURL('image/png').split(',')[1];
  };
  // the last frame, in colour, the middle of the picture at 1:1
  rec.frameShot = () => {
    const { W, H, raw } = rec.last;
    const cv = document.createElement('canvas');
    cv.width = W >> 1;
    cv.height = H >> 1;
    const x0 = W >> 2,
      y0 = H >> 2;
    const g = cv.getContext('2d');
    const im = g.createImageData(cv.width, cv.height);
    for (let y = 0; y < cv.height; y++)
      for (let x = 0; x < cv.width; x++) {
        const j = ((H - 1 - (y0 + y)) * W + x0 + x) * 4;
        const o = (y * cv.width + x) * 4;
        im.data[o] = raw[j];
        im.data[o + 1] = raw[j + 1];
        im.data[o + 2] = raw[j + 2];
        im.data[o + 3] = 255;
      }
    g.putImageData(im, 0, 0);
    return cv.toDataURL('image/jpeg', 0.8).split(',')[1];
  };
};

// Where the camera goes, close-set ids as in closeset.mjs (always a static viewpoint: dyn ones are skipped).
const placeInPage = ([v]) => {
  const c = window.__city.ctx;
  const ground = (px, pz) => {
    const land = c.services.landscape;
    const sl = c.plan.slab;
    if (px > sl.x0 && px < sl.x1 && pz > sl.z0 && pz < sl.z1 && c.services.terrain) return c.services.terrain.height(px, pz);
    return land?.height ? land.height(px, pz) : 0;
  };
  if (v.poi) {
    window.__city.view(v.poi);
    return null;
  }
  if (v.spec) {
    const [x, y, z, distance, yaw, pitch] = v.spec;
    window.__city.view({ target: { x, y, z }, distance, yaw, pitch });
    return null;
  }
  const { x, z, yaw } = v.close;
  const ty = v.close.y ?? ground(x, z) + (v.close.h ?? 0);
  const rise = ground(x, z) + 1.6 - ty;
  const pitch = Math.abs(rise) < v.d * 0.85 ? (Math.asin(rise / v.d) * 180) / Math.PI : rise > 0 ? 58 : -40;
  window.__city.view({ target: { x, y: ty, z }, distance: v.d, yaw, pitch });
  return null;
};

const resolveView = (name) => {
  if (name.includes('=')) {
    const k = name.indexOf('=');
    return { name: name.slice(0, k), spec: name.slice(k + 1).split(',').map(Number) };
  }
  const [id, d] = name.split(':');
  const cl = close.find((v) => v.id === id);
  if (cl) return { name: name.replace(':', '_'), close: cl, d: parseFloat(d ?? '3') };
  return { name, poi: name };
};

const setCondInPage = ([cond]) => {
  const city = window.__city;
  const clock = city.ctx.clock;
  city.setSpeed(cond === 'wind' || cond === 'clock' || cond === 'walk' || cond === 'sweep' ? 1 : 0);
  clock.holdTime = cond === 'wind';
};

// Run n frames with the camera moving as the condition says, score them.
const measureInPage = async ([cond, n]) => {
  const c = window.__city.ctx;
  const rec = c.__flick;
  const cam = c.services.camera;
  let step = null;
  const cc = c.camera;
  if (cond === 'nudge' || cond === 'pan' || cond === 'walk' || cond === 'sweep') {
    const st = cam?.getState?.() ?? cam?.state ?? null;
    if (!st) throw new Error('camera state not reachable');
    const s0 = { target: { x: st.target.x, y: st.target.y, z: st.target.z }, distance: st.distance, yaw: st.yaw, pitch: st.pitch };
    let k = 0;
    if (cond === 'nudge') {
      // sideways, about 0.15 px per frame on the focus plane whatever the distance
      const px = (2 * s0.distance * Math.tan((cc.fov * Math.PI) / 360)) / c.renderer.getContext().drawingBufferHeight;
      const yr = (s0.yaw * Math.PI) / 180;
      const dx = Math.cos(yr) * px * 0.15,
        dz = -Math.sin(yr) * px * 0.15;
      step = () => {
        k++;
        cam.flyTo({ target: { x: s0.target.x + dx * k, y: s0.target.y, z: s0.target.z + dz * k }, distance: s0.distance, yaw: s0.yaw, pitch: s0.pitch }, 0);
      };
    } else if (cond === 'walk') {
      const yr = (s0.yaw * Math.PI) / 180;
      const dx = Math.cos(yr) * 0.047,
        dz = -Math.sin(yr) * 0.047;
      step = () => {
        k++;
        cam.flyTo({ target: { x: s0.target.x + dx * k, y: s0.target.y, z: s0.target.z + dz * k }, distance: s0.distance, yaw: s0.yaw, pitch: s0.pitch }, 0);
      };
    } else {
      const degPerPx = cc.fov / c.renderer.getContext().drawingBufferHeight;
      const rate = cond === 'sweep' ? 4 : 0.1;
      step = () => {
        k++;
        cam.flyTo({ target: s0.target, distance: s0.distance, yaw: s0.yaw + degPerPx * rate * k, pitch: s0.pitch }, 0);
      };
    }
  }
  const r = await rec.start(n, step);
  return r;
};

await acquireLock();
const report = { url: base, frames, hours, conds, width, height, variants, rows: [], consoleErrors: [], frameErrors: [] };
const { browser, software } = await launchBrowser();
report.softwareGL = software;
const views = viewNames.map(resolveView);
const needHide = conds.some((k) => k === 'wind' || k === 'clock');
const needPlain = conds.some((k) => k !== 'wind' && k !== 'clock');
try {
  for (const variant of variants) {
    for (const hide of [false, true]) {
      if (hide ? !needHide : !needPlain) continue;
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      await page.routeWebSocket(/.*/, () => {});
      page.on('console', (m) => {
        if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 200));
      });
      page.on('pageerror', (e) => report.consoleErrors.push(String(e).slice(0, 200)));
      await page.goto(urlFor([variant.q, hide ? HIDE : ''].filter(Boolean).join('&')), { waitUntil: 'domcontentloaded', timeout: 300000 });
      await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
      await page.addStyleTag({ content: '#ui{display:none!important}' });
      await page.evaluate(installInPage);
      for (const h of hours) {
        await page.evaluate((hh) => window.__city.setHours(hh), h);
        for (const v of views) {
          for (const cond of conds) {
            if ((cond === 'wind' || cond === 'clock') !== hide) continue;
            await page.evaluate(setCondInPage, [cond]);
            await page.evaluate(placeInPage, [v]);
            await page.waitForTimeout(settle);
            const r = await page.evaluate(measureInPage, [cond, frames]);
            const tag = `${variant.name}_${v.name}_${String(h).replace('.', 'h')}_${cond}`;
            if (wantHeat) {
              fs.writeFileSync(path.join(outDir, `${tag}_heat.png`), Buffer.from(await page.evaluate(() => window.__city.ctx.__flick.heat()), 'base64'));
              if (cond === 'still' || cond === 'walk' || cond === 'sweep') fs.writeFileSync(path.join(outDir, `${tag}_frame.jpg`), Buffer.from(await page.evaluate(() => window.__city.ctx.__flick.frameShot()), 'base64'));
            }
            report.rows.push({ variant: variant.name, view: v.name, h, cond, ...r });
            console.log(`${variant.name.padEnd(14)} ${v.name.padEnd(18)} ${String(h).padEnd(5)} ${cond.padEnd(6)} d1 ${String(r.d1).padStart(7)} d2 ${String(r.d2).padStart(7)} area3 ${String(r.area3).padStart(6)} area8 ${String(r.area8).padStart(6)} area24 ${String(r.area24).padStart(6)} sharp ${r.sharp}  ${r.msPerFrame} ms`);
            fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
          }
        }
      }
      report.frameErrors.push(...(await page.evaluate(() => window.__city.frameErrors)));
      await page.close();
    }
  }
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));

// per condition, each variant against the first: mean of the views
if (variants.length > 1) {
  console.log('\nmean over views (variant, cond, hour): d2, area3, area8, area24, and the change from the first variant');
  const ref = variants[0].name;
  const mean = (rows, k) => rows.reduce((a, r) => a + r[k], 0) / Math.max(1, rows.length);
  for (const cond of conds)
    for (const h of hours) {
      const r0 = report.rows.filter((r) => r.variant === ref && r.cond === cond && r.h === h);
      for (const variant of variants) {
        const rr = report.rows.filter((r) => r.variant === variant.name && r.cond === cond && r.h === h);
        const fmt = (k) => `${k} ${mean(rr, k).toFixed(2)} (${(mean(rr, k) - mean(r0, k) >= 0 ? '+' : '') + (mean(rr, k) - mean(r0, k)).toFixed(2)})`;
        console.log(`${variant.name.padEnd(16)} ${cond.padEnd(6)} ${String(h).padEnd(5)} ${fmt('d2')}  ${fmt('area3')}  ${fmt('area8')}  ${fmt('area24')}  ${fmt('sharp')}`);
      }
    }
}
console.log(`errors: ${report.consoleErrors.length} console, ${report.frameErrors.length} frame; software GL: ${software}`);

#!/usr/bin/env node
// Interactive test of the camera / UI / audio modules with real mouse & keyboard input.
//
//   node scripts/ui-test.mjs [--q "only=camera,ui,audio&camdebug"] [--out shots/uitest] [--url http://127.0.0.1:5174/] [--width 1280 --height 720] [--dpr 1.25]
//                            [--steps intro,drag,pan,wheel,keys,poi,pois,follow,chase,kinds,building,dbl,aircraft,tour,help,places,
//                                     sound,time,speed,labels,resize,sweep,tourwatch]
//
// Full city: --q noidle (the default `only=camera,ui,audio&camdebug` tests the camera on a stand-in city).
// `intro` loads the page with the establishing shot and the first-run hint (otherwise &nointro is added).
// Steps that need modules which are not loaded (e.g. aircraft without "ambient") are listed in `skipped`.
// Shares the screenshot lock with scripts/shot.mjs. Prints a JSON report with per-step
// pass/fail, camera state deltas, console errors and screenshots.

import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i];
}
const width = parseInt(args.width ?? '1280', 10);
const height = parseInt(args.height ?? '720', 10);
const dpr = parseFloat(args.dpr ?? '1');
const q = args.q ?? 'only=camera,ui,audio&camdebug';
const DEFAULT_STEPS = 'drag,pan,wheel,keys,poi,pois,follow,chase,kinds,building,dbl,aircraft,sweep,tour,help,places,sound,time,speed,labels,resize';
const wanted = new Set((args.steps ?? DEFAULT_STEPS).split(','));
const intro = wanted.has('intro');
const baseUrl = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/'); // --url: another dev server (e.g. a baseline worktree)
const url = `${baseUrl}?${q}${intro ? (q.includes('hint') ? '' : '&hint') : q.includes('nointro') ? '' : '&nointro'}`;
const outBase = path.resolve(root, args.out ?? 'shots/uitest');
fs.mkdirSync(path.dirname(outBase), { recursive: true });


const report = { url, viewport: `${width}x${height}@${dpr}`, steps: [], skipped: [], consoleErrors: [], consoleWarnings: [], pageErrors: [], screenshots: [], reloads: 0 };

// Other agents edit files while we test: a stub Vite client keeps HMR full-reloads away from this page.
const VITE_STUB = `
const styles = new Map();
export function updateStyle(id, content) {
  let s = styles.get(id);
  if (!s) { s = document.createElement('style'); s.setAttribute('type', 'text/css'); s.setAttribute('data-vite-dev-id', id); document.head.appendChild(s); styles.set(id, s); }
  s.textContent = content;
}
export function removeStyle(id) { const s = styles.get(id); if (s) { s.remove(); styles.delete(id); } }
export function createHotContext() { return { data: {}, accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, decline() {}, on() {}, off() {}, send() {} }; }
export function injectQuery(url) { return url; }
export class ErrorOverlay {}
`;
const step = (name, ok, detail) => report.steps.push({ name, ok: !!ok, ...(detail ? { detail } : {}) });
const skip = (name, why) => report.skipped.push(`${name}: ${why}`);

// ── per-frame camera recorder (runs in the page): camera position, distance, target, inside-a-building flag
const REC_START = () => {
  const plan = window.__city.ctx.plan;
  const lots = plan.lots.map((l) => [l.footprint.x0, l.footprint.z0, l.footprint.x1, l.footprint.z1, l.height]);
  const inside = (p) => {
    for (const l of lots) if (p.x > l[0] + 0.2 && p.x < l[2] - 0.2 && p.z > l[1] + 0.2 && p.z < l[3] - 0.2 && p.y < l[4] - 0.2) return 1;
    return 0;
  };
  window.__rec = { on: true, frames: [] };
  const tick = () => {
    if (!window.__rec.on) return;
    const c = window.__city.ctx.camera.position;
    const cam = window.__city.ctx.services.camera;
    const s = cam.getState();
    window.__rec.frames.push([performance.now(), c.x, c.y, c.z, s.distance, s.target.x, s.target.y, s.target.z, inside(c), s.yaw, s.pitch]);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const REC_STOP = () => {
  window.__rec.on = false;
  return window.__rec.frames;
};
/** smoothness numbers for a recorded stretch: biggest single-frame distance change (relative), camera step, inside frames */
function motionStats(frames) {
  let maxRel = 0,
    maxStep = 0,
    maxJerk = 0,
    inside = 0,
    insideAt = null,
    at = null;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1],
      b = frames[i];
    // normalise to ~60 fps frames; the sample runs one frame behind the camera update, so a page stall
    // shows up in the *next* (short) interval — use the longer of the two neighbouring intervals
    const prevDt = i > 1 ? a[0] - frames[i - 2][0] : 0;
    const dtf = Math.max(1, Math.max(b[0] - a[0], prevDt) / 16.7);
    const rel = Math.abs(b[4] - a[4]) / Math.max(1, a[4]) / dtf;
    if (rel > maxRel) {
      maxRel = rel;
      at = b.slice(1, 11).map((v) => Math.round(v));
    }
    maxStep = Math.max(maxStep, Math.hypot(b[1] - a[1], b[2] - a[2], b[3] - a[3]) / dtf);
    if (b[8]) {
      inside++;
      if (!insideAt) insideAt = b.slice(1, 11).map((v) => Math.round(v));
    }
    if (i > 1) {
      const c = frames[i - 2];
      maxJerk = Math.max(maxJerk, Math.hypot(b[1] - 2 * a[1] + c[1], b[2] - 2 * a[2] + c[2], b[3] - 2 * a[3] + c[3]) / (dtf * dtf));
    }
  }
  return { frames: frames.length, maxRelDistPerFrame: Math.round(maxRel * 1000) / 1000, maxStepPerFrame: Math.round(maxStep * 10) / 10, maxAccel: Math.round(maxJerk * 100) / 100, insideFrames: inside, at, insideAt };
}

await acquireLock();
let browser;
try {
  browser = (await launchBrowser({ headless: !args.headed })).browser;
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(m.text());
    else if (m.type() === 'warning') report.consoleWarnings.push(m.text());
  });
  page.on('pageerror', (e) => report.pageErrors.push(String(e?.stack ?? e)));
  if (!args.hmr) await page.route(/\/@vite\/client/, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: VITE_STUB }));
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) report.reloads++;
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 5, null, { timeout: 300000, polling: 250 });
  // the loading screen fades for ~1 s and takes the pointer meanwhile (the intro step watches it instead)
  if (!intro) await page.waitForTimeout(1500);

  const st = () => page.evaluate(() => window.__city.ctx.services.camera.getState());
  const mode = () => page.evaluate(() => window.__city.ctx.services.camera.mode());
  const shot = async (name) => {
    const f = `${outBase}_${name}.png`;
    await page.screenshot({ path: f });
    report.screenshots.push(path.relative(root, f));
  };
  const settle = (ms = 900) => page.waitForTimeout(ms);
  const view = (v) => page.evaluate((s) => window.__city.view(s), v);
  const pickers = await page.evaluate(() => window.__city.ctx.pickers.map((p) => p.name));
  const has = (name) => pickers.includes(name);
  const cx = width / 2,
    cy = height / 2;

  if (intro) {
    // first run: establishing shot gliding into the overview, then the hint above the toolbar
    await page.evaluate(REC_START);
    await shot('intro_0');
    await page.waitForTimeout(2000);
    await shot('intro_1');
    await page.waitForTimeout(2600);
    await shot('intro_2');
    await page.waitForTimeout(2600);
    const frames = await page.evaluate(REC_STOP);
    const m = motionStats(frames);
    const s = await st();
    const ov = await page.evaluate(() => window.__city.ctx.plan.pois.find((p) => p.id === 'overview'));
    step('establishing shot glides smoothly into the overview', m.maxRelDistPerFrame < 0.05 && m.maxStepPerFrame < 25 && Math.abs(s.distance - ov.distance) < 15, { ...m, end: Math.round(s.distance) });
    const lay = await page.evaluate(() => {
      const r = (sel) => {
        const e = document.querySelector(sel);
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return { x: Math.round(b.left), y: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) };
      };
      const hint = document.querySelector('.th-hint');
      const labels = [...document.querySelectorAll('.th-dlabel')].filter((e) => e.style.display === 'block' && parseFloat(e.style.opacity) > 0.5);
      const fs = (sel) => {
        const e = document.querySelector(sel);
        return e ? parseFloat(getComputedStyle(e).fontSize) : null;
      };
      return { hintShown: !!hint?.classList.contains('show'), hint: r('.th-hint'), toolbar: r('.th-toolbar'), minimap: r('.th-minimap'), title: r('.th-title'), labels: labels.length, fonts: { hint: fs('.th-hint'), label: labels[0] ? parseFloat(getComputedStyle(labels[0]).fontSize) : null, tag: fs('.th-tag') } };
    });
    const ovl = (a, b) => a && b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
    step('first-run hint shows, readable and clear of the toolbar / minimap / title', lay.hintShown && !ovl(lay.hint, lay.toolbar) && !ovl(lay.hint, lay.minimap) && !ovl(lay.hint, lay.title) && lay.fonts.hint >= 12, lay);
    await shot('firstrun');
  }

  await view('overview');
  await settle(300);

  if (wanted.has('drag')) {
    const a = await st();
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'left' });
    for (let i = 1; i <= 20; i++) await page.mouse.move(cx + i * 10, cy + i * 2);
    await page.mouse.up({ button: 'left' });
    await settle(1200);
    const b = await st();
    const dyaw = ((b.yaw - a.yaw + 540) % 360) - 180;
    step('left-drag rotates (yaw decreases)', dyaw < -20, { dyaw: Math.round(dyaw), dpitch: Math.round(b.pitch - a.pitch) });
  }

  if (wanted.has('pan')) {
    await view('overview');
    await settle(200);
    const a = await st();
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'right' });
    for (let i = 1; i <= 15; i++) await page.mouse.move(cx - i * 12, cy);
    await page.mouse.up({ button: 'right' });
    await settle(1000);
    const b = await st();
    const moved = Math.hypot(b.target.x - a.target.x, b.target.z - a.target.z);
    step('right-drag pans the target', moved > 40, { moved: Math.round(moved), yawChange: Math.round(b.yaw - a.yaw) });
    // shift + left drag also pans
    const c0 = await st();
    await page.keyboard.down('Shift');
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'left' });
    for (let i = 1; i <= 10; i++) await page.mouse.move(cx, cy + i * 12);
    await page.mouse.up({ button: 'left' });
    await page.keyboard.up('Shift');
    await settle(900);
    const c1 = await st();
    step('shift+drag pans', Math.hypot(c1.target.x - c0.target.x, c1.target.z - c0.target.z) > 30, { moved: Math.round(Math.hypot(c1.target.x - c0.target.x, c1.target.z - c0.target.z)) });
  }

  if (wanted.has('wheel')) {
    await view('overview');
    await settle(200);
    const a = await st();
    await page.mouse.move(cx + 200, cy + 100);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(40);
    }
    await settle(1200);
    const b = await st();
    step('wheel zooms in towards the cursor', b.distance < a.distance * 0.6 && Math.hypot(b.target.x - a.target.x, b.target.z - a.target.z) > 10, {
      from: Math.round(a.distance),
      to: Math.round(b.distance),
      targetShift: Math.round(Math.hypot(b.target.x - a.target.x, b.target.z - a.target.z)),
    });
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -400);
    await settle(1500);
    const c = await st();
    step('zoom is clamped at the minimum distance', c.distance >= 3.5 && c.distance < 40, { distance: Math.round(c.distance * 10) / 10 });
    for (let i = 0; i < 60; i++) await page.mouse.wheel(0, 400);
    await settle(1800);
    const d = await st();
    step('zoom is clamped at the maximum distance', d.distance <= 752 && d.distance > 600, { distance: Math.round(d.distance) });
  }

  if (wanted.has('keys')) {
    await view({ target: { x: 0, y: 0, z: 0 }, distance: 200, yaw: 0, pitch: 40 });
    await settle(200);
    const a = await st();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW');
    await settle(700);
    const b = await st();
    step('W moves forward (north at yaw 0)', b.target.z < a.target.z - 30, { dz: Math.round(b.target.z - a.target.z), dx: Math.round(b.target.x - a.target.x) });
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyD');
    await settle(600);
    const c = await st();
    step('D moves right (east at yaw 0)', c.target.x > b.target.x + 20, { dx: Math.round(c.target.x - b.target.x) });
    await page.keyboard.down('KeyQ');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyQ');
    await page.keyboard.down('KeyR');
    await page.waitForTimeout(400);
    await page.keyboard.up('KeyR');
    await page.keyboard.down('Minus');
    await page.waitForTimeout(400);
    await page.keyboard.up('Minus');
    await settle(800);
    const d = await st();
    step('Q rotates, R tilts up, - zooms out', d.yaw > c.yaw + 15 && d.pitch > c.pitch + 5 && d.distance > c.distance * 1.2, {
      dyaw: Math.round(d.yaw - c.yaw),
      dpitch: Math.round(d.pitch - c.pitch),
      dist: Math.round(d.distance),
    });
  }

  if (wanted.has('poi')) {
    await page.keyboard.press('Digit2');
    await page.waitForTimeout(400);
    const flying = await page.evaluate(() => window.__city.ctx.services.camera.busy());
    await settle(4200);
    const b = await st();
    const poi = await page.evaluate(() => window.__city.ctx.plan.pois.filter((p) => p.id !== 'overview')[1]);
    step(`key 2 flies to ${poi.id}`, flying && Math.hypot(b.target.x - poi.target.x, b.target.z - poi.target.z) < 3 && Math.abs(b.distance - poi.distance) < 8, {
      target: [Math.round(b.target.x), Math.round(b.target.z)],
      poi: [poi.target.x, poi.target.z],
      dist: Math.round(b.distance),
    });
    await shot('poi2');
    await page.keyboard.press('Digit0');
    await settle(4200);
    const c = await st();
    step('key 0 returns to the overview', Math.abs(c.distance - 560) < 10, { dist: Math.round(c.distance) });
  }

  if (wanted.has('pois')) {
    // every place in turn (number keys, then 0): smooth flights that never pass through a building
    const pois = await page.evaluate(() => window.__city.ctx.plan.pois.map((p) => ({ id: p.id, x: p.target.x, z: p.target.z, d: p.distance })));
    const keys = pois.filter((p) => p.id !== 'overview').slice(0, 9).map((p, i) => [`Digit${i + 1}`, p]);
    keys.push(['Digit0', pois.find((p) => p.id === 'overview')]);
    const res = [];
    let ok = true;
    for (const [k, p] of keys) {
      await page.evaluate(REC_START);
      await page.keyboard.press(k);
      await settle(4900);
      const m = motionStats(await page.evaluate(REC_STOP));
      const s = await st();
      const arrived = Math.hypot(s.target.x - p.x, s.target.z - p.z) < 4 && Math.abs(s.distance - p.d) < 10;
      const good = arrived && m.insideFrames === 0 && m.maxRelDistPerFrame < 0.06;
      ok = ok && good;
      res.push({ poi: p.id, arrived, inside: m.insideFrames, maxRel: m.maxRelDistPerFrame, maxStep: m.maxStepPerFrame });
      await shot(`place_${p.id}`);
    }
    step('number keys fly smoothly to every place, never through a building', ok, res);
  }

  // find something pickable on screen by scanning with the camera's own picker, nearest the screen centre first
  const findPickable = async (kinds, opts = {}) =>
    page.evaluate(
      ({ kinds, w, h, avoid, minId }) => {
        const cam = window.__city.ctx.services.camera;
        const canvas = window.__city.ctx.canvas;
        const pts = [];
        for (let y = 40; y < h - 90; y += 12) for (let x = 30; x < w - 30; x += 12) pts.push([x, y]);
        pts.sort((a, b) => Math.hypot(a[0] - w / 2, a[1] - h / 2) - Math.hypot(b[0] - w / 2, b[1] - h / 2));
        const re = avoid ? new RegExp(avoid, 'i') : null;
        // district flags are pointer-transparent but a click on one flies to the district: avoid them
        const flags = [...document.querySelectorAll('.th-dlabel')].filter((e) => e.style.display === 'block' && parseFloat(e.style.opacity) > 0.2).map((e) => e.querySelector('.th-dl-tag').getBoundingClientRect());
        const onFlag = (x, y) => flags.some((r) => x > r.left - 8 && x < r.right + 8 && y > r.top - 8 && y < r.bottom + 8);
        for (const [x, y] of pts) {
          // only points where the city itself is under the cursor (not a HUD card / label)
          if (document.elementFromPoint(x, y) !== canvas) continue;
          if (document.elementFromPoint(x, y - 14) !== canvas) continue;
          if (onFlag(x, y)) continue;
          const hit = cam.pickAt(x, y);
          if (!hit || (kinds && !kinds.includes(hit.kind)) || hit.id < minId) continue;
          if (re) {
            let lines = [];
            try {
              lines = hit.info();
            } catch {
              lines = [];
            }
            if (re.test(hit.label) || lines.some((l) => re.test(l))) continue;
          }
          window.__th_hit = hit;
          return { x, y, kind: hit.kind, label: hit.label };
        }
        return null;
      },
      { kinds, w: width, h: height, avoid: opts.avoid ?? null, minId: opts.minId ?? 0 },
    );
  // live screen position of the remembered hit (+ whether it is in front of the camera)
  const hitScreen = () =>
    page.evaluate(() => {
      const h = window.__th_hit;
      const cam = window.__city.ctx.camera;
      const v = new cam.position.constructor();
      if (!h || !h.getPosition(v)) return null;
      const w = v.clone();
      v.project(cam);
      return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, front: v.z < 1, dist: w.distanceTo(cam.position) };
    });
  const centred = (p, frac = 0.3) => !!p && p.front && Math.abs(p.x - width / 2) < width * frac && Math.abs(p.y - height / 2) < height * frac;
  const cameraInsideLot = () =>
    page.evaluate(() => {
      const c = window.__city.ctx.camera.position;
      return window.__city.ctx.plan.lots.some((l) => c.x > l.footprint.x0 && c.x < l.footprint.x1 && c.z > l.footprint.z0 && c.z < l.footprint.z1 && c.y < l.height);
    });

  if (wanted.has('follow') || wanted.has('chase')) {
    await view({ target: { x: 0, y: 0, z: 0 }, distance: 260, yaw: 20, pitch: 45 });
    await settle(600);
    // a moving road vehicle that is not about to leave town (the chase test needs it for a few seconds)
    const target = (await findPickable(['bus', 'vehicle'], { avoid: 'Leaving town|tunnel|Parked' })) ?? (await findPickable(['vehicle', 'bus', 'pedestrian', 'boat', 'train']));
    if (!target) step('found a pickable entity on screen', false);
    else {
      // the entity keeps moving: aim at its live screen position
      let tip = null;
      for (let k = 0; k < 6 && !tip; k++) {
        const p = (await hitScreen()) ?? target;
        await page.mouse.move(p.x, p.y);
        await page.waitForTimeout(160);
        tip = await page.evaluate(() => document.querySelector('.th-tooltip.show')?.textContent ?? null);
      }
      step('hover shows a tooltip', !!tip, { tip });
      const p2 = (await hitScreen()) ?? target;
      await page.mouse.click(p2.x, p2.y);
      await settle(2500);
      const m = await mode();
      const card = await page.evaluate(() => ({ shown: !!document.querySelector('.th-info.show'), label: document.querySelector('.th-info-label')?.textContent }));
      const scr = await hitScreen();
      step('click follows the entity + info card, entity framed in the middle', m === 'follow' && card.shown && centred(scr, 0.25), { mode: m, card, picked: target.label, screen: scr && [Math.round(scr.x), Math.round(scr.y)] });
      await shot('follow');
      if (wanted.has('chase')) {
        await page.keyboard.press('KeyC');
        await settle(2500);
        const chasing = await page.evaluate(() => window.__city.ctx.services.camera.chasing());
        const s = await st();
        const scr2 = await hitScreen();
        const following = (await mode()) === 'follow';
        step('C toggles the chase view', chasing && s.pitch < 25 && centred(scr2, 0.35), { chasing, following, pitch: Math.round(s.pitch), dist: Math.round(s.distance), screen: scr2 && [Math.round(scr2.x), Math.round(scr2.y)], picked: target.label });
        await shot('chase');
        await page.keyboard.press('KeyC');
        await settle(1500);
        const back = await page.evaluate(() => window.__city.ctx.services.camera.chasing());
        const s2 = await st();
        step('C again leaves the chase view', !back && s2.pitch >= 20, { pitch: Math.round(s2.pitch) });
      }
      await page.keyboard.press('Escape');
      await settle(500);
      const m2 = await mode();
      const shown = await page.evaluate(() => !!document.querySelector('.th-info.show'));
      step('Esc releases the follow', m2 === 'orbit' && !shown, { mode: m2 });
    }
  }

  if (wanted.has('kinds')) {
    // every kind of moving thing: click → follow, framed in the middle, a useful info card
    const plan = [
      ['vehicle', { target: { x: 0, y: 0, z: -10 }, distance: 150, yaw: 20, pitch: 50 }],
      ['bus', { target: { x: 0, y: 0, z: -10 }, distance: 260, yaw: 20, pitch: 55 }],
      ['pedestrian', { target: { x: 27, y: 0, z: 17 }, distance: 70, yaw: 20, pitch: 50 }],
      ['boat', 'harbor'],
      ['train', 'station'],
    ];
    const res = [];
    let allOk = true;
    for (const [kind, v] of plan) {
      let t = null;
      let card = null;
      let m = null;
      // something else can drift into the click (the balloon over a bus): retry until we follow what we picked
      for (let tries = 0; tries < 3; tries++) {
        t = null;
        for (let attempt = 0; attempt < 5 && !t; attempt++) {
          // buses, trains and boats: centre the view on one the camera's census knows about
          let vv = v;
          if (kind === 'train') {
            // trains run to a timetable: wait (up to ~30 s) for one between the portals
            for (let w = 0; w < 15; w++) {
              const tr = await page.evaluate(() => {
                const c = window.__city.ctx;
                const sim = c.services.rail?.sim;
                const tr = sim?.trains.find((q) => q.cars.every((k) => k.x > c.plan.rail.portalW + 8 && k.x < c.plan.rail.portalE - 8));
                return tr ? { x: tr.cars[Math.floor(tr.cars.length / 2)].x, z: c.plan.rail.z } : null;
              });
              if (tr) {
                vv = { target: { x: tr.x, y: 0, z: tr.z }, distance: 110, yaw: 20, pitch: 45 };
                break;
              }
              await page.waitForTimeout(2000);
            }
          } else if (kind === 'bus' || kind === 'boat') {
            const e = await page.evaluate((k) => {
              const l = window.__city.ctx.services.camera.liveEntities().filter((q) => q.kind === k);
              return l.length ? l[Math.floor(Math.random() * l.length)] : null;
            }, kind);
            if (e) vv = { target: { x: e.x, y: 0, z: e.z }, distance: 110, yaw: 20, pitch: 45 };
          }
          await view(vv);
          await settle(attempt ? 1200 : 500);
          t = await findPickable([kind], { avoid: 'Leaving town|tunnel|Parked' });
        }
        if (!t) break;
        const p = (await hitScreen()) ?? t;
        await page.mouse.click(p.x, p.y);
        await settle(2600);
        m = await mode();
        card = await page.evaluate(() => ({
          kicker: document.querySelector('.th-info.show .th-info-kicker')?.textContent ?? null,
          label: document.querySelector('.th-info.show .th-info-label')?.textContent ?? null,
          lines: [...document.querySelectorAll('.th-info.show .th-info-lines div')].map((e) => e.textContent),
        }));
        if (card.label && t.label.startsWith(card.label.split(' · ')[0])) break;
        await page.keyboard.press('Escape');
        await settle(400);
      }
      if (!t || !card) {
        res.push({ kind, ok: false, why: 'none on screen' });
        allOk = false;
        continue;
      }
      const scr = await hitScreen();
      let ok = m === 'follow' && !!card.label && t.label.startsWith(card.label.split(' · ')[0]) && card.lines.length >= 1 && centred(scr, 0.3);
      if (kind === 'bus') ok = ok && card.lines.some((l) => /next stop|boarding|in service/i.test(l));
      allOk = allOk && ok;
      res.push({ kind, ok, picked: t.label, mode: m, ...card, screen: scr && [Math.round(scr.x), Math.round(scr.y)] });
      await shot(`kind_${kind}`);
      await page.keyboard.press('Escape');
      await settle(400);
    }
    step('cars, buses, people, boats and trains: click follows, framed, with an info card', allOk, res);
  }

  if (wanted.has('building')) {
    if (!has('buildings')) skip('building', 'no buildings module');
    else {
      // "click to take a look" at a downtown tower: framed from outside, never parked on its roof
      await view('downtown');
      await settle(800);
      const t = await findPickable(['building']);
      if (!t) step('found a building on screen', false);
      else {
        await page.mouse.click(t.x, t.y);
        await settle(3200);
        const s = await st();
        const scr = await hitScreen();
        const inside = await cameraInsideLot();
        const kicker = await page.evaluate(() => document.querySelector('.th-info.show .th-info-kicker')?.textContent ?? null);
        const chaseShown = await page.evaluate(() => getComputedStyle(document.querySelector('.th-chase')).display !== 'none');
        step('clicking a building frames it from outside (no roof close-up)', (await mode()) === 'follow' && s.pitch < 60 && s.distance > 30 && !inside && centred(scr, 0.3) && !chaseShown, {
          picked: t.label,
          kicker,
          pitch: Math.round(s.pitch),
          dist: Math.round(s.distance),
          inside,
          chaseShown,
          screen: scr && [Math.round(scr.x), Math.round(scr.y)],
        });
        await shot('building');
        await page.keyboard.press('KeyC');
        await page.waitForTimeout(300);
        const toast = await page.evaluate(() => [...document.querySelectorAll('.th-toast')].map((e) => e.textContent).pop() ?? null);
        step('C on a building gives a clear message (no chase)', !(await page.evaluate(() => window.__city.ctx.services.camera.chasing())) && /chase/i.test(toast ?? ''), { toast });
        await page.keyboard.press('Escape');
        await settle(500);
      }
    }
  }

  if (wanted.has('dbl')) {
    await view({ target: { x: 0, y: 0, z: 0 }, distance: 300, yaw: 0, pitch: 50 });
    await settle(400);
    // (a) open ground (street / park / plaza): flies there
    const g = await page.evaluate(
      ({ w, h }) => {
        const cam = window.__city.ctx.services.camera;
        const canvas = window.__city.ctx.canvas;
        const V = window.__city.ctx.camera.position.constructor;
        const v = new V();
        const pts = [];
        for (let y = 80; y < h - 120; y += 16) for (let x = 60; x < w - 60; x += 16) pts.push([x, y]);
        pts.sort((a, b) => Math.hypot(a[0] - (w / 2 + 160), a[1] - (h / 2 - 60)) - Math.hypot(b[0] - (w / 2 + 160), b[1] - (h / 2 - 60)));
        const flags = [...document.querySelectorAll('.th-dlabel')].filter((e) => e.style.display === 'block' && parseFloat(e.style.opacity) > 0.2).map((e) => e.querySelector('.th-dl-tag').getBoundingClientRect());
        for (const [x, y] of pts) {
          if (document.elementFromPoint(x, y) !== canvas) continue;
          if (flags.some((r) => x > r.left - 8 && x < r.right + 8 && y > r.top - 8 && y < r.bottom + 8)) continue;
          if (cam.pickAt(x, y)) continue;
          if (!cam.surfacePoint(x, y, v) || v.y > 2) continue;
          // also clear of pickables a few pixels around (the two clicks of a double-click)
          if (cam.pickAt(x + 4, y) || cam.pickAt(x - 4, y) || cam.pickAt(x, y + 4) || cam.pickAt(x, y - 4)) continue;
          return { sx: x, sy: y, x: v.x, z: v.z };
        }
        return null;
      },
      { w: width, h: height },
    );
    if (!g) step('double-click flies to the ground point', false, { why: 'no free ground found' });
    else {
      await page.mouse.dblclick(g.sx, g.sy);
      await settle(3500);
      const s = await st();
      step('double-click flies to the ground point', Math.hypot(s.target.x - g.x, s.target.z - g.z) < 4 && (await mode()) === 'orbit', { point: [Math.round(g.x), Math.round(g.z)], target: [Math.round(s.target.x), Math.round(s.target.z)], dist: Math.round(s.distance) });
    }
    // (b) a building or landmark: flies to that building and frames it
    if (has('buildings') || has('landmarks')) {
      await view({ target: { x: 0, y: 0, z: 0 }, distance: 300, yaw: 0, pitch: 50 });
      await settle(400);
      const b = await findPickable(['building', 'landmark']);
      if (!b) step('double-click on a building flies to it', false, { why: 'no building on screen' });
      else {
        const pos = await page.evaluate(() => {
          const v = new (window.__city.ctx.camera.position.constructor)();
          window.__th_hit.getPosition(v);
          return { x: v.x, z: v.z };
        });
        await page.mouse.dblclick(b.x, b.y);
        await settle(3800);
        const s = await st();
        const inside = await cameraInsideLot();
        const scr = await hitScreen();
        step('double-click on a building flies to it', (await mode()) === 'follow' && Math.hypot(s.target.x - pos.x, s.target.z - pos.z) < 3 && !inside && centred(scr, 0.3) && s.pitch < 60, {
          picked: b.label,
          target: [Math.round(s.target.x), Math.round(s.target.z)],
          building: [Math.round(pos.x), Math.round(pos.z)],
          dist: Math.round(s.distance),
          pitch: Math.round(s.pitch),
          inside,
        });
        await shot('dbl_building');
        await page.keyboard.press('Escape');
        await settle(400);
      }
    } else skip('dbl (building)', 'no buildings / landmarks module');
  }

  if (wanted.has('aircraft')) {
    if (!has('ambient-sky')) skip('aircraft', 'no ambient module');
    else {
      // late morning: the balloon and the blimp are up; a commuter flight crosses every 2.2 game hours
      // (passes start at 0.35 + 2.2k h and last 28 s at 1x — set the clock just before each check)
      const res = [];
      let allOk = true;
      for (const kind of ['plane', 'balloon', 'blimp']) {
        await page.evaluate((k) => window.__city.setHours(k === 'plane' ? 11.62 : 11.8), kind);
        await settle(900);
        const p0 = await page.evaluate((k) => window.__city.ctx.services.ambientDebug?.locate(k) ?? null, kind);
        if (!p0 || typeof p0.x !== 'number') {
          res.push({ kind, ok: false, why: 'not flying' });
          allOk = false;
          continue;
        }
        await view({ target: { x: p0.x, y: Math.min(p0.y, 140), z: p0.z }, distance: 320, yaw: 20, pitch: 30 });
        await settle(150);
        // aim at it through its own picker and click its live screen position
        const scr = await page.evaluate((k) => {
          const c = window.__city.ctx;
          const p = c.services.ambientDebug.locate(k);
          const V = c.camera.position.constructor;
          const v = new V(p.x, p.y, p.z);
          const pk = c.pickers.find((q) => q.name === 'ambient-sky');
          v.project(c.camera);
          const sx = (v.x * 0.5 + 0.5) * innerWidth,
            sy = (-v.y * 0.5 + 0.5) * innerHeight;
          const hit = c.services.camera.pickAt(sx, sy);
          if (hit) window.__th_hit = hit;
          return { x: sx, y: sy, hit: hit && hit.label, pk: !!pk };
        }, kind);
        await page.mouse.click(scr.x, scr.y);
        await settle(3500);
        const m = await mode();
        const label = await page.evaluate(() => document.querySelector('.th-info.show .th-info-label')?.textContent ?? null);
        const kicker = await page.evaluate(() => document.querySelector('.th-info.show .th-info-kicker')?.textContent ?? null);
        const live = await hitScreen();
        const s = await st();
        const framed = m === 'follow' && centred(live, 0.25) && live.dist > 25 && live.dist < 260;
        await shot(`air_${kind}`);
        let chase = null;
        if (framed) {
          await page.keyboard.press('KeyC');
          await settle(2600);
          const l2 = await hitScreen();
          chase = { on: await page.evaluate(() => window.__city.ctx.services.camera.chasing()), framed: centred(l2, 0.3), dist: l2 && Math.round(l2.dist) };
          await shot(`air_${kind}_chase`);
        }
        const ok = framed && !!chase?.on && chase.framed;
        allOk = allOk && ok;
        res.push({ kind, ok, clicked: scr.hit, label, kicker, mode: m, screen: live && [Math.round(live.x), Math.round(live.y)], dist: live && Math.round(live.dist), alt: Math.round(s.target.y), pitch: Math.round(s.pitch), chase });
        await page.keyboard.press('Escape');
        await settle(3600);
      }
      const home = await st();
      step('balloon, blimp and plane can be followed and chased, framed in the middle', allOk, res);
      step('letting go of an aircraft glides back to the town', home.target.y < 30 && (await mode()) === 'orbit', { target: [Math.round(home.target.x), Math.round(home.target.y), Math.round(home.target.z)], dist: Math.round(home.distance) });
      await page.evaluate(() => window.__city.setHours(16.25));
    }
  }

  if (wanted.has('tour')) {
    await page.keyboard.press('KeyT');
    await page.waitForTimeout(500);
    const m = await mode();
    await page.waitForTimeout(7000);
    const cap = await page.evaluate(() => document.querySelector('.th-caption.show .th-cap-title')?.textContent ?? null);
    await shot('tour');
    const s1 = await st();
    await page.waitForTimeout(1500);
    const s2 = await st();
    step('T starts the auto-tour (moving, captioned)', m === 'tour' && (Math.abs(s2.yaw - s1.yaw) > 0.5 || Math.hypot(s2.target.x - s1.target.x, s2.target.z - s1.target.z) > 1 || Math.abs(s2.distance - s1.distance) > 1), {
      mode: m,
      caption: cap,
    });
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 30, cy);
    await page.mouse.up();
    await page.waitForTimeout(300);
    step('user input stops the tour', (await mode()) === 'orbit', { mode: await mode() });
  }

  if (wanted.has('help')) {
    await page.click('.th-toolbar [data-tip^="Controls"]');
    await page.waitForTimeout(500);
    const open = await page.evaluate(() => document.querySelector('.th-help-wrap')?.classList.contains('open'));
    await shot('help');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const closed = await page.evaluate(() => !document.querySelector('.th-help-wrap')?.classList.contains('open'));
    step('help opens and Esc closes it', open && closed);
  }

  if (wanted.has('places')) {
    await page.click('.th-toolbar [data-tip^="Places"]');
    await page.waitForTimeout(400);
    await shot('places');
    const items = await page.$$('.th-menu.open button');
    let ok = false;
    if (items.length > 2) {
      await items[2].click();
      await settle(4000);
      const s = await st();
      const poi = await page.evaluate(() => window.__city.ctx.plan.pois[2]);
      ok = Math.hypot(s.target.x - poi.target.x, s.target.z - poi.target.z) < 4;
    }
    step('places menu flies to a POI', ok, { items: items.length });
  }

  if (wanted.has('sound')) {
    await page.click('.th-toolbar [data-tip="Sound on"]');
    await page.waitForTimeout(2500);
    const a = await page.evaluate(() => window.__city.stats().audio);
    step('sound button enables WebAudio', a && a.enabled === 'on' && a.state === 'running', a);
    // the ambience should be audible but gentle at a few spots
    const levels = {};
    for (const v of ['overview', 'park', 'beach', 'downtown']) {
      await view(v);
      await page.waitForTimeout(2200);
      const s = await page.evaluate(() => window.__city.stats().audio);
      levels[v] = s.outRms;
    }
    step('ambient mix is audible and not too loud', Object.values(levels).every((x) => x > 0.002 && x < 0.35), levels);
    await shot('sound');
    await page.click('.th-toolbar [data-tip="Sound off"]');
    await page.waitForTimeout(1200);
    const b = await page.evaluate(() => window.__city.stats().audio);
    step('sound button disables it again', b && b.enabled === 'off', b);
  }

  if (wanted.has('touch')) {
    // real multi-touch through the DevTools protocol
    const cdp = await page.context().newCDPSession(page);
    const touchSeq = async (frames) => {
      for (let i = 0; i < frames.length; i++) {
        const pts = frames[i];
        const type = i === 0 ? 'touchStart' : i === frames.length - 1 ? 'touchEnd' : 'touchMove';
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : pts.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
        await page.waitForTimeout(16);
      }
    };
    await view('overview');
    await settle(300);
    let a = await st();
    const one = [];
    for (let i = 0; i <= 20; i++) one.push([[cx + i * 10, cy]]);
    one.push([[cx + 200, cy]]);
    await touchSeq(one);
    await settle(1200);
    let b = await st();
    const dyaw = ((b.yaw - a.yaw + 540) % 360) - 180;
    step('one-finger drag orbits', dyaw < -20, { dyaw: Math.round(dyaw) });
    a = b;
    const pinch = [];
    for (let i = 0; i <= 20; i++) pinch.push([
      [cx - 40 - i * 8, cy],
      [cx + 40 + i * 8, cy],
    ]);
    pinch.push([
      [cx - 200, cy],
      [cx + 200, cy],
    ]);
    await touchSeq(pinch);
    await settle(1200);
    b = await st();
    step('two-finger pinch zooms in', b.distance < a.distance * 0.5, { from: Math.round(a.distance), to: Math.round(b.distance) });
    a = b;
    const pan = [];
    for (let i = 0; i <= 20; i++) pan.push([
      [cx - 60 + i * 9, cy + 40],
      [cx + 60 + i * 9, cy + 40],
    ]);
    pan.push([
      [cx + 120, cy + 40],
      [cx + 240, cy + 40],
    ]);
    await touchSeq(pan);
    await settle(1000);
    b = await st();
    step('two-finger drag pans', Math.hypot(b.target.x - a.target.x, b.target.z - a.target.z) > 8, { moved: Math.round(Math.hypot(b.target.x - a.target.x, b.target.z - a.target.z)) });
    a = b;
    const twist = [];
    for (let i = 0; i <= 20; i++) {
      const ang = (i / 20) * 0.8;
      twist.push([
        [cx - Math.cos(ang) * 100, cy - Math.sin(ang) * 100],
        [cx + Math.cos(ang) * 100, cy + Math.sin(ang) * 100],
      ]);
    }
    twist.push(twist[twist.length - 1]);
    await touchSeq(twist);
    await settle(1000);
    b = await st();
    const tw = ((b.yaw - a.yaw + 540) % 360) - 180;
    step('two-finger twist rotates', Math.abs(tw) > 20, { dyaw: Math.round(tw) });
    a = b;
    const three = [];
    for (let i = 0; i <= 15; i++) three.push([
      [cx - 80, cy + i * 8],
      [cx, cy + i * 8],
      [cx + 80, cy + i * 8],
    ]);
    three.push(three[three.length - 1]);
    await touchSeq(three);
    await settle(1000);
    b = await st();
    step('three-finger drag tilts', Math.abs(b.pitch - a.pitch) > 8, { dpitch: Math.round(b.pitch - a.pitch) });
  }

  if (wanted.has('voices')) {
    const r = await page.evaluate(async () => {
      const a = window.__city.ctx.services.audio;
      return a && a.selfTest ? await a.selfTest() : null;
    });
    const bad = r ? Object.entries(r).filter(([, v]) => !v.finite || v.peak < 0.005 || v.peak > 1.0) : [['none', null]];
    step('every synthesised voice renders (finite, audible, no clipping)', r && bad.length === 0, r);
  }

  if (wanted.has('time')) {
    const box = await page.locator('.th-time-slider').boundingBox();
    if (box) {
      await page.mouse.move(box.x + 9 + (box.width - 18) * (16.25 / 24), box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 9 + (box.width - 18) * (21.5 / 24), box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      const h = await page.evaluate(() => window.__city.ctx.clock.hours);
      step('time slider scrubs the clock', h > 20.5 && h < 22.5, { hours: Math.round(h * 100) / 100 });
      await shot('night');
      // keyboard must work again after using the slider
      const a = await st();
      await page.keyboard.down('KeyE');
      await page.waitForTimeout(400);
      await page.keyboard.up('KeyE');
      await settle(600);
      const b = await st();
      step('keys work after using the slider', Math.abs(b.yaw - a.yaw) > 5, { dyaw: Math.round(b.yaw - a.yaw) });
      await page.evaluate(() => window.__city.setHours(16.25));
    }
  }

  if (wanted.has('speed')) {
    await page.click('.th-seg button[data-speed="4"]');
    await page.waitForTimeout(200);
    const s4 = await page.evaluate(() => window.__city.ctx.clock.speed);
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    const s0 = await page.evaluate(() => window.__city.ctx.clock.speed);
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    const s4b = await page.evaluate(() => window.__city.ctx.clock.speed);
    await page.keyboard.press('Comma');
    const s2 = await page.evaluate(() => window.__city.ctx.clock.speed);
    await page.click('.th-seg button[data-speed="1"]');
    step('speed buttons, space pause, comma slower', s4 === 4 && s0 === 0 && s4b === 4 && s2 === 2, { s4, s0, s4b, s2 });
  }

  if (wanted.has('labels')) {
    await view('overview');
    await settle(800);
    const n = await page.evaluate(() => [...document.querySelectorAll('.th-dlabel')].filter((e) => e.style.display === 'block' && parseFloat(e.style.opacity) > 0.5).length);
    await page.keyboard.press('KeyL');
    await settle(900);
    const n2 = await page.evaluate(() => [...document.querySelectorAll('.th-dlabel')].filter((e) => e.style.display === 'block' && parseFloat(e.style.opacity) > 0.05).length);
    await page.keyboard.press('KeyL');
    step('district labels show at the overview and toggle with L', n >= 6 && n2 === 0, { visible: n, afterToggle: n2 });
    // flags are pointer-transparent (drags starting on them orbit) but a click on one still flies there
    await settle(900);
    const flag = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.th-dlabel')].filter((e) => e.style.display === 'block' && parseFloat(e.style.opacity) > 0.8);
      const e = els.find((x) => {
        const r = x.querySelector('.th-dl-tag').getBoundingClientRect();
        return r.left > 40 && r.right < innerWidth - 300 && r.top > 120 && r.bottom < innerHeight - 140;
      });
      if (!e) return null;
      const r = e.querySelector('.th-dl-tag').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, name: e.textContent.trim() };
    });
    if (!flag) step('clicking a district flag flies there', false, { why: 'no flag on screen' });
    else {
      const a = await st();
      await page.mouse.move(flag.x, flag.y);
      await page.waitForTimeout(200);
      const tip = await page.evaluate(() => document.querySelector('.th-tooltip.show')?.textContent ?? null);
      await page.mouse.click(flag.x, flag.y);
      await settle(4200);
      const b = await st();
      step('clicking a district flag flies there', b.distance < a.distance * 0.6 && (await mode()) === 'orbit', { flag: flag.name, tip, from: Math.round(a.distance), to: Math.round(b.distance) });
    }
  }

  if (wanted.has('resize')) {
    for (const [w, h] of [
      [1920, 1080],
      [900, 700],
      [640, 800],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(900);
      const inv = await page.evaluate(() => window.__city.invariants());
      await shot(`size_${w}x${h}`);
      step(`layout ok at ${w}x${h}`, !inv.ui, inv.ui ?? null);
    }
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(500);
  }

  if (wanted.has('sweep')) {
    // low orbits past the towers: the arm eases in front of facades — no pops, never inside a building
    const res = [];
    let ok = true;
    for (const [i, v] of [
      [0, { target: { x: -5, y: 2, z: -60 }, distance: 70, yaw: 0, pitch: 12 }],
      [1, { target: { x: 0, y: 0, z: -38 }, distance: 35, yaw: 40, pitch: 15 }],
    ]) {
      await view(v);
      await settle(500);
      await page.evaluate(REC_START);
      await page.keyboard.down('KeyQ');
      for (let k = 0; k < 3; k++) {
        await page.waitForTimeout(1500);
        await shot(`sweep${i}_${k}`);
      }
      await page.keyboard.up('KeyQ');
      await settle(600);
      const m = motionStats(await page.evaluate(REC_STOP));
      // a pop is a discontinuity (big second difference); a brisk but continuous spring pull is fine
      ok = ok && m.maxAccel < 6 && m.maxRelDistPerFrame < 0.15 && m.insideFrames <= 2 && m.maxStepPerFrame < 8;
      res.push(m);
    }
    step('low orbit eases around the towers (no pops, never inside)', ok, res);
  }

  if (wanted.has('tourwatch')) {
    // watch the auto-tour for a while: captions, smoothness (no jump cuts, never inside a building), screenshots
    const n = parseInt(args.frames ?? '12', 10);
    const every = parseInt(args.every ?? '5000', 10);
    await page.evaluate(REC_START);
    await page.evaluate(() => window.__city.ctx.services.camera.startTour());
    const frames = [];
    for (let i = 0; i < n; i++) {
      await page.waitForTimeout(every);
      frames.push(
        await page.evaluate(() => {
          const c = window.__city.ctx.services.camera;
          const s = c.getState();
          return { mode: c.mode(), cap: c.caption()?.title ?? null, d: Math.round(s.distance), yaw: Math.round(s.yaw), pitch: Math.round(s.pitch), t: [Math.round(s.target.x), Math.round(s.target.y), Math.round(s.target.z)] };
        }),
      );
      await shot(`tour_${i}`);
    }
    const m = motionStats(await page.evaluate(REC_STOP));
    step('tour keeps running', frames.every((f) => f.mode === 'tour'), frames);
    // a cut is a big jump relative to the viewing distance (the old yaw-flip bug: 157 m at 203 m = 3.3×), a pop
    // a big second difference (old: 28–167); a long flight legitimately covers >12 m per frame far out
    step('tour is smooth (no jump cuts, never inside a building)', m.maxRelDistPerFrame < 0.3 && m.maxAccel < 20 && m.insideFrames <= 2, m);
  }

  report.invariants = await page.evaluate(() => window.__city.invariants());
  report.frameErrors = await page.evaluate(() => window.__city.frameErrors);
  report.stats = await page.evaluate(() => {
    const s = window.__city.stats();
    return { fps: s.fps, drawCalls: s.drawCalls, camera: s.camera, ui: s.ui, audio: s.audio };
  });
} catch (err) {
  report.harnessError = String(err?.stack ?? err);
} finally {
  if (browser) await browser.close().catch(() => {});
  releaseLock();
}
report.passed = report.steps.filter((s) => s.ok).length;
report.failed = report.steps.filter((s) => !s.ok).map((s) => s.name);
console.log(JSON.stringify(report, null, 2));

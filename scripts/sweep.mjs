#!/usr/bin/env node
// The capture tool of the city sweep (docs/progress/SWEEP.md): every kind of thing from 1, 3 and 10 m and every cell of the
// city at eye height, at noon and 21.5, from one page that stays open. The list comes from scripts/sweep-census.mjs.
//
//   node scripts/sweep.mjs --dry                                       what would be shot, and how much is done
//   node scripts/sweep.mjs --url http://127.0.0.1:5198/ --part objects --ids feat-kiosk,veh-bus    a few kinds
//   node scripts/sweep.mjs --url ... --part squares --box -40,50,-10,90    the cells whose standing point is in x0,z0,x1,z1
//   node scripts/sweep.mjs --url ...                                   everything; run it again to resume
//
//   --part objects|squares|all   --ids a,b (id or prefix)   --box x0,z0,x1,z1   --types walk,rest,far,water
//   --hours 12,21.5   --dists 1,3,10   --night-views 5 (views per cell at night, in the order N,S,down,E,W; thins without losing cells)
//   --settle 26       frames after the camera lands, so temporal AA has come to rest (24 frames) and near detail has arrived
//   --warm 30         seconds at 4× after a boot or an hour change, so that people and traffic are out
//   --tremble cell    a three-frame read-back in one view per cell and hour; `view` every view, `off` none
//   --limit n, --max-minutes m   stop cleanly and give the browser lock back; run again to go on
//   --min-disk 5      stop under this many GB free   --min-battery 25   stop when discharging under this %
//   --q "noxxx"       extra URL parameters   --out shots/sweep   --width 1920 --height 1025   --quality 88
//
// Writes <out>/<part>/<kind or cell>/<hour>_<view>.jpg, an index.jsonl beside them (position, view, hour, draws, triangles),
// <out>/tremble.jsonl and <out>/status.json (done, seconds per image, why it stopped, errors).
// A file that exists counts as done, written whole by a rename, so a crash or a power drop loses one picture.
// The hour is held while the simulation runs, so what moves is seen moving and a moving thing is frozen only for its own shot.
// Exit: 0 finished or stopped at a limit, 1 kept failing, 2 disk, 3 power. Everything is resumable.
//
// In a worktree it takes the main checkout's browser.mjs, so the one browser lock is shared with every session.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[a.slice(2)] = '1';
  else args[a.slice(2)] = process.argv[++i];
}
const list = (s) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const plan = JSON.parse(fs.readFileSync(path.join(here, 'sweep-plan.json'), 'utf8'));
const part = args.part ?? 'all';
const hours = list(args.hours).map(Number);
const HOURS = hours.length ? hours : plan.hours;
const DISTS = list(args.dists).map(Number).length ? list(args.dists).map(Number) : plan.dists;
const ids = list(args.ids);
const box = list(args.box).map(Number);
const types = list(args.types);
const width = parseInt(args.width ?? '1920', 10);
const height = parseInt(args.height ?? '1025', 10);
const settle = parseInt(args.settle ?? '26', 10);
const warm = parseFloat(args.warm ?? '30');
const jpegQ = parseInt(args.quality ?? '88', 10);
const trembleMode = args.tremble ?? 'cell';
const nightViews = parseInt(args['night-views'] ?? '5', 10);
const limit = parseInt(args.limit ?? '0', 10);
const maxMinutes = parseFloat(args['max-minutes'] ?? '0');
const minDisk = parseFloat(args['min-disk'] ?? '5');
const minBattery = parseFloat(args['min-battery'] ?? '25');
const outDir = path.resolve(root, args.out ?? 'shots/sweep');
const base = (args.url ?? 'http://127.0.0.1:5198/').replace(/\/?$/, '/');
// (?handspots only keeps a list of where the scattered things went, for the finders)
// (dry weather throughout: rain changes the whole picture, and who is out; ?weather pins it)
const url = `${base}?${['nointro', 'noidle', 'nofilm', 'adaptive=0', 'quality=high', 'handspots', 'weather=clear', args.q].filter(Boolean).join('&')}`;

const hourTag = (h) => String(h).replace('.', 'h');
const matchId = (id) => !ids.length || ids.some((p) => id === p || id.startsWith(p));
const inBox = (o) => !box.length || (o.x >= box[0] && o.z >= box[1] && o.x <= box[2] && o.z <= box[3]);

// ───────────────────────────────── the jobs: one per picture, in the order of the walk, hour by hour
const LOOK = { N: 0, E: -90, S: 180, W: 90 }; // the side the camera stands on is opposite the way it looks
const VIEW_ORDER = ['N', 'E', 'S', 'W', 'down'];
const NIGHT_ORDER = ['N', 'S', 'down', 'E', 'W'];
const jobs = [];
const wantObjects = part === 'all' || part === 'objects';
const wantSquares = part === 'all' || part === 'squares';
const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
// the two hours first, then the hours only some kinds exist at
const specialHours = [...new Set(plan.kinds.flatMap((k) => k.hours ?? []))].filter((h) => !HOURS.includes(h)).sort((a, b) => a - b);
for (const h of [...HOURS, ...specialHours]) {
  if (wantObjects) {
    for (const k of plan.kinds) {
      if (!matchId(k.id) || !inBox({ x: k.x ?? 0, z: k.z ?? 0 })) continue;
      if (!(k.hours ?? HOURS).includes(h)) continue;
      const add = (view, more) => jobs.push({ part: 'objects', dir: k.id, h, view, kind: k, ...more, file: path.join('objects', k.id, `${hourTag(h)}_${view}.jpg`) });
      if (k.poi) {
        add('poi', {});
        continue;
      }
      if (k.x === undefined && !k.find) continue;
      for (const d of k.dists ?? DISTS) add(`${d}m`, { d });
      if (k.top) {
        // what eye level never sees: the upper floors from across the street, and the roof
        const R = Math.max(15, k.top * 0.6);
        add('up', { d: R, over: { h: k.top * 0.7, R } });
        add('roof', { d: R, over: { h: k.top, R, pitch: 35 } });
      }
    }
  }
  if (wantSquares && HOURS.includes(h)) {
    for (const c of plan.cells) {
      if (!matchId(c.id) || !inBox(c) || (types.length && !types.includes(c.type))) continue;
      if (plan.hoursOf[c.type] && !plan.hoursOf[c.type].includes(h) && !hours.length) continue;
      const all = c.type === 'water' ? [VIEW_ORDER[hash(c.id) % 4]] : VIEW_ORDER;
      // (thinning the night keeps the opposite directions and the ground first)
      const views = h > 19 || h < 5 ? all.slice().sort((a, b) => NIGHT_ORDER.indexOf(a) - NIGHT_ORDER.indexOf(b)).slice(0, nightViews) : all;
      const trembleView = views[hash(c.id) % Math.min(4, views.length)];
      for (const v of views) jobs.push({ part: 'squares', dir: c.id, h, view: v, cell: c, tremble: trembleMode === 'view' || (trembleMode === 'cell' && v === trembleView), file: path.join('squares', c.id, `${hourTag(h)}_${v}.jpg`) });
    }
  }
}
const isDone = (j) => fs.existsSync(path.join(outDir, j.file));
const todo = jobs.filter((j) => !isDone(j));
if (args.dry) {
  const n = (p) => jobs.filter((j) => j.part === p).length;
  console.log(JSON.stringify({ kinds: plan.kinds.length, cells: plan.cells.length, images: jobs.length, objects: n('objects'), squares: n('squares'), done: jobs.length - todo.length, todo: todo.length, url }, null, 1));
  process.exit(0);
}
if (!todo.length) {
  console.log('nothing left to shoot');
  process.exit(0);
}

// ───────────────────────────────── what stops a run
const freeGB = () => {
  const s = fs.statfsSync(outDir);
  return (s.bavail * s.bsize) / 1e9;
};
fs.mkdirSync(outDir, { recursive: true });
// One long-lived PowerShell, as in power-guard.mjs: "Online 0.83" every 20 s. No answer means no reading, never a stop.
let power = { online: true, pct: 100 };
const psPoll =
  process.platform === 'win32'
    ? spawn('powershell', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; while ($true) { $p = [System.Windows.Forms.SystemInformation]::PowerStatus; "$($p.PowerLineStatus) $($p.BatteryLifePercent)"; [Console]::Out.Flush(); Start-Sleep -Seconds 20 }'], { stdio: ['ignore', 'pipe', 'ignore'] })
    : null;
psPoll?.stdout.on('data', (b) => {
  const m = /(\w+) ([\d.,]+)\s*$/.exec(String(b).trim());
  if (m) power = { online: m[1] !== 'Offline', pct: parseFloat(m[2].replace(',', '.')) * 100 };
});
psPoll?.on('error', () => {});
process.on('exit', () => psPoll?.kill());

// ───────────────────────────────── in the page
const installInPage = () => {
  const c = window.__city.ctx;
  if (c.__sweep) return;
  const gl = c.renderer.getContext();
  const s = { lost: false, grab: null };
  c.__sweep = s;
  c.renderer.domElement.addEventListener('webglcontextlost', () => (s.lost = true));
  // Three consecutive frames read back in the task that drew them, with a steady clock, as in flicker.mjs: with two a person
  // walking would count like a tremble; the second difference is 0 for steady motion and large for what reverses or jumps.
  const orig = c.render;
  const update = c.clock.update.bind(c.clock);
  c.clock.update = (dt) => update(s.grab ? 1 / 30 : dt);
  c.render = (dt) => {
    orig(dt);
    s.grab?.();
  };
  s.tremble = () =>
    new Promise((resolve) => {
      const W = gl.drawingBufferWidth,
        H = gl.drawingBufferHeight,
        N = W * H;
      const raw = new Uint8Array(N * 4);
      let a = null,
        b = null,
        seen = 0;
      s.grab = () => {
        c.renderer.state.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, raw);
        const l = new Uint8ClampedArray(N);
        for (let i = 0, j = 0; i < N; i++, j += 4) l[i] = (raw[j] * 54 + raw[j + 1] * 183 + raw[j + 2] * 19 + 128) >> 8;
        if (++seen < 3) {
          a = b;
          b = l;
          return;
        }
        s.grab = null;
        let d2 = 0,
          a8 = 0,
          a24 = 0;
        for (let i = 0; i < N; i++) {
          let e = l[i] - 2 * b[i] + a[i];
          if (e < 0) e = -e;
          d2 += e;
          if (e >= 8) a8++;
          if (e >= 24) a24++;
        }
        resolve({ d2: +((100 * d2) / N).toFixed(1), area8: +((100 * a8) / N).toFixed(2), area24: +((100 * a24) / N).toFixed(2) });
      };
    });
  s.frames = (n, timeoutMs) =>
    new Promise((resolve) => {
      const to = window.__city.frames() + n;
      const t0 = performance.now();
      const tick = () => {
        if (window.__city.frames() >= to || performance.now() - t0 > timeoutMs) resolve(window.__city.frames() - to + n);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  // what a person stands on: the ground, a kerb top, or (from the census) a deck
  s.ground = (x, z) => {
    const sl = c.plan.slab;
    const inSlab = x > sl.x0 && x < sl.x1 && z > sl.z0 && z < sl.z1;
    let g = inSlab && c.services.terrain ? c.services.terrain.height(x, z) : (c.services.landscape?.height?.(x, z) ?? 0);
    if (inSlab && c.occupancy.get(x, z) & 2) g = Math.max(g, 0.15);
    return g;
  };
};

const EYE = 1.6;
const placeCell = ([cell, view]) => {
  const c = window.__city.ctx,
    s = c.__sweep;
  const floor = Math.max(s.ground(cell.x, cell.z), cell.floor ?? -1e9, -1.6);
  const eye = floor + EYE;
  if (view === 'down') {
    // the ground just ahead of the feet
    const yaw = ((cell.x * 7 + cell.z * 13) % 360 + 360) % 360;
    const pitch = 62;
    const dist = EYE / Math.sin((pitch * Math.PI) / 180);
    const run = dist * Math.cos((pitch * Math.PI) / 180);
    const y = (yaw * Math.PI) / 180;
    const pose = { target: { x: cell.x - Math.sin(y) * run, y: floor, z: cell.z - Math.cos(y) * run }, distance: dist, yaw, pitch };
    window.__city.view(pose);
    return { x: cell.x, y: +eye.toFixed(2), z: cell.z, yaw, pitch };
  }
  const yaw = { N: 0, E: -90, S: 180, W: 90 }[view];
  const D = 8; // the pivot ahead sets the focus and the eye-level lens
  const y = (yaw * Math.PI) / 180;
  window.__city.view({ target: { x: cell.x - Math.sin(y) * D, y: eye, z: cell.z - Math.cos(y) * D }, distance: D, yaw, pitch: 0 });
  return { x: cell.x, y: +eye.toFixed(2), z: cell.z, yaw, pitch: 0 };
};

// A thing seen from a distance measured from its surface, from the side it faces if a person could stand there.
const placeObject = ([kind, d, picked, over]) => {
  const c = window.__city.ctx,
    s = c.__sweep;
  const x = picked?.x ?? kind.x,
    z = picked?.z ?? kind.z;
  const baseYaw = picked?.yaw !== undefined ? (picked.yaw * 180) / Math.PI + 25 : (kind.yaw ?? 30);
  const r = kind.r ?? 0;
  const dist = d + r;
  const blocked = (yawDeg) => {
    const y = (yawDeg * Math.PI) / 180;
    for (let t = r + 0.3; t <= dist + 0.01; t += 0.5) {
      const o = c.occupancy.get(x + Math.sin(y) * t, z + Math.cos(y) * t);
      if (o & (4 | 16)) return true;
    }
    return false;
  };
  let yaw = baseYaw;
  for (const off of [0, 35, -35, 70, -70, 110, -110, 145, -145, 180]) {
    if (!blocked(baseYaw + off)) {
      yaw = baseYaw + off;
      break;
    }
  }
  const y = (yaw * Math.PI) / 180;
  const here = Math.max(s.ground(x + Math.sin(y) * dist, z + Math.cos(y) * dist), -1.6);
  const gt = s.ground(x, z);
  const ty = picked?.y ?? gt + (over?.h ?? kind.lookH ?? 1.2);
  const rise = here + EYE - ty;
  let pitch, line;
  if (over) {
    pitch = over.pitch ?? (Math.atan2(rise, over.R) * 180) / Math.PI;
    line = over.R / Math.cos((pitch * Math.PI) / 180);
  } else {
    line = dist;
    pitch = Math.abs(rise) < dist * 0.85 ? (Math.asin(rise / dist) * 180) / Math.PI : rise > 0 ? 58 : -40;
  }
  window.__city.view({ target: { x, y: ty, z }, distance: line, yaw, pitch });
  return { x: +x.toFixed(2), y: +ty.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(1), pitch: +pitch.toFixed(1), dist: +line.toFixed(2) };
};

// A moving or scattered thing: the census gives an expression over `ctx` and a filter; the instance nearest the last one seen is taken.
const findInPage = ([find, near]) => {
  const ctx = window.__city.ctx;
  let items;
  try {
    items = new Function('ctx', `return (${find.expr});`)(ctx);
  } catch (e) {
    return { error: String(e).slice(0, 200) };
  }
  if (!items) return null;
  items = typeof items[Symbol.iterator] === 'function' ? Array.from(items) : [items];
  if (find.filter) {
    try {
      const f = new Function('it', 'ctx', `return (${find.filter});`);
      items = items.filter((it) => f(it, ctx));
    } catch (e) {
      return { error: String(e).slice(0, 200) };
    }
  }
  const get = (it, p) => (p ?? '').split('.').reduce((o, k) => o?.[k], it);
  const num = (it, field, key) => [get(it, field), it[key], it.m?.[key], it.V?.[key], it.position?.[key], it.c?.[key], it.lamp?.[key]].find((v) => typeof v === 'number');
  let best = null,
    bd = Infinity;
  for (const it of items) {
    const x = num(it, find.x, 'x'),
      z = num(it, find.z, 'z');
    if (typeof x !== 'number' || typeof z !== 'number') continue;
    const q = near ? (x - near.x) ** 2 + (z - near.z) ** 2 : 0;
    if (q < bd) {
      bd = q;
      best = { x, z, yaw: num(it, find.yaw, 'yaw'), y: typeof it.y === 'number' && it.y > 3 ? it.y : undefined };
    }
  }
  return best;
};

// ───────────────────────────────── the run
const status = { url, started: new Date().toISOString(), images: jobs.length, doneAtStart: jobs.length - todo.length, shot: 0, secondsPerImage: null, stop: null, failures: [], notFound: {}, consoleErrors: {}, pageErrors: [], frameErrors: [], failedModules: [], restarts: 0 };
const statusFile = path.join(outDir, 'status.json');
const writeStatus = () => {
  status.freeGB = +freeGB().toFixed(1);
  status.power = power;
  fs.writeFileSync(statusFile, JSON.stringify(status, null, 1));
};
const t0 = Date.now();

// (a dynamic import: the lock lives in the main checkout's scripts/, so that a worktree queues with everyone else)
const mainRoot = /^(.*)[\\/]\.claude[\\/]worktrees[\\/]/.exec(root)?.[1];
const harness = process.env.TH_HARNESS ?? (mainRoot ? path.join(mainRoot, 'scripts', 'browser.mjs') : path.join(here, 'browser.mjs'));
const { launchBrowser, acquireLock, releaseLock } = await import(pathToFileURL(harness).href);

const shouldStop = () => {
  if (freeGB() < minDisk) return { why: `disk under ${minDisk} GB`, code: 2 };
  if (!power.online && power.pct < minBattery) return { why: `on battery at ${power.pct.toFixed(0)} %`, code: 3 };
  if (limit && status.shot >= limit) return { why: `limit of ${limit} images`, code: 0 };
  if (maxMinutes && Date.now() - t0 > maxMinutes * 60000) return { why: `limit of ${maxMinutes} minutes`, code: 0 };
  return null;
};

const setHourAndWarm = async (page, h) => {
  await page.evaluate((hh) => {
    const city = window.__city;
    city.ctx.clock.holdTime = false;
    city.setHours(hh);
    city.ctx.clock.holdTime = true;
    city.setSpeed(4);
  }, h);
  // (an hour some kinds keep for themselves is often a scene with a script: it mustn't run past before the shot)
  if (!HOURS.includes(h)) await page.evaluate(() => window.__city.setSpeed(1));
  await page.waitForTimeout((HOURS.includes(h) ? warm : 8) * 1000);
  await page.evaluate(() => window.__city.setSpeed(1));
};

const openPage = async (browser) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const k = m.text().slice(0, 160);
    status.consoleErrors[k] = (status.consoleErrors[k] ?? 0) + 1;
  });
  page.on('pageerror', (e) => status.pageErrors.push(String(e).slice(0, 300)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
  await page.addStyleTag({ content: '#ui{display:none!important}' });
  await page.evaluate(installInPage);
  status.failedModules = await page.evaluate(() => window.__city.failed);
  return page;
};

const shoot = async (page, job, near) => {
  let at;
  let frozen = false;
  if (job.part === 'squares') {
    at = await page.evaluate(placeCell, [job.cell, job.view]);
  } else if (job.kind.poi) {
    at = await page.evaluate((id) => {
      window.__city.view(id);
      return { poi: id };
    }, job.kind.poi);
  } else {
    let picked = null;
    const kind = job.kind;
    const once = `${kind.id}@${job.h}`;
    // what only exists near the camera gets the camera first, and what is set off, its trigger; once per kind and hour
    if (!near.primed.has(once)) {
      near.primed.add(once);
      if (kind.goto) {
        await page.evaluate(placeCell, [{ x: kind.goto[0], z: kind.goto[1] }, 'N']);
        await page.waitForTimeout(3000);
      }
      if (kind.before) {
        await page.evaluate((code) => new Function('ctx', code)(window.__city.ctx), kind.before);
        await page.waitForTimeout((kind.beforeWait ?? 3) * 1000);
      }
    }
    if (kind.find) {
      if (near.absent.has(once)) return null;
      const waitMs = (kind.wait ?? parseFloat(args['find-wait'] ?? '6')) * 1000;
      const t = Date.now();
      if (kind.wait) await page.evaluate(() => window.__city.setSpeed(4));
      for (;;) {
        picked = await page.evaluate(findInPage, [job.kind.find, near.last ?? (job.kind.x !== undefined ? { x: job.kind.x, z: job.kind.z } : null)]);
        if (picked?.error) {
          status.notFound[job.kind.id] = picked.error;
          return null;
        }
        if (picked || Date.now() - t > waitMs) break;
        await page.waitForTimeout(1000);
      }
      if (kind.wait) await page.evaluate(() => window.__city.setSpeed(1));
      if (!picked && kind.x === undefined) {
        status.notFound[once] = kind.find.when ?? 'nothing found';
        near.absent.add(once);
        return null;
      }
      if (picked) {
        near.last = { x: picked.x, z: picked.z };
        // a moving thing holds still for its own picture
        await page.evaluate(() => window.__city.setSpeed(0));
        frozen = true;
      }
    }
    at = await page.evaluate(placeObject, [job.kind, job.d, picked, job.over ?? null]);
  }
  const ran = await page.evaluate((n) => window.__city.ctx.__sweep.frames(n, 8000), settle);
  const tremble = job.tremble ? await page.evaluate(() => window.__city.ctx.__sweep.tremble()) : null;
  const file = path.join(outDir, job.file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const part = `${file}.part`;
  await page.screenshot({ path: part, type: 'jpeg', quality: jpegQ, timeout: 240000 });
  if (frozen) await page.evaluate(() => window.__city.setSpeed(1));
  const check = await page.evaluate(() => {
    const st = window.__city.stats();
    return { lost: window.__city.ctx.__sweep.lost, drawCalls: st.drawCalls, triangles: st.triangles };
  });
  if (check.lost) {
    fs.rmSync(part, { force: true });
    throw new Error('WebGL context lost');
  }
  fs.renameSync(part, file);
  const line = { file: job.file, part: job.part, id: job.dir, view: job.view, h: job.h, ...at, settled: ran, drawCalls: check.drawCalls, triangles: check.triangles, kb: Math.round(fs.statSync(file).size / 1024), tremble: tremble ?? undefined };
  fs.appendFileSync(path.join(path.dirname(file), 'index.jsonl'), JSON.stringify(line) + '\n');
  if (tremble) fs.appendFileSync(path.join(outDir, 'tremble.jsonl'), JSON.stringify({ id: job.dir, view: job.view, h: job.h, x: at.x, z: at.z, ...tremble }) + '\n');
  return line;
};

await acquireLock();
let exitCode = 0;
let queue = todo.slice();
let failStreak = 0;
const near = { last: null, kind: null, primed: new Set(), absent: new Set() };
try {
  while (queue.length && !status.stop) {
    let browser = null;
    try {
      ({ browser } = await launchBrowser());
      const page = await openPage(browser);
      let hourNow = null;
      while (queue.length) {
        const stop = shouldStop();
        if (stop) {
          status.stop = stop.why;
          exitCode = stop.code;
          break;
        }
        const job = queue[0];
        if (job.h !== hourNow) {
          await setHourAndWarm(page, job.h);
          hourNow = job.h;
          near.last = null;
        }
        if (job.part === 'objects' && job.kind !== near.kind) {
          near.kind = job.kind;
          near.last = null;
        }
        const line = await shoot(page, job, near);
        queue.shift();
        failStreak = 0;
        if (!line) continue;
        status.shot++;
        status.secondsPerImage = +((Date.now() - t0) / 1000 / status.shot).toFixed(2);
        if (status.shot % 25 === 0) {
          status.left = queue.length;
          status.etaHours = +((queue.length * status.secondsPerImage) / 3600).toFixed(2);
          writeStatus();
        }
      }
      status.frameErrors = await page.evaluate(() => window.__city.frameErrors).catch(() => status.frameErrors);
    } catch (e) {
      failStreak++;
      status.restarts++;
      status.failures.push({ at: new Date().toISOString(), job: queue[0]?.file, error: String(e?.message ?? e).slice(0, 400) });
      // the same picture failing again and again is left for last, then given up: one bad view doesn't end a night's run
      if (failStreak >= 2 && queue.length > 1) queue.push(queue.shift());
      if (failStreak >= 6) {
        status.stop = 'six failures in a row';
        exitCode = 1;
      }
    } finally {
      await browser?.close().catch(() => {});
    }
  }
} finally {
  releaseLock();
  status.left = queue.length;
  status.finished = new Date().toISOString();
  if (!status.stop && !queue.length) status.stop = 'finished';
  writeStatus();
}
console.log(JSON.stringify({ stop: status.stop, shot: status.shot, left: status.left, secondsPerImage: status.secondsPerImage, restarts: status.restarts, notFound: status.notFound, failedModules: status.failedModules, consoleErrors: Object.keys(status.consoleErrors).length, frameErrors: status.frameErrors.length, freeGB: status.freeGB }, null, 1));
process.exit(exitCode);

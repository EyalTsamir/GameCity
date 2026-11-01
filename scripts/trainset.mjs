#!/usr/bin/env node
// Close-up test set for trains (close-up round): a real train from __city.ctx.services.rail.sim.trains, clock stopped, seen from
// fixed framings at 1 and 3 m: window, door, bogie, cab front, tail lamp, cab side. Same idea as vehset.mjs.
//
//   node scripts/trainset.mjs --url http://127.0.0.1:5229/ --out shots/tr --kind regional --state dwell --shots win1,door1 --hours 12,21.5
//   ... --state dwell     stopped at the platform with the doors open (regional only)      --state any  wherever one is first in view
//   ... --side plat|far   which side of the track the camera stands on                       --q "noxxx" extra URL parameters
//   ... --ab "noxxx"      each picture with its pair                                         --tile 640 --cols 3
// TH_BROWSER_LIB=<path to browser.mjs> shares the browser lock of another checkout. Always Read the sheet it prints.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { launchBrowser, acquireLock, releaseLock } = await import(process.env.TH_BROWSER_LIB ? pathToFileURL(process.env.TH_BROWSER_LIB).href : './browser.mjs');
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[a.slice(2)] = '1';
  else args[a.slice(2)] = process.argv[++i];
}
const list = (s) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
// car: which car (head = leading, tail = last, mid = one between); z, y, x: the point looked at in the car's model frame (x as a
// fraction of the side at 1.45 towards the camera); d: distance; yaw: degrees round it from square-on to the side, + towards the
// model's nose; pitch: degrees. nose: frames from the end of the car rather than its side.
const FRAMES = {
  win1: { car: 'mid', z: -0.95, y: 2.5, x: 1, d: 1.05, yaw: 16, pitch: 2 },
  winup: { car: 'mid', z: 0.95, y: 2.6, x: 1, d: 0.75, yaw: -6, pitch: -6 },
  win3: { car: 'mid', z: -0.95, y: 2.35, x: 1, d: 3.0, yaw: 20, pitch: 3 },
  door1: { car: 'mid', z: 3.125, y: 2.1, x: 1, d: 1.25, yaw: 10, pitch: 2 },
  door3: { car: 'mid', z: 3.125, y: 2.1, x: 1, d: 3.0, yaw: -22, pitch: 3 },
  bogie1: { car: 'mid', z: 5.15, y: 0.72, x: 1, d: 1.15, yaw: 18, pitch: 6 },
  bogie3: { car: 'mid', z: 5.15, y: 0.9, x: 1, d: 3.0, yaw: -24, pitch: 8 },
  wheel: { car: 'mid', z: 6.3, y: 0.5, x: 0.75, d: 0.8, yaw: 24, pitch: 12 },
  body1: { car: 'mid', z: -5.9, y: 1.6, x: 1, d: 1.1, yaw: 18, pitch: 2 },
  cab3: { car: 'head', z: 7.75, y: 2.5, x: 0, d: 3.2, nose: 1, yaw: 24, pitch: 3 },
  cab1: { car: 'head', z: 7.4, y: 2.8, x: 0.18, d: 1.25, nose: 1, yaw: 10, pitch: 0 },
  cabside: { car: 'head', z: 6.95, y: 2.65, x: 1, d: 1.05, yaw: -10, pitch: 2 },
  head1: { car: 'head', z: 7.75, y: 1.6, x: 0.54, d: 0.8, nose: 1, yaw: 20, pitch: 3 },
  tail1: { car: 'tail', z: 7.75, y: 1.6, x: 0.74, d: 0.8, nose: 1, yaw: 20, pitch: 3 },
  // either side of the hand-over: along the platform, looking back at the car (the close level starts at about 18 m in this lens)
  far18: { car: 'mid', z: 0, y: 2.3, x: 1, d: 19, yaw: 72, pitch: 2 },
  far20: { car: 'mid', z: 0, y: 2.3, x: 1, d: 30, yaw: 72, pitch: 2 },
  locoNose: { car: 'head', z: 8.4, y: 2.2, x: 0, d: 3.2, nose: 1, yaw: 24, pitch: 3 },
  locoCab: { car: 'head', z: 8.0, y: 2.9, x: 0.2, d: 1.2, nose: 1, yaw: 10, pitch: 0 },
  locoBogie: { car: 'head', z: 5.2, y: 0.9, x: 1, d: 1.6, yaw: 18, pitch: 6 },
  wagon3: { car: 'mid', z: 0, y: 1.6, x: 1, d: 3.0, yaw: 18, pitch: 3 },
  wagonBogie: { car: 'mid', z: 4.55, y: 0.75, x: 1, d: 1.3, yaw: 18, pitch: 6 },
  wagonTail: { car: 'tail', z: 6.6, y: 1.4, x: 0.75, d: 1.2, nose: 1, yaw: 20, pitch: 3 },
};
const frames = list(args.shots ?? 'win1,win3,door1,door3,bogie1,bogie3,cab3,cab1,head1,tail1');
const hours = list(args.hours ?? '12,21.5').map(Number);
const width = parseInt(args.width ?? '1600', 10);
const height = parseInt(args.height ?? '854', 10);
const tile = parseInt(args.tile ?? '640', 10);
const settle = parseInt(args.settle ?? '350', 10);
const kind = args.kind ?? 'regional';
const state = args.state ?? (kind === 'regional' ? 'dwell' : 'any');
const sideArg = args.side ?? 'plat';
const outDir = path.resolve(args.out ?? 'shots/tr');
fs.mkdirSync(outDir, { recursive: true });
const base = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const urlFor = (extra) => `${base}?${['nointro', 'noidle', 'nofilm', 'adaptive=0', args.q, extra].filter(Boolean).join('&')}`;
const variants = [{ tag: '', url: urlFor('') }];
if (args.ab) variants.push({ tag: '_b', url: urlFor(args.ab) });
const report = { errors: [], shots: [], sheets: [] };

const findTrain = async (page) => {
  const test = ([kind, state]) => {
    const city = window.__city;
    const sim = city.ctx.services.rail?.sim;
    if (!sim) return null;
    for (const tr of sim.trains) {
      if (tr.kind !== kind) continue;
      sim.place(tr);
      const inSight = tr.cars.length > 1 && tr.cars.every((c) => c.visible && c.x - c.half > sim.opt.clipX0 + 2 && c.x + c.half < sim.opt.clipX1 - 2);
      if (!inSight) continue;
      if (state === 'dwell' && !(tr.phase === 'dwell' && tr.doorOpen > 0.95)) continue;
      city.setSpeed(0);
      return { id: tr.id, phase: tr.phase, door: tr.doorOpen, cars: tr.cars.length };
    }
    return null;
  };
  await page.evaluate(() => window.__city.setSpeed(8));
  const t0 = Date.now();
  while (Date.now() - t0 < 400000) {
    const r = await page.evaluate(test, [kind, state]);
    if (r) return r;
    await page.waitForTimeout(120);
  }
  return null;
};

const place = ([fr, sideArg]) => {
  const city = window.__city;
  const c0 = city.ctx;
  const sim = c0.services.rail.sim;
  const tr = sim.trains[0];
  if (!tr) return null;
  sim.place(tr);
  const cars = tr.cars;
  // first = head of the train; a car in between when there is one
  const c = fr.car === 'head' ? cars[0] : fr.car === 'tail' ? cars[cars.length - 1] : cars[Math.floor(cars.length / 2)];
  const rz = c0.plan.rail.z;
  const st = c0.plan.rail.stations[0];
  const platSign = Math.sign((st.platform.z0 + st.platform.z1) / 2 - rz) || 1;
  const camSign = sideArg === 'far' ? -platSign : platSign; // the world z side the camera stands on
  const s = tr.dir * (c.flip ? -1 : 1); // model +Z = world +x when s > 0
  const wx = c.x + s * fr.z;
  let target, yaw;
  if (fr.nose) {
    // from ahead of the car's end: model x maps to world z by (−s)
    target = { x: wx, y: c.y + fr.y, z: rz + camSign * 1.45 * fr.x };
    yaw = (s > 0 ? 90 : -90) + (s > 0 ? 1 : -1) * camSign * -(fr.yaw ?? 0) * -1;
  } else {
    target = { x: wx, y: c.y + fr.y, z: rz + camSign * 1.45 * fr.x };
    yaw = (camSign > 0 ? 0 : 180) + (fr.yaw ?? 0) * s * camSign;
  }
  city.setSpeed(0);
  city.view({ target, distance: fr.d, yaw, pitch: fr.pitch });
  return { x: +wx.toFixed(1), phase: tr.phase, door: tr.doorOpen, seated: !!c.seated, role: c.role, type: c.type, flip: c.flip };
};

await acquireLock();
const { browser } = await launchBrowser();
try {
  for (const variant of variants) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.routeWebSocket(/.*/, () => {});
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon/.test(m.text())) report.errors.push(m.text().slice(0, 400));
    });
    page.on('pageerror', (e) => report.errors.push(String(e?.stack ?? e).slice(0, 500)));
    await page.goto(variant.url, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
    report.failed = await page.evaluate(() => window.__city.failed);
    await page.addStyleTag({ content: '#ui{display:none!important}' });
    await page.waitForTimeout(1500);
    for (const h of hours) {
      await page.evaluate((hh) => window.__city.setHours(hh), h);
      const found = await findTrain(page);
      report.train = found;
      if (!found) {
        report.errors.push(`no ${kind} train (${state}) came within the time limit`);
        continue;
      }
      await page.evaluate((hh) => window.__city.setHours(hh), h);
      for (const f of frames) {
        const at = await page.evaluate(place, [FRAMES[f], sideArg]);
        if (!at) continue;
        await page.waitForTimeout(settle);
        for (let n = 0; n < 3; n++) await page.screenshot({ type: 'jpeg', quality: 1 }).catch(() => {});
        const file = path.join(outDir, `${f}_${String(h).replace('.', 'h')}${variant.tag}.jpg`);
        await page.screenshot({ path: file, type: 'jpeg', quality: 88, timeout: 240000 });
        report.shots.push({ file: path.basename(file), ...at });
      }
    }
    report.frameErrors = await page.evaluate(() => window.__city.frameErrors);
    await page.close();
  }
  const sheetPage = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const cols = parseInt(args.cols ?? String(Math.min(3, frames.length * variants.length)), 10);
  const rows = parseInt(args.rows ?? '3', 10);
  for (const h of hours) {
    const tiles = [];
    for (const f of frames) {
      for (const v of variants) {
        const name = `${f}_${String(h).replace('.', 'h')}${v.tag}.jpg`;
        if (fs.existsSync(path.join(outDir, name))) tiles.push({ label: `${f} ${h}h${v.tag ? ' B' : ''}`, file: path.join(outDir, name) });
      }
    }
    const perPage = cols * rows;
    for (let p = 0; p * perPage < tiles.length; p++) {
      const part = tiles.slice(p * perPage, (p + 1) * perPage).map((t) => ({ label: t.label, url: `data:image/jpeg;base64,${fs.readFileSync(t.file).toString('base64')}` }));
      const b64 = await sheetPage.evaluate(
        async ({ part, tile, cols, aspect }) => {
          const th = Math.round(tile / aspect);
          const nRows = Math.ceil(part.length / cols);
          const c = document.createElement('canvas');
          c.width = cols * tile;
          c.height = nRows * (th + 20);
          const g = c.getContext('2d');
          g.fillStyle = '#111';
          g.fillRect(0, 0, c.width, c.height);
          g.font = '13px sans-serif';
          for (let i = 0; i < part.length; i++) {
            const img = new Image();
            img.src = part[i].url;
            await img.decode();
            const x = (i % cols) * tile,
              y = Math.floor(i / cols) * (th + 20);
            g.drawImage(img, x, y, tile, th);
            g.fillStyle = '#eee';
            g.fillText(part[i].label, x + 6, y + th + 15);
          }
          return c.toDataURL('image/jpeg', 0.86).split(',')[1];
        },
        { part, tile, cols, aspect: width / height },
      );
      const sheet = path.join(outDir, `sheet_${String(h).replace('.', 'h')}_p${p + 1}.jpg`);
      fs.writeFileSync(sheet, Buffer.from(b64, 'base64'));
      report.sheets.push(sheet);
    }
  }
} catch (e) {
  report.harnessError = String(e?.stack ?? e);
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
const { shots, ...brief } = report;
console.log(JSON.stringify({ ...brief, shotCount: shots.length, shots: shots.slice(0, 2) }, null, 1));

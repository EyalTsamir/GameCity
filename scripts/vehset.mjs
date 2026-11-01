#!/usr/bin/env node
// Close-up test set for vehicles (close-up round): one real vehicle of each kind, parked or on the road, seen from fixed
// framings: 3 m three-quarter front and rear, and 1 m at the window, wheel, head lamp, tail lamp, door. Clock stopped.
//
//   node scripts/vehset.mjs --url http://127.0.0.1:5219/ --out shots/veh --kinds sedan,bus --shots win,wheel --hours 12,21.5
//   ... --moving 1     cars on the road instead of parked ones (a driver in the seat)    --q "noxxx" extra URL parameters
//   ... --ab "noxxx"   each picture with its pair, side by side on the sheet             --tile 480 --cols 6
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
const FRAMES = {
  // yaw is relative to the vehicle's nose, side: the camera stands on its left (+X) unless noted; z: along the body in
  // fractions of half its length; y: height looked at; d: distance from the point looked at; pitch: degrees
  front: { yaw: 40, z: 0.2, x: 0, y: 0.75, d: 5.2, pitch: 10 },
  rear: { yaw: 140, z: -0.2, x: 0, y: 0.75, d: 5.2, pitch: 10 },
  win: { yaw: 72, z: 0.12, x: 0.75, y: 1.08, d: 1.15, pitch: 12 },
  screen: { yaw: 18, z: 0.42, x: 0, y: 1.1, d: 1.7, pitch: 14 },
  wheel: { yaw: 70, z: 0.62, x: 1, y: 0.38, d: 1.1, pitch: 18 },
  head: { yaw: 28, z: 1, x: 0.72, y: 0.72, d: 1.0, pitch: 12 },
  tail: { yaw: 155, z: -1, x: 0.72, y: 0.85, d: 1.0, pitch: 10 },
  door: { yaw: 88, z: -0.05, x: 1, y: 0.72, d: 1.2, pitch: 10 },
  mirror: { yaw: 150, z: 0.4, x: 1.1, y: 1.0, d: 0.9, pitch: 6 },
  inside: { yaw: 90, z: 0.1, x: 0.2, y: 0.8, d: 1.1, pitch: 28 },
  under: { yaw: 80, z: 0.0, x: 1, y: 0.12, d: 2.2, pitch: 2 },
};
const kinds = list(args.kinds ?? 'compact,hatch,sedan,suv,estate,mpv,delivery,lorry,bus,icecream');
const frames = list(args.shots ?? 'front,rear,win,screen,wheel,head,tail,door');
const hours = list(args.hours ?? '12,21.5').map(Number);
const width = parseInt(args.width ?? '1920', 10);
const height = parseInt(args.height ?? '1025', 10);
const tile = parseInt(args.tile ?? '480', 10);
const settle = parseInt(args.settle ?? '1100', 10);
const outDir = path.resolve(args.out ?? 'shots/veh');
fs.mkdirSync(outDir, { recursive: true });
const base = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const urlFor = (extra) => `${base}?${['nointro', 'noidle', 'nofilm', 'adaptive=0', args.q, extra].filter(Boolean).join('&')}`;
const variants = [{ tag: '', url: urlFor('') }];
if (args.ab) variants.push({ tag: '_b', url: urlFor(args.ab) });
const report = { errors: [], shots: [], sheets: [] };

const place = ([kind, fr, moving, skip]) => {
  const c = window.__city.ctx;
  const svc = c.services.traffic;
  const fromRoad = (svc.vehicles() ?? []).filter((v) => v.spec?.model === kind && !v.twoWheel);
  const parked = (svc.parked() ?? []).filter((p) => p.model === kind && p.roll === undefined);
  // the moving ones go first when asked for, and they are the only ones of the big kinds
  const pool = moving ? [...fromRoad, ...parked] : [...parked, ...fromRoad];
  // a car with room on the side the camera stands on: nothing else parked within 3.4 m on its left
  const clear = (q) => !parked.concat(svc.parked()).some((o) => o !== q && Math.hypot(o.x - (q.x + Math.cos(q.yaw) * 2.2), o.z - (q.z - Math.sin(q.yaw) * 2.2)) < 2.4);
  const free = moving ? pool : pool.filter(clear);
  const use = free.length ? free : pool;
  const V = use[skip % Math.max(1, use.length)];
  if (!V) return null;
  const len = V.spec?.len ?? { compact: 3.55, hatch: 4, sedan: 4.45, suv: 4.55, estate: 4.7, mpv: 4.5 }[kind] ?? 4.5;
  const hw = (V.spec?.width ?? 1.8) / 2;
  const fx = Math.sin(V.yaw),
    fz = Math.cos(V.yaw),
    rx = Math.cos(V.yaw),
    rz = -Math.sin(V.yaw);
  const az = (fr.z * len) / 2,
    ax = fr.x * hw;
  const x = V.x + fx * az + rx * ax,
    z = V.z + fz * az + rz * ax;
  const tall = (V.spec?.height ?? 1.5) / 1.5;
  window.__city.setSpeed(0);
  window.__city.view({ target: { x, y: fr.y * (fr.z === 1 || fr.z === -1 ? 1 : Math.min(1.8, tall)), z }, distance: fr.d, yaw: (V.yaw * 180) / Math.PI + fr.yaw, pitch: fr.pitch });
  return { x: +V.x.toFixed(1), z: +V.z.toFixed(1), kind, moving: fromRoad.includes(V), seated: !!V.seated };
};

await acquireLock();
const { browser } = await launchBrowser();
try {
  for (const variant of variants) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.routeWebSocket(/.*/, () => {});
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon/.test(m.text())) report.errors.push(m.text().slice(0, 300));
    });
    page.on('pageerror', (e) => report.errors.push(String(e?.stack ?? e).slice(0, 500)));
    await page.goto(variant.url, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
    report.failed = await page.evaluate(() => window.__city.failed);
    await page.addStyleTag({ content: '#ui{display:none!important}' });
    await page.waitForTimeout(2500);
    for (const h of hours) {
      await page.evaluate((hh) => window.__city.setHours(hh), h);
      for (const k of kinds) {
        for (const f of frames) {
          const at = await page.evaluate(place, [k, FRAMES[f], !!args.moving, parseInt(args.skip ?? '0', 10)]);
          if (!at) continue;
          await page.waitForTimeout(settle);
          for (let n = 0; n < 3; n++) await page.screenshot({ type: 'jpeg', quality: 1 }).catch(() => {});
          const file = path.join(outDir, `${k}_${f}_${String(h).replace('.', 'h')}${variant.tag}.jpg`);
          await page.screenshot({ path: file, type: 'jpeg', quality: 90, timeout: 240000 });
          report.shots.push({ file: path.basename(file), ...at });
        }
      }
    }
    report.frameErrors = await page.evaluate(() => window.__city.frameErrors);
    await page.close();
  }
  const sheetPage = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const cols = parseInt(args.cols ?? String(Math.min(6, frames.length * variants.length)), 10);
  const rows = parseInt(args.rows ?? '5', 10);
  for (const h of hours) {
    const tiles = [];
    for (const k of kinds) {
      for (const f of frames) {
        for (const v of variants) {
          const name = `${k}_${f}_${String(h).replace('.', 'h')}${v.tag}.jpg`;
          if (fs.existsSync(path.join(outDir, name))) tiles.push({ label: `${k} ${f} ${h}h${v.tag ? ' B' : ''}`, file: path.join(outDir, name) });
        }
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
          return c.toDataURL('image/jpeg', 0.88).split(',')[1];
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
console.log(JSON.stringify({ ...brief, shotCount: shots.length, shots: shots.slice(0, 3) }, null, 1));

#!/usr/bin/env node
// People up close: portraits of a spread of ordinary passers-by, and frame sequences of people in motion. Always Read the sheets.
//
//   node scripts/peoplelab.mjs --url http://127.0.0.1:5214/ --out shots/lab portraits [--n 24] [--d 1] [--hours 12] [--angle 15] [--q "x"] [--ab "noxxx"] [--cols 6] [--crop 420]
//        one person per picture, chosen for spread (kinds, ages, skin); the same people each run while the seed is the same
//   ... seq --kind walk|side|back|pass|sit [--frames 12] [--step 250] [--speed 0.25] [--d 3] [--pick 5] [--crop 700]
//        a person followed (walk: from the front three-quarter, side, back) or waited for by a still camera at eye height (pass),
//        slowed down so that a stride fills the sheet: judge the motion from the sequence
//   ... hands | feet                 like portraits, framed on the hand / the shoes
//
// Lock: uses the browser lock of TH_SCRIPTS (default: the main checkout's scripts), so all sessions share one browser.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const main = process.env.TH_SCRIPTS ?? 'C:/Projects/GameCity/scripts';
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const bm = fs.existsSync(path.join(main, 'browser.mjs')) ? path.join(main, 'browser.mjs') : path.join(here, 'browser.mjs');
const { launchBrowser, acquireLock, releaseLock } = await import(pathToFileURL(bm).href);

const args = { _: [] };
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
  else args._.push(process.argv[i]);
}
const mode = args._[0] ?? 'portraits';
const base = (args.url ?? 'http://127.0.0.1:5214/').replace(/\/?$/, '/');
const outDir = args.out ?? 'shots/lab';
fs.mkdirSync(outDir, { recursive: true });
const num = (k, d) => (args[k] !== undefined ? parseFloat(args[k]) : d);
const hours = (args.hours ?? '12').split(',').map(Number);
const dists = (args.d ?? (mode === 'seq' ? '3' : '1')).split(',').map(Number);
const urlFor = (extra) => `${base}?${['nointro', 'noidle', 'nofilm', 'adaptive=0', 'quality=high', args.q, extra].filter(Boolean).join('&')}`;
const variants = [{ tag: '', url: urlFor('') }];
if (args.ab) variants.push({ tag: 'B', url: urlFor(args.ab) });

/** in the page: every person on foot, spread over kinds and ages; stable while the seed is */
const pickPeople = ([n, seated]) => {
  const c = window.__city.ctx;
  const all = [];
  for (const p of c.services.pedestrians?._crowd?.parties ?? []) {
    if (p.state === 'gone') continue;
    for (const m of p.members) {
      if (!m.present || m.rideG !== null || m.fade < 0.9) continue;
      if (seated ? m.sit < 0.8 : m.sit > 0.3 || m.lie > 0.1 || m.ground > 0.1) continue;
      all.push(m);
    }
  }
  const key = (m) => `${m.look.kind}|${Math.floor(m.look.age / 15)}`;
  const buckets = new Map();
  for (const m of all) {
    if (!buckets.has(key(m))) buckets.set(key(m), []);
    buckets.get(key(m)).push(m);
  }
  const lists = [...buckets.keys()].sort().map((k) => buckets.get(k));
  const out = [];
  for (let i = 0; out.length < n && i < 200; i++) for (const l of lists) if (i < l.length && out.length < n) out.push(l[i]);
  window.__lab = out;
  return out.map((m) => ({ kind: m.look.kind, age: m.look.age }));
};

const frame = ([i, d, angle, part]) => {
  const c = window.__city.ctx;
  const m = window.__lab[i];
  const L = m.look;
  const h = L.kind === 'child' || L.kind === 'boy' || L.kind === 'girl' ? 1.2 : L.kind === 'woman' ? 1.5 : 1.62;
  const sit = m.sit > 0.5;
  const y = m.y + (part === 'hand' ? 0.82 : part === 'foot' ? 0.12 : (sit ? h - 0.42 : h) * (L.scale ?? 1));
  window.__city.setSpeed(0);
  window.__city.view({ target: { x: m.x, y, z: m.z }, distance: d + 0.1, yaw: (m.yaw * 180) / Math.PI + angle, pitch: part === 'foot' ? 25 : part === 'hand' ? 5 : 2 });
  return { kind: L.kind, age: L.age };
};

const sheetOf = async (browser, files, labels, cols, out, cell = 480) => {
  const pg = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const items = files.map((f) => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64'));
  const b64 = await pg.evaluate(
    async ([items, labels, cols, cell]) => {
      const imgs = await Promise.all(items.map((s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = s; })));
      const w = cell, h = Math.round((cell * imgs[0].height) / imgs[0].width);
      const rows = Math.ceil(imgs.length / cols);
      const cv = document.createElement('canvas');
      cv.width = cols * w;
      cv.height = rows * h;
      const g = cv.getContext('2d');
      g.font = '13px sans-serif';
      imgs.forEach((im, k) => {
        const x = (k % cols) * w, y = Math.floor(k / cols) * h;
        g.drawImage(im, x, y, w, h);
        g.fillStyle = 'rgba(0,0,0,.6)';
        g.fillRect(x, y, g.measureText(labels[k]).width + 8, 17);
        g.fillStyle = '#fff';
        g.fillText(labels[k], x + 4, y + 13);
      });
      return cv.toDataURL('image/png').split(',')[1];
    },
    [items, labels, cols, cell],
  );
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  await pg.close();
  console.log(out);
};

await acquireLock();
const { browser } = await launchBrowser();
try {
  const shots = [];
  for (const variant of variants) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1025 }, deviceScaleFactor: 1 });
    await page.routeWebSocket(/.*/, () => {});
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/D3D|compile/i.test(m.text())) errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(String(e?.stack ?? e)));
    await page.goto(variant.url, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
    await page.addStyleTag({ content: '#ui{display:none!important}' });
    await page.waitForTimeout(3000);
    const crop = num('crop', mode === 'seq' ? 700 : 420);
    const clip = { x: 960 - crop / 2, y: 512 - crop / 2, width: crop, height: crop };
    if (args.eval) console.log(await page.evaluate(args.eval));
    if (mode === 'seq') {
      for (const h of hours) {
        await page.evaluate((hh) => window.__city.setHours(hh), h);
        await page.waitForTimeout(500);
        const kind = args.kind ?? 'walk';
        const people = await page.evaluate(pickPeople, [num('n', 16), kind === 'sit']);
        const who = num('pick', 3) % people.length;
        const angle = kind === 'side' ? 90 : kind === 'back' ? 170 : 25;
        const d = dists[0];
        await page.evaluate(([sp]) => window.__city.setSpeed(sp), [num('speed', 0.25)]);
        const place = ([i, d, angle, kind, st]) => {
          const m = window.__lab[i];
          if (kind === 'pass') {
            // still camera on the walker's path, a little to its side, at a walker's eye height
            if (!window.__passAt) {
              const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
              window.__passAt = { x: m.x + fx * 5 + fz * 0.9, z: m.z + fz * 5 - fx * 0.9, ty: m.y + 1.6 };
              window.__passYaw = (m.yaw * 180) / Math.PI;
            }
            const a = window.__passAt;
            // the camera turns to keep the walker's head in the picture, as an eye would
            const dx = a.x - m.x, dz = a.z - m.z;
            const dd = Math.max(0.6, Math.hypot(dx, dz));
            window.__city.view({ target: { x: m.x, y: m.y + 1.5, z: m.z }, distance: dd, yaw: (Math.atan2(dx, dz) * 180) / Math.PI, pitch: 2 });
          } else {
            window.__city.view({ target: { x: m.x, y: m.y + st, z: m.z }, distance: d, yaw: (m.yaw * 180) / Math.PI + angle, pitch: 4 });
          }
          return { x: m.x, z: m.z, sp: m.speed };
        };
        const n = num('frames', 12);
        const stand = num('ty', d >= 2.5 ? 0.95 : 1.45);
        const files = [], labels = [];
        for (let k = 0; k < n; k++) {
          const at = await page.evaluate(place, [who, d, angle, kind, stand]);
          for (let j = 0; j < 2; j++) await page.screenshot({ type: 'jpeg', quality: 1 }).catch(() => {});
          await page.evaluate(place, [who, d, angle, kind, stand]);
          const f = path.join(outDir, `seq_${kind}_${String(h).replace('.', 'h')}${variant.tag}_${String(k).padStart(2, '0')}.jpg`);
          await page.screenshot({ path: f, type: 'jpeg', quality: 86, clip, timeout: 240000 });
          files.push(f);
          labels.push(`${variant.tag}${k} ${people[who].kind} ${people[who].age} v=${(at.sp ?? 0).toFixed(2)}`);
          await page.waitForTimeout(num('step', 250));
        }
        await sheetOf(browser, files, labels, num('cols', 6), path.join(outDir, `seq_${kind}_${String(h).replace('.', 'h')}${variant.tag}.png`), num('cell', 320));
      }
    } else {
      const part = mode === 'hands' ? 'hand' : mode === 'feet' ? 'foot' : 'face';
      for (const h of hours) {
        await page.evaluate((hh) => window.__city.setHours(hh), h);
        await page.waitForTimeout(800);
        const people = await page.evaluate(pickPeople, [num('n', 24), args.seated !== undefined]);
        for (const d of dists) {
          for (let i = 0; i < people.length; i++) {
            const who = await page.evaluate(frame, [i, d, num('angle', 15), part]);
            await page.waitForTimeout(120);
            for (let k = 0; k < 3; k++) await page.screenshot({ type: 'jpeg', quality: 1 }).catch(() => {});
            const f = path.join(outDir, `${mode}_${i}_${d}m_${String(h).replace('.', 'h')}${variant.tag}.jpg`);
            await page.screenshot({ path: f, type: 'jpeg', quality: 90, clip, timeout: 240000 });
            shots.push({ f, label: `${variant.tag}${i} ${who.kind} ${who.age} ${d}m ${h}h`, key: `${h}_${d}`, v: variant.tag });
          }
        }
      }
    }
    const fe = await page.evaluate(() => window.__city.frameErrors);
    if (errs.length || fe.length) console.log('ERRORS', errs.slice(0, 6), fe.slice(0, 4));
    await page.close();
  }
  if (mode !== 'seq') {
    for (const key of new Set(shots.map((s) => s.key))) {
      let list = shots.filter((s) => s.key === key);
      if (args.ab) {
        // each picture beside its pair
        const a = list.filter((s) => !s.v), b = list.filter((s) => s.v);
        list = a.flatMap((s, i) => (b[i] ? [s, b[i]] : [s]));
      }
      const cols = num('cols', 6);
      const per = cols * num('rows', 4);
      for (let p = 0; p * per < list.length; p++) {
        const pg = list.slice(p * per, (p + 1) * per);
        await sheetOf(browser, pg.map((s) => s.f), pg.map((s) => s.label), cols, path.join(outDir, `${mode}_${key.replace('.', 'h')}_p${p + 1}.png`), num('cell', 320));
      }
    }
  }
} finally {
  await browser.close();
  releaseLock();
}

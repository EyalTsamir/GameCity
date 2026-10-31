#!/usr/bin/env node
// The close-up test set (close-up round): fixed ordinary viewpoints all over the city (scripts/closeset-views.json), seen
// from about 1, 3 and 10 m at the eye height of someone standing there, at noon, 18.2 and 21.5, in one page load, with
// contact sheets. Everyone in the round judges with this. Always Read the sheets it prints.
//
//   node scripts/closeset.mjs --url http://127.0.0.1:5211/ --out shots/close            everything (about 350 shots, 15 min)
//   ... --area walls,doors        only these areas: walls doors shops ground furniture trees vehicles people rail water country
//   ... --ids wall-tower,furn-bin only these viewpoints (a prefix works: --ids wall)
//   ... --d 3 --hours 12          fewer distances and hours (start here: 40 shots, 2 min)
//   ... --q "noxxx"               extra URL parameters
//   ... --ab "noxxx"              A/B: a second page load with these parameters, the pair side by side on the sheets
//   ... --lens 4                  magnify ×4 and stand 4× further off: the same picture size as without, so it should look the same
//   ... --width 1920 --height 1025 --tile 480 --cols 4 --rows 5 --settle 500 --stats 1
//   ... --list                    print the viewpoints and leave
//
// Writes <out>/<id>_<d>m_<hour>[_b].jpg, <out>/sheet_<hour>_p<n>.png (one row per viewpoint, the distances side by side)
// and <out>/report.json (triangles and draws per shot, what the bubble holds, console errors, frame errors).
// Shots are taken with the clock stopped, UI hidden, adaptive quality off, opening glide off. A person or car viewpoint
// picks the one nearest its anchor at that moment. To add or move a viewpoint edit the JSON: x, z, the height of the
// point looked at (`y` absolute, or `h` above the ground), `yaw` the side the camera stands on (0 = +Z, 90 = +X).

import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[a.slice(2)] = '1';
  else args[a.slice(2)] = process.argv[++i];
}
const all = JSON.parse(fs.readFileSync(path.join(here, 'closeset-views.json'), 'utf8'));
const list = (s) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const ids = list(args.ids),
  areas = list(args.area);
const views = all.filter((v) => (!areas.length || areas.includes(v.area)) && (!ids.length || ids.some((p) => v.id === p || v.id.startsWith(p))));
if (args.list) {
  for (const v of views) console.log(`${v.id.padEnd(18)} ${v.area.padEnd(10)} ${v.x},${v.z} yaw ${v.yaw}${v.dyn ? ` (nearest ${v.dyn})` : ''}`);
  process.exit(0);
}
if (!views.length) {
  console.error('no viewpoint matches');
  process.exit(1);
}
const dists = list(args.d ?? '1,3,10').map(Number);
const hours = list(args.hours ?? '12,18.2,21.5').map(Number);
const width = parseInt(args.width ?? '1920', 10);
const height = parseInt(args.height ?? '1025', 10);
const tile = parseInt(args.tile ?? '480', 10);
const settle = parseInt(args.settle ?? '500', 10);
const lens = parseFloat(args.lens ?? '1');
const outDir = path.resolve(args.out ?? 'shots/close');
fs.mkdirSync(outDir, { recursive: true });
const base = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const urlFor = (extra) => `${base}?${['nointro', 'noidle', 'nofilm', 'adaptive=0', args.q, extra].filter(Boolean).join('&')}`;
const variants = [{ tag: '', url: urlFor('') }];
if (args.ab) variants.push({ tag: '_b', url: urlFor(args.ab) });

const report = { views: views.length, dists, hours, lens, variants: variants.map((v) => v.url), consoleErrors: [], pageErrors: [], frameErrors: [], shots: [], sheets: [] };

// Where the camera goes: the point looked at, and from which side and height at this distance.
const placeInPage = ([v, d, lensK]) => {
  const c = window.__city.ctx;
  let { x, z, yaw } = v;
  let ty = v.y;
  const ground = (px, pz) => {
    const land = c.services.landscape;
    const inSlab = px > c.plan.slab.x0 && px < c.plan.slab.x1 && pz > c.plan.slab.z0 && pz < c.plan.slab.z1;
    if (inSlab && c.services.terrain) return c.services.terrain.height(px, pz);
    return land?.height ? land.height(px, pz) : 0;
  };
  let picked = null;
  if (v.dyn === 'person') {
    let best = 1e18;
    for (const p of c.services.pedestrians?._crowd?.parties ?? []) {
      if (p.state === 'gone') continue;
      for (const m of p.members) {
        if (!m.present || m.rideG !== null) continue;
        const q = (m.x - x) ** 2 + (m.z - z) ** 2;
        if (q < best) {
          best = q;
          picked = m;
        }
      }
    }
    if (picked) {
      x = picked.x;
      z = picked.z;
      yaw = (picked.yaw * 180) / Math.PI + v.yaw + 20;
      ty = ground(x, z) + 0.12 + (picked.sit > 0.5 ? 1.05 : 1.5);
    }
  } else if (v.dyn === 'car' || v.dyn === 'parked') {
    const cars = v.dyn === 'car' ? (c.services.traffic?.vehicles?.() ?? []) : (c.services.traffic?.parked?.() ?? []).filter((q) => q.roll === undefined);
    let best = 1e18;
    for (const V of cars) {
      const q = (V.x - x) ** 2 + (V.z - z) ** 2;
      if (q < best) {
        best = q;
        picked = V;
      }
    }
    if (picked) {
      x = picked.x;
      z = picked.z;
      yaw = (picked.yaw * 180) / Math.PI + v.yaw + 35;
      ty = 0.8;
    }
  }
  if (ty === undefined) ty = ground(x, z) + (v.h ?? 0);
  const EYE = 1.6;
  const rise = ground(x, z) + EYE - ty;
  // (a person or a car: the distance is from its surface, not from its middle)
  const dist = (d + (picked ? (v.dyn === 'person' ? 0.25 : (picked.len ?? 4.2) * 0.5) : 0)) * lensK;
  // the eye of someone standing there, or looking down when the point is closer than the eye is high
  const arm = dist / lensK;
  const pitch = Math.abs(rise) < arm * 0.85 ? (Math.asin(rise / arm) * 180) / Math.PI : rise > 0 ? 58 : -40;
  window.__city.setSpeed(0);
  window.__city.view({ target: { x, y: ty, z }, distance: dist, yaw, pitch });
  if (lensK !== 1) c.services.camera?.setLens?.(lensK, 0);
  return { x: +x.toFixed(1), z: +z.toFixed(1), yaw: +(+yaw).toFixed(1), pitch: +pitch.toFixed(1) };
};

await acquireLock();
const { browser, software } = await launchBrowser();
report.softwareGL = software;
try {
  for (const variant of variants) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.routeWebSocket(/.*/, () => {});
    page.on('console', (m) => {
      if (m.type() === 'error') report.consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => report.pageErrors.push(String(e?.stack ?? e)));
    await page.goto(variant.url, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
    report.failedModules = await page.evaluate(() => window.__city.failed);
    await page.addStyleTag({ content: '#ui{display:none!important}' });
    await page.waitForTimeout(3000);
    for (const h of hours) {
      await page.evaluate((hh) => window.__city.setHours(hh), h);
      for (const v of views) {
        for (const d of dists) {
          const at = await page.evaluate(placeInPage, [v, d, lens]);
          await page.waitForTimeout(settle);
          // headless Chrome draws only for a screenshot: throw-away frames so what is selected a frame late has arrived
          for (let k = 0; k < 4; k++) await page.screenshot({ type: 'jpeg', quality: 1 }).catch(() => {});
          const file = path.join(outDir, `${v.id}_${d}m_${String(h).replace('.', 'h')}${variant.tag}.jpg`);
          await page.screenshot({ path: file, type: 'jpeg', quality: 88, timeout: 240000 });
          const s = await page.evaluate(() => {
            const st = window.__city.stats();
            return { drawCalls: st.drawCalls, triangles: st.triangles, near: st.near };
          });
          report.shots.push({ id: v.id, d, h, variant: variant.tag, file: path.basename(file), at, drawCalls: s.drawCalls, triangles: s.triangles, near: args.stats ? s.near : undefined });
        }
      }
    }
    report.frameErrors.push(...(await page.evaluate(() => window.__city.frameErrors)));
    report.invariants = await page.evaluate(() => window.__city.invariants());
    await page.close();
  }

  // the sheets: a row per viewpoint, the distances side by side (with --ab each picture and its pair), a page per hour
  const sheetPage = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const inRow = dists.length * variants.length;
  const cols = Math.max(1, parseInt(args.cols ?? String(inRow === 1 ? 4 : inRow), 10));
  const rows = parseInt(args.rows ?? '6', 10);
  for (const h of hours) {
    const tiles = [];
    for (const v of views) {
      for (const d of dists) {
        for (const variant of variants) {
          const name = `${v.id}_${d}m_${String(h).replace('.', 'h')}${variant.tag}.jpg`;
          tiles.push({ label: `${v.id}  ${d}m  ${h}h${variant.tag ? '  B' : ''}`, file: path.join(outDir, name) });
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
          return c.toDataURL('image/png').split(',')[1];
        },
        { part, tile, cols, aspect: width / height },
      );
      const sheet = path.join(outDir, `sheet_${String(h).replace('.', 'h')}_p${p + 1}.png`);
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
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
const { shots, ...brief } = report;
console.log(JSON.stringify({ ...brief, shotCount: shots.length }, null, 1));

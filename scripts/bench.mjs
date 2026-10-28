#!/usr/bin/env node
// The object bench: close-up captures of object classes at several distances in ONE page load.
//
//   node scripts/bench.mjs [--classes house,bench,car,...|all] [--dists 3,10,40] [--hours 11] [--q "extra"]
//                          [--out shots/bench] [--width 1280 --height 720] [--settle 1500] [--pick 0] [--nodof 1]
//                          [--sheet 1] [--cols 3] [--tile 560] [--yaw 18 (offset from the front)] [--pitch deg]
//                          [--yaws 0,150 (extra views per distance, added to --yaw)]
//
// Each class is located from the plan (lots, street slots, features) or, for moving things (car, bus,
// pedestrian, train, boat), by ray-picking from a few elevated poses; the sim is paused while it is shot.
// `--pick n` uses the n-th instance found (variation checks). The camera faces the object's front.
// Writes <out>/<class>_<dist>m.png, <out>/sheet_<n>.png (6 classes each) (rows = classes, cols = distances) and <out>/report.json.
// Prints a terse summary. Keep runs under ~4 minutes inside an agent (≈ 10–14 classes × 3 distances).

import { launchBrowser, acquireLock, releaseLock } from './browser.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i];
}
const ALL = [
  'house', 'townhouse', 'apartment', 'office', 'tower', 'shop', 'warehouse', 'factory', 'church', 'school',
  'lamp', 'tree', 'bench', 'bin', 'hydrant', 'busstop', 'bikerack', 'planter', 'mailbox', 'phonebox', 'newsstand',
  'fountain', 'statue', 'gazebo', 'playground', 'kiosk', 'marketstall', 'umbrellas', 'picnic', 'flagpole', 'jetty',
  'car', 'bus', 'pedestrian', 'train', 'boat',
  // close-ups of street hardscape (W5): trunk / post foot, kerb line, garden borders, signs and signals
  'treebase', 'lampbase', 'kerb', 'fence', 'hedge', 'wall', 'sign', 'signal', 'junction', 'parktree',
];
const classes = !args.classes || args.classes === 'all' ? ALL : args.classes.split(',');
const dists = (args.dists ?? '3,10,40').split(',').map(Number);
const hours = Number(args.hours ?? 11);
// extra yaw offsets (deg) per capture, e.g. --yaws 0,120,200 to see the front / the other side
const yaws = (args.yaws ?? '0').split(',').map(Number);
const outDir = path.resolve(root, args.out ?? 'shots/bench');
fs.mkdirSync(outDir, { recursive: true });
const width = parseInt(args.width ?? '1280', 10);
const height = parseInt(args.height ?? '720', 10);
const settle = parseInt(args.settle ?? '1500', 10);
const pickIdx = parseInt(args.pick ?? '0', 10);
const yawOff = parseFloat(args.yaw ?? '18');
const pitchOv = args.pitch !== undefined ? parseFloat(args.pitch) : null;
let url = args.url ?? 'http://127.0.0.1:5173/';
url += (url.includes('?') ? '&' : '?') + 'nointro&noidle' + (args.q ? '&' + args.q : '');

const report = { url, consoleErrors: [], pageErrors: [], missing: [], captures: [] };
const t0 = Date.now();
await acquireLock();
const { browser, software } = await launchBrowser();
report.softwareGL = software;
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  await page.addInitScript((p) => (window.__benchThree = p), path.join(root, 'node_modules/three/build/three.module.js'));
  page.on('console', (m) => m.type() === 'error' && report.consoleErrors.push(m.text()));
  page.on('pageerror', (e) => report.pageErrors.push(String(e?.stack ?? e)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city && window.__city.ready && window.__city.frames() > 3, null, { timeout: 300000, polling: 250 });
  await page.addStyleTag({ content: '#ui{display:none!important}' });
  report.failedModules = await page.evaluate(() => window.__city.failed);
  // --nodof: judge surfaces sharp at 2 m (the world-mode lens blurs close-ups)
  if (args.nodof) await page.evaluate(() => window.__city.ctx.services.postfx?.setEnabled?.('dof', false));
  await page.evaluate((h) => window.__city.setHours(h), hours);
  await page.waitForTimeout(2500);

  for (const cls of classes) {
    // locate: returns {x,y,z,yaw(deg),h(object height)} or null
    const loc = await page.evaluate(
      async ([cls, k]) => {
        const c = window.__city, plan = c.ctx.plan;
        const gy = (x, z) => c.ctx.services.terrain?.height?.(x, z) ?? plan.heightAt(x, z);
        const YAW = { N: 180, E: 90, S: 0, W: -90 };
        const VEC = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
        const nth = (arr) => arr.length ? arr[Math.min(k, arr.length - 1)] : null;
        const lotKinds = { house: 'house', townhouse: 'townhouse', apartment: 'apartment', office: 'office', tower: 'tower', warehouse: 'warehouse', factory: 'factory', church: 'church', school: 'school' };
        if (lotKinds[cls] || cls === 'shop') {
          const lots = plan.lots.filter((l) => (cls === 'shop' ? l.shopfront : l.kind === lotKinds[cls]));
          const l = nth(lots);
          if (!l) return null;
          const f = l.footprint, [vx, vz] = VEC[l.front];
          const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
          const hx = (f.x1 - f.x0) / 2, hz = (f.z1 - f.z0) / 2;
          const x = cx + vx * hx, z = cz + vz * hz;
          return { x, y: gy(x, z), z, yaw: YAW[l.front], h: l.height, w: Math.max(hx, hz) * 2 };
        }
        if (cls === 'treebase' || cls === 'lampbase' || cls === 'kerb') {
          const kind = cls === 'treebase' ? 'tree' : 'lamp';
          const s = nth(plan.slots.filter((s) => s.kind === kind).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)));
          if (!s) return null;
          const yaw = (s.yaw * 180) / Math.PI;
          if (cls !== 'kerb') return { x: s.x, y: gy(s.x, s.z), z: s.z, yaw: yaw + 25, h: 1, w: 1, pitch: 22 };
          // the kerb line in front of the slot (the slot's local -Z faces the road), seen from the road
          const x = s.x - Math.sin(s.yaw) * 0.45, z = s.z - Math.cos(s.yaw) * 0.45;
          return { x, y: gy(x, z), z, yaw: yaw + 180 + 40, h: 0.3, w: 0.6, pitch: 26 };
        }
        if (cls === 'fence' || cls === 'hedge' || cls === 'wall') {
          const style = cls === 'fence' ? 'picket' : cls;
          const { getLayout } = await import('/src/world/props/layout.ts');
          const bs = getLayout(c.ctx).borders.filter((b) => b.style === style && b.street && Math.hypot(b.bx - b.ax, b.bz - b.az) > 3);
          const b = nth(bs.sort((p, q) => Math.hypot(p.ax, p.az) - Math.hypot(q.ax, q.az)));
          if (!b) return null;
          const t = b.gateA ? 0.15 : b.gateB ? 0.85 : 0.5;
          const x = b.ax + (b.bx - b.ax) * t, z = b.az + (b.bz - b.az) * t;
          // both normals are tried by the line-of-sight swing; start 35° off the perpendicular
          const yaw = (Math.atan2(b.bz - b.az, -(b.bx - b.ax)) * 180) / Math.PI;
          return { x, y: gy(x, z), z, yaw: yaw + 35, h: 1, w: 1.2 };
        }
        if (cls === 'parktree') {
          // a lawn tree with a trodden patch at its foot (vegetation service trees[].worn)
          const t = nth((c.ctx.services.vegetation?.trees ?? []).filter((t) => t.worn).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)));
          if (!t) return null;
          return { x: t.x, y: gy(t.x, t.z), z: t.z, yaw: 20, h: 1, w: 1, pitch: 24 };
        }
        if (cls === 'junction') {
          // the centre manhole and the road surface of a signalised junction, looked down at
          const I = nth(c.ctx.roads.intersections.filter((I) => I.control === 'signal').sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)));
          if (!I) return null;
          return { x: I.x, y: gy(I.x, I.z), z: I.z, yaw: 30, h: 0.2, w: 1.5, pitch: 50 };
        }
        if (cls === 'sign' || cls === 'signal') {
          const heads = c.ctx.roads.intersections.flatMap((I) => (cls === 'sign' ? I.stopSigns : I.signals));
          const s = nth(heads.slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)));
          if (!s) return null;
          return { x: s.x, y: gy(s.x, s.z), z: s.z, yaw: (s.yaw * 180) / Math.PI + 30, h: cls === 'sign' ? 2.6 : 5.6, w: 0.8 };
        }
        const slotKinds = ['lamp', 'tree', 'bench', 'bin', 'hydrant', 'busstop', 'bikerack', 'planter', 'mailbox', 'phonebox', 'newsstand'];
        if (slotKinds.includes(cls)) {
          // prefer instances near the city centre (more context in frame)
          const s = nth(plan.slots.filter((s) => s.kind === cls).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)));
          if (!s) return null;
          const H = { lamp: 5, tree: 7, bench: 0.9, bin: 1, hydrant: 0.8, busstop: 2.6, bikerack: 0.9, planter: 1, mailbox: 1.3, phonebox: 2.4, newsstand: 2.4 }[cls];
          const W = { lamp: 1, tree: 2, busstop: 3.2, bikerack: 2, newsstand: 2.4, phonebox: 1.2, bench: 1.9, planter: 1.6 }[cls] ?? 1;
          return { x: s.x, y: gy(s.x, s.z), z: s.z, yaw: (s.yaw * 180) / Math.PI, h: H, w: W };
        }
        const featKinds = ['fountain', 'statue', 'gazebo', 'playground', 'kiosk', 'marketstall', 'umbrellas', 'picnic', 'flagpole', 'jetty'];
        if (featKinds.includes(cls)) {
          const f = nth(plan.features.filter((f) => f.kind === cls));
          if (!f) return null;
          return { x: f.x, y: gy(f.x, f.z), z: f.z, yaw: (f.yaw * 180) / Math.PI, h: Math.max(1.5, Math.min(f.radius, 6)), w: f.radius * 2 };
        }
        // moving things: ray-pick from elevated poses over the city
        const kind = { car: 'vehicle', bus: 'bus', pedestrian: 'pedestrian', train: 'train', boat: 'boat' }[cls];
        if (!kind) return null;
        const THREE = await import('/@fs' + window.__benchThree);
        const cam = c.ctx.camera;
        const poses = ['downtown', 'oldtown', 'station', 'harbor', 'riverside', 'park', 'westbrook', 'beach'];
        const hits = [];
        const ray = new THREE.Ray();
        for (const p of poses) {
          c.view(p);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          cam.updateMatrixWorld();
          for (let i = 0; i < 24; i++)
            for (let j = 0; j < 14; j++) {
              const v = new THREE.Vector3((i / 23) * 2 - 1, (j / 13) * 2 - 1, 0.5).unproject(cam);
              ray.origin.copy(cam.position);
              ray.direction.copy(v.sub(cam.position).normalize());
              for (const pk of c.ctx.pickers) {
                const h = pk.pick(ray);
                if (h && h.kind === kind && !hits.some((o) => o.id === h.id)) hits.push(h);
              }
            }
          if (hits.length > k) break;
        }
        const h = nth(hits);
        if (!h) return null;
        c.setSpeed(0);
        const p = new THREE.Vector3();
        h.getPosition(p);
        const yaw = h.getHeading ? (h.getHeading() * 180) / Math.PI : 0;
        const H = { car: 1.5, bus: 3, pedestrian: 1.75, train: 4, boat: 3 }[cls];
        return { x: p.x, y: p.y, z: p.z, yaw: yaw + 35, h: H, w: 2 };
      },
      [cls, pickIdx],
    );
    if (!loc) {
      report.missing.push(cls);
      continue;
    }
    for (const d of dists) for (const yo of yaws) {
      // frame the object: target at ~mid height when close, pitch rises with distance
      const ty = loc.y + Math.min(loc.h * 0.5, d < 5 ? 1.4 : d < 20 ? 3 : 6);
      const dist = Math.max(d, d < 5 ? Math.min(loc.h, 6) * 0.9 + 1.5 : d);
      const pitch = pitchOv ?? loc.pitch ?? (d < 5 ? 8 : d < 20 ? 14 : 24);
      // line of sight: try the default yaw first, then swing around the object (and finally shorten the arm)
      // until a ray from the object's middle reaches the camera without hitting anything else.
      const los = await page.evaluate(
        async ([l, ty, dist, pitch, yo]) => {
          const c = window.__city, THREE = await import('/@fs' + window.__benchThree);
          const meshes = [];
          // glass counts (curtain walls); billboards / sky / water / particles do not
          const skip = /glow|halo|cloud|sky|water|atmo|spark|smoke|rain|firework|shadow/i;
          // traverse(), not traverseVisible(): chunk / frustum culling and near-only LODs hide meshes that are
          // invisible from the CURRENT camera but in view from the candidate one (the bin 10 m capture ended
          // inside a culled bus shelter). Coarse + fine LOD twins both block, which is harmless.
          c.ctx.scene.traverse((o) => o.isMesh && o.material?.visible !== false && !skip.test(o.name) && !skip.test(o.parent?.name ?? '') && meshes.push(o));
          const rc = new THREE.Raycaster();
          const from = new THREE.Vector3(l.x, ty, l.z);
          const near = Math.max(0.6, l.w * 0.5 + 0.4);
          const enclosure = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].map(([x, y, z]) => new THREE.Vector3(x, y, z));
          const clear = () => {
            const cam = c.ctx.camera, dir = cam.position.clone().sub(from), len = dir.length();
            // both directions: a one-sided roof or wall is only hit from its front
            rc.set(from, dir.normalize());
            rc.near = near;
            rc.far = len - 0.3;
            if (rc.intersectObjects(meshes, false).length) return false;
            rc.set(cam.position, dir.clone().negate());
            rc.near = 0.3;
            rc.far = len - near;
            if (rc.intersectObjects(meshes, false).length) return false;
            // not enclosed: a camera inside a bus shelter / kiosk sees the object through the open side
            // but frames it with glass and roof — reject when 3 of 5 short probes hit something
            let hits = 0;
            for (const pd of enclosure) {
              // both ways (single-sided glass / roofs are only hit from their front)
              rc.set(cam.position, pd);
              rc.near = 0.05;
              rc.far = 2.2;
              let hit = rc.intersectObjects(meshes, false).length > 0;
              if (!hit) {
                rc.set(cam.position.clone().addScaledVector(pd, 2.2), pd.clone().negate());
                rc.near = 0;
                rc.far = 2.15;
                hit = rc.intersectObjects(meshes, false).length > 0;
              }
              if (hit) hits++;
              // a wall / panel right at the lens (shelter ad panels, kiosk sides) fills the frame
              if (pd.y === 0) {
                rc.set(cam.position, pd);
                rc.near = 0;
                rc.far = 0.9;
                if (rc.intersectObjects(meshes, false).length) return false;
              }
            }
            return hits < 3;
          };
          // street canyons: finally look down from higher up
          for (const [arm, pt] of [[1, pitch], [0.6, pitch], [1, Math.max(pitch, 48)], [1, 72]])
            for (const dy of [yo, -yo, 55, -55, 95, -95, 140, -140, 180]) {
              c.view({ target: { x: l.x, y: ty, z: l.z }, distance: dist * arm, yaw: l.yaw + dy, pitch: pt });
              c.ctx.camera.updateMatrixWorld();
              if (clear()) return { dy, arm, pitch: pt };
            }
          c.view({ target: { x: l.x, y: ty, z: l.z }, distance: dist, yaw: l.yaw + yo, pitch });
          return { dy: yo, arm: 1, blocked: true };
        },
        [loc, ty, dist, pitch, yawOff + yo],
      );
      await page.waitForTimeout(settle);
      const file = path.join(outDir, `${cls}_${d}m${yo ? '_y' + yo : ''}.png`);
      await page.screenshot({ path: file, timeout: 240000 });
      report.captures.push({ cls, d, los, file: path.relative(root, file), at: [loc.x, loc.y, loc.z].map((v) => Math.round(v * 10) / 10) });
    }
    await page.evaluate(() => window.__city.setSpeed(1));
  }
  report.frameErrors = await page.evaluate(() => window.__city.frameErrors);
} catch (e) {
  report.harnessError = String(e?.stack ?? e);
} finally {
  await browser.close().catch(() => {});
  releaseLock();
}
report.seconds = Math.round((Date.now() - t0) / 1000);
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
if (args.sheet !== '0' && report.captures.length) {
  // one sheet per 6 classes (rows = classes, cols = distances)
  const per = 6 * dists.length;
  report.sheets = [];
  for (let i = 0; i < report.captures.length; i += per) {
    const specs = report.captures.slice(i, i + per).map((c) => `${c.cls} ${c.d}m|${path.join(root, c.file)}`);
    const sheet = path.join(outDir, `sheet_${i / per + 1}.png`);
    try {
      execFileSync('python3', ['-I', path.join(here, 'agent-tools/sheet.py'), sheet, String(args.cols ?? dists.length), String(args.tile ?? 560), ...specs]);
      report.sheets.push(path.relative(root, sheet));
    } catch (e) {
      report.sheetError = String(e.message ?? e).slice(0, 200);
    }
  }
}
console.log(
  JSON.stringify({
    seconds: report.seconds,
    captures: report.captures.length,
    sheets: report.sheets,
    missing: report.missing,
    consoleErrors: report.consoleErrors.slice(0, 5),
    pageErrors: report.pageErrors.slice(0, 3),
    failedModules: report.failedModules,
    frameErrors: (report.frameErrors ?? []).slice(0, 3),
    harnessError: report.harnessError,
  }),
);

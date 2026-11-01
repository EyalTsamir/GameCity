#!/usr/bin/env node
// The census of the city sweep (docs/progress/SWEEP.md): every kind of thing and every cell to look at, read from the
// data with no browser. It runs the same plan, road network, occupancy and landscape model the page builds at boot.
//
//   node scripts/sweep-census.mjs
//   ... --extra a.json,b.json   kinds the plan doesn't name (props, vehicles, people, animals), merged in from a code survey
//
// Writes scripts/sweep-plan.json (what scripts/sweep.mjs shoots) and docs/progress/sweep-census.md (the same, to read).
// A kind that appears once counts like one that appears a thousand times.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'rolldown';

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

// ───────────────────────────────── the page's own data, bundled for Node
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-census-'));
const entry = path.join(tmp, 'entry.ts');
const src = (p) => JSON.stringify(path.join(root, p).replace(/\\/g, '/'));
fs.writeFileSync(
  entry,
  `export { generatePlan } from ${src('src/core/plan.ts')};
export { buildRoadNetwork } from ${src('src/core/roadNetwork.ts')};
export { OccupancyGrid, OCC } from ${src('src/core/occupancy.ts')};
export { createLandscapeModel } from ${src('src/world/landscape/model.ts')};
export { SLAB } from ${src('src/core/constants.ts')};
export { WalkSurface } from ${src('src/ui/camera/walkSurface.ts')};
`,
);
const outFile = path.join(tmp, 'bundle.mjs');
await build({ input: entry, output: { file: outFile, format: 'esm' }, logLevel: 'silent', platform: 'node', cwd: root });
const { generatePlan, buildRoadNetwork, OccupancyGrid, OCC, createLandscapeModel, SLAB, WalkSurface } = await import(pathToFileURL(outFile).href);
fs.rmSync(tmp, { recursive: true, force: true });

const plan = generatePlan();
const net = buildRoadNetwork(plan);
const occ = new OccupancyGrid(plan, net);
const land = createLandscapeModel((x, z) => plan.heightAt(x, z));
const round = (v, k = 100) => Math.round(v * k) / k;
// what the walker stands on: raised decks and the platform, which the ground height doesn't know
const surface = new WalkSurface({ plan, occupancy: occ, services: {} }, { ground: (x, z) => plan.heightAt(x, z), outsideWater: null });
const floorOf = (x, z) => {
  const f = surface.heightAt(x, z);
  return f > plan.heightAt(x, z) + 0.25 ? round(f) : undefined;
};

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ───────────────────────────────── kinds from the plan
const kinds = [];
const kindOf = (id, group, name, count, one) => kinds.push({ id, group, name, count, ...one });
/** one kind per distinct key; the instance nearest the middle of its group stands for it (an ordinary one, not an edge case) */
const grouped = (items, keyOf) => {
  const m = new Map();
  for (const it of items) {
    const k = keyOf(it);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
};
const middleOf = (list, at) => {
  const cx = list.reduce((a, e) => a + at(e).x, 0) / list.length,
    cz = list.reduce((a, e) => a + at(e).z, 0) / list.length;
  let best = list[0],
    bd = Infinity;
  for (const e of list) {
    const p = at(e),
      d = (p.x - cx) ** 2 + (p.z - cz) ** 2;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
};

const DIR_YAW = { N: 180, S: 0, E: 90, W: 270 };
const dirYaw = (d) => (typeof d === 'number' ? (d * 180) / Math.PI : (DIR_YAW[d] ?? DIR_YAW[String(d)[0]?.toUpperCase()] ?? 0));

// buildings: kind × district × roof × shop, one instance of each; tall ones are looked at by their door
for (const [k, list] of grouped(plan.lots, (l) => `${l.kind}|${l.district}|${l.roof}|${l.shopfront ? 'shop' : 'plain'}`)) {
  const [kind, district, roof, shop] = k.split('|');
  const l = middleOf(list, (e) => ({ x: (e.footprint.x0 + e.footprint.x1) / 2, z: (e.footprint.z0 + e.footprint.z1) / 2 }));
  const door = l.doors?.[0];
  const yaw = dirYaw(door?.dir ?? l.front);
  const y = (yaw * Math.PI) / 180;
  // the middle of the street face (or the door); `r` 0: the distances count from the face itself
  const fx = (l.footprint.x0 + l.footprint.x1) / 2,
    fz = (l.footprint.z0 + l.footprint.z1) / 2;
  const hw = Math.abs(Math.sin(y)) * (l.footprint.x1 - l.footprint.x0) * 0.5 + Math.abs(Math.cos(y)) * (l.footprint.z1 - l.footprint.z0) * 0.5;
  kindOf(`bld-${slug(kind)}-${slug(district)}-${slug(roof)}-${shop}`, 'buildings', `${kind}, ${district}, ${roof} roof, ${shop}`, list.length, {
    x: round(door?.x ?? fx + Math.sin(y) * hw),
    z: round(door?.z ?? fz + Math.cos(y) * hw),
    yaw: round(yaw),
    lookH: 1.6,
    r: 0,
    top: round(l.height),
  });
}
// a building with a name is one of a kind (the beach's ice-cream kiosk, the hotels), however its group is drawn
for (const l of plan.lots.filter((q) => q.name)) {
  const door = l.doors?.[0];
  const yaw = dirYaw(door?.dir ?? l.front);
  const y = (yaw * Math.PI) / 180;
  const fx = (l.footprint.x0 + l.footprint.x1) / 2,
    fz = (l.footprint.z0 + l.footprint.z1) / 2;
  const hw = Math.abs(Math.sin(y)) * (l.footprint.x1 - l.footprint.x0) * 0.5 + Math.abs(Math.cos(y)) * (l.footprint.z1 - l.footprint.z0) * 0.5;
  kindOf(`named-${slug(l.name)}-${l.id}`, 'named buildings', `${l.name} (${l.kind})`, 1, { x: round(door?.x ?? fx + Math.sin(y) * hw), z: round(door?.z ?? fz + Math.cos(y) * hw), yaw: round(yaw), lookH: 1.6, r: 0, top: round(l.height) });
}
// a building's other faces: one back or side per kind, where nobody designs for
for (const [kind, list] of grouped(plan.lots, (l) => l.kind)) {
  const l = middleOf(list, (e) => ({ x: (e.footprint.x0 + e.footprint.x1) / 2, z: (e.footprint.z0 + e.footprint.z1) / 2 }));
  const yaw = dirYaw(l.front) + 180;
  const y = (yaw * Math.PI) / 180;
  const fx = (l.footprint.x0 + l.footprint.x1) / 2,
    fz = (l.footprint.z0 + l.footprint.z1) / 2;
  const hw = Math.abs(Math.sin(y)) * (l.footprint.x1 - l.footprint.x0) * 0.5 + Math.abs(Math.cos(y)) * (l.footprint.z1 - l.footprint.z0) * 0.5;
  kindOf(`bldback-${slug(kind)}`, 'building backs', `${kind}, back face`, list.length, { x: round(fx + Math.sin(y) * hw), z: round(fz + Math.cos(y) * hw), yaw: round(yaw), lookH: 1.6, r: 0 });
}

// features: every kind × every params "style" the plan gives it; a one-off kind stands for itself
for (const [k, list] of grouped(plan.features, (f) => `${f.kind}|${f.params?.style ?? f.params?.type ?? f.params?.name ?? ''}`)) {
  const [kind, style] = k.split('|');
  const f = middleOf(list, (e) => e);
  kindOf(`feat-${slug(kind)}${style ? '-' + slug(style) : ''}`, 'landmarks and features', `${kind}${style ? ', ' + style : ''}`, list.length, {
    x: round(f.x),
    z: round(f.z),
    yaw: round(dirYaw(f.yaw)),
    lookH: 1.4,
    r: round(Math.max(f.radius ?? 0, f.rect ? Math.min(f.rect.x1 - f.rect.x0, f.rect.z1 - f.rect.z0) / 2 : 0, 0.3)),
  });
}

// street furniture, by district: the same thing may be drawn differently per district
for (const [k, list] of grouped(plan.slots.filter((s) => s.kind !== 'empty'), (s) => s.kind)) {
  const s = middleOf(list, (e) => e);
  kindOf(`slot-${slug(k)}`, 'street furniture', k, list.length, { x: round(s.x), z: round(s.z), yaw: round(dirYaw(s.yaw)), lookH: k === 'tree' || k === 'lamp' ? 1.6 : 0.7, r: 0.3 });
}
{
  const b = middleOf(plan.benches, (e) => e);
  kindOf('bench-path', 'street furniture', 'bench on a walk path', plan.benches.length, { x: round(b.x), z: round(b.z), yaw: round(dirYaw(b.yaw)), lookH: 0.6, r: 0.3 });
}
// ground: every area kind, surface and walk kind, seen from eye height looking at the middle of it
for (const [k, list] of grouped(plan.areas, (a) => `${a.kind}|${a.surface}`)) {
  const [kind, surface] = k.split('|');
  const a = middleOf(list, (e) => ({ x: (e.rect.x0 + e.rect.x1) / 2, z: (e.rect.z0 + e.rect.z1) / 2 }));
  kindOf(`area-${slug(kind)}-${slug(surface)}`, 'grounds', `${kind} on ${surface}`, list.length, { x: round((a.rect.x0 + a.rect.x1) / 2), z: round((a.rect.z0 + a.rect.z1) / 2), yaw: 30, lookH: 0, r: 0 });
}
for (const [k, list] of grouped(plan.paths, (p) => `${p.kind}|${p.surface}`)) {
  const [kind, surface] = k.split('|');
  const p = list[Math.floor(list.length / 2)];
  const m = p.pts[Math.floor(p.pts.length / 2)];
  kindOf(`walk-${slug(kind)}-${slug(surface)}`, 'grounds', `${kind} walk on ${surface}`, list.length, { x: round(m.x), z: round(m.z), yaw: 60, lookH: 0, r: 0 });
}
// roads: a junction of each control, a level crossing, a tunnel mouth's road
for (const [k, list] of grouped(plan.roadNodes, (n) => n.control)) {
  const n = middleOf(list, (e) => e);
  kindOf(`junction-${slug(k)}`, 'roads', `junction, ${k}`, list.length, { x: round(n.x), z: round(n.z), yaw: 40, lookH: 1.5, r: 6 });
}
for (const c of plan.rail.crossings) kindOf(`crossing-${c.id}`, 'roads', `level crossing ${c.id}`, 1, { x: round(c.x), z: round(plan.rail.z), yaw: 30, lookH: 1.2, r: 4 });

// the places the camera is sent to by name: what the eye-level cells never see, the city as a whole
for (const p of plan.pois) kindOf(`poi-${slug(p.id)}`, 'named views', p.name, 1, { poi: p.id });

// ───────────────────────────────── kinds from the code survey (the plan doesn't name them)
// Hours from each kind's own timetable (what doesn't exist at noon or 21.5 is shot when it does), where to stand first for
// what only exists near the camera, how long it may be waited for, and what a still can't usefully show.
const DAY = /^(ped-(shopper|tourist|beachgoer|parent-pram|elderly|family|pram|sunbather|beach-sitter|bench-|view-|vendor-(flowers|juice|pretzel|market)|actor-(kid|shopper|fisher|worker)|body-(boy|girl|elderly))|sl-bird-|bird-|air-balloon|kite-|stadium-training|scene-park-|life-butterfly)/;
const HOURS_FOR = [
  [/^stadium-training/, [12]],
  [/^stadium-empty/, null],
  [/^stadium-crowd-wave/, [15.5]],
  [/^stadium-/, [15.5, 20.5]],
  [/^ped-(student|worker|garment-vest|hat-hardhat|body-teen|takeaway-coffee)/, [8]],
  [/^ped-(jogger|angler)/, [8, 18]],
  [/^ped-(dogwalker|dog$)/, [8, 20]],
  [/^ped-nightowl/, [21.5]],
  [/^ped-actor-(band|conductor)/, [18]],
  [/^scene-market-(porter|van)/, [7]],
  [/^scene-delivery/, [10]],
  [/^scene-wedding-car/, [10.4]],
  [/^scene-wedding/, [10.9]],
  [/^scene-moment-sweeping/, [9.5]],
  [/^scene-market-tarp/, [21.5]],
  [/^life-vent-smoke-bakery/, [8]],
  [/^life-bbq-smoke/, [18.5]],
  [/^bird-swift/, [18.5]],
  [/^(life-dust-moth|fireflies)/, [21.5]],
];
const GOTO = {
  'sl-bird-sparrow': [27, 17], 'sl-bird-pigeon': [27, 78], 'sl-bird-gull': [128, -35], 'sl-bird-blackbird': [-55, 18],
  'sl-litter-sheet': [11, -14], 'sl-litter-cup': [11, -14], 'sl-litter-ball': [11, -14], 'sl-litter-leaf': [-3.9, 34],
  'scene-moment-sweeping': [-154, 83], 'scene-moment-smoke': [16, -58], 'scene-moment-pacing': [16, -58], 'scene-moment-getting': [42, 51], 'scene-moment-two': [42, 51],
  'scene-balcony-person': [-146, -18],
};
const CAT_GARDEN = [-176, -4];
const WAIT = [
  [/^rail-/, 60], [/^ped-train-arrival/, 60], [/^ped-bus-|^veh-bus-door/, 30], [/^ped-waiter/, 30],
  [/^air-plane/, 60], [/^sl-|^scene-moment/, 15],
];
const CELLS_ONLY = [
  [/^veh-driver|^veh-bus-driver|^rail-driver|^rail-passengers|^boat-crew/, 'seen in the shots of its vehicle at 1 m'],
  [/^ped-flag-umbrella/, 'needs rain; the sweep is dry'],
  [/^veh-police-siren/, 'a timer on a police car, seen with the police car'],
  [/^sl-bird-(flushing|fed-crowd)|^sl-movers/, 'needs a walker or a moment to trigger it'],
  [/^fireworks-(?!show)/, 'one show, seen in fireworks-show'],
  [/^stadium-ball/, 'seen with the players'],
];
kinds.push({ id: 'fireworks-show', group: 'ambient', name: 'the fireworks over the barge', count: 1, x: 180, z: -58, yaw: -120, lookH: 40, r: 0, dists: [60, 150], hours: [21.5], before: "ctx.events.emit('fireworks:launch',{duration:50})", beforeWait: 14 });
const sizeR = (e) => {
  if (e.r !== undefined) return e.r;
  if (typeof e.size === 'number') return e.size / 2;
  const m = /([\d.]+)\s*(?:x|m\b)/.exec(String(e.size ?? ''));
  return m ? Math.max(0.25, parseFloat(m[1]) / 2) : 0.5;
};
const shape = (out) => {
  const hit = HOURS_FOR.find(([re]) => re.test(out.id));
  if (hit) {
    if (hit[1]) out.hours = hit[1];
  } else if (DAY.test(out.id)) out.hours = [12];
  if (/^sl-cat/.test(out.id)) out.goto = CAT_GARDEN;
  if (GOTO[out.id]) out.goto = GOTO[out.id];
  const w = WAIT.find(([re]) => re.test(out.id));
  if (w) out.wait = w[1];
  if (/^air-/.test(out.id)) out.dists = [20, 60];
  const co = CELLS_ONLY.find(([re]) => re.test(out.id));
  if (co) {
    out.squaresOnly = co[1];
    delete out.find;
    delete out.x;
    delete out.z;
  }
  return out;
};
const dropped = [];
for (const file of (args.extra ?? path.join(here, 'sweep-kinds.json')).split(',').filter((f) => f && fs.existsSync(f))) {
  for (const e of JSON.parse(fs.readFileSync(file, 'utf8'))) {
    if (e.id === '_meta' || kinds.some((k) => k.id === e.id)) continue;
    const out = { id: e.id, group: e.group, name: e.name, count: e.count ?? null, file: e.file, lookH: e.lookH ?? 1.2, r: sizeR(e) };
    if (e.yaw !== undefined) out.yaw = e.yaw;
    if (e.unverified) out.unverified = true;
    if (e.squaresOnly) out.squaresOnly = e.squaresOnly;
    const at = e.fixed ?? (e.x !== undefined ? e : null);
    if (at) {
      out.x = at.x;
      out.z = at.z;
    }
    if (e.find?.expr) {
      // (a survey's field names may be half prose: take the leading path, and the page looks for x and z itself too)
      const token = (f) => /^[A-Za-z_][\w.]*/.exec(f ?? '')?.[0];
      out.find = { expr: e.find.expr, x: token(e.find.xField), z: token(e.find.zField), yaw: token(e.find.yawField), when: e.find.when?.slice(0, 160) };
      if (e.find.code) out.find.filter = e.find.code;
    }
    shape(out);
    if (out.x === undefined && !out.find && !out.squaresOnly) dropped.push(out);
    kinds.push(out);
  }
}

// ───────────────────────────────── cells
// street things nobody stands inside
const blocked = new Set();
const key = (x, z) => Math.floor(x * 2) * 100000 + Math.floor(z * 2);
for (const s of [...plan.slots.filter((q) => q.kind !== 'empty'), ...plan.benches])
  for (let dz = -1; dz <= 1; dz += 0.5) for (let dx = -1; dx <= 1; dx += 0.5) if (dx * dx + dz * dz <= 1) blocked.add(key(s.x + dx, s.z + dz));
const WALK_AREAS = new Set(['plaza', 'playground', 'beach', 'promenade', 'market', 'boardwalk', 'platform', 'quay', 'schoolyard', 'courtyard', 'lawn']);
const WALK_FLAGS = OCC.ROAD | OCC.SIDEWALK | OCC.PATH | OCC.PAVED;
const parkBlocks = plan.blocks.filter((b) => b.kind === 'park' || b.kind === 'beach' || b.kind === 'riverside');
const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const walkAreas = plan.areas.filter((a) => WALK_AREAS.has(a.kind));
const isWalkable = (x, z) => {
  const o = occ.get(x, z);
  if (o & (OCC.BUILDING | OCC.SOLID) || blocked.has(key(x, z))) return false;
  if (o & WALK_FLAGS) return true;
  if (o & OCC.WATER) return false;
  return walkAreas.some((a) => inRect(a.rect, x, z)) || parkBlocks.some((b) => inRect(b.rect, x, z));
};
const isFree = (x, z) => !(occ.get(x, z) & (OCC.BUILDING | OCC.SOLID | OCC.WATER)) && !blocked.has(key(x, z));

/** the standing point of a cell: the free point nearest its middle, a walkable one if it has any */
const standIn = (x0, z0, S) => {
  let bestW = null,
    bdW = Infinity,
    bestF = null,
    bdF = Infinity,
    nW = 0,
    nF = 0,
    nWater = 0,
    n = 0;
  const cx = x0 + S / 2,
    cz = z0 + S / 2;
  for (let z = z0 + 0.25; z < z0 + S; z += 0.5)
    for (let x = x0 + 0.25; x < x0 + S; x += 0.5) {
      n++;
      const d = (x - cx) ** 2 + (z - cz) ** 2;
      if (occ.get(x, z) & OCC.WATER) nWater++;
      if (isWalkable(x, z)) {
        nW++;
        if (d < bdW) {
          bdW = d;
          bestW = { x, z };
        }
      }
      if (isFree(x, z)) {
        nF++;
        if (d < bdF) {
          bdF = d;
          bestF = { x, z };
        }
      }
    }
  return { walk: bestW, free: bestF, shareW: nW / n, shareF: nF / n, shareWater: nWater / n };
};

const cells = [];
const skipped = { roofOnly10: 0, roofOnly20: 0, water20: 0, seaBeyond: 0 };
const S10 = 10,
  S20 = 20,
  S_FAR = 100;
const FAR_MARGIN = 320; // the camera's own limit beyond the slab (`WORLD_TARGET_MARGIN`)
// the coarse grid is 20 m: a square is walkable if any of its 10 m parts is, and then it is cut into them
for (let z0 = SLAB.z0; z0 < SLAB.z1; z0 += S20) {
  for (let x0 = SLAB.x0; x0 < SLAB.x1; x0 += S20) {
    const parts = [];
    for (let dz = 0; dz < S20; dz += S10) for (let dx = 0; dx < S20; dx += S10) parts.push({ x0: x0 + dx, z0: z0 + dz, ...standIn(x0 + dx, z0 + dz, S10) });
    const walkable = parts.filter((p) => p.walk && p.shareW >= 0.1);
    if (walkable.length) {
      for (const p of parts) {
        if (p.walk && p.shareW >= 0.1) cells.push({ id: `c${p.x0}_${p.z0}`, type: 'walk', S: S10, x: p.walk.x, z: p.walk.z, floor: floorOf(p.walk.x, p.walk.z) });
        else if (p.free) cells.push({ id: `c${p.x0}_${p.z0}`, type: 'walk-edge', S: S10, x: p.free.x, z: p.free.z, floor: floorOf(p.free.x, p.free.z) });
        else if (p.shareWater < 0.5) skipped.roofOnly10++;
      }
      continue;
    }
    const whole = standIn(x0, z0, S20);
    if (whole.free && whole.shareF >= 0.05) cells.push({ id: `r${x0}_${z0}`, type: 'rest', S: S20, x: whole.free.x, z: whole.free.z });
    else if (whole.shareWater > 0.5) {
      // open water: one view, one in four squares
      if (((x0 - SLAB.x0) / S20) % 2 === 0 && ((z0 - SLAB.z0) / S20) % 2 === 0) cells.push({ id: `w${x0}_${z0}`, type: 'water', S: S20 * 2, x: x0 + S20 / 2, z: z0 + S20 / 2 });
      else skipped.water20++;
    } else skipped.roofOnly20++;
  }
}
for (let z0 = SLAB.z0 - FAR_MARGIN; z0 < SLAB.z1 + FAR_MARGIN; z0 += S_FAR) {
  for (let x0 = SLAB.x0 - FAR_MARGIN; x0 < SLAB.x1 + FAR_MARGIN; x0 += S_FAR) {
    const cx = x0 + S_FAR / 2,
      cz = z0 + S_FAR / 2;
    if (cx > SLAB.x0 && cx < SLAB.x1 && cz > SLAB.z0 && cz < SLAB.z1) continue;
    if (land.isWater(cx, cz)) {
      skipped.seaBeyond++;
      continue;
    }
    cells.push({ id: `f${x0}_${z0}`, type: 'far', S: S_FAR, x: cx, z: cz });
  }
}

// ───────────────────────────────── what gets shot, and how many
const HOURS = [12, 21.5];
const DISTS = [1, 3, 10];
const VIEWS = { walk: 5, 'walk-edge': 5, rest: 5, far: 5, water: 1 };
const HOURS_OF = { water: [12] };
const imagesOf = (c) => VIEWS[c.type] * (HOURS_OF[c.type] ?? HOURS).length;
const nCells = {};
for (const c of cells) nCells[c.type] = (nCells[c.type] ?? 0) + 1;
const imgSquares = cells.reduce((a, c) => a + imagesOf(c), 0);
// a kind's pictures per hour: the three distances; a building also from below and over its roof; a named view once
const viewsOfKind = (k) => (k.poi ? 1 : k.x === undefined && !k.find ? 0 : (k.dists ?? DISTS).length + (k.top ? 2 : 0));
const imgObjects = kinds.reduce((a, k) => a + viewsOfKind(k) * (k.hours ?? HOURS).length, 0);
fs.writeFileSync(path.join(here, 'sweep-plan.json'), JSON.stringify({ hours: HOURS, dists: DISTS, views: VIEWS, hoursOf: HOURS_OF, kinds, cells }, null, 0).replace(/\},\{/g, '},\n{'));

// ───────────────────────────────── the census, to read
const byGroup = new Map();
for (const k of kinds) {
  if (!byGroup.has(k.group)) byGroup.set(k.group, []);
  byGroup.get(k.group).push(k);
}
let md = `# Sweep census\n\nGenerated by \`scripts/sweep-census.mjs\` from the plan, the road network, the occupancy grid and the landscape model, plus a code survey of what the plan doesn't name. Don't edit by hand: rerun it. Capture list: \`scripts/sweep-plan.json\`.\n\n`;
md += `## Totals\n\n| | count | images |\n|---|---|---|\n`;
const shotKinds = kinds.filter((k) => viewsOfKind(k) > 0).length;
md += `| kinds and variants | ${kinds.length}, of which ${kinds.length - shotKinds} seen only from the cells | ${imgObjects} (${DISTS.join(', ')} m at ${HOURS.join(' and ')} h, or the hours the kind exists) |\n`;
for (const t of Object.keys(VIEWS)) md += `| cells: ${t} | ${nCells[t] ?? 0} | ${(nCells[t] ?? 0) * VIEWS[t] * (HOURS_OF[t] ?? HOURS).length} |\n`;
md += `| **all** | ${kinds.length} kinds, ${cells.length} cells | **${imgObjects + imgSquares}** |\n\n`;
md += `Not shot: ${skipped.roofOnly10 + skipped.roofOnly20} cells with no ground to stand on (roofs and solid footprints; their walls are seen from the neighbours), ${skipped.water20} open-water squares (one in four is kept with one view), ${skipped.seaBeyond} sea cells beyond the slab.\n`;
if (dropped.length) md += `\nKinds with no position and no finder, so no object shots; the squares still see them where they stand: ${dropped.map((d) => '`' + d.id + '`').join(', ')}.\n`;
md += `\n## Kinds\n`;
for (const [g, list] of byGroup) {
  md += `\n### ${g} (${list.length})\n\n| id | what | how many | where |\n|---|---|---|---|\n`;
  for (const k of list) {
    const clean = (s) => String(s).replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 120);
    const where = k.find ? `found at run time${k.find.when ? ': ' + clean(k.find.when) : ''}` : k.x !== undefined ? `${k.x}, ${k.z}` : k.squaresOnly ? `cells only: ${clean(k.squaresOnly)}` : 'no position';
    md += `| \`${k.id}\` | ${String(k.name).replace(/\|/g, '/')} | ${k.count ?? '?'} | ${where} |\n`;
  }
}
fs.writeFileSync(path.join(root, 'docs/progress/sweep-census.md'), md);
console.log(JSON.stringify({ kinds: kinds.length, groups: [...byGroup].map(([g, l]) => `${g}: ${l.length}`), cells: nCells, skipped, images: { objects: imgObjects, squares: imgSquares, all: imgObjects + imgSquares }, noPosition: dropped.length }, null, 1));

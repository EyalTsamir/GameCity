// Farmsteads within the free camera's reach (W8): the farmhouse, barn and machinery shed of a landscape
// farm site rebuilt as real buildings — rendered walls with framed windows, sills, door, gutters and
// downpipes, a brick chimney, clay-tile roof; a timber-boarded barn (battens, concrete plinth, braced
// double doors on rails, corrugated sheeting); an open-fronted shed; a galvanised silo with a caged
// ladder; round straw and wrapped silage bales; post-and-rail paddock fence with a five-bar gate; a
// concrete apron at the barn doors. One merged mesh per farm (local frame), surfaces drawn procedurally
// in the shader (aSurf: boards, sheeting, tiles, render, brick, galvanised, wrap, straw, concrete).
// ?nofarmdetail keeps the old instanced boxes (settlements.ts).

import * as THREE from 'three';
import { Sink, type RGB } from './tractor';

export interface FarmBld {
  lx: number;
  lz: number;
  y: number;
  w: number;
  d: number;
  h: number;
  roof: number;
  yawOff: number;
  wall: THREE.Color;
  roofC: THREE.Color;
  kind: number; // 0 house, 1 barn, 2 shed
}

export interface FarmSite {
  x: number;
  z: number;
  y: number;
  yaw: number;
  seed: number;
  blds: FarmBld[];
}

const S = { plain: 0, boards: 1, sheet: 2, tiles: 3, render: 4, brick: 5, galv: 6, wrap: 7, straw: 8, concrete: 9 } as const;

function rnd(seed: number, i: number): number {
  const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const c3 = (c: THREE.Color, k = 1): RGB => [c.r * k, c.g * k, c.b * k];

/** gable-end triangles of a building w (x) × d (z), eaves h, rise r */
function gableEnds(s: Sink, m: THREE.Matrix4, w: number, d: number, h: number, r: number, c: RGB, rough: number): void {
  const pos: number[] = [];
  for (const sx of [-1, 1]) {
    const x = (sx * w) / 2;
    const tri = sx > 0 ? [[x, h, d / 2], [x, h, -d / 2], [x, h + r, 0]] : [[x, h, -d / 2], [x, h, d / 2], [x, h + r, 0]];
    for (const p of tri) pos.push(p[0], p[1], p[2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  s.add(g, m, c, rough, 0, 0);
}

/** a pitched roof (two slabs with an overhang), ridge along x */
function roofSlabs(s: Sink, m: THREE.Matrix4, w: number, d: number, h: number, r: number, ov: number, c: RGB, surf: number, rough: number, metal: number, t = 0.12): void {
  const ang = Math.atan2(r, d / 2);
  const len = Math.hypot(d / 2, r) + ov;
  s.surf = surf;
  for (const sz of [-1, 1]) {
    const g = new THREE.BoxGeometry(w + ov * 2, t, len);
    // slab centre: from the ridge down the slope by len/2 (and the thickness above the rafters)
    const cz = sz * (len / 2) * Math.cos(ang),
      cy = h + r - (len / 2) * Math.sin(ang) + t / 2;
    const mm = new THREE.Matrix4().makeRotationX(sz * ang).setPosition(0, cy, cz);
    s.add(g, m.clone().multiply(mm), c, rough, metal, 0);
  }
  s.surf = 0;
}

function house(s: Sink, m: THREE.Matrix4, b: FarmBld, seed: number): void {
  const { w, d, h, roof } = b;
  const wall = c3(b.wall);
  const M = (x: number, y: number, z: number, ry = 0) => m.clone().multiply(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z));
  s.mudTop = 0.6;
  s.mudSpan = 0.6;
  s.surf = S.render;
  s.add(new THREE.BoxGeometry(w, h + 0.3, d), M(0, (h + 0.3) / 2 - 0.3, 0), wall, 0.9, 0, 0.6);
  gableEnds(s, M(0, -0.3, 0), w, d, h + 0.3, roof, wall, 0.9);
  // plinth: a darker rendered band at the foot
  s.add(new THREE.BoxGeometry(w + 0.08, 0.9, d + 0.08), M(0, 0.15, 0), [wall[0] * 0.62, wall[1] * 0.6, wall[2] * 0.58], 0.95, 0, 0.8);
  s.surf = S.tiles;
  roofSlabs(s, m, w, d, h, roof, 0.45, c3(b.roofC), S.tiles, 0.8, 0);
  // barge boards along the verges and a ridge cap
  const ang = Math.atan2(roof, d / 2),
    sl = Math.hypot(d / 2, roof) + 0.45;
  s.surf = S.plain;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) s.add(new THREE.BoxGeometry(0.04, 0.22, sl), m.clone().multiply(new THREE.Matrix4().makeRotationX(sz * ang).setPosition((sx * (w + 0.9)) / 2, h + roof - (sl / 2) * Math.sin(ang) + 0.05, sz * (sl / 2) * Math.cos(ang))), [0.85, 0.83, 0.78], 0.6, 0, 0);
  s.add(new THREE.CylinderGeometry(0.1, 0.1, w + 0.9, 8), m.clone().multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, h + roof + 0.1, 0)), c3(b.roofC, 0.8), 0.7, 0, 0);
  // brick chimney on the ridge, with a cap and two pots
  s.surf = S.brick;
  const chx = (rnd(seed, 3) - 0.5) * w * 0.5;
  s.add(new THREE.BoxGeometry(0.7, 1.9, 0.55), M(chx, h + roof + 0.4, 0), [0.42, 0.2, 0.14], 0.9, 0, 0);
  s.surf = S.plain;
  s.add(new THREE.BoxGeometry(0.82, 0.08, 0.67), M(chx, h + roof + 1.38, 0), [0.4, 0.38, 0.35], 0.8, 0, 0);
  for (const k of [-1, 1]) s.add(new THREE.CylinderGeometry(0.09, 0.11, 0.35, 8), M(chx + k * 0.17, h + roof + 1.58, 0), [0.5, 0.25, 0.15], 0.8, 0, 0);
  // windows on the long walls: frame with a cross muntin, glass set back, stone sill; shutters on some houses
  const storeys = h > 5.2 ? 2 : 1;
  const cols = Math.max(2, Math.floor(w / 2.6));
  const shut = rnd(seed, 4) < 0.5;
  const shutC: RGB = rnd(seed, 5) < 0.5 ? [0.1, 0.22, 0.14] : [0.32, 0.18, 0.1];
  const frameC: RGB = [0.86, 0.85, 0.8];
  for (const sz of [-1, 1])
    for (let st = 0; st < storeys; st++)
      for (let i = 0; i < cols; i++) {
        const x = -w / 2 + (w / cols) * (i + 0.5);
        if (sz > 0 && st === 0 && i === Math.floor(cols / 2)) {
          // front door: frame, panelled leaf, step and a lamp
          const z = (d / 2) * sz;
          s.add(new THREE.BoxGeometry(1.15, 2.25, 0.12), M(x, 1.12, z), frameC, 0.5, 0, 0.3);
          s.add(new THREE.BoxGeometry(0.95, 2.1, 0.1), M(x, 1.05, z + 0.03 * sz), shutC, 0.55, 0, 0.5);
          for (const py of [0.55, 1.45]) s.add(new THREE.BoxGeometry(0.66, 0.6, 0.03), M(x, py, z + 0.08 * sz), [shutC[0] * 0.8, shutC[1] * 0.8, shutC[2] * 0.8], 0.55, 0, 0.4);
          s.add(new THREE.BoxGeometry(0.03, 0.03, 0.12), M(x + 0.35, 1.05, z + 0.12 * sz), [0.7, 0.6, 0.3], 0.3, 0.8, 0);
          s.surf = S.concrete;
          s.add(new THREE.BoxGeometry(1.6, 0.2, 0.7), M(x, 0.0, z + 0.35 * sz), [0.5, 0.48, 0.44], 0.9, 0, 1);
          s.surf = S.plain;
          s.add(new THREE.BoxGeometry(1.5, 0.08, 0.7), M(x, 2.45, z + 0.3 * sz), c3(b.roofC, 0.9), 0.7, 0, 0);
          continue;
        }
        const y = st === 0 ? 1.55 : 1.55 + h * 0.5;
        if (y + 0.8 > h) continue;
        const z = (d / 2) * sz;
        s.add(new THREE.BoxGeometry(1.0, 1.3, 0.1), M(x, y, z + 0.0 * sz), frameC, 0.45, 0, 0.2);
        s.add(new THREE.BoxGeometry(0.84, 1.14, 0.1), M(x, y, z + 0.03 * sz), [0.04, 0.05, 0.06], 0.05, 0, 0);
        s.add(new THREE.BoxGeometry(0.05, 1.14, 0.12), M(x, y, z + 0.035 * sz), frameC, 0.45, 0, 0);
        s.add(new THREE.BoxGeometry(0.84, 0.05, 0.12), M(x, y + 0.2, z + 0.035 * sz), frameC, 0.45, 0, 0);
        // curtains: a pale band down each side behind the glass, varied per window
        if (rnd(seed, 20 + i + st * 9 + sz * 31) < 0.7) for (const k of [-1, 1]) s.add(new THREE.BoxGeometry(0.2, 1.05, 0.02), M(x + k * 0.3, y, z + 0.08 * sz), [0.75, 0.7, 0.6], 0.9, 0, 0);
        s.surf = S.concrete;
        s.add(new THREE.BoxGeometry(1.15, 0.07, 0.22), M(x, y - 0.68, z + 0.06 * sz), [0.62, 0.6, 0.56], 0.8, 0, 0);
        s.surf = S.plain;
        if (shut) for (const k of [-1, 1]) s.add(new THREE.BoxGeometry(0.5, 1.3, 0.04), M(x + k * 0.76, y, z + 0.05 * sz), shutC, 0.6, 0, 0.3);
      }
  // gutters along both eaves and downpipes at the corners
  const gutC: RGB = [0.22, 0.2, 0.18];
  for (const sz of [-1, 1]) {
    const ez = sz * (d / 2 + 0.38);
    s.add(new THREE.CylinderGeometry(0.07, 0.07, w + 0.8, 8), m.clone().multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, h - 0.18, ez)), gutC, 0.4, 0.5, 0);
    for (const sx of [-1, 1]) {
      s.add(new THREE.CylinderGeometry(0.045, 0.045, h, 8), M(sx * (w / 2 - 0.25), h / 2 - 0.2, sz * (d / 2 + 0.07)), gutC, 0.4, 0.5, 0.3);
      s.add(new THREE.CylinderGeometry(0.045, 0.045, 0.45, 8), m.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(sx * (w / 2 - 0.25), h - 0.2, sz * (d / 2 + 0.22))), gutC, 0.4, 0.5, 0);
    }
  }
}

function barn(s: Sink, m: THREE.Matrix4, b: FarmBld, seed: number): void {
  const { w, d, h, roof } = b;
  const M = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => m.clone().multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z));
  // timber: tarred black, weathered grey-brown or barn red
  const tk = rnd(seed, 1);
  const wood: RGB = tk < 0.35 ? [0.05, 0.045, 0.04] : tk < 0.7 ? [0.24, 0.18, 0.13] : [0.32, 0.07, 0.05];
  s.mudTop = 0.8;
  s.mudSpan = 0.7;
  s.surf = S.concrete;
  s.add(new THREE.BoxGeometry(w + 0.1, 1.1, d + 0.1), M(0, 0.25, 0), [0.45, 0.43, 0.4], 0.9, 0, 1);
  s.surf = S.boards;
  s.add(new THREE.BoxGeometry(w, h - 0.8, d), M(0, 0.8 + (h - 0.8) / 2, 0), wood, 0.85, 0, 0.5);
  gableEnds(s, M(0, 0, 0), w, d, h, roof, wood, 0.85);
  // battens over the board joints on the long walls
  s.surf = S.plain;
  const bat: RGB = [wood[0] * 0.8, wood[1] * 0.8, wood[2] * 0.8];
  for (const sz of [-1, 1])
    for (let x = -w / 2 + 0.6; x < w / 2 - 0.3; x += 0.62) s.add(new THREE.BoxGeometry(0.07, h - 0.85, 0.035), M(x, 0.82 + (h - 0.85) / 2, sz * (d / 2 + 0.015)), bat, 0.9, 0, 0.4);
  // corrugated sheeting: galvanised grey, rust-red or painted green
  const rk = rnd(seed, 2);
  const sheet: RGB = rk < 0.4 ? [0.38, 0.39, 0.4] : rk < 0.75 ? [0.3, 0.12, 0.07] : [0.12, 0.2, 0.14];
  roofSlabs(s, m, w, d, h, roof, 0.4, sheet, S.sheet, 0.5, rk < 0.4 ? 0.6 : 0.2, 0.06);
  s.add(new THREE.BoxGeometry(w + 0.85, 0.12, 0.5), M(0, h + roof + 0.02, 0), [sheet[0] * 0.8, sheet[1] * 0.8, sheet[2] * 0.8], 0.5, 0.3, 0);
  // braced double doors on both gable ends, hung from a rail
  const dw = Math.min(5, d * 0.42),
    dh = Math.min(4.4, h - 0.6);
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 + 0.05);
    s.add(new THREE.BoxGeometry(0.14, dh + 0.25, dw + 0.4), M(x - sx * 0.02, dh / 2 + 0.12, 0), bat, 0.8, 0, 0.6);
    for (const k of [-1, 1]) {
      const z = (k * dw) / 4;
      s.surf = S.boards;
      s.add(new THREE.BoxGeometry(0.1, dh, dw / 2 - 0.03), M(x + sx * 0.05, dh / 2 + 0.05, z, 0, Math.PI / 2, 0).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)), [wood[0] * 1.15, wood[1] * 1.1, wood[2] * 1.1], 0.85, 0, 0.6);
      s.surf = S.plain;
      // ledges and the diagonal brace
      for (const y of [0.35, dh / 2, dh - 0.3]) s.add(new THREE.BoxGeometry(0.05, 0.16, dw / 2 - 0.1), M(x + sx * 0.12, y, z), bat, 0.85, 0, 0.5);
      const diag = Math.hypot(dh - 0.65, dw / 2 - 0.2);
      s.add(new THREE.BoxGeometry(0.05, diag, 0.14), M(x + sx * 0.12, dh / 2, z, Math.atan2(dw / 2 - 0.2, dh - 0.65) * k * sx, 0, 0), bat, 0.85, 0, 0.5);
      s.add(new THREE.BoxGeometry(0.03, 0.4, 0.03), M(x + sx * 0.16, 1.3, z - k * (dw / 4 - 0.15)), [0.2, 0.2, 0.2], 0.4, 0.7, 0);
    }
    s.add(new THREE.BoxGeometry(0.08, 0.1, dw * 2.1), M(x + sx * 0.12, dh + 0.25, dw * 0.5), [0.15, 0.15, 0.15], 0.4, 0.7, 0);
    // concrete apron in front of the doors
    s.surf = S.concrete;
    s.add(new THREE.BoxGeometry(5, 0.4, dw + 2), M(sx * (w / 2 + 2.5), -0.05, 0), [0.42, 0.4, 0.37], 0.9, 0, 1);
    s.surf = S.plain;
  }
  // a man door and two small windows on one long wall
  s.add(new THREE.BoxGeometry(0.95, 2.05, 0.1), M(-w / 4, 1.0, d / 2 + 0.05), bat, 0.8, 0, 0.5);
  for (const x of [w / 8, w / 3]) {
    s.add(new THREE.BoxGeometry(1.0, 0.8, 0.08), M(x, h - 1.3, d / 2 + 0.04), bat, 0.8, 0, 0);
    s.add(new THREE.BoxGeometry(0.85, 0.65, 0.08), M(x, h - 1.3, d / 2 + 0.06), [0.06, 0.06, 0.06], 0.2, 0, 0);
  }
}

function shed(s: Sink, m: THREE.Matrix4, b: FarmBld, seed: number): void {
  const { w, d, h, roof } = b;
  const M = (x: number, y: number, z: number) => m.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));
  const wood: RGB = [0.2, 0.15, 0.11];
  // open front (+z): posts; boarded back and ends
  s.mudTop = 0.6;
  s.mudSpan = 0.6;
  s.surf = S.boards;
  s.add(new THREE.BoxGeometry(w, h + 0.3, 0.12), M(0, (h + 0.3) / 2 - 0.3, -d / 2), wood, 0.9, 0, 0.6);
  for (const sx of [-1, 1]) s.add(new THREE.BoxGeometry(0.12, h + 0.3, d), M((sx * w) / 2, (h + 0.3) / 2 - 0.3, 0), wood, 0.9, 0, 0.6);
  gableEnds(s, M(0, 0, 0), w, d, h, roof, wood, 0.9);
  s.surf = S.plain;
  for (let x = -w / 2 + 3; x < w / 2 - 1; x += 3) s.add(new THREE.BoxGeometry(0.18, h + 0.3, 0.18), M(x, (h + 0.3) / 2 - 0.3, d / 2 - 0.1), [0.25, 0.2, 0.15], 0.9, 0, 0.6);
  s.add(new THREE.BoxGeometry(w, 0.25, 0.2), M(0, h - 0.12, d / 2 - 0.1), [0.25, 0.2, 0.15], 0.9, 0, 0);
  roofSlabs(s, m, w, d, h, roof, 0.35, rnd(seed, 6) < 0.5 ? [0.34, 0.35, 0.35] : [0.28, 0.13, 0.08], S.sheet, 0.5, 0.4, 0.06);
  // dark interior floor so the open front reads as a covered space; straw bales stacked inside
  s.surf = S.concrete;
  s.add(new THREE.BoxGeometry(w - 0.3, 0.3, d - 0.3), M(0, -0.12, 0), [0.25, 0.23, 0.2], 1, 0, 1);
  s.surf = S.straw;
  for (let i = 0; i < 6; i++) for (let k = 0; k < 2; k++) s.add(new THREE.BoxGeometry(1.15, 0.45, 0.5), M(-w / 2 + 1.2 + i * 1.2, 0.25 + k * 0.46, -d / 2 + 0.6 + (k % 2) * 0.1), [0.62, 0.5, 0.28], 1, 0, 0.3);
  s.surf = S.plain;
}

export function buildFarmstead(site: FarmSite, H: (x: number, z: number) => number, fog: boolean, mat: THREE.Material): THREE.Mesh {
  const s = new Sink();
  const cy = Math.cos(site.yaw),
    sy = Math.sin(site.yaw);
  // local (site frame, metres) → world, and the ground there relative to the mesh origin
  const toW = (lx: number, lz: number) => [site.x + lx * cy + lz * sy, site.z - lx * sy + lz * cy];
  const gy = (lx: number, lz: number) => {
    const [x, z] = toW(lx, lz);
    return H(x, z) - site.y;
  };
  let barnB: FarmBld | null = null;
  for (const b of site.blds) {
    const m = new THREE.Matrix4().makeRotationY(b.yawOff).setPosition(b.lx, b.y - site.y, b.lz);
    s.base = b.y - site.y;
    if (b.kind === 0) house(s, m, b, site.seed);
    else if (b.kind === 1) {
      barn(s, m, b, site.seed);
      barnB = b;
    } else shed(s, m, b, site.seed);
  }
  s.mudTop = 0.5;
  s.mudSpan = 0.5;
  if (barnB) {
    const b = barnB;
    const ry = b.yawOff;
    const cr = Math.cos(ry),
      sr = Math.sin(ry);
    // barn-local → site-local
    const L = (x: number, z: number): [number, number] => [b.lx + x * cr + z * sr, b.lz - x * sr + z * cr];
    // silo at the barn's back corner
    if (rnd(site.seed, 7) < 0.75) {
      const [sx, sz] = L(b.w / 2 - 2.5, -b.d / 2 - 3.2);
      const y0 = gy(sx, sz);
      s.base = y0;
      const R = 2.2,
        Hs = 9 + 3 * rnd(site.seed, 8);
      s.surf = S.concrete;
      s.add(new THREE.CylinderGeometry(R + 0.25, R + 0.3, 0.8, 24), new THREE.Matrix4().makeTranslation(sx, y0 + 0.1, sz), [0.45, 0.43, 0.4], 0.9, 0, 1);
      s.surf = S.galv;
      s.add(new THREE.CylinderGeometry(R, R, Hs, 32, 1, true), new THREE.Matrix4().makeTranslation(sx, y0 + 0.5 + Hs / 2, sz), [0.5, 0.51, 0.52], 0.45, 0.7, 0.5);
      s.add(new THREE.ConeGeometry(R + 0.12, 1.3, 32), new THREE.Matrix4().makeTranslation(sx, y0 + 0.5 + Hs + 0.65, sz), [0.5, 0.51, 0.52], 0.45, 0.7, 0);
      s.surf = S.plain;
      // caged ladder up the side facing the barn
      const lx = sx + R * 1.04 * Math.sin(ry),
        lz = sz + R * 1.04 * Math.cos(ry);
      const tx = Math.cos(ry) * 0.22,
        tz = -Math.sin(ry) * 0.22;
      for (const k of [-1, 1]) s.rod([lx + tx * k, y0 + 1.2, lz + tz * k], [lx + tx * k, y0 + Hs + 0.6, lz + tz * k], 0.02, 0.02, 5, [0.4, 0.4, 0.4], 0.4, 0.7, 0);
      for (let y = 1.4; y < Hs + 0.4; y += 0.3) s.rod([lx - tx, y0 + y, lz - tz], [lx + tx, y0 + y, lz + tz], 0.012, 0.012, 4, [0.4, 0.4, 0.4], 0.4, 0.7, 0);
      for (let y = 3; y < Hs + 0.5; y += 0.9) {
        const t = new THREE.TorusGeometry(0.4, 0.015, 4, 12, Math.PI);
        s.add(t, new THREE.Matrix4().makeRotationX(Math.PI / 2).premultiply(new THREE.Matrix4().makeRotationY(ry + Math.PI / 2)).setPosition(lx + Math.sin(ry) * 0.02, y0 + y, lz + Math.cos(ry) * 0.02), [0.4, 0.4, 0.4], 0.4, 0.7, 0);
      }
    }
    // round bales: a straw pyramid beside the barn, a row of wrapped silage bales along its wall
    const rb = (lx: number, lz: number, up: number, yawB: number, surf: number, c: RGB, rough: number) => {
      const y0 = gy(lx, lz);
      if (y0 + site.y < -1.0) return; // not on the river bank / in the water
      s.base = y0;
      s.surf = surf;
      const g = new THREE.CylinderGeometry(0.68, 0.68, 1.2, 18, 1, false);
      // bevel the rims a little (bales are rounded)
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i)) > 0.59) p.setXYZ(i, p.getX(i) * 0.93, p.getY(i), p.getZ(i) * 0.93);
      g.computeVertexNormals();
      const mm = new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(new THREE.Matrix4().makeRotationY(yawB)).setPosition(lx, y0 + 0.64 + up, lz);
      s.add(g, mm, c, rough, 0, 0.4);
      s.surf = S.plain;
    };
    {
      const [bx, bz] = L(-b.w / 2 + 2, b.d / 2 + 5);
      const straw: RGB = [0.62, 0.5, 0.28];
      for (let i = 0; i < 4; i++) rb(bx + (i - 1.5) * 1.42 * Math.cos(ry), bz - (i - 1.5) * 1.42 * Math.sin(ry), 0, ry + Math.PI / 2, S.straw, straw, 1);
      for (let i = 0; i < 3; i++) rb(bx + (i - 1) * 1.42 * Math.cos(ry), bz - (i - 1) * 1.42 * Math.sin(ry), 1.16, ry + Math.PI / 2, S.straw, [straw[0] * 0.95, straw[1] * 0.93, straw[2] * 0.9], 1);
      const wrapC: RGB = rnd(site.seed, 9) < 0.5 ? [0.02, 0.02, 0.02] : rnd(site.seed, 10) < 0.5 ? [0.75, 0.75, 0.72] : [0.08, 0.16, 0.08];
      const n = 4 + Math.floor(rnd(site.seed, 11) * 5);
      for (let i = 0; i < n; i++) {
        const [wx, wz] = L(-b.w / 2 + 3 + i * 1.35, -b.d / 2 - 1.4);
        rb(wx, wz, 0, ry, S.wrap, wrapC, 0.3);
      }
    }
    // paddock: post-and-rail fence round a rectangle off the barn's far end, five-bar gate in its near side
    {
      // try the barn's two ends (and both flanks): the first rectangle clear of the other buildings
      const others = site.blds.filter((o) => o !== b);
      const clear = (cs: [number, number][]) => {
        for (let e = 0; e < 4; e++)
          for (let t = 0; t <= 1; t += 0.05) {
            const [ux, uz] = L(cs[e][0] + (cs[(e + 1) % 4][0] - cs[e][0]) * t, cs[e][1] + (cs[(e + 1) % 4][1] - cs[e][1]) * t);
            for (const o of others) {
              const dx = ux - o.lx,
                dz = uz - o.lz;
              const c = Math.cos(o.yawOff),
                s2 = Math.sin(o.yawOff);
              const ox = dx * c - dz * s2,
                oz = dx * s2 + dz * c;
              if (Math.abs(ox) < o.w / 2 + 2 && Math.abs(oz) < o.d / 2 + 2) return false;
            }
          }
        return true;
      };
      const opts: [number, number][][] = [];
      for (const side of [1, -1]) {
        const px0 = side * (b.w / 2 + 6),
          px1 = px0 + side * 34;
        opts.push([
          [px0, -b.d / 2 - 4],
          [px1, -b.d / 2 - 4],
          [px1, b.d / 2 + 18],
          [px0, b.d / 2 + 18],
        ]);
      }
      opts.push([
        [-b.w / 2, -b.d / 2 - 6],
        [b.w / 2, -b.d / 2 - 6],
        [b.w / 2, -b.d / 2 - 36],
        [-b.w / 2, -b.d / 2 - 36],
      ]);
      const corners = opts.find(clear) ?? null;
      if (corners) {
      const post: RGB = [0.27, 0.22, 0.16],
        rail: RGB = [0.33, 0.27, 0.2];
      for (let e = 0; e < 4; e++) {
        const [ax, az] = corners[e],
          [bx2, bz2] = corners[(e + 1) % 4];
        const len = Math.hypot(bx2 - ax, bz2 - az);
        const n = Math.ceil(len / 2.6);
        const gate = e === 3; // the side facing the yard
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const [ux, uz] = L(ax + (bx2 - ax) * t, az + (bz2 - az) * t);
          const yy = gy(ux, uz);
          if (yy + site.y < -1.0) continue;
          s.base = yy;
          const tilt = (rnd(site.seed, 100 + e * 50 + i) - 0.5) * 0.06;
          s.add(new THREE.BoxGeometry(0.13, 1.35, 0.13), new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tilt, ry, tilt * 0.7)).setPosition(ux, yy + 0.55, uz), post, 0.95, 0, 0.6);
          if (i === n) continue;
          if (gate && i === Math.floor(n / 2)) {
            // galvanised five-bar gate with its diagonal brace
            const [vx, vz] = L(ax + (bx2 - ax) * ((i + 1) / n), az + (bz2 - az) * ((i + 1) / n));
            for (let k = 0; k < 5; k++) s.rod([ux, yy + 0.15 + k * 0.24, uz], [vx, yy + 0.15 + k * 0.24, vz], 0.022, 0.022, 5, [0.55, 0.56, 0.56], 0.4, 0.8, 0.5);
            s.rod([ux, yy + 0.15, uz], [vx, yy + 1.11, vz], 0.02, 0.02, 5, [0.55, 0.56, 0.56], 0.4, 0.8, 0.5);
            continue;
          }
          const [vx, vz] = L(ax + (bx2 - ax) * ((i + 1) / n), az + (bz2 - az) * ((i + 1) / n));
          const vy = gy(vx, vz);
          for (const h2 of [0.45, 0.85, 1.15]) s.rod([ux, yy + h2, uz], [vx, vy + h2, vz], 0.045, 0.045, 4, rail, 0.95, 0, 0.3);
        }
      }
      }
    }
  }
  const mesh = new THREE.Mesh(s.geometry(), mat);
  mesh.position.set(site.x, site.y, site.z);
  mesh.rotation.y = site.yaw;
  mesh.name = 'land-farmstead';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  void fog;
  return mesh;
}

/** vertex-coloured, per-vertex roughness / metalness, procedural surfaces by aSurf (object space) */
export function farmMaterial(fog: boolean): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, fog });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aRM;\nattribute float aSurf;\nvarying vec2 vRM;\nvarying float vSurf;\nvarying vec3 vOP;\nvarying vec3 vON;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM; vSurf = aSurf; vOP = position; vON = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vRM;
varying float vSurf;
varying vec3 vOP;
varying vec3 vON;
float fsH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fsN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fsH(i), fsH(i + vec3(1,0,0)), f.x), mix(fsH(i + vec3(0,1,0)), fsH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fsH(i + vec3(0,0,1)), fsH(i + vec3(1,0,1)), f.x), mix(fsH(i + vec3(0,1,1)), fsH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float gFsBump;
float gFsRough;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  int sf = int(vSurf + 0.5);
  vec3 p = vOP, n = normalize(vON);
  gFsBump = 0.0;
  gFsRough = vRM.x;
  // along-surface horizontal coordinate (walls) and the slope coordinate (roofs)
  vec2 hn = length(n.xz) > 1e-3 ? normalize(n.xz) : vec2(0.0, 1.0);
  float u = dot(p.xz, vec2(-hn.y, hn.x));
  float aa = clamp(1.0 - length(fwidth(p)) * 6.0, 0.0, 1.0);   // fade fine detail with distance
  if (sf == 1) {
    // vertical boards 18-24 cm: joints, per-board tone, grain, a weathered top and splashed foot
    float bw = 0.2;
    float id = floor(u / bw), f = fract(u / bw);
    float joint = smoothstep(0.0, 0.05, f) * smoothstep(1.0, 0.95, f);
    float grain = fsN(vec3(u * 60.0, p.y * 3.0, id));
    diffuseColor.rgb *= mix(0.55, 1.0, mix(1.0, joint, aa)) * (0.82 + 0.3 * fsH(vec3(id, 1.0, 3.0))) * (0.9 + 0.2 * grain * aa);
    gFsBump = (joint * 0.004 + grain * 0.0008) * aa;
  } else if (sf == 2) {
    // corrugated sheets: 76 mm waves across the slope, overlaps every ~0.9 m, rust running down
    float w = sin(u * 82.7);
    float lap = smoothstep(0.02, 0.0, abs(fract(u / 0.9) - 0.5) - 0.48);
    float rust = smoothstep(0.55, 0.8, fsN(vec3(u * 2.0, p.y * 0.6, 0.0)) + 0.3 * fsN(vec3(u * 9.0, p.y * 0.2, 4.0)));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.12, 0.05), rust * 0.55);
    diffuseColor.rgb *= 0.9 + 0.12 * w * aa - 0.25 * lap * aa;
    gFsBump = w * 0.006 * aa;
    gFsRough = mix(vRM.x, 0.85, rust);
  } else if (sf == 3) {
    // clay tiles: courses 30 cm down the slope, staggered 22 cm tiles, a shadowed lower lip on each
    float sl = p.y * 3.3;
    float row = floor(sl), fr = fract(sl);
    float col = floor(u / 0.22 + row * 0.5);
    float tile = 0.8 + 0.35 * fsH(vec3(row, col, 5.0)) + 0.1 * fsN(p * 8.0);
    float lip = smoothstep(0.0, 0.25, fr);
    float side = smoothstep(0.0, 0.08, fract(u / 0.22 + row * 0.5)) ;
    diffuseColor.rgb *= tile * mix(1.0, mix(0.55, 1.0, lip) * mix(0.8, 1.0, side), aa);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.78, 0.6), smoothstep(0.6, 0.85, fsN(p * 2.1)) * 0.5); // moss / lichen
    gFsBump = (fr * 0.012 + side * 0.003) * aa;
  } else if (sf == 4) {
    // render: trowel unevenness, faint staining under the eaves
    float t = fsN(p * 3.0) * 0.6 + fsN(p * 17.0) * 0.4;
    diffuseColor.rgb *= 0.9 + 0.16 * t;
    gFsBump = fsN(p * 40.0) * 0.0015 * aa;
  } else if (sf == 5) {
    // brick: 6.5 cm courses, stretcher bond, recessed mortar
    float r = floor(p.y / 0.075), fy = fract(p.y / 0.075);
    float b = floor(u / 0.225 + r * 0.5), fx = fract(u / 0.225 + r * 0.5);
    float mort = smoothstep(0.0, 0.12, fy) * smoothstep(0.0, 0.05, fx);
    diffuseColor.rgb *= mix(1.0, mix(1.8, 1.0, mort), aa) * (0.8 + 0.35 * fsH(vec3(r, b, 2.0)));
    gFsBump = mort * 0.003 * aa;
  } else if (sf == 6) {
    // galvanised silo: horizontal ring seams every 0.8 m, bolt rows, spangle, streaks of white rust
    float seam = smoothstep(0.03, 0.0, abs(fract(p.y / 0.8) - 0.5) - 0.46);
    float wav = sin(p.y * 82.7);
    diffuseColor.rgb *= (0.88 + 0.22 * fsN(p * vec3(4.0, 0.5, 4.0))) * (1.0 - 0.3 * seam * aa) * (0.93 + 0.07 * wav * aa);
    gFsBump = wav * 0.004 * aa;
  } else if (sf == 7) {
    // stretch wrap: glossy, layered bands and wrinkles
    float b = fsN(vec3(p.x * 3.0 + p.z * 3.0, p.y * 12.0, 1.0));
    diffuseColor.rgb *= 0.85 + 0.25 * b;
    gFsBump = b * 0.004 * aa;
  } else if (sf == 8) {
    // straw: fibres in every direction, darker weathered outer layer
    float fib = fsN(p * vec3(70.0, 9.0, 70.0)) * 0.5 + fsN(p * vec3(9.0, 70.0, 30.0)) * 0.5;
    diffuseColor.rgb *= 0.72 + 0.45 * fib;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.35, 0.31, 0.24), 0.35 * fsN(p * 2.0));
    gFsBump = fib * 0.01 * aa;
  } else if (sf == 9) {
    // concrete: pitted, oil and mud stains
    float t = fsN(p * 4.0) * 0.5 + fsN(p * 30.0) * 0.5;
    diffuseColor.rgb *= 0.82 + 0.25 * t;
    gFsBump = fsN(p * 80.0) * 0.0012 * aa;
  }
}`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gFsRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(gFsBump) * r1 + dFdy(gFsBump) * r2);
  normal = normalize(abs(det) * normal - g);
}`,
      );
  };
  m.customProgramCacheKey = () => 'th-farmstead-v1';
  return m;
}

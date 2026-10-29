// Reusable architectural & small parts for the landmarks: palette, mansard roofs, quoins,
// chimneys, finials, dormers, wall lanterns, flagpoles with waving flags, low-poly people.

import * as THREE from 'three';
import { ANIM, FLOOD, LM, LMODE, M, Mat, PAT, withM } from './builder';
import { Kit, V3 } from './kit';
import type { Env } from './env';
import { actorsOff, addActor, type ActorDef, type ActorRole } from '../../sim/pedestrians/actorDefs';

const _pv = new THREE.Vector3();
const _pp = new THREE.Vector3();
const _pa = new THREE.Vector3();

export const C = {
  stoneLight: '#e6dcc6',
  stone: '#d6c7a8',
  stoneWarm: '#dcc59d',
  stoneDark: '#a8987f',
  granite: '#8e8a84',
  graniteDark: '#6d6a66',
  brick: '#a75a3f',
  brickDark: '#8a4733',
  brickFactory: '#9b4e36',
  slate: '#56606c',
  slateDark: '#454d57',
  copper: '#69a891',
  copperDark: '#4f8a76',
  zinc: '#9ea8ae',
  iron: '#2c3936',
  ironGreen: '#2f4d43',
  gold: '#d8ad48',
  cream: '#f1e8d4',
  white: '#f3f0e8',
  concrete: '#c2bdb3',
  concreteDark: '#9f9a91',
  wood: '#8b5e3c',
  woodLight: '#b98d60',
  woodDark: '#5e3d27',
  craneYellow: '#f0b21c',
  red: '#c8382f',
  green: '#3f7d4f',
  steel: '#8f9ba3',
  steelLight: '#c3ccd2',
  plaster: '#efe3cb',
  plasterWarm: '#f0d7a8',
  terracotta: '#b65a3c',
} as const;

/** Common surfaces. */
export const S = {
  stone: () => M(C.stone, PAT.STONE, 0.85, 0, 0, FLOOD.WARM, 0.2),
  stoneRust: () => M(C.stoneWarm, PAT.STONE, 0.88, 0, 0, FLOOD.WARM, 0.8),
  stoneTrim: () => M(C.stoneLight, PAT.PLAIN, 0.8, 0, 0, FLOOD.WARM),
  brick: () => M(C.brick, PAT.BRICK, 0.9, 0, 0, FLOOD.WARM, 0.3),
  slate: () => M(C.slate, PAT.SLATE, 0.6, 0, 0, 0, 0.2),
  zinc: () => M(C.zinc, PAT.SEAM, 0.45, 0.4, 0, 0, 0.3),
  copper: () => M(C.copper, PAT.SEAM, 0.55, 0.15, 0, 0, 0.6),
  iron: () => M(C.iron, PAT.PLAIN, 0.45, 0.5),
  gold: () => M(C.gold, PAT.PLAIN, 0.3, 0.85),
  tiles: () => M(C.terracotta, PAT.TILES, 0.75, 0, 0, 0, 0.4),
};

/**
 * Mansard roof over [x0,x1]×[z0,z1]: steep faces from y0 (eaves rectangle) to y1 (inset
 * rectangle), then a low top (flat, or pyramid to yTop). sides: which faces to build.
 */
export function mansard(
  K: Kit,
  steep: Mat,
  top: Mat,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  inset: number,
  sides = { n: true, s: true, e: true, w: true },
  yTop = y1,
): void {
  const a = x0,
    b = x1,
    c = z0,
    d = z1;
  const ia = sides.w ? a + inset : a,
    ib = sides.e ? b - inset : b,
    ic = sides.n ? c + inset : c,
    id = sides.s ? d - inset : d;
  if (sides.s)
    K.roofFace(steep, [
      [a, y0, d],
      [b, y0, d],
      [ib, y1, id],
      [ia, y1, id],
    ]);
  if (sides.n)
    K.roofFace(steep, [
      [b, y0, c],
      [a, y0, c],
      [ia, y1, ic],
      [ib, y1, ic],
    ]);
  if (sides.e)
    K.roofFace(steep, [
      [b, y0, d],
      [b, y0, c],
      [ib, y1, ic],
      [ib, y1, id],
    ]);
  if (sides.w)
    K.roofFace(steep, [
      [a, y0, c],
      [a, y0, d],
      [ia, y1, id],
      [ia, y1, ic],
    ]);
  if (yTop > y1 + 0.01) K.pyramid(top, ia, ib, ic, id, y1, yTop, 0);
  else
    K.poly(top, [
      [ia, y1, id],
      [ib, y1, id],
      [ib, y1, ic],
      [ia, y1, ic],
    ]);
}

/** Alternating quoin blocks on a vertical building corner at (x, z), facing the two outward dirs. */
export function quoins(K: Kit, m: Mat, x: number, z: number, sx: number, sz: number, y0: number, y1: number, size = 0.5): void {
  const n = Math.floor((y1 - y0) / size);
  const prev = K.b.forceDetail;
  K.b.forceDetail = true;
  for (let i = 0; i < n; i++) {
    const long = i % 2 === 0;
    const lx = long ? 0.75 : 0.45,
      lz = long ? 0.45 : 0.75;
    K.box(m, lx, size - 0.05, 0.06, x - sx * (lx / 2), y0 + i * size, z + sz * 0.03);
    K.box(m, 0.06, size - 0.05, lz, x + sx * 0.03, y0 + i * size, z - sz * (lz / 2));
  }
  K.b.forceDetail = prev;
}

export function chimney(K: Kit, m: Mat, x: number, y: number, z: number, w = 0.7, d = 0.5, h = 1.6): void {
  K.box(m, w, h, d, x, y, z);
  K.box(withM(m, { pat: PAT.PLAIN }), w + 0.12, 0.14, d + 0.12, x, y + h, z);
  K.cyl(M('#7a4a3a', PAT.PLAIN, 0.9), 0.08, 0.08, 0.35, x - w * 0.2, y + h + 0.14, z, 6);
  K.cyl(M('#7a4a3a', PAT.PLAIN, 0.9), 0.08, 0.08, 0.3, x + w * 0.2, y + h + 0.14, z, 6);
}

/** Small spire finial / lightning-rod spike. */
export function finial(K: Kit, m: Mat, x: number, y: number, z: number, h = 1.2, r = 0.12): void {
  K.sphere(m, r * 1.3, x, y + r, z, 8, 6);
  K.cone(m, r, h, x, y + r * 1.8, z, 6);
}

/** Dormer with an arched window on a roof slope; front face at z (local +Z out), base at y. */
export function dormer(K: Kit, wallM: Mat, roofM: Mat, x: number, y: number, z: number, w = 1.1, h = 1.3, d = 1.2, ry = 0, glow = 0.6, seed = 0.4): void {
  const c = Math.cos(ry),
    s = Math.sin(ry);
  const P = (lx: number, ly: number, lz: number): V3 => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  K.box(wallM, w, h, d, x - s * (d / 2), y, z - c * (d / 2), ry);
  // little gable roof
  const o = 0.12;
  K.roofFace(roofM, [P(-w / 2 - o, h, -d), P(-w / 2 - o, h, o), P(0, h + 0.55, o), P(0, h + 0.55, -d)]);
  K.roofFace(roofM, [P(w / 2 + o, h, o), P(w / 2 + o, h, -d), P(0, h + 0.55, -d), P(0, h + 0.55, o)]);
  K.poly(wallM, [P(-w / 2, h, 0.001), P(w / 2, h, 0.001), P(0, h + 0.5, 0.001)]);
  // window
  K.panel(M('#f1ece0', PAT.WINDOW, 0.3, 0, glow, 0, seed), w * 0.62, h * 0.72, P(0, 0.18, 0.03)[0], y + 0.18, P(0, 0.18, 0.03)[2], ry);
}

/** Wall lantern on a bracket (lights + glow). Local position on the wall face, facing ry. */
export function wallLantern(env: Env, K: Kit, x: number, y: number, z: number, ry: number, glowSize = 0.9): void {
  const c = Math.cos(ry),
    s = Math.sin(ry);
  const out = 0.45;
  const iron = S.iron();
  K.beam(iron, [x, y + 0.25, z], [x + s * out, y + 0.25, z + c * out], 0.05);
  K.beam(iron, [x, y - 0.1, z], [x + s * out * 0.8, y + 0.22, z + c * out * 0.8], 0.04);
  const lx = x + s * out,
    lz = z + c * out;
  K.cyl(iron, 0.14, 0.1, 0.1, lx, y + 0.2, lz, 6);
  env.L.cyl(LM('#ffd9a0', LMODE.NIGHT, 3.2, 0, 0.12), 0.13, 0.1, 0.36, lx, y - 0.16, lz, 6);
  K.cone(iron, 0.17, 0.2, lx, y + 0.2, lz, 6);
  env.glow(lx, y + 0.02, lz, { size: glowSize, kind: 'halo', color: '#ffcf8a', intensity: 0.95 });
}

/** Flagpole with a waving flag (kinetic). design: 0..7 (see lmFlagColor). */
export function flagpole(env: Env, x: number, y: number, z: number, h: number, flagLen: number, design: number, phase = 0, poleR = 0.06): void {
  const K = env.S;
  K.cyl(M(C.white, PAT.PLAIN, 0.4, 0.5), poleR * 0.7, poleR, h, x, y, z, 8);
  K.sphere(S.gold(), poleR * 1.6, x, y + h + poleR, z, 8, 6);
  const fh = flagLen * 0.62;
  const top = y + h - 0.12;
  env.anim({ mode: ANIM.FLAG, pivot: new THREE.Vector3(x, top, z), axis: new THREE.Vector3(1, 0, 0), a: flagLen, b: phase, c: 0 });
  // subdivided cloth so the wave reads (8 x 3)
  const g = new THREE.PlaneGeometry(flagLen, fh, 10, 3);
  g.translate(flagLen / 2 + poleR, -fh / 2, 0);
  const m = M('#ffffff', PAT.FLAG, 0.9, 0, 0, 0, (design + 0.5) / 8);
  env.K.geo(m, g, x, top, z, 0, 'native');
  g.dispose();
  env.anim(null);
}

/**
 * Low-poly person (for static scenes: musicians, workers, statue groups). Built standing
 * on (x, y, z) facing ry. Returns nothing; colours: shirt, trousers, skin, hat (optional).
 */
export function person(K: Kit, x: number, y: number, z: number, ry: number, shirt: THREE.ColorRepresentation, trousers: THREE.ColorRepresentation, skin: THREE.ColorRepresentation, hat?: THREE.ColorRepresentation, seated = false, armsUp = 0, k = 1, role: ActorRole = k < 0.8 ? 'kid' : armsUp > 0 ? 'conductor' : seated ? 'band' : 'worker'): void {
  if (!actorsOff) {
    // F2: a real posed figure of the pedestrians' crowd renderer stands here instead (sim/pedestrians/actorDefs.ts)
    const b = K.b;
    _pv.set(x, y, z).applyMatrix4(b.frame);
    const an = b.anim;
    let rot: ActorDef['rot'] = null;
    let vis = -1;
    if (an && (an.mode === ANIM.SWING || an.mode === ANIM.VIS)) {
      if (an.mode === ANIM.VIS) vis = an.a;
      const amp = an.mode === ANIM.SWING ? an.a : an.b;
      if (Math.abs(amp) > 0.1) {
        _pp.copy(an.pivot).applyMatrix4(b.frame);
        _pa.copy(an.axis).transformDirection(b.frame);
        rot = { px: _pp.x, py: _pp.y, pz: _pp.z, ax: _pa.x, ay: _pa.y, az: _pa.z, amp, freq: an.mode === ANIM.SWING ? an.b : 2.2, ph: an.c };
      }
    }
    const sc = new THREE.Color(shirt);
    addActor({ x: _pv.x, y: _pv.y, z: _pv.z, yaw: b.yaw + ry, role, seated, seatY: 0.45 * k, shirt: role === 'worker' ? -1 : sc.getHex(), vis, rot, child: k < 0.8 });
    return;
  }
  const c = Math.cos(ry),
    s = Math.sin(ry);
  const P = (lx: number, lz: number): [number, number] => [x + lx * k * c + lz * k * s, z - lx * k * s + lz * k * c];
  const sh = M(shirt, PAT.PLAIN, 0.85);
  const tr = M(trousers, PAT.PLAIN, 0.85);
  const sk = M(skin, PAT.PLAIN, 0.7);
  const legH = (seated ? 0.45 : 0.82) * k;
  const hipY = y + legH;
  if (seated) {
    // thighs forward + shins down
    for (const sx of [-0.1, 0.1]) {
      const [tx, tz] = P(sx, 0.2);
      K.box(tr, 0.13 * k, 0.13 * k, 0.42 * k, tx, hipY - 0.08 * k, tz, ry);
      const [lx, lz] = P(sx, 0.38);
      K.box(tr, 0.12 * k, legH - 0.05 * k, 0.13 * k, lx, y, lz, ry);
    }
  } else {
    for (const sx of [-0.1, 0.1]) {
      const [lx, lz] = P(sx, 0);
      K.box(tr, 0.14 * k, legH, 0.16 * k, lx, y, lz, ry);
    }
  }
  const [bx, bz] = P(0, 0);
  K.box(sh, 0.4 * k, 0.58 * k, 0.24 * k, bx, hipY, bz, ry);
  K.box(sk, 0.1 * k, 0.08 * k, 0.1 * k, bx, hipY + 0.58 * k, bz, ry);
  // children get relatively bigger heads
  const hr = (k < 0.8 ? 0.15 : 0.12) * k;
  K.sphere(sk, hr, bx, hipY + 0.66 * k + hr, bz, 8, 6);
  if (hat) K.cyl(M(hat, PAT.PLAIN, 0.6), 0.12 * k, 0.13 * k, 0.1 * k, bx, hipY + 0.82 * k, bz, 8);
  for (const sx of [-0.25, 0.25]) {
    const [ax, az] = P(sx, 0);
    if (armsUp > 0) K.boxC(sh, 0.1 * k, 0.55 * k, 0.1 * k, ax, hipY + (0.55 + 0.28 * armsUp) * k, az, 0, ry, sx * -0.4 * armsUp);
    else K.box(sh, 0.1 * k, 0.55 * k, 0.11 * k, ax, hipY + 0.02 * k, az, ry);
  }
}

/** A short run of iron cresting / railing as a cutout quad on the kinetic mesh. */
export function railing(env: Env, a: V3, b: V3, h: number, color: THREE.ColorRepresentation = C.iron, stone = false, twoSided = false): void {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const m = M(color, PAT.RAILING, stone ? 0.85 : 0.5, stone ? 0 : 0.4, h, stone ? FLOOD.WARM : 0, stone ? 0.75 : 0.2);
  env.K.quad(m, a, b, [b[0], b[1] + h, b[2]], [a[0], a[1] + h, a[2]], len, h, twoSided);
}

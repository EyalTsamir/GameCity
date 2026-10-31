// The working container quay at eye level (`?noquaylife2`): the lane under the cranes used to be bare concrete. Painted
// walkways and bay lines, oil stains, lashing-bar stillages, twist-lock bins, drums on spill pallets, coiled hawsers, cones
// round an open manhole, service pillars, lifebuoys on the edge, a terminal tractor waiting with a boxed chassis, and dockers
// in hi-vis during working hours. Everything sits between the crane rails or on the coping, clear of the ladders and the ship's
// gangway; the big pieces are solid for the walker (occupancy).

import type { CityContext } from '../../core/context';
import { OCC } from '../../core/occupancy';
import type { Rng } from '../../core/rng';
import { addLampLights, type LampLight } from '../../core/lampLight';
import { addActor } from '../../sim/pedestrians/actorDefs';
import { addContainer, pickLook } from './containers';
import { EMIT, HB, PAT, type V3 } from './geo';
import type { GlowPoint } from './material';
import { pallet, stain, torusTube } from './quay';

export interface QuayLifeOpts {
  ctx: CityContext;
  ground(x: number, z: number): number;
  rng: Rng;
  /** free band across the quay (seaward of the crane's container row, inside the seaward rail) */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** the coping (quay edge) */
  edgeX: number;
  ladders: number[];
  glows: GlowPoint[];
}

const NOPE = OCC.ROAD | OCC.BUILDING | OCC.SOLID | OCC.RAIL;

/** a flat painted strip */
function paint(b: HB, x0: number, z0: number, x1: number, z1: number, y: number, col: string): void {
  b.color(col).pat(PAT.NONE);
  b.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]);
}

function steelDrum(b: HB, x: number, y: number, z: number, col: string): void {
  b.color(col);
  b.vcyl(x, y, z, 0.29, 0.88, 12, 2);
  b.color('#2c2e30');
  for (const h of [0.02, 0.3, 0.58, 0.86]) b.vcyl(x, y + h, z, 0.3, 0.025, 12, 0);
  b.vcyl(x + 0.14, y + 0.88, z + 0.08, 0.035, 0.015, 6, 2);
}

/** lashing bars standing bundled in a yellow stillage, turnbuckles on a shelf */
function stillage(b: HB, x: number, y: number, z: number): void {
  const w = 0.95,
    d = 2.3,
    h = 1.15;
  b.color('#d9a81e').pat(PAT.GRIME, 0.5);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) b.boxMM(x + sx * w * 0.5 - 0.04, y, z + sz * d * 0.5 - 0.04, x + sx * w * 0.5 + 0.04, y + h, z + sz * d * 0.5 + 0.04);
  for (const yy of [0.14, h - 0.06])
    for (const sx of [-1, 1]) b.boxMM(x + sx * w * 0.5 - 0.03, y + yy, z - d * 0.5, x + sx * w * 0.5 + 0.03, y + yy + 0.06, z + d * 0.5);
  for (const sz of [-1, 0, 1]) b.boxMM(x - w * 0.5, y + 0.14, z + sz * d * 0.45 - 0.03, x + w * 0.5, y + 0.2, z + sz * d * 0.45 + 0.03);
  b.pat(PAT.NONE).color('#4c4f50');
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 3; j++) {
      const bx = x - 0.24 + j * 0.2 + (i % 2) * 0.05,
        by = y + 0.26 + i * 0.075;
      b.cyl([bx, by, z - d * 0.5 - 0.22 - (i % 3) * 0.04], [bx, by, z + d * 0.5 + 0.12 + (j % 2) * 0.06], 0.017, 0.017, 5, 0);
    }
}

/** an open steel basket of twist-locks */
function twistBin(b: HB, x: number, y: number, z: number, rng: Rng): void {
  b.color('#2f5f9a').pat(PAT.GRIME, 0.6);
  const s = 0.62,
    h = 0.74;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) b.boxMM(x + sx * s - 0.035, y, z + sz * s - 0.035, x + sx * s + 0.035, y + h, z + sz * s + 0.035);
  for (const yy of [0.08, 0.38, h - 0.04]) {
    for (const sz of [-1, 1]) b.boxMM(x - s, y + yy, z + sz * s - 0.02, x + s, y + yy + 0.04, z + sz * s + 0.02);
    for (const sx of [-1, 1]) b.boxMM(x + sx * s - 0.02, y + yy, z - s, x + sx * s + 0.02, y + yy + 0.04, z + s);
  }
  b.boxMM(x - s, y + 0.08, z - s, x + s, y + 0.11, z + s);
  b.pat(PAT.NONE);
  for (let i = 0; i < 18; i++) {
    const px = x + (rng.next() - 0.5) * 1.05,
      pz = z + (rng.next() - 0.5) * 1.05,
      py = y + 0.34 + rng.next() * 0.14;
    b.color(i % 4 === 0 ? '#8a5f34' : '#5c5f60');
    b.box(px, py, pz, 0.13, 0.11, 0.16, rng.next() * 3, 0);
    b.cyl([px, py + 0.11, pz], [px, py + 0.2, pz], 0.05, 0.015, 5, 0);
  }
}

/** a mooring hawser laid up in coils on a pallet */
function hawser(b: HB, x: number, y: number, z: number, col: string, rng: Rng): void {
  pallet(b, x, y, z, rng.next() * 0.5);
  b.color(col).pat(PAT.NONE);
  for (let i = 0; i < 4; i++) torusTube(b, x + (i % 2) * 0.03, y + 0.2 + i * 0.075, z - (i % 2) * 0.03, 0.42 - i * 0.015, 0.04, 'y', 18);
}

/** cones and a chequered plate leaning against the barrier: somebody is down the manhole */
function manhole(b: HB, x: number, y: number, z: number): void {
  b.color('#2a2c2e');
  b.vcyl(x, y, z, 0.45, 0.012, 16, 2);
  b.color('#3a3d3f');
  b.vcyl(x + 0.82, y, z + 0.1, 0.42, 0.03, 16, 2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const cx = x + Math.sin(a) * 1.15,
      cz = z + Math.cos(a) * 1.15;
    b.color('#26282a');
    b.box(cx, y + 0.012, cz, 0.3, 0.024, 0.3, 0, 0);
    b.color('#e8591c');
    b.cyl([cx, y + 0.024, cz], [cx, y + 0.3, cz], 0.1, 0.05, 8, 0);
    b.color('#f2f0ea');
    b.cyl([cx, y + 0.3, cz], [cx, y + 0.42, cz], 0.05, 0.03, 8, 0);
    b.color('#e8591c');
    b.cyl([cx, y + 0.42, cz], [cx, y + 0.56, cz], 0.03, 0.012, 8, 2);
  }
}

/** a reefer-plug and water pillar, its cable lying in loops */
function pillar(b: HB, x: number, y: number, z: number, rng: Rng): void {
  b.color('#3f7a5c').pat(PAT.GRIME, 0.4);
  b.boxMM(x - 0.32, y, z - 0.22, x + 0.32, y + 1.25, z + 0.22);
  b.pat(PAT.NONE).color('#2b5842');
  b.boxMM(x - 0.35, y + 1.25, z - 0.25, x + 0.35, y + 1.3, z + 0.25);
  b.color('#e0b62a');
  b.boxMM(x - 0.1, y + 0.8, z - 0.23, x + 0.1, y + 1.0, z - 0.22);
  b.color('#c8cbcc');
  for (const sx of [-1, 1]) b.vcyl(x + sx * 0.16, y + 0.45, z - 0.24, 0.05, 0.1, 8, 2);
  b.color('#1d1e20');
  const pts: V3[] = [[x - 0.16, y + 0.46, z - 0.28]];
  for (let i = 0; i < 9; i++) pts.push([x - 0.4 - i * 0.14 + Math.sin(i * 1.7) * 0.2, y + 0.03, z - 0.5 - Math.cos(i * 1.1) * 0.35 - rng.next() * 0.05]);
  b.tube(pts, 0.018, 5);
}

function lifebuoy(b: HB, x: number, y: number, z: number): void {
  b.color('#b53a2a');
  b.boxMM(x - 0.04, y, z - 0.04, x + 0.04, y + 1.3, z + 0.04);
  b.color('#ee6c2a');
  torusTube(b, x - 0.1, y + 0.92, z, 0.26, 0.055, 'x', 14);
  b.color('#f1efe6');
  for (const a of [0.8, 2.4, 3.9, 5.5]) b.cyl([x - 0.1, y + 0.92 + Math.sin(a) * 0.26 - 0.05, z + Math.cos(a) * 0.26], [x - 0.1, y + 0.92 + Math.sin(a) * 0.26 + 0.05, z + Math.cos(a) * 0.26], 0.06, 0.06, 6, 0);
}

/** terminal tractor (+z = forward) with a skeletal chassis behind and a container on it */
function terminalTractor(b: HB, x: number, y: number, z: number, rng: Rng): void {
  const wheel = (wx: number, wz: number, r = 0.5, w = 0.34) => {
    b.color('#1b1c1e');
    b.cyl([wx - w / 2, y + r, wz], [wx + w / 2, y + r, wz], r, r, 14, 3);
    b.color('#b8b9b4');
    b.cyl([wx - w / 2 - 0.01, y + r, wz], [wx + w / 2 + 0.01, y + r, wz], r * 0.55, r * 0.55, 10, 3);
  };
  // cab offset to one side, as on the real thing
  b.color('#e0a31c').pat(PAT.GRIME, 0.7);
  b.boxMM(x - 1.15, y + 0.55, z + 1.8, x + 1.15, y + 1.3, z + 4.5);
  b.boxMM(x - 1.15, y + 1.3, z + 3.1, x + 0.2, y + 3.2, z + 4.5);
  b.boxMM(x - 1.2, y + 3.2, z + 3.05, x + 0.25, y + 3.28, z + 4.55);
  b.pat(PAT.NONE);
  b.color('#1e2a30').pat(PAT.GLASS);
  b.boxMM(x - 1.16, y + 2.0, z + 3.3, x - 1.14, y + 3.05, z + 4.3);
  b.boxMM(x + 0.19, y + 2.0, z + 3.3, x + 0.21, y + 3.05, z + 4.3);
  b.boxMM(x - 1.05, y + 2.0, z + 4.49, x + 0.1, y + 3.05, z + 4.51);
  b.boxMM(x - 1.05, y + 2.0, z + 3.09, x + 0.1, y + 3.05, z + 3.11);
  b.pat(PAT.NONE);
  b.color('#2a2b2c');
  b.boxMM(x - 1.2, y + 0.55, z + 4.5, x + 1.2, y + 0.85, z + 4.62);
  b.boxMM(x + 0.45, y + 1.3, z + 3.3, x + 0.62, y + 3.4, z + 3.47);
  b.color('#f6eec8');
  for (const sx of [-1, 1]) b.boxMM(x + sx * 0.9 - 0.11, y + 0.95, z + 4.5, x + sx * 0.9 + 0.11, y + 1.13, z + 4.52);
  b.color('#f07f1c');
  b.vcyl(x - 0.5, y + 3.28, z + 3.8, 0.07, 0.13, 8, 2);
  // chassis rails, fifth wheel, rear axles
  b.color('#3b3e40');
  b.boxMM(x - 0.5, y + 0.9, z - 11.4, x - 0.25, y + 1.2, z + 2.4);
  b.boxMM(x + 0.25, y + 0.9, z - 11.4, x + 0.5, y + 1.2, z + 2.4);
  b.boxMM(x - 1.2, y + 1.08, z - 11.5, x + 1.2, y + 1.22, z - 11.25);
  b.boxMM(x - 1.2, y + 1.08, z + 0.7, x + 1.2, y + 1.22, z + 0.95);
  for (const q of [-5, -3]) b.boxMM(x - 1.1, y + 0.95, z + 2 * q, x + 1.1, y + 1.2, z + 2 * q + 0.2);
  b.color('#2c2f30');
  b.boxMM(x - 0.55, y + 1.05, z + 1.2, x + 0.55, y + 1.22, z + 2.3);
  for (const sx of [-1, 1]) {
    wheel(x + sx * 1.0, z + 3.7, 0.55, 0.4);
    wheel(x + sx * 1.0, z + 1.7, 0.55, 0.4);
    wheel(x + sx * 0.72, z + 1.7, 0.55, 0.3);
    for (const q of [-9.6, -8.3]) wheel(x + sx * 1.02, z + q, 0.48, 0.3);
  }
  // landing legs, tail lights
  b.color('#8d9092');
  for (const sx of [-1, 1]) b.boxMM(x + sx * 0.8 - 0.05, y + 0.15, z - 2.2, x + sx * 0.8 + 0.05, y + 1.05, z - 2.1);
  b.color('#a8201e');
  for (const sx of [-1, 1]) b.boxMM(x + sx * 1.05 - 0.09, y + 1.1, z - 11.51, x + sx * 1.05 + 0.09, y + 1.2, z - 11.49);
  addContainer(b, x, y + 1.22, z - 5.2, 12.19, pickLook(rng), 0);
}

/** an 11 m mast (under the cranes' lower portal beam) by the seaward rail, its heads aimed along the lane, at the stacks and at the ship */
function lightMast(b: HB, x: number, z: number, ground: (x: number, z: number) => number, glows: GlowPoint[], lights: LampLight[]): void {
  const g = ground(x, z);
  const H = 11;
  b.noEmit().pat(PAT.NONE);
  b.color('#8e8b83');
  b.vcyl(x, g, z, 0.34, 0.5, 8, 2);
  b.color('#e6b92c');
  b.vcyl(x, g + 0.5, z, 0.2, 1.0, 8, 0, 0.19);
  b.color('#6f7478');
  b.vcyl(x, g + 1.5, z, 0.19, H - 1.5, 8, 0, 0.1);
  b.color('#2a2d30');
  b.box(x, g + H, z, 0.12, 0.1, 2.0, 0, 0);
  for (const [sz, ax, az] of [[-1, x - 2, z - 15], [1, x - 2, z + 15], [0, x + 8, z]] as [number, number, number][]) {
    const lz = z + sz * 0.9;
    const yaw = Math.atan2(ax - x, az - lz);
    b.pushT(x, g + H + 0.05, lz, yaw, 0.5);
    b.color('#23262a');
    b.box(0, 0, -0.07, 0.62, 0.42, 0.12);
    b.color('#f4f6ff').emit('#f0f4ff', 3.0, EMIT.LIGHTS);
    b.box(0, 0, 0.0, 0.52, 0.32, 0.03, 0, 4);
    b.noEmit();
    b.pop();
    glows.push({ x: x + Math.sin(yaw) * 0.2, y: g + H - 0.1, z: lz + Math.cos(yaw) * 0.2, size: 1.1, color: '#eaf1ff', intensity: 0.9 });
    lights.push({ x, y: g + H, z: lz, pole: H, radius: sz === 0 ? 8 : 15, color: '#e8eeff', intensity: sz === 0 ? 0.32 : 0.6, kind: 'flood', aim: [ax, ground(ax, az), az] });
  }
}

export function buildContainerQuayLife(b: HB, o: QuayLifeOpts): void {
  const { ctx, ground, rng, x0, x1, z0, z1, edgeX } = o;
  const occ = ctx.occupancy;
  const free = (x: number, z: number, hx: number, hz: number): boolean => {
    for (let a = x - hx; a <= x + hx; a += 0.5) for (let c = z - hz; c <= z + hz; c += 0.5) if (occ.has(a, c, NOPE)) return false;
    return !o.ladders.some((l) => Math.abs(l - z) < hz + 1.2);
  };
  const solid = (x: number, z: number, hx: number, hz: number) => occ.fillRect(x - hx, z - hz, x + hx, z + hz, OCC.SOLID);
  const Y = (x: number, z: number) => ground(x, z);
  b.noEmit().pat(PAT.NONE);

  // ── on the concrete: a yellow walkway down the lane, white bay lines across it, hatched zones at the rail stops, a century of oil
  const lift = 0.02;
  for (let z = z0; z < z1; z += 8.5) {
    const zz = Math.min(z + 7.9, z1);
    paint(b, x0 + 0.1, z, x0 + 0.22, zz, Y(x0, z) + lift, '#d4b13a');
    paint(b, x1 - 0.22, z, x1 - 0.1, zz, Y(x1, z) + lift, '#d4b13a');
  }
  for (let z = z0 + 6; z < z1; z += 12.2) paint(b, x0 + 0.3, z, x1 - 0.3, z + 0.14, Y(x0, z) + lift, '#c9c6ba');
  for (let i = 0; i < 46; i++) {
    const x = x0 + rng.next() * (x1 - x0),
      z = z0 + rng.next() * (z1 - z0);
    const big = rng.next() < 0.45;
    if (big) stain(b, x, Y(x, z), z, 3 + rng.next() * 3, 3 + rng.next() * 4, rng.next() < 0.5 ? '#a9a9a2' : '#9e9f99', 1.3 + rng.next() * 1.2, 0.024);
    else stain(b, x, Y(x, z), z, 0.5 + rng.next() * 0.7, 0.5 + rng.next() * 0.8, '#6c6d68', 0.3 + rng.next() * 0.2, 0.026);
  }

  const xm = (x0 + x1) / 2;
  // ── a tractor waiting for the crane, its driver and a banksman in hi-vis
  const tz = -44;
  const tx = xm + 0.6;
  if (free(tx, tz - 3.5, 1.4, 8.5)) {
    terminalTractor(b, tx, Y(tx, tz), tz, rng);
    solid(tx, tz + 1.8, 1.25, 2.8);
    solid(tx, tz - 5.2, 1.25, 6.2);
    addActor({ x: tx - 2.1, y: Y(tx - 2.1, tz + 3), z: tz + 3, yaw: 1.2, role: 'worker', work: 2, shirt: 0xe8a21c, h0: 6, h1: 19, p: 0.9 });
    addActor({ x: tx + 2.2, y: Y(tx + 2.2, tz - 9), z: tz - 9, yaw: -1.9, role: 'worker', idle: 5, shirt: 0xe8a21c, h0: 6, h1: 19, p: 0.8 });
  }

  // ── the clusters, walking down the quay
  let z = z0 + 5;
  let k = 0;
  const kits = ['still', 'drums', 'bin', 'hawser', 'pillar', 'manhole', 'bin', 'still', 'hawser', 'drums', 'pillar'];
  while (z < z1 - 3) {
    const kit = kits[k++ % kits.length];
    const x = xm + (rng.next() - 0.5) * (x1 - x0 - 2.4);
    const y = Y(x, z);
    if (kit === 'still' && free(x, z, 0.8, 1.6)) {
      stillage(b, x, y, z);
      solid(x, z, 0.5, 1.2);
    } else if (kit === 'drums' && free(x, z, 1, 1)) {
      b.color('#f0b81e');
      b.boxMM(x - 0.72, y, z - 0.72, x + 0.72, y + 0.2, z + 0.72);
      b.color('#2c2e30');
      b.boxMM(x - 0.68, y + 0.2, z - 0.68, x + 0.68, y + 0.205, z + 0.68);
      const cols = ['#1f4f8f', '#1f4f8f', '#8a3324', '#2a6a4c'];
      [[-0.33, -0.33], [0.33, -0.33], [-0.33, 0.33], [0.33, 0.33]].forEach(([dx, dz], i) => steelDrum(b, x + dx, y + 0.2, z + dz, cols[(i + k) % 4]));
      solid(x, z, 0.72, 0.72);
    } else if (kit === 'bin' && free(x, z, 0.9, 0.9)) {
      twistBin(b, x, y, z, rng);
      twistBin(b, x + 1.5, y, z + 0.1, rng);
      solid(x + 0.75, z, 1.45, 0.7);
    } else if (kit === 'hawser' && free(x, z, 0.8, 0.8)) {
      hawser(b, x, y, z, k % 2 ? '#2f5f9a' : '#d27a2c', rng);
      solid(x, z, 0.6, 0.45);
    } else if (kit === 'pillar' && free(x1 - 0.7, z, 0.4, 0.4)) {
      pillar(b, x1 - 0.7, Y(x1 - 0.7, z), z, rng);
      solid(x1 - 0.7, z, 0.32, 0.22);
    } else if (kit === 'manhole' && free(x, z, 1.3, 1.3)) {
      manhole(b, x, y + 0.01, z);
    }
    z += 6 + rng.next() * 7;
  }

  // ── light masts
  const lights: LampLight[] = [];
  for (let q = z0 + 8; q < z1 - 4; q += 25) {
    if (occ.has(x1 - 0.3, q, NOPE)) continue;
    lightMast(b, x1 - 0.3, q, ground, o.glows, lights);
    solid(x1 - 0.3, q, 0.34, 0.34);
  }
  addLampLights(lights);

  // ── lifebuoys on the coping
  for (let q = z0 + 8; q < z1; q += 21) {
    if (o.ladders.some((l) => Math.abs(l - q) < 1.2)) continue;
    lifebuoy(b, edgeX - 0.25, Y(edgeX - 0.25, q), q);
  }
}

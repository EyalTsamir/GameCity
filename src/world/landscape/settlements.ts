// Farmsteads, hamlets and villages of the countryside (sites from landscape/model.ts):
// gabled houses, barns and sheds (one instanced unit mesh: body + roof, roof pitch per instance),
// church towers with spires and the island lighthouse (the same unit, its ridge collapsed to a point) —
// one instanced mesh. Walls get window rows (shader), lit at night.

import * as THREE from 'three';
import { moonLift } from '../../core/nature';
import type { LandscapeModel, Site } from './model';
import { FIELD_ROT } from './fields';
import { hash2i } from './noise';
import { LAMP_GLSL } from '../../core/lampLight';
import { buildFarmstead, farmMaterial, type FarmSite } from './farmstead';

interface Bld {
  x: number;
  z: number;
  y: number;
  w: number; // along local x
  d: number; // along local z (ridge runs along x)
  h: number; // eaves height
  roof: number; // roof rise (m)
  yaw: number;
  wall: number; // palette index
  roofC: number;
  kind: number; // 0 house, 1 barn, 2 shed
  /** box hunt variants: hip (0 gable … 1 full 45° hip), chimney side (0 none, ±1), L-wing side (0 none, ±1) */
  hip?: number;
  chim?: number;
  wing?: number;
}

const WALLS = ['#e9e1cf', '#d9ccb0', '#c9b79a', '#b5aa98', '#e4d6bd', '#9c5b44', '#7a4a36', '#5b4535'];
const ROOFS = ['#8e4a35', '#a2563a', '#6f3d30', '#5a5856', '#4b4a4c', '#7d5640'];

export interface Settlements {
  group: THREE.Group;
  count: number;
  triangles: number;
  /** lighthouse lantern position (or null) */
  beacon: { x: number; y: number; z: number } | null;
  /** does a disc (x, z, r) touch a building footprint (+ the farmstead silo/apron)? Trees use it (F4 bug 2). */
  blocked(x: number, z: number, r: number): boolean;
}

function placeSite(site: Site, model: LandscapeModel, out: Bld[], towers: TowerRec[], farms: FarmSite[] | null, foot: Bld[]): void {
  const H = model.height;
  const rnd = (i: number, k: number) => hash2i(site.seed * 131 + i, k, 607);
  const baseYaw = FIELD_ROT + (rnd(0, 1) - 0.5) * 0.6;
  const put = (lx: number, lz: number, b: Omit<Bld, 'x' | 'z' | 'y' | 'yaw'>, yawOff: number) => {
    const c = Math.cos(baseYaw),
      s = Math.sin(baseYaw);
    const x = site.x + lx * c + lz * s,
      z = site.z - lx * s + lz * c;
    // sit on the lowest corner (no floating sills), slightly sunk
    const yaw = baseYaw + yawOff;
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw);
    let y = Infinity;
    for (const [ax, az] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ]) {
      const px = x + ax * b.w * cy + az * b.d * sy,
        pz = z - ax * b.w * sy + az * b.d * cy;
      y = Math.min(y, H(px, pz));
    }
    if (y < -1.2) return;
    out.push({ ...b, x, z, y: y - 0.3, yaw });
    local.push([lx, lz, yawOff]);
  };
  const local: [number, number, number][] = [];
  if (site.kind === 'farm') {
    // farms within the free camera's reach (targets stop at slab + 320 m) become real farmsteads (farmstead.ts)
    const n0 = out.length;
    const near = farms && model.slabDist(site.x, site.z) < 420;
    if (near) {
      local.length = 0;
      placeFarm(put, rnd);
      const blds = out.splice(n0);
      foot.push(...blds);
      if (blds.length) {
        const f: FarmSite = { x: site.x, z: site.z, y: blds[0].y, yaw: baseYaw, seed: site.seed, blds: [] };
        blds.forEach((b, i) => f.blds.push({ lx: local[i][0], lz: local[i][1], y: b.y, w: b.w, d: b.d, h: b.h, roof: b.roof, yawOff: local[i][2], wall: new THREE.Color(WALLS[b.wall]), roofC: new THREE.Color(ROOFS[b.roofC]), kind: b.kind }));
        farms.push(f);
      }
      return;
    }
    placeFarm(put, rnd);
    return;
  }
  if (site.town) {
    placeTown(site, put, rnd, towers, baseYaw, H);
    return;
  }
  if (site.abbey) {
    placeAbbey(site, put, rnd, towers, baseYaw, H);
    return;
  }
  // villages / hamlets: houses along two crossing streets + a ring of scattered ones
  const n = site.kind === 'village' ? 38 : 9;
  const streetYaw = [0, Math.PI / 2 + (rnd(9, 1) - 0.5) * 0.5];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const street = streetYaw[i % 2];
    const along = (rnd(i, 11) - 0.5) * site.r * 1.7;
    const side = rnd(i, 12) < 0.5 ? -1 : 1;
    const off = side * (8 + 5 * rnd(i, 13));
    const lx = Math.cos(street) * along - Math.sin(street) * off,
      lz = Math.sin(street) * along + Math.cos(street) * off;
    if (Math.hypot(lx, lz) < 16 && site.kind === 'village') continue; // the church square
    const big = rnd(i, 14) < 0.15;
    put(
      lx,
      lz,
      {
        w: (big ? 13 : 9) + 3 * rnd(i, 15),
        d: 7 + 2 * rnd(i, 16),
        h: (big ? 7.5 : 5) + 2.2 * rnd(i, 17),
        roof: 3.5 + 1.5 * rnd(i, 18),
        wall: Math.floor(rnd(i, 19) * 5),
        roofC: Math.floor(rnd(i, 20) * (site.kind === 'village' ? 6 : 3)),
        kind: 0,
        ...houseVariant(rnd, i, big),
      },
      -street + (rnd(i, 21) - 0.5) * 0.12,
    );
    k++;
  }
  if (site.kind === 'village') {
    // church: nave + tower with spire
    put(0, 6, { w: 22, d: 10, h: 9, roof: 6, wall: 3, roofC: 4, kind: 0 }, 0);
    const c = Math.cos(baseYaw),
      s = Math.sin(baseYaw);
    const tx = site.x + -13 * c + 6 * s,
      tz = site.z - -13 * s + 6 * c;
    towers.push({ x: tx, z: tz, y: H(tx, tz) - 0.3, h: 34 + 8 * rnd(30, 1), yaw: baseYaw });
  }
}

type TowerRec = { x: number; z: number; y: number; h: number; yaw: number; flat?: boolean; w?: number };

/**
 * a compact hill town: houses packed in rings round a square, every roof terracotta, walls stone and ochre, the bell tower
 * and the church at the top, a taller house or two at the rim. From 2–3 km it reads as a crust of roofs on the summit.
 */
function placeTown(site: Site, put: Put, rnd: (i: number, k: number) => number, towers: TowerRec[], baseYaw: number, H: (x: number, z: number) => number): void {
  const terracotta = [0, 1, 2, 5, 0, 1];
  let i = 0;
  for (let ring = 0; ring < 6; ring++) {
    const R = 19 + ring * ((site.r - 19) / 5.2);
    const n = Math.floor((R * 6.283) / 12.6);
    for (let k = 0; k < n; k++) {
      i++;
      if (rnd(i, 50) < 0.1) continue; // a lane, a yard
      const a = ((k + rnd(i, 51) * 0.5) / n) * 6.283 + ring * 0.7;
      const rr = R + (rnd(i, 52) - 0.5) * 5;
      const big = rnd(i, 54) < 0.14;
      put(
        Math.cos(a) * rr,
        Math.sin(a) * rr,
        {
          w: (big ? 13 : 9) + 2.5 * rnd(i, 55),
          d: 6.5 + 2 * rnd(i, 56),
          h: (big ? 9.5 : 6) + 2.5 * rnd(i, 57) + (ring === 5 ? 1.5 : 0),
          roof: 2.1 + 0.9 * rnd(i, 58),
          wall: Math.floor(rnd(i, 59) * 5),
          roofC: terracotta[Math.floor(rnd(i, 60) * 6)],
          kind: 0,
          ...houseVariant(rnd, i + 300, big),
        },
        a + Math.PI / 2 + (rnd(i, 61) - 0.5) * 0.3,
      );
    }
  }
  // the church on the square, the campanile beside it, a second lower tower on the rim
  put(-3, 9, { w: 26, d: 11, h: 11, roof: 5, wall: 3, roofC: 0, kind: 0 }, 0.1);
  const c = Math.cos(baseYaw),
    s = Math.sin(baseYaw);
  const tx = site.x - 18 * c + 2 * s,
    tz = site.z + 18 * s + 2 * c;
  towers.push({ x: tx, z: tz, y: H(tx, tz) - 0.3, h: 40 + 8 * rnd(30, 2), yaw: baseYaw, flat: true, w: 6.4 });
  const a2 = rnd(30, 3) * 6.283;
  const ux = site.x + Math.cos(a2) * site.r * 0.8,
    uz = site.z + Math.sin(a2) * site.r * 0.8;
  towers.push({ x: ux, z: uz, y: H(ux, uz) - 0.3, h: 25 + 5 * rnd(30, 4), yaw: a2, flat: true, w: 6 });
}

/** an abbey on a ridge: church, a square of long ranges round a cloister, a bell tower */
function placeAbbey(site: Site, put: Put, rnd: (i: number, k: number) => number, towers: TowerRec[], baseYaw: number, H: (x: number, z: number) => number): void {
  const wall = 1,
    roofC = 0;
  put(0, -24, { w: 42, d: 13, h: 15, roof: 6, wall, roofC, kind: 0 }, 0);
  put(-28, -1, { w: 34, d: 9, h: 9, roof: 3.2, wall, roofC, kind: 0 }, Math.PI / 2);
  put(28, -1, { w: 34, d: 9, h: 9, roof: 3.2, wall, roofC, kind: 0 }, Math.PI / 2);
  put(0, 20, { w: 48, d: 9, h: 10, roof: 3.2, wall, roofC, kind: 0 }, 0);
  for (let i = 0; i < 5; i++) put(-30 + i * 15, 36 + 6 * rnd(i, 70), { w: 9, d: 6, h: 4.5, roof: 2.1, wall: 2, roofC: 1, kind: 2 }, (rnd(i, 71) - 0.5) * 0.4);
  const c = Math.cos(baseYaw),
    s = Math.sin(baseYaw);
  const tx = site.x + 25 * c - 25 * s,
    tz = site.z - 25 * s - 25 * c;
  towers.push({ x: tx, z: tz, y: H(tx, tz) - 0.3, h: 44, yaw: baseYaw, flat: true, w: 7 });
}

/** box hunt: a hipped or gabled roof, a chimney and on some an L-wing at the back (houses) */
function houseVariant(rnd: (i: number, k: number) => number, i: number, big: boolean): Pick<Bld, 'hip' | 'chim' | 'wing'> {
  const r = rnd(i, 40);
  const hip = r < 0.3 ? 1 : r < 0.42 ? 0.55 : 0;
  const chim = rnd(i, 41) < 0.75 ? (rnd(i, 42) < 0.5 ? -1 : 1) : 0;
  const wing = rnd(i, 43) < (big ? 0.55 : 0.32) ? (rnd(i, 44) < 0.5 ? -1 : 1) : 0;
  return { hip, chim, wing };
}

type Put = (lx: number, lz: number, b: Omit<Bld, 'x' | 'z' | 'y' | 'yaw'>, yawOff: number) => void;
function placeFarm(put: Put, rnd: (i: number, k: number) => number): void {
  put(0, 0, { w: 11 + 3 * rnd(1, 2), d: 8 + 1.5 * rnd(1, 3), h: 5.6 + 1.2 * rnd(1, 4), roof: 4.2, wall: Math.floor(rnd(1, 5) * 5), roofC: Math.floor(rnd(1, 6) * 3), kind: 0, ...houseVariant(rnd, 101, false) }, 0);
  // the barn behind the house; turned across, it moves out by its extra half-length (no walls touching)
  const bw = 20 + 6 * rnd(2, 3),
    bd = 12 + 3 * rnd(2, 4),
    turned = rnd(2, 8) <= 0.5;
  put(4 + 6 * rnd(2, 1), 17 + 4 * rnd(2, 2) + (turned ? (bw - bd) / 2 : 0), { w: bw, d: bd, h: 6 + rnd(2, 5) * 1.5, roof: 5.5, wall: 5 + Math.floor(rnd(2, 6) * 3), roofC: Math.floor(rnd(2, 7) * 6), kind: 1, hip: rnd(2, 9) < 0.3 ? 0.35 : 0, wing: rnd(2, 10) < 0.3 ? (rnd(2, 11) < 0.5 ? -1 : 1) : 0 }, turned ? Math.PI / 2 : 0);
  if (rnd(3, 1) > 0.25) put(-15 - 4 * rnd(3, 2), 8 + 6 * rnd(3, 3), { w: 12, d: 6, h: 3.4, roof: 2.0, wall: 5 + Math.floor(rnd(3, 4) * 3), roofC: 3 + Math.floor(rnd(3, 5) * 3), kind: 2 }, Math.PI / 2);
}

/** unit-geometry parts (aRoof): the shader moves / collapses them per instance (hip, chimney, L-wing) */
const PART = { WALL: 0, ROOF: 1, HIPEND: 3, CHIMNEY: 4, WING: 5, WINGROOF: 6 } as const;

/**
 * unit gabled building: body 1×1×1 (y 0..1) + roof prism (y 1..2, flagged), ridge along x. Box hunt (`variants`):
 * also hip ends (folded flat on gabled roofs), a chimney stack (unit box round its own centre, sized in metres by
 * the shader) and an L-wing in its own unit frame (x −0.5..0.5 across, z 0..1 out from the back wall, roof y 1..2).
 */
function gableGeometry(variants: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const roof: number[] = [];
  const nrm: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], r: number) => {
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2];
    const vx = d[0] - a[0],
      vy = d[1] - a[1],
      vz = d[2] - a[2];
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (const p of [a, b, c, a, c, d]) {
      pos.push(p[0], p[1], p[2]);
      nrm.push(nx, ny, nz);
      roof.push(r);
    }
  };
  const tri = (a: number[], b: number[], c: number[], r = 0) => {
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2];
    const vx = c[0] - a[0],
      vy = c[1] - a[1],
      vz = c[2] - a[2];
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      nrm.push(nx, ny, nz);
      roof.push(r);
    }
  };
  const h = 0.5;
  // walls (counter-clockwise seen from outside)
  quad([-h, 0, h], [h, 0, h], [h, 1, h], [-h, 1, h], 0); // +z
  quad([h, 0, -h], [-h, 0, -h], [-h, 1, -h], [h, 1, -h], 0); // -z
  quad([h, 0, h], [h, 0, -h], [h, 1, -h], [h, 1, h], 0); // +x
  quad([-h, 0, -h], [-h, 0, h], [-h, 1, h], [-h, 1, -h], 0); // -x
  // gables (wall material, flagged roof-height so the apex follows the roof rise)
  tri([h, 1, h], [h, 1, -h], [h, 2, 0]);
  tri([-h, 1, -h], [-h, 1, h], [-h, 2, 0]);
  // roof planes with a small overhang (eaves)
  const o = 0.06;
  quad([-h - o, 1 - o * 0.8, h + o], [h + o, 1 - o * 0.8, h + o], [h + o, 2, 0], [-h - o, 2, 0], 1);
  quad([h + o, 1 - o * 0.8, -h - o], [-h - o, 1 - o * 0.8, -h - o], [-h - o, 2, 0], [h + o, 2, 0], 1);
  if (variants) {
    const e = 1 - o * 0.8;
    // hip ends from the eaves corners (apex pulled in by the shader; folded flat on gabled roofs)
    tri([h + o, e, h + o], [h + o, e, -h - o], [h + o, 2, 0], PART.HIPEND);
    tri([-h - o, e, -h - o], [-h - o, e, h + o], [-h - o, 2, 0], PART.HIPEND);
    // chimney: unit box ±1 round its centre, y from inside the roof to over the ridge (the shader sizes it)
    const C = PART.CHIMNEY;
    quad([-1, 1.3, 1], [1, 1.3, 1], [1, 2.3, 1], [-1, 2.3, 1], C);
    quad([1, 1.3, -1], [-1, 1.3, -1], [-1, 2.3, -1], [1, 2.3, -1], C);
    quad([1, 1.3, 1], [1, 1.3, -1], [1, 2.3, -1], [1, 2.3, 1], C);
    quad([-1, 1.3, -1], [-1, 1.3, 1], [-1, 2.3, 1], [-1, 2.3, -1], C);
    quad([-1, 2.3, 1], [1, 2.3, 1], [1, 2.3, -1], [-1, 2.3, -1], C);
    // L-wing (own unit frame): side walls, end wall, its gable and two roof planes with eaves
    const W = PART.WING,
      WR = PART.WINGROOF;
    quad([h, 0, 0], [h, 0, 1], [h, 1, 1], [h, 1, 0], W);
    quad([-h, 0, 1], [-h, 0, 0], [-h, 1, 0], [-h, 1, 1], W);
    quad([-h, 0, 1], [h, 0, 1], [h, 1, 1], [-h, 1, 1], W);
    tri([-h, 1, 1], [h, 1, 1], [0, 2, 1], W);
    quad([h + o, e, 1 + o], [h + o, e, 0], [0, 2, 0], [0, 2, 1 + o], WR);
    quad([-h - o, e, 0], [-h - o, e, 1 + o], [0, 2, 1 + o], [0, 2, 0], WR);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aRoof', new THREE.Float32BufferAttribute(roof, 1));
  return g;
}

/** unit → building shape per instance (hip ends, chimney, L-wing, roof rise, tower spire); shared by the colour
 *  and the shadow-depth material so shadows match the drawn shape */
const SHAPE_GLSL = /* glsl */ `
vec3 bS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
float bPart = aRoof;
// box hunt variants (unit space, before the roof rise): hip ends, chimney stack, L-wing
float hipW = aV.x * 0.56 * bS.z / max(bS.x, 0.01); // ridge-end inset for a 45° hip, in unit x
bool roofPlane = bPart > 0.5 && bPart < 1.5;
bool hipEnd = bPart > 2.5 && bPart < 3.5;
if ((roofPlane || hipEnd) && transformed.y > 1.5) {
  if (hipEnd && aV.x < 0.01) transformed.y = 0.952; // gabled: the hip end folds flat (degenerate)
  else transformed.x = sign(transformed.x) * max(0.0, abs(transformed.x) - hipW);
}
if (bPart < 0.5 && transformed.y > 1.5 && aV.x > 0.01) transformed.y = 1.0; // gable wall hidden under the hip
if (bPart > 3.5 && bPart < 4.5) {
  // chimney: 0.6 x 0.6 m stack on one slope near the ridge, top ~0.9 m over the ridge; none = collapsed
  float on = abs(aV.y);
  transformed.x = 0.3 * aV.y + transformed.x * on * 0.3 / max(bS.x, 0.01);
  transformed.z = 0.16 + transformed.z * on * 0.3 / max(bS.z, 0.01);
  float top = 2.0 + 0.9 / max(0.01, aB.x * bS.y);
  transformed.y = mix(1.3, transformed.y > 2.0 ? top : 1.3, on);
}
bool wing = bPart > 4.5;
if (wing) {
  // L-wing: 0.4 of the main length at one gable end, out 0.7 of the depth behind the back wall, eaves at
  // 0.86 of the main eaves, roof at the main pitch; none = collapsed onto the back wall
  float on = abs(aV.z);
  float ww = 0.4, wh = 0.86;
  float pitch = aB.x * bS.y / max(0.01, 0.5 * bS.z);
  float wr = pitch * 0.5 * ww * bS.x / max(0.01, bS.y); // wing roof rise in unit y (final)
  vec3 q = transformed;
  transformed.x = aV.z * (0.5 - 0.5 * ww) + q.x * ww * on;
  transformed.z = 0.5 + q.z * 0.7 * on;
  transformed.y = q.y <= 1.0 ? q.y * wh : wh + (q.y - 1.0) * wr;
}
// roof rise relative to the eaves height; towers (kind 3): the ridge collapses to a point → a spire
if (transformed.y > 1.0 && !wing) {
  transformed.y = 1.0 + (transformed.y - 1.0) * aB.x;
  if (aB.w > 2.5) transformed.x = 0.0;
}
`;

function buildingMaterial(uniforms: Record<string, THREE.IUniform>, fog: boolean): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, fog });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aRoof;
attribute vec4 aB; // (roof rise / eaves height, wall idx, roof idx, kind)
attribute vec4 aV; // box hunt: (hip 0..1, chimney side ±1 / 0, L-wing side ±1 / 0, -)
varying float vRoof;
varying vec3 vBW;
varying vec3 vBL;
varying vec4 vB;
varying vec3 vBS;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
// hip ends slope in: their normal from rise over run in unit space (the instancing normal transform scales it)
if (aRoof > 2.5 && aRoof < 3.5 && aV.x > 0.01) {
  vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  float run = min(0.56, aV.x * 0.56 * sc.z / max(sc.x, 0.01));
  objectNormal = normalize(vec3(sign(position.x) * (aB.x + 0.048), run, 0.0));
}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
${SHAPE_GLSL}
vBS = bS;
vRoof = aRoof;
vB = aB;
vBL = transformed;`,
      )
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uWalls[8];
uniform vec3 uRoofs[6];
uniform float uLights;
uniform float uNight;
varying float vRoof;
varying vec3 vBW;
varying vec3 vBL;
varying vec4 vB;
varying vec3 vBS;
float bWin = 0.0;
${LAMP_GLSL}
float bHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 bAlbedo() {
  int wi = int(vB.y + 0.5), ri = int(vB.z + 0.5);
  vec3 wall = uWalls[wi];
  vec3 roof = uRoofs[ri];
  if (vRoof > 3.5 && vRoof < 4.5) return vec3(0.42, 0.22, 0.17) * (0.85 + 0.15 * bHash(floor(vBW.xz * 3.0 + vBW.y * 4.0))); // chimney brick
  if ((vRoof > 0.75 && vRoof < 1.5) || (vRoof > 2.5 && vRoof < 3.5) || vRoof > 5.5 || (vB.w > 2.5 && vBL.y > 1.001)) {
    // tile / slate courses
    float c = fract(vBL.y * vBS.y * 2.2);
    return roof * (0.85 + 0.15 * smoothstep(0.1, 0.4, c)) * (0.9 + 0.2 * bHash(floor(vBW.xz * 0.5)));
  }
  // windows: rows per storey on the long walls and gables (not on barns / towers)
  float fp = length(fwidth(vBW));
  vec3 col = wall * (0.92 + 0.08 * bHash(floor(vBW.xz * 3.0 + vBW.y * 2.0)));
  if (vB.w > 2.5) {
    // tower: louvred belfry openings (church) / lantern band (lighthouse) under the spire
    float u = abs(vBL.x) > 0.499 ? vBL.z : vBL.x;
    float y = vBL.y;
    float op = step(0.8, y) * step(y, 0.93) * step(abs(u), 0.17);
    col = mix(col, vec3(0.05), op * (1.0 - smoothstep(0.4, 1.2, fp)));
  }
  if (vB.w < 0.5 && fp < 1.6 && vRoof < 4.5) {
    float along = abs(vBL.z) > 0.499 ? vBL.x * vBS.x : vBL.z * vBS.z;
    float y = vBL.y * vBS.y;
    float storey = floor((y - 0.9) / 2.8);
    float yy = (y - 0.9) - storey * 2.8;
    float xx = fract(along / 3.1 + 0.5);
    float win = step(0.0, storey) * step(0.35, yy) * step(yy, 1.65) * step(0.32, xx) * step(xx, 0.68) * step(y, vBS.y - 0.4) * step(vBL.y, 1.0);
    win *= 1.0 - smoothstep(0.6, 1.6, fp);
    float lit = step(0.45, bHash(floor(vec2(along / 3.1, storey) + vBW.xz * 0.013) + vB.y));
    bWin = win * lit;
    col = mix(col, vec3(0.06, 0.07, 0.08), win);
  }
  return col;
}`,
      )
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( bAlbedo(), opacity );')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${moonLift()}`)
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.68, 0.34) * bWin * uLights * 2.2;',
      );
  };
  mat.customProgramCacheKey = () => 'th-landbld-v3';
  return mat;
}

/** shadow depth with the same per-instance shape as the drawn buildings */
function buildingDepthMaterial(): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRoof;\nattribute vec4 aB;\nattribute vec4 aV;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SHAPE_GLSL}`);
  };
  mat.customProgramCacheKey = () => 'th-landbld-depth-v1';
  return mat;
}

export function buildSettlements(model: LandscapeModel, uniforms: Record<string, THREE.IUniform>, lights: { value: number }, night: { value: number }, fog: boolean, variants = true): Settlements {
  const blds: Bld[] = [];
  const towers: (TowerRec & { light?: boolean })[] = [];
  const farms: FarmSite[] | null = new URLSearchParams(location.search).has('nofarmdetail') ? null : [];
  const foot: Bld[] = [];
  for (const s of model.sites) placeSite(s, model, blds, towers, farms, foot);
  foot.push(...blds);
  // the island lighthouse on the northern cliff top (white tower, red lantern roof)
  const isl = model.island;
  const lx = isl.x + 10,
    lz = isl.z - isl.r * 0.9;
  const ly = model.height(lx, lz);
  const beacon = ly > 5 ? { x: lx, z: lz, y: ly - 0.3, h: 26, yaw: 0, light: true } : null;
  if (beacon) towers.push(beacon);
  const group = new THREE.Group();
  group.name = 'land-settlements';
  const u = {
    ...uniforms,
    uWalls: { value: WALLS.map((h) => new THREE.Color(h)) },
    uRoofs: { value: ROOFS.map((h) => new THREE.Color(h)) },
    uLights: lights,
    uNight: night,
  };
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    sc = new THREE.Vector3(),
    p = new THREE.Vector3(),
    ax = new THREE.Vector3(0, 1, 0);
  // towers (church spires, the lighthouse): gable units whose ridge collapses into a spire (kind 3)
  for (const t of towers) {
    const lh = t.light === true;
    const w = t.w ?? (lh ? 4.2 : 5.5);
    // (a campanile ends in a low pyramid, a northern spire in a tall one)
    const rk = t.flat ? 0.1 : 0.34;
    blds.push({ x: t.x, z: t.z, y: t.y, w, d: w, h: t.h * (1 - rk), roof: t.h * rk, yaw: t.yaw, wall: t.flat ? 2 : lh ? 0 : 3, roofC: t.flat ? 0 : lh ? 1 : 4, kind: 3 });
  }
  // all buildings: one instanced mesh
  const geo = gableGeometry(variants);
  const ab = new Float32Array(blds.length * 4);
  const av = new Float32Array(blds.length * 4);
  blds.forEach((b, i) => {
    ab[i * 4] = b.roof / b.h;
    ab[i * 4 + 1] = b.wall;
    ab[i * 4 + 2] = b.roofC;
    ab[i * 4 + 3] = b.kind;
    if (variants && b.kind < 3) {
      av[i * 4] = b.hip ?? 0;
      av[i * 4 + 1] = b.chim ?? 0;
      av[i * 4 + 2] = b.wing ?? 0;
    }
  });
  geo.setAttribute('aB', new THREE.InstancedBufferAttribute(ab, 4));
  geo.setAttribute('aV', new THREE.InstancedBufferAttribute(av, 4));
  const mesh = new THREE.InstancedMesh(geo, buildingMaterial(u, fog), Math.max(1, blds.length));
  blds.forEach((b, i) => {
    p.set(b.x, b.y, b.z);
    q.setFromAxisAngle(ax, b.yaw);
    sc.set(b.w, b.h, b.d);
    m4.compose(p, q, sc);
    mesh.setMatrixAt(i, m4);
  });
  mesh.count = blds.length;
  mesh.name = 'land-buildings';
  mesh.castShadow = true;
  if (variants) mesh.customDepthMaterial = buildingDepthMaterial();
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
  let triangles = (blds.length * geo.getAttribute('position').count) / 3;
  if (farms?.length) {
    const fm = farmMaterial(fog);
    for (const f of farms) {
      const m = buildFarmstead(f, model.height, fog, fm);
      triangles += m.geometry.getAttribute('position').count / 3;
      group.add(m);
    }
  }
  // footprint test: building rect + 1 m, barns + 6 m at the back for the silo; cheap grid of the footprints
  const cell = 64;
  const grid = new Map<number, Bld[]>();
  for (const b of foot) {
    const R = Math.hypot(b.w, b.d) / 2 + 7;
    for (let gx = Math.floor((b.x - R) / cell); gx <= Math.floor((b.x + R) / cell); gx++)
      for (let gz = Math.floor((b.z - R) / cell); gz <= Math.floor((b.z + R) / cell); gz++) {
        const k = gx * 4096 + gz;
        const l = grid.get(k);
        if (l) l.push(b);
        else grid.set(k, [b]);
      }
  }
  const blocked = (x: number, z: number, r: number) => {
    const l = grid.get(Math.floor(x / cell) * 4096 + Math.floor(z / cell));
    if (!l) return false;
    for (const b of l) {
      const dx = x - b.x,
        dz = z - b.z;
      const c = Math.cos(b.yaw),
        sn = Math.sin(b.yaw);
      const lx = Math.abs(dx * c - dz * sn),
        lz = Math.abs(dx * sn + dz * c);
      const hd = b.d / 2 + (b.kind === 1 ? 6 : 1) + (b.wing ? b.d * 0.7 : 0);
      const ox = Math.max(0, lx - b.w / 2 - 1),
        oz = Math.max(0, lz - hd);
      if (ox * ox + oz * oz < r * r) return true;
    }
    return false;
  };
  return { blocked, group, count: blds.length, triangles, beacon: beacon ? { x: beacon.x, y: beacon.y + beacon.h * 0.82, z: beacon.z } : null };
}

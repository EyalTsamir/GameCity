// A high-voltage line striding in over the western plain to the town's works, and telephone poles along the country lanes.
// Steelwork and poles go into the farm kit (rows.ts, solid band); the wires are one-pixel lines with a sag, one draw call.

import * as THREE from 'three';
import { WL, type LandscapeModel } from './model';
import { RowSink, B } from './rows';
import { GROUND_DROP } from '../terrain/height';
import { hash2i } from './noise';

/** span ends of the line, far west → the slab's north-west corner */
const LINE: [number, number][] = [
  [-3200, -420],
  [-2800, -380],
  [-2400, -230],
  [-2000, -300],
  [-1600, -280],
  [-1200, -350],
  [-860, -250],
  [-560, -300],
  [-330, -180],
  [-212, -124],
];
const SPAN = 300;
/** wire colour by day (the frame scales it down with the night) */
export const WIRE_DAY = 0x565a5c;

/** a thin square prism between two points (solid band, shaded by its own normals) */
function rod(s: RowSink, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, c: number, cx: number, cz: number): void {
  const dx = bx - ax,
    dy = by - ay,
    dz = bz - az;
  const l = Math.hypot(dx, dy, dz) || 1;
  // a frame round the rod
  let ux = dz,
    uy = 0,
    uz = -dx;
  const ul = Math.hypot(ux, uz);
  if (ul < 1e-4) {
    ux = 1;
    uz = 0;
  } else {
    ux /= ul;
    uz /= ul;
  }
  const vx = (uy * dz - uz * dy) / l,
    vy = (uz * dx - ux * dz) / l,
    vz = (ux * dy - uy * dx) / l;
  const verts: number[] = [];
  const tris: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.283 + 0.785;
    const nx = ux * Math.cos(a) + vx * Math.sin(a),
      ny = uy * Math.cos(a) + vy * Math.sin(a),
      nz = uz * Math.cos(a) + vz * Math.sin(a);
    verts.push(ax + nx * r, ay + ny * r, az + nz * r, nx, ny, nz, 0.5, 0.5);
    verts.push(bx + nx * r, by + ny * r, bz + nz * r, nx, ny, nz, 0.5, 0.5);
  }
  for (let i = 0; i < 4; i++) {
    const a = i * 2,
      b = i * 2 + 1,
      d = ((i + 1) % 4) * 2,
      e = ((i + 1) % 4) * 2 + 1;
    tris.push(a, e, d, a, b, e);
  }
  s.solid(B.solid, cx, cz, verts, tris, c, c, c);
}

/** a lattice pylon at (x, y, z); arm tips are written into `arms` (three a side) */
function pylon(s: RowSink, x: number, y: number, z: number, yaw: number, arms: number[]): void {
  const c = Math.cos(yaw),
    sn = Math.sin(yaw);
  const L = (u: number, v: number, h: number): [number, number, number] => [x + u * c + v * sn, y + h, z - u * sn + v * c];
  const H = 36;
  const grey = 0.36;
  const wAt = (h: number) => 3.6 * Math.pow(1 - h / H, 1.25) + 0.55;
  const levels = [0, 6, 12, 18, 24, 30, 36];
  for (let i = 0; i < levels.length - 1; i++) {
    const h0 = levels[i],
      h1 = levels[i + 1];
    const w0 = wAt(h0),
      w1 = wAt(h1);
    for (const [su, sv] of [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ]) {
      const a = L(su * w0, sv * w0, h0),
        b = L(su * w1, sv * w1, h1);
      rod(s, a[0], a[1], a[2], b[0], b[1], b[2], 0.1, grey, x, z);
    }
    // cross bracing on the four faces
    for (const [u0, v0, u1, v1] of [
      [1, 1, -1, 1],
      [-1, 1, -1, -1],
      [-1, -1, 1, -1],
      [1, -1, 1, 1],
    ]) {
      const a = L(u0 * w0, v0 * w0, h0),
        b = L(u1 * w1, v1 * w1, h1);
      rod(s, a[0], a[1], a[2], b[0], b[1], b[2], 0.045, grey * 0.92, x, z);
      const d = L(u1 * w0, v1 * w0, h0),
        e = L(u0 * w1, v0 * w1, h1);
      rod(s, d[0], d[1], d[2], e[0], e[1], e[2], 0.045, grey * 0.92, x, z);
    }
  }
  // three cross-arms, an earth peak
  for (const [h, span] of [
    [34, 7.5],
    [28, 9.5],
    [22, 7.5],
  ]) {
    for (const side of [-1, 1]) {
      const w = wAt(h);
      const a = L(side * w, w, h),
        b = L(side * w, -w, h),
        tip = L(side * span, 0, h + 0.2);
      rod(s, a[0], a[1], a[2], tip[0], tip[1], tip[2], 0.05, grey, x, z);
      rod(s, b[0], b[1], b[2], tip[0], tip[1], tip[2], 0.05, grey, x, z);
      arms.push(tip[0], tip[1] - 2.2, tip[2]);
      // the insulator string
      rod(s, tip[0], tip[1], tip[2], tip[0], tip[1] - 2.2, tip[2], 0.06, 0.15, x, z);
    }
  }
}

export function buildPowerLines(s: RowSink, model: LandscapeModel, fog: boolean): THREE.LineSegments {
  const H = (x: number, z: number) => model.height(x, z) + GROUND_DROP;
  const wires: number[] = [];
  const sag = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, k: number, n: number) => {
    let px = ax,
      py = ay,
      pz = az;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t,
        z = az + (bz - az) * t;
      const y = ay + (by - ay) * t - k * 4 * t * (1 - t);
      wires.push(px, py, pz, x, y, z);
      px = x;
      py = y;
      pz = z;
    }
  };
  // ── the high-voltage line: pylons along the polyline
  let prev: number[] | null = null;
  let left = 0;
  for (let i = 0; i + 1 < LINE.length; i++) {
    const [ax, az] = LINE[i],
      [bx, bz] = LINE[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len,
      dz = (bz - az) / len;
    for (let d = left; d < len; d += SPAN) {
      const x = ax + dx * d,
        z = az + dz * d;
      const y = H(x, z);
      if (y < WL + 0.5 || model.siteAt(x, z, 6) >= 0) continue;
      const arms: number[] = [];
      // arms lie across the line (the local u axis points along (cos yaw, −sin yaw))
      pylon(s, x, y - 0.3, z, Math.atan2(dz, -dx) + Math.PI / 2 + Math.PI / 2, arms);
      if (prev) {
        for (let k = 0; k < arms.length; k += 3) {
          // pair each tip with the nearer tip of the previous pylon's same arm
          const a0 = prev[k],
            a1 = prev[k + 1],
            a2 = prev[k + 2];
          sag(a0, a1, a2, arms[k], arms[k + 1], arms[k + 2], 6, 8);
        }
      }
      prev = arms;
    }
    left = (left + Math.ceil((len - left) / SPAN) * SPAN - len) % SPAN;
  }
  // ── telephone poles along the lanes and the west road, within reach of the camera
  const seen = new Set<number>();
  model.roads.forEach((r, ri) => {
    if (r.kind !== 'lane' && ri !== 0) return;
    const L = r.line;
    const p = { x: 0, z: 0 },
      p2 = { x: 0, z: 0 };
    const side = ri % 2 ? 1 : -1;
    let last: number[] | null = null;
    for (let sa = 6; sa < Math.min(L.length, 2400); sa += 42) {
      L.at(sa, p);
      L.at(sa + 2, p2);
      const tl = Math.hypot(p2.x - p.x, p2.z - p.z) || 1;
      const tx = (p2.x - p.x) / tl,
        tz = (p2.z - p.z) / tl;
      const off = r.halfW + 2.6;
      const x = p.x - tz * off * side,
        z = p.z + tx * off * side;
      const y = H(x, z);
      if (y < WL + 0.6 || model.slabDist(x, z) < 3) {
        last = null;
        continue;
      }
      if (model.siteAt(x, z, 1) >= 0) continue;
      const key = Math.round(x / 8) * 8192 + Math.round(z / 8);
      if (seen.has(key)) continue;
      seen.add(key);
      const hh = 7.4 + 0.8 * hash2i(ri, Math.round(sa), 901);
      const lean = (hash2i(ri, Math.round(sa), 902) - 0.5) * 0.4;
      const top: [number, number, number] = [x + lean * tz, y + hh, z - lean * tx];
      const c = 0.3 + 0.06 * hash2i(ri, Math.round(sa), 903);
      rod(s, x, y - 0.3, z, top[0], top[1], top[2], 0.1, c, x, z);
      // cross-arm across the lane, two insulated wires
      const a0: [number, number, number] = [top[0] + tz * 0.75, top[1] - 0.45, top[2] - tx * 0.75];
      const a1: [number, number, number] = [top[0] - tz * 0.75, top[1] - 0.45, top[2] + tx * 0.75];
      rod(s, a0[0], a0[1], a0[2], a1[0], a1[1], a1[2], 0.05, c * 0.9, x, z);
      const tips = [a0[0], a0[1] + 0.12, a0[2], a1[0], a1[1] + 0.12, a1[2]];
      if (last) {
        sag(last[0], last[1], last[2], tips[0], tips[1], tips[2], 0.55, 4);
        sag(last[3], last[4], last[5], tips[3], tips[4], tips[5], 0.55, 4);
      }
      last = tips;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  g.computeBoundingSphere();
  const mat = new THREE.LineBasicMaterial({ color: WIRE_DAY, fog: false, transparent: true, depthWrite: false });
  // a wire a pixel wide overstates itself with distance: it fades out instead of drawing a white line across the plain
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying float vWireD;`).replace('#include <project_vertex>', `#include <project_vertex>
vWireD = -mvPosition.z;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying float vWireD;`).replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.a *= 0.05 + 0.8 * (1.0 - smoothstep(90.0, 900.0, vWireD));`);
  };
  mat.customProgramCacheKey = () => 'th-landwires-v2';
  const m = new THREE.LineSegments(g, mat);
  m.name = 'land-wires';
  m.matrixAutoUpdate = false;
  return m;
}

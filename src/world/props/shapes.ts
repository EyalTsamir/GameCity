// Shape helpers for real-object props (on top of the vegetation Shaper): chamfered boxes, lathed
// profiles (turned / spun parts), rings, bolt heads. All emit flat-shaded faces into the Shaper's sink
// with explicit normals, in the Shaper's current local frame.

import type { Shaper } from '../vegetation/geo';

const _p: number[] = [];

/** convex planar polygon (local points, flat normal n); winding is fixed to face n */
export function poly(sh: Shaper, pts: number[], nx: number, ny: number, nz: number): void {
  const k = pts.length / 3;
  if (k < 3) return;
  // orientation of the first triangle against n
  const ax = pts[3] - pts[0], ay = pts[4] - pts[1], az = pts[5] - pts[2];
  const bx = pts[6] - pts[0], by = pts[7] - pts[1], bz = pts[8] - pts[2];
  const d = (ay * bz - az * by) * nx + (az * bx - ax * bz) * ny + (ax * by - ay * bx) * nz;
  const ids: number[] = [];
  for (let i = 0; i < k; i++) ids.push(sh.v(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], nx, ny, nz));
  for (let i = 1; i < k - 1; i++) {
    if (d >= 0) sh.s.tri(ids[0], ids[i], ids[i + 1]);
    else sh.s.tri(ids[0], ids[i + 1], ids[i]);
  }
}

/**
 * Box with 45° chamfered edges of width b (26 faces). skip: bitmask like Shaper.box
 * (1 bottom, 2 top, 4 -z, 8 +z, 16 -x, 32 +x) — skipping drops the face only, not its chamfers.
 */
export function cbox(sh: Shaper, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, b: number, skip = 1): void {
  const h = [sx / 2, sy / 2, sz / 2];
  const c = [cx, cy, cz];
  b = Math.min(b, h[0] * 0.9, h[1] * 0.9, h[2] * 0.9);
  const e = [h[0] - b, h[1] - b, h[2] - b];
  const P = (o: number[]) => {
    _p.push(c[0] + o[0], c[1] + o[1], c[2] + o[2]);
  };
  const bit = [
    [16, 32],
    [1, 2],
    [4, 8],
  ];
  const n = [0, 0, 0];
  // faces
  for (let k = 0; k < 3; k++)
    for (const s of [-1, 1]) {
      if (skip & bit[k][s > 0 ? 1 : 0]) continue;
      const u = (k + 1) % 3, v = (k + 2) % 3;
      _p.length = 0;
      for (const [su, sv] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const o = [0, 0, 0];
        o[k] = s * h[k];
        o[u] = su * e[u];
        o[v] = sv * e[v];
        P(o);
      }
      n[0] = n[1] = n[2] = 0;
      n[k] = s;
      poly(sh, _p, n[0], n[1], n[2]);
    }
  if (b <= 1e-4) return;
  // edge chamfers
  for (let l = 0; l < 3; l++) {
    const i = (l + 1) % 3, j = (l + 2) % 3;
    for (const si of [-1, 1])
      for (const sj of [-1, 1]) {
        if (i === 1 && si < 0 && skip & 1) continue; // bottom edges vanish into the ground
        if (j === 1 && sj < 0 && skip & 1) continue;
        _p.length = 0;
        for (const [a, sl] of [
          [0, -1],
          [1, -1],
          [1, 1],
          [0, 1],
        ]) {
          const o = [0, 0, 0];
          o[l] = sl * e[l];
          if (a === 0) {
            o[i] = si * h[i];
            o[j] = sj * e[j];
          } else {
            o[i] = si * e[i];
            o[j] = sj * h[j];
          }
          P(o);
        }
        n[0] = n[1] = n[2] = 0;
        n[i] = si * Math.SQRT1_2;
        n[j] = sj * Math.SQRT1_2;
        poly(sh, _p, n[0], n[1], n[2]);
      }
  }
  // corners
  const r3 = 1 / Math.sqrt(3);
  for (const sx2 of [-1, 1])
    for (const sy2 of [-1, 1])
      for (const sz2 of [-1, 1]) {
        if (sy2 < 0 && skip & 1) continue;
        const sg = [sx2, sy2, sz2];
        _p.length = 0;
        for (let k = 0; k < 3; k++) {
          const o = [sg[0] * e[0], sg[1] * e[1], sg[2] * e[2]];
          o[k] = sg[k] * h[k];
          P(o);
        }
        poly(sh, _p, sx2 * r3, sy2 * r3, sz2 * r3);
      }
}

/**
 * Lathe: revolve a profile of [radius, y] pairs (bottom → top) around local Y at (cx, cz).
 * Each profile segment gets its own ring of vertices (crisp mouldings); smooth around the axis.
 * A profile that starts / ends at radius 0 closes itself.
 */
export function lathe(sh: Shaper, cx: number, cz: number, prof: number[][], sides: number, rot = 0): void {
  const s = sh.s;
  for (let p = 0; p < prof.length - 1; p++) {
    const [r0, y0] = prof[p], [r1, y1] = prof[p + 1];
    const dr = r1 - r0, dy = y1 - y0;
    const len = Math.hypot(dr, dy);
    if (len < 1e-6) continue;
    // outward normal of the segment in the (r, y) plane
    const nr = dy / len, ny = -dr / len;
    const a: number[] = [], bb: number[] = [];
    for (let i = 0; i <= sides; i++) {
      const t = rot + (i / sides) * Math.PI * 2;
      const co = Math.cos(t), sn = Math.sin(t);
      a.push(sh.v(cx + co * r0, y0, cz + sn * r0, co * nr, ny, sn * nr));
      bb.push(sh.v(cx + co * r1, y1, cz + sn * r1, co * nr, ny, sn * nr));
    }
    for (let i = 0; i < sides; i++) s.quad(a[i], bb[i], bb[i + 1], a[i + 1]);
  }
}

/** hexagonal bolt head / nut on a face: centre (x,y,z) in the local frame, facing local +Z */
export function boltZ(sh: Shaper, x: number, y: number, z: number, r: number): void {
  sh.push().local(x, y, z, Math.PI / 2, 0, 0);
  sh.cyl(0, 0, 0, r, r * 0.92, r * 0.7, 6, 2, false);
  sh.pop();
}

/** bolt head standing up on a horizontal surface at (x, y, z) */
export function boltY(sh: Shaper, x: number, y: number, z: number, r: number): void {
  sh.cyl(x, y, z, r, r * 0.92, r * 0.7, 6, 2, false);
}

/** horizontal torus-ish ring (n-gon tube) of radius R at height y */
export function ring(sh: Shaper, cx: number, y: number, cz: number, R: number, r: number, sides: number): void {
  lathe(sh, cx, cz, [
    [R - r, y - r * 0.7],
    [R + r * 0.7, y - r],
    [R + r, y],
    [R + r * 0.7, y + r],
    [R - r, y + r * 0.7],
  ], sides);
}

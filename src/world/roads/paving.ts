// Pavement slabs that moved (?noliftedslabs). The sidewalk is one flat sheet with its bond drawn by the shader; here a
// few slabs become real objects on exactly the shader's grid: rocked up on one edge or corner, more and higher where a
// street tree's roots run under them, with their dark side faces showing. They catch the low sun and break the plane
// at eye level. Same material and world-xz frame as the sheet below, so the joints and tones line up.

import type { CityContext } from '../../core/context';
import { CORRIDOR_HALF, ROAD_HALF, SIDEWALK_Y } from '../../core/constants';
import { hash01 } from '../../core/rng';
import type { MeshBuilder } from './builder';
import { HM, surf } from './surfaces';
import { walkStyle } from './streets';

/** the paved sidewalk bonds of surfaces.ts (style → slab size, row offset); setts (style 1) settle instead of rocking */
const BONDS: Record<number, { sx: number; sz: number; bond: number } | undefined> = {
  0: { sx: 1.2, sz: 0.6, bond: 0.5 },
  2: { sx: 0.9, sz: 0.9, bond: 0 },
  3: { sx: 2, sz: 2, bond: 0 },
};

export function buildLiftedSlabs(ctx: CityContext, H: MeshBuilder): number {
  const plan = ctx.plan;
  const trees = plan.slots.filter((s) => s.kind === 'tree');
  const drives = plan.areas.filter((a) => a.kind === 'driveway');
  const LAT0 = ROAD_HALF + 0.26,
    LAT1 = CORRIDOR_HALF - 0.05;
  let count = 0;
  const seen = new Set<string>();
  for (const seg of plan.roadSegments) {
    if (!seg.sidewalks) continue;
    const A = plan.roadNodes[seg.a],
      B = plan.roadNodes[seg.b];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    const dx = (B.x - A.x) / L,
      dz = (B.z - A.z) / L;
    const rx = -dz,
      rz = dx;
    const s0 = A.kind === 'portal' ? 2 : CORRIDOR_HALF + 1.4,
      s1 = B.kind === 'portal' ? L - 2 : L - CORRIDOR_HALF - 1.4;
    for (const sd of [1, -1]) {
      const px = (s: number, lat: number) => A.x + dx * s + rx * lat * sd,
        pz = (s: number, lat: number) => A.z + dz * s + rz * lat * sd;
      const x0 = Math.min(px(s0, LAT0), px(s1, LAT1)),
        x1 = Math.max(px(s0, LAT0), px(s1, LAT1)),
        z0 = Math.min(pz(s0, LAT0), pz(s1, LAT1)),
        z1 = Math.max(pz(s0, LAT0), pz(s1, LAT1));
      const style = walkStyle(plan.districtAt(px((s0 + s1) / 2, 5.5), pz((s0 + s1) / 2, 5.5))?.kind);
      const bond = BONDS[style];
      if (!bond) continue;
      for (let row = Math.floor(z0 / bond.sz); row * bond.sz < z1; row++) {
        const off = (((row % 2) + 2) % 2) * bond.bond;
        for (let i = Math.floor(x0 / bond.sx + off); (i - off) * bond.sx < x1; i++) {
          const ax = (i - off) * bond.sx,
            bx = ax + bond.sx,
            az = row * bond.sz,
            bz = az + bond.sz;
          if (ax < x0 || bx > x1 || az < z0 || bz > z1) continue;
          const key = `${style}:${i}:${row}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (drives.some((d) => ax < d.rect.x1 && bx > d.rect.x0 && az < d.rect.z1 && bz > d.rect.z0)) continue;
          const cx = (ax + bx) / 2,
            cz = (az + bz) / 2;
          let root = 0,
            tx = 0,
            tz = 0;
          for (const t of trees) {
            const d = Math.hypot(t.x - cx, t.z - cz);
            if (d < 2.1 && 1 - d / 2.1 > root) {
              root = 1 - d / 2.1;
              tx = t.x;
              tz = t.z;
            }
          }
          const h = (k: number) => hash01(i, row, k + 700 + style);
          if (h(0) > 0.028 + 0.7 * root) continue;
          // corner lift (metres): root heave raises the side towards the tree; otherwise an edge or a corner rocks up
          const amp = (0.009 + 0.021 * h(1)) * (1 + 1.6 * root);
          let c00 = 0,
            c10 = 0,
            c11 = 0,
            c01 = 0;
          if (root > 0) {
            const ux = Math.sign(tx - cx) || 1,
              uz = Math.sign(tz - cz) || 1;
            const w = Math.abs(tx - cx) > Math.abs(tz - cz) ? [0.9, 0.2] : [0.2, 0.9];
            const lift = (sx: number, sz: number) => amp * (w[0] * (sx === ux ? 1 : 0) + w[1] * (sz === uz ? 1 : 0));
            c00 = lift(-1, -1);
            c10 = lift(1, -1);
            c11 = lift(1, 1);
            c01 = lift(-1, 1);
          } else {
            const kind = h(2);
            if (kind < 0.4) {
              const e = Math.floor(h(3) * 4);
              c00 = e === 0 || e === 3 ? amp : 0;
              c10 = e === 0 || e === 1 ? amp : 0;
              c11 = e === 1 || e === 2 ? amp : 0;
              c01 = e === 2 || e === 3 ? amp : 0;
            } else {
              const e = Math.floor(h(3) * 4);
              c00 = e === 0 ? amp * 1.2 : amp * 0.15;
              c10 = e === 1 ? amp * 1.2 : amp * 0.15;
              c11 = e === 2 ? amp * 1.2 : amp * 0.15;
              c01 = e === 3 ? amp * 1.2 : amp * 0.15;
            }
          }
          const y = SIDEWALK_Y + 0.0018;
          const w = bx - ax,
            d = bz - az;
          const gx = (c10 - c00 + c11 - c01) / (2 * w),
            gz = (c01 - c00 + c11 - c10) / (2 * d);
          const nl = Math.hypot(gx, 1, gz);
          const nx = -gx / nl,
            ny = 1 / nl,
            nz = -gz / nl;
          const I = 0.004;
          surf(H, HM.walk, style, 9, 0);
          const v = [H.v(ax + I, y + c00, az + I, nx, ny, nz), H.v(bx - I, y + c10, az + I, nx, ny, nz), H.v(bx - I, y + c11, bz - I, nx, ny, nz), H.v(ax + I, y + c01, bz - I, nx, ny, nz)];
          H.quadFacing(v[0], v[1], v[2], v[3], 0, 1, 0);
          // side faces show only where the slab stands proud
          surf(H, HM.side, 1, 9, 0);
          const edge = (x0e: number, z0e: number, x1e: number, z1e: number, ya: number, yb: number, ox: number, oz: number) => {
            if (Math.max(ya, yb) < 0.003) return;
            const q = [H.v(x0e, SIDEWALK_Y - 0.002, z0e, ox, 0, oz), H.v(x1e, SIDEWALK_Y - 0.002, z1e, ox, 0, oz), H.v(x1e, y + yb, z1e, ox, 0, oz), H.v(x0e, y + ya, z0e, ox, 0, oz)];
            H.quadFacing(q[0], q[1], q[2], q[3], ox, 0, oz);
          };
          edge(ax + I, az + I, bx - I, az + I, c00, c10, 0, -1);
          edge(bx - I, az + I, bx - I, bz - I, c10, c11, 1, 0);
          edge(bx - I, bz - I, ax + I, bz - I, c11, c01, 0, 1);
          edge(ax + I, bz - I, ax + I, az + I, c01, c00, -1, 0);
          count++;
        }
      }
    }
  }
  return count;
}

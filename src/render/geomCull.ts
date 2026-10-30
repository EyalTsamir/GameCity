// Geometry hunt (?nohiddencull, docs/progress/geometry-hunt.md): one pass over the finished static meshes at boot that
// drops the triangles nobody can ever see: degenerate ones, faces looking down onto the ground they stand on, and
// faces wholly under the terrain. Measured by scripts/geomaudit.mjs (degenerate / bottom / buried). Only the index
// changes, so nothing else about a mesh does; shadows are safe because a removed bottom only ever shadowed its own footprint.

import * as THREE from 'three';
import type { CityContext } from '../core/context';
import { geomHunt } from '../core/geomhunt';
import type { TerrainService } from '../world/terrain';

/** world-space static merged meshes (instanced, animated and ground / water sheets stay out) */
const MESHES = /^(props-|landmarks-static|landmarks-detail|harbor-north|harbor-beach|harbor-south|terrain-masonry|terrain-railings|traffic-signal|rail-bed|rail-fixings|rail-furniture|roads-hardscape|land-farmstead|veg-plants|buildings-trim)/;
/** tunnel linings lie under the hill by design: nothing near a portal or along the bores counts as buried */
const PORTAL_R = 45;
const BURIED = 0.08;
const ON_GROUND = 0.035;

export function cullHiddenTriangles(ctx: CityContext): void {
  const terrain = ctx.services.terrain as TerrainService | undefined;
  if (!terrain || !geomHunt(ctx, 'hiddencull')) return;
  const H = terrain.height;
  const portals = terrain.portals;
  const nearPortal = (x: number, z: number): boolean => portals.some((p) => Math.abs(p.x - x) < PORTAL_R && Math.abs(p.z - z) < PORTAL_R);
  const seen = new Set<THREE.BufferGeometry>();
  const debug = new URLSearchParams(location.search).has('debug');
  const t0 = performance.now();
  let dropped = 0;
  ctx.scene.updateMatrixWorld(true);
  ctx.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || !MESHES.test(m.name) || seen.has(m.geometry)) return;
    const geo = m.geometry;
    seen.add(geo);
    const pos = geo.getAttribute('position');
    if (!pos || geo.groups.length > 0 || geo.drawRange.count !== Infinity || !m.matrixWorld.equals(IDENTITY)) return;
    const idx = geo.index;
    const n = idx ? idx.count : pos.count;
    const keep = pos.count > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    let k = 0;
    for (let i = 0; i < n; i += 3) {
      const a = idx ? idx.getX(i) : i,
        b = idx ? idx.getX(i + 1) : i + 1,
        c = idx ? idx.getX(i + 2) : i + 2;
      const ax = pos.getX(a),
        ay = pos.getY(a),
        az = pos.getZ(a),
        bx = pos.getX(b),
        by = pos.getY(b),
        bz = pos.getZ(b),
        cx = pos.getX(c),
        cy = pos.getY(c),
        cz = pos.getZ(c);
      const ux = bx - ax,
        uy = by - ay,
        uz = bz - az,
        vx = cx - ax,
        vy = cy - ay,
        vz = cz - az;
      const nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      let hidden = len < 1e-7;
      if (!hidden) {
        const mx = (ax + bx + cx) / 3,
          my = (ay + by + cy) / 3,
          mz = (az + bz + cz) / 3;
        const g = H(mx, mz);
        const top = Math.max(ay, by, cy);
        if (ny / len < -0.7 && top <= g + 3 * ON_GROUND) hidden = top <= Math.min(H(ax, az), H(bx, bz), H(cx, cz)) + ON_GROUND;
        else if (my < g - BURIED) hidden = ay < H(ax, az) - BURIED && by < H(bx, bz) - BURIED && cy < H(cx, cz) - BURIED && !nearPortal(mx, mz);
      }
      if (hidden) {
        dropped++;
        continue;
      }
      keep[k++] = a;
      keep[k++] = b;
      keep[k++] = c;
    }
    if (k < n) geo.setIndex(new THREE.BufferAttribute(keep.slice(0, k), 1));
  });
  if (debug) console.info(`[geomCull] ${dropped} triangles dropped in ${(performance.now() - t0).toFixed(0)} ms`);
}

const IDENTITY = new THREE.Matrix4();

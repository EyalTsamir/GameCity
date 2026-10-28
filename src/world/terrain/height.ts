// The rendered terrain surface: plan.heightAt() plus local refinements that only
// this module's geometry knows about. Everything outside the refinement zones is
// *exactly* plan.heightAt(), so other modules placing things with the plan stay glued
// to the ground. Refinements:
//   * quay walls: the vertical drop happens inside the wall body (hidden), not in the open
//   * river mouth (x > 121): natural sandy banks instead of a sheer cut through the beach
//   * east spur: a steep rocky cliff into the sea instead of a vertical step
//   * park pond: carved bowl with banks + the little island
//   * tunnel portals: approach cuts in front of the facades, hill raised behind them
//
// Shared by the terrain module (ground mesh, slab faces, walls, portals) and the water
// module (depth bake, cut-away faces), memoised per plan.

import { heightAt, RIDGE_FOOT_Z } from '../../core/plan';
import type { CityPlan } from '../../core/plan';
import { RIVER, QUAY_X, SLAB, WATER_LEVEL } from '../../core/constants';
import { smoothstep, clamp } from '../../core/geom';

/** Global downward offset of the ground mesh so flat overlays (asphalt, plazas…) never z-fight it. */
export const GROUND_DROP = -0.04;

export const POND_LEVEL = -0.3;

/** River walls are extended (visually) to here, where the sandy river mouth begins. */
export const RIVER_WALL_END_X = 121;
/** Sea wall extent (the plan's wall runs -140..-6; extended south to where the beach step vanishes). */
export const SEA_WALL_Z0 = -140;
export const SEA_WALL_Z1 = 6;
export const RIVER_WALL_T = 0.5;
export const SEA_WALL_T = 0.6;
const RIVER_N_RAMP = RIVER.z0 - RIVER_WALL_T / 2; // 109.75
const RIVER_S_RAMP = RIVER.z1 + RIVER_WALL_T / 2; // 126.25
const SEA_RAMP = QUAY_X - SEA_WALL_T / 2; // 135.7
const RIVER_ZC = (RIVER.z0 + RIVER.z1) / 2; // 118

export interface PortalDef {
  id: number;
  kind: 'road' | 'rail';
  x: number;
  z: number;
  yaw: number;
  cos: number;
  sin: number;
  /** arch opening width / crown height / springing (top of the vertical jambs) */
  width: number;
  height: number;
  spring: number;
  /** headwall half width, top, thickness */
  halfW: number;
  top: number;
  thick: number;
  /** wing wall reach on the -x' / +x' side (local), and their end heights */
  reach: [number, number];
  wingEnd: [number, number];
  /** tunnel bore length behind the facade front */
  bore: number;
}

export interface PondShape {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  level: number;
  bedY: number;
}

export interface TerrainModel {
  plan: CityPlan;
  portals: PortalDef[];
  pond: PondShape | null;
  island: { x: number; z: number; r: number } | null;
  /** refined terrain height (without GROUND_DROP) */
  height(x: number, z: number): number;
  /** natural plan height (no refinements) */
  natural(x: number, z: number): number;
  /** local water surface level at (x,z) (pond level inside the pond, else sea level) */
  waterLevel(x: number, z: number): number;
  /** true where a refinement changes the plan height noticeably */
  refined(x: number, z: number): boolean;
  /** true inside a tunnel mouth (ground triangles there are dropped) */
  inPortalMouth(x: number, z: number): boolean;
}

const cache = new WeakMap<CityPlan, TerrainModel>();

export function getTerrainModel(plan: CityPlan): TerrainModel {
  let m = cache.get(plan);
  if (!m) {
    m = buildModel(plan);
    cache.set(plan, m);
  }
  return m;
}

function smax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/** beach / sea-floor height east of the boardwalk, independent of z for z > 6 */
function beachH(x: number): number {
  return heightAt(x, 100);
}

function buildModel(plan: CityPlan): TerrainModel {
  const P0 = plan.water.ponds[0];
  const pond: PondShape | null = P0 ? { cx: P0.cx, cz: P0.cz, rx: P0.rx, rz: P0.rz, level: P0.level ?? POND_LEVEL, bedY: P0.bedY } : null;
  const isl = plan.features.find((f) => f.kind === 'pondisland');
  const island = isl ? { x: isl.x, z: isl.z, r: Number(isl.params?.radius ?? isl.radius ?? 2.6) || 2.6 } : null;

  // ── portals
  const portals: PortalDef[] = [];
  for (const f of plan.features) {
    if (f.kind !== 'roadportal' && f.kind !== 'railportal') continue;
    const road = f.kind === 'roadportal';
    const width = Number(f.params?.width ?? (road ? 10 : 7));
    const height = Number(f.params?.height ?? (road ? 6.5 : 7));
    const p: PortalDef = {
      id: portals.length,
      kind: road ? 'road' : 'rail',
      x: f.x,
      z: f.z,
      yaw: f.yaw,
      cos: Math.cos(f.yaw),
      sin: Math.sin(f.yaw),
      width,
      height,
      spring: road ? 3.7 : height - width / 2,
      halfW: road ? width / 2 + 6 : width / 2 + 3.2,
      top: 0,
      thick: 1.2,
      reach: road ? [19, 19] : [10.5, 10.5],
      wingEnd: [0, 0],
      bore: road ? 20 : 0,
    };
    if (!road) {
      // rail bores run to just short of the track end inside the hill
      const toEnd = p.sin > 0 ? f.x - (plan.rail.x0 + 0.6) : plan.rail.x1 - 0.2 - f.x;
      p.bore = Math.max(10, Math.abs(toEnd));
    }
    // headwall top: comfortably above the opening and above the natural slope at the wall line
    let natMax = 0;
    for (let s = -p.halfW; s <= p.halfW + 1e-6; s += 1) natMax = Math.max(natMax, natAtLocal(p, s, -p.thick / 2));
    p.top = Math.max(height + (road ? 3.1 : 2.6), natMax + 1.3);
    for (const side of [0, 1] as const) {
      const sx = side === 0 ? -p.reach[0] : p.reach[1];
      p.wingEnd[side] = Math.max(1.6, Math.min(p.top - 1.2, natAtLocal(p, sx, -p.thick / 2) + 0.45));
    }
    portals.push(p);
  }

  function natAtLocal(p: PortalDef, lx: number, lz: number): number {
    const x = p.x + lx * p.cos + lz * p.sin;
    const z = p.z - lx * p.sin + lz * p.cos;
    return heightAt(x, z);
  }

  function wallTop(p: PortalDef, ax: number, side: 0 | 1): number {
    if (ax <= p.halfW) return p.top;
    const reach = p.reach[side];
    const t = clamp((ax - p.halfW - 0.9) / Math.max(0.1, reach - p.halfW - 0.9), 0, 1);
    return p.top - 1.1 + (p.wingEnd[side] - (p.top - 1.1)) * t;
  }

  function applyPortal(p: PortalDef, x: number, z: number, h: number): number {
    const dx = x - p.x,
      dz = z - p.z;
    const lx = dx * p.cos - dz * p.sin;
    const lz = dx * p.sin + dz * p.cos;
    const ax = Math.abs(lx);
    const side: 0 | 1 = lx < 0 ? 0 : 1;
    const reach = p.reach[side];
    if (ax > reach + 6 || lz > 4 || lz < -(p.bore + 12)) return h;
    const ramp = -p.thick / 2;
    const core = p.width / 2 + 1.6;
    if (lz >= ramp) {
      // in front of the wall line: dig the approach down to track / road level
      // (road portals: the whole length of the wing walls, so no bare earth wedge climbs the wall's
      // end; the ridge rock starts at the wall end — cliffs.ts)
      const f0 = p.kind === 'road' ? reach - 0.4 : Math.max(core, reach - 6);
      let w = 1 - smoothstep(f0, p.kind === 'road' ? reach + 1.4 : reach, ax);
      w *= 1 - smoothstep(1.6, 3.8, lz);
      return h * (1 - w);
    }
    // behind the wall line: hill raised to the wall top, then blending into the natural slope
    const back = ramp - lz;
    const R = wallTop(p, Math.min(ax, reach), side) - 0.05 + 0.075 * back;
    let w = 1 - smoothstep(reach, reach + 3.5, ax);
    // only the first metres behind the facade are lifted (enough to bury the parapet);
    // further back the natural hill takes over (and never spills over the east cliff)
    w *= 1 - smoothstep(5, 13, back);
    if (w <= 0) return h;
    const raised = smax(h, R, 1.5);
    return h + (raised - h) * w;
  }

  function cliff(x: number, z: number, h: number): number {
    // east spur / ridge end: steep rock face into the harbour instead of a vertical step
    if (z >= SEA_WALL_Z0 || x < SEA_RAMP || x > 141) return h;
    const toe = 136 + 3.6 * smoothstep(SEA_WALL_Z0, SEA_WALL_Z0 - 7, z);
    if (x > toe) return h;
    const top = heightAt(SEA_RAMP - 0.01, z);
    const bottom = heightAt(Math.max(toe, QUAY_X + 0.01) + 0.01, z);
    if (top <= bottom) return h;
    const t = clamp((x - SEA_RAMP) / Math.max(0.02, toe - SEA_RAMP), 0, 1);
    return top + (bottom - top) * Math.pow(t, 0.72);
  }

  function riverBand(x: number, z: number, h: number): number {
    // walled channel (x < 121): the drop sits inside the wall bodies
    let walled = h;
    if (z > RIVER_N_RAMP && z < RIVER_S_RAMP) walled = Math.min(RIVER.bedY, heightAt(x, RIVER_ZC));
    if (x <= RIVER_WALL_END_X) return walled;
    // river mouth: sandy banks sloping into the channel, which widens, flattens and shoals into the sea floor
    // by x ≈ 165 (a constant trench drew a straight dark band through the surf all the way to the slab edge)
    const r = Math.abs(z - RIVER_ZC);
    const t = x - RIVER_WALL_END_X;
    const floor = RIVER.bedY + (beachH(x) - RIVER.bedY) * smoothstep(RIVER_WALL_END_X, 165, x);
    const bank = floor + Math.max(0, r - 5 - t * 0.12) * (0.9 / (1 + t * 0.06));
    const mouth = Math.min(beachH(x), Math.max(floor, bank));
    const s = smoothstep(RIVER_WALL_END_X, RIVER_WALL_END_X + 4, x);
    return walled + (mouth - walled) * s;
  }

  function pondH(x: number, z: number, h: number): number {
    if (!pond) return h;
    const ex = (x - pond.cx) / pond.rx,
      ez = (z - pond.cz) / pond.rz;
    const rho = Math.sqrt(ex * ex + ez * ez);
    if (rho > 1.16) return h;
    let v: number;
    const wl = pond.level - 0.02;
    if (rho >= 1) v = wl + (0 - wl) * smoothstep(1, 1.16, rho);
    else v = wl - (wl - pond.bedY) * smoothstep(1.0, 0.6, rho);
    if (island) {
      const r = Math.hypot(x - island.x, z - island.z);
      if (r < island.r + 1.8) {
        const iv = r < island.r ? 0.1 + (wl - 0.1) * smoothstep(island.r * 0.3, island.r, r) : wl - (wl - pond.bedY) * smoothstep(island.r, island.r + 1.8, r);
        v = Math.max(v, iv);
      }
    }
    return Math.min(h, v);
  }

  const height = (x: number, z: number): number => {
    let h = heightAt(x, z);
    // river band (walls + mouth)
    if (z > RIVER.z0 - 6 && z < RIVER.z1 + 6 && x < SLAB.x1 + 1) h = riverBand(x, z, h);
    // harbour sea wall: drop hidden in the wall body
    if (x > SEA_RAMP && x <= QUAY_X + 0.01 && z >= SEA_WALL_Z0 && z <= SEA_WALL_Z1) h = heightAt(QUAY_X + 0.01, z);
    // east cliff
    if (z < SEA_WALL_Z0 && x > SEA_RAMP - 0.5) h = cliff(x, z, h);
    // pond
    if (pond && Math.abs(x - pond.cx) < pond.rx * 1.2 && Math.abs(z - pond.cz) < pond.rz * 1.2) h = pondH(x, z, h);
    // portals
    if (z < RIDGE_FOOT_Z + 30) for (const p of portals) h = applyPortal(p, x, z, h);
    return h;
  };

  const waterLevel = (x: number, z: number): number => {
    if (pond) {
      const ex = (x - pond.cx) / pond.rx,
        ez = (z - pond.cz) / pond.rz;
      if (ex * ex + ez * ez < 1.5) return pond.level;
    }
    return WATER_LEVEL;
  };

  const refined = (x: number, z: number): boolean => Math.abs(height(x, z) - heightAt(x, z)) > 0.02;

  /** true inside a portal's mouth slab (the wall-line ramp would otherwise close the opening) */
  const inPortalMouth = (x: number, z: number): boolean => {
    for (const p of portals) {
      const dx = x - p.x,
        dz = z - p.z;
      const lx = dx * p.cos - dz * p.sin;
      const lz = dx * p.sin + dz * p.cos;
      if (Math.abs(lx) < p.width / 2 + 0.3 && lz > -p.thick - 0.05 && lz < 0.05) return true;
    }
    return false;
  };

  return { plan, portals, pond, island, height, natural: heightAt, waterLevel, refined, inPortalMouth };
}

/** Local (portal) -> world transform helpers. */
export function portalToWorld(p: PortalDef, lx: number, lz: number): { x: number; z: number } {
  return { x: p.x + lx * p.cos + lz * p.sin, z: p.z - lx * p.sin + lz * p.cos };
}

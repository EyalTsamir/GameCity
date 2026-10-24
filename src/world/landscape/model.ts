// The world beyond the slab (three-free, deterministic): height, water and ground cover for any
// point. Inside the slab everything is the terrain module's (`terrain.height`); outside, the
// height is the slab-edge height blended over BLEND metres into the world relief, so the slab
// ground mesh and the landscape mesh meet without a crack or a step.
//
// World map (1 unit = 1 m, north = −z, east = +x; slab x −200..200, z −190..150):
//   N   the slab's ridge continues, a shallow wooded valley behind its crest, then forested hills
//       rising toward the mountain layers (landscape/mountains.ts, 4–16 km)
//   W   farmland (field patchwork, hedgerows, copses, farmsteads) and a village with a spire;
//       the west spur continues as low wooded hills in the NW
//   S   meadows and fields rising to low hills, orchards
//   E   open sea to the horizon; cliff coast north of the harbour up to a NE headland, beach and
//       dunes south of the town up to a SE headland; an island ENE
//   the river leaves the slab at x = −200 (walled channel z 110–126) and meanders W/NW into the hills,
//   at the sea's level (−1.6: the same reflection plane as the sea)

import { SLAB, WATER_LEVEL, RIVER } from '../../core/constants';
import { fbm, ridged, smooth, lerp, smin, vnoise, hash2i } from './noise';
import { Polyline, type PolyHit } from './polyline';

/** slab-edge → world height blend distance (m) */
export const BLEND = 46;
/** water level of the sea and the river outside the slab */
export const WL = WATER_LEVEL;
/** city centre (rough) — distances for LOD / relief growth are measured from here */
export const CX = 0,
  CZ = -20;

export interface Cover {
  /** 1 under water */
  water: number;
  /** beach sand / dunes 0..1 */
  sand: number;
  /** bare rock (cliffs, steep slopes) 0..1 */
  rock: number;
  /** forest canopy density 0..1 */
  forest: number;
  /** cultivated fields (patchwork) 0..1 */
  field: number;
  /** wild / long grass meadow (not cultivated, not forest) 0..1 */
  meadow: number;
  /** wet ground: river banks, marsh 0..1 */
  wet: number;
}

export interface Site {
  kind: 'village' | 'farm' | 'hamlet';
  x: number;
  z: number;
  /** radius of the flattened / built area */
  r: number;
  seed: number;
}

export interface LandscapeModel {
  /** rendered ground height (= terrain.height inside the slab) */
  height(x: number, z: number): number;
  /** world relief before the slab-edge blend (outside the slab only meaningful) */
  world(x: number, z: number): number;
  /** still-water level at (x, z) (WL; the park pond is the terrain's) */
  waterLevel(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
  /** ground cover; pass the height / slope (tan) when known (saves five height evaluations) */
  cover(x: number, z: number, out: Cover, h?: number, slope?: number): Cover;
  insideSlab(x: number, z: number): boolean;
  /** distance outside the slab rectangle (0 inside) */
  slabDist(x: number, z: number): number;
  /** signed distance to the coast (>0 land, <0 sea), exact within ~900 m */
  coastSD(x: number, z: number): number;
  /** distance to the river centreline (≤ maxD) and its local half width */
  river(x: number, z: number, out: { d: number; halfW: number; s: number; tx: number; tz: number; side?: number }): boolean;
  /** forest canopy density 0..1 (h = ground height at the point) */
  forestAt(x: number, z: number, h: number): number;
  /** 0..1: the low coastal strip south of the town is grazing land (pasture / hay parcels only) */
  grazing(x: number, z: number, sd?: number): number;
  /** coast profile 0 beach … 1 cliff */
  cliffness(x: number, z: number): number;
  /** index of the settlement covering (x, z) within `pad` m of its radius, or -1 */
  siteAt(x: number, z: number, pad: number): number;
  /** nearest country road within maxD: distance, road index, arc length, level there */
  road(x: number, z: number, out: RoadHit, maxD?: number): boolean;
  roads: Road[];
  riverLine: Polyline;
  coastLine: Polyline;
  sites: Site[];
  /** island centre / radius (for boats, ships) */
  island: { x: number; z: number; r: number; peak: number };
}

// ───────────────────────────────────────────────────── geography ──

/** river centreline from the slab edge upstream (W / NW) */
const RIVER_CTRL: [number, number][] = [
  [-200, 118],
  [-232, 117.5],
  [-275, 120],
  [-330, 132],
  [-400, 154],
  [-480, 170],
  [-565, 168],
  [-650, 146],
  [-735, 112],
  [-830, 96],
  [-935, 106],
  [-1040, 140],
  [-1160, 156],
  [-1290, 136],
  [-1420, 92],
  [-1560, 58],
  [-1720, 46],
  [-1880, 62],
  [-2040, 40],
  [-2220, -18],
  [-2420, -110],
  [-2640, -230],
  [-2900, -380],
  [-3200, -560],
  [-3560, -770],
  [-4000, -1010],
  [-4600, -1330],
  [-5400, -1760],
  [-6600, -2400],
  [-8200, -3200],
];

/**
 * coastline from far north to far south (land on the west side). Through the slab it follows the
 * harbour cliff / quay (x 136) and the beach waterline (x 141); outside: a cliffy coast north to a NE
 * headland, a beach + dunes south to a SE headland.
 */
const COAST_CTRL: [number, number][] = [
  [1700, -14000],
  [1400, -8000],
  [1150, -5000],
  [980, -3400],
  [820, -2500],
  [640, -1900],
  [520, -1450],
  [500, -1180],
  [560, -1000],
  [690, -880],
  [735, -805],
  [700, -745],
  [600, -690],
  [470, -630],
  [345, -560],
  [240, -470],
  [175, -370],
  [146, -280],
  [137, -215],
  [136, -190],
  [136, -140],
  [136, -6],
  [141, 6],
  [141, 150],
  [143, 215],
  [152, 300],
  [172, 395],
  [212, 490],
  [278, 580],
  [372, 655],
  [500, 712],
  [640, 742],
  [760, 770],
  [812, 815],
  [790, 880],
  [700, 950],
  [612, 1040],
  [570, 1200],
  [600, 1480],
  [700, 1900],
  [860, 2600],
  [1050, 3600],
  [1300, 5200],
  [1700, 8500],
  [2100, 14000],
];

const ISLAND = { x: 2250, z: -560, r: 640, peak: 230 };

/**
 * country roads: the two town roads emerge from their tunnels on the far side of the ridge (portals) and
 * wind off through the valley — west to the villages, north into the hills; lanes link the hamlets.
 */
interface RoadDef {
  kind: 'road' | 'lane';
  halfW: number;
  ctrl: [number, number][];
  /** the first control point is a tunnel portal (facing along the road) */
  portal?: boolean;
}
const ROAD_DEFS: RoadDef[] = [
  { kind: 'road', halfW: 3.2, portal: true, ctrl: [[-110, -372], [-112, -430], [-150, -480], [-260, -505], [-420, -470], [-600, -400], [-820, -330], [-1050, -250], [-1300, -170], [-1520, -110], [-1720, -95], [-1950, -70], [-2300, -40], [-2900, 20], [-3800, 60]] },
  { kind: 'road', halfW: 3.0, portal: true, ctrl: [[55, -372], [52, -440], [20, -560], [-40, -720], [-150, -930], [-260, -1180], [-420, -1500], [-640, -1900], [-900, -2500], [-1150, -3300]] },
  { kind: 'road', halfW: 2.9, ctrl: [[-1720, -95], [-1660, 60], [-1560, 230], [-1380, 380], [-1120, 470], [-880, 520], [-720, 700], [-600, 960], [-520, 1250], [-420, 1650], [-330, 2100], [-250, 2900]] },
  { kind: 'lane', halfW: 2.1, ctrl: [[-1300, -170], [-1290, -330], [-1265, -520], [-1250, -700], [-1290, -950], [-1380, -1300]] },
  { kind: 'lane', halfW: 2.1, ctrl: [[-880, 520], [-760, 420], [-640, 330], [-520, 300], [-420, 330]] },
];

export interface Road {
  kind: 'road' | 'lane';
  halfW: number;
  line: Polyline;
  /** road surface level at each polyline vertex */
  level: Float32Array;
  /** true where the road crosses water (bridge deck) */
  bridge: Uint8Array;
  portal: { x: number; z: number; y: number; dx: number; dz: number } | null;
}

/** villages, hamlets, farmsteads (flattened ground, buildings in landscape/settlements.ts) */
function buildSites(model: { world0(x: number, z: number): number; isWaterW(x: number, z: number): boolean }): Site[] {
  const sites: Site[] = [
    { kind: 'village', x: -1720, z: -95, r: 150, seed: 11 },
    { kind: 'village', x: -420, z: 1650, r: 120, seed: 23 },
    { kind: 'hamlet', x: -880, z: 520, r: 60, seed: 37 },
    { kind: 'hamlet', x: -1250, z: -700, r: 55, seed: 41 },
    // a fishing hamlet on the island's sheltered west side
    { kind: 'hamlet', x: 1995, z: -540, r: 45, seed: 57 },
  ];
  // farmsteads: a jittered lattice over the farmland W and S, skipping water, steep or forested ground
  let seed = 100;
  for (let gx = -12; gx <= 3; gx++) {
    for (let gz = -8; gz <= 10; gz++) {
      const h = hash2i(gx, gz, 77);
      if (h < 0.45) continue;
      const x = gx * 330 + (hash2i(gx, gz, 78) - 0.5) * 220 - 60;
      const z = gz * 330 + (hash2i(gx, gz, 79) - 0.5) * 220 + 40;
      // not on the slab, not too close to it, not in the sea / river
      if (x > -260 && x < 260 && z > -250 && z < 210) continue;
      if (Math.hypot(x - CX, z - CZ) > 3600) continue;
      if (model.isWaterW(x, z) || model.isWaterW(x + 30, z) || model.isWaterW(x - 30, z) || model.isWaterW(x, z + 30) || model.isWaterW(x, z - 30)) continue;
      if (sites.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 120)) continue;
      // a continuous wood right behind the town's ridge; hill farms further north
      if (z < -200 && z > -720 && x > -700) continue;
      if (z < -600 && h < 0.62) continue; // hill farms are fewer
      const h0 = model.world0(x, z);
      if (h0 > (z < -600 ? 230 : 70)) continue;
      sites.push({ kind: 'farm', x, z, r: 34, seed: seed++ });
    }
  }
  return sites;
}

/**
 * southern foot of the northern hill country: the slab ridge's foot (z −163), bending south over the
 * west spur (z −137 at the west edge), then wandering north-west
 */
function footZ(x: number): number {
  const west = -137 - 190 * smooth(-260, -1600, x) + 50 * Math.sin((x + 200) / 410) * smooth(-220, -420, x);
  return lerp(west, -163, smooth(-215, -182, x));
}

// ───────────────────────────────────────────────────── the model ──

export interface RoadHit {
  d: number;
  i: number;
  s: number;
  level: number;
  tx: number;
  tz: number;
}

export interface SlabHeight {
  /** terrain.height (refined slab ground) */
  (x: number, z: number): number;
}

export function createLandscapeModel(slabHeight: SlabHeight): LandscapeModel {
  const riverLine = new Polyline(RIVER_CTRL, 12, 160);
  const coastLine = new Polyline(COAST_CTRL, 14, 200, true);
  const hit: PolyHit = { d: 0, s: 0, side: 1, tx: 1, tz: 0 };
  const rv = { d: 0, halfW: 8, s: 0, tx: 1, tz: 0, side: 1 };

  /** x of the coast at a given z (the coast polyline is monotonic in z) */
  const cz = coastLine.z,
    cxs = coastLine.x;
  const coastX = (z: number): number => {
    if (z <= cz[0]) return cxs[0];
    const n = cz.length - 1;
    if (z >= cz[n]) return cxs[n];
    let lo = 0,
      hi = n;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cz[m] <= z) lo = m;
      else hi = m;
    }
    const t = (z - cz[lo]) / (cz[hi] - cz[lo] || 1);
    return cxs[lo] + (cxs[hi] - cxs[lo]) * t;
  };

  const coastSD = (x: number, z: number): number => {
    if (coastLine.nearest(x, z, hit, 900)) return hit.side > 0 ? hit.d : -hit.d;
    // far from the coast: the sign from the monotonic coast function, magnitude ≥ 900
    return x < coastX(z) ? Math.max(900, coastX(z) - x) : -Math.max(900, x - coastX(z));
  };

  const riverQ = (x: number, z: number, out: { d: number; halfW: number; s: number; tx: number; tz: number; side?: number }, maxD = 420): boolean => {
    if (x > -150) {
      out.d = maxD;
      return false;
    }
    if (!riverLine.nearest(x, z, hit, maxD)) {
      out.d = maxD;
      return false;
    }
    out.d = hit.d;
    out.s = hit.s;
    out.tx = hit.tx;
    out.tz = hit.tz;
    out.side = hit.side;
    // 8 m at the slab (16 m channel), ~13 m in the farmland, narrowing upstream in the hills
    out.halfW = 8 + 5.5 * smooth(0, 420, hit.s) - 3.5 * smooth(2600, 6000, hit.s);
    return true;
  };

  /** coast profile type at a coast point: 0 beach … 1 cliff */
  const cliffness = (z: number, x: number): number => {
    // north coast cliffs, beaches south of the town, rocky headland tips
    let c = 1 - smooth(-260, -120, z); // cliffs north of the harbour
    c = Math.max(c, smooth(560, 700, z) * (1 - smooth(1000, 1250, z))); // SE headland
    c = Math.max(c, smooth(1500, 2000, z) * 0.6);
    c *= 0.75 + 0.25 * vnoise(x / 90, z / 90, 5);
    return Math.min(1, c);
  };

  // ── world relief (no slab blend, no carving) ──
  const relief = (x: number, z: number): number => {
    const r = Math.hypot(x - CX, z - CZ);
    // plains: soft undulation around +0.6
    let h = 0.6 + 1.5 * fbm(x / 240, z / 240, 3, 11) + 0.6 * fbm(x / 70, z / 70, 2, 12) * smooth(150, 400, r);
    // rolling country hills growing with distance from the town
    const amp = 26 * smooth(380, 2600, r) + 150 * smooth(2600, 9000, r);
    h += amp * Math.max(0, fbm(x / 1250, z / 1250, 4, 13) * 0.85 + 0.3);
    // ── the northern hill country (and the NW, where the west spur continues)
    const zf = footZ(x);
    const n = zf - z; // metres north of the foot line
    if (n > -120) {
      // slab ridge crest profile, continued (plan.ts hills(): crest(x) · taper); west of the slab the
      // spur's ~14 m ridge wanders on as a line of low hills
      const xc = Math.max(-200, Math.min(140, x));
      const crest = Math.max(11, 17 + 6 * Math.sin(xc * 0.021 + 0.7) + 3.5 * Math.sin(xc * 0.057 + 2.1) + 1.5 * Math.sin(xc * 0.13));
      const taper = 1 - smooth(118, 142, x) * 0.8;
      const ridgeW = 14 + 4 * Math.sin((x + 200) / 180) + 6 * fbm(x / 300, z / 300, 2, 14);
      const ridgeTop = lerp(ridgeW, crest * taper, smooth(-260, -200, x));
      // behind the crest: a shallow wooded valley, then hills rising toward the mountains
      const valley = 7 + 5 * fbm(x / 500, z / 500, 2, 15);
      let hn = lerp(ridgeTop, valley, smooth(45, 290, n));
      const hillA = smooth(260, 1300, n) * (70 + 120 * smooth(1300, 3600, n));
      hn += hillA * (0.35 + 0.75 * ridged(x / 950, z / 950, 4, 16));
      // spurs and gullies on the slopes (they catch the light from 1–4 km)
      hn += smooth(200, 900, n) * (26 * (ridged(x / 360, z / 360, 3, 19) - 0.42) + 9 * fbm(x / 140, z / 140, 2, 20));
      hn += smooth(-60, 40, n) * 3 * fbm(x / 120, z / 120, 2, 17);
      const w = smooth(-120, 0, n);
      h = lerp(h, Math.max(h, hn), w);
    }
    // south: gentle rise to low hills
    if (z > 400) h += smooth(400, 2600, z) * 22 * (0.5 + 0.5 * fbm(x / 700, z / 700, 3, 18));
    return h;
  };

  // ── world height: relief + river + coast + island + sites (no slab blend) ──
  let sitesRef: Site[] = [];
  let roadsRef: Road[] = [];
  const rhit: PolyHit = { d: 0, s: 0, side: 1, tx: 1, tz: 0 };
  const levelAt = (r: Road, s: number): number => {
    const L = r.line;
    let lo = 0,
      hi = L.s.length - 1;
    if (s <= 0) return r.level[0];
    if (s >= L.length) return r.level[hi];
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (L.s[m] <= s) lo = m;
      else hi = m;
    }
    const t = (s - L.s[lo]) / (L.s[hi] - L.s[lo] || 1);
    return r.level[lo] + (r.level[hi] - r.level[lo]) * t;
  };
  const roadQ = (x: number, z: number, out: RoadHit, maxD = 40): boolean => {
    let best = maxD,
      found = false;
    for (let i = 0; i < roadsRef.length; i++) {
      const r = roadsRef[i];
      if (x < r.line.x0 - maxD || x > r.line.x1 + maxD || z < r.line.z0 - maxD || z > r.line.z1 + maxD) continue;
      if (!r.line.nearest(x, z, rhit, best)) continue;
      if (rhit.d < best) {
        best = rhit.d;
        found = true;
        out.d = rhit.d;
        out.i = i;
        out.s = rhit.s;
        out.tx = rhit.tx;
        out.tz = rhit.tz;
      }
    }
    if (found) out.level = levelAt(roadsRef[out.i], out.s);
    else out.d = maxD;
    return found;
  };
  const roadHit: RoadHit = { d: 0, i: 0, s: 0, level: 0, tx: 1, tz: 0 };

  const world0 = (x: number, z: number, withSites: boolean, withRoads = true): number => {
    let h = relief(x, z);
    // settlements sit on gently levelled ground
    if (withSites) {
      for (let i = 0; i < sitesRef.length; i++) {
        const s = sitesRef[i];
        const dx = x - s.x,
          dz = z - s.z;
        const R = s.r * 1.8;
        if (dx > R || dx < -R || dz > R || dz < -R) continue;
        const d = Math.hypot(dx, dz);
        if (d > R) continue;
        const lvl = siteLevel[i];
        h = lerp(lvl + (h - lvl) * 0.25, h, smooth(s.r * 0.6, R, d));
      }
    }
    // river: a flat floodplain, then the channel with natural banks
    if (riverQ(x, z, rv)) {
      const plain = 0.45 + 0.25 * vnoise(x / 60, z / 60, 21);
      const hw = rv.halfW;
      h = lerp(Math.min(h, plain + (h - plain) * 0.15), h, smooth(hw + 25, hw + 300, rv.d));
      const u = rv.d - hw; // < 0 in the water
      if (u < 8) {
        let p: number;
        if (u < -5) p = -3.5 - 0.5 * smooth(-5, -hw, u);
        else if (u < 0) p = lerp(-3.5, WL - 0.05, smooth(-5, 0, u));
        else p = lerp(WL - 0.05, plain + 0.15, smooth(0, 7.5, u));
        h = smin(h, p, 0.8);
      }
    }
    // country roads: a level bench across the road (cuttings / embankments), not over the river (bridges)
    if (withRoads && roadsRef.length && roadQ(x, z, roadHit, 16)) {
      const r = roadsRef[roadHit.i];
      const river = x < -150 && riverQ(x, z, rv, 40) && rv.d < rv.halfW + 3;
      // nothing is cut behind a tunnel portal (that is the hill the tunnel runs through)
      const behind = r.portal !== null && roadHit.s < 0.5 && (x - r.portal.x) * r.portal.dx + (z - r.portal.z) * r.portal.dz < 0;
      if (!river && !behind) h = lerp(roadHit.level - 0.05, h, smooth(r.halfW + 0.8, r.halfW + 9, roadHit.d));
    }
    // coast
    const sd = coastSD(x, z);
    if (sd < 600) {
      const cl = cliffness(z, x);
      if (sd < 0) {
        const e = -sd;
        const shelf = lerp(0.085, 0.3, cl);
        const floor = WL - Math.min(e * shelf, 3 + e * 0.045) - smooth(400, 3000, e) * 30;
        h = Math.min(h, floor);
        // the island
        h = Math.max(h, islandH(x, z));
      } else {
        // beach: 8 % from the waterline + dunes; cliff: steep face up to the land
        const beach = WL + sd * 0.08 + smooth(20, 40, sd) * (0.8 + 1.4 * vnoise(x / 23, z / 23, 31)) * (1 - smooth(55, 110, sd));
        const cliff = WL + sd * (1.6 + 1.2 * vnoise(x / 40, z / 40, 32));
        const prof = lerp(beach, cliff, cl);
        h = smin(h, prof, 1.5 + 6 * cl);
        // beaches stay low behind the dunes (no hills right at the shore)
        h = lerp(Math.min(h, 3.5 + sd * 0.04), h, Math.max(cl, smooth(120, 420, sd)));
      }
    } else {
      // far inland or far out at sea
      if (sd < -599) h = Math.max(WL - 30 - 30 * smooth(1000, 4000, -sd), islandH(x, z));
    }
    return h;
  };

  function islandH(x: number, z: number): number {
    const dx = x - ISLAND.x,
      dz = z - ISLAND.z;
    const a = Math.atan2(dz, dx);
    const rr = ISLAND.r * (0.72 + 0.36 * vnoise(Math.cos(a) * 2.2 + 5, Math.sin(a) * 2.2 + 5, 41) + 0.14 * Math.sin(a * 3 + 1));
    // a long rocky island running N-S: an asymmetric ridge (crest pushed east, a steep cliff side to the
    // open sea, long gentler slopes toward the town) with three summits and saddles, a cliffed rim with a
    // beach cove on the town side — not a cone
    const d = Math.hypot(dx * 1.55, dz * 0.62) / rr;
    if (d > 1.6) return -1e3;
    const crest = 0.22 * rr;
    const ex = dx - crest;
    const dr = Math.hypot(ex * (ex > 0 ? 2.6 : 1.25), dz * 0.62) / rr;
    const core = 1 - smooth(0, 0.95, dr);
    const tri = 0.5 + 0.5 * Math.cos((dz / rr) * 7.5 + 0.6);
    const rough = 0.55 + 0.75 * ridged(x / 230, z / 230, 4, 42);
    const hill = ISLAND.peak * Math.pow(core, 0.85) * (0.45 + 0.55 * tri) * rough;
    // rim: sea cliffs (tallest facing the open sea), low rocks, one cove with a beach on the town side
    const sea = smooth(-0.4, 0.5, Math.cos(a));
    const cove = smooth(0.93, 0.995, -Math.cos(a));
    const rimH = lerp(lerp(14, 48, sea), 1.5, cove) * (0.75 + 0.5 * vnoise(a * 4 + 3, 7, 43));
    const rim = rimH * (1 - smooth(0.9, 1.0, d)) + 4 * (1 - smooth(0.6, 0.95, d));
    return WL + rim + hill * (1 - smooth(0.85, 1.0, d)) - (d > 1 ? (d - 1) * 60 : 0);
  }

  const water0 = (x: number, z: number) => world0(x, z, false) < WL - 0.02;
  sitesRef = buildSites({ world0: (x, z) => world0(x, z, false), isWaterW: water0 });
  const siteLevel = sitesRef.map((s) => relief(s.x, s.z));
  // road levels: the terrain along the centreline, smoothed (roads ignore small bumps), bridge decks
  // over water, portals cut into the hillside
  roadsRef = ROAD_DEFS.map((def) => {
    const line = new Polyline(def.ctrl, 8, 120);
    const n = line.x.length;
    const raw = new Float32Array(n);
    const wet = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      raw[i] = world0(line.x[i], line.z[i], true, false);
      wet[i] = raw[i] < WL + 0.6 ? 1 : 0;
    }
    const level = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0,
        wsum = 0;
      for (let k = -6; k <= 6; k++) {
        const j = i + k;
        if (j < 0 || j >= n || wet[j]) continue;
        const w = 1 - Math.abs(k) / 7;
        sum += raw[j] * w;
        wsum += w;
      }
      level[i] = wsum > 0 ? sum / wsum : raw[i];
    }
    // bridges: decks over wet stretches, at the higher bank + 1.8 m
    const bridge = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (!wet[i]) continue;
      let a = i,
        b = i;
      while (a > 0 && wet[a]) a--;
      while (b < n - 1 && wet[b]) b++;
      const deck = Math.max(level[a], level[b], WL + 1.5) + 1.8;
      for (let k = a; k <= b; k++) {
        level[k] = deck;
        bridge[k] = 1;
      }
      i = b;
    }
    let portal: Road['portal'] = null;
    if (def.portal) {
      // the portal sits where the hill is ~6 m above the road; the road rises out of the tunnel
      const px = line.x[0],
        pz = line.z[0];
      const py = raw[0] - 7;
      const dx = line.x[1] - px,
        dz = line.z[1] - pz;
      const dl = Math.hypot(dx, dz) || 1;
      portal = { x: px, z: pz, y: py, dx: dx / dl, dz: dz / dl };
      for (let i = 0; i < n; i++) {
        const t = smooth(10, 110, line.s[i]);
        level[i] = lerp(py, level[i], t);
      }
    }
    return { kind: def.kind, halfW: def.halfW, line, level, bridge, portal };
  });

  const world = (x: number, z: number): number => world0(x, z, true);

  const insideSlab = (x: number, z: number): boolean => x >= SLAB.x0 && x <= SLAB.x1 && z >= SLAB.z0 && z <= SLAB.z1;
  const slabDist = (x: number, z: number): number => {
    const dx = x < SLAB.x0 ? SLAB.x0 - x : x > SLAB.x1 ? x - SLAB.x1 : 0;
    const dz = z < SLAB.z0 ? SLAB.z0 - z : z > SLAB.z1 ? z - SLAB.z1 : 0;
    return Math.hypot(dx, dz);
  };

  const height = (x: number, z: number): number => {
    if (insideSlab(x, z)) return slabHeight(x, z);
    const d = slabDist(x, z);
    const w = world(x, z);
    if (d >= BLEND) return w;
    const px = Math.max(SLAB.x0, Math.min(SLAB.x1, x)),
      pz = Math.max(SLAB.z0, Math.min(SLAB.z1, z));
    const e = slabHeight(px, pz);
    // walled river channel at the west edge: keep the channel open while the walls fade into banks
    const t = smooth(0, BLEND, d);
    return lerp(e, w, t);
  };

  const waterLevel = (_x: number, _z: number): number => WL;
  const isWater = (x: number, z: number): boolean => height(x, z) < WL - 0.02;

  const cover = (x: number, z: number, out: Cover, h0?: number, slope0?: number): Cover => {
    const h = h0 ?? height(x, z);
    let slope = slope0 ?? -1;
    if (slope < 0) {
      const e = 1.5;
      const gx = (height(x + e, z) - height(x - e, z)) / (2 * e),
        gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
      slope = Math.hypot(gx, gz);
    }
    out.water = h < WL - 0.02 ? 1 : 0;
    const sd = coastSD(x, z);
    const cl = cliffness(z, x);
    // beach (~40 m), then dunes with marram grass (half sand) out to ~95 m
    out.sand = out.water ? 0 : (1 - smooth(14, 24, sd) * 0.6 - smooth(30, 46, sd) * 0.4) * (1 - cl) * (1 - smooth(4, 7, h));
    let wet = 0;
    if (riverQ(x, z, rv, 60)) wet = 1 - smooth(rv.halfW, rv.halfW + 9, rv.d);
    // river banks are earth and grass (reeds at the water), not bare rock, however steep
    out.rock = Math.min(1, smooth(0.75, 1.25, slope) * (1 - 0.9 * wet) + cl * (1 - smooth(4, 30, sd)) * smooth(0.35, 0.7, slope));
    out.wet = out.water ? 0 : wet;
    const onRoad = roadQ(x, z, roadHit, 14) ? 1 - smooth(roadsRef[roadHit.i].halfW + 2, roadsRef[roadHit.i].halfW + 7, roadHit.d) : 0;
    out.forest = out.water || siteAt(x, z, 25) >= 0 ? 0 : forestAt(x, z, h) * (1 - out.sand) * (1 - out.rock * 0.8) * (1 - wet) * (1 - onRoad);
    const settled = siteAt(x, z, 0) >= 0;
    const arable = (1 - out.forest) * (1 - out.sand) * (1 - out.rock) * (1 - wet) * (1 - smooth(0.12, 0.3, slope)) * (1 - out.water);
    out.field = settled ? 0 : arable * (1 - smooth(260, 420, h));
    out.meadow = Math.max(0, (1 - out.water) * (1 - out.forest) * (1 - out.sand) - out.field - out.rock * 0.7);
    return out;
  };

  /** forest canopy density (0..1) from the world map (hills, copses, the ridge) */
  const forestAt = (x: number, z: number, h: number): number => {
    const r = Math.hypot(x - CX, z - CZ);
    // northern hills: closed forest with clearings
    const n = footZ(x) - z;
    let f = smooth(-30, 20, n);
    // the hill country is a patchwork: woods on the ridges and steep ground, hill pastures / meadows
    // (with hedgerows) in the valleys and on the gentler slopes; the belt behind the ridge stays wood
    if (n > 140) {
      const open = smooth(0.18, 0.34, fbm(x / 420, z / 420, 3, 51) + 0.25 * (1 - smooth(60, 220, h)) - 0.12 * smooth(150, 300, h));
      f *= 1 - 0.95 * open * smooth(420, 760, n);
    }
    // copses + woods in the farmland (more of them further out)
    const cop = fbm(x / 210, z / 210, 3, 52) + 0.15 * smooth(800, 3000, r);
    f = Math.max(f, smooth(0.36, 0.44, cop) * smooth(260, 420, r));
    // hill tops in the far country are wooded
    f = Math.max(f, smooth(45, 90, h) * 0.85);
    // the island is wooded inland
    // treeline (only the highest land-mesh hills reach it; the mountain layers do their own)
    f *= 1 - smooth(650, 900, h);
    return Math.min(1, f);
  };

  const siteAt = (x: number, z: number, pad: number): number => {
    for (let i = 0; i < sitesRef.length; i++) {
      const s = sitesRef[i];
      const R = s.r + pad;
      const dx = x - s.x,
        dz = z - s.z;
      if (dx * dx + dz * dz < R * R) return i;
    }
    return -1;
  };

  return {
    height,
    world,
    forestAt: (x, z, h) => (siteAt(x, z, 25) >= 0 || (roadQ(x, z, roadHit, 12) && roadHit.d < roadsRef[roadHit.i].halfW + 5) ? 0 : forestAt(x, z, h)),
    road: (x, z, out, maxD) => roadQ(x, z, out, maxD ?? 40),
    roads: roadsRef,
    cliffness: (x, z) => cliffness(z, x),
    grazing: (x, z, sd) => Math.max(z > 120 && z < 1100 ? 1 - smooth(260, 460, sd ?? coastSD(x, z)) : 0, smooth(-560, -760, z) * (x > -1400 ? 1 : 0.4)),
    siteAt,
    waterLevel,
    isWater,
    cover,
    insideSlab,
    slabDist,
    coastSD,
    river: (x, z, out) => riverQ(x, z, out),
    riverLine,
    coastLine,
    sites: sitesRef,
    island: { ...ISLAND },
  };
}

/** height used for things placed by RIVER constants elsewhere (kept for reference) */
export const RIVER_EDGE = { z0: RIVER.z0, z1: RIVER.z1 };

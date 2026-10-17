// Ducks, ducklings and swans paddling on the park pond and the river (ONE InstancedMesh).
//
// Geometry (unit body length, +Z forward): a boat-shaped body sitting on the waterline, a neck
// tube bent in the vertex shader (short duck neck … long swan S-curve, tucked when asleep) and a
// head with a flat bill. Ducks dabble ("bottoms up"), swans dip their necks, a mother duck leads a
// line of ducklings. At night everybody drifts close to the island / bank and sleeps.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import type { Rng } from '../../core/rng';
import { angleDiff, clamp } from './shared';

type WaterSvc = { surfaceY(x: number, z: number): number; level(x: number, z: number): number; depth(x: number, z: number): number } | undefined;
/** the parts of a boat (ctx.services.boats.fleet.boats[i]) we need */
export interface BoatLike {
  x: number;
  z: number;
  yaw: number;
  v?: number;
  vSigned?: number;
  type?: string;
  dims?: { L: number; B: number };
}
export const liveBoats = (ctx: CityContext): BoatLike[] | null => {
  const b = (ctx.services.boats as { fleet?: { boats?: BoatLike[] } } | undefined)?.fleet?.boats;
  return Array.isArray(b) && b.length ? b : null;
};

const PART = { BODY: 0, NECK: 1, HEAD: 2, BILL: 3, EYE: 4 } as const;

function buildFowlGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const part: number[] = [];
  const along: number[] = [];
  const push = (p: number[], pt: number, t: number) => {
    pos.push(p[0], p[1], p[2]);
    part.push(pt);
    along.push(t);
  };
  const tri = (a: number[], b: number[], c: number[], pt: number, ta = 0, tb = 0, tc = 0) => {
    push(a, pt, ta);
    push(b, pt, tb);
    push(c, pt, tc);
  };
  // ── body: rings along z, upper hull above the waterline (y = 0), flat underside at -0.08
  const S = 8;
  const rings: [number, number, number, number][] = [
    // z, half-width, top height, centre-lift
    [-0.5, 0.03, 0.05, 0.16],
    [-0.4, 0.13, 0.11, 0.09],
    [-0.2, 0.22, 0.17, 0.02],
    [0.05, 0.25, 0.19, 0.0],
    [0.28, 0.21, 0.17, 0.01],
    [0.42, 0.12, 0.13, 0.03],
    [0.5, 0.03, 0.08, 0.05],
  ];
  const ringPts = rings.map(([z, hw, top, lift]) => {
    const pts: number[][] = [];
    for (let k = 0; k <= S; k++) {
      // half ellipse from the left waterline over the back to the right waterline + keel point
      const a = (k / S) * Math.PI;
      pts.push([Math.cos(a) * hw, lift + Math.sin(a) * top, z]);
    }
    return pts;
  });
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < S; k++) {
      const a = ringPts[r][k],
        b = ringPts[r][k + 1],
        c = ringPts[r + 1][k + 1],
        d = ringPts[r + 1][k];
      tri(a, b, c, PART.BODY);
      tri(a, c, d, PART.BODY);
    }
    // skirt down to below the waterline (hides the gap at the water)
    for (const k of [0, S]) {
      const a = ringPts[r][k],
        d = ringPts[r + 1][k];
      tri(a, d, [d[0] * 0.9, -0.08, d[2]], PART.BODY);
      tri(a, [d[0] * 0.9, -0.08, d[2]], [a[0] * 0.9, -0.08, a[2]], PART.BODY);
    }
  }
  // tail & breast caps
  const tail = [0, rings[0][3] + 0.03, -0.55];
  for (let k = 0; k < S; k++) tri(ringPts[0][k + 1], ringPts[0][k], tail, PART.BODY);
  const nose = [0, 0.07, 0.53];
  const last = ringPts[rings.length - 1];
  for (let k = 0; k < S; k++) tri(last[k], last[k + 1], nose, PART.BODY);
  // ── neck: tube, 6 sides × 6 segments; x/z = unit ring, t = along (bent in the shader)
  const NS = 6,
    NT = 6;
  for (let j = 0; j < NT; j++) {
    for (let k = 0; k < NS; k++) {
      const a0 = (k / NS) * Math.PI * 2,
        a1 = ((k + 1) / NS) * Math.PI * 2;
      const t0 = j / NT,
        t1 = (j + 1) / NT;
      const p = (a: number) => [Math.cos(a), 0, Math.sin(a)];
      tri(p(a0), p(a1), p(a1), PART.NECK, t0, t1, t0);
      tri(p(a0), p(a0), p(a1), PART.NECK, t0, t1, t1);
    }
  }
  // ── head: faceted ball (radius 1 in head space) + bill + eyes
  const H = 6;
  const hp = (u: number, v: number) => {
    const th = (u / H) * Math.PI * 2,
      ph = (v / 4) * Math.PI;
    return [Math.cos(th) * Math.sin(ph), Math.cos(ph), Math.sin(th) * Math.sin(ph) * 1.25];
  };
  for (let v = 0; v < 4; v++)
    for (let u = 0; u < H; u++) {
      tri(hp(u, v), hp(u + 1, v), hp(u + 1, v + 1), PART.HEAD);
      tri(hp(u, v), hp(u + 1, v + 1), hp(u, v + 1), PART.HEAD);
    }
  // bill (flat wedge pointing +Z)
  const b0 = [0.55, -0.05, 0.85],
    b1 = [-0.55, -0.05, 0.85],
    b2 = [0.4, -0.25, 1.9],
    b3 = [-0.4, -0.25, 1.9],
    b4 = [0, 0.2, 0.9],
    b5 = [0, -0.4, 0.9];
  tri(b4, b1, b0, PART.BILL);
  tri(b4, b0, b2, PART.BILL);
  tri(b4, b3, b1, PART.BILL);
  tri(b4, b2, b3, PART.BILL);
  tri(b5, b0, b1, PART.BILL);
  tri(b5, b2, b0, PART.BILL);
  tri(b5, b1, b3, PART.BILL);
  tri(b5, b3, b2, PART.BILL);
  for (const s of [1, -1]) tri([s * 0.98, 0.25, 0.45], [s * 0.92, 0.45, 0.25], [s * 0.92, 0.1, 0.25], PART.EYE);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  g.computeVertexNormals();
  return g;
}

const FOWL_GLSL = /* glsl */ `
attribute float aPart;
attribute float aAlong;
attribute vec3 iBody;
attribute vec3 iHead;
attribute vec3 iBill;
attribute vec4 iNeck; // x neck height, y head forward, z S-bend, w head pitch (+ down)
attribute vec2 iSize; // x neck radius, y head radius
varying vec3 vFowlCol;
vec3 neckPoint(float t, out vec3 tang) {
  vec3 B = vec3(0.0, 0.1, 0.32);
  vec3 E = B + vec3(0.0, iNeck.x, iNeck.y);
  vec3 C = B + vec3(0.0, iNeck.x * 0.75, iNeck.y * 0.2 - iNeck.z);
  vec3 p = mix(mix(B, C, t), mix(C, E, t), t);
  tang = normalize(2.0 * (1.0 - t) * (C - B) + 2.0 * t * (E - C) + vec3(0.0, 1e-4, 0.0));
  return p;
}
void fowlPose(inout vec3 p, inout vec3 n) {
  if (aPart < 0.5) { vFowlCol = iBody; return; }
  if (aPart < 1.5) {
    vec3 T;
    vec3 c = neckPoint(aAlong, T);
    vec3 P = normalize(vec3(0.0, -T.z, T.y));
    float r = iSize.x * mix(1.15, 0.85, aAlong);
    vec3 off = vec3(p.x, 0.0, 0.0) * r + P * p.z * r;
    n = normalize(vec3(p.x, 0.0, 0.0) + P * p.z);
    p = c + off;
    vFowlCol = mix(iBody, iHead, smoothstep(0.15, 0.6, aAlong));
    return;
  }
  vec3 T;
  vec3 E = neckPoint(1.0, T);
  float a = iNeck.w;
  float ca = cos(a), sa = sin(a);
  vec3 q = p * iSize.y;
  q.yz = vec2(q.y * ca - q.z * sa, q.y * sa + q.z * ca);
  n.yz = vec2(n.y * ca - n.z * sa, n.y * sa + n.z * ca);
  p = E + vec3(0.0, iSize.y * 0.35, iSize.y * 0.15) + q;
  vFowlCol = aPart < 2.5 ? iHead : aPart < 3.5 ? iBill : vec3(0.03);
}
`;

function makeFowlMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FOWL_GLSL}`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal );\nvec3 fowlP = vec3( position );\nfowlPose( fowlP, objectNormal );')
      .replace('#include <begin_vertex>', 'vec3 transformed = fowlP;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFowlCol;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vFowlCol;');
  };
  m.customProgramCacheKey = () => 'tinyhaven-ambient-fowl-1';
  return m;
}

// ─────────────────────────────────────────────────────────────── behaviour ──
interface Fowl {
  idx: number;
  kind: number; // 0 duck, 1 swan, 2 duckling
  x: number;
  z: number;
  yaw: number;
  speed: number;
  tx: number;
  tz: number;
  timer: number;
  scale: number;
  act: number; // 0 paddle, 1 idle, 2 dabble
  actT: number;
  dab: number; // 0..1 bottoms-up blend
  sleep: number; // 0..1
  leader: Fowl | null;
  water: Area;
  seed: number;
  neckH: number;
  neckF: number;
  neckS: number;
  pitchHead: number;
  /** 0..1 how hard it is fleeing from a boat right now */
  flee: number;
}

interface Area {
  inside(x: number, z: number, margin: number): boolean;
  random(rng: Rng, margin: number): { x: number; z: number };
  /** a sleeping spot (near island / bank) */
  nest(rng: Rng): { x: number; z: number };
}

export interface FowlSystem {
  mesh: THREE.InstancedMesh;
  update(dt: number): void;
  timejump(): void;
  locate(i: number): { x: number; y: number; z: number } | null;
  stats(): Record<string, number>;
  invariants(): string[];
}

export function createWaterfowl(ctx: CityContext): FowlSystem {
  const rng = ctx.rng('ambient-fowl');
  const { plan } = ctx;
  const water = () => ctx.services.water as WaterSvc;
  const pond = plan.water.ponds[0];
  const island = plan.features.find((f) => f.kind === 'pondisland');
  const isl = island ? { x: island.x, z: island.z, r: (typeof island.params?.radius === 'number' ? (island.params.radius as number) : island.radius) + 0.9 } : null;

  const areas: Area[] = [];
  if (pond) {
    const inside = (x: number, z: number, m: number) => {
      const u = (x - pond.cx) / Math.max(0.5, pond.rx - m),
        v = (z - pond.cz) / Math.max(0.5, pond.rz - m);
      if (u * u + v * v > 1) return false;
      if (isl && (x - isl.x) ** 2 + (z - isl.z) ** 2 < (isl.r + m * 0.5) ** 2) return false;
      return true;
    };
    areas.push({
      inside,
      random(r, m) {
        for (let k = 0; k < 30; k++) {
          const x = r.range(pond.cx - pond.rx, pond.cx + pond.rx),
            z = r.range(pond.cz - pond.rz, pond.cz + pond.rz);
          if (inside(x, z, m)) return { x, z };
        }
        return { x: pond.cx - pond.rx * 0.5, z: pond.cz };
      },
      nest(r) {
        if (isl) {
          const a = r.range(0, Math.PI * 2);
          return { x: isl.x + Math.cos(a) * (isl.r + 0.7), z: isl.z + Math.sin(a) * (isl.r + 0.7) };
        }
        return { x: pond.cx, z: pond.cz };
      },
    });
  }
  // the river: two stretches near the riverside park
  const rv = plan.water.river;
  const riverStretch = (x0: number, x1: number): Area => {
    const z0 = rv.z0 + 1.6,
      z1 = rv.z1 - 1.6;
    const inside = (x: number, z: number, m: number) => x > x0 + m && x < x1 - m && z > z0 + m * 0.5 && z < z1 - m * 0.5;
    return {
      inside,
      random(r, m) {
        return { x: r.range(x0 + m, x1 - m), z: r.next() < 0.5 ? r.range(z0 + m * 0.5, z0 + 3) : r.range(z1 - 3, z1 - m * 0.5) };
      },
      nest(r) {
        return { x: r.range(x0 + 2, x1 - 2), z: r.next() < 0.5 ? z0 + 0.4 : z1 - 0.4 };
      },
    };
  };
  areas.push(riverStretch(-150, -95), riverStretch(-40, 20));

  const all: Fowl[] = [];
  const COUNT_CAP = 40;
  const mk = (n: number) => new THREE.InstancedBufferAttribute(new Float32Array(COUNT_CAP * n), n);
  const aBody = mk(3),
    aHead = mk(3),
    aBill = mk(3),
    aNeck = mk(4).setUsage(THREE.DynamicDrawUsage),
    aSize = mk(2);
  const geo = buildFowlGeometry();
  geo.setAttribute('iBody', aBody);
  geo.setAttribute('iHead', aHead);
  geo.setAttribute('iBill', aBill);
  geo.setAttribute('iNeck', aNeck);
  geo.setAttribute('iSize', aSize);
  const mesh = new THREE.InstancedMesh(geo, makeFowlMaterial(), COUNT_CAP);
  mesh.name = 'ambient-waterfowl';
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const col = new THREE.Color();
  const setCol = (attr: THREE.InstancedBufferAttribute, i: number, c: string) => {
    col.set(c);
    attr.setXYZ(i, col.r, col.g, col.b);
  };

  const add = (kind: number, area: Area, scale: number, body: string, head: string, bill: string, leader: Fowl | null = null): Fowl => {
    const p = leader ? { x: leader.x - Math.sin(leader.yaw) * 0.6, z: leader.z - Math.cos(leader.yaw) * 0.6 } : area.random(rng, 1.5);
    const f: Fowl = {
      idx: all.length,
      kind,
      x: p.x,
      z: p.z,
      yaw: rng.range(0, 6.28),
      speed: 0,
      tx: p.x,
      tz: p.z,
      timer: rng.range(0, 5),
      scale,
      act: 1,
      actT: rng.range(1, 6),
      dab: 0,
      sleep: 0,
      leader,
      water: area,
      seed: rng.range(0, 100),
      neckH: kind === 1 ? 0.5 : kind === 2 ? 0.16 : 0.18,
      neckF: kind === 1 ? 0.12 : 0.06,
      neckS: kind === 1 ? 0.16 : 0.02,
      pitchHead: 0,
      flee: 0,
    };
    setCol(aBody, f.idx, body);
    setCol(aHead, f.idx, head);
    setCol(aBill, f.idx, bill);
    aSize.setXY(f.idx, kind === 1 ? 0.045 : kind === 2 ? 0.075 : 0.06, kind === 1 ? 0.075 : kind === 2 ? 0.13 : 0.1);
    all.push(f);
    return f;
  };

  const pondArea = pond ? areas[0] : null;
  if (pondArea) {
    // a mallard family, a few loose ducks, a pair of swans
    const mother = add(0, pondArea, 0.62, '#8a6a4a', '#7a5a3c', '#d98a2a');
    let prev = mother;
    for (let i = 0; i < 4; i++) prev = add(2, pondArea, 0.27, '#c9a95a', '#b89448', '#4a3a2a', prev);
    for (let i = 0; i < 3; i++) add(0, pondArea, 0.64, '#8d8f86', '#2f6b3a', '#e2c43a'); // drakes
    add(0, pondArea, 0.6, '#8a6a4a', '#7a5a3c', '#d98a2a');
    const swan = add(1, pondArea, 1.35, '#f7f6f1', '#f7f6f1', '#e0702a');
    add(1, pondArea, 1.3, '#f4f3ee', '#f4f3ee', '#e0702a', swan);
  }
  for (let a = pond ? 1 : 0; a < areas.length; a++) {
    const lead = add(0, areas[a], 0.62, '#8d8f86', '#2f6b3a', '#e2c43a');
    add(0, areas[a], 0.6, '#8a6a4a', '#7a5a3c', '#d98a2a', lead);
    add(0, areas[a], 0.6, '#8a6a4a', '#7a5a3c', '#d98a2a');
  }
  aBody.needsUpdate = aHead.needsUpdate = aBill.needsUpdate = aSize.needsUpdate = true;
  mesh.count = all.length;

  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(0, 0, 0, 'YXZ'),
    v = new THREE.Vector3(),
    s = new THREE.Vector3();

  const surface = (x: number, z: number) => {
    const w = water();
    return w ? w.surfaceY(x, z) : plan.isWater(x, z) && pond && Math.hypot((x - pond.cx) / pond.rx, (z - pond.cz) / pond.rz) < 1.2 ? pond.level : plan.water.level;
  };

  const night = () => ctx.clock.night;

  // ── boats (ctx.services.boats, optional)
  let boats: BoatLike[] | null = null;
  const TH = { ex: 0, ez: 0, u: 0, inside: false, px: 0, pz: 0 };
  /** escape direction (ex, ez) + urgency u (0..1) from every boat whose path we are in */
  const boatThreat = (f: Fowl) => {
    TH.ex = TH.ez = TH.u = TH.px = TH.pz = 0;
    TH.inside = false;
    if (!boats) return TH;
    const body = f.kind === 1 ? 0.8 : f.kind === 2 ? 0.2 : 0.35;
    for (const bt of boats) {
      const L = bt.dims?.L ?? 6,
        B = bt.dims?.B ?? 2;
      const v = Math.abs(bt.vSigned ?? bt.v ?? 0);
      const dx = f.x - bt.x,
        dz = f.z - bt.z;
      const reach = L * 0.5 + 8 + v * 5;
      if (dx * dx + dz * dz > reach * reach) continue;
      const fx = Math.sin(bt.yaw),
        fz = Math.cos(bt.yaw);
      const dir = (bt.vSigned ?? bt.v ?? 0) < 0 ? -1 : 1;
      const a = (dx * fx + dz * fz) * dir; // ahead along the direction of travel
      const l = dx * fz - dz * fx; // lateral offset along (fz, -fx)
      const halfW = B * 0.5 + (bt.type === 'row' ? 2.7 : 0) + body;
      const front = L * 0.5 + 2.5 + v * 4.5,
        back = L * 0.5 + 1.5;
      const wide = halfW + 2.2;
      if (a < -back || a > front || Math.abs(l) > wide) continue;
      const side = Math.abs(l) > 0.05 ? Math.sign(l) : f.seed % 2 < 1 ? 1 : -1;
      // closer to the keel line and to the bow = more urgent
      const lat = 1 - Math.max(0, Math.abs(l) - halfW) / (wide - halfW);
      const fore = a > L * 0.5 ? 1 - (a - L * 0.5) / (front - L * 0.5) : 1;
      const u = Math.min(1, lat * (0.35 + 0.65 * fore) * (v > 0.2 || a < L * 0.5 ? 1 : 0.4));
      TH.ex += side * fz * u;
      TH.ez += -side * fx * u;
      if (u > TH.u) TH.u = u;
      if (Math.abs(l) < B * 0.5 + body && a > -L * 0.5 - 0.2 && a < L * 0.5 + 0.2) {
        TH.inside = true;
        const push = B * 0.5 + body + 0.15 - Math.abs(l);
        TH.px += side * fz * push;
        TH.pz += -side * fx * push;
      }
    }
    return TH;
  };

  const step = (f: Fowl, dt: number) => {
    const sleepy = night() > 0.75;
    f.sleep += ((sleepy ? 1 : 0) - f.sleep) * Math.min(1, dt * 0.4);
    f.timer -= dt;
    let want = 0;
    if (f.leader) {
      // follow the one in front (ducklings in a line, swan partner)
      const L = f.leader;
      const gap = f.kind === 2 ? 0.55 * (L.kind === 2 ? 1 : 1.3) : 1.6;
      f.tx = L.x - Math.sin(L.yaw) * gap;
      f.tz = L.z - Math.cos(L.yaw) * gap;
      const d = Math.hypot(f.tx - f.x, f.tz - f.z);
      want = clamp(d * 1.2, 0, f.kind === 2 ? 0.75 : 0.5);
      if (L.act === 2 && f.kind !== 2) f.act = 2;
    } else {
      if (f.timer <= 0) {
        const p = sleepy ? f.water.nest(rng) : f.water.random(rng, f.kind === 1 ? 2.5 : 1.5);
        f.tx = p.x;
        f.tz = p.z;
        f.timer = rng.range(8, 20);
      }
      f.actT -= dt;
      if (f.actT <= 0) {
        const r = rng.next();
        f.act = sleepy ? 1 : r < 0.6 ? 0 : r < 0.82 ? 1 : 2;
        f.actT = f.act === 2 ? rng.range(2, 4) : rng.range(3, 9);
      }
      const d = Math.hypot(f.tx - f.x, f.tz - f.z);
      const cruise = f.kind === 1 ? 0.32 : 0.42;
      want = f.act === 0 && d > 0.3 ? Math.min(cruise, d * 0.4) : sleepy && d > 0.3 ? 0.12 : 0;
    }
    // ── give way to boats: paddle out of the path of an approaching hull
    const th = boatThreat(f);
    f.flee += (th.u - f.flee) * Math.min(1, dt * 5);
    const margin = f.kind === 1 ? 1.4 : 0.8;
    if (th.u > 0.01) {
      want = Math.max(want, 0.45 + 0.85 * th.u + (f.kind === 2 ? 0.15 : 0));
      f.speed += (want - f.speed) * Math.min(1, dt * 4);
      f.act = 0;
      // pick the escape heading that keeps us on the water (straight away, or angled ±70°)
      const base = Math.atan2(th.ex, th.ez);
      let best = base;
      for (const off of [0, 1.2, -1.2, 2.0, -2.0]) {
        const h = base + off;
        if (f.water.inside(f.x + Math.sin(h) * 1.2, f.z + Math.cos(h) * 1.2, margin)) {
          best = h;
          break;
        }
      }
      f.yaw += clamp(angleDiff(f.yaw, best), -dt * 4.5, dt * 4.5);
      f.timer = Math.min(f.timer, 1.5); // re-plan once the boat has passed
    } else {
      f.speed += (want - f.speed) * Math.min(1, dt * 1.5);
      const dx = f.tx - f.x,
        dz = f.tz - f.z;
      if (dx * dx + dz * dz > 0.01) f.yaw += clamp(angleDiff(f.yaw, Math.atan2(dx, dz)), -dt * 1.4, dt * 1.4);
      else f.yaw += Math.sin(ctx.clock.simTime * 0.2 + f.seed) * dt * 0.15;
    }
    const nx = f.x + Math.sin(f.yaw) * f.speed * dt,
      nz = f.z + Math.cos(f.yaw) * f.speed * dt;
    if (f.water.inside(nx, nz, margin)) {
      f.x = nx;
      f.z = nz;
    } else {
      f.timer = 0; // pick a new target
      f.yaw += dt * 1.5;
    }
    // never sit inside a hull (boats can be fast, or appear after a time jump)
    if (th.inside) {
      const px = f.x + th.px,
        pz = f.z + th.pz;
      if (f.water.inside(px, pz, 0.3)) {
        f.x = px;
        f.z = pz;
      }
    }
    // dabbling (ducks tip up), swans dip their necks
    const dabT = f.act === 2 && f.sleep < 0.5 ? 1 : 0;
    f.dab += (dabT - f.dab) * Math.min(1, dt * 3);
  };

  const write = (f: Fowl) => {
    const sy = surface(f.x, f.z);
    const t = ctx.clock.simTime + f.seed;
    const bob = Math.sin(t * 1.7) * 0.012;
    let pitch = Math.sin(t * 1.3) * 0.03,
      y = sy + bob - 0.02 * f.scale;
    let neckH = f.neckH,
      neckF = f.neckF,
      neckS = f.neckS,
      head = Math.sin(t * 0.9) * 0.08;
    if (f.kind === 1) {
      // swans: occasionally dip the neck to feed
      neckH = f.neckH * (1 - f.dab * 0.75);
      neckF = f.neckF + f.dab * 0.42;
      neckS = f.neckS * (1 - f.dab);
      head += f.dab * 1.3;
    } else {
      pitch -= f.dab * 1.25;
      y -= f.dab * 0.12 * f.scale;
      neckF += f.dab * 0.1;
    }
    // fleeing from a boat: neck stretched forward, leaning into the paddle
    const fl = f.flee;
    if (fl > 0.01) {
      neckF += fl * 0.14;
      neckH *= 1 - fl * 0.25;
      pitch -= fl * 0.1;
      head -= fl * 0.25;
    }
    // asleep: neck tucked, head resting on the back
    const sl = f.sleep * (1 - fl);
    neckH = neckH * (1 - sl * 0.7);
    neckF = neckF * (1 - sl) - sl * 0.15;
    neckS = neckS * (1 - sl);
    head = head * (1 - sl) - sl * 0.6;
    aNeck.setXYZW(f.idx, neckH, neckF, neckS, head);
    e.set(-pitch, f.yaw, Math.sin(t * 1.1) * 0.03, 'YXZ');
    q.setFromEuler(e);
    v.set(f.x, y, f.z);
    s.setScalar(f.scale);
    m4.compose(v, q, s);
    mesh.setMatrixAt(f.idx, m4);
  };

  const timejump = () => {
    const sleepy = night() > 0.75;
    for (const f of all) {
      f.sleep = sleepy ? 1 : 0;
      f.timer = 0;
      if (sleepy && !f.leader) {
        const p = f.water.nest(rng);
        if (f.water.inside(p.x, p.z, 0.3)) {
          f.x = p.x;
          f.z = p.z;
        }
      }
    }
    for (const f of all) {
      if (f.leader) {
        f.x = f.leader.x - Math.sin(f.leader.yaw) * 0.7;
        f.z = f.leader.z - Math.cos(f.leader.yaw) * 0.7;
        f.yaw = f.leader.yaw;
        if (!f.water.inside(f.x, f.z, 0.3)) {
          f.x = f.leader.x;
          f.z = f.leader.z;
        }
      }
      write(f);
    }
    mesh.instanceMatrix.needsUpdate = true;
    aNeck.needsUpdate = true;
  };
  timejump();

  return {
    mesh,
    timejump,
    update(dt) {
      if (dt <= 0) return;
      boats = liveBoats(ctx);
      const steps = Math.min(6, Math.ceil(dt / 0.1));
      const h = dt / steps;
      for (let k = 0; k < steps; k++) for (const f of all) step(f, h);
      for (const f of all) write(f);
      mesh.instanceMatrix.needsUpdate = true;
      aNeck.needsUpdate = true;
    },
    locate(i) {
      const f = all[Math.max(0, Math.min(all.length - 1, i))];
      return f ? { x: f.x, y: surface(f.x, f.z), z: f.z } : null;
    },
    stats() {
      return { waterfowl: all.length, waterfowlAsleep: all.filter((f) => f.sleep > 0.5).length, waterfowlFleeing: all.filter((f) => f.flee > 0.2).length };
    },
    invariants() {
      const out: string[] = [];
      for (const f of all) {
        if (!Number.isFinite(f.x + f.z + f.yaw)) out.push(`waterfowl ${f.idx}: non-finite state`);
        else if (!f.water.inside(f.x, f.z, -0.6)) out.push(`waterfowl ${f.idx} left the water at (${f.x.toFixed(1)}, ${f.z.toFixed(1)})`);
      }
      if (boats) {
        for (const f of all) {
          for (const bt of boats) {
            const L = bt.dims?.L ?? 6,
              B = bt.dims?.B ?? 2;
            const dx = f.x - bt.x,
              dz = f.z - bt.z;
            const a = dx * Math.sin(bt.yaw) + dz * Math.cos(bt.yaw),
              l = dx * Math.cos(bt.yaw) - dz * Math.sin(bt.yaw);
            if (Math.abs(a) < L * 0.5 - 0.3 && Math.abs(l) < B * 0.5 - 0.1) out.push(`waterfowl ${f.idx} inside a boat hull at (${f.x.toFixed(1)}, ${f.z.toFixed(1)})`);
          }
        }
      }
      return out;
    },
  };
}

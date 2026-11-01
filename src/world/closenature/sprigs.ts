// Real leaves on what you can reach. Crowns and shrubs are leaf cards, which is right from a few metres and flat from one: within
// the bubble every card tip of the low foliage gets a few sprigs, each a twig with folded leaves, in the plant's own green, so the
// outline and the eye's first look are single leaves and the cards behind are the mass. Woodland shrubs and bracken outside the
// town are planted here the same way, and their far strips sink as these come in (landscape/rows.ts).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { nearOf, nearRandom, type NearCell, type NearEmit } from '../../core/nearDetail';
import { closeNature } from '../../core/closenature';
import { frondShape, plantMaterial } from './flora';

/** x, y, z, dir x, y, z, size, r, g, b, kind (0 broad, 1 needle) */
export const TIP_STRIDE = 11;

export interface CloseTips {
  data: Float32Array;
  n: number;
}

const RADIUS = 11;
const CELL = 4;

/** a twig along +Z, length 1 in units of ~20 cm, with leaves in alternate pairs; each leaf folded on its rib */
function sprigGeometry(): THREE.BufferGeometry {
  const P: number[] = [],
    N: number[] = [],
    C: number[] = [],
    A: number[] = [],
    L: number[] = [],
    I: number[] = [];
  const v = (x: number, y: number, z: number, nx: number, ny: number, nz: number, shade: number, u: number, w: number, petal = 1): number => {
    const l = Math.hypot(nx, ny, nz) || 1;
    P.push(x, y, z);
    N.push(nx / l, ny / l, nz / l);
    C.push(0.09 * shade, 0.065 * shade, 0.04 * shade);
    A.push(petal, shade);
    L.push(u, w);
    return P.length / 3 - 1;
  };
  // the twig: three sides
  const t0 = P.length / 3;
  for (let k = 0; k <= 1; k++) {
    const z = k * 1.0,
      y = 0.06 * k,
      r = k ? 0.003 : 0.008;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * 6.283;
      v(Math.cos(a) * r, y + Math.sin(a) * r, z, Math.cos(a), Math.sin(a), 0, 1, 0, 0, 0);
    }
  }
  for (let i = 0; i < 3; i++) {
    const a = t0 + i,
      b = t0 + (i + 1) % 3;
    I.push(a, b, a + 3, b, b + 3, a + 3);
  }
  // nine leaves, the last at the tip
  const LEAVES = 9;
  for (let k = 0; k < LEAVES; k++) {
    const f = 0.1 + (k / (LEAVES - 1)) * 0.9;
    const tip = k === LEAVES - 1;
    const sd = k % 2 ? 1 : -1;
    const az = tip ? 0 : sd * (0.95 - 0.35 * f);
    const len = 0.34 * (tip ? 0.95 : 1.05 - 0.3 * Math.abs(f - 0.45)),
      w = len * 0.26;
    const ca = Math.cos(az),
      sa = Math.sin(az);
    const bx = 0,
      by = 0.06 * f,
      bz = f;
    // along the leaf, across it (in plan), droop towards the tip
    const lift = 0.16 + 0.1 * Math.sin(k * 2.7);
    const at = (t: number, s: number, up: number): [number, number, number] => [bx + sa * t * len + ca * s, by + up + lift * t * len - 0.3 * t * t * len, bz + ca * t * len - sa * s];
    const [b0x, b0y, b0z] = at(0.03, 0, 0);
    const [lx, ly, lz] = at(0.42, -w, 0.02 * len);
    const [rx, ry, rz] = at(0.42, w, 0.02 * len);
    const [mx, my, mz] = at(0.46, 0, -0.03 * len);
    const [l2x, l2y, l2z] = at(0.74, -w * 0.62, 0.0);
    const [r2x, r2y, r2z] = at(0.74, w * 0.62, 0.0);
    const [tx, ty, tz] = at(1, 0, -0.03 * len);
    const shade = 0.86 + 0.26 * Math.abs(Math.sin(k * 5.3));
    const a0 = v(b0x, b0y, b0z, 0, 1, 0, shade * 0.86, 0, 0);
    const a1 = v(lx, ly, lz, -ca * 0.35, 1, sa * 0.35, shade, -1, 0.42);
    const a2 = v(rx, ry, rz, ca * 0.35, 1, -sa * 0.35, shade, 1, 0.42);
    const a3 = v(mx, my, mz, 0, 1, 0, shade * 0.9, 0, 0.46);
    const a4 = v(l2x, l2y, l2z, -ca * 0.3, 1, sa * 0.3, shade, -0.8, 0.74);
    const a5 = v(r2x, r2y, r2z, ca * 0.3, 1, -sa * 0.3, shade, 0.8, 0.74);
    const a6 = v(tx, ty, tz, 0, 1, 0, shade * 1.04, 0, 1);
    I.push(a0, a1, a3, a0, a3, a2, a1, a4, a3, a3, a5, a2, a4, a6, a3, a3, a6, a5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aC', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aA', new THREE.Float32BufferAttribute(A, 2));
  g.setAttribute('aL', new THREE.Float32BufferAttribute(L, 2));
  g.setIndex(I);
  return g;
}

/** a twig along +Z with needles all round it: each one thin triangle */
function needleGeometry(): THREE.BufferGeometry {
  const P: number[] = [],
    N: number[] = [],
    C: number[] = [],
    A: number[] = [],
    L: number[] = [],
    I: number[] = [];
  const v = (x: number, y: number, z: number, nx: number, ny: number, nz: number, shade: number, petal = 1): number => {
    P.push(x, y, z);
    N.push(nx, ny, nz);
    C.push(0.06 * shade, 0.045 * shade, 0.03 * shade);
    A.push(petal, shade);
    L.push(0, 0.5);
    return P.length / 3 - 1;
  };
  const a = v(-0.006, 0, 0, 0, 1, 0, 1, 0),
    b = v(0.006, 0, 0, 0, 1, 0, 1, 0),
    c = v(0, 0.04, 1, 0, 1, 0, 1, 0);
  I.push(a, c, b);
  const COUNT = 26;
  for (let k = 0; k < COUNT; k++) {
    const f = (k + 0.5) / COUNT;
    const th = k * 2.399963;
    const ct = Math.cos(th),
      st = Math.sin(th);
    const len = 0.16 * (1 - 0.3 * f);
    const z0 = f,
      y0 = 0.04 * f;
    const tx = ct * len * 0.75,
      ty = st * len * 0.6 + 0.02,
      tz = len * 0.7;
    const w = 0.0055;
    const shade = 0.82 + 0.34 * Math.abs(Math.sin(k * 3.7));
    const n0 = v(-st * w, y0 + ct * w, z0, ct * 0.4, 1, 0, shade * 0.72),
      n1 = v(st * w, y0 - ct * w, z0, ct * 0.4, 1, 0, shade * 0.72),
      n2 = v(tx, y0 + ty, z0 + tz, ct * 0.4, 1, 0.2, shade * 1.1);
    I.push(n0, n1, n2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aC', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aA', new THREE.Float32BufferAttribute(A, 2));
  g.setAttribute('aL', new THREE.Float32BufferAttribute(L, 2));
  g.setIndex(I);
  return g;
}

/** a thin stem, unit height, leaning nowhere: three sides, two lengths */
function stemGeometry(): THREE.BufferGeometry {
  const P: number[] = [],
    N: number[] = [],
    C: number[] = [],
    A: number[] = [],
    L: number[] = [],
    I: number[] = [];
  for (let k = 0; k <= 2; k++) {
    const f = k / 2;
    const r = 0.012 * (1 - 0.65 * f);
    const bow = 0.06 * f * f;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * 6.283;
      P.push(Math.cos(a) * r + bow, f, Math.sin(a) * r);
      N.push(Math.cos(a), 0.1, Math.sin(a));
      C.push(1, 1, 1);
      A.push(1, 0.8 + 0.3 * f);
      L.push(0, 0.5);
    }
  }
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 3; i++) {
      const a = k * 3 + i,
        b = k * 3 + (i + 1) % 3;
      I.push(a, a + 3, b, b, a + 3, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aC', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aA', new THREE.Float32BufferAttribute(A, 2));
  g.setAttribute('aL', new THREE.Float32BufferAttribute(L, 2));
  g.setIndex(I);
  return g;
}

/** one reed: a stem, long lance leaves that bow, a dark brown plume; unit height */
function reedGeometry(): THREE.BufferGeometry {
  const P: number[] = [],
    N: number[] = [],
    C: number[] = [],
    A: number[] = [],
    L: number[] = [],
    I: number[] = [];
  const v = (x: number, y: number, z: number, nx: number, ny: number, nz: number, shade: number, petal = 1, u = 0, w = 0.5): number => {
    P.push(x, y, z);
    N.push(nx, ny, nz);
    C.push(0.085 * shade, 0.05 * shade, 0.035 * shade);
    A.push(petal, shade);
    L.push(u, w);
    return P.length / 3 - 1;
  };
  // stem
  for (let k = 0; k <= 3; k++) {
    const f = k / 3;
    const r = 0.0075 * (1 - 0.6 * f);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * 6.283;
      v(Math.cos(a) * r + 0.03 * f * f, f * 0.95, Math.sin(a) * r, Math.cos(a), 0.15, Math.sin(a), 0.72 + 0.34 * f);
    }
  }
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 3; i++) {
      const a = k * 3 + i,
        b = k * 3 + (i + 1) % 3;
      I.push(a, a + 3, b, b, a + 3, b + 3);
    }
  }
  // leaves: out of the stem, up, over
  for (let j = 0; j < 5; j++) {
    const az = j * 2.4 + 0.7;
    const ca = Math.cos(az),
      sa = Math.sin(az);
    const y0 = 0.08 + j * 0.13;
    const len = 0.52 - j * 0.04,
      w = 0.011;
    const SEG = 4;
    const base = P.length / 3;
    for (let k = 0; k <= SEG; k++) {
      const f = k / SEG;
      const out = len * f * 0.62 * (0.35 + 0.65 * f);
      const up = len * (f * 0.85 - f * f * 0.45);
      const hw = w * Math.sin(Math.min(1, f + 0.12) * 3.14) ** 0.6 * (k === SEG ? 0 : 1);
      v(ca * out - sa * hw, y0 + up, sa * out + ca * hw, ca * 0.5, 1, sa * 0.5, 0.82 + 0.3 * f, 1, -1, f);
      v(ca * out + sa * hw, y0 + up, sa * out - ca * hw, ca * 0.5, 1, sa * 0.5, 0.82 + 0.3 * f, 1, 1, f);
    }
    for (let k = 0; k < SEG; k++) {
      const a = base + k * 2;
      I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  // the plume: a slim spindle of three crossed blades, its own brown
  const top = 0.95,
    cx = 0.03;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 3.14;
    const dx = Math.cos(a) * 0.011,
      dz = Math.sin(a) * 0.011;
    const b0 = v(cx, top - 0.13, 0, 0, 1, 0, 1, 0);
    const b1 = v(cx - dx, top - 0.06, -dz, 0, 1, 0, 1.15, 0);
    const b2 = v(cx + dx, top - 0.06, dz, 0, 1, 0, 1.15, 0);
    const b3 = v(cx + 0.008, top + 0.03, 0, 0, 1, 0, 1.3, 0);
    I.push(b0, b2, b1, b1, b2, b3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aC', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aA', new THREE.Float32BufferAttribute(A, 2));
  g.setAttribute('aL', new THREE.Float32BufferAttribute(L, 2));
  g.setIndex(I);
  return g;
}

/** a live leaf: a pale rib, a darker heart, a little of the sky in the upper side */
const LIVE_FRAG = /* glsl */ `
{
  float u = abs(vLf.x), v = vLf.y;
  float rib = 1.0 - smoothstep(0.0, 0.06, u);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.2, 1.32, 0.95) + vec3(0.006, 0.012, 0.0), rib * 0.8);
  float vein = 1.0 - smoothstep(0.0, 0.16, abs(fract(v * 6.0 - u * 2.2 + vFs) - 0.5));
  diffuseColor.rgb *= 1.0 - 0.12 * vein * (1.0 - rib);
  diffuseColor.rgb *= 0.84 + 0.3 * smoothstep(0.1, 0.9, u);
}
`;

/** what a plant the far strips only hint at is: 0 shrub (a stool of stems opening into leaves), 1 bracken, 2 a stand of reeds from (x, z) to (ex, ez) */
export interface UnderPlant {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  k: number;
  kind: number;
  ex?: number;
  ez?: number;
}

export function addSprigs(ctx: CityContext, tips: CloseTips | null, under: UnderPlant[] | null): void {
  if (!closeNature(ctx, 'closesprigs', 'medium')) return;
  const near = nearOf(ctx);
  const key = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
  const byCell = new Map<number, number[]>();
  if (tips) {
    for (let t = 0; t < tips.n; t++) {
      const q = t * TIP_STRIDE;
      const k = key(Math.floor(tips.data[q] / CELL), Math.floor(tips.data[q + 2] / CELL));
      let a = byCell.get(k);
      if (!a) byCell.set(k, (a = []));
      a.push(t);
    }
  }
  const leafMat = plantMaterial(ctx, 'sprig', RADIUS, LIVE_FRAG);
  leafMat.roughness = 0.82;
  const layer = (name: string, geometry: THREE.BufferGeometry, wantKind: number, capacity: number, perTip: number, reach: number) => {
    near.addScatter({
      name,
      radius: RADIUS,
      cell: CELL,
      top: 5,
      geometry,
      material: leafMat,
      capacity,
      perCell: Math.round(capacity / 6),
      colors: true,
      fill(c: NearCell, out: NearEmit) {
        const a = tips ? byCell.get(key(c.i, c.j)) : undefined;
        if (!a || !tips) return;
        const rnd = nearRandom(c.seed);
        const D = tips.data;
        for (const t of a) {
          const q = t * TIP_STRIDE;
          if (D[q + 10] !== wantKind) continue;
          const s = D[q + 6];
          for (let k = 0; k < perTip; k++) {
            // on and just out of the card, pointing out with it
            const jx = (rnd() - 0.5) * 1.5 * s,
              jy = (rnd() - 0.5) * 1.1 * s,
              jz = (rnd() - 0.5) * 1.5 * s;
            const dx = D[q + 3] + (rnd() - 0.5) * 0.9,
              dy = D[q + 4] + (rnd() - 0.5) * 0.6,
              dz = D[q + 5] + (rnd() - 0.5) * 0.9;
            const l = Math.hypot(dx, dy, dz) || 1;
            const scale = reach * (0.8 + 0.5 * rnd()) * Math.min(1.3, Math.max(0.7, s / 0.35));
            const v = 0.78 + 0.4 * rnd();
            out.put(D[q] + jx, D[q + 1] + jy, D[q + 2] + jz, Math.atan2(dx, dz), scale, scale, scale, -Math.asin(Math.max(-1, Math.min(1, dy / l))), (rnd() - 0.5) * 0.9, D[q + 7] * v, D[q + 8] * v, D[q + 9] * v);
          }
        }
      },
    });
  };
  layer('closesprig', sprigGeometry(), 0, 2600, 3, 0.2);
  layer('closeneedle', needleGeometry(), 1, 1500, 3, 0.24);

  // ── woodland: stools and bracken planted where the far strips have them
  if (!under?.length) return;
  const underCell = new Map<number, UnderPlant[]>();
  for (const p of under) {
    const k = key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    let a = underCell.get(k);
    if (!a) underCell.set(k, (a = []));
    a.push(p);
  }
  const LEAF: readonly [number, number, number] = [0.1, 0.2, 0.04];
  near.addScatter({
    name: 'closeshrubleaf',
    radius: RADIUS,
    cell: CELL,
    top: 4,
    geometry: sprigGeometry(),
    material: leafMat,
    capacity: 3000,
    perCell: 500,
    colors: true,
    fill(c: NearCell, out: NearEmit) {
      const a = underCell.get(key(c.i, c.j));
      if (!a) return;
      const rnd = nearRandom(c.seed);
      for (const p of a) {
        if (p.kind !== 0) continue;
        // leaves over a vase: more at the top, none at the foot
        const n = Math.round(130 * p.w);
        for (let k = 0; k < n; k++) {
          const th = rnd() * 6.283;
          const f = 0.32 + 0.68 * Math.sqrt(rnd());
          const rr = p.w * (0.25 + 0.75 * Math.sin(f * 2.2)) * (0.7 + 0.3 * rnd());
          const x = p.x + Math.cos(th) * rr,
            z = p.z + Math.sin(th) * rr,
            y = p.y + p.h * f;
          const s = 0.26 * (0.8 + 0.6 * rnd());
          const v = (0.72 + 0.42 * rnd()) * p.k;
          out.put(x, y, z, Math.atan2(Math.cos(th), Math.sin(th)) + (rnd() - 0.5) * 1.4, s, s, s, -0.1 - rnd() * 0.6 + 0.7 * (f - 0.6), (rnd() - 0.5) * 0.9, LEAF[0] * v, LEAF[1] * v, LEAF[2] * v);
        }
      }
    },
  });
  near.addScatter({
    name: 'closeshrubstem',
    radius: RADIUS,
    cell: CELL,
    top: 4,
    geometry: stemGeometry(),
    material: leafMat,
    capacity: 500,
    perCell: 80,
    colors: true,
    fill(c: NearCell, out: NearEmit) {
      const a = underCell.get(key(c.i, c.j));
      if (!a) return;
      const rnd = nearRandom(c.seed);
      for (const p of a) {
        if (p.kind !== 0) continue;
        const n = 7 + Math.floor(rnd() * 5);
        for (let k = 0; k < n; k++) {
          const th = rnd() * 6.283;
          const v = 0.8 + 0.5 * rnd();
          const h = p.h * (0.55 + 0.35 * rnd());
          const t = 0.2 + 0.32 * rnd();
          const w = 0.7 + 0.5 * rnd();
          out.put(p.x + Math.cos(th) * 0.08, p.y - 0.03, p.z + Math.sin(th) * 0.08, 0, w, h, w, Math.sin(th) * t, -Math.cos(th) * t, 0.13 * v, 0.1 * v, 0.075 * v);
        }
      }
    },
  });
  // reeds, by the strip they replace: a strip may cross cells, so each stem is judged by its own place
  const reeds = under.filter((p) => p.kind === 2);
  if (reeds.length) {
    const reedCell = new Map<number, UnderPlant[]>();
    const REED_CELL = 8;
    for (const p of reeds) {
      const seen = new Set<number>();
      const L = Math.hypot((p.ex ?? p.x) - p.x, (p.ez ?? p.z) - p.z);
      const N = Math.ceil(L / 2);
      for (let q = 0; q <= N; q++) {
        const f = q / N;
        const k = key(Math.floor((p.x + ((p.ex ?? p.x) - p.x) * f) / REED_CELL), Math.floor((p.z + ((p.ez ?? p.z) - p.z) * f) / REED_CELL));
        if (seen.has(k)) continue;
        seen.add(k);
        let a = reedCell.get(k);
        if (!a) reedCell.set(k, (a = []));
        a.push(p);
      }
    }
    near.addScatter({
      name: 'closereed',
      radius: RADIUS,
      cell: REED_CELL,
      top: 3,
      geometry: reedGeometry(),
      material: leafMat,
      capacity: 2200,
      perCell: 700,
      colors: true,
      fill(c: NearCell, out: NearEmit) {
        const a = reedCell.get(key(c.i, c.j));
        if (!a) return;
        const rnd = nearRandom(c.seed);
        for (const p of a) {
          const ex = p.ex ?? p.x,
            ez = p.ez ?? p.z;
          const L = Math.hypot(ex - p.x, ez - p.z);
          const n = Math.round(L * 26);
          for (let k = 0; k < n; k++) {
            const f = rnd(),
              sx = (rnd() - 0.5) * 0.9,
              sz = (rnd() - 0.5) * 0.9,
              yaw = rnd() * 6.283,
              hk = rnd(),
              ta = rnd(),
              tb = rnd(),
              tone = rnd(),
              clump = Math.sin(f * L * 2.1 + p.x) * 0.5 + 0.5;
            const x = p.x + (ex - p.x) * f + sx,
              z = p.z + (ez - p.z) * f + sz;
            if (x < c.x0 || x >= c.x0 + REED_CELL || z < c.z0 || z >= c.z0 + REED_CELL) continue;
            if (hk > 0.35 + 0.65 * clump) continue;
            const h = p.h * (0.75 + 0.5 * hk);
            const v = (0.72 + 0.5 * tone) * p.k;
            out.put(x, p.y - 0.05, z, yaw, h, h, h, (ta - 0.5) * 0.14, (tb - 0.5) * 0.14, 0.14 * v, 0.2 * v, 0.06 * v);
          }
        }
      },
    });
  }
  near.addScatter({
    name: 'closebracken',
    radius: RADIUS,
    cell: CELL,
    top: 3,
    geometry: frondShape(),
    material: leafMat,
    capacity: 1800,
    perCell: 300,
    colors: true,
    fill(c: NearCell, out: NearEmit) {
      const a = underCell.get(key(c.i, c.j));
      if (!a) return;
      const rnd = nearRandom(c.seed);
      for (const p of a) {
        if (p.kind !== 1) continue;
        const n = Math.round(30 * p.w);
        for (let k = 0; k < n; k++) {
          const th = rnd() * 6.283;
          const rr = p.w * 0.55 * Math.sqrt(rnd());
          const s = (0.55 + 0.45 * rnd()) * p.h * 1.3;
          const v = (0.7 + 0.5 * rnd()) * p.k;
          // out of the middle, over and down
          const yaw = Math.atan2(Math.cos(th), Math.sin(th)) + (rnd() - 0.5) * 0.7;
          out.put(p.x + Math.cos(th) * rr, p.y - 0.01, p.z + Math.sin(th) * rr, yaw, s, s, s, 0, (rnd() - 0.5) * 0.25, 0.1 * v, 0.2 * v, 0.042 * v);
        }
      }
    },
  });
}

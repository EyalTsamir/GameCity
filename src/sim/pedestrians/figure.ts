// Shared pedestrian definitions: the Look feature flags (F, also read by the crowd sim), the dog's
// offset from its walker, and the small companion meshes — prams, dogs and blob contact shadows.
// The people themselves are built in body.ts (mesh), rig.ts (anatomy) and shader.ts (posing).

import * as THREE from 'three';
import { globalUniforms } from '../../core/uniforms';

// ───────────────────────────────────────────────────────────── codes ──

/** Look feature flags (bit mask; the crowd sim reads F.ROD; the new figures derive render bits from these + look.style). */
export const F = {
  HAIR: 1,
  LONGHAIR: 2,
  BUN: 4,
  HAT: 8,
  CAP: 16,
  HARDHAT: 32,
  BACKPACK: 64,
  HANDBAG: 128,
  SHOPBAG: 256,
  BRIEFCASE: 512,
  SKIRT: 1024,
  SHORTS: 2048,
  SHORTSLEEVE: 4096,
  TIGHTS: 8192,
  SUIT: 16384,
  VEST: 32768,
  TOWEL: 65536,
  UMBRELLA: 131072,
  CANE: 262144,
  BEARD: 524288,
  NEWSPAPER: 1048576,
  ROD: 2097152,
} as const;

// ─────────────────────────────────────────────────────────── builder ──

interface V3 {
  x: number;
  y: number;
  z: number;
}

class Builder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  info: number[] = [];
  extra: number[] = [];
  idx: number[] = [];
  private part = 0;
  private slot = 0;
  private feat = 0;
  private tint = 1;
  private ex: [number, number, number] = [0, 0, 0];

  use(part: number, slot: number, feat = 0, tint = 1): this {
    this.part = part;
    this.slot = slot;
    this.feat = feat;
    this.tint = tint;
    return this;
  }

  /** extra per-vertex vec3 (used by the dog for joint pivots) */
  pivot(x: number, y: number, z: number): this {
    this.ex = [x, y, z];
    return this;
  }

  v(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
    const i = this.pos.length / 3;
    const l = Math.hypot(nx, ny, nz) || 1;
    this.pos.push(x, y, z);
    this.nor.push(nx / l, ny / l, nz / l);
    this.col.push(this.tint, this.tint, this.tint);
    this.info.push(this.part, this.slot, this.feat);
    this.extra.push(this.ex[0], this.ex[1], this.ex[2]);
    return i;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  /** Axis-aligned box centred at (cx, cy, cz). */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number): this {
    const x0 = cx - w / 2,
      x1 = cx + w / 2,
      y0 = cy - h / 2,
      y1 = cy + h / 2,
      z0 = cz - d / 2,
      z1 = cz + d / 2;
    this.face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1);
    this.face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1);
    this.face([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0);
    this.face([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0);
    this.face([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0);
    this.face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0);
    return this;
  }

  /** Box between two points (thin straps, leashes, rods). `w` across, `t` thickness. */
  boxBetween(p0: V3, p1: V3, w: number, t: number): this {
    const dx = p1.x - p0.x,
      dy = p1.y - p0.y,
      dz = p1.z - p0.z;
    const L = Math.hypot(dx, dy, dz) || 1;
    const ax = { x: dx / L, y: dy / L, z: dz / L };
    // pick a helper not parallel to the axis
    const hlp = Math.abs(ax.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    let ux = ax.y * hlp.z - ax.z * hlp.y,
      uy = ax.z * hlp.x - ax.x * hlp.z,
      uz = ax.x * hlp.y - ax.y * hlp.x;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const vx = ax.y * uz - ax.z * uy,
      vy = ax.z * ux - ax.x * uz,
      vz = ax.x * uy - ax.y * ux;
    const corner = (p: V3, su: number, sv: number): number[] => [p.x + ux * su * w * 0.5 + vx * sv * t * 0.5, p.y + uy * su * w * 0.5 + vy * sv * t * 0.5, p.z + uz * su * w * 0.5 + vz * sv * t * 0.5];
    const c = [corner(p0, -1, -1), corner(p0, 1, -1), corner(p0, 1, 1), corner(p0, -1, 1), corner(p1, -1, -1), corner(p1, 1, -1), corner(p1, 1, 1), corner(p1, -1, 1)];
    // sides
    const sides: [number, number, number, number][] = [
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ];
    for (const [a, b, cc, d] of sides) {
      const nx = (c[a][0] + c[b][0] - p0.x * 2) / 2,
        ny = (c[a][1] + c[b][1] - p0.y * 2) / 2,
        nz = (c[a][2] + c[b][2] - p0.z * 2) / 2;
      this.face(c[a], c[b], c[cc], c[d], nx, ny, nz);
    }
    this.face(c[3], c[2], c[1], c[0], -ax.x, -ax.y, -ax.z);
    this.face(c[4], c[5], c[6], c[7], ax.x, ax.y, ax.z);
    return this;
  }

  private face(a: number[], b: number[], c: number[], d: number[], nx: number, ny: number, nz: number): void {
    // make sure the winding agrees with the normal
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1],
      cy = e1[2] * e2[0] - e1[0] * e2[2],
      cz = e1[0] * e2[1] - e1[1] * e2[0];
    const flip = cx * nx + cy * ny + cz * nz < 0;
    const i0 = this.v(a[0], a[1], a[2], nx, ny, nz);
    const i1 = this.v(b[0], b[1], b[2], nx, ny, nz);
    const i2 = this.v(c[0], c[1], c[2], nx, ny, nz);
    const i3 = this.v(d[0], d[1], d[2], nx, ny, nz);
    if (flip) this.quad(i0, i3, i2, i1);
    else this.quad(i0, i1, i2, i3);
  }

  /**
   * Smooth-shaded tube along +Y through elliptical rings (x/z centre, radii).
   * Angles run clockwise seen from above so quads face outwards.
   */
  loft(rings: { y: number; rx: number; rz: number; cx?: number; cz?: number }[], sides: number, capTop: boolean, capBottom: boolean, rot = 0): this {
    const base = this.pos.length / 3;
    for (const r of rings) {
      for (let k = 0; k < sides; k++) {
        const a = -(k / sides) * Math.PI * 2 + rot;
        const ca = Math.cos(a),
          sa = Math.sin(a);
        this.v((r.cx ?? 0) + r.rx * ca, r.y, (r.cz ?? 0) + r.rz * sa, ca / Math.max(r.rx, 1e-3), 0, sa / Math.max(r.rz, 1e-3));
      }
    }
    for (let j = 0; j < rings.length - 1; j++) {
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides;
        const a = base + j * sides + k,
          b = base + j * sides + k1,
          c = base + (j + 1) * sides + k1,
          d = base + (j + 1) * sides + k;
        this.quad(a, b, c, d);
      }
    }
    if (capTop) {
      const r = rings[rings.length - 1];
      const c = this.v(r.cx ?? 0, r.y, r.cz ?? 0, 0, 1, 0);
      const ids: number[] = [];
      for (let k = 0; k < sides; k++) {
        const a = -(k / sides) * Math.PI * 2 + rot;
        ids.push(this.v((r.cx ?? 0) + r.rx * Math.cos(a), r.y, (r.cz ?? 0) + r.rz * Math.sin(a), 0, 1, 0));
      }
      for (let k = 0; k < sides; k++) this.tri(c, ids[k], ids[(k + 1) % sides]);
    }
    if (capBottom) {
      const r = rings[0];
      const c = this.v(r.cx ?? 0, r.y, r.cz ?? 0, 0, -1, 0);
      const ids: number[] = [];
      for (let k = 0; k < sides; k++) {
        const a = -(k / sides) * Math.PI * 2 + rot;
        ids.push(this.v((r.cx ?? 0) + r.rx * Math.cos(a), r.y, (r.cz ?? 0) + r.rz * Math.sin(a), 0, -1, 0));
      }
      for (let k = 0; k < sides; k++) this.tri(c, ids[(k + 1) % sides], ids[k]);
    }
    return this;
  }

  /**
   * Ellipsoid (or a cap of it). `vmax(azimuth)` limits the polar extent per column
   * (0 = top only … 1 = full sphere); azimuth 0 = +Z (front).
   */
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, seg: number, rings: number, vmax: (az: number) => number = () => 1): this {
    const base = this.pos.length / 3;
    const cols = seg + 1;
    for (let j = 0; j <= rings; j++) {
      for (let k = 0; k <= seg; k++) {
        const a = -(k / seg) * Math.PI * 2; // clockwise seen from above
        const az = Math.atan2(Math.cos(a), Math.sin(a)); // azimuth from +Z
        const v = (j / rings) * vmax(az);
        const phi = v * Math.PI;
        const sy = Math.cos(phi),
          sr = Math.sin(phi);
        const x = rx * sr * Math.cos(a),
          y = ry * sy,
          z = rz * sr * Math.sin(a);
        this.v(cx + x, cy + y, cz + z, x / (rx * rx), y / (ry * ry), z / (rz * rz));
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let k = 0; k < seg; k++) {
        const up0 = base + j * cols + k,
          up1 = base + j * cols + k + 1,
          lo0 = base + (j + 1) * cols + k,
          lo1 = base + (j + 1) * cols + k + 1;
        // lower ring first (same orientation as loft)
        if (j === 0) this.tri(lo0, lo1, up1);
        else this.quad(lo0, lo1, up1, up0);
      }
    }
    return this;
  }

  /** Flat disc / short cylinder (axis Y) from y0 to y1. */
  cylinder(cx: number, cz: number, y0: number, y1: number, r0: number, r1: number, sides: number, caps = true): this {
    // separate flat caps for crisp edges
    this.loft(
      [
        { y: y0, rx: r0, rz: r0, cx, cz },
        { y: y1, rx: r1, rz: r1, cx, cz },
      ],
      sides,
      caps,
      caps,
    );
    return this;
  }

  /** Cylinder with axis along X (wheels). */
  wheelX(cx: number, cy: number, cz: number, r: number, w: number, sides: number): this {
    const base = this.pos.length / 3;
    const xs = [cx - w / 2, cx + w / 2];
    for (const x of xs) {
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        this.v(x, cy + Math.cos(a) * r, cz + Math.sin(a) * r, 0, Math.cos(a), Math.sin(a));
      }
    }
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      this.quad(base + k, base + k1, base + sides + k1, base + sides + k);
    }
    // fix winding by checking the first quad's normal later via face(); simpler: add caps with face-correct normals
    for (const [x, nx] of [
      [xs[0], -1],
      [xs[1], 1],
    ] as [number, number][]) {
      const c = this.v(x, cy, cz, nx, 0, 0);
      const ids: number[] = [];
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        ids.push(this.v(x, cy + Math.cos(a) * r, cz + Math.sin(a) * r, nx, 0, 0));
      }
      for (let k = 0; k < sides; k++) {
        if (nx > 0) this.tri(c, ids[k], ids[(k + 1) % sides]);
        else this.tri(c, ids[(k + 1) % sides], ids[k]);
      }
    }
    return this;
  }

  build(withExtra = false): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 3));
    if (withExtra) g.setAttribute('aPivot', new THREE.Float32BufferAttribute(this.extra, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ──────────────────────────────────────────────────────── pram mesh ──

/** Pram in the pusher's frame (pusher at origin facing +Z). aInfo.y: 0 fabric (instance colour), 1 as painted. */
export function buildPramGeometry(): THREE.BufferGeometry {
  const b = new Builder();
  // handle + push bars
  b.use(0, 1, 0, 0.12);
  b.box(0, 1.0, 0.42, 0.42, 0.03, 0.03);
  b.boxBetween({ x: 0.19, y: 1.0, z: 0.42 }, { x: 0.18, y: 0.5, z: 0.66 }, 0.022, 0.022);
  b.boxBetween({ x: -0.19, y: 1.0, z: 0.42 }, { x: -0.18, y: 0.5, z: 0.66 }, 0.022, 0.022);
  // chassis
  b.boxBetween({ x: 0.17, y: 0.38, z: 0.68 }, { x: 0.17, y: 0.1, z: 0.62 }, 0.02, 0.02);
  b.boxBetween({ x: -0.17, y: 0.38, z: 0.68 }, { x: -0.17, y: 0.1, z: 0.62 }, 0.02, 0.02);
  b.boxBetween({ x: 0.17, y: 0.38, z: 1.12 }, { x: 0.17, y: 0.1, z: 1.17 }, 0.02, 0.02);
  b.boxBetween({ x: -0.17, y: 0.38, z: 1.12 }, { x: -0.17, y: 0.1, z: 1.17 }, 0.02, 0.02);
  for (const z of [0.62, 1.17]) for (const x of [0.2, -0.2]) b.wheelX(x, 0.09, z, 0.09, 0.035, 8);
  // bassinet
  b.use(0, 0, 0, 1);
  b.loft(
    [
      { y: 0.36, rx: 0.17, rz: 0.29, cz: 0.9 },
      { y: 0.46, rx: 0.19, rz: 0.32, cz: 0.9 },
      { y: 0.62, rx: 0.19, rz: 0.32, cz: 0.9 },
    ],
    10,
    true,
    true,
  );
  // trim
  b.use(0, 1, 0, 0.92);
  b.loft(
    [
      { y: 0.615, rx: 0.195, rz: 0.325, cz: 0.9 },
      { y: 0.635, rx: 0.195, rz: 0.325, cz: 0.9 },
    ],
    10,
    false,
    false,
  );
  // hood over the pusher end
  b.use(0, 0, 0, 0.78);
  {
    const n = 6,
      R = 0.2,
      cy = 0.62,
      cz = 0.78;
    const base = b.pos.length / 3;
    for (const x of [-0.19, 0.19]) {
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI; // 0 → back (−Z) … PI → front (+Z)
        const y = cy + Math.sin(a) * R,
          z = cz - Math.cos(a) * R;
        b.v(x, y, z, 0, Math.sin(a), -Math.cos(a));
      }
    }
    for (let k = 0; k < n; k++) {
      const a0 = base + k,
        a1 = base + k + 1,
        c0 = base + n + 1 + k,
        c1 = base + n + 1 + k + 1;
      b.quad(a0, a1, c1, c0);
    }
    for (const [x, nx] of [
      [-0.19, -1],
      [0.19, 1],
    ] as [number, number][]) {
      const c = b.v(x, cy, cz, nx, 0, 0);
      const ids: number[] = [];
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI;
        ids.push(b.v(x, cy + Math.sin(a) * R, cz - Math.cos(a) * R, nx, 0, 0));
      }
      for (let k = 0; k < n; k++) {
        if (nx > 0) b.tri(c, ids[k], ids[k + 1]);
        else b.tri(c, ids[k + 1], ids[k]);
      }
    }
  }
  return b.build();
}

// ───────────────────────────────────────────────────────── dog mesh ──

/** Where the dog walks relative to its walker (walker frame). */
export const DOG_OFFSET = { x: 0.44, z: 0.6 };

/**
 * Dog in the walker's frame: lofted body, neck and head, two-segment legs (shoulder / hip and
 * elbow / hock), ears, nose, collar, a tail that wags and the leash. aInfo.x part: 0 body, 1 upper
 * legs A (FL+BR), 2 upper legs B (FR+BL), 3 tail, 4 leash, 5 lower legs A, 6 lower legs B, 7 head.
 * aInfo.y slot: 0 fur, 1 fur2, 2 collar, 3 painted. aPivot: joint pivot (legs: hip / knee, tail,
 * head: neck base) or the leash end flag.
 */
export function buildDogGeometry(): THREE.BufferGeometry {
  const b = new Builder();
  const ox = DOG_OFFSET.x,
    oz = DOG_OFFSET.z;
  type R = { c: [number, number, number]; rx: number; ry: number };
  /** tube through rings perpendicular to the local axis, smooth, optional end caps */
  const tube = (rings: R[], sides: number, capA: boolean, capB: boolean): void => {
    const base = b.pos.length / 3;
    const ids: number[][] = [];
    rings.forEach((r, i) => {
      const nb = rings[Math.min(rings.length - 1, i + 1)].c,
        pb = rings[Math.max(0, i - 1)].c;
      let ax = nb[0] - pb[0],
        ay = nb[1] - pb[1],
        az = nb[2] - pb[2];
      const al = Math.hypot(ax, ay, az) || 1;
      ax /= al;
      ay /= al;
      az /= al;
      // U horizontal (perpendicular to the axis and up), V = axis × U
      let ux = az,
        uz = -ax,
        uy = 0;
      let ul = Math.hypot(ux, uz);
      if (ul < 1e-3) {
        ux = 1;
        uz = 0;
        ul = 1;
      }
      ux /= ul;
      uz /= ul;
      const vx = ay * uz - az * uy,
        vy = az * ux - ax * uz,
        vz = ax * uy - ay * ux;
      const row: number[] = [];
      for (let k = 0; k < sides; k++) {
        const t = (k / sides) * Math.PI * 2;
        const cu = Math.cos(t) * r.rx,
          sv = Math.sin(t) * r.ry;
        row.push(b.v(r.c[0] + ux * cu + vx * sv, r.c[1] + uy * cu + vy * sv, r.c[2] + uz * cu + vz * sv, 0, 1, 0));
      }
      ids.push(row);
    });
    const P = b.pos;
    const tri = (i: number, j: number, k: number, cx: number, cy: number, cz: number) => {
      const e1 = [P[j * 3] - P[i * 3], P[j * 3 + 1] - P[i * 3 + 1], P[j * 3 + 2] - P[i * 3 + 2]];
      const e2 = [P[k * 3] - P[i * 3], P[k * 3 + 1] - P[i * 3 + 1], P[k * 3 + 2] - P[i * 3 + 2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const m = [(P[i * 3] + P[j * 3] + P[k * 3]) / 3 - cx, (P[i * 3 + 1] + P[j * 3 + 1] + P[k * 3 + 1]) / 3 - cy, (P[i * 3 + 2] + P[j * 3 + 2] + P[k * 3 + 2]) / 3 - cz];
      if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) b.tri(i, k, j);
      else b.tri(i, j, k);
    };
    for (let i = 0; i < rings.length - 1; i++) {
      const c = rings[i].c,
        d = rings[i + 1].c;
      const cx = (c[0] + d[0]) / 2,
        cy = (c[1] + d[1]) / 2,
        cz = (c[2] + d[2]) / 2;
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides;
        tri(ids[i][k], ids[i][k1], ids[i + 1][k1], cx, cy, cz);
        tri(ids[i][k], ids[i + 1][k1], ids[i + 1][k], cx, cy, cz);
      }
    }
    for (const [cap, ri, dir] of [
      [capA, 0, -1],
      [capB, rings.length - 1, 1],
    ] as [boolean, number, number][]) {
      if (!cap) continue;
      const r = rings[ri],
        o2 = rings[ri - dir] ?? r;
      const ex = r.c[0] + (r.c[0] - o2.c[0]) * 0.25,
        ey = r.c[1] + (r.c[1] - o2.c[1]) * 0.25,
        ez = r.c[2] + (r.c[2] - o2.c[2]) * 0.25;
      const apex = b.v(ex, ey, ez, 0, 1, 0);
      for (let k = 0; k < sides; k++) tri(ids[ri][k], ids[ri][(k + 1) % sides], apex, o2.c[0], o2.c[1], o2.c[2]);
    }
    void base;
  };
  const Rg = (x: number, y: number, z: number, rx: number, ry: number): R => ({ c: [ox + x, y, oz + z], rx, ry });
  // body: rump → hips → waist (tucked) → deep chest → shoulders
  b.pivot(ox, 0.3, oz);
  b.use(0, 0);
  tube([Rg(0, 0.37, -0.23, 0.04, 0.045), Rg(0, 0.365, -0.19, 0.068, 0.072), Rg(0, 0.36, -0.06, 0.06, 0.066), Rg(0, 0.345, 0.07, 0.07, 0.09), Rg(0, 0.365, 0.15, 0.068, 0.085), Rg(0, 0.4, 0.2, 0.05, 0.06)], 8, true, false);
  // collar
  b.use(0, 2);
  tube([Rg(0, 0.425, 0.198, 0.055, 0.06), Rg(0, 0.445, 0.215, 0.055, 0.058)], 8, false, false);
  // neck + head (head part: bobs about the neck base)
  b.pivot(ox, 0.43, oz + 0.2);
  b.use(7, 0);
  tube([Rg(0, 0.41, 0.19, 0.045, 0.05), Rg(0, 0.47, 0.235, 0.042, 0.045), Rg(0, 0.505, 0.27, 0.052, 0.054), Rg(0, 0.5, 0.31, 0.045, 0.044)], 7, false, false);
  b.use(7, 1);
  tube([Rg(0, 0.5, 0.31, 0.045, 0.044), Rg(0, 0.488, 0.355, 0.028, 0.028), Rg(0, 0.485, 0.385, 0.02, 0.02)], 7, false, true);
  // nose
  b.use(7, 3, 0, 0.1);
  tube([Rg(0, 0.488, 0.386, 0.012, 0.01), Rg(0, 0.49, 0.397, 0.008, 0.007)], 5, false, true);
  // ears (two flaps)
  b.use(7, 1);
  for (const sx of [1, -1]) tube([Rg(sx * 0.03, 0.535, 0.262, 0.016, 0.008), Rg(sx * 0.042, 0.575, 0.258, 0.012, 0.005)], 4, false, true);
  // legs: upper (shoulder / hip → elbow / hock) and lower (→ paw), knee directly below the hip
  const legs: [number, number, number, number][] = [
    [0.045, 0.13, 1, 5],
    [-0.045, -0.16, 1, 5],
    [-0.045, 0.13, 2, 6],
    [0.045, -0.16, 2, 6],
  ];
  for (const [lx, lz, up, lo] of legs) {
    const rear = lz < 0;
    b.pivot(ox + lx, 0.3, oz + lz);
    b.use(up, 0);
    tube([Rg(lx * 0.9, 0.34, lz, rear ? 0.032 : 0.028, rear ? 0.045 : 0.034), Rg(lx, 0.25, lz + (rear ? -0.01 : 0), rear ? 0.024 : 0.022, rear ? 0.03 : 0.024), Rg(lx, 0.155, lz, 0.019, 0.02)], 5, false, false);
    b.pivot(ox + lx, 0.155, oz + lz);
    b.use(lo, 0);
    tube([Rg(lx, 0.155, lz, 0.019, 0.02), Rg(lx, 0.06, lz + (rear ? -0.012 : 0.004), 0.015, 0.016), Rg(lx, 0.022, lz + 0.012, 0.02, 0.016)], 5, false, false);
    b.use(lo, 1);
    tube([Rg(lx, 0.022, lz + 0.012, 0.02, 0.016), Rg(lx, 0.012, lz + 0.03, 0.019, 0.011)], 5, false, true);
  }
  // tail
  b.pivot(ox, 0.385, oz - 0.21);
  b.use(3, 0);
  tube([Rg(0, 0.385, -0.215, 0.014, 0.016), Rg(0, 0.45, -0.27, 0.013, 0.013), Rg(0, 0.52, -0.3, 0.008, 0.008)], 4, false, true);
  // leash: unit box along +Z from 0 (hand) to 1 (collar); aPivot.x = 0/1 end flag
  b.use(4, 3, 0, 0.18);
  const w = 0.012;
  {
    const base = b.pos.length / 3;
    for (const end of [0, 1]) {
      b.pivot(end, 0, 0);
      for (const [cx, cy] of [
        [-w, -w],
        [w, -w],
        [w, w],
        [-w, w],
      ]) {
        b.v(cx, cy, end, cx, cy, 0);
      }
    }
    const q = (a2: number, bb: number, c: number, d: number) => b.quad(base + a2, base + bb, base + c, base + d);
    q(0, 4, 5, 1);
    q(1, 5, 6, 2);
    q(2, 6, 7, 3);
    q(3, 7, 4, 0);
  }
  const g = b.build(true);
  g.computeVertexNormals();
  return g;
}

// ───────────────────────────────────────────────────── blob shadows ──

export function buildBlobGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

// ─────────────────────────────────────────────────────────── shaders ──

const COMMON_GLSL = /* glsl */ `
vec3 pedRGB(float v) {
  float r = floor(v / 65536.0);
  float g = floor((v - r * 65536.0) / 256.0);
  float b = v - r * 65536.0 - g * 256.0;
  return pow(vec3(r, g, b) / 255.0, vec3(2.2));
}
mat3 pedRX(float a) { float c = cos(a); float s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 pedRY(float a) { float c = cos(a); float s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 pedRZ(float a) { float c = cos(a); float s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
`;

const FADE_FRAG_PARS = /* glsl */ `
varying float vPedFade;
float pedBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float pedBayer4(vec2 a) { return pedBayer2(0.5 * a) * 0.25 + pedBayer2(a); }
`;
const FADE_FRAG_MAIN = /* glsl */ `
  if (vPedFade < 0.995 && vPedFade <= pedBayer4(gl_FragCoord.xy) + 0.001) discard;
`;

function injectFragmentFade(src: string, extraPars = ''): string {
  return src.replace('#include <common>', `#include <common>\n${FADE_FRAG_PARS}${extraPars}`).replace(/void main\(\)\s*\{/, (m) => `${m}\n${FADE_FRAG_MAIN}`);
}

export interface PersonMaterials {
  material: THREE.MeshLambertMaterial;
  depth: THREE.MeshDepthMaterial;
}

// pram: rigid + fade + instance fabric colour
const PRAM_VERT_PARS = /* glsl */ `
attribute vec3 aInfo;
attribute vec4 iMisc; // fabric colour, fade, -, -
varying float vPedFade;
${COMMON_GLSL}
`;

export function makePramMaterials(): PersonMaterials {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPedNight = globalUniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PRAM_VERT_PARS}`)
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vColor.rgb *= aInfo.y < 0.5 ? pedRGB(iMisc.x) : vec3(1.0);\n  vPedFade = iMisc.y;');
    shader.fragmentShader = injectFragmentFade(shader.fragmentShader, 'uniform float uPedNight;\n').replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.07 * uPedNight;',
    );
  };
  material.customProgramCacheKey = () => 'tinyhaven-pram-1';
  const depth = new THREE.MeshDepthMaterial();
  depth.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PRAM_VERT_PARS}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vPedFade = iMisc.y;');
    shader.fragmentShader = injectFragmentFade(shader.fragmentShader);
  };
  depth.customProgramCacheKey = () => 'tinyhaven-pram-depth-1';
  return { material, depth };
}

// dog: trotting legs, wagging tail, sit, leash stretched to the walker's hand
const DOG_VERT_PARS = /* glsl */ `
attribute vec3 aInfo;
attribute vec3 aPivot;
attribute vec4 iDog;    // phase, amp, sit, fade
attribute vec4 iDogCol; // fur, fur2, collar, size
attribute vec4 iHand;   // walker's hand position (walker frame) + wag seed
uniform float uPedTime;
varying float vPedFade;
${COMMON_GLSL}
vec3 dogColor() {
  int slot = int(aInfo.y + 0.5);
  if (slot == 0) return pedRGB(iDogCol.x);
  if (slot == 1) return pedRGB(iDogCol.y);
  if (slot == 2) return pedRGB(iDogCol.z);
  return vec3(1.0);
}
void dogPose(inout vec3 p, inout vec3 n) {
  vPedFade = iDog.w;
  int part = int(aInfo.x + 0.5);
  float size = iDogCol.w;
  vec3 o = vec3(${DOG_OFFSET.x.toFixed(3)}, 0.0, ${DOG_OFFSET.z.toFixed(3)});
  float sit = iDog.z;
  if (part == 4) {
    // leash: z = 0 at the walker's hand, 1 at the collar (slack sags when walking slowly)
    vec3 collar = o + vec3(0.0, 0.45 - 0.12 * sit, 0.2) * size;
    float t = p.z;
    float sag = 0.09 * sin(3.14159 * t) * (1.0 - 0.6 * clamp(iDog.y, 0.0, 1.0));
    p = mix(iHand.xyz, collar, t) + vec3(p.x, p.y - sag, 0.0);
    return;
  }
  p = o + (p - o) * size;
  vec3 pv = o + (aPivot - o) * size;
  bool rear = aPivot.z < o.z;
  bool upper = part == 1 || part == 2;
  bool lower = part == 5 || part == 6;
  bool leg = upper || lower;
  float amp = clamp(iDog.y, 0.0, 1.4);
  if (leg) {
    bool A = part == 1 || part == 5;
    float ph = iDog.x + (A ? 0.0 : 3.14159);
    float a = 0.5 * amp * sin(ph) * (1.0 - sit);
    // elbow / hock flex while the leg swings forward
    float kb = 0.8 * amp * max(0.0, cos(ph + 0.7)) * (1.0 - sit);
    if (rear) a -= 1.15 * sit;
    if (lower) {
      float kn = rear ? -0.55 * kb - 0.12 * (1.0 - sit) + 2.25 * sit : kb + 0.06;
      mat3 rk = pedRX(kn);
      p = rk * (p - pv) + pv; n = rk * n;
      pv = vec3(pv.x, o.y + 0.3 * size, pv.z);
    }
    mat3 r = pedRX(a);
    p = r * (p - pv) + pv; n = r * n;
  } else if (part == 3) {
    float wag = (0.45 + 0.25 * iDog.y) * sin(uPedTime * 13.0 + iHand.w * 6.28);
    mat3 r = pedRY(wag) * pedRX(-0.25 * sit);
    p = r * (p - pv) + pv; n = r * n;
  } else if (part == 7) {
    // head bobs with the trot; held up when sitting
    float bob = 0.07 * amp * sin(2.0 * iDog.x) + 0.42 * sit;
    mat3 r = pedRX(bob);
    p = r * (p - pv) + pv; n = r * n;
  }
  if (!(leg && !rear) && sit > 0.001) {
    vec3 sp = o + vec3(0.0, 0.3, 0.13) * size;
    mat3 r = pedRX(-0.5 * sit);
    p = r * (p - sp) + sp; n = r * n;
  }
  p.y += size * 0.012 * iDog.y * abs(cos(iDog.x));
}
`;

export function makeDogMaterials(): PersonMaterials {
  const uPedTime = globalUniforms.uTime;
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPedNight = globalUniforms.uNight;
    shader.uniforms.uPedTime = uPedTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DOG_VERT_PARS}`)
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vColor.rgb *= dogColor();')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal );\n  vec3 dogP = vec3( position );\n  dogPose( dogP, objectNormal );')
      .replace('#include <begin_vertex>', 'vec3 transformed = dogP;');
    shader.fragmentShader = injectFragmentFade(shader.fragmentShader, 'uniform float uPedNight;\n').replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.07 * uPedNight;',
    );
  };
  material.customProgramCacheKey = () => 'tinyhaven-dog-1';
  const depth = new THREE.MeshDepthMaterial();
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.uPedTime = uPedTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DOG_VERT_PARS}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3( position );\n  vec3 dogN = vec3( 0.0, 1.0, 0.0 );\n  dogPose( transformed, dogN );');
    shader.fragmentShader = injectFragmentFade(shader.fragmentShader);
  };
  depth.customProgramCacheKey = () => 'tinyhaven-dog-depth-1';
  return { material, depth };
}

/** Soft dark ellipse under each figure (contact shadow). */
export function makeBlobMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float iBlobA;\nvarying vec2 vBlobP;\nvarying float vBlobA;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBlobP = position.xz * 2.0;\n  vBlobA = iBlobA;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBlobP;\nvarying float vBlobA;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  float br = length(vBlobP);\n  diffuseColor.a *= vBlobA * (1.0 - smoothstep(0.25, 1.0, br));');
  };
  m.customProgramCacheKey = () => 'tinyhaven-blob-1';
  return m;
}

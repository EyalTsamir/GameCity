// Procedural model-railway style people.
//
// One shared "person" geometry (≈1.75 m adult, facing +Z, feet at y=0) with every
// accessory baked in. Each vertex carries (part, colour slot, feature bit):
//   part    which rigid piece it belongs to (torso, head, thigh/shin, upper/fore arm…)
//   slot    which per-instance colour it takes (skin, top, bottom, shoes, hair…)
//   feature an instance flag bit that must be set (>0) / cleared (<0) for it to show
// The vertex shader poses the figure from per-instance joint angles (walk, run, sit,
// lie, wave, push a pram…), so a whole crowd is one InstancedMesh draw call.
// Prams and dogs are separate small instanced meshes; blob shadows ground everyone.

import * as THREE from 'three';
import { globalUniforms } from '../../core/uniforms';

// ───────────────────────────────────────────────────────────── codes ──

export const PART = {
  BODY: 0,
  HEAD: 1,
  THIGH_L: 2,
  SHIN_L: 3,
  THIGH_R: 4,
  SHIN_R: 5,
  UPPER_L: 6,
  FORE_L: 7,
  UPPER_R: 8,
  FORE_R: 9,
  GROUND: 10,
  UMBRELLA: 11,
} as const;

export const SLOT = {
  SKIN: 0,
  TOP: 1,
  BOTTOM: 2,
  SHOES: 3,
  HAIR: 4,
  HAT: 5,
  BAG: 6,
  WHITE: 7,
  DARK: 8,
  THIGH: 9,
  SHIN: 10,
  FOREARM: 11,
  TORSO: 12,
  TOWEL: 13,
  UMBRELLA: 14,
  ACCENT: 15,
} as const;

/** Instance feature flags (bit mask, stored as an exact float). */
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

// Skeleton pivots (rest pose). Must match the shader below.
export const RIG = {
  hipY: 0.92,
  kneeY: 0.5,
  legX: 0.09,
  shoulderY: 1.4,
  elbowY: 1.13,
  armX: 0.222,
  neckY: 1.52,
  leanY: 0.95,
  /** upper arm / forearm lengths */
  upperArm: 0.27,
  foreArm: 0.29,
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

// ────────────────────────────────────────────────────── person mesh ──

/**
 * The person mesh. `lo` builds the far-LOD variant (about a fifth of the triangles:
 * boxy limbs, coarse head, no tiny details) used beyond ~55 m from the camera.
 */
export function buildPersonGeometry(lo = false): THREE.BufferGeometry {
  const b = new Builder();
  const P = PART,
    S = SLOT;
  const limb = lo ? 4 : 6;
  const trunk = lo ? 6 : 8;
  const rot = lo ? Math.PI / 4 : 0;

  // legs (thigh + shin + shoe), left at +X
  for (const side of [1, -1]) {
    const x = side * RIG.legX;
    b.use(side > 0 ? P.THIGH_L : P.THIGH_R, S.THIGH);
    b.loft(
      lo
        ? [
            { y: 0.465, rx: 0.066, rz: 0.07, cx: x, cz: 0.004 },
            { y: 0.96, rx: 0.08, rz: 0.084, cx: x, cz: 0 },
          ]
        : [
            { y: 0.465, rx: 0.062, rz: 0.066, cx: x, cz: 0.004 },
            { y: 0.72, rx: 0.069, rz: 0.073, cx: x, cz: 0.006 },
            { y: 0.96, rx: 0.076, rz: 0.08, cx: x, cz: 0 },
          ],
      limb,
      false,
      false,
      rot,
    );
    b.use(side > 0 ? P.SHIN_L : P.SHIN_R, S.SHIN);
    b.loft(
      lo
        ? [
            { y: 0.06, rx: 0.045, rz: 0.048, cx: x, cz: -0.004 },
            { y: 0.53, rx: 0.055, rz: 0.058, cx: x, cz: 0 },
          ]
        : [
            { y: 0.06, rx: 0.039, rz: 0.042, cx: x, cz: -0.004 },
            { y: 0.3, rx: 0.049, rz: 0.055, cx: x, cz: -0.008 },
            { y: 0.44, rx: 0.052, rz: 0.056, cx: x, cz: -0.002 },
            { y: 0.53, rx: 0.047, rz: 0.05, cx: x, cz: 0 },
          ],
      limb,
      false,
      false,
      rot,
    );
    b.use(side > 0 ? P.SHIN_L : P.SHIN_R, S.SHOES);
    if (lo) b.box(x, 0.035, 0.03, 0.085, 0.07, 0.2);
    else {
      b.box(x, 0.034, 0.036, 0.08, 0.06, 0.19);
      b.box(x, 0.05, 0.002, 0.072, 0.05, 0.1);
      b.use(side > 0 ? P.SHIN_L : P.SHIN_R, S.SHOES, 0, 0.7);
      b.box(x, 0.008, 0.036, 0.084, 0.016, 0.196); // sole
    }
  }

  // pelvis (bottom colour) and torso (top colour)
  b.use(P.BODY, S.BOTTOM);
  b.loft(
    lo
      ? [
          { y: 0.84, rx: 0.16, rz: 0.1 },
          { y: 1.02, rx: 0.157, rz: 0.098 },
        ]
      : [
          { y: 0.84, rx: 0.157, rz: 0.098 },
          { y: 0.94, rx: 0.16, rz: 0.1 },
          { y: 1.02, rx: 0.155, rz: 0.097 },
        ],
    trunk,
    false,
    true,
    Math.PI / trunk,
  );
  b.use(P.BODY, S.TORSO);
  b.loft(
    lo
      ? [
          { y: 1.0, rx: 0.155, rz: 0.097 },
          { y: 1.3, rx: 0.18, rz: 0.106, cz: 0.006 },
          { y: 1.45, rx: 0.195, rz: 0.1 },
          { y: 1.51, rx: 0.09, rz: 0.06 },
        ]
      : [
          { y: 1.0, rx: 0.152, rz: 0.095 },
          { y: 1.14, rx: 0.151, rz: 0.097, cz: 0.003 },
          { y: 1.3, rx: 0.177, rz: 0.106, cz: 0.006 },
          { y: 1.41, rx: 0.193, rz: 0.104, cz: 0.002 },
          { y: 1.455, rx: 0.188, rz: 0.094 },
          { y: 1.49, rx: 0.14, rz: 0.075 },
          { y: 1.51, rx: 0.075, rz: 0.055 },
        ],
    trunk,
    true,
    false,
    Math.PI / trunk,
  );
  // neck + head (+ nose, ears)
  b.use(P.HEAD, S.SKIN);
  if (!lo) b.cylinder(0, 0.0, 1.46, 1.56, 0.043, 0.04, 6, false);
  else b.cylinder(0, 0.0, 1.47, 1.56, 0.045, 0.042, 4, false);
  b.ellipsoid(0, 1.638, 0.006, 0.097, 0.116, 0.104, lo ? 6 : 9, lo ? 4 : 7);
  if (!lo) {
    b.box(0, 1.622, 0.106, 0.026, 0.034, 0.026);
    b.use(P.HEAD, S.SKIN, 0, 0.92);
    b.box(0.097, 1.63, -0.002, 0.018, 0.04, 0.03);
    b.box(-0.097, 1.63, -0.002, 0.018, 0.04, 0.03);
  }

  // hair cap: covers top/back, leaves the face
  b.use(P.HEAD, S.HAIR, F.HAIR);
  b.ellipsoid(0, 1.645, -0.004, 0.104, 0.124, 0.112, lo ? 6 : 9, lo ? 3 : 4, (az) => 0.5 - 0.17 * Math.cos(az));
  // long hair (down the back + over the ears)
  b.use(P.HEAD, S.HAIR, F.LONGHAIR);
  if (lo) b.box(0, 1.5, -0.085, 0.2, 0.28, 0.07);
  else {
    b.loft(
      [
        { y: 1.36, rx: 0.1, rz: 0.03, cz: -0.088 },
        { y: 1.5, rx: 0.108, rz: 0.04, cz: -0.085 },
        { y: 1.64, rx: 0.106, rz: 0.05, cz: -0.07 },
      ],
      6,
      false,
      true,
    );
    b.box(0.088, 1.585, -0.012, 0.03, 0.13, 0.07);
    b.box(-0.088, 1.585, -0.012, 0.03, 0.13, 0.07);
  }
  // bun / ponytail
  b.use(P.HEAD, S.HAIR, F.BUN);
  if (lo) b.box(0, 1.69, -0.118, 0.08, 0.08, 0.08);
  else b.ellipsoid(0, 1.69, -0.118, 0.048, 0.046, 0.045, 6, 4);
  // beard
  if (!lo) {
    b.use(P.HEAD, S.HAIR, F.BEARD);
    b.box(0, 1.567, 0.078, 0.088, 0.056, 0.045);
    b.box(0, 1.6, 0.104, 0.05, 0.012, 0.012);
  }

  // hats
  b.use(P.HEAD, S.HAT, F.HAT);
  b.cylinder(0, -0.004, 1.708, 1.722, 0.172, 0.17, lo ? 8 : 12);
  b.cylinder(0, -0.004, 1.72, 1.81, 0.094, 0.086, lo ? 6 : 9);
  b.use(P.HEAD, S.HAT, F.CAP);
  b.ellipsoid(0, 1.672, 0.0, 0.112, 0.105, 0.12, lo ? 6 : 9, lo ? 2 : 4, () => 0.5);
  b.box(0, 1.676, 0.158, 0.13, 0.012, 0.1);
  b.use(P.HEAD, S.HAT, F.HARDHAT);
  b.ellipsoid(0, 1.692, 0.0, 0.122, 0.092, 0.13, lo ? 6 : 9, lo ? 2 : 4, () => 0.5);
  b.cylinder(0, 0.0, 1.686, 1.698, 0.152, 0.15, lo ? 8 : 12);
  if (!lo) b.box(0, 1.782, 0, 0.022, 0.02, 0.2);

  // arms (upper: top colour; fore: top or skin; hands: skin), left at +X
  for (const side of [1, -1]) {
    const x = side * RIG.armX;
    const up = side > 0 ? P.UPPER_L : P.UPPER_R;
    const fo = side > 0 ? P.FORE_L : P.FORE_R;
    b.use(up, S.TOP);
    if (!lo) b.ellipsoid(x - side * 0.01, 1.405, 0, 0.05, 0.04, 0.056, 6, 4, () => 0.5);
    b.loft(
      lo
        ? [
            { y: 1.105, rx: 0.045, rz: 0.049, cx: x },
            { y: 1.44, rx: 0.05, rz: 0.055, cx: x - side * 0.006 },
          ]
        : [
            { y: 1.105, rx: 0.043, rz: 0.047, cx: x },
            { y: 1.3, rx: 0.045, rz: 0.05, cx: x },
            { y: 1.41, rx: 0.048, rz: 0.054, cx: x - side * 0.006 },
          ],
      limb,
      lo,
      false,
      rot,
    );
    b.use(fo, S.FOREARM);
    b.loft(
      lo
        ? [
            { y: 0.87, rx: 0.033, rz: 0.036, cx: x, cz: 0.004 },
            { y: 1.15, rx: 0.037, rz: 0.04, cx: x },
          ]
        : [
            { y: 0.87, rx: 0.03, rz: 0.033, cx: x, cz: 0.004 },
            { y: 1.0, rx: 0.034, rz: 0.037, cx: x, cz: 0.002 },
            { y: 1.15, rx: 0.035, rz: 0.038, cx: x },
          ],
      limb,
      false,
      false,
      rot,
    );
    b.use(fo, S.SKIN);
    if (lo) b.box(x, 0.835, 0.008, 0.055, 0.09, 0.07);
    else b.ellipsoid(x, 0.835, 0.008, 0.031, 0.05, 0.04, 6, 4);
  }

  // skirt
  b.use(P.BODY, S.BOTTOM, F.SKIRT);
  b.loft(
    lo
      ? [
          { y: 0.56, rx: 0.232, rz: 0.19, cz: 0.01 },
          { y: 1.03, rx: 0.161, rz: 0.103 },
        ]
      : [
          { y: 0.56, rx: 0.232, rz: 0.19, cz: 0.01 },
          { y: 0.8, rx: 0.2, rz: 0.15, cz: 0.005 },
          { y: 1.03, rx: 0.161, rz: 0.103 },
        ],
    lo ? 6 : 10,
    false,
    false,
  );
  // suit: white collar + tie
  b.use(P.BODY, S.WHITE, F.SUIT);
  b.box(0, 1.458, 0.085, 0.1, 0.05, 0.028);
  b.use(P.BODY, S.ACCENT, F.SUIT);
  b.box(0, 1.335, 0.112, 0.032, 0.17, 0.014);
  // hi-vis vest stripes
  b.use(P.BODY, S.WHITE, F.VEST, 1.1);
  for (const y of lo ? [1.24] : [1.17, 1.31]) {
    b.loft(
      [
        { y: y, rx: (y > 1.2 ? 0.178 : 0.152) + 0.008, rz: (y > 1.2 ? 0.107 : 0.098) + 0.008, cz: 0.004 },
        { y: y + (lo ? 0.04 : 0.03), rx: (y > 1.2 ? 0.181 : 0.155) + 0.008, rz: (y > 1.2 ? 0.107 : 0.099) + 0.008, cz: 0.004 },
      ],
      trunk,
      false,
      false,
      Math.PI / trunk,
    );
  }
  // backpack (+ straps over the chest)
  b.use(P.BODY, S.BAG, F.BACKPACK);
  b.box(0, 1.245, -0.155, 0.25, 0.3, 0.11);
  if (!lo) {
    b.box(0, 1.405, -0.15, 0.22, 0.035, 0.1);
    b.use(P.BODY, S.BAG, F.BACKPACK, 0.7);
    b.box(0.085, 1.33, 0.113, 0.03, 0.2, 0.012);
    b.box(-0.085, 1.33, 0.113, 0.03, 0.2, 0.012);
  }
  // shoulder bag at the left hip + strap across the chest
  b.use(P.BODY, S.BAG, F.HANDBAG);
  b.box(0.185, 0.975, 0.03, 0.06, 0.15, 0.2);
  if (!lo) {
    b.use(P.BODY, S.BAG, F.HANDBAG, 0.8);
    b.boxBetween({ x: 0.16, y: 1.04, z: 0.1 }, { x: -0.13, y: 1.45, z: 0.097 }, 0.028, 0.012);
    b.boxBetween({ x: 0.16, y: 1.04, z: -0.1 }, { x: -0.13, y: 1.45, z: -0.097 }, 0.028, 0.012);
  }
  // shopping bag in the right hand
  b.use(P.FORE_R, S.BAG, F.SHOPBAG);
  b.box(-RIG.armX, 0.69, 0.005, 0.085, 0.24, 0.2);
  if (!lo) {
    b.use(P.FORE_R, S.BAG, F.SHOPBAG, 0.75);
    b.box(-RIG.armX, 0.83, 0.005, 0.012, 0.05, 0.1);
  }
  // briefcase in the left hand
  b.use(P.FORE_L, S.BAG, F.BRIEFCASE);
  b.box(RIG.armX, 0.675, 0.01, 0.07, 0.25, 0.34);
  if (!lo) {
    b.use(P.FORE_L, S.DARK, F.BRIEFCASE);
    b.box(RIG.armX, 0.815, 0.01, 0.014, 0.04, 0.08);
  }
  // walking cane in the right hand
  b.use(P.FORE_R, S.DARK, F.CANE);
  b.box(-RIG.armX - 0.01, 0.42, 0.045, 0.022, 0.84, 0.022);
  if (!lo) b.box(-RIG.armX - 0.01, 0.832, 0.03, 0.022, 0.022, 0.07);
  // fishing rod (right hand, pointing forward and up once posed)
  b.use(P.FORE_R, S.DARK, F.ROD);
  b.boxBetween({ x: -RIG.armX, y: 0.84, z: 0.01 }, { x: -RIG.armX - 0.02, y: 0.84 - 1.14, z: 0.01 + 1.76 }, 0.018, 0.018);
  // newspaper held in front of the chest (sitting readers)
  b.use(P.BODY, S.WHITE, F.NEWSPAPER, 0.96);
  b.boxBetween({ x: -0.23, y: 1.33, z: 0.36 }, { x: 0.23, y: 1.33, z: 0.36 }, 0.008, 0.3);

  // umbrella (held in the right hand, rides with the upper body)
  b.use(P.UMBRELLA, S.DARK, F.UMBRELLA);
  b.box(-0.205, 1.62, 0.37, 0.016, 0.82, 0.016);
  b.use(P.UMBRELLA, S.UMBRELLA, F.UMBRELLA);
  {
    const cx = -0.205,
      cz = 0.37,
      apexY = 2.2,
      rimY = 1.99,
      R = 0.56,
      n = lo ? 6 : 8;
    const apex = b.v(cx, apexY, cz, 0, 1, 0);
    const rim: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = -(k / n) * Math.PI * 2;
      rim.push(b.v(cx + Math.cos(a) * R, rimY, cz + Math.sin(a) * R, Math.cos(a) * 0.5, 0.86, Math.sin(a) * 0.5));
    }
    for (let k = 0; k < n; k++) b.tri(apex, rim[k], rim[(k + 1) % n]);
    // underside (darker)
    b.use(P.UMBRELLA, S.UMBRELLA, F.UMBRELLA, 0.6);
    const ua = b.v(cx, apexY - 0.06, cz, 0, -1, 0);
    const rim2: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = -(k / n) * Math.PI * 2;
      rim2.push(b.v(cx + Math.cos(a) * R, rimY - 0.002, cz + Math.sin(a) * R, 0, -1, 0));
    }
    for (let k = 0; k < n; k++) b.tri(ua, rim2[(k + 1) % n], rim2[k]);
  }

  // beach towel (stays flat on the ground)
  b.use(P.GROUND, S.TOWEL, F.TOWEL);
  b.box(0, 0.006, 0.05, 0.8, 0.012, 1.95);
  if (!lo) {
    b.use(P.GROUND, S.WHITE, F.TOWEL);
    b.box(0, 0.0135, 0.05 + 0.72, 0.8, 0.004, 0.11);
    b.box(0, 0.0135, 0.05 - 0.72, 0.8, 0.004, 0.11);
  }

  return b.build();
}

/**
 * The far-away person (~190 triangles, ~210 vertices; the `lo` mesh has ~590) used
 * beyond ~130 m from the camera, where a figure is under ~22 px tall: square-section
 * limbs and trunk, coarse head and hair cap, shoes as open blocks, no hands. Same parts / colour slots / feature bits as the full mesh, so the shader
 * poses and paints it identically; only accessories that still read at that size are
 * kept (skirt, hats, long hair, backpack, umbrella, beach towel).
 */
export function buildTinyPersonGeometry(): THREE.BufferGeometry {
  const b = new Builder();
  const P = PART,
    S = SLOT;
  const sq = Math.PI / 4; // square sections aligned with the axes
  const k = Math.SQRT2; // 4-sided loft radius → half-width
  /** axis-aligned block as a 4-sided loft (8 vertices without caps) */
  const blk = (cx: number, cy: number, cz: number, w: number, h: number, d: number, top: boolean): void => {
    b.loft(
      [
        { y: cy - h / 2, rx: (w / 2) * k, rz: (d / 2) * k, cx, cz },
        { y: cy + h / 2, rx: (w / 2) * k, rz: (d / 2) * k, cx, cz },
      ],
      4,
      top,
      false,
      sq,
    );
  };
  // legs
  for (const side of [1, -1]) {
    const x = side * RIG.legX;
    b.use(side > 0 ? P.THIGH_L : P.THIGH_R, S.THIGH);
    b.loft(
      [
        { y: 0.465, rx: 0.07, rz: 0.074, cx: x, cz: 0.004 },
        { y: 0.96, rx: 0.084, rz: 0.088, cx: x, cz: 0 },
      ],
      4,
      false,
      false,
      sq,
    );
    b.use(side > 0 ? P.SHIN_L : P.SHIN_R, S.SHIN);
    b.loft(
      [
        { y: 0.06, rx: 0.052, rz: 0.058, cx: x, cz: -0.004 },
        { y: 0.53, rx: 0.058, rz: 0.062, cx: x, cz: 0 },
      ],
      4,
      false,
      false,
      sq,
    );
    b.use(side > 0 ? P.SHIN_L : P.SHIN_R, S.SHOES);
    blk(x, 0.035, 0.03, 0.085, 0.07, 0.2, true);
  }
  // pelvis + torso
  b.use(P.BODY, S.BOTTOM);
  b.loft(
    [
      { y: 0.84, rx: 0.165, rz: 0.104 },
      { y: 1.02, rx: 0.162, rz: 0.102 },
    ],
    4,
    false,
    false,
    sq,
  );
  b.use(P.BODY, S.TORSO);
  b.loft(
    [
      { y: 1.0, rx: 0.16, rz: 0.1 },
      { y: 1.44, rx: 0.2, rz: 0.106 },
      { y: 1.51, rx: 0.1, rz: 0.065 },
    ],
    4,
    true,
    false,
    sq,
  );
  // head + hair cap
  b.use(P.HEAD, S.SKIN);
  b.ellipsoid(0, 1.635, 0.006, 0.1, 0.12, 0.106, 4, 3);
  b.use(P.HEAD, S.HAIR, F.HAIR);
  b.ellipsoid(0, 1.645, -0.004, 0.108, 0.128, 0.116, 4, 2, (az) => 0.5 - 0.17 * Math.cos(az));
  b.use(P.HEAD, S.HAIR, F.LONGHAIR);
  blk(0, 1.5, -0.085, 0.2, 0.28, 0.07, false);
  // hats: sun-hat brim as a flat disc + crown, cap / hard hat as a dome
  b.use(P.HEAD, S.HAT, F.HAT);
  {
    const c = b.v(0, 1.722, -0.004, 0, 1, 0);
    const ring: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = -(i / 6) * Math.PI * 2;
      ring.push(b.v(Math.cos(a) * 0.172, 1.722, -0.004 + Math.sin(a) * 0.172, 0, 1, 0));
    }
    for (let i = 0; i < 6; i++) b.tri(c, ring[i], ring[(i + 1) % 6]);
  }
  blk(0, 1.765, -0.004, 0.13, 0.09, 0.13, true);
  b.use(P.HEAD, S.HAT, F.CAP);
  b.ellipsoid(0, 1.672, 0.0, 0.112, 0.105, 0.12, 4, 1, () => 0.5);
  b.use(P.HEAD, S.HAT, F.HARDHAT);
  b.ellipsoid(0, 1.692, 0.0, 0.122, 0.092, 0.13, 4, 1, () => 0.5);
  // arms (forearm reaches down over the hand)
  for (const side of [1, -1]) {
    const x = side * RIG.armX;
    b.use(side > 0 ? P.UPPER_L : P.UPPER_R, S.TOP);
    b.loft(
      [
        { y: 1.105, rx: 0.048, rz: 0.052, cx: x },
        { y: 1.44, rx: 0.054, rz: 0.06, cx: x - side * 0.006 },
      ],
      4,
      true,
      false,
      sq,
    );
    b.use(side > 0 ? P.FORE_L : P.FORE_R, S.FOREARM);
    b.loft(
      [
        { y: 0.8, rx: 0.036, rz: 0.04, cx: x, cz: 0.006 },
        { y: 1.15, rx: 0.04, rz: 0.044, cx: x },
      ],
      4,
      false,
      false,
      sq,
    );
  }
  // skirt
  b.use(P.BODY, S.BOTTOM, F.SKIRT);
  b.loft(
    [
      { y: 0.56, rx: 0.232, rz: 0.19, cz: 0.01 },
      { y: 1.03, rx: 0.161, rz: 0.103 },
    ],
    5,
    false,
    false,
  );
  // backpack
  b.use(P.BODY, S.BAG, F.BACKPACK);
  blk(0, 1.245, -0.155, 0.25, 0.3, 0.11, true);
  // umbrella canopy (top side only)
  b.use(P.UMBRELLA, S.UMBRELLA, F.UMBRELLA);
  {
    const cx = -0.205,
      cz = 0.37;
    const apex = b.v(cx, 2.2, cz, 0, 1, 0);
    const rim: number[] = [];
    for (let i = 0; i < 5; i++) {
      const a = -(i / 5) * Math.PI * 2;
      rim.push(b.v(cx + Math.cos(a) * 0.56, 1.99, cz + Math.sin(a) * 0.56, Math.cos(a) * 0.5, 0.86, Math.sin(a) * 0.5));
    }
    for (let i = 0; i < 5; i++) b.tri(apex, rim[i], rim[(i + 1) % 5]);
  }
  // beach towel: top face only
  b.use(P.GROUND, S.TOWEL, F.TOWEL);
  {
    const y = 0.012;
    const q = [b.v(-0.4, y, 0.05 - 0.975, 0, 1, 0), b.v(0.4, y, 0.05 - 0.975, 0, 1, 0), b.v(0.4, y, 0.05 + 0.975, 0, 1, 0), b.v(-0.4, y, 0.05 + 0.975, 0, 1, 0)];
    b.quad(q[0], q[3], q[2], q[1]);
  }
  return b.build();
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
 * Dog in the walker's frame. aInfo.x part: 0 body, 1 legs A (FL+BR), 2 legs B (FR+BL),
 * 3 tail, 4 leash (stretched in the shader from the walker's hand to the collar).
 * aInfo.y slot: 0 fur, 1 fur2, 2 collar, 3 painted. aPivot: joint pivot (legs/tail) or leash end flag.
 */
export function buildDogGeometry(): THREE.BufferGeometry {
  const b = new Builder();
  const ox = DOG_OFFSET.x,
    oz = DOG_OFFSET.z;
  b.pivot(ox, 0.27, oz + 0.15);
  b.use(0, 0);
  b.box(ox, 0.335, oz, 0.15, 0.15, 0.42);
  b.box(ox, 0.43, oz + 0.19, 0.13, 0.13, 0.13);
  b.box(ox, 0.505, oz + 0.27, 0.125, 0.125, 0.14);
  b.use(0, 1);
  b.box(ox, 0.478, oz + 0.37, 0.072, 0.064, 0.09);
  b.box(ox + 0.055, 0.56, oz + 0.24, 0.035, 0.08, 0.05);
  b.box(ox - 0.055, 0.56, oz + 0.24, 0.035, 0.08, 0.05);
  b.use(0, 3, 0, 0.1);
  b.box(ox, 0.497, oz + 0.418, 0.03, 0.026, 0.016);
  b.use(0, 2);
  b.box(ox, 0.45, oz + 0.205, 0.138, 0.032, 0.138);
  // legs
  const legs: [number, number, number][] = [
    [0.05, 0.15, 1],
    [-0.05, -0.15, 1],
    [-0.05, 0.15, 2],
    [0.05, -0.15, 2],
  ];
  for (const [lx, lz, part] of legs) {
    b.pivot(ox + lx, 0.28, oz + lz);
    b.use(part, 0);
    b.box(ox + lx, 0.14, oz + lz, 0.045, 0.28, 0.048);
  }
  // tail
  b.pivot(ox, 0.4, oz - 0.2);
  b.use(3, 0);
  b.boxBetween({ x: ox, y: 0.4, z: oz - 0.2 }, { x: ox, y: 0.53, z: oz - 0.33 }, 0.032, 0.032);
  // leash: unit box along +Z from 0 (hand) to 1 (collar); aPivot.x = 0/1 end flag
  b.use(4, 3, 0, 0.18);
  const w = 0.012;
  {
    const base = b.pos.length / 3;
    // 8 corners: z = 0 or 1 marks the end; x/y are tiny cross-section offsets
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
    const q = (a: number, bb: number, c: number, d: number) => b.quad(base + a, base + bb, base + c, base + d);
    q(0, 4, 5, 1);
    q(1, 5, 6, 2);
    q(2, 6, 7, 3);
    q(3, 7, 4, 0);
  }
  return b.build(true);
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

const PERSON_VERT_PARS = /* glsl */ `
attribute vec3 aInfo;
attribute vec4 iPoseA;
attribute vec4 iPoseB;
attribute vec4 iPoseC;
attribute vec4 iPoseD;
attribute vec4 iColA;
attribute vec4 iColB;
attribute vec4 iColC;
varying float vPedFade;
${COMMON_GLSL}
bool pedHidden() {
  float f = aInfo.z;
  if (f == 0.0) return false;
  int need = int(abs(f) + 0.5);
  int flags = int(iColB.w + 0.5);
  bool has = (flags & need) != 0;
  return f > 0.0 ? !has : has;
}
vec3 pedSlotColor() {
  int slot = int(aInfo.y + 0.5);
  int flags = int(iColB.w + 0.5);
  vec3 skin = pedRGB(iColA.x);
  if (slot == 0) return skin;
  if (slot == 1) return pedRGB(iColA.y);
  if (slot == 2) return pedRGB(iColA.z);
  if (slot == 3) return pedRGB(iColA.w);
  if (slot == 4) return pedRGB(iColB.x);
  if (slot == 5) return pedRGB(iColB.y);
  if (slot == 6) return pedRGB(iColB.z);
  if (slot == 7) return vec3(0.86, 0.85, 0.82);
  if (slot == 8) return vec3(0.035, 0.035, 0.04);
  vec3 legs = (flags & ${F.TIGHTS}) != 0 ? vec3(0.03, 0.03, 0.035) : skin;
  if (slot == 9) return (flags & ${F.SKIRT}) != 0 ? legs : pedRGB(iColA.z);
  if (slot == 10) return (flags & ${F.SKIRT | F.SHORTS}) != 0 ? legs : pedRGB(iColA.z);
  if (slot == 11) return (flags & ${F.SHORTSLEEVE}) != 0 ? skin : pedRGB(iColA.y);
  if (slot == 12) return (flags & ${F.VEST}) != 0 ? pedRGB(iColC.z) : pedRGB(iColA.y);
  if (slot == 13) return pedRGB(iColC.x);
  if (slot == 14) return pedRGB(iColC.y);
  if (slot == 15) return pedRGB(iColC.z);
  return vec3(0.5);
}
void pedPose(inout vec3 p, inout vec3 n) {
  vPedFade = iPoseD.z;
  if (pedHidden()) { p = vec3(0.0); n = vec3(0.0, 1.0, 0.0); return; }
  int part = int(aInfo.x + 0.5);
  float girth = iPoseD.w;
  float armShift = (girth - 1.0) * 0.17;
  #ifdef USE_INSTANCING
    float sc = length(instanceMatrix[0].xyz);
  #else
    float sc = 1.0;
  #endif
  if (part == 0) { p.x *= girth; p.z *= 1.0 + (girth - 1.0) * 0.8; }
  else if (part >= 6 && part <= 9) { p.x += (part <= 7 ? armShift : -armShift); }
  else if (part == 11) { p.x -= armShift; }
  if (part == 1) {
    float hs = clamp(1.0 + (1.0 - sc) * 0.8, 1.0, 1.32);
    vec3 nb = vec3(0.0, ${RIG.neckY.toFixed(3)}, 0.0);
    p = nb + (p - nb) * hs;
    mat3 ry = pedRY(iPoseD.y);
    p = ry * (p - nb) + nb; n = ry * n;
  } else if (part >= 2 && part <= 5) {
    bool left = part <= 3;
    vec3 hp = vec3(left ? ${RIG.legX.toFixed(3)} : -${RIG.legX.toFixed(3)}, ${RIG.hipY.toFixed(3)}, 0.0);
    if (part == 3 || part == 5) {
      vec3 kp = vec3(hp.x, ${RIG.kneeY.toFixed(3)}, 0.0);
      mat3 rk = pedRX(left ? iPoseA.y : iPoseA.w);
      p = rk * (p - kp) + kp; n = rk * n;
    }
    mat3 rh = pedRX(left ? iPoseA.x : iPoseA.z);
    p = rh * (p - hp) + hp; n = rh * n;
  } else if (part >= 6 && part <= 9) {
    bool left = part <= 7;
    float sx = (left ? 1.0 : -1.0) * (0.215 + armShift);
    vec3 sp = vec3(sx, ${RIG.shoulderY.toFixed(3)}, 0.0);
    if (part == 7 || part == 9) {
      vec3 ep = vec3(sx + (left ? 0.007 : -0.007), ${RIG.elbowY.toFixed(3)}, 0.0);
      mat3 re = pedRX(left ? iPoseB.y : iPoseB.w);
      p = re * (p - ep) + ep; n = re * n;
    }
    mat3 rs = pedRZ(left ? iPoseC.x : iPoseC.y) * pedRX(left ? iPoseB.x : iPoseB.z);
    p = rs * (p - sp) + sp; n = rs * n;
  }
  if (part <= 1 || (part >= 6 && part <= 9) || part == 11) {
    mat3 rl = pedRX(iPoseD.x);
    vec3 lp = vec3(0.0, ${RIG.leanY.toFixed(3)}, 0.0);
    p = rl * (p - lp) + lp; n = rl * n;
  }
  if (part != 10) {
    mat3 rb = pedRX(iPoseC.z);
    vec3 bp = vec3(0.0, ${RIG.hipY.toFixed(3)}, 0.0);
    p = rb * (p - bp) + bp; n = rb * n;
    p.y += iPoseC.w;
  }
}
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

export function makePersonMaterials(): PersonMaterials {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPedNight = globalUniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PERSON_VERT_PARS}`)
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vColor.rgb *= pedSlotColor();')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal );\n  vec3 pedP = vec3( position );\n  pedPose( pedP, objectNormal );')
      .replace('#include <begin_vertex>', 'vec3 transformed = pedP;');
    shader.fragmentShader = injectFragmentFade(shader.fragmentShader, 'uniform float uPedNight;\n').replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.07 * uPedNight;',
    );
  };
  material.customProgramCacheKey = () => 'tinyhaven-person-1';

  const depth = new THREE.MeshDepthMaterial();
  depth.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PERSON_VERT_PARS}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3( position );\n  vec3 pedN = vec3( 0.0, 1.0, 0.0 );\n  pedPose( transformed, pedN );');
    shader.fragmentShader = injectFragmentFade(shader.fragmentShader);
  };
  depth.customProgramCacheKey = () => 'tinyhaven-person-depth-1';
  return { material, depth };
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
  bool leg = part == 1 || part == 2;
  if (leg) {
    float swing = 0.55 * iDog.y * sin(iDog.x);
    float a = (part == 1 ? swing : -swing) * (1.0 - sit);
    if (rear) a -= 1.3 * sit;
    mat3 r = pedRX(a);
    p = r * (p - pv) + pv; n = r * n;
  } else if (part == 3) {
    float wag = (0.45 + 0.25 * iDog.y) * sin(uPedTime * 13.0 + iHand.w * 6.28);
    mat3 r = pedRY(wag);
    p = r * (p - pv) + pv; n = r * n;
  }
  if (!(leg && !rear) && sit > 0.001) {
    vec3 sp = o + vec3(0.0, 0.28, 0.15) * size;
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

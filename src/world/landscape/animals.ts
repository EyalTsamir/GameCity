// Near-LOD herd animals (W8): a sheep and a cow built from their parts in real metres — body tubes with
// elliptical sections (hip and pin bones, withers, deep chest, belly), a fleece of overlapping lumps,
// jointed legs (knee forward, hock backward) on hooves, head with muzzle, ears and eyes, udder, tail and
// switch. Faces +z, ground at y 0. Attributes: aMat (material id, see MAT), aBend (0..1 neck-bend weight
// for the grazing pose: linear-blend skinning around the shoulder pivot in the shader).

import * as THREE from 'three';

export const MAT = { coat: 0, skin: 1, hoof: 2, dark: 3, pink: 4, horn: 5, switch: 6 } as const;

interface Ring {
  p: [number, number, number];
  rx: number;
  ry: number;
  /** bend weight at this ring */
  b?: number;
}

class Builder {
  pos: number[] = [];
  mat: number[] = [];
  bend: number[] = [];
  idx: number[] = [];
  private get n() {
    return this.pos.length / 3;
  }
  /** a tube through rings (sections perpendicular to the path), optional closed ends; disp(x,y,z,nx,ny,nz) pushes along the section normal */
  tube(rings: Ring[], seg: number, mat: number, caps: [boolean, boolean], disp?: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number, bend = 0): void {
    const base = this.n;
    const t = new THREE.Vector3(),
      u = new THREE.Vector3(),
      v = new THREE.Vector3(),
      up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < rings.length; i++) {
      const a = rings[Math.max(0, i - 1)].p,
        b = rings[Math.min(rings.length - 1, i + 1)].p;
      t.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      // section frame: u = side (x-ish), v = up-ish
      const ref = Math.abs(t.y) > 0.9 ? v.set(0, 0, 1) : up;
      u.crossVectors(ref, t).normalize();
      if (Math.abs(t.y) > 0.9) u.set(1, 0, 0);
      v.crossVectors(t, u).normalize();
      const r = rings[i];
      for (let s = 0; s < seg; s++) {
        const ang = (s / seg) * Math.PI * 2;
        const ca = Math.cos(ang),
          sa = Math.sin(ang);
        let nx = u.x * ca * r.ry + v.x * sa * r.rx,
          ny = u.y * ca * r.ry + v.y * sa * r.rx,
          nz = u.z * ca * r.ry + v.z * sa * r.rx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl;
        ny /= nl;
        nz /= nl;
        let x = r.p[0] + u.x * ca * r.rx + v.x * sa * r.ry,
          y = r.p[1] + u.y * ca * r.rx + v.y * sa * r.ry,
          z = r.p[2] + u.z * ca * r.rx + v.z * sa * r.ry;
        if (disp) {
          const d = disp(x, y, z, nx, ny, nz);
          x += nx * d;
          y += ny * d;
          z += nz * d;
        }
        this.pos.push(x, y, z);
        this.mat.push(mat);
        this.bend.push(r.b ?? bend);
      }
    }
    for (let i = 0; i < rings.length - 1; i++)
      for (let s = 0; s < seg; s++) {
        const a = base + i * seg + s,
          b = base + i * seg + ((s + 1) % seg),
          c = a + seg,
          d = b + seg;
        this.idx.push(a, b, c, b, d, c);
      }
    const cap = (ri: number, flip: boolean) => {
      const r = rings[ri];
      const c = this.n;
      // the cap centre sits slightly out along the path (a rounded end)
      const o = rings[ri === 0 ? 1 : ri - 1].p;
      const dx = r.p[0] - o[0],
        dy = r.p[1] - o[1],
        dz = r.p[2] - o[2];
      const dl = Math.hypot(dx, dy, dz) || 1,
        k = Math.min(r.rx, r.ry) * 0.6;
      this.pos.push(r.p[0] + (dx / dl) * k, r.p[1] + (dy / dl) * k, r.p[2] + (dz / dl) * k);
      this.mat.push(mat);
      this.bend.push(r.b ?? bend);
      const b0 = base + ri * seg;
      for (let s = 0; s < seg; s++) {
        const a = b0 + s,
          b = b0 + ((s + 1) % seg);
        if (flip) this.idx.push(c, b, a);
        else this.idx.push(c, a, b);
      }
    };
    if (caps[0]) cap(0, true);
    if (caps[1]) cap(rings.length - 1, false);
  }
  /** ellipsoid (lat-long), rotated by yaw about y and pitch about x */
  blob(c: [number, number, number], r: [number, number, number], mat: number, seg = 8, rot: [number, number] = [0, 0], bend = 0, disp?: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number): void {
    const rings: Ring[] = [];
    const rows = Math.max(3, Math.round(seg / 2));
    const cy = Math.cos(rot[0]),
      sy = Math.sin(rot[0]),
      cp = Math.cos(rot[1]),
      sp = Math.sin(rot[1]);
    // a tube along the local z axis with circular-profile radii
    for (let i = 1; i < rows; i++) {
      const a = (i / rows) * Math.PI;
      const lz = -Math.cos(a) * r[2],
        k = Math.sin(a);
      // local (0,0,lz) → pitch (about x) → yaw (about y)
      const y1 = -lz * sp,
        z1 = lz * cp;
      rings.push({ p: [c[0] + z1 * sy, c[1] + y1, c[2] + z1 * cy], rx: r[0] * k, ry: r[1] * k });
    }
    this.tube(rings, seg, mat, [true, true], disp, bend);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.mat, 1));
    g.setAttribute('aBend', new THREE.Float32BufferAttribute(this.bend, 1));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

/** deterministic lumps: smooth max of gaussians around scattered centres (fleece / muscle) */
function lumps(seed: number, n: number, box: [number, number, number, number, number, number], size: [number, number], amp: number) {
  let h = seed * 9301 + 49297;
  const rnd = () => ((h = (h * 9301 + 49297) % 233280) / 233280);
  const cs: number[] = [];
  for (let i = 0; i < n; i++) cs.push(box[0] + rnd() * (box[1] - box[0]), box[2] + rnd() * (box[3] - box[2]), box[4] + rnd() * (box[5] - box[4]), size[0] + rnd() * (size[1] - size[0]));
  return (x: number, y: number, z: number) => {
    let s = 0;
    for (let i = 0; i < cs.length; i += 4) {
      const dx = x - cs[i],
        dy = y - cs[i + 1],
        dz = z - cs[i + 2],
        r = cs[i + 3];
      const e = Math.exp(-(dx * dx + dy * dy + dz * dz) / (r * r));
      s = Math.max(s, e);
    }
    return s * amp;
  };
}

const sym = (f: (sx: number) => void) => {
  f(-1);
  f(1);
};

/** a sheep (~1.3 m long, 0.72 m at the withers in fleece): fleece body, dark or white face and legs */
export function sheepGeometry(): THREE.BufferGeometry {
  const B = new Builder();
  const fleece = lumps(7, 70, [-0.32, 0.32, 0.3, 0.92, -0.62, 0.5], [0.07, 0.12], 0.045);
  const fl2 = lumps(11, 120, [-0.32, 0.32, 0.3, 0.92, -0.62, 0.5], [0.035, 0.06], 0.02);
  const wool = (x: number, y: number, z: number) => fleece(x, y, z) + fl2(x, y, z) - 0.02;
  // body: barrel from the breech to the brisket, fleece hanging low on the flanks
  const body: Ring[] = [];
  const prof: [number, number, number, number][] = [
    // z, centre y, half width, half height
    [-0.6, 0.6, 0.1, 0.12],
    [-0.55, 0.6, 0.2, 0.22],
    [-0.45, 0.61, 0.27, 0.27],
    [-0.3, 0.62, 0.3, 0.29],
    [-0.1, 0.61, 0.31, 0.3],
    [0.1, 0.62, 0.3, 0.29],
    [0.25, 0.64, 0.27, 0.27],
    [0.36, 0.67, 0.21, 0.23],
    [0.43, 0.7, 0.14, 0.17],
  ];
  for (const [z, y, rx, ry] of prof) body.push({ p: [0, y, z], rx, ry, b: 0 });
  B.tube(body, 22, MAT.coat, [true, false], wool);
  // neck (fleece) into the head — bends when grazing
  B.tube(
    [
      { p: [0, 0.68, 0.36], rx: 0.17, ry: 0.19, b: 0 },
      { p: [0, 0.71, 0.46], rx: 0.13, ry: 0.15, b: 0.5 },
      { p: [0, 0.73, 0.52], rx: 0.1, ry: 0.12, b: 1 },
    ],
    14,
    MAT.coat,
    [false, true],
    (x, y, z) => fl2(x, y, z) * 1.2,
  );
  // head: poll → long face → muzzle (bare skin)
  B.tube(
    [
      { p: [0, 0.77, 0.5], rx: 0.065, ry: 0.07 },
      { p: [0, 0.76, 0.55], rx: 0.075, ry: 0.085 },
      { p: [0, 0.71, 0.63], rx: 0.06, ry: 0.07 },
      { p: [0, 0.65, 0.7], rx: 0.045, ry: 0.05 },
      { p: [0, 0.62, 0.73], rx: 0.035, ry: 0.035 },
    ],
    12,
    MAT.skin,
    [true, true],
    undefined,
    1,
  );
  B.blob([0, 0.615, 0.735], [0.03, 0.022, 0.012], MAT.dark, 8, [0, 0], 1); // nose
  B.blob([0, 0.79, 0.53], [0.07, 0.035, 0.06], MAT.coat, 10, [0, 0], 1, (x, y, z) => fl2(x, y, z) * 0.8); // poll wool cap
  sym((sx) => {
    B.blob([sx * 0.11, 0.76, 0.54], [0.065, 0.016, 0.03], MAT.skin, 8, [sx * 1.35, -0.2], 1); // ear, out sideways
    B.blob([sx * 0.062, 0.745, 0.585], [0.012, 0.014, 0.012], MAT.dark, 6, [0, 0], 1); // eye
  });
  // legs: forelegs straight with the knee, hind legs with the hock behind; bare skin below the fleece
  sym((sx) => {
    const x = sx * 0.14;
    B.tube(
      [
        { p: [x, 0.5, 0.26], rx: 0.045, ry: 0.05 },
        { p: [x, 0.33, 0.27], rx: 0.032, ry: 0.035 },
        { p: [x, 0.25, 0.275], rx: 0.036, ry: 0.038 }, // knee
        { p: [x, 0.16, 0.27], rx: 0.024, ry: 0.026 },
        { p: [x, 0.06, 0.28], rx: 0.026, ry: 0.028 }, // fetlock
        { p: [x, 0.035, 0.29], rx: 0.024, ry: 0.024 },
      ],
      8,
      MAT.skin,
      [false, false],
    );
    B.blob([x, 0.02, 0.297], [0.026, 0.022, 0.034], MAT.hoof, 8);
    const xh = sx * 0.15;
    B.tube(
      [
        { p: [xh, 0.55, -0.42], rx: 0.07, ry: 0.08 },
        { p: [xh, 0.4, -0.45], rx: 0.045, ry: 0.05 },
        { p: [xh, 0.29, -0.5], rx: 0.03, ry: 0.034 }, // hock
        { p: [xh, 0.17, -0.46], rx: 0.024, ry: 0.026 },
        { p: [xh, 0.06, -0.44], rx: 0.026, ry: 0.028 },
        { p: [xh, 0.035, -0.43], rx: 0.024, ry: 0.024 },
      ],
      8,
      MAT.skin,
      [false, false],
    );
    B.blob([xh, 0.02, -0.423], [0.026, 0.022, 0.034], MAT.hoof, 8);
  });
  // docked tail: a woolly stub under the breech
  B.blob([0, 0.62, -0.62], [0.045, 0.08, 0.04], MAT.coat, 8, [0, -0.4], 0, (x, y, z) => fl2(x, y, z));
  return B.geometry();
}

/** a dairy / beef cow (~2.3 m long, 1.4 m at the withers): bony hips and pins, withers, deep chest, udder */
export function cowGeometry(): THREE.BufferGeometry {
  const B = new Builder();
  // skeleton under the hide: hook (hip) bones, pin bones, spine, shoulder blades, ribs
  const bumps: [number, number, number, number, number][] = [];
  sym((sx) => {
    bumps.push([sx * 0.27, 1.33, -0.58, 0.09, 0.05]); // hooks
    bumps.push([sx * 0.13, 1.3, -0.98, 0.06, 0.04]); // pins
    bumps.push([sx * 0.24, 1.22, 0.5, 0.16, 0.025]); // shoulder blade
    bumps.push([sx * 0.33, 0.95, 0.0, 0.25, -0.02]); // flank hollow
  });
  bumps.push([0, 1.42, 0.45, 0.14, 0.04]); // withers
  const bones = (x: number, y: number, z: number) => {
    let s = 0;
    for (const [bx, by, bz, r, a] of bumps) {
      const d2 = (x - bx) ** 2 + (y - by) ** 2 + (z - bz) ** 2;
      s += a * Math.exp(-d2 / (r * r));
    }
    // ribs: faint ridges on the barrel
    if (z > -0.35 && z < 0.35 && Math.abs(x) > 0.2) s += 0.004 * Math.sin(z * 55);
    return s;
  };
  const body: Ring[] = [];
  // z, centre y, half width, half height — rump (flat top) → barrel (deep, wide) → chest → neck root
  const prof: [number, number, number, number][] = [
    [-1.04, 1.15, 0.1, 0.16],
    [-0.99, 1.12, 0.19, 0.24],
    [-0.88, 1.1, 0.25, 0.3],
    [-0.7, 1.06, 0.29, 0.34],
    [-0.45, 1.02, 0.33, 0.39],
    [-0.15, 0.99, 0.37, 0.43],
    [0.15, 1.0, 0.36, 0.43],
    [0.4, 1.04, 0.31, 0.42],
    [0.58, 1.1, 0.24, 0.37],
    [0.7, 1.15, 0.18, 0.31],
  ];
  for (const [z, y, rx, ry] of prof) body.push({ p: [0, y, z], rx, ry, b: 0 });
  B.tube(body, 26, MAT.coat, [true, false], bones);
  // neck with the dewlap below, bending at the shoulder
  B.tube(
    [
      { p: [0, 1.16, 0.62], rx: 0.2, ry: 0.32, b: 0 },
      { p: [0, 1.2, 0.8], rx: 0.15, ry: 0.27, b: 0.4 },
      { p: [0, 1.24, 0.95], rx: 0.12, ry: 0.2, b: 0.85 },
      { p: [0, 1.27, 1.04], rx: 0.11, ry: 0.15, b: 1 },
    ],
    18,
    MAT.coat,
    [false, false],
    (x, y, z) => (y < 1.05 ? 0.02 * Math.max(0, 1 - Math.abs(z - 0.85) / 0.3) : 0),
  );
  // head: poll (wide, with the forehead flat) → face → muzzle
  B.tube(
    [
      { p: [0, 1.34, 1.02], rx: 0.1, ry: 0.07 },
      { p: [0, 1.3, 1.07], rx: 0.13, ry: 0.13 },
      { p: [0, 1.2, 1.2], rx: 0.115, ry: 0.13 },
      { p: [0, 1.08, 1.33], rx: 0.085, ry: 0.1 },
      { p: [0, 1.0, 1.42], rx: 0.085, ry: 0.085 },
      { p: [0, 0.96, 1.47], rx: 0.07, ry: 0.06 },
    ],
    16,
    MAT.coat,
    [true, true],
    undefined,
    1,
  );
  B.blob([0, 0.965, 1.48], [0.075, 0.05, 0.03], MAT.pink, 10, [0, 0.5], 1); // muzzle pad
  sym((sx) => {
    B.blob([sx * 0.2, 1.3, 1.06], [0.1, 0.025, 0.05], MAT.coat, 8, [sx * 1.4, -0.25], 1); // ear
    B.blob([sx * 0.115, 1.25, 1.14], [0.022, 0.026, 0.022], MAT.dark, 6, [0, 0], 1); // eye
    B.blob([sx * 0.1, 1.38, 1.05], [0.025, 0.018, 0.018], MAT.horn, 6, [sx * 1.2, 0.3], 1); // horn buds
  });
  // legs: foreleg straight (knee), hind leg angled (stifle → hock → cannon); hooves split in two claws
  sym((sx) => {
    const x = sx * 0.21;
    B.tube(
      [
        { p: [x, 0.95, 0.42], rx: 0.11, ry: 0.13 },
        { p: [x, 0.7, 0.44], rx: 0.075, ry: 0.085 },
        { p: [x, 0.47, 0.45], rx: 0.065, ry: 0.07 },
        { p: [x, 0.42, 0.455], rx: 0.07, ry: 0.075 }, // knee
        { p: [x, 0.3, 0.45], rx: 0.048, ry: 0.052 },
        { p: [x, 0.13, 0.46], rx: 0.045, ry: 0.05 },
        { p: [x, 0.09, 0.47], rx: 0.055, ry: 0.06 }, // fetlock
        { p: [x, 0.06, 0.48], rx: 0.05, ry: 0.05 },
      ],
      10,
      MAT.coat,
      [false, false],
    );
    for (const cx of [-0.026, 0.026]) B.blob([x + cx, 0.03, 0.5], [0.028, 0.03, 0.055], MAT.hoof, 8);
    const xh = sx * 0.2;
    B.tube(
      [
        { p: [xh, 1.05, -0.6], rx: 0.13, ry: 0.17 },
        { p: [xh, 0.8, -0.66], rx: 0.11, ry: 0.13 }, // gaskin
        { p: [xh, 0.58, -0.78], rx: 0.06, ry: 0.075 },
        { p: [xh, 0.5, -0.82], rx: 0.055, ry: 0.07 }, // hock
        { p: [xh, 0.35, -0.76], rx: 0.045, ry: 0.05 },
        { p: [xh, 0.13, -0.71], rx: 0.044, ry: 0.048 },
        { p: [xh, 0.09, -0.7], rx: 0.054, ry: 0.058 },
        { p: [xh, 0.06, -0.69], rx: 0.05, ry: 0.05 },
      ],
      10,
      MAT.coat,
      [false, false],
    );
    for (const cx of [-0.026, 0.026]) B.blob([xh + cx, 0.03, -0.67], [0.028, 0.03, 0.055], MAT.hoof, 8);
  });
  // udder with four teats, between the hind legs
  B.blob([0, 0.66, -0.52], [0.15, 0.13, 0.2], MAT.pink, 14);
  sym((sx) => {
    for (const z of [-0.43, -0.62]) B.tube([{ p: [sx * 0.07, 0.56, z], rx: 0.016, ry: 0.016 }, { p: [sx * 0.07, 0.49, z], rx: 0.013, ry: 0.013 }], 6, MAT.pink, [false, true]);
  });
  // tail from the tail head between the pins, hanging to the hocks, with a dark switch
  B.tube(
    [
      { p: [0, 1.3, -1.0], rx: 0.04, ry: 0.045 },
      { p: [0, 1.22, -1.07], rx: 0.03, ry: 0.03 },
      { p: [0, 0.95, -1.09], rx: 0.02, ry: 0.02 },
      { p: [0, 0.62, -1.07], rx: 0.016, ry: 0.016 },
    ],
    6,
    MAT.coat,
    [false, false],
  );
  B.blob([0, 0.5, -1.065], [0.045, 0.14, 0.04], MAT.switch, 8);
  return B.geometry();
}

/** shared pose functions (coarse herd, near models, near shadow): instance iB = (species 0 cow / 1 sheep, tint, phase, size) */
export const POSE_GLSL = /* glsl */ `
float herdLying(vec4 b) { return step(fract(b.z * 91.7), b.x > 0.5 ? 0.16 : 0.2); }
// grazing: the head goes down to the grass most of the time, comes up now and then
float herdGraze(vec4 b) { float t = uTime * 0.35 + b.z * 37.0; return smoothstep(-0.3, 0.3, sin(t) + 0.4 * sin(t * 2.7 + 1.0)); }
// lying down: everything above the belly drops by L, the legs fold into the bottom c metres
float herdLie(float y, float L, float c) { float a = L + c; return y <= a ? y * (c / a) : y - L; }
`;

const NEAR_VS = /* glsl */ `
vec3 herdNear(vec3 p, float bendW) {
  bool sheep = iB.x > 0.5;
  float size = iB.w;
  float lie = herdLying(iB);
  float down = lie > 0.5 ? 0.0 : herdGraze(iB);
  // neck bend about the shoulder: down to the grass (pitch) and a little to one side (yaw)
  vec3 pv = sheep ? vec3(0.0, 0.66, 0.34) : vec3(0.0, 1.16, 0.58);
  float th = down * (sheep ? 1.2 : 1.12) - (lie > 0.5 ? 0.1 : 0.0);
  float ps = (fract(iB.z * 13.1) - 0.5) * (0.5 + 0.9 * (1.0 - down)) + 0.12 * sin(uTime * 0.21 + iB.z * 17.0) * (1.0 - down);
  vec3 q = p - pv;
  float ct = cos(th), st = sin(th);
  q = vec3(q.x, ct * q.y - st * q.z, st * q.y + ct * q.z);
  float cy = cos(ps), sy = sin(ps);
  q = vec3(cy * q.x + sy * q.z, q.y, -sy * q.x + cy * q.z);
  p = mix(p, q + pv, bendW);
  if (lie > 0.5) {
    float L = sheep ? 0.3 : 0.52;
    float c = sheep ? 0.05 : 0.08;
    // legs tuck in under the body as they fold
    float k = 1.0 - smoothstep(0.0, L + c, p.y);
    p.x *= 1.0 + 0.6 * k;
    p.y = herdLie(p.y, L, c);
  }
  return p * size;
}
`;

const NOISE_GLSL = /* glsl */ `
float hnHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hnNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hnHash(i), hnHash(i + vec3(1, 0, 0)), f.x), mix(hnHash(i + vec3(0, 1, 0)), hnHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hnHash(i + vec3(0, 0, 1)), hnHash(i + vec3(1, 0, 1)), f.x), mix(hnHash(i + vec3(0, 1, 1)), hnHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

export interface NearHerd {
  mesh: THREE.Mesh;
  cap: number;
  a: Float32Array;
  b: Float32Array;
  aAttr: THREE.InstancedBufferAttribute;
  bAttr: THREE.InstancedBufferAttribute;
}

/** an instanced near-LOD mesh of one species (capacity `cap`), filled by the caller each selection */
export function createNearHerd(geo: THREE.BufferGeometry, cap: number, species: number, uniforms: Record<string, THREE.IUniform>, fog: boolean): NearHerd {
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = geo.index;
  for (const k of ['position', 'normal', 'aMat', 'aBend']) ig.setAttribute(k, geo.getAttribute(k));
  const a = new Float32Array(cap * 4),
    b = new Float32Array(cap * 4);
  const aAttr = new THREE.InstancedBufferAttribute(a, 4),
    bAttr = new THREE.InstancedBufferAttribute(b, 4);
  aAttr.setUsage(THREE.DynamicDrawUsage);
  bAttr.setUsage(THREE.DynamicDrawUsage);
  ig.setAttribute('iA', aAttr);
  ig.setAttribute('iB', bAttr);
  ig.instanceCount = cap;
  const head = `#include <common>
attribute vec4 iA;
attribute vec4 iB;
attribute float aMat;
attribute float aBend;
uniform float uTime;
${POSE_GLSL}
${NEAR_VS}`;
  const place = `vec3 transformed = herdNear(position, aBend);
{ float c = cos(iA.w), s = sin(iA.w); transformed = vec3(c * transformed.x + s * transformed.z, transformed.y, -s * transformed.x + c * transformed.z) + iA.xyz; }`;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, fog });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `${head}\nvarying vec3 vObj;\nvarying float vMat;\nvarying vec4 vIB;`)
      .replace('#include <begin_vertex>', `${place}\nvObj = position; vMat = aMat; vIB = iB;`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
{ // the neck bend rotates the normals too (approximately: the full rotation where aBend > 0.5)
  bool sheep = iB.x > 0.5; float lie = herdLying(iB); float down = lie > 0.5 ? 0.0 : herdGraze(iB);
  float th = (down * (sheep ? 1.2 : 1.12) - (lie > 0.5 ? 0.1 : 0.0)) * aBend;
  float ct = cos(th), st = sin(th);
  objectNormal = vec3(objectNormal.x, ct * objectNormal.y - st * objectNormal.z, st * objectNormal.y + ct * objectNormal.z);
  float c = cos(iA.w), s = sin(iA.w); objectNormal = vec3(c * objectNormal.x + s * objectNormal.z, objectNormal.y, -s * objectNormal.x + c * objectNormal.z); }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObj;\nvarying float vMat;\nvarying vec4 vIB;\nfloat gHerdBump;\n${NOISE_GLSL}`)
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec3 hc;
float hRough = 0.9;
{
  bool sheep = vIB.x > 0.5;
  float tint = vIB.y, ph = vIB.z;
  int m = int(vMat + 0.5);
  vec3 o = vObj;
  float y = o.y;
  float grime = 1.0 - smoothstep(0.02, sheep ? 0.22 : 0.35, y);       // mud on the feet
  if (sheep) {
    // fleece: staples in clumps (two scales of noise), cream with a grey-brown dirty underside and breech
    float n1 = hnNoise(o * 34.0 + ph * 50.0), n2 = hnNoise(o * 95.0 + ph * 20.0);
    float fl = n1 * 0.65 + n2 * 0.35;
    gHerdBump = m == 0 ? fl * 0.012 : 0.0;
    vec3 wool = vec3(0.74, 0.7, 0.6) * (0.9 + 0.16 * fract(ph * 13.7));
    wool = mix(wool, vec3(0.42, 0.38, 0.31), smoothstep(0.62, 0.34, y) * 0.75 + smoothstep(-0.5, -0.64, o.z) * 0.4);
    wool *= 0.72 + 0.4 * fl;
    bool blackSheep = tint > 0.95;
    if (blackSheep) wool *= vec3(0.16, 0.14, 0.13);
    // faces: black (Suffolk-like) on a third, mottled white-tan otherwise
    vec3 face = tint < 0.35 ? vec3(0.035, 0.03, 0.028) : vec3(0.55, 0.47, 0.4) * (0.85 + 0.3 * hnNoise(o * 40.0));
    if (blackSheep) face = vec3(0.03);
    hc = m == 0 ? wool : m == 1 ? face : m == 2 ? vec3(0.06, 0.05, 0.045) : vec3(0.01);
    hRough = m == 3 ? 0.35 : m == 2 ? 0.6 : 1.0;
  } else {
    // hide: Holstein black on white with soft-edged patches, else solid brown / black / red
    float pn = hnNoise(o * 2.3 + ph * 31.0) * 0.7 + hnNoise(o * 6.0 + ph * 7.0) * 0.3;
    float pmask = smoothstep(0.47, 0.53, pn);
    vec3 coat = tint < 0.28 ? vec3(0.16, 0.09, 0.05) : tint < 0.5 ? vec3(0.025, 0.022, 0.02)
      : tint < 0.75 ? mix(vec3(0.025, 0.022, 0.02), vec3(0.7, 0.68, 0.63), pmask) : vec3(0.3, 0.12, 0.05);
    // short hair: a fine directional sheen along the body
    float hair = hnNoise(vec3(o.x * 140.0, o.y * 140.0, o.z * 25.0));
    coat *= 0.88 + 0.22 * hair;
    gHerdBump = m == 0 ? hair * 0.0012 : 0.0;
    bool dark = tint >= 0.28 && tint < 0.5;
    hc = m == 0 ? coat : m == 2 ? vec3(0.05, 0.04, 0.035) : m == 3 ? vec3(0.008) : m == 4 ? (dark ? vec3(0.09, 0.07, 0.07) : vec3(0.55, 0.36, 0.33)) : m == 5 ? vec3(0.55, 0.5, 0.42) : coat * (tint < 0.75 && tint >= 0.5 ? 1.0 : 0.6);
    hRough = m == 3 ? 0.3 : m == 4 ? 0.55 : m == 5 ? 0.5 : 0.85;
  }
  hc = mix(hc, vec3(0.13, 0.1, 0.07), grime * 0.75);
}
vec4 diffuseColor = vec4( hc, opacity );`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = hRough;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{ // fleece / hair relief (bump from the procedural height)
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(gHerdBump) * r1 + dFdy(gHerdBump) * r2);
  normal = normalize(abs(det) * normal - g);
}`,
      );
  };
  mat.customProgramCacheKey = () => 'th-nearherd-v1-' + species;
  const mesh = new THREE.Mesh(ig, mat);
  mesh.name = species ? 'land-sheep-near' : 'land-cows-near';
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', head).replace('#include <begin_vertex>', place);
  };
  depth.customProgramCacheKey = () => 'th-nearherd-depth-' + species;
  mesh.customDepthMaterial = depth;
  return { mesh, cap, a, b, aAttr, bAttr };
}

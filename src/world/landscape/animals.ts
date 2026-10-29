// Near-LOD herd animals (W8): a sheep and a cow built from their parts in real metres — body tubes with
// elliptical sections (hip and pin bones, withers, deep chest, belly), a fleece of overlapping lumps,
// jointed legs (knee forward, hock backward) on hooves, head with muzzle, ears and eyes, udder, tail and
// switch. Faces +z, ground at y 0. Attributes: aMat (material id, see MAT), aBend (0..1 neck-bend weight
// for the grazing pose: linear-blend skinning around the shoulder pivot in the shader).

import * as THREE from 'three';

export const MAT = { coat: 0, skin: 1, hoof: 2, dark: 3, pink: 4, horn: 5, switch: 6, longhorn: 7 } as const;

interface Ring {
  p: [number, number, number];
  rx: number;
  ry: number;
  /** bend weight at this ring */
  b?: number;
  /** section squareness: 1 = ellipse, < 1 boxier (superellipse) */
  e?: number;
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
        const e = r.e ?? 1;
        const c0 = Math.cos(ang),
          s0 = Math.sin(ang);
        const ca = Math.sign(c0) * Math.abs(c0) ** e,
          sa = Math.sign(s0) * Math.abs(s0) ** e;
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

/** rings resampled to `per` sub-steps between each pair (smooth Catmull-Rom on centre and radii): dense enough to carry fleece lumps */
function densify(rings: Ring[], per: number): Ring[] {
  const out: Ring[] = [];
  const cr = (a: number, b: number, c: number, d: number, t: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[Math.max(0, i - 1)], b = rings[i], c = rings[i + 1], d = rings[Math.min(rings.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      out.push({
        p: [0, 1, 2].map((j) => cr(a.p[j], b.p[j], c.p[j], d.p[j], t)) as [number, number, number],
        rx: cr(a.rx, b.rx, c.rx, d.rx, t),
        ry: cr(a.ry, b.ry, c.ry, d.ry, t),
        b: b.b,
        e: b.e,
      });
    }
  }
  out.push(rings[rings.length - 1]);
  return out;
}

const sym = (f: (sx: number) => void) => {
  f(-1);
  f(1);
};

/** a sheep (~1.3 m long, 0.72 m at the withers in fleece): fleece body, dark or white face and legs */
export function sheepGeometry(): THREE.BufferGeometry {
  const B = new Builder();
  // fleece in clumps: cushions of staples (max of gaussians → rounded locks with crevices between),
  // a second finer scale on top; the edges (flanks, breech, belly fringe) hang ragged
  const fleece = lumps(7, 110, [-0.34, 0.34, 0.28, 0.94, -0.64, 0.5], [0.06, 0.1], 0.06);
  const fl2 = lumps(11, 260, [-0.34, 0.34, 0.28, 0.94, -0.64, 0.5], [0.025, 0.045], 0.026);
  const wool = (x: number, y: number, z: number) => fleece(x, y, z) + fl2(x, y, z) - 0.03 + (y < 0.42 ? 0.02 * Math.sin(x * 61 + z * 47) * Math.sin(z * 33) : 0);
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
  B.tube(densify(body, 3), 40, MAT.coat, [true, false], wool);
  // neck (fleece) into the head — bends when grazing
  B.tube(
    [
      { p: [0, 0.68, 0.36], rx: 0.17, ry: 0.19, b: 0 },
      { p: [0, 0.71, 0.46], rx: 0.13, ry: 0.15, b: 0.5 },
      { p: [0, 0.73, 0.52], rx: 0.1, ry: 0.12, b: 1 },
    ],
    24,
    MAT.coat,
    [false, true],
    (x, y, z) => fleece(x, y, z) * 0.5 + fl2(x, y, z) * 1.2 - 0.015,
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
        { p: [x, 0.33, 0.27], rx: 0.03, ry: 0.033 },
        { p: [x, 0.27, 0.272], rx: 0.036, ry: 0.04 },
        { p: [x, 0.235, 0.278], rx: 0.038, ry: 0.043 }, // knee
        { p: [x, 0.2, 0.272], rx: 0.026, ry: 0.028 },
        { p: [x, 0.14, 0.27], rx: 0.022, ry: 0.024 },
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
        { p: [xh, 0.29, -0.5], rx: 0.032, ry: 0.042 }, // hock
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
  // a dairy cow (Holstein-sized: 1.45 m at the withers, chest floor at ~0.66 so the legs are half the height,
  // 1.7 m from the point of the shoulder to the pins). Skeleton under the hide: hook (hip) bones standing
  // out at the corners of the flat loin, pin bones either side of the tail head, the hollow (thurl) between
  // them, shoulder blades, withers, the paralumbar hollow in front of the hooks, ribs.
  const bumps: [number, number, number, number, number][] = [];
  sym((sx) => {
    bumps.push([sx * 0.27, 1.4, -0.52, 0.085, 0.1]); // hooks
    bumps.push([sx * 0.12, 1.37, -0.98, 0.06, 0.075]); // pins
    bumps.push([sx * 0.22, 1.28, -0.78, 0.1, -0.035]); // thurl hollow between hook and pin
    bumps.push([sx * 0.3, 1.18, -0.32, 0.13, -0.045]); // paralumbar hollow
    bumps.push([sx * 0.28, 0.98, -0.8, 0.16, 0.03]); // thigh
    bumps.push([sx * 0.26, 1.25, 0.46, 0.16, 0.03]); // shoulder blade
    bumps.push([sx * 0.27, 0.86, 0.5, 0.12, 0.03]); // point of the elbow / forearm muscle
  });
  bumps.push([0, 1.47, 0.42, 0.13, 0.04]); // withers
  bumps.push([0, 1.44, -1.02, 0.06, 0.035]); // tail head
  const bones = (x: number, y: number, z: number) => {
    let s = 0;
    for (const [bx, by, bz, r, a] of bumps) {
      const d2 = (x - bx) ** 2 + (y - by) ** 2 + (z - bz) ** 2;
      s += a * Math.exp(-d2 / (r * r));
    }
    // spine: a narrow ridge along the top line
    if (y > 1.35 && Math.abs(x) < 0.12) s += 0.016 * Math.exp(-(x * x) / 0.002);
    // ribs: faint ridges on the barrel
    if (z > -0.25 && z < 0.35 && Math.abs(x) > 0.2 && y < 1.3) s += 0.005 * Math.sin(z * 50);
    return s;
  };
  const body: Ring[] = [];
  // z, top, bottom, half width: pins → rump (flat, square) → hooks → flank fold rising to the stifle →
  // deep barrel → chest → brisket between the forelegs → neck root
  const prof: [number, number, number, number][] = [
    [-1.07, 1.4, 1.2, 0.09],
    [-1.01, 1.44, 1.02, 0.17],
    [-0.9, 1.46, 0.94, 0.24],
    [-0.72, 1.47, 0.93, 0.28],
    [-0.52, 1.48, 0.88, 0.31],
    [-0.28, 1.45, 0.72, 0.36],
    [-0.02, 1.44, 0.63, 0.38],
    [0.24, 1.45, 0.64, 0.36],
    [0.44, 1.48, 0.67, 0.3],
    [0.6, 1.43, 0.72, 0.24],
    [0.7, 1.36, 0.84, 0.19],
  ];
  // rump and loin boxy (a dairy cow's flat, angular back end), the barrel rounder
  prof.forEach(([z, t, bo, rx]) => body.push({ p: [0, (t + bo) / 2, z], rx, ry: (t - bo) / 2, b: 0, e: z < -0.45 ? 0.6 : z < 0.3 ? 0.82 : 0.9 }));
  B.tube(body, 28, MAT.coat, [true, false], bones);
  // a long neck rising to the head, the dewlap hanging below it
  B.tube(
    [
      { p: [0, 1.12, 0.6], rx: 0.2, ry: 0.32, b: 0 },
      { p: [0, 1.19, 0.86], rx: 0.15, ry: 0.25, b: 0.4 },
      { p: [0, 1.27, 1.08], rx: 0.12, ry: 0.19, b: 0.85 },
      { p: [0, 1.33, 1.22], rx: 0.11, ry: 0.16, b: 1 },
    ],
    18,
    MAT.coat,
    [false, false],
    (x, y, z) => (y < 1.04 ? 0.05 * Math.max(0, 1 - Math.abs(z - 0.8) / 0.28) : 0),
  );
  // head (0.6 m): a wide poll and flat forehead → long face → a broad, square muzzle; the jaw below
  B.tube(
    [
      { p: [0, 1.52, 1.2], rx: 0.1, ry: 0.07 },
      { p: [0, 1.48, 1.25], rx: 0.16, ry: 0.15 },
      { p: [0, 1.35, 1.4], rx: 0.135, ry: 0.16 },
      { p: [0, 1.2, 1.56], rx: 0.1, ry: 0.13 },
      { p: [0, 1.1, 1.67], rx: 0.11, ry: 0.115 },
      { p: [0, 1.04, 1.73], rx: 0.1, ry: 0.08 },
    ],
    16,
    MAT.coat,
    [true, true],
    undefined,
    1,
  );
  B.blob([0, 1.22, 1.42], [0.1, 0.08, 0.17], MAT.coat, 10, [0, 0.8], 1); // jaw
  B.blob([0, 1.04, 1.755], [0.1, 0.07, 0.03], MAT.pink, 10, [0, 0.6], 1); // muzzle pad
  sym((sx) => {
    B.blob([sx * 0.045, 1.07, 1.77], [0.022, 0.016, 0.012], MAT.dark, 6, [0, 0.6], 1); // nostril
    B.blob([sx * 0.25, 1.44, 1.25], [0.065, 0.022, 0.125], MAT.coat, 10, [sx * 1.45, 0.3], 1); // ear, out sideways
    B.blob([sx * 0.14, 1.38, 1.33], [0.028, 0.032, 0.028], MAT.dark, 6, [0, 0], 1); // eye
    B.blob([sx * 0.11, 1.55, 1.2], [0.03, 0.022, 0.022], MAT.horn, 6, [sx * 1.2, 0.3], 1); // horn buds
    // long horns (Highland only: collapsed into the poll on the other breeds in the vertex shader)
    B.tube(
      [
        { p: [sx * 0.1, 1.53, 1.21], rx: 0.04, ry: 0.04 },
        { p: [sx * 0.3, 1.53, 1.2], rx: 0.032, ry: 0.032 },
        { p: [sx * 0.48, 1.58, 1.22], rx: 0.024, ry: 0.024 },
        { p: [sx * 0.58, 1.7, 1.27], rx: 0.014, ry: 0.014 },
        { p: [sx * 0.6, 1.78, 1.3], rx: 0.004, ry: 0.004 },
      ],
      7,
      MAT.longhorn,
      [true, true],
      undefined,
      1,
    );
  });
  // legs: foreleg straight (knee), hind leg angled (stifle → hock → cannon); hooves split in two claws
  sym((sx) => {
    const x = sx * 0.21;
    B.tube(
      [
        { p: [x, 0.98, 0.44], rx: 0.1, ry: 0.13 },
        { p: [x, 0.74, 0.45], rx: 0.07, ry: 0.085 },
        { p: [x, 0.48, 0.46], rx: 0.058, ry: 0.065 },
        { p: [x, 0.42, 0.465], rx: 0.065, ry: 0.072 }, // knee
        { p: [x, 0.3, 0.46], rx: 0.045, ry: 0.05 },
        { p: [x, 0.13, 0.47], rx: 0.043, ry: 0.048 },
        { p: [x, 0.09, 0.48], rx: 0.053, ry: 0.058 }, // fetlock
        { p: [x, 0.06, 0.49], rx: 0.05, ry: 0.05 },
      ],
      10,
      MAT.coat,
      [false, false],
    );
    for (const cx of [-0.026, 0.026]) B.blob([x + cx, 0.03, 0.51], [0.028, 0.03, 0.055], MAT.hoof, 8);
    const xh = sx * 0.2;
    B.tube(
      [
        { p: [xh, 1.15, -0.74], rx: 0.13, ry: 0.22 },
        { p: [xh, 0.88, -0.66], rx: 0.1, ry: 0.15 }, // stifle
        { p: [xh, 0.68, -0.75], rx: 0.065, ry: 0.09 }, // gaskin
        { p: [xh, 0.52, -0.84], rx: 0.055, ry: 0.075 }, // hock
        { p: [xh, 0.36, -0.79], rx: 0.044, ry: 0.05 },
        { p: [xh, 0.13, -0.74], rx: 0.043, ry: 0.047 },
        { p: [xh, 0.09, -0.73], rx: 0.053, ry: 0.057 },
        { p: [xh, 0.06, -0.72], rx: 0.05, ry: 0.05 },
      ],
      10,
      MAT.coat,
      [false, false],
    );
    for (const cx of [-0.026, 0.026]) B.blob([xh + cx, 0.03, -0.7], [0.028, 0.03, 0.055], MAT.hoof, 8);
  });
  // udder with four teats, between and in front of the hind legs
  B.blob([0, 0.68, -0.56], [0.15, 0.13, 0.2], MAT.pink, 14);
  sym((sx) => {
    for (const z of [-0.47, -0.66]) B.tube([{ p: [sx * 0.07, 0.58, z], rx: 0.016, ry: 0.016 }, { p: [sx * 0.07, 0.51, z], rx: 0.013, ry: 0.013 }], 6, MAT.pink, [false, true]);
  });
  // tail from the tail head between the pins, hanging to the hocks, with a long switch
  B.tube(
    [
      { p: [0, 1.43, -1.0], rx: 0.04, ry: 0.045 },
      { p: [0, 1.37, -1.08], rx: 0.03, ry: 0.03 },
      { p: [0, 1.1, -1.11], rx: 0.021, ry: 0.021 },
      { p: [0, 0.72, -1.09], rx: 0.016, ry: 0.016 },
    ],
    6,
    MAT.coat,
    [false, false],
  );
  B.blob([0, 0.56, -1.085], [0.05, 0.17, 0.045], MAT.switch, 8);
  return B.geometry();
}

/** shared pose functions (coarse herd, near models, near shadow): instance iB = (species 0 cow / 1 sheep, tint, phase, size) */
// cattle breed from the tint: 0 Holstein (black/white), 1 Brown Swiss, 2 red, 3 black (Angus), 4 Highland
const BREED_GLSL = /* glsl */ `float herdBreed(float t) { return t < 0.45 ? 0.0 : t < 0.62 ? 1.0 : t < 0.78 ? 2.0 : t < 0.88 ? 3.0 : 4.0; }`;

export const POSE_GLSL = /* glsl */ `
float herdLying(vec4 b) { return step(fract(b.z * 91.7), b.x > 0.5 ? 0.16 : 0.2); }
// grazing: the head goes down to the grass most of the time, comes up now and then
float herdGraze(vec4 b) { float t = uTime * 0.35 + b.z * 37.0; return smoothstep(-0.3, 0.3, sin(t) + 0.4 * sin(t * 2.7 + 1.0)); }
// lying down: everything above the belly drops by L, the legs fold into the bottom c metres
float herdLie(float y, float L, float c) { float a = L + c; return y <= a ? y * (c / a) : y - L; }
${BREED_GLSL}`;

const NEAR_VS = /* glsl */ `
vec3 herdNear(vec3 p, float bendW, vec3 nrm, float mat) {
  bool sheep = iB.x > 0.5;
  float size = iB.w;
  bool highland = !sheep && herdBreed(iB.y) > 3.5;
  if (!sheep) {
    // long horns only on the Highlanders; their long shaggy coat hangs off the body and the forelock over the eyes
    if (mat > 6.5 && !highland) p = vec3(sign(p.x) * 0.1, 1.53, 1.21);
    if (highland && mat < 0.5) {
      float sh = 0.5 + 0.5 * sin(p.x * 37.0 + p.z * 23.0) * sin(p.y * 41.0 - p.z * 17.0 + p.x * 9.0);
      float k = smoothstep(0.35, 0.9, p.y) * (0.035 + 0.04 * sh);
      p += nrm * k + vec3(0.0, -0.6 * k * (1.0 - abs(nrm.y)), 0.0);
    }
    if (highland) size *= 0.9;
  }
  float lie = herdLying(iB);
  float down = lie > 0.5 ? 0.0 : herdGraze(iB);
  // neck bend about the shoulder: down to the grass (pitch) and a little to one side (yaw)
  vec3 pv = sheep ? vec3(0.0, 0.66, 0.34) : vec3(0.0, 1.15, 0.6);
  float th = down * (sheep ? 1.2 : 1.08) - (lie > 0.5 ? 0.1 : 0.0);
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
  const place = `vec3 transformed = herdNear(position, aBend, normal, aMat);
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
  float th = (down * (sheep ? 1.2 : 1.08) - (lie > 0.5 ? 0.1 : 0.0)) * aBend;
  float ct = cos(th), st = sin(th);
  objectNormal = vec3(objectNormal.x, ct * objectNormal.y - st * objectNormal.z, st * objectNormal.y + ct * objectNormal.z);
  float c = cos(iA.w), s = sin(iA.w); objectNormal = vec3(c * objectNormal.x + s * objectNormal.z, objectNormal.y, -s * objectNormal.x + c * objectNormal.z); }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObj;\nvarying float vMat;\nvarying vec4 vIB;\nfloat gHerdBump;\n${NOISE_GLSL}\n${BREED_GLSL}`)
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
    // staple locks: cells ~3.5 cm, rounded tips with dark crevices between them
    vec3 cp = o * 28.0 + ph * 9.0, ci = floor(cp), cf = fract(cp);
    float f1 = 9.0, f2 = 9.0;
    for (int k = 0; k < 27; k++) {
      vec3 g = vec3(float(k % 3) - 1.0, float((k / 3) % 3) - 1.0, float(k / 9) - 1.0);
      vec3 r = g + vec3(hnHash(ci + g), hnHash(ci + g + 17.3), hnHash(ci + g + 41.9)) - cf;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    float lock = smoothstep(0.0, 0.35, sqrt(f2) - sqrt(f1));      // 0 in the crevice between locks
    float fl = (n1 * 0.6 + n2 * 0.4) * 0.6 + lock * 0.4;
    gHerdBump = m == 0 ? n1 * 0.012 + lock * 0.006 : 0.0;
    vec3 wool = vec3(0.68, 0.63, 0.52) * (0.88 + 0.18 * fract(ph * 13.7));
    // dirtier underneath: belly, the fringe over the legs and the breech, with dung tags behind
    float dirt = smoothstep(0.6, 0.36, y) * 0.85 + smoothstep(-0.45, -0.64, o.z) * 0.5;
    dirt += smoothstep(0.55, 0.75, hnNoise(o * 18.0 + ph * 3.0)) * smoothstep(-0.4, -0.6, o.z) * smoothstep(0.7, 0.45, y);
    wool = mix(wool, vec3(0.31, 0.26, 0.19), clamp(dirt, 0.0, 1.0) * 0.8);
    wool *= (0.6 + 0.45 * fl) * mix(0.55, 1.0, lock);
    bool blackSheep = tint > 0.95;
    if (blackSheep) wool *= vec3(0.16, 0.14, 0.13);
    // faces: black (Suffolk-like) on a third, mottled white-tan otherwise
    vec3 face = tint < 0.35 ? vec3(0.035, 0.03, 0.028) : vec3(0.36, 0.3, 0.25) * (0.7 + 0.45 * hnNoise(o * 40.0));
    face *= mix(1.0, tint < 0.35 ? 1.0 : 0.6, smoothstep(0.42, 0.2, y));   // legs darker towards the hooves
    if (blackSheep) face = vec3(0.03);
    hc = m == 0 ? wool : m == 1 ? face : m == 2 ? vec3(0.06, 0.05, 0.045) : vec3(0.01);
    hRough = m == 3 ? 0.35 : m == 2 ? 0.6 : 1.0;
  } else {
    // hide by breed. Holstein: black patches on white with soft, hairy edges, white legs, belly and switch;
    // Brown Swiss: grey-brown, darker head and legs, a pale ring round the dark muzzle; red; black Angus with
    // a sheen; Highland: long ginger hair in strands
    float br = herdBreed(tint);
    float hair = hnNoise(vec3(o.x * 140.0, o.y * 140.0, o.z * 25.0));
    vec3 coat;
    float sheen = 0.0;
    if (br < 0.5) {
      float pn = hnNoise(o * 2.6 + ph * 31.0) * 0.62 + hnNoise(o * 7.0 + ph * 7.0) * 0.28 + hair * 0.1;
      pn += smoothstep(0.55, 0.3, o.y) * 0.5 + smoothstep(0.85, 0.65, o.y) * 0.12 - (fract(ph * 7.3) - 0.5) * 0.25;
      if (o.z > 1.2) pn += smoothstep(0.06, 0.0, abs(o.x)) * 0.4 * step(0.5, fract(ph * 3.1)); // a white blaze
      float pmask = smoothstep(0.48, 0.54, pn);
      coat = mix(vec3(0.03, 0.027, 0.025), vec3(0.72, 0.7, 0.66), pmask);
      if (m == 6) coat = vec3(0.68, 0.65, 0.6);
    } else if (br < 1.5) {
      coat = vec3(0.27, 0.2, 0.15) * mix(1.25, 0.8, smoothstep(0.75, 0.3, o.y)) * mix(1.0, 0.65, smoothstep(1.25, 1.55, o.z));
      coat = mix(coat, vec3(0.62, 0.56, 0.48), smoothstep(0.035, 0.0, abs(length(vec2(o.x * 0.9, o.y - 1.05)) - 0.11)) * step(1.6, o.z));
      if (m == 6) coat = vec3(0.05, 0.04, 0.035);
    } else if (br < 2.5) {
      coat = vec3(0.36, 0.14, 0.055) * mix(1.15, 0.9, smoothstep(1.3, 0.8, o.y));
      if (m == 6) coat *= 0.6;
    } else if (br < 3.5) {
      coat = vec3(0.035, 0.032, 0.03);
      sheen = 1.0;
    } else {
      float st = hnNoise(vec3(o.x * 60.0, o.y * 9.0, o.z * 60.0));
      coat = mix(vec3(0.42, 0.2, 0.08), vec3(0.62, 0.38, 0.17), st) * (0.85 + 0.15 * fract(ph * 5.1));
      hair = st;
    }
    coat *= 0.88 + 0.22 * hair;
    gHerdBump = m == 0 ? hair * (br > 3.5 ? 0.01 : 0.0012) : 0.0;
    bool dark = br > 2.5 && br < 3.5;
    hc = m == 0 ? coat : m == 2 ? vec3(0.05, 0.04, 0.035) : m == 3 ? vec3(0.008) : m == 4 ? (dark || br == 1.0 ? vec3(0.09, 0.07, 0.07) : vec3(0.55, 0.36, 0.33))
      : m == 5 ? vec3(0.55, 0.5, 0.42) : m == 7 ? mix(vec3(0.68, 0.62, 0.5), vec3(0.12, 0.1, 0.08), smoothstep(0.42, 0.6, abs(o.x))) : coat * (br < 0.5 ? 1.0 : 0.6);
    hRough = m == 3 ? 0.3 : m == 4 ? 0.55 : m == 5 || m == 7 ? 0.45 : br > 3.5 ? 0.95 : mix(0.62 + 0.25 * hair, 0.42, sheen);
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
  mat.customProgramCacheKey = () => 'th-nearherd-v2-' + species;
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

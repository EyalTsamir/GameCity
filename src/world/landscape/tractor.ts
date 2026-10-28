// The field tractor (W8): a mid-size four-wheel-drive tractor (~4.6 m long with the weights, 2.3 m wide,
// 3 m to the beacon) pulling a cultivator. Body, cab and implement are one merged vertex-coloured mesh
// (per-vertex roughness / metalness); the lugged tyres are two instanced meshes (rear pair, front pair)
// that roll with the distance driven. Faces +z, ground at y 0, rear axle at z = REAR_Z.
// ?nofarmdetail falls back to the old box template in the landscape fleet (farmlife.ts).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const REAR_R = 0.85;
export const FRONT_R = 0.55;
export const REAR_Z = -0.75;
export const FRONT_Z = 1.75;
const REAR_X = 0.92;
const FRONT_X = 0.82;

export type RGB = [number, number, number];
const PAINT: RGB = [0.42, 0.045, 0.03];
const PAINT_DK: RGB = [0.2, 0.02, 0.015];
const BLACK: RGB = [0.025, 0.025, 0.025];
const IRON: RGB = [0.09, 0.09, 0.085];
const GLASS: RGB = [0.03, 0.045, 0.05];
const RIM: RGB = [0.5, 0.42, 0.3];
const IMPL: RGB = [0.04, 0.12, 0.32];
const MUD: RGB = [0.16, 0.12, 0.08];

export class Sink {
  pos: number[] = [];
  /** procedural surface id per vertex (farmstead.ts shader); 0 = plain */
  surf = 0;
  sf: number[] = [];
  /** mud / grime: base height subtracted from y, height of the splash zone */
  base = 0;
  mudTop = 1.15;
  mudSpan = 0.9;
  nrm: number[] = [];
  col: number[] = [];
  rm: number[] = [];
  private m = new THREE.Matrix4();
  private nm = new THREE.Matrix3();
  private v = new THREE.Vector3();
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, c: RGB, rough: number, metal: number, mud = 1): void {
    const gg = g.index ? g.toNonIndexed() : g;
    const p = gg.getAttribute('position'),
      n = gg.getAttribute('normal');
    this.nm.getNormalMatrix(m);
    for (let i = 0; i < p.count; i++) {
      this.v.fromBufferAttribute(p, i).applyMatrix4(m);
      const x = this.v.x,
        y = this.v.y,
        z = this.v.z;
      this.pos.push(x, y, z);
      this.v.fromBufferAttribute(n, i).applyMatrix3(this.nm).normalize();
      this.nrm.push(this.v.x, this.v.y, this.v.z);
      // mud: splashed up from the wheels, heaviest low down and behind the tyres, broken up by noise
      const sp = 0.5 + 0.5 * Math.sin(x * 23.1 + z * 17.3) * Math.sin(y * 19.7 - x * 7.1 + z * 3.3);
      const k = mud * Math.min(1, Math.max(0, (this.mudTop - (y - this.base)) / this.mudSpan)) * (0.35 + 0.65 * sp);
      this.sf.push(this.surf);
      this.col.push(c[0] + (MUD[0] - c[0]) * k * 0.8, c[1] + (MUD[1] - c[1]) * k * 0.8, c[2] + (MUD[2] - c[2]) * k * 0.8);
      this.rm.push(rough + (1 - rough) * k * 0.7, metal * (1 - k));
    }
  }
  box(w: number, h: number, l: number, x: number, y: number, z: number, c: RGB, rough = 0.45, metal = 0, r = 0.02, mud = 1, rot?: THREE.Euler): void {
    const g = r > 0 ? new RoundedBoxGeometry(w, h, l, 2, Math.min(r, w / 2.1, h / 2.1, l / 2.1)) : new THREE.BoxGeometry(w, h, l);
    this.m.makeRotationFromEuler(rot ?? new THREE.Euler()).setPosition(x, y, z);
    this.add(g, this.m, c, rough, metal, mud);
  }
  /** cylinder between two points */
  rod(a: [number, number, number], b: [number, number, number], r0: number, r1: number, seg: number, c: RGB, rough = 0.5, metal = 0.3, mud = 1): void {
    const A = new THREE.Vector3(...a),
      B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    this.m.compose(A.add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    this.add(g, this.m, c, rough, metal, mud);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aRM', new THREE.Float32BufferAttribute(this.rm, 2));
    g.setAttribute('aSurf', new THREE.Float32BufferAttribute(this.sf, 1));
    return g;
  }
}

/** body + cab + hitch + cultivator (no wheels) */
function bodyGeometry(): THREE.BufferGeometry {
  const s = new Sink();
  // chassis: engine block, gearbox and rear axle housing (cast iron)
  s.box(0.62, 0.5, 2.9, 0, 0.72, 0.85, IRON, 0.6, 0.35, 0.05);
  s.rod([-REAR_X + 0.22, REAR_R, REAR_Z], [REAR_X - 0.22, REAR_R, REAR_Z], 0.14, 0.14, 12, IRON, 0.55, 0.4);
  s.box(1.1, 0.16, 0.22, 0, FRONT_R, FRONT_Z, IRON, 0.6, 0.3, 0.03); // front axle beam
  s.rod([-FRONT_X + 0.16, FRONT_R, FRONT_Z], [FRONT_X - 0.16, FRONT_R, FRONT_Z], 0.09, 0.09, 10, IRON);
  // bonnet: sloping down to the nose, side louvres, grille, headlights
  {
    const g = new RoundedBoxGeometry(0.94, 0.66, 2.05, 3, 0.1);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) - 0.13 * ((p.getZ(i) + 1.025) / 2.05));
    g.computeVertexNormals();
    s.add(g, new THREE.Matrix4().makeTranslation(0, 1.33, 1.5), PAINT, 0.32, 0.1, 0.6);
  }
  for (const sx of [-1, 1])
    for (let i = 0; i < 6; i++) s.box(0.02, 0.035, 0.6, sx * 0.475, 1.18 + i * 0.065, 1.85, BLACK, 0.6, 0, 0.008, 0.5);
  s.box(0.8, 0.46, 0.05, 0, 1.24, 2.53, BLACK, 0.5, 0.2, 0.01, 0.4); // grille
  for (let i = 0; i < 7; i++) s.box(0.76, 0.022, 0.03, 0, 1.04 + i * 0.065, 2.56, PAINT_DK, 0.4, 0.3, 0.005, 0.4);
  for (const sx of [-1, 1]) s.box(0.16, 0.08, 0.04, sx * 0.3, 1.55, 2.5, [0.8, 0.8, 0.75], 0.08, 0.2, 0.015, 0.2);
  // front weights: a stack of cast slabs on a carrier
  s.box(0.9, 0.12, 0.5, 0, 0.62, 2.66, IRON, 0.6, 0.3, 0.02);
  for (let i = 0; i < 6; i++) s.box(0.12, 0.36, 0.44, -0.33 + i * 0.132, 0.86, 2.7, [0.12, 0.12, 0.115], 0.55, 0.3, 0.025);
  // fuel tank and battery box under the cab step
  s.box(0.34, 0.52, 0.8, -0.62, 1.05, 0.32, BLACK, 0.5, 0.1, 0.06);
  s.box(0.28, 0.3, 0.42, 0.6, 0.98, 0.35, BLACK, 0.6, 0.1, 0.03);
  // exhaust stack with muffler and rain cap beside the A-pillar; air pre-cleaner on the other side
  s.rod([0.38, 1.6, 0.62], [0.38, 1.75, 0.62], 0.05, 0.05, 10, IRON, 0.6, 0.4, 0);
  s.rod([0.38, 1.75, 0.62], [0.38, 2.3, 0.62], 0.085, 0.085, 12, [0.14, 0.13, 0.12], 0.7, 0.5, 0);
  s.rod([0.38, 2.3, 0.62], [0.38, 3.0, 0.62], 0.05, 0.048, 10, [0.06, 0.05, 0.045], 0.8, 0.4, 0);
  s.box(0.12, 0.012, 0.13, 0.38, 3.02, 0.6, [0.06, 0.05, 0.045], 0.7, 0.5, 0, 0, new THREE.Euler(0.35, 0, 0));
  s.rod([-0.38, 1.6, 0.62], [-0.38, 2.42, 0.62], 0.07, 0.07, 10, BLACK, 0.5, 0.1, 0);
  s.rod([-0.38, 2.42, 0.62], [-0.38, 2.52, 0.62], 0.1, 0.06, 10, BLACK, 0.5, 0.1, 0);
  // cab: floor pan, four pillars, glass all round, roof with an overhang and a beacon, mirrors, seat, wheel
  const cz0 = -1.32,
    cz1 = 0.2,
    cx = 0.68,
    y0 = 1.62,
    y1 = 2.86;
  s.box(1.42, 0.16, 1.6, 0, y0, (cz0 + cz1) / 2, BLACK, 0.6, 0.1, 0.03);
  for (const sx of [-1, 1])
    for (const z of [cz0, cz1]) s.box(0.07, y1 - y0, 0.07, sx * cx, (y0 + y1) / 2, z, BLACK, 0.4, 0.2, 0.015, 0.4);
  const gl = (w: number, h: number, l: number, x: number, y: number, z: number) => s.box(w, h, l, x, y, z, GLASS, 0.04, 0, 0, 0.25);
  gl(1.3, y1 - y0 - 0.12, 0.012, 0, (y0 + y1) / 2 + 0.02, cz1);
  gl(1.3, y1 - y0 - 0.12, 0.012, 0, (y0 + y1) / 2 + 0.02, cz0);
  for (const sx of [-1, 1]) gl(0.012, y1 - y0 - 0.12, cz1 - cz0 - 0.08, sx * cx, (y0 + y1) / 2 + 0.02, (cz0 + cz1) / 2);
  // door frame + handle (left side), wiper on the windscreen
  s.box(0.03, y1 - y0 - 0.1, 0.035, -cx - 0.01, (y0 + y1) / 2, -0.3, BLACK, 0.4, 0.2, 0.01, 0.2);
  s.box(0.03, 0.03, 0.14, -cx - 0.03, 2.05, -0.42, [0.5, 0.5, 0.5], 0.3, 0.7, 0.01, 0);
  s.box(0.02, 0.6, 0.015, 0.2, 2.15, cz1 + 0.02, BLACK, 0.5, 0.2, 0.004, 0, new THREE.Euler(0, 0, 0.5));
  s.box(1.62, 0.13, 1.85, 0, y1 + 0.06, (cz0 + cz1) / 2 + 0.02, PAINT, 0.3, 0.1, 0.05, 0);
  s.box(1.5, 0.05, 1.7, 0, y1 - 0.02, (cz0 + cz1) / 2 + 0.02, BLACK, 0.6, 0, 0.02, 0);
  s.rod([-0.55, y1 + 0.12, cz0 + 0.25], [-0.55, y1 + 0.24, cz0 + 0.25], 0.06, 0.05, 10, [0.9, 0.4, 0.03], 0.2, 0, 0);
  for (const sx of [-1, 1]) {
    s.rod([sx * cx, 2.6, cz1], [sx * (cx + 0.32), 2.66, cz1 + 0.08], 0.012, 0.012, 6, BLACK, 0.4, 0.5, 0);
    s.box(0.04, 0.26, 0.16, sx * (cx + 0.34), 2.56, cz1 + 0.08, BLACK, 0.3, 0.1, 0.01, 0);
  }
  s.box(0.5, 0.12, 0.48, 0, 2.0, -0.7, [0.06, 0.06, 0.06], 0.8, 0, 0.04, 0); // seat
  s.box(0.5, 0.6, 0.1, 0, 2.3, -0.95, [0.06, 0.06, 0.06], 0.8, 0, 0.04, 0);
  {
    const t = new THREE.TorusGeometry(0.19, 0.016, 6, 20);
    s.add(t, new THREE.Matrix4().makeRotationX(-0.9).setPosition(0, 2.28, -0.12), BLACK, 0.5, 0, 0);
  }
  s.rod([0, 1.75, 0.05], [0, 2.22, -0.08], 0.03, 0.03, 6, BLACK, 0.5, 0.1, 0);
  // steps up to the door: a ladder of three treads between the wheels
  for (let i = 0; i < 3; i++) s.box(0.3, 0.03, 0.22, -cx - 0.05, 0.55 + i * 0.36, 0.0, [0.12, 0.12, 0.12], 0.7, 0.4, 0.008);
  s.box(0.03, 1.1, 0.03, -cx - 0.18, 1.05, 0.0, BLACK, 0.5, 0.3, 0.008);
  // mudguards: curved shells over the rear tyres (with a lip), small guards over the front tyres
  for (const sx of [-1, 1]) {
    const g = new THREE.CylinderGeometry(REAR_R + 0.1, REAR_R + 0.1, 0.62, 24, 1, true, -Math.PI * 0.15, Math.PI * 0.62);
    s.add(g, new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(sx * REAR_X, REAR_R, REAR_Z)), PAINT, 0.35, 0.1, 0.9);
    const g2 = new THREE.CylinderGeometry(REAR_R + 0.1, REAR_R + 0.1, 0.62, 24, 1, true, -Math.PI * 0.15, Math.PI * 0.62);
    g2.scale(1, 1, 1);
    // inside of the shell (open cylinders are one-sided)
    const ix = g2.getIndex()!;
    const arr = ix.array as Uint16Array | Uint32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i];
      arr[i] = arr[i + 2];
      arr[i + 2] = t;
    }
    const nn = g2.getAttribute('normal');
    for (let i = 0; i < nn.count; i++) nn.setXYZ(i, -nn.getX(i), -nn.getY(i), -nn.getZ(i));
    s.add(g2, new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(sx * REAR_X, REAR_R, REAR_Z)), PAINT_DK, 0.7, 0, 1);
    const fg = new THREE.CylinderGeometry(FRONT_R + 0.08, FRONT_R + 0.08, 0.42, 14, 1, true, Math.PI * 0.05, Math.PI * 0.5);
    s.add(fg, new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(sx * FRONT_X, FRONT_R, FRONT_Z)), PAINT, 0.35, 0.1, 0.9);
    s.box(0.04, 0.5, 0.04, sx * (FRONT_X - 0.25), FRONT_R + 0.38, FRONT_Z, BLACK, 0.5, 0.3, 0.01);
  }
  // rear: three-point hitch (lower links, lift rods, top link), PTO shaft
  const hz = REAR_Z - 0.55;
  for (const sx of [-1, 1]) {
    s.rod([sx * 0.32, 0.62, hz], [sx * 0.46, 0.58, hz - 0.85], 0.04, 0.04, 8, IRON, 0.6, 0.3);
    s.rod([sx * 0.34, 1.25, hz + 0.1], [sx * 0.42, 0.64, hz - 0.5], 0.025, 0.025, 6, IRON, 0.6, 0.3);
  }
  s.rod([0, 1.32, hz + 0.05], [0, 1.08, hz - 0.85], 0.035, 0.035, 8, [0.45, 0.42, 0.1], 0.5, 0.4);
  s.rod([0, 0.75, hz + 0.1], [0, 0.72, hz - 0.6], 0.035, 0.035, 8, [0.6, 0.5, 0.05], 0.6, 0.3);
  // cultivator: headstock, two tine bars, spring tines into the soil, a packer roller behind
  const iz = hz - 0.95;
  s.box(0.5, 0.7, 0.12, 0, 0.9, iz, IMPL, 0.45, 0.2, 0.02);
  for (const [z, y] of [
    [iz - 0.15, 0.72],
    [iz - 0.75, 0.72],
  ] as const)
    s.box(3.0, 0.12, 0.12, 0, y, z, IMPL, 0.45, 0.2, 0.015);
  for (const sx of [-1, 1]) s.box(0.1, 0.1, 1.45, sx * 1.42, 0.72, iz - 0.72, IMPL, 0.45, 0.2, 0.015);
  s.box(0.1, 0.1, 0.9, -0.35, 0.78, iz - 0.4, IMPL, 0.45, 0.2, 0.015, 1, new THREE.Euler(0, 0.6, 0));
  s.box(0.1, 0.1, 0.9, 0.35, 0.78, iz - 0.4, IMPL, 0.45, 0.2, 0.015, 1, new THREE.Euler(0, -0.6, 0));
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 7; i++) {
      const x = -1.29 + (i + row * 0.5) * 0.39;
      if (Math.abs(x) > 1.4) continue;
      const z0 = row === 0 ? iz - 0.15 : iz - 0.75;
      // a C-shaped spring tine: down and forward to a point in the soil
      const pts: [number, number, number][] = [
        [x, 0.68, z0],
        [x, 0.5, z0 - 0.16],
        [x, 0.28, z0 - 0.1],
        [x, 0.1, z0 + 0.06],
        [x, -0.04, z0 + 0.14],
      ];
      for (let k = 0; k < pts.length - 1; k++) s.rod(pts[k], pts[k + 1], 0.018, 0.018, 5, k > 1 ? [0.3, 0.3, 0.3] : IMPL, 0.45, 0.5, 1);
    }
  const rz = iz - 1.35;
  for (const sx of [-1, 1]) s.rod([sx * 1.42, 0.72, iz - 1.4 + 0.1], [sx * 1.45, 0.24, rz], 0.035, 0.035, 6, IMPL, 0.45, 0.2);
  s.rod([-1.4, 0.23, rz], [1.4, 0.23, rz], 0.2, 0.2, 16, [0.15, 0.13, 0.11], 0.8, 0.2);
  for (let i = 0; i < 12; i++) {
    const x = -1.32 + i * 0.24;
    s.rod([x - 0.02, 0.23, rz], [x + 0.02, 0.23, rz], 0.24, 0.24, 16, [0.13, 0.1, 0.07], 0.9, 0.1);
  }
  return s.geometry();
}

/** a lugged tractor tyre on its rim, axis x, centred on the origin */
function wheelGeometry(R: number, W: number, lugs: number, around: number): THREE.BufferGeometry {
  const s = new Sink();
  const rr = R * 0.58; // rim radius
  // section profile (x, r) from the inner bead round the tread to the outer bead
  const prof: [number, number][] = [
    [-W * 0.42, rr],
    [-W * 0.5, rr + (R - rr) * 0.25],
    [-W * 0.52, rr + (R - rr) * 0.6],
    [-W * 0.49, R - 0.06 * R],
    [-W * 0.42, R - 0.012 * R],
    [-W * 0.25, R],
    [0, R],
    [W * 0.25, R],
    [W * 0.42, R - 0.012 * R],
    [W * 0.49, R - 0.06 * R],
    [W * 0.52, rr + (R - rr) * 0.6],
    [W * 0.5, rr + (R - rr) * 0.25],
    [W * 0.42, rr],
  ];
  // refine the tread section so the chevrons can be cut into it
  const pp: [number, number][] = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const n = prof[i][1] > R * 0.97 && prof[i + 1][1] > R * 0.97 ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      pp.push([prof[i][0] + (prof[i + 1][0] - prof[i][0]) * t, prof[i][1] + (prof[i + 1][1] - prof[i][1]) * t]);
    }
  }
  pp.push(prof[prof.length - 1]);
  const lugH = R * 0.075;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let a = 0; a <= around; a++) {
    const ang = (a / around) * Math.PI * 2;
    for (const [x, r0] of pp) {
      let r = r0;
      if (r0 > R * 0.9) {
        // chevron lugs: each half of the tread slants the other way, offset by half a pitch
        const side = x < 0 ? -1 : 1;
        const u = Math.abs(x) / (W * 0.5);
        const ph = (ang / (Math.PI * 2)) * lugs + u * 0.55 + (side > 0 ? 0.5 : 0);
        const f = ph - Math.floor(ph);
        const on = f < 0.36 ? 1 : 0;
        r += on * lugH * Math.min(1, (r0 - R * 0.9) / (R * 0.08));
      }
      pos.push(x, Math.cos(ang) * r, Math.sin(ang) * r);
    }
  }
  const n = pp.length;
  for (let a = 0; a < around; a++)
    for (let i = 0; i < n - 1; i++) {
      const p0 = a * n + i,
        p1 = p0 + 1,
        p2 = p0 + n,
        p3 = p2 + 1;
      idx.push(p0, p2, p1, p1, p2, p3);
    }
  const tyre = new THREE.BufferGeometry();
  tyre.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tyre.setIndex(idx);
  tyre.computeVertexNormals();
  s.add(tyre, new THREE.Matrix4(), [0.035, 0.034, 0.032], 0.85, 0, 0.9);
  // rim: dished disc, centre hub with wheel nuts, valve; both faces
  for (const sx of [-1, 1]) {
    const disc = new THREE.CylinderGeometry(rr, rr * 0.98, 0.02, 24);
    s.add(disc, new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(sx * W * 0.12, 0, 0), RIM, 0.4, 0.5, 0.7);
  }
  const rimBand = new THREE.CylinderGeometry(rr, rr, W * 0.84, 24, 1, true);
  s.add(rimBand, new THREE.Matrix4().makeRotationZ(Math.PI / 2), RIM, 0.45, 0.5, 0.8);
  s.add(new THREE.CylinderGeometry(rr * 0.32, rr * 0.36, W * 0.42, 16), new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(W * 0.2, 0, 0), RIM, 0.4, 0.5, 0.5);
  s.add(new THREE.CylinderGeometry(rr * 0.14, rr * 0.14, W * 0.5, 12), new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(W * 0.25, 0, 0), IRON, 0.5, 0.6, 0.3);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    s.add(new THREE.CylinderGeometry(0.018, 0.018, W * 0.47, 6), new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(W * 0.22, Math.cos(a) * rr * 0.24, Math.sin(a) * rr * 0.24), IRON, 0.5, 0.6, 0.3);
  }
  // spokes / dish holes read as darker slots
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) / 6) * Math.PI * 2;
    s.add(new THREE.BoxGeometry(0.004, rr * 0.22, rr * 0.12), new THREE.Matrix4().makeRotationX(-a).setPosition(W * 0.13, Math.cos(a) * rr * 0.62, Math.sin(a) * rr * 0.62), [0.06, 0.05, 0.04], 0.7, 0.2, 0.5);
  }
  return s.geometry();
}

function material(fog: boolean): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, fog });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aRM;\nvarying vec2 vRM;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
  };
  m.customProgramCacheKey = () => 'th-tractor-v1';
  return m;
}

export interface TractorModel {
  group: THREE.Group;
  /** place on the ground: position of the rear-axle midpoint projection, yaw, pitch (nose up +), distance rolled */
  set(x: number, y: number, z: number, yaw: number, pitch: number, rolled: number): void;
}

export function createTractor(fog: boolean): TractorModel {
  const group = new THREE.Group();
  group.name = 'land-tractor';
  const mat = material(fog);
  const body = new THREE.Mesh(bodyGeometry(), mat);
  body.name = 'land-tractor-body';
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const wheels = [
    { mesh: new THREE.InstancedMesh(wheelGeometry(REAR_R, 0.56, 23, 132), mat, 2), r: REAR_R, x: REAR_X, z: REAR_Z },
    { mesh: new THREE.InstancedMesh(wheelGeometry(FRONT_R, 0.38, 18, 96), mat, 2), r: FRONT_R, x: FRONT_X, z: FRONT_Z },
  ];
  for (const w of wheels) {
    w.mesh.name = 'land-tractor-wheels';
    w.mesh.castShadow = true;
    w.mesh.receiveShadow = true;
    w.mesh.frustumCulled = false;
    group.add(w.mesh);
  }
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    p = new THREE.Vector3(),
    one = new THREE.Vector3(1, 1, 1);
  return {
    group,
    set(x, y, z, yaw, pitch, rolled) {
      group.position.set(x, y, z);
      group.rotation.set(-pitch, yaw, 0, 'YXZ');
      for (const w of wheels) {
        const a = rolled / w.r;
        for (let k = 0; k < 2; k++) {
          const sx = k ? 1 : -1;
          // the left wheel is the right one turned about y (keeps the winding; lugs mirror like real tyres)
          e.set(k ? a : -a, k ? 0 : Math.PI, 0, 'YXZ');
          q.setFromEuler(e);
          p.set(sx * w.x, w.r - 0.03, w.z);
          m4.compose(p, q, one);
          w.mesh.setMatrixAt(k, m4);
        }
        w.mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

// Traffic-signal poles (mast arm over the lane + pole-mounted repeater),
// pedestrian signal heads at both ends of every crosswalk of a signalised
// junction, and stop signs. Static parts are one merged mesh; the lamp lenses
// are instanced front half-domes (the back half sits inside the housing) whose
// per-instance colours follow the live signal state (unlit material → they glow
// at night and feed the bloom pass). Lenses are frustum-culled and drawn with a
// coarser dome beyond ~70 m (re-bucketed only when the camera moves).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import type { Intersection, SignalHead } from '../../core/roadNetwork';
import type { Aspect, PedAspect } from '../../core/intersections';
import { DIR_VEC } from '../../core/geom';
import { paint, merge } from '../../core/gfx';
import { SIDEWALK_Y, XS, ZS } from '../../core/constants';
import { NearCells, nearCell, type NearCell } from '../../world/lamps/nearCells';

const POLE = '#3c4844';
const HOUSING = '#2b3330';
const PLATE = '#16191b';

const enum Lamp {
  Red,
  Yellow,
  Green,
  PedDont,
  PedWalk,
}

const ON: Record<Lamp, [number, number, number]> = {
  [Lamp.Red]: [4.2, 0.28, 0.16],
  [Lamp.Yellow]: [4.0, 1.9, 0.12],
  [Lamp.Green]: [0.25, 3.6, 1.35],
  [Lamp.PedDont]: [3.6, 0.7, 0.2],
  [Lamp.PedWalk]: [1.6, 3.4, 2.4],
};
const OFF: Record<Lamp, [number, number, number]> = {
  [Lamp.Red]: [0.16, 0.03, 0.03],
  [Lamp.Yellow]: [0.16, 0.11, 0.03],
  [Lamp.Green]: [0.03, 0.12, 0.08],
  [Lamp.PedDont]: [0.14, 0.05, 0.03],
  [Lamp.PedWalk]: [0.05, 0.1, 0.08],
};

interface LampInst {
  /** index into SignalRenderer.nodes */
  node: number;
  /** true when the lamp belongs to a N/S approach */
  ns: boolean;
  kind: Lamp;
}

// street names for the grid lines (N–S streets by XS index, E–W streets by ZS index); off-grid → hashed
const NS_NAMES = ['Mill Lane', 'Church Street', 'Elm Road', 'King Street', 'Station Road', 'Quay Street'];
const EW_NAMES = ['Foundry Road', 'Market Street', 'High Street', 'Park Avenue', 'Harbour Road'];
const NAME_ROWS = NS_NAMES.length + EW_NAMES.length;
const nearestIdx = (a: readonly number[], v: number) => a.reduce((b, x, i) => (Math.abs(x - v) < Math.abs(a[b] - v) ? i : b), 0);
const STREET_ROWS = {
  ns: (x: number) => nearestIdx(XS, x),
  ew: (z: number) => NS_NAMES.length + nearestIdx(ZS, z),
};
/** name atlas: one row per street — white enamel blade, black border and lettering */
function nameAtlas(): THREE.Texture {
  const W = 512,
    RH = 86;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = RH * NAME_ROWS;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#8d949a';
  g.fillRect(0, 0, W, cv.height);
  [...NS_NAMES, ...EW_NAMES].forEach((n, i) => {
    const y = i * RH;
    g.fillStyle = '#f1efe8';
    g.fillRect(4, y + 4, W - 8, RH - 8);
    g.strokeStyle = '#1b1c1e';
    g.lineWidth = 4;
    g.strokeRect(12, y + 11, W - 24, RH - 22);
    g.fillStyle = '#1b1c1e';
    g.font = 'bold 44px Arial, Helvetica, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(n.toUpperCase(), W / 2, y + RH / 2 + 2, W - 60);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** camera distance (m, at the reference 930 px / 32° view) beyond which lenses use the coarse dome */
const LAMP_LOD_DIST = 70;

export class SignalRenderer {
  readonly group = new THREE.Group();
  /** lens layers: [0] fine dome (near), [1] coarse dome (far) */
  private lampLayers: THREE.InstancedMesh[] = [];
  /** per layer: which lamp sits in each instance slot */
  private slotLamp: Int32Array[] = [];
  private lampMat = new Float32Array(0);
  private lampInfo: LampInst[] = [];
  private col = new THREE.Color();
  private nodes: number[] = [];
  /** live state per signalised node (parallel to nodes) */
  private nodeNs: Aspect[] = [];
  private nodeEw: Aspect[] = [];
  private nodePed: PedAspect[] = [];
  private frustum = new THREE.Frustum();
  private pv = new THREE.Matrix4();
  private sph = new THREE.Sphere();
  private lastCam = new Float32Array(17).fill(NaN);
  poleCount = 0;
  stopSignCount = 0;
  /** W5 street-name blades (one textured mesh, world space) */
  private blades: THREE.BufferGeometry[] = [];
  /** W5 fine fixings (bolts, clamps, hatches, visor cheeks, push buttons): drawn only near the camera */
  private nearMeshes: { mesh: THREE.Mesh; cell: NearCell<THREE.BufferGeometry[]> }[] = [];

  constructor(private ctx: CityContext) {
    this.group.name = 'traffic-signals';
    const statics: THREE.BufferGeometry[] = [];
    const lampM: THREE.Matrix4[] = [];
    const net = ctx.roads;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const up = new THREE.Vector3(0, 1, 0);

    const near = new NearCells<THREE.BufferGeometry[]>(() => []);
    const place = (g: THREE.BufferGeometry, head: SignalHead, baseY: number, color: string, fine = false): void => {
      paint(g, color);
      q.setFromAxisAngle(up, head.yaw);
      m.compose(new THREE.Vector3(head.x, baseY, head.z), q, new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(m);
      (fine ? near.at(head.x, head.z) : statics).push(g);
    };
    const box = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      return g;
    };
    const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, seg = 8): THREE.BufferGeometry => {
      const g = new THREE.CylinderGeometry(r0, r1, h, seg);
      g.translate(x, y + h / 2, z);
      return g;
    };
    /** lamp lens: local position + facing yaw offset (0 = local +Z, -PI/2 = local -X) */
    const lamp = (head: SignalHead, baseY: number, lx: number, ly: number, lz: number, face: number, r: number, info: LampInst): void => {
      const c = Math.cos(head.yaw),
        s = Math.sin(head.yaw);
      const wx = head.x + lx * c + lz * s;
      const wz = head.z - lx * s + lz * c;
      e.set(0, head.yaw + face, 0);
      q.setFromEuler(e);
      lampM.push(new THREE.Matrix4().compose(new THREE.Vector3(wx, baseY + ly, wz), q, new THREE.Vector3(r, r, r * 0.55)));
      this.lampInfo.push(info);
    };

    for (const I of net.intersections) {
      if (I.control === 'signal') {
        this.nodes.push(I.id);
        this.nodeNs.push('red');
        this.nodeEw.push('red');
        this.nodePed.push('dont');
        for (const head of I.signals) this.buildSignal(I, head, place, box, cyl, lamp);
      }
      if (I.control === 'stop') {
        for (const head of I.stopSigns) this.buildStopSign(I, head, place, box, cyl);
      }
    }

    if (statics.length) {
      const geo = merge(statics);
      for (const g of statics) g.dispose();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.15 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'traffic-signal-poles';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      for (const cell of near.list()) {
        const ng = merge(cell.item);
        for (const g of cell.item) g.dispose();
        const nm = new THREE.Mesh(ng, mat);
        nm.name = 'traffic-signal-fixings';
        nm.receiveShadow = true;
        this.group.add(nm);
        this.nearMeshes.push({ mesh: nm, cell });
      }
    }
    if (this.blades.length) {
      const bg = merge(this.blades);
      for (const g of this.blades) g.dispose();
      const bm = new THREE.MeshStandardMaterial({ map: nameAtlas(), roughness: 0.5, metalness: 0.1 });
      const mesh = new THREE.Mesh(bg, bm);
      mesh.name = 'traffic-street-names';
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    if (lampM.length) {
      // front half-domes (local +Z): the back half is hidden inside the housing. Seen from the front the
      // outline is drawn by the two edge meridians → 2 x heightSegments sides (16 near, 8 far).
      const lm = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true });
      const n = lampM.length;
      this.lampMat = new Float32Array(n * 16);
      lampM.forEach((mm, i) => mm.toArray(this.lampMat, i * 16));
      [new THREE.SphereGeometry(1, 6, 8, 0, Math.PI), new THREE.SphereGeometry(1, 3, 4, 0, Math.PI)].forEach((lg, k) => {
        const lamps = new THREE.InstancedMesh(lg, lm, n);
        lamps.name = k === 0 ? 'traffic-signal-lamps' : 'traffic-signal-lamps-far';
        lamps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        lamps.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
        lamps.instanceColor.setUsage(THREE.DynamicDrawUsage);
        lamps.frustumCulled = false; // culled per lamp in update()
        lamps.count = 0;
        this.lampLayers.push(lamps);
        this.slotLamp.push(new Int32Array(n));
        this.group.add(lamps);
      });
    }
    ctx.scene.add(this.group);
    this.update();
  }

  private baseY(I: Intersection, arm: SignalHead['arm']): number {
    const lid = I.outLane[arm];
    if (lid === undefined) return SIDEWALK_Y;
    const seg = this.ctx.plan.roadSegments[this.ctx.roads.lanes[lid].segment];
    return seg.sidewalks ? SIDEWALK_Y : 0.02;
  }

  private buildSignal(
    I: Intersection,
    head: SignalHead,
    place: (g: THREE.BufferGeometry, head: SignalHead, baseY: number, color: string, fine?: boolean) => void,
    box: (w: number, h: number, d: number, x: number, y: number, z: number) => THREE.BufferGeometry,
    cyl: (r0: number, r1: number, h: number, x: number, y: number, z: number, seg?: number) => THREE.BufferGeometry,
    lamp: (head: SignalHead, baseY: number, lx: number, ly: number, lz: number, face: number, r: number, info: LampInst) => void,
  ): void {
    const y0 = this.baseY(I, head.arm);
    const ns = head.arm === 'N' || head.arm === 'S';
    this.poleCount++;
    // W5 (?nosigndetail): round tapered mast arm, bolted plinth, hatch, push button, visors with cheeks, clamps
    const detail = !this.ctx.debug.params.has('nosigndetail');
    // pole, plinth, cap
    // (detail: fixings go to the near-only cells — `fine` — the base keeps 12-sided shafts and the round arm)
    place(cyl(0.17, 0.19, 0.32, 0, -0.12, 0, detail ? 12 : 10), head, y0, '#4a4f52');
    place(cyl(0.07, 0.085, 5.62, 0, 0.0, 0, detail ? 12 : 10), head, y0, POLE);
    place(cyl(0.1, 0.1, 0.08, 0, 5.62, 0, detail ? 12 : 10), head, y0, POLE);
    // mast arm over the lane (the road lies towards local -X)
    const armL = 2.55;
    if (detail) {
      const arm = new THREE.CylinderGeometry(0.042, 0.06, armL, 8);
      arm.rotateZ(Math.PI / 2);
      arm.translate(-armL / 2, 5.5, 0);
      place(arm, head, y0, POLE);
      // arm end cap, the clamp collar where it meets the pole
      place(cyl(0.05, 0.05, 0.03, 0, 0, 0, 8).rotateZ(Math.PI / 2).translate(-armL - 0.01, 5.5, 0), head, y0, '#3a3f42', true);
      place(cyl(0.09, 0.09, 0.16, 0, 5.42, 0, 12), head, y0, POLE, true);
      // plinth: bolt heads round the top, a service hatch on the pole (footway side, local +X)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        place(cyl(0.014, 0.014, 0.018, Math.cos(a) * 0.14, 0.2, Math.sin(a) * 0.14, 6), head, y0, '#2c3033', true);
      }
      place(box(0.012, 0.32, 0.075, 0.084, 0.75, 0), head, y0, POLE, true);
      place(box(0.004, 0.012, 0.012, 0.091, 0.82, 0), head, y0, '#a0a5aa', true);
      // pedestrian push button on the footway side, facing the waiting walker (local +X), with its arrow
      place(box(0.09, 0.16, 0.08, 0.11, 1.12, 0), head, y0, '#e9c21b');
      place(box(0.006, 0.05, 0.05, 0.158, 1.14, 0), head, y0, '#1d1d1d', true);
      place(box(0.007, 0.012, 0.04, 0.159, 1.08, 0), head, y0, '#f4f1ea', true);
    } else place(box(armL, 0.1, 0.1, -armL / 2, 5.5, 0), head, y0, POLE);
    {
      const br = new THREE.BoxGeometry(1.15, 0.055, 0.055);
      br.rotateZ(-0.5);
      br.translate(-0.505, 5.22, 0);
      place(br, head, y0, POLE);
    }
    // overhead head
    const hx = -2.15,
      hy = 4.92;
    place(box(0.07, 0.12, 0.07, hx, 5.45 - 0.0, 0), head, y0, POLE);
    place(box(0.62, 1.26, 0.03, hx, hy, -0.145), head, y0, PLATE);
    // thin retro-reflective border on the front of the backplate
    place(box(0.62, 0.03, 0.012, hx, hy + 0.615, -0.125), head, y0, '#f2efe6');
    place(box(0.62, 0.03, 0.012, hx, hy - 0.615, -0.125), head, y0, '#f2efe6');
    place(box(0.03, 1.26, 0.012, hx + 0.295, hy, -0.125), head, y0, '#f2efe6');
    place(box(0.03, 1.26, 0.012, hx - 0.295, hy, -0.125), head, y0, '#f2efe6');
    place(box(0.38, 1.02, 0.26, hx, hy, 0), head, y0, HOUSING);
    const kinds = [Lamp.Red, Lamp.Yellow, Lamp.Green];
    const node = this.nodes.length - 1;
    for (let i = 0; i < 3; i++) {
      const ly = hy + 0.32 - i * 0.32;
      place(box(0.32, 0.035, 0.18, hx, ly + 0.15, 0.2), head, y0, HOUSING);
      // visor cheeks: the hood wraps down the sides of the lens
      if (detail) for (const sx of [-1, 1]) place(box(0.012, 0.16, 0.16, hx + sx * 0.155, ly + 0.06, 0.21), head, y0, HOUSING, true);
      lamp(head, y0, hx, ly, 0.13, 0, 0.12, { node, ns, kind: kinds[i] });
    }
    // pole-mounted repeater facing traffic
    const ry = 2.72;
    place(box(0.3, 0.86, 0.22, 0, ry, 0.17), head, y0, HOUSING);
    if (detail) {
      // its back plate (black, thin white retro-reflective border) between the housing and the pole
      place(box(0.5, 1.04, 0.014, 0, ry, 0.066), head, y0, PLATE);
      for (const sx of [-1, 1]) place(box(0.022, 1.04, 0.006, sx * 0.239, ry, 0.076), head, y0, '#f2efe6');
      for (const sy of [-1, 1]) place(box(0.5, 0.022, 0.006, 0, ry + sy * 0.509, 0.076), head, y0, '#f2efe6');
      // its two band clamps round the pole
      for (const dy of [-0.3, 0.3]) place(cyl(0.085, 0.085, 0.04, 0, ry + dy - 0.02, 0, 12), head, y0, '#3a3f42', true);
      // street-name blades above the repeater on every other pole
      if ((this.poleCount & 1) === 0) this.nameBlades(I, head, y0, 3.55, 0.09);
    }
    for (let i = 0; i < 3; i++) {
      const ly = ry + 0.27 - i * 0.27;
      place(box(0.26, 0.03, 0.14, 0, ly + 0.125, 0.33), head, y0, HOUSING);
      if (detail) for (const sx of [-1, 1]) place(box(0.01, 0.13, 0.13, sx * 0.125, ly + 0.055, 0.335), head, y0, HOUSING, true);
      lamp(head, y0, 0, ly, 0.28, 0, 0.095, { node, ns, kind: kinds[i] });
    }
    // pedestrian head on this pole, facing across the crosswalk (local -X)
    const py = 2.0;
    place(box(0.24, 0.56, 0.3, -0.19, py, 0), head, y0, HOUSING);
    lamp(head, y0, -0.31, py + 0.13, 0, -Math.PI / 2, 0.085, { node, ns, kind: Lamp.PedDont });
    lamp(head, y0, -0.31, py - 0.13, 0, -Math.PI / 2, 0.085, { node, ns, kind: Lamp.PedWalk });
    // post at the other end of the crosswalk, head facing back across (local +X)
    const px = -7.8,
      pz = -0.3;
    place(cyl(0.11, 0.12, 0.22, px, -0.1, pz, 8), head, y0, '#4a4f52');
    place(cyl(0.05, 0.055, 2.55, px, 0, pz, 8), head, y0, POLE);
    place(box(0.24, 0.56, 0.3, px + 0.15, py, pz), head, y0, HOUSING);
    lamp(head, y0, px + 0.27, py + 0.13, pz, Math.PI / 2, 0.085, { node, ns, kind: Lamp.PedDont });
    lamp(head, y0, px + 0.27, py - 0.13, pz, Math.PI / 2, 0.085, { node, ns, kind: Lamp.PedWalk });
    void DIR_VEC;
  }

  private buildStopSign(
    I: Intersection,
    head: SignalHead,
    place: (g: THREE.BufferGeometry, head: SignalHead, baseY: number, color: string, fine?: boolean) => void,
    box: (w: number, h: number, d: number, x: number, y: number, z: number) => THREE.BufferGeometry,
    cyl: (r0: number, r1: number, h: number, x: number, y: number, z: number, seg?: number) => THREE.BufferGeometry,
  ): void {
    const y0 = this.baseY(I, head.arm);
    this.stopSignCount++;
    // W5 (?nosigndetail): some poles knocked a little off plumb; a grout collar, a cap, band clamps and bolts,
    // a sticker on some poles
    const detail = !this.ctx.debug.params.has('nosigndetail');
    const hs = Math.abs(Math.sin(head.x * 12.9898 + head.z * 78.233) * 43758.5453) % 1;
    const tx = detail && hs < 0.35 ? (hs - 0.17) * 0.12 : 0,
      tz = detail && hs < 0.35 ? (0.2 - hs) * 0.08 : 0;
    const place0 = place;
    const placeT = (g: THREE.BufferGeometry, h: SignalHead, by: number, color: string, fine = false) => {
      if (tx || tz) g.rotateX(tx).rotateZ(tz);
      place0(g, h, by, color, fine);
    };
    place = placeT;
    // street-name blades on top of some stop-sign poles (the pole runs up past the plate)
    const blades = detail && hs > 0.3 && hs < 0.8;
    const poleH = blades ? 3.02 : 2.62;
    placeT(cyl(0.05, 0.05, poleH, 0, 0, 0, detail ? 10 : 8), head, y0, '#9aa1a7');
    if (blades) this.nameBlades(I, head, y0, poleH + 0.09, 0, tx, tz);
    const sy = 2.32;
    const oct = (r: number, z: number, back = false) => {
      const g = new THREE.CircleGeometry(r, 8);
      g.rotateZ(Math.PI / 8);
      if (back) g.rotateY(Math.PI);
      g.translate(0, sy, z);
      return g;
    };
    if (detail) {
      // a real plate: 2 mm aluminium blank with a rolled-back rim (the flange reads as the plate's thickness from
      // the side), white border, red face; on the back two horizontal channel rails the clamps bolt to
      const blank = new THREE.CylinderGeometry(0.47, 0.47, 0.006, 8, 1, false, Math.PI / 8).rotateX(Math.PI / 2).translate(0, sy, 0.059);
      place(blank, head, y0, '#f4f1ea');
      const rim = new THREE.CylinderGeometry(0.472, 0.472, 0.026, 8, 1, true, Math.PI / 8).rotateX(Math.PI / 2).translate(0, sy, 0.05);
      place(rim, head, y0, '#a9afb4');
      place(oct(0.415, 0.0625), head, y0, '#c8232c');
      // the back face of the blank is grey (galvanised): a slightly smaller octagon just behind it
      place(oct(0.466, 0.0555, true), head, y0, '#8d949a');
      for (const dy of [-0.26, 0.26]) place(box(0.74, 0.04, 0.022, 0, sy + dy, 0.044), head, y0, '#7d848a');
    } else {
      place(oct(0.47, 0.055), head, y0, '#f4f1ea');
      place(oct(0.42, 0.062), head, y0, '#c8232c');
      place(oct(0.47, 0.045, true), head, y0, '#8d949a');
    }
    // "STOP" in white block letters (a plain bar reads as the round No Entry sign)
    const lw = 0.098,
      lh = 0.17,
      t = 0.03,
      hw = lw / 2,
      hh = lh / 2;
    const bar = (cx: number, x: number, y: number, w: number, h: number) =>
      place(box(w, h, 0.004, cx + x, sy + y, 0.0645), head, y0, '#f4f1ea');
    const top = (cx: number) => bar(cx, 0, hh - t / 2, lw, t);
    const mid = (cx: number) => bar(cx, 0, 0, lw, t);
    const bot = (cx: number) => bar(cx, 0, -hh + t / 2, lw, t);
    const side = (cx: number, right: boolean, y: number, h: number) => bar(cx, right ? hw - t / 2 : -hw + t / 2, y, t, h);
    const [cS, cT, cO, cP] = [-0.192, -0.064, 0.064, 0.192];
    top(cS); mid(cS); bot(cS); side(cS, false, hh / 2, hh); side(cS, true, -hh / 2, hh);
    top(cT); bar(cT, 0, -t / 2, t, lh - t);
    top(cO); bot(cO); side(cO, false, 0, lh); side(cO, true, 0, lh);
    top(cP); mid(cP); side(cP, false, 0, lh); side(cP, true, hh / 2, hh);
    place(box(0.12, 0.2, 0.04, 0, sy, 0.025), head, y0, '#9aa1a7');
    if (detail) {
      // pole cap, grout collar at the foot
      place(cyl(0.056, 0.052, 0.03, 0, poleH, 0, 12), head, y0, '#4d5257', true);
      place(cyl(0.085, 0.095, 0.025, 0, -0.005, 0, 12), head, y0, '#6f6b64', true);
      // two band clamps behind the plate (band round the pole + a bracket to the plate back) and their bolts
      for (const dy of [-0.26, 0.26]) {
        place(cyl(0.058, 0.058, 0.04, 0, sy + dy - 0.02, 0, 12), head, y0, '#7d848a', true);
        place(box(0.09, 0.04, 0.02, 0, sy + dy, 0.04), head, y0, '#7d848a', true);
        place(box(0.02, 0.012, 0.03, -0.068, sy + dy, -0.0), head, y0, '#5e6368', true);
        place(box(0.02, 0.012, 0.03, 0.068, sy + dy, -0.0), head, y0, '#5e6368', true);
        // the carriage-bolt heads on the face
        place(cyl(0.012, 0.012, 0.006, 0, 0, 0, 8).rotateX(Math.PI / 2).translate(0, sy + dy + 0.06, 0.068), head, y0, '#d9d4cc', true);
      }
      // a sticker / faded tag on some poles
      if (hs > 0.55) {
        const sc = ['#f2e64a', '#3a9ad9', '#f4f1ea', '#e85d9e'][Math.floor(hs * 97) % 4];
        place(box(0.07, 0.09, 0.004, 0, 1.45 + hs * 0.3, 0.05), head, y0, sc, true);
      }
    }
  }

  /**
   * Two crossed street-name blades on a pole at local height `yl` (poleR 0: centred on the pole top; else flag
   * blades clamped to the side of a taller pole, sticking out by poleR + half their length): the lower one runs along the N–S street
   * (named by the junction x), the upper one along the E–W street (junction z). Text on both faces.
   */
  private nameBlades(I: Intersection, head: SignalHead, y0: number, yl: number, poleR: number, tx = 0, tz = 0): void {
    const names: [number, number][] = [
      [STREET_ROWS.ns(I.x), -Math.PI / 2],
      [STREET_ROWS.ew(I.z), 0],
    ];
    names.forEach(([row, ang], k) => {
      const g = new THREE.BoxGeometry(0.8, 0.15, 0.014);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const v0 = 1 - (row + 1) / NAME_ROWS,
        v1 = 1 - row / NAME_ROWS;
      for (let i = 0; i < uv.count; i++) {
        const face = Math.floor(i / 4);
        if (face >= 4) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
        else uv.setXY(i, 0.004, v0 + 0.004);
      }
      if (poleR > 0) g.translate(0.4 + poleR, 0, 0);
      g.rotateY(ang - head.yaw);
      g.translate(0, yl + k * 0.17, 0);
      if (tx || tz) g.rotateX(tx).rotateZ(tz);
      g.rotateY(head.yaw);
      g.translate(head.x, y0, head.z);
      this.blades.push(g);
    });
  }

  /** lens culling + level per lamp; only when the camera moved */
  private bucket(): void {
    const cam = this.ctx.camera;
    cam.updateMatrixWorld();
    const e = cam.matrixWorld.elements;
    const last = this.lastCam;
    let moved = last[16] !== cam.fov || last[15] !== this.ctx.size.height;
    for (let i = 0; i < 15 && !moved; i++) moved = Math.abs(e[i] - last[i]) > 1e-4;
    if (!moved) return;
    for (let i = 0; i < 15; i++) last[i] = e[i];
    last[15] = this.ctx.size.height;
    last[16] = cam.fov;
    this.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    const h = Math.max(200, this.ctx.size.height * this.ctx.renderer.getPixelRatio());
    const lim = LAMP_LOD_DIST * (h / 930) * (Math.tan((32 * Math.PI) / 360) / Math.tan((cam.fov * Math.PI) / 360));
    const lim2 = lim * lim;
    const cp = cam.position;
    const M = this.lampMat;
    const counts = [0, 0];
    for (let i = 0; i < this.lampInfo.length; i++) {
      const x = M[i * 16 + 12],
        y = M[i * 16 + 13],
        z = M[i * 16 + 14];
      this.sph.center.set(x, y, z);
      this.sph.radius = 0.2;
      if (!this.frustum.intersectsSphere(this.sph)) continue;
      const k = (cp.x - x) ** 2 + (cp.y - y) ** 2 + (cp.z - z) ** 2 < lim2 ? 0 : 1;
      const layer = this.lampLayers[k];
      const s = counts[k]++;
      (layer.instanceMatrix.array as Float32Array).set(M.subarray(i * 16, i * 16 + 16), s * 16);
      this.slotLamp[k][s] = i;
    }
    this.lampLayers.forEach((layer, k) => {
      layer.count = counts[k];
      layer.visible = counts[k] > 0;
      const a = layer.instanceMatrix;
      a.clearUpdateRanges();
      if (counts[k] > 0) {
        a.addUpdateRange(0, counts[k] * 16);
        a.needsUpdate = true;
      }
    });
  }

  /** per frame: visible lenses, their colours from the live signal state */
  update(): void {
    for (const n of this.nearMeshes) n.mesh.visible = nearCell(this.ctx.camera, n.cell);
    if (!this.lampLayers.length) return;
    this.bucket();
    const mgr = this.ctx.intersections;
    const flashOn = Math.floor(mgr.time * 2.2) % 2 === 0;
    for (let j = 0; j < this.nodes.length; j++) {
      const id = this.nodes[j];
      this.nodeNs[j] = mgr.aspect(id, 'N');
      this.nodeEw[j] = mgr.aspect(id, 'E');
      this.nodePed[j] = mgr.pedAspect(id);
    }
    const c = this.col;
    for (let k = 0; k < this.lampLayers.length; k++) {
      const layer = this.lampLayers[k];
      const slots = this.slotLamp[k];
      for (let s = 0; s < layer.count; s++) {
        const v = this.lampColor(this.lampInfo[slots[s]], flashOn);
        c.setRGB(v[0], v[1], v[2]);
        layer.setColorAt(s, c);
      }
      const a = layer.instanceColor!;
      a.clearUpdateRanges();
      if (layer.count > 0) {
        a.addUpdateRange(0, layer.count * 3);
        a.needsUpdate = true;
      }
    }
  }

  private lampColor(L: LampInst, flashOn: boolean): [number, number, number] {
    const asp = L.ns ? this.nodeNs[L.node] : this.nodeEw[L.node];
    const ped = this.nodePed[L.node];
    let on = false;
    switch (L.kind) {
      case Lamp.Red:
        on = asp === 'red';
        break;
      case Lamp.Yellow:
        on = asp === 'yellow';
        break;
      case Lamp.Green:
        on = asp === 'green';
        break;
      case Lamp.PedDont:
        on = ped === 'dont';
        break;
      case Lamp.PedWalk:
        on = ped === 'walk' || (ped === 'flash' && flashOn);
        break;
    }
    return on ? ON[L.kind] : OFF[L.kind];
  }
}

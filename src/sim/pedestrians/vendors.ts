// Street vendors: an ice-cream cart, fresh orange-juice stands, a flower cart and a pretzel / coffee cart on
// the plazas, a little way off the walkways and facing them. Each stall has a vendor (a crowd party in the
// 'serve' state, crowd.ts) standing behind it and two customer spots in front (a 'view' place, theme
// 'vendor'). The carts are one merged static mesh (one draw call + its shadow), lamp-lit at night.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { OCC } from '../../core/occupancy';
import type { Rng } from '../../core/rng';
import { patchLampMaterial } from '../../world/lamps/integrate';
import type { Spot, SpotPlace } from './places';

export type StallKind = 'icecream' | 'juice' | 'flowers' | 'pretzel';

export interface Stall {
  kind: StallKind;
  x: number;
  z: number;
  y: number;
  /** the stall's front (customers' side) faces (sin yaw, cos yaw) */
  yaw: number;
  /** vendor's spot behind the cart */
  vx: number;
  vz: number;
  /** customer spots in front (theme 'vendor') */
  place: SpotPlace;
  /** opening hours */
  open: number;
  close: number;
  /** what customers carry away (Member.walkProp: 1 = a cup / cone) */
  label: string;
}

const LABELS: Record<StallKind, [string, string]> = {
  icecream: ['Buying an ice cream', 'Gelato cart'],
  juice: ['Getting a fresh orange juice', 'Orange-juice stand'],
  flowers: ['Buying flowers', 'Flower cart'],
  pretzel: ['Buying a pretzel and a coffee', 'Pretzel & coffee cart'],
};

interface Cand {
  x: number;
  z: number;
  yaw: number;
}

/** Stall positions on the plazas: 1.6–3 m from a walkway band, facing it, clear of everything else. */
export function planStalls(ctx: CityContext, rng: Rng, avoid: { x: number; z: number }[]): Stall[] {
  const { plan, peds, occupancy: occ } = ctx;
  const keep: { x: number; z: number; r: number }[] = ((ctx.services.props as { discs?: { x: number; z: number; r: number }[] } | undefined)?.discs ?? []).slice();
  for (const t of (ctx.services.vegetation as { trees?: { x: number; z: number }[] } | undefined)?.trees ?? []) keep.push({ x: t.x, z: t.z, r: 0.7 });
  for (const f of plan.features) if (f.radius > 0) keep.push({ x: f.x, z: f.z, r: f.radius });
  for (const a of avoid) keep.push({ x: a.x, z: a.z, r: 1.6 });
  const hard = OCC.BUILDING | OCC.SOLID | OCC.ROAD | OCC.WATER | OCC.RAIL;
  const out: Stall[] = [];
  const kinds: StallKind[] = ['juice', 'icecream', 'flowers', 'pretzel', 'juice', 'icecream', 'pretzel'];
  let ki = 0;
  const areas = plan.areas.filter((a) => a.kind === 'plaza').sort((a, b) => (b.rect.x1 - b.rect.x0) * (b.rect.z1 - b.rect.z0) - (a.rect.x1 - a.rect.x0) * (a.rect.z1 - a.rect.z0));
  for (const a of areas) {
    if (out.length >= 7) break;
    const r = a.rect;
    const area = (r.x1 - r.x0) * (r.z1 - r.z0);
    if (area < 100) continue;
    const edges = peds.edges.filter((e) => {
      if (e.kind === 'crosswalk' || e.kind === 'door') return false;
      const A = peds.nodes[e.a],
        B = peds.nodes[e.b];
      return Math.max(A.x, B.x) > r.x0 - 6 && Math.min(A.x, B.x) < r.x1 + 6 && Math.max(A.z, B.z) > r.z0 - 6 && Math.min(A.z, B.z) < r.z1 + 6;
    });
    const lKeep = keep.filter((d) => d.x > r.x0 - 4 - d.r && d.x < r.x1 + 4 + d.r && d.z > r.z0 - 4 - d.r && d.z < r.z1 + 4 + d.r);
    const cands: (Cand & { key: number })[] = [];
    for (let z = r.z0 + 1.5; z < r.z1 - 1.5; z += 0.75) {
      for (let x = r.x0 + 1.5; x < r.x1 - 1.5; x += 0.75) {
        if (occ.anyInCircle(x, z, 1.6, hard)) continue;
        // nearest walkway band: the stall faces it from 1.6–3 m
        let best = Infinity,
          fx = 0,
          fz = 0;
        for (const e of edges) {
          const A = peds.nodes[e.a],
            B = peds.nodes[e.b];
          const dx = B.x - A.x,
            dz = B.z - A.z;
          const l2 = dx * dx + dz * dz;
          let t = l2 > 0 ? ((x - A.x) * dx + (z - A.z) * dz) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = A.x + dx * t,
            pz = A.z + dz * t;
          const d = Math.hypot(x - px, z - pz) - e.halfWidth;
          if (d < best) {
            best = d;
            fx = px - x;
            fz = pz - z;
          }
        }
        if (best < 1.6 || best > 3.0) continue;
        if (lKeep.some((d) => Math.hypot(d.x - x, d.z - z) < d.r + 1.8)) continue;
        cands.push({ x, z, yaw: Math.atan2(fx, fz), key: Math.abs(best - 2.2) + rng.next() * 1.5 });
      }
    }
    cands.sort((p, q) => p.key - q.key);
    const maxN = area > 400 ? 2 : 1;
    let n = 0;
    for (const c of cands) {
      if (n >= maxN) break;
      if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 14)) continue;
      // snap the facing to the plaza grid (stalls stand square to the paving)
      const yaw = Math.round(c.yaw / (Math.PI / 2)) * (Math.PI / 2);
      const fx = Math.sin(yaw),
        fz = Math.cos(yaw);
      const kind = kinds[ki++ % kinds.length];
      const spots: Spot[] = [];
      for (const lat of [-0.38, 0.38]) spots.push({ x: c.x + fx * 1.0 + fz * lat, z: c.z + fz * 1.0 - fx * lat, y: 0, yaw: yaw + Math.PI + lat * 0.4, taken: -1 });
      // a walkway node with a clear straight walk to the customer spots
      let node = -1,
        bd = 9;
      for (const nd of peds.nodes) {
        if (nd.kind === 'door' || Math.abs(nd.x - c.x) > bd || Math.abs(nd.z - c.z) > bd) continue;
        if (nd.edges.some((eid) => peds.edges[eid].kind === 'crosswalk' || peds.edges[eid].kind === 'door')) continue;
        const sx = c.x + fx * 1.0,
          sz = c.z + fz * 1.0;
        const d = Math.hypot(nd.x - sx, nd.z - sz);
        if (d >= bd) continue;
        let clear = true;
        for (let t = 0.1; t < 1 && clear; t += 0.5 / Math.max(d, 0.5)) {
          const x = nd.x + (sx - nd.x) * t,
            z = nd.z + (sz - nd.z) * t;
          if (occ.has(x, z, hard) || lKeep.some((k) => Math.hypot(k.x - x, k.z - z) < k.r + 0.3) || Math.hypot(c.x - x, c.z - z) < 0.9) clear = false;
        }
        if (clear) {
          bd = d;
          node = nd.id;
        }
      }
      if (node < 0) continue;
      const [label, name] = LABELS[kind];
      out.push({
        kind,
        x: c.x,
        z: c.z,
        y: 0,
        yaw,
        vx: c.x - fx * 0.85,
        vz: c.z - fz * 0.85,
        place: { kind: 'view', node, label, theme: 'vendor', spots, x: c.x, z: c.z },
        open: kind === 'icecream' ? 10.5 : kind === 'pretzel' ? 7 : 8.5,
        close: kind === 'icecream' ? 21.5 : kind === 'flowers' ? 19 : 20,
        label: name,
      });
      n++;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────── meshes ──

class Sink {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  private c = new THREE.Color();
  m = new THREE.Matrix4();
  private nm = new THREE.Matrix3();
  add(g: THREE.BufferGeometry, color: string): void {
    g.applyMatrix4(this.m);
    const P = g.getAttribute('position'),
      N = g.getAttribute('normal');
    this.c.set(color).convertSRGBToLinear();
    const base = this.pos.length / 3;
    for (let i = 0; i < P.count; i++) {
      this.pos.push(P.getX(i), P.getY(i), P.getZ(i));
      this.nrm.push(N.getX(i), N.getY(i), N.getZ(i));
      this.col.push(this.c.r, this.c.g, this.c.b);
    }
    const I = g.index;
    if (I) for (let i = 0; i < I.count; i++) this.idx.push(base + I.getX(i));
    else for (let i = 0; i < P.count; i++) this.idx.push(base + i);
    g.dispose();
    void this.nm;
  }
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: string): void {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y + h / 2, z);
    this.add(g, color);
  }
  cyl(r0: number, r1: number, h: number, x: number, y: number, z: number, color: string, seg = 10): void {
    const g = new THREE.CylinderGeometry(r1, r0, h, seg);
    g.translate(x, y + h / 2, z);
    this.add(g, color);
  }
  ball(r: number, x: number, y: number, z: number, color: string): void {
    const g = new THREE.SphereGeometry(r, 6, 4);
    g.translate(x, y, z);
    this.add(g, color);
  }
  cone(r: number, h: number, x: number, y: number, z: number, color: string, seg = 8): void {
    const g = new THREE.ConeGeometry(r, h, seg, 1, true);
    g.translate(x, y + h / 2, z);
    this.add(g, color);
  }
  /** striped market-parasol canopy */
  canopy(r: number, y: number, x: number, z: number, c0: string, c1: string): void {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const g = new THREE.ConeGeometry(r, 0.38, n, 1, true, (i / n) * Math.PI * 2, (Math.PI * 2) / n);
      g.translate(x, y + 0.19, z);
      this.add(g, i % 2 ? c0 : c1);
    }
    this.cyl(0.025, 0.025, y + 0.4, x, 0, z, '#d8d4ca', 5);
  }
}

function cart(s: Sink, st: Stall, rng: Rng): void {
  switch (st.kind) {
    case 'icecream': {
      const body = rng.pick(['#f6d6e2', '#cfe8e2', '#f6efd8']);
      s.box(1.25, 0.72, 0.72, 0, 0.22, 0, body);
      s.box(1.27, 0.12, 0.74, 0, 0.62, 0, '#e8432e');
      s.box(1.2, 0.06, 0.66, 0, 0.94, 0, '#e9e6df');
      // freezer lids and a row of flavour tubs under glass
      for (let i = 0; i < 4; i++) s.box(0.24, 0.05, 0.22, -0.42 + i * 0.28, 1.0, -0.12, ['#f3e7c9', '#e7a6b8', '#8c5a3c', '#b8d88a'][i]);
      s.box(1.2, 0.12, 0.02, 0, 1.0, 0.3, '#cfe0e6');
      for (const x of [-0.52, 0.52]) {
        const w = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12);
        w.rotateZ(Math.PI / 2);
        w.translate(x * 1.25, 0.2, -0.2);
        s.add(w, '#2a2c30');
      }
      s.canopy(1.0, 2.05, 0, 0, '#e8432e', '#f7f3ea');
      break;
    }
    case 'juice': {
      // table with a pyramid of oranges, the press, cups
      s.box(1.5, 0.05, 0.75, 0, 0.82, 0, '#c9a46e');
      s.box(1.5, 0.8, 0.03, 0, 0.02, 0.36, '#f2a33a');
      for (const x of [-0.7, 0.7]) for (const z of [-0.32, 0.32]) s.box(0.05, 0.82, 0.05, x, 0, z, '#8a6a44');
      for (let k = 0; k < 3; k++) for (let i = 0; i < 4 - k; i++) for (let j = 0; j < 3 - k; j++) s.ball(0.045, -0.55 + (i + k * 0.5) * 0.095, 0.9 + k * 0.075, -0.1 + (j + k * 0.5) * 0.095, k === 2 ? '#f39a1c' : '#ee8d18');
      s.box(0.22, 0.32, 0.22, 0.32, 0.87, -0.05, '#c6c9cc');
      s.cyl(0.06, 0.06, 0.12, 0.32, 1.19, -0.05, '#f39a1c', 8);
      for (let i = 0; i < 3; i++) s.cyl(0.03, 0.035, 0.09, 0.05 + i * 0.08, 0.87, 0.2, '#f7a73a', 6);
      s.box(0.5, 0.36, 0.02, 0, 0.98, 0.37, '#fbf3df');
      s.canopy(1.15, 2.1, 0, -0.05, '#f39a1c', '#fbf3df');
      break;
    }
    case 'flowers': {
      s.box(1.4, 0.6, 0.7, 0, 0.25, 0, '#3f6b4f');
      for (const x of [-0.55, 0.55]) {
        const w = new THREE.CylinderGeometry(0.25, 0.25, 0.06, 12);
        w.rotateZ(Math.PI / 2);
        w.translate(x * 1.3, 0.25, 0);
        s.add(w, '#2a2c30');
      }
      const fl = ['#e8649a', '#f2c84b', '#e8574f', '#b46ad6', '#f5f0e6', '#f08a3c', '#8f9ee8', '#d23c5a'];
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 2; j++) {
          const x = -0.48 + i * 0.32,
            z = -0.15 + j * 0.3;
          s.cyl(0.11, 0.12, 0.22, x, 0.85, z, '#8b939a', 8);
          s.ball(0.15, x, 1.16 + j * 0.06, z, fl[(i * 2 + j) % fl.length]);
          s.ball(0.07, x + 0.06, 1.25 + j * 0.06, z + 0.05, '#4f7a3a');
        }
      s.canopy(0.95, 2.0, 0, 0, '#3f6b4f', '#f5f0e6');
      break;
    }
    case 'pretzel': {
      s.box(1.3, 0.75, 0.68, 0, 0.2, 0, '#b8bdc2');
      s.box(1.3, 0.04, 0.7, 0, 0.95, 0, '#d9dcdf');
      // glass display with pretzels, a coffee machine
      s.box(0.7, 0.34, 0.4, -0.22, 0.99, 0.05, '#dbe9ee');
      for (let i = 0; i < 4; i++) s.ball(0.06, -0.48 + i * 0.17, 1.12, 0.05, '#a86a2c');
      s.box(0.3, 0.38, 0.3, 0.4, 0.99, -0.1, '#3a3e45');
      for (const x of [-0.5, 0.5]) {
        const w = new THREE.CylinderGeometry(0.18, 0.18, 0.06, 12);
        w.rotateZ(Math.PI / 2);
        w.translate(x * 1.32, 0.18, -0.18);
        s.add(w, '#2a2c30');
      }
      s.canopy(1.05, 2.05, 0, 0, '#2f6b4f', '#f2efe6');
      break;
    }
  }
}

/** one merged mesh of all the carts (casts shadows; lamp light at night) */
export function buildStallMesh(stalls: Stall[], rng: Rng): THREE.Mesh | null {
  if (!stalls.length) return null;
  const s = new Sink();
  for (const st of stalls) {
    s.m.makeRotationY(st.yaw);
    s.m.setPosition(st.x, st.y, st.z);
    cart(s, st, rng);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
  const nrm = new THREE.Float32BufferAttribute(s.nrm, 3);
  geo.setAttribute('normal', nrm);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 3));
  geo.setIndex(s.idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });
  patchLampMaterial(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'street-vendors';
  mesh.matrixAutoUpdate = false;
  return mesh;
}

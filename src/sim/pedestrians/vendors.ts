// Street vendors: an ice-cream cart, fresh orange-juice stands, a flower cart and a pretzel / coffee cart on
// the plazas, a little way off the walkways and facing them. Each stall has a vendor (a crowd party in the
// 'serve' state, crowd.ts) standing behind it and two customer spots in front (a 'view' place, theme
// 'vendor'). The carts are one merged static mesh (one draw call + its shadow), lamp-lit at night.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { shapeOn } from '../../core/sweepshape';
import type { CityContext } from '../../core/context';
import { OCC } from '../../core/occupancy';
import type { Rng } from '../../core/rng';
import { patchLampMaterial } from '../../world/lamps/integrate';
import type { Spot, SpotPlace } from './places';

export type StallKind = 'icecream' | 'juice' | 'flowers' | 'pretzel' | 'market' | 'busker';

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
  /** market stalls: a shopper is stopped at the counter (where) — refreshed by the vendor */
  served?: number;
  cx?: number;
  cz?: number;
}

const LABELS: Record<StallKind, [string, string]> = {
  icecream: ['Buying an ice cream', 'Gelato cart'],
  juice: ['Getting a fresh orange juice', 'Orange-juice stand'],
  flowers: ['Buying flowers', 'Flower cart'],
  pretzel: ['Buying a pretzel and a coffee', 'Pretzel & coffee cart'],
  market: ['Browsing the market stalls', 'market stall'],
  busker: ['Listening to a street musician', 'street musician'],
};

/**
 * The market's stalls (landmarks draw them): a vendor behind each counter (stall frame z −0.15, facing the
 * aisle); the customers are the shoppers who stop at the stalls on their walk (crowd rail stops).
 */
export function marketStalls(ctx: CityContext): Stall[] {
  const out: Stall[] = [];
  for (const f of ctx.plan.features) {
    if (f.kind !== 'marketstall') continue;
    const yaw = f.yaw ?? 0;
    const fx = Math.sin(yaw),
      fz = Math.cos(yaw);
    out.push({
      kind: 'market',
      x: f.x,
      z: f.z,
      y: 0,
      yaw,
      vx: f.x - fx * 0.15 + fz * 0.2 * ((f.id % 2) * 2 - 1),
      vz: f.z - fz * 0.15 - fx * 0.2 * ((f.id % 2) * 2 - 1),
      place: { kind: 'view', node: -1, label: 'Browsing the market stalls', theme: 'market', spots: [], x: f.x + fx * 1.2, z: f.z + fz * 1.2 },
      // set up from 6:30 (the tarps come off), trading 7:30–14:30, then packing up until the tarps are back on ~17:30
      // (?nomarketday: 7:30–16:30 as before)
      open: ctx.debug.params.has('noscenes') || ctx.debug.params.has('nomarketday') ? 7.5 : 6.4,
      close: ctx.debug.params.has('noscenes') || ctx.debug.params.has('nomarketday') ? 16.5 : 17.6,
      label: 'market stall',
    });
  }
  return out;
}

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
  // a street musician on the biggest plaza: room for a little audience in front, off the walkways
  const big = areas[0];
  if (big) {
    const r = big.rect;
    const edges = peds.edges.filter((e) => e.kind !== 'crosswalk' && e.kind !== 'door');
    const bandAt = (x: number, z: number): [number, number, number] => {
      let best = Infinity,
        fx = 0,
        fz = 0;
      for (const e of edges) {
        const A = peds.nodes[e.a],
          B = peds.nodes[e.b];
        if (Math.max(A.x, B.x) < x - 12 || Math.min(A.x, B.x) > x + 12 || Math.max(A.z, B.z) < z - 12 || Math.min(A.z, B.z) > z + 12) continue;
        const dx = B.x - A.x,
          dz = B.z - A.z;
        const l2 = dx * dx + dz * dz;
        let t = l2 > 0 ? ((x - A.x) * dx + (z - A.z) * dz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(x - (A.x + dx * t), z - (A.z + dz * t)) - e.halfWidth;
        if (d < best) {
          best = d;
          fx = A.x + dx * t - x;
          fz = A.z + dz * t - z;
        }
      }
      return [best, fx, fz];
    };
    const lKeep = keep.filter((d) => d.x > r.x0 - 4 - d.r && d.x < r.x1 + 4 + d.r && d.z > r.z0 - 4 - d.r && d.z < r.z1 + 4 + d.r);
    let pick: { x: number; z: number; yaw: number; key: number } | null = null;
    for (let z = r.z0 + 2; z < r.z1 - 2; z += 0.75)
      for (let x = r.x0 + 2; x < r.x1 - 2; x += 0.75) {
        const [band, fx, fz] = bandAt(x, z);
        if (band < 3.4 || band > 6.5) continue;
        if (occ.anyInCircle(x, z, 3.0, hard)) continue;
        if (lKeep.some((d) => Math.hypot(d.x - x, d.z - z) < d.r + 3.2)) continue;
        if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 9)) continue;
        const yaw = Math.round(Math.atan2(fx, fz) / (Math.PI / 4)) * (Math.PI / 4);
        const key = Math.abs(band - 4.5) + rng.next();
        if (!pick || key < pick.key) pick = { x, z, yaw, key };
      }
    if (pick) {
      const fx = Math.sin(pick.yaw),
        fz = Math.cos(pick.yaw);
      const spots: Spot[] = [];
      for (const a of [-0.85, -0.3, 0.3, 0.85]) {
        const dx = Math.sin(pick.yaw + a) * 2.3,
          dz = Math.cos(pick.yaw + a) * 2.3;
        spots.push({ x: pick.x + dx, z: pick.z + dz, y: 0, yaw: Math.atan2(-dx, -dz) + rng.range(-0.15, 0.15), taken: -1 });
      }
      let node = -1,
        bd = 12;
      for (const nd of peds.nodes) {
        if (nd.kind === 'door' || Math.abs(nd.x - pick.x) > bd || Math.abs(nd.z - pick.z) > bd) continue;
        if (nd.edges.some((eid) => peds.edges[eid].kind === 'crosswalk' || peds.edges[eid].kind === 'door')) continue;
        const d = Math.hypot(nd.x - (pick.x + fx * 2.3), nd.z - (pick.z + fz * 2.3));
        if (d < bd) {
          bd = d;
          node = nd.id;
        }
      }
      if (node >= 0) {
        const [label, name] = LABELS.busker;
        out.push({ kind: 'busker', x: pick.x, z: pick.z, y: 0, yaw: pick.yaw, vx: pick.x, vz: pick.z, place: { kind: 'view', node, label, theme: 'busker', spots, x: pick.x, z: pick.z }, open: 11, close: 21.5, label: name });
      }
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

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();

// ── carts made by someone (?noshapecarts: the earlier boxes) ──

const CHROME = '#c6c9cc';
const TYRE = '#26282b';

/** a box whose corners were bent or moulded, smooth from one face into the next */
function rbox(s: Sink, w: number, h: number, d: number, x: number, y: number, z: number, color: string, r: number, seg = 2): void {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w * 0.49, h * 0.49, d * 0.49));
  g.translate(x, y + h / 2, z);
  s.add(g, color);
}

/** a tube between two points */
function bar(s: Sink, a: [number, number, number], b: [number, number, number], r: number, color: string, seg = 6): void {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz);
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
  g.applyQuaternion(_q.setFromUnitVectors(_up, _v.set(dx / L, dy / L, dz / L)));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  s.add(g, color);
}

/** a spoked cart wheel on an axle along x, centre (x, y, z) */
function wheel(s: Sink, x: number, y: number, z: number, r: number, spokes = 8): void {
  const t = new THREE.TorusGeometry(r - 0.016, 0.018, 5, 18);
  t.rotateY(Math.PI / 2);
  t.translate(x, y, z);
  s.add(t, TYRE);
  const rim = new THREE.TorusGeometry(r - 0.036, 0.008, 4, 18);
  rim.rotateY(Math.PI / 2);
  rim.translate(x, y, z);
  s.add(rim, CHROME);
  const hub = new THREE.CylinderGeometry(0.028, 0.028, 0.05, 8);
  hub.rotateZ(Math.PI / 2);
  hub.translate(x, y, z);
  s.add(hub, '#55585c');
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    bar(s, [x, y, z], [x, y + Math.sin(a) * (r - 0.04), z + Math.cos(a) * (r - 0.04)], 0.0045, CHROME, 3);
  }
}

/** one scoop: a ball that was pressed out of the paddle, so it has a torn skirt round its foot and a few ridges */
function scoop(s: Sink, r: number, x: number, y: number, z: number, color: string, seed: number): void {
  const g = new THREE.SphereGeometry(r, 10, 7);
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    const px = P.getX(i) / r,
      py = P.getY(i) / r,
      pz = P.getZ(i) / r;
    const a = Math.atan2(pz, px);
    const ridge = Math.sin(a * 3 + py * 5 + seed) * 0.05 + Math.sin(a * 7 - py * 3 + seed * 2) * 0.03;
    const skirt = py < -0.3 ? (1 + Math.sin(a * 5 + seed * 3) * 0.5) * 0.2 * (-py - 0.3) : 0;
    const k = r * (1 + ridge + skirt);
    P.setXYZ(i, px * k, py * r * 0.86, pz * k);
  }
  g.computeVertexNormals();
  g.translate(x, y, z);
  s.add(g, color);
}

/** a domed parasol: gores between ribs, a scalloped valance, the runner on its pole */
function domeParasol(s: Sink, r: number, y: number, x: number, z: number, c0: string, c1: string): void {
  const n = 8;
  const sag = 0.44;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2,
      da = (Math.PI * 2) / n;
    const g = new THREE.SphereGeometry(r, 3, 5, a0, da, 0, Math.PI * 0.45);
    g.scale(1, sag, 1);
    g.translate(x, y - sag * r * Math.cos(Math.PI * 0.45) + 0.0, z);
    // the cloth from underneath, in its own shade
    const un = g.clone();
    const I = un.index as THREE.BufferAttribute;
    for (let q = 0; q < I.count; q += 3) {
      const a = I.getX(q);
      I.setX(q, I.getX(q + 1));
      I.setX(q + 1, a);
    }
    const NN = un.getAttribute('normal') as THREE.BufferAttribute;
    for (let q = 0; q < NN.count; q++) NN.setXYZ(q, -NN.getX(q), -NN.getY(q), -NN.getZ(q));
    s.add(un, shadeHex(i % 2 ? c0 : c1, 0.72));
    s.add(g, i % 2 ? c0 : c1);
    // the valance hangs from the rim in a shallow scallop
    const rimY = y;
    const v0 = new THREE.BufferGeometry();
    const pos: number[] = [];
    const nrm: number[] = [];
    const R = r * Math.sin(Math.PI * 0.45);
    const k = 6;
    for (let j = 0; j <= k; j++) {
      const t = j / k;
      const a = a0 + t * da;
      const cx = Math.sin(a),
        cz = Math.cos(a);
      const drop = 0.05 + 0.055 * Math.sin(t * Math.PI);
      pos.push(x + cx * R, rimY, z + cz * R, x + cx * R, rimY - drop, z + cz * R);
      nrm.push(cx, 0, cz, cx, 0, cz);
    }
    const idx: number[] = [];
    for (let j = 0; j < k; j++) {
      const q = j * 2;
      idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2, q, q + 2, q + 1, q + 1, q + 2, q + 3);
    }
    v0.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    v0.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    v0.setIndex(idx);
    s.add(v0, i % 2 ? c0 : c1);
    // the rib under the seam
    const ax = Math.sin(a0),
      az = Math.cos(a0);
    bar(s, [x + ax * R * 0.98, rimY - 0.01, z + az * R * 0.98], [x + ax * 0.03, y + 0.1 * r, z + az * 0.03], 0.006, CHROME, 3);
    bar(s, [x + ax * R * 0.48, y + 0.1 * r - 0.03, z + az * R * 0.48], [x, y - 0.42, z], 0.005, CHROME, 3);
  }
  s.cyl(0.018, 0.018, y + sag * r * 0.72, x, 0, z, '#d8d4ca', 8);
  s.cyl(0.03, 0.03, 0.09, x, y - 0.47, z, CHROME, 8);
  const top = y + sag * r * (1 - Math.cos(Math.PI * 0.45)) + 0.015;
  const ball = new THREE.SphereGeometry(0.022, 8, 6);
  ball.translate(x, top, z);
  s.add(ball, CHROME);
}

/** the frame a cart is pushed by: two uprights and a grip, on the side away from the customers */
function pushBar(s: Sink, x0: number, x1: number, y0: number, y1: number, z: number): void {
  for (const x of [x0, x1]) bar(s, [x, y0, z], [x, y1, z - 0.1], 0.012, CHROME);
  bar(s, [x0, y1, z - 0.1], [x1, y1, z - 0.1], 0.016, '#2a2c30');
}

function shapedCart(s: Sink, st: Stall, rng: Rng): void {
  switch (st.kind) {
    case 'icecream': {
      const body = rng.pick(['#f6d6e2', '#cfe8e2', '#f6efd8']);
      // the enamelled body on its underframe, a coloured band and a chrome rub strip, a door in the back
      rbox(s, 1.19, 0.05, 0.66, 0, 0.2, 0, '#55585c', 0.015, 1);
      rbox(s, 1.25, 0.62, 0.72, 0, 0.24, 0, body, 0.05);
      rbox(s, 1.262, 0.1, 0.732, 0, 0.62, 0, '#e8432e', 0.03, 1);
      rbox(s, 1.268, 0.014, 0.738, 0, 0.61, 0, CHROME, 0.006, 1);
      rbox(s, 0.92, 0.3, 0.012, 0, 0.29, 0.36, body, 0.004, 1);
      rbox(s, 0.72, 0.3, 0.012, 0, 0.29, -0.36, body, 0.004, 1);
      s.cyl(0.018, 0.018, 0.012, 0.28, 0.44, -0.372, CHROME, 8);
      // the stainless top, its well, tubs set into it
      rbox(s, 1.31, 0.04, 0.78, 0, 0.86, 0, '#cfd2d4', 0.018, 1);
      rbox(s, 1.14, 0.01, 0.46, 0, 0.895, -0.06, '#a7abaf', 0.004, 1);
      const flav = rng.chance(0.5) ? ['#f3e7c9', '#e7a6b8', '#6e452c', '#b8d88a'] : ['#f6e3a8', '#d87a93', '#7d5233', '#f1efe6'];
      for (let i = 0; i < 4; i++) {
        const tx = -0.405 + i * 0.27,
          tz = -0.06;
        const rim = new THREE.TorusGeometry(0.112, 0.01, 5, 18);
        rim.rotateX(Math.PI / 2);
        rim.translate(tx, 0.91, tz);
        s.add(rim, CHROME);
        s.cyl(0.108, 0.108, 0.018, tx, 0.895, tz, flav[i], 16);
        const c = flav[i];
        scoop(s, 0.058, tx - 0.04, 0.945, tz + 0.02, c, i * 3 + 1);
        scoop(s, 0.052, tx + 0.045, 0.94, tz - 0.03, c, i * 3 + 2);
        if (i % 2 === 0) scoop(s, 0.046, tx + 0.005, 0.99, tz + 0.03, c, i * 3 + 3);
        // the paddle left standing in it
        bar(s, [tx + 0.06, 0.93, tz + 0.05], [tx + 0.1, 1.08, tz + 0.09], 0.005, CHROME, 4);
        rbox(s, 0.026, 0.008, 0.05, tx + 0.104, 1.08, tz + 0.1, '#2a2c30', 0.003, 1);
      }
      // the hood, hinged up on the vendor's side
      rbox(s, 1.16, 0.015, 0.34, 0, 1.1, -0.34, '#dfe2e3', 0.007, 1);
      for (const x of [-0.56, 0.56]) bar(s, [x, 0.9, -0.28], [x, 1.1, -0.28], 0.007, CHROME, 5);
      // cones stacked point down in their sleeve, and a tin for the paddles
      s.cyl(0.042, 0.042, 0.16, 0.56, 0.9, 0.27, CHROME, 12);
      for (let i = 0; i < 4; i++) {
        const c = new THREE.ConeGeometry(0.038, 0.12, 10, 1, true);
        c.rotateX(Math.PI);
        c.translate(0.56, 1.06 + i * 0.022, 0.27);
        s.add(c, i % 2 ? '#d8a660' : '#cf9a52');
      }
      s.cyl(0.05, 0.05, 0.09, -0.56, 0.9, 0.27, '#b9bcbf', 12);
      wheel(s, -0.655, 0.2, -0.16, 0.2);
      wheel(s, 0.655, 0.2, -0.16, 0.2);
      s.cyl(0.025, 0.025, 0.2, -0.45, 0, 0.26, '#55585c', 8);
      s.cyl(0.025, 0.025, 0.2, 0.45, 0, 0.26, '#55585c', 8);
      pushBar(s, -0.5, 0.5, 0.74, 1.0, -0.37);
      // (clamped to the back of the cart, not up through the tubs)
      rbox(s, 0.06, 0.05, 0.05, 0, 0.72, -0.385, CHROME, 0.01, 1);
      domeParasol(s, 1.02, 2.05, 0, -0.415, '#e8432e', '#f7f3ea');
      break;
    }
    case 'juice': {
      // a trestle table with a cloth, a pyramid of oranges, the press, cups
      rbox(s, 1.5, 0.04, 0.75, 0, 0.82, 0, '#c9a46e', 0.012, 1);
      rbox(s, 1.53, 0.66, 0.012, 0, 0.17, 0.375, '#f2a33a', 0.004, 1);
      for (const x of [-0.7, 0.7]) for (const z of [-0.32, 0.32]) bar(s, [x, 0, z], [x * 0.96, 0.82, z * 0.92], 0.02, '#8a6a44', 6);
      for (const x of [-0.68, 0.68]) bar(s, [x, 0.3, -0.3], [x, 0.3, 0.3], 0.01, '#8a6a44', 5);
      for (let k = 0; k < 3; k++)
        for (let i = 0; i < 4 - k; i++)
          for (let j = 0; j < 3 - k; j++) {
            const g = new THREE.SphereGeometry(0.046, 8, 6);
            g.translate(-0.55 + (i + k * 0.5) * 0.095, 0.905 + k * 0.078, -0.1 + (j + k * 0.5) * 0.095);
            s.add(g, (i + j + k) % 3 === 0 ? '#f39a1c' : '#ee8d18');
          }
      rbox(s, 0.22, 0.05, 0.2, 0.32, 0.86, -0.05, '#9aa0a4', 0.015, 1);
      bar(s, [0.27, 0.9, -0.1], [0.27, 1.26, -0.1], 0.012, CHROME);
      bar(s, [0.37, 0.9, -0.1], [0.37, 1.26, -0.1], 0.012, CHROME);
      rbox(s, 0.16, 0.05, 0.05, 0.32, 1.25, -0.1, '#70757a', 0.012, 1);
      s.cyl(0.075, 0.06, 0.06, 0.32, 1.02, -0.02, CHROME, 14);
      bar(s, [0.4, 1.27, -0.1], [0.56, 1.34, -0.1], 0.009, '#2a2c30');
      s.cyl(0.07, 0.07, 0.11, 0.32, 0.9, 0.05, '#f39a1c', 14);
      for (let i = 0; i < 4; i++) s.cyl(0.03, 0.036, 0.09, 0.03 + i * 0.075, 0.86, 0.22, '#f7a73a', 10);
      rbox(s, 0.5, 0.34, 0.012, 0, 0.98, 0.36, '#fbf3df', 0.004, 1);
      domeParasol(s, 1.15, 2.1, 0, -0.05, '#f39a1c', '#fbf3df');
      break;
    }
    case 'flowers': {
      // a barrow: slatted sides on two wheels, zinc buckets of cut flowers in bunches
      rbox(s, 1.4, 0.05, 0.7, 0, 0.3, 0, '#3f6b4f', 0.012, 1);
      for (let k = 0; k < 4; k++)
        for (const z of [-0.345, 0.345]) rbox(s, 1.4, 0.075, 0.018, 0, 0.36 + k * 0.1, z, k % 2 ? '#3a6349' : '#457456', 0.006, 1);
      for (let k = 0; k < 4; k++) for (const x of [-0.695, 0.695]) rbox(s, 0.018, 0.075, 0.69, x, 0.36 + k * 0.1, 0, k % 2 ? '#3a6349' : '#457456', 0.006, 1);
      for (const x of [-0.68, 0.68]) for (const z of [-0.33, 0.33]) bar(s, [x, 0.22, z], [x, 0.82, z], 0.014, '#2f5240', 6);
      wheel(s, -0.73, 0.26, 0, 0.26, 10);
      wheel(s, 0.73, 0.26, 0, 0.26, 10);
      bar(s, [-0.73, 0.26, 0], [0.73, 0.26, 0], 0.012, '#55585c', 6);
      for (const x of [-0.55, 0.55]) bar(s, [x, 0, -0.3], [x, 0.3, -0.3], 0.018, '#2f5240', 6);
      pushBar(s, -0.42, 0.42, 0.6, 0.98, -0.36);
      const fl = ['#e8649a', '#f2c84b', '#e8574f', '#b46ad6', '#f5f0e6', '#f08a3c', '#8f9ee8', '#d23c5a'];
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 2; j++) {
          const x = -0.48 + i * 0.32,
            z = -0.15 + j * 0.3;
          const by = 0.76;
          s.cyl(0.095, 0.125, 0.25, x, by, z, '#8b939a', 14);
          const rim = new THREE.TorusGeometry(0.125, 0.005, 4, 14);
          rim.rotateX(Math.PI / 2);
          rim.translate(x, by + 0.25, z);
          s.add(rim, '#a3aab0');
          const c = fl[(i * 2 + j) % fl.length];
          // a bunch: stems out of the water, leaves, heads at different heights, leaning out
          for (let h = 0; h < 8; h++) {
            const a = h * 2.4 + i + j * 2;
            const out = 0.03 + 0.085 * ((h * 37 + i * 11) % 10) * 0.1;
            const hx = x + Math.cos(a) * out,
              hz = z + Math.sin(a) * out;
            const hy = by + 0.42 + ((h * 53 + j * 17) % 10) * 0.016 + j * 0.05;
            bar(s, [x + Math.cos(a) * 0.02, by + 0.2, z + Math.sin(a) * 0.02], [hx, hy, hz], 0.004, '#4f7a3a', 3);
            const f = new THREE.SphereGeometry(0.036, 6, 4);
            f.scale(1, 0.72, 1);
            f.translate(hx, hy, hz);
            s.add(f, h % 3 === 2 ? shadeHex(c, 0.82) : c);
            if (h % 2 === 0) {
              const lf = new THREE.SphereGeometry(0.03, 5, 3);
              lf.scale(0.5, 0.18, 1.5);
              lf.rotateY(a);
              lf.translate(x + Math.cos(a) * out * 0.8, hy - 0.11, z + Math.sin(a) * out * 0.8);
              s.add(lf, '#4f7a3a');
            }
          }
        }
      domeParasol(s, 1.0, 2.0, 0, 0, '#3f6b4f', '#f5f0e6');
      break;
    }
    case 'pretzel': {
      rbox(s, 1.3, 0.72, 0.68, 0, 0.22, 0, '#b8bdc2', 0.03);
      for (let i = 0; i < 2; i++) rbox(s, 0.5, 0.5, 0.008, -0.31 + i * 0.62, 0.33, 0.342, '#a9aeb3', 0.004, 1);
      rbox(s, 1.34, 0.035, 0.72, 0, 0.94, 0, '#d9dcdf', 0.012, 1);
      // the warm cabinet: a frame with pretzels on pegs behind it, a coffee machine with its spout
      for (const [x, z] of [[-0.56, -0.13], [0.12, -0.13], [-0.56, 0.24], [0.12, 0.24]]) bar(s, [x, 0.975, z], [x, 1.32, z], 0.008, CHROME, 5);
      rbox(s, 0.72, 0.012, 0.41, -0.22, 1.32, 0.055, '#dfe3e5', 0.005, 1);
      rbox(s, 0.68, 0.01, 0.37, -0.22, 0.98, 0.055, '#c9a46e', 0.003, 1);
      for (let i = 0; i < 4; i++) {
        const x = -0.47 + i * 0.165;
        for (const lift of [0, 1]) {
          if (lift === 1 && i % 2 === 0) continue;
          // the knot: a loop, and the two arms crossed over it
          const g = new THREE.TorusGeometry(0.056, 0.016, 5, 14);
          g.scale(1, 0.82, 0.9);
          g.rotateX(Math.PI / 2 - 0.25);
          g.translate(x, 1.03 + lift * 0.11, 0.055);
          s.add(g, '#a86a2c');
          bar(s, [x - 0.042, 1.034 + lift * 0.11, 0.09], [x + 0.03, 1.03 + lift * 0.11, 0.02], 0.012, '#9a5f25', 5);
          bar(s, [x + 0.042, 1.034 + lift * 0.11, 0.09], [x - 0.03, 1.03 + lift * 0.11, 0.02], 0.012, '#9a5f25', 5);
        }
      }
      rbox(s, 0.3, 0.38, 0.3, 0.42, 0.975, -0.1, '#3a3e45', 0.02);
      rbox(s, 0.2, 0.09, 0.04, 0.42, 1.15, 0.06, '#55585c', 0.01, 1);
      s.cyl(0.016, 0.012, 0.05, 0.42, 1.1, 0.07, CHROME, 8);
      s.cyl(0.03, 0.026, 0.05, 0.42, 0.975, 0.08, '#f1efe6', 10);
      for (const x of [-0.5, 0.5]) wheel(s, x * 1.34, 0.18, -0.18, 0.18);
      for (const x of [-0.5, 0.5]) s.cyl(0.02, 0.02, 0.22, x, 0, 0.24, '#55585c', 8);
      pushBar(s, -0.42, 0.42, 0.72, 1.02, -0.35);
      domeParasol(s, 1.05, 2.05, 0, 0, '#2f6b4f', '#f2efe6');
      break;
    }
    default:
      cart(s, st, rng);
  }
}

function shadeHex(c: string, k: number): string {
  return '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
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
    case 'busker': {
      // guitar in the musician's hands (average figure), the open case on the ground in front
      const body = new THREE.CylinderGeometry(0.17, 0.17, 0.09, 12);
      body.rotateX(Math.PI / 2);
      body.rotateZ(0.5);
      body.translate(-0.05, 1.06, 0.2);
      s.add(body, '#b9773a');
      const upper = new THREE.CylinderGeometry(0.13, 0.13, 0.09, 12);
      upper.rotateX(Math.PI / 2);
      upper.translate(0.08, 1.14, 0.21);
      s.add(upper, '#b9773a');
      const hole = new THREE.CircleGeometry(0.045, 10);
      hole.translate(0.02, 1.1, 0.256);
      s.add(hole, '#2a1a10');
      const neck = new THREE.BoxGeometry(0.42, 0.05, 0.03);
      neck.rotateZ(0.5);
      neck.translate(0.3, 1.27, 0.23);
      s.add(neck, '#4a2f1c');
      s.box(0.95, 0.08, 0.36, 0, 0, 0.75, '#2a2c30');
      s.box(0.85, 0.02, 0.28, 0, 0.06, 0.75, '#8c1f2a');
      s.ball(0.03, 0.15, 0.09, 0.75, '#d8b84a');
      s.ball(0.03, -0.1, 0.09, 0.72, '#d8b84a');
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
  if (!stalls.some((st) => st.kind !== 'market')) return null;
  const s = new Sink();
  const shaped = shapeOn('shapecarts');
  for (const st of stalls) {
    if (st.kind === 'market') continue;
    s.m.makeRotationY(st.yaw);
    s.m.setPosition(st.x, st.y, st.z);
    if (shaped) shapedCart(s, st, rng);
    else cart(s, st, rng);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
  const nrm = new THREE.Float32BufferAttribute(s.nrm, 3);
  geo.setAttribute('normal', nrm);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 3));
  geo.setIndex(s.idx);
  // (each part already has its own normals, moved with it: rounded corners stay smooth)
  if (!shaped) geo.computeVertexNormals();
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

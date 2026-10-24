// More things on lines and poles (deterministic, from the plan + services):
//   • the market square: two tall masts between the back-to-back stall rows with festoon lights and
//     bunting radiating to the surrounding rear walls (the "prayer-flag" star of the reference);
//   • lifeguard towers: red-over-yellow flags on short staffs above the hut roofs;
//   • hotels: a row of banner flags on angled staffs above the main entrance;
//   • garden rotary dryers: animated laundry on the props' lines.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import type { LampLight } from '../../core/lampLight';
import { DIR_VEC } from '../../core/geom';
import { WATER_LEVEL } from '../../core/constants';
import { Rng } from '../../core/rng';
import { ClothSystem, PAT, SHAPE } from './cloth';
import type { PoleBuilder } from './poles';

const MARKET_SETS = [
  ['#d6453d', '#f2c14e', '#3a7fc1', '#4f9d5b', '#f08a3c', '#8e5aa8', '#f4efe4'],
  ['#c8402e', '#f4efe4', '#2f5aa0'],
  ['#e8743c', '#f2c14e', '#d6453d', '#f4efe4'],
];
const BULB_WARM = ['#ffd9a0', '#ffd39a', '#ffe0b0'];

export interface ExtraStats {
  cafeLines: number;
  masts: number;
  marketLines: number;
  flags: number;
  dryers: number;
  dryerItems: number;
}

type Ground = (x: number, z: number) => number;

export function buildExtras(ctx: CityContext, cloth: ClothSystem, poles: PoleBuilder, lamps: LampLight[], opts: { bunting: boolean; laundry: boolean; flags: boolean }): ExtraStats {
  const st: ExtraStats = { cafeLines: 0, masts: 0, marketLines: 0, flags: 0, dryers: 0, dryerItems: 0 };
  const terrain = ctx.services.terrain as { height(x: number, z: number): number } | undefined;
  const ground: Ground = (x, z) => terrain?.height(x, z) ?? ctx.plan.heightAt(x, z);
  if (opts.bunting) market(ctx, cloth, poles, lamps, ground, st);
  if (opts.flags) {
    lifeguards(ctx, cloth, poles, ground, st);
    hotels(ctx, cloth, poles, ground, st);
  }
  if (opts.laundry) dryers(ctx, cloth, st);
  if (opts.bunting) cafeLights(ctx, cloth, lamps, st);
  return st;
}

// ───────────────────────────────────────────────────────────── market ──
function market(ctx: CityContext, cloth: ClothSystem, poles: PoleBuilder, lamps: LampLight[], ground: Ground, st: ExtraStats): void {
  const plan = ctx.plan;
  const area = plan.areas.find((a) => a.kind === 'market');
  if (!area) return;
  const stalls = plan.features.filter((f) => f.kind === 'marketstall' && f.x > area.rect.x0 - 1 && f.x < area.rect.x1 + 1 && f.z > area.rect.z0 - 1 && f.z < area.rect.z1 + 1);
  if (stalls.length < 4) return;
  const rng = new Rng(4711);
  // back-to-back stall pairs (backs ≤ 2 m apart): the masts go in the gaps between their rows
  const xs = [...new Set(stalls.map((s) => Math.round(s.x * 10) / 10))].sort((a, b) => a - b);
  let mastX = NaN;
  for (let i = 0; i < xs.length - 1; i++) if (xs[i + 1] - xs[i] < 2.2 && xs[i + 1] - xs[i] > 1.2) mastX = (xs[i] + xs[i + 1]) / 2;
  if (!Number.isFinite(mastX)) return;
  const rowZ = [...new Set(stalls.map((s) => Math.round(s.z * 10) / 10))].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 0; i < rowZ.length - 1; i++) if (rowZ[i + 1] - rowZ[i] > 3) gaps.push((rowZ[i] + rowZ[i + 1]) / 2);
  if (gaps.length < 2) return;
  const mz = [gaps[0], gaps[gaps.length - 1]];
  const H = 8.2;
  const tops = mz.map((z) => {
    const g = ground(mastX, z);
    poles.pole(mastX, g - 0.05, z, g + H, 0.075, '#6b5a48', '#c9a640');
    poles.box(mastX, g + 0.06, z, 0.32, 0.12, 0.32, '#5a5550');
    st.masts++;
    return new THREE.Vector3(mastX, g + H - 0.15, z);
  });
  // rear walls around the square: footprint edges of market lots facing into the square
  const anchors: { x: number; y: number; z: number }[] = [];
  const cx = (area.rect.x0 + area.rect.x1) / 2,
    cz = (area.rect.z0 + area.rect.z1) / 2;
  for (const lot of plan.lots) {
    if (lot.district !== 'market') continue;
    const f = lot.footprint;
    const y = ground((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2) + Math.min(lot.height - 1.2, 7.0);
    if (y < 5.5) continue;
    // the edge closest to the square centre, facing it
    const cand: [number, number, number, number][] = [
      [f.x1, f.z0, f.x1, f.z1],
      [f.x0, f.z0, f.x0, f.z1],
      [f.x0, f.z1, f.x1, f.z1],
      [f.x0, f.z0, f.x1, f.z0],
    ];
    for (const [ax, az, bx, bz] of cand) {
      const mx = (ax + bx) / 2,
        mz2 = (az + bz) / 2;
      // edge must face the square and lie on its boundary
      const onX = ax === bx && Math.abs(ax - area.rect.x0) < 1.2 + 0 && cx > ax;
      const onX1 = ax === bx && Math.abs(ax - area.rect.x1) < 1.2 && cx < ax;
      const onZ = az === bz && Math.abs(az - area.rect.z0) < 1.2 && cz > az;
      if (!(onX || onX1 || onZ)) continue;
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.floor(len / 4.5));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const nx = onX ? 0.06 : onX1 ? -0.06 : 0,
          nz = onZ ? 0.06 : 0;
        anchors.push({ x: ax + (bx - ax) * t + nx, y, z: az + (bz - az) * t + nz });
      }
      void mx;
      void mz2;
    }
  }
  if (!anchors.length) return;
  const addLine = (a: THREE.Vector3 | { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, kind: 'festoon' | 'bunting') => {
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (L < 3) return;
    const sag = L * rng.range(0.035, 0.05) + 0.1;
    const line = cloth.addLine({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, sag, seed: rng.next(), wire: '#2e2b28', r: 0.008 });
    st.marketLines++;
    if (kind === 'festoon') {
      const n = Math.max(2, Math.floor((L - 0.6) / 0.55));
      for (let i = 0; i < n; i++) cloth.addBulb(line, (0.3 + (i + 0.5) * ((L - 0.6) / n)) / L, rng.pick(BULB_WARM), rng.range(0.06, 0.09), 0.034);
      const nl = Math.max(2, Math.round(L / 4.5));
      for (let k = 0; k < nl; k++) {
        const s = (k + 0.5) / nl,
          bow = 4 * s * (1 - s);
        lamps.push({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s - sag * bow - 0.1, z: a.z + (b.z - a.z) * s, radius: 3.6, color: '#ffcf8f', intensity: 0.2, kind: 'plaza' });
      }
    } else {
      const set = rng.pick(MARKET_SETS);
      const w = 0.3,
        gap = 0.08;
      const n = Math.max(2, Math.floor((L - 0.6) / (w + gap)));
      for (let i = 0; i < n; i++)
        cloth.addPiece(line, (0.3 + (i + 0.5) * ((L - 0.6) / n)) / L, { w, len: 0.42, shape: SHAPE.PENNANT, col: set[i % set.length], pattern: PAT.PLAIN, weight: 0.9, phase: rng.range(0, 6.283) });
    }
  };
  // mast ↔ mast, then each mast radiates to the walls around it (alternating lights / flags)
  addLine(tops[0], tops[1], 'festoon');
  tops.forEach((top, ti) => {
    const near = anchors
      .map((a) => ({ a, d: Math.hypot(a.x - top.x, a.z - top.z), ang: Math.atan2(a.z - top.z, a.x - top.x) }))
      .filter((o) => o.d > 5 && o.d < 19)
      .sort((p, q) => p.ang - q.ang);
    // pick 4 anchors well spread around the mast (2–4 spans per side, sky between them)
    const picked: typeof near = [];
    for (const o of near) if (picked.every((p) => Math.abs(Math.atan2(Math.sin(p.ang - o.ang), Math.cos(p.ang - o.ang))) > 1.1)) picked.push(o);
    picked.slice(0, 4).forEach((o, k) => addLine(top, o.a, (k + ti) % 2 === 0 ? 'festoon' : 'bunting'));
  });
}

// ─────────────────────────────────────────────────────────── lifeguards ──
function lifeguards(ctx: CityContext, cloth: ClothSystem, poles: PoleBuilder, ground: Ground, st: ExtraStats): void {
  for (const f of ctx.plan.features) {
    if (f.kind !== 'lifeguard') continue;
    const gy = ground(f.x, f.z);
    const deck = Math.max(gy, WATER_LEVEL + 0.4) + 2.4;
    const roof = deck + 2.03;
    // back corner of the hut roof (local −x, −z of a +z-facing tower)
    const lx = -0.95,
      lz = -1.05;
    const x = f.x + lx * Math.cos(f.yaw) + lz * Math.sin(f.yaw),
      z = f.z - lx * Math.sin(f.yaw) + lz * Math.cos(f.yaw);
    const top = roof + 2.5;
    poles.pole(x, roof - 0.05, z, top, 0.035, '#f2efe6', '#f2efe6');
    cloth.addPoleFlag(new THREE.Vector3(x, top - 0.08, z), new THREE.Vector3(x, top - 0.68, z), { w: 0.6, len: 0.9, shape: SHAPE.RECT, col: '#d8322a', col2: '#f2c430', pattern: PAT.BANDS, weight: 1, flutter: 1.1 });
    st.flags++;
  }
}

// ─────────────────────────────────────────────────────────────── hotels ──
function hotels(ctx: CityContext, cloth: ClothSystem, poles: PoleBuilder, ground: Ground, st: ExtraStats): void {
  const designs: [string, string, number][] = [
    ['#2f5aa0', '#f4efe4', PAT.CROSS],
    ['#c8402e', '#f4efe4', PAT.TRICOLOUR],
    ['#1f7a8c', '#f2c14e', PAT.BORDER],
    ['#3f8f5a', '#f4efe4', PAT.TRICOLOUR],
    ['#f4efe4', '#c8402e', PAT.CROSS],
  ];
  for (const lot of ctx.plan.lots) {
    if (lot.kind !== 'hotel' || !lot.doors.length) continue;
    const door = lot.doors.find((d) => d.dir === lot.front) ?? lot.doors[0];
    const n = DIR_VEC[door.dir];
    const tx = -n.z,
      tz = n.x;
    const g = ground(door.x, door.z);
    const y0 = g + 5.6;
    const rng = new Rng(lot.seed >>> 0 || 3);
    const k0 = rng.int(0, designs.length - 1);
    for (let i = -1; i <= 1; i++) {
      // wall bracket on the facade, staff angled 35° up and out (≤ 1.2 m beyond the wall)
      const bx = door.x + tx * i * 3.0,
        bz = door.z + tz * i * 3.0;
      const a = new THREE.Vector3(bx + n.x * 0.04, y0, bz + n.z * 0.04);
      const ang = (32 * Math.PI) / 180;
      const L = 1.75;
      const b = new THREE.Vector3(bx + n.x * L * Math.cos(ang), y0 + L * Math.sin(ang), bz + n.z * L * Math.cos(ang));
      poles.box(a.x - n.x * 0.02, y0, a.z - n.z * 0.02, Math.abs(n.x) > 0.5 ? 0.06 : 0.16, 0.22, Math.abs(n.z) > 0.5 ? 0.06 : 0.16, '#3a3a3a');
      poles.rod(a, b, 0.022, '#d8d4cc');
      const [c1, c2, pat] = designs[(k0 + i + 1) % designs.length];
      // the flag hangs from the staff: a line piece along the staff (no sag)
      const line = cloth.addLine({ ax: a.x + n.x * 0.12, ay: a.y + 0.08, az: a.z + n.z * 0.12, bx: b.x, by: b.y, bz: b.z, sag: 0, seed: rng.next(), wire: '#d8d4cc', r: 0.01 });
      cloth.noWire(line);
      cloth.addPiece(line, 0.52, { w: L * 0.85, len: 1.35, shape: SHAPE.RECT, col: c1, col2: c2, pattern: pat, weight: 1.2, flutter: 0.8 });
      st.flags++;
    }
  }
}

// ─────────────────────────────────────────────────────────────── dryers ──
interface DryerLike {
  x: number;
  y: number;
  z: number;
  yaw0: number;
  R: number;
  H: number;
}
const DRY_COLS = ['#f2efe8', '#a8c4dc', '#e8a8b0', '#f0d890', '#2f3a52', '#6a9a6a', '#d8c8a8', '#ffffff', '#c84a3a', '#4a6a90'];

function dryers(ctx: CityContext, cloth: ClothSystem, st: ExtraStats): void {
  const ps = ctx.services.props as { washing?: DryerLike[]; setStaticLaundry?(on: boolean): void } | undefined;
  const list = ps?.washing ?? [];
  if (!list.length) return;
  for (const d of list) {
    const rng = new Rng((Math.floor(d.x * 100) * 31 + Math.floor(d.z * 100)) >>> 0 || 11);
    st.dryers++;
    for (const rr of [d.R, d.R * 0.65]) {
      for (let k = 0; k < 4; k++) {
        if (rng.chance(rr < d.R ? 0.55 : 0.2)) continue;
        const a0 = d.yaw0 + (k * Math.PI) / 2,
          a1 = d.yaw0 + ((k + 1) * Math.PI) / 2;
        const ax = d.x + Math.cos(a0) * rr,
          az = d.z + Math.sin(a0) * rr,
          bx = d.x + Math.cos(a1) * rr,
          bz = d.z + Math.sin(a1) * rr;
        const line = cloth.addLine({ ax, ay: d.H - 0.01, az, bx, by: d.H - 0.01, bz, sag: 0.025, seed: rng.next() });
        cloth.noWire(line);
        const L = Math.hypot(bx - ax, bz - az);
        let x = rng.range(0.08, 0.3);
        while (x < L - 0.2) {
          const big = rng.chance(0.3);
          const w = big ? rng.range(0.55, 0.75) : rng.range(0.22, 0.42);
          if (x + w > L - 0.06) break;
          const shirt = !big && rng.chance(0.35);
          cloth.addPiece(line, (x + w / 2) / L, {
            w,
            len: big ? rng.range(0.6, 0.8) : shirt ? w * 1.15 : rng.range(0.3, 0.45),
            shape: big ? SHAPE.SHEET : shirt ? SHAPE.SHIRT : SHAPE.RECT,
            col: rng.pick(DRY_COLS),
            col2: '#f4efe4',
            pattern: big && rng.chance(0.4) ? PAT.MIDBAND : PAT.PLAIN,
            weight: big ? 1.9 : 1.3,
            flutter: 0.8,
            phase: rng.range(0, 6.283),
          });
          st.dryerItems++;
          x += w + rng.range(0.05, 0.25);
        }
      }
    }
  }
  if (st.dryerItems > 0) ps?.setStaticLaundry?.(false);
}

// ─────────────────────────────────────────────────────── café string lights ──
interface CafeLike {
  x: number;
  z: number;
  tableY: number;
  parasol: boolean;
  source: string;
}

/**
 * Warm bulb strings between the parasol tops of a café terrace (props.cafes): a minimum spanning tree
 * over the parasols of each terrace cluster, spans ≤ 6.5 m, hanging ~2.6 m above the paving.
 */
function cafeLights(ctx: CityContext, cloth: ClothSystem, lamps: LampLight[], st: ExtraStats): void {
  const ps = ctx.services.props as { cafes?: CafeLike[] } | undefined;
  const tops = (ps?.cafes ?? []).filter((c) => c.parasol).map((c) => ({ x: c.x, y: c.tableY + 1.95, z: c.z }));
  if (tops.length < 2) return;
  const rng = new Rng(9091);
  // Prim's MST over all tops, keeping only short edges (terraces are separate clusters)
  const n = tops.length;
  const inTree = new Uint8Array(n);
  const best = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  for (let root = 0; root < n; root++) {
    if (inTree[root]) continue;
    best[root] = 0;
    from[root] = -1;
    for (;;) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!inTree[i] && best[i] < 6.5 && (u < 0 || best[i] < best[u])) u = i;
      if (u < 0) break;
      inTree[u] = 1;
      if (from[u] >= 0) {
        const a = tops[from[u]],
          b = tops[u];
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        if (L > 1.6) {
          const sag = 0.1 + L * 0.03;
          const line = cloth.addLine({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, sag, seed: rng.next(), wire: '#2a2826', r: 0.006 });
          const m = Math.max(2, Math.floor((L - 0.3) / 0.42));
          for (let i = 0; i < m; i++) cloth.addBulb(line, (0.15 + (i + 0.5) * ((L - 0.3) / m)) / L, rng.pick(BULB_WARM), rng.range(0.05, 0.07), 0.028);
          lamps.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - sag - 0.1, z: (a.z + b.z) / 2, radius: 2.8, color: '#ffcf8f', intensity: 0.16, kind: 'plaza' });
          st.cafeLines++;
        }
      }
      for (let i = 0; i < n; i++) {
        if (inTree[i]) continue;
        const d = Math.hypot(tops[i].x - tops[u].x, tops[i].z - tops[u].z);
        if (d < best[i]) {
          best[i] = d;
          from[i] = u;
        }
      }
    }
  }
}

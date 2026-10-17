// Ship-to-shore gantry cranes: geometry for the rigged mesh (gantry / trolley / spreader /
// hoist ropes as separate rig parts) + the work-cycle simulation that drives them:
//   travel along the rails → trolley out over the moored ship → lower → latch → hoist →
//   trolley back over the quay stack → lower → release → hoist → idle → next slot.
// Each crane owns two 20ft slots (adjacent bays) and toggles one "mobile" container per slot
// between the ship and the quay, so it alternately unloads and loads, forever.

import * as THREE from 'three';
import type { GlowPoint } from './material';
import { GLOW } from './material';
import { CH, CW, L20 } from './containers';
import { EMIT, HB, PAT, RIG } from './geo';

export const CRANE = {
  gauge: 7,
  legZ: 5.2,
  boomY0: 22,
  boomY1: 23.6,
  out: 25.5,
  back: -16,
  /** spreader bottom height while travelling with a container (container bottom = this − CH) */
  travelY: 13.6 + CH,
  parkY: 17.4,
  ropeTop: 23.35,
  trolleyPark: 6,
} as const;

const C_LEG = '#cf5233';
const C_LEG_DK = '#a8402a';
const C_WHITE = '#f0ece2';
const C_YEL = '#e9b83a';
const C_DARK = '#3a3d42';
const C_GLASS = '#33424d';

export interface CraneGeomInfo {
  /** crane centre x (between the rails) */
  xc: number;
  /** z the geometry was built at (rig offsets are relative to it) */
  z0: number;
  /** trolley x / spreader bottom y the geometry was built at */
  tx0: number;
  hy0: number;
}

/** Rails + end stops on the quay (static). */
export function buildCraneRails(b: HB, xc: number, za: number, zb: number): void {
  for (const sx of [-1, 1]) {
    const x = xc + (sx * CRANE.gauge) / 2;
    b.noEmit().pat(PAT.NONE);
    b.color('#9c978d');
    b.boxMM(x - 0.45, -0.05, za, x + 0.45, 0.045, zb, 1);
    b.color('#6d7075');
    b.boxMM(x - 0.08, 0.045, za, x + 0.08, 0.12, zb, 1 | 4 | 8);
    // buffers at the rail ends (yellow / black)
    for (const z of [za + 0.6, zb - 0.6]) {
      b.color('#e2b23a');
      b.box(x, 0.35, z, 0.9, 0.7, 0.9, 0, 1);
      b.color('#2b2b2b');
      b.box(x, 0.75, z, 0.92, 0.12, 0.92, 0, 1);
    }
  }
}

/** Build one crane into the rigged builder. */
export function buildCrane(b: HB, i: number, xc: number, z0: number, glows: GlowPoint[]): CraneGeomInfo {
  const g = CRANE;
  const xL = xc - g.gauge / 2,
    xW = xc + g.gauge / 2;
  const tx0 = xc + g.trolleyPark;
  const hy0 = g.parkY;
  b.noEmit().pat(PAT.NONE);
  // ── gantry (portal, boom, house, A-frame)
  b.rig(RIG.GANTRY, i);
  // sill beams + bogies + wheels
  for (const x of [xL, xW]) {
    b.color(C_LEG);
    b.box(x, 1.15, z0, 1.0, 0.8, 12.6, 0, 0);
    for (const sz of [-1, 1]) {
      const z = z0 + sz * g.legZ;
      b.color(C_DARK);
      b.box(x, 0.58, z, 0.8, 0.42, 2.6, 0, 1);
      for (const dz of [-0.75, 0.75]) b.cyl([x - 0.32, 0.42, z + dz], [x + 0.32, 0.42, z + dz], 0.3, 0.3, 8, 3);
      // amber travel beacon on the sill end
      b.color('#f2a33a').emit('#ffb347', 3.2, EMIT.BEACON, i / 4);
      b.box(x, 1.68, z + sz * 0.9, 0.22, 0.26, 0.22, 0, 1);
      b.noEmit();
      glows.push({ x, y: 1.75, z: z + sz * 0.9, size: 1.1, color: '#ffb04a', intensity: 1.4, mode: GLOW.BEACON, phase: i / 4, crane: i, craneRig: 1, day: 0.6 });
    }
  }
  // legs
  b.color(C_LEG);
  for (const x of [xL, xW])
    for (const sz of [-1, 1]) {
      const z = z0 + sz * g.legZ;
      b.box(x, (1.55 + g.boomY0) / 2, z, 0.95, g.boomY0 - 1.55, 0.95, 0, 1 | 2);
    }
  // portal beams (along x) at mid height and top, cross beams (along z) on top
  for (const sz of [-1, 1]) {
    const z = z0 + sz * g.legZ;
    b.color(C_LEG);
    b.boxMM(xL, 12.7, z - 0.4, xW, 13.6, z + 0.4, 0);
    b.boxMM(xL, 20.9, z - 0.45, xW, g.boomY0, z + 0.45, 0);
  }
  for (const x of [xL, xW]) b.boxMM(x - 0.45, 20.9, z0 - g.legZ, x + 0.45, g.boomY0, z0 + g.legZ, 0);
  // knee braces at the top corners (kept above the container path)
  b.color(C_LEG_DK);
  for (const x of [xL, xW])
    for (const sz of [-1, 1]) b.beam([x, 17.8, z0 + sz * g.legZ], [x, 20.95, z0 + sz * (g.legZ - 3.0)], 0.32, 0.32);
  for (const sz of [-1, 1]) b.beam([xL + 0.3, 16.6, z0 + sz * g.legZ], [xc - 0.6, 20.95, z0 + sz * g.legZ], 0.3, 0.3);
  // boom girders (two box girders, the trolley runs on top, ropes hang between them)
  for (const sz of [-1, 1]) {
    const z = z0 + sz * 1.8;
    b.color(C_LEG);
    b.boxMM(xc + g.back, g.boomY0, z - 0.36, xc + 19.5, g.boomY1, z + 0.36, 0);
    // tapered outreach tip
    const y0 = g.boomY0,
      y1 = g.boomY1;
    const xa = xc + 19.5,
      xb = xc + g.out;
    b.quad([xa, y0, z + 0.36 * sz], [xb, y1 - 0.85, z + 0.36 * sz], [xb, y1, z + 0.36 * sz], [xa, y1, z + 0.36 * sz]);
    b.quad([xa, y0, z - 0.36 * sz], [xa, y1, z - 0.36 * sz], [xb, y1, z - 0.36 * sz], [xb, y1 - 0.85, z - 0.36 * sz]);
    b.quad([xa, y0, z - 0.36], [xa, y0, z + 0.36], [xb, y1 - 0.85, z + 0.36], [xb, y1 - 0.85, z - 0.36]);
    b.quad([xa, y1, z - 0.36], [xb, y1, z - 0.36], [xb, y1, z + 0.36], [xa, y1, z + 0.36]);
    b.quad([xb, y1 - 0.85, z - 0.36], [xb, y1 - 0.85, z + 0.36], [xb, y1, z + 0.36], [xb, y1, z - 0.36]);
    // catwalk + handrail outside each girder
    const zc = z + sz * 0.72;
    b.color('#8d8f91');
    b.boxMM(xc + g.back + 0.5, g.boomY0 - 0.08, zc - 0.36, xc + g.out - 1.2, g.boomY0 + 0.02, zc + 0.36, 0);
    b.color(C_WHITE);
    b.boxMM(xc + g.back + 0.5, g.boomY0 + 1.0, zc + sz * 0.33 - 0.03, xc + g.out - 1.2, g.boomY0 + 1.06, zc + sz * 0.33 + 0.03, 1);
    for (let x = xc + g.back + 0.6; x < xc + g.out - 1.2; x += 2.6) b.box(x, g.boomY0 + 0.52, zc + sz * 0.33, 0.04, 1.0, 0.04, 0, 3);
  }
  // girder ties (over the legs, ends)
  b.color(C_LEG_DK);
  for (const x of [xc + g.back + 0.4, xL, xW, xc + g.out - 0.6]) b.boxMM(x - 0.25, g.boomY1 - 0.05, z0 - 2.2, x + 0.25, g.boomY1 + 0.25, z0 + 2.2, 1);
  // machinery house on the backreach
  const hx0 = xc + g.back + 0.3,
    hx1 = xc + g.back + 6.2;
  b.color(C_WHITE);
  b.boxMM(hx0, g.boomY1, z0 - 2.7, hx1, g.boomY1 + 3.4, z0 + 2.7, 1);
  b.color(C_LEG);
  b.boxMM(hx0 - 0.02, g.boomY1 + 2.55, z0 - 2.72, hx1 + 0.02, g.boomY1 + 2.95, z0 + 2.72, 1 | 2);
  b.color('#d9d4c8');
  b.boxMM(hx0 + 0.2, g.boomY1 + 3.4, z0 - 2.5, hx1 - 0.2, g.boomY1 + 3.55, z0 + 2.5, 1);
  // vents / door / windows on the house
  b.color(C_GLASS).emit('#ffd59a', 1.6, EMIT.LIGHTS);
  for (const sz of [-1, 1]) for (const x of [hx0 + 1.4, hx0 + 3.0, hx0 + 4.6]) b.box(x, g.boomY1 + 1.7, z0 + sz * 2.71, 0.8, 0.55, 0.04, 0, 1 | 2);
  b.noEmit();
  // A-frame + stays
  const ax = xc + 1.4,
    ay = 30.2;
  b.color(C_LEG);
  for (const sz of [-1, 1]) {
    const z = z0 + sz * 1.8;
    b.beam([xW, g.boomY1, z], [ax, ay, z], 0.55, 0.55);
    b.beam([xL, g.boomY1, z], [ax, ay, z], 0.55, 0.55);
    b.color('#e8e2d6');
    b.beam([ax, ay, z], [xc + 14.5, g.boomY1, z], 0.18, 0.18);
    b.beam([ax, ay, z], [xc + g.out - 0.8, g.boomY1, z], 0.18, 0.18);
    b.beam([ax, ay, z], [hx0 + 1.0, g.boomY1 + 3.4, z], 0.2, 0.2);
    b.color(C_LEG);
  }
  b.boxMM(ax - 0.4, ay - 0.5, z0 - 2.1, ax + 0.4, ay + 0.15, z0 + 2.1, 0);
  // aviation lights (red, blinking): apex, boom tip, house
  b.color('#d23a2a').emit('#ff3a22', 4.0, EMIT.BLINK, (i * 0.31) % 1);
  b.box(ax, ay + 0.32, z0, 0.3, 0.3, 0.3, 0, 1);
  b.box(xc + g.out - 0.3, g.boomY1 + 0.2, z0, 0.26, 0.26, 0.26, 0, 1);
  b.box(hx0 + 0.3, g.boomY1 + 3.7, z0 + 2.3, 0.24, 0.24, 0.24, 0, 1);
  b.noEmit();
  glows.push({ x: ax, y: ay + 0.35, z: z0, size: 1.5, color: '#ff4a30', intensity: 1.6, mode: GLOW.BLINK, phase: (i * 0.31) % 1, crane: i, craneRig: 1, day: 0.4 });
  glows.push({ x: xc + g.out - 0.3, y: g.boomY1 + 0.25, z: z0, size: 1.2, color: '#ff4a30', intensity: 1.4, mode: GLOW.BLINK, phase: (i * 0.31) % 1, crane: i, craneRig: 1, day: 0.4 });
  // floodlights under the boom
  b.color('#e8e4d8').emit('#fff1d6', 3.0, EMIT.LIGHTS);
  for (const fx of [xc - 9.5, xc + 9, xc + 15.5]) {
    for (const sz of [-1, 1]) b.box(fx, g.boomY0 - 0.12, z0 + sz * 1.8, 0.5, 0.18, 0.4, 0, 2);
  }
  b.noEmit();
  for (const fx of [xc + 9, xc + 15.5]) glows.push({ x: fx, y: 2.9, z: z0, size: 6.5, pool: true, color: '#fff0d0', intensity: 0.22, crane: i, craneRig: 1 });
  glows.push({ x: xc - 9.5, y: 0.08, z: z0, size: 7.0, pool: true, color: '#fff0d0', intensity: 0.26, crane: i, craneRig: 1 });

  // ── trolley + operator cab
  b.rig(RIG.TROLLEY, i);
  b.color(C_YEL);
  b.boxMM(tx0 - 1.4, g.boomY1 + 0.05, z0 - 2.3, tx0 + 1.4, g.boomY1 + 1.05, z0 + 2.3, 1);
  b.color(C_DARK);
  for (const sz of [-1, 1]) b.boxMM(tx0 - 1.2, g.boomY1, z0 + sz * 1.8 - 0.25, tx0 + 1.2, g.boomY1 + 0.12, z0 + sz * 1.8 + 0.25, 1);
  // cab hanger + cab (hangs beside the ropes, waterside)
  b.color(C_YEL);
  b.boxMM(tx0 + 1.0, g.boomY0 - 1.0, z0 + 2.15, tx0 + 1.25, g.boomY1, z0 + 2.4, 0);
  b.color(C_WHITE);
  b.boxMM(tx0 + 0.3, g.boomY0 - 2.9, z0 + 1.6, tx0 + 2.3, g.boomY0 - 1.0, z0 + 3.4, 0);
  b.color(C_GLASS).emit('#ffe2b0', 1.4, EMIT.LIGHTS);
  b.boxMM(tx0 + 2.29, g.boomY0 - 2.55, z0 + 1.75, tx0 + 2.33, g.boomY0 - 1.35, z0 + 3.25, 1 | 2 | 16);
  b.boxMM(tx0 + 0.45, g.boomY0 - 2.95, z0 + 1.8, tx0 + 2.15, g.boomY0 - 2.91, z0 + 3.2, 2);
  b.noEmit();

  // ── spreader (bottom at hy0)
  b.rig(RIG.SPREADER, i);
  b.color(C_YEL);
  b.boxMM(tx0 - CW / 2, hy0 + 0.02, z0 - L20 / 2, tx0 + CW / 2, hy0 + 0.38, z0 + L20 / 2, 0);
  b.color('#d0a02c');
  b.boxMM(tx0 - 0.7, hy0 + 0.38, z0 - 0.9, tx0 + 0.7, hy0 + 0.88, z0 + 0.9, 1);
  b.color(C_DARK);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(tx0 + sx * (CW / 2 - 0.15), hy0 + 0.01, z0 + sz * (L20 / 2 - 0.2), 0.22, 0.12, 0.3, 0, 2);

  // ── hoist ropes (stretch between trolley and spreader)
  b.color('#2d2f33');
  const yTop = g.ropeTop,
    yBot = hy0 + 0.88;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = tx0 + sx * 0.35,
        z = z0 + sz * 0.55;
      const w = 0.035;
      // two crossed thin quads, top vertices rig 0, bottom rig 1
      for (const [dx, dz] of [
        [w, 0],
        [0, w],
      ]) {
        b.rig(RIG.CABLE, i, 0);
        const nx = dz !== 0 ? 1 : 0,
          nz = dx !== 0 ? 1 : 0;
        const t0 = b.vtx(x - dx, yTop, z - dz, nx, 0, nz);
        const t1 = b.vtx(x + dx, yTop, z + dz, nx, 0, nz);
        b.rig(RIG.CABLE, i, 1);
        const b0 = b.vtx(x - dx, yBot, z - dz, nx, 0, nz);
        const b1 = b.vtx(x + dx, yBot, z + dz, nx, 0, nz);
        b.tri(t0, b0, b1);
        b.tri(t0, b1, t1);
        b.tri(t0, b1, b0);
        b.tri(t0, t1, b1);
      }
    }
  b.rig(RIG.STATIC);
  return { xc, z0, tx0, hy0 };
}

// ─────────────────────────────────────────────────────────── simulation ──

export type MobState = 'ship' | 'quay' | 'crane';

export interface MobileBox {
  id: number;
  state: MobState;
  /** resting place on the ship (world coords at rest: bottom centre) */
  ship: THREE.Vector3;
  /** resting place on the quay (bottom centre) */
  quay: THREE.Vector3;
}

type Phase = 'idle' | 'travel' | 'raise' | 'out' | 'lower' | 'latch' | 'lift' | 'across' | 'lower2' | 'release' | 'lift2';

export interface ShipPose {
  /** vertical offset of the ship at rest point p (heave + small roll/pitch) */
  dy(x: number, z: number): number;
}

interface Axis {
  p: number;
  v: number;
}

export class CraneSim {
  /** gantry z, trolley x, spreader-bottom y (+ velocities) */
  private gz: Axis;
  private tr: Axis;
  private ho: Axis;
  sway = 0;
  private swayV = 0;
  phase: Phase = 'idle';
  private timer: number;
  slot = 0;
  carrying = -1;
  private job: { mob: MobileBox; toQuay: boolean } | null = null;
  jobs = 0;
  travelling = false;

  constructor(
    readonly idx: number,
    readonly geom: CraneGeomInfo,
    readonly slots: number[],
    readonly mobs: MobileBox[],
    startDelay: number,
  ) {
    this.gz = { p: geom.z0, v: 0 };
    this.tr = { p: geom.tx0, v: 0 };
    this.ho = { p: geom.hy0, v: 0 };
    this.timer = startDelay;
  }

  get z(): number {
    return this.gz.p;
  }
  get tx(): number {
    return this.tr.p;
  }
  get hy(): number {
    return this.ho.p;
  }

  /** advance (dt sim seconds, any size: sub-stepped) */
  update(dt: number, pose: ShipPose): void {
    let left = Math.min(dt, 2);
    while (left > 1e-6) {
      const h = Math.min(left, 0.04);
      this.step(h, pose);
      left -= h;
    }
  }

  private pickTop(m: MobileBox, pose: ShipPose): number {
    // spreader bottom height that touches the top of container m where it rests
    if (m.state === 'ship') return m.ship.y + CH + pose.dy(m.ship.x, m.ship.z);
    return m.quay.y + CH;
  }

  private step(h: number, pose: ShipPose): void {
    const g = CRANE;
    const prevTv = this.tr.v;
    switch (this.phase) {
      case 'idle': {
        this.timer -= h;
        drive(this.ho, g.parkY, 2.2, 0.6, h);
        if (this.timer <= 0) {
          const m = this.mobs[this.slot];
          if (Math.abs(this.gz.p - this.slots[this.slot]) > 0.01) {
            this.phase = 'travel';
          } else {
            this.job = { mob: m, toQuay: m.state === 'ship' };
            this.phase = 'raise';
          }
        }
        break;
      }
      case 'travel': {
        const target = this.slots[this.slot];
        drive(this.gz, target, 0.55, 0.12, h);
        this.travelling = true;
        if (done(this.gz, target)) {
          this.travelling = false;
          this.timer = 1.5;
          this.phase = 'idle';
        }
        break;
      }
      case 'raise': {
        drive(this.ho, g.travelY, 2.2, 0.6, h);
        if (done(this.ho, g.travelY)) this.phase = 'out';
        break;
      }
      case 'out': {
        const m = this.job!.mob;
        const tx = m.state === 'ship' ? m.ship.x : m.quay.x;
        drive(this.tr, tx, 3.0, 0.7, h);
        if (done(this.tr, tx)) this.phase = 'lower';
        break;
      }
      case 'lower': {
        const top = this.pickTop(this.job!.mob, pose);
        drive(this.ho, top, 2.0, 0.55, h);
        if (Math.abs(this.ho.p - top) < 0.01) {
          this.timer = 1.6;
          this.phase = 'latch';
        }
        break;
      }
      case 'latch': {
        const m = this.job!.mob;
        this.ho.p = this.pickTop(m, pose);
        this.ho.v = 0;
        this.timer -= h;
        if (this.timer <= 0) {
          m.state = 'crane';
          this.carrying = m.id;
          this.phase = 'lift';
        }
        break;
      }
      case 'lift': {
        drive(this.ho, g.travelY, 1.6, 0.45, h);
        if (done(this.ho, g.travelY)) this.phase = 'across';
        break;
      }
      case 'across': {
        const m = this.job!.mob;
        const tx = this.job!.toQuay ? m.quay.x : m.ship.x;
        drive(this.tr, tx, 2.6, 0.55, h);
        if (done(this.tr, tx)) this.phase = 'lower2';
        break;
      }
      case 'lower2': {
        const m = this.job!.mob;
        const top = this.job!.toQuay ? m.quay.y + CH : m.ship.y + CH + pose.dy(m.ship.x, m.ship.z);
        drive(this.ho, top, 1.5, 0.45, h);
        if (Math.abs(this.ho.p - top) < 0.01) {
          this.timer = 1.3;
          this.phase = 'release';
        }
        break;
      }
      case 'release': {
        const m = this.job!.mob;
        if (!this.job!.toQuay) this.ho.p = m.ship.y + CH + pose.dy(m.ship.x, m.ship.z);
        this.ho.v = 0;
        this.timer -= h;
        if (this.timer <= 0) {
          m.state = this.job!.toQuay ? 'quay' : 'ship';
          this.carrying = -1;
          this.jobs++;
          this.phase = 'lift2';
        }
        break;
      }
      case 'lift2': {
        drive(this.ho, g.parkY, 2.4, 0.6, h);
        drive(this.tr, this.geom.tx0, 2.0, 0.4, h);
        if (done(this.ho, g.parkY) && done(this.tr, this.geom.tx0)) {
          this.job = null;
          this.slot = (this.slot + 1) % this.slots.length;
          this.timer = 4 + ((this.jobs * 7919 + this.idx * 104729) % 9);
          this.phase = 'idle';
        }
        break;
      }
    }
    // pendulum sway driven by the trolley's acceleration (damped harder near the ground)
    const ta = (this.tr.v - prevTv) / h;
    const L = Math.max(2, CRANE.ropeTop - (this.ho.p + 0.88));
    const damp = this.phase === 'lower' || this.phase === 'lower2' || this.phase === 'latch' || this.phase === 'release' ? 2.2 : 0.35;
    const acc = -(9.81 / L) * this.sway - ta * 0.9 - damp * this.swayV;
    this.swayV += acc * h;
    this.sway += this.swayV * h;
    if (Math.abs(this.sway) > 0.55) {
      this.sway = Math.sign(this.sway) * 0.55;
      this.swayV = 0;
    }
  }
}

function done(a: Axis, target: number): boolean {
  if (Math.abs(a.p - target) < 2e-3 && Math.abs(a.v) < 2e-3) {
    a.p = target;
    a.v = 0;
    return true;
  }
  return false;
}

/** trapezoidal approach of an axis towards target */
function drive(a: Axis, target: number, vmax: number, acc: number, h: number): void {
  const d = target - a.p;
  if (Math.abs(d) < 1e-4 && Math.abs(a.v) < 0.02) {
    a.p = target;
    a.v = 0;
    return;
  }
  const want = Math.sign(d) * Math.min(vmax, Math.sqrt(2 * acc * Math.abs(d)) * 0.98);
  const dv = want - a.v;
  const maxDv = acc * 1.6 * h;
  a.v += Math.max(-maxDv, Math.min(maxDv, dv));
  const np = a.p + a.v * h;
  // never overshoot
  if ((target - a.p) * (target - np) < 0) {
    a.p = target;
    a.v = 0;
  } else a.p = np;
}

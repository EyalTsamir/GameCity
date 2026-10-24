// Cinematic auto-tour: slow orbits around the points of interest alternating with
// shots that follow something interesting (a bus, a train, a boat, a car, a stroller).
// The director only decides *what* to film; the camera rig does the smooth motion.

import type { PickHit } from '../../core/context';
import type { Poi } from '../../core/plan';
import type { Scout, ScoutKind } from './scout';
import type { TourShotInfo } from '../shared';
import { TAGLINE } from '../../core/world';

export interface Pose {
  tx: number;
  ty: number;
  tz: number;
  dist: number;
  /** radians */
  yaw: number;
  pitch: number;
}

/** What the director needs from the camera rig. */
export interface TourRig {
  /** current rendered pose */
  pose(): Pose;
  /** smooth eased flight (does not cancel the tour) */
  fly(to: Pose, seconds: number): void;
  flying(): boolean;
  /** follow an entity in tour style (no UI follow card); returns false if it vanished */
  track(hit: PickHit | null, opts?: { dist: number; pitch: number; yawOffset: number }): void;
  tracking(): boolean;
  /** apply a pose directly (cinematic hold animation) */
  drive(p: Pose): void;
  /** while tracking: set the orbit offset around the entity heading */
  trackOffset(yawOffset: number, pitch: number, dist: number): void;
  caption(info: TourShotInfo | null): void;
  night(): number;
}

const POI_NOTES: Record<string, [string, string]> = {
  overview: ['Tinyhaven', TAGLINE],
  downtown: ['Downtown', 'Glass towers around the TV mast'],
  harbor: ['The Harbour', 'Gantry cranes, containers and a cargo ship'],
  beach: ['Sunny Beach & Pier', 'Ferris wheel, carousel and parasols'],
  park: ['Central Park', 'Pond, bandstand and the founder’s statue'],
  oldtown: ['Old Town', 'Pastel gables and the church square'],
  station: ['Central Station', 'Trains under the northern hills'],
  riverside: ['Riverside', 'Footbridges and picnic lawns'],
  stadium: ['Stadium & Market', 'Floodlights and striped market stalls'],
  westbrook: ['Westbrook', 'Quiet streets and back gardens'],
  industry: ['Northgate Works', 'Chimneys, tanks and warehouses'],
};

type Shot = { kind: 'poi'; poi: Poi } | { kind: 'entity'; want: ScoutKind[]; title: string };

const DEG = Math.PI / 180;

export class TourDirector {
  active = false;
  private queue: Shot[] = [];
  private phase: 'idle' | 'scouting' | 'travel' | 'hold' = 'idle';
  private t = 0;
  private hold = 12;
  private shot: Shot | null = null;
  private base: Pose | null = null;
  private spin = 0.05;
  private spun = 0;
  private entityCenter = 0;
  private entityOffset = 0;
  private entityPitch = 24 * DEG;
  private entityDist = 40;
  private cycle = 0;
  private token = 0;

  constructor(
    private rig: TourRig,
    private scout: Scout,
    private pois: Poi[],
  ) {}

  start(): void {
    this.active = true;
    this.queue = [];
    this.cycle = 0;
    this.next();
  }

  stop(): void {
    this.active = false;
    this.phase = 'idle';
    this.shot = null;
    this.token++;
    this.scout.cancel();
    this.rig.track(null);
    this.rig.caption(null);
  }

  private refill(): void {
    const byId = (id: string) => this.pois.find((p) => p.id === id);
    const order: (string | ScoutKind[])[] = [
      'overview',
      'downtown',
      ['bus'],
      'harbor',
      ['boat'],
      'beach',
      'oldtown',
      ['train'],
      'park',
      'stadium',
      ['vehicle'],
      'riverside',
      'station',
      ['pedestrian'],
      'westbrook',
      'industry',
    ];
    // a little variety on later cycles: rotate the order
    const rot = (this.cycle * 5) % order.length;
    const seq = this.cycle === 0 ? order : [...order.slice(rot), ...order.slice(0, rot)];
    // after dark, favour the lit-up places (towers, pier, old town) over quiet suburbs
    const dark = this.rig.night() > 0.6;
    const darkSkip = new Set(['westbrook', 'industry', 'riverside']);
    for (const s of seq) {
      if (typeof s === 'string') {
        if (dark && darkSkip.has(s)) continue;
        const poi = byId(s);
        if (poi) this.queue.push({ kind: 'poi', poi });
      } else {
        const title = s[0] === 'bus' ? 'On the bus route' : s[0] === 'boat' ? 'Out on the water' : s[0] === 'train' ? 'The local train' : s[0] === 'vehicle' ? 'Around town' : 'A stroll';
        this.queue.push({ kind: 'entity', want: s, title });
      }
    }
    this.cycle++;
  }

  private next(): void {
    if (!this.active) return;
    if (this.queue.length === 0) this.refill();
    const shot = this.queue.shift();
    if (!shot) return;
    this.shot = shot;
    this.t = 0;
    const token = ++this.token;
    if (shot.kind === 'poi') {
      this.rig.track(null);
      const p = shot.poi;
      const jitterYaw = (Math.random() - 0.5) * 50 * DEG;
      const pose: Pose = {
        tx: p.target.x,
        ty: p.target.y,
        tz: p.target.z,
        dist: p.distance * (0.92 + Math.random() * 0.18),
        yaw: p.yaw * DEG + jitterYaw,
        pitch: Math.min(70 * DEG, Math.max(14 * DEG, p.pitch * DEG + (Math.random() - 0.5) * 8 * DEG)),
      };
      this.base = pose;
      this.spun = 0;
      this.spin = (Math.random() < 0.5 ? -1 : 1) * (p.id === 'overview' ? 0.035 : 0.055);
      this.hold = p.id === 'overview' ? 11 : 12 + Math.random() * 3;
      const cur = this.rig.pose();
      const travel = Math.hypot(cur.tx - pose.tx, cur.tz - pose.tz);
      this.rig.fly(pose, Math.min(7, 3.2 + travel / 140));
      this.phase = 'travel';
      const note = POI_NOTES[p.id] ?? [p.name, ''];
      this.rig.caption({ title: note[0], subtitle: note[1] });
    } else {
      this.phase = 'scouting';
      const cur = this.rig.pose();
      this.scout.find(shot.want, shot.want[0] === 'pedestrian' || shot.want[0] === 'vehicle' ? { x: cur.tx, z: cur.tz } : undefined).then((hit) => {
        if (token !== this.token || !this.active) return;
        if (!hit) {
          this.next();
          return;
        }
        const kind = hit.kind;
        this.entityDist = kind === 'train' ? 70 : kind === 'boat' ? 60 : kind === 'bus' ? 42 : kind === 'pedestrian' ? 18 : 30;
        // road traffic: look down the street a little more (the arm stays in the street corridor instead
        // of swinging into the buildings beside it)
        this.entityPitch = (kind === 'train' ? 20 : kind === 'boat' ? 22 : kind === 'pedestrian' ? 26 : 27) * DEG;
        const side = Math.random() < 0.5 ? -1 : 1;
        // centre of the swing relative to "straight behind": trains & boats look best from the side
        this.entityCenter = side * (kind === 'train' ? 80 : kind === 'boat' ? 65 : kind === 'pedestrian' ? 35 : 18) * DEG;
        this.entityOffset = side * (kind === 'train' ? 28 : kind === 'boat' || kind === 'pedestrian' ? 30 : 22) * DEG;
        this.hold = kind === 'pedestrian' ? 12 : 16;
        this.rig.track(hit, { dist: this.entityDist, pitch: this.entityPitch, yawOffset: this.entityCenter + this.entityOffset });
        this.phase = 'travel';
        const info = safeInfo(hit);
        // the most descriptive line (skip bare numbers like "32 km/h")
        const line = info.find((l) => !/^\s*[\d.,]+\s*(km\/h|m\/s|kn|knots|mph)?\s*$/i.test(l) && !/^\d+\s*km\/h$/i.test(l));
        this.rig.caption({ title: hit.label, subtitle: line ?? shot.title });
      });
    }
  }

  update(dt: number): void {
    if (!this.active || !this.shot) return;
    this.t += dt;
    if (this.phase === 'scouting') {
      if (this.t > 6) this.next(); // scout gave up silently
      return;
    }
    if (this.shot.kind === 'poi') {
      if (this.phase === 'travel') {
        if (!this.rig.flying()) {
          this.phase = 'hold';
          this.t = 0;
        }
        return;
      }
      const b = this.base!;
      // the orbit eases in after the flight and out before the next one (no velocity jumps)
      const env = Math.min(smooth(0, 2.5, this.t), smooth(this.hold, this.hold - 2.5, this.t));
      this.spun += this.spin * env * dt;
      const u = Math.min(1, this.t / this.hold);
      this.rig.drive({
        tx: b.tx,
        ty: b.ty,
        tz: b.tz,
        dist: b.dist * (1 - 0.07 * (1 - Math.cos(Math.PI * u)) * 0.5),
        yaw: b.yaw + this.spun,
        pitch: b.pitch + 2.5 * DEG * Math.sin(Math.PI * u),
      });
      if (this.t > this.hold) this.next();
    } else {
      if (!this.rig.tracking()) {
        // the entity left (tunnel, despawn)
        this.next();
        return;
      }
      if (this.phase === 'travel') {
        if (!this.rig.flying()) {
          this.phase = 'hold';
          this.t = 0;
        }
        return;
      }
      // slow swing around the moving entity
      const swing = this.entityCenter + this.entityOffset * Math.cos((this.t / this.hold) * Math.PI);
      this.rig.trackOffset(swing, this.entityPitch + 4 * DEG * Math.sin(this.t * 0.3), this.entityDist * (1 + 0.1 * Math.sin(this.t * 0.2)));
      if (this.t > this.hold) this.next();
    }
  }
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function safeInfo(hit: PickHit): string[] {
  try {
    return hit.info();
  } catch {
    return [];
  }
}

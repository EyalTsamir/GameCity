// What moves near the camera, for the small life to react to: the walker behind the camera, the people on the pavement,
// the cars going by. A snapshot refreshed a few times a second into flat arrays, so that every bird and leaf can ask
// without searching the whole crowd or allocating anything.

import type { CityContext } from '../../core/context';
import { closeLifeOn } from '../../core/closeLife';
import { M_FEED } from './gestures';

const FEEDING = closeLifeOn('feeding');

/** snapshot radius around the camera (m) */
const REACH = 46;
const MAX_PEOPLE = 40;
const MAX_CARS = 12;
const PERIOD = 0.16;
const MAX_FEEDERS = 3;

interface CrowdView {
  parties: { state: string; members: { present: boolean; x: number; z: number; vx: number; vz: number; speed: number; sit: number; seed: number; yaw: number; reading: boolean; cafe: number; seatH: number; moment: number; momentK: number; look: { flags: number } }[] }[];
}
interface CarView {
  x: number;
  z: number;
  v: number;
  yaw?: number;
  heading?: number;
}

export class Movers {
  /** x, z, vx, vz per person */
  readonly people = new Float32Array(MAX_PEOPLE * 4);
  nPeople = 0;
  /** x, z, vx, vz per moving vehicle */
  readonly cars = new Float32Array(MAX_CARS * 4);
  nCars = 0;
  /** someone on a bench with crumbs: x, z, and which way they face */
  readonly feeders = new Float32Array(MAX_FEEDERS * 4);
  nFeeders = 0;
  /** the camera on the ground: where and how fast; `low` false when it is up in the air and nothing down here cares */
  camX = 0;
  camZ = 0;
  camV = 0;
  camVx = 0;
  camVz = 0;
  low = false;
  /** seconds since the camera jumped: birds under it have not "seen it come" */
  sinceCut = 0;
  /** height above the ground */
  agl = 1e3;
  private t = 0;
  private lastX = 0;
  private lastZ = 0;
  private started = false;

  constructor(private readonly ctx: CityContext) {}

  /** per frame, in real time */
  update(realDt: number): void {
    const p = this.ctx.camera.position;
    if (realDt > 0) {
      const dx = p.x - this.lastX,
        dz = p.z - this.lastZ;
      const d = Math.hypot(dx, dz);
      if (!this.started || d > 12) {
        this.sinceCut = 0;
        this.camVx = this.camVz = 0;
      } else {
        this.sinceCut += realDt;
        const k = Math.min(1, realDt * 5);
        this.camVx += (dx / realDt - this.camVx) * k;
        this.camVz += (dz / realDt - this.camVz) * k;
      }
      this.camV = Math.hypot(this.camVx, this.camVz);
    }
    this.started = true;
    this.lastX = p.x;
    this.lastZ = p.z;
    this.camX = p.x;
    this.camZ = p.z;
    this.t -= realDt;
    if (this.t > 0) return;
    this.t = PERIOD;
    const land = this.ctx.services.landscape as { height?(x: number, z: number): number } | undefined;
    this.agl = p.y - Math.max(0, land?.height ? land.height(p.x, p.z) : 0);
    this.low = this.agl < 5;
    this.nPeople = 0;
    this.nCars = 0;
    if (this.agl > REACH) return;
    const r2 = REACH * REACH;
    const crowd = (this.ctx.services.pedestrians as { _crowd?: CrowdView } | undefined)?._crowd;
    if (crowd) {
      const P = crowd.parties,
        out = this.people;
      let n = 0,
        nf = 0;
      for (let i = 0; i < P.length && n < MAX_PEOPLE; i++) {
        if (P[i].state === 'gone') continue;
        const ms = P[i].members;
        for (let k = 0; k < ms.length && n < MAX_PEOPLE; k++) {
          const m = ms[k];
          if (!m.present) continue;
          const dx = m.x - p.x,
            dz = m.z - p.z;
          if (m.sit > 0.5) {
            // some of those on a bench have brought something for the birds, by day
            if (FEEDING && nf < MAX_FEEDERS && m.sit > 0.85 && ms.length === 1 && !m.reading && m.cafe === 0 && m.seatH < 0.05 && dx * dx + dz * dz < 900 && (m.seed * 57.31) % 1 < 0.4 && this.ctx.uniforms.uDaylight.value > 0.4) {
              m.moment = M_FEED;
              const o = nf * 4;
              this.feeders[o] = m.x;
              this.feeders[o + 1] = m.z;
              this.feeders[o + 2] = Math.sin(m.yaw);
              this.feeders[o + 3] = Math.cos(m.yaw);
              nf++;
            }
            continue;
          }
          if (m.moment === M_FEED) m.moment = 0;
          if (dx * dx + dz * dz > r2) continue;
          out[n * 4] = m.x;
          out[n * 4 + 1] = m.z;
          out[n * 4 + 2] = m.vx;
          out[n * 4 + 3] = m.vz;
          n++;
        }
      }
      this.nPeople = n;
      this.nFeeders = nf;
    }
    const tr = this.ctx.services.traffic as { vehicles?(): CarView[] } | undefined;
    if (tr?.vehicles) {
      const vs = tr.vehicles(),
        out = this.cars;
      let n = 0;
      for (let i = 0; i < vs.length && n < MAX_CARS; i++) {
        const V = vs[i];
        if (V.v < 2) continue;
        const dx = V.x - p.x,
          dz = V.z - p.z;
        if (dx * dx + dz * dz > r2) continue;
        const a = V.yaw ?? V.heading ?? 0;
        out[n * 4] = V.x;
        out[n * 4 + 1] = V.z;
        out[n * 4 + 2] = Math.sin(a) * V.v;
        out[n * 4 + 3] = Math.cos(a) * V.v;
        n++;
      }
      this.nCars = n;
    }
  }
}

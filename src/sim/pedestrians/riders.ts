// The people on the two-wheelers of the traffic sim (cyclists, e-scooter riders, mopeds, delivery riders,
// motorcyclists). Traffic simulates and draws the vehicles; their riders are figures of the crowd renderer
// (no extra draw calls), posed by animate.ts from the vehicle's anchor points (models.ts RIDE), crank angle
// and lean. One Member per ridden vehicle, kept on the vehicle (`rider`), made when it first appears.

import type { CityContext } from '../../core/context';
import { Rng } from '../../core/rng';
import { RIDE } from '../traffic/models';
import type { Vehicle } from '../traffic/sim';
import { Member, Party } from './crowd';
import { makeLook, type Persona } from './looks';
import { HAT_STYLES } from './shader';
import { F } from './figure';

interface TrafficSvc {
  vehicles(): Vehicle[];
}

const PERSONA: Persona[] = ['commuter', 'student', 'shopper', 'tourist', 'stroller', 'nightowl'];

export class Riders {
  /** riders drawn this frame (first `n` entries are live) */
  readonly list: Member[] = [];
  n = 0;
  private svc: TrafficSvc | null;
  private ctx: CityContext;
  private nextUid = 900000;

  constructor(ctx: CityContext) {
    this.ctx = ctx;
    this.svc = (ctx.services.traffic as TrafficSvc | undefined) ?? null;
  }

  /** per frame: one posed rider per live two-wheeler */
  sync(): void {
    this.n = 0;
    const svc = this.svc;
    if (!svc || typeof svc.vehicles !== 'function') return;
    const vs = svc.vehicles();
    for (let i = 0; i < vs.length; i++) {
      const V = vs[i];
      if (!V.twoWheel || V.dead) continue;
      let m = V.rider as Member | null;
      if (!m) {
        m = this.make(V);
        V.rider = m;
      }
      const sp = V.spec;
      const G = RIDE[sp.model as 'bike' | 'moto'][sp.variant ?? 0];
      m.rideG = G;
      // root on the ground under the saddle (vehicle frame z = seatZ)
      const fx = Math.sin(V.yaw),
        fz = Math.cos(V.yaw);
      m.px = m.x;
      m.pz = m.z;
      m.x = V.x + fx * G.seatZ;
      m.z = V.z + fz * G.seatZ;
      m.y = 0.012;
      m.yaw = V.yaw;
      m.lean = V.lean;
      m.pedal = V.crank;
      m.stopped = V.v < 0.3;
      m.speed = V.v;
      m.vx = fx * V.v;
      m.vz = fz * V.v;
      m.amp = 0;
      m.fade = 1;
      m.present = true;
      this.list[this.n++] = m;
    }
  }

  private make(V: Vehicle): Member {
    const rng = new Rng(V.id * 7919 + 13);
    const sp = V.spec;
    const persona = PERSONA[V.id % PERSONA.length];
    const p = new Party(-V.id, persona);
    const h = this.ctx.clock.hours;
    const look = makeLook(rng, { persona, warm: h > 9 && h < 20, age: rng.chance(0.25) ? 'teen' : 'adult' });
    // nothing in the hands; couriers on bicycles carry the insulated delivery backpack
    look.flags &= F.BACKPACK;
    look.dog = null;
    look.pram = null;
    look.umbrellaOwner = false;
    const courier = (sp.model === 'moto' && sp.variant === 1) || (sp.model === 'bike' && sp.variant === 0 && V.id % 4 === 0);
    if (courier && sp.model === 'bike') {
      look.flags |= F.BACKPACK;
      look.bag = [0x1fb26b, 0xe8432e, 0x2a9fd8, 0xf2b81c][V.id % 4];
    }
    const st = look.style;
    if (st) {
      // helmets: always on motorbikes / mopeds, often on bicycles, rarely on e-scooters
      const helmet = sp.model === 'moto' || (sp.model === 'bike' && sp.variant !== 1 && rng.chance(sp.variant === 2 ? 0.15 : 0.55)) || (sp.variant === 1 && rng.chance(0.12));
      if (helmet) {
        st.hat = HAT_STYLES.HARDHAT;
        look.hat = sp.model === 'moto' ? [0x1d1f22, 0xf2f0eb, 0xb8202a, 0x2e5c8a, 0x6d6f73][V.id % 5] : [0x2a9fd8, 0x1d1f22, 0xf2f0eb, 0x6fbe44, 0xe8432e][V.id % 5];
      } else if (st.hat === HAT_STYLES.SUNHAT || st.hat === HAT_STYLES.FEDORA || st.hat === HAT_STYLES.BUCKET) st.hat = HAT_STYLES.NONE;
      // no long coats or skirts on the saddle
      if (st.tail === 3) st.tail = 0;
      if (sp.model !== 'bike' || sp.variant !== 2) {
        if (st.tail === 1 || st.tail === 2) st.tail = 0;
      }
    }
    const m = new Member(this.nextUid++, p, 0, look, rng.next());
    p.members.push(m);
    return m;
  }
}

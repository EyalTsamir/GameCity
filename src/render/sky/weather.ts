// The weather director (world mode; ?nostorm keeps the old even shower). A storm is one moving thing: a band of deck
// cloud tens of km wide, carried downwind across the town. Everything else follows from where its two edges are:
//
//   lead  (m along the wind, 0 = the town)  the band's front edge: once past, it is overcast and starts raining
//   trail (lead − width)                    the band's back edge: once past, the rain stops
//
// The sun is blocked by the cloud on the way to the sun, not overhead, so a low sun comes back under the departing deck
// while the sky downwind is still black: the town lit gold against a dark sky, and a rainbow on that dark side.
//
// Same field everywhere: the cloud volume and cloud shadows (uStorm, sky/cloudLayer.ts), the dome and the water's mirror
// of it (per view direction), the haze ring (per azimuth, atmoDrive).
//
// ?weather=clear|rain|storm|passage  ?stormfront=<km>: pin the lead edge (the band's width stays), for screenshots

import * as THREE from 'three';

export const FRONT_EDGE = 3500;
const DECK = 1500;

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

interface Episode {
  t0: number;
  dur: number;
  width: number;
  power: number;
}

export interface WeatherRng {
  next(): number;
  range(a: number, b: number): number;
}

export class WeatherDirector {
  /** 0..1 at the town: falling rain / how much of it is a storm (wind, waves, lightning) / wet surfaces */
  rain = 0;
  storm = 0;
  wet = 0;
  /** deck cloud straight above the town / on the way to the sun */
  overhead = 0;
  sunBlock = 0;
  /** rainbow visibility 0..1 */
  rainbow = 0;
  /** morning sea fog: how much, and the bank's west edge (m, world x; 0 is treated as 'everywhere' by the shader) */
  fog = 0;
  fogX = 600;
  /** how dark the band's sky is, 0 a grey shower .. 1 a black storm */
  dark = 0;
  /** edges of the band (m along `dir` from the town) and how much of a deck it is (0 no band) */
  lead = -1e7;
  trail = -1e7;
  amount = 0;
  dir = new THREE.Vector2(0.92, 0.39);
  /** set by the sky module: lightning right now, and the cloud layer's band uniforms (for the water's mirror of them) */
  flashNow = 0;
  layer: { uStorm: { value: THREE.Vector4 }; uStormK: { value: THREE.Vector4 } } | null = null;

  private forced: number | null = null;
  private pinned: number | null = null;
  private passage = false;
  private episode: Episode | null = null;
  private plannedDay: number;
  private power = 0;
  private fogEp: { t0: number; t1: number } | null = null;
  private fogPin: number | null = null;
  private fogForced = false;

  constructor(
    private rng: WeatherRng,
    day: number,
    params: URLSearchParams,
  ) {
    // no weather on the first day: the first impression is a clear golden hour
    this.plannedDay = day;
    const w = params.get('weather');
    if (w === 'rain') this.forced = 0.8;
    else if (w === 'storm') this.forced = 1;
    else if (w === 'clear') this.forced = 0;
    else if (w === 'passage') this.passage = true;
    if (w === 'fog') this.fogForced = true;
    const fx = params.get('fogx');
    if (fx !== null && Number.isFinite(Number(fx))) {
      this.fogForced = true;
      this.fogPin = Number(fx);
    }
    const f = params.get('stormfront');
    if (f !== null && Number.isFinite(Number(f))) this.pinned = Number(f) * 1000;
  }

  /** 0 / null: see sky service setWeather */
  setForced(v: number | null): void {
    this.forced = v;
  }

  /** the cover (0..1) of the band at signed distance s along the wind */
  coverAt(s: number): number {
    return smooth(this.lead + FRONT_EDGE, this.lead - FRONT_EDGE, s) * smooth(this.trail - FRONT_EDGE, this.trail + FRONT_EDGE, s);
  }

  private plan(day: number): void {
    this.plannedDay = day;
    const r = this.rng.next();
    const base = (day - 1) * 24;
    // sea fog rolls in before dawn on some mornings and burns off by mid morning
    if (day === 3 || (day > 3 && this.rng.next() < 0.28)) this.fogEp = { t0: base + 5.0, t1: base + this.rng.range(9, 10.2) };
    if (day === 2) {
      // the showpiece: its back edge passes at the start of the golden hour → sun under the deck, rainbow
      const dur = 2.2;
      this.episode = { t0: base + 17.3 - dur, dur, width: 26000, power: 1 };
    } else if (r < 0.3) {
      const dur = this.rng.range(1.8, 2.8);
      const end = this.rng.range(10, 23);
      this.episode = { t0: base + end - dur, dur, width: 26000, power: this.rng.range(0.75, 1) };
    } else if (r < 0.6) {
      const dur = this.rng.range(0.8, 1.5);
      this.episode = { t0: base + this.rng.range(8, 20.5), dur, width: 13000, power: this.rng.range(0.3, 0.45) };
    }
  }

  /**
   * @param now absolute game hours
   * @param snap time jump: no easing
   * @param L light direction (sun, world)
   */
  update(realDt: number, hoursDt: number, day: number, now: number, snap: boolean, sun: THREE.Vector3, wind: THREE.Vector2): void {
    let targetRain = 0,
      targetStorm = 0;
    const ws = Math.hypot(wind.x, wind.y);
    if (this.forced !== null || this.pinned !== null || this.passage) {
      if (this.forced !== null) {
        // held weather: the whole sky
        this.lead = 1e7;
        this.trail = -1e7;
        this.amount = this.forced > 0 ? 1 : 0;
        targetRain = this.forced;
        targetStorm = smooth(0.85, 1, this.forced);
        this.power = this.dark = 0.25 + 0.75 * targetStorm;
      } else {
        // pinned front, or ?weather=passage: one lap of the band over about four minutes of real time
        const width = 26000;
        const lead = this.pinned ?? ((now * 40 * 3600) % 90) * 1000 - 18000;
        this.setBand(lead, width, 1);
        const r = this.rainAt(lead, width);
        targetRain = r;
        targetStorm = this.stormAt(lead, width);
        this.power = this.dark = 1;
      }
    } else {
      if (day > this.plannedDay) this.plan(day);
      const e = this.episode;
      if (e) {
        const v = e.width / e.dur;
        const lead = v * (now - e.t0);
        this.setBand(lead, e.width, 1);
        this.power = this.dark = e.power;
        targetRain = this.rainAt(lead, e.width) * Math.min(1, 0.45 + e.power * 0.55);
        targetStorm = this.stormAt(lead, e.width) * smooth(0.5, 0.9, e.power);
        if (lead - e.width > 40000) {
          this.episode = null;
          this.amount = 0;
          this.lead = this.trail = -1e7;
        }
      } else this.amount = 0;
    }
    // ── sea fog: the bank's edge comes in from the sea (x 900 → −140: over the harbour and the old town), then lifts
    let fogT = 0,
      fogTx = 900;
    if (this.fogForced) {
      fogT = 1;
      fogTx = this.fogPin ?? 40;
    } else if (this.fogEp) {
      const e = this.fogEp;
      fogT = smooth(e.t0, e.t0 + 1.2, now) * (1 - smooth(e.t1 - 1.3, e.t1, now));
      fogTx = 900 - 1040 * smooth(e.t0, e.t0 + 2.6, now);
      if (now > e.t1) this.fogEp = null;
    }
    fogT *= 1 - Math.min(1, this.rain * 2);
    this.fog += (fogT - this.fog) * (snap ? 1 : Math.min(1, realDt * 0.5));
    this.fogX += (fogTx - this.fogX) * (snap ? 1 : Math.min(1, realDt * 0.5));

    // the band moves with the wind (a slow veer does not swing it across the sky)
    if (ws > 1e-3 && this.amount === 0) this.dir.set(wind.x / ws, wind.y / ws);

    const k = snap ? 1 : Math.min(1, realDt * 0.6);
    this.rain += (targetRain - this.rain) * k;
    this.storm += (targetStorm - this.storm) * k;

    // ── at the town
    this.overhead = this.amount * this.coverAt(0);
    // the sun ray crosses the deck's base at a horizontal offset of DECK / tan(elevation)
    const up = Math.max(sun.y, 0.08);
    const sh = Math.hypot(sun.x, sun.z) || 1;
    const s = ((this.dir.x * sun.x + this.dir.y * sun.z) / sh) * (DECK * Math.sqrt(Math.max(0, 1 - up * up))) / up;
    this.sunBlock = this.amount * this.coverAt(s);

    // ── wet surfaces: as roads/puddles.ts: wet soon after rain starts, dry over about two game hours
    if (snap) this.wet = Math.max(this.rain, this.wet);
    else if (this.rain > this.wet) this.wet += (this.rain - this.wet) * Math.min(1, hoursDt * 6);
    else this.wet = Math.max(this.rain, this.wet - hoursDt * 0.45);

    // ── rainbow: the sun must reach the town while it is raining on the anti-solar side
    const anti = -((this.dir.x * sun.x + this.dir.y * sun.z) / sh) * 14000;
    const rainWall = this.amount * smooth(this.lead - 2000, this.lead - 6000, anti) * smooth(this.trail + 500, this.trail + 3500, anti);
    const el = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(sun.y, -1, 1)));
    const rbTarget = rainWall * (1 - this.sunBlock) * smooth(0.5, 3, el) * (1 - smooth(32, 41, el)) * smooth(0.5, 0.75, this.power);
    this.rainbow += (rbTarget - this.rainbow) * (snap ? 1 : Math.min(1, realDt * 0.35));
  }

  private setBand(lead: number, width: number, amount: number): void {
    this.lead = lead;
    this.trail = lead - width;
    this.amount = amount;
  }

  private rainAt(lead: number, width: number): number {
    return smooth(1500, 5500, lead) * (1 - smooth(-3500, -300, lead - width));
  }

  private stormAt(lead: number, width: number): number {
    return smooth(3500, 9500, lead) * (1 - smooth(-10000, -4500, lead - width));
  }
}

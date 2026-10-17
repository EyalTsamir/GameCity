// Harbour fireworks: shells are fired from a moored barge, rise with sparkly gold tails and
// burst into peonies, chrysanthemums, willows, rings, palms, glitter and crackle — every star
// is a GPU-analytic particle in the shared spark system (sparks.ts), with a flash and a lingering
// coloured glow per burst. Emits ctx.events 'fireworks' {phase:'burst', x, y, z, kind} for audio.
//
// The nightly show starts when the clock enters 22:00–22:03 (once per day) and runs ~50 sim s;
// ctx.events.emit('fireworks:launch', { duration? }) starts one at any time.

import type { CityContext } from '../../core/context';
import type { Rng } from '../../core/rng';
import { SPARK, type SparkSystem } from './sparks';

type Kind = 'peony' | 'chrysanthemum' | 'willow' | 'crackle' | 'ring' | 'palm' | 'glitter';

interface Shell {
  burstAt: number;
  x: number;
  y: number;
  z: number;
  kind: Kind;
  c1: number[];
  c2: number[];
  scale: number;
}

const COLORS: number[][] = [
  [1.0, 0.16, 0.12], // red
  [0.25, 1.0, 0.32], // green
  [0.3, 0.45, 1.0], // blue
  [1.0, 0.62, 0.2], // gold
  [0.92, 0.94, 1.0], // silver
  [0.78, 0.3, 1.0], // violet
  [1.0, 0.42, 0.75], // pink
  [0.25, 0.95, 1.0], // cyan
  [1.0, 0.45, 0.08], // orange
];
const GOLD = [1.0, 0.6, 0.2];

export interface FireworksSystem {
  readonly site: { x: number; z: number };
  update(dt: number): void;
  start(duration?: number): void;
  active(): boolean;
  stats(): Record<string, number | string>;
  invariants(): string[];
}

export function createFireworks(ctx: CityContext, sparks: SparkSystem): FireworksSystem {
  const site = { x: 180, z: -58 };
  const water = () => ctx.services.water as { surfaceY(x: number, z: number): number } | undefined;
  const dens = Math.min(1, Math.max(0.5, ctx.quality.density));
  let rng: Rng = ctx.rng('fireworks');
  let showT = -1;
  let showEnd = 0;
  let nextCue = 0;
  let lastShowDay = -1;
  let bursts = 0;
  let shellsFired = 0;
  const shells: Shell[] = [];
  let phaseLabel = 'idle';

  const G_ROCKET = 22;
  const K_ROCKET = 0.12;

  /** analytic trajectory (same as the vertex shader) */
  const traj = (p0: number, v0: number, k: number, g: number, t: number) => {
    const e = Math.exp(-k * t);
    return p0 + (v0 * (1 - e)) / k - g * (t / k - (1 - e) / (k * k));
  };

  const launch = (kind: Kind, delay = 0) => {
    const T = sparks.time + delay;
    const wy = water()?.surfaceY(site.x, site.z) ?? ctx.plan.water.level;
    const x = site.x + rng.range(-2.5, 2.5),
      z = site.z + rng.range(-1.6, 1.6);
    const y0 = wy + 1.4;
    const h = rng.range(36, 56) * (kind === 'willow' || kind === 'palm' ? 1.08 : 1);
    const vy = Math.sqrt(2 * G_ROCKET * h) * 1.09;
    // lean: shells fan out a little over the water
    const vx = rng.range(-3.2, 3.2),
      vz = rng.range(-4.5, 4.5);
    const tApex = Math.log(1 + (K_ROCKET * vy) / G_ROCKET) / K_ROCKET;
    const tb = tApex * rng.range(0.9, 0.97);
    const by = traj(y0, vy, K_ROCKET, G_ROCKET, tb);
    const bx = traj(x, vx, K_ROCKET, 0, tb);
    const bz = traj(z, vz, K_ROCKET, 0, tb);
    sparks.star(x, y0, z, vx, vy, vz, tb, 2.4, 1.5, 0.6, 0.5, K_ROCKET, G_ROCKET, 0.045, SPARK.ROCKET, delay);
    // muzzle flash on the barge
    sparks.star(x, y0 - 0.6, z, 0, 0, 0, 0.18, 2.6, 1.6, 0.8, 2.2, 1, 0, 0, SPARK.FLASH, delay);
    const c1 = kind === 'willow' || kind === 'palm' ? GOLD : kind === 'glitter' || kind === 'crackle' ? (rng.next() < 0.5 ? COLORS[4] : GOLD) : rng.pick(COLORS);
    let c2 = c1;
    if ((kind === 'peony' || kind === 'chrysanthemum' || kind === 'ring') && rng.next() < 0.45) c2 = rng.pick(COLORS);
    shells.push({ burstAt: T + tb, x: bx, y: by, z: bz, kind, c1, c2, scale: rng.range(0.85, 1.15) });
    shellsFired++;
  };

  const burst = (s: Shell) => {
    const n0 = { peony: 130, chrysanthemum: 115, willow: 95, crackle: 75, ring: 72, palm: 9, glitter: 95 }[s.kind];
    const n = Math.max(6, Math.round(n0 * dens));
    const R = { peony: 17, chrysanthemum: 19, willow: 19, crackle: 14, ring: 17, palm: 21, glitter: 15 }[s.kind] * s.scale;
    const k = { peony: 2.0, chrysanthemum: 1.7, willow: 2.4, crackle: 2.2, ring: 2.0, palm: 1.15, glitter: 2.1 }[s.kind];
    const lifeR: [number, number] = { peony: [1.4, 2.0], chrysanthemum: [1.9, 2.5], willow: [3.6, 4.6], crackle: [1.5, 1.9], ring: [1.5, 1.9], palm: [2.4, 2.9], glitter: [1.9, 2.5] }[s.kind] as [number, number];
    const grav = { peony: 3.5, chrysanthemum: 4.0, willow: 5.5, crackle: 3.5, ring: 3.2, palm: 7.5, glitter: 4.0 }[s.kind];
    const spacing = { peony: 0.022, chrysanthemum: 0.05, willow: 0.14, crackle: 0.02, ring: 0.028, palm: 0.07, glitter: 0.03 }[s.kind];
    const type = { peony: SPARK.STAR, chrysanthemum: SPARK.STAR, willow: SPARK.WILLOW, crackle: SPARK.CRACKLE, ring: SPARK.STAR, palm: SPARK.WILLOW, glitter: SPARK.STROBE }[s.kind];
    const size = { peony: 0.72, chrysanthemum: 0.62, willow: 0.58, crackle: 0.58, ring: 0.72, palm: 1.25, glitter: 0.58 }[s.kind];
    const inten = { peony: 4.4, chrysanthemum: 4.0, willow: 3.0, crackle: 4.2, ring: 4.4, palm: 3.6, glitter: 4.0 }[s.kind];
    const strobeEnd = s.kind === 'peony' && rng.next() < 0.2;
    // ring plane
    const ax = rng.range(-1, 1),
      ay = rng.range(0.2, 1),
      az = rng.range(-1, 1);
    const al = Math.hypot(ax, ay, az);
    const nx = ax / al,
      ny = ay / al,
      nz = az / al;
    // two axes spanning the ring plane
    let ux = -ny,
      uy = nx,
      uz = 0;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const wx = ny * uz - nz * uy,
      wy = nz * ux - nx * uz,
      wz = nx * uy - ny * ux;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      let dx: number, dy: number, dz: number;
      if (s.kind === 'ring') {
        const a = (i / n) * Math.PI * 2;
        dx = Math.cos(a) * ux + Math.sin(a) * wx;
        dy = Math.cos(a) * uy + Math.sin(a) * wy;
        dz = Math.cos(a) * uz + Math.sin(a) * wz;
      } else {
        // even sphere (fibonacci) + jitter
        const y = 1 - ((i + 0.5) / n) * 2;
        const r = Math.sqrt(1 - y * y);
        const a = i * golden + rng.range(0, 0.3);
        dx = Math.cos(a) * r;
        dy = y;
        dz = Math.sin(a) * r;
      }
      const sp = R * k * rng.range(0.9, 1.06);
      const c = i % 2 === 0 ? s.c1 : s.c2;
      const life = rng.range(lifeR[0], lifeR[1]);
      sparks.star(s.x, s.y, s.z, dx * sp, dy * sp + 1.5, dz * sp, life, c[0] * inten, c[1] * inten, c[2] * inten, size, k, grav, spacing, strobeEnd && i % 3 === 0 ? SPARK.STROBE : type);
    }
    const cf = s.c1;
    sparks.star(s.x, s.y, s.z, 0, 0, 0, 0.26, 2.2 + cf[0] * 2.6, 2.2 + cf[1] * 2.6, 2.2 + cf[2] * 2.6, R * 0.5, 1, 0, 0, SPARK.FLASH);
    sparks.star(s.x, s.y, s.z, 0, -1.2, 0, 3.0, cf[0] * 0.12, cf[1] * 0.12, cf[2] * 0.12, R * 1.8, 0.5, 0.4, 0, SPARK.SMOKEGLOW);
    bursts++;
    ctx.events.emit('fireworks', { phase: 'burst', x: s.x, y: s.y, z: s.z, kind: s.kind });
  };

  const pickKind = (t: number, dur: number): Kind => {
    const f = t / dur;
    const r = rng.next();
    if (f > 0.85) return r < 0.35 ? 'crackle' : r < 0.55 ? 'glitter' : r < 0.8 ? 'peony' : 'willow';
    if (r < 0.28) return 'peony';
    if (r < 0.45) return 'chrysanthemum';
    if (r < 0.6) return 'willow';
    if (r < 0.72) return 'ring';
    if (r < 0.82) return 'palm';
    if (r < 0.91) return 'glitter';
    return 'crackle';
  };

  const start = (duration = 50) => {
    rng = ctx.rng(`fireworks-${ctx.clock.day}-${shellsFired}`);
    showT = 0;
    showEnd = Math.max(8, duration);
    nextCue = 1.4;
    phaseLabel = 'show';
    // opening salute: three shells at once
    launch('peony');
    launch('chrysanthemum', 0.12);
    launch('willow', 0.25);
    ctx.events.emit('fireworks:show', { phase: 'start' });
  };

  ctx.events.on('fireworks:launch', (p?: { duration?: number }) => start(typeof p?.duration === 'number' ? p.duration : 30));

  return {
    site,
    start,
    active: () => showT >= 0,
    update(dt) {
      // nightly trigger
      const h = ctx.clock.hours;
      if (showT < 0 && h >= 22 && h < 22.05 && lastShowDay !== ctx.clock.day) {
        lastShowDay = ctx.clock.day;
        start(50);
      }
      if (showT >= 0) {
        showT += dt;
        let guard = 0;
        while (showT >= nextCue && showT < showEnd && guard++ < 12) {
          const f = showT / showEnd;
          if (f > 0.84) {
            // finale: rapid fire
            launch(pickKind(showT, showEnd));
            if (rng.next() < 0.6) launch(pickKind(showT, showEnd), 0.1);
            nextCue += rng.range(0.3, 0.55);
          } else if (f > 0.3) {
            const n = rng.next() < 0.4 ? 2 : 1;
            for (let i = 0; i < n; i++) launch(pickKind(showT, showEnd), i * 0.18);
            nextCue += rng.range(1.0, 2.0);
          } else {
            launch(pickKind(showT, showEnd));
            nextCue += rng.range(0.9, 1.6);
          }
        }
        if (showT >= showEnd && shells.length === 0) {
          showT = -1;
          phaseLabel = 'idle';
          ctx.events.emit('fireworks:show', { phase: 'end' });
        }
      }
      // bursts due
      const T = sparks.time;
      for (let i = shells.length - 1; i >= 0; i--) {
        if (T >= shells[i].burstAt) {
          burst(shells[i]);
          shells.splice(i, 1);
        }
      }
    },
    stats() {
      return { fireworks: phaseLabel, fwShells: shellsFired, fwBursts: bursts, fwInFlight: shells.length };
    },
    invariants() {
      const out: string[] = [];
      for (const s of shells) if (!Number.isFinite(s.x + s.y + s.z) || s.y < 10) out.push(`fireworks: shell bursting at a bad spot (${s.x.toFixed(0)}, ${s.y.toFixed(0)}, ${s.z.toFixed(0)})`);
      if (shells.length > 64) out.push(`fireworks: ${shells.length} shells in flight`);
      return out;
    },
  };
}

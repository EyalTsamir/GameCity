// Fireflies on summer nights: a few dozen tiny yellow-green glows drifting low around the park
// pond (and a handful along the riverside), each blinking in its own slow rhythm. They use the
// CPU glow slots of the shared spark system — no extra draw call.

import type { CityContext } from '../../core/context';
import type { SparkSystem } from './sparks';
import { smooth } from './shared';

interface Fly {
  slot: number;
  cx: number;
  cz: number;
  r: number;
  h: number;
  ph: number;
  sp: number;
  period: number;
  on: number;
  x: number;
  y: number;
  z: number;
}

export interface FireflySystem {
  update(dt: number): void;
  frame(): void;
  stats(): Record<string, number>;
}

export function createFireflies(ctx: CityContext, sparks: SparkSystem): FireflySystem {
  const rng = ctx.rng('ambient-fireflies');
  const { plan } = ctx;
  const pond = plan.water.ponds[0];
  const ground = (x: number, z: number) => (ctx.services.terrain as { height(x: number, z: number): number } | undefined)?.height(x, z) ?? plan.heightAt(x, z);
  const flies: Fly[] = [];
  const add = (cx: number, cz: number) => {
    const slot = sparks.glowSlot();
    if (slot < 0) return;
    flies.push({ slot, cx, cz, r: rng.range(0.8, 2.6), h: rng.range(0.35, 1.5), ph: rng.range(0, 100), sp: rng.range(0.12, 0.3), period: rng.range(2.2, 5.5), on: 0, x: cx, y: 0, z: cz });
  };
  const dens = Math.min(1, Math.max(0.5, ctx.quality.density));
  if (pond) {
    const n = Math.round(30 * dens);
    for (let i = 0; i < n; i++) {
      // a band around the shore, a few over the water near the island
      const a = rng.range(0, Math.PI * 2);
      const k = rng.next() < 0.75 ? rng.range(0.85, 1.25) : rng.range(0.3, 0.8);
      add(pond.cx + Math.cos(a) * pond.rx * k, pond.cz + Math.sin(a) * pond.rz * k);
    }
  }
  const rv = plan.water.river;
  for (let i = 0; i < Math.round(8 * dens); i++) add(rng.range(-150, 40), rv.z1 + rng.range(1.5, 6));

  let T = 0;
  let level = 0;
  const want = () => {
    const h = ctx.clock.hours;
    const evening = h >= 20.5 || h < 3.5 ? 1 : 0;
    return evening * smooth(0.55, 0.85, ctx.clock.night) * (1 - smooth(0.05, 0.25, ctx.uniforms.uRain.value));
  };
  return {
    update(dt) {
      if (dt <= 0) return;
      T += dt;
      level += (want() - level) * Math.min(1, dt * 0.3);
    },
    frame() {
      if (level < 0.01) {
        for (const f of flies) sparks.hideGlow(f.slot);
        return;
      }
      for (const f of flies) {
        const t = T * f.sp + f.ph;
        f.x = f.cx + Math.sin(t * 1.3) * f.r + Math.sin(t * 3.1) * 0.3;
        f.z = f.cz + Math.cos(t * 1.1) * f.r * 0.8 + Math.cos(t * 2.7) * 0.3;
        const gy = Math.max(ground(f.x, f.z), pond && Math.hypot((f.x - pond.cx) / pond.rx, (f.z - pond.cz) / pond.rz) < 1 ? pond.level : -99);
        f.y = gy + f.h + Math.sin(t * 2.3) * 0.25;
        // blink: short soft pulse once per period
        const ph = ((T + f.ph * 7) % f.period) / f.period;
        const pulse = Math.exp(-(((ph - 0.12) / 0.07) ** 2)) + 0.5 * Math.exp(-(((ph - 0.3) / 0.05) ** 2));
        const b = pulse * level;
        if (b < 0.02) {
          sparks.hideGlow(f.slot);
          continue;
        }
        sparks.setGlow(f.slot, f.x, f.y, f.z, 2.0 * b, 2.8 * b, 0.6 * b, 0.38);
      }
    },
    stats() {
      return { fireflies: level > 0.05 ? flies.length : 0 };
    },
  };
}

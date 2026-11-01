// Warm light spilling from lit shop windows onto the pavement (plan lots with `shopfront`):
// a row of low aimed sources along the street facade (≈ every 4.5 m, just above the display
// windows) throwing a soft band of light 2–3 m out over the sidewalk. Registered as 'spill' lights
// in the shared lamp light map — the facade itself is not lit by them (they face away from it).

import type { CityPlan as Plan } from '../../core/plan';
import { DIR_VEC } from '../../core/geom';
import { SIDEWALK_Y } from '../../core/constants';
import type { LampLight } from '../../core/lampLight';

const WARM = ['#ffd59a', '#ffe0ae', '#ffcd88', '#fff0d6', '#ffd9a4'];

function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function shopSpillLights(plan: Plan, ground: (x: number, z: number) => number): LampLight[] {
  const out: LampLight[] = [];
  for (const lot of plan.lots) {
    if (!lot.shopfront) continue;
    const f = lot.footprint;
    const d = DIR_VEC[lot.front];
    // facade line (footprint edge on the street side) and its tangent
    const along = d.x !== 0 ? 'z' : 'x';
    const fx = d.x > 0 ? f.x1 : d.x < 0 ? f.x0 : 0;
    const fz = d.z > 0 ? f.z1 : d.z < 0 ? f.z0 : 0;
    const a0 = along === 'z' ? f.z0 : f.x0;
    const a1 = along === 'z' ? f.z1 : f.x1;
    const L = a1 - a0;
    if (L < 2.5) continue;
    const n = Math.max(1, Math.round(L / 4.5));
    const tint = WARM[Math.floor(hash(lot.id, 3) * WARM.length)];
    // a few shops are closed for the night (dim), most glow
    const shopK = hash(lot.id, 7) < 0.15 ? 0.35 : 0.8 + 0.35 * hash(lot.id, 11);
    for (let i = 0; i < n; i++) {
      const t = a0 + ((i + 0.5) * L) / n;
      const bx = along === 'z' ? fx : t;
      const bz = along === 'z' ? t : fz;
      const g = Math.max(SIDEWALK_Y, ground(bx + d.x * 2, bz + d.z * 2));
      const k = shopK * (0.85 + 0.3 * hash(bx, bz));
      out.push({
        x: bx + d.x * 0.35,
        y: g + 2.5,
        z: bz + d.z * 0.35,
        pole: 2.5,
        radius: Math.min(3.2, (L / n) * 0.75 + 0.6),
        color: tint,
        intensity: 0.42 * k,
        kind: 'spill',
        aim: [bx + d.x * 2.6, g, bz + d.z * 2.6],
        cone: 1.0,
      });
    }
  }
  return out;
}

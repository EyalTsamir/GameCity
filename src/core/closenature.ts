// Nature when you stand in it (close round 2026-11, docs/progress/close-nature.md): switches for trunks, fallen leaves,
// flowers, lawn, soil, weeds and the rest. Each one is built when the quality tier allows it and its own ?no<name> switch is
// absent; ?noclosenature turns every one off (before/after, perf A/B).

import type { CityContext, QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is close nature feature `name` on regardless of tier (`?no<name>` / `?noclosenature` off)? For what is built before the tier matters. */
/** the web of light ripples throw on a shallow bed, from close by (a few turns of a warped sine; no texture, so safe in any branch) */
export const CAUSTIC_WEB_GLSL = /* glsl */ `
float thCausticWeb(vec2 p, float t) {
  vec2 q = mod(p * 5.236, 6.2832) - 250.0;
  vec2 i = q;
  float c = 1.0;
  for (int n = 0; n < 3; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = q + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(q.x / (sin(i.x + tt) * 200.0), q.y / (cos(i.y + tt) * 200.0)));
  }
  c = 1.17 - pow(c / 3.0, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}
`;

export function closeNatureOn(name: string): boolean {
  return !(params && (params.has('noclosenature') || params.has('no' + name)));
}

/** is close nature feature `name` on (`?no<name>` / `?noclosenature` off; below quality tier `min` off)? */
export function closeNature(ctx: Pick<CityContext, 'quality'>, name: string, min: QualityLevel = 'medium'): boolean {
  return closeNatureOn(name) && RANK[ctx.quality.level] >= RANK[min];
}

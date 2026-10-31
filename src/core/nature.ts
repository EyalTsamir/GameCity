// Nature and the horizon (detail round 2026-10, docs/progress/detail-nature.md): switches for the farmland, country
// tree, coast and skyline features. Each one is built when the quality tier allows it and its own ?no<name> switch is
// absent; ?nonature turns every one off (before/after, perf A/B).

import type { CityContext, QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is nature feature `name` on regardless of tier (`?no<name>` / `?nonature` off)? Build-time, also for three-free data. */
export function natureOn(name: string): boolean {
  return !(params && (params.has('nonature') || params.has('no' + name)));
}

/** is nature feature `name` on (`?no<name>` / `?nonature` off; below quality tier `min` off)? */
export function nature(ctx: Pick<CityContext, 'quality'>, name: string, min: QualityLevel = 'medium'): boolean {
  return natureOn(name) && RANK[ctx.quality.level] >= RANK[min];
}

/** the country under the moon: the night key is set for the lit city, out here it would leave the ground black. Lifts what
 *  the moon and the sky already light, so moon shadows stay, and takes the colour down toward blue as the eye does at night;
 *  `k` is 0..1, the fade by the slab */
export const moonLift = (k = '1.0'): string =>
  natureOn('moonlit')
    ? `{ float mk = uNight * (${k}); float ml = 1.0 + 2.6 * mk; vec3 mt = vec3(0.3, 0.59, 0.11); vec3 mb = vec3(0.74, 0.88, 1.12);
  reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, dot(reflectedLight.indirectDiffuse, mt) * mb, 0.6 * mk) * ml;
  reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, dot(reflectedLight.directDiffuse, mt) * mb, 0.6 * mk) * ml; }`
    : '';

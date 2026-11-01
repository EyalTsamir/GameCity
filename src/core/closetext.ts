// Text you can read (close-up round, docs/progress/close-text.md): switches for the lettering module. Each family is
// built when the quality tier allows it and its own ?no<name> switch is absent; ?nolettering turns all of it off,
// including the shop names (the signs then read as they did before: "Bakery", "Books").

import type { CityContext, QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is lettering family `name` on regardless of tier (`?no<name>` / `?nolettering` off)? Build-time, also for three-free data. */
export function textOn(name?: string): boolean {
  return !(params && (params.has('nolettering') || (name !== undefined && params.has('no' + name))));
}

/** is lettering family `name` on (`?no<name>` / `?nolettering` off; below quality tier `min` off)? */
export function closeText(ctx: Pick<CityContext, 'quality'>, name: string, min: QualityLevel = 'medium'): boolean {
  return textOn(name) && RANK[ctx.quality.level] >= RANK[min];
}

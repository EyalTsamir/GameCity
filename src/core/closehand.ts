// What the eye checks when it stands close to a building (close-up round, docs/progress/close-hand.md): switches for the
// handheight module. Each family is built when the quality tier allows it and its own ?no<name> switch is absent; ?nohand
// turns all of it off and gives the old boxes on the doors back. Generators have no ctx: buildings.ts tells this file the tier.

import type { CityContext, QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
let level: QualityLevel = 'high';

/** buildings.ts, before any lot is built */
export function setHandLevel(q: QualityLevel): void {
  level = q;
}

/** is family `name` on regardless of tier (`?no<name>` / `?nohand` off)? */
export function handOn(name?: string): boolean {
  return !(params && (params.has('nohand') || (name !== undefined && params.has('no' + name))));
}

/** are the near door kits there to take over from the boxes in the merged trim? (the bubble has no layers on low) */
export function handDoorsLive(): boolean {
  return handOn('handdoors') && !(params && params.has('nonear')) && RANK[level] >= RANK.medium;
}

/** do the roofs' tiles show what they are made of up close? (shader term, ?nohandroofs) */
export function handRoofsLive(): boolean {
  return handOn('handroofs') && RANK[level] >= RANK.medium;
}

/** is family `name` on (`?no<name>` / `?nohand` off; below quality tier `min` off)? */
export function closeHand(ctx: Pick<CityContext, 'quality'>, name?: string, min: QualityLevel = 'medium'): boolean {
  return handOn(name) && RANK[ctx.quality.level] >= RANK[min];
}

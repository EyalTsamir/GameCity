// Close vehicles (close-up round 2026-11, docs/progress/close-vehicles.md): switches of the level drawn for a vehicle beside
// the camera. `?noclosevehicles` turns all of it off, `?no<name>` one feature.
//   vehclose    the close level itself (real glass, cabins, lens lamps; off = the old nearest level everywhere)
//   vehcabin    built cabins behind the glass        vehlens     lamps with a lens, a bowl and bulbs
//   vehwear     chips, scratches, dust, runs         vehwheel    tread, brakes, struts, arch liners
//   vehflare    lamp flares at the real lamps, none at arm's length
//   vehground   the soft dark under every nearby vehicle

import type { CityContext, QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is close-vehicle feature `name` on regardless of tier? Build-time, also where no context is at hand. */
export function closeVehOn(name: string): boolean {
  return !(params && (params.has('noclosevehicles') || params.has('no' + name)));
}

/** is close-vehicle feature `name` on (off below quality tier `min`)? */
export function closeVeh(ctx: Pick<CityContext, 'quality'>, name: string, min: QualityLevel = 'medium'): boolean {
  return closeVehOn(name) && RANK[ctx.quality.level] >= RANK[min];
}

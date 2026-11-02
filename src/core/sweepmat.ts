// Wrong and stretched materials (docs/progress/sweep-materials.md): switches. Each fix is on when the quality tier allows it and its own ?no<name>
// switch is absent; ?nosweepmat turns every one off (before/after).
//   matclass    the close-up layer takes its material from what the mesh says it is, not from a guess at its colour (wood grain on sandstone and steel)
//   matportal   the road tunnel's ring is separate stones with joints, its lamps are fittings
//   matframe    the close-up layer's coordinate lies in the facet, so round things have no smeared seam and no multiplied texture
//   mattop      a crop's top strip is not drawn from under it (flower heads as slabs across the sky)
//   mathedge    a clipped hedge up close is leaves, not camouflage
//   matriser    the riser of a pad or step has a surface of its own, in both the paving's shader and the close-up layer (vertical stripes)
//   matcloth    no polka dots or prints on a suit or a coat
//   matsticker  fewer stickers on painted metal: on a wall of steel they read as noise
//   matsign     lettering stays on what it is written on: atlas labels, poster column, shop window panes, hazard stripes, a sign wider than its wall
//   matcard     cardboard has no timber grain
//   matcurtain  the fountain's water sheets have one number of streaks from top to bottom (chevrons on the tiers)
//   matcorner   where two walls of a tower meet, the end of one no longer lies in the plane of the other's front (pale torn patches)
//   matplank    the grain of a harbour deck runs along its boards, not across them
//   matsiding   timber siding is boards 18 cm wide, not 30 (far and near shader)
//   matboard    a board on a post has a body: an edge, and no AO from what stands behind it

import type { QualityLevel } from './context';

const RANK: Record<QualityLevel, number> = { low: 0, medium: 1, high: 2 };
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** is fix `name` on regardless of tier (`?no<name>` / `?nosweepmat` off)? */
export function matOn(name: string): boolean {
  return !(params && (params.has('nosweepmat') || params.has('no' + name)));
}

/** is fix `name` on (`?no<name>` / `?nosweepmat` off; below quality tier `min` off)? */
export function matFix(level: QualityLevel, name: string, min: QualityLevel = 'medium'): boolean {
  return matOn(name) && RANK[level] >= RANK[min];
}

/** the height of a siding board (m): text for the wall shaders, so both draw the same courses */
export const SIDING_BH = matOn('matsiding') ? '0.18' : '0.3';

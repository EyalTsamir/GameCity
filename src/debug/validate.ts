// Static sanity checks over the plan + graphs. Run with ?validate or ?debug,
// or from tests via window.__city.validate().

import type { CityContext } from '../core/context';
import { OCC } from '../core/occupancy';
import { rectsOverlap, rect } from '../core/geom';
import { CORRIDOR_HALF, ROAD_HALF } from '../core/constants';

export function validateWorld(ctx: CityContext): string[] {
  const { plan, roads, peds, occupancy } = ctx;
  const out: string[] = [];

  // corridors (road + sidewalks)
  const corridors = plan.roadSegments.map((seg) => {
    const A = plan.roadNodes[seg.a],
      B = plan.roadNodes[seg.b];
    const half = seg.sidewalks ? CORRIDOR_HALF : ROAD_HALF + 0.6;
    return Math.abs(B.x - A.x) > Math.abs(B.z - A.z) ? rect(A.x, A.z - half, B.x, A.z + half) : rect(A.x - half, A.z, A.x + half, B.z);
  });
  for (const I of roads.intersections) {
    if (I.control === 'portal') continue;
    corridors.push(rect(I.x - CORRIDOR_HALF, I.z - CORRIDOR_HALF, I.x + CORRIDOR_HALF, I.z + CORRIDOR_HALF));
  }

  // lots
  for (const lot of plan.lots) {
    const f = lot.footprint,
      r = lot.rect;
    if (f.x0 < r.x0 - 0.01 || f.z0 < r.z0 - 0.01 || f.x1 > r.x1 + 0.01 || f.z1 > r.z1 + 0.01) out.push(`lot ${lot.id} (${lot.kind}) footprint outside its parcel`);
    if (f.x1 - f.x0 < 2 || f.z1 - f.z0 < 2) out.push(`lot ${lot.id} (${lot.kind}) footprint too small`);
    for (const c of corridors) if (rectsOverlap(f, c, -0.02)) out.push(`lot ${lot.id} (${lot.kind}) footprint overlaps a road corridor`);
    if (f.x0 < plan.slab.x0 || f.x1 > plan.slab.x1 || f.z0 < plan.slab.z0 || f.z1 > plan.slab.z1) out.push(`lot ${lot.id} outside slab`);
    for (const d of lot.doors) {
      const onEdge = Math.abs(d.x - f.x0) < 0.01 || Math.abs(d.x - f.x1) < 0.01 || Math.abs(d.z - f.z0) < 0.01 || Math.abs(d.z - f.z1) < 0.01;
      if (!onEdge) out.push(`lot ${lot.id} door not on footprint edge`);
    }
  }
  for (let i = 0; i < plan.lots.length; i++) {
    for (let j = i + 1; j < plan.lots.length; j++) {
      if (rectsOverlap(plan.lots[i].footprint, plan.lots[j].footprint, -0.02)) out.push(`lots ${i} (${plan.lots[i].kind}) and ${j} (${plan.lots[j].kind}) footprints overlap`);
    }
  }
  // features vs buildings
  for (const f of plan.features) {
    if (f.radius > 0) {
      for (const lot of plan.lots) {
        const fp = lot.footprint;
        const dx = Math.max(fp.x0 - f.x, 0, f.x - fp.x1),
          dz = Math.max(fp.z0 - f.z, 0, f.z - fp.z1);
        if (Math.hypot(dx, dz) < f.radius - 0.05 && !(lot.kind === 'stadium' && f.kind === 'floodlight')) out.push(`feature ${f.kind}#${f.id} overlaps lot ${lot.id} (${lot.kind})`);
      }
    }
  }
  // slots must sit on sidewalks
  for (const s of plan.slots) {
    if (!occupancy.has(s.x, s.z, OCC.SIDEWALK)) out.push(`slot ${s.kind} at (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) not on a sidewalk`);
  }
  // walkway edges must not pass through buildings, water or solid props
  let bad = 0;
  for (const e of peds.edges) {
    const A = peds.nodes[e.a],
      B = peds.nodes[e.b];
    const n = Math.max(2, Math.ceil(e.length / 0.4));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = A.x + (B.x - A.x) * t,
        z = A.z + (B.z - A.z) * t;
      if (e.kind === 'door' && (t * e.length < 0.5 || (1 - t) * e.length < 0.5)) continue;
      let flags = OCC.BUILDING | OCC.SOLID;
      if (e.kind !== 'bridge' && e.kind !== 'pier') flags |= OCC.WATER;
      if (e.kind !== 'crosswalk' && e.kind !== 'door') flags |= OCC.ROAD;
      if (occupancy.has(x, z, flags)) {
        if (bad++ < 40) out.push(`walkway ${e.kind} edge ${e.id} crosses blocked cell at (${x.toFixed(1)}, ${z.toFixed(1)}) flags=${occupancy.get(x, z)}`);
        break;
      }
    }
  }
  if (bad > 40) out.push(`… ${bad - 40} more blocked walkway edges`);
  for (const w of peds.warnings) out.push(`walkways: ${w}`);
  // lanes
  for (const l of roads.lanes) {
    if (!l.sink && l.out.length === 0) out.push(`lane ${l.id} (${l.from}->${l.to}) has no exits`);
    if (!l.source && l.in.length === 0) out.push(`lane ${l.id} (${l.from}->${l.to}) has no entries`);
  }
  return out;
}

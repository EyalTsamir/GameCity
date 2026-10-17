// Module "roads": the hardscape of Tinyhaven — asphalt carriageways (junctions with rounded curb
// returns, tunnel roads into the portal bores, level crossings), raised sidewalks with granite curbs,
// gutters and dropped kerbs + tactile paving at every crosswalk, block ground covers (plazas, yards,
// parking, gravel, sand, pitch, allotments, quay), the raised promenade and boardwalk, park paths,
// and one merged mesh of road markings + flat street details (manholes, grates, lids).
//
// Draw calls: 3 (asphalt, hardscape, markings). Ground only receives shadows. Everything is built once.

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { MeshBuilder } from './roads/builder';
import { buildStreets, junctionChains } from './roads/streets';
import { buildCovers } from './roads/covers';
import { buildAtlas, buildMarkings } from './roads/markings';
import { createMaterials } from './roads/materials';
import { HARD_ATTRS } from './roads/surfaces';
import { pointInPoly, type P2 } from '../core/geom';
import { ROAD_HALF } from '../core/constants';

export default function create(ctx: CityContext): CityModule {
  const t0 = performance.now();
  const A = new MeshBuilder([{ name: 'aA', size: 2 }]);
  const H = new MeshBuilder(HARD_ATTRS);
  const streets = buildStreets(ctx, A, H);
  const covers = buildCovers(ctx, A, H);
  const atlas = buildAtlas();
  const mats = createMaterials(ctx, covers.info.radial, atlas.tex);
  const marks = buildMarkings(ctx, atlas.g, mats.asphaltColor, covers.info);

  const root = new THREE.Group();
  root.name = 'roads';
  const meshes: THREE.Mesh[] = [];
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.receiveShadow = true;
    m.castShadow = false;
    m.matrixAutoUpdate = false;
    // drawn before the terrain: the grass under the hardscape is then rejected by the depth test
    m.renderOrder = ctx.debug.params.has('roadsRO') ? Number(ctx.debug.params.get('roadsRO')) : -1;
    root.add(m);
    meshes.push(m);
  };
  mk(A.build(), mats.asphalt, 'roads-asphalt');
  mk(H.build(), mats.hard, 'roads-hardscape');
  mk(marks.geo, mats.paint, 'roads-markings');
  ctx.scene.add(root);
  const buildMs = performance.now() - t0;

  const tris = meshes.reduce((s, m) => s + (m.geometry.index?.count ?? 0) / 3, 0);
  const verts = meshes.reduce((s, m) => s + m.geometry.attributes.position.count, 0);

  return {
    name: 'roads',
    stats() {
      return {
        drawCalls: meshes.length,
        tris: Math.round(tris),
        verts,
        junctions: streets.junctions,
        segments: streets.segments,
        dropKerbs: streets.rampEnds,
        covers: covers.stats.coverRects,
        paths: covers.stats.pathRibbons,
        zebras: marks.stats.zebras,
        stopLines: marks.stats.stopLines,
        stalls: marks.stats.stalls,
        decals: marks.stats.decals,
        buildMs: Math.round(buildMs),
      };
    },
    invariants() {
      // every movement curve and lane must lie on the carriageway (vehicle centre lines)
      const out: string[] = [];
      const net = ctx.roads;
      const polys = new Map<number, P2[]>();
      for (const I of net.intersections) {
        if (I.control === 'portal') continue;
        const present = (['N', 'E', 'S', 'W'] as const).map((d) => I.arms.includes(d));
        const poly: P2[] = [];
        for (const c of junctionChains(present)) for (const p of c.pts) poly.push({ x: I.x + p.x, z: I.z + p.z });
        polys.set(I.id, poly);
      }
      for (const m of net.movements) {
        const poly = polys.get(m.node);
        if (!poly) continue;
        const I = net.intersections[m.node];
        for (const p of m.path.pts) {
          const inBox = Math.abs(p.x - I.x) < 6.5 && Math.abs(p.z - I.z) < 6.5;
          const onArm = Math.min(Math.abs(p.x - I.x), Math.abs(p.z - I.z)) <= ROAD_HALF;
          if (inBox ? !pointInPoly(poly, p.x, p.z) : !onArm) {
            out.push(`movement ${m.id} leaves the carriageway at (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
            break;
          }
        }
        if (out.length > 20) break;
      }
      for (const g of [A, H]) void g;
      return out;
    },
    dispose() {
      for (const m of meshes) m.geometry.dispose();
      mats.asphalt.dispose();
      mats.hard.dispose();
      mats.paint.dispose();
      atlas.tex.dispose();
    },
  };
}

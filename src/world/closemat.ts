// Module "closemat" (close round, docs/progress/close-materials.md): every surface at one metre, across the whole city.
// Near-only: for the cells of the bubble around the camera, an exact copy of the wall, road, paving and trim triangles is
// drawn once more with a small program that MULTIPLIES what the city's shader has drawn (colour + relief as a ratio, on the
// scene's float target). So lighting, shadows, night and weathering stay as they are, the far versions and the bakes are not
// touched, and the price is paid only by pixels near the camera. Nothing is built or drawn from the air.
//
// Switches (src/core/closemat.ts): ?noclosemat all; ?nocmwalls ?nocmroad ?nocmpaving ?nocmsolid ?nocmlitter one family; ?cmr=<k> scales the radii.

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { closeMat } from '../core/closemat';
import { wearFix, wearOn } from '../core/sweepwear';
import { matFix } from '../core/sweepmat';
import { KIND } from './terrain/kinds';
import { PAT as HPAT } from './harbor/geo';
import { PAT as LPAT } from './landmarks/builder';
import { WATER_LEVEL } from '../core/constants';
import { globalUniforms } from '../core/uniforms';
import { nearOf } from '../core/nearDetail';
import { interleaved, TriGrid, type SourceAttr } from './closemat/source';
import { makeCloseTiles } from './closemat/textures';
import { addLitter } from './closemat/litter';
import { CM_ASPHALT, CM_BRICK, CM_PAINT, CM_SAND, CM_COMMON, CM_DECK, CM_LOOSE, CM_PANEL, CM_PLASTER, CM_SHEET, CM_SLAB, CM_SMOOTH, CM_SOLID, CM_STONE, CM_TIMBER, CM_VERT } from './closemat/glsl';
import { WALLPAT } from './buildings/materials';
import { groundMaskInfo } from './terrain/ground';
import { roadNoise } from './roads/materials';

/** pixels one metre covers at 1 m in the bubble's reference view */
const REF_PX = 1099;
/** the ground fills a street view: the radius that pays for itself (at eye level the fade ends about 5 m away) */
const GROUND_R = 10;

const WALL_ATTRS: SourceAttr[] = [
  { name: 'position', size: 3 },
  { name: 'normal', size: 3 },
  { name: 'uv', size: 2 },
  { name: 'color', size: 3, to: 'aCol' },
  { name: 'aA', size: 4 },
  { name: 'aB', size: 4 },
  { name: 'aC', size: 4 },
  { name: 'aD', size: 4 },
];
const ROAD_ATTRS: SourceAttr[] = [
  { name: 'position', size: 3 },
  { name: 'normal', size: 3 },
  { name: 'aA', size: 2 },
];
const HARD_ATTRS: SourceAttr[] = [
  { name: 'position', size: 3 },
  { name: 'normal', size: 3 },
  { name: 'aS', size: 4 },
  { name: 'aP', size: 4 },
  { name: 'aV', size: 4 },
  { name: 'aC', size: 3 },
  { name: 'aX', size: 4 },
];

export interface CloseMatService {
  /** distance to the nearest surface along a ray (normalised), or -1 within maxT */
  rayHit(p: THREE.Vector3, d: THREE.Vector3, maxT: number): number;
}

const PLAIN_ATTRS: SourceAttr[] = [
  { name: 'position', size: 3 },
  { name: 'normal', size: 3 },
];

/** which mesh a source geometry came from */
const sourceName = new WeakMap<THREE.BufferGeometry, string>();

/** the close-up material of a vertex, from what its mesh knows (`matclass`): 0 can't say, 1 timber, 2 metal under paint, 3 mineral, 4 moulded or glazed */
function whatOf(g: THREE.BufferGeometry, v: number): number {
  const rm = g.getAttribute('aRM');
  if (rm) {
    // (props/furniture.ts MAT)
    const r = rm.getX(v),
      m = rm.getY(v);
    if (m > 0.05) return 2;
    if (r > 0.78 && r < 0.84) return 1;
    if (r > 0.84 && r < 0.9) return 3;
    if (r > 0.928 && r < 0.945) return 3;
    if (r > 0.45 && r < 0.55) return 2;
    return 4;
  }
  const name = sourceName.get(g) ?? '';
  if (name === 'terrain-masonry') {
    const mas = g.getAttribute('aMas');
    if (!mas) return 0;
    const kind = Math.round(mas.getX(v));
    if (kind === KIND.dark || kind === KIND.lamp) return 4;
    return kind === KIND.plain ? 0 : 3;
  }
  if (name.startsWith('harbor')) {
    const pat = g.getAttribute('aPat');
    if (!pat) return 0;
    const id = Math.round(pat.getX(v));
    if (id === HPAT.NONE) return pat.getY(v) > 0.5 ? 2 : 0;
    if (id === HPAT.CORRUGATED || id === HPAT.HULL || id === HPAT.RUST) return 2;
    if (id === HPAT.PLANKS_X || id === HPAT.PLANKS_Z) return 1;
    if (id === HPAT.GLASS || id === HPAT.NET) return 4;
    return 3;
  }
  if (name.startsWith('landmarks')) {
    // (landmarks/builder.ts: x = pattern, y = metal * 9 + roughness)
    const mat = g.getAttribute('aMat');
    if (!mat) return 0;
    const id = Math.round(mat.getX(v));
    if (id === LPAT.PLAIN && Math.floor(mat.getY(v)) >= 3) return 2;
    switch (id) {
      case LPAT.BRICK:
      case LPAT.STONE:
      case LPAT.TILES:
      case LPAT.SLATE:
      case LPAT.CONCRETE:
      case LPAT.GRAVEL:
        return 3;
      case LPAT.PLANKS:
        return 1;
      case LPAT.SEAM:
      case LPAT.CORRUGATED:
      case LPAT.LATTICE:
      case LPAT.SCAFFOLD:
      case LPAT.MESH:
      case LPAT.LOUVRE:
      case LPAT.RAILING:
      case LPAT.PANELS:
      case LPAT.RUST:
      case LPAT.SHUTTER:
        return 2;
      case LPAT.PLAIN:
      case LPAT.DOOR:
        return 0;
      default:
        return 4;
    }
  }
  return 0;
}

const SOLID_ATTRS: SourceAttr[] = [
  { name: 'position', size: 3 },
  { name: 'normal', size: 3 },
  { name: 'color', size: 3, to: 'aCol' },
  { name: 'aGrain', size: 3 },
  { name: 'aWhat', size: 1, fill: whatOf },
];

export default function create(ctx: CityContext): CityModule {
  const near = nearOf(ctx);
  const on = {
    walls: closeMat(ctx, 'cmwalls'),
    road: closeMat(ctx, 'cmroad'),
    paving: closeMat(ctx, 'cmpaving'),
    solid: closeMat(ctx, 'cmsolid'),
  };
  const stats: Record<string, number | string> = {};
  if (!on.walls && !on.road && !on.paving && !on.solid) return { name: 'closemat', stats: () => stats };

  const t0 = performance.now();
  const tiles = makeCloseTiles();
  stats.tilesMs = Math.round(tiles.ms);
  const rK = Number(ctx.debug.params.get('cmr')) || 1;

  const byName = (test: (name: string) => boolean): THREE.BufferGeometry[] => {
    const out: THREE.BufferGeometry[] = [];
    ctx.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && test(o.name)) {
        out.push((o as THREE.Mesh).geometry);
        sourceName.set((o as THREE.Mesh).geometry, o.name);
      }
    });
    return out;
  };

  const shared = {
    tGrain: { value: tiles.grain },
    tCrack: { value: tiles.crack },
    tFibre: { value: tiles.fibre },
    tStones: { value: tiles.stones },
    tRN: { value: roadNoise() },
    uSunDir: globalUniforms.uSunDir,
    uDaylight: globalUniforms.uDaylight,
    uWinDepth: (ctx.services.buildings as { uniforms?: { uWinDepth: THREE.IUniform } } | undefined)?.uniforms?.uWinDepth ?? { value: 0 },
  };

  const wearDefs: Record<string, number> = {};
  if (wearOn('wearcrack')) wearDefs.CM_FISSURE = 1; // (with the switch off the tile holds the old network)
  if (wearFix(ctx.quality.level, 'wearrust')) wearDefs.CM_WEARRUST = 1;
  if (matFix(ctx.quality.level, 'matclass')) wearDefs.CM_MATCLASS = 1;
  const material = (name: string, frag: string, define: string, radius: number, offset: number): THREE.ShaderMaterial =>
    new THREE.ShaderMaterial({
      name: `closemat-${name}`,
      defines: { [define]: 1, CM_LIM: (radius / REF_PX).toFixed(5), ...wearDefs },
      uniforms: shared,
      vertexShader: CM_VERT,
      fragmentShader: CM_COMMON + frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      polygonOffset: true,
      polygonOffsetFactor: offset,
      polygonOffsetUnits: offset * 2,
      fog: false,
      toneMapped: false,
    });

  const grids: TriGrid[] = [];
  const layer = (name: string, grid: TriGrid, attrs: SourceAttr[], frag: string, define: string, radius: number, cell: number, top: number, offset = -1): void => {
    stats[name] = grid.triangles;
    if (grid.triangles === 0) return;
    grids.push(grid);
    const R = radius * rK;
    near.addMeshes({
      name,
      radius: R,
      cell,
      top,
      margin: cell * 0.5,
      material: material(name, frag, define, R, offset),
      renderOrder: -80,
      receiveShadow: false,
      standIn: interleaved(new Float32Array(grid.stride * 3), attrs),
      build: (c) => grid.build(c.i, c.j, (data) => interleaved(data, attrs)),
    });
  };

  if (on.walls) {
    const walls = byName((n) => n === 'buildings-shell' || n === 'buildings-shell-shop');
    const family = (pat: number) => (g: THREE.BufferGeometry, a: number): boolean => {
      const kb = g.getAttribute('aB'),
        kc = g.getAttribute('aC');
      const w = kb.getW(a);
      if (w >= 63.5) return false; // a roof
      const style = Math.floor((Math.floor(w + 0.5) % 64) / 8 + 0.01);
      if (style === 2) return false; // a curtain wall is all glass
      return Math.floor(kc.getZ(a) + 0.5) % 16 === pat;
    };
    const cell = 8;
    const wall = (name: string, pat: number, frag: string, radius: number) => layer(name, new TriGrid(walls, WALL_ATTRS, cell, family(pat)), WALL_ATTRS, frag, 'CM_WALL', radius, cell, 30);
    wall('cmBrick', WALLPAT.BRICK, CM_BRICK, 17);
    wall('cmPlaster', WALLPAT.PLASTER, CM_PLASTER, 14);
    wall('cmTimber', WALLPAT.SIDING, CM_TIMBER, 14);
    wall('cmStone', WALLPAT.STONE, CM_STONE, 14);
    wall('cmPanel', WALLPAT.PANELS, CM_PANEL, 14);
    wall('cmSheet', WALLPAT.CORRUGATED, CM_SHEET, 14);
    wall('cmSmooth', WALLPAT.SMOOTH, CM_SMOOTH, 10);
    // nothing to draw on a curtain wall, but the lens has to stop at the glass
    grids.push(
      new TriGrid(walls, WALL_ATTRS, cell, (g, a) => {
        const w = g.getAttribute('aB').getW(a);
        return w < 63.5 && Math.floor((Math.floor(w + 0.5) % 64) / 8 + 0.01) === 2;
      }),
    );
  }
  if (on.road) {
    const road = byName((n) => n === 'roads-asphalt');
    const cell = 8;
    layer('cmRoad', new TriGrid(road, ROAD_ATTRS, cell, () => true), ROAD_ATTRS, CM_ASPHALT, 'CM_GROUND', GROUND_R, cell, 0.3);
  }
  if (on.road) {
    // the markings' own offset is stronger than a plain layer's: above it
    const road = byName((n) => n === 'roads-markings');
    const cell = 8;
    const grid = new TriGrid(road, ROAD_ATTRS, cell, () => true);
    layer('cmPaint', grid, ROAD_ATTRS, CM_PAINT, 'CM_GROUND', GROUND_R, cell, 0.3, -4);
  }
  if (on.paving) {
    const hard = byName((n) => n === 'roads-hardscape');
    const cell = 8;
    const kind = (g: THREE.BufferGeometry, a: number): 'slab' | 'loose' | 'deck' => {
      const P = g.getAttribute('aP'),
        V = g.getAttribute('aV');
      if (P.getW(a) < 0.01) return 'loose'; // no dark joints in the table: not laid
      if (V.getZ(a) === -1 && P.getX(a) >= 2 && P.getY(a) < 0.3) return 'deck';
      return 'slab';
    };
    const hg = (want: string) => new TriGrid(hard, HARD_ATTRS, cell, (g, a) => kind(g, a) === want);
    layer('cmSlab', hg('slab'), HARD_ATTRS, CM_SLAB, 'CM_HARD', GROUND_R, cell, 1.2);
    layer('cmLoose', hg('loose'), HARD_ATTRS, CM_LOOSE, 'CM_HARD', GROUND_R, cell, 0.5);
    layer('cmDeck', hg('deck'), HARD_ATTRS, CM_DECK, 'CM_HARD', 14, cell, 1.2);
  }
  if (on.paving && groundMaskInfo) {
    // the beaches: the ground mesh where the ground mask says sand (a triangle a little over the edge shows nothing but grain)
    const gm = groundMaskInfo;
    const slab = ctx.plan.slab;
    const sx = gm.w / (slab.x1 - slab.x0);
    const sand = (x: number, z: number): boolean => {
      const u = Math.floor((x - slab.x0) * sx),
        v = Math.floor((z - slab.z0) * sx);
      return u >= 0 && v >= 0 && u < gm.w && v < gm.h && gm.data[(v * gm.w + u) * 4] > 127;
    };
    const cell = 8;
    const grid = new TriGrid(byName((n) => n === 'terrain-ground'), PLAIN_ATTRS, cell, (g, a, b, c) => {
      const P = g.getAttribute('position');
      if (P.getY(a) < WATER_LEVEL && P.getY(b) < WATER_LEVEL && P.getY(c) < WATER_LEVEL) return false;
      return sand(P.getX(a), P.getZ(a)) || sand(P.getX(b), P.getZ(b)) || sand(P.getX(c), P.getZ(c));
    });
    layer('cmSand', grid, PLAIN_ATTRS, CM_SAND, 'CM_PLAIN', GROUND_R, cell, 3);
  }
  if (on.solid) {
    // only what is drawn whenever it is near: a level of detail hidden up close would leave its copy on the air
    const cell = 8;
    const solid = (name: string, test: (n: string) => boolean, kind: '' | 'CM_RUST' | 'CM_JOINERY', radius: number, top: number) => {
      const geos = byName(test).filter((g) => g.getAttribute('normal') && g.getAttribute('color'));
      const grid = new TriGrid(geos, SOLID_ATTRS, cell, (g, a, b, c) => {
        // what moves does not stay under its copy
        const sway = g.getAttribute('aSway');
        if (sway && sway.getW(a) !== 0) return false;
        const anim = g.getAttribute('aAnim');
        if (anim && anim.getX(a) !== 0) return false;
        // a piece too small to have a surface
        const P = g.getAttribute('position');
        const dx = Math.abs(P.getX(a) - P.getX(b)) + Math.abs(P.getY(a) - P.getY(b)) + Math.abs(P.getZ(a) - P.getZ(b));
        const dy = Math.abs(P.getX(b) - P.getX(c)) + Math.abs(P.getY(b) - P.getY(c)) + Math.abs(P.getZ(b) - P.getZ(c));
        return dx + dy > 0.12;
      });
      layer(name, grid, SOLID_ATTRS, (kind ? `#define ${kind}\n` : '') + CM_SOLID, 'CM_SOLID', radius, cell, top);
    };
    solid('cmTrim', (n) => n === 'buildings-trim', 'CM_JOINERY', 12, 30);
    solid('cmMasonry', (n) => n === 'terrain-masonry' || n.startsWith('landmarks-static') || n.startsWith('landmarks-detail') || n.startsWith('harbor-north') || n.startsWith('harbor-yards') || n.startsWith('harbor-river') || n.startsWith('harbor-beach') || n === 'rail-bed', '', 12, 8);
    solid('cmStreet', (n) => n === 'props-furniture-e' || n === 'props-furniture-w' || n === 'props-furniture-fine-e' || n === 'props-furniture-fine-w' || n === 'props-casters' || n === 'life-poles', '', 12, 6);
    solid('cmMetal', (n) => n === 'terrain-railings' || n === 'traffic-signal-poles' || n === 'rail-furniture', 'CM_RUST', 12, 8);
  }
  if (closeMat(ctx, 'cmlitter')) addLitter(ctx);
  stats.bootMs = Math.round(performance.now() - t0);
  // what the lens should focus on from up close: the real surfaces, down to a bench or the wall at the back of a porch
  const service: CloseMatService = {
    rayHit(p, d, maxT) {
      let best = -1;
      let reach = maxT;
      for (const g of grids) {
        const t = g.raycast(p.x, p.y, p.z, d.x, d.y, d.z, reach);
        if (t >= 0) {
          best = t;
          reach = t;
        }
      }
      return best;
    },
  };
  ctx.services.closeMat = service;

  return { name: 'closemat', stats: () => stats };
}

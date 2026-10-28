// Ground covers inside the blocks (plazas, yards, parking, gravel, sand, pitch, allotments, quay…),
// the raised riverside promenade and beach boardwalk, and the drawn walk paths.
//
// Each block is partitioned into a rectilinear grid by the edges of its areas; every cell takes the
// surface of the top-most area covering it (layer, then id), or the block's default surface. Grass,
// beach and pond cells are left to the terrain. Cells are merged into rectangles per surface, so
// covers never overlap (no z-fighting) and all sit at one height.

import type { CityContext } from '../../core/context';
import type { Area, Block, CityPlan, WalkPath } from '../../core/plan';
import type { P2, Rect } from '../../core/geom';
import { OCC } from '../../core/occupancy';
import { hash01 } from '../../core/rng';
import { SIDEWALK_Y } from '../../core/constants';
import type { MeshBuilder } from './builder';
import { Y } from './streets';
import { HM, surf, band, coverRect } from './surfaces';
import { getLayout } from '../props/layout';

interface Cover {
  key: string;
  /** 'H' hardscape mesh, 'A' asphalt mesh, or a special generator */
  mesh: 'H' | 'A' | 'allot' | 'prom' | 'deck';
  mat: number;
  variant: number;
  area?: Area;
  /** rectangle the band layout / specials align to, and the bands [period, width, border, macro] */
  rect?: Rect;
  bands?: [number, number, number, number];
}

export interface CoverStats {
  coverRects: number;
  pathRibbons: number;
  plots: number;
  patios: number;
}

export interface CoverInfo {
  /** centre + radius of the radial paving rings (civic fountain, park statue) */
  radial: { x: number; z: number; r: number }[];
  /** rectangles of each special surface (for markings) */
  field: Rect | null;
  court: Rect | null;
}

function coverForArea(a: Area, plan: CityPlan): Cover | null {
  switch (a.kind) {
    case 'lawn':
    case 'garden':
    case 'courtyard':
    case 'beach':
    case 'pond':
      return null;
    case 'plaza': {
      const radial = plan.features.some((f) => f.kind === 'fountain' && f.x > a.rect.x0 && f.x < a.rect.x1 && f.z > a.rect.z0 && f.z < a.rect.z1);
      const dk = plan.blocks[a.blockId]?.kind;
      if (radial) return { key: `plazaR${a.id}`, mesh: 'H', mat: HM.plaza, variant: 1, rect: a.rect, bands: [0, 0, 0.9, 0.04] };
      if (dk === 'downtown') return { key: `plazaD${a.id}`, mesh: 'H', mat: HM.plaza, variant: 3, rect: a.rect, bands: [7.5, 0.42, 0.7, 0.06] };
      if (dk === 'station') return { key: `plazaS${a.id}`, mesh: 'H', mat: HM.plaza, variant: 4, rect: a.rect, bands: [6.3, 0.45, 0.8, 0.05] };
      if (dk === 'midtown') return { key: `plazaM${a.id}`, mesh: 'H', mat: HM.plaza, variant: 5, rect: a.rect, bands: [6.0, 0.36, 0.6, 0.06] };
      return { key: `plaza${a.id}`, mesh: 'H', mat: HM.plaza, variant: 0, rect: a.rect, bands: [0, 0, 0.6, 0.05] };
    }
    case 'market':
      return { key: 'market', mesh: 'H', mat: HM.setts, variant: 1, rect: a.rect, bands: [0, 0, 0.6, 0.05] };
    case 'yard':
      return { key: `yard${a.id}`, mesh: 'H', mat: HM.concrete, variant: 0, rect: a.rect, bands: [0, 0, 0, 0.06] };
    case 'containeryard':
      return { key: 'cyard', mesh: 'H', mat: HM.concrete, variant: 1, rect: a.rect, bands: [0, 0, 0, 0.05] };
    case 'construction':
      return { key: 'constr', mesh: 'H', mat: HM.gravel, variant: 0 };
    case 'freightyard':
      return { key: 'freight', mesh: 'H', mat: HM.gravel, variant: 1 };
    case 'quay':
      return { key: 'quay', mesh: 'H', mat: HM.quay, variant: 0, rect: a.rect, bands: [0, 0, 0, 0.05] };
    case 'platform':
      return { key: 'platform', mesh: 'H', mat: HM.platform, variant: 0, rect: a.rect, bands: [8.0, 0.36, 0.6, 0.06] };
    case 'parking':
      return { key: 'parking', mesh: 'A', mat: 0, variant: 1 };
    case 'schoolyard':
      return { key: 'school', mesh: 'A', mat: 0, variant: 2 };
    case 'driveway':
      // house driveways are pavers; a car park access (surface asphalt) continues the car park's asphalt
      if (a.surface === 'asphalt') return { key: 'parking', mesh: 'A', mat: 0, variant: 1 };
      return { key: 'drive', mesh: 'H', mat: HM.pavers, variant: 0 };
    case 'playground':
      return { key: 'sand', mesh: 'H', mat: HM.sand, variant: 0 };
    case 'field':
      return { key: 'field', mesh: 'H', mat: HM.field, variant: 0 };
    case 'allotment':
      return { key: `allot${a.id}`, mesh: 'allot', mat: HM.soil, variant: 0, area: a };
    case 'promenade':
      return { key: 'prom', mesh: 'prom', mat: HM.promenade, variant: 0, area: a };
    case 'boardwalk':
      return { key: 'deck', mesh: 'deck', mat: HM.deck, variant: 0, area: a };
  }
  if (a.surface === 'grass' || a.surface === 'sand') return null;
  return { key: `s:${a.surface}`, mesh: 'H', mat: HM.plaza, variant: 2 };
}

function coverForBlock(b: Block): Cover | null {
  switch (b.surface) {
    case 'paving':
      if (b.kind === 'oldtown' || b.kind === 'market') return { key: 'bsetts', mesh: 'H', mat: HM.setts, variant: 0, rect: b.rect, bands: [0, 0, 0, 0.06] };
      return { key: 'bpave', mesh: 'H', mat: HM.plaza, variant: 2, rect: b.rect, bands: [10.5, 0.3, 0.5, 0.05] };
    case 'concrete':
      return { key: 'byard', mesh: 'H', mat: HM.concrete, variant: 0, rect: b.rect, bands: [0, 0, 0, 0.06] };
    case 'asphalt':
      return { key: 'basph', mesh: 'A', mat: 0, variant: 1 };
    case 'gravel':
      return { key: 'constr', mesh: 'H', mat: HM.gravel, variant: 0 };
    default:
      return null;
  }
}

export function buildCovers(ctx: CityContext, A: MeshBuilder, H: MeshBuilder): { stats: CoverStats; info: CoverInfo } {
  const plan = ctx.plan;
  const occ = ctx.occupancy;
  const stats: CoverStats = { coverRects: 0, pathRibbons: 0, plots: 0, patios: 0 };
  const info: CoverInfo = { radial: [], field: null, court: null };
  const terrainH = (ctx.services.terrain as { height?: (x: number, z: number) => number } | undefined)?.height ?? plan.heightAt;
  const deckArea = plan.areas.find((a) => a.kind === 'boardwalk');
  const promArea = plan.areas.find((a) => a.kind === 'promenade');
  const inRect = (r: Rect | undefined, x: number, z: number, m = 0) => !!r && x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;

  for (const f of plan.features) {
    if (f.kind === 'fountain') info.radial.push({ x: f.x, z: f.z, r: 11.5 });
  }
  const statue = plan.features.find((f) => f.kind === 'statue' && plan.blocks.some((b) => b.kind === 'park' && inRect(b.rect, f.x, f.z)));
  if (statue) info.radial.push({ x: statue.x, z: statue.z, r: 6.2 });
  const court = plan.features.find((f) => f.kind === 'sportscourt');
  if (court?.rect) info.court = court.rect;

  for (const blk of plan.blocks) {
    const br = blk.rect;
    const areas = blk.areas.map((i) => plan.areas[i]).filter((a) => a.kind !== 'pond');
    const xsSet = new Set<number>([br.x0, br.x1]);
    const zsSet = new Set<number>([br.z0, br.z1]);
    for (const a of areas) {
      for (const x of [a.rect.x0, a.rect.x1]) if (x > br.x0 && x < br.x1) xsSet.add(x);
      for (const z of [a.rect.z0, a.rect.z1]) if (z > br.z0 && z < br.z1) zsSet.add(z);
    }
    const xs = [...xsSet].sort((a, b) => a - b);
    const zs = [...zsSet].sort((a, b) => a - b);
    const nx = xs.length - 1,
      nz = zs.length - 1;
    const grid: (Cover | null)[] = new Array(nx * nz).fill(null);
    const blockCover = coverForBlock(blk);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const cx = (xs[i] + xs[i + 1]) / 2,
          cz = (zs[j] + zs[j + 1]) / 2;
        let top: Area | null = null;
        for (const a of areas) {
          if (cx < a.rect.x0 || cx > a.rect.x1 || cz < a.rect.z0 || cz > a.rect.z1) continue;
          if (!top || a.layer > top.layer || (a.layer === top.layer && a.id > top.id)) top = a;
        }
        grid[j * nx + i] = top ? coverForArea(top, plan) : blockCover;
      }
    }
    // greedy merge: horizontal runs, then extend downwards while the run below is identical
    const used = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const c = grid[j * nx + i];
        if (!c || used[j * nx + i]) continue;
        let i1 = i;
        while (i1 + 1 < nx && !used[j * nx + i1 + 1] && grid[j * nx + i1 + 1]?.key === c.key) i1++;
        let j1 = j;
        for (;;) {
          if (j1 + 1 >= nz) break;
          let ok = true;
          for (let k = i; k <= i1; k++) {
            const g = grid[(j1 + 1) * nx + k];
            if (!g || g.key !== c.key || used[(j1 + 1) * nx + k]) {
              ok = false;
              break;
            }
          }
          if (!ok) break;
          j1++;
        }
        for (let jj = j; jj <= j1; jj++) for (let k = i; k <= i1; k++) used[jj * nx + k] = 1;
        const r: Rect = { x0: xs[i], z0: zs[j], x1: xs[i1 + 1], z1: zs[j1 + 1] };
        stats.coverRects++;
        // flat covers are emitted on all grid lines they span (shared with their neighbours: no T-junction cracks)
        if (c.mesh === 'H' || c.mesh === 'A') emitGridCover(c, xs.slice(i, i1 + 2), zs.slice(j, j1 + 2));
        else emitCover(c, r);
        // skirts towards uncovered neighbours (grass) inside the block, and along the block edge where no sidewalk
        const lower = (ii: number, jj: number) => ii < 0 || jj < 0 || ii >= nx || jj >= nz || !grid[jj * nx + ii];
        if (c.mesh === 'H' || c.mesh === 'A') {
          for (let k = i; k <= i1; k++) {
            if (lower(k, j - 1)) skirtRun(xs[k], zs[j], xs[k + 1], zs[j], 0, -1, j === 0);
            if (lower(k, j1 + 1)) skirtRun(xs[k], zs[j1 + 1], xs[k + 1], zs[j1 + 1], 0, 1, j1 === nz - 1);
          }
          for (let jj = j; jj <= j1; jj++) {
            if (lower(i - 1, jj)) skirtRun(xs[i], zs[jj], xs[i], zs[jj + 1], -1, 0, i === 0);
            if (lower(i1 + 1, jj)) skirtRun(xs[i1 + 1], zs[jj], xs[i1 + 1], zs[jj + 1], 1, 0, i1 === nx - 1);
          }
        }
      }
    }
  }

  function emitGridCover(c: Cover, gx: number[], gz: number[]): void {
    const B = c.mesh === 'A' ? A : H;
    if (c.mesh === 'A') A.set('aA', 0, c.variant);
    else {
      surf(H, c.mat, c.variant, 9, 0);
      if (c.rect && c.bands) band(H, c.rect, ...c.bands);
      else if (c.rect) coverRect(H, c.rect);
    }
    if (c.mat === HM.field && c.mesh === 'H') info.field = { x0: gx[0], z0: gz[0], x1: gx[gx.length - 1], z1: gz[gz.length - 1] };
    const ids: number[] = [];
    for (const z of gz) for (const x of gx) ids.push(B.v(x, Y.cover, z));
    const w = gx.length;
    for (let j = 0; j < gz.length - 1; j++)
      for (let i = 0; i < w - 1; i++) B.quadUp(ids[j * w + i], ids[j * w + i + 1], ids[(j + 1) * w + i + 1], ids[(j + 1) * w + i]);
  }

  function emitCover(c: Cover, r: Rect): void {
    switch (c.mesh) {
      case 'H':
        surf(H, c.mat, c.variant, 9, 0);
        if (c.rect && c.bands) band(H, c.rect, ...c.bands);
        H.rect(r.x0, r.z0, r.x1, r.z1, Y.cover);
        if (c.mat === HM.field) info.field = r;
        return;
      case 'A':
        A.set('aA', 0, c.variant);
        A.rect(r.x0, r.z0, r.x1, r.z1, Y.cover);
        return;
      case 'allot':
        allotment(r);
        return;
      case 'prom':
        promenade(r);
        return;
      case 'deck':
        boardwalk(r);
        return;
    }
  }

  /** Skirt from the ground up to the cover height along an edge; on block edges only where no sidewalk adjoins. */
  function skirtRun(x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, blockEdge: boolean): void {
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1e-3) return;
    surf(H, HM.side, 0, 9, 0);
    if (!blockEdge) {
      H.wall(x0, z0, x1, z1, Y.ground, Y.cover, nx, nz);
      return;
    }
    // split into runs not bordered by a sidewalk / raised walkway
    const n = Math.max(1, Math.ceil(L / 0.5));
    let runStart = -1;
    const covered = (t: number) => {
      const x = x0 + (x1 - x0) * t + nx * 0.3,
        z = z0 + (z1 - z0) * t + nz * 0.3;
      return occ.has(x, z, OCC.SIDEWALK) || inRect(promArea?.rect, x, z) || inRect(deckArea?.rect, x, z);
    };
    for (let k = 0; k <= n; k++) {
      const open = k < n && !covered((k + 0.5) / n);
      if (open && runStart < 0) runStart = k;
      if (!open && runStart >= 0) {
        const ta = runStart / n,
          tb = k / n;
        H.wall(x0 + (x1 - x0) * ta, z0 + (z1 - z0) * ta, x0 + (x1 - x0) * tb, z0 + (z1 - z0) * tb, Y.ground, Y.cover, nx, nz);
        runStart = -1;
      }
    }
  }

  /** Allotment plots: raised soil beds with timber edges, grass paths between them (terrain shows through). */
  function allotment(r: Rect): void {
    const W = r.x1 - r.x0,
      D = r.z1 - r.z0;
    const cols = Math.max(1, Math.round(W / 7.5)),
      rows = Math.max(1, Math.round(D / 6.5));
    const gap = 1.0;
    const pw = (W - gap * (cols + 1)) / cols,
      pd = (D - gap * (rows + 1)) / rows;
    const yb = 0.05;
    for (let cj = 0; cj < rows; cj++) {
      for (let ci = 0; ci < cols; ci++) {
        const x0 = r.x0 + gap + ci * (pw + gap),
          z0 = r.z0 + gap + cj * (pd + gap);
        const v = Math.floor(hash01(ci * 7 + 3, cj * 13 + 1, 77) * 4);
        stats.plots++;
        surf(H, HM.soil, v, 9, ci * 10 + cj);
        H.rect(x0, z0, x0 + pw, z0 + pd, yb);
        surf(H, HM.side, 3, 9, 0);
        H.wall(x0, z0, x0 + pw, z0, Y.ground, yb, 0, -1);
        H.wall(x0 + pw, z0 + pd, x0, z0 + pd, Y.ground, yb, 0, 1);
        H.wall(x0, z0 + pd, x0, z0, Y.ground, yb, -1, 0);
        H.wall(x0 + pw, z0, x0 + pw, z0 + pd, Y.ground, yb, 1, 0);
      }
    }
  }

  /** Raised riverside promenade (continues the sidewalk level down to the river wall coping). */
  function promenade(r: Rect): void {
    const z1 = Math.min(r.z1, 109.5);
    surf(H, HM.promenade, 0, 9, 0);
    H.rect(r.x0, r.z0, r.x1, z1, SIDEWALK_Y);
    // faces where it meets lower ground (west margin gardens, slab edge)
    surf(H, HM.side, 0, 9, 0);
    H.wall(r.x0, z1, r.x0, r.z0, Y.ground, SIDEWALK_Y, -1, 0);
    const n = Math.ceil((r.x1 - r.x0) / 0.5);
    let run = -1;
    for (let k = 0; k <= n; k++) {
      const x = r.x0 + (k + 0.5) * 0.5;
      const open = k < n && !occ.has(x, r.z0 - 0.3, OCC.SIDEWALK);
      if (open && run < 0) run = k;
      if ((!open || k === n) && run >= 0) {
        const xa = r.x0 + run * 0.5,
          xb = Math.min(r.x1, r.x0 + k * 0.5);
        H.wall(xb, r.z0, xa, r.z0, Y.ground, SIDEWALK_Y, 0, -1);
        run = -1;
      }
    }
  }

  /** Beach boardwalk: plank deck at 0.3 m with fascia boards, plus the bump-out around the ice-cream kiosk. */
  function boardwalk(r: Rect): void {
    const y = Y.deck;
    surf(H, HM.deck, 0, 9, 0);
    H.rect(r.x0, r.z0, r.x1, r.z1, y);
    surf(H, HM.side, 3, 9, 0);
    // west: step down to the sidewalk / promenade (0.15)
    H.wall(r.x0, r.z1, r.x0, r.z0, SIDEWALK_Y - 0.01, y, -1, 0);
    // north end (quay concrete) and south end (river wall)
    H.wall(r.x0, r.z0, r.x1, r.z0, Y.ground, y, 0, -1);
    H.wall(r.x1, r.z1, r.x0, r.z1, Y.ground, y, 0, 1);
    // east fascia down to the sand, broken around the bump-out
    const bw = plan.paths.find((p) => p.kind === 'boardwalk' && p.pts.length > 3);
    const bump = bw ? bumpOut(bw, r.x1) : null;
    const eastRuns: [number, number][] = bump ? [[r.z0, bump.z0], [bump.z1, r.z1]] : [[r.z0, r.z1]];
    for (const [za, zb] of eastRuns) fascia(r.x1, za, r.x1, zb, 1, 0);
    if (bump) {
      surf(H, HM.deck, 0, 9, 0);
      H.polygon(bump.poly, y);
      for (let k = 0; k < bump.poly.length - 1; k++) {
        const a = bump.poly[k],
          b = bump.poly[k + 1];
        const ex = b.x - a.x,
          ez = b.z - a.z;
        const l = Math.hypot(ex, ez);
        if (l < 1e-3) continue;
        // outward normal: the clipped outline runs north -> south along its outer (east) edge -> (ez, -ex)
        fascia(a.x, a.z, b.x, b.z, ez / l, -ex / l);
      }
    }
  }

  function fascia(ax: number, az: number, bx: number, bz: number, nx: number, nz: number): void {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(L / 3));
    surf(H, HM.side, 3, 9, 0);
    for (let k = 0; k < n; k++) {
      const t0 = k / n,
        t1 = (k + 1) / n;
      const x0 = ax + (bx - ax) * t0,
        z0 = az + (bz - az) * t0,
        x1 = ax + (bx - ax) * t1,
        z1 = az + (bz - az) * t1;
      const g0 = terrainH(x0 + nx * 0.4, z0 + nz * 0.4) - 0.1,
        g1 = terrainH(x1 + nx * 0.4, z1 + nz * 0.4) - 0.1;
      const a = H.v(x0, g0, z0, nx, 0, nz),
        b = H.v(x1, g1, z1, nx, 0, nz),
        c = H.v(x1, Y.deck, z1, nx, 0, nz),
        d = H.v(x0, Y.deck, z0, nx, 0, nz);
      H.quadFacing(a, b, c, d, nx, 0, nz);
    }
  }

  /** Deck polygon east of the boardwalk following the path's detour (outer offset, clipped at xCut). */
  function bumpOut(p: WalkPath, xCut: number): { poly: P2[]; z0: number; z1: number } | null {
    const half = p.width / 2;
    const pts = p.pts;
    // find the detour: consecutive vertices east of xCut - half
    const idx: number[] = [];
    for (let i = 0; i < pts.length; i++) if (pts[i].x + half > xCut + 0.05) idx.push(i);
    if (!idx.length) return null;
    const i0 = Math.max(0, idx[0] - 1),
      i1 = Math.min(pts.length - 1, idx[idx.length - 1] + 1);
    const sub = pts.slice(i0, i1 + 1);
    const off = offsetPolyline(sub, half, 'east');
    // clip to x >= xCut
    const out: P2[] = [];
    for (let k = 0; k < off.length - 1; k++) {
      const a = off[k],
        b = off[k + 1];
      const ina = a.x >= xCut,
        inb = b.x >= xCut;
      if (ina) out.push(a);
      if (ina !== inb) {
        const t = (xCut - a.x) / (b.x - a.x);
        out.push({ x: xCut, z: a.z + (b.z - a.z) * t });
      }
    }
    const last = off[off.length - 1];
    if (last.x >= xCut) out.push(last);
    if (out.length < 3) return null;
    const zs = out.map((q) => q.z);
    return { poly: out, z0: Math.min(...zs), z1: Math.max(...zs) };
  }

  // ── walk paths drawn on grass
  for (const p of plan.paths) {
    if (!p.draw) continue;
    stats.pathRibbons++;
    ribbon(p);
  }

  function ribbon(p: WalkPath): void {
    const paved = p.surface === 'paving' || p.surface === 'stone';
    const y = paved ? Y.pathPaved : Y.path;
    const half = p.width / 2;
    const closed = p.pts.length > 3 && Math.hypot(p.pts[0].x - p.pts[p.pts.length - 1].x, p.pts[0].z - p.pts[p.pts.length - 1].z) < 0.05;
    // resample into ~1.2 m steps (ragged edge needs vertices)
    const src = closed ? p.pts.slice(0, -1) : p.pts.slice();
    const pts: { x: number; z: number; corner: boolean }[] = [];
    const nSeg = closed ? src.length : src.length - 1;
    for (let k = 0; k < nSeg; k++) {
      const a = src[k],
        b = src[(k + 1) % src.length];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.round(L / 1.2));
      for (let s = 0; s < n; s++) pts.push({ x: a.x + ((b.x - a.x) * s) / n, z: a.z + ((b.z - a.z) * s) / n, corner: s === 0 });
    }
    if (!closed) pts.push({ x: src[src.length - 1].x, z: src[src.length - 1].z, corner: true });
    const N = pts.length;
    const left: number[] = [],
      right: number[] = [];
    const sl: P2[] = [],
      sr: P2[] = [];
    for (let i = 0; i < N; i++) {
      const prev = closed ? pts[(i - 1 + N) % N] : pts[Math.max(0, i - 1)];
      const next = closed ? pts[(i + 1) % N] : pts[Math.min(N - 1, i + 1)];
      const c = pts[i];
      let t1x = c.x - prev.x,
        t1z = c.z - prev.z,
        t2x = next.x - c.x,
        t2z = next.z - c.z;
      let l1 = Math.hypot(t1x, t1z),
        l2 = Math.hypot(t2x, t2z);
      if (l1 < 1e-6) {
        t1x = t2x;
        t1z = t2z;
        l1 = l2;
      }
      if (l2 < 1e-6) {
        t2x = t1x;
        t2z = t1z;
        l2 = l1;
      }
      t1x /= l1;
      t1z /= l1;
      t2x /= l2;
      t2z /= l2;
      let mx = -(t1z + t2z),
        mz = t1x + t2x;
      let ml = Math.hypot(mx, mz);
      if (ml < 1e-6) {
        mx = -t1z;
        mz = t1x;
        ml = 1;
      }
      mx /= ml;
      mz /= ml;
      const cos = mx * -t1z + mz * t1x; // projection of miter on the segment normal
      const scale = 1 / Math.max(0.55, cos);
      const end = !closed && (i === 0 || i === N - 1);
      const jl = end ? 0 : (hash01(Math.round(c.x * 10), Math.round(c.z * 10), 11) - 0.5) * 0.16;
      const jr = end ? 0 : (hash01(Math.round(c.x * 10), Math.round(c.z * 10), 23) - 0.5) * 0.16;
      sl.push({ x: c.x + mx * (half * scale + jl), z: c.z + mz * (half * scale + jl) });
      sr.push({ x: c.x - mx * (half * scale + jr), z: c.z - mz * (half * scale + jr) });
    }
    surf(H, paved ? HM.pathPaved : HM.pathGravel, 0, 9, 0);
    for (let i = 0; i < N; i++) {
      left.push(H.v(sl[i].x, y, sl[i].z));
      right.push(H.v(sr[i].x, y, sr[i].z));
    }
    const segs = closed ? N : N - 1;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % N;
      H.quadUp(left[i], left[j], right[j], right[i]);
    }
    // low skirts along both edges
    surf(H, HM.side, 2, 9, 0);
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % N;
      for (const [s, sgn] of [
        [sl, 1],
        [sr, -1],
      ] as [P2[], number][]) {
        const a = s[i],
          b = s[j];
        const ex = b.x - a.x,
          ez = b.z - a.z;
        const l = Math.hypot(ex, ez) || 1;
        // outward = left normal for the left edge, right normal for the right edge
        const onx = (-ez / l) * sgn,
          onz = (ex / l) * sgn;
        H.wall(a.x, a.z, b.x, b.z, Y.ground, y, onx, onz);
      }
    }
  }

  // ── garden patios (layout shared with props / vegetation): flags, pavers, brick at 4.5 cm, decking raised
  for (const gp of getLayout(ctx).gardens) {
    const p = gp.patio;
    if (!p) continue;
    const deck = gp.patioMat === 2;
    const y = deck ? 0.13 : 0.045;
    const alongX = p.x1 - p.x0 >= p.z1 - p.z0;
    surf(H, HM.patio, gp.patioMat, 9, 0, alongX ? 0 : 1);
    H.rect(p.x0, p.z0, p.x1, p.z1, y);
    surf(H, deck ? HM.side : HM.side, deck ? 3 : 0, 9, 0);
    H.wall(p.x0, p.z0, p.x1, p.z0, Y.ground, y, 0, -1);
    H.wall(p.x1, p.z1, p.x0, p.z1, Y.ground, y, 0, 1);
    H.wall(p.x0, p.z1, p.x0, p.z0, Y.ground, y, -1, 0);
    H.wall(p.x1, p.z0, p.x1, p.z1, Y.ground, y, 1, 0);
    stats.patios++;
  }

  return { stats, info };
}

/** Offset an open polyline sideways with miter joins. side 'east': the side with the larger x at a southward segment. */
function offsetPolyline(pts: P2[], d: number, side: 'east' | 'west'): P2[] {
  const out: P2[] = [];
  const n = pts.length;
  const nrm = (a: P2, b: P2): P2 => {
    const ex = b.x - a.x,
      ez = b.z - a.z;
    const l = Math.hypot(ex, ez) || 1;
    // left normal (ez, -ex)/l points east for a southward (+z) segment
    const s = side === 'east' ? 1 : -1;
    return { x: (ez / l) * s, z: (-ex / l) * s };
  };
  for (let i = 0; i < n; i++) {
    const nA = i > 0 ? nrm(pts[i - 1], pts[i]) : null;
    const nB = i < n - 1 ? nrm(pts[i], pts[i + 1]) : null;
    let mx: number, mz: number;
    if (nA && nB) {
      mx = nA.x + nB.x;
      mz = nA.z + nB.z;
      const l = Math.hypot(mx, mz) || 1;
      mx /= l;
      mz /= l;
      const c = mx * nA.x + mz * nA.z;
      const s = d / Math.max(0.5, c);
      out.push({ x: pts[i].x + mx * s, z: pts[i].z + mz * s });
    } else {
      const m = (nA ?? nB)!;
      out.push({ x: pts[i].x + m.x * d, z: pts[i].z + m.z * d });
    }
  }
  return out;
}

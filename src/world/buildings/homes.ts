// Suburban detached houses (v2): deterministic massing variants that all stay inside the lot
// footprint (CLAUDE.md: overhangs ≤ 1.2 m and only above 2.4 m) and keep the plan's front door:
//
//   classic  box with a porch recessed around the front door
//   veranda  body set back behind a full-width veranda (deck, posts, railing, lean-to roof)
//   lplan    a front-gabled wing projects on one side, the door sits in the recess beside it
//            under a porch roof (cross-gable roof: the wing roof runs into the main slope)
//   garage   a single-storey garage wing on the driveway side (flat / shed / gable roof)
//            with the door facing the driveway; the main body is narrower
//   bay      ground-floor canted bay window beside the door + a hood canopy over the door
//
// plus, independently: roof shape (side gable, front gable, hip, half-hip, gambrel), a rear
// single-storey extension, two-tone walls (brick ground floor), dormer mix (gable / shed /
// hipped), chimney placement, shutters, window boxes, solar panels.
// ?legacyhouses switches back to the original single massing (houses.ts genHouseLegacy).

import * as THREE from 'three';
import {
  Gen, LRect, Side, FRONT, RIGHT, BACK, LEFT, Grid, WallLook, SideGeom,
  sideGeom, sideBox, sx, sz, makeGrid, gridU, gridY0, wallGrid, wallPlain, wallSeg, wallTri, setWallAttrs,
  gableRoof, hipRoof, flatRoof, roofLook, roofPoly, chimney, doorNiche, bandWithOpenings,
  col, shade, setCol, lightBox, wallLamp,
} from './gen';
import { WIN, PROF, WALLPAT, ROOFPAT, FRAME, GLASS, LIGHT_MODE } from './materials';
import { genHouseLegacy } from './houses';
import { windowBox, shutterPair, shutterState, downpipe, acUnit, climber } from './clutter';
import { GREEN } from './green';

const HOUSE_WALLS = ['#f4efe4', '#efe3c8', '#dfe4e2', '#c9dcea', '#cfdcbf', '#f2dfa0', '#efcfc4', '#d8c4a6', '#e8e8e8', '#bfd3d6', '#e3d6ee', '#f0d9b5'];
const HOUSE_ROOFS = ['#a24c36', '#b5583e', '#5a6270', '#4d5560', '#6b4a3a', '#8a5a44', '#3f454d', '#7c3b2e', '#55606b'];
const BRICKS = ['#a0553d', '#b06a4c', '#9a6650', '#8d4a36', '#b8805e'];
const DOORS = ['#b23a32', '#263a5c', '#2f5d50', '#e0b33c', '#2a6f74', '#5b3b5e', '#3b2a20', '#f4efe4'];
const SHUTTERS = ['#2f5d50', '#263a5c', '#5f6b73', '#7a2e2a', '#2a6f74', '#3b2a20', '#8a9a5b'];
const FLOWERS = ['#e63946', '#ff7aa2', '#f1faee', '#f4a261', '#b05bd6', '#ffd23f'];

type Plan = 'classic' | 'veranda' | 'lplan' | 'garage' | 'bay';
type RoofKind = 'gableX' | 'gableZ' | 'hip' | 'halfhip' | 'gambrel';

let legacyHouses = false;
/** ?legacyhouses: build every house with the original generator. */
export function setLegacyHouses(on: boolean): void {
  legacyHouses = on;
}

interface PlainLook {
  color: THREE.Color;
  pattern: number;
  seed: number;
}
interface Op {
  u: number;
  w: number;
  h: number;
  kind: 'door' | 'garage' | 'patio' | 'gap';
}

/** House plan statistics (for module stats / tuning). */
export const houseStats: Record<string, number> = {};
/** Per-house record (diagnostics: find a house of a given plan for close-up captures). */
export const houseLog: { id: number; x: number; z: number; front: string; plan: string; roof: string; floors: number }[] = [];
export function resetHomes(): void {
  for (const k of Object.keys(houseStats)) delete houseStats[k];
  houseLog.length = 0;
}

export function genHouse(g: Gen): void {
  g.roofPipes = false;
  if (legacyHouses) {
    genHouseLegacy(g);
    return;
  }
  const { lot, rng, W, D } = g;
  const s = g.shell;
  const t = g.trim;
  const INS = 0.12;
  const F: LRect = { x0: -W / 2 + INS, x1: W / 2 - INS, z0: -D / 2 + INS, z1: D / 2 - INS };
  const floors = lot.floors >= 2 ? 2 : 1;
  const eave = lot.height;
  const gH = floors === 2 ? Math.min(3.1, eave / 2) : eave;
  const fH = floors === 2 ? eave - gH : 0;

  // ── look
  const baseC = jitPick(rng, HOUSE_WALLS);
  const siding = rng.chance(0.42);
  const brick = !siding && rng.chance(0.22);
  const pattern = siding ? WALLPAT.SIDING : brick ? WALLPAT.BRICK : WALLPAT.PLASTER;
  const wc = brick ? col(rng.pick(BRICKS)) : baseC;
  // two-tone: brick (or stone) ground floor under a sided / rendered upper floor
  const twoTone = floors === 2 && !brick && rng.chance(0.32);
  const gc = twoTone ? (rng.chance(0.75) ? col(rng.pick(BRICKS)) : col('#c9bfae')) : wc;
  const gPat = twoTone ? (gc.r > gc.b * 1.3 ? WALLPAT.BRICK : WALLPAT.STONE) : pattern;
  const trimC = col(rng.chance(0.62) ? '#f6f3ec' : rng.pick(['#e9dfc8', '#3b3f44', '#5a3d2b', '#c9d3cf', '#d8c7a4', '#8a9a8b', '#efe6d2']));
  const doorC = col(rng.pick(DOORS));
  const shutters = rng.chance(0.38);
  const shutterC = col(rng.pick(SHUTTERS));
  const boxes = rng.chance(0.42);
  const frameIdx = trimC.r < 0.3 ? FRAME.BLACK : rng.chance(0.66) ? FRAME.WHITE : rng.pick([FRAME.WOOD, FRAME.GREEN, FRAME.CREAM, FRAME.DARK, FRAME.TEAL, FRAME.CREAM]);
  const roofC = col(rng.pick(HOUSE_ROOFS));
  const rPat = roofC.r > roofC.b * 1.25 ? ROOFPAT.TILES : ROOFPAT.SLATE;
  const upLook = (style: number = WIN.MUNTIN): WallLook => ({ color: wc, pattern, frame: frameIdx, glass: GLASS.NEUTRAL, style, profile: PROF.HOME, seed: g.seed });
  const gLook = (style: number = WIN.MUNTIN): WallLook => ({ color: gc, pattern: gPat, frame: frameIdx, glass: GLASS.NEUTRAL, style, profile: PROF.HOME, seed: g.seed });
  const upPlain: PlainLook = { color: wc, pattern, seed: g.seed };
  const gPlain: PlainLook = { color: gc, pattern: gPat, seed: g.seed };
  const drive = g.driveSide;
  const door = g.doors.find((d) => d.side === FRONT);
  const doorX = door ? door.u - W / 2 : (F.x0 + F.x1) / 2;

  // ── plan
  const roomR = F.x1 - (doorX + 0.95);
  const roomL = doorX - 0.95 - F.x0;
  const wingRight = roomR >= roomL;
  const wingW = Math.min(4.4, Math.max(roomR, roomL));
  const garW = THREE.MathUtils.clamp(F.x1 - F.x0 - 4.8, 2.9, 3.6);
  const garOk =
    drive !== undefined && F.x1 - F.x0 - garW >= 4.3 && (drive === RIGHT ? doorX + 0.75 <= F.x1 - garW : doorX - 0.75 >= F.x0 + garW);
  const plans: Plan[] = ['classic', 'veranda', 'lplan', 'garage', 'bay'];
  const weights = floors === 2 ? [0.15, 0.2, 0.24, 0.22, 0.19] : [0.14, 0.24, 0.2, 0.3, 0.12];
  if (wingW < 3.2) weights[2] = 0;
  if (!garOk) weights[3] = 0;
  const plan = rng.weighted(plans, weights);
  houseStats[plan] = (houseStats[plan] ?? 0) + 1;

  // roof kind (the plan's "hip" lots stay hipped or half-hipped)
  let roofKind: RoofKind;
  if (lot.roof === 'hip') roofKind = rng.chance(0.35) ? 'halfhip' : 'hip';
  else roofKind = rng.weighted<RoofKind>(['gableX', 'gableZ', 'halfhip', 'gambrel'], [0.48, 0.24, 0.1, floors === 1 ? 0.3 : 0]);
  if (plan === 'lplan' && (roofKind === 'gableZ' || roofKind === 'gambrel')) roofKind = 'gableX';
  {
    const fp = lot.footprint;
    houseLog.push({ id: lot.id, x: Math.round((fp.x0 + fp.x1) / 2), z: Math.round((fp.z0 + fp.z1) / 2), front: lot.front, plan, roof: roofKind, floors });
  }

  // main body rect M (+ wing / garage / bay / veranda zones)
  const M: LRect = { ...F };
  let wing: LRect | null = null;
  let gar: LRect | null = null;
  const vd = rng.range(1.9, 2.3);
  const wd = rng.range(2.2, 2.9);
  const bd = 0.8;
  if (plan === 'veranda') M.z1 = F.z1 - vd;
  else if (plan === 'bay') M.z1 = F.z1 - bd;
  else if (plan === 'lplan') {
    M.z1 = F.z1 - wd;
    wing = wingRight ? { x0: F.x1 - wingW, x1: F.x1, z0: M.z1, z1: F.z1 } : { x0: F.x0, x1: F.x0 + wingW, z0: M.z1, z1: F.z1 };
  } else if (plan === 'garage') {
    const gd = Math.min(rng.range(6.0, 6.6), F.z1 - F.z0 - 1.5);
    if (drive === RIGHT) {
      M.x1 = F.x1 - garW;
      gar = { x0: M.x1, x1: F.x1, z0: F.z1 - gd, z1: F.z1 };
    } else {
      M.x0 = F.x0 + garW;
      gar = { x0: F.x0, x1: M.x0, z0: F.z1 - gd, z1: F.z1 };
    }
  }
  // rear single-storey extension (kitchen / garden room)
  let ext: LRect | null = null;
  const ed = rng.range(2.4, 3.0);
  const extFlat = rng.chance(0.55);
  const extTop = extFlat ? 3.0 : 2.7;
  if (rng.chance(0.3) && M.z1 - M.z0 - ed >= 5.6) {
    const ew = (M.x1 - M.x0) * rng.range(0.55, 0.85);
    const left = rng.chance(0.5);
    ext = { x0: left ? M.x0 : M.x1 - ew, x1: left ? M.x0 + ew : M.x1, z0: M.z0, z1: M.z0 + ed };
    M.z0 += ed;
  }
  const garageInSide = plan !== 'garage';

  // ── classic porch recess (only plan 'classic')
  const pd = rng.range(1.7, 2.1);
  const pw = Math.min(rng.range(2.8, 3.6), M.x1 - M.x0 - 2.2);
  let pa = doorX - pw / 2;
  pa = Math.max(M.x0, Math.min(M.x1 - pw, pa));
  if (pa - M.x0 < 1.0) pa = M.x0;
  if (M.x1 - (pa + pw) < 1.0) pa = M.x1 - pw;
  const pb = pa + pw;
  const zP = M.z1 - pd;
  const porchLeft = pa <= M.x0 + 1e-3,
    porchRight = pb >= M.x1 - 1e-3;

  // ─────────────────────────────────────────────── wall helpers ──
  const winGrid = (len: number, y0: number, h: number, wanted?: number): Grid => {
    const n = wanted ?? Math.max(1, Math.min(3, Math.round((len - 0.8) / 2.6)));
    return makeGrid(0, len, y0, h, 1, { spacing: 2.6, cols: n, winW: 1.15, winH: Math.min(1.45, h - 1.35), sill: 0.9, margin: 0.5 });
  };
  /** Ground-floor band on side sg over [uA,uB] with openings (doors / garage / patio / gaps). */
  const groundRun = (sg: SideGeom, uA: number, uB: number, ops: Op[], windows: boolean, top = gH, front = false) => {
    bandWithOpenings(
      sg, uA, uB, ops,
      (a, b) => {
        const len = b - a;
        if (windows && len > 1.75) {
          const n = Math.max(1, Math.min(3, Math.round((len - 0.6) / 2.6)));
          const gr = makeGrid(a, b, 0, top, 1, { spacing: 2.6, cols: n, winW: Math.min(1.15, len - 0.7), winH: Math.min(1.45, top - 1.35), sill: 0.9, margin: Math.min(0.5, (len - 0.9) / 2) });
          wallGrid(s, sg, a, b, 0, top, gr, gLook());
          if (shutters && front) shutterSet(sg, gr, true);
        } else wallPlain(s, sg, a, b, 0, top, gPlain);
      },
      (a, b, y0) => wallPlain(s, sg, a, b, y0, top, gPlain),
    );
    for (const op of ops) {
      if (op.kind === 'door') {
        doorNiche(g, sg, op.u, { w: op.w, h: op.h, depth: 0.12, wallColor: gc, frameColor: trimC, doorColor: doorC, transom: rng.chance(0.3), seed: g.seed, frameOut: 0.08 });
      } else if (op.kind === 'garage') garageDoor(sg, op.u, op.w, op.h);
      else if (op.kind === 'patio') patioDoor(sg, op.u, op.w, op.h);
    }
  };
  /** Upper-floor band of a side with a regular window grid. */
  const upperRun = (sg: SideGeom, uA: number, uB: number, front: boolean) => {
    const len = uB - uA;
    if (len < 0.05) return;
    if (len < 1.9) {
      wallPlain(s, sg, uA, uB, gH, eave, upPlain);
      return;
    }
    const n = Math.max(1, Math.min(3, Math.round((len - 0.8) / 2.7)));
    const gr = makeGrid(uA, uB, gH, fH, 1, { spacing: 2.7, cols: n, winW: Math.min(1.1, len - 0.8), winH: Math.min(1.35, fH - 1.2), sill: 0.85, margin: Math.min(0.6, (len - 1.0) / 2) });
    wallGrid(s, sg, uA, uB, gH, eave, gr, upLook());
    if (shutters && (front || rng.chance(0.4))) shutterSet(sg, gr, false);
    setCol(t, trimC);
    for (let i = 0; i < gr.n; i++) {
      const u = gridU(gr, i);
      const ww = gr.wx1 - gr.wx0;
      sideBox(t, sg, u - ww / 2 - 0.08, u + ww / 2 + 0.08, 0, 0.1, gridY0(gr, 0) - 0.07, gridY0(gr, 0), true);
      if (boxes && front) flowerBox(sg, u, ww, gridY0(gr, 0));
    }
  };
  const floorBand = (sg: SideGeom, uA: number, uB: number) => {
    if (floors !== 2 || uB - uA < 0.05) return;
    setCol(t, twoTone ? shade(trimC, 0.97) : trimC);
    sideBox(t, sg, uA, uB, 0, 0.06, gH - 0.04, gH + 0.12, true);
  };
  /** Side wall with (optionally) the garage door, as one run over [uA,uB] of side sg. */
  const sideRun = (sg: SideGeom, uA: number, uB: number, sd: Side, frontAtU0: boolean, top = gH) => {
    const L = uB - uA;
    const ops: Op[] = [];
    if (garageInSide && drive === sd && L > 5.5) {
      const gw = 2.7,
        gh = Math.min(2.25, top - 0.5);
      // near the front of the house (the driveway runs along the front part of the side)
      ops.push({ u: frontAtU0 ? uA + 0.7 + gw / 2 : uB - 0.7 - gw / 2, w: gw, h: gh, kind: 'garage' });
    }
    groundRun(sg, uA, uB, ops, true, top);
  };

  // ───────────────────────────────────────────────── main body walls ──
  const sgF = sideGeom(M, FRONT);
  const sgB = sideGeom(M, BACK);
  // front
  if (plan === 'classic') {
    if (!porchLeft) groundRun(sideGeom({ ...M, x1: pa }, FRONT), 0, pa - M.x0, [], pa - M.x0 > 2.0, gH, true);
    if (!porchRight) groundRun({ ...sgF, x0: pb, L: M.x1 - pb }, 0, M.x1 - pb, [], M.x1 - pb > 2.0, gH, true);
    if (!porchLeft) wallSeg(s, pa, M.z1, pa, zP, 0, gH, null, gPlain);
    if (!porchRight) wallSeg(s, pb, zP, pb, M.z1, 0, gH, null, gPlain);
    const psg: SideGeom = { x0: pa, z0: zP, tx: 1, tz: 0, nx: 0, nz: 1, L: pw };
    const du = Math.min(pw - 0.75, Math.max(0.75, doorX - pa));
    groundRun(psg, 0, pw, [{ u: du, w: 1.05, h: 2.2, kind: 'door' }], true);
    porchLamp(pa + du + 0.85, zP + 0.06, 2.0);
    // deck, posts, railing, ceiling
    porchDeck(pa, pb, zP, M.z1, 0.16, col(['#a87f58', '#9a8f80', '#8d6e52'][Math.abs(Math.floor(g.seed)) % 3]));
    setCol(t, trimC);
    const postH = gH;
    // posts 15 cm square on a 22 cm plinth block, moulded cap under a 26 cm header beam with a drip board;
    // a stone step in front of the opening between the two rail runs
    const zc = M.z1 - 0.12;
    for (const px of [pa + 0.13, pb - 0.13]) porchPost(px, zc, 0.16, postH - 0.3);
    t.box(pa, postH - 0.3, M.z1 - 0.24, pb, postH, M.z1 - 0.01, 0b111111);
    setCol(t, shade(trimC, 0.82));
    t.box(pa, postH - 0.32, M.z1 - 0.03, pb, postH - 0.3, M.z1 - 0.0, 0b111111);
    porchRail(pa + 0.24, pa + Math.max(0.3, pw * 0.5 - 0.7), zc, 0.16, 0.8, trimC);
    porchRail(pb - Math.max(0.3, pw * 0.5 - 0.7), pb - 0.24, zc, 0.16, 0.8, trimC);
    if (F.z1 - M.z1 >= 0.34) {
      const sa = pa + Math.max(0.3, pw * 0.5 - 0.7) + 0.05, sb = pb - Math.max(0.3, pw * 0.5 - 0.7) - 0.05;
      setCol(t, col('#9c9890'));
      t.box(sa, 0, M.z1 - 0.02, sb, 0.085, M.z1 + 0.3, 0b111111);
    }
    setCol(t, shade(trimC, 0.92));
    t.hrect(pa, zP, pb, M.z1, postH - 0.31, false);
    if (rng.chance(0.6)) porchBench(pa + 0.5, zP + 0.25);
  } else {
    // door in the main front wall (veranda / L-plan recess / garage plan / bay plan)
    const ops: Op[] = [{ u: doorX - M.x0, w: 1.05, h: 2.2, kind: 'door' }];
    let bay: { a: number; b: number } | null = null;
    if (plan === 'bay') {
      // bay on the wider side of the door
      const bw = Math.min(2.6, Math.max(doorX - M.x0, M.x1 - doorX) - 1.4);
      if (bw >= 1.9) {
        const leftSide = doorX - M.x0 > M.x1 - doorX;
        const c = leftSide ? (M.x0 + doorX - 0.7) / 2 : (doorX + 0.7 + M.x1) / 2;
        bay = { a: c - bw / 2 - M.x0, b: c + bw / 2 - M.x0 };
        ops.push({ u: (bay.a + bay.b) / 2, w: bw, h: gH - 0.25, kind: 'gap' });
      }
    }
    if (wing) {
      // the wing covers part of the main front: only the recess part is a wall
      const a = wing.x0 > M.x0 + 0.01 ? 0 : wing.x1 - M.x0;
      const b = wing.x0 > M.x0 + 0.01 ? wing.x0 - M.x0 : M.x1 - M.x0;
      groundRun(sgF, a, b, ops, true, gH, true);
    } else groundRun(sgF, 0, M.x1 - M.x0, ops, true, gH, true);
    if (bay) bayWindow(M.x0 + bay.a, M.x0 + bay.b, M.z1, F.z1);
    if (plan === 'bay' || plan === 'garage') doorHood(doorX, M.z1);
    // porch lamp beside the door (below 2.4 m only where the wall is set back from the footprint)
    if (plan === 'garage') wallLamp(g, sgF, doorX - M.x0 + 0.95, 2.42, 0);
    else porchLamp(doorX + 0.85, M.z1 + 0.06, 2.0);
    // front steps (inside the footprint; the veranda deck has its own)
    if (plan === 'lplan' || plan === 'bay') {
      setCol(t, col('#b9b2a6'));
      t.box(doorX - 0.75, 0, M.z1, doorX + 0.75, 0.16, M.z1 + 0.45, 0b110111);
    }
  }
  // sides of the main body (the L wing's outer side continues flush to the front)
  for (const sd of [RIGHT, LEFT] as Side[]) {
    const x = sd === RIGHT ? M.x1 : M.x0;
    const flushWing = wing && (sd === RIGHT ? wing.x1 >= M.x1 - 1e-3 : wing.x0 <= M.x0 + 1e-3);
    const shortFront = plan === 'classic' && ((sd === LEFT && porchLeft) || (sd === RIGHT && porchRight));
    const zFront = flushWing ? F.z1 : shortFront ? zP : M.z1;
    const zBack = M.z0;
    const L = zFront - zBack;
    const sg: SideGeom = sd === RIGHT ? { x0: x, z0: zFront, tx: 0, tz: -1, nx: 1, nz: 0, L } : { x0: x, z0: zBack, tx: 0, tz: 1, nx: -1, nz: 0, L };
    const facesGarage = gar && (sd === RIGHT ? gar.x0 >= M.x1 - 1e-3 : gar.x1 <= M.x0 + 1e-3);
    if (facesGarage && gar) {
      // back part full height; the part next to the garage only above the garage roof
      const gTop = garTop;
      const uSplit = sd === RIGHT ? zFront - gar.z0 : gar.z0 - zBack;
      if (sd === RIGHT) {
        groundRun(sg, uSplit, L, [], true);
        wallPlain(s, sg, 0, uSplit, gTop - 0.05, gH, gPlain);
      } else {
        groundRun(sg, 0, uSplit, [], true);
        wallPlain(s, sg, uSplit, L, gTop - 0.05, gH, gPlain);
      }
    } else sideRun(sg, 0, L, sd, sd === RIGHT);
    if (floors === 2) {
      upperRun(sg, 0, L, false);
      floorBand(sg, 0, L);
    }
  }
  // back of the main body: patio door unless the extension takes it
  {
    const ops: Op[] = [];
    let a = 0,
      b = sgB.L;
    if (ext) {
      // the extension covers part of the back wall up to its roof
      const ea = M.x1 - ext.x1,
        eb = M.x1 - ext.x0; // u along the back side runs right → left
      if (ea > 0.05) groundRun(sgB, 0, ea, [], true);
      if (eb < sgB.L - 0.05) groundRun(sgB, eb, sgB.L, [], true);
      wallPlain(s, sgB, ea, eb, extTop - 0.05, gH, gPlain);
      a = b = 0;
    } else ops.push({ u: sgB.L * rng.range(0.3, 0.7), w: 1.8, h: 2.15, kind: 'patio' });
    if (b > a) groundRun(sgB, a, b, ops, true);
  }
  // upper floor front / back (+ L wing front handled with the wing)
  if (floors === 2) {
    const fa = wing && wing.x0 <= M.x0 + 0.01 ? wing.x1 - M.x0 : 0;
    const fb = wing && wing.x0 > M.x0 + 0.01 ? wing.x0 - M.x0 : sgF.L;
    upperRun(sgF, fa, fb, true);
    floorBand(sgF, fa, fb);
    upperRun(sgB, 0, sgB.L, false);
    floorBand(sgB, 0, sgB.L);
    if (plan === 'classic') {
      setCol(t, shade(trimC, 0.9));
      t.hrect(pa, zP, pb, M.z1, gH - 0.005, false);
    }
  }

  // ─────────────────────────────────────────────────── main roof ──
  const ridgeAlongX = roofKind === 'gableX' || roofKind === 'gambrel' || ((roofKind === 'halfhip' || roofKind === 'hip') && M.x1 - M.x0 >= M.z1 - M.z0) || plan === 'lplan';
  const span = ridgeAlongX ? M.z1 - M.z0 : M.x1 - M.x0;
  const half = span / 2;
  const pitch = floors === 1 ? rng.range(0.75, 1.0) : rng.range(0.62, 0.85);
  const rise = half * pitch;
  const yr = eave + rise;
  const oe = 0.4,
    og = 0.3;
  if (roofKind === 'hip') {
    hipRoof(g, M, eave, eave + Math.min(M.x1 - M.x0, M.z1 - M.z0) * 0.5 * pitch, 0.4, roofC, rPat, trimC);
  } else if (roofKind === 'gableX' || roofKind === 'gableZ') {
    gableRoof(g, M, ridgeAlongX, eave, yr, oe, og, roofC, rPat, trimC);
    gableEnds(M, ridgeAlongX, eave, yr, -1);
  } else if (roofKind === 'halfhip') {
    halfHipRoof(M, ridgeAlongX, eave, yr, rng.range(0.5, 0.62));
  } else {
    gambrelRoof(M, eave, yr);
  }

  // ── L wing: front-gabled, ridge across the main ridge, roof runs into the main front slope
  if (wing) {
    const ws = sideGeom(wing, FRONT);
    groundRun(ws, 0, ws.L, [], true, gH, true);
    // inner side (towards the recess / door)
    const wingIsRight = wing.x0 > M.x0 + 0.01; // wing on the right → its inner side is its left side
    const isg = wingIsRight ? sideGeom(wing, LEFT) : sideGeom(wing, RIGHT);
    groundRun(isg, 0, isg.L, [], isg.L > 2.0);
    if (floors === 2) {
      upperRun(ws, 0, ws.L, true);
      floorBand(ws, 0, ws.L);
      upperRun(isg, 0, isg.L, false);
      floorBand(isg, 0, isg.L);
    }
    const wHalf = (wing.x1 - wing.x0) / 2;
    const wRise = wHalf * pitch;
    const zEnd = M.z1 - wHalf - 0.3; // where its ridge has disappeared into the main slope
    const wr: LRect = { x0: wing.x0, x1: wing.x1, z0: zEnd, z1: wing.z1 };
    const oeIn = 0.35,
      oeOut = 0.1;
    gableRoof(g, wr, false, eave, eave + wRise, 0.35, 0, roofC, rPat, trimC, wingIsRight ? oeOut : oeIn, wingIsRight ? oeIn : oeOut, 0, 0.3);
    const fs = sideGeom(wr, FRONT);
    const attic = makeGrid(fs.L / 2 - 0.55, fs.L / 2 + 0.55, eave + 0.3, Math.min(1.5, wRise * 0.6), 1, { spacing: 1.1, cols: 1, winW: 0.7, winH: Math.min(0.9, wRise * 0.42), sill: 0.05, margin: 0 });
    wallTri(s, fs, 0, fs.L, fs.L / 2, eave, eave + wRise, upPlain, wRise > 1.9 ? attic : null, WIN.MUNTIN, PROF.HOME, frameIdx, GLASS.NEUTRAL);
    // porch roof over the recess in front of the door (lean-to between wing and body corner)
    const ra = wingIsRight ? M.x0 : wing.x1,
      rb = wingIsRight ? wing.x0 : M.x1;
    const pA = Math.max(ra, doorX - 1.6),
      pB = Math.min(rb, doorX + 1.6);
    if (pB - pA > 1.6) leanTo(pA, pB, M.z1, F.z1 - 0.05, floors === 2 ? gH - 0.12 : eave - 0.5, 2.55, true);
    porchLamp(doorX + 0.85, M.z1 + 0.06, 2.0);
  }

  // ── veranda
  if (plan === 'veranda') {
    const full = rng.chance(0.65);
    const va = full ? M.x0 : Math.max(M.x0, doorX - 2.6);
    const vb = full ? M.x1 : Math.min(M.x1, doorX + 2.6);
    const yA = floors === 2 ? gH - 0.12 : eave - 0.5;
    leanTo(va, vb, M.z1, F.z1 - 0.05, yA, 2.55, false);
    // deck, posts, railing with an opening at the steps
    porchDeck(va, vb, M.z1, F.z1 - 0.02, 0.22, col(rng.pick(['#a87f58', '#9a8f80', '#8d6e52'])));
    setCol(t, trimC);
    const n = Math.max(2, Math.round((vb - va) / 2.3));
    const zp = F.z1 - 0.2;
    for (let k = 0; k <= n; k++) {
      const px = va + 0.12 + ((vb - va - 0.24) * k) / n;
      porchPost(px, zp, 0.22, 2.52);
    }
    const sa = doorX - 0.75,
      sb = doorX + 0.75;
    if (sa - va > 0.4) porchRail(va + 0.2, sa, zp, 0.22, 0.85, trimC);
    if (vb - sb > 0.4) porchRail(sb, vb - 0.2, zp, 0.22, 0.85, trimC);
    setCol(t, col('#b9b2a6'));
    t.box(sa, 0, F.z1 - 0.12, sb, 0.11, F.z1 - 0.01, 0b110111);
    if (rng.chance(0.7)) porchBench(va + 0.4, M.z1 + 0.25);
  }

  // ── garage wing
  if (gar) {
    const gTop = garTop;
    const outerRight = gar.x1 >= F.x1 - 1e-3;
    const gs = sideGeom(gar, outerRight ? RIGHT : LEFT);
    const gw = 2.65,
      gh = 2.2;
    const gu = outerRight ? 0.45 + gw / 2 + 0.25 : gs.L - 0.45 - gw / 2 - 0.25;
    const garLook: PlainLook = gPlain;
    bandWithOpenings(gs, 0, gs.L, [{ u: gu, w: gw, h: gh }], (a, b) => wallPlain(s, gs, a, b, 0, gTop, garLook), (a, b, y0) => wallPlain(s, gs, a, b, y0, gTop, garLook));
    garageDoor(gs, gu, gw, gh);
    // street face: a small window; back face: a side door
    const fsg = sideGeom(gar, FRONT);
    const gr = makeGrid(0, fsg.L, 0, gTop, 1, { spacing: fsg.L, cols: 1, winW: 1.1, winH: 0.75, sill: 1.35, margin: 0.4 });
    wallGrid(s, fsg, 0, fsg.L, 0, gTop, gr, gLook(WIN.PLAIN));
    const bsg = sideGeom(gar, BACK);
    wallPlain(s, bsg, 0, bsg.L, 0, gTop, garLook);
    const gRoof = floors === 2 ? rng.int(0, 2) : rng.chance(0.5) ? 0 : 2;
    if (gRoof === 0) {
      // flat roof with a coping band
      flatRoof(s, gar, gTop, col('#7d7a74'), ROOFPAT.FLAT, g.seed + 9);
      setCol(t, shade(trimC, 0.95));
      t.box(gar.x0, gTop - 0.08, gar.z0, gar.x1, gTop + 0.14, gar.z0 + 0.12, 0b111111 & ~8);
      t.box(gar.x0, gTop - 0.08, gar.z1 - 0.12, gar.x1, gTop + 0.14, gar.z1, 0b111111 & ~8);
      t.box(outerRight ? gar.x1 - 0.12 : gar.x0, gTop - 0.08, gar.z0 + 0.12, outerRight ? gar.x1 : gar.x0 + 0.12, gTop + 0.14, gar.z1 - 0.12, 0b111111 & ~8);
    } else if (gRoof === 1) {
      // shed roof sloping down toward the driveway
      const hi = gTop + 0.9;
      const xo = outerRight ? gar.x1 + 0.25 : gar.x0 - 0.25;
      const xi = outerRight ? gar.x0 : gar.x1;
      roofLook(s, roofC, rPat, g.seed + 9);
      const zf = gar.z1 + 0.25,
        zb = gar.z0 - 0.2;
      const yo = gTop - 0.25 * (0.9 / (gar.x1 - gar.x0));
      const pts = outerRight
        ? [[xo, yo, zf], [xo, yo, zb], [xi, hi, zb], [xi, hi, zf]]
        : [[xo, yo, zb], [xo, yo, zf], [xi, hi, zf], [xi, hi, zb]];
      const ax = outerRight ? [0, 0, -1] : [0, 0, 1];
      const sl = Math.hypot(xi - xo, hi - yo);
      roofPoly(s, pts, ax, [(xi - xo) / sl, (hi - yo) / sl, 0]);
      // gable-ish side walls of the shed (front / back triangles)
      for (const sd of [FRONT, BACK] as Side[]) {
        const sg2 = sideGeom(gar, sd);
        const towardsOuterAtU0 = sd === FRONT ? !outerRight : outerRight;
        wallTri(s, sg2, 0, sg2.L, towardsOuterAtU0 ? sg2.L : 0, gTop, hi - 0.02, garLook);
      }
      setCol(t, trimC);
      t.box(Math.min(xo, xo + (outerRight ? -0.05 : 0.05)), yo - 0.16, zb, Math.max(xo, xo + (outerRight ? -0.05 : 0.05)), yo + 0.02, zf, 0b111111 & ~8);
    } else {
      // small front gable (ridge across the street)
      const gHalf = (gar.x1 - gar.x0) / 2;
      const gRise = gHalf * 0.7;
      gableRoof(g, gar, false, gTop, gTop + gRise, 0.25, 0.25, roofC, rPat, trimC, outerRight ? 0.25 : 0.05, outerRight ? 0.05 : 0.25);
      const fs2 = sideGeom(gar, FRONT);
      const bs2 = sideGeom(gar, BACK);
      wallTri(s, fs2, 0, fs2.L, fs2.L / 2, gTop, gTop + gRise, garLook);
      wallTri(s, bs2, 0, bs2.L, bs2.L / 2, gTop, gTop + gRise, garLook);
    }
  }

  // ── rear extension
  if (ext) {
    const eb = sideGeom(ext, BACK);
    groundRun(eb, 0, eb.L, [{ u: eb.L * 0.5, w: Math.min(2.4, eb.L - 1.0), h: 2.2, kind: 'patio' }], true, extTop);
    for (const sd of [RIGHT, LEFT] as Side[]) {
      const sg2 = sideGeom(ext, sd);
      const exposed = sd === RIGHT ? ext.x1 >= M.x1 - 1e-3 : ext.x0 <= M.x0 + 1e-3;
      // flush with the main side: plain wall; inset: a small window
      if (exposed) wallPlain(s, sg2, 0, sg2.L, 0, extTop, gPlain);
      else groundRun(sg2, 0, sg2.L, [], sg2.L > 2.0, extTop);
    }
    if (extFlat) {
      flatRoof(s, ext, extTop, col('#7d7a74'), ROOFPAT.FLAT, g.seed + 13);
      setCol(t, shade(trimC, 0.95));
      t.box(ext.x0, extTop - 0.1, ext.z0, ext.x1, extTop + 0.12, ext.z0 + 0.1, 0b111111 & ~8);
      t.box(ext.x0, extTop - 0.1, ext.z0 + 0.1, ext.x0 + 0.1, extTop + 0.12, ext.z1, 0b111111 & ~8);
      t.box(ext.x1 - 0.1, extTop - 0.1, ext.z0 + 0.1, ext.x1, extTop + 0.12, ext.z1, 0b111111 & ~8);
      // roof lantern
      setCol(t, shade(trimC, 0.9));
      const cx = (ext.x0 + ext.x1) / 2,
        cz = (ext.z0 + ext.z1) / 2;
      t.box(cx - 0.7, extTop, cz - 0.5, cx + 0.7, extTop + 0.22, cz + 0.5);
      roofLook(s, col('#6f8798'), ROOFPAT.SKYLIGHT, g.seed + 14);
      roofPoly(s, [[cx - 0.62, extTop + 0.22, cz + 0.42], [cx + 0.62, extTop + 0.22, cz + 0.42], [cx + 0.62, extTop + 0.5, cz], [cx - 0.62, extTop + 0.5, cz]], [1, 0, 0], [0, 0.57, -0.82]);
      roofPoly(s, [[cx + 0.62, extTop + 0.22, cz - 0.42], [cx - 0.62, extTop + 0.22, cz - 0.42], [cx - 0.62, extTop + 0.5, cz], [cx + 0.62, extTop + 0.5, cz]], [-1, 0, 0], [0, 0.57, 0.82]);
    } else {
      // lean-to sloping to the garden
      const hi = floors === 2 ? gH + 0.35 : eave - 0.3;
      roofLook(s, roofC, rPat, g.seed + 13);
      const zb = ext.z0 - 0.3;
      const yb = extTop - 0.3 * ((hi - extTop) / (ext.z1 - ext.z0));
      const sl = Math.hypot(ext.z1 - zb, hi - yb);
      roofPoly(s, [[ext.x1 + 0.05, yb, zb], [ext.x0 - 0.05, yb, zb], [ext.x0 - 0.05, hi, ext.z1], [ext.x1 + 0.05, hi, ext.z1]], [-1, 0, 0], [0, (hi - yb) / sl, (ext.z1 - zb) / sl]);
      for (const sd of [RIGHT, LEFT] as Side[]) {
        const sg2 = sideGeom(ext, sd);
        wallTri(s, sg2, 0, sg2.L, sd === RIGHT ? 0 : sg2.L, extTop, hi - 0.02, gPlain);
      }
      setCol(t, trimC);
      t.box(ext.x0 - 0.05, yb - 0.16, zb - 0.03, ext.x1 + 0.05, yb + 0.02, zb + 0.03, 0b111111 & ~8);
    }
  }

  // ─────────────────────────────────────────── roof furniture ──
  const frontSlope = (roofKind === 'gableX' || roofKind === 'gambrel' || roofKind === 'halfhip' || roofKind === 'hip') && ridgeAlongX;
  // dormers (mostly on single-storey houses with a front slope; sometimes on two-storey ones)
  let dormers = false;
  if (frontSlope && plan !== 'lplan' && rise > 2.3 && rng.chance(floors === 1 ? 0.7 : 0.2)) {
    dormers = true;
    const kindD = rng.int(0, 2);
    const zc = (M.z0 + M.z1) / 2;
    const slope = roofKind === 'gambrel' ? GAMB_P : pitch;
    const zFront = M.z1 - (roofKind === 'gambrel' ? 0.45 : 1.25);
    const yBase = eave + (M.z1 - zFront) * slope;
    const mx = (M.x0 + M.x1) / 2;
    if (kindD === 1 && M.x1 - M.x0 > 6.4) shedDormer(mx + rng.range(-0.5, 0.5), Math.min(3.2, M.x1 - M.x0 - 3.2), zFront, yBase, slope, zc);
    else {
      const two = M.x1 - M.x0 > 7.4 && rng.chance(0.5);
      const xs = two ? [M.x0 + (M.x1 - M.x0) * 0.3, M.x0 + (M.x1 - M.x0) * 0.7] : [mx + rng.range(-1, 1)];
      for (const x of xs) gableDormer(x, zFront, yBase, slope, kindD === 2);
    }
  }
  if (frontSlope && !dormers && roofKind !== 'gambrel' && rng.chance(0.2)) solar(eave, rise);
  // chimney: on the ridge near one end, or at a gable end
  {
    const ch = col(rng.pick(['#9a5a45', '#8a4f3e', '#a0a0a0', '#b5a48e']));
    const away = drive === RIGHT ? -1 : 1;
    if (roofKind === 'gableZ') {
      chimney(g, away > 0 ? M.x1 - 0.9 : M.x0 + 0.9, M.z0 + 1.2, eave + rise * 0.3, yr + 0.6, 0.62, 0.62, ch);
    } else if (ridgeAlongX) {
      const xR = away > 0 ? M.x1 - rng.range(0.9, 1.6) : M.x0 + rng.range(0.9, 1.6);
      chimney(g, xR, (M.z0 + M.z1) / 2 - (rng.chance(0.5) ? 0.9 : -0.3), eave + rise * 0.4, yr + 0.7, 0.62, 0.62, ch);
    } else {
      chimney(g, (M.x0 + M.x1) / 2 + rng.range(-1, 1), M.z0 + 1.0, eave + rise * 0.35, yr + 0.5, 0.62, 0.62, ch);
    }
  }

  // gutters' downpipes at the front corners of the main body, an AC unit at the back, a climber on some houses
  {
    const fr = sideGeom(M, ridgeAlongX ? FRONT : RIGHT);
    if (ridgeAlongX) {
      downpipe(g, fr, 0.14, eave - 0.12, undefined, INS);
      if (rng.chance(0.6)) downpipe(g, fr, fr.L - 0.14, eave - 0.12, undefined, INS);
    } else {
      downpipe(g, fr, 0.14, eave - 0.12, undefined, INS);
      const lf = sideGeom(M, LEFT);
      if (rng.chance(0.6)) downpipe(g, lf, lf.L - 0.14, eave - 0.12, undefined, INS);
    }
    if (floors === 2 && rng.chance(0.4)) {
      const bk = sideGeom(M, BACK);
      if (bk.L > 3) acUnit(g, bk, rng.range(1.0, bk.L - 1.0), gH + 0.4, 0);
    }
    if (rng.chance(0.18)) {
      const sd = sideGeom(M, rng.chance(0.5) ? LEFT : RIGHT);
      if (sd.L > 3) climber(g, sd, rng.range(1.2, sd.L - 1.2), rng.range(1.2, 2.6), rng.range(2.2, eave - 0.3), INS, rng.chance(0.6) ? GREEN.IVY_WALL : GREEN.JASMINE);
    }
  }

  // ──────────────────────────────────────────────────── helpers ──

  function porchLamp(x: number, z: number, y: number): void {
    lightBox(g, x - 0.08, y, z, x + 0.08, y + 0.28, z + 0.14, '#ffc979', LIGHT_MODE.STEADY, 3);
  }

  /** Turned-look porch post at (x, z) from the deck y0 to y1: plinth block + chamfer step, 15 cm shaft, a
   *  moulded cap (wide fillet over a neck). Inside ±0.12 m of (x, z). */
  function porchPost(x: number, z: number, y0: number, y1: number): void {
    t.box(x - 0.11, y0, z - 0.11, x + 0.11, y0 + 0.26, z + 0.11, 0b110111);
    t.box(x - 0.12, y0 + 0.26, z - 0.12, x + 0.12, y0 + 0.29, z + 0.12, 0b110111);
    t.box(x - 0.075, y0 + 0.29, z - 0.075, x + 0.075, y1 - 0.12, z + 0.075, 0b110011);
    t.box(x - 0.1, y1 - 0.12, z - 0.1, x + 0.1, y1 - 0.06, z + 0.1, 0b111111);
    t.box(x - 0.085, y1 - 0.06, z - 0.085, x + 0.085, y1, z + 0.085, 0b110011);
  }

  /** Porch balustrade along x at z: newel posts with caps, moulded handrail, bottom rail clear of the deck,
   *  square balusters at ~11 cm centres (real porch joinery instead of flat planks). */
  function porchRail(x0: number, x1: number, z: number, y: number, h: number, c: THREE.Color): void {
    if (x1 - x0 < 0.25) return;
    setCol(t, c);
    const nw = 0.045;
    for (const nx of [x0, x1]) {
      t.box(nx - nw, y, z - nw, nx + nw, y + h + 0.06, z + nw, 0b110111);
      t.box(nx - nw - 0.015, y + h + 0.06, z - nw - 0.015, nx + nw + 0.015, y + h + 0.1, z + nw + 0.015, 0b111111);
    }
    const a = x0 + nw,
      b = x1 - nw;
    // handrail: a wider cap over a narrower rail (a moulded profile in two boxes)
    t.box(a, y + h - 0.07, z - 0.025, b, y + h - 0.02, z + 0.025, 0b111111);
    t.box(a, y + h - 0.02, z - 0.042, b, y + h + 0.012, z + 0.042, 0b111111);
    // bottom rail 6 cm above the deck
    t.box(a, y + 0.06, z - 0.03, b, y + 0.11, z + 0.03, 0b111111);
    const n = Math.max(1, Math.round((b - a) / 0.11));
    for (let k = 0; k < n; k++) {
      const bx = a + ((b - a) * (k + 0.5)) / n;
      t.box(bx - 0.019, y + 0.11, z - 0.019, bx + 0.019, y + h - 0.07, z + 0.019, 0b110011);
    }
  }

  /** Porch deck x0..x1 × z0..z1, top at y: a dark joist frame under boards 14 cm wide with 6 mm gaps running
   *  out from the house, a nosing board along the front, per-board tone. */
  function porchDeck(x0: number, x1: number, z0: number, z1: number, y: number, c: THREE.Color): void {
    setCol(t, shade(c, 0.45));
    t.box(x0, 0, z0, x1, y - 0.012, z1, 0b110111 & ~8);
    const n = Math.max(2, Math.round((x1 - x0) / 0.146));
    const w = (x1 - x0) / n;
    for (let k = 0; k < n; k++) {
      const hk = Math.sin((k + 1) * 12.9898 + g.seed * 0.7311) * 43758.5453;
      setCol(t, shade(c, 0.86 + 0.22 * (hk - Math.floor(hk))));
      t.box(x0 + k * w + 0.003, y - 0.03, z0, x0 + (k + 1) * w - 0.003, y, z1 - 0.03, 0b110100);
    }
    setCol(t, shade(c, 0.9));
    t.box(x0, y - 0.05, z1 - 0.03, x1, y + 0.004, z1, 0b111111);
  }

  function porchBench(x: number, z: number): void {
    setCol(t, col(rng.pick(['#6b4c37', '#f6f3ec', '#2f5d50'])));
    t.box(x, 0.16, z, x + 1.1, 0.6, z + 0.45);
    t.box(x, 0.6, z - 0.07, x + 1.1, 1.05, z + 0.03);
  }

  /** Lean-to roof between x a..b from the wall line zW (height yW) out to zO (height yO), posts optional. */
  function leanTo(a: number, b: number, zW: number, zO: number, yW: number, yO: number, posts: boolean): void {
    roofLook(s, roofC, rPat, g.seed + 5);
    const sl = Math.hypot(zO - zW, yW - yO);
    roofPoly(s, [[a, yO, zO], [b, yO, zO], [b, yW, zW], [a, yW, zW]], [1, 0, 0], [0, (yW - yO) / sl, (zW - zO) / sl]);
    // ceiling (seen from below) + fascia
    setCol(t, shade(trimC, 0.92));
    t.quad(a, yO - 0.06, zW, b, yO - 0.06, zW, b, yO - 0.06, zO, a, yO - 0.06, zO);
    setCol(t, trimC);
    t.box(a, yO - 0.2, zO - 0.05, b, yO + 0.01, zO, 0b111111 & ~8);
    // side cheeks (triangular boards closing the lean-to)
    for (const x of [a, b]) {
      t.quadAway(x, yO - 0.2, zO, x, yO, zO, x, yW, zW, x, yO - 0.06, zW, x + (x === a ? 1 : -1), yO, (zW + zO) / 2);
    }
    if (posts) {
      for (const x of [a + 0.12, b - 0.12]) t.box(x - 0.08, 0, zO - 0.2, x + 0.08, yO - 0.18, zO - 0.04, 0b110111);
    }
  }

  /** Gable triangles of a gable roof over r (+ attic windows when tall enough). */
  function gableEnds(r: LRect, alongX: boolean, ye: number, yR: number, skip: number): void {
    // skip: a side to leave out (-1 = none)
    const sides: Side[] = alongX ? [RIGHT, LEFT] : [FRONT, BACK];
    for (const sd of sides) {
      if (sd === skip) continue;
      const sg = sideGeom(r, sd);
      const rr = yR - ye;
      const attic = makeGrid(sg.L / 2 - 0.55, sg.L / 2 + 0.55, ye + 0.35, Math.min(1.5, rr * 0.6), 1, { spacing: 1.1, cols: 1, winW: 0.7, winH: Math.min(0.95, rr * 0.45), sill: 0.05, margin: 0 });
      wallTri(s, sg, 0, sg.L, sg.L / 2, ye, yR, upPlain, rr > 2.2 ? attic : null, WIN.MUNTIN, PROF.HOME, frameIdx, GLASS.NEUTRAL);
    }
  }

  /** Half-hip (jerkinhead): gable walls up to a knee, small hips above. */
  function halfHipRoof(r: LRect, alongX: boolean, ye: number, yR: number, kneeFrac: number): void {
    // local frame: a along the ridge, b across (front = +b); map(a, y, b) → [x, y, z]
    const A0 = alongX ? r.x0 : -r.z1,
      A1 = alongX ? r.x1 : -r.z0;
    const B0 = alongX ? r.z0 : r.x0,
      B1 = alongX ? r.z1 : r.x1;
    const map = (a: number, y: number, b: number): number[] => (alongX ? [a, y, b] : [b, y, -a]);
    const bc = (B0 + B1) / 2;
    const hb = (B1 - B0) / 2;
    const p = (yR - ye) / hb;
    const ov = 0.35;
    const yk = ye + (yR - ye) * kneeFrac; // knee height
    const bk = hb - (yk - ye) / p; // distance from the centre line at the knee
    const c = (yR - yk) / p; // hip inset at the ridge ends (same pitch on the hips)
    const og2 = 0.15;
    const aL = A0 - og2,
      aR = A1 + og2;
    const yEv = ye - ov * p;
    roofLook(s, roofC, rPat, g.seed);
    const unit = (v: number[]) => {
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / l, v[1] / l, v[2] / l];
    };
    for (const side of [1, -1]) {
      // eave at b = bc ± (hb + ov), knee line, ridge line
      const bE = bc + side * (hb + ov),
        bK = bc + side * bk;
      const ridgeA0 = A0 + c,
        ridgeA1 = A1 - c;
      const e0 = map(side > 0 ? aL : aR, yEv, bE),
        e1 = map(side > 0 ? aR : aL, yEv, bE);
      const k1 = map(side > 0 ? aR : aL, yk, bK),
        r1 = map(side > 0 ? ridgeA1 : ridgeA0, yR, bc),
        r0 = map(side > 0 ? ridgeA0 : ridgeA1, yR, bc),
        k0 = map(side > 0 ? aL : aR, yk, bK);
      const ax = unit([e1[0] - e0[0], 0, e1[2] - e0[2]]);
      const up = unit([(bc - bE) * (alongX ? 0 : 1), yR - yEv, (bc - bE) * (alongX ? 1 : 0)]);
      const ay = alongX ? unit([0, yR - yEv, bc - bE]) : unit([bc - bE, yR - yEv, 0]);
      void up;
      roofPoly(s, [e0, e1, k1, k0], ax, ay);
      roofPoly(s, [k0, k1, r1, r0], ax, ay);
    }
    // the clipped hips at both ends
    for (const end of [0, 1]) {
      const aE = end === 0 ? aL : aR;
      const aRd = end === 0 ? A0 + c : A1 - c;
      const kF = map(aE, yk, bc + bk),
        kB = map(aE, yk, bc - bk),
        top = map(aRd, yR, bc);
      const ax = end === 0 ? unit([kF[0] - kB[0], 0, kF[2] - kB[2]]) : unit([kB[0] - kF[0], 0, kB[2] - kF[2]]);
      const mid = [(kF[0] + kB[0]) / 2, yk, (kF[2] + kB[2]) / 2];
      const ay = unit([top[0] - mid[0], top[1] - mid[1], top[2] - mid[2]]);
      if (end === 0) roofPoly(s, [kB, kF, top], ax, ay);
      else roofPoly(s, [kF, kB, top], ax, ay);
    }
    // gable walls up to the knee (pentagons: rectangle part is the wall below the eave, handled by
    // the side walls; here the trapezoid between eave and knee)
    const sides: Side[] = alongX ? [RIGHT, LEFT] : [FRONT, BACK];
    for (const sd of sides) {
      const sg = sideGeom(r, sd);
      const L = sg.L;
      const inset = (L / 2) - bk;
      setWallAttrs(s, null, upPlain);
      const a0x = sx(sg, 0, 0), a0z = sz(sg, 0, 0), a1x = sx(sg, L, 0), a1z = sz(sg, L, 0);
      const k0x = sx(sg, inset, 0), k0z = sz(sg, inset, 0), k1x = sx(sg, L - inset, 0), k1z = sz(sg, L - inset, 0);
      s.quad(a0x, ye, a0z, a1x, ye, a1z, k1x, yk, k1z, k0x, yk, k0z);
    }
    // soffits under both eave overhangs
    setCol(t, trimC);
    for (const side of [1, -1]) {
      const bW = side > 0 ? B1 : B0,
        bE = bc + side * (hb + ov);
      const q0 = map(aL, yEv, bW), q1 = map(aR, yEv, bW), q2 = map(aR, yEv, bE), q3 = map(aL, yEv, bE);
      t.quadAway(q0[0], q0[1], q0[2], q1[0], q1[1], q1[2], q2[0], q2[1], q2[2], q3[0], q3[1], q3[2], (q0[0] + q2[0]) / 2, yEv + 1, (q0[2] + q2[2]) / 2);
    }
    // trim: ridge cap, fascia along both eaves
    setCol(t, shade(roofC, 0.8));
    const rA = map(A0 + c, yR, bc),
      rB = map(A1 - c, yR, bc);
    t.beam(rA[0], rA[1] + 0.02, rA[2], rB[0], rB[1] + 0.02, rB[2], 0.22, 0.14);
    setCol(t, trimC);
    for (const side of [1, -1]) {
      const bE = bc + side * (hb + ov);
      const e0 = map(aL, yEv - 0.07, bE),
        e1 = map(aR, yEv - 0.07, bE);
      t.beam(e0[0], e0[1], e0[2], e1[0], e1[1], e1[2], 0.06, 0.18);
    }
  }

  /** Gambrel (barn) roof, ridge along x: steep lower slopes, shallow upper slopes. */
  function gambrelRoof(r: LRect, ye: number, yR: number): void {
    const zc = (r.z0 + r.z1) / 2;
    const hb = (r.z1 - r.z0) / 2;
    const kb = hb * 0.6; // knee distance from the centre line
    const yk = ye + (hb - kb) * GAMB_P; // steep lower slope (≈ 60°): a storey inside the roof
    const yTop = yk + kb * 0.45;
    void yR;
    const ov = 0.25;
    const x0 = r.x0 - 0.2,
      x1 = r.x1 + 0.2;
    roofLook(s, roofC, rPat, g.seed);
    const unit = (v: number[]) => {
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / l, v[1] / l, v[2] / l];
    };
    const yE = ye - ov * GAMB_P;
    // front
    roofPoly(s, [[x0, yE, r.z1 + ov], [x1, yE, r.z1 + ov], [x1, yk, zc + kb], [x0, yk, zc + kb]], [1, 0, 0], unit([0, yk - yE, zc + kb - r.z1 - ov]));
    roofPoly(s, [[x0, yk, zc + kb], [x1, yk, zc + kb], [x1, yTop, zc], [x0, yTop, zc]], [1, 0, 0], unit([0, yTop - yk, -kb]));
    // back
    roofPoly(s, [[x1, yE, r.z0 - ov], [x0, yE, r.z0 - ov], [x0, yk, zc - kb], [x1, yk, zc - kb]], [-1, 0, 0], unit([0, yk - yE, zc - kb - (r.z0 - ov)]));
    roofPoly(s, [[x1, yk, zc - kb], [x0, yk, zc - kb], [x0, yTop, zc], [x1, yTop, zc]], [-1, 0, 0], unit([0, yTop - yk, kb]));
    // gable walls (pentagon above the eave) with an attic window in the upper part
    for (const sd of [RIGHT, LEFT] as Side[]) {
      const sg = sideGeom(r, sd);
      const L = sg.L;
      const ki = L / 2 - kb;
      setWallAttrs(s, null, upPlain);
      const p = (u: number) => [sx(sg, u, 0), sz(sg, u, 0)];
      const [a0x, a0z] = p(0), [a1x, a1z] = p(L), [k0x, k0z] = p(ki), [k1x, k1z] = p(L - ki);
      s.quad(a0x, ye, a0z, a1x, ye, a1z, k1x, yk, k1z, k0x, yk, k0z);
      const attic = makeGrid(L / 2 - 0.6, L / 2 + 0.6, yk - 1.1, 1.0, 1, { spacing: 1.2, cols: 1, winW: 0.75, winH: 0.8, sill: 0.1, margin: 0 });
      // window band across the knee: a small wall quad with a grid, then the top triangle
      wallTri(s, sg, ki, L - ki, L / 2, yk, yTop, upPlain);
      setWallAttrs(s, attic, upLook());
      s.wall(sx(sg, L / 2 - 0.6, 0.005), sz(sg, L / 2 - 0.6, 0.005), sx(sg, L / 2 + 0.6, 0.005), sz(sg, L / 2 + 0.6, 0.005), yk - 1.1, yk - 0.1, L / 2 - 0.6, attic.u0, attic.cw, attic.v0, attic.ch);
    }
    setCol(t, shade(roofC, 0.8));
    t.box(x0, yTop - 0.05, zc - 0.12, x1, yTop + 0.1, zc + 0.12, 0b110111);
    setCol(t, trimC);
    t.box(x0, yk - 0.06, zc + kb - 0.05, x1, yk + 0.06, zc + kb + 0.05, 0b111111);
    t.box(x0, yk - 0.06, zc - kb - 0.05, x1, yk + 0.06, zc - kb + 0.05, 0b111111);
    t.box(x0, yE - 0.16, r.z1 + ov - 0.03, x1, yE + 0.02, r.z1 + ov + 0.03, 0b111111 & ~8);
    t.box(x0, yE - 0.16, r.z0 - ov - 0.03, x1, yE + 0.02, r.z0 - ov + 0.03, 0b111111 & ~8);
  }

  function gableDormer(cx: number, zFront: number, yBase: number, slope: number, hipped: boolean): void {
    const w = 1.6,
      wh = 1.35;
    const sgD: SideGeom = { x0: cx - w / 2, z0: zFront, tx: 1, tz: 0, nx: 0, nz: 1, L: w };
    const gr = makeGrid(0, w, yBase, wh, 1, { spacing: w, cols: 1, winW: 0.9, winH: 0.85, sill: 0.25, margin: 0.1 });
    wallGrid(s, sgD, 0, w, yBase - 0.3, yBase + wh, gr, upLook());
    const ridge = yBase + wh + 0.6;
    const depth = wh / slope + 0.6;
    const zb = zFront - depth;
    wallSeg(s, cx + w / 2, zFront, cx + w / 2, zb, yBase - 0.3, yBase + wh, null, upPlain);
    wallSeg(s, cx - w / 2, zb, cx - w / 2, zFront, yBase - 0.3, yBase + wh, null, upPlain);
    roofLook(s, roofC, rPat, g.seed + 3);
    const o = 0.12;
    const ey = yBase + wh - o * 0.8;
    const sl = Math.hypot(w / 2 + o, ridge - ey);
    if (hipped) {
      // hipped front: the ridge stops short of the front, a triangle closes the front
      const zr = zFront - 0.55;
      roofPoly(s, [[cx + w / 2 + o, ey, zFront + 0.15], [cx + w / 2 + o, ey, zb], [cx, ridge, zb], [cx, ridge, zr]], [0, 0, -1], [-(w / 2 + o) / sl, (ridge - ey) / sl, 0]);
      roofPoly(s, [[cx - w / 2 - o, ey, zb], [cx - w / 2 - o, ey, zFront + 0.15], [cx, ridge, zr], [cx, ridge, zb]], [0, 0, 1], [(w / 2 + o) / sl, (ridge - ey) / sl, 0]);
      const sf = Math.hypot(zFront + 0.15 - zr, ridge - ey);
      roofPoly(s, [[cx - w / 2 - o, ey, zFront + 0.15], [cx + w / 2 + o, ey, zFront + 0.15], [cx, ridge, zr]], [1, 0, 0], [0, (ridge - ey) / sf, (zr - zFront - 0.15) / sf]);
    } else {
      wallTri(s, sgD, 0, w, w / 2, yBase + wh, ridge, upPlain);
      roofPoly(s, [[cx + w / 2 + o, ey, zFront + 0.15], [cx + w / 2 + o, ey, zb], [cx, ridge, zb], [cx, ridge, zFront + 0.15]], [0, 0, -1], [-(w / 2 + o) / sl, (ridge - ey) / sl, 0]);
      roofPoly(s, [[cx - w / 2 - o, ey, zb], [cx - w / 2 - o, ey, zFront + 0.15], [cx, ridge, zFront + 0.15], [cx, ridge, zb]], [0, 0, 1], [(w / 2 + o) / sl, (ridge - ey) / sl, 0]);
    }
  }

  function shedDormer(cx: number, w: number, zFront: number, yBase: number, slope: number, zRidge: number): void {
    const wh = 1.3;
    const sgD: SideGeom = { x0: cx - w / 2, z0: zFront, tx: 1, tz: 0, nx: 0, nz: 1, L: w };
    const gr = makeGrid(0, w, yBase, wh, 1, { spacing: 1.5, cols: w > 2.6 ? 2 : 1, winW: 0.95, winH: 0.85, sill: 0.25, margin: 0.2 });
    const top = yBase + wh;
    wallGrid(s, sgD, 0, w, yBase - 0.3, top, gr, upLook());
    // its roof rises gently (k) back until it meets the main slope: eave + (M.z1 - z)·slope = top + (zFront - z)·k
    const k = 0.16;
    const zMeet = (top + k * zFront - eave - M.z1 * slope) / (k - slope);
    const zb = Math.max(zRidge + 0.2, zMeet - 0.35);
    const yb = top + (zFront - zb) * k;
    // side cheeks with sloped tops
    setWallAttrs(s, null, upPlain);
    s.quad(cx + w / 2, yBase - 0.3, zFront, cx + w / 2, yBase - 0.3, zb, cx + w / 2, yb, zb, cx + w / 2, top, zFront);
    s.quad(cx - w / 2, yBase - 0.3, zb, cx - w / 2, yBase - 0.3, zFront, cx - w / 2, top, zFront, cx - w / 2, yb, zb);
    roofLook(s, roofC, rPat, g.seed + 4);
    const sl = Math.hypot(zFront + 0.2 - zb, yb - top);
    const yf = top - 0.2 * k;
    roofPoly(s, [[cx - w / 2 - 0.12, yf, zFront + 0.2], [cx + w / 2 + 0.12, yf, zFront + 0.2], [cx + w / 2 + 0.12, yb, zb], [cx - w / 2 - 0.12, yb, zb]], [1, 0, 0], [0, (yb - yf) / sl, (zb - zFront - 0.2) / sl]);
    setCol(t, trimC);
    t.box(cx - w / 2 - 0.12, yf - 0.14, zFront + 0.15, cx + w / 2 + 0.12, yf + 0.02, zFront + 0.21, 0b111111 & ~8);
  }

  function bayWindow(xa: number, xb: number, zW: number, zO: number): void {
    // canted bay: front face (z = zO) narrower than the opening, two 45° faces back to the wall
    const depth = zO - zW;
    const inset = Math.min(depth * 0.6, (xb - xa) * 0.25);
    const fa = xa + inset,
      fb = xb - inset;
    const top = floors === 2 ? gH - 0.25 : eave - 0.35;
    const look = gLook();
    const face = (ax: number, az: number, bx: number, bz: number) => {
      const L = Math.hypot(bx - ax, bz - az);
      const gr = makeGrid(0, L, 0, top, 1, { spacing: L, cols: 1, winW: Math.max(0.45, L - 0.32), winH: Math.min(1.5, top - 1.15), sill: 0.75, margin: 0.12 });
      wallSeg(s, ax, az, bx, bz, 0, top, gr, look);
    };
    s.cornerMask = 0;
    face(xa, zW, fa, zO);
    face(fa, zO, fb, zO);
    face(fb, zO, xb, zW);
    s.cornerMask = 3;
    // flat lead roof + cornice
    roofLook(s, col('#5d646b'), ROOFPAT.SEAM, g.seed + 7);
    const yR = top + 0.18;
    roofPoly(s, [[xa, yR, zW], [fa, yR, zO], [fb, yR, zO], [xb, yR, zW]], [1, 0, 0], [0, 0, -1]);
    setCol(t, trimC);
    const ring = [[xa, zW], [fa, zO], [fb, zO], [xb, zW]];
    for (let i = 0; i < 3; i++) {
      const [ax, az] = ring[i],
        [bx, bz] = ring[i + 1];
      t.beam(ax, top + 0.06, az, bx, top + 0.06, bz, 0.16, 0.24);
    }
    // stone sill band at the base
    setCol(t, col('#b9b2a6'));
    for (let i = 0; i < 3; i++) {
      const [ax, az] = ring[i],
        [bx, bz] = ring[i + 1];
      t.beam(ax, 0.2, az, bx, 0.2, bz, 0.1, 0.4);
    }
  }

  function doorHood(x: number, zW: number): void {
    // small gabled canopy on brackets above the door (above 2.4 m)
    const y0 = 2.72,
      w = 1.7,
      d = 0.75;
    roofLook(s, roofC, rPat, g.seed + 8);
    const yR = y0 + 0.45;
    const sl = Math.hypot(w / 2, yR - y0);
    roofPoly(s, [[x + w / 2, y0, zW + d], [x + w / 2, y0, zW], [x, yR, zW], [x, yR, zW + d]], [0, 0, -1], [-(w / 2) / sl, (yR - y0) / sl, 0]);
    roofPoly(s, [[x - w / 2, y0, zW], [x - w / 2, y0, zW + d], [x, yR, zW + d], [x, yR, zW]], [0, 0, 1], [(w / 2) / sl, (yR - y0) / sl, 0]);
    setCol(t, trimC);
    t.triangle(x - w / 2, y0, zW + d, x + w / 2, y0, zW + d, x, yR, zW + d);
    t.quad(x - w / 2, y0 - 0.02, zW, x + w / 2, y0 - 0.02, zW, x + w / 2, y0 - 0.02, zW + d, x - w / 2, y0 - 0.02, zW + d);
    for (const bx of [x - w / 2 + 0.1, x + w / 2 - 0.1]) t.beam(bx, y0 - 0.28, zW + 0.03, bx, y0 - 0.03, zW + 0.4, 0.07, 0.07);
  }

  function garageDoor(sg: SideGeom, u: number, w: number, h: number): void {
    const gcol = col(rng.pick(['#f2efe8', '#d9d4c8', '#8a6a4f', '#7d8790', '#3f4a52']));
    setCol(t, gcol);
    const d = 0.1;
    sideBox(t, sg, u - w / 2, u + w / 2, -d, -d + 0.02, 0, h, false, true);
    setCol(t, shade(gcol, 0.82));
    for (let k = 1; k < 5; k++) sideBox(t, sg, u - w / 2 + 0.05, u + w / 2 - 0.05, -d + 0.02, -d + 0.04, (h * k) / 5 - 0.025, (h * k) / 5 + 0.025);
    setCol(t, shade(gc, 0.8));
    const ax = sx(sg, u - w / 2, 0), az = sz(sg, u - w / 2, 0), axi = sx(sg, u - w / 2, -d), azi = sz(sg, u - w / 2, -d);
    const bx = sx(sg, u + w / 2, 0), bz = sz(sg, u + w / 2, 0), bxi = sx(sg, u + w / 2, -d), bzi = sz(sg, u + w / 2, -d);
    t.quad(ax, 0, az, axi, 0, azi, axi, h, azi, ax, h, az);
    t.quad(bxi, 0, bzi, bx, 0, bz, bx, h, bz, bxi, h, bzi);
    t.quad(axi, h, azi, bxi, h, bzi, bx, h, bz, ax, h, az);
    setCol(t, trimC);
    sideBox(t, sg, u - w / 2 - 0.12, u + w / 2 + 0.12, 0, 0.08, h, h + 0.14, true);
    sideBox(t, sg, u - w / 2 - 0.12, u - w / 2, 0, 0.08, 0, h);
    sideBox(t, sg, u + w / 2, u + w / 2 + 0.12, 0, 0.08, 0, h);
    wallLamp(g, sg, u + w / 2 + 0.4, 2.42, 0);
  }

  function patioDoor(sg: SideGeom, u: number, w: number, h: number): void {
    setWallAttrs(s, { u0: u - w / 2, cw: w, n: 1, v0: 0, ch: h, m: 1, wx0: 0.05, wx1: w - 0.05, wy0: 0.06, wy1: h - 0.05 }, { color: trimC, pattern: WALLPAT.SMOOTH, frame: frameIdx, glass: GLASS.NEUTRAL, style: WIN.DOOR, profile: PROF.HOME, seed: g.seed + 2 });
    const ax = sx(sg, u - w / 2, -0.08), az = sz(sg, u - w / 2, -0.08), bx = sx(sg, u + w / 2, -0.08), bz = sz(sg, u + w / 2, -0.08);
    s.wall(ax, az, bx, bz, 0, h, u - w / 2, u - w / 2, w, 0, h);
    setCol(t, shade(gc, 0.85));
    sideBox(t, sg, u - w / 2, u + w / 2, -0.08, 0, h, h + 0.02, true);
    sideBox(t, sg, u - w / 2 - 0.04, u - w / 2, -0.08, 0.05, 0, h + 0.02);
    sideBox(t, sg, u + w / 2, u + w / 2 + 0.04, -0.08, 0.05, 0, h + 0.02);
    setCol(t, shade(gc, 0.8));
    t.quad(sx(sg, u - w / 2, 0), 0, sz(sg, u - w / 2, 0), ax, 0, az, ax, h, az, sx(sg, u - w / 2, 0), h, sz(sg, u - w / 2, 0));
    t.quad(bx, 0, bz, sx(sg, u + w / 2, 0), 0, sz(sg, u + w / 2, 0), sx(sg, u + w / 2, 0), h, sz(sg, u + w / 2, 0), bx, h, bz);
  }

  function shutterSet(sg: SideGeom, gr: Grid, ground: boolean): void {
    // shutters in different positions (never swung out over the garden path on the ground floor)
    for (let i = 0; i < gr.n; i++) {
      const u = gridU(gr, i);
      const ww = gr.wx1 - gr.wx0;
      const y0 = gridY0(gr, 0),
        y1 = gr.v0 + gr.wy1;
      let st = shutterState(g, sg.nz > 0.5 || sg.nx < -0.5);
      if (ground && st === 3) st = 0;
      shutterPair(g, sg, u, ww * 0.96, y0, y1, shutterC, st);
    }
  }

  function flowerBox(sg: SideGeom, u: number, ww: number, y0: number): void {
    windowBox(g, sg, u, ww, y0);
  }

  function solar(ye: number, rr: number): void {
    const hb = (M.z1 - M.z0) / 2;
    const slope = rr / hb;
    const z0 = M.z1 - 1.0,
      z1 = M.z1 - hb * 0.62;
    const y0 = ye + (M.z1 - z0) * slope + 0.09,
      y1 = ye + (M.z1 - z1) * slope + 0.09;
    const xm = (M.x0 + M.x1) / 2 + rng.range(-0.8, 0.8);
    const n = rng.int(2, 3);
    const pw2 = 1.05;
    const x0 = xm - (n * pw2) / 2,
      x1 = xm + (n * pw2) / 2;
    setCol(t, col('#26324a'));
    t.quad(x0, y0, z0, x1, y0, z0, x1, y1, z1, x0, y1, z1);
    setCol(t, col('#c9ced3'));
    for (let k = 0; k <= n; k++) {
      const x = x0 + pw2 * k;
      t.beam(x, y0 + 0.02, z0, x, y1 + 0.02, z1, 0.04, 0.03);
    }
    t.beam(x0, y0 + 0.02, z0, x1, y0 + 0.02, z0, 0.04, 0.03);
    t.beam(x0, y1 + 0.02, z1, x1, y1 + 0.02, z1, 0.04, 0.03);
  }
}

// wall height of the garage wing; pitch of the lower gambrel slopes
const garTop = 2.85;
const GAMB_P = 1.75;

function jitPick(rng: Gen['rng'], list: string[]): THREE.Color {
  const c = col(rng.pick(list));
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h + (rng.next() - 0.5) * 0.02, Math.min(1, Math.max(0, hsl.s + (rng.next() - 0.5) * 0.06)), Math.min(1, Math.max(0, hsl.l + (rng.next() - 0.5) * 0.05)));
  return c;
}


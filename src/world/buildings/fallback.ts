// Generic building: walls with a window grid on every exposed side, a door niche
// per plan door, flat roof with parapet. Used for any kind without a dedicated
// generator (and as a building block by others).

import { Gen, LRect, Side, FRONT, RIGHT, BACK, LEFT, sideGeom, makeGrid, wallGrid, wallPlain, doorNiche, bandWithOpenings, flatRoof, sideBox, setCol, col, shade } from './gen';
import { WIN, PROF, WALLPAT, ROOFPAT, FRAME, GLASS } from './materials';
import { partitionSide } from './oldtown';

const PREV: Side[] = [LEFT, FRONT, RIGHT, BACK];

export function genFallback(g: Gen): void {
  const { lot, W, D } = g;
  const INS = 0.2;
  const exposed = [0, 1, 2, 3].map((s) => g.cover[s].length === 0);
  const ins = exposed.map((e) => (e ? INS : 0));
  const body: LRect = { x0: -W / 2 + ins[LEFT], x1: W / 2 - ins[RIGHT], z0: -D / 2 + ins[BACK], z1: D / 2 - ins[FRONT] };
  const H = lot.height;
  const floors = Math.max(1, lot.floors);
  const gH = floors > 1 ? 3.8 : H - 0.6;
  const fH = floors > 1 ? (H - gH - 0.5) / (floors - 1) : 3;
  const look = { color: g.wallColor, pattern: WALLPAT.PLASTER, frame: FRAME.WHITE, glass: GLASS.NEUTRAL, style: WIN.PLAIN, profile: PROF.HOME, seed: g.seed };
  for (const s of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
    const sg = sideGeom(body, s);
    const parts = partitionSide(g, s, sg.L, ins[PREV[s]]);
    const doors = g.doors.filter((d) => d.side === s).map((d) => d.u - ins[PREV[s]]);
    for (const p of parts) {
      if (p.covered) {
        wallPlain(g.shell, sg, p.a, p.b, 0, H, look);
        continue;
      }
      const ops = doors.filter((u) => u > p.a + 0.8 && u < p.b - 0.8).map((u) => ({ u, w: 1.3, h: 2.4 }));
      bandWithOpenings(
        sg, p.a, p.b, ops,
        (a, b) => {
          const gr = makeGrid(a, b, 0, gH, 1, { spacing: 2.6, winW: 1.2, winH: Math.min(1.8, gH - 1.3), sill: 0.95, margin: 0.4 });
          wallGrid(g.shell, sg, a, b, 0, gH, gr, look);
        },
        (a, b, y0) => wallPlain(g.shell, sg, a, b, y0, gH, look),
      );
      for (const op of ops) doorNiche(g, sg, op.u, { w: op.w, h: op.h, depth: 0.3, wallColor: look.color, frameColor: col('#e8e2d6'), doorColor: col('#4a3a2c'), glass: false, transom: true, lamp: true, seed: g.seed, frameOut: Math.min(0.1, ins[s] - 0.02) });
      if (floors > 1) {
        const gr = makeGrid(p.a, p.b, gH, fH, floors - 1, { spacing: 2.6, winW: 1.2, winH: fH * 0.55, sill: 0.9, margin: 0.4 });
        wallGrid(g.shell, sg, p.a, p.b, gH, H, gr, look);
      }
    }
    // parapet
    wallPlain(g.shell, sg, 0, sg.L, H, H + 0.8, look);
    setCol(g.trim, shade(g.wallColor, 0.85));
    sideBox(g.trim, sg, 0, sg.L, 0, 0.12, H + 0.8, H + 0.92, true);
  }
  // doors on sides that had no exposed part long enough still count as built
  const builtSides = new Set<number>();
  void builtSides;
  flatRoof(g.shell, { x0: body.x0 + 0.2, x1: body.x1 - 0.2, z0: body.z0 + 0.2, z1: body.z1 - 0.2 }, H + 0.02, col('#8a8780'), ROOFPAT.FLAT, g.seed);
  setCol(g.trim, shade(g.wallColor, 0.9));
  for (const s of [FRONT, RIGHT, BACK, LEFT] as Side[]) {
    const sg = sideGeom({ x0: body.x0 + 0.2, x1: body.x1 - 0.2, z0: body.z0 + 0.2, z1: body.z1 - 0.2 }, s);
    const ax = sg.x0, az = sg.z0, bx = sg.x0 + sg.tx * sg.L, bz = sg.z0 + sg.tz * sg.L;
    g.trim.quad(bx, H, bz, ax, H, az, ax, H + 0.8, az, bx, H + 0.8, bz);
  }
}

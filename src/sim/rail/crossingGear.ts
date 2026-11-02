// Level-crossing gear: half-barriers (red/white booms on drive housings, with boom lamps)
// guarding each approach lane, warning-light posts with St Andrew's crosses and
// alternating red lamps, bells. Booms rotate on the GPU (aAnim, see staticMaterial.ts).

import { Geo } from './geo';
import { K, ANIM } from './staticMaterial';
import { shapeOn } from '../../core/sweepshape';

export interface CrossingGearBuild {
  /** lamp centres (for night glows): crossing id, phase (0/1), world position, facing yaw */
  lamps: { id: number; phase: number; x: number; y: number; z: number }[];
  /** boom lamp centres in the DOWN pose */
  boomLamps: { id: number; x: number; y: number; z: number; pivotX: number; pivotY: number; sign: number }[];
}

const COL = {
  housing: '#d3cebf',
  housingCap: '#3a3e40',
  plinth: '#a9a59c',
  red: '#cf2e2b',
  white: '#f3f0e8',
  weight: '#3c4043',
  pole: '#f1eee6',
  poleBand: '#222426',
  board: '#1d1f20',
  hood: '#151617',
  lampOff: '#5a1210',
};

export function buildCrossingGear(g: Geo, id: number, xc: number, zr: number): CrossingGearBuild {
  const lamps: CrossingGearBuild['lamps'] = [];
  const boomLamps: CrossingGearBuild['boomLamps'] = [];
  const animCode = id === 0 ? ANIM.BOOM0 : ANIM.BOOM1;
  const boomKind = id === 0 ? K.BOOM0 : K.BOOM1;

  // ── half barriers: north unit (southbound lane, west half) and south unit (northbound lane, east half)
  const units = [
    { px: xc - 4.35, pz: zr - 4.05, sign: 1, toTrack: 1 },
    { px: xc + 4.35, pz: zr + 4.05, sign: -1, toTrack: -1 },
  ];
  for (const u of units) {
    const py = 1.02;
    const bz = u.pz + u.toTrack * 0.27;
    // plinth + drive housing
    g.anim(0).kind(K.CONCRETE).color(COL.plinth);
    g.block(u.px, -0.04, u.pz, 0.62, 0.16, 0.62);
    g.kind(K.PLAIN).color(COL.housing);
    g.block(u.px, 0.12, u.pz, 0.44, 1.02, 0.44);
    g.color(COL.housingCap);
    g.block(u.px, 1.14, u.pz, 0.5, 0.07, 0.5);
    const shaped = shapeOn('shapecrossing');
    if (shaped) {
      // a door in the housing with its hinges, lock and louvres; a domed lid; bolts through the base flange
      const f = -u.toTrack * 0.222;
      g.color('#bdb8aa');
      g.box(u.px, 0.58, u.pz + f, 0.34, 0.8, 0.006, 0);
      g.color('#8f8b7f');
      for (const dy of [0.9, 0.84, 0.78]) g.box(u.px, dy, u.pz + f * 1.02, 0.22, 0.014, 0.008, 0);
      g.color('#3a3e40');
      g.box(u.px + 0.12, 0.54, u.pz + f * 1.03, 0.03, 0.09, 0.012, 0);
      for (const y of [0.3, 0.86]) g.cyl(u.px - 0.175, y, u.pz + f * 1.03, 0.009, 0.009, 0.05, 6, 1);
      g.color(COL.housingCap);
      g.sphere(u.px, 1.21, u.pz, 0.32, 10, 3, 0.1);
      g.color('#7c7f80');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.cyl(u.px + sx * 0.27, 0.12, u.pz + sz * 0.27, 0.014, 0.014, 0.018, 6, 1);
    }
    // hub
    g.push().at(u.px, py, bz - u.toTrack * 0.06).rotX(Math.PI / 2);
    g.cyl(0, -0.08, 0, 0.12, 0.12, 0.16, 10, 3);
    g.pop();
    // boom (built DOWN: horizontal, extending along sign·x), stripes 0.5 m
    g.anim(u.sign * animCode, u.px, py, bz);
    const len = 4.55;
    const nSeg = 9;
    for (let k = 0; k < nSeg; k++) {
      const a = 0.12 + ((len - 0.12) * k) / nSeg,
        b = 0.12 + ((len - 0.12) * (k + 1)) / nSeg;
      g.kind(K.PLAIN).color(k % 2 === 0 ? COL.red : COL.white);
      const cx = u.px + u.sign * (a + b) / 2;
      const taper = 1 - 0.3 * (k / nSeg);
      if (shaped) {
        // an aluminium section with soft corners (extruded along x), not a square bar
        const hh = 0.055 * taper,
          hw = 0.035,
          c = 0.014;
        g.push().at(cx, py, bz, Math.PI / 2);
        g.prism(
          [
            [-hw, -hh + c],
            [-hw + c, -hh],
            [hw - c, -hh],
            [hw, -hh + c],
            [hw, hh - c],
            [hw - c, hh],
            [-hw + c, hh],
            [-hw, hh - c],
          ],
          -(b - a) / 2,
          (b - a) / 2,
          0,
        );
        g.pop();
      } else g.box(cx, py, bz, b - a, 0.11 * taper, 0.07, k === nSeg - 1 ? 0 : 1 | 2);
    }
    if (shaped) {
      // a rubber cap on the end, a rubber strip along the underside, a clamp at the hub
      const tx = u.px + u.sign * (len + 0.03);
      g.kind(K.PLAIN).color('#1b1c1d');
      g.box(tx, py, bz, 0.07, 0.085, 0.078, 0);
      g.box(u.px + u.sign * (0.12 + (len - 0.12) / 2), py - 0.05, bz, len - 0.12, 0.018, 0.04, 0);
      g.color('#55595b');
      g.box(u.px + u.sign * 0.2, py, bz, 0.2, 0.135, 0.095, 0);
      g.color('#7c7f80');
      for (const dx of [0.14, 0.26]) for (const s of [-1, 1]) g.box(u.px + u.sign * dx, py + s * 0.04, bz + 0.05, 0.016, 0.016, 0.006, 0);
    }
    // counterweight behind the pivot
    g.kind(K.PLAIN).color(COL.weight);
    if (shaped) {
      // cast plates threaded on the arm's tail, with the tie bolt showing
      g.box(u.px - u.sign * 0.34, py, bz, 0.34, 0.07, 0.05, 0);
      for (let i = 0; i < 4; i++) {
        const w = 0.16 + (i === 0 || i === 3 ? -0.015 : 0);
        g.box(u.px - u.sign * (0.28 + i * 0.1), py, bz, 0.088, 0.26 - (i === 3 ? 0.02 : 0), w, 0);
      }
      g.color('#7c7f80');
      for (const s of [-1, 1]) g.box(u.px - u.sign * 0.43, py + s * 0.085, bz + 0.082, 0.38, 0.012, 0.006, 0);
    } else g.box(u.px - u.sign * 0.45, py, bz, 0.5, 0.24, 0.16, 0);
    // boom lamps (three, on top)
    for (const d of [1.45, 2.85, 4.25]) {
      const lx = u.px + u.sign * d;
      g.kind(K.PLAIN).color(COL.hood);
      if (shaped) {
        // a round lamp on a stalk, red lens both ways
        g.box(lx, py + 0.058, bz, 0.03, 0.02, 0.03, 0);
        g.push().at(lx, py + 0.11, bz).rotX(Math.PI / 2);
        g.cyl(0, -0.03, 0, 0.056, 0.056, 0.06, 12, 1);
        g.kind(boomKind).color(COL.lampOff);
        g.cyl(0, -0.036, 0, 0.044, 0.044, 0.072, 12, 1);
        g.pop();
      } else {
        g.box(lx, py + 0.085, bz, 0.09, 0.06, 0.09, 0);
        g.kind(boomKind).color(COL.lampOff);
        g.box(lx, py + 0.085, bz + u.toTrack * 0.0, 0.1, 0.045, 0.1, 0);
      }
      boomLamps.push({ id, x: lx, y: py + 0.09, z: bz, pivotX: u.px, pivotY: py, sign: u.sign });
    }
    g.anim(0);
  }

  // ── warning-light posts with St Andrew's crosses, facing the approaching traffic
  const posts = [
    { x: xc - 4.65, z: zr - 5.05, yaw: Math.PI },
    { x: xc + 4.65, z: zr + 5.05, yaw: 0 },
  ];
  for (const p of posts) {
    g.push().at(p.x, 0, p.z, p.yaw);
    g.kind(K.CONCRETE).color(COL.plinth);
    g.block(0, -0.04, 0, 0.5, 0.14, 0.5);
    g.kind(K.PLAIN).color(COL.pole);
    g.cyl(0, 0.1, 0, 0.065, 0.06, 3.35, 8, 1);
    g.color(COL.poleBand);
    for (const y of [0.35, 0.95]) g.cyl(0, y, 0, 0.068, 0.068, 0.3, 8, 0);
    // bell on top
    g.color('#2c2e30');
    g.sphere(0, 3.55, 0.0, 0.13, 8, 4, 0.75);
    // St Andrew's cross: red-bordered white boards at ±45°
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      g.push().at(0, 3.0, 0.1).rotZ(a);
      g.color(COL.red);
      g.box(0, 0, 0, 1.3, 0.24, 0.03, 0);
      g.color(COL.white);
      g.box(0, 0, 0.018, 1.2, 0.15, 0.008, 0);
      g.pop();
    }
    // light unit: black backboard, two hooded red lamps
    g.color(COL.board);
    g.box(0, 2.12, 0.09, 1.0, 0.44, 0.05, 0);
    g.box(0, 2.12, 0.0, 0.16, 0.16, 0.14, 0);
    for (const [lx, phase] of [
      [-0.28, 0],
      [0.28, 1],
    ] as [number, number][]) {
      g.kind(K.PLAIN).color(COL.hood);
      // hood (half tube over the lamp)
      g.box(lx, 2.12 + 0.15, 0.22, 0.3, 0.025, 0.2, 0);
      g.box(lx - 0.15, 2.12 + 0.03, 0.22, 0.02, 0.22, 0.2, 0);
      g.box(lx + 0.15, 2.12 + 0.03, 0.22, 0.02, 0.22, 0.2, 0);
      g.kind(id === 0 ? (phase === 0 ? K.XL0A : K.XL0B) : phase === 0 ? K.XL1A : K.XL1B).color(COL.lampOff);
      g.push().at(lx, 2.12, 0.12).rotX(Math.PI / 2);
      g.cyl(0, 0, 0, 0.12, 0.12, 0.02, 12, 1);
      g.pop();
      // world position of the lamp face centre
      const c = { x: 0, y: 0, z: 0 };
      const m = g.frame.elements;
      const lx3 = lx,
        ly3 = 2.12,
        lz3 = 0.16;
      c.x = m[0] * lx3 + m[4] * ly3 + m[8] * lz3 + m[12];
      c.y = m[1] * lx3 + m[5] * ly3 + m[9] * lz3 + m[13];
      c.z = m[2] * lx3 + m[6] * ly3 + m[10] * lz3 + m[14];
      lamps.push({ id, phase, ...c });
    }
    g.pop();
  }
  return { lamps, boomLamps };
}

// Park & plaza features: the founder's statue, the downtown sculpture, the gazebo, the
// bandstand (a band plays in the evening), the Park Café kiosk with tables and parasols,
// the playground (swings, see-saw and roundabout move; kids play by day) and picnic tables.
// Every solid part stays inside the feature radius / rect (pedestrian paths run right next
// to them).

import * as THREE from 'three';
import type { Feature } from '../../core/plan';
import { ANIM, FLOOD, LM, LMODE, M, PAT } from './builder';
import { V3 } from './kit';
import { C, finial, person, railing } from './parts';
import type { Env } from './env';
import { drawText, signQuad } from './signs';
import { queueContactLocal } from '../props/contact';

const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/** lathe with flat facets (seg sides; 4 → a square moulding). Profile radii are face distances (apothems). */
function facetLathe(prof: [number, number][], seg: number, phi0: number): THREE.BufferGeometry {
  const k = 1 / Math.cos(Math.PI / seg);
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * k, y)), seg, phi0);
  const f = g.toNonIndexed();
  g.dispose();
  f.computeVertexNormals();
  return f;
}

// ───────────────────────────────────────────────────────────── statues ──

export function genStatue(env: Env, f: Feature): void {
  const style = String(f.params?.style ?? 'founder');
  env.begin(f.x, 0, f.z, f.yaw);
  const R = f.radius || 1.5;
  env.checkRadius(f.x, f.z, R, `statue ${style}`);
  const K = env.S;
  K.b.keepCore = true;
  const granite = M('#8f8b86', PAT.STONE, 0.75, 0, 0, FLOOD.SOFT, 0.1);
  const graniteD = M('#5d5b59', PAT.STONE, 0.6, 0.1, 0, FLOOD.SOFT, 0.3);
  if (style === 'abstract') {
    K.cyl(graniteD, R * 0.78, R * 0.8, 0.5, 0, 0, 0, 24);
    K.cyl(M('#2d2c2b', PAT.PLAIN, 0.2, 0.3), R * 0.8, R * 0.8, 0.08, 0, 0.5, 0, 24);
    const knot = new THREE.TorusKnotGeometry(0.72, 0.17, 80, 8, 2, 3);
    K.geo(M('#d8322a', PAT.PLAIN, 0.22, 0.15, 0, FLOOD.SOFT, 0.2), knot, 0, 1.62, 0, 0.4, 'box');
    knot.dispose();
    const plaque = env.atlas.add(256, 40, (g, w, h) => {
      g.fillStyle = '#2d2c2b';
      g.fillRect(0, 0, w, h);
      drawText(g, 'INFINITE HAVEN · 1999', w / 2, h / 2 + 1, '18px Georgia, serif', '#e6d3a3', 1);
    });
    signQuad(env.T, plaque, 0.9, 0.14, 0, 0.18, R * 0.79 + 0.01, 0, 0.3);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      env.glow(Math.sin(a) * (R + 0.3), 0.06, Math.cos(a) * (R + 0.3), { size: 1.4, kind: 'pool', color: '#ffd3a0', intensity: 0.28 });
    }
    env.glow(0, 1.6, 0, { size: 2.2, kind: 'halo', color: '#ff9a7a', intensity: 0.12 });
    env.endChecks();
    env.pick(f.id, 'Infinite Haven (sculpture)', new THREE.Box3(new THREE.Vector3(f.x - R, 0, f.z - R), new THREE.Vector3(f.x + R, 2.8, f.z + R)), () => ['Painted steel · 1999', 'Locals call it “the pretzel”', 'Lit from below at night']);
    return;
  }
  // ── founder: two chamfered octagonal granite steps; a moulded pedestal (plinth, cove, die with the
  // plaques, cornice with a drip, capping) — square lathes with flat facets
  // (facetLathe puts the octagon's corners at r / cos(π/8): keep them inside the feature radius)
  const Rs = (R - 0.02) * Math.cos(Math.PI / 8);
  const steps = facetLathe([[0, 0], [Rs, 0], [Rs, 0.19], [Rs - 0.03, 0.22], [Rs - 0.27, 0.22], [Rs - 0.27, 0.41], [Rs - 0.3, 0.44], [0, 0.44]], 8, Math.PI / 8);
  K.geo(granite, steps);
  steps.dispose();
  queueContactLocal(env, 0, 0, 0, Rs, Rs, Rs * 0.42, 0.25, 0.5, Math.PI / 8);
  const pw = 1.0;
  const die = M('#b8b1a7', PAT.STONE, 0.75, 0, 0, FLOOD.SOFT, 0.6);
  // bold mouldings (they must read at 3 m): base block, torus + cavetto stepping in to the die; cornice
  // with a cyma, a deep corona and a drip; capping block
  const ped = facetLathe([
    [0, 0.44], [0.7, 0.44], [0.7, 0.62], [0.66, 0.635], [0.665, 0.66], [0.655, 0.685], [0.62, 0.7], [0.58, 0.73], [0.555, 0.77], [0.53, 0.8], [0.5, 0.82],
    [0.5, 2.0], [0.52, 2.02], [0.55, 2.05], [0.6, 2.1], [0.655, 2.16], [0.7, 2.19], [0.7, 2.3], [0.665, 2.31], [0.62, 2.335], [0.62, 2.46], [0.58, 2.5], [0.46, 2.56], [0, 2.56],
  ], 4, Math.PI / 4);
  K.geo(die, ped);
  ped.dispose();
  // sunk panels on the two plain sides: a raised margin frame round a slightly darker field
  const recess = M('#a39d94', PAT.STONE, 0.8, 0, 0, FLOOD.SOFT, 0.7);
  for (const sx of [-1, 1]) {
    K.box(recess, 0.004, 0.9, 0.62, sx * 0.502, 0.98, 0);
    for (const dz of [-0.33, 0.33]) K.box(die, 0.03, 0.96, 0.04, sx * 0.51, 0.95, dz);
    for (const yy of [0.95, 1.89]) K.box(die, 0.03, 0.04, 0.7, sx * 0.51, yy, 0);
  }
  // name cut into the die above the plaque (incised Roman capitals)
  const cut = env.atlas.add(256, 48, (g, w, h) => {
    g.fillStyle = '#b8b1a7';
    g.fillRect(0, 0, w, h);
    drawText(g, 'EDMVND · HAVEN', w / 2, h / 2 + 2, '24px Georgia, serif', '#5a554d', 1);
  });
  for (const ry of [0, Math.PI]) signQuad(env.T, cut, 0.8, 0.15, Math.sin(ry) * (pw / 2 + 0.004), 1.72, Math.cos(ry) * (pw / 2 + 0.004), ry, 0.2);
  const plaque = env.atlas.add(192, 120, (g, w, h) => {
    g.fillStyle = '#6b5a35';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d9b862';
    g.lineWidth = 4;
    g.strokeRect(5, 5, w - 10, h - 10);
    drawText(g, 'EDMUND HAVEN', w / 2, 34, 'bold 20px Georgia, serif', '#f0d68a', 1);
    drawText(g, 'founder of', w / 2, 62, 'italic 16px Georgia, serif', '#f0d68a', 0);
    drawText(g, 'TINYHAVEN · 1801', w / 2, 88, 'bold 16px Georgia, serif', '#f0d68a', 1);
  });
  for (const ry of [0, Math.PI]) signQuad(env.T, plaque, 0.62, 0.39, Math.sin(ry) * (pw / 2 + 0.01), 1.2, Math.cos(ry) * (pw / 2 + 0.01), ry, 0.25);
  // bronze figure (heroic scale 1.25: ~2.3 m), striding forward, raising his tricorn: riding boots,
  // breeches, a frock coat with lapels, buttons, cuffs and split tails, waistcoat, cravat; a face (brow,
  // nose, chin, ears), tied-back hair; a scroll in the left hand. Verdigris over dark bronze: the rust
  // pattern's run-down streaks show the brown metal through the green.
  const bronze = M('#4a7462', PAT.PLAIN, 0.55, 0.5, 0, FLOOD.SOFT, 0.5);
  const bronzeD = M('#3a5c4e', PAT.RUST, 0.5, 0.55, 0, FLOOD.SOFT, 0.2);
  const y0 = 2.56, sc = 1.25;
  const P = (x: number, y: number, z: number): V3 => [x * sc, y0 + y * sc, z * sc];
  const ell = (m: typeof bronze, rx: number, ry: number, rz: number, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0) => {
    const g = new THREE.SphereGeometry(1, 10, 8);
    _e.set(pitch, yaw, roll, 'YXZ');
    _m.makeRotationFromEuler(_e).scale(_v.set(rx * sc, ry * sc, rz * sc));
    const [px, py, pz] = P(x, y, z);
    _m.setPosition(px, py, pz);
    K.geoM(m, g, _m, 'box');
    g.dispose();
  };
  const limb = (m: typeof bronze, a: V3, b: V3, ra: number, rb: number, seg = 10) => {
    const A = P(a[0], a[1], a[2]), B = P(b[0], b[1], b[2]);
    _v.set(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    const len = _v.length();
    const g = new THREE.CylinderGeometry(rb * sc, ra * sc, len, seg, 1, false);
    g.translate(0, len / 2, 0);
    _q.setFromUnitVectors(_up, _v.normalize());
    _m.makeRotationFromQuaternion(_q).setPosition(A[0], A[1], A[2]);
    K.geoM(m, g, _m, 'cyl');
    g.dispose();
  };
  // cast base slab, a little irregular
  K.cyl(bronzeD, 0.4 * sc, 0.42 * sc, 0.07, 0, y0 - 0.03, 0, 9);
  // boots (left foot forward), shafts to the knee with a turned-down top, breeches
  for (const [sx, fz, kz, heel] of [[-1, 0.2, 0.12, 0], [1, -0.2, -0.06, 0.35]] as const) {
    const x = sx * 0.1;
    ell(bronzeD, 0.052, 0.045, 0.125, x, 0.045 + heel * 0.06, fz + 0.03, 0, heel * 0.4);
    limb(bronzeD, [x, 0.07 + heel * 0.06, fz - 0.03 * (1 - heel)], [x, 0.44, kz], 0.06, 0.068);
    limb(bronze, [x, 0.42, kz], [x, 0.47, kz + 0.005], 0.078, 0.076);
    limb(bronze, [x, 0.46, kz], [x * 0.9, 0.94, 0.0], 0.07, 0.092);
  }
  // frock coat body: lathe from the skirt hem to the shoulders, squashed front-to-back
  const coat = new THREE.LatheGeometry(
    [[0.0, 0.56], [0.27, 0.56], [0.25, 0.7], [0.21, 0.88], [0.175, 1.0], [0.18, 1.12], [0.2, 1.28], [0.215, 1.4], [0.2, 1.46], [0.12, 1.5], [0.0, 1.51]].map(([r, y]) => new THREE.Vector2(r * sc, y * sc)),
    16,
  );
  _m.makeScale(1, 1, 0.68).setPosition(0, y0, 0);
  K.geoM(bronze, coat, _m, 'box');
  coat.dispose();
  // split tails behind, swinging back with the stride
  for (const sx of [-1, 1]) {
    const tail = new THREE.BoxGeometry(0.16 * sc, 0.5 * sc, 0.03 * sc);
    tail.translate(0, -0.25 * sc, 0);
    _e.set(-0.18, sx * 0.25, sx * 0.06, 'YXZ');
    _m.makeRotationFromEuler(_e);
    const [px, py, pz] = P(sx * 0.09, 1.0, -0.12);
    _m.setPosition(px, py, pz);
    K.geoM(bronzeD, tail, _m, 'box');
    tail.dispose();
  }
  // waistcoat panel in the open front, coat buttons, lapels, pocket flaps, belt line
  K.boxC(bronzeD, 0.17 * sc, 0.36 * sc, 0.02 * sc, 0, y0 + 1.1 * sc, 0.13 * sc);
  for (let i = 0; i < 5; i++) ell(bronzeD, 0.012, 0.012, 0.008, 0, 0.98 + i * 0.07, 0.14);
  for (const sx of [-1, 1]) {
    K.boxC(bronze, 0.07 * sc, 0.3 * sc, 0.02 * sc, sx * 0.1 * sc, y0 + 1.3 * sc, 0.132 * sc, -0.12, 0, sx * 0.3);
    K.boxC(bronze, 0.13 * sc, 0.04 * sc, 0.03 * sc, sx * 0.17 * sc, y0 + 0.86 * sc, 0.13 * sc, 0.1, sx * 0.35, 0);
  }
  // neck, cravat, collar
  limb(bronze, [0, 1.46, 0], [0, 1.58, 0.01], 0.055, 0.05);
  ell(bronzeD, 0.055, 0.045, 0.035, 0, 1.47, 0.07);
  K.torus(bronzeD, 0.075 * sc, 0.022 * sc, 0, y0 + 1.5 * sc, -0.01, 5, 14);
  // head: skull, jaw/chin, nose, brow, ears; hair swept back into a tied queue with a bow
  ell(bronze, 0.09, 0.115, 0.1, 0, 1.66, 0.01);
  ell(bronze, 0.065, 0.05, 0.06, 0, 1.585, 0.04);
  K.boxC(bronze, 0.022 * sc, 0.045 * sc, 0.03 * sc, 0, y0 + 1.655 * sc, 0.1 * sc, -0.25, 0, 0);
  K.boxC(bronze, 0.1 * sc, 0.012 * sc, 0.02 * sc, 0, y0 + 1.69 * sc, 0.09 * sc, 0.2, 0, 0);
  for (const sx of [-1, 1]) ell(bronze, 0.015, 0.03, 0.022, sx * 0.09, 1.655, 0.0);
  ell(bronzeD, 0.097, 0.1, 0.1, 0, 1.69, -0.015, 0, 0.15);
  limb(bronzeD, [0, 1.64, -0.08], [0, 1.5, -0.1], 0.025, 0.018, 6);
  for (const sx of [-1, 1]) ell(bronzeD, 0.035, 0.02, 0.012, sx * 0.03, 1.6, -0.095, sx * 0.5);
  // arms: left down holding a scroll, right raised with the hat; sleeves with turned-back cuffs, hands
  const shL: V3 = [-0.22, 1.42, 0.0], elL: V3 = [-0.27, 1.13, 0.04], wrL: V3 = [-0.22, 0.9, 0.17];
  const shR: V3 = [0.22, 1.42, 0.0], elR: V3 = [0.33, 1.62, 0.12], wrR: V3 = [0.37, 1.92, 0.24];
  for (const [sh2, el, wr] of [[shL, elL, wrL], [shR, elR, wrR]]) {
    ell(bronze, 0.075, 0.07, 0.07, sh2[0], sh2[1], sh2[2]);
    limb(bronze, sh2, el, 0.068, 0.058);
    limb(bronze, el, wr, 0.056, 0.05);
    const cx = el[0] + (wr[0] - el[0]) * 0.8, cy = el[1] + (wr[1] - el[1]) * 0.8, cz = el[2] + (wr[2] - el[2]) * 0.8;
    limb(bronzeD, [cx, cy, cz], wr, 0.066, 0.066);
  }
  ell(bronze, 0.03, 0.05, 0.042, wrL[0], wrL[1] - 0.05, wrL[2] + 0.02, 0, 0.6);
  ell(bronze, 0.03, 0.05, 0.042, wrR[0], wrR[1] + 0.05, wrR[2] + 0.02, 0, -0.3);
  // scroll: a rolled cylinder with a sheet half unrolled
  limb(bronzeD, [-0.3, 0.85, 0.22], [-0.12, 0.83, 0.25], 0.025, 0.025, 8);
  K.boxC(bronze, 0.16 * sc, 0.2 * sc, 0.006 * sc, -0.21 * sc, y0 + 0.73 * sc, 0.26 * sc, 0.1, 0, 0);
  // tricorn: three-cornered brim turned up round a crown, held aloft and tilted
  const hat = P(0.39, 1.985, 0.28);
  K.cyl(bronzeD, 0.17 * sc, 0.2 * sc, 0.06 * sc, hat[0], hat[1], hat[2], 3, false, 'box', 0, Math.PI * 2, 0.4);
  K.cyl(bronzeD, 0.1 * sc, 0.115 * sc, 0.09 * sc, hat[0], hat[1] + 0.04 * sc, hat[2], 10);
  // night: uplights
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    env.glow(Math.sin(a) * (R + 0.4), 0.06, Math.cos(a) * (R + 0.4), { size: 1.3, kind: 'pool', color: '#ffd09a', intensity: 0.26 });
  }
  env.glow(0, 0.6, R + 0.2, { size: 0.5, kind: 'beam', color: '#ffe0b0', intensity: 0.2, dir: [0, 3.6, -1.0], endSize: 1.4 });
  env.endChecks();
  env.pick(f.id, 'Statue of Edmund Haven', new THREE.Box3(new THREE.Vector3(f.x - R, 0, f.z - R), new THREE.Vector3(f.x + R, y0 + 2.75, f.z + R)), () => ['Founder of Tinyhaven · bronze, 1901', 'Raised his hat to the first ship in port', 'Favourite perch of the park pigeons']);
}

// ───────────────────────────────────────────────────────────── gazebo ──

export function genGazebo(env: Env, f: Feature): void {
  const R = Math.min(Number(f.params?.radius ?? 3.5), (f.radius || 3.6) - 0.05);
  env.begin(f.x, 0, f.z, f.yaw);
  env.checkRadius(f.x, f.z, f.radius || R + 0.1, 'gazebo');
  queueContactLocal(env, 0, 0, 0, R * 0.95, R * 0.95, R * 0.55, 0.3, 0.45);
  const K = env.S;
  const white = M('#f4f1ea', PAT.PLAIN, 0.6, 0, 0, FLOOD.SOFT);
  const stone = M('#c9c1b2', PAT.STONE, 0.85, 0, 0, FLOOD.SOFT, 0.4);
  const floor = M('#b48a5e', PAT.PLANKS, 0.8, 0, 0, 0, 0.6);
  const roof = M('#4f7f63', PAT.SLATE, 0.6, 0, 0, 0, 0.4);
  const rot = Math.PI / 8; // a face (not a column) towards +Z for the entrance
  const pr = R - 0.32;
  K.cyl(stone, pr, pr + 0.04, 0.42, 0, 0, 0, 8, false, 'box', rot);
  // plank floor: a dark sub-floor showing through 8 mm gaps between 15 cm boards (running across the
  // entrance), each board its own tone; a worn strip from the steps to the centre where feet go
  K.cyl(M('#3b2c20', PAT.PLAIN, 0.9), pr - 0.05, pr - 0.05, 0.05, 0, 0.42, 0, 8, false, 'box', rot);
  const tones = ['#a97f55', '#b48a5e', '#9c744d', '#b99266'].map((c) => M(c, PAT.PLANKS, 0.82, 0, 0, 0, 0.6));
  const worn = M('#bb9670', PAT.PLANKS, 0.78, 0, 0, 0, 0.3);
  const fa = (pr - 0.06) * Math.cos(Math.PI / 8); // apothem: flat faces towards ±X / ±Z
  const halfW = (z: number) => Math.min(fa, fa * Math.SQRT2 - Math.abs(z));
  const bw = 0.155, gap = 0.008;
  for (let z = -fa + bw / 2, i = 0; z < fa - bw / 2 + 1e-3; z += bw + gap, i++) {
    const w = Math.min(halfW(z - bw / 2), halfW(z + bw / 2)) - 0.005;
    if (w <= 0.05) continue;
    const tm = tones[(i * 7 + (i >> 2)) % 4];
    const yb = 0.47 + 0.004 * Math.sin(i * 2.3);
    if (z > -0.6) {
      // the walking line is worn pale over the middle 1.1 m
      const wm = 0.55 + 0.08 * Math.sin(i * 1.7);
      if (w > wm + 0.05) for (const sx of [-1, 1]) K.box(tm, w - wm, 0.025, bw, sx * (w + wm) / 2, yb, z);
      K.box(worn, 2 * Math.min(wm, w), 0.025, bw, 0, yb - 0.002, z);
    } else K.box(tm, 2 * w, 0.025, bw, 0, yb, z);
  }
  // steps on the entrance side
  K.steps(stone, 1.5, 2, 0.21, 0.28, 0, 0, R - 0.02);
  const colR = pr - 0.28;
  const colH = 2.55;
  const corners: V3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = rot + (i / 8) * Math.PI * 2;
    corners.push([Math.sin(a) * colR, 0.48, Math.cos(a) * colR]);
  }
  // turned columns: square plinth block, base mouldings, a slightly tapered shaft, necking, capital, abacus
  K.cyl(white, pr - 0.02, pr - 0.02, 0.05, 0, 0.42, 0, 8, true, 'box', rot);
  for (const c of corners) {
    K.box(white, 0.22, 0.12, 0.22, c[0], 0.48, c[2]);
    K.lathe(white, [[0.1, 0], [0.1, 0.035], [0.088, 0.06], [0.092, 0.085], [0.08, 0.12], [0.072, colH - 0.42], [0.078, colH - 0.38], [0.072, colH - 0.35], [0.075, colH - 0.3], [0.1, colH - 0.2], [0.1, colH - 0.17], [0, colH - 0.17]], c[0], 0.6, c[2], 12);
    K.box(white, 0.22, 0.1, 0.22, c[0], 0.48 + colH - 0.1, c[2]);
  }
  for (let i = 0; i < 8; i++) {
    const a = corners[i],
      b = corners[(i + 1) % 8];
    const mid: V3 = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2];
    const facingEntrance = Math.abs(Math.atan2(mid[0], mid[2])) < 0.3;
    // decorative fretwork arch under the eave between columns
    K.beam(white, [a[0], 0.48 + colH - 0.05, a[2]], [b[0], 0.48 + colH - 0.05, b[2]], 0.12, 0.1);
    K.beam(white, [a[0] * 0.98, 0.48 + colH - 0.5, a[2] * 0.98], [mid[0] * 0.98, 0.48 + colH - 0.15, mid[2] * 0.98], 0.05, 0.05);
    K.beam(white, [b[0] * 0.98, 0.48 + colH - 0.5, b[2] * 0.98], [mid[0] * 0.98, 0.48 + colH - 0.15, mid[2] * 0.98], 0.05, 0.05);
    if (!facingEntrance) {
      // balustrade: bottom rail, square balusters, moulded hand rail
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const ux = (b[0] - a[0]) / len, uz = (b[2] - a[2]) / len;
      K.beam(white, [a[0] + ux * 0.1, 0.56, a[2] + uz * 0.1], [b[0] - ux * 0.1, 0.56, b[2] - uz * 0.1], 0.07, 0.06);
      K.beam(white, [a[0] + ux * 0.1, 1.3, a[2] + uz * 0.1], [b[0] - ux * 0.1, 1.3, b[2] - uz * 0.1], 0.1, 0.05);
      const nb = Math.max(3, Math.floor((len - 0.2) / 0.12));
      for (let k = 1; k < nb; k++) {
        const t = 0.1 + ((len - 0.2) * k) / nb;
        const px = a[0] + ux * t, pz = a[2] + uz * t;
        K.beam(white, [px, 0.59, pz], [px, 1.28, pz], 0.035, 0.035);
      }
      // built-in bench inside
      K.beam(M('#b48a5e', PAT.PLANKS, 0.8), [a[0] * 0.85, 0.92, a[2] * 0.85], [b[0] * 0.85, 0.92, b[2] * 0.85], 0.32, 0.06);
    }
  }
  // roof: eave ring, octagonal pyramid, cupola, finial
  const eaveY = 0.48 + colH;
  // eave: a fascia ring (open, so the boarded roof is seen from inside), boards + rafters under the roof
  K.cyl(white, R - 0.05, R - 0.05, 0.18, 0, eaveY, 0, 8, true, 'box', rot);
  K.cyl(white, colR + 0.12, colR + 0.12, 0.16, 0, eaveY - 0.02, 0, 8, true, 'box', rot);
  K.lathe(M('#e9e2d2', PAT.PLANKS, 0.8, 0, 0, FLOOD.SOFT, 0.2), [[0.3, eaveY + 1.5], [(R - 0.06) / Math.cos(Math.PI / 8), eaveY + 0.17]], 0, 0, 0, 8, rot);
  for (let i = 0; i < 16; i++) {
    const a = rot + (i / 16) * Math.PI * 2;
    const rr = i % 2 ? (R - 0.1) * Math.cos(Math.PI / 8) : R - 0.1;
    K.beam(white, [Math.sin(a) * rr, eaveY + 0.12, Math.cos(a) * rr], [Math.sin(a) * 0.32, eaveY + 1.42, Math.cos(a) * 0.32], 0.05, 0.09);
  }
  K.spire(roof, 8, R + 0.02, eaveY + 0.16, eaveY + 1.75, 0, 0, rot);
  K.cyl(white, 0.42, 0.42, 0.42, 0, eaveY + 1.28, 0, 8, false, 'box', rot);
  K.spire(roof, 8, 0.52, eaveY + 1.7, eaveY + 2.25, 0, 0, rot);
  finial(K, S_gold(), 0, eaveY + 2.22, 0, 0.5, 0.07);
  // lantern
  K.cyl(M('#2c3936', PAT.PLAIN, 0.5, 0.5), 0.01, 0.01, 0.6, 0, eaveY - 0.55, 0, 4);
  env.L.sphere(LM('#ffd9a0', LMODE.NIGHT, 3.0, 0, 0.1), 0.15, 0, eaveY - 0.7, 0, 8, 6);
  env.glow(0, eaveY - 0.7, 0, { size: 1.6, kind: 'halo', color: '#ffd28e', intensity: 0.8 });
  env.glow(0, 0.5, 0, { size: R + 0.6, kind: 'pool', color: '#ffc27a', intensity: 0.22 });
  env.endChecks();
  env.pick(f.id, 'Gazebo', new THREE.Box3(new THREE.Vector3(f.x - R, 0, f.z - R), new THREE.Vector3(f.x + R, eaveY + 2.5, f.z + R)), () => ['Victorian park gazebo · 1888', 'A shady seat by the café', 'Lantern lit at dusk']);
}

function S_gold() {
  return M(C.gold, PAT.PLAIN, 0.3, 0.85);
}

// ───────────────────────────────────────────────────────────── bandstand ──

export function genBandstand(env: Env, f: Feature): void {
  const R = Math.min(Number(f.params?.radius ?? 3), (f.radius || 3.2) - 0.05);
  env.begin(f.x, 0, f.z, f.yaw);
  env.checkRadius(f.x, f.z, f.radius || R + 0.2, 'bandstand');
  const K = env.S;
  const brick = M('#a65a3e', PAT.BRICK, 0.9, 0, 0, FLOOD.SOFT, 0.5);
  const iron = M('#2f5a46', PAT.PLAIN, 0.45, 0.5);
  const cream = M('#efe6cf', PAT.PLAIN, 0.6, 0, 0, FLOOD.SOFT);
  const rot = Math.PI / 8;
  const pr = R - 0.45; // stage radius (steps fit inside the feature radius)
  const stageH = 1.0;
  K.cyl(brick, pr, pr + 0.05, stageH, 0, 0, 0, 8, false, 'box', rot);
  K.cyl(cream, pr + 0.06, pr + 0.06, 0.1, 0, stageH - 0.1, 0, 8, false, 'box', rot);
  K.cyl(M('#a47c55', PAT.PLANKS, 0.8), pr - 0.02, pr - 0.02, 0.02, 0, stageH, 0, 8, false, 'box', rot);
  // dark vents in the base
  for (let i = 0; i < 8; i++) {
    const a = rot + ((i + 0.5) / 8) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.4) continue;
    K.panel(M('#2a2420', PAT.PLAIN, 0.9), 0.7, 0.45, Math.sin(a) * (pr * 0.93 + 0.012), 0.25, Math.cos(a) * (pr * 0.93 + 0.012), a);
  }
  K.steps(M('#b9b0a2', PAT.STONE, 0.85, 0, 0, FLOOD.SOFT, 0.3), 1.4, 4, stageH / 4, 0.12, 0, 0, R - 0.02);
  const colR = pr - 0.18;
  const colH = 2.6;
  const corners: V3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = rot + (i / 8) * Math.PI * 2;
    corners.push([Math.sin(a) * colR, stageH, Math.cos(a) * colR]);
  }
  for (const c of corners) {
    K.cyl(iron, 0.06, 0.08, colH, c[0], stageH, c[2], 8);
    K.cyl(iron, 0.13, 0.13, 0.1, c[0], stageH + colH - 0.1, c[2], 8);
  }
  for (let i = 0; i < 8; i++) {
    const a = corners[i],
      b = corners[(i + 1) % 8];
    const mx = (a[0] + b[0]) / 2,
      mz = (a[2] + b[2]) / 2;
    const front = Math.abs(Math.atan2(mx, mz)) < 0.3;
    // iron frieze beam + scroll brackets between column tops
    const yT = stageH + colH;
    K.beam(iron, [a[0], yT - 0.06, a[2]], [b[0], yT - 0.06, b[2]], 0.08, 0.06);
    K.beam(iron, [a[0], yT - 0.55, a[2]], [a[0] * 0.75 + mx * 0.25, yT - 0.08, a[2] * 0.75 + mz * 0.25], 0.035, 0.035);
    K.beam(iron, [b[0], yT - 0.55, b[2]], [b[0] * 0.75 + mx * 0.25, yT - 0.08, b[2] * 0.75 + mz * 0.25], 0.035, 0.035);
    if (!front) railing(env, [a[0], stageH, a[2]], [b[0], stageH, b[2]], 0.9, '#2f5a46');
  }
  // bell-shaped roof (lathe) with a cream fascia, finial and weathervane
  const ey = stageH + colH;
  K.cyl(cream, R - 0.05, R - 0.05, 0.25, 0, ey - 0.05, 0, 24);
  K.lathe(
    M('#3f7a5c', PAT.SEAM, 0.5, 0.2, 0, 0, 0.5),
    [
      [R + 0.05, ey + 0.2],
      [R - 0.3, ey + 0.55],
      [R * 0.62, ey + 0.95],
      [R * 0.36, ey + 1.5],
      [0.22, ey + 1.95],
      [0.0, ey + 2.05],
    ],
    0,
    0,
    0,
    24,
  );
  finial(K, S_gold(), 0, ey + 2.0, 0, 0.6, 0.08);
  K.box(S_gold(), 0.7, 0.18, 0.03, 0.15, ey + 2.75, 0);
  // fairy lights along the eave
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    env.L.sphere(LM(i % 3 === 0 ? '#ffd27a' : i % 3 === 1 ? '#ff9f6a' : '#fff1c9', LMODE.WARM, 3.2, i * 0.37, 0), 0.06, Math.sin(a) * (R - 0.02), ey + 0.05, Math.cos(a) * (R - 0.02), 5, 4);
  }
  env.glow(0, ey - 0.3, 0, { size: R + 1.0, kind: 'halo', color: '#ffc98a', intensity: 0.18 });
  env.glow(0, 0.05, 0, { size: R + 2.2, kind: 'pool', color: '#ffc27a', intensity: 0.2 });
  // the band (visible during concerts: uVis.y), seated in a semicircle facing the front
  env.anim({ mode: ANIM.VIS, pivot: new THREE.Vector3(0, stageH, 0), axis: new THREE.Vector3(0, 0, 1), a: 1, b: 0.04, c: 0 });
  const seats: [number, number, string][] = [
    [-1.1, -0.4, '#8b2232'],
    [-0.4, -0.9, '#8b2232'],
    [0.4, -0.9, '#8b2232'],
    [1.1, -0.4, '#8b2232'],
  ];
  for (const [sx, sz, col] of seats) {
    const ry = Math.atan2(-sx, 1.4 - sz) * 0.6;
    K.box(M('#5a3a26', PAT.PLAIN, 0.8), 0.4, 0.45, 0.4, sx, stageH, sz);
    env.anim({ mode: ANIM.VIS, pivot: new THREE.Vector3(sx, stageH + 0.45, sz), axis: new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry)), a: 1, b: 0.06, c: sx * 3 });
    person(env.K, sx, stageH + 0.0, sz, ry, col, '#1f2226', '#e8c3a0', '#1f2226', true);
  }
  // instruments
  env.anim({ mode: ANIM.VIS, pivot: new THREE.Vector3(0, stageH, 0), axis: new THREE.Vector3(1, 0, 0), a: 1, b: 0.0, c: 0 });
  env.K.torus(S_gold(), 0.26, 0.07, -1.0, stageH + 1.05, -0.15, 6, 14, Math.PI * 2, 0, 0.5, 0);
  env.K.cone(S_gold(), 0.25, 0.4, -0.85, stageH + 1.25, -0.2, 10);
  env.K.cyl(M('#f1ede4', PAT.PLAIN, 0.6), 0.32, 0.32, 0.4, 0.4, stageH + 0.45, -0.25, 14);
  env.K.cyl(M('#b02a2a', PAT.PLAIN, 0.6), 0.33, 0.33, 0.08, 0.4, stageH + 0.85, -0.25, 14);
  for (const sx of [-0.4, 1.1]) env.K.rod(S_gold(), [sx + 0.05, stageH + 1.3, -0.35], [sx + 0.05, stageH + 1.25, 0.15], 0.04, 6);
  // conductor at the front, facing the band
  env.anim({ mode: ANIM.VIS, pivot: new THREE.Vector3(0, stageH, 1.3), axis: new THREE.Vector3(1, 0, 0), a: 1, b: 0.05, c: 1.0 });
  person(env.K, 0, stageH, 1.3, Math.PI, '#1d1d22', '#1d1d22', '#e2b48c', undefined, false, 0.6);
  env.anim(null);
  env.endChecks();
  env.pick(f.id, 'Bandstand', new THREE.Box3(new THREE.Vector3(f.x - R, 0, f.z - R), new THREE.Vector3(f.x + R, ey + 2.8, f.z + R)), () => {
    const h = env.hours();
    const on = h >= 16 && h < 21;
    return ['Cast-iron bandstand · 1895', on ? 'The Tinyhaven Brass Band is playing' : 'Concerts daily 16:00–21:00', 'Fairy lights after dark'];
  });
}

// ───────────────────────────────────────────────────────────── park café ──

export function genKiosk(env: Env, f: Feature): void {
  const R = f.radius || 2.2;
  env.begin(f.x, 0, f.z, f.yaw);
  queueContactLocal(env, 0, 0, 0, 1.15, 1.15, 0.6, 0.3, 0.55);
  env.checkRadius(f.x, f.z, R, 'kiosk');
  const K = env.S;
  const cream = M('#f2e8cf', PAT.PLANKS, 0.8, 0, 0, FLOOD.SOFT, 0.7);
  const green = M('#2f6b4f', PAT.PLAIN, 0.6, 0.1);
  const kr = 1.05,
    kh = 2.45;
  // hexagonal kiosk with a serving hatch facing +Z
  K.cyl(M('#6d6a64', PAT.STONE, 0.85, 0, 0, 0, 0.2), kr + 0.08, kr + 0.1, 0.12, 0, 0, 0, 6, false, 'box', Math.PI / 6);
  K.cyl(cream, kr, kr, kh - 0.12, 0, 0.12, 0, 6, false, 'box', Math.PI / 6);
  K.cyl(green, kr + 0.03, kr + 0.03, 0.85, 0, 0.12, 0, 6, false, 'box', Math.PI / 6);
  const fz = kr * Math.cos(Math.PI / 6);
  // corner posts at the six angles, a dado rail over the green skirt, a frieze board under the eave
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    K.box(green, 0.07, kh - 0.14, 0.07, Math.sin(a) * (kr + 0.0), 0.12, Math.cos(a) * (kr + 0.0), a);
  }
  K.cyl(green, kr + 0.05, kr + 0.05, 0.05, 0, 0.95, 0, 6, false, 'box', Math.PI / 6);
  K.cyl(green, kr + 0.04, kr + 0.04, 0.16, 0, kh - 0.2, 0, 6, false, 'box', Math.PI / 6);
  // serving hatch: a recess with the lit interior, a frame, a top-hung shutter propped open, a counter on brackets
  K.panel(M('#f6efe0', PAT.WINDOW, 0.3, 0, 0.95, 0, 0.45), 0.9, 0.85, 0, 1.15, fz - 0.06, 0);
  for (const sx of [-1, 1]) K.box(cream, 0.02, 0.85, 0.08, sx * 0.46, 1.15, fz - 0.03);
  K.box(green, 1.06, 0.07, 0.06, 0, 2.0, fz + 0.01);
  for (const sx of [-1, 1]) K.box(green, 0.07, 0.92, 0.06, sx * 0.5, 1.08, fz + 0.01);
  K.boxC(green, 1.0, 0.04, 0.5, 0, 2.06, fz + 0.24, -1.1, 0, 0);
  for (const sx of [-1, 1]) K.beam(M('#3b3b3b', PAT.PLAIN, 0.4, 0.6), [sx * 0.42, 1.66, fz + 0.04], [sx * 0.42, 2.02, fz + 0.46], 0.015, 0.015);
  K.box(M('#b98d60', PAT.PLANKS, 0.7), 1.05, 0.05, 0.34, 0, 1.08, fz + 0.12);
  for (const sx of [-1, 1]) K.beam(green, [sx * 0.4, 0.82, fz + 0.02], [sx * 0.4, 1.07, fz + 0.26], 0.04, 0.04);
  // on the counter: a cake stand under a cloche, a napkin box, a tip jar
  K.cyl(M('#ffffff', PAT.PLAIN, 0.4), 0.11, 0.03, 0.08, -0.3, 1.13, fz + 0.14, 10);
  K.sphere(M('#dfe8ea', PAT.PLAIN, 0.1, 0.1), 0.1, -0.3, 1.21, fz + 0.14, 10, 6, 1, 0, Math.PI * 2, 0, Math.PI / 2);
  K.box(M('#c43b33', PAT.PLAIN, 0.6), 0.1, 0.08, 0.08, 0.25, 1.13, fz + 0.16);
  K.cyl(M('#cfe0e4', PAT.PLAIN, 0.1, 0.1), 0.045, 0.045, 0.1, 0.38, 1.13, fz + 0.2, 8);
  // striped awning over the hatch
  K.poly(M('#2f7d57', PAT.STRIPES, 0.8, 0, 0, 0, 0.2), [
    [-0.62, 2.12, fz + 0.62],
    [0.62, 2.12, fz + 0.62],
    [0.62, 2.42, fz],
    [-0.62, 2.42, fz],
  ]);
  K.box(M('#2f7d57', PAT.STRIPES, 0.8), 1.24, 0.14, 0.02, 0, 1.98, fz + 0.63);
  // roof: hexagonal pyramid + finial
  K.cyl(green, kr + 0.15, kr + 0.15, 0.12, 0, kh, 0, 6, false, 'box', Math.PI / 6);
  K.spire(M('#2f6b4f', PAT.SEAM, 0.5, 0.3, 0, 0, 0.3), 6, kr + 0.22, kh + 0.1, kh + 1.05, 0, 0, Math.PI / 6);
  finial(K, S_gold(), 0, kh + 1.02, 0, 0.35, 0.06);
  const name = String(f.params?.name ?? 'Park Café');
  const sign = env.atlas.add(256, 56, (g, w, h) => {
    g.fillStyle = '#2f6b4f';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e9d18a';
    g.lineWidth = 3;
    g.strokeRect(3, 3, w - 6, h - 6);
    drawText(g, name, w / 2, h / 2 + 2, 'italic bold 32px Georgia, serif', '#f6e7b5', 1);
  });
  signQuad(env.T, sign, 1.15, 0.25, 0, kh - 0.07, fz + 0.06, 0, 0.9);
  // menu A-board
  K.boxC(M('#3a3027', PAT.PLAIN, 0.8), 0.45, 0.7, 0.04, 0.85, 0.34, fz + 0.65, 0.2, 0.4, 0);
  // two bistro tables with chairs and parasols at the sides
  for (const s of [-1, 1]) {
    const tx = s * 1.42,
      tz = -0.15;
    K.cyl(M('#3b3b3b', PAT.PLAIN, 0.4, 0.6), 0.2, 0.22, 0.03, tx, 0, tz, 12);
    K.cyl(M('#3b3b3b', PAT.PLAIN, 0.4, 0.6), 0.025, 0.03, 0.72, tx, 0.03, tz, 8);
    K.cyl(M('#ece7dc', PAT.PLAIN, 0.4), 0.32, 0.32, 0.025, tx, 0.72, tz, 18);
    K.torus(M('#9aa0a4', PAT.PLAIN, 0.3, 0.7), 0.32, 0.012, tx, 0.732, tz, 4, 18);
    for (const [cx2, cz2] of [
      [0, 0.52],
      [0, -0.52],
    ]) {
      // bistro chair: round tube legs splayed out, a round slatted seat, a hooped back
      const cxx = tx + cx2, czz = tz + cz2, bs = Math.sign(cz2);
      const chair = M('#3e6f5a', PAT.PLAIN, 0.55, 0.35);
      for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.rod(chair, [cxx + lx * 0.15, 0, czz + lz * 0.15], [cxx + lx * 0.12, 0.44, czz + lz * 0.12], 0.012, 5);
      K.cyl(chair, 0.2, 0.2, 0.025, cxx, 0.44, czz, 12);
      K.torus(chair, 0.2, 0.012, cxx, 0.455, czz, 4, 14);
      K.torus(chair, 0.17, 0.012, cxx, 0.75, czz + bs * 0.17, 4, 10, Math.PI, 0.2 * bs, 0, 0);
      for (const lx of [-0.17, 0.17]) K.rod(chair, [cxx + lx, 0.46, czz + bs * 0.12], [cxx + lx, 0.76, czz + bs * 0.17], 0.011, 5);
    }
    // parasol (kinetic flutter not needed): pole + striped cone canopy above head height
    K.cyl(M('#ffffff', PAT.PLAIN, 0.5), 0.025, 0.025, 2.35, tx, 0.72, tz, 6);
    K.cone(M(s > 0 ? '#c8382f' : '#e9a23b', PAT.STRIPES, 0.8, 0, 0, 0, 0.1), 0.92, 0.4, tx, 2.28, tz, 8, 0.2, true);
    K.cone(M('#ffffff', PAT.PLAIN, 0.6), 0.06, 0.12, tx, 2.66, tz, 6);
    // a cup and a cake on each table
    K.cyl(M('#ffffff', PAT.PLAIN, 0.4), 0.04, 0.035, 0.07, tx + 0.1, 0.75, tz + 0.05, 8);
    K.cyl(M('#8a4b2c', PAT.PLAIN, 0.7), 0.06, 0.06, 0.05, tx - 0.12, 0.75, tz - 0.05, 8);
  }
  // night: warm lamp under the awning
  env.L.sphere(LM('#ffd9a0', LMODE.NIGHT, 2.6, 0, 0.1), 0.08, 0, 2.18, fz + 0.32, 6, 4);
  env.glow(0, 2.1, fz + 0.4, { size: 1.0, kind: 'halo', color: '#ffd28e', intensity: 0.7 });
  env.glow(0, 0.05, fz + 1.1, { size: 1.8, kind: 'pool', color: '#ffc27a', intensity: 0.3 });
  env.endChecks();
  env.pick(f.id, name, new THREE.Box3(new THREE.Vector3(f.x - R, 0, f.z - R), new THREE.Vector3(f.x + R, kh + 1.2, f.z + R)), () => {
    const h = env.hours();
    const open = h >= 8 && h < 20;
    return [open ? 'Open · coffee, ice cream & cake' : 'Closed · opens 8:00', 'Two tables in the shade of parasols', 'Next to the gazebo'];
  });
}

// ───────────────────────────────────────────────────────────── playground ──

export function genPlayground(env: Env, f: Feature): void {
  const rc = f.rect ?? { x0: f.x - 7, z0: f.z - 5, x1: f.x + 7, z1: f.z + 5 };
  const cx = (rc.x0 + rc.x1) / 2,
    cz = (rc.z0 + rc.z1) / 2;
  const alongX = rc.x1 - rc.x0 >= rc.z1 - rc.z0;
  env.begin(cx, 0, cz, alongX ? 0 : Math.PI / 2);
  env.checkRect(rc, 'playground', 0.05);
  const K = env.S;
  const W = (alongX ? rc.x1 - rc.x0 : rc.z1 - rc.z0) / 2;
  const D = (alongX ? rc.z1 - rc.z0 : rc.x1 - rc.x0) / 2;
  const wood = M('#a8774a', PAT.PLANKS, 0.8, 0, 0, 0, 0.4);
  const red = M('#d63c34', PAT.PLAIN, 0.5, 0.1);
  const blue = M('#2f78c4', PAT.PLAIN, 0.5, 0.1);
  const yellow = M('#f2c230', PAT.PLAIN, 0.5, 0.1);
  const steel = M('#c4ccd2', PAT.PLAIN, 0.4, 0.6);
  // timber edging around the sand
  const e = 0.12;
  K.box(wood, 2 * W - 0.1, 0.16, e, 0, 0, -D + 0.1);
  K.box(wood, 2 * W - 0.1, 0.16, e, 0, 0, D - 0.1);
  K.box(wood, e, 0.16, 2 * D - 0.1, -W + 0.1, 0, 0);
  K.box(wood, e, 0.16, 2 * D - 0.1, W - 0.1, 0, 0);
  const kid = (x: number, y: number, z: number, ry: number, shirt: string, seated: boolean) => person(env.K, x, y, z, ry, shirt, '#3a4a6b', '#e8c3a0', undefined, seated, 0, 0.62);

  // ── swing set (A-frames, top bar, 2 swings; a kid on one in daytime)
  const sx0 = -W + 1.3,
    sx1 = -W + 5.0,
    sz = -D + 2.4,
    top = 2.5;
  // rubber safety tiles under the swings
  const swings = [
    { x: sx0 + 1.0, amp: 0.42, ph: 0.0, kidOn: true },
    { x: sx1 - 1.0, amp: 0.18, ph: 2.1, kidOn: false },
  ];
  const swingXs = swings.map((w) => w.x);
  // red EPDM rubber-crumb tiles (two batches of colour), 4 cm thick with a bevelled edge kerb, laid over
  // the whole swing arc; worn pale and dished under each seat where feet drag
  const tileA = M('#7a4537', PAT.GRAVEL, 0.95, 0, 0, 0, 0.5);
  const tileB = M('#844b3b', PAT.GRAVEL, 0.95, 0, 0, 0, 0.8);
  const scuff = M('#9a6a55', PAT.GRAVEL, 0.97, 0, 0, 0, 0.3);
  const tx0 = sx0 + 0.1, nTx = 8, nTz = 7, tz0 = sz - 1.75;
  for (let i = 0; i < nTx; i++)
    for (let j = 0; j < nTz; j++) {
      const cx = tx0 + i * 0.5 + 0.25, cz = tz0 + j * 0.5 + 0.25;
      const underSeat = swingXs.some((x) => Math.abs(cx - x) < 0.3) && Math.abs(cz - sz) < 0.55;
      K.box(underSeat ? scuff : (i * 3 + j * 5) % 7 < 2 ? tileB : tileA, 0.492, underSeat ? 0.032 : 0.04, 0.492, cx, 0, cz);
    }
  const kerbM = M('#6e3f33', PAT.GRAVEL, 0.95);
  for (const zz of [tz0 - 0.06, tz0 + nTz * 0.5 + 0.06]) K.boxC(kerbM, nTx * 0.5 + 0.24, 0.03, 0.12, tx0 + nTx * 0.25, 0.012, zz, 0, 0, 0);
  for (const xx of [tx0 - 0.06, tx0 + nTx * 0.5 + 0.06]) K.boxC(kerbM, 0.12, 0.03, nTz * 0.5, xx, 0.012, tz0 + nTz * 0.25, 0, 0, 0);
  for (const x of [sx0, sx1]) {
    for (const dz of [-0.95, 0.95]) {
      K.rod(blue, [x, 0, sz + dz], [x, top, sz], 0.05, 10);
      K.cyl(M('#9a968c', PAT.CONCRETE, 0.9), 0.12, 0.13, 0.04, x, 0, sz + dz, 10);
    }
    // the A-frame head casting and a tie bar
    K.box(M('#2d5f99', PAT.PLAIN, 0.5, 0.3), 0.12, 0.2, 0.18, x, top - 0.12, sz);
    K.rod(blue, [x, 0.9, sz - 0.6], [x, 0.9, sz + 0.6], 0.025, 6);
  }
  K.rod(blue, [sx0 - 0.1, top, sz], [sx1 + 0.1, top, sz], 0.06, 12);
  for (const x of [sx0 - 0.1, sx1 + 0.1]) K.sphere(M('#2d5f99', PAT.PLAIN, 0.5, 0.3), 0.062, x, top, sz, 8, 6);
  for (const sw of swings) {
    env.anim({ mode: ANIM.SWING, pivot: new THREE.Vector3(sw.x, top, sz), axis: new THREE.Vector3(1, 0, 0), a: sw.amp, b: 2.2, c: sw.ph });
    // hanger clamps, chains of alternating links, a sagging rubber strap seat
    for (const dx of [-0.2, 0.2]) {
      env.K.cyl(steel, 0.075, 0.075, 0.09, sw.x + dx, top - 0.045, sz, 8);
      // welded oval links, each turned 90° to the last (rings read as a chain at 3 m)
      for (let y = top - 0.12, li = 0; y > 0.58; y -= 0.046, li++) env.K.torus(steel, 0.02, 0.0045, sw.x + dx, y, sz, 3, 8, Math.PI * 2, 0, li % 2 ? Math.PI / 2 : 0, 0);
      // shackle into the seat
      env.K.torus(steel, 0.018, 0.006, sw.x + dx, 0.55, sz, 4, 8, Math.PI * 2, 0, 0, 0);
    }
    const strap = M('#1d1d1d', PAT.PLAIN, 0.9);
    for (let i = 0; i < 6; i++) {
      const u0 = -0.24 + i * 0.08, u1 = u0 + 0.08;
      const y0s = 0.5 - 0.05 * Math.cos((u0 / 0.24) * Math.PI * 0.5), y1s = 0.5 - 0.05 * Math.cos((u1 / 0.24) * Math.PI * 0.5);
      env.K.beam(strap, [sw.x + u0, y0s, sz], [sw.x + u1, y1s, sz], 0.18, 0.025);
    }
    if (sw.kidOn) {
      env.anim({ mode: ANIM.VIS, pivot: new THREE.Vector3(sw.x, top, sz), axis: new THREE.Vector3(1, 0, 0), a: 3, b: sw.amp, c: sw.ph });
      kid(sw.x, 0.51 - 0.45 * 0.62, sz - 0.06, 0, '#e85d75', true);
    }
  }
  env.anim(null);

  // ── slide: ladder, platform with a little roof, chute
  const lx = W - 6.2,
    lz = -D + 2.2;
  const ph = 1.6;
  for (const dz of [-0.35, 0.35]) K.box(yellow, 0.07, ph + 1.2, 0.07, lx, 0, lz + dz);
  for (let y = 0.3; y < ph; y += 0.3) K.rod(steel, [lx, y, lz - 0.35], [lx, y, lz + 0.35], 0.018, 8);
  for (const dz of [-0.4, 0.4]) {
    K.rod(steel, [lx + 0.05, ph + 0.08, lz + dz], [lx + 0.05, ph + 0.75, lz + dz], 0.02, 6);
    K.rod(steel, [lx + 0.05, ph + 0.75, lz + dz], [lx + 0.95, ph + 0.75, lz + dz], 0.02, 6);
  }
  K.cyl(M('#9a968c', PAT.CONCRETE, 0.9), 0.1, 0.11, 0.04, lx, 0, lz - 0.35, 8);
  K.cyl(M('#9a968c', PAT.CONCRETE, 0.9), 0.1, 0.11, 0.04, lx, 0, lz + 0.35, 8);
  for (const [dx, dz] of [
    [1.0, -0.4],
    [1.0, 0.4],
  ])
    K.box(yellow, 0.07, ph + 1.2, 0.07, lx + dx, 0, lz + dz);
  K.box(wood, 1.1, 0.08, 0.9, lx + 0.5, ph, lz);
  K.pyramid(red, lx - 0.05, lx + 1.05, lz - 0.48, lz + 0.48, ph + 1.2, ph + 1.75, 0.08);
  // chute: a stainless trough down an S-curve (steep start, flattening run-out) with raised sides
  const cx0 = lx + 1.05, cx1 = W - 0.4;
  const chuteM = M('#d4d8db', PAT.PLAIN, 0.25, 0.7);
  const sideM = red;
  const yAt = (t: number) => 0.28 + (ph - 0.28) * (1 - (3 * t * t - 2 * t * t * t));
  const NS = 10;
  for (let k2 = 0; k2 < NS; k2++) {
    const t0 = k2 / NS, t1 = (k2 + 1) / NS;
    const xa = cx0 + (cx1 - cx0) * t0, xb = cx0 + (cx1 - cx0) * t1;
    const ya = yAt(t0) + 0.03, yb = yAt(t1) + 0.03;
    K.beam(chuteM, [xa, ya, lz], [xb, yb, lz], 0.52, 0.03);
    for (const dz of [-0.28, 0.28]) K.beam(sideM, [xa, ya + 0.08, lz + dz], [xb, yb + 0.08, lz + dz], 0.04, 0.18);
  }
  for (const dz of [-0.25, 0.25]) K.rod(yellow, [cx1 - 0.15, 0, lz + dz], [cx1 - 0.15, yAt(0.92), lz + dz], 0.03, 6);
  // rubber tiles at the run-out
  for (let j2 = 0; j2 < 2; j2++) for (let i2 = 0; i2 < 3; i2++) K.box((i2 + j2) % 2 ? tileB : tileA, 0.492, 0.04, 0.492, cx1 + 0.05 - i2 * 0.5, 0, lz - 0.25 + j2 * 0.5);
  env.anim({ mode: ANIM.VIS, pivot: new THREE.Vector3(lx + 0.5, ph, lz), axis: new THREE.Vector3(0, 1, 0), a: 3, b: 0.15, c: 1.3 });
  kid(lx + 0.5, ph + 0.08, lz, Math.PI / 2, '#3fa7d6', false);
  env.anim(null);

  // ── see-saw (swings about its pivot; two kids ride it by day)
  const ssx = -W + 3.2,
    ssz = D - 2.4;
  for (const s2 of [-1, 1]) {
    K.beam(yellow, [ssx - 0.2, 0, ssz + s2 * 0.2], [ssx, 0.5, ssz + s2 * 0.2], 0.06, 0.06);
    K.beam(yellow, [ssx + 0.2, 0, ssz + s2 * 0.2], [ssx, 0.5, ssz + s2 * 0.2], 0.06, 0.06);
  }
  K.rod(steel, [ssx, 0.5, ssz - 0.24], [ssx, 0.5, ssz + 0.24], 0.03, 8);
  K.box(M('#9a968c', PAT.CONCRETE, 0.9), 0.5, 0.04, 0.5, ssx, 0, ssz);
  for (const s2 of [-1, 1]) K.cyl(M('#1d1d1d', PAT.PLAIN, 0.9), 0.12, 0.13, 0.12, ssx + s2 * 1.45, 0, ssz, 10);
  env.anim({ mode: ANIM.SWING, pivot: new THREE.Vector3(ssx, 0.5, ssz), axis: new THREE.Vector3(0, 0, 1), a: 0.24, b: 2.2, c: 0.7 });
  env.K.box(red, 3.2, 0.07, 0.28, ssx, 0.47, ssz);
  for (const s of [-1, 1]) {
    env.K.rod(steel, [ssx + s * 1.25, 0.5, ssz - 0.13], [ssx + s * 1.25, 0.82, ssz - 0.13], 0.016, 6);
    env.K.rod(steel, [ssx + s * 1.25, 0.5, ssz + 0.13], [ssx + s * 1.25, 0.82, ssz + 0.13], 0.016, 6);
    env.K.rod(M('#1d1d1d', PAT.PLAIN, 0.8), [ssx + s * 1.25, 0.82, ssz - 0.17], [ssx + s * 1.25, 0.82, ssz + 0.17], 0.02, 6);
    env.K.box(blue, 0.3, 0.05, 0.3, ssx + s * 1.45, 0.54, ssz);
  }
  env.anim({ mode: ANIM.VIS, pivot: new THREE.Vector3(ssx, 0.5, ssz), axis: new THREE.Vector3(0, 0, 1), a: 3, b: 0.24, c: 0.7 });
  kid(ssx - 1.45, 0.59 - 0.45 * 0.62, ssz, Math.PI / 2, '#f4a261', true);
  kid(ssx + 1.45, 0.59 - 0.45 * 0.62, ssz, -Math.PI / 2, '#2a9d8f', true);
  env.anim(null);

  // ── roundabout (spins slowly)
  const rx = 1.2,
    rz = D - 2.5;
  K.cyl(steel, 0.12, 0.16, 0.25, rx, 0, rz, 10);
  env.anim({ mode: ANIM.SPIN, pivot: new THREE.Vector3(rx, 0, rz), axis: new THREE.Vector3(0, 1, 0), a: 0.9, b: 0, c: 0 });
  env.K.cyl(M('#e2564a', PAT.PLAIN, 0.6, 0.1), 1.15, 1.15, 0.08, rx, 0.25, rz, 24);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    env.K.cyl(M('#f2c230', PAT.PLAIN, 0.6, 0.1), 0.52, 0.52, 0.02, rx, 0.335, rz, 2, false, 'box', a, Math.PI / 3);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    env.K.rod(steel, [rx + Math.sin(a) * 1.0, 0.33, rz + Math.cos(a) * 1.0], [rx + Math.sin(a) * 0.3, 0.95, rz + Math.cos(a) * 0.3], 0.025, 4);
  }
  env.K.cyl(steel, 0.05, 0.05, 0.75, rx, 0.33, rz, 6);
  env.anim(null);

  // ── climbing frame (cubic jungle gym)
  const gx0 = 3.4,
    gz0 = D - 4.0;
  const n = 3,
    sp = 0.9;
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= 2; j++) {
      K.rod(i % 2 ? blue : yellow, [gx0 + i * sp, 0, gz0 + j * sp * 1.1], [gx0 + i * sp, 1.8, gz0 + j * sp * 1.1], 0.03, 5);
      K.cyl(M('#9a968c', PAT.CONCRETE, 0.9), 0.07, 0.08, 0.03, gx0 + i * sp, 0, gz0 + j * sp * 1.1, 8);
      for (const y of [0.6, 1.2, 1.8]) {
        K.sphere(M('#c9cfd3', PAT.PLAIN, 0.4, 0.6), 0.045, gx0 + i * sp, y, gz0 + j * sp * 1.1, 6, 4);
        if (i < n) K.rod(steel, [gx0 + i * sp, y, gz0 + j * sp * 1.1], [gx0 + (i + 1) * sp, y, gz0 + j * sp * 1.1], 0.022, 4);
        if (j < 2) K.rod(steel, [gx0 + i * sp, y, gz0 + j * sp * 1.1], [gx0 + i * sp, y, gz0 + (j + 1) * sp * 1.1], 0.022, 4);
      }
    }

  // ── spring riders (a duck and a horse rocking gently)
  for (const [x, z, col, ph2] of [
    [W - 1.4, D - 1.6, '#f2c230', 0.0],
    [W - 2.8, D - 1.4, '#d63c34', 1.7],
  ] as [number, number, string, number][]) {
    K.box(M('#9a968c', PAT.CONCRETE, 0.9), 0.4, 0.03, 0.4, x, 0, z);
    for (let t = 0; t < 7 * 8; t++) {
      const a0 = (t / 8) * Math.PI * 2, a1 = ((t + 1) / 8) * Math.PI * 2;
      K.rod(steel, [x + Math.cos(a0) * 0.09, 0.03 + (t / 56) * 0.36, z + Math.sin(a0) * 0.09], [x + Math.cos(a1) * 0.09, 0.03 + ((t + 1) / 56) * 0.36, z + Math.sin(a1) * 0.09], 0.014, 4);
    }
    env.anim({ mode: ANIM.SWING, pivot: new THREE.Vector3(x, 0.15, z), axis: new THREE.Vector3(1, 0, 0), a: 0.12, b: 2.6, c: ph2 });
    env.K.box(M('#55595c', PAT.PLAIN, 0.5, 0.5), 0.2, 0.02, 0.2, x, 0.39, z);
    const body = new THREE.SphereGeometry(0.16, 12, 8);
    _m.makeScale(0.9, 0.85, 2.0).setPosition(x, 0.56, z);
    env.K.geoM(M(col, PAT.PLAIN, 0.45, 0.05), body, _m);
    body.dispose();
    env.K.sphere(M(col, PAT.PLAIN, 0.45, 0.05), 0.12, x, 0.84, z + 0.27, 10, 8);
    env.K.sphere(M('#151515', PAT.PLAIN, 0.3), 0.02, x + 0.09, 0.88, z + 0.34, 6, 4);
    env.K.sphere(M('#151515', PAT.PLAIN, 0.3), 0.02, x - 0.09, 0.88, z + 0.34, 6, 4);
    env.K.cylX(M('#2b2b2b', PAT.PLAIN, 0.8), 0.022, 0.4, x, 0.74, z + 0.15, 8);
    env.K.cylX(M('#2b2b2b', PAT.PLAIN, 0.8), 0.02, 0.44, x, 0.42, z + 0.1, 8);
    env.anim(null);
  }
  // ── benches for parents along the far edge
  for (const bx of [-2.0, 0.6]) {
    K.box(wood, 1.6, 0.06, 0.4, bx, 0.44, -D + 0.55);
    K.box(wood, 1.6, 0.4, 0.06, bx, 0.5, -D + 0.38);
    for (const dx of [-0.65, 0.65]) K.box(M('#3b3b3b', PAT.PLAIN, 0.5, 0.5), 0.06, 0.44, 0.4, bx + dx, 0, -D + 0.55);
  }
  env.endChecks();
  env.pick(f.id, 'Playground', new THREE.Box3(new THREE.Vector3(rc.x0, 0, rc.z0), new THREE.Vector3(rc.x1, 3.4, rc.z1)), () => {
    const h = env.hours();
    return ['Swings, slide, see-saw, roundabout', h >= 8 && h < 19.5 ? 'Kids at play' : 'Quiet until morning', 'Sand underfoot'];
  });
}

// ───────────────────────────────────────────────────────────── picnic ──

export function genPicnic(env: Env, f: Feature, i: number): void {
  const R = f.radius || 1.6;
  const ground = Math.max(0, env.ctx.plan.heightAt(f.x, f.z));
  env.begin(f.x, ground, f.z, f.yaw);
  // worn grass under and round the table
  queueContactLocal(env, 0, 0, 0, 0.95, 0.75, 0.45, 0.45, 0.4);
  env.checkRadius(f.x, f.z, R, 'picnic');
  const K = env.S;
  const wood = M(i % 2 ? '#9b6d43' : '#a8794d', PAT.PLANKS, 0.85, 0, 0, 0, 0.3);
  const L = 1.7;
  const end = M(i % 2 ? '#8a5f3a' : '#94683f', PAT.PLANKS, 0.85, 0, 0, 0, 0.5);
  const bolt = M('#6a6d6e', PAT.PLAIN, 0.5, 0.6);
  // top: five boards with 1 cm gaps, ends slightly uneven
  for (let b = 0; b < 5; b++) K.box(b % 2 ? wood : end, L - (b % 3) * 0.01, 0.04, 0.138, 0, 0.7, -0.296 + b * 0.148);
  for (const s2 of [-1, 1]) {
    // seats: two boards each
    for (let b = 0; b < 2; b++) K.box(b ? wood : end, L, 0.04, 0.125, 0, 0.42, s2 * (0.5 + b * 0.135));
    // A-frame legs at both ends (2 × 4 in, bolted to the top and the seat bearer)
    for (const lx of [-L / 2 + 0.22, L / 2 - 0.22]) {
      K.beam(end, [lx, 0, s2 * 0.66], [lx, 0.7, s2 * 0.12], 0.045, 0.09);
      K.cylX(bolt, 0.016, 0.012, lx - 0.03, 0.43, s2 * 0.42, 6);
      K.cylX(bolt, 0.016, 0.012, lx - 0.03, 0.64, s2 * 0.19, 6);
    }
  }
  for (const lx of [-L / 2 + 0.22, L / 2 - 0.22]) {
    K.box(end, 0.045, 0.09, 1.42, lx + 0.045, 0.33, 0);
    K.box(end, 0.045, 0.07, 0.7, lx + 0.045, 0.63, 0);
    // diagonal brace from the seat bearer to the middle of the top
    K.beam(end, [lx + 0.05, 0.38, 0], [lx * 0.35, 0.68, 0], 0.04, 0.07);
  }
  // a tablecloth with a basket on some tables
  if (i % 2 === 0) {
    K.box(M('#c8382f', PAT.STRIPES, 0.9, 0, 0, 0, 0.1), 0.7, 0.008, 0.74, 0.2, 0.741, 0);
    K.box(M('#c99a5b', PAT.PLANKS, 0.9), 0.32, 0.18, 0.22, 0.25, 0.749, 0);
    K.torus(M('#a8794d', PAT.PLAIN, 0.8), 0.13, 0.015, 0.25, 0.94, 0, 3, 10, Math.PI, 0, 0, 0);
  }
  env.endChecks();
  env.pick(f.id, 'Picnic table', new THREE.Box3(new THREE.Vector3(f.x - R, ground, f.z - R), new THREE.Vector3(f.x + R, ground + 1.2, f.z + R)), () => ['Riverside picnic spot', 'Bring your own sandwiches']);
}

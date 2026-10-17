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

const _m = new THREE.Matrix4();

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
  // ── founder: stepped octagonal base, pedestal with plaques, bronze figure
  K.cyl(granite, R - 0.05, R - 0.05, 0.22, 0, 0, 0, 8, false, 'box', Math.PI / 8);
  K.cyl(granite, R - 0.32, R - 0.32, 0.22, 0, 0.22, 0, 8, false, 'box', Math.PI / 8);
  const pw = 1.05;
  K.box(M('#a9a39b', PAT.STONE, 0.75, 0, 0, FLOOD.SOFT, 0.6), pw + 0.25, 0.25, pw + 0.25, 0, 0.44, 0);
  K.box(M('#b8b1a7', PAT.PLAIN, 0.75, 0, 0, FLOOD.SOFT), pw, 1.55, pw, 0, 0.69, 0);
  K.box(M('#a9a39b', PAT.PLAIN, 0.75, 0, 0, FLOOD.SOFT), pw + 0.22, 0.2, pw + 0.22, 0, 2.24, 0);
  K.box(M('#a9a39b', PAT.PLAIN, 0.75, 0, 0, FLOOD.SOFT), pw + 0.1, 0.12, pw + 0.1, 0, 2.44, 0);
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
  // bronze figure, ~2.3 m, striding forward with a raised hat
  const bronze = M('#5f8e78', PAT.PLAIN, 0.42, 0.6, 0, FLOOD.SOFT, 0.5);
  const bronzeD = M('#456b5a', PAT.PLAIN, 0.5, 0.6, 0, FLOOD.SOFT, 0.5);
  const y0 = 2.56;
  K.box(bronzeD, 0.7, 0.08, 0.6, 0, y0 - 0.08, 0);
  // legs (one forward)
  K.rod(bronzeD, [-0.11, y0, 0.12], [-0.1, y0 + 0.82, 0.02], 0.085, 8);
  K.rod(bronzeD, [0.11, y0, -0.12], [0.1, y0 + 0.82, -0.02], 0.085, 8);
  K.box(bronzeD, 0.13, 0.08, 0.28, -0.11, y0, 0.18);
  K.box(bronzeD, 0.13, 0.08, 0.28, 0.11, y0, -0.06);
  // frock coat: squashed lathe from hem to chest
  const coat = new THREE.LatheGeometry(
    [
      [0.0, 0.42],
      [0.36, 0.42],
      [0.33, 0.7],
      [0.26, 1.0],
      [0.25, 1.2],
      [0.3, 1.4],
      [0.27, 1.5],
      [0.12, 1.58],
      [0.0, 1.59],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    14,
  );
  _m.makeScale(1, 1, 0.72).setPosition(0, y0, 0);
  K.geoM(bronze, coat, _m, 'box');
  coat.dispose();
  K.torus(bronzeD, 0.11, 0.035, 0, y0 + 1.58, 0, 5, 12);
  // head, hair
  K.cyl(bronze, 0.07, 0.08, 0.12, 0, y0 + 1.56, 0, 8);
  K.sphere(bronze, 0.13, 0, y0 + 1.78, 0.01, 12, 10);
  K.sphere(bronzeD, 0.135, 0, y0 + 1.8, -0.02, 10, 6, 1, 0, Math.PI * 2, 0, Math.PI * 0.55);
  // left arm down with a scroll, right arm raised with a tricorn hat
  K.rod(bronze, [-0.28, y0 + 1.45, 0], [-0.34, y0 + 1.1, 0.06], 0.065, 8);
  K.rod(bronze, [-0.34, y0 + 1.1, 0.06], [-0.26, y0 + 0.95, 0.24], 0.055, 8);
  K.rod(bronzeD, [-0.34, y0 + 1.12, 0.2], [-0.2, y0 + 0.74, 0.3], 0.05, 8);
  K.rod(bronze, [0.3, y0 + 1.46, 0], [0.42, y0 + 1.78, 0.18], 0.065, 8);
  K.rod(bronze, [0.42, y0 + 1.78, 0.18], [0.46, y0 + 2.12, 0.34], 0.055, 8);
  K.cyl(bronzeD, 0.18, 0.2, 0.09, 0.47, y0 + 2.18, 0.36, 3, false, 'box', 0.4);
  K.cyl(bronzeD, 0.1, 0.12, 0.1, 0.47, y0 + 2.26, 0.36, 8);
  // night: uplights
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    env.glow(Math.sin(a) * (R + 0.4), 0.06, Math.cos(a) * (R + 0.4), { size: 1.3, kind: 'pool', color: '#ffd09a', intensity: 0.26 });
  }
  env.glow(0, 0.6, R + 0.2, { size: 0.5, kind: 'beam', color: '#ffe0b0', intensity: 0.2, dir: [0, 3.6, -1.0], endSize: 1.4 });
  env.endChecks();
  env.pick(f.id, 'Statue of Edmund Haven', new THREE.Box3(new THREE.Vector3(f.x - R, 0, f.z - R), new THREE.Vector3(f.x + R, y0 + 2.4, f.z + R)), () => ['Founder of Tinyhaven · bronze, 1901', 'Raised his hat to the first ship in port', 'Favourite perch of the park pigeons']);
}

// ───────────────────────────────────────────────────────────── gazebo ──

export function genGazebo(env: Env, f: Feature): void {
  const R = Math.min(Number(f.params?.radius ?? 3.5), (f.radius || 3.6) - 0.05);
  env.begin(f.x, 0, f.z, f.yaw);
  env.checkRadius(f.x, f.z, f.radius || R + 0.1, 'gazebo');
  const K = env.S;
  const white = M('#f4f1ea', PAT.PLAIN, 0.6, 0, 0, FLOOD.SOFT);
  const stone = M('#c9c1b2', PAT.STONE, 0.85, 0, 0, FLOOD.SOFT, 0.4);
  const floor = M('#b48a5e', PAT.PLANKS, 0.8, 0, 0, 0, 0.6);
  const roof = M('#4f7f63', PAT.SLATE, 0.6, 0, 0, 0, 0.4);
  const rot = Math.PI / 8; // a face (not a column) towards +Z for the entrance
  const pr = R - 0.32;
  K.cyl(stone, pr, pr + 0.04, 0.42, 0, 0, 0, 8, false, 'box', rot);
  K.cyl(floor, pr - 0.05, pr - 0.05, 0.06, 0, 0.42, 0, 8, false, 'box', rot);
  // steps on the entrance side
  K.steps(stone, 1.5, 2, 0.21, 0.28, 0, 0, R - 0.02);
  const colR = pr - 0.28;
  const colH = 2.55;
  const corners: V3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = rot + (i / 8) * Math.PI * 2;
    corners.push([Math.sin(a) * colR, 0.48, Math.cos(a) * colR]);
  }
  for (const c of corners) {
    K.cyl(white, 0.075, 0.09, colH, c[0], 0.48, c[2], 8);
    K.box(white, 0.22, 0.12, 0.22, c[0], 0.48, c[2]);
    K.box(white, 0.2, 0.1, 0.2, c[0], 0.48 + colH - 0.1, c[2]);
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
      railing(env, [a[0], 0.48, a[2]], [b[0], 0.48, b[2]], 0.85, '#f4f1ea');
      // built-in bench inside
      K.beam(M('#b48a5e', PAT.PLANKS, 0.8), [a[0] * 0.85, 0.92, a[2] * 0.85], [b[0] * 0.85, 0.92, b[2] * 0.85], 0.32, 0.06);
    }
  }
  // roof: eave ring, octagonal pyramid, cupola, finial
  const eaveY = 0.48 + colH;
  K.cyl(white, R - 0.05, R - 0.05, 0.18, 0, eaveY, 0, 8, false, 'box', rot);
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
  K.panel(M('#f6efe0', PAT.WINDOW, 0.3, 0, 0.95, 0, 0.45), 0.9, 0.85, 0, 1.15, fz + 0.012, 0);
  K.box(M('#b98d60', PAT.PLANKS, 0.7), 1.05, 0.06, 0.32, 0, 1.08, fz + 0.12);
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
    K.cyl(M('#3b3b3b', PAT.PLAIN, 0.4, 0.6), 0.03, 0.03, 0.72, tx, 0, tz, 6);
    K.cyl(M('#ece7dc', PAT.PLAIN, 0.4), 0.32, 0.32, 0.03, tx, 0.72, tz, 14);
    for (const [cx2, cz2] of [
      [0, 0.52],
      [0, -0.52],
    ]) {
      K.box(M('#3e6f5a', PAT.PLAIN, 0.6, 0.3), 0.36, 0.04, 0.34, tx + cx2, 0.44, tz + cz2);
      K.box(M('#3e6f5a', PAT.PLAIN, 0.6, 0.3), 0.36, 0.4, 0.03, tx + cx2, 0.46, tz + cz2 + Math.sign(cz2) * 0.17);
      for (const lx of [-0.15, 0.15]) K.box(M('#3b3b3b', PAT.PLAIN, 0.4, 0.6), 0.025, 0.44, 0.025, tx + cx2 + lx, 0, tz + cz2);
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
  for (const x of [sx0, sx1]) {
    K.rod(blue, [x, 0, sz - 0.95], [x, top, sz], 0.06, 6);
    K.rod(blue, [x, 0, sz + 0.95], [x, top, sz], 0.06, 6);
  }
  K.rod(blue, [sx0 - 0.1, top, sz], [sx1 + 0.1, top, sz], 0.07, 8);
  const swings = [
    { x: sx0 + 1.0, amp: 0.42, ph: 0.0, kidOn: true },
    { x: sx1 - 1.0, amp: 0.18, ph: 2.1, kidOn: false },
  ];
  for (const sw of swings) {
    env.anim({ mode: ANIM.SWING, pivot: new THREE.Vector3(sw.x, top, sz), axis: new THREE.Vector3(1, 0, 0), a: sw.amp, b: 2.2, c: sw.ph });
    for (const dx of [-0.2, 0.2]) env.K.rod(steel, [sw.x + dx, top, sz], [sw.x + dx, 0.5, sz], 0.012, 4);
    env.K.box(M('#222222', PAT.PLAIN, 0.7), 0.48, 0.05, 0.2, sw.x, 0.46, sz);
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
  for (let y = 0.3; y < ph; y += 0.3) K.box(yellow, 0.06, 0.04, 0.7, lx, y, lz);
  for (const [dx, dz] of [
    [1.0, -0.4],
    [1.0, 0.4],
  ])
    K.box(yellow, 0.07, ph + 1.2, 0.07, lx + dx, 0, lz + dz);
  K.box(wood, 1.1, 0.08, 0.9, lx + 0.5, ph, lz);
  K.pyramid(red, lx - 0.05, lx + 1.05, lz - 0.48, lz + 0.48, ph + 1.2, ph + 1.75, 0.08);
  const chute = (W - 0.8) - (lx + 1.05);
  const ang = Math.atan2(ph - 0.25, chute);
  K.boxC(red, Math.hypot(chute, ph - 0.25), 0.06, 0.6, lx + 1.05 + chute / 2, (ph + 0.25) / 2 + 0.03, lz, 0, 0, -ang);
  for (const dz of [-0.31, 0.31]) K.boxC(red, Math.hypot(chute, ph - 0.25), 0.18, 0.04, lx + 1.05 + chute / 2, (ph + 0.25) / 2 + 0.12, lz + dz, 0, 0, -ang);
  K.box(red, 0.5, 0.06, 0.6, W - 0.55, 0.22, lz);
  env.anim({ mode: ANIM.VIS, pivot: new THREE.Vector3(lx + 0.5, ph, lz), axis: new THREE.Vector3(0, 1, 0), a: 3, b: 0.15, c: 1.3 });
  kid(lx + 0.5, ph + 0.08, lz, Math.PI / 2, '#3fa7d6', false);
  env.anim(null);

  // ── see-saw (swings about its pivot; two kids ride it by day)
  const ssx = -W + 3.2,
    ssz = D - 2.4;
  K.box(yellow, 0.35, 0.45, 0.4, ssx, 0, ssz);
  env.anim({ mode: ANIM.SWING, pivot: new THREE.Vector3(ssx, 0.5, ssz), axis: new THREE.Vector3(0, 0, 1), a: 0.24, b: 2.2, c: 0.7 });
  env.K.box(red, 3.2, 0.07, 0.28, ssx, 0.47, ssz);
  for (const s of [-1, 1]) {
    env.K.box(M('#222222', PAT.PLAIN, 0.7), 0.04, 0.35, 0.3, ssx + s * 1.25, 0.54, ssz);
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
      for (const y of [0.6, 1.2, 1.8]) {
        if (i < n) K.rod(steel, [gx0 + i * sp, y, gz0 + j * sp * 1.1], [gx0 + (i + 1) * sp, y, gz0 + j * sp * 1.1], 0.022, 4);
        if (j < 2) K.rod(steel, [gx0 + i * sp, y, gz0 + j * sp * 1.1], [gx0 + i * sp, y, gz0 + (j + 1) * sp * 1.1], 0.022, 4);
      }
    }

  // ── spring riders (a duck and a horse rocking gently)
  for (const [x, z, col, ph2] of [
    [W - 1.4, D - 1.6, '#f2c230', 0.0],
    [W - 2.8, D - 1.4, '#d63c34', 1.7],
  ] as [number, number, string, number][]) {
    K.cyl(steel, 0.1, 0.1, 0.38, x, 0, z, 8);
    env.anim({ mode: ANIM.SWING, pivot: new THREE.Vector3(x, 0.15, z), axis: new THREE.Vector3(1, 0, 0), a: 0.12, b: 2.6, c: ph2 });
    env.K.box(M(col, PAT.PLAIN, 0.5, 0.1), 0.25, 0.32, 0.7, x, 0.38, z);
    env.K.box(M(col, PAT.PLAIN, 0.5, 0.1), 0.2, 0.3, 0.22, x, 0.68, z + 0.3);
    env.K.box(M('#222222', PAT.PLAIN, 0.6), 0.34, 0.05, 0.05, x, 0.82, z + 0.2);
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
  env.checkRadius(f.x, f.z, R, 'picnic');
  const K = env.S;
  const wood = M(i % 2 ? '#9b6d43' : '#a8794d', PAT.PLANKS, 0.85, 0, 0, 0, 0.3);
  const L = 1.7;
  K.box(wood, L, 0.06, 0.74, 0, 0.72, 0);
  for (const s of [-1, 1]) {
    K.box(wood, L, 0.05, 0.27, 0, 0.42, s * 0.6);
    // A-frame legs at both ends
    for (const lx of [-L / 2 + 0.2, L / 2 - 0.2]) {
      K.beam(wood, [lx, 0, s * 0.62], [lx, 0.72, s * 0.08], 0.07, 0.12);
    }
  }
  for (const lx of [-L / 2 + 0.2, L / 2 - 0.2]) K.box(wood, 0.07, 0.07, 1.3, lx, 0.38, 0);
  // a tablecloth with a basket on some tables
  if (i % 2 === 0) {
    K.box(M('#c8382f', PAT.STRIPES, 0.9, 0, 0, 0, 0.1), 0.7, 0.01, 0.74, 0.2, 0.781, 0);
    K.box(M('#c99a5b', PAT.PLANKS, 0.9), 0.32, 0.18, 0.22, 0.25, 0.79, 0);
    K.torus(M('#a8794d', PAT.PLAIN, 0.8), 0.13, 0.015, 0.25, 0.98, 0, 3, 10, Math.PI, 0, 0, 0);
  }
  env.endChecks();
  env.pick(f.id, 'Picnic table', new THREE.Box3(new THREE.Vector3(f.x - R, ground, f.z - R), new THREE.Vector3(f.x + R, ground + 1.2, f.z + R)), () => ['Riverside picnic spot', 'Bring your own sandwiches']);
}

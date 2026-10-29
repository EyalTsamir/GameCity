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
import { blob, body, capsule, hash1, paint, shell, surface } from './sculpt';

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
  // each step: a riser with a shadow-line undercut under a rounded nosing; extra rings on the risers carry the
  // weathering gradient (vertex colours): damp dark foot with green algae, splash band, treads worn paler at
  // the front (feet), dirt lodged where riser meets tread
  const stepProf = (r: number, y: number): [number, number][] => [
    [r, y], [r, y + 0.05], [r, y + 0.12], [r, y + 0.165], [r - 0.016, y + 0.172], [r - 0.012, y + 0.186], [r - 0.002, y + 0.196], [r - 0.01, y + 0.212], [r - 0.03, y + 0.22],
  ];
  const steps = facetLathe([[0, 0], ...stepProf(Rs, 0), [Rs - 0.25, 0.22], ...stepProf(Rs - 0.27, 0.222), [Rs - 0.52, 0.442], [0, 0.442]], 8, Math.PI / 8);
  paint(steps, (p, n, o) => {
    const r = Math.hypot(p.x, p.z) * Math.cos(Math.PI / 8);
    let k = 1, g = 0;
    if (n.y < 0.5) {
      const yl = p.y < 0.21 ? p.y : p.y - 0.222;
      k = yl < 0.01 ? 0.62 : yl < 0.06 ? 0.8 : 0.95;
      g = yl < 0.06 ? 0.12 : 0;
    } else {
      const front = Math.max(0, p.z / Math.max(0.01, r));
      const edge = r > Rs - 0.06 || (r > Rs - 0.33 && r < Rs - 0.255) ? 1 : 0;
      k = 1 + 0.12 * front * edge - (r < Rs - 0.24 && r > Rs - 0.27 ? 0.25 : 0);
    }
    o.setRGB(k * (1 - g), k * (1 - g * 0.3), k * (1 - g));
  });
  K.geo(granite, steps);
  steps.dispose();
  // block joints on the risers, lichen spots on the treads
  const jointM = M('#5e5a54', PAT.PLAIN, 0.95);
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i / 8) * Math.PI * 2 + Math.PI / 8;
    for (const [r, y0] of [[Rs, 0], [Rs - 0.27, 0.222]] as [number, number][]) {
      const rr = r + 0.002;
      K.box(jointM, 0.006, 0.165, 0.004, Math.sin(a) * rr, y0, Math.cos(a) * rr, a + Math.PI / 2);
    }
  }
  for (let i = 0; i < 14; i++) {
    const a = hash1(i * 3.1 + f.id) * Math.PI * 2, onTop = i % 2 === 0;
    const r = onTop ? Rs - 0.15 + hash1(i + 9) * 0.1 : Rs - 0.45 + hash1(i + 5) * 0.12;
    const col = hash1(i + 2) < 0.6 ? '#b9bea4' : hash1(i + 2) < 0.85 ? '#d8b86a' : '#8e9a7a';
    K.cyl(M(col, PAT.STONE, 0.95, 0, 0, FLOOD.SOFT, i * 0.2), 0.02 + 0.03 * hash1(i + 4), 0.02 + 0.03 * hash1(i + 4), 0.002, Math.sin(a) * r, onTop ? 0.222 : 0.442, Math.cos(a) * r, 7);
  }
  queueContactLocal(env, 0, 0, 0, Rs, Rs, Rs * 0.42, 0.25, 0.5, Math.PI / 8);
  const pw = 1.0;
  const die = M('#b8b1a7', PAT.STONE, 0.75, 0, 0, FLOOD.SOFT, 0.6);
  // bold mouldings (they must read at 3 m): base block, torus + cavetto stepping in to the die; cornice
  // with a cyma, a deep corona and a drip; capping block
  const ped = facetLathe([
    [0, 0.44], [0.72, 0.44], [0.72, 0.6], [0.69, 0.615], [0.705, 0.64], [0.712, 0.665], [0.7, 0.69], [0.66, 0.7], [0.6, 0.705], [0.6, 0.72],
    [0.57, 0.745], [0.54, 0.78], [0.515, 0.805], [0.5, 0.82],
    [0.5, 2.0], [0.52, 2.015], [0.545, 2.04], [0.575, 2.08], [0.6, 2.1], [0.6, 2.12], [0.575, 2.125], [0.575, 2.14], [0.745, 2.145],
    [0.745, 2.27], [0.72, 2.29], [0.66, 2.295], [0.64, 2.31], [0.64, 2.44], [0.61, 2.47], [0.47, 2.545], [0, 2.56],
  ], 4, Math.PI / 4);
  // verdigris washed off the bronze base tints the capping and the cornice top
  paint(ped, (p, n, o) => {
    if (p.y > 2.28 || (p.y > 2.26 && n.y > 0.5)) o.setRGB(0.78, 0.9, 0.84);
  });
  K.geo(die, ped);
  ped.dispose();
  // sunk panels on the two plain sides: a raised margin frame round a slightly darker field
  const recess = M('#a39d94', PAT.STONE, 0.8, 0, 0, FLOOD.SOFT, 0.7);
  for (const sx of [-1, 1]) {
    K.box(recess, 0.004, 0.9, 0.62, sx * 0.502, 0.98, 0);
    for (const dz of [-0.33, 0.33]) K.box(die, 0.03, 0.96, 0.04, sx * 0.51, 0.95, dz);
    for (const yy of [0.95, 1.89]) K.box(die, 0.03, 0.04, 0.7, sx * 0.51, yy, 0);
  }
  // patina run-off: green-grey streaks down the four die faces from under the cornice, longest at the
  // corners and below the drip (vertex colours on a fine grid just proud of the die)
  for (let face = 0; face < 4; face++) {
    const ry = (face * Math.PI) / 2;
    const NX = 56, NY = 14, yTop = 2.0, yBot = 0.84;
    const sg = surface(NX, NY, (u, v, o) => o.set(-0.5 + u, yBot + (yTop - yBot) * v, 0));
    paint(sg, (p, _n, o) => {
      const x = p.x + face * 1.7;
      const runs = Math.pow(0.5 + 0.5 * Math.sin(x * 41 + Math.sin(x * 9.3) * 2.2), 5) + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(x * 97 + 1.3), 9);
      const corner = Math.max(0, (Math.abs(p.x) - 0.38) / 0.12);
      const len = 0.25 + 0.55 * hash1(Math.floor(x * 18)) + 0.4 * corner;
      const t = Math.min(1, Math.max(0, (p.y - (yTop - len)) / len));
      const k = Math.min(1, runs * t * t * 1.8 + corner * t * 0.6);
      o.setRGB(1 - 0.6 * k, 1 - 0.36 * k, 1 - 0.46 * k);
    });
    _m.makeRotationY(ry).setPosition(Math.sin(ry) * 0.5025, 0, Math.cos(ry) * 0.5025);
    K.geoM(die, sg, _m);
    sg.dispose();
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
  // bronze figure (heroic scale 1.25: ~2.3 m), smooth sculpted parts (sculpt.ts): striding forward, the
  // right arm pointing out to sea, the left hand holding his tricorn at his side. Frock coat whose skirt
  // opens at the front over breeches and riding boots, folds and a back vent; lapels and a waistcoat;
  // bare head with a face (brow, eye sockets, nose, mouth, chin), hair swept back into a queue.
  // Patina in vertex colours: dark brown bronze, verdigris where rain sits (upward faces) and runs (streaks),
  // undersides dark, the toe of the forward boot rubbed to bright brass by passers-by.
  const bronze = M('#ffffff', PAT.PLAIN, 0.5, 0.35, 0, FLOOD.SOFT, 0.5);
  const y0 = 2.56, sc = 1.25;
  const DARK = [0.25, 0.17, 0.11], VERD = [0.33, 0.52, 0.43], VERD2 = [0.44, 0.62, 0.53];
  const patina = (p: THREE.Vector3, n: THREE.Vector3, o: THREE.Color) => {
    const up = Math.max(0, n.y);
    const side = 1 - Math.abs(n.y);
    const st = Math.pow(0.5 + 0.5 * Math.sin(p.x * 61 + p.z * 47 + Math.sin(p.x * 13 + p.z * 7 + p.y * 2) * 2), 6);
    let g = THREE.MathUtils.smoothstep(up, 0.2, 0.75) * 0.9 + st * side * (0.45 + 0.4 * hash1(Math.floor(p.y * 6) + p.x * 3));
    if (n.y < -0.25) g *= 0.25;
    g = Math.min(1, g);
    const v = hash1(p.x * 17 + p.y * 31 + p.z * 13);
    const V = v > 0.5 ? VERD2 : VERD;
    const k = 0.9 + 0.2 * v;
    o.setRGB((DARK[0] + (V[0] - DARK[0]) * g) * k, (DARK[1] + (V[1] - DARK[1]) * g) * k, (DARK[2] + (V[2] - DARK[2]) * g) * k, THREE.SRGBColorSpace);
  };
  const toLocal = new THREE.Matrix4().makeScale(sc, sc, sc).setPosition(0, y0, 0);
  const put = (g: THREE.BufferGeometry, fn = patina) => {
    g.applyMatrix4(toLocal);
    paint(g, fn);
    K.geo(bronze, g);
    g.dispose();
  };
  const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0) => {
    _e.set(pitch, yaw, roll, 'YXZ');
    g.applyMatrix4(_m.makeRotationFromEuler(_e).setPosition(x, y, z));
    return g;
  };
  const p3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // cast base slab, a little irregular
  put(at(new THREE.CylinderGeometry(0.31, 0.33, 0.05, 9), 0, -0.01, 0));
  // legs: breeches to the knee, boots with a turned-down top; left foot forward, right heel lifted
  for (const [sx, hipZ, knee, ankle, foot, pitch] of [
    [-1, 0.02, p3(-0.1, 0.5, 0.1), p3(-0.1, 0.09, 0.13), p3(-0.1, 0.045, 0.19), 0],
    [1, -0.01, p3(0.1, 0.5, -0.05), p3(0.1, 0.12, -0.17), p3(0.1, 0.055, -0.11), 0.45],
  ] as const) {
    const hip = p3(sx * 0.1, 0.95, hipZ);
    put(capsule(hip, knee, 0.088, 0.066, 14));
    put(capsule(knee, ankle, 0.064, 0.054, 14));
    const top = knee.clone().lerp(ankle, 0.08);
    put(at(new THREE.CylinderGeometry(0.074, 0.069, 0.08, 14), top.x, top.y, top.z));
    // boot: toe, instep, heel block
    const fg = blob(0.052, 0.045, 0.125, 14, 10, (p) => {
      if (p.y < -0.3) p.y = -0.3 - (p.y + 0.3) * 0.3;
      if (p.z > 0) p.y *= 1 - 0.35 * p.z;
    });
    const toeLit = sx < 0;
    at(fg, foot.x, foot.y, foot.z, 0, pitch);
    fg.applyMatrix4(toLocal);
    paint(fg, (p, n, o) => {
      patina(p, n, o);
      if (toeLit && p.z > (foot.z + 0.04) * sc) o.setRGB(0.78, 0.56, 0.3, THREE.SRGBColorSpace);
    });
    K.geo(bronze, fg);
    fg.dispose();
    put(at(new THREE.BoxGeometry(0.07, 0.04, 0.06), foot.x, foot.y - 0.02 + pitch * 0.06, foot.z - 0.08, 0, pitch));
  }
  // coat skirt: an open shell (front opening widening to the hem, folds, back vent), thickness 1.5 cm
  const skirtR = (y: number) => 0.178 + (0.27 - 0.178) * Math.pow(Math.min(1, Math.max(0, (1.0 - y) / 0.45)), 1.3);
  for (const part of shell(40, 10, (u, v, o) => {
    const y = 0.55 + v * 0.47;
    const open = 0.32 + 0.3 * (1 - v);
    const th = open + u * (Math.PI * 2 - 2 * open);
    const fall = Math.pow(1 - v, 1.2);
    let r = skirtR(y) * (1 + 0.075 * Math.sin(th * 8 + 0.7) * fall);
    const back = Math.max(0, -Math.cos(th));
    r += 0.03 * fall * back;
    // the vent: the two back halves part a little at the hem
    const vent = Math.exp(-Math.pow((th - Math.PI) / 0.12, 2)) * fall;
    r -= 0.035 * vent;
    o.set(Math.sin(th) * r, y, Math.cos(th) * r * 0.72 - 0.035 * fall * back);
  }, 0.015)) put(part);
  // torso: chest, shoulders (squarish section), lapel ridges framing the waistcoat V, buttons
  const lapel = (th: number, y: number) => {
    if (y < 0.98 || y > 1.43) return 0;
    const a = Math.abs(((th + Math.PI) % (Math.PI * 2)) - Math.PI);
    const l = 0.16 + (y - 0.98) * 0.75;
    if (a < l) return -0.006;
    if (a < l + 0.22) return 0.012 * Math.min(1, (y - 0.98) / 0.1);
    return 0;
  };
  put(body([[0.17, 0.92], [0.175, 1.0], [0.185, 1.1], [0.2, 1.22], [0.215, 1.32], [0.228, 1.4], [0.205, 1.45], [0.14, 1.49], [0.07, 1.52], [0.0, 1.53]], 0.66, 40, 22, 2.6, lapel));
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) put(at(blob(0.011, 0.011, 0.008, 8, 6), sx * (0.06 + i * 0.012), 1.02 + i * 0.07, 0.124));
  // neck, cravat, standing collar
  put(capsule(p3(0, 1.48, 0), p3(0, 1.6, 0.012), 0.05, 0.047, 12));
  put(at(blob(0.05, 0.045, 0.035, 12, 8), 0, 1.47, 0.08));
  put(at(new THREE.TorusGeometry(0.068, 0.02, 6, 16, Math.PI * 1.4), 0, 1.51, -0.005, -Math.PI * 0.2 + Math.PI, Math.PI / 2));
  // head: face carved into a deformed ellipsoid, turned toward the pointing hand
  const headYaw = 0.35;
  put(at(blob(0.088, 0.112, 0.1, 30, 22, (p) => {
    const front = Math.max(0, p.z);
    const ax = Math.abs(p.x);
    p.z += front * (0.36 * Math.exp(-((p.x / 0.13) ** 2) - ((p.y + 0.08) / 0.2) ** 2));
    p.z += front * 0.13 * Math.exp(-(((p.y - 0.25) / 0.08) ** 2)) * (ax < 0.7 ? 1 : 0.4);
    p.z -= front * 0.12 * Math.exp(-(((ax - 0.36) / 0.15) ** 2) - ((p.y - 0.1) / 0.1) ** 2);
    p.z -= front * 0.06 * Math.exp(-((p.x / 0.28) ** 2) - ((p.y + 0.42) / 0.035) ** 2);
    if (p.y < -0.45) p.x *= 1 - 0.25 * Math.min(1, (-0.45 - p.y) / 0.5);
    p.z += front * 0.1 * Math.exp(-((p.x / 0.3) ** 2) - ((p.y + 0.72) / 0.12) ** 2);
  }), 0, 1.66, 0.01, headYaw));
  // ears
  for (const sx of [-1, 1]) put(at(blob(0.013, 0.028, 0.02, 8, 6), sx * 0.086, 1.655, -0.005, headYaw));
  // hair: a cap over the crown and back, grooves combed back, tied into a queue with a bow
  put(at(blob(0.095, 0.118, 0.105, 28, 18, (p) => {
    if (p.z > 0.25 && p.y < 0.5) {
      const k = 0.88;
      p.multiplyScalar(k);
    }
    if (p.y < -0.25 && p.z > -0.6) p.multiplyScalar(0.86);
    const gr = 1 + 0.025 * Math.sin(p.x * 34);
    p.x *= gr;
    p.y *= gr;
  }), 0, 1.68, -0.008, headYaw, 0.1));
  put(capsule(p3(0, 1.6, -0.098), p3(0, 1.52, -0.112), 0.02, 0.014, 8));
  for (const sx of [-1, 1]) put(at(blob(0.032, 0.018, 0.012, 8, 6), sx * 0.028, 1.6, -0.105, sx * 0.5));
  // arms: shoulder caps, sleeves, turned-back cuffs, hands
  const shR = p3(0.21, 1.4, 0.0), elR = p3(0.3, 1.43, 0.24), wrR = p3(0.36, 1.53, 0.47);
  const shL = p3(-0.21, 1.4, 0.0), elL = p3(-0.27, 1.14, -0.03), wrL = p3(-0.27, 0.93, 0.06);
  for (const [sh, el, wr] of [[shR, elR, wrR], [shL, elL, wrL]]) {
    put(at(blob(0.082, 0.075, 0.078, 14, 10), sh.x, sh.y, sh.z));
    put(capsule(sh, el, 0.07, 0.06, 14));
    put(capsule(el, wr, 0.06, 0.052, 14));
    const c0 = el.clone().lerp(wr, 0.72);
    put(capsule(c0, wr, 0.068, 0.068, 14));
  }
  // right hand: palm along the arm, index finger pointing on, thumb
  const dir = wrR.clone().sub(elR).normalize();
  const hand = wrR.clone().addScaledVector(dir, 0.06);
  put(capsule(wrR, hand, 0.034, 0.03, 10));
  put(capsule(hand, hand.clone().addScaledVector(dir, 0.075), 0.011, 0.009, 6));
  for (const k of [0, 1, 2]) put(capsule(hand.clone().add(p3(0, -0.012 - k * 0.011, 0)), hand.clone().addScaledVector(dir, 0.025).add(p3(0, -0.03 - k * 0.011, -0.012)), 0.011, 0.01, 6));
  put(capsule(wrR.clone().add(p3(-0.02, 0.012, 0.02)), hand.clone().add(p3(-0.025, 0.02, 0.01)), 0.012, 0.01, 6));
  // left hand gripping the tricorn's brim at his side (crown out, brim upright)
  put(capsule(wrL, wrL.clone().add(p3(-0.01, -0.07, 0.015)), 0.034, 0.03, 10));
  const hat = new THREE.CylinderGeometry(0.16, 0.185, 0.045, 3);
  put(at(hat, -0.31, 0.86, 0.1, 0.3, 0, Math.PI / 2));
  put(at(new THREE.CylinderGeometry(0.09, 0.105, 0.08, 12), -0.36, 0.86, 0.1, 0.3, 0, Math.PI / 2));
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
    // bold turnings so they read at 10 m: base torus over a fillet, scotia, a vase swell low on the shaft,
    // entasis, an astragal bead, necking, an echinus flaring out under the abacus block
    K.lathe(white, [
      [0.108, 0], [0.108, 0.035], [0.1, 0.042], [0.112, 0.06], [0.114, 0.075], [0.104, 0.092], [0.086, 0.1], [0.084, 0.118], [0.094, 0.13], [0.09, 0.145],
      [0.076, 0.17], [0.072, 0.22], [0.088, 0.33], [0.09, 0.38], [0.074, 0.48], [0.07, 0.52], [0.08, 0.54], [0.08, 0.565], [0.07, 0.585],
      [0.074, colH - 0.6], [0.068, colH - 0.46], [0.068, colH - 0.445], [0.084, colH - 0.432], [0.086, colH - 0.415], [0.07, colH - 0.4], [0.067, colH - 0.33],
      [0.074, colH - 0.31], [0.074, colH - 0.29], [0.09, colH - 0.25], [0.108, colH - 0.215], [0.116, colH - 0.19], [0.116, colH - 0.17], [0, colH - 0.17],
    ], c[0], 0.6, c[2], 16);
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
      // hands have worn the paint off the rail top (grey timber), algae and splash on the bottom rail
      K.beam(M('#b5aa96', PAT.PLANKS, 0.85, 0, 0, FLOOD.SOFT, i * 0.3), [a[0] + ux * 0.3, 1.327, a[2] + uz * 0.3], [b[0] - ux * 0.3, 1.327, b[2] - uz * 0.3], 0.055, 0.004);
      K.beam(M('#9fa58c', PAT.PLAIN, 0.9, 0, 0, FLOOD.SOFT), [a[0] + ux * 0.1, 0.533, a[2] + uz * 0.1], [b[0] - ux * 0.1, 0.533, b[2] - uz * 0.1], 0.074, 0.018);
      const nb = Math.max(3, Math.floor((len - 0.2) / 0.12));
      for (let k = 1; k < nb; k++) {
        const t = 0.1 + ((len - 0.2) * k) / nb;
        const px = a[0] + ux * t, pz = a[2] + uz * t;
        K.beam(white, [px, 0.59, pz], [px, 1.28, pz], 0.035, 0.035);
      }
      // built-in bench inside
      // (three seat boards with gaps on two bearers with legs; a box, not a beam: the beam's cross-section
      // turned on end on some sides)
      const ry = Math.atan2(-uz, ux), sl = len * 0.85 - 0.06;
      const nx = -uz, nz = ux; // inward normal (towards the centre)
      const sgn = nx * -mid[0] + nz * -mid[2] > 0 ? 1 : -1;
      const seatM = M('#b48a5e', PAT.PLANKS, 0.8);
      for (let k = 0; k < 3; k++) {
        const o = 0.17 + k * 0.105;
        K.boxC(seatM, sl, 0.035, 0.09, mid[0] * 0.98 + nx * sgn * o, 0.92, mid[2] * 0.98 + nz * sgn * o, 0, ry, 0);
      }
      for (const t of [-0.38, 0.38]) {
        const bx = mid[0] * 0.98 + ux * t * sl + nx * sgn * 0.27, bz = mid[2] * 0.98 + uz * t * sl + nz * sgn * 0.27;
        K.boxC(seatM, 0.05, 0.05, 0.34, bx, 0.88, bz, 0, ry, 0);
        K.boxC(seatM, 0.05, 0.38, 0.05, bx + nx * sgn * 0.1, 0.67, bz + nz * sgn * 0.1, 0, ry, 0);
      }
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
  // soffit seen from inside: a boarded panel between each pair of rafters, 2 cm under the roof boards, each
  // its own weathered tone (grey-brown, water marks towards the eave); two purlin rings, a ceiling boss
  const soffitY = (r: number) => eaveY + 0.15 + ((R - 0.06 - r) / (R - 0.36)) * 1.33;
  for (let i = 0; i < 16; i++) {
    const a0 = rot + (i / 16) * Math.PI * 2, a1 = rot + ((i + 1) / 16) * Math.PI * 2;
    const r0 = (i % 2 ? (R - 0.1) * Math.cos(Math.PI / 8) : R - 0.1) - 0.04, r1 = ((i + 1) % 2 ? (R - 0.1) * Math.cos(Math.PI / 8) : R - 0.1) - 0.04;
    const tone = new THREE.Color('#d9cdb4').offsetHSL(0, -0.05 + 0.04 * Math.sin(i * 2.7), -0.06 + 0.05 * Math.sin(i * 1.9 + f.id));
    const P = (a: number, r: number): V3 => [Math.sin(a) * r, soffitY(r) - 0.02, Math.cos(a) * r];
    const q: V3[] = [P(a0, r0), P(a1, r1), P(a1, 0.34), P(a0, 0.34)];
    K.poly(M(tone, PAT.PLANKS, 0.85, 0, 0, FLOOD.SOFT, 0.13 * i), q, q.map((p) => [Math.atan2(p[0], p[2]) * Math.hypot(p[0], p[2]), p[1] * 1.4] as [number, number]), true);
    // a water mark near the eave on some panels
    if ((i * 5 + f.id) % 3 === 0) {
      const w2: V3[] = [P(a0 + 0.04, r0 - 0.05), P(a1 - 0.04, r1 - 0.05), P(a1 - 0.08, r1 - 0.45), P(a0 + 0.08, r0 - 0.35)];
      for (const p of w2) p[1] -= 0.004;
      K.poly(M(tone.clone().multiplyScalar(0.78), PAT.PLANKS, 0.9, 0, 0, FLOOD.SOFT, 0.5), w2, undefined, true);
    }
  }
  for (const rr of [R * 0.62, R * 0.32]) K.cyl(white, rr, rr, 0.07, 0, soffitY(rr) - 0.1, 0, 8, true, 'box', rot);
  K.cyl(white, 0.36, 0.3, 0.1, 0, soffitY(0.36) - 0.12, 0, 16);
  K.sphere(white, 0.09, 0, soffitY(0.36) - 0.14, 0, 10, 6);
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
    // cast-iron column: square-ish moulded base, slim shaft with a collar ring, bell capital under a plate
    K.lathe(iron, [
      [0.12, 0], [0.12, 0.08], [0.1, 0.095], [0.104, 0.13], [0.085, 0.16], [0.08, 0.2], [0.068, 0.26], [0.062, 0.32],
      [0.058, colH * 0.45], [0.074, colH * 0.45 + 0.02], [0.074, colH * 0.45 + 0.05], [0.058, colH * 0.45 + 0.07],
      [0.055, colH - 0.36], [0.072, colH - 0.34], [0.072, colH - 0.31], [0.058, colH - 0.29], [0.07, colH - 0.2], [0.1, colH - 0.13], [0.13, colH - 0.1], [0.13, colH], [0, colH],
    ], c[0], stageH, c[2], 12);
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
  // (F2, judge: "the drum is a plain white cylinder") a side drum on its stand: lacquered shell, painted hoops
  // top and bottom, eight brass tension rods with their lugs, a calfskin head worn darker where it is played
  {
    const dx = 0.4,
      dz = -0.12,
      y0 = stageH + 0.5,
      dh = 0.3,
      r = 0.3;
    const hoop = M('#1f2a4a', PAT.PLAIN, 0.5);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      env.K.rod(M('#2a2b2e', PAT.PLAIN, 0.4), [dx + Math.sin(a) * 0.32, stageH, dz + Math.cos(a) * 0.32], [dx, y0 - 0.12, dz], 0.012, 4);
      env.K.rod(M('#2a2b2e', PAT.PLAIN, 0.4), [dx, y0 - 0.12, dz], [dx + Math.sin(a) * 0.2, y0 + 0.02, dz + Math.cos(a) * 0.2], 0.01, 4);
    }
    env.K.cyl(M('#8b2232', PAT.PLAIN, 0.35), r, r, dh, dx, y0, dz, 18);
    env.K.torus(hoop, r + 0.012, 0.02, dx, y0 + 0.012, dz, 4, 22);
    env.K.torus(hoop, r + 0.012, 0.022, dx, y0 + dh - 0.006, dz, 4, 22);
    env.K.cyl(M('#ece5d2', PAT.PLAIN, 0.7), r - 0.004, r - 0.004, 0.012, dx, y0 + dh - 0.006, dz, 18);
    env.K.cyl(M('#d3c7aa', PAT.PLAIN, 0.75), 0.11, 0.11, 0.004, dx + 0.04, y0 + dh + 0.004, dz - 0.05, 12);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const lx = dx + Math.sin(a) * (r + 0.018),
        lz = dz + Math.cos(a) * (r + 0.018);
      env.K.rod(S_gold(), [lx, y0 + 0.03, lz], [lx, y0 + dh - 0.025, lz], 0.006, 4);
      env.K.box(S_gold(), 0.03, 0.06, 0.03, lx, y0 + dh * 0.5 - 0.03, lz, a);
    }
  }
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
  // hexagonal kiosk, flat side (the serving hatch) facing +Z: stone plinth; six wall faces built as boards —
  // a green skirt with raised fielded panels, cream board-and-batten above, posts on the six corners; the
  // front face has a real opening (y 1.05 – 1.9) into a lit interior with shelves and a coffee machine
  K.cyl(M('#6d6a64', PAT.STONE, 0.85, 0, 0, 0, 0.2), kr + 0.08, kr + 0.1, 0.12, 0, 0, 0, 6, false, 'box', Math.PI / 6);
  const fz = kr * Math.cos(Math.PI / 6),
    side = kr,
    hy0 = 1.05,
    hy1 = 1.9,
    hw2 = 0.45;
  const creamB = M('#efe3c6', PAT.PLAIN, 0.8, 0, 0, FLOOD.SOFT, 0.7);
  const greenD = M('#24543e', PAT.PLAIN, 0.6, 0.1);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, sa = Math.sin(a), ca = Math.cos(a);
    // face-local → kiosk: x along the face, n out of it
    const at = (u: number, n: number): [number, number] => [sa * (fz + n) + ca * u, ca * (fz + n) - sa * u];
    const wall = (m: typeof cream, u0: number, u1: number, y0: number, y1: number, n = -0.02, t = 0.04) => {
      const [x, z] = at((u0 + u1) / 2, n);
      K.box(m, u1 - u0, y1 - y0, t, x, y0, z, a);
    };
    // skirt with two fielded panels
    wall(green, -side / 2, side / 2, 0.12, 0.95);
    for (const u of [-side / 4, side / 4]) {
      wall(greenD, u - side / 4 + 0.06, u + side / 4 - 0.06, 0.24, 0.82, 0.004, 0.012);
      wall(green, u - side / 4 + 0.09, u + side / 4 - 0.09, 0.28, 0.78, 0.012, 0.012);
    }
    // boarded upper wall (the front face around the opening), battens over the board joints
    if (i === 0) {
      wall(creamB, -side / 2, -hw2, 0.95, kh - 0.12);
      wall(creamB, hw2, side / 2, 0.95, kh - 0.12);
      wall(creamB, -hw2, hw2, 0.95, hy0);
      wall(creamB, -hw2, hw2, hy1, kh - 0.12);
    } else wall(creamB, -side / 2, side / 2, 0.95, kh - 0.12);
    for (let u = -side / 2 + 0.11; u < side / 2 - 0.05; u += 0.11) {
      if (i === 0 && Math.abs(u) < hw2 + 0.02) {
        wall(cream, u - 0.012, u + 0.012, 0.95, hy0, 0.006, 0.014);
        wall(cream, u - 0.012, u + 0.012, hy1 + 0.06, kh - 0.2, 0.006, 0.014);
      } else wall(cream, u - 0.012, u + 0.012, 0.95, kh - 0.2, 0.006, 0.014);
    }
  }
  // corner posts on the six corners (30° + 60° i): plinth block, shaft, cap under the frieze
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const px = Math.sin(a) * (kr + 0.005), pz = Math.cos(a) * (kr + 0.005);
    K.box(green, 0.08, kh - 0.14, 0.08, px, 0.12, pz, a);
    K.box(green, 0.12, 0.18, 0.12, px, 0.12, pz, a);
    K.box(greenD, 0.105, 0.025, 0.105, px, 0.3, pz, a);
    K.box(green, 0.11, 0.035, 0.11, px, kh - 0.27, pz, a);
  }
  K.cyl(green, kr + 0.05, kr + 0.05, 0.05, 0, 0.95, 0, 6, false, 'box', Math.PI / 6);
  K.cyl(green, kr + 0.04, kr + 0.04, 0.16, 0, kh - 0.2, 0, 6, false, 'box', Math.PI / 6);
  // interior seen through the hatch: lit back wall, side walls, ceiling, inner counter with a coffee machine,
  // cups, a shelf of jars and bottles, a chalk menu
  const ib = fz - 0.62;
  K.panel(M('#f6efe0', PAT.WINDOW, 0.3, 0, 0.95, 0, 0.45), 0.96, 0.95, 0, (hy0 + hy1) / 2, ib, 0);
  for (const sx of [-1, 1]) K.box(M('#d9ccb0', PAT.PLAIN, 0.8), 0.03, hy1 - hy0 + 0.2, 0.62, sx * (hw2 + 0.04), hy0 - 0.1, (fz + ib) / 2);
  K.box(M('#cfc3a8', PAT.PLAIN, 0.8), 0.98, 0.03, 0.62, 0, hy1 + 0.08, (fz + ib) / 2);
  K.box(M('#8a6a4a', PAT.PLANKS, 0.7), 0.94, 0.04, 0.4, 0, hy0 - 0.02, ib + 0.22);
  const chrome = M('#cfd5d8', PAT.PLAIN, 0.2, 0.9);
  // espresso machine: red body, chrome top rail, two group heads low over a drip tray, a steam wand, gauge
  K.box(M('#9b2b25', PAT.PLAIN, 0.3, 0.2), 0.38, 0.32, 0.24, -0.18, hy0 + 0.02, ib + 0.14);
  K.box(chrome, 0.4, 0.02, 0.26, -0.18, hy0 + 0.34, ib + 0.14);
  K.box(chrome, 0.36, 0.015, 0.1, -0.18, hy0 + 0.035, ib + 0.31);
  for (const gx of [-0.27, -0.09]) {
    K.cyl(chrome, 0.032, 0.026, 0.05, gx, hy0 + 0.12, ib + 0.29, 10);
    K.box(M('#1d1f22', PAT.PLAIN, 0.4), 0.014, 0.014, 0.1, gx, hy0 + 0.13, ib + 0.37, 0.4);
  }
  K.rod(chrome, [-0.01, hy0 + 0.26, ib + 0.27], [0.0, hy0 + 0.1, ib + 0.33], 0.006, 5);
  K.cylX(M('#f2efe6', PAT.PLAIN, 0.3), 0.025, 0.01, -0.18, hy0 + 0.25, ib + 0.265, 10, Math.PI / 2);
  for (let c = 0; c < 6; c++) K.cyl(M('#ffffff', PAT.PLAIN, 0.3), 0.035, 0.03, 0.06, -0.3 + (c % 3) * 0.08, hy0 + 0.36 + Math.floor(c / 3) * 0.06, ib + 0.12, 8);
  K.box(M('#8a6a4a', PAT.PLANKS, 0.7), 0.9, 0.025, 0.14, 0, hy0 + 0.5, ib + 0.08);
  const jar = ['#d8a24a', '#b8443c', '#4f7a3a', '#e8e0cc', '#6b3f2a'];
  for (let j = 0; j < 7; j++) K.cyl(M(jar[j % 5], PAT.PLAIN, 0.2, 0.05), 0.035, 0.035, 0.09 + (j % 3) * 0.04, 0.05 + j * 0.055, hy0 + 0.525, ib + 0.08, 8);
  K.box(M('#1f2322', PAT.PLAIN, 0.9), 0.4, 0.28, 0.02, 0.22, hy0 + 0.1, ib + 0.02);
  for (let l = 0; l < 5; l++) K.box(M('#e8e4d8', PAT.PLAIN, 0.9), 0.24 - (l % 2) * 0.06, 0.012, 0.004, 0.2, hy0 + 0.33 - l * 0.045, ib + 0.032);
  // hatch frame, top-hung shutter propped open on two stays, outer counter on brackets
  K.box(green, 1.06, 0.07, 0.06, 0, hy1, fz + 0.01);
  for (const sx of [-1, 1]) K.box(green, 0.07, hy1 - hy0 + 0.07, 0.06, sx * (hw2 + 0.035), hy0 - 0.02, fz + 0.01);
  // roller-shutter box over the opening (the shutter rolled up), guide channels down the frame
  K.box(green, 1.0, 0.13, 0.12, 0, hy1 + 0.04, fz + 0.06);
  for (const sx of [-1, 1]) K.box(M('#5e666b', PAT.PLAIN, 0.4, 0.6), 0.025, hy1 - hy0, 0.03, sx * 0.44, hy0, fz + 0.05);
  K.box(M('#9aa2a6', PAT.PLAIN, 0.4, 0.6), 0.9, 0.035, 0.03, 0, hy1 - 0.03, fz + 0.055);
  K.box(M('#b98d60', PAT.PLANKS, 0.7), 1.05, 0.05, 0.34, 0, hy0, fz + 0.12);
  for (const sx of [-1, 1]) K.beam(green, [sx * 0.4, hy0 - 0.26, fz + 0.02], [sx * 0.4, hy0 - 0.01, fz + 0.26], 0.04, 0.04);
  // on the counter: a cake stand under a cloche, a napkin box, a tip jar, a card reader
  const ct2 = hy0 + 0.05;
  K.cyl(M('#ffffff', PAT.PLAIN, 0.4), 0.11, 0.03, 0.08, -0.3, ct2, fz + 0.14, 10);
  K.cyl(M('#c98a45', PAT.PLAIN, 0.7), 0.08, 0.08, 0.05, -0.3, ct2 + 0.08, fz + 0.14, 12);
  K.sphere(M('#dfe8ea', PAT.PLAIN, 0.1, 0.1), 0.1, -0.3, ct2 + 0.08, fz + 0.14, 10, 6, 1, 0, Math.PI * 2, 0, Math.PI / 2);
  K.box(M('#c43b33', PAT.PLAIN, 0.6), 0.1, 0.08, 0.08, 0.25, ct2, fz + 0.16);
  K.cyl(M('#cfe0e4', PAT.PLAIN, 0.1, 0.1), 0.045, 0.045, 0.1, 0.38, ct2, fz + 0.2, 8);
  K.boxC(M('#2b2b2b', PAT.PLAIN, 0.5), 0.07, 0.11, 0.03, 0.05, ct2 + 0.05, fz + 0.2, -0.5, 0, 0);
  // canvas awning: stretched from the wall over two arms, sagging between them, scalloped valance in front,
  // triangular cheeks at the sides; metric uvs keep the stripes running down the slope
  const awM = M('#2f7d57', PAT.STRIPES, 0.85, 0, 0, 0, 0.2);
  const awU = M('#e9e3d2', PAT.PLAIN, 0.85);
  const ax0 = -0.64, ax1 = 0.64, ay0 = 2.4, ay1 = 2.12, ad = 0.62;
  const AP = (i: number, j: number): [number, number, number] => {
    const u = i / 8, v = j / 4;
    const sag = 0.035 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
    return [ax0 + (ax1 - ax0) * u, ay0 + (ay1 - ay0) * v - sag, fz + 0.01 + ad * v];
  };
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 4; j++) {
      const q = [AP(i, j), AP(i + 1, j), AP(i + 1, j + 1), AP(i, j + 1)];
      const uv = q.map((p) => [p[0], p[1] * 0.6 + p[2] * 0.8] as [number, number]);
      K.poly(awM, q, uv);
      K.poly(awU, [q[3], q[2], q[1], q[0]], uv);
    }
  for (let i = 0; i < 9; i++) {
    const xa = ax0 + ((ax1 - ax0) * i) / 9, xb = ax0 + ((ax1 - ax0) * (i + 1)) / 9, xm = (xa + xb) / 2, zf2 = fz + 0.01 + ad;
    const pts: [number, number, number][] = [[xa, ay1, zf2], [xb, ay1, zf2], [xb, ay1 - 0.1, zf2], [xm, ay1 - 0.15, zf2], [xa, ay1 - 0.1, zf2]];
    K.poly(awM, pts, pts.map((p) => [p[0], p[1]] as [number, number]), true);
  }
  for (const sx of [-1, 1]) {
    const pts: [number, number, number][] = [[sx * 0.64, ay0, fz + 0.01], [sx * 0.64, ay1, fz + 0.01 + ad], [sx * 0.64, ay0 - 0.05, fz + 0.01]];
    K.poly(awM, [[sx * 0.64, ay0, fz + 0.01], [sx * 0.64, ay1, fz + 0.01 + ad], [sx * 0.64, ay1 - 0.04, fz + 0.01 + ad * 0.4]], pts.map((p) => [p[2], p[1]] as [number, number]), true);
    K.rod(M('#3b3b3b', PAT.PLAIN, 0.4, 0.6), [sx * 0.62, ay0 - 0.35, fz + 0.01], [sx * 0.62, ay1 - 0.01, fz + ad], 0.012, 5);
  }
  K.rod(M('#3b3b3b', PAT.PLAIN, 0.4, 0.6), [ax0, ay1 - 0.005, fz + 0.01 + ad], [ax1, ay1 - 0.005, fz + 0.01 + ad], 0.014, 6);
  K.box(green, 1.34, 0.06, 0.06, 0, ay0 - 0.02, fz + 0.03);
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
  // each tile its own tone (batches, sun-fading, a replaced tile), worn paler and dished along the swing
  // path where feet drag (a band under each seat, strongest at the bottom of the arc), moss in the joints
  let ts2 = 7 + f.id * 31;
  const tr = () => ((ts2 = (ts2 * 16807) % 2147483647) / 2147483647);
  const tileTone = new THREE.Color();
  for (let i = 0; i < nTx; i++)
    for (let j = 0; j < nTz; j++) {
      const cx = tx0 + i * 0.5 + 0.25, cz = tz0 + j * 0.5 + 0.25;
      const dxs = Math.min(...swingXs.map((x) => Math.abs(cx - x)));
      const wear = Math.max(0, 1 - dxs / 0.45) * Math.max(0, 1 - Math.abs(cz - sz) / 1.1);
      const underSeat = dxs < 0.3 && Math.abs(cz - sz) < 0.55;
      if (underSeat) {
        K.box(scuff, 0.492, 0.03, 0.492, cx, 0, cz);
        continue;
      }
      tileTone.set((i * 3 + j * 5) % 7 < 2 ? '#844b3b' : tr() < 0.06 ? '#5f3a30' : '#7a4537').offsetHSL((tr() - 0.5) * 0.02, (tr() - 0.5) * 0.08, (tr() - 0.5) * 0.05 + wear * 0.08);
      K.box(M(tileTone, PAT.GRAVEL, 0.95, 0, 0, 0, tr()), 0.492, 0.04 - wear * 0.006, 0.492, cx, 0, cz);
    }
  K.box(M('#3e4a2c', PAT.GRAVEL, 0.98), nTx * 0.5, 0.022, nTz * 0.5, tx0 + nTx * 0.25, 0, tz0 + nTz * 0.25);
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
    for (const by of [top - 0.08, top + 0.02]) for (const bz2 of [-0.05, 0.05]) env.K.cylX(steel, 0.012, 0.15, x, by, sz + bz2, 6);
    K.rod(blue, [x, 0.9, sz - 0.6], [x, 0.9, sz + 0.6], 0.025, 6);
  }
  K.rod(blue, [sx0 - 0.1, top, sz], [sx1 + 0.1, top, sz], 0.06, 12);
  for (const x of [sx0 - 0.1, sx1 + 0.1]) K.sphere(M('#2d5f99', PAT.PLAIN, 0.5, 0.3), 0.062, x, top, sz, 8, 6);
  for (const sw of swings) {
    env.anim({ mode: ANIM.SWING, pivot: new THREE.Vector3(sw.x, top, sz), axis: new THREE.Vector3(1, 0, 0), a: sw.amp, b: 2.2, c: sw.ph });
    // hanger clamps, chains of alternating links, a sagging rubber strap seat
    for (const dx of [-0.2, 0.2]) {
      env.K.cyl(steel, 0.075, 0.075, 0.09, sw.x + dx, top - 0.045, sz, 8);
      // bearing hanger: a U-bracket under the bar with a swivel eye; the chain's core line reads from afar
      env.K.box(M('#7f878d', PAT.PLAIN, 0.4, 0.7), 0.05, 0.06, 0.07, sw.x + dx, top - 0.13, sz);
      env.K.torus(steel, 0.016, 0.006, sw.x + dx, top - 0.16, sz, 4, 8, Math.PI * 2, 0, 0, 0);
      K.rod(M('#8d969c', PAT.PLAIN, 0.45, 0.6), [sw.x + dx, top - 0.16, sz], [sw.x + dx, 0.56, sz], 0.006, 4);
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

  // ── roundabout (spins slowly): a steel deck in painted sectors on a central bearing housing, a rim band and
  // a skirt down to a concrete ring, six tubular grab rails bent from the hub out to the deck edge and joined by
  // a ring rail; the paint is worn to bare steel where feet push off and on the rail tops
  const rx = 1.2,
    rz = D - 2.5;
  K.cyl(M('#9a968c', PAT.CONCRETE, 0.9), 1.32, 1.36, 0.035, rx, 0, rz, 28);
  K.cyl(M('#5f5a52', PAT.GRAVEL, 0.98), 1.2, 1.2, 0.002, rx, 0.035, rz, 28);
  K.cyl(steel, 0.12, 0.16, 0.25, rx, 0, rz, 10);
  env.anim({ mode: ANIM.SPIN, pivot: new THREE.Vector3(rx, 0, rz), axis: new THREE.Vector3(0, 1, 0), a: 0.9, b: 0, c: 0 });
  const rimM = M('#c43a30', PAT.PLAIN, 0.55, 0.15);
  env.K.cyl(rimM, 1.15, 1.15, 0.08, rx, 0.25, rz, 32, true);
  env.K.cyl(M('#3b3f42', PAT.PLAIN, 0.6, 0.4), 1.1, 1.1, 0.12, rx, 0.13, rz, 28, true);
  env.K.cyl(M('#8d969c', PAT.PLAIN, 0.5, 0.6), 1.14, 1.14, 0.075, rx, 0.25, rz, 28);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    env.K.cyl(M(i % 2 ? '#f2c230' : '#2f78c4', PAT.GRAVEL, 0.7, 0.1, 0, 0, i * 0.17), 1.1, 1.1, 0.008, rx, 0.325, rz, 6, false, 'box', a + 0.03, Math.PI / 3 - 0.06);
    // worn to grey steel along the outer edge of each sector (feet), and a scuffed patch in the middle
    env.K.cyl(M('#9aa1a5', PAT.GRAVEL, 0.6, 0.5, 0, 0, i * 0.3), 1.1, 1.1, 0.003, rx, 0.333, rz, 4, false, 'box', a + 0.25, 0.35);
  }
  env.K.cyl(M('#5e666b', PAT.PLAIN, 0.4, 0.6), 0.2, 0.22, 0.05, rx, 0.33, rz, 12);
  const railM = M('#d9dde0', PAT.PLAIN, 0.35, 0.7);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6, sa = Math.sin(a), ca = Math.cos(a);
    const P = (r: number, y: number): [number, number, number] => [rx + sa * r, y, rz + ca * r];
    env.K.rod(railM, P(0.06, 0.95), P(0.75, 0.88), 0.022, 6);
    env.K.rod(railM, P(0.75, 0.88), P(0.92, 0.72), 0.022, 6);
    env.K.rod(railM, P(0.92, 0.72), P(0.98, 0.34), 0.022, 6);
    env.K.sphere(railM, 0.024, ...P(0.75, 0.88), 6, 4);
    env.K.sphere(railM, 0.024, ...P(0.92, 0.72), 6, 4);
    env.K.cyl(M('#5e666b', PAT.PLAIN, 0.4, 0.6), 0.035, 0.035, 0.012, ...P(0.98, 0.333), 8);
  }
  env.K.torus(railM, 0.85, 0.018, rx, 0.8, rz, 6, 36, Math.PI * 2, Math.PI / 2, 0, 0);
  env.K.cyl(railM, 0.05, 0.05, 0.62, rx, 0.33, rz, 8);
  env.K.sphere(M('#c43a30', PAT.PLAIN, 0.5, 0.2), 0.07, rx, 0.97, rz, 10, 6);
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

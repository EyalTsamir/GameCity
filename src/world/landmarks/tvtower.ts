// 'Skyline Tower' — 150 m TV tower: glazed entrance pavilion, tapering concrete shaft with
// lift rails, a pod with a slowly rotating restaurant ring, an observation deck with a
// balcony, a domed cap, antenna platform with dish antennas and a red/white mast.
// Night: colour-cycling uplight on the shaft, warm glazing, a chase-light ring around the
// pod rim and blinking aviation lights.

import * as THREE from 'three';
import type { Lot } from '../../core/plan';
import { DIR_YAW } from '../../core/geom';
import { ANIM, FLOOD, LM, LMODE, M, PAT } from './builder';
import { C, S, railing } from './parts';
import type { Env } from './env';
import { drawText, signQuad } from './signs';

export function genTvTower(env: Env, lot: Lot): void {
  const fp = lot.footprint;
  const cx = (fp.x0 + fp.x1) / 2,
    cz = (fp.z0 + fp.z1) / 2;
  const yaw = DIR_YAW[lot.front];
  env.begin(cx, 0, cz, yaw);
  env.checkLot(fp, 'tvtower');
  const K = env.S;
  const H = lot.height || 150;
  const R0 = Math.min(fp.x1 - fp.x0, fp.z1 - fp.z0) / 2 - 0.25; // pavilion radius

  const concrete = M('#d4d2cc', PAT.CONCRETE, 0.85, 0, 0, FLOOD.TOWER, 0.2);
  const white = M('#f2f2ef', PAT.PANELS, 0.5, 0.2, 0, 0, 0.3);
  const glass = M('#2c3c45', PAT.GLAZING, 0.2, 0.3, 0.8, 0, 0.7);
  const steel = M('#b9c1c7', PAT.PLAIN, 0.4, 0.6);
  const dark = M('#3a4046', PAT.PLAIN, 0.6, 0.4);

  // ── entrance pavilion
  K.cyl(M(C.granite, PAT.STONE, 0.8, 0, 0, 0, 0.2), R0, R0, 0.4, 0, 0, 0, 40);
  K.cyl(glass, R0 - 0.4, R0 - 0.4, 3.6, 0, 0.4, 0, 40, true);
  // mullion fins
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    K.box(steel, 0.12, 3.6, 0.3, Math.sin(a) * (R0 - 0.35), 0.4, Math.cos(a) * (R0 - 0.35), a);
  }
  K.cyl(white, R0, R0 - 0.1, 0.6, 0, 4.0, 0, 40);
  K.cyl(M('#c9ccc8', PAT.PLAIN, 0.8), R0 - 0.3, R0 - 0.3, 0.1, 0, 4.6, 0, 40);
  // entrance canopy + door (front = local +Z)
  K.box(white, 3.4, 0.25, 1.6, 0, 3.2, R0 - 0.6);
  K.panel(M('#2c3c45', PAT.DOOR, 0.3, 0.2, 0.9, 0, 0.2), 2.0, 2.6, 0, 0.4, R0 - 0.38, 0);
  const signR = env.atlas.add(512, 64, (g, w, h) => {
    g.fillStyle = '#1e2b44';
    g.fillRect(0, 0, w, h);
    drawText(g, (lot.name ?? 'Skyline Tower').toUpperCase(), w / 2, h / 2 + 2, 'bold 40px "Trebuchet MS", Arial, sans-serif', '#9fe1ff', 7);
  });
  signQuad(env.T, signR, 4.2, 0.52, 0, 4.03, R0 + 0.01, 0, 1.2);
  env.L.box(LM('#fff3dc', LMODE.NIGHT, 2.0, 0, 0), 2.6, 0.05, 0.9, 0, 3.17, R0 - 0.5);
  env.glow(0, 0.1, R0 + 0.8, { size: 2.4, kind: 'pool', color: '#ffe2b5', intensity: 0.35 });

  // ── shaft (smooth tapering lathe) with lift rails
  const yPod = H * 0.635; // ~95 m
  const rB = 2.9,
    rT = 1.75;
  const prof: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    prof.push([rB + (rT - rB) * Math.pow(t, 0.75), 4.6 + t * (yPod - 4.6)]);
  }
  K.lathe(concrete, prof, 0, 0, 0, 28);
  for (const a of [0, Math.PI]) {
    // two lift rails as slim vertical strips following the taper
    for (let i = 0; i < 8; i++) {
      const [r0, y0] = prof[i],
        [r1, y1] = prof[i + 1];
      env.S.beam(M('#a9aeb2', PAT.PLAIN, 0.5, 0.5), [Math.sin(a + 0.3) * (r0 + 0.08), y0, Math.cos(a + 0.3) * (r0 + 0.08)], [Math.sin(a + 0.3) * (r1 + 0.08), y1, Math.cos(a + 0.3) * (r1 + 0.08)], 0.22, 0.12);
    }
  }
  // service rings on the shaft
  for (const yy of [32, 64]) {
    const t = (yy - 4.6) / (yPod - 4.6);
    const r = rB + (rT - rB) * Math.pow(t, 0.75);
    K.cyl(white, r + 0.35, r + 0.35, 0.5, 0, yy, 0, 28);
    env.L.cyl(LM('#ff2a1a', LMODE.BLINK, 4.0, yy * 0.013, 0.25), r + 0.38, r + 0.38, 0.12, 0, yy + 0.19, 0, 16, true);
  }

  // ── pod
  const y0 = yPod;
  K.lathe(
    white,
    [
      [rT - 0.05, y0 - 0.5],
      [2.6, y0 + 0.6],
      [4.3, y0 + 2.4],
      [5.6, y0 + 4.2],
      [6.1, y0 + 4.9],
    ],
    0,
    0,
    0,
    40,
  );
  // restaurant ring (rotating): glazed band with mullions + ceiling/floor lips
  const yR = y0 + 4.9;
  env.anim({ mode: ANIM.SPIN_U, pivot: new THREE.Vector3(0, 0, 0), axis: new THREE.Vector3(0, 1, 0), a: 1, b: 0, c: 0 });
  env.K.cyl(M('#33424b', PAT.GLAZING, 0.15, 0.3, 0.9, 0, 0.8), 6.05, 6.05, 3.0, 0, yR, 0, 48, true);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    env.K.box(M('#e8eaec', PAT.PLAIN, 0.5, 0.3), 0.14, 3.0, 0.16, Math.sin(a) * 6.08, yR, Math.cos(a) * 6.08, a);
  }
  // warm table lights inside the ring (visible through the glass at night)
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.1;
    env.L.sphere(LM('#ffcf8a', LMODE.NIGHT, 2.4, 0, 0.0), 0.16, Math.sin(a) * 5.4, yR + 1.0, Math.cos(a) * 5.4, 6, 4);
  }
  env.anim(null);
  K.cyl(white, 6.2, 6.2, 0.35, 0, yR + 3.0, 0, 48);
  // chase-light ring on the rim
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const g = new THREE.BoxGeometry(0.42, 0.14, 0.06);
    const pu = new Float32Array(24 * 2).fill(i / 48);
    g.setAttribute('uv', new THREE.BufferAttribute(pu, 2));
    env.L.geo(LM('#8fe3ff', LMODE.CHASE, 3.5, 0, 0), g, Math.sin(a) * 6.22, yR + 3.17, Math.cos(a) * 6.22, a, 'native');
    g.dispose();
  }
  // observation deck (static) with a balcony and railing
  const yO = yR + 3.35;
  K.cyl(glass, 5.6, 5.75, 2.9, 0, yO, 0, 40, true);
  K.cyl(white, 6.6, 6.6, 0.22, 0, yO - 0.02, 0, 48);
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * Math.PI * 2,
      a1 = ((i + 1) / 24) * Math.PI * 2;
    railing(env, [Math.sin(a0) * 6.52, yO + 0.2, Math.cos(a0) * 6.52], [Math.sin(a1) * 6.52, yO + 0.2, Math.cos(a1) * 6.52], 1.05, '#e3e6e8');
  }
  // domed cap
  K.lathe(
    white,
    [
      [5.85, yO + 2.85],
      [5.7, yO + 3.3],
      [5.0, yO + 3.9],
      [3.6, yO + 4.4],
      [2.0, yO + 4.7],
      [1.3, yO + 4.75],
    ],
    0,
    0,
    0,
    40,
  );
  // ── antenna platform + dishes
  const yA = yO + 4.7;
  K.cyl(concrete, 1.25, 1.35, 9.0, 0, yA, 0, 20);
  for (const yy of [yA + 3.2, yA + 6.5]) {
    K.cyl(white, 2.1, 2.1, 0.2, 0, yy, 0, 24);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + yy;
      K.disc(M('#e9ecee', PAT.PLAIN, 0.4, 0.3), 0.55, 0.38, Math.sin(a) * 1.65, yy + 0.75, Math.cos(a) * 1.65, a, 14, 0.42);
    }
  }
  // ── mast: red/white bands
  const mY0 = yA + 9.0;
  const mLen = H - mY0;
  const bands = 8;
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands,
      t1 = (i + 1) / bands;
    const r0 = 0.62 - 0.45 * t0,
      r1 = 0.62 - 0.45 * t1;
    K.cyl(M(i % 2 ? '#f2f2ef' : '#d33a2c', PAT.PLAIN, 0.5, 0.3), r1, r0, mLen / bands, 0, mY0 + t0 * mLen, 0, 10);
  }
  // aviation lights: blinking red at night (dim by day), white strobe on the very top
  for (const [yy, rr] of [
    [mY0 + 0.3, 0.75],
    [mY0 + mLen * 0.5, 0.45],
    [H - 0.2, 0.25],
  ] as [number, number][]) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      env.L.sphere(LM('#ff2a1a', LMODE.BLINK, 6.0, 0.37, 0.3), 0.16, Math.sin(a) * rr, yy, Math.cos(a) * rr, 6, 4);
    }
    env.glow(0, yy, 0, { size: 2.6, kind: 'halo', color: '#ff3a24', intensity: 1.0, mode: 1, phase: 0.37 });
  }
  env.L.sphere(LM('#ffffff', LMODE.STROBE, 8.0, 0.11, 0.5), 0.18, 0, H + 0.25, 0, 6, 4);
  // pod glow + shaft accent at night
  env.glow(0, yR + 1.5, 0, { size: 14, kind: 'halo', color: '#ffd6a0', intensity: 0.09 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    env.glow(Math.sin(a) * 4.4, 4.7, Math.cos(a) * 4.4, { size: 1.2, kind: 'beam', color: '#9fd8ff', intensity: 0.18, dir: [-Math.sin(a) * 1.6, 60, -Math.cos(a) * 1.6], endSize: 3.5 });
  }

  env.endChecks();
  env.pick(lot.id, lot.name ?? 'Skyline Tower', env.boxLocal(-7, 0, -7, 7, H, 7), () => {
    const h = env.hours();
    const open = h >= 10 && h < 23;
    return [`${Math.round(H)} m TV tower · observation deck at ${Math.round(yO)} m`, open ? 'Revolving restaurant open · one turn every 90 s' : 'Closed · opens 10:00', 'Blinking aviation lights on the mast'];
  });
  void S;
}

/** Restaurant ring rotation (uSpin.x): one turn every 90 sim seconds. */
export function tvTowerUpdater(env: Env): (dt: number) => void {
  return (dt: number) => {
    env.u.uSpin.value.x = (env.u.uSpin.value.x + (dt * Math.PI * 2) / 90) % (Math.PI * 2);
  };
}

// Industrial landmarks of Northgate: the water tower (lot 'watertower'), the brickworks'
// factory chimneys (features 'chimney' — ambient's smoke plumes start at height + 0.4, so the
// rim sits right there) and the storage tanks (feature 'tanks').

import * as THREE from 'three';
import type { Feature, Lot } from '../../core/plan';
import { FLOOD, LM, LMODE, M, PAT } from './builder';
import { V3 } from './kit';
import { C, finial, railing } from './parts';
import type { Env } from './env';
import { drawText, signCylinder, signQuad } from './signs';

export function genWaterTower(env: Env, lot: Lot): void {
  const fp = lot.footprint;
  const cx = (fp.x0 + fp.x1) / 2,
    cz = (fp.z0 + fp.z1) / 2;
  env.begin(cx, 0, cz, 0);
  env.checkLot(fp, 'watertower');
  const K = env.S;
  const half = Math.min(fp.x1 - fp.x0, fp.z1 - fp.z0) / 2;
  const H = lot.height || 24;
  const steel = M('#5f6f6a', PAT.PLAIN, 0.5, 0.6);
  const tankM = M('#4f9a8c', PAT.SEAM, 0.5, 0.35, 0, 0, 0.2);
  const roofM = M('#3f7d72', PAT.SEAM, 0.45, 0.35, 0, 0, 0.6);
  const concrete = M(C.concrete, PAT.CONCRETE, 0.9, 0, 0, 0, 0.3);
  const tankBottom = H * 0.6; // 14.4
  const tankTop = H * 0.86; // 20.6
  const legR = half - 0.45; // leg feet on a circle
  const topR = 2.3; // legs converge slightly
  // footings + legs (four tubes) + ring braces + X bracing
  const feet: V3[] = [];
  const heads: V3[] = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const fx = Math.sin(a) * legR,
      fz = Math.cos(a) * legR;
    K.box(concrete, 0.9, 0.5, 0.9, fx, 0, fz);
    feet.push([fx, 0.5, fz]);
    heads.push([Math.sin(a) * topR, tankBottom + 0.2, Math.cos(a) * topR]);
    K.rod(steel, [fx, 0.5, fz], heads[i], 0.17, 8);
  }
  const at = (i: number, t: number): V3 => [feet[i][0] + (heads[i][0] - feet[i][0]) * t, feet[i][1] + (heads[i][1] - feet[i][1]) * t, feet[i][2] + (heads[i][2] - feet[i][2]) * t];
  const levels = [0.0, 0.36, 0.7, 1.0];
  for (let l = 1; l < levels.length - 1; l++) for (let i = 0; i < 4; i++) K.rod(steel, at(i, levels[l]), at((i + 1) % 4, levels[l]), 0.07, 6);
  for (let l = 0; l < levels.length - 1; l++)
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      K.rod(steel, at(i, levels[l] + 0.02), at(j, levels[l + 1] - 0.02), 0.035, 4);
      K.rod(steel, at(j, levels[l] + 0.02), at(i, levels[l + 1] - 0.02), 0.035, 4);
    }
  // riser pipe
  K.cyl(M('#7d8c87', PAT.PLAIN, 0.5, 0.5), 0.32, 0.32, tankBottom - 0.6, 0, 0, 0, 10);
  // tank: conical bottom, cylinder with bands, conical roof, finial and vent
  const tr = Math.min(half + 0.4, 3.9);
  K.lathe(
    tankM,
    [
      [0.4, tankBottom - 1.4],
      [tr * 0.55, tankBottom - 0.8],
      [tr, tankBottom],
    ],
    0,
    0,
    0,
    32,
  );
  K.cyl(tankM, tr, tr, tankTop - tankBottom, 0, tankBottom, 0, 40, true);
  for (const yy of [tankBottom + 0.1, tankBottom + (tankTop - tankBottom) * 0.5, tankTop - 0.25]) K.cyl(M('#3c4a46', PAT.PLAIN, 0.5, 0.6), tr + 0.05, tr + 0.05, 0.16, 0, yy, 0, 40, true);
  K.lathe(
    roofM,
    [
      [tr + 0.25, tankTop],
      [tr + 0.2, tankTop + 0.12],
      [tr * 0.55, tankTop + 1.6],
      [0.5, tankTop + 2.7],
      [0.0, tankTop + 2.8],
    ],
    0,
    0,
    0,
    32,
  );
  finial(K, M('#d0d6d3', PAT.PLAIN, 0.4, 0.6), 0, tankTop + 2.75, 0, 0.9, 0.1);
  K.cyl(M('#7d8c87', PAT.PLAIN, 0.5, 0.5), 0.25, 0.25, 0.5, 1.2, tankTop + 1.75, 0.6, 8);
  K.cone(M('#7d8c87', PAT.PLAIN, 0.5, 0.5), 0.36, 0.25, 1.2, tankTop + 2.25, 0.6, 8);
  // catwalk with railing around the tank base
  K.cyl(M('#56635f', PAT.CORRUGATED, 0.6, 0.5), tr + 0.75, tr + 0.75, 0.12, 0, tankBottom - 0.15, 0, 40);
  for (let i = 0; i < 20; i++) {
    const a0 = (i / 20) * Math.PI * 2,
      a1 = ((i + 1) / 20) * Math.PI * 2;
    railing(env, [Math.sin(a0) * (tr + 0.7), tankBottom - 0.03, Math.cos(a0) * (tr + 0.7)], [Math.sin(a1) * (tr + 0.7), tankBottom - 0.03, Math.cos(a1) * (tr + 0.7)], 1.0, '#3c4a46');
  }
  // ladder up one leg and the tank side
  const la = Math.PI / 4;
  const ldx = Math.sin(la),
    ldz = Math.cos(la);
  for (const off of [-0.22, 0.22]) {
    const ox = ldz * off,
      oz = -ldx * off;
    K.rod(M('#3c4a46', PAT.PLAIN, 0.5, 0.6), [feet[0][0] + ox, 0.5, feet[0][2] + oz], [heads[0][0] + ox, tankBottom - 0.15, heads[0][2] + oz], 0.025, 4);
  }
  for (let y = 1; y < tankBottom - 0.3; y += 0.55) {
    const p = at(0, (y - 0.5) / (tankBottom - 0.35));
    K.rod(M('#3c4a46', PAT.PLAIN, 0.5, 0.6), [p[0] + ldz * -0.22, y, p[2] - ldx * -0.22], [p[0] + ldz * 0.22, y, p[2] - ldx * 0.22], 0.018, 4);
  }
  // lettering wrapped around the tank, facing the city (south) and the rail line (north)
  const word = env.atlas.add(512, 72, (g, w, h) => {
    g.fillStyle = '#efe6cf';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f6f63';
    g.fillRect(0, 4, w, 4);
    g.fillRect(0, h - 8, w, 4);
    drawText(g, 'TINYHAVEN', w / 2, h / 2 + 2, 'bold 50px "Arial Black", Arial, sans-serif', '#2f6f63', 6);
  });
  const sh = 1.15;
  const sy = tankBottom + (tankTop - tankBottom) * 0.5 - sh / 2 + 0.6;
  signCylinder(env.T, word, tr + 0.03, sh, 0, sy, 0, -0.95, 0.95, 16, 0.25);
  signCylinder(env.T, word, tr + 0.03, sh, 0, sy, 0, Math.PI - 0.95, Math.PI + 0.95, 16, 0.25);
  // night: aviation light on top, spotlights on the lettering
  env.L.sphere(LM('#ff2a1a', LMODE.BLINK, 5.0, 0.62, 0.25), 0.14, 0, tankTop + 3.75, 0, 6, 4);
  env.glow(0, tankTop + 3.75, 0, { size: 1.8, kind: 'halo', color: '#ff3a24', intensity: 0.9, mode: 1, phase: 0.62 });
  for (const s of [-1, 1]) {
    env.glow(0, tankBottom, s * (tr + 0.6), { size: 0.35, kind: 'beam', color: '#ffe6bf', intensity: 0.2, dir: [0, tankTop - tankBottom - 0.6, s * 0.2], endSize: 2.4 });
  }
  env.endChecks();
  env.pick(lot.id, lot.name ?? 'Water tower', env.boxLocal(-half, 0, -half, half, tankTop + 3.8, half), () => ['Northgate water tower · 1912', '400 m³ of drinking water', 'Keeps the pressure up in the hills']);
}

export function genChimney(env: Env, f: Feature, index: number): void {
  const H = Number(f.params?.height ?? 30);
  const R = Number(f.params?.radius ?? 1.5);
  const ground = Math.max(0, env.ctx.plan.heightAt(f.x, f.z));
  env.begin(f.x, ground, f.z, 0);
  const lim = f.radius > 0 ? f.radius : R + 0.6;
  env.checkRadius(f.x, f.z, lim, 'chimney');
  const K = env.S;
  const brick = M(index % 2 ? '#a65438' : '#9b4b33', PAT.BRICK, 0.92, 0, 0, FLOOD.WARM, 0.35 + index * 0.2);
  const dark = M('#6e3324', PAT.BRICK, 0.92, 0, 0, 0, 0.7);
  const soot = M('#2b2622', PAT.PLAIN, 0.95);
  const iron = M('#2c2f30', PAT.PLAIN, 0.5, 0.6);
  // octagonal pedestal (stays inside the solid radius) with a stone cap
  const pr = Math.min(lim - 0.08, R + 0.45);
  const pH = Math.min(5, H * 0.13);
  K.cyl(dark, pr * 0.97, pr, pH, 0, 0, 0, 8, false, 'box', Math.PI / 8);
  K.cyl(M('#cbbd9f', PAT.STONE, 0.85, 0, 0, 0, 0.2), pr * 0.99, pr * 0.99, 0.3, 0, pH, 0, 8, false, 'box', Math.PI / 8);
  K.box(M('#3a2c25', PAT.PLAIN, 0.8), 0.9, 1.6, 0.1, 0, 0, pr * 0.93);
  // tapered stack in segments with darker bands
  const rimY = H + 0.35;
  const r0 = R,
    r1 = R * 0.7;
  const segs = 6;
  const y0 = pH + 0.3;
  const capY = rimY - 1.4;
  for (let i = 0; i < segs; i++) {
    const a = i / segs,
      b = (i + 1) / segs;
    const ya = y0 + (capY - y0) * a,
      yb = y0 + (capY - y0) * b;
    const ra = r0 + (r1 - r0) * a,
      rb = r0 + (r1 - r0) * b;
    K.cyl(brick, rb, ra, yb - ya, 0, ya, 0, 24, true);
    // band (slightly proud) at each segment joint
    if (i > 0) K.cyl(i % 2 ? dark : iron, ra + 0.04, ra + 0.04, i % 2 ? 0.5 : 0.12, 0, ya - 0.06, 0, 24, true);
  }
  // corbelled top + soot
  K.cyl(dark, r1 + 0.22, r1, 0.5, 0, capY, 0, 24, true);
  K.cyl(dark, r1 + 0.22, r1 + 0.22, 0.6, 0, capY + 0.5, 0, 24, true);
  K.cyl(soot, r1 + 0.18, r1 + 0.22, rimY - capY - 1.1, 0, capY + 1.1, 0, 24, true);
  // rim (hollow top: dark inner ring)
  K.lathe(
    soot,
    [
      [r1 - 0.05, rimY - 0.5],
      [r1 - 0.05, rimY],
      [r1 + 0.18, rimY],
    ].reverse() as [number, number][],
    0,
    0,
    0,
    24,
  );
  K.cyl(M('#120f0e', PAT.PLAIN, 1), r1 - 0.05, r1 - 0.05, 0.02, 0, rimY - 0.5, 0, 20);
  // ladder rungs + lightning rod
  const lx = 0,
    lzOff = (t: number) => r0 + (r1 - r0) * t + 0.12;
  for (let y = y0 + 0.5; y < capY; y += 0.6) {
    const t = (y - y0) / (capY - y0);
    K.box(iron, 0.45, 0.04, 0.04, lx, y, lzOff(t));
  }
  K.rod(iron, [0.3, y0, lzOff(0) + 0.04], [0.3, rimY, lzOff(1) + 0.05], 0.03, 4);
  K.rod(iron, [-0.3, y0, lzOff(0) + 0.04], [-0.3, capY, lzOff(1) + 0.05], 0.03, 4);
  K.cyl(iron, 0.02, 0.02, 2.2, 0.0, rimY, r1 + 0.1, 4);
  // aviation light on the tall stack
  if (H > 34) {
    env.L.sphere(LM('#ff2a1a', LMODE.BLINK, 5.5, 0.15 + index * 0.31, 0.25), 0.13, r1 + 0.2, capY + 0.9, 0, 6, 4);
    env.glow(r1 + 0.2, capY + 0.9, 0, { size: 1.6, kind: 'halo', color: '#ff3a24', intensity: 0.9, mode: 1, phase: 0.15 + index * 0.31 });
  }
  env.endChecks();
  env.pick(f.id, 'Brickworks chimney', new THREE.Box3(new THREE.Vector3(f.x - lim, ground, f.z - lim), new THREE.Vector3(f.x + lim, ground + rimY, f.z + lim)), () => [`${Math.round(H)} m brick chimney · 1898`, 'The kilns of Haven Brickworks', 'Still smoking day and night']);
}

export function genTanks(env: Env, f: Feature): void {
  const rc = f.rect ?? { x0: f.x - 9, z0: f.z - 5, x1: f.x + 9, z1: f.z + 5 };
  const n = Math.max(1, Number(f.params?.count ?? 3));
  const R = Number(f.params?.radius ?? 2.8);
  const H = Number(f.params?.height ?? 9);
  const cx = (rc.x0 + rc.x1) / 2,
    cz = (rc.z0 + rc.z1) / 2;
  const alongX = rc.x1 - rc.x0 >= rc.z1 - rc.z0;
  env.begin(cx, 0, cz, alongX ? 0 : Math.PI / 2);
  env.checkRect(rc, 'tanks', 0.06);
  const K = env.S;
  const L = alongX ? rc.x1 - rc.x0 : rc.z1 - rc.z0;
  const D = alongX ? rc.z1 - rc.z0 : rc.x1 - rc.x0;
  const shell = M('#e8ebea', PAT.SEAM, 0.45, 0.3, 0, 0, 0.15);
  const band = M('#2f6f9f', PAT.PLAIN, 0.5, 0.3);
  const steel = M('#7f8a8f', PAT.PLAIN, 0.5, 0.6);
  const concrete = M(C.concrete, PAT.CONCRETE, 0.9, 0, 0, 0, 0.5);
  // bund wall around the tank farm
  const bw = 0.25;
  K.box(concrete, L - 0.1, 0.7, bw, 0, 0, -D / 2 + bw / 2 + 0.05);
  K.box(concrete, L - 0.1, 0.7, bw, 0, 0, D / 2 - bw / 2 - 0.05);
  K.box(concrete, bw, 0.7, D - 0.1, -L / 2 + bw / 2 + 0.05, 0, 0);
  K.box(concrete, bw, 0.7, D - 0.1, L / 2 - bw / 2 - 0.05, 0, 0);
  K.box(M('#b9b4aa', PAT.CONCRETE, 0.95, 0, 0, 0, 0.8), L - 0.6, 0.04, D - 0.6, 0, 0, 0);
  const spacing = Math.min((L - 1.2) / n, 2 * R + 1.0);
  const r = Math.min(R, spacing / 2 - 0.25, D / 2 - 0.6);
  const labels = ['CLAY SLIP', 'GLAZE', 'WATER', 'OIL'];
  const tops: V3[] = [];
  for (let i = 0; i < n; i++) {
    const x = -((n - 1) * spacing) / 2 + i * spacing;
    K.cyl(concrete, r + 0.2, r + 0.25, 0.3, x, 0, 0, 28);
    K.cyl(shell, r, r, H - 0.3, x, 0.3, 0, 32, true);
    K.cyl(band, r + 0.02, r + 0.02, 0.6, x, H * 0.62, 0, 32, true);
    for (const yy of [0.3 + (H - 0.3) * 0.25, 0.3 + (H - 0.3) * 0.5, 0.3 + (H - 0.3) * 0.85]) K.cyl(M('#c5cbcc', PAT.PLAIN, 0.5, 0.4), r + 0.03, r + 0.03, 0.07, x, yy, 0, 32, true);
    K.lathe(
      shell,
      [
        [r + 0.04, H],
        [r * 0.8, H + 0.55],
        [r * 0.4, H + 0.85],
        [0, H + 0.92],
      ],
      x,
      0,
      0,
      28,
    );
    // manway + vent + top railing
    K.cyl(steel, 0.35, 0.35, 0.25, x + r * 0.35, H + 0.62, 0, 10);
    K.cyl(steel, 0.12, 0.12, 0.7, x - r * 0.3, H + 0.65, r * 0.2, 6);
    tops.push([x, H + 0.9, 0]);
    // label facing the street side (+z local)
    const lab = env.atlas.add(256, 40, (g, w, h) => {
      g.fillStyle = '#e8ebea';
      g.fillRect(0, 0, w, h);
      drawText(g, labels[i % labels.length], w / 2, h / 2 + 1, 'bold 24px Arial, sans-serif', '#2f6f9f', 2);
    }, `tank:${labels[i % labels.length]}`);
    signQuad(env.T, lab, 2.4, 0.38, x, H * 0.62 + 0.75, r + 0.03, 0, 0);
    // valve + pipe out of the bottom towards the walkway
    K.cylX(steel, 0.14, 1.0, x, 0.65, r + 0.45, 8, Math.PI / 2);
    K.torus(M('#c8382f', PAT.PLAIN, 0.5, 0.4), 0.2, 0.035, x, 0.65, r + 0.9, 4, 12, Math.PI * 2, 0, 0, 0);
  }
  // ladder with cage on the first tank, catwalk bridges between tank tops
  {
    const x = -((n - 1) * spacing) / 2;
    const lz = -r - 0.15;
    for (const off of [-0.22, 0.22]) K.box(steel, 0.04, H + 0.8, 0.04, x + off, 0.3, lz);
    for (let y = 0.6; y < H + 0.6; y += 0.4) K.box(steel, 0.44, 0.03, 0.03, x, y, lz);
    for (let y = 2.4; y < H + 0.8; y += 1.2) K.torus(steel, 0.38, 0.02, x, y, lz - 0.25, 3, 10, Math.PI, -Math.PI / 2, 0, 0);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = tops[i],
      b = tops[i + 1];
    K.box(M('#6f7a7f', PAT.CORRUGATED, 0.6, 0.5), b[0] - a[0], 0.08, 0.8, (a[0] + b[0]) / 2, H + 0.7, 0);
    railing(env, [a[0] + r * 0.6, H + 0.78, 0.4], [b[0] - r * 0.6, H + 0.78, 0.4], 1.0, '#e3b324');
    railing(env, [a[0] + r * 0.6, H + 0.78, -0.4], [b[0] - r * 0.6, H + 0.78, -0.4], 1.0, '#e3b324');
  }
  // low pipe rack along the back, linking the tanks to the factory
  K.cylX(steel, 0.18, L - 1.0, 0, 1.6, -D / 2 + 0.75, 10, 0);
  K.cylX(M('#9c6b3a', PAT.PLAIN, 0.5, 0.4), 0.13, L - 1.0, 0, 1.25, -D / 2 + 0.75, 10, 0);
  for (let i = 0; i < 5; i++) K.box(steel, 0.12, 1.75, 0.12, -L / 2 + 1.0 + (i * (L - 2)) / 4, 0, -D / 2 + 0.75);
  // night: lamps on the catwalk
  for (const t of tops) {
    env.L.sphere(LM('#ffe0a8', LMODE.NIGHT, 2.5, 0, 0), 0.1, t[0], t[1] + 1.3, 0.45, 6, 4);
    env.glow(t[0], t[1] + 1.3, 0.45, { size: 0.9, kind: 'halo', color: '#ffd59a', intensity: 0.7 });
  }
  env.endChecks();
  env.pick(f.id, 'Storage tanks', new THREE.Box3(new THREE.Vector3(rc.x0, 0, rc.z0), new THREE.Vector3(rc.x1, H + 1, rc.z1)), () => [`${n} storage tanks · Haven Brickworks`, 'Clay slip, glaze and process water', 'Catwalks lit at night']);
}

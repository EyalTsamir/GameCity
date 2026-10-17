// Wind turbines on the northern ridge: tapered white towers standing on the rendered terrain
// (ctx.services.terrain.height), nacelles facing the plan's yaw, three-bladed rotors with red
// tip markings that turn with the wind (uSpin.y accumulated on the CPU), and blinking red
// aviation lights on the nacelles.

import * as THREE from 'three';
import type { Feature } from '../../core/plan';
import { ANIM, LM, LMODE, M, PAT } from './builder';
import type { Env } from './env';

interface TerrainLike {
  height(x: number, z: number): number;
}

export function genWindTurbine(env: Env, f: Feature, index: number): void {
  const terrain = env.ctx.services.terrain as TerrainLike | undefined;
  // lowest ground under the foundation so the base never floats on the slope
  let ground = Infinity;
  for (const [dx, dz] of [
    [0, 0],
    [1.2, 0],
    [-1.2, 0],
    [0, 1.2],
    [0, -1.2],
  ])
    ground = Math.min(ground, terrain ? terrain.height(f.x + dx, f.z + dz) : env.ctx.plan.heightAt(f.x + dx, f.z + dz));
  const H = Number(f.params?.height ?? 30);
  const L = Number(f.params?.rotor ?? 13);
  env.begin(f.x, ground, f.z, f.yaw);
  env.checkRadius(f.x, f.z, (f.radius || 2) + 0.4, 'windturbine');
  const K = env.S;
  const white = M('#f3f4f2', PAT.PLAIN, 0.45, 0.15);
  const grey = M('#d9dcdc', PAT.PANELS, 0.5, 0.2, 0, 0, 0.3);
  // foundation (sunk into the slope) + door + tower
  K.cyl(M('#b9b4aa', PAT.CONCRETE, 0.9, 0, 0, 0, 0.4), 1.9, 2.0, 0.9, 0, -0.5, 0, 16);
  K.cyl(white, 0.72, 1.18, H - 1.0, 0, 0.4, 0, 18);
  K.box(M('#7f8b8f', PAT.PLAIN, 0.5, 0.4), 0.7, 1.8, 0.1, 0, 0.4, 1.12);
  K.cyl(M('#c8cccc', PAT.PLAIN, 0.6), 1.2, 1.2, 0.12, 0, 2.6, 0, 18);
  // nacelle (local +Z = rotor side)
  const ny = H - 0.6;
  K.box(grey, 1.9, 1.9, 4.4, 0, ny, -0.5);
  K.box(grey, 1.6, 0.3, 3.6, 0, ny + 1.9, -0.6);
  K.box(M('#c9cfcf', PAT.PLAIN, 0.5, 0.3), 0.5, 0.4, 0.6, 0.3, ny + 2.2, -2.2);
  // rotor: hub spinner + 3 tapered blades, spinning about local +Z through the hub
  const hub = new THREE.Vector3(0, ny + 0.95, 1.95);
  env.anim({ mode: ANIM.SPIN_U, pivot: hub, axis: new THREE.Vector3(0, 0, 1), a: 1, b: 1, c: index * 0.73 });
  const spin = new THREE.SphereGeometry(0.85, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  spin.scale(1, 1.25, 1);
  spin.rotateX(Math.PI / 2);
  env.K.geo(white, spin, hub.x, hub.y, hub.z + 0.15, 0, 'box');
  spin.dispose();
  env.K.cyl(white, 0.8, 0.8, 0.5, hub.x, hub.y, hub.z - 0.35, 14, false, 'box', 0, Math.PI * 2, 0);
  const red = M('#d8382d', PAT.PLAIN, 0.45, 0.1);
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.sin(a), Math.cos(a), 0);
    const side = new THREE.Vector3(Math.cos(a), -Math.sin(a), 0);
    // blade in 4 tapered sections, slightly twisted; outer sections painted with red bands
    const secs = [
      [0.55, 0.95, 0.9],
      [0.32, 0.9, 0.75],
      [0.62, 0.75, 0.5],
      [0.88, 0.5, 0.26],
      [1.0, 0.26, 0.14],
    ];
    let r0 = 0.6;
    for (let s = 1; s < secs.length; s++) {
      const r1 = secs[s][0] * L;
      const c0 = secs[s - 1][2],
        c1 = secs[s][2];
      const p0 = hub.clone().addScaledVector(dir, r0);
      const p1 = hub.clone().addScaledVector(dir, r1);
      const twist = 0.25 - s * 0.05;
      const n0 = new THREE.Vector3(0, 0, 1).multiplyScalar(Math.sin(twist)).addScaledVector(side, Math.cos(twist));
      const pts: [number, number, number][] = [
        [p0.x - n0.x * c0 * 0.5, p0.y - n0.y * c0 * 0.5, p0.z - n0.z * c0 * 0.5],
        [p0.x + n0.x * c0 * 0.35, p0.y + n0.y * c0 * 0.35, p0.z + n0.z * c0 * 0.35],
        [p1.x + n0.x * c1 * 0.35, p1.y + n0.y * c1 * 0.35, p1.z + n0.z * c1 * 0.35],
        [p1.x - n0.x * c1 * 0.5, p1.y - n0.y * c1 * 0.5, p1.z - n0.z * c1 * 0.5],
      ];
      const m = s >= 3 && s % 2 === 1 ? red : white;
      env.K.poly(m, pts);
      // thickness: a back face slightly offset along the rotor axis
      env.K.poly(m, pts.map(([x, y, z]) => [x, y, z - 0.14] as [number, number, number]).reverse());
      r0 = r1;
    }
  }
  env.anim(null);
  // aviation light on the nacelle roof
  env.L.sphere(LM('#ff2a1a', LMODE.BLINK, 5.0, 0.5, 0.2), 0.14, 0, ny + 2.25, -1.2, 6, 4);
  env.glow(0, ny + 2.25, -1.2, { size: 2.0, kind: 'halo', color: '#ff3a24', intensity: 0.95, mode: 1, phase: 0.5 });
  env.endChecks();
  env.pick(f.id, 'Wind turbine', new THREE.Box3(new THREE.Vector3(f.x - L, ground, f.z - L), new THREE.Vector3(f.x + L, ground + ny + L + 1, f.z + L)), () => [`${Math.round(H)} m hub · ${Math.round(L * 2)} m rotor`, 'Powers the trams and the station', 'Red beacon blinks at night']);
}

/** Rotor angle for all turbines (uSpin.y): speed follows the wind. */
export function turbineUpdater(env: Env): (dt: number) => void {
  return (dt: number) => {
    const w = env.ctx.uniforms.uWind.value.length();
    const omega = 0.85 + 0.55 * Math.min(w, 1.5);
    env.u.uSpin.value.y = (env.u.uSpin.value.y + dt * omega) % (Math.PI * 200);
  };
}

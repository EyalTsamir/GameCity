// Night market (F4, judge 2: "at night: open, stocked and unmanned"): after closing time every market stall is
// shrouded — a weathered tarp pulled over the canopy and down all four sides to just above the
// cobbles, hanging in folds, flaring at the hem, roped to the poles. One merged mesh, shown between closing
// and opening (hours); the stall and its goods stay inside it. ?nonightmarket turns it off (off on low).

import * as THREE from 'three';
import type { CityContext } from '../../core/context';

// weathered canvas / PVC tarps (sun-faded: the old dark set read as black monoliths under the string lights)
const TARPS = ['#5a7590', '#6a8466', '#8a8e90', '#9c8f72', '#4f6f8c', '#8d5346', '#7b8a7c', '#a8a08a'];
/** market hours: shrouded from CLOSE until OPEN */
const CLOSE = 19.75,
  OPEN = 6.75;

export interface NightMarket {
  mesh: THREE.Mesh;
  frame(): void;
}

export function buildNightMarket(ctx: CityContext): NightMarket | null {
  const area = ctx.plan.areas.find((a) => a.kind === 'market');
  if (!area) return null;
  const r = area.rect;
  const stalls = ctx.plan.features.filter((f) => f.kind === 'marketstall' && f.x > r.x0 - 1 && f.x < r.x1 + 1 && f.z > r.z0 - 1 && f.z < r.z1 + 1);
  if (!stalls.length) return null;
  const terrain = ctx.services.terrain as { height?(x: number, z: number): number } | undefined;
  const H = (x: number, z: number) => terrain?.height?.(x, z) ?? ctx.plan.heightAt(x, z);
  const pos: number[] = [],
    col: number[] = [],
    spill: number[] = [];
  const c = new THREE.Color(),
    c2 = new THREE.Color();
  // stall frame (landmarks/civic.ts genMarketStall): hw 1.0, front rail z 0.6 at 2.3 m, back rail z −0.6 at 2.62 m
  const hw = 1.06,
    fz = 0.82,
    bz = -0.7,
    yF = 2.36,
    yB = 2.7;
  for (const f of stalls) {
    const cy = Math.cos(f.yaw),
      sy = Math.sin(f.yaw);
    const g = H(f.x, f.z);
    const W = (x: number, y: number, z: number): [number, number, number] => [f.x + x * cy + z * sy, g + y, f.z - x * sy + z * cy];
    let seed = (f.id * 7919 + 13) >>> 0;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    c.set(TARPS[f.id % TARPS.length]);
    const ph = rnd() * 6.28;
    // a grid patch: P(u, v) in stall-local metres; shade darkens the folds' hollows and the hem
    const patch = (nu: number, nv: number, P: (u: number, v: number) => [number, number, number, number], lit: (v: number) => number = () => 0) => {
      const pts: [number, number, number, number][][] = [];
      for (let j = 0; j <= nv; j++) {
        const row: [number, number, number, number][] = [];
        for (let i = 0; i <= nu; i++) row.push(P(i / nu, j / nv));
        pts.push(row);
      }
      let vv = 0;
      const put = (p: [number, number, number, number]) => {
        pos.push(...W(p[0], p[1], p[2]));
        spill.push(lit(vv));
        c2.copy(c).multiplyScalar(p[3]);
        col.push(c2.r, c2.g, c2.b);
      };
      for (let j = 0; j < nv; j++)
        for (let i = 0; i < nu; i++) {
          const a = pts[j][i],
            b = pts[j][i + 1],
            d = pts[j + 1][i],
            e = pts[j + 1][i + 1];
          vv = j / nv;
          put(a), put(b);
          vv = (j + 1) / nv;
          put(e);
          vv = j / nv;
          put(a);
          vv = (j + 1) / nv;
          put(e), put(d);
        }
    };
    const bowAt = (x: number, z: number) => {
      const u = (x + hw) / (2 * hw),
        v = (z - fz) / (bz - fz);
      return 0.14 * Math.pow(Math.max(0, Math.cos(Math.PI * (u - 0.5))), 3) * (0.6 + 0.4 * Math.sin(Math.PI * v));
    };
    const yTop = (z: number, x = hw) => yF + (yB - yF) * ((z - fz) / (bz - fz)) + 0.06 + bowAt(x, z);
    // top: over the canopy, pooling a little between the bows
    patch(12, 5, (u, v) => {
      // 4 cm past the face lines, rolled down over them at the rim (no slit along the top edges)
      const x = -(hw + 0.04) + 2 * (hw + 0.04) * u,
        z = fz + 0.04 + (bz - fz - 0.08) * v;
      const rim = Math.pow(Math.max(Math.abs(2 * u - 1), Math.abs(2 * v - 1)), 10) * 0.06;
      // pulled over the middle bow (a ridge front to back), pooling a little either side of it
      const sag = 0.06 * Math.abs(Math.sin(2 * Math.PI * u)) * Math.sin(Math.PI * v);
      return [x, yTop(z, Math.max(-hw, Math.min(hw, x))) - sag - rim, z, 0.95 - sag * 2];
    }, () => 1);
    // a hanging face from the top edge (x, z along the edge) down to the hem; out = outward normal (x, z)
    const face = (x0: number, z0: number, x1: number, z1: number, ox: number, oz: number, nu: number) =>
      patch(nu, 7, (u, v) => {
        const x = x0 + (x1 - x0) * u,
          z = z0 + (z1 - z0) * u;
        const top = yTop(z, x);
        const hem = 0.12 + 0.06 * Math.sin(u * 9.0 + ph);
        const y = top - (top - hem) * v;
        const L = Math.hypot(x1 - x0, z1 - z0);
        // folds: deepen downwards, a gather at each end where it is roped to the pole, flare at the hem
        const fold = Math.sin(u * L * 7.5 + ph + 0.8 * Math.sin(u * L * 2.3)) * (0.015 + 0.05 * v);
        const flare = 0.1 * v * v * v;
        const gather = Math.sin(Math.PI * u);
        // no offset at the face ends: neighbouring faces meet on the corner line (the goods showed through the gap)
        const end = Math.min(1, 7 * u, 7 * (1 - u));
        const out = ((fold + flare) * (0.5 + 0.5 * gather) + 0.02) * end;
        const shade = (0.82 + 0.18 * (0.5 + 0.5 * Math.sin(u * L * 7.5 + ph + 0.8 * Math.sin(u * L * 2.3)))) * (1 - 0.18 * v * v);
        return [x + ox * out, y, z + oz * out, shade];
      }, (v) => 0.55 * (1 - v) + 0.15);
    face(-hw, fz, hw, fz, 0, 1, 18);
    face(hw, fz, hw, bz, 1, 0, 10);
    face(-hw, bz, -hw, fz, -1, 0, 10);
    // and the back (the stall's back is open between the poles: goods showed through)
    face(hw, bz, -hw, bz, 0, -1, 14);
    // tie ropes round the front poles (dark bands at mid height)
    c.set('#c9b98a');
    for (const sx of [-1, 1])
      for (const yy of [0.9, 1.6])
        patch(1, 1, (u, v) => [sx * (hw + 0.075), yy + v * 0.03, fz + 0.06 - u * 0.12, 1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aSpill', new THREE.Float32BufferAttribute(spill, 1));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  mat.name = 'life-night-market';
  // warm spill from the festoon lights strung over the square (they are glows, not lights): the tops catch most
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLights = ctx.uniforms.uLights;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSpill;\nvarying float vSpill;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSpill = aSpill;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLights;\nvarying float vSpill;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.78, 0.5) * 0.16 * vSpill * uLights;');
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'life-night-market';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const frame = () => {
    const h = ctx.clock.hours;
    mesh.visible = h >= CLOSE || h < OPEN;
  };
  frame();
  return { mesh, frame };
}

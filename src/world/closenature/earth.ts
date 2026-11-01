// The ground between the blades, from a metre away. As closemat does for paving: for the cells of the bubble an exact copy of the
// ground's triangles is drawn once more with a small program that multiplies what is already there, so the far ground, its
// colours, its lighting and its bakes stay as they are. In the town that is the terrain mesh wherever it isn't sand; beyond it,
// the land mesh. What it adds: crumbs of soil in two sizes, a thatch of dead grass lying every which way, damp, small stones.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { WATER_LEVEL } from '../../core/constants';
import { globalUniforms } from '../../core/uniforms';
import { nearOf } from '../../core/nearDetail';
import { CM_COMMON } from '../closemat/glsl';
import { interleaved, TriGrid, type SourceAttr } from '../closemat/source';
import { makeCloseTiles } from '../closemat/textures';
import { groundMaskInfo } from '../terrain/ground';

const ATTRS: SourceAttr[] = [
  { name: 'position', size: 3 },
  { name: 'normal', size: 3 },
];
/** pixels one metre covers at 1 m in the bubble's reference view (as closemat) */
const REF_PX = 1099;
const RADIUS = 10;
const LAND_REACH = 1400;

const VERT = /* glsl */ `
uniform float uDrop;
attribute float aF;
varying vec3 vP;
varying vec3 vN;
varying float vF;
void main() {
  vP = position;
  vN = normal;
  vF = aF;
  gl_Position = projectionMatrix * viewMatrix * vec4(position.x, position.y + uDrop, position.z, 1.0);
}
`;

const FRAG = /* glsl */ `
varying float vF;
void main() {
  vec3 N = normalize(vN);
  vec2 p = vP.xz;
  gx = dFdx(p);
  gy = dFdy(p);
  float fa = cmArea(gx, gy);
  if (fa >= CM_LIM) discard;
  float k = 1.0 - smoothstep(CM_LIM * 0.45, CM_LIM, fa);
  float fine = 1.0 - smoothstep(CM_LIM * 0.25, CM_LIM * 0.5, fa);
  vec4 c = CMT(tCrack, p * 0.39, 0.39);
  vec4 g = CMT(tGrain, p * 1.667, 1.667);
  vec2 sl = (g.rg - 0.5) * 0.8;
  vec3 ratio = vec3(cmLight(N, normalize(N - vec3(sl.x, 0.0, sl.y))));
  // damp, shade of old leaves, thin places: slow patches
  ratio *= mix(vec3(0.78, 0.74, 0.68), vec3(1.08, 1.06, 1.02), smoothstep(0.3, 0.7, c.b));
  if (fine > 0.0) {
    // grains of soil; here and there a clod or a pale stone standing out of them
    vec4 s0 = CMT(tStones, p * 2.3 + c.gb * 0.03, 2.3);
    vec4 s1 = CMT(tStones, p.yx * 6.1 + 0.37, 6.1);
    vec3 crumb = vec3(1.02, 0.98, 0.9) * (0.78 + 0.44 * g.b);
    crumb *= 1.0 + step(0.62, s1.g) * smoothstep(0.1, 0.55, s1.b) * (fract(s1.g * 17.3) - 0.45) * 0.62;
    crumb *= mix(1.0, 0.6 + 0.5 * fract(s0.g * 9.7), step(0.87, s0.g) * smoothstep(0.12, 0.6, s0.b));
    crumb = mix(crumb, vec3(1.42, 1.38, 1.3), step(0.975, fract(s0.g * 11.3)) * smoothstep(0.25, 0.6, s0.b));
    // dead grass lying on it: fibres in two directions, each window its own way
    vec2 d1 = vec2(p.x * 0.8 + p.y * 0.6, -p.x * 0.6 + p.y * 0.8);
    vec2 d2 = vec2(p.x * 0.37 - p.y * 0.93, p.x * 0.93 + p.y * 0.37);
    float t1 = textureGrad(tFibre, d1 * vec2(1.6, 5.3), gx * vec2(1.6, 5.3), gy * vec2(1.6, 5.3)).b;
    float t2 = textureGrad(tFibre, d2 * vec2(1.9, 4.1) + 0.41, gx * vec2(1.9, 4.1), gy * vec2(1.9, 4.1)).b;
    float th = smoothstep(0.58, 0.72, max(t1, t2));
    crumb = mix(crumb, vec3(1.22, 1.12, 0.82) * (0.8 + 0.4 * s1.g), th * 0.72);
    ratio *= mix(vec3(1.0), crumb, fine);
  }
  // under trees: the dark brown under last year's leaves (the leaves themselves are real, flora.ts)
  ratio *= mix(vec3(1.0), vec3(0.62, 0.47, 0.34) * (0.82 + 0.36 * c.b), vF);
  gl_FragColor = vec4(max(mix(vec3(1.0), ratio, k), vec3(0.0)), 1.0);
}
`;

/** how much of last year's leaves, per vertex */
function withDuff(g: THREE.BufferGeometry, at: (x: number, z: number) => number): THREE.BufferGeometry {
  const P = g.getAttribute('position');
  const F = new Float32Array(P.count);
  for (let i = 0; i < P.count; i++) F[i] = at(P.getX(i), P.getZ(i));
  g.setAttribute('aF', new THREE.BufferAttribute(F, 1));
  return g;
}

export function addEarth(ctx: CityContext, landGround: { geometry: THREE.BufferGeometry; drop: number } | null, duffAt: { town: (x: number, z: number) => number; land: (x: number, z: number) => number }): void {
  const near = nearOf(ctx);
  const tiles = makeCloseTiles();
  const shared = {
    tGrain: { value: tiles.grain },
    tCrack: { value: tiles.crack },
    tFibre: { value: tiles.fibre },
    tStones: { value: tiles.stones },
    uSunDir: globalUniforms.uSunDir,
    uDaylight: globalUniforms.uDaylight,
  };
  const layer = (name: string, grid: TriGrid, drop: number, top: number, offset: number, duff: (x: number, z: number) => number): void => {
    if (grid.triangles === 0) return;
    near.addMeshes({
      name,
      radius: RADIUS,
      cell: grid.cell,
      top,
      margin: grid.cell * 0.5,
      material: new THREE.ShaderMaterial({
        name: `closenature-${name}`,
        defines: { CM_LIM: (RADIUS / REF_PX).toFixed(5) },
        uniforms: { ...shared, uDrop: { value: drop } },
        vertexShader: VERT,
        fragmentShader: CM_COMMON + FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.DstColorFactor,
        blendDst: THREE.ZeroFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        polygonOffset: true,
        polygonOffsetFactor: offset,
        polygonOffsetUnits: offset * 2,
        fog: false,
        toneMapped: false,
      }),
      renderOrder: -80,
      receiveShadow: false,
      standIn: withDuff(interleaved(new Float32Array(grid.stride * 3), ATTRS), duff),
      build: (c) => {
        const g = grid.build(c.i, c.j, (data) => interleaved(data, ATTRS));
        return g ? withDuff(g, duff) : g;
      },
    });
  };
  // the town's ground wherever it isn't sand
  const gm = groundMaskInfo;
  const slab = ctx.plan.slab;
  const sx = gm ? gm.w / (slab.x1 - slab.x0) : 0;
  const sand = (x: number, z: number): boolean => {
    if (!gm) return false;
    const u = Math.floor((x - slab.x0) * sx),
      v = Math.floor((z - slab.z0) * sx);
    return u >= 0 && v >= 0 && u < gm.w && v < gm.h && gm.data[(v * gm.w + u) * 4] > 127;
  };
  const town: THREE.BufferGeometry[] = [];
  ctx.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.name === 'terrain-ground') town.push((o as THREE.Mesh).geometry);
  });
  const CELL = 8;
  layer(
    'closeearth',
    new TriGrid(town, ATTRS, CELL, (g, a, b, c) => {
      const P = g.getAttribute('position');
      if (P.getY(a) < WATER_LEVEL && P.getY(b) < WATER_LEVEL && P.getY(c) < WATER_LEVEL) return false;
      return !(sand(P.getX(a), P.getZ(a)) && sand(P.getX(b), P.getZ(b)) && sand(P.getX(c), P.getZ(c)));
    }),
    0,
    3,
    -1,
    duffAt.town,
  );
  // the land beyond it, as far as anyone can walk: its big triangles cut to cells
  if (landGround) {
    layer(
      'closeland',
      new TriGrid([landGround.geometry], ATTRS, CELL, (g, a, b, c) => {
        const P = g.getAttribute('position');
        if (P.getY(a) < WATER_LEVEL && P.getY(b) < WATER_LEVEL && P.getY(c) < WATER_LEVEL) return false;
        // (out where the triangles are as big as fields nobody stands: the grid would be all of them)
        const ax = P.getX(a),
          az = P.getZ(a);
        return Math.abs(ax) < LAND_REACH && Math.abs(az) < LAND_REACH && Math.abs(ax - P.getX(b)) + Math.abs(az - P.getZ(b)) < 48 && Math.abs(ax - P.getX(c)) + Math.abs(az - P.getZ(c)) < 48;
      }),
      landGround.drop,
      3,
      -1,
      duffAt.land,
    );
  }
}

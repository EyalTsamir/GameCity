// Farmsteads, hamlets and villages of the countryside (sites from landscape/model.ts):
// gabled houses, barns and sheds (one instanced unit mesh: body + roof, roof pitch per instance),
// church towers with spires (a second instanced mesh). Walls get window rows (shader), lit at night.

import * as THREE from 'three';
import type { LandscapeModel, Site } from './model';
import { FIELD_ROT } from './fields';
import { hash2i } from './noise';
import { LAMP_GLSL } from '../../core/lampLight';

interface Bld {
  x: number;
  z: number;
  y: number;
  w: number; // along local x
  d: number; // along local z (ridge runs along x)
  h: number; // eaves height
  roof: number; // roof rise (m)
  yaw: number;
  wall: number; // palette index
  roofC: number;
  kind: number; // 0 house, 1 barn, 2 shed
}

const WALLS = ['#e9e1cf', '#d9ccb0', '#c9b79a', '#b5aa98', '#e4d6bd', '#9c5b44', '#7a4a36', '#5b4535'];
const ROOFS = ['#8e4a35', '#a2563a', '#6f3d30', '#5a5856', '#4b4a4c', '#7d5640'];

export interface Settlements {
  group: THREE.Group;
  count: number;
  triangles: number;
}

function placeSite(site: Site, model: LandscapeModel, out: Bld[], towers: { x: number; z: number; y: number; h: number; yaw: number }[]): void {
  const H = model.height;
  const rnd = (i: number, k: number) => hash2i(site.seed * 131 + i, k, 607);
  const baseYaw = FIELD_ROT + (rnd(0, 1) - 0.5) * 0.6;
  const put = (lx: number, lz: number, b: Omit<Bld, 'x' | 'z' | 'y' | 'yaw'>, yawOff: number) => {
    const c = Math.cos(baseYaw),
      s = Math.sin(baseYaw);
    const x = site.x + lx * c + lz * s,
      z = site.z - lx * s + lz * c;
    // sit on the lowest corner (no floating sills), slightly sunk
    const yaw = baseYaw + yawOff;
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw);
    let y = Infinity;
    for (const [ax, az] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ]) {
      const px = x + ax * b.w * cy + az * b.d * sy,
        pz = z - ax * b.w * sy + az * b.d * cy;
      y = Math.min(y, H(px, pz));
    }
    if (y < -1.2) return;
    out.push({ ...b, x, z, y: y - 0.3, yaw });
  };
  if (site.kind === 'farm') {
    put(0, 0, { w: 11 + 3 * rnd(1, 2), d: 8 + 1.5 * rnd(1, 3), h: 5.6 + 1.2 * rnd(1, 4), roof: 4.2, wall: Math.floor(rnd(1, 5) * 5), roofC: Math.floor(rnd(1, 6) * 3), kind: 0 }, 0);
    put(4 + 6 * rnd(2, 1), 17 + 4 * rnd(2, 2), { w: 20 + 6 * rnd(2, 3), d: 12 + 3 * rnd(2, 4), h: 6 + rnd(2, 5) * 1.5, roof: 5.5, wall: 5 + Math.floor(rnd(2, 6) * 3), roofC: Math.floor(rnd(2, 7) * 6), kind: 1 }, (rnd(2, 8) > 0.5 ? 0 : Math.PI / 2));
    if (rnd(3, 1) > 0.25) put(-15 - 4 * rnd(3, 2), 8 + 6 * rnd(3, 3), { w: 12, d: 6, h: 3.4, roof: 2.0, wall: 5 + Math.floor(rnd(3, 4) * 3), roofC: 3 + Math.floor(rnd(3, 5) * 3), kind: 2 }, Math.PI / 2);
    return;
  }
  // villages / hamlets: houses along two crossing streets + a ring of scattered ones
  const n = site.kind === 'village' ? 38 : 9;
  const streetYaw = [0, Math.PI / 2 + (rnd(9, 1) - 0.5) * 0.5];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const street = streetYaw[i % 2];
    const along = (rnd(i, 11) - 0.5) * site.r * 1.7;
    const side = rnd(i, 12) < 0.5 ? -1 : 1;
    const off = side * (8 + 5 * rnd(i, 13));
    const lx = Math.cos(street) * along - Math.sin(street) * off,
      lz = Math.sin(street) * along + Math.cos(street) * off;
    if (Math.hypot(lx, lz) < 16 && site.kind === 'village') continue; // the church square
    const big = rnd(i, 14) < 0.15;
    put(
      lx,
      lz,
      {
        w: (big ? 13 : 9) + 3 * rnd(i, 15),
        d: 7 + 2 * rnd(i, 16),
        h: (big ? 7.5 : 5) + 2.2 * rnd(i, 17),
        roof: 3.5 + 1.5 * rnd(i, 18),
        wall: Math.floor(rnd(i, 19) * 5),
        roofC: Math.floor(rnd(i, 20) * (site.kind === 'village' ? 6 : 3)),
        kind: 0,
      },
      -street + (rnd(i, 21) - 0.5) * 0.12,
    );
    k++;
  }
  if (site.kind === 'village') {
    // church: nave + tower with spire
    put(0, 6, { w: 22, d: 10, h: 9, roof: 6, wall: 3, roofC: 4, kind: 0 }, 0);
    const c = Math.cos(baseYaw),
      s = Math.sin(baseYaw);
    const tx = site.x + -13 * c + 6 * s,
      tz = site.z - -13 * s + 6 * c;
    towers.push({ x: tx, z: tz, y: H(tx, tz) - 0.3, h: 34 + 8 * rnd(30, 1), yaw: baseYaw });
  }
}

/** unit gabled building: body 1×1×1 (y 0..1) + roof prism (y 1..2, flagged), ridge along x */
function gableGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const roof: number[] = [];
  const nrm: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], r: number) => {
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2];
    const vx = d[0] - a[0],
      vy = d[1] - a[1],
      vz = d[2] - a[2];
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (const p of [a, b, c, a, c, d]) {
      pos.push(p[0], p[1], p[2]);
      nrm.push(nx, ny, nz);
      roof.push(r);
    }
  };
  const tri = (a: number[], b: number[], c: number[]) => {
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2];
    const vx = c[0] - a[0],
      vy = c[1] - a[1],
      vz = c[2] - a[2];
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      nrm.push(nx, ny, nz);
      roof.push(0);
    }
  };
  const h = 0.5;
  // walls (counter-clockwise seen from outside)
  quad([-h, 0, h], [h, 0, h], [h, 1, h], [-h, 1, h], 0); // +z
  quad([h, 0, -h], [-h, 0, -h], [-h, 1, -h], [h, 1, -h], 0); // -z
  quad([h, 0, h], [h, 0, -h], [h, 1, -h], [h, 1, h], 0); // +x
  quad([-h, 0, -h], [-h, 0, h], [-h, 1, h], [-h, 1, -h], 0); // -x
  // gables (wall material, flagged roof-height so the apex follows the roof rise)
  tri([h, 1, h], [h, 1, -h], [h, 2, 0]);
  tri([-h, 1, -h], [-h, 1, h], [-h, 2, 0]);
  // roof planes with a small overhang (eaves)
  const o = 0.06;
  quad([-h - o, 1 - o * 0.8, h + o], [h + o, 1 - o * 0.8, h + o], [h + o, 2, 0], [-h - o, 2, 0], 1);
  quad([h + o, 1 - o * 0.8, -h - o], [-h - o, 1 - o * 0.8, -h - o], [-h - o, 2, 0], [h + o, 2, 0], 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aRoof', new THREE.Float32BufferAttribute(roof, 1));
  return g;
}

/** church tower (square shaft, unit 1×1 base, height 1) + spire (flagged) */
function towerGeometry(): THREE.BufferGeometry {
  const shaft = new THREE.BoxGeometry(1, 0.62, 1).toNonIndexed();
  shaft.translate(0, 0.31, 0);
  const spire = new THREE.ConeGeometry(0.62, 0.38, 8, 1, false).toNonIndexed();
  spire.rotateY(Math.PI / 8);
  spire.translate(0, 0.62 + 0.19, 0);
  const pos: number[] = [],
    nrm: number[] = [],
    roof: number[] = [];
  for (const [g, r] of [
    [shaft, 0],
    [spire, 1],
  ] as [THREE.BufferGeometry, number][]) {
    const p = g.getAttribute('position'),
      n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      roof.push(r);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aRoof', new THREE.Float32BufferAttribute(roof, 1));
  return g;
}

function buildingMaterial(uniforms: Record<string, THREE.IUniform>, fog: boolean, tower: boolean): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, fog });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aRoof;
attribute vec4 aB; // wall rgb packed? no: (roof rise / eaves height, wall idx, roof idx, kind)
varying float vRoof;
varying vec3 vBW;
varying vec3 vBL;
varying vec4 vB;
varying vec3 vBS;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
${tower ? '' : '// roof rise relative to the eaves height\nif (transformed.y > 1.0) transformed.y = 1.0 + (transformed.y - 1.0) * aB.x;'}
vRoof = aRoof;
vB = aB;
vBL = transformed;
vBS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));`,
      )
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uWalls[8];
uniform vec3 uRoofs[6];
uniform float uLights;
uniform float uNight;
varying float vRoof;
varying vec3 vBW;
varying vec3 vBL;
varying vec4 vB;
varying vec3 vBS;
float bWin = 0.0;
${LAMP_GLSL}
float bHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 bAlbedo() {
  int wi = int(vB.y + 0.5), ri = int(vB.z + 0.5);
  vec3 wall = uWalls[wi];
  vec3 roof = uRoofs[ri];
  if (vRoof > 0.75) {
    // tile courses
    float c = fract(vBL.y * vBS.y * ${tower ? '1.0' : '2.2'});
    return roof * (0.85 + 0.15 * smoothstep(0.1, 0.4, c)) * (0.9 + 0.2 * bHash(floor(vBW.xz * 0.5)));
  }
  // windows: rows per storey on the long walls and gables (not on barns / towers)
  float fp = length(fwidth(vBW));
  vec3 col = wall * (0.92 + 0.08 * bHash(floor(vBW.xz * 3.0 + vBW.y * 2.0)));
  ${tower
        ? `{
    // louvred belfry openings near the top
    float u = abs(vBL.x) > 0.499 ? vBL.z : vBL.x;
    float y = vBL.y;
    float op = step(0.47, y) * step(y, 0.56) * step(abs(u), 0.16);
    col = mix(col, vec3(0.05), op * (1.0 - smoothstep(0.4, 1.2, fp)));
  }`
        : `if (vB.w < 0.5 && fp < 1.6) {
    float along = abs(vBL.z) > 0.499 ? vBL.x * vBS.x : vBL.z * vBS.z;
    float y = vBL.y * vBS.y;
    float storey = floor((y - 0.9) / 2.8);
    float yy = (y - 0.9) - storey * 2.8;
    float xx = fract(along / 3.1 + 0.5);
    float win = step(0.0, storey) * step(0.35, yy) * step(yy, 1.65) * step(0.32, xx) * step(xx, 0.68) * step(y, vBS.y - 0.4) * step(vBL.y, 1.0);
    win *= 1.0 - smoothstep(0.6, 1.6, fp);
    float lit = step(0.45, bHash(floor(vec2(along / 3.1, storey) + vBW.xz * 0.013) + vB.y));
    bWin = win * lit;
    col = mix(col, vec3(0.06, 0.07, 0.08), win);
  }`}
  return col;
}`,
      )
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( bAlbedo(), opacity );')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.68, 0.34) * bWin * uLights * 2.2;',
      );
  };
  mat.customProgramCacheKey = () => (tower ? 'th-landtower-v1' : 'th-landbld-v1');
  return mat;
}

export function buildSettlements(model: LandscapeModel, uniforms: Record<string, THREE.IUniform>, lights: { value: number }, night: { value: number }, fog: boolean): Settlements {
  const blds: Bld[] = [];
  const towers: { x: number; z: number; y: number; h: number; yaw: number }[] = [];
  for (const s of model.sites) placeSite(s, model, blds, towers);
  const group = new THREE.Group();
  group.name = 'land-settlements';
  const u = {
    ...uniforms,
    uWalls: { value: WALLS.map((h) => new THREE.Color(h)) },
    uRoofs: { value: ROOFS.map((h) => new THREE.Color(h)) },
    uLights: lights,
    uNight: night,
  };
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    sc = new THREE.Vector3(),
    p = new THREE.Vector3(),
    ax = new THREE.Vector3(0, 1, 0);
  // gabled buildings
  const geo = gableGeometry();
  const ab = new Float32Array(blds.length * 4);
  blds.forEach((b, i) => {
    ab[i * 4] = b.roof / b.h;
    ab[i * 4 + 1] = b.wall;
    ab[i * 4 + 2] = b.roofC;
    ab[i * 4 + 3] = b.kind;
  });
  geo.setAttribute('aB', new THREE.InstancedBufferAttribute(ab, 4));
  const mesh = new THREE.InstancedMesh(geo, buildingMaterial(u, fog, false), Math.max(1, blds.length));
  blds.forEach((b, i) => {
    p.set(b.x, b.y, b.z);
    q.setFromAxisAngle(ax, b.yaw);
    sc.set(b.w, b.h, b.d);
    m4.compose(p, q, sc);
    mesh.setMatrixAt(i, m4);
  });
  mesh.count = blds.length;
  mesh.name = 'land-buildings';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
  // church towers
  const tg = towerGeometry();
  const tb = new Float32Array(Math.max(1, towers.length) * 4);
  towers.forEach((_, i) => {
    tb[i * 4] = 1;
    tb[i * 4 + 1] = 3;
    tb[i * 4 + 2] = 4;
    tb[i * 4 + 3] = 3;
  });
  tg.setAttribute('aB', new THREE.InstancedBufferAttribute(tb, 4));
  const tmesh = new THREE.InstancedMesh(tg, buildingMaterial(u, fog, true), Math.max(1, towers.length));
  towers.forEach((t, i) => {
    p.set(t.x, t.y, t.z);
    q.setFromAxisAngle(ax, t.yaw);
    sc.set(5.5, t.h, 5.5);
    m4.compose(p, q, sc);
    tmesh.setMatrixAt(i, m4);
  });
  tmesh.count = towers.length;
  tmesh.name = 'land-towers';
  tmesh.castShadow = true;
  tmesh.receiveShadow = true;
  tmesh.computeBoundingSphere();
  group.add(tmesh);
  const triangles = blds.length * 14 + towers.length * (12 + 16);
  return { group, count: blds.length + towers.length, triangles };
}

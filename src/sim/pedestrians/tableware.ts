// What stands on a café table in front of each seated patron: saucer + cup (the cup leaves the table
// while it is in the patron's hand), plate with food, water glass, wine / spritz / beer, a croissant at
// breakfast, a bottle per table. One merged geometry of parts; each instance shows the parts of its
// bitmask (other parts collapse in the vertex shader). One draw call, no shadows (sub-10 cm objects),
// lamp light at night. Instances are written by the crowd renderer while it draws the seated patrons.

import * as THREE from 'three';
import { patchLampMaterial } from '../../world/lamps/integrate';

/** part bits */
export const TW = {
  SAUCER: 0,
  CUP: 1,
  PLATE: 2,
  SALAD: 3,
  PASTA: 4,
  WATER: 5,
  WINE: 6,
  SPRITZ: 7,
  BEER: 8,
  CROISSANT: 9,
  BOTTLE: 10,
  ICED: 11,
  CANDLE: 12,
} as const;

interface PartSpec {
  part: number;
  geo: THREE.BufferGeometry;
  color: string;
}

function cyl(r0: number, r1: number, h: number, seg: number, x: number, y: number, z: number, cap = true): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, !cap);
  g.translate(x, y + h / 2, z);
  return g;
}

function dome(r: number, h: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, h / r, 1);
  g.translate(x, y, z);
  return g;
}

/** local frame: origin on the table top 5 cm in from the edge in front of the sitter, +Z towards the table centre,
 * +X the sitter's left (cup / main drink on the right at x −0.12, water on the left) */
function parts(): PartSpec[] {
  const out: PartSpec[] = [];
  const add = (part: number, geo: THREE.BufferGeometry, color: string) => out.push({ part, geo, color });
  // coffee
  add(TW.SAUCER, cyl(0.062, 0.066, 0.008, 10, -0.14, 0, 0.03), '#fbfaf6');
  add(TW.CUP, cyl(0.03, 0.04, 0.058, 8, -0.14, 0.008, 0.03, false), '#fdfcf9');
  add(TW.CUP, cyl(0.037, 0.037, 0.001, 8, -0.14, 0.06, 0.03), '#3a2216');
  // plate + food
  add(TW.PLATE, cyl(0.09, 0.105, 0.012, 12, 0.0, 0, 0.12), '#fbfaf6');
  add(TW.SALAD, dome(0.062, 0.04, -0.01, 0.012, 0.12), '#7fa04a');
  add(TW.SALAD, dome(0.03, 0.022, 0.035, 0.03, 0.1), '#c8463a');
  add(TW.PASTA, dome(0.06, 0.035, 0.0, 0.012, 0.12), '#e3b55a');
  add(TW.PASTA, dome(0.035, 0.02, -0.02, 0.035, 0.13), '#b8402e');
  // drinks
  add(TW.WATER, cyl(0.026, 0.031, 0.1, 8, 0.14, 0, 0.17, false), '#cfe0e6');
  add(TW.WATER, cyl(0.026, 0.028, 0.07, 8, 0.14, 0.002, 0.17), '#9fc3d0');
  // wine glass: foot, stem, bowl with red wine
  add(TW.WINE, cyl(0.03, 0.03, 0.004, 8, -0.12, 0, 0.07), '#dfe8ea');
  add(TW.WINE, cyl(0.004, 0.004, 0.08, 4, -0.12, 0.004, 0.07), '#dfe8ea');
  add(TW.WINE, cyl(0.022, 0.036, 0.05, 8, -0.12, 0.084, 0.07), '#6e1426');
  add(TW.WINE, cyl(0.036, 0.034, 0.035, 8, -0.12, 0.134, 0.07, false), '#dfe8ea');
  // spritz: big wine glass with orange
  add(TW.SPRITZ, cyl(0.032, 0.032, 0.004, 8, -0.12, 0, 0.07), '#dfe8ea');
  add(TW.SPRITZ, cyl(0.004, 0.004, 0.07, 4, -0.12, 0.004, 0.07), '#dfe8ea');
  add(TW.SPRITZ, cyl(0.026, 0.044, 0.07, 8, -0.12, 0.074, 0.07), '#ef7a23');
  add(TW.SPRITZ, dome(0.012, 0.012, -0.135, 0.144, 0.06), '#f5c242');
  // beer: pint glass, amber with a head
  add(TW.BEER, cyl(0.032, 0.039, 0.13, 8, -0.12, 0, 0.09), '#d9921f');
  add(TW.BEER, cyl(0.039, 0.04, 0.022, 8, -0.12, 0.13, 0.09), '#f6efdc');
  // iced coffee / lemonade: tall glass with a straw
  add(TW.ICED, cyl(0.03, 0.034, 0.13, 8, -0.12, 0, 0.12), '#c99a66');
  add(TW.ICED, cyl(0.004, 0.004, 0.06, 4, -0.11, 0.12, 0.12), '#e8e2d4');
  // croissant on a small plate
  add(TW.CROISSANT, cyl(0.07, 0.075, 0.008, 10, 0.07, 0, 0.12), '#fbfaf6');
  {
    const g = new THREE.TorusGeometry(0.035, 0.018, 4, 7, Math.PI * 1.1);
    g.rotateX(-Math.PI / 2);
    g.scale(1, 0.8, 1);
    g.translate(0.07, 0.02, 0.12);
    add(TW.CROISSANT, g, '#c98a3c');
  }
  // tea light in a little glass (evenings; glows with the street lights)
  add(TW.CANDLE, cyl(0.026, 0.028, 0.05, 8, -0.07, 0, 0.26, false), '#e9d9b8');
  add(TW.CANDLE, cyl(0.02, 0.02, 0.001, 8, -0.07, 0.035, 0.26), '#ffcf7a');
  // bottle (one per table, stands towards the middle)
  add(TW.BOTTLE, cyl(0.032, 0.032, 0.17, 8, 0.08, 0, 0.27), '#2e5a3a');
  add(TW.BOTTLE, cyl(0.012, 0.03, 0.07, 8, 0.08, 0.17, 0.27), '#2e5a3a');
  return out;
}

function buildGeometry(): THREE.InstancedBufferGeometry {
  const ps = parts();
  // a touch over life size so cups and glasses still read at 10–15 m
  for (const p of ps) p.geo.scale(1.18, 1.18, 1.18);
  const pos: number[] = [],
    nrm: number[] = [],
    col: number[] = [],
    prt: number[] = [],
    idx: number[] = [];
  const c = new THREE.Color();
  for (const p of ps) {
    const g = p.geo.index ? p.geo : p.geo;
    const P = g.getAttribute('position'),
      N = g.getAttribute('normal');
    c.set(p.color).convertSRGBToLinear();
    const base = pos.length / 3;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nrm.push(N.getX(i), N.getY(i), N.getZ(i));
      col.push(c.r, c.g, c.b);
      prt.push(p.part);
    }
    const I = g.index;
    if (I) for (let i = 0; i < I.count; i++) idx.push(base + I.getX(i));
    else for (let i = 0; i < P.count; i++) idx.push(base + i);
    g.dispose();
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(prt, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

export class Tableware {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  private geo: THREE.InstancedBufferGeometry;
  private root: Float32Array;
  private mask: Float32Array;
  private rootAttr: THREE.InstancedBufferAttribute;
  private maskAttr: THREE.InstancedBufferAttribute;
  private rng = { start: 0, count: 0 };
  private rng2 = { start: 0, count: 0 };
  n = 0;
  readonly tris: number;
  /** street-lights factor (globalUniforms.uLights): the tea lights glow with it */
  readonly lights = { value: 0 };

  constructor(capacity: number) {
    this.capacity = capacity;
    const geo = buildGeometry();
    this.tris = (geo.index?.count ?? 0) / 3;
    this.root = new Float32Array(capacity * 4);
    this.mask = new Float32Array(capacity);
    this.rootAttr = new THREE.InstancedBufferAttribute(this.root, 4);
    this.rootAttr.setUsage(THREE.DynamicDrawUsage);
    this.maskAttr = new THREE.InstancedBufferAttribute(this.mask, 1);
    this.maskAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iRoot', this.rootAttr);
    geo.setAttribute('iMask', this.maskAttr);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uLights = this.lights;
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute vec4 iRoot;
attribute float iMask;
attribute float aPart;
uniform float uLights;
varying float vTwGlow;`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
float twC = cos(iRoot.w), twS = sin(iRoot.w);
objectNormal = vec3(twC * objectNormal.x + twS * objectNormal.z, objectNormal.y, -twS * objectNormal.x + twC * objectNormal.z);`,
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3(twC * position.x + twS * position.z, position.y, -twS * position.x + twC * position.z) + iRoot.xyz;
// parts not in this setting's mask collapse to a point (degenerate triangles)
if (mod(floor(iMask / exp2(aPart)), 2.0) < 0.5) transformed = iRoot.xyz;
vTwGlow = abs(aPart - ${TW.CANDLE}.0) < 0.5 ? uLights : 0.0;`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTwGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vTwGlow * 2.5;');
    };
    mat.customProgramCacheKey = () => 'tableware2';
    patchLampMaterial(mat);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.name = 'tableware';
  }

  begin(): void {
    this.n = 0;
  }

  /** a setting at world (x, y = table top, z) facing yaw (+Z of the setting → (sin yaw, cos yaw)) */
  add(x: number, y: number, z: number, yaw: number, mask: number): void {
    if (this.n >= this.capacity) return;
    const i = this.n++;
    this.root[i * 4] = x;
    this.root[i * 4 + 1] = y;
    this.root[i * 4 + 2] = z;
    this.root[i * 4 + 3] = yaw;
    this.mask[i] = mask;
  }

  finish(): void {
    const n = this.n;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    for (const [a, r, size] of [
      [this.rootAttr, this.rng, 4],
      [this.maskAttr, this.rng2, 1],
    ] as const) {
      a.updateRanges.length = 0;
      if (n > 0) {
        r.start = 0;
        r.count = n * size;
        a.updateRanges.push(r);
        a.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** the order in front of a seated café patron (bitmask of parts): by hour and whether they eat */
export function settingMask(seed: number, meal: number, hours: number, first: boolean): number {
  const bit = (b: number) => 1 << b;
  let h = Math.sin(seed * 71.3 + 4.1) * 43758.5453;
  const r = h - Math.floor(h);
  h = Math.sin(seed * 19.9 + 7.7) * 43758.5453;
  const r2 = h - Math.floor(h);
  let m = 0;
  const evening = hours >= 17.5 || hours < 2;
  const morning = hours >= 6 && hours < 11;
  if (meal) {
    m |= bit(TW.PLATE) | bit(r < 0.5 ? TW.SALAD : TW.PASTA);
    m |= bit(evening ? (r2 < 0.55 ? TW.WINE : TW.BEER) : r2 < 0.5 ? TW.ICED : TW.SAUCER) | bit(TW.WATER);
    if (m & bit(TW.SAUCER)) m |= bit(TW.CUP);
  } else if (evening) {
    m |= bit(r < 0.38 ? TW.WINE : r < 0.68 ? TW.SPRITZ : r < 0.9 ? TW.BEER : TW.ICED);
    if (r2 < 0.3) m |= bit(TW.WATER);
  } else {
    // coffee (most), iced coffee / lemonade on warm afternoons
    if (r < 0.75 || morning) m |= bit(TW.SAUCER) | bit(TW.CUP);
    else m |= bit(TW.ICED);
    if (morning && r2 < 0.45) m |= bit(TW.CROISSANT);
    else if (r2 < 0.25) m |= bit(TW.WATER);
  }
  if (first && evening && r2 > 0.6) m |= bit(TW.BOTTLE);
  if (first && (hours >= 18.3 || hours < 2)) m |= bit(TW.CANDLE);
  return m;
}

/** parts that leave the table while the patron drinks: the cup (in-hand prop) or the glass */
export const HELD_CUP = 1 << TW.CUP;
export const HELD_GLASS = (1 << TW.WINE) | (1 << TW.SPRITZ) | (1 << TW.BEER) | (1 << TW.ICED);

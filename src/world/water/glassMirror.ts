// Shop glass mirrors the real street (close-up round, ?noglassmirror). While the camera is down in the streets with no water near,
// the water's planar reflection pass (water/reflection.ts) moves onto the plane of the shop fronts the eye is looking at: the same
// pass, the same cost, a different plane. Fronts along one side of a street share a plane; a pane within `TOL` of it reads the mirror,
// and any other pane keeps the painted street of the facade shader (bhOpp). So does everything on the medium and low tiers.
//
// Off (level 0, or nothing to look at): uGM.x stays 0 and the lookup is skipped.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { DIR_VEC } from '../../core/geom';

const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
blank.needsUpdate = true;
export const GLASS_MIRROR_BLANK = blank;

/** shared by the shop-front program and the reflection pass */
export const glassMirror = {
  tGM: { value: blank as THREE.Texture },
  uGMMat: { value: new THREE.Matrix4() },
  /** x strength (0 off), y z: plane normal xz, w: plane constant */
  uGM: { value: new THREE.Vector4(0, 0, 0, 0) },
};

/** how far (m) a pane may stand off the plane and still read the mirror */
const TOL = 1.6;

/** GLSL (facade, shop fronts): the mirror over the sky `sky`, into `res` (a: how open to the sky that reflection is); returns how much it applies */
export const GLASS_MIRROR_GLSL = /* glsl */ `
uniform sampler2D tGM;
uniform mat4 uGMMat;
uniform vec4 uGM;
float bhGlassMirror(vec3 wp, vec3 N, vec2 wob, float lod, vec3 sky, out vec4 res) {
  res = vec4(sky, 1.0);
  if (uGM.x < 0.004 || dot(N.xz, uGM.yz) < 0.9) return 0.0;
  float off = dot(wp.xz, uGM.yz) + uGM.w;
  float k = uGM.x * (1.0 - smoothstep(${(TOL * 0.7).toFixed(2)}, ${TOL.toFixed(2)}, abs(off)));
  if (k <= 0.0) return 0.0;
  // the mirror lies on the plane, and a door or pane set back from it would look outside the picture: read where the view ray crosses the plane
  vec3 ey = cameraPosition - wp;
  vec4 c = uGMMat * vec4(wp - ey * off / dot(ey.xz, uGM.yz), 1.0);
  vec4 r = textureLod(tGM, c.xy / c.w + wob, lod);
  res = vec4(r.rgb + sky * (1.0 - r.a), 1.0 - r.a);
  return k;
}
`;

export interface GlassPlane {
  nx: number;
  nz: number;
  d: number;
}

interface Front {
  /** along-the-wall axis extent */
  a0: number;
  a1: number;
}

interface Group extends GlassPlane {
  /** true: the wall runs along z */
  alongZ: boolean;
  fronts: Front[];
  score: number;
}

/** the shop fronts of the plan as planes, and which one the eye is on */
export function createGlassPicker(ctx: CityContext) {
  const groups: Group[] = [];
  for (const lot of ctx.plan.lots) {
    if (!lot.shopfront) continue;
    const f = lot.footprint;
    const n = DIR_VEC[lot.front];
    const alongZ = n.x !== 0;
    const off = alongZ ? (n.x > 0 ? f.x1 : f.x0) : n.z > 0 ? f.z1 : f.z0;
    const d = -(alongZ ? n.x * off : n.z * off);
    let g = groups.find((q) => q.nx === n.x && q.nz === n.z && Math.abs(q.d - d) < TOL * 0.6);
    if (!g) {
      g = { nx: n.x, nz: n.z, d, alongZ, fronts: [], score: 0 };
      groups.push(g);
    }
    g.fronts.push({ a0: alongZ ? f.z0 : f.x0, a1: alongZ ? f.z1 : f.x1 });
  }
  const _f = new THREE.Vector3();
  let best: Group | null = null;
  return {
    count: groups.length,
    /** the plane the eye is on now, or null */
    pick(): GlassPlane | null {
      const cam = ctx.camera;
      const p = cam.position;
      cam.getWorldDirection(_f);
      let top: Group | null = null;
      let topS = 0;
      for (const g of groups) {
        g.score = 0;
        const sd = g.nx * p.x + g.nz * p.z + g.d;
        if (sd < 0.2 || sd > 34) continue;
        const pa = g.alongZ ? p.z : p.x;
        for (const fr of g.fronts) {
          const near = pa < fr.a0 ? fr.a0 : pa > fr.a1 ? fr.a1 : pa;
          const da = near - pa;
          const dist = Math.hypot(sd, da, 1.5);
          if (dist > 42) continue;
          // the middle of what shows of this front, seen from here
          const mid = Math.min(fr.a1, Math.max(fr.a0, near + Math.sign(da || 1) * 3));
          const ta = mid - pa;
          const tx = g.alongZ ? -g.nx * sd : ta;
          const tz = g.alongZ ? ta : -g.nz * sd;
          const tl = Math.hypot(tx, tz) || 1;
          const facing = (_f.x * tx + _f.z * tz) / tl;
          if (facing < 0.25) continue;
          g.score += (facing * Math.min(fr.a1 - fr.a0, 14)) / dist;
        }
        if (g.score > topS) {
          topS = g.score;
          top = g;
        }
      }
      // stay on the current plane unless another is clearly better: a switch costs a fade
      if (best && top !== best && best.score * 1.35 > topS) top = best;
      best = topS > 0.12 ? top : null;
      return best;
    },
  };
}

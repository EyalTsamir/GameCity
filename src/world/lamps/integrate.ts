// Automatic lamp-light integration for built-in lit materials (Lambert / Phong / Standard /
// Physical): wraps the material's onBeforeCompile so that, AFTER the owner's own patch ran, the
// lamp light is added after `#include <lights_fragment_end>` — unless the owner's shader already
// calls thLampLight (then nothing changes, so it can never double-light a material).
//
// Used for materials whose owners do not integrate the light themselves (vehicles, people, trains,
// boats…) and, with ?lampall, as a whole-city preview of the final night look.
//
// Usage (one line, after the material's own onBeforeCompile / customProgramCacheKey are set):
//     import { patchLampMaterial } from '../../world/lamps/integrate';
//     patchLampMaterial(material);
// Works for MeshLambert / MeshPhong / MeshStandard / MeshPhysical (needs vViewPosition + normal +
// `#include <lights_fragment_end>`); other material types are ignored. Current users:
// src/sim/traffic/vehicleMaterial.ts, src/sim/rail/trainMaterial.ts.

import * as THREE from 'three';
import { LAMP_APPLY_VIEW, LAMP_GLSL, lampUniforms } from '../../core/lampLight';

const PATCHED = Symbol('thLampPatched');

type Lit = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial;

function isLit(m: THREE.Material): m is Lit {
  return (m as THREE.MeshStandardMaterial).isMeshStandardMaterial === true || (m as THREE.MeshLambertMaterial).isMeshLambertMaterial === true || (m as THREE.MeshPhongMaterial).isMeshPhongMaterial === true;
}

/** Patch one material (idempotent). Returns true when a patch was installed. */
export function patchLampMaterial(mat: THREE.Material): boolean {
  if (!isLit(mat)) return false;
  const tagged = mat as unknown as Record<symbol, boolean>;
  if (tagged[PATCHED]) return false;
  tagged[PATCHED] = true;
  const prev = mat.onBeforeCompile;
  const ownKey = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey : null;
  // the default cache key is the onBeforeCompile source: capture it before wrapping
  const baseKey = ownKey ? null : prev.toString();
  mat.onBeforeCompile = function (shader, renderer) {
    prev.call(this, shader, renderer);
    if (shader.fragmentShader.includes('thLampLight(')) return;
    if (!shader.fragmentShader.includes('#include <lights_fragment_end>')) return;
    Object.assign(shader.uniforms, lampUniforms());
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${LAMP_GLSL}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${LAMP_APPLY_VIEW}`);
  };
  mat.customProgramCacheKey = () => (ownKey ? ownKey.call(mat) : baseKey) + '|thlamp1';
  mat.needsUpdate = true;
  return true;
}

/** Patch every lit material under `root` accepted by `filter` (default: all). Returns the count. */
export function patchLampScene(root: THREE.Object3D, filter?: (mesh: THREE.Mesh, mat: THREE.Material) => boolean): number {
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) if ((!filter || filter(mesh, m)) && patchLampMaterial(m)) n++;
  });
  return n;
}

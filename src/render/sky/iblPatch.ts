// One-time patch of three's IBL chunk (applied by the sky module before any material
// compiles): the DIFFUSE part of the image-based light (the PMREM sky's irradiance) is
// scaled by IBL_DIFFUSE, while the specular part (reflections on glass, water, paint)
// keeps the full scene.environmentIntensity.
//
// Why: the studio key wants a weak, cool sky fill (so the sun models the faces and
// shadows read) but glass and water still need bright sky reflections. With one
// environment intensity those two goals fight; this decouples them for every lit
// material at once (MeshStandard/Physical and any onBeforeCompile variant of them).
// Skipped with ?legacylight.

import * as THREE from 'three';

/** diffuse IBL relative to specular IBL */
export const IBL_DIFFUSE = 0.6;

let patched = false;

export function patchIBLChunk(): boolean {
  if (patched) return true;
  const key = 'envmap_physical_pars_fragment';
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  const src = chunks[key];
  if (typeof src !== 'string') return false;
  const ret = 'return PI * envMapColor.rgb * envMapIntensity;';
  const at = src.indexOf(ret);
  if (at < 0) return false;
  chunks[key] = src.slice(0, at) + `return PI * envMapColor.rgb * envMapIntensity * ${IBL_DIFFUSE.toFixed(3)};` + src.slice(at + ret.length);
  patched = true;
  return true;
}

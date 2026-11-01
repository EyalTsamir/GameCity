// A shadow map for a sampler2DShadow to hold while the sun has none yet (the first frames, or a page opened at night). three's own stand-in
// for a null shadow sampler is a DepthTexture that was never uploaded, so what gets bound is an empty colour texture, and the draw is
// rejected: "Mismatch between texture format and sampler type". This one has storage and a compare mode, and reads as lit.

import * as THREE from 'three';

let blank: THREE.DepthTexture | null = null;

export function blankShadowMap(renderer: THREE.WebGLRenderer): THREE.DepthTexture {
  if (blank) return blank;
  const t = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  t.format = THREE.DepthFormat;
  t.compareFunction = renderer.capabilities.reversedDepthBuffer ? THREE.GreaterEqualCompare : THREE.LessEqualCompare;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  renderer.initRenderTarget(new THREE.WebGLRenderTarget(1, 1, { depthTexture: t, depthBuffer: true }));
  blank = t;
  return t;
}

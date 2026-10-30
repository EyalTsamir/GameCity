// Shadow pass LOD (geometry hunt): the sun's 2048² map is fitted around the camera focus, from 181 m across at street
// level (9 cm a texel) to 1825 m at the overview (0.9 m a texel). Trims, poles and people are far below a texel in the
// wide fits, yet every caster was drawn: half of the frame's triangles were the shadow pass. Casters whose parts are all
// thinner than a couple of texels stop casting once the fit is that coarse (they cast again as the camera comes back).
// The rules go by mesh name, so no module needs to know; the switch only happens when a threshold is crossed.
// ?noshadowlod = every caster always.

import type * as THREE from 'three';
import type { CityContext } from '../core/context';
import { geomHunt } from '../core/geomhunt';

/** [mesh path pattern, largest texel size (m) at which it still casts] */
const RULES: [RegExp, number][] = [
  // parts of 5–30 cm: cornices, sills, balusters, signal heads, street furniture, rail furniture, bikes
  [/buildings-(trim|lights|signs)|traffic-signal|props-casters|rail-furniture|rail-fixings|traffic-(bike|moto|scooter)|terrain-railings|life-|street-vendors|tableware/, 0.2],
  // parts of 0.5–2 m: cars, small craft, kinetic landmark parts, kit round the harbour, farm life
  [/traffic-|boats-small|boats-big-(3|4)|ambient-vehicles|landmarks-kinetic|harbor-(beach|rides|animated)|land-(tractor|sheep|cows|farmlife)|rail-(loco|wagon)/, 0.42],
];

interface Entry {
  mesh: THREE.Object3D;
  maxTexel: number;
}

/** call once the modules are built; returns the per-frame step (null when off / no shadows) */
export function createShadowLod(ctx: CityContext): (() => void) | null {
  if (!geomHunt(ctx, 'shadowlod')) return null;
  let sun: THREE.DirectionalLight | null = null;
  const entries: Entry[] = [];
  ctx.scene.traverse((o) => {
    const l = o as THREE.DirectionalLight;
    if (l.isDirectionalLight && l.castShadow && !sun) sun = l;
    if (!o.castShadow) return;
    let path = o.name;
    for (let p = o.parent; p && p !== ctx.scene; p = p.parent) path = `${p.name}/${path}`;
    for (const [re, maxTexel] of RULES) {
      if (re.test(path)) {
        entries.push({ mesh: o, maxTexel });
        break;
      }
    }
  });
  if (!sun || !entries.length) return null;
  const light: THREE.DirectionalLight = sun;
  let last = -1;
  return () => {
    const cam = light.shadow.camera;
    const texel = (cam.right - cam.left) / light.shadow.mapSize.x;
    if (Math.abs(texel - last) < 1e-4) return;
    // (5 % hysteresis: the fit breathes with the camera; a caster must not flicker at the threshold)
    for (const e of entries) {
      if (texel > e.maxTexel * 1.05) e.mesh.castShadow = false;
      else if (texel < e.maxTexel * 0.95) e.mesh.castShadow = true;
    }
    last = texel;
  };
}

// Camera focus lookup shared by the sky (shadow fitting) and post-processing
// (tilt-shift focus). Both run before the camera module in the load order, so the
// camera service is looked up lazily every frame; without it we intersect the view
// ray with the ground plane.

import * as THREE from 'three';
import type { CityContext } from '../core/context';

const _dir = new THREE.Vector3();

/** Writes the focus point into `out` and returns the camera→focus distance (m). */
export function cameraFocus(ctx: CityContext, out: THREE.Vector3): number {
  const cam = ctx.services.camera;
  const p = ctx.camera.position;
  if (cam) {
    try {
      const st = cam.getState();
      if (st && Number.isFinite(st.target.x) && Number.isFinite(st.target.y) && Number.isFinite(st.target.z)) {
        out.set(st.target.x, st.target.y, st.target.z);
        const d = p.distanceTo(out);
        if (d > 0.5 && Number.isFinite(d)) return d;
      }
    } catch {
      /* fall through to the ray test */
    }
  }
  ctx.camera.getWorldDirection(_dir);
  if (_dir.y < -1e-3) {
    const t = Math.min(4000, -p.y / _dir.y);
    out.copy(p).addScaledVector(_dir, t);
    return t;
  }
  out.copy(p).addScaledVector(_dir, 300);
  return 300;
}

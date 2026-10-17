// Debug-only stand-in ground (?tground): flat asphalt + sidewalks so the traffic
// can be inspected with ?only=sky,traffic before/without the roads module.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { CORRIDOR_HALF, ROAD_HALF } from '../../core/constants';

export function debugGround(ctx: CityContext): THREE.Group {
  const g = new THREE.Group();
  g.name = 'traffic-debug-ground';
  const asphalt = new THREE.MeshStandardMaterial({ color: '#4a4d52', roughness: 0.95 });
  const walk = new THREE.MeshStandardMaterial({ color: '#d9d3c7', roughness: 0.95 });
  const grass = new THREE.MeshStandardMaterial({ color: '#8fbf5a', roughness: 1 });
  const base = new THREE.Mesh(new THREE.PlaneGeometry(400, 340), grass);
  base.rotation.x = -Math.PI / 2;
  base.position.set(0, -0.02, -20);
  base.receiveShadow = true;
  g.add(base);
  const plan = ctx.plan;
  for (const seg of plan.roadSegments) {
    const A = plan.roadNodes[seg.a],
      B = plan.roadNodes[seg.b];
    const horiz = Math.abs(B.x - A.x) > Math.abs(B.z - A.z);
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    const cx = (A.x + B.x) / 2,
      cz = (A.z + B.z) / 2;
    const side = seg.sidewalks ? CORRIDOR_HALF : ROAD_HALF + 0.6;
    const sw = new THREE.Mesh(new THREE.BoxGeometry(horiz ? L + 13 : side * 2, 0.15, horiz ? side * 2 : L + 13), walk);
    sw.position.set(cx, 0.075, cz);
    sw.receiveShadow = true;
    g.add(sw);
    const rd = new THREE.Mesh(new THREE.PlaneGeometry(horiz ? L : ROAD_HALF * 2, horiz ? ROAD_HALF * 2 : L), asphalt);
    rd.rotation.x = -Math.PI / 2;
    rd.position.set(cx, 0.16, cz);
    rd.receiveShadow = true;
    g.add(rd);
  }
  for (const I of ctx.roads.intersections) {
    if (I.control === 'portal') continue;
    const rd = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, ROAD_HALF * 2), asphalt);
    rd.rotation.x = -Math.PI / 2;
    rd.position.set(I.x, 0.161, I.z);
    rd.receiveShadow = true;
    g.add(rd);
  }
  // the debug asphalt sits on top of the debug sidewalk slabs: lift everything else visually by 0.15
  g.position.y = -0.15;
  return g;
}

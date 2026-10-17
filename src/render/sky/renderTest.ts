// Debug-only stand-in city (loaded only with ?rendertest) so lighting, shadows,
// tilt-shift, bloom and fog can be evaluated before the real world modules exist.
// Built straight from the plan: terrain heights, roads, lot boxes, window bands
// that light up at night, trees, street lamps, cars and a water plane.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { PALETTE, box, merge, paint } from '../../core/gfx';
import { SLAB_BOTTOM, WATER_LEVEL, ROAD_HALF, CORRIDOR_HALF } from '../../core/constants';

export interface RenderTest {
  group: THREE.Group;
  update(lights: number): void;
}

export function buildRenderTest(ctx: CityContext): RenderTest {
  const { plan } = ctx;
  const rng = ctx.rng('rendertest');
  const group = new THREE.Group();
  group.name = 'rendertest';
  const s = plan.slab;

  // ── terrain grid following plan.heightAt
  const step = 4;
  const nx = Math.round((s.x1 - s.x0) / step),
    nz = Math.round((s.z1 - s.z0) / step);
  const tg = new THREE.PlaneGeometry(s.x1 - s.x0, s.z1 - s.z0, nx, nz);
  tg.rotateX(-Math.PI / 2);
  tg.translate((s.x0 + s.x1) / 2, 0, (s.z0 + s.z1) / 2);
  const tp = tg.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(tp.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i),
      z = tp.getZ(i);
    const h = plan.heightAt(x, z);
    tp.setY(i, Math.max(h, -6) - 0.02);
    if (h < WATER_LEVEL) c.set(PALETTE.sandWet);
    else if (h > 1) c.set(PALETTE.grassDark).lerp(new THREE.Color(PALETTE.grass), Math.min(1, h / 20));
    else c.set(PALETTE.grass);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tg.computeVertexNormals();
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const ground = new THREE.Mesh(tg, groundMat);
  ground.receiveShadow = true;
  group.add(ground);

  // slab sides + wooden plinth
  const sideGeos: THREE.BufferGeometry[] = [];
  const w = s.x1 - s.x0,
    d = s.z1 - s.z0;
  sideGeos.push(box(w - 0.4, -SLAB_BOTTOM - 6.3, d - 0.4, (s.x0 + s.x1) / 2, SLAB_BOTTOM, (s.z0 + s.z1) / 2, PALETTE.soilTop));
  sideGeos.push(box(w + 3, 2.2, d + 3, (s.x0 + s.x1) / 2, SLAB_BOTTOM - 2.2, (s.z0 + s.z1) / 2, PALETTE.deck));
  const sides = new THREE.Mesh(merge(sideGeos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  sides.receiveShadow = true;
  group.add(sides);

  // water
  const water = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.6, d - 0.6), new THREE.MeshStandardMaterial({ color: PALETTE.waterDeep, roughness: 0.12, metalness: 0.0 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set((s.x0 + s.x1) / 2, WATER_LEVEL, (s.z0 + s.z1) / 2);
  water.receiveShadow = true;
  group.add(water);

  // ── roads + sidewalks
  const roadGeos: THREE.BufferGeometry[] = [];
  const walkGeos: THREE.BufferGeometry[] = [];
  for (const seg of plan.roadSegments) {
    const A = plan.roadNodes[seg.a],
      B = plan.roadNodes[seg.b];
    const horiz = Math.abs(B.x - A.x) > Math.abs(B.z - A.z);
    const len = horiz ? Math.abs(B.x - A.x) : Math.abs(B.z - A.z);
    const mx = (A.x + B.x) / 2,
      mz = (A.z + B.z) / 2;
    if (horiz) {
      roadGeos.push(box(len + 2 * ROAD_HALF, 0.06, 2 * ROAD_HALF, mx, 0.0, mz, PALETTE.asphalt));
      if (seg.sidewalks) {
        walkGeos.push(box(len + 2 * CORRIDOR_HALF, 0.15, CORRIDOR_HALF - ROAD_HALF, mx, 0, mz - (ROAD_HALF + CORRIDOR_HALF) / 2, PALETTE.sidewalk));
        walkGeos.push(box(len + 2 * CORRIDOR_HALF, 0.15, CORRIDOR_HALF - ROAD_HALF, mx, 0, mz + (ROAD_HALF + CORRIDOR_HALF) / 2, PALETTE.sidewalk));
      }
    } else {
      roadGeos.push(box(2 * ROAD_HALF, 0.06, len + 2 * ROAD_HALF, mx, 0.0, mz, PALETTE.asphalt));
      if (seg.sidewalks) {
        walkGeos.push(box(CORRIDOR_HALF - ROAD_HALF, 0.15, len, mx - (ROAD_HALF + CORRIDOR_HALF) / 2, 0, mz, PALETTE.sidewalk));
        walkGeos.push(box(CORRIDOR_HALF - ROAD_HALF, 0.15, len, mx + (ROAD_HALF + CORRIDOR_HALF) / 2, 0, mz, PALETTE.sidewalk));
      }
    }
  }
  const roadMesh = new THREE.Mesh(merge([...roadGeos, ...walkGeos]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // ── buildings
  const solid: THREE.BufferGeometry[] = [];
  const glassy: THREE.BufferGeometry[] = [];
  const bandsLit: THREE.BufferGeometry[] = [];
  const bandsDark: THREE.BufferGeometry[] = [];
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rng.next() * arr.length) % arr.length];
  for (const lot of plan.lots) {
    const f = lot.footprint;
    const bw = f.x1 - f.x0,
      bd = f.z1 - f.z0;
    const cx = (f.x0 + f.x1) / 2,
      cz = (f.z0 + f.z1) / 2;
    const h = Math.max(3, lot.height);
    if (lot.kind === 'tvtower') {
      const shaft = new THREE.CylinderGeometry(1.6, 3.2, h * 0.82, 16, 1);
      shaft.translate(cx, (h * 0.82) / 2, cz);
      paint(shaft, PALETTE.concrete);
      const pod = new THREE.SphereGeometry(6, 20, 12);
      pod.translate(cx, h * 0.7, cz);
      paint(pod, PALETTE.metal[1]);
      const mast = new THREE.CylinderGeometry(0.3, 0.6, h * 0.2, 8);
      mast.translate(cx, h * 0.9, cz);
      paint(mast, '#d94d3a');
      solid.push(shaft.toNonIndexed(), pod.toNonIndexed(), mast.toNonIndexed());
      continue;
    }
    let colr: string;
    let glass = false;
    switch (lot.district) {
      case 'downtown':
      case 'midtown':
        glass = lot.kind === 'tower' || rng.next() < 0.5;
        colr = glass ? pick(PALETTE.glass) : pick(PALETTE.stoneFacade);
        break;
      case 'industrial':
      case 'harbor':
        colr = rng.next() < 0.6 ? pick(PALETTE.brick) : pick(PALETTE.metal);
        break;
      case 'civic':
      case 'station':
        colr = pick(PALETTE.stoneFacade);
        break;
      default:
        colr = pick(PALETTE.pastel);
    }
    const g = box(bw, h, bd, cx, 0, cz, colr);
    (glass ? glassy : solid).push(g.toNonIndexed());
    if (lot.roof === 'gable' || lot.roof === 'hip') {
      const rh = Math.min(bw, bd) * 0.35;
      const roof = new THREE.CylinderGeometry(0.01, Math.SQRT1_2 * Math.max(bw, bd), rh, 4, 1);
      roof.rotateY(Math.PI / 4);
      roof.scale(bw / Math.max(bw, bd), 1, bd / Math.max(bw, bd));
      roof.translate(cx, h + rh / 2, cz);
      paint(roof, pick(PALETTE.roofs));
      solid.push(roof.toNonIndexed());
    }
    // window bands per floor
    const floors = Math.max(1, Math.floor(h / 3.4));
    for (let k = 0; k < floors; k++) {
      const y = k * 3.4 + 1.1;
      if (y + 1.3 > h - 0.4) break;
      const band = box(bw + 0.08, 1.25, bd + 0.08, cx, y, cz, '#ffffff');
      (rng.next() < 0.55 ? bandsLit : bandsDark).push(band.toNonIndexed());
    }
  }
  const bMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });
  const gMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.25 });
  const bMesh = new THREE.Mesh(merge(solid), bMat);
  bMesh.castShadow = bMesh.receiveShadow = true;
  const gMesh = new THREE.Mesh(merge(glassy), gMat);
  gMesh.castShadow = gMesh.receiveShadow = true;
  group.add(bMesh, gMesh);
  const winLit = new THREE.MeshStandardMaterial({ color: PALETTE.windowFrame, roughness: 0.3, metalness: 0.1, emissive: PALETTE.windowWarm, emissiveIntensity: 0 });
  const winDark = new THREE.MeshStandardMaterial({ color: PALETTE.windowFrame, roughness: 0.3, metalness: 0.1 });
  const lit = new THREE.Mesh(merge(bandsLit), winLit);
  const dark = new THREE.Mesh(merge(bandsDark), winDark);
  lit.receiveShadow = dark.receiveShadow = true;
  group.add(lit, dark);

  // ── trees in green areas
  const treePts: THREE.Vector3[] = [];
  for (const a of plan.areas) {
    if (a.greenery < 0.3) continue;
    const ar = (a.rect.x1 - a.rect.x0) * (a.rect.z1 - a.rect.z0);
    const n = Math.min(40, Math.floor((ar / 160) * a.greenery));
    for (let i = 0; i < n; i++) {
      const x = a.rect.x0 + 2 + rng.next() * (a.rect.x1 - a.rect.x0 - 4);
      const z = a.rect.z0 + 2 + rng.next() * (a.rect.z1 - a.rect.z0 - 4);
      if (plan.isWater(x, z)) continue;
      treePts.push(new THREE.Vector3(x, plan.heightAt(x, z), z));
    }
  }
  for (const sl of plan.slots) if (sl.kind === 'tree') treePts.push(new THREE.Vector3(sl.x, 0.15, sl.z));
  const crownGeo = new THREE.IcosahedronGeometry(1, 2);
  const crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: '#6fa64a', roughness: 0.9, flatShading: false }), treePts.length);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 1, 6), new THREE.MeshStandardMaterial({ color: '#7a5636', roughness: 0.9 }), treePts.length);
  const m = new THREE.Matrix4();
  treePts.forEach((p, i) => {
    const sc = 2.4 + rng.next() * 1.6;
    m.makeScale(sc, sc * 1.1, sc).setPosition(p.x, p.y + 2.2 + sc, p.z);
    crown.setMatrixAt(i, m);
    crown.setColorAt(i, c.set(pick(['#6fa64a', '#5d9440', '#82b552', '#6a9e3e'])));
    m.makeScale(1, 2.6 + sc * 0.4, 1).setPosition(p.x, p.y + 1.3, p.z);
    trunk.setMatrixAt(i, m);
  });
  crown.castShadow = trunk.castShadow = true;
  crown.receiveShadow = true;
  group.add(crown, trunk);

  // ── street lamps (emissive heads)
  const lampSlots = plan.slots.filter((sl) => sl.kind === 'lamp');
  const headMat = new THREE.MeshStandardMaterial({ color: '#e8e2d0', emissive: PALETTE.lampWarm, emissiveIntensity: 0 });
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.38, 10, 8), headMat, lampSlots.length);
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.12, 1, 6), new THREE.MeshStandardMaterial({ color: '#39414a', roughness: 0.6 }), lampSlots.length);
  lampSlots.forEach((sl, i) => {
    m.makeTranslation(sl.x, 6.2, sl.z);
    heads.setMatrixAt(i, m);
    m.makeScale(1, 6.2, 1).setPosition(sl.x, 3.1, sl.z);
    poles.setMatrixAt(i, m);
  });
  group.add(heads, poles);

  // ── parked / stopped cars with head & tail lights
  const nCars = 70;
  const carBody = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 1.3, 4.3), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.2 }), nCars);
  const lightMat = new THREE.MeshStandardMaterial({ color: '#222', emissive: '#fff4d8', emissiveIntensity: 0 });
  const heads2 = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.25, 0.1), lightMat, nCars);
  const tailMat = new THREE.MeshStandardMaterial({ color: '#311', emissive: '#ff3020', emissiveIntensity: 0 });
  const tails = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.22, 0.1), tailMat, nCars);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < nCars; i++) {
    const seg = plan.roadSegments[Math.floor(rng.next() * plan.roadSegments.length)];
    const A = plan.roadNodes[seg.a],
      B = plan.roadNodes[seg.b];
    const t = 0.2 + rng.next() * 0.6;
    const dx = B.x - A.x,
      dz = B.z - A.z;
    const L = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const side = rng.next() < 0.5 ? 1 : -1;
    const ox = (dz / L) * 1.75 * side,
      oz = (-dx / L) * 1.75 * side;
    const x = A.x + dx * t + ox,
      z = A.z + dz * t + oz;
    const fy = side > 0 ? yaw : yaw + Math.PI;
    q.setFromAxisAngle(up, fy);
    m.compose(new THREE.Vector3(x, 0.75, z), q, new THREE.Vector3(1, 1, 1));
    carBody.setMatrixAt(i, m);
    carBody.setColorAt(i, c.set(pick(PALETTE.accents)));
    const fx = Math.sin(fy),
      fz = Math.cos(fy);
    m.compose(new THREE.Vector3(x + fx * 2.16, 0.75, z + fz * 2.16), q, new THREE.Vector3(1, 1, 1));
    heads2.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x - fx * 2.16, 0.8, z - fz * 2.16), q, new THREE.Vector3(1, 1, 1));
    tails.setMatrixAt(i, m);
  }
  carBody.castShadow = true;
  carBody.receiveShadow = true;
  group.add(carBody, heads2, tails);

  ctx.scene.add(group);
  return {
    group,
    update(l) {
      winLit.emissiveIntensity = l * 1.8;
      headMat.emissiveIntensity = l * 6;
      lightMat.emissiveIntensity = l * 5;
      tailMat.emissiveIntensity = l * 3;
    },
  };
}

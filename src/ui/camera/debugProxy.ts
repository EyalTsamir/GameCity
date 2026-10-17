// Debug-only stand-in city for testing the camera / UI in isolation (?camdebug).
// Builds simple boxes for the lots, a ground slab and water, plus a few fake moving
// entities (cars on lanes, a bus, a train, a boat) with a picker so follow / chase /
// tour can be exercised without the real world modules.

import * as THREE from 'three';
import type { CityContext, PickHit } from '../../core/context';
import { box, merge, paint } from '../../core/gfx';
import { RAIL_Z, WATER_LEVEL } from '../../core/constants';
import type { Path2 } from '../../core/geom';

interface Fake {
  kind: PickHit['kind'];
  id: number;
  label: string;
  mesh: THREE.Mesh;
  path: Path2 | null;
  /** current lane id (or -1 while on a movement / walking) */
  lane: number;
  move: number;
  walk?: boolean;
  s: number;
  speed: number;
  heading: number;
  size: THREE.Vector3;
  boat?: { cx: number; cz: number; r: number; a: number };
  train?: { x: number; dir: number };
}

export function buildDebugProxy(ctx: CityContext): { update(dt: number): void } {
  const { plan, scene, roads } = ctx;
  const geos: THREE.BufferGeometry[] = [];
  const s = plan.slab;
  // slab + ground
  geos.push(box(s.x1 - s.x0, 1, s.z1 - s.z0, (s.x0 + s.x1) / 2, -1.02, (s.z0 + s.z1) / 2, '#9cc06a'));
  for (const b of plan.blocks) geos.push(box(b.rect.x1 - b.rect.x0, 0.05, b.rect.z1 - b.rect.z0, (b.rect.x0 + b.rect.x1) / 2, 0, (b.rect.z0 + b.rect.z1) / 2, b.kind === 'park' ? '#86b85a' : '#d9d0bd'));
  for (const seg of plan.roadSegments) {
    const A = plan.roadNodes[seg.a],
      B = plan.roadNodes[seg.b];
    const len = Math.hypot(B.x - A.x, B.z - A.z);
    const g = box(7, 0.04, len, 0, 0.01, 0, '#55585e');
    g.rotateY(Math.atan2(B.x - A.x, B.z - A.z));
    g.translate((A.x + B.x) / 2, 0, (A.z + B.z) / 2);
    geos.push(g);
  }
  const colors: Record<string, string> = { downtown: '#7f9fb8', midtown: '#9fb3c4', oldtown: '#e8b4a0', market: '#f2d6a2', industrial: '#a0553d', harbor: '#8b98a3', station: '#b8a9c9', residential: '#f0e6d8', suburb: '#f0e6d8', civic: '#e9c46a' };
  for (const lot of plan.lots) {
    const f = lot.footprint;
    geos.push(box(f.x1 - f.x0, lot.height, f.z1 - f.z0, (f.x0 + f.x1) / 2, 0, (f.z0 + f.z1) / 2, colors[lot.district] ?? '#ddd'));
  }
  // hills (coarse)
  const hill = new THREE.PlaneGeometry(s.x1 - s.x0, 40, 100, 20);
  hill.rotateX(-Math.PI / 2);
  hill.translate((s.x0 + s.x1) / 2, 0, -170);
  const pa = hill.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) pa.setY(i, Math.max(0, plan.heightAt(pa.getX(i), pa.getZ(i))) + 0.05);
  hill.computeVertexNormals();
  paint(hill, '#7fa85a');
  hill.deleteAttribute('uv');
  for (const g of geos) g.deleteAttribute('uv');
  geos.push(hill);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const city = new THREE.Mesh(merge(geos), mat);
  city.name = 'camdebug-city';
  scene.add(city);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#4aa3c4' }));
  water.rotation.x = -Math.PI / 2;
  water.scale.set(s.x1 - 136, s.z1 - s.z0, 1);
  water.position.set((136 + s.x1) / 2, WATER_LEVEL, (s.z0 + s.z1) / 2);
  scene.add(water);
  const river = water.clone();
  river.scale.set(s.x1 - s.x0, 16, 1);
  river.position.set(0, WATER_LEVEL, 118);
  scene.add(river);

  // fake entities
  const fakes: Fake[] = [];
  const mk = (kind: PickHit['kind'], size: THREE.Vector3, color: string, label: string): Fake => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshLambertMaterial({ color }));
    m.geometry.translate(0, size.y / 2, 0);
    scene.add(m);
    const f: Fake = { kind, id: fakes.length, label, mesh: m, path: null, lane: -1, move: -1, s: 0, speed: 0, heading: 0, size };
    fakes.push(f);
    return f;
  };
  const lanes = roads.lanes.filter((l) => !l.sink && !l.source);
  for (let i = 0; i < 24; i++) {
    const f = mk('vehicle', new THREE.Vector3(1.8, 1.45, 4.3), ['#e63946', '#f4a261', '#2a9d8f', '#457b9d'][i % 4], `Car ${i + 1}`);
    const lane = lanes[(i * 7) % lanes.length];
    f.path = lane.path;
    f.lane = lane.id;
    f.s = (i * 13) % Math.max(1, lane.length);
    f.speed = 8 + (i % 4);
  }
  for (let i = 0; i < 3; i++) {
    const f = mk('bus', new THREE.Vector3(2.5, 3.1, 11), '#e9c46a', `Bus ${i + 1} · Line ${'ABC'[i]}`);
    const lane = lanes[(i * 31 + 5) % lanes.length];
    f.path = lane.path;
    f.lane = lane.id;
    f.s = 5;
    f.speed = 7;
  }
  const tr = mk('train', new THREE.Vector3(3, 3.8, 60), '#c0392b', 'Regional train');
  tr.train = { x: plan.rail.x0 + 20, dir: 1 };
  tr.speed = 14;
  const bt = mk('boat', new THREE.Vector3(3, 2, 9), '#f1faee', 'Ferry “Marigold”');
  bt.boat = { cx: 165, cz: -40, r: 22, a: 0 };
  bt.speed = 0.12;
  for (let i = 0; i < 8; i++) {
    const f = mk('pedestrian', new THREE.Vector3(0.5, 1.75, 0.4), '#264653', `Walker ${i + 1}`);
    const lane = lanes[(i * 11 + 3) % lanes.length];
    f.path = lane.path.offset(5.4 - 1.75);
    f.walk = true;
    f.s = 3;
    f.speed = 1.4;
  }

  const box3 = new THREE.Box3();
  const tmp = new THREE.Vector3();
  ctx.pickers.push({
    name: 'camdebug',
    pick(ray) {
      let best: PickHit | null = null;
      for (const f of fakes) {
        if (!f.mesh.visible) continue;
        box3.setFromObject(f.mesh);
        const p = ray.intersectBox(box3, tmp);
        if (!p) continue;
        const d = p.distanceTo(ray.origin);
        if (best && d >= best.distance) continue;
        best = {
          kind: f.kind,
          id: f.id,
          distance: d,
          label: f.label,
          getPosition: (out) => {
            out.copy(f.mesh.position);
            return f.mesh.visible;
          },
          getHeading: () => f.heading,
          info: () => [`Debug ${f.kind}`, `${Math.round(f.speed * (f.boat ? 22 * 3.6 : 3.6))} km/h`],
        };
      }
      return best;
    },
  });

  return {
    update(dt: number) {
      for (const f of fakes) {
        if (f.path) {
          f.s += f.speed * dt;
          if (f.s > f.path.length) {
            if (f.walk) {
              // walkers turn around at the end of their block
              f.path = f.path.reversed();
              f.s = 0;
            } else if (f.lane >= 0) {
              // continue through the junction on a random movement (never into a tunnel sink)
              const outs = roads.lanes[f.lane].out.filter((m) => !roads.lanes[roads.movements[m].toLane].sink);
              const m = outs.length ? outs[Math.floor(Math.random() * outs.length)] : -1;
              if (m >= 0) {
                f.s -= f.path.length;
                f.move = m;
                f.lane = -1;
                f.path = roads.movements[m].path;
              } else f.s = f.path.length;
            } else if (f.move >= 0) {
              const nl = roads.movements[f.move].toLane;
              f.s -= f.path.length;
              f.lane = nl;
              f.move = -1;
              f.path = roads.lanes[nl].path;
            }
          }
          const p = f.path.at(f.s);
          f.mesh.position.set(p.x, 0.02, p.z);
          f.heading = f.path.yaw(f.s);
        } else if (f.train) {
          f.train.x += f.train.dir * f.speed * dt;
          if (f.train.x > plan.rail.x1 - 30) f.train.dir = -1;
          if (f.train.x < plan.rail.x0 + 30) f.train.dir = 1;
          f.mesh.position.set(f.train.x, plan.rail.railY, RAIL_Z);
          f.heading = f.train.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else if (f.boat) {
          f.boat.a += f.speed * dt;
          const b = f.boat;
          f.mesh.position.set(b.cx + Math.cos(b.a) * b.r, WATER_LEVEL, b.cz + Math.sin(b.a) * b.r * 2.2);
          // tangent of the ellipse
          f.heading = Math.atan2(-Math.sin(b.a) * b.r, Math.cos(b.a) * b.r * 2.2);
        }
        f.mesh.rotation.y = f.heading;
      }
    },
  };
}

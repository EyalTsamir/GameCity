// Country roads beyond the town (landscape/model.ts ROAD_DEFS): a draped ribbon per road (asphalt with
// worn edges and a dashed centre line; gravel lanes with a grass crown), stone tunnel portals where the
// town's two roads come out of the ridge, a stone bridge where a road crosses the river, and a few cars
// driving the roads (headlights at night). Ribbons + portals + bridges are one static mesh; the cars one
// small dynamic mesh (≈ 1 k vertices transformed on the CPU per frame).

import * as THREE from 'three';
import type { LandscapeModel, Road } from './model';
import { WL } from './model';
import { hash2i } from './noise';
import type { Fleet, FleetTemplate } from './fleet';

export interface CountryRoads {
  group: THREE.Group;
  update(dt: number): void;
  /** colours of the cars' bodies (Fleet.finish tint callback) */
  tint(item: number, vertex: number, out: number[]): boolean;
  triangles: number;
  cars: number;
}

const ROAD_FRAG = /* glsl */ `
varying vec2 vRS;   // (arc length m, across -1..1)
varying float vRK;  // 0 asphalt road, 1 gravel lane, 2 stone (portal / bridge)
uniform sampler2D tLN;
float rHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 roadAlbedo(vec3 wp) {
  float fp = length(fwidth(wp.xz));
  vec4 n1 = texture2D(tLN, wp.xz * 0.11);
  vec4 n2 = texture2D(tLN, wp.xz * 0.023);
  float a = abs(vRS.y);
  if (vRK > 2.5) return vec3(0.012, 0.011, 0.01); // the tunnel bore
  if (vRK > 1.5) {
    // dressed stone (portal headwalls, bridge)
    vec3 st = vec3(0.42, 0.39, 0.34) * (0.85 + 0.25 * n1.r);
    float course = fract(wp.y / 0.55);
    float joint = (1.0 - smoothstep(0.0, 0.07, course)) * (1.0 - smoothstep(0.05, 0.15, fp));
    return st * (1.0 - 0.35 * joint);
  }
  if (vRK > 0.5) {
    // gravel lane: two wheel tracks, a grassy crown, ragged grass edges
    vec3 grav = vec3(0.42, 0.38, 0.31) * (0.85 + 0.25 * n1.g);
    float crown = 1.0 - smoothstep(0.12, 0.3, a);
    float edge = smoothstep(0.72 - 0.15 * n1.b, 1.0, a);
    vec3 grass = vec3(0.12, 0.17, 0.06) * (0.8 + 0.4 * n2.r);
    return mix(grav, grass, max(crown * 0.85, edge));
  }
  // asphalt: patched, darker wheel paths, crumbling edge, dashed centre line
  vec3 asp = vec3(0.13, 0.13, 0.13) * (0.85 + 0.25 * n2.g + 0.12 * n1.r);
  asp *= 1.0 - 0.08 * smoothstep(0.35, 0.5, abs(a - 0.5) < 0.12 ? 1.0 : 0.0);
  float dash = step(fract(vRS.x / 9.0), 0.45) * (1.0 - smoothstep(0.02, 0.05, a)) * (1.0 - smoothstep(0.4, 1.2, fp));
  asp = mix(asp, vec3(0.62, 0.6, 0.55), dash * 0.8);
  float edge = smoothstep(0.86 - 0.1 * n1.b, 1.0, a);
  return mix(asp, vec3(0.28, 0.26, 0.22), edge);
}
`;

function roadMaterial(uniforms: Record<string, THREE.IUniform>, fog: boolean): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, fog, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRS;\nvarying vec2 vRS;\nvarying float vRK;\nvarying vec3 vRW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRS = aRS.xy;\nvRK = aRS.z;\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW;\n' + ROAD_FRAG)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( roadAlbedo(vRW), opacity );');
  };
  mat.customProgramCacheKey = () => 'th-landroad-v1';
  return mat;
}

class Sink {
  pos: number[] = [];
  rs: number[] = [];
  idx: number[] = [];
  quad(a: number[], b: number[], c: number[], d: number[], ra: number[], rb: number[], rc: number[], rd: number[]): void {
    const base = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    this.rs.push(...ra, ...rb, ...rc, ...rd);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** box from an origin with axes (u = across, v = up, w = along), extents */
  box(o: number[], u: number[], w: number[], hu: number, hv: number, hw: number, kind: number): void {
    const P = (su: number, sv: number, sw: number) => [o[0] + u[0] * su * hu + w[0] * sw * hw, o[1] + sv * hv, o[2] + u[2] * su * hu + w[2] * sw * hw];
    const R = [0, 0, kind];
    const faces: [number[], number[], number[], number[]][] = [
      [P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1)],
      [P(-1, 0, -1), P(1, 0, -1), P(1, 1, -1), P(-1, 1, -1)],
      [P(1, 0, 1), P(-1, 0, 1), P(-1, 1, 1), P(1, 1, 1)],
      [P(1, 0, -1), P(1, 0, 1), P(1, 1, 1), P(1, 1, -1)],
      [P(-1, 0, 1), P(-1, 0, -1), P(-1, 1, -1), P(-1, 1, 1)],
    ];
    for (const f of faces) this.quad(f[0], f[1], f[2], f[3], R, R, R, R);
  }
}

function ribbon(sink: Sink, road: Road, model: LandscapeModel): void {
  const L = road.line;
  const n = L.x.length;
  const kind = road.kind === 'road' ? 0 : 1;
  for (let i = 0; i < n - 1; i++) {
    const tx = L.x[i + 1] - L.x[i],
      tz = L.z[i + 1] - L.z[i];
    const tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl,
      nz = tx / tl;
    // neighbour-averaged normals at the joints (no gaps / overlaps on bends)
    const nrm = (k: number): [number, number] => {
      const a = Math.max(0, k - 1),
        b = Math.min(n - 1, k + 1);
      const dx = L.x[b] - L.x[a],
        dz = L.z[b] - L.z[a];
      const l = Math.hypot(dx, dz) || 1;
      return [-dz / l, dx / l];
    };
    const [n0x, n0z] = nrm(i),
      [n1x, n1z] = nrm(i + 1);
    void nx;
    void nz;
    const lift = (k: number) => {
      // far from the town the terrain mesh is coarse: keep the ribbon above its flat triangles
      const d = model.slabDist(L.x[k], L.z[k]);
      return 0.07 + Math.min(1.6, d * 0.00045);
    };
    const y0 = road.level[i] + lift(i),
      y1 = road.level[i + 1] + lift(i + 1);
    const w = road.halfW;
    sink.quad(
      [L.x[i] - n0x * w, y0, L.z[i] - n0z * w],
      [L.x[i] + n0x * w, y0, L.z[i] + n0z * w],
      [L.x[i + 1] + n1x * w, y1, L.z[i + 1] + n1z * w],
      [L.x[i + 1] - n1x * w, y1, L.z[i + 1] - n1z * w],
      [L.s[i], -1, kind],
      [L.s[i], 1, kind],
      [L.s[i + 1], 1, kind],
      [L.s[i + 1], -1, kind],
    );
    // bridge: parapets + deck sides + piers in the river
    if (road.bridge[i] || road.bridge[i + 1]) {
      for (const side of [-1, 1]) {
        const ox = (L.x[i] + L.x[i + 1]) / 2 + n0x * (w + 0.25) * side,
          oz = (L.z[i] + L.z[i + 1]) / 2 + n0z * (w + 0.25) * side;
        sink.box([ox, (y0 + y1) / 2 - 1.4, oz], [n0x, 0, n0z], [tx / tl, 0, tz / tl], 0.3, 2.3, tl / 2 + 0.05, 2);
      }
      if (i % 3 === 0) {
        const ox = L.x[i],
          oz = L.z[i];
        sink.box([ox, WL - 4, oz], [n0x, 0, n0z], [tx / tl, 0, tz / tl], w + 0.4, y0 - (WL - 4) - 0.6, 1.1, 2);
      }
    }
  }
  // tunnel portal: stone headwall across the road with a dark arch, wing walls
  if (road.portal) {
    const p = road.portal;
    const ux = -p.dz,
      uz = p.dx; // across
    const o = [p.x - p.dx * 0.8, p.y - 0.4, p.z - p.dz * 0.8];
    // headwall pieces left / right of the opening + lintel
    const hw = 9.5,
      open = 4.6,
      top = 9.5;
    for (const side of [-1, 1]) {
      const c = [o[0] + ux * side * ((hw + open) / 2), o[1], o[2] + uz * side * ((hw + open) / 2)];
      sink.box(c, [ux, 0, uz], [p.dx, 0, p.dz], (hw - open) / 2, top, 0.8, 2);
      // wing walls angled back into the cutting
      const wc = [o[0] + ux * side * (hw + 3) + p.dx * 3.5, o[1], o[2] + uz * side * (hw + 3) + p.dz * 3.5];
      sink.box(wc, [p.dx, 0, p.dz], [ux * side, 0, uz * side], 3.5, top * 0.55, 0.6, 2);
    }
    sink.box([o[0], o[1] + 6.2, o[2]], [ux, 0, uz], [p.dx, 0, p.dz], open, top - 6.2, 0.8, 2);
    // the dark bore (a recessed back plane)
    const b = [o[0] - p.dx * 1.2, o[1], o[2] - p.dz * 1.2];
    sink.box(b, [ux, 0, uz], [p.dx, 0, p.dz], open, 6.3, 0.2, 3);
  }
}

function carGeometry(): FleetTemplate {
  const pos: number[] = [],
    col: number[] = [],
    emi: number[] = [];
  const box = (w: number, h: number, l: number, x: number, y: number, z: number, c: number[], e = 0) => {
    const g = new THREE.BoxGeometry(w, h, l).toNonIndexed();
    g.translate(x, y, z);
    const a = g.getAttribute('position');
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      col.push(c[0], c[1], c[2]);
      emi.push(e);
    }
  };
  box(1.8, 0.75, 4.3, 0, 0.55, 0, [1, 1, 1]); // body (tinted per car)
  box(1.6, 0.6, 2.2, 0, 1.2, -0.2, [0.08, 0.09, 0.1]); // cabin / glass
  box(1.7, 0.18, 0.05, 0, 0.62, 2.16, [0.9, 0.88, 0.8], 1); // headlights
  box(1.7, 0.14, 0.05, 0, 0.66, -2.16, [0.5, 0.05, 0.03], 0.6); // tail lights
  return { pos, col, emi };
}

export function buildCountryRoads(model: LandscapeModel, uniforms: Record<string, THREE.IUniform>, fog: boolean, fleet: Fleet): CountryRoads {
  const group = new THREE.Group();
  group.name = 'land-roads';
  const sink = new Sink();
  for (const r of model.roads) ribbon(sink, r, model);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(sink.pos, 3));
  geo.setAttribute('aRS', new THREE.Float32BufferAttribute(sink.rs, 3));
  geo.setIndex(sink.idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, roadMaterial(uniforms, fog));
  mesh.name = 'land-road-ribbons';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  group.add(mesh);
  // make the bore plane black: kind 3 → the stone branch darkened via vertex colour? simpler: own tiny mesh
  // (kind 3 renders as stone; the arch reads dark because it is recessed and unlit — good enough far away)

  // ── country traffic (registered with the shared vehicle mesh)
  const tpl = carGeometry();
  const cars: { road: Road; s: number; dir: number; speed: number; tint: [number, number, number]; id: number }[] = [];
  const palette: [number, number, number][] = [
    [0.55, 0.05, 0.04],
    [0.05, 0.12, 0.35],
    [0.7, 0.7, 0.68],
    [0.08, 0.08, 0.09],
    [0.25, 0.3, 0.25],
    [0.6, 0.45, 0.15],
    [0.85, 0.85, 0.82],
  ];
  model.roads.forEach((r, ri) => {
    if (r.kind !== 'road') return;
    const n = ri === 2 ? 2 : 3;
    for (let k = 0; k < n; k++) {
      cars.push({ road: r, s: r.line.length * hash2i(ri, k, 401), dir: k % 2 === 0 ? 1 : -1, speed: 13 + 6 * hash2i(ri, k, 402), tint: palette[Math.floor(hash2i(ri, k, 403) * palette.length)], id: fleet.add(tpl) });
    }
  });
  const carById = new Map<number, (typeof cars)[number]>();
  for (const c of cars) carById.set(c.id, c);
  const tintCar = (item: number, v: number, out: number[]): boolean => {
    const c = carById.get(item);
    if (!c || v >= 36) return false;
    out[0] = c.tint[0];
    out[1] = c.tint[1];
    out[2] = c.tint[2];
    return true;
  };
  const P = { x: 0, z: 0 },
    Q = { x: 0, z: 0 };
  const levelAt = (r: Road, s: number) => {
    const L = r.line;
    let lo = 0,
      hi = L.s.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (L.s[m] <= s) lo = m;
      else hi = m;
    }
    const t = Math.min(1, Math.max(0, (s - L.s[lo]) / (L.s[hi] - L.s[lo] || 1)));
    return r.level[lo] + (r.level[hi] - r.level[lo]) * t;
  };
  const update = (dt: number) => {
    for (const c of cars) {
      const L = c.road.line;
      c.s += c.dir * c.speed * dt;
      // the portal end: the car vanishes into the tunnel, comes out again later; the far end: turn round
      if (c.s > L.length - 5) {
        c.s = L.length - 5;
        c.dir = -1;
      } else if (c.s < 0) {
        c.s = c.road.portal ? 0.5 : 5;
        c.dir = 1;
      }
      L.at(c.s, P);
      L.at(c.s + c.dir * 2, Q);
      let hx = Q.x - P.x,
        hz = Q.z - P.z;
      const hl = Math.hypot(hx, hz) || 1;
      hx /= hl;
      hz /= hl;
      // right-hand traffic
      const off = c.road.halfW * 0.48;
      fleet.set(c.id, P.x - hz * off, levelAt(c.road, c.s) + 0.12, P.z + hx * off, Math.atan2(hx, hz));
    }
  };
  update(0);
  return { group, update, tint: tintCar, triangles: sink.idx.length / 3 + cars.length * (tpl.pos.length / 9), cars: cars.length };
}

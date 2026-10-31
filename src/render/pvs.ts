// Baked visibility (docs/progress/baking.md): from street level most of the static world is behind a building, and its
// triangles still cost 2.5 ns each. scripts/bake.mjs looks round from every cell of a 12 m grid over the town, at eye height
// and at the first floors, and stores which static meshes no pixel of the view could show. The main view then leaves them
// out; the shadow and reflection passes still draw them, and with the camera above that height, off the town or with no
// file (?nobake, ?nopvs, opened from file://, any change to the meshes) nothing is left out.
//
// The test is conservative: only walls and ground hide things (no fences, trees or cards), and a cell also keeps what its
// eight neighbours see. A mesh added or changed since the bake simply always draws, the others keep their sets; only a
// change to what hides things (walls, ground) ends them all.

import * as THREE from 'three';
import type { CityContext } from '../core/context';
import { SLAB } from '../core/constants';
import { bakeBytes, bakeOn } from '../core/bakeFiles';
import type { TerrainService } from '../world/terrain';

const CELL = 12;
const X0 = SLAB.x0 - CELL,
  Z0 = SLAB.z0 - CELL;
const NX = Math.ceil((SLAB.x1 - SLAB.x0) / CELL) + 2,
  NZ = Math.ceil((SLAB.z1 - SLAB.z0) / CELL) + 2;
/** eye height and first floors: the views the set holds for */
const HEIGHTS = [1.7, 8];
const MAX_H = 8.5;
const FACE = 384;

/** static meshes that may be left out (those that follow the camera, and everything that moves, always draw) */
const CANDIDATE = /^(land-(rows|rows-under|mountains|road-ribbons|buildings|herds|tractor|tractor-wheels|wires)$|harbor-|landmarks-(static|detail|lights|players|signs)|life-(cloth|wires|bulbs|poles|leaves|sparkles)|props-(green|print|casters|near-detail|furniture)|terrain-(railings|masonry)|buildings-(trim|lights|signs|green|laundry)|rail-(bed|furniture|fixings)|traffic-signal-(poles|fixings))/;
/** what hides the rest */
const OCCLUDER = /^(buildings-shell(-shop|-roof)?|terrain-ground|terrain-masonry)$/;

export interface PvsService {
  /** run the bake (one image of each cell, a few minutes); bit set = cell hides mesh. Returned as base64 for scripts/bake.mjs */
  bake: () => Promise<string>;
  key: () => string;
  stats: () => { hidden: number; of: number };
}

export function createPvs(ctx: CityContext): (() => void) | null {
  const params = ctx.debug.params;
  const terrain = ctx.services.terrain as TerrainService | undefined;
  if (!terrain || params.has('nopvs')) return null;
  const candidates: THREE.Mesh[] = [];
  const occluders: THREE.Mesh[] = [];
  const hide: boolean[] = [];
  let mode = 0; // 0 runtime, 1 the bake's test pass, 2 the bake's occluder pass
  let queries: (WebGLQuery | null)[] = [];
  /** three culls a mesh from a face before its query begins */
  const began: boolean[] = [];
  const gl = ctx.renderer.getContext() as WebGL2RenderingContext;
  ctx.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (OCCLUDER.test(m.name)) occluders.push(m);
    if (!CANDIDATE.test(m.name)) return;
    const i = candidates.length;
    candidates.push(m);
    hide.push(false);
    const before = m.onBeforeRender,
      after = m.onAfterRender;
    let count = 0;
    m.onBeforeRender = function (r, s, cam, g, mat, grp) {
      if (mode === 2) return;
      if (mode === 1) {
        if (queries[i]) {
          gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, queries[i]!);
          began[i] = true;
        }
        return;
      }
      before.call(this, r, s, cam, g, mat, grp);
      if (hide[i] && cam === ctx.camera) {
        count = g.drawRange.count;
        g.drawRange.count = 0;
      }
    };
    m.onAfterRender = function (r, s, cam, g, mat, grp) {
      if (mode === 2) return;
      if (mode === 1) {
        if (queries[i]) gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE);
        return;
      }
      if (hide[i] && cam === ctx.camera) g.drawRange.count = count;
      after.call(this, r, s, cam, g, mat, grp);
    };
  });
  if (!candidates.length) return null;
  const meshHash = (m: THREE.Mesh, h0: number) => {
    let h = h0;
    const mix = (v: number) => {
      h = Math.imul(h ^ (v | 0), 0x01000193);
    };
    for (let i = 0; i < m.name.length; i++) mix(m.name.charCodeAt(i));
    const g = m.geometry;
    mix(g.index ? g.index.count : g.getAttribute('position').count);
    if (!g.boundingSphere) g.computeBoundingSphere();
    mix(g.boundingSphere!.center.x * 8);
    mix(g.boundingSphere!.center.z * 8);
    return h;
  };
  const key = (occluders.reduce((h, m) => meshHash(m, h), 0x811c9dc5) >>> 0).toString(36);
  /** the same in the page and the bake while the mesh is the same: name, occurrence, content */
  const used = new Map<string, number>();
  const ids = candidates.map((m) => {
    const n = used.get(m.name) ?? 0;
    used.set(m.name, n + 1);
    return `${m.name}#${n}#${(meshHash(m, 0x811c9dc5) >>> 0).toString(36)}`;
  });

  const bake = async (): Promise<string> => {
    const r = ctx.renderer;
    const rt = new THREE.WebGLRenderTarget(FACE, FACE, { depthBuffer: true, type: THREE.UnsignedByteType });
    const cam = new THREE.PerspectiveCamera(90, 1, 0.5, 60000);
    const occMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    const testMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
    const scene = ctx.scene;
    const saved: [THREE.Object3D, boolean][] = [];
    const inOcc = new Set<THREE.Object3D>(occluders);
    const inTest = new Set<THREE.Object3D>();
    const stride = Math.ceil(candidates.length / 8);
    scene.traverse((o) => saved.push([o, o.visible]));
    const setShown = (set: Set<THREE.Object3D>) => {
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints) o.visible = set.has(o);
      });
    };
    const DIRS: [number, number, number, number, number, number][] = [
      [1, 0, 0, 0, 1, 0],
      [-1, 0, 0, 0, 1, 0],
      [0, 0, 1, 0, 1, 0],
      [0, 0, -1, 0, 1, 0],
      [0, 1, 0, 0, 0, 1],
      [0, -1, 0, 0, 0, 1],
    ];
    const prevRT = r.getRenderTarget();
    const prevAuto = r.autoClear;
    const prevShadow = r.shadowMap.autoUpdate;
    const prevBg = scene.background;
    const prevFog = scene.fog;
    const prevOv = scene.overrideMaterial;
    r.shadowMap.autoUpdate = false;
    scene.background = null;
    scene.fog = null;
    const pool = candidates.map(() => gl.createQuery());
    began.length = candidates.length;
    const seen = new Uint8Array(NX * NZ * candidates.length);
    // (the frame loop stays out: it would draw inside the queries)
    const prevRender = ctx.render;
    ctx.render = () => {};
    mode = 1;
    const tick = () => new Promise<void>((done) => setTimeout(done, 0));
    r.setRenderTarget(rt);
    for (let cz = 0; cz < NZ; cz++)
      for (let cx = 0; cx < NX; cx++) {
        const x = X0 + (cx + 0.5) * CELL,
          z = Z0 + (cz + 0.5) * CELL;
        // (inside a building the camera sees walls)
        if (ctx.plan.lots.some((l) => x > l.footprint.x0 + 1 && x < l.footprint.x1 - 1 && z > l.footprint.z0 + 1 && z < l.footprint.z1 - 1)) continue;
        const y0 = terrain.height(x, z);
        const cell = (cz * NX + cx) * candidates.length;
        for (const h of HEIGHTS)
          for (const d of DIRS) {
            cam.position.set(x, y0 + h, z);
            cam.up.set(d[3], d[4], d[5]);
            cam.lookAt(x + d[0], y0 + h + d[1], z + d[2]);
            cam.updateMatrixWorld();
            r.autoClear = true;
            mode = 2;
            setShown(inOcc);
            scene.overrideMaterial = occMat;
            r.render(scene, cam);
            r.autoClear = false;
            mode = 1;
            began.fill(false);
            // (what this cell has seen needs no more tests)
            inTest.clear();
            for (let i = 0; i < candidates.length; i++) if (!seen[cell + i]) inTest.add(candidates[i]);
            if (!inTest.size) continue;
            queries = pool.map((q, i) => (seen[cell + i] ? null : q));
            setShown(inTest);
            scene.overrideMaterial = testMat;
            r.render(scene, cam);
            gl.flush();
            // WebGL gives a query's result only after the task has ended
            for (let i = 0; i < candidates.length; i++) {
              const q = queries[i];
              if (!q || !began[i]) continue;
              while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) await tick();
              if (gl.getQueryParameter(q, gl.QUERY_RESULT)) seen[cell + i] = 1;
            }
          }
      }
    mode = 0;
    ctx.render = prevRender;
    queries = [];
    for (const q of pool) gl.deleteQuery(q);
    r.setRenderTarget(prevRT);
    r.autoClear = prevAuto;
    r.shadowMap.autoUpdate = prevShadow;
    scene.background = prevBg;
    scene.fog = prevFog;
    scene.overrideMaterial = prevOv;
    for (const [o, v] of saved) o.visible = v;
    rt.dispose();
    occMat.dispose();
    testMat.dispose();
    // a cell keeps what its neighbours see. Bit set = hidden from here
    const out = new Uint8Array(NX * NZ * stride);
    for (let cz = 0; cz < NZ; cz++)
      for (let cx = 0; cx < NX; cx++)
        for (let i = 0; i < candidates.length; i++) {
          let any = 0;
          for (let dz = -1; dz <= 1; dz++)
            for (let dx = -1; dx <= 1; dx++) {
              const ax = cx + dx,
                az = cz + dz;
              if (ax >= 0 && az >= 0 && ax < NX && az < NZ) any |= seen[(az * NX + ax) * candidates.length + i];
            }
          if (!any) out[(cz * NX + cx) * stride + (i >> 3)] |= 1 << (i & 7);
        }
    const head = new TextEncoder().encode(JSON.stringify(ids));
    const file = new Uint8Array(4 + head.length + out.length);
    new DataView(file.buffer).setUint32(0, head.length, true);
    file.set(head, 4);
    file.set(out, 4 + head.length);
    let s = '';
    for (let i = 0; i < file.length; i += 32768) s += String.fromCharCode.apply(null, file.subarray(i, i + 32768) as unknown as number[]);
    return btoa(s);
  };

  const service: PvsService = { bake, key: () => key, stats: () => ({ hidden: hide.filter(Boolean).length, of: hide.length }) };
  ctx.services.pvs = service;

  let bits: Uint8Array | null = null;
  let stride = 0;
  /** this page's mesh → its bit in the file (-1: changed since the bake, always drawn) */
  const slot = new Int32Array(candidates.length).fill(-1);
  let last = -2;
  if (bakeOn(params))
    void bakeBytes('pvs', params, key).then((b) => {
      if (!b) return;
      const hl = new DataView(b.buffer, b.byteOffset).getUint32(0, true);
      const bakedIds = JSON.parse(new TextDecoder().decode(b.subarray(4, 4 + hl))) as string[];
      bits = b.subarray(4 + hl);
      stride = Math.ceil(bakedIds.length / 8);
      if (bits.length !== NX * NZ * stride) {
        bits = null;
        return;
      }
      const at = new Map(bakedIds.map((id, i) => [id, i]));
      for (let i = 0; i < ids.length; i++) slot[i] = at.get(ids[i]) ?? -1;
    });
  return () => {
    if (!bits || mode !== 0) return;
    const p = ctx.camera.position;
    const cx = Math.floor((p.x - X0) / CELL),
      cz = Math.floor((p.z - Z0) / CELL);
    const inside = cx >= 0 && cz >= 0 && cx < NX && cz < NZ && p.y - terrain.height(p.x, p.z) <= MAX_H;
    const c = inside ? cz * NX + cx : -1;
    if (c === last) return;
    last = c;
    for (let i = 0; i < hide.length; i++) {
      const k = slot[i];
      hide[i] = c >= 0 && k >= 0 && (bits[c * stride + (k >> 3)] & (1 << (k & 7))) !== 0;
    }
  };
}

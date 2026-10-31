// OFF unless ?pvs: with it on the GPU context was lost in about every second test run, with it off never (see
// docs/progress/baking.md, cause not found), and it saves only about 0.5 ms. `node scripts/bake.mjs --only pvs` makes its file.
//
// Baked visibility: from street level most of the static world is behind a building, and its
// triangles still cost 2.5 ns each. scripts/bake.mjs looks round from every cell of a 12 m grid over the town, in the six
// directions of a cube, at eye height and up to the first roofs, and stores per side which static meshes no pixel of that
// direction could show (what is seen straight up or down counts for all four sides). The main view then leaves out what is
// hidden in all the sides it looks into; the shadow and reflection passes still draw them, and with the camera above that
// height, off the town or with no file (?nobake, ?nopvs, opened from file://) nothing is left out.
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
/** the views the set holds for: eye height up to about the eaves */
const HEIGHTS = [1.7, 6, 12];
const MAX_H = 12.5;
const FACE = 384;
/** the four sides, in order of yaw: +x, +z, -x, -z */
const SIDES = 4;
const FACES: [number, number, number, number, number, number][] = [
  [1, 0, 0, 0, 1, 0],
  [0, 0, 1, 0, 1, 0],
  [-1, 0, 0, 0, 1, 0],
  [0, 0, -1, 0, 1, 0],
  [0, 1, 0, 0, 0, 1],
  [0, -1, 0, 0, 0, 1],
];

/** static meshes that may be left out (those that follow the camera, and everything that moves, always draw) */
const CANDIDATE = /^(land-(rows|rows-under|mountains|road-ribbons|buildings|herds|tractor|tractor-wheels|wires)$|harbor-|landmarks-(static|detail|lights|players|signs)|life-(cloth|wires|bulbs|poles|leaves|sparkles)|props-(green|print|casters|near-detail|furniture)|terrain-(railings|masonry)|buildings-(trim|lights|signs|green|laundry)|rail-(bed|furniture|fixings)|traffic-signal-(poles|fixings))/;
/** what hides the rest */
const OCCLUDER = /^(buildings-shell(-shop|-roof)?|terrain-ground|terrain-masonry)$/;

export interface PvsService {
  /** run the bake (some minutes). Returned as base64 for scripts/bake.mjs */
  bake: () => Promise<string>;
  key: () => string;
  stats: () => { hidden: number; of: number };
}

const meshHash = (m: THREE.Mesh, h0: number): number => {
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

export function createPvs(ctx: CityContext): (() => void) | null {
  const params = ctx.debug.params;
  const terrain = ctx.services.terrain as TerrainService | undefined;
  if (!terrain || !params.has('pvs')) return null;
  const candidates: THREE.Mesh[] = [];
  const occluders: THREE.Mesh[] = [];
  ctx.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (OCCLUDER.test(m.name)) occluders.push(m);
    if (CANDIDATE.test(m.name)) candidates.push(m);
  });
  if (!candidates.length) return null;
  const key = (occluders.reduce((h, m) => meshHash(m, h), 0x811c9dc5) >>> 0).toString(36);
  /** the same in the page and the bake while the mesh is the same: name, occurrence, content */
  const used = new Map<string, number>();
  const ids = candidates.map((m) => {
    const n = used.get(m.name) ?? 0;
    used.set(m.name, n + 1);
    return `${m.name}#${n}#${(meshHash(m, 0x811c9dc5) >>> 0).toString(36)}`;
  });

  // ── the bake

  let baking = false;
  const bake = async (): Promise<string> => {
    const gl = ctx.renderer.getContext() as WebGL2RenderingContext;
    const r = ctx.renderer;
    const scene = ctx.scene;
    const rt = new THREE.WebGLRenderTarget(FACE, FACE, { depthBuffer: true, type: THREE.UnsignedByteType });
    const cam = new THREE.PerspectiveCamera(90, 1, 0.5, 60000);
    const occMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    const testMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
    const saved: [THREE.Object3D, boolean][] = [];
    scene.traverse((o) => saved.push([o, o.visible]));
    const inOcc = new Set<THREE.Object3D>(occluders);
    const inTest = new Set<THREE.Object3D>();
    const setShown = (set: Set<THREE.Object3D>) => {
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints) o.visible = set.has(o);
      });
    };
    const prev = { rt: r.getRenderTarget(), auto: r.autoClear, shadow: r.shadowMap.autoUpdate, bg: scene.background, fog: scene.fog, ov: scene.overrideMaterial, render: ctx.render };
    // (the frame loop stays out: it would draw inside the queries)
    ctx.render = () => {};
    baking = true;
    r.shadowMap.autoUpdate = false;
    scene.background = null;
    scene.fog = null;
    const nc = candidates.length;
    const pool = candidates.map(() => gl.createQuery()!);
    const began = new Uint8Array(nc);
    let querying = false;
    const hooks = candidates.map((m, i) => {
      const before = m.onBeforeRender,
        after = m.onAfterRender;
      m.onBeforeRender = () => {
        if (!querying) return;
        gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, pool[i]);
        began[i] = 1;
      };
      m.onAfterRender = () => {
        if (querying) gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE);
      };
      return { before, after };
    });
    const seen = new Uint8Array(NX * NZ * SIDES * nc);
    const tick = () => new Promise<void>((done) => setTimeout(done, 0));
    r.setRenderTarget(rt);
    for (let cz = 0; cz < NZ; cz++)
      for (let cx = 0; cx < NX; cx++) {
        const x = X0 + (cx + 0.5) * CELL,
          z = Z0 + (cz + 0.5) * CELL;
        // (inside a building the camera sees walls)
        if (ctx.plan.lots.some((l) => x > l.footprint.x0 + 1 && x < l.footprint.x1 - 1 && z > l.footprint.z0 + 1 && z < l.footprint.z1 - 1)) continue;
        const y0 = terrain.height(x, z);
        const cell = (cz * NX + cx) * SIDES;
        for (const h of HEIGHTS)
          for (let f = 0; f < FACES.length; f++) {
            // a side, or for straight up and down all four
            const s0 = f < SIDES ? f : 0,
              s1 = f < SIDES ? f + 1 : SIDES;
            // (what these sides have all seen needs no more tests)
            inTest.clear();
            for (let i = 0; i < nc; i++)
              for (let s = s0; s < s1; s++)
                if (!seen[(cell + s) * nc + i]) {
                  inTest.add(candidates[i]);
                  break;
                }
            if (!inTest.size) continue;
            const d = FACES[f];
            cam.position.set(x, y0 + h, z);
            cam.up.set(d[3], d[4], d[5]);
            cam.lookAt(x + d[0], y0 + h + d[1], z + d[2]);
            cam.updateMatrixWorld();
            r.autoClear = true;
            querying = false;
            setShown(inOcc);
            scene.overrideMaterial = occMat;
            r.render(scene, cam);
            r.autoClear = false;
            querying = true;
            began.fill(0);
            setShown(inTest);
            scene.overrideMaterial = testMat;
            r.render(scene, cam);
            querying = false;
            gl.flush();
            // WebGL gives a query's result only after the task has ended. (three culls a mesh from an image before its query begins)
            for (let i = 0; i < nc; i++) {
              if (!began[i]) continue;
              while (!gl.getQueryParameter(pool[i], gl.QUERY_RESULT_AVAILABLE)) await tick();
              if (gl.getQueryParameter(pool[i], gl.QUERY_RESULT)) for (let s = s0; s < s1; s++) seen[(cell + s) * nc + i] = 1;
            }
          }
      }
    candidates.forEach((m, i) => {
      m.onBeforeRender = hooks[i].before;
      m.onAfterRender = hooks[i].after;
    });
    for (const q of pool) gl.deleteQuery(q);
    r.setRenderTarget(prev.rt);
    r.autoClear = prev.auto;
    r.shadowMap.autoUpdate = prev.shadow;
    scene.background = prev.bg;
    scene.fog = prev.fog;
    scene.overrideMaterial = prev.ov;
    ctx.render = prev.render;
    baking = false;
    for (const [o, v] of saved) o.visible = v;
    rt.dispose();
    occMat.dispose();
    testMat.dispose();
    // a cell keeps what its neighbours see. Bit set = hidden on this side from here
    const stride = Math.ceil(nc / 8);
    const out = new Uint8Array(NX * NZ * SIDES * stride);
    for (let cz = 0; cz < NZ; cz++)
      for (let cx = 0; cx < NX; cx++)
        for (let side = 0; side < SIDES; side++)
          for (let i = 0; i < nc; i++) {
            let any = 0;
            for (let dz = -1; dz <= 1; dz++)
              for (let dx = -1; dx <= 1; dx++) {
                const ax = cx + dx,
                  az = cz + dz;
                if (ax >= 0 && az >= 0 && ax < NX && az < NZ) any |= seen[((az * NX + ax) * SIDES + side) * nc + i];
              }
            if (!any) out[((cz * NX + cx) * SIDES + side) * stride + (i >> 3)] |= 1 << (i & 7);
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

  // ── the page

  const hide: boolean[] = candidates.map(() => false);
  let anyHidden = false;
  const service: PvsService = { bake, key: () => key, stats: () => ({ hidden: hide.filter(Boolean).length, of: hide.length }) };
  ctx.services.pvs = service;

  let bits: Uint8Array | null = null;
  let stride = 0;
  /** this page's mesh → its bit in the file (-1: changed since the bake, always drawn) */
  const slot = new Int32Array(candidates.length).fill(-1);
  // the main view's list is made with the meshes off; the shadow pass, which comes next inside render(), finds them on again
  const off: THREE.Mesh[] = [];
  const restore = () => {
    for (let i = 0; i < off.length; i++) off[i].visible = true;
    off.length = 0;
  };
  const install = () => {
    const shadowMap = ctx.renderer.shadowMap;
    const shadowRender = shadowMap.render;
    const sceneBefore = ctx.scene.onBeforeRender as unknown as (...args: unknown[]) => void;
    const hook = function (this: unknown, ...args: unknown[]) {
      sceneBefore.apply(this, args);
      if (!anyHidden || args[2] !== ctx.camera) return;
      for (let i = 0; i < candidates.length; i++)
        if (hide[i] && candidates[i].visible) {
          candidates[i].visible = false;
          off.push(candidates[i]);
        }
    };
    ctx.scene.onBeforeRender = hook as unknown as THREE.Scene['onBeforeRender'];
    shadowMap.render = function (lights, s, cam) {
      restore();
      shadowRender.call(this, lights, s, cam);
    };
  };
  if (bakeOn(params))
    void bakeBytes('pvs', params, key).then((b) => {
      if (!b) return;
      const hl = new DataView(b.buffer, b.byteOffset).getUint32(0, true);
      const bakedIds = JSON.parse(new TextDecoder().decode(b.subarray(4, 4 + hl))) as string[];
      const data = b.subarray(4 + hl);
      stride = Math.ceil(bakedIds.length / 8);
      if (data.length !== NX * NZ * SIDES * stride) return;
      const at = new Map(bakedIds.map((id, i) => [id, i]));
      for (let i = 0; i < ids.length; i++) slot[i] = at.get(ids[i]) ?? -1;
      bits = data;
      install();
    });

  const dir = new THREE.Vector3();
  let last = -2;
  let lastMask = -1;
  return () => {
    if (!bits || baking) return;
    const cam = ctx.camera;
    const p = cam.position;
    const cx = Math.floor((p.x - X0) / CELL),
      cz = Math.floor((p.z - Z0) / CELL);
    const inside = cx >= 0 && cz >= 0 && cx < NX && cz < NZ && p.y - terrain.height(p.x, p.z) <= MAX_H;
    const c = inside ? cz * NX + cx : -1;
    let mask = 0;
    if (c >= 0) {
      // the sides this frame looks into: a side's image reaches 45° round it, and the view half its width (with a margin:
      // its corners reach further when it is tilted). Steep views: all four
      cam.getWorldDirection(dir);
      const halfV = THREE.MathUtils.degToRad(cam.fov / 2);
      const halfH = Math.atan(Math.tan(halfV) * cam.aspect);
      if (Math.abs(dir.y) + Math.sin(halfV) > 0.65) mask = 15;
      else {
        const yaw = Math.atan2(dir.z, dir.x);
        const reach = Math.PI / 4 + halfH * 1.15 + 0.08;
        for (let s = 0; s < SIDES; s++) {
          let d = Math.abs(yaw - (s * Math.PI) / 2) % (Math.PI * 2);
          if (d > Math.PI) d = Math.PI * 2 - d;
          if (d < reach) mask |= 1 << s;
        }
      }
    }
    if (c === last && mask === lastMask) return;
    last = c;
    lastMask = mask;
    anyHidden = false;
    for (let i = 0; i < hide.length; i++) {
      const k = slot[i];
      let h = c >= 0 && k >= 0;
      for (let s = 0; h && s < SIDES; s++) if (mask & (1 << s) && (bits[(c * SIDES + s) * stride + (k >> 3)] & (1 << (k & 7))) === 0) h = false;
      hide[i] = h;
      anyHidden ||= h;
    }
  };
}

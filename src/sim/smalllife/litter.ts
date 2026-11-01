// What the air moves on the ground, only around the camera: dry leaves under the trees and along the gutter, a sheet of
// newspaper by the bin, a paper cup, a ball of paper. They lie still until a gust finds them, a car goes by or someone
// walks through, then skid, tumble, lift and settle somewhere else: against a kerb or a wall, where such things gather.
// Planned per cell of the near-detail bubble, always the same corner the same litter when you come back. Three or four
// instanced draws with no shadow, written only while something moves.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { OCC } from '../../core/occupancy';
import { SIDEWALK_Y } from '../../core/constants';
import { nearGrow, nearOf, nearRandom, type NearCell } from '../../core/nearDetail';
import { gustAt, windAt } from '../../core/wind';
import { patchLampMaterial } from '../../world/lamps/integrate';
import type { Movers } from './movers';

const RADIUS = 26;
const CELL = 12;
const CAP = { leaf: 340, sheet: 18, cup: 8, ball: 10 };
const LEAF = 0,
  SHEET = 1,
  CUP = 2,
  BALL = 3;
const REST = 0,
  SKID = 1,
  AIR = 2;

const LEAF_COLS = [0x8a6a2c, 0x9a6a30, 0xa8843a, 0x7a5a2a, 0xb8933a, 0x6f5a2c, 0x8a7a34, 0x5f6a2c, 0xa57a34, 0x6e4a24, 0xc4a040, 0x7d8a35];
const CUP_COLS = [0xf2efe6, 0xe9e4d8, 0xb5533a, 0x2f6a58, 0xf2efe6];

/** one thing on the ground: its numbers in a flat list per cell, its live state here */
class Bit {
  kind = 0;
  slot = 0;
  on = false;
  state = REST;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  yaw = 0;
  rx = 0;
  rz = 0;
  wy = 0;
  wx = 0;
  size = 1;
  /** how little wind moves it: lower lifts sooner */
  sens = 1;
  still = 0;
  t = 0;
  bend = 0;
  phase = 0;
  gy = 0;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _w = new THREE.Vector2();
const _c = new THREE.Color();
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function leafGeometry(): THREE.BufferGeometry {
  // a blade folded along its midrib, curled at the tip: unit length along z, width 0.62
  const pts: [number, number, number, number, number][] = [
    // x, y, z, u, v
    [0, 0.0, -0.5, 0, 0],
    [0.17, 0.05, -0.32, 0.55, 0.18],
    [-0.17, 0.05, -0.32, -0.55, 0.18],
    [0.31, 0.09, -0.08, 1, 0.42],
    [-0.31, 0.09, -0.08, -1, 0.42],
    [0, 0, -0.08, 0, 0.42],
    [0.25, 0.1, 0.2, 0.8, 0.7],
    [-0.25, 0.1, 0.2, -0.8, 0.7],
    [0, 0.015, 0.2, 0, 0.7],
    [0, 0.07, 0.5, 0, 1],
  ];
  const P: number[] = [],
    U: number[] = [];
  for (const p of pts) {
    P.push(p[0], p[1], p[2]);
    U.push(p[3], p[4]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex([0, 5, 1, 0, 2, 5, 1, 5, 3, 2, 4, 5, 3, 5, 8, 3, 8, 6, 4, 8, 5, 4, 7, 8, 6, 8, 9, 7, 9, 8]);
  g.computeVertexNormals();
  return g;
}

function leafMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  m.name = 'smalllife-leaf';
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vLeaf;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLeaf = uv;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vLeaf;').replace(
      '#include <color_fragment>',
      `#include <color_fragment>
  { // midrib and side veins darker, the edge dry and pale
    float ax = abs(vLeaf.x);
    float vein = smoothstep(0.75, 1.0, sin((vLeaf.y - ax * 0.32) * 34.0)) * (1.0 - ax) * 0.2;
    float rib = smoothstep(0.09, 0.02, ax) * 0.3;
    diffuseColor.rgb *= 1.0 - max(vein, rib);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.6, 0.48), smoothstep(0.55, 1.0, ax + 0.25 * sin(vLeaf.y * 21.0)));
  }`,
    );
  };
  m.customProgramCacheKey = () => 'tinyhaven-smalllife-leaf-1';
  patchLampMaterial(m);
  nearGrow(m, RADIUS);
  return m;
}

function sheetGeometry(): THREE.BufferGeometry {
  // a sheet of unit size in x and z, 6 × 4 quads: enough to bend
  const g = new THREE.PlaneGeometry(1, 1, 6, 4);
  g.rotateX(-Math.PI / 2);
  return g;
}

function sheetMaterial(attr: THREE.InstancedBufferAttribute, geo: THREE.BufferGeometry): THREE.MeshStandardMaterial {
  geo.setAttribute('iSheet', attr);
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  m.name = 'smalllife-sheet';
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 iSheet;\nvarying vec2 vSheet;\nvarying vec2 vSheetK;')
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 objectNormal = vec3( normal );
  // a wave along the sheet and a corner that lifts: iSheet = bend, phase, print, seed
  float shW = iSheet.x * sin( position.x * 5.0 + iSheet.y ) * ( 0.35 + position.z ) ;
  float shC = max( 0.0, iSheet.x ) * pow( max( 0.0, position.x + position.z ), 2.0 ) * 0.5;
  objectNormal = normalize( vec3( -iSheet.x * 5.0 * cos( position.x * 5.0 + iSheet.y ) * ( 0.35 + position.z ), 1.0, -iSheet.x * sin( position.x * 5.0 + iSheet.y ) ) );`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3( position );
  transformed.y += 0.14 * shW + 0.2 * shC + 0.012 * sin( position.x * 17.0 + iSheet.w * 9.0 ) * cos( position.z * 13.0 + iSheet.w * 5.0 );
  vSheet = uv;
  vSheetK = iSheet.zw;`,
      );
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSheet;\nvarying vec2 vSheetK;').replace(
      '#include <color_fragment>',
      `#include <color_fragment>
  { // print: columns of text and a headline on a newspaper, a printed band on a flyer, plain kraft for a wrapper
    vec2 uv = vSheet;
    float kind = vSheetK.x;
    if (kind < 0.5) {
      float col = fract(uv.x * 4.0);
      float gutter = smoothstep(0.0, 0.05, col) * smoothstep(1.0, 0.95, col);
      float line = smoothstep(0.35, 0.5, fract(uv.y * 62.0));
      float head = step(0.82, uv.y) * step(0.05, uv.x) * step(uv.x, 0.95);
      float text = head > 0.5 ? step(0.3, fract(uv.x * 19.0 + vSheetK.y * 7.0)) * step(fract(uv.y * 9.0), 0.72) : line * gutter;
      float frame = step(0.08, uv.y) * step(uv.y, 0.92) * step(0.05, uv.x) * step(uv.x, 0.95);
      float pic = step(0.46, uv.x) * step(uv.x, 0.72) * step(0.42, uv.y) * step(uv.y, 0.74);
      diffuseColor.rgb = vec3(0.68, 0.66, 0.6) * (1.0 - 0.72 * text * frame);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2 + 0.2 * sin(uv.x * 37.0) * sin(uv.y * 41.0)), pic);
    } else if (kind < 1.5) {
      float band = step(0.72, uv.y);
      float line = smoothstep(0.4, 0.5, fract(uv.y * 26.0)) * step(0.14, uv.x) * step(uv.x, 0.86) * step(uv.y, 0.66) * step(0.14, uv.y);
      diffuseColor.rgb = mix(vec3(0.78, 0.77, 0.72) * (1.0 - 0.5 * line), diffuseColor.rgb, band);
    }
  }`,
    );
  };
  m.customProgramCacheKey = () => 'tinyhaven-smalllife-sheet-1';
  patchLampMaterial(m);
  nearGrow(m, RADIUS);
  return m;
}

function cupGeometry(): THREE.BufferGeometry {
  // lying on its side when placed by the sim: axis along z, wide end at +z, open; a rolled rim
  const g = new THREE.CylinderGeometry(0.04, 0.03, 0.105, 12, 1, true);
  g.rotateX(Math.PI / 2);
  const inner = new THREE.CircleGeometry(0.03, 10);
  inner.rotateY(Math.PI);
  inner.translate(0, 0, -0.0525);
  return mergeTwo(g, inner);
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const A = a.toNonIndexed(),
    B = b.toNonIndexed();
  const out = new THREE.BufferGeometry();
  for (const n of ['position', 'normal', 'uv']) {
    const x = A.getAttribute(n).array as Float32Array,
      y = B.getAttribute(n).array as Float32Array;
    const z = new Float32Array(x.length + y.length);
    z.set(x);
    z.set(y, x.length);
    out.setAttribute(n, new THREE.BufferAttribute(z, n === 'uv' ? 2 : 3));
  }
  return out;
}

function ballGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.038, 1);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    const h = Math.abs(Math.sin(x * 129.898 + y * 782.33 + z * 377.19) * 43758.5453) % 1;
    const k = 0.68 + 0.5 * h;
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals(); // (non-indexed: facets, which is what crumpled paper has)
  return g;
}

export class Litter {
  private readonly bits: Bit[] = [];
  private readonly active: Bit[] = [];
  private readonly shown: Bit[] = [];
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly free: number[][] = [[], [], [], []];
  private readonly sheetA: THREE.InstancedBufferAttribute;
  private readonly dirty = [false, false, false, false];
  private readonly trees = new Map<number, { x: number; z: number; r: number }[]>();
  private readonly lures = new Map<number, { x: number; z: number; w: number }[]>();
  private cursor = 0;
  private wakes = 0;
  /** where litter lies, for tests */
  readonly spots: { x: number; z: number; info: string }[] = [];

  constructor(
    private readonly ctx: CityContext,
    private readonly movers: Movers,
    root: THREE.Object3D,
  ) {
    const add = (name: string, g: THREE.BufferGeometry, m: THREE.Material, cap: number, kind: number) => {
      const mesh = new THREE.InstancedMesh(g, m, cap);
      mesh.name = `smalllife-${name}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.count = cap;
      _m.makeScale(0, 0, 0);
      for (let i = 0; i < cap; i++) {
        mesh.setMatrixAt(i, _m);
        this.free[kind].push(cap - 1 - i);
        const b = new Bit();
        b.kind = kind;
        this.bits.push(b);
      }
      mesh.visible = false;
      root.add(mesh);
      this.meshes[kind] = mesh;
    };
    add('leaves', leafGeometry(), leafMaterial(), CAP.leaf, LEAF);
    const sg = sheetGeometry();
    this.sheetA = new THREE.InstancedBufferAttribute(new Float32Array(CAP.sheet * 4), 4);
    this.sheetA.setUsage(THREE.DynamicDrawUsage);
    add('sheets', sg, sheetMaterial(this.sheetA, sg), CAP.sheet, SHEET);
    const plain = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
    plain.name = 'smalllife-trash';
    patchLampMaterial(plain);
    nearGrow(plain, RADIUS);
    add('cups', cupGeometry(), plain, CAP.cup, CUP);
    add('balls', ballGeometry(), plain, CAP.ball, BALL);
    this.index();
    nearOf(ctx).addCells<number[]>({
      name: 'nearLitter',
      radius: RADIUS,
      cell: CELL,
      top: 3,
      make: (c) => this.plan(c),
      show: (list, on, c) => (on ? this.lay(list, c) : this.lift(c)),
      drop: () => {},
    });
  }

  private key(x: number, z: number): number {
    return (Math.floor(x / CELL) + 4096) * 8192 + (Math.floor(z / CELL) + 4096);
  }

  private index(): void {
    const veg = this.ctx.services.vegetation as { trees?: { x: number; z: number; r: number; h: number }[] } | undefined;
    for (const t of veg?.trees ?? []) {
      // a crown sheds over its whole shadow
      const R = t.r * 1.25;
      for (let i = Math.floor((t.x - R) / CELL); i <= Math.floor((t.x + R) / CELL); i++)
        for (let j = Math.floor((t.z - R) / CELL); j <= Math.floor((t.z + R) / CELL); j++) {
          const k = (i + 4096) * 8192 + (j + 4096);
          let l = this.trees.get(k);
          if (!l) this.trees.set(k, (l = []));
          l.push({ x: t.x, z: t.z, r: R });
        }
    }
    const put = (x: number, z: number, w: number) => {
      const k = this.key(x, z);
      let l = this.lures.get(k);
      if (!l) this.lures.set(k, (l = []));
      l.push({ x, z, w });
    };
    for (const s of this.ctx.plan.slots) {
      if (s.kind === 'bin') put(s.x, s.z, 0.45);
      else if (s.kind === 'busstop') put(s.x, s.z, 0.55);
      else if (s.kind === 'newsstand') put(s.x, s.z, 0.6);
      else if (s.kind === 'bench') put(s.x, s.z, 0.25);
    }
    for (const b of this.ctx.plan.benches) put(b.x, b.z, 0.14);
    const props = this.ctx.services.props as { cafes?: { x: number; z: number }[] } | undefined;
    for (const c of props?.cafes ?? []) put(c.x, c.z, 0.25);
    for (const f of this.ctx.plan.features) if (f.kind === 'kiosk' || f.kind === 'marketstall') put(f.x, f.z, 0.4);
  }

  private groundY(x: number, z: number): number {
    const f = this.ctx.occupancy.get(x, z);
    if (f & OCC.ROAD) return 0.012;
    if (f & OCC.SIDEWALK) return SIDEWALK_Y;
    const t = this.ctx.services.terrain as { height(x: number, z: number): number } | undefined;
    return t ? t.height(x, z) : this.ctx.plan.heightAt(x, z);
  }

  /** this cell's litter: [kind, x, z, yaw, size, tiltX, tiltZ, colour, sens, extra] per bit. Stays flat: rests are cheap */
  private plan(c: NearCell): number[] | null {
    const { plan, occupancy: occ } = this.ctx;
    if (c.x1 < plan.slab.x0 || c.x0 > plan.slab.x1 || c.z1 < plan.slab.z0 || c.z0 > plan.slab.z1) return null;
    const r = nearRandom(c.seed);
    const out: number[] = [];
    const skip = OCC.BUILDING | OCC.WATER | OCC.SOLID | OCC.RAIL;
    const trees = this.trees.get(this.key((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2));
    // leaves: many under a crown, a few blown into every gutter and wall foot
    const tries = trees ? 70 : 26;
    for (let k = 0; k < tries; k++) {
      const x = c.x0 + r() * CELL,
        z = c.z0 + r() * CELL,
        pick = r(),
        a = r(),
        s = r(),
        t1 = r(),
        t2 = r(),
        col = r(),
        sens = r();
      const f = occ.get(x, z);
      if (f & skip) continue;
      let want = 0.012;
      if (f & OCC.ROAD) want = occ.anyInCircle(x, z, 0.7, OCC.SIDEWALK) ? 0.2 : 0;
      else if (occ.anyInCircle(x, z, 0.5, OCC.BUILDING | OCC.SOLID)) want = 0.18;
      if (trees) {
        for (let i = 0; i < trees.length; i++) {
          const t = trees[i];
          const d2 = (t.x - x) * (t.x - x) + (t.z - z) * (t.z - z);
          if (d2 < t.r * t.r) want = Math.max(want, f & OCC.ROAD ? 0.55 : 0.42);
        }
      }
      if (pick > want) continue;
      out.push(LEAF, x, z, a * 6.283, 0.05 + 0.055 * s, (t1 - 0.5) * 0.3, (t2 - 0.5) * 0.3, LEAF_COLS[Math.floor(col * LEAF_COLS.length)], 0.45 + 0.55 * sens, 0);
    }
    // paper: where people leave it, seldom elsewhere
    const lures = this.lures.get(this.key((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2));
    let lure = 0.012;
    let lx = c.x0 + CELL / 2,
      lz = c.z0 + CELL / 2,
      lr = CELL / 2;
    if (lures) {
      const l = lures[Math.floor(r() * lures.length)];
      lure = l.w;
      lx = l.x;
      lz = l.z;
      lr = 2.2;
    }
    if (r() < lure) {
      const n = 1 + Math.floor(r() * 2.2);
      for (let k = 0; k < n; k++) {
        const x = lx + (r() - 0.5) * 2 * lr,
          z = lz + (r() - 0.5) * 2 * lr;
        const u = r(),
          a = r(),
          c1 = r(),
          c2 = r();
        if (occ.get(x, z) & skip) continue;
        if (u < 0.34) out.push(BALL, x, z, a * 6.283, 0.8 + 0.5 * c1, 0, 0, c2 < 0.6 ? 0xd8d4c8 : c2 < 0.85 ? 0xb8a988 : 0xc05a48, 0.5, 0);
        else if (u < 0.56) out.push(CUP, x, z, a * 6.283, 1, 0, 0, CUP_COLS[Math.floor(c1 * CUP_COLS.length)], 0.5, 0);
        else {
          // a newspaper page, a flyer or a wrapper: [w, d] by what it is
          const print = c1 < 0.5 ? 0 : c1 < 0.8 ? 1 : 2;
          const col = print === 0 ? 0xffffff : print === 1 ? (c2 < 0.5 ? 0xb5432e : 0x2e6a9a) : 0xb09468;
          out.push(SHEET, x, z, a * 6.283, print === 0 ? 0.42 : print === 1 ? 0.2 : 0.17, 0, 0, col, 0.35, print);
        }
      }
    }
    return out.length ? out : null;
  }

  private byCell = new Map<number, Bit[]>();

  private lay(list: number[], c: NearCell): void {
    const owned: Bit[] = [];
    for (let i = 0; i < list.length; i += 10) {
      const kind = list[i];
      const free = this.free[kind];
      if (free.length === 0) continue;
      const slot = free.pop() as number;
      // (bits are matched to slots through kind + slot: find an unused one quickly)
      const b = this.takeBit(kind);
      if (!b) {
        free.push(slot);
        continue;
      }
      b.slot = slot;
      b.on = true;
      b.state = REST;
      b.x = list[i + 1];
      b.z = list[i + 2];
      b.yaw = list[i + 3];
      b.size = list[i + 4];
      b.rx = list[i + 5];
      b.rz = list[i + 6];
      b.sens = list[i + 8];
      b.vx = b.vy = b.vz = 0;
      b.bend = 0;
      b.phase = b.yaw;
      b.gy = this.groundY(b.x, b.z);
      b.y = b.gy + this.rideHeight(b);
      const mesh = this.meshes[kind];
      mesh.setColorAt(slot, _c.setHex(list[i + 7]));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (kind === SHEET) {
        const a = this.sheetA.array as Float32Array;
        a[slot * 4] = 0;
        a[slot * 4 + 1] = b.yaw;
        a[slot * 4 + 2] = list[i + 9];
        a[slot * 4 + 3] = (b.yaw * 13.7) % 1;
        this.sheetA.needsUpdate = true;
      }
      this.write(b);
      this.shown.push(b);
      owned.push(b);
      this.dirty[kind] = true;
      if (kind !== LEAF && this.spots.length < 64) this.spots.push({ x: b.x, z: b.z, info: `kind ${kind}` });
    }
    this.byCell.set((c.i + 4096) * 8192 + (c.j + 4096), owned);
  }

  private takeBit(kind: number): Bit | null {
    const B = this.bits;
    for (let i = 0; i < B.length; i++) if (B[i].kind === kind && !B[i].on) return B[i];
    return null;
  }

  private lift(c: NearCell): void {
    const k = (c.i + 4096) * 8192 + (c.j + 4096);
    const owned = this.byCell.get(k);
    if (!owned) return;
    this.byCell.delete(k);
    for (const b of owned) {
      b.on = false;
      _m.makeScale(0, 0, 0);
      this.meshes[b.kind].setMatrixAt(b.slot, _m);
      this.dirty[b.kind] = true;
      this.free[b.kind].push(b.slot);
      const i = this.shown.indexOf(b);
      if (i >= 0) {
        this.shown[i] = this.shown[this.shown.length - 1];
        this.shown.pop();
      }
      const j = this.active.indexOf(b);
      if (j >= 0) {
        this.active[j] = this.active[this.active.length - 1];
        this.active.pop();
      }
    }
    const S = this.spots;
    for (let i = S.length - 1; i >= 0; i--) if (S[i].x >= c.x0 - 4 && S[i].x < c.x1 + 4 && S[i].z >= c.z0 - 4 && S[i].z < c.z1 + 4) S.splice(i, 1);
  }

  private rideHeight(b: Bit): number {
    return b.kind === LEAF ? 0.008 : b.kind === SHEET ? 0.012 : b.kind === CUP ? 0.036 : 0.03 * b.size;
  }

  private wake(b: Bit, vx: number, vz: number, up: number): void {
    if (b.state === REST) {
      b.state = up > 0.25 ? AIR : SKID;
      this.active.push(b);
      this.wakes++;
      b.still = 0;
      b.t = 0;
    } else if (up > 0.25 && b.state === SKID) b.state = AIR;
    b.vx += vx;
    b.vz += vz;
    b.vy += up;
    b.wy = (Math.random() - 0.5) * 7;
    b.wx = (Math.random() - 0.5) * 9;
  }

  /** the air at a point, moved by anything going past */
  private airX = 0;
  private airZ = 0;
  private air(x: number, z: number, t: number, wind: THREE.Vector2): void {
    windAt(x, z, t, wind, _w);
    // a street's wind in metres per second, broken up by a slow curl so nothing moves in formation
    let ax = _w.x * 3.4 + 0.55 * Math.sin(z * 0.9 + t * 1.3) + 0.35 * Math.sin(x * 2.1 - t * 2.1 + z);
    let az = _w.y * 3.4 + 0.55 * Math.sin(x * 0.8 - t * 1.1) + 0.35 * Math.cos(z * 1.9 + t * 1.7 + x);
    const M = this.movers;
    const C = M.cars;
    for (let i = 0; i < M.nCars; i++) {
      const dx = x - C[i * 4],
        dz = z - C[i * 4 + 1];
      const d2 = dx * dx + dz * dz;
      if (d2 > 36) continue;
      // dragged along behind a car, thrown out in front of it
      const k = (1 - d2 / 36) * 0.5;
      ax += C[i * 4 + 2] * k;
      az += C[i * 4 + 3] * k;
    }
    this.airX = ax;
    this.airZ = az;
  }

  /** simulation time */
  update(dt: number): void {
    if (dt <= 0) return;
    const u = this.ctx.uniforms;
    const t = u.uTime.value as number;
    const wind = u.uWind.value as THREE.Vector2;
    const wl = Math.hypot(wind.x, wind.y);
    const M = this.movers;
    // look at a share of what lies still: has anything found it?
    const S = this.shown;
    const n = S.length;
    if (n > 0) {
      const look = Math.ceil(n / 5);
      for (let q = 0; q < look; q++) {
        this.cursor = (this.cursor + 1) % n;
        const b = S[this.cursor];
        if (b.state !== REST) continue;
        const g = gustAt(b.x, b.z, t, wind);
        // a gust: strong enough for what it is, with a chance per look so a whole drift does not jump at once
        const strength = wl * (0.45 + 1.1 * g);
        if (g > 0.55 && strength * 3.4 > 1.3 + 1.5 * b.sens && Math.random() < 0.1 + 0.5 * g * g) {
          windAt(b.x, b.z, t, wind, _w);
          this.wake(b, _w.x * 1.2, _w.y * 1.2, Math.random() < 0.3 * g ? 0.9 + Math.random() : 0);
          continue;
        }
        const C = M.cars;
        for (let i = 0; i < M.nCars; i++) {
          const dx = b.x - C[i * 4],
            dz = b.z - C[i * 4 + 1];
          const v2 = C[i * 4 + 2] * C[i * 4 + 2] + C[i * 4 + 3] * C[i * 4 + 3];
          const R = 2.4 + Math.sqrt(v2) * 0.16;
          if (dx * dx + dz * dz < R * R && v2 > 16 && Math.random() < 0.8 / b.sens) {
            const k = 0.22 + Math.random() * 0.16;
            this.wake(b, C[i * 4 + 2] * k + dx * 0.3, C[i * 4 + 3] * k + dz * 0.3, 0.6 + Math.random() * 1.1);
            break;
          }
        }
        if (b.state !== REST) continue;
        // a foot through it
        const P = M.people;
        for (let i = 0; i < M.nPeople; i++) {
          const dx = b.x - P[i * 4],
            dz = b.z - P[i * 4 + 1];
          if (dx * dx + dz * dz < 0.2 && P[i * 4 + 2] * P[i * 4 + 2] + P[i * 4 + 3] * P[i * 4 + 3] > 0.5 && b.kind !== SHEET) {
            this.wake(b, P[i * 4 + 2] * 0.5 + dx, P[i * 4 + 3] * 0.5 + dz, 0.5);
            break;
          }
        }
        if (b.state === REST && M.low && M.agl < 2.4 && M.camV > 0.5) {
          const dx = b.x - M.camX,
            dz = b.z - M.camZ;
          if (dx * dx + dz * dz < 0.3) this.wake(b, M.camVx * 0.5 + dx, M.camVz * 0.5 + dz, 0.5);
        }
      }
    }
    // what is moving
    const A = this.active;
    const steps = Math.min(3, Math.ceil(dt / 0.05));
    const h = Math.min(0.05, dt / steps);
    for (let i = A.length - 1; i >= 0; i--) {
      const b = A[i];
      for (let s = 0; s < steps && b.state !== REST; s++) this.step(b, h, t, wind);
      this.write(b);
      this.dirty[b.kind] = true;
      if (b.state === REST) {
        A[i] = A[A.length - 1];
        A.pop();
      }
    }
  }

  private step(b: Bit, h: number, t: number, wind: THREE.Vector2): void {
    b.t += h;
    this.air(b.x, b.z, t, wind);
    const ax = this.airX,
      az = this.airZ;
    const occ = this.ctx.occupancy;
    if (b.state === AIR) {
      const paper = b.kind === SHEET;
      const k = 1 - Math.exp(-h * (paper ? 3.4 : b.kind === LEAF ? 2.8 : 1.5));
      b.vx += (ax - b.vx) * k;
      b.vz += (az - b.vz) * k;
      const fall = paper ? -0.42 : b.kind === LEAF ? -0.72 : -2.4;
      const lift = paper ? 0.55 * Math.sin(b.t * 3.1 + b.phase) * Math.min(1, Math.hypot(ax, az) * 0.4) : b.kind === LEAF ? 0.32 * Math.cos(b.t * 5.2 + b.phase) : 0;
      b.vy += (fall + lift - b.vy) * (1 - Math.exp(-h * 2.6));
      if (b.kind === CUP || b.kind === BALL) b.vy -= 0;
      const swing = b.kind === LEAF ? Math.sin(b.t * 2.8 + b.phase) * 0.8 : paper ? Math.sin(b.t * 2 + b.phase) * 0.5 : 0;
      const cs = Math.cos(b.phase),
        sn = Math.sin(b.phase);
      this.move(b, (b.vx + cs * swing) * h, (b.vz + sn * swing) * h);
      b.y += b.vy * h;
      b.rx += b.wx * h;
      b.rz += b.wy * 0.7 * h;
      b.yaw += b.wy * 0.4 * h;
      if (paper) b.bend = 0.5 * Math.sin(b.t * 7 + b.phase);
      b.gy = this.groundY(b.x, b.z);
      const rest = b.gy + this.rideHeight(b);
      if (b.y <= rest) {
        b.y = rest;
        b.vy = 0;
        b.state = SKID;
        b.vx *= 0.55;
        b.vz *= 0.55;
      }
      return;
    }
    // on the ground: friction against what the air wants
    const sp = Math.hypot(ax, az);
    const grip = (b.kind === LEAF ? 1.3 : b.kind === SHEET ? 1.25 : 1.05) + 1.5 * b.sens;
    const pull = Math.max(0, sp - grip);
    const k = 1 - Math.exp(-h * 2.5);
    const wantX = sp > 0 ? (ax / sp) * pull * 0.75 : 0,
      wantZ = sp > 0 ? (az / sp) * pull * 0.75 : 0;
    b.vx += (wantX - b.vx) * k;
    b.vz += (wantZ - b.vz) * k;
    const v = Math.hypot(b.vx, b.vz);
    this.move(b, b.vx * h, b.vz * h);
    const gy = this.groundY(b.x, b.z);
    b.gy += (gy - b.gy) * Math.min(1, h * 18);
    b.y = b.gy + this.rideHeight(b);
    if (b.kind === LEAF) {
      // on its edge for a moment, cartwheeling, then flat
      b.rx += (Math.sin(b.t * 9 + b.phase) * Math.min(0.9, v * 0.9) - b.rx) * Math.min(1, h * 10);
      b.yaw += (v * 2.2 + 0.2) * (b.phase % 2 > 1 ? 1 : -1) * h * Math.min(1, v * 3);
      b.rz *= 1 - Math.min(1, h * 8);
      if (v > 1.0 && Math.random() < h * 1.2) this.wake(b, 0, 0, 0.5 + Math.random() * 0.6);
    } else if (b.kind === SHEET) {
      b.rx *= 1 - Math.min(1, h * 7);
      b.rz *= 1 - Math.min(1, h * 7);
      // the sheet ripples and a corner comes up while it travels
      const want = 0.12 + Math.min(0.5, sp * 0.13);
      b.bend += (want * (0.6 + 0.4 * Math.sin(b.t * 6.3 + b.phase)) - b.bend) * Math.min(1, h * 9);
      b.yaw += (b.phase % 2 > 1 ? 0.3 : -0.3) * v * h;
      if (v > 0.8 && sp > 2 && Math.random() < h * 0.8) this.wake(b, 0, 0, 0.8 + Math.random());
    } else if (b.kind === CUP) {
      // a cone rolls in a circle round its point: the heading turns with the roll
      b.rz += (v / 0.035) * h;
      b.yaw += (v / 0.27) * h;
      // it follows its own axis more than the wind
      const fx = Math.cos(b.yaw),
        fz = -Math.sin(b.yaw);
      const along = b.vx * fx + b.vz * fz;
      b.vx += (fx * along - b.vx) * Math.min(1, h * 4);
      b.vz += (fz * along - b.vz) * Math.min(1, h * 4);
    } else {
      // rolling: spun about the axis across its travel; a light hop on a bump
      b.rx += (v / 0.03) * h;
      if (v > 0.7 && Math.random() < h * 0.6) this.wake(b, 0, 0, 0.4 + Math.random() * 0.4);
    }
    // settled?
    b.still = v < 0.07 ? b.still + h : 0;
    if (b.still > 0.5) {
      if (b.kind === LEAF) {
        b.rx = (b.phase % 1) * 0.22 - 0.11;
        b.rz = ((b.phase * 7) % 1) * 0.22 - 0.11;
      }
      b.bend *= 0.3;
      b.state = REST;
      b.vx = b.vy = b.vz = 0;
    }
  }

  /** a step that stops at what stands in the way: a kerb from below, a wall, a fence, the water's edge. This is how it gathers */
  private move(b: Bit, dx: number, dz: number): void {
    const occ = this.ctx.occupancy;
    const x = b.x + dx,
      z = b.z + dz;
    const f = occ.get(x, z);
    const here = occ.get(b.x, b.z);
    const wall = f & (OCC.BUILDING | OCC.SOLID | OCC.WATER | OCC.RAIL);
    // up onto the pavement only in the air
    const kerb = b.state === SKID && here & OCC.ROAD && f & OCC.SIDEWALK;
    if (wall || kerb) {
      b.vx *= -0.15;
      b.vz *= -0.15;
      return;
    }
    b.x = x;
    b.z = z;
  }

  private write(b: Bit): void {
    const mesh = this.meshes[b.kind];
    if (b.kind === CUP) {
      // on its side, rolled about its axis
      _e.set(b.rz, b.yaw + Math.PI / 2, 0, 'YZX');
      _s.setScalar(b.size);
    } else if (b.kind === BALL) {
      _e.set(b.rx, b.yaw, 0, 'YXZ');
      _s.setScalar(b.size);
    } else {
      _e.set(b.rx, b.yaw, b.rz, 'YXZ');
      if (b.kind === SHEET) {
        const print = (this.sheetA.array as Float32Array)[b.slot * 4 + 2];
        _s.set(b.size, 1, b.size * (print === 0 ? 1.34 : print === 1 ? 1.45 : 1));
        (this.sheetA.array as Float32Array)[b.slot * 4] = b.bend;
        this.sheetA.needsUpdate = true;
      } else _s.setScalar(b.size);
    }
    _q.setFromEuler(_e);
    _m.compose(_p.set(b.x, b.y, b.z), _q, _s);
    mesh.setMatrixAt(b.slot, _m);
  }

  /** per frame: send what changed; a kind with nothing laid out draws nothing */
  frame(): void {
    for (let k = 0; k < 4; k++) {
      if (!this.dirty[k]) continue;
      this.dirty[k] = false;
      const mesh = this.meshes[k];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = this.free[k].length < mesh.count;
    }
  }

  /** for tests: everything lying about is taken by a gust */
  blow(): void {
    const wind = this.ctx.uniforms.uWind.value as THREE.Vector2;
    const wl = Math.hypot(wind.x, wind.y) || 1;
    for (const b of this.shown) if (b.state === REST) this.wake(b, (wind.x / wl) * 1.6, (wind.y / wl) * 1.6, Math.random() < 0.4 ? 1 : 0);
  }

  stats(): Record<string, number> {
    return { litterLaid: this.shown.length, litterMoving: this.active.length, litterWakes: this.wakes };
  }
}

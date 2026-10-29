// Hinged cloth on lines and poles: bunting pennants, prayer-flag rectangles, laundry, pole flags —
// ONE instanced draw (+ one shadow draw) for every piece in the city; the wires they hang from are
// ONE instanced strip draw and festoon bulbs ONE instanced draw. All of it is animated on the GPU by
// the shared wind field (core/wind.ts): a gust crossing a street lifts the bunting line, the pennants
// stream out and flutter faster, then the next street follows.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { WIND_GLSL } from '../../core/wind';
import { patchLampMaterial } from '../lamps/integrate';
import { LIFE_CLOTH_PARS, LIFE_LINE_GLSL, LIFE_MASK_GLSL, LIFE_PATTERN_GLSL } from './glsl';

export const SHAPE = { PENNANT: 0, RECT: 1, SHIRT: 2, TROUSERS: 3, SHEET: 4, SWALLOW: 5, PEG: 6 } as const;
export const PAT = { PLAIN: 0, BANDS: 1, MIDBAND: 2, DIAG: 3, PRAYER: 4, TRICOLOUR: 5, CROSS: 6, BORDER: 7, STRIPES: 8 } as const;

export interface Line {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  /** sag at mid-span (m) */
  sag: number;
  seed: number;
  /** wire colour (sRGB hex) */
  wire: string;
  /** wire radius (m) */
  r: number;
  /** wire drawn by someone else (e.g. rigid balcony lines of the buildings module) */
  hidden?: boolean;
}

export interface PieceOpts {
  /** hinge width (m) */
  w: number;
  /** length away from the hinge (m) */
  len: number;
  shape: number;
  col: string;
  col2?: string;
  pattern?: number;
  /** 1 light cloth … 3 wet sheet */
  weight?: number;
  /** flutter amplitude multiplier */
  flutter?: number;
  phase?: number;
  /** laundry: hangs in vertical folds from clothes pegs (the pegs are added as pieces too); 0..1 */
  drape?: number;
}

const _c = new THREE.Color();
const PEG_COLS = ['#c9a77a', '#bf9c6c', '#e8443a', '#2f7fd0', '#f2d23a', '#3fae5a', '#f0f0ea'];

/** Builder + renderer for every cloth piece, wire and festoon bulb of the life module. */
export class ClothSystem {
  readonly group = new THREE.Group();
  readonly lines: Line[] = [];
  private pieces: { line: number; s: number; pole: null | { top: THREE.Vector3; bottom: THREE.Vector3 }; o: PieceOpts }[] = [];
  private bulbs: { line: number; s: number; drop: number; r: number; col: string }[] = [];
  readonly uniforms = { uLifeFarFlutter: { value: 220 }, uClothTrans: { value: 1.1 }, uLifePxK: { value: 0.001 }, uBulbGain: { value: 0 }, uBulbNight: { value: 0 } };
  clothMesh: THREE.Mesh | null = null;
  /** plain pieces (4 × 4 grid) and draped laundry (8 × 5) */
  clothMeshes: THREE.Mesh[] = [];
  wireMesh: THREE.Mesh | null = null;
  bulbMesh: THREE.Mesh | null = null;
  tris = 0;
  verts = 0;

  constructor(private ctx: CityContext) {
    this.group.name = 'life-cloth';
  }

  addLine(l: Omit<Line, 'wire' | 'r'> & Partial<Pick<Line, 'wire' | 'r'>>): number {
    this.lines.push({ wire: '#3b3936', r: 0.007, ...l });
    return this.lines.length - 1;
  }

  /** do not draw this line's wire (cloth / bulbs still hang on it) */
  noWire(i: number): void {
    this.lines[i].hidden = true;
  }

  /** a piece hinged on line `line` centred at parameter s */
  addPiece(line: number, s: number, o: PieceOpts): void {
    this.pieces.push({ line, s, pole: null, o });
    // laundry is pegged: two pegs near the corners (three on a sheet), wood or coloured plastic
    if (o.drape && o.shape !== SHAPE.PEG) {
      const L = Math.max(0.1, this.span(line));
      const h = Math.floor(((o.phase ?? s * 7.3) * 1000) % 97);
      const col = PEG_COLS[h % PEG_COLS.length];
      const at = o.w > 0.8 ? [-0.44, 0, 0.44] : o.w < 0.14 ? [0] : [-0.42, 0.42];
      for (const f of at) this.pieces.push({ line, s: s + (f * o.w) / L, pole: null, o: { w: 0.016, len: 0.072, shape: SHAPE.PEG, col, weight: 1 } });
    }
  }

  /** a flag on a vertical hoist from `top` down to `bottom` */
  addPoleFlag(top: THREE.Vector3, bottom: THREE.Vector3, o: PieceOpts): void {
    this.pieces.push({ line: -1, s: 0, pole: { top: top.clone(), bottom: bottom.clone() }, o });
  }

  addBulb(line: number, s: number, col: string, drop = 0.07, r = 0.035): void {
    this.bulbs.push({ line, s, drop, r, col });
  }

  get pieceCount(): number {
    return this.pieces.length;
  }
  get bulbCount(): number {
    return this.bulbs.length;
  }

  /** world length of a line's chord */
  span(i: number): number {
    const l = this.lines[i];
    return Math.hypot(l.bx - l.ax, l.by - l.ay, l.bz - l.az);
  }

  build(): void {
    const u = this.ctx.uniforms;
    const shared = { uTime: u.uTime, uWind: u.uWind, ...this.uniforms };
    const bounds = new THREE.Box3();
    for (const l of this.lines) {
      bounds.expandByPoint(new THREE.Vector3(l.ax, l.ay, l.az));
      bounds.expandByPoint(new THREE.Vector3(l.bx, l.by - l.sag - 1.5, l.bz));
    }
    for (const p of this.pieces) if (p.pole) bounds.expandByPoint(p.pole.top).expandByPoint(p.pole.bottom);
    bounds.expandByScalar(3);
    const sphere = bounds.isEmpty() ? new THREE.Sphere(new THREE.Vector3(), 1) : bounds.getBoundingSphere(new THREE.Sphere());

    if (this.pieces.length) this.buildCloth(shared, sphere);
    if (this.lines.some((l) => !l.hidden)) this.buildWires(shared, sphere);
    if (this.bulbs.length) this.buildBulbs(shared, sphere);
  }

  // ───────────────────────────────────────────────────────────── cloth ──
  private buildCloth(shared: Record<string, { value: unknown }>, sphere: THREE.Sphere): void {
    // two grids: draped laundry needs columns for its folds (8 × 5); pennants, flags and pegs stay 4 × 4
    const makeGeo = (list: typeof this.pieces, NU: number, NV: number): THREE.InstancedBufferGeometry => {
      const base = new THREE.PlaneGeometry(1, 1, NU, NV);
      // remap the plane to (u, v) ∈ [0,1]² with v growing away from the hinge
      const pos = base.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + 0.5, 0.5 - pos.getY(i), 0);
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = base.index;
      geo.setAttribute('position', pos);
      geo.setAttribute('normal', base.getAttribute('normal'));
      const n = list.length;
      const P0 = new Float32Array(n * 4),
        P1 = new Float32Array(n * 4),
        PC = new Float32Array(n * 4),
        MI = new Float32Array(n * 4),
        C1 = new Float32Array(n * 4),
        C2 = new Float32Array(n * 4);
      list.forEach((p, i) => {
        const o = p.o;
        if (p.pole) {
          P0.set([p.pole.top.x, p.pole.top.y, p.pole.top.z, 0], i * 4);
          P1.set([p.pole.bottom.x, p.pole.bottom.y, p.pole.bottom.z, 0], i * 4);
        } else {
          const l = this.lines[p.line];
          P0.set([l.ax, l.ay, l.az, l.sag], i * 4);
          P1.set([l.bx, l.by, l.bz, l.seed], i * 4);
        }
        PC.set([p.s, o.w, o.len, o.shape], i * 4);
        MI.set([o.phase ?? (i * 2.399) % 6.283, o.weight ?? 1, p.pole ? 1 : 0, o.flutter ?? 1], i * 4);
        _c.set(o.col);
        C1.set([_c.r, _c.g, _c.b, o.pattern ?? 0], i * 4);
        _c.set(o.col2 ?? o.col);
        C2.set([_c.r, _c.g, _c.b, o.drape ?? 0], i * 4);
      });
      geo.setAttribute('aP0', new THREE.InstancedBufferAttribute(P0, 4));
      geo.setAttribute('aP1', new THREE.InstancedBufferAttribute(P1, 4));
      geo.setAttribute('aPiece', new THREE.InstancedBufferAttribute(PC, 4));
      geo.setAttribute('aMisc', new THREE.InstancedBufferAttribute(MI, 4));
      geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(C1, 4));
      geo.setAttribute('aCol2', new THREE.InstancedBufferAttribute(C2, 4));
      geo.instanceCount = n;
      geo.boundingSphere = sphere.clone();
      this.tris += n * NU * NV * 2;
      this.verts += n * (NU + 1) * (NV + 1);
      return geo;
    };
    const draped = this.pieces.filter((p) => p.o.drape && p.o.shape !== SHAPE.PEG);
    const plain = this.pieces.filter((p) => !(p.o.drape && p.o.shape !== SHAPE.PEG));

    const vertexMain = /* glsl */ `
      vec3 lifeP, lifeN;
      lifePiece( lifeP, lifeN );
      vec3 objectNormal = lifeN;
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3( 1.0, 0.0, 0.0 );
      #endif
    `;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
    mat.name = 'life-cloth';
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, shared);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform vec2 uWind;\n${WIND_GLSL}${LIFE_LINE_GLSL}${LIFE_CLOTH_PARS}`)
        .replace('#include <beginnormal_vertex>', vertexMain)
        .replace('#include <begin_vertex>', 'vec3 transformed = lifeP;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nuniform float uClothTrans;\nvarying vec2 vLifeUv;\nvarying float vLifeShape;\nvarying vec3 vLifeCol;\nvarying vec3 vLifeCol2;\nvarying float vLifePat;\n${LIFE_MASK_GLSL}${LIFE_PATTERN_GLSL}`,
        )
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if ( !lifeKeep( vLifeUv, vLifeShape ) ) discard;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= lifePattern( vLifeUv, vLifeCol, vLifeCol2, vLifePat );')
        .replace(
          '#include <lights_physical_pars_fragment>',
          /* glsl */ `#include <lights_physical_pars_fragment>
// thin cloth: light arriving on the far side shines through (tinted by the cloth), strongest when
// looking towards the light (forward scattering) — golden-hour bunting glows
void RE_Direct_Cloth( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  float back = max( -dot( geometryNormal, directLight.direction ), 0.0 );
  float fwd = pow( max( dot( -geometryViewDir, directLight.direction ), 0.0 ), 5.0 );
  reflectedLight.directDiffuse += directLight.color * material.diffuseColor * material.diffuseColor * uClothTrans * back * ( 0.5 + 1.2 * fwd );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Cloth
`,
        );
    };
    mat.customProgramCacheKey = () => 'life-cloth-1';
    patchLampMaterial(mat);

    const depth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
    depth.name = 'life-cloth-depth';
    depth.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, shared);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n#define LIFE_DEPTH\nuniform float uTime;\nuniform vec2 uWind;\n${WIND_GLSL}${LIFE_LINE_GLSL}${LIFE_CLOTH_PARS}`)
        .replace('#include <begin_vertex>', 'vec3 lifeP, lifeN;\n  lifePiece( lifeP, lifeN );\n  vec3 transformed = lifeP;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec2 vLifeUv;\nvarying float vLifeShape;\n${LIFE_MASK_GLSL}`)
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if ( !lifeKeep( vLifeUv, vLifeShape ) ) discard;');
    };
    depth.customProgramCacheKey = () => 'life-cloth-depth-1';

    for (const [list, NU, NV] of [[plain, 4, 4], [draped, 8, 5]] as const) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(makeGeo(list, NU, NV), mat);
      mesh.name = 'life-cloth';
      mesh.customDepthMaterial = depth;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.clothMeshes.push(mesh);
      this.clothMesh ??= mesh;
    }
  }

  // ───────────────────────────────────────────────────────────── wires ──
  private buildWires(shared: Record<string, { value: unknown }>, sphere: THREE.Sphere): void {
    const SEG = 20;
    // per vertex: x = s, y = across (−1 / +1), z = ribbon (0 horizontal, 1 vertical)
    const pos: number[] = [];
    const idx: number[] = [];
    for (let r = 0; r < 2; r++) {
      const o = pos.length / 3;
      for (let i = 0; i <= SEG; i++) pos.push(i / SEG, -1, r, i / SEG, 1, r);
      for (let i = 0; i < SEG; i++) {
        const a = o + i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0), 3));
    geo.setIndex(idx);
    const vis = this.lines.filter((l) => !l.hidden);
    const n = vis.length;
    const P0 = new Float32Array(n * 4),
      P1 = new Float32Array(n * 4),
      WC = new Float32Array(n * 4);
    vis.forEach((l, i) => {
      P0.set([l.ax, l.ay, l.az, l.sag], i * 4);
      P1.set([l.bx, l.by, l.bz, l.seed], i * 4);
      _c.set(l.wire);
      WC.set([_c.r, _c.g, _c.b, l.r], i * 4);
    });
    geo.setAttribute('aP0', new THREE.InstancedBufferAttribute(P0, 4));
    geo.setAttribute('aP1', new THREE.InstancedBufferAttribute(P1, 4));
    geo.setAttribute('aWire', new THREE.InstancedBufferAttribute(WC, 4));
    geo.instanceCount = n;
    geo.boundingSphere = sphere.clone();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
    mat.name = 'life-wire';
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, shared);
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>\nuniform float uTime;\nuniform vec2 uWind;\nuniform float uLifePxK;\nattribute vec4 aP0;\nattribute vec4 aP1;\nattribute vec4 aWire;\nvarying vec3 vWireCol;\n${WIND_GLSL}${LIFE_LINE_GLSL}`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          /* glsl */ `
          vec3 wT;
          vec3 wP = lifeLine( aP0.xyz, aP1.xyz, aP0.w, aP1.w, position.x, wT );
          vec3 wS = normalize( cross( wT, vec3( 0.0, 1.0, 0.0 ) ) + vec3( 1e-4, 0.0, 0.0 ) );
          vec3 wU = cross( wS, wT );
          vec3 wDir = position.z < 0.5 ? wS : wU;
          vec3 objectNormal = position.z < 0.5 ? wU : wS;
          float wD = length( cameraPosition - wP );
          // ≥ ~0.9 px wide up close, then thin out and vanish (real wires are invisible from afar)
          float wR = max( aWire.w, wD * uLifePxK * 0.45 ) * ( 1.0 - smoothstep( 110.0, 190.0, wD ) );
          vWireCol = aWire.rgb;
          `,
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = wP + wDir * position.y * wR;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWireCol;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vWireCol;');
    };
    mat.customProgramCacheKey = () => 'life-wire-1';
    patchLampMaterial(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'life-wires';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    this.wireMesh = mesh;
    this.tris += n * SEG * 4;
    this.verts += n * (SEG + 1) * 4;
  }

  // ───────────────────────────────────────────────────────────── bulbs ──
  private buildBulbs(shared: Record<string, { value: unknown }>, sphere: THREE.Sphere): void {
    const base = new THREE.IcosahedronGeometry(1, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('normal', base.getAttribute('normal'));
    if (!geo.index) {
      const cnt = base.getAttribute('position').count;
      geo.setIndex(Array.from({ length: cnt }, (_, i) => i));
    }
    const n = this.bulbs.length;
    const P0 = new Float32Array(n * 4),
      P1 = new Float32Array(n * 4),
      BI = new Float32Array(n * 4),
      BC = new Float32Array(n * 3);
    this.bulbs.forEach((b, i) => {
      const l = this.lines[b.line];
      P0.set([l.ax, l.ay, l.az, l.sag], i * 4);
      P1.set([l.bx, l.by, l.bz, l.seed], i * 4);
      BI.set([b.s, b.drop, b.r, 0], i * 4);
      _c.set(b.col);
      BC.set([_c.r, _c.g, _c.b], i * 3);
    });
    geo.setAttribute('aP0', new THREE.InstancedBufferAttribute(P0, 4));
    geo.setAttribute('aP1', new THREE.InstancedBufferAttribute(P1, 4));
    geo.setAttribute('aBulb', new THREE.InstancedBufferAttribute(BI, 4));
    geo.setAttribute('aBulbCol', new THREE.InstancedBufferAttribute(BC, 3));
    geo.instanceCount = n;
    geo.boundingSphere = sphere.clone();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0, color: '#d8d4c8' });
    mat.name = 'life-bulbs';
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, shared);
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>\nuniform float uTime;\nuniform vec2 uWind;\nuniform float uLifePxK;\nuniform float uBulbNight;\nattribute vec4 aP0;\nattribute vec4 aP1;\nattribute vec4 aBulb;\nattribute vec3 aBulbCol;\nvarying vec3 vBulbCol;\n${WIND_GLSL}${LIFE_LINE_GLSL}`,
        )
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `
          vec3 bT;
          vec3 bP = lifeLine( aP0.xyz, aP1.xyz, aP0.w, aP1.w, aBulb.x, bT ) - vec3( 0.0, aBulb.y, 0.0 );
          float bD = length( cameraPosition - bP );
          // keep a lit bulb at least ~1.2 px wide so festoons read as dotted light lines from afar
          // at night a lit bulb stays ≥ ~1.2 px (festoons read as dotted light lines from afar); by day
          // only nearby bulbs get the floor
          float bFloor = max( uBulbNight, 1.0 - smoothstep( 50.0, 90.0, bD ) );
          float bR = max( aBulb.z, bD * uLifePxK * 0.6 * bFloor );
          vec3 transformed = bP + position * bR;
          vBulbCol = aBulbCol;
          `,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uBulbGain;\nvarying vec3 vBulbCol;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= mix( vec3( 1.0 ), vBulbCol, 0.35 );')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vBulbCol * uBulbGain;');
    };
    mat.customProgramCacheKey = () => 'life-bulbs-1';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'life-bulbs';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    this.bulbMesh = mesh;
    this.tris += n * 20;
    this.verts += n * 12;
  }

  /** per-frame uniforms: pixel footprint (wire / bulb width floor), bulb glow */
  frame(): void {
    const cam = this.ctx.camera;
    const h = Math.max(1, this.ctx.size.height * this.ctx.renderer.getPixelRatio());
    this.uniforms.uLifePxK.value = (2 * Math.tan((cam.fov * Math.PI) / 360)) / h;
    const lights = Math.min(1, Math.max(0, this.ctx.uniforms.uLights.value));
    this.uniforms.uBulbGain.value = 0.04 + lights * 5.5;
    this.uniforms.uBulbNight.value = lights;
  }
}

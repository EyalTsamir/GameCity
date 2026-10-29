// Close-range exploring for the free camera (the default orbit). The free camera may go inside things —
// buildings, landmarks, under bridges, among trees, between market stalls — so it needs:
//  * a floor at the ground / water surface (FLOOR_CLEAR above it) instead of the roofs;
//  * a near plane that shrinks only when a wall, floor or ceiling is right in front of the lens (a small near
//    plane everywhere would cost depth precision far away);
//  * a lens focus on what the camera looks at once the orbit pivot is only a step ahead of it;
//  * something to see inside a building: facades are single-sided (back faces skipped), so from inside a shell
//    the city would show through a void. The camera gets a room instead — the current storey of the footprint
//    it is in, drawn from the inside (one box, BackSide), with window and door openings to look out of.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import type { Lot } from '../../core/plan';
import { globalUniforms } from '../../core/uniforms';
import type { SurfaceField } from './surface';

/** clearance the free camera keeps above the ground / water surface (m) */
export const FLOOR_CLEAR = 0.4;
/** lots built by the landmarks module get no room: they have walls of their own inside (station hall, church
 *  nave, town hall arcade) or are open (stadium bowl, building site, masts) */
const LANDMARK_KINDS = new Set<Lot['kind']>(['station', 'townhall', 'church', 'tvtower', 'construction', 'watertower', 'stadium']);
const CELL = 16;
/** room walls stand this far inside the footprint (facades are inset / relieved by up to ~0.35 m) */
const WALL_INSET = 0.45;
/** the room shows from this far outside the footprint: the near plane clips the facade just before the camera reaches it */
const ENTER_PAD = 0.3;
const MAX_DOORS = 6;
/** ground-floor rooms sit on a plinth above the sidewalk (0.15) */
const PLINTH = 0.18;

interface TerrainLike {
  height(x: number, z: number): number;
}
interface WaterLike {
  surfaceY(x: number, z: number): number;
}

/** window layout per building kind: bay width, glazed fraction, sill, head below the ceiling */
function windowsFor(lot: Lot, storey: number, h: number): [number, number, number, number] {
  if (storey === 0 && lot.shopfront) return [3.2, 0.8, 0.4, Math.min(3.0, h - 0.4)];
  switch (lot.kind) {
    case 'tower':
    case 'office':
    case 'hotel':
      return [1.5, 0.86, 0.75, h - 0.35];
    case 'warehouse':
    case 'factory':
    case 'depot':
      return [4, 0.6, h * 0.55, h - 0.6];
    case 'school':
      return [3.2, 0.5, 1.0, Math.min(h - 0.6, 3.2)];
    default:
      return [2.6, 0.45, 0.9, Math.min(2.3, h - 0.35)];
  }
}

/** floor pattern (0 planks, 1 carpet tiles, 2 concrete, 3 stone tiles) and wall / floor colours (sRGB) */
function finishFor(lot: Lot): { kind: number; wall: [number, number, number]; floor: [number, number, number] } {
  const tint = (lot.style % 4) * 0.02;
  switch (lot.kind) {
    case 'tower':
    case 'office':
      return { kind: 1, wall: [0.86, 0.87, 0.86], floor: [0.36, 0.39, 0.44] };
    case 'warehouse':
    case 'factory':
    case 'depot':
    case 'boathouse':
      return { kind: 2, wall: [0.66, 0.66, 0.63], floor: [0.55, 0.55, 0.52] };
    case 'school':
    case 'hotel':
      return { kind: 3, wall: [0.9, 0.86, 0.78], floor: [0.68, 0.63, 0.56] };
    default:
      return { kind: 0, wall: [0.9 - tint, 0.85, 0.76 + tint], floor: [0.56, 0.4, 0.27] };
  }
}

export class ExploreAid {
  /** the room around the camera (hidden unless the camera is inside a building) */
  readonly room: THREE.Mesh;
  /** the building the room belongs to (null: the camera is not inside one) */
  roomLot: Lot | null = null;
  private storey = -1;
  private readonly min = new THREE.Vector3();
  private readonly max = new THREE.Vector3();
  private readonly cells = new Map<number, Lot[]>();
  private readonly u = {
    uRoomMin: { value: new THREE.Vector3() },
    uRoomMax: { value: new THREE.Vector3() },
    uWin: { value: new THREE.Vector4(2.6, 0.45, 0.9, 2.3) },
    uDoors: { value: Array.from({ length: MAX_DOORS }, () => new THREE.Vector4()) },
    uWall: { value: new THREE.Color() },
    uFloor: { value: new THREE.Color() },
    uCeil: { value: new THREE.Color().setRGB(0.88, 0.87, 0.84, THREE.SRGBColorSpace) },
    uFloorKind: { value: 0 },
    uNight: globalUniforms.uNight,
  };
  private readonly _ray = new THREE.Ray();
  private readonly _hit = new THREE.Vector3();
  private readonly _box = new THREE.Box3();

  constructor(
    private ctx: CityContext,
    private field: SurfaceField,
  ) {
    for (const lot of ctx.plan.lots) {
      if (!(lot.height > 2)) continue;
      const f = lot.footprint;
      // registered in every cell within 2 m of the footprint (proximity tests look 2 m around the camera)
      for (let i = Math.floor((f.x0 - 2) / CELL); i <= Math.floor((f.x1 + 2) / CELL); i++)
        for (let j = Math.floor((f.z0 - 2) / CELL); j <= Math.floor((f.z1 + 2) / CELL); j++) {
          const k = this.key(i, j);
          const list = this.cells.get(k);
          if (list) list.push(lot);
          else this.cells.set(k, [lot]);
        }
    }
    const mat = new THREE.MeshStandardMaterial({ side: THREE.BackSide, roughness: 0.82, metalness: 0 });
    mat.customProgramCacheKey = () => 'camera-room';
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRoomP;\nvarying vec3 vRoomN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoomP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRoomN = normal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${ROOM_PARS}`)
        .replace('#include <color_fragment>', ROOM_COLOR)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += roomGlow;')
        // the building around the room keeps most of the sun out (its single-sided shell shadows it unevenly)
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directDiffuse *= 0.3;\nreflectedLight.directSpecular *= 0.3;');
    };
    const room = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    room.name = 'camera-room';
    room.visible = false;
    room.frustumCulled = false;
    room.castShadow = false;
    room.receiveShadow = false;
    room.matrixAutoUpdate = false;
    this.room = room;
    ctx.scene.add(room);
  }

  private key(i: number, j: number): number {
    return (i + 4096) * 8192 + (j + 4096);
  }

  private near(x: number, z: number): Lot[] | undefined {
    return this.cells.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL)));
  }

  /** the building / landmark lot whose volume (footprint grown by `pad`, ground to roof) contains the point */
  lotAt(x: number, y: number, z: number, pad = 0): Lot | null {
    const list = this.near(x, z);
    if (!list) return null;
    for (const lot of list) {
      const f = lot.footprint;
      if (x > f.x0 - pad && x < f.x1 + pad && z > f.z0 - pad && z < f.z1 + pad && y > -0.5 && y < lot.height) return lot;
    }
    return null;
  }

  /** lowest camera height at (x, z): the rendered ground or the water surface, plus FLOOR_CLEAR */
  floorAt(x: number, z: number): number {
    const t = this.ctx.services.terrain as TerrainLike | undefined;
    const w = this.ctx.services.water as WaterLike | undefined;
    let g = t && this.field.inside(x, z) ? t.height(x, z) : this.field.groundAt(x, z);
    if (w) g = Math.max(g, w.surfaceY(x, z));
    return (Number.isFinite(g) ? g : this.field.groundAt(x, z)) + FLOOR_CLEAR;
  }

  /** shows / places the room for a camera at `p` (`on` false hides it); true while the camera is inside a building */
  update(p: THREE.Vector3, on: boolean): boolean {
    const lot = on ? this.lotAt(p.x, p.y, p.z, ENTER_PAD) : null;
    if (!lot || LANDMARK_KINDS.has(lot.kind)) {
      this.room.visible = false;
      this.roomLot = null;
      this.storey = -1;
      return false;
    }
    const sh = lot.height / Math.max(1, lot.floors);
    const k = Math.min(Math.max(0, Math.floor(p.y / sh)), Math.max(0, lot.floors - 1));
    if (lot !== this.roomLot || k !== this.storey) this.place(lot, k, sh);
    this.room.visible = true;
    return true;
  }

  private place(lot: Lot, k: number, sh: number): void {
    this.roomLot = lot;
    this.storey = k;
    const f = lot.footprint;
    const ix = Math.min(WALL_INSET, (f.x1 - f.x0) / 4),
      iz = Math.min(WALL_INSET, (f.z1 - f.z0) / 4);
    const y0 = k === 0 ? PLINTH : k * sh;
    const y1 = k >= lot.floors - 1 ? lot.height : (k + 1) * sh;
    this.min.set(f.x0 + ix, y0, f.z0 + iz);
    this.max.set(f.x1 - ix, Math.max(y0 + 2.2, y1 - 0.05), f.z1 - iz);
    const r = this.room;
    r.position.addVectors(this.min, this.max).multiplyScalar(0.5);
    r.scale.subVectors(this.max, this.min);
    r.updateMatrix();
    r.updateMatrixWorld(true);
    const u = this.u;
    u.uRoomMin.value.copy(this.min);
    u.uRoomMax.value.copy(this.max);
    u.uWin.value.set(...windowsFor(lot, k, this.max.y - this.min.y));
    const fin = finishFor(lot);
    u.uFloorKind.value = fin.kind;
    u.uWall.value.setRGB(...fin.wall, THREE.SRGBColorSpace);
    u.uFloor.value.setRGB(...fin.floor, THREE.SRGBColorSpace);
    // door openings on the ground floor (side: 0 +x, 1 −x, 2 +z, 3 −z; along-wall centre; half width)
    let n = 0;
    for (const d of u.uDoors.value) d.set(0, 0, 0, 0);
    if (k === 0)
      for (const d of lot.doors) {
        if (n >= MAX_DOORS) break;
        const side = d.dir === 'E' ? 0 : d.dir === 'W' ? 1 : d.dir === 'S' ? 2 : 3;
        u.uDoors.value[n++].set(side, side < 2 ? d.z : d.x, 0.8, 1);
      }
  }

  /** distance from `p` to the nearest surface the near plane could cut: room planes, facades within 2 m, the ground */
  proximity(p: THREE.Vector3): number {
    let d = p.y - (this.floorAt(p.x, p.z) - FLOOR_CLEAR);
    if (this.roomLot) {
      const a = this.min,
        b = this.max;
      d = Math.min(d, Math.abs(p.x - a.x), Math.abs(b.x - p.x), Math.abs(p.z - a.z), Math.abs(b.z - p.z), Math.abs(p.y - a.y), Math.abs(b.y - p.y));
    }
    const list = this.near(p.x, p.z);
    if (list)
      for (const lot of list) {
        if (lot === this.roomLot) continue;
        const f = lot.footprint;
        const dx = Math.max(f.x0 - p.x, 0, p.x - f.x1),
          dz = Math.max(f.z0 - p.z, 0, p.z - f.z1),
          dy = Math.max(0, p.y - lot.height);
        // (inside a landmark's box — station hall, stadium bowl — its outer walls and roof)
        const inside = dx === 0 && dz === 0 && dy === 0;
        d = Math.min(d, inside ? Math.min(p.x - f.x0, f.x1 - p.x, p.z - f.z0, f.z1 - p.z, lot.height - p.y) : Math.hypot(dx, dy, dz));
      }
    return Math.max(0, d);
  }

  /** near plane for the free camera: the usual one, smaller only while something is right in front of the lens */
  nearPlane(p: THREE.Vector3, effDist: number): number {
    const near = Math.min(20, Math.max(0.3, effDist * 0.02));
    const prox = this.proximity(p);
    return prox < near * 2 ? Math.max(0.05, prox * 0.5) : near;
  }

  /** distance to what the camera at `p` looks at along `dir`: the room's far side inside, else the city (≥ 2.5 m) */
  focusAt(p: THREE.Vector3, dir: THREE.Vector3): number {
    let t = -1;
    if (this.roomLot) {
      this._box.set(this.min, this.max);
      // from inside the box the ray meets its far side
      this._ray.set(p, dir);
      if (this._box.containsPoint(p) && this._ray.intersectBox(this._box, this._hit)) t = this._hit.distanceTo(p);
    }
    if (t < 0) t = this.field.raycast(p, dir, 600, this._hit, !this.lotAt(p.x, p.y, p.z));
    return t < 0 ? 300 : Math.max(2.5, t);
  }

  dispose(): void {
    this.ctx.scene.remove(this.room);
    this.room.geometry.dispose();
    (this.room.material as THREE.Material).dispose();
  }
}

const ROOM_PARS = /* glsl */ `
varying vec3 vRoomP;
varying vec3 vRoomN;
uniform vec3 uRoomMin;
uniform vec3 uRoomMax;
uniform vec4 uWin;
uniform vec4 uDoors[${MAX_DOORS}];
uniform vec3 uWall;
uniform vec3 uFloor;
uniform vec3 uCeil;
uniform float uFloorKind;
uniform float uNight;
float roomHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`;

// faces are seen from inside: vRoomN is the outward normal of the face being drawn
const ROOM_COLOR = /* glsl */ `
#include <color_fragment>
vec3 roomGlow = vec3(0.0);
{
  vec3 rp = vRoomP;
  vec3 rn = vRoomN;
  float hh = rp.y - uRoomMin.y;
  vec3 base;
  if (rn.y < -0.5) {
    // floor
    if (uFloorKind < 0.5) {
      // oak planks along x, staggered joints
      float row = floor(rp.z / 0.16);
      float seg = floor((rp.x + roomHash(vec2(row, 3.1)) * 2.0) / 1.8);
      base = uFloor * (0.78 + 0.36 * roomHash(vec2(row, seg)));
      float e = 0.08 - abs(fract(rp.z / 0.16) - 0.5) * 0.16;
      base *= mix(0.55, 1.0, smoothstep(0.0, 0.006, e));
    } else if (uFloorKind < 1.5) {
      vec2 t = floor(rp.xz / 0.6);
      base = uFloor * (0.88 + 0.18 * roomHash(t));
    } else if (uFloorKind < 2.5) {
      vec2 j = abs(fract(rp.xz / 4.0) - 0.5) * 4.0;
      base = uFloor * (0.92 + 0.1 * roomHash(floor(rp.xz / 4.0))) * mix(0.7, 1.0, smoothstep(0.0, 0.02, min(2.0 - j.x, 2.0 - j.y)));
    } else {
      vec2 j = abs(fract(rp.xz / 0.8) - 0.5) * 0.8;
      base = uFloor * (0.84 + 0.22 * roomHash(floor(rp.xz / 0.8))) * mix(0.55, 1.0, smoothstep(0.0, 0.012, min(0.4 - j.x, 0.4 - j.y)));
    }
  } else if (rn.y > 0.5) {
    // ceiling with light panels on a 2.4 m grid
    base = uCeil;
    vec2 c = abs(fract(rp.xz / 2.4) - 0.5) * 2.4;
    float panel = (1.0 - smoothstep(0.55, 0.58, c.x)) * (1.0 - smoothstep(0.16, 0.19, c.y));
    roomGlow += vec3(1.0, 0.92, 0.8) * panel * (1.6 + 2.4 * uNight);
  } else {
    // wall: window bays spread evenly along it, door openings on the ground floor
    bool alongX = abs(rn.z) > 0.5;
    float u = alongX ? rp.x : rp.z;
    float u0 = alongX ? uRoomMin.x : uRoomMin.z;
    float len = (alongX ? uRoomMax.x : uRoomMax.z) - u0;
    float side = rn.x > 0.5 ? 0.0 : rn.x < -0.5 ? 1.0 : rn.z > 0.5 ? 2.0 : 3.0;
    float nb = max(1.0, floor(len / uWin.x + 0.5));
    float bw = len / nb;
    float lu = (fract((u - u0) / bw) - 0.5) * bw;
    // distance outside the nearest opening (negative inside it)
    float d = max(abs(lu) - bw * uWin.y * 0.5, max(uWin.z - hh, hh - uWin.w));
    for (int i = 0; i < ${MAX_DOORS}; i++) {
      vec4 dr = uDoors[i];
      if (dr.w > 0.5 && abs(dr.x - side) < 0.5) d = min(d, max(abs(u - dr.y) - dr.z, hh - 2.3));
    }
    if (d < 0.0) discard;
    base = uWall;
    base = mix(base, vec3(0.05), (1.0 - smoothstep(0.0, 0.07, d)) * 0.85);
    base *= mix(0.5, 1.0, smoothstep(0.1, 0.12, hh));
  }
  diffuseColor.rgb = base;
  // the room's own lighting (the building around it shades the sun)
  roomGlow += base * (0.16 + 0.34 * uNight);
}
`;

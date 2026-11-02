// What moves by itself, for temporal AA (postfx/taa.ts): anything inside this mask takes no history, ever. A bus sliding along its own side
// has the same depth from frame to frame, and no check on depth or colour tells its window bar from a wall's.
//
// The simulations know where everything is, so no material has to change and no vehicle or person is drawn twice (the scene is vertex-bound):
// one box per mover, a few thousand vertices. A pixel counts if the scene's depth there is about as far as the box.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';

const VERT = /* glsl */ `
attribute vec4 iA;
attribute vec3 iB;
varying float vZ;
varying float vR;
void main() {
  float s = sin( iA.w ), c = cos( iA.w );
  vec3 q = position * iB;
  vec4 mv = viewMatrix * vec4( vec3( q.x * c + q.z * s, q.y, -q.x * s + q.z * c ) + iA.xyz, 1.0 );
  vZ = -( viewMatrix * vec4( iA.xyz, 1.0 ) ).z;
  vR = length( iB );
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform highp sampler2D tDepth;
uniform vec2 uP;
varying float vZ;
varying float vR;
void main() {
  float z = uP.y / ( texelFetch( tDepth, ivec2( gl_FragCoord.xy ), 0 ).x * 2.0 - 1.0 + uP.x );
  if ( abs( z - vZ ) > vR ) discard;
  gl_FragColor = vec4( 1.0 );
}
`;

/** people, vehicles, train cars, boats */
const CAP = 1500;
/** people further off than this are a few pixels, and they are most of the boxes */
const PEOPLE_FAR2 = 300 * 300;
const _clear = new THREE.Color();

/** only what's read here of the modules' services (each module types its own) */
interface MoverServices {
  traffic?: { vehicles(): readonly { x: number; z: number; yaw: number; hw: number; len: number; spec?: { height: number } }[] };
  pedestrians?: { _crowd: { parties: readonly { members: readonly { present: boolean; x: number; y: number; z: number }[] }[] } };
  rail?: { sim: { trains: readonly { cars: readonly { visible: boolean; x: number; y: number; half: number }[] }[] } };
  boats?: { fleet: { boats: readonly { x: number; z: number }[] } };
}

export class MoverMask {
  readonly target: THREE.WebGLRenderTarget;
  private a = new Float32Array(CAP * 4);
  private b = new Float32Array(CAP * 3);
  private attrA: THREE.InstancedBufferAttribute;
  private attrB: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private n = 0;

  constructor(private ctx: CityContext) {
    this.target = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RedFormat, type: THREE.UnsignedByteType });
    this.target.texture.name = 'TAA.Movers';
    const box = new THREE.BoxGeometry(2, 2, 2);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute('position', box.getAttribute('position'));
    this.geo.setIndex(box.getIndex());
    this.attrA = new THREE.InstancedBufferAttribute(this.a, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrB = new THREE.InstancedBufferAttribute(this.b, 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iA', this.attrA);
    this.geo.setAttribute('iB', this.attrB);
    // (the far faces: the camera may stand inside a box)
    this.mat = new THREE.ShaderMaterial({ name: 'TAAMovers', uniforms: { tDepth: { value: null }, uP: { value: new THREE.Vector2() } }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
  }

  private add(x: number, y: number, z: number, yaw: number, hx: number, hy: number, hz: number): void {
    if (this.n >= CAP) return;
    const i = this.n++;
    this.a[i * 4] = x;
    this.a[i * 4 + 1] = y;
    this.a[i * 4 + 2] = z;
    this.a[i * 4 + 3] = yaw;
    this.b[i * 3] = hx;
    this.b[i * 3 + 1] = hy;
    this.b[i * 3 + 2] = hz;
  }

  private collect(eye: THREE.Vector3): void {
    this.n = 0;
    const s = this.ctx.services as unknown as MoverServices;
    // (a little longer than the thing: last frame's place, mirrors, a rider's elbow)
    const vehicles = s.traffic?.vehicles();
    if (vehicles) for (const V of vehicles) this.add(V.x, 0, V.z, V.yaw, V.hw + 0.5, (V.spec?.height ?? 2) * 0.5 + 0.8, V.len * 0.5 + 0.8);
    const crowd = s.pedestrians?._crowd;
    if (crowd)
      for (const p of crowd.parties)
        for (const m of p.members) {
          if (!m.present || (m.x - eye.x) ** 2 + (m.z - eye.z) ** 2 > PEOPLE_FAR2) continue;
          this.add(m.x, m.y + 0.9, m.z, 0, 0.75, 1.15, 0.75);
        }
    const rail = s.rail?.sim;
    if (rail) {
      const rz = this.ctx.plan.rail.z;
      for (const t of rail.trains) for (const c of t.cars) if (c.visible) this.add(c.x, c.y + 2, rz, 0, c.half + 0.6, 3.2, 2.2);
    }
    const boats = s.boats?.fleet.boats;
    if (boats) for (const b of boats) this.add(b.x, 2, b.z, 0, 18, 9, 18);
  }

  setSize(w: number, h: number): void {
    this.target.setSize(w, h);
  }

  draw(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, depth: THREE.Texture, eye: THREE.Vector3): void {
    this.collect(eye);
    this.attrA.needsUpdate = true;
    this.attrB.needsUpdate = true;
    this.geo.instanceCount = this.n;
    const e = camera.projectionMatrix.elements;
    this.mat.uniforms.tDepth.value = depth;
    (this.mat.uniforms.uP.value as THREE.Vector2).set(e[10], e[14]);
    renderer.getClearColor(_clear);
    const alpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.setClearColor(_clear, alpha);
    if (this.n > 0) renderer.render(this.mesh, camera);
  }

  dispose(): void {
    this.target.dispose();
    this.geo.dispose();
    this.mat.dispose();
  }
}

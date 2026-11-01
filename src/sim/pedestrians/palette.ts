// Perf-deep (?nopedpalette): the people's skeleton is computed once per figure and frame in a small GPU pass and the
// vertex programs of shader.ts only fetch it — GPU skinning. Rebuilding the chain per vertex (up to 13 joint rotations,
// each with trig and pivot evaluation) was the largest vertex cost of the city: 50 ns per triangle against 2.5 for
// static geometry.
//
// Three RGBA32F targets, one row per figure and one texel per bone: target k row b holds row k of that bone's figure-space
// mat3x4 (the pelvis included). Multiple targets and one point per bone instead of 3 texels per bone from a fragment
// program: the chain runs in the vertex stage once per bone (not 3 times per bone, per pixel) and the fragment only
// copies flat varyings. One instanced draw of `PAL_BONES` points; each figure this frame has one row whatever layers
// draw it (its level, a level it fades out of, the shadow proxy: `iPalRow` in the layers points here) and its pose
// words are copied into the pass's own buffer.

import * as THREE from 'three';
import { perfOn } from '../../core/perfdeep';
import { BONE as B } from './body';
import { PIV, PIV_COUNT } from './rig';
import { GLSL_FOOT_R, PAL_BONES, PED_JOINT_GLSL, PED_JOINT_R as J, POSE_UINTS, pedPivUniform } from './shader';

function vertexSource(rows: number): string {
  return /* glsl */ `precision highp float;
precision highp int;
in vec3 position; // x = bone
in uvec4 iP0;
in uvec4 iP1;
in uvec4 iP2;
in uvec4 iP3;
in uvec4 iP4;
in uvec4 iP5;
uniform vec3 uPedPiv[${PIV_COUNT * 4}];
flat out vec4 vPal0;
flat out vec4 vPal1;
flat out vec4 vPal2;
${PED_JOINT_GLSL}
mat3 palR;
vec3 palT;
// x' = palR * (r * (x - pv) + pv) + palT
void palJoint(mat3 r, vec3 pv) {
  mat3 q = palR * r;
  palT += palR * pv - q * pv;
  palR = q;
}
void main() {
  int b = int(position.x);
  pedW = vec3(P_w, P_c, P_b);
  // pelvis rotation (yaw, list), whole-body pitch about the hips and the root offsets (figure units)
  vec3 hc = vec3(0.0, pedPiv(${PIV.HIP}).y, 0.0);
  palR = ${J.pelvis};
  palT = hc - palR * hc + vec3(P_rootX, P_rootY, P_rootZ);
  if (b >= ${B.THIGH_L} && b <= ${B.FOOT_R}) {
    bool left = b <= ${B.FOOT_L};
    palJoint(pedHipR(left), pedPivS(${PIV.HIP}, left));
    if (b != ${B.THIGH_L} && b != ${B.THIGH_R}) {
      palJoint(${J.knee}, pedPivS(${PIV.KNEE}, left));
      if (b == ${B.FOOT_L} || b == ${B.FOOT_R}) {
${GLSL_FOOT_R}
        palJoint(rf, pedPivS(${PIV.ANKLE}, left));
      }
    }
  } else if (b != ${B.PELVIS}) {
    palJoint(${J.waist}, pedPiv(${PIV.WAIST}));
    if (b != ${B.SPINE}) {
      palJoint(${J.chest}, pedPiv(${PIV.CHEST}));
      if (b == ${B.HEAD}) palJoint(${J.head}, pedPiv(${PIV.HEAD}));
      else if (b >= ${B.UPPER_L}) {
        bool left = b <= ${B.HAND_L};
        palJoint(pedShoulderR(left), pedPivS(${PIV.SHOULDER}, left));
        if (b != ${B.UPPER_L} && b != ${B.UPPER_R}) {
          palJoint(${J.elbow}, pedPivS(${PIV.ELBOW}, left));
          if (b == ${B.HAND_L} || b == ${B.HAND_R}) palJoint(${J.wrist}, pedPivS(${PIV.WRIST}, left));
        }
      }
    }
  }
  vPal0 = vec4(palR[0][0], palR[1][0], palR[2][0], palT.x);
  vPal1 = vec4(palR[0][1], palR[1][1], palR[2][1], palT.y);
  vPal2 = vec4(palR[0][2], palR[1][2], palR[2][2], palT.z);
  gl_Position = vec4((float(b) + 0.5) * ${(2 / PAL_BONES).toFixed(6)} - 1.0, (float(gl_InstanceID) + 0.5) * ${(2 / rows).toFixed(9)} - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0; // (ANGLE draws no points without it)
}`;
}

const FRAGMENT = /* glsl */ `precision highp float;
flat in vec4 vPal0;
flat in vec4 vPal1;
flat in vec4 vPal2;
layout(location = 0) out vec4 oPal0;
layout(location = 1) out vec4 oPal1;
layout(location = 2) out vec4 oPal2;
void main() {
  oPal0 = vPal0;
  oPal1 = vPal1;
  oPal2 = vPal2;
}`;

export class PedPalette {
  /** uPedPal0..2 of the figure programs */
  readonly uniforms: Record<string, THREE.IUniform>;
  private renderer: THREE.WebGLRenderer;
  private rt: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera();
  private geo = new THREE.InstancedBufferGeometry();
  private material: THREE.RawShaderMaterial;
  private pose: Uint32Array;
  private poseBuf: THREE.InstancedInterleavedBuffer;
  private range = { start: 0, count: 0 };
  /** figures (rows) this frame */
  n = 0;

  constructor(renderer: THREE.WebGLRenderer, rows: number) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(PAL_BONES, rows, {
      count: 3,
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.uniforms = { uPedPal0: { value: this.rt.textures[0] }, uPedPal1: { value: this.rt.textures[1] }, uPedPal2: { value: this.rt.textures[2] } };
    const bones = new Float32Array(PAL_BONES * 3);
    for (let i = 0; i < PAL_BONES; i++) bones[i * 3] = i;
    this.geo.setAttribute('position', new THREE.BufferAttribute(bones, 3));
    this.pose = new Uint32Array(rows * POSE_UINTS);
    this.poseBuf = new THREE.InstancedInterleavedBuffer(this.pose, POSE_UINTS);
    this.poseBuf.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < POSE_UINTS / 4; i++) this.geo.setAttribute(`iP${i}`, new THREE.InterleavedBufferAttribute(this.poseBuf, 4, i * 4));
    this.geo.instanceCount = 0;
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vertexSource(rows),
      fragmentShader: FRAGMENT,
      uniforms: { uPedPiv: pedPivUniform() },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
    const points = new THREE.Points(this.geo, this.material);
    points.frustumCulled = false;
    points.matrixAutoUpdate = false;
    this.scene.add(points);
    this.scene.matrixWorldAutoUpdate = false;
    this.scene.updateMatrixWorld();
  }

  /** the render target can be drawn to; compiles the pass (an empty draw) with the rest of the boot */
  init(): boolean {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    const gl = r.getContext();
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (ok) this.draw();
    r.setRenderTarget(prev);
    return ok;
  }

  begin(): void {
    this.n = 0;
  }

  /** a posed figure (its packed pose words); returns its row */
  add(pose: Uint32Array): number {
    this.pose.set(pose, this.n * POSE_UINTS);
    return this.n++;
  }

  /** per frame, after the figures are written and before the scene pass (the shadow pass runs inside it) */
  render(): void {
    const n = this.n;
    if (n === 0) return;
    this.geo.instanceCount = n;
    const buf = this.poseBuf;
    buf.updateRanges.length = 0;
    this.range.count = n * POSE_UINTS;
    buf.updateRanges.push(this.range);
    buf.needsUpdate = true;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    this.draw();
    r.setRenderTarget(prev);
  }

  private draw(): void {
    const r = this.renderer;
    const ac = r.autoClear;
    r.autoClear = false;
    r.render(this.scene, this.camera);
    r.autoClear = ac;
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
    this.rt.dispose();
  }
}

/** null when off (?nopedpalette) or impossible here: the figures fall back to the per-vertex chain */
export function createPalette(renderer: THREE.WebGLRenderer, rows: number): PedPalette | null {
  if (!perfOn('pedpalette')) return null;
  try {
    if (!renderer.extensions.has('EXT_color_buffer_float') || renderer.capabilities.maxVertexTextures < 3) return null;
    const pal = new PedPalette(renderer, rows);
    if (pal.init()) return pal;
    pal.dispose();
  } catch {
    /* the old path */
  }
  return null;
}

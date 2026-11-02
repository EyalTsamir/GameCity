// No thing made by hand has a perfectly sharp edge: a corner is a small round that catches the light and the first place to lose its
// paint, a seam is where the dirt sits. Nearly every box in the city is merged into static meshes, far too many to bevel, so this is
// done where they all meet: one step of the merged final shader that finds creases in the depth buffer, near the camera only.
//
// Raw depth is linear across the screen on any flat surface, so its second difference over a few pixels is zero on a face and not on a
// crease. A pixel at distance t from a crease sees it in only one of its samples, which gives a soft profile with no extra work. The
// radius is a fixed size in metres (a pixel count that follows the distance), and past the distance where that is about a pixel,
// nothing is fetched at all: from the air this costs one compare per pixel. Silhouettes drop out by slope, so a roof against the sky
// doesn't get a false edge, and shallow creases (the facets of something round) drop out by angle.

import * as THREE from 'three';
import { Effect, EffectAttribute } from 'postprocessing';

const FRAG = /* glsl */ `
uniform mat4 uEdgeProjInv;
uniform mat4 uEdgeWorld;
/** x raw depth past which nothing happens, y radius (m), z pixels per metre at 1 m, w depth to metres scale */
uniform vec4 uEdgeA;
/** x how much the round catches, y how much a seam darkens, z what bare material adds, w max radius (px) */
uniform vec4 uEdgeB;
uniform vec2 uEdgeRes;

float edgeHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float edgeNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(edgeHash(i), edgeHash(i + vec3(1, 0, 0)), f.x), mix(edgeHash(i + vec3(0, 1, 0)), edgeHash(i + vec3(1, 1, 0)), f.x), f.y);
  float b = mix(mix(edgeHash(i + vec3(0, 0, 1)), edgeHash(i + vec3(1, 0, 1)), f.x), mix(edgeHash(i + vec3(0, 1, 1)), edgeHash(i + vec3(1, 1, 1)), f.x), f.y);
  return mix(a, b, f.z);
}
// the angle (radians) a surface turns through at this pixel along one screen axis: > 0 a corner standing out, < 0 a seam, 0 when one
// side is a silhouette rather than a surface
float edgeTurn(float dm, float d0, float dp, float scale) {
  float a = (d0 - dm) * scale;
  float b = (dp - d0) * scale;
  if (abs(a) > 5.0 || abs(b) > 5.0) return 0.0;
  return atan(b - a, 1.0 + a * b);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  outputColor = inputColor;
  if (depth >= uEdgeA.x) return;
  float ndcZ = depth * 2.0 - 1.0;
  float z = uEdgeProjInv[3][2] / (uEdgeProjInv[2][3] * ndcZ + uEdgeProjInv[3][3]);
  z = abs(z);
  float rpx = uEdgeA.y * uEdgeA.z / z;
  if (rpx < 0.75) return;
  float fade = smoothstep(0.75, 1.5, rpx);
  // whole pixels only, so the round's width would step along an edge going away: a fixed pattern hides the steps
  vec2 fc = uv * uEdgeRes;
  float ign = fract(52.9829189 * fract(dot(floor(fc), vec2(0.06711056, 0.00583715))));
  int r = int(clamp(floor(rpx + ign), 1.0, uEdgeB.w));
  ivec2 p = ivec2(fc);
  ivec2 mx = ivec2(uEdgeRes) - 1;
  float dl = texelFetch(depthBuffer, clamp(p - ivec2(r, 0), ivec2(0), mx), 0).x;
  float dr = texelFetch(depthBuffer, clamp(p + ivec2(r, 0), ivec2(0), mx), 0).x;
  float db = texelFetch(depthBuffer, clamp(p - ivec2(0, r), ivec2(0), mx), 0).x;
  float dt = texelFetch(depthBuffer, clamp(p + ivec2(0, r), ivec2(0), mx), 0).x;
  // depth to metres at this distance, per metre of screen distance the samples span: a slope
  float scale = uEdgeA.w * z * z * uEdgeA.z / (z * float(r));
  float tx = edgeTurn(dl, depth, dr, scale);
  float ty = edgeTurn(db, depth, dt, scale);
  float t = abs(tx) > abs(ty) ? tx : ty;
  // about 40 degrees and up: a 12-sided pole stays smooth, a box corner is all there
  float k = smoothstep(0.7, 1.25, abs(t)) * fade;
  if (k < 0.004) return;
  // where it wears: patches along the edge, in the world, so they stay put as you walk
  vec2 ndc = uv * 2.0 - 1.0;
  vec3 view = vec3(uEdgeProjInv[0][0] * ndc.x + uEdgeProjInv[3][0], uEdgeProjInv[1][1] * ndc.y + uEdgeProjInv[3][1], -1.0) * z;
  vec3 w = (uEdgeWorld * vec4(view, 1.0)).xyz;
  float n1 = edgeNoise(w * 11.0);
  float n2 = edgeNoise(w * 63.0);
  if (t > 0.0) {
    float wear = smoothstep(0.42, 0.72, n1 * 0.62 + n2 * 0.38);
    float m = 1.0 + k * uEdgeB.x * (0.45 + 0.55 * n2 + 0.9 * wear);
    outputColor.rgb = inputColor.rgb * m + vec3(1.0, 0.97, 0.92) * k * wear * uEdgeB.z;
  } else {
    outputColor.rgb = inputColor.rgb * (1.0 - k * uEdgeB.y * (0.55 + 0.45 * n1));
  }
}
`;

export class EdgeWearEffect extends Effect {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly dayOf: () => number;
  /** off with no recompile: nothing passes the first compare (same-page A/B) */
  live = true;

  /** @param dayOf 0 at night to 1 by day: bare material only shows what light there is */
  constructor(camera: THREE.PerspectiveCamera, dayOf: () => number) {
    super('EdgeWearEffect', FRAG, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ['uEdgeProjInv', new THREE.Uniform(new THREE.Matrix4())],
        ['uEdgeWorld', new THREE.Uniform(new THREE.Matrix4())],
        ['uEdgeA', new THREE.Uniform(new THREE.Vector4(0, 0.009, 1, 1))],
        ['uEdgeB', new THREE.Uniform(new THREE.Vector4(0.36, 0.3, 0.035, 14))],
        ['uEdgeRes', new THREE.Uniform(new THREE.Vector2(1, 1))],
      ]),
    });
    this.camera = camera;
    this.dayOf = dayOf;
  }

  override update(_renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget): void {
    const c = this.camera;
    const u = this.uniforms;
    const P = c.projectionMatrix.elements;
    const h = inputBuffer.height;
    (u.get('uEdgeProjInv')!.value as THREE.Matrix4).copy(c.projectionMatrixInverse);
    (u.get('uEdgeWorld')!.value as THREE.Matrix4).copy(c.matrixWorld);
    (u.get('uEdgeRes')!.value as THREE.Vector2).set(inputBuffer.width, h);
    const A = u.get('uEdgeA')!.value as THREE.Vector4;
    const pxm = P[5] * h * 0.5;
    A.z = pxm;
    // past this distance the radius is under the 0.75 px where it starts
    const zFar = (A.y * pxm) / 0.75;
    A.x = this.live ? 0.5 * ((P[10] * -zFar + P[14]) / zFar) + 0.5 : 0;
    // d(z)/d(raw depth) = z * z * w: from z = q32 / (q23 * (2 d - 1) + q33)
    const Q = c.projectionMatrixInverse.elements;
    A.w = Math.abs((2 * Q[11]) / Q[14]);
    (u.get('uEdgeB')!.value as THREE.Vector4).z = 0.035 * this.dayOf();
  }
}

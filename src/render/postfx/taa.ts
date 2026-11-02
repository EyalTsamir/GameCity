// Temporal anti-aliasing at the very end of the chain: what makes the city stop trembling (docs/progress/sweep-flicker.md).
//
// Without it every pixel takes one sample, so an edge, a window bar, a leaf or a far fence that moves by a tenth of a pixel
// makes whole pixels jump. Here the camera is offset by a different fraction of a pixel each frame and each pixel keeps a
// running mean of what it saw, carried across camera moves with the depth buffer:
//
//   final effect pass ──▶ tInput (gamma, 10 bit) ──▶ resolve (+ previous history) ──▶ history ──▶ present ──▶ canvas
//
// It replaces SMAA, whose edge and weight passes cost about the same, and at rest it resolves more than SMAA could: a detail
// finer than a pixel is averaged in instead of hit or missed. Runs after grading because the running mean belongs in display
// values, and so AO, contact shadows, bloom and shafts are steadied with everything else.
//
// There are no motion vectors. Anything that moves must never keep history from where it was: people, vehicles, trains and boats are masked
// (postfx/taaMovers.ts) and take none, and a pixel takes none the frame after one has left it. The rest of what moves is found by depth:
// a point that is not where last frame's depth says it should be (compared with a small neighbourhood, so an edge isn't caught) takes no
// history either. What is left is held in by clipping history to the spread of this frame's 3×3 neighbourhood. A camera travelling fast
// near the ground takes no history and no jitter at all: there aliasing can't be seen and resampling only softens.
//
// A jitter that never stops makes a still picture shimmer by a little, everywhere, and a still camera used to give a perfectly
// still picture. So once the camera stops the mean settles (about a second, each frame counting less), then the jitter stops:
//   settling  the mean of many offsets, weights falling as 1/n
//   frozen    nothing can linger on a surface that stays. The settled picture and the sample and depth under it are kept, and each frame
//             is this frame's sample plus what settling added to that pixel, as long as the same surface is there: same depth, about the
//             same value. A running mean over a city in motion left buses with two fronts and people torn apart, and the ghosts of those
//             who had left, so a mover is simply this frame's sample. What else changes (a leaf, a shadow) is calmed by a running mean of
//             its own, clipped to this frame's neighbourhood, and leaves no trace once the pixel is back on its surface.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import { FS_VERT, FullscreenPass } from './fullscreen';
import { MoverMask } from './taaMovers';

const RESOLVE_FRAG = /* glsl */ `
uniform sampler2D tInput;
uniform sampler2D tHistory;
uniform sampler2D tPrev;
uniform highp sampler2D tDepth;
uniform highp sampler2D tPrevZ;
uniform sampler2D tMovers;
/** frozen: the last picture shown; how much of this frame counts where something changes */
uniform sampler2D tLast;
uniform float uCalm;
/** projection's [10], [14]: raw depth to distance */
uniform vec2 uP;
/** how much of this frame counts whatever else is true: the camera's own travel */
uniform float uFloor;
uniform mat4 uReproject;
uniform vec2 uRes;
uniform float uAlpha;
uniform float uReset;
/** 0 moving, 1 settling, 2 the first frame without jitter, 3 frozen (then tHistory is the settled picture, tPrev the sample under it, tPrevZ its depth) */
uniform float uMode;
varying vec2 vUv;

vec3 toY(vec3 c) { return vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0.0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25))); }
vec3 fromY(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }

// Catmull-Rom in five bilinear taps (the corners barely count): history moved by a fraction of a pixel stays sharp
vec3 historyCR(vec2 uv) {
  vec2 p = uv * uRes - 0.5;
  vec2 f = fract(p);
  vec2 c0 = (floor(p) + 0.5) / uRes;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 o12 = w2 / w12;
  vec2 t0 = c0 - 1.0 / uRes;
  vec2 t3 = c0 + 2.0 / uRes;
  vec2 t12 = c0 + o12 / uRes;
  vec3 s = texture2D(tHistory, vec2(t12.x, t0.y)).rgb * (w12.x * w0.y);
  s += texture2D(tHistory, vec2(t0.x, t12.y)).rgb * (w0.x * w12.y);
  s += texture2D(tHistory, t12).rgb * (w12.x * w12.y);
  s += texture2D(tHistory, vec2(t3.x, t12.y)).rgb * (w3.x * w12.y);
  s += texture2D(tHistory, vec2(t12.x, t3.y)).rgb * (w12.x * w3.y);
  float w = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return s / w;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 cur = texelFetch(tInput, p, 0).rgb;
  if (uReset > 0.5) {
    gl_FragColor = vec4(cur, 1.0);
    return;
  }
  // (alpha in history: 0 this frame's sample alone, counting up to 1 over three frames; only a pixel at 1 goes into the settled picture)
  if (texelFetch(tMovers, p, 0).r > 0.5) {
    gl_FragColor = vec4(cur, 0.0);
    return;
  }
  vec2 huv = vUv;
  float speed = 0.0;
  float a = uAlpha;
  float hA = 1.0;
  vec3 aim = cur;
  vec3 last = vec3(0.0);
  float dm = 0.0;
  float d = texelFetch(tDepth, p, 0).x;
  if (uMode > 2.5) {
    vec4 settled4 = texelFetch(tHistory, p, 0);
    vec3 settled = settled4.rgb;
    vec3 under = texelFetch(tPrev, p, 0).rgb;
    vec3 change = cur - under;
    float m = max(abs(change.r), max(abs(change.g), abs(change.b)));
    float z = uP.y / (d * 2.0 - 1.0 + uP.x), z0 = texelFetch(tPrevZ, p, 0).r;
    // (the same surface, light allowed to move a little: the sun, a cloud's shadow. Alpha: how much of this is the settled picture, for the sharpening)
    float w = settled4.a > 0.9 && abs(z - z0) < z0 * 0.01 ? 1.0 - smoothstep(0.03, 0.1, m) : 0.0;
    aim = clamp(cur + w * (settled - under), 0.0, 1.0);
    vec4 l = texelFetch(tLast, p, 0);
    if (uCalm > 0.99 || l.a < 0.1) {
      gl_FragColor = vec4(aim, l.a < 0.1 ? 0.34 : 1.0);
      return;
    }
    vec3 dl = abs(aim - l.rgb);
    dm = max(dl.r, max(dl.g, dl.b));
    // (less than the screen can show, half-resolution AO re-rolling on a leaf: nothing happened. Exactly the same picture)
    if (dm < 0.003) {
      gl_FragColor = vec4(l.rgb, 1.0);
      return;
    }
    last = l.rgb;
    a = uCalm;
  } else {
    vec4 clip = uReproject * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    huv = clip.xy / clip.w * 0.5 + 0.5;
    if (huv.x < 0.0 || huv.x > 1.0 || huv.y < 0.0 || huv.y > 1.0) {
      gl_FragColor = vec4(cur, 0.0);
      return;
    }
    // moved by itself, or uncovered: last frame's depth around where this point was doesn't hold it
    float was = uP.y / (clip.z / clip.w + uP.x);
    float z0 = textureLod(tPrevZ, huv, 0.0).r;
    float z1 = textureLodOffset(tPrevZ, huv, 0.0, ivec2(-1, 0)).r;
    float z2 = textureLodOffset(tPrevZ, huv, 0.0, ivec2(1, 0)).r;
    float z3 = textureLodOffset(tPrevZ, huv, 0.0, ivec2(0, -1)).r;
    float z4 = textureLodOffset(tPrevZ, huv, 0.0, ivec2(0, 1)).r;
    if (was < min(z0, min(z1, min(z2, min(z3, z4)))) * 0.985 || was > max(z0, max(z1, max(z2, max(z3, z4)))) * 1.015) {
      gl_FragColor = vec4(cur, 0.0);
      return;
    }
    // something that moves left this pixel just now: what it kept is that thing
    hA = texelFetch(tHistory, ivec2(huv * uRes), 0).a;
    if (hA < 0.1) {
      gl_FragColor = vec4(cur, 0.34);
      return;
    }
    speed = length((huv - vUv) * uRes);
    // history is for what moves by less than a few pixels a frame. Faster than that aliasing can't be seen and every resampling
    // softens: lettering on a sign passing the walker doubled and blurred, people smeared under a quick look round. So it fades out.
    a = max(uFloor, mix(uAlpha, 1.0, smoothstep(1.0, 5.0, speed)));
  }
  // the spread of this frame around the pixel, in luma + chroma
  vec3 cy = toY(cur);
  vec3 m1 = cy, m2 = cy * cy, s;
  s = toY(textureLodOffset(tInput, vUv, 0.0, ivec2(-1, 0)).rgb); m1 += s; m2 += s * s;
  s = toY(textureLodOffset(tInput, vUv, 0.0, ivec2(1, 0)).rgb); m1 += s; m2 += s * s;
  s = toY(textureLodOffset(tInput, vUv, 0.0, ivec2(0, -1)).rgb); m1 += s; m2 += s * s;
  s = toY(textureLodOffset(tInput, vUv, 0.0, ivec2(0, 1)).rgb); m1 += s; m2 += s * s;
  s = toY(textureLodOffset(tInput, vUv, 0.0, ivec2(-1, -1)).rgb); m1 += s; m2 += s * s;
  s = toY(textureLodOffset(tInput, vUv, 0.0, ivec2(1, -1)).rgb); m1 += s; m2 += s * s;
  s = toY(textureLodOffset(tInput, vUv, 0.0, ivec2(-1, 1)).rgb); m1 += s; m2 += s * s;
  s = toY(textureLodOffset(tInput, vUv, 0.0, ivec2(1, 1)).rgb); m1 += s; m2 += s * s;
  vec3 mean = m1 / 9.0;
  vec3 sigma = sqrt(max(m2 / 9.0 - mean * mean, vec3(0.0)));
  // while the camera rests a wider window: a detail finer than a pixel is in some frames' neighbourhood only
  float gamma = uMode > 2.5 ? mix(2.5, 1.25, smoothstep(0.02, 0.1, dm)) : uMode > 0.5 ? 2.5 : mix(1.5, 0.8, smoothstep(0.0, 2.0, speed));
  vec3 lo = mean - gamma * sigma - 0.002;
  vec3 hi = mean + gamma * sigma + 0.002;
  vec3 h = toY(uMode > 2.5 ? last : speed < 0.01 ? texelFetch(tHistory, p, 0).rgb : historyCR(huv));
  // clip towards the mean: keeps the hue, unlike a box clamp per channel
  vec3 cen = 0.5 * (hi + lo), ext = max(0.5 * (hi - lo), vec3(1e-4));
  vec3 off = h - cen;
  vec3 un = abs(off / ext);
  float k = max(un.x, max(un.y, un.z));
  if (k > 1.0) h = cen + off / k;
  gl_FragColor = vec4(clamp(fromY(mix(h, toY(aim), a)), 0.0, 1.0), min(1.0, hA + 0.34));
}
`;

/** this frame's distance per pixel, for the next frame's check */
const ZCOPY_FRAG = /* glsl */ `
uniform highp sampler2D tDepth;
uniform vec2 uP;
void main() {
  gl_FragColor = vec4(uP.y / (texelFetch(tDepth, ivec2(gl_FragCoord.xy), 0).x * 2.0 - 1.0 + uP.x), 0.0, 0.0, 1.0);
}
`;

const PRESENT_FRAG = /* glsl */ `
#include <common>
#include <dithering_pars_fragment>
uniform sampler2D tHistory;
uniform float uSharp;
varying vec2 vUv;
void main() {
  vec4 c4 = texelFetch(tHistory, ivec2(gl_FragCoord.xy), 0);
  vec3 c = c4.rgb;
  // the running mean is a box over the pixel: a touch of contrast back, only for the screen (never fed back into history).
  // Alpha 0 = this frame's sample alone, a bus or a walker: nothing to make up for
  float sharp = uSharp * c4.a;
  if (sharp > 0.0) {
    vec3 a = textureLodOffset(tHistory, vUv, 0.0, ivec2(-1, 0)).rgb;
    vec3 b = textureLodOffset(tHistory, vUv, 0.0, ivec2(1, 0)).rgb;
    vec3 u = textureLodOffset(tHistory, vUv, 0.0, ivec2(0, -1)).rgb;
    vec3 v = textureLodOffset(tHistory, vUv, 0.0, ivec2(0, 1)).rgb;
    vec3 lo = min(c, min(a, min(b, min(u, v))));
    vec3 hi = max(c, max(a, max(b, max(u, v))));
    c = clamp(c + sharp * (c - 0.25 * (a + b + u + v)), lo, hi);
  }
  gl_FragColor = vec4(pow(max(c, vec3(0.0)), vec3(2.2)), 1.0);
  #include <colorspace_fragment>
  #include <dithering_fragment>
}
`;

/** 10 bit in display values: 8 would stop the mean short of its target and put the sky's bands back */
function target(w: number, h: number, name: string): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
  const t = rt.texture;
  t.name = name;
  t.internalFormat = 'RGB10_A2';
  // (three hands a string type to GL as it is: its fallback for packed formats)
  t.type = 'UNSIGNED_INT_2_10_10_10_REV' as unknown as THREE.TextureDataType;
  return rt;
}

/** frames from the camera stopping to the jitter stopping */
const SETTLE = 24;
/** Halton (2, 3), centred: fractions of a pixel, each frame another (long enough for a whole settling) */
const JITTER: [number, number][] = [];
{
  const halton = (i: number, b: number) => {
    let f = 1,
      r = 0;
    for (let k = i; k > 0; k = Math.floor(k / b)) {
      f /= b;
      r += f * (k % b);
    }
    return r;
  };
  for (let i = 1; i <= 32; i++) JITTER.push([halton(i, 2) - 0.5, halton(i, 3) - 0.5]);
}

const _pos = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _vp = new THREE.Matrix4();
const _vpInv = new THREE.Matrix4();

export class TemporalAA {
  /** the final effect pass draws into this */
  input: THREE.WebGLRenderTarget;
  private inputPrev: THREE.WebGLRenderTarget;
  private prevZ: THREE.WebGLRenderTarget;
  private zcopy: FullscreenPass;
  private lastPos = new THREE.Vector3();
  private lastFwd = new THREE.Vector3(0, 0, -1);
  private sharp: number;
  /** pixels a frame the picture turns by */
  private turnPx = 0;
  /** pixels a frame a point 4 m off moves through the camera's travel (further off for a camera high up) */
  private nearPx = 0;
  private hist: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private resolve: FullscreenPass;
  private present: FullscreenPass;
  private prevVP = new THREE.Matrix4();
  private frame = 0;
  private fresh = true;
  private pe8 = 0;
  private pe9 = 0;
  private lastView = new THREE.Matrix4();
  private lastP5 = 0;
  /** frames the camera has not moved */
  private rest = 0;
  private jittered = false;
  /** the last frame shown is in `last`, and hist[0] and inputPrev hold the settled picture and the sample under it */
  private frozen = false;
  private last: THREE.WebGLRenderTarget;
  private movers: MoverMask;
  private alpha: number;
  private neverRest: boolean;

  constructor(
    private camera: THREE.PerspectiveCamera,
    ctx: CityContext,
    opts: { alpha: number; sharp: number; jitter: number; calm: number; neverRest?: boolean },
  ) {
    this.movers = new MoverMask(ctx);
    this.input = target(4, 4, 'TAA.Input');
    this.inputPrev = target(4, 4, 'TAA.InputPrev');
    this.prevZ = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RedFormat, type: THREE.FloatType });
    this.prevZ.texture.name = 'TAA.PrevZ';
    this.zcopy = new FullscreenPass(new THREE.ShaderMaterial({ name: 'TAAZ', uniforms: { tDepth: { value: null }, uP: { value: new THREE.Vector2() } }, vertexShader: FS_VERT, fragmentShader: ZCOPY_FRAG, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false }));
    this.alpha = opts.alpha;
    this.sharp = opts.sharp;
    // (?taamove, for measuring: the moving path's cost with a still camera)
    this.neverRest = !!opts.neverRest;
    this.hist = [target(4, 4, 'TAA.HistoryA'), target(4, 4, 'TAA.HistoryB')];
    this.last = target(4, 4, 'TAA.Last');
    this.jitterK = opts.jitter;
    this.resolve = new FullscreenPass(
      new THREE.ShaderMaterial({
        name: 'TAAResolve',
        uniforms: {
          tInput: { value: this.input.texture },
          tHistory: { value: null },
          tPrev: { value: null },
          tPrevZ: { value: this.prevZ.texture },
          tMovers: { value: this.movers.target.texture },
          tLast: { value: null },
          uCalm: { value: opts.calm },
          uP: { value: new THREE.Vector2() },
          uFloor: { value: 0 },
          uMode: { value: 0 },
          tDepth: { value: null },
          uReproject: { value: new THREE.Matrix4() },
          uRes: { value: new THREE.Vector2(4, 4) },
          uAlpha: { value: opts.alpha },
          uReset: { value: 1 },
        },
        vertexShader: FS_VERT,
        fragmentShader: RESOLVE_FRAG,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        toneMapped: false,
      }),
    );
    this.present = new FullscreenPass(
      new THREE.ShaderMaterial({
        name: 'TAAPresent',
        uniforms: { tHistory: { value: null }, uSharp: { value: opts.sharp } },
        vertexShader: FS_VERT,
        fragmentShader: PRESENT_FRAG,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        toneMapped: false,
        dithering: true,
      }),
    );
  }
  private jitterK: number;

  setSize(w: number, h: number): void {
    if (this.input.width === w && this.input.height === h) return;
    this.input.setSize(w, h);
    this.inputPrev.setSize(w, h);
    this.prevZ.setSize(w, h);
    this.movers.setSize(w, h);
    this.hist[0].setSize(w, h);
    this.hist[1].setSize(w, h);
    this.last.setSize(w, h);
    this.fresh = true;
  }

  /** the next frame takes no history (a cut, a resize, the first frame after the chain was off) */
  reset(): void {
    this.fresh = true;
  }

  /** offset the projection for this frame's scene and post passes; call `unjitter` right after them */
  jitter(): void {
    const c = this.camera;
    const e = c.projectionMatrix.elements;
    // (against where it stopped, with a tolerance far below a pixel: some views' camera eases towards its place for ever)
    const v = c.matrixWorldInverse.elements,
      l = this.lastView.elements;
    let moved = this.fresh || this.neverRest || this.lastP5 !== e[5];
    for (let i = 0; i < 12 && !moved; i++) moved = Math.abs(v[i] - l[i]) > 2e-5;
    for (let i = 12; i < 15 && !moved; i++) moved = Math.abs(v[i] - l[i]) > 5e-5;
    if (moved) {
      this.rest = 0;
      this.lastView.copy(c.matrixWorldInverse);
      this.lastP5 = e[5];
    } else this.rest++;
    _pos.setFromMatrixPosition(c.matrixWorld);
    this.nearPx = ((_pos.distanceTo(this.lastPos) / Math.max(4, _pos.y * 0.7)) * this.input.height * 0.5 * e[5]);
    this.lastPos.copy(_pos);
    _fwd.set(-v[2], -v[6], -v[10]);
    this.turnPx = Math.acos(Math.min(1, _fwd.dot(this.lastFwd))) * this.input.height * 0.5 * e[5];
    this.lastFwd.copy(_fwd);
    this.jittered = this.rest < SETTLE && this.nearPx < 8;
    if (!this.jittered) return;
    const j = JITTER[this.frame++ % JITTER.length];
    this.pe8 = e[8];
    this.pe9 = e[9];
    // (the jitter-free matrix is the one reprojection uses)
    e[8] += (2 * j[0] * this.jitterK) / this.input.width;
    e[9] += (2 * j[1] * this.jitterK) / this.input.height;
    c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
  }

  unjitter(): void {
    if (!this.jittered) return;
    const c = this.camera;
    const e = c.projectionMatrix.elements;
    e[8] = this.pe8;
    e[9] = this.pe9;
    c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
  }

  /** after the final effect pass (projection already restored): fold the frame into history and show it */
  draw(renderer: THREE.WebGLRenderer, depth: THREE.Texture | null): void {
    const c = this.camera;
    const u = this.resolve.material.uniforms;
    _vp.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
    _vpInv.copy(_vp).invert();
    (u.uReproject.value as THREE.Matrix4).multiplyMatrices(this.prevVP, _vpInv);
    this.prevVP.copy(_vp);
    u.tDepth.value = depth;
    u.tHistory.value = this.hist[0].texture;
    u.tInput.value = this.input.texture;
    u.tPrev.value = this.inputPrev.texture;
    const r = this.rest;
    if (depth) this.movers.draw(renderer, c, depth, _pos);
    // the camera moves again after a rest: on from the last picture shown
    if (this.frozen && r <= SETTLE) {
      const t = this.hist[0];
      this.hist[0] = this.last;
      this.last = t;
      u.tHistory.value = this.hist[0].texture;
      this.frozen = false;
    }
    // (the first frozen frame goes on from the settled picture)
    u.tLast.value = this.frozen ? this.last.texture : this.hist[0].texture;
    u.uMode.value = r === 0 ? 0 : r < SETTLE ? 1 : r === SETTLE ? 2 : 3;
    const n = THREE.MathUtils.smoothstep(this.nearPx, 2, 8);
    u.uFloor.value = n;
    const e = c.projectionMatrix.elements;
    (u.uP.value as THREE.Vector2).set(e[10], e[14]);
    u.uAlpha.value = r === 0 ? this.alpha : Math.min(this.alpha, 1 / (r + 1 / this.alpha));
    u.uReset.value = this.fresh || !depth ? 1 : 0;
    (u.uRes.value as THREE.Vector2).set(this.input.width, this.input.height);
    this.resolve.render(renderer, this.hist[1]);
    // (frozen: the depth of the settled picture stays. The first frame after one has a stale one, so what moved meanwhile takes no history)
    if (depth && r <= SETTLE) {
      const z = this.zcopy.material.uniforms;
      z.tDepth.value = depth;
      (z.uP.value as THREE.Vector2).set(e[10], e[14]);
      this.zcopy.render(renderer, this.prevZ);
    }
    this.fresh = false;
    this.present.material.uniforms.tHistory.value = this.hist[1].texture;
    // (the sharpening makes up for the running mean: without history, in fast motion, it would only sharpen the aliasing)
    this.present.material.uniforms.uSharp.value = this.sharp * (1 - THREE.MathUtils.smoothstep(Math.max(this.nearPx, this.turnPx), 1, 5));
    this.present.render(renderer, null);
    if (r > SETTLE) {
      const t = this.hist[1];
      this.hist[1] = this.last;
      this.last = t;
      this.frozen = true;
      return;
    }
    const t = this.hist[0];
    this.hist[0] = this.hist[1];
    this.hist[1] = t;
    const i = this.input;
    this.input = this.inputPrev;
    this.inputPrev = i;
  }

  dispose(): void {
    this.input.dispose();
    this.inputPrev.dispose();
    this.prevZ.dispose();
    this.movers.dispose();
    this.zcopy.dispose();
    this.hist[0].dispose();
    this.hist[1].dispose();
    this.last.dispose();
    this.resolve.dispose();
    this.present.dispose();
  }
}

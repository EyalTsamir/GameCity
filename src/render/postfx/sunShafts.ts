// Sun shafts (world mode): crepuscular rays when a low sun is in or near the frame — light streaming
// between trees, roofs and towers at golden hour (GPU Gems 3 ch. 13, radial blur of an occlusion mask).
//
//   mask  (quarter res): sky pixels near the sun (depth = far), their brightness above a threshold,
//                        weighted by a falloff around the sun's screen position;
//   blur  (quarter res): 28 samples marching toward the sun, decaying, start jittered per pixel;
//   apply (merged pass): added to the image (before bloom, so the brightest rays glow a little).
//
// Skipped entirely (no passes) unless the sun is low, above the horizon, on or near the screen and the
// sky is not overcast — that is most frames. Cost when active ≈ 0.1–0.2 ms on an integrated GPU.

import * as THREE from 'three';
import { Effect } from 'postprocessing';
import { FS_VERT, FullscreenPass } from './fullscreen';

const MASK_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform highp sampler2D tDepth;
uniform vec2 uSun;     // sun position in uv
uniform float uAspect;
uniform float uThresh;
varying vec2 vUv;
void main() {
  float d = texture2D(tDepth, vUv).r;
  vec3 c = texture2D(tColor, vUv).rgb;
  float sky = step(0.99999, d);
  vec2 dv = (vUv - uSun) * vec2(uAspect, 1.0);
  float fall = exp(-dot(dv, dv) * 9.0);
  float l = max(max(c.r, c.g), c.b);
  vec3 m = c * (max(l - uThresh, 0.0) / max(l, 1e-4));
  gl_FragColor = vec4(min(m, vec3(8.0)) * sky * fall, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tMask;
uniform vec2 uSun;
uniform float uDensity;
uniform float uDecay;
varying vec2 vUv;
void main() {
  vec2 delta = (vUv - uSun) * (uDensity / 28.0);
  // interleaved gradient noise: hides the sample banding of so few steps
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec2 uv = vUv - delta * j;
  vec3 acc = vec3(0.0);
  float w = 1.0;
  for (int i = 0; i < 28; i++) {
    acc += texture2D(tMask, uv).rgb * w;
    w *= uDecay;
    uv -= delta;
  }
  gl_FragColor = vec4(acc / 28.0, 1.0);
}
`;

const APPLY_FRAG = /* glsl */ `
uniform sampler2D tShafts;
uniform float uShaftI;
uniform vec3 uShaftTint;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = inputColor;
  if (uShaftI <= 0.0) return;
  outputColor.rgb += texture2D(tShafts, uv).rgb * uShaftTint * uShaftI;
}
`;

export class SunShaftsEffect extends Effect {
  /** set by the module every frame: sun position in uv (may lie off screen), strength 0..1, tint */
  readonly sunUv = new THREE.Vector2(0.5, 0.5);
  strength = 0;
  readonly tint = new THREE.Color(1, 0.8, 0.6);
  private mask: THREE.WebGLRenderTarget;
  private blurRT: THREE.WebGLRenderTarget;
  private maskPass: FullscreenPass;
  private blurPass: FullscreenPass;
  private depthTex: THREE.Texture | null = null;
  private aspect = 1;
  active = false;

  constructor() {
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter } as const;
    const mask = new THREE.WebGLRenderTarget(1, 1, opts);
    const blurRT = new THREE.WebGLRenderTarget(1, 1, opts);
    mask.texture.name = 'SunShafts.Mask';
    blurRT.texture.name = 'SunShafts.Blur';
    super('SunShaftsEffect', APPLY_FRAG, {
      uniforms: new Map<string, THREE.Uniform>([
        ['tShafts', new THREE.Uniform(blurRT.texture)],
        ['uShaftI', new THREE.Uniform(0)],
        ['uShaftTint', new THREE.Uniform(new THREE.Color(1, 0.8, 0.6))],
      ]),
    });
    this.mask = mask;
    this.blurRT = blurRT;
    this.maskPass = new FullscreenPass(
      new THREE.ShaderMaterial({
        name: 'SunShaftsMask',
        uniforms: { tColor: { value: null }, tDepth: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uThresh: { value: 0.6 } },
        vertexShader: FS_VERT,
        fragmentShader: MASK_FRAG,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        toneMapped: false,
      }),
    );
    this.blurPass = new FullscreenPass(
      new THREE.ShaderMaterial({
        name: 'SunShaftsBlur',
        uniforms: { tMask: { value: mask.texture }, uSun: { value: new THREE.Vector2() }, uDensity: { value: 0.85 }, uDecay: { value: 0.955 } },
        vertexShader: FS_VERT,
        fragmentShader: BLUR_FRAG,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        toneMapped: false,
      }),
    );
    // (no DEPTH attribute: the merged pass needs no depth for this effect; the EffectPass forwards the
    // composer's depth texture to every effect anyway, which the mask pass uses)
  }

  override setDepthTexture(depthTexture: THREE.Texture): void {
    this.depthTex = depthTexture;
  }

  override setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width / 4)),
      h = Math.max(1, Math.round(height / 4));
    this.mask.setSize(w, h);
    this.blurRT.setSize(w, h);
    this.aspect = width / Math.max(1, height);
  }

  override update(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget): void {
    const on = this.active && this.strength > 0.002 && !!this.depthTex;
    (this.uniforms.get('uShaftI') as THREE.Uniform).value = on ? this.strength : 0;
    if (!on) return;
    ((this.uniforms.get('uShaftTint') as THREE.Uniform).value as THREE.Color).copy(this.tint);
    const mu = this.maskPass.material.uniforms;
    mu.tColor.value = inputBuffer.texture;
    mu.tDepth.value = this.depthTex;
    (mu.uSun.value as THREE.Vector2).copy(this.sunUv);
    mu.uAspect.value = this.aspect;
    this.maskPass.render(renderer, this.mask);
    (this.blurPass.material.uniforms.uSun.value as THREE.Vector2).copy(this.sunUv);
    this.blurPass.render(renderer, this.blurRT);
  }

  override dispose(): void {
    super.dispose();
    this.mask.dispose();
    this.blurRT.dispose();
    this.maskPass.dispose();
    this.blurPass.dispose();
  }
}

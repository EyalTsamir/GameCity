// Depth-aware tilt-shift depth of field — the signature of the miniature look.
//
// Circle of confusion from a thin-lens style model: coc = K · (1 − F/z), with a
// perfectly sharp band around the focus distance F and K growing with zoom-out
// (strong over the whole diorama, gentle in close-ups). Blur is computed at half
// resolution with a separable scatter-as-gather filter (a sample only contributes
// if its own blur disc reaches the pixel; background samples cannot bleed over a
// sharper foreground), then composited at full resolution against the sharp image
// using the full-res CoC so in-focus edges stay crisp.

import * as THREE from 'three';
import { Effect, EffectAttribute } from 'postprocessing';
import { FS_VERT, FullscreenPass } from './fullscreen';
import { CLOUD_SHADOW_GLSL, type CloudShadowUniforms } from './cloudShadow';
import { AO_HALF_GLSL, aoUniforms, type AOUniforms } from './aoApply';

const MAX_TAPS = 8; // taps per side, 2 half-res texels apart (=> up to ~32 full-res px blur radius)
const MAX_R = MAX_TAPS * 2;

const COC_GLSL = /* glsl */ `
uniform float uFocus;
uniform float uK;
uniform float uBand;
uniform float uSkyCoc;
uniform float uNearMax;
uniform float uNear;
uniform float uFar;
float linDepth(float d) {
  return (uNear * uFar) / ((uFar - uNear) * d - uFar);
}
// signed CoC in *output* pixels (negative = near field)
float cocOf(float depth) {
  if (depth >= 0.999999) return uSkyCoc;
  float z = -linDepth(depth);
  float d = (z - uFocus) / max(z, 1e-3);
  float a = max(abs(d) - uBand, 0.0) / (1.0 - uBand);
  // the near field (bottom of a tilted view) is compressed a little: soft, not mushy
  return clamp(d < 0.0 ? -a * uK * 0.8 : a * uK, -uNearMax, uK);
}
`;

const PREFILTER_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uScale; // output px -> half-res px
${COC_GLSL}
${CLOUD_SHADOW_GLSL}
${AO_HALF_GLSL}
varying vec2 vUv;
void main() {
  vec3 col = texture2D(tColor, vUv).rgb; // bilinear at the 2x2 centre = box filter
  vec2 o = uTexel * 0.5;
  float d0 = texture2D(tDepth, vUv + vec2(-o.x, -o.y)).r;
  float d1 = texture2D(tDepth, vUv + vec2(o.x, -o.y)).r;
  float d2 = texture2D(tDepth, vUv + vec2(-o.x, o.y)).r;
  float d3 = texture2D(tDepth, vUv + vec2(o.x, o.y)).r;
  float dn = min(min(d0, d1), min(d2, d3));
  float df = max(max(d0, d1), max(d2, d3));
  float cn = cocOf(dn), cf = cocOf(df);
  // keep near-field silhouettes (most negative), otherwise the larger far blur
  float coc = cn < 0.0 ? cn : max(cn, cf);
  col *= cloudShadowMul(vUv, dn);
  // ambient occlusion (the sharp image gets it in the final pass, see aoApply.ts)
  if (dn < 1.0) col *= aoMulHalf(vUv, -linDepth(dn));
  // tame fireflies so tiny emissives don't sparkle when defocused
  col = col / (1.0 + max(max(col.r, col.g), col.b) * 0.02);
  gl_FragColor = vec4(col, coc * uScale);
}
`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uDir;
uniform float uMaxR;
varying vec2 vUv;
void main() {
  vec4 c = textureLod(tSrc, vUv, 0.0);
  float cc = abs(c.a);
  vec3 acc = c.rgb;
  float wsum = 1.0;
  float outCoc = c.a;
  // taps two texels apart, placed between texels so bilinear filtering averages a pair
  for (int i = 1; i <= ${MAX_TAPS}; i++) {
    float fi = float(i) * 2.0 - 0.5;
    if (fi - 1.0 > uMaxR) break;
    for (int s = 0; s < 2; s++) {
      float sg = s == 0 ? -1.0 : 1.0;
      vec4 t = textureLod(tSrc, vUv + uDir * fi * sg, 0.0);
      float tc = abs(t.a);
      // a sample further away than us may not spread over a sharper (nearer) pixel
      if (t.a > c.a) tc = min(tc, cc * 1.6 + 0.35);
      float w = smoothstep(fi - 1.0, fi + 1.0, tc);
      w *= 2.0 * (1.0 - 0.45 * fi / (tc + 1.0)); // each tap stands for two texels; gentle taper
      acc += t.rgb * w;
      wsum += w;
      // near-field blur reaching us: carry its CoC so the second pass spreads it too
      if (t.a < outCoc && t.a < 0.0 && w > 1.0) outCoc = t.a;
    }
  }
  gl_FragColor = vec4(acc / wsum, outCoc);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tBlur;
uniform float uEnabled;
uniform float uScaleC;
${COC_GLSL}
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  if (uEnabled < 0.5) { outputColor = inputColor; return; }
  vec4 b = texture2D(tBlur, uv);
  float coc = abs(cocOf(depth));
  float nearCov = max(-b.a, 0.0) / uScaleC;
  float amt = smoothstep(0.45, 1.6, max(coc, nearCov));
  outputColor = vec4(mix(inputColor.rgb, b.rgb, amt), inputColor.a);
}
`;

export interface TiltShiftParams {
  /** planar focus depth (m) */
  focus: number;
  /** max far-field CoC in output pixels */
  k: number;
  /** relative depth band around the focus that stays perfectly sharp */
  band: number;
  /** CoC used for the sky backdrop (output px) */
  skyCoc: number;
}

export class TiltShiftEffect extends Effect {
  readonly params: TiltShiftParams = { focus: 200, k: 12, band: 0.05, skyCoc: 5 };
  enabled = true;
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private prefilter: FullscreenPass;
  private blur: FullscreenPass;
  private depthTex: THREE.Texture | null = null;
  private fullW = 2;
  private fullH = 2;
  private cocUniforms: Record<string, THREE.Uniform>;

  constructor(
    private camera: THREE.PerspectiveCamera,
    cloudU: CloudShadowUniforms,
    aoU: AOUniforms = aoUniforms(),
  ) {
    const coc = {
      uFocus: new THREE.Uniform(200),
      uK: new THREE.Uniform(12),
      uBand: new THREE.Uniform(0.05),
      uSkyCoc: new THREE.Uniform(5),
      uNearMax: new THREE.Uniform(24),
      uNear: new THREE.Uniform(1),
      uFar: new THREE.Uniform(6000),
    };
    const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter } as const;
    const rtA = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    const rtB = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    rtA.texture.name = 'TiltShift.A';
    rtB.texture.name = 'TiltShift.B';
    super('TiltShiftEffect', COMPOSITE_FRAG, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ['tBlur', new THREE.Uniform(rtA.texture)],
        ['uEnabled', new THREE.Uniform(1)],
        ['uScaleC', new THREE.Uniform(0.5)],
        ...(Object.entries(coc) as [string, THREE.Uniform][]),
      ]),
    });
    this.cocUniforms = coc;
    this.rtA = rtA;
    this.rtB = rtB;
    this.prefilter = new FullscreenPass(
      new THREE.ShaderMaterial({
        name: 'TiltShiftPrefilter',
        uniforms: {
          tColor: { value: null },
          tDepth: { value: null },
          uTexel: { value: new THREE.Vector2() },
          uScale: { value: 0.5 },
          ...coc,
          ...cloudU,
          ...aoU,
        },
        vertexShader: FS_VERT,
        fragmentShader: PREFILTER_FRAG,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        toneMapped: false,
      }),
    );
    this.blur = new FullscreenPass(
      new THREE.ShaderMaterial({
        name: 'TiltShiftBlur',
        uniforms: {
          tSrc: { value: null },
          uDir: { value: new THREE.Vector2() },
          uMaxR: { value: 8 },
        },
        vertexShader: FS_VERT,
        fragmentShader: BLUR_FRAG,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        toneMapped: false,
      }),
    );
  }

  override setDepthTexture(depthTexture: THREE.Texture): void {
    this.depthTex = depthTexture;
  }

  override setSize(width: number, height: number): void {
    this.fullW = width;
    this.fullH = height;
    const w = Math.max(1, Math.round(width / 2)),
      h = Math.max(1, Math.round(height / 2));
    this.rtA.setSize(w, h);
    this.rtB.setSize(w, h);
  }

  override update(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget): void {
    const p = this.params;
    const u = this.cocUniforms;
    u.uFocus.value = p.focus;
    u.uK.value = p.k;
    u.uBand.value = p.band;
    u.uSkyCoc.value = p.skyCoc;
    u.uNearMax.value = p.k * 1.4;
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    (this.uniforms.get('uEnabled') as THREE.Uniform).value = this.enabled ? 1 : 0;
    if (!this.enabled || !this.depthTex) return;

    const pm = this.prefilter.material;
    pm.uniforms.tColor.value = inputBuffer.texture;
    pm.uniforms.tDepth.value = this.depthTex;
    (pm.uniforms.uTexel.value as THREE.Vector2).set(1 / this.fullW, 1 / this.fullH);
    pm.uniforms.uScale.value = this.rtA.width / this.fullW;
    (this.uniforms.get('uScaleC') as THREE.Uniform).value = this.rtA.width / this.fullW;
    this.prefilter.render(renderer, this.rtA);

    const maxR = Math.min(MAX_R, Math.ceil(p.k * (this.rtA.width / this.fullW) * 1.05) + 1);
    const bm = this.blur.material;
    bm.uniforms.uMaxR.value = maxR;
    bm.uniforms.tSrc.value = this.rtA.texture;
    (bm.uniforms.uDir.value as THREE.Vector2).set(1 / this.rtA.width, 0);
    this.blur.render(renderer, this.rtB);
    bm.uniforms.tSrc.value = this.rtB.texture;
    (bm.uniforms.uDir.value as THREE.Vector2).set(0, 1 / this.rtA.height);
    this.blur.render(renderer, this.rtA);
  }

  override dispose(): void {
    super.dispose();
    this.rtA.dispose();
    this.rtB.dispose();
    this.prefilter.dispose();
    this.blur.dispose();
  }
}

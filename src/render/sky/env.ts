// A small PMREM environment derived from the painted sky (diffuse sky fill + soft
// reflections for glass, water and car paint). Re-baked only when the palette has
// drifted noticeably (or after a time jump) — never every frame. The PMREM size is
// constant so swapping textures never triggers shader recompiles.

import * as THREE from 'three';
import type { SkyState } from './palette';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uGlow;
uniform float uGlowI;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uSunI;
uniform vec3 uCity;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float up = clamp(y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 1.0, pow(up, 0.55)));
  vec3 sd = normalize(vec3(uSunDir.x, max(uSunDir.y, -0.25), uSunDir.z));
  float az = dot(normalize(d.xz + vec2(1e-5)), normalize(sd.xz + vec2(1e-5))) * 0.5 + 0.5;
  float band = exp(-abs(y - max(sd.y, 0.0) * 0.35) * 5.0);
  col += uGlow * uGlowI * pow(az, 3.0) * band;
  // broad bright region around the sun (no hard disc: the direct light owns the highlight)
  col += uSunCol * uSunI * pow(max(dot(d, uSunDir), 0.0), 8.0) * 0.6;
  // below the horizon: the lit city / ground bounce, with a warm glow at night
  float below = smoothstep(0.02, -0.12, y);
  vec3 groundCol = uGround + uCity * smoothstep(0.0, -0.5, y);
  col = mix(col, groundCol, below);
  gl_FragColor = vec4(col, 1.0);
}
`;

function desaturate(c: THREE.Color, k: number): void {
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  c.r += (l - c.r) * k;
  c.g += (l - c.g) * k;
  c.b += (l - c.b) * k;
}

export class EnvironmentBaker {
  private pmrem: THREE.PMREMGenerator;
  private scene = new THREE.Scene();
  private material: THREE.ShaderMaterial;
  private target: THREE.WebGLRenderTarget | null = null;
  private sig = new Float32Array(12);
  private cur = new Float32Array(12);
  private lastBake = -1e9;
  bakes = 0;
  /** studio key: smaller sun lobe and a slightly desaturated sky in the fill (false = original) */
  studio = true;

  constructor(private renderer: THREE.WebGLRenderer, private size = 128) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.material = new THREE.ShaderMaterial({
      name: 'SkyEnv',
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGround: { value: new THREE.Color() },
        uGlow: { value: new THREE.Color() },
        uGlowI: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunCol: { value: new THREE.Color() },
        uSunI: { value: 0 },
        uCity: { value: new THREE.Color() },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.material);
    this.scene.add(mesh);
  }

  /** returns true if a new environment was baked */
  maybeBake(scene: THREE.Scene, state: SkyState, sunDir: THREE.Vector3, sunVis: number, cityGlow: number, now: number, force = false): boolean {
    const s = this.sig;
    const cur = this.cur;
    cur[0] = state.zenith.r;
    cur[1] = state.zenith.g;
    cur[2] = state.zenith.b;
    cur[3] = state.horizon.r;
    cur[4] = state.horizon.g;
    cur[5] = state.horizon.b;
    cur[6] = state.glow.r * state.glowI;
    cur[7] = state.glow.g * state.glowI;
    cur[8] = sunDir.x;
    cur[9] = sunDir.y;
    cur[10] = sunDir.z;
    cur[11] = cityGlow;
    let diff = 0;
    for (let i = 0; i < 12; i++) diff = Math.max(diff, Math.abs(cur[i] - s[i]) / (i >= 8 && i <= 10 ? 4 : Math.max(0.04, Math.abs(s[i]) * 1.5)));
    if (!force && (diff < 0.06 || now - this.lastBake < 2.5)) return false;
    for (let i = 0; i < 12; i++) s[i] = cur[i];
    this.lastBake = now;

    const u = this.material.uniforms;
    (u.uZenith.value as THREE.Color).copy(state.zenith);
    (u.uHorizon.value as THREE.Color).copy(state.horizon);
    if (this.studio) {
      // cool, but not saturated-blue shadows: pull the sky part of the fill toward grey
      desaturate(u.uZenith.value as THREE.Color, 0.55);
      desaturate(u.uHorizon.value as THREE.Color, 0.35);
    }
    // what the city "sees" below the horizon: lit ground in the day, dark streets at night
    (u.uGround.value as THREE.Color).copy(state.hemiGround).multiplyScalar(0.45 * state.hemiI).lerp(state.fog, 0.25);
    (u.uGlow.value as THREE.Color).copy(state.glow);
    u.uGlowI.value = state.glowI;
    (u.uSunDir.value as THREE.Vector3).copy(sunDir);
    (u.uSunCol.value as THREE.Color).copy(state.sun);
    // broad sun lobe: the direct light already models the sun side, so the studio key keeps it small
    u.uSunI.value = sunVis * (this.studio ? Math.min(1.1, state.sunI * 0.25) : Math.min(1.5, state.sunI * 0.35));
    (u.uCity.value as THREE.Color).setRGB(1.0, 0.6, 0.32).multiplyScalar(0.08 * cityGlow);

    // three's GGX prefilter shader trips a benign HLSL constant-folding warning
    // (X4122) on ANGLE/D3D; it is compiled exactly once (fixed PMREM size), so skip
    // the info-log check for these internal programs only.
    const dbg = this.renderer.debug;
    const prevCheck = dbg.checkShaderErrors;
    dbg.checkShaderErrors = false;
    let rt: THREE.WebGLRenderTarget;
    try {
      rt = this.pmrem.fromScene(this.scene, 0, 0.1, 100, { size: this.size });
    } finally {
      dbg.checkShaderErrors = prevCheck;
    }
    const old = this.target;
    this.target = rt;
    scene.environment = rt.texture;
    if (old) old.dispose();
    this.bakes++;
    return true;
  }

  dispose(): void {
    this.target?.dispose();
    this.pmrem.dispose();
    this.material.dispose();
  }
}

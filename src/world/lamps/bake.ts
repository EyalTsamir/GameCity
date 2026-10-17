// CPU baker of the night light map (see core/lampLight.ts for the encoding read by thLampLight).
//
// Every static light is a point source at its head with
//   • a down-light profile  E = I · (P/d)^(3+k)   (k shapes a brighter core; I = irradiance right
//     under the head, P = head height above its ground, d = distance head → texel), or
//   • an aimed spot (floodlights, shop spill): smooth cone around head → aim, normalised so that the
//     aim point receives I,
// times a smooth window that ends the light at 2 × radius (aimed: aim distance + 1.6 × radius). Contributions add up linearly and are
// then soft-compressed per texel (luminance K·(1 − e^(−Y/K))) so overlaps brighten but never blow out.
// Alongside the irradiance the baker stores, per texel, the luminance-weighted head height, head
// height above ground, horizontal distance and direction towards the lights — enough for the shader
// to rebuild a "virtual lamp" and light walls, crowns and people plausibly.

import * as THREE from 'three';
import { LAMP_MAP, type LampLight } from '../../core/lampLight';

export interface BakeResult {
  data: Uint8Array;
  width: number;
  height: number;
  lights: number;
  texelsTouched: number;
  ms: number;
  /** max luminance before compression (diagnostics) */
  peak: number;
}

/** profile exponent (core sharpness) per kind */
const CORE: Record<LampLight['kind'], number> = { street: 1.6, path: 1.1, plaza: 1.4, flood: 0, spill: 0, portal: 1.0 };
/** soft-compression knee (stored range is 0..4) */
const KNEE = 2.4;

const _c = new THREE.Color();

export function bakeLampMap(lights: readonly LampLight[], ground: (x: number, z: number) => number, gain = 1): BakeResult {
  const t0 = performance.now();
  const M = LAMP_MAP;
  const pw = M.pw,
    ph = M.ph,
    T = M.texel;
  const n = pw * ph;
  const R = new Float32Array(n),
    G = new Float32Array(n),
    B = new Float32Array(n),
    W = new Float32Array(n),
    WH = new Float32Array(n),
    WP = new Float32Array(n),
    WDH = new Float32Array(n),
    WDX = new Float32Array(n),
    WDZ = new Float32Array(n);
  let touched = 0,
    count = 0;

  for (const l of lights) {
    if (l.channel) continue;
    if (!(l.intensity > 0) || !(l.radius > 0)) continue;
    count++;
    _c.set(l.color); // linear
    const lum = 0.2126 * _c.r + 0.7152 * _c.g + 0.0722 * _c.b;
    const cr = _c.r / Math.max(lum, 1e-3),
      cg = _c.g / Math.max(lum, 1e-3),
      cb = _c.b / Math.max(lum, 1e-3);
    const P = Math.max(0.8, l.pole ?? l.y - ground(l.x, l.z));
    const I = l.intensity * gain;
    let reach: number;
    // aimed spot setup
    let ax = 0,
      ay = -1,
      az = 0,
      cosO = 0,
      cosI = 1,
      Iraw = 0;
    const aimed = !!l.aim;
    if (l.aim) {
      const dx = l.aim[0] - l.x,
        dy = l.aim[1] - l.y,
        dz = l.aim[2] - l.z;
      const dl = Math.hypot(dx, dy, dz) || 1;
      ax = dx / dl;
      ay = dy / dl;
      az = dz / dl;
      const half = l.cone ?? Math.atan2(l.radius, dl);
      cosO = Math.cos(Math.min(1.45, half * 1.35));
      cosI = Math.cos(half * 0.35);
      // normalise: the aim point receives I
      const vA = l.y - l.aim[1];
      const cosGA = Math.max(0.08, vA / dl);
      Iraw = (I * dl * dl) / cosGA;
      reach = Math.hypot(dx, dz) + l.radius * 1.6;
    } else {
      // the profile already shapes the pool; the long window keeps a faint wash on nearby facades.
      // Tall street poles throw wider: their pools overlap into a continuous, modulated street.
      const rad = l.kind === 'street' ? Math.max(l.radius, P * 0.95) : l.radius;
      reach = rad * 2.0;
    }
    const k = CORE[l.kind] ?? 1.2;
    const st = l.stretch && l.stretch !== 1 && !aimed ? l.stretch : 1;
    const cy = Math.cos(l.yaw ?? 0),
      sy = Math.sin(l.yaw ?? 0);
    const rx = reach * (st > 1 ? st : 1);
    const i0 = Math.max(0, Math.floor((l.x - rx - M.x0) / T)),
      i1 = Math.min(pw - 1, Math.ceil((l.x + rx - M.x0) / T));
    const j0 = Math.max(0, Math.floor((l.z - rx - M.z0) / T)),
      j1 = Math.min(ph - 1, Math.ceil((l.z + rx - M.z0) / T));
    const P2 = P * P;
    for (let j = j0; j <= j1; j++) {
      const z = M.z0 + (j + 0.5) * T;
      const dz = z - l.z;
      for (let i = i0; i <= i1; i++) {
        const x = M.x0 + (i + 0.5) * T;
        const dx = x - l.x;
        const dh2 = dx * dx + dz * dz;
        // falloff distance (elliptic for stretched pools)
        let dhw2 = dh2;
        if (st !== 1) {
          const lx = dx * cy - dz * sy,
            lz = dx * sy + dz * cy;
          dhw2 = (lx * lx) / (st * st) + lz * lz;
        }
        if (dhw2 >= reach * reach) continue;
        const s = Math.sqrt(dhw2) / reach;
        const win = s <= 0.55 ? 1 : 1 - smooth((s - 0.55) / 0.45);
        if (win <= 0) continue;
        const d2 = dh2 + P2;
        const d = Math.sqrt(d2);
        let E: number;
        if (aimed) {
          const cosA = (dx * ax - P * ay + dz * az) / d;
          if (cosA <= cosO) continue;
          const prof = cosA >= cosI ? 1 : smooth((cosA - cosO) / (cosI - cosO));
          E = (Iraw * prof * (P / d)) / d2;
        } else {
          // effective distance for stretched pools keeps the core elongated too
          const de = st !== 1 ? Math.sqrt(dhw2 + P2) : d;
          E = I * Math.pow(P / de, 3 + k);
        }
        E *= win;
        if (E < 1e-5) continue;
        const idx = j * pw + i;
        if (W[idx] === 0) touched++;
        R[idx] += cr * E;
        G[idx] += cg * E;
        B[idx] += cb * E;
        W[idx] += E;
        WH[idx] += E * l.y;
        WP[idx] += E * P;
        const dh = Math.sqrt(dh2);
        WDH[idx] += E * dh;
        if (dh > 1e-3) {
          const fade = Math.min(1, dh / 0.75);
          WDX[idx] -= (E * fade * dx) / dh;
          WDZ[idx] -= (E * fade * dz) / dh;
        }
      }
    }
  }

  // encode both panels
  const width = M.width;
  const data = new Uint8Array(width * ph * 4);
  const bOff = pw + M.gap;
  let peak = 0;
  for (let j = 0; j < ph; j++) {
    for (let i = 0; i < pw; i++) {
      const idx = j * pw + i;
      const a = (j * width + i) * 4;
      const b = (j * width + bOff + i) * 4;
      const w = W[idx];
      if (w <= 0) {
        data[b] = 128;
        data[b + 1] = 128;
        continue;
      }
      let r = R[idx],
        g = G[idx],
        bl = B[idx];
      const Y = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      if (Y > peak) peak = Y;
      const Yc = KNEE * (1 - Math.exp(-Y / KNEE));
      const sc = Y > 1e-9 ? Yc / Y : 0;
      r *= sc;
      g *= sc;
      bl *= sc;
      data[a] = enc(Math.sqrt(Math.min(1, r / 4)));
      data[a + 1] = enc(Math.sqrt(Math.min(1, g / 4)));
      data[a + 2] = enc(Math.sqrt(Math.min(1, bl / 4)));
      data[a + 3] = enc((WH[idx] / w + 10) / 50);
      data[b] = enc((WDX[idx] / w) * 0.5 + 0.5);
      data[b + 1] = enc((WDZ[idx] / w) * 0.5 + 0.5);
      data[b + 2] = enc(WDH[idx] / w / 20);
      data[b + 3] = enc(WP[idx] / w / 32);
    }
  }
  // dilate the geometry channels one texel into unlit neighbours (clean bilinear fringes)
  for (let j = 0; j < ph; j++) {
    for (let i = 0; i < pw; i++) {
      if (W[j * pw + i] > 0) continue;
      let src = -1;
      if (i > 0 && W[j * pw + i - 1] > 0) src = j * pw + i - 1;
      else if (i < pw - 1 && W[j * pw + i + 1] > 0) src = j * pw + i + 1;
      else if (j > 0 && W[(j - 1) * pw + i] > 0) src = (j - 1) * pw + i;
      else if (j < ph - 1 && W[(j + 1) * pw + i] > 0) src = (j + 1) * pw + i;
      if (src < 0) continue;
      const sj = Math.floor(src / pw),
        si = src - sj * pw;
      const a = (j * width + i) * 4,
        b = (j * width + bOff + i) * 4;
      const sa = (sj * width + si) * 4,
        sb = (sj * width + bOff + si) * 4;
      data[a + 3] = data[sa + 3];
      data[b] = data[sb];
      data[b + 1] = data[sb + 1];
      data[b + 2] = data[sb + 2];
      data[b + 3] = data[sb + 3];
    }
  }
  return { data, width, height: ph, lights: count, texelsTouched: touched, ms: performance.now() - t0, peak };
}

function smooth(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

function enc(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
}

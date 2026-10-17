// Gentle stylised swell shared by the water vertex shader, the cut-away faces and the
// CPU service (ctx.services.water.waveHeight) — the GLSL is generated from the same table,
// so boats bob exactly with the rendered surface.

export interface Wave {
  dx: number;
  dz: number;
  /** wavelength (m) */
  len: number;
  /** amplitude (m) */
  amp: number;
  /** phase speed (m/s) */
  speed: number;
  phase: number;
}

function wave(angDeg: number, len: number, amp: number, speed: number, phase: number): Wave {
  const a = (angDeg * Math.PI) / 180;
  return { dx: Math.cos(a), dz: Math.sin(a), len, amp, speed, phase };
}

/** Geometric swell (vertex displacement): long waves rolling in from the open sea (east). */
export const SWELL: Wave[] = [wave(162, 17, 0.085, 2.3, 0), wave(212, 11.5, 0.05, 1.85, 1.7), wave(118, 7.8, 0.03, 1.5, 4.1)];
/** Extra short ripples used only for per-pixel normals. */
export const RIPPLE: Wave[] = [wave(63, 3.9, 0.012, 1.15, 2.2), wave(250, 2.6, 0.008, 0.95, 5.3), wave(15, 1.7, 0.005, 0.8, 0.9)];

const TAU = Math.PI * 2;

/** swell height (unscaled by the local amplitude factor) */
export function swell(x: number, z: number, t: number): number {
  let h = 0;
  for (const w of SWELL) {
    const k = TAU / w.len;
    h += w.amp * Math.sin(k * (w.dx * x + w.dz * z) - k * w.speed * t + w.phase);
  }
  return h;
}

function f(v: number): string {
  return v.toFixed(6);
}

function glslSum(name: string, waves: Wave[], withGrad: boolean): string {
  const lines: string[] = [];
  lines.push(`float ${name}(vec2 p, float t${withGrad ? ', inout vec2 g' : ''}) {`);
  lines.push('  float h = 0.0; float ph;');
  for (const w of waves) {
    const k = TAU / w.len;
    lines.push(`  ph = ${f(k * w.dx)} * p.x + ${f(k * w.dz)} * p.y - ${f(k * w.speed)} * t + ${f(w.phase)};`);
    lines.push(`  h += ${f(w.amp)} * sin(ph);`);
    if (withGrad) lines.push(`  g += ${f(w.amp * k)} * cos(ph) * vec2(${f(w.dx)}, ${f(w.dz)});`);
  }
  lines.push('  return h;');
  lines.push('}');
  return lines.join('\n');
}

/** GLSL: th_swell(p, t[, g]) (geometric waves) and th_ripple(p, t, g) (normal-only detail). */
export const WAVES_GLSL = [glslSum('th_swell', SWELL, false), glslSum('th_swellG', SWELL, true), glslSum('th_ripple', RIPPLE, true)].join('\n');

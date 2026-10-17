// Harbour work lighting (night agent): high floodlight masts on the quay apron and in the
// north-strip container yard. Geometry goes into the harbour's static builder (no extra draw call),
// the lamp heads get small cool halos (harbour glow mesh) and every luminaire is registered as an
// aimed light in the shared lamp light map, so the quay, the container stacks and the cranes' legs
// are washed in cool white light (night palette #d6e6ff) multiplied by their own colours.
// The crane work lights under the booms are moving spot lights (see harbor/material.ts).

import type { OccupancyGrid } from '../../core/occupancy';
import { OCC } from '../../core/occupancy';
import { addLampLights, type LampLight } from '../../core/lampLight';
import type { HB } from '../harbor/geo';
import { EMIT, PAT } from '../harbor/geo';
import type { GlowPoint } from '../harbor/material';
import { HARBOR_FLOOD_COL } from '../harbor/material';

interface MastSpec {
  x: number;
  z: number;
  height: number;
  /** aim points on the ground (one luminaire each) */
  aims: [number, number][];
  radius: number;
  intensity: number;
}

// quay apron (x 116.5..136): masts at both ends, clear of the gantry travel range (cranes work
// between z ≈ −112 and −44) and of the container drop lane; heads stay below the crane booms (22 m).
// north-strip yard (stacks x 62.5..108.5, z −148..−129): masts in the free strips at both ends.
const MASTS: MastSpec[] = [
  { x: 126.9, z: -125.2, height: 18, aims: [[122.5, -109], [132, -112]], radius: 10, intensity: 1.35 },
  { x: 126.9, z: -19.5, height: 18, aims: [[122.5, -36], [132, -33]], radius: 10, intensity: 1.35 },
  { x: 61.2, z: -138.5, height: 15, aims: [[75, -133.5], [75, -143.5]], radius: 9, intensity: 1.25 },
  { x: 109.8, z: -138.5, height: 15, aims: [[96, -133.5], [96, -143.5]], radius: 9, intensity: 1.25 },
];

const STEEL = '#8b949a';
const DARK = '#4d555b';
const LAMP = '#eef4ff';

export interface HarborLightsInfo {
  masts: number;
  luminaires: number;
  skipped: string[];
}

export function buildHarborFloodlights(b: HB, ground: (x: number, z: number) => number, occ: OccupancyGrid, glows: GlowPoint[]): HarborLightsInfo {
  const lights: LampLight[] = [];
  const skipped: string[] = [];
  let masts = 0;
  for (const m of MASTS) {
    if (occ.has(m.x, m.z, OCC.BUILDING | OCC.ROAD | OCC.WATER | OCC.RAIL)) {
      skipped.push(`harbour floodlight mast at (${m.x}, ${m.z}) blocked`);
      continue;
    }
    masts++;
    const g = ground(m.x, m.z);
    const top = g + m.height;
    b.noEmit().pat(PAT.NONE);
    // concrete footing, tapered steel mast, platform with railing
    b.color('#9a978f');
    b.vcyl(m.x, g, m.z, 0.62, 0.45, 8, 2);
    b.color(STEEL);
    b.vcyl(m.x, g + 0.45, m.z, 0.3, m.height - 0.95, 8, 0, 0.17);
    b.color(DARK);
    b.vcyl(m.x, top - 0.55, m.z, 0.85, 0.08, 10, 3);
    // average aim direction: the head frame faces it
    let ax = 0,
      az = 0;
    for (const [x, z] of m.aims) {
      ax += x - m.x;
      az += z - m.z;
    }
    const yaw = Math.atan2(ax, az);
    const n = m.aims.length;
    b.pushT(m.x, top, m.z, yaw);
    // cross arm carrying the luminaires
    b.color(DARK);
    b.box(0, 0.0, 0.15, 0.6 + n * 1.0, 0.12, 0.12);
    b.box(0, -0.35, 0.0, 0.12, 0.7, 0.12);
    b.pop();
    m.aims.forEach(([tx, tz], i) => {
      const off = (i - (n - 1) / 2) * 1.05;
      // luminaire position on the arm (world)
      const c = Math.cos(yaw),
        s = Math.sin(yaw);
      const lx = m.x + off * c + 0.35 * s,
        lz = m.z - off * s + 0.35 * c;
      const ly = top + 0.05;
      const gy = ground(tx, tz);
      const dx = tx - lx,
        dz = tz - lz;
      const dh = Math.hypot(dx, dz);
      const lyaw = Math.atan2(dx, dz);
      const pitch = Math.atan2(ly - gy, dh); // tilt the face down onto the aim point
      b.pushT(lx, ly, lz, lyaw, pitch);
      b.color(DARK);
      b.box(0, 0, -0.08, 0.95, 0.62, 0.16);
      b.color(LAMP).emit(LAMP, 3.2, EMIT.LIGHTS);
      b.box(0, 0, 0.02, 0.8, 0.48, 0.05, 0, 4);
      b.noEmit();
      b.pop();
      glows.push({ x: lx + Math.sin(lyaw) * 0.25, y: ly - 0.12, z: lz + Math.cos(lyaw) * 0.25, size: 1.5, color: '#eaf1ff', intensity: 1.05 });
      lights.push({
        x: lx,
        y: ly,
        z: lz,
        pole: ly - g,
        radius: m.radius,
        color: HARBOR_FLOOD_COL,
        intensity: m.intensity,
        kind: 'flood',
        aim: [tx, gy, tz],
        cone: Math.atan2(m.radius, Math.hypot(dh, ly - gy)) + 0.12,
      });
    });
  }
  addLampLights(lights);
  return { masts, luminaires: lights.length, skipped };
}

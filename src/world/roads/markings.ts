// Road markings and flat street details, merged into one mesh drawn with the paint material:
// centre lines, stop lines, zebras, STOP text and lane arrows, bus stop boxes, the level-crossing
// keep-clear boxes, parking stalls, the football pitch and school court lines, the quay safety line,
// cycle symbols, manhole covers, gully grates and utility lids. Glyphs come from a canvas atlas.

import * as THREE from 'three';
import type { CityContext } from '../../core/context';
import type { Dir, P2, Rect } from '../../core/geom';
import { DIR_VEC } from '../../core/geom';
import { CORRIDOR_HALF, QUAY_X, ROAD_HALF, STOPLINE } from '../../core/constants';
import { Rng } from '../../core/rng';
import { MeshBuilder } from './builder';
import { Y } from './streets';
import type { CoverInfo } from './covers';

export interface Glyph {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

const AW = 1024,
  AH = 512;

/**
 * Emboss a canvas region in place: its grey levels are a height field; the output is lit from the top-left
 * (relief shading baked into the glyph) and darkened in the recesses. Alpha is kept.
 */
function emboss(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const im = g.getImageData(x, y, w, h);
  const d = im.data;
  const H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = d[i * 4] / 255;
  const at = (i: number, j: number) => H[Math.min(h - 1, Math.max(0, j)) * w + Math.min(w - 1, Math.max(0, i))];
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      if (d[k + 3] === 0) continue;
      const hv = at(i, j);
      const slope = at(i - 1, j - 1) - at(i + 1, j + 1);
      const v = Math.max(0, Math.min(1, 0.42 + 0.5 * hv - 0.9 * slope));
      d[k] = d[k + 1] = d[k + 2] = Math.round(v * 255);
    }
  g.putImageData(im, x, y);
}

export function buildAtlas(): { tex: THREE.CanvasTexture; g: Record<string, Glyph> } {
  const cv = document.createElement('canvas');
  cv.width = AW;
  cv.height = AH;
  // (CPU-backed: the castings are embossed with getImageData once at boot)
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.clearRect(0, 0, AW, AH);
  const glyphs: Record<string, Glyph> = {};
  const reg = (name: string, x0: number, y0: number, x1: number, y1: number) => {
    glyphs[name] = { u0: x0 / AW, v0: y0 / AH, u1: x1 / AW, v1: y1 / AH };
  };
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  // solid paint
  g.fillRect(0, 0, 16, 16);
  reg('solid', 4, 4, 12, 12);
  // text (tight boxes so the quad maps exactly onto the letters)
  const text = (name: string, s: string, x0: number, x1: number, size: number, condense = 1) => {
    g.save();
    g.font = `bold ${size}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
    g.textBaseline = 'alphabetic';
    const m = g.measureText(s);
    const w = m.actualBoundingBoxRight + m.actualBoundingBoxLeft;
    const asc = m.actualBoundingBoxAscent,
      desc = m.actualBoundingBoxDescent;
    const scale = Math.min(1, (x1 - x0 - 8) / (w * condense));
    const cx = (x0 + x1) / 2;
    const base = 8 + asc;
    g.translate(cx, base);
    g.scale(scale * condense, 1);
    g.fillText(s, -w / 2 + m.actualBoundingBoxLeft, 0);
    g.restore();
    const hw = (w * scale * condense) / 2;
    reg(name, cx - hw - 1, 8 - 1, cx + hw + 1, base + desc + 1);
  };
  text('STOP', 'STOP', 20, 520, 150, 0.9);
  text('BUS', 'BUS', 600, 960, 150, 0.9);
  // lane arrows (pointing up), 7 combinations
  const combos = ['S', 'L', 'R', 'SL', 'SR', 'LR', 'SLR'];
  combos.forEach((cmb, k) => {
    const ox = k * 128,
      oy = 168;
    g.save();
    g.translate(ox, oy);
    g.lineWidth = 15;
    g.lineCap = 'butt';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(64, 244);
    g.lineTo(64, cmb.includes('S') ? 64 : 132);
    g.stroke();
    if (cmb.includes('S')) {
      g.beginPath();
      g.moveTo(64, 6);
      g.lineTo(38, 66);
      g.lineTo(90, 66);
      g.closePath();
      g.fill();
    }
    for (const side of ['L', 'R']) {
      if (!cmb.includes(side)) continue;
      const sx = side === 'L' ? -1 : 1;
      g.beginPath();
      g.moveTo(64, 150);
      g.quadraticCurveTo(64, 104, 64 + sx * 30, 104);
      g.stroke();
      g.beginPath();
      g.moveTo(64 + sx * 60, 104);
      g.lineTo(64 + sx * 26, 80);
      g.lineTo(64 + sx * 26, 128);
      g.closePath();
      g.fill();
    }
    g.restore();
    reg(`arrow${cmb}`, ox + 2, oy + 2, ox + 126, oy + 248);
  });
  // bicycle symbol (side view rotated: front wheel at the top)
  {
    const ox = 896,
      oy = 168;
    g.save();
    g.translate(ox + 64, oy + 124);
    g.rotate(-Math.PI / 2);
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const wr = 30;
    g.beginPath();
    g.arc(-70, 22, wr, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(70, 22, wr, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(-70, 22);
    g.lineTo(-18, 22);
    g.lineTo(-32, -18);
    g.closePath();
    g.moveTo(-18, 22);
    g.lineTo(44, -18);
    g.lineTo(-32, -18);
    g.moveTo(70, 22);
    g.lineTo(48, -36);
    g.lineTo(34, -36);
    g.moveTo(-32, -18);
    g.lineTo(-38, -32);
    g.moveTo(-48, -32);
    g.lineTo(-26, -32);
    g.stroke();
    g.restore();
    reg('bike', ox + 4, oy + 4, ox + 124, oy + 244);
  }
  // manhole cover: a legible casting (raised frame ring, text ring, chequer plate, pick holes), embossed from a
  // height field (light from the glyph's top-left: reads as relief on the flat decal)
  {
    const cx = 304,
      cy = 464;
    g.save();
    // height field in greys: 0.3 base plate, raised parts lighter
    g.beginPath();
    g.arc(cx, cy, 45, 0, Math.PI * 2);
    g.fillStyle = '#e0e0e0';
    g.fill();
    g.beginPath();
    g.arc(cx, cy, 40, 0, Math.PI * 2);
    g.fillStyle = '#3c3c3c';
    g.fill();
    g.beginPath();
    g.arc(cx, cy, 37.5, 0, Math.PI * 2);
    g.fillStyle = '#5a5a5a';
    g.fill();
    // text ring between r 28..36
    g.fillStyle = '#d4d4d4';
    g.font = 'bold 8px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const arcText = (txt: string, mid: number, top: boolean) => {
      const step = 0.205;
      for (let i = 0; i < txt.length; i++) {
        const a = mid + (top ? 1 : -1) * (i - (txt.length - 1) / 2) * step;
        g.save();
        g.translate(cx + Math.cos(a) * 32, cy + Math.sin(a) * 32);
        g.rotate(top ? a + Math.PI / 2 : a - Math.PI / 2);
        g.fillText(txt[i], 0, 0);
        g.restore();
      }
    };
    arcText('TINYHAVEN', -Math.PI / 2, true);
    arcText('SEWER', Math.PI / 2, false);
    g.strokeStyle = '#cfcfcf';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(cx, cy, 26.5, 0, Math.PI * 2);
    g.stroke();
    // chequer plate: raised lozenges on a grid inside r 25
    g.save();
    g.beginPath();
    g.arc(cx, cy, 25, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#c4c4c4';
    for (let y = -28; y <= 28; y += 7)
      for (let x = -28; x <= 28; x += 7) {
        g.save();
        g.translate(cx + x + ((y / 7) % 2 ? 3.5 : 0), cy + y);
        g.rotate(((x + y) / 7) % 2 ? Math.PI / 4 : -Math.PI / 4);
        g.fillRect(-3.2, -1.1, 6.4, 2.2);
        g.restore();
      }
    g.restore();
    // pick holes (dark, recessed)
    g.fillStyle = '#101010';
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.ellipse(cx + sx * 17, cy, 3.4, 1.8, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    emboss(g, cx - 46, cy - 46, 92, 92);
    reg('manhole', cx - 46, cy - 46, cx + 46, cy + 46);
  }
  // gully grate (long side across the gutter): raised frame and bars over black slots, two hinge lugs, embossed
  {
    const x0 = 360,
      y0 = 432;
    g.save();
    g.fillStyle = '#d6d6d6';
    g.fillRect(x0, y0, 80, 60);
    g.fillStyle = '#0c0c0c';
    for (let k = 0; k < 7; k++) g.fillRect(x0 + 8 + k * 9.6, y0 + 8, 5.6, 44);
    // a cross rib
    g.fillStyle = '#c8c8c8';
    g.fillRect(x0 + 6, y0 + 28, 68, 4);
    g.fillStyle = '#8a8a8a';
    g.fillRect(x0 + 2, y0 + 2, 10, 4);
    g.fillRect(x0 + 68, y0 + 2, 10, 4);
    g.restore();
    emboss(g, x0, y0, 80, 60);
    reg('grate', x0 - 1, y0 - 1, x0 + 81, y0 + 61);
  }
  // utility lid
  {
    const x0 = 456,
      y0 = 426;
    g.save();
    g.fillStyle = '#d0d0d0';
    g.fillRect(x0, y0, 48, 48);
    g.fillStyle = '#8a8a8a';
    g.fillRect(x0 + 5, y0 + 5, 38, 38);
    g.strokeStyle = '#c4c4c4';
    g.lineWidth = 2;
    for (let k = -38; k < 48; k += 8) {
      g.beginPath();
      g.moveTo(x0 + 5 + Math.max(0, k), y0 + 5 + Math.max(0, -k));
      g.lineTo(x0 + 5 + Math.min(38, k + 38), y0 + 5 + Math.min(38, 38 - k));
      g.stroke();
    }
    g.restore();
    reg('lid', x0 - 1, y0 - 1, x0 + 49, y0 + 49);
  }
  // hopscotch digits
  for (let d = 1; d <= 8; d++) {
    const x0 = 520 + (d - 1) * 56;
    g.save();
    g.font = 'bold 84px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(d), x0 + 28, 466);
    g.restore();
    reg(`d${d}`, x0 + 2, 422, x0 + 54, 510);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, g: glyphs };
}

// ───────────────────────────────────────────────────────────── geometry ──

const C = (h: string) => new THREE.Color(h);
const WHITE = C('#f2efe6');
const YELLOW = C('#f2c94c');
const IRON = C('#5d5a55');
const IRON_DARK = C('#3e3c39');

export interface MarkingStats {
  zebras: number;
  stopLines: number;
  dashes: number;
  stalls: number;
  decals: number;
}

const RIGHT = (d: P2): P2 => ({ x: -d.z, z: d.x });

export function buildMarkings(ctx: CityContext, atlasGlyphs: Record<string, Glyph>, asphalt: THREE.Color, info: CoverInfo, legacy = false): { geo: THREE.BufferGeometry; stats: MarkingStats } {
  const plan = ctx.plan;
  const net = ctx.roads;
  const rng = new Rng('roads-markings');
  const M = new MeshBuilder([
    { name: 'color', size: 3 },
    { name: 'uv', size: 2 },
    { name: 'aM', size: 2 },
    { name: 'aB', size: 3 },
  ]);
  const stats: MarkingStats = { zebras: 0, stopLines: 0, dashes: 0, stalls: 0, decals: 0 };
  const ASPH = asphalt.clone();
  const PARK = asphalt.clone().multiplyScalar(1.12);
  const solid = atlasGlyphs.solid;
  const yRoad = Y.asphalt + 0.003;
  const yCover = Y.cover + 0.003;

  let curBase = ASPH;
  const setPaint = (col: THREE.Color, width: number, wear: number, base: THREE.Color = curBase) => {
    M.set('color', col.r, col.g, col.b);
    M.set('aM', width, wear);
    M.set('aB', base.r, base.g, base.b);
  };

  /** Quad centred at c, 'up' along unit vector u, w across, l along, mapped to glyph g (canvas top = +u). */
  const quad = (c: P2, u: P2, w: number, l: number, y: number, g: Glyph) => {
    const r = RIGHT(u);
    const hw = w / 2,
      hl = l / 2;
    const P = (sr: number, su: number) => ({ x: c.x + r.x * sr + u.x * su, z: c.z + r.z * sr + u.z * su });
    const tl = P(-hw, hl),
      tr = P(hw, hl),
      br = P(hw, -hl),
      bl = P(-hw, -hl);
    M.set('uv', g.u0, g.v0);
    const a = M.v(tl.x, y, tl.z);
    M.set('uv', g.u1, g.v0);
    const b = M.v(tr.x, y, tr.z);
    M.set('uv', g.u1, g.v1);
    const d = M.v(br.x, y, br.z);
    M.set('uv', g.u0, g.v1);
    const e = M.v(bl.x, y, bl.z);
    M.quadUp(a, b, d, e);
  };
  /** Solid painted line from a to b. */
  const line = (a: P2, b: P2, w: number, y = yRoad) => {
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const L = Math.hypot(dx, dz);
    if (L < 1e-4) return;
    quad({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, { x: dx / L, z: dz / L }, w, L, y, solid);
  };
  /** Polyline arc (circle part) of painted line. */
  const arc = (c: P2, r: number, a0: number, a1: number, w: number, y: number) => {
    const n = Math.max(6, Math.ceil((Math.abs(a1 - a0) * r) / 0.5));
    for (let k = 0; k < n; k++) {
      const t0 = a0 + ((a1 - a0) * k) / n,
        t1 = a0 + ((a1 - a0) * (k + 1)) / n;
      line({ x: c.x + Math.cos(t0) * r, z: c.z + Math.sin(t0) * r }, { x: c.x + Math.cos(t1) * r, z: c.z + Math.sin(t1) * r }, w, y);
    }
  };
  const rectOutline = (r: Rect, w: number, y: number) => {
    line({ x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, w, y);
    line({ x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, w, y);
    line({ x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 }, w, y);
    line({ x: r.x0, z: r.z1 }, { x: r.x0, z: r.z0 }, w, y);
  };

  // ── junctions: zebras, stop lines, STOP text, lane arrows, centre manhole
  for (const I of net.intersections) {
    if (I.control === 'portal') continue;
    curBase = ASPH;
    for (const cw of I.crosswalks) {
      const v = DIR_VEC[cw.arm];
      const side = RIGHT(v);
      setPaint(WHITE, 0.5, 0.65);
      const span = ROAD_HALF - 0.3;
      const bw = 0.5,
        gap = 0.5;
      const n = Math.floor((2 * span + gap) / (bw + gap));
      const total = n * bw + (n - 1) * gap;
      for (let k = 0; k < n; k++) {
        const lat = -total / 2 + bw / 2 + k * (bw + gap);
        const a = { x: I.x + v.x * 4.1 + side.x * lat, z: I.z + v.z * 4.1 + side.z * lat };
        const b = { x: I.x + v.x * 6.9 + side.x * lat, z: I.z + v.z * 6.9 + side.z * lat };
        line(a, b, bw);
      }
      stats.zebras++;
    }
    for (const arm of I.arms) {
      const lid = I.inLane[arm];
      if (lid === undefined) continue;
      const v = DIR_VEC[arm];
      const rIn = { x: v.z, z: -v.x }; // right-hand side of traffic arriving along -v
      const P = (al: number, lat: number): P2 => ({ x: I.x + v.x * al + rIn.x * lat, z: I.z + v.z * al + rIn.z * lat });
      const up = { x: -v.x, z: -v.z };
      if (I.control === 'signal' || I.control === 'stop') {
        setPaint(WHITE, 0.35, 0.35);
        line(P(STOPLINE - 0.175, 0.1), P(STOPLINE - 0.175, ROAD_HALF - 0.32), 0.35);
        stats.stopLines++;
      }
      const lane = net.lanes[lid];
      const segLen = lane.length + STOPLINE * 2;
      if (I.control === 'stop' && segLen > 30) {
        setPaint(WHITE, 0.22, 0.3);
        quad(P(10.6, 1.75), up, 2.3, 2.7, yRoad, atlasGlyphs.STOP);
      } else if (I.control === 'signal' && segLen > 34) {
        const turns = new Set(lane.out.map((m) => net.movements[m].turn));
        const key = `arrow${turns.has('straight') ? 'S' : ''}${turns.has('left') ? 'L' : ''}${turns.has('right') ? 'R' : ''}`;
        const g = atlasGlyphs[key];
        if (g) {
          setPaint(WHITE, 0.2, 0.3);
          quad(P(14.5, 1.75), up, 1.15, 4.6, yRoad, g);
        }
      }
      // gully grates just upstream of the crosswalk, both sides
      setPaint(IRON_DARK, 1, 0);
      quad(P(8.3, ROAD_HALF - 0.17), up, 0.34, 0.5, Y.gutter + 0.002, atlasGlyphs.grate);
      stats.decals++;
    }
    if (rng.chance(0.6)) {
      setPaint(IRON, 1, 0);
      quad({ x: I.x + rng.range(-1.5, 1.5), z: I.z + rng.range(-1.5, 1.5) }, { x: 0, z: -1 }, 0.72, 0.72, yRoad, atlasGlyphs.manhole);
      stats.decals++;
    }
  }

  // ── segments: centre lines, manholes, grates, cycle symbols, sidewalk lids
  for (const seg of plan.roadSegments) {
    const Na = plan.roadNodes[seg.a],
      Nb = plan.roadNodes[seg.b];
    const L = Math.hypot(Nb.x - Na.x, Nb.z - Na.z);
    const d = { x: (Nb.x - Na.x) / L, z: (Nb.z - Na.z) / L };
    const r = RIGHT(d);
    const P = (s: number, lat: number): P2 => ({ x: Na.x + d.x * s + r.x * lat, z: Na.z + d.z * s + r.z * lat });
    curBase = ASPH;
    if (!seg.sidewalks) {
      tunnelMarkings(Na.kind === 'portal' ? seg.b : seg.a, Na.kind === 'portal' ? seg.a : seg.b);
      continue;
    }
    const s0 = STOPLINE,
      s1 = L - STOPLINE;
    if (seg.kind === 'avenue') {
      setPaint(WHITE, 0.1, 0.2);
      for (const off of [-0.11, 0.11]) line(P(s0, off), P(s1, off), 0.1);
      stats.dashes += 2;
    } else {
      setPaint(WHITE, 0.12, 0.25);
      const solidLen = 6;
      line(P(s0, 0), P(s0 + solidLen, 0), 0.12);
      line(P(s1 - solidLen, 0), P(s1, 0), 0.12);
      const a = s0 + solidLen + 3,
        b = s1 - solidLen - 3;
      const n = Math.max(1, Math.round((b - a + 3) / 6));
      const step = (b - a) / Math.max(1, n - 1 + 1e-9);
      for (let k = 0; k < n; k++) {
        const c = n === 1 ? (a + b) / 2 : a + step * k;
        line(P(c - 1.5, 0), P(c + 1.5, 0), 0.12);
        stats.dashes++;
      }
    }
    // manholes in the lanes
    const nm = rng.int(1, 2);
    for (let k = 0; k < nm; k++) {
      const s = rng.range(14, L - 14);
      const lat = rng.pick([-1.75, -0.6, 0.6, 1.75]) + rng.range(-0.3, 0.3);
      setPaint(IRON, 1, 0);
      quad(P(s, lat), d, 0.72, 0.72, yRoad, atlasGlyphs.manhole);
      stats.decals++;
    }
    // gully grates mid-block
    for (const sd of [1, -1]) {
      setPaint(IRON_DARK, 1, 0);
      quad(P(L / 2 + rng.range(-6, 6), sd * (ROAD_HALF - 0.17)), d, 0.34, 0.5, Y.gutter + 0.002, atlasGlyphs.grate);
      stats.decals++;
    }
    // cycle symbols on the avenues (both lanes)
    if (seg.kind === 'avenue' && L > 40) {
      setPaint(WHITE, 0.08, 0.35);
      quad(P(L * 0.42, 2.45), d, 1.0, 1.9, yRoad, atlasGlyphs.bike);
      quad(P(L * 0.58, -2.45), { x: -d.x, z: -d.z }, 1.0, 1.9, yRoad, atlasGlyphs.bike);
      stats.decals += 2;
    }
    // utility lids on the sidewalks
    if (rng.chance(0.7)) {
      const sd = rng.chance(0.5) ? 1 : -1;
      setPaint(IRON, 1, 0, C('#b9b3a8'));
      quad(P(rng.range(12, L - 12), sd * rng.range(4.6, 6.0)), d, 0.45, 0.45, Y.walk + 0.003, atlasGlyphs.lid);
      stats.decals++;
    }
  }

  // ── bus stop boxes
  for (const lane of net.lanes) {
    for (const bs of lane.busStops) {
      curBase = ASPH;
      const d = lane.dir;
      const r = RIGHT(d);
      const p0 = lane.path.at(0);
      const s1 = Math.min(lane.length - 0.5, bs.s + 1.5),
        s0 = Math.max(0.5, bs.s - 13);
      // lane centre is at +1.75 from the road centre line
      const P = (s: number, lat: number): P2 => ({ x: p0.x + d.x * s + r.x * (lat - 1.75), z: p0.z + d.z * s + r.z * (lat - 1.75) });
      setPaint(YELLOW, 0.15, 0.3);
      const la = 0.4,
        lb = ROAD_HALF - 0.38;
      line(P(s0, la), P(s1, la), 0.15);
      line(P(s0, lb), P(s1, lb), 0.15);
      line(P(s0, la), P(s0, lb), 0.15);
      line(P(s1, la), P(s1, lb), 0.15);
      setPaint(YELLOW, 0.2, 0.25);
      const sm = (s0 + s1) / 2;
      quad(P(sm - 1.7, (la + lb) / 2), d, 2.0, 2.6, yRoad, atlasGlyphs.BUS);
      quad(P(sm + 1.7, (la + lb) / 2), d, 2.0, 2.6, yRoad, atlasGlyphs.STOP);
      stats.decals++;
    }
  }

  // ── parking stalls
  for (const a of plan.areas) {
    if (a.kind !== 'parking' || !a.stalls) continue;
    curBase = PARK;
    setPaint(WHITE, 0.1, 0.45);
    const seen = new Set<string>();
    for (const st of a.stalls) {
      const ax = { x: Math.sin(st.yaw), z: Math.cos(st.yaw) };
      const bx = RIGHT(ax);
      for (const sd of [-1, 1]) {
        const cx = st.x + bx.x * 1.3 * sd,
          cz = st.z + bx.z * 1.3 * sd;
        const key = `${Math.round(cx * 10)}:${Math.round(cz * 10)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        line({ x: cx - ax.x * 2.4, z: cz - ax.z * 2.4 }, { x: cx + ax.x * 2.4, z: cz + ax.z * 2.4 }, 0.1, yCover);
      }
      stats.stalls++;
    }
  }

  // ── football pitch
  if (info.field) {
    const f = info.field;
    curBase = C('#4f8a2e');
    setPaint(WHITE, 0.12, 0.2);
    const m = 1.2;
    const r: Rect = { x0: f.x0 + m, z0: f.z0 + m, x1: f.x1 - m, z1: f.z1 - m };
    const cx = (r.x0 + r.x1) / 2,
      cz = (r.z0 + r.z1) / 2;
    const W = r.x1 - r.x0;
    rectOutline(r, 0.12, yCover);
    line({ x: r.x0, z: cz }, { x: r.x1, z: cz }, 0.12, yCover);
    arc({ x: cx, z: cz }, 2.6, 0, Math.PI * 2, 0.12, yCover);
    quad({ x: cx, z: cz }, { x: 0, z: -1 }, 0.3, 0.3, yCover, solid);
    for (const end of [-1, 1]) {
      const zg = end < 0 ? r.z0 : r.z1;
      const pbw = Math.min(11, W * 0.5),
        pbd = 3.8,
        gbw = 5.2,
        gbd = 1.4;
      const zp = zg - end * pbd,
        zgb = zg - end * gbd;
      line({ x: cx - pbw / 2, z: zg }, { x: cx - pbw / 2, z: zp }, 0.12, yCover);
      line({ x: cx + pbw / 2, z: zg }, { x: cx + pbw / 2, z: zp }, 0.12, yCover);
      line({ x: cx - pbw / 2, z: zp }, { x: cx + pbw / 2, z: zp }, 0.12, yCover);
      line({ x: cx - gbw / 2, z: zg }, { x: cx - gbw / 2, z: zgb }, 0.12, yCover);
      line({ x: cx + gbw / 2, z: zg }, { x: cx + gbw / 2, z: zgb }, 0.12, yCover);
      line({ x: cx - gbw / 2, z: zgb }, { x: cx + gbw / 2, z: zgb }, 0.12, yCover);
      const spot = { x: cx, z: zg - end * 2.7 };
      quad(spot, { x: 0, z: -1 }, 0.22, 0.22, yCover, solid);
      // penalty arc outside the box
      const a0 = end < 0 ? 0.25 * Math.PI : -0.75 * Math.PI;
      arc(spot, 2.2, a0, a0 + 0.5 * Math.PI, 0.12, yCover);
      // corner arcs
      for (const sx of [-1, 1]) {
        const corner = { x: sx < 0 ? r.x0 : r.x1, z: zg };
        const start = Math.atan2(-end, 0) + (sx < 0 ? 0 : 0);
        void start;
        const ang0 = sx < 0 ? (end < 0 ? 0 : -0.5 * Math.PI) : end < 0 ? 0.5 * Math.PI : Math.PI;
        arc(corner, 0.6, ang0, ang0 + 0.5 * Math.PI, 0.1, yCover);
      }
    }
  }

  // ── school court (basketball) + hopscotch
  if (info.court) {
    const c = info.court;
    curBase = C('#5a4440');
    setPaint(WHITE, 0.1, 0.4);
    const cw = Math.min(22, c.x1 - c.x0 - 1),
      ch = Math.min(13, c.z1 - c.z0 - 1);
    const cx = (c.x0 + c.x1) / 2,
      cz = (c.z0 + c.z1) / 2;
    const r: Rect = { x0: cx - cw / 2, z0: cz - ch / 2, x1: cx + cw / 2, z1: cz + ch / 2 };
    rectOutline(r, 0.1, yCover);
    line({ x: cx, z: r.z0 }, { x: cx, z: r.z1 }, 0.1, yCover);
    arc({ x: cx, z: cz }, 1.8, 0, Math.PI * 2, 0.1, yCover);
    for (const end of [-1, 1]) {
      const xb = end < 0 ? r.x0 : r.x1;
      const kd = 5.2,
        kw = 4.4;
      const xk = xb - end * kd;
      line({ x: xb, z: cz - kw / 2 }, { x: xk, z: cz - kw / 2 }, 0.1, yCover);
      line({ x: xb, z: cz + kw / 2 }, { x: xk, z: cz + kw / 2 }, 0.1, yCover);
      line({ x: xk, z: cz - kw / 2 }, { x: xk, z: cz + kw / 2 }, 0.1, yCover);
      arc({ x: xk, z: cz }, 1.8, end < 0 ? -0.5 * Math.PI : 0.5 * Math.PI, end < 0 ? 0.5 * Math.PI : 1.5 * Math.PI, 0.1, yCover);
      // three-point line
      const r3 = Math.min(6.2, ch / 2 - 0.6);
      const hub = { x: xb - end * 1.4, z: cz };
      const half = Math.asin(Math.min(1, (ch / 2 - 0.6) / r3));
      const base = end < 0 ? 0 : Math.PI;
      arc(hub, r3, base - half, base + half, 0.1, yCover);
    }
    // hopscotch in yellow near the school
    setPaint(YELLOW, 0.08, 0.5);
    const hx = c.x0 + 1.8,
      hz = c.z1 - 1.0;
    const sq = 0.55;
    const cells: [number, number][] = [
      [0, 0],
      [0, 1],
      [-0.5, 2],
      [0.5, 2],
      [0, 3],
      [-0.5, 4],
      [0.5, 4],
      [0, 5],
    ];
    cells.forEach(([ox, oz], k) => {
      const ccx = hx + ox * sq,
        ccz = hz - oz * sq;
      rectOutline({ x0: ccx - sq / 2, z0: ccz - sq / 2, x1: ccx + sq / 2, z1: ccz + sq / 2 }, 0.06, yCover);
      quad({ x: ccx, z: ccz }, { x: 0, z: -1 }, 0.26, 0.36, yCover, atlasGlyphs[`d${k + 1}`]);
    });
  }

  // ── quay safety line
  {
    const q = plan.areas.find((a) => a.kind === 'quay');
    if (q) {
      curBase = C('#7d7a73');
      setPaint(YELLOW, 0.16, 0.35);
      const x = QUAY_X - 1.35;
      line({ x, z: q.rect.z0 + 0.3 }, { x, z: q.rect.z1 - 0.3 }, 0.16, yCover);
    }
  }

  // ── painted extras (v2): schoolyard games, yard loading boxes, quay lane line, coloured bays
  if (!legacy) {
    // filled rectangle (rotation-free), painted
    const fill = (r: Rect, col: THREE.Color, y: number) => {
      setPaint(col, 1, 0.45);
      quad({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 }, { x: 0, z: -1 }, r.x1 - r.x0, r.z1 - r.z0, y, solid);
    };
    // schoolyard: four-square in the south run-off, a target circle in the north one
    if (info.court) {
      const c = info.court;
      const cx = (c.x0 + c.x1) / 2;
      curBase = C('#4b8c5e');
      const fsz = c.z1 - 2.3,
        fsx = cx + 5.5;
      const cols = [C('#d9473f'), C('#2f7fb8'), C('#f2c84b'), C('#3f8f5a')];
      cols.forEach((col, i) => {
        const ox = (i % 2) - 1,
          oz = Math.floor(i / 2) - 1;
        fill({ x0: fsx + ox * 1.2 + 0.05, z0: fsz + oz * 1.2 + 0.05, x1: fsx + (ox + 1) * 1.2 - 0.05, z1: fsz + (oz + 1) * 1.2 - 0.05 }, col, yCover);
      });
      setPaint(WHITE, 0.08, 0.4);
      rectOutline({ x0: fsx - 1.2, z0: fsz - 1.2, x1: fsx + 1.2, z1: fsz + 1.2 }, 0.08, yCover);
      line({ x: fsx, z: fsz - 1.2 }, { x: fsx, z: fsz + 1.2 }, 0.08, yCover);
      line({ x: fsx - 1.2, z: fsz }, { x: fsx + 1.2, z: fsz }, 0.08, yCover);
      const tc = { x: cx - 6, z: c.z0 + 2.2 };
      for (const [r, col] of [
        [1.5, C('#f2c84b')],
        [1.0, C('#d9473f')],
        [0.5, C('#f2efe6')],
      ] as [number, THREE.Color][]) {
        setPaint(col, 0.14, 0.4);
        arc(tc, r, 0, Math.PI * 2, 0.14, yCover);
      }
      // yellow futsal lines around the run-off
      setPaint(YELLOW, 0.1, 0.45);
      rectOutline({ x0: c.x0 + 0.35, z0: c.z0 + 0.35, x1: c.x1 - 0.35, z1: c.z1 - 0.35 }, 0.1, yCover);
    }
    // industrial / harbour yards: yellow hatched keep-clear boxes in front of the loading doors
    for (const lot of plan.lots) {
      if (lot.kind !== 'factory' && lot.kind !== 'warehouse' && lot.kind !== 'depot') continue;
      const blk = plan.blocks[lot.blockId];
      if (!blk || (blk.kind !== 'industrial' && blk.kind !== 'harbor')) continue;
      curBase = C('#6b6a65');
      for (const d of lot.doors) {
        const n = DIR_VEC[d.dir];
        const t = RIGHT(n);
        const W = 4.2,
          D = 5.0;
        const P = (a: number, b: number): P2 => ({ x: d.x + t.x * a + n.x * b, z: d.z + t.z * a + n.z * b });
        // stay on the yard (skip boxes that would reach the sidewalk / road)
        const far = P(0, D + 0.6);
        if (ctx.occupancy.has(far.x, far.z, 1 | 2)) continue;
        setPaint(YELLOW, 0.14, 0.5);
        line(P(-W / 2, 0.4), P(W / 2, 0.4), 0.14, yCover);
        line(P(W / 2, 0.4), P(W / 2, D), 0.14, yCover);
        line(P(W / 2, D), P(-W / 2, D), 0.14, yCover);
        line(P(-W / 2, D), P(-W / 2, 0.4), 0.14, yCover);
        // diagonal hatch, clipped to the box
        for (let k = -6; k <= 6; k++) {
          const a0 = k * 0.9;
          const pts: P2[] = [];
          // segment along (1,1) in (a, b) space through (a0, 0.4)
          const lo = Math.max(-W / 2 - a0, 0.4 - 0.4),
            hi = Math.min(W / 2 - a0, D - 0.4);
          if (hi - lo < 0.3) continue;
          pts.push(P(a0 + lo, 0.4 + lo), P(a0 + hi, 0.4 + hi));
          line(pts[0], pts[1], 0.12, yCover);
        }
        stats.decals++;
      }
    }
    // quay: white dashed lane line along the crane track
    const q = plan.areas.find((a) => a.kind === 'quay');
    if (q) {
      curBase = C('#7d7a73');
      setPaint(WHITE, 0.14, 0.45);
      for (let z = q.rect.z0 + 1; z < q.rect.z1 - 3; z += 4.5) line({ x: 126.75, z }, { x: 126.75, z: z + 2.5 }, 0.14, yCover);
    }
    // car parks: two blue (accessible) and two green (EV) bays painted solid
    for (const a of plan.areas) {
      if (a.kind !== 'parking' || !a.stalls || a.stalls.length < 6) continue;
      curBase = PARK;
      const pickS = [a.stalls[0], a.stalls[1], a.stalls[a.stalls.length - 1], a.stalls[a.stalls.length - 2]];
      pickS.forEach((st, i) => {
        const ax = { x: Math.sin(st.yaw), z: Math.cos(st.yaw) };
        setPaint(i < 2 ? C('#3f6fb0') : C('#3fae5a'), 1, 0.4);
        quad({ x: st.x, z: st.z }, ax, 2.25, 4.6, yCover, solid);
      });
    }
  }

  // ── level crossing approach (tunnel roads)
  function tunnelMarkings(junction: number, portal: number): void {
    const J = plan.roadNodes[junction],
      Pn = plan.roadNodes[portal];
    const sgn = Pn.z < J.z ? -1 : 1;
    const x = J.x;
    curBase = ASPH;
    const zStart = J.z + sgn * (STOPLINE + 0.0);
    const zTunnel = Pn.z - sgn * 6; // markings fade into the bore
    const zA = Math.min(zStart, zTunnel),
      zB = Math.max(zStart, zTunnel);
    // edge lines and a solid centre line
    setPaint(WHITE, 0.12, 0.25);
    line({ x: x - (ROAD_HALF - 0.28), z: J.z + sgn * CORRIDOR_HALF }, { x: x - (ROAD_HALF - 0.28), z: zTunnel }, 0.12);
    line({ x: x + (ROAD_HALF - 0.28), z: J.z + sgn * CORRIDOR_HALF }, { x: x + (ROAD_HALF - 0.28), z: zTunnel }, 0.12);
    for (const off of [-0.11, 0.11]) line({ x: x + off, z: zA }, { x: x + off, z: zB }, 0.1);
    // keep-clear box, stop lines and warning crosses from the lane data
    for (const lc of net.crossings) {
      if (Math.abs(lc.x - x) > 1) continue;
      let k0 = Infinity,
        k1 = -Infinity;
      for (const ln of lc.lanes) {
        const lane = net.lanes[ln.lane];
        const pa = lane.path.at(ln.s0),
          pb = lane.path.at(ln.s1);
        k0 = Math.min(k0, pa.z, pb.z);
        k1 = Math.max(k1, pa.z, pb.z);
        // stop line in front of the stopping point, across the lane
        const ps = lane.path.at(ln.stopS + 0.18);
        const rr = RIGHT(lane.dir);
        setPaint(WHITE, 0.35, 0.3);
        line({ x: ps.x - rr.x * 1.6, z: ps.z - rr.z * 1.6 }, { x: ps.x + rr.x * 1.45, z: ps.z + rr.z * 1.45 }, 0.35);
        // St Andrew's cross well before the stop line (only where the approach is in the open)
        const pw = lane.path.at(ln.stopS - 9);
        const wz = pw.z;
        if ((sgn < 0 && wz > Pn.z + 20) || (sgn > 0 && wz < Pn.z - 20)) {
          setPaint(WHITE, 0.3, 0.3);
          const u = lane.dir;
          const rr2 = RIGHT(u);
          const h = 2.2,
            w = 1.1;
          line({ x: pw.x - rr2.x * w - u.x * h, z: pw.z - rr2.z * w - u.z * h }, { x: pw.x + rr2.x * w + u.x * h, z: pw.z + rr2.z * w + u.z * h }, 0.3);
          line({ x: pw.x + rr2.x * w - u.x * h, z: pw.z + rr2.z * w - u.z * h }, { x: pw.x - rr2.x * w + u.x * h, z: pw.z - rr2.z * w + u.z * h }, 0.3);
          stats.decals++;
        }
      }
      if (k0 < k1) {
        setPaint(YELLOW, 0.14, 0.4);
        const hx = ROAD_HALF - 0.3;
        const box: Rect = { x0: x - hx, z0: k0, x1: x + hx, z1: k1 };
        rectOutline(box, 0.14, yRoad);
        // criss-cross hatching clipped to the box
        const sp = 1.6;
        for (const dir of [1, -1]) {
          for (let c = -20; c <= 20; c++) {
            const off = c * sp;
            // line: (u, w) with u = lateral in [-hx, hx], w = z - k0; u*dir + w = off + const
            const pts: P2[] = [];
            const H = k1 - k0;
            const cands = [
              { u: -hx, w: off + dir * hx },
              { u: hx, w: off - dir * hx },
              { u: (off - 0) * dir, w: 0 },
              { u: (off - H) * dir, w: H },
            ];
            for (const q of cands) if (q.u >= -hx - 1e-6 && q.u <= hx + 1e-6 && q.w >= -1e-6 && q.w <= H + 1e-6) pts.push({ x: x + q.u, z: k0 + q.w });
            if (pts.length >= 2) {
              const [p0, p1] = [pts[0], pts[1]];
              if (Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.3) line(p0, p1, 0.12);
            }
          }
        }
      }
    }
  }

  return { geo: M.build(), stats };
}

export function dirOf(d: Dir): P2 {
  return DIR_VEC[d];
}

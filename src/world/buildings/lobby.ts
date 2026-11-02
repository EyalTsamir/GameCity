// Real ground floors for the downtown towers and offices: a walk-past lobby behind real glass instead of a facade
// shader pane. The room is built from unlit geometry in the `lights` mesh with its lighting baked into vertex colours
// (no new surface program, far cheaper per pixel than the facade it replaces): tiled floor with pools under the
// ceiling lights, stone back wall with a wash, a reception desk, speed gates and a lift bank, columns, seats, plants,
// the firm's name, art. Day: colour x 0.55 (LIGHT_MODE.STEADY); after dusk it comes up as a lit room.
// The joinery (mullions, transom, doors, reveals, canopies) is ordinary trim, so it takes sun and shadow.
//
// ?nolobby3d = the old shader lobby, ?nogroundfit = no stall risers / mullions on the shader bays (core/detailbuildings.ts).

import { shapeOn } from '../../core/sweepshape';
import { anchors } from './anchors';
import * as THREE from 'three';
import type { Builder } from './mesh';
import { Gen, SideGeom, Grid, sx, sz, sideBox, sideQuad, col, shade, setCol, signOnSide, lightBox } from './gen';
import { Rng } from '../../core/rng';
import { LIGHT_MODE } from './materials';
import { letterSign, boardSign } from './signs';
import { GREEN } from './green';
import { GLASS_MIRROR_GLSL, glassMirror } from '../water/glassMirror';
import { bugOn } from '../../core/sweepbugs';

interface Palette {
  floorA: string;
  floorB: string;
  wall: string;
  feature: string;
  desk: string;
  top: string;
  metal: string;
  ceil: string;
  glow: string;
  frame: string;
  slats: boolean;
}

const PALETTES: Palette[] = [
  // warm limestone + walnut slats
  { floorA: '#a89d8a', floorB: '#7f7464', wall: '#b3a993', feature: '#5a3d28', desk: '#6d4a30', top: '#e4ddcf', metal: '#b9b3a6', ceil: '#d9d4c8', glow: '#ffe6bd', frame: '#2c2f33', slats: true },
  // slate + brass
  { floorA: '#5c5f62', floorB: '#4c4f53', wall: '#6c6e70', feature: '#2d3034', desk: '#2b2d31', top: '#b89a5c', metal: '#b89a5c', ceil: '#3c3e42', glow: '#ffd9a0', frame: '#17191c', slats: false },
  // terrazzo + white + oak
  { floorA: '#b9b4a8', floorB: '#8f8a7e', wall: '#b9b5aa', feature: '#a97f50', desk: '#c9c4b6', top: '#a97f50', metal: '#c3c7ca', ceil: '#c9c6bd', glow: '#fff2dc', frame: '#9aa0a6', slats: true },
  // green marble + bronze (deco)
  { floorA: '#3f5148', floorB: '#d1c9b4', wall: '#ab9f85', feature: '#2f4238', desk: '#3a4a40', top: '#8d6b3c', metal: '#8d6b3c', ceil: '#d6cdb6', glow: '#ffdca6', frame: '#3a2c1c', slats: false },
];

const FIRMS = ['MERIDIAN TRUST', 'NORTHGATE CAPITAL', 'HARBOUR MUTUAL', 'LUMEN & CO', 'ATLAS INSURANCE', 'OSPREY PARTNERS', 'CASTELLAN', 'HAVEN TELECOM', 'BEACON HOUSE', 'WESTBROOK & SONS'];

const FLOOR_Y = 0.16;
let firmIdx = 0;
/** every lobby gets its own firm, in lot order */
export function resetLobbies(): void {
  firmIdx = 0;
}
const TILE = 1.2;

export interface LobbyOpts {
  a: number;
  b: number;
  /** glass head (m), the facade continues above it */
  head: number;
  doors: number[];
  masonry: boolean;
  tall: boolean;
  arcade: boolean;
  name?: string;
  /** index into PALETTES (default: by building type and seed) */
  palette?: number;
  /** false: the caller builds its own entrance canopy */
  canopy?: boolean;
}

/** Span of the side kept open for the real lobby, around door u (null when the side is too short). */
export function lobbySpan(L: number, u: number): { a: number; b: number } | null {
  if (L < 9) return null;
  const half = Math.min(7.2, L * 0.36);
  let a = u - half,
    b = u + half;
  if (a < 0.5) {
    b = Math.min(L - 0.5, b + (0.5 - a));
    a = 0.5;
  }
  if (b > L - 0.5) {
    a = Math.max(0.5, a - (b - (L - 0.5)));
    b = L - 0.5;
  }
  return { a, b };
}

const tmp = new THREE.Color();
const hex = (h: string, k = 1): THREE.Color => tmp.set(h).clone().multiplyScalar(k);

export function realLobby(g: Gen, sg: SideGeom, o: LobbyOpts): void {
  const l = g.lights,
    t = g.trim,
    gl = g.glass;
  const seed = g.seed;
  const P = PALETTES[o.palette ?? (o.masonry ? (seed % 2 === 0 ? 3 : 0) : [1, 2, 0, 1][seed % 4])];
  const { a, b, head } = o;
  const w = b - a;
  const GL = -0.32; // glass line
  const dep = Math.min(7, Math.max(4.4, Math.min(g.W, g.D) * 0.3));
  const back = GL - dep;
  const main = o.doors[0];
  const revolve = o.tall;
  const X = (u: number, oo: number) => sx(sg, u, oo);
  const Z = (u: number, oo: number) => sz(sg, u, oo);
  l.L[0] = LIGHT_MODE.STEADY;
  l.L[1] = 0;
  l.L[2] = 0;
  l.L[3] = 1.05;

  // ceiling lights (panels or pendants): the floor pools are baked from these
  const nP = Math.max(2, Math.round(w / 3));
  const lightsAt: { u: number; o: number }[] = [];
  for (let i = 0; i < nP; i++) for (const oo of [GL - dep * 0.3, GL - dep * 0.72]) lightsAt.push({ u: a + ((i + 0.5) * w) / nP, o: oo });
  const pool = (u: number, oo: number): number => {
    let s = 0;
    for (const p of lightsAt) {
      const d2 = (u - p.u) * (u - p.u) + (oo - p.o) * (oo - p.o);
      s += Math.exp(-d2 / 2.2);
    }
    return Math.min(1.3, 0.72 + 0.5 * s);
  };
  const vq = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, c: THREE.Color, ka: number, kb: number, kc: number, kd: number) => {
    const v = (x: number, y: number, z: number, k: number) => {
      l.setRGB(c.r * k, c.g * k, c.b * k);
      return l.vertex(x, y, z, 0, 1, 0);
    };
    const i = v(ax, ay, az, ka);
    v(bx, by, bz, kb);
    v(cx, cy, cz, kc);
    v(dx, dy, dz, kd);
    l.tri(i, i + 1, i + 2);
    l.tri(i, i + 2, i + 3);
  };

  // ── floor: tiles with bevel-dark joints (a gap between the quads shows the darker bed)
  setCol(l, hex(P.floorB, 0.35));
  l.quad(X(a, GL), FLOOR_Y - 0.004, Z(a, GL), X(b, GL), FLOOR_Y - 0.004, Z(b, GL), X(b, back), FLOOR_Y - 0.004, Z(b, back), X(a, back), FLOOR_Y - 0.004, Z(a, back));
  const nu = Math.max(1, Math.round(w / TILE)),
    nv = Math.max(1, Math.round(dep / TILE));
  const tu = w / nu,
    tv = dep / nv;
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const u0 = a + i * tu + 0.008,
        u1 = a + (i + 1) * tu - 0.008,
        o0 = GL - j * tv - 0.008,
        o1 = GL - (j + 1) * tv + 0.008;
      const c = hex((i + j) % 2 === 0 ? P.floorA : P.floorB, 0.94 + (((i * 7 + j * 13 + seed) % 5) / 4) * 0.12);
      vq(X(u0, o0), FLOOR_Y, Z(u0, o0), X(u1, o0), FLOOR_Y, Z(u1, o0), X(u1, o1), FLOOR_Y, Z(u1, o1), X(u0, o1), FLOOR_Y, Z(u0, o1), c, pool(u0, o0), pool(u1, o0), pool(u1, o1), pool(u0, o1));
    }

  // ── ceiling + lights
  const ceilC = hex(P.ceil, 0.7);
  vq(X(a, back), head, Z(a, back), X(b, back), head, Z(b, back), X(b, GL), head, Z(b, GL), X(a, GL), head, Z(a, GL), ceilC, 0.8, 0.8, 1.05, 1.05);
  const pendants = (seed >>> 2) % 2 === 0;
  for (const p of lightsAt) {
    if (pendants) {
      setCol(l, hex(P.metal, 0.5));
      const rod = 0.012;
      l.box(X(p.u, p.o) - rod, head - 0.85, Z(p.u, p.o) - rod, X(p.u, p.o) + rod, head, Z(p.u, p.o) + rod, 0b110011);
      const sv = l.L[3];
      l.L[3] = 4.5;
      setCol(l, hex(P.glow));
      l.sphere(X(p.u, p.o), head - 0.98, Z(p.u, p.o), 0.17, 8, 5);
      l.L[3] = sv;
    } else {
      const sv = l.L[3];
      l.L[3] = 3.4;
      setCol(l, hex(P.glow));
      sideBox(l, sg, p.u - 0.75, p.u + 0.75, p.o - 0.16, p.o + 0.16, head - 0.03, head - 0.005, true, true);
      l.L[3] = sv;
    }
  }

  // ── back wall: stone panels with a wash from above; side walls the same, plainer
  const wallC = hex(P.wall);
  const panelW = 1.5;
  const npw = Math.max(1, Math.round(w / panelW));
  const nph = 3;
  for (let i = 0; i < npw; i++)
    for (let j = 0; j < nph; j++) {
      const u0 = a + (i * w) / npw + 0.007,
        u1 = a + ((i + 1) * w) / npw - 0.007;
      const y0 = FLOOR_Y + (j * (head - FLOOR_Y)) / nph + 0.007,
        y1 = FLOOR_Y + ((j + 1) * (head - FLOOR_Y)) / nph - 0.007;
      const v = 0.92 + (((i * 5 + j * 11 + seed) % 7) / 6) * 0.14;
      const k0 = (0.7 + (0.5 * (y0 - FLOOR_Y)) / head) * v,
        k1 = (0.7 + (0.5 * (y1 - FLOOR_Y)) / head) * v;
      vq(X(u0, back), y0, Z(u0, back), X(u1, back), y0, Z(u1, back), X(u1, back), y1, Z(u1, back), X(u0, back), y1, Z(u0, back), wallC, k0, k0, k1, k1);
    }
  vq(X(a, GL), FLOOR_Y, Z(a, GL), X(a, back), FLOOR_Y, Z(a, back), X(a, back), head, Z(a, back), X(a, GL), head, Z(a, GL), wallC, 0.62, 0.62, 0.95, 0.95);
  vq(X(b, back), FLOOR_Y, Z(b, back), X(b, GL), FLOOR_Y, Z(b, GL), X(b, GL), head, Z(b, GL), X(b, back), head, Z(b, back), wallC, 0.62, 0.62, 0.95, 0.95);

  // skirting + a dark inlay border round the floor, so the room has edges
  setCol(l, hex(P.feature, 0.8));
  sideBox(l, sg, a, b, back, back + 0.025, FLOOR_Y, FLOOR_Y + 0.14);
  sideBox(l, sg, a, a + 0.025, back, GL, FLOOR_Y, FLOOR_Y + 0.14, false, true);
  sideBox(l, sg, b - 0.025, b, back, GL, FLOOR_Y, FLOOR_Y + 0.14, false, true);
  setCol(l, hex(P.feature, 0.65));
  sideBox(l, sg, a + 0.02, b - 0.02, back + 0.02, back + 0.32, FLOOR_Y, FLOOR_Y + 0.004);
  sideBox(l, sg, a + 0.02, a + 0.32, back + 0.32, GL - 0.02, FLOOR_Y, FLOOR_Y + 0.004);
  sideBox(l, sg, b - 0.32, b - 0.02, back + 0.32, GL - 0.02, FLOOR_Y, FLOOR_Y + 0.004);
  // side walls: a tall panel of the feature finish and a framed picture on each, a sconce either side of it
  const artC = g.atlas.add(`lobart:${seed % 5}`, 96, 72, abstractArt(seed % 5));
  for (const sideU of [a, b]) {
    const dir = sideU === a ? 1 : -1;
    const oc = (GL + back) / 2;
    const hw = Math.min(1.5, dep * 0.3);
    setCol(l, hex(P.feature, 1.15));
    sideBox(l, sg, Math.min(sideU, sideU + dir * 0.03), Math.max(sideU, sideU + dir * 0.03), oc - hw, oc + hw, FLOOR_Y + 0.14, head - 0.35, false, true);
    const uu = sideU + dir * 0.035;
    const yA = 1.25,
      yB = Math.min(head - 0.7, 2.75);
    const pw = Math.min(hw - 0.25, ((yB - yA) * 96) / 72 / 2);
    const s = g.signs;
    setCol(l, hex(P.metal, 0.75));
    sideBox(l, sg, Math.min(uu - dir * 0.008, uu), Math.max(uu - dir * 0.008, uu), oc - pw - 0.04, oc + pw + 0.04, yA - 0.04, yB + 0.04, false, true);
    if (dir > 0) s.quad(X(uu + 0.003, oc + pw), yA, Z(uu + 0.003, oc + pw), X(uu + 0.003, oc - pw), yA, Z(uu + 0.003, oc - pw), X(uu + 0.003, oc - pw), yB, Z(uu + 0.003, oc - pw), X(uu + 0.003, oc + pw), yB, Z(uu + 0.003, oc + pw), artC.u0, artC.v0, artC.u1, artC.v0, artC.u1, artC.v1, artC.u0, artC.v1);
    else s.quad(X(uu - 0.003, oc - pw), yA, Z(uu - 0.003, oc - pw), X(uu - 0.003, oc + pw), yA, Z(uu - 0.003, oc + pw), X(uu - 0.003, oc + pw), yB, Z(uu - 0.003, oc + pw), X(uu - 0.003, oc - pw), yB, Z(uu - 0.003, oc - pw), artC.u0, artC.v0, artC.u1, artC.v0, artC.u1, artC.v1, artC.u0, artC.v1);
    const svs = l.L[3];
    l.L[3] = 3;
    setCol(l, hex(P.glow, 0.9));
    for (const so of [oc - hw - 0.22, oc + hw + 0.22]) sideBox(l, sg, Math.min(uu, uu + dir * 0.05), Math.max(uu, uu + dir * 0.05), so - 0.05, so + 0.05, 1.7, 2.2, true, true);
    l.L[3] = svs;
  }

  // ── layout: desk and feature wall on the far side from the door, lifts behind the gates on the door side
  const uc = (a + b) / 2;
  const dSide = main <= uc ? 1 : -1;
  const featW = Math.min(w * 0.46, 6.2);
  const featC = dSide > 0 ? b - featW / 2 - 0.7 : a + featW / 2 + 0.7;
  const liftW = Math.min(w - featW - 1.8, 5.6);
  const liftC = dSide > 0 ? a + liftW / 2 + 0.7 : b - liftW / 2 - 0.7;

  // feature wall
  setCol(l, hex(P.feature, 1.0));
  sideBox(l, sg, featC - featW / 2, featC + featW / 2, back, back + 0.06, FLOOR_Y, head);
  if (P.slats) {
    const n = Math.round(featW / 0.13);
    for (let i = 0; i < n; i++) {
      setCol(l, hex(P.feature, 1.25 + ((i * 7 + seed) % 5) * 0.08));
      const u = featC - featW / 2 + (i + 0.5) * (featW / n);
      sideBox(l, sg, u - 0.042, u + 0.042, back + 0.06, back + 0.11, FLOOR_Y, head);
    }
  } else {
    // veined stone slabs book-matched by a bright joint, a lit shelf at the head
    setCol(l, hex(P.metal, 1.1));
    for (const k of [-0.5, -0.17, 0.17, 0.5]) sideBox(l, sg, featC + k * featW - 0.012, featC + k * featW + 0.012, back + 0.06, back + 0.075, FLOOR_Y, head);
  }
  const sv0 = l.L[3];
  l.L[3] = 3.2;
  setCol(l, hex(P.glow, 0.9));
  sideBox(l, sg, featC - featW / 2, featC + featW / 2, back + 0.06, back + 0.2, head - 0.05, head - 0.015, true);
  l.L[3] = sv0;
  // the firm's name on it
  const firm = o.name ?? FIRMS[firmIdx++ % FIRMS.length];
  const key = `lob:${firm}`;
  const nameFg = P.slats ? '#f4efe4' : '#e8cf9a';
  const rr = g.atlas.add(key, 320, 44, letterSign(firm, nameFg, '#ffe9c4', undefined, 1, '#000000'));
  const nw = Math.min(featW * 0.74, firm.length * 0.3);
  const ny = Math.min(head - 0.75, 2.75);
  signOnSide(g, sg, featC - nw / 2, featC + nw / 2, back + 0.125, ny, ny + (nw * 44) / 320, rr);

  // reception desk: stone front with a lit kick, overhanging top, rounded ends, monitors
  const dW = Math.min(featW * 0.8, 4.6);
  const dO = back + 2.05;
  const dY = FLOOR_Y + 1.08;
  const dC = hex(P.desk, 1.05);
  setCol(l, dC);
  sideBox(l, sg, featC - dW / 2, featC + dW / 2, dO - 0.42, dO + 0.42, FLOOR_Y + 0.1, dY, false, true);
  for (const end of [featC - dW / 2, featC + dW / 2]) l.cylinder(X(end, dO), Z(end, dO), 0.42, FLOOR_Y + 0.1, dY, 12, false);
  // reeded front
  setCol(l, shade(dC, 1.14));
  const nr = Math.round(dW / 0.22);
  for (let i = 0; i < nr; i++) {
    const u = featC - dW / 2 + (i + 0.5) * (dW / nr);
    sideBox(l, sg, u - 0.055, u + 0.055, dO + 0.42, dO + 0.46, FLOOR_Y + 0.14, dY - 0.05);
  }
  const svk = l.L[3];
  l.L[3] = 3.0;
  setCol(l, hex(P.glow, 0.85));
  sideBox(l, sg, featC - dW / 2 - 0.3, featC + dW / 2 + 0.3, dO + 0.34, dO + 0.4, FLOOR_Y + 0.02, FLOOR_Y + 0.1);
  l.L[3] = svk;
  setCol(l, hex(P.top, 1.1));
  sideBox(l, sg, featC - dW / 2, featC + dW / 2, dO - 0.5, dO + 0.54, dY, dY + 0.05, true, true);
  for (const end of [featC - dW / 2, featC + dW / 2]) l.cylinder(X(end, dO), Z(end, dO), 0.5, dY, dY + 0.05, 12, true);
  setCol(l, hex('#1c1f22', 1));
  for (const du of [-dW * 0.24, dW * 0.22]) {
    sideBox(l, sg, featC + du - 0.26, featC + du + 0.26, dO - 0.2, dO - 0.17, dY + 0.13, dY + 0.45);
    sideBox(l, sg, featC + du - 0.03, featC + du + 0.03, dO - 0.22, dO - 0.18, dY + 0.05, dY + 0.13);
  }
  // back of the screens catch nothing: a small desk lamp glows beside them
  const svl = l.L[3];
  l.L[3] = 4;
  setCol(l, hex(P.glow));
  l.sphere(X(featC, dO - 0.05), dY + 0.34, Z(featC, dO - 0.05), 0.09, 6, 4);
  l.L[3] = svl;
  setCol(l, hex(P.metal, 0.8));
  l.cylinder(X(featC, dO - 0.05), Z(featC, dO - 0.05), 0.012, dY + 0.05, dY + 0.28, 4, false);
  // staff chair back behind the desk
  setCol(l, hex('#26282b'));
  sideBox(l, sg, featC - dW * 0.24 - 0.22, featC - dW * 0.24 + 0.22, dO - 0.92, dO - 0.84, FLOOR_Y + 0.55, FLOOR_Y + 1.15, false, true);

  // lift bank: steel doors in stone portals, floor indicators, a call panel
  if (liftW > 2.2) {
    const nL = Math.min(3, Math.floor(liftW / 1.75));
    const lw = liftW / nL;
    const dH = Math.min(2.5, head - 0.7);
    for (let i = 0; i < nL; i++) {
      const u = liftC - liftW / 2 + (i + 0.5) * lw;
      setCol(l, hex(P.feature, 1.1));
      sideBox(l, sg, u - 0.72, u + 0.72, back, back + 0.05, FLOOR_Y, FLOOR_Y + dH + 0.14);
      const st = hex('#a7adb2');
      vq(X(u - 0.6, back + 0.06), FLOOR_Y, Z(u - 0.6, back + 0.06), X(u - 0.008, back + 0.06), FLOOR_Y, Z(u - 0.008, back + 0.06), X(u - 0.008, back + 0.06), FLOOR_Y + dH, Z(u - 0.008, back + 0.06), X(u - 0.6, back + 0.06), FLOOR_Y + dH, Z(u - 0.6, back + 0.06), st, 0.55, 0.62, 1.0, 0.9);
      vq(X(u + 0.008, back + 0.06), FLOOR_Y, Z(u + 0.008, back + 0.06), X(u + 0.6, back + 0.06), FLOOR_Y, Z(u + 0.6, back + 0.06), X(u + 0.6, back + 0.06), FLOOR_Y + dH, Z(u + 0.6, back + 0.06), X(u + 0.008, back + 0.06), FLOOR_Y + dH, Z(u + 0.008, back + 0.06), st, 0.62, 0.55, 0.9, 1.0);
      const svp = l.L[3];
      l.L[3] = 5;
      setCol(l, '#ffb65a');
      sideBox(l, sg, u - 0.14, u + 0.14, back + 0.05, back + 0.07, FLOOR_Y + dH + 0.02, FLOOR_Y + dH + 0.1);
      l.L[3] = svp;
      setCol(l, hex('#22262a'));
      sideBox(l, sg, u + 0.8, u + 0.88, back, back + 0.03, 1.2, 1.5);
    }
    // speed gates in front of the lifts: low stainless pedestals with glass flaps
    const gO = back + Math.min(2.4, dep * 0.45);
    const gu0 = liftC - liftW / 2 + 0.2;
    const nG = Math.max(2, Math.floor((liftW - 0.4) / 0.95));
    for (let i = 0; i <= nG; i++) {
      const u = gu0 + (i * (liftW - 0.4)) / nG;
      setCol(l, hex('#6f757a'));
      sideBox(l, sg, u - 0.05, u + 0.05, gO - 0.55, gO + 0.55, FLOOR_Y, FLOOR_Y + 0.92, false, true);
      const svg = l.L[3];
      l.L[3] = 3;
      setCol(l, i % 2 ? '#7dffb0' : '#9ad0ff');
      sideBox(l, sg, u - 0.03, u + 0.03, gO + 0.38, gO + 0.5, FLOOR_Y + 0.92, FLOOR_Y + 0.93);
      l.L[3] = svg;
      if (i < nG) {
        gl.quad(X(u + 0.07, gO), FLOOR_Y + 0.3, Z(u + 0.07, gO), X(u + 0.42, gO), FLOOR_Y + 0.3, Z(u + 0.42, gO), X(u + 0.42, gO), FLOOR_Y + 1.1, Z(u + 0.42, gO), X(u + 0.07, gO), FLOOR_Y + 1.1, Z(u + 0.07, gO));
      }
    }
  }

  // two round columns between the door side and the desk
  const colOs = GL - dep * 0.42;
  const nCol = w > 11 ? 2 : 1;
  for (let i = 0; i < nCol; i++) {
    const u = a + ((i + 1) * w) / (nCol + 1);
    const cu = Math.abs(u - main) < 1.6 ? u + (u > main ? 1.2 : -1.2) : u;
    const cc = hex(P.wall, 0.92);
    setCol(l, cc);
    l.cylinder(X(cu, colOs), Z(cu, colOs), 0.24, FLOOR_Y, head, 14, false);
    setCol(l, hex(P.metal, 1.1));
    l.cylinder(X(cu, colOs), Z(cu, colOs), 0.28, FLOOR_Y, FLOOR_Y + 0.12, 14, true);
    l.cylinder(X(cu, colOs), Z(cu, colOs), 0.28, head - 0.12, head, 14, false);
  }

  // seating by the glass on the far side from the door, a low table + rug; plants in the corners
  const sU = dSide > 0 ? b - 2.2 : a + 2.2;
  const sO = GL - 1.2;
  setCol(l, hex(P.floorB, 0.55));
  sideBox(l, sg, sU - 1.55, sU + 1.55, sO - 1.1, sO + 0.8, FLOOR_Y, FLOOR_Y + 0.012);
  const sofa = hex(['#3a4652', '#6b3f2f', '#46534a', '#54504a'][seed % 4]);
  setCol(l, sofa);
  sideBox(l, sg, sU - 1.2, sU + 1.2, sO - 1.0, sO - 0.25, FLOOR_Y + 0.16, FLOOR_Y + 0.44, false, true);
  sideBox(l, sg, sU - 1.2, sU + 1.2, sO - 1.0, sO - 0.8, FLOOR_Y + 0.44, FLOOR_Y + 0.82, false, true);
  setCol(l, shade(sofa, 1.25));
  sideBox(l, sg, sU - 1.16, sU - 0.02, sO - 0.8, sO - 0.27, FLOOR_Y + 0.44, FLOOR_Y + 0.52, false, true);
  sideBox(l, sg, sU + 0.02, sU + 1.16, sO - 0.8, sO - 0.27, FLOOR_Y + 0.44, FLOOR_Y + 0.52, false, true);
  setCol(l, hex(P.top));
  l.cylinder(X(sU, sO + 0.28), Z(sU, sO + 0.28), 0.42, FLOOR_Y + 0.36, FLOOR_Y + 0.41, 12, true);
  setCol(l, hex(P.metal, 0.7));
  l.cylinder(X(sU, sO + 0.28), Z(sU, sO + 0.28), 0.03, FLOOR_Y, FLOOR_Y + 0.36, 5, false);
  const potU = [a + 0.65, b - 0.65];
  for (const u of potU) {
    const oo = back + 0.7;
    setCol(l, hex('#3c3e40', 1.1));
    l.cylinder(X(u, oo), Z(u, oo), 0.3, FLOOR_Y, FLOOR_Y + 0.62, 10, true, 0.36);
    g.green.clump(X(u, oo), FLOOR_Y + 0.6, Z(u, oo), 0.55, 1.5, GREEN.SHRUB, 3);
  }
  const oo2 = GL - 0.55;
  const pu = dSide > 0 ? b - 0.5 : a + 0.5;
  setCol(l, hex('#3c3e40', 1.1));
  l.cylinder(X(pu, oo2), Z(pu, oo2), 0.26, FLOOR_Y, FLOOR_Y + 0.55, 10, true, 0.3);
  g.green.clump(X(pu, oo2), FLOOR_Y + 0.53, Z(pu, oo2), 0.45, 1.2, GREEN.GRASS, 3);

  if (liftW <= 2.2) signOnSide(g, sg, liftC - 0.9, liftC + 0.9, back + 0.05, 1.5, 2.85, artC);

  // ── joinery of the glass line (trim: takes sun and shadow)
  const fC = col(P.frame);
  const fC2 = shade(fC, 1.25);
  const stone = col(o.masonry ? '#8f8778' : '#54575a');
  const dW2 = revolve ? 1.45 : 1.25; // half width of the door gap
  const doorGaps = o.doors.map((u) => [u - dW2, u + dW2] as const);
  // threshold and jambs of the opening
  setCol(t, shade(stone, 0.8));
  sideBox(t, sg, a, b, GL, 0.0, 0.0, FLOOR_Y + 0.002);
  setCol(t, stone);
  for (const [u0, u1] of [[a - 0.22, a], [b, b + 0.22]] as const) {
    sideBox(t, sg, u0, u1, GL - 0.02, 0.05, 0, head + 0.12, false, true);
  }
  setCol(t, shade(stone, 0.72));
  sideBox(t, sg, a, b, GL - 0.02, 0.0, head - 0.14, head, true);
  // soffit downlights in the reveal
  for (const u of [a + 1.4, uc, b - 1.4]) lightBox(g, X(u, GL * 0.5) - 0.05, head - 0.15, Z(u, GL * 0.5) - 0.05, X(u, GL * 0.5) + 0.05, head - 0.138, Z(u, GL * 0.5) + 0.05, '#fff1d6', LIGHT_MODE.STEADY, 3.5);
  // transom over the full width, and the fanlight bars above it
  const trY = Math.min(2.95, head - 0.7);
  setCol(t, fC);
  sideBox(t, sg, a, b, GL - 0.06, GL + 0.06, trY, trY + 0.1, true, true);
  sideBox(t, sg, a, b, GL - 0.04, GL + 0.05, FLOOR_Y, FLOOR_Y + 0.12);
  sideBox(t, sg, a, b, GL - 0.04, GL + 0.05, head - 0.2, head - 0.14, true, true);
  // mullions (bay spacing about 1.7 m, always one at each door gap)
  const stops: number[] = [a, b];
  for (const [u0, u1] of doorGaps) stops.push(u0, u1);
  stops.sort((p, q) => p - q);
  const inGap = (u: number) => doorGaps.some(([u0, u1]) => u > u0 + 1e-3 && u < u1 - 1e-3);
  const addPane = (u0: number, u1: number, y0: number, y1: number) => {
    if (u1 - u0 < 0.05) return;
    gl.quad(X(u0, GL), y0, Z(u0, GL), X(u1, GL), y0, Z(u1, GL), X(u1, GL), y1, Z(u1, GL), X(u0, GL), y1, Z(u0, GL));
  };
  for (let i = 0; i + 1 < stops.length; i++) {
    const s0 = stops[i],
      s1 = stops[i + 1];
    const m = (s0 + s1) / 2;
    const n = inGap(m) ? 1 : Math.max(1, Math.round((s1 - s0) / 1.7));
    for (let k = 0; k <= n; k++) {
      const u = s0 + (k * (s1 - s0)) / n;
      if (inGap(u)) continue;
      setCol(t, fC);
      sideBox(t, sg, u - 0.035, u + 0.035, GL - 0.09, GL + 0.07, FLOOR_Y, head - 0.14, false, true);
      setCol(t, fC2);
      sideBox(t, sg, u - 0.012, u + 0.012, GL + 0.07, GL + 0.1, FLOOR_Y + 0.12, head - 0.2);
    }
    if (!inGap(m)) addPane(s0, s1, FLOOR_Y + 0.12, trY);
    addPane(s0, s1, trY + 0.1, head - 0.2);
  }

  // ── doors
  for (const u of o.doors) {
    if (revolve && u === main) revolving(g, sg, u, GL, trY, fC, P);
    else glassDoors(g, sg, u, GL, trY, fC, P);
    g.doorsBuilt++;
  }

  if (o.canopy !== false) canopy(g, sg, o, GL, main, P);
}

/** Pair of frameless-look glass leaves with long pull handles and a floor mat. */
function glassDoors(g: Gen, sg: SideGeom, u: number, GL: number, trY: number, fC: THREE.Color, P: Palette): void {
  const t = g.trim,
    gl = g.glass;
  const X = (uu: number, o: number) => sx(sg, uu, o);
  const Z = (uu: number, o: number) => sz(sg, uu, o);
  const hw = 1.25;
  for (const [u0, u1] of [[u - hw, u - 0.012], [u + 0.012, u + hw]] as const) {
    gl.quad(X(u0, GL), FLOOR_Y + 0.02, Z(u0, GL), X(u1, GL), FLOOR_Y + 0.02, Z(u1, GL), X(u1, GL), trY, Z(u1, GL), X(u0, GL), trY, Z(u0, GL));
    setCol(t, fC);
    sideBox(t, sg, u0, u1, GL - 0.03, GL + 0.03, FLOOR_Y + 0.02, FLOOR_Y + 0.12, false, true);
    sideBox(t, sg, u0, u1, GL - 0.03, GL + 0.03, trY - 0.07, trY, false, true);
    sideBox(t, sg, u0, u0 + 0.05, GL - 0.03, GL + 0.03, FLOOR_Y + 0.12, trY - 0.07, false, true);
    sideBox(t, sg, u1 - 0.05, u1, GL - 0.03, GL + 0.03, FLOOR_Y + 0.12, trY - 0.07, false, true);
  }
  setCol(t, col(P.metal));
  for (const hu of [u - 0.16, u + 0.16]) {
    t.cylinder(X(hu, GL + 0.09), Z(hu, GL + 0.09), 0.018, 0.85, 2.05, 6, true);
    for (const yy of [1.0, 1.9]) sideBox(t, sg, hu - 0.012, hu + 0.012, GL + 0.03, GL + 0.09, yy, yy + 0.02);
  }
  const hf = anchors.handFrame(sg, u - hw);
  if (hf) anchors.handSpots.push({ ...hf, kind: 'lobby', w: hw * 2, h: trY, y: 0, o: GL, color: col(P.metal).getHex(), seed: g.seed });
  // recessed mat in the threshold
  setCol(t, col('#2a2b2c'));
  sideBox(t, sg, u - hw + 0.1, u + hw - 0.1, GL + 0.02, -0.04, 0, FLOOR_Y + 0.006);
}

/** Revolving door: glass drum half inside the lobby, four glass wings on a centre post, drum head and base ring. */
function revolving(g: Gen, sg: SideGeom, u: number, GL: number, trY: number, fC: THREE.Color, P: Palette): void {
  const t = g.trim,
    gl = g.glass;
  const r = 1.38;
  const oc = GL - 0.98;
  const cx = sx(sg, u, oc),
    cz = sz(sg, u, oc);
  const yT = Math.max(trY, 2.7);
  const yB = FLOOR_Y + 0.015;
  // the drum: two curved glass cheeks with the door openings between them (u side open)
  const N = 22;
  const ang0 = Math.atan2(sg.nz, sg.nx);
  for (const [a0, a1] of [[0.62, Math.PI - 0.62], [Math.PI + 0.62, 2 * Math.PI - 0.62]] as const) {
    for (let i = 0; i < N / 2; i++) {
      const t0 = a0 + ((a1 - a0) * i) / (N / 2),
        t1 = a0 + ((a1 - a0) * (i + 1)) / (N / 2);
      const p0 = ang0 + t0 - Math.PI / 2,
        p1 = ang0 + t1 - Math.PI / 2;
      const x0 = cx + Math.cos(p0) * r,
        z0 = cz + Math.sin(p0) * r,
        x1 = cx + Math.cos(p1) * r,
        z1 = cz + Math.sin(p1) * r;
      gl.vertex(x0, yB, z0, Math.cos(p0), 0, Math.sin(p0));
      const b = gl.nv - 1;
      gl.vertex(x1, yB, z1, Math.cos(p1), 0, Math.sin(p1));
      gl.vertex(x1, yT, z1, Math.cos(p1), 0, Math.sin(p1));
      gl.vertex(x0, yT, z0, Math.cos(p0), 0, Math.sin(p0));
      gl.tri(b, b + 1, b + 2);
      gl.tri(b, b + 2, b + 3);
    }
  }
  setCol(t, fC);
  // drum head + base
  t.cylinder(cx, cz, r + 0.06, yT, yT + 0.2, 24, true);
  t.cylinder(cx, cz, r + 0.03, FLOOR_Y, yB + 0.02, 24, true);
  // end posts at the openings
  for (const a of [0.62, Math.PI - 0.62, Math.PI + 0.62, 2 * Math.PI - 0.62]) {
    const p = ang0 + a - Math.PI / 2;
    t.cylinder(cx + Math.cos(p) * r, cz + Math.sin(p) * r, 0.035, yB, yT, 6, false);
  }
  // centre post + four wings
  setCol(t, col(P.metal));
  t.cylinder(cx, cz, 0.045, yB, yT, 8, false);
  for (let k = 0; k < 4; k++) {
    const a = ang0 + 0.5 + (k * Math.PI) / 2;
    const ex = cx + Math.cos(a) * (r - 0.05),
      ez = cz + Math.sin(a) * (r - 0.05);
    gl.quad(cx, yB + 0.04, cz, ex, yB + 0.04, ez, ex, yT - 0.04, ez, cx, yT - 0.04, cz);
    setCol(t, fC);
    t.beam(cx, yB + 0.05, cz, ex, yB + 0.05, ez, 0.04, 0.05);
    t.beam(cx, yT - 0.05, cz, ex, yT - 0.05, ez, 0.04, 0.05);
    t.beam(ex, yB, ez, ex, yT, ez, 0.04, 0.04);
    setCol(t, col(P.metal));
    // the push bar runs the whole wing, post to edge: over clear glass a short one hung in the air (?norevolvebar)
    const bar0 = bugOn('revolvebar') ? 0 : 0.55;
    t.beam(cx + (ex - cx) * bar0, 1.05, cz + (ez - cz) * bar0, ex, 1.05, ez, 0.022, 0.022);
  }
  // a glow in the drum head at night
  lightBox(g, cx - 0.3, yT - 0.01, cz - 0.3, cx + 0.3, yT, cz + 0.3, '#fff1d6', LIGHT_MODE.STEADY, 3.5);
}

/** One of four entrance canopies, chosen per building so the street does not march one module. */
function canopy(g: Gen, sg: SideGeom, o: LobbyOpts, GL: number, u: number, P: Palette): void {
  const t = g.trim;
  const X = (uu: number, oo: number) => sx(sg, uu, oo);
  const Z = (uu: number, oo: number) => sz(sg, uu, oo);
  const y = Math.min(o.head + 0.02, 3.9);
  const hw = 2.4;
  const cd = o.arcade ? 0.8 : 1.45;
  const kind = o.masonry ? (g.seed % 2 === 0 ? 3 : 2) : (g.seed >>> 1) % 3;
  if (kind === 0) {
    // steel blade: tapered wedge on two outriggers with tie rods, lit edge
    setCol(t, col('#2e353c'));
    sideBox(t, sg, u - hw, u + hw, 0, cd, y, y + 0.14, true);
    setCol(t, col('#9aa1a7'));
    sideBox(t, sg, u - hw - 0.03, u + hw + 0.03, cd - 0.04, cd + 0.015, y - 0.02, y + 0.17, true);
    if (!o.arcade) for (const ru of [u - 1.9, u + 1.9]) {
      t.beam(X(ru, cd - 0.06), y + 0.14, Z(ru, cd - 0.06), X(ru, 0.02), y + 0.95, Z(ru, 0.02), 0.028, 0.028);
      setCol(t, col('#7d848a'));
      sideBox(t, sg, ru - 0.07, ru + 0.07, 0, 0.03, y + 0.82, y + 1.05);
      setCol(t, col('#9aa1a7'));
    }
    for (const lu of [u - 1.5, u - 0.5, u + 0.5, u + 1.5]) lightBox(g, X(lu, cd * 0.55) - 0.09, y - 0.012, Z(lu, cd * 0.55) - 0.09, X(lu, cd * 0.55) + 0.09, y, Z(lu, cd * 0.55) + 0.09, '#fff1d6', LIGHT_MODE.STEADY, 3.5);
  } else if (kind === 1) {
    // glass canopy on tapered steel arms and a spine
    const gl = g.glass;
    setCol(t, col('#c6ccd1'));
    sideBox(t, sg, u - hw - 0.1, u + hw + 0.1, 0.0, 0.1, y, y + 0.16, true);
    const nA = 4;
    for (let k = 0; k <= nA; k++) {
      const ru = u - hw + (2 * hw * k) / nA;
      t.beam(X(ru, 0.08), y + 0.06, Z(ru, 0.08), X(ru, cd), y + 0.2, Z(ru, cd), 0.05, 0.08);
      t.beam(X(ru, cd * 0.62), y + 0.14, Z(ru, cd * 0.62), X(ru, 0.02), y + 0.95, Z(ru, 0.02), 0.022, 0.022);
    }
    sideBox(t, sg, u - hw, u + hw, cd - 0.03, cd + 0.03, y + 0.17, y + 0.23, true, true);
    gl.quad(X(u - hw, cd), y + 0.235, Z(u - hw, cd), X(u + hw, cd), y + 0.235, Z(u + hw, cd), X(u + hw, 0.05), y + 0.1, Z(u + hw, 0.05), X(u - hw, 0.05), y + 0.1, Z(u - hw, 0.05));
    gl.quad(X(u - hw, 0.05), y + 0.1, Z(u - hw, 0.05), X(u + hw, 0.05), y + 0.1, Z(u + hw, 0.05), X(u + hw, cd), y + 0.235, Z(u + hw, cd), X(u - hw, cd), y + 0.235, Z(u - hw, cd));
    for (const lu of [u - 1.2, u, u + 1.2]) lightBox(g, X(lu, 0.1) - 0.06, y - 0.02, Z(lu, 0.1) - 0.06, X(lu, 0.1) + 0.06, y, Z(lu, 0.1) + 0.06, '#fff1d6', LIGHT_MODE.STEADY, 3.5);
  } else if (kind === 2) {
    // bronze marquee: a deep box with a lit soffit, the fascia carries the number
    const fas = col(P.frame === '#2c2f33' ? '#4d4030' : '#3a2c1c');
    setCol(t, fas);
    sideBox(t, sg, u - hw, u + hw, 0, cd, y, y + 0.55, true);
    setCol(t, col('#b08d55'));
    sideBox(t, sg, u - hw - 0.02, u + hw + 0.02, cd, cd + 0.02, y + 0.03, y + 0.07);
    sideBox(t, sg, u - hw - 0.02, u + hw + 0.02, cd, cd + 0.02, y + 0.48, y + 0.52);
    const num = 2 + (g.seed % 47) * 2;
    const nr = g.atlas.add(`tnum2:${num}`, 96, 40, boardSign(String(num), { bg: '#3a2c1c', fg: '#e8cf9a', font: 'Georgia, serif', weight: '600', glow: 0.9, glowColor: '#ffdca6' }));
    signOnSide(g, sg, u - 0.42, u + 0.42, cd + 0.025, y + 0.11, y + 0.44, nr);
    lightBox(g, X(u - hw + 0.2, cd - 0.3), y - 0.01, Z(u - hw + 0.2, cd - 0.3), X(u + hw - 0.2, cd - 0.15), y, Z(u + hw - 0.2, cd - 0.15), '#ffe0b0', LIGHT_MODE.STEADY, 3);
    lightBox(g, Math.min(X(u - hw + 0.2, 0.3), X(u + hw - 0.2, 0.45)), y - 0.01, Math.min(Z(u - hw + 0.2, 0.3), Z(u + hw - 0.2, 0.45)), Math.max(X(u - hw + 0.2, 0.3), X(u + hw - 0.2, 0.45)), y, Math.max(Z(u - hw + 0.2, 0.3), Z(u + hw - 0.2, 0.45)), '#ffe0b0', LIGHT_MODE.STEADY, 3);
  } else {
    // stone portal: pilasters, entablature with a dentil course, no canopy at all
    const st = col('#b5ab96');
    setCol(t, st);
    const pa = u - hw - 0.1,
      pb = u + hw + 0.1;
    const po = 0.22;
    for (const [p0, p1] of [[pa - 0.5, pa], [pb, pb + 0.5]] as const) {
      sideBox(t, sg, p0 - 0.05, p1 + 0.05, 0, po + 0.05, 0, 0.5);
      sideBox(t, sg, p0, p1, 0, po, 0.5, y + 0.22);
      setCol(t, shade(st, 0.72));
      for (const k of [0.25, 0.5, 0.75]) sideBox(t, sg, p0 + (p1 - p0) * k - 0.02, p0 + (p1 - p0) * k + 0.02, po, po + 0.008, 0.62, y);
      setCol(t, st);
      sideBox(t, sg, p0 - 0.06, p1 + 0.06, 0, po + 0.05, y + 0.22, y + 0.34, true);
    }
    setCol(t, shade(st, 0.95));
    sideBox(t, sg, pa - 0.56, pb + 0.56, 0, po + 0.05, y + 0.34, y + 0.5, true);
    setCol(t, shade(st, 0.85));
    const n = Math.round((pb - pa + 1.1) / 0.24);
    for (let i = 0; i < n; i++) {
      const du = pa - 0.5 + ((i + 0.5) * (pb - pa + 1.0)) / n;
      sideBox(t, sg, du - 0.05, du + 0.05, po + 0.05, po + 0.11, y + 0.5, y + 0.57, true);
    }
    setCol(t, st);
    sideBox(t, sg, pa - 0.62, pb + 0.62, 0, po + 0.13, y + 0.57, y + 0.68, true);
    // two bronze lanterns on the pilasters
    for (const lu of [pa - 0.25, pb + 0.25]) {
      setCol(t, col('#3a2c1c'));
      sideBox(t, sg, lu - 0.03, lu + 0.03, po, po + 0.16, 3.0, 3.05);
      lightBox(g, X(lu, po + 0.16) - 0.09, 2.62, Z(lu, po + 0.16) - 0.09, X(lu, po + 0.16) + 0.09, 3.0, Z(lu, po + 0.16) + 0.09, '#ffd59a', LIGHT_MODE.STEADY, 3.2);
    }
  }
  void GL;
}

function abstractArt(v: number): (c: CanvasRenderingContext2D, w: number, h: number, glow: boolean) => void {
  const pal = [
    ['#d9c7a6', '#2f4858', '#c8553d', '#f0ead6'],
    ['#22313f', '#e0b04a', '#7a9e9f', '#e8e4d9'],
    ['#7c3a2d', '#e6c79c', '#2b2b2b', '#a9b8a0'],
    ['#efe6d5', '#3d5a6c', '#d98e04', '#70433b'],
    ['#2c3e50', '#bfa98f', '#8e3b46', '#f2efe9'],
  ][v];
  return (c, w, h, glow) => {
    // the glow canvas holds the same picture, dimmed: the sconces light it after dusk
    c.fillStyle = pal[0];
    c.fillRect(0, 0, w, h);
    c.fillStyle = pal[1];
    c.fillRect(w * 0.08, h * 0.12, w * 0.52, h * 0.5);
    c.fillStyle = pal[2];
    c.beginPath();
    c.arc(w * 0.68, h * 0.58, h * 0.28, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = pal[3];
    c.fillRect(w * 0.2, h * 0.7, w * 0.44, h * 0.14);
    if (glow) {
      c.fillStyle = 'rgba(0,0,0,0.72)';
      c.fillRect(0, 0, w, h);
    }
  };
}

/** Joinery of the shader bays beside a lobby: stall riser, real mullions, transom, head, an up-down light on some piers. */
export function groundFit(g: Gen, sg: SideGeom, a: number, b: number, gr: Grid, gH: number, frame: string, stone: string, lit: boolean): void {
  const t = g.trim;
  const fC = col(frame);
  const sC = col(stone);
  const yH = gH - 0.76;
  const yT = Math.min(yH - 0.5, 3.2);
  // riser and cap
  setCol(t, sC);
  sideBox(t, sg, a, b, 0, 0.05, 0, 0.56);
  setCol(t, shade(sC, 1.18));
  sideBox(t, sg, a, b, 0, 0.075, 0.56, 0.6, true);
  // head rail + transom
  setCol(t, fC);
  sideBox(t, sg, a, b, 0, 0.05, yH, gH - 0.54, true);
  sideBox(t, sg, a, b, 0, 0.04, yT, yT + 0.08, true);
  for (let k = 0; k <= gr.n; k++) {
    const u = gr.u0 + k * gr.cw;
    setCol(t, fC);
    sideBox(t, sg, Math.max(a, u - 0.1), Math.min(b, u + 0.1), 0, 0.06, 0.6, yH);
    setCol(t, shade(fC, 1.5));
    sideBox(t, sg, Math.max(a, u - 0.018), Math.min(b, u + 0.018), 0.06, 0.08, 0.6, yH);
    if (lit && k % 2 === 1 && k < gr.n) {
      setCol(t, shade(fC, 0.7));
      sideBox(t, sg, u - 0.045, u + 0.045, 0.06, 0.11, 2.45, 2.75);
      const X = sx(sg, u, 0.085),
        Z = sz(sg, u, 0.085);
      lightBox(g, X - 0.03, 2.42, Z - 0.03, X + 0.03, 2.45, Z + 0.03, '#ffe6bd', LIGHT_MODE.STEADY, 4);
      lightBox(g, X - 0.03, 2.75, Z - 0.03, X + 0.03, 2.78, Z + 0.03, '#ffe6bd', LIGHT_MODE.STEADY, 4);
    }
  }
}

/** Arcade soffit: beams from each column back to the wall and a lantern in every other bay. */
export function arcadeSoffit(g: Gen, sg: SideGeom, n: number, gH: number, c: THREE.Color): void {
  const t = g.trim;
  setCol(t, shade(c, 0.62));
  for (let k = 0; k <= n; k++) {
    const u = (sg.L * k) / n;
    sideBox(t, sg, Math.max(0, u - 0.18), Math.min(sg.L, u + 0.18), -1.6, -0.1, gH - 0.42, gH, true, true);
  }
  // beam along the column line
  sideBox(t, sg, 0, sg.L, -0.62, -0.1, gH - 0.28, gH, true, true);
  for (let k = 0; k < n; k += 2) {
    const u = ((k + 0.5) * sg.L) / n;
    const X = sx(sg, u, -0.95),
      Z = sz(sg, u, -0.95);
    setCol(t, col('#22262a'));
    t.cylinder(X, Z, 0.012, gH - 0.95, gH, 4, false);
    t.cylinder(X, Z, 0.17, gH - 1.0, gH - 0.95, 8, true, 0.07);
    lightBox(g, X - 0.11, gH - 1.32, Z - 0.11, X + 0.11, gH - 1.0, Z + 0.11, '#ffd59a', LIGHT_MODE.STEADY, 3.4);
    setCol(t, col('#22262a'));
    t.cylinder(X, Z, 0.13, gH - 1.36, gH - 1.32, 8, true);
  }
}

/** Real glass: a thin sheet that mirrors sky / street at grazing angles and tints a little head-on. */
export function createGlassMaterial(u: { uSkyZen: { value: THREE.Color }; uSkyHor: { value: THREE.Color }; uCityCol: { value: THREE.Color }; uGround: { value: THREE.Color } }): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    name: 'buildings-glass',
    transparent: true,
    depthWrite: false,
    uniforms: { uSkyZen: u.uSkyZen, uSkyHor: u.uSkyHor, uCityCol: u.uCityCol, uGround: u.uGround, ...glassMirror },
    vertexShader: /* glsl */ `
varying vec3 vW;
varying vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uSkyZen;
uniform vec3 uSkyHor;
uniform vec3 uCityCol;
uniform vec3 uGround;
varying vec3 vW;
varying vec3 vN;
${GLASS_MIRROR_GLSL}
void main() {
  vec3 V = normalize(cameraPosition - vW);
  vec3 N = normalize(vN);
  float c = clamp(dot(N, V), 0.0, 1.0);
  float F = 0.05 + 0.95 * pow(1.0 - c, 4.0);
  vec3 R = reflect(-V, N);
  // sky above a skyline of the city opposite, pavement below
  float h = R.y;
  vec3 env = mix(mix(uGround * 1.6, uCityCol * 1.8, smoothstep(-0.12, 0.02, h)), mix(uSkyHor, uSkyZen, smoothstep(0.2, 0.8, h)), smoothstep(0.1, 0.24, h));
  float al = clamp(F * 0.9 + 0.015, 0.0, 0.34);
  // the real street, while the mirror is on this plane: stronger where what it shows is bright, so a lit lobby still reads through a dark street at night
  vec4 gm;
  float gk = bhGlassMirror(vW, N, vec2(0.0), 0.0, mix(uSkyHor, uSkyZen, smoothstep(0.0, 0.6, R.y)), gm);
  env = mix(env, gm.rgb, gk);
  al = mix(al, max(al, min(0.3, 0.05 + 0.35 * dot(gm.rgb, vec3(0.2126, 0.7152, 0.0722)))), gk);
  gl_FragColor = vec4(min(env, vec3(1.2)), al);
}`,
  });
  return m;
}

/** Poster for the kiosk wall: a newspaper bill or the ice-cream menu. Dim at night, lit by the hatch. */
function kioskBill(lines: string[], bg: string, fg: string, serif: boolean) {
  return (c: CanvasRenderingContext2D, w: number, h: number, glow: boolean): void => {
    c.fillStyle = glow ? '#000' : bg;
    c.fillRect(0, 0, w, h);
    if (glow) return;
    c.fillStyle = fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((tx, i) => {
      const size = Math.min((h / n) * 0.72, (w / Math.max(4, tx.length)) * 1.5);
      c.font = `bold ${Math.round(size)}px ${serif ? 'Georgia, serif' : '"Trebuchet MS", sans-serif'}`;
      c.fillText(tx, w / 2, ((i + 0.5) * h) / n);
    });
  };
}

/**
 * The inside of a kiosk behind an open hatch [a, b] x [y0, y1]: shelves full of magazines and a coffee machine, or tubs of
 * ice cream under a glass with cones behind; a shopkeeper, a ceiling light. Unlit geometry in the lights mesh, baked like
 * the lobbies: no new surface program, and fewer facade pixels.
 */
export function kioskRoom(g: Gen, sg: SideGeom, a: number, b: number, y0: number, y1: number, dep: number, ice: boolean, trimC: THREE.Color): void {
  const l = g.lights,
    t = g.trim;
  const r = new Rng((Math.floor(g.seed * 41) ^ 0x51ed27) >>> 0 || 3);
  const X = (u: number, o: number): number => sx(sg, u, o);
  const Z = (u: number, o: number): number => sz(sg, u, o);
  const yF = y0 - 0.12,
    yC = y1 + 0.12;
  const uA = a - 0.3,
    uB = b + 0.3,
    uc = (a + b) / 2;
  const wallC = ice ? hex('#f3c9d3') : hex('#b79f78');
  l.L[0] = LIGHT_MODE.STEADY;
  l.L[1] = 0;
  l.L[2] = 0;
  l.L[3] = 1.05;
  // walls and ceiling, seen from inside (the lower part of the back wall is darker: the light is overhead)
  const inner = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, rx: number, ry: number, rz: number): void => l.quadAway(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, rx, ry, rz);
  l.setColor(wallC.clone().multiplyScalar(0.72));
  sideQuad(l, sg, uA, uB, -dep, yF - 0.3, y0 + 0.35);
  l.setColor(wallC);
  sideQuad(l, sg, uA, uB, -dep, y0 + 0.35, yC);
  for (const [u, sign] of [[uA, -1], [uB, 1]] as const) {
    l.setColor(wallC.clone().multiplyScalar(0.85));
    inner(X(u, 0), yF - 0.3, Z(u, 0), X(u, -dep), yF - 0.3, Z(u, -dep), X(u, -dep), yC, Z(u, -dep), X(u, 0), yC, Z(u, 0), X(u + sign * 3, -1), y0, Z(u + sign * 3, -1));
  }
  l.setColor(hex(ice ? '#fff4ea' : '#f0e2c4', 0.92));
  inner(X(uA, 0), yC, Z(uA, 0), X(uB, 0), yC, Z(uB, 0), X(uB, -dep), yC, Z(uB, -dep), X(uA, -dep), yC, Z(uA, -dep), X(uc, -1), yC + 3, Z(uc, -1));
  l.setColor(hex('#4b4238'));
  inner(X(uA, 0), yF - 0.3, Z(uA, 0), X(uB, 0), yF - 0.3, Z(uB, 0), X(uB, -dep), yF - 0.3, Z(uB, -dep), X(uA, -dep), yF - 0.3, Z(uA, -dep), X(uc, -1), yF - 3, Z(uc, -1));
  // the light itself
  {
    const sv = l.L[3];
    l.L[3] = 4.5;
    l.setColor(hex('#ffe9c4'));
    sideBox(l, sg, uc - 0.5, uc + 0.5, -dep * 0.55, -dep * 0.35, yC - 0.035, yC, true);
    l.L[3] = sv;
  }
  // counter inside the hatch, in trim like the sill outside
  setCol(t, trimC);
  sideBox(t, sg, a - 0.3, b + 0.3, -0.42, 0, y0 - 0.07, y0 + 0.01, false, true);
  setCol(t, shade(trimC, 0.82));
  sideBox(t, sg, a - 0.04, a, -0.12, 0.03, y0, y1);
  sideBox(t, sg, b, b + 0.04, -0.12, 0.03, y0, y1);
  sideBox(t, sg, a - 0.04, b + 0.04, -0.12, 0.03, y1, y1 + 0.05, true);
  // the keeper, at the counter
  const su = a + (b - a) * (r.chance(0.5) ? 0.34 : 0.62);
  const so = -0.78;
  const skin = hex(r.pick(['#d9a782', '#a8714a', '#6e4a31', '#e6b898']));
  const shirt = hex(ice ? '#f7f3ec' : r.pick(['#44637a', '#6d3f3a', '#4c5a44']));
  const cx = X(su, so),
    cz = Z(su, so);
  l.setColor(shirt);
  l.cylinder(cx, cz, 0.17, yF - 0.2, y0 + 0.42, 8, false, 0.2);
  l.setColor(hex(ice ? '#ff8fab' : '#2f5d50'));
  sideBox(l, sg, su - 0.14, su + 0.14, so + 0.16, so + 0.205, yF - 0.2, y0 + 0.22);
  l.setColor(shirt.clone().multiplyScalar(0.92));
  for (const k of [-1, 1]) {
    const ax = X(su + k * 0.23, so),
      az = Z(su + k * 0.23, so),
      bx = X(su + k * 0.17, so + 0.24),
      bz = Z(su + k * 0.17, so + 0.24);
    l.beam(ax, y0 + 0.36, az, bx, y0 + 0.04, bz, 0.09, 0.09);
  }
  if (shapeOn('shapekiosk')) {
    // shoulders over the arms and a neck, so the head sits on someone; a face; a paper cap or hair
    l.setColor(shirt);
    for (const k of [-1, 1]) l.sphere(X(su + k * 0.17, so), y0 + 0.36, Z(su + k * 0.17, so), 0.082, 10, 7);
    l.sphere(cx, y0 + 0.4, cz, 0.15, 12, 6);
    if (ice) {
      l.setColor(hex('#ff8fab'));
      for (const k of [-1, 1]) sideBox(l, sg, su + k * 0.09 - 0.012, su + k * 0.09 + 0.012, so + 0.13, so + 0.16, y0 + 0.2, y0 + 0.5);
    }
    l.setColor(skin);
    l.cylinder(cx, cz, 0.052, y0 + 0.46, y0 + 0.58, 10, false, 0.046);
    l.sphere(cx, y0 + 0.655, cz, 0.105, 14, 10);
    l.sphere(X(su, so + 0.104), y0 + 0.645, Z(su, so + 0.104), 0.016, 6, 4);
    for (const k of [-1, 1]) l.sphere(X(su + k * 0.098, so), y0 + 0.65, Z(su + k * 0.098, so), 0.022, 6, 4);
    for (const k of [-1, 1]) l.sphere(X(su + k * 0.17, so + 0.27), y0 + 0.05, Z(su + k * 0.17, so + 0.27), 0.05, 10, 7);
    l.setColor(hex('#2a2320'));
    for (const k of [-1, 1]) l.sphere(X(su + k * 0.038, so + 0.095), y0 + 0.672, Z(su + k * 0.038, so + 0.095), 0.0105, 6, 4);
    l.setColor(skin.clone().multiplyScalar(0.62));
    sideBox(l, sg, su - 0.026, su + 0.026, so + 0.088, so + 0.1, y0 + 0.602, y0 + 0.61);
    if (ice) {
      l.setColor(hex('#ffffff'));
      l.cylinder(cx, cz, 0.104, y0 + 0.715, y0 + 0.79, 14, true, 0.112);
    } else {
      l.setColor(hex(r.pick(['#2a221c', '#5a3d25', '#8d8a84'])));
      l.sphere(X(su, so - 0.016), y0 + 0.685, Z(su, so - 0.016), 0.103, 14, 7);
    }
  } else {
    l.setColor(skin);
    l.sphere(cx, y0 + 0.62, cz, 0.115, 8, 6);
    for (const k of [-1, 1]) l.sphere(X(su + k * 0.17, so + 0.27), y0 + 0.05, Z(su + k * 0.17, so + 0.27), 0.05, 5, 4);
    l.setColor(hex(ice ? '#ffffff' : r.pick(['#2a221c', '#5a3d25', '#8d8a84'])));
    l.sphere(X(su, so - 0.015), y0 + 0.66, Z(su, so - 0.015), 0.112, 8, 4);
  }

  if (ice) {
    // back wall: shelf of cones, sundae glasses, the menu; the freezer under its glass at the counter
    const yS = y0 + 0.5;
    l.setColor(hex('#b98a5a'));
    sideBox(l, sg, a, b, -dep, -dep + 0.2, yS - 0.04, yS, true);
    for (let k = 0; k < 7; k++) {
      const u = a + 0.22 + k * 0.3;
      if (u > b - 0.15) break;
      l.setColor(hex('#d9a35b'));
      const px = X(u, -dep + 0.1),
        pz = Z(u, -dep + 0.1);
      const coneSides = shapeOn('shapekiosk') ? 12 : 6;
      for (let j = 0; j < 2; j++) l.cone(px, pz, 0.05, yS + 0.24 + j * 0.05, yS + j * 0.05, coneSides);
    }
    const flav = ['#fff1c9', '#ff9ccf', '#a8e6cf', '#6b4226', '#f6ee8c', '#b8d67a', '#d94f70', '#f5f0e6'];
    // the menu: a cream board, a coloured scoop and a dark line of writing per flavour
    const mU = su > uc ? a + 0.62 : b - 0.62;
    const yM = Math.min(yC - 0.08, y0 + 1.1);
    l.setColor(hex('#7a2f4a'));
    sideBox(l, sg, mU - 0.42, mU + 0.42, -dep, -dep + 0.02, yM - 0.3, yM);
    l.setColor(hex('#fff6e8', 1.1));
    sideQuad(l, sg, mU - 0.39, mU + 0.39, -dep + 0.021, yM - 0.27, yM - 0.03);
    for (let k = 0; k < 6; k++) {
      const u = mU - 0.36 + (k % 2) * 0.39;
      const y = yM - 0.09 - Math.floor(k / 2) * 0.075;
      l.setColor(hex(flav[k]));
      sideQuad(l, sg, u, u + 0.045, -dep + 0.024, y - 0.022, y + 0.022);
      l.setColor(hex('#6d5a52'));
      sideQuad(l, sg, u + 0.07, u + 0.31, -dep + 0.024, y - 0.008, y + 0.008);
    }
    const n = Math.floor((b - a - 0.1) / 0.2);
    l.setColor(hex('#cfd6da'));
    sideBox(l, sg, a, b, -0.4, -0.02, y0 + 0.01, y0 + 0.025);
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < n; k++) {
        const u = a + 0.15 + k * 0.2;
        const o = -0.31 + row * 0.19;
        const fc = flav[(k * 3 + row * 5) % flav.length];
        if (shapeOn('shapekiosk')) {
          // a steel tub in the counter, the ice cream mounded and worked with the paddle, not a ball
          l.setColor(hex('#aeb6ba'));
          sideBox(l, sg, u - 0.088, u + 0.088, o - 0.082, o + 0.082, y0 + 0.025, y0 + 0.04, true);
          l.setColor(hex(fc, 1.05));
          sideBox(l, sg, u - 0.076, u + 0.076, o - 0.07, o + 0.07, y0 + 0.04, y0 + 0.05, true);
          l.setColor(hex(fc, 1.15));
          l.sphere(X(u - 0.015, o + 0.01), y0 + 0.052, Z(u - 0.015, o + 0.01), 0.058, 12, 7);
          l.sphere(X(u + 0.032, o - 0.022), y0 + 0.05, Z(u + 0.032, o - 0.022), 0.04, 10, 6);
          if ((k + row) % 3 === 0) {
            l.setColor(hex('#d7dcdf'));
            l.beam(X(u + 0.05, o + 0.03), y0 + 0.07, Z(u + 0.05, o + 0.03), X(u + 0.075, o + 0.075), y0 + 0.17, Z(u + 0.075, o + 0.075), 0.012, 0.006);
          }
        } else {
          l.setColor(hex(fc, 1.15));
          l.sphere(X(u, o), y0 + 0.05, Z(u, o), 0.08, 6, 3);
        }
      }
    }
    // sneeze glass
    const G = g.glass;
    G.quad(X(a, 0.02), y0 + 0.02, Z(a, 0.02), X(b, 0.02), y0 + 0.02, Z(b, 0.02), X(b, -0.3), y0 + 0.34, Z(b, -0.3), X(a, -0.3), y0 + 0.34, Z(a, -0.3));
    // cone-stand and napkins on the sill
    setCol(t, col('#f4f4f2'));
    t.cylinder(X(a + 0.25, 0.09), Z(a + 0.25, 0.09), 0.05, y0 + 0.01, y0 + 0.1, 6, true);
  } else {
    // three shelves of magazines, faces out, each with its masthead
    const covers = ['#e63946', '#457b9d', '#e9c46a', '#2a9d8f', '#f4a261', '#8d6cab', '#f1f1ec', '#2b2d42', '#d65db1', '#ffb703'];
    const dark = hex('#5a4128');
    for (let row = 0; row < 3; row++) {
      const yS = y0 + 0.1 + row * 0.42;
      if (yS + 0.3 > yC) break;
      l.setColor(dark);
      sideBox(l, sg, uA + 0.04, uB - 0.04, -dep, -dep + 0.16, yS - 0.03, yS, true);
      const oo = -dep + 0.15;
      let u = uA + 0.1;
      while (u < uB - 0.32) {
        const w = 0.2 + r.next() * 0.05;
        const c = hex(r.pick(covers));
        l.setColor(c);
        sideQuad(l, sg, u, u + w, oo, yS, yS + 0.3);
        l.setColor(c.clone().multiplyScalar(0.5).addScalar(0.45));
        sideQuad(l, sg, u + 0.02, u + w - 0.02, oo + 0.002, yS + 0.23, yS + 0.28);
        l.setColor(c.clone().multiplyScalar(0.72));
        sideQuad(l, sg, u + 0.03, u + w - 0.03, oo + 0.002, yS + 0.05, yS + 0.18);
        u += w + 0.03;
      }
    }
    // coffee machine on the far end of the counter, cups, a jar of sweets, a stack of papers
    const mu = su > uc ? a + 0.32 : b - 0.32;
    setCol(t, col('#a9adb0'));
    sideBox(t, sg, mu - 0.24, mu + 0.24, -0.42, -0.14, y0 + 0.01, y0 + 0.14, false, true);
    setCol(t, col('#7c2a22'));
    sideBox(t, sg, mu - 0.24, mu + 0.24, -0.42, -0.2, y0 + 0.14, y0 + 0.4, false, true);
    setCol(t, col('#c9ccce'));
    sideBox(t, sg, mu - 0.24, mu + 0.24, -0.42, -0.14, y0 + 0.4, y0 + 0.47, false, true);
    setCol(t, col('#26282a'));
    for (const k of [-0.09, 0.09]) sideBox(t, sg, mu + k - 0.025, mu + k + 0.025, -0.2, -0.13, y0 + 0.2, y0 + 0.25);
    setCol(t, col('#f4f2ec'));
    for (let k = 0; k < 3; k++) t.cylinder(X(mu - 0.14 + k * 0.14, -0.28), Z(mu - 0.14 + k * 0.14, -0.28), 0.03, y0 + 0.47, y0 + 0.53, 6, true, 0.038);
    const pa = su > uc ? uc - 0.3 : uc + 0.05;
    for (let k = 0; k < 2; k++) {
      setCol(t, col('#e3dfd2'));
      sideBox(t, sg, pa + k * 0.33, pa + k * 0.33 + 0.28, -0.1, 0.17, y0 + 0.01, y0 + 0.07 + k * 0.02);
      setCol(t, col('#23252a'));
      sideBox(t, sg, pa + k * 0.33 + 0.03, pa + k * 0.33 + 0.25, 0.03, 0.14, y0 + 0.07 + k * 0.02, y0 + 0.072 + k * 0.02);
    }
    // bills on the wall under the counter
    const b1 = g.atlas.add('kiosk:bill1', 128, 96, kioskBill(['HAVEN', 'POST', 'Ferry late'], '#f4efe2', '#1d1d1f', true));
    const b2 = g.atlas.add('kiosk:bill2', 128, 96, kioskBill(['FIREWORKS', 'SATURDAY'], '#f6e36d', '#1d1d1f', false));
    signOnSide(g, sg, uc - 1.0, uc - 0.2, 0.012, 0.42, 0.92, b1);
    signOnSide(g, sg, uc + 0.2, uc + 1.0, 0.012, 0.42, 0.92, b2);
  }
  // a warm strip under the hatch head for the evening
  lightBox(g, X(a + 0.1, -0.1), y1 - 0.02, Z(a + 0.1, -0.1), X(b - 0.1, -0.08), y1, Z(b - 0.1, -0.08), '#ffe6b8', LIGHT_MODE.STEADY, 2.4);
}

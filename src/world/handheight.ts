// Module "handheight" (close-up round, docs/progress/close-hand.md): what the eye checks when it stands close to a building,
// on every building, by one system. The generators note every door, wall, lamp and pipe (buildings/anchors.ts); this module
// decides by the kind of building what belongs there and writes it into the near-detail bubble: nothing built or drawn from
// afar, one program per layer. Four layers: large things, the ring that shows at hand size, what only shows from a metre, and
// the stains: dirt where hands go, runs under vents, a multiply pass with no light of its own.
// Switches (core/closehand.ts): ?nohand all; ?nohanddoors ?nohandlamps ?nohandpipes ?nohandwalls ?nohandstains; layers ?nohandBig ?nohandMid ?nohandFine ?nohandStain.

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { closeHand } from '../core/closehand';
import { nearDither, nearOf, nearRandom, nearRadiusFor } from '../core/nearDetail';
import { globalUniforms } from '../core/uniforms';
import { OCC } from '../core/occupancy';
import { SIDEWALK_Y } from '../core/constants';
import type { BuildingKind, Lot } from '../core/plan';
import { patchLampMaterial } from './lamps/integrate';
import type { BuildingsService, HandDoor, HandPipe, HandWall } from './buildings/anchors';
import { WALLPAT } from './buildings/materials';
import { makeCloseTiles } from './closemat/textures';
import { propSpots } from './lettering/spots';
import { HandSink, handStandIn } from './handheight/sink';
import * as D from './handheight/doors';
import * as W from './handheight/walls';

type Draw = (s: HandSink) => void;
const BIG = 0,
  MID = 1,
  FINE = 2,
  STAIN = 3;

const BIG_R = 42;
const LAYERS = [
  { name: 'handBig', radius: BIG_R, cell: 28, top: 9 },
  { name: 'handMid', radius: nearRadiusFor(0.022), cell: 16, top: 5 },
  { name: 'handFine', radius: nearRadiusFor(0.008), cell: 8, top: 3.5 },
  { name: 'handStain', radius: nearRadiusFor(0.03), cell: 16, top: 5 },
];

/** one surface program: the colour's alpha carries the surface (sink.ts), a shared grain tile breaks up the factory finish */
function handMaterial(grain: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 });
  m.name = 'handheight';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHandGrain = { value: grain };
    sh.uniforms.uLights = globalUniforms.uLights;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vHandP;\nvarying vec3 vHandN;\nvarying vec2 vHandS;`)
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
  vColor = vec4(pow(color.rgb, vec3(2.2)), 1.0);
  vHandS = color.a > 0.995 ? vec2(0.1, 2.0) : color.a >= 0.5 ? vec2((color.a - 0.5) / 0.48, 1.0) : vec2(color.a / 0.48, 0.0);
  vHandP = position;
  vHandN = normal;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uHandGrain;\nuniform float uLights;\nvarying vec3 vHandP;\nvarying vec3 vHandN;\nvarying vec2 vHandS;\nfloat handTile;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  { vec3 an = abs(vHandN);
    vec2 tuv = an.y > 0.7 ? vHandP.xz : an.x > 0.7 ? vHandP.zy : vHandP.xy;
    handTile = texture2D(uHandGrain, tuv * 2.3).r;
    diffuseColor.rgb *= vHandS.y > 1.5 ? 0.3 + 0.5 * uLights : mix(0.8 + 0.4 * handTile, 0.9 + 0.2 * handTile, vHandS.y);
    // coir and rough cloth: a coarse tile, deep in between the fibres
    if (vHandS.x > 0.97 && vHandS.y < 0.5) { float c2 = texture2D(uHandGrain, tuv * 17.0).r; diffuseColor.rgb *= 0.45 + 1.1 * c2 * c2 + 0.3 * handTile; } }`,
      )
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n  roughnessFactor = clamp(vHandS.x + (handTile - 0.5) * 0.22, 0.04, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n  metalnessFactor = vHandS.y > 1.5 ? 0.55 - 0.5 * uLights : vHandS.y > 0.5 ? 1.0 : 0.0;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n  if (vHandS.y > 1.5) totalEmissiveRadiance += vColor.rgb * uLights * 3.2;`);
  };
  m.customProgramCacheKey = () => 'handheight-v1';
  patchLampMaterial(m);
  return m;
}

/** a ratio on what is already there, as closemat does: no light, no fog; it can only darken */
function stainMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.ZeroFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  m.name = 'handheight-stain';
  return m;
}

const hash = (a: number, b: number, c = 0): number => {
  let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

const WORKS = new Set<BuildingKind>(['warehouse', 'factory', 'depot']);
const HOMES = new Set<BuildingKind>(['house', 'townhouse', 'apartment', 'hotel']);
const OFFICE = new Set<BuildingKind>(['tower', 'office']);

export default function create(ctx: CityContext): CityModule {
  const name = 'handheight';
  const buildings = ctx.services.buildings as BuildingsService | undefined;
  if (!closeHand(ctx) || !buildings) return { name };
  const near = nearOf(ctx);
  const occ = ctx.occupancy;
  const terrain = ctx.services.terrain as { height(x: number, z: number): number } | undefined;
  const lots = new Map<number, Lot>(ctx.plan.lots.map((l) => [l.id, l]));

  const grids = LAYERS.map(() => new Map<number, Draw[]>());
  let items = 0;
  const put = (tier: number, x: number, z: number, draw: Draw): void => {
    const size = LAYERS[tier].cell;
    const key = (Math.floor(x / size) + 32768) * 65536 + (Math.floor(z / size) + 32768);
    const g = grids[tier];
    let list = g.get(key);
    if (!list) g.set(key, (list = []));
    list.push(draw);
    items++;
  };

  // ── doors
  const doorsOfLot = new Map<number, HandDoor[]>();
  for (const d of buildings.handDoors) {
    let l = doorsOfLot.get(d.lot);
    if (!l) doorsOfLot.set(d.lot, (l = []));
    l.push(d);
  }
  if (closeHand(ctx, 'handdoors')) {
    for (const d of buildings.handDoors) {
      const lot = lots.get(d.lot);
      if (!lot) continue;
      const p: D.DoorPlace = { kind: lot.kind, district: lot.district };
      const cx = d.x + (d.tx * d.w) / 2,
        cz = d.z + (d.tz * d.w) / 2;
      const on = (s: HandSink): HandSink => s.frame(d.x, 0, d.z, d.tx, d.tz, d.nx, d.nz);
      if (d.glass) {
        put(MID, cx, cz, (s) => D.glassDoor(on(s), d, p));
        continue;
      }
      put(MID, cx, cz, (s) => D.solidDoor(on(s), d, p));
      put(FINE, cx, cz, (s) => D.solidDoorFine(on(s), d));
      // the mat, where there is something to lie on
      if (!d.plain) {
        const mx = cx + d.nx * 0.28,
          mz = cz + d.nz * 0.28;
        const st = buildings.handSteps.find((q) => Math.hypot(q.x - cx, q.z - cz) < 0.9);
        const f = occ.get(mx, mz);
        const y = st ? st.y : f & OCC.SIDEWALK ? SIDEWALK_Y : f & (OCC.PAVED | OCC.PATH) && terrain ? terrain.height(mx, mz) : NaN;
        const depth = st ? st.d - 0.03 : 0.5;
        if (!Number.isNaN(y) && d.seed % 8 !== 7 && depth > 0.3) {
          const yaw = (((d.seed * 37) % 11) - 5) * 0.006;
          const mw = Math.min(d.w - 0.12, 0.8);
          const md = Math.min(depth, 0.46);
          const ca = Math.cos(yaw),
            sa = Math.sin(yaw);
          const tx = d.tx * ca + d.nx * sa,
            tz = d.tz * ca + d.nz * sa,
            nx = d.nx * ca - d.tx * sa,
            nz = d.nz * ca - d.tz * sa;
          const ox = cx + d.nx * (0.03 + md / 2),
            oz = cz + d.nz * (0.03 + md / 2);
          const rubber = d.seed % 3 === 0;
          put(MID, cx, cz, (s) => {
            s.frame(ox, 0, oz, tx, tz, nx, nz);
            s.ink(rubber ? 0x232322 : 0x3a2e20).rough(0.95).box(-mw / 2, mw / 2, y, y + 0.012, -md / 2, md / 2, 0).floor(-mw / 2, mw / 2, -md / 2, md / 2, y + 0.012);
            s.ink(rubber ? 0x3d3c39 : 0x8a7048).rough(1).floor(-mw / 2 + 0.03, mw / 2 - 0.03, -md / 2 + 0.03, md / 2 - 0.03, y + 0.0135);
            s.ink(rubber ? 0x484743 : 0x9c8256).rough(1).floor(-mw / 4, mw / 4, -md / 4, md / 4, y + 0.0145);
          });
        }
      }
      if (closeHand(ctx, 'handstains')) {
        // hands round the handle and the plate, feet at the foot of the door
        const u = d.w - 0.12;
        put(STAIN, cx, cz, (s) => {
          on(s);
          s.ink(0xb9b0a0).soft(u, 1.05, -d.d + 0.0013, 0.17, 0.26);
          if (d.letterY > 0) s.ink(0xcfc8ba).soft(d.w / 2, d.letterY - 0.055, -d.d + 0.0013, 0.22, 0.09);
          if (!d.kick) s.ink(0xa49b8a).soft(d.w / 2, 0.2, -d.d + 0.0013, d.w * 0.46, 0.14);
          s.ink(0xbdb5a6).soft(d.w + 0.07, 1.24, d.fo + 0.0012, 0.07, 0.12);
        });
      }
    }
  }

  // ── lanterns round the lit boxes
  if (closeHand(ctx, 'handlamps')) {
    for (const L of buildings.doorLamps) {
      if (L.w <= 0) continue;
      const lot = lots.get(L.lot);
      const seed = hash(Math.round(L.x * 7), Math.round(L.z * 7));
      const modern = !!lot && (lot.kind === 'house' || lot.kind === 'apartment') && lot.district !== 'oldtown' && seed % 3 === 0;
      put(MID, L.x, L.z, (s) => D.lantern(s, L, seed, modern));
    }
  }

  // ── rainwater
  const pipesOfLot = new Map<number, HandPipe[]>();
  if (closeHand(ctx, 'handpipes')) {
    for (const p of buildings.handPipes) {
      let l = pipesOfLot.get(p.lot);
      if (!l) pipesOfLot.set(p.lot, (l = []));
      l.push(p);
      const on = (s: HandSink): HandSink => s.frame(p.x, 0, p.z, p.tx, p.tz, p.nx, p.nz);
      put(BIG, p.x, p.z, (s) => W.rainPipe(on(s), p));
      const gx = p.x + p.nx * 0.2,
        gz = p.z + p.nz * 0.2;
      const f = occ.get(gx, gz);
      const y = f & OCC.SIDEWALK ? SIDEWALK_Y : f & (OCC.PAVED | OCC.PATH) && terrain ? terrain.height(gx, gz) : NaN;
      if (!Number.isNaN(y) && p.room > 0.16) put(MID, p.x, p.z, (s) => W.gully(on(s), p, y));
      if (closeHand(ctx, 'handstains')) {
        put(STAIN, p.x, p.z, (s) => {
          on(s);
          // damp at the foot, where the shoe spills in rain
          s.ink(0x8d8a84).soft(0, 0.18, 0.0015, 0.24, 0.42);
          s.ink(0xbeb9af).streak(-0.08, 0.08, Math.max(0.5, p.y1 - 1.6), p.y1, 0.0015);
        });
      }
    }
  }

  // ── fittings the generators placed
  if (closeHand(ctx, 'handwalls')) {
    for (const f of buildings.handSpots) {
      const on = (s: HandSink): HandSink => s.frame(f.x, 0, f.z, f.tx, f.tz, f.nx, f.nz);
      const cx = f.x + (f.tx * f.w) / 2,
        cz = f.z + (f.tz * f.w) / 2;
      if (f.kind === 'garage') put(MID, cx, cz, (s) => D.garage(on(s), f));
      else if (f.kind === 'rollup') put(MID, cx, cz, (s) => D.rollup(on(s), f));
      else if (f.kind === 'lobby') put(MID, cx, cz, (s) => D.lobbyDoors(on(s), f));
      else if (f.kind === 'meter') put(MID, cx, cz, (s) => W.homeMeter(on(s), f));
    }
  }

  // ── what each wall carries
  if (closeHand(ctx, 'handwalls')) {
    /** a wall's list of what is already on it, as rectangles */
    const taken = new Map<HandWall, number[]>();
    const isOut = (w: HandWall, u: number): boolean => {
      const x = w.x + w.tx * u,
        z = w.z + w.tz * u;
      const a = occ.get(x + w.nx * 0.45, z + w.nz * 0.45);
      return !(a & (OCC.BUILDING | OCC.WATER | OCC.SOLID | OCC.RAIL));
    };
    /** is this rectangle of the wall free: inside it, off the windows, doors and pipes, out in the open? */
    const free = (w: HandWall, u0: number, u1: number, y0: number, y1: number): boolean => {
      if (u0 < 0.08 || u1 > w.L - 0.08 || y1 > (lots.get(w.lot)?.height ?? 3) - 0.1) return false;
      if (!isOut(w, (u0 + u1) / 2)) return false;
      const g = w.grid;
      if (g) {
        for (let j = 0; j < g.m; j++) {
          const wy0 = g.v0 + j * g.ch + g.wy0 - 0.14,
            wy1 = g.v0 + j * g.ch + g.wy1 + 0.1;
          if (y1 < wy0 || y0 > wy1) continue;
          for (let i = 0; i < g.n; i++) {
            const a = g.u0 + i * g.cw + g.wx0 - 0.1,
              b = g.u0 + i * g.cw + g.wx1 + 0.1;
            if (u1 > a && u0 < b) return false;
          }
        }
      }
      for (const d of doorsOfLot.get(w.lot) ?? []) {
        const dc = (d.x + (d.tx * d.w) / 2 - w.x) * w.tx + (d.z + (d.tz * d.w) / 2 - w.z) * w.tz;
        const dn = (d.x - w.x) * w.nx + (d.z - w.z) * w.nz;
        if (Math.abs(dn) < 0.7 && u1 > dc - d.w / 2 - 0.75 && u0 < dc + d.w / 2 + 0.75) return false;
      }
      for (const p of pipesOfLot.get(w.lot) ?? []) {
        const pc = (p.x - w.x) * w.tx + (p.z - w.z) * w.tz;
        const pn = (p.x - w.x) * w.nx + (p.z - w.z) * w.nz;
        if (Math.abs(pn) < 0.7 && u1 > pc - 0.14 && u0 < pc + 0.14) return false;
      }
      // the bills someone pasted up (lettering, flyposters): the same choice as it makes
      if (!g && w.L >= 1.5 && w.y1 > 2.2 && Math.abs(Math.round(w.x * 13 + w.z * 7)) % 10 <= 3 && y1 > 0.8 && y0 < 1.8) return false;
      const t = taken.get(w);
      if (t) {
        for (let k = 0; k < t.length; k += 4) if (u1 > t[k] && u0 < t[k + 1] && y1 > t[k + 2] && y0 < t[k + 3]) return false;
      }
      return true;
    };
    const take = (w: HandWall, u0: number, u1: number, y0: number, y1: number): void => {
      let t = taken.get(w);
      if (!t) taken.set(w, (t = []));
      t.push(u0 - 0.05, u1 + 0.05, y0 - 0.05, y1 + 0.05);
    };
    const onWall = (w: HandWall, s: HandSink): HandSink => s.frame(w.x, 0, w.z, w.tx, w.tz, w.nx, w.nz);
    const pos = (w: HandWall, u: number): [number, number] => [w.x + w.tx * u, w.z + w.tz * u];
    const stains = closeHand(ctx, 'handstains');
    const FRONT: Record<string, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

    const byLot = new Map<number, HandWall[]>();
    for (const w of buildings.handWalls) {
      let l = byLot.get(w.lot);
      if (!l) byLot.set(w.lot, (l = []));
      l.push(w);
    }
    for (const [lotId, walls] of byLot) {
      const lot = lots.get(lotId);
      if (!lot) continue;
      const kind = lot.kind;
      const home = HOMES.has(kind);
      const works = WORKS.has(kind);
      const office = OFFICE.has(kind);
      const shop = lot.shopfront;
      const fn = FRONT[lot.front] ?? [0, 1];
      const rnd = nearRandom(hash(lot.seed, lotId, 77));
      const isFront = (w: HandWall): boolean => w.nx * fn[0] + w.nz * fn[1] > 0.7;
      const out = walls.filter((w) => isOut(w, w.L / 2));
      if (out.length === 0) continue;
      const door0 = (doorsOfLot.get(lotId) ?? [])[0];
      const nearDoor = (w: HandWall): number => {
        if (!door0) return w.L / 2;
        return (door0.x + (door0.tx * door0.w) / 2 - w.x) * w.tx + (door0.z + (door0.tz * door0.w) / 2 - w.z) * w.tz;
      };
      /** the first free place along a wall, starting at `from` and working out to both sides */
      const seek = (w: HandWall, from: number, hw: number, y0: number, y1: number): number => {
        for (let k = 0; k < 24; k++) {
          const u = from + (k % 2 ? 1 : -1) * ((k + 1) >> 1) * 0.3;
          if (free(w, u - hw, u + hw, y0, y1)) return u;
        }
        return NaN;
      };

      // air bricks: the floor of an old house breathes through them, low down and at even steps
      if ((home || kind === 'school' || kind === 'church' || kind === 'townhall') && !(shop && kind !== 'townhouse')) {
        for (const w of out) {
          const masonry = w.pattern === WALLPAT.BRICK || w.pattern === WALLPAT.STONE;
          if (!masonry && w.pattern !== WALLPAT.PLASTER) continue;
          const iron = lot.district === 'oldtown' || lot.seed % 3 === 0;
          const step = masonry ? 1.7 + (lot.seed % 5) * 0.12 : 2.6;
          for (let u = 0.55 + (lot.seed % 7) * 0.08; u < w.L - 0.3; u += step) {
            const y = 0.53;
            if (!free(w, u - 0.13, u + 0.13, y - 0.05, y + 0.05)) continue;
            take(w, u - 0.13, u + 0.13, y - 0.05, y + 0.05);
            const [x, z] = pos(w, u);
            const tone = 0.86 + ((lot.seed + Math.round(u * 13)) % 5) * 0.06;
            if (masonry) put(MID, x, z, (s) => W.airBrick(onWall(w, s), u, y, iron, tone));
            else put(MID, x, z, (s) => W.roundVent(onWall(w, s), u, y - 0.04, 0.055, 0xdedacf));
            if (stains) put(STAIN, x, z, (s) => onWall(w, s).ink(0xb6afa2).streak(u - 0.09, u + 0.09, y - 0.22, y - 0.03, 0.0014));
          }
        }
      }

      // the mains: where the cable comes in, on the front of a terrace, on the side of anything with a garden
      const meterHome = kind === 'townhouse' || kind === 'apartment' || kind === 'hotel' || shop;
      if (meterHome || office) {
        const order = [...out].sort((a, b) => (isFront(b) ? 1 : 0) - (isFront(a) ? 1 : 0));
        for (const w of order) {
          const big = kind === 'apartment' || office;
          const mw = big ? 0.86 : 0.46,
            mh = big ? 1.15 : 0.62,
            y0 = big ? 0.2 : 0.4;
          const u = seek(w, isFront(w) ? nearDoor(w) + (rnd() < 0.5 ? -1.6 : 1.6) : 0.9, mw / 2, y0, y0 + mh);
          if (Number.isNaN(u)) continue;
          take(w, u - mw / 2, u + mw / 2, y0, y0 + mh);
          const seed = lot.seed;
          const c = big ? 0x8a9094 : seed % 2 ? 0xd7d4ca : 0xc7c5bb;
          const [x, z] = pos(w, u);
          put(BIG, x, z, (s) => W.meterCupboard(onWall(w, s), u, y0, mw, mh, c, true, seed));
          // on its door: the warning, the supplier's label
          const dx = w.x + w.tx * (u - 0.045) + w.nx * 0.1465,
            dz = w.z + w.tz * (u - 0.045) + w.nz * 0.1465;
          const wy = y0 + mh - 0.14;
          put(FINE, x, z, (s) => onWall(w, s).ink(0xe8c32a).rough(0.42).plate(u - 0.05, u + 0.05, wy - 0.002, wy + 0.1, 0.1468));
          propSpots.push({ kind: 'cabwarn', x: dx, y: wy, z: dz, rx: w.tx, ry: 0, rz: w.tz, ux: 0, uy: 1, uz: 0, w: 0.09, h: 0.09, seed: seed + 3 });
          propSpots.push({ kind: 'cablabel', x: w.x + w.tx * (u - 0.1) + w.nx * 0.1468, y: wy - 0.13, z: w.z + w.tz * (u - 0.1) + w.nz * 0.1468, rx: w.tx, ry: 0, rz: w.tz, ux: 0, uy: 1, uz: 0, w: 0.2, h: 0.055, seed, part: seed % 3 });
          put(FINE, x, z, (s) => onWall(w, s).ink(0xece9df).rough(0.45).plate(u - 0.1, u + 0.1, wy - 0.135, wy - 0.075, 0.1465));
          if (stains) put(STAIN, x, z, (s) => onWall(w, s).ink(0xb4ad9f).soft(u, y0 - 0.02, 0.0014, mw * 0.7, 0.14));
          // gas beside it on most homes
          if (home && seed % 5 < 3 && !big) {
            const gu = seek(w, u + (mw / 2 + 0.34) * (seed % 2 ? 1 : -1), 0.22, 0.12, 0.56);
            if (!Number.isNaN(gu)) {
              take(w, gu - 0.22, gu + 0.22, 0.12, 0.56);
              const [gx, gz] = pos(w, gu);
              put(BIG, gx, gz, (s) => W.gasBox(onWall(w, s), gu, 0.13, seed));
            }
          }
          break;
        }
      }

      // the telephone drop, down a corner
      if ((home || shop) && rnd() < (shop ? 0.7 : 0.55) && lot.height > 3.4) {
        const w = out[Math.floor(rnd() * out.length)];
        const left = rnd() < 0.5;
        const u = left ? 0.11 : w.L - 0.11;
        const yb = 2.45 + rnd() * 0.3;
        const yTop = lot.height - 0.18;
        if (w.L > 1.5 && free(w, u - 0.05, u + 0.05, yb - 0.06, yb + 0.06)) {
          const [x, z] = pos(w, u);
          put(MID, x, z, (s) => W.telecomDrop(onWall(w, s), u, yb, yTop));
        }
      }

      // the alarm's bell box, high on the front, out of reach
      if (rnd() < (shop ? 0.8 : office ? 0.4 : home ? 0.25 : 0)) {
        const w = out.find(isFront);
        if (w && w.L > 2 && lot.height > 4) {
          const u = rnd() < 0.5 ? 0.3 : w.L - 0.3;
          const y = Math.min(lot.height - 0.5, Math.max(3.0, Math.min(w.y1 + 0.35, 3.6)));
          const gridOk = !w.grid || w.grid.u0 + w.grid.wx0 > 0.46;
          if (gridOk && free(w, u - 0.13, u + 0.13, y - 0.15, y + 0.15)) {
            const seed = lot.seed;
            const [x, z] = pos(w, u);
            put(BIG, x, z, (s) => W.alarmBox(onWall(w, s), u, y, seed));
          }
        }
      }

      // the sides and backs of homes: extract, boiler flue, overflow, a tap
      if (home) {
        for (const w of out) {
          if (isFront(w) || w.L < 1.6) continue;
          if (rnd() < 0.55) {
            const y = 2.1 + rnd() * 0.35;
            const u = seek(w, w.L * (0.3 + rnd() * 0.4), 0.1, y - 0.1, y + 0.1);
            if (!Number.isNaN(u)) {
              take(w, u - 0.1, u + 0.1, y - 0.1, y + 0.1);
              const [x, z] = pos(w, u);
              const c = rnd() < 0.7 ? 0xdedacf : 0x8c8a84;
              put(MID, x, z, (s) => W.louvre(onWall(w, s), u, y, c));
              if (stains) put(STAIN, x, z, (s) => onWall(w, s).ink(0x968f82).streak(u - 0.1, u + 0.1, y - 0.75, y - 0.06, 0.0014));
            }
          }
          if (w.pattern !== WALLPAT.SIDING && rnd() < 0.3) {
            const y = 1.65 + rnd() * 0.3;
            const u = seek(w, w.L * (0.3 + rnd() * 0.4), 0.09, y - 0.09, y + 0.09);
            if (!Number.isNaN(u)) {
              take(w, u - 0.09, u + 0.09, y - 0.09, y + 0.09);
              const [x, z] = pos(w, u);
              put(MID, x, z, (s) => W.flue(onWall(w, s), u, y));
              if (stains) put(STAIN, x, z, (s) => onWall(w, s).ink(0x8b867c).soft(u, y + 0.1, 0.0014, 0.15, 0.24));
            }
          }
          if (lot.height > 4 && rnd() < 0.35) {
            const y = Math.min(lot.height - 0.5, 3.3 + rnd() * 0.5);
            const u = seek(w, w.L * (0.3 + rnd() * 0.4), 0.03, y - 0.03, y + 0.03);
            if (!Number.isNaN(u)) {
              const [x, z] = pos(w, u);
              put(MID, x, z, (s) => W.overflow(onWall(w, s), u, y));
              if (stains) put(STAIN, x, z, (s) => onWall(w, s).ink(0x8f897c).streak(u - 0.05, u + 0.05, y - 1.1, y - 0.01, 0.0014));
            }
          }
          if (rnd() < 0.3) {
            const y = 0.62;
            const u = seek(w, w.L * (0.3 + rnd() * 0.4), 0.05, y - 0.08, y + 0.08);
            if (!Number.isNaN(u)) {
              take(w, u - 0.05, u + 0.05, y - 0.08, y + 0.08);
              const [x, z] = pos(w, u);
              put(MID, x, z, (s) => W.bibTap(onWall(w, s), u, y));
              if (stains) put(STAIN, x, z, (s) => onWall(w, s).ink(0x989387).streak(u - 0.05, u + 0.05, 0.1, y - 0.06, 0.0014));
            }
          }
        }
      }

      // a works: an isolator and its conduit on a long wall, a tap
      if (works) {
        for (const w of out) {
          if (w.L < 5) continue;
          const y = 1.35;
          const u = seek(w, w.L * (0.2 + rnd() * 0.6), 0.1, y - 0.14, y + 0.14);
          if (Number.isNaN(u)) continue;
          take(w, u - 0.1, u + 0.1, y - 0.14, y + 0.14);
          const seed = lot.seed;
          const yTop = Math.min(lot.height - 0.3, 7);
          const [x, z] = pos(w, u);
          put(BIG, x, z, (s) => W.worksConduit(onWall(w, s), u, y, yTop, seed));
          if (stains) put(STAIN, x, z, (s) => onWall(w, s).ink(0x7d6e5d).streak(u - 0.06, u + 0.06, y - 0.6, y - 0.13, 0.0014));
        }
      }

      // a camera at the corner of what has something to watch
      if ((office || works || (shop && lot.seed % 4 === 0)) && rnd() < 0.5) {
        const w = out.find(isFront) ?? out[0];
        const y = Math.min(lot.height - 0.4, 3.3);
        const left = rnd() < 0.5;
        const u = left ? 0.3 : w.L - 0.3;
        if (w.L > 2 && free(w, u - 0.1, u + 0.1, y - 0.1, y + 0.1)) {
          const [x, z] = pos(w, u);
          put(BIG, x, z, (s) => W.camera(onWall(w, s), u, y, left ? 1 : -1));
        }
      }

      // history: where something was once fixed, at about hand height
      for (const w of out) {
        for (let u = 0.9 + rnd() * 3; u < w.L - 0.4; u += 3 + rnd() * 5) {
          if (rnd() > 0.5) continue;
          const y = 1.1 + rnd() * 1.1;
          if (!free(w, u - 0.1, u + 0.1, y - 0.1, y + 0.1)) continue;
          take(w, u - 0.1, u + 0.1, y - 0.1, y + 0.1);
          const [x, z] = pos(w, u);
          const seed = lot.seed + Math.round(u * 17);
          const c = w.color;
          put(FINE, x, z, (s) => W.oldFixing(onWall(w, s), u, y, c, seed));
          if (stains && seed % 3 === 0) put(STAIN, x, z, (s) => onWall(w, s).ink(0x9c8f7d).streak(u - 0.05, u + 0.05, y - 0.45, y - 0.04, 0.0014));
        }
      }
    }
  }

  // ── the layers
  const sink = new HandSink();
  const build = (tier: number) => (cell: { i: number; j: number }): THREE.BufferGeometry | null => {
    const list = grids[tier].get((cell.i + 32768) * 65536 + (cell.j + 32768));
    if (!list) return null;
    sink.begin();
    for (const d of list) d(sink);
    return sink.finish();
  };
  const grain = makeCloseTiles().grain;
  const mid = handMaterial(grain);
  const big = handMaterial(grain);
  nearDither(big, BIG_R);
  for (let t = 0; t < LAYERS.length; t++) {
    const L = LAYERS[t];
    if (grids[t].size === 0) continue;
    near.addMeshes({
      ...L,
      material: t === STAIN ? stainMaterial() : t === BIG ? big : mid,
      build: build(t),
      standIn: handStandIn(),
      receiveShadow: t !== STAIN,
      renderOrder: t === STAIN ? -79 : 0,
    });
  }

  return {
    name,
    stats: () => ({ items }),
  };
}

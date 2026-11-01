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
import type { BuildingsService, HandDoor, HandFrame, HandPipe, HandWall } from './buildings/anchors';
import { WALLPAT } from './buildings/materials';
import { makeCloseTiles } from './closemat/textures';
import { propSpots } from './lettering/spots';
import { HandSink, handStandIn } from './handheight/sink';
import * as D from './handheight/doors';
import * as W from './handheight/walls';
import * as E from './handheight/entry';
import * as K from './handheight/life';
import { addBallast } from './handheight/ballast';

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
    diffuseColor.rgb *= vHandS.y > 1.5 ? 0.3 + 0.5 * uLights : mix(0.93 + 0.14 * handTile, 0.9 + 0.2 * handTile, vHandS.y);
    // coir and rough cloth: a coarse tile, deep in between the fibres
    if (vHandS.x > 0.97 && vHandS.y < 0.5) { float c2 = texture2D(uHandGrain, tuv * 17.0).r; diffuseColor.rgb *= 0.45 + 1.1 * c2 * c2 + 0.3 * handTile; } }`,
      )
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n  roughnessFactor = clamp(vHandS.x + (handTile - 0.5) * 0.09, 0.04, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n  metalnessFactor = vHandS.y > 1.5 ? 0.55 - 0.5 * uLights : vHandS.y > 0.5 ? 1.0 : 0.0;`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  if (vHandS.y > 0.5 && vHandS.y < 1.5) { float nv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0); diffuseColor.rgb *= 0.42 + 0.78 * nv * nv * nv + 0.22 * smoothstep(0.16, 0.0, nv); }`,
      )
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n  if (vHandS.y > 1.5) totalEmissiveRadiance += vColor.rgb * uLights * 3.2;`);
  };
  m.customProgramCacheKey = () => 'handheight-v3';
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

const w0vents = (seed: number): boolean => seed % 3 !== 0;

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

  /** a plate with words, centred at (u, y) on the plane o of a wall or fitting */
  const sign = (w: HandFrame, u: number, y: number, o: number, sw: number, sh: number, word: string, style: number): void => {
    propSpots.push({ kind: 'wallsign', x: w.x + w.tx * (u - sw / 2) + w.nx * o, y: y - sh / 2, z: w.z + w.tz * (u - sw / 2) + w.nz * o, rx: w.tx, ry: 0, rz: w.tz, ux: 0, uy: 1, uz: 0, w: sw, h: sh, seed: 0, part: style, word });
  };
  // ?handspots: where each kind of thing went, for a look at each (__city.ctx.services.handspots)
  const marks: [string, number, number, number, number, number][] | null = ctx.debug.params.has('handspots') ? [] : null;
  const mark = (kind: string, f: { x: number; z: number; tx: number; tz: number; nx: number; nz: number }, u: number, y: number): void => {
    if (marks) marks.push([kind, f.x + f.tx * u, y, f.z + f.tz * u, f.nx, f.nz]);
  };
  if (marks) (ctx.services as Record<string, unknown>).handspots = marks;
  const life = closeHand(ctx, 'handlife');
  /** the floor at a place out from a wall, where something could stand; NaN if it is not paved */
  const paved = (x: number, z: number): number => {
    const f = occ.get(x, z);
    return f & OCC.SIDEWALK ? SIDEWALK_Y : f & (OCC.PAVED | OCC.PATH) && terrain ? terrain.height(x, z) : NaN;
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
        if (life && (lot.kind === 'office' || lot.kind === 'tower' || lot.kind === 'hotel') && hash(d.seed, d.lot, 3) % 3 !== 0) {
          const ou = -0.55,
            oo = 0.32;
          const y = paved(d.x + d.tx * ou + d.nx * oo, d.z + d.tz * ou + d.nz * oo);
          if (!Number.isNaN(y)) {
            put(MID, cx, cz, (s) => K.ashStand(on(s), ou, y, oo));
            mark('ash', d, ou, y + 0.6);
          }
        }
        continue;
      }
      put(MID, cx, cz, (s) => D.solidDoor(on(s), d, p));
      put(FINE, cx, cz, (s) => D.solidDoorFine(on(s), d));
      // the mat, where there is something to lie on
      if (!d.plain) {
        const mx = cx + d.nx * 0.28,
          mz = cz + d.nz * 0.28;
        const st = buildings.handSteps.find((q) => Math.hypot(q.x - cx, q.z - cz) < 0.9);
        const y = st ? st.y : paved(mx, mz);
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
        // what has been left here. A step narrow beyond the door has room only for bottles
        if (life && !Number.isNaN(y)) {
          const deck = !!st && st.d > 0.6;
          const r = hash(d.seed, d.lot, 11) % 100;
          const old = lot.district === 'oldtown' || lot.kind === 'townhouse';
          const gap = 0.2;
          const floor = (u: number, o: number): number => (st ? st.y : paved(d.x + d.tx * u + d.nx * o, d.z + d.tz * u + d.nz * o));
          if (old && r < 24 && !st) {
            const fy = floor(-gap, 0.09);
            if (!Number.isNaN(fy)) {
              put(MID, cx, cz, (s) => K.bootScraper(on(s), -gap, fy, 0.09));
              mark('scraper', d, -gap, fy + 0.15);
            }
          } else if (r >= 24 && r < 40 && lot.kind !== 'kiosk') {
            const u = st && !deck ? -0.12 : -gap,
              fy = floor(u, 0.17);
            if (!Number.isNaN(fy)) {
              put(FINE, cx, cz, (s) => K.milkBottles(on(s), u - 0.05, fy, 0.17, 2 + (d.seed % 2)));
              mark('milk', d, u, fy + 0.15);
            }
          } else if (deck && r >= 40 && r < 66) {
            const c = [0x25402d, 0x1a1b1d, 0x3b2c20, 0x7a2925][d.seed % 4];
            put(MID, cx, cz, (s) => K.boots(on(s), -0.42, st.y, 0.14, c));
            mark('boots', d, -0.36, st.y + 0.2);
          } else if (!st && r >= 66 && r < 76) {
            const u = d.w + 0.3,
              fy = floor(u, 0.2);
            if (!Number.isNaN(fy)) {
              put(MID, cx, cz, (s) => K.broom(on(s), u, fy, 0));
              mark('broom', d, u, fy + 0.6);
            }
          } else if (r >= 76 && r < 84 && (deck || !st)) {
            const fy = floor(-0.3, 0.3);
            if (!Number.isNaN(fy)) {
              put(FINE, cx, cz, (s) => K.parcel(on(s), -0.3, fy, 0.18, d.seed));
              mark('parcel', d, -0.3, fy + 0.2);
            }
          } else if (r >= 84 && r < 96 && d.seed % 8 !== 7 && depth > 0.3) {
            put(FINE, cx, cz, (s) => K.newspaper(on(s), d.w * 0.46, y + 0.0145, 0.24));
            mark('paper', d, d.w * 0.46, y + 0.1);
          }
        }
      }
      if (life && WORKS.has(lot.kind) && hash(d.seed, d.lot, 5) % 2 === 0) {
        const ou = d.w + 0.42,
          oo = 0.2;
        const y = paved(d.x + d.tx * ou + d.nx * oo, d.z + d.tz * ou + d.nz * oo);
        if (!Number.isNaN(y)) {
          put(MID, cx, cz, (s) => K.sandBucket(on(s), ou, y, oo));
          mark('bucket', d, ou, y + 0.2);
          sign(d, ou, 1.55, 0.002, 0.13, 0.09, 'NO|SMOKING', 3);
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
      else if (f.kind === 'shutter') {
        put(MID, cx, cz, (s) => W.shutterIron(on(s), f));
        mark('shutter', f, f.w / 2, f.y + 0.3);
      } else if (f.kind === 'winder') {
        put(MID, cx, cz, (s) => W.awningWinder(on(s), f.h, f.o));
        mark('winder', f, 0, 1.6);
      } else if (f.kind === 'riser') {
        const u = f.w * (0.2 + ((f.seed >>> 2) % 7) * 0.1);
        put(MID, cx, cz, (s) => W.riserVent(on(s), u, f, f.color));
        mark('riser', f, u, 0.2);
        if (f.seed % 3 !== 0) put(FINE, cx, cz, (s) => W.stickers(on(s), Math.min(f.w - 0.15, u + 0.42), 0.17, f.o, f.seed, 2 + (f.seed >>> 4) % 4));
        // the cellar's delivery flap in the pavement in front of a shop that has one
        const fy = paved(f.x + (f.tx * f.w) / 2 + f.nx * 0.8, f.z + (f.tz * f.w) / 2 + f.nz * 0.8);
        const edge = paved(f.x + (f.tx * f.w) / 2 + f.nx * 1.35, f.z + (f.tz * f.w) / 2 + f.nz * 1.35);
        if (f.seed % 4 === 0 && f.w > 1.3 && fy === SIDEWALK_Y && edge === SIDEWALK_Y) {
          const hw = Math.min(0.55, f.w / 2 - 0.1);
          put(MID, cx, cz, (s) => W.cellarHatch(on(s), f.w / 2 - hw, f.w / 2 + hw, 0.3, 1.15, SIDEWALK_Y, f.seed));
          mark('hatch', f, f.w / 2, SIDEWALK_Y + 0.05);
        }
      }
      if (f.kind === 'rollup') {
        sign(f, f.w * 0.72, 1.7, f.o + 0.012, 0.4, 0.2, 'KEEP CLEAR|24 HR ACCESS', 1);
        mark('rollup', f, f.w * 0.7, 1.3);
      }
      if (f.kind === 'garage') mark('garage', f, f.w / 2, 1.1);
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

    const nearPipes: HandPipe[] = [];
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

      // ── by the door: for callers, the post, the fire brigade
      for (const d of doorsOfLot.get(lotId) ?? []) {
        const dc = (u: number): [number, number] => [d.x + d.tx * u, d.z + d.tz * u];
        /** the wall this door stands in, at a position counted from the door's left edge */
        const wallBeside = (u: number): { w: HandWall; wu: number } | null => {
          const [px, pz] = dc(u);
          for (const w of walls) {
            if (w.nx * d.nx + w.nz * d.nz < 0.99) continue;
            if (Math.abs((px - w.x) * w.nx + (pz - w.z) * w.nz) > 0.03) continue;
            const wu = (px - w.x) * w.tx + (pz - w.z) * w.tz;
            if (wu > 0.05 && wu < w.L - 0.05) return { w, wu };
          }
          return null;
        };
        const clear = (b: { w: HandWall; wu: number }, hw: number, y0: number, y1: number): boolean => {
          const { w, wu } = b;
          if (!isOut(w, wu) || wu - hw < 0.06 || wu + hw > w.L - 0.06) return false;
          const g = w.grid;
          if (g) {
            for (let j = 0; j < g.m; j++) {
              if (y1 < g.v0 + j * g.ch + g.wy0 - 0.12 || y0 > g.v0 + j * g.ch + g.wy1 + 0.1) continue;
              for (let i = 0; i < g.n; i++) if (wu + hw > g.u0 + i * g.cw + g.wx0 - 0.08 && wu - hw < g.u0 + i * g.cw + g.wx1 + 0.08) return false;
            }
          }
          for (const p of pipesOfLot.get(lotId) ?? []) {
            const pc = (p.x - w.x) * w.tx + (p.z - w.z) * w.tz;
            if (Math.abs((p.x - w.x) * w.nx + (p.z - w.z) * w.nz) < 0.7 && wu + hw > pc - 0.14 && wu - hw < pc + 0.14) return false;
          }
          return true;
        };
        const [cxd, czd] = dc(d.w / 2);
        const flats = kind === 'apartment' ? Math.min(8, Math.max(4, lot.floors * 2)) : kind === 'hotel' ? 2 : 0;
        if (flats > 0 && d.glass) {
          // the entry panel on the handle side, the bank of letter boxes on the other
          const iu = d.w + 0.14 + 0.1;
          const hit = wallBeside(iu);
          if (hit && clear(hit, 0.1, 1.0, 1.7)) {
            const { w, wu } = hit;
            take(w, wu - 0.1, wu + 0.1, 1.0, 1.7);
            const y = 1.08;
            put(MID, cxd, czd, (s) => void E.intercom(onWall(w, s), wu, y, flats, d.seed));
            mark('intercom', w, wu, y + 0.25);
            const px = w.x + w.tx * (wu - 0.085 + 0.014),
              pz = w.z + w.tz * (wu - 0.085 + 0.014);
            propSpots.push({ kind: 'bellplate', x: px + w.nx * 0.0118, y: y + 0.015, z: pz + w.nz * 0.0118, rx: w.tx, ry: 0, rz: w.tz, ux: 0, uy: 1, uz: 0, w: 0.114, h: flats * 0.045, seed: d.seed + lotId * 131, part: flats });
            if (stains) put(STAIN, cxd, czd, (s) => onWall(w, s).ink(0xb7b0a2).soft(wu + 0.05, y + flats * 0.022, 0.0013, 0.14, 0.2));
          }
          if (kind === 'apartment') {
            const cols = Math.min(4, Math.ceil(flats / 2)),
              rows = 2;
            const bw = cols * 0.26 + 0.02;
            const hit2 = wallBeside(-0.14 - 0.12 - bw / 2);
            if (hit2 && clear(hit2, bw / 2, 0.75, 0.75 + rows * 0.2 + 0.02)) {
              const { w, wu } = hit2;
              take(w, wu - bw / 2, wu + bw / 2, 0.75, 0.75 + rows * 0.2 + 0.02);
              put(BIG, cxd, czd, (s) => E.mailBank(onWall(w, s), wu, 0.75, cols, rows, lot.seed));
              mark('mailbank', w, wu, 1.0);
            }
          }
        }
        if ((office || kind === 'school') && d.glass) {
          const hit = wallBeside(d.w + 0.14 + 0.12);
          if (hit && clear(hit, 0.06, 1.1, 1.4)) {
            const { w, wu } = hit;
            take(w, wu - 0.06, wu + 0.06, 1.1, 1.4);
            const pad = lot.seed % 2 === 0;
            put(MID, cxd, czd, (s) => E.reader(onWall(w, s), wu, 1.25, pad));
            mark('reader', w, wu, 1.25);
          }
        }
        if (works && !d.glass) {
          const hit = wallBeside(-0.14 - 0.16);
          if (hit && clear(hit, 0.06, 1.1, 1.4)) {
            const { w, wu } = hit;
            take(w, wu - 0.06, wu + 0.06, 1.1, 1.4);
            put(MID, cxd, czd, (s) => E.reader(onWall(w, s), wu, 1.25, true));
          }
        }
        // a door with no plate has its letter box on the wall
        if (!d.glass && !d.plain && d.letterY === 0 && !works) {
          const hit = wallBeside(d.w + 0.14 + 0.22);
          if (hit && clear(hit, 0.16, 1.05, 1.5)) {
            const { w, wu } = hit;
            take(w, wu - 0.16, wu + 0.16, 1.05, 1.5);
            put(MID, cxd, czd, (s) => E.wallBox(onWall(w, s), wu, 1.08, d.seed));
            mark('wallbox', w, wu, 1.25);
          }
        }
        // what the householder wants callers to know
        if (life && (kind === 'house' || kind === 'townhouse') && !d.glass) {
          const r = hash(d.seed, lotId, 13) % 100;
          const word = r < 8 ? 'BEWARE OF|THE DOG' : r < 18 ? 'NO COLD|CALLERS' : r < 26 ? 'NEIGHBOURHOOD|WATCH AREA' : '';
          if (word) {
            const hit = wallBeside(d.w + 0.14 + 0.16);
            if (hit && clear(hit, 0.08, 1.38, 1.53)) {
              const { w, wu } = hit;
              take(w, wu - 0.08, wu + 0.08, 1.38, 1.53);
              const style = r < 8 ? 2 : 1;
              put(FINE, cxd, czd, (s) => onWall(w, s).ink(style === 2 ? 0xe6c52e : 0xe7e4d9).rough(0.42).box(wu - 0.072, wu + 0.072, 1.41, 1.5, 0, 0.0018, 0.0005));
              sign(w, wu, 1.455, 0.002, 0.14, 0.085, word, style);
              mark('plate', w, wu, 1.455);
            }
          }
        }
        // the water's stop tap and the gas valve, in the first paving out from the door
        if (!d.plain && kind !== 'kiosk') {
          let found = -1;
          for (let o = 0.5; o < 12; o += 0.5) {
            const q = occ.get(cxd + d.nx * o, czd + d.nz * o);
            if (q & OCC.SIDEWALK) {
              found = o + 0.55;
              break;
            }
            if (q & (OCC.ROAD | OCC.WATER | OCC.BUILDING)) break;
          }
          if (found > 0 && occ.get(cxd + d.nx * found, czd + d.nz * found) & OCC.SIDEWALK) {
            const u0 = 0.25 + (d.seed % 5) * 0.2;
            const kindLid = lot.seed % 3;
            const lidWord = (uu: number, oo: number, word: string): void => {
              const sw = 0.07,
                sh = 0.02;
              propSpots.push({ kind: 'wallsign', x: cxd + d.tx * (uu - sw / 2) + d.nx * (oo + sh / 2), y: SIDEWALK_Y + 0.0092, z: czd + d.tz * (uu - sw / 2) + d.nz * (oo + sh / 2), rx: d.tx, ry: 0, rz: d.tz, ux: -d.nx, uy: 0, uz: -d.nz, w: sw, h: sh, seed: 0, part: 0, word });
            };
            lidWord(u0, found - 0.052, 'WATER');
            if (kindLid === 1) lidWord(u0 + 0.42, found + 0.05 - 0.04, 'GAS');
            if (marks) marks.push(['lid', cxd + d.tx * u0 + d.nx * found, SIDEWALK_Y + 0.05, czd + d.tz * u0 + d.nz * found, d.nx, d.nz]);
            put(MID, cxd, czd, (s) => {
              s.frame(cxd, 0, czd, d.tx, d.tz, d.nx, d.nz);
              E.serviceLid(s, u0, found, SIDEWALK_Y + 0.002, 0);
              if (kindLid > 0) E.serviceLid(s, u0 + 0.42, found + 0.05, SIDEWALK_Y + 0.002, kindLid);
            });
          }
        }
      }

      // the fire brigade's inlet on what is tall
      if (office || kind === 'hotel') {
        const w = out.find((q) => isFront(q) && q.L > 2) ?? out.find((q) => q.L > 2);
        if (w) {
          const u = seek(w, w.L * 0.75, 0.28, 0.5, 1.0);
          if (!Number.isNaN(u)) {
            take(w, u - 0.28, u + 0.28, 0.5, 1.0);
            const [x, z] = pos(w, u);
            put(BIG, x, z, (s) => E.fireInlet(onWall(w, s), u, 0.74));
            mark('fire', w, u, 0.75);
            sign(w, u, 0.74 + 0.1275, 0.0203, 0.38, 0.05, 'DRY RISER INLET', 0);
          }
        }
      }

      // rain has to come down somewhere: a wall of a block or a terrace with no pipe gets one at a corner
      if ((kind === 'apartment' || kind === 'townhouse' || kind === 'hotel' || kind === 'school' || kind === 'house') && closeHand(ctx, 'handpipes')) {
        const house = kind === 'house';
        const roofAt = Math.min(lot.height, buildings.handTops.get(lotId) ?? lot.height);
        for (const w of out) {
          if (w.L < (house ? 3.5 : 6) || lot.height < (house ? 2.5 : 4)) continue;
          if (house && (pipesOfLot.get(lotId)?.length ?? 0) >= 2) continue;
          const others = pipesOfLot.get(lotId) ?? [];
          if (others.some((p) => p.nx * w.nx + p.nz * w.nz > 0.9 && Math.abs((p.x - w.x) * w.nx + (p.z - w.z) * w.nz) < 1)) continue;
          const right = (lot.seed + Math.round(w.x)) % 2 === 0;
          const many = house ? 1 : Math.max(1, Math.round(w.L / 12));
          for (let pk = 0; pk < many; pk++) {
          // one at the corner, then every ten metres or so on a line between two windows
          let u = many === 1 ? (right ? w.L - 0.26 : 0.26) : ((pk + 0.5) * w.L) / many;
          const g = w.grid;
          if (many > 1 && g && g.n > 0) u = g.u0 + Math.max(1, Math.min(g.n - 1, Math.round((u - g.u0) / g.cw))) * g.cw;
          if (!free(w, u - 0.14, u + 0.14, 0.2, Math.min(roofAt - 0.2, w.y1))) continue;
          take(w, u - 0.14, u + 0.14, 0.2, roofAt - 0.2);
          const [x, z] = pos(w, u);
          if (buildings.handPipes.some((q) => Math.hypot(q.x - x, q.z - z) < 1.6) || nearPipes.some((q) => Math.hypot(q.x - x, q.z - z) < 1.6)) continue;
          mark('nearpipe', w, u, 1.0);
          const p: HandPipe = { lot: lotId, x, z, tx: w.tx, tz: w.tz, nx: w.nx, nz: w.nz, r: 0.048, po: 0.075, y0: 0.25, y1: roofAt - 0.34, color: [0x4a4d50, 0x8a7a6a, 0xe6e3da, 0x37393c, 0x6f4a3a][lot.seed % 5], room: 0.2, hopper: true };
          let l = pipesOfLot.get(lotId);
          if (!l) pipesOfLot.set(lotId, (l = []));
          l.push(p);
          nearPipes.push(p);
          const on = (s: HandSink): HandSink => s.frame(x, 0, z, w.tx, w.tz, w.nx, w.nz);
          put(BIG, x, z, (s) => W.rainPipe(on(s), p));
          const gx = x + w.nx * 0.2,
            gz = z + w.nz * 0.2;
          const f = occ.get(gx, gz);
          const y = f & OCC.SIDEWALK ? SIDEWALK_Y : f & (OCC.PAVED | OCC.PATH) && terrain ? terrain.height(gx, gz) : NaN;
          if (!Number.isNaN(y)) put(MID, x, z, (s) => W.gully(on(s), p, y));
          if (stains) {
            put(STAIN, x, z, (s) => {
              on(s);
              s.ink(0x8d8a84).soft(0, 0.18, 0.0015, 0.24, 0.42);
              s.ink(0xbeb9af).streak(-0.09, 0.09, Math.max(0.5, p.y1 - 1.8), p.y1, 0.0015);
            });
          }
          }
        }
      }

      // a block of flats breathes through a row of grilles, one by each kitchen window
      if ((kind === 'apartment' || kind === 'hotel') && w0vents(lot.seed)) {
        for (const w of out) {
          const g = w.grid;
          if (!g) continue;
          for (let i = 0; i < g.n; i += 2) {
            for (let j = 0; j < Math.max(1, g.m); j++) {
              const u = g.u0 + i * g.cw + g.wx1 + 0.24;
              const y = g.v0 + j * g.ch + g.wy1 - 0.06;
              if (!free(w, u - 0.075, u + 0.075, y - 0.075, y + 0.075)) continue;
              take(w, u - 0.075, u + 0.075, y - 0.075, y + 0.075);
              const [x, z] = pos(w, u);
              put(MID, x, z, (s) => W.roundVent(onWall(w, s), u, y, 0.065, 0xd9d6cc));
              mark('grille', w, u, y);
              if (stains) put(STAIN, x, z, (s) => onWall(w, s).ink(0xa59e90).streak(u - 0.06, u + 0.06, y - 0.42, y - 0.05, 0.0014));
            }
          }
        }
      }

      // air bricks: the floor of an old house breathes through them, low down and at even steps
      if ((home || kind === 'school' || kind === 'church' || kind === 'townhall') && !(shop && kind !== 'townhouse')) {
        for (const w of out) {
          const pat = w.pattern & 15;
          const masonry = pat === WALLPAT.BRICK || pat === WALLPAT.STONE;
          if (!masonry && pat !== WALLPAT.PLASTER) continue;
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
          mark('meter', w, u, y0 + 0.4);
          put(FINE, x, z, (s) => W.stickers(onWall(w, s), u - mw / 2 + 0.08, y0 + mh * 0.45, 0.1468, seed, 1 + seed % 3));
          sign(w, u, y0 + 0.13, 0.1468, 0.2, 0.03, 'ELECTRICITY', 0);
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
              mark('gas', w, gu, 0.3);
              sign(w, gu, 0.13 + 0.09, 0.1755, 0.1, 0.03, 'GAS', 0);
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

      // the older streets' cables, clipped along the front above the ground floor windows
      if (kind === 'townhouse' && !shop && lot.seed % 2 === 0 && lot.height > 4.5) {
        const doorTop = Math.max(0, ...(doorsOfLot.get(lotId) ?? []).map((d) => d.h)) + 0.22;
        for (const w of out) {
          if (!isFront(w) || w.L < 1.2) continue;
          const g = w.grid;
          let y = Math.max(doorTop, g ? g.v0 + g.wy1 + 0.18 : 2.8, 2.75);
          // no room in this storey: just above its band, under the next one's sills
          if (y > w.y1 - 0.08) y = w.y1 + 0.18;
          take(w, 0.1, w.L - 0.1, y - 0.015, y + 0.015);
          const light = (w.color >> 16) + ((w.color >> 8) & 255) + (w.color & 255) > 450;
          const [x, z] = pos(w, w.L / 2);
          put(MID, x, z, (s) => W.cableRun(onWall(w, s), 0.1, w.L - 0.1, y, light ? 0xe0ddd2 : 0x1a1b1c, light ? 0xd8d5ca : 0x2a2b2c));
          mark('cable', w, w.L / 2, y);
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
          if ((w.pattern & 15) !== WALLPAT.SIDING && rnd() < 0.3) {
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
              mark('tap', w, u, y);
              if (life && kind === 'house' && rnd() < 0.55) {
                const hu = seek(w, u + 0.42, 0.2, 0.75, 1.32);
                if (!Number.isNaN(hu) && Math.abs(hu - u) < 1) {
                  take(w, hu - 0.2, hu + 0.2, 0.75, 1.32);
                  const seed = lot.seed;
                  put(MID, x, z, (s) => K.hoseReel(onWall(w, s), hu, 1.08, seed));
                  mark('hose', w, hu, 1.08);
                }
              }
              if (life && (kind === 'house' || kind === 'townhouse') && rnd() < 0.3 && terrain) {
                const cu = u + 0.05,
                  co = 0.2;
                const cy = terrain.height(x + w.nx * co, z + w.nz * co);
                const seed = lot.seed;
                put(MID, x, z, (s) => K.wateringCan(onWall(w, s), cu, cy, co, seed % 2 ? 0x8f9798 : 0x3a6d4a, seed % 2 === 1));
                mark('can', w, cu, cy + 0.2);
              }
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
          sign(w, u, y + 0.1, 0.0928, 0.09, 0.05, 'DANGER|415 V', 2);
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
          // it has to say so, at eye level near the door or the corner
          const su = left ? 0.32 : w.L - 0.32;
          if (free(w, su - 0.13, su + 0.13, 1.7, 1.94)) {
            take(w, su - 0.13, su + 0.13, 1.7, 1.94);
            const [cx2, cz2] = pos(w, su);
            put(FINE, cx2, cz2, (s) => onWall(w, s).ink(0xdfc12e).rough(0.45).box(su - 0.11, su + 0.11, 1.74, 1.9, 0, 0.002, 0.0005));
            sign(w, su, 1.82, 0.0022, 0.21, 0.15, 'CCTV|IN OPERATION', 2);
          }
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

  if (closeHand(ctx, 'handballast') && ctx.plan.rail) addBallast(ctx);

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

// Module "lettering" (close-up round, docs/progress/close-text.md): text you can actually read, all over the city, from one
// system. Who keeps which shop and what it says on the door comes from wording.ts; where it can go comes from the buildings'
// and the street kits' spots; it is written with one distance-field font (lettering/font.ts) into bubble cells: one mesh per
// cell, one program, nothing built or drawn from afar. Three rings: big names, paper and headings, fine print.
// Switches (core/closetext.ts): ?nolettering, ?no<family> below, and ?no<layer> (letterBig, letterMid, letterFine).

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { nearOf, NEAR_GLSL } from '../core/nearDetail';
import { globalUniforms } from '../core/uniforms';
import { closeText, textOn } from '../core/closetext';
import { OCC } from '../core/occupancy';
import { SIDEWALK_Y } from '../core/constants';
import { patchLampMaterial } from './lamps/integrate';
import type { BuildingsService, LetterSpot } from './buildings/anchors';
import { XS, ZS } from '../core/constants';
import { EW_NAMES, NS_NAMES } from '../core/streets';
import { FACE, GlyphAtlas } from './lettering/font';
import { FADE_UNIT, LetterSink } from './lettering/sink';
import { addressOf, shopFor } from './lettering/shopname';
import { propSpots, type PropSpot } from './lettering/spots';
import { DOOR_NOTES, hashText, type Shop } from './lettering/wording';
import * as paint from './lettering/paint';
import type { StopInfo, Tier } from './lettering/paint';

type Draw = (s: LetterSink) => void;
interface Item {
  x: number;
  z: number;
  draw: Draw;
}

const RINGS: { name: string; radius: number; cell: number; top: number; renderOrder: number }[] = [
  { name: 'letterBig', radius: 60, cell: 32, top: 9, renderOrder: 6 },
  { name: 'letterMid', radius: 34, cell: 16, top: 5, renderOrder: 7 },
  { name: 'letterFine', radius: 14, cell: 8, top: 4, renderOrder: 8 },
];

function letterMaterial(atlas: GlyphAtlas, uHour: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSdf = { value: atlas.texture };
    sh.uniforms.uLetterHour = uHour;
    sh.uniforms.uLights = globalUniforms.uLights;
    sh.uniforms.uNearEye = globalUniforms.uNearEye;
    sh.uniforms.uNearLens = globalUniforms.uNearLens;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aInk;
attribute vec4 aPar;
uniform float uLetterHour;
${NEAR_GLSL}
varying vec3 vInk;
varying vec3 vLet; // uv.x sign kept in vLetUv
varying vec2 vLetUv;`,
      )
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normal * 2.0 - 1.0;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vInk = pow(aInk.rgb, vec3(2.2));
  vLetUv = uv;
  { float from = aPar.z * 25.5, to = aPar.w * 25.5;
    bool on = from <= to ? (uLetterHour >= from && uLetterHour < to) : (uLetterHour >= from || uLetterHour < to);
    float k = on ? thNearK((modelMatrix * vec4(transformed, 1.0)).xyz, aPar.y * ${(255 * FADE_UNIT).toFixed(1)}) : 0.0;
    vLet = vec3(aPar.x, k, aInk.a);
    if (k <= 0.0) transformed = vec3(0.0); }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uSdf;
uniform float uLights;
varying vec3 vInk;
varying vec3 vLet;
varying vec2 vLetUv;`,
      )
      .replace(
        '#include <color_fragment>',
        `{
    float la;
    if (vLetUv.x < 0.0) la = vLet.x;
    else {
      float d = texture2D(uSdf, vLetUv).r;
      float w = clamp(fwidth(d) * 0.7, 0.012, 0.3);
      float th = 0.5 - (vLet.x - 0.5) * 0.28;
      la = smoothstep(th - w, th + w, d);
    }
    la *= vLet.y;
    if (la < 0.01) discard;
    diffuseColor = vec4(vInk, la);
  }`,
      )
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n  totalEmissiveRadiance += vInk * vLet.z * uLights * 1.4;`);
  };
  m.customProgramCacheKey = () => 'lettering-sdf';
  patchLampMaterial(m);
  return m;
}

function standIn(): THREE.BufferGeometry {
  const s = new THREE.BufferGeometry();
  s.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  s.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  s.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(6), 2));
  s.setAttribute('aInk', new THREE.Float32BufferAttribute(new Float32Array(12), 4));
  s.setAttribute('aPar', new THREE.Float32BufferAttribute(new Float32Array(12), 4));
  return s;
}

export default function create(ctx: CityContext): CityModule {
  const name = 'lettering';
  if (!closeText(ctx, 'lettering')) return { name };
  const near = nearOf(ctx);
  const buildings = ctx.services.buildings as BuildingsService | undefined;
  const occ = ctx.occupancy;
  const atlas = new GlyphAtlas();
  const sink = new LetterSink(atlas);
  const uHour = { value: ctx.clock.hours };
  const material = letterMaterial(atlas, uHour);
  const grids = RINGS.map(() => new Map<number, Item[]>());
  let items = 0;

  const put = (tier: Tier, x: number, z: number, draw: Draw): void => {
    const size = RINGS[tier].cell;
    const key = (Math.floor(x / size) + 32768) * 65536 + (Math.floor(z / size) + 32768);
    const g = grids[tier];
    let list = g.get(key);
    if (!list) g.set(key, (list = []));
    list.push({ x, z, draw });
    items++;
  };

  /** the frame of a facade spot; `o` further out from the wall */
  const onSpot = (s: LetterSink, p: LetterSpot, z0 = 0.004): LetterSink => s.frame(p.x, p.y, p.z, p.tx, 0, p.tz, 0, 1, 0, z0);
  const cx = (p: LetterSpot): number => p.x + (p.tx * p.w) / 2;
  const cz = (p: LetterSpot): number => p.z + (p.tz * p.w) / 2;

  // ── the shops: names, doors, windows
  const shopByLot = new Map<number, Shop>();
  const spots = buildings?.letterSpots ?? [];
  for (const p of spots) if (p.kind === 'fascia' && p.word) shopByLot.set(p.lot, shopFor({ id: p.lot }, p.word));
  const lots = ctx.plan.lots;
  const lotOf = new Map(lots.map((l) => [l.id, l]));
  const windowsSeen = new Map<number, number>();

  /** a point just in front of a wall is out in the open: somebody can read what is on it */
  const open = (p: LetterSpot, u: number): boolean => {
    const x = p.x + p.tx * u + p.nx * 0.9,
      z = p.z + p.tz * u + p.nz * 0.9;
    const f = occ.get(x, z);
    return !(f & (OCC.BUILDING | OCC.WATER | OCC.SOLID | OCC.RAIL));
  };

  if (closeText(ctx, 'shopsigns')) {
    for (const p of spots) {
      if (p.kind === 'fascia' && p.word) {
        const shop = shopFor({ id: p.lot }, p.word);
        const upper = p.style === 1;
        put(0, cx(p), cz(p), (s) => {
          onSpot(s, p);
          paint.fascia(s, p.w, p.h, shop, p.bg ?? 0x20262c, p.fg ?? 0xf4f1ea, upper);
        });
      } else if (p.kind === 'band' && p.word) {
        const shop = shopFor({ id: p.lot + 100000 * (1 + Math.round(p.nx + 2 * p.nz)) }, p.word);
        put(0, cx(p), cz(p), (s) => {
          onSpot(s, p);
          paint.band(s, p.w, p.h, shop, p.fg ?? 0xf4f1ea);
        });
      }
    }
  }
  if (closeText(ctx, 'shopwindows')) {
    for (const p of spots) {
      if (p.kind !== 'window' || !p.word || p.w < 0.6) continue;
      const lot = lotOf.get(p.lot);
      const own = shopByLot.get(p.lot);
      const shop = own && p.word && hashText(own.trade) && own ? (lot?.shopfront ? own : shopFor({ id: p.lot + 100000 }, p.word)) : shopFor({ id: p.lot + 100000 }, p.word);
      const which = windowsSeen.get(p.lot) ?? 0;
      windowsSeen.set(p.lot, which + 1);
      for (const tier of [1, 2] as Tier[]) {
        put(tier, cx(p), cz(p), (s) => {
          onSpot(s, p);
          paint.windowWords(s, p.w, p.h, shop, which, tier);
          // the menu in the first window, by the door
          if (which === 0 && shop.menu) {
            const mx = p.w > 1.5 ? p.w - 0.38 : (p.w - 0.3) / 2;
            onSpot(s, p).frame(p.x, p.y + 0.75, p.z, p.tx, 0, p.tz, 0, 1, 0, 0.005);
            paint.menuCard(s, mx, 0, shop, tier);
          }
        });
      }
    }
  }

  // ── doors
  if (closeText(ctx, 'doorwords')) {
    for (const p of spots) {
      if (p.kind !== 'door') continue;
      const lot = lotOf.get(p.lot);
      if (!lot) continue;
      const shop = shopByLot.get(p.lot);
      const seed = (p.seed ?? p.lot) + p.lot * 131;
      const addr = addressOf(lot);
      if (p.glass && shop) {
        for (const tier of [1, 2] as Tier[]) {
          put(tier, cx(p), cz(p), (s) => {
            onSpot(s, p, 0.006);
            paint.shopDoor(s, p.w, shop, `${addr.number} ${addr.street}`, tier);
          });
        }
      } else if (!p.glass) {
        const flats = lot.kind === 'apartment' ? Math.min(8, Math.max(2, lot.floors * 2)) : lot.kind === 'townhouse' ? Math.min(4, Math.max(1, lot.floors - 1)) : 0;
        if (flats > 0 && open(p, p.w + 0.3)) {
          for (const tier of [1, 2] as Tier[]) {
            put(tier, cx(p), cz(p), (s) => {
              // on the wall beside the door, outside the frame
              const depth = 0.35;
              s.frame(p.x + p.tx * (p.w + 0.2) + p.nx * depth, 1.14, p.z + p.tz * (p.w + 0.2) + p.nz * depth, p.tx, 0, p.tz, 0, 1, 0, 0.003);
              paint.homeBells(s, flats, seed, tier);
            });
          }
        }
        if (seed % 3 === 0) {
          put(2, cx(p), cz(p), (s) => {
            onSpot(s, p, 0.018);
            paint.doorSticker(s, p.w / 2 - 0.065, 1.1, DOOR_NOTES[seed % DOOR_NOTES.length], seed);
          });
        }
      }
    }
    for (const p of spots) {
      if (p.kind === 'number' && p.num !== undefined) {
        const num = p.num,
          style = p.style ?? 0;
        put(1, cx(p), cz(p), (s) => {
          onSpot(s, p, 0.003);
          paint.numberPlate(s, p.w, p.h, num, style);
        });
      } else if (p.kind === 'tenants') {
        for (const tier of [1, 2] as Tier[]) {
          put(tier, cx(p), cz(p), (s) => {
            onSpot(s, p);
            paint.tenantBoard(s, p.w, p.h, (p.seed ?? 1) + p.lot, p.num ?? 4, tier);
          });
        }
      }
    }
  }

  // ── chalk boards on the pavement by the door
  if (closeText(ctx, 'chalkboards')) {
    for (const p of spots) {
      if (p.kind !== 'door' || !p.glass) continue;
      const shop = shopByLot.get(p.lot);
      if (!shop?.chalk || shop.seed % 4 === 3) continue;
      // beside the door, close to the wall; the far side from the walkers' line, only on open pavement
      const side = shop.seed % 2 ? p.w + 0.55 : -0.55;
      const out = (p.seed !== undefined ? 0.35 : 0.35) + 0.42;
      const bx = p.x + p.tx * side + p.nx * out,
        bz = p.z + p.tz * side + p.nz * out;
      const f = occ.get(bx, bz);
      if (f & (OCC.BUILDING | OCC.WATER | OCC.SOLID | OCC.ROAD)) continue;
      const W = 0.56,
        H = 0.86,
        lean = 0.17;
      const un = Math.hypot(H, lean);
      for (const tier of [1, 2] as Tier[]) {
        put(tier, bx, bz, (s) => {
          // an A-frame: the face turned to the street, its back turned away, feet on the pavement
          const uy = H / un,
            uo = -lean / un;
          const y = SIDEWALK_Y + 0.003;
          const fx = bx + p.nx * lean - (p.tx * W) / 2,
            fz = bz + p.nz * lean - (p.tz * W) / 2;
          s.frame(fx, y, fz, p.tx, 0, p.tz, p.nx * uo, uy, p.nz * uo, 0);
          paint.chalkBoard(s, W, un, shop, tier);
          if (tier === 1) {
            const tx = -p.tx,
              tz = -p.tz;
            const bx0 = bx - p.nx * lean - (tx * W) / 2,
              bz0 = bz - p.nz * lean - (tz * W) / 2;
            s.frame(bx0, y, bz0, tx, 0, tz, -p.nx * uo, uy, -p.nz * uo, 0);
            paint.chalkBoard(s, W, un, shop, 1);
            // its shadow on the paving
            s.frame(bx - (p.tx * W) / 2 - p.nx * 0.28, y, bz - (p.tz * W) / 2 - p.nz * 0.28, p.tx, 0, p.tz, p.nx, 0, p.nz, 0.001);
            s.solid(-0.02, 0, W + 0.02, 0.56, 0x000000, 0, 0, 0, 24, 0.28);
          }
        });
      }
    }
  }

  // ── flyposters and notices on blank walls that face somewhere people walk
  if (closeText(ctx, 'flyposters')) {
    for (const p of spots) {
      if (p.kind !== 'wall' || p.w < 1.5) continue;
      const seed = Math.abs(Math.round(p.x * 13 + p.z * 7));
      if (seed % 10 > 3) continue;
      const u = p.w / 2;
      if (!open(p, u)) continue;
      const f = occ.get(p.x + p.tx * u + p.nx * 2, p.z + p.tz * u + p.nz * 2);
      if (!(f & (OCC.SIDEWALK | OCC.ROAD | OCC.PAVED | OCC.PATH))) continue;
      const n = Math.min(3, Math.floor(p.w / 0.8));
      const bw = 0.58,
        bh = 0.84;
      const total = n * (bw + 0.03);
      const u0 = (p.w - total) / 2;
      const yb = 0.85 + (seed % 5) * 0.03;
      for (const tier of [1, 2] as Tier[]) {
        put(tier, p.x + p.tx * u, p.z + p.tz * u, (s) => {
          for (let k = 0; k < n; k++) {
            const sd = seed + k * 17;
            const dy = ((sd % 7) - 3) * 0.008;
            s.frame(p.x + p.tx * (u0 + k * (bw + 0.03)), yb + dy, p.z + p.tz * (u0 + k * (bw + 0.03)), p.tx, 0, p.tz, 0, 1, 0, 0.004 + k * 0.0006);
            if (sd % 5 === 4) paint.noticePaint(s, bw * 0.7, bh * 0.66, sd, tier);
            else paint.billPaint(s, bw, bh, sd, tier);
          }
        });
      }
    }
  }

  // ── things in the street: the kits noted their faces
  const onProp = (s: LetterSink, p: PropSpot, z0 = 0.001): LetterSink => s.frame(p.x, p.y, p.z, p.rx, p.ry, p.rz, p.ux, p.uy, p.uz, z0);
  const pcx = (p: PropSpot): number => p.x + (p.rx * p.w) / 2;
  const pcz = (p: PropSpot): number => p.z + (p.rz * p.w) / 2;
  const stops = stopTable(ctx);

  for (const p of propSpots) {
    switch (p.kind) {
      case 'notice':
        if (!closeText(ctx, 'streetnotices')) break;
        for (const tier of [1, 2] as Tier[]) {
          put(tier, pcx(p), pcz(p), (s) => {
            onProp(s, p);
            paint.noticePaint(s, p.w, p.h, p.seed, tier);
          });
        }
        break;
      case 'bill': {
        if (!closeText(ctx, 'streetnotices')) break;
        // one half of a bill folded over two facets of a column
        const part = p.part ?? 0;
        const W = p.w * 2;
        for (const tier of [1, 2] as Tier[]) {
          put(tier, pcx(p), pcz(p), (s) => {
            s.frame(p.x - p.rx * (part * p.w), p.y, p.z - p.rz * (part * p.w), p.rx, p.ry, p.rz, p.ux, p.uy, p.uz, 0.002);
            s.clip(part * p.w, (part + 1) * p.w);
            paint.billPaint(s, W, p.h, p.seed, tier);
            s.clip();
          });
        }
        break;
      }
      case 'timetable':
      case 'stopflag': {
        if (!closeText(ctx, 'busstops')) break;
        const st = nearestStop(stops, pcx(p), pcz(p));
        if (!st) break;
        if (p.kind === 'timetable') {
          for (const tier of [1, 2] as Tier[]) {
            put(tier, pcx(p), pcz(p), (s) => {
              onProp(s, p);
              paint.timetable(s, p.w, p.h, st, tier);
            });
          }
        } else {
          put(1, pcx(p), pcz(p), (s) => {
            onProp(s, p);
            paint.stopFlag(s, p.w, p.h, st);
          });
        }
        break;
      }
      case 'cover':
        if (!closeText(ctx, 'newspapers')) break;
        for (const tier of [1, 2] as Tier[]) {
          put(tier, pcx(p), pcz(p), (s) => {
            onProp(s, p);
            paint.frontPage(s, p.w, p.h, p.seed, tier);
          });
        }
        break;
      case 'placard':
        if (!closeText(ctx, 'newspapers')) break;
        put(1, pcx(p), pcz(p), (s) => {
          onProp(s, p);
          paint.placardPaint(s, p.w, p.h, p.seed);
        });
        break;
      case 'mailplate':
        if (!closeText(ctx, 'streetlabels')) break;
        put(2, pcx(p), pcz(p), (s) => {
          onProp(s, p);
          paint.mailPlate(s, p.w, p.h, Math.abs(Math.round(p.x * 7 + p.z * 3)));
        });
        break;
      case 'mailcrest':
        if (!closeText(ctx, 'streetlabels')) break;
        put(1, pcx(p), pcz(p), (s) => {
          onProp(s, p);
          s.fadeAt(16);
          s.text('POST', p.w / 2, p.h * 0.28, p.h * 0.56, { face: FACE.SERIF_B, color: 0x4a3510, align: 'center', maxW: p.w * 0.9 });
        });
        break;
      case 'plaque':
        if (!closeText(ctx, 'streetlabels')) break;
        put(2, pcx(p), pcz(p), (s) => {
          s.frame(p.x + (p.rx * p.w) / 2, p.y, p.z + (p.rz * p.w) / 2, p.rx, p.ry, p.rz, p.ux, p.uy, p.uz, 0.001);
          paint.benchPlaque(s, p.seed);
        });
        break;
    }
  }

  // ── street names: a post with two blades at a corner of every junction
  if (closeText(ctx, 'streetnames')) {
    for (const node of ctx.plan.roadNodes) {
      if (node.kind !== 'junction') continue;
      const ix = XS.findIndex((v) => Math.abs(v - node.x) < 5),
        iz = ZS.findIndex((v) => Math.abs(v - node.z) < 5);
      if (ix < 0 && iz < 0) continue;
      const ns = ix >= 0 ? NS_NAMES[ix] : null,
        ew = iz >= 0 ? EW_NAMES[iz] : null;
      let px = 0,
        pz = 0,
        found = false;
      for (const [dx, dz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        px = node.x + dx * 4.7;
        pz = node.z + dz * 4.7;
        const px0 = px,
          pz0 = pz;
        if (!(occ.get(px, pz) & OCC.SIDEWALK)) continue;
        if (ctx.plan.slots.some((sl) => Math.hypot(sl.x - px0, sl.z - pz0) < 1.1)) continue;
        found = true;
        break;
      }
      if (!found) continue;
      const fx = px,
        fz = pz;
      put(0, fx, fz, (s) => {
        s.fadeAt(46);
        // the post, four faces
        const hw = 0.028,
          top = 2.72;
        const y0 = SIDEWALK_Y;
        for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          s.wall(fx + nx * hw, y0, fz + nz * hw, nx, nz, 0).solid(-hw, 0, hw, top - y0, 0x3e4448);
        }
        const blade = (name: string, y: number, nx: number, nz: number) => {
          // both faces of a blade: the side of a thin box
          const W = 0.92,
            H = 0.17;
          for (const sgn of [1, -1]) {
            const ax = sgn * nx,
              az = sgn * nz;
            // right of a wall facing (ax, az) is (az, -ax)
            s.wall(fx + ax * 0.03 - (az * W) / 2, y, fz + az * 0.03 + (ax * W) / 2, ax, az, 0);
            s.solid(0, 0, W, H, 0xf1efe8);
            s.solid(0.012, 0.012, W - 0.012, 0.018, 0x1b1c1e, 0.0005);
            s.solid(0.012, H - 0.018, W - 0.012, H - 0.012, 0x1b1c1e, 0.0005);
            s.solid(0.012, 0.012, 0.018, H - 0.012, 0x1b1c1e, 0.0005);
            s.solid(W - 0.018, 0.012, W - 0.012, H - 0.012, 0x1b1c1e, 0.0005);
            const up = name.toUpperCase();
            const size = s.fit(up, W - 0.08, 0.09, FACE.HUMAN, 0.04);
            s.text(up, W / 2, H / 2 - size * 0.34, size, { face: FACE.HUMAN, color: 0x16181a, align: 'center', z: 0.001, track: 0.04, weight: 0.1 });
          }
        };
        if (ew) blade(ew, 2.46, 0, 1);
        if (ns) blade(ns, 2.26, 1, 0);
      });
    }
  }

  // ── the bubble's layers
  RINGS.forEach((ring, t) => {
    const g = grids[t];
    near.addMeshes({
      name: ring.name,
      radius: ring.radius,
      cell: ring.cell,
      top: ring.top,
      material,
      standIn: standIn(),
      renderOrder: ring.renderOrder,
      build(c) {
        const list = g.get((c.i + 32768) * 65536 + (c.j + 32768));
        if (!list) return null;
        sink.reset();
        for (const it of list) it.draw(sink);
        return sink.finish();
      },
    });
  });

  ctx.services.lettering = { props: propSpots, spots };
  return {
    name,
    frame() {
      uHour.value = ctx.clock.hours;
    },
    stats: () => ({ items, shops: shopByLot.size, on: textOn() ? 1 : 0 }),
  };
}

function stopTable(ctx: CityContext): (StopInfo & { x: number; z: number })[] {
  const { busStops, busRoutes } = ctx.plan;
  return busStops.map((b) => {
    const route = busRoutes[b.route] ?? busRoutes[0];
    const same = busStops.filter((o) => o.route === b.route);
    const i = same.indexOf(b);
    const next: string[] = [];
    for (let k = 1; k < same.length; k++) next.push(same[(i + k) % same.length].name);
    return {
      x: b.x,
      z: b.z,
      name: b.name,
      line: route.id + 1,
      color: parseInt(route.color.slice(1), 16),
      next,
      from: same[0].name,
      to: same[same.length - 1 - (i === same.length - 1 ? same.length - 1 : 0)].name,
      offset: 2 + i * 4,
      headway: route.id === 0 ? 12 : 15,
    };
  });
}

function nearestStop<T extends { x: number; z: number }>(stops: T[], x: number, z: number): T | null {
  let best: T | null = null,
    bd = 36;
  for (const st of stops) {
    const d = (st.x - x) ** 2 + (st.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = st;
    }
  }
  return best;
}

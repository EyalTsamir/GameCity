// Module "props": street furniture. Street lamps (style by district) + lamps along park paths,
// the riverbank walk, plazas and the boardwalk; benches (street slots + every plan bench, matching
// the pedestrians' seats), bins, hydrants, bike racks with bikes, planters, mailboxes, red phone
// boxes, newsstands, glass bus shelters with route-coloured stop poles, garden picket fences and
// low walls (gaps at driveways and door paths), plaza bollards, allotment sheds and water butts.
//
// Draw calls: furniture (1, merged, per-vertex roughness/metalness + night emission),
// glass (1, transparent), light pools + halos (1, additive). No shadow casters.

import { binSimple, bollardSimple, newsstandSimple, phoneboxSimple, planterBoxSimple } from './props/legacy';
import * as THREE from 'three';
import type { CityContext, CityModule } from './../core/context';
import { OCC } from '../core/occupancy';
import { SIDEWALK_Y } from '../core/constants';
import { Rng, hash01 } from '../core/rng';
import type { DistrictKind } from '../core/plan';
import { GeoSink, staticMesh } from './vegetation/geo';
import { getLayout, occAny, PLANTER, hrand, MASK_WALK, DistanceLod, ChunkCuller, chunkOf } from './props/layout';
import { furnitureMaterial, glassMaterial } from './props/material';
import { createGlowMesh, type Glow } from './props/glow';
import { Kit, lamp, bench, bin, hydrant, mailbox, phonebox, newsstand, planterBox, bollard, bikeRack, busShelter, picketFence, lowWall, shed, waterButt, FENCE_PAINT } from './props/furniture';
import * as GK from './props/garden';
import * as SK from './props/kit';
import { planScatter, scatterDisc, type ScatterItem } from './props/scatter';
import type { PropsService, ChairOut, Cafe } from './props/service';
import type { BuildingsService } from './buildings/anchors';
import { Builder } from './buildings/mesh';
import { GREEN, GreenKit, makeGreenTexture, createGreenMaterial } from './buildings/green';
import { sideGeom } from './buildings/gen';
import { XS, ZS, FURN_OFFSET } from '../core/constants';
import { addLampLights, type LampLight } from '../core/lampLight';
import { buildContactMesh, takeQueuedContacts, type ContactSpot } from './props/contact';

interface TerrainSvc {
  height(x: number, z: number): number;
}

export default function create(ctx: CityContext): CityModule {
  const t0 = performance.now();
  const plan = ctx.plan,
    occ = ctx.occupancy;
  const terrain = ctx.services.terrain as TerrainSvc | undefined;
  const H = (x: number, z: number): number => (terrain ? terrain.height(x, z) : plan.heightAt(x, z));
  const layout = getLayout(ctx);
  const extras = [
    { name: 'aRM', size: 2 },
    { name: 'aEmit', size: 4 },
  ];
  // coarse furniture (lamps, shelters, kiosks, sheds) + fine furniture (benches, bins, fences...: hidden far away)
  const KC = [new Kit(new GeoSink(extras)), new Kit(new GeoSink(extras))];
  const KF = [new Kit(new GeoSink(extras)), new Kit(new GeoSink(extras))];
  let k = KC[0],
    kf = KF[0];
  /** select the west / east chunk for world x */
  const sel = (x: number) => {
    k = KC[chunkOf(x)];
    kf = KF[chunkOf(x)];
  };
  // big silhouettes of the hardscape / garden kits (sheds, parasols, trampolines, kiosks, skips…): cast shadows
  const KS = new Kit(new GeoSink(extras));
  const gsink = new GeoSink(extras);
  const g = new Kit(gsink);
  // static laundry on the garden rotary dryers (own small mesh: life may replace it with animated cloth)
  const KL = new Kit(new GeoSink(extras));
  // leaf cards (planter planting): shared atlas + material with the buildings greenery; one draw call, no shadow
  const noGreen = ctx.debug.params.has('nogreen');
  const greenB = new Builder({ normal: true, color: true, uv: true, aux: true });
  const greenKit = noGreen ? undefined : new GreenKit(greenB, new Rng('props:green'));
  const glows: Glow[] = [];
  const count: Record<string, number> = {};
  const inc = (key: string) => (count[key] = (count[key] ?? 0) + 1);
  const rng = ctx.rng('props');
  // real-object furniture (bins, planters, phone boxes, newsstands, bollards) or the old primitives (low tier, ?nopropdetail)
  const simple = ctx.debug.params.has('nopropdetail') || ctx.quality.level === 'low';
  const noLampDetail = ctx.debug.params.has('nolampdetail') || ctx.quality.level === 'low';

  /** local → world for a frame at (x, z) with yaw */
  const toWorld = (x: number, z: number, yaw: number, lx: number, lz: number): [number, number] => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  // ground grime where furniture meets the paving (props/contact.ts; ?nocontact, off on low)
  const noContact = ctx.debug.params.has('nocontact') || ctx.quality.level === 'low';
  const spots: ContactSpot[] = noContact ? [] : takeQueuedContacts(ctx);
  /** footprint (local offset lx, lz in the frame x, z, yaw; half extents hw × hd, corner radius r) */
  const spot = (x: number, y: number, z: number, yaw: number, lx: number, lz: number, hw: number, hd: number, r: number, pad: number, kk: number) => {
    if (noContact) return;
    const [wx, wz] = toWorld(x, z, yaw, lx, lz);
    spots.push({ x: wx, y: y + 0.012, z: wz, yaw, hw, hd, r, pad, k: kk });
  };

  // ─────────────────────────────────────────────────────────── lamps ──
  for (const l of layout.lamps) {
    const y = l.street ? l.y : Math.max(l.y, H(l.x, l.z));
    sel(l.x);
    k.sh.frame(l.x, y, l.z, l.yaw);
    kf.sh.frame(l.x, y, l.z, l.yaw);
    // near-only lamp-post detail (W5: mouldings, flanges, bolts, hatches, lantern frames; ?nolampdetail, off on low)
    const head = lamp(k, l.style, l.street, new Rng(Math.floor(hash01(l.x, l.z, 5) * 1e9)), noLampDetail ? undefined : kf);
    spot(l.x, y, l.z, 0, 0, 0, 0.14, 0.14, 0.14, 0.22, 0.5);
    const [hx, hz] = toWorld(l.x, l.z, l.yaw, head.x, head.z);
    glows.push({ x: hx, y: y + head.y, z: hz, size: head.halo, halo: true, color: head.color, intensity: 1.0 });
    const gy = l.street ? SIDEWALK_Y + 0.025 : Math.max(H(hx, hz), y) + 0.04;
    glows.push({ x: hx, y: gy, z: hz, size: head.pool * 0.88, halo: false, color: head.color, intensity: l.style === 'modern' || l.style === 'plaza' ? 0.19 : 0.23 });
    inc(`lamp_${l.style}`);
  }

  // ─────────────────────────────────────────────────────────── benches ──
  for (const b of layout.benches) {
    const ground = b.sidewalk ? SIDEWALK_Y : H(b.x, b.z);
    const brng = new Rng(Math.floor(hash01(b.x, b.z, 7) * 1e9));
    sel(b.x);
    kf.sh.frame(b.x, b.y, b.z, b.yaw);
    bench(kf, b.style, brng, Math.max(0, b.y - ground) + 0.02);
    // grime at the feet, a lighter scuffed patch where feet rest in front
    for (const lx of [-0.72, 0.72]) spot(b.x, ground, b.z, b.yaw, lx, -0.02, 0.06, 0.24, 0.04, 0.16, 0.55);
    spot(b.x, ground, b.z, b.yaw, 0, 0.45, 0.75, 0.18, 0.18, 0.3, 0.22);
    inc('bench');
    // a litter bin beside some park benches
    if (!b.sidewalk && brng.chance(0.45)) {
      const side = brng.chance(0.5) ? 1 : -1;
      const [x, z] = toWorld(b.x, b.z, b.yaw, side * 1.3, -0.05);
      if (!occAny(occ, x, z, 0.3, OCC.PATH | OCC.SOLID | OCC.BUILDING | OCC.WATER | OCC.ROAD | OCC.SIDEWALK) && !(layout.walk.get(x, z) & MASK_WALK)) {
        sel(x);
        kf.sh.frame(x, Math.max(H(x, z), b.y), z, b.yaw);
        if (simple) binSimple(kf, b.style === 'modern');
        else bin(kf, b.style === 'modern', brng);
        spot(x, Math.max(H(x, z), b.y), z, b.yaw, 0, 0, 0.27, 0.27, 0.27, 0.22, 0.6);
        inc('bin');
      }
    }
  }

  // ──────────────────────────────────────────────────── slot furniture ──
  const modernD = (d: DistrictKind) => d === 'downtown' || d === 'midtown' || d === 'station';
  for (const s of plan.slots) {
    const srng = new Rng(Math.floor(hash01(s.x, s.z, 13) * 1e9));
    const y = SIDEWALK_Y;
    switch (s.kind) {
      case 'bin':
        sel(s.x);
        kf.sh.frame(s.x, y, s.z, s.yaw);
        if (simple) binSimple(kf, modernD(s.district));
        else bin(kf, modernD(s.district), srng);
        spot(s.x, y, s.z, s.yaw, 0, 0, 0.27, 0.27, 0.27, 0.24, 0.65);
        inc('bin');
        break;
      case 'hydrant':
        sel(s.x);
        kf.sh.frame(s.x, y, s.z, s.yaw);
        hydrant(kf, s.district === 'industrial' || s.district === 'harbor');
        spot(s.x, y, s.z, s.yaw, 0, 0, 0.14, 0.14, 0.14, 0.2, 0.55);
        inc('hydrant');
        break;
      case 'bikerack':
        sel(s.x);
        kf.sh.frame(s.x, y, s.z, s.yaw);
        bikeRack(kf, srng);
        spot(s.x, y, s.z, s.yaw, 0, 0, 0.9, 0.12, 0.1, 0.25, 0.35);
        inc('bikerack');
        break;
      case 'planter': {
        sel(s.x);
        kf.sh.frame(s.x, y, s.z, s.yaw);
        const d = s.district;
        const kind = modernD(d) ? 'concrete' : d === 'oldtown' || d === 'market' ? 'terracotta' : d === 'civic' ? 'steel' : 'wood';
        (simple ? planterBoxSimple : planterBox)(kf, kind, PLANTER.along, PLANTER.across, PLANTER.height);
        // drainage: soil washed out of the weep holes darkens the paving around the trough
        spot(s.x, y, s.z, s.yaw, 0, 0, PLANTER.along / 2, PLANTER.across / 2, 0.04, 0.32, 0.75);
        // planting spilling over the rim (vegetation fills the soil): trailing ivy / petunias over one to
        // three sides, sometimes a tall grass or lavender accent at one end — no two troughs alike
        if (greenKit && !simple) {
          const hk = (k: number) => hash01(s.x + k * 3.1, s.z - k * 1.7, 41 + k);
          greenB.frame(s.yaw, s.x, y, s.z);
          const hx = PLANTER.along / 2, hz = PLANTER.across / 2;
          const trail = hk(1) < 0.5 ? GREEN.IVY_HANG : GREEN.PETUNIA;
          for (const side of [0, 1, 2, 3] as const) {
            if (hk(2 + side) < (side % 2 ? 0.5 : 0.12)) continue;
            const sg = sideGeom({ x0: -hx, x1: hx, z0: -hz, z1: hz }, side);
            const a0 = sg.L * 0.35 * hk(9 + side);
            greenKit.hang(sg, a0, sg.L - 0.04, 0.03, PLANTER.height + 0.03, 0.2, 0.3 + 0.2 * hk(14 + side), trail, 0.06, 1, 0.06);
          }
          if (hk(20) < 0.55) greenKit.clump((hk(21) < 0.5 ? -1 : 1) * hx * 0.62, PLANTER.soil - 0.02, 0, 0.17, 0.45 + 0.3 * hk(22), hk(23) < 0.5 ? GREEN.GRASS : GREEN.LAVENDER, 3);
        }
        inc('planter');
        break;
      }
      case 'mailbox':
        sel(s.x);
        kf.sh.frame(s.x, y, s.z, s.yaw);
        mailbox(kf);
        spot(s.x, y, s.z, s.yaw, 0, 0, 0.16, 0.16, 0.12, 0.2, 0.5);
        inc('mailbox');
        break;
      case 'phonebox': {
        sel(s.x);
        k.sh.frame(s.x, y, s.z, s.yaw);
        k.sh.local(0, 0, 0.15);
        if (simple) phoneboxSimple(k);
        else phonebox(k, g);
        spot(s.x, y, s.z, s.yaw, 0, 0.15, 0.48, 0.48, 0.03, 0.22, 0.6);
        const [x, z] = toWorld(s.x, s.z, s.yaw, 0, 0.15);
        glows.push({ x, y: y + 0.03, z, size: 1.5, halo: false, color: '#ffd59a', intensity: 0.2 });
        inc('phonebox');
        break;
      }
      case 'newsstand': {
        sel(s.x);
        k.sh.frame(s.x, y, s.z, s.yaw);
        k.sh.local(0, 0, 0.25);
        (simple ? newsstandSimple : newsstand)(k, srng);
        spot(s.x, y, s.z, s.yaw, 0, 0.2, 0.93, 0.58, 0.03, 0.26, 0.6);
        // trodden patch in front of the counter
        spot(s.x, y, s.z, s.yaw, 0, 1.05, 0.7, 0.25, 0.25, 0.35, 0.25);
        const [x, z] = toWorld(s.x, s.z, s.yaw, 0, 1.0);
        glows.push({ x, y: y + 0.03, z, size: 1.8, halo: false, color: '#ffe2a8', intensity: 0.16 });
        inc('newsstand');
        break;
      }
      case 'busstop': {
        const bs = s.busStop !== undefined ? plan.busStops[s.busStop] : undefined;
        const route = bs ? plan.busRoutes[bs.route] : undefined;
        sel(s.x);
        k.sh.frame(s.x, y, s.z, s.yaw);
        g.sh.frame(s.x, y, s.z, s.yaw);
        const res = busShelter(k, g, route?.color ?? '#d94a3d', srng);
        for (const lx of [-1.9, 1.9]) spot(s.x, y, s.z, s.yaw, lx, 0.25, 0.06, 0.55, 0.05, 0.16, 0.5);
        spot(s.x, y, s.z, s.yaw, 0, 0.25, 1.85, 0.5, 0.3, 0.3, 0.25);
        for (const gl of res.glows) {
          const [x, z] = toWorld(s.x, s.z, s.yaw, gl.x, gl.z);
          glows.push({ x, y: y + gl.y - 0.15 + 0.03, z, size: gl.size, halo: false, color: '#fff1d6', intensity: 0.24, stretch: 1.5, yaw: s.yaw });
        }
        inc('busstop');
        break;
      }
      default:
        break;
    }
  }

  // ─────────────────────────────────────────────── garden fences & walls ──
  let fenceM = 0;
  for (const b of layout.borders) {
    if (b.style === 'hedge') continue;
    const dx = b.bx - b.ax,
      dz = b.bz - b.az;
    const L = Math.hypot(dx, dz);
    if (L < 0.5) continue;
    const yaw = Math.atan2(-dz, dx);
    sel(b.ax);
    kf.sh.frame(b.ax, H(b.ax, b.az), b.az, yaw);
    if (b.style === 'picket') picketFence(kf, L, FENCE_PAINT[b.paint % FENCE_PAINT.length], b.gateA, b.gateB);
    else lowWall(kf, L, hrand(`wall:${b.lot}`) < 0.55, b.gateA, b.gateB);
    fenceM += L;
    inc(b.style);
  }

  // ────────────────────────────────────────────── hardscape scatter ──
  // (after vegetation planted its trees; before the bollards, which keep clear of it)
  // café seats are exposed as ctx.services.props (streetlife seats patrons there)
  let staticLaundry = true;
  const service: PropsService = {
    cafes: [],
    discs: layout.furniture,
    bbqs: [],
    washing: [],
    setStaticLaundry(on: boolean) {
      staticLaundry = on;
    },
  };
  const chairs: ChairOut[] = [];
  /** café terrace lights for the night lamp map (registered below, before the lamps module bakes) */
  const terraceLights: LampLight[] = [];
  let scatter: ScatterItem[] = [];
  if (!ctx.debug.params.has('noscatter')) {
    const vegTrees = (ctx.services.vegetation as { trees?: { x: number; z: number; r: number; h: number }[] } | undefined)?.trees ?? [];
    scatter = planScatter({ plan, occ, walkAt: (x, z) => (layout.walk.get(x, z) & MASK_WALK) !== 0, trees: vegTrees, discs: layout.furniture });
    const stationBlock = plan.lots.find((l) => l.kind === 'station')?.blockId ?? -1;
    for (const it of scatter) {
      const srng = new Rng(it.seed || 1);
      const y = H(it.x, it.z) + 0.02;
      const at = (kit: Kit) => kit.sh.frame(it.x, y, it.z, it.yaw);
      switch (it.kind) {
        case 'cafe': {
          at(kf);
          at(KS);
          chairs.length = 0;
          const shade = SK.cafe(kf, KS, srng, undefined, chairs);
          const sb = plan.blocks[stationBlock]?.rect;
          const inStation = !!sb && it.x > sb.x0 && it.x < sb.x1 && it.z > sb.z0 && it.z < sb.z1;
          const nearKiosk = scatter.some((o) => o.kind === 'kiosk' && Math.hypot(o.x - it.x, o.z - it.z) < 7.5);
          const cafe: Cafe = { x: it.x, z: it.z, yaw: it.yaw, tableY: y + 0.755, tableR: 0.36, seats: [], parasol: shade, source: inStation ? 'station' : nearKiosk ? 'kiosk' : 'plaza' };
          for (const c of chairs) cafe.seats.push({ x: c.sx, z: c.sz, yaw: Math.atan2(c.fx - c.sx, c.fz - c.sz), seatY: c.sy });
          service.cafes.push(cafe);
          // night: a warm lamp hung under the parasol (or a lantern on bare tables), registered in the lamp map
          if (shade) {
            kf.m('#3b3f42', 'iron');
            kf.sh.cyl(0, 2.02, 0, 0.012, 0.012, 0.24, 4, 0);
            kf.e('#fff1d6', '#ffbf6a', 2.6);
            kf.sh.ellipsoid(0, 1.98, 0, 0.09, 0.07, 0.09, 0);
            glows.push({ x: it.x, y: y + 1.98, z: it.z, size: 0.45, halo: true, color: '#ffc27a', intensity: 0.7 });
            terraceLights.push({ x: it.x, y: y + 1.98, z: it.z, pole: 1.98, radius: 2.8, color: '#ffc27a', intensity: 0.42, kind: 'plaza' });
          } else {
            kf.e('#fff1d6', '#ffbf6a', 2.2);
            kf.sh.cyl(0.12, 0.755, -0.08, 0.035, 0.035, 0.09, 6, 2);
            terraceLights.push({ x: it.x, y: y + 0.9, z: it.z, pole: 0.9, radius: 1.5, color: '#ffc27a', intensity: 0.22, kind: 'spill' });
          }
          break;
        }
        case 'kiosk':
          at(KS);
          at(kf);
          SK.kiosk(KS, kf, srng);
          break;
        case 'planter':
        case 'planterRound':
          at(kf);
          greenB.frame(it.yaw, it.x, y, it.z);
          SK.planter(kf, srng, it.kind === 'planterRound', greenKit);
          break;
        case 'bikeRack': {
          at(kf);
          const inStation = plan.blocks[stationBlock] && it.x > plan.blocks[stationBlock].rect.x0 && it.x < plan.blocks[stationBlock].rect.x1 && it.z > plan.blocks[stationBlock].rect.z0 && it.z < plan.blocks[stationBlock].rect.z1;
          SK.bikeRow(kf, srng, inStation ? 0.58 : 0.4);
          break;
        }
        case 'infoBoard':
          at(kf);
          SK.infoBoard(kf, srng);
          break;
        case 'sculpture':
          at(KS);
          SK.sculpture(KS, srng);
          break;
        case 'clock':
          at(KS);
          SK.clockPost(KS);
          break;
        case 'vending':
          at(kf);
          SK.vending(kf, srng);
          break;
        case 'trolleys':
          at(kf);
          SK.trolleys(kf, srng);
          break;
        case 'pallets':
          at(kf);
          SK.pallets(kf, srng);
          break;
        case 'palletGoods':
          at(kf);
          SK.palletGoods(kf, srng);
          break;
        case 'drums':
          at(kf);
          SK.drums(kf, srng);
          break;
        case 'skip':
          at(KS);
          SK.skip(KS, srng);
          break;
        case 'forklift':
          at(KS);
          SK.forklift(KS, srng);
          break;
        case 'crates':
          at(kf);
          SK.crates(kf, srng);
          break;
        case 'cableReel':
          at(kf);
          SK.cableReel(kf, srng);
          break;
        case 'gasCage':
          at(kf);
          SK.gasCage(kf, srng);
          break;
        case 'ibc':
          at(kf);
          SK.ibc(kf, srng);
          break;
        case 'dumpster':
          at(KS);
          SK.dumpster(KS, srng);
          break;
        case 'fishBoxes':
          at(kf);
          SK.fishBoxes(kf, srng);
          break;
        case 'nets':
          at(kf);
          SK.nets(kf, srng);
          break;
        case 'pots':
          at(kf);
          SK.pots(kf, srng);
          break;
        case 'rope':
          at(kf);
          SK.rope(kf, srng);
          break;
        case 'ticketMachine':
          at(kf);
          SK.ticketMachine(kf);
          break;
        case 'evCharger':
          at(kf);
          SK.evCharger(kf);
          break;
        case 'bottleBank':
          at(KS);
          SK.bottleBank(KS, srng);
          break;
        case 'pingpong':
          at(kf);
          SK.pingpong(kf);
          break;
        case 'bins':
          at(kf);
          SK.binRow(kf, srng);
          break;
        case 'sleepers':
          at(k);
          SK.sleepers(k, srng);
          break;
        case 'heap':
          at(k);
          SK.heap(k, srng);
          break;
        case 'courtTable':
          at(kf);
          SK.courtTable(kf, srng);
          break;
        case 'bikes':
          at(kf);
          SK.leaningBikes(kf, srng);
          break;
        case 'container':
          at(KS);
          SK.container(KS, srng);
          break;
        case 'pipes':
          at(kf);
          SK.pipes(kf, srng);
          break;
        case 'timber':
          at(kf);
          SK.timber(kf, srng);
          break;
        case 'taxiSign':
          at(kf);
          SK.taxiSign(kf);
          break;
      }
      inc(`s_${it.kind}`);
      layout.furniture.push(scatterDisc(it));
    }
  }

  // ─────────────────────────────────────────── kerbside café tables ──
  // two-seat bistro tables in the furniture band in front of cafés, bars and bakeries (Tel-Aviv / Paris
  // street cue); clear of lamps, trees, benches, bins, bus stops and the crosswalk zones
  let kerbTables = 0;
  if (!ctx.debug.params.has('noscatter')) {
    const shops = (ctx.services.buildings as BuildingsService | undefined)?.shops ?? [];
    const vegTrees = (ctx.services.vegetation as { trees?: { x: number; z: number; r: number }[] } | undefined)?.trees ?? [];
    const nearest = (v: number, list: readonly number[]) => list.reduce((b, c) => (Math.abs(c - v) < Math.abs(b - v) ? c : b), list[0]);
    for (const sh of shops) {
      if (sh.type !== 1 && sh.type !== 2) continue;
      const alongX = Math.abs(sh.nz) > 0.5;
      // street centre line in front of the facade, then the furniture band on the facade's side of it
      const c = alongX ? nearest(sh.az + sh.nz * 8, ZS) : nearest(sh.ax + sh.nx * 8, XS);
      const band = c - (alongX ? sh.nz : sh.nx) * FURN_OFFSET;
      const L = Math.hypot(sh.bx - sh.ax, sh.bz - sh.az);
      const n = Math.floor((L - 1.0) / 2.0);
      const krng = new Rng(Math.floor(hash01(sh.ax, sh.az, 31) * 1e9) || 1);
      // menu board in the furniture band in line with the door
      {
        const x = alongX ? sh.doorX : band,
          z = alongX ? band : sh.doorZ;
        const free =
          occ.has(x, z, OCC.SIDEWALK) &&
          !layout.furniture.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + 0.55) &&
          !vegTrees.some((tr) => Math.hypot(tr.x - x, tr.z - z) < 0.9) &&
          !layout.walk.anyInCircle(x, z, 0.2, MASK_WALK) &&
          (alongX ? Math.abs(x - nearest(x, XS)) : Math.abs(z - nearest(z, ZS))) > 8.5;
        if (free) {
          sel(x);
          // boards face along the pavement, towards the people walking up to the café
          kf.sh.frame(x, SIDEWALK_Y + 0.005, z, alongX ? Math.PI / 2 : 0);
          SK.aFrame(kf, krng);
          layout.furniture.push({ x, z, r: 0.45 });
          inc('aFrame');
        }
      }
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5 + (L - 1.0 - n * 2.0) / 4.0) / n;
        const fx = sh.ax + (sh.bx - sh.ax) * (0.5 / L + t * (1 - 1.0 / L)),
          fz = sh.az + (sh.bz - sh.az) * (0.5 / L + t * (1 - 1.0 / L));
        const x = alongX ? fx : band,
          z = alongX ? band : fz;
        // away from junctions (crosswalks, dropped kerbs)
        const jd = alongX ? Math.abs(x - nearest(x, XS)) : Math.abs(z - nearest(z, ZS));
        if (jd < 9.5) continue;
        const ax = alongX ? 1 : 0,
          az = alongX ? 0 : 1;
        let ok = true;
        for (const s2 of [-0.85, 0, 0.85]) if (!occ.has(x + ax * s2, z + az * s2, OCC.SIDEWALK)) ok = false;
        if (!ok) continue;
        if (layout.furniture.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + 0.95)) continue;
        if (vegTrees.some((tr) => Math.hypot(tr.x - x, tr.z - z) < 1.25)) continue;
        if (plan.slots.some((sl) => (sl.kind === 'busstop' ? Math.hypot(sl.x - x, sl.z - z) < 6 : Math.hypot(sl.x - x, sl.z - z) < 1.3))) continue;
        if (layout.walk.anyInCircle(x, z, 0.3, MASK_WALK)) continue;
        const yaw = alongX ? 0 : Math.PI / 2;
        sel(x);
        kf.sh.frame(x, SIDEWALK_Y + 0.005, z, yaw);
        chairs.length = 0;
        SK.kerbCafe(kf, krng, chairs);
        const cafe: Cafe = { x, z, yaw, tableY: SIDEWALK_Y + 0.755, tableR: 0.29, seats: [], parasol: false, source: 'sidewalk' };
        for (const ch of chairs) cafe.seats.push({ x: ch.sx, z: ch.sz, yaw: Math.atan2(ch.fx - ch.sx, ch.fz - ch.sz), seatY: ch.sy });
        service.cafes.push(cafe);
        layout.furniture.push({ x, z, r: 1.0 });
        // table lantern + its warm pool (the shop window spill and the awning lights do the rest)
        kf.e('#fff1d6', '#ffbf6a', 2.2);
        kf.sh.cyl(0.09, 0.755, 0.09, 0.035, 0.035, 0.09, 6, 2);
        terraceLights.push({ x, y: SIDEWALK_Y + 0.9, z, pole: 0.9, radius: 1.6, color: '#ffc27a', intensity: 0.25, kind: 'spill' });
        kerbTables++;
        inc('kerbCafe');
      }
    }
  }

  // ───────────────────────────────────────────────────────── bollards ──
  {
    const vegTrees = (ctx.services.vegetation as { trees?: { x: number; z: number }[] } | undefined)?.trees ?? [];
    for (const a of plan.areas) {
      if (a.kind !== 'plaza') continue;
      const blk = plan.blocks[a.blockId];
      if (!blk || (blk.kind !== 'civic' && blk.kind !== 'downtown' && blk.kind !== 'station')) continue;
      const r = a.rect,
        br = blk.rect;
      const edges: [number, number, number, number, number, number][] = [];
      // [ax, az, bx, bz, inward nx, nz] for rect edges that lie on the block boundary (next to a sidewalk)
      if (Math.abs(r.z0 - br.z0) < 0.05) edges.push([r.x0, r.z0, r.x1, r.z0, 0, 1]);
      if (Math.abs(r.z1 - br.z1) < 0.05) edges.push([r.x0, r.z1, r.x1, r.z1, 0, -1]);
      if (Math.abs(r.x0 - br.x0) < 0.05) edges.push([r.x0, r.z0, r.x0, r.z1, 1, 0]);
      if (Math.abs(r.x1 - br.x1) < 0.05) edges.push([r.x1, r.z0, r.x1, r.z1, -1, 0]);
      for (const [ax, az, bx, bz, nx, nz] of edges) {
        const L = Math.hypot(bx - ax, bz - az);
        const n = Math.floor(L / 2.2);
        for (let i = 1; i < n; i++) {
          const t = i / n;
          const x = ax + (bx - ax) * t + nx * 0.45,
            z = az + (bz - az) * t + nz * 0.45;
          if (layout.walk.anyInCircle(x, z, 0.15, MASK_WALK)) continue;
          if (occAny(occ, x, z, 0.3, OCC.PATH | OCC.SOLID | OCC.BUILDING | OCC.PAVED)) continue;
          if (layout.furniture.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + 0.6)) continue;
          if (vegTrees.some((tr) => Math.hypot(tr.x - x, tr.z - z) < 1.3)) continue;
          if (!occAny(occ, x - nx * 1.0, z - nz * 1.0, 0.2, OCC.SIDEWALK)) continue;
          sel(x);
          kf.sh.frame(x, H(x, z) + 0.01, z, 0);
          if (simple) bollardSimple(kf, blk.kind === 'civic' ? 'stone' : 'steel');
          else bollard(kf, blk.kind === 'civic' ? 'stone' : blk.kind === 'station' ? 'iron' : 'steel');
          spot(x, H(x, z), z, 0, 0, 0, 0.1, 0.1, 0.1, 0.18, 0.55);
          inc('bollard');
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────── allotments ──
  for (const p of layout.plots) {
    const prng = new Rng(Math.floor(hash01(p.rect.x0, p.rect.z0, 21) * 1e9));
    if (p.shed) {
      sel(p.shed.x);
      k.sh.frame(p.shed.x, H(p.shed.x, p.shed.z), p.shed.z, p.shed.yaw);
      shed(k, p.shed.paint, prng);
      inc('shed');
    }
    if (p.barrel) {
      sel(p.barrel.x);
      kf.sh.frame(p.barrel.x, H(p.barrel.x, p.barrel.z), p.barrel.z, 0);
      waterButt(kf, prng);
      inc('waterbutt');
    }
  }

  // ───────────────────────────────────────────────────────── gardens ──
  for (const gp of layout.gardens) {
    const pr = gp.patio;
    const patioY = gp.patioMat === 2 ? 0.13 : 0.045;
    for (const it of gp.items) {
      const grng = new Rng(it.seed || 1);
      const onPatio = !!pr && it.x > pr.x0 && it.x < pr.x1 && it.z > pr.z0 && it.z < pr.z1;
      const y = onPatio ? Math.max(H(it.x, it.z), patioY) : H(it.x, it.z);
      const at = (kit: Kit) => kit.sh.frame(it.x, y, it.z, it.yaw);
      switch (it.kind) {
        case 'shed':
          at(KS);
          GK.gardenShed(KS, grng, it.w, it.d);
          break;
        case 'parasol':
          at(KS);
          GK.parasol(KS, grng, 1.25, 2.3);
          break;
        case 'trampoline':
          at(KS);
          GK.trampoline(KS, grng);
          break;
        case 'swing':
          at(KS);
          GK.swingSet(KS, grng, it.w);
          break;
        case 'playhouse':
          at(KS);
          GK.playhouse(KS, grng, it.w, it.d);
          break;
        case 'greenhouse':
          at(KS);
          g.sh.frame(it.x, y, it.z, it.yaw);
          GK.greenhouse(KS, g, grng, it.w, it.d);
          break;
        case 'roundPool':
          at(KS);
          GK.roundPool(KS, grng, it.w);
          break;
        case 'pool':
          at(k);
          GK.pool(k, grng, it.w, it.d);
          break;
        case 'tableSet':
          at(kf);
          GK.tableSet(kf, grng);
          break;
        case 'loungeSet':
          at(kf);
          GK.loungeSet(kf, grng);
          break;
        case 'bbq': {
          at(kf);
          const top = GK.bbq(kf, grng);
          service.bbqs.push({ x: it.x, y: y + top, z: it.z });
          break;
        }
        case 'paddling':
          at(kf);
          GK.paddling(kf, grng, it.w);
          break;
        case 'washing': {
          at(kf);
          at(KL);
          const w = GK.washing(kf, grng, KL);
          // local arm angle a → world angle a − yaw (frame = translate · rotY(yaw))
          service.washing.push({ x: it.x, y, z: it.z, yaw0: w.yaw0 - it.yaw, R: w.R, H: y + w.H });
          break;
        }
        case 'vegBeds':
          at(kf);
          GK.vegBeds(kf, grng, 2 + (it.seed & 3), it.d);
          break;
        case 'compost':
          at(kf);
          GK.compost(kf, grng);
          break;
        case 'bins':
          at(kf);
          GK.wheelieBins(kf, grng, 2 + (it.seed % 2));
          break;
        case 'sandpit':
          at(kf);
          GK.sandpit(kf, grng, it.w);
          break;
        case 'loungers':
          at(kf);
          GK.loungers(kf, grng);
          break;
        case 'birdbath':
          at(kf);
          GK.birdbath(kf, grng);
          break;
        case 'toys':
          at(kf);
          GK.toys(kf, grng);
          break;
        case 'firepit':
          at(kf);
          GK.firepit(kf, grng);
          break;
        case 'kennel':
          at(kf);
          GK.kennel(kf, grng);
          break;
        case 'pots':
          at(kf);
          GK.potPlants(kf, grng);
          break;
      }
      inc(`g_${it.kind}`);
    }
    for (const st of gp.stones) {
      kf.sh.frame(st.x, H(st.x, st.z), st.z, 0);
      GK.stone(kf, st.r, hash01(st.x, st.z, 3));
    }
  }

  // ─────────────────────────────────────────────────────────── meshes ──
  const root = new THREE.Group();
  root.name = 'props';
  // debug toggle for cost measurements: ?propsparts=furniture,glass,glows
  const parts = (ctx.debug.params.get('propsparts') ?? 'furniture,glass,glows').split(',');
  const mat: THREE.Material = ctx.debug.params.get('propsmat') === 'basic' ? new THREE.MeshBasicMaterial({ vertexColors: true }) : furnitureMaterial(ctx.uniforms, !ctx.debug.params.has('nowear'));
  const lod = new DistanceLod(ctx);
  const culler = new ChunkCuller(ctx);
  let near = true;
  const geos: THREE.BufferGeometry[] = [];
  const addFurniture = (kit: Kit, name: string, fine: boolean) => {
    const geo = kit.s.build();
    geos.push(geo);
    const m = staticMesh(geo, mat, name);
    m.castShadow = false;
    m.receiveShadow = true;
    m.renderOrder = -1;
    if (parts.includes('furniture') && kit.s.vcount > 0) root.add(m);
    culler.add(m, fine ? () => near : () => true, 8);
  };
  KC.forEach((kit, i) => addFurniture(kit, `props-furniture-${i ? 'e' : 'w'}`, false));
  {
    // shadow-casting silhouettes (one extra draw call + its shadow pass); ?propscast=0 disables the shadows
    const geo = KS.s.build();
    geos.push(geo);
    const m = staticMesh(geo, mat, 'props-casters');
    m.castShadow = ctx.debug.params.get('propscast') !== '0';
    m.receiveShadow = true;
    m.renderOrder = -1;
    if (parts.includes('furniture') && KS.s.vcount > 0) root.add(m);
    culler.add(m, () => true, 8);
  }
  KF.forEach((kit, i) => addFurniture(kit, `props-furniture-fine-${i ? 'e' : 'w'}`, true));
  let greenMat: THREE.Material | null = null;
  if (greenB.vertexCount > 0) {
    const geo = greenB.toGeometry();
    greenB.dispose();
    geos.push(geo);
    greenMat = createGreenMaterial(ctx.uniforms, makeGreenTexture());
    const m = new THREE.Mesh(geo, greenMat);
    m.name = 'props-green';
    m.castShadow = false;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    root.add(m);
    culler.add(m, () => near, 8);
  }
  if (KL.s.vcount > 0) {
    const geo = KL.s.build();
    geos.push(geo);
    const m = staticMesh(geo, mat, 'props-laundry');
    m.castShadow = false;
    m.receiveShadow = true;
    m.renderOrder = -1;
    if (parts.includes('furniture')) root.add(m);
    culler.add(m, () => near && staticLaundry, 8);
  }
  let glassGeo: THREE.BufferGeometry | null = null;
  let glassMat: THREE.Material | null = null;
  if (gsink.vcount > 0) {
    glassGeo = gsink.build();
    glassMat = glassMaterial(ctx.uniforms);
    const gm = staticMesh(glassGeo, glassMat, 'props-glass');
    gm.renderOrder = 2;
    gm.frustumCulled = false;
    if (parts.includes('glass')) root.add(gm);
  }
  const contactMesh = buildContactMesh(spots);
  if (contactMesh) {
    contactMesh.updateMatrix();
    geos.push(contactMesh.geometry);
    root.add(contactMesh);
  }
  ctx.services.props = service;
  if (terraceLights.length && !ctx.debug.params.has('noterracelights')) addLampLights(terraceLights);
  const glowMesh = createGlowMesh(ctx.uniforms, glows);
  if (parts.includes('glows')) root.add(glowMesh);
  ctx.scene.add(root);
  const buildMs = performance.now() - t0;

  return {
    name: 'props',
    frame() {
      near = lod.near();
      culler.update();
    },
    stats() {
      return {
        ...count,
        fenceM: Math.round(fenceM),
        glows: glows.length,
        tris: [...KC, ...KF, KS].reduce((a, c) => a + c.s.tcount, 0) + gsink.tcount,
        casterTris: KS.s.tcount,
        fineTris: KF.reduce((a, c) => a + c.s.tcount, 0),
        contactSpots: spots.length,
        verts: [...KC, ...KF, KS].reduce((a, c) => a + c.s.vcount, 0) + gsink.vcount,
        buildMs: Math.round(buildMs),
        cafes: service.cafes.length,
        terraceLights: terraceLights.length,
        cafeSeats: service.cafes.reduce((a, c) => a + c.seats.length, 0),
        bbqs: service.bbqs.length,
        dryers: service.washing.length,
      };
    },
    invariants() {
      const out: string[] = [];
      for (const l of layout.lamps) {
        if (occ.has(l.x, l.z, OCC.BUILDING | OCC.ROAD | OCC.WATER)) out.push(`lamp at (${l.x.toFixed(1)}, ${l.z.toFixed(1)}) stands in a building/road/water cell`);
      }
      // scatter + garden items must never stand on a walk line, road, sidewalk, building or water
      const bad = OCC.BUILDING | OCC.ROAD | OCC.SIDEWALK | OCC.WATER | OCC.RAIL;
      const check = (kind: string, x: number, z: number) => {
        if (occ.has(x, z, bad) || layout.walk.get(x, z) & MASK_WALK) out.push(`${kind} at (${x.toFixed(1)}, ${z.toFixed(1)}) blocks a walkway / road / building cell`);
      };
      for (const it of scatter) check(it.kind, it.x, it.z);
      for (const gp of layout.gardens) for (const it of gp.items) check(it.kind, it.x, it.z);
      return out.slice(0, 20);
    },
    dispose() {
      for (const g2 of geos) g2.dispose();
      mat.dispose();
      greenMat?.dispose();
      glassGeo?.dispose();
      glassMat?.dispose();
      (contactMesh?.material as THREE.Material | undefined)?.dispose();
      glowMesh.geometry.dispose();
      (glowMesh.material as THREE.Material).dispose();
    },
  };
}

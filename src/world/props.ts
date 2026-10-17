// Module "props": street furniture. Street lamps (style by district) + lamps along park paths,
// the riverbank walk, plazas and the boardwalk; benches (street slots + every plan bench, matching
// the pedestrians' seats), bins, hydrants, bike racks with bikes, planters, mailboxes, red phone
// boxes, newsstands, glass bus shelters with route-coloured stop poles, garden picket fences and
// low walls (gaps at driveways and door paths), plaza bollards, allotment sheds and water butts.
//
// Draw calls: furniture (1, merged, per-vertex roughness/metalness + night emission),
// glass (1, transparent), light pools + halos (1, additive). No shadow casters.

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
  const glows: Glow[] = [];
  const count: Record<string, number> = {};
  const inc = (key: string) => (count[key] = (count[key] ?? 0) + 1);
  const rng = ctx.rng('props');

  /** local → world for a frame at (x, z) with yaw */
  const toWorld = (x: number, z: number, yaw: number, lx: number, lz: number): [number, number] => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

  // ─────────────────────────────────────────────────────────── lamps ──
  for (const l of layout.lamps) {
    const y = l.street ? l.y : Math.max(l.y, H(l.x, l.z));
    sel(l.x);
    k.sh.frame(l.x, y, l.z, l.yaw);
    const head = lamp(k, l.style, l.street, new Rng(Math.floor(hash01(l.x, l.z, 5) * 1e9)));
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
    inc('bench');
    // a litter bin beside some park benches
    if (!b.sidewalk && brng.chance(0.45)) {
      const side = brng.chance(0.5) ? 1 : -1;
      const [x, z] = toWorld(b.x, b.z, b.yaw, side * 1.3, -0.05);
      if (!occAny(occ, x, z, 0.3, OCC.PATH | OCC.SOLID | OCC.BUILDING | OCC.WATER | OCC.ROAD | OCC.SIDEWALK) && !(layout.walk.get(x, z) & MASK_WALK)) {
        sel(x);
        kf.sh.frame(x, Math.max(H(x, z), b.y), z, b.yaw);
        bin(kf, b.style === 'modern');
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
        bin(kf, modernD(s.district));
        inc('bin');
        break;
      case 'hydrant':
        sel(s.x);
        kf.sh.frame(s.x, y, s.z, s.yaw);
        hydrant(kf, s.district === 'industrial' || s.district === 'harbor');
        inc('hydrant');
        break;
      case 'bikerack':
        sel(s.x);
        kf.sh.frame(s.x, y, s.z, s.yaw);
        bikeRack(kf, srng);
        inc('bikerack');
        break;
      case 'planter': {
        sel(s.x);
        kf.sh.frame(s.x, y, s.z, s.yaw);
        const d = s.district;
        const kind = modernD(d) ? 'concrete' : d === 'oldtown' || d === 'market' ? 'terracotta' : d === 'civic' ? 'steel' : 'wood';
        planterBox(kf, kind, PLANTER.along, PLANTER.across, PLANTER.height);
        inc('planter');
        break;
      }
      case 'mailbox':
        sel(s.x);
        kf.sh.frame(s.x, y, s.z, s.yaw);
        mailbox(kf);
        inc('mailbox');
        break;
      case 'phonebox': {
        sel(s.x);
        k.sh.frame(s.x, y, s.z, s.yaw);
        k.sh.local(0, 0, 0.15);
        phonebox(k);
        const [x, z] = toWorld(s.x, s.z, s.yaw, 0, 0.15);
        glows.push({ x, y: y + 0.03, z, size: 1.5, halo: false, color: '#ffd59a', intensity: 0.2 });
        inc('phonebox');
        break;
      }
      case 'newsstand': {
        sel(s.x);
        k.sh.frame(s.x, y, s.z, s.yaw);
        k.sh.local(0, 0, 0.25);
        newsstand(k, srng);
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
        case 'cafe':
          at(kf);
          at(KS);
          SK.cafe(kf, KS, srng);
          break;
        case 'kiosk':
          at(KS);
          at(kf);
          SK.kiosk(KS, kf, srng);
          break;
        case 'planter':
        case 'planterRound':
          at(kf);
          SK.planter(kf, srng, it.kind === 'planterRound');
          break;
        case 'bikeRack': {
          at(kf);
          const inStation = plan.blocks[stationBlock] && it.x > plan.blocks[stationBlock].rect.x0 && it.x < plan.blocks[stationBlock].rect.x1 && it.z > plan.blocks[stationBlock].rect.z0 && it.z < plan.blocks[stationBlock].rect.z1;
          SK.bikeRow(kf, srng, inStation ? 0.68 : 0.42);
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
      }
      inc(`s_${it.kind}`);
      layout.furniture.push(scatterDisc(it));
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
          bollard(kf, blk.kind === 'civic' ? 'stone' : 'steel');
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
        case 'bbq':
          at(kf);
          GK.bbq(kf, grng);
          break;
        case 'paddling':
          at(kf);
          GK.paddling(kf, grng, it.w);
          break;
        case 'washing':
          at(kf);
          GK.washing(kf, grng);
          break;
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
  const mat: THREE.Material = ctx.debug.params.get('propsmat') === 'basic' ? new THREE.MeshBasicMaterial({ vertexColors: true }) : furnitureMaterial(ctx.uniforms);
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
        verts: [...KC, ...KF, KS].reduce((a, c) => a + c.s.vcount, 0) + gsink.vcount,
        buildMs: Math.round(buildMs),
      };
    },
    invariants() {
      const out: string[] = [];
      for (const l of layout.lamps) {
        if (occ.has(l.x, l.z, OCC.BUILDING | OCC.ROAD | OCC.WATER)) out.push(`lamp at (${l.x.toFixed(1)}, ${l.z.toFixed(1)}) stands in a building/road/water cell`);
      }
      return out;
    },
    dispose() {
      for (const g2 of geos) g2.dispose();
      mat.dispose();
      glassGeo?.dispose();
      glassMat?.dispose();
      glowMesh.geometry.dispose();
      (glowMesh.material as THREE.Material).dispose();
    },
  };
}

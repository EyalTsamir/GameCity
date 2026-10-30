// Placement of the street kit (props/streetkit.ts): what stands in the furniture band besides lamps, trees and benches.
// Families: ?nostreetsigns (regulation posts), ?nocabinets (utility and signal-controller cabinets, tags), ?noguardrails
// (at the busy crossings), ?nopostercolumn (plazas), ?nopostnotices (paper on the lamp posts), ?noshopfront (doormats,
// cellar hatches, pavement lights, goods at the kerb). All only where the band is free: nothing here touches a walkway.

import { CORRIDOR_HALF, FURN_OFFSET, ROAD_HALF, SIDEWALK_Y, STOPLINE, XS, ZS } from '../../core/constants';
import type { CityContext } from '../../core/context';
import { DIR_VEC } from '../../core/geom';
import { OCC, type OccupancyGrid } from '../../core/occupancy';
import type { CityPlan, DistrictKind } from '../../core/plan';
import { Rng, hash01 } from '../../core/rng';
import { streetDetail } from '../../core/streetdetail';
import type { BuildingsService } from '../buildings/anchors';
import type { Builder } from '../buildings/mesh';
import type { GreenKit } from '../buildings/green';
import type { Kit } from './furniture';
import { MASK_WALK, type getLayout } from './layout';
import type { Printer } from './print';
import { barrier, bookCart, bottleCrates, breadCrates, brooms, cabinet, cardboard, cellarHatch, clothesRail, cone, doorMat, flowerBuckets, fruitStand, guardRail, pavementLights, postNotice, postcardRack, posterColumn, sacks, signPost, wheelStop, worksSign, worksSite, type SignKind } from './streetkit';
import { bike } from './furniture';

export interface StreetKitEnv {
  ctx: CityContext;
  plan: CityPlan;
  occ: OccupancyGrid;
  layout: ReturnType<typeof getLayout>;
  H(x: number, z: number): number;
  fine(x: number): Kit;
  near(x: number, z: number): Kit;
  casters: Kit;
  green?: GreenKit;
  greenB: Builder;
  printer: Printer | null;
  trees: readonly { x: number; z: number }[];
  spot(x: number, y: number, z: number, yaw: number, lx: number, lz: number, hw: number, hd: number, r: number, pad: number, k: number): void;
  inc(key: string): void;
}

const CAB_KIND = (d: DistrictKind | undefined, h: number): number => (d === 'oldtown' || d === 'market' ? (h < 0.6 ? 0 : 2) : h < 0.5 ? 1 : h < 0.8 ? 0 : 2);
const RAIL_COL: Partial<Record<DistrictKind, string>> = { downtown: '#7f8588', station: '#2d4a3e', civic: '#2d4a3e', market: '#22352e' };

export function placeStreetKit(e: StreetKitEnv): { x: number; z: number }[] & { kinds?: { k: string; x: number; z: number }[] } {
  const { ctx, plan, occ, layout, H, fine, near, casters, printer, trees, spot } = e;
  const placedKinds: { k: string; x: number; z: number }[] = [];
  let lx = 0,
    lz = 0;
  const inc = (k: string) => {
    e.inc(k);
    placedKinds.push({ k, x: lx, z: lz });
  };
  const rng = new Rng('streetkit');
  const placed: { x: number; z: number }[] = [];
  const drives = plan.areas.filter((a) => a.kind === 'driveway');
  const heads = ctx.roads.intersections.flatMap((I) => I.signals);
  const stops = plan.slots.filter((s) => s.kind === 'busstop');
  const nearest = (v: number, list: readonly number[]) => list.reduce((b, c) => (Math.abs(c - v) < Math.abs(b - v) ? c : b), list[0]);
  const free = (x: number, z: number, r: number): boolean => {
    if (!occ.has(x, z, OCC.SIDEWALK)) return false;
    if (layout.walk.anyInCircle(x, z, Math.min(r, 0.3), MASK_WALK)) return false;
    if (layout.furniture.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + r)) return false;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 0.9 + r)) return false;
    if (plan.slots.some((s) => s.kind !== 'empty' && s.kind !== 'busstop' && Math.hypot(s.x - x, s.z - z) < 0.6 + r)) return false;
    if (stops.some((s) => Math.hypot(s.x - x, s.z - z) < 4 + r)) return false;
    if (heads.some((h) => Math.hypot(h.x - x, h.z - z) < 0.5 + r)) return false;
    if (drives.some((d) => x > d.rect.x0 - r - 0.5 && x < d.rect.x1 + r + 0.5 && z > d.rect.z0 - r - 0.5 && z < d.rect.z1 + r + 0.5)) return false;
    return true;
  };
  const claim = (x: number, z: number, r: number) => {
    layout.furniture.push({ x, z, r });
    placed.push({ x, z });
    lx = x;
    lz = z;
  };
  /** set the frame of the fine and near kits at a spot */
  const at = (x: number, y: number, z: number, yaw: number): [Kit, Kit] => {
    const k = fine(x),
      kd = near(x, z);
    k.sh.frame(x, y, z, yaw);
    kd.sh.frame(x, y, z, yaw);
    return [k, kd];
  };

  const signsOn = streetDetail(ctx, 'streetsigns');
  const cabsOn = streetDetail(ctx, 'cabinets');
  const railsOn = streetDetail(ctx, 'guardrails');

  // ── signal junctions: the controller cabinet, guard rails along the kerb on the approach in the busy districts
  for (const I of ctx.roads.intersections) {
    if (I.control === 'portal') continue;
    const d = plan.districtAt(I.x + 8, I.z + 8)?.kind;
    if (I.control === 'signal' && cabsOn) {
      let done = false;
      for (const arm of I.arms) {
        if (done) break;
        const v = DIR_VEC[arm];
        for (const sd of [1, -1]) {
          const x = I.x + v.x * 9.6 - v.z * FURN_OFFSET * sd,
            z = I.z + v.z * 9.6 + v.x * FURN_OFFSET * sd;
          if (!free(x, z, 0.6)) continue;
          const yaw = Math.atan2(-v.z * sd, v.x * sd);
          const [k, kd] = at(x, SIDEWALK_Y, z, yaw);
          cabinet(k, kd, rng, 3, printer, rng.int(0, 1000));
          spot(x, SIDEWALK_Y, z, yaw, 0, 0, 0.45, 0.24, 0.03, 0.22, 0.6);
          claim(x, z, 0.55);
          inc('signalCabinet');
          done = true;
          break;
        }
      }
    }
    const col = d && RAIL_COL[d];
    if (railsOn && col && I.control === 'signal') {
      for (const arm of I.arms) {
        const v = DIR_VEC[arm];
        for (const sd of [1, -1]) {
          if (hash01(I.id, DIR_VEC[arm].x * 3 + DIR_VEC[arm].z * 5, sd + 9) > 0.65) continue;
          // panels along the kerb wherever the band is clear between the stop line and 15 m out (slots stand every few
          // metres, so a run of fixed positions never fitted)
          let panels = 0;
          for (let al = STOPLINE + 1.1; al < 15 && panels < 2; al += 0.4) {
            const bx = I.x + v.x * al - v.z * FURN_OFFSET * sd,
              bz = I.z + v.z * al + v.x * FURN_OFFSET * sd;
            if (![-0.75, 0, 0.75].every((o) => free(bx + v.x * o, bz + v.z * o, 0.1))) continue;
            const x = I.x + v.x * al - v.z * (ROAD_HALF + 0.24) * sd,
              z = I.z + v.z * al + v.x * (ROAD_HALF + 0.24) * sd;
            const yaw = Math.atan2(v.z, -v.x); // local X along the arm
            const [k, kd] = at(x, SIDEWALK_Y, z, yaw);
            guardRail(k, kd, 1.8, col);
            for (const o of [-0.75, 0, 0.75]) claim(bx + v.x * o, bz + v.z * o, 0.12);
            inc('guardRail');
            panels++;
            al += 1.5;
          }
        }
      }
    }
  }

  // ── segments: sign posts and street cabinets in the furniture band
  for (const seg of plan.roadSegments) {
    if (!seg.sidewalks) continue;
    const A = plan.roadNodes[seg.a],
      B = plan.roadNodes[seg.b];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    const dx = (B.x - A.x) / L,
      dz = (B.z - A.z) / L;
    const rx = -dz,
      rz = dx;
    for (const sd of [1, -1]) {
      const px = (s: number) => A.x + dx * s + rx * FURN_OFFSET * sd,
        pz = (s: number) => A.z + dz * s + rz * FURN_OFFSET * sd;
      const dist = plan.districtAt(px(L / 2) + rx * 2 * sd, pz(L / 2) + rz * 2 * sd)?.kind;
      // sign posts: the plate faces the traffic coming along this kerb (right-hand traffic)
      if (signsOn) {
        const n = rng.int(0, 2);
        for (let i = 0; i < n; i++) {
          const s = rng.range(CORRIDOR_HALF + 4, L - CORRIDOR_HALF - 4);
          const x = px(s),
            z = pz(s);
          if (!free(x, z, 0.2)) continue;
          const fx = -dx * sd,
            fz = -dz * sd;
          const yaw = Math.atan2(fx, fz);
          const kinds: SignKind[] = seg.kind === 'avenue' ? ['noparking', 'noparking', 'speed', 'cycle', 'parking'] : ['noparking', 'speed', 'speed', 'parking', 'crossing'];
          const kind = rng.pick(kinds);
          const plate: [string, string] | undefined = kind === 'noparking' && rng.chance(0.6) ? rng.pick([['MON-SAT', '8AM-6PM'], ['LOADING', 'ONLY'], ['MARKET DAY', 'FRI 6-14']] as [string, string][]) : kind === 'parking' ? rng.pick([['2 HOURS', 'PAY AT METER'], ['RESIDENTS', 'ONLY']] as [string, string][]) : undefined;
          const [k, kd] = at(x, SIDEWALK_Y, z, yaw);
          signPost(k, kd, rng, kind, printer, plate);
          spot(x, SIDEWALK_Y, z, yaw, 0, 0, 0.05, 0.05, 0.05, 0.14, 0.4);
          claim(x, z, 0.15);
          inc('signPost');
          // somebody locked a bicycle to it
          if (rng.chance(0.14)) {
            const bx = x + dx * sd * 0.42,
              bz = z + dz * sd * 0.42;
            if (free(bx, bz, 0.35)) {
              const by = Math.atan2(rx * sd, rz * sd) + Math.PI / 2 + rng.range(-0.1, 0.1);
              k.sh.frame(bx, SIDEWALK_Y, bz, by).local(0, 0, 0, rng.range(0.1, 0.17), 0, 0);
              bike(k, rng.pick(['#a33a2c', '#1d3557', '#2a6f5a', '#22242a', '#c9a23a', '#e8e4d8']));
              claim(bx, bz, 0.35);
              inc('lockedBike');
            }
          }
        }
      }
      if (cabsOn && rng.chance(dist === 'downtown' || dist === 'midtown' || dist === 'industrial' ? 0.75 : 0.5)) {
        const s = rng.range(CORRIDOR_HALF + 3, L - CORRIDOR_HALF - 3);
        const x = px(s),
          z = pz(s);
        if (free(x, z, 0.5)) {
          // doors towards the walker (+Z = away from the road)
          const yaw = Math.atan2(rx * sd, rz * sd);
          const [k, kd] = at(x, SIDEWALK_Y, z, yaw);
          cabinet(k, kd, rng, CAB_KIND(dist, rng.next()), printer, rng.int(0, 1000));
          spot(x, SIDEWALK_Y, z, yaw, 0, 0, 0.38, 0.2, 0.03, 0.2, 0.6);
          claim(x, z, 0.5);
          inc('cabinet');
        }
      }
    }
  }

  // ── street works and what is put out at the kerb
  if (streetDetail(ctx, 'roadworks')) {
    // sites on streets of different character: the first free 6 m run along the band
    const want: DistrictKind[] = ['midtown', 'oldtown', 'residential', 'market', 'downtown'];
    for (const dk of want) {
      let done = false;
      for (const seg of plan.roadSegments) {
        if (done || !seg.sidewalks) continue;
        const A = plan.roadNodes[seg.a],
          B = plan.roadNodes[seg.b];
        const L = Math.hypot(B.x - A.x, B.z - A.z);
        const dx = (B.x - A.x) / L,
          dz = (B.z - A.z) / L;
        const rx = -dz,
          rz = dx;
        for (const sd of [1, -1]) {
          if (done) break;
          for (let s = L / 2 - 8; s < L / 2 + 8 && !done; s += 1.5) {
            const x = A.x + dx * s + rx * FURN_OFFSET * sd,
              z = A.z + dz * s + rz * FURN_OFFSET * sd;
            if (plan.districtAt(x + rx * sd * 3, z + rz * sd * 3)?.kind !== dk) continue;
            const run = 5.4;
            if (![-2.4, -1.2, 0, 1.2, 2.4].every((o) => free(x + dx * o, z + dz * o, 0.32))) continue;
            // local X along the street, +Z away from the road
            const yaw = Math.atan2(rx * sd, rz * sd);
            const axX = Math.cos(yaw),
              axZ = -Math.sin(yaw);
            const [k, kd] = at(x, SIDEWALK_Y + 0.002, z, yaw);
            worksSite(k, kd, run, rng);
            // barriers: the long pavement side, the two ends; cones on the road side of the gutter
            for (const b of [-1.65, 0, 1.65]) {
              k.sh.push().local(b, 0, 0.36);
              kd.sh.push().local(b, 0, 0.36);
              barrier(k, kd, 1.65, b === -1.65);
              k.sh.pop();
              kd.sh.pop();
            }
            for (const e2 of [-1, 1]) {
              k.sh.push().local(e2 * 2.5, 0, 0, 0, Math.PI / 2, 0);
              kd.sh.push().local(e2 * 2.5, 0, 0, 0, Math.PI / 2, 0);
              barrier(k, kd, 0.72, false);
              k.sh.pop();
              kd.sh.pop();
            }
            const lat = -(FURN_OFFSET - ROAD_HALF + 0.26);
            for (let c = -2.4; c <= 2.41; c += 1.2) {
              const cx = x + axX * c + rx * sd * lat,
                cz = z + axZ * c + rz * sd * lat;
              const k2 = fine(cx),
                kd2 = near(cx, cz);
              k2.sh.frame(cx, 0.012, cz, c);
              kd2.sh.frame(cx, 0.012, cz, c);
              cone(k2, kd2);
            }
            // the sign faces the traffic, on the approach side of the works
            const sx = x - dx * sd * 3.1,
              sz = z - dz * sd * 3.1;
            if (free(sx, sz, 0.15)) {
              const [k3, kd3] = at(sx, SIDEWALK_Y, sz, Math.atan2(-dx * sd, -dz * sd));
              worksSign(k3, kd3, printer);
              claim(sx, sz, 0.2);
            }
            for (const o of [-2.4, -1.2, 0, 1.2, 2.4]) claim(x + axX * o, z + axZ * o, 0.45);
            inc('roadWorks');
            done = true;
          }
        }
      }
    }
  }
  if (streetDetail(ctx, 'kerbsideodds')) {
    for (const seg of plan.roadSegments) {
      if (!seg.sidewalks) continue;
      const A = plan.roadNodes[seg.a],
        B = plan.roadNodes[seg.b];
      const L = Math.hypot(B.x - A.x, B.z - A.z);
      const dx = (B.x - A.x) / L,
        dz = (B.z - A.z) / L;
      for (const sd of [1, -1]) {
        if (!rng.chance(0.42)) continue;
        const s = rng.range(CORRIDOR_HALF + 3, L - CORRIDOR_HALF - 3);
        const rx = -dz * sd,
          rz = dx * sd;
        const x = A.x + dx * s + rx * FURN_OFFSET,
          z = A.z + dz * s + rz * FURN_OFFSET;
        if (!free(x, z, 0.5)) continue;
        const yaw = Math.atan2(rx, rz) + rng.range(-0.15, 0.15);
        const [k, kd] = at(x, SIDEWALK_Y, z, yaw);
        if (rng.chance(0.6)) {
          sacks(k, kd, rng, rng.int(2, 4));
          inc('sacks');
        } else {
          cardboard(k, rng);
          inc('cardboard');
        }
        spot(x, SIDEWALK_Y, z, yaw, 0, 0, 0.4, 0.22, 0.12, 0.2, 0.28);
        claim(x, z, 0.45);
      }
    }
  }

  // ── parking lots: precast wheel stops at the head of the bays, oil under where the engines stand
  if (streetDetail(ctx, 'parkingkit')) {
    for (const a of plan.areas) {
      if (a.kind !== 'parking' || !a.stalls || a.stalls.length < 3) continue;
      for (const st of a.stalls) {
        // (Stall.yaw: cars stand nose out to the aisle, so the stop lies behind the rear tyres)
        const fx = Math.sin(st.yaw),
          fz = Math.cos(st.yaw);
        const x = st.x - fx * 1.95,
          z = st.z - fz * 1.95;
        if (rng.chance(0.82)) {
          const [k, kd] = at(x, H(x, z) + 0.02, z, st.yaw + rng.range(-0.025, 0.025));
          wheelStop(k, kd, rng);
          inc('wheelStop');
        }
        // drips: a soft stain under the engine bay, darker where many cars have stood
        spot(st.x, 0.012, st.z, st.yaw, 0, 0.9, 0.42, 0.34, 0.3, 0.42, 0.34 + rng.next() * 0.3);
        if (rng.chance(0.4)) spot(st.x, 0.012, st.z, st.yaw, rng.range(-0.5, 0.5), rng.range(-1.2, 1.2), 0.07, 0.07, 0.07, 0.12, 0.6);
      }
    }
  }

  // ── poster columns: one on a plaza where it stands clear of everything
  if (streetDetail(ctx, 'postercolumn')) {
    const bad = OCC.BUILDING | OCC.ROAD | OCC.WATER | OCC.RAIL | OCC.SOLID | OCC.PATH;
    let cols = 0;
    for (const a of plan.areas) {
      if (cols >= 12 || a.kind !== 'plaza') continue;
      const r = a.rect;
      if (r.x1 - r.x0 < 6 || r.z1 - r.z0 < 6) continue;
      for (let t = 0; t < 24; t++) {
        const ex = rng.chance(0.5);
        const x = ex ? (rng.chance(0.5) ? r.x0 + rng.range(1, 2.4) : r.x1 - rng.range(1, 2.4)) : rng.range(r.x0 + 1, r.x1 - 1),
          z = ex ? rng.range(r.z0 + 1, r.z1 - 1) : rng.chance(0.5) ? r.z0 + rng.range(1, 2.4) : r.z1 - rng.range(1, 2.4);
        if ([[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]].some(([ox, oz]) => occ.has(x + ox, z + oz, bad))) continue;
        if (layout.walk.anyInCircle(x, z, 0.8, MASK_WALK)) continue;
        if (layout.furniture.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + 0.9)) continue;
        if (plan.features.some((f) => Math.hypot(f.x - x, f.z - z) < (f.radius ?? 1) + 0.9)) continue;
        if (trees.some((tr) => Math.hypot(tr.x - x, tr.z - z) < 1.6)) continue;
        const y = H(x, z);
        const k = fine(x),
          kd = near(x, z);
        casters.sh.frame(x, y, z, 0);
        k.sh.frame(x, y, z, 0);
        kd.sh.frame(x, y, z, 0);
        posterColumn(casters, k, kd, rng, printer, rng.int(0, 1000));
        spot(x, y, z, 0, 0, 0, 0.55, 0.55, 0.55, 0.26, 0.55);
        claim(x, z, 0.75);
        inc('posterColumn');
        cols++;
        break;
      }
    }
  }

  // ── paper on the lamp posts (near only)
  if (printer && streetDetail(ctx, 'postnotices')) {
    for (const l of layout.lamps) {
      if (!l.street || hash01(l.x, l.z, 61) > 0.3) continue;
      const kd = near(l.x, l.z);
      kd.sh.frame(l.x, l.y, l.z, l.yaw);
      lx = l.x;
      lz = l.z;
      postNotice(kd, printer, 0.085, 1.35 + 0.5 * hash01(l.x, l.z, 62), Math.floor(hash01(l.x, l.z, 63) * 1000));
      inc('postNotice');
    }
  }

  // ── shop fronts
  if (streetDetail(ctx, 'shopfront')) {
    const shops = (ctx.services.buildings as BuildingsService | undefined)?.shops ?? [];
    for (const sh of shops) {
      const srng = new Rng(Math.floor(hash01(sh.ax, sh.az, 71) * 1e9) || 1);
      const L = Math.hypot(sh.bx - sh.ax, sh.bz - sh.az);
      if (L < 1) continue;
      const ux = (sh.bx - sh.ax) / L,
        uz = (sh.bz - sh.az) / L;
      const yaw = Math.atan2(sh.nx, sh.nz);
      // doormat just outside the door
      {
        const x = sh.doorX + sh.nx * 0.3,
          z = sh.doorZ + sh.nz * 0.3;
        const kd = near(x, z);
        kd.sh.frame(x, H(x, z) + 0.001, z, yaw);
        doorMat(kd, srng, 1.05, printer);
        lx = x;
        lz = z;
        inc('doorMat');
      }
      // cellar flaps at bars and bakeries, pavement lights at the smart shops, beside the door against the wall
      const uDoor = (sh.doorX - sh.ax) * ux + (sh.doorZ - sh.az) * uz;
      const side = uDoor > L / 2 ? -1 : 1;
      const uu = uDoor + side * srng.range(1.5, 2.2);
      if (uu > 0.8 && uu < L - 0.8) {
        const x = sh.ax + ux * uu + sh.nx * 0.62,
          z = sh.az + uz * uu + sh.nz * 0.62;
        const y = H(x, z);
        const kd = near(x, z);
        kd.sh.frame(x, y + 0.002, z, yaw);
        lx = x;
        lz = z;
        if ((sh.type === 1 || sh.type === 2) && srng.chance(0.65)) {
          cellarHatch(kd, srng);
          inc('cellarHatch');
        } else if ((sh.type === 5 || sh.type === 7 || sh.type === 3) && srng.chance(0.4)) {
          pavementLights(kd, srng);
          inc('pavementLights');
        }
      }
      // goods carried out to the kerb, across the pavement from the door
      const alongX = Math.abs(sh.nz) > 0.5;
      const c = alongX ? nearest(sh.az + sh.nz * 8, ZS) : nearest(sh.ax + sh.nx * 8, XS);
      const band = c - (alongX ? sh.nz : sh.nx) * FURN_OFFSET;
      // (a door often has a tree, lamp or bench straight across the pavement: slide along until the band is clear)
      const ax = alongX ? 1 : 0,
        az = alongX ? 0 : 1;
      if (srng.next() > 0.85) continue;
      let x = 0,
        z = 0,
        found = false;
      const off0 = srng.range(-0.8, 0.8);
      for (const o of [0, 1.5, -1.5, 3, -3, 4.5, -4.5]) {
        x = alongX ? sh.doorX + off0 + o : band;
        z = alongX ? band : sh.doorZ + off0 + o;
        const jd = alongX ? Math.abs(x - nearest(x, XS)) : Math.abs(z - nearest(z, ZS));
        if (jd >= 9.5 && [-0.7, 0, 0.7].every((t) => free(x + ax * t, z + az * t, 0.3))) {
          found = true;
          break;
        }
      }
      if (!found) continue;
      const fy = Math.atan2(-sh.nx, -sh.nz);
      const y = SIDEWALK_Y + 0.004;
      const [k, kd] = at(x, y, z, fy);
      const greenFrame = (lx: number, lz: number) => e.greenB.frame(fy, x + lx * Math.cos(fy) + lz * Math.sin(fy), y, z - lx * Math.sin(fy) + lz * Math.cos(fy));
      switch (sh.type) {
        case 4:
          if (srng.chance(0.55)) {
            fruitStand(k, kd, srng);
            inc('fruitStand');
          } else {
            flowerBuckets(k, kd, e.green, greenFrame, srng);
            inc('flowerBuckets');
          }
          break;
        case 3:
          bookCart(k, kd, srng);
          inc('bookCart');
          break;
        case 5:
          clothesRail(k, kd, srng);
          inc('clothesRail');
          break;
        case 1:
          bottleCrates(k, kd, srng);
          inc('bottleCrates');
          break;
        case 2:
          breadCrates(k, kd, srng);
          inc('breadCrates');
          break;
        case 6:
          brooms(k, kd, srng);
          inc('brooms');
          break;
        default:
          postcardRack(k, kd, srng, printer);
          inc('postcardRack');
          break;
      }
      spot(x, SIDEWALK_Y, z, fy, 0, 0, 0.7, 0.28, 0.1, 0.3, 0.3);
      for (const o of [-0.7, 0, 0.7]) claim(x + ax * o, z + az * o, 0.4);
    }
  }
  // (where everything went: audit tooling reads this as services.props.streetKit)
  return Object.assign(placed, { kinds: placedKinds });
}

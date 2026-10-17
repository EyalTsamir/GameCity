// Module "landmarks" — the focal points of every district:
//   lots:     station, town hall, church, stadium, TV tower, construction site, water tower
//   features: fountain, statues, gazebo, bandstand, park café, playground, flagpoles,
//             market stalls, factory chimneys, tanks, sports-court hoops, wind turbines,
//             picnic tables, stadium floodlights, tower crane
//
// Geometry is generated procedurally (see landmarks/*.ts) into a handful of merged meshes:
//   static solid (one per region, frustum-culled), kinetic/cutout (vertex-animated parts:
//   crane, rotors, swings, flags, lattices), lights (unlit emissive), glows (additive),
//   signs (canvas atlas) + a few special meshes (fountain water, stadium crowd & players).
// Surfaces use a shared procedural shader (brick, stone, tiles, glazing, windows, clock
// faces showing the live time, flags…) — see landmarks/shaders.ts.

import * as THREE from 'three';
import type { CityContext, CityModule, PickHit } from '../core/context';
import { createMaterials } from './landmarks/materials';
import { Env, PickTarget } from './landmarks/env';
import { buildGlows } from './landmarks/glows';
import { signMaterial } from './landmarks/signs';
import { genStation } from './landmarks/station';
import { genTownHall } from './landmarks/townhall';
import { genChurch } from './landmarks/church';
import { genStadium, genFloodlight, StadiumInfo } from './landmarks/stadium';
import { createStadiumLife } from './landmarks/stadiumLife';
import { genTvTower, tvTowerUpdater } from './landmarks/tvtower';
import { genConstruction, genTowerCrane, craneUpdater, CraneTargets } from './landmarks/construction';
import { genFountain } from './landmarks/fountain';
import { genFlagpole, genMarketStall, genCourtHoops } from './landmarks/civic';
import { genWaterTower, genChimney, genTanks } from './landmarks/industry';
import { genStatue, genGazebo, genBandstand, genKiosk, genPlayground, genPicnic } from './landmarks/park';
import { genWindTurbine, turbineUpdater } from './landmarks/turbines';

export default function create(ctx: CityContext): CityModule {
  const t0 = performance.now();
  const plan = ctx.plan;
  const mats = createMaterials(ctx.uniforms);
  const env = new Env(ctx, mats.u);
  const counts: Record<string, number> = {};
  const count = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const stadiums: StadiumInfo[] = [];
  const craneTargets: CraneTargets[] = [];

  const triBy: Record<string, number> = {};
  const totalTris = () => {
    let t = env.K.b.triangleCount + env.L.b.triangleCount + env.T.b.triangleCount + env.O.b.triangleCount + env.D.b.triangleCount;
    for (const b of env.regions.values()) t += b.triangleCount;
    return t;
  };
  // perf diagnostics: ?lmnokinds=stadium,townhall,… skips those generators
  const noKinds = new Set((ctx.debug.params.get('lmnokinds') ?? '').split(',').filter(Boolean));
  const run = (label: string, fn: () => void) => {
    if (noKinds.has(label.split(' ')[0])) return;
    const t0 = totalTris();
    try {
      fn();
      const k = label.split(' ')[0];
      triBy[k] = (triBy[k] ?? 0) + (totalTris() - t0);
    } catch (err) {
      env.problems.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      if (ctx.debug.enabled) console.error('[landmarks]', label, err);
    }
    env.endChecks();
  };

  for (const lot of plan.lots) {
    switch (lot.kind) {
      case 'station':
        run(`station ${lot.id}`, () => genStation(env, lot));
        count('station');
        break;
      case 'townhall':
        run(`townhall ${lot.id}`, () => genTownHall(env, lot));
        count('townhall');
        break;
      case 'church':
        run(`church ${lot.id}`, () => genChurch(env, lot));
        count('church');
        break;
      case 'tvtower':
        run(`tvtower ${lot.id}`, () => {
          genTvTower(env, lot);
          env.updaters.push(tvTowerUpdater(env));
        });
        count('tvtower');
        break;
      case 'construction':
        run(`construction ${lot.id}`, () => craneTargets.push(genConstruction(env, lot)));
        count('construction');
        break;
      case 'watertower':
        run(`watertower ${lot.id}`, () => genWaterTower(env, lot));
        count('watertower');
        break;
      case 'stadium':
        run(`stadium ${lot.id}`, () => {
          const info = genStadium(env, lot);
          stadiums.push(info);
          const life = createStadiumLife(env, info, ctx.uniforms);
          env.pick(lot.id, info.name, new THREE.Box3(new THREE.Vector3(lot.footprint.x0, 0, lot.footprint.z0), new THREE.Vector3(lot.footprint.x1, 12, lot.footprint.z1)), () => life.describe());
        });
        count('stadium');
        break;
      default:
        break;
    }
  }
  let flagN = 0;
  const nearestStadium = (x: number, z: number) => {
    let best: StadiumInfo | null = null;
    let bd = 80;
    for (const st of stadiums) {
      const d = Math.hypot(st.cx - x, st.cz - z);
      if (d < bd) {
        bd = d;
        best = st;
      }
    }
    return best ? { x: best.cx, z: best.cz } : null;
  };
  for (const f of plan.features) {
    switch (f.kind) {
      case 'fountain':
        run(`fountain ${f.id}`, () => genFountain(env, f, ctx.uniforms));
        count('fountain');
        break;
      case 'floodlight':
        run(`floodlight ${f.id}`, () => genFloodlight(env, f, nearestStadium(f.x, f.z)));
        count('floodlight');
        break;
      case 'towercrane':
        run(`towercrane ${f.id}`, () => {
          const crane = genTowerCrane(env, f);
          let best: CraneTargets | null = null;
          let bd = 60;
          for (const t of craneTargets) {
            const d = Math.hypot(t.pick.x - f.x, t.pick.z - f.z);
            if (d < bd) {
              bd = d;
              best = t;
            }
          }
          env.updaters.push(craneUpdater(env, crane, best));
        });
        count('towercrane');
        break;
      case 'chimney':
        run(`chimney ${f.id}`, () => genChimney(env, f, counts.chimney ?? 0));
        count('chimney');
        break;
      case 'tanks':
        run(`tanks ${f.id}`, () => genTanks(env, f));
        count('tanks');
        break;
      case 'statue':
        run(`statue ${f.id}`, () => genStatue(env, f));
        count('statue');
        break;
      case 'gazebo':
        run(`gazebo ${f.id}`, () => genGazebo(env, f));
        count('gazebo');
        break;
      case 'bandstand':
        run(`bandstand ${f.id}`, () => genBandstand(env, f));
        count('bandstand');
        break;
      case 'kiosk':
        run(`kiosk ${f.id}`, () => genKiosk(env, f));
        count('kiosk');
        break;
      case 'playground':
        run(`playground ${f.id}`, () => genPlayground(env, f));
        count('playground');
        break;
      case 'picnic':
        run(`picnic ${f.id}`, () => genPicnic(env, f, counts.picnic ?? 0));
        count('picnic');
        break;
      case 'marketstall':
        run(`marketstall ${f.id}`, () => genMarketStall(env, f));
        count('marketstall');
        break;
      case 'sportscourt':
        run(`sportscourt ${f.id}`, () => genCourtHoops(env, f));
        count('sportscourt');
        break;
      case 'windturbine':
        run(`windturbine ${f.id}`, () => genWindTurbine(env, f, counts.windturbine ?? 0));
        count('windturbine');
        break;
      case 'flagpole':
        run(`flagpole ${f.id}`, () => genFlagpole(env, f, [0, 3, 1, 4][flagN++ % 4]));
        count('flagpole');
        break;
      default:
        break;
    }
  }

  // ── assemble meshes
  const group = new THREE.Group();
  group.name = 'landmarks';
  const meshes: THREE.Mesh[] = [];
  let tris = 0;
  const meshTris: Record<string, number | string> = {};
  const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, cast: boolean, receive: boolean, cull = true): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.frustumCulled = cull;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    meshes.push(mesh);
    const t = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    tris += t;
    meshTris[name.replace('landmarks-', '')] = `${Math.round(t)}t/${geo.attributes.position.count}v` as unknown as number;
    return mesh;
  };
  for (const [key, b] of env.regions) {
    if (b.vertexCount === 0) continue;
    addMesh(b.toGeometry(), mats.solid, `landmarks-${key}`, true, true);
  }
  if (env.O.b.vertexCount > 0) addMesh(env.O.b.toGeometry(), mats.ornament, 'landmarks-ornament', true, true);
  if (env.D.b.vertexCount > 0) addMesh(env.D.b.toGeometry(), mats.detail, 'landmarks-detail', false, true);
  if (env.K.b.vertexCount > 0) {
    const km = addMesh(env.K.b.toGeometry(), mats.kinetic, 'landmarks-kinetic', true, true, false);
    km.customDepthMaterial = mats.kineticDepth;
  }
  if (env.L.b.vertexCount > 0) addMesh(env.L.b.toGeometry(), mats.lights, 'landmarks-lights', false, false, false);
  if (env.T.b.vertexCount > 0) addMesh(env.T.b.toGeometry(), signMaterial(ctx.uniforms, env.atlas.texture()), 'landmarks-signs', false, true);
  const glowMesh = buildGlows(env.glows, mats.glows);
  if (glowMesh) group.add(glowMesh);
  for (const o of env.extra) group.add(o);
  group.matrixAutoUpdate = false;
  ctx.scene.add(group);
  // perf diagnostics: ?lmskip=static,kinetic,lights,signs,glows,fountain,crowd,players
  const lmskip = (ctx.debug.params.get('lmskip') ?? '').split(',').filter(Boolean);
  if (lmskip.length) {
    for (const o of group.children) {
      const n = o.name;
      const tag = n.startsWith('landmarks-fountain') ? 'fountain' : n === 'landmarks-kinetic' ? 'kinetic' : n === 'landmarks-lights' ? 'lights' : n === 'landmarks-signs' ? 'signs' : n === 'landmarks-glows' ? 'glows' : n === 'landmarks-crowd' ? 'crowd' : n === 'landmarks-players' || n === 'landmarks-ball' ? 'players' : n === 'landmarks-detail' ? 'detail' : 'static';
      if (lmskip.includes(tag)) o.visible = false;
    }
  }

  // ── picking
  const tmpV = new THREE.Vector3();
  ctx.pickers.push({
    name: 'landmarks',
    pick(ray: THREE.Ray): PickHit | null {
      let best: PickTarget | null = null;
      let bestD = Infinity;
      for (const p of env.picks) {
        const hit = ray.intersectBox(p.box, tmpV);
        if (!hit) continue;
        const d = hit.distanceTo(ray.origin);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (!best) return null;
      const b = best;
      return {
        kind: 'landmark',
        id: b.id,
        distance: bestD,
        label: b.label,
        getPosition(out: THREE.Vector3) {
          b.box.getCenter(out);
          out.y = Math.min(b.box.max.y * 0.55, 40);
          return true;
        },
        info: () => b.info(),
      };
    },
  });

  if (counts.windturbine) env.updaters.push(turbineUpdater(env));

  // bells swing for a few seconds every hour (town hall belfry; audio rings them on the same event)
  let bellT = 99;
  ctx.events.on('hour', () => {
    bellT = 0;
  });
  env.updaters.push((dt) => {
    if (bellT > 12) {
      mats.u.uSpin.value.w = 0;
      return;
    }
    bellT += dt;
    mats.u.uSpin.value.w = 0.62 * Math.exp(-bellT / 3.2) * Math.sin((bellT * Math.PI * 2) / 1.8) * Math.min(1, bellT * 3);
  });

  const buildMs = performance.now() - t0;
  if (ctx.debug.enabled) console.info(`[landmarks] built in ${buildMs.toFixed(0)} ms, ${Math.round(tris)} tris`, counts);

  // analytic sky colours for the reflections of glass / metal (follow daylight, dusk and fog)
  const zen = new THREE.Color();
  const hor = new THREE.Color();
  const dayZen = new THREE.Color('#4f86c6');
  const dayHor = new THREE.Color('#cfdfe8');
  const duskHor = new THREE.Color('#f2a272');
  const nightZen = new THREE.Color('#0b1426');
  const nightHor = new THREE.Color('#1c2740');

  return {
    name: 'landmarks',
    frame(_realDt, c) {
      const day = c.uniforms.uDaylight.value;
      const dusk = c.uniforms.uDusk.value;
      zen.copy(nightZen).lerp(dayZen, day);
      hor.copy(nightHor).lerp(dayHor, day).lerp(duskHor, dusk * 0.55);
      const fog = c.scene.fog as THREE.Fog | null;
      if (fog && fog.color) hor.lerp(fog.color, 0.5);
      mats.u.uSkyZen.value.copy(zen);
      mats.u.uSkyHor.value.copy(hor);
      mats.u.uGround.value.setRGB(0.16 * day + 0.015, 0.15 * day + 0.015, 0.13 * day + 0.02);
      mats.u.uEnvK.value = 0.55 + 0.45 * day;
    },
    update(dt, c) {
      const h = c.clock.hours;
      mats.u.uHours.value = h;
      // halos / pools / beams only matter after dusk (or under the stadium floodlights)
      if (glowMesh) glowMesh.visible = c.uniforms.uLights.value > 0.004 || mats.u.uFlood.value > 0.004;
      // visibility groups: x site workers, y bandstand concert, z market vendors, w kids at play
      mats.u.uVis.value.set(h >= 7 && h < 18 ? 1 : 0, h >= 16 && h < 21 ? 1 : 0, h >= 7.5 && h < 14.5 ? 1 : 0, h >= 8 && h < 19.5 ? 1 : 0);
      for (const fn of env.updaters) fn(dt, c);
    },
    stats() {
      return {
        meshes: meshes.length + (glowMesh ? 1 : 0) + env.extra.length,
        tris: Math.round(tris),
        glows: env.glows.length,
        atlasFill: Math.round(env.atlas.fill * 100) / 100,
        meshTris: JSON.stringify(meshTris),
        trisBy: Object.entries(triBy)
          .sort((x, y) => y[1] - x[1])
          .map(([k, v]) => `${k}:${Math.round(v / 100) / 10}k`)
          .join(' '),
        buildMs: Math.round(buildMs),
        ...counts,
        ...env.stats,
        // debug: GPU timer A/B results written by an in-page probe (scripts/--eval)
        ...((window as unknown as { __lmgpu?: Record<string, unknown> }).__lmgpu ? { gpu: JSON.stringify((window as unknown as { __lmgpu: unknown }).__lmgpu) } : {}),
      };
    },
    invariants() {
      const out = [...env.problems, ...env.footprintReport()];
      if (env.atlas.overflow) out.push(`sign atlas overflow: ${env.atlas.overflow} signs did not fit`);
      return out;
    },
  };
}

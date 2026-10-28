// Module "buildings" — renders every ordinary building lot of the plan:
// downtown towers & offices, old-town townhouses, suburban houses, apartment
// slabs, warehouses / factory / depot, school, hotels, harbour master, kiosks and
// the rowing-club boathouse. (Landmarks — station, town hall, church, stadium,
// TV tower, construction site, water tower — belong to the landmarks module.)
//
// Everything is generated procedurally into a few merged meshes (one per
// material): `shell` (walls + roofs with a facade shader: windows, fake interiors,
// night lighting driven by the clock), `trim` (details), `lights` (emissive
// accents, aviation lights) and `signs` (canvas atlas). See buildings/*.ts.
// The trim (~140k triangles of sills, cornices, railings…) is split into ≤ 16
// spatial chunks so the main and the shadow pass frustum-cull what they can't see.

import * as THREE from 'three';
import type { CityContext, CityModule, PickHit } from '../core/context';
import type { Lot, BuildingKind, Area } from '../core/plan';
import { DIR_YAW } from '../core/geom';
import { Rng } from '../core/rng';
import { PALETTE } from '../core/gfx';
import { Builder } from './buildings/mesh';
import { createMaterials } from './buildings/materials';
import { SignAtlas } from './buildings/signs';
import { Gen, Interval, LocalDoor, Side, col, jit, setDoorLife, setGutters } from './buildings/gen';
import { genTownhouse, resetOldtown } from './buildings/oldtown';
import { genFallback } from './buildings/fallback';
import { genTower, resetTowers, setColumnDetail } from './buildings/towers';
import { genApartment } from './buildings/houses';
import { genHouse, setLegacyHouses, resetHomes, houseStats, houseLog } from './buildings/homes';
import { genIndustrial } from './buildings/industry';
import { genHotel, genSchool, genHarbormaster, genKiosk, genBoathouse } from './buildings/special';
import { samplePalette, SkyState } from '../render/sky/palette';
import { anchors, collectFacades, collectSpans, type BuildingsService } from './buildings/anchors';
import { GreenKit, makeGreenTexture, createGreenMaterial } from './buildings/green';
import { setClutter } from './buildings/clutter';
import { createWinGeo } from './buildings/winGeo';

/** edge (m) of the square trim chunks (≈ two city blocks), grid origin at the slab's NW corner */
const TRIM_CHUNK = 110;
const MAX_TRIM_CHUNKS = 16;

const MY_KINDS: ReadonlySet<BuildingKind> = new Set<BuildingKind>([
  'tower', 'office', 'apartment', 'townhouse', 'house', 'warehouse', 'factory', 'school', 'hotel', 'harbormaster', 'kiosk', 'boathouse', 'depot',
]);

type Generator = (g: Gen) => void;
const GENERATORS: Partial<Record<BuildingKind, Generator>> = {
  townhouse: genTownhouse,
  tower: genTower,
  office: genTower,
  house: genHouse,
  apartment: genApartment,
  warehouse: genIndustrial,
  factory: genIndustrial,
  depot: genIndustrial,
  hotel: genHotel,
  school: genSchool,
  harbormaster: genHarbormaster,
  kiosk: genKiosk,
  boathouse: genBoathouse,
};

const KIND_LABEL: Record<string, string> = {
  tower: 'Office tower',
  office: 'Office building',
  apartment: 'Apartment block',
  townhouse: 'Townhouse',
  house: 'House',
  warehouse: 'Warehouse',
  factory: 'Factory',
  school: 'School',
  hotel: 'Hotel',
  harbormaster: "Harbour master's office",
  kiosk: 'Kiosk',
  boathouse: 'Boathouse',
  depot: 'Depot',
};

interface BuiltLot {
  lot: Lot;
  box: THREE.Box3;
  label: string;
}

export default function create(ctx: CityContext): CityModule {
  const t0 = performance.now();
  const plan = ctx.plan;
  // A/B switches: ?legacyfacade = original shell shader
  const mats = createMaterials(ctx.uniforms, { legacy: ctx.debug.params.has('legacyfacade'), wear: !ctx.debug.params.has('nowear'), winDepth: !ctx.debug.params.has('nowinreveal'), winRefl: !ctx.debug.params.has('nowinrefl'), wallRelief: !ctx.debug.params.has('nowallrelief'), plinth: !ctx.debug.params.has('noplinth') });
  const shell = new Builder({ normal: true, color: true, uv: true, facade: true });
  // ?nowingeo = no near-LOD sill / surround geometry (the shader sill everywhere)
  const winGeoOn = !ctx.debug.params.has('nowingeo');
  if (winGeoOn) shell.winRec = [];
  const trimChunks = new Map<number, Builder>();
  const trimOf = (x: number, z: number): Builder => {
    const kx = Math.max(0, Math.min(3, Math.floor((x + 220) / TRIM_CHUNK)));
    const kz = Math.max(0, Math.min(3, Math.floor((z + 200) / TRIM_CHUNK)));
    const key = kx * 4 + kz;
    let b = trimChunks.get(key);
    if (!b) {
      b = new Builder({ normal: true, color: true });
      trimChunks.set(key, b);
    }
    return b;
  };
  const lights = new Builder({ color: true, light: true });
  const signs = new Builder({ normal: true, uv: true });
  const cloth = new Builder({ normal: true, color: true });
  // ?nogreen = no leaf cards (A/B)
  const noGreen = ctx.debug.params.has('nogreen');
  const greenB = new Builder({ normal: true, color: true, uv: true, aux: true });
  const greenKit = new GreenKit(greenB, new Rng('buildings:green'));
  const atlas = new SignAtlas();
  resetOldtown();
  resetTowers();
  resetHomes();
  anchors.reset();
  setClutter(!ctx.debug.params.has('noclutter'));
  setDoorLife(!ctx.debug.params.has('nodoorlife'));
  setGutters(!ctx.debug.params.has('nogutters'));
  setColumnDetail(!ctx.debug.params.has('nocolumndetail'));
  // ?legacyhouses = original single house massing (A/B)
  setLegacyHouses(ctx.debug.params.has('legacyhouses'));

  const lots = plan.lots.filter((l) => MY_KINDS.has(l.kind));
  const colors = assignColors(lots, plan.lots);

  const problems: string[] = [];
  const built: BuiltLot[] = [];
  let violations = 0;
  let doorsWanted = 0;
  let doorsBuilt = 0;
  const kindCounts: Record<string, number> = {};

  for (const lot of lots) {
    const fp = lot.footprint;
    const cx = (fp.x0 + fp.x1) / 2,
      cz = (fp.z0 + fp.z1) / 2;
    const yaw = DIR_YAW[lot.front];
    const ns = lot.front === 'N' || lot.front === 'S';
    const W = ns ? fp.x1 - fp.x0 : fp.z1 - fp.z0;
    const D = ns ? fp.z1 - fp.z0 : fp.x1 - fp.x0;
    const trim = trimOf(cx, cz);
    for (const b of [shell, trim, lights, signs, cloth, greenB]) b.frame(yaw, cx, 0, cz);
    const g: Gen = {
      lot,
      rng: new Rng(lot.seed >>> 0 || 1),
      seed: (lot.seed % 997) + 1,
      W,
      D,
      shell,
      trim,
      lights,
      signs,
      cloth,
      green: greenKit,
      atlas,
      cover: computeCover(lot, plan.lots, yaw, cx, cz, W, D),
      doors: localDoors(lot, yaw, cx, cz, W, D),
      wallColor: colors.get(lot.id) ?? col(PALETTE.pastel[lot.style % 8]),
      doorsBuilt: 0,
      notes: [],
      driveSide: lot.kind === 'house' ? driveSideOf(lot, plan.areas, yaw, cx, cz) : undefined,
    };
    // footprint compliance check (geometry must stay inside the footprint; small
    // overhangs <= 1.2 m allowed only above 2.4 m)
    let bad = 0;
    let firstBad = '';
    const check = (x: number, y: number, z: number) => {
      const dx = Math.max(fp.x0 - x, 0, x - fp.x1);
      const dz = Math.max(fp.z0 - z, 0, z - fp.z1);
      const d = Math.max(dx, dz);
      if (d <= 0.012) return;
      if (y < 2.4 - 1e-3 || d > 1.2 + 0.012) {
        if (bad++ === 0) firstBad = `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) is ${d.toFixed(2)} m outside`;
      }
    };
    for (const b of [shell, trim, lights, signs, cloth, greenB]) b.check = check;
    const gen = GENERATORS[lot.kind] ?? genFallback;
    anchors.begin(lot, trim);
    try {
      gen(g);
    } catch (err) {
      problems.push(`lot ${lot.id} (${lot.kind}) generator threw: ${err instanceof Error ? err.message : String(err)}`);
      if (ctx.debug.enabled) console.error('[buildings]', lot.id, err);
    }
    anchors.end();
    for (const b of [shell, trim, lights, signs, cloth, greenB]) b.check = null;
    if (bad > 0) {
      violations++;
      problems.push(`lot ${lot.id} (${lot.kind}): ${bad} vertices break the footprint rule, e.g. ${firstBad}`);
    }
    doorsWanted += lot.doors.length;
    doorsBuilt += Math.min(g.doorsBuilt, lot.doors.length);
    if (g.doorsBuilt < lot.doors.length) problems.push(`lot ${lot.id} (${lot.kind}): ${lot.doors.length - g.doorsBuilt} door(s) not built`);
    kindCounts[lot.kind] = (kindCounts[lot.kind] ?? 0) + 1;
    const top = estimateTop(lot);
    built.push({
      lot,
      box: new THREE.Box3(new THREE.Vector3(fp.x0, 0, fp.z0), new THREE.Vector3(fp.x1, top, fp.z1)),
      label: lot.name ?? KIND_LABEL[lot.kind] ?? lot.kind,
    });
  }

  // ── meshes
  const tex = atlas.textures();
  mats.signs.map = tex.map;
  mats.signs.emissiveMap = tex.glow;
  mats.signs.needsUpdate = true;

  const group = new THREE.Group();
  group.name = 'buildings';
  const meshes: THREE.Mesh[] = [];
  const add = (b: Builder, m: THREE.Material, name: string, cast: boolean, receive: boolean) => {
    if (b.vertexCount === 0) return;
    const mesh = new THREE.Mesh(b.toGeometry(), m);
    b.dispose();
    mesh.name = name;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    meshes.push(mesh);
  };
  let trimTris = 0;
  for (const b of trimChunks.values()) trimTris += b.triangleCount;
  const triCounts = { shell: shell.triangleCount, trim: trimTris, lights: lights.triangleCount, signs: signs.triangleCount, green: greenB.triangleCount };
  add(shell, mats.shell, 'buildings-shell', true, true);
  for (const b of trimChunks.values()) add(b, mats.trim, 'buildings-trim', true, true);
  add(lights, mats.lights, 'buildings-lights', false, false);
  add(signs, mats.signs, 'buildings-signs', false, true);
  // static balcony laundry (no shadow; life hides it once its animated cloth hangs on service.laundry)
  add(cloth, mats.trim, 'buildings-laundry', false, true);
  const clothMesh = meshes.find((m) => m.name === 'buildings-laundry') ?? null;
  // plants: alpha-tested leaf cards (one draw call + shadow pass on medium/high)
  const greenTex = noGreen ? null : makeGreenTexture();
  const greenMat = greenTex ? createGreenMaterial(ctx.uniforms, greenTex) : null;
  if (greenMat) add(greenB, greenMat, 'buildings-green', ctx.quality.level !== 'low', true);
  else greenB.dispose();
  group.matrixAutoUpdate = false;
  ctx.scene.add(group);

  if (ctx.quality.level === 'low') mats.uniforms.uDetail.value = 0.4;
  const winGeo = shell.winRec ? createWinGeo(shell.winRec, ctx.quality.level === 'low' ? 22 : ctx.quality.level === 'medium' ? 32 : 42) : null;
  shell.winRec = null;
  if (winGeo) group.add(winGeo.group);
  // debug (perf analysis): ?bdbg=noshell,notrim,nocast,nodetail
  const bdbg = (ctx.debug.params.get('bdbg') ?? '').split(',');
  for (const m of meshes) {
    if (bdbg.includes('noshell') && m.name === 'buildings-shell') m.visible = false;
    if (bdbg.includes('notrim') && m.name === 'buildings-trim') m.visible = false;
    if (bdbg.includes('nocast')) m.castShadow = false;
  }
  if (bdbg.includes('nodetail')) mats.uniforms.uDetail.value = 0;
  if (bdbg.includes('weather')) mats.uniforms.uBhDebug.value = 1;
  if (bdbg.includes('wallinfo')) mats.uniforms.uBhDebug.value = 2;
  if (bdbg.includes('reveal')) mats.uniforms.uBhDebug.value = 3;
  if (bdbg.includes('nan')) mats.uniforms.uBhDebug.value = 4;
  if (bdbg.includes('ret')) mats.uniforms.uBhDebug.value = 7;
  if (bdbg.includes('src')) mats.uniforms.uBhDebug.value = 5;
  if (bdbg.includes('refl')) mats.uniforms.uBhDebug.value = 6;
  if (bdbg.includes('galb')) mats.uniforms.uBhDebug.value = 8;
  if (bdbg.includes('gem')) mats.uniforms.uBhDebug.value = 9;
  // anchors for other modules (life: smoke, laundry, bunting, birds; streetlife) + diagnostics for the
  // harness: __city.ctx.services.buildings.setDebug(0 | 1 | 2). Types: src/world/buildings/anchors.ts
  const facades = collectFacades(lots);
  const service: BuildingsService = {
    shops: anchors.shops,
    chimneys: anchors.chimneys,
    balconies: anchors.balconies,
    facades,
    spans: collectSpans(lots, facades, (d) => d === 'oldtown' || d === 'market'),
    perches: anchors.perches,
    laundry: anchors.laundry,
    vents: anchors.vents,
    setStaticLaundry(on: boolean) {
      if (clothMesh) clothMesh.visible = on;
    },
    setDebug(n: number) {
      mats.uniforms.uBhDebug.value = n;
    },
    houses: () => houseLog,
  };
  ctx.services.buildings = service;

  // ── picking (ray vs building boxes)
  const tmpV = new THREE.Vector3();
  ctx.pickers.push({
    name: 'buildings',
    pick(ray: THREE.Ray): PickHit | null {
      let best: BuiltLot | null = null;
      let bestD = Infinity;
      for (const b of built) {
        const hit = ray.intersectBox(b.box, tmpV);
        if (!hit) continue;
        const d = hit.distanceTo(ray.origin);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      if (!best) return null;
      const b = best;
      return {
        kind: 'building',
        id: b.lot.id,
        distance: bestD,
        label: b.label,
        getPosition(out: THREE.Vector3) {
          b.box.getCenter(out);
          out.y = b.box.max.y * 0.6;
          return true;
        },
        info() {
          const d = plan.districts.find((x) => x.kind === b.lot.district);
          const lines = [`${KIND_LABEL[b.lot.kind] ?? b.lot.kind}${d ? ` · ${d.name}` : ''}`, `${b.lot.floors} floor${b.lot.floors === 1 ? '' : 's'} · ${Math.round(b.box.max.y)} m`];
          if (b.lot.shopfront) lines.push('Shops on the ground floor');
          return lines;
        },
      };
    },
  });

  const buildMs = performance.now() - t0;
  if (ctx.debug.enabled) console.info(`[buildings] ${built.length} buildings in ${buildMs.toFixed(0)} ms`, triCounts);

  // sky reflection colours: the sky module's own time-of-day palette (zenith / horizon / sun glow /
  // clouds) + the live sun and hemisphere lights for the reflected city and the sun glints
  const zen = new THREE.Color();
  const hor = new THREE.Color();
  const dayZen = new THREE.Color('#4f86c6');
  const dayHor = new THREE.Color('#cfdfe8');
  const duskHor = new THREE.Color('#f2a272');
  const nightZen = new THREE.Color('#0b1426');
  const nightHor = new THREE.Color('#1c2740');
  const sky = new SkyState();
  const legacyLight = ctx.debug.params.has('legacylight');
  const camDir = new THREE.Vector3();
  const tmpC = new THREE.Color();
  const cityAlb = new THREE.Color(0.4, 0.39, 0.38);

  return {
    name: 'buildings',
    update(_dt, c) {
      mats.uniforms.uHours.value = c.clock.hours;
    },
    frame(_realDt, c) {
      if (winGeo) winGeo.frame(c.camera.position, mats.uniforms.uGeoWin.value);
      const u = c.uniforms;
      const day = u.uDaylight.value;
      const dusk = u.uDusk.value;
      const fog = c.scene.fog as THREE.Fog | THREE.FogExp2 | null;
      const mu = mats.uniforms;
      if (mats.legacy) {
        zen.copy(nightZen).lerp(dayZen, day);
        hor.copy(nightHor).lerp(dayHor, day).lerp(duskHor, dusk * 0.55);
        if (fog && (fog as THREE.Fog).color) hor.lerp((fog as THREE.Fog).color, 0.6);
        mu.uSkyZen.value.copy(zen);
        mu.uSkyHor.value.copy(hor);
        mu.uGround.value.setRGB(0.18 * day + 0.015, 0.17 * day + 0.015, 0.15 * day + 0.02);
      } else {
        samplePalette(c.clock.hours, sky, legacyLight);
        mu.uSkyZen.value.copy(sky.zenith);
        hor.copy(sky.horizon);
        if (fog && (fog as THREE.Fog).color) hor.lerp((fog as THREE.Fog).color, 0.25);
        mu.uSkyHor.value.copy(hor);
        mu.uSkyGlow.value.copy(sky.glow).multiplyScalar(sky.glowI * 0.55);
        mu.uCloudCol.value.copy(sky.cloudLit).lerp(hor, 0.25);
        // live lights (sun / moon + hemisphere) → glints, reflected city, reflected ground
        const sunDirY = u.uSunDir.value.y;
        const sunUp = THREE.MathUtils.smoothstep(sunDirY, -0.03, 0.06);
        const L = c.services.sky;
        const sunI = L ? L.sun.intensity : 2;
        const hemiI = L ? L.hemi.intensity : 1;
        if (L) mu.uSunCol.value.copy(L.sun.color).multiplyScalar(sunI * sunUp * 0.9);
        else mu.uSunCol.value.setRGB(0, 0, 0);
        const city = mu.uCityCol.value;
        if (L) city.copy(L.hemi.color).multiplyScalar(hemiI * 0.85).add(tmpC.copy(L.sun.color).multiplyScalar(sunI * 0.42 * sunUp));
        else city.setRGB(1, 1, 1);
        city.multiply(cityAlb).multiplyScalar(1 / Math.PI);
        const gnd = mu.uGround.value;
        if (L) gnd.copy(L.hemi.groundColor).multiplyScalar(hemiI * 0.5).add(tmpC.copy(L.sun.color).multiplyScalar(sunI * 0.3 * sunUp));
        else gnd.setRGB(0.5, 0.5, 0.5);
        gnd.multiplyScalar(0.3 / Math.PI);
        // the studio backdrop (cyclorama) closes the reflected lower hemisphere like the sky dome does
        const cyc = (sky as SkyState & { cyc?: THREE.Color }).cyc;
        if (cyc) gnd.lerp(tmpC.copy(cyc).multiplyScalar(0.8), 0.45);
        // stylised horizon lift: the reflected horizon crosses the facades in view at any camera tilt
        c.camera.getWorldDirection(camDir);
        mu.uReflLift.value = THREE.MathUtils.clamp(-camDir.y * 0.8 + 0.06, 0.08, 0.72);
      }
      const night = THREE.MathUtils.clamp(u.uLights.value * (0.45 + 0.55 * u.uNight.value), 0, 1);
      mats.signs.emissiveIntensity = night * 2.2;
    },
    stats() {
      return {
        buildings: built.length,
        shellTris: triCounts.shell,
        trimTris: triCounts.trim,
        lightTris: triCounts.lights,
        signTris: triCounts.signs,
        greenTris: triCounts.green,
        meshes: meshes.length,
        buildMs: Math.round(buildMs),
        chimneys: service.chimneys.length,
        balconies: service.balconies.length,
        spans: service.spans.length,
        perches: service.perches.length,
        laundryLines: service.laundry.length,
        vents: service.vents.length,
        shops: service.shops.length,
        ...(winGeo ? winGeo.stats() : {}),
        ...Object.fromEntries(Object.entries(kindCounts).map(([k, v]) => [`n_${k}`, v])),
        ...Object.fromEntries(Object.entries(houseStats).map(([k, v]) => [`house_${k}`, v])),
      };
    },
    invariants() {
      const out = [...problems];
      if (built.length !== lots.length) out.push(`built ${built.length} of ${lots.length} building lots`);
      if (doorsBuilt < doorsWanted) out.push(`${doorsWanted - doorsBuilt} of ${doorsWanted} doors missing`);
      if (meshes.length > 6 + MAX_TRIM_CHUNKS) out.push(`too many building meshes (${meshes.length})`);
      if (violations > 0) out.push(`${violations} building(s) violate the footprint rule`);
      if (atlas.full) out.push('sign atlas overflowed');
      return out;
    },
    dispose() {
      ctx.scene.remove(group);
      for (const m of meshes) m.geometry.dispose();
      mats.shell.dispose();
      mats.trim.dispose();
      mats.lights.dispose();
      mats.signs.dispose();
      greenMat?.dispose();
      tex.map.dispose();
      tex.glow.dispose();
    },
  };
}

// ───────────────────────────────────────────────────────── helpers ──

function estimateTop(lot: Lot): number {
  switch (lot.roof) {
    case 'gable':
    case 'hip':
      return lot.height + Math.min(6, Math.min(lot.footprint.x1 - lot.footprint.x0, lot.footprint.z1 - lot.footprint.z0) * 0.45);
    default:
      return lot.height + 2;
  }
}

/** Which local side (left/right) of a house faces its driveway. */
function driveSideOf(lot: Lot, areas: Area[], yaw: number, cx: number, cz: number): Side | undefined {
  const r = lot.rect;
  for (const a of areas) {
    if (a.kind !== 'driveway') continue;
    const mx = (a.rect.x0 + a.rect.x1) / 2,
      mz = (a.rect.z0 + a.rect.z1) / 2;
    if (mx < r.x0 || mx > r.x1 || mz < r.z0 || mz > r.z1) continue;
    const [lx] = toLocal(mx, mz, yaw, cx, cz);
    return lx > 0 ? 1 : 3;
  }
  return undefined;
}

/** World (x,z) -> local frame of a lot. */
function toLocal(x: number, z: number, yaw: number, cx: number, cz: number): [number, number] {
  const cs = Math.cos(yaw),
    sn = Math.sin(yaw);
  const dx = x - cx,
    dz = z - cz;
  return [cs * dx - sn * dz, sn * dx + cs * dz];
}

function localDoors(lot: Lot, yaw: number, cx: number, cz: number, W: number, D: number): LocalDoor[] {
  const out: LocalDoor[] = [];
  for (const d of lot.doors) {
    const [lx, lz] = toLocal(d.x, d.z, yaw, cx, cz);
    const e = 0.06;
    let side: Side;
    let u: number;
    if (Math.abs(lz - D / 2) < e) {
      side = 0;
      u = lx + W / 2;
    } else if (Math.abs(lx - W / 2) < e) {
      side = 1;
      u = D / 2 - lz;
    } else if (Math.abs(lz + D / 2) < e) {
      side = 2;
      u = W / 2 - lx;
    } else {
      side = 3;
      u = lz + D / 2;
    }
    out.push({ side, u });
  }
  return out;
}

/** Intervals of each footprint side covered by neighbouring footprints (any lot kind). */
function computeCover(lot: Lot, all: Lot[], yaw: number, cx: number, cz: number, W: number, D: number): Interval[][] {
  const out: Interval[][] = [[], [], [], []];
  const tol = 0.6;
  const fp = lot.footprint;
  for (const m of all) {
    if (m === lot) continue;
    const f = m.footprint;
    // quick reject in world space
    if (f.x0 > fp.x1 + tol || f.x1 < fp.x0 - tol || f.z0 > fp.z1 + tol || f.z1 < fp.z0 - tol) continue;
    const a = toLocal(f.x0, f.z0, yaw, cx, cz);
    const b = toLocal(f.x1, f.z1, yaw, cx, cz);
    const x0 = Math.min(a[0], b[0]),
      x1 = Math.max(a[0], b[0]),
      z0 = Math.min(a[1], b[1]),
      z1 = Math.max(a[1], b[1]);
    const h = m.height;
    // front (z = D/2)
    if (Math.abs(z0 - D / 2) < tol && x1 > -W / 2 && x0 < W / 2) out[0].push({ a: Math.max(-W / 2, x0) + W / 2, b: Math.min(W / 2, x1) + W / 2, h });
    // right (x = W/2)
    if (Math.abs(x0 - W / 2) < tol && z1 > -D / 2 && z0 < D / 2) out[1].push({ a: D / 2 - Math.min(D / 2, z1), b: D / 2 - Math.max(-D / 2, z0), h });
    // back (z = -D/2)
    if (Math.abs(z1 + D / 2) < tol && x1 > -W / 2 && x0 < W / 2) out[2].push({ a: W / 2 - Math.min(W / 2, x1), b: W / 2 - Math.max(-W / 2, x0), h });
    // left (x = -W/2)
    if (Math.abs(x1 + W / 2) < tol && z1 > -D / 2 && z0 < D / 2) out[3].push({ a: Math.max(-D / 2, z0) + D / 2, b: Math.min(D / 2, z1) + D / 2, h });
  }
  for (let s = 0; s < 4; s++) {
    const list = out[s].filter((iv) => iv.b - iv.a > 0.3).sort((p, q) => p.a - q.a);
    const merged: Interval[] = [];
    for (const iv of list) {
      const last = merged[merged.length - 1];
      if (last && iv.a <= last.b + 0.05) {
        last.b = Math.max(last.b, iv.b);
        last.h = Math.max(last.h, iv.h);
      } else merged.push({ ...iv });
    }
    out[s] = merged;
  }
  return out;
}

/** Facade colours; townhouses get neighbour-aware pastel picks so rows never repeat a colour. */
function assignColors(lots: Lot[], all: Lot[]): Map<number, THREE.Color> {
  const out = new Map<number, THREE.Color>();
  const idx = new Map<number, number>();
  const pastel = PALETTE.pastel;
  const touching = (a: Lot, b: Lot) => {
    const f = a.footprint,
      g = b.footprint;
    return f.x0 <= g.x1 + 0.7 && f.x1 >= g.x0 - 0.7 && f.z0 <= g.z1 + 0.7 && f.z1 >= g.z0 - 0.7;
  };
  for (const lot of lots) {
    const rng = new Rng((lot.seed ^ 0x5bd1e995) >>> 0 || 3);
    if (lot.kind === 'townhouse') {
      const used = new Set<number>();
      for (const o of all) {
        if (o === lot || !idx.has(o.id)) continue;
        if (touching(lot, o)) used.add(idx.get(o.id)!);
      }
      let k = lot.style % pastel.length;
      for (let tries = 0; tries < pastel.length && used.has(k); tries++) k = (k + 3) % pastel.length;
      idx.set(lot.id, k);
      out.set(lot.id, jit(pastel[k], rng, 0.06));
    } else {
      out.set(lot.id, jit(pastel[lot.style % pastel.length], rng, 0.05));
    }
  }
  return out;
}

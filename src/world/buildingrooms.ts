// Module "buildingrooms" (close round, docs/progress/close-windows.md): real depth behind every window in the city, by one system. For the
// windows of the bubble around the camera one small quad lies over the glass and adds the room behind it (buildingrooms/glsl.ts), while the
// facade fades its own flat interior out over the same distance. A room belongs to the window's building and floor: it is as wide as the run
// of windows that share it, so the same sofa and the same shelves show through neighbouring panes; what stands in it comes from a 3D-drawn
// atlas (buildingrooms/atlas.ts), by the kind of shop or home it is.
//
// Switches (src/core/closewin.ts): ?noclosewin all; ?cwr=<m> the range.

import * as THREE from 'three';
import type { CityContext, CityModule } from '../core/context';
import { closeWin } from '../core/closewin';
import { globalUniforms } from '../core/uniforms';
import { nearOf } from '../core/nearDetail';
import { PROF, WIN, GLASS_COLS } from './buildings/materials';
import { WIN_REC } from './buildings/winGeo';
import { glassMirror } from './water/glassMirror';
import type { LetterSpot } from './buildings/anchors';
import { blankShadowMap } from '../core/shadowBlank';
import { buildRoomAtlas } from './buildingrooms/atlas';
import { ROOM_FRAG, ROOM_VERT } from './buildingrooms/glsl';
import { hex, rng } from './buildingrooms/kit';
import { kindIndex, ROOM_KINDS, type RoomKind } from './buildingrooms/pages';

/** floats per vertex of a window's quad */
/** how far (m) a room's quad shows; the facade hands over across the outer 30 % */
const RADIUS = 34;
const CELL = 16;

const ATTRS: [string, number][] = [
  ['position', 3],
  ['aQ', 2],
  ['aRoom', 4],
  ['aRect', 4],
  ['aWin', 4],
  ['aWalls', 4],
  ['aCards', 4],
  ['aMisc', 4],
  ['aDir', 4],
  ['aPaint', 3],
  ['aGlass', 3],
];
const stride = ATTRS.reduce((n, a) => n + a[1], 0);

const toGeometry = (data: Float32Array): THREE.BufferGeometry => {
  const g = new THREE.BufferGeometry();
  const ib = new THREE.InterleavedBuffer(data, stride);
  let o = 0;
  for (const [name, size] of ATTRS) {
    g.setAttribute(name, new THREE.InterleavedBufferAttribute(ib, size, o));
    o += size;
  }
  return g;
};

interface Room {
  /** the room's left end along the wall, as a distance along (dx, dz), and its floor */
  t0: number;
  y0: number;
  W: number;
  H: number;
  D: number;
  seed: number;
  walls: [number, number, number, number];
  cards: [number, number, number, number];
  misc: [number, number, number, number];
  paint: readonly [number, number, number];
}

const linear = (c: string): [number, number, number] => {
  const col = new THREE.Color(c);
  return [col.r, col.g, col.b];
};

export default function create(ctx: CityContext): CityModule {
  const stats: Record<string, number | string> = {};
  const none: CityModule = { name: 'buildingrooms', stats: () => stats };
  const service = ctx.services.buildings as { uniforms?: Record<string, THREE.IUniform> } | undefined;
  const winGroup = ctx.scene.getObjectByName('buildings-winrec');
  const rec = winGroup?.userData.rec as Float32Array | undefined;
  if (!closeWin(ctx, 'closewin') || !service?.uniforms || !rec) return none;
  const near = nearOf(ctx);
  const t0 = performance.now();

  const atlas = buildRoomAtlas(ctx.renderer, ctx.quality.level === 'high' ? 1 : 0.5);
  stats.atlasMs = Math.round(atlas.ms);
  if (ctx.debug.params.has('cwatlas')) (window as unknown as { __cwAtlas: unknown }).__cwAtlas = atlas;

  // the room of every window: windows side by side on one floor of one wall share a room
  const nRec = Math.floor(rec.length / WIN_REC);
  const groups = new Map<string, number[]>();
  for (let i = 0; i < nRec; i++) {
    const o = i * WIN_REC;
    const dx = rec[o + 3],
      dz = rec[o + 4];
    const nd = -dz * rec[o] + dx * rec[o + 2];
    const key = `${Math.round(rec[o + 8])}|${Math.round(rec[o + 9])}|${Math.round(rec[o + 10])}|${Math.round(dx * 100)}|${Math.round(dz * 100)}|${Math.round(nd * 5)}|${Math.round((rec[o + 1] - rec[o + 7]) * 5)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(i);
  }
  const roomOf = new Int32Array(nRec);
  const rooms: Room[] = [];
  const glassTint = GLASS_COLS.map(linear);

  // the word on the shop's sign (the lettering module writes its name and wares from the same word)
  const spots = ((ctx.services.buildings as { letterSpots?: LetterSpot[] }).letterSpots ?? []).filter((s) => s.kind === 'window' && s.word);
  const wordAt = (i: number): string | undefined => {
    const o = i * WIN_REC;
    const dx = rec[o + 3],
      dz = rec[o + 4];
    const px = rec[o] + dx * rec[o + 5] * 0.5,
      pz = rec[o + 2] + dz * rec[o + 5] * 0.5;
    let best: string | undefined;
    let bestD = 1.2;
    for (const s of spots) {
      if (s.nx * -dz + s.nz * dx < 0.9) continue;
      const u = (px - s.x) * s.tx + (pz - s.z) * s.tz;
      const n = (px - s.x) * s.nx + (pz - s.z) * s.nz;
      const off = Math.max(0, -u, u - s.w);
      const d = off + Math.abs(n);
      if (d < bestD) {
        bestD = d;
        best = s.word;
      }
    }
    return best;
  };
  const kindOfWord = (word: string): string | null => {
    const w = word.toLowerCase();
    const rules: [RegExp, string][] = [
      [/bakery|pâtisserie/, 'bakery'], [/books|bookbinder|stationery/, 'books'], [/florist/, 'florist'], [/deli|cheese|butcher|chocolate/, 'deli'], [/greengrocer/, 'grocer'],
      [/pharmacy/, 'pharmacy'], [/barber/, 'barber'], [/toy/, 'toys'], [/optic/, 'optician'], [/hardware/, 'hardware'], [/antiques/, 'antiques'], [/records/, 'records'],
      [/bike/, 'bikes'], [/gallery/, 'gallery'], [/shoes/, 'shoes'], [/hat/, 'hats'], [/post/, 'post'], [/bank/, 'lobby'], [/boutique|tailor/, 'fashion'],
      [/café|espresso|coffee|bistro|pizzeria|fish|tea room|anchor|pub|wine|gelato|^ice/, 'cafe'],
    ];
    for (const [re, id] of rules) if (re.test(w)) return id;
    return null;
  };

  const chooseKind = (style: number, prof: number, shopT: number, r: () => number, row: number, word?: string): RoomKind => {
    const named = (...names: string[]) => ROOM_KINDS[kindIndex(names[Math.floor(r() * names.length) % names.length])];
    if (style === WIN.SHOP) {
      const byWord = word ? kindOfWord(word) : null;
      if (byWord) return named(byWord);
      const T = shopT === 0 ? 1 + Math.floor(r() * 7) : shopT;
      if (T === 1) return named('cafe');
      if (T === 2) return named('bakery');
      if (T === 9) return named('deli');
      if (T === 3) return named('books', 'books', 'records');
      if (T === 4) return named('florist', 'grocer');
      if (T === 5) return named('fashion', 'fashion', 'shoes', 'hats', 'barber');
      if (T === 6) return named('pharmacy', 'hardware', 'optician', 'bikes', 'post');
      if (T === 8) return named('lobby');
      return named('gallery', 'antiques', 'toys');
    }
    if (style === WIN.DOOR) return named(prof === PROF.ALWAYS ? 'lobby' : 'hall');
    if (prof === PROF.HOME) return row === 0 ? named('living', 'living', 'kitchen', 'study') : named('living', 'bedroom', 'bedroom', 'kitchen', 'study');
    if (prof === PROF.HOTEL) return named('bedroom');
    if (prof === PROF.OFFICE || prof === PROF.SHOP) return named('office');
    if (prof === PROF.SCHOOL) return named('school');
    if (prof === PROF.INDUSTRIAL) return named('work');
    return named('hall', 'work');
  };

  for (const members of groups.values()) {
    const along = (i: number) => {
      const o = i * WIN_REC;
      return rec[o] * rec[o + 3] + rec[o + 2] * rec[o + 4] - rec[o + 19];
    };
    members.sort((a, b) => along(a) - along(b));
    const o0 = members[0] * WIN_REC;
    const kindCode = Math.round(rec[o0 + 9]);
    const style = Math.floor((kindCode % 64) / 8);
    const prof = kindCode % 8;
    const shopT = Math.floor(Math.round(rec[o0 + 10]) / 16);
    const gw = rec[o0 + 16],
      gh = rec[o0 + 17];
    const y0 = rec[o0 + 1] - rec[o0 + 7];
    const row = rec[o0 + 15];
    const seed = Math.round(rec[o0 + 8]);
    const r = rng(seed * 31 + Math.round(y0 * 7) + 11);
    // how many cells a room takes in a row
    const maxCells = (rr: number): number => {
      if (style === WIN.SHOP || style === WIN.DOOR) return Math.max(1, Math.floor(10 / gw));
      if (prof === PROF.OFFICE) return 2 + Math.floor(rr * 4);
      if (prof === PROF.INDUSTRIAL || prof === PROF.SCHOOL) return 2 + Math.floor(rr * 3);
      if (style === WIN.CURTAIN) return 3 + Math.floor(rr * 3);
      return rr < 0.45 ? 1 : rr < 0.85 ? 2 : 3;
    };
    let k = 0;
    while (k < members.length) {
      const first = members[k];
      const startT = along(first);
      const take = maxCells(r());
      let last = k;
      while (last + 1 < members.length && last + 1 - k < take) {
        const gap = along(members[last + 1]) - along(members[last]) - gw;
        if (gap > 0.6) break;
        last++;
      }
      const span = along(members[last]) + gw - startT;
      const kind = chooseKind(style, prof, shopT, r, row, style === WIN.SHOP ? wordAt(first) : undefined);
      // a room is wider than a narrow window: it runs on behind the wall beside it
      const minW = style === WIN.SHOP ? 3.6 : kind.lamp === 2 ? 4 : 3;
      const W = Math.max(span, minW);
      const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];
      const room: Room = {
        t0: startT - (W - span) * (0.25 + r() * 0.5),
        y0,
        W,
        H: gh,
        D: kind.depth[0] + (kind.depth[1] - kind.depth[0]) * r(),
        seed: Math.floor(r() * 9973),
        walls: [0, 0, 0, 0],
        cards: [-1, -1, -1, -1],
        misc: [pick(kind.floors), kind.lamp, kind.midK, kind.dispK],
        paint: hex(pick(kind.paints)),
      };
      // (dealt, not drawn: four draws could fill a whole room with one page, and one page tiled along a wall reads as a grid)
      const deck = kind.walls.slice();
      for (let w = deck.length - 1; w > 0; w--) {
        const q = Math.floor(r() * (w + 1)) % (w + 1);
        [deck[w], deck[q]] = [deck[q], deck[w]];
      }
      for (let w = 0; w < 4; w++) room.walls[w] = atlas.wallIndex.get(deck[w % deck.length]) ?? 0;
      if (kind.mid.length) {
        room.cards[0] = atlas.cardIndex.get(pick(kind.mid)) ?? -1;
        room.cards[1] = atlas.cardIndex.get(pick(kind.mid)) ?? -1;
      }
      if (kind.disp.length) {
        room.cards[2] = atlas.cardIndex.get(pick(kind.disp)) ?? -1;
        room.cards[3] = atlas.cardIndex.get(pick(kind.disp)) ?? -1;
      }
      const id = rooms.length;
      rooms.push(room);
      for (let m = k; m <= last; m++) roomOf[members[m]] = id;
      k = last + 1;
    }
  }
  stats.windows = nRec;
  stats.rooms = rooms.length;

  // windows by bubble cell
  const bins = new Map<number, number[]>();
  const binKey = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);
  for (let i = 0; i < nRec; i++) {
    const o = i * WIN_REC;
    const cx = rec[o] + rec[o + 3] * rec[o + 5] * 0.5,
      cz = rec[o + 2] + rec[o + 4] * rec[o + 5] * 0.5;
    const key = binKey(Math.floor(cx / CELL), Math.floor(cz / CELL));
    let b = bins.get(key);
    if (!b) bins.set(key, (b = []));
    b.push(i);
  }

  const cwR = Number(ctx.debug.params.get('cwr')) || RADIUS;
  const bu = service.uniforms;
  const uniforms: Record<string, THREE.IUniform> = {
    tWall: { value: atlas.walls },
    tCard: { value: atlas.cards },
    uGridW: { value: atlas.gridW },
    uGridC: { value: atlas.gridC },
    uCwDay: { value: new THREE.Color() },
    uCwSun: { value: new THREE.Color() },
    uCwRadius: { value: cwR },
    uCwGm: { value: 0 },
    uSunDir: globalUniforms.uSunDir,
    uNearEye: globalUniforms.uNearEye,
    uNearLens: globalUniforms.uNearLens,
    uHours: bu.uHours,
    uTime: globalUniforms.uTime,
    uNight: globalUniforms.uNight,
    uLights: globalUniforms.uLights,
  };
  const sunOn = closeWin(ctx, 'cwsun', 'high');
  const walkOn = closeWin(ctx, 'cwwalk') && atlas.cardIndex.has('walk0a');
  if (sunOn) {
    uniforms.tCwShadow = { value: blankShadowMap(ctx.renderer) };
    uniforms.uCwSunM = { value: new THREE.Matrix4() };
  }
  const material = new THREE.ShaderMaterial({
    name: 'buildingrooms',
    defines: { ...(sunOn ? { CW_SUN: 1 } : {}), ...(walkOn ? { CW_WALK: atlas.cardIndex.get('walk0a')! } : {}) },
    uniforms,
    vertexShader: ROOM_VERT,
    fragmentShader: ROOM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -8,
    fog: false,
    toneMapped: false,
  });

  const put = (a: Float32Array, o: number, i: number, cx: number, cy: number): number => {
    // corner (cx, cy) of the window's visible rectangle, in metres from the window's lower left
    const w = i * WIN_REC;
    const dx = rec[w + 3],
      dz = rec[w + 4];
    const room = rooms[roomOf[i]];
    const wLeft = rec[w] * dx + rec[w + 2] * dz;
    const bottom = rec[w + 1];
    a[o++] = rec[w] + dx * cx - dz * 0.006;
    a[o++] = bottom + cy;
    a[o++] = rec[w + 2] + dz * cx + dx * 0.006;
    a[o++] = wLeft + cx - room.t0;
    a[o++] = bottom + cy - room.y0;
    a[o++] = room.W;
    a[o++] = room.H;
    a[o++] = room.D;
    a[o++] = room.seed;
    a[o++] = wLeft - room.t0;
    a[o++] = wLeft - room.t0 + rec[w + 5];
    a[o++] = bottom - room.y0;
    a[o++] = bottom - room.y0 + rec[w + 6];
    a[o++] = rec[w + 14];
    a[o++] = rec[w + 15];
    a[o++] = rec[w + 8];
    a[o++] = rec[w + 9];
    for (let k = 0; k < 4; k++) a[o++] = room.walls[k];
    for (let k = 0; k < 4; k++) a[o++] = room.cards[k];
    for (let k = 0; k < 4; k++) a[o++] = room.misc[k];
    a[o++] = dx;
    a[o++] = dz;
    a[o++] = rec[w + 16];
    a[o++] = rec[w + 17];
    a[o++] = room.paint[0];
    a[o++] = room.paint[1];
    a[o++] = room.paint[2];
    const glass = glassTint[Math.floor(rec[w + 18] / 8) % 8] ?? glassTint[0];
    a[o++] = glass[0];
    a[o++] = glass[1];
    a[o++] = glass[2];
    return o;
  };

  near.addMeshes({
    name: 'closeRooms',
    radius: cwR,
    cell: CELL,
    top: 120,
    margin: CELL * 0.75,
    material,
    renderOrder: -79,
    receiveShadow: false,
    standIn: toGeometry(new Float32Array(stride * 3)),
    build: (c) => {
      const list = bins.get(binKey(c.i, c.j));
      if (!list) return null;
      const a = new Float32Array(list.length * 4 * stride);
      const idx = new Uint16Array(list.length * 6);
      if (list.length * 4 > 65000) return null;
      let o = 0,
        n = 0,
        v = 0;
      for (const i of list) {
        const w = i * WIN_REC;
        const x0 = rec[w + 20],
          x1 = rec[w + 21],
          y0 = rec[w + 22],
          y1 = rec[w + 23];
        o = put(a, o, i, x0, y0);
        o = put(a, o, i, x1, y0);
        o = put(a, o, i, x1, y1);
        o = put(a, o, i, x0, y1);
        idx[n++] = v;
        idx[n++] = v + 1;
        idx[n++] = v + 2;
        idx[n++] = v;
        idx[n++] = v + 2;
        idx[n++] = v + 3;
        v += 4;
      }
      const g = toGeometry(a);
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      return g;
    },
  });
  // the facade hands over to this inside the range
  bu.uCloseWin.value = cwR;

  stats.bootMs = Math.round(performance.now() - t0);

  const sunC = new THREE.Color();
  return {
    name: 'buildingrooms',
    stats: () => stats,
    frame(_dt, c) {
      const L = c.services.sky as { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight } | undefined;
      const day = uniforms.uCwDay.value as THREE.Color;
      if (L) {
        // what the sky through a pane does to an albedo beside it
        day.copy(L.hemi.color).multiplyScalar((L.hemi.intensity / Math.PI) * 1.1);
        sunC.copy(L.sun.color).multiplyScalar((L.sun.intensity / Math.PI) * Math.max(0, Math.min(1, c.uniforms.uSunDir.value.y * 8)));
        day.add((uniforms.uCwSun.value as THREE.Color).copy(sunC).multiplyScalar(0.1));
        (uniforms.uCwSun.value as THREE.Color).copy(sunC);
        if (sunOn) {
          uniforms.tCwShadow.value = L.sun.shadow.map?.depthTexture ?? blankShadowMap(c.renderer);
          uniforms.uCwSunM.value = L.sun.shadow.matrix;
        }
      }
      uniforms.uCwGm.value = glassMirror.uGM.value.x;
    },
  };
}

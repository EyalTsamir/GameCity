#!/usr/bin/env node
// Geometry audit: walks the live scene (real build, real heights) and reports triangles and shape defects per mesh.
//
//   node scripts/geomaudit.mjs --url http://127.0.0.1:5191/ --out shots/geom/base [--q "nogeomhunt"] [--module props]
//   node scripts/geomaudit.mjs --url … --out shots/geom/base --census [--census-res 512] [--census-points 140]
//   node scripts/geomaudit.mjs --harness C:/Projects/GameCity/scripts …   (browser.mjs of the main checkout: its shared lock)
//   node scripts/geomaudit.mjs --url … --no-audit --tris "overview;street=5,1.5,-65,9,0,6;downtown;harbor"   (triangles per view)
//   node scripts/geomaudit.mjs --url … --no-audit --drill "landmarks-static" --drill-min 5000   (repeated part families of meshes)
//
// Writes <out>.json (everything, including samples with world positions) and <out>.md (ranked tables). Per mesh:
//   tris          triangles of one draw × instances       casts      castShadow
//   degenerate    zero-area triangles (area < 1e-6 m²)    sliver     long needles (> 1 m long, > 300:1)
//   flipped       winding disagrees with the vertex normals (FrontSide materials only) → the surface vanishes from
//                 its visible side, or the normals are wrong
//   dup / backto  coincident triangles: same winding (z-fight) / opposite winding (internal face between two parts)
//   buried        all 3 corners ≥ 8 cm below terrain.height (fully underground: never visible)
//   bottom        facing down and resting on the ground (within 4 cm): never visible
// Per connected part of a static mesh (welded by position), city-wide:
//   floating      lowest point > 6 cm above ground and nothing in any mesh within 3 cm under it or around it
//   sunk          the whole part is underground (waste)
//   inBuilding    a non-building part whose lower 2.2 m stands inside a building footprint (occupancy grid)
// Instanced meshes are checked per instance with instanceMatrix (shader-placed instances cannot be checked here).
//
// --census renders every static mesh with triangle ids from sample cameras (pedestrian nodes at eye level, road
// lanes at driver height, POI fly-overs) and reports per mesh which share of the triangles was never rasterised in
// any view: big never-seen triangles are candidates for removal (`hidden`), tiny ones for an earlier LOD (`tiny`).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[a.slice(2)] = true;
  else args[a.slice(2)] = process.argv[++i];
}
const harness = args.harness ?? process.env.TH_HARNESS ?? path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const { launchBrowser, acquireLock, releaseLock } = await import(pathToFileURL(path.join(harness, 'browser.mjs')).href);

const baseUrl = (args.url ?? 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const q = [args.q, 'adaptive=0', 'nointro', 'noidle', 'nowarmup'].filter((s) => s && s !== true).join('&');
const out = path.resolve(args.out ?? 'shots/geom/audit');
fs.mkdirSync(path.dirname(out), { recursive: true });

// ── everything below runs in the page ──────────────────────────────────────────────────────────────────────────
function auditInPage(opt) {
  const city = window.__city;
  const { ctx } = city;
  const ground = ctx.services.terrain?.height ?? ctx.plan.heightAt;
  const occ = ctx.occupancy;
  ctx.scene.updateMatrixWorld(true);

  // ground height memo on a 0.25 m raster (a few million lookups)
  const hMemo = new Map();
  const gh = (x, z) => {
    const k = Math.round(x * 4) * 100003 + Math.round(z * 4);
    let h = hMemo.get(k);
    if (h === undefined) {
      h = ground(x, z);
      hMemo.set(k, h);
    }
    return h;
  };

  const moduleOf = (o) => {
    for (let p = o; p; p = p.parent) if (p.userData?.module) return p.userData.module;
    return '?';
  };
  const pathOf = (o) => {
    const parts = [];
    for (let p = o; p && p !== ctx.scene; p = p.parent) parts.unshift(p.name || p.type);
    return parts.join('/');
  };

  const meshes = [];
  ctx.scene.traverse((o) => {
    if (!(o.isMesh || o.isLine || o.isPoints) || !o.geometry?.attributes?.position) return;
    meshes.push(o);
  });

  const round = (v) => Math.round(v * 100) / 100;
  const rows = [];
  const parts = []; // connected parts of all static meshes
  const samplesOf = (arr, n, item) => {
    if (arr.length < n) arr.push(item);
    else if (Math.random() < 0.02) arr[Math.floor(Math.random() * n)] = item;
  };

  const HASH_BITS = 22;
  const table = new Float64Array(1 << HASH_BITS);
  const tableW = new Int8Array(1 << HASH_BITS);

  for (const mesh of meshes) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const idx = geo.index;
    const start = geo.drawRange?.start ?? 0;
    const cnt = Math.min(geo.drawRange?.count ?? Infinity, idx ? idx.count : pos.count);
    const triCount = mesh.isMesh ? Math.floor(cnt / 3) : 0;
    const instanced = !!mesh.isInstancedMesh || geo.isInstancedBufferGeometry;
    const instances = mesh.isInstancedMesh ? mesh.count : geo.isInstancedBufferGeometry ? Math.min(geo.instanceCount ?? 0, 1e9) : 1;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const side = mats[0]?.side ?? 0;
    const row = {
      module: moduleOf(mesh),
      path: pathOf(mesh),
      material: mats[0]?.name || mats[0]?.type || '',
      visible: mesh.visible,
      casts: !!mesh.castShadow,
      side,
      instanced,
      instances,
      triPerInst: triCount,
      tris: triCount * instances,
      verts: pos.count,
      degenerate: 0,
      sliver: 0,
      flipped: 0,
      dup: 0,
      backto: 0,
      buried: 0,
      bottom: 0,
      samples: { flipped: [], degenerate: [], dup: [], backto: [], buried: [], bottom: [] },
    };
    rows.push(row);
    if (!mesh.isMesh || triCount === 0) continue;

    const nrm = geo.attributes.normal;
    const m = mesh.matrixWorld.elements;
    const px = (i) => pos.getX(i);
    const py = (i) => pos.getY(i);
    const pz = (i) => pos.getZ(i);
    const inst = mesh.isInstancedMesh;

    // world transform of the mesh (instance matrices are applied in the instance pass below)
    const W = new Float64Array(9);
    const wp = (i, off) => {
      const x = px(i), y = py(i), z = pz(i);
      W[off] = m[0] * x + m[4] * y + m[8] * z + m[12];
      W[off + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      W[off + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    };

    table.fill(0);
    let parentArr = null;
    const weld = new Map();
    const staticForParts = !instanced && !opt.skipParts;
    if (staticForParts) {
      parentArr = new Int32Array(pos.count);
      for (let i = 0; i < pos.count; i++) parentArr[i] = i;
    }
    const find = (a) => {
      while (parentArr[a] !== a) {
        parentArr[a] = parentArr[parentArr[a]];
        a = parentArr[a];
      }
      return a;
    };
    const union = (a, b) => {
      a = find(a);
      b = find(b);
      if (a !== b) parentArr[b] = a;
    };
    const QW = 100; // 1 cm weld
    if (staticForParts) {
      for (let i = 0; i < pos.count; i++) {
        const k = Math.round(px(i) * QW) * 73856093 ^ Math.round(py(i) * QW) * 19349663 ^ Math.round(pz(i) * QW) * 83492791;
        const prev = weld.get(k);
        if (prev === undefined) weld.set(k, i);
        else union(prev, i);
      }
    }

    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx.getX(start + t * 3) : start + t * 3;
      const i1 = idx ? idx.getX(start + t * 3 + 1) : start + t * 3 + 1;
      const i2 = idx ? idx.getX(start + t * 3 + 2) : start + t * 3 + 2;
      if (staticForParts) {
        union(i0, i1);
        union(i0, i2);
      }
      wp(i0, 0);
      wp(i1, 3);
      wp(i2, 6);
      const ax = W[3] - W[0], ay = W[4] - W[1], az = W[5] - W[2];
      const bx = W[6] - W[0], by = W[7] - W[1], bz = W[8] - W[2];
      const cx = W[6] - W[3], cy = W[7] - W[4], cz = W[8] - W[5];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const dbl = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const area = dbl / 2;
      const mx = (W[0] + W[3] + W[6]) / 3, my = (W[1] + W[4] + W[7]) / 3, mz = (W[2] + W[5] + W[8]) / 3;
      const at = () => [round(mx), round(my), round(mz)];
      if (area < 1e-6) {
        row.degenerate++;
        samplesOf(row.samples.degenerate, 6, at());
        continue;
      }
      const l2 = Math.max(ax * ax + ay * ay + az * az, bx * bx + by * by + bz * bz, cx * cx + cy * cy + cz * cz);
      const alt = dbl / Math.sqrt(l2);
      if (l2 > 1 && Math.sqrt(l2) / alt > 300) row.sliver++;

      // winding vs vertex normals
      if (nrm && side === 0) {
        const vx = nrm.getX(i0) + nrm.getX(i1) + nrm.getX(i2);
        const vy = nrm.getY(i0) + nrm.getY(i1) + nrm.getY(i2);
        const vz = nrm.getZ(i0) + nrm.getZ(i1) + nrm.getZ(i2);
        // normals live in model space: rotate the world-space face normal back only for non-identity meshes
        let wx = vx, wy = vy, wz = vz;
        if (!mesh.matrixWorld.equals?.call || true) {
          wx = m[0] * vx + m[4] * vy + m[8] * vz;
          wy = m[1] * vx + m[5] * vy + m[9] * vz;
          wz = m[2] * vx + m[6] * vy + m[10] * vz;
        }
        const d = (wx * nx + wy * ny + wz * nz) / (dbl * (Math.hypot(wx, wy, wz) || 1));
        if (d < -0.3) {
          row.flipped++;
          samplesOf(row.samples.flipped, 8, at());
        }
      }

      // coincident triangles (sorted quantised corners; winding from the corner permutation)
      {
        const Q = 200; // 5 mm
        const hv = (o) => {
          const x = Math.round(W[o] * Q), y = Math.round(W[o + 1] * Q), z = Math.round(W[o + 2] * Q);
          return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0;
        };
        const a = hv(0), b = hv(3), c = hv(6);
        // order-independent hash; orientation = dominant sign of the normal
        const h = (a + b + c) * 4294967311 + (a ^ b ^ c) * 2654435761 + (a * b + b * c + a * c) % 1000003;
        const key = h % 9007199254740881;
        let slot = key % table.length;
        const dom = Math.abs(nx) > Math.abs(ny) ? (Math.abs(nx) > Math.abs(nz) ? nx : nz) : Math.abs(ny) > Math.abs(nz) ? ny : nz;
        const w = dom > 0 ? 1 : -1;
        for (let probes = 0; probes < 16; probes++) {
          if (table[slot] === 0) {
            table[slot] = key;
            tableW[slot] = w;
            break;
          }
          if (table[slot] === key) {
            if (tableW[slot] === w) {
              row.dup++;
              samplesOf(row.samples.dup, 6, at());
            } else {
              row.backto++;
              samplesOf(row.samples.backto, 6, at());
            }
            break;
          }
          slot = (slot + 1) % table.length;
        }
      }

      if (!inst) {
        const g0 = gh(W[0], W[2]), g1 = gh(W[3], W[5]), g2 = gh(W[6], W[8]);
        if (W[1] < g0 - 0.08 && W[4] < g1 - 0.08 && W[7] < g2 - 0.08 && my < gh(mx, mz) - 0.08) {
          row.buried++;
          samplesOf(row.samples.buried, 6, at());
        } else if (ny < -0.7 * dbl && W[1] < g0 + 0.04 && W[4] < g1 + 0.04 && W[7] < g2 + 0.04) {
          row.bottom++;
          samplesOf(row.samples.bottom, 6, at());
        }
      }
    }

    // connected parts of static meshes
    if (staticForParts) {
      const box = new Map();
      for (let t = 0; t < triCount; t++) {
        const i0 = idx ? idx.getX(start + t * 3) : start + t * 3;
        const r = find(i0);
        let b = box.get(r);
        if (!b) {
          b = { n: 0, x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
          box.set(r, b);
        }
        b.n++;
        for (let c = 0; c < 3; c++) {
          const vi = idx ? idx.getX(start + t * 3 + c) : start + t * 3 + c;
          wp(vi, 0);
          if (W[0] < b.x0) b.x0 = W[0];
          if (W[0] > b.x1) b.x1 = W[0];
          if (W[1] < b.y0) b.y0 = W[1];
          if (W[1] > b.y1) b.y1 = W[1];
          if (W[2] < b.z0) b.z0 = W[2];
          if (W[2] > b.z1) b.z1 = W[2];
        }
      }
      const ri = rows.length - 1;
      for (const b of box.values()) {
        b.r = ri;
        parts.push(b);
      }
    }

    // instances: per-instance box
    if (mesh.isInstancedMesh && mesh.count > 0 && mesh.count < 200000) {
      geo.computeBoundingBox?.();
      const bb = geo.boundingBox;
      const im = mesh.instanceMatrix.array;
      const ri = rows.length - 1;
      for (let k = 0; k < mesh.count; k++) {
        const o = k * 16;
        // instance box in world space (mesh matrix assumed identity-ish: instances are placed in world coordinates)
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        if (im[o + 15] === 0 || (im[o] === 0 && im[o + 5] === 0 && im[o + 10] === 0)) continue;
        for (let c = 0; c < 8; c++) {
          const lx = c & 1 ? bb.max.x : bb.min.x, ly = c & 2 ? bb.max.y : bb.min.y, lz = c & 4 ? bb.max.z : bb.min.z;
          const wx = im[o] * lx + im[o + 4] * ly + im[o + 8] * lz + im[o + 12];
          const wy = im[o + 1] * lx + im[o + 5] * ly + im[o + 9] * lz + im[o + 13];
          const wz = im[o + 2] * lx + im[o + 6] * ly + im[o + 10] * lz + im[o + 14];
          const X = m[0] * wx + m[4] * wy + m[8] * wz + m[12];
          const Y = m[1] * wx + m[5] * wy + m[9] * wz + m[13];
          const Z = m[2] * wx + m[6] * wy + m[10] * wz + m[14];
          x0 = Math.min(x0, X); x1 = Math.max(x1, X);
          y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
          z0 = Math.min(z0, Z); z1 = Math.max(z1, Z);
        }
        parts.push({ n: triCount, x0, y0, z0, x1, y1, z1, r: ri, inst: k });
      }
    }
    // free the temporaries before the next mesh
    weld.clear();
    hMemo.size > 6e6 && hMemo.clear();
  }

  // ── part checks: floating / sunk / inside a building ────────────────────────────────────────────────────────
  const CELL = 8;
  const cells = new Map();
  const keyOf = (i, j) => i * 100003 + j;
  parts.forEach((p, pi) => {
    const dx = p.x1 - p.x0, dz = p.z1 - p.z0;
    if (dx > 60 || dz > 60) return; // terrain sheets and long kerbs would support everything
    const i0 = Math.floor(p.x0 / CELL), i1 = Math.floor(p.x1 / CELL), j0 = Math.floor(p.z0 / CELL), j1 = Math.floor(p.z1 / CELL);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const k = keyOf(i, j);
        let c = cells.get(k);
        if (!c) cells.set(k, (c = []));
        c.push(pi);
      }
  });
  const isBuildingCell = (x, z) => occ?.has?.(x, z, 4) ?? false;
  const skipFloat = /sky|cloud|bird|plane|heli|balloon|kite|fireworks|smoke|glow|halo|ped|crowd|traffic|boat|train/i;
  const floating = [];
  const sunk = [];
  const inBuilding = [];
  for (let pi = 0; pi < parts.length; pi++) {
    const p = parts[pi];
    const row = rows[p.r];
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
    const gc = gh(cx, cz);
    const gmin = Math.min(gc, gh(p.x0, p.z0), gh(p.x1, p.z0), gh(p.x0, p.z1), gh(p.x1, p.z1));
    const rec = () => ({ m: row.module, path: row.path, tris: p.n, at: [round(cx), round(p.y0), round(cz)], size: [round(p.x1 - p.x0), round(p.y1 - p.y0), round(p.z1 - p.z0)], ground: round(gc), ...(p.inst !== undefined ? { inst: p.inst } : {}) });
    // never below the sea wall's water plane: sea-bed heights are not "ground" for boats and piles
    if (p.y1 < gmin - 0.1 && p.y1 - p.y0 < 100) sunk.push(rec());
    if (!skipFloat.test(row.module) && p.y0 > gc + 0.06 && p.y1 - p.y0 < 60) {
      const i0 = Math.floor((p.x0 - 0.03) / CELL), i1 = Math.floor((p.x1 + 0.03) / CELL), j0 = Math.floor((p.z0 - 0.03) / CELL), j1 = Math.floor((p.z1 + 0.03) / CELL);
      let ok = false;
      for (let i = i0; i <= i1 && !ok; i++)
        for (let j = j0; j <= j1 && !ok; j++) {
          const c = cells.get(keyOf(i, j));
          if (!c) continue;
          for (const qi of c) {
            if (qi === pi) continue;
            const o = parts[qi];
            if (o.x1 < p.x0 - 0.03 || o.x0 > p.x1 + 0.03 || o.z1 < p.z0 - 0.03 || o.z0 > p.z1 + 0.03) continue;
            if (o.y1 < p.y0 - 0.03 || o.y0 > p.y1 + 0.03) continue;
            ok = true;
            break;
          }
        }
      if (!ok) {
        // long parts spanning more than 60 m (not in the grid) may still hold it up: keep those out only by height
        floating.push(rec());
      }
    }
    if (row.module !== 'buildings' && row.module !== 'landmarks' && row.module !== 'roads' && row.module !== 'terrain' && row.module !== 'landscape' && occ) {
      const low = p.y0 < gc + 2.2;
      if (low && p.x1 - p.x0 < 20 && p.z1 - p.z0 < 20) {
        const a = isBuildingCell(cx, cz);
        if (a) inBuilding.push(rec());
      }
    }
  }
  const bySize = (a, b) => b.size[0] * b.size[1] * b.size[2] - a.size[0] * a.size[1] * a.size[2];
  floating.sort(bySize);
  sunk.sort((a, b) => b.tris - a.tris);
  inBuilding.sort(bySize);
  const groupCount = (list) => {
    const g = {};
    for (const r of list) {
      const k = `${r.m} | ${r.path}`;
      (g[k] ??= { parts: 0, tris: 0 }).parts++;
      g[k].tris += r.tris;
    }
    return g;
  };
  return {
    url: location.href,
    stats: { drawCalls: city.stats().drawCalls, triangles: city.stats().triangles },
    rows,
    partCount: parts.length,
    floating: { count: floating.length, groups: groupCount(floating), top: floating.slice(0, 120) },
    sunk: { count: sunk.length, tris: sunk.reduce((a, r) => a + r.tris, 0), groups: groupCount(sunk), top: sunk.slice(0, 60) },
    inBuilding: { count: inBuilding.length, groups: groupCount(inBuilding), top: inBuilding.slice(0, 60) },
  };
}

// ── visibility census ─────────────────────────────────────────────────────────────────────────────────────────
async function censusInPage(opt) {
  const city = window.__city;
  const { ctx } = city;
  const gl = ctx.renderer.getContext();
  const ground = ctx.services.terrain?.height ?? ctx.plan.heightAt;
  ctx.scene.updateMatrixWorld(true);
  const moduleOf = (o) => {
    for (let p = o; p; p = p.parent) if (p.userData?.module) return p.userData.module;
    return '?';
  };
  const pathOf = (o) => {
    const parts = [];
    for (let p = o; p && p !== ctx.scene; p = p.parent) parts.unshift(p.name || p.type);
    return parts.join('/');
  };

  const vs = `#version 300 es
  in vec3 aP; in vec4 aId; uniform mat4 uVP; flat out vec4 vId;
  void main(){ vId = aId; gl_Position = uVP * vec4(aP, 1.0); }`;
  const fs = `#version 300 es
  precision highp float; flat in vec4 vId; out vec4 c; void main(){ c = vId; }`;
  const sh = (t, s) => {
    const o = gl.createShader(t);
    gl.shaderSource(o, s);
    gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
    return o;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  const aP = gl.getAttribLocation(prog, 'aP');
  const aId = gl.getAttribLocation(prog, 'aId');
  const uVP = gl.getUniformLocation(prog, 'uVP');

  // one interleaved non-indexed vertex buffer per static mesh; triangle ids are global
  const entries = [];
  let nextId = 1;
  const rows = [];
  const skip = opt.skipMesh ? new RegExp(opt.skipMesh, 'i') : null;
  ctx.scene.traverse((mesh) => {
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh.geometry?.isInstancedBufferGeometry) return;
    const geo = mesh.geometry;
    const pos = geo.attributes?.position;
    if (!pos) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const mod = moduleOf(mesh);
    const p = pathOf(mesh);
    if (skip && skip.test(`${mod}/${p}`)) return;
    if (/^(sky|camera|ui|audio|postfx)$/.test(mod) || mats[0]?.transparent === true || mats[0]?.depthWrite === false) return;
    const idx = geo.index;
    const start = geo.drawRange?.start ?? 0;
    const cnt = Math.min(geo.drawRange?.count ?? Infinity, idx ? idx.count : pos.count);
    const tri = Math.floor(cnt / 3);
    if (tri === 0) return;
    const m = mesh.matrixWorld.elements;
    const data = new ArrayBuffer(tri * 3 * 16);
    const f = new Float32Array(data);
    const u = new Uint32Array(data);
    const first = nextId;
    for (let t = 0; t < tri; t++) {
      for (let c = 0; c < 3; c++) {
        const i = idx ? idx.getX(start + t * 3 + c) : start + t * 3 + c;
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const o = (t * 3 + c) * 4;
        f[o] = m[0] * x + m[4] * y + m[8] * z + m[12];
        f[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        f[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        u[o + 3] = nextId; // little endian: RGBA = low..high bytes
      }
      nextId++;
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aP);
    gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aId);
    gl.vertexAttribPointer(aId, 4, gl.UNSIGNED_BYTE, true, 16, 12);
    gl.bindVertexArray(null);
    const rowIdx = rows.length;
    rows.push({ module: mod, path: p, tris: tri, first, side: mats[0]?.side ?? 0 });
    entries.push({ vao, buf, tri, first, doubleSided: (mats[0]?.side ?? 0) !== 0, rowIdx, f });
  });
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  const seen = new Uint32Array(nextId); // pixels per triangle over all views

  const res = opt.res;
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, res, res);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const rb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT32F, res, res);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  const pix = new Uint8Array(res * res * 4);
  const ids = new Uint32Array(pix.buffer);

  const persp = (fovY, aspect, n, fr) => {
    const t = 1 / Math.tan(fovY / 2);
    return [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + n) / (n - fr), -1, 0, 0, (2 * fr * n) / (n - fr), 0];
  };
  const look = (ex, ey, ez, fx, fy, fz, ux, uy, uz) => {
    // f = forward, s = right, u = up
    let l = Math.hypot(fx, fy, fz);
    fx /= l; fy /= l; fz /= l;
    let sx = fy * uz - fz * uy, sy = fz * ux - fx * uz, sz = fx * uy - fy * ux;
    l = Math.hypot(sx, sy, sz);
    sx /= l; sy /= l; sz /= l;
    const vx = sy * fz - sz * fy, vy = sz * fx - sx * fz, vz = sx * fy - sy * fx;
    return [sx, vx, -fx, 0, sy, vy, -fy, 0, sz, vz, -fz, 0, -(sx * ex + sy * ey + sz * ez), -(vx * ex + vy * ey + vz * ez), fx * ex + fy * ey + fz * ez, 1];
  };
  const mul = (a, b) => {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[r + 4] * b[c * 4 + 1] + a[r + 8] * b[c * 4 + 2] + a[r + 12] * b[c * 4 + 3];
    return o;
  };
  const P = persp((95 * Math.PI) / 180, 1, 0.1, 6000);
  const dirs = [
    [1, 0, 0, 0, 1, 0],
    [-1, 0, 0, 0, 1, 0],
    [0, 0, 1, 0, 1, 0],
    [0, 0, -1, 0, 1, 0],
    [0, 1, 0, 0, 0, 1],
    [0, -1, 0, 0, 0, 1],
  ];

  // sample points: pedestrian nodes (eye 1.6 m), lanes (driver 1.25 m), POI fly-overs
  const pts = [];
  const farthest = (cand, n, minD) => {
    const res2 = [];
    const seeded = cand.slice().sort((a, b) => a[0] * 7.13 + a[2] * 3.3 - (b[0] * 7.13 + b[2] * 3.3));
    for (const c of seeded) {
      if (res2.length >= n) break;
      if (res2.every((r) => Math.hypot(r[0] - c[0], r[2] - c[2]) > minD)) res2.push(c);
    }
    return res2;
  };
  const nodes = ctx.peds?.nodes ?? [];
  const pedCand = [];
  for (const nd of nodes) {
    const x = nd.x ?? nd.p?.x, z = nd.z ?? nd.p?.z;
    if (x === undefined) continue;
    const y = nd.y ?? ground(x, z);
    pedCand.push([x, y + 1.6, z]);
  }
  pts.push(...farthest(pedCand, opt.points, 26));
  const laneCand = [];
  for (const l of ctx.roads?.lanes ?? []) {
    const a = l.path?.points?.[0] ?? l.points?.[0];
    if (a) laneCand.push([a.x, (a.y ?? 0) + 1.25, a.z]);
  }
  pts.push(...farthest(laneCand, 20, 40));
  for (const poi of ctx.plan.pois) {
    const t = poi.target;
    if (!t) continue;
    for (const [d, ang] of [[poi.distance ?? 120, poi.yaw ?? 0], [60, 45], [60, 165], [60, 285]]) {
      const yaw = ((ang ?? 0) * Math.PI) / 180;
      const pitch = (35 * Math.PI) / 180;
      pts.push([t.x + d * Math.sin(yaw) * Math.cos(pitch), t.y + d * Math.sin(pitch), t.z + d * Math.cos(yaw) * Math.cos(pitch)]);
    }
  }

  // (the page's own frames run during the yields below: set the whole state again after each one)
  const bindState = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.useProgram(prog);
    gl.viewport(0, 0, res, res);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.disable(gl.STENCIL_TEST);
    gl.colorMask(true, true, true, true);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);
    gl.clearColor(0, 0, 0, 0);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  };
  bindState();
  const t0 = performance.now();
  let views = 0;
  for (const pt of pts) {
    for (const d of dirs) {
      const V = look(pt[0], pt[1], pt[2], d[0], d[1], d[2], d[3], d[4], d[5]);
      gl.uniformMatrix4fv(uVP, false, mul(P, V));
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      for (const e of entries) {
        if (e.doubleSided) gl.disable(gl.CULL_FACE);
        else gl.enable(gl.CULL_FACE);
        gl.bindVertexArray(e.vao);
        gl.drawArrays(gl.TRIANGLES, 0, e.tri * 3);
      }
      gl.readPixels(0, 0, res, res, gl.RGBA, gl.UNSIGNED_BYTE, pix);
      for (let i = 0; i < ids.length; i++) if (ids[i]) seen[ids[i]]++;
      views++;
    }
    if (views % 60 === 0) {
      await new Promise((r) => setTimeout(r, 0));
      bindState();
    }
  }
  gl.bindVertexArray(null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // report: per mesh seen share, never-seen triangles split by size and facing
  const summary = [];
  const hiddenClusters = {};
  for (const e of entries) {
    const r = rows[e.rowIdx];
    let hidden = 0, tiny = 0, down = 0, up = 0, sidew = 0, hiddenArea = 0, seenN = 0;
    const clusters = new Map();
    for (let t = 0; t < e.tri; t++) {
      const s = seen[e.first + t];
      if (s > 0) {
        seenN++;
        continue;
      }
      const o = t * 12;
      const ax = e.f[o + 4] - e.f[o], ay = e.f[o + 5] - e.f[o + 1], az = e.f[o + 6] - e.f[o + 2];
      const bx = e.f[o + 8] - e.f[o], by = e.f[o + 9] - e.f[o + 1], bz = e.f[o + 10] - e.f[o + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const dbl = Math.hypot(nx, ny, nz);
      const area = dbl / 2;
      if (area > 0.02) {
        hidden++;
        hiddenArea += area;
        if (dbl > 0 && ny / dbl < -0.7) down++;
        else if (dbl > 0 && ny / dbl > 0.7) up++;
        else sidew++;
        const k = `${Math.round(e.f[o] / 20) * 20},${Math.round(e.f[o + 2] / 20) * 20}`;
        clusters.set(k, (clusters.get(k) ?? 0) + 1);
      } else tiny++;
    }
    summary.push({ ...r, first: undefined, seen: seenN, hidden, tiny, hiddenArea: Math.round(hiddenArea), down, up, side: sidew, topClusters: [...clusters.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6) });
    gl.deleteVertexArray(e.vao);
    gl.deleteBuffer(e.buf);
  }
  gl.deleteFramebuffer(fbo);
  gl.deleteRenderbuffer(rb);
  gl.deleteTexture(tex);
  gl.deleteProgram(prog);
  ctx.renderer.state?.reset?.();
  summary.sort((a, b) => b.tris - a.tris);
  return { views, points: pts.length, res, ms: Math.round(performance.now() - t0), rows: summary, hiddenClusters };
}

// ── drill: connected-part families of one mesh (what a merged mesh is made of) ─────────────────────────────────────
function drillInPage(opt) {
  const { ctx } = window.__city;
  ctx.scene.updateMatrixWorld(true);
  const re = new RegExp(opt.re, 'i');
  const out = [];
  ctx.scene.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    let path = '';
    for (let p = mesh; p && p !== ctx.scene; p = p.parent) path = `${p.name || p.type}/${path}`;
    if (!re.test(path) || mesh.isInstancedMesh && !opt.inst) return;
    const geo = mesh.geometry, pos = geo.attributes.position, idx = geo.index;
    if ((idx ? idx.count : pos.count) / 3 < (opt.min ?? 0)) return;
    const cnt = Math.min(geo.drawRange?.count ?? Infinity, idx ? idx.count : pos.count), tri = Math.floor(cnt / 3), st = geo.drawRange?.start ?? 0;
    const par = new Int32Array(pos.count);
    for (let i = 0; i < pos.count; i++) par[i] = i;
    const find = (a) => {
      while (par[a] !== a) {
        par[a] = par[par[a]];
        a = par[a];
      }
      return a;
    };
    const weld = new Map();
    for (let i = 0; i < pos.count; i++) {
      const k = Math.round(pos.getX(i) * 200) * 73856093 + Math.round(pos.getY(i) * 200) * 19349663 + Math.round(pos.getZ(i) * 200) * 83492791;
      const q = weld.get(k);
      if (q === undefined) weld.set(k, i);
      else par[find(i)] = find(q);
    }
    const iof = (n) => (idx ? idx.getX(st + n) : st + n);
    for (let t = 0; t < tri; t++) {
      const a = find(iof(t * 3));
      par[find(iof(t * 3 + 1))] = a;
      par[find(iof(t * 3 + 2))] = a;
    }
    const m = mesh.matrixWorld.elements;
    const parts = new Map();
    for (let t = 0; t < tri; t++) {
      const r = find(iof(t * 3));
      let b = parts.get(r);
      if (!b) parts.set(r, (b = { n: 0, area: 0, x0: 1e9, y0: 1e9, z0: 1e9, x1: -1e9, y1: -1e9, z1: -1e9, down: 0 }));
      b.n++;
      const P = [0, 1, 2].map((c) => {
        const i = iof(t * 3 + c);
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const X = m[0] * x + m[4] * y + m[8] * z + m[12], Y = m[1] * x + m[5] * y + m[9] * z + m[13], Z = m[2] * x + m[6] * y + m[10] * z + m[14];
        if (X < b.x0) b.x0 = X;
        if (X > b.x1) b.x1 = X;
        if (Y < b.y0) b.y0 = Y;
        if (Y > b.y1) b.y1 = Y;
        if (Z < b.z0) b.z0 = Z;
        if (Z > b.z1) b.z1 = Z;
        return [X, Y, Z];
      });
      const ax = P[1][0] - P[0][0], ay = P[1][1] - P[0][1], az = P[1][2] - P[0][2], bx = P[2][0] - P[0][0], by = P[2][1] - P[0][1], bz = P[2][2] - P[0][2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      b.area += Math.hypot(nx, ny, nz) / 2;
    }
    const fam = new Map();
    const r2 = (v) => Math.round(v * 10) / 10;
    for (const b of parts.values()) {
      const k = `${b.n}|${r2(b.x1 - b.x0)}x${r2(b.y1 - b.y0)}x${r2(b.z1 - b.z0)}`;
      let f = fam.get(k);
      if (!f) fam.set(k, (f = { key: k, parts: 0, tris: 0, area: 0, at: [] }));
      f.parts++;
      f.tris += b.n;
      f.area += b.area;
      if (f.at.length < 5) f.at.push([r2((b.x0 + b.x1) / 2), r2(b.y0), r2((b.z0 + b.z1) / 2)]);
    }
    // spatial histogram, 20 m cells
    const cells = new Map();
    for (const b of parts.values()) {
      const k = `${Math.round((b.x0 + b.x1) / 40) * 20},${Math.round((b.z0 + b.z1) / 40) * 20}`;
      cells.set(k, (cells.get(k) ?? 0) + b.n);
    }
    out.push({ path, tris: tri, parts: parts.size, families: [...fam.values()].sort((x, y) => y.tris - x.tris).slice(0, opt.top ?? 40), cells: [...cells.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14) });
  });
  return out.sort((a, b) => b.tris - a.tris);
}

// ── run ───────────────────────────────────────────────────────────────────────────────────────────────────────
await acquireLock();
const report = {};
let browser;
try {
  ({ browser } = await launchBrowser({}));
  const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
  await page.routeWebSocket(/.*/, () => {});
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(`${baseUrl}?${q}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__city?.ready && window.__city.frames() > 3, null, { timeout: 400000 });
  await page.evaluate((v) => window.__city.view(v), args.view ?? 'overview');
  await page.waitForTimeout(1500);
  if (args.tris) {
    // triangles and draw calls per view (all passes of a rendered frame): --tris "overview;street=5,1.5,-65,9,0,6"
    report.tris = [];
    await page.setViewportSize({ width: 1920, height: 1025 });
    for (const v of String(args.tris).split(';').filter(Boolean)) {
      const name = v.includes('=') ? v.slice(0, v.indexOf('=')) : v;
      const spec = v.includes('=') ? v.slice(v.indexOf('=') + 1) : v;
      await page.evaluate((sp) => {
        window.__city.setHours(12);
        if (/^[a-z]/i.test(sp)) window.__city.view(sp);
        else {
          const [x, y, z, distance, yaw, pitch] = sp.split(',').map(Number);
          window.__city.view({ target: { x, y, z }, distance, yaw, pitch });
        }
      }, spec);
      await page.waitForTimeout(1200);
      for (let k = 0; k < 4; k++) await page.screenshot({ type: 'jpeg', quality: 1 }).catch(() => {});
      const st = await page.evaluate(() => window.__city.stats());
      report.tris.push({ view: name, drawCalls: st.drawCalls, triangles: st.triangles });
      console.log(`${name.padEnd(12)} ${String(st.drawCalls).padStart(4)} dc  ${(st.triangles / 1e6).toFixed(3)} M tris`);
    }
  }
  if (!args['no-audit']) report.audit = await page.evaluate(auditInPage, { skipParts: !!args['skip-parts'] });
  report.errors = errs;
  if (args.drill) report.drill = await page.evaluate(drillInPage, { re: args.drill, top: parseInt(args['drill-top'] ?? '40', 10), min: parseInt(args['drill-min'] ?? '0', 10), inst: true });
  if (args.census) {
    report.census = await page.evaluate(censusInPage, { res: parseInt(args['census-res'] ?? '512', 10), points: parseInt(args['census-points'] ?? '140', 10), skipMesh: args['census-skip'] ?? null });
  }
} catch (e) {
  report.harnessError = String(e?.stack ?? e);
} finally {
  if (browser) await browser.close().catch(() => {});
  releaseLock();
}
fs.writeFileSync(`${out}.json`, JSON.stringify(report, null, 0));

// ── markdown digest ───────────────────────────────────────────────────────────────────────────────────────────
const md = [];
if (report.harnessError) {
  md.push(`HARNESS ERROR: ${report.harnessError}`);
  console.log(report.harnessError);
}
if (report.audit) {
  const a = report.audit;
  const rows = a.rows;
  const sum = (f) => rows.reduce((s, r) => s + (r[f] || 0), 0);
  const mult = (r, f) => (r[f] || 0) * (r.instances || 1);
  md.push(`# Geometry audit — ${a.url}`, '');
  md.push(`Renderer last frame: ${a.stats.drawCalls} draw calls, ${(a.stats.triangles / 1e6).toFixed(2)} M triangles (all passes). Scene: ${rows.length} meshes, ${(sum('tris') / 1e6).toFixed(2)} M triangles if everything drew once.`, '');
  md.push('| defect | triangles / parts |', '|---|---|');
  md.push(`| degenerate | ${rows.reduce((s, r) => s + mult(r, 'degenerate'), 0)} |`);
  md.push(`| sliver | ${rows.reduce((s, r) => s + mult(r, 'sliver'), 0)} |`);
  md.push(`| flipped | ${rows.reduce((s, r) => s + mult(r, 'flipped'), 0)} |`);
  md.push(`| coincident same winding (z-fight) | ${rows.reduce((s, r) => s + mult(r, 'dup'), 0)} |`);
  md.push(`| coincident back-to-back (internal) | ${rows.reduce((s, r) => s + mult(r, 'backto'), 0)} |`);
  md.push(`| buried | ${sum('buried')} |`);
  md.push(`| bottom on the ground | ${sum('bottom')} |`);
  md.push(`| floating parts | ${a.floating.count} |`);
  md.push(`| sunk parts | ${a.sunk.count} (${a.sunk.tris} tris) |`);
  md.push(`| inside a building | ${a.inBuilding.count} |`, '');
  const mods = {};
  for (const r of rows) {
    const m = (mods[r.module] ??= { tris: 0, casts: 0, meshes: 0 });
    m.tris += r.tris;
    if (r.casts) m.casts += r.tris;
    m.meshes++;
  }
  md.push('## Triangles by module (every mesh once; LOD siblings and hidden meshes included)', '', '| module | meshes | tris | shadow casters |', '|---|---|---|---|');
  for (const [k, m] of Object.entries(mods).sort((x, y) => y[1].tris - x[1].tris)) md.push(`| ${k} | ${m.meshes} | ${m.tris} | ${m.casts} |`);
  md.push('', '## Top meshes', '', '| tris | inst | vis | cast | module/path | material | degen | sliver | flip | dup | back | buried | bottom |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows.slice().sort((x, y) => y.tris - x.tris).slice(0, 70))
    md.push(`| ${r.tris} | ${r.instances} | ${r.visible ? 'y' : 'n'} | ${r.casts ? 'y' : ''} | ${r.module}/${r.path} | ${r.material} | ${r.degenerate} | ${r.sliver} | ${r.flipped} | ${r.dup} | ${r.backto} | ${r.buried} | ${r.bottom} |`);
  md.push('', '## Defects by mesh', '', '| module/path | tris | degen | sliver | flip | dup | back | buried | bottom |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of rows.slice().filter((r) => r.degenerate + r.flipped + r.dup + r.backto + r.buried + r.bottom + r.sliver > 0).sort((x, y) => y.flipped + y.buried + y.bottom + y.backto + y.dup - (x.flipped + x.buried + x.bottom + x.backto + x.dup)).slice(0, 80))
    md.push(`| ${r.module}/${r.path} | ${r.tris} | ${r.degenerate} | ${r.sliver} | ${r.flipped} | ${r.dup} | ${r.backto} | ${r.buried} | ${r.bottom} |`);
  const grp = (t, g) => {
    md.push('', `## ${t}`, '', '| mesh | parts | tris |', '|---|---|---|');
    for (const [k, v] of Object.entries(g).sort((x, y) => y[1].parts - x[1].parts).slice(0, 40)) md.push(`| ${k} | ${v.parts} | ${v.tris} |`);
  };
  grp(`Floating parts (${a.floating.count})`, a.floating.groups);
  grp(`Sunk parts (${a.sunk.count})`, a.sunk.groups);
  grp(`Inside a building (${a.inBuilding.count})`, a.inBuilding.groups);
}
if (report.census) {
  const c = report.census;
  md.push('', `## Visibility census — ${c.points} sample points × 6 faces, ${c.res}² (${c.views} views, ${c.ms} ms)`, '');
  md.push('`hidden` = never rasterised and area > 0.02 m²; `tiny` = never rasterised, smaller (too small or hidden).', '');
  md.push('| tris | seen | hidden | down | up | side | tiny | hidden m² | module/path |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of c.rows.slice(0, 70)) md.push(`| ${r.tris} | ${r.seen} | ${r.hidden} | ${r.down} | ${r.up} | ${r.side} | ${r.tiny} | ${r.hiddenArea} | ${r.module}/${r.path} |`);
  const tot = c.rows.reduce((s, r) => ({ t: s.t + r.tris, h: s.h + r.hidden, ti: s.ti + r.tiny }), { t: 0, h: 0, ti: 0 });
  md.push('', `Totals: ${tot.t} tris, ${tot.h} hidden, ${tot.ti} tiny.`);
}
if (report.tris) md.push('', '## Triangles per view', '', '| view | draw calls | triangles |', '|---|---|---|', ...report.tris.map((t) => `| ${t.view} | ${t.drawCalls} | ${t.triangles} |`));
if (report.drill) {
  for (const d of report.drill) {
    md.push('', `## Drill ${d.path} — ${d.tris} tris, ${d.parts} parts`, '', '| tris | parts | tris/part | size m | area m² | at |', '|---|---|---|---|---|---|');
    for (const f of d.families) md.push(`| ${f.tris} | ${f.parts} | ${f.key.split('|')[0]} | ${f.key.split('|')[1]} | ${Math.round(f.area)} | ${JSON.stringify(f.at.slice(0, 3))} |`);
    md.push('', `cells (20 m): ${d.cells.map(([k, n]) => `${k}: ${n}`).join(' · ')}`);
  }
}
if (report.errors?.length) md.push('', '## Page errors', ...report.errors.slice(0, 10));
fs.writeFileSync(`${out}.md`, md.join('\n') + '\n');
console.log(`wrote ${out}.json / .md`);

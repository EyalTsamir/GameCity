// The studio set the diorama stands on: a large varnished-oak tabletop that fades, with
// distance from the plinth, into the cyclorama backdrop colour (the same colour the sky dome
// shows below the horizon), so there is never a visible table edge or seam.
//
//   • lit by the real light rig (MeshStandardMaterial): sun/moon + hemi + PMREM sky, varnish sheen;
//   • receives the shadow map near the model (towers / trees spilling over the edge) and an
//     ANALYTIC shadow of the slab + plinth block traced against the real edge-height profile,
//     with a physically growing penumbra — so the long golden-hour shadow of the model falls
//     across the table at any distance without enlarging the shadow map;
//   • analytic contact occlusion under the plinth (replaces the old blurred contact decal);
//   • at night a faint warm spill of the city's light around the base;
//   • fades to `uCyc` after fog (same radiance as the dome's floor) — the backdrop.
//
// Dynamic uniforms (StageUniforms) are owned and updated by the sky module every frame; if
// the sky module is absent the table falls back to static daytime values.

import * as THREE from 'three';
import type { Rng } from '../../core/rng';
import type { Rect } from '../../core/geom';

export interface StageUniforms {
  /** backdrop radiance (linear, pre-exposure) */
  uCyc: THREE.Uniform<THREE.Color>;
  /** unit vector towards the shadow-casting light (sun or moon, as the sun DirectionalLight) */
  uStageL: THREE.Uniform<THREE.Vector3>;
  /** strength of the analytic slab shadow (0 at the twilight crossover) */
  uStageShadow: THREE.Uniform<number>;
  /** 0..1 city lights (night spill) */
  uCityGlow: THREE.Uniform<number>;
  /** cyc fade: [start, end] metres from the plinth outline */
  uFade: THREE.Uniform<THREE.Vector2>;
  /** varnish specular scale (damped at night: a moonlit sheen around the model read as haze) */
  uTableSpec: THREE.Uniform<number>;
}

/** ctx.services.stage — created by the sky module, filled by the terrain slab */
export interface StageService {
  uniforms: StageUniforms;
  /** the studio table (hidden with ?legacylight) */
  table: THREE.Object3D | null;
  /** the original blurred contact decal (shown only with ?legacylight) */
  legacyContact: THREE.Object3D | null;
}

export function createStageUniforms(): StageUniforms {
  return {
    uCyc: new THREE.Uniform(new THREE.Color('#d2e1ee')),
    uStageL: new THREE.Uniform(new THREE.Vector3(0.3, 0.8, 0.5).normalize()),
    uStageShadow: new THREE.Uniform(1),
    uCityGlow: new THREE.Uniform(0),
    uFade: new THREE.Uniform(new THREE.Vector2(60, 560)),
    uTableSpec: new THREE.Uniform(1),
  };
}

export interface TableGeometryInfo {
  /** slab rectangle (the soil faces) */
  slab: Rect;
  /** table top height (world y) */
  y: number;
  /** plinth outer offset from the slab edge (widest part, at the base) */
  plinthOut: number;
  /** plinth top (ledge) height and its main outer face offset */
  plinthTop: number;
  plinthFace: number;
  /** face-top height along each slab edge, sampled uniformly from x0→x1 (N, S) / z0→z1 (W, E) */
  edgeN: Float32Array;
  edgeS: Float32Array;
  edgeW: Float32Array;
  edgeE: Float32Array;
}

const TABLE_REPEAT = 192; // m of world per wood-texture tile (8 planks of 24 m)
const TABLE_HALF = 4200; // m: half-size of the table plane (the far part is pure backdrop)

/** varnished oak planks: per-plank tone, long soft grain, staggered butt joints, faint seams */
function oakTexture(rng: Rng): THREE.CanvasTexture {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d')!;
  const planks = 8;
  const pw = S / planks;
  // pale limed oak: light enough to set off the dark walnut plinth, low saturation so the
  // painted town stays the most colourful thing in the picture
  const tones = ['#c9b192', '#d0b899', '#c2a888', '#ccb495', '#c5ac8d', '#d3bc9d', '#bfa585', '#cbb293'];
  for (let p = 0; p < planks; p++) {
    const y0 = p * pw;
    // two boards per row with a butt joint at a random place (wraps around the tile)
    const joint = Math.floor(rng.next() * S);
    for (let half = 0; half < 2; half++) {
      const tone = new THREE.Color(tones[(p * 3 + half * 5) % tones.length]);
      tone.offsetHSL((rng.next() - 0.5) * 0.01, (rng.next() - 0.5) * 0.04, (rng.next() - 0.5) * 0.035);
      g.fillStyle = `#${tone.getHexString()}`;
      const xa = half === 0 ? joint : joint - S;
      g.fillRect(xa, y0, S, pw);
    }
    // soft lengthwise tone bands inside the plank (heartwood / sapwood)
    for (let b = 0; b < 3; b++) {
      const yy = y0 + rng.next() * pw;
      const grd = g.createLinearGradient(0, yy - pw * 0.3, 0, yy + pw * 0.3);
      const dark = rng.next() < 0.5;
      const a = 0.03 + rng.next() * 0.04;
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.5, dark ? `rgba(70,40,15,${a.toFixed(3)})` : `rgba(255,230,190,${a.toFixed(3)})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, yy - pw * 0.3, S, pw * 0.6);
    }
    // grain: long gently waving lines (wrap seamlessly: integer sine periods across the tile)
    g.save();
    g.beginPath();
    g.rect(0, y0 + 1, S, pw - 2);
    g.clip();
    const TAU = Math.PI * 2;
    for (let i = 0; i < 46; i++) {
      const yy = y0 + rng.next() * pw;
      const k1 = 1 + Math.floor(rng.next() * 2),
        k2 = 3 + Math.floor(rng.next() * 4);
      const a1 = 1 + rng.next() * 4,
        a2 = 0.3 + rng.next() * 1.2;
      const p1 = rng.next() * TAU,
        p2 = rng.next() * TAU;
      const dark = rng.next() < 0.7;
      g.strokeStyle = dark ? `rgba(110,80,50,${(0.05 + rng.next() * 0.11).toFixed(3)})` : `rgba(245,228,200,${(0.05 + rng.next() * 0.08).toFixed(3)})`;
      g.lineWidth = 0.7 + rng.next() * 1.8;
      g.beginPath();
      for (let x = 0; x <= S; x += 8) {
        const y = yy + Math.sin((x / S) * TAU * k1 + p1) * a1 + Math.sin((x / S) * TAU * k2 + p2) * a2;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    // a few small knots / pores
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(90,62,36,${(0.04 + rng.next() * 0.07).toFixed(3)})`;
      g.fillRect(rng.next() * S, y0 + 2 + rng.next() * (pw - 4), 2 + rng.next() * 6, 1);
    }
    if (rng.next() < 0.45) {
      const kx = rng.next() * S,
        ky = y0 + pw * (0.25 + rng.next() * 0.5);
      for (let r = 9; r > 1; r -= 2) {
        g.strokeStyle = `rgba(110,76,44,${(0.07 + (9 - r) * 0.015).toFixed(3)})`;
        g.lineWidth = 1;
        g.beginPath();
        g.ellipse(kx, ky, r * 2.4, r, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.restore();
    // seam between planks (thin dark line + light lip) and the butt joint
    g.fillStyle = 'rgba(80,56,34,0.42)';
    g.fillRect(0, y0, S, 1.5);
    g.fillStyle = 'rgba(255,240,215,0.16)';
    g.fillRect(0, y0 + 1.5, S, 1);
    g.fillStyle = 'rgba(80,56,34,0.32)';
    g.fillRect(joint, y0, 1.5, pw);
    g.fillRect(0, y0, 1.5, pw);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function edgeTexture(info: TableGeometryInfo): THREE.DataTexture {
  const N = info.edgeN.length;
  const data = new Uint16Array(N * 4);
  const rows = [info.edgeN, info.edgeS, info.edgeW, info.edgeE];
  for (let r = 0; r < 4; r++) for (let i = 0; i < N; i++) data[r * N + i] = THREE.DataUtils.toHalfFloat(rows[r][Math.min(i, rows[r].length - 1)]);
  const tex = new THREE.DataTexture(data, N, 4, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const PARS = /* glsl */ `
uniform vec3 uCyc;
uniform vec3 uStageL;
uniform float uStageShadow;
uniform float uCityGlow;
uniform vec2 uFade;
uniform float uTableSpec;
uniform sampler2D tEdge;
varying vec3 vStageW;

// signed distance to a rectangle centred c with half extents h
float stRectSD(vec2 p, vec2 c, vec2 h) {
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float stEdgeH(float row, float u) {
  return texture2D(tEdge, vec2(clamp(u, 0.0, 1.0) * ST_EDGE_SCALE + ST_EDGE_OFS, (row + 0.5) * 0.25)).r;
}
// one side plane: p + t L reaches the plane "coord = plane" (axis 0 = x, 1 = z); returns the
// soft blocking (0..1) of that side's face (top profile) and of the plinth block below it
float stSide(vec3 p, vec3 L, float axis, float plane, float row, float lo, float hi, float face, float out_) {
  float pc = axis < 0.5 ? p.x : p.z;
  float lc = axis < 0.5 ? L.x : L.z;
  float qcA = axis < 0.5 ? p.z : p.x;
  float lqA = axis < 0.5 ? L.z : L.x;
  float dirS = sign(plane - pc);
  if (lc * dirS <= 1e-4) return 0.0;
  float block = 0.0;
  // plinth block (outer face at plane ∓ face offset)
  float pp = plane - dirS * face;
  float tp = (pp - pc) / lc;
  if (tp > 0.0) {
    float y = p.y + tp * L.y;
    float q = qcA + tp * lqA;
    float w = 0.06 + tp * 0.0046;
    float inR = smoothstep(lo - out_ - w, lo - out_ + w, q) * (1.0 - smoothstep(hi + out_ - w, hi + out_ + w, q));
    block = max(block, inR * (1.0 - smoothstep(ST_PLINTH_TOP - w, ST_PLINTH_TOP + w, y)));
  }
  // soil face with its real top profile
  float t = (plane - pc) / lc;
  if (t > 0.0) {
    float y = p.y + t * L.y;
    float q = qcA + t * lqA;
    float u = (q - lo) / (hi - lo);
    float h = stEdgeH(row, u);
    float w = 0.08 + t * 0.0046;
    float inR = smoothstep(-w, w, q - lo) * (1.0 - smoothstep(-w, w, q - hi));
    block = max(block, inR * (1.0 - smoothstep(h - w, h + w, y)));
  }
  return block;
}
float stSlabShadow(vec3 p, float dOut) {
  vec3 L = normalize(uStageL);
  if (L.y < 0.02) return 0.0;
  // cheap reject: farther from the plinth than the longest possible slab shadow at this sun height
  if (dOut > (ST_MAXH - p.y) * length(L.xz) / L.y + 12.0) return 0.0;
  // …or outside the block on an axis along which the light ray moves away from it
  vec2 rel = p.xz - vec2(ST_CX, ST_CZ);
  vec2 q = abs(rel) - vec2(ST_HX, ST_HZ);
  vec2 away = rel * L.xz;
  if ((q.x > 0.5 && away.x >= 0.0) || (q.y > 0.5 && away.y >= 0.0)) return 0.0;
  float b = 0.0;
  b = max(b, stSide(p, L, 1.0, ST_Z0, 0.0, ST_X0, ST_X1, ST_FACE, ST_OUT));
  b = max(b, stSide(p, L, 1.0, ST_Z1, 1.0, ST_X0, ST_X1, ST_FACE, ST_OUT));
  b = max(b, stSide(p, L, 0.0, ST_X0, 2.0, ST_Z0, ST_Z1, ST_FACE, ST_OUT));
  b = max(b, stSide(p, L, 0.0, ST_X1, 3.0, ST_Z0, ST_Z1, ST_FACE, ST_OUT));
  return b;
}
`;

export function createTable(rng: Rng, info: TableGeometryInfo, uniforms: StageUniforms): THREE.Mesh {
  const { slab } = info;
  const cx = (slab.x0 + slab.x1) / 2,
    cz = (slab.z0 + slab.z1) / 2;
  const geo = new THREE.PlaneGeometry(TABLE_HALF * 2, TABLE_HALF * 2, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(cx, 0, cz);
  // world-space UVs (planks run along x)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / TABLE_REPEAT, pos.getZ(i) / TABLE_REPEAT);
  uv.needsUpdate = true;

  const edgeTex = edgeTexture(info);
  const N = info.edgeN.length;
  const f = (v: number) => v.toFixed(3);
  const defines: Record<string, string> = {
    ST_X0: f(slab.x0),
    ST_X1: f(slab.x1),
    ST_Z0: f(slab.z0),
    ST_Z1: f(slab.z1),
    ST_CX: f(cx),
    ST_CZ: f(cz),
    ST_HX: f((slab.x1 - slab.x0) / 2 + info.plinthOut),
    ST_HZ: f((slab.z1 - slab.z0) / 2 + info.plinthOut),
    ST_OUT: f(info.plinthFace),
    ST_FACE: f(info.plinthFace),
    ST_PLINTH_TOP: f(info.plinthTop),
    ST_MAXH: f(Math.max(info.plinthTop, ...info.edgeN, ...info.edgeS, ...info.edgeW, ...info.edgeE)),
    ST_EDGE_SCALE: f((N - 1) / N),
    ST_EDGE_OFS: f(0.5 / N),
  };

  const mat = new THREE.MeshStandardMaterial({ map: oakTexture(rng), color: '#ffffff', roughness: 0.5, metalness: 0 });
  mat.name = 'stage-table';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { tEdge: { value: edgeTex } });
    let defs = '';
    for (const [k, v] of Object.entries(defines)) defs += `#define ${k} ${v}\n`;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStageW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvStageW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + defs + PARS)
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `// beyond the fade the table IS the backdrop: skip all lighting
        if (stRectSD(vStageW.xz, vec2(ST_CX, ST_CZ), vec2(ST_HX, ST_HZ)) >= uFade.y) {
          gl_FragColor = vec4(uCyc, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          return;
        }
        vec4 diffuseColor = vec4( diffuse, opacity );`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float stD = stRectSD(vStageW.xz, vec2(ST_CX, ST_CZ), vec2(ST_HX, ST_HZ));
        float stDp = max(stD, 0.0);
        // the far table loses its grain into a plain warm-neutral sheet before the backdrop fade
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.52, 0.45, 0.37), smoothstep(uFade.x, uFade.y * 0.7, stDp) * 0.6);`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          // contact occlusion under the plinth: strong thin line + broad soft skirt
          float ao = 1.0 - 0.62 * exp(-stDp / 1.3) - 0.3 * exp(-stDp / 10.0);
          float sh = stSlabShadow(vStageW, stDp) * uStageShadow;
          reflectedLight.indirectDiffuse *= ao;
          reflectedLight.indirectSpecular *= ao * uTableSpec;
          float direct = (1.0 - sh) * mix(1.0, ao, 0.45);
          reflectedLight.directDiffuse *= direct;
          reflectedLight.directSpecular *= direct * uTableSpec;
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // night: the city's light spilling over the edge onto the table (multiplies the wood)
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.62, 0.3) * uCityGlow * (0.16 * exp(-stDp / 9.0) + 0.05 * exp(-stDp / 45.0));`,
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uCyc, smoothstep(uFade.x, uFade.y, stDp));`,
      );
  };
  mat.customProgramCacheKey = () => 'stage-table-v1';

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = info.y;
  mesh.name = 'stage-table';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

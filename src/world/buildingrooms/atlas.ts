// The room atlas: every wall module and card of pages.ts drawn once in real 3D at boot, from straight ahead, with its own shadows and
// occlusion worked out from the depth (a shelf shades the goods under it), into two textures. The rooms' shader reads them: a fetch costs
// next to nothing on this GPU where the same shapes as code cost a lot, and 3D-drawn goods look like goods.
//
// rgb: sqrt of the linear colour. Wall pages: a = height out of the wall / MOD_RELIEF, a bare wall is white with a = 0 (the room's paint
// multiplies it). Cards: premultiplied, a = coverage.

import * as THREE from 'three';
import { Kit, rng } from './kit';
import { CARD_PAGES, CARD_RELIEF, MOD_H, MOD_RELIEF, MOD_W, WALL_PAGES } from './pages';

const PAGE_VERT = /* glsl */ `
attribute vec3 aCol;
uniform vec4 uBox;   // x0, y0, 1/w, 1/h
uniform float uRelief;
varying vec3 vN;
varying vec3 vC;
varying float vZ;
void main() {
  vN = normal;
  vC = aCol;
  vZ = position.z / uRelief;
  gl_Position = vec4((position.x - uBox.x) * uBox.z * 2.0 - 1.0, (position.y - uBox.y) * uBox.w * 2.0 - 1.0, 0.95 - clamp(vZ, 0.0, 1.0) * 1.9, 1.0);
}
`;
const PAGE_FRAG = /* glsl */ `
uniform float uCard;
varying vec3 vN;
varying vec3 vC;
varying float vZ;
void main() {
  vec3 n = normalize(vN);
  // a soft light from above and in front, as a room's lamp and window give; a little sheen towards the viewer
  float key = max(dot(n, normalize(vec3(0.12, 0.8, 0.58))), 0.0);
  float fill = 0.5 + 0.5 * n.y;
  vec3 c = vC * (0.42 + 0.72 * key + 0.1 * fill) + vec3(0.05) * pow(max(n.z, 0.0), 24.0);
  float z = clamp(vZ, 0.0, 1.0);
  gl_FragColor = vec4(sqrt(max(c, vec3(0.0))), uCard > 0.5 ? 0.2 + 0.8 * z : (z <= 1e-4 ? 0.0 : max(z, 0.04)));
}
`;
const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tPage;
uniform vec2 uPageM;     // the page's size (m)
uniform float uRelief;
uniform float uCard;
uniform vec2 uInset;     // the gutter, as a fraction of the cell
varying vec2 vUv;
float heightAt(vec2 uv) {
  float a = texture2D(tPage, uv).a;
  if (uCard > 0.5) return a < 0.1 ? -10.0 : (a - 0.2) / 0.8 * uRelief;
  return a * uRelief;
}
void main() {
  vec2 uv = clamp((vUv - uInset) / (1.0 - 2.0 * uInset), 0.0, 1.0);
  vec4 c = texture2D(tPage, uv);
  float H = heightAt(uv);
  // occlusion: what stands higher nearby; two rings
  float occ = 0.0;
  for (int ring = 0; ring < 2; ring++) {
    float r = ring == 0 ? 0.018 : 0.055;
    for (int i = 0; i < 8; i++) {
      float a = (float(i) + 0.5 * float(ring)) * 0.7854;
      vec2 d = vec2(cos(a), sin(a)) * r;
      float s = heightAt(uv + d / uPageM);
      occ += clamp((s - H - 0.002) / (r * 1.6), 0.0, 1.0) * (ring == 0 ? 0.6 : 1.0);
    }
  }
  float ao = 1.0 - 0.62 * clamp(occ / 12.8, 0.0, 1.0);
  // the shadow from a light above and a little in front: climb towards it, anything in the way shades this point
  float sh = 0.0;
  // (steps finer than a shelf board, or a board shows up as stripes)
  for (int i = 1; i <= 18; i++) {
    float dy = float(i) * 0.022;
    float s = heightAt(uv + vec2(0.0, dy) / uPageM);
    sh = max(sh, smoothstep(0.0, 0.03 + dy * 0.3, s - H - dy * 0.75));
  }
  float k = ao * (1.0 - 0.55 * sh);
  k = sqrt(k);
  if (uCard > 0.5) {
    float cov = smoothstep(0.0, 0.2, c.a);
    gl_FragColor = vec4(c.rgb * k * (cov > 0.0 ? 1.0 : 0.0), cov);
  } else {
    gl_FragColor = vec4(c.rgb * k, c.a);
  }
}
`;

export interface RoomAtlas {
  walls: THREE.Texture;
  cards: THREE.Texture;
  /** columns, rows, gutter x, gutter y (fractions of a cell) */
  gridW: THREE.Vector4;
  gridC: THREE.Vector4;
  wallIndex: Map<string, number>;
  cardIndex: Map<string, number>;
  ms: number;
  /** (for ?cwatlas) */
  rts: THREE.WebGLRenderTarget[];
}

const hashName = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export function buildRoomAtlas(renderer: THREE.WebGLRenderer, scale = 1): RoomAtlas {
  const t0 = performance.now();
  const AW = Math.round(4096 * scale),
    AH = Math.round(2048 * scale);
  const target = (w: number, h: number, name: string, aniso: number) => {
    const rt = new THREE.WebGLRenderTarget(w, h, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, anisotropy: aniso, colorSpace: THREE.NoColorSpace });
    rt.texture.name = name;
    renderer.initRenderTarget(rt); // (allocates the mip levels; they're filled once at the end)
    rt.texture.generateMipmaps = false;
    return rt;
  };
  const wallRT = target(AW, AH, 'room-walls', 4);
  const cardRT = target(AW, AH, 'room-cards', 2);

  const colsW = Math.max(1, Math.floor(Math.sqrt((WALL_PAGES.length * AW * MOD_H) / (AH * MOD_W))));
  const gridWC = Math.max(colsW, Math.ceil(WALL_PAGES.length / Math.max(1, Math.floor(AH / ((AW / colsW) * (MOD_H / MOD_W))))));
  const rowsW = Math.ceil(WALL_PAGES.length / gridWC);
  const colsC = Math.ceil(Math.sqrt((CARD_PAGES.length * AW) / AH));
  const rowsC = Math.ceil(CARD_PAGES.length / colsC);

  const gutter = 3; // px on each side of a cell
  const gridW = new THREE.Vector4(gridWC, rowsW, gutter / (AW / gridWC), gutter / (AH / rowsW));
  const gridC = new THREE.Vector4(colsC, rowsC, gutter / (AW / colsC), gutter / (AH / rowsC));

  const saved = {
    rt: renderer.getRenderTarget(),
    color: renderer.getClearColor(new THREE.Color()),
    alpha: renderer.getClearAlpha(),
    autoClear: renderer.autoClear,
    shadow: renderer.shadowMap.autoUpdate,
  };
  renderer.autoClear = false;
  renderer.shadowMap.autoUpdate = false;

  const pageMat = new THREE.ShaderMaterial({
    vertexShader: PAGE_VERT,
    fragmentShader: PAGE_FRAG,
    uniforms: { uBox: { value: new THREE.Vector4() }, uRelief: { value: 1 }, uCard: { value: 0 } },
    blending: THREE.NoBlending,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  const postMat = new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: POST_FRAG,
    uniforms: { tPage: { value: null }, uPageM: { value: new THREE.Vector2() }, uRelief: { value: 1 }, uCard: { value: 0 }, uInset: { value: new THREE.Vector2() } },
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const cam = new THREE.Camera();
  const scene = new THREE.Scene();
  scene.matrixWorldAutoUpdate = false;
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const postMesh = new THREE.Mesh(tri, postMat);
  postMesh.frustumCulled = false;

  // page render targets: a little over the atlas's own resolution, antialiased
  const pageW = new THREE.WebGLRenderTarget(Math.round(AW / gridWC) * 2, Math.round(AH / rowsW) * 2, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true, samples: 4, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, colorSpace: THREE.NoColorSpace });
  const pageC = new THREE.WebGLRenderTarget(Math.round(AW / colsC) * 2, Math.round(AH / rowsC) * 2, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true, samples: 4, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, colorSpace: THREE.NoColorSpace });

  const draw = (kit: Kit, rt: THREE.WebGLRenderTarget, clearC: number, clearA: number, box: THREE.Vector4, relief: number, card: number): void => {
    const g = new THREE.BufferGeometry();
    const n = kit.n / 9;
    const data = new THREE.InterleavedBuffer(kit.a.subarray(0, kit.n), 9);
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(data, 3, 0));
    g.setAttribute('normal', new THREE.InterleavedBufferAttribute(data, 3, 3));
    g.setAttribute('aCol', new THREE.InterleavedBufferAttribute(data, 3, 6));
    g.setDrawRange(0, n);
    pageMat.uniforms.uBox.value.copy(box);
    pageMat.uniforms.uRelief.value = relief;
    pageMat.uniforms.uCard.value = card;
    const mesh = new THREE.Mesh(g, pageMat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(clearC, clearA);
    renderer.clear(true, true, false);
    renderer.render(scene, cam);
    scene.remove(mesh);
    g.dispose();
  };
  const blit = (src: THREE.WebGLRenderTarget, dst: THREE.WebGLRenderTarget, col: number, row: number, cols: number, rows: number, pw: number, ph: number, relief: number, card: number): void => {
    const u = postMat.uniforms;
    u.tPage.value = src.texture;
    u.uPageM.value.set(pw, ph);
    u.uRelief.value = relief;
    u.uCard.value = card;
    const cw = dst.width / cols,
      ch = dst.height / rows;
    u.uInset.value.set(gutter / cw, gutter / ch);
    dst.viewport.set(col * cw, row * ch, cw, ch);
    dst.scissor.set(col * cw, row * ch, cw, ch);
    dst.scissorTest = true;
    scene.add(postMesh);
    renderer.setRenderTarget(dst);
    renderer.render(scene, cam);
    scene.remove(postMesh);
  };

  const wallIndex = new Map<string, number>();
  WALL_PAGES.forEach((p, i) => {
    const kit = new Kit();
    // the bare wall: white under the page's own shading, no height
    kit.rect(0, 0, MOD_W, MOD_H, 0, [1.12, 1.12, 1.12]);
    p.draw(kit, rng(hashName(p.name)));
    draw(kit, pageW, 0xffffff, 0, new THREE.Vector4(0, 0, 1 / MOD_W, 1 / MOD_H), MOD_RELIEF, 0);
    blit(pageW, wallRT, i % gridWC, Math.floor(i / gridWC), gridWC, rowsW, MOD_W, MOD_H, MOD_RELIEF, 0);
    wallIndex.set(p.name, i);
  });
  const cardIndex = new Map<string, number>();
  CARD_PAGES.forEach((p, i) => {
    const kit = new Kit();
    p.draw(kit, rng(hashName(p.name)));
    draw(kit, pageC, 0x000000, 0, new THREE.Vector4(0, 0, 1 / p.size, 1 / p.size), CARD_RELIEF, 1);
    blit(pageC, cardRT, i % colsC, Math.floor(i / colsC), colsC, rowsC, p.size, p.size, CARD_RELIEF, 1);
    cardIndex.set(p.name, i);
  });
  // now the mip levels, once
  for (const rt of [wallRT, cardRT]) {
    rt.texture.generateMipmaps = true;
    rt.scissorTest = false;
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    rt.texture.generateMipmaps = false;
  }

  renderer.setRenderTarget(saved.rt);
  renderer.setClearColor(saved.color, saved.alpha);
  renderer.autoClear = saved.autoClear;
  renderer.shadowMap.autoUpdate = saved.shadow;
  pageW.dispose();
  pageC.dispose();
  pageMat.dispose();
  postMat.dispose();
  tri.dispose();
  return { walls: wallRT.texture, cards: cardRT.texture, gridW, gridC, wallIndex, cardIndex, ms: performance.now() - t0, rts: [wallRT, cardRT] };
}

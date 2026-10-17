// Canvas-textured faces for the station: "Tinyhaven Central" name boards, the platform
// number and the LED departure board (redrawn only when its content changes). One atlas,
// one mesh, one draw call; LED text glows (emissive), enamel signs are lit softly at night.

import * as THREE from 'three';
import type { GlobalUniforms } from '../../core/uniforms';
import type { SignSlot } from './station';

const W = 1024,
  H = 512;
/** atlas regions (pixels): x, y, w, h */
const R = {
  name: [0, 0, 1024, 156],
  board: [0, 160, 760, 245],
  number: [768, 160, 160, 160],
} as const;

export interface BoardRow {
  time: string;
  dest: string;
  info: string;
  /** highlight (blinking/boarding) */
  hot?: boolean;
}

export interface SignMesh {
  mesh: THREE.Mesh;
  setBoard(rows: BoardRow[], clock: string): void;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

export function createSigns(globals: GlobalUniforms, slots: SignSlot[], stationName: string): SignMesh {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);

  // ── name board: navy enamel, cream lettering, white rim
  {
    const [x, y, w, h] = R.name;
    g.fillStyle = '#f4f1e8';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#1e3a5c';
    roundRect(g, x + 8, y + 8, w - 16, h - 16, 18);
    g.fill();
    g.strokeStyle = '#f4f1e8';
    g.lineWidth = 4;
    roundRect(g, x + 18, y + 18, w - 36, h - 36, 12);
    g.stroke();
    g.fillStyle = '#f6eed9';
    g.font = 'bold 84px Georgia, "Times New Roman", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(stationName, x + w / 2, y + h / 2 + 4);
  }
  // ── platform number
  {
    const [x, y, w, h] = R.number;
    g.fillStyle = '#f4f1e8';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#1e3a5c';
    roundRect(g, x + 8, y + 8, w - 16, h - 16, 16);
    g.fill();
    g.fillStyle = '#f6eed9';
    g.font = 'bold 110px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('1', x + w / 2, y + h / 2 + 6);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;

  // ── geometry: one quad per face; back faces get mirrored u so text reads correctly
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const glow: number[] = [];
  const idx: number[] = [];
  const quad = (cx: number, cy: number, cz: number, w: number, h: number, nz: number, region: readonly number[], gl: [number, number]) => {
    const [rx, ry, rw, rh] = region;
    const u0 = rx / W,
      u1 = (rx + rw) / W;
    const v1 = 1 - ry / H,
      v0 = 1 - (ry + rh) / H;
    const b = pos.length / 3;
    const z = cz + nz * 0.045;
    // viewer facing the face: right = +x when nz > 0, −x when nz < 0
    const xl = cx - (w / 2) * nz,
      xr = cx + (w / 2) * nz;
    pos.push(xl, cy - h / 2, z, xr, cy - h / 2, z, xr, cy + h / 2, z, xl, cy + h / 2, z);
    for (let k = 0; k < 4; k++) {
      nor.push(0, 0, nz);
      glow.push(gl[0], gl[1]);
    }
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  for (const s of slots) {
    const region = s.kind === 'name' ? R.name : s.kind === 'board' ? R.board : R.number;
    const gl: [number, number] = s.kind === 'board' ? [1.25, 0.6] : [0.0, 0.45];
    // board region aspect differs slightly from the frame: inset
    quad(s.x, s.y, s.z, s.w, s.h, 1, region, gl);
    if (s.both) quad(s.x, s.y, s.z, s.w, s.h, -1, region, gl);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aGlow', new THREE.Float32BufferAttribute(glow, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.0 });
  mat.name = 'rail-signs';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLights = globals.uLights;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aGlow;\nvarying vec2 vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLights;\nvarying vec2 vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * (vGlow.x + vGlow.y * uLights);');
  };
  mat.customProgramCacheKey = () => 'rail-signs-v1';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'rail-signs';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;

  let last = '';
  const setBoard = (rows: BoardRow[], clock: string) => {
    const key = clock + '|' + rows.map((r) => `${r.time}/${r.dest}/${r.info}/${r.hot ? 1 : 0}`).join(';');
    if (key === last) return;
    last = key;
    const [x, y, w, h] = R.board;
    g.fillStyle = '#0d0f10';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#16191b';
    g.fillRect(x + 6, y + 6, w - 12, h - 12);
    g.textBaseline = 'middle';
    // header
    g.font = 'bold 30px "Courier New", monospace';
    g.fillStyle = '#e8e6df';
    g.textAlign = 'left';
    g.fillText('DEPARTURES', x + 22, y + 32);
    g.textAlign = 'right';
    g.fillStyle = '#ffb63a';
    g.fillText(clock, x + w - 22, y + 32);
    g.fillStyle = '#3a3f42';
    g.fillRect(x + 16, y + 54, w - 32, 3);
    const rowH = 58;
    rows.slice(0, 3).forEach((r, i) => {
      const yy = y + 92 + i * rowH;
      g.font = 'bold 40px "Courier New", monospace';
      g.textAlign = 'left';
      g.fillStyle = r.hot ? '#ffd27a' : '#ffb63a';
      g.fillText(r.time, x + 22, yy);
      g.fillText(r.dest.toUpperCase().slice(0, 13), x + 170, yy);
      g.textAlign = 'right';
      g.font = 'bold 30px "Courier New", monospace';
      g.fillStyle = r.hot ? '#9df29a' : '#ffb63a';
      g.fillText(r.info.toUpperCase().slice(0, 10), x + w - 22, yy);
    });
    tex.needsUpdate = true;
  };
  setBoard([{ time: '--:--', dest: 'Please wait', info: '' }], '--:--');
  return { mesh, setBoard };
}

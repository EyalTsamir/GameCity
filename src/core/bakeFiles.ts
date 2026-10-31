// Baked files (docs/progress/baking.md): results computed at build time by scripts/bake.mjs, loaded by the page from bake/.
// They only ever make the city cheaper: while a file is on its way, or when it is missing (no bake built, opened from
// file://, ?nobake), the module stays on its procedural path and looks the same. So nothing here may throw or log.
//
// File format (.bct, gzip-compressed on disk by the bake, unpacked here so that no host's settings matter):
//   16-byte header: 'THBC', u32 width, u32 height, u32 mip count; then the BC1 blocks of each mip, largest first.

import * as THREE from 'three';

export interface BakeManifest {
  /** bake name → its file, compressed size, and the fingerprint of what it was baked from */
  files: Record<string, { file: string; bytes: number; key: string }>;
}

let manifest: Promise<BakeManifest | null> | null = null;

export function bakeOn(params: URLSearchParams): boolean {
  return !params.has('nobake') && location.protocol !== 'file:';
}

function readManifest(): Promise<BakeManifest | null> {
  return (manifest ??= fetch('bake/manifest.json')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null) as Promise<BakeManifest | null>);
}

async function fetchBytes(file: string): Promise<ArrayBuffer | null> {
  const r = await fetch(`bake/${file}`);
  if (!r.ok) return null;
  // gzip inside the file, not by Content-Encoding: what a host does with unknown types differs, and if it did
  // decompress on the way the bytes are already plain here
  const b = await r.arrayBuffer();
  const u = new Uint8Array(b, 0, 2);
  if (u[0] !== 0x1f || u[1] !== 0x8b) return b;
  return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

/** BC1 → RGBA8, for the GPUs without S3TC (phones): one mip */
function decodeBC1(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  const pal = new Uint8Array(16);
  let p = 0;
  for (let by = 0; by < h; by += 4)
    for (let bx = 0; bx < w; bx += 4) {
      const c0 = src[p] | (src[p + 1] << 8),
        c1 = src[p + 2] | (src[p + 3] << 8);
      const r0 = ((c0 >> 11) * 255) / 31,
        g0 = (((c0 >> 5) & 63) * 255) / 63,
        b0 = ((c0 & 31) * 255) / 31;
      const r1 = ((c1 >> 11) * 255) / 31,
        g1 = (((c1 >> 5) & 63) * 255) / 63,
        b1 = ((c1 & 31) * 255) / 31;
      pal[0] = r0;
      pal[1] = g0;
      pal[2] = b0;
      pal[4] = r1;
      pal[5] = g1;
      pal[6] = b1;
      if (c0 > c1) {
        pal[8] = (2 * r0 + r1) / 3;
        pal[9] = (2 * g0 + g1) / 3;
        pal[10] = (2 * b0 + b1) / 3;
        pal[12] = (r0 + 2 * r1) / 3;
        pal[13] = (g0 + 2 * g1) / 3;
        pal[14] = (b0 + 2 * b1) / 3;
      } else {
        pal[8] = (r0 + r1) / 2;
        pal[9] = (g0 + g1) / 2;
        pal[10] = (b0 + b1) / 2;
        pal[12] = pal[13] = pal[14] = 0;
      }
      for (let j = 0; j < 4; j++) {
        const bits = src[p + 4 + j];
        for (let i = 0; i < 4; i++) {
          const x = bx + i,
            y = by + j;
          if (x >= w || y >= h) continue;
          const k = (bits >> (i * 2)) & 3;
          const o = (y * w + x) * 4;
          out[o] = pal[k * 4];
          out[o + 1] = pal[k * 4 + 1];
          out[o + 2] = pal[k * 4 + 2];
          out[o + 3] = 255;
        }
      }
      p += 8;
    }
  return out;
}

const supportsS3TC = (): boolean => {
  const gl = document.createElement('canvas').getContext('webgl2');
  return !!gl && !!gl.getExtension('WEBGL_compressed_texture_s3tc') && !!gl.getExtension('WEBGL_compressed_texture_s3tc_srgb');
};

/** a baked BC1 texture (sRGB unless `linear`), or null when it is not available or was made from something else (`key`); never rejects */
export async function bakeTexture(name: string, params: URLSearchParams, key: string, opts: { linear?: boolean; anisotropy?: number } = {}): Promise<THREE.Texture | null> {
  if (!bakeOn(params)) return null;
  try {
    const m = await readManifest();
    const entry = m?.files?.[name];
    if (!entry || entry.key !== key) return null;
    const buf = await fetchBytes(entry.file);
    if (!buf) return null;
    const head = new DataView(buf);
    if (head.getUint32(0, true) !== 0x43424854) return null;
    const w0 = head.getUint32(4, true),
      h0 = head.getUint32(8, true),
      nm = head.getUint32(12, true);
    let tex: THREE.Texture;
    if (supportsS3TC()) {
      const mips: { data: Uint8Array; width: number; height: number }[] = [];
      let off = 16,
        w = w0,
        h = h0;
      for (let i = 0; i < nm; i++) {
        const size = Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(h / 4)) * 8;
        mips.push({ data: new Uint8Array(buf, off, size), width: w, height: h });
        off += size;
        w = Math.max(1, w >> 1);
        h = Math.max(1, h >> 1);
      }
      tex = new THREE.CompressedTexture(mips as unknown as ImageData[], w0, h0, THREE.RGB_S3TC_DXT1_Format, THREE.UnsignedByteType);
      tex.minFilter = THREE.LinearMipmapLinearFilter;
    } else {
      const rgba = decodeBC1(new Uint8Array(buf, 16), w0, h0);
      tex = new THREE.DataTexture(rgba, w0, h0, THREE.RGBAFormat, THREE.UnsignedByteType);
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
    }
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = opts.anisotropy ?? 8;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    tex.name = `bake-${name}`;
    tex.needsUpdate = true;
    return tex;
  } catch {
    return null;
  }
}

/** upload to the GPU, one texture a frame: the first use must not stall a frame on all of them */
export async function uploadStaged(renderer: THREE.WebGLRenderer, textures: THREE.Texture[]): Promise<void> {
  for (const t of textures) {
    await new Promise((done) => requestAnimationFrame(done));
    renderer.initTexture(t);
  }
}

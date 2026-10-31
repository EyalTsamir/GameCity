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
  // (the browser's data saver or a slow line: 18 MB aren't worth it, the same picture is computed here)
  const net = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const slow = net?.saveData === true || /2g|3g/.test(net?.effectiveType ?? '');
  return !params.has('nobake') && !slow && location.protocol !== 'file:';
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

/** a baked file as bytes, or null when it is not available or was made from something else; never rejects */
export async function bakeBytes(name: string, params: URLSearchParams, key: string): Promise<Uint8Array | null> {
  if (!bakeOn(params)) return null;
  try {
    const m = await readManifest();
    const entry = m?.files?.[name];
    if (!entry || entry.key !== key) return null;
    const buf = await fetchBytes(entry.file);
    return buf ? new Uint8Array(buf) : null;
  } catch {
    return null;
  }
}

let s3tc: boolean | null = null;
const supportsS3TC = (): boolean => {
  if (s3tc === null) {
    const gl = document.createElement('canvas').getContext('webgl2');
    s3tc = !!gl && !!gl.getExtension('WEBGL_compressed_texture_s3tc') && !!gl.getExtension('WEBGL_compressed_texture_s3tc_srgb');
  }
  return s3tc;
};

/**
 * a baked BC1 texture (sRGB unless `linear`), or null when it is not available or was made from something else (`key`); never
 * rejects. Also null on the GPUs without S3TC (phones): unpacked in the page five of these would take 430 MB there, so those
 * stay on the procedural path.
 */
export async function bakeTexture(name: string, params: URLSearchParams, key: string, opts: { linear?: boolean; anisotropy?: number } = {}): Promise<THREE.Texture | null> {
  if (!bakeOn(params) || !supportsS3TC()) return null;
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
    const tex = new THREE.CompressedTexture(mips as unknown as ImageData[], w0, h0, THREE.RGB_S3TC_DXT1_Format, THREE.UnsignedByteType);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
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

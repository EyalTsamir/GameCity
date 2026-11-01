// BC1 (DXT1) encoder for the bake: no dependency, about 2 s per 4096² in Node. Colours are compared in the sRGB values
// they are stored in. Each block: principal axis of its 16 colours, end points on that axis, inset, refined once by
// least squares. No punch-through alpha (c0 > c1 always).

const round565 = (r, g, b) => ((Math.round((r * 31) / 255) & 31) << 11) | ((Math.round((g * 63) / 255) & 63) << 5) | (Math.round((b * 31) / 255) & 31);
const expand = (c, out) => {
  out[0] = (((c >> 11) & 31) * 255) / 31;
  out[1] = (((c >> 5) & 63) * 255) / 63;
  out[2] = ((c & 31) * 255) / 31;
};

const px = new Float32Array(48);
const A = new Float32Array(3);
const B = new Float32Array(3);
const pal = new Float32Array(12);

function encodeBlock(out, o) {
  // mean + the axis by a few power iterations of the covariance
  let mr = 0,
    mg = 0,
    mb = 0;
  for (let i = 0; i < 16; i++) {
    mr += px[i * 3];
    mg += px[i * 3 + 1];
    mb += px[i * 3 + 2];
  }
  mr /= 16;
  mg /= 16;
  mb /= 16;
  let xx = 0,
    xy = 0,
    xz = 0,
    yy = 0,
    yz = 0,
    zz = 0;
  for (let i = 0; i < 16; i++) {
    const r = px[i * 3] - mr,
      g = px[i * 3 + 1] - mg,
      b = px[i * 3 + 2] - mb;
    xx += r * r;
    xy += r * g;
    xz += r * b;
    yy += g * g;
    yz += g * b;
    zz += b * b;
  }
  let ax = 0.9,
    ay = 1,
    az = 0.7;
  for (let k = 0; k < 4; k++) {
    const nx = xx * ax + xy * ay + xz * az,
      ny = xy * ax + yy * ay + yz * az,
      nz = xz * ax + yz * ay + zz * az;
    const m = Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz));
    if (m < 1e-6) break;
    ax = nx / m;
    ay = ny / m;
    az = nz / m;
  }
  let lo = 1e9,
    hi = -1e9;
  const norm = Math.max(1e-6, ax * ax + ay * ay + az * az);
  for (let i = 0; i < 16; i++) {
    const t = ((px[i * 3] - mr) * ax + (px[i * 3 + 1] - mg) * ay + (px[i * 3 + 2] - mb) * az) / norm;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  const inset = (hi - lo) / 32;
  lo += inset;
  hi -= inset;
  const cl = (v) => Math.max(0, Math.min(255, v));
  let c0 = round565(cl(mr + ax * hi), cl(mg + ay * hi), cl(mb + az * hi));
  let c1 = round565(cl(mr + ax * lo), cl(mg + ay * lo), cl(mb + az * lo));
  const assign = () => {
    if (c0 < c1) {
      const t = c0;
      c0 = c1;
      c1 = t;
    }
    if (c0 === c1) return 0;
    expand(c0, A);
    expand(c1, B);
    pal[0] = A[0];
    pal[1] = A[1];
    pal[2] = A[2];
    pal[3] = B[0];
    pal[4] = B[1];
    pal[5] = B[2];
    pal[6] = (2 * A[0] + B[0]) / 3;
    pal[7] = (2 * A[1] + B[1]) / 3;
    pal[8] = (2 * A[2] + B[2]) / 3;
    pal[9] = (A[0] + 2 * B[0]) / 3;
    pal[10] = (A[1] + 2 * B[1]) / 3;
    pal[11] = (A[2] + 2 * B[2]) / 3;
    let bits = 0;
    for (let i = 15; i >= 0; i--) {
      let best = 0,
        bd = 1e12;
      for (let k = 0; k < 4; k++) {
        const dr = px[i * 3] - pal[k * 3],
          dg = px[i * 3 + 1] - pal[k * 3 + 1],
          db = px[i * 3 + 2] - pal[k * 3 + 2];
        const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      bits = ((bits << 2) | best) >>> 0;
    }
    return bits;
  };
  let bits = assign();
  // one least-squares refinement of the end points for this assignment
  if (c0 !== c1) {
    let a2 = 0,
      b2 = 0,
      ab = 0,
      ax0 = 0,
      ax1 = 0,
      ax2 = 0,
      bx0 = 0,
      bx1 = 0,
      bx2 = 0;
    const W = [1, 0, 2 / 3, 1 / 3];
    for (let i = 0; i < 16; i++) {
      const w = W[(bits >>> (i * 2)) & 3],
        v = 1 - w;
      a2 += w * w;
      b2 += v * v;
      ab += w * v;
      ax0 += w * px[i * 3];
      ax1 += w * px[i * 3 + 1];
      ax2 += w * px[i * 3 + 2];
      bx0 += v * px[i * 3];
      bx1 += v * px[i * 3 + 1];
      bx2 += v * px[i * 3 + 2];
    }
    const det = a2 * b2 - ab * ab;
    if (Math.abs(det) > 1e-6) {
      const f = 1 / det;
      c0 = round565(cl(f * (b2 * ax0 - ab * bx0)), cl(f * (b2 * ax1 - ab * bx1)), cl(f * (b2 * ax2 - ab * bx2)));
      c1 = round565(cl(f * (a2 * bx0 - ab * ax0)), cl(f * (a2 * bx1 - ab * ax1)), cl(f * (a2 * bx2 - ab * ax2)));
      bits = assign();
    }
  }
  if (c0 === c1) bits = 0; // all pixels on c0 (c0 == c1 selects the 3-colour mode, index 0 is still c0)
  out[o] = c0 & 255;
  out[o + 1] = c0 >> 8;
  out[o + 2] = c1 & 255;
  out[o + 3] = c1 >> 8;
  out[o + 4] = bits & 255;
  out[o + 5] = (bits >>> 8) & 255;
  out[o + 6] = (bits >>> 16) & 255;
  out[o + 7] = (bits >>> 24) & 255;
}

/** one mip: RGBA8 (top row first or last, unchanged) → BC1 blocks */
export function encodeBC1(rgba, w, h) {
  const bw = Math.max(1, Math.ceil(w / 4)),
    bh = Math.max(1, Math.ceil(h / 4));
  const out = new Uint8Array(bw * bh * 8);
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) {
          const x = Math.min(w - 1, bx * 4 + i),
            y = Math.min(h - 1, by * 4 + j);
          const s = (y * w + x) * 4,
            d = (j * 4 + i) * 3;
          px[d] = rgba[s];
          px[d + 1] = rgba[s + 1];
          px[d + 2] = rgba[s + 2];
        }
      encodeBlock(out, (by * bw + bx) * 8);
    }
  return out;
}

const toLinear = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  toLinear[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const toSRGB = (v) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, c)) * 255);
};

/** next mip by a 2×2 box in linear light (`linear`: the values are not sRGB) */
export function halve(rgba, w, h, linear = false) {
  const nw = Math.max(1, w >> 1),
    nh = Math.max(1, h >> 1);
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++)
    for (let x = 0; x < nw; x++) {
      const x1 = Math.min(w - 1, x * 2 + 1),
        y1 = Math.min(h - 1, y * 2 + 1);
      const a = (y * 2 * w + x * 2) * 4,
        b = (y * 2 * w + x1) * 4,
        c = (y1 * w + x * 2) * 4,
        d = (y1 * w + x1) * 4;
      const o = (y * nw + x) * 4;
      for (let k = 0; k < 3; k++) {
        if (linear) out[o + k] = (rgba[a + k] + rgba[b + k] + rgba[c + k] + rgba[d + k] + 2) >> 2;
        else out[o + k] = toSRGB((toLinear[rgba[a + k]] + toLinear[rgba[b + k]] + toLinear[rgba[c + k]] + toLinear[rgba[d + k]]) * 0.25);
      }
      out[o + 3] = 255;
    }
  return { data: out, w: nw, h: nh };
}

/** unsharp mask (3x3), in the stored values: bilinear filtering softens every texture, this hands the edge back */
export function sharpen(rgba, w, h, amount) {
  const out = new Uint8Array(rgba.length);
  for (let y = 0; y < h; y++) {
    const ym = Math.max(0, y - 1),
      yp = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const xm = Math.max(0, x - 1),
        xp = Math.min(w - 1, x + 1);
      const o = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        const c = rgba[o + k];
        const blur =
          (4 * c +
            2 * (rgba[(y * w + xm) * 4 + k] + rgba[(y * w + xp) * 4 + k] + rgba[(ym * w + x) * 4 + k] + rgba[(yp * w + x) * 4 + k]) +
            rgba[(ym * w + xm) * 4 + k] +
            rgba[(ym * w + xp) * 4 + k] +
            rgba[(yp * w + xm) * 4 + k] +
            rgba[(yp * w + xp) * 4 + k]) /
          16;
        out[o + k] = Math.max(0, Math.min(255, Math.round(c + (c - blur) * amount)));
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

/** the .bct container: header + BC1 of every mip. sharp: the unsharp amount for level 0; the smaller mips get half of it */
export function encodeBCT(rgba, w, h, linear = false, sharp = 0) {
  const parts = [];
  let cw = w,
    ch = h,
    cur = rgba,
    nm = 0;
  for (;;) {
    parts.push(encodeBC1(sharp && cw > 4 ? sharpen(cur, cw, ch, nm ? sharp / 2 : sharp) : cur, cw, ch));
    nm++;
    if (cw === 1 && ch === 1) break;
    const n = halve(cur, cw, ch, linear);
    cur = n.data;
    cw = n.w;
    ch = n.h;
  }
  const head = Buffer.alloc(16);
  head.writeUInt32LE(0x43424854, 0);
  head.writeUInt32LE(w, 4);
  head.writeUInt32LE(h, 8);
  head.writeUInt32LE(nm, 12);
  return Buffer.concat([head, ...parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength))]);
}

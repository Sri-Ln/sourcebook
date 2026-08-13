#!/usr/bin/env node
/**
 * Renders the extension icons.
 *
 *   node scripts/generate-icons.mjs
 *
 * Written by hand rather than pulling in a rasteriser: the mark is a few
 * geometric primitives, and a build step nobody can run without installing
 * ImageMagick is a build step that rots. Everything here is Node's own zlib.
 *
 * Quality comes from supersampling — the mark is drawn at 4x and box-filtered
 * down, which is what gives the curves clean edges at 16px.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const SIZES = [16, 32, 48, 96, 128];
const SS = 4;

/**
 * Deliberately not LinkedIn blue. The Chrome Web Store treats visual similarity
 * to another company's brand as implied affiliation, and this extension is not
 * affiliated with LinkedIn.
 */
const INK = [0x1c, 0x27, 0x3c];
const PAPER = [0xf4, 0xf1, 0xea];

/** Signed distance to a rounded rectangle, negative inside. */
function roundedRect(x, y, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(x - cx) - (halfW - radius);
  const dy = Math.abs(y - cy) - (halfH - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

/**
 * The mark: a bookmark ribbon. Chosen because a notched rectangle still reads
 * as a bookmark at 16 pixels, where anything with interior detail turns to mush.
 */
function sample(u, v) {
  // Background tile.
  if (roundedRect(u, v, 0.5, 0.5, 0.5, 0.5, 0.22) > 0) return null;

  const inRibbon = roundedRect(u, v, 0.5, 0.47, 0.17, 0.29, 0.03) <= 0;
  if (!inRibbon) return INK;

  // Notch: a V cut into the bottom edge, carved by comparing the distance from
  // the centre line against how far up from the base we are.
  const fromBase = 0.76 - v;
  const notch = fromBase >= 0 && Math.abs(u - 0.5) <= 0.17 - fromBase * 0.85;
  return notch ? INK : PAPER;
}

function renderPixels(size) {
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const colour = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          if (!colour) continue;
          r += colour[0];
          g += colour[1];
          b += colour[2];
          a += 255;
        }
      }

      const samples = SS * SS;
      const i = (y * size + x) * 4;
      // Premultiplied averaging would darken the edges against a light toolbar;
      // averaging colour over covered samples only keeps them neutral.
      const covered = a / 255 || 1;
      pixels[i] = Math.round(r / covered);
      pixels[i + 1] = Math.round(g / covered);
      pixels[i + 2] = Math.round(b / covered);
      pixels[i + 3] = Math.round(a / samples);
    }
  }

  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  // 10-12 stay zero: deflate, adaptive filtering, no interlace.

  // Filter type 0 per scanline. The images are tiny; a filter search would buy
  // bytes nobody will notice.
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icon', { recursive: true });

for (const size of SIZES) {
  const png = encodePng(size, renderPixels(size));
  writeFileSync(`public/icon/${size}.png`, png);
  console.log(`public/icon/${size}.png  ${png.length} bytes`);
}

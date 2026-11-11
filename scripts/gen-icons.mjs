import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const palette = {
  '.': [20, 12, 24, 255],
  s: [214, 178, 92, 255],
  w: [64, 126, 214, 255],
  f: [255, 132, 32, 255],
  y: [255, 214, 96, 255],
  g: [46, 170, 64, 255],
  l: [255, 78, 24, 255],
  b: [90, 60, 40, 255],
  k: [8, 4, 12, 255],
};

const art = [
  '................',
  '......ff........',
  '.....fyyf.......',
  '......ff........',
  '......bb........',
  '.....gggg.......',
  '....gg..gg......',
  '......bb........',
  '..ssss....wwww..',
  '.ssssss..wwwwww.',
  'sssssssswwwwwwww',
  'ssssssllllllllll',
  '.sssslllllllll..',
  '..ssllllllll....',
  '................',
  '................',
];

function pixelsFromArt(scalePad = 0) {
  const n = 16 + scalePad * 2;
  const data = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const sx = x - scalePad;
      const sy = y - scalePad;
      const ch = sx >= 0 && sy >= 0 && sx < 16 && sy < 16 ? art[sy][sx] : '.';
      const rgba = palette[ch] ?? palette['.'];
      const i = (y * n + x) * 4;
      data[i] = rgba[0];
      data[i + 1] = rgba[1];
      data[i + 2] = rgba[2];
      data[i + 3] = rgba[3];
    }
  }
  return { size: n, data };
}

function scaleNearest(src, sw, factor) {
  const dw = sw * factor;
  const out = Buffer.alloc(dw * dw * 4);
  for (let y = 0; y < dw; y++) {
    for (let x = 0; x < dw; x++) {
      const si = ((y / factor | 0) * sw + (x / factor | 0)) * 4;
      const di = (y * dw + x) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return out;
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const root = path.resolve('public');
fs.mkdirSync(path.join(root, 'icons'), { recursive: true });
const scene = pixelsFromArt(0);
fs.writeFileSync(path.join(root, 'favicon.png'), png(32, scaleNearest(scene.data, 16, 2)));
fs.writeFileSync(path.join(root, 'icons', 'icon-192.png'), png(192, scaleNearest(scene.data, 16, 12)));
const big = scaleNearest(scene.data, 16, 32);
fs.writeFileSync(path.join(root, 'icons', 'icon-512.png'), png(512, big));
const padded = Buffer.alloc(32 * 32 * 4);
for (let i = 0; i < padded.length; i += 4) {
  padded[i] = 20;
  padded[i + 1] = 12;
  padded[i + 2] = 24;
  padded[i + 3] = 255;
}
for (let y = 0; y < 16; y++) {
  for (let x = 0; x < 16; x++) {
    const si = (y * 16 + x) * 4;
    const di = ((y + 8) * 32 + (x + 8)) * 4;
    padded[di] = scene.data[si];
    padded[di + 1] = scene.data[si + 1];
    padded[di + 2] = scene.data[si + 2];
    padded[di + 3] = scene.data[si + 3];
  }
}
fs.writeFileSync(path.join(root, 'icons', 'maskable-512.png'), png(512, scaleNearest(padded, 32, 16)));
console.log('icons written');

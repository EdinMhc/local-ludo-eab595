// Dependency-free PNG icon generator for the PWA.
// Draws a 4-quadrant Ludo mark (red/green/yellow/blue) with a white cross and
// center dot. Run: `node scripts/gen-icons.mjs`
import { deflateSync } from "zlib";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public");
mkdirSync(OUT, { recursive: true });

const COLORS = {
  red: [225, 29, 72],
  green: [22, 163, 74],
  blue: [37, 99, 235],
  yellow: [234, 179, 8],
  white: [255, 255, 255],
};

// CRC32
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function makePng(size) {
  const S = size;
  const raw = Buffer.alloc(S * (S * 3 + 1)); // filter byte + RGB per row
  const half = S / 2;
  const cross = S * 0.09; // white cross half-thickness
  const dot = S * 0.13; // center white dot radius
  let o = 0;
  for (let y = 0; y < S; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < S; x++) {
      let col;
      const dx = x - half;
      const dy = y - half;
      if (Math.sqrt(dx * dx + dy * dy) < dot) col = COLORS.white;
      else if (Math.abs(dx) < cross || Math.abs(dy) < cross) col = COLORS.white;
      else if (x < half && y < half) col = COLORS.red;
      else if (x >= half && y < half) col = COLORS.green;
      else if (x < half && y >= half) col = COLORS.blue;
      else col = COLORS.yellow;
      raw[o++] = col[0];
      raw[o++] = col[1];
      raw[o++] = col[2];
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  writeFileSync(join(OUT, name), makePng(size));
  console.log("wrote public/" + name + " (" + size + "x" + size + ")");
}

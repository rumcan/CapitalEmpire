// Terrain preview: writes output/terrain/seed-<n>.png for each seed argument (default 1 2 3 4). Node only.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { MAP } from '../../src/game/iso';
import { TC, heightAt, generateTerrain, type Terrain } from '../../src/game/terrain';

const SIZE = 1024, SCALE = 2;
const COLOURS: Record<number, [number, number, number]> = {
  [TC.GROUND]: [0x6f, 0x8a, 0x3a], [TC.PATCH]: [0x93, 0xa3, 0x52], [TC.HILL]: [0x46, 0x60, 0x3a],
  [TC.WATER]: [0x3d, 0x7e, 0xa6], [TC.CREEK]: [0x5f, 0x8f, 0xa0], [TC.BANK]: [0x7d, 0x6a, 0x48],
};

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
/** CRC-32 of a byte array */
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/** one PNG chunk: length, type, data, CRC */
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** minimal 8-bit RGB PNG encoder (filter 0 on every row) */
function encodePng(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))]);
}

/** draw a filled or outlined axis-aligned rectangle (pixel coords) into rgb */
function rect(rgb: Uint8Array, x0: number, y0: number, x1: number, y1: number, col: number[], outline: number) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  for (let y = Math.max(0, y0); y <= Math.min(SIZE - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(SIZE - 1, x1); x++) {
    const edge = x - x0 < outline || x1 - x < outline || y - y0 < outline || y1 - y < outline;
    if (outline === 0 || edge) { const k = (y * SIZE + x) * 3; rgb[k] = col[0]; rgb[k + 1] = col[1]; rgb[k + 2] = col[2]; }
  }
}
/** draw a magenta cross of arm length r around (cx, cy) in pixels */
function cross(rgb: Uint8Array, cx: number, cy: number, r: number) {
  cx = Math.round(cx); cy = Math.round(cy);
  for (let d = -r; d <= r; d++) for (const [x, y] of [[cx + d, cy], [cx, cy + d]]) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
    const k = (y * SIZE + x) * 3; rgb[k] = 255; rgb[k + 1] = 0; rgb[k + 2] = 255;
  }
}

/** render the map: class colours times a hillshade (light from the upper left), with markers */
function render(t: Terrain): Uint8Array {
  const rgb = new Uint8Array(SIZE * SIZE * 3);
  const TILE_M = 2; // metres per tile
  for (let py = 0; py < SIZE; py++) for (let px = 0; px < SIZE; px++) {
    const x = px * SCALE, y = py * SCALE;
    const col = COLOURS[t.cls[y * MAP + x]] ?? COLOURS[TC.HILL];
    // slope over a 4-tile span, in metres per metre; normal (-gx, -gy, 1) against light from the upper left (-1, -1, 1)
    const gx = (heightAt(t, x + 2, y) - heightAt(t, x - 2, y)) / (4 * TILE_M);
    const gy = (heightAt(t, x, y + 2) - heightAt(t, x, y - 2)) / (4 * TILE_M);
    const nl = Math.hypot(gx, gy, 1);
    const lambert = Math.max(0, (gx + gy + 1) / (nl * Math.sqrt(3)));
    const shade = Math.min(1.15, Math.max(0.5, 0.75 + 0.25 * lambert));
    const k = (py * SIZE + px) * 3;
    rgb[k] = Math.min(255, col[0] * shade); rgb[k + 1] = Math.min(255, col[1] * shade); rgb[k + 2] = Math.min(255, col[2] * shade);
  }
  const hx = t.highway.x / SCALE, hy = t.highway.y / SCALE;
  rect(rgb, hx - 2, hy - 2, hx + 2, hy + 2, [255, 0, 0], 0);
  rect(rgb, t.start.x / SCALE, t.start.y / SCALE, (t.start.x + t.start.size) / SCALE, (t.start.y + t.start.size) / SCALE, [255, 255, 0], 2);
  for (const c of t.chokepoints) cross(rgb, c.x / SCALE, c.y / SCALE, 6);
  return rgb;
}

const args = process.argv.slice(2);
const seeds = args.length ? args.map(Number) : [1, 2, 3, 4];
const dir = resolve('output/terrain');
mkdirSync(dir, { recursive: true });
for (const seed of seeds) {
  const t0 = performance.now();
  const t = generateTerrain(seed);
  const ms = performance.now() - t0;
  const file = resolve(dir, `seed-${seed}.png`);
  writeFileSync(file, encodePng(SIZE, SIZE, render(t)));
  console.log(`${file}  attempt ${t.attempt}  generate ${ms.toFixed(0)} ms`);
}

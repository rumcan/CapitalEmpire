// Terrain v2 preview (Node only, run by hand): `npx esbuild src/game/ext/terrain2/preview.ts --bundle --platform=node
// --format=esm --outfile=output/terrain2/preview.mjs && node output/terrain2/preview.mjs [seeds]`. Writes
// output/terrain2/seed-<n>.png for each seed given (1024 px: the classes with a hillshade, the town sites (orange), the
// start block (yellow), the highway entry (red) and the chokepoints (magenta crosses)), and output/terrain2/sheet.png:
// seeds 1-6 in a 3 x 2 grid, each map 512 px.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { MAP } from '../../iso';
import { TC, heightAt, type Terrain } from '../../terrain/types';
import { generateTerrain2, checkGuarantees2 } from './generate';

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
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); out.set(data, 8); out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** minimal 8-bit RGB PNG encoder (filter 0 on every row) */
function encodePng(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))]);
}
/** draw a filled or outlined rectangle (pixel coords) into rgb of width size */
function rect(rgb: Uint8Array, size: number, x0: number, y0: number, x1: number, y1: number, col: number[], outline: number) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  for (let y = Math.max(0, y0); y <= Math.min(size - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(size - 1, x1); x++) {
    const edge = x - x0 < outline || x1 - x < outline || y - y0 < outline || y1 - y < outline;
    if (outline === 0 || edge) { const k = (y * size + x) * 3; rgb[k] = col[0]; rgb[k + 1] = col[1]; rgb[k + 2] = col[2]; }
  }
}
/** draw a magenta cross of arm length r around (cx, cy) */
function cross(rgb: Uint8Array, size: number, cx: number, cy: number, r: number) {
  cx = Math.round(cx); cy = Math.round(cy);
  for (let d = -r; d <= r; d++) for (const [x, y] of [[cx + d, cy], [cx, cy + d]]) {
    if (x < 0 || y < 0 || x >= size || y >= size) continue;
    const k = (y * size + x) * 3; rgb[k] = 255; rgb[k + 1] = 0; rgb[k + 2] = 255;
  }
}
/** the map at size x size pixels: class colours times a hillshade (light from the upper left), with the sites marked */
function render(t: Terrain, size: number): Uint8Array {
  const rgb = new Uint8Array(size * size * 3), TILE_M = 2, SCALE = MAP / size;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const x = px * SCALE, y = py * SCALE;
    const col = COLOURS[t.cls[Math.floor(y) * MAP + Math.floor(x)]] ?? COLOURS[TC.HILL];
    const gx = (heightAt(t, x + 2, y) - heightAt(t, x - 2, y)) / (4 * TILE_M);
    const gy = (heightAt(t, x, y + 2) - heightAt(t, x, y - 2)) / (4 * TILE_M);
    const nl = Math.hypot(gx, gy, 1);
    const lambert = Math.max(0, (gx + gy + 1) / (nl * Math.sqrt(3)));
    const shade = Math.min(1.15, Math.max(0.5, 0.75 + 0.25 * lambert));
    const k = (py * size + px) * 3;
    rgb[k] = Math.min(255, col[0] * shade); rgb[k + 1] = Math.min(255, col[1] * shade); rgb[k + 2] = Math.min(255, col[2] * shade);
  }
  const s = size / MAP;
  rect(rgb, size, t.highway.x * s - 2, t.highway.y * s - 2, t.highway.x * s + 2, t.highway.y * s + 2, [255, 0, 0], 0);
  for (const w of t.towns) rect(rgb, size, w.x * s, w.y * s, (w.x + w.size) * s, (w.y + w.size) * s, [255, 160, 0], 2);
  rect(rgb, size, t.start.x * s, t.start.y * s, (t.start.x + t.start.size) * s, (t.start.y + t.start.size) * s, [255, 255, 0], 2);
  for (const c of t.chokepoints) cross(rgb, size, c.x * s, c.y * s, 6);
  return rgb;
}
/** the 3 x 2 contact sheet of the given maps, each one `size` pixels square */
function sheet(maps: Uint8Array[], size: number): Uint8Array {
  const W = size * 3, out = new Uint8Array(W * size * 2 * 3);
  maps.forEach((m, n) => {
    const ox = (n % 3) * size, oy = Math.floor(n / 3) * size;
    for (let y = 0; y < size; y++) out.set(m.subarray(y * size * 3, (y + 1) * size * 3), ((oy + y) * W + ox) * 3);
  });
  return out;
}

const pct = (v: number) => (100 * v).toFixed(1) + '%';
const seeds = process.argv.slice(2).map(Number);
mkdirSync('output/terrain2', { recursive: true });
const line = (seed: number, t: Terrain, ms: number) => {
  const g = checkGuarantees2(t);
  return `seed ${seed} attempt ${t.attempt} ${ms.toFixed(0)} ms | hill ${pct(g.hill)} buildable ${pct(g.buildable)} connected ${pct(g.connected)} edge flat ${pct(g.edgeFlat)} valley ${g.valley.toFixed(0)} tiles | ${g.ok ? 'ok' : g.reasons.join('; ')}`;
};
for (const seed of seeds) {
  const t0 = performance.now();
  const t = generateTerrain2(seed);
  const ms = performance.now() - t0;
  const file = `output/terrain2/seed-${seed}.png`;
  writeFileSync(file, encodePng(1024, 1024, render(t, 1024)));
  console.log(`${file} ${line(seed, t, ms)}`);
}
const SHEET = 512, maps: Uint8Array[] = [];
for (let seed = 1; seed <= 6; seed++) {
  const t0 = performance.now();
  const t = generateTerrain2(seed);
  maps.push(render(t, SHEET));
  console.log(`sheet ${line(seed, t, performance.now() - t0)}`);
}
writeFileSync('output/terrain2/sheet.png', encodePng(SHEET * 3, SHEET * 2, sheet(maps, SHEET)));
console.log('output/terrain2/sheet.png');

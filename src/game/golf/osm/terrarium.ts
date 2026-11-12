// Real ground height for map-data courses (T357, #999): the elevation the game lays under a real course comes from AWS Terrain Tiles, Tilezen's
// "terrarium" PNGs (https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png: free, no key, public, CORS open to GET). A pixel's height in
// metres is R*256 + G + B/256 - 32768. At zoom 15 a pixel is about 4 m, but the data underneath is as good as the country's source: SRTM (30 m, radar,
// with a faint diagonal striping) in South Africa, USGS 3DEP (3 to 10 m) in the United States, lidar (2 m) in England.
//
// This file is the pure part (no network, no DOM; runs in Node, the game and the workers): decode a tile, sample a window of tiles into a height grid on a
// metres lattice about a course's centre, smooth it, bicubic-read it, and pack it small for a fixture or a save. The fetching and the cache are dem.ts's.
//
// The grid's frame is the stage-1 JSON's (scripts/dev/osm-course.mjs): metres, x east and y NORTH of the course's centre (a local equirectangular
// projection, x = (lon - lon0) * cos(lat0) * R, y = (lat - lat0) * R); sample (i, j) sits at (x0 + i * step, y0 - j * step), so row 0 is the north row.

/** the stage-1 projection's earth radius, m */
export const EARTH_R = 6371008.8;
/** the zoom the tiles are read at: 256 px a tile, about 4 m a pixel in the latitudes golf is played in */
export const DEM_ZOOM = 15;
/** a terrarium tile's side, px */
export const TILE_PX = 256;
/** the tiles' URL */
export const demTileUrl = (z: number, x: number, y: number): string => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

/** a tile's address */
export interface TileKey { z: number; x: number; y: number }
/** a tile's key text "15/18960/18816" (the library's key; the dev cache's file is 15-18960-18816.png) */
export const tileText = (k: TileKey): string => `${k.z}/${k.x}/${k.y}`;
/** a course's centre: the projection's origin */
export interface Centre { lat: number; lon: number }
/** a box in the frame's metres: west, south, east, north (x0, y0, x1, y1) */
export type MetreBox = [number, number, number, number];

const DEG = 180 / Math.PI, RAD = Math.PI / 180;

/** the web-mercator tile coordinates (fractional) of a point at zoom z */
export function tileXY(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z, r = lat * RAD;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}
/** the latitude and longitude of the point (x east, y north) metres from the centre (the stage-1 projection, inverted) */
export function latLonOf(c: Centre, x: number, y: number): { lat: number; lon: number } {
  return { lat: c.lat + (y / EARTH_R) * DEG, lon: c.lon + (x / (EARTH_R * Math.cos(c.lat * RAD))) * DEG };
}

/** the tiles that cover a metres box (with a pixel or two to spare for the bilinear read and the smoothing's reach), in row order */
export function tilesFor(c: Centre, box: MetreBox, z = DEM_ZOOM): TileKey[] {
  const nw = latLonOf(c, box[0], box[3]), se = latLonOf(c, box[2], box[1]), a = tileXY(nw.lat, nw.lon, z), b = tileXY(se.lat, se.lon, z), n = 2 ** z;
  const x0 = Math.max(0, Math.floor(a.x - 2 / TILE_PX)), x1 = Math.min(n - 1, Math.floor(b.x + 2 / TILE_PX)), y0 = Math.max(0, Math.floor(a.y - 2 / TILE_PX)), y1 = Math.min(n - 1, Math.floor(b.y + 2 / TILE_PX));
  const out: TileKey[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ z, x, y });
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------ PNG
/** a decoded PNG: 8 bits a channel, 3 (RGB) or 4 (RGBA) channels */
export interface RawPng { width: number; height: number; channels: 3 | 4; data: Uint8Array }
const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** zlib / deflate bytes inflated by the platform (Node 18+, every current browser, workers) */
export async function inflate(bytes: Uint8Array, format: 'deflate' | 'deflate-raw' = 'deflate'): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
/** bytes deflated (raw deflate: no zlib wrapper) by the platform */
export async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** a PNG decoded: 8-bit RGB or RGBA, not interlaced (what the terrarium tiles are); anything else throws */
export async function decodePng(bytes: Uint8Array): Promise<RawPng> {
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIG[i]) throw new Error('not a PNG');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 8, width = 0, height = 0, depth = 0, ctype = -1, interlace = 0;
  const idat: Uint8Array[] = [];
  while (p + 8 <= bytes.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(bytes[p + 4]!, bytes[p + 5]!, bytes[p + 6]!, bytes[p + 7]!), body = p + 8;
    if (body + len > bytes.length) throw new Error('a PNG chunk runs past the end');
    if (type === 'IHDR') { width = dv.getUint32(body); height = dv.getUint32(body + 4); depth = bytes[body + 8]!; ctype = bytes[body + 9]!; interlace = bytes[body + 12]!; }
    else if (type === 'IDAT') idat.push(bytes.subarray(body, body + len));
    else if (type === 'IEND') break;
    p = body + len + 4;
  }
  if (!width || !height || width > 8192 || height > 8192) throw new Error('a PNG without a usable header');
  if (depth !== 8 || (ctype !== 2 && ctype !== 6) || interlace !== 0) throw new Error(`a PNG this reader does not take (depth ${depth}, colour type ${ctype}, interlace ${interlace})`);
  const total = idat.reduce((s, a) => s + a.length, 0), joined = new Uint8Array(total);
  let o = 0; for (const a of idat) { joined.set(a, o); o += a.length; }
  const raw = await inflate(joined), ch = ctype === 2 ? 3 : 4, stride = width * ch;
  if (raw.length < (stride + 1) * height) throw new Error('a PNG with too little image data');
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]!, src = y * (stride + 1) + 1, dst = y * stride, up = dst - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[dst + x - ch]! : 0, b = y > 0 ? out[up + x]! : 0, c = x >= ch && y > 0 ? out[up + x - ch]! : 0, v = raw[src + x]!;
      let r: number;
      switch (f) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: throw new Error(`a PNG row with filter ${f}`);
      }
      out[dst + x] = r & 255;
    }
  }
  return { width, height, channels: ch as 3 | 4, data: out };
}

// ------------------------------------------------------------------------------------------------------------------------ tiles
/** a terrarium tile's heights: metres, TILE_PX x TILE_PX (a larger tile is read as it is) */
export interface DemTile { w: number; h: number; m: Float32Array }
/** the tiles, by their text (tileText) */
export type DemTiles = Map<string, DemTile>

/** a terrarium tile: its PNG decoded and the colour turned to metres, R*256 + G + B/256 - 32768 */
export async function decodeTile(bytes: Uint8Array): Promise<DemTile> {
  const png = await decodePng(bytes), n = png.width * png.height, m = new Float32Array(n), ch = png.channels, d = png.data;
  for (let k = 0; k < n; k++) m[k] = d[k * ch]! * 256 + d[k * ch + 1]! + d[k * ch + 2]! / 256 - 32768;
  return { w: png.width, h: png.height, m };
}

// ------------------------------------------------------------------------------------------------------------------------ grids
/** a height grid on a metres lattice: sample (i, j) of m sits at (x0 + i * step, y0 - j * step) in the frame (x east, y north of the centre); metres */
export interface HeightGrid { x0: number; y0: number; step: number; w: number; h: number; m: Float32Array }

/** the tile that holds absolute pixel (px, py) at zoom z, one lookup kept (a stretch of samples lies in one tile); throws on a missing tile */
function tileReader(tiles: DemTiles, z: number): (px: number, py: number) => number {
  let tx = -1, ty = -1, t: DemTile | undefined;
  return (px, py) => {
    const x = Math.floor(px / TILE_PX), y = Math.floor(py / TILE_PX);
    if (x !== tx || y !== ty) { t = tiles.get(`${z}/${x}/${y}`); if (!t) throw new MissingTile({ z, x, y }); tx = x; ty = y; }
    return t!.m[(py - y * TILE_PX) * t!.w + (px - x * TILE_PX)]!;
  };
}
/** a tile the sampling needed and the cache did not hold */
export class MissingTile extends Error {
  constructor(readonly key: TileKey) { super(`missing elevation tile ${tileText(key)}`); this.name = 'MissingTile'; }
}

/** the tiles sampled into a grid over a metres box at `step` metres (a point every step, bilinear between the tiles' pixel centres, the lead's shade.mjs
 *  sketch's way). Throws MissingTile when a tile the box needs is not in `tiles` */
export function sampleTiles(tiles: DemTiles, c: Centre, box: MetreBox, step: number, z = DEM_ZOOM): HeightGrid {
  const w = Math.floor((box[2] - box[0]) / step) + 1, h = Math.floor((box[3] - box[1]) / step) + 1, m = new Float32Array(w * h), n = 2 ** z, pixelAt = tileReader(tiles, z);
  const x0 = box[0], y0 = box[3];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const ll = latLonOf(c, x0 + i * step, y0 - j * step), t = tileXY(ll.lat, ll.lon, z), fx = t.x * TILE_PX - 0.5, fy = t.y * TILE_PX - 0.5;
      const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
      // (a point at the date line or a pole wraps or clamps: golf is played nowhere near either)
      const xa = Math.max(0, Math.min(n * TILE_PX - 1, ix)), xb = Math.max(0, Math.min(n * TILE_PX - 1, ix + 1)), ya = Math.max(0, Math.min(n * TILE_PX - 1, iy)), yb = Math.max(0, Math.min(n * TILE_PX - 1, iy + 1));
      m[j * w + i] = pixelAt(xa, ya) * (1 - ax) * (1 - ay) + pixelAt(xb, ya) * ax * (1 - ay) + pixelAt(xa, yb) * (1 - ax) * ay + pixelAt(xb, yb) * ax * ay;
    }
  }
  return { x0, y0, step, w, h, m };
}

/** the grid blurred by a Gaussian of sigma metres (separable, the edges held: the grid's border keeps its own heights, so give it a margin of 3 sigma it
 *  can lose). The SRTM data has a fine diagonal ripple (radar striping) at the 30 m scale and under; this takes it out and keeps the landforms */
export function smoothGrid(g: HeightGrid, sigmaM: number): HeightGrid {
  if (!(sigmaM > 0)) return { ...g, m: g.m.slice() };
  const s = sigmaM / g.step, R = Math.max(1, Math.ceil(3 * s)), k = new Float64Array(2 * R + 1);
  let sum = 0; for (let t = -R; t <= R; t++) { k[t + R] = Math.exp(-(t * t) / (2 * s * s)); sum += k[t + R]!; }
  for (let t = 0; t < k.length; t++) k[t] = k[t]! / sum;
  const { w, h } = g, a = new Float32Array(w * h), b = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) { let v = 0; for (let t = -R; t <= R; t++) v += k[t + R]! * g.m[j * w + Math.max(0, Math.min(w - 1, i + t))]!; a[j * w + i] = v; }
  }
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) { let v = 0; for (let t = -R; t <= R; t++) v += k[t + R]! * a[Math.max(0, Math.min(h - 1, j + t)) * w + i]!; b[j * w + i] = v; }
  }
  return { x0: g.x0, y0: g.y0, step: g.step, w, h, m: b };
}

/** every k-th sample of the grid in both directions (a point read, no averaging: smooth first), from the first one */
export function decimateGrid(g: HeightGrid, k: number): HeightGrid {
  if (k <= 1) return g;
  const w = Math.floor((g.w - 1) / k) + 1, h = Math.floor((g.h - 1) / k) + 1, m = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) m[j * w + i] = g.m[j * k * g.w + i * k]!;
  return { x0: g.x0, y0: g.y0, step: g.step * k, w, h, m };
}

/** the part of a grid that lies in a metres box (whole samples: the box grown to the lattice) */
export function cropGrid(g: HeightGrid, box: MetreBox): HeightGrid {
  const i0 = Math.max(0, Math.floor((box[0] - g.x0) / g.step)), i1 = Math.min(g.w - 1, Math.ceil((box[2] - g.x0) / g.step));
  const j0 = Math.max(0, Math.floor((g.y0 - box[3]) / g.step)), j1 = Math.min(g.h - 1, Math.ceil((g.y0 - box[1]) / g.step));
  const w = Math.max(1, i1 - i0 + 1), h = Math.max(1, j1 - j0 + 1), m = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) m[j * w + i] = g.m[(j0 + j) * g.w + i0 + i]!;
  return { x0: g.x0 + i0 * g.step, y0: g.y0 - j0 * g.step, step: g.step, w, h, m };
}

/** Catmull-Rom's weights for a fraction t (the four taps at -1, 0, 1, 2) */
function cr(t: number, o: Float64Array | number[]): void {
  const t2 = t * t, t3 = t2 * t;
  o[0] = -0.5 * t3 + t2 - 0.5 * t; o[1] = 1.5 * t3 - 2.5 * t2 + 1; o[2] = -1.5 * t3 + 2 * t2 + 0.5 * t; o[3] = 0.5 * t3 - 0.5 * t2;
}
const WX = new Float64Array(4), WY = new Float64Array(4);
/** the grid's height at (x, y) metres: the cubic (Catmull-Rom) through its samples (its slope is continuous, so the light has no facets), the edges held */
export function heightAtM(g: HeightGrid, x: number, y: number): number {
  const fx = (x - g.x0) / g.step, fy = (g.y0 - y) / g.step, i = Math.floor(fx), j = Math.floor(fy);
  cr(fx - i, WX); cr(fy - j, WY);
  const { w, h, m } = g;
  let s = 0;
  for (let q = 0; q < 4; q++) {
    const row = Math.max(0, Math.min(h - 1, j - 1 + q)) * w;
    s += WY[q]! * (WX[0]! * m[row + Math.max(0, Math.min(w - 1, i - 1))]! + WX[1]! * m[row + Math.max(0, Math.min(w - 1, i))]! + WX[2]! * m[row + Math.max(0, Math.min(w - 1, i + 1))]! + WX[3]! * m[row + Math.max(0, Math.min(w - 1, i + 2))]!);
  }
  return s;
}

/** the grid's lowest and highest heights, and the 5th and 95th percentiles */
export function gridRange(g: HeightGrid): { min: number; max: number; p5: number; p95: number } {
  const s = Float32Array.from(g.m).sort();
  return { min: s[0]!, max: s[s.length - 1]!, p5: s[Math.floor(s.length * 0.05)]!, p95: s[Math.floor(s.length * 0.95)]! };
}

// ------------------------------------------------------------------------------------------------------------------------ packing
/** a height grid packed small (a fixture's `height`, a save's `land`): 16-bit units of q metres from base, each sample as its difference from the planar
 *  prediction (left + up - up-left), zigzagged into two byte planes (low bytes, then high bytes: the high plane is nearly all zeros), deflated, base64 */
export interface HeightPack {
  v: 1; x0: number; y0: number; step: number; w: number; h: number;
  /** the height of unit 0, m, and the metres a unit is */ base: number; q: number;
  /** base64 of the raw-deflated planes */ d: string;
}

/** the bytes as base64 text (chunked: a big array does not blow the call's argument limit) */
export function toBase64(b: Uint8Array): string {
  // T438: by a table of every 12-bit pair (two letters at a time), not a binary string through btoa: a large height pack in a fraction of the time
  const t = B64_PAIRS ?? (B64_PAIRS = Array.from({ length: 4096 }, (_, k) => B64[k >> 6]! + B64[k & 63]!)), n3 = b.length - (b.length % 3), parts: string[] = [];
  for (let s = 0; s < n3; s += 0x6000) {
    const e = Math.min(n3, s + 0x6000), row: string[] = [];
    for (let i = s; i < e; i += 3) { const v = (b[i]! << 16) | (b[i + 1]! << 8) | b[i + 2]!; row.push(t[v >> 12]! + t[v & 4095]!); }
    parts.push(row.join(''));
  }
  const r = b.length - n3;
  if (r === 1) { const v = b[n3]! << 16; parts.push(B64[v >> 18]! + B64[(v >> 12) & 63]! + '=='); }
  else if (r === 2) { const v = (b[n3]! << 16) | (b[n3 + 1]! << 8); parts.push(B64[v >> 18]! + B64[(v >> 12) & 63]! + B64[(v >> 6) & 63]! + '='); }
  return parts.join('');
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
let B64_PAIRS: string[] | null = null;
/** base64 text as bytes (throws on text that is not base64) */
export function fromBase64(t: string): Uint8Array {
  const s = atob(t), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b;
}

/** the unit a sample is stored in: 1 cm unless the range needs more than 16 bits */
export const PACK_Q = 0.01;

/** the grid packed (see HeightPack); the heights are held to `unit` metres (1 cm unless a coarser one is asked for, and coarser when the range is over 655 m
 *  at 1 cm), far under the data's own accuracy */
/** T438: the samples (in units of q over base) of each pack made here, so a pack read back in the same visit (the view's course entry from the export
 *  just made) need not be inflated and decoded again. The very object only: a copy (a pack read from a file) is decoded */
export const PACKED = new WeakMap<HeightPack, Int32Array>();
export async function packGrid(g: HeightGrid, unit = PACK_Q, opts: { deflate?: boolean } = {}): Promise<HeightPack> {
  const m = g.m; let lo = Infinity, hi = -Infinity; for (let k = 0; k < m.length; k++) { const v = m[k]!; if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!Number.isFinite(lo)) throw new Error('an empty height grid');
  const q = Math.max(unit, Math.ceil(((hi - lo) / 65000) * 1000) / 1000), base = Math.floor(lo / q) * q, { w, h } = g, n = w * h, u = new Int32Array(n);
  for (let k = 0; k < n; k++) u[k] = Math.round((m[k]! - base) / q);
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const pack: HeightPack = { v: 1, x0: round(g.x0), y0: round(g.y0), step: g.step, w, h, base: Math.round(base * 1000) / 1000, q, d: '' };
  PACKED.set(pack, u);
  if (opts.deflate !== false) await fillPack(pack); else planesOf(u, w, h);   // (the planes even so: a step too big is said now)
  return pack;
}
/** T438: a pack made with { deflate: false } given its text (d) now: the same as packGrid would have made. Nothing for a pack that has its text */
export async function fillPack(p: HeightPack): Promise<void> {
  const u = PACKED.get(p); if (p.d || !u) return;
  p.d = toBase64(await deflateRaw(planesOf(u, p.w, p.h)));
}
/** the samples' residuals from their neighbours' plane, zigzag, low bytes then high bytes */
function planesOf(u: Int32Array, w: number, h: number): Uint8Array {
  const n = w * h, planes = new Uint8Array(2 * n);
  // T438: the first row and column apart, so the rest runs without a test a sample (the same bytes)
  let big = false;
  const put = (k: number, r: number) => { const z = r >= 0 ? 2 * r : -2 * r - 1; planes[k] = z & 255; planes[n + k] = (z >> 8) & 255; if (z > 65535) big = true; }; // zigzag: a small residual of either sign is a small number (|r| < 2^17 for 16-bit units: the third byte is never needed; a residual that big is checked below)
  for (let i = 0; i < w; i++) put(i, u[i]! - (i > 0 ? u[i - 1]! : 0));
  for (let j = 1; j < h; j++) {
    const r0 = j * w; put(r0, u[r0]! - u[r0 - w]!);
    for (let k = r0 + 1, e = r0 + w; k < e; k++) {
      const r = u[k]! - (u[k - 1]! + u[k - w]! - u[k - w - 1]!), z = r >= 0 ? 2 * r : -2 * r - 1;
      planes[k] = z & 255; planes[n + k] = (z >> 8) & 255; if (z > 65535) big = true;
    }
  }
  if (big) throw new Error('a height step too big for the packing');
  return planes;
}

/** a packed grid unpacked; throws on a pack that does not decode (a bad version, size or bytes) */
export async function unpackGrid(p: HeightPack): Promise<HeightGrid> {
  if (!p || p.v !== 1 || !Number.isInteger(p.w) || !Number.isInteger(p.h) || p.w < 1 || p.h < 1 || p.w * p.h > 16_000_000 || !(p.step > 0) || !(p.q > 0)) throw new Error('not a height pack');
  const n = p.w * p.h, planes = await inflate(fromBase64(p.d), 'deflate-raw');
  if (planes.length !== 2 * n) throw new Error('a height pack of the wrong size');
  const u = new Int32Array(n), m = new Float32Array(n), { w, h } = p;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i, z = planes[k]! | (planes[n + k]! << 8), r = z & 1 ? -((z + 1) >> 1) : z >> 1;
      const pred = i > 0 && j > 0 ? u[k - 1]! + u[k - w]! - u[k - w - 1]! : i > 0 ? u[k - 1]! : j > 0 ? u[k - w]! : 0;
      u[k] = pred + r; m[k] = p.base + u[k]! * p.q;
    }
  }
  return { x0: p.x0, y0: p.y0, step: p.step, w, h, m };
}

/** a course's real ground height as a fixture or a download keeps it: the pack, and where it came from (the source's id, the words the card uses, the credit
 *  line), the zoom the tiles were read at, the smoothing's sigma (m) and the date the tiles were fetched */
export interface OsmHeight extends HeightPack { src: string; label: string; credit: string; z: number; sigma: number; fetched: string }

/** the lattice step (m) a smoothed grid is kept at: coarser data needs fewer samples (a Gaussian of sigma 25 m leaves nothing under about 50 m, so 16 m
 *  holds all of it), and the game reads the grid through a cubic, so the coarse lattice costs no facets. 8 m at the least, 48 m at the most */
export const packStepOf = (sigmaM: number): number => Math.max(8, Math.min(48, Math.round((sigmaM * 0.65) / 4) * 4));

// ------------------------------------------------------------------------------------------------------------------------ credits
/** where a stretch of the terrain tiles comes from, and the words the card and the credits use for it */
export interface DemSource { id: string; /** what the card says: "SRTM, 30 m" */ label: string; /** the resolution of the data, m */ res: number; /** the credit line (Tilezen's attribution list) */ credit: string; /** how much to smooth it, m (the Gaussian's sigma) */ sigma: number }

/** the credit for the tiles themselves (every course): Tilezen's terrain tiles on AWS Open Data */
export const DEM_TILES_CREDIT = 'Terrain tiles: Tilezen / Mapzen on AWS Open Data (registry.opendata.aws/terrain-tiles)';

/** Tilezen's required attribution lines (github.com/tilezen/joerd docs/attribution.md), by source */
const USGS = 'United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey';
/** the credit line the gear menu shows for a game with no land of its own: the USGS line, which covers the SRTM and 3DEP the courses the game ships are made from */
export const DEM_CREDIT_DEFAULT = USGS;
const SOURCES: DemSource[] = [
  { id: 'srtm', label: 'SRTM, 30 m', res: 30, credit: USGS, sigma: 25 },
  { id: 'ned', label: 'USGS 3DEP, 10 m', res: 10, credit: USGS, sigma: 8 },
  { id: 'gmted', label: 'GMTED2010, 230 m', res: 230, credit: USGS, sigma: 60 },
  { id: 'ea', label: 'Environment Agency lidar, 2 m', res: 2, credit: 'United Kingdom terrain data © Environment Agency copyright and/or database right 2015. All rights reserved', sigma: 5 },
  { id: 'eudem', label: 'EU-DEM, 25 m', res: 25, credit: 'Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers', sigma: 12 },
  { id: 'cdem', label: 'Canada CDEM, 20 m', res: 20, credit: 'Canada terrain data contains information licensed under the Open Government Licence - Canada', sigma: 10 },
  { id: 'geoscience', label: 'Geoscience Australia, 5 m', res: 5, credit: 'Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017', sigma: 6 },
  { id: 'linz', label: 'LINZ, 8 m', res: 8, credit: 'New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved)', sigma: 7 },
];
/** the generic source for tiles whose imagery list the server did not give, or named something this table does not know: read as 30 m */
const UNKNOWN: DemSource = { id: 'dem', label: 'elevation tiles', res: 30, credit: USGS, sigma: 25 };

/** the source behind a tile's `x-amz-meta-x-imagery-sources` header ("srtm/S26E028.tif", more than one separated by commas): the coarsest source the
 *  tile draws on sets what to trust (a tile that mixes 30 m radar with 10 m 3DEP is smoothed as the 30 m) */
export function demSourceOf(header: string | null | undefined): DemSource {
  const found: DemSource[] = [];
  for (const part of (header ?? '').split(',')) {
    const head = part.trim().toLowerCase().split('/')[0] ?? '';
    if (!head) continue;
    const hit = SOURCES.find(s => head === s.id || head.startsWith(s.id) || (s.id === 'ned' && (head.startsWith('3dep') || head === 'ned13' || head === 'ned19')) || (s.id === 'ea' && (head.startsWith('uk') || head.startsWith('lidar'))) || (s.id === 'geoscience' && head.startsWith('au')));
    if (hit && !found.includes(hit)) found.push(hit);
  }
  if (!found.length) return UNKNOWN;
  return found.reduce((a, b) => (b.res > a.res ? b : a));
}

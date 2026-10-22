import { LEVELS, MID_LEVELS, mulberry } from './iso';
import { canvas, clamp, ctx2d, fbm, smooth, type C2D, type Cnv } from './canvas2d';
import { DEFAULT_MIX, mixGrass, type BaseGrassArt } from './base-grass';
import { EAGER_PHOTO, PHOTO_SIZE, PHOTO_TEX, photoPeriod, type GrassTex, type PhotoTexEntry } from './grass-art';
import { ASPHALT_MEAN, type GroundArt, LEAF_CELL, LEAF_COLS, LEAVES, LOT_ASPHALT_M, POOL_ANCHOR, PPM, SLAB_CELL, SLAB_COUNT, SLAB_TOP } from './ground-art';

/** Ground materials, following the town builder's ground renderer (scripts/lib/town-scene.mjs):
 *  - asphalt: the owner's painted asphalt (flattened), laid in 1.6 m hex patches with random offsets so it never repeats,
 *    baked here into a seamless 24 m texture in GROUND (tile) space; two more copies carry the painting's measured
 *    lamp-light response (manifest.json light.DMU / DSG) at I = 0.4 and I = 0.9 for the reflection pools;
 *  - grass: the two approved 256 px grass paintings mixed in hex patches and by low-frequency noise (screen space);
 *  - curbs and slabs: colours and sprites straight from the kit. */
export type TexName = 'grass' | GrassTex | 'meadow' | 'dirt' | 'rockyDirt' | 'rockyDirtAlt' | 'gravel' | 'roadgravel' | 'field' | 'paving' | 'pad' | 'outside' | 'grime' | 'wear' | 'forest' | 'water' | 'bank' | 'creek' | 'rock';
const PAINTED: TexName[] = ['dirt', 'gravel', 'field', 'paving', 'pad', 'grime', 'wear', 'forest', 'water', 'bank', 'creek', 'rock', 'roadgravel'];
/** screen-space textures are authored at 0.8 px per world px; mip-mapped per cache level */
export const AUTHOR = 0.8;
const K = AUTHOR / 0.6;
/** 20 x 20 tiles: the iso lattice repeats exactly with the texture */
const BASE_W = 2048, BASE_H = 1024;
/** asphalt mosaic: period in tiles, px per tile */
export const MOSAIC_TILES = 12, MOSAIC_PX = 96;
const LEAF = ['#c8561e', '#e08a2a', '#a8321c', '#d9b13b', '#b8451d', '#e6a23a', '#8f2d14', '#f0c040'];

/* manifest.json light response: brightness added (DMU) and local-contrast gain (DSG) per channel, by intensity bucket IB */
const IB = [0, 0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1];
const DMU = [
  [0, 16.76, 46.07, 78.8, 107.09, 134.12, 158.92, 170.35, 189.37, 200.48, 203.72, 203.72],
  [0, 5.94, 15.45, 26.45, 37.96, 52.13, 67.37, 80.68, 109.8, 124.57, 153.05, 153.05],
  [0, -3.62, -11.36, -18.76, -24.21, -26.76, -30.88, -32.08, -19.45, -18.64, -6.87, -6.87]];
const DSG = [
  [0, 8.15, 19.72, 26.77, 29.02, 27.95, 27.86, 32.33, 21.16, 0, 0, 0],
  [0, 3.27, 9.8, 15.27, 20.71, 23.44, 29.76, 37.91, 37.43, 34.72, 25.59, 25.59],
  [0, 0.95, 0.86, 0.55, 1.29, 4.02, 9.32, 16.99, 27.67, 31.84, 34.4, 34.4]];
for (let b = 1; b < IB.length; b++) DSG[0][b] = Math.max(DSG[0][b], Math.min(30, DSG[0][b - 1]));
const LUMA0 = 0.3 * ASPHALT_MEAN[0] + 0.59 * ASPHALT_MEAN[1] + 0.11 * ASPHALT_MEAN[2];
function tbl(t: number[], I: number) { if (I <= 0) return 0; if (I >= 1) return t[t.length - 1]; let i = 1; while (IB[i] < I) i++; const f = (I - IB[i - 1]) / (IB[i] - IB[i - 1]); return t[i - 1] + (t[i] - t[i - 1]) * f; }
/** town-scene.mjs litAsphalt: the painting's response to lamp light at intensity I, applied to one pixel */
function litPixel(c: number[], I: number) {
  const z = clamp((0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2] - LUMA0) / 8.8, -3, 3);
  for (let k = 0; k < 3; k++) c[k] = c[k] + tbl(DMU[k], I) + z * tbl(DSG[k], I);
  if (c[0] > 140) { const k = smooth(140, 200, c[0]); c[1] = Math.min(c[1], c[1] * (1 - k) + c[0] * 0.9 * k); }
  const mx = Math.max(c[0], c[1], c[2]);
  if (mx > 248) { const over = mx - 248, k = 248 / mx; c[0] = c[0] * k + over * 0.42; c[1] = c[1] * k + over * 0.36; c[2] = c[2] * k + over * 0.3; }
  for (let i = 0; i < 3; i++) c[i] = clamp(c[i], 0, 255);
}

export { canvas, ctx2d, type Cnv, type C2D };
async function loadImage(src: string) { const r = await fetch(src); if (!r.ok) throw new Error('image ' + src.slice(0, 40)); return createImageBitmap(await r.blob()); }
function toCanvas(img: ImageBitmap, w = img.width, h = img.height) { const c = canvas(w, h), g = ctx2d(c); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h); return c; }
function downscale(src: Cnv, factor: number) {
  let cur = src;
  const tw = Math.max(1, Math.round(src.width * factor)), th = Math.max(1, Math.round(src.height * factor));
  while (cur.width / tw > 2) {
    const c = canvas(Math.round(cur.width / 2), Math.round(cur.height / 2)), g = ctx2d(c);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, c.width, c.height); cur = c;
  }
  const out = canvas(tw, th), g = ctx2d(out);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, tw, th);
  return out;
}
/* ---------------- painted screen-space terrain (dirt, gravel, field, paving, pads) ---------------- */
type Draw = (x: number, y: number) => void;
function wrap(x: number, y: number, m: number, draw: Draw) {
  for (const ox of [-BASE_W, 0, BASE_W]) for (const oy of [-BASE_H, 0, BASE_H]) { const X = x + ox, Y = y + oy; if (X > -m && X < BASE_W + m && Y > -m && Y < BASE_H + m) draw(X, Y); }
}
function patches(ctx: C2D, r: () => number, n: number, colors: string[], rmin: number, rmax: number) {
  for (let i = 0; i < n; i++) {
    const x = r() * BASE_W, y = r() * BASE_H, rad = (rmin + r() * (rmax - rmin)) * K, col = colors[(r() * colors.length) | 0];
    wrap(x, y, rad * 1.2, (X, Y) => { ctx.save(); ctx.translate(X, Y); ctx.scale(1, 0.5); const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad); g.addColorStop(0, col); g.addColorStop(1, col.slice(0, 7) + '00'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
  }
}
function speckle(ctx: C2D, r: () => number, n: number, cols: string[]) { for (let i = 0; i < n * K * K; i++) { ctx.fillStyle = cols[(r() * cols.length) | 0]; ctx.fillRect((r() * BASE_W) | 0, (r() * BASE_H) | 0, 1, 1); } }
function blades(ctx: C2D, r: () => number, n: number, cols: string[]) {
  for (let i = 0; i < n * K * K; i++) { const x = (r() * BASE_W) | 0, y = (r() * BASE_H) | 0, hgt = Math.round((2 + r() * 3) * K); ctx.fillStyle = cols[(r() * cols.length) | 0]; wrap(x, y, 8, (X, Y) => ctx.fillRect(X, Y - hgt, 1, hgt)); }
}
function leaf(ctx: C2D, x: number, y: number, rot: number, len: number, col: string) {
  const w = len * 0.45, shape = () => { ctx.beginPath(); ctx.moveTo(-len, 0); ctx.quadraticCurveTo(0, -w * 1.9, len, 0); ctx.quadraticCurveTo(0, w * 1.9, -len, 0); ctx.closePath(); };
  ctx.save(); ctx.translate(x + 1.4 * K, y + 1.6 * K); ctx.scale(1, 0.55); ctx.rotate(rot); ctx.fillStyle = 'rgba(5,5,15,0.4)'; shape(); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.55); ctx.rotate(rot); ctx.fillStyle = col; shape(); ctx.fill(); ctx.restore();
}
function leaves(ctx: C2D, r: () => number, n: number) { for (let i = 0; i < n * K * K; i++) { const x = r() * BASE_W, y = r() * BASE_H, rot = r() * Math.PI, len = (6 + r() * 4) * K, col = LEAF[(r() * LEAF.length) | 0]; wrap(x, y, 16 * K, (X, Y) => leaf(ctx, X, Y, rot, len, col)); } }
function pebbles(ctx: C2D, r: () => number, n: number, cols: string[], rmin: number, rmax: number) {
  for (let i = 0; i < n * K * K; i++) {
    const x = r() * BASE_W, y = r() * BASE_H, rx = (rmin + r() * (rmax - rmin)) * K, ry = rx * (0.55 + r() * 0.25), col = cols[(r() * cols.length) | 0];
    wrap(x, y, 6, (X, Y) => { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(X + 0.5, Y + 0.7, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(X, Y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(X - rx * 0.3, Y - ry * 0.3, rx * 0.4, ry * 0.35, 0, 0, Math.PI * 2); ctx.fill(); });
  }
}
function cracks(ctx: C2D, r: () => number, n: number, color: string, width: number) {
  ctx.strokeStyle = color; ctx.lineWidth = width * K; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = r() * BASE_W, y = r() * BASE_H, segs = 5 + ((r() * 7) | 0), pts: [number, number][] = [[0, 0]]; let px = 0, py = 0, dir = r() * Math.PI * 2;
    for (let s = 0; s < segs; s++) { dir += (r() - 0.5) * 1.6; px += Math.cos(dir) * (6 + r() * 12) * K; py += Math.sin(dir) * (3 + r() * 6) * K; pts.push([px, py]); }
    wrap(x, y, 160, (X, Y) => { ctx.beginPath(); pts.forEach(([a, b], k) => (k ? ctx.lineTo(X + a, Y + b) : ctx.moveTo(X + a, Y + b))); ctx.stroke(); });
  }
}
/** water ripples: short, nearly horizontal light strokes */
function ripples(ctx: C2D, r: () => number, n: number, cols: string[]) {
  ctx.lineCap = 'round';
  for (let i = 0; i < n * K * K; i++) {
    const x = r() * BASE_W, y = r() * BASE_H, len = (8 + r() * 34) * K, ang = (r() - 0.5) * 0.3, bow = (r() - 0.5) * 3 * K;
    ctx.strokeStyle = cols[(r() * cols.length) | 0]; ctx.lineWidth = (0.6 + r() * 0.9) * K;
    const dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2;
    wrap(x, y, len, (X, Y) => { ctx.beginPath(); ctx.moveTo(X - dx, Y - dy); ctx.quadraticCurveTo(X, Y + bow, X + dx, Y + dy); ctx.stroke(); });
  }
}
function isoAuthor(ctx: C2D) { ctx.setTransform(64 * AUTHOR, 32 * AUTHOR, -64 * AUTHOR, 32 * AUTHOR, 0, 0); }
function gen(name: TexName): Cnv {
  const c = canvas(BASE_W, BASE_H), ctx = ctx2d(c), r = mulberry(PAINTED.indexOf(name) * 7919 + 17);
  switch (name) {
    case 'dirt': ctx.fillStyle = '#56402f'; ctx.fillRect(0, 0, BASE_W, BASE_H); patches(ctx, r, 260, ['#2e201655', '#8a644044', '#3d2c2255'], 40, 120); speckle(ctx, r, 22000, ['#4a3628', '#624a36', '#3e2d22', '#6e5440', '#523c2d']); pebbles(ctx, r, 420, ['#7a7068', '#6b6058', '#8a8078'], 1.2, 2.6); leaves(ctx, r, 90); break;
    case 'gravel': ctx.fillStyle = '#5b5752'; ctx.fillRect(0, 0, BASE_W, BASE_H); patches(ctx, r, 200, ['#3a373355', '#7c766e33'], 40, 110); pebbles(ctx, r, 9000, ['#6b6660', '#49453f', '#7c766e', '#3c3935', '#857f76', '#5d5953'], 0.9, 2.2); leaves(ctx, r, 60); break;
    case 'roadgravel': ctx.fillStyle = '#62574a'; ctx.fillRect(0, 0, BASE_W, BASE_H); patches(ctx, r, 200, ['#8d7f6646', '#a0927644'], 40, 130); patches(ctx, r, 120, ['#3f362b55', '#4b41345a'], 30, 100); speckle(ctx, r, 26000, ['#574d40', '#74685a', '#4a4136', '#857865', '#6a5e4e']); pebbles(ctx, r, 5200, ['#8a7f6e', '#5e5446', '#a09482', '#4c4338', '#77695a'], 0.9, 2.4); leaves(ctx, r, 30); break;
    case 'forest': ctx.fillStyle = '#3a2a1c'; ctx.fillRect(0, 0, BASE_W, BASE_H); patches(ctx, r, 240, ['#1e140c66', '#3c4a2244', '#6a4a2444'], 40, 140); speckle(ctx, r, 18000, ['#2e2016', '#4a3524', '#3a2c1c', '#55402a']); cracks(ctx, r, 120, 'rgba(30,20,12,0.55)', 0.9); pebbles(ctx, r, 120, ['#5a5048', '#6a6058'], 1.0, 2.0); leaves(ctx, r, 420); break;
    case 'water': ctx.fillStyle = '#14283a'; ctx.fillRect(0, 0, BASE_W, BASE_H); patches(ctx, r, 160, ['#0c1a2a66', '#1e3a5044', '#24485a33'], 60, 200); ripples(ctx, r, 1400, ['rgba(120,160,190,0.10)', 'rgba(120,160,190,0.18)', 'rgba(150,185,210,0.25)', 'rgba(10,20,32,0.35)']); break;
    case 'bank': ctx.fillStyle = '#3b3226'; ctx.fillRect(0, 0, BASE_W, BASE_H); patches(ctx, r, 220, ['#2a231a66', '#4e443455', '#2f3a2a44'], 40, 120); speckle(ctx, r, 20000, ['#342c22', '#463c2e', '#2c251c', '#524636']); pebbles(ctx, r, 900, ['#6a645c', '#57524a', '#7a746a'], 0.9, 2.2); blades(ctx, r, 1500, ['#4a5a2a', '#5e6a30', '#3a4622']); leaves(ctx, r, 80); break;
    case 'creek': ctx.fillStyle = '#3a3832'; ctx.fillRect(0, 0, BASE_W, BASE_H); patches(ctx, r, 180, ['#24221e66', '#5a564c44'], 30, 90); speckle(ctx, r, 8000, ['#2e2c28', '#4a4740']); pebbles(ctx, r, 6000, ['#6e6a62', '#55514a', '#807a70', '#45423c', '#8e887c'], 1.0, 3.2); leaves(ctx, r, 40); break;
    case 'rock': ctx.fillStyle = '#4a4640'; ctx.fillRect(0, 0, BASE_W, BASE_H); patches(ctx, r, 220, ['#2a272366', '#6a645a44', '#3e4a3044'], 30, 110); cracks(ctx, r, 260, 'rgba(20,18,16,0.6)', 1.1); cracks(ctx, r, 120, 'rgba(150,140,125,0.25)', 0.7); pebbles(ctx, r, 500, ['#6a655c', '#7c766a', '#55514a'], 1.2, 3.0); speckle(ctx, r, 12000, ['#3c3934', '#5a5650', '#46423c']); leaves(ctx, r, 60); break;
    case 'field': {
      ctx.fillStyle = '#5a4a2e'; ctx.fillRect(0, 0, BASE_W, BASE_H); patches(ctx, r, 200, ['#3a2c1a55', '#8a743e3a'], 40, 120);
      ctx.save(); isoAuthor(ctx);
      for (let v = -21; v <= 21; v += 0.5) { ctx.strokeStyle = 'rgba(40,28,14,0.55)'; ctx.lineWidth = 0.14; ctx.beginPath(); ctx.moveTo(-1, v); ctx.lineTo(42, v); ctx.stroke(); ctx.strokeStyle = 'rgba(150,125,70,0.22)'; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.moveTo(-1, v + 0.2); ctx.lineTo(42, v + 0.2); ctx.stroke(); }
      ctx.restore(); speckle(ctx, r, 14000, ['#4e3f26', '#6a5634', '#3f3220', '#7a6640']); blades(ctx, r, 3000, ['#8a7a3a', '#a08a44', '#6a5a2a']); break;
    }
    case 'paving': {
      ctx.fillStyle = '#a89c8c'; ctx.fillRect(0, 0, BASE_W, BASE_H); ctx.save(); isoAuthor(ctx);
      for (let u = -1; u <= 42; u++) for (let v = -22; v <= 22; v++) { const a = (((u + v) % 40) + 40) % 40, b = (((u - v) % 40) + 40) % 40, h = mulberry(a * 97 + b * 13 + 5)(); ctx.fillStyle = h < 0.33 ? 'rgba(255,245,230,0.10)' : h < 0.66 ? 'rgba(60,50,40,0.10)' : 'rgba(150,130,110,0.08)'; ctx.fillRect(u, v, 1, 1); }
      ctx.strokeStyle = 'rgba(50,40,30,0.5)'; ctx.lineWidth = 0.035;
      for (let k = -24; k <= 44; k++) { ctx.beginPath(); ctx.moveTo(k, -25); ctx.lineTo(k, 25); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-5, k); ctx.lineTo(45, k); ctx.stroke(); }
      ctx.restore(); speckle(ctx, r, 9000, ['#9c9080', '#b4a898', '#8e8274']); leaves(ctx, r, 50); break;
    }
    case 'pad': ctx.fillStyle = '#b9ada0'; ctx.fillRect(0, 0, BASE_W, BASE_H); patches(ctx, r, 200, ['#8a7e7044', '#d0c4b633'], 40, 120); speckle(ctx, r, 12000, ['#ada194', '#c4b8aa', '#9e9286']); cracks(ctx, r, 10, 'rgba(70,60,50,0.35)', 0.8); leaves(ctx, r, 40); break;
    case 'grime': {
      // town-scene.mjs grime(): blots of fbm plus specks, as a multiply layer for the sidewalk slabs (STAIN = .84 .78 .72)
      const blot = fbm(95, BASE_W, BASE_H, 14, 4), speck = fbm(97, BASE_W, BASE_H, 110, 2), d = ctx.createImageData(BASE_W, BASE_H), D = d.data;
      for (let y = 0; y < BASE_H; y++) for (let x = 0; x < BASE_W; x++) { const st = clamp(smooth(0.36, 0.64, blot(x, y)) * 0.8 + smooth(0.5, 0.8, speck(x, y)) * 0.3, 0, 1), o = (y * BASE_W + x) * 4; D[o] = 255 * (1 - 0.16 * st); D[o + 1] = 255 * (1 - 0.22 * st); D[o + 2] = 255 * (1 - 0.28 * st); D[o + 3] = 255; }
      ctx.putImageData(d, 0, 0); break;
    }
    case 'wear': {
      // chipped paint for road markings: mostly opaque, with worn holes (town-scene.mjs wear())
      const chip = fbm(61, BASE_W, BASE_H, 160, 3), gap = fbm(63, BASE_W, BASE_H, 18, 2), d = ctx.createImageData(BASE_W, BASE_H), D = d.data;
      for (let y = 0; y < BASE_H; y++) for (let x = 0; x < BASE_W; x++) { const a = (0.35 + 0.65 * smooth(0.22, 0.4, chip(x, y))) * (0.55 + 0.45 * smooth(0.2, 0.3, gap(x, y))), o = (y * BASE_W + x) * 4; D[o] = D[o + 1] = D[o + 2] = 255; D[o + 3] = clamp(a, 0, 1) * 255; }
      ctx.putImageData(d, 0, 0); break;
    }
    default: break;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

/** bare-soil stamps (town-scene.mjs soil patches): an ellipse of radius SOIL_R world px across and half that down, ragged by
 *  noise and feathered, the soil painting at 80% inside; SOIL_W x SOIL_H each, at the authoring scale 1 world px per px */
export const SOIL_STAMPS = 4, SOIL_R = 100, SOIL_W = 3.2 * SOIL_R, SOIL_H = 1.6 * SOIL_R;
export function soilStamps(soil: Cnv) {
  const c = canvas(SOIL_W * SOIL_STAMPS, SOIL_H), g = ctx2d(c);
  g.fillStyle = g.createPattern(soil, 'repeat')!; g.fillRect(0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height), D = d.data;
  for (let k = 0; k < SOIL_STAMPS; k++) {
    const n = fbm(311 + k * 7, SOIL_W, SOIL_H, 8, 3);
    for (let y = 0; y < SOIL_H; y++) for (let x = 0; x < SOIL_W; x++) {
      const dx = (x - SOIL_W / 2) / SOIL_R, dy = (y - SOIL_H / 2) / (SOIL_R * 0.5), e = smooth(1.05, 0.7, Math.hypot(dx, dy) + (n(x, y) - 0.5) * 0.9);
      D[(y * c.width + k * SOIL_W + x) * 4 + 3] = e * 0.8 * 255;
    }
  }
  g.putImageData(d, 0, 0); return c;
}
/** the car-park asphalt (town-scene.mjs lotAsphalt): soft overlapping 4.5-tile patches of the 28 m painting at random windows,
 *  over the MOSAIC_TILES period in tile space like the road mosaic; its own large-scale tone is the variation */
function lotMosaic(src: Cnv) {
  const S = MOSAIC_TILES * MOSAIC_PX, c = canvas(S, S), g = ctx2d(c), scale = MOSAIC_PX / 2 / (src.width / LOT_ASPHALT_M);
  const d0 = ctx2d(src).getImageData(0, 0, src.width, src.height).data, mean = [0, 0, 0];
  for (let i = 0; i < d0.length; i += 4) for (let k = 0; k < 3; k++) mean[k] += d0[i + k] / (d0.length / 4);
  g.fillStyle = `rgb(${mean.map(Math.round).join(',')})`; g.fillRect(0, 0, S, S);
  const n = 3, sp = S / n, R = sp * 0.85, P = Math.ceil(2 * R) + 2, patch = canvas(P, P), pg = ctx2d(patch), soft = canvas(P, P), r = mulberry(5150);
  { const sg = ctx2d(soft), gr = sg.createRadialGradient(P / 2, P / 2, 0, P / 2, P / 2, R); gr.addColorStop(0, '#000'); gr.addColorStop(0.45, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = gr; sg.fillRect(0, 0, P, P); }
  const W = src.width * scale, H = src.height * scale;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const ox = R + r() * Math.max(1, W - 2 * R), oy = R + r() * Math.max(1, H - 2 * R);
    pg.globalCompositeOperation = 'source-over'; pg.clearRect(0, 0, P, P); pg.drawImage(src, P / 2 - ox, P / 2 - oy, W, H);
    pg.globalCompositeOperation = 'destination-in'; pg.drawImage(soft, 0, 0);
    const X = (i + 0.5 + (j & 1 ? 0.5 : 0)) * sp - P / 2, Y = (j + 0.5) * sp - P / 2;
    for (const wx of [-S, 0, S]) for (const wy of [-S, 0, S]) { const x = X + wx, y = Y + wy; if (x > -P && x < S && y > -P && y < S) g.drawImage(patch, x, y); }
  }
  return c;
}

export interface CurbColours { joint: string; top: string; face: string[]; gutter: string[]; faceHidden: string }
export interface LeafSprite { i: number; dim: number; round: boolean }

/** a photo's source period in tiles (its full-resolution canvas repeats over it): a mixed photo covers its p.mix metres (PHOTO_SIZE bigger, 2 m tiles), a plain one its own period */
const photoSrcPeriod = (p: PhotoTexEntry) => (p.mix > 0 ? p.mix * PHOTO_SIZE / 2 : photoPeriod(p, MOSAIC_TILES));

export class Textures {
  mips = new Map<string, Cnv>();
  /** asphalt mosaics in tile space, by variant ('base' | 'lit1' | 'lit2') and mip (px per tile) */
  mosaics = new Map<string, Cnv[]>();
  /** the period in tiles of each photo texture (photoPeriod: MOSAIC_TILES unless it is a plain tile with its own), and the lazy builds in progress */
  periods = new Map<string, number>(PHOTO_TEX.map(p => [p.tex, photoPeriod(p, MOSAIC_TILES)]));
  /** the photo textures this worker can build: grass-art.ts PHOTO_TEX and the owner's texture presets (paint-presets-saved.ts, sent with the art) */
  photos: PhotoTexEntry[] = PHOTO_TEX;
  /** each built photo's full-resolution source canvas (sourceFor: a large Paint scale shows it, not the mosaic) */
  photoSrc = new Map<string, Cnv>();
  private photoBuilds = new Map<string, Promise<void>>();
  slabs!: Cnv; leaves!: Cnv; pool1!: Cnv; pool2!: Cnv;
  /** the builder's grass decals (ground-art DECALS rects) and SOIL_STAMPS ragged bare-soil stamps in a row (SOIL_W x SOIL_H each) */
  decals!: Cnv; soil!: Cnv;
  /** how the base grass (and the meadow and map edge made from it) lies on the ground: the owner's angle and tilt (base-grass.ts GrassMix) */
  grassLay = { angle: DEFAULT_MIX.angle, tilt: DEFAULT_MIX.tilt };
  /** the builder's flat ground decals (lot-decals.ts LOT_DECALS rects) the Lot Composer lays in lots */
  lotDecals!: Cnv;
  /** the nature patches (nature-patches.ts NATURE rects) scattered over open grass */
  nature!: Cnv;
  /** screen direction (radians) of the pool stamp's streak for a road running along world X (town-scene.mjs stampAngle) */
  stampAngle = 0;
  curb: CurbColours = { joint: '#8a6a48', top: '#f0dfbe', face: ['#dcc29a', '#c8a876', '#a98652'], gutter: ['#1a1620', '#2a2430', '#3a3444'], faceHidden: '#d8c6a0' };
  leafSprites: LeafSprite[] = LEAVES.filter(l => !l.round).sort((a, b) => a.dim - b.dim);
  roundSprites: LeafSprite[] = LEAVES.filter(l => l.round).sort((a, b) => a.dim - b.dim);
  private store(name: TexName, base: Cnv) { for (const L of [...LEVELS, ...MID_LEVELS]) if (!this.mips.has(name + '@' + L)) this.mips.set(name + '@' + L, downscale(base, L / AUTHOR)); }

  async build(art: GroundArt & { grassMix?: BaseGrassArt; presets?: PhotoTexEntry[] }, progress?: (p: number) => void) {
    if (art.presets?.length) { this.photos = [...PHOTO_TEX, ...art.presets]; for (const p of art.presets) this.periods.set(p.tex, photoPeriod(p, MOSAIC_TILES)); }
    const yieldNow = () => new Promise(res => setTimeout(res, 0));
    const steps = PAINTED.length + 12 + EAGER_PHOTO.size; let done = 0; const tick = async () => { progress?.(++done / steps); await yieldNow(); };
    const [asA, asB, curbV, curbH, pool, slabs, grassA, grassB, leafImg, soilImg, decalImg, lotImg, lotDecalImg, natureImg, rockyDirtImg, rockyDirtAltImg] = await Promise.all([art.asphaltA, art.asphaltB, art.curbVisible, art.curbHidden, art.pool, art.slabs, art.grassA, art.grassB, art.leaves, art.soil, art.decals, art.lotAsphalt, art.lotDecals, art.nature, art.rockyDirt, art.rockyDirtAlt].map(loadImage));
    this.slabs = toCanvas(slabs); this.leaves = toCanvas(leafImg); this.decals = toCanvas(decalImg); this.soil = soilStamps(toCanvas(soilImg)); this.lotDecals = toCanvas(lotDecalImg); this.nature = toCanvas(natureImg);
    await tick();
    for (const name of PAINTED) { this.store(name, gen(name)); await tick(); }
    // The seamless square paintings are compressed vertically for the isometric ground plane.
    // Store every mip through the same path as other painted materials, including worker snapshots.
    this.store('rockyDirt', toCanvas(rockyDirtImg, Math.round(rockyDirtImg.width * AUTHOR), Math.round(rockyDirtImg.height * AUTHOR / 2))); await tick();
    this.store('rockyDirtAlt', toCanvas(rockyDirtAltImg, Math.round(rockyDirtAltImg.width * AUTHOR), Math.round(rockyDirtAltImg.height * AUTHOR / 2))); await tick();
    // ---- asphalt mosaics: one seed layout, three paintings (unlit, lit 0.4, lit 0.9)
    const srcA = toCanvas(asA), srcB = toCanvas(asB);
    const lit = (src: Cnv, I: number) => {
      const c = canvas(src.width, src.height), g = ctx2d(c); g.drawImage(src, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height), D = d.data, px = [0, 0, 0];
      for (let i = 0; i < D.length; i += 4) { px[0] = D[i]; px[1] = D[i + 1]; px[2] = D[i + 2]; litPixel(px, I); D[i] = px[0]; D[i + 1] = px[1]; D[i + 2] = px[2]; }
      g.putImageData(d, 0, 0); return c;
    };
    const seeds = this.mosaicSeeds();
    this.mosaics.set('base', this.mipChain(this.mosaic(seeds, srcA, srcB))); await tick();
    this.mosaics.set('lit1', this.mipChain(this.mosaic(seeds, lit(srcA, 0.4), lit(srcB, 0.4)))); await tick();
    this.mosaics.set('lit2', this.mipChain(this.mosaic(seeds, lit(srcA, 0.9), lit(srcB, 0.9)))); await tick();
    this.mosaics.set('lot', this.mipChain(lotMosaic(toCanvas(lotImg)))); await tick();
    // ---- grass: hex-mixed paintings with low-frequency tone, in screen space
    // the base grass: the owner's mix and picture sizes when the studio's Ground tab saved them (art.grassMix), else the game's original
    const gm = art.grassMix, pa = Math.round((gm?.px[0] ?? 256) * AUTHOR), pb = Math.round((gm?.px[1] ?? 256) * AUTHOR);
    const grass = mixGrass(toCanvas(grassA, pa, pa), toCanvas(grassB, pb, pb), gm?.mix ?? DEFAULT_MIX, BASE_W, BASE_H, AUTHOR);
    this.store('grass', grass); this.grassLay = { angle: gm?.mix.angle ?? DEFAULT_MIX.angle, tilt: gm?.mix.tilt ?? DEFAULT_MIX.tilt };
    // ---- the Paint tool's photo textures that every worker needs (grasses, concrete): built here; the others are built by ensure() on first use
    for (const p of PHOTO_TEX) if (EAGER_PHOTO.has(p.tex)) { await this.buildPhoto(p); await tick(); }
    { const c = canvas(BASE_W, BASE_H), g = ctx2d(c); g.drawImage(grass, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#b9a98a'; g.fillRect(0, 0, BASE_W, BASE_H); this.store('meadow', c); }
    { const c = canvas(BASE_W, BASE_H), g = ctx2d(c); g.drawImage(grass, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#8c8c86'; g.fillRect(0, 0, BASE_W, BASE_H); this.store('outside', c); }
    await tick();
    // ---- curb colours from the kit's strips (rows: hidden 0.5-4 joint, 4-10.5 top; visible 10-20.5 face, 20.5+ gutter)
    const rows = (img: ImageBitmap) => { const c = toCanvas(img), g = ctx2d(c), d = g.getImageData(0, 0, c.width, c.height).data, out: number[][] = []; for (let y = 0; y < c.height; y++) { let r = 0, gg = 0, b = 0, n = 0; for (let x = 0; x < c.width; x++) { const o = (y * c.width + x) * 4; if (d[o + 3] < 128) continue; r += d[o]; gg += d[o + 1]; b += d[o + 2]; n++; } out.push(n ? [r / n, gg / n, b / n] : [0, 0, 0]); } return out; };
    const rv = rows(curbV), rh = rows(curbH), avg = (rs: number[][], a: number, b: number) => { const s = [0, 0, 0]; let n = 0; for (let y = Math.max(0, a); y < Math.min(rs.length, b); y++) { for (let k = 0; k < 3; k++) s[k] += rs[y][k]; n++; } return `rgb(${s.map(v => Math.round(v / (n || 1))).join(',')})`; };
    this.curb = { joint: avg(rh, 0, 4), top: avg(rh, 4, 10), faceHidden: avg(rh, 4, 10), face: [avg(rv, 10, 14), avg(rv, 14, 18), avg(rv, 18, 21)], gutter: [avg(rv, 21, 24), avg(rv, 24, 28), avg(rv, 28, 34)] };
    // ---- pool stamp: two masks for the piecewise light response, plus the streak direction
    { const c = toCanvas(pool), g = ctx2d(c), d = g.getImageData(0, 0, c.width, c.height), D = d.data, W = c.width;
      let sx = 0, sy = 0, sw = 0;
      const m1 = g.createImageData(W, c.height), m2 = g.createImageData(W, c.height);
      for (let v = 0; v < c.height; v++) for (let u = 0; u < W; u++) {
        const o = (v * W + u) * 4, a = D[o + 3] / 255;
        const du = (u - POOL_ANCHOR[0]) / PPM, dv = (v - POOL_ANCHOR[1]) / PPM;
        if (a > 0 && dv > 0) { const w = a * a; sx += w * 32 * (du - dv); sy += w * 16 * (du + dv); sw += w; }
        m1.data[o] = m1.data[o + 1] = m1.data[o + 2] = 255; m1.data[o + 3] = Math.min(a, 0.4) / 0.4 * 255;
        m2.data[o] = m2.data[o + 1] = m2.data[o + 2] = 255; m2.data[o + 3] = clamp((a - 0.4) / 0.5, 0, 1) * 255;
      }
      this.stampAngle = Math.atan2(sy / (sw || 1), sx / (sw || 1));
      this.pool1 = canvas(W, c.height); ctx2d(this.pool1).putImageData(m1, 0, 0);
      this.pool2 = canvas(W, c.height); ctx2d(this.pool2).putImageData(m2, 0, 0);
    }
    await tick();
  }
  /** 1.6 m hex lattice over the 24 m period: seed positions (tiles), painting choice and a random window into it */
  private mosaicSeeds() {
    const HEX = 0.8, cols = Math.round(MOSAIC_TILES / HEX), rows = Math.round(MOSAIC_TILES / (HEX * Math.SQRT1_2 * 1.2247)), dx = MOSAIC_TILES / cols, dy = MOSAIC_TILES / rows;
    const r = mulberry(4242), out: { x: number; y: number; b: boolean; u: number; v: number; rot: number }[] = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) out.push({ x: (i + 0.5 + (j & 1 ? 0.5 : 0)) * dx, y: (j + 0.5) * dy, b: r() > 0.6, u: r(), v: r(), rot: 0 });
    for (let i = out.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  /** soft-edged, overlapping patches of the painting stamped in a staggered hex grid so neighbouring patches blend into each other rather than meeting at hard seams. All patches share the builder's flattened mean tone so overlaps never drift in brightness. */
  private mosaic(seeds: ReturnType<Textures['mosaicSeeds']>, a: Cnv, b: Cnv, fill?: string, px = MOSAIC_PX, srcPPM = PPM) {
    const S = MOSAIC_TILES * px, c = canvas(S, S), g = ctx2d(c);
    // one patch covers ~1.6 tiles so neighbours overlap; feather spans most of the overlap band
    const R = 0.82 * px, feather = 0.5 * px, P = Math.ceil(R * 2) + 2;
    const patch = canvas(P, P), pg = ctx2d(patch), scale = px / 2 / srcPPM;
    const soft = canvas(P, P); { const sg = ctx2d(soft), gr = sg.createRadialGradient(P / 2, P / 2, 0, P / 2, P / 2, R); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.35, 'rgba(0,0,0,1)'); gr.addColorStop(0.35 + feather / R, 'rgba(0,0,0,0)'); sg.fillStyle = gr; sg.fillRect(0, 0, P, P); }
    g.fillStyle = fill ?? `rgb(${ASPHALT_MEAN.map(Math.round).join(',')})`; g.fillRect(0, 0, S, S);
    for (const s of seeds) {
      const img = s.b ? b : a, W = img.width * scale, H = img.height * scale, m = R + 2;
      const ox = m + s.u * Math.max(1, W - 2 * m), oy = m + s.v * Math.max(1, H - 2 * m);
      pg.globalCompositeOperation = 'source-over'; pg.clearRect(0, 0, P, P);
      pg.drawImage(img, P / 2 - ox, P / 2 - oy, W, H);
      pg.globalCompositeOperation = 'destination-in'; pg.drawImage(soft, 0, 0);
      const X = s.x * px - P / 2, Y = s.y * px - P / 2;
      for (const wx of [-S, 0, S]) for (const wy of [-S, 0, S]) { const x = X + wx, y = Y + wy; if (x > -P && x < S && y > -P && y < S) g.drawImage(patch, x, y); }
    }
    // a whisper of extra grain over the whole period so adjacent patches feel like one painted surface
    const d = g.getImageData(0, 0, S, S), D = d.data, rr = mulberry(881);
    for (let i = 0; i < D.length; i += 4) { const n = (rr() - 0.5) * 4; D[i] = clamp(D[i] + n, 0, 255); D[i + 1] = clamp(D[i + 1] + n * 0.75, 0, 255); D[i + 2] = clamp(D[i + 2] + n * 0.5, 0, 255); }
    g.putImageData(d, 0, 0);
    return c;
  }
  private mipChain(c: Cnv) { const out = [c]; while (out[out.length - 1].width > 96) out.push(downscale(out[out.length - 1], 0.5)); return out; }
  /** the asphalt mosaic mip for a cache level (screen px per world px): never upsampled */
  mosaicFor(variant: string, L: number) {
    const chain = this.mosaics.get(variant)!, period = this.periodOf(variant), want = 128 * L; let pick = chain[0];
    for (const m of chain) { if (m.width / period >= want) pick = m; else break; }
    return pick;
  }
  /** the period in tiles of a ground texture in tile space (MOSAIC_TILES unless it is a plain photo with its own) */
  periodOf(variant: string) { return this.periods.get(variant) ?? MOSAIC_TILES; }
  /** the photos' own mip chains (the source halved down to 96 px), made on first use from photoSrc */
  private photoMips = new Map<string, Cnv[]>();
  /** a Paint area's photo at scale L (cache level times area scale): the smallest mip of the photo itself with the px a tile L asks for, and
   *  its period in tiles. The Paint areas always draw this, never the hex-mixed mosaic: the mosaic is 128 px a tile (the photo has ~500)
   *  and its feathered patches blend, so a Paint area at scale 1 or below looked soft and smeared (the owner, 2026-10-21). null: no photo */
  sourceFor(variant: string, L: number): { img: Cnv; period: number } | null {
    const src = this.photoSrc.get(variant); if (!src) return null;
    let chain = this.photoMips.get(variant); if (!chain) this.photoMips.set(variant, chain = this.mipChain(src));
    const period = photoSrcPeriod(this.photos.find(q => q.tex === variant)!), want = 128 * L; let img = chain[0];
    for (const m of chain) { if (m.width / period >= want) img = m; else break; }
    return { img, period };
  }
  /** true when a tile-space texture is built in this worker (the eager ones always are; a lazy photo once ensure has run) */
  has(variant: string) { return this.mosaics.has(variant); }
  /** builds a lazy photo texture (grass-art.ts PHOTO_TEX) the first time an area uses it; concurrent calls share one build;
   *  a name that is not a photo, or is built already, resolves at once */
  ensure(variant: string): Promise<void> {
    if (this.has(variant)) return Promise.resolve();
    const p = this.photos.find(q => q.tex === variant);
    if (!p) return Promise.resolve();
    let b = this.photoBuilds.get(variant);
    if (!b) this.photoBuilds.set(variant, b = this.buildPhoto(p).finally(() => this.photoBuilds.delete(variant)));
    return b;
  }
  /** a photo texture's mip chain in tile space: hex-mixed over MOSAIC_TILES when p.mix > 0 (p.px pixels a tile, the photo's p.mix metres), else the plain photo as its period */
  private async buildPhoto(p: PhotoTexEntry) {
    const c = toCanvas(await loadImage(p.src));
    // mixed: the ground under the patches' feathered edges is the photo's own mean colour, not the asphalt's
    const mean = () => { const d = ctx2d(c).getImageData(0, 0, c.width, c.height).data, s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; } return `rgb(${s.map(v => Math.round(v / (d.length / 4))).join(',')})`; };
    // mixed: p.px pixels per tile (160 by default: 80 px/m over the 24 m period), the photo's p.mix metres (PHOTO_SIZE bigger) scaled to that; plain: the photo is the period
    this.photoSrc.set(p.tex, c);
    this.mosaics.set(p.tex, this.mipChain(p.mix > 0 ? this.mosaic(this.mosaicSeeds(), c, c, mean(), p.px ?? 160, c.width / (p.mix * PHOTO_SIZE)) : c));
  }
  image(name: TexName, L: number) { return this.mips.get(name + '@' + L)!; }
  /** town-scene.mjs pickLeaf: the smallest sprite that is at least 1.15x the wanted size, then one of the next few */
  pickLeaf(r: () => number, sizeM: number) {
    const want = sizeM * 45.25 * 1.15, pool = sizeM < 0.2 && r() < 0.7 ? this.roundSprites : this.leafSprites;
    let lo = 0, hi = pool.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (pool[mid].dim < want) lo = mid + 1; else hi = mid; }
    return pool[Math.min(pool.length - 1, lo + Math.floor(r() * Math.min(6, pool.length - lo)))].i;
  }
  slabRect(i: number): [number, number, number, number] { return [i * SLAB_CELL[0], 0, SLAB_CELL[0], SLAB_CELL[1]]; }
  /** slab sprite index: the camera-facing row ('top') for visible curbs */
  slabIndex(visible: boolean, key: number) { return visible ? Math.floor(key * SLAB_TOP) : SLAB_TOP + Math.floor(key * (SLAB_COUNT - SLAB_TOP)); }
  leafRect(i: number): [number, number, number, number] { return [(i % LEAF_COLS) * LEAF_CELL, Math.floor(i / LEAF_COLS) * LEAF_CELL, LEAF_CELL, LEAF_CELL]; }
}

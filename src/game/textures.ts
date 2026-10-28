import { LEVELS, MID_LEVELS, mulberry } from './iso';
import { canvas, clamp, ctx2d, fbm, fbmRows, smooth, type C2D, type Cnv } from './canvas2d';
import { DEFAULT_MIX, mixGrass, type BaseGrassArt } from './base-grass';
import { EAGER_PHOTO, PHOTO_SIZE, PHOTO_TEX, photoPeriod, type GrassTex, type PhotoTexEntry } from './grass-art';
import { paintedUrl, VARIANT_SETS } from './painted-grass-art';
import { MAX_PAINTED_SOURCES, trimLru, type GrassArt, type GrassDetail, type GrassDetailWeight } from './painted-grass-lod';
import { familyWeights, lookColour, lookKey, LOOK_RANGES, resolveFamily, type LevelArt, type PaintedKind } from './painted-families';
import { clampSurfaces, lookOfTex, type PresetRef, type SurfacesFile } from './painted-surfaces';
import { bandOf, specBand, tiledFamily, tileSpec, TILE_BANDS, TILES_REVISION, type TileBand, type TiledFamily } from './painted-tiles';
import { ASPHALT_MEAN, type GroundArt, LEAF_CELL, LEAF_COLS, LEAVES, LOT_ASPHALT_M, POOL_ANCHOR, PPM, SLAB_CELL, SLAB_COUNT, SLAB_TOP } from './ground-art';
import { litPixel } from './lamp-reflect';

/** Ground materials, following the town builder's ground renderer (scripts/lib/town-scene.mjs):
 *  - asphalt: the owner's painted asphalt (flattened), laid in 1.6 m hex patches with random offsets so it never repeats,
 *    baked here into a seamless 24 m texture in GROUND (tile) space; two more copies carry the painting's measured
 *    lamp-light response (manifest.json light.DMU / DSG) at I = 0.4 and I = 0.9 for the reflection pools;
 *  - grass: the two approved 256 px grass paintings mixed in hex patches and by low-frequency noise (screen space);
 *  - curbs and slabs: colours and sprites straight from the kit. */
export type TexName = 'grass' | GrassTex | 'meadow' | 'dirt' | 'rockyDirt' | 'rockyDirtAlt' | 'gravel' | 'roadgravel' | 'field' | 'paving' | 'pad' | 'outside' | 'grime' | 'wear' | 'forest' | 'water' | 'bank' | 'creek' | 'rock';
export const PAINTED_NAMES: readonly TexName[] = ['dirt', 'gravel', 'field', 'paving', 'pad', 'grime', 'wear', 'forest', 'water', 'bank', 'creek', 'rock', 'roadgravel'];
const PAINTED = PAINTED_NAMES;
/** the textures made from the base grass by a multiply: the meadow (PATCH ground) and the map's outside */
export const GRASS_TINTS: readonly (readonly [TexName, string])[] = [['meadow', '#b9a98a'], ['outside', '#8c8c86']];
/** screen-space textures are authored at 0.8 px per world px; mip-mapped per cache level */
export const AUTHOR = 0.8;
const K = AUTHOR / 0.6;
/** 20 x 20 tiles: the iso lattice repeats exactly with the texture */
const BASE_W = 2048, BASE_H = 1024;
/** asphalt mosaic: period in tiles, px per tile */
export const MOSAIC_TILES = 12, MOSAIC_PX = 96;
const LEAF = ['#c8561e', '#e08a2a', '#a8321c', '#d9b13b', '#b8451d', '#e6a23a', '#8f2d14', '#f0c040'];

// the painting's lamp-light response (litPixel) is in lamp-reflect.ts (T215: the GPU's camera specular runs the same tables)

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
/** T168: the procedural textures are drawn by generators that pause (yield) every few hundred draws, so a texture can be made in slices
 *  between a worker's bakes; drawn to the end at once (drain) they make the very same pixels */
type Steps<T = void> = Generator<void, T, void>;
/** runs a generator to its end, its result */
export function drain<T>(it: Iterator<void, T>): T { let r = it.next(); while (!r.done) r = it.next(); return r.value; }
const PAUSE = 256;
/** a step-less build (a light boot's lazy grass tints): made in one go */
function* once(f: () => void): Steps { f(); }
/** what a bake gets for a lazy texture not made yet while its makes are deferred (Textures.deferMakes, T168): the bake goes on to learn every
 *  texture it lacks (Textures.missing), and is then thrown away and baked again once they are made */
export const PLACEHOLDER: Cnv = typeof OffscreenCanvas === 'undefined' ? ({} as Cnv) : canvas(1, 1); // (node, the tests: no canvas, never drawn)
function* patches(ctx: C2D, r: () => number, n: number, colors: string[], rmin: number, rmax: number): Steps {
  for (let i = 0; i < n; i++) {
    if (i % 16 === 15) yield;
    const x = r() * BASE_W, y = r() * BASE_H, rad = (rmin + r() * (rmax - rmin)) * K, col = colors[(r() * colors.length) | 0];
    wrap(x, y, rad * 1.2, (X, Y) => { ctx.save(); ctx.translate(X, Y); ctx.scale(1, 0.5); const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad); g.addColorStop(0, col); g.addColorStop(1, col.slice(0, 7) + '00'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
  }
}
function* speckle(ctx: C2D, r: () => number, n: number, cols: string[]): Steps { for (let i = 0; i < n * K * K; i++) { if (i % (PAUSE * 4) === PAUSE * 4 - 1) yield; ctx.fillStyle = cols[(r() * cols.length) | 0]; ctx.fillRect((r() * BASE_W) | 0, (r() * BASE_H) | 0, 1, 1); } }
function* blades(ctx: C2D, r: () => number, n: number, cols: string[]): Steps {
  for (let i = 0; i < n * K * K; i++) { if (i % PAUSE === PAUSE - 1) yield; const x = (r() * BASE_W) | 0, y = (r() * BASE_H) | 0, hgt = Math.round((2 + r() * 3) * K); ctx.fillStyle = cols[(r() * cols.length) | 0]; wrap(x, y, 8, (X, Y) => ctx.fillRect(X, Y - hgt, 1, hgt)); }
}
function leaf(ctx: C2D, x: number, y: number, rot: number, len: number, col: string) {
  const w = len * 0.45, shape = () => { ctx.beginPath(); ctx.moveTo(-len, 0); ctx.quadraticCurveTo(0, -w * 1.9, len, 0); ctx.quadraticCurveTo(0, w * 1.9, -len, 0); ctx.closePath(); };
  ctx.save(); ctx.translate(x + 1.4 * K, y + 1.6 * K); ctx.scale(1, 0.55); ctx.rotate(rot); ctx.fillStyle = 'rgba(5,5,15,0.4)'; shape(); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.55); ctx.rotate(rot); ctx.fillStyle = col; shape(); ctx.fill(); ctx.restore();
}
function* leaves(ctx: C2D, r: () => number, n: number): Steps { for (let i = 0; i < n * K * K; i++) { if (i % 32 === 31) yield; const x = r() * BASE_W, y = r() * BASE_H, rot = r() * Math.PI, len = (6 + r() * 4) * K, col = LEAF[(r() * LEAF.length) | 0]; wrap(x, y, 16 * K, (X, Y) => leaf(ctx, X, Y, rot, len, col)); } }
function* pebbles(ctx: C2D, r: () => number, n: number, cols: string[], rmin: number, rmax: number): Steps {
  for (let i = 0; i < n * K * K; i++) {
    if (i % 64 === 63) yield;
    const x = r() * BASE_W, y = r() * BASE_H, rx = (rmin + r() * (rmax - rmin)) * K, ry = rx * (0.55 + r() * 0.25), col = cols[(r() * cols.length) | 0];
    wrap(x, y, 6, (X, Y) => { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(X + 0.5, Y + 0.7, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(X, Y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(X - rx * 0.3, Y - ry * 0.3, rx * 0.4, ry * 0.35, 0, 0, Math.PI * 2); ctx.fill(); });
  }
}
function* cracks(ctx: C2D, r: () => number, n: number, color: string, width: number): Steps {
  ctx.strokeStyle = color; ctx.lineWidth = width * K; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    if (i % 32 === 31) yield;
    const x = r() * BASE_W, y = r() * BASE_H, segs = 5 + ((r() * 7) | 0), pts: [number, number][] = [[0, 0]]; let px = 0, py = 0, dir = r() * Math.PI * 2;
    for (let s = 0; s < segs; s++) { dir += (r() - 0.5) * 1.6; px += Math.cos(dir) * (6 + r() * 12) * K; py += Math.sin(dir) * (3 + r() * 6) * K; pts.push([px, py]); }
    wrap(x, y, 160, (X, Y) => { ctx.beginPath(); pts.forEach(([a, b], k) => (k ? ctx.lineTo(X + a, Y + b) : ctx.moveTo(X + a, Y + b))); ctx.stroke(); });
  }
}
/** water ripples: short, nearly horizontal light strokes */
function* ripples(ctx: C2D, r: () => number, n: number, cols: string[]): Steps {
  ctx.lineCap = 'round';
  for (let i = 0; i < n * K * K; i++) {
    if (i % 128 === 127) yield;
    const x = r() * BASE_W, y = r() * BASE_H, len = (8 + r() * 34) * K, ang = (r() - 0.5) * 0.3, bow = (r() - 0.5) * 3 * K;
    ctx.strokeStyle = cols[(r() * cols.length) | 0]; ctx.lineWidth = (0.6 + r() * 0.9) * K;
    const dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2;
    wrap(x, y, len, (X, Y) => { ctx.beginPath(); ctx.moveTo(X - dx, Y - dy); ctx.quadraticCurveTo(X, Y + bow, X + dx, Y + dy); ctx.stroke(); });
  }
}
function isoAuthor(ctx: C2D) { ctx.setTransform(64 * AUTHOR, 32 * AUTHOR, -64 * AUTHOR, 32 * AUTHOR, 0, 0); }
function* genSteps(name: TexName): Steps<Cnv> {
  const c = canvas(BASE_W, BASE_H), ctx = ctx2d(c), r = mulberry(PAINTED.indexOf(name) * 7919 + 17);
  switch (name) {
    case 'dirt': ctx.fillStyle = '#56402f'; ctx.fillRect(0, 0, BASE_W, BASE_H); yield* patches(ctx, r, 260, ['#2e201655', '#8a644044', '#3d2c2255'], 40, 120); yield* speckle(ctx, r, 22000, ['#4a3628', '#624a36', '#3e2d22', '#6e5440', '#523c2d']); yield* pebbles(ctx, r, 420, ['#7a7068', '#6b6058', '#8a8078'], 1.2, 2.6); yield* leaves(ctx, r, 90); break;
    case 'gravel': ctx.fillStyle = '#5b5752'; ctx.fillRect(0, 0, BASE_W, BASE_H); yield* patches(ctx, r, 200, ['#3a373355', '#7c766e33'], 40, 110); yield* pebbles(ctx, r, 9000, ['#6b6660', '#49453f', '#7c766e', '#3c3935', '#857f76', '#5d5953'], 0.9, 2.2); yield* leaves(ctx, r, 60); break;
    case 'roadgravel': ctx.fillStyle = '#62574a'; ctx.fillRect(0, 0, BASE_W, BASE_H); yield* patches(ctx, r, 200, ['#8d7f6646', '#a0927644'], 40, 130); yield* patches(ctx, r, 120, ['#3f362b55', '#4b41345a'], 30, 100); yield* speckle(ctx, r, 26000, ['#574d40', '#74685a', '#4a4136', '#857865', '#6a5e4e']); yield* pebbles(ctx, r, 5200, ['#8a7f6e', '#5e5446', '#a09482', '#4c4338', '#77695a'], 0.9, 2.4); yield* leaves(ctx, r, 30); break;
    case 'forest': ctx.fillStyle = '#3a2a1c'; ctx.fillRect(0, 0, BASE_W, BASE_H); yield* patches(ctx, r, 240, ['#1e140c66', '#3c4a2244', '#6a4a2444'], 40, 140); yield* speckle(ctx, r, 18000, ['#2e2016', '#4a3524', '#3a2c1c', '#55402a']); yield* cracks(ctx, r, 120, 'rgba(30,20,12,0.55)', 0.9); yield* pebbles(ctx, r, 120, ['#5a5048', '#6a6058'], 1.0, 2.0); yield* leaves(ctx, r, 420); break;
    case 'water': ctx.fillStyle = '#14283a'; ctx.fillRect(0, 0, BASE_W, BASE_H); yield* patches(ctx, r, 160, ['#0c1a2a66', '#1e3a5044', '#24485a33'], 60, 200); yield* ripples(ctx, r, 1400, ['rgba(120,160,190,0.10)', 'rgba(120,160,190,0.18)', 'rgba(150,185,210,0.25)', 'rgba(10,20,32,0.35)']); break;
    case 'bank': ctx.fillStyle = '#3b3226'; ctx.fillRect(0, 0, BASE_W, BASE_H); yield* patches(ctx, r, 220, ['#2a231a66', '#4e443455', '#2f3a2a44'], 40, 120); yield* speckle(ctx, r, 20000, ['#342c22', '#463c2e', '#2c251c', '#524636']); yield* pebbles(ctx, r, 900, ['#6a645c', '#57524a', '#7a746a'], 0.9, 2.2); yield* blades(ctx, r, 1500, ['#4a5a2a', '#5e6a30', '#3a4622']); yield* leaves(ctx, r, 80); break;
    case 'creek': ctx.fillStyle = '#3a3832'; ctx.fillRect(0, 0, BASE_W, BASE_H); yield* patches(ctx, r, 180, ['#24221e66', '#5a564c44'], 30, 90); yield* speckle(ctx, r, 8000, ['#2e2c28', '#4a4740']); yield* pebbles(ctx, r, 6000, ['#6e6a62', '#55514a', '#807a70', '#45423c', '#8e887c'], 1.0, 3.2); yield* leaves(ctx, r, 40); break;
    case 'rock': ctx.fillStyle = '#4a4640'; ctx.fillRect(0, 0, BASE_W, BASE_H); yield* patches(ctx, r, 220, ['#2a272366', '#6a645a44', '#3e4a3044'], 30, 110); yield* cracks(ctx, r, 260, 'rgba(20,18,16,0.6)', 1.1); yield* cracks(ctx, r, 120, 'rgba(150,140,125,0.25)', 0.7); yield* pebbles(ctx, r, 500, ['#6a655c', '#7c766a', '#55514a'], 1.2, 3.0); yield* speckle(ctx, r, 12000, ['#3c3934', '#5a5650', '#46423c']); yield* leaves(ctx, r, 60); break;
    case 'field': {
      ctx.fillStyle = '#5a4a2e'; ctx.fillRect(0, 0, BASE_W, BASE_H); yield* patches(ctx, r, 200, ['#3a2c1a55', '#8a743e3a'], 40, 120);
      ctx.save(); isoAuthor(ctx);
      for (let v = -21; v <= 21; v += 0.5) { if (v % 8 === 0) yield; ctx.strokeStyle = 'rgba(40,28,14,0.55)'; ctx.lineWidth = 0.14; ctx.beginPath(); ctx.moveTo(-1, v); ctx.lineTo(42, v); ctx.stroke(); ctx.strokeStyle = 'rgba(150,125,70,0.22)'; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.moveTo(-1, v + 0.2); ctx.lineTo(42, v + 0.2); ctx.stroke(); }
      ctx.restore(); yield* speckle(ctx, r, 14000, ['#4e3f26', '#6a5634', '#3f3220', '#7a6640']); yield* blades(ctx, r, 3000, ['#8a7a3a', '#a08a44', '#6a5a2a']); break;
    }
    case 'paving': {
      ctx.fillStyle = '#a89c8c'; ctx.fillRect(0, 0, BASE_W, BASE_H); ctx.save(); isoAuthor(ctx);
      for (let u = -1; u <= 42; u++) for (let v = -22; v <= 22; v++) { if (v === -22 && u % 4 === 3) yield; const a = (((u + v) % 40) + 40) % 40, b = (((u - v) % 40) + 40) % 40, h = mulberry(a * 97 + b * 13 + 5)(); ctx.fillStyle = h < 0.33 ? 'rgba(255,245,230,0.10)' : h < 0.66 ? 'rgba(60,50,40,0.10)' : 'rgba(150,130,110,0.08)'; ctx.fillRect(u, v, 1, 1); }
      ctx.strokeStyle = 'rgba(50,40,30,0.5)'; ctx.lineWidth = 0.035;
      for (let k = -24; k <= 44; k++) { ctx.beginPath(); ctx.moveTo(k, -25); ctx.lineTo(k, 25); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-5, k); ctx.lineTo(45, k); ctx.stroke(); }
      ctx.restore(); yield* speckle(ctx, r, 9000, ['#9c9080', '#b4a898', '#8e8274']); yield* leaves(ctx, r, 50); break;
    }
    case 'pad': ctx.fillStyle = '#b9ada0'; ctx.fillRect(0, 0, BASE_W, BASE_H); yield* patches(ctx, r, 200, ['#8a7e7044', '#d0c4b633'], 40, 120); yield* speckle(ctx, r, 12000, ['#ada194', '#c4b8aa', '#9e9286']); yield* cracks(ctx, r, 10, 'rgba(70,60,50,0.35)', 0.8); yield* leaves(ctx, r, 40); break;
    case 'grime': {
      // town-scene.mjs grime(): blots of fbm plus specks, as a multiply layer for the sidewalk slabs (STAIN = .84 .78 .72)
      const blot = fbmRows(95, BASE_W, BASE_H, 14, 4), speck = fbmRows(97, BASE_W, BASE_H, 110, 2), d = ctx.createImageData(BASE_W, BASE_H), D = d.data, bR = new Float64Array(BASE_W), sR = new Float64Array(BASE_W);
      for (let y = 0; y < BASE_H; y++) for (let x = 0; x < BASE_W; x++) { if (x === 0) { if (y % 32 === 31) yield; blot(y, bR); speck(y, sR); } const st = clamp(smooth(0.36, 0.64, bR[x]!) * 0.8 + smooth(0.5, 0.8, sR[x]!) * 0.3, 0, 1), o = (y * BASE_W + x) * 4; D[o] = 255 * (1 - 0.16 * st); D[o + 1] = 255 * (1 - 0.22 * st); D[o + 2] = 255 * (1 - 0.28 * st); D[o + 3] = 255; }
      ctx.putImageData(d, 0, 0); break;
    }
    case 'wear': {
      // chipped paint for road markings: mostly opaque, with worn holes (town-scene.mjs wear())
      const chip = fbmRows(61, BASE_W, BASE_H, 160, 3), gap = fbmRows(63, BASE_W, BASE_H, 18, 2), d = ctx.createImageData(BASE_W, BASE_H), D = d.data, cR = new Float64Array(BASE_W), gR = new Float64Array(BASE_W);
      for (let y = 0; y < BASE_H; y++) for (let x = 0; x < BASE_W; x++) { if (x === 0) { if (y % 32 === 31) yield; chip(y, cR); gap(y, gR); } const a = (0.35 + 0.65 * smooth(0.22, 0.4, cR[x]!)) * (0.55 + 0.45 * smooth(0.2, 0.3, gR[x]!)), o = (y * BASE_W + x) * 4; D[o] = D[o + 1] = D[o + 2] = 255; D[o + 3] = clamp(a, 0, 1) * 255; }
      ctx.putImageData(d, 0, 0); break;
    }
    default: break;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

/** a procedural texture's base picture, drawn to the end at once */
function gen(name: TexName): Cnv { return drain(genSteps(name)); }

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

/** a texture's painted look as a chunk lays it: the composition key (family, version, scale), each level's picture (URL), metres and px, and the
 *  tint, tone and mean colour of the look (painted-families.ts) */
export type PaintedPick = { key: string; kind: PaintedKind; legacy: boolean; tint: string; tone: number; mean: string; tiled?: TiledPick } & Record<GrassDetail, { src: string; metres: number; px: number }>;
/** a tile set family's pick (T145, painted-tiles.ts): the family and each band's four tile URLs, in the manifest's order */
export interface TiledPick { fam: TiledFamily; urls: Record<TileBand, string[]> }
/** decoded tile pictures a worker keeps (each about 6 MB): one band of the six tile set families a course hole shows since T153 (fescue,
 *  lake, sand ripples, fairway, putting green; the rough: the owner's paintings since T162, one tile a band), so chunks wearing different
 *  families do not decode them again in turn; the least recently used past this go, never the current bake's or the band about to be needed */
export const MAX_TILE_SOURCES = 24;
/** a tile set family's tile URLs by band, or null when the build lacks any of its pictures (then its surfaces keep their photo) */
function tiledUrls(t: TiledFamily): Record<TileBand, string[]> | null {
  const out = {} as Record<TileBand, string[]>;
  for (const b of TILE_BANDS) { const us = t.levels[b].tiles.map(x => paintedUrl(x.file)); if (us.some(u => !u)) return null; out[b] = us as string[]; }
  return out;
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
  /* ---- the painted ground (painted-families.ts, painted-surfaces.ts, painted-grass-art.ts): each texture's look from the surfaces file, its
   *  levels' pictures decoded on demand (by URL, an LRU) with their mip chains, and the art level the next bake is for (preparePainted) ---- */
  private paintedPics = new Map<string, Cnv[]>();
  private paintedLoads = new Map<string, Promise<void>>();
  private paintedLevel = .3;
  /** the tile spec the next bake lays the tile set families at (painted-tiles.ts tileSpec: the camera's band and the screen's DPR, sent with
   *  each bake), and the other bands to decode ahead (painted-tiles.ts bandsAhead: the camera's, sent when they change) */
  tileTs = tileSpec(0, 1);
  tilesAhead: readonly number[] = [];
  /** the tile set families' decoded tiles (by URL, an LRU of MAX_TILE_SOURCES; the decoded bitmap itself, no canvas copy) with their mip
   *  chains, and the decodes in progress */
  private tilePics = new Map<string, (Cnv | ImageBitmap)[]>();
  /** how many decoded tile-set tiles and painted pictures this worker keeps (a light boot's are smaller, T157: ground-protocol.ts WorkerLimits) */
  tileLimit = MAX_TILE_SOURCES; paintedLimit = MAX_PAINTED_SOURCES;
  /** T194: the pictures the bake in hand lays (its tile set band, its painted pictures), never trimmed from the caches by a decode that finishes
   *  meanwhile (an earlier bake's look-ahead, a prewarm): such a trim took a yard's lawn tiles away before the bake drew them, and the lawn was
   *  left out of that chunk, its fescue showing at the yard's edges and corners where the chunks met */
  private tilePinned: ReadonlySet<string> = new Set(); private paintedPinned: ReadonlySet<string> = new Set();
  private tileLoads = new Map<string, Promise<void>>();
  /** the art level the next bake is for (set by preparePainted) */
  get paintedArtLevel() { return this.paintedLevel; }
  /** which family each surface wears (painted-surfaces.json, sent by the main thread and again whenever the studio saves it) */
  surfaces: SurfacesFile = clampSurfaces(null);
  /** the owner's presets as the looks see them (id, golf surface, the old painted set) */
  private presetRefs: PresetRef[] = [];
  /** false: every painted family is off and the ground is the photo textures (the game's Grass setting, GrassArt 'photo') */
  paintedOn = true;
  private picks = new Map<string, PaintedPick | null>();
  /** the surfaces file changed (the studio saved it): every texture's look is found again */
  setSurfaces(f: SurfacesFile) { this.surfaces = f; this.picks.clear(); }
  setPaintedOn(on: boolean) { this.paintedOn = on; this.picks.clear(); }
  /** the painted look a texture is laid with at an area scale (1: as the surface's look has it), or null: its photo (the Grass setting 'photo',
   *  a texture no surface stands for, or a build without the family's pictures) */
  paintedOf(variant: string, scale = 1): PaintedPick | null {
    if (!this.paintedOn) return null;
    const k = `${variant}|${scale}`;
    if (this.picks.has(k)) return this.picks.get(k)!;
    let out: PaintedPick | null = null;
    const look = lookOfTex(variant, this.surfaces, this.presetRefs);
    if (look) {
      const sc = Math.round(Math.min(LOOK_RANGES.scale[1], Math.max(LOOK_RANGES.scale[0] / 4, look.scale * (Number.isFinite(scale) && scale > 0 ? scale : 1))) * 1000) / 1000;
      const fam = resolveFamily({ ...look, scale: sc });
      const tf = fam?.tiled ? tiledFamily(fam.id) : undefined, turls = tf ? tiledUrls(tf) : null;
      // a tile set family: laid as authored (no scale, tint or tone), its levels' first tiles for the swatches
      if (fam && tf) { if (turls) out = { key: `tiles:${tf.id}@${TILES_REVISION}`, kind: fam.kind, legacy: false, near: { src: turls.near[0]!, metres: fam.near.metres, px: fam.near.px }, mid: { src: turls.mid[0]!, metres: fam.mid.metres, px: fam.mid.px }, far: { src: turls.far[0]!, metres: fam.far.metres, px: fam.far.px }, tint: '#ffffff', tone: 0, mean: tf.mean, tiled: { fam: tf, urls: turls } }; }
      else if (fam) {
        const lv = (a: LevelArt) => { const src = paintedUrl(a.file); return src ? { src, metres: a.metres, px: a.px } : null; };
        const near = lv(fam.near), mid = lv(fam.mid), far = lv(fam.far);
        if (near && mid && far) out = { key: lookKey({ ...look, scale: sc }), kind: fam.kind, legacy: fam.legacy, near, mid, far, tint: look.tint, tone: look.tone, mean: lookColour(fam.near.mean, look) };
      }
    } else {
      const v = VARIANT_SETS[variant];
      if (v) { const s = Number.isFinite(scale) && scale > 0 ? scale : 1, lv = (l: { src: string; metres: number }) => ({ src: l.src, metres: l.metres * s, px: 1024 }); out = { key: `set:${variant}@${s}`, kind: 'grass', legacy: true, near: lv(v.near), mid: lv(v.mid), far: lv(v.far), tint: '#ffffff', tone: 0, mean: '#5c6b33' }; }
    }
    this.picks.set(k, out);
    return out;
  }
  isPainted(variant: string) { return !!this.paintedOf(variant); }
  /** T247: the painted family a texture is laid with (its surface's look), or null when it is laid as its photo */
  familyOf(variant: string): string | null { return this.paintedOf(variant) ? lookOfTex(variant, this.surfaces, this.presetRefs)?.family ?? null : null; }
  /** a painted texture's mean colour as its look shows it (the planner's colour, a swatch), or null */
  paintedMean(variant: string) { return this.paintedOf(variant)?.mean ?? null; }
  /** the levels a painted look blends at the current art level (painted-families.ts familyWeights) */
  paintedWeights(p: PaintedPick): GrassDetailWeight[] { return p.tiled ? [{ detail: bandOf(this.tileTs), weight: 1 }] : familyWeights(p, this.paintedLevel); }
  /** a tile set's URLs at a tile spec: its band's four into `now`; the bands the camera is about to switch to (tilesAhead) into `ahead`
   *  (decoded before the camera switches to them) */
  private tileUrlsAt(t: TiledPick, ts: number, now: Set<string>, ahead: Set<string>) {
    const b = specBand(ts);
    for (const u of t.urls[TILE_BANDS[b]!]) now.add(u);
    for (const n of this.tilesAhead) if (n !== b && TILE_BANDS[n]) for (const u of t.urls[TILE_BANDS[n]!]) ahead.add(u);
  }
  /** decodes tile pictures not decoded yet (the LRU keeps `keep` and the batch itself) */
  private async decodeTiles(urls: Set<string>, keep: ReadonlySet<string> = new Set()) {
    await Promise.all([...urls].map(src => {
      const have = this.tilePics.get(src); if (have) { this.tilePics.delete(src); this.tilePics.set(src, have); return null; }
      let pending = this.tileLoads.get(src);
      if (!pending) {
        pending = loadImage(src).then(img => { this.tilePics.set(src, [img]); }, err => console.warn('[painted tiles]', String(err)))
          .finally(() => this.tileLoads.delete(src));
        this.tileLoads.set(src, pending);
      }
      return pending;
    }));
    trimLru(this.tilePics, new Set([...urls, ...keep, ...this.tilePinned]), this.tileLimit, chain => { for (const m of chain) if (m instanceof ImageBitmap) m.close(); });
  }
  /** before a bake: the tile set families among `variants` at tile spec `ts`: the band's tiles decoded (awaited), the next band's started
   *  (when the camera is near its switch: tilesAhead); pin (a bake: not a prewarm): its band's tiles are the ones the caches keep (T194) */
  async prepareTiles(variants: Iterable<string>, ts = this.tileTs, pin = true) {
    this.tileTs = ts;
    const now = new Set<string>(), ahead = new Set<string>();
    for (const v of variants) { const p = this.paintedOf(v); if (p?.tiled) this.tileUrlsAt(p.tiled, ts, now, ahead); }
    for (const u of now) ahead.delete(u);
    if (pin) this.tilePinned = now;
    if (ahead.size) void this.decodeTiles(ahead, now);
    await this.decodeTiles(now, ahead);
  }
  /** a decoded tile's mip with at least `px` pixels across (made on first use), or null when it is not decoded */
  tileImage(src: string, px = Infinity): Cnv | ImageBitmap | null {
    const chain = this.tilePics.get(src); if (!chain) return null;
    while (chain[chain.length - 1]!.width > 96 && chain[chain.length - 1]!.width / 2 >= px) chain.push(downscale(chain[chain.length - 1]! as Cnv, 0.5));
    let img = chain[0]!; for (const m of chain) { if (m.width >= px) img = m; else break; }
    return img;
  }
  /** decodes pictures (by URL) that are not decoded yet; a picture that fails to load leaves its texture on its photo */
  private async decodePainted(urls: Set<string>) {
    await Promise.all([...urls].map(src => {
      const have = this.paintedPics.get(src); if (have) { this.paintedPics.delete(src); this.paintedPics.set(src, have); return null; }
      let pending = this.paintedLoads.get(src);
      if (!pending) {
        pending = loadImage(src).then(img => { try { this.paintedPics.set(src, [toCanvas(img)]); } finally { img.close(); } }, err => console.warn('[painted ground]', String(err)))
          .finally(() => this.paintedLoads.delete(src));
        this.paintedLoads.set(src, pending);
      }
      return pending;
    }));
    trimLru(this.paintedPics, new Set([...urls, ...this.paintedPinned]), this.paintedLimit);
  }
  /** before a bake at art level L (CSS zoom, painted-grass-lod.ts grassZoomLevels): decodes the pictures the given textures need at that level
   *  (one or two per look), never all of them; the `near` textures take their near painting whatever the level (the course walls' cut faces);
   *  pin false for a prewarm (decoded ahead, not laid now: the bake in hand keeps its pictures pinned, T194) */
  async preparePainted(L: number, variants: Iterable<string>, near: Iterable<string> = [], pin = true) {
    this.paintedLevel = L;
    const urls = new Set<string>(), vs = [...variants];
    for (const v of vs) { const p = this.paintedOf(v); if (p && !p.tiled) for (const w of this.paintedWeights(p)) urls.add(p[w.detail].src); }
    for (const v of near) { const p = this.paintedOf(v); if (p) urls.add(p.near.src); }
    if (pin) this.paintedPinned = urls;
    await Promise.all([this.decodePainted(urls), this.prepareTiles(vs, this.tileTs, pin)]);
  }
  /** before a planner bake: the far pictures of the given textures (the planner lays the map grass's far painting, painted-families.ts) */
  async preparePlanner(variants: Iterable<string>) {
    const urls = new Set<string>();
    for (const v of variants) { const p = this.paintedOf(v); if (p) urls.add(p.far.src); }
    this.paintedPinned = new Set([...this.paintedPinned, ...urls]);
    await this.decodePainted(urls);
  }
  /** a decoded picture's mip with at least `px` pixels across (the full picture when none is that small; mips made on first use), or null
   *  when it is not decoded */
  paintedImage(src: string, px = Infinity): Cnv | null {
    const chain = this.paintedPics.get(src); if (!chain) return null;
    while (chain[chain.length - 1]!.width > 96 && chain[chain.length - 1]!.width / 2 >= px) chain.push(downscale(chain[chain.length - 1]!, 0.5));
    let img = chain[0]!; for (const m of chain) { if (m.width >= px) img = m; else break; }
    return img;
  }
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
  private store(name: TexName, base: Cnv) { drain(this.storeSteps(name, base)); }
  /** a texture's levels from its base picture, one a step (T168) */
  private *storeSteps(name: TexName, base: Cnv): Steps { for (const L of [...LEVELS, ...MID_LEVELS]) { if (!this.mips.has(name + '@' + L)) this.mips.set(name + '@' + L, downscale(base, L / AUTHOR)); yield; } }
  /** a procedural texture made in steps: its base picture, then its levels (T168) */
  private *procSteps(name: TexName): Steps { const base = yield* genSteps(name); yield* this.storeSteps(name, base); }

  /** what every worker takes from the art, whether it builds the textures or restores them from a snapshot or the browser cache: the
   *  owner's texture presets and how the base grass lies (its angle and tilt) */
  configure(art: GroundArt & { grassMix?: BaseGrassArt; presets?: PhotoTexEntry[]; grassArt?: GrassArt }) {
    if (art.presets?.length) { this.photos = [...PHOTO_TEX, ...art.presets]; for (const p of art.presets) this.periods.set(p.tex, photoPeriod(p, MOSAIC_TILES)); }
    this.presetRefs = (art.presets ?? []).filter(p => p.tex.startsWith('preset:')).map(p => ({ id: p.tex.slice(7), surface: p.surface ?? null, painted: p.painted ?? null }));
    this.paintedOn = art.grassArt !== 'photo'; this.picks.clear();
    this.grassLay = { angle: art.grassMix?.mix.angle ?? DEFAULT_MIX.angle, tilt: art.grassMix?.mix.tilt ?? DEFAULT_MIX.tilt };
  }
  /** builds the texture pack; `eager` the photo textures built now (a light boot's few, T157), the others built by ensure() on first use */
  /** builds the texture pack; `eager` the photo textures built now (a light boot's few, T157), the others built by ensure() on first use; lazy
   *  (a light boot's): the procedural textures (PAINTED) are made on first use too (image), not now */
  async build(art: GroundArt & { grassMix?: BaseGrassArt; presets?: PhotoTexEntry[] }, progress?: (p: number) => void, eager: ReadonlySet<string> = EAGER_PHOTO, lazy = false, lazyTints = lazy) {
    this.configure(art);
    const yieldNow = () => new Promise(res => setTimeout(res, 0));
    const steps = PAINTED.length + 12 + eager.size; let done = 0; const tick = async () => { progress?.(++done / steps); await yieldNow(); };
    const [asA, asB, curbV, curbH, pool, slabs, grassA, grassB, leafImg, soilImg, decalImg, lotImg, lotDecalImg, natureImg, rockyDirtImg, rockyDirtAltImg] = await Promise.all([art.asphaltA, art.asphaltB, art.curbVisible, art.curbHidden, art.pool, art.slabs, art.grassA, art.grassB, art.leaves, art.soil, art.decals, art.lotAsphalt, art.lotDecals, art.nature, art.rockyDirt, art.rockyDirtAlt].map(loadImage));
    this.slabs = toCanvas(slabs); this.leaves = toCanvas(leafImg); this.decals = toCanvas(decalImg); this.soil = soilStamps(toCanvas(soilImg)); this.lotDecals = toCanvas(lotDecalImg); this.nature = toCanvas(natureImg);
    await tick();
    for (const name of PAINTED) { if (lazy) this.lazy.set(name, () => this.procSteps(name)); else this.store(name, gen(name)); await tick(); }
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
    this.store('grass', grass);
    // ---- the Paint tool's photo textures that every worker needs (grasses, concrete): built here; the others are built by ensure() on first use
    for (const p of PHOTO_TEX) if (eager.has(p.tex)) { await this.buildPhoto(p, lazy); await tick(); }
    if (lazyTints) this.lazyTinted();
    else for (const [name, tint] of GRASS_TINTS) { const c = canvas(BASE_W, BASE_H), g = ctx2d(c); g.drawImage(grass, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = tint; g.fillRect(0, 0, BASE_W, BASE_H); this.store(name, c); }
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
  private mosaic(seeds: ReturnType<Textures['mosaicSeeds']>, a: Cnv, b: Cnv, fill?: string, px = MOSAIC_PX, srcPPM = PPM) { return drain(this.mosaicSteps(seeds, a, b, fill, px, srcPPM)); }
  /** the mosaic in steps (T168): a few patches, then a band of the grain's rows, a step */
  private *mosaicSteps(seeds: ReturnType<Textures['mosaicSeeds']>, a: Cnv, b: Cnv, fill?: string, px = MOSAIC_PX, srcPPM = PPM): Steps<Cnv> {
    const S = MOSAIC_TILES * px, c = canvas(S, S), g = ctx2d(c);
    // one patch covers ~1.6 tiles so neighbours overlap; feather spans most of the overlap band
    const R = 0.82 * px, feather = 0.5 * px, P = Math.ceil(R * 2) + 2;
    const patch = canvas(P, P), pg = ctx2d(patch), scale = px / 2 / srcPPM;
    const soft = canvas(P, P); { const sg = ctx2d(soft), gr = sg.createRadialGradient(P / 2, P / 2, 0, P / 2, P / 2, R); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.35, 'rgba(0,0,0,1)'); gr.addColorStop(0.35 + feather / R, 'rgba(0,0,0,0)'); sg.fillStyle = gr; sg.fillRect(0, 0, P, P); }
    g.fillStyle = fill ?? `rgb(${ASPHALT_MEAN.map(Math.round).join(',')})`; g.fillRect(0, 0, S, S);
    let k = 0;
    for (const s of seeds) {
      if (k++ % 8 === 7) yield;
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
    for (let i = 0; i < D.length; i += 4) { if (i % (S * 4 * 64) === 0 && i) yield; const n = (rr() - 0.5) * 4; D[i] = clamp(D[i] + n, 0, 255); D[i + 1] = clamp(D[i + 1] + n * 0.75, 0, 255); D[i + 2] = clamp(D[i + 2] + n * 0.5, 0, 255); }
    g.putImageData(d, 0, 0);
    return c;
  }
  private mipChain(c: Cnv) { return drain(this.mipChainSteps(c)); }
  private *mipChainSteps(c: Cnv): Steps<Cnv[]> { const out = [c]; while (out[out.length - 1].width > 96) { out.push(downscale(out[out.length - 1], 0.5)); yield; } return out; }
  /** the asphalt mosaic mip for a cache level (screen px per world px): never upsampled */
  mosaicFor(variant: string, L: number) {
    this.makeMosaic(variant);
    const chain = this.mosaics.get(variant); if (!chain) return PLACEHOLDER; // being made (T168: a deferring bake, thrown away)
    const period = this.periodOf(variant), want = 128 * L; let pick = chain[0];
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
  /** true when a texture can be laid in this worker: its photo built (the eager ones always are; a lazy photo once ensure has run), or its painted
   *  family's pictures for the current art level decoded */
  has(variant: string) { const p = this.paintedOf(variant); return !!p && (p.tiled ? p.tiled.urls[bandOf(this.tileTs)].every(u => this.tilePics.has(u)) : this.paintedWeights(p).every(w => this.paintedPics.has(p[w.detail].src))) || this.built(variant); }
  /** true when its photo (tile-space mosaic) is built, whatever the Grass setting */
  built(variant: string) { return this.mosaics.has(variant) || this.lazyMosaics.has(variant) || this.building.has('mosaic:' + variant); }
  /** a light boot's photo mosaics not made yet (T157: build's lazy): the photo's source is built (Paint areas draw it, sourceFor); its hex-mixed
   *  mosaic, which only the ground photos of the terrain and a lot's concrete lay (mosaicFor), is made on first use */
  private lazyMosaics = new Map<string, () => Steps<unknown>>();
  private makeMosaic(variant: string) { this.make('mosaic:' + variant); }
  /** T168: told of each texture made on first use: its key, the ms of work its making took and the ms from its start to its end (made in
   *  slices: the time it took in between bakes), for the worker's log */
  onMade: ((what: string, workMs: number, wallMs: number) => void) | null = null;
  /* ---- T168: the lazy textures made in slices ----
   * A lazy texture (a procedural one: PAINTED; a photo's mosaic: 'mosaic:<photo>') is made by a generator that pauses every few ms of work.
   * The worker runs the textures a waiting bake needs one slice at a time between its messages, and the others (made ahead) only while it
   * is idle. A bake that meets a lazy texture not made yet either makes the rest of it at once (deferMakes off: as before) or, deferMakes on
   * (the worker's bakes), gets PLACEHOLDER and the texture is noted in `missing`: the worker throws that bake away, puts the chunk aside until
   * every texture it lacks is made, and bakes the others meanwhile. */
  private building = new Map<string, { it: Steps<unknown>; need: boolean; t0: number; work: number; waiters: (() => void)[] }>();
  /** a bake meeting a lazy texture not made yet gets PLACEHOLDER and notes it in `missing` instead of making it (T168: the worker's bakes) */
  deferMakes = false;
  /** the lazy textures the bakes since the last clear met while their makes were deferred (each now being made) */
  missing = new Set<string>();
  /** whether a texture met while deferring is needed by a waiting bake (false: a probe's, made ahead in idle time) */
  deferNeed = true;
  private factory(key: string, take: boolean): (() => Steps<unknown>) | undefined {
    const mosaic = key.startsWith('mosaic:'), map = (mosaic ? this.lazyMosaics : this.lazy) as Map<string, () => Steps<unknown>>, k = mosaic ? key.slice(7) : key;
    const f = map.get(k); if (f && take) map.delete(k); return f;
  }
  /** whether key (a procedural texture's name or 'mosaic:<photo>') is a lazy texture not made yet */
  isLazy(key: string) { return this.building.has(key) || !!this.factory(key, false); }
  /** starts key's making in slices (need: a waiting bake needs it; else it is made ahead, in idle time); false when there is nothing to make */
  queueBuild(key: string, need = false): boolean {
    const b = this.building.get(key); if (b) { if (need) b.need = true; return true; }
    const f = this.factory(key, true); if (!f) return false;
    this.building.set(key, { it: f(), need, t0: performance.now(), work: 0, waiters: [] }); return true;
  }
  /** how many textures are being made: the needed ones, and the ahead ones too when ahead */
  pendingBuilds(ahead: boolean) { let n = 0; for (const b of this.building.values()) if (b.need || ahead) n++; return n; }
  /** makes slices until deadline (performance.now ms): the textures a waiting bake needs first, the others only when ahead; true while any is
   *  still being made */
  step(deadline: number, ahead: boolean): boolean {
    for (;;) {
      let key: string | null = null; for (const [k, b] of this.building) if (b.need) { key = k; break; }
      if (key === null && ahead) key = this.building.keys().next().value ?? null;
      if (key === null) return this.building.size > 0;
      const b = this.building.get(key)!, s0 = performance.now(); let done = false;
      while (!done && performance.now() < deadline) done = !!b.it.next().done;
      b.work += performance.now() - s0;
      if (done) this.finish(key, b);
      if (performance.now() >= deadline) return this.building.size > 0;
    }
  }
  private finish(key: string, b: { work: number; t0: number; waiters: (() => void)[] }) { this.building.delete(key); this.onMade?.(key, b.work, performance.now() - b.t0); for (const w of b.waiters) w(); }
  /** resolves when key is made (at once when it is not being made) */
  whenMade(key: string): Promise<void> { const b = this.building.get(key); return b ? new Promise(res => b.waiters.push(res)) : Promise.resolve(); }
  /** a bake needs key now: deferMakes, noted in `missing` (and its making goes on in slices); else the rest of it made at once */
  private make(key: string) {
    if (!this.building.has(key) && !this.factory(key, false)) return;
    if (this.deferMakes) { this.queueBuild(key, this.deferNeed); this.missing.add(key); return; }
    const b = this.building.get(key);
    if (b) { const s0 = performance.now(); drain(b.it); b.work += performance.now() - s0; this.finish(key, b); return; }
    const t0 = performance.now(); drain(this.factory(key, true)!()); this.onMade?.(key, performance.now() - t0, performance.now() - t0);
  }
  /** builds a lazy photo texture (grass-art.ts PHOTO_TEX) the first time an area uses it; concurrent calls share one build;
   *  a name that is not a photo, or is built already, resolves at once */
  ensure(variant: string): Promise<void> {
    if (this.has(variant)) return Promise.resolve();
    const p = this.photos.find(q => q.tex === variant);
    if (!p) return Promise.resolve();
    let b = this.photoBuilds.get(variant);
    if (!b) { const t0 = performance.now(); this.photoBuilds.set(variant, b = this.buildPhoto(p, this.lazyPhotoMosaics).finally(() => { this.photoBuilds.delete(variant); this.onMade?.(`photo:${variant}`, performance.now() - t0, performance.now() - t0); })); }
    return b;
  }
  /** a photo texture's mip chain in tile space: hex-mixed over MOSAIC_TILES when p.mix > 0 (p.px pixels a tile, the photo's p.mix metres), else the plain photo as its period */
  /** T168: a photo built on first use (ensure) leaves its mosaic for first use too (a lazy worker's: the Paint areas lay the photo itself) */
  lazyPhotoMosaics = false;
  private async buildPhoto(p: PhotoTexEntry, lazyMosaic = false) {
    const c = toCanvas(await loadImage(p.src));
    this.photoSrc.set(p.tex, c);
    if (lazyMosaic) this.lazyMosaics.set(p.tex, () => this.photoMosaicInto(p, c)); else this.mosaics.set(p.tex, this.photoMosaic(p, c));
  }
  private *photoMosaicInto(p: PhotoTexEntry, c: Cnv): Steps { this.mosaics.set(p.tex, yield* this.photoMosaicSteps(p, c)); }
  /** a photo's mosaic mip chain from its source c: hex-mixed when p.mix > 0 (p.px pixels per tile, 160 by default: 80 px/m over the 24 m
   *  period, the photo's p.mix metres, PHOTO_SIZE bigger, scaled to that), else the plain photo as its period */
  private photoMosaic(p: PhotoTexEntry, c: Cnv): Cnv[] { return drain(this.photoMosaicSteps(p, c)); }
  private *photoMosaicSteps(p: PhotoTexEntry, c: Cnv): Steps<Cnv[]> {
    // mixed: the ground under the patches' feathered edges is the photo's own mean colour, not the asphalt's
    const mean = () => { const d = ctx2d(c).getImageData(0, 0, c.width, c.height).data, s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; } return `rgb(${s.map(v => Math.round(v / (d.length / 4))).join(',')})`; };
    const base = p.mix > 0 ? yield* this.mosaicSteps(this.mosaicSeeds(), c, c, mean(), p.px ?? 160, c.width / (p.mix * PHOTO_SIZE)) : c;
    yield;
    return yield* this.mipChainSteps(base);
  }
  image(name: TexName, L: number) { this.make(name); return this.mips.get(name + '@' + L) ?? PLACEHOLDER; }
  /** whether texture name has a picture at cache level L (made now when it is a lazy one) */
  hasImage(name: string, L: number) { this.make(name); return this.mips.has(name + '@' + L); }
  /** the screen-space textures not made yet (a light boot's, T157: build's lazy): the procedural ones (PAINTED_NAMES) and the grass's tints
   *  (GRASS_TINTS); each is made, every level, on first use */
  lazy = new Map<TexName, () => Steps<unknown>>();
  /** T166: a lazy texture is made when the planner asks for its colour (the game's: the same colour as ever); a light boot's (T157) shows its
   *  Paint swatch's instead, never making a texture for a colour */
  makeForColour = true;
  /** the grass's tints made on first use from the grass's own levels (a multiply by a flat colour is the same before or after the downscale) */
  private lazyTinted() {
    for (const [name, tint] of GRASS_TINTS) this.lazy.set(name, () => once(() => {
      for (const L of [...LEVELS, ...MID_LEVELS]) {
        const k = name + '@' + L, src = this.mips.get('grass@' + L); if (!src || this.mips.has(k)) continue;
        const c = canvas(src.width, src.height), g = ctx2d(c); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height); this.mips.set(k, c);
      }
    }));
  }
  /** after a light boot's restore from a pack without them (texture-share.ts lightPack): the screen-space textures it lacks are made on first use */
  lazyMissing() {
    for (const n of PAINTED) if (!this.mips.has(n + '@' + LEVELS[0]) && !this.lazy.has(n) && !this.building.has(n)) this.lazy.set(n, () => this.procSteps(n));
    for (const p of this.photos) { const c = this.photoSrc.get(p.tex); if (c && !this.mosaics.has(p.tex) && !this.lazyMosaics.has(p.tex) && !this.building.has('mosaic:' + p.tex)) this.lazyMosaics.set(p.tex, () => this.photoMosaicInto(p, c)); }
    if (GRASS_TINTS.some(([n]) => !this.mips.has(n + '@' + LEVELS[0]))) this.lazyTinted();
  }
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

// Render a set of TrickOrTreat builder placements (world metres) to one picture, the way the builder draws them
// (scripts/town-builder/export-game.mjs): screen = ((X - Y) * 32, (X + Y) * 16) px per metre at native scale, each sprite by
// its library anchor (ax, ay) at its placement scale, mirrored when flipped. Flats first (by z, then screen y), then the
// uprights' contact shadows, then the uprights in back-to-front order. Read only: the art comes from the local builder library.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { TOT } from './source.mjs';

export const LIB_DIR = path.join(TOT, 'output/town-builder/library');
/** the builder library by id (local TrickOrTreat checkout) */
export const LIB = new Map(JSON.parse(fs.readFileSync(path.join(LIB_DIR, 'library.json'), 'utf8')).items.map(i => [i.id, i]));
const S = 32;
/** screen px (native) of a world point in metres */
export const toScreen = (X, Y) => [(X - Y) * S, (X + Y) * S / 2];

const cache = new Map();
async function img(file, w, h, flip) {
  const k = `${file}|${w}|${h}|${flip}`; if (cache.has(k)) return cache.get(k);
  let im = sharp(file).resize(Math.max(1, w), Math.max(1, h), { fit: 'fill', kernel: 'lanczos3' }); if (flip) im = im.flop();
  const b = await im.png().toBuffer(); if (cache.size > 400) cache.clear(); cache.set(k, b); return b;
}
/** the back-to-front key of an upright: the screen y of its footprint's front corner (its anchor plus half its footprint) */
const depth = (s, it) => { const k = s.scale ?? 1, hx = (s.flip ? it.fh : it.fw) * k / 2, hy = (s.flip ? it.fw : it.fh) * k / 2; return s.x + s.y + hx + hy + (s.z ?? 0) * 0.001; };

/** the placements in drawing order (flats by z then screen y, then the uprights back to front), each with its library item */
export function drawOrder(placements) {
  const flats = [], ups = [];
  placements.forEach((s, i) => { const it = LIB.get(s.id); if (!it || !fs.existsSync(path.join(LIB_DIR, it.file))) return; (it.flat ? flats : ups).push({ s, it, i }); });
  flats.sort((a, b) => (a.s.z ?? 0) - (b.s.z ?? 0) || (a.s.x + a.s.y) - (b.s.x + b.s.y));
  ups.sort((a, b) => depth(a.s, a.it) - depth(b.s, b.it));
  return [...flats, ...ups];
}
/** a placement's picture rectangle in native screen px: [left, top, width, height] */
export function rectOf(s, it) { const k = s.scale ?? 1, [mx, my] = toScreen(s.x, s.y); return [s.flip ? mx - (it.w - it.ax) * k : mx - it.ax * k, my - it.ay * k, it.w * k, it.h * k]; }

/**
 * Render placements { id, x, y, flip, scale, z? } (metres) at `res` px per native px.
 * `box` = [sx0, sy0, sx1, sy1] in native screen px (the picture's extent); `ground` (optional) = a function(ctx) returning
 * composite inputs drawn first (already in picture px). Returns a sharp PNG buffer of the picture.
 */
export async function render(placements, box, res = 1, { background = { r: 0, g: 0, b: 0, alpha: 0 }, shadows = true, under = [] } = {}) {
  const W = Math.max(1, Math.round((box[2] - box[0]) * res)), H = Math.max(1, Math.round((box[3] - box[1]) * res));
  const flats = [], ups = [], shads = [];
  for (const s of placements) {
    const it = LIB.get(s.id); if (!it || !fs.existsSync(path.join(LIB_DIR, it.file))) continue;
    (it.flat ? flats : ups).push({ s, it });
    if (shadows && !it.flat && it.shadow && fs.existsSync(path.join(LIB_DIR, it.shadow.file))) shads.push({ s, it: it.shadow, dy: it.shadow.dy || 0 });
  }
  flats.sort((a, b) => (a.s.z ?? 0) - (b.s.z ?? 0) || (a.s.x + a.s.y) - (b.s.x + b.s.y));
  ups.sort((a, b) => depth(a.s, a.it) - depth(b.s, b.it));
  const comp = [...under];
  const put = async ({ s, it, dy = 0 }) => {
    const k = s.scale ?? 1, [mx, my0] = toScreen(s.x, s.y), my = my0 + dy * k;
    const left = (s.flip ? mx - (it.w - it.ax) * k : mx - it.ax * k) - box[0], top = my - it.ay * k - box[1];
    const w = Math.round(it.w * k * res), h = Math.round(it.h * k * res), l = Math.round(left * res), t = Math.round(top * res);
    if (l >= W || t >= H || l + w <= 0 || t + h <= 0 || w < 1 || h < 1) return;
    let b = await img(path.join(LIB_DIR, it.file), w, h, !!s.flip);
    const cl = Math.max(0, -l), ct = Math.max(0, -t), cw = Math.min(w - cl, W - Math.max(l, 0)), ch = Math.min(h - ct, H - Math.max(t, 0));
    if (cw <= 0 || ch <= 0) return;
    if (cl || ct || cw !== w || ch !== h) b = await sharp(b).extract({ left: cl, top: ct, width: cw, height: ch }).png().toBuffer();
    comp.push({ input: b, left: Math.max(l, 0), top: Math.max(t, 0) });
  };
  for (const f of flats) await put(f);
  for (const sh of shads) await put(sh);
  for (const u of ups) await put(u);
  return sharp({ create: { width: W, height: H, channels: 4, background } }).composite(comp).png().toBuffer();
}

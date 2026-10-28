// The fallen leaves' atlas (T220, #605): the pictures leaf-fall.ts lays out (piles, drifts, scatters, a few leaves), drawn once per ground
// worker from the game's leaf sprites (textures.ts leaves, as the litter's), tinted to their colours, each leaf on its shadow, packed in shelves.
// The renderer stamps a chunk's leaves from it (renderer.ts drawLeafFall), one drawImage a stamp at 1:1 on whole pixels: each level gets its
// own atlas drawn from the sprites (a scaled copy, or a stamp drawn at a scale, blurs the few-pixel leaves into the grass).
import { HH, HW, mulberry } from './iso';
import { LEAF_TINTS, PIC_LEAF, leafPictures } from './leaf-fall';
import { canvas, ctx2d, type Cnv } from './textures';

/** the atlas's width at level LEAF_ATLAS_L (px; narrower at the further levels) */
const LEAF_ATLAS_L = 0.6, LEAF_ATLAS_W = 1024;
/** how each tint (LEAF_TINTS) is laid over the leaf sprites: 'color' at alpha a (keeps each leaf's light and shade, takes the tint's hue), then
 *  an optional multiply (an oak's browns are darker than the sprites' oranges) */
const TINT_LOOK: readonly { a: number; mul?: string }[] = [{ a: 0 }, { a: 0.8, mul: '#f0a296' }, { a: 0.8, mul: '#e4d4c0' }, { a: 0.72 }, { a: 0.8, mul: '#e8ecd8' }];
/** the screen px per metre at level 1 (the litter's: textures.ts pickLeaf), a flat leaf's height on screen over its width (the litter's), and
 *  its shadow: toward the lower left (145 degrees, the sun at the upper right), its offset (px; at least SHADOW_MIN) and its darkness */
const LIFT = '#3c2410', PX_PER_M = 45.25, FLAT = 0.74, SHADOW_DX = -0.82, SHADOW_DY = 0.57, SHADOW_OFF = 2, SHADOW_MIN = 0.8, SHADOW_A = 0.26, SHADOW_RGB = '#0b0a14';

/** an atlas: its picture, and six floats per picture (leaf-fall.ts picOf): its rect x, y, w, h and its centre within it */
export type LeafAtlas = { cv: Cnv; rects: Float32Array };
/** a leaf sprite's rect in the sheet for a leaf of sizeM metres (textures.ts pickLeaf and leafRect) */
export type LeafPick = (r: () => number, sizeM: number) => [number, number, number, number];

/** the atlas at level L from the leaf sprite sheet */
export function leafAtlasAt(L: number, sheet: Cnv, pick: LeafPick): LeafAtlas {
  const pics = leafPictures(), ppm = PX_PER_M * L, pad = 2, off = Math.max(SHADOW_MIN, SHADOW_OFF * L), shX = SHADOW_DX * off, shY = SHADOW_DY * off;
  // the sheet in each colour
  // (each lifted by a warm screen: at a few pixels a sprite's dark outline and veins would dull it to a brown speck on the grass)
  const sheets = LEAF_TINTS.map((t, i) => {
    const c = canvas(sheet.width, sheet.height), g = ctx2d(c), look = TINT_LOOK[i]!;
    g.drawImage(sheet, 0, 0);
    if (t) { g.globalCompositeOperation = 'color'; g.globalAlpha = look.a; g.fillStyle = t; g.fillRect(0, 0, c.width, c.height); }
    if (look.mul) { g.globalCompositeOperation = 'multiply'; g.globalAlpha = 1; g.fillStyle = look.mul; g.fillRect(0, 0, c.width, c.height); }
    g.globalCompositeOperation = 'screen'; g.globalAlpha = 1; g.fillStyle = LIFT; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(sheet, 0, 0); return c;
  });
  // each picture's leaves on screen (its centre at 0, 0) and its box
  const laid = pics.map(v => {
    const ls: { X: number; Y: number; size: number; rot: number; col: number; src: [number, number, number, number] }[] = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k + PIC_LEAF <= v.length; k += PIC_LEAF) {
      const dx = v[k]!, dy = v[k + 1]!, sizeM = v[k + 2]!, X = (dx - dy) * HW * L, Y = (dx + dy) * HH * L, size = sizeM * ppm, h = size * 0.72 + 1;
      ls.push({ X, Y, size, rot: v[k + 3]!, col: v[k + 4]!, src: pick(mulberry(Math.floor(v[k + 5]! * 2147483647) + 1), sizeM) });
      x0 = Math.min(x0, X - h + Math.min(0, shX)); y0 = Math.min(y0, Y - h); x1 = Math.max(x1, X + h); y1 = Math.max(y1, Y + h + Math.max(0, shY));
    }
    if (!ls.length) { x0 = y0 = -1; x1 = y1 = 1; }
    return { ls, x0: Math.floor(x0) - pad, y0: Math.floor(y0) - pad, w: Math.ceil(x1) - Math.floor(x0) + 2 * pad, h: Math.ceil(y1) - Math.floor(y0) + 2 * pad };
  });
  // shelves, tallest first
  const W = Math.max(Math.ceil(LEAF_ATLAS_W * Math.min(1, L / LEAF_ATLAS_L)), ...laid.map(p => p.w)), order = laid.map((_, i) => i).sort((p, q) => laid[q]!.h - laid[p]!.h), rects = new Float32Array(pics.length * 6);
  let x = 0, y = 0, rowH = 0;
  // (its centre on a whole pixel: a stamp is drawn 1:1 on whole pixels)
  for (const i of order) { const p = laid[i]!; if (x + p.w > W) { x = 0; y += rowH; rowH = 0; } rects.set([x, y, p.w, p.h, -p.x0, -p.y0], i * 6); x += p.w; rowH = Math.max(rowH, p.h); }
  const cv = canvas(W, Math.max(1, y + rowH)), g = ctx2d(cv);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  // each picture's leaves: each one transform (its place, the flat squash and its turn) and one draw
  for (let i = 0; i < pics.length; i++) {
    const ox = rects[i * 6]! + rects[i * 6 + 4]!, oy = rects[i * 6 + 1]! + rects[i * 6 + 5]!;
    for (const l of laid[i]!.ls) { const c = Math.cos(l.rot), s = Math.sin(l.rot); g.setTransform(c, s * FLAT, -s, c * FLAT, ox + l.X, oy + l.Y); g.drawImage(sheets[l.col]!, ...l.src, -l.size / 2, -l.size / 2, l.size, l.size); }
  }
  // their shadows: the whole atlas black through its alpha, laid light under it, offset away from the sun (each picture's leaves as one
  // silhouette, so overlapping leaves cast no darker shadow; the pad keeps it in the picture's rect)
  const sh = canvas(cv.width, cv.height), sg = ctx2d(sh);
  sg.drawImage(cv, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = SHADOW_RGB; sg.fillRect(0, 0, sh.width, sh.height);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-over'; g.globalAlpha = SHADOW_A; g.drawImage(sh, shX, shY);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; sh.width = sh.height = 1;
  return { cv, rects };
}

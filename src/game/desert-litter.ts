// The desert's litter (T384, #1040; the owner, 2026-11-08: "can we change all the leaves on roads and scattered throughout the map that are decals or vectors and change them to desert stuff like sand, rocks and
// brown foliage"). In the desert theme every autumn leaf source of the ground bake lays desert litter instead, from sprite sheets drawn here on the autumn sheets' own layouts, so every placement, size, count and
// cost is the autumn's (one theme switch, the surfaces file's `desert`, drives them all: the sheets are picked where the leaves were):
//   - the leaf sprites (textures.ts leaves, 12 x 4 cells of 40 px, LEAVES): the road litter (gutter clumps, strays and the sidewalk edge), the ground scatter on the grass, the fallen leaves' piles, drifts and scatters
//     (leaf-fall.ts: along the kerbs, the fences and walls, under the trees, in the yards) and the living ground's litter under trees are pebbles, clumps of sand, dry twigs, tufts of dry grass and tumbleweed tangles;
//   - the lots' flat decals (lot-decals.ts group 'leaves': piles, drifts, scatters on lots, drives and car parks): sand drifts with ripples, heaps of sand and pebbles, scatters of grit, dry brush;
//   - the map decals (map-decals.ts: its leaf scatters and the nature patches): the same.
// The pictures are STAND-INS drawn with the canvas ("Stand In for desert litter": docs/GOLF-SPRITES.md asks for painted ones): the sun is at the upper right (a pebble is lit there, its shade and contact shadow fall to
// the lower left), no flat colour wash (every picture is soft-edged, textured grit and strokes), the colours sand, stone, dry brown and a little grey-green, never an autumn red, orange or green leaf.
// Pure canvas code (OffscreenCanvas through canvas2d.ts); deterministic (a seeded stream per cell and per decal).
import { mulberry } from './iso';
import { DECALS, LEAF_CELL, LEAF_COLS, LEAVES } from './ground-art';
import { LOT_DECALS } from './lot-decals';
import { NATURE } from './nature-patches';
import { canvas, ctx2d, type C2D, type Cnv } from './canvas2d';

/** the litter's colours: sand (pale to deep), stone (grey and brown), dry brush (browns), a little grey-green sage, and the dust of a dry road */
export const SAND = ['#e6c27c', '#dcb56a', '#ecca8a', '#d3a95e'] as const;
export const STONE = ['#ad8c66', '#966f48', '#bba07e', '#a39482', '#8a7b69', '#746758'] as const;
export const BRUSH = ['#6e4f32', '#8a6a42', '#5a4128', '#9a7b50'] as const;
export const SAGE = ['#8c9468', '#7f8860', '#a3a67b'] as const;
export const DUST = '#caa878';
/** the straw of a dry tuft */
export const STRAW = ['#c9b88a', '#b9a574', '#d3c295'] as const;
/** the tints the fallen leaves' atlas lays over the desert sprites in place of the leaves' (leaf-atlas.ts: as drawn, sand, stone, dry brown, sage), and how (alpha, the multiply) */
export const DESERT_TINTS = ['', '#e6c27c', '#b88a4c', '#dfbb80', '#c9a470'] as const; // (in the leaves' order of moods: as drawn, sand where the maple's red was, dry brown for the oak's brown, straw for the gold, stone for the green: warm ones lead, so a pile under a palm is sand and dry brush, not grey)
/** the strokes of the grass tufts at the kerb's edge in the desert: dry straw and brown (the autumn grass is green) */
export const DESERT_TUFT = ['#a08a5a', '#b9a574', '#7d6a45', '#c9b88a'] as const;
export const DESERT_TINT_LOOK: readonly { a: number; mul?: string }[] = [{ a: 0 }, { a: 0.55 }, { a: 0.5 }, { a: 0.55 }, { a: 0.45 }];
/** the desert litter's sprites are drawn this much bigger than the leaves they stand for (the same counts and places: a pebble or a clump of sand a hand's breadth across reads on a road at the closest zoom, a leaf's 0.1 to 0.6 m does not),
 *  and the fallen leaves' piles (leaf-atlas.ts: dozens of sprites a pile) a little less (at the road litter's size a pile of them was one grey stain), and they cast a lighter shadow */
export const DESERT_LITTER_SCALE = 1.7, DESERT_FALL_SCALE = 1.15, DESERT_SHADOW_A = 0.05; // (a soft clump of sand has a soft silhouette: its shadow is a faint one, or it is a grey haze)

const pick = <T>(a: readonly T[], r: () => number): T => a[Math.floor(r() * a.length) % a.length]!;
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgba = (h: string, a: number): string => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };
const TAU = Math.PI * 2;

/* ---- the pieces (pixels; (x, y) a centre) ---- */
/** a pebble: a rounded irregular stone, lit toward the upper right (the sun) and shaded toward the lower left, with a contact shadow beside it and a thin dark rim */
export function pebble(g: C2D, x: number, y: number, rad: number, r: () => number, tone: string = r() < 0.65 ? pick(STONE.slice(0, 3), r) : pick(STONE.slice(3), r)): void {
  g.save(); g.translate(x, y);
  g.fillStyle = 'rgba(40,28,18,0.18)'; g.beginPath(); g.ellipse(-rad * 0.28, rad * 0.34, rad * 1.02, rad * 0.62, 0, 0, TAU); g.fill();
  g.rotate(r() * TAU); g.scale(1, 0.74 + r() * 0.22);
  const path = () => { const n = 7 + Math.floor(r() * 3); g.beginPath(); for (let k = 0; k < n; k++) { const a = (k / n) * TAU, q = rad * (0.8 + r() * 0.3); k ? g.lineTo(Math.cos(a) * q, Math.sin(a) * q) : g.moveTo(Math.cos(a) * q, Math.sin(a) * q); } g.closePath(); };
  path(); g.fillStyle = tone; g.fill();
  const gr = g.createRadialGradient(rad * 0.35, -rad * 0.35, rad * 0.05, 0, 0, rad * 1.1);
  gr.addColorStop(0, 'rgba(255,244,220,0.55)'); gr.addColorStop(0.45, 'rgba(255,244,220,0)'); gr.addColorStop(1, 'rgba(40,30,20,0.5)');
  g.fillStyle = gr; g.fill(); g.lineWidth = Math.max(0.5, rad * 0.08); g.strokeStyle = 'rgba(50,40,30,0.42)'; g.stroke();
  g.restore();
}
/** a clump of sand: a soft-edged heap, pale on top and deeper at the edge, with a few grains of grit; never a hard disc */
export function sandClump(g: C2D, x: number, y: number, rad: number, r: () => number, tone: string = pick(SAND, r)): void {
  g.save(); g.translate(x, y); g.rotate(r() * TAU); g.scale(1, 0.62 + r() * 0.2);
  const gr = g.createRadialGradient(rad * 0.15, -rad * 0.12, rad * 0.05, 0, 0, rad);
  gr.addColorStop(0, rgba(tone, 0.97)); gr.addColorStop(0.68, rgba(tone, 0.9)); gr.addColorStop(0.9, rgba(tone, 0.4)); gr.addColorStop(1, rgba(tone, 0)); // (a firm edge: soft ones laid over each other in a pile were one smoky veil)
  g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, rad, rad * (0.8 + r() * 0.2), 0, 0, TAU); g.fill();
  for (let k = 0; k < 3 + Math.floor(rad / 3); k++) { const a = r() * TAU, d = r() * rad * 0.8; g.fillStyle = rgba(pick(k % 2 ? STONE : BRUSH, r), 0.5 + r() * 0.3); g.fillRect(Math.cos(a) * d, Math.sin(a) * d, Math.max(0.6, rad * 0.07), Math.max(0.6, rad * 0.07)); }
  g.restore();
}
/** a dry twig with a side twig or two (brush), the colour of old wood, a lighter edge on its upper side */
export function twig(g: C2D, x: number, y: number, len: number, ang: number, r: () => number): void {
  g.save(); g.translate(x, y); g.rotate(ang); g.lineCap = 'round';
  const w = Math.max(0.7, len / 24), tone = pick(BRUSH, r), bend = (r() - 0.5) * len * 0.3;
  const stroke = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, lw: number) => {
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1);
    g.strokeStyle = 'rgba(30,22,14,0.35)'; g.lineWidth = lw + 0.8; g.translate(-0.4, 0.5); g.stroke(); g.translate(0.4, -0.5);
    g.strokeStyle = tone; g.lineWidth = lw; g.stroke();
  };
  stroke(-len / 2, 0, 0, bend, len / 2, bend * 0.4, w);
  for (let k = 0, n = 1 + Math.floor(r() * 3); k < n; k++) { const t = 0.2 + r() * 0.55, sx = -len / 2 + len * t, sy = bend * (1 - (2 * t - 1) ** 2) * 0.5, s = (r() < 0.5 ? -1 : 1), l = len * (0.22 + r() * 0.2); stroke(sx, sy, sx + l * 0.4, sy + s * l * 0.4, sx + l * 0.8, sy + s * l, w * 0.7); }
  g.restore();
}
/** a tuft of dry grass: pale blades fanning from a base, the colours of straw and dry brown, a few sage */
export function bladeTuft(g: C2D, x: number, y: number, len: number, r: () => number): void {
  g.save(); g.translate(x, y); g.lineCap = 'round';
  const n = 5 + Math.floor(r() * 5);
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (k / (n - 1) - 0.5) * 1.6 + (r() - 0.5) * 0.3, l = len * (0.55 + r() * 0.45), c = (r() - 0.5) * l * 0.3;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(Math.cos(a) * l * 0.5 + c, Math.sin(a) * l * 0.5, Math.cos(a) * l, Math.sin(a) * l);
    g.strokeStyle = rgba(pick(k % 4 === 3 ? SAGE : [...SAND, ...BRUSH.slice(1)], r), 0.9); g.lineWidth = Math.max(0.6, len / 22); g.stroke();
  }
  g.restore();
}
/** a tumbleweed tuft: a loose round tangle of thin dry stems, light on its upper right and dark inside, with its shadow to the lower left */
export function tumbleweed(g: C2D, x: number, y: number, rad: number, r: () => number, bold = false): void {
  g.save(); g.translate(x, y);
  g.fillStyle = 'rgba(40,28,18,0.22)'; g.beginPath(); g.ellipse(-rad * 0.3, rad * 0.4, rad * 0.95, rad * 0.5, 0, 0, TAU); g.fill();
  g.scale(1, 0.85); g.lineCap = 'round';
  for (let k = 0, n = 14 + Math.floor(rad); k < n; k++) {
    const a0 = r() * TAU, a1 = a0 + 0.8 + r() * 1.8, q = rad * (0.45 + r() * 0.55), cx = (r() - 0.5) * rad * 0.5, cy = (r() - 0.5) * rad * 0.5;
    g.beginPath(); g.arc(cx, cy, q, a0, a1); g.strokeStyle = rgba(pick(k % 3 ? BRUSH : SAND, r), bold ? 0.6 + r() * 0.35 : 0.35 + r() * 0.4); g.lineWidth = Math.max(0.5, rad / (bold ? 6 : 14)); g.stroke();
  }
  g.restore();
}
/** a chunk of dry brush: a few thick stems crossed, brown, with a pale cut end each: it keeps its dark and light as a speck of a few pixels where a tangle of thin stems blurred to a veil */
export function brushChunk(g: C2D, x: number, y: number, len: number, r: () => number): void {
  g.save(); g.translate(x, y); g.rotate(r() * TAU); g.lineCap = 'round';
  for (let k = 0, n = 5 + Math.floor(r() * 3); k < n; k++) {
    const a = (k / n) * Math.PI + (r() - 0.5) * 0.5, l = len * (0.45 + r() * 0.4);
    g.beginPath(); g.moveTo(-Math.cos(a) * l * 0.45, -Math.sin(a) * l * 0.45); g.lineTo(Math.cos(a) * l, Math.sin(a) * l);
    g.strokeStyle = 'rgba(30,22,14,0.3)'; g.lineWidth = len / 8 + 0.8; g.translate(-0.5, 0.6); g.stroke(); g.translate(0.5, -0.6);
    g.strokeStyle = pick(BRUSH, r); g.lineWidth = len / 8; g.stroke();
  }
  g.restore();
}
/** a tuft of straw: stout pale blades fanning from a base (no sage: it read as a grey-green stain), the colours of straw and sand */
export function strawTuft(g: C2D, x: number, y: number, len: number, r: () => number): void {
  g.save(); g.translate(x, y); g.lineCap = 'round';
  const n = 6 + Math.floor(r() * 4);
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (k / (n - 1) - 0.5) * 1.5 + (r() - 0.5) * 0.3, l = len * (0.55 + r() * 0.45), c = (r() - 0.5) * l * 0.3;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(Math.cos(a) * l * 0.5 + c, Math.sin(a) * l * 0.5, Math.cos(a) * l, Math.sin(a) * l);
    g.strokeStyle = rgba(pick(k % 3 === 2 ? BRUSH.slice(1) : [...SAND, ...STRAW], r), 0.95); g.lineWidth = Math.max(1.4, len / 11); g.stroke();
  }
  g.restore();
}
/** a streak of windblown sand: three clumps along a line, grit in it and a stone at an end */
export function sandStreak(g: C2D, x: number, y: number, len: number, r: () => number): void {
  g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 0.5);
  const tone = pick(SAND, r);
  for (let k = -1; k <= 1; k++) sandClump(g, k * len * 0.28 + (r() - 0.5) * 2, (r() - 0.5) * 3, len * (0.27 + r() * 0.08), r, tone);
  pebble(g, len * (r() < 0.5 ? -0.42 : 0.42), (r() - 0.5) * 4, 2.8 + r() * 1.6, r);
  g.restore();
}

/* ---- the pictures (a rect of an atlas: x0, y0, w, h in px) ---- */
type Rect = { x: number; y: number; w: number; h: number };
const within = (v: Rect, r: () => number, inset = 0.12): [number, number] => [v.x + v.w * (inset + r() * (1 - 2 * inset)), v.y + v.h * (inset + r() * (1 - 2 * inset))];
/** a sand drift: an elongated soft-edged heap along a slightly curved axis, fine ripples running along it, a few pebbles at its ends */
export function drift(g: C2D, v: Rect, r: () => number): void {
  const n = 7 + Math.floor(r() * 4), cx = v.x + v.w / 2, cy = v.y + v.h / 2, ax = v.w * 0.4, ay = v.h * 0.3, a = (r() - 0.5) * 0.35, tone = pick(SAND, r);
  for (let k = 0; k < n; k++) { const t = k / (n - 1) * 2 - 1, x = cx + t * ax * Math.cos(a), y = cy + t * ax * Math.sin(a) * 0.5 + Math.sin(t * 2.2) * ay * 0.35, rad = Math.min(v.h * 0.5, v.w * 0.16) * (0.75 + 0.35 * Math.cos(t * 1.4) + r() * 0.2); sandClump(g, x, y, rad, r, k % 3 === 0 ? pick(SAND, r) : tone); }
  g.save(); g.lineCap = 'round'; g.lineWidth = Math.max(0.6, v.h / 70);
  for (let k = 0; k < 6; k++) { const y0 = cy + (k - 2.5) * v.h * 0.07, x0 = cx - ax * (0.7 - r() * 0.2), x1 = cx + ax * (0.7 - r() * 0.2); g.strokeStyle = k % 2 ? 'rgba(255,240,205,0.4)' : 'rgba(120,88,52,0.3)'; g.beginPath(); g.moveTo(x0, y0 + Math.sin(k) * 1.5); g.quadraticCurveTo((x0 + x1) / 2, y0 + (r() - 0.5) * v.h * 0.06, x1, y0 + Math.cos(k) * 1.5); g.stroke(); }
  g.restore();
  for (let k = 0; k < 3; k++) { const [x, y] = within(v, r, 0.18); pebble(g, x, y, Math.max(1.4, Math.min(v.w, v.h) * (0.025 + r() * 0.02)), r); }
}
/** a scatter: grit over the rect, pebbles and clumps of sand and bits of brush, thin to thick by `n` */
export function scatter(g: C2D, v: Rect, r: () => number, n: number): void {
  const u = Math.min(v.w, v.h);
  for (let k = 0; k < n; k++) {
    const [x, y] = within(v, r, 0.06), q = r();
    if (q < 0.5) pebble(g, x, y, Math.max(1.1, u * (0.014 + r() * 0.03)), r);
    else if (q < 0.78) sandClump(g, x, y, Math.max(2, u * (0.03 + r() * 0.05)), r);
    else if (q < 0.92) twig(g, x, y, Math.max(4, u * (0.07 + r() * 0.08)), r() * TAU, r);
    else bladeTuft(g, x, y + u * 0.03, Math.max(4, u * (0.06 + r() * 0.06)), r);
  }
}
/** a heap of sand with pebbles on it and round it (a pile): layered soft mounds, ripples on the lit side */
export function heap(g: C2D, v: Rect, r: () => number): void {
  const cx = v.x + v.w / 2, cy = v.y + v.h * 0.58, rad = Math.min(v.w * 0.42, v.h * 0.7);
  sandClump(g, cx, cy, rad, r, SAND[0]); sandClump(g, cx + rad * 0.12, cy - rad * 0.12, rad * 0.7, r, SAND[2]); sandClump(g, cx + rad * 0.2, cy - rad * 0.2, rad * 0.38, r, SAND[2]);
  g.save(); g.lineCap = 'round'; g.lineWidth = Math.max(0.6, rad / 40);
  for (let k = 0; k < 4; k++) { g.strokeStyle = 'rgba(255,240,205,0.35)'; g.beginPath(); g.ellipse(cx + rad * 0.1, cy - rad * 0.05, rad * (0.28 + k * 0.14), rad * (0.14 + k * 0.07), -0.2, Math.PI * 1.05, Math.PI * 1.75); g.stroke(); }
  g.restore();
  for (let k = 0; k < 5; k++) { const a = r() * TAU, d = rad * (0.5 + r() * 0.7); pebble(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.5, Math.max(1.3, rad * (0.05 + r() * 0.05)), r); }
}
/** dry brush: a few tufts of dry grass, twigs and a grey-green sprig on a little drift of sand */
export function brushPatch(g: C2D, v: Rect, r: () => number): void {
  const cx = v.x + v.w / 2, cy = v.y + v.h * 0.55, u = Math.min(v.w, v.h);
  sandClump(g, cx, cy + u * 0.05, u * 0.42, r, SAND[1]);
  for (let k = 0; k < 4; k++) { const [x, y] = within(v, r, 0.2); twig(g, x, y, u * (0.14 + r() * 0.14), r() * TAU, r); }
  for (let k = 0; k < 4; k++) { const [x, y] = within(v, r, 0.22); bladeTuft(g, x, y + u * 0.04, u * (0.14 + r() * 0.12), r); }
  const [x, y] = within(v, r, 0.3); tumbleweed(g, x, y, u * 0.12, r);
}
/** a nature patch (a 16 m clump of the builder's decals): a blotch of sand with stones, dry brush and tufts, its kind setting the mix */
export function patch(g: C2D, v: Rect, kind: string, r: () => number): void {
  const cx = v.x + v.w / 2, cy = v.y + v.h / 2, u = Math.min(v.w, v.h);
  for (let k = 0, n = 5 + Math.floor(r() * 3); k < n; k++) { const [x, y] = within(v, r, 0.2); sandClump(g, x, y, u * (0.22 + r() * 0.2), r); }
  for (let k = 0, n = kind === 'bare' ? 10 : 6; k < n; k++) { const [x, y] = within(v, r, 0.12); pebble(g, x, y, u * (0.03 + r() * 0.05), r); }
  for (let k = 0, n = kind === 'golden' || kind === 'wild' ? 7 : 3; k < n; k++) { const [x, y] = within(v, r, 0.15); if (k % 2) twig(g, x, y, u * (0.18 + r() * 0.2), r() * TAU, r); else bladeTuft(g, x, y, u * (0.18 + r() * 0.2), r); }
  if (r() < 0.5) tumbleweed(g, cx + (r() - 0.5) * v.w * 0.4, cy + (r() - 0.5) * v.h * 0.4, u * 0.1, r);
}

/* ---- the sheets ---- */
/** a new canvas holding only the rects `rects` (each cleared, clipped and painted by `paint` with its own seeded stream), as big as the rects reach: the desert pictures sit on their autumn pictures' own rects (the same x, y, w, h), so
 *  whatever places an autumn picture finds the desert one in the same place of its sheet. Nothing else of the autumn atlas is copied (the lots' atlas is 2048 x 1180 px: the leaf pictures are its top rows) */
function repaint(rects: readonly Rect[], seed: number, paint: (g: C2D, v: Rect, i: number, r: () => number) => void): Cnv {
  const out = canvas(Math.max(1, ...rects.map(v => v.x + v.w + 1)), Math.max(1, ...rects.map(v => v.y + v.h + 1))), g = ctx2d(out);
  rects.forEach((v, i) => { g.save(); g.beginPath(); g.rect(v.x, v.y, v.w, v.h); g.clip(); g.clearRect(v.x, v.y, v.w, v.h); paint(g, v, i, mulberry((seed + i * 2654435761) >>> 0)); g.restore(); });
  return out;
}

/** the leaf sprite sheet as desert litter: each LEAVES cell (the same 40 px cells, the same sizes: the autumn picker finds them) holds a pebble, a clump of sand, two pebbles or grit (the round ones: pebbles and sand) or a twig, a tuft of
 *  dry grass, a curled dry frond or a tumbleweed tuft (the long ones: brush) */
export function desertLeafSheet(): Cnv {
  const cell = (i: number): Rect => ({ x: (i % LEAF_COLS) * LEAF_CELL, y: Math.floor(i / LEAF_COLS) * LEAF_CELL, w: LEAF_CELL, h: LEAF_CELL });
  return repaint(LEAVES.map(l => cell(l.i)), 0xde5e47, (g, v, k, r) => {
    const l = LEAVES[k]!, cx = v.x + v.w / 2, cy = v.y + v.h / 2, q = l.i % 5;
    if (l.round) {
      // (mostly sand, which is paler than the ground: a pile of dark stones was a grey stain on the orange, and a pale drift with a few stones in it is what the wind leaves)
      if (q === 0 || q === 1 || (q === 2 && l.i % 2)) sandClump(g, cx, cy, q === 0 ? 14 : q === 1 ? 11 : 12, r);
      else if (q === 2) pebble(g, cx, cy, 9 + r() * 2, r);
      else if (q === 3) { sandClump(g, cx + 2, cy + 1, 10, r); pebble(g, cx - 5, cy + 3, 6, r); pebble(g, cx + 7, cy - 4, 4.5, r); }
      else { sandClump(g, cx, cy, 9, r); for (let j = 0; j < 3; j++) pebble(g, cx + (r() - 0.5) * 16, cy + (r() - 0.5) * 14, 2.8 + r() * 1.6, r); }
    } else {
      // (the fallen leaves' piles and the road litter above 0.2 m draw these cells, 3 px across at the zoom the owner looks from: chunky forms that keep their light and dark, not thin stems that blur to a smoky veil)
      const t = l.i % 4;
      if (t === 0) sandStreak(g, cx, cy, 34, r);
      else if (t === 1) brushChunk(g, cx, cy, 26, r);
      else if (t === 2) strawTuft(g, cx, cy + 12, 28, r);
      else tumbleweed(g, cx, cy, 13 + (l.dim > 33 ? 2 : 0), r, true);
    }
  });
}
/** the lots' leaf decals (lot-decals.ts group 'leaves') as desert litter, on their own rects of the atlas (a canvas as high as they reach: drawMarks reads these decals from it and the rest from the autumn atlas): drifts, heaps of sand,
 *  scatters of grit and dry brush, picked by the decal's own name */
export function desertLotDecals(): Cnv {
  const decals = LOT_DECALS.filter(d => d.group === 'leaves');
  return repaint(decals, 0x10d3c1, (g, v, i, r) => {
    const id = decals[i]!.id;
    if (/drift/.test(id)) drift(g, v, r);
    else if (/cluster|pile/.test(id)) heap(g, v, r);
    else if (/yellow|tiny/.test(id)) brushPatch(g, v, r);
    else scatter(g, v, r, 28 + Math.floor(v.w * v.h / 1400));
  });
}
/** the map decals' pictures (decals.webp: DECALS) in the desert: its leaf scatters as grit, its grass patches and tufts (green) as dry brush */
export function desertMapDecals(): Cnv {
  return repaint(DECALS, 0xdec4a1, (g, v, i, r) => { if (DECALS[i]!.kind === 'leaves') scatter(g, v, r, 40); else brushPatch(g, v, r); });
}
/** the nature patches (nature.webp: NATURE) as desert patches: sand blotches with stones, brush and tufts */
export function desertNature(): Cnv { return repaint(NATURE, 0x5a7d0e, (g, v, i, r) => patch(g, v, NATURE[i]!.kind, r)); }

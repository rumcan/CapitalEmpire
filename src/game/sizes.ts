// Sizes: no sprite is drawn above the pixels its atlas rect holds at the closest zoom (the owner, 2026-10-24: "Some are even placed so big they
// pixelate. How is that possible?"). At ZOOM_MAX (0.3 CSS px per world px) on a dpr-2 screen one display px is 0.6 device px, which is what mip 0
// holds for a sprite packed at scale 1 (ATLAS_MIP0). A sprite packed for a bigger draw holds more (prep-sprites.mjs and prep-views.mjs pack each
// picture at its largest drawn scale, as far as its source goes), so each item's limit is read from its own atlas rect: its tex size in atlas px
// over its quad in display px. newart.ts lookOf, the one place the draw scale is decided, never draws past it.
import { ATLAS_MIP0, ATLAS_SIZE, LIBRARY } from './library';
import type { LibItem } from './types';

/** the share a draw may exceed its limit by: the half-pixel rounding of a packed rect (prep-views rounds each view to whole atlas px) */
export const PIXEL_SLACK = 1.02;

/** the atlas px per display px a library item's rect holds (the smaller of its two axes; 0 for an empty rect) */
export function atlasRes(it: LibItem): number {
  const [, u0, v0, u1, v1] = it.tex, [x0, y0, x1, y1] = it.quad;
  const rx = x1 > x0 ? (u1 - u0) * ATLAS_SIZE / (x1 - x0) : 0, ry = y1 > y0 ? (v1 - v0) * ATLAS_SIZE / (y1 - y0) : 0;
  return Math.min(rx, ry);
}

/** the largest scale (a multiple of its display size w x h) an item is drawn at without stretching its atlas pixels at the closest zoom */
export function pixelLimit(it: LibItem): number { return atlasRes(it) / ATLAS_MIP0; }

/** pixelLimit of every library item, by index (library.ts appends every library before it exports, so LIBRARY is complete here) */
export const PIXEL_LIMIT: Float64Array = Float64Array.from(LIBRARY, pixelLimit);

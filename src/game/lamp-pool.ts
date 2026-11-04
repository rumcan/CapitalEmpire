/** T324 (#924): where a street lamp's light pool lies on the ground, and its shape (the owner, 2026-11-04: "we need those lights right below
 *  them and a diffrent shaped on needs to be made. the current one does not work on every road angle we have").
 *
 *  - **Where:** straight below the lamp's head (its lantern: the library's large glows), on the ground at the pole's foot (the footprint's
 *    centre). The pictures are drawn upright, so a head drawn beside the pole (an arm) is out along the screen-horizontal ground line through
 *    the foot: dx picture px sideways is (dx / TW, -dx / TW) tiles. Mirrored pictures are mirrored on screen, turned views use their own glows.
 *    Not snapped to the kerb (the old pool sat on the nearest curb point, off the lamp: network.ts setLamps).
 *  - **Shape:** one round pool on the ground plane for every road heading (TrickOrTreat's stamp was a streak turned to one screen angle, so it
 *    hung down the road on the screen-straight streets): a disc of radius POOL_R tiles on the ground, brightest under the head with a soft
 *    falloff to nothing at its rim (poolAt). Laid through the ground's own world-to-picture transform (poolStampMatrix), the disc is the ground
 *    circle's projection: a 2:1 ellipse on screen. The bake lights the asphalt toward its 'lit' mosaics by it (renderer.ts step 9), so it
 *    brightens and warms the painting's own texture, never a flat wash.
 *
 *  Pure: the node tests run it. */
import { TW } from './iso';
import type { LibItem } from './types';

/** the pool's radius on the ground (tiles; 5.2 m): about the old stamp's lit area (6.5 x 4.1 tiles), so no more pixels drawn per pool */
export const POOL_R = 2.6;
/** the pool stamp's size (px): a white disc whose alpha is the pool's intensity, drawn stretched over 2 POOL_R tiles of ground */
export const POOL_STAMP = 256;
/** a glow at least this big (picture px) is a lamp's head; the small ones are glints on the pole */
const HEAD_GLOW = 6;

/** the pool's intensity at r tiles from its centre: 1 under the head, a soft falloff, 0 (with no slope: no edge) at POOL_R and beyond */
export function poolAt(r: number): number {
  const s = r / POOL_R; if (!(s < 1)) return 0;
  const t = 1 - s * s; return t * t * t;
}

/** the stamp's alpha, row by row (POOL_STAMP squared): poolAt of each pixel's distance from the stamp's centre, the stamp spanning 2 POOL_R */
export function poolStampAlpha(n = POOL_STAMP): Float32Array {
  const a = new Float32Array(n * n), k = (2 * POOL_R) / n;
  for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) a[v * n + u] = poolAt(Math.hypot((u + 0.5 - n / 2) * k, (v + 0.5 - n / 2) * k));
  return a;
}

/** a 2D affine transform [a, b, c, d, e, f] (as DOMMatrix: x' = a x + c y + e, y' = b x + d y + f) */
export type Affine = [number, number, number, number, number, number];
const mul = (m: readonly number[], n: readonly number[]): Affine => [
  m[0]! * n[0]! + m[2]! * n[1]!, m[1]! * n[0]! + m[3]! * n[1]!, m[0]! * n[2]! + m[2]! * n[3]!, m[1]! * n[2]! + m[3]! * n[3]!,
  m[0]! * n[4]! + m[2]! * n[5]! + m[4]!, m[1]! * n[4]! + m[3]! * n[5]! + m[5]!];
/** the stamp's transform for a pool at (x, y) tiles under the ground's world-to-picture transform m: the stamp's centre on the pool, its
 *  n px spanning 2 POOL_R tiles of ground, so its disc is the ground circle (a 2:1 ellipse on screen) whatever the road's heading */
export function poolStampMatrix(m: readonly number[], x: number, y: number, n = POOL_STAMP): Affine {
  const k = (2 * POOL_R) / n;
  return mul(m, [k, 0, 0, k, x - POOL_R, y - POOL_R]);
}

type Placed = { x: number; y: number; flip: boolean; scale: number };
/** the ground point straight below a lamp's head (tiles), for the picture it is drawn as (item, anchor, mirror and scale) */
export function lampGround(it: Pick<LibItem, 'ax' | 'boxes' | 'glows'>, p: Placed): { x: number; y: number } {
  // the pole's foot: the footprint's centre (as engine.ts footprint)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of it.boxes) {
    const hx = (p.flip ? b.hy : b.hx) * p.scale / 2, hy = (p.flip ? b.hx : b.hy) * p.scale / 2, dx = (p.flip ? b.dy : b.dx) * p.scale / 2, dy = (p.flip ? b.dx : b.dy) * p.scale / 2;
    x0 = Math.min(x0, dx - hx); x1 = Math.max(x1, dx + hx); y0 = Math.min(y0, dy - hy); y1 = Math.max(y1, dy + hy);
  }
  const fx = it.boxes.length ? p.x + (x0 + x1) / 2 : p.x, fy = it.boxes.length ? p.y + (y0 + y1) / 2 : p.y;
  // the head: the large glows' mean across the picture (px from the anchor, mirrored with it, scaled: world px at zoom 1)
  let sum = 0, n = 0;
  for (const g of it.glows ?? []) if (g.r >= HEAD_GLOW) { sum += g.x; n++; }
  if (!n) return { x: fx, y: fy };
  const hx = (p.flip ? it.ax - sum / n : sum / n - it.ax) * p.scale;
  // the foot's own screen x from the anchor, (fx - x - (fy - y)) TW / 2; the head's offset from it along the screen-horizontal ground line
  const ds = hx - ((fx - p.x) - (fy - p.y)) * (TW / 2);
  return { x: fx + ds / TW, y: fy - ds / TW };
}

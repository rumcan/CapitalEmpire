// The starter cart paths' painted look and sun bevel (T084; lined up with the paths in T139). The ground painter (renderer.ts 5a) paints each
// surface kind (packed dirt, cement slabs) in flat colour and lights it with the one sun at the screen's upper right: a light rim along the
// edges facing the sun, a shade rim along those facing away, and under the slabs a thin cast shade falling at 145° on screen (cast-shadow.ts).
// A rim is the paths' mask less the same paths stepped a little along the sun's ground direction (SUN_TILE_DIR), so it follows the paths' own
// edges, ends, bends and spurs, as deep as each edge faces the sun. The step is taken on the paths in tile space: they are drawn again under a
// stepped chunk transform. T084 slid the chunk's baked mask instead (drawImage at a pixel offset), and the slid copy came in empty along the
// chunk's border, so every path crossing a ground chunk's edge got a bevel bar straight across it (light on one side of the seam, shade on
// the other), lined up with nothing on the path (T139, the owner's screenshot 2026-10-26).
// Pure TypeScript over a 2D context: an OffscreenCanvas in the ground worker, a software raster in tests/cart-bevel.test.ts.
import { SUN_TILE_DIR } from './ext/course-height';
import type { Feature, Pt } from './network';

/** a starter cart path's painted look, by road surface (the hand-painted game-art style of T082): a flat fill (multiplied by the grime
 *  blotches), the bevel rims' colours and strengths (light on the edges facing the sun, shade on those facing away), a dirt path's feathered
 *  worn halo, and the slabs' thin cast shade. The planner's flat colour is plan */
export interface CartLook { fill: string; plan: string; lit: string; litA: number; shade: string; shadeA: number; halo?: string; cast?: string }
export const CART_SURFACE = new Map<string, CartLook>([
  ['dirt', { fill: '#cba673', plan: '#b08f60', lit: '#fbe8c0', litA: 0.5, shade: '#5e4127', shadeA: 0.3, halo: 'rgba(98,74,42,0.55)' }],
  ['cement', { fill: '#d4d0c7', plan: '#bdb9b0', lit: '#fdfaf2', litA: 0.75, shade: '#6c675e', shadeA: 0.5, cast: 'rgba(18,22,16,0.32)' }],
]);
/** how deep a bevel rim reaches in from an edge facing straight at (or away from) the sun, and how far the slabs' cast shade falls, tiles */
export const CART_RIM = 0.11, CART_CAST = 0.09;

/** a step of s tiles on the ground away from the sun, the way the cast shadows fall (145° on screen); a negative s steps toward the sun */
export const fromSun = (s: number): Pt => ({ x: -SUN_TILE_DIR.x * s, y: -SUN_TILE_DIR.y * s });

/** a chunk's transform from tile space to its pixels (a DOMMatrix's fields) */
export interface Affine { readonly a: number; readonly b: number; readonly c: number; readonly d: number; readonly e: number; readonly f: number }
/** the 2D-context calls the bevel makes, on chunk buffers of image type I */
export interface BevelCtx<I> {
  globalCompositeOperation: GlobalCompositeOperation; globalAlpha: number;
  fillStyle: string | CanvasGradient | CanvasPattern; strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number; lineCap: CanvasLineCap; lineJoin: CanvasLineJoin;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  stroke(path: Path2D): void; fill(path: Path2D): void; fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: I, dx: number, dy: number): void;
}

/** the features' coverage in col (black by default), drawn into g under the chunk transform M with the features stepped `step` tiles (the
 *  paths beyond the chunk's edge step in with the rest); leaves g's transform at the identity */
export function drawPaths<I>(g: BevelCtx<I>, feats: readonly Feature[], M: Affine, step: Pt = { x: 0, y: 0 }, col = '#000') {
  g.setTransform(M.a, M.b, M.c, M.d, M.e + M.a * step.x + M.c * step.y, M.f + M.b * step.x + M.d * step.y);
  g.lineJoin = 'round'; g.fillStyle = g.strokeStyle = col;
  for (const f of feats) { g.lineCap = f.cap; if (f.kind === 'stroke') { g.lineWidth = f.w; g.stroke(f.path); } else g.fill(f.path); }
  g.setTransform(1, 0, 0, 1, 0, 0);
}

/** a bevel rim into g, a cleared W x H chunk buffer: col over the paths' mask m (drawPaths of feats), less the same paths stepped s tiles from
 *  the sun. A positive s leaves the edges facing the sun (the light rim), a negative one those facing away (the shade rim) */
export function cartRim<I>(g: BevelCtx<I>, m: I, feats: readonly Feature[], M: Affine, W: number, H: number, col: string, s: number) {
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(m, 0, 0);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out'; drawPaths(g, feats, M, fromSun(s));
  g.globalCompositeOperation = 'source-over';
}

/** the slabs' thin cast shade into g, a cleared W x H chunk buffer: the paths stepped CART_CAST tiles from the sun, in col */
export function cartCast<I>(g: BevelCtx<I>, feats: readonly Feature[], M: Affine, W: number, H: number, col: string) {
  drawPaths(g, feats, M, fromSun(CART_CAST));
  g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
}

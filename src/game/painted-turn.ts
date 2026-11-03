import type { CourseTex } from './ground-protocol';

/** T311 (#896, also T290 #875 and T301 #886): a painted texture (a studio look, Textures.paintedOf) laid through a pattern transform, as the
 *  preset and photo textures are. The painted look is composed once per chunk in the chunk's own px (renderer paintedBuf: a tile set family
 *  on its world-anchored grid, a painting at its look's scale), so it ignored the course look's Scale, Angle and Pan. Here a turned, scaled or
 *  panned look is composed instead over a "virtual chunk": the same kind of iso matrix as the chunk's, in the texture's own (pattern) space,
 *  at the px density it lands at, its origin on whole px (so neighbouring chunks compose the same pixels: no seam), and that buffer is laid
 *  through G. An identity transform keeps the chunk's own composition (no cost). Pure: importable from node tests. */

/** a 2D affine matrix as DOMMatrix's a, b, c, d, e, f (x' = a x + c y + e, y' = b x + d y + f) */
export type Aff = readonly [number, number, number, number, number, number];
export const IDENT: Aff = [1, 0, 0, 1, 0, 0];
/** p then q applied after: p * q (as DOMMatrix p.multiply(q): q first, then p) */
export function mul(p: Aff, q: Aff): Aff {
  return [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]];
}
export function inv(p: Aff): Aff {
  const d = p[0] * p[3] - p[1] * p[2], a = p[3] / d, b = -p[1] / d, c = -p[2] / d, e = p[0] / d;
  return [a, b, c, e, -(a * p[4] + c * p[5]), -(b * p[4] + e * p[5])];
}
export const apply = (p: Aff, x: number, y: number): [number, number] => [p[0] * x + p[2] * y + p[4], p[1] * x + p[3] * y + p[5]];
/** the bounding box [x0, y0, x1, y1] of a box's four corners through p */
export function boxThrough(p: Aff, b: readonly number[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of [[b[0]!, b[1]!], [b[2]!, b[1]!], [b[0]!, b[3]!], [b[2]!, b[3]!]] as const) { const [X, Y] = apply(p, x, y); x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
  return [x0, y0, x1, y1];
}
/** a texture's pattern transform in tile space, as the renderer lays a preset: its offset (tiles), then its angle (degrees), then its scale */
export function texTransform(o: readonly [number, number] | undefined, a: number, sc: number): Aff {
  const r = (a * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
  return [cs * sc, sn * sc, -sn * sc, cs * sc, o?.[0] ?? 0, o?.[1] ?? 0];
}
/** a course texture's fill (or band) transform */
export const courseTexG = (t: CourseTex): Aff => texTransform(t.o, t.a, t.sc);
/** a course texture's blend transform (its own scale, angle and offset when set, else the fill's scale and angle), with its scale; null: none */
export function courseBlendG(t: CourseTex): { G: Aff; sc: number } | null {
  if (!t.m) return null;
  const sc = t.m.sc ?? t.sc;
  return { G: texTransform(t.m.o, t.m.a ?? t.a, sc), sc };
}

/** the chunk being baked, as paintedFill sees it */
export interface ChunkFrame { key: string; L: number; M: Aff; W: number; H: number }
/** how a painted look is laid through G: the virtual chunk to compose it over (key, art level L, matrix M, size W x H), the part of it a
 *  tile box asks for (need, in the texture's own tile space), and the pattern's transform (its px to the chunk's tile space) */
export interface PaintedLay extends ChunkFrame { need?: [number, number, number, number]; pattern: Aff }
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
/** the virtual chunk a painted look is composed over to be laid through G (whose uniform scale is scale). A tile set family (tiled) takes the
 *  whole of G (its tiles are drawn larger or smaller: the art level times the scale); a painting takes its scale in the look (Textures.paintedOf
 *  scales its coverage, as before) and only G's offset and angle here. null: nothing to turn, scale or pan (the chunk's own composition) */
export function paintedLay(c: ChunkFrame, G: Aff, scale: number, tiled: boolean, need?: readonly number[]): PaintedLay | null {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const R = tiled ? G : mul(G, [1 / s, 0, 0, 1 / s, 0, 0]), L = tiled ? c.L * s : c.L;
  if (near(R[0], 1) && near(R[1], 0) && near(R[2], 0) && near(R[3], 1) && near(R[4], 0) && near(R[5], 0)) return null;
  const k = L / c.L, lin: Aff = [c.M[0] * k, c.M[1] * k, c.M[2] * k, c.M[3] * k, 0, 0];
  // the chunk's px through its tile space and back through R into the texture's space, at the virtual density: its box, 2 px wider all round
  // (the pattern's bilinear samples at the chunk's edges stay inside), on whole px
  const F = mul(lin, mul(inv(R), inv(c.M))), [x0, y0, x1, y1] = boxThrough(F, [0, 0, c.W, c.H]);
  const ex = Math.floor(x0) - 2, ey = Math.floor(y0) - 2, W = Math.ceil(x1) + 2 - ex, H = Math.ceil(y1) + 2 - ey;
  const M: Aff = [lin[0], lin[1], lin[2], lin[3], -ex, -ey];
  return { key: `${c.key}~${R.map(r6).join(',')}@${r6(L)}`, L, M, W, H, pattern: mul(R, inv(M)), ...(need ? { need: boxThrough(inv(R), need) } : {}) };
}

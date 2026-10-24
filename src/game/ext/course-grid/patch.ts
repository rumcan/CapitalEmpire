// The course grid's ground patches (plan P21 section 3.8, T078): each 64-tile chunk of the grid becomes one lot-ground patch, key
// cg:<cx>:<cy>, holding its surfaces' droplet outlines (course-blobs chunkOutlines) in draw order with their textures, edge profiles,
// collars, the fairway's mowing lines and the growth mask; plus the chunk walk and the grow key the month tick compares.
// Pure TypeScript, no DOM, deterministic. Units: tiles of 2 m; cells of 1 m (0.5 tile); months are game month indices.
import { CELL_T, type Grid } from './index';
import { BLOB_STYLE, CHUNK_MARGIN, chunkOutlines } from '../course-blobs';
import type { CourseLayer, CourseTex, LotPatch } from '../../ground-protocol';
import type { EdgeProfile } from '../../paint-edges';
import { growShare, growStage } from './areas';

/** a course chunk's side, tiles (128 cells) */
export const COURSE_CHUNK = 64;
/** how far past its chunk box a course patch is drawn (its feathers and drop shadows), tiles: the patch's pts box is the chunk box grown
 *  by this, so the ground index finds it from a neighbouring ground chunk and an edit re-bakes that far */
export const COURSE_PATCH_REACH = 2;
/** how far past an edited box a chunk's outlines can change, tiles: the field's margin plus the widest collar and closing */
export const COURSE_EDIT_REACH = CHUNK_MARGIN + 2;

/** each surface id's edge profile (paint-edges.ts): greens and tees raised, fairways turf, bunkers sunken, water, the rest flat */
export const SURF_EDGE: readonly EdgeProfile[] = ['flat', 'flat', 'flat', 'water', 'turf', 'raised', 'sunken', 'flat', 'raised'];

/** the textures a course chunk lays: per surface id (index 1..8; a missing one is not drawn) and per collar */
export interface CourseLooks { surf: readonly (CourseTex | undefined)[]; collar: Readonly<Record<'first-cut' | 'fringe' | 'lip' | 'bank', CourseTex>> }

/** the chunks (cx, cy) of the grid's extent that a tile box grown by pad touches, row by row */
export function courseChunksIn(g: Grid, box: readonly number[], pad = 0): [number, number][] {
  const S = COURSE_CHUNK, gx1 = g.x0 + g.w * CELL_T, gy1 = g.y0 + g.h * CELL_T;
  const x0 = Math.max(box[0]! - pad, g.x0), y0 = Math.max(box[1]! - pad, g.y0), x1 = Math.min(box[2]! + pad, gx1), y1 = Math.min(box[3]! + pad, gy1);
  const out: [number, number][] = [];
  if (x1 <= x0 || y1 <= y0) return out;
  for (let cy = Math.floor(y0 / S); cy * S < y1; cy++) for (let cx = Math.floor(x0 / S); cx * S < x1; cx++) out.push([cx, cy]);
  return out;
}

/** the key of a course chunk's lot-ground patch */
export const courseKey = (cx: number, cy: number) => `cg:${cx}:${cy}`;

/** the cell window of chunk (cx, cy) on the grid: its first cell (i0, j0) and size n x n (cells), unclamped */
function chunkCells(g: Grid, cx: number, cy: number): { i0: number; j0: number; n: number } {
  return { i0: Math.round((cx * COURSE_CHUNK - g.x0) / CELL_T), j0: Math.round((cy * COURSE_CHUNK - g.y0) / CELL_T), n: Math.round(COURSE_CHUNK / CELL_T) };
}

/** a chunk's grow-in now: its key (changes when any seeded cell's stage changes: the stage sum and the count of growing cells, since
 *  stages only go up) and its growth mask (n x n bytes over the chunk box, alpha 255 x (1 - stage / 4); null when nothing grows).
 *  now: the effective game month (grow cards included). */
export function chunkGrow(g: Grid, cx: number, cy: number, now: number): { key: string; mask: Uint8Array | null } {
  const { i0, j0, n } = chunkCells(g, cx, cy);
  let mask: Uint8Array | null = null, sum = 0, growing = 0;
  for (let j = Math.max(0, -j0); j < n && j0 + j < g.h; j++) {
    const row = (j0 + j) * g.w;
    for (let i = Math.max(0, -i0); i < n && i0 + i < g.w; i++) {
      const q = row + i0 + i, m = g.month[q]!; if (!m) continue;
      const st = growStage(growShare(g.surf[q]!, m, now)); if (st >= 4) continue;
      mask ??= new Uint8Array(n * n);
      mask[j * n + i] = Math.round(255 * (1 - st / 4)); sum += st; growing++;
    }
  }
  return { key: growing ? `${growing}:${sum}` : 'static', mask };
}

/** the lot-ground patch of course chunk (cx, cy), or null when no surface reaches it: pts is the chunk box grown by COURSE_PATCH_REACH,
 *  the layers come from chunkOutlines in draw order, each in its look (a surface with no look is left out), the fairway carries the
 *  centre lines (lines: per hole, flat tiles) of the holes whose fairway cells lie in or near the chunk, and the growth mask rides along
 *  when something grows (now: the effective game month) */
export function coursePatch(g: Grid, cx: number, cy: number, looks: CourseLooks, now: number, lines?: ReadonlyMap<number, readonly number[]>): LotPatch | null {
  const S = COURSE_CHUNK, outs = chunkOutlines(g, cx, cy, S, BLOB_STYLE), layers: CourseLayer[] = [];
  for (const o of outs) {
    const look = looks.surf[o.surf]; if (!look) continue;
    const L: CourseLayer = { s: o.surf, tex: look.tex, sc: look.sc, a: look.a, e: SURF_EDGE[o.surf] ?? 'flat', fill: o.fill, edges: o.edges };
    const col = BLOB_STYLE[o.surf]?.collar;
    if (o.collar && col) { const cl = looks.collar[col.name]; L.collar = { n: col.name, tex: cl.tex, sc: cl.sc, a: cl.a, fill: o.collar.fill, edges: o.collar.edges }; }
    if (o.surf === 4 && lines?.size && o.fill.length) {
      const holes = holesIn(g, cx, cy, o.surf), st: { hole: number; line: number[] }[] = [];
      for (const h of holes) { const l = lines.get(h); if (l && l.length >= 4) st.push({ hole: h, line: l.slice() }); }
      if (st.length) L.stripes = st;
    }
    if (L.fill.length || L.collar) layers.push(L);
  }
  if (!layers.length) return null;
  const R = COURSE_PATCH_REACH, x0 = cx * S - R, y0 = cy * S - R, x1 = (cx + 1) * S + R, y1 = (cy + 1) * S + R;
  const grow = chunkGrow(g, cx, cy, now).mask;
  return { pts: [x0, y0, x1, y0, x1, y1, x0, y1], tex: 'grass', course: { cx, cy, size: S, layers, ...(grow ? { grow } : {}), z: 0 } };
}

/** the hole numbers (1..255) of surface s's cells in chunk (cx, cy) and 4 cells round it, ascending */
function holesIn(g: Grid, cx: number, cy: number, s: number): number[] {
  const { i0, j0, n } = chunkCells(g, cx, cy), seen = new Uint8Array(256);
  for (let j = Math.max(0, j0 - 4); j < Math.min(g.h, j0 + n + 4); j++) {
    const row = j * g.w;
    for (let i = Math.max(0, i0 - 4); i < Math.min(g.w, i0 + n + 4); i++) if (g.surf[row + i] === s) seen[g.hole[row + i]!] = 1;
  }
  const out: number[] = [];
  for (let h = 1; h < 256; h++) if (seen[h]) out.push(h);
  return out;
}

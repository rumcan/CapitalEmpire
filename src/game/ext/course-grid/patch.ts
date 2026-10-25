// The course grid's ground patches (plan P21 section 3.8, T078): each 64-tile chunk of the grid becomes one lot-ground patch, key
// cg:<cx>:<cy>, holding its surfaces' droplet outlines (course-blobs chunkOutlines) in draw order with their textures, edge profiles,
// collars, the fairway's mowing lines and the growth mask; plus the chunk walk and the grow key the month tick compares.
// Pure TypeScript, no DOM, deterministic. Units: tiles of 2 m; cells of 1 m (0.5 tile); months are game month indices.
import { CELL_T, SURF, type Grid } from './index';
import { BLOB_STYLE, CHUNK_MARGIN, chunkOutlines, collarReach, type BlobStyle } from '../course-blobs';
import type { CourseLayer, CourseTex, LotPatch } from '../../ground-protocol';
import type { EdgeProfile } from '../../paint-edges';
import { MONTH_BASE } from './areas';
import { growMask } from '../course-fx';
import { chunkWalls, coversOf, defaultShadow, layerCode, surfHeights, teeStairs } from '../course-walls';

/** a course chunk's side, tiles (128 cells) */
export const COURSE_CHUNK = 64;
/** how far past its chunk box a course patch is drawn (its feathers, rims and drop shadows: a bunker's sunken bevel reaches 2.3 tiles; a
 *  tee at the Height slider's top beside a bunker drops 2.2 m, 2.75 tiles down the screen, T127),
 *  tiles: the patch's pts box is the chunk box grown by this, so the ground index finds it (and its edges, for the neighbours' rims) from
 *  a neighbouring ground chunk, and an edit re-bakes that far */
export const COURSE_PATCH_REACH = 4;
/** how far past an edited box a chunk's outlines can change, tiles, with collars at most maxCollar cells wide: the field's margin plus the
 *  closing (2 cells) and the widest collar (at least the default 2) */
export const courseEditReach = (maxCollar = 2) => CHUNK_MARGIN + (2 + Math.max(2, Math.ceil(maxCollar - 1e-9))) * CELL_T;
/** how far past an edited box a chunk's outlines can change with the default collars, tiles */
export const COURSE_EDIT_REACH = courseEditReach();
/** the Border slider's range (the owner's test, 2026-10-25: "a slider to make the border huge if you want or hairline if you want"): a
 *  collar band's width in metres (= cells), from a hairline to several metres */
export const BORDER_MIN_M = 0.1, BORDER_MAX_M = 8;

/** each surface id's edge profile (paint-edges.ts): greens and tees raised, fairways turf, bunkers sunken, water, the rest flat */
export const SURF_EDGE: readonly EdgeProfile[] = ['flat', 'flat', 'flat', 'water', 'turf', 'raised', 'sunken', 'flat', 'raised'];

/** the textures a course chunk lays: per surface id (index 1..8; a missing one is not drawn) and per collar; with the course look's
 *  Border, Shadow and Height, all by surface id: each surface's collar band width in metres (the Border slider; a missing one keeps
 *  BLOB_STYLE's), the Shadow of its walls (0 none .. 1 strong; a missing one: course-walls defaultShadow, none for a green, else the
 *  hairline) and a tee's or green's height in metres (the Height slider, T127; a missing one: course-walls SURF_HEIGHT) */
export interface CourseLooks { surf: readonly (CourseTex | undefined)[]; collar: Readonly<Record<'first-cut' | 'fringe' | 'lip' | 'bank', CourseTex>>;
  border?: readonly (number | undefined)[]; shadow?: readonly (number | undefined)[]; height?: readonly (number | undefined)[];
  /** each surface's own collar look by surface id (the course look's Border texture, scale, angle and tone; a missing one: collar by name) */
  band?: readonly (CourseTex | undefined)[] }
/** a course texture's fields alone (a look may carry more) */
const texOf = (t: CourseTex): CourseTex => ({ tex: t.tex, sc: t.sc, a: t.a, ...(t.t ? { t: t.t, ta: t.ta ?? 0, tc: t.tc ?? '#000000' } : {}), ...(t.m ? { m: { ...t.m } } : {}) });

/** BLOB_STYLE with the collars at the widths of `border` (metres = cells, by surface id; clamped to the Border slider's range; a missing or
 *  bad entry keeps the default width) */
export function courseStyles(border?: readonly (number | undefined)[]): readonly BlobStyle[] {
  if (!border?.length) return BLOB_STYLE;
  return BLOB_STYLE.map((st, s) => {
    const w = border[s];
    if (!st.collar || w === undefined || !Number.isFinite(w)) return st;
    return { ...st, collar: { ...st.collar, width: Math.min(BORDER_MAX_M, Math.max(BORDER_MIN_M, w)) } };
  });
}
/** the widest collar of a style table, cells (the edit reach) */
export const widestCollar = (styles: readonly BlobStyle[]) => styles.reduce((m, st) => Math.max(m, st.collar ? collarReach(st.collar.width) : 0), 0);

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

/** a chunk's growth mask (T076 growMask: 1 byte per cell over the chunk box, alpha 255 x (1 - stage / 4)), or null when nothing grows;
 *  now: the effective game month (grow cards included; the cells hold month + MONTH_BASE, established cells 0) */
export function courseGrow(g: Grid, cx: number, cy: number, now: number): Uint8Array | null {
  const m = growMask(g, cx, cy, COURSE_CHUNK, now + MONTH_BASE);
  for (let i = 0; i < m.length; i++) if (m[i]) return m;
  return null;
}
/** a chunk's grow key: how many cells stand at each unfinished grow stage (the mask's alphas 255, 191, 128, 64), which changes whenever a
 *  seeded cell reaches its next quarter (stages only go up); 'static' when nothing grows. mask: the chunk's mask when already made */
export function courseGrowKey(g: Grid, cx: number, cy: number, now: number, mask?: Uint8Array | null): string {
  const m = mask === undefined ? courseGrow(g, cx, cy, now) : mask; if (!m) return 'static';
  const n = [0, 0, 0, 0];
  for (let i = 0; i < m.length; i++) { const a = m[i]!; if (a) n[4 - Math.round(a / 63.75)]!++; }
  return n.join(':');
}
/** whether a grow key says nothing in its chunk grows (the month tick skips such a chunk) */
export const growStatic = (key: string) => key === 'static';
/** the most points one surface of one chunk carries (P21 3.8): above it, its rings and edges are simplified again, coarser */
export const POINT_CAP = 4000;
/** Douglas-Peucker on a flat polyline (both ends kept) at tolerance tol (tiles) */
function dp(p: readonly number[], tol: number): number[] {
  const n = p.length >> 1; if (n < 3) return p.slice();
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack: number[] = [0, n - 1], t2 = tol * tol;
  while (stack.length) {
    const b = stack.pop()!, a = stack.pop()!, ax = p[2 * a]!, ay = p[2 * a + 1]!, dx = p[2 * b]! - ax, dy = p[2 * b + 1]! - ay, l2 = dx * dx + dy * dy;
    let far = -1, fd = t2;
    for (let i = a + 1; i < b; i++) {
      const ex = p[2 * i]! - ax, ey = p[2 * i + 1]! - ay, c = l2 > 0 ? (ex * dy - ey * dx) ** 2 / l2 : ex * ex + ey * ey;
      if (c > fd) { fd = c; far = i; }
    }
    if (far >= 0) { keep[far] = 1; stack.push(a, far, far, b); }
  }
  const out: number[] = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(p[2 * i]!, p[2 * i + 1]!);
  return out;
}
/** a closed ring simplified (split at its first point and its farthest point, so both halves keep their ends) */
function dpRing(p: readonly number[], tol: number): number[] {
  const n = p.length >> 1; if (n < 4) return p.slice();
  let far = 0, fd = -1; for (let i = 1; i < n; i++) { const d = (p[2 * i]! - p[0]!) ** 2 + (p[2 * i + 1]! - p[1]!) ** 2; if (d > fd) { fd = d; far = i; } }
  const a = dp(p.slice(0, 2 * far + 2), tol), b = dp([...p.slice(2 * far), p[0]!, p[1]!], tol);
  const out = a.concat(b.slice(2, b.length - 2));
  return out.length >= 6 ? out : p.slice();
}
/** rings and edges of one surface within POINT_CAP points: simplified again at doubling tolerances from 0.08 tile until they fit (up to 2
 *  tiles; a chunk of thousands of separate specks may stay over: every ring keeps at least three points) */
export function capPoints(fill: number[][], edges: number[][]): [number[][], number[][]] {
  const count = () => (fill.reduce((s, r) => s + r.length, 0) + edges.reduce((s, r) => s + r.length, 0)) / 2;
  for (let tol = 0.08; count() > POINT_CAP && tol < 2; tol *= 2) {
    fill = fill.map(r => dpRing(r, tol));
    edges = edges.map(e => { const m = e.length, ring = m >= 8 && e[0] === e[m - 2] && e[1] === e[m - 1]; if (!ring) return dp(e, tol); const r = dpRing(e.slice(0, m - 2), tol); return [...r, r[0]!, r[1]!]; });
  }
  return [fill, edges];
}
/** flat tile rings and polylines as Float32Arrays (a patch posts and clones as plain memory, not number by number) */
const f32 = (a: readonly number[][]): Float32Array[] => a.map(q => Float32Array.from(q));

/** the lot-ground patch of course chunk (cx, cy), or null when no surface reaches it: pts is the chunk box grown by COURSE_PATCH_REACH,
 *  the layers come from chunkOutlines in draw order, each in its look (a surface with no look is left out), the fairway carries the
 *  centre lines (lines: per hole, flat tiles) of the holes whose fairway cells lie in or near the chunk, and the growth mask rides along
 *  when something grows (now: the effective game month); the stairs of the tees within reach (T127) face the nearest of `paths` (the cart
 *  paths and drives, flat segments ax, ay, bx, by in tiles) */
export function coursePatch(g: Grid, cx: number, cy: number, looks: CourseLooks, now: number, lines?: ReadonlyMap<number, readonly number[]>, paths?: ArrayLike<number> | null): LotPatch | null {
  const S = COURSE_CHUNK, styles = courseStyles(looks.border), heights = surfHeights(looks.height), outs = chunkOutlines(g, cx, cy, S, styles, true).filter(o => looks.surf[o.surf]), layers: CourseLayer[] = [];
  // the edges exactly as they will be drawn (capped), for the walls (T099): each layer's edges sorted into soft, joint and wall runs
  const capped = outs.map(o => ({ o, se: capPoints(o.fill, o.edges), ce: o.collar ? capPoints(o.collar.fill, o.collar.edges) : null }));
  const cw = chunkWalls(g, capped.flatMap(({ o, se, ce }) => [{ code: layerCode(o.surf, false), edges: se[1] }, ...(ce ? [{ code: layerCode(o.surf, true), edges: ce[1] }] : [])]), coversOf(outs), styles, heights);
  for (const { o, se: [fill, edges], ce } of capped) {
    const look = looks.surf[o.surf]!, r = cw.runs.get(layerCode(o.surf, false));
    const L: CourseLayer = { s: o.surf, ...texOf(look), e: SURF_EDGE[o.surf] ?? 'flat', fill: f32(fill), edges: f32(edges), soft: f32(r?.soft ?? []), joint: f32(r?.joint ?? []) };
    const col = styles[o.surf]?.collar;
    if (ce && col) { const cl = looks.band?.[o.surf] ?? looks.collar[col.name], [cf, cE] = ce; L.collar = { n: col.name, ...texOf(cl), w: col.width * CELL_T, fill: f32(cf), edges: f32(cE), soft: f32(cw.runs.get(layerCode(o.surf, true))?.soft ?? []) }; }
    if (o.surf === 4 && lines?.size && o.fill.length) {
      const holes = holesIn(g, cx, cy, o.surf), st: { hole: number; line: number[] }[] = [];
      for (const h of holes) { const l = lines.get(h); if (l && l.length >= 4) st.push({ hole: h, line: l.slice() }); }
      if (st.length) L.stripes = st;
    }
    if (L.fill.length || L.collar) layers.push(L);
  }
  if (!layers.length) return null;
  const R = COURSE_PATCH_REACH, x0 = cx * S - R, y0 = cy * S - R, x1 = (cx + 1) * S + R, y1 = (cy + 1) * S + R;
  const grow = courseGrow(g, cx, cy, now);
  const walls = cw.walls.map(w => ({ p: Float32Array.from(w.p), lo: w.lo, m: w.m, hs: w.hs, ...(w.f ? { f: w.f, r: w.r } : {}) })), rims = cw.rims.map(r => ({ p: Float32Array.from(r.p), hi: r.hi }));
  // the tees' stairs (T127): every tee within reach of the chunk's walls, its whole box, so each chunk it touches cuts the same steps
  const stairs = cw.walls.some(w => w.f && w.hs === SURF.tee) ? teeStairs(g, [x0, y0, x1, y1], paths, heights) : [];
  const st = stairs.length ? { st: stairs.flatMap(q => [q.x, q.y, q.nx, q.ny, q.half]) } : {};
  const sh = looks.shadow?.length ? { sh: Array.from({ length: 9 }, (_, s) => { const v = looks.shadow![s]; return v !== undefined && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : defaultShadow(s); }) } : {};
  return { pts: [x0, y0, x1, y0, x1, y1, x0, y1], tex: 'grass', course: { cx, cy, size: S, layers, ...(walls.length ? { walls } : {}), ...(rims.length ? { rims } : {}), ...(grow ? { grow } : {}), ...sh, ...st, z: 0 } };
}

/** the buffers of a patch's typed arrays (a postMessage transfer list) */
export function patchBuffers(p: LotPatch): ArrayBuffer[] {
  const out: ArrayBuffer[] = [], c = p.course; if (!c) return out;
  for (const l of c.layers) for (const a of [...l.fill, ...l.edges, ...(l.soft ?? []), ...(l.joint ?? []), ...(l.collar ? [...l.collar.fill, ...l.collar.edges, ...(l.collar.soft ?? [])] : [])]) out.push(a.buffer as ArrayBuffer);
  for (const w of [...(c.walls ?? []), ...(c.rims ?? [])]) out.push(w.p.buffer as ArrayBuffer);
  if (c.grow) out.push(c.grow.buffer as ArrayBuffer);
  return out;
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

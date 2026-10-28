// The course grid's ground patches (plan P21 section 3.8, T078): each 64-tile chunk of the grid becomes one lot-ground patch, key
// cg:<cx>:<cy>, holding its surfaces' droplet outlines (course-blobs chunkOutlines) in draw order with their textures, edge profiles,
// collars, the fairway's mowing lines and the growth mask; plus the chunk walk and the grow key the month tick compares.
// Pure TypeScript, no DOM, deterministic. Units: tiles of 2 m; cells of 1 m (0.5 tile); months are game month indices.
import { CELL_T, SURF, type Grid } from './index';
import { BLOB_STYLE, CHUNK_MARGIN, DrawnSurfaces, ROUND_REACH_T, chunkOutlines, collarLaid, collarReach, roundRadius, type BlobStyle, type RoundOf } from '../course-blobs';
import type { CourseLayer, CourseTex, LotPatch } from '../../ground-protocol';
import type { EdgeProfile } from '../../paint-edges';
import { MONTH_BASE } from './areas';
import { growMask } from '../course-fx';
import { DRAW_ORDER, LayerStack, chunkWalls, coversOf, defaultShadow, layerCode, surfHeights, teeStairs } from '../course-walls';
import { SPILL_SURFACES, TALL_CODES, spillRuns } from '../course-walls/spill';

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
/** a Border width held to the slider's range: 0 or less is none (T260), else a hairline to BORDER_MAX_M */
export const clampBorder = (m: number): number => (m <= 0 ? 0 : Math.min(BORDER_MAX_M, Math.max(BORDER_MIN_M, m)));
/** T260 (#763; the owner, 2026-10-29: "the border needs to be set to none for everything except fairways and greens who have fringe and
 *  seconds cut as their borders by default"): the Border a surface's band is laid at when the player has set none, metres (0: none, no band):
 *  BLOB_STYLE's for the fairway's first cut and the green's fringe (the course finish widens them: course-finish borderDefault), none for a
 *  tee's first cut, a bunker's lip and a pond's bank (the Border slider lays them again at any width) */
export const borderBase = (s: number): number => (s === SURF.fairway || s === SURF.green ? BLOB_STYLE[s]?.collar?.width ?? 0 : 0);

/** each surface id's edge profile (paint-edges.ts): greens and tees raised, fairways turf, bunkers sunken, water, the rest flat */
export const SURF_EDGE: readonly EdgeProfile[] = ['flat', 'flat', 'flat', 'water', 'turf', 'raised', 'sunken', 'flat', 'raised', 'flat'];

/** the textures a course chunk lays: per surface id (index 1..9; a missing one is not drawn) and per collar; with the course look's
 *  Border, Shadow and Height, all by surface id: each surface's collar band width in metres (the Border slider; a missing one keeps
 *  BLOB_STYLE's), the Shadow of its walls (0 none .. 1 strong; a missing one: course-walls defaultShadow, none for a green, else the
 *  hairline) and a tee's or green's height in metres (the Height slider, T127; a missing one: course-walls SURF_HEIGHT) */
export interface CourseLooks { surf: readonly (CourseTex | undefined)[]; collar: Readonly<Record<'first-cut' | 'fringe' | 'lip' | 'bank', CourseTex>>;
  border?: readonly (number | undefined)[]; shadow?: readonly (number | undefined)[]; height?: readonly (number | undefined)[];
  /** each surface's own collar look by surface id (the course look's Border texture, scale, angle and tone; a missing one: collar by name) */
  band?: readonly (CourseTex | undefined)[];
  /** T227: the grass a bunker's lip band wears with the course finish on (the fairway's first cut), when the bunker's Border texture is its
   *  default; absent: its own look */
  lipGrass?: CourseTex;
  /** T256: the looks by owner (absent: every cell wears the looks above) */
  own?: CourseOwners;
  /** T253 (#735): Round off: each rounded surface's Smoothness (0..1) by surface id (course-look CourseLookSet.round); absent: none rounded */
  round?: readonly (number | undefined)[] }
/** T256 (#743): the looks each hole, the property and each practice facility wear (golf/looks.ts): looks[k], owner k's fills, collars, bands
 *  and lip grass (course-look.ts CourseLookSet); hole[h], the owner the cells of hole h wear (-1 or missing: the base looks of CourseLooks);
 *  zones, the facilities' boxes as five numbers each (k, x0, y0, x1, y1, tiles): a cell of no hole inside one wears owner k */
export interface CourseOwners {
  looks: readonly { surf: readonly (CourseTex | undefined)[]; collar: Readonly<Record<'first-cut' | 'fringe' | 'lip' | 'bank', CourseTex>>; band: readonly (CourseTex | undefined)[]; lipGrass?: CourseTex; round?: readonly (number | undefined)[] }[];
  hole: readonly number[]; zones?: readonly number[] }
/** a course texture's fields alone (a look may carry more) */
const texOf = (t: CourseTex): CourseTex => ({ tex: t.tex, sc: t.sc, a: t.a, ...(t.x !== undefined && t.x !== 1 ? { x: t.x } : {}), ...(t.m ? { m: { ...t.m } } : {}) });

/** BLOB_STYLE with the collars at the widths of `border` (metres = cells, by surface id; clamped to the Border slider's range; a missing or
 *  bad entry keeps the default width). T260: 0 (or less) is none: the collar entry stays, at width 0, so the draw order's layer codes stay
 *  the same (course-walls drawOrder, isOverlay, collarAfter), and course-blobs lays no band for it */
export function courseStyles(border?: readonly (number | undefined)[]): readonly BlobStyle[] {
  if (!border?.length) return BLOB_STYLE;
  return BLOB_STYLE.map((st, s) => {
    const w = border[s];
    if (!st.collar || w === undefined || !Number.isFinite(w)) return st;
    return { ...st, collar: { ...st.collar, width: clampBorder(w) } };
  });
}
/** the widest collar of a style table, cells (the edit reach) */
export const widestCollar = (styles: readonly BlobStyle[]) => styles.reduce((m, st) => Math.max(m, st.collar ? collarReach(st.collar.width) : 0), 0);

/** T253 (#735): a course's Round off for the outlines (course-blobs RoundOf): per surface id, each cell's kernel radius from the Smoothness its
 *  owner's look gives that surface (looks.own: a cell of hole h wears owner own.hole[h], a cell of no hole in a facility's zone that facility's,
 *  as the textures do; else the base looks), 0 where its look is not rounded; null when no look rounds anything (the outlines as before) */
export function roundOfLooks(g: Grid, looks: Pick<CourseLooks, 'round' | 'own'>): RoundOf | null {
  const own = looks.own, base = looks.round;
  if (!base?.some(v => v !== undefined) && !own?.looks.some(l => l.round?.some(v => v !== undefined))) return null;
  const zones = own?.zones ?? [];
  const ownerOf = (c: number): number => {
    const h = g.hole[c]!;
    if (h === 0 && zones.length) {
      const ci = c % g.w, x = g.x0 + (ci + 0.5) * CELL_T, y = g.y0 + ((c - ci) / g.w + 0.5) * CELL_T;
      for (let z = 0; z + 4 < zones.length; z += 5) if (x >= zones[z + 1]! && x < zones[z + 3]! && y >= zones[z + 2]! && y < zones[z + 4]!) return zones[z]!;
    }
    return own?.hole[h] ?? -1;
  };
  const cache = new Map<number, RoundCellsOf>();
  return (s: number) => {
    let f = cache.get(s);
    if (f === undefined) {
      const rad = (v: number | undefined) => (v === undefined ? 0 : roundRadius(v)), r0 = rad(base?.[s]), rk = own ? own.looks.map(l => rad(l.round?.[s])) : [];
      f = r0 > 0 || rk.some(r => r > 0) ? (own ? (c: number) => { const k = ownerOf(c); return k >= 0 ? rk[k] ?? 0 : r0; } : () => r0) : null;
      cache.set(s, f);
    }
    return f;
  };
}
type RoundCellsOf = ((cell: number) => number) | null;
/** T253: how much further (tiles) an edit reaches with Round off on somewhere (its wider kernels), else 0 */
export const roundReach = (looks: Pick<CourseLooks, 'round' | 'own'>): number =>
  looks.round?.some(v => v !== undefined) || looks.own?.looks.some(l => l.round?.some(v => v !== undefined)) ? ROUND_REACH_T : 0;
/** T253: the lie test's reader of the drawn course (course-blobs DrawnSurfaces) for these looks, or null when nothing is rounded (the lie
 *  then reads the cells, as before) */
export function drawnSurfaces(g: Grid, looks: CourseLooks): DrawnSurfaces | null {
  const round = roundOfLooks(g, looks);
  return round ? new DrawnSurfaces(g, courseStyles(looks.border), round) : null;
}

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
 *  the layers come from chunkOutlines in draw order, each in its look (a surface with no look is left out), the fairway carries its mowing
 *  stripes' holes (stripeAreas, T218: the playing lines, lines: per hole, flat tiles, and each hole's share of the chunk), and the growth mask rides along
 *  when something grows (now: the effective game month); the stairs of the tees within reach (T127) face the nearest of `paths` (the cart
 *  paths and drives, flat segments ax, ay, bx, by in tiles) */
export function coursePatch(g: Grid, cx: number, cy: number, looks: CourseLooks, now: number, lines?: ReadonlyMap<number, readonly number[]>, paths?: ArrayLike<number> | null): LotPatch | null {
  const S = COURSE_CHUNK, styles = courseStyles(looks.border), heights = surfHeights(looks.height), outs = chunkOutlines(g, cx, cy, S, styles, true, roundOfLooks(g, looks)).filter(o => looks.surf[o.surf]), layers: CourseLayer[] = [];
  // the edges exactly as they will be drawn (capped), for the walls (T099): each layer's edges sorted into soft, joint and wall runs
  const capped = outs.map(o => ({ o, se: capPoints(o.fill, o.edges), ce: o.collar ? capPoints(o.collar.fill, o.collar.edges) : null }));
  const cw = chunkWalls(g, capped.flatMap(({ o, se, ce }) => [{ code: layerCode(o.surf, false), edges: se[1] }, ...(ce ? [{ code: layerCode(o.surf, true), edges: ce[1] }] : [])]), coversOf(outs), styles, heights);
  // T204: where tall grass (the rough, the fescue, the map grass) meets the fairway or its first cut, read as the walls read their sides
  const stack = new LayerStack(coversOf(outs), styles, DRAW_ORDER, heights), spill: { p: Float32Array; o: number }[] = [];
  for (const { o, se, ce } of capped) if (SPILL_SURFACES.includes(o.surf)) {
    for (const r of spillRuns(g, stack, layerCode(o.surf, false), se[1], TALL_CODES, styles)) spill.push({ p: Float32Array.from(r.p), o: r.o });
    if (ce) for (const r of spillRuns(g, stack, layerCode(o.surf, true), ce[1], TALL_CODES, styles)) spill.push({ p: Float32Array.from(r.p), o: r.o });
  }
  // T256: the looks by owner: a surface whose cells here all wear one owner's look takes it; cells of several looks keep the most common as
  // the layer's own and the others as alternates over their share of the chunk (OwnerPick)
  const pickOf = looks.own ? ownerPicker(g, cx, cy, looks) : null;
  for (const { o, se: [fill, edges], ce } of capped) {
    const col = styles[o.surf]?.collar, pick = pickOf?.(o.surf, col?.name) ?? null;
    const look = pick ? pick.base.surf : looks.surf[o.surf]!, r = cw.runs.get(layerCode(o.surf, false));
    const L: CourseLayer = { s: o.surf, ...texOf(look), e: SURF_EDGE[o.surf] ?? 'flat', fill: f32(fill), edges: f32(edges), soft: f32(r?.soft ?? []), joint: f32(r?.joint ?? []) };
    const lip = pick ? pick.base.lip : col?.name === 'lip' ? looks.lipGrass : undefined;
    const cl = col ? pick?.base.band ?? looks.band?.[o.surf] ?? looks.collar[col.name] : null;
    if (ce && col && cl) { const [cf, cE] = ce; L.collar = { n: col.name, ...texOf(cl), w: col.width * CELL_T, fill: f32(cf), edges: f32(cE), soft: f32(cw.runs.get(layerCode(o.surf, true))?.soft ?? []), ...(col.name === 'lip' && lip ? { g: texOf(lip) } : {}) }; }
    // T260: a Border of none lays no band; the layer keeps the band's look with no rings (w 0): a tee's bank wears its first cut's grass as
    // before (renderer grassOf), and the renderer lays a bunker's grass lip and a pond's wet soil round the sand and the water without a band
    else if (col && cl && !collarLaid(col) && o.fill.length) L.collar = { n: col.name, ...texOf(cl), w: 0, fill: [], edges: [], soft: [] };
    if (pick?.alts.length) L.alts = pick.alts.map(a => ({ look: texOf(a.look.surf), ...(a.look.band ? { band: texOf(a.look.band) } : {}), ...(a.look.lip ? { g: texOf(a.look.lip) } : {}), runs: a.runs }));
    // the mowing stripes' holes: the fairway's (T218) and the green's (T227: the course finish's fine stripes, along its hole's line of play)
    if ((o.surf === SURF.fairway || o.surf === SURF.green) && o.fill.length) { const st = stripeAreas(g, cx, cy, lines, o.surf); if (st) L.stripes = st; }
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
  return { pts: [x0, y0, x1, y0, x1, y1, x0, y1], tex: 'grass', course: { cx, cy, size: S, layers, ...(walls.length ? { walls } : {}), ...(rims.length ? { rims } : {}), ...(grow ? { grow } : {}), ...sh, ...st, ...(spill.length ? { spill } : {}), z: 0 } };
}

/** the buffers of a patch's typed arrays (a postMessage transfer list) */
export function patchBuffers(p: LotPatch): ArrayBuffer[] {
  const out: ArrayBuffer[] = [], c = p.course; if (!c) return out;
  for (const l of c.layers) for (const a of [...l.fill, ...l.edges, ...(l.soft ?? []), ...(l.joint ?? []), ...(l.collar ? [...l.collar.fill, ...l.collar.edges, ...(l.collar.soft ?? [])] : []), ...(l.stripes?.flatMap(q => (q.runs ? [q.runs] : [])) ?? []), ...(l.alts?.map(q => q.runs) ?? [])]) out.push(a.buffer as ArrayBuffer);
  for (const w of [...(c.walls ?? []), ...(c.rims ?? []), ...(c.spill ?? [])]) out.push(w.p.buffer as ArrayBuffer);
  if (c.grow) out.push(c.grow.buffer as ArrayBuffer);
  return out;
}

/** T218: how far round a chunk its stripe shares are worked out (cells): a cell's nearest fairway cell is found within this (the walk is cut
 *  here), and the shares are sent this far past the chunk box (its outline moves up to RUGGED.limit, 0.8 tile, with the wobble) */
const STRIPE_WALK = 10, STRIPE_EDGE = 3;
/** a fairway stripe entry (CourseLayer.stripes): its hole (0: none), its playing line and its share of the chunk */
export type StripeArea = NonNullable<CourseLayer['stripes']>[number];
/** T218: the fairway's mowing stripes of chunk (cx, cy): one entry per hole whose fairway reaches the chunk, ascending, with its playing line
 *  (lines: per hole, flat tiles); hole 0 gathers the cells of no hole and of a hole with no line yet (they take the default direction). When
 *  there are two or more, each has its share of the chunk as boxes (runs, x0 y0 x1 y1 in tiles, rows of cells merged down): the cells whose
 *  nearest fairway cell is its (a walk out from the fairway cells in rings, a tie to the lower hole). Every chunk walks the same cells round
 *  its seams the same way, so where an outline can lie (a few cells from its fairway) the shares agree across chunks. null: no fairway cell
 *  within reach. surf: the surface whose cells are walked (T227: the green's, for its fine stripes; the fairway's by default) */
export function stripeAreas(g: Grid, cx: number, cy: number, lines?: ReadonlyMap<number, readonly number[]>, surf: number = SURF.fairway): StripeArea[] | null {
  const lineOf = (h: number) => { const l = h > 0 ? lines?.get(h) : undefined; return l && l.length >= 4 ? l : null; };
  const sh = cellShares(g, cx, cy, surf, c => { const h = g.hole[c]!; return lineOf(h) ? h : 0; }); if (!sh) return null;
  const entry = (h: number): StripeArea => ({ hole: h, line: h ? lineOf(h)!.slice() : [] });
  return sh.runs ? sh.labels.map((h, k) => ({ ...entry(h), runs: sh.runs![k]! })) : [entry(sh.labels[0]!)];
}
/** T256 (generalising T218's walk): the shares of chunk (cx, cy) among the labels of the cells of surface `surf` (label(c), a cell index of g,
 *  0 to 32767): every cell round the chunk takes the label of its nearest cell of that surface (a walk out in rings, a tie to the lower
 *  label), and each label seen over the chunk box and its edge gets its share as boxes (runs, x0 y0 x1 y1 in tiles, rows of cells merged
 *  down). Every chunk walks the same cells round its seams the same way, so the shares agree across chunks. labels ascending; runs only when
 *  there are two or more; null: no cell of the surface within reach */
export function cellShares(g: Grid, cx: number, cy: number, surf: number, label: (c: number) => number): { labels: number[]; runs?: Float32Array[] } | null {
  const { i0, j0, n } = chunkCells(g, cx, cy), M = STRIPE_WALK, W = n + 2 * M, lab = new Int16Array(W * W).fill(-1), dist = new Uint16Array(W * W).fill(0xffff);
  let cur: number[] = [];
  for (let y = 0; y < W; y++) {
    const j = j0 - M + y; if (j < 0 || j >= g.h) continue;
    for (let x = 0; x < W; x++) {
      const i = i0 - M + x; if (i < 0 || i >= g.w) continue;
      const c = j * g.w + i; if (g.surf[c] !== surf) continue;
      const k = y * W + x; lab[k] = label(c); dist[k] = 0; cur.push(k);
    }
  }
  if (!cur.length) return null;
  // one label in reach: it is the whole chunk's (the walk would find nothing else)
  const first = lab[cur[0]!]!; if (cur.every(k => lab[k] === first)) return { labels: [first] };
  // out from the fairway cells ring by ring (4 neighbours): a cell takes the lowest hole among the cells of the last ring beside it
  for (let d = 1; cur.length; d++) {
    const next: number[] = [];
    const step = (q: number, v: number) => { if (dist[q] === 0xffff) { dist[q] = d; lab[q] = v; next.push(q); } else if (dist[q] === d && v < lab[q]!) lab[q] = v; };
    for (const k of cur) {
      const v = lab[k]!, x = k % W;
      if (x > 0) step(k - 1, v); if (x + 1 < W) step(k + 1, v); if (k >= W) step(k - W, v); if (k + W < W * W) step(k + W, v);
    }
    cur = next;
  }
  // the labels over the chunk box and its edge, and their shares as boxes
  const E = STRIPE_EDGE, R = n + 2 * E, o = M - E, seen = new Set<number>();
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) seen.add(lab[(y + o) * W + x + o]!);
  const holes = [...seen].sort((a, b) => a - b);
  if (holes.length === 1) return { labels: holes };
  const boxes = new Map<number, number[][]>(holes.map(h => [h, []]));
  let open = new Map<number, number[]>();
  const tx = (x: number) => g.x0 + (i0 - E + x) * CELL_T, ty = (y: number) => g.y0 + (j0 - E + y) * CELL_T;
  for (let y = 0; y < R; y++) {
    const row = (y + o) * W + o, now = new Map<number, number[]>();
    for (let a = 0; a < R;) {
      const v = lab[row + a]!; let b = a + 1; while (b < R && lab[row + b] === v) b++;
      const key = (v * 256 + a) * 256 + b, was = open.get(key);
      if (was) { was[3] = ty(y + 1); now.set(key, was); } else { const r = [tx(a), ty(y), tx(b), ty(y + 1)]; boxes.get(v)!.push(r); now.set(key, r); }
      a = b;
    }
    open = now;
  }
  return { labels: holes, runs: holes.map(h => Float32Array.from(boxes.get(h)!.flat())) };
}

/** T256: one look a surface wears in a chunk: its fill, its band (absent: a surface with no collar) and a bunker's lip grass with the finish */
interface PickLook { surf: CourseTex; band?: CourseTex; lip?: CourseTex }
/** T256: the looks a surface wears in a chunk: base, the layer's own (the most cells), and the others over their shares (runs) */
export interface OwnerPick { base: PickLook; alts: { look: PickLook; runs: Float32Array }[] }
/** T256: the owner looks of chunk (cx, cy): for a surface id (and its collar's name), the looks its cells wear (null: the base looks of
 *  CourseLooks, as before T256). A cell of hole h wears owner own.hole[h]; a cell of no hole inside a facility's zone wears that facility's.
 *  Owners whose looks for the surface match are one look, so a course where every owner wears the same looks lays exactly as before */
function ownerPicker(g: Grid, cx: number, cy: number, looks: CourseLooks): (s: number, collar?: string) => OwnerPick | null {
  const own = looks.own!, zones = own.zones ?? [];
  /** owner k's look for surface s (k < 0: the base looks) */
  const lookOf = (k: number, s: number, collar?: string): PickLook | null => {
    const o = k >= 0 ? own.looks[k] : null, surf = (o ?? looks).surf[s]; if (!surf) return null;
    const name = collar as keyof CourseLooks['collar'] | undefined;
    const band = name ? (o ? o.band[s] ?? o.collar[name] : looks.band?.[s] ?? looks.collar[name]) : undefined, lip = name === 'lip' ? (o ? o.lipGrass : looks.lipGrass) : undefined;
    return { surf, ...(band ? { band } : {}), ...(lip ? { lip } : {}) };
  };
  /** the owner of cell c */
  const ownerOf = (c: number): number => {
    const h = g.hole[c]!;
    if (h === 0 && zones.length) {
      const ci = c % g.w, x = g.x0 + (ci + 0.5) * CELL_T, y = g.y0 + ((c - ci) / g.w + 0.5) * CELL_T;
      for (let z = 0; z + 4 < zones.length; z += 5) if (x >= zones[z + 1]! && x < zones[z + 3]! && y >= zones[z + 2]! && y < zones[z + 4]!) return zones[z]!;
    }
    return own.hole[h] ?? -1;
  };
  return (s, collar) => {
    // the looks by key (owners that look the same share one label: the base's first, so it keeps 0)
    const keys = new Map<string, number>(), list: PickLook[] = [], byOwner = new Map<number, number>();
    const labelOf = (k: number): number => {
      let v = byOwner.get(k); if (v !== undefined) return v;
      const lk = lookOf(k, s, collar) ?? lookOf(-1, s, collar)!, key = JSON.stringify(lk);
      v = keys.get(key); if (v === undefined) { v = list.length; keys.set(key, v); list.push(lk); }
      byOwner.set(k, v); return v;
    };
    labelOf(-1);
    const sh = cellShares(g, cx, cy, s, c => labelOf(ownerOf(c))); if (!sh) return null;
    if (!sh.runs) return sh.labels[0] === 0 ? null : { base: list[sh.labels[0]!]!, alts: [] };
    // the layer's own look: the label with the most share (its boxes' area), the rest as alternates
    const area = sh.runs.map(r => { let a = 0; for (let q = 0; q + 3 < r.length; q += 4) a += (r[q + 2]! - r[q]!) * (r[q + 3]! - r[q + 1]!); return a; });
    let top = 0; for (let q = 1; q < area.length; q++) if (area[q]! > area[top]!) top = q;
    return { base: list[sh.labels[top]!]!, alts: sh.labels.flatMap((v, q) => (q === top ? [] : [{ look: list[v]!, runs: sh.runs![q]! }])) };
  };
}

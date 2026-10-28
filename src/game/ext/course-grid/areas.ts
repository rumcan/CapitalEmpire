// The course grid as the golf rules read it (plan P21 section 3.7, T078): `gridAreas` turns the grid's cells into one CourseArea per
// blob per surface and hole (the automatic collars included), so deriveHoles, holeViews, markerPlan, tagByHole, courseQuality and the
// costs keep their inputs; `rasterAreas` lays old golf-surface paint areas into the grid (the load migration); and the planting month
// each cell stores. Pure TypeScript, no DOM, deterministic. Units: tiles of 2 m for every coordinate; cells of 1 m (0.5 tile).
import { CELL_T, N_SURF, SURF, SURF_ORDER, fillPolygon, isCarved, surfRank, type Grid, type GridDiff, mergeDiffs } from './index';
import { BLOB_STYLE, blobOutlines, type CollarStyle } from '../course-blobs';
import type { CourseArea, GolfSurface } from '../../golf/types';
import type { PaintTex } from '../../paint';
import { SURF_GROW_MONTHS } from '../course-fx';

// ---- planting months ----

/** the offset of a cell's month value: a cell seeded in game month k (0 = the first month) holds k + MONTH_BASE; 0 is an established cell
 *  (grown in from the start: the generated course, migrated areas without a planting, sod), as if it had been seeded MONTH_BASE months
 *  before the game began, so a grow-in sum (now + MONTH_BASE - value) works on the raw values too */
export const MONTH_BASE = 64;
/** the month value a cell painted now holds: a seeded cell its month (game month index + MONTH_BASE), sod or no planting 0 (established) */
export function plantMonth(kind: 'seed' | 'sod' | undefined, month: number | undefined): number {
  return kind === 'seed' && month !== undefined && Number.isFinite(month) ? Math.min(65535, Math.max(1, Math.round(month) + MONTH_BASE)) : 0;
}
// (the grow-in itself, stages, masks and chunk keys, is T076's ext/course-fx: pass it now + MONTH_BASE)
/** the holes still growing in at the effective game month `now` (grow cards included), each with the effective month its last seeded cell
 *  is grown in (T121, P23 4.6: the hole card's "growing · ready Mar 1985"); a hole whose cells are all grown in (or sod, or established)
 *  is left out. A cell is grown in when now + MONTH_BASE reaches its month value plus its surface's grow-in months, as course-fx growMask */
export function growingHoles(g: Grid, now: number): Map<number, number> {
  const out = new Map<number, number>(), t = now + MONTH_BASE, { surf, hole, month } = g;
  for (let i = 0; i < surf.length; i++) {
    const m = month[i]!; if (!m) continue;
    const h = hole[i]!, n = SURF_GROW_MONTHS[surf[i]!] ?? 0; if (!h || n <= 0) continue;
    const ready = m + n; if (ready > t && ready > (out.get(h) ?? -1)) out.set(h, ready);
  }
  for (const [h, r] of out) out.set(h, r - MONTH_BASE);
  return out;
}

// ---- surfaces ----

/** the golf surface of each surface id (none is map grass) */
export const SURF_SURFACE: readonly (GolfSurface | null)[] = [null, 'rough', 'fescue', 'water', 'fairway', 'tee', 'bunker', 'waste', 'green', 'longGrass'];
/** the golf surface each automatic collar counts as (the bank is rocky dirt: no turf) */
export const COLLAR_SURFACE: Readonly<Record<CollarStyle['name'], GolfSurface>> = { 'first-cut': 'firstCut', fringe: 'fringe', lip: 'rough', bank: 'other' };
/** a texture id each golf surface reads back as (golf/costs.ts surfaceOfTex gives the surface again; the game's own course photos) */
export const SURFACE_TEX_ID: Readonly<Record<GolfSurface, PaintTex>> = {
  green: 'golfGreen', fringe: 'golfFringe', tee: 'golfTee', fairway: 'golfFairway', firstCut: 'golfFirstCut', rough: 'golfRough',
  fescue: 'golfFescue', longGrass: 'golfLongGrass', bunker: 'bunkerSand', waste: 'wasteSand', water: 'waterDark', path: 'spectatorPath', other: 'rockyDirt',
} as Record<GolfSurface, PaintTex>;
/** the surface id a golf surface paints into the grid, or 0 when it has none (fringe and first cut are automatic collars now, cart
 *  paths are the road tool's, other is not course) */
export function surfOfSurface(s: GolfSurface | null | undefined): number {
  switch (s) {
    case 'rough': return SURF.rough; case 'fescue': return SURF.fescue; case 'water': return SURF.water; case 'fairway': return SURF.fairway;
    case 'tee': return SURF.tee; case 'bunker': return SURF.bunker; case 'waste': return SURF.waste; case 'green': return SURF.green;
    case 'longGrass': return SURF.longGrass;
    default: return 0;
  }
}

// ---- the areas ----

/** a course area made from the grid: one blob of one surface and hole (or its collar band). `pts` is the blob as one polygon: its outer
 *  ring with each hole joined in by a two-way bridge (even-odd inside tests, the shoelace area and the centroid all see the holes);
 *  `outer` is the outer ring alone (snap targets and boxes). `s` is the surface id the area comes from (a collar's surface's id). */
export interface GridArea extends CourseArea { hole: number; tex: PaintTex; s: number; collar?: CollarStyle['name']; outer: number[] }

/** the first id of grid areas (above any painted area's id) */
export const GRID_AREA_ID = 1_000_000;

/** the course areas of the grid (plan 3.7): per surface id (draw order) and hole, one GridArea per blob, each collar band just before its
 *  surface's blobs; holes: only these hole numbers (default every hole, 0 included). Outlines are blobOutlines (the same field, closing
 *  and relax as the drawn chunks; another hole's cells of the same surface are never claimed by the closing). A blob's planting: seeded
 *  (plantKind 'seed', plantedMonth the mean game month of its seeded cells) when at least half its cells are seeded, else established. */
export function gridAreas(g: Grid, holes?: Iterable<number>): GridArea[] {
  const want = holes ? new Uint8Array(256) : null;
  if (holes && want) for (const h of holes) if (h >= 0 && h < 256) want[h] = 1;
  // one pass: per (surface, hole) the cell box, the count, the seeded count and their month sum
  const K = N_SURF * 256, bx0 = new Int32Array(K).fill(2147483647), by0 = new Int32Array(K).fill(2147483647), bx1 = new Int32Array(K).fill(-1), by1 = new Int32Array(K).fill(-1);
  const cnt = new Float64Array(K), seeded = new Float64Array(K), msum = new Float64Array(K);
  for (let j = 0, i = 0; j < g.h; j++) for (let c = 0; c < g.w; c++, i++) {
    const s = g.surf[i]; if (!s || s >= N_SURF) continue;
    const h = g.hole[i]; if (want && !want[h]) continue;
    const k = s * 256 + h;
    if (c < bx0[k]) bx0[k] = c; if (c > bx1[k]) bx1[k] = c; if (j < by0[k]) by0[k] = j; if (j > by1[k]) by1[k] = j;
    cnt[k]++; const m = g.month[i]; if (m) { seeded[k]++; msum[k] += m; }
  }
  const out: GridArea[] = [];
  for (const s of SURF_ORDER) if (s && s < N_SURF) for (let h = 0; h < 256; h++) { // (T271: a custom grass's cells hold the surface it plays as)
    const k = s * 256 + h; if (!cnt[k]) continue;
    const st = BLOB_STYLE[s] ?? { close: 0, relax: 0 }, col = st.collar;
    const plant = (SURF_GROW_MONTHS[s] ?? 0) > 0 && seeded[k] * 2 >= cnt[k] ? { plantKind: 'seed' as const, plantedMonth: Math.round(msum[k] / seeded[k]) - MONTH_BASE } : {};
    const pad = 4 + Math.ceil(st.close) + (col ? Math.ceil(col.width) : 0);
    const w = window(g, bx0[k] - pad, by0[k] - pad, bx1[k] + pad, by1[k] + pad, s, h);
    const box = { x0: w.x0, y0: w.y0, x1: w.x0 + w.w * CELL_T, y1: w.y0 + w.h * CELL_T };
    const rings = blobOutlines(w, s, box, { close: st.close, relax: st.relax });
    if (col) {
      const band = collarWindow(w, s, col);
      const crings = blobOutlines(band, s, box, { close: st.close, relax: st.relax }).filter(r => signedArea(r) > 0);
      // the band: the dilated outline with the surface's own blobs cut out
      for (const p of bridgeAll(crings.concat(rings.filter(r => signedArea(r) > 0).map(reverse)))) out.push({ id: 0, surface: COLLAR_SURFACE[col.name], hole: h, tex: SURFACE_TEX_ID[COLLAR_SURFACE[col.name]], s, collar: col.name, pts: p.pts, outer: p.outer });
    }
    const surface = SURF_SURFACE[s]!;
    for (const p of bridgeAll(rings)) out.push({ id: 0, surface, hole: h, tex: SURFACE_TEX_ID[surface], s, pts: p.pts, outer: p.outer, ...plant });
  }
  out.sort((p, q) => areaRank(p) - areaRank(q)); // stable: blobs keep their order within a surface and hole
  const seen = new Map<number, number>(); // ids per hole (GRID_AREA_ID + hole x 100,000 + its rank in the hole), so lists made hole by hole never clash
  for (const a of out) { const k = seen.get(a.hole) ?? 0; seen.set(a.hole, k + 1); a.id = GRID_AREA_ID + a.hole * 100_000 + k; }
  return out;
}

/** the draw-order rank of a grid area: by its surface's draw rank (course-grid SURF_RANK), a collar band just before its surface (sort
 *  ascending, then by hole) */
export function areaRank(a: Pick<GridArea, 's' | 'collar' | 'hole'>): number { return (surfRank(a.s) * 2 + (a.collar ? 0 : 1)) * 256 + a.hole; }

/** a painted area to lay into the grid: its outline (tiles, corners already rounded), its golf surface, hole and month value */
export interface RasterArea { pts: number[]; surface: GolfSurface | null; hole?: number; month: number }
/** lays areas into the grid in their order (a later one over an earlier one, as painted); an area whose surface has no surface id
 *  (fringe, first cut, path, other) is skipped. Returns how many cell writes changed a cell (a cell painted twice counts twice). */
export function rasterAreas(g: Grid, areas: readonly RasterArea[]): number {
  let n = 0;
  for (const a of areas) {
    const s = surfOfSurface(a.surface); if (!s || a.pts.length < 6) continue;
    const p: { x: number; y: number }[] = [];
    for (let k = 0; k + 1 < a.pts.length; k += 2) p.push({ x: a.pts[k]!, y: a.pts[k + 1]! });
    n += fillPolygon(g, p, s, Math.max(0, Math.min(255, Math.round(a.hole ?? 0))), a.month).n;
  }
  return n;
}

/** visits every cell of g whose centre lies inside the polygon pts (tiles, even-odd), as fillPolygon fills them (a dry run: the price of a
 *  fill before it is made) */
export function polyCells(g: Grid, pts: readonly number[], visit: (i: number, x: number, y: number) => void): void {
  const n = pts.length >> 1; if (n < 3) return;
  let y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < n; k++) { const y = pts[2 * k + 1]!; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const r0 = Math.max(0, Math.floor((y0 - g.y0) / CELL_T) - 1), r1 = Math.min(g.h - 1, Math.floor((y1 - g.y0) / CELL_T) + 1), xs: number[] = [];
  for (let cy = r0; cy <= r1; cy++) {
    const yc = g.y0 + (cy + 0.5) * CELL_T; xs.length = 0;
    for (let j = 0, k = n - 1; j < n; k = j++) { const py = pts[2 * k + 1]!, qy = pts[2 * j + 1]!; if ((py > yc) !== (qy > yc)) { const px = pts[2 * k]!, qx = pts[2 * j]!; xs.push(px + ((yc - py) * (qx - px)) / (qy - py)); } }
    xs.sort((a, b) => a - b);
    for (let e = 0; e + 1 < xs.length; e += 2) {
      const c0 = Math.max(0, Math.ceil((xs[e]! - g.x0) / CELL_T - 0.5)), c1 = Math.min(g.w - 1, Math.ceil((xs[e + 1]! - g.x0) / CELL_T - 0.5) - 1);
      for (let cx = c0; cx <= c1; cx++) visit(cy * g.w + cx, g.x0 + (cx + 0.5) * CELL_T, yc);
    }
  }
}

/** merges diffs made in order into one (course-grid mergeDiffs, pairwise in a balanced tree: n log k for k diffs of n cells in all);
 *  null when the list is empty */
export function mergeMany(list: readonly GridDiff[]): GridDiff | null {
  let cur = list.filter(d => d.n > 0);
  if (!cur.length) return list[0] ?? null;
  while (cur.length > 1) {
    const next: GridDiff[] = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? mergeDiffs(cur[i]!, cur[i + 1]!) : cur[i]!);
    cur = next;
  }
  return cur[0]!;
}

// ---- internals ----

/** the window grid of cells [c0, c1] x [r0, r1] (clamped to g) for surface s of hole h: the grid's surfaces, with s's cells of other
 *  holes marked 255 (course-blobs' outside: never claimed by a closing, so two holes' fairways stay apart) */
function window(g: Grid, c0: number, r0: number, c1: number, r1: number, s: number, h: number): Grid {
  c0 = Math.max(0, c0); r0 = Math.max(0, r0); c1 = Math.min(g.w - 1, c1); r1 = Math.min(g.h - 1, r1);
  const w = c1 - c0 + 1, hh = r1 - r0 + 1, surf = new Uint8Array(w * hh), hole = new Uint8Array(w * hh), cv = g.carve, carve = new Uint8Array(w * hh);
  for (let j = 0; j < hh; j++) {
    const src = (r0 + j) * g.w + c0, dst = j * w;
    for (let i = 0; i < w; i++) {
      const t = g.surf[src + i]!, th = g.hole[src + i]!;
      surf[dst + i] = t === s && th !== h ? 255 : t; hole[dst + i] = th; if (cv) carve[dst + i] = cv[src + i]!;
    }
  }
  // the carve flags come along (T125): the closing and the collar leave a rubbed-out gap open, as the drawn chunks do
  return { x0: g.x0 + c0 * CELL_T, y0: g.y0 + r0 * CELL_T, w, h: hh, surf, hole, month: new Uint16Array(w * hh), rev: 0, carve };
}

/** the collar window of a surface window: s on the surface's cells and on the cells within the collar's width of them whose surface it
 *  lays over, 0 elsewhere (the band before the closing; plan 3.4) */
function collarWindow(w: Grid, s: number, col: CollarStyle): Grid {
  const n = w.w * w.h, out = new Uint8Array(n), over = new Uint8Array(256), r = Math.max(0, Math.round(col.width)), rr = r * r;
  for (const t of col.over) over[t] = 1;
  for (let j = 0; j < w.h; j++) for (let i = 0; i < w.w; i++) {
    if (w.surf[j * w.w + i] !== s) continue;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > rr) continue;
      const x = i + dx, y = j + dy; if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
      const q = y * w.w + x, t = w.surf[q]!;
      if (t === s || (over[t] && !isCarved(w, q))) out[q] = s;
    }
  }
  return { ...w, surf: out };
}

/** the shoelace area of a flat ring, tiles² (positive: counter-clockwise on the map's axes, x east and y south, as course-blobs' outer
 *  rings; holes are negative) */
export function ringArea(p: ArrayLike<number>): number { return signedArea(p); }
function signedArea(p: ArrayLike<number>): number {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i += 2) { const j = (i + 2) % n; a += p[i]! * p[j + 1]! - p[j]! * p[i + 1]!; }
  return a / 2;
}
/** a flat ring's points in reverse order */
function reverse(p: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = p.length - 2; i >= 0; i -= 2) out.push(p[i]!, p[i + 1]!);
  return out;
}
/** even-odd point in a flat ring */
function inside(p: readonly number[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i]!, yi = p[i + 1]!, xj = p[j]!, yj = p[j + 1]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** groups rings (outer counter-clockwise, holes clockwise) into blobs: each hole goes to the smallest outer ring holding its first point
 *  and is joined into it by a bridge from its rightmost point to the nearest point of the polygon so far */
function bridgeAll(rings: readonly number[][]): { pts: number[]; outer: number[] }[] {
  const outs = rings.filter(r => signedArea(r) > 0).map(r => ({ outer: r, area: signedArea(r), holes: [] as number[][] }));
  outs.sort((a, b) => a.area - b.area);
  for (const r of rings) {
    if (signedArea(r) >= 0 || r.length < 6) continue;
    const o = outs.find(q => inside(q.outer, r[0]!, r[1]!));
    if (o) o.holes.push(r);
  }
  return outs.map(o => {
    let pts = o.outer;
    for (const hole of o.holes) pts = bridge(pts, hole);
    return { pts, outer: o.outer };
  });
}
/** a polygon with a hole joined in: from the hole's rightmost point to the polygon's nearest point and back (each bridge edge is walked
 *  once each way, so it adds no area and no inside crossing) */
function bridge(P: readonly number[], H: readonly number[]): number[] {
  let j = 0;
  for (let k = 2; k < H.length; k += 2) if (H[k]! > H[j]!) j = k;
  const hx = H[j]!, hy = H[j + 1]!;
  let i = 0, best = Infinity;
  for (let k = 0; k < P.length; k += 2) { const d = (P[k]! - hx) ** 2 + (P[k + 1]! - hy) ** 2; if (d < best) { best = d; i = k; } }
  const out = P.slice(0, i + 2) as number[];
  for (let k = 0; k < H.length; k += 2) { const q = (j + k) % H.length; out.push(H[q]!, H[q + 1]!); }
  out.push(hx, hy, P[i]!, P[i + 1]!);
  for (let k = i + 2; k < P.length; k++) out.push(P[k]!);
  return out;
}


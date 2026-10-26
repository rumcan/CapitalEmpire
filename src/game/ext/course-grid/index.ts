// The golf course grid (plan P21, T072): one surface, hole and planted month per 1 m cell, brush dabs, strokes and polygon fills that return diffs for undo, and a compact run-length save. Pure TypeScript, no DOM, deterministic. Units: positions and radii in tiles of 2 m; cell indices and sizes in cells (0.5 tile, 1 m); surfaces are SURF ids; months are planting month indices.

/** tiles per cell: 0.5 tile, so a cell is 1 m square */
export const CELL_T = 0.5;

/** surface ids, in draw order from low to high (a higher id draws over a lower one); none is map grass */
export const SURF = { none: 0, rough: 1, fescue: 2, water: 3, fairway: 4, tee: 5, bunker: 6, waste: 7, green: 8 } as const;

/** the most cells a save may hold: the whole 4 km map at 1 m (cells) */
const MAX_CELLS = 4096 * 4096;

/** a point in tiles */
export interface Pt { x: number; y: number }

/** the course grid: origin (x0, y0) in tiles, on the cell lattice; size (w, h) in cells; per cell, row-major (i = cy * w + cx), the surface (SURF id), the hole number (0 to 18 as P21; a none cell holds 0) and the planted month; rev counts changes. carve (T125): 1 on a cell the player rubbed out (Rub out laid the base there: rough, or the land's grass), so course-blobs' closing, fillets and collars never claim it and the gap shows as cut; painting the cell again clears it (see isCarved; absent: no cell is carved) */
export interface Grid { x0: number; y0: number; w: number; h: number; surf: Uint8Array; hole: Uint8Array; month: Uint16Array; rev: number; carve?: Uint8Array }

/** the cells one call changed: indices (row-major, i = cy * w + cx) into the geometry (x0, y0, w) the diff was made on, and each cell's surface, hole and month before (s0, h0, m0) and after (s1, h1, m1), and its carve flag before and after (c0, c1; T125: 255, or no arrays, leaves the flag as it is); every array is n long */
export interface GridDiff { x0: number; y0: number; w: number; n: number; idx: Uint32Array; s0: Uint8Array; h0: Uint8Array; m0: Uint16Array; s1: Uint8Array; h1: Uint8Array; m1: Uint16Array; c0?: Uint8Array; c1?: Uint8Array }

/** brush options: over 'below' changes only cells whose surface is lower than the brush's, or equal (which changes the hole and month), and 'any' (the default) changes every cell; allow(i) refuses cell i when it returns false (refused cells are left out of the diff); rub turns the brush into rub out (see paintDisc); carve (T125: the Paint tool's Rub out) marks the cells it lays as carved, where any other brush clears the mark */
export interface PaintOpts { over?: 'below' | 'any'; allow?: (i: number) => boolean; rub?: boolean; carve?: boolean }

/** the save of a grid (plan 3.7): v 1, origin (tiles), size (cells), and the surface (s), hole (hl) and month (m) layers as base64 of (run, value) unsigned LEB128 varint pairs; c, the carve layer the same way (T125; left out when no cell is carved) */
export interface GridSave { v: 1; x0: number; y0: number; w: number; h: number; s: string; hl: string; m: string; c?: string }

/** a new grid of none cells with holes 0 and months 0; the origin (x0, y0) is in tiles and is snapped to the cell lattice (multiples of CELL_T), the size (w, h) is in whole cells */
export function makeGrid(x0: number, y0: number, w: number, h: number): Grid {
  const n = w * h;
  return { x0: snap(x0), y0: snap(y0), w, h, surf: new Uint8Array(n), hole: new Uint8Array(n), month: new Uint16Array(n), rev: 0, carve: new Uint8Array(n) };
}

/** whether cell i is carved (T125): the player rubbed it out and it still holds the base (rough or the land's grass), so the blobs' closing,
 *  fillets and collars leave it alone */
export function isCarved(g: Grid, i: number): boolean { return !!g.carve?.[i] && g.surf[i]! <= SURF.rough; }

/** the index of the cell that holds tile (x, y), or -1 when it lies outside the grid (tiles in, cell index out) */
export function cellAt(g: Grid, x: number, y: number): number {
  const cx = Math.floor((x - g.x0) / CELL_T), cy = Math.floor((y - g.y0) / CELL_T);
  return cx >= 0 && cy >= 0 && cx < g.w && cy < g.h ? cy * g.w + cx : -1;
}

/** the centre of cell i, in tiles */
export function cellCentre(g: Grid, i: number): { x: number; y: number } {
  const cx = i % g.w, cy = (i - cx) / g.w;
  return { x: g.x0 + (cx + 0.5) * CELL_T, y: g.y0 + (cy + 0.5) * CELL_T };
}

/** a brush dab: sets every cell whose centre is within r tiles (inclusive) of (x, y) to surface s with hole and month, and returns the diff of what changed. The grid is changed in place. Rub out: opts.rub with s = rough (s is ignored): a cell above rough becomes rough (keeping its hole and month), rough becomes none, and none stays none. A cell that becomes none holds hole 0 and month 0. Units: tiles. */
export function paintDisc(g: Grid, x: number, y: number, r: number, s: number, hole: number, month: number, opts: PaintOpts = {}): GridDiff {
  const [cx0, cx1] = span(x - r, x + r, g.x0, g.w), [cy0, cy1] = span(y - r, y + r, g.y0, g.h);
  const a = newAcc(g.x0, g.y0, g.w, Math.max(0, cx1 - cx0 + 1) * Math.max(0, cy1 - cy0 + 1)), rr = r * r;
  for (let cy = cy0; cy <= cy1; cy++) {
    const dy = g.y0 + (cy + 0.5) * CELL_T - y, dy2 = dy * dy;
    if (dy2 > rr) continue;
    for (let cx = cx0; cx <= cx1; cx++) {
      const dx = g.x0 + (cx + 0.5) * CELL_T - x;
      if (dx * dx + dy2 <= rr) brush(g, a, cy * g.w + cx, s, hole, month, opts);
    }
  }
  return finish(g, a);
}

/** a brush stroke: dabs (see paintDisc) along the segment from (ax, ay) to (bx, by), at most r/3 apart, with both ends included; with snap > 0
 *  (T108: the Paint brush on the half grid) each dab's centre is rounded to a multiple of snap and a dab on the same spot as the one before is
 *  left out; the grid is changed in place and the result is one merged diff. Units: tiles. */
export function paintStroke(g: Grid, ax: number, ay: number, bx: number, by: number, r: number, s: number, hole: number, month: number, opts: PaintOpts = {}, snap = 0): GridDiff {
  const len = Math.hypot(bx - ax, by - ay), n = r > 0 ? Math.max(1, Math.ceil(len / (r / 3))) : 1;
  const parts: GridDiff[] = [];
  let px = NaN, py = NaN;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    let x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    if (snap > 0) { x = Math.round(x / snap) * snap; y = Math.round(y / snap) * snap; if (x === px && y === py) continue; px = x; py = y; }
    parts.push(paintDisc(g, x, y, r, s, hole, month, opts));
  }
  return mergeAll(parts);
}

/** fills every cell whose centre lies inside the polygon pts (tiles, even-odd rule), with the same rules as paintDisc; fewer than three points change nothing. The grid is changed in place. */
export function fillPolygon(g: Grid, pts: Pt[], s: number, hole: number, month: number, opts: PaintOpts = {}): GridDiff {
  if (pts.length < 3) return close(newAcc(g.x0, g.y0, g.w, 0));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  const [cx0, cx1] = span(minX, maxX, g.x0, g.w), [cy0, cy1] = span(minY, maxY, g.y0, g.h);
  const a = newAcc(g.x0, g.y0, g.w, Math.max(0, cx1 - cx0 + 1) * Math.max(0, cy1 - cy0 + 1));
  const xs: number[] = [];
  for (let cy = cy0; cy <= cy1; cy++) {
    const yc = g.y0 + (cy + 0.5) * CELL_T;
    xs.length = 0;
    for (let j = 0, k = pts.length - 1; j < pts.length; k = j++) {
      const p = pts[k], q = pts[j];
      if ((p.y > yc) !== (q.y > yc)) xs.push(p.x + ((yc - p.y) * (q.x - p.x)) / (q.y - p.y));
    }
    xs.sort((u, v) => u - v);
    let e = 0;
    for (let cx = cx0; cx <= cx1; cx++) {
      const xc = g.x0 + (cx + 0.5) * CELL_T;
      while (e < xs.length && xs[e] <= xc) e++;
      if (e & 1) brush(g, a, cy * g.w + cx, s, hole, month, opts);
    }
  }
  return finish(g, a);
}

/** paints the first n cells of idx (cell indices of g; T122's Run: the cells of a strip, each once) with the same rules as paintDisc, as one
 *  diff. The grid is changed in place. */
export function paintCells(g: Grid, idx: ArrayLike<number>, n: number, s: number, hole: number, month: number, opts: PaintOpts = {}): GridDiff {
  const a = newAcc(g.x0, g.y0, g.w, n), len = g.w * g.h;
  for (let k = 0; k < n; k++) { const i = idx[k]!; if (i >= 0 && i < len) brush(g, a, i, s, hole, month, opts); }
  return finish(g, a);
}

/** applies a diff to g: undo true restores each cell's before values, false sets its after values (redo). A diff made on another geometry (the grid grew) lands on the cells at the same tiles; cells g does not cover are skipped. Bumps rev. */
export function applyDiff(g: Grid, d: GridDiff, undo: boolean): void {
  const cs = undo ? d.c0 : d.c1;
  for (let k = 0; k < d.n; k++) {
    const i = locate(g, d, k);
    if (i < 0) continue;
    if (undo) { g.surf[i] = d.s0[k]; g.hole[i] = d.h0[k]; g.month[i] = d.m0[k]; }
    else { g.surf[i] = d.s1[k]; g.hole[i] = d.h1[k]; g.month[i] = d.m1[k]; }
    const c = cs?.[k];
    if (c !== undefined && c !== 255 && (c || g.carve)) (g.carve ??= new Uint8Array(g.w * g.h))[i] = c;
  }
  if (d.n) g.rev++;
}

/** merges two diffs made in order (a, then b) into one: per cell the earlier before value and the later after value win; cells that end where they began are dropped. The result's indices are on the bounding box of its cells. */
export function mergeDiffs(a: GridDiff, b: GridDiff): GridDiff {
  return mergeAll([a, b]);
}

/** the bounding box of a diff's changed cells, in tiles (the cells' outer edges), or null when nothing changed */
export function diffBox(d: GridDiff): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!d.n) return null;
  let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
  for (let k = 0; k < d.n; k++) {
    const cx = d.idx[k] % d.w, cy = (d.idx[k] - cx) / d.w;
    if (cx < c0) c0 = cx; if (cx > c1) c1 = cx; if (cy < r0) r0 = cy; if (cy > r1) r1 = cy;
  }
  return { x0: d.x0 + c0 * CELL_T, y0: d.y0 + r0 * CELL_T, x1: d.x0 + (c1 + 1) * CELL_T, y1: d.y0 + (r1 + 1) * CELL_T };
}

/** the cost of a diff: the sum of price(s) over the cells whose surface becomes a new non-none surface. Free: a cell that becomes none, a cell whose surface only changes its hole or month, and a rub out (a cell above rough that becomes rough). `price` takes a SURF id and returns money. */
export function diffCost(d: GridDiff, price: (s: number) => number): number {
  let cost = 0;
  for (let k = 0; k < d.n; k++) {
    const s0 = d.s0[k], s1 = d.s1[k];
    if (s1 === SURF.none || s1 === s0) continue;
    if (s1 === SURF.rough && s0 > SURF.rough) continue;
    cost += price(s1);
  }
  return cost;
}

/** a bigger grid (origin (x0, y0) in tiles, size (w, h) in cells) that holds a copy of g at its place; the new box must contain g's box, else it throws a RangeError. rev is g's rev plus one. */
export function growGrid(g: Grid, x0: number, y0: number, w: number, h: number): Grid {
  const ng = makeGrid(x0, y0, w, h), dx = Math.round((g.x0 - ng.x0) / CELL_T), dy = Math.round((g.y0 - ng.y0) / CELL_T);
  if (dx < 0 || dy < 0 || dx + g.w > ng.w || dy + g.h > ng.h) throw new RangeError('growGrid: the new box must contain the old one');
  for (let cy = 0; cy < g.h; cy++) {
    const s = cy * g.w, d = (cy + dy) * ng.w + dx;
    ng.surf.set(g.surf.subarray(s, s + g.w), d); ng.hole.set(g.hole.subarray(s, s + g.w), d); ng.month.set(g.month.subarray(s, s + g.w), d);
    if (g.carve) ng.carve!.set(g.carve.subarray(s, s + g.w), d);
  }
  ng.rev = g.rev + 1;
  return ng;
}

/** the grid box a golf game's land needs (land: tile rects [x, y, w, h], the course and its parcels), grown to hold extra (a tile box x0, y0,
 *  x1, y1: painted areas a migration lays in), as x0, y0 (tiles) and w, h (cells): the bounds plus pad tiles, kept on the map (0..map); null
 *  with no land */
export function landGridBox(land: readonly (readonly number[])[], pad: number, map: number, extra?: readonly number[] | null): [number, number, number, number] | null {
  if (!land.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, w, h] of land) { x0 = Math.min(x0, x!); y0 = Math.min(y0, y!); x1 = Math.max(x1, x! + w!); y1 = Math.max(y1, y! + h!); }
  if (extra) { x0 = Math.min(x0, extra[0]!); y0 = Math.min(y0, extra[1]!); x1 = Math.max(x1, extra[2]!); y1 = Math.max(y1, extra[3]!); }
  x0 = Math.max(0, Math.floor(x0 - pad)); y0 = Math.max(0, Math.floor(y0 - pad)); x1 = Math.min(map, Math.ceil(x1 + pad)); y1 = Math.min(map, Math.ceil(y1 + pad));
  return [x0, y0, Math.round((x1 - x0) / CELL_T), Math.round((y1 - y0) / CELL_T)];
}
/** grid g grown (growGrid) to also hold box b (x0, y0 tiles, w, h cells: landGridBox), or null when g already holds it (bought land inside
 *  the grid's margin) */
export function fitGrid(g: Grid, b: readonly [number, number, number, number]): Grid | null {
  const x0 = Math.min(g.x0, b[0]), y0 = Math.min(g.y0, b[1]), x1 = Math.max(g.x0 + g.w * CELL_T, b[0] + b[2] * CELL_T), y1 = Math.max(g.y0 + g.h * CELL_T, b[1] + b[3] * CELL_T);
  if (x0 === g.x0 && y0 === g.y0 && x1 === g.x0 + g.w * CELL_T && y1 === g.y0 + g.h * CELL_T) return null;
  return growGrid(g, x0, y0, Math.round((x1 - x0) / CELL_T), Math.round((y1 - y0) / CELL_T));
}

/** the save of a grid (see GridSave): a few tens of kB for a full course, since most cells repeat their neighbour */
export function encodeGrid(g: Grid): GridSave {
  return { v: 1, x0: g.x0, y0: g.y0, w: g.w, h: g.h, s: rle(g.surf), hl: rle(g.hole), m: rle(g.month), ...(g.carve?.some(v => v) ? { c: rle(g.carve) } : {}) };
}

/** the grid from a save, or null when the save is not one: wrong version or types, a size of 1 to 16.7 M cells, an origin off the cell lattice, a layer that does not fill the grid exactly, or a value out of range. Never throws. */
export function decodeGrid(save: unknown): Grid | null {
  if (typeof save !== 'object' || save === null) return null;
  const r = save as Record<string, unknown>;
  const x0 = r.x0, y0 = r.y0, w = r.w, h = r.h;
  if (r.v !== 1 || typeof x0 !== 'number' || typeof y0 !== 'number' || typeof w !== 'number' || typeof h !== 'number') return null;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w * h > MAX_CELLS) return null;
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || snap(x0) !== x0 || snap(y0) !== y0) return null;
  const n = w * h, surf = new Uint8Array(n), hole = new Uint8Array(n), month = new Uint16Array(n);
  if (!unrle(r.s, surf, SURF.green) || !unrle(r.hl, hole, 255) || !unrle(r.m, month, 65535)) return null;
  const carve = new Uint8Array(n);
  if (r.c !== undefined && !unrle(r.c, carve, 1)) return null;
  return { x0, y0, w, h, surf, hole, month, rev: 0, carve };
}

/* ---- internals ---- */

/** a diff under construction: room for cap cells, the most one call can change (each cell is visited once) */
interface Acc { x0: number; y0: number; w: number; n: number; idx: Uint32Array; s0: Uint8Array; h0: Uint8Array; m0: Uint16Array; s1: Uint8Array; h1: Uint8Array; m1: Uint16Array; c0: Uint8Array; c1: Uint8Array }

/** snaps a tile coordinate to the cell lattice */
const snap = (v: number) => Math.round(v / CELL_T) * CELL_T;

/** an empty accumulator for a geometry of w cells per row with origin (x0, y0), room for cap cells */
function newAcc(x0: number, y0: number, w: number, cap: number): Acc {
  return { x0, y0, w, n: 0, idx: new Uint32Array(cap), s0: new Uint8Array(cap), h0: new Uint8Array(cap), m0: new Uint16Array(cap), s1: new Uint8Array(cap), h1: new Uint8Array(cap), m1: new Uint16Array(cap), c0: new Uint8Array(cap), c1: new Uint8Array(cap) };
}

/** the cell range [lo, hi] that the tile span [a, b] touches on one axis (origin o, n cells), with one cell of margin, clamped to the grid */
function span(a: number, b: number, o: number, n: number): [number, number] {
  return [Math.max(0, Math.floor((a - o) / CELL_T) - 1), Math.min(n - 1, Math.floor((b - o) / CELL_T) + 1)];
}

/** sets cell i to (s, h, m) with carve flag c (255: as it is) and records it when it changes; a none cell holds hole 0 and month 0 */
function put(g: Grid, a: Acc, i: number, s: number, h: number, m: number, c = 255): void {
  const nh = s === SURF.none ? 0 : h, nm = s === SURF.none ? 0 : m;
  const s0 = g.surf[i], h0 = g.hole[i], m0 = g.month[i], cv0 = g.carve?.[i] ?? 0, cv = c === 255 ? cv0 : c;
  if (s0 === s && h0 === nh && m0 === nm && cv0 === cv) return;
  const k = a.n++;
  a.idx[k] = i; a.s0[k] = s0; a.h0[k] = h0; a.m0[k] = m0; a.s1[k] = s; a.h1[k] = nh; a.m1[k] = nm; a.c0[k] = cv0; a.c1[k] = cv;
  g.surf[i] = s; g.hole[i] = nh; g.month[i] = nm;
  if (cv !== cv0) (g.carve ??= new Uint8Array(g.w * g.h))[i] = cv;
}

/** whether a surface id is turf (grass of some kind: the map grass, rough, fescue, fairway, tee, green), not sand or water */
export const isTurf = (s: number) => s === SURF.none || s === SURF.rough || s === SURF.fescue || s === SURF.fairway || s === SURF.tee || s === SURF.green;
/** the month value a cell of surface `cur` (holding month `curMonth`) takes when surface s is laid on it with the planting month `month`
 *  (the owner's test, 2026-10-25: a built hole's rough came up as a brown dirt oval): rough and fescue laid over the map grass are already
 *  grass, so they are established at once (0); over another grass they keep that grass's state (growing or not); over sand, water or waste
 *  they are seeded as anything else. Every other surface takes `month` */
export function laidMonth(s: number, cur: number, curMonth: number, month: number): number {
  if (s !== SURF.rough && s !== SURF.fescue) return month;
  if (cur === SURF.none) return 0;
  return isTurf(cur) ? curMonth : month;
}

/** applies one brush to cell i under the options (allow, rub, over) */
function brush(g: Grid, a: Acc, i: number, s: number, hole: number, month: number, o: PaintOpts): void {
  if (o.allow && !o.allow(i)) return;
  const cur = g.surf[i];
  if (o.rub) {
    if (cur === SURF.rough) put(g, a, i, SURF.none, 0, 0);
    else if (cur > SURF.rough) put(g, a, i, SURF.rough, g.hole[i], g.month[i]);
    return;
  }
  if (o.over === 'below' && cur > s) return;
  put(g, a, i, s, hole, laidMonth(s, cur, g.month[i], month), o.carve ? 1 : 0);
}

/** a diff from an accumulator: arrays cut to exactly n */
function close(a: Acc): GridDiff {
  const n = a.n;
  return { x0: a.x0, y0: a.y0, w: a.w, n, idx: a.idx.slice(0, n), s0: a.s0.slice(0, n), h0: a.h0.slice(0, n), m0: a.m0.slice(0, n), s1: a.s1.slice(0, n), h1: a.h1.slice(0, n), m1: a.m1.slice(0, n), c0: a.c0.slice(0, n), c1: a.c1.slice(0, n) };
}

/** closes a brush's accumulator into a diff and bumps the grid's rev when something changed */
function finish(g: Grid, a: Acc): GridDiff {
  if (a.n) g.rev++;
  return close(a);
}

/** the index in g of diff entry k: its own index when g has the same geometry, else the cell at the same tile centre, or -1 when g does not cover it */
function locate(g: Grid, d: GridDiff, k: number): number {
  const i = d.idx[k];
  if (d.x0 === g.x0 && d.y0 === g.y0 && d.w === g.w) return i;
  const cx = i % d.w, cy = (i - cx) / d.w;
  return cellAt(g, d.x0 + (cx + 0.5) * CELL_T, d.y0 + (cy + 0.5) * CELL_T);
}

/** merges diffs made in order into one (see mergeDiffs); the result is on the bounding box of its cells */
function mergeAll(list: GridDiff[]): GridDiff {
  let total = 0, c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
  for (const d of list) {
    const lc = Math.round(d.x0 / CELL_T), lr = Math.round(d.y0 / CELL_T);
    for (let k = 0; k < d.n; k++) {
      const cx = lc + (d.idx[k] % d.w), cy = lr + Math.floor(d.idx[k] / d.w);
      if (cx < c0) c0 = cx; if (cx > c1) c1 = cx; if (cy < r0) r0 = cy; if (cy > r1) r1 = cy;
      total++;
    }
  }
  if (!total) return close(newAcc(0, 0, 0, 0));
  const w = c1 - c0 + 1, slot = new Map<number, number>(), a = newAcc(c0 * CELL_T, r0 * CELL_T, w, total);
  for (const d of list) {
    const lc = Math.round(d.x0 / CELL_T), lr = Math.round(d.y0 / CELL_T);
    for (let k = 0; k < d.n; k++) {
      const i = d.idx[k], key = (lr + Math.floor(i / d.w) - r0) * w + (lc + (i % d.w) - c0);
      let j = slot.get(key);
      // the carve flag (T125): a diff without one leaves it as it is (255), so the first known value before and the last one after win
      const cb = d.c0?.[k] ?? 255, ca = d.c1?.[k] ?? 255;
      if (j === undefined) { j = a.n++; slot.set(key, j); a.idx[j] = key; a.s0[j] = d.s0[k]; a.h0[j] = d.h0[k]; a.m0[j] = d.m0[k]; a.c0[j] = cb; a.c1[j] = 255; }
      else if (a.c0[j] === 255) a.c0[j] = cb;
      a.s1[j] = d.s1[k]; a.h1[j] = d.h1[k]; a.m1[j] = d.m1[k]; if (ca !== 255) a.c1[j] = ca;
    }
  }
  let m = 0;
  for (let j = 0; j < a.n; j++) {
    if (a.s0[j] === a.s1[j] && a.h0[j] === a.h1[j] && a.m0[j] === a.m1[j] && (a.c1[j] === 255 || a.c0[j] === a.c1[j])) continue;
    a.idx[m] = a.idx[j]; a.s0[m] = a.s0[j]; a.h0[m] = a.h0[j]; a.m0[m] = a.m0[j];
    a.s1[m] = a.s1[j]; a.h1[m] = a.h1[j]; a.m1[m] = a.m1[j]; a.c0[m] = a.c0[j]; a.c1[m] = a.c1[j]; m++;
  }
  a.n = m;
  return close(a);
}

/** a growable byte buffer for the save's varints */
class Bytes {
  b = new Uint8Array(256);
  n = 0;
  put(v: number): void {
    if (this.n === this.b.length) { const nb = new Uint8Array(this.b.length * 2); nb.set(this.b); this.b = nb; }
    this.b[this.n++] = v;
  }
  /** unsigned LEB128 */
  varint(v: number): void {
    while (v >= 128) { this.put((v % 128) | 128); v = Math.floor(v / 128); }
    this.put(v);
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_VAL = new Int16Array(128).fill(-1);
for (let k = 0; k < 64; k++) B64_VAL[B64.charCodeAt(k)] = k;

/** standard padded base64 of the bytes */
function b64(src: Uint8Array): string {
  const n = src.length, out = new Uint8Array(Math.ceil(n / 3) * 4);
  let o = 0;
  for (let i = 0; i < n; i += 3) {
    const t = (src[i] << 16) | ((i + 1 < n ? src[i + 1] : 0) << 8) | (i + 2 < n ? src[i + 2] : 0);
    out[o++] = B64.charCodeAt(t >> 18);
    out[o++] = B64.charCodeAt((t >> 12) & 63);
    out[o++] = i + 1 < n ? B64.charCodeAt((t >> 6) & 63) : 61;
    out[o++] = i + 2 < n ? B64.charCodeAt(t & 63) : 61;
  }
  return new TextDecoder().decode(out);
}

/** the bytes of a strict padded base64 string, or null when it is not one */
function unb64(s: string): Uint8Array | null {
  const len = s.length;
  if (len % 4 !== 0) return null;
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((len / 4) * 3 - pad), v = [0, 0, 0, 0];
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    let padded = false;
    for (let j = 0; j < 4; j++) {
      const c = s.charCodeAt(i + j);
      if (c === 61) { if (i + 4 !== len || j < 2) return null; padded = true; v[j] = 0; }
      else { if (padded || c > 127 || B64_VAL[c] < 0) return null; v[j] = B64_VAL[c]; }
    }
    const t = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
    for (let sh = 16; sh >= 0; sh -= 8) if (o < out.length) out[o++] = (t >> sh) & 255;
  }
  return out;
}

/** a layer as base64 of (run, value) varint pairs */
function rle(a: ArrayLike<number>): string {
  const out = new Bytes(), n = a.length;
  for (let i = 0; i < n;) {
    const v = a[i];
    let j = i + 1;
    while (j < n && a[j] === v) j++;
    out.varint(j - i); out.varint(v);
    i = j;
  }
  return b64(out.b.subarray(0, out.n));
}

/** decodes an RLE layer into out (its length is the cell count); false when the string is bad, a value is above max, or the runs do not fill out exactly */
function unrle(s: unknown, out: Uint8Array | Uint16Array, max: number): boolean {
  if (typeof s !== 'string') return false;
  const b = unb64(s);
  if (!b) return false;
  let p = 0, at = 0;
  const n = out.length;
  const read = (): number => {
    let r = 0, mul = 1;
    for (let k = 0; k < 5; k++) {
      if (p >= b.length) return -1;
      const c = b[p++];
      r += (c & 127) * mul;
      if (c < 128) return r;
      mul *= 128;
    }
    return -1;
  };
  while (p < b.length) {
    const run = read(), v = read();
    if (run < 1 || v < 0 || v > max || run > n - at) return false;
    out.fill(v, at, at + run);
    at += run;
  }
  return at === n;
}

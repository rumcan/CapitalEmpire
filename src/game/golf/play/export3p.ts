// The course exporter for the view from behind the golfer (T412, docs/CINDERLINKS-PORT.md): the painted course turned into the course file Cinderlinks
// loads. That file is the map importer's own stage-1 JSON (osm/types.ts OsmCourseJson, what osm/data/woodhill.json holds): metres, x east and y NORTH of
// the course's centre, the surfaces as polygons by kind ('fairway', 'green', 'tee', 'bunker', 'water', 'rough', and T452's 'waste'), each hole as a 'hole' line with its
// number (ref), par and length, each pin as a 'pin' point, and the ground height as a packed grid (osm/terrarium.ts packGrid). No second format.
//
// How the outlines are made: the painted areas are filled in paint order onto a 1 m lattice (a later area paints over an earlier one, as the game reads
// them), each kind's cells are traced with marching squares (holes in a polygon kept as its inner rings), the straight runs are thinned, then two
// passes of Chaikin's corner cutting round off the steps. Heights: the ground read at every point of a 1.5 m lattice over the land (the game's reader is
// bilinear over the 2 m field), packed at 1 cm.
//
// Pure TS, no DOM. The game's own data comes in through export3pInputOf (the adapter), the rest takes plain data.
import { deriveHoles, type Hole } from '../holes';
import type { AimPoint, CourseArea, GolfSurface, Pin, TeeMark } from '../types';
import { TILE_M } from '../types';
import { ringArea, inRing, type P } from '../osm/geom';
import type { JFeature, JPoly, JPt, OsmCourseJson } from '../osm/types';
import { PACKED, packGrid, type HeightGrid, type OsmHeight } from '../osm/terrarium';
import type { Ground3p } from './look3p';

/** the course file the view loads: the map importer's stage-1 JSON */
export type CourseFile = OsmCourseJson;

/** the kinds of surface the file holds, as the map importer names them */
export type ExportKind = 'fairway' | 'green' | 'tee' | 'bunker' | 'water' | 'rough' | 'waste';
/** the kind each painted surface is exported as (null: not a surface of the file; paths and other paint travel as features, T413). The fringe and the first
 *  cut are mown short and go with the fairway; the long grass and the fescue are rough (the host's lies tell the view which is which, T422). T452: the
 *  waste area is its own kind (sandy, stony ground with sparse scrub, played as waste), no longer a bunker */
export const EXPORT_KIND: Record<GolfSurface, ExportKind | null> = {
  green: 'green', fringe: 'fairway', tee: 'tee', fairway: 'fairway', firstCut: 'fairway', rough: 'rough', longGrass: 'rough', fescue: 'rough',
  bunker: 'bunker', waste: 'waste', water: 'water', path: null, other: null,
};
/** the kinds in the order they are written */
const KINDS: readonly ExportKind[] = ['rough', 'fairway', 'bunker', 'water', 'tee', 'green', 'waste'];

/** the lattice the outlines are traced on, m */
export const OUTLINE_STEP_M = 1;
/** the lattice the heights are kept on, m */
export const HEIGHT_STEP_M = 1.5;
/** the land kept round the course's features, m (the importer's margin) */
export const EXPORT_MARGIN_M = 40;
/** Chaikin passes over each outline */
export const CHAIKIN_PASSES = 2;

/** what the exporter takes: the painted course as plain data (tiles, the game's frame: x east, y SOUTH) and an optional ground reader */
export interface Export3pInput {
  areas: CourseArea[]; tees: TeeMark[]; pins: Pin[]; aims: AimPoint[];
  /** the ground height at a tile point, m (the game's: land plus the course height, bilinear over the 2 m field). Absent: no height in the file (flat) */
  heightAt?: (x: number, y: number) => number;
  /** the holes as the game derives them (holes.ts deriveHoles); absent: derived here from the areas and markers */
  holes?: Hole[];
  /** the course's name and id for the file's meta */
  name?: string; id?: string;
  /** the date written into the height's `fetched` (YYYY-MM-DD); absent: none given */
  date?: string;
  /** overrides: the outline and height lattices and the margin, m */
  outlineStepM?: number; heightStepM?: number; marginM?: number;
}

/** the frame the file is in: the tile at its centre (metres are measured from there, y turned to point north) */
export interface Frame3p { cx: number; cy: number }
/** a tile point in the file's metres */
export const toMetres = (f: Frame3p, x: number, y: number): JPt => [(x - f.cx) * TILE_M, -(y - f.cy) * TILE_M];
/** a point of the file (metres) back in tiles */
export const toTiles = (f: Frame3p, X: number, Y: number): { x: number; y: number } => ({ x: f.cx + X / TILE_M, y: f.cy - Y / TILE_M });

/** the box (tiles) round everything painted or placed, or null when there is nothing */
export function tileBox(inp: Export3pInput): [number, number, number, number] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const a of inp.areas) for (let i = 0; i + 1 < a.pts.length; i += 2) add(a.pts[i]!, a.pts[i + 1]!);
  for (const p of [...inp.tees, ...inp.pins, ...inp.aims]) add(p.x, p.y);
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

/** the course's frame: the middle of the box round everything painted or placed (tile 0, 0 for an empty course) */
export function frame3p(inp: Export3pInput): Frame3p {
  const b = tileBox(inp);
  return b ? { cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2 } : { cx: 0, cy: 0 };
}

// ------------------------------------------------------------------------------------------------------------------------ outlines
/** the painted areas filled onto a lattice of step s tiles over the box: each sample (at the middle of its cell) holds the export kind of the topmost area
 *  that covers it (1 + index into KINDS; 0 none). Each area is filled row by row by the even-odd rule, as holes.ts surfaceAt reads it */
function rasterise(areas: CourseArea[], box: [number, number, number, number], s: number): { w: number; h: number; x0: number; y0: number; cell: Uint8Array } {
  const x0 = box[0] - s, y0 = box[1] - s, w = Math.ceil((box[2] - box[0]) / s) + 2, h = Math.ceil((box[3] - box[1]) / s) + 2, cell = new Uint8Array(w * h);
  const xs: number[] = [];
  for (const a of areas) {
    const k = EXPORT_KIND[a.surface], v = k ? KINDS.indexOf(k) + 1 : 0, p = a.pts, n = p.length >> 1;
    if (n < 3) continue;
    let ay0 = Infinity, ay1 = -Infinity;
    for (let i = 1; i < p.length; i += 2) { ay0 = Math.min(ay0, p[i]!); ay1 = Math.max(ay1, p[i]!); }
    const j0 = Math.max(0, Math.floor((ay0 - y0) / s - 0.5)), j1 = Math.min(h - 1, Math.ceil((ay1 - y0) / s - 0.5));
    for (let j = j0; j <= j1; j++) {
      const y = y0 + (j + 0.5) * s;
      xs.length = 0;
      for (let i = 0, q = n - 1; i < n; q = i++) {
        const xi = p[2 * i]!, yi = p[2 * i + 1]!, xq = p[2 * q]!, yq = p[2 * q + 1]!;
        if ((yi > y) !== (yq > y)) xs.push(((xq - xi) * (y - yi)) / (yq - yi) + xi);
      }
      xs.sort((a, b) => a - b);
      // a paint that is no surface of the file (a path) still covers what lay under it
      for (let t = 0; t + 1 < xs.length; t += 2) {
        const i0 = Math.max(0, Math.ceil((xs[t]! - x0) / s - 0.5)), i1 = Math.min(w - 1, Math.ceil((xs[t + 1]! - x0) / s - 0.5) - 1);
        for (let i = i0; i <= i1; i++) cell[j * w + i] = v;
      }
    }
  }
  return { w, h, x0, y0, cell };
}

/** the closed loops round the samples where inside(i, j) holds, by marching squares over the lattice (samples off the lattice are outside, so every loop
 *  closes). A loop's points are the middles of the lattice edges it crosses, as (i, j) sample coordinates. A saddle (two opposite corners inside) keeps
 *  the two insides apart */
export function marchLoops(w: number, h: number, inside: (i: number, j: number) => boolean): [number, number][][] {
  // T438: the samples read once into a padded byte grid and the edges' links kept in typed arrays (each edge joins at most two others), not a Map of
  // lists: the same loops, from the same starts in the same order, many times faster on a course's 1 m lattice
  const W = w + 2, g = new Uint8Array(W * (h + 2));
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (inside(i, j)) g[(j + 1) * W + i + 1] = 1;
  return marchGrid(w, h, g);
}

/** marchLoops over a padded byte grid made already: (w + 2) x (h + 2), sample (i, j) at (j + 1) * (w + 2) + i + 1, 1 inside, the border 0 */
function marchGrid(w: number, h: number, g: Uint8Array): [number, number][][] {
  const W = w + 2, H = h + 2;
  // edge ids: the horizontal edge from sample (i, j) to (i + 1, j) and the vertical one from (i, j) to (i, j + 1), i and j from -1
  const hid = (i: number, j: number) => 2 * ((j + 1) * W + (i + 1)), vid = (i: number, j: number) => 2 * ((j + 1) * W + (i + 1)) + 1;
  // (each edge's two joined edges + 1, 0: none yet; kept between calls and cleared after, only where written: a course's lattice is millions of edges)
  if (MARCH_L0.length < 2 * W * H) { MARCH_L0 = new Int32Array(2 * W * H); MARCH_L1 = new Int32Array(2 * W * H); MARCH_SEEN = new Uint8Array(2 * W * H); }
  const l0 = MARCH_L0, l1 = MARCH_L1, seen = MARCH_SEEN, order: number[] = [];
  const add = (a: number, b: number) => { if (!l0[a]) { l0[a] = b + 1; order.push(a); } else l1[a] = b + 1; };
  const join = (a: number, b: number) => { add(a, b); add(b, a); };
  for (let j = -1; j < h; j++) {
    const r0 = (j + 1) * W, r1 = r0 + W;
    for (let i = -1; i < w; i++) {
      const a = g[r0 + i + 1]!, b = g[r0 + i + 2]!, c = g[r1 + i + 2]!, d = g[r1 + i + 1]!;
      if (a === b && b === c && c === d) continue;
      const T = hid(i, j), R = vid(i + 1, j), B = hid(i, j + 1), L = vid(i, j);
      let e0 = -1, e1 = -1, n = 0;
      if (a !== b) { e0 = T; n++; }
      if (b !== c) { if (n) e1 = R; else e0 = R; n++; }
      if (c !== d) { if (n === 1) e1 = B; else if (!n) e0 = B; n++; }
      if (d !== a) { if (n === 1) e1 = L; n++; }
      if (n === 2) join(e0, e1);
      else if (a) { join(T, L); join(R, B); } // a saddle with a and c inside: cut round each
      else { join(T, R); join(L, B); } // b and d inside
    }
  }
  const pt = (id: number): [number, number] => {
    const k = id >> 1, i = (k % W) - 1, j = Math.floor(k / W) - 1;
    return id & 1 ? [i, j + 0.5] : [i + 0.5, j];
  };
  const loops: [number, number][][] = [];
  for (const start of order) {
    if (seen[start]) continue;
    const loop: [number, number][] = [];
    let prev = -1, cur = start;
    while (!seen[cur]) {
      seen[cur] = 1; loop.push(pt(cur));
      const next = l0[cur]! - 1 !== prev ? l0[cur]! - 1 : l1[cur]! - 1;
      prev = cur; cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  for (const e of order) { l0[e] = 0; l1[e] = 0; seen[e] = 0; }
  return loops;
}
let MARCH_L0 = new Int32Array(0), MARCH_L1 = new Int32Array(0), MARCH_SEEN = new Uint8Array(0);

/** the ring with its straight runs thinned to their ends (a point in line with its neighbours goes) */
function thin(r: P[]): P[] {
  let pts = r;
  for (let pass = 0; pass < 2 && pts.length > 3; pass++) {
    const out: P[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length]!, b = pts[i]!, c = pts[(i + 1) % pts.length]!;
      if (Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > 1e-9) out.push(b);
    }
    pts = out.length >= 3 ? out : pts;
  }
  return pts;
}

/** one pass of Chaikin's corner cutting over a closed ring: each edge gives its points at a quarter and three quarters */
export function chaikin(r: readonly P[]): P[] {
  const out: P[] = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[i]!, b = r[(i + 1) % r.length]!;
    out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
  }
  return out;
}

const r1 = (v: number) => Math.round(v * 10) / 10 + 0; // 10 cm, as the map's files hold them (+ 0: no -0)

/** the polygons of each export kind, metres: traced, thinned, smoothed, the outer rings counter-clockwise and the holes clockwise (y north) */
export function tracePolys(areas: CourseArea[], f: Frame3p, stepM = OUTLINE_STEP_M, passes = CHAIKIN_PASSES): Map<ExportKind, JPoly[]> {
  const out = new Map<ExportKind, JPoly[]>();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const a of areas) for (let i = 0; i + 1 < a.pts.length; i += 2) { x0 = Math.min(x0, a.pts[i]!); x1 = Math.max(x1, a.pts[i]!); y0 = Math.min(y0, a.pts[i + 1]!); y1 = Math.max(y1, a.pts[i + 1]!); }
  if (!Number.isFinite(x0)) return out;
  const s = stepM / TILE_M, g = rasterise(areas, [x0, y0, x1, y1], s), minArea = 2 * stepM * stepM;
  // T438: each kind is marched over only the window of samples it covers (a green's few metres, not the whole course: the same loops, moved)
  const bx = KINDS.map(() => [Infinity, Infinity, -Infinity, -Infinity]);
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) { const v = g.cell[j * g.w + i]!; if (v) { const b = bx[v - 1]!; if (i < b[0]!) b[0] = i; if (j < b[1]!) b[1] = j; if (i > b[2]!) b[2] = i; if (j > b[3]!) b[3] = j; } }
  for (let k = 0; k < KINDS.length; k++) {
    const v = k + 1, [wi, wj, wi1, wj1] = bx[k]!; if (!Number.isFinite(wi!)) continue;
    const ww = wi1! - wi! + 1, wh = wj1! - wj! + 1, W = ww + 2, pad = new Uint8Array(W * (wh + 2)), cell = g.cell, gw = g.w;
    for (let j = 0; j < wh; j++) { const src = (j + wj!) * gw + wi!, dst = (j + 1) * W + 1; for (let i = 0; i < ww; i++) if (cell[src + i] === v) pad[dst + i] = 1; }
    const loops = marchGrid(ww, wh, pad);
    if (!loops.length) continue;
    // to metres (sample (i, j) sits at the middle of its cell), thinned and smoothed
    const rings = loops.map(L => {
      let r: P[] = thin(L.map(([i, j]) => toMetres(f, g.x0 + (i + wi! + 0.5) * s, g.y0 + (j + wj! + 0.5) * s)));
      for (let p = 0; p < passes; p++) r = chaikin(r);
      return r;
    }).filter(r => Math.abs(ringArea(r)) >= minArea);
    // nesting: a ring inside an even number of others is an outline, inside an odd number a hole in the smallest outline round it
    const depth = rings.map((r, a) => rings.reduce((n, q, b) => n + (b !== a && inRing(q, r[0]![0], r[0]![1]) ? 1 : 0), 0));
    const polys: { poly: JPoly; ring: P[]; area: number }[] = [];
    rings.forEach((r, a) => { if (depth[a]! % 2 === 0) polys.push({ poly: { outer: orient(r, true), inner: [] }, ring: r, area: Math.abs(ringArea(r)) }); });
    rings.forEach((r, a) => {
      if (depth[a]! % 2 === 0) return;
      const host = polys.filter(p => inRing(p.ring, r[0]![0], r[0]![1])).sort((p, q) => p.area - q.area)[0];
      host?.poly.inner.push(orient(r, false));
    });
    if (polys.length) out.set(KINDS[k]!, polys.map(p => p.poly));
  }
  return out;
}

/** the ring rounded to 10 cm and turned counter-clockwise (ccw) or clockwise */
function orient(r: readonly P[], ccw: boolean): JPt[] {
  const q = r.map(([x, y]) => [r1(x), r1(y)] as JPt);
  return (ringArea(q) > 0) === ccw ? q : q.reverse();
}

// ------------------------------------------------------------------------------------------------------------------------ heights
/** the ground sampled on a metres lattice of step m over the box (x0, y0 the north-west corner; terrarium.ts's frame) */
export function sampleHeights(heightAt: (x: number, y: number) => number, f: Frame3p, box: [number, number, number, number], step = HEIGHT_STEP_M): HeightGrid {
  const w = Math.floor((box[2] - box[0]) / step) + 1, h = Math.floor((box[3] - box[1]) / step) + 1, m = new Float32Array(w * h), x0 = box[0], y0 = box[3];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const t = toTiles(f, x0 + i * step, y0 - j * step); m[j * w + i] = heightAt(t.x, t.y); }
  return { x0, y0, step, w, h, m };
}

// ------------------------------------------------------------------------------------------------------------------------ the file
/** the painted course as the course file (see the top of this file). Async because the height packing deflates (the platform's CompressionStream) */
/** opts.deflate false (T438): the heights' text (height.d) is left empty, to be filled by terrarium.ts fillPack(file.height) later; the view's entry
 *  (courseEntry3p) reads the samples all the same */
export async function exportCourse3p(inp: Export3pInput, opts: { deflate?: boolean } = {}): Promise<CourseFile> {
  const f = frame3p(inp), features: Record<string, JFeature[]> = {};
  for (const [kind, polys] of tracePolys(inp.areas, f, inp.outlineStepM ?? OUTLINE_STEP_M)) features[kind] = polys.map(p => ({ polys: [p] }));

  const holes = inp.holes ?? deriveHoles(inp.areas, inp.tees, inp.pins, inp.aims), pt = (x: number, y: number): JPt => { const [X, Y] = toMetres(f, x, y); return [r1(X), r1(Y)]; };
  const lines: JFeature[] = [], pins: JFeature[] = [], marks: JFeature[] = [];
  for (const h of holes) {
    if (h.line.length < 2) continue;
    lines.push({ ref: h.n, par: h.par, length: h.lengthM, line: h.line.map(p => pt(p.x, p.y)) });
    const pin = h.line[h.line.length - 1]!;
    pins.push({ ref: h.n, pos: pt(pin.x, pin.y) });
  }
  // every tee set's marker (the hole line starts at the one furthest back; the file has one line a hole, so the others ride along as points)
  for (const t of inp.tees) marks.push({ ref: t.hole, pos: pt(t.x, t.y), tags: { tee: t.kind } });
  if (lines.length) features.hole = lines;
  if (pins.length) features.pin = pins;
  if (marks.length) features.tee_marker = marks;

  // the land: everything in the file, and the margin round it
  const b = tileBox(inp), margin = inp.marginM ?? EXPORT_MARGIN_M;
  const land: [number, number, number, number] = b
    ? [r1((b[0] - f.cx) * TILE_M - margin), r1(-(b[3] - f.cy) * TILE_M - margin), r1((b[2] - f.cx) * TILE_M + margin), r1(-(b[1] - f.cy) * TILE_M + margin)]
    : [-margin, -margin, margin, margin];
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(features)) counts[k] = v.length;
  const file: CourseFile = {
    meta: {
      id: inp.id ?? 'painted', course: { name: inp.name ?? 'Your course' }, credit: 'CapitalEmpire', attribution: 'Painted in CapitalEmpire; exported by src/game/golf/play/export3p.ts (T412)',
      sizeM: [r1(land[2] - land[0]), r1(land[3] - land[1])], counts,
    },
    boundary: { polys: [{ outer: [[land[0], land[1]], [land[2], land[1]], [land[2], land[3]], [land[0], land[3]]], inner: [] }] },
    features,
  };
  if (inp.heightAt) {
    const pack = await packGrid(sampleHeights(inp.heightAt, f, land, inp.heightStepM ?? HEIGHT_STEP_M), undefined, opts);
    const height: OsmHeight = { ...pack, src: 'course', label: 'Your course, 2 m', credit: '', z: 0, sigma: 0, fetched: inp.date ?? '' };
    const u = PACKED.get(pack); if (u) PACKED.set(height, u);   // (T438: the entry made from this file reads the samples, not the deflated text)
    file.height = height;
  }
  return file;
}

// ------------------------------------------------------------------------------------------------------------------------ T447: the ground, for the style
/** a water at least this big (m2, one hectare) and this broad (COAST_BREADTH_M: its area over its outline's length, half a strip's width; a stream that runs
 *  off the land is long and thin, a sea or a lake is not) that comes within COAST_EDGE_M of the course's edge is a shore: the course lies by the water */
export const COAST_M2 = 10_000, COAST_EDGE_M = 6, COAST_BREADTH_M = 15;
/** a ring's length, m */
const ringLen = (r: readonly JPt[]): number => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += Math.hypot(r[i]![0] - r[j]![0], r[i]![1] - r[j]![1]); return s; };
/** a polygon's area, m2 (its outer ring less its holes) */
const polyM2 = (p: JPoly): number => Math.abs(ringArea(p.outer)) - p.inner.reduce((a, r) => a + Math.abs(ringArea(r)), 0);
/** the box round a ring: west, south, east, north */
const ringBox = (r: readonly JPt[]): [number, number, number, number] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
};
/** the ground of a course file, for the view's style (look3p.ts biomeFor3p, courseTypeFor3p): the painted area (every surface kind), the shares of it that are sand
 *  (bunkers and waste areas) and water, whether a big broad water reaches the course's edge (a shore, not a stream), and `trees` (the planted trees, features3p.ts) a hectare */
export function groundOf3p(file: CourseFile, trees = 0): Ground3p {
  let painted = 0, sand = 0, water = 0, box: [number, number, number, number] | null = null;
  const waters: { m2: number; b: [number, number, number, number] }[] = [];
  for (const k of KINDS) {
    for (const p of (file.features[k] ?? []).flatMap(q => q.polys ?? [])) {
      const m2 = polyM2(p), b = ringBox(p.outer);
      painted += m2; if (k === 'bunker' || k === 'waste') sand += m2;
      if (k === 'water') { water += m2; if (m2 >= COAST_M2 && m2 / Math.max(1, ringLen(p.outer)) >= COAST_BREADTH_M) waters.push({ m2, b }); }
      box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b;
    }
  }
  const B = box, coast = !!B && waters.some(w => (w.b[0] - B[0] <= COAST_EDGE_M || B[2] - w.b[2] <= COAST_EDGE_M || w.b[1] - B[1] <= COAST_EDGE_M || B[3] - w.b[3] <= COAST_EDGE_M));
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return { paintedM2: Math.round(painted), sand: painted > 0 ? r3(sand / painted) : 0, water: painted > 0 ? r3(water / painted) : 0, coast, treesPerHa: painted > 0 ? r3(trees / (painted / 10_000)) : 0 };
}

// ------------------------------------------------------------------------------------------------------------------------ the adapter
/** what the adapter reads from the game (the engine has all three: courseAreaList(), golf and groundHeightAt) */
export interface Export3pGame {
  courseAreaList(): CourseArea[];
  golf: { tees: TeeMark[]; pins: Pin[]; aims: AimPoint[] } | null;
  groundHeightAt(x: number, y: number): number;
}
/** the exporter's input gathered from the game, as the played course (engine playCourse) gathers it: the painted areas, the placed markers and the ground the
 *  ball rolls on. Null without a golf course. The pins are the placed ones (the day's cups, golf/daypins.ts, are the play's, not the course's) */
export function export3pInputOf(game: Export3pGame, name?: string): Export3pInput | null {
  const g = game.golf;
  if (!g) return null;
  return { areas: game.courseAreaList(), tees: g.tees, pins: g.pins, aims: g.aims, heightAt: (x, y) => game.groundHeightAt(x, y), ...(name ? { name } : {}) };
}

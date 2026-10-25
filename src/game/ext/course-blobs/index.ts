/** Droplet outlines (plan P21 section 3.2, T073): the course grid's cells become soft outlines per surface, so cells of one
 * surface join their neighbours like water droplets. Per surface: the cells (optionally closed) feed a metaball field on a
 * quarter-tile lattice; marching squares with linear interpolation and the saddle rule finds the iso-line; every vertex is then
 * pulled onto the exact iso-line and curved stretches are subdivided (so a lone cell is round, not a diamond); an optional Taubin
 * relax calms staircase waves; the result is clipped per chunk into fill rings, edge polylines and collar rings.
 * Pure TS, no DOM. Units: tiles of 2 m for every input and output coordinate; cells of 1 m (0.5 tile) for radii and widths. */

import { CELL_T, SURF, type Grid } from '../course-grid';

// ---- the course grid (T072): origin (x0, y0) in tiles, w x h cells of CELL_T tiles, surf row-major (j * w + i, as cellAt) ----

/** tiles per course-grid cell */
const CELL = CELL_T;
/** the surface ids this module names (course-grid's SURF, in draw order) */
const { none: NONE, rough: ROUGH, fescue: FESCUE, water: WATER, fairway: FAIRWAY, tee: TEE, waste: WASTE, green: GREEN } = SURF;
/** the number of surface ids (0..8) */
const N_SURF = Object.keys(SURF).length;
/** a window cell outside the grid (never claimed, never a collar) */
const OUTSIDE = 255;

// ---- constants (section 3.2) ----

/** the field lattice's step in tiles (0.5 m: cell corners, edge midpoints and centres) */
export const LATTICE = 0.25;
/** the metaball kernel's radius in cells: each filled cell centre adds (1 - d²/R²)³ for d < R */
export const KERNEL_R = 1.25;
/** the iso level of the field. Plan P21 measured 0.62; 0.61 is half the full plane's mean field (1.22), so complementary
 * surfaces meet within 1 cm, and two cells touching at a corner join with a 0.21 m neck (0.14 m at 0.62) */
export const ISO_T = 0.61;
/** the margin in tiles around a chunk (or window) whose field and contours are computed, so both sides of a seam see the same
 * values and the same outline. Plan P21 said 3; the relax reaches 2 x (0.5 + 1.0) = 3 tiles along the outline, so 3.5 keeps
 * the open ends of the margin's contours out of reach of the seam (the cells read reach further, for the kernel and closing) */
export const CHUNK_MARGIN = 3.5;
/** how far in tiles fill rings reach past their chunk box, so neighbouring fills overlap by twice this and never show a seam */
export const FILL_GROW = 0.1;
/** the Douglas-Peucker tolerance in tiles applied after clipping */
export const SIMPLIFY_TOL = 0.04;
/** the relax stencil's half-length in tiles, per pass: each Taubin step moves a vertex toward the tent-weighted mean of the
 * outline within this arc length on either side (sampled at RELAX_TAPS points a side, so the smoothing does not depend on how
 * densely a curve is sampled). Pass 1 calms the short waves of steep staircases (1:1, 1:2), pass 2 the long waves of shallow
 * ones (1:3, 1:4). */
export const RELAX_H: readonly number[] = [0.5, 1.0];
/** Taubin's shrink and inflate factors (one relax pass is one step of each). Plan P21 suggested 0.5 / -0.53 with a 3-point
 * stencil; with a stencil long enough for shallow staircases that rings 13 cm bumps beside corners, so the stencil is
 * tent-weighted and the inflate milder (2 cm bumps; a 6 m blob loses 0.13 m of radius, rings up to SMALL_RING get it back) */
const LAMBDA = 0.7, MU = -0.3;
/** stencil samples per side for the tent weights */
const RELAX_TAPS = 3;
/** closed rings at most this wide (cells) get their area back after relaxing, so lone cells and small blobs do not shrink.
 * Below the 7-cell margin, so such a ring near a seam is whole in both chunks' windows and both restore it the same way. */
const SMALL_RING = 5;
/** midpoint subdivision: split a segment while the iso-line bends more than this off its chord (cells; half the simplify
 * tolerance), up to 3 levels */
const SUB_TOL = 0.04, SUB_DEPTH = 3;
/** Newton steps per projection, the largest single step (cells), and the field error that is close enough (about 0.1 mm) */
const PROJ_ITERS = 2, PROJ_STEP = 0.25, PROJ_EPS = 1e-4;

// ---- styles (sections 3.2 and 3.4) ----

/** an automatic collar: a band `width` cells wide around the surface, laid only over cells whose surface is in `over`
 * (first cut around fairways and tees, fringe around greens, a rough lip around bunkers, a bank around water) */
export interface CollarStyle { name: 'first-cut' | 'fringe' | 'lip' | 'bank'; width: number; over: readonly number[] }
/** how a surface's outline is shaped: `close` is the closing radius in cells (bigger fillets in inner corners and narrow
 * gaps), `relax` the number of Taubin passes (0..2; calmer staircase waves), `collar` the automatic collar if any */
export interface BlobStyle { close: number; relax: number; collar?: CollarStyle }

/** the default style per surface id (index 0, none, is never outlined): fairway, water and rough close by 2 cells, greens and
 * bunkers by 1, tees not at all but relax twice (a turned tee's cell staircase would stand as a saw of walls, T099; its corners round by about 1 m); fairway, water and greens relax twice; collars per the table in plan section 3.4 */
export const BLOB_STYLE: readonly BlobStyle[] = [
  /* none */ { close: 0, relax: 0 },
  /* rough */ { close: 2, relax: 1 },
  /* fescue */ { close: 2, relax: 1 },
  /* water */ { close: 2, relax: 2, collar: { name: 'bank', width: 1, over: [NONE, ROUGH, FESCUE] } },
  /* fairway */ { close: 2, relax: 2, collar: { name: 'first-cut', width: 2, over: [NONE, ROUGH, FESCUE] } },
  /* tee */ { close: 0, relax: 2, collar: { name: 'first-cut', width: 1, over: [NONE, ROUGH, FESCUE] } },
  /* bunker */ { close: 1, relax: 1, collar: { name: 'lip', width: 1, over: [NONE, ROUGH, FESCUE, FAIRWAY, TEE, WASTE, GREEN] } },
  /* waste */ { close: 1, relax: 1 },
  /* green */ { close: 1, relax: 2, collar: { name: 'fringe', width: 1, over: [NONE, ROUGH, FESCUE, FAIRWAY, TEE, WASTE] } },
];

// ---- outputs ----

/** an axis-aligned box in tiles */
export interface BlobBox { x0: number; y0: number; x1: number; y1: number }
/** one surface's outlines in a chunk, all flat [x0, y0, x1, y1, ...] arrays in tiles.
 * - `fill`: closed rings (first point not repeated) clipped to the chunk box grown by FILL_GROW; outer rings run
 *   counter-clockwise on the map's axes (positive shoelace area with x east, y south), holes clockwise; fill nonzero or even-odd.
 * - `edges`: open polylines on the true boundary only, cut exactly at the chunk box and never running along it; a ring wholly
 *   inside the box is one closed polyline whose last point repeats its first. The surface lies on the left of travel.
 * - `collar`: the collar band (fill rings: the dilated outline plus the surface's rings reversed, so the surface is cut out)
 *   and its outer edges, present when the surface has a collar and the band reaches the chunk */
export interface SurfaceOutline { surf: number; fill: number[][]; edges: number[][]; collar?: { fill: number[][]; edges: number[][] };
  /** with chunkOutlines(..., cover): the cells the outlines were contoured from (s: the surface's, closed; c: the surface's and its collar
   * band's, null without a collar), so a reader can tell which drawn layer covers a point (course-walls) */
  cover?: { s: CellCover; c: CellCover | null } }
/** a window of cells: cell (ci0 + i, cj0 + j) of the grid (global cell indices) is entry j * cw + i of occ (0/1) */
export interface CellCover { readonly occ: Uint8Array; readonly ci0: number; readonly cj0: number; readonly cw: number; readonly ch: number }

// ---- the kernel and the lattice taps ----

const KR2 = KERNEL_R * KERNEL_R;
/** the kernel (1 - d²/R²)³ for a squared distance in cells² (0 beyond R) */
function kern(d2: number): number { const q = d2 / KR2; if (q >= 1) return 0; const r = 1 - q; return r * r * r; }

/** the lattice nodes a filled cell (i, j) reaches, as offsets (da, db) from its centre node (2i + 1, 2j + 1), and their weights.
 * Cells splat in row-major order, so every node sums the same cells in the same order in every window (the same bits). */
const SPLAT_DA: number[] = [], SPLAT_DB: number[] = [], SPLAT_W: number[] = [];
for (let db = -2; db <= 2; db++) for (let da = -2; da <= 2; da++) {
  const d2 = (da * da + db * db) / 4;
  if (d2 < KR2) { SPLAT_DA.push(da); SPLAT_DB.push(db); SPLAT_W.push(kern(d2)); }
}

/** the cell offsets of a disc of radius r cells (dx² + dy² <= r²), cached */
const DISCS: Int8Array[] = [];
function disc(r: number): Int8Array {
  let d = DISCS[r];
  if (!d) {
    const o: number[] = [];
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) o.push(x, y);
    d = DISCS[r] = Int8Array.from(o);
  }
  return d;
}

// ---- occupancy windows ----

/** a window of cells (CellCover, writable) */
interface Occ { occ: Uint8Array; ci0: number; cj0: number; cw: number; ch: number }

/** the grid's surface ids over a cell window, OUTSIDE where the window leaves the grid */
function readSurf(g: Grid, ci0: number, cj0: number, cw: number, ch: number): Uint8Array {
  const out = new Uint8Array(cw * ch).fill(OUTSIDE);
  const i0 = Math.max(0, ci0), i1 = Math.min(g.w, ci0 + cw), j0 = Math.max(0, cj0), j1 = Math.min(g.h, cj0 + ch);
  for (let j = j0; j < j1; j++) {
    const src = j * g.w, dst = (j - cj0) * cw - ci0;
    for (let i = i0; i < i1; i++) out[dst + i] = g.surf[src + i];
  }
  return out;
}

/** cells set in src, grown by a disc of radius r (cells beyond the window count as empty) */
function dilate(src: Uint8Array, cw: number, ch: number, r: number): Uint8Array {
  if (r <= 0) return src.slice();
  const out = new Uint8Array(cw * ch), d = disc(r);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    if (!src[j * cw + i]) continue;
    for (let k = 0; k < d.length; k += 2) {
      const x = i + d[k], y = j + d[k + 1];
      if (x >= 0 && y >= 0 && x < cw && y < ch) out[y * cw + x] = 1;
    }
  }
  return out;
}

/** cells set in src whose whole disc of radius r is set (cells beyond the window count as empty) */
function erode(src: Uint8Array, cw: number, ch: number, r: number): Uint8Array {
  if (r <= 0) return src.slice();
  const out = new Uint8Array(cw * ch), d = disc(r);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    if (!src[j * cw + i]) continue;
    let all = 1;
    for (let k = 0; k < d.length; k += 2) {
      const x = i + d[k], y = j + d[k + 1];
      if (x < 0 || y < 0 || x >= cw || y >= ch || !src[y * cw + x]) { all = 0; break; }
    }
    out[j * cw + i] = all;
  }
  return out;
}

/** whether a closing of surface s may lay it over a cell of surface t: any surface drawn above it (it hides the extra), a lower
 * surface only when it is flat ground (the map grass, rough, fescue, fairway), never a cell off the grid. So a fillet never covers
 * a pond, and a green's never eats into a bunker, a tee or waste (T099: each of those has its own height and its walls stand on
 * its own outline) */
function claimable(s: number, t: number): boolean { return t !== OUTSIDE && t !== s && (t > s || (t <= FAIRWAY && t !== WATER)); }
/** the droplet field of a cover at global cell coordinates (u, v) (u = (x - grid.x0) / 0.5): the point lies inside the outline
 * contoured from it where the field is at least ISO_T (course-walls reads the drawn layers this way) */
export function coverField(c: CellCover, u: number, v: number): number { return fieldAt(c, u, v); }

/** ORs into out the 1-D closings of src along rows, columns and both diagonals: every run of at most 2r empty cells with set
 * cells at both ends is filled (a closing by a line segment of half-length r; runs touching the window edge stay open) */
function lineClose(src: Uint8Array, cw: number, ch: number, r: number, out: Uint8Array): void {
  const gap = 2 * r;
  /** walks one line of cells (start index, step, count) */
  const walk = (start: number, step: number, count: number) => {
    let last = -1;
    for (let k = 0; k < count; k++) {
      if (!src[start + k * step]) continue;
      if (last >= 0 && k - last > 1 && k - last - 1 <= gap) for (let q = last + 1; q < k; q++) out[start + q * step] = 1;
      last = k;
    }
  };
  for (let j = 0; j < ch; j++) walk(j * cw, 1, cw);
  for (let i = 0; i < cw; i++) walk(i, cw, ch);
  for (let s = -(ch - 1); s < cw; s++) { // diagonals i - j = s (step +1, +1) and anti-diagonals i + j = s' (step -1, +1)
    const i0 = Math.max(0, s), j0 = i0 - s;
    walk(j0 * cw + i0, cw + 1, Math.min(cw - i0, ch - j0));
  }
  for (let s = 0; s < cw + ch - 1; s++) {
    const i0 = Math.min(cw - 1, s), j0 = s - i0;
    walk(j0 * cw + i0, cw - 1, Math.min(i0 + 1, ch - j0));
  }
}

/** the closing used for droplet fillets: the union of the closing by a disc of radius r (rounds inner corners, fills gaps
 * between facing edges up to 2r cells) and the closings by line segments of half-length 1 (joins a dotted row of cells with
 * gaps up to 2; longer lines would bar across the gaps between separate strokes), an algebraic closing. Added cells must be
 * claimable by surface s. */
function closeCells(occ: Uint8Array, sw: Uint8Array, s: number, cw: number, ch: number, r: number): Uint8Array {
  const cl = erode(dilate(occ, cw, ch, r), cw, ch, r);
  lineClose(occ, cw, ch, 1, cl);
  for (let i = 0; i < cl.length; i++) cl[i] = occ[i] || (cl[i] && claimable(s, sw[i])) ? 1 : 0;
  return cl;
}

// ---- contours ----

/** a contour in global cell coordinates (u = (x - grid.x0) / 0.5): flat points, closed or open (open chains end on the window
 * border); the surface lies on the left of travel. `simple` marks a closed ring already simplified (it lies wholly inside the
 * chunk box, so its fill ring and its edge are the same ring). */
interface Chain { p: number[]; closed: boolean; simple?: boolean }

/** a lattice window in global node indices: node (a, b) sits at cell coordinates (a / 2, b / 2) */
interface Lat { a0: number; b0: number; na: number; nb: number }

let sNext = new Int32Array(0), sPrev = new Uint8Array(0), sVis = new Uint8Array(0), sF = new Float64Array(0), sIN = new Uint8Array(0);
/** module scratch for the chain walk, grown on demand; every touched entry is reset before returning */
function scratch(n: number): void {
  if (sNext.length >= n) return;
  sNext = new Int32Array(n).fill(-1); sPrev = new Uint8Array(n); sVis = new Uint8Array(n);
}

/** the field value and gradient (per cell) at global cell coordinates (u, v), written to FG */
const FG = new Float64Array(3);
function fieldGrad(o: Occ, u: number, v: number): void {
  const i0 = Math.max(Math.floor(u - 0.5 - KERNEL_R) + 1, o.ci0), i1 = Math.min(Math.ceil(u - 0.5 + KERNEL_R) - 1, o.ci0 + o.cw - 1);
  const j0 = Math.max(Math.floor(v - 0.5 - KERNEL_R) + 1, o.cj0), j1 = Math.min(Math.ceil(v - 0.5 + KERNEL_R) - 1, o.cj0 + o.ch - 1);
  let f = 0, gu = 0, gv = 0;
  for (let j = j0; j <= j1; j++) {
    const dy = v - (j + 0.5), row = (j - o.cj0) * o.cw - o.ci0;
    for (let i = i0; i <= i1; i++) {
      if (!o.occ[row + i]) continue;
      const dx = u - (i + 0.5), q = (dx * dx + dy * dy) / KR2;
      if (q >= 1) continue;
      const r = 1 - q, r2 = r * r, c = (-6 * r2) / KR2;
      f += r2 * r; gu += c * dx; gv += c * dy;
    }
  }
  FG[0] = f; FG[1] = gu; FG[2] = gv;
}

/** the field value at global cell coordinates (u, v) */
function fieldAt(o: Occ, u: number, v: number): number { fieldGrad(o, u, v); return FG[0]; }

/** pulls (u, v) onto the iso-line by Newton steps along the gradient; the point and the last gradient go to PJ */
const PJ = new Float64Array(4);
function project(o: Occ, u: number, v: number): void {
  let gu = 0, gv = 0;
  for (let it = 0; it < PROJ_ITERS; it++) {
    fieldGrad(o, u, v);
    const e = FG[0] - ISO_T, g2 = FG[1] * FG[1] + FG[2] * FG[2];
    gu = FG[1]; gv = FG[2];
    if (Math.abs(e) < PROJ_EPS || g2 < 1e-8) break;
    let du = (-e * gu) / g2, dv = (-e * gv) / g2;
    const m = Math.sqrt(du * du + dv * dv);
    if (m > PROJ_STEP) { du *= PROJ_STEP / m; dv *= PROJ_STEP / m; }
    u += du; v += dv;
  }
  PJ[0] = u; PJ[1] = v; PJ[2] = gu; PJ[3] = gv;
}

/** whether the iso-line between two projected points (with their gradients) bends more than SUB_TOL off the chord: the turn
 * between the end normals times the chord, over 8 (a circular arc's sagitta) */
function bends(au: number, av: number, ag: number, ah: number, bu: number, bv: number, bg: number, bh: number): boolean {
  const du = bu - au, dv = bv - av, L2 = du * du + dv * dv, n2 = (ag * ag + ah * ah) * (bg * bg + bh * bh);
  if (n2 === 0) return L2 > 4 * SUB_TOL * SUB_TOL;
  // turn² ~ 2 (1 - cos turn), so the test is 2 (1 - cos) L² > (8 SUB_TOL)², with no trig
  const c = (ag * bg + ah * bh) / Math.sqrt(n2);
  return 2 * (1 - c) * L2 > 64 * SUB_TOL * SUB_TOL;
}

/** appends to out the projected points strictly between a and b (point, gradient), splitting while the curve bends away */
function subdivide(o: Occ, au: number, av: number, ag: number, ah: number, bu: number, bv: number, bg: number, bh: number, depth: number, out: number[]): void {
  if (!bends(au, av, ag, ah, bu, bv, bg, bh)) return;
  project(o, (au + bu) / 2, (av + bv) / 2);
  const pu = PJ[0], pv = PJ[1], pg = PJ[2], ph = PJ[3];
  if (depth > 1) subdivide(o, au, av, ag, ah, pu, pv, pg, ph, depth - 1, out);
  out.push(pu, pv);
  if (depth > 1) subdivide(o, pu, pv, pg, ph, bu, bv, bg, bh, depth - 1, out);
}

/** the marching-squares segments per case (bit k = corner k inside; corners c0 (a, b), c1 (a+1, b), c2 (a+1, b+1), c3 (a, b+1);
 * edge k runs from corner k to corner k+1): the edge a segment leaves from and the edge it ends on, the surface on its left.
 * Saddles (5, 10) are decided at run time. */
const SEG_FROM = new Int8Array(16).fill(-1), SEG_TO = new Int8Array(16).fill(-1);
for (let c = 1; c < 15; c++) {
  if (c === 5 || c === 10) continue;
  for (let k = 0; k < 4; k++) {
    const a = (c >> k) & 1, b = (c >> ((k + 1) & 3)) & 1;
    if (a && !b) SEG_FROM[c] = k;
    if (!a && b) SEG_TO[c] = k;
  }
}

/** the contours of an occupancy window over a lattice window: marching squares at ISO_T (linear interpolation, saddles by the
 * mean of the four corners), chained, projected onto the exact iso-line and subdivided. `keep` drops closed rings whose box
 * misses it (cells), to save work on rings that cannot reach the output. */
function contour(o: Occ, L: Lat, keep: BlobBox | null): Chain[] {
  const { a0, b0, na, nb } = L, n = na * nb;
  if (sF.length < n) { sF = new Float64Array(n); sIN = new Uint8Array(n); }
  const F = sF, IN = sIN, K = SPLAT_W.length;
  F.fill(0, 0, n);
  // splat the cells that reach the window (centre node within 2 of it), row-major
  const ci0 = Math.max(o.ci0, (a0 - 3) >> 1), ci1 = Math.min(o.ci0 + o.cw - 1, (a0 + na + 1) >> 1);
  const cj0 = Math.max(o.cj0, (b0 - 3) >> 1), cj1 = Math.min(o.cj0 + o.ch - 1, (b0 + nb + 1) >> 1);
  for (let cj = cj0; cj <= cj1; cj++) {
    const row = (cj - o.cj0) * o.cw - o.ci0, bc = 2 * cj + 1 - b0;
    for (let ci = ci0; ci <= ci1; ci++) {
      if (!o.occ[row + ci]) continue;
      const ac = 2 * ci + 1 - a0;
      if (ac >= 2 && ac < na - 2 && bc >= 2 && bc < nb - 2) {
        const base = bc * na + ac;
        for (let k = 0; k < K; k++) F[base + SPLAT_DB[k] * na + SPLAT_DA[k]] += SPLAT_W[k];
      } else {
        for (let k = 0; k < K; k++) {
          const a = ac + SPLAT_DA[k], b = bc + SPLAT_DB[k];
          if (a >= 0 && b >= 0 && a < na && b < nb) F[b * na + a] += SPLAT_W[k];
        }
      }
    }
  }
  for (let i = 0; i < n; i++) IN[i] = F[i] >= ISO_T ? 1 : 0;
  // edges: horizontal H(a, b) = b * na + a joins nodes (a, b) and (a+1, b); vertical V(a, b) = n + b * na + a joins (a, b) and (a, b+1)
  scratch(2 * n);
  const froms: number[] = [], touched: number[] = [];
  const link = (from: number, to: number) => { sNext[from] = to; sPrev[to] = 1; froms.push(from); touched.push(to); };
  for (let b = 0; b < nb - 1; b++) for (let a = 0; a < na - 1; a++) {
    const i0 = b * na + a, c = IN[i0] | (IN[i0 + 1] << 1) | (IN[i0 + na + 1] << 2) | (IN[i0 + na] << 3);
    if (c === 0 || c === 15) continue;
    const e0 = i0, e1 = n + i0 + 1, e2 = i0 + na, e3 = n + i0;
    if (c === 5 || c === 10) {
      const join = (F[i0] + F[i0 + 1] + F[i0 + na + 1] + F[i0 + na]) / 4 >= ISO_T;
      if (c === 5) { if (join) { link(e0, e1); link(e2, e3); } else { link(e0, e3); link(e2, e1); } }
      else if (join) { link(e1, e2); link(e3, e0); } else { link(e1, e0); link(e3, e2); }
      continue;
    }
    const f = SEG_FROM[c], t = SEG_TO[c];
    link(f === 0 ? e0 : f === 1 ? e1 : f === 2 ? e2 : e3, t === 0 ? e0 : t === 1 ? e1 : t === 2 ? e2 : e3);
  }
  const chains: Chain[] = [];
  /** the crossing on edge id e, in global cell coordinates */
  const vtx = (e: number, out: number[]) => {
    if (e < n) {
      const b = (e / na) | 0, a = e - b * na, f0 = F[e], f1 = F[e + 1], t = (ISO_T - f0) / (f1 - f0);
      out.push((a0 + a + t) * 0.5, (b0 + b) * 0.5);
    } else {
      const k = e - n, b = (k / na) | 0, a = k - b * na, f0 = F[k], f1 = F[k + na], t = (ISO_T - f0) / (f1 - f0);
      out.push((a0 + a) * 0.5, (b0 + b + t) * 0.5);
    }
  };
  const trace = (start: number, closed: boolean) => {
    const raw: number[] = [];
    let e = start;
    for (;;) {
      sVis[e] = 1; vtx(e, raw);
      const nx = sNext[e];
      if (nx < 0 || nx === start) break;
      e = nx;
    }
    if (closed && keep) {
      let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
      for (let i = 0; i < raw.length; i += 2) { const u = raw[i], v = raw[i + 1]; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
      if (u1 < keep.x0 || u0 > keep.x1 || v1 < keep.y0 || v0 > keep.y1) return;
    }
    chains.push({ p: refine(o, raw, closed), closed });
  };
  for (const e of froms) if (!sPrev[e] && !sVis[e]) trace(e, false);
  for (const e of froms) if (!sVis[e]) trace(e, true);
  for (const e of froms) { sNext[e] = -1; sPrev[e] = 0; sVis[e] = 0; }
  for (const e of touched) { sPrev[e] = 0; sVis[e] = 0; }
  return chains;
}

/** projects every marching-squares vertex onto the exact iso-line and subdivides bending segments */
let sP = new Float64Array(1024);
function refine(o: Occ, raw: number[], closed: boolean): number[] {
  const m = raw.length / 2;
  if (sP.length < 2 * raw.length) sP = new Float64Array(4 * raw.length);
  const P = sP;
  for (let i = 0; i < m; i++) { project(o, raw[2 * i], raw[2 * i + 1]); P[4 * i] = PJ[0]; P[4 * i + 1] = PJ[1]; P[4 * i + 2] = PJ[2]; P[4 * i + 3] = PJ[3]; }
  const out: number[] = [];
  const segs = closed ? m : m - 1;
  for (let i = 0; i < m; i++) {
    out.push(P[4 * i], P[4 * i + 1]);
    if (i < segs) {
      const j = (i + 1) % m;
      subdivide(o, P[4 * i], P[4 * i + 1], P[4 * i + 2], P[4 * i + 3], P[4 * j], P[4 * j + 1], P[4 * j + 2], P[4 * j + 3], SUB_DEPTH, out);
    }
  }
  return out;
}

// ---- relax ----

/** the shoelace area (signed) and centroid of a closed flat ring */
function ringArea(p: ArrayLike<number>): number {
  let a = 0;
  const m = p.length / 2;
  for (let i = 0; i < m; i++) { const j = (i + 1) % m; a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1]; }
  return a / 2;
}

/** `passes` Taubin passes (a LAMBDA step then a MU step), pass p with the tent stencil RELAX_H[p] (shortened to a quarter of a
 * small ring's perimeter); open chains keep their ends; closed rings at most SMALL_RING cells wide get their area back (scaled
 * about their centroid). Every vertex reads only the outline within the stencil, so both sides of a seam relax alike. */
function relaxChain(c: Chain, passes: number): void {
  const m = c.p.length / 2;
  if (passes <= 0 || m < 3) return;
  let A = Float64Array.from(c.p), B = new Float64Array(A.length);
  const segN = c.closed ? m : m - 1, len = new Float64Array(m);
  const a0 = c.closed ? ringArea(A) : 0;
  for (let pass = 0; pass < passes; pass++) for (let s = 0; s < 2; s++) {
    const k = s === 0 ? LAMBDA : MU;
    let per = 0;
    for (let i = 0; i < segN; i++) {
      const j = i + 1 === m ? 0 : i + 1, du = A[2 * j] - A[2 * i], dv = A[2 * j + 1] - A[2 * i + 1], d = Math.sqrt(du * du + dv * dv);
      len[i] = d; per += d;
    }
    const h = RELAX_H[Math.min(pass, RELAX_H.length - 1)] / CELL, hh = c.closed ? Math.min(h, per / 4) : h;
    for (let i = 0; i < m; i++) {
      if (!c.closed && (i === 0 || i === m - 1)) { B[2 * i] = A[2 * i]; B[2 * i + 1] = A[2 * i + 1]; continue; }
      // the tent-weighted mean of the points at hh * t / N (t = 1..N, weight N + 1 - t) back and forward along the outline
      const N = RELAX_TAPS;
      let su = 0, sv = 0, sw = 0;
      for (let dir = -1; dir <= 1; dir += 2) {
        let acc = 0, j = i, t = 1;
        for (let guard = 0; guard < m && t <= N; guard++) {
          const end = !c.closed && (dir < 0 ? j === 0 : j === m - 1);
          if (end) { for (; t <= N; t++) { const w = N + 1 - t; su += w * A[2 * j]; sv += w * A[2 * j + 1]; sw += w; } break; }
          const jn = dir < 0 ? (j === 0 ? m - 1 : j - 1) : (j === m - 1 ? 0 : j + 1), d = dir < 0 ? len[jn] : len[j];
          while (t <= N && acc + d >= (hh * t) / N) {
            const f = d > 0 ? ((hh * t) / N - acc) / d : 0, w = N + 1 - t;
            su += w * (A[2 * j] + f * (A[2 * jn] - A[2 * j])); sv += w * (A[2 * j + 1] + f * (A[2 * jn + 1] - A[2 * j + 1])); sw += w; t++;
          }
          acc += d; j = jn;
        }
      }
      B[2 * i] = A[2 * i] + k * (su / sw - A[2 * i]);
      B[2 * i + 1] = A[2 * i + 1] + k * (sv / sw - A[2 * i + 1]);
    }
    const t = A; A = B; B = t;
  }
  if (c.closed) {
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity, cu = 0, cv = 0;
    for (let i = 0; i < m; i++) { const u = A[2 * i], v = A[2 * i + 1]; cu += u; cv += v; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
    if (u1 - u0 <= SMALL_RING && v1 - v0 <= SMALL_RING) {
      const a1 = ringArea(A);
      if (a1 !== 0 && a0 / a1 > 0) {
        const f = Math.sqrt(a0 / a1);
        cu /= m; cv /= m;
        for (let i = 0; i < m; i++) { A[2 * i] = cu + (A[2 * i] - cu) * f; A[2 * i + 1] = cv + (A[2 * i + 1] - cv) * f; }
      }
    }
  }
  c.p = Array.from(A);
}

// ---- clipping ----

/** a stretch of contour inside a box: from where it enters (perimeter position sIn) to where it leaves (sOut). Perimeter
 * positions run 0..4 counter-clockwise on the map's axes: side 0 is y = y0 (x rising), 1 is x = x1, 2 is y = y1, 3 is x = x0 */
interface Piece { p: number[]; sIn: number; sOut: number }

/** the perimeter position of a point on side k of box b */
function perim(b: BlobBox, k: number, u: number, v: number): number {
  if (k === 0) return (u - b.x0) / (b.x1 - b.x0);
  if (k === 1) return 1 + (v - b.y0) / (b.y1 - b.y0);
  if (k === 2) return 2 + (b.x1 - u) / (b.x1 - b.x0);
  return 3 + (b.y1 - v) / (b.y1 - b.y0);
}

/** appends the point at t on segment (pu, pv) + t (du, dv), placed exactly on side k of box b */
function cutAt(b: BlobBox, pu: number, pv: number, du: number, dv: number, t: number, k: number, out: number[]): void {
  if (k === 3) out.push(b.x0, pv + t * dv);
  else if (k === 1) out.push(b.x1, pv + t * dv);
  else if (k === 0) out.push(pu + t * du, b.y0);
  else out.push(pu + t * du, b.y1);
}

/** keeps a finished stretch (leaving on side k) unless it has no length: a contour that only touches the box from outside
 * would otherwise join the box walk in the wrong place. Its reach from its first point is measured over all of it (T099: an
 * entry cut a hair from the next point, a contour vertex sitting on the box side, used to drop the whole stretch) */
function addPiece(pieces: Piece[], b: BlobBox, p: number[], sIn: number, k: number): void {
  let len = 0;
  for (let i = 2; i < p.length && len <= 1e-12; i += 2) len = Math.max(len, Math.abs(p[i] - p[0]) + Math.abs(p[i + 1] - p[1]));
  if (len > 1e-12) pieces.push({ p, sIn, sOut: perim(b, k, p[p.length - 2], p[p.length - 1]) });
}

/** cuts chains at box b: the stretches inside (each from an entry to an exit on the box) and the closed rings wholly inside.
 * Cut points sit exactly on the box side, computed the same way from either side of a seam. */
function clip(chains: readonly Chain[], b: BlobBox): { pieces: Piece[]; inner: Chain[] } {
  const pieces: Piece[] = [], inner: Chain[] = [];
  const isIn = (u: number, v: number) => u >= b.x0 && u <= b.x1 && v >= b.y0 && v <= b.y1;
  for (const c of chains) {
    const p = c.p, m = p.length / 2;
    if (m < 2) continue;
    let start = 0;
    if (c.closed) {
      start = -1;
      for (let i = 0; i < m; i++) if (!isIn(p[2 * i], p[2 * i + 1])) { start = i; break; }
      if (start < 0) { inner.push(c); continue; }
    }
    const segs = c.closed ? m : m - 1;
    let cur: number[] | null = null, sIn = 0;
    for (let s = 0; s < segs; s++) {
      const i = (start + s) % m, j = i + 1 === m ? 0 : i + 1;
      const pu = p[2 * i], pv = p[2 * i + 1], qu = p[2 * j], qv = p[2 * j + 1];
      const pIn = cur !== null, qIn = isIn(qu, qv);
      if (pIn && qIn) { cur!.push(qu, qv); continue; }
      if (!pIn && !qIn && (Math.max(pu, qu) < b.x0 || Math.min(pu, qu) > b.x1 || Math.max(pv, qv) < b.y0 || Math.min(pv, qv) > b.y1)) continue;
      // Liang-Barsky against x >= x0 (side 3), x <= x1 (side 1), y >= y0 (side 0), y <= y1 (side 2)
      const du = qu - pu, dv = qv - pv;
      let t0 = 0, t1 = 1, k0 = -1, k1 = -1, ok = true;
      for (let k = 0; k < 4 && ok; k++) {
        const P = k === 0 ? -du : k === 1 ? du : k === 2 ? -dv : dv;
        const Q = k === 0 ? pu - b.x0 : k === 1 ? b.x1 - pu : k === 2 ? pv - b.y0 : b.y1 - pv;
        const side = k === 0 ? 3 : k === 1 ? 1 : k === 2 ? 0 : 2;
        if (P === 0) { if (Q < 0) ok = false; continue; }
        const r = Q / P;
        if (P < 0) { if (r > t1) ok = false; else if (r > t0) { t0 = r; k0 = side; } }
        else if (r < t0) ok = false; else if (r < t1) { t1 = r; k1 = side; }
      }
      if (!cur) {
        // an entry; when q lies exactly on the box (t0 = t1 = 1) it still enters
        if (!ok || k0 < 0 || (qIn ? t1 < t0 : t1 <= t0)) continue;
        cur = [];
        cutAt(b, pu, pv, du, dv, t0, k0, cur); sIn = perim(b, k0, cur[0], cur[1]);
        if (k1 >= 0) { cutAt(b, pu, pv, du, dv, t1, k1, cur); addPiece(pieces, b, cur, sIn, k1); cur = null; }
        else cur.push(qu, qv);
      } else if (ok && k1 >= 0) {
        cutAt(b, pu, pv, du, dv, t1, k1, cur); addPiece(pieces, b, cur, sIn, k1); cur = null;
      } else cur.push(qu, qv);
    }
    // an open chain ends on the window border, outside the box, so `cur` is null here
  }
  return { pieces, inner };
}

/** fill rings from clipped stretches, joined by walking the box counter-clockwise from each exit to the next entry; with no
 * stretch, the whole box when `boxInside` (rings wholly inside the box are the caller's) */
function assemble(pieces: readonly Piece[], b: BlobBox, boxInside: boolean): number[][] {
  const rings: number[][] = [];
  const corners = [b.x0, b.y0, b.x1, b.y0, b.x1, b.y1, b.x0, b.y1];
  if (!pieces.length && boxInside) rings.push(corners.slice());
  const used = new Uint8Array(pieces.length);
  for (let s0 = 0; s0 < pieces.length; s0++) {
    if (used[s0]) continue;
    const ring: number[] = [];
    let cur = s0;
    for (let guard = 0; guard <= pieces.length; guard++) {
      used[cur] = 1;
      const pc = pieces[cur];
      for (let i = 0; i < pc.p.length; i++) ring.push(pc.p[i]);
      let best = -1, bestD = Infinity;
      for (let k = 0; k < pieces.length; k++) {
        if (used[k] && k !== s0) continue;
        let d = pieces[k].sIn - pc.sOut;
        if (d < 0) d += 4;
        if (d < bestD) { bestD = d; best = k; }
      }
      if (best < 0) break;
      for (let c = Math.floor(pc.sOut) + 1; c < pc.sOut + bestD; c++) { const q = c & 3; ring.push(corners[2 * q], corners[2 * q + 1]); }
      if (best === s0) break;
      cur = best;
    }
    rings.push(ring);
  }
  return rings;
}

// ---- simplify ----

/** Douglas-Peucker on a flat polyline (keeps both ends) at tolerance tol */
let dpKeep = new Uint8Array(256), dpStack = new Int32Array(512);
function dpOpen(p: number[], tol: number): number[] {
  const m = p.length / 2;
  if (m <= 2) return p.slice();
  if (dpKeep.length < m) { dpKeep = new Uint8Array(2 * m); dpStack = new Int32Array(4 * m); }
  const keep = dpKeep, stack = dpStack, t2 = tol * tol;
  keep.fill(0, 0, m);
  keep[0] = keep[m - 1] = 1;
  let sp = 0;
  stack[sp++] = 0; stack[sp++] = m - 1;
  while (sp) {
    const j = stack[--sp], i = stack[--sp];
    const ax = p[2 * i], ay = p[2 * i + 1], bx = p[2 * j], by = p[2 * j + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let worst = -1, wd = t2;
    for (let k = i + 1; k < j; k++) {
      let ex = p[2 * k] - ax, ey = p[2 * k + 1] - ay;
      if (l2 > 0) { const t = Math.max(0, Math.min(1, (ex * dx + ey * dy) / l2)); ex -= t * dx; ey -= t * dy; }
      const d = ex * ex + ey * ey;
      if (d > wd) { wd = d; worst = k; }
    }
    if (worst >= 0) { keep[worst] = 1; stack[sp++] = i; stack[sp++] = worst; stack[sp++] = worst; stack[sp++] = j; }
  }
  const out: number[] = [];
  for (let k = 0; k < m; k++) if (keep[k]) out.push(p[2 * k], p[2 * k + 1]);
  return out;
}

/** Douglas-Peucker on a closed flat ring: split at its first point and the point farthest from it */
function dpRing(p: number[], tol: number): number[] {
  const m = p.length / 2;
  if (m <= 4) return p.slice();
  let far = 0, fd = -1;
  for (let k = 1; k < m; k++) { const d = (p[2 * k] - p[0]) ** 2 + (p[2 * k + 1] - p[1]) ** 2; if (d > fd) { fd = d; far = k; } }
  const a = dpOpen(p.slice(0, 2 * far + 2), tol), b = dpOpen(p.slice(2 * far).concat(p[0], p[1]), tol);
  return a.concat(b.slice(2, b.length - 2));
}

// ---- the surface pipeline ----

/** cell coordinates -> tiles, in place copy */
function toTiles(g: Grid, p: number[]): number[] {
  const out = new Array<number>(p.length);
  for (let i = 0; i < p.length; i += 2) { out[i] = g.x0 + p[i] * CELL; out[i + 1] = g.y0 + p[i + 1] * CELL; }
  return out;
}

/** a tile box in global cell coordinates */
function cellBox(g: Grid, b: BlobBox): BlobBox {
  return { x0: (b.x0 - g.x0) / CELL, y0: (b.y0 - g.y0) / CELL, x1: (b.x1 - g.x0) / CELL, y1: (b.y1 - g.y0) / CELL };
}

/** a surface's contours over box (tiles) plus a margin: its own (closed per style) and, when asked, its collar's */
function surfaceChains(g: Grid, s: number, st: BlobStyle, box: BlobBox, withCollar: boolean) {
  const a0 = Math.floor((box.x0 - CHUNK_MARGIN - g.x0) / LATTICE), a1 = Math.ceil((box.x1 + CHUNK_MARGIN - g.x0) / LATTICE);
  const b0 = Math.floor((box.y0 - CHUNK_MARGIN - g.y0) / LATTICE), b1 = Math.ceil((box.y1 + CHUNK_MARGIN - g.y0) / LATTICE);
  const L: Lat = { a0, b0, na: a1 - a0 + 1, nb: b1 - b0 + 1 };
  const col = withCollar ? st.collar : undefined;
  const close = Math.max(0, Math.round(st.close)), cw0 = col ? Math.max(0, Math.round(col.width)) : 0;
  const pad = 3 + 2 * close + cw0;
  const ci0 = (a0 >> 1) - pad, cj0 = (b0 >> 1) - pad, cw = (a1 >> 1) + pad + 1 - ci0, ch = (b1 >> 1) + pad + 1 - cj0;
  const sw = readSurf(g, ci0, cj0, cw, ch), n = cw * ch;
  let occ: Uint8Array = new Uint8Array(n);
  for (let i = 0; i < n; i++) occ[i] = sw[i] === s ? 1 : 0;
  if (close > 0) occ = closeCells(occ, sw, s, cw, ch, close);
  const keep = cellBox(g, { x0: box.x0 - 1, y0: box.y0 - 1, x1: box.x1 + 1, y1: box.y1 + 1 });
  const oS: Occ = { occ, ci0, cj0, cw, ch };
  const chains = contour(oS, L, keep);
  for (const c of chains) relaxChain(c, st.relax);
  let oC: Occ | null = null, chainsC: Chain[] = [];
  if (col) {
    const over = new Uint8Array(256);
    for (const t of col.over) over[t] = 1;
    const dl = dilate(occ, cw, ch, cw0), cc = new Uint8Array(n);
    for (let i = 0; i < n; i++) cc[i] = occ[i] || (dl[i] && over[sw[i]]) ? 1 : 0;
    oC = { occ: cc, ci0, cj0, cw, ch };
    chainsC = contour(oC, L, keep);
    for (const c of chainsC) relaxChain(c, st.relax);
  }
  return { oS, chains, oC, chainsC };
}

/** reverses a flat ring's point order */
function reverseRing(p: number[]): number[] {
  const out = new Array<number>(p.length);
  for (let i = 0, m = p.length / 2; i < m; i++) { out[2 * i] = p[2 * (m - 1 - i)]; out[2 * i + 1] = p[2 * (m - 1 - i) + 1]; }
  return out;
}

/** fill rings over box (cells) from chains, simplified, in tiles */
function fillRings(g: Grid, o: Occ, chains: readonly Chain[], b: BlobBox): number[][] {
  const tol = SIMPLIFY_TOL / CELL, { pieces, inner } = clip(chains, b), out: number[][] = [];
  for (const r of assemble(pieces, b, fieldAt(o, b.x0, b.y0) >= ISO_T)) { const d = dpRing(r, tol); if (d.length >= 6) out.push(toTiles(g, d)); }
  for (const c of inner) { const d = c.simple ? c.p : dpRing(c.p, tol); if (d.length >= 6) out.push(toTiles(g, d)); }
  return out;
}

/** edge polylines over box (cells) from chains, simplified, in tiles; whole rings close on their first point */
function edgeLines(g: Grid, chains: readonly Chain[], b: BlobBox): number[][] {
  const tol = SIMPLIFY_TOL / CELL, { pieces, inner } = clip(chains, b), out: number[][] = [];
  for (const pc of pieces) {
    if (pc.p.length < 4) continue;
    let d = dpOpen(pc.p, tol);
    if (d.length === 4 && Math.floor(pc.sIn) === Math.floor(pc.sOut) && Math.abs(pc.sIn - pc.sOut) < 1) {
      // a shallow bump in and out of one side would simplify onto the side: keep its farthest point, or drop it if it has none
      let far = -1, fd = 0;
      for (let k = 2; k < pc.p.length - 2; k += 2) {
        const e = Math.abs(pc.sIn % 2 < 1 ? pc.p[k + 1] - pc.p[1] : pc.p[k] - pc.p[0]);
        if (e > fd) { fd = e; far = k; }
      }
      if (far < 0) continue;
      d = [d[0], d[1], pc.p[far], pc.p[far + 1], d[2], d[3]];
    }
    out.push(toTiles(g, d));
  }
  for (const c of inner) { const d = c.simple ? c.p : dpRing(c.p, tol); if (d.length >= 6) out.push(toTiles(g, d.concat(d[0], d[1]))); }
  return out;
}

/** simplifies, once, the closed rings wholly inside box (cells): their fill ring and their edge are the same ring */
function presimplify(chains: readonly Chain[], b: BlobBox): void {
  const tol = SIMPLIFY_TOL / CELL;
  for (const c of chains) {
    if (!c.closed) continue;
    const p = c.p;
    let inside = true;
    for (let i = 0; i < p.length && inside; i += 2) inside = p[i] >= b.x0 && p[i] <= b.x1 && p[i + 1] >= b.y0 && p[i + 1] <= b.y1;
    if (inside) { c.p = dpRing(p, tol); c.simple = true; }
  }
}

/** the surfaces whose cells lie within `pad` cells of box (tiles), in draw order */
function surfacesNear(g: Grid, box: BlobBox, pad: number): number[] {
  const i0 = Math.max(0, Math.floor((box.x0 - g.x0) / CELL) - pad), i1 = Math.min(g.w - 1, Math.ceil((box.x1 - g.x0) / CELL) + pad);
  const j0 = Math.max(0, Math.floor((box.y0 - g.y0) / CELL) - pad), j1 = Math.min(g.h - 1, Math.ceil((box.y1 - g.y0) / CELL) + pad);
  const seen = new Uint8Array(256);
  for (let j = j0; j <= j1; j++) { const row = j * g.w; for (let i = i0; i <= i1; i++) seen[g.surf[row + i]] = 1; }
  const out: number[] = [];
  for (let s = 1; s < N_SURF; s++) if (seen[s]) out.push(s);
  return out;
}

// ---- the API ----

/** the outlines of chunk (cx, cy) of `size` tiles (box cx*size .. (cx+1)*size on each axis, in world tiles): per surface present
 * (draw order, none excluded), fill rings clipped to the box grown by FILL_GROW, edge polylines cut exactly at the box, and the
 * collar when the style has one. The field reads the global grid with a CHUNK_MARGIN-tile margin and the relax runs before the
 * cut, so neighbouring chunks' edges meet exactly. `styles` overrides BLOB_STYLE (indexed by surface id). cover: each outline also
 * carries the cells it was contoured from (SurfaceOutline.cover). */
export function chunkOutlines(g: Grid, cx: number, cy: number, size = 64, styles: readonly BlobStyle[] = BLOB_STYLE, cover = false): SurfaceOutline[] {
  const box: BlobBox = { x0: cx * size, y0: cy * size, x1: (cx + 1) * size, y1: (cy + 1) * size };
  let maxCollar = 0;
  for (const st of styles) if (st?.collar) maxCollar = Math.max(maxCollar, st.collar.width);
  const out: SurfaceOutline[] = [];
  const cb = cellBox(g, box), gb = cellBox(g, { x0: box.x0 - FILL_GROW, y0: box.y0 - FILL_GROW, x1: box.x1 + FILL_GROW, y1: box.y1 + FILL_GROW });
  for (const s of surfacesNear(g, box, 3 + maxCollar)) {
    const st = styles[s] ?? { close: 0, relax: 0 };
    const sc = surfaceChains(g, s, st, box, true);
    presimplify(sc.chains, cb);
    const fill = fillRings(g, sc.oS, sc.chains, gb), edges = edgeLines(g, sc.chains, cb);
    const o: SurfaceOutline = { surf: s, fill, edges };
    if (sc.oC) {
      presimplify(sc.chainsC, cb);
      const cfill = fillRings(g, sc.oC, sc.chainsC, gb);
      if (cfill.length) o.collar = { fill: cfill.concat(fill.map(reverseRing)), edges: edgeLines(g, sc.chainsC, cb) };
    }
    if (cover) o.cover = { s: sc.oS, c: sc.oC };
    if (fill.length || o.collar) out.push(o);
  }
  return out;
}

/** a surface's outline rings within box (tiles), for ghosts and the holes adapter: the same field, closing and relax as the
 * chunks (style defaults to BLOB_STYLE[surf]); rings wholly inside are whole, rings that leave the box are closed along it.
 * Outer rings counter-clockwise on the map's axes, holes clockwise; flat [x0, y0, ...] arrays in tiles. */
export function blobOutlines(g: Grid, surf: number, box: BlobBox, style: BlobStyle = BLOB_STYLE[surf] ?? { close: 0, relax: 0 }): number[][] {
  const sc = surfaceChains(g, surf, style, box, false);
  return fillRings(g, sc.oS, sc.chains, cellBox(g, box));
}

// The Course tool's paint cursor (T081, redone in T108; plan P21 section 3.5). The owner, 2026-10-25: "being able to see what that texture you
// have created will look like on a miniature round disc next to your cursor while it shows you where you are about to add a modular piece of
// fairway is important ... the 3d puck of texture should be smaller and to the side of your cursor and the highly wireframe should just show a
// transparent part you are adding on the grid if you clicked there ... it should align to the mini grid on the course."
// Drawn on the engine's 2D overlay (device px) while the brush or a course piece is in hand; the pointer stays the normal pointer:
// - the footprint: exactly the cells a click paints (course-grid's own paintDisc on a scratch grid, with the brush rules), the dab centred on
//   the half grid's nearest cell corner (snap.ts; the Paint tool paints there too), so it moves cell by cell and never jitters inside a cell;
//   a soft translucent tint of the surface with a thin crisp edge along the cells' outline (cell edges: it sits on the 1 m half grid), drawn
//   as paths at device pixels; the cells a click would skip (off your land, a surface that stays on top) in muted red, the reason by the chip;
// - the course grid's lines a little brighter round the dab (over the half grid the map grid layer draws);
// - the chip: a small 3D disc (CHIP_CSS px) of the surface about to be painted, beside the pointer at its lower right like a tooltip, laid
//   with the ground painter's own photo, its tone and its side wall, lit by the one sun at the upper right, with a soft shadow; it eases after
//   the pointer, bobs a little and squashes on a click, which also splashes lightly on the map.
// Speed: the chip and its shadow are sprites cached per look and dpr (the chip's size never changes with the zoom); a footprint is worked out
// once per cell the dab sits on and its outline once per shape (LRU, by its cells relative to the anchor cell); the grid's fade is one cached
// gradient. A frame where the pointer stays in its cell allocates nothing.
// Pure geometry and canvas calls (the canvas factory and the photo source come in), importable from node tests. Units: tiles of 2 m for
// the map, device px on screen.
import { CELL_T, SURF, fillPolygon, makeGrid, paintDisc, type Grid } from '../course-grid';
import { spawnSplash, stepSplash, type SplashKind, type SplashParticle } from '../course-fx';
import { HH, HW } from '../../iso';
import { CAST, castShear } from '../../cast-shadow';
import { DARK_RGB, LIGHT_RGB, SHADOW_RGB, edgeProfileOf, type EdgeProfile } from '../../paint-edges';
import { BORDER_TEXES, borderW, roundCorners, type PaintArea } from '../../paint';
import { surfOfSurface } from '../course-grid/areas';
import { surfaceOfTex } from '../../golf/costs';
import type { PaintTool } from '../../paint-tool';
import { snapDab, squarePoly, squareStart } from './snap';

export { snapDab, squarePoly, squareStart, SQUARE_SIZES } from './snap';

// ---- inputs ----

/** what the cursor reads from the Paint tool each frame (PaintTool fits it) */
export type CursorTool = Pick<PaintTool, 'mode' | 'brushKind' | 'brush' | 'rubOut' | 'cursor' | 'piece' | 'brushSquare' | 'strokeSpent'>;
/** the camera, filled in by the engine each frame (one object, reused): device px per world px (ze = zoom x dpr), the world px at the
 *  overlay's centre (camX, camY), the overlay's size in device px (cw, ch) and the dpr */
export interface CursorView { ze: number; camX: number; camY: number; cw: number; ch: number; dpr: number }
/** the look a chip takes from a brush style (the painted area's own fields) */
export type PuckStyle = Pick<PaintArea, 'tex' | 'scale' | 'angle' | 'border' | 'btex' | 'tone' | 'toneAmt' | 'tint' | 'bscale' | 'bangle'>;
/** a photo for a texture at a wanted px a tile: the picture and the tiles one repeat covers (null: not loaded, or no photo) */
export interface CursorTexture { pick(tex: string, pxPerTile: number): { img: CanvasImageSource & { width: number }; period: number } | null; rev(): number }
/** a 2D canvas the cursor can draw its sprites on */
export interface SpriteCanvas { width: number; height: number; getContext(id: '2d'): CanvasRenderingContext2D | null }
/** the cells a dab skips, by a cell centre in tiles */
export type Refuse = (x: number, y: number) => boolean;
/** why a dab skips the cell centred at (x, y) in tiles ('' when it paints it) */
export type SkipWhy = (x: number, y: number) => string;
/** what painting the cell centred at (x, y) costs ($; 0 when it would not change) */
export type CellCost = (x: number, y: number) => number;
/** what the cursor is given: a canvas factory (default: a DOM canvas), the photo source (default: swatch colours only), and for the golf
 *  game's course grid (T078): why, asked once per new footprint, gives why a dab skips a cell right now (PaintTool.brushSkipWhy; null when the
 *  brush paints areas instead), or refuse, the same as a yes or no (PaintTool.brushSkip); cost, each cell's price for the live price (T109,
 *  PaintTool.brushCellCost; null outside a golf game); and rev, a number that changes whenever those could (the grid's revision, the hole,
 *  Rub out) */
export interface CursorEnv {
  canvas?: (w: number, h: number) => SpriteCanvas;
  texture?: CursorTexture | null;
  why?: (() => SkipWhy | null) | null;
  refuse?: (() => Refuse | null) | null;
  cost?: (() => CellCost | null) | null;
  rev?: () => number;
}

// ---- constants ----

const SQ2 = Math.SQRT2;
/** the tiles one repeat of a hex-mixed photo covers with no period of its own (textures.ts MOSAIC_TILES; that module is worker-only) */
export const MIXED_PERIOD = 12;
/** device px across an iso line per tile of line width (the iso matrix stretches both tile axes alike) */
const ISO_PERP = (2 * HW * HH) / Math.hypot(HW, HH);
/** screen px along a tile axis per world px of zoom */
const TILE_AXIS = Math.hypot(HW, HH);
/** footprint shapes kept, and chip sprites kept */
const SHAPE_CACHE = 48, SPRITE_CACHE = 12;
/** the chip: its width in css px at every zoom, its top face's ground size in tiles (the photo reads as it does on the map at about 20%
 *  zoom), and its centre's offset from the pointer in css px (to the lower right, clear of the arrow, like a tooltip) */
export const CHIP_CSS = 40;
const CHIP_R = CHIP_CSS / 2 / (SQ2 * HW * 0.2);
const CHIP_DX = 36, CHIP_DY = 30;
/** the chip eases to its place at this rate (1/s); its hover eases at these rates (1/s) when pressed and when released */
const EASE = 26, PRESS_EASE = 40, LIFT_EASE = 12;
/** the bob (1.6 s) period, ms */
const BOB_MS = 1600;
/** the click flash, the ripple (0.5x to 1.6x the radius in 300 ms) and a splash burst's life, ms */
const FLASH_MS = 320, RIPPLE_MS = 300, BURST_MS = 600;
/** at most this many splash bursts live at once */
const MAX_BURSTS = 8;
/** the cast shadow's shear (a point h px up falls h * (sx, sy) away on the ground) */
const SHEAR = castShear(CAST);
/** the screen direction toward the sun (opposite the shadows) */
const SUN_X = -Math.cos((CAST.angle * Math.PI) / 180), SUN_Y = -Math.sin((CAST.angle * Math.PI) / 180);

/** a brush's colours and materials: the footprint's edge (core) and tint (fill), the chip's wall, the splash and the course surface it paints */
interface Look { glow: string; core: string; fill: string; wall: 'turf' | 'sand' | 'water' | 'soil'; splash: SplashKind; surf: number }
const LOOKS: Readonly<Record<string, Look>> = {
  fairway: { glow: '#b9f26a', core: '#f4ffde', fill: '#9fdc5a', wall: 'turf', splash: 'dirt', surf: SURF.fairway },
  green: { glow: '#7dffb0', core: '#e8fff1', fill: '#6fe39b', wall: 'turf', splash: 'dirt', surf: SURF.green },
  tee: { glow: '#a6f78a', core: '#efffe8', fill: '#8ee070', wall: 'turf', splash: 'dirt', surf: SURF.tee },
  rough: { glow: '#dcee7c', core: '#fcffe2', fill: '#c4d867', wall: 'turf', splash: 'dirt', surf: SURF.rough },
  fescue: { glow: '#ecd97a', core: '#fff8de', fill: '#d6c063', wall: 'turf', splash: 'dirt', surf: SURF.fescue },
  bunker: { glow: '#ffd98f', core: '#fff7e2', fill: '#f2cf8a', wall: 'sand', splash: 'sand', surf: SURF.bunker },
  waste: { glow: '#f3cf94', core: '#fff4e0', fill: '#e2bf86', wall: 'sand', splash: 'sand', surf: SURF.waste },
  water: { glow: '#7fd6ff', core: '#e8f8ff', fill: '#5fb8ec', wall: 'water', splash: 'water', surf: SURF.water },
  path: { glow: '#ffcf9a', core: '#fff2e2', fill: '#e8b884', wall: 'soil', splash: 'dirt', surf: 0 },
};
const ERASE: Look = { glow: '#ff7a6b', core: '#ffe5df', fill: '#ff6a5a', wall: 'soil', splash: 'dirt', surf: 0 };
/** the skipped cells' muted red: tint and edge */
const SKIP_FILL = '#c8604f', SKIP_EDGE = '#f0a090';
/** the footprint's tint and edge strengths, and the dark line under the edge that keeps it crisp on a light surface */
const TINT_A = 0.26, SKIP_A = 0.22, EDGE_A = 0.9, UNDER = 'rgba(12,18,8,0.42)';
/** each Paint texture's swatch colour (the flat fill while a photo loads) */
const SWATCH = new Map<string, string>(BORDER_TEXES.map(t => [t.id, t.col]));

// ---- small maths ----

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** 0 at a, 1 at b, smooth between */
function smooth(a: number, b: number, v: number): number { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

/** a brush circle's screen half-axes in device px for a brush of radius r tiles at ze device px per world px: a circle on the ground is an
 *  ellipse sqrt(2) HW r ze wide and half as tall (the iso view); the click's ripple is this size */
export function puckAxes(r: number, ze: number): { rx: number; ry: number } {
  return { rx: r * SQ2 * HW * ze, ry: r * SQ2 * HH * ze };
}

// ---- the footprint ----

/** one dab's footprint, relative to the cell that holds the dab's centre (its anchor) */
export interface Shape {
  /** the cells a click paints, as (dx, dy) pairs of cells from the anchor cell */
  cells: Int16Array;
  /** the cells inside the brush a click skips (off your land, a surface on top), as (dx, dy) pairs */
  skip: Int16Array;
  /** the outline of the painted cells along their edges: closed loops of (x, y) pairs in tiles from the anchor cell's corner */
  loops: Float32Array[];
  /** the skipped cells' outline loops */
  skipLoops: Float32Array[];
  /** why most of the skipped cells are skipped ('' when none are) */
  why: string;
  /** the hash of the cells, the skipped cells and their reasons */
  hash: number;
}

/** the reasons a dab skips cells, by a small number (0: none) */
const REASONS: string[] = [''];
const REASON_ID = new Map<string, number>([['', 0]]);
function reasonId(w: string): number {
  let id = REASON_ID.get(w);
  if (id === undefined) { id = REASONS.length < 255 ? REASONS.length : 254; if (id === REASONS.length) { REASONS.push(w); REASON_ID.set(w, id); } }
  return id;
}

/** the outline of a set of cells ((dx, dy) pairs) along the cell edges: closed loops of (x, y) pairs in tiles from cell (0, 0)'s corner, each
 *  edge between a cell in the set and one outside it used once, straight runs merged into one segment; cells that touch only at a corner
 *  are joined there (one loop through the corner, which fills and strokes the same) */
export function cellOutline(cells: Int16Array): Float32Array[] {
  const n = cells.length >> 1; if (!n) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < cells.length; i += 2) { const x = cells[i]!, y = cells[i + 1]!; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  // the cells on a grid with a free border, and each vertex's (at most two) outgoing edges, clockwise round each cell (y down)
  const W = x1 - x0 + 3, H = y1 - y0 + 3, occ = new Uint8Array(W * H), VW = W + 1, out = new Int32Array(VW * (H + 1) * 2).fill(-1);
  for (let i = 0; i < cells.length; i += 2) occ[(cells[i + 1]! - y0 + 1) * W + cells[i]! - x0 + 1] = 1;
  const add = (a: number, b: number) => { const k = 2 * a; if (out[k] < 0) out[k] = b; else out[k + 1] = b; };
  let edges = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (!occ[y * W + x]) continue;
    const tl = y * VW + x, tr = tl + 1, bl = tl + VW, br = bl + 1;
    if (!occ[(y - 1) * W + x]) { add(tl, tr); edges++; }
    if (!occ[y * W + x + 1]) { add(tr, br); edges++; }
    if (!occ[(y + 1) * W + x]) { add(br, bl); edges++; }
    if (!occ[y * W + x - 1]) { add(bl, tl); edges++; }
  }
  const loops: Float32Array[] = [], pts: number[] = [];
  const take = (v: number): number => { const k = 2 * v; let b = out[k + 1]; if (b >= 0) { out[k + 1] = -1; return b; } b = out[k]; out[k] = -1; return b; };
  for (let s = 0; s < out.length >> 1 && edges > 0; s++) while (out[2 * s] >= 0 || out[2 * s + 1] >= 0) {
    pts.length = 0;
    let v = s;
    do {
      const w = take(v); edges--;
      const vx = v % VW, vy = (v - vx) / VW, wx = w % VW, wy = (w - wx) / VW, m = pts.length;
      // a straight run goes on: the last point moves instead of a new one
      if (m >= 4 && (pts[m - 2]! - pts[m - 4]!) * (wy - vy) === (pts[m - 1]! - pts[m - 3]!) * (wx - vx) && (pts[m - 2]! - pts[m - 4]!) * (wx - vx) + (pts[m - 1]! - pts[m - 3]!) * (wy - vy) > 0) { pts[m - 2] = wx; pts[m - 1] = wy; }
      else { if (!m) pts.push(vx, vy); pts.push(wx, wy); }
      v = w;
    } while (v !== s && (out[2 * v] >= 0 || out[2 * v + 1] >= 0));
    // the loop is closed: its last point is its first (drop it), and a straight run through the start joins up
    let m = pts.length;
    if (m >= 4 && pts[m - 2] === pts[0] && pts[m - 1] === pts[1]) { pts.length = m - 2; m -= 2; }
    if (m >= 6) {
      const ax = pts[m - 2]!, ay = pts[m - 1]!, bx = pts[0]!, by = pts[1]!, cx = pts[2]!, cy = pts[3]!;
      if ((bx - ax) * (cy - by) === (by - ay) * (cx - bx)) { pts.splice(0, 2); m -= 2; }
    }
    const f = new Float32Array(m);
    for (let i = 0; i < m; i += 2) { f[i] = (pts[i]! - 1 + x0) * CELL_T; f[i + 1] = (pts[i + 1]! - 1 + y0) * CELL_T; }
    loops.push(f);
  }
  return loops;
}

/** the scratch grid a dab is painted on: placed round the anchor cell each time, re-made only when the radius needs a bigger one */
class DabPad {
  /** the scratch grid of the last run, and the round brush's own (re-made when the radius needs a bigger one) */
  g: Grid | null = null;
  private disc: Grid | null = null;
  private m = -1;
  /** the cell under (x, y) */
  ax = 0; ay = 0;
  /** the cells the last run skipped (scratch-grid indices) and each one's reason, nSkip long */
  skipIdx = new Uint32Array(256); skipWhy = new Uint8Array(256); nSkip = 0;
  /** paints a dab of radius r at (x, y) with course-grid's paintDisc and returns the changed cells (the dab: every cell starts empty) as
   *  scratch-grid indices; why leaves a cell out (its centre in tiles), recorded with its reason */
  run(x: number, y: number, r: number, why?: SkipWhy | null): { idx: Uint32Array; n: number } {
    const ax = Math.floor(x / CELL_T), ay = Math.floor(y / CELL_T), m = Math.ceil(r / CELL_T) + 2;
    let g = this.disc;
    if (!g || this.m !== m) { g = this.disc = makeGrid(0, 0, 2 * m + 1, 2 * m + 1); this.m = m; } else g.surf.fill(0);
    g.x0 = (ax - m) * CELL_T; g.y0 = (ay - m) * CELL_T; this.ax = ax; this.ay = ay; this.nSkip = 0; this.lastM = m; this.g = g;
    const d = paintDisc(g, x, y, r, 1, 0, 0, this.opts(g, why));
    return { idx: d.idx, n: d.n };
  }
  /** the scratch grid of the square brush, and the margin in cells round the anchor of the last run */
  private gs: Grid | null = null; private gsN = -1; private lastM = 0;
  /** lays the square brush's n x n cells from start cell (ix, iy) (its anchor) with course-grid's fillPolygon, as run() does a disc */
  runSquare(ix: number, iy: number, n: number, why?: SkipWhy | null): { idx: Uint32Array; n: number } {
    let g = this.gs;
    if (!g || this.gsN !== n) { g = this.gs = makeGrid(0, 0, n + 4, n + 4); this.gsN = n; } else g.surf.fill(0);
    g.x0 = (ix - 2) * CELL_T; g.y0 = (iy - 2) * CELL_T; this.ax = ix; this.ay = iy; this.nSkip = 0; this.lastM = 2; this.g = g;
    const d = fillPolygon(g, squarePoly(ix, iy, n), 1, 0, 0, this.opts(g, why));
    return { idx: d.idx, n: d.n };
  }
  /** the brush rules as course-grid options on scratch grid g: why leaves a cell out, recorded with its reason */
  private opts(g: Grid, why?: SkipWhy | null) {
    if (!why) return {};
    const w = g.w, x0 = g.x0, y0 = g.y0;
    return { allow: (i: number) => {
      const cx = i % w, cy = (i - cx) / w, r0 = why(x0 + (cx + 0.5) * CELL_T, y0 + (cy + 0.5) * CELL_T);
      if (!r0) return true;
      if (this.nSkip === this.skipIdx.length) { const a = new Uint32Array(this.nSkip * 2), b = new Uint8Array(this.nSkip * 2); a.set(this.skipIdx); b.set(this.skipWhy); this.skipIdx = a; this.skipWhy = b; }
      this.skipIdx[this.nSkip] = i; this.skipWhy[this.nSkip++] = reasonId(r0);
      return false;
    } };
  }
  /** the margin in cells round the anchor */
  get margin() { return this.lastM; }
}

const PAD = new DabPad();
/** the cells a brush dab of radius r tiles at tile (x, y) paints, by course-grid's own paintDisc: (cx, cy) pairs of world cell indices
 *  (cell (cx, cy) spans tiles cx * CELL_T to (cx + 1) * CELL_T, as every course grid, whose origin sits on that lattice) */
export function dabCells(x: number, y: number, r: number, refuse?: Refuse | null): Int32Array {
  const { idx, n } = PAD.run(x, y, r, refuse ? (a, b) => (refuse(a, b) ? 'skip' : '') : null), g = PAD.g!, out = new Int32Array(2 * n), ox = Math.round(g.x0 / CELL_T), oy = Math.round(g.y0 / CELL_T);
  for (let k = 0; k < n; k++) { const i = idx[k]!, cx = i % g.w; out[2 * k] = ox + cx; out[2 * k + 1] = oy + (i - cx) / g.w; }
  return out;
}

/** a shape from its cells and skipped cells (with their reason ids): the outlines, the main reason */
function makeShape(cells: Int16Array, skip: Int16Array, why: Uint8Array | null, hash: number): Shape {
  let best = 0;
  if (why && why.length) {
    const count = new Uint32Array(256);
    for (let i = 0; i < why.length; i++) count[why[i]!]++;
    for (let k = 1; k < 256; k++) if (count[k]! > count[best]!) best = k;
  }
  return { cells, skip, loops: cellOutline(cells), skipLoops: cellOutline(skip), why: REASONS[best] ?? '', hash };
}

/** the footprint of polygons (a course piece's layers, x y pairs in tiles, rounded as they are laid): the cells course-grid's fillPolygon
 *  fills for them (their centres inside), outlined along their edges; ax, ay is the anchor cell the shape is relative to */
export function polyFootprint(polys: readonly number[][]): { shape: Shape; ax: number; ay: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const P of polys) for (let i = 0; i < P.length; i += 2) { x0 = Math.min(x0, P[i]!); x1 = Math.max(x1, P[i]!); y0 = Math.min(y0, P[i + 1]!); y1 = Math.max(y1, P[i + 1]!); }
  if (!(x1 >= x0)) x0 = x1 = y0 = y1 = 0;
  const ax = Math.floor(x0 / CELL_T), ay = Math.floor(y0 / CELL_T), m = 2;
  const g = makeGrid((ax - m) * CELL_T, (ay - m) * CELL_T, Math.ceil((x1 - x0) / CELL_T) + 2 * m + 2, Math.ceil((y1 - y0) / CELL_T) + 2 * m + 2);
  for (const P of polys) { const pts: { x: number; y: number }[] = []; for (let i = 0; i < P.length; i += 2) pts.push({ x: P[i]!, y: P[i + 1]! }); fillPolygon(g, pts, 1, 0, 0); }
  const list: number[] = [];
  let h = 2166136261;
  for (let i = 0; i < g.surf.length; i++) if (g.surf[i]) { const cx = i % g.w, dx = cx - m, dy = (i - cx) / g.w - m; list.push(dx, dy); h = Math.imul(h ^ ((dx & 0xffff) | (dy << 16)), 16777619); }
  return { shape: makeShape(Int16Array.from(list), new Int16Array(0), null, h), ax, ay };
}

/** the footprints of dabs, cached: the cells of the dab at the cursor (exactly paintDisc's, with the brush rules), the cells it skips, and
 *  their outlines, kept per shape */
export class Footprints {
  private pad = new DabPad();
  private shapes = new Map<number, Shape>();
  private kx = NaN; private ky = NaN; private kr = NaN; private ks = -1; private krev = -1;
  /** the shape at the last call and the world cell of its anchor */
  shape: Shape | null = null;
  ax = 0; ay = 0;
  /** counters for the tests: dabs run and outlines made */
  dabs = 0; contours = 0;
  /** whether the last dab ran on the course grid's rules (why or refuse gave a function) */
  grid = false;
  /** what a click on the last footprint costs ($; -1: no price, outside a golf game) and how many cells it paints */
  price = -1; count = 0;
  /** the footprint of a dab for surface surf: the round brush's disc of radius r at (x, y), or with square n > 0 (T109) the n x n cells the
   *  square brush lays with the pointer at (x, y); re-runs the dab only when the inputs changed (rev: see CursorEnv), asking why (or refuse)
   *  then for the cells it skips and cost for their price, and outlines only a shape it has not kept */
  at(x: number, y: number, r: number, surf: number, why?: (() => SkipWhy | null) | null, rev = 0, refuse?: (() => Refuse | null) | null, square = 0, cost?: (() => CellCost | null) | null): Shape {
    if (square > 0) { x = squareStart(x, square); y = squareStart(y, square); r = -square; }
    if (this.shape && x === this.kx && y === this.ky && r === this.kr && surf === this.ks && rev === this.krev) return this.shape;
    this.kx = x; this.ky = y; this.kr = r; this.ks = surf; this.krev = rev; this.dabs++;
    let test = why?.() ?? null;
    if (!test) { const rf = refuse?.() ?? null; if (rf) test = (a, b) => (rf(a, b) ? 'Skipped' : ''); }
    this.grid = !!test;
    const pad = this.pad, { idx, n } = square > 0 ? pad.runSquare(x, y, square, test) : pad.run(x, y, r, test), g = pad.g!, m = pad.margin, ns = pad.nSkip;
    // the price: each painted cell's cost (by its world centre)
    const cc = cost?.() ?? null;
    this.count = n; this.price = cc ? 0 : -1;
    if (cc) for (let k = 0; k < n; k++) { const i = idx[k]!, cx = i % g.w; this.price += cc(g.x0 + (cx + 0.5) * CELL_T, g.y0 + ((i - cx) / g.w + 0.5) * CELL_T); }
    const cells = new Int16Array(2 * n), skip = new Int16Array(2 * ns), sw = new Uint8Array(ns);
    let h = 2166136261 ^ (surf * 97 + n);
    for (let k = 0; k < n; k++) {
      const i = idx[k]!, cx = i % g.w, dx = cx - m, dy = (i - cx) / g.w - m;
      cells[2 * k] = dx; cells[2 * k + 1] = dy;
      h = Math.imul(h ^ ((dx & 0xffff) | (dy << 16)), 16777619);
    }
    h = Math.imul(h ^ (ns + 0x9e37), 16777619);
    for (let k = 0; k < ns; k++) {
      const i = pad.skipIdx[k]!, cx = i % g.w, dx = cx - m, dy = (i - cx) / g.w - m;
      skip[2 * k] = dx; skip[2 * k + 1] = dy; sw[k] = pad.skipWhy[k]!;
      h = Math.imul(h ^ ((dx & 0xffff) | (dy << 16)) ^ (sw[k]! << 24), 16777619);
    }
    this.ax = pad.ax; this.ay = pad.ay;
    let s = this.shapes.get(h);
    if (s && !(same(s.cells, cells) && same(s.skip, skip))) s = undefined;
    if (s) { this.shapes.delete(h); this.shapes.set(h, s); }
    else {
      s = makeShape(cells, skip, sw, h); this.contours++;
      this.shapes.set(h, s);
      if (this.shapes.size > SHAPE_CACHE) this.shapes.delete(this.shapes.keys().next().value!);
    }
    return (this.shape = s);
  }
}
function same(a: Int16Array, b: Int16Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---- the chip sprite (the 3D surface disc, T081's puck art) ----

/** a cached puck: the sprite (top face centre at (pad + rx, pad + ry), the wall below it), its contact shadow, and the sizes it was drawn at */
interface Sprite { key: string; c: SpriteCanvas; sh: SpriteCanvas; rx: number; ry: number; thick: number; pad: number }

/** the wall's thickness for a puck ry device px tall */
const thickOf = (ry: number, d: number) => clamp(0.3 * ry, 4 * d, 15 * d);

const rgba = (c: readonly number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** paints a puck sprite for a brush of R tiles whose top face is rx, ry device px across (so s = rx / (R sqrt2 HW) device px per world px:
 *  the map scale it was bucketed at): the wall, the top face in the brush's photo with its tone and border band, the sun's light and shade,
 *  and the rim lights */
function paintPuck(g: CanvasRenderingContext2D, st: PuckStyle, kind: string, erase: boolean, withBand: boolean, R: number, rx: number, ry: number, thick: number, pad: number, d: number, tex: CursorTexture | null | undefined) {
  const cx = pad + rx, cy = pad + ry, look = LOOKS[kind] ?? LOOKS.fairway!, s = rx / (R * SQ2 * HW), E = R + 2;
  const profile: EdgeProfile = edgeProfileOf(kind === 'path' ? null : kind, st.tex, st.border > 0 ? st.btex : undefined);
  /** a tile-space pattern of texture t (scale k, angle a degrees) for the current tile-space transform, or its swatch colour */
  const fillOf = (t: string, k: number, a: number): CanvasPattern | string => {
    const src = tex?.pick(t, TILE_AXIS * s * k) ?? null;
    if (!src || typeof DOMMatrix === 'undefined') return SWATCH.get(t) ?? '#7a8a50';
    const p = g.createPattern(src.img, 'repeat'); if (!p) return SWATCH.get(t) ?? '#7a8a50';
    p.setTransform(new DOMMatrix().rotateSelf(0, 0, a).scaleSelf((k * src.period) / src.img.width)); return p;
  };
  const iso = () => g.setTransform(HW * s, HH * s, -HW * s, HH * s, cx, cy);
  const wall = () => { g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI); g.lineTo(cx - rx, cy + thick); g.ellipse(cx, cy + thick, rx, ry, 0, Math.PI, 0, true); g.closePath(); };
  const band = (h0: number, h1: number) => { g.beginPath(); g.ellipse(cx, cy + h0, rx, ry, 0, 0, Math.PI); g.lineTo(cx - rx, cy + h1); g.ellipse(cx, cy + h1, rx, ry, 0, Math.PI, 0, true); g.closePath(); };
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  g.lineJoin = 'round'; g.lineCap = 'round';

  // ---- the side wall: the front half of the rim, extruded down; soil under a turf edge (sand, a bank over deep water)
  g.save(); wall(); g.clip();
  /** fills the clip with texture t laid in tile space (scale k, angle a) */
  const lay = (t: string, k: number, a: number) => { g.save(); iso(); g.fillStyle = fillOf(t, k, a); g.fillRect(-E, -E, 2 * E, 2 * E); g.restore(); };
  /** fills the clip with a colour in an operation */
  const wash = (col: string, op: GlobalCompositeOperation) => { g.globalCompositeOperation = op; g.fillStyle = col; g.fillRect(0, 0, g.canvas.width, g.canvas.height); g.globalCompositeOperation = 'source-over'; };
  if (look.wall === 'water') {
    // deep water under a thin bank of the border's ground
    const wg = g.createLinearGradient(0, cy, 0, cy + ry + thick);
    wg.addColorStop(0, '#2c6d8e'); wg.addColorStop(1, '#0d2a3e');
    g.fillStyle = wg; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    g.save(); band(-1, Math.max(1.5 * d, thick * 0.28)); g.clip(); lay(st.border > 0 ? st.btex : 'dirt', st.bscale, st.bangle); g.restore();
  } else if (look.wall === 'sand') {
    lay(st.tex, st.scale, st.angle); wash('rgba(150,118,80,0.55)', 'multiply');
  } else {
    lay('dirt', 1.4, 0); wash('rgba(196,140,92,0.45)', 'multiply');
    if (look.wall === 'turf') {
      // the turf edge: the surface's own grass hangs over the soil, darker where it turns down
      const th = Math.max(1.5 * d, thick * 0.34);
      g.save(); band(-1, th); g.clip(); lay(st.tex, st.scale, st.angle); wash('rgba(70,90,50,0.55)', 'multiply'); g.restore();
      // a soft root line under the turf
      g.save(); g.beginPath(); g.ellipse(cx, cy + th, rx, ry, 0, 0, Math.PI); g.strokeStyle = 'rgba(30,22,14,0.35)'; g.lineWidth = Math.max(1, 0.8 * d); g.stroke(); g.restore();
    }
  }
  // the sun: the right of the wall faces it, the left turns away; the foot sits in its own shade
  const hg = g.createLinearGradient(cx - rx, 0, cx + rx, 0);
  hg.addColorStop(0, rgba(DARK_RGB, 0.62)); hg.addColorStop(0.45, rgba(DARK_RGB, 0.18)); hg.addColorStop(1, rgba(DARK_RGB, 0));
  g.globalCompositeOperation = 'multiply'; g.fillStyle = hg; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  const lg = g.createLinearGradient(cx - rx, 0, cx + rx, 0);
  lg.addColorStop(0.5, rgba(LIGHT_RGB, 0)); lg.addColorStop(0.9, rgba(LIGHT_RGB, 0.32)); lg.addColorStop(1, rgba(LIGHT_RGB, 0.2));
  g.globalCompositeOperation = 'screen'; g.fillStyle = lg; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  const vg = g.createLinearGradient(0, cy + ry * 0.4, 0, cy + ry + thick);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,8,20,0.38)');
  g.globalCompositeOperation = 'multiply'; g.fillStyle = vg; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  g.globalCompositeOperation = 'source-over'; g.restore();
  // the foot's contact line
  g.beginPath(); g.ellipse(cx, cy + thick, rx, ry, 0, 0, Math.PI); g.strokeStyle = 'rgba(16,12,26,0.5)'; g.lineWidth = Math.max(1, 1.1 * d); g.stroke();

  // ---- the top face: the brush's photo in tile space (its period, scale and angle), its tone, its border band inside the edge
  g.save(); iso(); g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.clip();
  g.fillStyle = fillOf(st.tex, st.scale, st.angle); g.fillRect(-R, -R, 2 * R, 2 * R);
  if (st.tone) { g.globalCompositeOperation = st.tone === 1 ? 'multiply' : 'screen'; g.globalAlpha = st.toneAmt; g.fillStyle = st.tint; g.fillRect(-R, -R, 2 * R, 2 * R); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
  // the border band of a painted area (first cut round a fairway, fringe round a green), the painter's width held to a third of the puck so
  // the surface reads; on the course grid the collars are laid outside the cells (course-blobs), so the puck is the surface alone
  const bw = withBand && st.border > 0 ? Math.min(borderW(st.border), 0.34 * R) : 0;
  if (bw > 0 && st.btex !== 'kerb') {
    g.strokeStyle = fillOf(st.btex, st.bscale, st.bangle);
    g.lineWidth = 2 * bw; g.stroke();
    g.globalAlpha = 0.5; g.lineWidth = 2 * bw * 1.35; g.stroke(); g.globalAlpha = 1;
  }
  g.restore();

  // ---- the sun on the top face: a light rim on the sun's side and shade on the far side (reversed for a sunken bunker and water),
  //      laid like paint-edges' bevel; a soft sheen toward the sun
  const sunk = profile === 'sunken' || profile === 'water';
  const [la, da] = profile === 'raised' ? [0.5, 0.5] : profile === 'turf' ? [0.38, 0.4] : profile === 'sunken' ? [0.36, 0.55] : profile === 'water' ? [0.3, 0.45] : profile === 'crisp' ? [0.22, 0.32] : [0.28, 0.32];
  const ux = SUN_X * rx, uy = SUN_Y * ry;
  g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.clip();
  const rimW = Math.max(2 * d, 0.36 * ry);
  const lightG = g.createLinearGradient(cx + (sunk ? -ux : ux), cy + (sunk ? -uy : uy), cx - (sunk ? -ux : ux), cy - (sunk ? -uy : uy));
  lightG.addColorStop(0, rgba(LIGHT_RGB, la)); lightG.addColorStop(0.42, rgba(LIGHT_RGB, 0)); lightG.addColorStop(1, rgba(LIGHT_RGB, 0));
  const darkG = g.createLinearGradient(cx + (sunk ? -ux : ux), cy + (sunk ? -uy : uy), cx - (sunk ? -ux : ux), cy - (sunk ? -uy : uy));
  darkG.addColorStop(0, rgba(DARK_RGB, 0)); darkG.addColorStop(0.55, rgba(DARK_RGB, 0)); darkG.addColorStop(1, rgba(DARK_RGB, da));
  for (const [grad, op] of [[lightG, 'screen'], [darkG, 'multiply']] as const) {
    g.globalCompositeOperation = op; g.strokeStyle = grad;
    for (let k = 1; k <= 3; k++) { g.globalAlpha = 0.45; g.lineWidth = (rimW * 2 * k) / 3; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.stroke(); }
  }
  g.globalAlpha = 1;
  g.setTransform(1, 0, 0, ry / rx, 0, cy - (cy * ry) / rx);
  const sheen = g.createRadialGradient(cx + 0.35 * ux, cy + (0.35 * uy * rx) / ry, 0, cx + 0.35 * ux, cy + (0.35 * uy * rx) / ry, rx * 1.05);
  sheen.addColorStop(0, rgba(LIGHT_RGB, sunk ? 0.06 : 0.16)); sheen.addColorStop(1, rgba(LIGHT_RGB, 0));
  g.globalCompositeOperation = 'screen'; g.fillStyle = sheen; g.fillRect(0, 0, g.canvas.width, (g.canvas.height * rx) / ry);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.restore();

  // ---- the rim: the top edge catches the sun on the right and fades to the left; the far edge glints up right
  const eg = g.createLinearGradient(cx - rx, 0, cx + rx, 0);
  eg.addColorStop(0, 'rgba(255,246,214,0.12)'); eg.addColorStop(0.65, 'rgba(255,246,214,0.45)'); eg.addColorStop(1, 'rgba(255,246,214,0.85)');
  g.strokeStyle = eg; g.lineWidth = Math.max(1, 1.1 * d);
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI); g.stroke();
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, -Math.PI * 0.62, -Math.PI * 0.02); g.globalAlpha = 0.7; g.stroke(); g.globalAlpha = 1;

  // ---- rub out: the puck goes grey and red, the surface it takes away
  if (erase) {
    g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, Math.PI, 0); g.lineTo(cx + rx, cy + thick); g.ellipse(cx, cy + thick, rx, ry, 0, 0, Math.PI); g.closePath(); g.clip();
    g.globalCompositeOperation = 'saturation'; g.fillStyle = '#808080'; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(255,128,112,0.75)'; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    g.restore(); g.globalCompositeOperation = 'source-over';
  }
}

/** paints the puck's soft contact shadow (an ellipse of half-axes rx, ry in the cast shadows' colour) centred on the canvas */
function paintShadow(g: CanvasRenderingContext2D, rx: number, ry: number) {
  const w = g.canvas.width, h = g.canvas.height;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
  g.setTransform(1, 0, 0, ry / rx, 0, (h / 2) * (1 - ry / rx));
  const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, rx * 1.15);
  rg.addColorStop(0, rgba(SHADOW_RGB, 0.62)); rg.addColorStop(0.55, rgba(SHADOW_RGB, 0.4)); rg.addColorStop(0.8, rgba(SHADOW_RGB, 0.14)); rg.addColorStop(1, rgba(SHADOW_RGB, 0));
  g.fillStyle = rg; g.fillRect(0, 0, w, h * (rx / ry));
  g.setTransform(1, 0, 0, 1, 0, 0);
}


// ---- the cursor ----

/** a splash: where (tiles), when, the brush radius (tiles), course-fx's particles (their flight in css px), where each starts on the
 *  dab's rim (unit circle, x y pairs), and whether it ripples */
interface Burst { x: number; y: number; t0: number; r: number; parts: SplashParticle[]; rim: Float32Array; ring: boolean; col: string }

/** the brush's cursor: the footprint of the cells a click paints, the course grid round it and the surface chip beside the pointer, drawn
 *  on the engine's overlay each frame */
export class CourseCursor {
  /** the footprint cache (the tests read it) */
  readonly feet = new Footprints();
  /** counters for the tests: chip sprites painted, gradients made */
  readonly stats = { sprites: 0, gradients: 0 };
  /** the chip's last drawn half-axes and the centre of its top face, device px, and whether it was drawn (the tests read them) */
  readonly last = { rx: 0, ry: 0, x: 0, y: 0, shown: false };
  private env: CursorEnv;
  /** the chip's eased place (device px), whether it has one yet, its eased hover height (device px) and opacity */
  private px = 0; private py = 0; private have = false; private hov = 0; private alpha = 1;
  /** the last frame time (ms), the last press and release (ms), a press in progress and whether it rubs out */
  private t = 0; private pressAt = -1e9; private releaseAt = -1e9; private pressed = false; private pressErase = false;
  /** where the stroke last splashed (tiles) */
  private trailX = 0; private trailY = 0;
  private bursts: Burst[] = [];
  private seed = 1;
  /** the screen points of the outline loops (device px), grown when a shape needs more, and each loop's start */
  private scr = new Float32Array(512);
  private offs = new Int32Array(16);
  /** the grid's fade: one radial gradient in tile space, made again only when its radius changes */
  private grad: CanvasGradient | null = null; private gradR = -1;
  /** the chip sprites (LRU) and the one in use */
  private sprites = new Map<string, Sprite>();
  private spr: Sprite | null = null;
  private sk = { kind: '', st: null as PuckStyle | null, erase: false, band: true, d: 0, rev: -1, tex: '', scale: 0, angle: 0, border: -1, btex: '', tone: -1 };

  constructor(env: CursorEnv = {}) { this.env = env; }

  /** a press on the map (the engine calls it after the Paint tool's own): a brush press starts the flash, the squash and the splash; a
   *  course piece that can go flashes and splashes as it lands */
  press(tool: CursorTool, alt = false, now = performance.now()) {
    const c = tool.cursor; if (!c) return;
    if (tool.mode === 'piece') {
      const p = tool.piece, pc = this.piece; if (!p || p.why || !pc) return;
      this.pressAt = now; this.releaseAt = now;
      this.splash(pc.cx, pc.cy, pc.r, pc.look, now, true);
      return;
    }
    if (tool.mode !== 'brush') return;
    this.pressed = true; this.pressAt = now; this.pressErase = tool.rubOut || alt;
    const n = tool.brushSquare(), r = n ? (n * CELL_T) / 2 : tool.brush[tool.brushKind].r;
    const x = n ? (squareStart(c.x, n) + n / 2) * CELL_T : snapDab(c.x), y = n ? (squareStart(c.y, n) + n / 2) * CELL_T : snapDab(c.y);
    this.splash(x, y, r, this.pressErase ? ERASE : LOOKS[tool.brushKind] ?? LOOKS.fairway!, now, true);
    this.trailX = x; this.trailY = y;
  }
  /** the press ends: the chip springs back up */
  release(now = performance.now()) { if (this.pressed) { this.pressed = false; this.releaseAt = now; } }

  /** draws the cursor for this frame; true when the chip is shown */
  draw(ctx: CanvasRenderingContext2D, v: CursorView, tool: CursorTool, now: number): boolean {
    const dt = this.t ? clamp((now - this.t) / 1000, 0, 0.1) : 0; this.t = now;
    const c = tool.cursor;
    let shown = false;
    if (tool.mode === 'brush' && c) shown = this.drawBrush(ctx, v, tool, c.x, c.y, now, dt);
    else if (tool.mode === 'piece' && c && tool.piece) shown = this.drawPiece(ctx, v, tool, c.x, c.y, now, dt);
    else { this.have = false; this.pressed = false; }
    this.drawBursts(ctx, v, now, dt);
    this.last.shown = shown;
    return shown;
  }

  /** this frame's motion: the squash, the flash, the chip's rest hover and wall */
  private mo = { sx: 1, sy: 1, flash: 0, rest: 0, thick: 0 };
  /** the chip eases to (gx, gy) (device px), bobs, sinks while pressed, squashes after a press and springs after a release */
  private motion(gx: number, gy: number, ry: number, d: number, now: number, dt: number) {
    const m = this.mo, rest = 3 * d, thick = thickOf(ry, d);
    if (!this.have) { this.px = gx; this.py = gy; this.have = true; this.hov = rest; this.alpha = 1; }
    else { const k = 1 - Math.exp(-dt * EASE); this.px += (gx - this.px) * k; this.py += (gy - this.py) * k; }
    const target = this.pressed ? 0.5 * d : rest + 1.2 * d * Math.sin((now * 2 * Math.PI) / BOB_MS);
    this.hov += (target - this.hov) * (1 - Math.exp(-dt * (this.pressed ? PRESS_EASE : LIFT_EASE)));
    this.alpha += ((this.pressed ? 0.75 : 1) - this.alpha) * (1 - Math.exp(-dt * 14));
    const tp = now - this.pressAt, tr = now - this.releaseAt;
    const q = (tp < 700 ? Math.exp(-tp / 130) * Math.cos((tp * 2 * Math.PI) / 280) : 0) * 0.16 - (tr < 600 ? Math.exp(-tr / 110) * Math.cos((tr * 2 * Math.PI) / 240) : 0) * 0.08;
    m.sx = 1 + 0.8 * q; m.sy = 1 - q;
    m.flash = tp < FLASH_MS ? (1 - tp / FLASH_MS) * (1 - tp / FLASH_MS) : 0;
    m.rest = rest; m.thick = thick;
  }

  /** the footprint, the grid and the chip for the brush with the pointer at tile (cx, cy): the dab sits on the half grid's nearest corner */
  private drawBrush(ctx: CanvasRenderingContext2D, v: CursorView, tool: CursorTool, cx: number, cy: number, now: number, dt: number): boolean {
    const set = tool.brush[tool.brushKind], r = set.r, st = set.style, erase = this.pressed ? this.pressErase : tool.rubOut;
    const base = LOOKS[tool.brushKind] ?? LOOKS.fairway!, look = erase ? ERASE : base, d = v.dpr, n = tool.brushSquare();
    // the dab's middle and size: the square brush's n x n cells (T109), or the round brush on the nearest cell corner (T108)
    const x = n ? (squareStart(cx, n) + n / 2) * CELL_T : snapDab(cx), y = n ? (squareStart(cy, n) + n / 2) * CELL_T : snapDab(cy), size = n ? (n * CELL_T) / 2 : r;
    this.drawGrid(ctx, v, x, y, size);
    const f = this.feet, fp = f.at(n ? cx : x, n ? cy : y, r, base.surf, this.env.why, this.env.rev?.() ?? 0, this.env.refuse, n, this.env.cost);
    this.footprint(ctx, fp, f.ax * CELL_T, f.ay * CELL_T, v, look, !erase);
    const spent = tool.strokeSpent;
    this.chip(ctx, v, cx, cy, tool.brushKind, st, erase, !f.grid, d, now, dt, erase ? '' : fp.skip.length ? fp.why : '', this.priceText(f.count, f.price, this.pressed, spent));
    // a stroke in progress splashes lightly as it travels
    if (this.pressed && Math.hypot(x - this.trailX, y - this.trailY) > Math.max(1.5, size)) { this.splash(x, y, size, look, now, false); this.trailX = x; this.trailY = y; }
    return true;
  }

  /** the course piece in hand: the Paint tool's plan it was made for, the footprint of its golf layers (anchor cell ax, ay), its core
   *  surface (kind, look), and its middle and half size in tiles (the splash) */
  private piece: { plan: unknown; shape: Shape; ax: number; ay: number; kind: string; look: Look; cx: number; cy: number; r: number } | null = null;
  /** a course piece in hand (the plan is rebuilt when it moves): the cells its golf layers fill, tinted like a dab's footprint (red with the
   *  reason where it cannot go), and the chip of its core surface beside the pointer */
  private drawPiece(ctx: CanvasRenderingContext2D, v: CursorView, tool: CursorTool, cx: number, cy: number, now: number, dt: number): boolean {
    const plan = tool.piece!;
    let pc = this.piece;
    if (!pc || pc.plan !== plan) {
      // the layers the piece lays into the course grid: its golf surfaces (collars and cart paths are not cells), rounded as they are laid
      const layers = plan.areas.filter(a => surfOfSurface(a.kind ?? surfaceOfTex(a.tex)) > 0), core = plan.areas.find(a => a.kind) ?? layers[0];
      const polys = layers.map(a => roundCorners(a.pts, a.radius)), f = polyFootprint(polys);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const P of polys) for (let i = 0; i < P.length; i += 2) { x0 = Math.min(x0, P[i]!); x1 = Math.max(x1, P[i]!); y0 = Math.min(y0, P[i + 1]!); y1 = Math.max(y1, P[i + 1]!); }
      const kind = core?.kind ?? 'fairway', any = polys.length > 0;
      pc = this.piece = { plan, shape: f.shape, ax: f.ax, ay: f.ay, kind, look: LOOKS[kind] ?? LOOKS.fairway!, cx: any ? (x0 + x1) / 2 : cx, cy: any ? (y0 + y1) / 2 : cy, r: any ? 0.5 * Math.min(x1 - x0, y1 - y0) : 1 };
    }
    const bad = !!plan.why, d = v.dpr;
    if (bad) this.skipTint(ctx, pc.shape.loops, pc.ax * CELL_T, pc.ay * CELL_T, v);
    else this.footprint(ctx, pc.shape, pc.ax * CELL_T, pc.ay * CELL_T, v, pc.look, false);
    const set = (tool.brush as Record<string, { style: PuckStyle } | undefined>)[pc.kind];
    if (set) this.chip(ctx, v, cx, cy, pc.kind, set.style, bad, false, d, now, dt, bad ? plan.why ?? '' : '', '');
    return true;
  }

  /** the footprint: the painted cells' soft tint and crisp edge, and (skips) the skipped cells in muted red; the outline is the cells' own
   *  edges, projected to device px each frame (no bitmap: never pixelated) */
  private footprint(ctx: CanvasRenderingContext2D, fp: Shape, ox: number, oy: number, v: CursorView, look: Look, skips: boolean) {
    const m = this.mo, d = v.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    if (skips && fp.skipLoops.length) this.skipTint(ctx, fp.skipLoops, ox, oy, v);
    if (!fp.loops.length) return;
    this.loopsPath(ctx, fp.loops, ox, oy, v);
    ctx.fillStyle = m.flash > 0 ? look.core : look.fill; ctx.globalAlpha = TINT_A + 0.3 * m.flash; ctx.fill('evenodd');
    this.edge(ctx, look.core, d);
  }
  /** cells drawn in the skipped look: a muted red tint and edge */
  private skipTint(ctx: CanvasRenderingContext2D, loops: Float32Array[], ox: number, oy: number, v: CursorView) {
    if (!loops.length) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.loopsPath(ctx, loops, ox, oy, v);
    ctx.fillStyle = SKIP_FILL; ctx.globalAlpha = SKIP_A; ctx.fill('evenodd');
    this.edge(ctx, SKIP_EDGE, v.dpr);
  }
  /** strokes the current path as the footprint's edge: a dark line under a light one, a css px wide */
  private edge(ctx: CanvasRenderingContext2D, col: string, d: number) {
    ctx.strokeStyle = UNDER; ctx.globalAlpha = 1; ctx.lineWidth = 2.2 * d; ctx.stroke();
    ctx.strokeStyle = col; ctx.globalAlpha = EDGE_A; ctx.lineWidth = d; ctx.stroke();
    ctx.globalAlpha = 1;
  }
  /** the loops (tiles from (ox, oy)) as one new path in device px, into the reused buffer */
  private loopsPath(ctx: CanvasRenderingContext2D, loops: Float32Array[], ox: number, oy: number, v: CursorView) {
    let total = 0;
    for (const p of loops) total += p.length;
    if (total > this.scr.length) this.scr = new Float32Array(Math.max(total, this.scr.length * 2));
    if (loops.length + 1 > this.offs.length) this.offs = new Int32Array(loops.length * 2 + 2);
    const s = this.scr, ze = v.ze, ex = v.cw / 2 - v.camX * ze, ey = v.ch / 2 - v.camY * ze;
    ctx.beginPath();
    let o = 0;
    for (let i = 0; i < loops.length; i++) {
      const p = loops[i]!; this.offs[i] = o;
      for (let j = 0; j < p.length; j += 2) {
        const x = p[j]! + ox, y = p[j + 1]! + oy, X = (x - y) * HW * ze + ex, Y = (x + y) * HH * ze + ey;
        s[o + j] = X; s[o + j + 1] = Y;
        if (j) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      }
      ctx.closePath();
      o += p.length;
    }
    this.offs[loops.length] = o;
  }

  /** the chip beside the pointer at tile (cx, cy): its contact shadow, then the sprite squashed about its foot, and under it the reason the
   *  click skips cells (why, '' for none) */
  private chip(ctx: CanvasRenderingContext2D, v: CursorView, cx: number, cy: number, kind: string, st: PuckStyle, erase: boolean, band: boolean, d: number, now: number, dt: number, why: string, price: string) {
    const ze = v.ze, rx = (CHIP_CSS / 2) * d, ry = rx * (HH / HW);
    const mx = ((cx - cy) * HW - v.camX) * ze + v.cw / 2, my = ((cx + cy) * HH - v.camY) * ze + v.ch / 2;
    // to the lower right of the pointer; flipped to its left or above it near the screen's edges
    const gx = mx + (mx + (CHIP_DX + CHIP_CSS) * d > v.cw ? -CHIP_DX : CHIP_DX) * d, gy = my + (my + (CHIP_DY + CHIP_CSS) * d > v.ch ? -CHIP_DY : CHIP_DY) * d;
    this.motion(gx, gy, ry, d, now, dt);
    const m = this.mo, x = Math.round(this.px), y = Math.round(this.py);
    this.last.rx = rx; this.last.ry = ry; this.last.x = x; this.last.y = y;
    const sp = this.sprite(kind, st, erase, band, d);
    const h = this.hov + m.thick * 0.5, shx = x + SHEAR.sx * h, shy = y + SHEAR.sy * h;
    const sw = sp.sh.width * m.sx, shh = sp.sh.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = CAST.strength * 0.85;
    ctx.drawImage(sp.sh as CanvasImageSource, shx - sw / 2, shy - shh / 2, sw, shh);
    ctx.globalAlpha = this.alpha;
    ctx.setTransform(m.sx, 0, 0, m.sy, x, y - Math.round(this.hov));
    ctx.drawImage(sp.c as CanvasImageSource, -(sp.pad + sp.rx), -(sp.pad + sp.ry + sp.thick));
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    let ly = y + ry + m.thick + 7 * d;
    if (price) { this.label(ctx, 0, price, x, ly, d, '#f4f1e6'); ly += 20 * d; }
    if (why) this.label(ctx, 1, why, x, ly, d, '#ffd5cc');
  }
  /** the price pill's text: the cells a click paints and what they cost (or, while dragging, what the run has cost so far); cached, so a
   *  still frame makes no new string */
  private priceKey = ''; private priceStr = '';
  private priceText(count: number, price: number, pressed: boolean, spent: number): string {
    const k = pressed ? `r${spent}` : `${count}|${price}`;
    if (k !== this.priceKey) {
      this.priceKey = k;
      this.priceStr = pressed ? (price < 0 ? '' : `Run $${spent.toLocaleString()}`) : count ? `${count} cell${count === 1 ? '' : 's'}${price < 0 ? '' : ` · $${price.toLocaleString()}`}` : '';
    }
    return this.priceStr;
  }
  /** a small dark pill with a text (the price, or the reason a click skips cells), centred under the chip; slot 0 or 1 keeps its measure */
  private labelText = ['', '']; private labelW = [0, 0]; private labelD = 0;
  private label(ctx: CanvasRenderingContext2D, slot: 0 | 1, text: string, x: number, y: number, d: number, col: string) {
    ctx.font = `600 ${Math.round(11 * d)}px system-ui, sans-serif`;
    if (d !== this.labelD) { this.labelD = d; this.labelText[0] = this.labelText[1] = ''; }
    if (text !== this.labelText[slot]) { this.labelText[slot] = text; this.labelW[slot] = ctx.measureText(text).width; }
    const w = this.labelW[slot]! + 12 * d, h = 17 * d, x0 = Math.round(x - w / 2), y0 = Math.round(y);
    ctx.fillStyle = 'rgba(22,20,24,0.82)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, h / 2); else ctx.rect(x0, y0, w, h); ctx.fill();
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + w / 2, y0 + h / 2 + 0.5 * d);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  /** the course grid's lines round (cx, cy): 2 m lines and the 1 m lines between them, faded out with distance by a radial gradient in
   *  tile space (an ellipse on screen) and with the zoom (1 m lines go first, then the 2 m ones) */
  private drawGrid(ctx: CanvasRenderingContext2D, v: CursorView, cx: number, cy: number, r: number) {
    const ze = v.ze, cell = (2 * HW * CELL_T * ze) / v.dpr; // a cell's width on screen, css px
    const aTile = smooth(2.2, 4.5, cell), aCell = smooth(6, 12, cell);
    if (aTile < 0.02) return;
    const R = r + clamp(0.6 * r, 2.5, 6);
    if (R !== this.gradR || !this.grad) {
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      gr.addColorStop(0, 'rgba(255,253,236,1)'); gr.addColorStop(clamp((0.8 * r) / R, 0, 0.9), 'rgba(255,253,236,0.85)'); gr.addColorStop(1, 'rgba(255,253,236,0)');
      this.grad = gr; this.gradR = R; this.stats.gradients++;
    }
    ctx.setTransform(HW * ze, HH * ze, -HW * ze, HH * ze, v.cw / 2 - v.camX * ze, v.ch / 2 - v.camY * ze);
    ctx.translate(cx, cy);
    ctx.strokeStyle = this.grad; ctx.lineWidth = v.dpr / (ze * ISO_PERP); ctx.lineCap = 'butt';
    const k0x = Math.ceil((cx - R) / CELL_T), k1x = Math.floor((cx + R) / CELL_T), k0y = Math.ceil((cy - R) / CELL_T), k1y = Math.floor((cy + R) / CELL_T);
    for (let odd = 0, many = k1x - k0x > 140; odd < 2; odd++) {
      const a = odd ? (many ? 0 : 0.22 * aCell) : 0.36 * aTile;
      if (a < 0.01) continue;
      ctx.beginPath();
      for (let k = k0x; k <= k1x; k++) { if ((k & 1) !== odd) continue; const dx = k * CELL_T - cx, h = Math.sqrt(Math.max(0, R * R - dx * dx)); ctx.moveTo(dx, -h); ctx.lineTo(dx, h); }
      for (let k = k0y; k <= k1y; k++) { if ((k & 1) !== odd) continue; const dy = k * CELL_T - cy, h = Math.sqrt(Math.max(0, R * R - dy * dy)); ctx.moveTo(-h, dy); ctx.lineTo(h, dy); }
      ctx.globalAlpha = a; ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** the chip sprite for this look (band: with its border band) at this dpr, from the cache, painted when missing */
  private sprite(kind: string, st: PuckStyle, erase: boolean, band: boolean, d: number): Sprite {
    const rev = this.env.texture?.rev() ?? 0, k = this.sk;
    if (this.spr && k.kind === kind && k.st === st && k.erase === erase && k.band === band && k.d === d && k.rev === rev
      && k.tex === st.tex && k.scale === st.scale && k.angle === st.angle && k.border === st.border && k.btex === st.btex && k.tone === st.tone) return this.spr;
    Object.assign(k, { kind, st, erase, band, d, rev, tex: st.tex, scale: st.scale, angle: st.angle, border: st.border, btex: st.btex, tone: st.tone });
    const key = `${kind}|${st.tex}|${st.scale}|${st.angle}|${st.border}|${st.btex}|${st.bscale}|${st.bangle}|${st.tone}|${st.toneAmt}|${st.tint}|${erase ? 1 : 0}|${band ? 1 : 0}|${d}|${rev}`;
    let sp = this.sprites.get(key);
    if (sp) { this.sprites.delete(key); this.sprites.set(key, sp); return (this.spr = sp); }
    const sr = (CHIP_CSS / 2) * d, sry = sr * (HH / HW), thick = thickOf(sry, d), pad = Math.ceil(3 * d + 2);
    const make = this.env.canvas ?? domCanvas;
    const c = make(Math.ceil(2 * sr + 2 * pad), Math.ceil(2 * sry + thick + 2 * pad)), g = c.getContext('2d');
    if (g) paintPuck(g, st, kind, erase, band, CHIP_R, sr, sry, thick, pad, d, this.env.texture);
    const sh = make(Math.ceil(2 * sr * 1.3 + 4), Math.ceil(2 * sry * 1.3 + 4)), gs = sh.getContext('2d');
    if (gs) paintShadow(gs, sr, sry);
    sp = { key, c, sh, rx: sr, ry: sry, thick, pad };
    this.stats.sprites++;
    this.sprites.set(key, sp);
    if (this.sprites.size > SPRITE_CACHE) this.sprites.delete(this.sprites.keys().next().value!);
    return (this.spr = sp);
  }

  /** a splash at tile (x, y) for a brush of radius r: course-fx's particles in the look's material, and the ripple when ring */
  private splash(x: number, y: number, r: number, look: Look, now: number, ring: boolean) {
    if (this.bursts.length >= MAX_BURSTS) this.bursts.shift();
    // course-fx throws each particle out along the direction it starts in; it starts here on the dab's rim instead (the dirt flies out
    // from the footprint's edge), so its offset becomes a point on the unit rim and the flight starts from there
    const parts = spawnSplash(this.seed++, 0, 0, 1, look.splash), rim = new Float32Array(parts.length * 2);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!, a = Math.atan2(2 * p.y, p.x);
      rim[2 * i] = 0.95 * Math.cos(a); rim[2 * i + 1] = 0.95 * Math.sin(a); p.x = 0; p.y = 0;
    }
    this.bursts.push({ x, y, t0: now, r, parts, rim, ring, col: look.core });
  }
  /** steps and draws the live splashes (light: half strength); drops the finished ones in place */
  private drawBursts(ctx: CanvasRenderingContext2D, v: CursorView, now: number, dt: number) {
    const ze = v.ze, d = v.dpr, B = this.bursts;
    let j = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < B.length; i++) {
      const b = B[i]!, t = now - b.t0;
      if (t > BURST_MS) continue;
      B[j++] = b;
      stepSplash(b.parts, dt * 1000);
      const gx = ((b.x - b.y) * HW - v.camX) * ze + v.cw / 2, gy = ((b.x + b.y) * HH - v.camY) * ze + v.ch / 2;
      const rx = Math.max(b.r * SQ2 * HW * ze, 7 * d), ry = rx * (HH / HW), k = clamp(rx / (40 * d), 0.8, 2.2) * d;
      if (b.ring && t < RIPPLE_MS) {
        const u = t / RIPPLE_MS, e = 1 - (1 - u) * (1 - u) * (1 - u), sc = 0.5 + 1.1 * e;
        ctx.beginPath(); ctx.ellipse(gx, gy, rx * sc, ry * sc, 0, 0, Math.PI * 2);
        ctx.strokeStyle = b.col; ctx.globalAlpha = 0.45 * (1 - u) * (1 - u); ctx.lineWidth = (2 - 1.2 * u) * d; ctx.stroke();
      }
      for (let n = 0; n < b.parts.length; n++) {
        const p = b.parts[n]!;
        if (p.dead) continue;
        ctx.globalAlpha = 0.6 * clamp(p.lifeMs / p.maxLifeMs, 0, 1); ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(gx + b.rim[2 * n]! * rx + p.x * k, gy + b.rim[2 * n + 1]! * ry + p.y * k, p.size * k * 0.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    B.length = j;
    ctx.globalAlpha = 1;
  }
}

/** a DOM canvas (the default sprite canvas) */
function domCanvas(w: number, h: number): SpriteCanvas { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

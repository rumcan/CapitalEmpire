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
// T118 (plan P23 4.9, P1-C): the chip says what a click lays.
// - a mark per surface, so surfaces read without colour (MARKS): a flag for green, mowing stripes for fairway, a ball on its tee peg for tee,
//   a tuft for rough, wisps for fescue, grains for bunker, pebbles for waste, ripples for water, lanes for a cart path; light glyphs on a small
//   dark badge at the disc's upper right (BADGE, paintBadge), outside its top face: T138, the owner, 2026-10-26: the face is the preview of the
//   texture and border a click lays, so nothing is drawn over it;
// - the states (CursorState): ready (the tint and a crisp edge), dragging, protected (dotted outline on the cells a higher surface keeps),
//   refused (muted red, hatched, a small ✕: off your land or on the driving range, landWhy's words), erase (a dashed edge in the colour you
//   get back; the chip is the surface you get back, a dashed line round it, outside its face), no change (outline only: nothing new to lay),
//   money short;
// - words: none by the disc at rest; only the drag total ("6 cells · $12"), a refusal with its reason, or money short sit beside it. The
//   hint pill (CourseCursor.hint) says what a click does ("Painting Fairway · Hole 1 · $2 a cell", or "starts Hole 2" when that hole has
//   nothing yet), then the state's words; the App adds the switch and stop keys (1–7, Esc) and the same disc mark (ui/course/SurfaceMark).
// T125: Rub out takes every course surface under the brush back to rough (grass for the rough brush): the dashed footprint is exactly the
//   cells it takes back, the cells the land refuses (off your land, the driving range) are hatched as when painting, and the pill reads
//   "Rub out · 16 cells back to rough".
// Speed: the chip and its shadow are sprites cached per look and dpr (the chip's size never changes with the zoom); a footprint is worked out
// once per cell the dab sits on and its outline once per shape (LRU, by its cells relative to the anchor cell); the grid's fade is one cached
// gradient. A frame where the pointer stays in its cell allocates nothing.
// Pure geometry and canvas calls (the canvas factory and the photo source come in), importable from node tests. Units: tiles of 2 m for
// the map, device px on screen.
import { CELL_T, SURF, fillPolygon, makeGrid, paintDisc, type Grid } from '../course-grid';
import { drawRefusedCross, HATCH_LIGHT, strokeHatch } from '../refused-mark';
import { spawnSplash, stepSplash, type SplashKind, type SplashParticle } from '../course-fx';
import { HH, HW } from '../../iso';
import { CAST, castShear } from '../../cast-shadow';
import { DARK_RGB, edgeProfileOf, type EdgeProfile } from '../../paint-edges';
import { BORDER_TEXES, borderW, roundCorners, type PaintArea } from '../../paint';
import { SURF_SURFACE, surfOfSurface } from '../course-grid/areas';
import { surfaceOfTex, unitBuildCost } from '../../golf/costs';
import { LAND_WHY, type PaintTool } from '../../paint-tool';
import { snapDab, squarePoly, squareStart } from './snap';
import { runCells, runLength } from './run';

export { snapDab, squarePoly, squareStart, SQUARE_SIZES } from './snap';

// ---- inputs ----

/** what the cursor reads from the Paint tool each frame (PaintTool fits it) */
export type CursorTool = Pick<PaintTool, 'mode' | 'brushKind' | 'brush' | 'rubOut' | 'rubHoleOnly' | 'cursor' | 'piece' | 'brushSquare' | 'strokeSpent' | 'strokeCells' | 'brushHole' | 'plantKind' | 'usedHoles' | 'runOn' | 'runPath' | 'runPts'>;
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
 *  PaintTool.brushCellCost; null outside a golf game); rev, a number that changes whenever those could (the grid's revision, the hole,
 *  Rub out); and money, the treasury (T118: the money-short state) */
export interface CursorEnv {
  canvas?: (w: number, h: number) => SpriteCanvas;
  texture?: CursorTexture | null;
  why?: (() => SkipWhy | null) | null;
  refuse?: (() => Refuse | null) | null;
  cost?: (() => CellCost | null) | null;
  rev?: () => number;
  money?: (() => number) | null;
  /** what the cells at tile (x, y) are besides a hole ('' for a hole: the course): a range start's practice area (T130) lays no hole, so the
   *  hint pill says what it builds there instead of the hole a click joins */
  zone?: ((x: number, y: number) => string) | null;
}

/** what a click would do (plan P23 4.9): ready to lay, protected (some cells keep a higher surface), refused (some cells cannot take the
 *  course: off your land, the driving range), erase, no change (nothing new to lay), or money short */
export type CursorStateKind = 'ready' | 'protected' | 'refused' | 'erase' | 'nochange' | 'short';
/** the cursor's state this frame (the tests read it): the kind, whether a stroke is being dragged, the words beside the disc (at most two
 *  lines; none at rest) and whether each line is a warning */
export interface CursorState { kind: CursorStateKind; dragging: boolean; label: string[]; bad: boolean[] }

/** the mark a surface's disc carries, so surfaces are told apart without colour (T118) */
export type MarkKind = 'flag' | 'stripes' | 'peg' | 'tufts' | 'wisps' | 'grains' | 'pebbles' | 'ripples' | 'lanes' | 'none';
export const MARKS: Readonly<Record<string, MarkKind>> = {
  green: 'flag', fairway: 'stripes', tee: 'peg', rough: 'tufts', longGrass: 'wisps', fescue: 'wisps', bunker: 'grains', waste: 'pebbles', water: 'ripples', path: 'lanes', grass: 'none',
};
/** the mark of a brush kind's disc ('none' for plain grass and anything unknown) */
export const markOf = (kind: string): MarkKind => MARKS[kind] ?? 'none';
/** the name a surface goes by in the words (the hint pill, the labels) */
const NAMES: Readonly<Record<string, string>> = { fairway: 'Fairway', green: 'Green', tee: 'Tee', rough: 'Rough', longGrass: 'Long grass', fescue: 'Fescue', bunker: 'Bunker', waste: 'Waste', water: 'Water', path: 'Cart path', grass: 'Grass' };
const nameOf = (kind: string) => NAMES[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
/** a skip reason that refuses the cell outright (off your land, the driving range's plot, off the grid) rather than keeping a higher surface */
const REFUSALS = new Set<string>([...Object.values(LAND_WHY), 'Off the course land', 'Skipped']);
export const isRefusal = (why: string): boolean => REFUSALS.has(why);

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
/** how often (ms) the cursor asks again whether the brush's hole is still new (the grid's areas arrive from a worker) */
const HOLE_RECHECK_MS = 400;
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
  longGrass: { glow: '#b8d86a', core: '#f6ffde', fill: '#8fae4c', wall: 'turf', splash: 'dirt', surf: SURF.longGrass }, // T238
  fescue: { glow: '#ecd97a', core: '#fff8de', fill: '#d6c063', wall: 'turf', splash: 'dirt', surf: SURF.fescue },
  bunker: { glow: '#ffd98f', core: '#fff7e2', fill: '#f2cf8a', wall: 'sand', splash: 'sand', surf: SURF.bunker },
  waste: { glow: '#f3cf94', core: '#fff4e0', fill: '#e2bf86', wall: 'sand', splash: 'sand', surf: SURF.waste },
  water: { glow: '#7fd6ff', core: '#e8f8ff', fill: '#5fb8ec', wall: 'water', splash: 'water', surf: SURF.water },
  path: { glow: '#ffcf9a', core: '#fff2e2', fill: '#e8b884', wall: 'soil', splash: 'dirt', surf: 0 },
};
/** plain grass: what rubbing out rough gives back (T118: the erase footprint and chip show the colour you get back) */
const GRASS: Look = { glow: '#a6e07a', core: '#f0fbe2', fill: '#86c25a', wall: 'turf', splash: 'dirt', surf: 0 };
/** each brush kind's tint (the footprint's fill): the UI's small disc icons (the hint pill, the surface chips) use the same colours */
export const SURFACE_TINT: Readonly<Record<string, string>> = { ...Object.fromEntries(Object.entries(LOOKS).map(([k, l]) => [k, l.fill])), grass: GRASS.fill };
/** the refused cells' muted red: tint, edge and hatch; the ✕ badge's red */
const SKIP_FILL = '#c8604f', SKIP_EDGE = '#f0a090', HATCH = HATCH_LIGHT;
/** the footprint's tint and edge strengths, and the dark line under the edge that keeps it crisp on a light surface */
const TINT_A = 0.26, SKIP_A = 0.22, EDGE_A = 0.9, UNDER = 'rgba(12,18,8,0.42)';
/** the kept cells' dotted outline (protected: a higher surface stays on top) */
const KEPT_DOT = 'rgba(255,253,236,0.95)';
/** the labels beside the disc: their text colours (plain, warning) and the warning pill's border */
const LABEL_COL = '#f4f1e6', LABEL_BAD = '#ffb8a8', LABEL_BAD_EDGE = 'rgba(240,110,90,0.85)';
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
  /** why most of the skipped cells are skipped ('' when none are) */
  why: string;
  /** the skipped cells split (T118): kept (a higher surface stays on top: protected) and refused (off your land, the driving range), as
   *  (dx, dy) pairs, their outline loops and each set's main reason */
  kept: Int16Array; keptLoops: Float32Array[]; whyKept: string;
  refused: Int16Array; refusedLoops: Float32Array[]; whyRefused: string;
  /** the refused cell the ✕ sits on (the one nearest the anchor cell; dx, dy), meaningful when refused is not empty */
  xdx: number; xdy: number;
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

/** a cell box bigger than this (cells) keeps its outline's cells and edges in maps instead of arrays over the box (T122: a long diagonal run's
 *  box is far bigger than its cells) */
const SPARSE_AREA = 1 << 15;
/** the outline of a set of cells ((dx, dy) pairs) along the cell edges: closed loops of (x, y) pairs in tiles from cell (0, 0)'s corner, each
 *  edge between a cell in the set and one outside it used once, straight runs merged into one segment; cells that touch only at a corner
 *  are joined there (one loop through the corner, which fills and strokes the same). sparse: keep the cells and edges in maps (the same
 *  loops; default: when the cells' box is over SPARSE_AREA) */
export function cellOutline(cells: Int16Array, sparse?: boolean): Float32Array[] {
  const n = cells.length >> 1; if (!n) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < cells.length; i += 2) { const x = cells[i]!, y = cells[i + 1]!; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  // the cells on a grid with a free border, and each vertex's (at most two) outgoing edges, clockwise round each cell (y down)
  const W = x1 - x0 + 3, H = y1 - y0 + 3, VW = W + 1, big = sparse ?? W * H > SPARSE_AREA;
  const occ = big ? null : new Uint8Array(W * H), occS = big ? new Set<number>() : null;
  const out = big ? null : new Int32Array(VW * (H + 1) * 2).fill(-1), outM = big ? new Map<number, number>() : null, verts: number[] = [];
  const at = (k: number): number => (out ? out[k]! : outM!.get(k) ?? -1);
  const set = (k: number, v: number) => { if (out) out[k] = v; else if (v < 0) outM!.delete(k); else outM!.set(k, v); };
  const has = (k: number) => (occ ? occ[k] === 1 : occS!.has(k));
  const keys: number[] = [];
  for (let i = 0; i < cells.length; i += 2) { const k = (cells[i + 1]! - y0 + 1) * W + cells[i]! - x0 + 1; if (occ) occ[k] = 1; else if (!occS!.has(k)) { occS!.add(k); keys.push(k); } }
  const add = (a: number, b: number) => { const k = 2 * a; if (at(k) < 0) { set(k, b); if (!out) verts.push(a); } else set(k + 1, b); };
  let edges = 0;
  const edgesOf = (y: number, x: number) => {
    const c = y * W + x, tl = y * VW + x, tr = tl + 1, bl = tl + VW, br = bl + 1;
    if (!has(c - W)) { add(tl, tr); edges++; }
    if (!has(c + 1)) { add(tr, br); edges++; }
    if (!has(c + W)) { add(br, bl); edges++; }
    if (!has(c - 1)) { add(bl, tl); edges++; }
  };
  // the cells in row order (the loops start at the same vertices either way)
  if (occ) { for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (occ[y * W + x]) edgesOf(y, x); }
  else { keys.sort((a, b) => a - b); for (const k of keys) { const x = k % W; edgesOf((k - x) / W, x); } verts.sort((a, b) => a - b); }
  const loops: Float32Array[] = [], pts: number[] = [];
  const take = (v: number): number => { const k = 2 * v; let b = at(k + 1); if (b >= 0) { set(k + 1, -1); return b; } b = at(k); set(k, -1); return b; };
  const starts = out ? out.length >> 1 : verts.length;
  for (let q = 0; q < starts && edges > 0; q++) {
    const s = out ? q : verts[q]!;
    while (at(2 * s) >= 0 || at(2 * s + 1) >= 0) {
      pts.length = 0;
      let v = s;
      do {
        const w = take(v); edges--;
        const vx = v % VW, vy = (v - vx) / VW, wx = w % VW, wy = (w - wx) / VW, m = pts.length;
        // a straight run goes on: the last point moves instead of a new one
        if (m >= 4 && (pts[m - 2]! - pts[m - 4]!) * (wy - vy) === (pts[m - 1]! - pts[m - 3]!) * (wx - vx) && (pts[m - 2]! - pts[m - 4]!) * (wx - vx) + (pts[m - 1]! - pts[m - 3]!) * (wy - vy) > 0) { pts[m - 2] = wx; pts[m - 1] = wy; }
        else { if (!m) pts.push(vx, vy); pts.push(wx, wy); }
        v = w;
      } while (v !== s && (at(2 * v) >= 0 || at(2 * v + 1) >= 0));
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

/** a shape from its cells and skipped cells (with their reason ids): the outlines, the main reason, and the skipped cells split into the
 *  kept and the refused ones (each with its outline and main reason) */
function makeShape(cells: Int16Array, skip: Int16Array, why: Uint8Array | null, hash: number): Shape {
  const count = new Uint32Array(256), kc: number[] = [], rc: number[] = [];
  let xdx = 0, xdy = 0, xd = Infinity;
  if (why) for (let i = 0; i < why.length; i++) {
    const id = why[i]!, dx = skip[2 * i]!, dy = skip[2 * i + 1]!;
    count[id]++;
    if (isRefusal(REASONS[id] ?? '')) {
      rc.push(dx, dy);
      const dd = (dx + 0.5) * (dx + 0.5) + (dy + 0.5) * (dy + 0.5); if (dd < xd) { xd = dd; xdx = dx; xdy = dy; }
    } else kc.push(dx, dy);
  }
  let best = 0, bestK = 0, bestR = 0;
  for (let k = 1; k < 256; k++) {
    if (!count[k]) continue;
    if (count[k]! > count[best]!) best = k;
    if (isRefusal(REASONS[k] ?? '')) { if (count[k]! > count[bestR]!) bestR = k; } else if (count[k]! > count[bestK]!) bestK = k;
  }
  const kept = Int16Array.from(kc), refused = Int16Array.from(rc);
  return {
    cells, skip, loops: cellOutline(cells), why: REASONS[best] ?? '', hash, xdx, xdy,
    kept, keptLoops: cellOutline(kept), whyKept: REASONS[bestK] ?? '', refused, refusedLoops: cellOutline(refused), whyRefused: REASONS[bestR] ?? '',
  };
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
  /** what a click on the last footprint costs ($; -1: no price, outside a golf game), how many cells it paints, and how many of them it
   *  changes (T118: 0 is the "no change" state; without a price every painted cell counts) */
  price = -1; count = 0; fresh = 0;
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
    this.count = n; this.price = cc ? 0 : -1; this.fresh = cc ? 0 : n;
    if (cc) for (let k = 0; k < n; k++) { const i = idx[k]!, cx = i % g.w, p = cc(g.x0 + (cx + 0.5) * CELL_T, g.y0 + ((i - cx) / g.w + 0.5) * CELL_T); this.price += p; if (p > 0) this.fresh++; }
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

/** a run's footprint (T122): the cells run.ts's runCells lays along a path (the bends' middles, then where the next click lands; tiles) with
 *  the n-cell square brush, split by the brush rules into the cells it paints and the ones it skips, priced, as Footprints does a dab; worked
 *  out again only when the path, the size, the surface or rev change. The shape is relative to the run's top left cell (ax, ay) */
export class RunFootprint {
  shape: Shape | null = null;
  ax = 0; ay = 0;
  /** as Footprints: whether the course grid's rules ran, the price ($; -1: none), the cells it paints and how many of them it changes */
  grid = false; price = -1; count = 0; fresh = 0;
  /** footprints worked out (the tests read it) */
  runs = 0;
  private kp: number[] = []; private kn = -1; private ks = -1; private krev = -1;
  at(path: readonly number[], n: number, surf: number, why?: (() => SkipWhy | null) | null, rev = 0, refuse?: (() => Refuse | null) | null, cost?: (() => CellCost | null) | null): Shape {
    const kp = this.kp;
    if (this.shape && n === this.kn && surf === this.ks && rev === this.krev && path.length === kp.length && path.every((v, i) => v === kp[i])) return this.shape;
    kp.length = 0; for (const v of path) kp.push(v);
    this.kn = n; this.ks = surf; this.krev = rev; this.runs++;
    let test = why?.() ?? null;
    if (!test) { const rf = refuse?.() ?? null; if (rf) test = (a, b) => (rf(a, b) ? 'Skipped' : ''); }
    this.grid = !!test;
    const cells = runCells(path, n), cc = cost?.() ?? null;
    let ax = 0, ay = 0;
    if (cells.length) { ax = Infinity; ay = Infinity; for (let k = 0; k < cells.length; k += 2) { if (cells[k]! < ax) ax = cells[k]!; if (cells[k + 1]! < ay) ay = cells[k + 1]!; } }
    const paint: number[] = [], skip: number[] = [], sw: number[] = [];
    let price = cc ? 0 : -1, fresh = 0, h = 2166136261 ^ (surf * 97 + n);
    for (let k = 0; k < cells.length; k += 2) {
      const cx = cells[k]!, cy = cells[k + 1]!, x = (cx + 0.5) * CELL_T, y = (cy + 0.5) * CELL_T, dx = cx - ax, dy = cy - ay, r = test ? test(x, y) : '';
      if (r) { const id = reasonId(r); skip.push(dx, dy); sw.push(id); h = Math.imul(h ^ ((dx & 0xffff) | (dy << 16)) ^ (id << 24), 16777619); continue; }
      paint.push(dx, dy); h = Math.imul(h ^ ((dx & 0xffff) | (dy << 16)), 16777619);
      if (cc) { const p = cc(x, y); price += p; if (p > 0) fresh++; }
    }
    this.ax = ax; this.ay = ay; this.price = price; this.count = paint.length >> 1; this.fresh = cc ? fresh : this.count;
    return (this.shape = makeShape(Int16Array.from(paint), Int16Array.from(skip), Uint8Array.from(sw), h));
  }
}

// ---- the chip sprite (the 3D surface disc, T081's puck art) ----

/** a cached puck: the sprite (top face centre at (pad + rx, top + pad + ry), the wall below it; top: room above for the mark's badge), its contact shadow, and the sizes it was drawn at */
interface Sprite { key: string; c: SpriteCanvas; sh: SpriteCanvas; rx: number; ry: number; thick: number; pad: number; top: number }

/** the wall's thickness for a puck ry device px tall */
const thickOf = (ry: number, d: number) => clamp(0.3 * ry, 4 * d, 15 * d);

const rgba = (c: readonly number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
/** the puck's own shade: DARK_RGB (the ground's one cool shade, T110) multiplied over its pixels, SHADE_GAIN times the alpha it had with the
 *  old darker rim colour (as dark in green) */
const SHADE_GAIN = 1.47, shade = (a: number) => rgba(DARK_RGB, Math.min(1, a * SHADE_GAIN));
/** the contact shadow and foot line laid over the game (another canvas: no multiply there), near-black so their alpha darkens the ground
 *  in proportion and its texture stays (the old cast-shadow colour) */
const CONTACT_RGB = [14, 10, 34] as const;
/** the warm tint of the puck's textured light (renderer.ts SHINE_TINT) and its gap inside an edge and the ramp after it, device px per css px
 *  (T110) */
const PUCK_SHINE = 'rgb(255,232,176)', PUCK_GAP = 1.2, PUCK_RAMP = 0.8;
let shineBuf: OffscreenCanvas | HTMLCanvasElement | null = null, maskBuf: OffscreenCanvas | HTMLCanvasElement | null = null;
/** a scratch canvas at least w x h (null where there is none to make: the headless tests' stub contexts, which then go without the shine) */
const scratch = (c: OffscreenCanvas | HTMLCanvasElement | null, w: number, h: number) => (c && c.width >= w && c.height >= h ? c
  : typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : null);
/** a light laid on g textured by what g already holds (the owner's rule T110): each px gains its own colour squared times `tint` and k,
 *  through the alpha `mask` draws (in g's canvas px, into a cleared buffer: it may clip), so mid-tones and lit tips brighten and dark gaps
 *  stay dark, and nothing lands where g is clear; never a flat screen wash */
function shineOn(g: CanvasRenderingContext2D, tint: string, k: number, mask: (m: CanvasRenderingContext2D) => void) {
  const w = g.canvas.width, h = g.canvas.height;
  shineBuf = scratch(shineBuf, w, h); maskBuf = scratch(maskBuf, w, h); if (!shineBuf || !maskBuf) return;
  const m = shineBuf.getContext('2d') as CanvasRenderingContext2D | null, k2 = maskBuf.getContext('2d') as CanvasRenderingContext2D | null; if (!m || !k2) return;
  k2.save(); k2.setTransform(1, 0, 0, 1, 0, 0); k2.globalAlpha = 1; k2.globalCompositeOperation = 'source-over'; k2.clearRect(0, 0, maskBuf.width, maskBuf.height); mask(k2); k2.restore();
  m.save(); m.setTransform(1, 0, 0, 1, 0, 0); m.globalAlpha = 1; m.globalCompositeOperation = 'source-over'; m.clearRect(0, 0, shineBuf.width, shineBuf.height);
  m.drawImage(g.canvas, 0, 0);
  m.globalCompositeOperation = 'multiply'; m.drawImage(g.canvas, 0, 0); m.fillStyle = tint; m.fillRect(0, 0, w, h);
  // only where g holds the puck (a multiply over clear px makes them the tint), then only through the mask
  m.globalCompositeOperation = 'destination-in'; m.drawImage(g.canvas, 0, 0); m.drawImage(maskBuf, 0, 0);
  m.restore();
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter';
  for (let left = k; left > 0.01; left -= 1) { g.globalAlpha = Math.min(1, left); g.drawImage(shineBuf, 0, 0, w, h, 0, 0, w, h); }
  g.restore();
}

/** paints a puck sprite for a brush of R tiles whose top face is rx, ry device px across (so s = rx / (R sqrt2 HW) device px per world px:
 *  the map scale it was bucketed at): the wall, the top face in the brush's photo with its tone and border band, the sun's light and shade,
 *  the rim lights, then outside the face erase's dashed line and the surface's mark on its badge (T138: nothing over the face) */
function paintPuck(g: CanvasRenderingContext2D, st: PuckStyle, kind: string, erase: boolean, withBand: boolean, R: number, rx: number, ry: number, thick: number, pad: number, d: number, tex: CursorTexture | null | undefined, top = 0) {
  const cx = pad + rx, cy = top + pad + ry, look = LOOKS[kind] ?? LOOKS.fairway!, s = rx / (R * SQ2 * HW), E = R + 2, mark = markOf(kind);
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
  hg.addColorStop(0, shade(0.62)); hg.addColorStop(0.45, shade(0.18)); hg.addColorStop(1, shade(0));
  g.globalCompositeOperation = 'multiply'; g.fillStyle = hg; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  // the foot's own shade (ambient occlusion where the wall meets the ground), multiplied in the shade
  const vg = g.createLinearGradient(0, cy + ry * 0.4, 0, cy + ry + thick);
  vg.addColorStop(0, shade(0)); vg.addColorStop(1, shade(0.55));
  g.globalCompositeOperation = 'multiply'; g.fillStyle = vg; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  g.globalCompositeOperation = 'source-over'; g.restore();
  // the sun on the wall's right: a light textured by the wall's own soil or sand (T110), inside the wall
  shineOn(g, PUCK_SHINE, 1.4, m => {
    const lg = m.createLinearGradient(cx - rx, 0, cx + rx, 0);
    lg.addColorStop(0.5, 'rgba(255,255,255,0)'); lg.addColorStop(0.9, 'rgba(255,255,255,0.5)'); lg.addColorStop(1, 'rgba(255,255,255,0.32)');
    m.beginPath(); m.ellipse(cx, cy, rx, ry, 0, 0, Math.PI); m.lineTo(cx - rx, cy + thick); m.ellipse(cx, cy + thick, rx, ry, 0, Math.PI, 0, true); m.closePath();
    m.fillStyle = lg; m.fill();
  });
  // the foot's contact line
  g.beginPath(); g.ellipse(cx, cy + thick, rx, ry, 0, 0, Math.PI); g.strokeStyle = rgba(CONTACT_RGB, 0.5); g.lineWidth = Math.max(1, 1.1 * d); g.stroke();

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
  //      T110: the light is a shine textured by the face's own photo (its mid-tones and lit tips, never its dark gaps), a small gap inside
  //      the edge; the shade multiplied in the cool shade
  const ux = SUN_X * rx, uy = SUN_Y * ry, gap = PUCK_GAP * d, ramp = PUCK_RAMP * d;
  const rimW = Math.max(2 * d, 0.36 * ry);
  const sunAxis = (c: CanvasRenderingContext2D) => c.createLinearGradient(cx + (sunk ? -ux : ux), cy + (sunk ? -uy : uy), cx - (sunk ? -ux : ux), cy - (sunk ? -uy : uy));
  const face = (c: CanvasRenderingContext2D, ex = 0) => { c.beginPath(); c.ellipse(cx, cy, Math.max(1, rx - ex), Math.max(1, ry - (ex * ry) / rx), 0, 0, Math.PI * 2); };
  /** cuts the gap inside the face's edge out of a mask: nothing within `gap`, half over the ramp after it */
  const inset = (m: CanvasRenderingContext2D) => {
    m.globalCompositeOperation = 'destination-out'; m.globalAlpha = 1;
    for (const [w, a] of [[gap + ramp, 0.5], [gap, 1]] as const) { m.strokeStyle = `rgba(0,0,0,${a})`; m.lineWidth = 2 * w; face(m); m.stroke(); }
  };
  g.save(); face(g); g.clip();
  const darkG = sunAxis(g);
  darkG.addColorStop(0, shade(0)); darkG.addColorStop(0.55, shade(0)); darkG.addColorStop(1, shade(da));
  g.globalCompositeOperation = 'multiply'; g.strokeStyle = darkG;
  for (let k = 1; k <= 3; k++) { g.globalAlpha = 0.45; g.lineWidth = (rimW * 2 * k) / 3; face(g); g.stroke(); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.restore();
  shineOn(g, PUCK_SHINE, 1.6, m => {
    m.save(); face(m); m.clip();
    // the light rim on the sun's side (its band as before, the gap cut out below) and a soft sheen toward the sun
    const lightG = sunAxis(m);
    lightG.addColorStop(0, `rgba(255,255,255,${la})`); lightG.addColorStop(0.42, 'rgba(255,255,255,0)'); lightG.addColorStop(1, 'rgba(255,255,255,0)');
    m.strokeStyle = lightG; for (let k = 1; k <= 3; k++) { m.globalAlpha = 0.45; m.lineWidth = (rimW * 2 * k) / 3; face(m); m.stroke(); }
    m.globalAlpha = 1; m.setTransform(1, 0, 0, ry / rx, 0, cy - (cy * ry) / rx);
    const sheen = m.createRadialGradient(cx + 0.35 * ux, cy + (0.35 * uy * rx) / ry, 0, cx + 0.35 * ux, cy + (0.35 * uy * rx) / ry, rx * 1.05);
    sheen.addColorStop(0, `rgba(255,255,255,${sunk ? 0.06 : 0.16})`); sheen.addColorStop(1, 'rgba(255,255,255,0)');
    m.globalCompositeOperation = 'lighter'; m.fillStyle = sheen; m.fillRect(0, 0, m.canvas.width, (m.canvas.height * rx) / ry);
    m.setTransform(1, 0, 0, 1, 0, 0);
    // ---- the rim: the top edge catches the sun on the right and fades to the left; the far edge glints up right (a gap inside the edge)
    const eg = m.createLinearGradient(cx - rx, 0, cx + rx, 0);
    eg.addColorStop(0, 'rgba(255,255,255,0.12)'); eg.addColorStop(0.65, 'rgba(255,255,255,0.45)'); eg.addColorStop(1, 'rgba(255,255,255,0.85)');
    m.globalCompositeOperation = 'lighter'; m.strokeStyle = eg; m.lineWidth = Math.max(1, 1.1 * d);
    const ex = gap + ramp + m.lineWidth / 2;
    m.beginPath(); m.ellipse(cx, cy, rx - ex, ry - (ex * ry) / rx, 0, 0, Math.PI); m.stroke();
    m.beginPath(); m.ellipse(cx, cy, rx - ex, ry - (ex * ry) / rx, 0, -Math.PI * 0.62, -Math.PI * 0.02); m.globalAlpha = 0.7; m.stroke(); m.globalAlpha = 1;
    inset(m); m.restore();
  });

  // ---- rub out (T118): the puck is the surface you get back, with a dashed line round it (one meaning per line style: dashed = erase); T138:
  //      the line runs outside the face (its back edge, down its sides and along its foot), so the preview stays clear
  const u = rx / (CHIP_CSS / 2);
  if (erase) {
    const o = ERASE_GAP * u, a = rx + o, b = ry + o;
    g.setTransform(1, 0, 0, 1, 0, 0); g.setLineDash([3 * u, 2.2 * u]); g.lineCap = 'butt';
    g.beginPath(); g.ellipse(cx, cy, a, b, 0, Math.PI, Math.PI * 2); g.lineTo(cx + a, cy + thick); g.ellipse(cx, cy + thick, a, b, 0, 0, Math.PI); g.closePath();
    g.strokeStyle = 'rgba(12,16,10,0.7)'; g.lineWidth = 2.4 * u; g.stroke();
    g.strokeStyle = '#fff6ee'; g.lineWidth = 1.2 * u; g.stroke();
    g.setLineDash([]); g.lineCap = 'round';
  }
  // ---- the surface's mark on its badge, at the upper right outside the face
  paintBadge(g, mark, cx + BADGE.dx * u, cy + BADGE.dy * u, u);
}

/** the mark's badge (T138): its centre from the top face's centre and its radius, css px at the chip's CHIP_CSS (they scale with the chip):
 *  at the face's upper right, outside it with a gap of about 2 px (the face is the preview), clear of the pointer at the upper left and of
 *  the words, which start 8 px right of the face */
export const BADGE = { dx: 17, dy: -16.5, r: 7 } as const;
/** erase's dashed line: how far outside the face's edge it runs, css px */
const ERASE_GAP = 2;
/** the badge's dark fill and light ring (dark as the words' pills) */
const BADGE_FILL = 'rgba(22,20,24,0.88)', BADGE_RING = 'rgba(255,246,236,0.85)';
/** point i of n on a sunflower spiral inside the unit disc (an even scatter with no clumps), into out */
function sunflower(i: number, n: number, out: { x: number; y: number }) {
  const r = Math.sqrt((i + 0.5) / n), a = i * 2.399963; out.x = r * Math.cos(a); out.y = r * Math.sin(a);
}
const SPOT = { x: 0, y: 0 };

/** paints a surface's mark on its badge, a small dark disc of BADGE.r css px centred at (X, Y) device px (u: device px a css px), every
 *  glyph inside it: a flag (green), mowing stripes (fairway), a ball on its tee peg (tee), a tuft (rough), wisps (fescue), grains (bunker),
 *  pebbles (waste), ripples (water), lanes (a cart path); light on the dark disc, so each reads at 14 px and in every colour-blind view.
 *  Nothing for plain grass ('none') */
export function paintBadge(g: CanvasRenderingContext2D, mark: MarkKind, X: number, Y: number, u: number) {
  if (mark === 'none') return;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.setLineDash([]); g.lineCap = 'round'; g.lineJoin = 'round';
  const r = BADGE.r * u, ri = r - 1.6 * u;
  g.beginPath(); g.arc(X, Y, r - 0.5 * u, 0, Math.PI * 2); g.fillStyle = BADGE_FILL; g.fill(); g.strokeStyle = BADGE_RING; g.lineWidth = u; g.stroke();
  // the iso tile y axis on screen (a mowing line, a cart path), and a chord of the inner circle along it, o across its middle
  const L = Math.hypot(HW, HH), ax = -HW / L, ay = HH / L;
  const chord = (o: number) => { const h = Math.sqrt(Math.max(0, ri * ri - o * o)), px = X - ay * o, py = Y + ax * o; g.moveTo(px - ax * h, py - ay * h); g.lineTo(px + ax * h, py + ay * h); };
  switch (mark) {
    case 'flag': {
      // the pin: the hole, a white pole and a yellow pennant flying to the right
      const px = X - 1.2 * u, f0 = Y - 4.6 * u, f1 = Y - 1.4 * u;
      g.beginPath(); g.ellipse(px, Y + 4 * u, 2.3 * u, 0.95 * u, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(251,250,242,0.45)'; g.fill();
      g.beginPath(); g.moveTo(px, Y + 4 * u); g.lineTo(px, f0); g.strokeStyle = '#fbfaf2'; g.lineWidth = 1.2 * u; g.stroke();
      g.beginPath(); g.moveTo(px + 0.4 * u, f0); g.lineTo(X + 4.3 * u, (f0 + f1) / 2); g.lineTo(px + 0.4 * u, f1); g.closePath(); g.fillStyle = '#ffd23f'; g.fill();
      break;
    }
    case 'stripes': {
      // mowing stripes: three light bands along the mowing line
      g.beginPath(); for (const o of [-3.2, 0, 3.2]) chord(o * u);
      g.lineCap = 'butt'; g.strokeStyle = '#e4f4c0'; g.lineWidth = 1.8 * u; g.stroke();
      break;
    }
    case 'peg': {
      // the tee: a white ball on its peg
      g.beginPath(); g.moveTo(X - 1.3 * u, Y + 0.9 * u); g.lineTo(X + 1.3 * u, Y + 0.9 * u); g.lineTo(X + 0.5 * u, Y + 4.6 * u); g.lineTo(X - 0.5 * u, Y + 4.6 * u); g.closePath();
      g.fillStyle = '#e8dcc4'; g.fill();
      g.beginPath(); g.arc(X, Y - 1.5 * u, 2.5 * u, 0, Math.PI * 2); g.fillStyle = '#fdfdf9'; g.fill();
      break;
    }
    case 'tufts': {
      // rough: one tuft of three leaves on a wide base (grass, never an arrow)
      const x = X, y = Y + 3.6 * u, k = 1.15 * u;
      g.beginPath();
      g.moveTo(x - 1.9 * k, y); g.quadraticCurveTo(x - 2.3 * k, y - 2.6 * k, x - 3.5 * k, y - 4.4 * k); g.quadraticCurveTo(x - 1.4 * k, y - 2.9 * k, x - 0.7 * k, y); g.closePath();
      g.moveTo(x - 0.65 * k, y); g.quadraticCurveTo(x - 0.4 * k, y - 3.4 * k, x + 0.2 * k, y - 6.2 * k); g.quadraticCurveTo(x + 0.6 * k, y - 3.2 * k, x + 0.75 * k, y); g.closePath();
      g.moveTo(x + 0.8 * k, y); g.quadraticCurveTo(x + 1.6 * k, y - 2.7 * k, x + 3.5 * k, y - 4.2 * k); g.quadraticCurveTo(x + 2.3 * k, y - 2.3 * k, x + 2 * k, y); g.closePath();
      g.fillStyle = '#f4f0c4'; g.fill();
      break;
    }
    case 'wisps': {
      // fescue: a cluster of tall wispy blades with seed heads
      const x = X - 0.5 * u, y = Y + 4 * u, k = 0.72 * u, tips: number[] = [];
      g.beginPath();
      for (const [dx, h, bend] of [[-1.6, 9, -2.6], [-0.4, 11, -0.6], [0.8, 10, 2.2], [1.8, 8, 3.6]] as const) {
        const x1 = x + dx * k + bend * k, y1 = y - h * k;
        g.moveTo(x + dx * 0.4 * k, y); g.quadraticCurveTo(x + dx * 0.4 * k + bend * 0.15 * k, y - h * 0.6 * k, x1, y1); tips.push(x1, y1);
      }
      g.strokeStyle = '#fbeec4'; g.lineWidth = u; g.stroke();
      g.beginPath();
      for (let i = 0; i < tips.length; i += 2) { g.moveTo(tips[i]! + 0.85 * u, tips[i + 1]!); g.ellipse(tips[i]!, tips[i + 1]!, 0.85 * u, 1.25 * u, 0.4, 0, Math.PI * 2); }
      g.fillStyle = '#f6dc8a'; g.fill();
      break;
    }
    case 'grains': {
      // sand: an even stipple of light grains
      const n = 7;
      g.beginPath();
      for (let i = 0; i < n; i++) { sunflower(i, n, SPOT); const x = X + SPOT.x * 4.2 * u, y = Y + SPOT.y * 4.2 * u; g.moveTo(x + 0.95 * u, y); g.arc(x, y, 0.95 * u, 0, Math.PI * 2); }
      g.fillStyle = '#f0d9a0'; g.fill();
      break;
    }
    case 'pebbles': {
      // waste ground: a few stones, lit on the upper right
      const n = 4;
      g.beginPath();
      for (let i = 0; i < n; i++) { sunflower(i, n, SPOT); const x = X + SPOT.x * 3.3 * u, y = Y + SPOT.y * 3.3 * u; g.moveTo(x + 1.8 * u, y); g.ellipse(x, y, 1.8 * u, 1.2 * u, 0, 0, Math.PI * 2); }
      g.fillStyle = '#b4ad9e'; g.fill();
      g.beginPath();
      for (let i = 0; i < n; i++) { sunflower(i, n, SPOT); const x = X + SPOT.x * 3.3 * u + 0.6 * u, y = Y + SPOT.y * 3.3 * u - 0.4 * u; g.moveTo(x + 0.6 * u, y); g.arc(x, y, 0.6 * u, 0, Math.PI * 2); }
      g.fillStyle = 'rgba(255,250,236,0.9)'; g.fill();
      break;
    }
    case 'ripples': {
      // water: two short wave lines
      g.beginPath();
      for (const y0 of [Y - 1.7 * u, Y + 1.9 * u]) {
        const x0 = X - 4.5 * u;
        g.moveTo(x0, y0);
        for (let t = 1; t <= 16; t++) g.lineTo(x0 + (9 * u * t) / 16, y0 - Math.sin((t / 16) * Math.PI * 2) * 1.1 * u);
      }
      g.strokeStyle = '#eaf7ff'; g.lineWidth = 1.2 * u; g.stroke();
      break;
    }
    case 'lanes': {
      // a cart path: its two edges along the tile y axis and a dashed centre line
      g.beginPath(); chord(-2.6 * u); chord(2.6 * u);
      g.strokeStyle = '#fff4e4'; g.lineWidth = u; g.stroke();
      g.beginPath(); chord(0); g.setLineDash([1.3 * u, 1.5 * u]); g.lineCap = 'butt'; g.lineWidth = 0.9 * u; g.stroke(); g.setLineDash([]);
      break;
    }
  }
  g.restore();
}

/** paints the puck's soft contact shadow (an ellipse of half-axes rx, ry in the cast shadows' colour) centred on the canvas */
function paintShadow(g: CanvasRenderingContext2D, rx: number, ry: number) {
  const w = g.canvas.width, h = g.canvas.height;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
  g.setTransform(1, 0, 0, ry / rx, 0, (h / 2) * (1 - ry / rx));
  const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, rx * 1.15);
  rg.addColorStop(0, rgba(CONTACT_RGB, 0.62)); rg.addColorStop(0.55, rgba(CONTACT_RGB, 0.4)); rg.addColorStop(0.8, rgba(CONTACT_RGB, 0.14)); rg.addColorStop(1, rgba(CONTACT_RGB, 0));
  g.fillStyle = rg; g.fillRect(0, 0, w, h * (rx / ry));
  g.setTransform(1, 0, 0, 1, 0, 0);
}


// ---- the cursor ----

/** a splash: where (tiles), when, the brush radius (tiles), course-fx's particles (their flight in css px), where each starts on the
 *  dab's rim (unit circle, x y pairs), and whether it ripples */
interface Burst { x: number; y: number; t0: number; r: number; parts: SplashParticle[]; rim: Float32Array; ring: boolean; col: string }

/** the words' small formats: money ($1,234), a price a cell (1 m²: $2, $0.80), a count of cells, a reason with its first letter lowered */
const money$ = (v: number) => `$${Math.round(v).toLocaleString()}`;
const unit$ = (v: number) => `$${v % 1 ? v.toFixed(2) : v}`;
const cellsOf = (n: number) => `${n.toLocaleString()} cell${n === 1 ? '' : 's'}`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** what rubbing out a surface gives back on the course grid: rough, or plain grass for rough itself */
const backKind = (kind: string) => (kind === 'rough' ? 'grass' : 'rough');
const backLook = (kind: string): Look => (kind === 'rough' ? GRASS : LOOKS.rough!);

/** the brush's cursor: the footprint of the cells a click paints, the course grid round it and the surface chip beside the pointer, drawn
 *  on the engine's overlay each frame; it also keeps what a click would do (state) and the hint pill's words (hint) */
export class CourseCursor {
  /** the footprint cache (the tests read it) */
  readonly feet = new Footprints();
  /** Run's footprint (T122; the tests read it) */
  readonly runFeet = new RunFootprint();
  /** counters for the tests: chip sprites painted, gradients made */
  readonly stats = { sprites: 0, gradients: 0 };
  /** the chip's last drawn half-axes and the centre of its top face, device px, and whether it was drawn (the tests read them) */
  readonly last = { rx: 0, ry: 0, x: 0, y: 0, shown: false };
  /** what a click would do this frame and the words beside the disc (T118; none at rest) */
  readonly state: CursorState = { kind: 'ready', dragging: false, label: [], bad: [] };
  /** the hint pill's words for the brush in hand ('' with none): what a click does (the surface, the hole it joins or starts, the price a cell), then the state's own words */
  hint = '';
  /** counts the hint's changes (the engine re-renders the pill when it moves) */
  hintRev = 0;
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
  /** whether the last footprint laid on the course grid had a price (a golf game): the words show the price a cell */
  private golf = false;
  /** the erase chip's plain-grass style and the rough style it was made from */
  private backSt: PuckStyle | null = null; private backFrom: PuckStyle | null = null;
  /** the line dashes in device px, kept per dpr (a frame allocates none): kept cells' dots, erase's dashes, none */
  private dash = { d: 0, dot: [0.001, 3.6], dashed: [4, 3], none: [] as number[] };

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
    // Run (T122): the click laid a bend (Shift may have moved it off the pointer) and a run follows the Erase toggle only
    const P = tool.runOn() ? tool.runPts : null, k = P ? P.length : 0;
    this.pressed = true; this.pressAt = now; this.pressErase = tool.rubOut || (alt && !P);
    const n = tool.brushSquare(), r = n ? (n * CELL_T) / 2 : tool.brush[tool.brushKind].r;
    const x = k ? P![k - 2]! : n ? (squareStart(c.x, n) + n / 2) * CELL_T : snapDab(c.x), y = k ? P![k - 1]! : n ? (squareStart(c.y, n) + n / 2) * CELL_T : snapDab(c.y);
    this.splash(x, y, r, this.pressErase ? backLook(tool.brushKind) : LOOKS[tool.brushKind] ?? LOOKS.fairway!, now, true);
    this.trailX = x; this.trailY = y;
  }
  /** the press ends: the chip springs back up */
  release(now = performance.now()) { if (this.pressed) { this.pressed = false; this.releaseAt = now; } }

  /** draws the cursor for this frame; true when the chip is shown */
  draw(ctx: CanvasRenderingContext2D, v: CursorView, tool: CursorTool, now: number): boolean {
    const dt = this.t ? clamp((now - this.t) / 1000, 0, 0.1) : 0; this.t = now;
    const c = tool.cursor;
    let shown = false;
    if (tool.mode === 'brush' && c) shown = tool.runOn() ? this.drawRun(ctx, v, tool, c.x, c.y, now, dt) : this.drawBrush(ctx, v, tool, c.x, c.y, now, dt);
    else if (tool.mode === 'piece' && c && tool.piece) shown = this.drawPiece(ctx, v, tool, c.x, c.y, now, dt);
    else { this.have = false; this.pressed = false; this.atRest(tool); }
    this.drawBursts(ctx, v, now, dt);
    this.last.shown = shown;
    return shown;
  }

  /** no footprint this frame (the pointer is off the map): no words by the disc; the hint keeps the brush's own words */
  private atRest(tool: CursorTool) {
    const s = this.state; s.kind = 'ready'; s.dragging = false;
    this.zoneNow = '';
    if (tool.mode === 'brush' && tool.runOn()) this.runWords(tool, tool.rubOut ? 'erase' : 'ready', tool.runPts.length > 0, tool.rubOut, -1, 0, 0, '', '', -1, 0, runLength(tool.runPts, tool.brushSquare()), 0);
    else if (tool.mode === 'brush' || tool.mode === 'draw') this.words(tool, tool.rubOut && tool.mode === 'brush' ? 'erase' : 'ready', false, tool.rubOut && tool.mode === 'brush', -1, 0, 0, '', '', -1, 0);
    else { s.label.length = 0; s.bad.length = 0; this.setHint(''); }
  }
  private setHint(h: string) { if (h !== this.hint) { this.hint = h; this.hintRev++; } }
  /** whether the brush's hole has nothing yet (a stroke starts it), worked out again only when the grid, the hole or Rub out change (rev) */
  private holeRev = NaN; private holeNew = false; private holeAt = -Infinity;
  private isNewHole(tool: CursorTool): boolean {
    const rv = (this.env.rev?.() ?? 0) * 32 + tool.brushHole;
    // the engine's grid areas come back from a worker after the grid changed (T122: a run that starts a hole said "starts Hole 1" after it):
    // a hole still new is asked again at most every HOLE_RECHECK_MS
    if (rv !== this.holeRev || (this.holeNew && this.t - this.holeAt > HOLE_RECHECK_MS)) { this.holeRev = rv; this.holeAt = this.t; this.holeNew = !tool.usedHoles().has(tool.brushHole); }
    return this.holeNew;
  }

  /** the words' inputs at their last build (the words are built again only when one changes, so a still frame makes no string) */
  private wk = { kind: '', drag: false, erase: false, brush: '', mode: '', hole: 0, fresh: false, unit: 0, n: 0, kept: 0, ref: 0, whyK: '', whyR: '', price: 0, money: 0, cells: 0, spent: 0, grid: false, only: false, zone: '' };
  /** the zone under the pointer this frame (CursorEnv.zone; '' on the course) */
  private zoneNow = '';
  /** the state's words: the hint pill (what a click does: "Painting Fairway · Hole 1 · $2 a cell", or "starts Hole 2" when that hole has
   *  nothing yet, then the state's words) and the lines beside the disc (only the drag total, a refusal with its reason, or money short);
   *  n: the cells a click lays (-1: unknown), kept and ref: the cells it keeps and refuses with their main reasons, price: what it costs ($;
   *  -1: no price), money: the treasury */
  private words(tool: CursorTool, kind: CursorStateKind, drag: boolean, erase: boolean, n: number, kept: number, ref: number, whyK: string, whyR: string, price: number, money: number) {
    const brush = tool.brushKind, mode = tool.mode, hole = tool.brushHole, surf = LOOKS[brush]?.surf ?? 0, fresh = surf > 0 && this.isNewHole(tool);
    const unit = this.golf && !erase && surf > 0 ? unitBuildCost(SURF_SURFACE[surf] ?? 'other', tool.plantKind) : -1;
    const cells = drag ? tool.strokeCells : 0, spent = drag ? Math.round(tool.strokeSpent) : 0, m = kind === 'short' ? Math.round(money) : 0;
    const grid = this.feet.grid, only = !!tool.rubHoleOnly;
    const w = this.wk;
    const zone = this.zoneNow;
    if (w.kind === kind && w.drag === drag && w.erase === erase && w.brush === brush && w.mode === mode && w.hole === hole && w.fresh === fresh && w.unit === unit && w.n === n && w.kept === kept
      && w.ref === ref && w.whyK === whyK && w.whyR === whyR && w.price === price && w.money === m && w.cells === cells && w.spent === spent && w.grid === grid && w.only === only && w.zone === zone) return;
    w.zone = zone; w.kind = kind; w.drag = drag; w.erase = erase; w.brush = brush; w.mode = mode; w.hole = hole; w.fresh = fresh; w.unit = unit; w.n = n; w.kept = kept; w.ref = ref; w.whyK = whyK; w.whyR = whyR; w.price = price; w.money = m; w.cells = cells; w.spent = spent; w.grid = grid; w.only = only;
    const s = this.state, name = nameOf(brush), back = lower(nameOf(backKind(brush)));
    // the hole a click joins: a cart path belongs to no hole; a hole with nothing yet is started by the stroke
    const joins = surf > 0 ? (zone ? ` · ${zone}` : fresh ? ` · starts Hole ${hole}` : ` · Hole ${hole}`) : '', verb = mode === 'draw' ? 'Shaping' : 'Painting';
    // a rub out on the course grid (T125) takes every course surface under it back to rough (grass for the rough brush), whatever the brush
    const rub = erase && grid && surf > 0, rubBase = `Rub out${only ? ` · Hole ${hole} only` : ''}`;
    const base = rub ? rubBase : `${verb} ${name}${joins}${unit >= 0 ? ` · ${unit$(unit)} a cell` : ''}`;
    s.label.length = 0; s.bad.length = 0;
    // the drag total: the cells the stroke has laid and what they cost
    if (drag && cells > 0) { s.label.push(erase ? `${cellsOf(cells)} back to ${back}` : this.golf ? `${cellsOf(cells)} · ${money$(spent)}` : cellsOf(cells)); s.bad.push(false); }
    let hint = base;
    switch (kind) {
      case 'protected': hint = `${base} · ${cellsOf(kept)} kept: ${lower(whyK)}`; break;
      case 'refused': hint = `${base} · ${cellsOf(ref)} refused: ${lower(whyR)}`; break;
      case 'nochange': hint = rub ? `${rubBase} · nothing to rub out here` : `${verb} ${name}${joins} · already ${lower(name)} here${this.golf ? ' · $0' : ''}`; break;
      case 'erase': hint = rub ? `${rubBase} · ${n >= 0 ? `${cellsOf(n)} ` : ''}back to ${back}${this.golf ? ' · no refund' : ''}`
        : `Erasing ${lower(name)}${surf > 0 ? ` · Hole ${hole}` : ''}${n >= 0 ? ` · ${cellsOf(n)}` : ''}${surf > 0 ? ` back to ${back}` : ''}${this.golf ? ' · no refund' : ''}`; break;
      case 'short': hint = `${verb} ${name}${joins} · ${money$(price)} · you have ${money$(m)}`; break;
    }
    // a refusal with its reason, or money short, by the disc
    if (kind === 'short') { s.label.push(`${name} · ${money$(price)} · you have ${money$(m)}`); s.bad.push(true); }
    else if (ref > 0) { s.label.push(n > 0 ? `${cellsOf(ref)}: ${lower(whyR)}` : whyR); s.bad.push(true); }
    this.setHint(hint);
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

  /** the footprint, the grid and the chip for the brush with the pointer at tile (cx, cy): the dab sits on the half grid's nearest corner;
   *  the state (T118) follows from the footprint: refused and kept cells, a footprint that changes nothing, a price over the treasury */
  private drawBrush(ctx: CanvasRenderingContext2D, v: CursorView, tool: CursorTool, cx: number, cy: number, now: number, dt: number): boolean {
    const set = tool.brush[tool.brushKind], r = set.r, st = set.style, erase = this.pressed ? this.pressErase : tool.rubOut;
    const base = LOOKS[tool.brushKind] ?? LOOKS.fairway!, d = v.dpr, n = tool.brushSquare();
    // the dab's middle and size: the square brush's n x n cells (T109), or the round brush on the nearest cell corner (T108)
    const x = n ? (squareStart(cx, n) + n / 2) * CELL_T : snapDab(cx), y = n ? (squareStart(cy, n) + n / 2) * CELL_T : snapDab(cy), size = n ? (n * CELL_T) / 2 : r;
    this.zoneNow = this.env.zone?.(x, y) ?? '';
    this.drawGrid(ctx, v, x, y, size);
    const f = this.feet, fp = f.at(n ? cx : x, n ? cy : y, r, base.surf, this.env.why, (this.env.rev?.() ?? 0) * 2 + (tool.rubHoleOnly ? 1 : 0), this.env.refuse, n, this.env.cost);
    if (f.grid && !erase) this.golf = f.price >= 0;
    // on the course grid a rub out gives back rough (plain grass for rough): the footprint and the chip show what you get back; its cells are
    // exactly the ones it takes back (T125: every course surface), and the cells the land rules refuse show as refused, as when painting
    const grid = f.grid, look = erase ? (grid ? backLook(tool.brushKind) : base) : base;
    const nKept = grid && !erase ? fp.kept.length >> 1 : 0, nRef = grid ? fp.refused.length >> 1 : 0, price = f.price >= 0 ? Math.round(f.price) : -1;
    const money = this.env.money?.() ?? Infinity;
    let kind: CursorStateKind;
    if (!grid) kind = erase ? 'erase' : 'ready';
    else if (erase) kind = f.count ? 'erase' : nRef ? 'refused' : 'nochange';
    else if (price > 0 && money < price) kind = 'short';
    else if (nRef) kind = 'refused';
    else if (!f.fresh && !nKept && !this.pressed) kind = 'nochange'; // a drag lays the cells under the pointer itself: still "as ready"
    else if (nKept) kind = 'protected';
    else kind = 'ready';
    const s = this.state; s.kind = kind; s.dragging = this.pressed;
    this.words(tool, kind, this.pressed, erase, grid ? f.count : -1, nKept, nRef, nKept ? fp.whyKept : '', nRef ? fp.whyRefused : '', price, money);
    this.footprint(ctx, fp, f.ax * CELL_T, f.ay * CELL_T, v, look, kind, erase, grid);
    const ck = erase && grid ? backKind(tool.brushKind) : tool.brushKind;
    this.chip(ctx, v, cx, cy, ck, erase && grid ? this.backStyle(tool, ck) : st, erase, !grid, d, now, dt);
    // a stroke in progress splashes lightly as it travels
    if (this.pressed && Math.hypot(x - this.trailX, y - this.trailY) > Math.max(1.5, size)) { this.splash(x, y, size, look, now, false); this.trailX = x; this.trailY = y; }
    return true;
  }
  /** the style of the chip a rub out shows: the rough brush's own, or plain grass made from it (kept, so its sprite is reused) */
  private backStyle(tool: CursorTool, back: string): PuckStyle {
    const rough = (tool.brush as Record<string, { style: PuckStyle } | undefined>).rough?.style ?? tool.brush[tool.brushKind].style;
    if (back !== 'grass') return rough;
    if (this.backFrom !== rough || !this.backSt) { this.backFrom = rough; this.backSt = { ...rough, tex: 'grass', border: 0, tone: 0 }; }
    return this.backSt;
  }

  /** Run (T122, plan P23 4.5): the strip a finished run lays from its first bend to where the next click lands (the brush's tint, edge and
   *  states, worked out once per change of the path), the line through its bends with a dot on each, the grid round the pointer and the
   *  chip; the state follows from the strip as the brush's from its dab; the words carry the run's length, cells and price */
  private drawRun(ctx: CanvasRenderingContext2D, v: CursorView, tool: CursorTool, cx: number, cy: number, now: number, dt: number): boolean {
    const n = tool.brushSquare(), path = tool.runPath(), k = path.length;
    if (k < 2) return this.drawBrush(ctx, v, tool, cx, cy, now, dt);
    const st = tool.brush[tool.brushKind].style, erase = tool.rubOut, base = LOOKS[tool.brushKind] ?? LOOKS.fairway!, d = v.dpr, active = tool.runPts.length > 0;
    const ex = path[k - 2]!, ey = path[k - 1]!;
    this.zoneNow = this.env.zone?.(ex, ey) ?? '';
    this.drawGrid(ctx, v, ex, ey, (n * CELL_T) / 2);
    const f = this.runFeet, fp = f.at(path, n, base.surf, this.env.why, (this.env.rev?.() ?? 0) * 2 + (tool.rubHoleOnly ? 1 : 0), this.env.refuse, this.env.cost);
    if (f.grid && !erase) this.golf = f.price >= 0;
    const grid = f.grid, look = erase && grid ? backLook(tool.brushKind) : base;
    const nKept = grid && !erase ? fp.kept.length >> 1 : 0, nRef = grid ? fp.refused.length >> 1 : 0, price = f.price >= 0 ? Math.round(f.price) : -1;
    const money = this.env.money?.() ?? Infinity;
    let kind: CursorStateKind;
    if (!grid) kind = erase ? 'erase' : 'ready';
    else if (erase) kind = f.count ? 'erase' : nRef ? 'refused' : 'nochange';
    else if (price > 0 && money < price) kind = 'short';
    else if (nRef) kind = 'refused';
    else if (!f.fresh && !nKept) kind = 'nochange';
    else if (nKept) kind = 'protected';
    else kind = 'ready';
    const s = this.state; s.kind = kind; s.dragging = active;
    this.runWords(tool, kind, active, erase, grid ? f.count : -1, nKept, nRef, nKept ? fp.whyKept : '', nRef ? fp.whyRefused : '', price, money, runLength(path, n), f.fresh);
    this.footprint(ctx, fp, f.ax * CELL_T, f.ay * CELL_T, v, look, kind, erase, grid);
    if (active) this.runLine(ctx, v, path, tool.runPts.length >> 1, look);
    const ck = erase && grid ? backKind(tool.brushKind) : tool.brushKind;
    this.chip(ctx, v, cx, cy, ck, erase && grid ? this.backStyle(tool, ck) : st, erase, !grid, d, now, dt);
    return true;
  }
  /** the run's line through its bends (path, tiles; the first placed of them are bends, the last point where the next click lands): a thin
   *  light line on a dark one, a dot on each bend (the start a little bigger), a ring where the next click lands; the same size at every zoom */
  private runLine(ctx: CanvasRenderingContext2D, v: CursorView, path: readonly number[], placed: number, look: Look) {
    const d = v.dpr, ze = v.ze, ex = v.cw / 2 - v.camX * ze, ey = v.ch / 2 - v.camY * ze, X = (i: number) => (path[i]! - path[i + 1]!) * HW * ze + ex, Y = (i: number) => (path[i]! + path[i + 1]!) * HH * ze + ey;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < path.length; i += 2) { if (i) ctx.lineTo(X(i), Y(i)); else ctx.moveTo(X(i), Y(i)); }
    ctx.strokeStyle = UNDER; ctx.globalAlpha = 0.8; ctx.lineWidth = 3 * d; ctx.stroke();
    ctx.strokeStyle = look.core; ctx.globalAlpha = 0.95; ctx.lineWidth = 1.2 * d; ctx.stroke();
    ctx.globalAlpha = 1;
    for (let b = 0; 2 * b < path.length; b++) {
      const x = X(2 * b), y = Y(2 * b), bend = b < placed;
      ctx.beginPath(); ctx.arc(x, y, (b ? 3.4 : 4.4) * d, 0, Math.PI * 2);
      if (bend) { ctx.fillStyle = look.core; ctx.fill(); ctx.strokeStyle = UNDER; ctx.lineWidth = 1.4 * d; ctx.stroke(); }
      else { ctx.strokeStyle = UNDER; ctx.lineWidth = 3 * d; ctx.stroke(); ctx.strokeStyle = look.core; ctx.lineWidth = 1.4 * d; ctx.stroke(); }
    }
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
  }
  /** the run's words' inputs at their last build (a still frame makes no string) */
  private rw = { kind: '', active: false, erase: false, brush: '', hole: 0, fresh: false, unit: 0, n: 0, kept: 0, ref: 0, whyK: '', whyR: '', price: 0, money: 0, len: 0, nf: 0, grid: false, only: false, zone: '' };
  /** Run's words (T122): the hint pill says what a click does ("Run Fairway · Hole 1 · $2 a cell · click a start", then with bends "· 40 m"
   *  and how to finish), then the state's words as the brush's; beside the disc while a run is drawn, its total ("40 m · 80 cells · $160"),
   *  a refusal with its reason, or money short. n: the cells it paints (-1: unknown), nf: how many of them change, len: its length (m) */
  private runWords(tool: CursorTool, kind: CursorStateKind, active: boolean, erase: boolean, n: number, kept: number, ref: number, whyK: string, whyR: string, price: number, money: number, len: number, nf: number) {
    const brush = tool.brushKind, hole = tool.brushHole, surf = LOOKS[brush]?.surf ?? 0, fresh = surf > 0 && this.isNewHole(tool);
    const unit = this.golf && !erase && surf > 0 ? unitBuildCost(SURF_SURFACE[surf] ?? 'other', tool.plantKind) : -1, m = kind === 'short' ? Math.round(money) : 0;
    const grid = this.runFeet.grid, only = !!tool.rubHoleOnly, zone = this.zoneNow, w = this.rw;
    if (w.kind === kind && w.active === active && w.erase === erase && w.brush === brush && w.hole === hole && w.fresh === fresh && w.unit === unit && w.n === n && w.kept === kept && w.ref === ref
      && w.whyK === whyK && w.whyR === whyR && w.price === price && w.money === m && w.len === len && w.nf === nf && w.grid === grid && w.only === only && w.zone === zone) return;
    Object.assign(w, { kind, active, erase, brush, hole, fresh, unit, n, kept, ref, whyK, whyR, price, money: m, len, nf, grid, only, zone });
    const s = this.state, name = nameOf(brush), back = lower(nameOf(backKind(brush)));
    const joins = surf > 0 ? (zone ? ` · ${zone}` : fresh ? ` · starts Hole ${hole}` : ` · Hole ${hole}`) : '';
    const rub = erase && grid && surf > 0, head = rub ? `Run · rub out${only ? ` · Hole ${hole} only` : ''}` : `Run ${name}${joins}`;
    const tail = active ? ' · click each bend · double-click, Enter or right-click finishes' : ' · click a start';
    const long = active ? ` · ${len} m` : '';
    let hint = `${head}${long}${!rub && unit >= 0 ? ` · ${unit$(unit)} a cell` : ''}`;
    switch (kind) {
      case 'protected': hint += ` · ${cellsOf(kept)} kept: ${lower(whyK)}`; break;
      case 'refused': hint += ` · ${cellsOf(ref)} refused: ${lower(whyR)}`; break;
      case 'nochange': hint = rub ? `${head}${long} · nothing to rub out here` : `${head}${long} · already ${lower(name)} here${this.golf ? ' · $0' : ''}`; break;
      case 'erase': if (rub) hint = `${head}${long} · ${n >= 0 ? `${cellsOf(n)} ` : ''}back to ${back}${this.golf ? ' · no refund' : ''}`; break;
      case 'short': hint = `${head} · ${money$(price)} · you have ${money$(m)}`; break;
    }
    s.label.length = 0; s.bad.length = 0;
    // the run's total by the disc while it is drawn
    if (active && n >= 0) { s.label.push(rub ? `${len} m · ${cellsOf(n)} back to ${back}` : this.golf ? `${len} m · ${cellsOf(nf)} · ${money$(price)}` : `${len} m · ${cellsOf(n)}`); s.bad.push(false); }
    if (kind === 'short') { s.label.push(`${name} · ${money$(price)} · you have ${money$(m)}`); s.bad.push(true); }
    else if (ref > 0) { s.label.push(n > 0 ? `${cellsOf(ref)}: ${lower(whyR)}` : whyR); s.bad.push(true); }
    this.setHint(hint + tail);
  }

  /** the course piece in hand: the Paint tool's plan it was made for, the footprint of its golf layers (anchor cell ax, ay), its core
   *  surface (kind, look), and its middle and half size in tiles (the splash) */
  private piece: { plan: unknown; shape: Shape; ax: number; ay: number; kind: string; look: Look; cx: number; cy: number; r: number } | null = null;
  /** a course piece in hand (the plan is rebuilt when it moves): the cells its golf layers fill, tinted like a dab's footprint (refused: red
   *  and hatched, the reason by the chip), and the chip of its core surface beside the pointer */
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
    const bad = !!plan.why, d = v.dpr, s = this.state;
    s.kind = bad ? 'refused' : 'ready'; s.dragging = false; s.label.length = 0; s.bad.length = 0;
    if (bad) { s.label.push(plan.why!); s.bad.push(true); }
    this.setHint('');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    if (bad) this.refusedTint(ctx, pc.shape.loops, pc.ax * CELL_T, pc.ay * CELL_T, v, NaN, NaN);
    else this.footprint(ctx, pc.shape, pc.ax * CELL_T, pc.ay * CELL_T, v, pc.look, 'ready', false, false);
    const set = (tool.brush as Record<string, { style: PuckStyle } | undefined>)[pc.kind];
    if (set) this.chip(ctx, v, cx, cy, pc.kind, set.style, false, false, d, now, dt);
    return true;
  }

  /** the line dashes at dpr d */
  private dashes(d: number) {
    const D = this.dash;
    if (D.d !== d) { D.d = d; D.dot[0] = 0.001; D.dot[1] = 3.6 * d; D.dashed[0] = 4 * d; D.dashed[1] = 3 * d; }
    return D;
  }
  /** the footprint by its state (plan P23 4.9; the outline is the cells' own edges, projected to device px each frame: never pixelated):
   *  the painted cells' soft tint and crisp edge (no change: the edge only; erase: the colour you get back, dashed), the kept cells dotted
   *  (protected), the refused ones in muted red, hatched, with a small ✕ (grid: the course grid's rules ran) */
  private footprint(ctx: CanvasRenderingContext2D, fp: Shape, ox: number, oy: number, v: CursorView, look: Look, kind: CursorStateKind, erase: boolean, grid: boolean) {
    const m = this.mo, d = v.dpr, D = this.dashes(d);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    if (fp.loops.length) {
      this.loopsPath(ctx, fp.loops, ox, oy, v);
      if (kind !== 'nochange') { ctx.fillStyle = m.flash > 0 ? look.core : look.fill; ctx.globalAlpha = TINT_A + 0.3 * m.flash; ctx.fill('evenodd'); }
      this.edge(ctx, look.core, d, erase ? D.dashed : D.none, kind === 'nochange' ? 0.7 : EDGE_A);
    }
    if (!grid) return;
    if (!erase && fp.keptLoops.length) {
      // protected: the cells a higher surface keeps, dotted
      this.loopsPath(ctx, fp.keptLoops, ox, oy, v);
      ctx.lineCap = 'round'; ctx.setLineDash(D.dot);
      ctx.strokeStyle = UNDER; ctx.globalAlpha = 0.9; ctx.lineWidth = 3 * d; ctx.stroke();
      ctx.strokeStyle = KEPT_DOT; ctx.globalAlpha = 1; ctx.lineWidth = 1.7 * d; ctx.stroke();
      ctx.setLineDash(D.none); ctx.lineCap = 'butt';
    }
    if (fp.refusedLoops.length) this.refusedTint(ctx, fp.refusedLoops, ox, oy, v, fp.xdx, fp.xdy);
  }
  /** cells that cannot take the course: a muted red tint, a 45° hatch at a fixed screen pitch, their edge, and a small ✕ on cell (xdx, xdy)
   *  from the anchor (NaN: none) */
  private refusedTint(ctx: CanvasRenderingContext2D, loops: Float32Array[], ox: number, oy: number, v: CursorView, xdx: number, xdy: number) {
    if (!loops.length) return;
    const d = v.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.loopsPath(ctx, loops, ox, oy, v);
    ctx.fillStyle = SKIP_FILL; ctx.globalAlpha = SKIP_A; ctx.fill('evenodd');
    // the hatch: the box of the cells on screen, lines x - y = k on a fixed lattice (they never crawl as the pointer moves)
    const s = this.scr, end = this.offs[loops.length]!;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < end; i += 2) { const X = s[i]!, Y = s[i + 1]!; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
    ctx.save(); ctx.clip('evenodd');
    strokeHatch(ctx, x0, y0, x1, y1, d, HATCH, 0.7);
    ctx.restore();
    this.loopsPath(ctx, loops, ox, oy, v);
    this.edge(ctx, SKIP_EDGE, d, this.dashes(d).none, EDGE_A);
    if (!(xdx === xdx)) return;
    // the ✕: a small red badge on the refused cell nearest the dab, the same size at every zoom
    const ze = v.ze, tx = ox + (xdx + 0.5) * CELL_T, ty = oy + (xdy + 0.5) * CELL_T;
    const X = (tx - ty) * HW * ze + v.cw / 2 - v.camX * ze, Y = (tx + ty) * HH * ze + v.ch / 2 - v.camY * ze;
    drawRefusedCross(ctx, X, Y, d);
  }
  /** strokes the current path as the footprint's edge: a dark line under a light one, a css px wide, in a dash pattern (none: solid) */
  private edge(ctx: CanvasRenderingContext2D, col: string, d: number, dash: number[], alpha: number) {
    if (dash.length) ctx.setLineDash(dash);
    ctx.strokeStyle = UNDER; ctx.globalAlpha = 1; ctx.lineWidth = 2.2 * d; ctx.stroke();
    ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = d; ctx.stroke();
    ctx.globalAlpha = 1;
    if (dash.length) ctx.setLineDash(this.dash.none);
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

  /** the chip beside the pointer at tile (cx, cy): its contact shadow, then the sprite squashed about its foot, and beside it the state's
   *  words (none at rest) */
  private chip(ctx: CanvasRenderingContext2D, v: CursorView, cx: number, cy: number, kind: string, st: PuckStyle, erase: boolean, band: boolean, d: number, now: number, dt: number) {
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
    ctx.drawImage(sp.c as CanvasImageSource, -(sp.pad + sp.rx), -(sp.top + sp.pad + sp.ry + sp.thick));
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    // the words beside the disc: at most two lines, centred on it, to its right (to its left near the screen's right edge)
    const L = this.state.label, k = Math.min(L.length, 2);
    if (!k) return;
    const lh = 18 * d, gap = 4 * d;
    let ly = Math.round(y - m.thick * 0.5 - (k * lh + (k - 1) * gap) / 2);
    for (let i = 0; i < k; i++) { this.label(ctx, i as 0 | 1, L[i]!, x, rx, ly, lh, d, !!this.state.bad[i], v.cw); ly += lh + gap; }
  }
  /** a small dark pill with a text beside the chip (centre x, half width rx), top y and height h; slot 0 or 1 keeps its measure; a warning
   *  (a refusal, money short) is drawn in light red with a red edge */
  private labelText = ['', '']; private labelW = [0, 0]; private labelD = 0; private font = '';
  private label(ctx: CanvasRenderingContext2D, slot: 0 | 1, text: string, x: number, rx: number, y: number, h: number, d: number, bad: boolean, cw: number) {
    if (d !== this.labelD) { this.labelD = d; this.labelText[0] = this.labelText[1] = ''; this.font = `600 ${Math.round(12 * d)}px system-ui, sans-serif`; }
    ctx.font = this.font;
    if (text !== this.labelText[slot]) { this.labelText[slot] = text; this.labelW[slot] = ctx.measureText(text).width; }
    const w = this.labelW[slot]! + 14 * d;
    let x0 = Math.round(x + rx + 8 * d);
    if (x0 + w > cw - 4 * d) x0 = Math.round(x - rx - 8 * d - w);
    ctx.fillStyle = 'rgba(22,20,24,0.86)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y, w, h, h / 2); else ctx.rect(x0, y, w, h); ctx.fill();
    if (bad) { ctx.strokeStyle = LABEL_BAD_EDGE; ctx.lineWidth = d; ctx.stroke(); }
    ctx.fillStyle = bad ? LABEL_BAD : LABEL_COL; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + w / 2, y + h / 2 + 0.5 * d);
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
    // room above the face and to its right for the mark's badge (T138: it sits outside the face)
    const top = Math.max(Math.ceil(4 * d), Math.ceil((BADGE.r - BADGE.dy + 0.5) * d - sry - pad)), wide = Math.max(2 * sr + 2 * pad, pad + sr + (BADGE.dx + BADGE.r + 0.5) * d);
    const make = this.env.canvas ?? domCanvas;
    const c = make(Math.ceil(wide), Math.ceil(2 * sry + thick + 2 * pad + top)), g = c.getContext('2d');
    if (g) paintPuck(g, st, kind, erase, band, CHIP_R, sr, sry, thick, pad, d, this.env.texture, top);
    const sh = make(Math.ceil(2 * sr * 1.3 + 4), Math.ceil(2 * sry * 1.3 + 4)), gs = sh.getContext('2d');
    if (gs) paintShadow(gs, sr, sry);
    sp = { key, c, sh, rx: sr, ry: sry, thick, pad, top };
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

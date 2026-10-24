// The Course tool's paint cursor (T081; plan P21 section 3.5). The owner, 2026-10-24: "I want a 3d puck shape that looks exactly like the
// fairway or rough you are drawing to become your cursor when painting golf course items. It should be showing you what size it is about to
// draw on the map with a grid on the map and 3d rounded iso square as a transparent glowing wireframe, showing you where you are painting
// when you click."
// Three layers on the engine's 2D overlay, all at map scale, while the Course brush is on:
// - the grid: P21's course grid (1 m cells, ext/course-grid's lattice) faintly round the cursor, fading out with distance, thinning out
//   to 2 m lines and then hiding as the zoom goes out;
// - the footprint: the cells one dab paints (course-grid's own paintDisc, on a scratch grid), contoured as P21's droplets (course-blobs'
//   blobOutlines, the brush surface's style) and drawn as a slightly raised rounded prism in a transparent glowing wireframe (bottom and top
//   outlines, vertical edges at the rounded corners) that pulses, flashes on a click and hands over to course-fx's splash;
// - the puck: an iso disc of the brush's radius with a short wall, its top face laid with the ground painter's own photo at its period,
//   scale and angle, its tone and its border band, lit by the one sun at the upper right (a light rim up right, shade down left, the cast
//   shadow at 145°). It eases to the mouse, bobs while it hovers and squashes on a click.
// Speed: the puck and its contact shadow are sprites cached per look, size bucket (6%) and dpr; a footprint shape is contoured once and kept
// (LRU) by its cells relative to the cell under the cursor; the grid's fade is one cached gradient. A frame where the cursor did not move
// allocates nothing; a cursor move re-runs the dab (a few small typed arrays) and contours only a shape not seen before.
// Pure geometry and canvas calls (the canvas factory and the photo source come in), importable from node tests. Units: tiles of 2 m for
// the map, device px on screen.
import { CELL_T, SURF, fillPolygon, makeGrid, paintDisc, type Grid } from '../course-grid';
import { blobOutlines, type BlobStyle } from '../course-blobs';
import { spawnSplash, stepSplash, type SplashKind, type SplashParticle } from '../course-fx';
import { HH, HW } from '../../iso';
import { CAST, castShear } from '../../cast-shadow';
import { DARK_RGB, LIGHT_RGB, SHADOW_RGB, edgeProfileOf, type EdgeProfile } from '../../paint-edges';
import { BORDER_TEXES, BORDER_W, roundCorners, type PaintArea } from '../../paint';
import { surfOfSurface } from '../course-grid/areas';
import { surfaceOfTex } from '../../golf/costs';
import type { PaintTool } from '../../paint-tool';

// ---- inputs ----

/** what the cursor reads from the Paint tool each frame (PaintTool fits it) */
export type CursorTool = Pick<PaintTool, 'mode' | 'brushKind' | 'brush' | 'rubOut' | 'cursor' | 'piece'>;
/** the camera, filled in by the engine each frame (one object, reused): device px per world px (ze = zoom x dpr), the world px at the
 *  overlay's centre (camX, camY), the overlay's size in device px (cw, ch) and the dpr */
export interface CursorView { ze: number; camX: number; camY: number; cw: number; ch: number; dpr: number }
/** the look a puck takes from a brush style (the painted area's own fields) */
export type PuckStyle = Pick<PaintArea, 'tex' | 'scale' | 'angle' | 'border' | 'btex' | 'tone' | 'toneAmt' | 'tint' | 'bscale' | 'bangle'>;
/** a photo for a texture at a wanted px a tile: the picture and the tiles one repeat covers (null: not loaded, or no photo) */
export interface CursorTexture { pick(tex: string, pxPerTile: number): { img: CanvasImageSource & { width: number }; period: number } | null; rev(): number }
/** a 2D canvas the cursor can draw its sprites on */
export interface SpriteCanvas { width: number; height: number; getContext(id: '2d'): CanvasRenderingContext2D | null }
/** the cells a dab skips, by a cell centre in tiles */
export type Refuse = (x: number, y: number) => boolean;
/** what the cursor is given: a canvas factory (default: a DOM canvas), the photo source (default: swatch colours only), and for the golf
 *  game's course grid (T078): refuse, asked once per new footprint, gives the cells a dab skips right now (PaintTool.brushSkip; null when
 *  the brush paints areas instead), and rev, a number that changes whenever those could (the grid's revision, the hole, Rub out) */
export interface CursorEnv {
  canvas?: (w: number, h: number) => SpriteCanvas;
  texture?: CursorTexture | null;
  refuse?: (() => Refuse | null) | null;
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
/** cells of margin round a dab on the scratch grid: room for the droplet field, closing and relax (course-blobs) */
const PAD_CELLS = 8;
/** footprint shapes kept, and puck sprites kept */
const SHAPE_CACHE = 48, SPRITE_CACHE = 12;
/** a new puck sprite every 6% of size; the largest sprite half-width in device px (bigger pucks scale it up) */
const BUCKET = Math.log(1.06), RX_CAP = 900;
/** the puck eases to the cursor at this rate (1/s); its hover height eases at these rates (1/s) when pressed and when released */
const EASE = 22, PRESS_EASE = 40, LIFT_EASE = 12;
/** the pulse (the hover breathing, P21 3.5: 1.4 s) and the bob (1.6 s) periods, ms */
const PULSE_MS = 1400, BOB_MS = 1600;
/** the click flash, the ripple (P21 3.5: 0.5x to 1.6x the radius in 300 ms) and a splash burst's life, ms */
const FLASH_MS = 380, RIPPLE_MS = 300, BURST_MS = 650;
/** at most this many splash bursts live at once */
const MAX_BURSTS = 10;
/** the radius in tiles of the puck that rides with a course piece (the piece's own outline shows its size) */
const PIECE_PUCK_R = 1.5;
/** the cast shadow's shear (a point h px up falls h * (sx, sy) away on the ground) */
const SHEAR = castShear(CAST);
/** the screen direction toward the sun (opposite the shadows) */
const SUN_X = -Math.cos((CAST.angle * Math.PI) / 180), SUN_Y = -Math.sin((CAST.angle * Math.PI) / 180);

/** a brush's colours and materials: the wireframe's glow and core line, the puck's wall, the splash and the course surface it paints */
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
/** the footprint's droplet style: P21's metaball field and iso level (lone cells round, neighbours flowing together) without the closing
 *  and relax a painted surface gets, so the wireframe never takes in a cell the dab skips (closing fills notches) nor leaves out one it
 *  paints (relax smooths a lone tip cell away) */
const FOOT_STYLE: BlobStyle = { close: 0, relax: 0 };
/** each Paint texture's swatch colour (the flat fill while a photo loads) */
const SWATCH = new Map<string, string>(BORDER_TEXES.map(t => [t.id, t.col]));

// ---- small maths ----

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** 0 at a, 1 at b, smooth between */
function smooth(a: number, b: number, v: number): number { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

/** the puck's screen half-axes in device px for a brush of radius r tiles at ze device px per world px: a circle on the ground is an ellipse
 *  sqrt(2) HW r ze wide and half as tall (the iso view) */
export function puckAxes(r: number, ze: number): { rx: number; ry: number } {
  return { rx: r * SQ2 * HW * ze, ry: r * SQ2 * HH * ze };
}

/** Chaikin's corner cutting on a closed ring (x, y pairs): every corner becomes two points a quarter along its edges */
function chaikin(p: number[]): number[] {
  const n = p.length >> 1, out: number[] = new Array(n * 4);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = p[2 * i]!, ay = p[2 * i + 1]!, bx = p[2 * j]!, by = p[2 * j + 1]!;
    out[4 * i] = 0.75 * ax + 0.25 * bx; out[4 * i + 1] = 0.75 * ay + 0.25 * by;
    out[4 * i + 2] = 0.25 * ax + 0.75 * bx; out[4 * i + 3] = 0.25 * ay + 0.75 * by;
  }
  return out;
}

// ---- the footprint ----

/** one dab's footprint shape, relative to the cell that holds the brush centre (its anchor) */
export interface Shape {
  /** the covered cells as (dx, dy) pairs of cells from the anchor cell */
  cells: Int16Array;
  /** the droplet outline rings, closed (the last point joins the first), as (x, y) pairs in tiles from the anchor cell's corner */
  rings: Float32Array[];
  /** per ring: +1 for an outer ring, -1 for a hole */
  sign: Int8Array;
  /** per ring: the points with the least and the most screen x, and the most and the least screen y (the prism's vertical edges) */
  ext: Int32Array[];
  /** per ring: 1 where the segment from point i to the next faces the viewer (its outward normal points down the screen) */
  front: Uint8Array[];
  /** the hash of the cells and the outline style */
  hash: number;
}

/** the scratch grid a dab is painted on: placed round the anchor cell each time, re-made only when the radius needs a bigger one */
class DabPad {
  g: Grid | null = null;
  private m = -1;
  /** the cell under (x, y) */
  ax = 0; ay = 0;
  /** paints a dab of radius r at (x, y) with course-grid's paintDisc and returns the changed cells (the dab: every cell starts empty) as
   *  scratch-grid indices; refuse leaves a cell out (its centre in tiles) */
  run(x: number, y: number, r: number, refuse?: Refuse | null): { idx: Uint32Array; n: number } {
    const ax = Math.floor(x / CELL_T), ay = Math.floor(y / CELL_T), m = Math.ceil(r / CELL_T) + PAD_CELLS;
    let g = this.g;
    if (!g || this.m !== m) { g = this.g = makeGrid(0, 0, 2 * m + 1, 2 * m + 1); this.m = m; } else g.surf.fill(0);
    g.x0 = (ax - m) * CELL_T; g.y0 = (ay - m) * CELL_T; this.ax = ax; this.ay = ay;
    const w = g.w, x0 = g.x0, y0 = g.y0;
    const opts = refuse ? { allow: (i: number) => { const cx = i % w, cy = (i - cx) / w; return !refuse(x0 + (cx + 0.5) * CELL_T, y0 + (cy + 0.5) * CELL_T); } } : {};
    const d = paintDisc(g, x, y, r, 1, 0, 0, opts);
    return { idx: d.idx, n: d.n };
  }
  /** the margin in cells round the anchor */
  get margin() { return this.m; }
}

const PAD = new DabPad();
/** the cells a brush dab of radius r tiles at tile (x, y) paints, by course-grid's own paintDisc: (cx, cy) pairs of world cell indices
 *  (cell (cx, cy) spans tiles cx * CELL_T to (cx + 1) * CELL_T, as every course grid, whose origin sits on that lattice) */
export function dabCells(x: number, y: number, r: number, refuse?: Refuse | null): Int32Array {
  const { idx, n } = PAD.run(x, y, r, refuse), g = PAD.g!, out = new Int32Array(2 * n), ox = Math.round(g.x0 / CELL_T), oy = Math.round(g.y0 / CELL_T);
  for (let k = 0; k < n; k++) { const i = idx[k]!, cx = i % g.w; out[2 * k] = ox + cx; out[2 * k + 1] = oy + (i - cx) / g.w; }
  return out;
}

/** a closed ring (x, y pairs) resampled every h tiles along its length */
function resample(p: number[], h: number): number[] {
  const n = p.length >> 1, out: number[] = [];
  let carry = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = p[2 * i]!, ay = p[2 * i + 1]!, dx = p[2 * j]! - ax, dy = p[2 * j + 1]! - ay, len = Math.hypot(dx, dy);
    let t = carry;
    for (; t < len; t += h) out.push(ax + (dx * t) / len, ay + (dy * t) / len);
    carry = t - len;
  }
  return out;
}
/** a closed ring smoothed along its length by a Gaussian of sigma tiles (it calms the staircase waves of a round dab's cells without
 *  moving a straight run), a point every 0.1 tile up to about 1400 points */
function smoothRing(p: number[], sigma: number): number[] {
  const h = 0.05, q = resample(p, h), n = q.length >> 1, s = sigma / h, R = Math.min(Math.ceil(3 * s), (n >> 1) - 1);
  if (R < 1) return p;
  const w = new Float64Array(R + 1); let sum = 0;
  for (let k = 0; k <= R; k++) { w[k] = Math.exp(-(k * k) / (2 * s * s)); sum += k ? 2 * w[k]! : w[k]!; }
  const step = Math.max(2, Math.ceil(n / 1400)), out: number[] = [];
  for (let i = 0; i < n; i += step) {
    let x = w[0]! * q[2 * i]!, y = w[0]! * q[2 * i + 1]!;
    for (let k = 1; k <= R; k++) { const a = (i + k) % n, b = (i - k + n) % n; x += w[k]! * (q[2 * a]! + q[2 * b]!); y += w[k]! * (q[2 * a + 1]! + q[2 * b + 1]!); }
    out.push(x / sum, y / sum);
  }
  return out;
}
/** even-odd: (x, y) inside the rings */
function insideRings(rings: readonly number[][], x: number, y: number): boolean {
  let c = false;
  for (const p of rings) for (let i = 0, n = p.length >> 1, j = n - 1; i < n; j = i++) {
    const xi = p[2 * i]!, yi = p[2 * i + 1]!, xj = p[2 * j]!, yj = p[2 * j + 1]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** whether the rings hold exactly the cells ((dx, dy) from the anchor; rings in tiles from its corner): every cell on the edge of the dab
 *  has its centre inside, and every cell touching the dab from outside has its centre outside */
function holdsExactly(rings: readonly number[][], cells: Int16Array): boolean {
  const K = (dx: number, dy: number) => (dy + 4096) * 8192 + dx + 4096, have = new Set<number>(), out = new Set<number>();
  for (let i = 0; i < cells.length; i += 2) have.add(K(cells[i]!, cells[i + 1]!));
  for (let i = 0; i < cells.length; i += 2) {
    const cx = cells[i]!, cy = cells[i + 1]!;
    let edge = false;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const k = K(cx + ox, cy + oy);
      if (have.has(k)) continue;
      edge = true;
      if (out.has(k)) continue;
      out.add(k);
      if (insideRings(rings, (cx + ox + 0.5) * CELL_T, (cy + oy + 0.5) * CELL_T)) return false;
    }
    if (edge && !insideRings(rings, (cx + 0.5) * CELL_T, (cy + 0.5) * CELL_T)) return false;
  }
  return true;
}

/** the droplet outline of the cells (surface 1) on scratch grid g, as a Shape relative to the anchor cell (ax, ay): P21's droplet contour,
 *  then smoothed along its length to calm the staircase waves of a round dab, as long as it still holds exactly those cells (else less
 *  smoothing, else the droplet contour itself, rounded by corner cutting) */
function contour(g: Grid, ax: number, ay: number, cells: Int16Array, hash: number, style: BlobStyle): Shape {
  const box = { x0: g.x0, y0: g.y0, x1: g.x0 + g.w * CELL_T, y1: g.y0 + g.h * CELL_T };
  const ox = ax * CELL_T, oy = ay * CELL_T, rings: Float32Array[] = [], ext: Int32Array[] = [], front: Uint8Array[] = [], signs: number[] = [];
  const raws: number[][] = [];
  for (const raw of blobOutlines(g, 1, box, style)) {
    if (raw.length < 6) continue;
    const rel: number[] = new Array(raw.length);
    for (let i = 0; i < raw.length; i += 2) { rel[i] = raw[i]! - ox; rel[i + 1] = raw[i + 1]! - oy; }
    raws.push(rel);
  }
  const nc = cells.length >> 1;
  let shaped = raws.map(r => chaikin(chaikin(r)));
  for (const sigma of nc >= 30 ? [0.25, 0.14] : nc >= 12 ? [0.14] : []) {
    const sm = raws.map(r => smoothRing(r, sigma));
    if (holdsExactly(sm, cells)) { shaped = sm; break; }
  }
  for (const ring of shaped) {
    const p = Float32Array.from(ring), n = p.length >> 1;
    // the ring's turn on the map (outer rings run counter-clockwise: a positive area with x east and y south) and on screen
    let a = 0, as = 0, iMinX = 0, iMaxX = 0, iMaxY = 0, iMinY = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, x = p[2 * i]!, y = p[2 * i + 1]!, x1 = p[2 * j]!, y1 = p[2 * j + 1]!;
      a += x * y1 - x1 * y;
      as += (x - y) * (x1 + y1) - (x1 - y1) * (x + y);
      const sx = x - y, sy = x + y;
      if (sx < p[2 * iMinX]! - p[2 * iMinX + 1]!) iMinX = i; if (sx > p[2 * iMaxX]! - p[2 * iMaxX + 1]!) iMaxX = i;
      if (sy > p[2 * iMaxY]! + p[2 * iMaxY + 1]!) iMaxY = i; if (sy < p[2 * iMinY]! + p[2 * iMinY + 1]!) iMinY = i;
    }
    // a segment faces the viewer when its outward normal points down the screen: moving left on screen for a positive screen area
    const f = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n, dX = (p[2 * j]! - p[2 * j + 1]!) - (p[2 * i]! - p[2 * i + 1]!); f[i] = (as > 0 ? dX < 0 : dX > 0) ? 1 : 0; }
    rings.push(p); ext.push(Int32Array.of(iMinX, iMaxX, iMaxY, iMinY)); front.push(f); signs.push(a > 0 ? 1 : -1);
  }
  return { cells, rings, sign: Int8Array.from(signs), ext, front, hash };
}

/** the footprint of polygons (a course piece's layers, x y pairs in tiles, rounded as they are laid): the cells course-grid's fillPolygon
 *  fills for them (their centres inside), outlined like a dab's; ax, ay is the anchor cell the shape is relative to */
export function polyFootprint(polys: readonly number[][]): { shape: Shape; ax: number; ay: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const P of polys) for (let i = 0; i < P.length; i += 2) { x0 = Math.min(x0, P[i]!); x1 = Math.max(x1, P[i]!); y0 = Math.min(y0, P[i + 1]!); y1 = Math.max(y1, P[i + 1]!); }
  if (!(x1 >= x0)) x0 = x1 = y0 = y1 = 0;
  const ax = Math.floor(x0 / CELL_T), ay = Math.floor(y0 / CELL_T), m = PAD_CELLS;
  const g = makeGrid((ax - m) * CELL_T, (ay - m) * CELL_T, Math.ceil((x1 - x0) / CELL_T) + 2 * m + 2, Math.ceil((y1 - y0) / CELL_T) + 2 * m + 2);
  for (const P of polys) { const pts: { x: number; y: number }[] = []; for (let i = 0; i < P.length; i += 2) pts.push({ x: P[i]!, y: P[i + 1]! }); fillPolygon(g, pts, 1, 0, 0); }
  const list: number[] = [];
  let h = 2166136261;
  for (let i = 0; i < g.surf.length; i++) if (g.surf[i]) { const cx = i % g.w, dx = cx - m, dy = (i - cx) / g.w - m; list.push(dx, dy); h = Math.imul(h ^ ((dx & 0xffff) | (dy << 16)), 16777619); }
  const cells = Int16Array.from(list);
  return { shape: contour(g, ax, ay, cells, h, FOOT_STYLE), ax, ay };
}

/** the footprints of dabs, cached: the cells of the dab at the cursor (exactly paintDisc's) and their outline, kept per shape */
export class Footprints {
  private pad = new DabPad();
  private shapes = new Map<number, Shape>();
  private kx = NaN; private ky = NaN; private kr = NaN; private ks = -1; private krev = -1;
  /** the shape at the last call and the world cell of its anchor */
  shape: Shape | null = null;
  ax = 0; ay = 0;
  /** counters for the tests: dabs run and outlines contoured */
  dabs = 0; contours = 0;
  /** whether the last dab ran on the course grid's rules (refuse gave a function): its collars lie outside the cells */
  grid = false;
  /** the footprint of a dab of radius r at (x, y) for surface surf: re-runs the dab only when the inputs changed (rev: see CursorEnv),
   *  asking refuse then for the cells it skips, and contours only a shape it has not kept */
  at(x: number, y: number, r: number, surf: number, refuse?: (() => Refuse | null) | null, rev = 0): Shape {
    if (this.shape && x === this.kx && y === this.ky && r === this.kr && surf === this.ks && rev === this.krev) return this.shape;
    this.kx = x; this.ky = y; this.kr = r; this.ks = surf; this.krev = rev; this.dabs++;
    const skip = refuse?.() ?? null; this.grid = !!skip;
    const { idx, n } = this.pad.run(x, y, r, skip), g = this.pad.g!, m = this.pad.margin;
    const cells = new Int16Array(2 * n);
    let h = 2166136261 ^ (surf * 97 + n);
    for (let k = 0; k < n; k++) {
      const i = idx[k]!, cx = i % g.w, dx = cx - m, dy = (i - cx) / g.w - m;
      cells[2 * k] = dx; cells[2 * k + 1] = dy;
      h = Math.imul(h ^ ((dx & 0xffff) | (dy << 16)), 16777619);
    }
    this.ax = this.pad.ax; this.ay = this.pad.ay;
    let s = this.shapes.get(h);
    if (s && !sameCells(s.cells, cells)) s = undefined;
    if (s) { this.shapes.delete(h); this.shapes.set(h, s); }
    else {
      s = contour(g, this.pad.ax, this.pad.ay, cells, h, FOOT_STYLE); this.contours++;
      this.shapes.set(h, s);
      if (this.shapes.size > SHAPE_CACHE) this.shapes.delete(this.shapes.keys().next().value!);
    }
    return (this.shape = s);
  }
}
function sameCells(a: Int16Array, b: Int16Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---- the puck sprite ----

/** a cached puck: the sprite (top face centre at (pad + rx, pad + ry), the wall below it), its contact shadow, and the sizes it was drawn at */
interface Sprite { key: string; c: SpriteCanvas; sh: SpriteCanvas; rx: number; ry: number; thick: number; pad: number }

/** the wall's thickness for a puck ry device px tall */
const thickOf = (ry: number, d: number) => clamp(0.3 * ry, 4 * d, 15 * d);
/** the puck's rest hover height (device px) */
const hoverOf = (ry: number, d: number) => clamp(0.24 * ry, 3 * d, 9 * d);

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
  const bw = withBand && st.border > 0 ? Math.min(BORDER_W[st.border]!, 0.34 * R) : 0;
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

/** the Course brush's cursor: the grid, the glowing footprint and the surface puck, drawn on the engine's overlay each frame */
export class CourseCursor {
  /** the footprint cache (the tests read it) */
  readonly feet = new Footprints();
  /** counters for the tests: puck sprites painted, gradients made */
  readonly stats = { sprites: 0, gradients: 0 };
  /** the puck's last drawn half-axes and centre on the ground, device px (the tests read them) */
  readonly last = { rx: 0, ry: 0, x: 0, y: 0, shown: false };
  private env: CursorEnv;
  /** the eased puck position (tiles), whether it is on screen, its eased hover height (device px) and opacity */
  private px = 0; private py = 0; private have = false; private hov = 0; private alpha = 1;
  /** the last frame time (ms), the last press and release (ms), a press in progress and whether it rubs out */
  private t = 0; private pressAt = -1e9; private releaseAt = -1e9; private pressed = false; private pressErase = false;
  /** where the stroke last splashed (tiles) */
  private trailX = 0; private trailY = 0;
  private bursts: Burst[] = [];
  private seed = 1;
  /** the screen points of a ring (device px), grown when a ring needs more */
  private scr = new Float32Array(512);
  /** the grid's fade: one radial gradient in tile space, made again only when its radius changes */
  private grad: CanvasGradient | null = null; private gradR = -1;
  /** the puck sprites (LRU) and the one in use */
  private sprites = new Map<string, Sprite>();
  private spr: Sprite | null = null;
  private sk = { kind: '', st: null as PuckStyle | null, erase: false, band: true, r: NaN, b: NaN, d: 0, rev: -1, tex: '', scale: 0, angle: 0, border: -1, btex: '', tone: -1 };

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
    const r = tool.brush[tool.brushKind].r;
    this.splash(c.x, c.y, r, this.pressErase ? ERASE : LOOKS[tool.brushKind] ?? LOOKS.fairway!, now, true);
    this.trailX = c.x; this.trailY = c.y;
  }
  /** the press ends: the puck springs back up */
  release(now = performance.now()) { if (this.pressed) { this.pressed = false; this.releaseAt = now; } }

  /** draws the cursor for this frame; true when the puck is shown (the OS cursor can hide) */
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

  /** this frame's motion (see motion()): the squash, the pulse and flash, the wireframe's glow, the puck's rest hover, wall and prism height */
  private mo = { sx: 1, sy: 1, pulse: 0, flash: 0, glowA: 0, rest: 0, thick: 0, hp: 0 };
  /** the puck eases to (cx, cy), bobs, sinks while pressed, squashes after a press and springs after a release; the wireframe pulses and
   *  flashes (a puck ry device px tall) */
  private motion(cx: number, cy: number, ry: number, d: number, now: number, dt: number) {
    const m = this.mo, rest = hoverOf(ry, d), thick = thickOf(ry, d);
    if (!this.have) { this.px = cx; this.py = cy; this.have = true; this.hov = rest; this.alpha = 0.96; }
    else { const k = 1 - Math.exp(-dt * EASE); this.px += (cx - this.px) * k; this.py += (cy - this.py) * k; }
    const target = this.pressed ? 0.6 * d : rest + 1.8 * d * Math.sin((now * 2 * Math.PI) / BOB_MS);
    this.hov += (target - this.hov) * (1 - Math.exp(-dt * (this.pressed ? PRESS_EASE : LIFT_EASE)));
    this.alpha += ((this.pressed ? 0.55 : 0.96) - this.alpha) * (1 - Math.exp(-dt * 14));
    const tp = now - this.pressAt, tr = now - this.releaseAt;
    const q = (tp < 700 ? Math.exp(-tp / 130) * Math.cos((tp * 2 * Math.PI) / 280) : 0) * 0.2 - (tr < 600 ? Math.exp(-tr / 110) * Math.cos((tr * 2 * Math.PI) / 240) : 0) * 0.1;
    m.sx = 1 + 0.8 * q; m.sy = 1 - q;
    m.pulse = 0.5 + 0.5 * Math.sin((now * 2 * Math.PI) / PULSE_MS); m.flash = tp < FLASH_MS ? (1 - tp / FLASH_MS) * (1 - tp / FLASH_MS) : 0;
    m.glowA = 0.6 + 0.3 * m.pulse; m.rest = rest; m.thick = thick;
    m.hp = (rest + 2 * d + thick + 4 * d) * (1 + 0.05 * m.pulse);
  }

  /** the grid, the footprint and the puck for the brush at tile (cx, cy) */
  private drawBrush(ctx: CanvasRenderingContext2D, v: CursorView, tool: CursorTool, cx: number, cy: number, now: number, dt: number): boolean {
    const set = tool.brush[tool.brushKind], r = set.r, st = set.style, erase = this.pressed ? this.pressErase : tool.rubOut;
    const base = LOOKS[tool.brushKind] ?? LOOKS.fairway!, look = erase ? ERASE : base, d = v.dpr;
    const { rx, ry } = puckAxesInto(this.last, r, v.ze);
    this.motion(cx, cy, ry, d, now, dt);
    // the grid round the cursor, then the footprint (the dab's cells at the cursor) as a prism round the puck
    this.drawGrid(ctx, v, cx, cy, r);
    const fp = this.feet.at(cx, cy, r, base.surf, this.env.refuse, this.env.rev?.() ?? 0);
    const ps = this.project(fp, this.feet.ax * CELL_T, this.feet.ay * CELL_T, v);
    this.prismBack(ctx, fp, ps, look, d);
    this.puck(ctx, v, tool.brushKind, st, erase, !this.feet.grid, r, rx, ry, d);
    this.prismFront(ctx, fp, ps, look, d);
    // a stroke in progress splashes as it travels
    if (this.pressed && Math.hypot(cx - this.trailX, cy - this.trailY) > Math.max(1.2, 0.9 * r)) { this.splash(cx, cy, r, look, now, false); this.trailX = cx; this.trailY = cy; }
    return true;
  }

  /** the course piece in hand: the Paint tool's plan it was made for, the footprint of its golf layers (anchor cell ax, ay), its core
   *  surface (kind, look), and its middle and half size in tiles (the splash) */
  private piece: { plan: unknown; shape: Shape; ax: number; ay: number; kind: string; look: Look; cx: number; cy: number; r: number } | null = null;
  /** a course piece in hand (the plan is rebuilt when it moves): the cells its golf layers fill as the same glowing prism (red where it
   *  cannot go), and a small puck of its core surface at the cursor */
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
    const look = plan.why ? ERASE : pc.look, d = v.dpr, r = PIECE_PUCK_R, { rx, ry } = puckAxesInto(this.last, r, v.ze);
    this.motion(cx, cy, ry, d, now, dt);
    const ps = this.project(pc.shape, pc.ax * CELL_T, pc.ay * CELL_T, v);
    this.prismBack(ctx, pc.shape, ps, look, d);
    const set = (tool.brush as Record<string, { style: PuckStyle } | undefined>)[pc.kind];
    if (set) this.puck(ctx, v, pc.kind, set.style, !!plan.why, false, r, rx, ry, d);
    this.prismFront(ctx, pc.shape, ps, look, d);
    return true;
  }

  /** the footprint prism's ground: the cells faintly in the surface's colour (bright in the flash), the outline on the ground, and the back
   *  vertical edge (the puck hides it) */
  private prismBack(ctx: CanvasRenderingContext2D, fp: Shape, ps: Float32Array, look: Look, d: number) {
    const m = this.mo;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    this.ringsPath(ctx, fp, ps, 0, true);
    ctx.fillStyle = m.flash > 0 ? look.core : look.fill; ctx.globalAlpha = 0.1 + 0.08 * m.pulse + 0.4 * m.flash; ctx.fill('evenodd');
    this.glow(ctx, look, m.glowA * 0.85 + m.flash, d);
    ctx.beginPath(); this.verticals(ctx, fp, ps, m.hp, 3); this.glow(ctx, look, m.glowA * 0.4, d);
  }
  /** the glass in front of the puck: the front walls' faint sheet, the top outline, the side and front vertical edges */
  private prismFront(ctx: CanvasRenderingContext2D, fp: Shape, ps: Float32Array, look: Look, d: number) {
    const m = this.mo, lift = m.hp * (1 + 0.06 * m.flash);
    ctx.beginPath(); this.walls(ctx, fp, ps, lift);
    ctx.fillStyle = look.glow; ctx.globalAlpha = 0.07 + 0.05 * m.pulse + 0.25 * m.flash; ctx.fill();
    this.ringsPath(ctx, fp, ps, lift, false); this.glow(ctx, look, m.glowA + m.flash, d);
    ctx.beginPath(); this.verticals(ctx, fp, ps, lift, 0); this.verticals(ctx, fp, ps, lift, 1); this.verticals(ctx, fp, ps, lift, 2);
    this.glow(ctx, look, (m.glowA + m.flash) * 0.85, d);
    ctx.globalAlpha = 1;
  }
  /** the puck at its eased spot: its contact shadow, then the sprite squashed about its foot; too small to read as a puck, a little glowing
   *  ring marks the cursor instead */
  private puck(ctx: CanvasRenderingContext2D, v: CursorView, kind: string, st: PuckStyle, erase: boolean, band: boolean, r: number, rx: number, ry: number, d: number) {
    const m = this.mo, ze = v.ze;
    const gx = ((this.px - this.py) * HW - v.camX) * ze + v.cw / 2, gy = ((this.px + this.py) * HH - v.camY) * ze + v.ch / 2;
    this.last.x = gx; this.last.y = gy;
    if (rx >= 6 * d) {
      const sp = this.sprite(kind, st, erase, band, r, rx, d), k = rx / sp.rx;
      const h = this.hov + m.thick * 0.5, shx = gx + SHEAR.sx * h, shy = gy + SHEAR.sy * h, grow = 1 + (0.3 * this.hov) / Math.max(ry, 1);
      const sw = sp.sh.width * k * grow * m.sx, shh = sp.sh.height * k * grow;
      ctx.globalAlpha = CAST.strength * (0.95 - 0.3 * clamp(this.hov / (m.rest + 2 * d), 0, 1));
      ctx.drawImage(sp.sh as CanvasImageSource, shx - sw / 2, shy - shh / 2, sw, shh);
      ctx.globalAlpha = this.alpha;
      ctx.setTransform(m.sx * k, 0, 0, m.sy * k, gx, gy - this.hov);
      ctx.drawImage(sp.c as CanvasImageSource, -(sp.pad + sp.rx), -(sp.pad + sp.ry + sp.thick));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      const look = erase ? ERASE : LOOKS[kind] ?? LOOKS.fairway!;
      ctx.beginPath(); ctx.ellipse(gx, gy, 7 * d, 3.5 * d, 0, 0, Math.PI * 2); this.glow(ctx, look, m.glowA + m.flash, d);
      ctx.beginPath(); ctx.arc(gx, gy, 1.6 * d, 0, Math.PI * 2); ctx.fillStyle = look.core; ctx.globalAlpha = 0.95; ctx.fill();
    }
    ctx.globalAlpha = 1;
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
    for (let odd = 0; odd < 2; odd++) {
      const a = odd ? 0.3 * aCell : 0.5 * aTile;
      if (a < 0.01) continue;
      ctx.beginPath();
      for (let k = k0x; k <= k1x; k++) { if ((k & 1) !== odd) continue; const dx = k * CELL_T - cx, h = Math.sqrt(Math.max(0, R * R - dx * dx)); ctx.moveTo(dx, -h); ctx.lineTo(dx, h); }
      for (let k = k0y; k <= k1y; k++) { if ((k & 1) !== odd) continue; const dy = k * CELL_T - cy, h = Math.sqrt(Math.max(0, R * R - dy * dy)); ctx.moveTo(-h, dy); ctx.lineTo(h, dy); }
      ctx.globalAlpha = a; ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** the footprint's rings on screen (device px), into the reused buffer: ring i's points start at the returned offsets */
  private offs = new Int32Array(16);
  private project(fp: Shape, ox: number, oy: number, v: CursorView): Float32Array {
    let total = 0;
    for (const p of fp.rings) total += p.length;
    if (total > this.scr.length) this.scr = new Float32Array(Math.max(total, this.scr.length * 2));
    if (fp.rings.length + 1 > this.offs.length) this.offs = new Int32Array(fp.rings.length * 2 + 2);
    const s = this.scr, ze = v.ze, ex = v.cw / 2 - v.camX * ze, ey = v.ch / 2 - v.camY * ze;
    let o = 0;
    for (let i = 0; i < fp.rings.length; i++) {
      const p = fp.rings[i]!; this.offs[i] = o;
      for (let j = 0; j < p.length; j += 2) { const x = p[j]! + ox, y = p[j + 1]! + oy; s[o + j] = (x - y) * HW * ze + ex; s[o + j + 1] = (x + y) * HH * ze + ey; }
      o += p.length;
    }
    this.offs[fp.rings.length] = o;
    return s;
  }
  /** adds the rings (lifted lift px; holes too when holes) to a new path */
  private ringsPath(ctx: CanvasRenderingContext2D, fp: Shape, s: Float32Array, lift: number, holes: boolean) {
    ctx.beginPath();
    for (let i = 0; i < fp.rings.length; i++) {
      if (!holes && fp.sign[i]! < 0) continue;
      const o = this.offs[i]!, e = this.offs[i + 1]!;
      ctx.moveTo(s[o]!, s[o + 1]! - lift);
      for (let j = o + 2; j < e; j += 2) ctx.lineTo(s[j]!, s[j + 1]! - lift);
      ctx.closePath();
    }
  }
  /** adds the vertical edges of the outer rings at extreme e (0 left, 1 right, 2 front, 3 back), from the ground up lift px */
  private verticals(ctx: CanvasRenderingContext2D, fp: Shape, s: Float32Array, lift: number, e: number) {
    for (let i = 0; i < fp.rings.length; i++) {
      if (fp.sign[i]! < 0) continue;
      const j = this.offs[i]! + 2 * fp.ext[i]![e]!;
      ctx.moveTo(s[j]!, s[j + 1]!); ctx.lineTo(s[j]!, s[j + 1]! - lift);
    }
  }
  /** adds the front walls of the outer rings (the segments facing the viewer, swept up lift px) */
  private walls(ctx: CanvasRenderingContext2D, fp: Shape, s: Float32Array, lift: number) {
    for (let i = 0; i < fp.rings.length; i++) {
      if (fp.sign[i]! < 0) continue;
      const o = this.offs[i]!, n = (this.offs[i + 1]! - o) >> 1, f = fp.front[i]!;
      for (let k = 0; k < n; k++) {
        if (!f[k]) continue;
        const a = o + 2 * k, b = o + 2 * ((k + 1) % n);
        ctx.moveTo(s[a]!, s[a + 1]!); ctx.lineTo(s[b]!, s[b + 1]!); ctx.lineTo(s[b]!, s[b + 1]! - lift); ctx.lineTo(s[a]!, s[a + 1]! - lift); ctx.closePath();
      }
    }
  }
  /** strokes the current path as a soft glow: two wide faint passes in the glow colour, then a bright core line added on top */
  private glow(ctx: CanvasRenderingContext2D, look: Look, a: number, d: number) {
    const al = clamp(a, 0, 1.4);
    ctx.strokeStyle = look.glow;
    ctx.globalAlpha = clamp(al * 0.14, 0, 1); ctx.lineWidth = 7 * d; ctx.stroke();
    ctx.globalAlpha = clamp(al * 0.3, 0, 1); ctx.lineWidth = 3.4 * d; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = look.core;
    ctx.globalAlpha = clamp(al * 0.75, 0, 1); ctx.lineWidth = 1.3 * d; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  /** the puck sprite for this look (band: with its border band) of a brush of r tiles drawn rx device px across, from the cache, painted
   *  when missing */
  private sprite(kind: string, st: PuckStyle, erase: boolean, band: boolean, r: number, rx: number, d: number): Sprite {
    const b = Math.round(Math.log(Math.max(rx, 1)) / BUCKET), rev = this.env.texture?.rev() ?? 0, k = this.sk;
    if (this.spr && k.kind === kind && k.st === st && k.erase === erase && k.band === band && k.r === r && k.b === b && k.d === d && k.rev === rev
      && k.tex === st.tex && k.scale === st.scale && k.angle === st.angle && k.border === st.border && k.btex === st.btex && k.tone === st.tone) return this.spr;
    Object.assign(k, { kind, st, erase, band, r, b, d, rev, tex: st.tex, scale: st.scale, angle: st.angle, border: st.border, btex: st.btex, tone: st.tone });
    const key = `${kind}|${st.tex}|${st.scale}|${st.angle}|${st.border}|${st.btex}|${st.bscale}|${st.bangle}|${st.tone}|${st.toneAmt}|${st.tint}|${erase ? 1 : 0}|${band ? 1 : 0}|${r}|${b}|${d}|${rev}`;
    let sp = this.sprites.get(key);
    if (sp) { this.sprites.delete(key); this.sprites.set(key, sp); return (this.spr = sp); }
    const sr = Math.min(RX_CAP, Math.exp(b * BUCKET)), sry = sr * (HH / HW), thick = thickOf(sry, d), pad = Math.ceil(3 * d + 2);
    const make = this.env.canvas ?? domCanvas;
    const c = make(Math.ceil(2 * sr + 2 * pad), Math.ceil(2 * sry + thick + 2 * pad)), g = c.getContext('2d');
    if (g) paintPuck(g, st, kind, erase, band, r, sr, sry, thick, pad, d, this.env.texture);
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
    // from under the puck's edge), so its offset becomes a point on the unit rim and the flight starts from there
    const parts = spawnSplash(this.seed++, 0, 0, 1, look.splash), rim = new Float32Array(parts.length * 2);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!, a = Math.atan2(2 * p.y, p.x);
      rim[2 * i] = 0.95 * Math.cos(a); rim[2 * i + 1] = 0.95 * Math.sin(a); p.x = 0; p.y = 0;
    }
    this.bursts.push({ x, y, t0: now, r, parts, rim, ring, col: look.core });
  }
  /** steps and draws the live splashes; drops the finished ones in place */
  private drawBursts(ctx: CanvasRenderingContext2D, v: CursorView, now: number, dt: number) {
    const ze = v.ze, d = v.dpr, B = this.bursts;
    let j = 0;
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
        ctx.strokeStyle = b.col; ctx.globalAlpha = 0.75 * (1 - u) * (1 - u); ctx.lineWidth = (2.6 - 1.6 * u) * d; ctx.stroke();
      }
      for (let n = 0; n < b.parts.length; n++) {
        const p = b.parts[n]!;
        if (p.dead) continue;
        ctx.globalAlpha = clamp(p.lifeMs / p.maxLifeMs, 0, 1); ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(gx + b.rim[2 * n]! * rx + p.x * k, gy + b.rim[2 * n + 1]! * ry + p.y * k, p.size * k * 0.7, 0, Math.PI * 2); ctx.fill();
      }
    }
    B.length = j;
    ctx.globalAlpha = 1;
  }
}

/** puckAxes into a reused object (the draw path allocates nothing) */
function puckAxesInto(o: { rx: number; ry: number }, r: number, ze: number): { rx: number; ry: number } {
  o.rx = r * SQ2 * HW * ze; o.ry = r * SQ2 * HH * ze; return o;
}
/** a DOM canvas (the default sprite canvas) */
function domCanvas(w: number, h: number): SpriteCanvas { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

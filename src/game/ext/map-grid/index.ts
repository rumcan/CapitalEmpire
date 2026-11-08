// The map grid and the course half grid (T100). The owner, 2026-10-25: "lets have a subtle isometric grid on the map at all times and see if
// that enhances the building experience and when you are building the course you get a mini isometric grid that is exactly half the size of
// the one the roads and town uses. the golf course would then be able to make thin roads for cart paths etc."
// - The map grid: the 2 m tiles roads and lots snap to, as thin low-contrast lines over the ground and its paint, hidden on the roads (their
//   occupancy) and under every sprite. It is an evaluation option (Settings, the view toolbar, the G key): on by default in dev builds, off in
//   production until the owner decides. It fades out as the zoom goes out and is gone a little past the district tier.
// - The course half grid: 1 m cells (P21's course grid, course-grid's CELL_T), shown while a course building tool is on, over the course land
//   in view (the whole view outside a golf game). Every second line lies on a map grid line; those are drawn a touch stronger, so the
//   relation reads. Its 1 m lines thin out first as the zoom goes out.
// - Cart paths and drives in Course > Paths & drives snap to the half grid (snap.ts snapPoint's step, the engine's roadStep).
// This file is the pure part (no DOM, no GL; node tests import it): the setting, the zoom fades, the line weights the shader draws (a CPU
// mirror of its maths), when the half grid shows, and the land rectangles packed for the shader. layer.ts draws it with WebGL2.
// Units: tiles of 2 m on the map; css px and device px on screen.
// T339 (the owner, 2026-11-04: "add ticket to remove grid if lots ive already bought to expand the property"): the grid is for land that is not
// yet the player's. It is never drawn on land he owns, in any tool (ownedLand and propertyOf, at the end: the shader skips those tiles), a golf
// game has no half grid (all the land it covered is his: gridModes), and his property is outlined once, round the outside.
import { CELL_T } from '../course-grid';
import { HH, HW, TW } from '../../iso';

// ---- the setting ----

/** the localStorage key of the map grid setting ('1' on, '0' off) */
export const MAP_GRID_KEY = 'capitalempire.mapGrid';
/** a storage the setting reads and writes (localStorage fits; the tests pass a map) */
export interface GridStore { getItem(k: string): string | null; setItem(k: string, v: string): void }
/** whether the map grid setting starts on: the URL's ?grid=1 or ?grid=0 (the benchmark, a quick look), else the stored choice, else on.
 *  The grid only shows while a build or paint tool is in hand (gridShown; the owner, 2026-10-25: "only have the game grid when you are
 *  in a paint or build mode"), so it is on by default everywhere; `dev` is kept for callers and tests */
export function loadMapGrid(store: GridStore | null, _dev: boolean, query = ''): boolean {
  const q = new URLSearchParams(query).get('grid');
  if (q === '1' || q === '0') return q === '1';
  let v: string | null = null;
  try { v = store?.getItem(MAP_GRID_KEY) ?? null; } catch { /* storage may be unavailable */ }
  return v === '1' ? true : v === '0' ? false : true;
}
/** whether the map grid is drawn now: the setting is on and a build or paint tool is in hand (never in Select, where you look and inspect) */
export function gridShown(on: boolean, tool: string): boolean { return on && tool !== 'select'; }

/** which grids a frame draws: the 2 m map grid and the 1 m course half grid */
export interface GridModes { map: boolean; half: boolean }
/** what the frame draws for the tool in hand (into out: the draw path allocates nothing). The map grid follows the tool (gridShown). The half grid
 *  is the course building tools' (courseBuilding) and only outside a golf game: all the land it covered in one is the player's, and land the
 *  player owns draws no grid at all (T339; the owner, 2026-11-04: "remove grid if lots ive already bought to expand the property") */
export function gridModes(out: GridModes, on: boolean, tool: string, roadScope: 'town' | 'course', placingStructure: boolean, golf: boolean): GridModes {
  out.map = gridShown(on, tool);
  out.half = !golf && courseBuilding(tool, roadScope, placingStructure);
  return out;
}
/** remembers the map grid choice */
export function saveMapGrid(store: GridStore | null, on: boolean): void {
  try { store?.setItem(MAP_GRID_KEY, on ? '1' : '0'); } catch { /* storage may be unavailable */ }
}

// ---- the geometry ----

/** the half grid's cell in tiles: exactly half a map tile (1 m), P21's course grid cell */
export const HALF_T = CELL_T;
/** the map grid's cell in tiles (2 m) */
export const MAP_T = 1;
/** tiles across a grid line per device px of screen, at ze device px per world px: a tile axis (x or y) changes by 1/(2 HW ze) per device px
 *  across the screen and 1/(2 HH ze) down it, so a line of the grid is crossed at sqrt(1/128^2 + 1/64^2) / ze tiles per device px */
export const tilesPerPx = (ze: number) => Math.hypot(1 / 128, 1 / 64) / ze;

/** a line's coverage at d device px from its centre line, for a line hw device px either side (box-filtered, as the shader does) */
export function cover(d: number, hw: number): number { return Math.min(1, Math.max(0, hw + 0.5 - d)); }
/** the distance in units of step from v to the nearest multiple of step (0 on a line, 0.5 half way between) */
export function lineFrac(v: number, step: number): number { const f = v / step + 0.5; return Math.abs(f - Math.floor(f) - 0.5); }

// ---- the look ----

/** the lines' alphas at full strength: the map grid's 2 m lines; the half grid's 1 m lines (minor) and its 2 m lines (major, on the map grid's
 *  lines, a touch stronger than both); the colour is a warm white, premultiplied in the shader */
export const LOOK = { map: 0.1, minor: 0.075, major: 0.15 } as const;
/** the line width in css px (never under one device px) */
export const LINE_CSS = 0.8;

/** 0 at a, 1 at b, smooth between */
function smooth(a: number, b: number, v: number): number { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
/** the zoom fades at css zoom z: tile, the 2 m lines (a tile is TW z css px across: full from 22 px, gone at 13 px, so about a sixth at the
 *  district tier's 15 px and nothing at 10% zoom); cell, the 1 m lines (a cell is half that: full from 12 px, gone at 6.5 px, so they go first) */
export function gridFade(z: number): { tile: number; cell: number } {
  const px = TW * z;
  return { tile: smooth(13, 22, px), cell: smooth(6.5, 12, px / 2) };
}

/** what one frame of the grid draws: the alphas of the map grid's lines, the half grid's minor and major lines, the line half width (device
 *  px), and the tiles per device px across a line; all alphas 0 means nothing to draw */
export interface GridFrame { map: number; minor: number; major: number; hw: number; tpp: number }
/** the frame's grid at css zoom z and dpr: map, the map grid on; half, a course building tool on (into out: the draw path allocates nothing) */
export function gridFrame(out: GridFrame, z: number, dpr: number, map: boolean, half: boolean): GridFrame {
  const f = gridFade(z);
  out.map = map ? LOOK.map * f.tile : 0;
  out.minor = half ? LOOK.minor * f.cell : 0;
  out.major = half ? LOOK.major * f.tile : 0;
  out.hw = Math.max(1, LINE_CSS * dpr) / 2;
  out.tpp = tilesPerPx(z * dpr);
  return out;
}
/** whether a frame draws anything */
export const frameDraws = (f: GridFrame) => f.map >= 0.004 || f.minor >= 0.004 || f.major >= 0.004;

/** the line alpha the shader draws at tile (x, y) (its CPU mirror, for the tests): inLand 1 inside the course land (0 outside, the half grid
 *  not drawn there); the map grid's lines everywhere, the half grid's minor and major lines on the land, the strongest of them wins */
export function alphaAt(f: GridFrame, x: number, y: number, inLand = 1): number {
  const dM = Math.min(lineFrac(x, MAP_T), lineFrac(y, MAP_T)) * MAP_T / f.tpp, cM = cover(dM, f.hw);
  let a = cM * f.map;
  if (inLand > 0 && (f.minor > 0 || f.major > 0)) {
    const dH = Math.min(lineFrac(x, HALF_T), lineFrac(y, HALF_T)) * HALF_T / f.tpp, cH = cover(dH, f.hw);
    const h = Math.max(cH * f.minor, cM * f.major);
    a = a + (Math.max(a, h) - a) * inLand;
  }
  return a;
}

// ---- when the half grid shows ----

/** a course building tool is on, from the engine's tool, the road tool's scope, and whether an event structure is being placed: the Course
 *  menu's tools (paint brush, Shape, pieces, the clubhouse: tool 'course'), Paths & drives (the road tool in the course scope) and the event
 *  structures */
export function courseBuilding(tool: string, roadScope: 'town' | 'course', placingStructure: boolean): boolean {
  return tool === 'course' || (tool === 'road' && roadScope === 'course') || placingStructure;
}

// ---- the course land for the shader ----

/** the most land rectangles the shader takes; more are drawn as their bounds */
export const MAX_LAND = 32;
/** a rectangle in tiles: x, y, w, h (golf/mode's Rect) */
export type LandRect = readonly [number, number, number, number];
/** packs land rectangles as x0 y0 x1 y1 into out (MAX_LAND * 4 floats) and returns how many: -1 for no land (the half grid covers the whole
 *  view: outside a golf game), the rectangles' bounds as one when there are more than MAX_LAND; empty rectangles are left out */
export function packLand(rects: readonly LandRect[], out: Float32Array): number {
  let n = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    if (!(r[2] > 0 && r[3] > 0)) continue;
    x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[0] + r[2]); y1 = Math.max(y1, r[1] + r[3]);
    if (n < MAX_LAND) { out[4 * n] = r[0]; out[4 * n + 1] = r[1]; out[4 * n + 2] = r[0] + r[2]; out[4 * n + 3] = r[1] + r[3]; }
    n++;
  }
  if (n === 0) return -1;
  if (n > MAX_LAND) { out[0] = x0; out[1] = y0; out[2] = x1; out[3] = y1; return 1; }
  return n;
}
/** the half grid's weight at tile (x, y) for packed land (the shader's): 1 inside, fading to 0 over FADE_T tiles outside */
export const LAND_FADE_T = 1.5;
export function landAt(land: Float32Array, n: number, x: number, y: number): number {
  if (n < 0) return 1;
  let sd = Infinity;
  for (let i = 0; i < n; i++) sd = Math.min(sd, Math.max(land[4 * i]! - x, x - land[4 * i + 2]!, land[4 * i + 1]! - y, y - land[4 * i + 3]!));
  return 1 - smooth(0, LAND_FADE_T, sd);
}

// ---- the player's own land (T339) ----
// The owner, 2026-11-04 (his own course land, the faint diamond grid and a gold plot outline still drawn over it): "add ticket to remove grid if
// lots ive already bought to expand the property". The grid is for land that is not yet the player's (what he could still buy or build on): it is
// never drawn on the land he owns, in any tool, and his property is outlined once, round the outside, with no line between the blocks he bought one
// by one. The land is the golf game's own (Game.ownedAt: the course and the parcels, less the practice area still for sale), made into disjoint
// rectangles for the shader and the straight lines round them for the outline. Pure, like the rest of this file.

/** the most owned rectangles the shader takes; a longer list leaves the smallest off (their land keeps its grid), never a bounding box, which
 *  would take the land for sale between them */
export const MAX_OWNED = 32;
/** the player's land: disjoint rectangles (x, y, w, h) covering exactly the owned tiles, the biggest first, and the lines round it (x0 y0 x1 y1 in
 *  tiles, each as long as the boundary runs straight; none where two blocks meet) */
export interface OwnedLand { readonly rects: readonly LandRect[]; readonly outline: readonly number[] }
/** no land (not a golf game, or nothing owned) */
export const NO_LAND: OwnedLand = { rects: [], outline: [] };

/** a coordinate rounded to 1e-4 tile, so edges that should meet do */
const snap = (v: number) => Math.round(v * 1e4) / 1e4;
/** the land the rectangles in own cover, less the rectangles in holes (empty rectangles are left out), as disjoint rectangles and the outline round
 *  it, with a line round each hole. Worked out on the cells between the rectangles' edges (a few dozen a side, however big the land), once per change */
export function ownedLand(own: readonly LandRect[], holes: readonly LandRect[] = []): OwnedLand {
  const O = own.filter(r => r[2] > 0 && r[3] > 0), Q = holes.filter(r => r[2] > 0 && r[3] > 0);
  if (!O.length) return NO_LAND;
  const ex = new Set<number>(), ey = new Set<number>();
  for (const r of O.concat(Q)) { ex.add(snap(r[0])); ex.add(snap(r[0] + r[2])); ey.add(snap(r[1])); ey.add(snap(r[1] + r[3])); }
  const xs = [...ex].sort((a, b) => a - b), ys = [...ey].sort((a, b) => a - b), nx = xs.length - 1, ny = ys.length - 1;
  const ix = new Map(xs.map((v, i) => [v, i])), iy = new Map(ys.map((v, i) => [v, i]));
  const cell = new Uint8Array(nx * ny);
  const fill = (r: LandRect, v: number) => {
    const i0 = ix.get(snap(r[0]))!, i1 = ix.get(snap(r[0] + r[2]))!, j0 = iy.get(snap(r[1]))!, j1 = iy.get(snap(r[1] + r[3]))!;
    for (let j = j0; j < j1; j++) cell.fill(v, j * nx + i0, j * nx + i1);
  };
  for (const r of O) fill(r, 1);
  for (const r of Q) fill(r, 0);
  // the rectangles: each row's runs of owned cells; a run the next row repeats grows the rectangle down
  const rects: LandRect[] = [];
  let open = new Map<string, number>();
  for (let j = 0; j <= ny; j++) {
    const now = new Map<string, number>();
    for (let i = 0; j < ny && i < nx;) {
      if (!cell[j * nx + i]) { i++; continue; }
      let e = i + 1; while (e < nx && cell[j * nx + e]) e++;
      const k = `${i},${e}`; now.set(k, open.get(k) ?? j); i = e;
    }
    for (const [k, j0] of open) if (!now.has(k)) { const [i0, i1] = k.split(',').map(Number) as [number, number]; rects.push([xs[i0]!, ys[j0]!, xs[i1]! - xs[i0]!, ys[j]! - ys[j0]!]); }
    open = now;
  }
  rects.sort((a, b) => b[2] * b[3] - a[2] * a[3] || a[1] - b[1] || a[0] - b[0]);
  // the outline: where an owned cell meets one that is not (or the edge of the cells), runs of them as one straight line
  const outline: number[] = [], at = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && cell[j * nx + i] === 1;
  for (let j = 0; j <= ny; j++) for (let i = 0; i < nx;) {
    if (at(i, j - 1) === at(i, j)) { i++; continue; }
    let e = i + 1; while (e < nx && at(e, j - 1) !== at(e, j)) e++;
    outline.push(xs[i]!, ys[j]!, xs[e]!, ys[j]!); i = e;
  }
  for (let i = 0; i <= nx; i++) for (let j = 0; j < ny;) {
    if (at(i - 1, j) === at(i, j)) { j++; continue; }
    let e = j + 1; while (e < ny && at(i - 1, e) !== at(i, e)) e++;
    outline.push(xs[i]!, ys[j]!, xs[i]!, ys[e]!); j = e;
  }
  return rects.length ? { rects, outline } : NO_LAND;
}
/** whether the land holds tile point (x, y) (the shader's test: a rectangle holds its near edges, not its far ones, as Game.ownedAt does) */
export function landOwns(land: OwnedLand, x: number, y: number): boolean {
  for (const r of land.rects) if (x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]) return true;
  return false;
}
/** the grid's alpha at tile (x, y) with the player's land left clear (the CPU mirror of the whole shader: it discards owned tiles first) */
export function gridAlphaAt(f: GridFrame, land: OwnedLand | null, x: number, y: number, inLand = 1): number {
  return land && landOwns(land, x, y) ? 0 : alphaAt(f, x, y, inLand);
}
/** packs the land's rectangles as x0 y0 x1 y1 into out (MAX_OWNED * 4 floats) and returns how many (at most MAX_OWNED, the biggest) */
export function packOwned(land: OwnedLand, out: Float32Array): number {
  const n = Math.min(land.rects.length, MAX_OWNED);
  for (let i = 0; i < n; i++) { const r = land.rects[i]!; out[4 * i] = r[0]; out[4 * i + 1] = r[1]; out[4 * i + 2] = r[0] + r[2]; out[4 * i + 3] = r[1] + r[3]; }
  return n;
}
/** whether the whole view lies inside one packed rectangle (n of them): nothing on screen is land the grid may draw on, so the pass is skipped. The
 *  view's four corners are tiles by the shader's inverse (x = (X / HW + Y / HH) / 2, y = (Y / HH - X / HW) / 2, X and Y world px); a rectangle is
 *  convex, so one that holds the corners holds the view */
export function viewInOwned(rects: Float32Array, n: number, v: { X: number; Y: number; ze: number; cw: number; ch: number }): boolean {
  if (n <= 0) return false;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < 4; k++) {
    const X = ((k & 1 ? v.cw : 0) - v.cw / 2) / v.ze + v.X, Y = ((k & 2 ? v.ch : 0) - v.ch / 2) / v.ze + v.Y, a = X / HW, b = Y / HH, x = (a + b) / 2, y = (b - a) / 2;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  for (let i = 0; i < n; i++) if (x0 >= rects[4 * i]! && y0 >= rects[4 * i + 1]! && x1 < rects[4 * i + 2]! && y1 < rects[4 * i + 3]!) return true;
  return false;
}

/** what the property is made of: a golf game's course, parcel bounds, parcel list (an older save has none: its one parcel) and the practice area
 *  still for sale (GolfSave fits) */
export interface PropertyHost { course: LandRect; parcel: LandRect; parcels?: readonly LandRect[]; practiceLot?: LandRect }
/** the player's land in a golf game (none outside one): the course and the parcels, less the practice area still for sale (Game.ownedAt's rule).
 *  Its outline goes round the whole plot, the practice area inside it included: that has its own (white) survey line, no gold one */
export function propertyOf(g: PropertyHost | null): OwnedLand {
  if (!g) return NO_LAND;
  const all = [g.course, ...(g.parcels ?? [g.parcel])], whole = ownedLand(all);
  if (!g.practiceLot) return whole;
  return { rects: ownedLand(all, [g.practiceLot]).rects, outline: whole.outline };
}
/** a rectangle's weight in propertySig: its four numbers each times a different factor from k up */
const rectSig = (r: LandRect, k: number) => r[0] * k + r[1] * (k + 1) + r[2] * (k + 2) + r[3] * (k + 3);
/** a number that changes with the rectangles the property is made of (an in-place edit shows too); allocates nothing */
function propertySig(g: PropertyHost): number {
  let s = rectSig(g.course, 1) + rectSig(g.parcel, 5), k = 9;
  if (g.parcels) { s += 1e9 * (1 + g.parcels.length); for (const r of g.parcels) { s += rectSig(r, k); k += 4; } }
  if (g.practiceLot) s += 7e8 + rectSig(g.practiceLot, k);
  return s;
}
/** the property of a golf game, kept: propertyOf made again only when the game, its lists or any rectangle in them change (a few compares a frame) */
export class PropertyMemo {
  private g: PropertyHost | null = null; private sig = NaN; private land: OwnedLand = NO_LAND;
  of(g: PropertyHost | null): OwnedLand {
    if (!g) return NO_LAND;
    const sig = propertySig(g);
    if (g !== this.g || sig !== this.sig) { this.g = g; this.sig = sig; this.land = propertyOf(g); }
    return this.land;
  }
}

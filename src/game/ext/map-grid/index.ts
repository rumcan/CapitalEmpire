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
import { CELL_T } from '../course-grid';
import { TW } from '../../iso';

// ---- the setting ----

/** the localStorage key of the map grid setting ('1' on, '0' off) */
export const MAP_GRID_KEY = 'capitalempire.mapGrid';
/** a storage the setting reads and writes (localStorage fits; the tests pass a map) */
export interface GridStore { getItem(k: string): string | null; setItem(k: string, v: string): void }
/** whether the map grid starts on: the URL's ?grid=1 or ?grid=0 (the benchmark, a quick look), else the stored choice, else on in dev builds
 *  and off in production (the owner judges it in dev first) */
export function loadMapGrid(store: GridStore | null, dev: boolean, query = ''): boolean {
  const q = new URLSearchParams(query).get('grid');
  if (q === '1' || q === '0') return q === '1';
  let v: string | null = null;
  try { v = store?.getItem(MAP_GRID_KEY) ?? null; } catch { /* storage may be unavailable */ }
  return v === '1' ? true : v === '0' ? false : dev;
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

// T445 (the owner: "only a wide strip of rough and long grass around the edge of the fairways and not a lot of long grass over the entire map, for the
// downloaded courses"): a downloaded course's rough as a band beside its play, not a blanket over its whole outline. After the spec's areas are painted
// (raster.ts paintSpec: the boundary and the mapped rough lay rough everywhere first), every cell of rough or bare ground on the course's land is measured
// from the nearest fairway, tee or green, or the nearest hole line (a par 3 with no fairway, the carry from the tee): within ROUGH_M it is rough, out to
// ROUGH_M + LONG_M it is long grass, and beyond it is the land's own ground (none: what the map has there; the map's woods stay, they are trees, not ground).
// The first cut (FIRST_CUT_M) is not painted here: the course draws it as a collar of the fairway over the rough (course-grid areas.ts COLLAR_SURFACE).
// Both edges wobble by a smooth noise of the cell's place on the map (two octaves at unrelated wavelengths, so no pattern repeats), never a ruler line.
// The game's areas and the view from behind the golfer (play/export3p.ts, through the engine's courseAreaList) read the painted grid, so both show the same band.
// Pure TypeScript, no DOM, deterministic: the same spec at the same place gives the same cells.
import { CELL_T, SURF, type Grid } from '../../ext/course-grid';
import { TILE_M } from '../types';
import type { OsmCourseSpec } from './types';

/** the first cut beside a fairway, m: drawn by the fairway's collar, not painted */
export const FIRST_CUT_M = 2;
/** the rough band, m from the edge of the fairway, tee or green (the first cut inside it) to where the long grass starts */
export const ROUGH_M = 11;
/** the long grass: the band's outer metres, beyond the rough. The whole band is ROUGH_M + LONG_M = 15 m */
export const LONG_M = 4;
/** how far each edge wanders in and out, m (a soft edge) */
export const EDGE_WOBBLE_M = 2;
/** the wobble's two wavelengths, m (unrelated, so the edge never repeats) */
const WAVE_M = [23.7, 7.3] as const;

/** a 32-bit hash of a lattice point and a seed, as a float in [0, 1) */
function hash(ix: number, iy: number, s: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(s, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** smooth value noise in [-1, 1] at (x, y) metres for a wavelength and seed */
function vnoise(x: number, y: number, wave: number, s: number): number {
  const u = x / wave, v = y / wave, ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return 2 * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) - 1;
}
/** an edge's wobble at (x, y) metres, m: two octaves, at most EDGE_WOBBLE_M either way */
export const wobble = (x: number, y: number, s: number): number => EDGE_WOBBLE_M * (0.65 * vnoise(x, y, WAVE_M[0], s) + 0.35 * vnoise(x, y, WAVE_M[1], s + 7));

/** the band over the spec's land laid at (ox, oy) on g (tiles; as paintSpec): the cells of rough or none become rough, long grass or none by their distance
 *  from the play (fairway, tee and green cells, and the hole lines). Returns how many cells became rough and long grass */
export function roughBand(g: Grid, spec: OsmCourseSpec, ox: number, oy: number): { rough: number; long: number } {
  // the land's cells on g
  const cx0 = Math.max(0, Math.floor((ox - g.x0) / CELL_T)), cy0 = Math.max(0, Math.floor((oy - g.y0) / CELL_T));
  const cx1 = Math.min(g.w, Math.ceil((ox + spec.w - g.x0) / CELL_T)), cy1 = Math.min(g.h, Math.ceil((oy + spec.h - g.y0) / CELL_T));
  const W = cx1 - cx0, H = cy1 - cy0;
  // (a land with no holes keeps the ground it was painted with: there is no play to lay a band beside)
  if (W <= 0 || H <= 0 || !spec.holes.length) return { rough: -1, long: 0 };
  const cellM = CELL_T * TILE_M, far = (ROUGH_M + LONG_M + EDGE_WOBBLE_M + 1) / cellM, INF = 1e9;
  const d = new Float32Array(W * H).fill(INF), { surf } = g;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = surf[(y + cy0) * g.w + x + cx0]!;
    if (s === SURF.fairway || s === SURF.tee || s === SURF.green) d[y * W + x] = 0;
  }
  // the hole lines (tee to green), sampled every half cell
  for (const h of spec.holes) {
    const L = h.line;
    for (let k = 0; k + 3 < L.length; k += 2) {
      const ax = (L[k]! + ox - g.x0) / CELL_T - cx0, ay = (L[k + 1]! + oy - g.y0) / CELL_T - cy0, bx = (L[k + 2]! + ox - g.x0) / CELL_T - cx0, by = (L[k + 3]! + oy - g.y0) / CELL_T - cy0;
      const n = Math.max(1, Math.ceil(2 * Math.hypot(bx - ax, by - ay)));
      for (let j = 0; j <= n; j++) {
        const x = Math.floor(ax + (bx - ax) * j / n), y = Math.floor(ay + (by - ay) * j / n);
        if (x >= 0 && y >= 0 && x < W && y < H) d[y * W + x] = 0;
      }
    }
  }
  // the distance (cells) to the nearest play: a two-pass chamfer (1, sqrt 2), close enough for a band whose edges wobble by metres
  const D = Math.SQRT2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let v = d[i]!;
    if (v === 0) continue;
    if (x > 0 && d[i - 1]! + 1 < v) v = d[i - 1]! + 1;
    if (y > 0) {
      const u = i - W;
      if (d[u]! + 1 < v) v = d[u]! + 1;
      if (x > 0 && d[u - 1]! + D < v) v = d[u - 1]! + D;
      if (x + 1 < W && d[u + 1]! + D < v) v = d[u + 1]! + D;
    }
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; let v = d[i]!;
    if (v === 0) continue;
    if (x + 1 < W && d[i + 1]! + 1 < v) v = d[i + 1]! + 1;
    if (y + 1 < H) {
      const u = i + W;
      if (d[u]! + 1 < v) v = d[u]! + 1;
      if (x + 1 < W && d[u + 1]! + D < v) v = d[u + 1]! + D;
      if (x > 0 && d[u - 1]! + D < v) v = d[u - 1]! + D;
    }
    d[i] = v;
  }
  // rough, long grass or the land's own ground, by the distance and the two wobbling edges (their noise at the cell's place on the map, metres)
  let rough = 0, long = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gi = (y + cy0) * g.w + x + cx0, s = surf[gi]!;
    if (s !== SURF.rough && s !== SURF.none) continue;
    const dm = d[y * W + x]! * cellM;
    let to: number = SURF.none;
    if (dm < far * cellM) {
      const mx = (g.x0 + (x + cx0 + 0.5) * CELL_T) * TILE_M, my = (g.y0 + (y + cy0 + 0.5) * CELL_T) * TILE_M;
      to = dm < ROUGH_M + wobble(mx, my, 1) ? SURF.rough : dm < ROUGH_M + LONG_M + wobble(mx, my, 2) ? SURF.longGrass : SURF.none;
    }
    if (to !== s || (to === SURF.none && g.hole[gi])) { surf[gi] = to; if (to === SURF.none) { g.hole[gi] = 0; g.month[gi] = 0; } }
    if (to === SURF.rough) rough++; else if (to === SURF.longGrass) long++;
  }
  return { rough, long };
}

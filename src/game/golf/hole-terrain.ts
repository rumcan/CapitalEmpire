// Per-hole terrain from the course height field (T037): how a hole climbs, how hilly it is, its steepest stretch and its plays-like length. Pure TS, no DOM.
import type { Pt } from '../network';
import { sampleCourseHeight, type CourseHeightField } from '../ext/course-height';
import type { Hole } from './holes';
import { TILE_M } from './types';

/** the spacing (tiles) at which a hole's line is sampled (one course height sample is 2 tiles) */
export const TERRAIN_STEP = 2;
/** metres of plays-like length per metre the pin sits above the tee (a golf rule of thumb: 1 m up plays about 1 m longer; downhill shortens it) */
export const PLAYS_LIKE_PER_M = 1;
/** distances (tiles) below this are treated as zero */
const EPS = 1e-6;

/** a hole's terrain along its played line (heights in metres, slopes in metres per metre) */
export interface HoleTerrain {
  hole: number;
  /** the height at the tee (the line's first point) and at the pin (its last) */
  teeM: number; pinM: number;
  /** pinM − teeM: > 0 the hole plays uphill */
  riseM: number;
  /** the lowest and highest height along the line, and their difference */
  minM: number; maxM: number; reliefM: number;
  /** the steepest slope between two neighbouring samples along the line (|Δh| / distance) */
  maxSlope: number;
  /** the hole's length plus riseM × PLAYS_LIKE_PER_M, never below half its length */
  playsLikeM: number;
}

/** the points every TERRAIN_STEP tiles along a polyline (tiles), its first and last points included; a line of one point gives that point */
export function sampleLine(line: readonly Pt[], step = TERRAIN_STEP): Pt[] {
  const out: Pt[] = [];
  if (!line.length) return out;
  const h = step > 0 ? step : TERRAIN_STEP, first = line[0]!, last = line[line.length - 1]!;
  let total = 0;
  for (let i = 1; i < line.length; i++) total += Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y);
  out.push({ x: first.x, y: first.y });
  let acc = 0, next = h;
  for (let i = 0; i + 1 < line.length && next < total - EPS; i++) {
    const p = line[i]!, q = line[i + 1]!, L = Math.hypot(q.x - p.x, q.y - p.y);
    if (!(L > 0)) continue;
    for (; next <= acc + L && next < total - EPS; next += h) { const u = (next - acc) / L; out.push({ x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u }); }
    acc += L;
  }
  if (total > EPS) out.push({ x: last.x, y: last.y });
  return out;
}

/** the terrain of one hole on this field */
export function holeTerrain(field: CourseHeightField, hole: Hole): HoleTerrain {
  const pts = sampleLine(hole.line);
  const h = pts.map(p => sampleCourseHeight(field, p.x, p.y));
  let minM = 0, maxM = 0, maxSlope = 0;
  for (let k = 0; k < h.length; k++) {
    if (k === 0 || h[k]! < minM) minM = h[k]!;
    if (k === 0 || h[k]! > maxM) maxM = h[k]!;
    if (k + 1 < h.length) {
      const d = Math.hypot(pts[k + 1]!.x - pts[k]!.x, pts[k + 1]!.y - pts[k]!.y);
      if (d >= EPS) maxSlope = Math.max(maxSlope, Math.abs(h[k + 1]! - h[k]!) / (d * TILE_M));
    }
  }
  const teeM = h.length ? h[0]! : 0, pinM = h.length ? h[h.length - 1]! : 0, riseM = pinM - teeM;
  return {
    hole: hole.n,
    teeM: teeM + 0, pinM: pinM + 0, riseM: riseM + 0,
    minM: minM + 0, maxM: maxM + 0, reliefM: maxM - minM + 0,
    maxSlope: maxSlope + 0,
    playsLikeM: Math.max(hole.lengthM / 2, hole.lengthM + riseM * PLAYS_LIKE_PER_M) + 0,
  };
}

/** the terrain of every hole */
export function courseTerrain(field: CourseHeightField, holes: readonly Hole[]): HoleTerrain[] {
  return holes.map(hole => holeTerrain(field, hole));
}

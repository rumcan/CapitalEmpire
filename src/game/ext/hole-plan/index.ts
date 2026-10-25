// The hole plan (plan P21, T074): centripetal Catmull-Rom centre line, variable fairway widths,
// organic green/tee placement, footprint rasterisation, undo diffs, and compact plan serialization.
// Pure TypeScript, no DOM, deterministic.
// Units: positions in tiles of 2 m; widths, lengths, areas and distances in metres/m²; turns in degrees.
//
// Speed (T074b): the line, its arc length, normals, the sorted widths and each bend's s and turn are computed once per
// plan (`planGeom`, cached by the plan's tuple), and the footprint is rasterised as row spans on a local box: the rough
// corridor is a union of discs along the line and the fairway a union of quads between line samples, so neither folds on
// a hairpin and a 3-bend hole rasters in a few milliseconds.

import {
  CELL_T,
  SURF,
  laidMonth,
  type Grid,
  type GridDiff,
  type Pt,
} from '../course-grid';
import { parFromLength } from '../../golf/holes';
import { buildArchetypePolygon, type CoursePieceArchetype } from '../course-snap';
import type { AimPoint, CourseArea } from '../../golf/types';

export { parFromLength };
export type { Pt, AimPoint };

/** supported archetype green shapes */
export type GreenShape = 'round' | 'kidney' | 'peanut' | 'pear' | CoursePieceArchetype;

/** the green shapes a saved plan may hold (decodePlan accepts these and no others) */
export const GREEN_SHAPES: readonly GreenShape[] = ['round', 'kidney', 'peanut', 'pear', 'green-kidney', 'green-peanut', 'green-practice'];

/** fairway width handle at distance s metres along centre line */
export interface WidthHandle {
  /** distance in metres from the back tee */
  s: number;
  /** fairway width in metres */
  w: number;
}

/** the declarative plan of a single golf hole */
export interface HolePlan {
  /** hole number (1..18) */
  hole: number;
  /** back tee location in tile coordinates */
  tee: Pt;
  /** green pin location in tile coordinates */
  green: Pt;
  /** green archetype shape */
  greenShape: GreenShape;
  /** green area in m² (default 550 m²) */
  greenM2: number;
  /** green orientation turn angle in degrees */
  greenTurn: number;
  /** intermediate dogleg aim points in tile coordinates (0 to 3) */
  bends: Pt[];
  /** fairway width control handles along the line */
  widths: WidthHandle[];
  /** distance in metres from tee where fairway begins */
  fwStart: number;
  /** deterministic seed for edge swell noise (0 = no swell) */
  seed: number;
}

/** summary information for a hole plan */
export interface PlanInfo {
  /** total playing length in metres */
  lengthM: number;
  /** regulation par (3, 4, or 5) */
  par: 3 | 4 | 5;
  /** approximate area in m² per surface */
  m2: {
    tee: number;
    fairway: number;
    green: number;
    rough: number;
  };
}

/** interactive editor handles for a hole plan (positions in tiles) */
export interface PlanHandles {
  tee: Pt;
  green: Pt;
  bends: Pt[];
  /** one per width handle: its s (m), width (m) and the two points on the drawn fairway edges (tiles) */
  widths: { s: number; w: number; left: Pt; right: Pt }[];
  /** '+' points on the line, one per leg (between consecutive control points), where a new bend can be inserted */
  insertPoints: Pt[];
}

/** a bend as the raster sees it: its distance along the line (m), the side its outside is on (-1 left, 1 right; left is the
 *  line's left normal (-dy, dx)), and its turn angle (degrees, 0 = straight on) */
export interface BendInfo { s: number; out: -1 | 1; turn: number }

/** the plan's geometry, computed once per plan: the centre line samples (tiles, about 1 m apart) with their distance from the
 *  back tee (m) and unit left normals (-dy, dx), the line length (m), the width handles sorted by s, where the fairway ends (m,
 *  under the green), the green radius (m) and the bends */
export interface PlanGeom {
  line: Pt[];
  s: Float64Array;
  nx: Float64Array;
  ny: Float64Array;
  lengthM: number;
  widths: WidthHandle[];
  fwEnd: number;
  greenR: number;
  bends: BendInfo[];
}

/** a footprint on a local box of the grid: the box's first cell column and row and its size (cells), and per cell the surface
 *  the plan puts there (0 = not in the footprint) */
export interface PlanRaster { cx0: number; cy0: number; w: number; h: number; s: Uint8Array }

/** the outside of a bend gets this much more fairway width at a turn of BEND_FULL_DEG or more (P21 3.3) */
export const BEND_BOOST = 0.15;
/** the turn angle (degrees) at which a bend's outside gets the full BEND_BOOST; smaller turns get a linear share */
export const BEND_FULL_DEG = 45;
/** the bend boost fades out over this distance (m) either side of the bend */
const BEND_REACH = 35;
/** the rough corridor reaches this far (m) from the centre line (P21: the 60 m corridor) */
export const CORRIDOR_M = 30;
/** the fairway's rounded nose at its start and its taper under the green, in metres along the line */
const NOSE_M = 8;
/** the tee box: 28 x 10 m, a rounded strip along the line (P21 3.3) */
const TEE_LEN_M = 28;
const TEE_WID_M = 10;

/** distance between two points in tiles */
function ptDist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** the green's radius in metres for an area in m² (as a circle) */
function greenRadius(m2: number): number {
  return Math.sqrt(Math.max(1, m2) / Math.PI);
}

/** default hole plan parameters derived from tee, green and par defaults (P21 section 2.3 and 3.3). Stations are measured
 *  along the real centre line (a dogleg's curve is longer than its straight legs), so the last handle sits at the green front. */
export function defaultPlan(
  hole: number,
  tee: Pt,
  green: Pt,
  bends: Pt[] = [],
): HolePlan {
  const base: HolePlan = {
    hole,
    tee: { x: tee.x, y: tee.y },
    green: { x: green.x, y: green.y },
    greenShape: 'kidney',
    greenM2: 550,
    greenTurn: 0,
    bends: bends.map((b) => ({ x: b.x, y: b.y })),
    widths: [],
    fwStart: 0,
    seed: 0,
  };
  const line = centreLine(base);
  let lenTiles = 0;
  for (let i = 1; i < line.length; i++) lenTiles += ptDist(line[i - 1]!, line[i]!);
  const totalM = lenTiles * 2; // 1 tile = 2 m
  const par = parFromLength(Math.round(totalM));
  // approach heading for green orientation: the line's direction over its last ~20 m
  const back = line[Math.max(0, line.length - 21)]!;
  base.greenTurn = (Math.atan2(green.y - back.y, green.x - back.x) * 180) / Math.PI;
  const front = Math.round(totalM - greenRadius(base.greenM2)); // the green front, m from the back tee

  if (par === 3) {
    // Par 3: no fairway; an approach apron 18 m wide over the last 25 m before the green
    const apronStart = Math.max(0, front - 25);
    base.widths = [
      { s: apronStart, w: 18 },
      { s: Math.max(apronStart + 1, front), w: 18 },
    ];
    base.fwStart = apronStart;
    return base;
  }

  if (par === 4) {
    // Par 4: fairway from fwStart; widths 30 at fwStart, 40 at landing, 28 at 50 m out, 22 at green front
    const fwStart = Math.min(100, Math.max(30, Math.round(totalM - 90)));
    const sFront = Math.max(fwStart + 30, front);
    const sLanding = Math.min(210, Math.round(fwStart + (sFront - fwStart) * 0.55));
    const s50 = Math.min(Math.max(sLanding + 20, Math.round(totalM - 50)), sFront - 15);
    base.widths = [
      { s: fwStart, w: 30 },
      { s: sLanding, w: 40 },
      { s: s50, w: 28 },
      { s: sFront, w: 22 },
    ];
    base.fwStart = fwStart;
    return base;
  }

  // Par 5: as par 4, plus 32 at 300 and second landing 38 at 390
  const sFront = Math.max(160, front);
  const s50 = Math.min(Math.max(410, Math.round(totalM - 50)), sFront - 15);
  base.widths = [
    { s: 100, w: 30 },
    { s: 210, w: 40 },
    { s: 300, w: 32 },
    { s: 390, w: 38 },
    { s: s50, w: 28 },
    { s: sFront, w: 22 },
  ];
  base.fwStart = 100;
  return base;
}

let lineKey = '';
let lineVal: Pt[] = [];
/** centripetal Catmull-Rom spline through tee, bends and green, sampled every 1 m (0.5 tile); the last line is kept (a re-plan asks
 *  for the same control points twice: defaultPlan, then planGeom) */
export function centreLine(plan: HolePlan): Pt[] {
  const ctrl = [plan.tee, ...plan.bends, plan.green];
  let key = '';
  for (const p of ctrl) key += `${p.x},${p.y};`;
  if (key !== lineKey) { lineVal = lineThrough(ctrl, plan.green); lineKey = key; }
  return lineVal.slice();
}

/** the centre line through the control points (see centreLine) */
function lineThrough(ctrl: Pt[], greenPt: Pt): Pt[] {
  const plan = { green: greenPt };
  if (ctrl.length === 2) {
    // straight line
    const p0 = ctrl[0]!;
    const p1 = ctrl[1]!;
    const dist = ptDist(p0, p1);
    const steps = Math.max(1, Math.round(dist / CELL_T));
    const out: Pt[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      out.push({
        x: p0.x + t * (p1.x - p0.x),
        y: p0.y + t * (p1.y - p0.y),
      });
    }
    return out;
  }

  // Centripetal Catmull-Rom (alpha = 0.5)
  // Extrapolate phantom points at ends
  const pts: Pt[] = [
    { x: 2 * ctrl[0]!.x - ctrl[1]!.x, y: 2 * ctrl[0]!.y - ctrl[1]!.y },
    ...ctrl,
    {
      x: 2 * ctrl[ctrl.length - 1]!.x - ctrl[ctrl.length - 2]!.x,
      y: 2 * ctrl[ctrl.length - 1]!.y - ctrl[ctrl.length - 2]!.y,
    },
  ];

  // Dense evaluation points
  const dense: Pt[] = [];
  const alpha = 0.5;

  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2]!;

    const d01 = Math.pow(ptDist(p0, p1), alpha) || 1e-4;
    const d12 = Math.pow(ptDist(p1, p2), alpha) || 1e-4;
    const d23 = Math.pow(ptDist(p2, p3), alpha) || 1e-4;

    const t0 = 0;
    const t1 = t0 + d01;
    const t2 = t1 + d12;
    const t3 = t2 + d23;

    const segDistTiles = ptDist(p1, p2);
    const segSteps = Math.max(4, Math.ceil(segDistTiles / 0.25));

    for (let step = 0; step < segSteps; step++) {
      const t = t1 + (step / segSteps) * (t2 - t1);
      // Pyramidal Catmull-Rom formulation
      const a1x = ((t1 - t) * p0.x + (t - t0) * p1.x) / (t1 - t0);
      const a1y = ((t1 - t) * p0.y + (t - t0) * p1.y) / (t1 - t0);
      const a2x = ((t2 - t) * p1.x + (t - t1) * p2.x) / (t2 - t1);
      const a2y = ((t2 - t) * p1.y + (t - t1) * p2.y) / (t2 - t1);
      const a3x = ((t3 - t) * p2.x + (t - t2) * p3.x) / (t3 - t2);
      const a3y = ((t3 - t) * p2.y + (t - t2) * p3.y) / (t3 - t2);

      const b1x = ((t2 - t) * a1x + (t - t0) * a2x) / (t2 - t0);
      const b1y = ((t2 - t) * a1y + (t - t0) * a2y) / (t2 - t0);
      const b2x = ((t3 - t) * a2x + (t - t1) * a3x) / (t3 - t1);
      const b2y = ((t3 - t) * a2y + (t - t1) * a3y) / (t3 - t1);

      const cx = ((t2 - t) * b1x + (t - t1) * b2x) / (t2 - t1);
      const cy = ((t2 - t) * b1y + (t - t1) * b2y) / (t2 - t1);
      dense.push({ x: cx, y: cy });
    }
  }
  dense.push({ x: plan.green.x, y: plan.green.y });

  // Sample dense curve at uniform 1 m (0.5 tile) arc length intervals
  const d: number[] = new Array(dense.length);
  d[0] = 0;
  for (let i = 0; i < dense.length - 1; i++) {
    d[i + 1] = d[i]! + ptDist(dense[i]!, dense[i + 1]!);
  }
  const totalLengthTiles = d[dense.length - 1]!;
  const stepCount = Math.max(1, Math.round(totalLengthTiles / CELL_T));
  const out: Pt[] = [dense[0]!];

  let curIdx = 0;
  for (let s = 1; s < stepCount; s++) {
    const targetDist = s * CELL_T;
    while (curIdx < dense.length - 2 && d[curIdx + 1]! < targetDist) {
      curIdx++;
    }
    const segLen = d[curIdx + 1]! - d[curIdx]!;
    const t = segLen > 1e-9 ? (targetDist - d[curIdx]!) / segLen : 0;
    out.push({
      x: dense[curIdx]!.x + t * (dense[curIdx + 1]!.x - dense[curIdx]!.x),
      y: dense[curIdx]!.y + t * (dense[curIdx + 1]!.y - dense[curIdx]!.y),
    });
  }
  out.push(dense[dense.length - 1]!);
  return out;
}

/** smoothstep between 0 and 1 */
function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** the plan's geometry (see PlanGeom), computed from scratch */
export function planGeom(plan: HolePlan): PlanGeom {
  const line = centreLine(plan);
  const n = line.length;
  const s = new Float64Array(n), nx = new Float64Array(n), ny = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1]! + ptDist(line[i - 1]!, line[i]!) * 2;
  for (let i = 0; i < n; i++) {
    const a = line[Math.max(0, i - 1)]!, b = line[Math.min(n - 1, i + 1)]!;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    nx[i] = -dy / len; ny[i] = dx / len;
  }
  const lengthM = s[n - 1]!;
  const widths = plan.widths.slice().sort((a, b) => a.s - b.s);
  const greenR = greenRadius(plan.greenM2);
  // the fairway runs on under the green (the green paints over it), so the two always meet
  const fwEnd = Math.max(plan.fwStart, lengthM - greenR * 0.5);
  const ctrl = [plan.tee, ...plan.bends, plan.green];
  const bends: BendInfo[] = [];
  for (let k = 0; k < plan.bends.length; k++) {
    const bend = plan.bends[k]!, prev = ctrl[k]!, next = ctrl[k + 2]!;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = (line[i]!.x - bend.x) ** 2 + (line[i]!.y - bend.y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    const v1x = bend.x - prev.x, v1y = bend.y - prev.y, v2x = next.x - bend.x, v2y = next.y - bend.y;
    const cross = v1x * v2y - v1y * v2x, dot = v1x * v2x + v1y * v2y;
    // cross > 0: the line turns towards its left normal (-dy, dx), so the left is the inside and the outside is the right
    bends.push({ s: s[best]!, out: cross > 0 ? 1 : -1, turn: (Math.atan2(Math.abs(cross), dot) * 180) / Math.PI });
  }
  return { line, s, nx, ny, lengthM, widths, fwEnd, greenR, bends };
}

let geomKey = '';
let geomVal: PlanGeom | null = null;
/** the plan's geometry, from a one-entry cache keyed by the plan's tuple (plans are plain mutable objects) */
function geomOf(plan: HolePlan): PlanGeom {
  const key = JSON.stringify(encodePlan(plan));
  if (key !== geomKey || !geomVal) { geomVal = planGeom(plan); geomKey = key; }
  return geomVal;
}

/** the nominal fairway width (m) at s m from the back tee, from sorted handles: smoothstep between handles, the end handles'
 *  widths held beyond them, 0 before fwStart and after fwEnd */
function widthOf(widths: readonly WidthHandle[], fwStart: number, fwEnd: number, s: number): number {
  if (s < fwStart || s > fwEnd) return 0;
  const n = widths.length;
  if (n === 0) return 36;
  if (s <= widths[0]!.s) return widths[0]!.w;
  if (s >= widths[n - 1]!.s) return widths[n - 1]!.w;
  for (let i = 0; i < n - 1; i++) {
    const h0 = widths[i]!, h1 = widths[i + 1]!;
    if (s >= h0.s && s <= h1.s) return h0.w + smoothstep(h0.s, h1.s, s) * (h1.w - h0.w);
  }
  return widths[n - 1]!.w;
}

/** fairway width in metres at distance s metres from back tee (0 before fwStart and past the green) */
export function widthAt(plan: HolePlan, s: number, geom: PlanGeom = geomOf(plan)): number {
  return widthOf(geom.widths, plan.fwStart, geom.fwEnd, s);
}

/** the edge offset (m) of one side at s: the seeded swell plus the bend boost, for a nominal width w (m) */
function offsetOf(plan: HolePlan, geom: PlanGeom, s: number, left: boolean, w: number): number {
  if (w <= 0 || s <= plan.fwStart || s >= geom.fwEnd) return 0;
  let swell = 0;
  if (plan.seed !== 0) {
    // envelope that is strictly 0 at fwStart and the fairway's end
    const env = Math.sin((Math.PI * (s - plan.fwStart)) / (geom.fwEnd - plan.fwStart));
    // two low-frequency waves (wavelengths 52 m and 68 m)
    const seedShift = (plan.seed * 1337) % 1000;
    const sidePhase = left ? 0.785 : 2.356;
    const combined = Math.sin((2 * Math.PI * s) / 52 + seedShift + sidePhase) * 0.65 + Math.cos((2 * Math.PI * s) / 68 + seedShift * 0.7) * 0.35;
    const maxAmp = Math.min(2.5, 0.08 * w);
    swell = Math.max(-2.5, Math.min(2.5, combined * maxAmp * env));
  }
  // the outside of a bend: up to BEND_BOOST more width, scaled with the turn angle, faded over BEND_REACH either side
  let boost = 0;
  const side = left ? -1 : 1;
  for (const b of geom.bends) {
    if (b.out !== side) continue;
    const ds = Math.abs(s - b.s);
    if (ds >= BEND_REACH) continue;
    boost += BEND_BOOST * w * Math.min(1, b.turn / BEND_FULL_DEG) * 0.5 * (1 + Math.cos((Math.PI * ds) / BEND_REACH));
  }
  return swell + Math.min(boost, BEND_BOOST * w);
}

/**
 * fairway edge offset in metres added to the half width on one side at s m: the seeded swell (wavelength 40–70 m, amplitude at
 * most 8% of the width and 2.5 m, zero at the ends) plus, on the outside of a bend, up to 15% of the width (a full share from a
 * 45° turn, less for gentler turns), faded out 35 m either side of the bend. Side 'left' (or -1) is the line's left normal (-dy, dx).
 */
export function edgeOffset(
  plan: HolePlan,
  s: number,
  side: 'left' | 'right' | -1 | 1,
  geom: PlanGeom = geomOf(plan),
): number {
  const w = widthOf(geom.widths, plan.fwStart, geom.fwEnd, s);
  return offsetOf(plan, geom, s, side === 'left' || side === -1, w);
}

/** helper to calculate polygon area in tiles² */
function polygonAreaTiles(pts: readonly number[]): number {
  const n = pts.length >> 1;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[2 * i]! * pts[2 * j + 1]! - pts[2 * j]! * pts[2 * i + 1]!;
  }
  return Math.abs(a) / 2;
}

/** build green boundary polygon in tiles matching greenShape, greenM2 and greenTurn */
export function greenPolygon(plan: HolePlan): Pt[] {
  const shape = plan.greenShape;
  if (shape === 'round') {
    const rTiles = Math.sqrt(plan.greenM2 / (Math.PI * 4)); // 1 tile = 2 m, tile² = 4 m²
    const pts: Pt[] = [];
    const N = 24;
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * i) / N;
      pts.push({
        x: plan.green.x + rTiles * Math.cos(a),
        y: plan.green.y + rTiles * Math.sin(a),
      });
    }
    return pts;
  }

  const arch: CoursePieceArchetype =
    shape === 'peanut' ? 'green-peanut'
      : shape === 'pear' ? 'fairway-pear'
      : shape === 'kidney' ? 'green-kidney'
      : shape.startsWith('green-') ? shape
      : 'green-kidney';

  const base = buildArchetypePolygon(arch, plan.green, plan.greenTurn, 1, false);
  const baseAreaM2 = polygonAreaTiles(base.pts) * 4;
  const scale = baseAreaM2 > 0 ? Math.sqrt(plan.greenM2 / baseAreaM2) : 1;
  const scaled = buildArchetypePolygon(arch, plan.green, plan.greenTurn, scale, false);

  const out: Pt[] = [];
  for (let i = 0; i + 1 < scaled.pts.length; i += 2) {
    out.push({ x: scaled.pts[i]!, y: scaled.pts[i + 1]! });
  }
  return out;
}

/** the tee box in tiles: a 28 x 10 m rounded strip (a stadium) along the line's heading at the tee, its back end 2.5 m behind
 *  the back tee point so the back marker stands on it */
export function teePolygon(line: Pt[]): Pt[] {
  const p0 = line[0]!;
  const p1 = line[Math.min(line.length - 1, 4)]!;
  const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const r = TEE_WID_M / 4; // tiles: half of 10 m
  const halfBody = (TEE_LEN_M - TEE_WID_M) / 4; // tiles: half the straight body, (28 - 10) / 2 m / 2
  const back = { x: p0.x - ux * (r * 0.5), y: p0.y - uy * (r * 0.5) }; // the back end of the strip
  const backC = { x: back.x + ux * r, y: back.y + uy * r };
  const frontC = { x: backC.x + ux * 2 * halfBody, y: backC.y + uy * 2 * halfBody };
  const pts: Pt[] = [];
  const steps = 8;
  // front arc: frontC + (u cos a + n sin a) r for a in [-pi/2, pi/2] (from the right side round the front to the left side)
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / steps, c = Math.cos(a), sn = Math.sin(a);
    pts.push({ x: frontC.x + (ux * c + nx * sn) * r, y: frontC.y + (uy * c + ny * sn) * r });
  }
  // back arc, mirrored: backC - (u cos a + n sin a) r (from the left side round the back to the right side)
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / steps, c = Math.cos(a), sn = Math.sin(a);
    pts.push({ x: backC.x - (ux * c + nx * sn) * r, y: backC.y - (uy * c + ny * sn) * r });
  }
  return pts;
}

// ---- rasterising on a local box as row spans ----

/** row spans of cells on a box (inclusive cell column ranges per row), merged as they come when they touch the row's last span */
class Spans {
  readonly rows: number[][];
  constructor(readonly g: Grid, readonly cx0: number, readonly cy0: number, readonly w: number, readonly h: number) {
    this.rows = Array.from({ length: h }, () => []);
  }
  /** adds cells a..b (grid columns, inclusive) on grid row cy */
  add(cy: number, a: number, b: number): void {
    const r = cy - this.cy0;
    if (r < 0 || r >= this.h) return;
    if (a < this.cx0) a = this.cx0;
    if (b > this.cx0 + this.w - 1) b = this.cx0 + this.w - 1;
    if (a > b) return;
    const row = this.rows[r]!, n = row.length;
    if (n && a <= row[n - 1]! + 1 && b >= row[n - 2]! - 1) {
      if (a < row[n - 2]!) row[n - 2] = a;
      if (b > row[n - 1]!) row[n - 1] = b;
    } else row.push(a, b);
  }
  /** a disc of radius r tiles about (px, py): the cells whose centres lie within it */
  disc(px: number, py: number, r: number): void {
    const g = this.g;
    const ra = Math.ceil((py - r - g.y0) / CELL_T - 0.5), rb = Math.floor((py + r - g.y0) / CELL_T - 0.5);
    for (let cy = ra; cy <= rb; cy++) {
      const dy = g.y0 + (cy + 0.5) * CELL_T - py, q = r * r - dy * dy;
      if (q < 0) continue;
      const half = Math.sqrt(q);
      this.add(cy, Math.ceil((px - half - g.x0) / CELL_T - 0.5), Math.floor((px + half - g.x0) / CELL_T - 0.5));
    }
  }
  /** a quad (a, b, c, d in order; tiles): per row, the cells between its outermost edge crossings */
  quad(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): void {
    const g = this.g;
    const y0 = Math.min(ay, by, cy, dy), y1 = Math.max(ay, by, cy, dy);
    const ra = Math.ceil((y0 - g.y0) / CELL_T - 0.5), rb = Math.floor((y1 - g.y0) / CELL_T - 0.5);
    const xs = [ax, bx, cx, dx], ys = [ay, by, cy, dy];
    for (let row = ra; row <= rb; row++) {
      const yc = g.y0 + (row + 0.5) * CELL_T;
      let lo = Infinity, hi = -Infinity;
      for (let j = 0, k = 3; j < 4; k = j++) {
        const pyk = ys[k]!, pyj = ys[j]!;
        if ((pyk > yc) !== (pyj > yc)) {
          const x = xs[k]! + ((yc - pyk) * (xs[j]! - xs[k]!)) / (pyj - pyk);
          if (x < lo) lo = x;
          if (x > hi) hi = x;
        }
      }
      if (lo <= hi) this.add(row, Math.ceil((lo - g.x0) / CELL_T - 0.5), Math.floor((hi - g.x0) / CELL_T - 0.5));
    }
  }
  /** a polygon (tiles, even-odd rule) */
  poly(pts: readonly Pt[]): void {
    const g = this.g, n = pts.length;
    if (n < 3) return;
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
    const ra = Math.ceil((y0 - g.y0) / CELL_T - 0.5), rb = Math.floor((y1 - g.y0) / CELL_T - 0.5);
    const xs: number[] = [];
    for (let row = ra; row <= rb; row++) {
      const yc = g.y0 + (row + 0.5) * CELL_T;
      xs.length = 0;
      for (let j = 0, k = n - 1; j < n; k = j++) {
        const p = pts[k]!, q = pts[j]!;
        if ((p.y > yc) !== (q.y > yc)) xs.push(p.x + ((yc - p.y) * (q.x - p.x)) / (q.y - p.y));
      }
      xs.sort((u, v) => u - v);
      for (let e = 0; e + 1 < xs.length; e += 2) this.add(row, Math.ceil((xs[e]! - g.x0) / CELL_T - 0.5), Math.floor((xs[e + 1]! - g.x0) / CELL_T - 0.5));
    }
  }
  /** writes surface sid into out (a raster on this box) for every covered cell that allow accepts */
  write(out: PlanRaster, sid: number, allow?: (i: number) => boolean): void {
    const gw = this.g.w;
    for (let r = 0; r < this.h; r++) {
      const row = this.rows[r]!;
      if (!row.length) continue;
      if (row.length > 2) {
        // several runs on this row (a hairpin, or quads arriving out of order): sort by start; overlaps just write twice
        const pairs: [number, number][] = [];
        for (let k = 0; k < row.length; k += 2) pairs.push([row[k]!, row[k + 1]!]);
        pairs.sort((p, q) => p[0] - q[0]);
        row.length = 0;
        for (const [a, b] of pairs) row.push(a, b);
      }
      const gy = this.cy0 + r, base = r * out.w - out.cx0;
      for (let k = 0; k < row.length; k += 2) {
        for (let cx = row[k]!; cx <= row[k + 1]!; cx++) {
          if (allow && !allow(gy * gw + cx)) continue;
          out.s[base + cx] = sid;
        }
      }
    }
  }
}

/**
 * the plan's footprint on a local box of g (see PlanRaster): the rough corridor (every cell within 30 m of the line, more where
 * the fairway is wider), the fairway (union of quads between line samples, with a rounded nose), the tee and the green, each
 * over the one before; cells allow refuses are left out. Units: tiles in, cells out.
 */
export function rasterPlanBox(
  plan: HolePlan,
  g: Grid,
  allow?: (i: number) => boolean,
  geom: PlanGeom = geomOf(plan),
): PlanRaster {
  const { line, s, nx, ny, fwEnd } = geom;
  const n = line.length;
  // per sample: the fairway's left and right half widths (tiles) and the corridor radius (tiles)
  const hl = new Float64Array(n), hr = new Float64Array(n), cr = new Float64Array(n);
  const fwStart = plan.fwStart;
  for (let i = 0; i < n; i++) {
    const si = s[i]!;
    const w = widthOf(geom.widths, fwStart, fwEnd, si);
    let halfL = 0, halfR = 0;
    if (w > 0) {
      // the rounded nose at the start and the taper under the green (elliptical)
      const a = Math.min(1, (si - fwStart) / NOSE_M, (fwEnd - si) / NOSE_M);
      const f = a <= 0 ? 0 : Math.sqrt(1 - (1 - a) * (1 - a));
      halfL = Math.max(0, (w / 2 + offsetOf(plan, geom, si, true, w)) * f) / 2;
      halfR = Math.max(0, (w / 2 + offsetOf(plan, geom, si, false, w)) * f) / 2;
    }
    hl[i] = halfL; hr[i] = halfR;
    cr[i] = Math.max(CORRIDOR_M / 2, Math.max(halfL, halfR) + 2.5);
  }
  const green = greenPolygon(plan);
  const tee = teePolygon(line);
  // the box: the line grown by the corridor, plus the green and the tee
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = line[i]!, r = cr[i]!;
    if (p.x - r < x0) x0 = p.x - r; if (p.x + r > x1) x1 = p.x + r;
    if (p.y - r < y0) y0 = p.y - r; if (p.y + r > y1) y1 = p.y + r;
  }
  for (const p of green) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  for (const p of tee) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  const cx0 = Math.max(0, Math.floor((x0 - g.x0) / CELL_T)), cx1 = Math.min(g.w - 1, Math.floor((x1 - g.x0) / CELL_T));
  const cy0 = Math.max(0, Math.floor((y0 - g.y0) / CELL_T)), cy1 = Math.min(g.h - 1, Math.floor((y1 - g.y0) / CELL_T));
  const w = Math.max(0, cx1 - cx0 + 1), h = Math.max(0, cy1 - cy0 + 1);
  const out: PlanRaster = { cx0, cy0, w, h, s: new Uint8Array(w * h) };
  if (!w || !h) return out;

  // 1. the rough corridor: discs along the line (no folds on a hairpin; round ends behind the tee and past the green)
  const rough = new Spans(g, cx0, cy0, w, h);
  // every other sample (2 m apart: a 30 m disc's edge sags under 2 cm between two of them) and the last one
  for (let i = 0; i < n; i += 2) rough.disc(line[i]!.x, line[i]!.y, Math.max(cr[i]!, cr[Math.min(n - 1, i + 1)]!));
  if ((n - 1) % 2) rough.disc(line[n - 1]!.x, line[n - 1]!.y, cr[n - 1]!);
  rough.write(out, SURF.rough, allow);

  // 2. the fairway: quads between consecutive samples that both carry fairway
  const fw = new Spans(g, cx0, cy0, w, h);
  let any = false;
  for (let i = 0; i + 1 < n; i++) {
    if (hl[i]! + hr[i]! <= 0 && hl[i + 1]! + hr[i + 1]! <= 0) continue;
    const a = line[i]!, b = line[i + 1]!;
    fw.quad(
      a.x + nx[i]! * hl[i]!, a.y + ny[i]! * hl[i]!,
      b.x + nx[i + 1]! * hl[i + 1]!, b.y + ny[i + 1]! * hl[i + 1]!,
      b.x - nx[i + 1]! * hr[i + 1]!, b.y - ny[i + 1]! * hr[i + 1]!,
      a.x - nx[i]! * hr[i]!, a.y - ny[i]! * hr[i]!,
    );
    any = true;
  }
  if (any) fw.write(out, SURF.fairway, allow);

  // 3. the tee, 4. the green
  const t = new Spans(g, cx0, cy0, w, h);
  t.poly(tee);
  t.write(out, SURF.tee, allow);
  const gr = new Spans(g, cx0, cy0, w, h);
  gr.poly(green);
  gr.write(out, SURF.green, allow);
  return out;
}

/**
 * rasterizes the hole plan into a mapping of cell index -> surface id
 * (rough corridor of 30 m, fairway ribbon, tee box, and green).
 */
export function rasterPlan(
  plan: HolePlan,
  g: Grid,
  allow?: (i: number) => boolean,
): Map<number, number> {
  const r = rasterPlanBox(plan, g, allow);
  const map = new Map<number, number>();
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const v = r.s[y * r.w + x]!;
      if (v) map.set((r.cy0 + y) * g.w + r.cx0 + x, v);
    }
  }
  return map;
}

/** surfaces a plan never overwrites or clears: the player's own water, bunkers and waste */
function playerSurf(s: number): boolean {
  return s === SURF.water || s === SURF.bunker || s === SURF.waste;
}

/**
 * the cells a plan edit would change on g, without changing g (the wizard's ghost and price read this; planDiff applies it):
 * - a cell where the old and new plans put the same surface is left alone (it holds the plan's surface or the player's touch-up);
 * - a cell in the old footprint and not the new goes back to none (hole 0, month 0), only if it still holds the old plan's surface
 *   for this hole;
 * - a cell in the new footprint takes the new surface if it still holds the old plan's surface for this hole, or else if its
 *   surface is lower or equal ('below'); a cell whose surface stays and only joins the hole keeps its planted month;
 *   rough and fescue over the map grass are established at once (course-grid laidMonth: it is already grass);
 * - other holes' cells and the player's water, bunkers and waste never change.
 * A cell allow refuses is never changed. The old and new rasters (made without allow) may be passed in when the caller has them;
 * skipped(i, why, s) hears of each new-footprint cell left out because allow refused it ('land') or it is another hole's ('hole'),
 * with the surface the plan wanted there. Months are the grid's stored values (course-grid/areas plantMonth).
 */
export function planChanges(
  g: Grid,
  oldPlan: HolePlan | null,
  nextPlan: HolePlan,
  hole: number,
  month: number,
  allow?: (i: number) => boolean,
  rasters?: { old?: PlanRaster | null; next?: PlanRaster },
  skipped?: (i: number, why: 'land' | 'hole', s: number) => void,
): GridDiff {
  const nr = rasters?.next ?? rasterPlanBox(nextPlan, g, undefined, planGeom(nextPlan));
  const or = oldPlan ? (rasters?.old ?? rasterPlanBox(oldPlan, g, undefined, planGeom(oldPlan))) : null;
  // the union of the two boxes
  let bx0 = nr.cx0, by0 = nr.cy0, bx1 = nr.cx0 + nr.w - 1, by1 = nr.cy0 + nr.h - 1;
  if (or && or.w && or.h) {
    bx0 = Math.min(bx0, or.cx0); by0 = Math.min(by0, or.cy0);
    bx1 = Math.max(bx1, or.cx0 + or.w - 1); by1 = Math.max(by1, or.cy0 + or.h - 1);
  }
  const acc = new DiffAcc(g, 4096);
  const ns = nr.s, nw = nr.w, nx0 = nr.cx0, nx1 = nr.cx0 + nr.w - 1;
  const os = or?.s, ow = or?.w ?? 0, ox0 = or?.cx0 ?? 0, ox1 = or ? or.cx0 + or.w - 1 : -1;
  const gs = g.surf, gh = g.hole, gm = g.month;
  for (let cy = by0; cy <= by1; cy++) {
    // this row's offsets into each raster (-1: the row is outside it)
    const nRow = cy - nr.cy0, nb = nRow >= 0 && nRow < nr.h ? nRow * nw - nx0 : -1;
    const oRow = or ? cy - or.cy0 : -1, ob = or && oRow >= 0 && oRow < or.h ? oRow * ow - ox0 : -1;
    const row = cy * g.w;
    for (let cx = bx0; cx <= bx1; cx++) {
      const nv = nb >= 0 && cx >= nx0 && cx <= nx1 ? ns[nb + cx]! : 0;
      const ov = ob >= 0 && cx >= ox0 && cx <= ox1 ? os![ob + cx]! : 0;
      if (nv === ov) continue;
      const i = row + cx, cs = gs[i]!, ch = gh[i]!;
      if (allow && !allow(i)) { if (nv) skipped?.(i, 'land', nv); continue; }
      if (nv === 0) {
        // left the footprint: clear it if it still holds the old plan's surface for this hole
        if (cs === ov && ch === hole && !playerSurf(cs)) acc.push(i, cs, ch, gm[i]!, SURF.none, 0, 0);
        continue;
      }
      if (ch !== 0 && ch !== hole) { skipped?.(i, 'hole', nv); continue; }
      if (playerSurf(cs)) continue;
      const holdsOld = ov !== 0 && ch === hole && cs === ov;
      if (!holdsOld && cs > nv) continue;
      if (cs === nv && ch === hole) continue;
      const cm = gm[i]!;
      acc.push(i, cs, ch, cm, nv, hole, cs === nv ? cm : laidMonth(nv, cs, cm, month));
    }
  }
  return acc.done();
}

/** a growing diff (typed arrays, doubled when full); every cell it writes loses its carve flag (T125: laying a hole over a rubbed-out cell
 *  paints it again) */
class DiffAcc {
  n = 0;
  idx: Uint32Array; s0: Uint8Array; h0: Uint8Array; m0: Uint16Array; s1: Uint8Array; h1: Uint8Array; m1: Uint16Array; c0: Uint8Array;
  constructor(readonly g: Grid, cap: number) {
    this.idx = new Uint32Array(cap); this.s0 = new Uint8Array(cap); this.h0 = new Uint8Array(cap); this.m0 = new Uint16Array(cap);
    this.s1 = new Uint8Array(cap); this.h1 = new Uint8Array(cap); this.m1 = new Uint16Array(cap); this.c0 = new Uint8Array(cap);
  }
  push(i: number, s0: number, h0: number, m0: number, s1: number, h1: number, m1: number): void {
    if (this.n === this.idx.length) {
      const c = this.n * 2;
      const grow = <T extends Uint32Array | Uint16Array | Uint8Array>(a: T, b: T): T => { b.set(a); return b; };
      this.idx = grow(this.idx, new Uint32Array(c)); this.s0 = grow(this.s0, new Uint8Array(c)); this.h0 = grow(this.h0, new Uint8Array(c));
      this.m0 = grow(this.m0, new Uint16Array(c)); this.s1 = grow(this.s1, new Uint8Array(c)); this.h1 = grow(this.h1, new Uint8Array(c));
      this.m1 = grow(this.m1, new Uint16Array(c)); this.c0 = grow(this.c0, new Uint8Array(c));
    }
    const k = this.n++;
    this.idx[k] = i; this.s0[k] = s0; this.h0[k] = h0; this.m0[k] = m0; this.s1[k] = s1; this.h1[k] = h1; this.m1[k] = m1; this.c0[k] = this.g.carve?.[i] ?? 0;
  }
  /** the diff, its arrays cut to length */
  done(): GridDiff {
    const n = this.n, g = this.g;
    return {
      x0: g.x0, y0: g.y0, w: g.w, n,
      idx: this.idx.slice(0, n), s0: this.s0.slice(0, n), h0: this.h0.slice(0, n), m0: this.m0.slice(0, n),
      s1: this.s1.slice(0, n), h1: this.h1.slice(0, n), m1: this.m1.slice(0, n), c0: this.c0.slice(0, n), c1: new Uint8Array(n),
    };
  }
}

/**
 * the cells deleting a plan would change on g, without changing g: every footprint cell that still holds the plan's surface for this
 * hole goes back to none (hole 0, month 0); the player's touch-ups, other holes and the player's water, bunkers and waste stay.
 */
export function planClear(g: Grid, plan: HolePlan, hole: number, allow?: (i: number) => boolean): GridDiff {
  const r = rasterPlanBox(plan, g, undefined, planGeom(plan));
  const idx: number[] = [], s0: number[] = [], m0: number[] = [];
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const v = r.s[y * r.w + x]!;
      if (!v) continue;
      const i = (r.cy0 + y) * g.w + r.cx0 + x;
      if (g.surf[i] !== v || g.hole[i] !== hole || playerSurf(v) || (allow && !allow(i))) continue;
      idx.push(i); s0.push(v); m0.push(g.month[i]!);
    }
  }
  const n = idx.length;
  return {
    x0: g.x0, y0: g.y0, w: g.w, n,
    idx: Uint32Array.from(idx), s0: Uint8Array.from(s0), h0: new Uint8Array(n).fill(hole), m0: Uint16Array.from(m0),
    s1: new Uint8Array(n), h1: new Uint8Array(n), m1: new Uint16Array(n), c0: Uint8Array.from(idx, i => g.carve?.[i] ?? 0), c1: new Uint8Array(n),
  };
}

/**
 * calculates and applies the diff between an old hole plan and the next hole plan on grid g (see planChanges for the rules):
 * cells left by the old footprint go back to none; cells in the new footprint are set 'below'; cells both plans agree on, other
 * holes' cells and the player's water, bunkers and waste never change. Returns the diff (for undo); bumps g.rev.
 */
export function planDiff(
  g: Grid,
  oldPlan: HolePlan | null,
  nextPlan: HolePlan,
  hole: number,
  month: number,
  allow?: (i: number) => boolean,
): GridDiff {
  const d = planChanges(g, oldPlan, nextPlan, hole, month, allow);
  for (let k = 0; k < d.n; k++) {
    const i = d.idx[k]!;
    g.surf[i] = d.s1[k]!; g.hole[i] = d.h1[k]!; g.month[i] = d.m1[k]!;
    if (g.carve) g.carve[i] = 0;
  }
  g.rev++;
  return d;
}

/** returns the hole's bends as ordered AimPoints */
export function planAims(plan: HolePlan): AimPoint[] {
  return plan.bends.map((b, i) => ({
    hole: plan.hole,
    x: b.x,
    y: b.y,
    order: i,
  }));
}

/** computes length, par, and approximate area per surface in m² */
export function planInfo(plan: HolePlan, geom: PlanGeom = geomOf(plan)): PlanInfo {
  const lengthM = Math.round(geom.lengthM);
  const par = parFromLength(lengthM);
  const greenM2 = plan.greenM2;
  const teeM2 = Math.round((TEE_LEN_M - TEE_WID_M) * TEE_WID_M + Math.PI * (TEE_WID_M / 2) ** 2); // the stadium, ~258 m²
  let fairwayM2 = 0;
  for (let s = plan.fwStart; s < geom.fwEnd; s += 1) fairwayM2 += widthOf(geom.widths, plan.fwStart, geom.fwEnd, s);
  const corridorM2 = lengthM * CORRIDOR_M * 2 + Math.PI * CORRIDOR_M * CORRIDOR_M;
  const roughM2 = Math.max(0, corridorM2 - fairwayM2 - greenM2 - teeM2);
  return {
    lengthM,
    par,
    m2: { tee: teeM2, fairway: Math.round(fairwayM2), green: Math.round(greenM2), rough: Math.round(roughM2) },
  };
}

/** the index of the line sample nearest to s m (samples are about 1 m apart) */
function sampleAt(geom: PlanGeom, s: number): number {
  const n = geom.s.length;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (geom.s[mid]! < s) lo = mid + 1; else hi = mid;
  }
  if (lo > 0 && Math.abs(geom.s[lo - 1]! - s) < Math.abs(geom.s[lo]! - s)) lo--;
  return lo;
}

/** computes interactive plan handles: tee, green, bends, a left and right handle on the drawn fairway edges for each width
 *  handle, and a '+' point at the middle (along the line) of each leg while there are fewer than 3 bends */
export function planHandles(plan: HolePlan, geom: PlanGeom = geomOf(plan)): PlanHandles {
  const widths: PlanHandles['widths'] = [];
  for (const h of geom.widths) {
    const i = sampleAt(geom, h.s), pt = geom.line[i]!, si = geom.s[i]!;
    const w = widthOf(geom.widths, plan.fwStart, geom.fwEnd, si) || h.w;
    const l = (w / 2 + offsetOf(plan, geom, si, true, w)) / 2, r = (w / 2 + offsetOf(plan, geom, si, false, w)) / 2;
    widths.push({
      s: h.s, w: h.w,
      left: { x: pt.x + geom.nx[i]! * l, y: pt.y + geom.ny[i]! * l },
      right: { x: pt.x - geom.nx[i]! * r, y: pt.y - geom.ny[i]! * r },
    });
  }
  const insertPoints: Pt[] = [];
  if (plan.bends.length < 3) {
    const stops = [0, ...geom.bends.map((b) => b.s), geom.lengthM];
    for (let k = 0; k + 1 < stops.length; k++) {
      const p = geom.line[sampleAt(geom, (stops[k]! + stops[k + 1]!) / 2)]!;
      insertPoints.push({ x: p.x, y: p.y });
    }
  }
  return {
    tee: { x: plan.tee.x, y: plan.tee.y },
    green: { x: plan.green.x, y: plan.green.y },
    bends: plan.bends.map((b) => ({ x: b.x, y: b.y })),
    widths,
    insertPoints,
  };
}

/** build 30 m rough corridor polygon (60 m total width) along centre line with rounded end caps (for planAreas only: the
 *  raster uses discs, which never fold) */
function corridorPolygon(line: Pt[]): Pt[] {
  if (line.length < 2) return [];
  const left: Pt[] = [], right: Pt[] = [];
  const half = CORRIDOR_M / 2;
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)]!, b = line[Math.min(line.length - 1, i + 1)]!;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    left.push({ x: line[i]!.x + nx * half, y: line[i]!.y + ny * half });
    right.push({ x: line[i]!.x - nx * half, y: line[i]!.y - ny * half });
  }
  const cap = (p: Pt, q: Pt, sign: number): Pt[] => {
    const dx = p.x - q.x, dy = p.y - q.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const out: Pt[] = [];
    for (let i = 1; i < 8; i++) {
      const a = (Math.PI * i) / 8, c = Math.cos(a), sn = Math.sin(a);
      out.push({ x: p.x + (sign * nx * c + ux * sn) * half, y: p.y + (sign * ny * c + uy * sn) * half });
    }
    return out;
  };
  const last = line.length - 1;
  return [...left, ...cap(line[last]!, line[last - 1]!, 1), ...right.reverse(), ...cap(line[0]!, line[1]!, -1)];
}

/** the fairway outline (tiles) as one polygon: the left edge out, the right edge back */
function fairwayPolygon(plan: HolePlan, geom: PlanGeom): Pt[] {
  const left: Pt[] = [], right: Pt[] = [];
  for (let i = 0; i < geom.line.length; i++) {
    const si = geom.s[i]!, w = widthOf(geom.widths, plan.fwStart, geom.fwEnd, si);
    if (w <= 0) continue;
    const l = (w / 2 + offsetOf(plan, geom, si, true, w)) / 2, r = (w / 2 + offsetOf(plan, geom, si, false, w)) / 2, p = geom.line[i]!;
    left.push({ x: p.x + geom.nx[i]! * l, y: p.y + geom.ny[i]! * l });
    right.push({ x: p.x - geom.nx[i]! * r, y: p.y - geom.ny[i]! * r });
  }
  return left.length ? [...left, ...right.reverse()] : [];
}

/** the plan as CourseArea polygons (tiles; rough corridor, fairway, tee, green), for previews; the game's holes read the grid
 *  (course-grid/areas gridAreas) */
export function planAreas(plan: HolePlan): CourseArea[] {
  const geom = geomOf(plan);
  const flat = (pts: Pt[]) => pts.flatMap((p) => [p.x, p.y]);
  const areas: CourseArea[] = [{ id: 1, surface: 'rough', pts: flat(corridorPolygon(geom.line)) }];
  const fairway = fairwayPolygon(plan, geom);
  if (fairway.length >= 3) areas.push({ id: 2, surface: 'fairway', pts: flat(fairway) });
  areas.push(
    { id: 3, surface: 'tee', pts: flat(teePolygon(geom.line)) },
    { id: 4, surface: 'green', pts: flat(greenPolygon(plan)) },
  );
  return areas;
}

/** compact tuple representation of a HolePlan */
export type HolePlanTuple = [
  number, // 0: hole
  [number, number], // 1: tee
  [number, number], // 2: green
  string, // 3: greenShape
  number, // 4: greenM2
  number, // 5: greenTurn
  [number, number][], // 6: bends
  [number, number][], // 7: widths [s, w]
  number, // 8: fwStart
  number, // 9: seed
];

/** encodes a HolePlan into a compact tuple */
export function encodePlan(plan: HolePlan): HolePlanTuple {
  return [
    plan.hole,
    [plan.tee.x, plan.tee.y],
    [plan.green.x, plan.green.y],
    plan.greenShape,
    plan.greenM2,
    plan.greenTurn,
    plan.bends.map((b) => [b.x, b.y]),
    plan.widths.map((w) => [w.s, w.w]),
    plan.fwStart,
    plan.seed,
  ];
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]);

/** decodes a compact tuple (or its JSON) back into a HolePlan, or null when it is not a valid plan: hole 1..18, a known green
 *  shape (GREEN_SHAPES), finite numbers, at most 3 bends */
export function decodePlan(raw: HolePlanTuple | string | unknown): HolePlan | null {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(data) || data.length < 10) return null;
    const [hole, tee, green, greenShape, greenM2, greenTurn, bends, widths, fwStart, seed] = data as unknown[];
    if (
      !num(hole) || !Number.isInteger(hole) || hole < 1 || hole > 18 ||
      !pair(tee) || !pair(green) ||
      typeof greenShape !== 'string' || !(GREEN_SHAPES as readonly string[]).includes(greenShape) ||
      !num(greenM2) || greenM2 <= 0 || !num(greenTurn) ||
      !Array.isArray(bends) || bends.length > 3 || !bends.every(pair) ||
      !Array.isArray(widths) || !widths.every(pair) ||
      !num(fwStart) || !num(seed)
    ) {
      return null;
    }
    return {
      hole,
      tee: { x: tee[0], y: tee[1] },
      green: { x: green[0], y: green[1] },
      greenShape: greenShape as GreenShape,
      greenM2,
      greenTurn,
      bends: (bends as [number, number][]).map((b) => ({ x: b[0], y: b[1] })),
      widths: (widths as [number, number][]).map((w) => ({ s: w[0], w: w[1] })),
      fwStart,
      seed,
    };
  } catch {
    return null;
  }
}

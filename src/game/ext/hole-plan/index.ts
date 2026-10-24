// The hole plan (plan P21, T074): centripetal Catmull-Rom centre line, variable fairway widths,
// organic green/tee placement, footprint rasterisation, undo diffs, and compact plan serialization.
// Pure TypeScript, no DOM, deterministic.
// Units: positions in tiles of 2 m; widths, lengths, areas and distances in metres/m²; turns in degrees.

import {
  CELL_T,
  SURF,
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

/** interactive editor handles for a hole plan */
export interface PlanHandles {
  tee: Pt;
  green: Pt;
  bends: Pt[];
  widths: { s: number; w: number; left: Pt; right: Pt }[];
  insertPoints: Pt[];
}

/** distance between two points in tiles */
function ptDist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** default hole plan parameters derived from tee, green and par defaults (P21 section 2.3 and 3.3) */
export function defaultPlan(
  hole: number,
  tee: Pt,
  green: Pt,
  bends: Pt[] = [],
): HolePlan {
  // calculate total straight/aim-point length
  const pts = [tee, ...bends, green];
  let totalTiles = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    totalTiles += ptDist(pts[i]!, pts[i + 1]!);
  }
  const totalM = Math.round(totalTiles * 2); // 1 tile = 2 m
  const par = parFromLength(totalM);

  // approach heading for green orientation
  const lastBend = bends.length > 0 ? bends[bends.length - 1]! : tee;
  const approachAngleDeg = (Math.atan2(green.y - lastBend.y, green.x - lastBend.x) * 180) / Math.PI;

  if (par === 3) {
    // Par 3: no fairway; an approach apron 18 m wide over the last 25 m before the green
    const apronStart = Math.max(0, totalM - 25);
    return {
      hole,
      tee: { x: tee.x, y: tee.y },
      green: { x: green.x, y: green.y },
      greenShape: 'kidney',
      greenM2: 550,
      greenTurn: approachAngleDeg,
      bends: bends.map((b) => ({ x: b.x, y: b.y })),
      widths: [
        { s: apronStart, w: 18 },
        { s: totalM, w: 18 },
      ],
      fwStart: apronStart,
      seed: 0,
    };
  }

  if (par === 4) {
    // Par 4: fairway from fwStart; widths 30 at fwStart, 40 at landing, 28 at length-50, 22 at green front
    const fwStart = Math.min(100, Math.max(30, totalM - 90));
    const sFront = Math.max(fwStart + 30, totalM - 20);
    const sLanding = Math.min(210, Math.round(fwStart + (sFront - fwStart) * 0.55));
    const s50 = Math.min(Math.max(sLanding + 20, totalM - 50), sFront - 15);
    return {
      hole,
      tee: { x: tee.x, y: tee.y },
      green: { x: green.x, y: green.y },
      greenShape: 'kidney',
      greenM2: 550,
      greenTurn: approachAngleDeg,
      bends: bends.map((b) => ({ x: b.x, y: b.y })),
      widths: [
        { s: fwStart, w: 30 },
        { s: sLanding, w: 40 },
        { s: s50, w: 28 },
        { s: sFront, w: 22 },
      ],
      fwStart,
      seed: 0,
    };
  }

  // Par 5: as par 4, plus 32 at 300 and second landing 38 at 390
  const fwStart = 100;
  const sFront = Math.max(fwStart + 60, totalM - 20);
  const s50 = Math.min(Math.max(410, totalM - 50), sFront - 15);
  return {
    hole,
    tee: { x: tee.x, y: tee.y },
    green: { x: green.x, y: green.y },
    greenShape: 'kidney',
    greenM2: 550,
    greenTurn: approachAngleDeg,
    bends: bends.map((b) => ({ x: b.x, y: b.y })),
    widths: [
      { s: 100, w: 30 },
      { s: 210, w: 40 },
      { s: 300, w: 32 },
      { s: 390, w: 38 },
      { s: s50, w: 28 },
      { s: sFront, w: 22 },
    ],
    fwStart: 100,
    seed: 0,
  };
}

/** centripetal Catmull-Rom spline through tee, bends and green, sampled every 1 m (0.5 tile) */
export function centreLine(plan: HolePlan): Pt[] {
  const ctrl = [plan.tee, ...plan.bends, plan.green];
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
    const segSteps = Math.max(4, Math.ceil(segDistTiles / 0.1));

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

/** green front boundary distance along line in metres */
function greenFrontDistance(plan: HolePlan): number {
  if (plan.widths.length > 0) {
    const sorted = plan.widths.slice().sort((a, b) => a.s - b.s);
    return sorted[sorted.length - 1]!.s;
  }
  const pts = [plan.tee, ...plan.bends, plan.green];
  let totalTiles = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    totalTiles += ptDist(pts[i]!, pts[i + 1]!);
  }
  const totalM = totalTiles * 2;
  const greenRadiusM = Math.sqrt(plan.greenM2 / Math.PI);
  return Math.max(plan.fwStart, totalM - greenRadiusM);
}

/** fairway width in metres at distance s metres from back tee */
export function widthAt(plan: HolePlan, s: number): number {
  const greenFront = greenFrontDistance(plan);
  if (s < plan.fwStart || s > greenFront) {
    return 0;
  }
  const wHandles = plan.widths.slice().sort((a, b) => a.s - b.s);
  if (wHandles.length === 0) {
    return 36;
  }
  if (s <= wHandles[0]!.s) {
    return wHandles[0]!.w;
  }
  if (s >= wHandles[wHandles.length - 1]!.s) {
    return wHandles[wHandles.length - 1]!.w;
  }
  for (let i = 0; i < wHandles.length - 1; i++) {
    const h0 = wHandles[i]!;
    const h1 = wHandles[i + 1]!;
    if (s >= h0.s && s <= h1.s) {
      const t = smoothstep(h0.s, h1.s, s);
      return h0.w + t * (h1.w - h0.w);
    }
  }
  return wHandles[wHandles.length - 1]!.w;
}

/**
 * seeded fairway edge swell in metres (wavelength 40–70 m, amplitude at most 8% and 2.5 m, zero at ends),
 * plus 15% outside a dogleg bend.
 */
export function edgeOffset(
  plan: HolePlan,
  s: number,
  side: 'left' | 'right' | -1 | 1,
): number {
  const greenFront = greenFrontDistance(plan);
  if (s <= plan.fwStart || s >= greenFront) {
    return 0;
  }

  const w = widthAt(plan, s);
  if (w <= 0) return 0;

  let wavySwell = 0;
  if (plan.seed !== 0) {
    // envelope that is strictly 0 at fwStart and greenFront
    const span = greenFront - plan.fwStart;
    const env = Math.sin((Math.PI * (s - plan.fwStart)) / span);

    // two low-frequency waves (wavelengths 52 m and 68 m)
    const seedShift = (plan.seed * 1337) % 1000;
    const sidePhase = side === 'left' || side === -1 ? 0.785 : 2.356;
    const wave1 = Math.sin((2 * Math.PI * s) / 52 + seedShift + sidePhase);
    const wave2 = Math.cos((2 * Math.PI * s) / 68 + seedShift * 0.7);
    const combined = wave1 * 0.65 + wave2 * 0.35;

    const maxAmp = Math.min(2.5, 0.08 * w);
    wavySwell = Math.max(-2.5, Math.min(2.5, combined * maxAmp * env));
  }

  // plus 15% outside a dogleg bend
  let bendBoost = 0;
  if (plan.bends.length > 0) {
    const isLeft = side === 'left' || side === -1;
    const pts = [plan.tee, ...plan.bends, plan.green];
    const line = centreLine(plan);

    for (let k = 0; k < plan.bends.length; k++) {
      const bend = plan.bends[k]!;
      const prevPt = pts[k]!;
      const nextPt = pts[k + 2]!;

      // find arc length of bend along centre line (line sampled every 1 m)
      let bendS = 0;
      let minD = Infinity;
      for (let i = 0; i < line.length; i++) {
        const d = Math.hypot(line[i]!.x - bend.x, line[i]!.y - bend.y);
        if (d < minD) {
          minD = d;
          bendS = i;
        }
      }

      // turn direction: cross product of (bend - prev) and (next - bend) in tile coords
      const v1x = bend.x - prevPt.x;
      const v1y = bend.y - prevPt.y;
      const v2x = nextPt.x - bend.x;
      const v2y = nextPt.y - bend.y;
      const cp = v1x * v2y - v1y * v2x;

      // cp > 0 means turning right, so OUTSIDE of bend is left.
      // cp < 0 means turning left, so OUTSIDE of bend is right.
      const outsideIsLeft = cp > 0;
      const isOutside = isLeft === outsideIsLeft;

      if (isOutside && Math.abs(cp) > 1e-4) {
        const ds = Math.abs(s - bendS);
        const radius = 35; // 35 m transition window around bend
        if (ds < radius) {
          const fade = 0.5 * (1 + Math.cos((Math.PI * ds) / radius));
          bendBoost += 0.15 * w * fade;
        }
      }
    }
  }

  return wavySwell + bendBoost;
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
function buildGreenPolygon(plan: HolePlan): Pt[] {
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
    shape === 'peanut'
      ? 'green-peanut'
      : shape === 'pear'
      ? 'fairway-pear'
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

/** build tee boundary polygon in tiles: 28 x 10 m rounded box along line heading */
function buildTeePolygon(plan: HolePlan, line: Pt[]): Pt[] {
  // heading of the line at the tee
  const p0 = line[0]!;
  const p1 = line[Math.min(line.length - 1, 4)]!;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  // 28 m x 10 m in tiles: total length 14 tiles, width 5 tiles (r = 2.5 tiles).
  // Straight body half-length = (14 - 2 * 2.5) / 2 = 4.5 tiles.
  const r = 2.5;
  const halfBody = 4.5;
  const cx = plan.tee.x + ux * (halfBody + r * 0.5);
  const cy = plan.tee.y + uy * (halfBody + r * 0.5);

  const pts: Pt[] = [];
  const frontCenter = { x: cx + ux * halfBody, y: cy + uy * halfBody };
  const backCenter = { x: cx - ux * halfBody, y: cy - uy * halfBody };

  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / steps;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    pts.push({
      x: frontCenter.x + (ux * sinA + nx * cosA) * r,
      y: frontCenter.y + (uy * sinA + ny * cosA) * r,
    });
  }
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / steps;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    pts.push({
      x: backCenter.x + (ux * sinA + nx * cosA) * r,
      y: backCenter.y + (uy * sinA + ny * cosA) * r,
    });
  }
  return pts;
}

/** rasterize a polygon into a cell map with surface id using fast scanline fill */
function rasterizePoly(
  g: Grid,
  poly: readonly Pt[],
  surfId: number,
  map: Map<number, number>,
  allow?: (i: number) => boolean,
): void {
  const n = poly.length;
  if (n < 3) return;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const cx0 = Math.max(0, Math.floor((minX - g.x0) / CELL_T));
  const cx1 = Math.min(g.w - 1, Math.floor((maxX - g.x0) / CELL_T));
  const cy0 = Math.max(0, Math.floor((minY - g.y0) / CELL_T));
  const cy1 = Math.min(g.h - 1, Math.floor((maxY - g.y0) / CELL_T));

  const xs: number[] = [];
  for (let cy = cy0; cy <= cy1; cy++) {
    const yc = g.y0 + (cy + 0.5) * CELL_T;
    xs.length = 0;
    for (let j = 0, k = n - 1; j < n; k = j++) {
      const p = poly[k]!;
      const q = poly[j]!;
      if ((p.y > yc) !== (q.y > yc)) {
        xs.push(p.x + ((yc - p.y) * (q.x - p.x)) / (q.y - p.y));
      }
    }
    if (xs.length === 0) continue;
    xs.sort((u, v) => u - v);
    let e = 0;
    const rowOffset = cy * g.w;
    for (let cx = cx0; cx <= cx1; cx++) {
      const xc = g.x0 + (cx + 0.5) * CELL_T;
      while (e < xs.length && xs[e]! <= xc) e++;
      if (e & 1) {
        const idx = rowOffset + cx;
        if (!allow || allow(idx)) {
          map.set(idx, surfId);
        }
      }
    }
  }
}

/** build fairway outline polygon from centre line, widths and swell */
function buildFairwayPolygon(plan: HolePlan, line: Pt[]): Pt[] {
  const greenFront = greenFrontDistance(plan);
  const left: Pt[] = [];
  const right: Pt[] = [];

  let cumM = 0;
  for (let i = 0; i < line.length; i++) {
    if (i > 0) {
      cumM += ptDist(line[i - 1]!, line[i]!) * 2;
    }
    if (cumM < plan.fwStart - 1 || cumM > greenFront + 1) {
      continue;
    }
    // tangent
    const pPrev = line[Math.max(0, i - 1)]!;
    const pNext = line[Math.min(line.length - 1, i + 1)]!;
    const dx = pNext.x - pPrev.x;
    const dy = pNext.y - pPrev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    const wM = widthAt(plan, cumM);
    if (wM <= 0) continue;

    const offL = edgeOffset(plan, cumM, 'left');
    const offR = edgeOffset(plan, cumM, 'right');

    const halfTilesL = (wM / 2 + offL) / 2; // m to tiles
    const halfTilesR = (wM / 2 + offR) / 2;

    left.push({
      x: line[i]!.x + nx * halfTilesL,
      y: line[i]!.y + ny * halfTilesL,
    });
    right.push({
      x: line[i]!.x - nx * halfTilesR,
      y: line[i]!.y - ny * halfTilesR,
    });
  }

  if (left.length === 0) return [];
  return [...left, ...right.reverse()];
}

/** build 30 m rough corridor polygon (60 m total width) along centre line with rounded end caps */
function buildCorridorPolygon(line: Pt[]): Pt[] {
  if (line.length < 2) return [];
  const left: Pt[] = [];
  const right: Pt[] = [];
  const halfTiles = 15; // 30 m = 15 tiles

  for (let i = 0; i < line.length; i++) {
    const pPrev = line[Math.max(0, i - 1)]!;
    const pNext = line[Math.min(line.length - 1, i + 1)]!;
    const dx = pNext.x - pPrev.x;
    const dy = pNext.y - pPrev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    left.push({
      x: line[i]!.x + nx * halfTiles,
      y: line[i]!.y + ny * halfTiles,
    });
    right.push({
      x: line[i]!.x - nx * halfTiles,
      y: line[i]!.y - ny * halfTiles,
    });
  }

  // End cap around green (line end): semicircle from left[last] to right[last]
  const lastIdx = line.length - 1;
  const pLast = line[lastIdx]!;
  const pPen = line[Math.max(0, lastIdx - 1)]!;
  const dxE = pLast.x - pPen.x;
  const dyE = pLast.y - pPen.y;
  const lenE = Math.hypot(dxE, dyE) || 1;
  const uxE = dxE / lenE;
  const uyE = dyE / lenE;
  const nxE = -uyE;
  const nyE = uxE;

  const greenCap: Pt[] = [];
  const steps = 8;
  for (let i = 1; i < steps; i++) {
    const a = (Math.PI * i) / steps;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    // starts at left (nxE), swings forward (uxE), lands at right (-nxE)
    greenCap.push({
      x: pLast.x + (nxE * cosA + uxE * sinA) * halfTiles,
      y: pLast.y + (nyE * cosA + uyE * sinA) * halfTiles,
    });
  }

  // End cap around tee (line start): semicircle from right[0] to left[0]
  const p0 = line[0]!;
  const p1 = line[Math.min(line.length - 1, 1)]!;
  const dxS = p1.x - p0.x;
  const dyS = p1.y - p0.y;
  const lenS = Math.hypot(dxS, dyS) || 1;
  const uxS = dxS / lenS;
  const uyS = dyS / lenS;
  const nxS = -uyS;
  const nyS = uxS;

  const teeCap: Pt[] = [];
  for (let i = 1; i < steps; i++) {
    const a = (Math.PI * i) / steps;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    // starts at right (-nxS), swings backward (-uxS), lands at left (nxS)
    teeCap.push({
      x: p0.x + (-nxS * cosA - uxS * sinA) * halfTiles,
      y: p0.y + (-nyS * cosA - uyS * sinA) * halfTiles,
    });
  }

  return [...left, ...greenCap, ...right.reverse(), ...teeCap];
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
  const map = new Map<number, number>();
  const line = centreLine(plan);

  // 1. 30 m rough corridor
  const corridor = buildCorridorPolygon(line);
  rasterizePoly(g, corridor, SURF.rough, map, allow);

  // 2. Fairway ribbon
  const fairway = buildFairwayPolygon(plan, line);
  if (fairway.length >= 3) {
    rasterizePoly(g, fairway, SURF.fairway, map, allow);
  }

  // 3. Tee
  const tee = buildTeePolygon(plan, line);
  rasterizePoly(g, tee, SURF.tee, map, allow);

  // 4. Green
  const green = buildGreenPolygon(plan);
  rasterizePoly(g, green, SURF.green, map, allow);

  return map;
}

/**
 * calculates and applies diff between an old hole plan and next hole plan on grid g:
 * - cells in old and not in next go back to rough or none (if still holding old plan's surface);
 * - cells in next are set with 'below';
 * - other holes' cells and player's water and bunkers never change.
 */
export function planDiff(
  g: Grid,
  oldPlan: HolePlan | null,
  nextPlan: HolePlan,
  hole: number,
  month: number,
  allow?: (i: number) => boolean,
): GridDiff {
  const nextMap = rasterPlan(nextPlan, g, allow);
  const oldMap = oldPlan ? rasterPlan(oldPlan, g, allow) : null;

  const changes: { idx: number; s0: number; h0: number; m0: number; s1: number; h1: number; m1: number }[] = [];

  // Cells in old footprint and not the new: revert to none
  if (oldMap) {
    for (const [idx, oldExpectedSurf] of oldMap.entries()) {
      if (nextMap.has(idx)) continue;
      // only if cell still holds the old plan's surface and belongs to this hole
      if (g.surf[idx] === oldExpectedSurf && g.hole[idx] === hole) {
        // player bunker/water never change
        if (g.surf[idx] === SURF.bunker || g.surf[idx] === SURF.water) continue;
        changes.push({
          idx,
          s0: g.surf[idx]!,
          h0: g.hole[idx]!,
          m0: g.month[idx]!,
          s1: SURF.none,
          h1: 0,
          m1: 0,
        });
      }
    }
  }

  // Cells in next footprint:
  for (const [idx, newSurf] of nextMap.entries()) {
    // other holes' cells never change
    if (g.hole[idx] !== 0 && g.hole[idx] !== hole) continue;
    // player's water and bunkers never change
    if (g.surf[idx] === SURF.water || g.surf[idx] === SURF.bunker) continue;

    const curSurf = g.surf[idx]!;
    const curHole = g.hole[idx]!;
    const curMonth = g.month[idx]!;

    const holdsOldPlanSurf =
      oldMap !== null && oldMap.has(idx) && curHole === hole && curSurf === oldMap.get(idx);

    // If cell still holds old plan's surface for this hole, set it straight to newSurf.
    // Otherwise, only overwrite if current surface is lower or equal.
    if (holdsOldPlanSurf || curSurf <= newSurf) {
      if (curSurf !== newSurf || curHole !== hole) {
        changes.push({
          idx,
          s0: curSurf,
          h0: curHole,
          m0: curMonth,
          s1: newSurf,
          h1: hole,
          m1: month,
        });
      }
      // If surface and hole are unchanged, keep existing planted month (do not re-seed)
    }
  }

  // Sort changes by cell index for deterministic diff
  changes.sort((a, b) => a.idx - b.idx);

  const n = changes.length;
  const diffIdx = new Uint32Array(n);
  const diffS0 = new Uint8Array(n);
  const diffH0 = new Uint8Array(n);
  const diffM0 = new Uint16Array(n);
  const diffS1 = new Uint8Array(n);
  const diffH1 = new Uint8Array(n);
  const diffM1 = new Uint16Array(n);

  for (let k = 0; k < n; k++) {
    const c = changes[k]!;
    diffIdx[k] = c.idx;
    diffS0[k] = c.s0;
    diffH0[k] = c.h0;
    diffM0[k] = c.m0;
    diffS1[k] = c.s1;
    diffH1[k] = c.h1;
    diffM1[k] = c.m1;

    // apply in place to grid
    g.surf[c.idx] = c.s1;
    g.hole[c.idx] = c.h1;
    g.month[c.idx] = c.m1;
  }
  g.rev++;

  return {
    x0: g.x0,
    y0: g.y0,
    w: g.w,
    n,
    idx: diffIdx,
    s0: diffS0,
    h0: diffH0,
    m0: diffM0,
    s1: diffS1,
    h1: diffH1,
    m1: diffM1,
  };
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
export function planInfo(plan: HolePlan): PlanInfo {
  const line = centreLine(plan);
  let totalLengthTiles = 0;
  for (let i = 0; i < line.length - 1; i++) {
    totalLengthTiles += ptDist(line[i]!, line[i + 1]!);
  }
  const lengthM = Math.round(totalLengthTiles * 2);
  const par = parFromLength(lengthM);

  const greenM2 = plan.greenM2;
  const teeM2 = 28 * 10; // 280 m²

  // fairway m² by trapezoidal integration
  let fairwayM2 = 0;
  const greenFront = greenFrontDistance(plan);
  for (let s = plan.fwStart; s < greenFront; s += 1) {
    fairwayM2 += widthAt(plan, s);
  }

  // rough corridor m² (60 m width along line minus fairway, green, tee)
  const totalCorridorM2 = lengthM * 60;
  const roughM2 = Math.max(0, totalCorridorM2 - fairwayM2 - greenM2 - teeM2);

  return {
    lengthM,
    par,
    m2: {
      tee: teeM2,
      fairway: Math.round(fairwayM2),
      green: Math.round(greenM2),
      rough: Math.round(roughM2),
    },
  };
}

/** computes interactive plan handles (tee, green, bends, left/right width handles, and '+' insert points) */
export function planHandles(plan: HolePlan): PlanHandles {
  const line = centreLine(plan);

  // width handles (sorted by distance s)
  const widths: { s: number; w: number; left: Pt; right: Pt }[] = [];
  let cumM = 0;
  let lineIdx = 0;
  const sortedWidths = [...plan.widths].sort((a, b) => a.s - b.s);

  for (const h of sortedWidths) {
    while (lineIdx < line.length - 1 && cumM < h.s) {
      lineIdx++;
      cumM += ptDist(line[lineIdx - 1]!, line[lineIdx]!) * 2;
    }
    const pt = line[lineIdx]!;
    const pPrev = line[Math.max(0, lineIdx - 1)]!;
    const pNext = line[Math.min(line.length - 1, lineIdx + 1)]!;
    const dx = pNext.x - pPrev.x;
    const dy = pNext.y - pPrev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    const halfTiles = h.w / 4; // h.w / 2 metres = h.w / 4 tiles
    widths.push({
      s: h.s,
      w: h.w,
      left: { x: pt.x + nx * halfTiles, y: pt.y + ny * halfTiles },
      right: { x: pt.x - nx * halfTiles, y: pt.y - ny * halfTiles },
    });
  }

  // '+' points to insert a bend (at midpoint of each straight leg)
  const legs = [plan.tee, ...plan.bends, plan.green];
  const insertPoints: Pt[] = [];
  if (plan.bends.length < 3) {
    for (let i = 0; i < legs.length - 1; i++) {
      insertPoints.push({
        x: (legs[i]!.x + legs[i + 1]!.x) / 2,
        y: (legs[i]!.y + legs[i + 1]!.y) / 2,
      });
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

/** generates CourseArea polygons for hole validation in deriveHoles */
export function planAreas(plan: HolePlan): CourseArea[] {
  const line = centreLine(plan);
  const corridor = buildCorridorPolygon(line);
  const fairway = buildFairwayPolygon(plan, line);
  const tee = buildTeePolygon(plan, line);
  const green = buildGreenPolygon(plan);

  const flat = (pts: Pt[]) => pts.flatMap((p) => [p.x, p.y]);

  const areas: CourseArea[] = [
    { id: 1, surface: 'rough', pts: flat(corridor) },
  ];
  if (fairway.length >= 3) {
    areas.push({ id: 2, surface: 'fairway', pts: flat(fairway) });
  }
  areas.push(
    { id: 3, surface: 'tee', pts: flat(tee) },
    { id: 4, surface: 'green', pts: flat(green) },
  );
  return areas;
}

/** alias for backwards compatibility */
export { planAreas as gridAreas };

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

/** decodes a compact tuple back into a HolePlan */
export function decodePlan(raw: HolePlanTuple | string | unknown): HolePlan | null {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(data) || data.length < 10) return null;
    const [
      hole,
      tee,
      green,
      greenShape,
      greenM2,
      greenTurn,
      bends,
      widths,
      fwStart,
      seed,
    ] = data;

    if (
      typeof hole !== 'number' || !Number.isFinite(hole) || hole < 0 ||
      !Array.isArray(tee) || tee.length !== 2 || typeof tee[0] !== 'number' || typeof tee[1] !== 'number' ||
      !Array.isArray(green) || green.length !== 2 || typeof green[0] !== 'number' || typeof green[1] !== 'number' ||
      typeof greenShape !== 'string' ||
      !['round', 'kidney', 'peanut', 'pear'].includes(greenShape) ||
      typeof greenM2 !== 'number' || !Number.isFinite(greenM2) ||
      typeof greenTurn !== 'number' || !Number.isFinite(greenTurn) ||
      !Array.isArray(bends) || bends.length > 3 ||
      !Array.isArray(widths) ||
      typeof fwStart !== 'number' || !Number.isFinite(fwStart) ||
      typeof seed !== 'number' || !Number.isFinite(seed)
    ) {
      return null;
    }

    for (const b of bends) {
      if (!Array.isArray(b) || b.length !== 2 || typeof b[0] !== 'number' || typeof b[1] !== 'number') {
        return null;
      }
    }

    for (const w of widths) {
      if (!Array.isArray(w) || w.length !== 2 || typeof w[0] !== 'number' || typeof w[1] !== 'number') {
        return null;
      }
    }

    return {
      hole,
      tee: { x: tee[0]!, y: tee[1]! },
      green: { x: green[0]!, y: green[1]! },
      greenShape: greenShape as GreenShape,
      greenM2,
      greenTurn,
      bends: bends.map((b: [number, number]) => ({ x: b[0]!, y: b[1]! })),
      widths: widths.map((w: [number, number]) => ({ s: w[0]!, w: w[1]! })),
      fwStart,
      seed,
    };
  } catch {
    return null;
  }
}

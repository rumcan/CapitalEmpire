// #1338 (the owner, 2026-11-15, putting on a hole he built: "is there no slope? when you build the holes it should add some slope automatically"):
// a built green gets natural contours. T263's Shape the ground lays the green as one plane (1-2%, front low), and with it off the green is the
// land's own even tilt; either way the putting read showed one even slope over the whole green. contourGreen adds, on the course height field
// inside the green and its collar:
// - **the tilt**: the green as a whole (the land plus the course height, its best-fit plane) is turned to fall tiltMin..tiltMax (0.8-2%) toward the
//   front, as seen from the approach, the fall turned up to turnDeg either way; the correction is a plane over the green (at most correctMax);
// - **1-2 features**, 0.12-0.35 m: a hump, a swale (an elongated hollow draining toward the front), a ridge (an elongated hump across the green)
//   or a tier (a soft step across the line of play, the back usually higher); each as wide as its height needs for a face of about featSlope (at
//   4 m samples "a few metres wide" is the smallest the field can carry), kept off the pin;
// - **the bound**: the steepest the putting read can see on the green (the bilinear field's slope, exact at each 4 m cell's corners: land plus
//   course height) stays under maxSlope (3.8%), and round the pin (pinR) under pinSlope (2.9%): the features are scaled down (bisected) until
//   both hold, then the tilt correction if the features alone cannot do it;
// - **the edge**: the change is whole over the green and hold sample past it, and fades out smoothly over blend samples (no lip, no step), and
//   never reaches another hole's cells, water, a road's or a cart path's corridor or the map's edge (faded in over guard samples from them).
// Seeded (greenContourSeed: the game's seed, the hole's number and its plan's seed): the same hole on the same map contours the same. Left as
// it is (skipped 'sculpted') when the green's course height is not one plane already (more than sculptedM off its best plane): it was shaped
// by hand. New hole's Build calls it (paint-tool buildPlan, after T263, inside the Build's undo step, free: part of building the green); never
// on load, Edit Hole Layout or a painted green. Pure: no DOM, deterministic, node-testable. Units: tiles (2 m) for places, metres for heights
// and the features' sizes, samples (4 m) for the masks' distances.
import { CELL_T, SURF, type Grid } from '../course-grid';
import { CH_SIZE, CH_STEP, clampCourseHeightM, type CourseHeightField, type CourseRoadCorridor, type CourseTileBox } from '../course-height';
import { chamfer } from '../hole-ground';
import type { PlanGeom } from '../hole-plan';

/** metres a tile */
const TM = 2;
/** the contours' rules (m/m, metres, tiles, samples) */
export const GREEN_CONTOUR = {
  /** the green's whole fall toward the front (m/m), turned up to turnDeg either way off the approach; the correcting plane at most correctMax */
  tiltMin: 0.008, tiltMax: 0.02, turnDeg: 35, correctMax: 0.045,
  /** the features' height (m) and the face slope their width is made for (m/m) */
  ampMin: 0.12, ampMax: 0.35, featSlope: 0.022,
  /** the steepest on the green (m/m), round the pin (within pinR tiles) */
  maxSlope: 0.038, pinSlope: 0.029, pinR: 2,
  /** the change is whole hold samples past the green, fades out over blend, and fades in over guard from what is kept */
  hold: 1, blend: 4, guard: 2,
  /** a green whose course height is more than this off one plane (m) was shaped by hand: left as it is */
  sculptedM: 0.03,
  /** a sample that would move less than this (m) is left as it is */
  minDh: 0.001,
} as const;

export type GreenFeatureKind = 'hump' | 'swale' | 'ridge' | 'tier';
/** a feature: its middle (tiles), its height (m, a swale's negative; a tier's: the back's rise over the front), its half-lengths along and across its
 *  axis (m; a tier: ra its face's width), the axis (unit, tiles) */
export interface GreenFeature { kind: GreenFeatureKind; x: number; y: number; h: number; ra: number; rb: number; ax: number; ay: number }

export interface GreenContourInput {
  /** the height field (read, never written) */
  field: CourseHeightField;
  /** the course grid with the hole's cells laid */
  grid: Grid;
  /** the hole's number (its green cells: SURF.green of this hole) */
  hole: number;
  /** the approach: the way the ball comes in (unit or not, tiles), from the fairway toward the green */
  approach: { x: number; y: number };
  /** the pin (tiles) */
  pin: { x: number; y: number };
  /** the seed (greenContourSeed) */
  seed: number;
  /** the land's heights (CH_SIZE², m) under the course height, if any: the bound and the tilt are of the ground the ball rolls on */
  land?: Float32Array | null;
  /** the roads and cart paths near the green (their corridors stay as they are) */
  roads?: readonly CourseRoadCorridor[];
}

/** the contours: the samples they change (field index, ascending) with their heights before and after (m), their tile box; the whole tilt (m/m)
 *  and its uphill way (unit: toward the back), the features (as laid: their heights scaled), the share of them kept (scale) and of the tilt's
 *  correction (correct), the steepest slope on the green and round the pin once laid (m/m, land included), the green's samples; skipped: why
 *  nothing was laid */
export interface GreenContour {
  k: Int32Array; before: Float32Array; after: Float32Array; box: CourseTileBox | null;
  tilt: number; dir: { x: number; y: number }; features: GreenFeature[]; scale: number; correct: number;
  maxSlope: number; pinSlope: number; greenSamples: number;
  skipped?: 'no-green' | 'sculpted';
}
const NONE = (skipped: GreenContour['skipped']): GreenContour => ({ k: new Int32Array(0), before: new Float32Array(0), after: new Float32Array(0), box: null, tilt: 0, dir: { x: 0, y: 0 }, features: [], scale: 0, correct: 0, maxSlope: 0, pinSlope: 0, greenSamples: 0, skipped });

/** the seed of hole n's contours: the game's seed, the hole's number and its plan's seed mixed */
export function greenContourSeed(gameSeed: number, hole: number, planSeed = 0): number {
  let h = Math.imul((gameSeed | 0) ^ 0x2c1b3c6d, 0x9e3779b1) ^ Math.imul((hole | 0) + 0x632be5ab, 0x85ebca6b) ^ Math.imul(planSeed | 0, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}

/** the approach into the green of a plan's geometry: from the line of play 20 m short of the green's front to the green (unit, tiles), T263's */
export function greenApproach(geom: PlanGeom, green: { x: number; y: number }): { x: number; y: number } {
  const L = geom.lengthM, sM = Math.max(0, L - geom.greenR - 20);
  let lo = 0, hi = geom.s.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (geom.s[m]! < sM) lo = m + 1; else hi = m; }
  const b = geom.line[lo] ?? geom.line[0];
  let ax = b ? green.x - b.x : 1, ay = b ? green.y - b.y : 0, l = Math.hypot(ax, ay);
  if (l < 1e-6 && geom.line.length >= 2) { const p = geom.line[geom.line.length - 2]!, q = geom.line[geom.line.length - 1]!; ax = q.x - p.x; ay = q.y - p.y; l = Math.hypot(ax, ay); }
  return l < 1e-6 ? { x: 1, y: 0 } : { x: ax / l, y: ay / l };
}

/** a seeded random source (mulberry32), 0 <= v < 1 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** the steepest slope of a dome h (1 - t²)² is BUMP_K h / r */
const BUMP_K = 1.54;

/** a feature's height (m) at tile (x, y) */
function featureAt(f: GreenFeature, x: number, y: number): number {
  const dx = (x - f.x) * TM, dy = (y - f.y) * TM, a = dx * f.ax + dy * f.ay, b = -dx * f.ay + dy * f.ax;
  if (f.kind === 'tier') return f.h * (smooth(a / f.ra + 0.5) - 0.5);
  const t2 = (a / f.ra) ** 2 + (b / f.rb) ** 2;
  return t2 >= 1 ? 0 : f.h * (1 - t2) * (1 - t2);
}

/** the contours of hole n's green (see the file's head) */
export function contourGreen(inp: GreenContourInput): GreenContour {
  const { field, grid: g, hole: n } = inp, P = GREEN_CONTOUR, fd = field.data, land = inp.land ?? null;
  // 1. the green's cells: their box, grown by the hold, the blend, the guard and a sample to spare
  let cx0 = Infinity, cy0 = Infinity, cx1 = -Infinity, cy1 = -Infinity, cells = 0;
  for (let i = 0; i < g.surf.length; i++) {
    if (g.surf[i] !== SURF.green || g.hole[i] !== n) continue;
    const cx = i % g.w, cy = (i - cx) / g.w; cells++;
    if (cx < cx0) cx0 = cx; if (cx > cx1) cx1 = cx; if (cy < cy0) cy0 = cy; if (cy > cy1) cy1 = cy;
  }
  if (!cells) return NONE('no-green');
  const PAD = (P.hold + P.blend + P.guard + 2) * CH_STEP;
  const i0 = Math.max(0, Math.floor((g.x0 + cx0 * CELL_T - PAD) / CH_STEP)), j0 = Math.max(0, Math.floor((g.y0 + cy0 * CELL_T - PAD) / CH_STEP));
  const i1 = Math.min(CH_SIZE - 1, Math.ceil((g.x0 + (cx1 + 1) * CELL_T + PAD) / CH_STEP) - 1), j1 = Math.min(CH_SIZE - 1, Math.ceil((g.y0 + (cy1 + 1) * CELL_T + PAD) / CH_STEP) - 1);
  const W = i1 - i0 + 1, H = j1 - j0 + 1, S = W * H;
  const cellAt = (x: number, y: number) => { const cx = Math.floor((x - g.x0) / CELL_T), cy = Math.floor((y - g.y0) / CELL_T); return cx < 0 || cy < 0 || cx >= g.w || cy >= g.h ? -1 : cy * g.w + cx; };
  const onGreen = (x: number, y: number) => { const c = cellAt(x, y); return c >= 0 && g.surf[c] === SURF.green && g.hole[c] === n; };
  // 2. the samples: on the green (by the 2 x 2 cells round the middle, T263's), kept (off the grid, and below)
  const green = new Uint8Array(S), keep = new Uint8Array(S);
  const QX = [-0.25, 0.25, -0.25, 0.25], QY = [-0.25, -0.25, 0.25, 0.25];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, X = (i0 + i + 0.5) * CH_STEP, Y = (j0 + j + 0.5) * CH_STEP;
    let any = false;
    for (let q = 0; q < 4; q++) { const c = cellAt(X + QX[q]!, Y + QY[q]!); if (c < 0) continue; any = true; if (g.surf[c] === SURF.green && g.hole[c] === n) green[k] = 1; }
    if (!any) keep[k] = 1;
  }
  // another hole's cell or water: every sample whose bilinear reach holds the cell's middle is kept
  const gx0 = Math.max(0, Math.floor((i0 * CH_STEP - g.x0) / CELL_T)), gy0 = Math.max(0, Math.floor((j0 * CH_STEP - g.y0) / CELL_T));
  const gx1 = Math.min(g.w - 1, Math.ceil(((i1 + 1) * CH_STEP - g.x0) / CELL_T)), gy1 = Math.min(g.h - 1, Math.ceil(((j1 + 1) * CH_STEP - g.y0) / CELL_T));
  for (let cy = gy0; cy <= gy1; cy++) for (let cx = gx0; cx <= gx1; cx++) {
    const c = cy * g.w + cx, s = g.surf[c]!, h = g.hole[c]!;
    if (!s || !(s === SURF.water || (h && h !== n))) continue;
    const fx = (g.x0 + (cx + 0.5) * CELL_T) / CH_STEP - 0.5 - i0, fy = (g.y0 + (cy + 0.5) * CELL_T) / CH_STEP - 0.5 - j0, a0 = Math.floor(fx), b0 = Math.floor(fy);
    for (let b = b0; b <= b0 + 1; b++) for (let a = a0; a <= a0 + 1; a++) if (a >= 0 && b >= 0 && a < W && b < H) keep[b * W + a] = 1;
  }
  for (const rd of inp.roads ?? []) {
    const reach = Math.max(0.5, rd.halfWidthTiles) + Math.max(0, rd.marginTiles ?? 2) + CH_STEP + 0.5;
    const dx = rd.bx - rd.ax, dy = rd.by - rd.ay, l2 = dx * dx + dy * dy;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const X = (i0 + i + 0.5) * CH_STEP, Y = (j0 + j + 0.5) * CH_STEP;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((X - rd.ax) * dx + (Y - rd.ay) * dy) / l2)) : 0;
      if (Math.hypot(X - (rd.ax + dx * t), Y - (rd.ay + dy * t)) < reach) keep[j * W + i] = 1;
    }
  }
  // 3. the weight: whole over the green and the hold, out over the blend, in from what is kept
  const dG = chamfer(green, W, H), dK = chamfer(keep, W, H), wt = new Float32Array(S);
  for (let k = 0; k < S; k++) {
    if (keep[k]) continue;
    const z = dG[k]! <= P.hold ? 1 : 1 - smooth((dG[k]! - P.hold) / P.blend);
    wt[k] = z * smooth(dK[k]! / P.guard);
  }
  // 4. the green's samples: their middle, the best plane of the ground (land and course height) and of the course height alone
  const base = new Float32Array(S);
  let gn = 0, mx = 0, my = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, fk = (j0 + j) * CH_SIZE + i0 + i;
    base[k] = fd[fk]! + (land ? land[fk]! : 0);
    if (green[k]) { gn++; mx += (i0 + i + 0.5) * CH_STEP; my += (j0 + j + 0.5) * CH_STEP; }
  }
  if (!gn) return NONE('no-green');
  mx /= gn; my /= gn;
  const fit = (v: (k: number) => number) => {
    let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0, sz = 0;
    for (let k = 0; k < S; k++) if (green[k]) { const X = ((i0 + (k % W) + 0.5) * CH_STEP - mx) * TM, Y = ((j0 + Math.floor(k / W) + 0.5) * CH_STEP - my) * TM, z = v(k); sxx += X * X; sxy += X * Y; syy += Y * Y; sxz += X * z; syz += Y * z; sz += z; }
    const det = sxx * syy - sxy * sxy, z0 = sz / gn;
    const gx = det > 1e-9 ? (sxz * syy - syz * sxy) / det : 0, gy = det > 1e-9 ? (syz * sxx - sxz * sxy) / det : 0;
    return { gx, gy, z0 };
  };
  // shaped by hand: the course height over the green is not one plane
  const fc = fit(k => fd[(j0 + Math.floor(k / W)) * CH_SIZE + i0 + (k % W)]!);
  for (let k = 0; k < S; k++) if (green[k]) {
    const X = ((i0 + (k % W) + 0.5) * CH_STEP - mx) * TM, Y = ((j0 + Math.floor(k / W) + 0.5) * CH_STEP - my) * TM;
    if (Math.abs(fd[(j0 + Math.floor(k / W)) * CH_SIZE + i0 + (k % W)]! - (fc.z0 + fc.gx * X + fc.gy * Y)) > P.sculptedM) return { ...NONE('sculpted'), greenSamples: gn };
  }
  const fb = fit(k => base[k]!);
  // 5. the tilt: the whole green falls tilt toward the front, turned up to turnDeg; the correcting plane over it (at most correctMax)
  const r = rng(inp.seed);
  let ax = inp.approach.x, ay = inp.approach.y; { const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l; if (!Number.isFinite(ax) || !Number.isFinite(ay)) { ax = 1; ay = 0; } }
  const tilt = P.tiltMin + (P.tiltMax - P.tiltMin) * r(), turn = ((r() * 2 - 1) * P.turnDeg * Math.PI) / 180;
  const ux = ax * Math.cos(turn) - ay * Math.sin(turn), uy = ax * Math.sin(turn) + ay * Math.cos(turn);
  let cgx = tilt * ux - fb.gx, cgy = tilt * uy - fb.gy; { const m = Math.hypot(cgx, cgy); if (m > P.correctMax) { cgx *= P.correctMax / m; cgy *= P.correctMax / m; } }
  const plane = new Float32Array(S);
  for (let k = 0; k < S; k++) if (wt[k]) plane[k] = cgx * ((i0 + (k % W) + 0.5) * CH_STEP - mx) * TM + cgy * ((j0 + Math.floor(k / W) + 0.5) * CH_STEP - my) * TM;
  // 6. the features: 1 or 2 of hump, swale, ridge, tier (no two alike), kept off the pin
  const Rg = Math.sqrt((cells * (CELL_T * TM) ** 2) / Math.PI), pin = inp.pin, feats: GreenFeature[] = [];
  const kinds: GreenFeatureKind[] = ['hump', 'swale', 'ridge', 'tier'];
  for (let q = kinds.length - 1; q > 0; q--) { const p = Math.floor(r() * (q + 1)); [kinds[q], kinds[p]] = [kinds[p]!, kinds[q]!]; }
  const count = r() < 0.5 ? 1 : 2, bx = -ay, by = ax;
  /** a point off the green's middle (m along the approach, m across it), turned half round when it falls on the pin */
  const offMid = (a: number, b: number) => {
    let x = mx + (a * ax + b * bx) / TM, y = my + (a * ay + b * by) / TM;
    if (Math.hypot(x - pin.x, y - pin.y) * TM < 0.35 * Rg) { x = mx - (a * ax + b * bx) / TM; y = my - (a * ay + b * by) / TM; }
    return { x, y };
  };
  for (let q = 0; q < count; q++) {
    const kind = kinds[q]!, amp = P.ampMin + (P.ampMax - P.ampMin) * r();
    if (kind === 'hump' || kind === 'swale') {
      const ang = r() * 2 * Math.PI, d = (0.4 + 0.3 * r()) * Rg, c = offMid(d * Math.cos(ang), d * Math.sin(ang));
      const rb = Math.max(6, Math.min(1.4 * Rg, (BUMP_K * amp) / P.featSlope)), h = Math.min(amp, (P.featSlope * rb) / BUMP_K);
      // a swale drains toward the front: long along the approach, give or take 40 degrees
      const t = kind === 'swale' ? ((r() * 2 - 1) * 40 * Math.PI) / 180 : 0, fx = ax * Math.cos(t) - ay * Math.sin(t), fy = ax * Math.sin(t) + ay * Math.cos(t);
      feats.push({ kind, x: c.x, y: c.y, h: kind === 'swale' ? -h : h, ra: kind === 'swale' ? rb * (1.6 + 0.6 * r()) : rb, rb, ax: fx, ay: fy });
    } else if (kind === 'ridge') {
      const t = r() * Math.PI, fx = Math.cos(t), fy = Math.sin(t), off = (0.2 + 0.25 * r()) * Rg * (r() < 0.5 ? -1 : 1);
      const rb = Math.max(5, Math.min(1.0 * Rg, (BUMP_K * amp) / P.featSlope)), h = Math.min(amp, (P.featSlope * rb) / BUMP_K);
      // its spine off the middle, along its normal (a pin on the spine sits on its flat top)
      feats.push({ kind, x: mx + (-fy * off) / TM, y: my + (fx * off) / TM, h, ra: 1.4 * Rg, rb, ax: fx, ay: fy });
    } else {
      // a tier: a soft step across the line of play (the back up, mostly), its face off the middle and the pin
      const t = ((r() * 2 - 1) * 25 * Math.PI) / 180, fx = ax * Math.cos(t) - ay * Math.sin(t), fy = ax * Math.sin(t) + ay * Math.cos(t);
      const wf = Math.max(6, Math.min(1.6 * Rg, (1.5 * amp) / P.featSlope)), h = Math.min(amp, (P.featSlope * wf) / 1.5);
      const c = offMid((0.2 + 0.2 * r()) * Rg * (r() < 0.5 ? -1 : 1), 0);
      feats.push({ kind, x: c.x, y: c.y, h: r() < 0.75 ? h : -h, ra: wf, rb: 0, ax: fx, ay: fy });
    }
  }
  const F = new Float32Array(S);
  for (let k = 0; k < S; k++) if (wt[k]) { const X = (i0 + (k % W) + 0.5) * CH_STEP, Y = (j0 + Math.floor(k / W) + 0.5) * CH_STEP; let v = 0; for (const f of feats) v += featureAt(f, X, Y); F[k] = v; }
  // 7. the bound: the steepest bilinear slope over the cells of samples on the green (a corner or the middle on it), and round the pin
  const quads: number[] = [], pinQ: number[] = [];
  for (let j = 0; j + 1 < H; j++) for (let i = 0; i + 1 < W; i++) {
    const X0 = (i0 + i + 0.5) * CH_STEP, Y0 = (j0 + j + 0.5) * CH_STEP, X1 = X0 + CH_STEP, Y1 = Y0 + CH_STEP;
    if (onGreen(X0, Y0) || onGreen(X1, Y0) || onGreen(X0, Y1) || onGreen(X1, Y1) || onGreen((X0 + X1) / 2, (Y0 + Y1) / 2)) quads.push(j * W + i);
    if (Math.hypot(Math.max(X0 - pin.x, 0, pin.x - X1), Math.max(Y0 - pin.y, 0, pin.y - Y1)) <= P.pinR) pinQ.push(j * W + i);
  }
  const tot = new Float32Array(S);
  const steepest = (qs: readonly number[]) => {
    let m = 0;
    for (const k of qs) {
      const a = tot[k]!, b = tot[k + 1]!, c = tot[k + W]!, d = tot[k + W + 1]!, s = CH_STEP * TM;
      const gt = (b - a) / s, gb = (d - c) / s, gl = (c - a) / s, gr = (d - b) / s;
      m = Math.max(m, Math.hypot(gt, gl), Math.hypot(gt, gr), Math.hypot(gb, gl), Math.hypot(gb, gr));
    }
    return m;
  };
  const lay = (lam: number, c: number) => { for (let k = 0; k < S; k++) tot[k] = base[k]! + wt[k]! * (c * plane[k]! + lam * F[k]!); };
  // (a margin under the bounds: the heights are rounded and the samples that would move under minDh left, once laid)
  const ok = (lam: number, c: number) => { lay(lam, c); return steepest(quads) <= P.maxSlope - 5e-4 && steepest(pinQ) <= P.pinSlope - 5e-4; };
  let lam = 1, cor = 1;
  if (!ok(1, 1)) {
    if (ok(0, 1)) { let lo = 0, hi = 1; for (let q = 0; q < 16; q++) { const m = (lo + hi) / 2; if (ok(m, 1)) lo = m; else hi = m; } lam = lo; }
    else {
      // the features cannot do it alone: none, and the tilt's correction as far as it holds (none when even that is too steep: the land's own)
      lam = 0; let lo = 0, hi = 1; if (ok(0, 0)) { for (let q = 0; q < 16; q++) { const m = (lo + hi) / 2; if (ok(0, m)) lo = m; else hi = m; } cor = lo; } else { lay(0, 1); const s1 = steepest(quads); lay(0, 0); cor = s1 < steepest(quads) ? 1 : 0; }
    }
  }
  // 8. the new heights
  const ks: number[] = [], before: number[] = [], after: number[] = [];
  let bi0 = Infinity, bj0 = Infinity, bi1 = -Infinity, bj1 = -Infinity;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i; if (!wt[k]) continue;
    const fk = (j0 + j) * CH_SIZE + i0 + i, old = fd[fk]!, nh = Math.fround(clampCourseHeightM(old + wt[k]! * (cor * plane[k]! + lam * F[k]!)));
    if (Math.abs(nh - old) < P.minDh) continue;
    ks.push(fk); before.push(old); after.push(nh);
    const gi = i0 + i, gj = j0 + j;
    if (gi < bi0) bi0 = gi; if (gi > bi1) bi1 = gi; if (gj < bj0) bj0 = gj; if (gj > bj1) bj1 = gj;
  }
  // the bound as laid (rounded heights, the samples that moved too little left as they are)
  for (let k = 0; k < S; k++) tot[k] = base[k]!;
  for (let q = 0; q < ks.length; q++) { const fk = ks[q]!, gi = fk % CH_SIZE, gj = (fk - gi) / CH_SIZE; tot[(gj - j0) * W + gi - i0] = after[q]! + (land ? land[fk]! : 0); }
  return {
    k: Int32Array.from(ks), before: Float32Array.from(before), after: Float32Array.from(after),
    box: ks.length ? [bi0 * CH_STEP, bj0 * CH_STEP, (bi1 + 1) * CH_STEP, (bj1 + 1) * CH_STEP] : null,
    tilt: Math.hypot(fb.gx + cor * cgx, fb.gy + cor * cgy), dir: { x: ux, y: uy }, features: feats.map(f => ({ ...f, h: f.h * lam })), scale: lam, correct: cor,
    maxSlope: steepest(quads), pinSlope: steepest(pinQ), greenSamples: gn,
  };
}

/** writes contours into the field (rev++; touch their box in the undo journal first) and returns their box, or null when they change nothing */
export function applyGreenContour(field: CourseHeightField, c: GreenContour): CourseTileBox | null {
  if (!c.k.length) return null;
  for (let q = 0; q < c.k.length; q++) field.data[c.k[q]!] = c.after[q]!;
  field.rev++;
  return c.box;
}

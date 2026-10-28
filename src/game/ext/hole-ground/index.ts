// T263 (#771; the owner, 2026-10-29: "auto add some undulations and raised and lowered parts to the holes when you create them"): the ground a
// new hole's Build shapes (New hole's "Shape the ground", on by default), worked out from the plan and the cells the Build lays, on the course
// height field (ext/course-height: 4 m samples, ±3 m). It is designed, not noise:
// - **fairway rolls**: a seeded knot curve along the line of play, crest to trough 0.3-0.8 m over 20-40 m, cosine-eased between knots (smooth,
//   never periodic: every spacing and swing is drawn afresh), the swing capped by its run so no roll is steeper than about 3% (with the ridges'
//   skew and the gentle cross tilt the fairway stays under 4%); past the fairway the rolls fade to a share of themselves;
// - **mounds** (0.5-1.5 m, cosine-squared domes, flanks up to about 1 in 4 so the slope light reads them) in the rough beside the fairway and
//   round the back and sides of the green, kept off the playing surfaces and clear of bunkers (T253's lips and grass mounds round the sand
//   are shading; these sit beyond them);
// - **hollows**: a swale beside the green and one beside each bunker in reach, past T253's mounds;
// - the **green** a plane tilted 1-2% up from front to back, its front (and the hold's) on the approach's roll where it meets it (lifted
//   0-0.1 m), so the run-up stays gentle and the back stands up to half a metre higher; held as one plane 2 samples past its cells so its
//   edge slope (evaluateCourseHeightQuality's vertices) is the tilt; no false front;
// - the **tee** level at the ground's height under it (T127 draws its raised pad on top);
// - the **edges** blend out over the ground round the hole (1 sample inside to 3 outside its cells: the map's grass and the property's base
//   grass, its rough, long grass and fescue), and never reach a cell of another hole, water, the property's built surfaces (its tees,
//   fairways, greens, bunkers, waste), a road's or a cart path's corridor (flattenCourseCorridor's), the practice area or land you do not own:
//   every sample whose bilinear reach touches one stays exactly as it is, the samples round it fade in over 3.
// The result is a list of samples with their heights before and after and the earth moved: the cut (Σ of the drops) carried to the fills (Σ of
// the rises), what is short brought in and what is over taken away, so max(cut, fill) m³ (× COURSE_CELL_M2 a metre of a sample); for a
// one-way job, as a Ground height brush dab, that is the brush's own measure (estimateCourseBrushM3, Σ|Δh|); the Build prices it at
// golf/costs SHAPE_RATE_M3 (shaped while the hole is built: a third of the brush's rework rate). applyHoleGround writes it (touch the journal
// first). Pure: no DOM, deterministic, node-testable.
// Units: tiles (2 m) for places, metres for heights and along-the-line distances, samples (4 m) for the masks' distances.
import { CELL_T, SURF, type Grid, type GridDiff } from '../course-grid';
import { CH_SIZE, CH_STEP, COURSE_CELL_M2, clampCourseHeightM, type CourseHeightField, type CourseRoadCorridor, type CourseTileBox } from '../course-height';
import { widthAt, type HolePlan, type PlanGeom } from '../hole-plan';

/** the shaping's rules (metres, m/m, samples) */
export const HOLE_GROUND = {
  /** the fairway rolls: crest to trough minM..maxM over a run of minLenM..maxLenM, the swing at most grade × the run (cosine easing: its
   *  steepest slope is π/2 × grade, 3.1%) */
  roll: { minM: 0.3, maxM: 0.8, minLenM: 20, maxLenM: 40, grade: 0.02 },
  /** the rolls' ridges lean across the line by up to this (along-line metres per lateral metre) */
  skew: 0.2,
  /** the gentle cross tilt: a knot curve of slopes (±grade) every minLenM..maxLenM along the line, saturating satM out from the line */
  cross: { grade: 0.005, minLenM: 60, maxLenM: 100, satM: 20 },
  /** the rolls' share in the rough (they fade from 1 a sample past the playing surfaces to this 4 samples out) */
  rollRough: 0.25,
  /** the mounds beside the fairway: height minM..maxM (lower ones likelier), radius 5 m + 3.5 m per metre of height
   *  (flanks up to about 1 in 4, so the slope light reads them), one every gapMinM..gapMaxM */
  mound: { minM: 0.5, maxM: 1.5, gapMinM: 35, gapMaxM: 70 },
  /** the green: its tilt (m/m, front low, back high), its front lifted liftMin..liftMax (m) off the approach, its plane held hold samples past
   *  its cells, blended out over blend */
  green: { tiltMin: 0.01, tiltMax: 0.02, liftMin: 0, liftMax: 0.1, hold: 2, blend: 3 },
  /** the tee: level, held hold samples past its cells, blended out over blend */
  tee: { hold: 1.5, blend: 3 },
  /** the hollows (swales): depth (m) */
  hollow: { minM: 0.35, maxM: 0.6 },
  /** the edge blend: full from reachIn samples inside the hole's cells, none from reachOut samples outside; the fade in from what is kept (guard) */
  reachIn: 1, reachOut: 3, guard: 3,
  /** a sample that would move less than this (m) is left as it is */
  minDh: 0.002,
} as const;

/** a mound or a hollow laid out for the hole: its middle (tiles), its height (m; a hollow's is negative) and radius (tiles) */
export interface HoleGroundFeature { kind: 'mound' | 'hollow'; x: number; y: number; h: number; r: number }

/** what a new hole's Build would shape */
export interface HoleGroundInput {
  /** the course grid (before the Build) */
  grid: Grid;
  /** the hole's number */
  hole: number;
  /** its plan and the plan's geometry (hole-plan planGeom) */
  plan: HolePlan;
  geom: PlanGeom;
  /** the cells the Build lays (the wizard ghost's diff), laid over the grid here; without it the grid's own cells of the hole */
  diff?: GridDiff | null;
  /** the height field (read, never written) */
  field: CourseHeightField;
  /** the roads and cart paths near the hole (their corridors stay as they are) */
  roads?: readonly CourseRoadCorridor[];
  /** whether tile (x, y) is your land (missing: all of it) */
  owned?(x: number, y: number): boolean;
  /** whether tile (x, y) is on the practice area (missing: none) */
  practice?(x: number, y: number): boolean;
  /** the seed (missing: the plan's seed and hole number) */
  seed?: number;
}

/** the shaping: the samples it changes (field index j × CH_SIZE + i, ascending) with their heights before and after (m), their tile box,
 *  the earth cut and filled and the earth moved (m³: max(cut, fill), the cut carried to the fills), and what was laid out (the features, the green's tilt and raise: its pin over the ground there, the tee's level) */
export interface HoleGroundShape {
  k: Int32Array; before: Float32Array; after: Float32Array;
  box: CourseTileBox | null;
  cut: number; fill: number; m3: number;
  features: HoleGroundFeature[];
  tilt: number; raise: number; teeM: number;
}

/** the shaping of nothing */
export const NO_GROUND: HoleGroundShape = { k: new Int32Array(0), before: new Float32Array(0), after: new Float32Array(0), box: null, cut: 0, fill: 0, m3: 0, features: [], tilt: 0, raise: 0, teeM: 0 };

/** the hole's seed for its shaping (the plan's seed and number mixed) */
export function holeGroundSeed(plan: HolePlan): number { return (Math.imul(plan.seed | 0, 0x9e3779b1) ^ Math.imul(plan.hole | 0, 0x85ebca6b) ^ 0x5bd1e995) >>> 0; }

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

/** a knot curve: values v at stations s (ascending), cosine-eased between them (smooth, flat at each knot), held past the ends */
export interface Knots { s: Float64Array; v: Float64Array }
/** the knot curve's value at station x */
export function knotAt(k: Knots, x: number): number {
  const n = k.s.length; if (!n) return 0;
  if (x <= k.s[0]!) return k.v[0]!;
  if (x >= k.s[n - 1]!) return k.v[n - 1]!;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (k.s[m]! <= x) lo = m; else hi = m; }
  const t = (x - k.s[lo]!) / (k.s[hi]! - k.s[lo]!), e = (1 - Math.cos(Math.PI * t)) / 2;
  return k.v[lo]! + (k.v[hi]! - k.v[lo]!) * e;
}
/** the fairway rolls over lengthM metres (and a run either side): each step a run of minLenM..maxLenM and a swing of minM..min(maxM,
 *  grade × run), up after a crest's down and down after a trough's up (a swing smaller than the way back to level keeps going the same way) */
export function rollKnots(seed: number, lengthM: number): Knots {
  const r = rng(seed ^ 0x1b873593), R = HOLE_GROUND.roll, s: number[] = [], v: number[] = [];
  let at = -R.maxLenM - R.maxLenM * r(), h = (r() - 0.5) * 0.4;
  s.push(at); v.push(h);
  while (at < lengthM + R.maxLenM) {
    const run = R.minLenM + (R.maxLenM - R.minLenM) * r(), top = Math.max(R.minM, Math.min(R.maxM, R.grade * run));
    const swing = R.minM + (top - R.minM) * r();
    h = h >= 0 ? h - swing : h + swing;
    at += run; s.push(at); v.push(h);
  }
  return { s: Float64Array.from(s), v: Float64Array.from(v) };
}
/** the cross tilt's slopes along the line (±grade, a knot every minLenM..maxLenM) */
function crossKnots(seed: number, lengthM: number): Knots {
  const r = rng(seed ^ 0x2545f491), C = HOLE_GROUND.cross, s: number[] = [], v: number[] = [];
  let at = -C.maxLenM * r();
  while (at < lengthM + C.maxLenM) { s.push(at); v.push((r() * 2 - 1) * C.grade); at += C.minLenM + (C.maxLenM - C.minLenM) * r(); }
  s.push(at); v.push((r() * 2 - 1) * C.grade);
  return { s: Float64Array.from(s), v: Float64Array.from(v) };
}

/** the distance (in grid steps, 1 and √2) from every cell of a W × H grid to the nearest set cell (two-pass chamfer; none set: 1e9) */
function chamfer(set: Uint8Array, W: number, H: number): Float32Array {
  const out = new Float32Array(W * H), D2 = Math.SQRT2, INF = 1e9;
  for (let k = 0; k < out.length; k++) out[k] = set[k] ? 0 : INF;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i; let v = out[k]!; if (!v) continue;
    if (i > 0) v = Math.min(v, out[k - 1]! + 1);
    if (j > 0) { v = Math.min(v, out[k - W]! + 1); if (i > 0) v = Math.min(v, out[k - W - 1]! + D2); if (i < W - 1) v = Math.min(v, out[k - W + 1]! + D2); }
    out[k] = v;
  }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
    const k = j * W + i; let v = out[k]!; if (!v) continue;
    if (i < W - 1) v = Math.min(v, out[k + 1]! + 1);
    if (j < H - 1) { v = Math.min(v, out[k + W]! + 1); if (i < W - 1) v = Math.min(v, out[k + W + 1]! + D2); if (i > 0) v = Math.min(v, out[k + W - 1]! + D2); }
    out[k] = v;
  }
  return out;
}
/** a [1 2 1] / 4 blur of a W × H field, in place, along both axes (edges held) */
function blur121(a: Float32Array, W: number, H: number): void {
  const row = new Float32Array(Math.max(W, H));
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) row[i] = a[j * W + i]!;
    for (let i = 1; i < W - 1; i++) a[j * W + i] = (row[i - 1]! + 2 * row[i]! + row[i + 1]!) / 4;
  }
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < H; j++) row[j] = a[j * W + i]!;
    for (let j = 1; j < H - 1; j++) a[j * W + i] = (row[j - 1]! + 2 * row[j]! + row[j + 1]!) / 4;
  }
}

/** the ground a new hole's Build shapes (see the file's head); NO_GROUND when it lays no cell of the hole */
export function shapeHoleGround(inp: HoleGroundInput): HoleGroundShape {
  const { grid: g, hole: n, plan, geom, field } = inp, P = HOLE_GROUND, fd = field.data, diff = inp.diff ?? null;
  if (diff && (diff.w !== g.w || diff.x0 !== g.x0 || diff.y0 !== g.y0)) return NO_GROUND;
  // 1. the hole's cells once built: their box (from the diff, or the grid's own cells of the hole), grown by the reach and the guard
  let cx0 = Infinity, cy0 = Infinity, cx1 = -Infinity, cy1 = -Infinity;
  const grow = (i: number) => { const cx = i % g.w, cy = (i - cx) / g.w; if (cx < cx0) cx0 = cx; if (cx > cx1) cx1 = cx; if (cy < cy0) cy0 = cy; if (cy > cy1) cy1 = cy; };
  if (diff) { for (let k = 0; k < diff.n; k++) if (diff.h1[k] === n && diff.s1[k]) grow(diff.idx[k]!); }
  else for (let i = 0; i < g.hole.length; i++) if (g.hole[i] === n && g.surf[i]) grow(i);
  if (cx1 < cx0) return NO_GROUND;
  const PADC = Math.ceil(((P.reachOut + P.guard + 2) * CH_STEP) / CELL_T);
  const bx0 = Math.max(0, cx0 - PADC), by0 = Math.max(0, cy0 - PADC), bx1 = Math.min(g.w - 1, cx1 + PADC), by1 = Math.min(g.h - 1, cy1 + PADC);
  const BW = bx1 - bx0 + 1, BH = by1 - by0 + 1, surf = new Uint8Array(BW * BH), hol = new Uint8Array(BW * BH);
  for (let y = 0; y < BH; y++) { const r = (by0 + y) * g.w + bx0; surf.set(g.surf.subarray(r, r + BW), y * BW); hol.set(g.hole.subarray(r, r + BW), y * BW); }
  if (diff) for (let k = 0; k < diff.n; k++) {
    const i = diff.idx[k]!, cx = (i % g.w) - bx0, cy = Math.floor(i / g.w) - by0;
    if (cx >= 0 && cy >= 0 && cx < BW && cy < BH) { surf[cy * BW + cx] = diff.s1[k]!; hol[cy * BW + cx] = diff.h1[k]!; }
  }
  const local = (x: number, y: number) => { const cx = Math.floor((x - g.x0) / CELL_T) - bx0, cy = Math.floor((y - g.y0) / CELL_T) - by0; return cx < 0 || cy < 0 || cx >= BW || cy >= BH ? -1 : cy * BW + cx; };
  // 2. the samples over that box, each classed by the 2 x 2 cells round its middle: the hole's (H), its playing surfaces, tee, green, a bunker
  const tx0 = g.x0 + bx0 * CELL_T, ty0 = g.y0 + by0 * CELL_T, tx1 = g.x0 + (bx1 + 1) * CELL_T, ty1 = g.y0 + (by1 + 1) * CELL_T;
  const i0 = Math.max(0, Math.floor(tx0 / CH_STEP)), j0 = Math.max(0, Math.floor(ty0 / CH_STEP));
  const i1 = Math.min(CH_SIZE - 1, Math.ceil(tx1 / CH_STEP) - 1), j1 = Math.min(CH_SIZE - 1, Math.ceil(ty1 / CH_STEP) - 1);
  if (i1 < i0 || j1 < j0) return NO_GROUND;
  const W = i1 - i0 + 1, H = j1 - j0 + 1, S = W * H;
  const isH = new Uint8Array(S), notH = new Uint8Array(S), play = new Uint8Array(S), tee = new Uint8Array(S), green = new Uint8Array(S), bunk = new Uint8Array(S), fRaw = new Uint8Array(S), isF = new Uint8Array(S);
  const QX = [-0.25, 0.25, -0.25, 0.25], QY = [-0.25, -0.25, 0.25, 0.25];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, X = (i0 + i + 0.5) * CH_STEP, Y = (j0 + j + 0.5) * CH_STEP;
    let any = false;
    for (let q = 0; q < 4; q++) {
      const c = local(X + QX[q]!, Y + QY[q]!); if (c < 0) continue;
      any = true;
      const s = surf[c]!; if (s === SURF.bunker) bunk[k] = 1;
      if (hol[c] !== n || !s) continue;
      isH[k] = 1;
      if (s === SURF.fairway || s === SURF.green || s === SURF.tee) play[k] = 1;
      if (s === SURF.tee) tee[k] = 1; else if (s === SURF.green) green[k] = 1;
    }
    if (!isH[k]) notH[k] = 1;
    // off the grid, off your land or on the practice area: kept (and the samples round it, below)
    if (!any || (inp.owned && !inp.owned(X, Y)) || inp.practice?.(X, Y)) fRaw[k] = 1;
  }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (!fRaw[j * W + i]) continue;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < W && b < H) isF[b * W + a] = 1; }
  }
  // another hole's cell, water, or the property's built surfaces (its base grass, rough, long grass and fescue, is ground the edges blend
  // into): every sample whose bilinear reach (2 tiles each way) holds the cell's middle is kept
  for (let cy = 0; cy < BH; cy++) for (let cx = 0; cx < BW; cx++) {
    const c = cy * BW + cx, s = surf[c]!, h = hol[c]!;
    if (!s || (s !== SURF.water && (h === n || (!h && (s === SURF.rough || s === SURF.longGrass || s === SURF.fescue))))) continue;
    const fx = (g.x0 + (bx0 + cx + 0.5) * CELL_T) / CH_STEP - 0.5 - i0, fy = (g.y0 + (by0 + cy + 0.5) * CELL_T) / CH_STEP - 0.5 - j0;
    const a0 = Math.floor(fx), b0 = Math.floor(fy);
    for (let b = b0; b <= b0 + 1; b++) for (let a = a0; a <= a0 + 1; a++) if (a >= 0 && b >= 0 && a < W && b < H) isF[b * W + a] = 1;
  }
  // a road's or a cart path's corridor (flattenCourseCorridor's reach, and the bilinear reach past it)
  for (const rd of inp.roads ?? []) {
    const reach = Math.max(0.5, rd.halfWidthTiles) + Math.max(0, rd.marginTiles ?? 2) + CH_STEP + 0.5;
    const dx = rd.bx - rd.ax, dy = rd.by - rd.ay, l2 = dx * dx + dy * dy;
    const ri0 = Math.max(0, Math.floor((Math.min(rd.ax, rd.bx) - reach) / CH_STEP) - i0), ri1 = Math.min(W - 1, Math.ceil((Math.max(rd.ax, rd.bx) + reach) / CH_STEP) - i0);
    const rj0 = Math.max(0, Math.floor((Math.min(rd.ay, rd.by) - reach) / CH_STEP) - j0), rj1 = Math.min(H - 1, Math.ceil((Math.max(rd.ay, rd.by) + reach) / CH_STEP) - j0);
    for (let j = rj0; j <= rj1; j++) for (let i = ri0; i <= ri1; i++) {
      const X = (i0 + i + 0.5) * CH_STEP, Y = (j0 + j + 0.5) * CH_STEP;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((X - rd.ax) * dx + (Y - rd.ay) * dy) / l2)) : 0;
      if (Math.hypot(X - (rd.ax + dx * t), Y - (rd.ay + dy * t)) < reach) isF[j * W + i] = 1;
    }
  }
  // 3. the masks' distances (samples): in and out of the hole, from what is kept, from the playing surfaces, the tee, the green, the bunkers
  const dIn = chamfer(notH, W, H), dOut = chamfer(isH, W, H), dF = chamfer(isF, W, H), dPlay = chamfer(play, W, H);
  const dTee = chamfer(tee, W, H), dGreen = chamfer(green, W, H), dBunk = chamfer(bunk, W, H);
  // the weight: the edge blend (full reachIn inside the hole's cells, none reachOut outside) times the fade in from what is kept
  const wt = new Float32Array(S);
  for (let k = 0; k < S; k++) {
    if (isF[k]) continue;
    const sd = isH[k] ? -(dIn[k]! - 0.5) : dOut[k]! - 0.5;
    wt[k] = (1 - smooth((sd + P.reachIn) / (P.reachIn + P.reachOut))) * smooth(dF[k]! / P.guard);
  }
  // 4. where each sample lies along the line of play (m from the back tee) and across it (m, + on the left), for the samples that move
  const line = geom.line, L = geom.lengthM, seed = inp.seed ?? holeGroundSeed(plan);
  const step = 4, idx: number[] = []; for (let q = 0; q < line.length; q += step) idx.push(q); if (idx[idx.length - 1] !== line.length - 1) idx.push(line.length - 1);
  const along = new Float32Array(S), across = new Float32Array(S);
  for (let k = 0; k < S; k++) {
    if (!wt[k]) continue;
    const X = (i0 + (k % W) + 0.5) * CH_STEP, Y = (j0 + Math.floor(k / W) + 0.5) * CH_STEP;
    let best = Infinity, bs = 0, bd = 0;
    for (let q = 0; q + 1 < idx.length; q++) {
      const a = line[idx[q]!]!, b = line[idx[q + 1]!]!, dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((X - a.x) * dx + (Y - a.y) * dy) / l2)) : 0;
      const px = X - (a.x + dx * t), py = Y - (a.y + dy * t), d2 = px * px + py * py;
      if (d2 < best) { best = d2; const sa = geom.s[idx[q]!]!, sb = geom.s[idx[q + 1]!]!; bs = sa + (sb - sa) * t; const l = Math.sqrt(l2) || 1; bd = ((X - a.x) * -dy + (Y - a.y) * dx) / l; }
    }
    along[k] = bs; across[k] = bd * 2;
  }
  // 5. the rolls and the cross tilt (blurred once each way: a tight bend's inside, where the nearest stretch of line jumps, stays smooth)
  const rollK = rollKnots(seed, L), crossK = crossKnots(seed, L), rs = rng(seed);
  const skew = (rs() * 2 - 1) * P.skew, D = new Float32Array(S);
  for (let k = 0; k < S; k++) {
    if (!wt[k]) continue;
    const s = along[k]!, d = across[k]!, e = 1 - (1 - P.rollRough) * smooth((dPlay[k]! - 1) / 3);
    D[k] = (knotAt(rollK, s + skew * d) + knotAt(crossK, s) * P.cross.satM * Math.tanh(d / P.cross.satM)) * e;
  }
  blur121(D, W, H);
  // 6. the mounds and hollows: beside the fairway (alternating sides, now and then skipped), round the back and sides of the green, a swale
  // beside the green and one beside each bunker in reach
  const feats: HoleGroundFeature[] = [];
  const nearAt = (sM: number) => {
    let lo = 0, hi = geom.s.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (geom.s[m]! < sM) lo = m + 1; else hi = m; }
    return { x: line[lo]!.x, y: line[lo]!.y, nx: geom.nx[lo]!, ny: geom.ny[lo]! };
  };
  const gR = geom.greenR, M = P.mound;
  let side = rs() < 0.5 ? -1 : 1;
  for (let sM = Math.max(plan.fwStart + 15, 45) + rs() * 20; sM < L - gR - 20; sM += M.gapMinM + (M.gapMaxM - M.gapMinM) * rs()) {
    if (rs() > 0.15) {
      const h = M.minM + (M.maxM - M.minM) * rs() ** 1.5, R = 5 + 3.5 * h;
      const hw = Math.max(9, widthAt(plan, sM, geom) / 2 + 3), cr = Math.max(30, hw + 2), off = Math.min(hw + 3 + 0.5 * R, cr - 0.2 * R);
      const q = nearAt(sM);
      feats.push({ kind: 'mound', x: q.x + (side * q.nx * off) / 2, y: q.y + (side * q.ny * off) / 2, h, r: R / 2 });
    }
    if (rs() < 0.65) side = -side;
  }
  // round the green: the approach comes in along (ax, ay); a swale on one side, 2 to 4 mounds round the back and sides away from it
  const back = nearAt(Math.max(0, L - gR - 20)), gx = plan.green.x, gy = plan.green.y;
  let ax = gx - back.x, ay = gy - back.y; const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
  const dirAt = (deg: number) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return { x: -ax * c + ay * s, y: -ay * c - ax * s }; }; // 0: the front
  const hollowDeg = (rs() < 0.5 ? 1 : -1) * (80 + 30 * rs());
  {
    const depth = P.hollow.minM + (P.hollow.maxM - P.hollow.minM) * rs(), R = 8 + 2 * rs(), dist = gR + 9 + 0.3 * R, u = dirAt(hollowDeg);
    feats.push({ kind: 'hollow', x: gx + (u.x * dist) / 2, y: gy + (u.y * dist) / 2, h: -depth, r: R / 2 });
  }
  const cnt = 2 + Math.floor(rs() * 3);
  for (let m = 0; m < cnt; m++) {
    const deg = 60 + (240 * (m + 0.5 + 0.6 * (rs() - 0.5))) / cnt, h = M.minM + 0.7 * rs(), R = 5 + 3 * h;
    const gap = Math.abs(((((deg - hollowDeg) % 360) + 540) % 360) - 180); // degrees between it and the swale (0..180)
    if (gap < 45) continue;
    const u = dirAt(deg), dist = gR + 14 + 0.3 * R;
    feats.push({ kind: 'mound', x: gx + (u.x * dist) / 2, y: gy + (u.y * dist) / 2, h, r: R / 2 });
  }
  // beside each bunker in reach (at most 4), away from the line of play, past T253's lips and mounds round the sand
  {
    const seen = new Uint8Array(S); let made = 0;
    for (let k0 = 0; k0 < S && made < 4; k0++) {
      if (!bunk[k0] || seen[k0] || !wt[k0]) continue;
      const stack = [k0]; seen[k0] = 1; let sx = 0, sy = 0, c = 0, sA = 0, sD = 0;
      while (stack.length) {
        const k = stack.pop()!, i = k % W, j = (k - i) / W;
        sx += i0 + i + 0.5; sy += j0 + j + 0.5; sA += along[k]!; sD += across[k]!; c++;
        for (const nk of [k - 1, k + 1, k - W, k + W]) { if (nk < 0 || nk >= S || seen[nk] || !bunk[nk] || !wt[nk] || (nk === k - 1 && i === 0) || (nk === k + 1 && i === W - 1)) continue; seen[nk] = 1; stack.push(nk); }
      }
      const bx = (sx / c) * CH_STEP, by = (sy / c) * CH_STEP, rB = Math.sqrt((c * COURSE_CELL_M2) / Math.PI), q = nearAt(sA / c), sgn = sD / c >= 0 ? 1 : -1;
      const depth = 0.3 + 0.2 * rs(), R = 7 + 2 * rs(), dist = rB + 7 + 0.4 * R;
      feats.push({ kind: 'hollow', x: bx + (sgn * q.nx * dist) / 2, y: by + (sgn * q.ny * dist) / 2, h: -depth, r: R / 2 });
      made++;
    }
  }
  for (const f of feats) {
    const fi0 = Math.max(0, Math.floor((f.x - f.r) / CH_STEP) - i0), fi1 = Math.min(W - 1, Math.ceil((f.x + f.r) / CH_STEP) - i0);
    const fj0 = Math.max(0, Math.floor((f.y - f.r) / CH_STEP) - j0), fj1 = Math.min(H - 1, Math.ceil((f.y + f.r) / CH_STEP) - j0);
    for (let j = fj0; j <= fj1; j++) for (let i = fi0; i <= fi1; i++) {
      const k = j * W + i; if (!wt[k]) continue;
      const t = Math.hypot((i0 + i + 0.5) * CH_STEP - f.x, (j0 + j + 0.5) * CH_STEP - f.y) / f.r; if (t >= 1) continue;
      // off the playing surfaces, and clear of the sand (a mound 1.5 samples out, a hollow 1)
      const mask = smooth(dPlay[k]! / 1.5) * smooth((dBunk[k]! - (f.kind === 'mound' ? 1.5 : 1)) / 1.5);
      D[k] += f.h * (1 - t * t) ** 2 * mask;
    }
  }
  // 7. the tee's level and the green's plane, each held over its cells and a margin, at the weakest weight over that hold (so it stays level
  // or one plane even where the ground round it is kept)
  const T = P.tee, G = P.green;
  let teeSum = 0, teeN = 0, teeW = 1, gSum = 0, gN = 0, gW = 1;
  for (let k = 0; k < S; k++) {
    const fk = (j0 + Math.floor(k / W)) * CH_SIZE + i0 + (k % W);
    if (dTee[k]! <= T.hold) { teeSum += fd[fk]!; teeN++; teeW = Math.min(teeW, wt[k]!); }
    if (dGreen[k]! <= G.hold) { gSum += fd[fk]!; gN++; gW = Math.min(gW, wt[k]!); }
  }
  // the green's plane: u, metres along the approach from the pin (front < 0), runs over the hold's span; its front edge sits on the approach's
  // roll there (lifted a little) and it rises tilt a metre to the back; past the hold (the blend) it is held at the span's ends
  let uMin = Infinity, uMax = -Infinity;
  for (let k = 0; k < S; k++) if (dGreen[k]! <= G.hold) { const u = (((i0 + (k % W) + 0.5) * CH_STEP - gx) * ax + ((j0 + Math.floor(k / W) + 0.5) * CH_STEP - gy) * ay) * 2; if (u < uMin) uMin = u; if (u > uMax) uMax = u; }
  const teeM = teeN ? teeSum / teeN : 0, tilt = G.tiltMin + (G.tiltMax - G.tiltMin) * rs(), lift = G.liftMin + (G.liftMax - G.liftMin) * rs();
  const gFront = (gN ? gSum / gN : 0) + knotAt(rollK, L + (gN ? uMin : -geom.greenR)) + lift;
  const plane = (X: number, Y: number) => gFront + tilt * (Math.max(uMin, Math.min(uMax, ((X - gx) * ax + (Y - gy) * ay) * 2)) - uMin);
  const raise = gN ? plane(gx, gy) - (gSum / gN) : 0;
  // 8. the new heights: new = old + w (target - old), the tee and green holds as above
  const ks: number[] = [], before: number[] = [], after: number[] = [];
  let cut = 0, fill = 0, bi0 = Infinity, bj0 = Infinity, bi1 = -Infinity, bj1 = -Infinity;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, zt0 = dTee[k]! <= T.hold ? 1 : 1 - smooth((dTee[k]! - T.hold) / T.blend), zg0 = dGreen[k]! <= G.hold ? 1 : 1 - smooth((dGreen[k]! - G.hold) / G.blend);
    if (!wt[k] && zt0 < 1 && zg0 < 1) continue;
    const X = (i0 + i + 0.5) * CH_STEP, Y = (j0 + j + 0.5) * CH_STEP, fk = (j0 + j) * CH_SIZE + i0 + i, old = fd[fk]!;
    let nh: number;
    if (zt0 >= 1) nh = old + teeW * (teeM - old);
    else if (zg0 >= 1) nh = old + gW * (plane(X, Y) - old);
    else {
      let zt = zt0, zg = zg0; const z = zt + zg; if (z > 1) { zt /= z; zg /= z; }
      const target = old + D[k]! * (1 - zt - zg) + zt * (teeM - old) + zg * (plane(X, Y) - old);
      nh = old + wt[k]! * (target - old);
    }
    nh = Math.fround(clampCourseHeightM(nh));
    if (Math.abs(nh - old) < P.minDh) continue;
    ks.push(fk); before.push(old); after.push(nh);
    if (nh > old) fill += (nh - old) * COURSE_CELL_M2; else cut += (old - nh) * COURSE_CELL_M2;
    const gi = i0 + i, gj = j0 + j;
    if (gi < bi0) bi0 = gi; if (gi > bi1) bi1 = gi; if (gj < bj0) bj0 = gj; if (gj > bj1) bj1 = gj;
  }
  return {
    k: Int32Array.from(ks), before: Float32Array.from(before), after: Float32Array.from(after),
    box: ks.length ? [bi0 * CH_STEP, bj0 * CH_STEP, (bi1 + 1) * CH_STEP, (bj1 + 1) * CH_STEP] : null,
    cut, fill, m3: Math.max(cut, fill), features: feats, tilt, raise, teeM,
  };
}

/** writes a shaping's heights into the field (rev++; touch its box in the undo journal first) and returns its box, or null when it changes
 *  nothing */
export function applyHoleGround(field: CourseHeightField, shape: HoleGroundShape): CourseTileBox | null {
  if (!shape.k.length) return null;
  for (let q = 0; q < shape.k.length; q++) field.data[shape.k[q]!] = shape.after[q]!;
  field.rev++;
  return shape.box;
}

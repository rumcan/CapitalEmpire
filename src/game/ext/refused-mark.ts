// Refused cells and footprints, not by colour alone (T180, P23-UX D8.1; P23 4.9): a 45° hatch at a fixed screen pitch and a small ✕ badge, the
// same size at every zoom. Shared by the brush's footprint (course-cursor), New hole's left-out cells (hole-wizard/draw) and the blocked
// footprints of the build ghosts (ghost-preview; the clubhouse and the Props ghost in the engine). Device px in; the callers set the clip.

/** the hatch's stripe pitch, the badge's radius and its ✕'s half arm (css px) */
export const HATCH_PITCH = 4.5, CROSS_R = 6.5, CROSS_ARM = 2.5;
/** the badge's red, its light ring and the ✕'s white */
export const CROSS_RED = '#cf3f33', CROSS_RING = 'rgba(255,246,240,0.95)', CROSS_INK = '#ffffff';
/** the hatch's light red (it reads on the red tint and on the dark ground) */
export const HATCH_LIGHT = 'rgba(255,196,180,0.85)';

/** the canvas calls the marks need (a CanvasRenderingContext2D, or a test double) */
export interface MarkCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap?: CanvasLineCap;
  globalAlpha?: number;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  fill(): void;
  stroke(): void;
}

/** the hatch's lines across the device px box (x0, y0)-(x1, y1): x - y = k on a fixed lattice of pitch p (they never crawl as the box moves),
 *  as flat [ax, ay, bx, by, ...] */
export function hatchLines(x0: number, y0: number, x1: number, y1: number, p: number): number[] {
  const out: number[] = [];
  if (!(x1 > x0 && y1 > y0 && p > 0)) return out;
  for (let k = Math.floor((x0 - y1) / p) * p; k <= x1 - y0; k += p) out.push(k + y0, y0, k + y1, y1);
  return out;
}

/** strokes the hatch over the device px box (the caller clipped to the refused shape) at dpr d */
export function strokeHatch(ctx: MarkCtx, x0: number, y0: number, x1: number, y1: number, d: number, col = HATCH_LIGHT, alpha = 0.7): void {
  const L = hatchLines(x0, y0, x1, y1, HATCH_PITCH * d); if (!L.length) return;
  ctx.beginPath();
  for (let i = 0; i < L.length; i += 4) { ctx.moveTo(L[i]!, L[i + 1]!); ctx.lineTo(L[i + 2]!, L[i + 3]!); }
  const a = ctx.globalAlpha;
  ctx.strokeStyle = col; ctx.lineWidth = d; if (a !== undefined) ctx.globalAlpha = alpha; ctx.stroke(); if (a !== undefined) ctx.globalAlpha = a;
}

/** the ✕ badge centred on (X, Y) device px at dpr d: a red disc with a light ring, a white ✕ */
export function drawRefusedCross(ctx: MarkCtx, X: number, Y: number, d: number): void {
  const a = CROSS_ARM * d, cap = ctx.lineCap;
  if (ctx.globalAlpha !== undefined) ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(X, Y, CROSS_R * d, 0, Math.PI * 2);
  ctx.fillStyle = CROSS_RED; ctx.fill(); ctx.strokeStyle = CROSS_RING; ctx.lineWidth = 1.3 * d; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X - a, Y - a); ctx.lineTo(X + a, Y + a); ctx.moveTo(X + a, Y - a); ctx.lineTo(X - a, Y + a);
  if (cap !== undefined) ctx.lineCap = 'round';
  ctx.strokeStyle = CROSS_INK; ctx.lineWidth = 1.7 * d; ctx.stroke();
  if (cap !== undefined) ctx.lineCap = cap;
}

/** a flat polygon's [x0, y0, x1, y1, ...] centre: its area centroid (the vertex mean when it has no area) */
export function polyCentre(pts: readonly number[]): { x: number; y: number } {
  const n = pts.length >> 1;
  let A = 0, cx = 0, cy = 0, mx = 0, my = 0;
  for (let i = 0; i < n; i++) {
    const x0 = pts[2 * i]!, y0 = pts[2 * i + 1]!, j = (i + 1) % n, x1 = pts[2 * j]!, y1 = pts[2 * j + 1]!, c = x0 * y1 - x1 * y0;
    A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c; mx += x0; my += y0;
  }
  if (Math.abs(A) < 1e-9) return n ? { x: mx / n, y: my / n } : { x: 0, y: 0 };
  return { x: cx / (3 * A), y: cy / (3 * A) };
}

/** a patch of refused cells: its size (cells) and the cell centre its ✕ sits on (grid cells, + 0.5) */
export interface RefusedPatch { n: number; cx: number; cy: number }
/** New hole's left-out cells as patches (4-connected), biggest first, at most max of them with at least minCells cells: each patch's ✕ sits
 *  on its cell nearest the patch's centroid (so a bent patch keeps its ✕ on a refused cell). runs: flat (cy, a, b, s) row runs sorted by
 *  row then column; label: the s the patches are made of */
export function refusedPatches(runs: ArrayLike<number>, label: number, max = 6, minCells = 4): RefusedPatch[] {
  const rows: number[] = [], A: number[] = [], B: number[] = [];
  for (let k = 0; k + 3 < runs.length; k += 4) if (runs[k + 3] === label) { rows.push(runs[k]!); A.push(runs[k + 1]!); B.push(runs[k + 2]!); }
  const m = rows.length; if (!m) return [];
  const up = new Int32Array(m); for (let i = 0; i < m; i++) up[i] = i;
  const find = (i: number): number => { while (up[i] !== i) { up[i] = up[up[i]!]!; i = up[i]!; } return i; };
  // runs of the row above that overlap (4-connected): a sliding window over the sorted runs
  let p0 = 0;
  for (let i = 0; i < m; i++) {
    const r = rows[i]!;
    while (p0 < i && rows[p0]! < r - 1) p0++;
    for (let j = p0; j < i && rows[j]! === r - 1; j++) if (A[j]! <= B[i]! && B[j]! >= A[i]!) { const a = find(i), b = find(j); if (a !== b) up[a] = b; }
  }
  const acc = new Map<number, { n: number; sx: number; sy: number; runs: number[] }>();
  for (let i = 0; i < m; i++) {
    const root = find(i), len = B[i]! - A[i]! + 1;
    let e = acc.get(root); if (!e) acc.set(root, (e = { n: 0, sx: 0, sy: 0, runs: [] }));
    e.n += len; e.sx += len * ((A[i]! + B[i]!) / 2 + 0.5); e.sy += len * (rows[i]! + 0.5); e.runs.push(i);
  }
  const out: RefusedPatch[] = [];
  for (const e of acc.values()) {
    if (e.n < minCells) continue;
    const gx = e.sx / e.n, gy = e.sy / e.n;
    let best = Infinity, bx = gx, by = gy;
    for (const i of e.runs) {
      const x = Math.min(B[i]! + 0.5, Math.max(A[i]! + 0.5, Math.floor(gx) + 0.5)), y = rows[i]! + 0.5, dd = (x - gx) ** 2 + (y - gy) ** 2;
      if (dd < best) { best = dd; bx = x; by = y; }
    }
    out.push({ n: e.n, cx: bx, cy: by });
  }
  out.sort((a, b) => b.n - a.n || a.cy - b.cy || a.cx - b.cx);
  return out.slice(0, max);
}

// T402 (#1080): the farm's paddock fence on the map's axes, and its runs. The library's fence art is drawn for the map's x and y axes only (the
// chain-link panel and its gate come as an X piece and a Y piece), so a run of them can only run along x or y. The owner's farm on a road that
// lies 45 degrees to the grid had its paddock laid in the parcel's own frame, and a side that runs across the grid took an X piece or a Y piece by
// the luck of rounding and spaced the pieces along the diagonal: gaps between the panels, panels stacked like boards facing the camera, corners that
// do not join. So the fence is built on the axes: the largest rectangle on the map's axes that fits inside the pasture (the pasture itself when the
// parcel lies on the axes), four straight runs of panels end to end, a gate on the side that faces the lane. Pure TS, no DOM, no library.
import type { Pt } from '../../network';

/** The largest rectangle that fits inside another turned by an angle (c = |cos|, s = |sin| of it): the inner's half extents p along its first axis and
 *  q along its second, inside the outer's half extents P along its first and Q along its second. The corners of the inner, in the outer's frame, reach
 *  c p + s q along the outer's first axis and s p + c q along its second: maximise p q under those two limits (the optimum is on one limit's own
 *  best, or at the corner where both meet). The same rule serves both ways: a map-axes rectangle in a parcel-frame field, and a parcel-frame
 *  rectangle in a map-axes fence */
export function inscribed(P: number, Q: number, c: number, s: number): { p: number; q: number } {
  c = Math.abs(c); s = Math.abs(s);
  const ok = (p: number, q: number) => p >= -1e-9 && q >= -1e-9 && c * p + s * q <= P + 1e-9 && s * p + c * q <= Q + 1e-9;
  const cands: [number, number][] = [];
  // (on the axes: the whole outer)
  if (s < 1e-9) return { p: P / Math.max(c, 1e-9), q: Q / Math.max(c, 1e-9) };
  if (c < 1e-9) return { p: Q / s, q: P / s };
  cands.push([P / (2 * c), P / (2 * s)], [Q / (2 * s), Q / (2 * c)]);
  const det = c * c - s * s;
  if (Math.abs(det) > 1e-9) cands.push([(P * c - Q * s) / det, (Q * c - P * s) / det]);
  let best = { p: 0, q: 0 };
  for (const [p, q] of cands) if (ok(p, q) && p * q > best.p * best.q) best = { p, q };
  return best;
}

/** a parcel frame: its origin and axes (world tiles) */
export interface Frame { o: Pt; u: Pt; n: Pt }
/** a field of a parcel in its frame (a along u, b along n, tiles) */
export interface Rect { a0: number; b0: number; a1: number; b1: number }
/** the world point of a parcel-frame point */
export const worldOf = (f: Frame, a: number, b: number): Pt => ({ x: f.o.x + f.u.x * a + f.n.x * b, y: f.o.y + f.u.y * a + f.n.y * b });

/** The paddock of a field: its fence's rectangle on the map's axes (x0, y0, x1, y1, world tiles) and the parcel-frame rectangle the animals graze in
 *  (inside the fence). On a parcel that lies on the axes both are the field itself (nothing changes there); on a turned one the fence is the largest
 *  axes rectangle inside the field, about its middle, and the grazing rectangle the largest parcel-frame rectangle inside the fence. */
export function paddockOf(f: Frame, q: Rect): { fence: [number, number, number, number]; field: Rect } {
  const A = (q.a1 - q.a0) / 2, B = (q.b1 - q.b0) / 2, ac = (q.a0 + q.a1) / 2, bc = (q.b0 + q.b1) / 2, c = worldOf(f, ac, bc);
  const cu = Math.abs(f.u.x), su = Math.abs(f.u.y);
  // on the axes (within a hair): the field is the fence's rectangle; its corners in world order
  if (su < 1e-6 || cu < 1e-6) {
    const w = worldOf(f, q.a0, q.b0), v = worldOf(f, q.a1, q.b1);
    return { fence: [Math.min(w.x, v.x), Math.min(w.y, v.y), Math.max(w.x, v.x), Math.max(w.y, v.y)], field: { ...q } };
  }
  const { p: X, q: Y } = inscribed(A, B, cu, su);
  // the parcel-frame rectangle inside that fence: the same rule the other way round (outer: the fence's half extents, inner: the field's, turned by the same angle)
  const { p: a, q: b } = inscribed(X, Y, cu, su);
  return { fence: [c.x - X, c.y - Y, c.x + X, c.y + Y], field: { a0: ac - a, b0: bc - b, a1: ac + a, b1: bc + b } };
}

/** one piece of a run: where it lies along the run (tiles from its start) and whether it is the gate */
export interface RunPiece { t0: number; t1: number; gate: boolean }
/** The pieces of a straight run of length L: panels of base length `panel` end to end, with a gate of base length `gate` at its middle when gate is
 *  given. The count is the nearest whole number of panels (an even number with a gate, so the gate stands in the middle) and the run's own scale
 *  makes them fit exactly: every piece meets the next, the first starts at 0 and the last ends at L (no gaps, no overlaps). scale: the factor on the
 *  base lengths (1 when the panels fit as they are) */
export function runPieces(L: number, panel: number, gate?: number): { pieces: RunPiece[]; scale: number } {
  if (!(L > 0) || !(panel > 0)) return { pieces: [], scale: 1 };
  const g = gate && gate > 0 ? gate : 0;
  let n = Math.max(g ? 2 : 1, Math.round((L - g) / panel)); if (g && n % 2) n += (L - g) / panel >= n ? 1 : -1; n = Math.max(g ? 2 : 1, n);
  const scale = L / (n * panel + g), P = panel * scale, G = g * scale, pieces: RunPiece[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    if (g && i === n / 2) { pieces.push({ t0: t, t1: t + G, gate: true }); t += G; }
    pieces.push({ t0: t, t1: t + P, gate: false }); t += P;
  }
  return { pieces, scale };
}

/** which side of a map-axes rectangle faces a target point (from its middle, by the larger share of the half extents): 'x1' east, 'x0' west, 'y1' south, 'y0' north */
export type Side = 'x0' | 'x1' | 'y0' | 'y1';
export function facingSide(r: readonly [number, number, number, number], target: Pt): Side {
  const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2, hx = Math.max(1e-6, (r[2] - r[0]) / 2), hy = Math.max(1e-6, (r[3] - r[1]) / 2), dx = (target.x - cx) / hx, dy = (target.y - cy) / hy;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'x1' : 'x0') : (dy >= 0 ? 'y1' : 'y0');
}

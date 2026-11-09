// T351 (#994, the owner, 2026-11-08: "why does the golf cart not look natural when driving?"): how a cart turns and how it pulls away and stops. Pure math, no DOM, shared by the
// field's carts (carts.ts: the route is known, so the heading blends round each bend before and after the vertex and the pace eases in and out) and your own cart
// (golf/cartdrive.ts: the heading steers toward where you point it).
// Angles are tile-space radians, atan2(hy, hx) of a heading: the way the cars' eight headings are counted (ext/car-art carHeading: 0 is +x, the screen's lower right).

export const TAU = Math.PI * 2;
/** an angle held to (-pi, pi] */
export const wrapPi = (a: number): number => a - TAU * Math.round(a / TAU);
/** the heading of a tile direction */
export const headingOf = (dx: number, dy: number): number => Math.atan2(dy, dx);
/** cur turned toward want by at most `step` radians, the shorter way round (a turn of exactly half a circle goes the way the sign of the difference says, then keeps on: the
 *  remainder is under half a circle from the next step on) */
export function turnToward(cur: number, want: number, step: number): number {
  const d = wrapPi(want - cur);
  return Math.abs(d) <= step ? wrapPi(want) : wrapPi(cur + (d > 0 ? step : -step));
}
/** 0 to 1 as t goes 0 to 1, with no speed at either end (the turn's blend) */
export const smoothstep = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** the metres of route a cart's turn is blended over (it is driving about 5 tiles a real second at the watching speed, where the round is watched: about 0.3 s of that
 *  time; a bend is a few frames, never a jump across the eight pictures), and the metres it takes to pull away to its pace and to stop (about half a second there) */
export const TURN_M = 3, RAMP_M = 3;

/** a route's headings: the cart drives it in runs of road, each with its own heading (`ang[k]`, from distance `at[k]` to `at[k + 1]`; `at[0]` is 0 and the last is the route's
 *  length). A segment shorter than `minLen` (a stop on a path starts the route with a sliver of one; the walk's own simplifying leaves others) has no heading of its own: it joins the
 *  run before it (the run after it, at the route's start), so a bend never turns the cart over a few centimetres. `at` holds each run's start, `of[j]` the run of segment j */
export interface RouteHeadings { ang: number[]; at: number[]; of: number[] }
export function routeHeadings(pts: readonly { x: number; y: number }[], cum: readonly number[], minLen = 0.5): RouteHeadings {
  const n = Math.max(0, pts.length - 1), a: number[] = new Array(n), keep: boolean[] = new Array(n), len = (j: number) => Math.hypot(pts[j + 1]!.x - pts[j]!.x, pts[j + 1]!.y - pts[j]!.y);
  for (let j = 0; j < n; j++) { keep[j] = len(j) >= minLen; a[j] = len(j) > 1e-9 ? Math.atan2(pts[j + 1]!.y - pts[j]!.y, pts[j + 1]!.x - pts[j]!.x) : 0; }
  if (n && !keep.some(Boolean)) { let best = 0; for (let j = 1; j < n; j++) if (len(j) > len(best)) best = j; keep[best] = true; } // (a route of slivers: the longest is its heading)
  const first = keep.indexOf(true), ang: number[] = [], at: number[] = [], of: number[] = new Array(n);
  for (let j = 0; j < n; j++) {
    if (j === 0 || (keep[j] && j > first)) { ang.push(NaN); at.push(cum[j]!); }
    of[j] = ang.length - 1; if (keep[j] && Number.isNaN(ang[of[j]!]!)) ang[of[j]!] = a[j]!;
  }
  at.push(n ? cum[n]! : 0);
  return { ang, at, of };
}

/** a cart's heading at distance d along a route whose runs are `r` (routeHeadings), d in run k: the run's heading, blended round each bend over `blend` of route centred on the bend
 *  (never longer than half of either run, so no two blends meet), by smoothstep through the shorter way round. `from`: the heading the cart was parked with (null: none), blended into
 *  the route's first run over the first `blend` of it. No blend at the end of the route: the cart stops on its last heading */
export function routeHeading(r: RouteHeadings, k: number, d: number, blend: number, from: number | null = null): number {
  const { ang, at } = r, n = ang.length, a = ang[k]!, d0 = d - at[k]!, len = at[k + 1]! - at[k]!;
  if (k > 0) {
    const h = Math.min(blend / 2, len / 2, (at[k]! - at[k - 1]!) / 2);
    if (h > 0 && d0 < h) { const p = ang[k - 1]!; return wrapPi(p + wrapPi(a - p) * smoothstep((d0 + h) / (2 * h))); }
  } else if (from !== null) {
    const w = Math.min(blend, len / 2);
    if (w > 0 && d0 < w) return wrapPi(from + wrapPi(a - from) * smoothstep(d0 / w));
  }
  if (k < n - 1) {
    const h = Math.min(blend / 2, len / 2, (at[k + 2]! - at[k + 1]!) / 2);
    if (h > 0 && len - d0 < h) { const q = ang[k + 1]!; return wrapPi(a + wrapPi(q - a) * smoothstep((d0 - (len - h)) / (2 * h))); }
  }
  return a;
}

/** the share of a drive (0..1) covered at `u` of its time (0..1) when the cart speeds up over the first `ramp` of the way and slows down over the last (`ramp` up to 1/2: no
 *  cruise at all): constant acceleration then constant braking, the speed rising to 1 + 2 x ramp times the drive's mean and holding there. The whole drive takes the same
 *  time (the minutes of the round, which the shots fix, are unchanged), the cart pulls away from a standstill and comes to rest. ramp 0: a steady pace as before */
export function easedShare(u: number, ramp: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (!(ramp > 1e-9)) return u;
  const r = Math.min(0.5, ramp), v = 1 + 2 * r, tA = (2 * r) / v;
  if (u < tA) return (v * v * u * u) / (4 * r);
  if (u > 1 - tA) return 1 - (v * v * (1 - u) * (1 - u)) / (4 * r);
  return r + v * (u - tA);
}

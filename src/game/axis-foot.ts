// The footprint of a straight-on (screen-axis) view (T315, #900): a building on a screen-straight street stands on a rectangle whose walls run
// along the screen axes (its front W tiles wide along the screen's x, its depth D tiles along its y, foreshortened to half), or, for a picture
// rendered turned a few degrees toward the sun (the owner, 2026-11-03: "it needs a slight turn of 5 to 10 degrees ... we also have to account for
// that in the lots"), that rectangle turned by its yaw. The lots keep the square footprint (the library's boxes, square to the street); only the
// picture and the shadow follow the turn. The anchor is the footprint's centre (prep-axis-views.mjs).
// Pure over the library: the shadow draft (its ground line, back edge and contact shape) and the tests read it.
import { LIBRARY } from './library';
import type { LibItem } from './types';
import { AXIS_FOOT, AXIS_HEADING, AXIS_SETS } from './axis-library';

/** display px a tile along a screen axis (a tile's diagonal, 128 px over sqrt 2); the ground's depth is half that a tile */
export const AXIS_K = 128 / Math.SQRT2;
/** a straight-on view's footprint: its front's width and its depth (tiles, at scale 1) and its yaw (degrees; negative: the right-hand wall shows) */
export interface AxisFoot { w: number; d: number; yaw: number }

const BY = new Map<string, LibItem>(LIBRARY.map(i => [i.id, i]));
const SET_OF = new Map<string, readonly [string, string, string, string]>(Object.values(AXIS_SETS).flatMap(s => s.map(v => [v, s] as const)));
/** half the ground depth a dead-square view shows below its anchor: the anchor sits half the depth above the picture's lowest row */
const halfDepth = (id: string): number | null => { const it = BY.get(id); if (!it) return null; const hd = it.quad[3] - it.ay; return hd > 0 ? hd : null; };
const mean = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

/** the footprint of a straight-on view (null: not one). Packed with T315's AXIS_FOOT: as packed. Before: dead square, read from its set's anchors
 *  (a view's depth is its own and its opposite view's half depth, its front the two side views' depth) */
export function axisFoot(id: string): AxisFoot | null {
  if (!AXIS_HEADING[id]) return null;
  const f = AXIS_FOOT[id]; if (f) return { w: f[0], d: f[1], yaw: f[2] };
  const set = SET_OF.get(id), it = BY.get(id); if (!set || !it) return null;
  const i = set.indexOf(id), at = (k: number) => halfDepth(set[(i + k) % 4]!);
  const d = mean([at(0), at(2)]), w = mean([at(1), at(3)]);
  if (d === null) return null;
  // (no side views: the front from the boxes, the world box round the rectangle being (W + D) / sqrt 2 a side)
  const D = 4 * d / AXIS_K, W = w !== null ? 4 * w / AXIS_K : Math.max(0.5, (it.boxes[0]?.hx ?? 0) * Math.SQRT2 - D);
  return { w: W, d: D, yaw: 0 };
}

/** a footprint's corner on screen: (u, v) tiles from its centre, u along the front (right), v away from the street (the back); display px about the
 *  anchor, x right and y down. Its yaw turns it on the ground (negative: its right-hand end comes forward, so its right-hand wall shows) */
export function axisFootPoint(f: AxisFoot, u: number, v: number): [number, number] {
  const t = -f.yaw * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const p = u * c + v * s, q = -u * s + v * c;
  return [AXIS_K * p, -AXIS_K / 2 * q];
}
/** the footprint's ring on screen [x, y, x, y, ...] (display px about the anchor at scale 1): front left, front right, back right, back left */
export function axisFootRing(f: AxisFoot): number[] {
  const a = f.w / 2, b = f.d / 2;
  return [[-a, -b], [a, -b], [a, b], [-a, b]].flatMap(([u, v]) => axisFootPoint(f, u!, v!));
}

// The road tool's routing between two route points (#1276; the owner, 2026-11-14: "make 45 degree bends the default ... always"), for every road it
// draws (town roads, and the path tool's cart paths and drives): the legs from the route's last point to the one clicked, or dragged to. Pure
// (no DOM, no engine): the engine's legsTo asks routeLegs, the preview, a click and a drag's release all use it, so what the ghost shows is what is built.

import type { Leg, Pt } from './network';
import type { BendMode } from './types';

/** the bend every road and path class starts with, in every build, in a new game and after every load or reload: 45 degrees. It is not saved anywhere,
 *  so a Q toggled to 90 in one visit never comes back as the next visit's start (the owner: "always") */
export const DEFAULT_BEND: BendMode = 45;

/** two route points this near (tiles) are one point: a 45 degree bend whose corner lands on the end, give or take the float's last digits, is a straight run */
const SAME = 1e-6;

/** the legs from `from` to `p`, on the 0, 45 and 90 degree lattice:
 *  - straight (Shift): one leg in any of the eight directions: along the axis the pointer is near (within 2.4 to 1), else on the 45 degree diagonal;
 *  - the pointer on an axis or a diagonal of `from`: one straight leg, whatever the bend;
 *  - bend 45 (the default): a diagonal run at 45 degrees (as long as the shorter side), then a straight run along the axis to `p`: one 45 degree bend;
 *  - bend 90: an axis run along the longer side, then the other, a right angle.
 *  step: the grid the points snap to (the town's tile, or the course's half tile), which the straight run's diagonal keeps to. An empty list when
 *  `p` is `from`. */
export function routeLegs(from: Pt, p: Pt, bend: BendMode, straight = false, step = 1): Leg[] {
  const dx = p.x - from.x, dy = p.y - from.y, ax = Math.abs(dx), ay = Math.abs(dy);
  if (!ax && !ay) return [];
  if (straight) {
    const k = Math.round((ax + ay) / 2 / step) * step;
    if (ax >= 2.4 * ay || ay >= 2.4 * ax) return [{ a: from, b: ax >= ay ? { x: p.x, y: from.y } : { x: from.x, y: p.y } }];
    if (!k) return []; // (off the grid, a pointer under half a step from `from` made a diagonal of no length: no run)
    return [{ a: from, b: { x: from.x + Math.sign(dx) * k, y: from.y + Math.sign(dy) * k } }];
  }
  if (!ax || !ay) return [{ a: from, b: p }];
  if (bend === 45) {
    const k = Math.min(ax, ay), corner = { x: from.x + Math.sign(dx) * k, y: from.y + Math.sign(dy) * k };
    if (Math.abs(corner.x - p.x) < SAME && Math.abs(corner.y - p.y) < SAME) return [{ a: from, b: p }];
    return [{ a: from, b: corner }, { a: corner, b: p }];
  }
  const corner = ax >= ay ? { x: p.x, y: from.y } : { x: from.x, y: p.y };
  return [{ a: from, b: corner }, { a: corner, b: p }];
}

/** the length (tiles) of legs */
export const legsLength = (legs: readonly Leg[]): number => legs.reduce((s, l) => s + Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y), 0);

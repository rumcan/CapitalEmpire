// The road tool's routing between two route points (#1276; the owner, 2026-11-14: "make 45 degree bends the default ... always", then #1317: "remove the 45 degree
// angle for now": BEND_45 below is off), for every road it draws (town roads, and the path tool's cart paths and drives): the legs from the route's last point to
// the one clicked, or dragged to. Pure (no DOM, no engine): the engine's legsTo asks routeLegs, the preview, a click and a drag's release all use it, so what the
// ghost shows is what is built.

import type { Leg, Pt } from './network';
import type { BendMode } from './types';

/** The 45 degree bend is OFF for now (the owner, 2026-11-14, #1317: "remove the 45 degree angle for now"; #1276 had made it the default). Off, every road and path
 *  bends at right angles (90): the Q key does nothing, the Fine tuning panel has no Bends chips, and no hint, panel, Help or Keys sheet line speaks of 45 degrees. The
 *  code stays behind this one constant: true brings it all back (45 the default in every build and after every load, Q toggling 90 for the visit, the chips, the words).
 *  The press, drag and release (route-input.ts RouteGesture) is not behind it. */
export const BEND_45: boolean = false;

/** the bend every road and path class starts with, in every build, in a new game and after every load or reload: 90 degrees while BEND_45 is off, else 45 (the owner,
 *  #1276: "always"). It is not saved anywhere, so a Q toggled to 90 in one visit never comes back as the next visit's start */
export const DEFAULT_BEND: BendMode = BEND_45 ? 45 : 90;

/** the bend the road tool's legs are made with: the mode in hand while the 45 degree bend is on (`on`: BEND_45), else always the right angle, so a 45 set by a script,
 *  the stress test or an old call changes nothing while it is off */
export const bendInUse = (b: BendMode, on: boolean = BEND_45): BendMode => (on ? b : 90);

/** two route points this near (tiles) are one point: a 45 degree bend whose corner lands on the end, give or take the float's last digits, is a straight run */
const SAME = 1e-6;

/** the legs from `from` to `p`, on the 0, 45 and 90 degree lattice:
 *  - straight (Shift): one leg in any of the eight directions: along the axis the pointer is near (within 2.4 to 1), else on the 45 degree diagonal;
 *  - the pointer on an axis or a diagonal of `from`: one straight leg, whatever the bend;
 *  - bend 45 (the default while BEND_45 is on): a diagonal run at 45 degrees (as long as the shorter side), then a straight run along the axis to `p`: one 45 degree bend;
 *  - bend 90 (the default while BEND_45 is off): an axis run along the longer side, then the other, a right angle.
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

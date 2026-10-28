// T228 (#661, the owner's concept, 2026-10-27: "dark asphalt with white edge lines"): where the roads' white edge lines break. The network draws
// each line from where its kerb runs straight (network.ts Arm.edgeInset: past the junction's corners and zebra); a lot's driveway and a bus stop
// break it as cuts: lot ground patches (top and cut: nothing drawn) whose quad the chunk bake erases from the edge lines alone (renderer.ts),
// so the lines come and go with the lots and stops as the lot ground channel re-bakes their chunks, no rebuild step.
import type { LotPatch } from './ground-protocol';
import { EDGE_IN, edgeLines, type Pt, type Seg } from './network';

/** a driveway's cut reaches this far from the lot's front towards the road (tiles): across the sidewalk (1.025 tiles at most) to the near kerb's
 *  edge line (EDGE_IN inside it) and a little past, well short of the far kerb's (a street's is 3.9 tiles out) */
export const DRIVE_CUT_REACH = 2.2;
/** a driveway's cut is this much wider than the drive each side, and reaches this far into the lot (tiles) */
const DRIVE_CUT_PAD = 0.15, DRIVE_CUT_IN = 0.3;
/** a drive whose nearest point is further than this from the lot's front does not reach the road (a yard's back drive): no cut (tiles) */
const DRIVE_FRONT = 0.6;
/** a bus stop's cut: this long along the kerb either side of the stop (tiles: 20 m in all, a bus and its run in) */
export const STOP_CUT_HALF = 5;

/** the frame of a lot: its front-left corner at the verge edge, u along the road, n away from it into the lot (lots/lots.ts LotGeom) */
export interface LotFrame { o: Pt; u: Pt; n: Pt }

/** the edge-line cuts of a lot's driveways: for every drive patch (LotPatch.drive) that reaches the lot's front, a quad from just inside the lot
 *  out across the sidewalk to the near edge line, as wide as the drive (plus a little) */
export function driveCuts(g: LotFrame, ground: readonly LotPatch[]): LotPatch[] {
  const out: LotPatch[] = [];
  for (const p of ground) {
    if (!p.drive) continue;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity;
    for (let k = 0; k + 1 < p.pts.length; k += 2) {
      const dx = p.pts[k]! - g.o.x, dy = p.pts[k + 1]! - g.o.y, a = dx * g.u.x + dy * g.u.y, b = dx * g.n.x + dy * g.n.y;
      a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b);
    }
    if (!(b0 <= DRIVE_FRONT) || !(a1 > a0)) continue;
    const P = (a: number, b: number) => [g.o.x + g.u.x * a + g.n.x * b, g.o.y + g.u.y * a + g.n.y * b];
    const lo = a0 - DRIVE_CUT_PAD, hi = a1 + DRIVE_CUT_PAD;
    out.push({ pts: [...P(lo, -DRIVE_CUT_REACH), ...P(hi, -DRIVE_CUT_REACH), ...P(hi, DRIVE_CUT_IN), ...P(lo, DRIVE_CUT_IN)], tex: 'asphalt', top: true, cut: true });
  }
  return out;
}

/** the edge-line cut of a bus stop at point s (the stop the player placed, tiles) on the nearest road of segs that has edge lines (within reach
 *  of its kerb): STOP_CUT_HALF each way along that road from s's foot, across its near kerb's edge line; null when no such road is near */
export function stopCut(s: Pt, segs: Iterable<Seg>, reach = 4): LotPatch | null {
  let best: { a: Pt; u: Pt; t: number; side: number; h: number } | null = null, bd = Infinity;
  for (const g of segs) {
    if (!edgeLines(g.cls)) continue;
    const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y, L = Math.hypot(dx, dy); if (L < 1e-6) continue;
    const u = { x: dx / L, y: dy / L }, wx = s.x - g.a.x, wy = s.y - g.a.y, t = Math.max(0, Math.min(L, wx * u.x + wy * u.y));
    const off = wx * -u.y + wy * u.x, d = Math.hypot(wx - u.x * t, wy - u.y * t), kerb = Math.abs(Math.abs(off) - g.cls.h);
    if (d > g.cls.h + g.cls.walk + reach || kerb >= bd) continue;
    bd = kerb; best = { a: g.a, u, t, side: off < 0 ? -1 : 1, h: g.cls.h };
  }
  if (!best) return null;
  const { a, u, t, side, h } = best, nx = -u.y * side, ny = u.x * side;
  const P = (along: number, across: number) => [a.x + u.x * (t + along) + nx * across, a.y + u.y * (t + along) + ny * across];
  const inner = h - EDGE_IN - 0.4, outer = h + 0.1;
  return { pts: [...P(-STOP_CUT_HALF, inner), ...P(STOP_CUT_HALF, inner), ...P(STOP_CUT_HALF, outer), ...P(-STOP_CUT_HALF, outer)], tex: 'asphalt', top: true, cut: true };
}

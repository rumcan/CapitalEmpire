// The clubhouse's "Draw a drive" stopgap (plan P23-UX 6.2 P2-9, D4.18; T175): a clubhouse refused for want of a drive offers to draw one; the
// Paths tool then starts a gravel drive at the nearest road to the spot the player tried; when a drive is built, Buildings comes back with the
// clubhouse armed at that spot. Pure TS, no DOM: the rules the engine follows.
import type { Pt } from './holes';
import type { Rect } from './mode';

/** the clubhouse's refusal that a drive mends (golf/range.ts clubhouseSpotWhy: no road or drive within reach) */
export function wantsDrive(why: string): boolean { return why.startsWith('Place it beside a drive'); }

/** the stopgap in flight: the clubhouse's rect and the point the player clicked (the spot it comes back to) */
export interface DriveStopgap { at: Rect; spot: Pt }

/** what a refused clubhouse click leaves: the offer of a drive when the refusal is the drive's, else none */
export function driveOffer(why: string, at: Rect, spot: Pt): DriveStopgap | null { return wantsDrive(why) ? { at, spot: { x: spot.x, y: spot.y } } : null; }

/** where the drive starts: the nearest point to the spot on a road the clubhouse may front (any road or drive: not a cart path or a walk),
 *  within reach tiles; null with none. segs: the network's segments near the spot, with their class family and base */
export function driveStart(segs: readonly { a: Pt; b: Pt; family?: string; base: string }[], spot: Pt, reach = 200): Pt | null {
  let best: Pt | null = null, bd = reach;
  for (const s of segs) {
    if (s.family === 'course' && !s.base.startsWith('drive')) continue;
    const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((spot.x - s.a.x) * dx + (spot.y - s.a.y) * dy) / L)) : 0;
    const p = { x: s.a.x + t * dx, y: s.a.y + t * dy }, d = Math.hypot(p.x - spot.x, p.y - spot.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/** after a route is built: the clubhouse to re-arm at the stopgap's spot when the route was a drive (a course family class whose base is a
 *  drive), else null (the stopgap waits for its drive) */
export function afterRoute(p: DriveStopgap | null, cls: { family?: string; base: string }): DriveStopgap | null {
  return p && cls.family === 'course' && cls.base.startsWith('drive') ? p : null;
}

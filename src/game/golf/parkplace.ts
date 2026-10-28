// T237 (#694): where a car park may go. The Car park tool snaps a dragged rectangle onto the road beside it (its edge at the road's verge, so the
// road is its frontage and its entrance is on it), refuses a spot a building hides in screen space (the camera looks from the +x +y side, so a
// building covers the ground just behind it: a car park there is out of sight) and a spot on the driving range's tee box, mats or outfield.
// Pure TS, no DOM; tiles of 2 m.
import { SK, type Pt, type RoadNetwork } from '../network';
import { frontage, type CarParkDef } from '../event/carpark';
import { FRONT_GAP } from '../event/config';
import type { Rect } from './mode';

/** how far (tiles) the Car park tool moves a rectangle to put its edge on a road's verge */
export const SNAP_REACH = 6;
/** the share of a car park's tiles a building may hide before the spot is refused */
export const HIDDEN_MAX = 0.25;
/** a building as the placement sees it: its footprint (x, y, w, h), its name, and how far up the screen it stands (tiles along (-1, -1): the
 *  ground behind it it hides; absent: HIDE_K of its longer side) */
export interface Building { rect: Rect; name: string; reach?: number }
/** a building's reach behind it when its picture's height is not known, as a share of its footprint's longer side */
export const HIDE_K = 0.6;

/** the share (0..1) of park d's tiles that building b hides: a tile centre p is hidden when p + k (1, 1) lies in b's footprint for some k in
 *  (0, reach] (the screen's up is -x -y: the building's picture rises over the ground behind it) */
export function hiddenShare(d: { x: number; y: number; w: number; h: number }, b: Building): number {
  const [bx, by, bw, bh] = b.rect, K = b.reach ?? HIDE_K * Math.max(bw, bh);
  let n = 0, hid = 0;
  for (let y = d.y + 0.5; y < d.y + d.h; y += 1) for (let x = d.x + 0.5; x < d.x + d.w; x += 1) {
    n++;
    // the k where the ray p + k (1, 1) is inside the footprint on each axis: [bx - x, bx + bw - x] and [by - y, by + bh - y]
    const k0 = Math.max(bx - x, by - y, 0), k1 = Math.min(bx + bw - x, by + bh - y, K);
    if (k1 > k0) hid++;
  }
  return n ? hid / n : 0;
}
/** the first building that hides more than HIDDEN_MAX of park d, or null */
export function hiddenBy(d: { x: number; y: number; w: number; h: number }, buildings: readonly Building[]): Building | null {
  for (const b of buildings) if (hiddenShare(d, b) > HIDDEN_MAX) return b;
  return null;
}
/** the reason a car park cannot stand on rect d over the range ('' when it can): its tee box, mats or outfield (keepOut: world rects) */
export function rangeKeepOutWhy(d: { x: number; y: number; w: number; h: number }, keepOut: readonly Rect[]): string {
  for (const r of keepOut) if (d.x < r[0] + r[2] && r[0] < d.x + d.w && d.y < r[1] + r[3] && r[1] < d.y + d.h) return 'The driving range is there: keep car parks off the tee box and the outfield';
  return '';
}

/** car park d moved onto the road beside it: an axis park with no frontage is moved at most `reach` tiles across the nearest straight ground road
 *  along one of its sides (overlapping it by half its side at least) so its edge stands at the road's verge (within FRONT_GAP, outside the road),
 *  the smallest move first; d itself when it has a frontage already or is turned, null when no road is in reach */
export function snapToRoad(net: RoadNetwork, d: CarParkDef, reach = SNAP_REACH): CarParkDef | null {
  if (d.a || frontage(net, d)) return d;
  const c: Pt = { x: d.x + d.w / 2, y: d.y + d.h / 2 }, r = Math.max(d.w, d.h) / 2 + reach + 8;
  let best: CarParkDef | null = null, bm = Infinity;
  for (const s of net.segsNear(c, r)) {
    if (s.kind !== SK.GROUND || s.cls.noCars) continue;
    const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L = Math.hypot(dx, dy); if (!L) continue;
    const horiz = Math.abs(dx) / L > 0.98, vert = Math.abs(dy) / L > 0.98; if (!horiz && !vert) continue;
    const verge = s.cls.h + s.cls.walk;
    // the road's line (y = k for a horizontal road, x = k for a vertical one), the park's span along it and the overlap
    const k = horiz ? (s.a.y + s.b.y) / 2 : (s.a.x + s.b.x) / 2, lo = horiz ? d.x : d.y, hi = lo + (horiz ? d.w : d.h);
    const ov = Math.min(hi, Math.max(horiz ? s.a.x : s.a.y, horiz ? s.b.x : s.b.y)) - Math.max(lo, Math.min(horiz ? s.a.x : s.a.y, horiz ? s.b.x : s.b.y));
    if (ov < Math.min(8, (hi - lo) / 2)) continue;
    const p0 = horiz ? d.y : d.x, len = horiz ? d.h : d.w;
    // the park on the road's low side (its far edge at the verge) or its high side (its near edge there), whole tiles, the verge gap in [0, 1)
    for (const at of [Math.floor(k - verge) - len, Math.ceil(k + verge)]) {
      const m = at - p0; if (Math.abs(m) > reach || Math.abs(m) >= bm) continue;
      const q: CarParkDef = horiz ? { ...d, y: at } : { ...d, x: at };
      const gap = (at > k ? at - k : k - (at + len)) - verge;
      if (gap < 0 || gap > FRONT_GAP || !frontage(net, q)) continue;
      best = q; bm = Math.abs(m);
    }
  }
  return best;
}

// The names module's wiring into the game (T012): a route's geometry key (its name hangs on it), the nearest town
// site within reach, and the road-name cache one map keeps. Pure TS, no DOM. Names are never saved: they follow from
// the map seed (the Names instance) and these keys, so a rebuilt network names its roads the same way.
import type { Pt } from '../../network';
import type { Names } from './names';

/** the reach (tiles) within which a road takes its nearest town's name as its no-repeat scope; out in the country none */
export const TOWN_REACH = 400;

/** a route's geometry key: its canonical points rounded to 0.01 tile and joined. No class in it, so a street widened
 *  to an avenue is the same route (and keeps its stem); an unrelated edit elsewhere leaves it alone */
export function routeKey(pts: readonly Pt[]): string {
  let s = '';
  for (const p of pts) s += `${Math.round(p.x * 100)},${Math.round(p.y * 100)};`;
  return s;
}

/** the index of the town centre nearest p within reach tiles, or -1 when none is in reach */
export function nearestTown(p: Pt, centres: readonly Pt[], reach = TOWN_REACH): number {
  let k = -1, best = reach * reach;
  for (let i = 0; i < centres.length; i++) { const c = centres[i]!, d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2; if (d <= best) { best = d; k = i; } }
  return k;
}

/** one map's road names: names.road for each route, cached by route key and class on first use, and by route object
 *  (a rebuild makes new route objects, so the object cache only spares the key string on repeat asks) */
export class RoadNames {
  /** the name by class + route key, and the name of each route object */
  private byKey = new Map<string, string>();
  private byRoute = new WeakMap<object, string>();
  /** the map's generator, and the town centres (tiles) in the terrain's town order (the index a Names town(i) takes) */
  constructor(readonly names: Names, readonly centres: readonly Pt[]) {}

  /** the name of a route: its class, its geometry key, and the name of its nearest town within TOWN_REACH (none out in the country) */
  nameOf(route: { pts: readonly Pt[]; cls: { id: string } }): string {
    const had = this.byRoute.get(route);
    if (had !== undefined) return had;
    const ps = route.pts, mid = ps.length ? ps[ps.length >> 1]! : null;
    const key = routeKey(ps), ck = `${route.cls.id}|${key}`;
    let name = this.byKey.get(ck);
    if (name === undefined) {
      const k = mid ? nearestTown(mid, this.centres) : -1;
      name = this.names.road(key, route.cls.id, k < 0 ? undefined : this.names.town(k));
      this.byKey.set(ck, name);
    }
    this.byRoute.set(route, name);
    return name;
  }
}

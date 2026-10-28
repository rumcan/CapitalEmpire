// T237 (#694): the walking-distance rule. A car park serves a venue (the range, the clubhouse, the first tee, the practice area, a tournament's
// gates) when its nearest bay is within WALK_SERVE_M of walking of the venue's door: about a two-minute walk. A car park further away adds no bays
// to that venue: its drivers find no serving bay and turn away as at a full car park (the range's "no parking" reason), with no appeal penalty of
// its own. Far lots are for a later park-and-ride with a shuttle bus (golf/parkride.ts: its lots are MIN_PARK_RIDE_DIST_TILES out, past this rule).
// Pure TS, no DOM; positions in tiles of TILE_M metres.
import type { Pt } from '../network';

/** the walk a car park may be from a venue's door and still serve it (metres of walking: about two minutes at a stroll) */
export const WALK_SERVE_M = 150;
/** a tile's side (metres) */
export const TILE_M = 2;
/** WALK_SERVE_M in tiles */
export const WALK_SERVE_TILES = WALK_SERVE_M / TILE_M;

/** the venues a car park can serve */
export type VenueId = 'range' | 'clubhouse' | 'tee' | 'practice' | 'gates';
/** a venue's name as the preview and the cards say it */
export const VENUE_NAME: Readonly<Record<VenueId, string>> = { range: 'Range', clubhouse: 'Clubhouse', tee: 'First tee', practice: 'Practice area', gates: 'Tournament gates' };
/** a venue on the map: what it is and its door (world tiles: where its walkers go in) */
export interface Venue { id: VenueId; door: Pt }
/** a venue a car park serves and the walk from its nearest bay (metres, whole) */
export interface Serve { venue: Venue; m: number }

/** the distance (tiles) from p to the axis rect [x, y, w, h] (0 inside it) */
export function rectGap(p: Pt, r: readonly [number, number, number, number]): number {
  const dx = Math.max(r[0] - p.x, 0, p.x - (r[0] + r[2])), dy = Math.max(r[1] - p.y, 0, p.y - (r[1] + r[3]));
  return Math.hypot(dx, dy);
}
/** the walk (metres, whole) from a car park to a door: from its nearest bay; with no bays (a rect still being dragged, or one with no road), from
 *  the nearest point of its rect (rect absent: Infinity) */
export function walkM(bays: readonly Pt[], door: Pt, rect?: readonly [number, number, number, number]): number {
  let t = Infinity;
  for (const b of bays) { const d = Math.hypot(b.x - door.x, b.y - door.y); if (d < t) t = d; }
  if (!bays.length && rect) t = rectGap(door, rect);
  return Number.isFinite(t) ? Math.round(t * TILE_M) : Infinity;
}
/** whether a walk (metres) is within the rule */
export const walkServes = (m: number): boolean => m <= WALK_SERVE_M;
/** the venues a car park serves (its nearest bay within WALK_SERVE_M of each one's door), nearest first (ties: the venues' order); a venue with
 *  several doors (a tournament's gates) is listed once, by its nearest door */
export function servesOf(bays: readonly Pt[], venues: readonly Venue[], rect?: readonly [number, number, number, number]): Serve[] {
  const best = new Map<VenueId, Serve>();
  for (const venue of venues) {
    const m = walkM(bays, venue.door, rect), had = best.get(venue.id);
    if (walkServes(m) && (!had || m < had.m)) best.set(venue.id, { venue, m });
  }
  return [...best.values()].sort((a, b) => a.m - b.m);
}
/** the line the preview and the car park's card show: "Serves: Range (40 m walk), Clubhouse (95 m walk)", or "Too far to walk to anything" */
export function serveLine(s: readonly Serve[]): string {
  if (!s.length) return TOO_FAR;
  return `Serves: ${s.map(q => `${VENUE_NAME[q.venue.id]} (${q.m} m walk)`).join(', ')}`;
}
export const TOO_FAR = 'Too far to walk to anything';

/** the car parks that serve a door, nearest walk first (ties: their order): each with its walk (metres). bays(p): a park's bays */
export function servingParks<P>(parks: readonly P[], door: Pt, bays: (p: P) => readonly Pt[]): { park: P; m: number }[] {
  const out: { park: P; m: number; k: number }[] = [];
  parks.forEach((park, k) => { const b = bays(park); if (!b.length) return; const m = walkM(b, door); if (walkServes(m)) out.push({ park, m, k }); });
  return out.sort((a, b) => a.m - b.m || a.k - b.k).map(({ park, m }) => ({ park, m }));
}
/** a car park's bays in the order its drivers take them for a venue: the bay nearest the venue's door first (ties: the park's own order, nearest
 *  its entrance) */
export function baysByDoor<B extends Pt>(bays: readonly B[], door: Pt): B[] {
  return bays.map((b, k) => ({ b, k, d: Math.hypot(b.x - door.x, b.y - door.y) })).sort((p, q) => p.d - q.d || p.k - q.k).map(q => q.b);
}
/** a venue's card line for its car parks (servingParks' ids, bays and walks): "Car parks: #1 44 bays (40 m walk), #3 30 bays (120 m walk)", or
 *  "No car park within 150 m walk" */
export function lotsLine(lots: readonly { id: number; bays: number; m: number }[]): string {
  if (!lots.length) return `No car park within ${WALK_SERVE_M} m walk`;
  return `Car parks: ${lots.map(l => `#${l.id} ${l.bays} bays (${l.m} m walk)`).join(', ')}`;
}

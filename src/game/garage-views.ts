import { GARAGE_VIEW_SETS } from './garage-views-library';

/** Garage diagonal picture -> the original garage whose Studio size and removal it shares. Units: sprite IDs. */
export const GARAGE_VIEW_BASE: ReadonlyMap<string, string> = new Map(Object.entries(GARAGE_VIEW_SETS).flatMap(([base, views]) => views.map(id => [id, base] as const)));
const TURN = new Map<string, string>();
for (const [ne, se, sw, nw] of Object.values(GARAGE_VIEW_SETS)) {
  TURN.set(ne, se); TURN.set(se, ne); TURN.set(sw, nw); TURN.set(nw, sw);
}
/** A garage diagonal drawn with its paired angle instead of a mirror; null for other pictures. Units: sprite IDs. */
export const garageUnmirror = (id: string, flip: boolean): string | null => TURN.has(id) ? (flip ? TURN.get(id)! : id) : null;

import { EXTRA_VIEW_SETS } from './extra-views-library';

/** Supplemental diagonal picture -> the original axis subject whose Studio size and removal it shares. Units: sprite IDs. */
export const EXTRA_VIEW_BASE: ReadonlyMap<string, string> = new Map(Object.entries(EXTRA_VIEW_SETS).flatMap(([base, views]) => views.map(id => [id, base] as const)));
const TURN = new Map<string, string>();
for (const [ne, se, sw, nw] of Object.values(EXTRA_VIEW_SETS)) {
  TURN.set(ne, se); TURN.set(se, ne); TURN.set(sw, nw); TURN.set(nw, sw);
}
/** A supplemental diagonal drawn with its paired angle instead of a mirror; null for other pictures. Units: sprite IDs. */
export const extraUnmirror = (id: string, flip: boolean): string | null => TURN.has(id) ? (flip ? TURN.get(id)! : id) : null;

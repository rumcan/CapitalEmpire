// J7e (#1258; the owner, 2026-11-14: "no vector distance signs. only png sprites allowed. please make sure they replace those with images from chat gpt images"):
// the range's yardage signs are ChatGPT pictures with their distance painted on, drawn as the range scene's pieces (rangebiz.ts rangeScene) beside the 50 m
// markers and the target greens in the jam build. Each painted distance is one range art slug, golf-range-yard-<m>, with two views packed by prep-range-art.mjs
// (range-art-items.json "yard"; view 1 the front facing the screen's lower left, view 2 its lower right), and it is looked up like every other range picture:
// the same `art(slug, q)` that picks the yardage board's and the road sign's view by the range's facing (view 1 for q 0 or 1, view 2 for q 2 or 3; never turned
// or mirrored). A distance with no picture gets no sign at all (never a code-drawn board, a number or a blank post). Pure TS, no DOM.

/** the painted distances (m): the range's markers are every 50 m (50..250), its target greens at 50, 100, 150, 200 and 240 m (240 has no picture: no sign) */
export const YARDAGE_DISTANCES: readonly number[] = Object.freeze([50, 75, 100, 125, 150, 175, 200, 250]);

/** a distance's range art slug (null: no picture is painted for it, so it gets no sign: never the nearest distance's, which would show a wrong one) */
export function yardageSlug(m: number): string | null {
  return Number.isInteger(m) && YARDAGE_DISTANCES.includes(m) ? `golf-range-yard-${m}` : null;
}

/** a view that was painted at the wrong heading (not the one its file says), so it is not drawn: the slug's index (0: view 1) of it. The 100 m sign's "view 1"
 *  came out as a second view 2 (its front facing the lower right: the other signs' view 1 faces the lower left), so on the facings that ask for view 1 the 100 m
 *  sign is its view 2 (the right number, turned the other way, never mirrored) until a view 1 is painted again; then delete its line */
export const WRONG_HEADING: Readonly<Record<string, 0 | 1>> = Object.freeze({ 'golf-range-yard-100': 0 });

/** the library id of the yardage sign for m metres on a range whose pieces face q (rangeScene's toRoad), looked up through the range scene's own `art(slug, q)`
 *  (its picture's id once it has landed, else null): null when the distance has no picture painted or packed: no sign at all */
export function yardageSign(m: number, q: number, art: (slug: string, q: number) => string | null): string | null {
  const slug = yardageSlug(m); if (!slug) return null;
  const bad = WRONG_HEADING[slug], view = q === 0 || q === 1 ? 0 : 1;
  return art(slug, bad !== undefined && bad === view ? (view === 0 ? 2 : 0) : q);
}

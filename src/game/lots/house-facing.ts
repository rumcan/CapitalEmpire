// T385 (#1042): "the house facing the road", through ONE function. facingView(id, frame) is the picture a building is drawn with on a lot, and how well its
// front meets the lot's street: exact (its front faces the street) or off by a number of eighth turns (45 degrees each: 0 exact, 4 facing away). Today the
// views a building has are the four corner views (its front facing +y, +x, -y, -x: the map-axis streets, the roads 0, 2, 4, 6) and the screen-axis set
// (N, E, S, W: the roads 1, 3, 5, 7); T375 (#1031, the eight-facing runtime) adds the straight-on view of a building with eight to roadView and faces
// (preset-art.ts), which drawnView and this function read: its views slot in there, and nothing here changes. A picture whose heading is not known to the
// four-view and screen-axis tables is exact when faces() says so (the eight-facing rings), else it keeps the heading its single picture has (its front on +y).
// Pure over the library: no DOM.
import { axisViews, drawnView, faces, fourViews } from './preset-art';
import { roadOf } from './preset-frame';
import type { Pt } from './preset-frame';

/** the eighth turn (0..7, the roads' numbering: the side the street lies on) a picture's front faces, or null when its set is not one the tables know:
 *  a corner view of a four-view set (even roads: 2 x its place in NE, SE, SW, NW), a screen-axis view (odd roads: 2 x its place in N, E, S, W, plus 1) */
export function pictureHeading(id: string): number | null {
  const v = fourViews(id); if (v) return 2 * v.at;
  const a = axisViews(id); if (a) return 2 * a.at + 1;
  return null;
}
/** the number of eighth turns (0..4) between two headings */
export const turnsBetween = (a: number, b: number): number => { const d = (((a - b) % 8) + 8) % 8; return Math.min(d, 8 - d); };

/** a building's picture on a lot and its facing: the picture and flip (drawnView), whether its front meets the street (exact), and how many eighth turns
 *  off it is (0: exact; 1: the nearest corner on a road at 45 degrees; 2: side on; 4: its back to the street) */
export interface Facing { id: string; flip: boolean; diag: boolean; exact: boolean; off: number }
/** the picture of a building (id: its base picture, view: the view the preset turns it to, 0 = its front to the street) on a lot whose preset frame is f
 *  (q the quarter turns, n the away vector), and how well its front meets the street, whatever the view: the best the library has */
export function facingView(id: string, f: { q: number; n: Pt }, view = 0): Facing {
  const road = roadOf(f.n), d = drawnView(id, f, view), got = pictureHeading(d.id);
  const exact = got !== null ? got === road : view === 0 && faces(id, road);
  return { ...d, exact, off: got !== null ? turnsBetween(got, road) : exact ? 0 : 2 };
}
/** the first of the ids whose picture faces the lot's street best (the fewest eighth turns off; the earlier wins a tie); null for an empty list */
export function bestFacing(ids: readonly string[], f: { q: number; n: Pt }): { id: string; facing: Facing } | null {
  let best: { id: string; facing: Facing } | null = null;
  for (const id of ids) { const facing = facingView(id, f); if (!best || facing.off < best.facing.off) best = { id, facing }; if (best.facing.off === 0) break; }
  return best;
}

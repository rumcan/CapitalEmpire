// T385 (#1042): "the house facing the road", through ONE function. facingView(id, frame) is the picture a building is drawn with on a lot, and how well its
// front meets the lot's street: exact (its front faces the street) or off by a number of eighth turns (45 degrees each: 0 exact, 4 facing away). Today the
// views a building has are the four corner views (its front facing +y, +x, -y, -x: the map-axis streets, the roads 0, 2, 4, 6) and the screen-axis set
// (N, E, S, W: the roads 1, 3, 5, 7); T375 (#1031, the eight-facing runtime) adds the straight-on view of a building with eight to roadView and faces
// (preset-art.ts), which drawnView and this function read: its views slot in there, and nothing here changes. A picture whose heading is not known to the
// four-view and screen-axis tables is exact when faces() says so (the eight-facing rings), else it keeps the heading its single picture has (its front on +y).
// Pure over the library: no DOM.
import { axisViews, baseView, drawnView, faces, fourViews } from './preset-art';
import { roadOf } from './preset-frame';
import type { Pt } from './preset-frame';
import { doorsOf, garageOf } from './house-doors';
import type { LotAnchors } from './compose-core';
import { markOf, type ViewMark } from './flagged-views';

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
 *  off it is (0: exact; 1: the nearest corner on a road at 45 degrees; 2: side on; 4: its back to the street). T398 (the owner, 2026-11-09: the garage door must face the
 *  street, and never a view marked angles-wrong, more-angles or redo-style): mark, the owner's mark on the drawn picture (null: none); garage, where the garage door is in
 *  it (house-doors.ts: none, on the front wall, or sideways); ok, the picture a house lot may draw: its front meets the street (exact), the owner has not marked it, and a
 *  garage it has is on the front wall */
export interface Facing { id: string; flip: boolean; diag: boolean; exact: boolean; off: number; mark: ViewMark | null; garage: 'none' | 'front' | 'side'; ok: boolean }
/** the picture of a building (id: its base picture, view: the view the preset turns it to, 0 = its front to the street) on a lot whose preset frame is f
 *  (q the quarter turns, n the away vector), and how well its front meets the street, whatever the view: the best the library has */
export function facingView(id: string, f: { q: number; n: Pt }, view = 0): Facing {
  const road = roadOf(f.n), d = drawnView(id, f, view), got = pictureHeading(d.id);
  const exact = got !== null ? got === road : view === 0 && faces(id, road);
  const corner = fourViews(d.id), mark = markOf(d.id), garage = garageOf(baseView(id).id, corner ? corner.at : null);
  // (T398, the owner, 2026-11-09: "axis roads use the corner views only": a map-axis road never draws a straight-on picture or an eight-view ring picture, whatever id it was given)
  const cornerOnly = road % 2 === 0 ? corner !== null : true;
  return { ...d, exact, off: got !== null ? turnsBetween(got, road) : exact ? 0 : 2, mark, garage, ok: exact && cornerOnly && mark === null && garage !== 'side' };
}
/** the first of the ids whose picture faces the lot's street best (the fewest eighth turns off; the earlier wins a tie); null for an empty list */
export function bestFacing(ids: readonly string[], f: { q: number; n: Pt }): { id: string; facing: Facing } | null {
  let best: { id: string; facing: Facing } | null = null;
  for (const id of ids) { const facing = facingView(id, f); if (!best || facing.off < best.facing.off) best = { id, facing }; if (best.facing.off === 0) break; }
  return best;
}

/** T398: where a house's doors are on its lot (the lot's preset frame, tiles): the front door on the front wall, and each garage door that faces the street. hb: the house's box (x0, y0, x1, y1;
 *  y0 is its front wall, the street side); hf: facingView of the picture it is drawn in; garageBoxes: the boxes of the garage buildings kept on the lot (each faces the street: a garage that cannot is
 *  left out), whose door is the middle 70% of the wall that faces the street. The house's own garage (house-doors.ts: a garage or carport on its front wall, in a picture that draws it there) is a
 *  door only when the picture's front meets the street. A house whose front does not meet the street (the nearest corner on a road at 45 degrees) has its door in the middle of the wall nearest it. */
export function lotAnchors(houseId: string, hf: Facing, hb: readonly [number, number, number, number], garageBoxes: readonly (readonly [number, number, number, number])[]): LotAnchors {
  const doors = doorsOf(houseId), w = hb[2] - hb[0], garages: LotAnchors['garages'] = [];
  if (hf.exact && hf.garage === 'front' && doors?.garage) garages.push({ x0: hb[0] + doors.garage.span[0] * w, x1: hb[0] + doors.garage.span[1] * w, y: hb[1] });
  for (const gb of garageBoxes) { const gw = gb[2] - gb[0]; garages.push({ x0: gb[0] + 0.15 * gw, x1: gb[2] - 0.15 * gw, y: gb[1] }); }
  return { house: { id: hf.id, box: [hb[0], hb[1], hb[2], hb[3]], exact: hf.exact, mark: hf.mark, garage: hf.garage }, doorX: hb[0] + (hf.exact ? doors?.door ?? 0.5 : 0.5) * w, frontY: hb[1], garages, boxes: [[hb[0], hb[1], hb[2], hb[3]], ...garageBoxes.map((b): [number, number, number, number] => [b[0], b[1], b[2], b[3]])] };
}

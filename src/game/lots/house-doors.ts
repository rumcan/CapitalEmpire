// T398 (#1070, PR 2; the owner, 2026-11-09, with screenshots: "the garage door faces sideways, away from the street", "the driveway leads to nothing: the path meets the side wall
// and a drive pad beside it has no garage"): where a house's front door and its garage door are, so a lot lays its front path to the door and its drive to the garage, and draws no
// house whose garage door does not face the street. A house has a drive only where it has a garage (or a carport): no garage, no drive.
//
// The data is per house type, read off its four corner pictures (art/building-views; the footprint's front wall drawn with a tick every tenth: scripts/lots/house-wall-tiles.py), not per pixel: positions are fractions along the FRONT wall (the wall that faces the street when the picture is the one chosen for the road), 0 at the left and 1 at the
// right as seen from the street, which is the lot frame's x (preset-frame.ts). A building drawn as four true quarter turns shows the same front wall in all four corner pictures, so one
// number serves them; a picture that draws the garage on another wall than the front (the generated art is not always a true rotation) is listed in `side`. A picture that hides the garage
// (the front wall faces away from the screen: the SW and NW views) carries it on the front, as the rotation puts it. Fitted by eye from the pictures (about a tenth of a wall, a metre),
// not owner-measured. Pure over the library: no DOM.
import { fourViews } from './preset-art';

/** the doors of one house type: `door` the front door's place along the front wall; `garage` a garage or carport opening on the front wall: its span along it, and the corner pictures (NE 0, SE 1, SW 2, NW 3)
 *  that draw it on another wall */
export interface HouseDoors { door: number; garage?: { span: readonly [number, number]; side: readonly number[] } }
const L_SHAPE: HouseDoors = { door: 0.25, garage: { span: [0.55, 0.95], side: [1, 3] } };
const RANCH: HouseDoors = { door: 0.55, garage: { span: [0, 0.3], side: [] } };
const DUPLEX: HouseDoors = { door: 0.5 };
const FARM: HouseDoors = { door: 0.55 };
/** by the house type's base picture (its NE view; a variation's art has its own id) */
export const HOUSE_DOORS: Readonly<Record<string, HouseDoors>> = {
  'gen:house-duplex': DUPLEX, 'variation:gen-house-duplex-c39d1a23-plain-corner:1': DUPLEX,
  'gen:house-farmhouse-wrap': FARM, 'variation:gen-house-farmhouse-wrap-2b0eea83-plain-corner:1': FARM,
  'gen:house-l-shape': L_SHAPE, 'variation:gen-house-l-shape-e0e3b328-plain-corner:1': L_SHAPE, 'variation:gen-house-l-shape-e0e3b328-plain:1': L_SHAPE,
  'gen:house-ranch-long': RANCH, 'variation:gen-house-ranch-long-a4ddd58c-plain-corner:1': { door: 0.72, garage: { span: [0, 0.3], side: [] } },
  'gen:house-splitlevel': { door: 0.4 }, 'variation:gen-house-splitlevel-8b6b4aa4-plain:1': { door: 0.4 },
  'variation:gen-house-l-ranch-18552ce5-plain-corner:1': { door: 0.55 },
  'variation:world-house_1-ba13ed2e-plain-corner:1': { door: 0.3 },
  'world:house_0': { door: 0.3 }, 'world:house_1': { door: 0.25 }, 'world:house_2': { door: 0.4 }, 'world:house_3': { door: 0.5 }, 'world:house_4': { door: 0.45 }, 'world:house_5': { door: 0.35 },
};
/** the doors of a house by any picture of it (its base id, or one of its four corner views), or null for a building the table does not list (it gets the middle of its front for a door and no garage) */
export const doorsOf = (id: string): HouseDoors | null => HOUSE_DOORS[fourViews(id)?.views[0] ?? id] ?? null;
/** where a garage door stands for a picture: 'none' (the house has no garage), 'front' (on the front wall: it faces the street when the front does), or 'side' (this corner picture draws it on another
 *  wall: it never faces the street). `corner` is the picture's place in the four-view order (NE 0, SE 1, SW 2, NW 3), or null for a picture that is no corner view (a straight-on one) */
export function garageOf(id: string, corner: number | null): 'none' | 'front' | 'side' {
  const d = doorsOf(id); if (!d?.garage) return 'none';
  return corner === null || d.garage.side.includes(corner) ? 'side' : 'front';
}

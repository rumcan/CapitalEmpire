// No building is ever mirrored (the owner, 2026-10-24: "No mirror allowed in the game: must use the alternate angle image generated"). The sun
// is on the right of the screen and a mirrored picture puts it on the left, so a flip (the world axes swapped) draws a building turned instead:
// the four-view art as its partner view (views-library.ts unmirror), any other building as it is, unflipped, until its views are generated
// (art/building-views/COVERAGE.md lists those). The east art made by mirroring a front (east-library.ts) is drawn as that front, unflipped.
// The screen-axis pictures (axis-library.ts, T154: plants and props among them) are never mirrored either: a flip draws E as W and W as E, and
// N and S as they are (they face the same way either side of the flip).
// No tree, bush, shrub, flower, palm or rock is ever mirrored either (the owner, 2026-10-28: "make sure we never mirror a bush or tree or plant. always sun from top right"):
// their light is painted from the upper right, and a mirror puts it on the left. A tree whose art is lit from the left is the one exception the
// engine makes (tree-sun.ts TREE_MIRROR): it is drawn mirrored so its light comes from the right.
import type { LibItem } from './types';
import { BUILDING_IDS, VIEW_ART, unmirror } from './views-library';
import { AXIS_TURN } from './axis-library';
import { extraUnmirror } from './extra-views';

/** the natural kinds: never mirrored (the sun stays at the upper right) */
export const NATURAL_KINDS: ReadonlySet<string> = new Set(['tree', 'bush', 'shrub', 'flower', 'palm', 'rock']);
/** the kinds drawn from building art: houses, shops, lot buildings, baked lots, business pictures, golf and event structures */
const KINDS = new Set(['house', 'building', 'venue', 'lot', 'business', 'gazebo', 'arcade']);
/** a sprite drawn from building art (the art inventory's buildings, the small shelters among them, and every sprite of a building kind) */
export const isBuilding = (it: LibItem) => BUILDING_IDS.has(it.id) || KINDS.has(it.kind);

/** the sprite and flip a library sprite is drawn with: a building, a screen-axis picture, a natural thing or a kit picture is never mirrored;
 *  anything else as it is */
export function drawnAs(it: LibItem, flip: boolean): [string, boolean] {
  const garage = extraUnmirror(it.id, flip); if (garage !== null) return [garage, false];
  const a = AXIS_TURN[it.id]; if (a !== undefined) return [flip ? a : it.id, false];
  if (it.id.startsWith('east:') && !VIEW_ART.has(it.id)) return [it.id.slice(5), false];
  // T231: the concept kit is one picture each, lit from the upper right as painted: never mirrored (T257 mirrored its boulders, shrubs, mums
  // and palms; the owner, 2026-10-28, ended that)
  if (it.id.startsWith('kit:')) return [it.id, false];
  const [id, f] = unmirror(it.id, flip);
  return [id, f && !isBuilding(it) && !NATURAL_KINDS.has(it.kind)];
}

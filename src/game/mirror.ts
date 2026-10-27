// No building is ever mirrored (the owner, 2026-10-24: "No mirror allowed in the game: must use the alternate angle image generated"). The sun
// is on the right of the screen and a mirrored picture puts it on the left, so a flip (the world axes swapped) draws a building turned instead:
// the four-view art as its partner view (views-library.ts unmirror), any other building as it is, unflipped, until its views are generated
// (art/building-views/COVERAGE.md lists those). The east art made by mirroring a front (east-library.ts) is drawn as that front, unflipped.
// The screen-axis pictures (axis-library.ts, T154: plants and props among them) are never mirrored either: a flip draws E as W and W as E, and
// N and S as they are (they face the same way either side of the flip).
import type { LibItem } from './types';
import { BUILDING_IDS, VIEW_ART, unmirror } from './views-library';
import { AXIS_TURN } from './axis-library';
import { extraUnmirror } from './extra-views';

/** the kinds drawn from building art: houses, shops, lot buildings, baked lots, business pictures, golf and event structures */
const KINDS = new Set(['house', 'building', 'venue', 'lot', 'business', 'gazebo', 'arcade']);
/** a sprite drawn from building art (the art inventory's buildings, the small shelters among them, and every sprite of a building kind) */
export const isBuilding = (it: LibItem) => BUILDING_IDS.has(it.id) || KINDS.has(it.kind);

/** the sprite and flip a library sprite is drawn with: a building or a screen-axis picture is never mirrored; anything else as it is */
export function drawnAs(it: LibItem, flip: boolean): [string, boolean] {
  const garage = extraUnmirror(it.id, flip); if (garage !== null) return [garage, false];
  const a = AXIS_TURN[it.id]; if (a !== undefined) return [flip ? a : it.id, false];
  if (it.id.startsWith('east:') && !VIEW_ART.has(it.id)) return [it.id.slice(5), false];
  const [id, f] = unmirror(it.id, flip);
  return [id, f && !isBuilding(it)];
}

// T385 (#1042; the owner, 2026-11-08, with a screenshot of a desert house lot crowded with a boat on a trailer, a car on the grass, palms through the
// roof, a crate, a mailbox and junk: "something needs to make sure every single lot is first and foremost logical and looks good before it adds a
// shit ton of crap. A house looking at the road with an appropriate driveway or parking area and fence. 3 trees and that is it ... remove all cars and
// mail boxes and shit. all of it."): the CLEAN BASE of a house lot. A built house lot is composed in this order and nothing more:
//   1. the house facing its road (its front door and garage toward the street: house-facing.ts);
//   2. a driveway or parking area from the road, and a front path to the door;
//   3. a fence on the sides and back it owns, never across the drive or the path (a hedge on a road at 45 degrees: no fence picture runs along a screen axis);
//   4. at most MAX_TREES trees, clear of the house, its roof, the drive and the path, in the autumn art and in the desert art too (clean-lot.ts).
// No parked cars, trailers, boats, mailboxes, bins, crates, toys, hoops, trampolines, barbecues, junk, bushes, beds or ground decals are generated.
// Old saves compose their house lots clean as they load (lots/compose.ts: the lot model, CLEAN_MODEL); only house yards change. The old yards stay as an
// option (?oldyards, or setCleanYards(false): the tests and the lot lab's own presets). This module is the switch, the rule's numbers and the definition
// of clutter (the audit, the review mode and the tests read it). Pure over the library: no DOM.
import { LIBRARY } from '../library';
import { isBuilding } from '../mirror';
import { AXIS_PROPS } from './preset-art';
import { isFence } from './item-kinds';
import { roleOf } from './groups';

/** the clean yards on (?oldyards, or setCleanYards(false), composes the house lots as before T385: the old look kept as an option) */
let CLEAN = !(typeof location !== 'undefined' && /[?&]oldyards(&|=|$)/.test(location.search ?? ''));
export function setCleanYards(on: boolean): void { CLEAN = on; }
export const cleanYards = (): boolean => CLEAN;

/** the most trees a clean house lot takes (the owner: "3 trees and that is it") */
export const MAX_TREES = 3;
/** the lot model that made the clean base the rule: a new town records it. A saved town of an older model composes its house lots clean too (the
 *  models still tell the other uses' generators apart: a v3 town keeps its shops as they were) */
export const CLEAN_MODEL = 5;

const BY = new Map(LIBRARY.map(i => [i.id, i]));
/** the shrubs a lot on a road at 45 degrees takes for its boundary in place of fence panels (autolot.ts HEDGE: a panel along a screen axis saws): a
 *  boundary, not a yard plant, so no clutter */
export const HEDGE_IDS: ReadonlySet<string> = new Set(['landscape:bush-deep-green', 'landscape:bush-sage-round', 'world:bush_0']);
/** what a piece of clutter is, by the owner's words: nothing of these is ever generated on a house lot */
export type ClutterKind = 'car' | 'trailer' | 'boat' | 'mailbox' | 'bin' | 'crate' | 'toy' | 'hoop' | 'trampoline' | 'barbecue' | 'junk' | 'furniture' | 'plant' | 'shed' | 'sign' | 'other';
const WORDS: [ClutterKind, RegExp][] = [
  ['mailbox', /mailbox|\bmail\b|letterbox/],
  ['bin', /trash|dumpster|recycl|garbage|compost|\bbin\b|leaf-bags/],
  ['trampoline', /trampoline/],
  ['hoop', /basketball|\bhoop\b/],
  ['barbecue', /barbecue|barbeque|\bbbq\b|grill|fire ?pit/],
  ['boat', /\bboat|canoe|kayak/],
  ['toy', /swing|slide|sandbox|playhouse|tricycle|\bbikes?\b|pram|wagon|skate|soapbox|kiddie|toy|treehouse|junglegym|spider/],
  ['crate', /crate|\bbox\b|barrel|\bdrum|pallet|cooler|trunk|cabinet/],
  ['junk', /junk|scrap|tyre|tire|appliance|rubble|woodpile|firewood|compressor|\bcrt\b|workbench|rototiller|mower|lawn-roller|engine|hvac|rusty|pump|stripped/],
  ['furniture', /chair|bench|table|umbrella|hammock|patio|picnic|washing-line|clothes|birdhouse|doghouse|rain-barrel|tent|pool|gazebo|satellite|dish|ham-radio/],
];
/** what a library id is as clutter, or null when it belongs on a clean house lot: a house or a garage, a fence panel or a hedge piece, a tree */
export function clutterKind(id: string): ClutterKind | null {
  const it = BY.get(id), name = `${id} ${it?.name ?? ''}`.toLowerCase();
  if (id.startsWith('cars:') || it?.kind === 'car' || it?.cat === 'Vehicles') return AXIS_PROPS.has(id) || /trailer|camper|caravan|mobile-home|boxcar/.test(name) ? (/boat/.test(name) ? 'boat' : 'trailer') : 'car';
  if (AXIS_PROPS.has(id)) return /boat/.test(name) ? 'boat' : 'trailer';
  if (it && isBuilding(it)) { const r = roleOf(id); return r === 'house' || r === 'garage' ? null : 'shed'; }
  if (it?.kind === 'tree' || it?.kind === 'palm' || HEDGE_IDS.has(id) || isFence(id)) return null;
  for (const [k, re] of WORDS) if (re.test(name)) return k;
  if (it?.kind === 'bush' || it?.kind === 'shrub' || it?.kind === 'flower' || it?.kind === 'plant' || /fern|hydrangea|ornamental|bush|shrub|flower|grass/.test(name)) return 'plant';
  if (/sign|meter|lamp|hydrant|pole|booth/.test(name)) return 'sign';
  return 'other';
}
/** whether an id is clutter (not a house, a garage, a fence or hedge piece, or a tree) */
export const isClutter = (id: string): boolean => clutterKind(id) !== null;

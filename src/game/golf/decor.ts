// The Props tool's catalogue and rules (plan P24 Phase 3, T131): the decor a player dresses the course and the range with (pot plants, shrubs and
// grasses, flower beds, fountains, statues, pillars, an arch, benches, bins, lamp posts, flag poles), each a library picture with a price and
// an appeal; where to put one (the player's land only: never a road or path, water, a green, a bunker, the range's mats and target greens, a
// building or another prop); and the appeal the props near the range's shop and mats add to it (capped). Pure TS, no DOM: the engine's side
// is golf/propstool.ts. Prices are $; appeal a fraction (0.01 = +1% visitors, and +1% on the fair price).
import type { Pt } from '../network';
import { PROPS_APPEAL_CAP } from './rangesave';
import { LIBRARY } from '../library';
import { FRAME_TREE_KEY, FRAME_TREE_PRICE } from './holeframe';
import { KIT_BOULDERS, KIT_FLOWERS, KIT_FOUNTAIN, KIT_HEDGE, KIT_LAMPS, KIT_PALMS, KIT_POND_EDGE, KIT_SHRUBS, type RunKit } from '../kit';

/** the panel's groups, in order (T187: Buildings, the few the player adds to the town: Town decoration's) */
export type DecorGroup = 'plants' | 'water' | 'stone' | 'furniture' | 'buildings';
export const DECOR_GROUPS: readonly { id: DecorGroup; name: string }[] = [
  { id: 'plants', name: 'Plants' }, { id: 'water', name: 'Water' }, { id: 'stone', name: 'Stone' }, { id: 'furniture', name: 'Furniture' }, { id: 'buildings', name: 'Buildings' },
];

/** a catalogue item: its key (saved with the prop), plain name, group, library picture (the NE view of four-view art), price ($), appeal (a
 *  fraction), its size (absent: the studio's or the library's own) and, for a stand-in picture, the real thing it stands in for (the card and the
 *  map's pill say "Stand In for <standIn>": the art is requested in docs/GOLF-SPRITES.md "Props kit") */
export interface DecorItem { key: string; name: string; group: DecorGroup; kind: DecorKind; id: string; price: number; appeal: number; scale?: number; standIn?: string; desc: string; /** T229: not in the panel's catalogue (a frame tree: Frame with trees plants it; its picture is any frame tree) */ hidden?: true;
  /** T231: one-view art with several pictures (the kit's shrubs, mums, palms, boulders): R steps to the next one; nothing is turned or mirrored */
  variants?: readonly string[];
  /** T231: a run (the hedge, like the fences): a drag lays its pieces end to end along the map's x or y axis; price is a piece's */
  run?: RunKit;
  /** T231: placeable only in water (the fountain jet): every spot of its footprint on a pond, a lake or the course's water */
  water?: 'in';
  /** T231: a pond action: 'edge' gives the pond under the cursor its stone edge (price a piece, a boulder or a plant; again: back to Natural), 'make' digs a round
   *  Fountain pond (water, its stone edge and a jet) */
  pond?: 'edge' | 'make';
  /** what the price is for, when not the item ("a stone", "a piece") */
  per?: string }

/** the kinds the diminishing returns count by (T132): each further prop of a kind near the range counts PROPS_DECAY of the one before, so a
 *  row of one cheap plant cannot dress the whole front: plants (all nine), water (fountains, wells), statues, stonework (pillars, arches),
 *  seats (benches, tables), small things (trolleys, bins, lamps) and signs (the welcome board, flag poles) */
export type DecorKind = 'plant' | 'water' | 'statue' | 'stone' | 'seat' | 'small' | 'sign';
/** what each further prop of the same kind counts, of the one before it (the best of a kind counts in full) */
export const PROPS_DECAY = 0.8;

/** the appeal of each item type (plan P24 Phase 3, rebalanced in T132 with the diminishing returns: a fountain is the front's centrepiece) */
export const APPEAL = { plant: 0.01, fountain: 0.15, well: 0.03, statue: 0.08, pillar: 0.015, arch: 0.025, bench: 0.01, seatBig: 0.015, small: 0.005, board: 0.03, flagpole: 0.015,
  // T231: the concept kit. A jet in a pond is a smaller centrepiece than the tiered fountain (a Fountain pond's appeal is its jet's); boulders count with
  // the stonework by size; a hedge piece as half a plant (a row of them is one hedge); the lamps as the small things
  jet: 0.06, boulder: 0.01, boulderBig: 0.015, boulderLarge: 0.02, hedge: 0.005, pondEdge: 0.02 } as const;

/** T231: the Fountain pond's radius (tiles: 10 m across) and what a stone of a pond's edge costs ($) */
export const POND_R = 3.5, STONE_PRICE = 60;

/** the catalogue: real library art (the Trees & plants, Landscaping, Street furniture, Yard and Landmarks categories, T113's golf props) and labelled
 *  stand-ins. T154: the art model's new shrubs, beds, bench, bin and lamp post are screen-axis sets (axis-library.ts: four genuine quarter turns, R
 *  turns them); their catalogue picture is the N view (the front facing screen down) */
export const DECOR: readonly DecorItem[] = [
  // ---- plants: +1% each, one kind (each more counts less)
  { key: 'pot-terracotta', name: 'Terracotta pot plant', group: 'plants', kind: 'plant', id: 'town:planter_terracotta', price: 120, appeal: APPEAL.plant, desc: 'A clipped shrub in a terracotta pot: line the shop front' },
  { key: 'pot-palm', name: 'Potted palm', group: 'plants', kind: 'plant', id: 'arcade:arcade_v2_clutter_plant', price: 90, appeal: APPEAL.plant, desc: 'A leafy palm in a pot, for doors and corners' },
  { key: 'planter-stone', name: 'Stone planter box', group: 'plants', kind: 'plant', id: 'town:planter_square', price: 250, appeal: APPEAL.plant, desc: 'A square civic planter in stone' },
  { key: 'shrub-hydrangea', name: 'Hydrangea shrub', group: 'plants', kind: 'plant', id: 'town:hydrangea', price: 60, appeal: APPEAL.plant, desc: 'An ornamental flowering shrub' },
  { key: 'grass-ornamental', name: 'Ornamental grass', group: 'plants', kind: 'plant', id: 'town:ornamental_grass', price: 50, appeal: APPEAL.plant, desc: 'A tall clump of ornamental grass' },
  { key: 'fern', name: 'Fern clump', group: 'plants', kind: 'plant', id: 'town:fern', price: 50, appeal: APPEAL.plant, desc: 'A soft green fern for shady beds' },
  { key: 'hedge', name: 'Clipped hedge', group: 'plants', kind: 'plant', id: 'world:hedge', price: 80, appeal: APPEAL.plant, desc: 'A low box hedge: edge a path or a bed' },
  { key: 'flower-bed', name: 'Flower bed', group: 'plants', kind: 'plant', id: 'landscape:flowerbed-daisies', price: 150, appeal: APPEAL.plant, desc: 'A bed of white daisies in a timber edge' },
  { key: 'flower-bed-lavender', name: 'Lavender bed', group: 'plants', kind: 'plant', id: 'landscape:flowerbed-lavender', price: 160, appeal: APPEAL.plant, desc: 'A bed of lavender: colour and scent by the path' },
  { key: 'flower-bed-marigold', name: 'Marigold bed', group: 'plants', kind: 'plant', id: 'landscape:flowerbed-marigolds', price: 150, appeal: APPEAL.plant, desc: 'A bed of orange marigolds' },
  { key: 'bush-green', name: 'Deep green bush', group: 'plants', kind: 'plant', id: 'landscape:bush-deep-green', price: 70, appeal: APPEAL.plant, desc: 'A dense evergreen bush' },
  { key: 'bush-russet', name: 'Golden russet bush', group: 'plants', kind: 'plant', id: 'landscape:bush-golden-russet', price: 70, appeal: APPEAL.plant, desc: 'A bush in autumn gold and russet' },
  { key: 'bush-sage', name: 'Sage bush', group: 'plants', kind: 'plant', id: 'landscape:bush-sage-round', price: 70, appeal: APPEAL.plant, desc: 'A round soft sage-green bush' },
  { key: 'hydrangea-pale', name: 'Pale hydrangea', group: 'plants', kind: 'plant', id: 'landscape:hydrangea-pale', price: 80, appeal: APPEAL.plant, desc: 'A hydrangea in pale blooms' },
  { key: 'tree-maple', name: 'Ornamental maple', group: 'plants', kind: 'plant', id: 'ref:tree-maple-crimson', price: 300, appeal: APPEAL.plant, desc: 'A crimson maple for shade and colour' },
  // T229: a tree of a hole's frame (the hole card's and New hole's Frame with trees, golf/holeframe.ts): a plant as the others (its appeal near the
  //       range, half its price back when bulldozed); not in the panel (hidden): its picture is whichever conifer or autumn tree the frame dealt
  { key: FRAME_TREE_KEY, name: 'Course tree', group: 'plants', kind: 'plant', id: 'gen:tree-maple-scarlet:ne', price: FRAME_TREE_PRICE, appeal: APPEAL.plant, hidden: true, desc: "A tree of a hole's frame: conifers and autumn broadleaves along the rough's edge" },
  // T231: the concept kit (kit.ts): one-view pictures, R steps through the kind's pictures; the hedge is a run (drag it like a fence)
  { key: 'kit-shrub', name: 'Autumn shrub', group: 'plants', kind: 'plant', id: KIT_SHRUBS[0], variants: KIT_SHRUBS, price: 90, appeal: APPEAL.plant, desc: 'Burning bush, golden spirea, boxwood, dogwood, juniper or plume grass (R: the next)' },
  { key: 'kit-mums', name: 'Mum clump', group: 'plants', kind: 'plant', id: KIT_FLOWERS[0], variants: KIT_FLOWERS, price: 50, appeal: APPEAL.plant, desc: 'Chrysanthemums in red, yellow, orange, white or bronze, or black-eyed Susans (R: the next)' },
  { key: 'kit-hedge', name: 'Hedge row', group: 'plants', kind: 'plant', id: KIT_HEDGE.x, run: KIT_HEDGE, price: 70, per: 'a piece', appeal: APPEAL.hedge, desc: 'A clipped box hedge: drag along a path or a bed to lay it, 4 m a piece' },
  { key: 'kit-palm-windmill', name: 'Windmill palm', group: 'plants', kind: 'plant', id: KIT_PALMS.windmill[0], variants: KIT_PALMS.windmill, price: 350, appeal: APPEAL.plant, desc: 'A hardy fan palm, 4 to 6 m (R: the next)' },
  { key: 'kit-palm-canary', name: 'Canary palm', group: 'plants', kind: 'plant', id: KIT_PALMS.canary[0], variants: KIT_PALMS.canary, price: 650, appeal: APPEAL.plant, desc: 'A Canary Island date palm, 6 to 10 m (R: the next)' },
  { key: 'kit-palm-fan', name: 'Dwarf fan palm', group: 'plants', kind: 'plant', id: KIT_PALMS.fan[0], variants: KIT_PALMS.fan, price: 250, appeal: APPEAL.plant, desc: 'A clump of dwarf fan palms, 2 to 3.5 m (R: the next)' },
  // ---- water
  { key: 'fountain', name: 'Plaza fountain', group: 'water', kind: 'water', id: 'ref:landmark-fountain-v2', price: 12000, appeal: APPEAL.fountain, desc: 'A tiered stone fountain: the centrepiece of the front' },
  { key: 'well', name: 'Wishing well', group: 'water', kind: 'water', id: 'expansion:wooden-well', price: 1200, appeal: APPEAL.well, desc: 'A covered garden well: golfers toss a coin for luck' },
  // T231: the ponds (golf/ponds.ts): a jet in the water, a round pond with its jet and stones, and a stone edge for any pond
  { key: 'kit-fountain', name: 'Fountain jet', group: 'water', kind: 'water', id: KIT_FOUNTAIN[0], water: 'in', price: 3500, appeal: APPEAL.jet, desc: 'A tall jet of water: only in a pond or a lake' },
  { key: 'kit-pond', name: 'Fountain pond', group: 'water', kind: 'water', id: KIT_POND_EDGE.outer, pond: 'make', price: 9000, appeal: APPEAL.jet, desc: 'A round pond 14 m across with a stone edge and a jet: for the clubhouse or a square' },
  { key: 'kit-pond-stones', name: 'Stone pond edge', group: 'water', kind: 'stone', id: KIT_POND_EDGE.x, pond: 'edge', price: STONE_PRICE, per: 'a piece', appeal: APPEAL.pondEdge, desc: "Big boulders round a pond's shore with planting between them, and lily pads on its water; click the pond again for its natural edge" },
  // ---- stone
  { key: 'statue', name: 'Golfer statue', group: 'stone', kind: 'statue', id: 'expansion:coin-horse-ride', price: 6000, appeal: APPEAL.statue, standIn: 'Bronze golfer statue', desc: 'A bronze golfer at the top of his swing, on a stone plinth' },
  { key: 'pillar', name: 'Stone pillar', group: 'stone', kind: 'stone', id: 'world:grave_2', price: 400, appeal: APPEAL.pillar, standIn: 'Stone pillar', desc: 'A dressed stone column with a ball finial: pair them at a gate' },
  { key: 'arch', name: 'Ivy garden arch', group: 'stone', kind: 'stone', id: 'expansion:ivy-arbor', price: 900, appeal: APPEAL.arch, desc: 'An arbor grown over with ivy: an entrance to walk through' },
  // T231: rock features (36): three sizes, three shapes each (R: the next)
  { key: 'kit-boulder-s', name: 'Small boulder', group: 'stone', kind: 'stone', id: KIT_BOULDERS.small[0], variants: KIT_BOULDERS.small, price: 150, appeal: APPEAL.boulder, desc: 'A weathered sandstone boulder, 0.8 m, lichen and moss (R: another shape)' },
  { key: 'kit-boulder-m', name: 'Boulder', group: 'stone', kind: 'stone', id: KIT_BOULDERS.medium[0], variants: KIT_BOULDERS.medium, price: 350, appeal: APPEAL.boulderBig, desc: 'A sandstone boulder, 1.5 m: a rock feature by a green or a path (R: another shape)' },
  { key: 'kit-boulder-l', name: 'Large boulder', group: 'stone', kind: 'stone', id: KIT_BOULDERS.large[0], variants: KIT_BOULDERS.large, price: 800, appeal: APPEAL.boulderLarge, desc: 'A big sandstone rock, 2.5 m, for a practice area or the entrance (R: another shape)' },
  // ---- furniture: seats +1% (the map bench +1.5%), small things +0.5%, signs (the board +3%, a flag pole +1.5%)
  { key: 'bench', name: 'Park bench', group: 'furniture', kind: 'seat', id: 'view:world:bench:n', price: 300, appeal: APPEAL.bench, desc: 'A slatted bench to watch the golfers from' },
  { key: 'bench-map', name: 'Course-map bench', group: 'furniture', kind: 'seat', id: 'business:golf-bench-course-map', price: 600, appeal: APPEAL.seatBig, desc: 'A bench beside a board with the course map' },
  { key: 'picnic', name: 'Picnic table', group: 'furniture', kind: 'seat', id: 'town:picnic_table', price: 450, appeal: APPEAL.bench, desc: 'A timber table for the family day out' },
  { key: 'trolley', name: 'Bag trolley', group: 'furniture', kind: 'small', id: 'business:golf-bag-trolley', price: 150, appeal: APPEAL.small, desc: 'A golf bag on its trolley, parked for show' },
  { key: 'bin', name: 'Litter bin', group: 'furniture', kind: 'small', id: 'view:world:trashcan:n', price: 80, appeal: APPEAL.small, desc: 'A tidy front is a busy front' },
  { key: 'lamp', name: 'Lamp post', group: 'furniture', kind: 'small', id: 'view:world:streetlamp:n', price: 350, appeal: APPEAL.small, desc: 'Lit at night' },
  // T231: the practice green's lamp posts (45): cast iron, glass lanterns, lit at night
  { key: 'kit-lamp', name: 'Practice green lamp', group: 'furniture', kind: 'small', id: KIT_LAMPS[0], price: 450, appeal: APPEAL.small, desc: 'A green cast-iron lamp post with a lantern, 3.5 m: lit at night' },
  { key: 'kit-lamp-twin', name: 'Twin lamp post', group: 'furniture', kind: 'small', id: KIT_LAMPS[1], price: 650, appeal: APPEAL.small, desc: 'A cast-iron lamp post with two lanterns: lit at night' },
  { key: 'board', name: 'Welcome board', group: 'furniture', kind: 'sign', id: 'golf:leaderboard', price: 2500, appeal: APPEAL.board, scale: 0.45, desc: 'A tall board to greet golfers at the drive: four views' },
  { key: 'flagpole', name: 'Flag pole', group: 'furniture', kind: 'sign', id: 'business:golf-pin-red', price: 500, appeal: APPEAL.flagpole, scale: 0.6, standIn: 'Club flag pole', desc: 'A tall white pole flying the club flag' },
  // ---- the town's buildings (T187, Town decoration › Buildings; the owner: "a few buildings that you can add to the town"): the library's own
  //      art only. Decoration: the game models no town attractiveness or land value for them to raise, so they add nothing but the look (appeal 0;
  //      the range's appeal counts the props near it alone). A bandstand (the library's gazebo is a stand-in), a statue and a town hall annex
//      have no art yet (docs/GOLF-SPRITES.md "Town buildings")
  { key: 'town-fountain', name: 'Park fountain', group: 'buildings', kind: 'water', id: 'ref:landmark-fountain-v2', price: 12000, appeal: 0, desc: 'A tiered stone fountain for a square or a park corner' },
  { key: 'bus-shelter', name: 'Bus shelter', group: 'buildings', kind: 'small', id: 'town:bus_stop', price: 1500, appeal: 0, desc: 'A covered bench by the road for the bus' },
  { key: 'toilet-block', name: 'Public toilets', group: 'buildings', kind: 'stone', id: 'golf:toilet-block', price: 9000, appeal: 0, desc: 'A small toilet block for a park or a square' },
  { key: 'chapel', name: 'Small chapel', group: 'buildings', kind: 'stone', id: 'variation:world-church-44e76535-plain:1', price: 60000, appeal: 0, desc: 'A white clapboard chapel with its steeple' },
];
export const DECOR_BY_KEY: ReadonlyMap<string, DecorItem> = new Map(DECOR.map(d => [d.key, d]));

// ---------------------------------------------------------------- the place (T187: props by place)

/** where a prop belongs: the course (Decoration), the town (Town decoration) or both */
export type DecorPlace = 'course' | 'town' | 'both';
/** a prop's place by its picture's library category (the small table T187 asked for; a category not listed belongs to both): street and park
 *  things are both's; golf's and the stand-ins' own the course's */
export const CAT_PLACE: Readonly<Record<string, DecorPlace>> = {
  'Street furniture': 'both', 'Trees & plants': 'both', 'Landscaping': 'both', 'Arcade': 'both', 'Yard': 'both', 'Landmarks': 'both',
  'Business artwork': 'course', 'Golf tournament': 'course', 'Odds & ends': 'course', 'Halloween': 'course',
};
const CAT_OF = new Map(LIBRARY.map(i => [i.id, i.cat]));
/** an item's place: a town building is the town's; else its picture's category's (CAT_PLACE), both when its category is not listed */
export function placeOf(d: Pick<DecorItem, 'group' | 'id'>): DecorPlace {
  if (d.group === 'buildings') return 'town';
  return CAT_PLACE[CAT_OF.get(d.id) ?? ''] ?? 'both';
}
/** whether an item shows in a view's catalogue: its place is the view's or both (all: every item, the panel's All) */
export const shownIn = (d: Pick<DecorItem, 'group' | 'id'>, view: 'course' | 'town', all = false): boolean => all || placeOf(d) === 'both' || placeOf(d) === view;
/** where an item placed from a view stands: its own place, or the view's for an item of both */
export const standsIn = (d: Pick<DecorItem, 'group' | 'id'>, view: 'course' | 'town'): 'course' | 'town' => { const p = placeOf(d); return p === 'both' ? view : p; };

/** what selling a prop gives back: half its price */
export const sellBack = (d: DecorItem): number => Math.round(d.price / 2);
/** a loaded prop's catalogue key, or null when it is not one (an old save, a renamed item) */
export const decorKeyOf = (x: unknown): string | null => (typeof x === 'string' && DECOR_BY_KEY.has(x) ? x : null);
/** the group names the panel and the Select panel use */
const GROUP_NAME: Readonly<Record<DecorGroup, string>> = Object.fromEntries(DECOR_GROUPS.map(g => [g.id, g.name])) as Record<DecorGroup, string>;
/** what the Select panel shows of a Props tool prop (T132: its catalogue name, not the library picture's), or null for any other prop */
export function decorInfo(key: string | undefined): { name: string; group: string; price: number; sell: number; standIn?: string } | null {
  const d = key ? DECOR_BY_KEY.get(key) : undefined; if (!d) return null;
  return { name: d.name, group: GROUP_NAME[d.group], price: d.price, sell: sellBack(d), ...(d.standIn ? { standIn: d.standIn } : {}) };
}

// ---------------------------------------------------------------- appeal

/** a prop counts for the range within this many tiles of its shop or any of its mats */
export const PROPS_APPEAL_RADIUS = 15;
/** the appeal of a kind's props (their appeals, any order): the best counts in full, each further one PROPS_DECAY of the one before */
export function kindAppeal(appeals: readonly number[]): number {
  let sum = 0, k = 1;
  for (const a of [...appeals].sort((x, y) => y - x)) { sum += a * k; k *= PROPS_DECAY; }
  return sum;
}
/** the appeal the placed props add to the range (plan P24 Phase 3; the diminishing returns T132): each prop within PROPS_APPEAL_RADIUS of an
 *  anchor (the shop, the mats) counts once, by kind with diminishing returns (kindAppeal); the sum is capped at PROPS_APPEAL_CAP. Unknown keys
 *  count nothing */
export function decorAppeal(placed: Iterable<{ key: string; x: number; y: number }>, anchors: readonly Pt[]): number {
  return Math.min(PROPS_APPEAL_CAP, Math.round(decorAppealRaw(placed, anchors) * 1e6) / 1e6);
}
/** decorAppeal before its cap */
function decorAppealRaw(placed: Iterable<{ key: string; x: number; y: number }>, anchors: readonly Pt[]): number {
  if (!anchors.length) return 0;
  const r2 = PROPS_APPEAL_RADIUS * PROPS_APPEAL_RADIUS, byKind = new Map<DecorKind, number[]>();
  for (const p of placed) {
    const d = DECOR_BY_KEY.get(p.key); if (!d) continue;
    if (!anchors.some(a => (a.x - p.x) ** 2 + (a.y - p.y) ** 2 <= r2)) continue;
    let l = byKind.get(d.kind); if (!l) byKind.set(d.kind, l = []); l.push(d.appeal);
  }
  let sum = 0; for (const l of byKind.values()) sum += kindAppeal(l);
  return sum;
}
/** what one more prop of key would add near the range now (its share after the diminishing returns and the cap; 0 off the range's reach) */
export function nextAppeal(placed: readonly { key: string; x: number; y: number }[], anchors: readonly Pt[], key: string, at?: Pt): number {
  if (!anchors.length || !DECOR_BY_KEY.has(key)) return 0;
  const p = at ?? anchors[0]!, now = decorAppeal(placed, anchors);
  return Math.max(0, decorAppeal([...placed, { key, x: p.x, y: p.y }], anchors) - now);
}
/** an appeal as the card says it: +12%, +0.5% */
export const appealText = (a: number): string => `+${Math.round(a * 1000) / 10}%`;

// ---------------------------------------------------------------- where a prop may stand

/** a footprint (tiles): x0 y0 x1 y1 */
export type Box = [number, number, number, number];
/** what the spot check needs to know of the map */
export interface DecorSpot {
  /** the tile is the player's (a golf parcel: the range plot, the practice area, the course) */
  owned(x: number, y: number): boolean;
  /** the box touches water (the map's or a course pond); a road, path, sidewalk or car park */
  water(b: Box): boolean; road(b: Box): boolean;
  /** what the course grid has at a tile: 'green', 'bunker' or '' */
  course(x: number, y: number): 'green' | 'bunker' | '';
  /** what the range's own ground is at a tile: 'mats' (the hitting deck), 'target' (a target green) or '' */
  range(x: number, y: number): 'mats' | 'target' | '';
  /** the name of a building or prop the box overlaps, or '' */
  overlaps(b: Box): string;
  /** T187: whether the box touches a town lot (the town's own ground: its houses grow there) */
  lot?(b: Box): boolean;
  /** T231: whether the tile point is water (a pond, a lake or the course's water): the fountain jet stands only there */
  wet?(x: number, y: number): boolean;
}
/** the points of a footprint the checks sample: its corners, edges' midpoints and centre, and a 0.5-tile lattice inside a big one */
function samples(b: Box): Pt[] {
  const out: Pt[] = [], e = 0.02, x0 = b[0] + e, y0 = b[1] + e, x1 = b[2] - e, y1 = b[3] - e;
  const nx = Math.max(2, Math.ceil((x1 - x0) / 0.5)), ny = Math.max(2, Math.ceil((y1 - y0) / 0.5));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) out.push({ x: x0 + (x1 - x0) * i / nx, y: y0 + (y1 - y0) * j / ny });
  return out;
}
/** why a prop of footprint b cannot stand there ('' when it can), in the order a player fixes them: the land first, then what is in the way */
export function decorSpotWhy(b: Box, s: DecorSpot, place: 'course' | 'town' = 'course', inWater = false): string {
  const pts = samples(b);
  // T231: a fountain jet stands in water, every spot of it: on your land's water from the course, in the town's (off your land) from the town
  if (inWater) {
    if (!s.wet || !pts.every(p => s.wet!(p.x, p.y))) return 'Only in water: a pond or a lake';
    if (place === 'town' ? pts.some(p => s.owned(p.x, p.y)) : !pts.every(p => s.owned(p.x, p.y))) return place === 'town' ? 'In the town: off your land (the course has its own decoration)' : 'Only on your land: the range, the practice area and the course';
    const o = s.overlaps(b); if (o) return `Overlaps ${o}`;
    return '';
  }
  // T187: a town prop or building stands in the town, off your land and off the town's lots (its houses grow there): on the grass between them
  if (place === 'town') {
    if (pts.some(p => s.owned(p.x, p.y))) return 'In the town: off your land (the course has its own decoration)';
    if (s.water(b)) return 'Not on water';
    if (s.road(b)) return 'Not on a road, path or car park';
    if (s.lot?.(b)) return "Not on a town lot (the town's houses grow there): on the park and verge grass between them";
    const o = s.overlaps(b); if (o) return `Overlaps ${o}`;
    return '';
  }
  if (!pts.every(p => s.owned(p.x, p.y))) return 'Only on your land: the range, the practice area and the course';
  if (s.water(b)) return 'Not on water';
  if (s.road(b)) return 'Not on a road, path or car park';
  for (const p of pts) {
    const c = s.course(p.x, p.y); if (c === 'green') return 'Not on a green'; if (c === 'bunker') return 'Not in a bunker';
    const r = s.range(p.x, p.y); if (r === 'mats') return 'Not on the hitting mats'; if (r === 'target') return 'Not on a target green';
  }
  const o = s.overlaps(b); if (o) return `Overlaps ${o}`;
  return '';
}

/** whether a box touches any of the lots (origin o, frontage u and depth n unit vectors, width w and depth d: the town's lots as City keeps them):
 *  a corner or the centre of the box in a lot, or a corner of a lot in the box (T187) */
export function lotTouches(lots: Iterable<{ o: ArrayLike<number>; u: ArrayLike<number>; n: ArrayLike<number>; w: number; d: number }>, b: Box): boolean {
  const pts = [b[0], b[1], b[2], b[1], b[2], b[3], b[0], b[3], (b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  for (const l of lots) {
    const ox = l.o[0]!, oy = l.o[1]!, ux = l.u[0]! * l.w, uy = l.u[1]! * l.w, nx = l.n[0]! * l.d, ny = l.n[1]! * l.d;
    const q = [ox, oy, ox + ux, oy + uy, ox + ux + nx, oy + uy + ny, ox + nx, oy + ny];
    if (Math.max(q[0]!, q[2]!, q[4]!, q[6]!) < b[0] || Math.min(q[0]!, q[2]!, q[4]!, q[6]!) > b[2] || Math.max(q[1]!, q[3]!, q[5]!, q[7]!) < b[1] || Math.min(q[1]!, q[3]!, q[5]!, q[7]!) > b[3]) continue;
    for (let k = 0; k < pts.length; k += 2) if (inPoly(q, pts[k]!, pts[k + 1]!)) return true;
    for (let k = 0; k < 8; k += 2) if (q[k]! > b[0] && q[k]! < b[2] && q[k + 1]! > b[1] && q[k + 1]! < b[3]) return true;
  }
  return false;
}

/** whether point (x, y) is inside polygon pts (flat x y pairs) */
export function inPoly(pts: readonly number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i]!, yi = pts[i + 1]!, xj = pts[j]!, yj = pts[j + 1]!;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------- the save

/** a placed prop as the save keeps it: library id, x, y, flip, scale; then 1 for a plant brush's prop, or 0 and the catalogue key for a Props
 *  tool prop (T131), and for a frame tree the hole it frames (T229). An old save's tuples (five to seven long) read the same */
export type PropTuple = [string, number, number, number, number, (0 | 1)?, string?, number?];
export function propTuple(id: string, p: { x: number; y: number; flip: boolean; scale: number; plant?: 1; decor?: string; frame?: number }): PropTuple {
  const t: PropTuple = [id, +p.x.toFixed(3), +p.y.toFixed(3), p.flip ? 1 : 0, p.scale];
  if (p.decor) { t.push(0, p.decor); if (p.frame) t.push(p.frame); } else if (p.plant) t.push(1);
  return t;
}
/** what a saved tuple adds to its prop: the plant mark, the catalogue key (an unknown key is dropped: the prop loads as a plain prop) and a frame
 *  tree's hole (a whole number 1..99, with its catalogue key) */
export function tupleMarks(t: readonly unknown[]): { plant?: 1; decor?: string; frame?: number } {
  const out: { plant?: 1; decor?: string; frame?: number } = {};
  if (t[5] === 1) out.plant = 1;
  const k = decorKeyOf(t[6]); if (k) out.decor = k;
  const h = t[7]; if (k && typeof h === 'number' && Number.isInteger(h) && h >= 1 && h <= 99) out.frame = h;
  return out;
}

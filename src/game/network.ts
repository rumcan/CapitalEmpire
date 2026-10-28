import { MAP, mulberry } from './iso';
import type { LineStyle } from './types';
/** a road's surface; dirt and cement: the course's starter cart paths (T084: packed dirt, cement slabs with a joint every 3 m) */
export type Surface = 'asphalt' | 'asphaltDark' | 'asphaltWorn' | 'gravel' | 'dirt' | 'cement';
/** a verge's surface; turf: no verge drawn, the grass runs up to the edge (the cart paths, T084) */
export type WalkKind = 'slabs' | 'gravel' | 'turf';

/* ---------- road classes ---------- */
/** a class id: a type id plus its variant flags joined with dots ('street', 'arterial.tl.tr'); see the catalogue below */
export type ClassId = string;
/** the road types (one row of the catalogue each) */
export type TypeId = 'gravel' | 'lane' | 'street' | 'road' | 'avenue' | 'arterial' | 'boulevard' | 'six' | 'grand' | 'divided' | 'drive-gravel' | 'drive' | 'drive-avenue' | 'cart-walk' | 'cart-dirt' | 'cart-slab' | 'cart';
/** the size family a type sits in (the road tool's headers); course: the golf course's drives (P19); cart: its cart paths (P19, T084) */
export type Family = 'small' | 'medium' | 'large' | 'rural' | 'course' | 'cart';
export type NodeType = 'plain' | 'stop' | 'mini' | 'signal' | 'slip' | 'roundabout';
export interface Pt { x: number; y: number }
export interface Leg { a: Pt; b: Pt }
export type BBox = [number, number, number, number];

export interface RoadClass {
  id: ClassId; name: string; desc: string;
  /** the type this class is a variant of (the plain type's id) */
  base: TypeId;
  /** the variant flags in id order: ow one-way, tl turn lane, tr street trees, gr grass median */
  flags: string[];
  family: Family;
  /** speed limit, m/s */
  vmax: number;
  /** asphalt half width (tiles of 2 m) */
  h: number;
  /** verge / sidewalk width and kind */
  walk: number; walkTex: WalkKind;
  /** planted median width (0 = none) */
  median: number;
  /** paved shoulder width inside the yellow edge line (0 = none) */
  shoulder: number;
  tex: Surface;
  rConcave: number;
  /** extra radius of the dead-end turning circle */
  bulb: number;
  cost: number; order: number; crosswalk: boolean;
  /** offsets of the dashed white lane dividers (a two-way road mirrors them; a one-way road draws them as they are) */
  laneLines: number[];
  /** one-way: the flow runs from seg.a to seg.b, lanes across the whole width, no centre line */
  oneway: boolean;
  /** a planted median gets trees */
  medianTrees: boolean;
  /** trees along both sidewalks */
  streetTrees: boolean;
  centre: 'style' | 'dashed' | 'none' | 'double' | 'twltl';
  laneCentres: number[];
  /** a course road: no town lots grow along it (P19) */
  noLots?: boolean;
  /** a garden median: shrubs and flower beds instead of trees (P19) */
  medianGarden?: boolean;
  /** a cart path (P19, T084): no traffic lanes (laneCentres is empty), so no car routes over it and no car park opens onto it; carts and
   *  walkers only */
  noCars?: boolean;
}
/** the plain road types: the seven presets (their numbers are the saved game's, do not change them) and the three new ones */
const PLAIN: RoadClass[] = [
  { id: 'gravel', name: 'Gravel', desc: 'Unpaved · 1 lane each way · 5 m · dusty', base: 'gravel', flags: [], family: 'small', vmax: 8.333, h: 1.25, walk: 0.35, walkTex: 'gravel', median: 0, shoulder: 0, tex: 'gravel', rConcave: 1.2, bulb: 0.6, cost: 40, order: -1, crosswalk: false, laneLines: [], oneway: false, medianTrees: false, streetTrees: false, centre: 'none', laneCentres: [0.62] },
  { id: 'lane', name: 'Lane', desc: 'Single lane · 4 m · footpath', base: 'lane', flags: [], family: 'small', vmax: 8.333, h: 1, walk: 0.6, walkTex: 'slabs', median: 0, shoulder: 0, tex: 'asphaltWorn', rConcave: 0.8, bulb: 0, cost: 70, order: 0, crosswalk: false, laneLines: [], oneway: false, medianTrees: false, streetTrees: false, centre: 'none', laneCentres: [0] },
  { id: 'street', name: 'Street', desc: '2 lanes · 6.5 m · sidewalks', base: 'street', flags: [], family: 'small', vmax: 11.111, h: 1.625, walk: 1.025, walkTex: 'slabs', median: 0, shoulder: 0, tex: 'asphalt', rConcave: 1.75, bulb: 1, cost: 150, order: 1, crosswalk: true, laneLines: [], oneway: false, medianTrees: false, streetTrees: false, centre: 'style', laneCentres: [0.8] },
  { id: 'road', name: 'Road', desc: '2 lanes + shoulders · 12 m · yellow edge lines', base: 'road', flags: [], family: 'rural', vmax: 16.667, h: 3, walk: 0.75, walkTex: 'gravel', median: 0, shoulder: 1, tex: 'asphaltDark', rConcave: 2.5, bulb: 0, cost: 220, order: 2, crosswalk: false, laneLines: [], oneway: false, medianTrees: false, streetTrees: false, centre: 'dashed', laneCentres: [1] },
  { id: 'avenue', name: 'Avenue', desc: '2 lanes · tree-lined median · 14 m', base: 'avenue', flags: [], family: 'medium', vmax: 13.889, h: 3.5, walk: 1.025, walkTex: 'slabs', median: 2, shoulder: 0, tex: 'asphaltDark', rConcave: 2.5, bulb: 1, cost: 320, order: 3, crosswalk: true, laneLines: [], oneway: false, medianTrees: true, streetTrees: false, centre: 'none', laneCentres: [2.25] },
  { id: 'arterial', name: 'Arterial', desc: '4 lanes · no median · 16 m', base: 'arterial', flags: [], family: 'medium', vmax: 16.667, h: 4, walk: 1.025, walkTex: 'slabs', median: 0, shoulder: 0, tex: 'asphaltDark', rConcave: 2.75, bulb: 1, cost: 400, order: 3, crosswalk: true, laneLines: [2], oneway: false, medianTrees: false, streetTrees: false, centre: 'style', laneCentres: [1, 3] },
  { id: 'boulevard', name: 'Boulevard', desc: '4 lanes · tree-lined median · 20 m', base: 'boulevard', flags: [], family: 'large', vmax: 19.444, h: 5, walk: 1.025, walkTex: 'slabs', median: 2, shoulder: 0, tex: 'asphaltDark', rConcave: 3, bulb: 1, cost: 480, order: 4, crosswalk: true, laneLines: [3], oneway: false, medianTrees: true, streetTrees: false, centre: 'none', laneCentres: [2, 4] },
  { id: 'six', name: 'Six-lane', desc: '6 lanes · painted median · 22 m', base: 'six', flags: [], family: 'large', vmax: 22.222, h: 5.5, walk: 1.025, walkTex: 'slabs', median: 0, shoulder: 0, tex: 'asphaltDark', rConcave: 3, bulb: 1, cost: 560, order: 4, crosswalk: true, laneLines: [2, 3.75], oneway: false, medianTrees: false, streetTrees: false, centre: 'double', laneCentres: [1.125, 2.875, 4.625] },
  { id: 'grand', name: 'Grand boulevard', desc: '6 lanes · tree-lined median · 25 m', base: 'grand', flags: [], family: 'large', vmax: 25.0, h: 6.25, walk: 1.025, walkTex: 'slabs', median: 2, shoulder: 0, tex: 'asphaltDark', rConcave: 3.25, bulb: 1, cost: 620, order: 4, crosswalk: true, laneLines: [2.75, 4.5], oneway: false, medianTrees: true, streetTrees: false, centre: 'none', laneCentres: [1.875, 3.625, 5.375] },
  { id: 'divided', name: 'Divided road', desc: '4 lanes · grass median · shoulders · 24 m', base: 'divided', flags: [], family: 'rural', vmax: 22.222, h: 6, walk: 0.75, walkTex: 'gravel', median: 3, shoulder: 1, tex: 'asphaltDark', rConcave: 3, bulb: 0, cost: 520, order: 3, crosswalk: false, laneLines: [3.25], oneway: false, medianTrees: false, streetTrees: false, centre: 'none', laneCentres: [2.375, 4.125] },
  // the golf course's drives (P19): a miniature of the road catalogue, no town lots along them (noLots)
  { id: 'drive-gravel', name: 'Gravel drive', desc: 'Course drive · single lane · 4 m · gravel', base: 'drive-gravel', flags: [], family: 'course', noLots: true, vmax: 6.944, h: 1, walk: 0.4, walkTex: 'gravel', median: 0, shoulder: 0, tex: 'gravel', rConcave: 0.8, bulb: 0.5, cost: 30, order: 0, crosswalk: false, laneLines: [], oneway: false, medianTrees: false, streetTrees: false, centre: 'none', laneCentres: [0] },
  { id: 'drive', name: 'Paved drive', desc: 'Course drive · single lane · 4 m · kerbed', base: 'drive', flags: [], family: 'course', noLots: true, vmax: 8.333, h: 1, walk: 0.6, walkTex: 'slabs', median: 0, shoulder: 0, tex: 'asphalt', rConcave: 0.8, bulb: 0.5, cost: 90, order: 0, crosswalk: false, laneLines: [], oneway: false, medianTrees: false, streetTrees: false, centre: 'none', laneCentres: [0] },
  { id: 'drive-avenue', name: 'Avenue drive', desc: 'Course drive · 1 lane each way · tree-lined median · 9 m', base: 'drive-avenue', flags: [], family: 'course', noLots: true, vmax: 8.333, h: 2.25, walk: 0.6, walkTex: 'slabs', median: 1.25, shoulder: 0, tex: 'asphaltDark', rConcave: 1.5, bulb: 0.5, cost: 220, order: 0, crosswalk: false, laneLines: [], oneway: false, medianTrees: true, streetTrees: false, centre: 'none', laneCentres: [1.45] },
  // the golf course's cart paths (P19, T084): carts and walkers only (noCars: no lanes), no lots. Real widths 2, 2.5 and 3 m (h is the half width
  // in tiles of 2 m), a 0.4 m turf verge each side (the frontage snap's clearance); painted under every road (order -2). The walking path (T100):
  // 1.2 m of packed earth for the narrow routes between greens and tees, drawn on the course's 1 m half grid, the cheapest; no wheel ruts
  { id: 'cart-walk', name: 'Walking path', desc: 'Footpath · 1.2 m · packed earth', base: 'cart-walk', flags: [], family: 'cart', noLots: true, noCars: true, vmax: 1.4, h: 0.3, walk: 0.15, walkTex: 'turf', median: 0, shoulder: 0, tex: 'dirt', rConcave: 0.3, bulb: 0.15, cost: 4, order: -2, crosswalk: false, laneLines: [], oneway: false, medianTrees: false, streetTrees: false, centre: 'none', laneCentres: [] },
  { id: 'cart-dirt', name: 'Dirt path', desc: 'Cart path · 2 m · packed dirt', base: 'cart-dirt', flags: [], family: 'cart', noLots: true, noCars: true, vmax: 4.167, h: 0.5, walk: 0.2, walkTex: 'turf', median: 0, shoulder: 0, tex: 'dirt', rConcave: 0.5, bulb: 0.25, cost: 8, order: -2, crosswalk: false, laneLines: [], oneway: false, medianTrees: false, streetTrees: false, centre: 'none', laneCentres: [] },
  { id: 'cart-slab', name: 'Cement slab path', desc: 'Cart path · 2.5 m · cement slabs', base: 'cart-slab', flags: [], family: 'cart', noLots: true, noCars: true, vmax: 5.556, h: 0.625, walk: 0.2, walkTex: 'turf', median: 0, shoulder: 0, tex: 'cement', rConcave: 0.5, bulb: 0.25, cost: 20, order: -2, crosswalk: false, laneLines: [], oneway: false, medianTrees: false, streetTrees: false, centre: 'none', laneCentres: [] },
  { id: 'cart', name: 'Paved cart path', desc: 'Cart path · 3 m · asphalt', base: 'cart', flags: [], family: 'cart', noLots: true, noCars: true, vmax: 5.556, h: 0.75, walk: 0.2, walkTex: 'turf', median: 0, shoulder: 0, tex: 'asphalt', rConcave: 0.5, bulb: 0.25, cost: 45, order: -2, crosswalk: false, laneLines: [], oneway: false, medianTrees: false, streetTrees: false, centre: 'none', laneCentres: [] },
];
/** the lanes of a one-way type (keyed by its base): a lane for each direction of the two-way type, across the whole width */
const ONEWAY: Record<string, Partial<RoadClass>> = {
  street: { laneCentres: [-0.8, 0.8], laneLines: [0] },
  arterial: { laneCentres: [-3, -1, 1, 3], laneLines: [-2, 0, 2] },
  six: { laneCentres: [-4.625, -2.875, -1.125, 1.125, 2.875, 4.625], laneLines: [-3.75, -2, 0, 2, 3.75] },
};
/** the variant flags: each changes its class (the id gets the flags in order, e.g. arterial.tl.tr) */
const FLAG: Record<string, (c: RoadClass) => Partial<RoadClass>> = {
  tr: c => ({ streetTrees: true, cost: c.cost + 20, name: c.name + ' with trees', desc: c.desc + ' · trees' }),
  gr: c => ({ medianTrees: false, cost: c.cost - 20, name: c.name + ' (grass median)', desc: c.desc.replace('tree-lined', 'grass') }),
  gd: c => ({ medianTrees: false, medianGarden: true, cost: c.cost + 30, name: c.name + ' (garden median)', desc: c.desc.replace('tree-lined', 'garden') }),
  tl: () => ({ h: 4.875, laneCentres: [1.875, 3.875], laneLines: [2.875], centre: 'twltl', cost: 460, name: 'Arterial + turn lane', desc: '4 lanes · centre turn lane · 20 m' }),
  ow: c => {
    const lanes = ONEWAY[c.base]!.laneCentres!.length;
    const rest = c.desc.split(' · ').filter(p => !p.includes('median')).slice(1);
    return { oneway: true, centre: 'none', name: c.name + ' (one-way)', desc: [`${lanes} lanes one way`, ...rest].join(' · '), ...ONEWAY[c.base] };
  },
};
const applyFlag = (c: RoadClass, f: string): RoadClass => ({ ...c, ...FLAG[f]!(c), id: c.id + '.' + f, flags: [...c.flags, f] });
/** the variants that are built (the Tab key's list is VARIANTS) */
const BUILT: [TypeId, string[]][] = [['street', ['tr']], ['avenue', ['gr']], ['arterial', ['tl']], ['arterial', ['tr']], ['arterial', ['tl', 'tr']], ['boulevard', ['gr']], ['grand', ['gr']], ['street', ['ow']], ['arterial', ['ow']], ['six', ['ow']], ['street', ['ow', 'tr']], ['arterial', ['ow', 'tr']], ['drive', ['tr']], ['drive-avenue', ['gr']], ['drive-avenue', ['gd']]];
const PLAIN_BY_ID = Object.fromEntries(PLAIN.map(c => [c.id, c])) as Record<string, RoadClass>;
/** every road class: the plain types, then their variants */
export const CLASSES: RoadClass[] = [...PLAIN, ...BUILT.map(([t, fl]) => fl.reduce(applyFlag, PLAIN_BY_ID[t]!))];
/** every road class by id */
export const CLASS = Object.fromEntries(CLASSES.map(c => [c.id, c])) as Record<string, RoadClass>;
/** the class of a stored id (a save, a netop); an unknown id is a street */
export function classOf(id: string): RoadClass { return CLASS[id] ?? CLASS.street! }
/** the course's families (P19): its cart paths and its drives. They are built from the Course menu's Paths & drives, never the Roads panel (T084) */
export const COURSE_FAMILIES: readonly Family[] = ['cart', 'course'];
/** a class of the course's paths or drives (COURSE_FAMILIES) */
export function isCourseClass(id: ClassId): boolean { return COURSE_FAMILIES.includes(classOf(id).family); }
/** the golf tier a course road class opens at (P19, T084): the gravel drive and both starter cart paths (dirt, cement slabs) 1, the paved drive
 *  and the paved cart path 2, the avenue drives 3; null for any other class */
export function courseTierNeeded(id: ClassId): number | null {
  const c = classOf(id);
  if (c.family === 'cart') return c.base === 'cart' ? 2 : 1;
  return c.family !== 'course' ? null : c.base === 'drive' ? 2 : c.base === 'drive-avenue' ? 3 : 1;
}
/** a course path or drive is open to build (T084): every tier with the dev sandbox's unlock-all (sandbox: the dev server, or ?unlock=1), else only
 *  in a golf game (golfTier not null) at its golf tier (courseClassOpen) */
export function courseRoadOpen(id: ClassId, golfTier: number | null, sandbox: boolean): boolean { return sandbox || (golfTier !== null && courseClassOpen(id, golfTier)); }
/** a course road class is open at this golf tier (courseTierNeeded); any other class: true */
export function courseClassOpen(id: ClassId, tier: number): boolean { return (courseTierNeeded(id) ?? 0) <= tier }
/** the variant ids of each type, in Tab order (the road tool's Tab key cycles them) */
export const VARIANTS: Record<TypeId, string[]> = {
  gravel: ['gravel'], lane: ['lane'], street: ['street', 'street.ow', 'street.tr', 'street.ow.tr'], road: ['road'], avenue: ['avenue', 'avenue.gr'],
  arterial: ['arterial', 'arterial.ow', 'arterial.tl', 'arterial.tr', 'arterial.ow.tr', 'arterial.tl.tr'], boulevard: ['boulevard', 'boulevard.gr'], six: ['six', 'six.ow'], grand: ['grand', 'grand.gr'], divided: ['divided'],
  'drive-gravel': ['drive-gravel'], drive: ['drive', 'drive.tr'], 'drive-avenue': ['drive-avenue', 'drive-avenue.gr', 'drive-avenue.gd'],
  'cart-walk': ['cart-walk'], 'cart-dirt': ['cart-dirt'], 'cart-slab': ['cart-slab'], cart: ['cart'],
};
/** the road tool's palette by size family (gravel is in two families) */
export const TYPES: { id: TypeId; family: Family }[] = [
  { id: 'gravel', family: 'small' }, { id: 'lane', family: 'small' }, { id: 'street', family: 'small' },
  { id: 'avenue', family: 'medium' }, { id: 'arterial', family: 'medium' },
  { id: 'boulevard', family: 'large' }, { id: 'six', family: 'large' }, { id: 'grand', family: 'large' },
  { id: 'gravel', family: 'rural' }, { id: 'road', family: 'rural' }, { id: 'divided', family: 'rural' },
  { id: 'drive-gravel', family: 'course' }, { id: 'drive', family: 'course' }, { id: 'drive-avenue', family: 'course' },
  { id: 'cart-walk', family: 'cart' }, { id: 'cart-dirt', family: 'cart' }, { id: 'cart-slab', family: 'cart' }, { id: 'cart', family: 'cart' },
];
/** the Roads panel's palette: the town's road types only (T084) */
export const ROAD_TYPES = TYPES.filter(t => !COURSE_FAMILIES.includes(t.family));
/** the Course menu's Paths & drives palette: the cart paths, then the course drives (T084) */
export const COURSE_TYPES = TYPES.filter(t => COURSE_FAMILIES.includes(t.family));
/** the classes the keys 1 to 6 pick, in key order (the arterial is picked in the panel) */
export const KEY_CLASSES: ClassId[] = ['gravel', 'lane', 'street', 'road', 'avenue', 'boulevard'];
/** the class the Upgrade tool takes a road to: one step up the ladder gravel -> street -> road -> arterial -> six-lane (a lane goes to a street),
 *  avenue -> boulevard -> grand, and the same steps for the one-way and tree variants (a street with trees skips the road, which has none). A class
 *  not listed is the top of its ladder */
export const WIDER: Partial<Record<ClassId, ClassId>> = {
  gravel: 'street', lane: 'street', street: 'road', road: 'arterial', arterial: 'six', 'arterial.tl': 'six', 'arterial.tr': 'six', 'arterial.tl.tr': 'six',
  'street.tr': 'arterial.tr', avenue: 'boulevard', 'avenue.gr': 'boulevard.gr', boulevard: 'grand', 'boulevard.gr': 'grand.gr',
  'street.ow': 'arterial.ow', 'arterial.ow': 'six.ow', 'street.ow.tr': 'arterial.ow.tr', 'arterial.ow.tr': 'six.ow',
  'drive-gravel': 'drive', drive: 'drive-avenue', 'drive.tr': 'drive-avenue',
  'cart-walk': 'cart-dirt', 'cart-dirt': 'cart-slab', 'cart-slab': 'cart',
};
/** the class the Downgrade tool takes a road to: one step back down WIDER's ladders (a six-lane to an arterial, a turn-lane arterial to a road).
 *  A class not listed is the bottom of its ladder (gravel, the lane, the divided road) */
export const NARROWER: Partial<Record<ClassId, ClassId>> = {
  street: 'gravel', road: 'street', arterial: 'road', 'arterial.tl': 'road', six: 'arterial', 'arterial.tr': 'street.tr', 'arterial.tl.tr': 'street.tr',
  boulevard: 'avenue', 'boulevard.gr': 'avenue.gr', grand: 'boulevard', 'grand.gr': 'boulevard.gr',
  'arterial.ow': 'street.ow', 'six.ow': 'arterial.ow', 'arterial.ow.tr': 'street.ow.tr',
  'drive-avenue': 'drive', 'drive-avenue.gr': 'drive', 'drive-avenue.gd': 'drive', drive: 'drive-gravel', 'drive.tr': 'drive-gravel',
  cart: 'cart-slab', 'cart-slab': 'cart-dirt', 'cart-dirt': 'cart-walk',
};
export const JUNCTIONS: { id: NodeType; name: string; desc: string; cost: number; minDeg: number }[] = [
  { id: 'plain', name: 'Plain', desc: 'Priority: the bigger road runs through, side roads stop or yield (two-way stop)', cost: 0, minDeg: 3 },
  { id: 'stop', name: 'All-way stop', desc: 'Every approach stops; first come, first served', cost: 300, minDeg: 3 },
  { id: 'mini', name: 'Mini-roundabout', desc: 'A painted island in the crossing; take turns', cost: 1500, minDeg: 3 },
  { id: 'signal', name: 'Traffic lights', desc: 'Signals, stop lines', cost: 2500, minDeg: 3 },
  { id: 'slip', name: 'Lights + slipways', desc: 'Signals with channelised turn lanes', cost: 6000, minDeg: 3 },
  { id: 'roundabout', name: 'Roundabout', desc: 'Circle with a planted island', cost: 8000, minDeg: 2 },
];
export const R_SLIP = 12, SLIP_LANE = 2.2, RB_LANE = 2.5;
/** a mini-roundabout's painted island radius, tiles (about 4 m across); its one ring lane's centre line is MINI_ISLAND + 1.4 out */
export const MINI_ISLAND = 1.2;
/** a wide node's corners (n.wide, not a slip corner) are this many times the class's corner radius */
const WIDE_CORNER = 2.2;
/** a painted turn arrow's length (tiles) and its width factor on the unit shape (arrowPts) */
const ARROW_LEN = 2.4, ARROW_W = 1.3;
/** a roundabout's outer edge radius for 1, 2 or 3 ring lanes, tiles (14, 22 and 30 m); the widest arm can make it bigger */
export const RB_BASE: Record<1 | 2 | 3, number> = { 1: 7, 2: 11, 3: 15 };
/** the speed-limit tiers: every road's limit raised by this many km/h (tier 0 the classes' own limits, which rise with the road's size), capped at
 *  SPEED_CAP (140 km/h). The owner, 2026-10-19: gravel slowest, rising to the biggest roads, then +20, +40 and +60 km/h as unlocks */
export const SPEED_BONUS_KMH = [0, 20, 40, 60] as const, SPEED_CAP = 140 / 3.6;
export type SpeedTier = 0 | 1 | 2 | 3;
/** a road class's speed limit (m/s) at speed tier t */
export const speedOf = (cls: RoadClass, t: SpeedTier) => Math.min(SPEED_CAP, cls.vmax + SPEED_BONUS_KMH[t] / 3.6);
/** the outer radius (tiles) of a roundabout of rl ring lanes on arms of half widths hs: its base size, or the widest arm plus 2 tiles and the ring lanes */
export const ringRadius = (hs: number[], rl: 1 | 2 | 3) => Math.max(RB_BASE[rl], Math.max(...hs) + 2 + rl * RB_LANE);
/** the junction flags the junction tool sells: widened turns, and turn lanes (2-lane roads) */
export const FLAG_COST = { wide: 3000, tl: 2000 };
/** each ring lane a roundabout has beyond the first */
export const RING_LANE_COST = 4000;
/** a slipway on one corner of a junction with lights */
export const SLIP_CORNER_COST = 1000;
/** what a junction of type t with rl ring lanes costs (the type's JUNCTIONS cost, plus the ring lanes beyond the first on a roundabout) */
export const variantCost = (t: NodeType, rl: 1 | 2 | 3): number => (JUNCTIONS.find(j => j.id === t)?.cost ?? 0) + (t === 'roundabout' ? (rl - 1) * RING_LANE_COST : 0);

/* ---------- vectors ---------- */
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
export const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;
export const vlen = (a: Pt) => Math.hypot(a.x, a.y);
export const norm = (a: Pt): Pt => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
export const perp = (a: Pt): Pt => ({ x: -a.y, y: a.x });
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;
const angDelta = (a0: number, a1: number) => { let d = a1 - a0; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
export const keyOf = (p: Pt) => p.x.toFixed(3) + ',' + p.y.toFixed(3);
const snap = (p: Pt): Pt => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 });
function lineHit(p1: Pt, d1: Pt, p2: Pt, d2: Pt): Pt | null { const den = cross(d1, d2); if (Math.abs(den) < 1e-9) return null; return add(p1, mul(d1, cross(sub(p2, p1), d2) / den)); }
export function polyPath(pts: Pt[]) { const p = new Path2D(); pts.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y))); p.closePath(); return p; }
export function linePath(pts: Pt[], closed: boolean) { const p = new Path2D(); pts.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y))); if (closed) p.closePath(); return p; }
function discPath(c: Pt, r: number) { const p = new Path2D(); p.arc(c.x, c.y, Math.max(0.01, r), 0, TAU); return p; }
export function bboxOf(pts: Pt[], pad: number): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}
/** keep the part of a convex polygon with dot(q - p, n) >= 0 */
function clipPoly(poly: Pt[], p: Pt, n: Pt): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = dot(sub(a, p), n), db = dot(sub(b, p), n);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push(add(a, mul(sub(b, a), t))); }
  }
  return out;
}
/** shorten (positive) or extend (negative) a polyline at both ends */
export function trimPolyline(pts: Pt[], startInset: number, endInset: number): Pt[] | null {
  let p = pts.map(q => ({ ...q }));
  const cut = (arr: Pt[], inset: number): Pt[] | null => {
    if (inset <= 0) {
      const a = arr[0], b = arr[1], l = vlen(sub(b, a)) || 1;
      arr[0] = { x: a.x + ((a.x - b.x) / l) * -inset, y: a.y + ((a.y - b.y) / l) * -inset }; return arr;
    }
    let rem = inset;
    while (arr.length >= 2) {
      const a = arr[0], b = arr[1], l = vlen(sub(b, a));
      if (l > rem + 0.3) { arr[0] = { x: a.x + ((b.x - a.x) / l) * rem, y: a.y + ((b.y - a.y) / l) * rem }; return arr; }
      rem -= l; arr.shift();
    }
    return null;
  };
  const r1 = cut(p, startInset); if (!r1) return null; p = r1.reverse();
  const r2 = cut(p, endInset); if (!r2) return null;
  return r2.reverse();
}
/** offset an axis-aligned polyline sideways (miter joins) */
export function offsetPolyline(pts: Pt[], o: number, closed: boolean) {
  const n = pts.length, out: Pt[] = [];
  const normal = (a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return { x: -dy / l, y: dx / l }; };
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? pts[i - 1] : closed ? pts[n - 1] : null, next = i < n - 1 ? pts[i + 1] : closed ? pts[0] : null;
    let nx = 0, ny = 0;
    if (prev) { const nn = normal(prev, pts[i]); nx += nn.x; ny += nn.y; }
    if (next) { const nn = normal(pts[i], next); nx += nn.x; ny += nn.y; }
    if (prev && next) { const l2 = (nx * nx + ny * ny) / 2 || 1; nx /= l2; ny /= l2; } else { const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; }
    out.push({ x: pts[i].x + nx * o, y: pts[i].y + ny * o });
  }
  return out;
}
/** a polyline with its corners replaced by arcs (radius r, clamped to the adjacent segments) */
export type Piece = { run: true; a: Pt; b: Pt } | { run: false; ctrl: Pt; from: Pt; to: Pt; r: number };
export function roundPieces(pts: Pt[], r: number, closed: boolean): Piece[] {
  const n = pts.length; if (n < 2) return [];
  const dk = new Array<number>(n).fill(0), rk = new Array<number>(n).fill(0);
  for (let k = closed ? 0 : 1; k < (closed ? n : n - 1); k++) {
    const p = pts[(k - 1 + n) % n], c = pts[k], q = pts[(k + 1) % n];
    const u = norm(sub(p, c)), v = norm(sub(q, c)), phi = Math.acos(clamp(dot(u, v), -1, 1));
    if (phi > Math.PI - 0.02 || phi < 0.05) continue;
    const t = Math.tan(phi / 2), rr = Math.min(r, 0.49 * vlen(sub(p, c)) * t, 0.49 * vlen(sub(q, c)) * t);
    rk[k] = rr; dk[k] = rr / t;
  }
  const out: Piece[] = [], runs = closed ? n : n - 1;
  for (let k = 0; k < runs; k++) {
    const a = pts[k], b = pts[(k + 1) % n], d = norm(sub(b, a)), k1 = (k + 1) % n;
    const s = add(a, mul(d, dk[k])), e = sub(b, mul(d, dk[k1]));
    out.push({ run: true, a: s, b: e });
    if (rk[k1] > 0 && (closed || k1 < n - 1)) { const nd = norm(sub(pts[(k1 + 1) % n], b)); out.push({ run: false, ctrl: b, from: e, to: add(b, mul(nd, dk[k1])), r: rk[k1] }); }
  }
  return out;
}
export function roundedPath(pts: Pt[], r: number, closed: boolean) {
  const path = new Path2D(), pieces = roundPieces(pts, r, closed);
  pieces.forEach((p, i) => { if (p.run) { if (i === 0) path.moveTo(p.a.x, p.a.y); else path.lineTo(p.a.x, p.a.y); path.lineTo(p.b.x, p.b.y); } else path.arcTo(p.ctrl.x, p.ctrl.y, p.to.x, p.to.y, p.r); });
  if (closed) path.closePath();
  return path;
}
/** walk along a polyline calling fn every `step` tiles starting at `first` from each end */
function walkAlong(pts: Pt[], closed: boolean, first: number, step: number, fn: (p: Pt, i: number) => void) {
  const n = pts.length, runs = closed ? n : n - 1; let total = 0;
  for (let k = 0; k < runs; k++) total += vlen(sub(pts[(k + 1) % n], pts[k]));
  let next = first, acc = 0, i = 0;
  for (let k = 0; k < runs; k++) {
    const a = pts[k], b = pts[(k + 1) % n], l = vlen(sub(b, a));
    while (next <= acc + l && next <= total - first + 1e-6) { const t = (next - acc) / l; fn(add(a, mul(sub(b, a), t)), i++); next += step; }
    acc += l;
  }
}

/** a polyline pushed sideways by d tiles (each vertex moves along the normal of its neighbours; a closed one wraps) */
function offsetLine(pts: Pt[], closed: boolean, d: number): Pt[] {
  const n = pts.length;
  return pts.map((p, i) => { const a = pts[closed ? (i + n - 1) % n : Math.max(0, i - 1)]!, b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!; return add(p, mul(perp(norm(sub(b, a))), d)); });
}

/* ---------- data ---------- */
/** a junction or bend; wide = widened turns (connectors at 2x the radius for speed), tl = turn lanes (lane 0 turns left only, at a 3+ arm junction) */
/** rl: a roundabout's ring lanes (unset = 1; lane 0 is the outer one); slipOff: a slip node's corners with no slipway, each named by its right turn's
 *  in-arm (armDeg); unset or empty = every corner has one; sig: the lights' tier (0 fixed-time, 1 actuated, 2 adaptive; unset = 1); split: the
 *  fixed-time green seconds of each signal phase, in the plan's phase order (unset = 18 s each) */
export interface Node { x: number; y: number; segs: Seg[]; type: NodeType; arms: Arm[]; rb: number; wide?: boolean; tl?: boolean; rl?: 1 | 2 | 3; slipOff?: number[]; sig?: 0 | 1 | 2; split?: number[] }
/** how a segment is built: on the ground, on a bridge, or in a tunnel */
export const SK = { GROUND: 0, BRIDGE: 1, TUNNEL: 2 } as const; export type SegKind = 0 | 1 | 2;
/** town: the seg is the towns' (their seed streets, gravel and the valley's highway): no upkeep for the player and no fee from a lot beside it; absent = the player's */
export interface Seg { a: Node; b: Node; cls: RoadClass; style: LineStyle; kind: SegKind; town?: true }
export interface Arm { seg: Seg; other: Node; dir: Pt; nrm: Pt; ang: number; len: number; cls: RoadClass; h: number; walk: number; reachEdge: number; reachCentre: number; lineInset: number; medianInset: number; xw: number; stop: number; hasOpp: boolean;
  /** T228: how far from the node its white edge lines start (edgeLines classes): past its corner fillets, its zebra and stop line, a dead end's bulb */
  edgeInset: number }
export interface Feature { kind: 'stroke' | 'poly' | 'disc'; path: Path2D; w: number; tex: string; order: number; bbox: BBox; cap: 'butt' | 'round'; kerb: boolean }
/** a run of sidewalk slabs: straight (along a segment side) or radial (around a corner fillet, a bulb or a roundabout) */
export type SlabRun = { kind: 'straight'; a: Pt; b: Pt; n: Pt; w0: number; w1: number; visible: boolean; seed: number } | { kind: 'arc'; c: Pt; r0: number; r1: number; a0: number; a1: number; seed: number };
/** a street-lamp reflection pool: lamp point on the curb (tiles) */
export interface Pool { x: number; y: number; strength: number }
export interface LineRec { pts: Pt[]; closed: boolean; width: number; color: string; dash: [number, number] | null; r: number; offset: number; bbox: BBox;
  /** T228: a white edge line inside the kerb; the chunk bake breaks it where a lot ground patch with cut lies (a driveway, a bus stop, on-street bays) */
  edge?: true }
export interface Poly { path: Path2D; bbox: BBox }
export type DecalType = 'manhole' | 'drain' | 'oil' | 'patch';
export interface Decal { t: DecalType; x: number; y: number; ang: number; s: number; seed: number }
/** a fallen leaf on the ground (tile space): rotation, size factor, colour index */
export interface Leaf { x: number; y: number; ang: number; s: number; c: number }
/** a grass tuft spilling over the kerb's outer edge; ang points onto the sidewalk */
export interface Tuft { x: number; y: number; ang: number; v: number }
/** a polished wheel path (tile space polyline) */
export interface Wear { pts: Pt[]; closed: boolean; r: number; h: number; offsets: number[]; bbox: BBox }
export interface Tyre { x: number; y: number; ang: number; start: number; lat: number[]; len: number }
export interface Route { nodes: Node[]; segs: Seg[]; pts: Pt[]; cls: RoadClass; style: LineStyle; kind: SegKind; closed: boolean; a0?: Arm; a1?: Arm }
/** town: a street lamp of a gravel road, placed only where the town has houses near it (engine.syncAutoProps) */
export interface AutoProp { kind: 'tree' | 'light' | 'rbtree' | 'lamp' | 'garden'; x: number; y: number; i: number; town?: boolean }
export interface PieceSel { seg: Seg; p0: Pt; p1: Pt }
/** a bridge deck: the route centreline and the deck half width (tiles) */
export interface BridgeRec { pts: Pt[]; hw: number; bbox: BBox }
/** a tunnel mouth: the portal point, the unit direction into the tunnel, the road half width (asphalt + walk) */
export interface PortalRec { x: number; y: number; dir: Pt; hw: number; bbox: BBox }
/** a tunnel centreline and its asphalt width, for the planner dashed line */
export interface TunnelRec { pts: Pt[]; w: number; bbox: BBox }
export interface Island { x: number; y: number; r: number }

const YELLOW = '#d6b23b', WHITE = 'rgba(238,238,230,0.92)';
/** the starter cart paths' marks (T084): a cement slab joint (a soft grey groove), a dirt path's wheel rut (darker packed earth) and its
 *  centre grass (a muted painted green) */
export const CEMENT_JOINT = 'rgba(86,82,74,0.5)', DIRT_RUT = 'rgba(112,82,48,0.4)', DIRT_GRASS = 'rgba(98,132,58,0.5)';

function segIntersections(P: Pt, Q: Pt, A: Pt, B: Pt): [number, number][] {
  const d1 = sub(Q, P), d2 = sub(B, A), den = cross(d1, d2), w = sub(A, P), eps = 1e-9;
  if (Math.abs(den) > 1e-9) {
    const t = cross(w, d2) / den, u = cross(w, d1) / den;
    if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return [];
    return [[clamp(t, 0, 1), clamp(u, 0, 1)]];
  }
  if (Math.abs(cross(w, d1)) > 1e-7) return [];
  const out: [number, number][] = [], L1 = dot(d1, d1), L2 = dot(d2, d2);
  const tA = dot(sub(A, P), d1) / L1, tB = dot(sub(B, P), d1) / L1, uP = dot(sub(P, A), d2) / L2, uQ = dot(sub(Q, A), d2) / L2;
  if (tA > eps && tA < 1 - eps) out.push([tA, 0]); if (tB > eps && tB < 1 - eps) out.push([tB, 1]);
  if (uP > eps && uP < 1 - eps) out.push([0, uP]); if (uQ > eps && uQ < 1 - eps) out.push([1, uQ]);
  return out;
}
/** a turn arrow's outline on an approach, world points: its tip t tiles from the junction centre along arm a, in the lane at lat
 *  (tiles, to the arm's right); kind S (straight, 1 tile long, 0.35 wide), L (a left turn) or R (a right turn, the L mirrored) */
/** the straight arrow's unit outline (tip at +x, along the heading; y across it) */
const S_SHAPE: [number, number][] = [[0.5, 0], [0.15, 0.175], [0.15, 0.07], [-0.5, 0.07], [-0.5, -0.07], [0.15, -0.07], [0.15, -0.175]];
/** a straight white arrow on a one-way lane, centred at c, pointing along the unit heading u, lateral is along perp(u) */
function flowArrowPts(c: Pt, u: Pt): Pt[] {
  const pu = perp(u);
  return S_SHAPE.map(([x, y]) => add(add(c, mul(u, ARROW_LEN * x)), mul(pu, y * ARROW_W)));
}
/** the direction arrows of a one-way route: one per lane (lats, along perp of the flow) every 15 tiles, the first 6 tiles in from each end of pts (in flow order) */
function flowArrows(pts: Pt[], closed: boolean, lats: number[]): Poly[] {
  const out: Poly[] = [], ring = closed ? [...pts, pts[0]!] : pts, runs = ring.length - 1;
  let total = 0; for (let k = 0; k < runs; k++) total += vlen(sub(ring[k + 1]!, ring[k]!));
  for (let s = 6; s <= total - 6; s += 15) {
    let acc = 0;
    for (let k = 0; k < runs; k++) {
      const a = ring[k]!, b = ring[k + 1]!, l = vlen(sub(b, a));
      if (acc + l < s) { acc += l; continue; }
      const u = mul(sub(b, a), 1 / (l || 1)), p = add(a, mul(u, s - acc));
      for (const c of lats) { const q = flowArrowPts(add(p, mul(perp(u), c)), u); out.push({ path: polyPath(q), bbox: bboxOf(q, 0.3) }); }
      break;
    }
  }
  return out;
}
function arrowPts(N: Pt, a: Arm, t: number, lat: number, kind: 'S' | 'L' | 'R'): Pt[] {
  const rn = { x: a.dir.y, y: -a.dir.x }, sg = kind === 'R' ? -1 : 1;
  const shape: [number, number][] = kind === 'S' ? S_SHAPE
    : [[-0.5, -0.07], [0.27, -0.07], [0.27, 0.45], [0.375, 0.45], [0.2, 0.75], [0.025, 0.45], [0.13, 0.45], [0.13, 0.07], [-0.5, 0.07]];
  // drawn at road size: ARROW_LEN tiles long (~5 m, as painted turn arrows are), ARROW_W times the unit shape's width (the turn head stays in its lane)
  return shape.map(([x, y]) => add(add(N, mul(a.dir, t + ARROW_LEN * (0.5 - x))), mul(rn, lat - sg * y * ARROW_W)));
}
function cornerPatch(N: Pt, a: Pt, hA: number, b: Pt, hB: number, phi: number, R: number) {
  const nA = perp(a), nB = perp(b);
  const C = lineHit(add(N, mul(nA, hA)), a, sub(N, mul(nB, hB)), b); if (!C) return null;
  const d = R / Math.tan(phi / 2), TA = add(C, mul(a, d)), TB = add(C, mul(b, d));
  const bis = norm(add(a, b)), Q = add(C, mul(bis, R / Math.sin(phi / 2)));
  const path = new Path2D(); path.moveTo(TA.x, TA.y); path.arcTo(C.x, C.y, TB.x, TB.y, Math.max(0, R)); path.lineTo(C.x, C.y); path.closePath();
  return { path, bbox: bboxOf([C, TA, TB], 0.3), C, TA, TB, Q, bis, d };
}
function rbFillet(N: Pt, a: Pt, h: number, R: number, r: number, side: 1 | -1) {
  const n = mul(perp(a), side), q = (R + r) ** 2 - (h + r) ** 2;
  if (q <= 0 || R <= h + 0.05) return null;
  const Q = add(add(N, mul(a, Math.sqrt(q))), mul(n, h + r));
  const Te = sub(Q, mul(n, r)), Tc = add(N, mul(sub(Q, N), R / (R + r))), X = add(add(N, mul(a, Math.sqrt(R * R - h * h))), mul(n, h));
  const path = new Path2D(); path.moveTo(Te.x, Te.y); path.lineTo(X.x, X.y);
  const a0 = Math.atan2(X.y - N.y, X.x - N.x), a1 = Math.atan2(Tc.y - N.y, Tc.x - N.x);
  path.arc(N.x, N.y, R, a0, a1, angDelta(a0, a1) < 0);
  const b0 = Math.atan2(Tc.y - Q.y, Tc.x - Q.x), b1 = Math.atan2(Te.y - Q.y, Te.x - Q.x);
  path.arc(Q.x, Q.y, r, b0, b1, angDelta(b0, b1) < 0);
  path.closePath();
  return { path, bbox: bboxOf([Te, X, Tc], 0.3) };
}
/** a slip island's geometry, no Path2D: the offset edges' corner C2 and the island's far corners PA (on arm A) and PB (on arm B); null if too tight */
function slipIslandPts(N: Pt, A: Arm, B: Arm, Q: Pt, R: number): { C2: Pt; PA: Pt; PB: Pt } | null {
  const g = 0.6, Ri = R + SLIP_LANE;
  const C2 = lineHit(add(N, mul(A.nrm, A.h + g)), A.dir, sub(N, mul(B.nrm, B.h + g)), B.dir); if (!C2) return null;
  // first crossing of the offset edge line with the slip lane's inner circle (the island's far corner)
  const hit = (dir: Pt) => { const w = sub(C2, Q), b = dot(dir, w), c = dot(w, w) - Ri * Ri, disc = b * b - c; if (disc < 0) return -1; return -b - Math.sqrt(disc); };
  const tA = hit(A.dir), tB = hit(B.dir); if (tA < 0.9 || tB < 0.9 || dot(sub(C2, Q), sub(C2, Q)) < Ri * Ri + 1.2) return null;
  return { C2, PA: add(C2, mul(A.dir, tA)), PB: add(C2, mul(B.dir, tB)) };
}
function slipIsland(N: Pt, A: Arm, B: Arm, Q: Pt, R: number) {
  const isl = slipIslandPts(N, A, B, Q, R); if (!isl) return null;
  const { C2, PA, PB } = isl, Ri = R + SLIP_LANE, mid = add(C2, mul(sub(PA, C2), 0.5));
  const path = new Path2D(); path.moveTo(mid.x, mid.y); path.lineTo(PA.x, PA.y);
  const a0 = Math.atan2(PA.y - Q.y, PA.x - Q.x), a1 = Math.atan2(PB.y - Q.y, PB.x - Q.x);
  path.arc(Q.x, Q.y, Ri, a0, a1, angDelta(a0, a1) < 0);
  path.arcTo(C2.x, C2.y, mid.x, mid.y, 0.6); path.closePath();
  return { path, bbox: bboxOf([C2, PA, PB], 0.3) };
}
/** the in-arm of the right turn at the corner between consecutive arms A and B (the car turns from -A into B, or from -B into A), or null
 *  when neither is a right turn */
export function slipIn(A: Arm, B: Arm): Arm | null {
  const right = (h: Pt, o: Pt) => Math.atan2(cross(h, o), dot(h, o)) > 0.35;
  return right(mul(A.dir, -1), B.dir) ? A : right(mul(B.dir, -1), A.dir) ? B : null;
}
/** a corner's name in a node's slipOff: its right turn's in-arm, whole degrees */
export const armDeg = (a: Arm) => Math.round(a.ang * 180 / Math.PI);
/** whether the corner between consecutive arms A and B of node n has a slipway: n is a slip node, the corner has a right turn, and that
 *  in-arm is not in n.slipOff */
export function slipOn(n: Node, A: Arm, B: Arm): boolean {
  if (n.type !== 'slip') return false;
  const i = slipIn(A, B); return !!i && !n.slipOff?.includes(armDeg(i));
}
/** the slip road between consecutive arms A and B of a slip node (B the arm after A in n.arms): its arc's centre Q and radius R, with the
 *  painter's conditions and no Path2D; null where the painter draws no corner or no island, or the corner has no slipway (slipOn). Callers check n.type */
export function slipCorner(n: Node, A: Arm, B: Arm): { Q: Pt; R: number } | null {
  if (!slipOn(n, A, B)) return null;
  const N = { x: n.x, y: n.y }, phi = (((B.ang - A.ang) % TAU) + TAU) % TAU;
  if (phi < 0.12 || phi > Math.PI - 0.05) return null;
  const R = Math.min(R_SLIP, 0.45 * Math.min(A.len, B.len) * Math.tan(phi / 2)); if (R < 9) return null;
  const C = lineHit(add(N, mul(perp(A.dir), A.h)), A.dir, sub(N, mul(perp(B.dir), B.h)), B.dir); if (!C) return null;
  const Q = add(C, mul(norm(add(A.dir, B.dir)), R / Math.sin(phi / 2)));
  return slipIslandPts(N, A, B, Q, R) ? { Q, R } : null;
}

/* ---------- T228: white edge lines ---------- */
/** the edge line: its centre this far inside the kerb (tiles; clear of the gutter's shade, GUTTER 0.2 in renderer.ts) and its width (tiles) */
export const EDGE_IN = 0.32, EDGE_W = 0.12;
/** T228 (the owner's concept, 2026-10-27: "dark asphalt with white edge lines"): the classes with a white edge line inside each kerb: the town's
 *  kerbed roads (sidewalks, the small, medium and large families) from the street up, one-way and tree variants alike. Not the lane (one 4 m lane
 *  with a footpath: a back lane, no centre line either), nor the rural roads (their yellow shoulder lines), the course drives or the cart paths */
export function edgeLines(c: RoadClass): boolean {
  return kerbed(c) && (c.family === 'small' || c.family === 'medium' || c.family === 'large') && c.base !== 'lane';
}
/** where the kerb of arm A of node n turns into the corner fillet it shares with arm B (B the next arm counter-clockwise when ccw, else the one
 *  before): its distance from the node along A, as the painter rounds that corner (nodeFeatures: the same radius rule), or 0 where the corner
 *  is not rounded (nearly straight on, or too sharp) */
function filletReach(n: Node, A: Arm, B: Arm, ccw: boolean): number {
  const [P, Q] = ccw ? [A, B] : [B, A], phi = (((Q.ang - P.ang) % TAU) + TAU) % TAU;
  if (phi < 0.12 || phi > Math.PI - 0.05) return 0;
  const slip = slipOn(n, P, Q);
  let R = slip ? R_SLIP : Math.min(P.cls.rConcave, Q.cls.rConcave);
  if (n.wide && !slip) R *= WIDE_CORNER;
  if (!slip && phi < 1.2) R *= 1.2 / phi;
  R = Math.min(R, 0.45 * Math.min(P.len, Q.len) * Math.tan(phi / 2)); if (R < 0.15) return 0;
  const N = { x: n.x, y: n.y }, C = lineHit(add(N, mul(perp(P.dir), P.h)), P.dir, sub(N, mul(perp(Q.dir), Q.h)), Q.dir); if (!C) return 0;
  return Math.max(0, dot(sub(C, N), A.dir) + R / Math.tan(phi / 2));
}
/** arm i of node n: how far from the node its edge lines start. A dead end: where its kerb meets the turning circle. A roundabout: past its
 *  arm's fillet onto the ring. A junction (3+ arms, a mini): past the corner fillets either side of it, its zebra and its stop line, at least
 *  past the crossing roads' edges. Two arms: past the corner fillet of a bend, and on a narrower road meeting a wider one straight on, past the
 *  taper between them; 0 where one road simply runs on (its edge lines meet the next route's) */
function edgeInsetOf(n: Node, arms: Arm[], i: number): number {
  const a = arms[i]!, k = arms.length;
  if (k === 1) { const rb = a.h + a.cls.bulb; return a.cls.bulb > 0 ? Math.sqrt(rb * rb - a.h * a.h) + 0.3 : 0.3; }
  let t = 0;
  if (n.rb && n.type !== 'mini') { const r = 1.5, q = (n.rb + r) ** 2 - (a.h + r) ** 2; t = (q > 0 ? Math.sqrt(q) : n.rb) + 0.2; }
  else if (k >= 2) t = Math.max(filletReach(n, a, arms[(i + 1) % k]!, true), filletReach(n, a, arms[(i + k - 1) % k]!, false)) + 0.15;
  if (k >= 3 || n.rb) t = Math.max(t, a.reachEdge + 0.3);
  if (a.xw >= 0) t = Math.max(t, a.xw + 1.4 + 0.35);
  if (a.stop >= 0) t = Math.max(t, a.stop + 0.35 + 0.3);
  if (k === 2) {
    const o = arms[1 - i]!;
    if (dot(a.dir, o.dir) < -0.96 && o.h + o.walk > a.h + a.walk + 0.05) t = Math.max(t, Math.min(2.5, 0.6 * a.len) + 0.3);
  }
  return t;
}

/* ---------- spatial indexes ---------- */
/** everything one route or one node draws on the ground, with its bounds (tile space) */
export interface Fx {
  key: number; bbox: BBox;
  walkF: Feature[]; asphF: Feature[]; medianF: Feature[]; islandF: Feature[]; rbIslands: Island[];
  lines: LineRec[]; zebra: Poly[]; bars: Poly[]; decals: Decal[]; tyres: Tyre[]; autoProps: AutoProp[]; slabRuns: SlabRun[];
  bridges: BridgeRec[]; portals: PortalRec[]; tunnels: TunnelRec[];
  /** litter (leaves, tufts, curb joints, wheel wear) is generated when a painter first needs it and cached (LRU):
   *  a 4 km network has millions of leaves, far too many to keep for every route at once */
  lazy: (() => Litter) | null; litter: Litter | null;
}
export interface Litter { leaves: Leaf[]; tufts: Tuft[]; wear: Wear[]; joints: { a: Pt; b: Pt }[] }
/** the ground features inside a box, merged in a stable order (what a chunk painter needs) */
export type FxView = Pick<Fx, (typeof FX_LISTS)[number]> & Litter & { pools: Pool[] };
const emptyFx = (key: number): Fx => ({ key, bbox: [0, 0, 0, 0], walkF: [], asphF: [], medianF: [], islandF: [], rbIslands: [], lines: [], zebra: [], bars: [], decals: [], tyres: [], autoProps: [], slabRuns: [], bridges: [], portals: [], tunnels: [], lazy: null, litter: null });
const emptyLitter = (): Litter => ({ leaves: [], tufts: [], wear: [], joints: [] });
const FX_LISTS = ['walkF', 'asphF', 'medianF', 'islandF', 'rbIslands', 'lines', 'zebra', 'bars', 'decals', 'tyres', 'slabRuns', 'bridges', 'portals', 'tunnels'] as const;
const LITTER_LISTS = ['leaves', 'tufts', 'wear', 'joints'] as const;
const LITTER_CACHE = 4000;
function hashStr(s: string) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }

/** a uniform grid over the map holding items by the cells their box touches */
export class Grid<T> {
  cells = new Map<number, Set<T>>(); private where = new Map<T, number[]>();
  constructor(public size: number) {}
  private span(b: BBox) { const s = this.size; return [Math.floor(b[0] / s), Math.floor(b[1] / s), Math.floor(b[2] / s), Math.floor(b[3] / s)]; }
  add(item: T, b: BBox) {
    const [x0, y0, x1, y1] = this.span(b), keys: number[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = (y + 4096) * 16384 + (x + 4096); let c = this.cells.get(k); if (!c) this.cells.set(k, (c = new Set())); c.add(item); keys.push(k); }
    this.where.set(item, keys);
  }
  remove(item: T) { const keys = this.where.get(item); if (!keys) return; for (const k of keys) { const c = this.cells.get(k); if (c) { c.delete(item); if (!c.size) this.cells.delete(k); } } this.where.delete(item); }
  query(b: BBox, out = new Set<T>()) {
    const [x0, y0, x1, y1] = this.span(b);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const c = this.cells.get((y + 4096) * 16384 + (x + 4096)); if (c) for (const i of c) out.add(i); }
    return out;
  }
  clear() { this.cells.clear(); this.where.clear(); }
}
const segBox = (s: Seg): BBox => [Math.min(s.a.x, s.b.x), Math.min(s.a.y, s.b.y), Math.max(s.a.x, s.b.x), Math.max(s.a.y, s.b.y)];
export const unionBox = (a: BBox | null, b: BBox): BBox => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : [...b] as BBox);

/** rasterises ground features into the occupancy grid; injected so the network also runs where there is no canvas */
export type OccRaster = (net: RoadNetwork, box: BBox) => void;

/* ---------- the network ---------- */
export class RoadNetwork {
  nodes = new Map<string, Node>(); segs = new Set<Seg>(); version = 0;
  routes = new Set<Route>(); pools: Pool[] = [];
  occ = new Uint8Array(MAP * MAP);
  /** the ground box the last rebuild changed (null = nothing), and the auto props it added and removed */
  lastDirty: BBox | null = null; autoAdded: AutoProp[] = []; autoRemoved: AutoProp[] = [];
  /** the nodes the last rebuild re-analysed: the touched nodes and their neighbours (all nodes after a full rebuild) */
  lastNodes: Node[] = []; lastFull = false;
  private segGrid = new Grid<Seg>(16); private fxGrid = new Grid<Fx>(32); private poolGrid = new Grid<Pool>(32);
  private routeOf = new Map<Seg, Route>(); private routeFx = new Map<Route, Fx>(); private nodeFx = new Map<Node, Fx>();
  private touched = new Set<Node>(); private removed = new Set<Seg>();
  private litterLRU = new Set<Fx>();
  /** false on the main thread: it only needs geometry and occupancy, the ground workers paint */
  paintData = true;
  occRaster: OccRaster | null = typeof OffscreenCanvas !== 'undefined' ? canvasOccRaster : null;

  nodeAt(p: Pt) { return this.nodes.get(keyOf(snap(p))); }
  private node(p: Pt): Node { const s = snap(p), k = keyOf(s); let n = this.nodes.get(k); if (!n) { n = { x: s.x, y: s.y, segs: [], type: 'plain', arms: [], rb: 0 }; this.nodes.set(k, n); } return n; }
  private link(a: Node, b: Node, cls: RoadClass, style: LineStyle, kind: SegKind, town?: true) { const s: Seg = { a, b, cls, style, kind }; if (town) s.town = true; a.segs.push(s); b.segs.push(s); this.segs.add(s); this.segGrid.add(s, segBox(s)); this.touched.add(a); this.touched.add(b); return s; }
  private unlink(s: Seg) {
    this.segs.delete(s); this.segGrid.remove(s); this.removed.add(s);
    for (const n of [s.a, s.b]) { const i = n.segs.indexOf(s); if (i >= 0) n.segs.splice(i, 1); if (!n.segs.length) this.nodes.delete(keyOf(n)); this.touched.add(n); }
  }
  /** a node that may have been dropped by unlink() is put back before it gets new segments */
  private keep(n: Node) { this.nodes.set(keyOf(n), n); return n; }
  private splitSeg(s: Seg, pts: Pt[]) {
    const d = sub(s.b, s.a), L2 = dot(d, d);
    const ordered = pts.map(p => ({ p, t: dot(sub(p, s.a), d) / L2 })).filter(q => q.t > 1e-6 && q.t < 1 - 1e-6).sort((p, q) => p.t - q.t);
    if (!ordered.length) return;
    const chain = [s.a, ...ordered.map(q => this.node(q.p)), s.b];
    const cls = s.cls, style = s.style, kind = s.kind, town = s.town; this.unlink(s);
    for (let i = 0; i + 1 < chain.length; i++) if (chain[i] !== chain[i + 1]) this.link(this.keep(chain[i]), this.keep(chain[i + 1]), cls, style, kind, town);
  }
  private addSegment(P: Pt, Q: Pt, cls: RoadClass, style: LineStyle, kind: SegKind = 0, town?: true) {
    const d = sub(Q, P); if (vlen(d) < 1e-6) return;
    const cutsOld = new Map<Seg, Pt[]>(), cutsNew: { t: number; pt: Pt }[] = [];
    const near = this.segGrid.query([Math.min(P.x, Q.x) - 0.01, Math.min(P.y, Q.y) - 0.01, Math.max(P.x, Q.x) + 0.01, Math.max(P.y, Q.y) + 0.01]);
    for (const s of near) for (const [tN, tO] of segIntersections(P, Q, s.a, s.b)) {
      const pt = snap(tO <= 1e-6 ? s.a : tO >= 1 - 1e-6 ? s.b : tN <= 1e-6 ? P : tN >= 1 - 1e-6 ? Q : add(P, mul(d, tN)));
      if (tO > 1e-6 && tO < 1 - 1e-6) { let l = cutsOld.get(s); if (!l) cutsOld.set(s, (l = [])); l.push(pt); }
      if (tN > 1e-6 && tN < 1 - 1e-6) cutsNew.push({ t: tN, pt });
    }
    for (const [s, pts] of cutsOld) this.splitSeg(s, pts);
    const pts = [snap(P), ...cutsNew.sort((p, q) => p.t - q.t).map(c => c.pt), snap(Q)];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = this.node(pts[i]), b = this.node(pts[i + 1]); if (a === b) continue;
      const ex = a.segs.find(s => s.a === b || s.b === b);
      if (ex && cls.oneway && ex.a === b) { this.unlink(ex); this.link(this.keep(a), this.keep(b), cls, style, kind, town); }
      // a changed class, style or kind is a rebuild: the player's unless the op is the towns' (a re-laid road with the same look keeps its owner)
      else if (ex) { if (ex.cls !== cls || ex.style !== style || ex.kind !== kind) { ex.cls = cls; ex.style = style; ex.kind = kind; if (town) ex.town = true; else delete ex.town; this.touched.add(a); this.touched.add(b); } }
      else this.link(a, b, cls, style, kind, town);
    }
  }
  /** add legs (kinds[i] is leg i's structure kind, ground by default; town: the towns' legs, see Seg.town); pass rebuild=false to batch several calls before one rebuild() */
  addLegs(legs: Leg[], cls: RoadClass, style: LineStyle, rebuild = true, kinds?: SegKind[], town?: true) { legs.forEach((l, i) => this.addSegment(l.a, l.b, cls, style, kinds?.[i] ?? 0, town)); if (rebuild) this.rebuild(); }
  legsLength(legs: Leg[]) { return legs.reduce((s, l) => s + vlen(sub(l.b, l.a)), 0); }
  segsNear(p: Pt, r: number) { return this.segGrid.query([p.x - r, p.y - r, p.x + r, p.y + r]); }
  /** the route a segment belongs to (the current build; undefined for a segment not in a route yet) */
  routeOfSeg(s: Seg): Route | undefined { return this.routeOf.get(s); }
  /** the 3-tile piece of road under a point, or null */
  pieceNear(p: Pt): PieceSel | null {
    let best: PieceSel | null = null, bd = Infinity;
    for (const s of this.segsNear(p, 12)) {
      const d = sub(s.b, s.a), L = vlen(d), u = mul(d, 1 / L), t = clamp(dot(sub(p, s.a), u), 0, L), q = add(s.a, mul(u, t)), dist = vlen(sub(p, q));
      if (dist > s.cls.h + s.cls.walk + 0.3 || dist >= bd) continue;
      // long enough that the two new dead ends (with their turning circles) do not touch
      const half = Math.max(1.5, s.cls.h + s.cls.bulb + 1);
      let s0 = Math.max(0, t - half), s1 = Math.min(L, t + half); if (s0 < 2) s0 = 0; if (L - s1 < 2) s1 = L;
      // a piece reaching into a roundabout's circle (its walk, and room for the new dead end) takes the arm on to the ring's node: a stub
      // left inside the ring ran its lanes on to the island, and each click broke off one more piece (the owner, 2026-10-19)
      const ring = (n: Node) => (n.rb > 0 ? n.rb + Math.max(0, ...n.arms.map(a => a.walk)) + half : 0);
      if (s0 < ring(s.a)) s0 = 0; if (L - s1 < ring(s.b)) s1 = L;
      [s0, s1] = this.clearCut(s, s0, s1);
      bd = dist; best = { seg: s, p0: add(s.a, mul(u, s0)), p1: add(s.a, mul(u, s1)) };
    }
    return best;
  }
  /** widens a cut [s0, s1] of seg s (tiles from s.a) a tile at a time until each new dead end it leaves clears the corridors of the roads around it
   *  (all but those at the node its own stub keeps), of `extra` (a route about to be built, with its half widths), and of the facing new end; a
   *  stub that cannot clear goes whole. (Cut to the turning circles alone, a bulldozed piece left two dead ends overlapping each other or a
   *  road by the junction next to them: the road builder's stress test, 2026-10-19) */
  clearCut(s: Seg, s0: number, s1: number, extra: { a: Pt; b: Pt; hw: number }[] = []): [number, number] {
    const d = sub(s.b, s.a), L = vlen(d), u = mul(d, 1 / L), hw = s.cls.h + s.cls.walk, at = (t: number) => add(s.a, mul(u, t));
    const near = (p: Pt, a: Pt, b: Pt) => { const e = sub(b, a), L2 = dot(e, e), t = L2 > 0 ? clamp(dot(sub(p, a), e) / L2, 0, 1) : 0; return vlen(sub(p, add(a, mul(e, t)))); };
    const others = [...this.segsNear(mul(add(s.a, s.b), 0.5), L / 2 + 24)].filter(t => t !== s);
    // a ring's circle (with its walk) counts too, the ring at the stub's own node included: a cut end inside it left the stub under the ring
    const rings = new Set<Node>(); for (const t of [s, ...others]) for (const m of [t.a, t.b]) if (m.rb > 0) rings.add(m);
    const clear = (p: Pt, own: Node, facing: [Pt, Pt] | null) => {
      for (const m of rings) if (vlen(sub(p, m)) < m.rb + Math.max(0, ...m.arms.map(x => x.walk)) + (m === own ? hw : hw + 0.5)) return false;
      for (const t of others) if (t.a !== own && t.b !== own && near(p, t.a, t.b) < hw + t.cls.h + t.cls.walk - 0.5) return false;
      for (const e of extra) if (near(p, e.a, e.b) < hw + e.hw - 0.5) return false;
      return !facing || near(p, facing[0], facing[1]) >= 2 * hw - 0.5;
    };
    for (let k = 0; k < 400; k++) {
      let moved = false;
      if (s0 > 0 && !clear(at(s0), s.a, s1 < L ? [at(s1), s.b] : null)) { s0 = s0 - 1 < 2 ? 0 : s0 - 1; moved = true; }
      if (s1 < L && !clear(at(s1), s.b, s0 > 0 ? [s.a, at(s0)] : null)) { s1 = L - s1 - 1 < 2 ? L : s1 + 1; moved = true; }
      if (!moved) break;
    }
    return [s0, s1];
  }
  removePiece(sel: PieceSel, rebuild = true) {
    const s = sel.seg, d = sub(s.b, s.a), L2 = dot(d, d);
    const cls = s.cls, style = s.style, kind = s.kind, town = s.town, inner = (p: Pt) => { const t = dot(sub(p, s.a), d) / L2; return t > 1e-6 && t < 1 - 1e-6; };
    const a = s.a, b = s.b; this.unlink(s);
    const p0 = snap(sel.p0), p1 = snap(sel.p1);
    if (inner(p0)) this.link(this.keep(a), this.node(p0), cls, style, kind, town);
    if (inner(p1)) this.link(this.node(p1), this.keep(b), cls, style, kind, town);
    if (rebuild) this.rebuild();
  }
  /** a node's type; a type other than a slip drops the node's slipways (slipOff), and a type other than a signal or a slip drops its signal tier and split */
  setNodeType(n: Node, type: NodeType, rebuild = true) {
    n.type = type; if (type !== 'slip') n.slipOff = undefined;
    if (type !== 'signal' && type !== 'slip') { n.sig = undefined; n.split = undefined; }
    this.touched.add(n); if (rebuild) this.rebuild();
  }
  /** the lights' tier (0 fixed-time, 1 actuated, 2 adaptive) and the fixed-time green seconds of each phase (split; empty or unset = 18 s each); the
   *  lane graph reads them at the node */
  /** the speed-limit tier of every road (see speedOf); the lane graph rebuilds all its lanes when it changes */
  speedTier: SpeedTier = 0;
  setSpeedTier(t: SpeedTier, rebuild = true) { this.speedTier = t; if (rebuild) this.rebuild(true); }
  setSignal(n: Node, sig: 0 | 1 | 2, split?: number[], rebuild = true) { n.sig = sig; n.split = split?.length ? [...split] : undefined; this.touched.add(n); if (rebuild) this.rebuild(); }
  /** the slip node's corners without a slipway (their in-arms, armDeg; empty = all of them have one); the lane graph and the painter read it at the node */
  setSlipOff(n: Node, off: number[], rebuild = true) { n.slipOff = off.length ? [...off] : undefined; this.touched.add(n); if (rebuild) this.rebuild(); }
  /** the node's widened-turns and turn-lane flags and its roundabout's ring lanes (the lane graph reads them at the node) */
  setNodeFlags(n: Node, wide: boolean, tl: boolean, rl: 1 | 2 | 3 = n.rl ?? 1, rebuild = true) { n.wide = wide; n.tl = tl; n.rl = rl; this.touched.add(n); if (rebuild) this.rebuild(); }
  nearestNode(p: Pt, minDeg: number, maxDist: number): Node | null {
    let best: Node | null = null, bd = maxDist;
    for (const s of this.segsNear(p, maxDist)) for (const n of [s.a, s.b]) { if (n.segs.length < minDeg) continue; const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  occAt(x: number, y: number) { const tx = Math.floor(x), ty = Math.floor(y); return tx < 0 || ty < 0 || tx >= MAP || ty >= MAP ? 0 : this.occ[ty * MAP + tx]; }
  /** highest occupancy code inside a tile rect: 0 free, 1 sidewalk/verge, 2 asphalt, 3 median */
  rectOcc(x0: number, y0: number, x1: number, y1: number) {
    let m = 0;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(MAP, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(MAP, Math.ceil(x1)); x++) { const v = this.occ[y * MAP + x]; if (v > m) m = v; }
    return m;
  }
  /** every auto prop on the map (median trees, roundabout trees, traffic lights) */
  get autoProps() { const out: AutoProp[] = []; for (const f of this.routeFx.values()) out.push(...f.autoProps); for (const f of this.nodeFx.values()) out.push(...f.autoProps); return out; }
  get fxCount() { return this.routeFx.size + this.nodeFx.size; }
  /** the tunnel mouths on the surface: forest keeps clear of them */
  portals(): PortalRec[] { const out: PortalRec[] = []; for (const f of this.routeFx.values()) out.push(...f.portals); return out; }
  /** the ground features that can touch a box, merged in a stable order */
  view(b: BBox, withLitter = true): FxView {
    const fx = [...this.fxGrid.query(b)].filter(f => f.bbox[2] >= b[0] && f.bbox[0] <= b[2] && f.bbox[3] >= b[1] && f.bbox[1] <= b[3]).sort((p, q) => p.key - q.key);
    const v = { pools: [...this.poolGrid.query(b)] } as FxView;
    for (const k of FX_LISTS) (v as unknown as Record<string, unknown[]>)[k] = fx.flatMap(f => f[k] as unknown[]);
    const lit = withLitter ? fx.map(f => this.litterOf(f)) : [];
    for (const k of LITTER_LISTS) (v as unknown as Record<string, unknown[]>)[k] = lit.flatMap(l => l[k] as unknown[]);
    v.walkF.sort((p, q) => p.order - q.order); v.asphF.sort((p, q) => p.order - q.order);
    return v;
  }
  private litterOf(f: Fx): Litter {
    if (f.litter) { this.litterLRU.delete(f); this.litterLRU.add(f); return f.litter; }
    f.litter = f.lazy ? f.lazy() : emptyLitter(); this.litterLRU.add(f);
    if (this.litterLRU.size > LITTER_CACHE) for (const old of this.litterLRU) { if (this.litterLRU.size <= LITTER_CACHE * 0.8) break; old.litter = null; this.litterLRU.delete(old); }
    return f.litter;
  }
  clear() {
    this.speedTier = 0;
    this.litterLRU.clear();
    this.nodes.clear(); this.segs.clear(); this.routes.clear(); this.routeOf.clear(); this.routeFx.clear(); this.nodeFx.clear();
    this.segGrid.clear(); this.fxGrid.clear(); this.poolGrid.clear(); this.pools = []; this.occ.fill(0); this.touched.clear(); this.removed.clear(); this.version++;
  }

  /** Rebuild what the edits since the last rebuild touched: the touched nodes and their neighbours, every route through
   *  them and the routes of removed segments. full = rebuild everything (after a load). */
  rebuild(full = false) {
    this.version++;
    let dirty: BBox | null = null;
    const removedAuto: AutoProp[] = [], addedAuto: AutoProp[] = [];
    const dropFx = (f: Fx | undefined) => { if (!f) return; dirty = unionBox(dirty, f.bbox); this.fxGrid.remove(f); this.litterLRU.delete(f); removedAuto.push(...f.autoProps); };
    const A = new Set<Node>();
    if (full) {
      for (const f of this.routeFx.values()) dropFx(f); for (const f of this.nodeFx.values()) dropFx(f);
      this.routeFx.clear(); this.nodeFx.clear(); this.routes.clear(); this.routeOf.clear();
      for (const n of this.nodes.values()) A.add(n);
    } else for (const n of this.touched) { A.add(n); for (const s of n.segs) A.add(s.a === n ? s.b : s.a); }
    this.lastNodes = [...A]; this.lastFull = full;
    const live = [...A].filter(n => n.segs.length && this.nodes.get(keyOf(n)) === n);
    for (const n of live) {
      n.arms = n.segs.map(s => { const other = s.a === n ? s.b : s.a, d = sub(other, n), L = vlen(d), dir = mul(d, 1 / L); return { seg: s, other, dir, nrm: perp(dir), ang: Math.atan2(dir.y, dir.x), len: L, cls: s.cls, h: s.cls.h, walk: s.cls.walk, reachEdge: 0, reachCentre: 0, lineInset: 0, medianInset: 0, xw: -1, stop: -1, hasOpp: false, edgeInset: 0 }; }).sort((p, q) => p.ang - q.ang);
      const rl = n.rl ?? 1;
      n.rb = n.type === 'roundabout' && n.arms.length >= 2 ? ringRadius(n.arms.map(a => a.h), rl)
        : n.type === 'mini' && n.arms.length >= 3 ? Math.max(4, Math.max(...n.arms.map(a => a.h)) + 1) : 0;
    }
    for (const n of live) this.analyseNode(n);
    // routes through the changed nodes go, and are walked again from their segments
    const stale = new Set<Route>();
    for (const n of A) for (const s of n.segs) { const r = this.routeOf.get(s); if (r) stale.add(r); }
    for (const s of this.removed) { const r = this.routeOf.get(s); if (r) stale.add(r); }
    const free = new Set<Seg>();
    for (const r of stale) { dropFx(this.routeFx.get(r)); this.routeFx.delete(r); this.routes.delete(r); for (const s of r.segs) { this.routeOf.delete(s); if (this.segs.has(s)) free.add(s); } }
    for (const n of live) for (const s of n.segs) if (!this.routeOf.has(s)) free.add(s);
    for (const r of this.buildRoutes(free)) {
      this.routes.add(r); for (const s of r.segs) this.routeOf.set(s, r);
      const f = this.routeFeatures(r); this.routeFx.set(r, f); this.fxGrid.add(f, f.bbox); dirty = unionBox(dirty, f.bbox); addedAuto.push(...f.autoProps);
    }
    for (const n of A) {
      dropFx(this.nodeFx.get(n)); this.nodeFx.delete(n);
      if (!n.segs.length || this.nodes.get(keyOf(n)) !== n) continue;
      const f = this.nodeFeatures(n); if (!f) continue;
      this.nodeFx.set(n, f); this.fxGrid.add(f, f.bbox); dirty = unionBox(dirty, f.bbox); addedAuto.push(...f.autoProps);
    }
    this.touched.clear(); this.removed.clear();
    // auto props that merely moved between owners are not changes
    const k = (a: AutoProp) => `${a.kind}@${a.x.toFixed(2)},${a.y.toFixed(2)}`, had = new Set(removedAuto.map(k)), has = new Set(addedAuto.map(k));
    this.autoAdded = addedAuto.filter(a => !had.has(k(a))); this.autoRemoved = removedAuto.filter(a => !has.has(k(a)));
    this.lastDirty = dirty;
    if (dirty) { if (full) this.occ.fill(0); this.occRaster?.(this, full ? [0, 0, MAP, MAP] : dirty); }
  }
  private analyseNode(n: Node) {
    const arms = n.arms, k = arms.length;
    const junction = k >= 3 || n.rb > 0, signal = n.type === 'signal' || n.type === 'slip' || n.type === 'stop';
    for (const a of arms) {
      let reachEdge = 0, reachCentre = 0; a.hasOpp = false;
      for (const b of arms) {
        if (b === a) continue;
        const th = Math.acos(clamp(dot(a.dir, b.dir), -1, 1));
        if (th > Math.PI * 165 / 180) { a.hasOpp = true; continue; }
        const s = Math.max(Math.sin(th), 0.3);
        reachEdge = Math.max(reachEdge, (b.h + a.h * Math.abs(Math.cos(th))) / s); reachCentre = Math.max(reachCentre, b.h / s);
      }
      if (n.rb) reachEdge = reachCentre = n.rb;
      a.reachEdge = reachEdge; a.reachCentre = reachCentre; a.xw = -1; a.stop = -1;
      if (k === 1) { a.lineInset = a.cls.bulb > 0 ? -(a.cls.bulb - 0.3) : 0.25; a.medianInset = a.h + 0.5; }
      else if (junction) {
        a.xw = a.cls.crosswalk ? reachEdge + 0.5 : -1;
        // no crossing on an arm too short to hold one: leave room for the far end's bulb or junction
        const room = a.other.segs.length === 1 ? a.h + a.cls.bulb + 0.5 : a.other.segs.length >= 3 || a.other.type === 'roundabout' ? a.h + 2.5 : 0.5;
        if (a.xw >= 0 && a.xw + 1.4 > a.len - room) a.xw = -1;
        a.stop = signal && k >= 3 ? (a.xw >= 0 ? a.xw + 1.4 + 0.3 : reachEdge + 0.6) : -1;
        a.lineInset = (a.xw >= 0 ? a.xw + 1.8 : reachCentre + 0.6) + (a.stop >= 0 ? 0.5 : 0) + (n.rb ? 0.4 : 0);
        a.medianInset = a.lineInset + 0.8;
      } else if (k === 2 && (arms[0].cls !== arms[1].cls || arms[0].seg.style !== arms[1].seg.style)) {
        const o = arms[0] === a ? arms[1] : arms[0]; a.lineInset = 0; a.medianInset = o.cls.median > 0 ? 0 : 1.5;
      } else { a.lineInset = 0; a.medianInset = 0; }
    }
    for (let i = 0; i < k; i++) arms[i]!.edgeInset = edgeInsetOf(n, arms, i);
  }
  /** chains of the given segments between terminal nodes, then the rings left over */
  private buildRoutes(free: Set<Seg>) {
    const visited = new Set<Seg>(), routes: Route[] = [];
    const terminal = (n: Node) => n.arms.length !== 2 || n.rb > 0 || n.arms[0].cls !== n.arms[1].cls || n.arms[0].seg.style !== n.arms[1].seg.style || n.arms[0].seg.kind !== n.arms[1].seg.kind;
    const walk = (start: Node, s0: Seg, ring: boolean) => {
      const nodes = [start], segs: Seg[] = []; let cur = start, s = s0;
      for (let guard = 0; guard < 100000; guard++) {
        visited.add(s); segs.push(s); const nx = s.a === cur ? s.b : s.a; nodes.push(nx); cur = nx;
        if (terminal(nx) || (ring && nx === start)) break;
        s = nx.segs[0] === s ? nx.segs[1] : nx.segs[0]; if (visited.has(s) || !free.has(s)) break;
      }
      return { nodes, segs };
    };
    const less = (p: Pt, q: Pt) => p.x < q.x || (p.x === q.x && p.y < q.y);
    const make = ({ nodes, segs }: { nodes: Node[]; segs: Seg[] }, s: Seg, closed: boolean): Route => {
      let list = closed ? nodes.slice(0, -1) : nodes;
      // a canonical direction (and start, for rings), so a route looks the same however it was walked
      if (!closed) { if (less(list[list.length - 1], list[0])) list = [...list].reverse(); }
      else {
        let m = 0; for (let i = 1; i < list.length; i++) if (less(list[i], list[m])) m = i;
        list = [...list.slice(m), ...list.slice(0, m)];
        if (list.length > 2 && less(list[list.length - 1], list[1])) list = [list[0], ...list.slice(1).reverse()];
      }
      const r: Route = { nodes: list, segs, pts: list.map(q => ({ x: q.x, y: q.y })), cls: s.cls, style: s.style, kind: s.kind, closed };
      if (!closed) { const n0 = list[0], n1 = list[list.length - 1]; r.a0 = n0.arms.find(a => a.other === list[1] && a.seg.cls === s.cls); r.a1 = n1.arms.find(a => a.other === list[list.length - 2] && a.seg.cls === s.cls); r.a0 ??= n0.arms[0]; r.a1 ??= n1.arms[0]; }
      return r;
    };
    for (const s of free) for (const n of [s.a, s.b]) if (terminal(n)) for (const s2 of n.segs) if (free.has(s2) && !visited.has(s2)) routes.push(make(walk(n, s2, false), s2, false));
    for (const s of free) if (!visited.has(s)) { const w = walk(s.a, s, true); routes.push(make(w, s, w.nodes[w.nodes.length - 1] === s.a)); }
    return routes;
  }

  private routeFeatures(r: Route): Fx {
    const p0 = r.pts[0], pN = r.pts[r.pts.length - 1];
    const fx = emptyFx(hashStr(`r${Math.min(p0.x, pN.x)},${Math.min(p0.y, pN.y)},${Math.max(p0.x, pN.x)},${Math.max(p0.y, pN.y)},${r.pts.length},${r.cls.id}`));
    const cls = r.cls, path = linePath(r.pts, r.closed), bb = bboxOf(r.pts, cls.h + cls.walk + 0.5);
    if (r.kind === SK.TUNNEL) {
      // underground: no paint, only the tunnel record and a portal where it meets the surface
      fx.tunnels.push({ pts: r.pts, w: 2 * cls.h, bbox: bboxOf(r.pts, cls.h + 1) });
      if (!r.closed) {
        const n = r.pts.length, hw = cls.h + cls.walk, ends: [Node, Pt][] = [[r.nodes[0], r.pts[1]], [r.nodes[r.nodes.length - 1], r.pts[n - 2]]];
        for (const [node, next] of ends) {
          if (!node.arms.some(a => a.seg.kind !== SK.TUNNEL)) continue;
          fx.portals.push({ x: node.x, y: node.y, dir: norm(sub(next, node)), hw, bbox: [node.x - hw - 4, node.y - hw - 4, node.x + hw + 4, node.y + hw + 4] });
        }
      }
      fx.bbox = bboxOf(r.pts, cls.h + cls.walk + 4);
      return fx;
    }
    fx.walkF.push(feat('stroke', path, 2 * (cls.h + cls.walk), cls.walkTex, walkOrder(cls.walkTex), bb));
    fx.asphF.push(feat('stroke', path, 2 * cls.h, cls.tex, cls.order, bb, 'butt', kerbed(cls)));
    // the markings' corner radius; a cart path's is tight, so its slab joints and wheel ruts stay on its narrow surface through a bend (T084)
    const rl = cls.noCars ? cls.h + 0.25 : cls.h + 1.75;
    if (kerbed(cls)) {
      const n = r.pts.length, runs = r.closed ? n : n - 1;
      for (let k = 0; k < runs; k++) {
        const a = r.pts[k], b = r.pts[(k + 1) % n], d = sub(b, a), L = vlen(d); if (L < 0.05) continue;
        const u = mul(d, 1 / L), nv = perp(u);
        for (const side of [1, -1]) { const nn = mul(nv, side); fx.slabRuns.push({ kind: 'straight', a, b, n: nn, w0: cls.h, w1: cls.h + cls.walk, visible: -(nn.x + nn.y) > 0.2, seed: (Math.abs(a.x * 73 + a.y * 151 + k * 7 + side * 3) | 0) }); }
      }
    }
    if (cls.median > 0) {
      const pts = r.closed ? r.pts : trimPolyline(r.pts, r.a0!.medianInset, r.a1!.medianInset);
      const mlen = pts ? pts.reduce((s, p, i) => (i ? s + vlen(sub(p, pts[i - 1])) : 0), 0) : 0;
      if (pts && pts.length >= 2 && (r.closed || mlen >= 3)) {
        fx.medianF.push(feat('stroke', roundedPath(pts, rl, r.closed), cls.median, 'grass', 0, bboxOf(pts, cls.median), 'round'));
        if (cls.medianTrees && r.kind !== SK.BRIDGE) walkAlong(pts, r.closed, 2.2, 4, (p, i) => fx.autoProps.push({ kind: 'tree', x: p.x, y: p.y, i }));
        if (cls.medianGarden && r.kind !== SK.BRIDGE) walkAlong(pts, r.closed, 1.6, 3, (p, i) => fx.autoProps.push({ kind: 'garden', x: p.x, y: p.y, i }));
      }
    }
    if (cls.streetTrees && r.kind !== SK.BRIDGE) {
      const n = r.pts.length, a0 = r.pts[0]!, a1 = r.pts[n - 1]!;
      for (const s of [1, -1]) walkAlong(offsetLine(r.pts, r.closed, s * (cls.h + cls.walk * 0.55)), r.closed, 2.2, 4, (p, i) => { if (!r.closed && (vlen(sub(p, a0)) < 3 || vlen(sub(p, a1)) < 3)) return; fx.autoProps.push({ kind: 'tree', x: p.x, y: p.y, i }); });
    }
    // street lamps on the sidewalks' outer half along every kerbed street and lane, and along the gravel roads the towns are built on (those
    // only where houses stand near: town), both sides, staggered (every 16 m, 24 m on lanes, as lampsAlongRoads placed them); the night
    // (night-light.ts) lights them
    if ((cls.walkTex === 'slabs' || cls.id === 'gravel') && r.kind !== SK.BRIDGE) {
      const n = r.pts.length, a0 = r.pts[0]!, a1 = r.pts[n - 1]!, step = cls.id === 'lane' ? 12 : 8, town = cls.id === 'gravel';
      for (const s of [1, -1]) walkAlong(offsetLine(r.pts, r.closed, s * (cls.h + cls.walk * 0.62)), r.closed, s > 0 ? 4 : 4 + step / 2, step, (p, i) => { if (!r.closed && (vlen(sub(p, a0)) < 3 || vlen(sub(p, a1)) < 3)) return; fx.autoProps.push({ kind: 'lamp', x: p.x, y: p.y, i, ...(town ? { town } : {}) }); });
    }
    // T228: a white edge line inside each kerb, from where the kerb runs straight at each end (Arm.edgeInset); the chunk bake breaks it at the
    // driveways, bus stops and on-street bays (cut patches, renderer.ts)
    if (edgeLines(cls)) {
      const eb = r.closed ? r.pts : trimPolyline(r.pts, r.a0!.edgeInset, r.a1!.edgeInset);
      if (eb && eb.length >= 2) { const bbE = bboxOf(eb, cls.h + 0.5); for (const s of [1, -1]) fx.lines.push({ pts: eb, closed: r.closed, width: EDGE_W, color: WHITE, dash: null, r: rl, offset: s * (cls.h - EDGE_IN), bbox: bbE, edge: true }); }
    }
    const base = r.closed ? r.pts : trimPolyline(r.pts, r.a0!.lineInset, r.a1!.lineInset);
    if (base && base.length >= 2) {
      const bb2 = bboxOf(base, cls.h + 0.5);
      const push = (width: number, color: string, dash: [number, number] | null, offset: number) => fx.lines.push({ pts: base, closed: r.closed, width, color, dash, r: rl, offset, bbox: bb2 });
      if (cls.shoulder > 0) { const e = cls.h - cls.shoulder; for (const s of [1, -1]) { push(cls.shoulder, 'rgba(255,255,255,0.035)', null, s * (e + cls.shoulder / 2)); push(0.1, YELLOW, null, s * e); } }
      for (const o of cls.laneLines) if (cls.oneway) push(0.1, WHITE, [1.2, 1.2], o); else for (const s of [1, -1]) push(0.1, WHITE, [1.2, 1.2], s * o);
      const centre = cls.centre === 'style' ? (r.style === 0 ? 'dashed' : r.style === 1 ? 'double' : 'none') : cls.centre;
      if (centre === 'dashed') push(0.12, YELLOW, cls.id === 'road' ? [2, 1.4] : [1.6, 1.2], 0);
      else if (centre === 'double') { push(0.1, YELLOW, null, 0.17); push(0.1, YELLOW, null, -0.17); }
      else if (centre === 'twltl') for (const s of [1, -1]) { push(0.1, YELLOW, null, s * 0.875); push(0.1, YELLOW, [1.6, 1.2], s * 0.7); }
      // the starter cart paths' surface marks (T084), as markings (world-anchored dashes, chipped a little by the wear like paint):
      // cement slabs a joint across the whole width every 1.5 tiles (3 m); packed dirt two darker wheel ruts and a ragged strip of grass between
      // (not on the narrow walking path: no carts)
      if (cls.tex === 'cement') push(2 * cls.h, CEMENT_JOINT, [0.06, 1.44], 0);
      else if (cls.tex === 'dirt' && cls.h >= 0.5) { for (const s of [1, -1]) push(0.14, DIRT_RUT, null, s * cls.h * 0.5); push(0.11, DIRT_GRASS, [0.6, 0.5], 0); }
      // a one-way route's flow: seg a to seg b; the first seg's a is nodes[0] means the flow runs in pts order
      if (cls.oneway) {
        const n0 = r.nodes[0], n1 = r.nodes[1], s0 = r.segs.find(s => (s.a === n0 && s.b === n1) || (s.a === n1 && s.b === n0));
        if (s0) fx.bars.push(...flowArrows(s0.a === n0 ? base : base.slice().reverse(), r.closed, cls.laneCentres));
      }
    }
    if (this.paintData) { if (r.kind !== SK.BRIDGE) this.decalsFor(r, fx.decals); fx.lazy = () => { const l = emptyLitter(); this.routeLitter(r, l); return l; }; }
    fx.bbox = bboxOf(r.pts, cls.h + cls.walk + 1.5);
    if (r.kind === SK.BRIDGE) { const bb4 = bboxOf(r.pts, cls.h + cls.walk + 4); fx.bridges.push({ pts: r.pts, hw: cls.h + cls.walk + 0.35, bbox: bb4 }); fx.bbox = unionBox(fx.bbox, bb4); }
    return fx;
  }

  private nodeFeatures(n: Node): Fx | null {
    const arms = n.arms, k = arms.length; if (!k || arms.every(a => a.seg.kind === SK.TUNNEL)) return null;
    const fx = emptyFx(hashStr(`n${n.x},${n.y}`)), N = { x: n.x, y: n.y };
    const { walkF, asphF, medianF, islandF, rbIslands, lines, zebra, bars, tyres, slabRuns } = fx, auto = fx.autoProps;
    let bb: BBox = bboxOf([N], 1);
    if (k === 1) {
      const a = arms[0], ra = a.h + a.cls.bulb, bbw = bboxOf([N], ra + a.walk + 0.3);
      walkF.push(feat('disc', discPath(N, ra + a.walk), 0, a.cls.walkTex, walkOrder(a.cls.walkTex), bbw));
      asphF.push(feat('disc', discPath(N, ra), 0, a.cls.tex, a.cls.order, bbw, 'butt', kerbed(a.cls)));
      if (kerbed(a.cls)) slabRuns.push({ kind: 'arc', c: N, r0: ra, r1: ra + a.walk, a0: a.ang + 0.3, a1: a.ang + TAU - 0.3, seed: (Math.abs(n.x * 31 + n.y * 17) | 0) });
    } else if (n.rb && n.type !== 'mini') {
      const R = n.rb, wmax = Math.max(...arms.map(a => a.walk)), top = arms.reduce((p, q) => (q.cls.order > p.cls.order ? q : p)), bbd = bboxOf([N], R + wmax + 0.3);
      walkF.push(feat('disc', discPath(N, R + wmax), 0, top.cls.walkTex, walkOrder(top.cls.walkTex), bbd));
      asphF.push(feat('disc', discPath(N, R), 0, top.cls.tex, top.cls.order, bbd, 'butt', kerbed(top.cls)));
      if (kerbed(top.cls)) slabRuns.push({ kind: 'arc', c: N, r0: R, r1: R + wmax, a0: 0, a1: TAU, seed: (Math.abs(n.x * 31 + n.y * 17) | 0) });
      for (const a of arms) for (const side of [1, -1] as const) {
        const f = rbFillet(N, a.dir, a.h, R, 1.5, side); if (f) asphF.push(feat('poly', f.path, 0, a.cls.tex, a.cls.order, f.bbox, 'butt', kerbed(a.cls)));
        const g = rbFillet(N, a.dir, a.h + a.walk, R + wmax, Math.max(0.2, 1.5 - a.walk), side); if (g) walkF.push(feat('poly', g.path, 0, a.cls.walkTex, walkOrder(a.cls.walkTex), g.bbox));
      }
      const rl = n.rl ?? 1;
      rbIslands.push({ x: n.x, y: n.y, r: R - rl * RB_LANE });
      auto.push({ kind: 'rbtree', x: n.x, y: n.y, i: 0 });
      for (const a of arms) {
        const rn = { x: a.dir.y, y: -a.dir.x }, m = a.cls.median / 2, at = add(N, mul(a.dir, R + 0.35));
        const p0 = add(at, mul(rn, m + 0.2)), p1 = add(at, mul(rn, a.h - 0.2));
        lines.push({ pts: [p0, p1], closed: false, width: 0.3, color: WHITE, dash: [0.45, 0.3], r: 0, offset: 0, bbox: bboxOf([p0, p1], 0.5) });
      }
      // a dashed white circle between each pair of ring lanes (2 and 3 lanes)
      for (let k = 1; k < rl; k++) {
        const Rk = R - k * RB_LANE, ring: Pt[] = [];
        for (let i = 0; i < 64; i++) ring.push({ x: n.x + Math.cos((Math.PI * 2 * i) / 64) * Rk, y: n.y + Math.sin((Math.PI * 2 * i) / 64) * Rk });
        lines.push({ pts: ring, closed: true, width: 0.3, color: WHITE, dash: [0.45, 0.3], r: 0, offset: 0, bbox: bboxOf(ring, 0.5) });
      }
    } else {
      for (let i = 0; i < k; i++) {
        const A = arms[i], B = arms[(i + 1) % k];
        const phi = (((B.ang - A.ang) % TAU) + TAU) % TAU;
        if (phi < 0.12) continue;
        // (the outside of a bend in one road, one class, style and kind, is the route's own round join: left as it is)
        const oneRoad = k === 2 && A.cls === B.cls && A.seg.style === B.seg.style && A.seg.kind === B.seg.kind;
        if (!(phi > Math.PI && oneRoad)) 
        // the surface between the two arms' facing kerbs, from the node to where the kerbs meet (N, A's kerb at the node, the corner, B's), on
        // the inside of a corner and on the outside too (a bend's outer kerbs meet behind the node: two road types turning a corner left its
        // outer square bare, the owner's screenshot, 2026-10-19): a
        // wide road whose end the other roads leave at an angle left triangles past the node unpaved, beside them and in the V between two
        // arms (the owner's screenshots, 2026-10-19). It lies between kerbs, so it never paves past one
        {
          const FA = add(N, mul(perp(A.dir), A.h)), FB = sub(N, mul(perp(B.dir), B.h)), Cq = lineHit(FA, A.dir, FB, B.dir), top = A.cls.order >= B.cls.order ? A : B;
          // (a corner behind the node on either arm only when near: two arms nearly straight on met their kerbs 19 tiles up the narrow one and
          // painted the wide road's asphalt up it, the owner's screenshot)
          const near = (c: Pt, r: number) => (dot(sub(c, N), A.dir) >= -0.01 && dot(sub(c, N), B.dir) >= -0.01) || vlen(sub(c, N)) <= r;
          if (Cq && vlen(sub(Cq, N)) < 4 * (A.h + B.h) + 8 && near(Cq, Math.max(A.h, B.h) + 4)) { const q = [N, FA, Cq, FB]; asphF.push(feat('poly', polyPath(q), 0, top.cls.tex, top.cls.order, bboxOf(q, 0.3), 'butt', kerbed(top.cls))); }
          // the same for the walks (under the asphalt): the walk round the corner runs on from one arm's to the other's instead of stopping square at
          // the node (the owner's screenshot: a wide road's sidewalk ended short of the crossing road's)
          const WA = add(N, mul(perp(A.dir), A.h + A.walk)), WB = sub(N, mul(perp(B.dir), B.h + B.walk)), Cw = lineHit(WA, A.dir, WB, B.dir), wt = (A.walk >= B.walk ? A : B).cls.walkTex;
          if (Cw && vlen(sub(Cw, N)) < 4 * (A.h + B.h + A.walk + B.walk) + 8 && near(Cw, Math.max(A.h + A.walk, B.h + B.walk) + 4)) { const q = [N, WA, Cw, WB]; walkF.push(feat('poly', polyPath(q), 0, wt, walkOrder(wt), bboxOf(q, 0.3))); }
        }
        if (phi > Math.PI - 0.05) continue;
        const tan = Math.tan(phi / 2), minLen = Math.min(A.len, B.len);
        const slip = slipOn(n, A, B);
        let R = slip ? R_SLIP : Math.min(A.cls.rConcave, B.cls.rConcave);
        if (n.wide && !slip) R *= WIDE_CORNER;
        // a sharp corner rounds wider (x 1.2 rad / phi under about 70 degrees): at a fixed radius the tip of the corner between two roads
        // meeting at 30 degrees stayed a grass sliver several tiles long (the junction gallery, 2026-10-19)
        if (!slip && phi < 1.2) R *= 1.2 / phi;
        R = Math.min(R, 0.45 * minLen * tan); if (R < 0.15) continue;
        const wide = A.cls.order >= B.cls.order ? A : B;
        const cp = cornerPatch(N, A.dir, A.h, B.dir, B.h, phi, R); if (!cp) continue;
        asphF.push(feat('poly', cp.path, 0, wide.cls.tex, wide.cls.order, cp.bbox, 'butt', kerbed(wide.cls)));
        const wp = cornerPatch(N, A.dir, A.h + A.walk, B.dir, B.h + B.walk, phi, Math.max(0.08, R - (A.walk + B.walk) / 2));
        if (wp) { const wt = (A.walk >= B.walk ? A : B).cls.walkTex; walkF.push(feat('poly', wp.path, 0, wt, walkOrder(wt), wp.bbox)); }
        if (kerbed(A.cls) || kerbed(B.cls)) {
          const wk = Math.max(A.walk, B.walk), aa = Math.atan2(cp.TA.y - cp.Q.y, cp.TA.x - cp.Q.x), ab = Math.atan2(cp.TB.y - cp.Q.y, cp.TB.x - cp.Q.x);
          let d = angDelta(aa, ab); if (Math.abs(d) < 1e-6) d = 0.01;
          slabRuns.push({ kind: 'arc', c: cp.Q, r0: Math.max(0.05, R - wk), r1: R + 0.02, a0: d > 0 ? aa : ab, a1: d > 0 ? ab : aa, seed: (Math.abs(n.x * 13 + n.y * 29 + i * 5) | 0) });
        }
        if (slip && R >= 9) { const isl = slipIsland(N, A, B, cp.Q, R); if (isl) islandF.push(feat('poly', isl.path, 0, 'pad', 0, isl.bbox)); }
        if ((n.type === 'signal' || n.type === 'slip') && k >= 3) { const p = add(cp.C, mul(cp.bis, R / Math.sin(phi / 2) - R + 0.6)); auto.push({ kind: 'light', x: p.x, y: p.y, i }); }
      }
      if (k === 2 && arms[0].cls !== arms[1].cls && dot(arms[0].dir, arms[1].dir) < -0.96) {
        const [wide, narrow] = arms[0].h >= arms[1].h ? [arms[0], arms[1]] : [arms[1], arms[0]];
        const T = Math.min(2.5, 0.6 * narrow.len), nn = perp(narrow.dir), E = add(N, mul(narrow.dir, T));
        const poly = (hw: number, hn: number) => [add(N, mul(nn, hw)), add(E, mul(nn, hn)), sub(E, mul(nn, hn)), sub(N, mul(nn, hw))];
        const pa = poly(wide.h, narrow.h), pw = poly(wide.h + wide.walk, narrow.h + narrow.walk);
        asphF.push(feat('poly', polyPath(pa), 0, wide.cls.tex, wide.cls.order, bboxOf(pa, 0.3), 'butt', kerbed(wide.cls)));
        walkF.push(feat('poly', polyPath(pw), 0, wide.cls.walkTex, walkOrder(wide.cls.walkTex), bboxOf(pw, 0.3)));
      }
      // a gravel road (no kerb) meeting a road with sidewalks: the sidewalk wraps round the corners on to it and runs along both its edges at
      // full width to the mouth, then tapers off to nothing over GRAVEL_TAPER tiles (the owner, 2026-10-19: "pavement around the outside and
      // then tapers off slowly to nothing")
      const slab = arms.filter(x => kerbed(x.cls)), sw = slab.length ? Math.max(...slab.map(x => x.walk)) : 0;
      if (k >= 2 && sw > 0) for (const a of arms) {
        if (kerbed(a.cls) || a.cls.walkTex !== 'gravel') continue;
        const t0 = Math.min(a.len * 0.5, a.reachEdge + a.cls.rConcave + 0.35), t1 = Math.min(a.len * 0.6, t0 + GRAVEL_TAPER), m0 = add(N, mul(a.dir, t0)), m1 = add(N, mul(a.dir, t1));
        for (const sg of [1, -1] as const) {
          const nv = mul(a.nrm, sg), q = [add(N, mul(nv, a.h)), add(N, mul(nv, a.h + sw)), add(m0, mul(nv, a.h + sw)), add(m1, mul(nv, a.h)), add(m0, mul(nv, a.h))];
          walkF.push(feat('poly', polyPath(q), 0, 'slabs', walkOrder('slabs'), bboxOf(q, 0.3)));
        }
      }
      // each arm paved (and its walk laid) from the node out to where its road's own surface starts (the route's end inset): the boxes and corner
      // patches left wedges where an arm's surface starts far out, as a street meeting a wide road at 45 degrees, or a wide one-way turning at
      // a junction (the owner, 2026-10-19: "this wedge missing instead of a smooth turn")
      // two arms straight on (within about 30 degrees) at a junction of 3+ with different widths: a taper on each side no other arm joins, from the wide edge at the node
      // to the narrow edge (over twice the step, 2.5 tiles at least); without it the wide road's kerb stopped at the node and the narrow road's
      // started a step in, a jagged notch (the owner's screenshot of a wide one-way turning with a street straight on, 2026-10-19)
      if (k >= 3) for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
        const P = arms[i]!, R2 = arms[j]!; if (dot(P.dir, R2.dir) >= -0.85 || Math.abs(P.h + P.walk - R2.h - R2.walk) < 0.3) continue;
        const [wide, narrow] = P.h + P.walk >= R2.h + R2.walk ? [P, R2] : [R2, P], nn = perp(narrow.dir);
        const T = Math.min(Math.max(2.5, 2 * (wide.h + wide.walk - narrow.h - narrow.walk)), 0.6 * narrow.len), E = add(N, mul(narrow.dir, T));
        for (const sg of [1, -1] as const) {
          const sv = mul(nn, sg); if (arms.some(o => o !== wide && o !== narrow && dot(o.dir, sv) > 0.15)) continue;
          const pa = [N, add(N, mul(sv, wide.h)), add(E, mul(sv, narrow.h)), E], pw = [N, add(N, mul(sv, wide.h + wide.walk)), add(E, mul(sv, narrow.h + narrow.walk)), E];
          walkF.push(feat('poly', polyPath(pw), 0, wide.cls.walkTex, walkOrder(wide.cls.walkTex), bboxOf(pw, 0.3)));
          asphF.push(feat('poly', polyPath(pa), 0, wide.cls.tex, wide.cls.order, bboxOf(pa, 0.3), 'butt', kerbed(wide.cls)));
        }
      }
      if (k >= 3) for (const a of arms) {
        const t = a.reachEdge + (n.type === 'slip' ? R_SLIP : a.cls.rConcave) + 0.35, e = add(N, mul(a.dir, t));
        const band = (h: number) => [add(N, mul(a.nrm, h)), add(e, mul(a.nrm, h)), sub(e, mul(a.nrm, h)), sub(N, mul(a.nrm, h))], pa = band(a.h), pw = band(a.h + a.walk);
        walkF.push(feat('poly', polyPath(pw), 0, a.cls.walkTex, walkOrder(a.cls.walkTex), bboxOf(pw, 0.3)));
        asphF.push(feat('poly', polyPath(pa), 0, a.cls.tex, a.cls.order, bboxOf(pa, 0.3), 'butt', kerbed(a.cls)));
      }
      if (k >= 3) for (const A of arms) for (const B of arms) {
        if (A === B || A.cls.order <= B.cls.order) continue;
        // (not past about 150 degrees: the box of two roads nearly straight on stretched 16 tiles up the narrow one, the owner's screenshot)
        const th = Math.acos(clamp(dot(A.dir, B.dir), -1, 1)); if (th < 0.2 || th > 2.6) continue;
        const pts: Pt[] = [];
        for (const [sa, sb] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) { const p = lineHit(add(N, mul(A.nrm, sa * A.h)), A.dir, add(N, mul(B.nrm, sb * B.h)), B.dir); if (p) pts.push(p); }
        if (pts.length < 4) continue;
        const poly = B.hasOpp ? pts : clipPoly(pts, N, B.dir);
        if (poly.length >= 3) asphF.push(feat('poly', polyPath(poly), 0, A.cls.tex, A.cls.order, bboxOf(poly, 0.3), 'butt', kerbed(A.cls)));
      }
    }
    // a mini-roundabout: a white island with a yellow rim in the plain crossing, and a dashed give-way line across each inbound approach at the ring's edge
    if (n.type === 'mini') {
      const R = n.rb, ring = (r: number) => { const P: Pt[] = []; for (let i = 0; i < 24; i++) P.push({ x: n.x + Math.cos((Math.PI * 2 * i) / 24) * r, y: n.y + Math.sin((Math.PI * 2 * i) / 24) * r }); return P; };
      // the white fill: one closed stroke of radius MINI_ISLAND / 2 and width MINI_ISLAND covers the disc
      const fill = ring(MINI_ISLAND / 2), rim = ring(MINI_ISLAND);
      lines.push({ pts: fill, closed: true, width: MINI_ISLAND, color: WHITE, dash: null, r: 0, offset: 0, bbox: bboxOf(fill, MINI_ISLAND / 2 + 0.2) });
      lines.push({ pts: rim, closed: true, width: 0.15, color: YELLOW, dash: null, r: 0, offset: 0, bbox: bboxOf(rim, 0.3) });
      for (const a of arms) {
        if (a.cls.oneway && a.seg.a === n) continue;
        const rn = { x: a.dir.y, y: -a.dir.x }, lo = a.cls.oneway ? -a.h + 0.2 : a.cls.median / 2 + 0.2, at = add(N, mul(a.dir, R + 0.35));
        const p0 = add(at, mul(rn, lo)), p1 = add(at, mul(rn, a.h - 0.2));
        lines.push({ pts: [p0, p1], closed: false, width: 0.3, color: WHITE, dash: [0.45, 0.3], r: 0, offset: 0, bbox: bboxOf([p0, p1], 0.5) });
      }
    }
    if (k >= 3 || n.rb) for (const a of arms) {
      const rn = { x: a.dir.y, y: -a.dir.x }, m = a.cls.median / 2;
      if (a.xw >= 0) {
        const count = Math.max(2, Math.floor((2 * a.h - 0.3) / 0.7)), total = count * 0.38 + (count - 1) * 0.32, p = new Path2D();
        for (let i = 0; i < count; i++) {
          const l0 = -total / 2 + i * 0.7, l1 = l0 + 0.38;
          const q = [add(add(N, mul(a.dir, a.xw)), mul(a.nrm, l0)), add(add(N, mul(a.dir, a.xw + 1.4)), mul(a.nrm, l0)), add(add(N, mul(a.dir, a.xw + 1.4)), mul(a.nrm, l1)), add(add(N, mul(a.dir, a.xw)), mul(a.nrm, l1))];
          p.moveTo(q[0].x, q[0].y); for (let j = 1; j < 4; j++) p.lineTo(q[j].x, q[j].y); p.closePath();
        }
        zebra.push({ path: p, bbox: bboxOf([add(N, mul(a.dir, a.xw))], a.h + 1.5) });
      }
      // a one-way arm: an inbound one's stop bar spans the whole width, an outbound one has none
      if (a.stop >= 0 && !(a.cls.oneway && a.seg.a === n)) {
        const lo = a.cls.oneway ? -a.h : m;
        const q = [add(add(N, mul(a.dir, a.stop)), mul(rn, lo + 0.15)), add(add(N, mul(a.dir, a.stop + 0.35)), mul(rn, lo + 0.15)), add(add(N, mul(a.dir, a.stop + 0.35)), mul(rn, a.h - 0.15)), add(add(N, mul(a.dir, a.stop)), mul(rn, a.h - 0.15))];
        bars.push({ path: polyPath(q), bbox: bboxOf(q, 0.3) });
      }
      if (a.h >= 2 && a.len > (a.stop >= 0 ? a.stop : a.reachEdge) + 7) {
        const lane = (m + a.h) / 2, start = a.stop >= 0 ? a.stop + 0.5 : a.xw >= 0 ? a.xw + 1.6 : a.reachEdge + 0.4;
        tyres.push({ x: n.x, y: n.y, ang: a.ang, start, lat: [lane - 0.55, lane + 0.55], len: 4.5 });
        bb = unionBox(bb, bboxOf([add(N, mul(a.dir, start + 4.5))], a.h + 1));
      }
    }
    // turn arrows (n.tl, 3+ arms; the lane graph's rule: lane 0 turns left, the other lanes go straight and the last one right too),
    // on each approach with 2+ lanes, 3 m before its stop line (or its corner); white bars, so the wear mask chips them too
    if (n.tl && k >= 3 && !n.rb) for (const a of arms) {
      // an outbound-only one-way arm has no lanes to turn from; a one-way inbound arm's signed lane centres are used as they are (the offsets mirror towards its own side)
      if (a.cls.oneway && a.seg.a === n) continue;
      const nl = a.cls.laneCentres.length, t = (a.stop >= 0 ? a.stop + 0.35 : a.reachEdge + a.cls.rConcave + 0.3) + 1.5;
      if (nl < 2 || t + 1.5 > a.len) continue;
      for (let j = 0; j < nl; j++) {
        const c = a.cls.laneCentres[j], sg = a.cls.oneway ? Math.sign(c) : 1, put = (kind: 'S' | 'L' | 'R', lat: number) => { const q = arrowPts(N, a, t, lat, kind); bars.push({ path: polyPath(q), bbox: bboxOf(q, 0.3) }); };
        if (j === 0) put('L', c);
        else { put('S', c - 0.35 * sg); if (j === nl - 1) put('R', c + 0.2 * sg); }
      }
    }
    if (this.paintData && (k === 1 || (n.rb && n.type !== 'mini'))) fx.lazy = () => { const l = emptyLitter(); this.nodeLitter(n, l); return l; };
    // leaves reach at most a sidewalk past the curb
    if (k === 1) bb = unionBox(bb, bboxOf([N], arms[0].h + arms[0].cls.bulb + arms[0].walk + 1));
    if (n.rb) bb = unionBox(bb, bboxOf([N], n.rb + 2));
    for (const list of [walkF, asphF, medianF, islandF]) for (const f of list) bb = unionBox(bb, f.bbox);
    for (const list of [lines, zebra, bars]) for (const f of list) bb = unionBox(bb, f.bbox);
    for (const a of auto) bb = unionBox(bb, [a.x - 1, a.y - 1, a.x + 1, a.y + 1]);
    for (const s of slabRuns) if (s.kind === 'arc') bb = unionBox(bb, bboxOf([s.c], s.r1 + 0.5));
    fx.bbox = [bb[0] - 0.5, bb[1] - 0.5, bb[2] + 0.5, bb[3] + 0.5];
    return fx;
  }

  /** Fallen leaves exactly as the builder scatters them (town-scene.mjs placeLeaves): gutter clumps, strays onto the
   *  road, clumps on the sidewalk and along its outer edge, plus curb joints and polished wheel paths. */
  private litterRun(fx: Litter, P: Pt, u: Pt, nIn: Pt, len: number, walk: number, r: () => number, g: () => number, curbed: boolean, half: number) {
    const lenM = len * 2, pts: [number, number, string][] = [];
    if (curbed) {
      for (let a = 0; a < lenM;) { a += 0.8 + r() * 3; if (a >= lenM) break; if (r() < 0.25) continue; const n = 4 + Math.floor(r() * r() * 24); for (let i = 0; i < n; i++) pts.push([clamp(a + g() * 0.65, 0, lenM - 0.01), 0.06 + Math.abs(g()) * 0.24 + r() * r() * 0.5, 'gutter']); }
    } else for (let a = 0; a < lenM;) { a += 1.6 + r() * 4; if (a >= lenM) break; if (r() < 0.5) continue; const n = 2 + Math.floor(r() * r() * 10); for (let i = 0; i < n; i++) pts.push([clamp(a + g() * 0.65, 0, lenM - 0.01), 0.06 + Math.abs(g()) * 0.3 + r() * r() * 0.6, 'gutter']); }
    for (let a = 0; a < lenM;) { a += 0.7 + r() * 2.2; if (a >= lenM) break; const d = 0.35 - Math.log(1 - r() * 0.985) * 0.75; if (d < Math.min(3.15, half * 2 - 0.3)) pts.push([a, d, 'stray']); }
    const walkM = walk * 2;
    if (curbed) for (let a = 0; a < lenM; a += 5) { if (r() > 0.38) continue; const c0 = a + r() * 5, n = 4 + Math.floor(r() * 12), edge = r() < 0.6; for (let i = 0; i < n; i++) pts.push([clamp(c0 + g() * 1.1, 0, lenM - 0.01), edge ? -(walkM - 0.15 - Math.abs(g()) * 0.45) : -(0.35 + r() * (walkM - 0.5)), 'walk']); }
    for (let a = 0; a < lenM; a += 0.6 + r() * 1.6) { if (r() < 0.45) continue; const n = 1 + Math.floor(r() * 4); for (let i = 0; i < n; i++) pts.push([clamp(a + g() * 0.3, 0, lenM - 0.01), -(walkM + 0.04 + Math.abs(g()) * 0.3), 'edge']); }
    for (const [al, d, kind] of pts) { const p = add(add(P, mul(u, al / 2)), mul(nIn, d / 2)); fx.leaves.push({ x: p.x, y: p.y, ang: r() * Math.PI * 2, s: leafSize(r, kind), c: kind === 'edge' ? 1 : 0 }); }
    if (curbed && r() < 0.5) for (let a = 0.3 + r() * 1.5; a < len; a += 0.4 + r() * 1.4) if (r() < 0.5) { const p = add(add(P, mul(u, a)), mul(nIn, -walk)); fx.tufts.push({ x: p.x, y: p.y, ang: Math.atan2(-nIn.y, -nIn.x), v: (r() * 3) | 0 }); }
  }
  private routeLitter(rt: Route, fx: Litter) {
    const cls = rt.cls, curbed = cls.walkTex === 'slabs', p0 = rt.pts[0];
    const rng = mulberry((((p0.x * 2654435) ^ (p0.y * 40503) ^ (rt.pts.length * 977)) >>> 0) ^ 0x5bd1e995), g = gaussOf(rng);
    const wl = rt.closed ? rt.pts : trimPolyline(rt.pts, Math.max(0, rt.a0!.lineInset), Math.max(0, rt.a1!.lineInset));
    if (wl && wl.length >= 2) { const offs: number[] = []; for (const lc of cls.laneCentres) for (const sgn of [1, -1]) offs.push(sgn * (lc - 0.42), sgn * (lc + 0.42)); fx.wear.push({ pts: wl, closed: rt.closed, r: cls.h + 1.75, h: cls.h, offsets: offs, bbox: bboxOf(wl, cls.h + 0.5) }); }
    const endInset = (n: Node, a: Arm) => n.rb ? n.rb + 1.8 : n.arms.length >= 3 ? a.reachEdge + (n.type === 'slip' ? R_SLIP : cls.rConcave) + 0.3 : n.arms.length === 2 ? 0.6 : 0;
    const base = rt.closed ? rt.pts : trimPolyline(rt.pts, endInset(rt.nodes[0], rt.a0!), endInset(rt.nodes[rt.nodes.length - 1], rt.a1!));
    if (!base || base.length < 2) return;
    const n = base.length, runs = rt.closed ? n : n - 1;
    for (let k = 0; k < runs; k++) {
      const a = base[k], b = base[(k + 1) % n], d = sub(b, a), L = vlen(d); if (L < 0.3) continue;
      const u = mul(d, 1 / L), nv = perp(u);
      for (const side of [1, -1]) { const nIn = mul(nv, -side), P = add(a, mul(nv, side * cls.h)); this.litterRun(fx, P, u, nIn, L, cls.walk, rng, g, curbed, cls.h); }
      // a dirt path (T084): grass tufts growing in over both soft edges, leaning onto the path
      if (cls.tex === 'dirt') for (const side of [1, -1]) for (let t = 0.2 + rng() * 0.6; t < L; t += 0.25 + rng() * 0.7) if (rng() < 0.7) { const p = add(add(a, mul(u, t)), mul(nv, side * (cls.h - 0.04 + (rng() - 0.5) * 0.12))); fx.tufts.push({ x: p.x, y: p.y, ang: Math.atan2(-nv.y * side, -nv.x * side) + (rng() - 0.5) * 0.8, v: (rng() * 3) | 0 }); }
      if (cls.median > 0) for (const side of [1, -1]) { const nIn = mul(nv, side), P = add(a, mul(nv, side * cls.median / 2)); this.litterRun(fx, P, u, nIn, L, 0, rng, g, false, cls.median / 2); }
      if (curbed) { const nSlab = Math.max(1, Math.round(L / 1.25)); for (let j = 0; j <= nSlab; j++) { const q = add(a, mul(u, (L * j) / nSlab)); for (const side of [1, -1]) { const c0 = add(q, mul(nv, side * cls.h)), c1 = add(q, mul(nv, side * (cls.h + 0.12))); fx.joints.push({ a: c0, b: c1 }); } } }
    }
  }
  private nodeLitter(n: Node, fx: Litter) {
    if (n.arms.length === 1 && n.arms[0].cls.walkTex === 'slabs') {
      const a = n.arms[0], R = a.h + a.cls.bulb, rng = mulberry(((n.x * 7919) ^ (n.y * 104729) ^ 0x9e37) >>> 0), g = gaussOf(rng), back = a.ang + Math.PI;
      const span = Math.PI * 2 - 0.9, start = back - span / 2 + Math.PI, steps = Math.ceil(span * R / 2.5);
      for (let i = 0; i < steps; i++) { const t0 = start + (span * i) / steps, t1 = start + (span * (i + 1)) / steps, P = { x: n.x + Math.cos(t0) * R, y: n.y + Math.sin(t0) * R }, Q = { x: n.x + Math.cos(t1) * R, y: n.y + Math.sin(t1) * R }, d = sub(Q, P), L = vlen(d); if (L < 0.05) continue; const u = mul(d, 1 / L), nIn = norm(sub(n, P)); this.litterRun(fx, P, u, nIn, L, a.walk, rng, g, true, R); }
    }
    if (n.rb && n.type !== 'mini') {
      const rng = mulberry(((n.x * 7919) ^ (n.y * 104729)) >>> 0), g = gaussOf(rng), R = n.rb, steps = Math.ceil(Math.PI * 2 * R / 2.5);
      for (let i = 0; i < steps; i++) { const t0 = (Math.PI * 2 * i) / steps, t1 = (Math.PI * 2 * (i + 1)) / steps, P = { x: n.x + Math.cos(t0) * R, y: n.y + Math.sin(t0) * R }, Q = { x: n.x + Math.cos(t1) * R, y: n.y + Math.sin(t1) * R }, d = sub(Q, P), L = vlen(d), u = mul(d, 1 / L), nIn = norm(sub(n, P)); this.litterRun(fx, P, u, nIn, L, 1, rng, g, true, R); }
      const ri = R - (n.rl ?? 1) * RB_LANE;
      for (let i = 0; i < steps; i++) { const t0 = (Math.PI * 2 * i) / steps, t1 = (Math.PI * 2 * (i + 1)) / steps, P = { x: n.x + Math.cos(t0) * ri, y: n.y + Math.sin(t0) * ri }, Q = { x: n.x + Math.cos(t1) * ri, y: n.y + Math.sin(t1) * ri }, d = sub(Q, P), L = vlen(d), u = mul(d, 1 / L), nIn = norm(sub(P, n)); this.litterRun(fx, P, u, nIn, L, 0, rng, g, false, RB_LANE); }
    }
  }
  /** Street lamps (world positions, tiles) snap to the nearest curb within 2.5 tiles; the pool sits on the curb point.
   *  Returns the boxes whose ground changed. */
  setLamps(lamps: Pt[]): BBox[] {
    const pools: Pool[] = [];
    for (const l of lamps) {
      let best: { d: number; p: Pt } | null = null;
      for (const s of this.segsNear(l, 12)) {
        const d = sub(s.b, s.a), L = vlen(d), u = mul(d, 1 / L), t = clamp(dot(sub(l, s.a), u), 0, L), q = add(s.a, mul(u, t)), off = sub(l, q), dist = vlen(off);
        const side = dist > 1e-6 ? mul(off, 1 / dist) : perp(u), curb = add(q, mul(side, s.cls.h)), dc = Math.abs(dist - s.cls.h);
        if (dc < 2.5 && (!best || dc < best.d)) best = { d: dc, p: curb };
      }
      if (best) pools.push({ x: best.p.x, y: best.p.y, strength: 1 });
    }
    const key = (p: Pool) => p.x.toFixed(3) + ',' + p.y.toFixed(3), before = new Set(this.pools.map(key)), after = new Set(pools.map(key)), changed: BBox[] = [];
    for (const p of this.pools) if (!after.has(key(p))) changed.push([p.x - 9, p.y - 9, p.x + 9, p.y + 9]);
    for (const p of pools) if (!before.has(key(p))) changed.push([p.x - 9, p.y - 9, p.x + 9, p.y + 9]);
    this.pools = pools; this.poolGrid.clear(); for (const p of pools) this.poolGrid.add(p, [p.x - 9, p.y - 9, p.x + 9, p.y + 9]);
    return changed;
  }
  private decalsFor(r: Route, out: Decal[]) {
    if (r.cls.tex === 'gravel') return; // unpaved (a gravel surface, the town's gravel and the gravel drive): no manholes, drains or patches
    if (r.cls.noCars) return; // a cart path (T084): no drains, oil or patches (and no lanes to place them by)
    const cls = r.cls, p0 = r.pts[0], rng = mulberry(((p0.x * 73856093) ^ (p0.y * 19349663) ^ (cls.order * 83492791)) >>> 0);
    const curbed = cls.walkTex === 'slabs';
    const weights: [DecalType, number][] = curbed ? [['manhole', 2], ['drain', 2.5], ['oil', 1.5], ['patch', cls.id === 'lane' ? 2.5 : 1]] : [['manhole', 0.4], ['oil', 2], ['patch', 2]];
    const wsum = weights.reduce((s, w) => s + w[1], 0);
    const pick = () => { let v = rng() * wsum; for (const [t, w] of weights) { v -= w; if (v <= 0) return t; } return weights[0][0]; };
    const n = r.pts.length, runs = r.closed ? n : n - 1;
    for (let k = 0; k < runs; k++) {
      const a = r.pts[k], b = r.pts[(k + 1) % n], d = sub(b, a), L = vlen(d), dir = mul(d, 1 / L), nrm = perp(dir), ang = Math.atan2(dir.y, dir.x);
      const s0 = (k === 0 && !r.closed ? Math.max(0, r.a0!.lineInset) : 0) + 1.5, s1 = L - (k === runs - 1 && !r.closed ? Math.max(0, r.a1!.lineInset) : 0) - 1.5;
      for (let s = s0 + rng() * 3; s < s1; s += 3.5 + rng() * 4) {
        const t = pick(), sign = rng() < 0.5 ? 1 : -1, lane = cls.laneCentres[(rng() * cls.laneCentres.length) | 0] * sign;
        let lat = 0;
        switch (t) {
          case 'manhole': lat = lane + (rng() - 0.5) * 0.3; break;
          case 'drain': lat = (cls.h - 0.32) * sign; break;
          case 'oil': lat = lane + (rng() - 0.5) * 0.8; break;
          case 'patch': lat = lane + (rng() - 0.5) * 0.4; break;
        }
        const p = add(add(a, mul(dir, s)), mul(nrm, lat));
        out.push({ t, x: p.x, y: p.y, ang, s: (t === 'patch' && cls.id === 'lane' ? 0.6 : 0.85) + rng() * 0.3, seed: (rng() * 1e6) | 0 });
      }
    }
  }
}

const feat = (kind: Feature['kind'], path: Path2D, w: number, tex: string, order: number, bbox: BBox, cap: Feature['cap'] = 'butt', kerb = true): Feature => ({ kind, path, w, tex, order, bbox, cap, kerb });
const kerbed = (c: RoadClass) => c.walkTex === 'slabs';
/** how far a sidewalk that wrapped on to a gravel road at a junction runs on along its edges before it is gone (tiles) */
const GRAVEL_TAPER = 10;
const walkOrder = (t: string) => (t === 'slabs' ? 1 : 0);
const gaussOf = (r: () => number) => () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
const leafSize = (r: () => number, k: string) => { const u = r(); return (k === 'stray' ? 0.96 : 1) * (u < 0.22 ? 0.11 + r() * 0.08 : u < 0.58 ? 0.2 + r() * 0.1 : u < 0.88 ? 0.32 + r() * 0.15 : 0.49 + r() * 0.16); };

/** occupancy for a box: the ground features drawn into a 1 px-per-tile canvas (red walk, green asphalt, blue median) */
function canvasOccRaster(net: RoadNetwork, box: BBox) {
  const x0 = Math.max(0, Math.floor(box[0]) - 1), y0 = Math.max(0, Math.floor(box[1]) - 1), x1 = Math.min(MAP, Math.ceil(box[2]) + 1), y1 = Math.min(MAP, Math.ceil(box[3]) + 1);
  const W = x1 - x0, H = y1 - y0; if (W <= 0 || H <= 0) return;
  const c = new OffscreenCanvas(W, H), ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(1, 0, 0, 1, -x0, -y0); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
  const v = net.view([x0, y0, x1, y1], false);
  const draw = (list: Feature[], color: string) => { for (const f of list) { ctx.lineCap = f.cap; if (f.kind === 'stroke') { ctx.strokeStyle = color; ctx.lineWidth = f.w; ctx.stroke(f.path); } else { ctx.fillStyle = color; ctx.fill(f.path); } } };
  draw(v.walkF, '#ff0000'); draw(v.asphF, '#00ff00'); draw(v.medianF, '#0000ff'); draw(v.islandF, '#ff0000');
  ctx.fillStyle = '#0000ff'; for (const i of v.rbIslands) { ctx.beginPath(); ctx.arc(i.x, i.y, i.r, 0, TAU); ctx.fill(); }
  const data = ctx.getImageData(0, 0, W, H).data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, r = data[i] > 127, g = data[i + 1] > 127, b = data[i + 2] > 127; net.occ[(y0 + y) * MAP + x0 + x] = b ? 3 : g ? 2 : r ? 1 : 0; }
}

// The range business's save and rules (plan P24 Phase 1, T129): the upgrades, the bucket price, the counts, what the upgrades do, the demand and
// the money. Light and pure (it imports only the range's numbers), so the save's normalizer (golf/mode.ts) and the UI can use it; the scene and
// the golfers are golf/rangebiz.ts.
import { RANGE_PASS_POP } from './range';
import { LOT_SHARE } from './rangelot';
export { LOT_SHARE } from './rangelot';
/** the range's upgrades (plan P24 2.3) */
export type RangeUpgradeId = 'bays8' | 'bays12' | 'bays24' | 'targets' | 'covered' | 'lights' | 'dispenser' | 'proshop'
  /** the World of Golf extras (plan P24 Phase 4b, T133): the second tier of bays, the academy, the coffee kiosk, the ball picker cart */
  | 'tier2' | 'academy' | 'kiosk' | 'picker'
  /** the car park building (T146, P24 D49): a multi-storey car park beside the range's car park */
  | 'parking'
  /** T223: the desert start's ground upgrades: the dirt tee box turfed, then the desert outfield grassed (mown and striped) */
  | 'teeturf' | 'grass'
  /** T239: the guided start's builds: the first target greens (before the 'targets' upgrade's two more and the boards), and the car park's
   *  ground: the packed dirt gravelled, then paved (asphalt, painted bays and lamps) */
  | 'greens' | 'gravel' | 'pave';
/** a span's counts: the golfers who bought a bucket, the buckets (the customers they stand for), the lost (turned away or left the queue), the takings ($)
 *  and the upgrades' upkeep paid ($, T132) */
export interface RangeCounts { golfers: number; buckets: number; lost: number; takings: number; upkeep: number }
/** the practice facilities the player paints beside the range (plan P24 Phase 2, T130): the putting green, and the chipping green with its bunker */
export type PracticeId = 'putting' | 'chipping';
export const PRACTICE_IDS: readonly PracticeId[] = ['putting', 'chipping'];
/** a practice facility's counts over a span: the golfers who used it, and its fees ($) */
export interface PracticeCounts { golfers: number; takings: number }
/** a practice facility in the save: open (big enough and in the practice area when the course grid was last read: the appeal follows it before
 *  the grid is read again on a load), and its season's and lifetime counts */
export interface PracticeFacSave { open: boolean; season: PracticeCounts; total: PracticeCounts }
/** the range business in the save (golf.range): v 1, the upgrades owned (in buying order), the bucket price ($), the season's and the lifetime
 *  counts, paths (true: the game has laid the old start's cement walkway; false: to lay on the next load, an old save's; absent: none, T239's guided start), tee (T130: the game has laid the tee box into the
 *  course grid: an old save's first load lays it) and the practice facilities (T130; a save without them: none built) */
export interface RangeBizSave { v: 1; owned: RangeUpgradeId[]; price: number; season: RangeCounts; total: RangeCounts; paths?: boolean; tee?: boolean; practice: Record<PracticeId, PracticeFacSave>;
  /** the extras' own counts (T133): the coffee kiosk's buyers and takings, the academy's lessons and fees (a save without them: zero) */
  extras: Record<ExtraId, ExtraSave>;
  /** T146: the game has laid the car park building's cart path (from the path's end at the car park round the building); an old save's first
   *  load with the building lays it */
  garage?: boolean;
  /** T223: the range began in the desert (a dirt tee box and a desert outfield the player turfs and grasses: the 'teeturf' and 'grass'
   *  upgrades). A save without it was made before T223, when every range had its grass: its load gets both upgrades (normalizeRangeBiz) */
  desert?: boolean;
  /** T239: the range is past the guided build's migration (a new game's range begins guided: a packed-dirt car park, no walkway beside the
   *  tee, no target greens, the practice area for sale; the player builds them). A save without it was made before T239: its load owns the
   *  builds it had (LEGACY_UPGRADES) and is marked guided (as `desert`, so a second load keeps it as it is); a walkway the game never laid is
   *  then paths: false, which the host lays on its first load */
  guided?: boolean }
/** the extras that keep their own counts (T133): the coffee kiosk (coffees sold) and the academy (lessons given) */
export type ExtraId = 'kiosk' | 'academy';
export const EXTRA_IDS: readonly ExtraId[] = ['kiosk', 'academy'];
/** an extra's season's and lifetime counts: golfers served (coffees, lessons: the customers they stand for are times the scale) and takings ($) */
export interface ExtraSave { season: PracticeCounts; total: PracticeCounts }

/** the bucket price band and the start ($) */
export const PRICE_MIN = 3, PRICE_MAX = 12, PRICE_START = 6;
/** the customers one golfer you see stands for at the default 10-minute town day (plan D4); the scale follows the day length */
export const RANGE_SCALE_BASE = 40;
/** the bays before any upgrade */
export const START_BAYS = 4;
/** the opening hours (town clock): 07:00 to 18:00, to 22:00 with floodlights */
export const OPEN_HOUR = 7, CLOSE_HOUR = 18, CLOSE_LIT = 22;
/** the demand's rate: golfers a town day per resident or passing driver (pop) at appeal 1 and the reference price (plan 2.2) */
export const DEMAND_RATE = 0.0183;
/** the most appeal the player's props add to the range (plan P24 Phase 3, T131: golf/decor.ts decorAppeal) */
export const PROPS_APPEAL_CAP = 0.4;
/** the bays one counter at the pro shop keeps busy (T146: the counters serve in parallel, so a full range fills its bays at peak) */
export const BAYS_A_COUNTER = 9;
/** the cars the car park building holds (T146, P24 D49): with the lot beside it the measured peak of a fully grown range parks with room to spare */
export const GARAGE_CARS = 180;

/** an upgrade as the range card lists it: its id, name, cost ($), its upkeep ($ a game month, T132: twelve months a season), the upgrade it needs
 *  first, what it does (one line) */
export interface RangeUpgrade { id: RangeUpgradeId; name: string; cost: number; upkeep: number; needs?: RangeUpgradeId | readonly RangeUpgradeId[]; effect: string }
export const RANGE_UPGRADES: readonly RangeUpgrade[] = [
  // T223: the desert start's ground: the dirt tee box turfed, then the desert outfield grassed
  { id: 'teeturf', name: 'Turf the tee box', cost: 4000, upkeep: 30, effect: 'Grass turf under the mats instead of dust: +5% visitors, golfers pay $1 more' },
  { id: 'grass', name: 'Grass the outfield', cost: 12000, upkeep: 90, needs: 'teeturf', effect: 'The desert outfield sown and mown in stripes: a green range to aim at, +15% visitors' },
  // T239: the guided start's first builds: the target greens, the car park's gravel, then its paving
  { id: 'greens', name: 'Target greens', cost: 2500, upkeep: 20, effect: 'Three target greens with flags at 50, 100 and 150 m: something to aim at, +10% visitors' },
  { id: 'gravel', name: 'Gravel the car park', cost: 3000, upkeep: 20, effect: `Gravel over the packed dirt: tidier rows, room for ${Math.round(100 * LOT_SHARE.gravel)}% of a paved lot's cars (dirt: ${Math.round(100 * LOT_SHARE.dirt)}%)` },
  { id: 'pave', name: 'Pave the car park', cost: 8000, upkeep: 60, needs: 'gravel', effect: 'Asphalt with painted bays and lamps: every bay of the lot, so no car drives on at the busy hours' },
  { id: 'bays8', name: '8 hitting bays', cost: 8000, upkeep: 60, effect: 'Four more mats on the tee box: twice the golfers at once' },
  { id: 'bays12', name: '12 hitting bays', cost: 14000, upkeep: 90, needs: 'bays8', effect: 'Four more mats: a longer queue fits before cars drive on' },
  { id: 'bays24', name: '24 hitting bays', cost: 40000, upkeep: 300, needs: 'bays12', effect: 'The whole tee box in mats' },
  { id: 'targets', name: 'More target greens and yardage boards', cost: 6000, upkeep: 40, needs: 'greens', effect: 'Two more target greens and the yardage boards: five to aim at, +15% visitors' },
  { id: 'covered', name: 'Covered bays', cost: 18000, upkeep: 120, effect: 'A roof over the mats: +15% visitors, golfers pay $2 more without grumbling' },
  { id: 'lights', name: 'Floodlights', cost: 24000, upkeep: 250, effect: 'Open till 22:00: the after-work crowd stays into the evening' },
  { id: 'dispenser', name: 'Ball dispenser', cost: 5000, upkeep: 30, effect: 'Buckets in a second: the queue at the shop clears, +5% visitors' },
  { id: 'proshop', name: 'Pro shop', cost: 45000, upkeep: 400, effect: 'The shack becomes a real pro shop: gear sales +$2 a golfer, +15% visitors' },
  // the World of Golf extras (plan P24 Phase 4b, T133)
  { id: 'kiosk', name: 'Coffee kiosk', cost: 9000, upkeep: 80, effect: 'A coffee kiosk by the shop: 40% of golfers buy a $3 coffee after their bucket, +3% visitors' },
  { id: 'picker', name: 'Ball picker cart', cost: 7000, upkeep: 60, needs: 'bays8', effect: 'A cart drives the outfield in lanes after closing and picks the balls: a clean range every morning, +5% visitors' },
  { id: 'tier2', name: 'Second tier of bays', cost: 60000, upkeep: 450, needs: ['bays12', 'covered'], effect: 'A double-deck stand over the mats: 12 more bays upstairs, the World of Golf look, +10% visitors' },
  { id: 'academy', name: 'Golf academy', cost: 30000, upkeep: 350, needs: 'proshop', effect: 'A pro teaches on two bays: 15% of golfers take a $15 lesson, +5% visitors' },
  // T146 (P24 D49): the busy range's car park building, offered once the second tier makes parking the limit
  { id: 'parking', name: 'Car park building', cost: 36000, upkeep: 240, needs: ['tier2', 'pave'], effect: `A multi-storey car park beside the lot: room for ${GARAGE_CARS} cars, so the busy range turns no car away` },
];
/** an upgrade's prerequisites, all of them needed first */
export function needsOf(u: Pick<RangeUpgrade, 'needs'>): readonly RangeUpgradeId[] { return !u.needs ? [] : typeof u.needs === 'string' ? [u.needs] : u.needs; }
const BY_ID = new Map(RANGE_UPGRADES.map(u => [u.id, u]));
/** the game months in a season (one game day: golf/calendar.ts) */
export const MONTHS_A_SEASON = 12;
/** the upgrades' upkeep the range pays each game month ($, T132; booked as upkeep in the ledger). The range's own $2,000 a season stays the
 *  worker's business upkeep */
export function rangeUpkeep(s: Pick<RangeBizSave, 'owned'>): number { let n = 0; for (const id of s.owned) n += BY_ID.get(id)?.upkeep ?? 0; return n; }

const zero = (): RangeCounts => ({ golfers: 0, buckets: 0, lost: 0, takings: 0, upkeep: 0 });
const noExtras = (): Record<ExtraId, ExtraSave> => ({ kiosk: { season: { golfers: 0, takings: 0 }, total: { golfers: 0, takings: 0 } }, academy: { season: { golfers: 0, takings: 0 }, total: { golfers: 0, takings: 0 } } });
const noPractice = (): Record<PracticeId, PracticeFacSave> => ({ putting: { open: false, season: { golfers: 0, takings: 0 }, total: { golfers: 0, takings: 0 } }, chipping: { open: false, season: { golfers: 0, takings: 0 }, total: { golfers: 0, takings: 0 } } });
/** the range a new game starts with: 4 bays, $6 a bucket, nothing bought, no counts, no practice facilities, no extras' counts, in the desert
 *  (T223: a dirt tee box and a desert outfield) */
export function defaultRangeBiz(): RangeBizSave { return { v: 1, owned: [], price: PRICE_START, season: zero(), total: zero(), practice: noPractice(), extras: noExtras(), desert: true, guided: true }; }
/** the ground upgrades a range made before T223 owns on its load (its grass tee box and outfield), in buying order */
export const GRASS_UPGRADES: readonly RangeUpgradeId[] = ['teeturf', 'grass'];
/** the builds a range made before T239 owns on its load (T239: its target greens, and its car park gravelled and paved: the asphalt it had) */
export const LEGACY_UPGRADES: readonly RangeUpgradeId[] = ['greens', 'gravel', 'pave'];
const pos = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const counts = (c: unknown): RangeCounts => {
  const o = (c && typeof c === 'object' ? c : {}) as Partial<RangeCounts>;
  return { golfers: pos(o.golfers), buckets: pos(o.buckets), lost: pos(o.lost), takings: pos(o.takings), upkeep: pos(o.upkeep) };
};
/** a loaded practice record made well formed (the migration: a save from before T130 has none built) */
function normalizePractice(x: unknown): Record<PracticeId, PracticeFacSave> {
  const out = noPractice(), o = (x && typeof x === 'object' ? x : {}) as Partial<Record<PracticeId, Partial<PracticeFacSave>>>;
  const pc = (c: unknown): PracticeCounts => { const q = (c && typeof c === 'object' ? c : {}) as Partial<PracticeCounts>; return { golfers: pos(q.golfers), takings: pos(q.takings) }; };
  for (const id of PRACTICE_IDS) { const f = o[id]; if (f && typeof f === 'object') out[id] = { open: f.open === true, season: pc(f.season), total: pc(f.total) }; }
  return out;
}
/** a loaded extras record made well formed (the migration: a save from before T133 has zero counts) */
function normalizeExtras(x: unknown): Record<ExtraId, ExtraSave> {
  const out = noExtras(), o = (x && typeof x === 'object' ? x : {}) as Partial<Record<ExtraId, Partial<ExtraSave>>>;
  const pc = (c: unknown): PracticeCounts => { const q = (c && typeof c === 'object' ? c : {}) as Partial<PracticeCounts>; return { golfers: pos(q.golfers), takings: pos(q.takings) }; };
  for (const id of EXTRA_IDS) { const f = o[id]; if (f && typeof f === 'object') out[id] = { season: pc(f.season), total: pc(f.total) }; }
  return out;
}
/** the season closes with the books: the range's and its practice facilities' season counts start again from zero */
export function rangeNewSeason(s: RangeBizSave): void {
  s.season = zero();
  for (const id of PRACTICE_IDS) s.practice[id].season = { golfers: 0, takings: 0 };
  for (const id of EXTRA_IDS) s.extras[id].season = { golfers: 0, takings: 0 };
}
/** a loaded golf.range made well formed (the migration: a range-start save without one gets the starting range); unknown upgrades are dropped,
 *  an upgrade whose prerequisite is missing is dropped, the price is clamped to the band. T223: a range saved before the desert start (no
 *  `desert` flag, or no range at all) keeps its grass: it owns the ground upgrades (GRASS_UPGRADES). T239: one saved before the guided start
 *  (no `guided` flag) keeps its target greens and its paved car park (LEGACY_UPGRADES), and its walkway (laid, or paths: false to lay) */
export function normalizeRangeBiz(x: unknown): RangeBizSave {
  if (!x || typeof x !== 'object') return { ...defaultRangeBiz(), owned: [...GRASS_UPGRADES, ...LEGACY_UPGRADES], paths: false };
  const o = x as Partial<RangeBizSave>, owned: RangeUpgradeId[] = [...(o.desert === true ? [] : GRASS_UPGRADES), ...(o.guided === true ? [] : LEGACY_UPGRADES)];
  for (const id of Array.isArray(o.owned) ? o.owned : []) { const u = BY_ID.get(id as RangeUpgradeId); if (u && !owned.includes(u.id) && needsOf(u).every(n => owned.includes(n))) owned.push(u.id); }
  const p = typeof o.price === 'number' && Number.isFinite(o.price) ? Math.round(o.price) : PRICE_START;
  const out: RangeBizSave = { v: 1, owned, price: Math.min(PRICE_MAX, Math.max(PRICE_MIN, p)), season: counts(o.season), total: counts(o.total), practice: normalizePractice(o.practice), extras: normalizeExtras(o.extras), desert: true, guided: true };
  // the walkway (T239): laid (true); an old save's the game never laid, to lay on its first load (false); a guided start's: none (absent)
  if (o.paths === true) out.paths = true; else if (o.paths === false || o.guided !== true) out.paths = false;
  if (o.tee === true) out.tee = true;
  if (o.garage === true && owned.includes('parking')) out.garage = true;
  return out;
}

/** the range's appeal terms from outside its save, worked out by the engine from the map: propsAppeal, the props near the shop and the mats
 *  (T131, golf/decor.ts decorAppeal: 0..PROPS_APPEAL_CAP) */
export interface RangeExtras { propsAppeal?: number; /** the open practice facilities (T130, practiceAppeal of the save: a fraction) */ practiceAppeal?: number }
/** what the range is now (plan 2.3): bays, target greens, the upgrades as flags, appeal (x visitors), the reference price ($), the extra spend a
 *  golfer ($), the counter's serve time (sim s), the opening hours and the queue at which cars drive on; propsAppeal, the props' term (a
 *  fraction: x (1 + propsAppeal) on the appeal and the fair price) */
export interface RangeStats {
  bays: number; targets: number; covered: boolean; lights: boolean; dispenser: boolean; proShop: boolean;
  appeal: number; ref: number; extra: number; serve: number; open: number; close: number; qMax: number; propsAppeal: number;
  /** the extras (T133): the second tier (its bays are in bays: lowerBays stand on the tee box, TIER2_BAYS upstairs), the academy (two of the
   *  lower bays are its lesson bays), the coffee kiosk, the ball picker cart */
  tier2: boolean; academy: boolean; kiosk: boolean; picker: boolean; lowerBays: number;
  /** T146: the pro shop's counters, serving golfers in parallel (one per BAYS_A_COUNTER bays: the second tier adds one), and the car park
   *  building */
  counters: number; parking: boolean;
  /** T223: the tee box is turfed (else the desert start's dirt), and the outfield grassed, mown and striped (else the desert) */
  teeTurf: boolean; grass: boolean;
  /** T239: the car park's ground (packed dirt, gravel, or paved: asphalt, painted bays and lamps) */
  lot: LotGround;
}
/** the range car park's ground (T239) */
export type LotGround = 'dirt' | 'gravel' | 'paved';
/** the car park's ground the owned upgrades give it (T239) */
export function lotGround(s: Pick<RangeBizSave, 'owned'>): LotGround { return s.owned.includes('pave') ? 'paved' : s.owned.includes('gravel') ? 'gravel' : 'dirt'; }
export function rangeStats(s: RangeBizSave, x: RangeExtras = {}): RangeStats {
  const has = (id: RangeUpgradeId) => s.owned.includes(id);
  const lowerBays = has('bays24') ? 24 : has('bays12') ? 12 : has('bays8') ? 8 : START_BAYS;
  const covered = has('covered'), lights = has('lights'), dispenser = has('dispenser'), proShop = has('proshop');
  const tier2 = has('tier2'), academy = has('academy'), kiosk = has('kiosk'), picker = has('picker'), bays = lowerBays + (tier2 ? TIER2_BAYS : 0);
  // the props' term (T131): a dressed front draws more golfers and they pay more without grumbling
  const propsAppeal = Math.min(PROPS_APPEAL_CAP, Math.max(0, Number.isFinite(x.propsAppeal) ? x.propsAppeal! : 0));
  // the practice facilities' term (T130, practiceAppeal): more golfers come, the price stays
  const practice = Math.max(0, Number.isFinite(x.practiceAppeal) ? x.practiceAppeal! : 0);
  const teeTurf = has('teeturf'), grass = has('grass');
  const own = (has('greens') ? TARGET_APPEAL.greens : 0) + (has('targets') ? TARGET_APPEAL.targets : 0) + (covered ? 0.15 : 0) + (dispenser ? 0.05 : 0) + (proShop ? 0.15 : 0) + (teeTurf ? GROUND_APPEAL.teeturf : 0) + (grass ? GROUND_APPEAL.grass : 0)
    + (tier2 ? EXTRA_APPEAL.tier2 : 0) + (academy ? EXTRA_APPEAL.academy : 0) + (kiosk ? EXTRA_APPEAL.kiosk : 0) + (picker ? EXTRA_APPEAL.picker : 0);
  const appeal = (1 + own) * (1 + propsAppeal) * (1 + practice);
  return {
    bays, targets: has('targets') ? 5 : has('greens') ? 3 : 0, covered, lights, dispenser, proShop, appeal, propsAppeal,
    ref: (PRICE_START + (covered ? 2 : 0) + (proShop ? 1 : 0) + (teeTurf ? 1 : 0)) * (1 + propsAppeal), extra: proShop ? 2 : 0, serve: dispenser ? 0.8 : proShop ? 2 : 3,
    open: OPEN_HOUR, close: lights ? CLOSE_LIT : CLOSE_HOUR, qMax: 4 + Math.floor(bays / 4), tier2, academy, kiosk, picker, lowerBays,
    counters: Math.max(1, Math.ceil(bays / BAYS_A_COUNTER)), parking: has('parking'), teeTurf, grass, lot: lotGround(s),
  };
}
/** the target greens' appeal (T239: the first three, then two more with the boards; together the 25% the five had before T239) */
export const TARGET_APPEAL: Readonly<Record<'greens' | 'targets', number>> = { greens: 0.1, targets: 0.15 };
/** the ground upgrades' appeal (T223): the turfed tee box and the grassed outfield, added to the upgrades' own appeal term */
export const GROUND_APPEAL: Readonly<Record<'teeturf' | 'grass', number>> = { teeturf: 0.05, grass: 0.15 };
/** the second tier's bays upstairs (T133), over the middle twelve of the tee box's slots */
export const TIER2_BAYS = 12;
/** the extras' appeal (T133): added to the upgrades' own appeal term */
export const EXTRA_APPEAL: Readonly<Record<'tier2' | 'academy' | 'kiosk' | 'picker', number>> = { tier2: 0.1, academy: 0.05, kiosk: 0.03, picker: 0.05 };
/** the coffee kiosk (T133): the share of golfers who buy a coffee after their bucket, its price ($, before the scale), the counter's serve time (sim s)
 *  and the longest line a golfer joins (else it skips the coffee) */
export const KIOSK_SHARE = 0.4, COFFEE = 3, KIOSK_SERVE = 2.5, KIOSK_QMAX = 5;
/** the academy (T133): its lesson bays (two of the lower bays), the share of golfers who want a lesson and its price ($, on top of the bucket,
 *  before the scale) */
export const ACADEMY_BAYS = 2, LESSON_SHARE = 0.15, LESSON = 15;
/** the player's home (T133): the caravan, the cottage and the house, by the range's lifetime takings ($): it grows as the business grows */
export type HomeStage = 0 | 1 | 2;
export const HOME_AT: readonly [number, number] = [100000, 400000];
export const HOME_NAME: readonly [string, string, string] = ['Caravan', 'Cottage', 'House'];
export function homeStage(s: Pick<RangeBizSave, 'total'>): HomeStage { const t = s.total.takings; return t >= HOME_AT[1] ? 2 : t >= HOME_AT[0] ? 1 : 0; }
/** the practice facilities' appeal term (T130, plan P24 Phase 2), a fraction as T131's propsAppeal: x(1 + 0.1) for an open putting green, x(1 + 0.1)
 *  for an open chipping green with its bunker. The engine passes it in the demand context (RangeExtras.practiceAppeal), beside propsAppeal */
export const PRACTICE_APPEAL: Readonly<Record<PracticeId, number>> = { putting: 0.1, chipping: 0.1 };
export function practiceAppeal(s: Pick<RangeBizSave, 'practice'>): number {
  let a = 1; for (const id of PRACTICE_IDS) if (s.practice?.[id]?.open) a *= 1 + PRACTICE_APPEAL[id];
  return a - 1;
}
/** the fee a golfer pays to use a practice facility ($, before the scale) and the share of the range's golfers who walk over after their bucket
 *  (each tries the putting green first, then the chipping green) */
export const PRACTICE_FEE = 2;
export const PRACTICE_SHARE: Readonly<Record<PracticeId, number>> = { putting: 0.35, chipping: 0.3 };
/** the expected golfers each open facility gets out of n who finished a bucket (the skip's booking: putting first, chipping out of the rest) */
export function practiceUsers(s: Pick<RangeBizSave, 'practice'>, n: number): Record<PracticeId, number> {
  const put = s.practice?.putting?.open ? n * PRACTICE_SHARE.putting : 0, chip = s.practice?.chipping?.open ? (n - put) * PRACTICE_SHARE.chipping : 0;
  return { putting: put, chipping: chip };
}
/** the demand's price factor: (ref / price)^1.5, clamped to 0.25..2.5 */
export function priceFactor(price: number, ref: number): number { return Math.min(2.5, Math.max(0.25, Math.pow(ref / Math.max(1, price), 1.5))); }
/** why upgrade id cannot be bought now ('' when it can): owned already, its prerequisite first, or not enough money */
export function upgradeWhy(s: RangeBizSave, id: RangeUpgradeId, money: number): string {
  const u = BY_ID.get(id); if (!u) return 'Unknown upgrade';
  if (s.owned.includes(id)) return 'Built';
  const miss = needsOf(u).find(n => !s.owned.includes(n)); if (miss) return `Build ${BY_ID.get(miss)!.name} first`;
  if (u.cost > money) return `Not enough money: it costs $${u.cost.toLocaleString()}`;
  return '';
}
/** the range with upgrade id bought (a new object; the caller pays) */
export function withUpgrade(s: RangeBizSave, id: RangeUpgradeId): RangeBizSave { return s.owned.includes(id) ? s : { ...s, owned: [...s.owned, id] }; }
/** the range with its price set (whole dollars, clamped to the band) */
export function withPrice(s: RangeBizSave, price: number): RangeBizSave { return { ...s, price: Math.min(PRICE_MAX, Math.max(PRICE_MIN, Math.round(price))) }; }

/** the hour curve (town hour 0..23, fractional): 0 when closed; a quiet morning, a lunch bump, the after-work peak, the evening under lights */
export function hourWeight(h: number, st: Pick<RangeStats, 'open' | 'close'>): number {
  if (h < st.open || h >= st.close) return 0;
  return h < 9 ? 0.7 : h < 12 ? 0.9 : h < 14 ? 1.1 : h < 16 ? 0.9 : h < 19 ? 1.5 : 1.2;
}
/** the sum of the hour curve over the unlit day (07:00-18:00): the demand is said per such day */
const DAY_WEIGHT = 2 * 0.7 + 3 * 0.9 + 2 * 1.1 + 2 * 0.9 + 2 * 1.5;
/** who the range draws from: the tier (the pass-pop), the map exits, the town's residents; and the appeal terms from the map (RangeExtras) */
export interface DemandCtx extends RangeExtras { tier: number; exits: number; residents: number }
/** the golfers a town day of 07:00-18:00 wants (plan 2.2): DEMAND_RATE x (pass-pop x exits + residents) x appeal x the price factor */
export function dayDemand(s: RangeBizSave, c: DemandCtx, st = rangeStats(s, c)): number {
  const pop = RANGE_PASS_POP(c.tier) * Math.max(1, c.exits) + Math.max(0, c.residents);
  return DEMAND_RATE * pop * st.appeal * priceFactor(s.price, st.ref);
}
/** the arrival rate at town hour h, golfers per sim second, on a town day of dayLen sim s */
export function arrivalRate(s: RangeBizSave, c: DemandCtx, h: number, dayLen: number, st = rangeStats(s, c)): number {
  return dayDemand(s, c, st) * hourWeight(h, st) / DAY_WEIGHT / (dayLen / 24);
}
/** the customers one golfer you see stands for (plan D4): RANGE_SCALE_BASE at a 600 s town day, in step with the day length */
export function rangeScale(dayLen: number): number { return RANGE_SCALE_BASE * Math.max(24, dayLen) / 600; }
/** what one golfer's visit books ($): the price plus the extra spend, times the scale */
export function saleValue(s: RangeBizSave, dayLen: number, st = rangeStats(s)): number { return (s.price + st.extra) * rangeScale(dayLen); }
/** what the live range's golfers take, as the skip counts it (T146, RangeSim skipLive): the car park's bays (the lot's and the building's) and
 *  the town hours a car holds one (RangeSim carHours: the drive in, the walks, the bucket, the coffee and the practice), and the town hours a
 *  golfer holds a hitting bay (RangeSim bayHours: an hour from the sale, or the walk to it and two swings when they take longer) */
export interface SkipLive { parkBays: number; carHours: number; bayHours: number; /** the town hours from a car turning in to its golfer at the line
 *  (RangeSim inHours): the skip serves a golfer that much after it arrives, so the bays stand empty that long after opening and the last
 *  arrivals before closing find the shop shut, as at the live range */ inHours?: number }
/** the expected visits of a span the player skipped (sim s, from town hour h0): the arrivals by the hour curve, the served capped by the bays
 *  (each plays a town hour; T146 with live: bays / bayHours an hour) and (T146) by the car park (parkBays / carHours cars an hour); live absent:
 *  neither is counted. Returns golfers served and lost, and (T133) the academy's lessons (LESSON_SHARE of the served, capped by its two bays an
 *  hour) and the kiosk's coffees (KIOSK_SHARE of the served) */
export function skippedVisits(s: RangeBizSave, c: DemandCtx, h0: number, dt: number, dayLen: number, live?: SkipLive | null): { served: number; lost: number; lessons: number; coffees: number } {
  const st = rangeStats(s, c), hourS = dayLen / 24;
  const perHour = live ? Math.min(st.bays / Math.max(1, live.bayHours), live.carHours > 0 ? live.parkBays / live.carHours : 0) : st.bays;
  let served = 0, lost = 0, lessons = 0;
  for (let t = 0; t < dt; t += hourS) {
    const h = (h0 + t / hourS) % 24, span = Math.min(hourS, dt - t) / hourS, want = dayDemand(s, c, st) * hourWeight(h, st) / DAY_WEIGHT * span;
    const cap = hourWeight(h, st) > 0 && hourWeight((h + (live?.inHours ?? 0)) % 24, st) > 0 ? perHour * span : 0, got = Math.min(want, cap);
    served += got; lost += want - got;
    if (st.academy) lessons += Math.min(got * LESSON_SHARE, ACADEMY_BAYS * span);
  }
  return { served, lost, lessons, coffees: st.kiosk ? served * KIOSK_SHARE : 0 };
}
/** what the extras book ($, T133): n coffees or lessons times their price and the scale */
export function extraValue(id: ExtraId, n: number, dayLen: number): number { return n * (id === 'kiosk' ? COFFEE : LESSON) * rangeScale(dayLen); }

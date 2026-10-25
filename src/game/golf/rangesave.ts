// The range business's save and rules (plan P24 Phase 1, T129): the upgrades, the bucket price, the counts, what the upgrades do, the demand and
// the money. Light and pure (it imports only the range's numbers), so the save's normalizer (golf/mode.ts) and the UI can use it; the scene and
// the golfers are golf/rangebiz.ts.
import { RANGE_PASS_POP } from './range';
/** the range's upgrades (plan P24 2.3) */
export type RangeUpgradeId = 'bays8' | 'bays12' | 'bays24' | 'targets' | 'covered' | 'lights' | 'dispenser' | 'proshop';
/** a span's counts: the golfers who bought a bucket, the buckets (the customers they stand for), the lost (turned away or left the queue), the takings ($) */
export interface RangeCounts { golfers: number; buckets: number; lost: number; takings: number }
/** the practice facilities the player paints beside the range (plan P24 Phase 2, T130): the putting green, and the chipping green with its bunker */
export type PracticeId = 'putting' | 'chipping';
export const PRACTICE_IDS: readonly PracticeId[] = ['putting', 'chipping'];
/** a practice facility's counts over a span: the golfers who used it, and its fees ($) */
export interface PracticeCounts { golfers: number; takings: number }
/** a practice facility in the save: open (big enough and in the practice area when the course grid was last read: the appeal follows it before
 *  the grid is read again on a load), and its season's and lifetime counts */
export interface PracticeFacSave { open: boolean; season: PracticeCounts; total: PracticeCounts }
/** the range business in the save (golf.range): v 1, the upgrades owned (in buying order), the bucket price ($), the season's and the lifetime
 *  counts, paths (the game has laid the range's cart paths: an old save's first load lays them), tee (T130: the game has laid the tee box into the
 *  course grid: an old save's first load lays it) and the practice facilities (T130; a save without them: none built) */
export interface RangeBizSave { v: 1; owned: RangeUpgradeId[]; price: number; season: RangeCounts; total: RangeCounts; paths?: boolean; tee?: boolean; practice: Record<PracticeId, PracticeFacSave> }

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

/** an upgrade as the range card lists it: its id, name, cost ($), the upgrade it needs first, what it does (one line) */
export interface RangeUpgrade { id: RangeUpgradeId; name: string; cost: number; needs?: RangeUpgradeId; effect: string }
export const RANGE_UPGRADES: readonly RangeUpgrade[] = [
  { id: 'bays8', name: '8 hitting bays', cost: 8000, effect: 'Four more mats on the tee box: twice the golfers at once' },
  { id: 'bays12', name: '12 hitting bays', cost: 14000, needs: 'bays8', effect: 'Four more mats: a longer queue fits before cars drive on' },
  { id: 'bays24', name: '24 hitting bays', cost: 40000, needs: 'bays12', effect: 'The whole tee box in mats' },
  { id: 'targets', name: 'Target greens and yardage boards', cost: 6000, effect: 'Five target greens with flags and boards: +25% visitors' },
  { id: 'covered', name: 'Covered bays', cost: 18000, effect: 'A roof over the mats: +15% visitors, golfers pay $2 more without grumbling' },
  { id: 'lights', name: 'Floodlights', cost: 24000, effect: 'Open till 22:00: the after-work crowd stays into the evening' },
  { id: 'dispenser', name: 'Ball dispenser', cost: 5000, effect: 'Buckets in a second: the queue at the shop clears, +5% visitors' },
  { id: 'proshop', name: 'Pro shop', cost: 45000, effect: 'The shack becomes a real pro shop: gear sales +$2 a golfer, +15% visitors' },
];
const BY_ID = new Map(RANGE_UPGRADES.map(u => [u.id, u]));

const zero = (): RangeCounts => ({ golfers: 0, buckets: 0, lost: 0, takings: 0 });
const noPractice = (): Record<PracticeId, PracticeFacSave> => ({ putting: { open: false, season: { golfers: 0, takings: 0 }, total: { golfers: 0, takings: 0 } }, chipping: { open: false, season: { golfers: 0, takings: 0 }, total: { golfers: 0, takings: 0 } } });
/** the range a new game starts with: 4 bays, $6 a bucket, nothing bought, no counts, no practice facilities */
export function defaultRangeBiz(): RangeBizSave { return { v: 1, owned: [], price: PRICE_START, season: zero(), total: zero(), practice: noPractice() }; }
const pos = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const counts = (c: unknown): RangeCounts => {
  const o = (c && typeof c === 'object' ? c : {}) as Partial<RangeCounts>;
  return { golfers: pos(o.golfers), buckets: pos(o.buckets), lost: pos(o.lost), takings: pos(o.takings) };
};
/** a loaded practice record made well formed (the migration: a save from before T130 has none built) */
function normalizePractice(x: unknown): Record<PracticeId, PracticeFacSave> {
  const out = noPractice(), o = (x && typeof x === 'object' ? x : {}) as Partial<Record<PracticeId, Partial<PracticeFacSave>>>;
  const pc = (c: unknown): PracticeCounts => { const q = (c && typeof c === 'object' ? c : {}) as Partial<PracticeCounts>; return { golfers: pos(q.golfers), takings: pos(q.takings) }; };
  for (const id of PRACTICE_IDS) { const f = o[id]; if (f && typeof f === 'object') out[id] = { open: f.open === true, season: pc(f.season), total: pc(f.total) }; }
  return out;
}
/** the season closes with the books: the range's and its practice facilities' season counts start again from zero */
export function rangeNewSeason(s: RangeBizSave): void {
  s.season = zero();
  for (const id of PRACTICE_IDS) s.practice[id].season = { golfers: 0, takings: 0 };
}
/** a loaded golf.range made well formed (the migration: a range-start save without one gets the starting range); unknown upgrades are dropped,
 *  an upgrade whose prerequisite is missing is dropped, the price is clamped to the band */
export function normalizeRangeBiz(x: unknown): RangeBizSave {
  if (!x || typeof x !== 'object') return defaultRangeBiz();
  const o = x as Partial<RangeBizSave>, owned: RangeUpgradeId[] = [];
  for (const id of Array.isArray(o.owned) ? o.owned : []) { const u = BY_ID.get(id as RangeUpgradeId); if (u && !owned.includes(u.id) && (!u.needs || owned.includes(u.needs))) owned.push(u.id); }
  const p = typeof o.price === 'number' && Number.isFinite(o.price) ? Math.round(o.price) : PRICE_START;
  const out: RangeBizSave = { v: 1, owned, price: Math.min(PRICE_MAX, Math.max(PRICE_MIN, p)), season: counts(o.season), total: counts(o.total), practice: normalizePractice(o.practice) };
  if (o.paths === true) out.paths = true;
  if (o.tee === true) out.tee = true;
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
}
export function rangeStats(s: RangeBizSave, x: RangeExtras = {}): RangeStats {
  const has = (id: RangeUpgradeId) => s.owned.includes(id);
  const bays = has('bays24') ? 24 : has('bays12') ? 12 : has('bays8') ? 8 : START_BAYS;
  const covered = has('covered'), lights = has('lights'), dispenser = has('dispenser'), proShop = has('proshop');
  // the props' term (T131): a dressed front draws more golfers and they pay more without grumbling
  const propsAppeal = Math.min(PROPS_APPEAL_CAP, Math.max(0, Number.isFinite(x.propsAppeal) ? x.propsAppeal! : 0));
  // the practice facilities' term (T130, practiceAppeal): more golfers come, the price stays
  const practice = Math.max(0, Number.isFinite(x.practiceAppeal) ? x.practiceAppeal! : 0);
  const appeal = (1 + (has('targets') ? 0.25 : 0) + (covered ? 0.15 : 0) + (dispenser ? 0.05 : 0) + (proShop ? 0.15 : 0)) * (1 + propsAppeal) * (1 + practice);
  return {
    bays, targets: has('targets') ? 5 : 2, covered, lights, dispenser, proShop, appeal, propsAppeal,
    ref: (PRICE_START + (covered ? 2 : 0) + (proShop ? 1 : 0)) * (1 + propsAppeal), extra: proShop ? 2 : 0, serve: dispenser ? 0.8 : proShop ? 2 : 3,
    open: OPEN_HOUR, close: lights ? CLOSE_LIT : CLOSE_HOUR, qMax: 4 + Math.floor(bays / 4),
  };
}
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
  if (u.needs && !s.owned.includes(u.needs)) return `Build ${BY_ID.get(u.needs)!.name} first`;
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
/** the expected visits of a span the player skipped (sim s, from town hour h0): the arrivals by the hour curve, the served capped by the bays
 *  (each plays a town hour); returns golfers served and lost */
export function skippedVisits(s: RangeBizSave, c: DemandCtx, h0: number, dt: number, dayLen: number): { served: number; lost: number } {
  const st = rangeStats(s, c), hourS = dayLen / 24;
  let served = 0, lost = 0;
  for (let t = 0; t < dt; t += hourS) {
    const h = (h0 + t / hourS) % 24, span = Math.min(hourS, dt - t) / hourS, want = dayDemand(s, c, st) * hourWeight(h, st) / DAY_WEIGHT * span;
    const cap = hourWeight(h, st) > 0 ? st.bays * span : 0, got = Math.min(want, cap);
    served += got; lost += want - got;
  }
  return { served, lost };
}

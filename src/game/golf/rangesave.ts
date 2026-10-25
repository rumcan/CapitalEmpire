// The range business's save and rules (plan P24 Phase 1, T129): the upgrades, the bucket price, the counts, what the upgrades do, the demand and
// the money. Light and pure (it imports only the range's numbers), so the save's normalizer (golf/mode.ts) and the UI can use it; the scene and
// the golfers are golf/rangebiz.ts.
import { RANGE_PASS_POP } from './range';
/** the range's upgrades (plan P24 2.3) */
export type RangeUpgradeId = 'bays8' | 'bays12' | 'bays24' | 'targets' | 'covered' | 'lights' | 'dispenser' | 'proshop';
/** a span's counts: the golfers who bought a bucket, the buckets (the customers they stand for), the lost (turned away or left the queue), the takings ($) */
export interface RangeCounts { golfers: number; buckets: number; lost: number; takings: number }
/** the range business in the save (golf.range): v 1, the upgrades owned (in buying order), the bucket price ($), the season's and the lifetime
 *  counts, and paths (the game has laid the range's cart paths: an old save's first load lays them) */
export interface RangeBizSave { v: 1; owned: RangeUpgradeId[]; price: number; season: RangeCounts; total: RangeCounts; paths?: boolean }

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
/** the range a new game starts with: 4 bays, $6 a bucket, nothing bought, no counts */
export function defaultRangeBiz(): RangeBizSave { return { v: 1, owned: [], price: PRICE_START, season: zero(), total: zero() }; }
const counts = (c: unknown): RangeCounts => {
  const o = (c && typeof c === 'object' ? c : {}) as Partial<RangeCounts>, n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  return { golfers: n(o.golfers), buckets: n(o.buckets), lost: n(o.lost), takings: n(o.takings) };
};
/** a loaded golf.range made well formed (the migration: a range-start save without one gets the starting range); unknown upgrades are dropped,
 *  an upgrade whose prerequisite is missing is dropped, the price is clamped to the band */
export function normalizeRangeBiz(x: unknown): RangeBizSave {
  if (!x || typeof x !== 'object') return defaultRangeBiz();
  const o = x as Partial<RangeBizSave>, owned: RangeUpgradeId[] = [];
  for (const id of Array.isArray(o.owned) ? o.owned : []) { const u = BY_ID.get(id as RangeUpgradeId); if (u && !owned.includes(u.id) && (!u.needs || owned.includes(u.needs))) owned.push(u.id); }
  const p = typeof o.price === 'number' && Number.isFinite(o.price) ? Math.round(o.price) : PRICE_START;
  const out: RangeBizSave = { v: 1, owned, price: Math.min(PRICE_MAX, Math.max(PRICE_MIN, p)), season: counts(o.season), total: counts(o.total) };
  if (o.paths === true) out.paths = true;
  return out;
}

/** what the range is now (plan 2.3): bays, target greens, the upgrades as flags, appeal (x visitors), the reference price ($), the extra spend a
 *  golfer ($), the counter's serve time (sim s), the opening hours and the queue at which cars drive on */
export interface RangeStats {
  bays: number; targets: number; covered: boolean; lights: boolean; dispenser: boolean; proShop: boolean;
  appeal: number; ref: number; extra: number; serve: number; open: number; close: number; qMax: number;
}
export function rangeStats(s: RangeBizSave): RangeStats {
  const has = (id: RangeUpgradeId) => s.owned.includes(id);
  const bays = has('bays24') ? 24 : has('bays12') ? 12 : has('bays8') ? 8 : START_BAYS;
  const covered = has('covered'), lights = has('lights'), dispenser = has('dispenser'), proShop = has('proshop');
  const appeal = 1 + (has('targets') ? 0.25 : 0) + (covered ? 0.15 : 0) + (dispenser ? 0.05 : 0) + (proShop ? 0.15 : 0);
  return {
    bays, targets: has('targets') ? 5 : 2, covered, lights, dispenser, proShop, appeal,
    ref: PRICE_START + (covered ? 2 : 0) + (proShop ? 1 : 0), extra: proShop ? 2 : 0, serve: dispenser ? 1 : proShop ? 3.5 : 5,
    open: OPEN_HOUR, close: lights ? CLOSE_LIT : CLOSE_HOUR, qMax: 4 + Math.floor(bays / 4),
  };
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
/** who the range draws from: the tier (the pass-pop), the map exits, the town's residents */
export interface DemandCtx { tier: number; exits: number; residents: number }
/** the golfers a town day of 07:00-18:00 wants (plan 2.2): DEMAND_RATE x (pass-pop x exits + residents) x appeal x the price factor */
export function dayDemand(s: RangeBizSave, c: DemandCtx, st = rangeStats(s)): number {
  const pop = RANGE_PASS_POP(c.tier) * Math.max(1, c.exits) + Math.max(0, c.residents);
  return DEMAND_RATE * pop * st.appeal * priceFactor(s.price, st.ref);
}
/** the arrival rate at town hour h, golfers per sim second, on a town day of dayLen sim s */
export function arrivalRate(s: RangeBizSave, c: DemandCtx, h: number, dayLen: number, st = rangeStats(s)): number {
  return dayDemand(s, c, st) * hourWeight(h, st) / DAY_WEIGHT / (dayLen / 24);
}
/** the customers one golfer you see stands for (plan D4): RANGE_SCALE_BASE at a 600 s town day, in step with the day length */
export function rangeScale(dayLen: number): number { return RANGE_SCALE_BASE * Math.max(24, dayLen) / 600; }
/** what one golfer's visit books ($): the price plus the extra spend, times the scale */
export function saleValue(s: RangeBizSave, dayLen: number, st = rangeStats(s)): number { return (s.price + st.extra) * rangeScale(dayLen); }
/** the expected visits of a span the player skipped (sim s, from town hour h0): the arrivals by the hour curve, the served capped by the bays
 *  (each plays a town hour); returns golfers served and lost */
export function skippedVisits(s: RangeBizSave, c: DemandCtx, h0: number, dt: number, dayLen: number): { served: number; lost: number } {
  const st = rangeStats(s), hourS = dayLen / 24;
  let served = 0, lost = 0;
  for (let t = 0; t < dt; t += hourS) {
    const h = (h0 + t / hourS) % 24, span = Math.min(hourS, dt - t) / hourS, want = dayDemand(s, c, st) * hourWeight(h, st) / DAY_WEIGHT * span;
    const cap = hourWeight(h, st) > 0 ? st.bays * span : 0, got = Math.min(want, cap);
    served += got; lost += want - got;
  }
  return { served, lost };
}

// T335 (#961; the owner, 2026-11-04: "all the clubs and upgrading clubs and your driving, irons, putting wedges ... Then shaft changes on putters add more feel and luck vs accuracy and feel"): your bag.
// - The bag of 14: the driver, the 3-wood, a 5-wood or a hybrid (one slot), the 4- to 9-irons, the pitching, gap, sand and lob wedges, the putter (CLUB_ORDER; the first eight are the model's original clubs, the
//   field plays only those). Each club has its carry (shot.ts CLUBS), its launch (loft: the wind it catches, WIND_CLUB, and how much it runs on, mods.ts CLUB_BASE), its spin (the backspin it takes,
//   spin.ts SPIN_BACK_CAP) and its forgiveness (its own base scatter and sweet spot and the mishits it gives).
// - Upgrades: a club is Garage-sale (the club the model has always played: no change at all), then Club, Tour and Prototype, bought at the shop (PRICES) or earned (a title's sponsor voucher: one free
//   upgrade, up to Tour). A level raises what the club is for: a wood's carry and forgiveness, an iron's forgiveness and spin, a wedge's spin and forgiveness, the putter's forgiveness and feel (LEVEL_FX).
// - The putter's fitting: a shaft and a head trade feel (distance control: the pace may be further out, the lag putt lands closer) against accuracy (the line: the angle a putt may be off and still drop, a wider sweet spot on the click) and luck (a bad
//   putt may still drop, a good one may lip out): a whippy graphite shaft for feel and luck, a stiff counter-balanced one for the line, a lie-angle balanced head that keeps the face square (SHAFTS, HEADS).
// - It all reaches the shot model as plain data and nothing else: `bagMods` turns the bag into `Mod`s (mods.ts) and `bagGear` into the `GameSkills.mods` and `GameSkills.clubs` your game carries, so
//   `applyMods` (the one function the shot, the swing meter, the caddie and the panel read) is the only way a club or a shaft changes a shot. A bag at its default (every club Garage-sale, the stock shaft
//   and the blade head) is no mods at all: the shot model plays exactly as it did before the bag. T336's cards add their mods after these.
// Pure TS, no DOM, no draws.
import { CLUB_ORDER, carryFor } from './shot';
import { CLUB_BASE, FAMILY, applyMods, type Family, type Mod } from './mods';
import { SPIN_BACK_CAP } from './spin';
import type { Club, GameSkills } from './types';

/** the upgrade levels, worst first: Garage-sale (every club starts here and plays exactly as the model always has), Club, Tour, Prototype */
export const LEVEL_NAME = ['Garage-sale', 'Club', 'Tour', 'Prototype'] as const;
export const MAX_LEVEL = 3;
/** a sponsor's voucher (a title's prize) upgrades a club for free up to this level */
export const VOUCHER_MAX_LEVEL = 2;
/** the most vouchers kept */
export const VOUCHERS_MAX = 9;

/** a club's price class */
export type PriceKind = 'driver' | 'wood' | 'iron' | 'wedge' | 'putter';
export const KIND_OF: Readonly<Record<Club, PriceKind>> = { driver: 'driver', wood3: 'wood', wood5: 'wood', hybrid: 'wood', iron4: 'iron', iron5: 'iron', iron6: 'iron', iron7: 'iron', iron8: 'iron', iron9: 'iron', pw: 'iron', gw: 'wedge', sw: 'wedge', lw: 'wedge', putter: 'putter' };
/** what the next level costs ($), by class: to Club, to Tour, to Prototype */
export const PRICES: Readonly<Record<PriceKind, readonly [number, number, number]>> = {
  driver: [900, 2600, 7000], wood: [600, 1700, 4500], iron: [350, 1000, 2600], wedge: [400, 1100, 2800], putter: [450, 1300, 3200],
};

/** what a level does (cumulative from Garage-sale, so the Tour level is the whole of it, not an addition to the Club level's), by class: only the fields a level changes */
export type LevelFx = Pick<Mod, 'carry' | 'spread' | 'sweet' | 'spin' | 'mishit' | 'feel' | 'line'>;
export const LEVEL_FX: Readonly<Record<PriceKind, readonly [LevelFx, LevelFx, LevelFx]>> = {
  driver: [{ carry: 1.02, spread: 0.97, sweet: 1.04 }, { carry: 1.04, spread: 0.94, sweet: 1.08, mishit: -0.01 }, { carry: 1.06, spread: 0.9, sweet: 1.12, mishit: -0.02 }],
  wood: [{ carry: 1.015, spread: 0.97, sweet: 1.04 }, { carry: 1.03, spread: 0.94, sweet: 1.08, mishit: -0.01 }, { carry: 1.045, spread: 0.9, sweet: 1.12, mishit: -0.02 }],
  iron: [{ carry: 1.01, spread: 0.97, sweet: 1.03, spin: 1.1 }, { carry: 1.02, spread: 0.94, sweet: 1.06, spin: 1.2, mishit: -0.01 }, { carry: 1.03, spread: 0.9, sweet: 1.1, spin: 1.3, mishit: -0.02 }],
  wedge: [{ spread: 0.97, sweet: 1.04, spin: 1.15 }, { spread: 0.93, sweet: 1.08, spin: 1.3, mishit: -0.01 }, { spread: 0.88, sweet: 1.12, spin: 1.5, mishit: -0.02 }],
  putter: [{ spread: 0.95, sweet: 1.05, line: 1.05 }, { spread: 0.9, sweet: 1.1, feel: 1.05, line: 1.1 }, { spread: 0.85, sweet: 1.15, feel: 1.1, line: 1.15 }],
};

/** a loft in degrees for each club: the launch (a driver launches low and long, a lob wedge high and short) */
export const LOFT: Readonly<Record<Club, number>> = { driver: 10.5, wood3: 15, wood5: 18, hybrid: 21, iron4: 24, iron5: 27, iron6: 30, iron7: 34, iron8: 38, iron9: 42, pw: 46, gw: 50, sw: 54, lw: 58, putter: 3 };
/** the clubs as the card writes them short (the shot panel's strip) */
export const CLUB_SHORT: Readonly<Record<Club, string>> = { driver: 'Dr', wood3: '3W', wood5: '5W', hybrid: 'Hy', iron4: '4', iron5: '5', iron6: '6', iron7: '7', iron8: '8', iron9: '9', pw: 'PW', gw: 'GW', sw: 'SW', lw: 'LW', putter: 'Putter' };
/** the bag's groups and their names, on the card and in the shot panel's strip: the woods (the hybrid shares the 5-wood's slot, so only one of the two is in a bag), the irons, the wedges, the putter */
export const CLUB_GROUPS: readonly { name: string; clubs: readonly Club[] }[] = [
  { name: 'Woods', clubs: ['driver', 'wood3', 'wood5', 'hybrid'] }, { name: 'Irons', clubs: ['iron4', 'iron5', 'iron6', 'iron7', 'iron8', 'iron9'] }, { name: 'Wedges', clubs: ['pw', 'gw', 'sw', 'lw'] }, { name: 'Putter', clubs: ['putter'] },
];

// ---- the putter's fitting ----
/** a part you fit to the putter: a shaft or a head. Its mod (for the putter only) is its trade of feel, accuracy and luck; the rest is the card's words */
export interface PartDef { id: string; name: string; price: number; note: string; mod: Omit<Mod, 'id' | 'name' | 'clubs'> }
/** the shafts. Feel is `feel` (the pace may be further out and the error counts for less) and `spread` (a closer lag putt); accuracy is `line` (the angle a putt may be off and still drop) and `sweet` (a wider sweet spot on the line
 *  click); luck is `luck`. Balanced on the scripted swinger (18 holes, 40 rounds, a club golfer's other skills): the whippy shaft takes 2 strokes off a golfer who misses the pace and costs 3 one who misses the line; the stiff one takes
 *  3 off a golfer who misses the line and costs 2 one who misses the pace (docs/GOLF-PLAY.md has the table) */
export const SHAFTS: readonly PartDef[] = [
  { id: 'stock', name: 'Stock steel shaft', price: 0, note: 'The shaft the putter came with.', mod: {} },
  { id: 'whip', name: 'Whippy graphite shaft', price: 450, note: 'Soft and whippy: you feel the pace, a lag putt dies at the cup and now and then a bad one drops anyway. The face wanders on the line.', mod: { feel: 1.2, spread: 0.9, sweet: 0.85, line: 0.8, luck: 0.25 } },
  { id: 'stiff', name: 'Stiff counter-balanced shaft', price: 600, note: 'Stiff and counter-balanced: the line is on rails and a mistimed click costs less, but you feel less of the pace.', mod: { sweet: 1.25, line: 1.5, feel: 0.88, spread: 1.05 } },
];
/** the heads */
export const HEADS: readonly PartDef[] = [
  { id: 'blade', name: 'Blade head', price: 0, note: 'The head the putter came with.', mod: {} },
  { id: 'mallet', name: 'Mallet head', price: 500, note: 'A big forgiving face: a mistimed click costs less. It feels a little numb.', mod: { sweet: 1.12, line: 1.1, feel: 0.95 } },
  { id: 'lie', name: 'Lie-angle balanced head', price: 800, note: 'The face stays square through the stroke: fewer pulls and pushes, and nothing lips out. A little stiff on the pace.', mod: { sweet: 1.2, line: 1.25, feel: 0.92, luck: -0.25 } },
];
export type PartKind = 'shaft' | 'head';
const PARTS: Readonly<Record<PartKind, readonly PartDef[]>> = { shaft: SHAFTS, head: HEADS };
const partOf = (kind: PartKind, id: string | undefined): PartDef => PARTS[kind].find(p => p.id === id) ?? PARTS[kind][0]!;

// ---- the bag as it is saved ----
/** your bag as the profile keeps it (PlayerProfile.bag): the level of each upgraded club (absent: Garage-sale), the third wood's slot (absent: the 5-wood), the putter's shaft and head fitted (absent: the stock ones),
 *  the parts bought (the stock ones always), and the sponsor's vouchers in hand. A bag at its default is not saved at all */
export interface BagSave { v: 1; lv?: Partial<Record<Club, number>>; third?: 'hybrid'; shaft?: string; head?: string; own?: { shaft?: string[]; head?: string[] }; vouchers?: number }
export const DEFAULT_BAG: Readonly<BagSave> = { v: 1 };

/** the clubs in the bag, in bag order: the 14 (the hybrid in the third wood's slot when the bag has it, else the 5-wood) */
export function clubsOf(bag: BagSave | null | undefined): Club[] { const hy = bag?.third === 'hybrid'; return CLUB_ORDER.filter(c => c !== (hy ? 'wood5' : 'hybrid')); }
/** a club's level in the bag (0..3) */
export const levelOf = (bag: BagSave | null | undefined, club: Club): number => Math.min(MAX_LEVEL, Math.max(0, Math.floor(bag?.lv?.[club] ?? 0)));
/** the part fitted to the putter: the shaft or the head */
export const fittedPart = (bag: BagSave | null | undefined, kind: PartKind): PartDef => partOf(kind, kind === 'shaft' ? bag?.shaft : bag?.head);
/** whether you own a part (the stock ones always) */
export function ownsPart(bag: BagSave | null | undefined, kind: PartKind, id: string): boolean { return PARTS[kind][0]!.id === id || !!bag?.own?.[kind]?.includes(id); }

/** a bag as a save keeps it, or null when it is the default (or nothing): known clubs' levels 1..3, the hybrid slot, the parts that exist (the fitted one is owned), the vouchers 1..VOUCHERS_MAX. An old save has
 *  no bag: the default */
export function normalizeBag(x: unknown): BagSave | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Partial<BagSave>, out: BagSave = { v: 1 };
  if (o.lv && typeof o.lv === 'object') {
    const lv: Partial<Record<Club, number>> = {};
    for (const c of CLUB_ORDER) { const n = Math.floor(Number((o.lv as Record<string, unknown>)[c])); if (n >= 1) lv[c] = Math.min(MAX_LEVEL, n); }
    if (Object.keys(lv).length) out.lv = lv;
  }
  if (o.third === 'hybrid') out.third = 'hybrid';
  const own: { shaft?: string[]; head?: string[] } = {};
  for (const kind of ['shaft', 'head'] as const) {
    const list = (o.own as Record<string, unknown> | undefined)?.[kind], has = Array.isArray(list) ? (list as unknown[]).filter((id): id is string => typeof id === 'string' && PARTS[kind].some(p => p.id === id) && id !== PARTS[kind][0]!.id) : [];
    const sel = kind === 'shaft' ? o.shaft : o.head;
    if (typeof sel === 'string' && sel !== PARTS[kind][0]!.id && PARTS[kind].some(p => p.id === sel)) { if (kind === 'shaft') out.shaft = sel; else out.head = sel; if (!has.includes(sel)) has.push(sel); }
    const uniq = has.filter((id, i) => has.indexOf(id) === i);
    if (uniq.length) own[kind] = uniq;
  }
  if (own.shaft || own.head) out.own = own;
  const v = Math.floor(Number(o.vouchers)); if (v >= 1) out.vouchers = Math.min(VOUCHERS_MAX, v);
  return Object.keys(out).length > 1 ? out : null;
}

// ---- the bag as the shot model reads it ----
const clean = <T extends object>(o: T): T => { const r: Record<string, unknown> = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = v; return r as T; };
/** the mod a club's level makes (the level's whole effect, for that club only) */
export function levelMod(club: Club, level: number): Mod | null {
  const fx = level >= 1 ? LEVEL_FX[KIND_OF[club]][Math.min(MAX_LEVEL, level) - 1] : undefined;
  return fx ? { id: `club:${club}:${level}`, name: `${LEVEL_NAME[level]} ${clubName(club)}`, clubs: [club], ...clean(fx) } : null;
}
/** the mod a putter part makes (null: the stock shaft or the blade head make none) */
export function partMod(kind: PartKind, p: PartDef): Mod | null { return Object.keys(p.mod).length ? { id: `${kind}:${p.id}`, name: p.name, clubs: ['putter'], ...p.mod } : null; }
/** the bag as mods, in a fixed order: the clubs' levels in bag order, then the putter's shaft and head. A default bag is none */
export function bagMods(bag: BagSave | null | undefined): Mod[] {
  const out: Mod[] = [], inBag = clubsOf(bag);
  for (const c of inBag) { const m = levelMod(c, levelOf(bag, c)); if (m) out.push(m); }
  for (const kind of ['shaft', 'head'] as const) { const m = partMod(kind, fittedPart(bag, kind)); if (m) out.push(m); }
  return out;
}
/** what the bag adds to a golfer's game (GameSkills): its mods and the clubs in it */
export interface Gear { mods: readonly Mod[]; clubs: readonly Club[] }
const DEFAULT_GEAR: Gear = { mods: [], clubs: clubsOf(null) };
const memo = new WeakMap<object, Gear>();
/** the bag's gear for a golfer's skills (gameSkills' third argument): the mods and the clubs, remembered for a bag object (profiles are replaced, not changed, so a bag is read again only when it changes) */
export function bagGear(bag: BagSave | null | undefined): Gear {
  if (!bag) return DEFAULT_GEAR;
  let g = memo.get(bag); if (!g) { g = { mods: bagMods(bag), clubs: clubsOf(bag) }; memo.set(bag, g); }
  return g;
}

// ---- buying, upgrading, fitting ----
/** the club's name as the card writes it */
function clubName(club: Club): string { return NAMES[club]; }
const NAMES: Readonly<Record<Club, string>> = { driver: 'driver', wood3: '3-wood', wood5: '5-wood', hybrid: 'hybrid', iron4: '4-iron', iron5: '5-iron', iron6: '6-iron', iron7: '7-iron', iron8: '8-iron', iron9: '9-iron', pw: 'pitching wedge', gw: 'gap wedge', sw: 'sand wedge', lw: 'lob wedge', putter: 'putter' };
const cap1 = (s: string): string => s[0]!.toUpperCase() + s.slice(1);
/** the price ($) of taking a club to a level */
export const priceOf = (club: Club, toLevel: number): number => PRICES[KIND_OF[club]][Math.min(MAX_LEVEL, Math.max(1, toLevel)) - 1]!;
/** what you can buy with: the shop is open (a range, a clubhouse or a pro's office: the engine says; `shopWhy` is why not), and your money */
export interface ShopCtx { shop: boolean; shopWhy?: string | null; money: number }
const dollars = (n: number): string => `$${n.toLocaleString('en-US')}`;

/** why the club cannot go up a level for money (null: it can) */
export function clubUpgradeWhy(bag: BagSave | null | undefined, club: Club, ctx: ShopCtx): string | null {
  if (!clubsOf(bag).includes(club)) return 'Not in your bag';
  const lv = levelOf(bag, club);
  if (lv >= MAX_LEVEL) return 'A Prototype already';
  if (!ctx.shop) return ctx.shopWhy || 'No shop to buy from yet';
  const price = priceOf(club, lv + 1);
  return ctx.money < price ? `Needs ${dollars(price)}` : null;
}
/** why a sponsor's voucher cannot take the club up a level (null: it can) */
export function voucherWhy(bag: BagSave | null | undefined, club: Club): string | null {
  if (!clubsOf(bag).includes(club)) return 'Not in your bag';
  if (!(bag?.vouchers && bag.vouchers > 0)) return 'No voucher';
  return levelOf(bag, club) >= VOUCHER_MAX_LEVEL ? 'A voucher goes up to Tour' : null;
}
/** the bag with a club one level up, for money (cost: the price) or a voucher (free); the bag as it is when it cannot (check clubUpgradeWhy / voucherWhy first) */
export function upgradeClub(bag: BagSave | null | undefined, club: Club, voucher = false): { bag: BagSave | null; cost: number } {
  const b = bag ?? DEFAULT_BAG, lv = levelOf(b, club);
  if (!clubsOf(b).includes(club) || lv >= MAX_LEVEL || (voucher && voucherWhy(b, club))) return { bag: normalizeBag(b), cost: 0 };
  const next: BagSave = { ...b, lv: { ...b.lv, [club]: lv + 1 } };
  if (voucher) next.vouchers = (b.vouchers ?? 0) - 1;
  return { bag: normalizeBag(next), cost: voucher ? 0 : priceOf(club, lv + 1) };
}
/** the bag with a sponsor's voucher more (a title's prize) */
export function addVoucher(bag: BagSave | null | undefined): BagSave | null { const b = bag ?? DEFAULT_BAG; return normalizeBag({ ...b, vouchers: Math.min(VOUCHERS_MAX, (b.vouchers ?? 0) + 1) }); }
/** the bag with the third wood's slot taken by the 5-wood or the hybrid (each keeps its own level) */
export function setThird(bag: BagSave | null | undefined, which: 'wood5' | 'hybrid'): BagSave | null {
  const { third: _t, ...rest } = bag ?? DEFAULT_BAG; void _t;
  return normalizeBag(which === 'hybrid' ? { ...rest, third: 'hybrid' } : rest);
}
/** why a putter part cannot be fitted (null: it can): a part you own is fitted for free, anywhere; a new one needs the shop and its price */
export function partWhy(bag: BagSave | null | undefined, kind: PartKind, id: string, ctx: ShopCtx): string | null {
  const p = PARTS[kind].find(x => x.id === id); if (!p) return 'No such part';
  if (fittedPart(bag, kind).id === id) return 'Fitted';
  if (ownsPart(bag, kind, id)) return null;
  if (!ctx.shop) return ctx.shopWhy || 'No shop to buy from yet';
  return ctx.money < p.price ? `Needs ${dollars(p.price)}` : null;
}
/** the bag with a putter part fitted (bought first when you do not own it: cost its price) */
export function fitPart(bag: BagSave | null | undefined, kind: PartKind, id: string): { bag: BagSave | null; cost: number } {
  const b = bag ?? DEFAULT_BAG, p = PARTS[kind].find(x => x.id === id); if (!p) return { bag: normalizeBag(b), cost: 0 };
  const cost = ownsPart(b, kind, id) ? 0 : p.price, have = b.own?.[kind] ?? [], now = have.includes(id) || p.id === PARTS[kind][0]!.id ? have : [...have, id];
  const next: BagSave = { ...b, ...(kind === 'shaft' ? { shaft: id } : { head: id }), own: { ...b.own, ...(kind === 'shaft' ? { shaft: now } : { head: now }) } };
  return { bag: normalizeBag(next), cost };
}

// ---- the bag as the card shows it ----
const clampN = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
/** a signed percent for a factor: x1.04 is "+4%", x0.9 "-10%" */
const pct = (f: number): string => `${f >= 1 ? '+' : '-'}${Math.abs(Math.round((f - 1) * 100 * 10) / 10)}%`;
/** a level's or part's effect as lines for the card: "+2% carry", "scatter -3%", "sweet spot +4%", "spin +10%", "feel +30%", "mishits -1 in 100", "luck +25%" */
export function fxLines(fx: LevelFx & { luck?: number }, scatter = 'scatter'): string[] {
  const out: string[] = [];
  if (fx.carry && fx.carry !== 1) out.push(`${pct(fx.carry)} carry`);
  if (fx.spread && fx.spread !== 1) out.push(`${scatter} ${pct(fx.spread)}`);
  if (fx.sweet && fx.sweet !== 1) out.push(`sweet spot ${pct(fx.sweet)}`);
  if (fx.spin && fx.spin !== 1) out.push(`spin ${pct(fx.spin)}`);
  if (fx.feel && fx.feel !== 1) out.push(`feel ${pct(fx.feel)}`);
  if (fx.line && fx.line !== 1) out.push(`line ${pct(fx.line)}`);
  if (fx.mishit) out.push(`mishits ${fx.mishit < 0 ? '-' : '+'}${Math.abs(Math.round(fx.mishit * 100))} in 100`);
  if (fx.luck) out.push(`luck ${fx.luck > 0 ? '+' : '-'}${Math.abs(Math.round(fx.luck * 100))}%`);
  return out;
}
/** what going from the current level's effect to the next one's adds: the factors divided, the mishit chance subtracted */
export function fxDelta(next: LevelFx, cur: LevelFx | undefined): LevelFx {
  const d: LevelFx = {};
  for (const k of ['carry', 'spread', 'sweet', 'spin', 'feel', 'line'] as const) { const a = next[k] ?? 1, b = cur?.[k] ?? 1; if (a !== b) d[k] = a / b; }
  const m = (next.mishit ?? 0) - (cur?.mishit ?? 0); if (m) d.mishit = Math.round(m * 1000) / 1000;
  return d;
}
/** the forgiveness of a club kit as 1..5 pips: the sweet spot against the scatter (a hybrid forgives, a lob wedge does not, a Prototype most), and the mishits it gives */
export function forgivePips(k: { spread: number; sweet: number; mishit: number }): number {
  const r = k.sweet / k.spread - 6 * k.mishit; // (a mishit chance of 1 in 100 counts as much as a 6% wider sweet spot)
  return Math.round(clampN(1 + 4 * (r - 0.85) / 0.45, 1, 5));
}
/** the launch in words from the loft */
export const launchWord = (loft: number): string => loft <= 16 ? 'Low' : loft <= 30 ? 'Mid' : loft <= 42 ? 'High' : 'Very high';

/** one club of the bag as the card shows it, for a golfer's game (carry, spin, forgiveness after the club's level and his stats) and what the next level offers */
export interface ClubRow {
  club: Club; name: string; short: string; family: Family; kind: PriceKind; level: number; levelName: string;
  /** his full carry with it (metres; 0 for the putter) */ carryM: number;
  /** the loft in degrees and the launch in words (Low, Mid, High, Very high) */ loftDeg: number; launch: string;
  /** "runs on", "lands soft" or null */ runs: string | null;
  /** the backspin it can put on the ball, as a share of the most (0..100; the putter 0) */ spinPct: number;
  /** its forgiveness, 1..5 pips */ forgive: number;
  /** the next level: its number and name, its price, what it adds, and why money cannot buy it (null: it can), why a voucher cannot (null: it can); null at the Prototype */
  next: { level: number; name: string; price: number; lines: string[]; why: string | null; voucherWhy: string | null } | null;
}
/** a putter part as the card shows it */
export interface PartRow { kind: PartKind; id: string; name: string; note: string; price: number; owned: boolean; fitted: boolean; lines: string[]; why: string | null }
/** the whole bag card */
export interface BagView {
  rows: ClubRow[]; groups: { name: string; rows: ClubRow[] }[];
  /** the third wood's slot: which is in the bag, and the one out of it with its level */
  third: { is: 'wood5' | 'hybrid'; out: Club; outLevel: number };
  putter: { shafts: PartRow[]; heads: PartRow[]; shaft: string; head: string; /** the fitted putter's feel (pace window and leave), line (the aim window and the sweet spot) and luck */ feel: number; line: number; luck: number };
  money: number; shop: boolean; shopWhy: string | null; vouchers: number;
  /** the bag's worth: the clubs' levels summed (0..42) of the most */ points: number; max: number;
}

/** the bag card's view: `sk` is the golfer's game with the bag's gear in it (gameSkills(skills, 0, bagGear(bag))), `ctx` the shop and his money */
export function bagView(bag: BagSave | null | undefined, sk: GameSkills, ctx: ShopCtx): BagView {
  const clubs = clubsOf(bag);
  const rows: ClubRow[] = clubs.map(club => {
    // (spin, runs and forgiveness are the club's own, with his mods but not his stats: a golfer's accuracy does not make a lob wedge forgiving)
    const kit = applyMods({ driving: sk.driving, irons: sk.irons, short: sk.short, putting: sk.putting, ...(sk.mods ? { mods: sk.mods } : {}) }, club), lv = levelOf(bag, club), kind = KIND_OF[club], putter = club === 'putter';
    const nextLv = lv + 1, why = lv >= MAX_LEVEL ? null : clubUpgradeWhy(bag, club, ctx);
    return {
      club, name: cap1(clubName(club)), short: CLUB_SHORT[club], family: FAMILY[club], kind, level: lv, levelName: LEVEL_NAME[lv]!,
      carryM: putter ? 0 : carryFor(sk, club), loftDeg: LOFT[club], launch: putter ? '' : launchWord(LOFT[club]),
      runs: putter ? null : kit.roll > 1.04 ? 'runs on' : kit.roll < 0.96 ? 'lands soft' : null,
      spinPct: putter ? 0 : Math.round(clampN(SPIN_BACK_CAP[club] * kit.spin, 0, 1) * 100), forgive: forgivePips(kit),
      next: lv >= MAX_LEVEL ? null : { level: nextLv, name: LEVEL_NAME[nextLv]!, price: priceOf(club, nextLv), lines: fxLines(fxDelta(LEVEL_FX[kind][nextLv - 1]!, lv >= 1 ? LEVEL_FX[kind][lv - 1] : undefined), putter ? 'leave' : 'scatter'), why, voucherWhy: voucherWhy(bag, club) },
    };
  });
  const groups = CLUB_GROUPS.map(g => ({ name: g.name, rows: rows.filter(r => g.clubs.includes(r.club)) })).filter(g => g.rows.length);
  const pk = applyMods(sk, 'putter'), hy = bag?.third === 'hybrid';
  const parts = (kind: PartKind): PartRow[] => PARTS[kind].map(p => ({ kind, id: p.id, name: p.name, note: p.note, price: p.price, owned: ownsPart(bag, kind, p.id), fitted: fittedPart(bag, kind).id === p.id, lines: fxLines(p.mod, 'leave'), why: partWhy(bag, kind, p.id, ctx) }));
  const out: Club = hy ? 'wood5' : 'hybrid';
  return {
    rows, groups, third: { is: hy ? 'hybrid' : 'wood5', out, outLevel: levelOf(bag, out) },
    putter: { shafts: parts('shaft'), heads: parts('head'), shaft: fittedPart(bag, 'shaft').id, head: fittedPart(bag, 'head').id, feel: pk.feel / pk.spread, line: pk.line * pk.sweet, luck: pk.luck },
    money: ctx.money, shop: ctx.shop, shopWhy: ctx.shopWhy ?? null, vouchers: bag?.vouchers ?? 0,
    points: rows.reduce((a, r) => a + r.level, 0), max: rows.length * MAX_LEVEL,
  };
}

/** a club's own base character (CLUB_BASE) as lines: "runs on", "forgiving", "lands soft", "hard to hit" */
export function baseNote(club: Club): string | null {
  const b = CLUB_BASE[club]; if (!b) return null;
  const out: string[] = [];
  if ((b.sweet ?? 1) > 1.03 || (b.spread ?? 1) < 0.98) out.push('forgiving');
  if ((b.sweet ?? 1) < 0.97 || (b.spread ?? 1) > 1.03) out.push('hard to hit');
  if ((b.roll ?? 1) > 1.03) out.push('runs on');
  if ((b.roll ?? 1) < 0.97) out.push('lands soft');
  return out.length ? out.join(', ') : null;
}

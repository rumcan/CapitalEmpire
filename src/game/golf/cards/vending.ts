// T336 (#962): the vending machine's odds and its reel. Copied from TrickOrTreat's `src/game/vending.ts` and `vending-odds.ts` (read-only there; the owner, 2026-11-04: "lets copy the vending machine from the
// trick or treat game where is spins like the counterstrike cases opening"), made for cards: rarity odds by the grade of the pull, duds (golf junk), the prize rolled ONCE before the animation (the reel's decoys
// never decide anything) and the reel that spins and slows to land on it.
// - A pull has a grade (collection.ts: bronze, silver, gold). The grade sets the odds of each rarity and the share of duds: bronze is TrickOrTreat's table (half the pulls common, one in a hundred legendary, one
//   in five a dud), silver a better one, gold never a common and never a dud.
// - The prize is a card you do not own (uniform among the unowned of the rarity drawn). When you own every card of that rarity the machine pays a sponsor's voucher instead (one club upgraded free: bag.ts), so a
//   complete rarity still pays. A dud is junk from the pro shop's lost-and-found and wins nothing.
// Pure TS, no DOM; the rolls take a `random` (Math.random by default; the tests seed it).
import { CARDS, DUDS, RARITIES, rarityOf, type CardDef, type DudDef, type Rarity } from './catalogue';
import type { Grade } from './collection';

/** the chance of each rarity (common .. legendary) of a pull, by grade, as weights: bronze is TrickOrTreat's [50, 30, 15, 4, 1]; gold has no common */
export const RARITY_ODDS: Readonly<Record<Grade, readonly [number, number, number, number, number]>> = {
  bronze: [50, 30, 15, 4, 1], silver: [30, 35, 22, 10, 3], gold: [0, 25, 40, 25, 10],
};
/** the share of pulls that are duds, by grade (TrickOrTreat's one in five at bronze; gold has none) */
export const DUD_SHARE: Readonly<Record<Grade, number>> = { bronze: 0.2, silver: 0.1, gold: 0 };
/** the reel: the prize stands at this tile, with REEL_AFTER more after it (TrickOrTreat's 42 and 5) */
export const REEL_STOP = 42, REEL_AFTER = 5;

/** what a pull wins: a card, a sponsor's voucher (every card of the rarity drawn is yours) or a dud */
export type Prize =
  | { kind: 'card'; key: string; rarity: Rarity; card: CardDef }
  | { kind: 'voucher'; key: string; rarity: Rarity }
  | { kind: 'dud'; key: string; rarity: 0; dud: DudDef };
export const cardPrize = (card: CardDef): Prize => ({ kind: 'card', key: `card:${card.id}`, rarity: card.rarity, card });
export const voucherPrize = (rarity: Rarity): Prize => ({ kind: 'voucher', key: `voucher:${rarity}`, rarity });
export const dudPrize = (dud: DudDef): Prize => ({ kind: 'dud', key: `dud:${dud.id}`, rarity: 0, dud });
/** the prize as the reel and the card name it */
export const prizeName = (p: Prize): string => p.kind === 'card' ? p.card.name : p.kind === 'voucher' ? 'Sponsor’s Voucher' : p.dud.name;
/** "Epic card", "Rare voucher", "Dud" */
export const prizeKind = (p: Prize): string => p.kind === 'dud' ? 'Dud' : `${rarityOf(p).name} ${p.kind}`;

/** one of a pool by weight (TrickOrTreat's weightedPick: only positive finite weights count; null when none does) */
export function weightedPick<T extends { weight: number }>(pool: readonly T[], random: () => number = Math.random): T | null {
  const available = pool.filter(item => Number.isFinite(item.weight) && item.weight > 0);
  const total = available.reduce((sum, item) => sum + item.weight, 0);
  if (!available.length) return null;
  let roll = Math.max(0, Math.min(1 - Number.EPSILON, random())) * total;
  for (const item of available) { roll -= item.weight; if (roll < 0) return item; }
  return available[available.length - 1]!;
}

/** the prize of one pull of a grade for a collection (the cards you own): a dud by the grade's share, else a rarity by its odds, then a card of it you do not own (a voucher when you own them all). One to three draws */
export function rollPrize(owned: ReadonlySet<string>, grade: Grade, random: () => number = Math.random): Prize {
  if (random() < DUD_SHARE[grade]) return dudPrize(DUDS[Math.min(DUDS.length - 1, Math.floor(random() * DUDS.length))]!);
  const r = (weightedPick(RARITY_ODDS[grade].map((weight, rarity) => ({ rarity: rarity as Rarity, weight })), random)?.rarity ?? 0) as Rarity;
  const left = CARDS.filter(c => c.rarity === r && !owned.has(c.id));
  return left.length ? cardPrize(left[Math.min(left.length - 1, Math.floor(random() * left.length))]!) : voucherPrize(r);
}

/** a spin of the machine: its id, the pull's grade, the reel (tiles, left to right), the tile the reel stops on, the prize (the tile there) and whether the reel is still turning. The prize was decided before the reel was laid */
export interface VendingSpin { id: number; grade: Grade; reel: Prize[]; stop: number; winner: Prize; status: 'spinning' | 'won' }
const NONE: ReadonlySet<string> = new Set();
/** the reel for a prize: REEL_STOP + REEL_AFTER tiles of decoys (drawn as if you owned nothing, so the strip looks like the grade's own odds), a rare or better card either side of the prize (the near miss a case-opening reel
 *  teases you with) and the prize at REEL_STOP. The decoys decide nothing */
export function createSpin(id: number, grade: Grade, winner: Prize, random: () => number = Math.random): VendingSpin {
  const reel: Prize[] = Array.from({ length: REEL_STOP + REEL_AFTER + 1 }, () => rollPrize(NONE, grade, random));
  const big = CARDS.filter(c => c.rarity >= 2), tease = (): Prize => cardPrize(big[Math.min(big.length - 1, Math.floor(random() * big.length))]!);
  reel[REEL_STOP - 1] = tease(); reel[REEL_STOP + 1] = tease(); reel[REEL_STOP] = winner;
  return { id, grade, reel, stop: REEL_STOP, winner, status: 'spinning' };
}

/** the odds as the machine's catalogue shows them: the share of duds, and for each rarity its chance of any pull, the cards of it you do not have yet (of how many) and what it pays (a card, or a voucher once you have them all) */
export interface OddsRow { rarity: Rarity; name: string; color: string; chance: number; left: number; total: number; pays: 'card' | 'voucher' }
export function oddsView(owned: ReadonlySet<string>, grade: Grade): { dud: number; rows: OddsRow[] } {
  const w = RARITY_ODDS[grade], sum = w.reduce((a, b) => a + b, 0), dud = DUD_SHARE[grade];
  return {
    dud, rows: RARITIES.map((r, i) => {
      const cards = CARDS.filter(c => c.rarity === i), left = cards.filter(c => !owned.has(c.id)).length;
      return { rarity: i as Rarity, name: r.name, color: r.color, chance: (1 - dud) * w[i]! / sum, left, total: cards.length, pays: left > 0 || cards.length === 0 ? 'card' as const : 'voucher' as const };
    }),
  };
}

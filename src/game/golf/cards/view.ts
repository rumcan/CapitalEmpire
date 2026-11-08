// T336 (#962): your cards as the screens show them: the Cards card (the 8 slots and the collection, each card with its words and why it cannot go in a slot now) and the vending machine (the pulls
// waiting, the odds for what you own, the spin under way). Built from the profile's cards and what the engine knows (busy on the course, the pro shop); pure TS, no DOM.
import { CARDS, RARITIES, cardLines, type CardDef, type Glyph, type Rarity } from './catalogue';
import { GRADES, SLOTS, bestGrade, cardEffects, equipWhy, equipped, ownsCard, pullCount, slotOf, type CardsSave, type Grade } from './collection';
import { oddsView, type OddsRow, type VendingSpin } from './vending';
import { FAMILY, LEGACY_MECH, type MechId } from '../play/mods';
import type { Club } from '../play/types';

/** a card as a tile and a detail: its words (hidden by the screen for a card you do not own), whether you own it, the slot it is in (-1: none), its effect lines, and why it cannot go into a slot now (null: it can) */
export interface CardTile {
  id: string; name: string; rarity: Rarity; rarityName: string; color: string; glyph: Glyph; art?: string; owned: boolean; slot: number; lines: string[]; text: string; flavour: string; inspiration: string; banned: boolean; why: string | null;
}
const tileOf = (d: CardDef, c: CardsSave | undefined, busy: string | null): CardTile => {
  const r = RARITIES[d.rarity];
  return { id: d.id, name: d.name, rarity: d.rarity, rarityName: r.name, color: r.color, glyph: d.glyph, ...(d.art ? { art: d.art } : {}), owned: ownsCard(c, d.id), slot: slotOf(c, d.id), lines: cardLines(d), text: d.text, flavour: d.flavour, inspiration: d.inspiration,
    banned: d.banned === 'competition', why: ownsCard(c, d.id) ? equipWhy(c, d.id, undefined, busy) : 'You have not won this card yet' };
};

/** a card in play at a shot: its look and lines, `here` when it is for the club in hand (a mod naming the club or its family, or one for every club, or a mechanic) and `off` when the shot is a competition's and the card is banned there */
export interface PlayCard { id: string; name: string; color: string; glyph: Glyph; art?: string; lines: string[]; here: boolean; off: boolean }
export function cardsInPlay(c: CardsSave | undefined, club: Club, competition: boolean): PlayCard[] {
  return equipped(c).map(d => {
    const mine = (d.fx.mods ?? []).some(m => !m.clubs || m.clubs.includes(club) || m.clubs.includes(FAMILY[club])), off = competition && d.banned === 'competition';
    return { id: d.id, name: d.name, color: RARITIES[d.rarity].color, glyph: d.glyph, ...(d.art ? { art: d.art } : {}), lines: cardLines(d), here: !off && (mine || !!d.fx.mech?.length), off };
  });
}

/** the mechanics a profile has: its cards' (a profile without cards, or a legacy one, has the game's own two as well) */
export const mechOf = (c: CardsSave | undefined): MechId[] => c ? cardEffects(c).mech : [...LEGACY_MECH];

/** the Cards card: the 8 slots (a tile or null), the whole catalogue (legendary first, the ones you own first within a rarity), how many you own, the pulls waiting by grade, why cards cannot change now (busy: out on the course), whether the machine
 *  can open (a pro shop to stand in: the same shop the bag buys from) and the two mechanics a card unlocks, whether you have each */
export interface CardsView { slots: (CardTile | null)[]; tiles: CardTile[]; owned: number; total: number; pulls: Record<Grade, number>; pullTotal: number; busy: string | null; machine: { ok: boolean; why: string | null }; mech: { boost: boolean; airspin: boolean } }
export function cardsView(c: CardsSave | undefined, ctx: { busy: string | null; shop: boolean; shopWhy: string | null }): CardsView {
  const tiles = CARDS.map(d => tileOf(d, c, ctx.busy)).sort((a, b) => b.rarity - a.rarity || Number(b.owned) - Number(a.owned) || (a.name < b.name ? -1 : 1)), by = new Map(tiles.map(t => [t.id, t] as const));
  const slots = Array.from({ length: SLOTS }, (_, i) => { const id = c?.slots[i]; return (id ? by.get(id) : undefined) ?? null; });
  const m = mechOf(c);
  return { slots, tiles, owned: tiles.filter(t => t.owned).length, total: tiles.length, pulls: c ? { ...c.pulls } : { bronze: 0, silver: 0, gold: 0 }, pullTotal: pullCount(c), busy: ctx.busy, machine: { ok: ctx.shop, why: ctx.shopWhy }, mech: { boost: m.includes('boost'), airspin: m.includes('airspin') } };
}

/** the vending machine: the spin under way or shown (null: none yet), the pulls waiting and the grade the next spin uses (the best you have), the odds of each grade for the cards you own, how many you own, the junk and the pulls opened so far,
 *  the sponsor's vouchers you hold, why Spin is off (null: it can spin) and the card just won with why it cannot go into a slot now (null: it can) */
export interface VendingView {
  spin: VendingSpin | null; pulls: Record<Grade, number>; pullTotal: number; best: Grade | null; odds: Record<Grade, { dud: number; rows: OddsRow[] }>; owned: number; total: number; junk: number; opened: number; vouchers: number;
  why: string | null; won: { tile: CardTile; why: string | null } | null;
}
export function vendingView(c: CardsSave | undefined, spin: VendingSpin | null, ctx: { busy: string | null; vouchers: number }): VendingView {
  const own = new Set(c?.own ?? []), spinning = spin?.status === 'spinning', best = bestGrade(c);
  const w = spin && spin.status === 'won' && spin.winner.kind === 'card' ? spin.winner.card : null;
  return {
    spin, pulls: c ? { ...c.pulls } : { bronze: 0, silver: 0, gold: 0 }, pullTotal: pullCount(c), best, odds: Object.fromEntries(GRADES.map(g => [g, oddsView(own, g)])) as VendingView['odds'],
    owned: own.size, total: CARDS.length, junk: c?.junk ?? 0, opened: c?.opened ?? 0, vouchers: ctx.vouchers,
    why: spinning ? 'The machine is choosing your prize' : best ? null : 'No pulls waiting: win a title, finish well or win a money match',
    won: w ? { tile: tileOf(w, c, ctx.busy), why: equipWhy(c, w.id, undefined, ctx.busy) } : null,
  };
}

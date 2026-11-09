// T336 (#962): your cards: the ones you own, the 8 slots they sit in, the pulls waiting at the vending machine, and what the equipped ones do to your game.
// - You own each card once (the machine never hands you one you have; when every card of a rarity is yours it pays a sponsor's voucher instead: vending.ts). Eight slots; a card in a slot is in play.
//   Cards swap between rounds, never in one (the engine says when: `busy`); a card that is banned in competition is switched off in the club's events and the tournament, and sits in its slot.
// - The profile keeps it all (PlayerProfile.cards). A profile WITHOUT it is a save from before the cards: it keeps the Space power-spam and the spin added in the air, which new games earn with cards
//   (`legacy`: the first pull a save from before the cards wins makes its cards with it set, so it never loses them). A new game's profile has an empty one (player.ts startProfile).
// - What the equipped cards do reaches the shot model as plain data: `cardsGear` adds their `Mod`s after the bag's (mods.ts applyMods is the one function every shot reads) and lists the
//   mechanics they unlock (GameSkills.mech). Nothing else in the model knows about cards.
// Pure TS, no DOM, no draws.
import { LEGACY_MECH, type MechId, type Mod } from '../play/mods';
import type { Gear } from '../play/bag';
import { ECO_KEYS, cardById, cardMods, type CardDef, type CardEco } from './catalogue';

/** the card slots on your player */
export const SLOTS = 8;
/** the grades of a pull: the smaller ones are what good finishes earn, the gold ones what wins earn (earning.ts); a grade moves the odds of the machine (vending.ts) */
export type Grade = 'bronze' | 'silver' | 'gold';
export const GRADES: readonly Grade[] = ['bronze', 'silver', 'gold'];
export const GRADE_NAME: Readonly<Record<Grade, string>> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
/** the most pulls of one grade that wait at the machine */
export const PULLS_MAX = 99;

/** your cards as the profile keeps them (PlayerProfile.cards): the cards you own (ids, in the order you won them), the 8 slots (an id or null), the pulls waiting by grade, the pulls opened and the junk the machine
 *  gave (duds), the last tournament that paid a pull (a reload of its results pays nothing twice) and `legacy`: a save from before the cards, which keeps the mechanics the game had without them */
export interface CardsSave { v: 1; own: string[]; slots: (string | null)[]; pulls: Record<Grade, number>; opened: number; junk: number; paid?: { tourney?: number }; legacy?: true;
  /** T389 (#1049): the welcome pull has been dealt (welcomeDue): a new game's one silver pull on its first visit to the pro shop or its first round. Saved, so it is never dealt again */
  welcome?: true }

/** a new game's cards: none, the slots empty, nothing waiting (and none of the mechanics a card unlocks: `legacy` is for a save from before the cards) */
export const emptyCards = (legacy = false): CardsSave => ({ v: 1, own: [], slots: Array<string | null>(SLOTS).fill(null), pulls: { bronze: 0, silver: 0, gold: 0 }, opened: 0, junk: 0, ...(legacy ? { legacy: true as const } : {}) });

const num = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
/** your cards as a save keeps them, or undefined when there is none (an older save: legacy). Ids of cards that are not in the catalogue (a card cut since) are dropped from the collection and the slots; a slot holds an owned card once;
 *  the counts are whole numbers (the pulls at most PULLS_MAX) */
export function normalizeCards(x: unknown): CardsSave | undefined {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return undefined;
  const o = x as Partial<CardsSave>, own: string[] = [];
  if (Array.isArray(o.own)) for (const id of o.own as unknown[]) if (typeof id === 'string' && cardById(id) && !own.includes(id)) own.push(id);
  const slots = Array<string | null>(SLOTS).fill(null);
  if (Array.isArray(o.slots)) (o.slots as unknown[]).slice(0, SLOTS).forEach((id, i) => { if (typeof id === 'string' && own.includes(id) && !slots.includes(id)) slots[i] = id; });
  const p = (o.pulls && typeof o.pulls === 'object' ? o.pulls : {}) as Partial<Record<Grade, unknown>>;
  const out: CardsSave = { v: 1, own, slots, pulls: { bronze: Math.min(PULLS_MAX, num(p.bronze)), silver: Math.min(PULLS_MAX, num(p.silver)), gold: Math.min(PULLS_MAX, num(p.gold)) }, opened: num(o.opened), junk: num(o.junk) };
  const t = o.paid?.tourney; if (typeof t === 'number' && Number.isFinite(t)) out.paid = { tourney: Math.floor(t) };
  if (o.legacy === true) out.legacy = true;
  if (o.welcome === true) out.welcome = true;
  return out;
}

/** whether you own a card */
export const ownsCard = (c: CardsSave | undefined, id: string): boolean => !!c?.own.includes(id);
/** the slot a card is in (-1: none) */
export const slotOf = (c: CardsSave | undefined, id: string): number => c ? c.slots.indexOf(id) : -1;
/** the equipped cards in slot order (a slot of a card since cut is empty) */
export function equipped(c: CardsSave | undefined): CardDef[] {
  const out: CardDef[] = []; if (!c) return out;
  for (const id of c.slots) { const d = id ? cardById(id) : undefined; if (d) out.push(d); }
  return out;
}
/** how many pulls wait, in all */
export const pullCount = (c: CardsSave | undefined): number => c ? c.pulls.bronze + c.pulls.silver + c.pulls.gold : 0;
/** the cards you own, as their definitions (the order you won them) */
export function ownedCards(c: CardsSave | undefined): CardDef[] { return (c?.own ?? []).map(id => cardById(id)).filter((d): d is CardDef => !!d); }

/** why a card cannot go into a slot now (null: it can): you do not own it, it is in play already, you are out on the course (`busy`: the engine's reason; cards swap between rounds), or no slot is free and none was picked.
 *  `slot` the slot picked (a card in it is put back in the collection), absent: the first free one */
export function equipWhy(c: CardsSave | undefined, id: string, slot?: number, busy?: string | null): string | null {
  if (!cardById(id)) return 'Not a card';
  if (!ownsCard(c, id)) return 'You do not have this card yet';
  if (busy) return busy;
  const at = slotOf(c, id);
  if (slot === undefined && at >= 0) return 'Already in a slot';
  if (slot !== undefined && (slot < 0 || slot >= SLOTS || !Number.isInteger(slot))) return 'No such slot';
  if (slot === at) return 'Already in that slot';
  if (slot === undefined && !c!.slots.includes(null)) return `All ${SLOTS} slots are full: pick a slot to swap it in`;
  return null;
}
/** the cards with `id` in a slot (the first free one, or the one picked: the card that was there goes back to the collection; a card already in another slot moves). Unchanged when equipWhy says no */
export function equipCard(c: CardsSave, id: string, slot?: number): CardsSave {
  if (equipWhy(c, id, slot)) return c;
  const slots = c.slots.slice(), at = slots.indexOf(id), to = slot ?? slots.indexOf(null);
  if (at >= 0) slots[at] = null;
  slots[to] = id;
  return { ...c, slots };
}
/** why the card in a slot cannot come out now (null: it can) */
export function unequipWhy(c: CardsSave | undefined, slot: number, busy?: string | null): string | null {
  if (!c || slot < 0 || slot >= SLOTS || !Number.isInteger(slot) || !c.slots[slot]) return 'Nothing in that slot';
  return busy || null;
}
/** the cards with a slot emptied (unchanged when unequipWhy says no) */
export function unequipCard(c: CardsSave, slot: number): CardsSave {
  if (unequipWhy(c, slot)) return c;
  const slots = c.slots.slice(); slots[slot] = null;
  return { ...c, slots };
}

/** the cards with a card more in the collection (new: it was not yours: the pull of a card you own is never made, so this is for the machine's prize and the dev tools) */
export function addCard(c: CardsSave, id: string): { cards: CardsSave; isNew: boolean } {
  if (!cardById(id) || c.own.includes(id)) return { cards: c, isNew: false };
  return { cards: { ...c, own: [...c.own, id] }, isNew: true };
}
/** the cards with n pulls more of a grade (at most PULLS_MAX of it) */
export function addPull(c: CardsSave, grade: Grade, n = 1): CardsSave { return { ...c, pulls: { ...c.pulls, [grade]: Math.min(PULLS_MAX, c.pulls[grade] + Math.max(0, Math.floor(n))) } }; }
/** the cards with one pull of a grade spent (unchanged with none) */
export function takePull(c: CardsSave, grade: Grade): CardsSave { return c.pulls[grade] > 0 ? { ...c, pulls: { ...c.pulls, [grade]: c.pulls[grade] - 1 } } : c; }
/** the grade the machine spends first when you do not pick one: the best you have (gold, then silver, then bronze); null with none waiting */
export function bestGrade(c: CardsSave | undefined): Grade | null { if (!c) return null; for (const g of ['gold', 'silver', 'bronze'] as const) if (c.pulls[g] > 0) return g; return null; }

/** T389 (#1049; the owner: a new game starts with the Space power-spam and the spin in the air locked until a card is won, so it meets the prize machine early): the WELCOME PULL, one silver pull, dealt once on a new game's first visit to the pro
 *  shop or its first round (the engine's `welcomePull` asks). Due only for a new game's cards (not `legacy`: a save from before the cards keeps both mechanics and is never given one; no cards at all is such a save too), not yet dealt (`welcome`), and
 *  only while the machine is a stranger: a save that already owns a card, has opened a pull, has pulls waiting or was paid one (a tournament) has met it, so an older save of the cards gets nothing on top of what it earned */
export function welcomeDue(c: CardsSave | undefined): boolean {
  return !!c && !c.legacy && !c.welcome && c.own.length === 0 && c.opened === 0 && pullCount(c) === 0 && !c.paid;
}
/** the cards with the welcome pull dealt: one silver pull and the saved mark. Unchanged when none is due, so asking twice (or after a save and load) deals it once */
export const grantWelcome = (c: CardsSave): CardsSave => welcomeDue(c) ? { ...addPull(c, 'silver'), welcome: true } : c;

// ---- what the equipped cards do to your game ----
/** what the equipped cards add to a golfer's game: their mods (in slot order, a card banned in competition left out when it is one), the mechanics they unlock (a legacy save's own two too) and the factor on practice gains */
export interface CardEffects { mods: Mod[]; mech: MechId[]; practice: number }
export function cardEffects(c: CardsSave | undefined, competition = false): CardEffects {
  const mods: Mod[] = [], mech: MechId[] = c?.legacy ? [...LEGACY_MECH] : []; let practice = 1;
  for (const d of equipped(c)) {
    if (competition && d.banned === 'competition') continue;
    mods.push(...cardMods(d));
    for (const m of d.fx.mech ?? []) if (!mech.includes(m)) mech.push(m);
    if (d.fx.practice) practice *= d.fx.practice;
  }
  return { mods, mech, practice };
}
/** the practice factor your cards give (1: none; the practice session's gains are multiplied by it). A card banned in competition is not a competition's: practice is not either, so it counts */
export const practiceFactor = (c: CardsSave | undefined): number => cardEffects(c, false).practice;

/** T337: the economy your equipped cards change (a card banned in competition is out of one, as for the shot): the factors (1: none) the engine multiplies a money match's winnings (matchPay), the purse an opponent brings (matchStake: a bigger stake is
 *  accepted), a title's prize (prize) and a lesson's addition to practice (lesson) by */
export function cardEco(c: CardsSave | undefined, competition = false): CardEco {
  const e: CardEco = { matchPay: 1, matchStake: 1, prize: 1, lesson: 1 };
  for (const d of equipped(c)) {
    if (competition && d.banned === 'competition') continue;
    for (const k of ECO_KEYS) { const f = d.fx.eco?.[k]; if (f) e[k] *= f; }
  }
  return e;
}

const memo = new WeakMap<object, { bag: Gear; plain?: Gear; comp?: Gear }>();
/** the gear of a golfer: the bag's with the cards' on it (after the bag's mods, in slot order) and the mechanics the cards unlock. Without cards (a profile from before them: undefined) it is the bag's gear exactly, whose skills list no
 *  mechanics: the legacy set. Remembered for a cards object and a bag's gear (profiles are replaced, not changed, so it is built again only when one of them changes) */
export function cardsGear(bag: Gear, c: CardsSave | undefined, competition = false): Gear {
  if (!c) return bag;
  let m = memo.get(c); if (!m || m.bag !== bag) { m = { bag }; memo.set(c, m); }
  const build = (): Gear => { const e = cardEffects(c, competition); return { mods: e.mods.length ? [...bag.mods, ...e.mods] : bag.mods, clubs: bag.clubs, mech: e.mech }; };
  return competition ? (m.comp ??= build()) : (m.plain ??= build());
}

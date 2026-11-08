// T334 part 2 (#960; the owner, 2026-11-04: "Shape the ball and spin and all the clubs and upgrading clubs and your driving, irons, putting wedges. Acurracy, power, etc."): the player's
// stats and the modifiers that stack on them, as plain data, and the ONE function that applies them (applyMods). T335 (the bag: 14 clubs with upgrades and putter shafts) and T336 (cards
// that change stats and clubs and unlock mechanics) add `Mod`s to `GameSkills.mods` (the engine builds the list: Game.yourSkills); they never touch the shot model.
// - Stats: the four parts of the game (T241: driving, irons, short game = the wedges, putting) and three new ones, each 0..1 here (the player card shows 0..100, nerve folds into all of them
//   under pressure: golf/player.ts gameSkills): power (how far: the carry, most on the woods), accuracy (how straight, how wide the sweet spot, how slow the marker) and touch (the wedges' and
//   the putter's feel: the scatter, the sweet spot and the marker of a short shot). 0.5 changes nothing: a field golfer, a save from before the stats, plays exactly as before.
// - A Mod is a card, a club or a shaft: stat changes (added, in 0..1 units) and factors on the shot's carry, scatter, sweet spot, marker speed and roll, an extra chance of a mishit, for every
//   club or the listed ones (a club or a family). applyMods stacks them in order and gives the ClubKit a club plays at.
// T335 (#961, the bag): a bag of 14 clubs and its upgrades and putter shafts are Mods too (bag.ts bagGear builds the list; nothing in the shot model knows the bag): three more factors a Mod can carry
// (`spin`, the spin that gets on the ball; `feel`, the putt's pace window; `line`, its aim window; `luck`, a bad putt may drop and a good one lip out), a mishit chance that can fall (a forgiving club), and each club's own base
// character (CLUB_BASE: only the clubs added with the bag have one; the original eight play exactly as they did).
// Pure TS, no DOM, no draws.
import type { Club, GameSkills } from './types';

/** the stats the shot model reads, each 0..1 */
export const STAT_IDS = ['driving', 'irons', 'short', 'putting', 'power', 'accuracy', 'touch'] as const;
export type StatId = (typeof STAT_IDS)[number];
export type Stats = Record<StatId, number>;
/** the stat that changes nothing (power, accuracy and touch at this play as before the stats) */
export const NEUTRAL = 0.5;

/** the clubs' families: the woods (the driver, the 3-wood and the 5-wood), the irons (the 4- to 9-irons, the hybrid and the pitching wedge), the wedge (the gap, sand and lob wedges), the putter */
export type Family = 'wood' | 'iron' | 'wedge' | 'putter';
export const FAMILY: Readonly<Record<Club, Family>> = { driver: 'wood', wood3: 'wood', wood5: 'wood', hybrid: 'iron', iron4: 'iron', iron5: 'iron', iron6: 'iron', iron7: 'iron', iron8: 'iron', iron9: 'iron', pw: 'iron', gw: 'wedge', sw: 'wedge', lw: 'wedge', putter: 'putter' };
/** the part of the game each club plays (T241). T335: the 5-wood drives; the hybrid, the 5-, 7- and 9-irons and the gap wedge play the irons (a full-swing approach, as the pitching wedge always did: the model's average
 *  is what the handicap curve was fitted to); only the lob wedge joins the sand wedge in the short game */
export const PART_OF: Readonly<Record<Club, 'driving' | 'irons' | 'short' | 'putting'>> = { driver: 'driving', wood3: 'driving', wood5: 'driving', hybrid: 'irons', iron4: 'irons', iron5: 'irons', iron6: 'irons', iron7: 'irons', iron8: 'irons', iron9: 'irons', pw: 'irons', gw: 'irons', sw: 'short', lw: 'short', putter: 'putting' };

/** a modifier (a card, a club's upgrade, a putter shaft): stat changes (added, 0..1 units: +0.1 is ten points) and factors (1: none) on the carry, the scatter, the sweet spot, the marker's
 *  speed and the roll, an extra chance of a mishit (added; below 0 a forgiving club has fewer), for every club or only the listed ones (a club or a family).
 *  T335: `spin`, a factor on the spin that gets on the ball (the club's backspin capacity and the share the lie lets on: spin.ts); `feel`, a factor on how far the putt's pace may be out before it
 *  stops dropping, and on how much of that error it leaves (distance control); `line`, a factor on the angle a putt may be off the line and still drop (the cup's angle: accuracy on the line); `luck` (added): a missed putt
 *  still drops now and then, a holed one lips out now and then (shot.ts luckyPutt: one draw, only when it is above 0) */
export interface Mod { id: string; name?: string; stats?: Partial<Record<StatId, number>>; carry?: number; spread?: number; sweet?: number; speed?: number; roll?: number; mishit?: number; clubs?: readonly (Club | Family)[];
  spin?: number; feel?: number; line?: number; luck?: number }

/** what a club plays at once the stats and the mods are applied: the part of the game's skill (0..1: what skillFor reads), the stats (after the mods), and the factors on the carry, the
 *  scatter (direction and distance), the sweet spot's width, the marker's speed and the roll, the extra chance of a mishit, and (T335) the factors on the spin, on the putt's pace window and on its aim window, and the putt's luck */
export interface ClubKit { skill: number; stats: Stats; carry: number; spread: number; sweet: number; speed: number; roll: number; mishit: number; spin: number; feel: number; line: number; luck: number }

/** T335: the character each club has of its own, on top of the golfer and his mods: the clubs added with the bag have one (a 5-wood and a hybrid forgive more and run on, the lob wedge lands soft and is harder to
 *  hit); the original eight have none, so they play exactly as they did before the bag (T346 #988 is where the clubs' run gets ranked across the whole bag). Factors (1: none), a mishit chance added */
export const CLUB_BASE: Readonly<Partial<Record<Club, { spread?: number; sweet?: number; roll?: number; mishit?: number }>>> = {
  wood5: { spread: 0.97, sweet: 1.04, roll: 1.05 },
  hybrid: { spread: 0.93, sweet: 1.08, roll: 1.1, mishit: -0.01 },
  gw: { roll: 0.92 },
  lw: { spread: 1.08, sweet: 0.92, roll: 0.8, mishit: 0.01 },
};

/** how the stats play (each at its distance from NEUTRAL): power's carry by family (a 100 power drives 10% further than 50, an iron 6%, a wedge 3%, a putter nothing); the control stat (accuracy
 *  for the woods and irons, touch for the putter, their mean for the wedge) tightens the scatter (a putter's: its leave), widens the sweet spot and slows the marker */
export const STAT_FX = { power: { wood: 0.2, iron: 0.12, wedge: 0.06, putter: 0 }, spread: 0.6, putterSpread: 0.5, sweet: 0.8, speed: 0.3 } as const;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** THE function: the club's kit from the golfer's skills (his part of the game's skill, the new stats and the mods in `sk.mods`). With no mods and the stats at NEUTRAL (or absent) it is the
 *  plain skill and factors of exactly 1 and a mishit of exactly 0, so the model plays as it did (T335: but for a club added with the bag, whose own base character, CLUB_BASE, is in it) */
export function applyMods(sk: GameSkills, club: Club): ClubKit {
  const fam = FAMILY[club], base = CLUB_BASE[club], st: Stats = { driving: sk.driving, irons: sk.irons, short: sk.short, putting: sk.putting, power: sk.power ?? NEUTRAL, accuracy: sk.accuracy ?? NEUTRAL, touch: sk.touch ?? NEUTRAL };
  let carry = 1, spread = base?.spread ?? 1, sweet = base?.sweet ?? 1, speed = 1, roll = base?.roll ?? 1, mishit = base?.mishit ?? 0, spin = 1, feel = 1, line = 1, luck = 0;
  for (const m of sk.mods ?? []) {
    if (m.clubs && !m.clubs.includes(club) && !m.clubs.includes(fam)) continue;
    if (m.stats) for (const k of STAT_IDS) { const d = m.stats[k]; if (d) st[k] = clamp01(st[k] + d); }
    carry *= m.carry ?? 1; spread *= m.spread ?? 1; sweet *= m.sweet ?? 1; speed *= m.speed ?? 1; roll *= m.roll ?? 1; mishit += m.mishit ?? 0;
    if (m.spin) spin *= m.spin; if (m.feel) feel *= m.feel; if (m.line) line *= m.line; if (m.luck) luck += m.luck;
  }
  const P = st.power - NEUTRAL, A = st.accuracy - NEUTRAL, T = st.touch - NEUTRAL, control = fam === 'putter' ? T : fam === 'wedge' ? (A + T) / 2 : A;
  carry *= 1 + STAT_FX.power[fam] * P;
  spread *= 1 - (fam === 'putter' ? STAT_FX.putterSpread : STAT_FX.spread) * control;
  sweet *= 1 + STAT_FX.sweet * control;
  speed *= 1 - STAT_FX.speed * control;
  return { skill: st[PART_OF[club]], stats: st, carry, spread, sweet, speed, roll, mishit, spin, feel, line, luck: Math.max(0, luck) };
}

/** the kit of a golfer whose skill may be one number (a field golfer: his skill plays every shot, no stats, no mods) or his skills */
export function kitOf(sk: number | GameSkills, club: Club): ClubKit {
  if (typeof sk === 'number') return { skill: sk, stats: { driving: sk, irons: sk, short: sk, putting: sk, power: NEUTRAL, accuracy: NEUTRAL, touch: NEUTRAL }, carry: 1, spread: 1, sweet: 1, speed: 1, roll: 1, mishit: 0, spin: 1, feel: 1, line: 1, luck: 0 };
  return applyMods(sk, club);
}

// ---- T336 (#962): the mechanics a card can unlock ----
/** the mechanics a card unlocks: moves of the swing and the shot that are not a plain number on the kit but a thing the player may do. `boost`: the Space power-spam (swing.ts: taps during the swing add power);
 *  `airspin`: adding spin with clicks while the ball is in the air (spin.ts `pump`). T337 adds its own (a driver off the deck, the putting reads...). The shot model reads them through `hasMech` and nothing else */
export const MECH_IDS = ['boost', 'airspin'] as const;
export type MechId = (typeof MECH_IDS)[number];
/** a golfer whose skills carry no `mech` list (a field golfer, a save from before the cards, a profile that predates them) has the mechanics the game had before the cards: they stay unlocked. A new game's profile
 *  lists its own (golf/cards: none until a card gives one), so there they are earned */
export const LEGACY_MECH: readonly MechId[] = ['boost', 'airspin'];
/** whether a golfer has a mechanic: the skills' `mech` list, else the legacy set (a plain skill number, a save without the list) */
export function hasMech(sk: number | GameSkills | null | undefined, id: MechId): boolean {
  if (sk === null || sk === undefined || typeof sk === 'number') return LEGACY_MECH.includes(id);
  return (sk.mech ?? LEGACY_MECH).includes(id);
}
/** the mechanics a save lists, as the known ids without repeats (an empty list stays empty: nothing unlocked); undefined when it is not a list at all (no list: the legacy set) */
export function readMech(v: unknown): MechId[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: MechId[] = [];
  for (const m of v as unknown[]) if (typeof m === 'string' && (MECH_IDS as readonly string[]).includes(m) && !out.includes(m as MechId)) out.push(m as MechId);
  return out;
}

/** the most modifiers a save keeps for a golfer (a deck of cards, a bag's upgrades: plenty) */
export const MAX_MODS = 64;
/** every club id and family a mod may name (a save's `clubs` are held to these) */
export const CLUB_IDS: readonly string[] = ['driver', 'wood3', 'wood5', 'hybrid', 'iron4', 'iron5', 'iron6', 'iron7', 'iron8', 'iron9', 'pw', 'gw', 'sw', 'lw', 'putter', 'wood', 'iron', 'wedge'];
/** the clubs a save names, as the known club ids without repeats (a bag's clubs: GameSkills.clubs); null when it is not a list of clubs or names none of them */
export function readClubs(v: unknown): Club[] | null {
  if (!Array.isArray(v)) return null;
  const out: Club[] = [];
  for (const c of v as unknown[]) if (typeof c === 'string' && (CLUB_IDS as readonly string[]).includes(c) && c !== 'wood' && c !== 'iron' && c !== 'wedge' && !out.includes(c as Club)) out.push(c as Club);
  return out.length ? out : null;
}
/** modifiers as a save keeps them (T336's cards and T335's clubs write them with the owner's skills so a reload replays the same round): the well-formed ones, at most MAX_MODS, each with a string id, the
 *  stat changes held to -1..1, the factors to 0.25..4, the mishit chance to -0.5..0.5 (T335: a forgiving club's falls), the luck to -1..1 (they add, and never below none) and the clubs to the known clubs and families. An unreadable one is
 *  dropped; so is one that named clubs and none of them is known (it would have reached every club) */
export function readMods(v: unknown): Mod[] {
  if (!Array.isArray(v)) return [];
  const out: Mod[] = [], num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x), fac = (x: unknown): number | undefined => num(x) ? Math.min(4, Math.max(0.25, x)) : undefined;
  for (const m of v.slice(0, MAX_MODS) as Partial<Mod>[]) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !m.id) continue;
    const r: Mod = { id: m.id.slice(0, 40) };
    if (typeof m.name === 'string') r.name = m.name.slice(0, 60);
    if (m.stats && typeof m.stats === 'object') { const st: Partial<Record<StatId, number>> = {}; for (const k of STAT_IDS) { const d = (m.stats as Record<string, unknown>)[k]; if (num(d) && d !== 0) st[k] = Math.min(1, Math.max(-1, d)); } if (Object.keys(st).length) r.stats = st; }
    for (const k of ['carry', 'spread', 'sweet', 'speed', 'roll', 'spin', 'feel', 'line'] as const) { const f = fac(m[k]); if (f !== undefined && f !== 1) r[k] = f; }
    if (num(m.mishit) && m.mishit !== 0) r.mishit = Math.min(0.5, Math.max(-0.5, m.mishit));
    if (num(m.luck) && m.luck !== 0) r.luck = Math.min(1, Math.max(-1, m.luck));
    const cl: unknown = m.clubs; // (unknown: Array.isArray on a readonly array's type narrows badly)
    if (cl !== undefined) {
      if (!Array.isArray(cl)) continue;
      const cs = cl.filter((c): c is Club | Family => typeof c === 'string' && CLUB_IDS.includes(c));
      if (!cs.length) continue; // (it named clubs and we know none of them: not a mod for every club)
      r.clubs = cs;
    }
    out.push(r);
  }
  return out;
}

/** a golfer's skills as a save keeps them (the tournament owner's, a booked round's), or null when the four parts of the game are not numbers: the four as saved, the stats beyond them held to 0..1
 *  (absent when they were not numbers), the mods through readMods and the clubs in the bag through readClubs. Absent fields stay absent: a save from before the stats or the bag plays as it did */
export function readGameSkills(v: unknown): GameSkills | null {
  const sk = v as Partial<GameSkills> | null | undefined;
  if (!sk || typeof sk !== 'object' || ![sk.driving, sk.irons, sk.short, sk.putting].every(x => typeof x === 'number' && Number.isFinite(x))) return null;
  const stat = (x: unknown): number | null => typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : null;
  const mods = readMods(sk.mods), clubs = readClubs(sk.clubs), mech = readMech(sk.mech);
  return { driving: sk.driving!, irons: sk.irons!, short: sk.short!, putting: sk.putting!, ...(stat(sk.power) !== null ? { power: stat(sk.power)! } : {}), ...(stat(sk.accuracy) !== null ? { accuracy: stat(sk.accuracy)! } : {}), ...(stat(sk.touch) !== null ? { touch: stat(sk.touch)! } : {}), ...(mods.length ? { mods } : {}), ...(clubs ? { clubs } : {}), ...(mech ? { mech } : {}) };
}

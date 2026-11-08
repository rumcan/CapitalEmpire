// T334 part 2 (#960; the owner, 2026-11-04: "Shape the ball and spin and all the clubs and upgrading clubs and your driving, irons, putting wedges. Acurracy, power, etc."): the player's
// stats and the modifiers that stack on them, as plain data, and the ONE function that applies them (applyMods). T335 (the bag: 14 clubs with upgrades and putter shafts) and T336 (cards
// that change stats and clubs and unlock mechanics) add `Mod`s to `GameSkills.mods` (the engine builds the list: Game.yourSkills); they never touch the shot model.
// - Stats: the four parts of the game (T241: driving, irons, short game = the wedges, putting) and three new ones, each 0..1 here (the player card shows 0..100, nerve folds into all of them
//   under pressure: golf/player.ts gameSkills): power (how far: the carry, most on the woods), accuracy (how straight, how wide the sweet spot, how slow the marker) and touch (the wedges' and
//   the putter's feel: the scatter, the sweet spot and the marker of a short shot). 0.5 changes nothing: a field golfer, a save from before the stats, plays exactly as before.
// - A Mod is a card, a club or a shaft: stat changes (added, in 0..1 units) and factors on the shot's carry, scatter, sweet spot, marker speed and roll, an extra chance of a mishit, for every
//   club or the listed ones (a club or a family). applyMods stacks them in order and gives the ClubKit a club plays at.
// Pure TS, no DOM, no draws.
import type { Club, GameSkills } from './types';

/** the stats the shot model reads, each 0..1 */
export const STAT_IDS = ['driving', 'irons', 'short', 'putting', 'power', 'accuracy', 'touch'] as const;
export type StatId = (typeof STAT_IDS)[number];
export type Stats = Record<StatId, number>;
/** the stat that changes nothing (power, accuracy and touch at this play as before the stats) */
export const NEUTRAL = 0.5;

/** the clubs' families: the woods (the driver and the 3-wood), the irons (4, 6, 8 and the pitching wedge), the wedge (the sand wedge), the putter */
export type Family = 'wood' | 'iron' | 'wedge' | 'putter';
export const FAMILY: Readonly<Record<Club, Family>> = { driver: 'wood', wood3: 'wood', iron4: 'iron', iron6: 'iron', iron8: 'iron', pw: 'iron', sw: 'wedge', putter: 'putter' };
/** the part of the game each club plays (T241) */
export const PART_OF: Readonly<Record<Club, 'driving' | 'irons' | 'short' | 'putting'>> = { driver: 'driving', wood3: 'driving', iron4: 'irons', iron6: 'irons', iron8: 'irons', pw: 'irons', sw: 'short', putter: 'putting' };

/** a modifier (a card, a club's upgrade, a putter shaft): stat changes (added, 0..1 units: +0.1 is ten points) and factors (1: none) on the carry, the scatter, the sweet spot, the marker's
 *  speed and the roll, an extra chance of a mishit (added), for every club or only the listed ones (a club or a family) */
export interface Mod { id: string; name?: string; stats?: Partial<Record<StatId, number>>; carry?: number; spread?: number; sweet?: number; speed?: number; roll?: number; mishit?: number; clubs?: readonly (Club | Family)[] }

/** what a club plays at once the stats and the mods are applied: the part of the game's skill (0..1: what skillFor reads), the stats (after the mods), and the factors on the carry, the
 *  scatter (direction and distance), the sweet spot's width, the marker's speed and the roll, and the extra chance of a mishit */
export interface ClubKit { skill: number; stats: Stats; carry: number; spread: number; sweet: number; speed: number; roll: number; mishit: number }

/** how the stats play (each at its distance from NEUTRAL): power's carry by family (a 100 power drives 10% further than 50, an iron 6%, a wedge 3%, a putter nothing); the control stat (accuracy
 *  for the woods and irons, touch for the putter, their mean for the wedge) tightens the scatter (a putter's: its leave), widens the sweet spot and slows the marker */
export const STAT_FX = { power: { wood: 0.2, iron: 0.12, wedge: 0.06, putter: 0 }, spread: 0.6, putterSpread: 0.5, sweet: 0.8, speed: 0.3 } as const;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** THE function: the club's kit from the golfer's skills (his part of the game's skill, the new stats and the mods in `sk.mods`). With no mods and the stats at NEUTRAL (or absent) it is the
 *  plain skill and factors of exactly 1 and a mishit of exactly 0, so the model plays as it did */
export function applyMods(sk: GameSkills, club: Club): ClubKit {
  const fam = FAMILY[club], st: Stats = { driving: sk.driving, irons: sk.irons, short: sk.short, putting: sk.putting, power: sk.power ?? NEUTRAL, accuracy: sk.accuracy ?? NEUTRAL, touch: sk.touch ?? NEUTRAL };
  let carry = 1, spread = 1, sweet = 1, speed = 1, roll = 1, mishit = 0;
  for (const m of sk.mods ?? []) {
    if (m.clubs && !m.clubs.includes(club) && !m.clubs.includes(fam)) continue;
    if (m.stats) for (const k of STAT_IDS) { const d = m.stats[k]; if (d) st[k] = clamp01(st[k] + d); }
    carry *= m.carry ?? 1; spread *= m.spread ?? 1; sweet *= m.sweet ?? 1; speed *= m.speed ?? 1; roll *= m.roll ?? 1; mishit += m.mishit ?? 0;
  }
  const P = st.power - NEUTRAL, A = st.accuracy - NEUTRAL, T = st.touch - NEUTRAL, control = fam === 'putter' ? T : fam === 'wedge' ? (A + T) / 2 : A;
  carry *= 1 + STAT_FX.power[fam] * P;
  spread *= 1 - (fam === 'putter' ? STAT_FX.putterSpread : STAT_FX.spread) * control;
  sweet *= 1 + STAT_FX.sweet * control;
  speed *= 1 - STAT_FX.speed * control;
  return { skill: st[PART_OF[club]], stats: st, carry, spread, sweet, speed, roll, mishit };
}

/** the kit of a golfer whose skill may be one number (a field golfer: his skill plays every shot, no stats, no mods) or his skills */
export function kitOf(sk: number | GameSkills, club: Club): ClubKit {
  if (typeof sk === 'number') return { skill: sk, stats: { driving: sk, irons: sk, short: sk, putting: sk, power: NEUTRAL, accuracy: NEUTRAL, touch: NEUTRAL }, carry: 1, spread: 1, sweet: 1, speed: 1, roll: 1, mishit: 0 };
  return applyMods(sk, club);
}

/** the most modifiers a save keeps for a golfer (a deck of cards, a bag's upgrades: plenty) */
export const MAX_MODS = 64;
const CLUB_IDS: readonly string[] = ['driver', 'wood3', 'iron4', 'iron6', 'iron8', 'pw', 'sw', 'putter', 'wood', 'iron', 'wedge'];
/** modifiers as a save keeps them (T336's cards and T335's clubs write them with the owner's skills so a reload replays the same round): the well-formed ones, at most MAX_MODS, each with a string id, the
 *  stat changes held to -1..1, the factors to 0.25..4, the mishit chance to 0..0.5 and the clubs to the known clubs and families; an unreadable one is dropped */
export function readMods(v: unknown): Mod[] {
  if (!Array.isArray(v)) return [];
  const out: Mod[] = [], num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x), fac = (x: unknown): number | undefined => num(x) ? Math.min(4, Math.max(0.25, x)) : undefined;
  for (const m of v.slice(0, MAX_MODS) as Partial<Mod>[]) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !m.id) continue;
    const r: Mod = { id: m.id.slice(0, 40) };
    if (typeof m.name === 'string') r.name = m.name.slice(0, 60);
    if (m.stats && typeof m.stats === 'object') { const st: Partial<Record<StatId, number>> = {}; for (const k of STAT_IDS) { const d = (m.stats as Record<string, unknown>)[k]; if (num(d) && d !== 0) st[k] = Math.min(1, Math.max(-1, d)); } if (Object.keys(st).length) r.stats = st; }
    for (const k of ['carry', 'spread', 'sweet', 'speed', 'roll'] as const) { const f = fac(m[k]); if (f !== undefined && f !== 1) r[k] = f; }
    if (num(m.mishit) && m.mishit !== 0) r.mishit = Math.min(0.5, Math.max(0, m.mishit));
    const cl: unknown = m.clubs; // (unknown: Array.isArray on a readonly array's type narrows badly)
    if (Array.isArray(cl)) { const cs = cl.filter((c): c is Club | Family => typeof c === 'string' && CLUB_IDS.includes(c)); if (cs.length) r.clubs = cs; }
    out.push(r);
  }
  return out;
}

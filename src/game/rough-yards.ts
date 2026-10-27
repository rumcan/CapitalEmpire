// Rough yards (T222, issue #618; the owner, 2026-10-27: "some backyards could also be fascue and dirt especialy at the start of the game. desert
// backyards"): a new or poor town does not mow every lawn. A share of its house lots wear golden fescue, bare dirt or desert in soft patches over the
// mown lawn (the renderer lays them through the blend noise, inside the lot's rugged outline: never a hard rectangle), most of it in the back
// yard. As the town grows the share falls and the yards are mown; an upgraded lot is always mown. Pure TS, no DOM.
//
// Deterministic from the lot's own seed: the decision is one hash of the seed against the share of the moment, so a re-bake gives the same yard, the
// yard never changes except when the share crosses it (as the town grows a rough yard turns to lawn and never back), and the lot composer's own random
// draws are never touched (no lot's props move). The kind, the cover and the patch size come from other hashes of the same seed.
import type { PresetState } from './lots/presets';

/** the three rough looks: golden fescue (the course's Fescue), bare dirt (the Dirt surface, dirt-run), desert (the Waste area sand, desert-run) */
export type RoughKind = 'fescue' | 'dirt' | 'desert';
/** a rough yard's mix, as the lot's lawn patch carries it (ground-protocol LotPatch.lawn.rough): the first look over `s` of the yard in soft
 *  patches of size `p` (blend-noise units, 1 = about 8 tiles), an optional second look over `s2` of it in finer patches, and `f`, how much of that
 *  share the front yard keeps (the back yard keeps all of it: the front is mostly mown) */
export interface RoughMix { k: RoughKind; s: number; p: number; k2?: RoughKind; s2?: number; p2?: number; f: number }

/** the share of the eligible lots that are rough, by the town's size: `start` of them in a town of nobody, falling in a straight line to `end` at
 *  `popEnd` residents and staying there (the owner's recommendation: about 40% at the start, about 10% by the town's 3,000 residents). `declined`
 *  scales it for a run-down lot (a poor lot is rougher), `cap` is the most any lot's chance can be */
export const ROUGH_YARDS = { start: 0.4, end: 0.1, popEnd: 3000, declined: 1.5, cap: 0.9 } as const;
/** the gear menu's knob scales the whole schedule: 0 none, 1 (the default) the schedule above, 2 twice it */
export const ROUGH_YARDS_DEFAULT = 1, ROUGH_YARDS_MAX = 2;
export const clampRoughYards = (v: number): number => (Number.isFinite(v) ? Math.min(ROUGH_YARDS_MAX, Math.max(0, v)) : ROUGH_YARDS_DEFAULT);

/** the share of built lots that wear a rough yard in a town of `pop` residents (knob: the gear menu's multiplier) */
export function roughShare(pop: number, knob: number = ROUGH_YARDS_DEFAULT): number {
  const t = Math.min(1, Math.max(0, (Number.isFinite(pop) ? pop : 0) / ROUGH_YARDS.popEnd));
  return Math.min(1, Math.max(0, (ROUGH_YARDS.start + (ROUGH_YARDS.end - ROUGH_YARDS.start) * t) * clampRoughYards(knob)));
}

/** the texture each look lays (the course's Fescue, the Dirt surface, the Waste area sand: painted-surfaces.json gives each its family) */
export const ROUGH_TEX: Readonly<Record<RoughKind, string>> = { fescue: 'golfFescue', dirt: 'dirt', desert: 'wasteSand' };
/** the textures a rough yard needs (the ground worker makes them ahead of the bake) */
export const roughTexes = (m: RoughMix): string[] => [ROUGH_TEX[m.k], ...(m.k2 ? [ROUGH_TEX[m.k2]] : [])];
/** the patches' softness (blend-noise units) */
export const ROUGH_SOFT = 0.2;

/** a 32-bit mix of numbers */
function h32(...v: number[]): number {
  let h = 0x811c9dc5;
  for (const x of v) h = Math.imul(h ^ (x >>> 0), 16777619);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return h >>> 0;
}
const unit = (h: number) => h / 4294967296;

/** the lot's roll against the share: below it the yard is rough. One number per lot, so as the share falls the yards above it are mown */
export const roughRoll = (seed: number): number => unit(h32(seed, 0x7b1d));

/** the chance a lot of this state is rough in a town of `pop` residents: a built one the share, a declined (poor) one more of it, an upgraded one
 *  never; only a home has a yard of this kind (a shop's or a works' is kept up) */
export function roughChance(home: boolean, state: PresetState | null, pop: number, knob: number = ROUGH_YARDS_DEFAULT): number {
  if (!home || state === null || state === 'upgraded') return 0;
  return Math.min(ROUGH_YARDS.cap, roughShare(pop, knob) * (state === 'declined' ? ROUGH_YARDS.declined : 1));
}

/** the rough yard of a house lot, or null for a mown one. seed: the lot's own seed (Town LotState.seed); home: the lot is a house; state: its look
 *  state (presets.ts stateOf: built, upgraded or declined; null before it is built); pop: the town's residents */
export function roughYard(seed: number, home: boolean, state: PresetState | null, pop: number, knob: number = ROUGH_YARDS_DEFAULT): RoughMix | null {
  if (!(roughRoll(seed) < roughChance(home, state, pop, knob))) return null;
  const a = unit(h32(seed, 0x51ed)), b = unit(h32(seed, 0x1f3b)), c = unit(h32(seed, 0x6a09)), d = unit(h32(seed, 0x2545)), e = unit(h32(seed, 0x9e37));
  // the main look: fescue the commonest (the town's first, untended yards), then bare dirt, then desert
  const k: RoughKind = a < 0.42 ? 'fescue' : a < 0.75 ? 'dirt' : 'desert';
  const out: RoughMix = { k, s: +(0.5 + 0.3 * b).toFixed(2), p: +(0.45 + 0.35 * c).toFixed(2), f: +(0.15 + 0.25 * d).toFixed(2) };
  // about half of them have a second look in finer patches over the first: dirt wears through fescue and desert, fescue tufts grow in dirt
  if (e < 0.55) { out.k2 = k === 'dirt' ? 'fescue' : 'dirt'; out.s2 = +(0.22 + 0.18 * unit(h32(seed, 0x3c6e))).toFixed(2); out.p2 = +(0.25 + 0.15 * unit(h32(seed, 0x85eb))).toFixed(2); }
  return out;
}

/** the weight of a rough yard's share at depth `b` of its lot (0 at the street edge, 1 at the back): the front keeps `f` of it, the back all of it,
 *  eased between about a third and three quarters of the way back (where the house usually ends) */
export function roughBack(f: number, b: number): number {
  const t = Math.min(1, Math.max(0, (b - 0.3) / 0.45)), s = t * t * (3 - 2 * t);
  return f + (1 - f) * s;
}

/** a signature of a rough yard (to tell when a lot's yard changed: '' for a mown one) */
export const roughSig = (m: RoughMix | null): string => (m ? `${m.k}${m.s}${m.k2 ?? ''}${m.s2 ?? ''}` : '');

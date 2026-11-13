// T334 (#960; the owner, 2026-11-04: "different flights based on fairway and rough"): how a ball sits, and what that does to the flight.
// - The finer lie (LieKind): the model's coarse Lie (tee, fairway, rough, fescue, bunker, green, water, out) says where a ball may be played from; the kind
//   splits the grass: fairway, first cut (the band of rough beside the fairway), rough, deep rough (the long grass), fescue. courseview.ts works the kind out
//   from the course's surface (kindAt); a view without it gets the coarse lie's own (kindOfLie).
// - What each kind does (LIE_FX): the carry, the spread, the share of the spin that gets on the ball, the run after landing, the chance of a flier (the ball
//   jumps out of the grass with no spin: it flies further and runs on), a wild streak (an extra chance of a bad strike) and how high the ball flies (a
//   bunker shot is high: the wind has more of it). The tee is the most distance; the fairway is clean with full spin.
// - The ground under the feet (slopeAt, slopeEffect): the course height field (T026) under the ball, along the shot (uphill: shorter and higher; downhill:
//   longer and it runs on) and across it (the ball above the feet pulls left, below the feet pushes right: for a right-handed golfer, as the shot model's
//   misses are, + right).
// All of it is plain numbers kept with the shot (conditions.ts ShotEnv), so a saved shot replays the same. Pure TS, no DOM.
import { TILE_M } from '../types';
import type { GolfSurface } from '../types';
import type { HeightAt } from './roll';
import type { Club, Lie, Pt } from './types';

/** how a ball sits: the coarse lies, and the grass split into the first cut, the rough, the deep rough and the fescue */
export type LieKind = 'tee' | 'fairway' | 'firstcut' | 'rough' | 'deep' | 'fescue' | 'bunker' | 'waste' | 'green' | 'water' | 'out';
/** every kind, in the order the panel lists them */
export const LIE_KINDS: readonly LieKind[] = ['tee', 'fairway', 'firstcut', 'rough', 'deep', 'fescue', 'bunker', 'waste', 'green', 'water', 'out'];

/** the kind a course surface plays as: the fringe and the fairway clean, the first cut, the rough, the long grass as deep rough, the fescue; the sand and the waste
 *  area as bunker; a path and other paint as rough (as courseview.ts's lie did) */
export function lieKindOfSurface(s: GolfSurface): LieKind {
  switch (s) {
    case 'green': return 'green';
    case 'tee': return 'tee';
    case 'fairway': case 'fringe': return 'fairway';
    case 'firstCut': return 'firstcut';
    case 'longGrass': return 'deep';
    case 'fescue': return 'fescue';
    case 'bunker': return 'bunker';
    case 'waste': return 'waste';   // (T455: the waste area plays a little shorter, not as sand does)
    case 'water': return 'water';
    default: return 'rough';
  }
}
/** the kind a coarse lie plays as when nothing finer is known (a view without kindAt, the field's old models): the fescue lie as fescue, the rough as rough */
export const kindOfLie = (l: Lie): LieKind => l;
/** whether a kind can be the finer reading of a coarse lie (the first cut is a fairway lie or a rough one, the deep rough a fescue lie or a rough one) */
export function kindFits(k: LieKind, l: Lie): boolean {
  if (k === l) return true;
  return (k === 'firstcut' && (l === 'fairway' || l === 'rough')) || (k === 'deep' && (l === 'rough' || l === 'fescue')) || (k === 'waste' && l === 'bunker');
}
/** the kind of the ball's lie `lie` at `at`: the view's finer reading where it fits the lie (kindAt), else the lie's own */
export function lieKindFor(kindAt: ((x: number, y: number) => LieKind) | undefined, at: Pt, lie: Lie): LieKind {
  const k = kindAt ? kindAt(at.x, at.y) : undefined;
  return k && kindFits(k, lie) ? k : kindOfLie(lie);
}

/** what a lie does to a shot played from it: the factor on the carry, on the spread (the direction and distance scatter), the share of the spin that gets on the
 *  ball, the factor on the run after landing, the chance of a flier (for a club that can: FLIER_CLUB), the extra chance of a bad strike, the wind multiplier of
 *  the shot's height, a name and a line for the panel */
export interface LieEffect { name: string; carry: number; spread: number; spin: number; run: number; flier: number; wild: number; high: number; note: string }
// T455 (the owner, 2026-11-13: "add distance penalties for your lie ... rough and sand affect how much club you can get on it"): the carry is the penalty. First cut about
// -3%, rough -13%, the long grass -22% (the fescue -25%), the waste area -7%, sand -10% for a full shot (CLUB_LIE has the sand and the grass per club: no driver or wood from
// sand, the long irons cut further, the wedges explode out short and high). The spread, spin, flier and wild numbers are T334's, kept.
export const LIE_FX: Readonly<Record<LieKind, LieEffect>> = {
  tee: { name: 'Tee', carry: 1.03, spread: 0.95, spin: 1, run: 1, flier: 0, wild: 0, high: 1, note: 'Teed up: the most distance and the cleanest strike' },
  fairway: { name: 'Fairway', carry: 1, spread: 1, spin: 1, run: 1, flier: 0, wild: 0, high: 1, note: 'A clean lie: full spin' },
  firstcut: { name: 'First cut', carry: 0.97, spread: 1.1, spin: 0.85, run: 1, flier: 0.04, wild: 0, high: 1, note: 'A little grass behind the ball: 3% shorter, a touch less spin' },
  rough: { name: 'Rough', carry: 0.87, spread: 1.3, spin: 0.45, run: 1.25, flier: 0.28, wild: 0.02, high: 1, note: 'About 13% shorter, less spin, more run, a wider miss; a flier now and then: club up' },
  deep: { name: 'Deep rough', carry: 0.78, spread: 1.55, spin: 0.25, run: 0.8, flier: 0.12, wild: 0.08, high: 1, note: 'The ball sits down: 22% shorter, and it twists off line: club up, or chip out' },
  fescue: { name: 'Fescue', carry: 0.75, spread: 1.9, spin: 0.2, run: 0.5, flier: 0, wild: 0.16, high: 1, note: 'Long grass: 25% shorter, and wild: club up' },
  bunker: { name: 'Bunker', carry: 0.9, spread: 1.4, spin: 0.6, run: 0, flier: 0, wild: 0.03, high: 1.3, note: 'Out of the sand: 10% shorter for a full shot (no driver or wood), high, it lands soft; a greenside shot is an explosion' },
  waste: { name: 'Waste area', carry: 0.93, spread: 1.2, spin: 0.7, run: 0.6, flier: 0, wild: 0.02, high: 1.15, note: 'Hard sand and stones: 7% shorter, a touch wider' },
  green: { name: 'Green', carry: 1, spread: 1, spin: 1, run: 1, flier: 0, wild: 0, high: 1, note: 'On the green' },
  water: { name: 'Water', carry: 1, spread: 1, spin: 0, run: 1, flier: 0, wild: 0, high: 1, note: 'In the water' },
  out: { name: 'Out of bounds', carry: 1, spread: 1, spin: 0, run: 1, flier: 0, wild: 0, high: 1, note: 'Out of bounds' },
};
/** T455: what a club adds to a lie's carry (a factor on LIE_FX[kind].carry; absent: 1). Sand: the woods cannot lift the ball out (the driver barely gets it out), the hybrid and long irons are cut further, the mid and
 *  short irons a little, the sand and lob wedges are the explosion clubs (a short, high shot). The long grass: a wood or a long iron cannot swing through it (the ball sits down), the wedges cut it. Fliers are separate (FLIER_CLUB) */
export const CLUB_LIE: Readonly<Partial<Record<LieKind, Partial<Record<Club, number>>>>> = {
  bunker: { driver: 0.35, wood3: 0.5, wood5: 0.62, hybrid: 0.78, iron4: 0.85, iron5: 0.9, iron6: 0.95, iron7: 1, iron8: 1, iron9: 1, pw: 1, gw: 1, sw: 0.85, lw: 0.78 },
  waste: { driver: 0.9, wood3: 0.93, wood5: 0.96 },
  rough: { driver: 0.95, wood3: 0.96, wood5: 0.98 },
  deep: { driver: 0.8, wood3: 0.85, wood5: 0.9, hybrid: 0.96, iron4: 0.94 },
  fescue: { driver: 0.8, wood3: 0.85, wood5: 0.9, hybrid: 0.96, iron4: 0.94 },
};
/** the factor on a club's carry for the lie it is played from (LIE_FX carry times CLUB_LIE): 1 from the fairway, 0.87 from the rough with an iron, 0.35 from the sand with a driver */
export const lieCarry = (k: LieKind, club: Club): number => LIE_FX[k].carry * (CLUB_LIE[k]?.[club] ?? 1);
/** how much of a lie's flier chance each club has (the driver and the woods cannot get a flier out of grass; the short irons and the wedges are the clubs that do) */
export const FLIER_CLUB: Readonly<Record<Club, number>> = { driver: 0.1, wood3: 0.3, wood5: 0.2, hybrid: 0.5, iron4: 0.6, iron5: 0.75, iron6: 0.9, iron7: 1, iron8: 1.1, iron9: 1.15, pw: 1.2, gw: 1.1, sw: 1, lw: 0.9, putter: 0 };
/** a flier: the ball jumps off the grass with no spin on it, so it flies this much further (a factor on the carry), runs on this much more, and is a little wilder */
export const FLIER = { carry: 1.12, run: 1.8, spread: 1.15 } as const;

/** the chance of a flier for a club from a kind of lie (0 where there is none) */
export const flierChance = (k: LieKind, club: Club): number => Math.min(1, LIE_FX[k].flier * FLIER_CLUB[club]);

/** the ground under a ball, along and across the shot: `up` the way the ground rises toward the target (m per m, + uphill), `across` how it rises to the right of
 *  the target line (m per m: + means the ball is above the golfer's feet, - below them) */
export interface Slope { up: number; across: number }
/** the height is read this far (tiles) either side of the ball: the stance's width */
export const SLOPE_REACH = 1.5;
/** the slope under a ball at `b` for a shot aimed at `aim` (null height: flat ground). A shot with no direction (aim on the ball) reads along +x */
export function slopeAt(height: HeightAt, b: Pt, aim: Pt): Slope {
  if (!height) return { up: 0, across: 0 };
  let ux = aim.x - b.x, uy = aim.y - b.y; const L = Math.hypot(ux, uy);
  if (L < 1e-6) { ux = 1; uy = 0; } else { ux /= L; uy /= L; }
  const k = SLOPE_REACH, d = 2 * k * TILE_M;
  const up = (height(b.x + ux * k, b.y + uy * k) - height(b.x - ux * k, b.y - uy * k)) / d;
  // the right of the shot, as the golfer faces it (the tile frame keeps the screen's handedness, y down): (-uy, ux); the ground higher there is the ball above the feet
  const across = (height(b.x - uy * k, b.y + ux * k) - height(b.x + uy * k, b.y - ux * k)) / d;
  return { up, across };
}
/** the slope's numbers: the sideways pull in degrees per m per m (the ball above the feet pulls left), at most MAX_DEG; the carry lost per m per m uphill (gained
 *  downhill) within CARRY_MAX; the run's change per m per m (uphill it runs less); the spread a cross slope adds per m per m, at most SPREAD_MAX; a slope under
 *  this (m per m) is not worth a word */
export const SLOPE_FX = { pullDeg: 70, maxDeg: 6, carry: 1.1, carryMax: 0.1, run: 4, runMin: 0.5, runMax: 1.5, spread: 6, spreadMax: 0.3, word: 0.01 } as const;
/** what a slope does to a shot (see SLOPE_FX): the factor on the carry, the miss in degrees (+ right), the factor on the run and on the spread */
export interface SlopeEffect { carry: number; deg: number; run: number; spread: number }
export const NO_SLOPE: Readonly<SlopeEffect> = { carry: 1, deg: 0, run: 1, spread: 1 };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export function slopeEffect(s: Slope | null | undefined): SlopeEffect {
  if (!s) return { ...NO_SLOPE };
  const F = SLOPE_FX;
  return {
    carry: 1 - clamp(F.carry * s.up, -F.carryMax, F.carryMax),
    deg: clamp(-F.pullDeg * s.across, -F.maxDeg, F.maxDeg),
    run: clamp(1 - F.run * s.up, F.runMin, F.runMax),
    spread: 1 + Math.min(F.spreadMax, F.spread * Math.abs(s.across)),
  };
}
/** the slope as the player reads it, one line each (empty on flat ground): "Ball above your feet: pulls left 2°", "Uphill lie: 3% shorter" */
export function slopeLines(s: Slope | null | undefined): string[] {
  if (!s) return [];
  const e = slopeEffect(s), out: string[] = [];
  if (Math.abs(s.across) >= SLOPE_FX.word) out.push(s.across > 0 ? `Ball above your feet: pulls left ${Math.abs(e.deg).toFixed(0)}°` : `Ball below your feet: pushes right ${Math.abs(e.deg).toFixed(0)}°`);
  if (Math.abs(s.up) >= SLOPE_FX.word) out.push(s.up > 0 ? `Uphill lie: ${Math.round((1 - e.carry) * 100)}% shorter, higher` : `Downhill lie: ${Math.round((e.carry - 1) * 100)}% longer, runs on`);
  return out;
}

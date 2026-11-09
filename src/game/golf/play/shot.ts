// The shot model (docs/GOLF-PLAY.md decision 5): the club and aim a golfer picks, how a full shot flies and lands from its lie, and the putt.
// Every golfer x hole draws from its own seeded stream (rng), so one golfer's play never shifts another's. Pure TS, no DOM, no Math.random.
import { TILE_M } from '../types';
import type { Club, CourseView, GameSkills, Landing, Lie, Pt, PlayHole } from './types';
import { SPIN, curveOf, spinRollM, type SpinEffect } from './spin';
import { FLIER, LIE_FX, flierChance, kindOfLie, slopeEffect } from './lies';
import { windEffect } from './wind';
import type { ShotEnv } from './conditions';
import { CLUB_BASE, PART_OF, applyMods, type ModCtx } from './mods';
import type { ShapeFx } from './shape';

/** the full carry in metres of each club at skill 1 (the putter has none); a skill s carries base * (0.75 + 0.25 s) */
export const CLUBS: Record<Club, number> = { driver: 250, wood3: 225, wood5: 208, hybrid: 202, iron4: 195, iron5: 182.5, iron6: 170, iron7: 157.5, iron8: 145, iron9: 132.5, pw: 120, gw: 105, sw: 90, lw: 75, putter: 0 };
/** T335: the clubs in bag order, the longest first (the driver, the woods, the hybrid, the irons, the wedges, the putter): how the shot panel and the bag card list them */
export const CLUB_ORDER: readonly Club[] = ['driver', 'wood3', 'wood5', 'hybrid', 'iron4', 'iron5', 'iron6', 'iron7', 'iron8', 'iron9', 'pw', 'gw', 'sw', 'lw', 'putter'];
/** the full-shot clubs, shortest first: the first whose carry reaches the wanted distance is picked */
const SHORT_TO_LONG: Club[] = ['sw', 'pw', 'iron8', 'iron6', 'iron4', 'wood3', 'driver'];
/** the share of a shot's carry that rolls on, by the lie it lands on (the fairway runs, the rough and the sand stop it) */
const ROLL: Record<Lie, number> = { tee: 0.08, fairway: 0.08, rough: 0.02, green: 0.03, fescue: 0.01, bunker: 0, water: 0, out: 0 };
/** T346 (#988): the run each club has after landing, a factor on that share by what the club launches and spins. The playtest: ROLL is a share of the carry by the surface alone, so a driver and a sand wedge rolled the same 8% on
 *  a fairway (an 80 m wedge 6 m, a 250 m drive only 20 m); real balls: a driver runs 8 to 12%, a wedge checks. A driver launches low (10.5 degrees, LOFT) with little backspin (SPIN_BACK_CAP 0.12) and runs on (x1.3: 10.4% of its carry
 *  on a fairway), a sand wedge launches high (54 degrees) with all the spin it can take and checks (x0.3: 2.4%). It falls with the loft and with the backspin the club can take across the whole bag: the original seven clubs are the issue's
 *  numbers (driver 1.3, 3-wood 1.2, 4-iron 1, 6-iron 0.85, 8-iron 0.65, pitching wedge 0.45, sand wedge 0.3), the clubs T335 added sit between their neighbours by loft and spin (a 5-wood between the 3-wood and the 4-iron, the hybrid
 *  below it, the 5-, 7- and 9-irons between the irons, the gap wedge between the pitching and sand wedges, the lob wedge below the sand wedge). Applied by hitShot in a shot with conditions only (HitMod.env) and not when `run` is false (an input
 *  saved before it, a field's day from before it): a shot without conditions rolls by the surface alone, as it always did. The putter's 1 is never read (a putt does not come through hitShot) */
export const CLUB_RUN: Readonly<Record<Club, number>> = { driver: 1.3, wood3: 1.2, wood5: 1.12, hybrid: 1.07, iron4: 1, iron5: 0.93, iron6: 0.85, iron7: 0.75, iron8: 0.65, iron9: 0.55, pw: 0.45, gw: 0.375, sw: 0.3, lw: 0.22, putter: 1 };
/** the carry factor by the lie the ball is played from (grass slows the ball) */
const CARRY_F: Record<Lie, number> = { tee: 1, fairway: 1, rough: 0.88, green: 1, fescue: 0.75, bunker: 0.7, water: 1, out: 1 };
/** the spread factor by the lie the ball is played from (the rough and the sand scatter it) */
const SPREAD_F: Record<Lie, number> = { tee: 1, fairway: 1, rough: 1.3, green: 1, fescue: 1.5, bunker: 1.4, water: 1, out: 1 };
/** the lies a ball can be played from (not water, not out of bounds) */
const PLAYABLE = new Set<Lie>(['tee', 'fairway', 'rough', 'fescue', 'bunker', 'green']);
/** a greenside bunker is a wedge shot, and a wedge from sand within this many metres of the aim carries exactly the distance */
const SAND_M = 40;
/** a mishit (the amateurs' topped and sliced shots): the chance per shot is base + skillK * (1 - skill)^2, it carries a share of the shot
 *  drawn from carry (uniform), and it is off line by a normal draw of deg degrees, on top of the normal spread */
const MISHIT = { base: 0.03, skillK: 0.25, carry: [0.35, 0.7], deg: 12 };

/** a 32-bit hash step: mixes v into h (a murmur-style finaliser), so nearby ids give unrelated streams */
function mix(h: number, v: number): number {
  h = Math.imul(h ^ (v >>> 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** a seeded stream of floats in [0,1) (mulberry32) for (seed, a, b): the 32-bit hash of the three, so each golfer x hole has its own */
export function rng(seed: number, a: number, b: number): () => number {
  let s = mix(mix(mix(0x9e3779b9, seed), a), b);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** a standard normal draw (Box-Muller from two uniform draws of r) */
export function gauss(r: () => number): number {
  const u = Math.max(1e-12, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** the full carry in metres of a club for a skill (0..1): a club amateur (skill 0.4) drives about 190 m */
export function carryM(club: Club, skill: number): number { return CLUBS[club] * (0.65 + 0.35 * skill); }

/** T241: a golfer's skill for the shot model: one number for every shot (a field golfer), or by part of the game (GameSkills: your profile) */
export type ShotSkill = number | GameSkills;
/** T241: the part of the game each club plays: the driver and the 3-wood drive, the irons and the pitching wedge are the irons, the sand wedge is the
 *  short game (chooseShot takes it only near the pin or in a greenside bunker: chips, pitches and splashes), the putter putts */
export const CLUB_PART: Readonly<Record<Club, 'driving' | 'irons' | 'short' | 'putting'>> = PART_OF;
/** T241: the skill (0..1) a shot with a club is played at: the golfer's one skill, or his part of the game's (CLUB_PART). A field golfer's is his skill,
 *  so the field plays exactly as before */
export function skillFor(s: ShotSkill, club: Club, ctx?: ModCtx): number { return typeof s === 'number' ? s : s.mods && s.mods.length ? applyMods(s, club, ctx).skill : s[CLUB_PART[club]]; }
/** T334 part 2: the club's full carry for a golfer in metres: its plain carry at his skill for it, times what his power and his mods make of it (mods.ts applyMods; a field golfer's one number: 1). T337: `ctx`, the moment of the shot (mods.ts ModCtx) */
export function carryFor(s: ShotSkill, club: Club, ctx?: ModCtx): number { return typeof s === 'number' ? carryM(club, s) : carryM(club, skillFor(s, club, ctx)) * applyMods(s, club, ctx).carry; }

/** the arc length (tiles) along a polyline to its point nearest p */
function nearestArc(line: Pt[], p: Pt): number {
  let best = Infinity, arc = 0, acc = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    const d = Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
    if (d < best) { best = d; arc = acc + L * t; }
    acc += L;
  }
  return arc;
}

/** the point at arc length s (tiles) along a polyline; past its end, the last point (the pin) */
function arcPoint(line: Pt[], s: number): Pt {
  let acc = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L > 0 && s <= acc + L) { const u = Math.max(0, (s - acc) / L); return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }; }
    acc += L;
  }
  const e = line[line.length - 1]; return { x: e.x, y: e.y };
}

/** the clubs of a bag the model may pick for a shot, shortest first by nominal carry (the lob wedge is the golfer's own choice, never the caddie's; the driver and the putter are picked by chooseShot's
 *  own rules) */
const LADDER: readonly Club[] = ['sw', 'gw', 'pw', 'iron9', 'iron8', 'iron7', 'iron6', 'iron5', 'iron4', 'hybrid', 'wood5', 'wood3'];

/** the club and aim for a shot from a lie. On the green: the putter at the pin. Near the pin (or in a greenside bunker): a wedge at the pin.
 *  Else the shortest club whose carry reaches the wanted distance (the driver only from a tee on a par 4 or 5), aimed along the hole's line.
 *  T335: a golfer with a bag (`GameSkills.clubs`, or `clubs` given) picks among the clubs in it, shortest first by the carry each has for him (his mods and stats in it); without one, the model's original seven,
 *  exactly as it did. The caddie never picks the lob wedge (a golfer reaches for it himself) */
export function chooseShot(lie: Lie, from: Pt, hole: PlayHole, skill: ShotSkill, teeShot: boolean, clubs?: readonly Club[]): { club: Club; aim: Pt } {
  const pin = hole.pin, D = Math.hypot(pin.x - from.x, pin.y - from.y) * TILE_M, bag = clubs ?? (typeof skill === 'number' ? undefined : skill.clubs);
  if (lie === 'green') return { club: 'putter', aim: { x: pin.x, y: pin.y } };
  // (T241: each club's carry at its own part of the game's skill: one number for a field golfer, as before)
  const sw = carryFor(skill, 'sw');
  if (D <= sw || (lie === 'bunker' && D < SAND_M)) return { club: D > sw ? 'pw' : 'sw', aim: { x: pin.x, y: pin.y } };
  const driver = !bag || bag.includes('driver'), longest: Club = teeShot && hole.par > 3 && driver ? 'driver' : 'wood3';
  const W = Math.min(D, carryFor(skill, longest)); // the wanted distance, metres
  // (a bag: each club's carry for him once, shortest first; the original seven: as before)
  const club = bag ? LADDER.filter(c => bag.includes(c)).map(c => ({ c, m: carryFor(skill, c) })).sort((a, b) => a.m - b.m).find(x => x.m >= W)?.c ?? longest : SHORT_TO_LONG.find(c => carryFor(skill, c) >= W) ?? longest;
  if (W >= D - 1) return { club, aim: { x: pin.x, y: pin.y } };
  return { club, aim: arcPoint(hole.line, nearestArc(hole.line, from) + W / TILE_M) };
}

/** T316: what the owner's swing meter changes in a hit (all absent: the model's shot exactly as before, the same draws): maxF lets the carry pass the
 *  club's full carry (an overswing, a key-spam boost), spread scales the distance and direction spread, angF the direction spread alone (the meter's
 *  miss takes over the direction), roll the roll (a hook runs on). T318: spin, the owner's spin (spin.ts): its side spin curves the flight and kicks the
 *  bounce, its topspin and backspin lengthen or shorten the roll (a spin back past the landing); no draws, so the stream is the same with it or without */
export interface HitMod { maxF?: number; spread?: number; angF?: number; roll?: number; spin?: SpinEffect;
  /** T334: the conditions the shot is struck in (conditions.ts: the wind, the lie's kind, the slope under the ball): the lie's carry, spread and run, a flier or a wild
   *  strike from the grass, the slope's pull and carry, the wind's drift and carry. Absent: none of it, the same draws and the same numbers as before T334. The wind and
   *  the slope take no draws; the flier takes one only from a lie that can give it */
  env?: ShotEnv;
  /** T346 (#988): false: the shot has its conditions but not the club's own run (CLUB_RUN): an input saved between T334 and T346 (OwnerInput.v below 3), a field's day from before it (Conditions.run false). Absent or true: with
   *  conditions the ball rolls on by its club's run. Without conditions (no env) there is no club run either way */
  run?: boolean;
  /** T334 part 2: the shot shape's effect (shape.ts shapeEffect: the curve, the carry, the run, the wind's multiplier, the scatter, the mishit chance); absent: none */
  shape?: ShapeFx;
  /** T337 (#963): the moment of the shot (mods.ts ModCtx: a tee shot, the driver off the deck, the rough, a bunker, the last hole, played as the caddie said): the mods for it apply; absent: only the mods for every shot, as before */
  ctx?: ModCtx }

/** a full shot or chip (not the putt) from a lie at an aim with a club: where the ball comes to rest and its lie. Water at the final point
 *  is a penalty and the ball drops where it last was out of the water (on the way back from the water to the stroke). Out of bounds is a
 *  penalty too, and the ball goes back to where it was struck from, the same lie (stroke and distance). T251: also where it landed and where
 *  its roll stopped, with their lies (landing: the bounce and the roll are drawn from them; the same draws and lies as before). T241: the skill is the
 *  club's part of the game's (skillFor) */
export function hitShot(r: () => number, sk: ShotSkill, lie: Lie, from: Pt, aim: Pt, club: Club, view: CourseView, mod?: HitMod): { to: Pt; lie: Lie; penalty: 0 | 1; holed: false; landing: Landing } {
  // (T334 part 2: the golfer's kit for the club: his skill for it after the mods, and the factors his stats and mods put on the carry, the scatter and the roll, and a mishit's chance; a plain skill: none)
  const kit = typeof sk === 'number' ? null : applyMods(sk, club, mod?.ctx), skill = typeof sk === 'number' ? sk : kit!.skill, dM = Math.hypot(aim.x - from.x, aim.y - from.y) * TILE_M, shape = mod?.shape;
  const sand = lie === 'bunker' && (club === 'sw' || club === 'lw') && dM < SAND_M; // (T335: the lob wedge splashes out as the sand wedge does)
  // T334: the conditions (absent: the lie's old tables below and none of the rest, the same draws and numbers as before): the lie's kind and its effect, the slope's
  // (T337: his slope factor: Slope Mode's hill costs half as much)
  const env = mod?.env, kind = env ? env.lie ?? kindOfLie(lie) : undefined, lx = kind ? LIE_FX[kind] : undefined, slope = env ? slopeEffect(kit && kit.slope !== 1 && env.slope ? { up: env.slope.up * kit.slope, across: env.slope.across * kit.slope } : env.slope) : undefined;
  // a mishit carries a share of the shot and is also off line (the amateurs' topped and sliced shots); T334: a wild lie (the fescue) adds to the chance
  const mis = r() < MISHIT.base + MISHIT.skillK * (1 - skill) ** 2 + (lx ? lx.wild : 0) + (kit ? kit.mishit : 0) + (shape ? shape.mishit : 0), mf = mis ? MISHIT.carry[0] + (MISHIT.carry[1] - MISHIT.carry[0]) * r() : 1;
  // T334: a flier: from the grass the ball may jump out with no spin on it (one draw, only from a lie and a club that can give it)
  const fp = kind ? flierChance(kind, club) : 0, flier = fp > 0 && r() < fp;
  let carry = (sand ? dM : Math.min(dM, carryM(club, skill) * (kit ? kit.carry : 1) * (mod?.maxF ?? 1)) * (lx ? lx.carry : CARRY_F[lie])) * mf;
  if (lx && slope) carry *= slope.carry * (flier ? FLIER.carry : 1);
  if (shape) carry *= shape.carry;
  const spread = (sand ? 1.6 : lx ? lx.spread : SPREAD_F[lie]) * (mod?.spread ?? 1) * (lx && slope ? slope.spread * (flier ? FLIER.spread : 1) : 1) * (kit ? kit.spread : 1) * (shape ? shape.spread : 1);
  const sD = (0.03 + 0.07 * (1 - skill)) * carry * spread, sA = (1.5 + 5 * (1 - skill)) * spread * (mod?.angF ?? 1) * Math.PI / 180;
  const sp = mod?.spin && mod.spin.amount > 0 && !flier ? mod.spin : null; // (T318: the curve and the roll below; no draws. T334: a flier has no spin)
  const ang = Math.atan2(aim.y - from.y, aim.x - from.x) + gauss(r) * sA + (mis ? gauss(r) * MISHIT.deg * Math.PI / 180 : 0) + (sp ? curveOf(sp, carry) : 0) + (slope ? slope.deg * Math.PI / 180 : 0) + (shape ? shape.curve : 0);
  let flown = Math.max(0, carry + gauss(r) * sD);
  const cs = Math.cos(ang), sn = Math.sin(ang);
  // T334: the wind along the shot's line shortens or lengthens the carry, across it drifts the ball (a high flight, a bunker shot, feels more of it)
  const wf = env?.wind ? windEffect(env.wind, club, cs, sn, (lx ? lx.high : 1) * (shape ? shape.wind : 1) * (kit ? kit.wind : 1)) : null; // (T337: his wind factor: the Wind Whisperer's half)
  let drift = 0;
  if (wf) { flown *= wf.carry; drift = wf.drift * flown; }
  const land = drift ? { x: from.x + (cs * flown - sn * drift) / TILE_M, y: from.y + (sn * flown + cs * drift) / TILE_M } : { x: from.x + cs * flown / TILE_M, y: from.y + sn * flown / TILE_M };
  const landLie = view.lieAt(land.x, land.y);
  // T346: the club's own run (CLUB_RUN): with conditions (and not an old input's: mod.run false) the ball rolls on by what its club launches and spins; the bag's T335 character (CLUB_BASE.roll, in kit.roll) is replaced by it
  const byClub = !!env && mod?.run !== false, baseRun = CLUB_BASE[club]?.roll ?? 1;
  let roll = flown * ROLL[landLie] * (mod?.roll ?? 1) * (lx && slope ? lx.run * slope.run * (flier ? FLIER.run : 1) : 1) * (kit ? (byClub ? kit.roll / baseRun : kit.roll) : 1) * (byClub ? CLUB_RUN[club] : 1) * (shape ? shape.run : 1) / TILE_M, rc = cs, rs = sn, spinM: number | undefined, check: Pt | undefined;
  if (sp && landLie !== 'water' && landLie !== 'bunker') {
    // T318: the spin on the first bounce: topspin runs on, backspin checks (and spins back past the landing), side spin kicks the way of the spin
    const m0 = roll * TILE_M, m = spinRollM(sp, m0, landLie), k = sp.side * SPIN.kickDeg * Math.PI / 180, c = Math.cos(k), q = Math.sin(k);
    rc = cs * c - sn * q; rs = cs * q + sn * c; roll = m / TILE_M; spinM = m - m0;
    if (m < 0) { const f = Math.min(SPIN.checkM, SPIN.checkK * flown) / TILE_M; check = { x: land.x + cs * f, y: land.y + sn * f }; }
  }
  const end = { x: land.x + rc * roll, y: land.y + rs * roll }, endLie = view.lieAt(end.x, end.y), landing: Landing = { at: land, lie: landLie, rest: end, restLie: endLie };
  if (spinM !== undefined) { landing.spin = spinM; if (check) landing.check = check; }
  if (endLie === 'out') return { to: { x: from.x, y: from.y }, lie, penalty: 1, holed: false, landing };
  if (endLie === 'water') {
    // walk back from the water in half-tile steps: the first point that is not water is where the ball drops
    const L = Math.hypot(end.x - from.x, end.y - from.y);
    let drop = { x: from.x, y: from.y }, dl = lie;
    for (let d = L - 0.5; d > 0; d -= 0.5) {
      const p = { x: from.x + (end.x - from.x) * d / L, y: from.y + (end.y - from.y) * d / L }, l = view.lieAt(p.x, p.y);
      if (l !== 'water') { drop = p; dl = l; break; }
    }
    return { to: drop, lie: PLAYABLE.has(dl) ? dl : 'rough', penalty: 1, holed: false, landing };
  }
  return { to: end, lie: endLie, penalty: 0, holed: false, landing };
}

/** T334 (#960): the putting model's second version (the play pass's playtest: a 0.5 m putt was missed one time in four, and half the holes took three putts or more): the make
 *  chance falls from 0.6 m (a tap-in is nearly certain: 0.3 m before), the aim may be off the line by the cup's angle at the distance (cupM, the cup and the ball's radius: 5 degrees
 *  at a metre, held between minDeg and maxDeg) where it was a flat 3 degrees, and the power's error counts in metres past or short of the hole (windowM: a ball 0.9 m out of its
 *  pace has no chance) where it was 25% of the putt, whatever its length. A shot played under it says so (live.ts OwnerInput.v 2); a saved input without it is version 1, as before */
export const PUTT_V2 = { offsetM: 0.6, cupM: 0.09, minDeg: 1.5, maxDeg: 8, windowM: 0.9 } as const;

/** a putt from distM metres: the make chance falls with distance and rises with skill; a miss leaves the ball at least 0.3 m from the hole,
 *  at a share of the putt that is tighter for better putters. T334: v2, the model's second version (PUTT_V2's make chance) */
export function putt(r: () => number, skill: number, distM: number, factor = 1, v2 = false): { holed: boolean; leaveM: number } {
  const p = Math.min(0.99, Math.exp(-Math.max(0, distM - (v2 ? PUTT_V2.offsetM : 0.3)) / (2.0 + 1.5 * skill)));
  if (r() < p * factor) return { holed: true, leaveM: 0 };
  return { holed: false, leaveM: Math.max(0.3, distM * (0.05 + (0.07 + 0.15 * (1 - skill)) * r())) };
}

/** T335 (#961, the putter shafts): luck, a putter's variance. `luck` (mods.ts ClubKit.luck, 0 and up) is how much of it a golfer's putter has: a putt that missed still drops with probability
 *  luck * LUCK.drop at the hole's edge, falling off with the distance (e^(-distM / fade): a lucky bounce on a short putt, hardly ever on a long one), and a putt that dropped lips out with probability
 *  luck * LUCK.lip (and is left a tap-in). One draw, taken only when there is luck: a golfer without it takes none, so his stream and every putt of it are exactly what they were */
export const LUCK = { drop: 0.16, fade: 6, lip: 0.07, tapInM: 0.3 } as const;
export function luckyPutt(r: () => number, k: { holed: boolean; leaveM: number }, distM: number, luck: number): { holed: boolean; leaveM: number } {
  if (!(luck > 0)) return k;
  const a = r();
  if (k.holed) return a < luck * LUCK.lip ? { holed: false, leaveM: LUCK.tapInM } : k;
  return a < luck * LUCK.drop * Math.exp(-Math.max(0, distM) / LUCK.fade) ? { holed: true, leaveM: 0 } : k;
}

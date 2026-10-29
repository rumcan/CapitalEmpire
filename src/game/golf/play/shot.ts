// The shot model (docs/GOLF-PLAY.md decision 5): the club and aim a golfer picks, how a full shot flies and lands from its lie, and the putt.
// Every golfer x hole draws from its own seeded stream (rng), so one golfer's play never shifts another's. Pure TS, no DOM, no Math.random.
import { TILE_M } from '../types';
import type { Club, CourseView, GameSkills, Landing, Lie, Pt, PlayHole } from './types';

/** the full carry in metres of each club at skill 1 (the putter has none); a skill s carries base * (0.75 + 0.25 s) */
export const CLUBS: Record<Club, number> = { driver: 250, wood3: 225, iron4: 195, iron6: 170, iron8: 145, pw: 120, sw: 90, putter: 0 };
/** the full-shot clubs, shortest first: the first whose carry reaches the wanted distance is picked */
const SHORT_TO_LONG: Club[] = ['sw', 'pw', 'iron8', 'iron6', 'iron4', 'wood3', 'driver'];
/** the share of a shot's carry that rolls on, by the lie it lands on (the fairway runs, the rough and the sand stop it) */
const ROLL: Record<Lie, number> = { tee: 0.08, fairway: 0.08, rough: 0.02, green: 0.03, fescue: 0.01, bunker: 0, water: 0, out: 0 };
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
export const CLUB_PART: Readonly<Record<Club, keyof GameSkills>> = { driver: 'driving', wood3: 'driving', iron4: 'irons', iron6: 'irons', iron8: 'irons', pw: 'irons', sw: 'short', putter: 'putting' };
/** T241: the skill (0..1) a shot with a club is played at: the golfer's one skill, or his part of the game's (CLUB_PART). A field golfer's is his skill,
 *  so the field plays exactly as before */
export function skillFor(s: ShotSkill, club: Club): number { return typeof s === 'number' ? s : s[CLUB_PART[club]]; }

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

/** the club and aim for a shot from a lie. On the green: the putter at the pin. Near the pin (or in a greenside bunker): a wedge at the pin.
 *  Else the shortest club whose carry reaches the wanted distance (the driver only from a tee on a par 4 or 5), aimed along the hole's line */
export function chooseShot(lie: Lie, from: Pt, hole: PlayHole, skill: ShotSkill, teeShot: boolean): { club: Club; aim: Pt } {
  const pin = hole.pin, D = Math.hypot(pin.x - from.x, pin.y - from.y) * TILE_M;
  if (lie === 'green') return { club: 'putter', aim: { x: pin.x, y: pin.y } };
  // (T241: each club's carry at its own part of the game's skill: one number for a field golfer, as before)
  const sw = carryM('sw', skillFor(skill, 'sw'));
  if (D <= sw || (lie === 'bunker' && D < SAND_M)) return { club: D > sw ? 'pw' : 'sw', aim: { x: pin.x, y: pin.y } };
  const longest: Club = teeShot && hole.par > 3 ? 'driver' : 'wood3';
  const W = Math.min(D, carryM(longest, skillFor(skill, longest))); // the wanted distance, metres
  const club = SHORT_TO_LONG.find(c => carryM(c, skillFor(skill, c)) >= W) ?? longest;
  if (W >= D - 1) return { club, aim: { x: pin.x, y: pin.y } };
  return { club, aim: arcPoint(hole.line, nearestArc(hole.line, from) + W / TILE_M) };
}

/** a full shot or chip (not the putt) from a lie at an aim with a club: where the ball comes to rest and its lie. Water at the final point
 *  is a penalty and the ball drops where it last was out of the water (on the way back from the water to the stroke). Out of bounds is a
 *  penalty too, and the ball goes back to where it was struck from, the same lie (stroke and distance). T251: also where it landed and where
 *  its roll stopped, with their lies (landing: the bounce and the roll are drawn from them; the same draws and lies as before). T241: the skill is the
 *  club's part of the game's (skillFor) */
export function hitShot(r: () => number, sk: ShotSkill, lie: Lie, from: Pt, aim: Pt, club: Club, view: CourseView): { to: Pt; lie: Lie; penalty: 0 | 1; holed: false; landing: Landing } {
  const skill = skillFor(sk, club), dM = Math.hypot(aim.x - from.x, aim.y - from.y) * TILE_M;
  const sand = lie === 'bunker' && club === 'sw' && dM < SAND_M;
  // a mishit carries a share of the shot and is also off line (the amateurs' topped and sliced shots)
  const mis = r() < MISHIT.base + MISHIT.skillK * (1 - skill) ** 2, mf = mis ? MISHIT.carry[0] + (MISHIT.carry[1] - MISHIT.carry[0]) * r() : 1;
  const carry = (sand ? dM : Math.min(dM, carryM(club, skill)) * CARRY_F[lie]) * mf;
  const spread = sand ? 1.6 : SPREAD_F[lie];
  const sD = (0.03 + 0.07 * (1 - skill)) * carry * spread, sA = (1.5 + 5 * (1 - skill)) * spread * Math.PI / 180;
  const ang = Math.atan2(aim.y - from.y, aim.x - from.x) + gauss(r) * sA + (mis ? gauss(r) * MISHIT.deg * Math.PI / 180 : 0);
  const flown = Math.max(0, carry + gauss(r) * sD), cs = Math.cos(ang), sn = Math.sin(ang);
  const land = { x: from.x + cs * flown / TILE_M, y: from.y + sn * flown / TILE_M };
  const landLie = view.lieAt(land.x, land.y), roll = flown * ROLL[landLie] / TILE_M;
  const end = { x: land.x + cs * roll, y: land.y + sn * roll }, endLie = view.lieAt(end.x, end.y), landing: Landing = { at: land, lie: landLie, rest: end, restLie: endLie };
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

/** a putt from distM metres: the make chance falls with distance and rises with skill; a miss leaves the ball at least 0.3 m from the hole,
 *  at a share of the putt that is tighter for better putters */
export function putt(r: () => number, skill: number, distM: number, factor = 1): { holed: boolean; leaveM: number } {
  const p = Math.min(0.99, Math.exp(-Math.max(0, distM - 0.3) / (2.0 + 1.5 * skill)));
  if (r() < p * factor) return { holed: true, leaveM: 0 };
  return { holed: false, leaveM: Math.max(0.3, distM * (0.05 + (0.07 + 0.15 * (1 - skill)) * r())) };
}

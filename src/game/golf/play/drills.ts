// J6 (#1223; the owner, 2026-11-13: "make the guy be able to hit balls on the range and at his chipping green, the would be cool to unlock skills from
// challanges liek shot shaping and put previews etc. that would be great for his player handicap and skills"): the practice drills played from behind the
// golfer (play/practice3p.ts). Each drill is played from one spot (a range mat, or at the chipping green: the chip stand, a putt out on the green, the
// practice bunker), judged shot by shot from what the one model decided, and the first time it is done it pays out: a few skill points (so the handicap,
// which is the skills' own, comes down a little: golf/player.ts handicapOf) and, for three of them, a shot opened on the course (play/unlocks.ts earned:
// the curve, the flight, the putt read). A drill pays once; it can be played again for practice, with nothing more to win. Pure TS, no DOM.
import type { Club, Lie, Pt } from './types';
import type { ShotShape } from './shape';
import type { SkillId } from '../player';
import { TILE_M } from '../types';

export type DrillId = 'distance' | 'shaping' | 'flight' | 'junk' | 'updown' | 'putting' | 'bunker';
export const DRILL_IDS: readonly DrillId[] = ['distance', 'shaping', 'flight', 'junk', 'updown', 'putting', 'bunker'];
/** where a drill is played from: a range mat, the chip stand beside the chipping green, a putt out on that green, the practice bunker */
export type DrillSpot = 'range' | 'chip' | 'putt' | 'sand';
/** what a drill opens on the course (unlocks.ts): the curve (draw and fade), the flight (high and low), the putt read (the putting line's preview) */
export type DrillOpen = 'curve' | 'flight' | 'read';

/** a drill: its name, its spot, the goal in words, how many hits it needs, the range green it is played at (its distance from the mats, m; range drills
 *  only), the most a hit may lie from the target (m: the flag for distance and up-and-down, the green's edge for shaping and flight), and its reward */
export interface Drill { id: DrillId; name: string; spot: DrillSpot; goal: string; need: number; greenM?: number; withinM?: number;
  reward: { gains: Partial<Record<SkillId, number>>; opens?: DrillOpen; text: string } }

/** the drills, in the panel's order. The rewards (skill points, 0..100) take about 0.3 off a starting golfer's handicap each, about 1.8 in all */
export const DRILLS: Readonly<Record<DrillId, Drill>> = {
  distance: { id: 'distance', name: 'Distance control', spot: 'range', goal: 'Stop 5 balls within 10 m of the 100 m flag', need: 5, greenM: 100, withinM: 10,
    reward: { gains: { irons: 4, accuracy: 4 }, text: 'Irons +4, Accuracy +4' } },
  shaping: { id: 'shaping', name: 'Shot shaping', spot: 'range', goal: 'Land a draw and a fade on the 150 m green (Z picks the curve)', need: 2, greenM: 150, withinM: 3,
    reward: { gains: { accuracy: 3 }, opens: 'curve', text: 'Draw and fade on the course, Accuracy +3' } },
  flight: { id: 'flight', name: 'Flight', spot: 'range', goal: 'Land a high and a low ball on a target green (X picks the flight)', need: 2, withinM: 3,
    reward: { gains: { touch: 3 }, opens: 'flight', text: 'High and low on the course, Touch +3' } },
  junk: { id: 'junk', name: 'Junk targets', spot: 'range', goal: 'Hit three of the junk piles on the outfield (a ball that lands on one, or stops by it)', need: 3,
    reward: { gains: { accuracy: 2, power: 2 }, text: 'Accuracy +2, Power +2' } },
  updown: { id: 'updown', name: 'Up and down', spot: 'chip', goal: 'Chip to within 2 m of the pin, 3 times', need: 3, withinM: 2,
    reward: { gains: { short: 5, touch: 2 }, text: 'Wedges +5, Touch +2' } },
  putting: { id: 'putting', name: 'Putting', spot: 'putt', goal: 'Hole 3 putts from 3 to 6 m', need: 3,
    reward: { gains: { putting: 5 }, opens: 'read', text: 'The putt read on the greens, Putting +5' } },
  bunker: { id: 'bunker', name: 'Bunker', spot: 'sand', goal: 'Get 3 balls out of the bunker onto the green', need: 3,
    reward: { gains: { short: 4 }, text: 'Wedges +4' } },
};

/** the drills as saved with the profile (golf/player.ts PlayerProfile.drills): each drill's hits so far (absent: 0), the marks of a drill that needs one of
 *  each kind (shaping: 'draw', 'fade'; flight: 'high', 'low'), and the drills done (paid out), in the order they were done */
export interface DrillsSave { v: 1; hits: Partial<Record<DrillId, number>>; marks: Partial<Record<DrillId, string[]>>; done: DrillId[] }
export const emptyDrills = (): DrillsSave => ({ v: 1, hits: {}, marks: {}, done: [] });

const isDrill = (v: unknown): v is DrillId => typeof v === 'string' && (DRILL_IDS as readonly string[]).includes(v);
const MARKS: Readonly<Partial<Record<DrillId, readonly string[]>>> = { shaping: ['draw', 'fade'], flight: ['high', 'low'] };

/** a saved drills record, well formed; undefined when there is none (an old save: no drills played) */
export function normalizeDrills(x: unknown): DrillsSave | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const o = x as Partial<DrillsSave>, out = emptyDrills();
  if (o.hits && typeof o.hits === 'object') for (const id of DRILL_IDS) {
    const v = (o.hits as Record<string, unknown>)[id];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out.hits[id] = Math.min(DRILLS[id].need, Math.floor(v));
  }
  if (o.marks && typeof o.marks === 'object') for (const id of DRILL_IDS) {
    const ok = MARKS[id], v = (o.marks as Record<string, unknown>)[id];
    if (ok && Array.isArray(v)) { const m = ok.filter(k => v.includes(k)); if (m.length) out.marks[id] = m; }
  }
  if (Array.isArray(o.done)) for (const id of o.done) if (isDrill(id) && !out.done.includes(id)) out.done.push(id);
  return out;
}

/** what the drills done open on the course */
export function drillOpens(done: readonly DrillId[] | null | undefined): Set<DrillOpen> {
  const s = new Set<DrillOpen>();
  for (const id of done ?? []) { const o = DRILLS[id]?.reward.opens; if (o) s.add(o); }
  return s;
}

/** a range target green (tiles: its centre and radius) and its distance from the mats (m) */
export interface DrillGreen { x: number; y: number; r: number; distM: number }
/** J6b (J7's junk, #1225): a junk pile on the range as a target: where it lies (tiles), how far a ball may land from its middle and count (m), its name and its
 *  distance from the mats (m) */
export interface DrillJunk { x: number; y: number; r: number; name: string; distM: number }
/** a junk pile's reach as a target (m): a car, a pickup or a trailer is big, the rest small */
export const junkReach = (id: string): number => (/car|pickup|trailer/.test(id) ? 4 : 2.5);
/** the junk pile a ball hit (it came down within the pile's reach, or stopped within it), else null */
export function junkHit(junk: readonly DrillJunk[] | undefined, landing: Pt | null, rest: Pt): DrillJunk | null {
  for (const j of junk ?? []) if ((landing && dM(landing, j) <= j.r + 1) || dM(rest, j) <= j.r) return j;
  return null;
}
/** one practice shot as a drill reads it: the spot it was played from, its club, the shape the model played (null: straight), where it landed (tiles; null: a
 *  putt) and its lie there, where it stopped and its lie there, whether it was holed, the pin (tiles), the range's target greens, and the lie it was struck from */
export interface DrillShot { spot: DrillSpot; club: Club; shape: ShotShape | null; landing: Pt | null; landLie: Lie | null; rest: Pt; restLie: Lie; holed: boolean;
  pin: Pt; greens: readonly DrillGreen[]; from: Lie;
  /** J6b: the junk on the range (absent: none) */
  junk?: readonly DrillJunk[] }
/** a shot's judgement for a drill: whether it counts (hit), the mark it makes (shaping and flight), and the line the panel shows for it */
export interface DrillCall { hit: boolean; mark?: string; note: string }

const dM = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y) * TILE_M;
const m1 = (v: number): string => `${v < 10 ? v.toFixed(1) : Math.round(v)} m`;
/** the range green nearest distM from the mats (null: none) */
export function greenAt(greens: readonly DrillGreen[], distM: number): DrillGreen | null {
  let best: DrillGreen | null = null;
  for (const g of greens) if (!best || Math.abs(g.distM - distM) < Math.abs(best.distM - distM)) best = g;
  return best;
}
/** how far p lies outside green g (m; 0 inside it) */
const offGreen = (g: DrillGreen, p: Pt): number => Math.max(0, dM(p, g) - g.r * TILE_M);
/** the range green a ball came down on or stopped on, within slack m of its edge (the landing first); null: none */
function onAGreen(greens: readonly DrillGreen[], s: DrillShot, slack: number): DrillGreen | null {
  for (const p of [s.landing, s.rest]) if (p) for (const g of greens) if (offGreen(g, p) <= slack) return g;
  return null;
}

/** judges one shot for drill `id` (the shot is the model's: its landing, rest and shape). A shot from another spot never counts */
export function judgeDrill(id: DrillId, s: DrillShot): DrillCall {
  const d = DRILLS[id];
  if (d.spot !== s.spot) return { hit: false, note: `${d.name} is played from ${spotName(d.spot)}` };
  switch (id) {
    case 'distance': {
      const g = greenAt(s.greens, d.greenM!), far = g ? dM(s.rest, g) : Infinity;
      return g ? { hit: far <= d.withinM!, note: `${m1(far)} from the ${g.distM} m flag` } : { hit: false, note: 'No 100 m green on this range' };
    }
    case 'shaping': {
      const g = greenAt(s.greens, d.greenM!); if (!g) return { hit: false, note: 'No 150 m green on this range' };
      const curve = s.shape?.curve ?? 0, on = [s.landing, s.rest].some(p => p && offGreen(g, p) <= d.withinM!);
      if (!curve) return { hit: false, note: on ? 'On the green, but straight: pick a draw or a fade (Z)' : 'Pick a draw or a fade (Z), then land it on the 150 m green' };
      const mark = curve < 0 ? 'draw' : 'fade';
      return on ? { hit: true, mark, note: `A ${mark} onto the ${g.distM} m green` } : { hit: false, note: `The ${mark} missed the ${g.distM} m green by ${m1(Math.min(...[s.landing, s.rest].filter((p): p is Pt => !!p).map(p => offGreen(g, p))))}` };
    }
    case 'flight': {
      const fl = s.shape?.flight ?? 0, g = onAGreen(s.greens, s, d.withinM!);
      if (!fl) return { hit: false, note: g ? `On the ${g.distM} m green, but a normal flight: pick high or low (X)` : 'Pick a high or a low flight (X), then land it on a green' };
      const mark = fl > 0 ? 'high' : 'low';
      return g ? { hit: true, mark, note: `A ${mark} ball onto the ${g.distM} m green` } : { hit: false, note: `The ${mark} ball missed the greens` };
    }
    case 'junk': {
      const j = junkHit(s.junk, s.landing, s.rest);
      if (j) return { hit: true, note: `Hit the ${j.name.toLowerCase()}!` };
      let best: DrillJunk | null = null, bd = Infinity; for (const q of s.junk ?? []) { const d = dM(s.rest, q); if (d < bd) { bd = d; best = q; } }
      return { hit: false, note: best ? `Missed: ${m1(bd)} from the ${best.name.toLowerCase()}` : 'No junk on this range' };
    }
    case 'updown': {
      const far = s.holed ? 0 : dM(s.rest, s.pin);
      return { hit: far <= d.withinM!, note: s.holed ? 'Chipped in!' : `${m1(far)} from the pin` };
    }
    case 'putting': return { hit: s.holed, note: s.holed ? 'Holed' : `Missed: ${m1(dM(s.rest, s.pin))} from the cup` };
    case 'bunker': {
      const out = s.holed || s.restLie === 'green';
      return { hit: out, note: s.holed ? 'Holed from the sand!' : out ? `Out and on the green, ${m1(dM(s.rest, s.pin))} from the pin` : s.restLie === 'bunker' ? 'Still in the bunker' : 'Out, but off the green' };
    }
  }
}

/** a drill's progress: its hits (shaping and flight: the marks made) and what it needs */
export function drillProgress(sv: DrillsSave | null | undefined, id: DrillId): { got: number; need: number; done: boolean } {
  const need = DRILLS[id].need, done = !!sv?.done.includes(id), got = MARKS[id] ? (sv?.marks[id]?.length ?? 0) : (sv?.hits[id] ?? 0);
  return { got: done ? need : Math.min(need, got), need, done };
}

/** a judged shot written into the drills (a new save; the old one is kept as it was): a hit adds one (a mark: once each), and the drill is done when it has
 *  all it needs; `paid` is the drill that has just been done (its reward is the caller's to give), else null. A drill already done is not changed */
export function recordDrill(sv: DrillsSave | null | undefined, id: DrillId, call: DrillCall): { save: DrillsSave; paid: DrillId | null } {
  const s0 = sv ?? emptyDrills(), save: DrillsSave = { v: 1, hits: { ...s0.hits }, marks: { ...s0.marks }, done: s0.done.slice() };
  if (save.done.includes(id) || !call.hit) return { save, paid: null };
  if (MARKS[id]) {
    const m = save.marks[id] ?? [];
    if (call.mark && MARKS[id]!.includes(call.mark) && !m.includes(call.mark)) save.marks[id] = [...m, call.mark];
  } else save.hits[id] = Math.min(DRILLS[id].need, (save.hits[id] ?? 0) + 1);
  const p = drillProgress(save, id);
  if (p.got >= p.need) { save.done.push(id); delete save.hits[id]; delete save.marks[id]; return { save, paid: id }; }
  return { save, paid: null };
}

/** a drill's reward on the skills (0..100 each, never past 100): a new skills record */
export function drillGains<S extends Partial<Record<SkillId, number>>>(skills: S, id: DrillId): S {
  const out = { ...skills } as Record<string, number>;
  for (const [k, g] of Object.entries(DRILLS[id].reward.gains)) out[k] = Math.min(100, Math.round(((out[k] ?? 0) + (g ?? 0)) * 100) / 100);
  return out as S;
}

/** a spot in words: "a range mat", "the chipping green" ... */
export function spotName(s: DrillSpot): string {
  return s === 'range' ? 'the range mats' : s === 'chip' ? 'the chip stand' : s === 'putt' ? 'the chipping green' : 'the practice bunker';
}
/** the drills a session at a place can play: the range's three at the range, the short game's three at the chipping green */
export function drillsAt(place: 'range' | 'short'): DrillId[] {
  return DRILL_IDS.filter(id => (DRILLS[id].spot === 'range') === (place === 'range'));
}

// T317 (#903): your own round, played by hand (the owner, 2026-11-03: "walk to a cart, drive it, drive to first tee and Tee off. you should be asked
// if you are playing all the holes and it should keep score ... then have to walk/drive to his ball, add a button to jump to ball after the shot ...
// it can snap to the hitting position when close"). Pure TS, no DOM, no engine.
// - The holes: all of them, the front 9, the back 9, or the ones you pick, from the course's real holes (the everyday course: each hole once).
// - The round: the ball (where it lies and its lie), the hole you are on, the scorecard (strokes, par, putts and penalties per hole), and whether the
//   hole is holed (waiting for "Next hole") or the round is over. Saved whole with your profile (golf/player.ts PlayerProfile.round), so a reload
//   comes back at your ball; nothing is replayed.
// - A shot: the same shot model as the tournament's owner (live.ts shotOutcome: the 3-click meter's power, miss and spread, the lies, roll, water and
//   out of bounds), from a stream of its own per hole and stroke (a reload plays the same shot again).
// - Your round moves in real time: you walk or drive to your ball (golf/you.ts) whatever the sim's speed; it is not on the day's playback, so the day's
//   groups do not wait for you nor you for them (T320 brings the watching speed; pace with the field is a follow-up).
// - Your golf cart: drives at CART_TILES on anything but the greens, the bunkers and water (the engine's raster keeps it out of the buildings).
import { TILE_M } from '../types';
import { holeFrom } from './courseview';
import { shotOutcome, POWER, type OwnerInput, type OwnerTurn } from './live';
import { carryM, chooseShot, rng, skillFor, type ShotSkill } from './shot';
import type { CourseView, Lie, PlayHole, Pt, Shot } from './types';
import type { TeeKind } from '../types';

/** within this many tiles of the ball (8 m) you snap to the address: you stand at it, facing the aim, and the shot opens */
export const SNAP_TILES = 4;
/** the address: you stand this many tiles behind the ball on the line to the aim (the golfer art's feet at the ball) */
export const ADDRESS_BACK = 0.35;
/** a hole is picked up at par plus this many strokes (it scores that) */
export const PICK_UP_OVER = 5;
/** your golf cart's pace (tiles per second): 2.4 is 4.8 m/s, 17 km/h (a run, Shift, is RUN_K faster: 24 km/h) */
export const CART_TILES = 2.4;
/** within this many tiles of your cart a click on it gets you in (and the E key does) */
export const CART_REACH = 2.5;
/** you play from the white tees (T254 'middle'), as your booked everyday round does */
export const YOUR_TEES: TeeKind = 'middle';
/** the most holes a round has (the everyday course plays each hole once) */
const MAX_HOLES = 18;

/** the lies your cart may not drive on: the greens, the bunkers and water (the tees, fairways and rough are fine, as in a buggy) */
export const cartMay = (l: Lie): boolean => l !== 'green' && l !== 'bunker' && l !== 'water';

/** which holes: all of them, the front nine, the back nine, or a pick */
export type HoleChoice = 'all' | 'front' | 'back' | 'pick';
/** the first tee's choices for a course of n holes (the everyday course's real holes): "All 18" (or "All n"), and with more than 9 holes "Front 9" and
 *  "Back n-9"; "Pick holes" always. Each with its hole indices */
export function holeOptions(n: number): { id: HoleChoice; label: string; holes: number[] }[] {
  const N = Math.max(0, Math.min(MAX_HOLES, Math.floor(n))), all = Array.from({ length: N }, (_, i) => i);
  if (!N) return [];
  const out: { id: HoleChoice; label: string; holes: number[] }[] = [{ id: 'all', label: `Play all ${N}`, holes: all }];
  if (N > 9) { out.push({ id: 'front', label: 'The front 9', holes: all.slice(0, 9) }, { id: 'back', label: `The back ${N - 9}`, holes: all.slice(9) }); }
  out.push({ id: 'pick', label: 'Pick holes', holes: [] });
  return out;
}
/** the hole indices a choice plays on a course of n holes: a pick's indices kept in course order, once each, the ones the course has (none: empty) */
export function pickHoles(n: number, choice: HoleChoice, picked: readonly number[] = []): number[] {
  if (choice !== 'pick') return holeOptions(n).find(o => o.id === choice)?.holes ?? [];
  const N = Math.min(MAX_HOLES, Math.floor(n));
  return [...new Set(picked.filter(i => Number.isInteger(i) && i >= 0 && i < N))].sort((a, b) => a - b);
}

/** one hole on the card: the course's hole index and number, its par, the strokes (penalties in), the putts, the penalty strokes, and whether it is
 *  holed (done) or was picked up at par + PICK_UP_OVER */
export interface CardRow { i: number; n: number; par: number; strokes: number; putts: number; pen: number; done: boolean; up?: boolean }
/** your round: the town day it began, the holes (indices of the everyday course, in play order), the hole you are on (an index into holes), the card (a
 *  row per hole), your ball and its lie (on the tee before the first stroke: the tee's point and lie 'tee'), holed (the hole is done: the card shows,
 *  "Next hole" goes on), over (the last hole is done) */
export interface YourRound { v: 1; day: number; holes: number[]; at: number; card: CardRow[]; ball: Pt; lie: Lie; holed: boolean; over: boolean }

/** the hole you play as you play it: your tee set's tee and line (holeFrom) */
export function holeOf(view: CourseView, i: number): PlayHole | null { const h = view.holes[i]; return h ? holeFrom(h, YOUR_TEES) : null; }

/** a new round on the holes (indices of view's holes), the ball on the first hole's tee. Null when no hole fits the course */
export function startRound(view: CourseView, holes: readonly number[], day: number): YourRound | null {
  const hs = holes.filter(i => !!view.holes[i]);
  if (!hs.length) return null;
  const card = hs.map(i => ({ i, n: view.holes[i]!.n, par: view.holes[i]!.par, strokes: 0, putts: 0, pen: 0, done: false }));
  const t = holeOf(view, hs[0]!)!.tee;
  return { v: 1, day, holes: hs, at: 0, card, ball: { x: t.x, y: t.y }, lie: 'tee', holed: false, over: false };
}

/** the row of the hole you are on */
export const rowOf = (r: YourRound): CardRow => r.card[r.at]!;
/** the turn for the shot panel (live.ts OwnerTurn: the hole, the stroke, your lie and ball, the pin, the distance, the model's suggested club, aim and
 *  power for your skills). golfer -1 and t 0: not a field golfer, no game minute */
export function yourTurn(view: CourseView, r: YourRound, sk: ShotSkill): OwnerTurn | null {
  if (r.over || r.holed) return null;
  const row = rowOf(r), hole = holeOf(view, row.i); if (!hole) return null;
  const sg = chooseShot(r.lie, r.ball, hole, sk, r.lie === 'tee'), putting = sg.club === 'putter';
  const distM = Math.hypot(hole.pin.x - r.ball.x, hole.pin.y - r.ball.y) * TILE_M, dM = Math.hypot(sg.aim.x - r.ball.x, sg.aim.y - r.ball.y) * TILE_M;
  const power = putting ? 1 : Math.min(POWER[1]!, Math.max(POWER[0]!, dM / carryM(sg.club, skillFor(sk, sg.club))));
  return { golfer: -1, holeIdx: row.i, hole: hole.n, par: hole.par, stroke: row.strokes + 1, t: 0, lie: r.lie, ball: { x: r.ball.x, y: r.ball.y },
    pin: { x: hole.pin.x, y: hole.pin.y }, distM, suggested: { club: sg.club, aim: { x: sg.aim.x, y: sg.aim.y }, power } };
}

/** where you stand to address the ball at `ball` for a shot at `aim`: ADDRESS_BACK behind it on the line (the pin's line when the aim is on the ball) */
export function addressOf(ball: Pt, aim: Pt): Pt {
  const dx = aim.x - ball.x, dy = aim.y - ball.y, L = Math.hypot(dx, dy);
  return L > 1e-6 ? { x: ball.x - dx / L * ADDRESS_BACK, y: ball.y - dy / L * ADDRESS_BACK } : { x: ball.x, y: ball.y };
}
/** whether you (at x, y) are near enough your ball to snap to the address (SNAP_TILES) */
export const nearBall = (x: number, y: number, ball: Pt): boolean => Math.hypot(x - ball.x, y - ball.y) <= SNAP_TILES;

/** the stream of your shot on hole index i, stroke k: the same shot on a reload (the seed is the game's and the round's day) */
const streamOf = (seed: number, r: YourRound, i: number, k: number) => rng(seed, 0x796f75 + r.day, i * 32 + k);

/** plays your shot from the input (club, aim, power; the swing meter's outcome) at your ball: the round after it (the card's strokes, putts and
 *  penalties; the ball and its lie; holed when it went in, or picked up at par + PICK_UP_OVER), and the shot as the tournament records one (for the
 *  report and the flight). Throws when there is no shot to play (holed, over) */
export function playYours(view: CourseView, r: YourRound, sk: ShotSkill, input: Omit<OwnerInput, 'holeIdx' | 'stroke'>, seed: number): { round: YourRound; shot: Shot; up: boolean } {
  if (r.over || r.holed) throw new Error('playYours: no shot to play');
  const row = rowOf(r), hole = holeOf(view, row.i); if (!hole) throw new Error(`playYours: no hole ${row.i}`);
  const stroke = row.strokes + 1, o = shotOutcome(view, hole, r.ball, r.lie, sk, input, streamOf(seed, r, row.i, stroke));
  const strokes = row.strokes + 1 + o.penalty, putts = row.putts + (input.club === 'putter' ? 1 : 0), cap = row.par + PICK_UP_OVER;
  const up = !o.holed && strokes >= cap, holed = o.holed || up;
  const nrow: CardRow = { ...row, strokes: up ? cap : strokes, putts, pen: row.pen + o.penalty, done: holed, ...(up ? { up: true } : {}) };
  const card = r.card.slice(); card[r.at] = nrow;
  const shot: Shot = { golfer: -1, hole: row.i, stroke, t: 0, from: { x: r.ball.x, y: r.ball.y }, to: o.to, club: input.club, lie: o.lie, penalty: o.penalty, holed: o.holed, ...(o.landing ? { landing: o.landing } : {}) };
  return { round: { ...r, card, ball: { x: o.to.x, y: o.to.y }, lie: o.lie, holed, over: holed && r.at === r.holes.length - 1 }, shot, up };
}

/** on to the next hole (after a hole is holed): the ball on its tee; the round as it is when the hole is not done or the round is over */
export function nextHole(view: CourseView, r: YourRound): YourRound {
  if (!r.holed || r.over || r.at + 1 >= r.holes.length) return r;
  const at = r.at + 1, h = holeOf(view, r.holes[at]!); if (!h) return { ...r, over: true };
  return { ...r, at, ball: { x: h.tee.x, y: h.tee.y }, lie: 'tee', holed: false };
}

/** the card's totals: the strokes and par of the holes done, to par, the putts, the holes done (thru) of all */
export function cardTotals(card: readonly CardRow[]): { strokes: number; par: number; toPar: number; putts: number; thru: number; holes: number } {
  let strokes = 0, par = 0, putts = 0, thru = 0;
  for (const c of card) if (c.done) { strokes += c.strokes; par += c.par; putts += c.putts; thru++; }
  return { strokes, par, toPar: strokes - par, putts, thru, holes: card.length };
}

/** a saved round, well formed; undefined when it is not one (an old save has none) */
export function normalizeYourRound(x: unknown): YourRound | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const o = x as Partial<YourRound>, n = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const LIES: readonly Lie[] = ['tee', 'fairway', 'rough', 'fescue', 'bunker', 'green', 'water', 'out'];
  if (!n(o.day) || !Array.isArray(o.holes) || !Array.isArray(o.card) || !o.ball || !n(o.ball.x) || !n(o.ball.y) || !n(o.at)) return undefined;
  const holes = o.holes.filter(n).map(Math.round), card = o.card.filter(c => c && n(c.i) && n(c.par) && n(c.strokes)).map(c => ({
    i: Math.round(c.i), n: n(c.n) ? Math.round(c.n) : Math.round(c.i) + 1, par: Math.round(c.par), strokes: Math.max(0, Math.round(c.strokes)), putts: n(c.putts) ? Math.max(0, Math.round(c.putts)) : 0,
    pen: n(c.pen) ? Math.max(0, Math.round(c.pen)) : 0, done: c.done === true, ...(c.up === true ? { up: true } : {}),
  }));
  if (!holes.length || holes.length !== card.length || holes.some((h, k) => card[k]!.i !== h)) return undefined;
  const at = Math.max(0, Math.min(holes.length - 1, Math.round(o.at)));
  return { v: 1, day: Math.round(o.day), holes, at, card, ball: { x: o.ball.x, y: o.ball.y }, lie: LIES.includes(o.lie as Lie) ? o.lie as Lie : 'rough', holed: o.holed === true, over: o.over === true };
}

/** the name of a hole's score: a hole in one, albatross, eagle, birdie, par, bogey, double and triple bogey, else "+n" */
export function scoreName(strokes: number, par: number): string {
  if (strokes === 1) return 'A hole in one!';
  const d = strokes - par;
  return d <= -3 ? 'Albatross' : d === -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double bogey' : d === 3 ? 'Triple bogey' : `+${d}`;
}
/** a hole's number as said: 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st */
export function ordinal(n: number): string {
  const t = n % 100, u = n % 10, s = t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th';
  return `${n}${s}`;
}

/** your ball in the air and rolling (real seconds): from, where it lands (null: a putt), where it comes to rest, the time so far and in all, the time in
 *  the air, whether the hole is done then (holed, or picked up: up), the card's row, and a penalty (the drop shows at the end) */
export interface YourFlight { from: Pt; land: Pt | null; to: Pt; t: number; dur: number; air: number; done: boolean; up: boolean; row: CardRow; pen: boolean;
  /** T318: a spin back's check (landing.check): the ball skids on to it first, then spins back to its rest */
  check?: Pt }
/** a flight's timing (real seconds): a full shot 0.9 s plus 0.012 s a tile in the air, then its roll (0.25 s plus 0.04 s a tile, at most 1.5 s; a
 *  penalty's 0.2 s); a putt 0.4 s plus 0.25 s a tile (at most 3 s) */
export function flightOf(from: Pt, land: Pt | null, to: Pt, done: boolean, up: boolean, row: CardRow, pen: boolean, check?: Pt): YourFlight {
  const air = land ? 0.9 + 0.012 * Math.hypot(land.x - from.x, land.y - from.y) : 0;
  const roll = land ? (pen ? 0.2 : Math.min(1.5, 0.25 + 0.04 * Math.hypot(to.x - land.x, to.y - land.y))) : Math.min(3, 0.4 + 0.25 * Math.hypot(to.x - from.x, to.y - from.y));
  const ck = land && check && !pen ? { check: { x: check.x, y: check.y } } : {};
  return { from: { x: from.x, y: from.y }, land: land ? { x: land.x, y: land.y } : null, to: { x: to.x, y: to.y }, t: 0, dur: air + roll + (ck.check ? CHECK_S : 0), air, done, up, row, pen, ...ck };
}
/** T318: the time (s) a spin back's hop on to its check takes */
const CHECK_S = 0.3;
/** the ball of a flight at its time (tiles; h its height in tiles: an eighth of the carry, at most 12 (24 m), on an arc): in the air, rolling (slowing), or a
 *  putt rolling; a penalty's ball stays where it landed and shows at its drop at the end */
export function yourBallAt(f: YourFlight): { x: number; y: number; h: number } {
  if (f.t < 0) return { x: f.from.x, y: f.from.y, h: 0 }; // (T320: before the clip's impact the ball waits at your feet)
  if (f.land && f.t < f.air) {
    const u = f.t / f.air, H = Math.min(12, Math.hypot(f.land.x - f.from.x, f.land.y - f.from.y) / 8);
    return { x: f.from.x + (f.land.x - f.from.x) * u, y: f.from.y + (f.land.y - f.from.y) * u, h: 4 * u * (1 - u) * H };
  }
  const a = f.land ?? f.from, u = Math.min(1, Math.max(0, (f.t - f.air) / Math.max(1e-3, f.dur - f.air))), e = 1 - (1 - u) * (1 - u);
  if (f.pen) return u < 1 ? { x: a.x, y: a.y, h: 0 } : { x: f.to.x, y: f.to.y, h: 0 };
  if (f.check) {
    // T318: a spin back: a low hop on to the check, then the ball zips back to its rest (slowing)
    const tc = CHECK_S / Math.max(1e-3, f.dur - f.air), c = f.check;
    if (u < tc) { const v = u / tc; return { x: a.x + (c.x - a.x) * v, y: a.y + (c.y - a.y) * v, h: 4 * v * (1 - v) * 0.15 }; }
    const v = (u - tc) / Math.max(1e-3, 1 - tc), w = 1 - (1 - v) * (1 - v);
    return { x: c.x + (f.to.x - c.x) * w, y: c.y + (f.to.y - c.y) * w, h: 0 };
  }
  return { x: a.x + (f.to.x - a.x) * e, y: a.y + (f.to.y - a.y) * e, h: 0 };
}

/** the HUD of your round (the engine's yourRoundView) */
export interface YourRoundView { round: YourRound; hole: number; par: number; stroke: number; distM: number; lie: Lie; totals: ReturnType<typeof cardTotals>;
  canJump: boolean; inCart: boolean; nearCart: boolean; card: boolean; flying: boolean; addressing: boolean }

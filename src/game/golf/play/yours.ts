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
import { FEAT_IDS, type FeatId } from './feats';
import { TILE_M } from '../types';
import { holeFrom } from './courseview';
import { shotOutcome, POWER, type OwnerInput, type OwnerTurn } from './live';
import { carryFor, chooseShot, rng, type ShotSkill } from './shot';
import { hasMech } from './mods';
import type { CourseView, Landing, Lie, PlayHole, Pt, Shot } from './types';
import type { TeeKind } from '../types';
import { normalizeMatch, type MatchPlay, type MatchView } from './match';
import { CUP_DROP, CUP_HOLD_S, CUP_NONE, CUP_SHAVE, DROP_S, shotPoint, type PuttRoll } from './green';

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

/** the lies your cart may not drive on: the greens, the tee boxes, the bunkers and water (the fairways and rough are fine, as in a buggy). T377 (#1033, the owner:
 *  "they should not be driving on tee boxes or greens"): the tee boxes joined the greens */
export const cartMay = (l: Lie): boolean => l !== 'green' && l !== 'tee' && l !== 'bunker' && l !== 'water';

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
 *  holed (done) or was picked up at par + PICK_UP_OVER. T325: the mulligans taken on it (absent: none) */
export interface CardRow { i: number; n: number; par: number; strokes: number; putts: number; pen: number; done: boolean; up?: boolean; mull?: number;
  /** T327: the hole was finished with a gimme (a short putt conceded, counted as a putt) */
  gim?: boolean;
  /** T337 (#963): the Snowman Eraser rubbed a double bogey or worse out to a bogey on this hole; the Scramble Captain's second ball was hit from its tee (the nine's one is used) */
  er?: true; scr?: true }

/** T325 (#925): mulligans in your own round: none, one per nine (the default), or as many as you like */
export type MullRule = 'none' | 'nine' | 'any';
export const MULL_RULES: readonly { id: MullRule; label: string }[] = [{ id: 'none', label: 'None' }, { id: 'nine', label: '1 per nine' }, { id: 'any', label: 'Unlimited' }];
/** T327 (#927): gimmies in your own round: off, inside the leather (about 0.6 m, the default), 1 m or 2 m */
export type GimmeRule = 'off' | 'leather' | 'm1' | 'm2';
export const GIMME_RULES: readonly { id: GimmeRule; label: string; m: number }[] = [
  { id: 'off', label: 'Off', m: 0 }, { id: 'leather', label: 'The leather (0.6 m)', m: 0.6 }, { id: 'm1', label: '1 m', m: 1 }, { id: 'm2', label: '2 m', m: 2 }];
/** gimmies of this many metres or more keep a round from your handicap (as mulligans do) */
export const GIMME_NO_HCP_M = 1;
/** the first tee's settings for your round: the mulligans (T325) and the gimmies (T327; absent, a round from before them: off) */
export interface RoundRules { mull: MullRule; gimme?: GimmeRule }
/** a new round's settings: one mulligan per nine, gimmies inside the leather */
export const DEFAULT_RULES: Readonly<RoundRules> = { mull: 'nine', gimme: 'leather' };
/** a round that is not your own (the tournament, a money match, your tournament and the Mayor's Cup): no mulligans and no gimmies, ever (a money
 *  match's opponent may concede a putt one day: a hook of its own, not these settings) */
export const COMPETITION_RULES: Readonly<RoundRules> = { mull: 'none', gimme: 'off' };
/** the settings a round of this kind plays under: your own everyday round the ones chosen at the first tee, a competition never any */
export function rulesFor(kind: 'everyday' | 'match' | 'tournament', chosen: RoundRules = DEFAULT_RULES): RoundRules {
  if (kind !== 'everyday') return { ...COMPETITION_RULES };
  return { mull: MULL_RULES.some(m => m.id === chosen.mull) ? chosen.mull : DEFAULT_RULES.mull, gimme: GIMME_RULES.some(g => g.id === chosen.gimme) ? chosen.gimme! : 'off' };
}
/** T327: the gimme distance of a round (metres; 0: off, and a round from before the setting) */
export const gimmeM = (r: YourRound): number => GIMME_RULES.find(g => g.id === (r.rules?.gimme ?? 'off'))?.m ?? 0;
/** your round: the town day it began, the holes (indices of the everyday course, in play order), the hole you are on (an index into holes), the card (a
 *  row per hole), your ball and its lie (on the tee before the first stroke: the tee's point and lie 'tee'), holed (the hole is done: the card shows,
 *  "Next hole" goes on), over (the last hole is done) */
export interface YourRound { v: 1; day: number; holes: number[]; at: number; card: CardRow[]; ball: Pt; lie: Lie; holed: boolean; over: boolean;
  /** T325: the first tee's settings (absent, a round from before them: no mulligans) */
  rules?: RoundRules;
  /** T325: the round as it was before your last shot (a mulligan puts it back); absent before the first shot of a hole and after a mulligan */
  undo?: YourRoundState;
  /** T325: the mulligans taken in the round so far (each gives the replayed shot a stream of its own: the same shot again is not the same outcome) */
  mk?: number;
  /** T246/T244: what the round is (one shared flag): your own casual round (absent: an older save's, or one started at the first tee), your Club
   *  Championship, the Mayor's Cup, or a money match. Every mode but casual is a competition: COMPETITION_RULES, the tournament's pressure */
  mode?: RoundMode;
  /** T244: a money match's other side (play/match.ts: the opponent, the stake, their ball, each hole's result); present with mode 'match' */
  match?: MatchPlay;
  /** T349 (#992): a practice round from the hole card's Play: free, not an event, not recorded (no handicap, reputation or money); absent: your round as before */
  practice?: true;
  /** T337 (#963): the Snowman Eraser was used this round (once); Cold Beer, Hot Hands: the holes of nerve left (set to HOT_HOLES + 1 by a birdie, one less each hole you go on to: the bonus is on while it is above 0); absent: none */
  er?: true; hot?: number;
  /** T431: the feats that have paid a card pull this round (play/feats.ts; once a round each); absent: none */
  feats?: FeatId[] }
/** T246/T244: a round's mode (YourRound.mode) */
export type RoundMode = 'casual' | 'championship' | 'mayors-cup' | 'match' | 'night-golf';
export const ROUND_MODES: readonly RoundMode[] = ['casual', 'championship', 'mayors-cup', 'match', 'night-golf'];
/** a competition round: any mode but casual (no mulligans, no gimmies; golf/player.ts PRESSURE.tournament or .match) */
export const isCompetition = (r: Pick<YourRound, 'mode'> | null | undefined): boolean => !!r?.mode && r.mode !== 'casual';
/** a round without its undo (what the undo keeps) */
export type YourRoundState = Omit<YourRound, 'undo'>;

/** the hole you play as you play it: your tee set's tee and line (holeFrom) */
export function holeOf(view: CourseView, i: number): PlayHole | null { const h = view.holes[i]; return h ? holeFrom(h, YOUR_TEES) : null; }

/** a new round on the holes (indices of view's holes), the ball on the first hole's tee. Null when no hole fits the course */
export function startRound(view: CourseView, holes: readonly number[], day: number, rules: RoundRules = DEFAULT_RULES): YourRound | null {
  const hs = holes.filter(i => !!view.holes[i]);
  if (!hs.length) return null;
  const card = hs.map(i => ({ i, n: view.holes[i]!.n, par: view.holes[i]!.par, strokes: 0, putts: 0, pen: 0, done: false }));
  const t = holeOf(view, hs[0]!)!.tee;
  return { v: 1, day, holes: hs, at: 0, card, ball: { x: t.x, y: t.y }, lie: 'tee', holed: false, over: false, rules: rulesFor('everyday', rules) };
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
  const power = putting ? 1 : Math.min(POWER[1]!, Math.max(POWER[0]!, dM / carryFor(sk, sg.club)));
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
const streamOf = (seed: number, r: YourRound, i: number, k: number) => rng(seed, 0x796f75 + r.day, i * 32 + k + (r.mk ? r.mk * 4096 : 0)); // (T325: a mulligan's own)

/** plays your shot from the input (club, aim, power; the swing meter's outcome) at your ball: the round after it (the card's strokes, putts and
 *  penalties; the ball and its lie; holed when it went in, or picked up at par + PICK_UP_OVER), and the shot as the tournament records one (for the
 *  report and the flight). Throws when there is no shot to play (holed, over) */
export function playYours(view: CourseView, r: YourRound, sk: ShotSkill, input: Omit<OwnerInput, 'holeIdx' | 'stroke'>, seed: number): { round: YourRound; shot: Shot; up: boolean } {
  if (r.over || r.holed) throw new Error('playYours: no shot to play');
  const row = rowOf(r), hole = holeOf(view, row.i); if (!hole) throw new Error(`playYours: no hole ${row.i}`);
  // (T337: the Scramble Captain's second ball: once a nine, off the tee, only with the card: the input's flag counts only then and marks the hole)
  const scr = input.scr === true && scrambleLeft(r, sk) > 0 && r.lie === 'tee' && row.strokes === 0, inp = input.scr && !scr ? { ...input, scr: undefined } : input;
  const stroke = row.strokes + 1, o = shotOutcome(view, hole, r.ball, r.lie, sk, inp, streamOf(seed, r, row.i, stroke), { last: r.at === r.holes.length - 1 });
  const strokes = row.strokes + 1 + o.penalty, putts = row.putts + (input.club === 'putter' ? 1 : 0), cap = row.par + PICK_UP_OVER;
  const up = !o.holed && strokes >= cap, holed = o.holed || up;
  let nrow: CardRow = { ...row, strokes: up ? cap : strokes, putts, pen: row.pen + o.penalty, done: holed, ...(up ? { up: true } : {}), ...(scr ? { scr: true as const } : {}) };
  let er = r.er, hot = r.hot;
  // (T337: not in a money match, whose holes are decided by the strokes as they were played; the Snowman Eraser: once a round a double bogey or worse is rubbed out to a bogey; Cold Beer, Hot Hands: a birdie or better is two holes of nerve)
  if (holed && !r.match) {
    if (hasMech(sk, 'eraser') && !er && nrow.strokes >= nrow.par + 2) { nrow = { ...nrow, strokes: nrow.par + 1, er: true }; er = true; }
    if (hasMech(sk, 'hands') && nrow.strokes <= nrow.par - 1) hot = HOT_HOLES + 1;
  }
  const card = r.card.slice(); card[r.at] = nrow;
  const shot: Shot = { golfer: -1, hole: row.i, stroke, t: 0, from: { x: r.ball.x, y: r.ball.y }, to: o.to, club: input.club, lie: o.lie, penalty: o.penalty, holed: o.holed, ...(o.landing ? { landing: o.landing } : {}) };
  const { undo: _u, ...before } = r; void _u;
  return { round: { ...r, card, ball: { x: o.to.x, y: o.to.y }, lie: o.lie, holed, over: holed && r.at === r.holes.length - 1, undo: before, ...(er ? { er } : {}), ...(hot !== undefined ? { hot } : {}) }, shot, up };
}

/** T337: Cold Beer, Hot Hands: the holes of nerve a birdie or better gives (the next two), and the nerve (skill points) it adds */
export const HOT_HOLES = 2, HOT_NERVE = 20;
/** the nerve bonus a round gives now (Cold Beer, Hot Hands): HOT_NERVE while it has holes left, else 0 */
export const hotNerve = (r: Pick<YourRound, 'hot'> | null | undefined): number => r?.hot && r.hot > 0 ? HOT_NERVE : 0;
/** T337: the Scramble Captain's second balls left on the nine you are on (the card's allowance: one a nine; 0 without the mechanic, in a match or a competition: the card is banned in one) */
export function scrambleLeft(r: YourRound | null | undefined, sk: ShotSkill): number {
  if (!r || !hasMech(sk, 'scramble') || r.match || isCompetition(r)) return 0;
  const k0 = Math.floor(r.at / 9) * 9; let used = 0;
  for (let k = k0; k < Math.min(r.card.length, k0 + 9); k++) used += r.card[k]!.scr ? 1 : 0;
  return Math.max(0, 1 - used);
}

/** on to the next hole (after a hole is holed): the ball on its tee; the round as it is when the hole is not done or the round is over */
export function nextHole(view: CourseView, r: YourRound): YourRound {
  if (!r.holed || r.over || r.at + 1 >= r.holes.length) return r;
  const at = r.at + 1, h = holeOf(view, r.holes[at]!); if (!h) return { ...r, over: true };
  const { undo: _u, hot: h0, ...rest } = r; void _u;
  // (T337: Cold Beer, Hot Hands: one hole of the nerve is behind you)
  return { ...rest, at, ball: { x: h.tee.x, y: h.tee.y }, lie: 'tee', holed: false, ...(h0 !== undefined && h0 > 1 ? { hot: h0 - 1 } : {}) };
}

/** T325: the mulligans left now (Infinity: unlimited): none under 'none'; one per nine of the round (holes 1-9 of it, 10-18) under 'nine' */
export function mulligansLeft(r: YourRound): number {
  const m = r.rules?.mull ?? 'none';
  if (m === 'none') return 0;
  if (m === 'any') return Infinity;
  const k0 = Math.floor(r.at / 9) * 9; let used = 0;
  for (let k = k0; k < Math.min(r.card.length, k0 + 9); k++) used += r.card[k]!.mull ?? 0;
  return Math.max(0, 1 - used);
}
/** whether a mulligan is offered now: a shot to take back and one left (the round's settings allow it) */
export const canMulligan = (r: YourRound | null | undefined): boolean => !!r?.undo && mulligansLeft(r) > 0;
/** T325: the mulligan: the round as it was before your last shot (the ball where it was hit from, its lie, the hole's strokes), the hole marked with
 *  one more mulligan, the round's count up (the replayed shot's stream changes). The round as it is when none is offered */
export function takeMulligan(r: YourRound): YourRound {
  if (!canMulligan(r)) return r;
  const u = r.undo!, card = u.card.slice(), row = card[u.at]!;
  card[u.at] = { ...row, mull: (row.mull ?? 0) + 1 };
  return { ...u, card, rules: r.rules ?? u.rules, mk: (r.mk ?? 0) + 1 };
}
/** T325: the mulligans taken in the round (the scorecard's "2 mulligans") */
export const mulligansOf = (r: YourRound): number => r.card.reduce((a, c) => a + (c.mull ?? 0), 0);
/** T327: the gimmies taken in the round */
export const gimmiesOf = (r: YourRound): number => r.card.reduce((a, c) => a + (c.gim ? 1 : 0), 0);
/** why a round does not count toward your handicap (null: it does): mulligans taken (T325), gimmies taken at GIMME_NO_HCP_M or more (T327) */
export function noHandicapWhy(r: YourRound): string | null {
  const m = mulligansOf(r), g = gimmeM(r) >= GIMME_NO_HCP_M ? gimmiesOf(r) : 0, out: string[] = [];
  if (m) out.push(`${m} mulligan${m > 1 ? 's' : ''}`);
  if (g) out.push(`${g} ${g > 1 ? 'gimmies' : 'gimme'} inside ${gimmeM(r)} m`);
  return out.length ? out.join(', ') : null;
}
/** T327: whether the gimme is offered: your ball at rest on the green, the hole not done, within the round's gimme distance of the cup */
export function canGimme(view: CourseView, r: YourRound | null | undefined): boolean {
  if (!r || r.holed || r.over || r.lie !== 'green') return false;
  const g = gimmeM(r), h = holeOf(view, rowOf(r).i); if (!g || !h) return false;
  return Math.hypot(h.pin.x - r.ball.x, h.pin.y - r.ball.y) * TILE_M <= g;
}
/** T327: the gimme: the putt conceded, holed for one stroke (counted as a putt), the hole done (the round over after the last); the round as it is when
 *  none is offered. No mulligan takes it back (the undo goes) */
export function takeGimme(view: CourseView, r: YourRound): YourRound {
  if (!canGimme(view, r)) return r;
  const row = rowOf(r), pin = holeOf(view, row.i)!.pin, card = r.card.slice();
  card[r.at] = { ...row, strokes: row.strokes + 1, putts: row.putts + 1, done: true, gim: true };
  const { undo: _u, ...rest } = r; void _u;
  return { ...rest, card, ball: { x: pin.x, y: pin.y }, holed: true, over: r.at === r.holes.length - 1 };
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
    pen: n(c.pen) ? Math.max(0, Math.round(c.pen)) : 0, done: c.done === true, ...(c.up === true ? { up: true } : {}), ...(n(c.mull) && c.mull >= 1 ? { mull: Math.round(c.mull) } : {}), ...(c.gim === true ? { gim: true } : {}),
    ...(c.er === true ? { er: true as const } : {}), ...(c.scr === true ? { scr: true as const } : {}), // (T337)
  }));
  if (!holes.length || holes.length !== card.length || holes.some((h, k) => card[k]!.i !== h)) return undefined;
  const at = Math.max(0, Math.min(holes.length - 1, Math.round(o.at)));
  const base: YourRound = { v: 1, day: Math.round(o.day), holes, at, card, ball: { x: o.ball.x, y: o.ball.y }, lie: LIES.includes(o.lie as Lie) ? o.lie as Lie : 'rough', holed: o.holed === true, over: o.over === true };
  // T325: the settings, the mulligans' count and the undo (itself a round, without an undo); an old save has none of them and is unchanged
  const ru = o.rules as Partial<RoundRules> | undefined;
  if (ru && typeof ru === 'object' && MULL_RULES.some(m => m.id === ru.mull)) base.rules = { mull: ru.mull!, ...(GIMME_RULES.some(g => g.id === ru.gimme) ? { gimme: ru.gimme! } : {}) };
  if (n(o.mk) && o.mk >= 1) base.mk = Math.round(o.mk);
  if (o.er === true) base.er = true; if (n(o.hot) && o.hot >= 1) base.hot = Math.min(HOT_HOLES + 1, Math.round(o.hot)); // T337: the Snowman Eraser used, the nerve holes left
  if (o.practice === true && !o.mode) base.practice = true; // T349: a casual round that is practice (a competition or a match never is)
  if (Array.isArray(o.feats)) { const f = [...new Set(o.feats.filter((x: unknown): x is FeatId => FEAT_IDS.includes(x as FeatId)))]; if (f.length) base.feats = f; } // T431
  if (o.mode && ROUND_MODES.includes(o.mode) && o.mode !== 'casual') { base.mode = o.mode; base.rules = { ...COMPETITION_RULES }; } // (T246: a competition keeps its rules)
  if (base.mode === 'match') { const m = normalizeMatch(o.match, holes.length); if (m) base.match = m; else delete base.mode; } // (T244: a match without its other side is a casual round)
  if (o.undo && typeof o.undo === 'object') {
    const u = normalizeYourRound({ ...(o.undo as object), undo: undefined });
    if (u && u.holes.length === holes.length) { const { undo: _x, ...us } = u; void _x; base.undo = us; }
  }
  return base;
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
 *  the air, whether the hole is done then (holed, or picked up: up), the card's row, and a penalty (the drop shows at the end). T319: the aim (the
 *  flight bends from it to the landing: the tracer's shape), a putt's visible roll with its break and its end at the cup (green.ts PuttRoll), the hold
 *  on a holed ball in the cup (s, inside dur), and the spin's change to the roll (m, landing.spin: topspin runs out, rollShare) */
export interface YourFlight { from: Pt; land: Pt | null; to: Pt; t: number; dur: number; air: number; done: boolean; up: boolean; row: CardRow; pen: boolean;
  aim: Pt | null; putt: PuttRoll | null; hold: number; spin: number;
  /** T318: a spin back's check (landing.check): the ball skids on to it first, then spins back to its rest */
  check?: Pt }
/** what a flight may carry besides its points: the aim (T319), a putt's roll (T319), a spin back's check and the spin's change to the roll (T318) */
export interface FlightExtra { aim?: Pt; putt?: PuttRoll; check?: Pt; spin?: number }
/** a flight's timing (real seconds): a full shot 0.9 s plus 0.012 s a tile in the air, then its roll (0.25 s plus 0.04 s a tile, at most 1.5 s; a
 *  penalty's 0.2 s; a spin back CHECK_S more); a putt 0.4 s plus 0.25 s a tile (at most 3 s), and CUP_HOLD_S on the ball in the cup when it drops */
export function flightOf(from: Pt, land: Pt | null, to: Pt, done: boolean, up: boolean, row: CardRow, pen: boolean, x: FlightExtra = {}): YourFlight {
  const air = land ? 0.9 + 0.012 * Math.hypot(land.x - from.x, land.y - from.y) : 0;
  const roll = land ? (pen ? 0.2 : Math.min(1.5, 0.25 + 0.04 * Math.hypot(to.x - land.x, to.y - land.y))) : Math.min(3, 0.4 + 0.25 * Math.hypot(to.x - from.x, to.y - from.y));
  const putt = !land && x.putt ? x.putt : null, hold = putt && putt.fate === CUP_DROP ? CUP_HOLD_S : 0;
  const ck = land && x.check && !pen ? { check: { x: x.check.x, y: x.check.y } } : {};
  return { from: { x: from.x, y: from.y }, land: land ? { x: land.x, y: land.y } : null, to: { x: to.x, y: to.y }, t: 0, dur: air + roll + (ck.check ? CHECK_S : 0) + hold, air, done, up, row, pen,
    aim: x.aim ? { x: x.aim.x, y: x.aim.y } : null, putt, hold, spin: land && !pen && x.spin ? x.spin : 0, ...ck };
}
/** a shot's landing's spin for its flight (T318's landing.check and landing.spin); {} with none */
export function flightSpin(l: Landing | undefined): Pick<FlightExtra, 'check' | 'spin'> {
  return l ? { ...(l.check ? { check: l.check } : {}), ...(l.spin ? { spin: l.spin } : {}) } : {};
}
/** T318: the time (s) a spin back's hop on to its check takes */
const CHECK_S = 0.3;
/** the share of a full shot's roll (after it lands) at a share u of the roll's time: slowing to a stop. Topspin (spinM metres more roll, T318's
 *  landing.spin) keeps its pace longer: it runs out (the slowing eases from a square toward a straight line, at most 60% of the way at 10 m) */
export const rollShare = (u: number, spinM = 0): number => { const k = spinM > 0 ? Math.min(0.6, spinM / 10 * 0.6) : 0; return 1 - Math.pow(1 - u, 2 - k); };
/** where a ball of yours is: its ground point (tiles), height (h: tiles, the flight's lift) and how far it has dropped into the cup (0..1) */
export interface YourBall { x: number; y: number; h: number; sink: number }
const PT = { x: 0, y: 0, h: 0 };
/** the ball of a flight at its time (tiles; h its height in tiles: an eighth of the carry, at most 12 (24 m), on an arc; T319: along the shot's bend from
 *  the aim): in the air, rolling (slowing; T318: a spin back skids on to its check then zips back, topspin runs out), or a putt rolling with its break
 *  (and into the cup); a penalty's ball stays where it landed and shows at its drop at the end */
export function yourBallAt(f: YourFlight): YourBall {
  if (f.t < 0) return { x: f.from.x, y: f.from.y, h: 0, sink: 0 }; // (T320: before the clip's impact the ball waits at your feet)
  if (f.land && f.t < f.air) {
    const u = f.t / f.air, H = Math.min(12, Math.hypot(f.land.x - f.from.x, f.land.y - f.from.y) / 8);
    shotPoint(f.from, f.aim, f.land, u, PT);
    return { x: PT.x, y: PT.y, h: 4 * u * (1 - u) * H, sink: 0 };
  }
  const rollDur = Math.max(1e-3, f.dur - f.air - f.hold), u = Math.min(1, Math.max(0, (f.t - f.air) / rollDur));
  if (f.putt) {
    f.putt.at(u, PT);
    const sink = f.hold > 0 ? Math.min(1, Math.max(0, (f.t - f.air - rollDur) / DROP_S)) : 0;
    return { x: PT.x, y: PT.y, h: PT.h / TILE_M, sink };
  }
  const a = f.land ?? f.from;
  if (f.pen) return u < 1 ? { x: a.x, y: a.y, h: 0, sink: 0 } : { x: f.to.x, y: f.to.y, h: 0, sink: 0 };
  if (f.check) {
    // T318: a spin back: a low hop on to the check, then the ball zips back to its rest (slowing)
    const tc = CHECK_S / rollDur, c = f.check;
    if (u < tc) { const v = u / tc; return { x: a.x + (c.x - a.x) * v, y: a.y + (c.y - a.y) * v, h: 4 * v * (1 - v) * 0.15, sink: 0 }; }
    const v = (u - tc) / Math.max(1e-3, 1 - tc), w = 1 - (1 - v) * (1 - v);
    return { x: c.x + (f.to.x - c.x) * w, y: c.y + (f.to.y - c.y) * w, h: 0, sink: 0 };
  }
  const e = rollShare(u, f.spin);
  return { x: a.x + (f.to.x - a.x) * e, y: a.y + (f.to.y - a.y) * e, h: 0, sink: 0 };
}
/** the time (s from the strike) a putt reaches the cup (null: it never does): the drop or the lip-out happens then */
export function cupTime(f: YourFlight): number | null {
  const p = f.putt; if (!p || p.fate === CUP_NONE || p.fate === CUP_SHAVE) return null;
  return f.air + p.timeAt(p.sCup) * Math.max(1e-3, f.dur - f.air - f.hold);
}

/** the HUD of your round (the engine's yourRoundView) */
export interface YourRoundView { round: YourRound; hole: number; par: number; stroke: number; distM: number; lie: Lie; totals: ReturnType<typeof cardTotals>;
  canJump: boolean; inCart: boolean; nearCart: boolean;
  /** T325: a mulligan is offered now, and how many are left (Infinity: unlimited; 0 with the rule 'none') */
  canMull: boolean; mullLeft: number;
  /** T327: the gimme is offered now (your ball inside the ring) */
  canGimme: boolean;
  /** T244: a money match's bar (play/match.ts matchView); null or absent: not a match */
  match?: MatchView | null;
  /** T334: the day's wind as the round's bar says it ("8 mph from the W", "Calm"); null: no weather (a day from before it) */
  wind?: string | null;
  /** T326: your cart is out of reach (the Cart button calls it) */
  cartFar: boolean; card: boolean; flying: boolean; addressing: boolean }

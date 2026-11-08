// T244 (#706): money matches (docs/plans/P28.md section 5; the owner, 2026-10-28: "you should be able to chalange npc to a golf game for money").
// Pure TS, no DOM, no engine.
// - The opponent: a person you talked to (the talk card: T243's portrait card later), with a handicap (an everyday golfer's own skills, else one from
//   their name), skills that give that handicap on the same curve as yours (player.ts handicapOf), and a purse (what they carry: from their name, less
//   what they lost to you lately).
// - The challenge: 9 or 18 holes for a stake you set, at least MIN_STAKE and at most what both of you can afford (maxStake). They accept or decline
//   (answerOf): by your handicap against theirs, the stake against their purse, and your history (a rival who lost to you wants another go).
// - The match: your own round (play/yours.ts YourRound, mode 'match': no mulligans, no gimmies, a match's pressure), the opponent's ball and strokes
//   beside yours (MatchPlay). Golf's order: the one farther from the pin plays (the honour on the tee: the last hole's winner). Their shots are the
//   round model's (chooseShot, hitShot, putt), from a stream of their own per hole and stroke. A hole is decided once neither can do better (holed,
//   or the other already has as many strokes without holing: picked up, as match play concedes); the match once one side is up by more holes than
//   are left (3&2), or after the last hole.
// - The result (settleMatch): the stake moves, your rounds get a 'match' round (nerve up), a win raises the club's reputation a little (REP_WIN), the
//   opponent remembers (rivals: won, lost, halved, the money) and may challenge you back on a later day (returnChallenge).
import { TILE_M } from '../types';
import type { TeeKind } from '../types';
import { holeFrom } from './courseview';
import { chooseShot, hitShot, putt, rng, skillFor } from './shot';
import type { CourseView, GameSkills, Lie, Pt, Shot } from './types';
import { cardTotals, holeOf, nextHole, playYours, rowOf, rulesFor, startRound, yourTurn, PICK_UP_OVER, type CardRow, type YourRound } from './yours';
import { gameSkills, handicapOf, playedRound, PRESSURE, type PlayerProfile, type SkillsIn } from '../player';
import type { OwnerInput } from './live';

/** the smallest stake ($) and the step the stake moves by */
export const MIN_STAKE = 10, STAKE_STEP = 10;
/** a win raises the club's reputation (0..100) by this much; a loss or a half leaves it */
export const REP_WIN = 0.5;
/** the rivals remembered (the most recent kept) */
export const RIVALS_MAX = 24;
/** a rival may challenge you back from this many days after your last match with them */
export const RETURN_AFTER = 2;
/** a rival's chance a day to challenge you back: one who lost to you (revenge) or one who beat you (they fancy it again), else one who halved */
export const RETURN_CHANCE = { lost: 0.2, won: 0.1, halved: 0.08 } as const;
/** a purse grows back by this much a day after a loss to you (a rival is not broke for ever) */
export const PURSE_REGROW = 40;
/** the opponent plays from your tees (the white tees: a match is level, no strokes given) */
export const MATCH_TEES: TeeKind = 'middle';

/** one hole's result from your side: 1 you won it, 0 halved, -1 they won it */
export type HoleWin = 1 | 0 | -1;

/** a string's number (FNV-1a): a name's seed */
export function nameSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** a stable 0..1 draw for a name and two numbers */
const draw = (name: string, a: number, b = 0): number => rng(nameSeed(name), a, b)();

/** the opponent: name, skills (0..100, nerve too), handicap (player.ts handicapOf: as yours is worked out), purse ($) */
export interface Opponent { name: string; skills: SkillsIn; hcp: number; purse: number }

/** the weighted skill (0..1, as handicapOf weighs them at everyday pressure) a handicap stands for: the HCP curve solved (handicap 32 at 0, scratch at 0.74) */
export function skillOfHcp(hcp: number): number {
  const a = 31.9, b = -56.2, c = 17.5, h = Math.min(31.9, Math.max(-7, hcp)), d = b * b - 4 * c * (a - h);
  return Math.min(1, Math.max(0, (-b - Math.sqrt(Math.max(0, d))) / (2 * c)));
}
/** a golfer's handicap from his shot skill (0..1 parts or one number; an everyday golfer's), on the same curve */
export function hcpOfSkill(sk: number | GameSkills): number {
  const s = typeof sk === 'number' ? sk : 0.5 * sk.driving + 0.2 * sk.irons + 0.15 * sk.short + 0.15 * sk.putting;
  return Math.round((31.9 - 56.2 * s + 17.5 * s * s) * 10) / 10;
}
/** a handicap a person who golfs has from their name: most are high (14-30), a few low (4-12) */
export function hcpOfName(name: string): number {
  const u = draw(name, 1), v = draw(name, 2);
  return Math.round((u < 0.2 ? 4 + 8 * v : 14 + 16 * v) * 10) / 10;
}
/** whether a townsperson golfs (about half do; everyone at the range or on the course does): only a golfer can be challenged */
export const golfs = (name: string): boolean => draw(name, 5) < 0.55;
/** what a person carries for a bet ($, before their losses to you): $60 to $1,560, more for the better golfers (they play for money) */
export function basePurse(name: string, hcp: number): number {
  const u = draw(name, 3), k = hcp < 10 ? 1.6 : 1;
  return Math.round((60 + 1500 * u * u) * k / STAKE_STEP) * STAKE_STEP;
}
/** the opponent for a person: their handicap (given: an everyday golfer's, a rival's remembered one; else from their name), skills that give it
 *  (each part a little off the average by the name: one drives well, another putts), their nerve, and their purse now (less what they lost to you
 *  lately, growing back PURSE_REGROW a day) */
export function opponentOf(name: string, hcp: number = hcpOfName(name), rival?: Rival | null, day = 0): Opponent {
  const s = skillOfHcp(hcp), nerve = Math.round(20 + 50 * draw(name, 4)), f = 1 - 0.3 * PRESSURE.everyday * (1 - nerve / 100);
  const part = (k: number) => Math.min(100, Math.max(0, (s / f) * 100 + (draw(name, 10 + k) - 0.5) * 12));
  const skills: SkillsIn = { driving: part(0), irons: part(1), short: part(2), putting: part(3), nerve };
  // the parts' wobble moves the handicap a little: pull driving so handicapOf gives the handicap asked (to a tenth)
  for (let k = 0; k < 6; k++) { const d = handicapOf(skills) - hcp; if (Math.abs(d) < 0.05) break; skills.driving = Math.min(100, Math.max(0, skills.driving + d * 1.4)); }
  const lost = rival ? Math.max(0, rival.net - PURSE_REGROW * Math.max(0, day - rival.last)) : 0;
  return { name, skills, hcp: handicapOf(skills), purse: Math.max(0, basePurse(name, hcp) - lost) };
}

/** the most you can stake: what both of you can afford, in STAKE_STEPs (0: no match: below MIN_STAKE) */
export function maxStake(yourMoney: number, purse: number): number {
  const m = Math.floor(Math.min(Math.max(0, yourMoney), Math.max(0, purse)) / STAKE_STEP) * STAKE_STEP;
  return m >= MIN_STAKE ? m : 0;
}
/** a stake within the bounds (MIN_STAKE..maxStake, in steps); 0 when no match can be had */
export function clampStake(stake: number, yourMoney: number, purse: number): number {
  const hi = maxStake(yourMoney, purse); if (!hi) return 0;
  return Math.min(hi, Math.max(MIN_STAKE, Math.round((Number.isFinite(stake) ? stake : MIN_STAKE) / STAKE_STEP) * STAKE_STEP));
}
/** why the stake cannot be played (null: it can): below the least, more than you have, more than they carry */
export function stakeWhy(stake: number, yourMoney: number, purse: number, name: string): string | null {
  if (!(stake >= MIN_STAKE)) return `The least stake is $${MIN_STAKE}`;
  if (stake > yourMoney) return `You have $${Math.max(0, Math.floor(yourMoney)).toLocaleString('en-US')}`;
  if (stake > purse) return `${firstName(name)} carries $${Math.max(0, purse).toLocaleString('en-US')}`;
  return null;
}
export const firstName = (name: string): string => name.split(' ')[0] || name;

/** the answer to a challenge: yes or no and what they say. Their chance: an even match at a small stake is likely yes; they like it more the better
 *  they are than you (each stroke of handicap over 18 holes, 4%), less the more of their purse it is, and more when they lost to you last (revenge).
 *  The same challenge on the same day gets the same answer (a lower stake may change it) */
export function answerOf(o: Opponent, yourHcp: number, stake: number, holes: number, rival: Rival | null | undefined, day: number): { yes: boolean; p: number; line: string } {
  if (stake > o.purse) return { yes: false, p: 0, line: o.purse < MIN_STAKE ? "I'm cleaned out. Another day." : `I don't carry that kind of money. $${o.purse.toLocaleString('en-US')} tops.` };
  const edge = (yourHcp - o.hcp) * Math.min(18, holes) / 18, share = stake / Math.max(1, o.purse);
  const rev = rival ? (rival.res === 'w' ? 0.25 : rival.res === 'l' ? 0.1 : 0.05) : 0; // (res is yours: 'w' you beat them last)
  const p = Math.min(0.95, Math.max(0.05, 0.6 + 0.04 * edge - 0.55 * share + rev));
  const yes = draw(o.name, 100 + day, stake) < p;
  const L = yes
    ? rival?.res === 'w' ? ['You again? Good. I owe you one.', 'Revenge it is. Tee it up.'] : edge > 2 ? ['Easy money. You\'re on.', 'Sure, if you want to donate.'] : ['You\'re on.', 'Deal. Loser buys the drinks too.', 'Let\'s go. First tee.']
    : share > 0.5 ? [`That's rent money. Not for $${stake}.`, `Too rich for me at $${stake}.`] : edge < -2 ? ['I\'ve seen you hit. No thanks.', 'Not against you, I\'m not.'] : ['Not today, thanks.', 'Maybe another time.'];
  return { yes, p, line: L[Math.floor(draw(o.name, 200 + day, stake) * L.length)]! };
}

/** a person you have played: their name, handicap (as last played), your wins, losses and halves against them, the money you won from them (net,
 *  negative: you are down), your last match's day, result (yours: w won, l lost, h halved) and stake */
export interface Rival { name: string; hcp: number; w: number; l: number; h: number; net: number; last: number; res: 'w' | 'l' | 'h'; stake: number }
/** a challenge waiting for you (a rival's return challenge, a card): who, the stake, 9 or 18, the day they asked */
export interface Challenge { name: string; stake: number; holes: 9 | 18; day: number }

/** the opponent's side of a match: who (name, handicap, the skills their shots are played at: gameSkills at a match's pressure, the look), the stake,
 *  their ball on the hole now (its lie, their strokes, holed), each hole's result (yours: 1 won, 0 halved, -1 lost) and their strokes per hole, a
 *  rival's return challenge (it asked: the result says so) */
export interface MatchPlay { name: string; hcp: number; sk: GameSkills; look: number; stake: number; ball: Pt; lie: Lie; strokes: number; holed: boolean; res: HoleWin[]; ocard: number[]; back?: boolean }

/** the match's state: holes up (yours: + you are up), played, left, dormie (up by as many as are left), over (decided or played out), the result
 *  (yours: w won, l lost, h halved; null: going on), and the words: "2 up thru 7", "All square thru 3", "Dormie 2", "You won 3&2", "Lost 1 down" */
export interface MatchScore { up: number; played: number; left: number; dormie: boolean; over: boolean; result: 'w' | 'l' | 'h' | null; text: string; short: string }
export function matchScore(res: readonly HoleWin[], total: number): MatchScore {
  const played = res.length, up = res.reduce<number>((a, b) => a + b, 0), left = Math.max(0, total - played);
  const over = Math.abs(up) > left || left === 0, result = !over ? null : up > 0 ? 'w' : up < 0 ? 'l' : 'h';
  const dormie = !over && up !== 0 && Math.abs(up) === left;
  const st = up === 0 ? 'All square' : up > 0 ? `${up} up` : `${-up} down`;
  let text: string, short: string;
  if (over) {
    const m = Math.abs(up), by = left > 0 ? `${m}&${left}` : `${m} ${up > 0 ? 'up' : 'down'}`;
    text = result === 'h' ? 'Match halved' : result === 'w' ? `You won ${by}` : `You lost ${left > 0 ? `${m}&${left}` : `${m} down`}`;
    short = result === 'h' ? 'Halved' : left > 0 ? `${up > 0 ? 'Won' : 'Lost'} ${m}&${left}` : `${up > 0 ? 'Won' : 'Lost'} ${by}`;
  } else if (dormie) { text = `${st}: dormie ${left}`; short = `Dormie ${left} (${st})`; }
  else { text = played ? `${st} thru ${played}` : 'All square'; short = st; }
  return { up, played, left, dormie, over, result, text, short };
}

/** a hole's result once neither side can do better (null: still going): both holed, the lower wins; one holed in n and the other already on n or more
 *  strokes without holing (they pick up: match play concedes it). Your row picked up (par + 5) counts as holed at its cap */
export function holeOutcome(you: { strokes: number; done: boolean }, opp: { strokes: number; holed: boolean }): HoleWin | null {
  if (you.done && opp.holed) return you.strokes < opp.strokes ? 1 : you.strokes > opp.strokes ? -1 : 0;
  if (you.done && opp.strokes >= you.strokes) return 1;
  if (opp.holed && you.strokes >= opp.strokes) return -1;
  return null;
}

/** a new match: your round on the holes (mode 'match': no mulligans, no gimmies) with the opponent's ball on the first tee beside yours */
export function startMatch(view: CourseView, holes: readonly number[], day: number, o: Opponent, stake: number, look: number, back = false): YourRound | null {
  const r = startRound(view, holes, day, rulesFor('match')); if (!r) return null;
  const t = holeOf(view, r.holes[0]!)!.tee;
  const match: MatchPlay = { name: o.name, hcp: o.hcp, sk: gameSkills(o.skills, PRESSURE.match), look, stake, ball: { x: t.x, y: t.y }, lie: 'tee', strokes: 0, holed: false, res: [], ocard: [], ...(back ? { back: true } : {}) };
  return { ...r, mode: 'match', rules: rulesFor('match'), match };
}
/** the hole decided (its result is in) */
export const holeDecided = (r: YourRound): boolean => !!r.match && r.match.res.length > r.at;
/** the match's score now */
export const scoreOf = (r: YourRound): MatchScore => matchScore(r.match?.res ?? [], r.holes.length);

/** who plays next on the hole: 'you' or 'opp', or null when the hole is decided (or no match). On the tee the honour (the last hole won; you on the
 *  first and after a half); then the one farther from the pin; a side that is holed waits */
export function matchTurn(view: CourseView, r: YourRound): 'you' | 'opp' | null {
  const m = r.match; if (!m || r.over || holeDecided(r)) return null;
  const row = rowOf(r);
  if (row.done) return m.holed ? null : 'opp';
  if (m.holed) return 'you';
  if (row.strokes === 0 && m.strokes === 0) { const last = [...m.res].reverse().find(x => x !== 0); return last === -1 ? 'opp' : 'you'; }
  const h = holeOf(view, row.i); if (!h) return 'you';
  const dy = Math.hypot(h.pin.x - r.ball.x, h.pin.y - r.ball.y), dO = Math.hypot(h.pin.x - m.ball.x, h.pin.y - m.ball.y);
  return dO > dy ? 'opp' : 'you';
}

/** the hole's result written in when it is decided: the result and the opponent's strokes on the card; your row done (picked up as conceded when you
 *  had not holed), the hole done; the match over once decided (the round over). The round as it is while the hole goes on */
export function decideHole(r: YourRound): YourRound {
  const m = r.match; if (!m || holeDecided(r)) return r;
  const row = rowOf(r), w = holeOutcome(row, m); if (w === null) return r;
  const res = [...m.res, w], ocard = [...m.ocard, m.strokes], card = r.card.slice();
  if (!row.done) card[r.at] = { ...row, done: true, up: true };
  const sc = matchScore(res, r.holes.length);
  const { undo: _u, ...rest } = r; void _u;
  return { ...rest, card, holed: true, over: sc.over, match: { ...m, res, ocard } };
}

/** the stream of the opponent's shot on hole index i, stroke k (their own: the same on a reload) */
const oppStream = (seed: number, r: YourRound, i: number, k: number) => rng(seed, 0x6d6174 + r.day, i * 32 + k);
/** the opponent's shot by the round model (as a field golfer's: chooseShot, a putt by putt, else hitShot) from their ball; the round after it (their
 *  ball, lie and strokes; holed, or picked up at par + PICK_UP_OVER; the hole decided when it is) and the shot (for the flight). Throws with none to play */
export function oppShot(view: CourseView, r: YourRound, seed: number): { round: YourRound; shot: Shot } {
  const m = r.match; if (!m || m.holed || holeDecided(r)) throw new Error('oppShot: no shot to play');
  const row = rowOf(r), h0 = view.holes[row.i]; if (!h0) throw new Error(`oppShot: no hole ${row.i}`);
  const hole = holeFrom(h0, MATCH_TEES), stroke = m.strokes + 1, rr = oppStream(seed, r, row.i, stroke), k = chooseShot(m.lie, m.ball, hole, m.sk, m.lie === 'tee');
  let to: Pt, lie: Lie, penalty: 0 | 1 = 0, holed = false, landing: Shot['landing'];
  if (k.club === 'putter') {
    const dx = hole.pin.x - m.ball.x, dy = hole.pin.y - m.ball.y, L = Math.hypot(dx, dy), o = putt(rr, skillFor(m.sk, 'putter'), L * TILE_M, 1, true), s = L > 0 ? o.leaveM / TILE_M / L : 0;
    to = o.holed ? { x: hole.pin.x, y: hole.pin.y } : { x: hole.pin.x + dx * s, y: hole.pin.y + dy * s }; lie = o.holed ? 'green' : view.lieAt(to.x, to.y); holed = o.holed;
  } else {
    const o = hitShot(rr, m.sk, m.lie, m.ball, k.aim, k.club, view); to = o.to; lie = o.lie; penalty = o.penalty; landing = o.landing;
  }
  const strokes = m.strokes + 1 + penalty, cap = row.par + PICK_UP_OVER, up = !holed && strokes >= cap;
  const shot: Shot = { golfer: -2, hole: row.i, stroke, t: 0, from: { x: m.ball.x, y: m.ball.y }, to, club: k.club, lie, penalty, holed, ...(landing ? { landing } : {}) };
  const nm: MatchPlay = { ...m, ball: { x: to.x, y: to.y }, lie, strokes: up ? cap : strokes, holed: holed || up };
  return { round: decideHole({ ...r, match: nm }), shot };
}

/** your shot in a match: play/yours.ts playYours, then the match's part: the round is over only when the match is decided (your last putt may still
 *  leave theirs to come), and the hole is decided when it is */
export function playMatchYours(view: CourseView, r: YourRound, sk: number | GameSkills, input: Omit<OwnerInput, 'holeIdx' | 'stroke'>, seed: number): ReturnType<typeof playYours> {
  const o = playYours(view, r, sk, input, seed);
  if (!r.match) return o;
  return { ...o, round: decideHole({ ...o.round, over: false }) };
}
/** on to the next hole of a match (the hole decided): yours (play/yours.ts nextHole) and the opponent's ball on the tee too */
export function matchNextHole(view: CourseView, r: YourRound): YourRound {
  const n = nextHole(view, r); if (n === r || !n.match || !holeDecided(r)) return n;
  const t = holeOf(view, n.holes[n.at]!)?.tee ?? n.ball;
  return { ...n, match: { ...n.match, ball: { x: t.x, y: t.y }, lie: 'tee', strokes: 0, holed: false } };
}
/** "Skip to result": the rest of the match played by the model for both (your shots as the caddie plays them: the suggested club, aim and power, no
 *  meter), to its end. The round, over */
export function skipMatch(view: CourseView, r0: YourRound, sk: number | GameSkills, seed: number): YourRound {
  let r = r0;
  for (let k = 0; k < 4000 && r.match && !r.over; k++) {
    if (holeDecided(r)) { const n = matchNextHole(view, r); if (n === r) break; r = n; continue; }
    const who = matchTurn(view, r);
    if (who === 'opp') { r = oppShot(view, r, seed).round; continue; }
    const t = yourTurn(view, r, sk); if (!t) break;
    r = playMatchYours(view, r, sk, { club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power }, seed).round;
  }
  return r;
}

/** the result of a finished (or abandoned: conceded by you) match: your profile after it (the round in your rounds as a 'match' round, the round
 *  cleared, the rival remembered), the money to you (+ the stake won, - lost, 0 halved), the reputation's change, and the words */
export function settleMatch(p: PlayerProfile, r: YourRound, conceded = false): { profile: PlayerProfile; money: number; rep: number; result: 'w' | 'l' | 'h'; text: string } {
  const m = r.match!, sc = scoreOf(r), result: 'w' | 'l' | 'h' = conceded ? 'l' : sc.result ?? (sc.up > 0 ? 'w' : sc.up < 0 ? 'l' : 'h');
  const money = result === 'w' ? m.stake : result === 'l' ? -m.stake : 0, rep = result === 'w' ? REP_WIN : 0;
  const { round: _r, ...rest } = p; void _r;
  const t = cardTotals(r.card);
  let next: PlayerProfile = t.thru > 0 ? playedRound(rest, { day: r.day, kind: 'match', strokes: t.strokes, par: t.par, holes: t.thru }) : rest;
  next = { ...next, rivals: remember(next.rivals ?? [], m.name, m.hcp, result, money, r.day, m.stake) };
  const f = firstName(m.name);
  const text = conceded ? `You conceded the match to ${f}: -$${m.stake.toLocaleString('en-US')}`
    : result === 'h' ? `Match halved with ${f}: the $${m.stake.toLocaleString('en-US')} stays put`
    : result === 'w' ? `${sc.text.replace('You won', 'You beat ' + f)}: +$${m.stake.toLocaleString('en-US')}` : `${f} beat you ${sc.left > 0 ? `${Math.abs(sc.up)}&${sc.left}` : `${Math.abs(sc.up)} up`}: -$${m.stake.toLocaleString('en-US')}`;
  return { profile: next, money, rep, result, text };
}
/** the rivals after a match with `name`: their record updated (or a new one), newest last, at most RIVALS_MAX */
export function remember(rivals: readonly Rival[], name: string, hcp: number, res: 'w' | 'l' | 'h', money: number, day: number, stake: number): Rival[] {
  const old = rivals.find(x => x.name === name), base: Rival = old ?? { name, hcp, w: 0, l: 0, h: 0, net: 0, last: day, res, stake };
  const nr: Rival = { ...base, hcp, w: base.w + (res === 'w' ? 1 : 0), l: base.l + (res === 'l' ? 1 : 0), h: base.h + (res === 'h' ? 1 : 0), net: base.net + money, last: day, res, stake };
  return [...rivals.filter(x => x.name !== name), nr].slice(-RIVALS_MAX);
}
/** a rival's record as said: "You 2-1 (1 halved) · +$150" */
export function rivalText(x: Rival): string {
  return `You ${x.w}-${x.l}${x.h ? ` (${x.h} halved)` : ''} · ${x.net >= 0 ? '+' : '-'}$${Math.abs(x.net).toLocaleString('en-US')}`;
}
/** a rival's return challenge on `day` (null: none today): the rivals not played for RETURN_AFTER days, each with its chance (RETURN_CHANCE by your
 *  last result), the first that draws; the stake the last one, raised a half after a loss to you, within what both can afford; their last length */
export function returnChallenge(rivals: readonly Rival[], day: number, seed: number, yourMoney: number): Challenge | null {
  for (const x of rivals.slice().reverse()) {
    if (day - x.last < RETURN_AFTER) continue;
    const ch = x.res === 'w' ? RETURN_CHANCE.lost : x.res === 'l' ? RETURN_CHANCE.won : RETURN_CHANCE.halved; // (the chance is theirs: 'w' means they lost)
    if (rng(seed ^ nameSeed(x.name), 0x726976, day)() >= ch) continue;
    const o = opponentOf(x.name, x.hcp, x, day), stake = clampStake(x.res === 'w' ? x.stake * 1.5 : x.stake, yourMoney, o.purse);
    if (!stake) continue;
    return { name: x.name, stake, holes: rng(seed ^ nameSeed(x.name), 0x686f6c, day)() < 0.6 ? 18 : 9, day };
  }
  return null;
}

/** the holes a match of n holes plays on the everyday course (its first n), [] when the course is too short; and the lengths it offers (9 and 18
 *  when it has them; a shorter course: all its holes) */
export function matchHoles(courseHoles: number, n: number): number[] { return courseHoles >= n ? Array.from({ length: n }, (_, i) => i) : []; }
export function matchLengths(courseHoles: number): number[] {
  const out = [9, 18].filter(n => courseHoles >= n);
  return out.length ? out : courseHoles > 0 ? [courseHoles] : [];
}

/** saved rivals, well formed (a bad one dropped); undefined with none */
export function normalizeRivals(x: unknown): Rival[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const n = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const out = x.filter(o => o && typeof o.name === 'string' && o.name && n(o.w) && n(o.l)).slice(-RIVALS_MAX).map((o): Rival => ({
    name: String(o.name).slice(0, 40), hcp: n(o.hcp) ? o.hcp : 20, w: Math.max(0, Math.round(o.w)), l: Math.max(0, Math.round(o.l)), h: n(o.h) ? Math.max(0, Math.round(o.h)) : 0,
    net: n(o.net) ? Math.round(o.net) : 0, last: n(o.last) ? Math.round(o.last) : 0, res: o.res === 'w' || o.res === 'l' ? o.res : 'h', stake: n(o.stake) ? Math.max(0, Math.round(o.stake)) : MIN_STAKE }));
  return out.length ? out : undefined;
}
/** a saved challenge, well formed; undefined with none */
export function normalizeChallenge(x: unknown): Challenge | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const o = x as Partial<Challenge>;
  if (typeof o.name !== 'string' || !o.name || typeof o.stake !== 'number' || !(o.stake >= MIN_STAKE) || typeof o.day !== 'number') return undefined;
  return { name: o.name.slice(0, 40), stake: Math.round(o.stake), holes: o.holes === 9 ? 9 : 18, day: Math.round(o.day) };
}
/** a saved match (YourRound.match), well formed for a round of n holes; undefined when it is not one */
export function normalizeMatch(x: unknown, n: number): MatchPlay | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const o = x as Partial<MatchPlay>, f = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const sk = o.sk as Partial<GameSkills> | undefined;
  if (typeof o.name !== 'string' || !f(o.stake) || !o.ball || !f(o.ball.x) || !f(o.ball.y) || !sk || ![sk.driving, sk.irons, sk.short, sk.putting].every(f)) return undefined;
  const LIES: readonly Lie[] = ['tee', 'fairway', 'rough', 'fescue', 'bunker', 'green', 'water', 'out'];
  const res = (Array.isArray(o.res) ? o.res : []).filter(v => v === 1 || v === 0 || v === -1).slice(0, n) as HoleWin[];
  const ocard = (Array.isArray(o.ocard) ? o.ocard : []).filter(f).map(Math.round).slice(0, res.length);
  while (ocard.length < res.length) ocard.push(0);
  return { name: o.name.slice(0, 40), hcp: f(o.hcp) ? o.hcp : 20, sk: { driving: sk.driving!, irons: sk.irons!, short: sk.short!, putting: sk.putting! }, look: f(o.look) ? Math.max(0, Math.round(o.look)) : 0,
    stake: Math.max(0, Math.round(o.stake)), ball: { x: o.ball.x, y: o.ball.y }, lie: LIES.includes(o.lie as Lie) ? o.lie as Lie : 'rough', strokes: f(o.strokes) ? Math.max(0, Math.round(o.strokes)) : 0,
    holed: o.holed === true, res, ocard, ...(o.back === true ? { back: true } : {}) };
}

/** the match bar's view: the opponent, the stake, the score, who plays, their strokes on the hole and its result so far, each hole's result */
export interface MatchView { name: string; hcp: number; stake: number; score: MatchScore; turn: 'you' | 'opp' | null; oppStrokes: number; oppHoled: boolean; res: HoleWin[]; ocard: number[]; card: CardRow[] }
export function matchView(view: CourseView | null, r: YourRound): MatchView | null {
  const m = r.match; if (!m) return null;
  return { name: m.name, hcp: m.hcp, stake: m.stake, score: scoreOf(r), turn: view ? matchTurn(view, r) : null, oppStrokes: m.strokes, oppHoled: m.holed, res: m.res, ocard: m.ocard, card: r.card };
}

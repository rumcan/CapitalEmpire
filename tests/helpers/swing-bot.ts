// T334 (#960): a scripted golfer for the play pass: it swings the 3-click meter like a person (click timing with a bias and a spread, in seconds, so a faster
// meter is harder), picks the caddie's club, aim and power for every shot (play/yours.ts yourTurn), and plays whole rounds through your own round's model
// (playYours: the one shot model the owner's shots use). The tests use it to check the mechanics over many shots; scripts/dev/play-pass-sim.ts and
// scripts/dev/play-pass-playtest.mjs use it to measure distances, scores and pace on the town course. Pure TS, deterministic from its seeds.
import { TILE_M } from '../../src/game/golf/types';
import { meterMark, METER, swingTime, MIN_SWING_POWER, rng, gauss, skillFor } from '../../src/game/golf/play';
import type { CourseView, Club, OwnerInput, OwnerTurn, Shot, ShotSkill, SwingOutcome } from '../../src/game/golf/play';
import { nextHole, playYours, startRound, yourTurn, type YourRound } from '../../src/game/golf/play/yours';

/** how a person clicks: the click timing error (seconds: its bias, + late, and its spread) and the share of power he misses by (the second click) */
export interface Human { biasS: number; sdS: number; powerSd: number }
/** three people: a novice is late and loose, a club golfer steadier, a sharp one close to the line */
export const HUMANS: Readonly<Record<'novice' | 'club' | 'sharp', Human>> = {
  novice: { biasS: 0.03, sdS: 0.09, powerSd: 0.07 },
  club: { biasS: 0.02, sdS: 0.06, powerSd: 0.045 },
  sharp: { biasS: 0.01, sdS: 0.035, powerSd: 0.025 },
};

/** one swing of a person: wants `want` of the club's carry (a putt: of its length to the hole); returns the meter's outcome. The power click lands where the marker
 *  is `powerSd` (a share of the power) off the wanted mark, the accuracy click is the person's timing error in seconds times the marker's speed (the marker moves
 *  1 / swingTime(skill) meter units a second): early (negative error) is a positive acc (a pull), late a negative one (a push) */
export function botSwing(r: () => number, h: Human, skill: number, want: number, putting: boolean, boost = 0): SwingOutcome {
  const speed = 1 / swingTime(skill), mark = meterMark(want, putting);
  const power = Math.min(METER.top, Math.max(MIN_SWING_POWER, mark * (1 + gauss(r) * h.powerSd)));
  const e = h.biasS + gauss(r) * h.sdS;
  return { power, acc: Math.min(METER.top, Math.max(METER.low, -e * speed)), boost };
}

/** a shot of a round, with what the tests and the sim measure */
export interface BotShot { hole: number; stroke: number; club: Club; shot: Shot; carryM: number | null; totalM: number | null; lieBefore: string; par: number; distM: number }
/** a round played by the bot: the card (strokes per hole), the shots, and the totals */
export interface BotRound { strokes: number[]; pars: number[]; shots: BotShot[]; total: number; par: number; putts: number; penalties: number; gir: number; fairways: number; fairwayHoles: number }

/** plays every hole of `view` for a golfer of skills `sk` (his part of the game each: ShotSkill), from the first tee to the last cup, with the human clicking: the
 *  caddie's club, aim and power each time (yourTurn), swung through botSwing, played through playYours. `mod` may add fields to each input (the tests put the
 *  conditions there: env, shape). `day` and `seed` pick the round's streams */
export function botRound(view: CourseView, sk: ShotSkill, h: Human, seed: number, day = 1, mod?: (turn: OwnerTurn, r: YourRound) => Partial<OwnerInput>, holes?: number[]): BotRound {
  const idx = holes ?? view.holes.map((_, i) => i), r0 = startRound(view, idx, day);
  if (!r0) throw new Error('botRound: no holes');
  let r: YourRound = r0;
  const sw = rng(seed, 0x626f74, day), shots: BotShot[] = [], strokes: number[] = [];
  let putts = 0, penalties = 0, gir = 0, fairways = 0, fairwayHoles = 0, guard = 0;
  while (!r.over && guard++ < 2000) {
    const t = yourTurn(view, r, sk);
    if (!t) { r = nextHole(view, r); continue; }
    const putting = t.suggested.club === 'putter', skill = skillFor(sk, t.suggested.club);
    const swing = botSwing(sw, h, skill, t.suggested.power, putting);
    const input = { club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power, swing, ...(mod ? mod(t, r) : {}) };
    const o = playYours(view, r, sk, input, seed);
    const m = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y) * TILE_M;
    const s = o.shot;
    shots.push({ hole: t.hole, stroke: t.stroke, club: s.club, shot: s, carryM: s.landing ? m(s.from, s.landing.at) : null, totalM: s.penalty ? null : m(s.from, s.to), lieBefore: t.lie, par: t.par, distM: t.distM });
    if (s.club === 'putter') putts++;
    if (s.penalty) penalties++;
    // a fairway found: the tee shot of a par 4 or 5 coming to rest on the fairway (or the green)
    if (t.stroke === 1 && t.par > 3) { fairwayHoles++; if (s.lie === 'fairway' || s.lie === 'green') fairways++; }
    // a green in regulation: on the green with two strokes to spare (the stroke that gets there is par - 2 or fewer)
    if (s.lie === 'green' && s.club !== 'putter' && !s.penalty && t.stroke <= t.par - 2) gir++;
    r = o.round;
    if (r.holed) strokes.push(r.card[r.at]!.strokes);
  }
  const pars = r.card.map(c => c.par), total = strokes.reduce((a, b) => a + b, 0), par = pars.reduce((a, b) => a + b, 0);
  return { strokes, pars, shots, total, par, putts, penalties, gir, fairways, fairwayHoles };
}

/** the mean of a list */
export const mean = (xs: number[]): number => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
/** the p-th percentile (0..1) of a list (nearest rank) */
export function pct(xs: number[], p: number): number { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]! : 0; }

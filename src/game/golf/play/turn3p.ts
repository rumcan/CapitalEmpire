// T418 (docs/CINDERLINKS-PORT.md, the host half): the owner's turn as the view from behind the golfer is sent it (protocol3p.ts TurnMsg). Everything here
// is read from the one golf model, never worked out again: the turn itself is LiveGroup's (live.ts OwnerTurn), the lie's finer kind lies.ts', the slope
// under the ball and the wind now conditions.ts' (envOf, as the engine builds them for the shot panel), and every club's kit mods.ts' applyMods (through
// kitOf and carryFor, the very calls shotOutcome makes for a strike, with the same moment: the lie, a tee shot, the driver off the deck, the last hole).
// The few numbers the panel never showed before (the scatter as a distance, the mishit chance) are read off the model's own constants (shot.ts
// SHOT_SCATTER and MISHIT, which hitShot reads), so they move when the model does.
// Positions cross the bridge in the view's frame (protocol3p.ts toView): metres from the course's centre, x east, y south.
// Pure TS, no DOM.
import type { Club, CourseView, Lie, Pt } from './types';
import type { OwnerTurn } from './live';
import { CLUB_ORDER, CLUB_RUN, MISHIT, SHOT_SCATTER, carryFor, type ShotSkill } from './shot';
import { CLUB_BASE, hasMech, kitOf, type ModCtx } from './mods';
import { LIE_FX, kindOfLie, slopeEffect, lieKindFor } from './lies';
import { envOf, previewShot, type ShotEnv } from './conditions';
import { LOFT, launchWord } from './bag';
import { markerSpeed, sweetSpot } from './swing';
import { spinCap } from './spin';
import type { HeightAt } from './roll';
import type { WindNow } from './wind';
import type { Frame3p } from './export3p';
import { PROTOCOL_V, toView, type ClubChoice, type TurnMsg, type Unlocks } from './protocol3p';

/** the clubs a golfer without a bag plays (a field golfer, a save from before the bag): the model's original seven and the putter, longest first */
export const PLAIN_CLUBS: readonly Club[] = ['driver', 'wood3', 'iron4', 'iron6', 'iron8', 'pw', 'sw', 'putter'];

/** the course's centre in tiles: the exporter's frame (export3p.ts frame3p) or a tile point */
export const centreOf = (f: Frame3p | Pt): Pt => 'cx' in f ? { x: f.cx, y: f.cy } : { x: f.x, y: f.y };

/** what turnMsg reads besides the turn: the owner's skills as the model plays them (GameSkills with his bag's and cards' mods in them: golf/player.ts
 *  gameSkills with bag.ts bagGear; a plain number for a golfer without), the course (its lie and finer lie readers), the ground's height (absent: flat),
 *  the wind now (absent: calm), and whether this is the round's last hole (the moment `last` of a card) */
export interface TurnState { turn: OwnerTurn; skills: ShotSkill; view: CourseView; height?: HeightAt | null; wind?: WindNow | null; last?: boolean }

/** the moment of a shot with `club` from `lie` (live.ts shotOutcome builds the same one for the strike) */
export const momentOf = (lie: Lie, club: Club, last = false): ModCtx => ({ lie, tee: lie === 'tee', deck: club === 'driver' && lie !== 'tee', last, follow: false });

/** what the owner may do beyond a plain swing. Today only the mechanics are earned (cards: mods.ts hasMech); a shape and spin are open to every golfer: T443 adds their unlocks */
export function unlocksOf(sk: ShotSkill): Unlocks {
  return { shapes: true, spin: true, airspin: hasMech(sk, 'airspin'), boost: hasMech(sk, 'boost') };
}

/** one club's choice for the turn: its kit for this moment, its full carry (m), what that plays in the lie, the slope and the wind along (ux, uy) (env), the
 *  scatter at that carry (two standard deviations either side, and along), the chance of a mishit, the meter's sweet spot and marker speed, the launch, the
 *  run and the spin this lie lets on */
export function clubChoice(sk: ShotSkill, club: Club, lie: Lie, env: ShotEnv | null, ux: number, uy: number, last = false): ClubChoice {
  const putter = club === 'putter', mctx = momentOf(lie, club, last), kit = kitOf(sk, club, mctx);
  const carryM = putter ? 0 : carryFor(sk, club, mctx);
  const kind = env?.lie ?? kindOfLie(lie), lx = LIE_FX[kind];
  const playsM = putter ? 0 : previewShot(club, carryM, ux, uy, env, null, kit.wind, kit.slope).carryM;
  // (hitShot's scatter, one standard deviation: of the distance a share of the carry, of the direction degrees; both times the spread of the lie, the slope
  // and his kit. The swing meter's spread and a picked shape come on top at the strike; the sand wedge's splash from a greenside bunker (1.6) is left out)
  const sl = slopeEffect(env?.slope && kit.slope !== 1 ? { up: env.slope.up * kit.slope, across: env.slope.across * kit.slope } : env?.slope);
  const spread = (env ? lx.spread * sl.spread : 1) * kit.spread, un = 1 - kit.skill;
  const sideDeg = (SHOT_SCATTER.deg0 + SHOT_SCATTER.degK * un) * spread;
  const scatterM = putter ? 0 : 2 * playsM * Math.tan(sideDeg * Math.PI / 180);
  const longM = putter ? 0 : 2 * (SHOT_SCATTER.dist0 + SHOT_SCATTER.distK * un) * playsM * spread;
  const mishitP = putter ? 0 : Math.max(0, MISHIT.base + MISHIT.skillK * un * un + (env ? lx.wild : 0) + kit.mishit);
  return {
    club, carryM, scatterM, kit, playsM, longM, mishitP,
    sweet: sweetSpot(kit.skill, 0, kit.sweet, kit.speed), speed: markerSpeed(kit.skill, kit.speed),
    loftDeg: LOFT[club], launch: putter ? '' : launchWord(LOFT[club]),
    run: putter ? 1 : CLUB_RUN[club] * kit.roll / (CLUB_BASE[club]?.roll ?? 1), // (bag.ts bagView's run: what a shot with conditions rolls by)
    backspin: spinCap(club, lie, 0, -1, kind, kit.spin), topspin: spinCap(club, lie, 0, 1, kind, kit.spin),
    shapes: !putter, spin: !putter,
  };
}

/** the clubs in his bag (GameSkills.clubs), in bag order; a golfer without a bag: the plain clubs */
export function bagClubs(sk: ShotSkill): Club[] {
  const bag = typeof sk === 'number' ? undefined : sk.clubs;
  return bag ? CLUB_ORDER.filter(c => bag.includes(c)) : [...PLAIN_CLUBS];
}

/** the owner's turn for the view (protocol3p.ts TurnMsg): LiveGroup's turn in the view's frame, his finer lie, the slope under his ball and the wind now (a
 *  putt is struck in neither: the slope is then read toward the pin for the card and the wind is still sent), and a choice for every club in his bag */
export function turnMsg(st: TurnState, frame: Frame3p | Pt): TurnMsg {
  const t = st.turn, c = centreOf(frame), wind: WindNow = st.wind ? { mph: st.wind.mph, from: st.wind.from } : { mph: 0, from: 0 };
  // the line the shot is read along: the suggested aim (the pin's when the aim is on the ball)
  let aim = t.suggested.aim; if (Math.hypot(aim.x - t.ball.x, aim.y - t.ball.y) < 1e-9) aim = t.pin;
  const env = envOf(wind.mph > 0 ? wind : null, st.view.kindAt, st.height ?? null, t.ball, t.lie, aim);
  const dx = aim.x - t.ball.x, dy = aim.y - t.ball.y, L = Math.hypot(dx, dy), ux = L > 1e-9 ? dx / L : 1, uy = L > 1e-9 ? dy / L : 0;
  const clubs = bagClubs(st.skills).map(k => clubChoice(st.skills, k, t.lie, k === 'putter' ? null : env, ux, uy, st.last === true));
  return {
    v: PROTOCOL_V, t: 'turn', golfer: t.golfer, holeIdx: t.holeIdx, hole: t.hole, par: t.par, stroke: t.stroke, at: t.t,
    lie: t.lie, lieKind: env.lie ?? lieKindFor(st.view.kindAt, t.ball, t.lie), ball: toView(t.ball, c), pin: toView(t.pin, c), distM: t.distM,
    wind, slope: env.slope ?? { up: 0, across: 0 }, clubs,
    suggested: { club: t.suggested.club, aim: toView(t.suggested.aim, c), power: t.suggested.power },
    can: unlocksOf(st.skills),
  };
}

// #1344 (the owner, 2026-11-15: "add some info about the ball you just hit. center top. how far it went, spin, ball speed and swing speed. things that you can
// improve"): the practice readout, a launch monitor's strip for the last ball. The shot model has no speeds and no rpm, so they are derived here, believably and
// deterministically, from what it does have: the club (its loft), the power played (the boost in it), the club's full carry for the golfer, the strike (a mishit and
// the share of its carry it kept, a flier: shot.ts Strike), the lie, the shape picked and the spin tapped in. The carry, roll, offline and apex are the shot's own.
//
// The numbers (a mid-handicap, skill about 0.45, at full power from a tee):
// - club speed (the head at impact) = the club's full carry for him (m) x ballPerM(loft) / smashOf(loft) x the power played: a driver about 150 km/h (93 mph), a
//   7-iron about 122 km/h, a sand wedge about 95 km/h; a 30% chip a third of that.
// - smash (ball speed over club speed) = smashOf(loft): 1.5 - 0.0055 x loft (a driver 1.44, a 7-iron 1.31, a sand wedge 1.20), x 0.84..0.96 on a mishit (the worse
//   the mishit, the lower), x the square root of the still-air flight over the swing's (the lie's grass, the slope, the scatter: about 0.94 from the rough), x 0.6
//   out of a greenside splash. Ball speed = club speed x smash.
// - launch (degrees) = 7 + 0.42 x loft (a driver 11.4, a 7-iron 21.3, a sand wedge 29.7), +/- 3 for a high or low flight picked, -4 thin, +6 out of a splash.
// - backspin (rpm) = 1000 + 165 x loft at full power (a driver 2,730, a 7-iron 6,610, a pitching wedge 8,590, a sand wedge 9,910), x (0.55 + 0.45 x power) for a
//   part swing, x the lie's share (0.4 + 0.6 x spin.ts SPIN_LIE), x 0.5 for a flier, x 0.8 for a mishit, x 1.12 high / 0.85 low flight, x (1 + 0.6 back - 0.5 top)
//   for the spin tapped in the air.
// - side spin (rpm, + a fade, - a draw) = (0.55 x the curve picked + 0.6 x the side spin tapped + a hook's or slice's 0.7 + a mishit's curve) x (2600 - 18 x loft),
//   x the part swing's share.
// Speeds are in mph, as the view's wind is; distances in metres, as everywhere in the game. Pure TS, no DOM, no draws.
import { TILE_M } from '../types';
import type { Club, Lie, Pt } from './types';
import { LOFT } from './bag';
import { SPIN_LIE, type SpinEffect } from './spin';
import { TAP_BOOST, swingEffect, type SwingOutcome } from './swing';
import type { ShotShape } from './shape';
import type { ShotEnv } from './conditions';
import type { Strike } from './shot';
import { windOnShot } from './wind';
import { apexOf } from './shot3p';

/** what the readout shows: a full shot (the range), a chip or a bunker shot (the short game area), or a putt */
export type BallKind = 'full' | 'chip' | 'putt';
/** km/h in a mph */
export const KMH_PER_MPH = 1.609344;

/** the ball speed (km/h) per metre of a full swing's still-air carry for a club's loft (a driver 1.12, a 7-iron 1.31, a sand wedge 1.62: a lofted club spends its speed on height and spin) */
export const ballPerM = (loft: number): number => 1.1 + 0.00018 * loft * loft;
/** a clean strike's smash factor (ball speed / club speed) for a loft: a driver 1.44, a 7-iron 1.31, a pitching wedge 1.25, a sand wedge 1.20 */
export const smashOf = (loft: number): number => Math.min(1.5, Math.max(1.15, 1.5 - 0.0055 * loft));
/** the launch (degrees) of a clean full strike for a loft: a driver 11.4, a 7-iron 21.3, a sand wedge 29.7 */
export const launchOf = (loft: number): number => 7 + 0.42 * loft;
/** a clean full strike's backspin (rpm) for a loft: a driver 2,730, a 7-iron 6,610, a pitching wedge 8,590, a sand wedge 9,910 */
export const backRpmOf = (loft: number): number => 1000 + 165 * loft;
/** the side spin (rpm) of a full curve's worth of side for a loft (a driver 2,410, a sand wedge 1,630) */
export const sideRpmOf = (loft: number): number => 2600 - 18 * loft;

/** what shotOutcome reports of how the ball was played (live.ts shotOutcome `played`) */
export interface Played { power: number; fullM: number; boost: number; held: boolean; strike: Strike | null; fx: SpinEffect | null }
/** the ball as the practice driver knows it once it rests (tiles for points): the kind, club, lie played from, where it was struck from, aimed at, the pin, where it
 *  landed (null: a putt) and stopped, its rest's lie, whether it was holed, a penalty, and what the model reports of the strike */
export interface LaunchIn { kind: BallKind; club: Club; lie: Lie; from: Pt; aim: Pt; pin: Pt; land: Pt | null; rest: Pt; restLie: Lie; holed: boolean; penalty: 0 | 1;
  played: Played; shape: ShotShape | null; sw: SwingOutcome | null; env: ShotEnv | null }

/** the readout's numbers (metres, mph, degrees, rpm), rounded as shown, and one or two tips. A putt has no speeds, spin, launch or apex; a chip has no speeds */
export interface LastBall { kind: BallKind; club: Club;
  /** carry, roll (below 0: it spun back) and total (m) */ carryM: number; rollM: number; totalM: number;
  /** how far off the aim's line it stopped (m, + right as he faced it) */ offM: number;
  /** how far from the pin it stopped (m; 0 holed) */ pinM: number; holed: boolean;
  /** a full shot's ball and club speed (mph) and smash */ ballMph?: number; clubMph?: number; smash?: number;
  /** a full shot or a chip: the launch (degrees), the apex (m), the backspin (rpm), the side spin (rpm, + fade, - draw) */ launchDeg?: number; apexM?: number; backRpm?: number; sideRpm?: number;
  /** a putt: its length (m), how far short (-) or long (+) of the cup it stopped, and how far off the line (+ right) */ puttM?: number; leaveM?: number; lineM?: number;
  tips: string[] }

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const r1 = (v: number): number => Math.round(v * 10) / 10 || 0;
const r50 = (v: number): number => Math.round(v / 50) * 50 || 0;
const m1 = (v: number): string => String(Math.abs(v) >= 10 ? Math.round(Math.abs(v)) : Math.round(Math.abs(v) * 10) / 10);
const WOODS: readonly Club[] = ['driver', 'wood3', 'wood5', 'hybrid'];

/** the readout for a ball (see the file's head). Pure: the same ball always gives the same numbers */
export function lastBall(b: LaunchIn): LastBall {
  const tilesM = (p: Pt, q: Pt) => Math.hypot(q.x - p.x, q.y - p.y) * TILE_M;
  // the aim's line (the pin's when he aimed at the ball) as he faced it: along it, and its right (x east, y south: the right of (ux, uy) is (-uy, ux))
  let ux = b.aim.x - b.from.x, uy = b.aim.y - b.from.y, L = Math.hypot(ux, uy);
  if (L < 1e-9) { ux = b.pin.x - b.from.x; uy = b.pin.y - b.from.y; L = Math.hypot(ux, uy); }
  if (L < 1e-9) { ux = 1; uy = 0; L = 1; }
  ux /= L; uy /= L;
  const along = (p: Pt) => ((p.x - b.from.x) * ux + (p.y - b.from.y) * uy) * TILE_M, across = (p: Pt) => ((p.x - b.from.x) * -uy + (p.y - b.from.y) * ux) * TILE_M;
  // the pin's line: how far past (+) or short (-) of the pin it stopped, and how far off it (+ right)
  let px = b.pin.x - b.from.x, py = b.pin.y - b.from.y; const P = Math.hypot(px, py) || 1; px /= P; py /= P;
  const pinPast = b.holed ? 0 : ((b.rest.x - b.from.x) * px + (b.rest.y - b.from.y) * py) * TILE_M - P * TILE_M, pinWide = b.holed ? 0 : ((b.rest.x - b.from.x) * -py + (b.rest.y - b.from.y) * px) * TILE_M;
  const totalM = tilesM(b.from, b.rest), pinM = b.holed ? 0 : tilesM(b.rest, b.pin), tips: string[] = [];
  if (b.kind === 'putt') {
    if (b.holed) tips.push('Holed it!');
    else {
      if (pinPast < -0.15) tips.push(`Never up, never in: ${m1(pinPast)} m short, a firmer stroke`);
      else if (pinPast > 1.2) tips.push(`${m1(pinPast)} m past: a softer stroke`);
      if (Math.abs(pinWide) > 0.25) tips.push(`Missed ${m1(pinWide)} m ${pinWide < 0 ? 'left' : 'right'}: aim a touch ${pinWide < 0 ? 'right' : 'left'}`);
      if (!tips.length) tips.push('Good pace: an easy one back');
    }
    return { kind: 'putt', club: b.club, carryM: 0, rollM: r1(totalM), totalM: r1(totalM), offM: r1(pinWide), pinM: r1(pinM), holed: b.holed,
      puttM: r1(P * TILE_M), leaveM: r1(pinPast), lineM: r1(pinWide), tips: tips.slice(0, 2) };
  }
  const land = b.land ?? b.rest, carryM = tilesM(b.from, land), rollM = along(b.rest) - along(land), offM = across(b.rest);
  const loft = LOFT[b.club], pl = b.played, st = pl.strike, mis = !!st?.mis, mf = st ? st.mf : 1, flier = !!st?.flier;
  const splash = b.lie === 'bunker' && (b.club === 'sw' || b.club === 'lw') && carryM < 40;
  // the club's head speed: the full swing's (his full carry's ball speed over a clean smash) times the power played (the boost in it)
  const pw = clamp(pl.power, 0.05, 1.4), s0 = smashOf(loft), clubKmh = pl.fullM * ballPerM(loft) / s0 * pw;
  // the smash: clean, lowered by a mishit (0.84 at its worst .. 0.96), and by the still-air flight against the swing's (the grass, the slope, the scatter), or a splash's
  const misF = mis ? 0.84 + 0.12 * clamp((mf - 0.35) / 0.35, 0, 1) : 1, dev = st && pl.fullM > 0 ? st.stillM / (pl.fullM * pw * mf) : 1;
  const smash = splash ? s0 * 0.6 : s0 * misF * Math.sqrt(clamp(dev, 0.6, 1.15)), ballKmh = clubKmh * smash;
  const flight = b.shape ? b.shape.flight : 0, fx = pl.fx;
  const launch = launchOf(loft) + 3 * flight - (mis ? 4 : 0) + (splash ? 6 : 0) - (flier ? 1 : 0);
  const apexM = apexOf(b.club, carryM, { club: b.club, aim: b.aim, power: pl.power, ...(b.shape ? { shape: b.shape } : {}) });
  const part = 0.55 + 0.45 * clamp(pw, 0, 1.2);
  const back = backRpmOf(loft) * part * (0.4 + 0.6 * (SPIN_LIE[b.lie] ?? 1)) * (flier ? 0.5 : 1) * (mis ? 0.8 : 1) * (flight > 0 ? 1 + 0.12 * flight : 1 + 0.15 * flight) * (fx ? 1 + 0.6 * fx.back - 0.5 * fx.top : 1);
  const sw = b.sw ? swingEffect(b.sw, 0.5, false) : null, hook = sw ? (sw.shape === 'hook' ? -0.7 : sw.shape === 'slice' ? 0.7 : 0) : 0;
  const offDeg = totalM > 1 ? Math.atan2(offM, Math.max(1, along(b.rest))) * 180 / Math.PI : 0;
  const side = (b.shape ? 0.55 * b.shape.curve : 0) + (fx ? 0.6 * fx.side : 0) + hook + (mis ? 0.5 * clamp(offDeg / 12, -1, 1) : 0);
  const out: LastBall = { kind: b.kind, club: b.club, carryM: r1(carryM), rollM: r1(rollM), totalM: r1(totalM), offM: r1(offM), pinM: r1(pinM), holed: b.holed,
    launchDeg: r1(launch), apexM: r1(apexM), backRpm: Math.max(0, r50(back)), sideRpm: r50(clamp(side, -1.4, 1.4) * sideRpmOf(loft) * part), tips };
  if (b.kind === 'full') { out.ballMph = Math.round(ballKmh / KMH_PER_MPH); out.clubMph = Math.round(clubKmh / KMH_PER_MPH); out.smash = Math.round(smash * 100) / 100; }
  // ---- the tips: the first two that apply, the most telling first
  const wood = WOODS.includes(b.club), curve = b.shape?.curve ?? 0;
  if (b.holed) tips.push(b.kind === 'chip' ? 'Chipped in!' : 'In the hole!');
  if (b.penalty) tips.push(b.restLie === 'water' ? 'Found the water: aim away from it' : 'Out of bounds: aim back inside the line');
  if (mis) tips.push(`${wood ? 'Struck low on the face' : 'Caught it thin'}: smash ${smash.toFixed(2)} (good is ${s0.toFixed(2)})`);
  if (flier) tips.push('A flier from the long grass: no spin, it ran on');
  if (b.kind === 'chip') {
    if (!b.holed && !b.penalty) {
      if (pinPast > 1.5) tips.push(`Ran ${m1(pinPast)} m past: land it shorter, or tap Down for backspin`);
      else if (pinPast < -1.5) tips.push(`Came up ${m1(pinPast)} m short: carry it a little further`);
      if (Math.abs(pinWide) > 1.5) tips.push(`Missed the line ${m1(pinWide)} m ${pinWide < 0 ? 'left' : 'right'}`);
    }
  } else {
    // the boost: tapped, but let go long after the last tap (the level had drained)
    if (pl.held && pl.boost > 0 && pl.boost < 0.5 * TAP_BOOST.plain) tips.push('Boost had faded: release at the top of your taps');
    if (!b.penalty && Math.abs(offM) >= Math.max(4, 0.06 * totalM)) {
      const left = offM < 0, shaped = (left && curve < -0.1) || (!left && curve > 0.1);
      tips.push(shaped ? `The ${left ? 'draw' : 'fade'} finished ${m1(offM)} m ${left ? 'left' : 'right'}: aim further ${left ? 'right' : 'left'}`
        : left ? `Pulled ${m1(offM)} m left: early release` : `Pushed ${m1(offM)} m right: late release`);
    }
    // the wind: a high-spinning ball balloons into a headwind
    const w = b.env?.wind ? windOnShot(b.env.wind, ux, uy) : null;
    if (w && w.tail <= -8 && back > backRpmOf(loft) * 0.95 && loft >= 24) tips.push('Too much backspin for the wind: a lower flight, or tap Up');
    const aimM = L * TILE_M, short = carryM - aimM;
    if (!b.penalty && !mis && aimM > 20 && Math.abs(short) > Math.max(4, 0.07 * aimM)) tips.push(short < 0 ? `Carried ${m1(short)} m short of your aim: more power or more club` : `Flew ${m1(short)} m past your aim: less power or less club`);
  }
  if (!tips.length) tips.push(b.kind === 'chip' ? 'Great touch!' : 'Great strike!');
  out.tips = tips.slice(0, 2);
  return out;
}
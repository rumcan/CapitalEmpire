// T418 (docs/CINDERLINKS-PORT.md, the host half): one decided stroke as the view from behind the golfer is sent it (protocol3p.ts ShotMsg): the flight's
// samples, the bounces, the roll and the rest, for the owner's shot or anyone's.
//
// WHAT IS THE MODEL'S AND WHAT IS DRAWN. The model (live.ts shotOutcome / shot.ts hitShot, and a field golfer's round.ts strike) decides a stroke as points
// only: where it was struck from (Shot.from), where it first landed and on what (Landing.at, .lie), where it came to rest and on what (Landing.rest,
// .restLie; Shot.to and .lie, the drop, after a penalty), a spin back's check point (Landing.check) and for a putt only the rest. It has no height, no time
// and no path between. So:
// - the model's own numbers, sent exactly: the start, the first landing, the check, the rest, every lie, holed, the penalty and the drop;
// - drawn to fit them: the flight's height (an apex by the club's loft, higher or lower with a picked flight), its bend (the shape's and the side spin's
//   curve and the wind's drift, the same sums hitShot adds to the line, worked again from the input so the ball starts on its start line and bends onto the
//   model's landing), its time (a hang time from the apex), and the bounces and roll between the landing and the rest (roll.ts BallRoll: the very bounce and
//   roll the top view plays, with the ground's cross slope bending the path; a spin back skids to the check and comes back). Every drawn curve is pinned
//   to the model's points at both ends, so the view lands and stops the ball exactly where the model does.
// Positions are in the view's frame (protocol3p.ts toView): metres from the course's centre, x east, y south; heights in metres above the ground.
// Pure TS, no DOM.
import { TILE_M } from '../types';
import type { Club, CourseView, Landing, Lie, Pt, Shot } from './types';
import type { OwnerInput } from './live';
import { kitOf } from './mods';
import { LIE_FX } from './lies';
import { LOFT } from './bag';
import { curveOf, readSpin, spinEffect } from './spin';
import { readShape, shapeEffect } from './shape';
import { windEffect, type WindNow } from './wind';
import { BallRoll, type HeightAt, type RollPoint } from './roll';
import type { ShotSkill } from './shot';
import type { Frame3p } from './export3p';
import { PROTOCOL_V, toView, type ShotMsg, type ViewPt, type ViewPt3 } from './protocol3p';
import { centreOf } from './turn3p';

/** the flight's apex as a share of its length by the club's loft (degrees): APEX.k0 + APEX.k1 * loft (a driver about 12%, a 7-iron 22%, a sand wedge 30%),
 *  times APEX.high or APEX.low with a picked flight. Drawn: the model has no height */
export const APEX = { k0: 0.08, k1: 0.004, high: 1.25, low: 0.7 } as const;
/** the flight's profile: the ball rises faster than it falls (u (1 - u)^skew, its peak at 1 / (1 + skew) of the way), and slows along the ground (the share
 *  of the way at time share τ: (1 + drag) τ - drag τ²). Drawn */
export const PROFILE = { skew: 0.7, drag: 0.3 } as const;
/** the hang time (s): HANG.k times the time a ball takes to rise to the apex and fall again in a vacuum (sqrt(8 H / g)), at least HANG.min. Drawn */
export const HANG = { k: 1.15, min: 0.6, g: 9.81 } as const;
/** the most the drawn bend may turn the start line off the chord (radians): a wild input never draws a loop */
const BEND_MAX = 0.5;
/** a putt's roll time (s): PUTT_T.t0 + PUTT_T.k sqrt(metres); a spin back's: BACK_T.t0 + BACK_T.k sqrt(metres). Drawn */
export const PUTT_T = { t0: 0.6, k: 0.9 } as const, BACK_T = { t0: 0.35, k: 0.3 } as const;

/** one stroke as the model decided it, and what is known of how it was struck: the shot (LiveGroup.play's return, or one of a plan's shots), the owner's input
 *  (his shape, spin and the wind he struck in: the bend; absent for anyone else), his skills (how much of a shape he pulls off; absent: the bend of the spin
 *  and the wind only), the hole's number (1-based; absent: the shot's hole index + 1), the course (the bounces' surfaces; absent: the landing's lie), the
 *  ground's height (the roll's bend; absent: flat) and, for a field golfer, the wind his day was played in (absent: the input's, else calm) */
export interface ShotOutcome { shot: Shot; input?: Omit<OwnerInput, 'holeIdx' | 'stroke'> | null; skills?: ShotSkill | null; hole?: number;
  view?: CourseView | null; height?: HeightAt | null; wind?: WindNow | null }

const vp = (p: Pt, c: Pt): ViewPt => toView(p, c);

/** the drawn bend of a full shot's flight: the angle (radians, + right as the golfer faces the shot) the ball curves through from its start line onto the
 *  model's landing: the shape's curve and the side spin's (hitShot adds both to the line) and the wind's drift (hitShot moves the landing by it), for a shot of
 *  carryM metres along (ux, uy) (tiles' frame) */
export function bendOf(o: ShotOutcome, club: Club, carryM: number, ux: number, uy: number): number {
  const i = o.input, env = i?.env, kind = env?.lie, sk = o.skills ?? null;
  let b = 0, flight = 1;
  const shape = i?.shape ? readShape(i.shape) : null;
  if (shape) {
    const kit = sk !== null ? kitOf(sk, club) : null, fx = shapeEffect(shape, club, carryM, kit ? kit.skill : 0.5, kit);
    b += fx.curve; flight = fx.wind;
  }
  const sp = i?.spin ? spinEffect(readSpin(i.spin), club, 'fairway', kind, sk !== null ? kitOf(sk, club).spin : 1) : null;
  if (sp && sp.amount > 0) b += curveOf(sp, carryM);
  const wind = env?.wind ?? o.wind ?? null;
  if (wind) {
    const kitW = sk !== null ? kitOf(sk, club).wind : 1, w = windEffect(wind, club, ux, uy, (kind ? LIE_FX[kind].high : 1) * flight * kitW);
    b += Math.atan(w.drift);
  }
  return Math.max(-BEND_MAX, Math.min(BEND_MAX, b));
}

/** the drawn apex (m) of a full shot of carryM metres with `club` (and the input's picked flight) */
export function apexOf(club: Club, carryM: number, input?: ShotOutcome['input']): number {
  const sh = input?.shape ? readShape(input.shape) : null, f = sh && sh.flight > 0 ? 1 + (APEX.high - 1) * sh.flight : sh && sh.flight < 0 ? 1 + (APEX.low - 1) * -sh.flight : 1;   // (J5f: in proportion to the flight's amount)
  return carryM * (APEX.k0 + APEX.k1 * LOFT[club]) * f;
}

/** a decided stroke for the view (protocol3p.ts ShotMsg): its flight sampled at about sampleHz from the strike to the model's landing, its bounces and roll to
 *  the model's rest, the rest's lie, and the drop after a penalty. See the file's head for which parts are the model's and which are drawn */
export function shotMsg(o: ShotOutcome, frame: Frame3p | Pt, sampleHz = 30): ShotMsg {
  const s = o.shot, c = centreOf(frame), hz = sampleHz > 0 ? sampleHz : 30, putting = s.club === 'putter';
  const base = { v: PROTOCOL_V as 1, t: 'shot' as const, golfer: s.golfer, hole: o.hole ?? s.hole + 1, stroke: s.stroke, club: s.club, from: vp(s.from, c),
    holed: s.holed, penalty: s.penalty, at: s.t };
  if (putting || !s.landing) {
    // a putt (or a shot with no landing kept: a plan made by hand): no flight; it rolls from the ball to its rest along the green's break (BallRoll.line)
    const path = new BallRoll().line(s.from, s.to, o.height ?? null), Lm = Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y) * TILE_M;
    const T = Lm > 1e-6 ? PUTT_T.t0 + PUTT_T.k * Math.sqrt(Lm) : 0, n = Math.max(1, Math.ceil(T * hz)), p: RollPoint = { x: 0, y: 0, h: 0 };
    const roll: ViewPt[] = [], rollT: number[] = [], rollZ: number[] = [];
    for (let k = 0; k <= n; k++) { const u = k / n; path.along(u * (2 - u), p); roll.push(vp(p, c)); rollT.push(T * u); rollZ.push(0); } // (it slows to a stop)
    roll[roll.length - 1] = vp(s.to, c); // (the model's rest, exactly)
    return { ...base, flight: [], flightT: [], bounces: [], bounceLies: [], roll, rollT, rollZ, rest: vp(s.to, c), restLie: s.lie };
  }
  const lg: Landing = s.landing, from = s.from, land = lg.at;
  // ---- the flight (drawn to fit the model's landing) ----
  const dxT = land.x - from.x, dyT = land.y - from.y, D = Math.hypot(dxT, dyT) * TILE_M; // the chord, metres
  const ux = D > 1e-9 ? dxT / Math.hypot(dxT, dyT) : 1, uy = D > 1e-9 ? dyT / Math.hypot(dxT, dyT) : 0;
  const H = apexOf(s.club, D, o.input), T = Math.max(HANG.min, HANG.k * Math.sqrt(8 * H / HANG.g));
  // the bow: off the chord to its right (-uy, ux) by k u (1 - u) metres, k set so the ball leaves along its start line (the bend's angle left of the chord)
  const bend = bendOf(o, s.club, D, ux, uy), k = -D * Math.tan(bend), us = 1 / (1 + PROFILE.skew), peak = us * (1 - us) ** PROFILE.skew;
  const [fx, fy] = vp(from, c), n = Math.max(2, Math.ceil(T * hz)), flight: ViewPt3[] = [], flightT: number[] = [];
  for (let i = 0; i <= n; i++) {
    const tau = i / n, u = (1 + PROFILE.drag) * tau - PROFILE.drag * tau * tau, off = k * u * (1 - u);
    const z = H > 0 ? H * u * (1 - u) ** PROFILE.skew / peak : 0;
    flight.push([fx + ux * D * u - uy * off, fy + uy * D * u + ux * off, Math.max(0, z)]); flightT.push(T * tau);
  }
  const lv = vp(land, c); flight[n] = [lv[0], lv[1], 0]; // (the model's landing, exactly)
  // ---- the bounces and the roll (BallRoll: the top view's, between the model's landing and its rest) ----
  const height = o.height ?? null, lieAt = o.view ? (p: Pt): Lie => o.view!.lieAt(p.x, p.y) : null;
  const roll: ViewPt[] = [], rollT: number[] = [], rollZ: number[] = [], bounces: ViewPt[] = [], bounceLies: Lie[] = [];
  const leg = (a: Pt, b: Pt, aLie: Lie, bLie: Lie, t0: number): number => {
    const r = new BallRoll().set(a, b, aLie, bLie, D, 0, height), p: RollPoint = { x: 0, y: 0, h: 0 }, m = r.rest > 0 ? Math.max(1, Math.ceil(r.rest * hz)) : 0; // (a dead stop: the landing alone)
    for (const bo of r.bounces()) { r.along(bo.s, p); const q = { x: p.x, y: p.y }; bounces.push(vp(q, c)); bounceLies.push(lieAt ? lieAt(q) : aLie); }
    for (let j = roll.length ? 1 : 0; j <= m; j++) { const t = m ? r.rest * j / m : 0; r.at(t, p); roll.push(vp(p, c)); rollT.push(t0 + t); rollZ.push(Math.max(0, p.h)); }
    roll[roll.length - 1] = vp(r.rest > 0 ? b : a, c); rollZ[rollZ.length - 1] = 0; // (the leg's end, exactly: a dead stop in water or sand stays at the landing)
    return t0 + r.rest;
  };
  let tEnd: number;
  if (lg.check) {
    // a spin back: it bounces and skids on to the check, then comes back to its rest (slowing to a stop)
    tEnd = leg(land, lg.check, lg.lie, lg.lie, T);
    const Lb = Math.hypot(lg.rest.x - lg.check.x, lg.rest.y - lg.check.y) * TILE_M, Tb = Lb > 1e-6 ? BACK_T.t0 + BACK_T.k * Math.sqrt(Lb) : 0, m = Math.max(1, Math.ceil(Tb * hz));
    for (let j = 1; j <= m; j++) {
      const u = j / m, e = u * (2 - u), q = { x: lg.check.x + (lg.rest.x - lg.check.x) * e, y: lg.check.y + (lg.rest.y - lg.check.y) * e };
      roll.push(vp(q, c)); rollT.push(tEnd + Tb * u); rollZ.push(0);
    }
    roll[roll.length - 1] = vp(lg.rest, c);
  } else leg(land, lg.rest, lg.lie, lg.restLie, T);
  const msg: ShotMsg = { ...base, flight, flightT, landLie: lg.lie, bounces, bounceLies, roll, rollT, rollZ, rest: vp(lg.rest, c), restLie: lg.restLie,
    ...(lg.check ? { check: vp(lg.check, c) } : {}) };
  // a penalty: rest is where the ball stopped (in the water, out of bounds); the next stroke is played from the drop (the model's Shot.to and lie)
  if (s.penalty) { msg.drop = vp(s.to, c); msg.dropLie = s.lie; }
  return msg;
}

/** anyone's stroke (the field's golfers, a match opponent): the shot as the plan keeps it, with what the caller knows of the course, its heights and the day's
 *  wind (a model golfer picks no shape or spin: the bend is the wind's alone) */
export function fieldShotMsg(shot: Shot, frame: Frame3p | Pt, opts: { hole?: number; view?: CourseView | null; height?: HeightAt | null; wind?: WindNow | null } = {}, sampleHz = 30): ShotMsg {
  return shotMsg({ shot, ...opts }, frame, sampleHz);
}


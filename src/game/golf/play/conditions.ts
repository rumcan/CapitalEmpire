// T334 (#960): the conditions of a shot, as plain data kept with it. The wind at the strike (wind.ts), how the ball sits (lies.ts: the kind of lie) and the ground
// under it (lies.ts: the slope along and across the shot) are read when the shot is struck and saved with the input (live.ts OwnerInput.env), so a replay plays
// the same shot whatever the clock or the terrain have done since; a shot without `env` is played exactly as before T334 (the same draws, the same numbers).
// For the model's golfers (the field, the everyday tee sheet, the caddie) the day's `Conditions` do it: the day's mean wind (no gusts: a model shot's outcome
// never depends on the minute), the course's height field, and the view's finer lie. T335 (the bag) and T336 (cards) add their modifiers to the same record
// (mods.ts, T334 part 2). Pure TS, no DOM.
import { CALM_MPH, readWindNow, windEffect, windOnShot, windRelText, windText, type Wind, type WindEffect, type WindNow } from './wind';
import { LIE_FX, LIE_KINDS, flierChance, lieKindFor, slopeAt, slopeEffect, type LieKind, type Slope } from './lies';
import { TILE_M } from '../types';
import type { HeightAt } from './roll';
import type { ShapeFx } from './shape';
import type { Club, Lie, Pt } from './types';

/** what a shot is struck in: the wind (absent: none), the lie's kind (absent: the coarse lie's own), and the ground under the ball (absent: flat) */
export interface ShotEnv { wind?: WindNow; lie?: LieKind; slope?: Slope }

/** the part of a number kept within a range */
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
/** the largest slope (m per m) a saved shot keeps: the height field never makes a steeper one under a ball */
export const SLOPE_KEEP = 0.4;

/** a shot's conditions as a save keeps them, or null when none are well formed (the wind and the slope clamped, an unknown lie kind dropped) */
export function readEnv(v: unknown): ShotEnv | null {
  const o = v as Partial<ShotEnv> | null;
  if (!o || typeof o !== 'object') return null;
  const out: ShotEnv = {}, w = o.wind ? readWindNow(o.wind) : null;
  if (w) out.wind = w;
  if (typeof o.lie === 'string' && LIE_KINDS.includes(o.lie)) out.lie = o.lie;
  const s = o.slope as Partial<Slope> | undefined;
  if (s && typeof s === 'object' && [s.up, s.across].every(n => typeof n === 'number' && Number.isFinite(n))) out.slope = { up: clamp(s.up!, -SLOPE_KEEP, SLOPE_KEEP), across: clamp(s.across!, -SLOPE_KEEP, SLOPE_KEEP) };
  return Object.keys(out).length ? out : null;
}

/** the conditions a shot is struck in, worked out from the world at the strike: the wind now (null: none), the view's finer lie reading, the course's heights
 *  (null: flat), the ball, its coarse lie and the aim. The record the engine saves with the owner's input */
export function envOf(wind: WindNow | null, kindAt: ((x: number, y: number) => LieKind) | undefined, height: HeightAt | null, ball: Pt, lie: Lie, aim: Pt): ShotEnv {
  const out: ShotEnv = { lie: lieKindFor(kindAt, ball, lie) };
  if (wind && wind.mph > 0) out.wind = { mph: wind.mph, from: wind.from };
  const s = slopeAt(height, ball, aim);
  if (s.up !== 0 || s.across !== 0) out.slope = { up: s.up, across: s.across };
  return out;
}

/** a day's conditions for the model's golfers: the day's wind (its mean: gusts are left out), the course's heights, and the day it is for */
export interface Conditions { wind?: Wind | null; height?: HeightAt | null }
/** the conditions a model golfer's shot is struck in (envOf at the day's mean wind) */
export function fieldEnv(c: Conditions, kindAt: ((x: number, y: number) => LieKind) | undefined, ball: Pt, lie: Lie, aim: Pt): ShotEnv {
  return envOf(c.wind ? { mph: c.wind.mph, from: c.wind.from } : null, kindAt, c.height ?? null, ball, lie, aim);
}

// ---- what the conditions add up to, for the panel and the overlay ----

/** the flight a shot is expected to fly in its conditions (the model's mean: no random spread), for the shot panel and the ground overlay: `aimedM` the carry asked
 *  for (metres, before the lie), (ux, uy) the shot's unit direction in the tile frame, `flight` the shot's height multiplier (1; part 2's high and low). carryM is
 *  after the lie, the slope and the wind; sideM where the landing is off the aim's line (+ right: the wind's drift and the slope's pull); windCarryM and windDriftM
 *  what the wind alone adds (metres); spread the factor on the scatter (the lie's and the slope's) */
export interface ShotPreview { carryM: number; sideM: number; spread: number; windCarryM: number; windDriftM: number; wind: WindEffect }
export function previewShot(club: Club, aimedM: number, ux: number, uy: number, env: ShotEnv | null | undefined, shape?: ShapeFx | null, windK = 1, slopeK = 1): ShotPreview {
  // (T337: `windK` and `slopeK`, the factors his mods put on the wind and on the slope under the ball: the Wind Whisperer's and Slope Mode's halves; 1: as before)
  const lx = LIE_FX[env?.lie ?? 'fairway'], sl = slopeEffect(slopeK !== 1 && env?.slope ? { up: env.slope.up * slopeK, across: env.slope.across * slopeK } : env?.slope), carry0 = aimedM * lx.carry * sl.carry * (shape ? shape.carry : 1), pull = sl.deg * Math.PI / 180 + (shape ? shape.curve : 0), flight = shape ? shape.wind : 1;
  // the wind meets the shot along the line it flies (the aim turned by the slope's pull)
  const c = Math.cos(pull), s = Math.sin(pull), vx = ux * c - uy * s, vy = ux * s + uy * c;
  const wind = windEffect(env?.wind, club, vx, vy, lx.high * flight * windK), carryM = carry0 * wind.carry, windDriftM = wind.drift * carryM;
  return { carryM, sideM: windDriftM + carryM * Math.sin(pull), spread: lx.spread * sl.spread * (shape ? shape.spread : 1), windCarryM: carryM - carry0, windDriftM, wind };
}

/** the wind for the panel: its speed and bearing now, the day's gust peak (mph), the words for it, its arrow against the shot (degrees clockwise from the shot's
 *  line: 0 the wind blowing up the line, 180 into the golfer's face, 90 from the left), and its parts (mph: + a tailwind, + pushing right) */
export interface WindView { mph: number; from: number; peak: number; calm: boolean; text: string; rel: string; arrow: number; tail: number; cross: number }
export function windView(now: WindNow | null | undefined, w: Wind | null | undefined, ux: number, uy: number): WindView {
  const n = now ?? { mph: 0, from: 0 }, e = windOnShot(n, ux, uy), calm = !(n.mph >= CALM_MPH);
  const peak = w ? Math.round(w.mph * (1 + 0.7 * w.gusty)) : Math.round(n.mph);
  return { mph: n.mph, from: n.from, peak, calm, text: windText(n), rel: windRelText(e, n.mph), arrow: Math.atan2(e.cross, e.tail) * 180 / Math.PI, tail: e.tail, cross: e.cross };
}

/** the lie for the panel: its kind, name and note, what it does to the carry and the scatter (factors), the spin it lets on, the chance of a flier for the club, and the
 *  lines to print ("Rough: carry -12%, scatter x1.3", "A flier in 3 of 10") */
export interface LieView { kind: LieKind; name: string; note: string; carry: number; spread: number; spin: number; flier: number; lines: string[] }
export function lieView(kind: LieKind, club: Club): LieView {
  const lx = LIE_FX[kind], flier = flierChance(kind, club), lines: string[] = [];
  const pc = (f: number) => `${f >= 1 ? '+' : '-'}${Math.abs(Math.round((f - 1) * 100))}%`;
  if (Math.abs(lx.carry - 1) >= 0.015) lines.push(`carry ${pc(lx.carry)}`);
  if (lx.spread >= 1.05) lines.push(`scatter x${lx.spread.toFixed(1)}`);
  if (lx.spin < 0.95) lines.push(`${Math.round(lx.spin * 100)}% of the spin`);
  if (lx.wild >= 0.05) lines.push('wild strikes');
  if (flier >= 0.05) lines.push(`a flier in ${Math.round(flier * 10)} of 10`);
  return { kind, name: lx.name, note: lx.note, carry: lx.carry, spread: lx.spread, spin: lx.spin, flier, lines };
}

/** one line for what the wind did to a shot that was played (the report's tail): "wind -8 m, 5 m right"; null when there was none to speak of (a calm, a putt, under
 *  a metre each way). `from` and `at` are the strike and the landing (tiles) */
export function windNote(env: ShotEnv | null | undefined, club: Club, from: Pt, at: Pt, windK = 1): string | null {
  if (!env?.wind || !(env.wind.mph >= CALM_MPH)) return null;
  const C = Math.hypot(at.x - from.x, at.y - from.y) * TILE_M; if (C < 5) return null;
  const ux = (at.x - from.x) / (C / TILE_M), uy = (at.y - from.y) / (C / TILE_M), e = windEffect(env.wind, club, ux, uy, LIE_FX[env.lie ?? 'fairway'].high * windK);
  const along = C - C / e.carry, side = e.drift * C, parts: string[] = [];
  if (Math.abs(along) >= 1) parts.push(`${along > 0 ? '+' : '-'}${Math.abs(Math.round(along))} m`);
  if (Math.abs(side) >= 1) parts.push(`${Math.abs(Math.round(side))} m ${side > 0 ? 'right' : 'left'}`);
  return parts.length ? `wind ${parts.join(', ')}` : null;
}

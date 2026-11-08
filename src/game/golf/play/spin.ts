// T318 (#904): spin control (the owner, 2026-11-03: "add a ball bottom right like in tigerwoods 2008 where you can select what kind of spin you want to
// add when it lands and depending on how much you click the more spinn you add whilein air"). Before the shot the player puts a dot on the ball: top is
// topspin (the ball runs out), bottom backspin (it checks, and with enough of it spins back), left a draw and right a fade (side spin curves the flight
// and kicks the bounce). The dot's distance from the centre is the spin he starts with (up to SPIN.base); while the ball is in the air each click (or
// the F key) adds SPIN.per more of the same spin, up to the cap: the club's (a driver takes little backspin, a wedge a lot) and the lie's (the rough
// and the fescue cut it).
// The save keeps the dot and the clicks (live.ts OwnerInput.spin), never the click times, so a replay plays the same shot; a shot without it has no
// spin and plays exactly as before. The flight's curve is set at the strike (the dot); the clicks change only what the ball does once it lands (its
// first bounce: a check, a release, a spin back), so the landing point never depends on them. Pure TS, no DOM.
import { LIE_FX, type LieKind } from './lies';
import type { Club, Lie } from './types';

/** the spin as the save keeps it: the dot on the ball (x: -1 left, a draw .. +1 right, a fade; y: -1 the bottom, backspin .. +1 the top, topspin; inside
 *  the unit circle) and the clicks added while the ball was in the air */
export interface SpinInput { x: number; y: number; pump: number }
/** what a spin does to a full shot: its side spin (-1 a draw, curving left .. +1 a fade, curving right), its topspin and its backspin (0..1 each, one of
 *  them 0), all after the caps; amount (0..1) the spin's size and cap the most it can be for this club and lie in its direction */
export interface SpinEffect { side: number; top: number; back: number; amount: number; cap: number }

/** the spin's numbers: base, the most the dot alone gives; per, what each click in the air adds; maxPump, the most clicks the save keeps; top, the roll's
 *  growth at full topspin (x 1 + top); check, how fast backspin kills the roll (gone at 1 / check of full backspin, which spins back past it); sideDeg,
 *  the flight's curve (degrees) at full side spin for a 200 m carry (shorter carries curve less, CURVE_K); kickDeg, the bounce's kick (degrees) at full
 *  side spin; checkM, how far (m, at most) the ball skids on before it spins back, as a share of the carry (checkK) */
export const SPIN = { base: 0.5, per: 0.1, maxPump: 20, top: 1.5, check: 1.6, sideDeg: 6, kickDeg: 14, checkM: 1.5, checkK: 0.012 } as const;
/** the most backspin each club takes (a driver barely checks, the wedges spin back); the putter takes no spin */
export const SPIN_BACK_CAP: Readonly<Record<Club, number>> = { driver: 0.12, wood3: 0.2, iron4: 0.35, iron6: 0.5, iron8: 0.7, pw: 0.9, sw: 1, putter: 0 };
/** the share of the spin the lie it is played from lets on the ball (grass between the face and the ball cuts it) */
export const SPIN_LIE: Readonly<Record<Lie, number>> = { tee: 1, fairway: 1, green: 1, rough: 0.45, fescue: 0.25, bunker: 0.6, water: 0, out: 0 };
/** how far (m) full backspin pulls the ball back from where it would have stopped, by the surface it lands on (a green grips, the rough smothers it) */
export const BACK_M: Readonly<Record<Lie, number>> = { green: 6, fairway: 2.5, tee: 2.5, rough: 0.4, fescue: 0, bunker: 0, water: 0, out: 0 };
/** the flight's curve grows with the carry: carry / 200 m, between these */
const CURVE_K = [0.4, 1.2] as const;

/** v clamped to [lo, hi] */
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** a spin as the save keeps it, or null when it is not one (numbers clamped: the dot into the unit circle, the clicks to 0..maxPump whole) */
export function readSpin(v: unknown): SpinInput | null {
  const o = v as Partial<SpinInput> | null;
  if (!o || typeof o !== 'object' || ![o.x, o.y, o.pump].every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  let x = clamp(o.x!, -1, 1), y = clamp(o.y!, -1, 1); const r = Math.hypot(x, y);
  if (r > 1) { x /= r; y /= r; }
  return { x, y, pump: clamp(Math.floor(o.pump!), 0, SPIN.maxPump) };
}

/** the most spin (0..1) a club and the lie it is played from allow in the dot's direction (ux, uy: a unit vector): the backspin's cap is the club's, the
 *  topspin's and side spin's 1; the lie scales all of them. T334: `kind`, the lie's finer kind (lies.ts: the first cut, the deep rough), scales it by its own
 *  share instead of the coarse lie's */
export function spinCap(club: Club, lie: Lie, _ux: number, uy: number, kind?: LieKind): number {
  const l = kind ? LIE_FX[kind].spin : SPIN_LIE[lie];
  if (club === 'putter' || l <= 0) return 0;
  let c = 1;
  if (uy < 0) c = Math.min(c, SPIN_BACK_CAP[club] / -uy);
  return clamp(c, 0, 1) * l;
}

/** what a spin does for a club played from a lie (see SpinEffect): the dot's share of SPIN.base plus SPIN.per a click, capped (spinCap). Null spin or a
 *  dot at the centre: none. Pure: the same spin, club and lie always give the same effect */
export function spinEffect(s: SpinInput | null, club: Club, lie: Lie, kind?: LieKind): SpinEffect {
  const r = s ? Math.min(1, Math.hypot(s.x, s.y)) : 0;
  if (!s || r < 1e-6) return { side: 0, top: 0, back: 0, amount: 0, cap: 0 };
  const ux = s.x / Math.hypot(s.x, s.y), uy = s.y / Math.hypot(s.x, s.y), cap = spinCap(club, lie, ux, uy, kind);
  const amount = Math.min(cap, r * SPIN.base + clamp(Math.floor(s.pump), 0, SPIN.maxPump) * SPIN.per);
  return { side: ux * amount, top: Math.max(0, uy) * amount, back: Math.max(0, -uy) * amount, amount, cap };
}

/** whether another click in the air still adds spin (the spin is below its cap) */
export const spinRoom = (s: SpinInput | null, club: Club, lie: Lie, kind?: LieKind): boolean => { const e = spinEffect(s, club, lie, kind); return e.cap > 0 && e.amount < e.cap - 1e-9; };

/** the flight's curve (radians, + right as the golfer faces the aim) of a spin's side spin over a carry of carryM metres */
export const curveOf = (e: SpinEffect, carryM: number): number => e.side * SPIN.sideDeg * clamp(carryM / 200, CURVE_K[0], CURVE_K[1]) * Math.PI / 180;

/** the roll (m, along the flight; below 0 the ball spins back toward the golfer) of a ball that would roll `rollM` metres without spin, landing on `lie`:
 *  topspin lengthens it, backspin shortens it, and past 1 / SPIN.check of full backspin pulls it back up to BACK_M of the surface */
export function spinRollM(e: SpinEffect, rollM: number, lie: Lie): number {
  const run = rollM * (1 + SPIN.top * e.top) * Math.max(0, 1 - SPIN.check * e.back);
  const back = Math.max(0, SPIN.check * e.back - 1) / (SPIN.check - 1) * BACK_M[lie];
  return run - back;
}

/** the spin as the player reads it: "No spin", "Backspin 60%", "Topspin 30% · draw" */
export function spinText(e: SpinEffect): string {
  if (e.amount <= 1e-6) return 'No spin';
  const pct = (v: number) => `${Math.round(v * 100)}%`, side = Math.abs(e.side) > 0.05 ? (e.side < 0 ? 'draw' : 'fade') : '';
  const v = e.back > 0.05 ? `Backspin ${pct(e.back)}` : e.top > 0.05 ? `Topspin ${pct(e.top)}` : '';
  return v ? `${v}${side ? ` · ${side}` : ''}` : `${side === 'draw' ? 'Draw' : 'Fade'} ${pct(Math.abs(e.side))}`;
}

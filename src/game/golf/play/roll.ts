// T251 (#728): a golf ball's bounce and roll after it lands, for the course (play/view.ts: the tournament's field, the money matches and the owner,
// and everyday golf through it) and the driving range (rangebiz.ts). The shot model (shot.ts) says where a ball lands and where it comes to rest;
// this is the way between. One or two bounces by the landing's surface (higher on the tee and the fairway, a check on the green, low in the rough and
// the fescue), then a roll that slows to a stop at the rest; a dead stop in a bunker (a puff of sand) and a splash in water. The ground's cross slope
// bends the way (a ball rolling across a slope sets off above the line and breaks down to its rest) but never moves the rest: only the path curves.
// Closed form: set once per shot, read every frame, no allocation. Pure TS, deterministic, no DOM.
import { TILE_M } from '../types';
import type { Lie, Pt } from './types';

/** the ground's height (metres) at a tile point: the course height field (T026, with T263's hole shaping); null: flat ground */
export type HeightAt = ((x: number, y: number) => number) | null;

/** a ball's effect: none, a splash (in water: the ball gone, rings on the water), a puff of sand (plugged in a bunker) */
export const FX_NONE = 0, FX_SPLASH = 1, FX_SAND = 2;
/** the dev switch for the bench's A/B (bench.ts ?ballRoll=ab, Engine.setBallRoll): off, the balls fly to where they end and lie there, as before T251 */
export const ballRoll = { on: true };

/** per landing surface: the first bounce's height (m) for a full carry (CARRY_REF m), and the second bounce's share of it (0: one bounce) */
export const BOUNCE: Record<Lie, { h: number; second: number }> = {
  tee: { h: 1.9, second: 0.35 }, fairway: { h: 1.9, second: 0.35 }, green: { h: 0.7, second: 0.22 }, rough: { h: 0.45, second: 0 },
  fescue: { h: 0.18, second: 0 }, out: { h: 0.45, second: 0 }, bunker: { h: 0, second: 0 }, water: { h: 0, second: 0 },
};
/** the carry (m) whose bounce is BOUNCE's height; a shorter one bounces lower, by its share of it (at least CARRY_MIN of it, at most CARRY_MAX) */
const CARRY_REF = 200, CARRY_MIN = 0.25, CARRY_MAX = 1.15;
/** a second bounce lower than this (m) is left out */
const H_MIN = 0.08;
/** a bounce's time (s): BOUNCE_K times the square root of its height (m), at the pace of the game's flights (a drive's 6 s shown in 1.4) */
const BOUNCE_K = 0.25;
/** the share of its speed along the ground a ball keeps through a bounce */
const KEEP = 0.7;
/** the roll's time (s): ROLL_T0 plus ROLL_TK times the square root of its length (m) */
const ROLL_T0 = 0.22, ROLL_TK = 0.05;
/** the bend: the way is off the straight line by BEND * c * L * s * (1 - s) tiles at its share s (L its length in tiles, c the ground's cross slope in
 *  m per m, read at three points along it, capped at BEND_C), uphill of the line, so the ball breaks down to its rest */
export const BEND = 8, BEND_C = 0.1;
/** the cross slope is read this far (tiles) either side of the line: the height field's spacing */
const SIDE = 2;
/** a splash's and a sand puff's time (s) */
export const SPLASH_S = 0.7, PUFF_S = 0.45;

/** where a ball is: its ground point (tiles) and height (m) */
export interface RollPoint { x: number; y: number; h: number }

/** the ground's slope across a line from (x, y) by (dx, dy) of length L (tiles): how much it falls toward the line's left (-dy, dx), m per m, the mean of
 *  three points along it, capped at BEND_C; 0 on flat ground or a short line */
export function crossSlope(height: HeightAt, x: number, y: number, dx: number, dy: number, L: number): number {
  if (!height || L < 0.05) return 0;
  const nx = -dy / L, ny = dx / L;
  let c = 0;
  for (let k = 1; k <= 3; k++) {
    const px = x + dx * k / 4, py = y + dy * k / 4;
    c += (height(px - nx * SIDE, py - ny * SIDE) - height(px + nx * SIDE, py + ny * SIDE)) / (2 * SIDE * TILE_M);
  }
  c /= 3;
  return c > BEND_C ? BEND_C : c < -BEND_C ? -BEND_C : c;
}

/** a ball's way from its landing to its rest (set), read at any time after the landing (at). Also a putt's line with its break (line, along) */
export class BallRoll {
  /** where it lands and where it comes to rest (tiles) */
  lx = 0; ly = 0; ex = 0; ey = 0;
  /** seconds from the landing: when the ball stops (rest), and when its effect is over too (end) */
  rest = 0; end = 0;
  /** its effect: FX_SPLASH (once at rest: the ball gone into the water), FX_SAND (from the landing: plugged) or FX_NONE */
  fx = FX_NONE;
  /** the effect's progress (0..1) as of the last at() */
  fu = 0;
  /** the line's left (unit) and the bend's size (tiles: BEND * c * L) */
  private nx = 0; private ny = 0; private bend = 0;
  /** the bounces: their ends (shares of the line), heights (m) and end times (s from the landing; t2 = t1 with one bounce) */
  private s1 = 0; private s2 = 0; private h1 = 0; private h2 = 0; private t1 = 0; private t2 = 0;

  /** a ball landing at `land` on `lie` and coming to rest at `rest` on `restLie` (the shot model's), after a carry of carryM metres, its bounces and roll
   *  within `budget` seconds (scaled down to fit), bent by the ground's cross slope (height) and `cross` more (m per m: the range's wobble) */
  set(land: Pt, rest: Pt, lie: Lie, restLie: Lie, carryM: number, budget: number, height: HeightAt, cross = 0): this {
    const lx = land.x, ly = land.y, dx = rest.x - lx, dy = rest.y - ly, L = Math.hypot(dx, dy);
    this.lx = lx; this.ly = ly; this.ex = rest.x; this.ey = rest.y; this.fu = 0;
    this.s1 = 0; this.s2 = 0; this.h1 = 0; this.h2 = 0; this.t1 = 0; this.t2 = 0; this.bend = 0;
    // a dead stop: in water (the splash where it lands) or plugged in a bunker (the model rolls neither)
    if (lie === 'water' || lie === 'bunker') {
      this.fx = lie === 'water' ? FX_SPLASH : FX_SAND; this.ex = lx; this.ey = ly; this.rest = 0; this.end = lie === 'water' ? SPLASH_S : PUFF_S;
      return this;
    }
    const B = BOUNCE[lie], k = Math.min(CARRY_MAX, Math.max(CARRY_MIN, carryM / CARRY_REF)), h1 = B.h * k, h2b = h1 * B.second, h2 = h2b >= H_MIN ? h2b : 0;
    let t1 = h1 > 0 ? BOUNCE_K * Math.sqrt(h1) : 0, t2 = h2 > 0 ? BOUNCE_K * Math.sqrt(h2) : 0, tr = L > 1e-6 ? ROLL_T0 + ROLL_TK * Math.sqrt(L * TILE_M) : 0;
    const tot = t1 + t2 + tr;
    if (tot > budget && budget > 0) { const f = budget / tot; t1 *= f; t2 *= f; tr *= f; }
    // the speed along the ground: v0 through the first bounce, KEEP of it through the second, KEEP again into the roll, which slows to a stop (half
    // that speed on average), so the bounces and the roll cover the line exactly and the speed falls at each bounce
    const keep = t2 > 0 ? KEEP * KEEP : KEEP, w = t1 + KEEP * t2 + keep * tr / 2, v0 = w > 0 && L > 0 ? L / w : 0;
    this.s1 = L > 0 ? v0 * t1 / L : 0; this.s2 = this.s1 + (L > 0 ? KEEP * v0 * t2 / L : 0);
    this.h1 = h1; this.h2 = h2; this.t1 = t1; this.t2 = t1 + t2; this.rest = t1 + t2 + tr;
    // rolled into water: the splash where it stops
    this.fx = restLie === 'water' ? FX_SPLASH : FX_NONE; this.end = this.rest + (this.fx === FX_SPLASH ? SPLASH_S : 0);
    this.bendOf(height, dx, dy, L, cross);
    return this;
  }

  /** a putt's line from `from` to `to` with its break on the green's slope (read by along) */
  line(from: Pt, to: Pt, height: HeightAt): this {
    const dx = to.x - from.x, dy = to.y - from.y, L = Math.hypot(dx, dy);
    this.lx = from.x; this.ly = from.y; this.ex = to.x; this.ey = to.y; this.fx = FX_NONE; this.fu = 0; this.rest = 0; this.end = 0; this.bend = 0;
    this.bendOf(height, dx, dy, L, 0);
    return this;
  }

  /** the point at share s (0..1) of the way (on the ground), into out */
  along(s: number, out: RollPoint): void {
    const off = -this.bend * s * (1 - s);
    out.x = this.lx + (this.ex - this.lx) * s + this.nx * off; out.y = this.ly + (this.ey - this.ly) * s + this.ny * off; out.h = 0;
  }

  /** the ball t seconds after its landing, into out (its height too); returns its effect then (FX_SPLASH only once it is in the water) and sets fu */
  at(t: number, out: RollPoint): number {
    let s: number, h = 0;
    if (t <= 0) s = 0;
    else if (t < this.t1) { const u = t / this.t1; s = this.s1 * u; h = 4 * this.h1 * u * (1 - u); }
    else if (t < this.t2) { const u = (t - this.t1) / (this.t2 - this.t1); s = this.s1 + (this.s2 - this.s1) * u; h = 4 * this.h2 * u * (1 - u); }
    else if (t < this.rest) { const u = (t - this.t2) / (this.rest - this.t2); s = this.s2 + (1 - this.s2) * u * (2 - u); }
    else s = 1;
    this.along(s, out); out.h = h;
    if (this.fx === FX_SAND) { this.fu = t <= 0 ? 0 : t >= PUFF_S ? 1 : t / PUFF_S; return FX_SAND; }
    if (this.fx === FX_SPLASH && t >= this.rest) { const u = (t - this.rest) / SPLASH_S; this.fu = u >= 1 ? 1 : u; return FX_SPLASH; }
    this.fu = 0;
    return FX_NONE;
  }

  /** the bend for a line by (dx, dy) of length L from the start: the ground's cross slope (plus cross) times BEND times L */
  private bendOf(height: HeightAt, dx: number, dy: number, L: number, cross: number): void {
    if (L < 0.05) { this.nx = 0; this.ny = 0; this.bend = 0; return; }
    const c = crossSlope(height, this.lx, this.ly, dx, dy, L) + cross;
    this.nx = -dy / L; this.ny = dx / L; this.bend = BEND * c * L;
  }
}

// T319 (#905; the owner, 2026-11-03: "I want to se grids showing break on green. shot tracers, ball rolling and going into holes"). Pure TS, no DOM:
// the engine draws all of it on the 2D overlay (no ground re-bake, no atlas page), only near the camera.
// - **The break grid**: points on a green (BREAK_STEP tiles apart) with the way the ground falls there (downhill, unit) and how steeply (m per m),
//   from the course height field (T026, T263's green tilt). Built once per green and height edit (buildBreakGrid), read every frame; the engine
//   draws the grid's lines and a dot running downhill at each point, faster and warmer where steeper (breakColour), fading in when you putt.
// - **The cup**: a ball reaching the cup drops within a speed window that narrows toward the rim, and lips out above it (cupFate).
// - **The putt's roll** (PuttRoll): the visible way of a putt follows the shot model's result (live.ts shotOutcome: holed, or where a miss stops),
//   bent by the green's break (roll.ts BallRoll.line: the ball starts above the line and breaks down to its end). A holed putt reaches the cup at a
//   speed in the window and drops; a miss whose way crosses the cup lips out when it is there too fast, else its way is eased to shave the rim
//   (it never drops when the model says it missed). The model stays the one truth: saves and replays are unchanged.
// - **The tracer**: your full shot's flight as a curve (shotPoint: a quadratic from the ball along the aim to where it lands, so a draw or fade, a
//   hook or slice, shows its bend; shotShape names it), drawn while it flies and fading after it lands (tracerAlpha).
// Spin (T318) changes a ball after it lands: the roll of a full shot is yours.ts yourBallAt's roll phase (rollShare), the place to bend it.
// Units: tiles (2 m) for places; metres and m/s for the cup.
import { TILE_M } from '../types';
import { BallRoll, type HeightAt, type RollPoint } from './roll';
import type { Club, Pt } from './types';

// ---- the break grid ----

/** the grid's spacing (tiles): a 1 m mesh; its arrows every second point (2 m) */
export const BREAK_STEP = 0.5;
/** the heights are read this far either side of a point (tiles) for its slope */
const SLOPE_D = 1;
/** under this slope (m per m) a point is flat: no arrow, a still dot. T333 (#959): 0.2% (was 0.4%), so a gentle slope raised by hand with a wide
 *  brush (radius 20, level 1: 0.37% at most) shows its arrows */
export const FLAT_SLOPE = 0.002;
/** at this slope (m per m) an arrow is at its longest and hottest (T026's steepest green: GREEN_MAX_SLOPE is 6%) */
export const STEEP_SLOPE = 0.04;

/** the ground's fall at (x, y): the downhill direction (unit, tiles; 0, 0 on flat ground) and the slope (m per m) */
export function breakAt(height: HeightAt, x: number, y: number): { dx: number; dy: number; s: number } {
  if (!height) return { dx: 0, dy: 0, s: 0 };
  const gx = (height(x + SLOPE_D, y) - height(x - SLOPE_D, y)) / (2 * SLOPE_D * TILE_M);
  const gy = (height(x, y + SLOPE_D) - height(x, y - SLOPE_D)) / (2 * SLOPE_D * TILE_M), s = Math.hypot(gx, gy);
  return s < 1e-9 ? { dx: 0, dy: 0, s: 0 } : { dx: -gx / s, dy: -gy / s, s };
}

/** T333 (#959): a round's state for the break grid (your walk-on round, a match, or your shots in the tournament): the hole's pin, the open shot's club
 *  (null: no shot open), a putt rolling, another shot in the air, your ball at rest on the green, the hole done */
export interface BreakTurn { pin: Pt; club: Club | null; putting: boolean; flying: boolean; onGreen: boolean; holed: boolean }
/** the green whose break shows for a round when you putt (its pin), or null: a putt rolling (it holds while a holed putt drops), your shot open with
 *  the putter, or your ball at rest on the green with no shot open and nothing in the air */
export function breakPinOf(t: BreakTurn | null): Pt | null {
  if (!t) return null;
  if (t.putting) return t.pin;
  if (t.holed || t.flying) return null;
  if (t.club !== null) return t.club === 'putter' ? t.pin : null;
  return t.onGreen ? t.pin : null;
}

/** a green's break grid: n points, each [x, y, dx, dy, s] in pts (tiles; downhill unit; m per m), on a BREAK_STEP lattice (i, j: the lattice
 *  index, for the lines between neighbours); the box it covers */
export interface BreakGrid { n: number; pts: Float32Array; ij: Int32Array; x0: number; y0: number; x1: number; y1: number }

/** the break grid of the green round (cx, cy): the lattice points within r tiles that are on it (onGreen), with their fall */
export function buildBreakGrid(height: HeightAt, onGreen: (x: number, y: number) => boolean, cx: number, cy: number, r: number): BreakGrid {
  const xs: number[] = [], ij: number[] = [], k = Math.ceil(r / BREAK_STEP), bx = Math.round(cx / BREAK_STEP), by = Math.round(cy / BREAK_STEP);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let j = by - k; j <= by + k; j++) for (let i = bx - k; i <= bx + k; i++) {
    const x = i * BREAK_STEP, y = j * BREAK_STEP; if (Math.hypot(x - cx, y - cy) > r || !onGreen(x, y)) continue;
    const b = breakAt(height, x, y); xs.push(x, y, b.dx, b.dy, b.s); ij.push(i, j);
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return { n: ij.length / 2, pts: Float32Array.from(xs), ij: Int32Array.from(ij), x0, y0, x1, y1 };
}

/** a slope's share of the steep end (0 flat .. 1 at STEEP_SLOPE or more) */
export const steepShare = (s: number): number => s <= FLAT_SLOPE ? 0 : Math.min(1, (s - FLAT_SLOPE) / (STEEP_SLOPE - FLAT_SLOPE));
/** the colour bucket of a slope (0..3: flat white, gentle cyan, firm yellow, steep orange-red) and the buckets' colours */
export const breakBucket = (s: number): number => { const u = steepShare(s); return u <= 0 ? 0 : u < 0.3 ? 1 : u < 0.65 ? 2 : 3; };
export const BREAK_COLOURS = ['255,255,255', '125,211,252', '250,204,21', '249,115,22'] as const;
/** a dot's run downhill per second (shares of its arrow): faster where steeper */
export const dotSpeed = (s: number): number => 0.35 + 1.1 * steepShare(s);

// ---- the cup ----

/** the cup's radius (m: 108 mm across) and the ball's (42.7 mm across) */
export const CUP_R_M = 0.054, BALL_R_M = 0.0214;
/** a ball whose centre passes within this of the cup's centre (m) touches the cup */
export const CUP_EDGE_M = CUP_R_M + BALL_R_M;
/** the most a ball dead centre may be doing at the cup and drop (m/s); toward the rim the window narrows to nothing */
export const CAPTURE_MS = 1.3;
/** a putt's slowing on the green (m/s per s: a green of about 10 on the stimpmeter) */
export const GREEN_DECEL = 0.65;
/** how far past the cup a holed putt would have rolled (m): it reaches the cup at sqrt(2 GREEN_DECEL CUP_PAST_M) m/s, well in the window */
export const CUP_PAST_M = 0.35;

/** the most speed (m/s) at which a ball off the cup's centre by offM metres drops (0 past the edge) */
export const captureSpeed = (offM: number): number => { const u = offM / CUP_EDGE_M; return u >= 1 ? 0 : CAPTURE_MS * Math.sqrt(1 - u * u); };
/** what a ball does at the cup, off its centre by offM metres at speedMs: drops, lips out (it touches the cup too fast), or misses it */
export function cupFate(speedMs: number, offM: number): 'drop' | 'lip' | 'miss' {
  if (offM >= CUP_EDGE_M) return 'miss';
  return speedMs <= captureSpeed(offM) ? 'drop' : 'lip';
}
/** the speed (m/s) of a putt slowing at GREEN_DECEL with remM metres still to roll */
export const speedLeft = (remM: number): number => Math.sqrt(2 * GREEN_DECEL * Math.max(0, remM));

/** a putt's end at the cup: none (it never reached the cup), drop (holed), lip (it caught the cup too fast and spun out), shave (it brushed the rim) */
export const CUP_NONE = 0, CUP_DROP = 1, CUP_LIP = 2, CUP_SHAVE = 3;
/** a lip-out's hop (m) and the share of the way it lasts */
const LIP_H = 0.12, LIP_W = 0.06;
/** the time a holed ball takes to drop out of sight (s), and the hold on it in the cup before the hole's card (s) */
export const DROP_S = 0.25, CUP_HOLD_S = 0.9;

/** a putt's visible way from the ball to the model's end (the cup when holed), with the green's break; read at a share u (0..1) of its time */
export class PuttRoll {
  /** how it ends at the cup (CUP_*), the share of the way at the cup (1 when holed) and the ball's speed there (m/s) */
  fate = CUP_NONE; sCup = 1; vCup = 0;
  /** the way's length (m) */
  L = 0;
  private bl = new BallRoll(); private r = 0;
  /** the shave: a lateral push (tiles) at the cup, eased over the way */
  private push = 0; private nx = 0; private ny = 0;

  /** the putt from `from` to the model's end `to` (the pin when holed), the pin, and the green's height */
  set(from: Pt, to: Pt, pin: Pt, holed: boolean, height: HeightAt): this {
    const end = holed ? pin : to;
    this.bl.line(from, end, height); this.push = 0;
    const dx = end.x - from.x, dy = end.y - from.y, Lt = Math.hypot(dx, dy); this.L = Lt * TILE_M;
    this.nx = Lt > 0 ? -dy / Lt : 0; this.ny = Lt > 0 ? dx / Lt : 0;
    if (holed) { this.r = Math.sqrt(CUP_PAST_M / (this.L + CUP_PAST_M)); this.fate = CUP_DROP; this.sCup = 1; this.vCup = speedLeft(CUP_PAST_M); return this; }
    this.r = 0; this.fate = CUP_NONE; this.sCup = 1; this.vCup = 0;
    // the closest the way comes to the cup (sampled: once a putt)
    const p: RollPoint = { x: 0, y: 0, h: 0 }; let best = Infinity, sb = 0;
    for (let k = 0; k <= 64; k++) { const s = k / 64; this.bl.along(s, p); const d = Math.hypot(p.x - pin.x, p.y - pin.y); if (d < best) { best = d; sb = s; } }
    const off = best * TILE_M; if (off >= CUP_EDGE_M) return this;
    this.sCup = sb; this.vCup = speedLeft((1 - sb) * this.L);
    if (cupFate(this.vCup, off) === 'lip') { this.fate = CUP_LIP; return this; }
    // slow enough to drop but the model says it missed: the way shaves the rim instead (pushed off the cup, on the side it passes)
    this.bl.along(sb, p);
    const side = (p.x - pin.x) * this.nx + (p.y - pin.y) * this.ny, want = (side >= 0 ? 1 : -1) * CUP_EDGE_M * 1.15 / TILE_M, g = sb * (1 - sb);
    this.push = g > 1e-4 ? (want - side) / g : 0; this.fate = CUP_SHAVE;
    return this;
  }

  /** the share of the way at a share u of the time: the ball slows evenly from its start to its end speed (the cup's when holed, else 0) */
  share(u: number): number { const v = u <= 0 ? 0 : u >= 1 ? 1 : u; return (v - (1 - this.r) * v * v / 2) / ((1 + this.r) / 2); }
  /** the share of the time at a share s of the way (share's inverse) */
  timeAt(s: number): number {
    const a = (1 - this.r) / 2, b = (1 + this.r) / 2 * Math.min(1, Math.max(0, s));
    return a < 1e-9 ? b : (1 - Math.sqrt(Math.max(0, 1 - 4 * a * b))) / (2 * a);
  }
  /** the ball at a share u of the putt's time, into out (h: a lip-out's hop, m) */
  at(u: number, out: RollPoint): void {
    const s = this.share(u); this.bl.along(s, out);
    if (this.push) { const k = this.push * s * (1 - s); out.x += this.nx * k; out.y += this.ny * k; }
    if (this.fate === CUP_LIP) { const d = (s - this.sCup) / LIP_W; out.h = d > -1 && d < 1 ? LIP_H * (1 - d * d) : 0; }
  }
}

// ---- the tracer ----

/** a tracer stays bright this long after the ball lands (s), then fades out over TRACER_FADE_S */
export const TRACER_HOLD_S = 2.5, TRACER_FADE_S = 1.5;
/** a tracer's alpha `age` seconds after its ball landed (before it lands: 1); 0 once gone */
export const tracerAlpha = (age: number): number => age <= TRACER_HOLD_S ? 1 : age >= TRACER_HOLD_S + TRACER_FADE_S ? 0 : 1 - (age - TRACER_HOLD_S) / TRACER_FADE_S;
/** a tracer is gone `age` seconds after its ball landed */
export const tracerGone = (age: number): boolean => age >= TRACER_HOLD_S + TRACER_FADE_S;

/** the bend of a shot: the angle (radians) from the aim's line to where it landed, seen from the ball; plus turns right, minus left (on screen: the
 *  tile frame keeps the screen's handedness, y down) */
export function shotBend(from: Pt, aim: Pt, land: Pt): number {
  const ax = aim.x - from.x, ay = aim.y - from.y, lx = land.x - from.x, ly = land.y - from.y;
  if (Math.hypot(ax, ay) < 1e-6 || Math.hypot(lx, ly) < 1e-6) return 0;
  return Math.atan2(ax * ly - ay * lx, ax * lx + ay * ly);
}
/** the shape's name, for a right-handed golfer: straight within 1.5 degrees, a draw or fade within 6, a hook or slice past it */
export function shotShape(bend: number): 'straight' | 'draw' | 'fade' | 'hook' | 'slice' {
  const d = bend * 180 / Math.PI, a = Math.abs(d);
  return a < 1.5 ? 'straight' : d < 0 ? (a < 6 ? 'draw' : 'hook') : (a < 6 ? 'fade' : 'slice');
}
/** how far out along the aim's line (a share of the carry) a flight's control point is: the later, the later and harder it bends */
export const BEND_AT = 0.65;
/** the ground point of a full shot at a share u of its flight, into out: a quadratic from the ball through a control point on the aim's line (BEND_AT
 *  of the carry out), to where it lands, so the flight starts on the aim and bends to the landing (a straight shot: a straight line) */
export function shotPoint(from: Pt, aim: Pt | null, land: Pt, u: number, out: { x: number; y: number }): void {
  const d = Math.hypot(land.x - from.x, land.y - from.y), ax = aim ? aim.x - from.x : 0, ay = aim ? aim.y - from.y : 0, al = Math.hypot(ax, ay);
  let cx = (from.x + land.x) / 2, cy = (from.y + land.y) / 2;
  if (al > 1e-6 && d > 1e-6) { const ux = ax / al, uy = ay / al, dot = Math.max(0, (land.x - from.x) * ux + (land.y - from.y) * uy) * BEND_AT; cx = from.x + ux * dot; cy = from.y + uy * dot; }
  const v = 1 - u; out.x = v * v * from.x + 2 * v * u * cx + u * u * land.x; out.y = v * v * from.y + 2 * v * u * cy + u * u * land.y;
}

// ---- the settings ----

/** a store the settings read and write (localStorage fits; the tests pass a map) */
export interface GreenStore { getItem(k: string): string | null; setItem(k: string, v: string): void }
/** the break grid: off, when you putt (the default), or on every green near the camera */
export type BreakMode = 'off' | 'putt' | 'always';
export const BREAK_KEY = 'capitalempire.breakGrid', TRACER_KEY = 'capitalempire.tracers';
export function loadBreakMode(store: GreenStore | null): BreakMode {
  let v: string | null = null; try { v = store?.getItem(BREAK_KEY) ?? null; } catch { /* storage may be unavailable */ }
  return v === 'off' || v === 'always' ? v : 'putt';
}
export function saveBreakMode(store: GreenStore | null, m: BreakMode): void { try { store?.setItem(BREAK_KEY, m); } catch { /* unavailable */ } }
export function loadTracers(store: GreenStore | null): boolean {
  let v: string | null = null; try { v = store?.getItem(TRACER_KEY) ?? null; } catch { /* storage may be unavailable */ }
  return v !== '0';
}
export function saveTracers(store: GreenStore | null, on: boolean): void { try { store?.setItem(TRACER_KEY, on ? '1' : '0'); } catch { /* unavailable */ } }

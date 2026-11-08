// T337 (#963): the Laser Rangefinder card's report. With the card the shot panel gives the distance to the pin to a tenth of a metre and what lies along your line: the carry to water, sand, out of bounds and the
// green (where each starts and where it is cleared), read from the course view's lies a step at a time. Pure TS, no DOM, no draws.
import { TILE_M } from '../types';
import { FLAT_SLOPE, breakAt } from './green';
import type { HeightAt } from './roll';
import type { CourseView, Pt } from './types';

/** what the laser reports along a line */
export type LaserWhat = 'water' | 'sand' | 'out' | 'green';
/** one run of it along the line: where it starts and ends (metres from the ball) */
export interface LaserItem { what: LaserWhat; from: number; to: number }
/** the laser's step along the line (metres) and the farthest it reads */
export const LASER_STEP = 2, LASER_MAX_M = 400;
/** the most items it reports (the nearest first) */
export const LASER_ITEMS = 4;
const NAME: Readonly<Record<LaserWhat, string>> = { water: 'Water', sand: 'Sand', out: 'Out of bounds', green: 'Green' };

/** the distance to the pin and to the aim (metres, as measured) and the runs of water, sand, out of bounds and green along the line from the ball to the aim (to the pin when the aim is on the ball), a little past the farther of the two */
export function laserReport(view: Pick<CourseView, 'lieAt'>, ball: Pt, aim: Pt, pin: Pt): { pinM: number; aimM: number; items: LaserItem[] } {
  const pinM = Math.hypot(pin.x - ball.x, pin.y - ball.y) * TILE_M, aimM = Math.hypot(aim.x - ball.x, aim.y - ball.y) * TILE_M;
  const to = aimM > 0.5 ? aim : pin, L0 = Math.hypot(to.x - ball.x, to.y - ball.y), items: LaserItem[] = [];
  if (L0 < 1e-6) return { pinM, aimM, items };
  const ux = (to.x - ball.x) / L0, uy = (to.y - ball.y) / L0, reach = Math.min(LASER_MAX_M, Math.max(pinM, aimM) + 30);
  let cur: LaserItem | null = null;
  for (let d = LASER_STEP; d <= reach; d += LASER_STEP) {
    const lie = view.lieAt(ball.x + ux * d / TILE_M, ball.y + uy * d / TILE_M);
    const what: LaserWhat | null = lie === 'water' ? 'water' : lie === 'bunker' ? 'sand' : lie === 'out' ? 'out' : lie === 'green' ? 'green' : null;
    if (cur && cur.what === what) { cur.to = d; continue; }
    if (cur) { items.push(cur); cur = null; }
    if (what) cur = { what, from: d - LASER_STEP, to: d };
  }
  if (cur) items.push(cur);
  return { pinM, aimM, items: items.slice(0, LASER_ITEMS) };
}

/** the report as lines for the panel: "Pin 143.6 m · aim 138.2 m", "Water: carry 112 m, clear at 131 m", "Green: from 238 m" */
export function laserLines(r: { pinM: number; aimM: number; items: readonly LaserItem[] }): string[] {
  const out = [`Pin ${r.pinM.toFixed(1)} m · aim ${r.aimM.toFixed(1)} m`];
  for (const i of r.items) out.push(i.what === 'green' ? `${NAME[i.what]}: from ${Math.round(i.from)} m` : `${NAME[i.what]}: carry ${Math.round(i.from)} m, clear at ${Math.round(i.to)} m`);
  return out;
}

// ---- Read the Feet and Slope Mode ----
/** a green's read for a putt from the ball to the cup, as the Read the Feet card says it: the ground's fall across the line and along it (m per m, averaged over five points of the line from the break grid's own slope; `cross` + when it falls to
 *  the right of the line: the putt breaks left to right; `along` + when it falls toward the cup: downhill), and the words. Flat ground (under the grid's FLAT_SLOPE) reads flat. The model's putt does not break (the roll is drawn from its result), so
 *  the read is information, and the aim stays the cup */
export function greenRead(height: HeightAt, ball: Pt, pin: Pt): { cross: number; along: number; slope: number; text: string } {
  const dx = pin.x - ball.x, dy = pin.y - ball.y, L = Math.hypot(dx, dy);
  if (!height || L < 1e-6) return { cross: 0, along: 0, slope: 0, text: 'Green read: flat, straight in' };
  const ux = dx / L, uy = dy / L; let cross = 0, along = 0;
  for (let i = 0; i < 5; i++) {
    const f = (i + 0.5) / 5, b = breakAt(height, ball.x + dx * f, ball.y + dy * f);
    cross += b.s * (b.dx * -uy + b.dy * ux) / 5; along += b.s * (b.dx * ux + b.dy * uy) / 5;
  }
  const slope = Math.hypot(cross, along);
  if (slope < FLAT_SLOPE) return { cross, along, slope, text: 'Green read: flat, straight in' };
  const pc = (v: number) => (Math.abs(v) * 100).toFixed(1);
  const parts: string[] = [];
  if (Math.abs(cross) >= FLAT_SLOPE) parts.push(`breaks ${cross > 0 ? 'left to right' : 'right to left'} (${pc(cross)}%)`);
  if (Math.abs(along) >= FLAT_SLOPE) parts.push(along > 0 ? `downhill (${pc(along)}%): quick` : `uphill (${pc(along)}%): slow`);
  return { cross, along, slope, text: `Green read: ${parts.join(', ')}` };
}

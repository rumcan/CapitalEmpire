// T423 (docs/CINDERLINKS-PORT.md): the green for the view from behind the golfer, read off the host's own height field, never the view's (its heights
// are the course's, raised and roughened for the look). The model judges a putt by its aim against the pin's line and its pace against the length to
// the pin (live.ts shotOutcome); the green's break is how the ball's way is DRAWN (green.ts PuttRoll: a holed putt curls in from its start line). So in
// the view the putt is aimed as a golfer reads one: along the line the ball starts on. The host sends that line (`startDeg`: the holed way's start off
// the pin's line), the way itself, the slope grid and the read in words; the view's aim is turned back by startDeg before the model judges it, so a putt
// started along the read is the model's putt at the pin, and one aimed straight at the cup misses by the break.
// Positions are in the view's frame (protocol3p.ts toView). Pure TS, no DOM.
import { TILE_M } from '../types';
import type { Pt } from './types';
import type { HeightAt } from './roll';
import { BREAK_STEP, PuttRoll, buildBreakGrid } from './green';
import { greenRead } from './tools';
import { toView, type ViewPt } from './protocol3p';

/** the green as the view draws and reads it: the slope grid ([x, y, downhill x, downhill y, slope m per m] for each point, metres in the view's frame, a
 *  point every `step` m), the read in words, a holed putt's way from the ball to the cup, and its start line's angle off the pin's line (degrees, + right
 *  as he faces the pin) */
export interface Green3p { pts: number[]; step: number; read: string; path: ViewPt[]; startDeg: number }

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** the green round the pin for a putt from `ball`: its grid out to the ball and a little past, the read, and the holed way (null without heights: a flat
 *  green, straight in) */
export function green3p(height: HeightAt, onGreen: (x: number, y: number) => boolean, ball: Pt, pin: Pt, centre: Pt): Green3p {
  const L = Math.hypot(pin.x - ball.x, pin.y - ball.y), g = height ? buildBreakGrid(height, onGreen, pin.x, pin.y, L + 3) : null, pts: number[] = [];
  if (g) for (let k = 0; k < g.n; k++) {
    const v = toView({ x: g.pts[k * 5]!, y: g.pts[k * 5 + 1]! }, centre);
    pts.push(r2(v[0]), r2(v[1]), r2(g.pts[k * 5 + 2]!), r2(g.pts[k * 5 + 3]!), Math.round(g.pts[k * 5 + 4]! * 10000) / 10000);
  }
  const path: ViewPt[] = []; let startDeg = 0;
  if (height && L > 1e-6) {
    const roll = new PuttRoll().set(ball, pin, pin, true, height), p = { x: 0, y: 0, h: 0 };
    for (let k = 0; k <= 24; k++) { roll.at(roll.timeAt(k / 24), p); const v = toView(p, centre); path.push([r2(v[0]), r2(v[1])]); }
    roll.at(roll.timeAt(0.12), p); // (the start line: where the ball heads over its first few per cent)
    const a0 = Math.atan2(pin.y - ball.y, pin.x - ball.x), a1 = Math.atan2(p.y - ball.y, p.x - ball.x);
    startDeg = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)) * 180 / Math.PI;
  } else path.push(toView(ball, centre), toView(pin, centre));
  return { pts, step: BREAK_STEP * TILE_M, read: greenRead(height, ball, pin).text, path, startDeg };
}

/** the aim point a putt aimed at `aim` is judged at by the model: turned about the ball by -startDeg, so the read's start line is the pin's line */
export function puttAim(ball: Pt, aim: Pt, startDeg: number): Pt {
  const a = -startDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = aim.x - ball.x, dy = aim.y - ball.y;
  return { x: ball.x + dx * c - dy * s, y: ball.y + dx * s + dy * c };
}

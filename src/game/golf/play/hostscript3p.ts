// T439 (docs/CINDERLINKS-PORT.md, tests): a scripted host for the Cinderlinks harness. It paints a three-hole course, exports it as the game does
// (export3p.ts exportCourse3p: the outlines traced and smoothed, the heights packed), makes the course the golf model plays from that very file (share3p.ts
// shareView) and the view's `course` message, and plays the three holes through Play3p: the harness sends the view's inputs to input() and the answers
// back to the view, then checks every ball the view leaves at rest against the model's own stroke (`stroke(i)`).
// Pure TS, no DOM; bundled for the harness by esbuild at gate time (packages/cinderlinks/harness.mjs hostScript).
import type { AimPoint, CourseArea, GolfSurface, Pin, TeeMark } from '../types';
import { exportCourse3p, type Export3pInput } from './export3p';
import { shareCourseMsg, shareOf, shareView } from './share3p';
import { Play3p } from './play3p';
import { toView, type CourseMsg, type HostMsg, type ViewInput, type ViewPt } from './protocol3p';
import type { GameSkills, Shot } from './types';

/** the painted course: three holes side by side, each a tee, a fairway, a green with a bunker beside it, on rough; the ground rolls a few metres */
export function scriptCourse(): Export3pInput {
  let id = 1;
  const rect = (surface: GolfSurface, x0: number, y0: number, x1: number, y1: number): CourseArea => ({ id: id++, surface, pts: [x0, y0, x1, y0, x1, y1, x0, y1] });
  const disc = (surface: GolfSurface, cx: number, cy: number, r: number, n = 24): CourseArea => ({ id: id++, surface, pts: Array.from({ length: n }, (_, k) => [cx + r * Math.cos(2 * Math.PI * k / n), cy + r * Math.sin(2 * Math.PI * k / n)]).flat() });
  const areas: CourseArea[] = [rect('rough', 80, 40, 420, 420)], tees: TeeMark[] = [], pins: Pin[] = [], aims: AimPoint[] = [];
  for (const h of [{ n: 1, x: 120, len: 150 }, { n: 2, x: 230, len: 190 }, { n: 3, x: 340, len: 80 }]) {
    const teeY = 400, greenY = teeY - h.len;
    areas.push(rect('fairway', h.x - 15, greenY + 8, h.x + 15, teeY - 20), rect('tee', h.x - 5, teeY - 6, h.x + 5, teeY + 6), disc('green', h.x, greenY, 12), disc('bunker', h.x + 17, greenY + 4, 4));
    tees.push({ hole: h.n, kind: 'back', x: h.x, y: teeY + 3 });
    pins.push({ hole: h.n, x: h.x + 2, y: greenY - 1 });
  }
  return { areas, tees, pins, aims, heightAt: (x, y) => 3 * Math.sin(x / 37) + 2 * Math.cos(y / 53), name: 'Script links', id: 'script-links', date: '2026-11-13' };
}

/** a scripted host: the course message, the session's start and input, and the model's strokes (the owner's, in order) to check the view against */
export interface ScriptHost {
  courseMsg: CourseMsg;
  start(): HostMsg[];
  input(vi: ViewInput): HostMsg[];
  /** the model's strokes of the owner so far, as the view's frame has them: where each started and came to rest (rest: the ball's own rest; next: where
   *  the next stroke is played from, the drop after a penalty), and whether it went in */
  strokes(): { hole: number; stroke: number; from: ViewPt; rest: ViewPt; next: ViewPt; holed: boolean }[];
}

export async function scriptedHost(skills: GameSkills = { driving: 0.75, irons: 0.75, short: 0.75, putting: 0.75 }, seed = 4242): Promise<ScriptHost> {
  const file = await exportCourse3p(scriptCourse()), share = shareOf(file, null, { name: 'Script links', biome: 'parkland', type: 'private', seed });
  const { view, frame, height } = await shareView(share), courseMsg = await shareCourseMsg(share, view, 1), c = { x: frame.cx, y: frame.cy };
  const play = new Play3p({ view, holes: [0, 1, 2], skills, sex: 'm', seed, frame, height });
  const restOf = (s: Shot) => s.landing ? s.landing.rest : s.to;
  return {
    courseMsg,
    start: () => play.start(),
    input: (vi) => play.input(vi),
    strokes: () => play.plan.shots.filter(s => s.golfer === play.me).sort((a, b) => a.t - b.t)
      .map(s => ({ hole: view.holes[s.hole]?.n ?? s.hole + 1, stroke: s.stroke, from: toView(s.from, c), rest: toView(restOf(s), c), next: toView(s.to, c), holed: s.holed })),
  };
}

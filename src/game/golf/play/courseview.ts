// The played course (docs/GOLF-PLAY.md P2a): the derived holes that have a line, in play order (18 of them), and the lie at any point of the course.
// The engine gives the surface at a point (the course grid, else the painted areas); off the painted course the distance to the played lines decides
// between rough and out of bounds. Pure TS, no DOM.
import type { Hole, Pt } from '../holes';
import type { GolfSurface } from '../types';
import type { CourseView, Lie, PlayHole } from './types';

/** the holes a round plays: 18, in order. A course with fewer is cycled (a 9-hole course is played twice), one with more gives its first 18 */
const PLAYED = 18;
/** a point with no surface is out of bounds when it is farther than this from every played line (tiles: 40 tiles, 80 m) */
const OUT_TILES = 40;
/** the lie each golf surface plays as: the fringe and the first cut play as fairway, the waste area as sand, the long grass as heavy rough (T238: the
 *  deep grass lie, worse than the rough); paths and other paint as rough */
const LIE: Record<GolfSurface, Lie> = { green: 'green', fringe: 'fairway', tee: 'tee', fairway: 'fairway', firstCut: 'fairway', rough: 'rough', longGrass: 'fescue', fescue: 'fescue', bunker: 'bunker', waste: 'bunker', water: 'water', path: 'rough', other: 'rough' };

/** the distance (tiles) from (x, y) to the nearest point of the polyline line (infinite for a line with no segment) */
function lineDist(line: Pt[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!, b = line[i + 1]!, dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
  }
  return best;
}

/** the course a round is played on: the holes with a line of two points or more, in order, played out to 18 (see PLAYED; PlayHole.n is the hole's own
 *  number, so a 9-hole course shows its numbers twice). lieAt is the lie of the surface at the point (surfAt; a surface of null is no painted course),
 *  and off the course rough within OUT_TILES of a played line, else out of bounds. No holes: an empty course, every point out of bounds */
export function makeCourseView(holes: Hole[], surfAt: (x: number, y: number) => GolfSurface | null): CourseView {
  const lines = holes.filter(h => h.line.length >= 2), N = lines.length, played: PlayHole[] = [];
  for (let i = 0; N > 0 && i < PLAYED; i++) {
    const h = lines[i % N]!, line = h.line;
    played.push({ n: h.n, par: h.par, tee: line[0]!, pin: line[line.length - 1]!, line });
  }
  const plines = lines.slice(0, PLAYED).map(h => h.line);
  return {
    holes: played,
    lieAt(x: number, y: number): Lie {
      const s = surfAt(x, y);
      if (s) return LIE[s];
      for (const L of plines) if (lineDist(L, x, y) <= OUT_TILES) return 'rough';
      return 'out';
    },
  };
}

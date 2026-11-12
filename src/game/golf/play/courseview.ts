// The played course (docs/GOLF-PLAY.md P2a): the derived holes that have a line, in play order (18 of them), and the lie at any point of the course.
// The engine gives the surface at a point (the course grid, else the painted areas); off the painted course the distance to the played lines decides
// between rough and out of bounds. Pure TS, no DOM.
import type { Hole, Pt } from '../holes';
import type { GolfSurface, TeeKind } from '../types';
import { nearestSet } from '../teesets';
import { lieKindOfSurface, type LieKind } from './lies';
import type { CourseView, Lie, PlayHole } from './types';

/** the holes a round plays: 18, in order. A course with fewer is cycled (a 9-hole course is played twice), one with more gives its first 18 */
const PLAYED = 18;
/** a point with no surface is out of bounds when it is farther than this from every played line (tiles: 40 tiles, 80 m) */
const OUT_TILES = 40;
/** the lie each golf surface plays as: the fringe and the first cut play as fairway, the waste area as sand, the long grass as heavy rough (T238: the
 *  deep grass lie, worse than the rough); paths and other paint as rough */
const LIE: Record<GolfSurface, Lie> = { green: 'green', fringe: 'fairway', tee: 'tee', fairway: 'fairway', firstCut: 'fairway', rough: 'rough', longGrass: 'fescue', fescue: 'fescue', bunker: 'bunker', waste: 'bunker', water: 'water', path: 'rough', other: 'rough' };

/** T334: a rough ball within this many tiles (3 m) of a fairway, a fringe, a tee or a green plays from the first cut (the band of rough beside the fairway) */
export const FIRST_CUT_TILES = 1.5;
/** the eight points round a ball the first cut looks at (FIRST_CUT_TILES out, the diagonals on the same circle) */
const RING: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]].map(([a, b]) => [a! * FIRST_CUT_TILES, b! * FIRST_CUT_TILES] as const);

/** T438: whether (x, y) is within OUT_TILES of a played line, as `lines.some(L => lineDist(L, x, y) <= OUT_TILES)` says, fast: the first call stamps
 *  each segment's distance onto a one-tile lattice round the lines (the nearest at each cell's middle); a point whose cell is surely in (its middle's
 *  distance plus the half diagonal within) or surely out is answered from it, one near the edge is measured as before. A painted course's lie grid
 *  for the view asked this of some 800 000 points one line at a time */
function nearLines(lines: Pt[][]): (x: number, y: number) => boolean {
  const exact = (x: number, y: number) => { for (const L of lines) if (lineDist(L, x, y) <= OUT_TILES) return true; return false; };
  let m: { x0: number; y0: number; w: number; h: number; d: Float32Array } | null = null;
  const R = OUT_TILES + 2, HALF = 0.75;   // (the half diagonal of a cell is 0.7071; a little more for the float's rounding)
  return (x, y) => {
    if (!m) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const L of lines) if (L.length >= 2) for (const p of L) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      if (!Number.isFinite(x0)) return false;
      const gx = Math.floor(x0 - R), gy = Math.floor(y0 - R), w = Math.ceil(x1 + R) - gx + 1, h = Math.ceil(y1 + R) - gy + 1, d = new Float32Array(w * h).fill(Infinity);
      for (const L of lines) for (let i = 0; i + 1 < L.length; i++) {
        const a = L[i]!, b = L[i + 1]!, dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
        const i0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - R) - gx), i1 = Math.min(w - 1, Math.ceil(Math.max(a.x, b.x) + R) - gx);
        const j0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - R) - gy), j1 = Math.min(h - 1, Math.ceil(Math.max(a.y, b.y) + R) - gy);
        for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) {
          const px = gx + k + 0.5, py = gy + j + 0.5, t = L2 > 0 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / L2)) : 0;
          const e = Math.hypot(px - a.x - dx * t, py - a.y - dy * t), q = j * w + k; if (e < d[q]!) d[q] = e;
        }
      }
      m = { x0: gx, y0: gy, w, h, d };
    }
    const i = Math.floor(x) - m.x0, j = Math.floor(y) - m.y0;
    if (i < 0 || j < 0 || i >= m.w || j >= m.h) return false;   // (beyond every line's reach: the lattice runs OUT_TILES + 2 round them)
    const e = m.d[j * m.w + i]!;
    if (e + HALF <= OUT_TILES) return true;
    if (e - HALF > OUT_TILES) return false;
    return exact(x, y);
  };
}

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

/** T254: the hole as a golfer who plays from the `want` set plays it: that set's tee and line, else the nearest set's (golf/teesets.ts nearestSet);
 *  the hole as it is with no want or one set */
export function holeFrom(h: PlayHole, want: TeeKind | undefined): PlayHole {
  if (!want || !h.sets?.length) return h;
  const k = nearestSet(h.sets.map(s => s.kind), want), s = h.sets.find(q => q.kind === k);
  return s && s.tee !== h.tee ? { ...h, tee: s.tee, line: s.line } : h;
}

/** the course a round is played on: the holes with a line of two points or more, in order, played out to 18 (see PLAYED; PlayHole.n is the hole's own
 *  number, so a 9-hole course shows its numbers twice). lieAt is the lie of the surface at the point (surfAt; a surface of null is no painted course),
 *  and off the course rough within OUT_TILES of a played line, else out of bounds. No holes: an empty course, every point out of bounds.
 *  T353 (#995): lotAt(x, y) is true where a house lot lies (golf/estate.ts): private land, so a ball that comes to rest on it is out of bounds, whatever the
 *  course grid says there (the lots stand off the painted course; the check comes first so a lot laid over unpainted land is out all the same) */
export function makeCourseView(holes: Hole[], surfAt: (x: number, y: number) => GolfSurface | null, lotAt?: (x: number, y: number) => boolean): CourseView {
  const lines = holes.filter(h => h.line.length >= 2), N = lines.length, played: PlayHole[] = [];
  for (let i = 0; N > 0 && i < PLAYED; i++) {
    const h = lines[i % N]!, line = h.line;
    const sets = (h.sets ?? []).filter(s => s.line.length >= 2).map(s => ({ kind: s.kind, tee: s.line[0]!, line: s.line })); // T254
    played.push({ n: h.n, par: h.par, tee: line[0]!, pin: line[line.length - 1]!, line, ...(sets.length > 1 ? { sets } : {}) });
  }
  const plines = lines.slice(0, PLAYED).map(h => h.line), near = nearLines(plines);
  return {
    holes: played,
    lieAt(x: number, y: number): Lie {
      if (lotAt?.(x, y)) return 'out';
      const s = surfAt(x, y);
      if (s) return LIE[s];
      return near(x, y) ? 'rough' : 'out';
    },
    // T334: the finer lie: the surface's own kind (lies.ts lieKindOfSurface), and a rough one within FIRST_CUT_TILES of a fairway, fringe, tee or green as the first cut
    kindAt(x: number, y: number): LieKind {
      if (lotAt?.(x, y)) return 'out';
      const s = surfAt(x, y);
      if (!s) return near(x, y) ? 'rough' : 'out';
      const k = lieKindOfSurface(s);
      if (k !== 'rough' || s === 'path') return k;
      for (const [dx, dy] of RING) { const q = surfAt(x + dx!, y + dy!); if (q === 'fairway' || q === 'fringe' || q === 'tee' || q === 'green') return 'firstcut'; }
      return 'rough';
    },
  };
}

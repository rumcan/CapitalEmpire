// T422 (docs/CINDERLINKS-PORT.md): the host's lies for the view from behind the golfer. The model reads a ball's finer lie from the painted course
// (CourseView.kindAt: the fairway, the first cut, the rough, the deep rough, the fescue, ...), one 2 m tile at a time; the view draws its own grass from
// the course's shapes and its course type. So the view does not guess where the first cut, the rough and the fescue are, the course message carries
// the host's kinds as a grid over the course, one cell a tile, and the view draws those grounds where the grid says (Cinderlinks hostLie).
// The grid is run-length coded (the painted course is long runs of one kind) and sits in the view's frame: metres from the course's centre, x east,
// y south (protocol3p.ts), cell (i, j) covering [x0 + i step, x0 + (i + 1) step) x [y0 + j step, ...).
// Pure TS, no DOM.
import { TILE_M } from '../types';
import type { CourseView, Pt } from './types';
import type { LieKind } from './lies';

/** the kinds as the grid codes them (index = code). Code 0 is anything off the painted course (out of bounds, or a kind the view need not draw) */
export const LIE_CODES: readonly (LieKind | 'none')[] = ['none', 'fairway', 'firstcut', 'rough', 'deep', 'fescue', 'tee', 'green', 'bunker', 'water'];

/** the host's lies over the course: the grid's corner and cell (m, the view's frame), its size in cells, and the codes run-length coded row by row
 *  from the top left: [code, count, code, count, ...] */
export interface LieGrid { x0: number; y0: number; step: number; w: number; h: number; r: number[] }

/** the lie grid over the tile box [x0, y0, x1, y1] (tiles, inclusive of x0 and y0, exclusive of x1 and y1) of a course, each cell read at its tile's
 *  middle with the model's own kindAt (lieAt's coarse lie where there is none), in the view's frame about `centre` (tiles) */
export function lieGrid3p(view: Pick<CourseView, 'lieAt' | 'kindAt'>, box: readonly [number, number, number, number], centre: Pt): LieGrid {
  const job = lieGridJob(view, box, centre); let g: LieGrid | null = null;
  while (!(g = job.step(Infinity)));
  return g;
}

/** T438: lieGrid3p in slices, so the view's first picture need not wait for it: each step(ms) reads rows until about ms have gone by and returns the grid
 *  once the last row is read (null until then). The same grid as lieGrid3p */
export function lieGridJob(view: Pick<CourseView, 'lieAt' | 'kindAt'>, box: readonly [number, number, number, number], centre: Pt): { step(ms: number): LieGrid | null; readonly done: boolean } {
  const tx0 = Math.floor(box[0]), ty0 = Math.floor(box[1]), w = Math.max(0, Math.ceil(box[2]) - tx0), h = Math.max(0, Math.ceil(box[3]) - ty0), r: number[] = [];
  let last = -1, n = 0, j = 0, out: LieGrid | null = null;
  const code = new Map<string, number>(LIE_CODES.map((k, i) => [k, i])); code.set('waste', code.get('bunker')!);   // (T455: the view draws the waste area as sand)
  return {
    get done() { return !!out; },
    step(ms: number) {
      if (out) return out;
      const t0 = performance.now();
      for (; j < h; j++) {
        if (j > 0 && performance.now() - t0 > ms) return null;
        for (let i = 0; i < w; i++) {
          const x = tx0 + i + 0.5, y = ty0 + j + 0.5, k = view.kindAt ? view.kindAt(x, y) : view.lieAt(x, y);
          const c = code.get(k) ?? 0;
          if (c === last) n++; else { if (n) r.push(last, n); last = c; n = 1; }
        }
      }
      if (n) r.push(last, n);
      return out = { x0: (tx0 - centre.x) * TILE_M, y0: (ty0 - centre.y) * TILE_M, step: TILE_M, w, h, r };
    },
  };
}

/** the kind the grid holds at the view's point (x, y) (metres), or null off the grid or where it holds none */
export function lieGridAt(g: LieGrid, x: number, y: number): LieKind | null {
  const i = Math.floor((x - g.x0) / g.step), j = Math.floor((y - g.y0) / g.step);
  if (i < 0 || j < 0 || i >= g.w || j >= g.h) return null;
  let at = j * g.w + i;
  for (let k = 0; k < g.r.length; k += 2) { const n = g.r[k + 1]!; if (at < n) { const c = LIE_CODES[g.r[k]!]; return c && c !== 'none' ? c : null; } at -= n; }
  return null;
}

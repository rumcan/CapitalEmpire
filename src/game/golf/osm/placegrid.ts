// A real course laid on the course grid of a game under way (T356, #998): the cells the placing changes, as one GridDiff the engine's own grid pipeline takes
// (applyDiff, then Game.courseGridChanged: the workers' cells, the ground that re-bakes itself, the trees that go). The painted spec (raster.ts paintSpec on a
// scratch grid of its frame) is copied into the cells of the land bought (the cover); the old course's cells outside it, those of a hole, are cleared (the
// holes it had are replaced by the real course's). Pure TypeScript, no DOM.
import { CELL_T, makeGrid, type Grid, type GridDiff } from '../../ext/course-grid';
import { unitBuildCost } from '../costs';
import { SURF_SURFACE } from '../../ext/course-grid/areas';
import type { Rect } from '../mode';
import { paintSpec } from './raster';
import type { OsmCourseSpec } from './types';

/** the scratch grid of a spec laid at (ox, oy) on the map: its frame, painted (cell 0.5 tile) */
export function scratchOf(spec: OsmCourseSpec, ox: number, oy: number): Grid {
  const g = makeGrid(ox, oy, Math.round(spec.w / CELL_T), Math.round(spec.h / CELL_T));
  paintSpec(g, spec, ox, oy);
  return g;
}

/** the price of the surfaces of a painted grid, $: each cell's surface at the paint tool's price (golf/costs.ts unitBuildCost, seed), a cell a square metre */
export function gridBuildCost(g: Grid): number {
  const n = new Float64Array(16);
  for (let i = 0; i < g.surf.length; i++) n[g.surf[i]!]!++;
  let cost = 0;
  // (a cell is 1 m x 1 m, a square metre: the paint prices are a square metre)
  for (let s = 1; s < 16; s++) if (n[s]) cost += n[s]! * unitBuildCost(SURF_SURFACE[s] ?? 'other', 'seed');
  return Math.round(cost);
}

/** the cells of the course grid g to change: inside the cover (rects of tiles) each cell takes the scratch grid's surface, hole and month (the spec laid
 *  at the map position the scratch grid has) and loses its carve mark and custom grass; outside it, with clearHoles, every cell of a hole (1..18) is cleared
 *  (the old course goes: its holes are replaced). Cells that would not change are left out. The scratch grid must hold the cover */
export function placeDiff(g: Grid, scratch: Grid, cover: readonly Rect[], clearHoles = true): GridDiff {
  const gx = Math.round((g.x0 - scratch.x0) / CELL_T), gy = Math.round((g.y0 - scratch.y0) / CELL_T);
  const inCover = (cx: number, cy: number): boolean => {
    const x = g.x0 + (cx + 0.5) * CELL_T, y = g.y0 + (cy + 0.5) * CELL_T;
    for (const r of cover) if (x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]) return true;
    return false;
  };
  /** the cell ranges of the cover in g: [cx0, cx1) x [cy0, cy1) per rect, clipped to g */
  const boxes = cover.map(r => [Math.max(0, Math.round((r[0] - g.x0) / CELL_T)), Math.max(0, Math.round((r[1] - g.y0) / CELL_T)), Math.min(g.w, Math.round((r[0] + r[2] - g.x0) / CELL_T)), Math.min(g.h, Math.round((r[1] + r[3] - g.y0) / CELL_T))] as const);
  const differs = (i: number, s1: number, h1: number, m1: number): boolean => g.surf[i] !== s1 || g.hole[i] !== h1 || g.month[i] !== m1 || !!g.carve?.[i] || !!g.look?.[i];
  const visit = (put: (i: number, s1: number, h1: number, m1: number) => void) => {
    for (const [x0, y0, x1, y1] of boxes) for (let cy = y0; cy < y1; cy++) {
      const sy = cy + gy; if (sy < 0 || sy >= scratch.h) continue;
      for (let cx = x0; cx < x1; cx++) {
        const sx = cx + gx; if (sx < 0 || sx >= scratch.w) continue;
        const i = cy * g.w + cx, j = sy * scratch.w + sx, s1 = scratch.surf[j]!, h1 = scratch.hole[j]!, m1 = scratch.month[j]!;
        if (differs(i, s1, h1, m1)) put(i, s1, h1, m1);
      }
    }
    if (clearHoles) for (let i = 0; i < g.hole.length; i++) {
      if (!g.hole[i]) continue;
      const cx = i % g.w, cy = (i - cx) / g.w;
      if (!inCover(cx, cy)) put(i, 0, 0, 0);
    }
  };
  let n = 0;
  visit(() => { n++; });
  const idx = new Uint32Array(n), s0 = new Uint8Array(n), h0 = new Uint8Array(n), m0 = new Uint16Array(n), s1 = new Uint8Array(n), h1 = new Uint8Array(n), m1 = new Uint16Array(n), c0 = new Uint8Array(n), c1 = new Uint8Array(n);
  const k0 = g.look ? new Uint8Array(n) : undefined, k1 = g.look ? new Uint8Array(n) : undefined;
  let k = 0;
  visit((i, s, h, m) => {
    idx[k] = i; s0[k] = g.surf[i]!; h0[k] = g.hole[i]!; m0[k] = g.month[i]!; s1[k] = s; h1[k] = h; m1[k] = m;
    c0[k] = g.carve?.[i] ?? 0; c1[k] = 0;
    if (k0) k0[k] = g.look![i]!;
    k++;
  });
  return { x0: g.x0, y0: g.y0, w: g.w, n, idx, s0, h0, m0, s1, h1, m1, c0, c1, ...(k0 && k1 ? { k0, k1 } : {}) };
}

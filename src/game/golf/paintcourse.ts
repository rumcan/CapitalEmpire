// The golf course's painted areas (docs/GOLF-PLAN.md section 4): each course surface becomes an ordinary Paint area, and big areas are cut into CELL-tile cells. Pure TS, no DOM.
import { checkArea, clampStyle, DEFAULT_STYLE, MIN_AREA, polyArea, polyBox, type PaintArea, type PaintTex } from '../paint';
import { surfacePreset } from '../paint-presets';
import type { CourseLayout, GolfSurface } from './types';

/** each course surface's own Paint texture and its corner radius (tiles); the owner's preset for a surface wins (paint-presets.ts
 *  surfacePreset: the fescue lays the owner's Fescue preset, as the woodland floor does) */
export const SURFACE_TEX: Record<GolfSurface, { tex: PaintTex; radius: number }> = {
  green: { tex: 'golfGreen', radius: 0 }, fringe: { tex: 'golfFringe', radius: 0 }, tee: { tex: 'golfTee', radius: 1 },
  fairway: { tex: 'golfFairway', radius: 4 }, firstCut: { tex: 'golfFirstCut', radius: 2 }, rough: { tex: 'golfRough', radius: 0 },
  fescue: { tex: 'golfFescue', radius: 2 }, bunker: { tex: 'bunkerSand', radius: 0 }, waste: { tex: 'wasteSand', radius: 1 },
  water: { tex: 'waterDark', radius: 0 }, path: { tex: 'spectatorPath', radius: 1 }, other: { tex: 'grass', radius: 0 },
};
/** the side of the cells big areas are cut into, tiles (under MAX_SIDE) */
export const CELL = 200;

/** a tile value rounded to quarter tiles (no -0) */
const q4 = (v: number) => Math.round(v * 4) / 4 + 0;

/** the outline with consecutive duplicate corners dropped, the closing pair included */
function dedupe(pts: number[]): number[] {
  const out: number[] = [];
  for (let k = 0; k < pts.length; k += 2) {
    const m = out.length;
    if (m && out[m - 2] === pts[k] && out[m - 1] === pts[k + 1]) continue;
    out.push(pts[k]!, pts[k + 1]!);
  }
  while (out.length >= 4 && out[out.length - 2] === out[0] && out[out.length - 1] === out[1]) out.length -= 2;
  return out;
}

/** the closed polygon x0 y0 x1 y1 ... clipped to the axis-aligned box (x0, y0)-(x1, y1) by Sutherland-Hodgman; [] when nothing is left */
export function clipToBox(pts: number[], x0: number, y0: number, x1: number, y1: number): number[] {
  // the box's four sides as [axis (0 x, 1 y), sign, limit]: a point is inside a side when sign * (its coordinate - limit) >= 0
  const sides: [number, number, number][] = [[0, 1, x0], [0, -1, x1], [1, 1, y0], [1, -1, y1]];
  let cur = pts.slice();
  for (const [axis, sg, lim] of sides) {
    const d = (x: number, y: number) => sg * ((axis ? y : x) - lim), out: number[] = [], n = cur.length >> 1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = cur[2 * i]!, ay = cur[2 * i + 1]!, bx = cur[2 * j]!, by = cur[2 * j + 1]!;
      const da = d(ax, ay), db = d(bx, by);
      if (da >= 0) out.push(ax, ay);
      if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push(ax + (bx - ax) * t, ay + (by - ay) * t); }
    }
    cur = out;
  }
  return cur.length >= 6 ? cur : [];
}

/** the course's Paint areas in paint order (SURFACE_TEX styles, big areas cut into CELL cells in row order); a piece that fails checkArea is dropped and counted in stats.dropped when stats is given */
export function courseAreas(l: CourseLayout, stats?: { dropped: number }): Omit<PaintArea, 'id'>[] {
  const out: Omit<PaintArea, 'id'>[] = [];
  for (const a of l.areas) {
    // the owner's first preset standing for the surface (the studio's Texture presets), else the game's texture
    const { tex: old, radius } = SURFACE_TEX[a.surface], tex = surfacePreset(a.surface) ?? old, style = clampStyle({ ...DEFAULT_STYLE, tex, radius });
    const [x0, y0, x1, y1] = polyBox(a.pts);
    // the pieces: the outline itself when it fits a cell, else its clip to every cell it touches
    const pieces: number[][] = [];
    if (Math.max(x1 - x0, y1 - y0) > CELL) {
      for (let cy = Math.floor(y0 / CELL) * CELL; cy < y1; cy += CELL)
        for (let cx = Math.floor(x0 / CELL) * CELL; cx < x1; cx += CELL) {
          const c = clipToBox(a.pts, cx, cy, cx + CELL, cy + CELL);
          if (c.length) pieces.push(c);
        }
    } else pieces.push(a.pts);
    for (const p of pieces) {
      const q = dedupe(p.map(q4));
      if (Math.abs(polyArea(q)) < MIN_AREA) continue;
      if (checkArea(q) !== '') { if (stats) stats.dropped++; continue; }
      out.push({ ...style, pts: q });
    }
  }
  return out;
}

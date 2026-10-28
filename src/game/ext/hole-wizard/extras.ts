// New hole's ghost extras (plan P23-UX 6.2 P2-10, T176): which trees a Build clears (the very rules the game clears them by: a placed tree on a
// playing surface cell, a planted forest or town tree with a course cell within its clearance), the collar ring a Build lays round its surfaces
// (course-blobs' automatic collars: a band of cells over the cells they may cover), and the fade of the map's labels near the pointer. Pure TS,
// no DOM; no new simulation.
import { SURF, surfRank } from '../course-grid';
import { BLOB_STYLE } from '../course-blobs';

// ---- the trees a Build clears ----

/** a planted tree's clearance radius, tiles: a forest tree's (Engine.plantCell: free(x, y, 1)) and a town tree's (towntrees.ts CLEAR) */
export const FOREST_CLEAR = 1, TOWN_CLEAR = 1.6;

/** the points a planted tree's clearance reads (Engine.treeClearance): eight round it at radius r, then its trunk; flat x y pairs */
export function clearancePoints(x: number, y: number, r: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < 9; k++) { const a = (k * Math.PI) / 4; out.push(x + (k < 8 ? Math.cos(a) * r : 0), y + (k < 8 ? Math.sin(a) * r : 0)); }
  return out;
}
/** whether a planted tree (a forest or town tree sprite, its trunk at (x, y), clearance r) is not planted again round the course: a course cell of
 *  any surface (rough too) on one of its clearance points. surfAt: the grid's surface id at a tile (0: none) */
export function plantedTreeCleared(surfAt: (x: number, y: number) => number, x: number, y: number, r: number): boolean {
  const p = clearancePoints(x, y, r);
  for (let k = 0; k < p.length; k += 2) if (surfAt(p[k]!, p[k + 1]!)) return true;
  return false;
}
/** whether a placed tree (a prop, its foot's middle at (x, y)) goes: it stands on a playing surface cell (water, fairway, tee, bunker, waste,
 *  green: Engine.clearTreesOnGrid) */
export function propTreeCleared(surfAt: (x: number, y: number) => number, x: number, y: number): boolean { return surfRank(surfAt(x, y)) >= surfRank(SURF.water); }

/** a tree near a planned hole: a planted sprite (its trunk and clearance) or a placed prop (its foot's middle) */
export interface NearTree { x: number; y: number; planted: boolean; r: number }
/** the trees of near a Build clears, by index, when the grid reads after (the surface each cell will hold once built: Engine.wizardTrees) */
export function treesCleared(near: readonly NearTree[], after: (x: number, y: number) => number): number[] {
  const out: number[] = [];
  near.forEach((t, i) => { if (t.planted ? plantedTreeCleared(after, t.x, t.y, t.r) : propTreeCleared(after, t.x, t.y)) out.push(i); });
  return out;
}

// ---- the collar ring ----

/** the collar a surface lays (course-blobs BLOB_STYLE): its width in whole cells and the surfaces it may lie over; null: none */
export function collarOf(s: number): { cells: number; over: ReadonlySet<number> } | null {
  const c = BLOB_STYLE[s]?.collar; return c ? { cells: Math.max(1, Math.round(c.width)), over: new Set(c.over) } : null;
}
/** the collar ring cells of a window (w x h cells, row-major): around each cell of `laid` (window index → its new surface) whose surface has a
 *  collar, the cells within its width (a disc, as course-blobs dilate) whose surface (after: the window's surfaces once built) the collar may lie
 *  over and that are not laid with that surface themselves. Returns window index → the surface whose collar it is (the first, in surface order:
 *  green before tee before fairway, as the green's fringe lies over the fairway) */
export function collarCells(after: Uint8Array, w: number, h: number, laid: ReadonlyMap<number, number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of [SURF.green, SURF.tee, SURF.fairway, SURF.bunker, SURF.water]) {
    const col = collarOf(s); if (!col) continue;
    const r = col.cells, r2 = r * r;
    for (const [i, si] of laid) {
      if (si !== s) continue;
      const cx = i % w, cy = (i - cx) / w;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const j = y * w + x; if (out.has(j) || after[j] === s || !col.over.has(after[j]!)) continue;
        out.set(j, s);
      }
    }
  }
  return out;
}

// ---- the labels near the pointer ----

/** how near the pointer the map's labels fade while New hole's ghost is up (css px), and to what */
export const LABEL_FADE_PX = 60, LABEL_FADE_ALPHA = 0.3;
/** a label's alpha with the pointer at (px, py): LABEL_FADE_ALPHA when its box (x, y, w, h) comes within r of the pointer, else 1 */
export function labelFade(x: number, y: number, w: number, h: number, px: number, py: number, r = LABEL_FADE_PX, a = LABEL_FADE_ALPHA): number {
  const dx = Math.max(x - px, 0, px - (x + w)), dy = Math.max(y - py, 0, py - (y + h));
  return dx * dx + dy * dy < r * r ? a : 1;
}

// Where a Paint brush dab lands (T108, T109): on the course's 1 m half grid, the "mini grid" (one town square split into 4). Kept apart from
// index.ts (the cursor's drawing) so the Paint tool imports it without the cursor's art; both use it, so what the cursor shows is what a click
// paints. Pure; units: tiles of 2 m (a cell is CELL_T = half a tile).
import { CELL_T } from '../course-grid';

/** a round brush dab's centre on the half grid: the nearest cell corner (a multiple of CELL_T, 1 m), so a dab and its footprint move cell by
 *  cell with the pointer and never jitter inside a cell */
export function snapDab(v: number): number { return Math.round(v / CELL_T) * CELL_T; }

/** the square brushes (T109), n x n cells: 1 (one 1 m cell, the default), 2 (one town square), 3 and 4 (two by two town squares) */
export const SQUARE_SIZES = [1, 2, 3, 4] as const;
/** the first cell index (on one axis) of an n-cell square brush with the pointer at v tiles: an odd size centres on the cell under the pointer;
 *  an even size lies on the town grid (2 x 2 is exactly the town square under the pointer, 4 x 4 the four round the nearest tile corner), so
 *  it lines up with the roads and lots */
export function squareStart(v: number, n: number): number {
  if (n % 2) return Math.floor(v / CELL_T) - (n - 1) / 2;
  const c = (n / 2) % 2 ? Math.floor(v) + 0.5 : Math.round(v); // the centre: a tile's middle, or a tile corner
  return Math.round((c - (n * CELL_T) / 2) / CELL_T);
}
/** the square of n x n cells starting at cell (ix, iy), as the four corners of a polygon in tiles (its cells' centres lie inside it) */
export function squarePoly(ix: number, iy: number, n: number): { x: number; y: number }[] {
  const x0 = ix * CELL_T, y0 = iy * CELL_T, x1 = (ix + n) * CELL_T, y1 = (iy + n) * CELL_T;
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}
/** the squares a drag lays from start cell (ax, ay) to (bx, by), one cell step at a time along one axis (so even a one-cell brush leaves no
 *  gap, not even a corner), the first one left out (it was laid already); calls lay for each start cell */
export function squareRun(ax: number, ay: number, bx: number, by: number, lay: (ix: number, iy: number) => void): void {
  let x = ax, y = ay;
  while (x !== bx || y !== by) {
    if (Math.abs(bx - x) >= Math.abs(by - y)) x += Math.sign(bx - x); else y += Math.sign(by - y);
    lay(x, y);
  }
}

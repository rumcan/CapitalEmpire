// Run (T122, plan P23 4.5, P1-G): the road-like strip of cells. Click a start, click each bend, finish with a double-click, Enter or a
// right-click; Shift keeps a leg straight. The strip is the square brush (n x n cells, 1 to 4) swept along the line from bend to bend one
// cell step at a time, so it is exactly as wide as the brush, it has no gap at a bend (not even a corner: each step shares an edge with the
// last), and it holds the squares at both ends, which is what the cursor's footprint showed where each click landed.
// A bend is kept as the middle of the square the square brush lays there (tiles), so the size can change while a run is drawn: each bend
// then re-snaps to the new size as snap.ts's squareStart puts it. Pure (no DOM), used by the Paint tool (laying the run) and the course
// cursor (its footprint), so what the cursor shows is what a finished run lays. Units: tiles of 2 m; cells of CELL_T (1 m).
import { CELL_T } from '../course-grid';
import { squareStart } from './snap';

/** where a run's bend lands with the pointer at tile (x, y) and the n-cell square brush: the middle of the square the brush lays there */
export function runPoint(x: number, y: number, n: number): { x: number; y: number } {
  return { x: (squareStart(x, n) + n / 2) * CELL_T, y: (squareStart(y, n) + n / 2) * CELL_T };
}

/** the lattice the bends of an n-cell run sit on (cells): an odd square on any cell, an even one on the town grid (two cells a step) */
const stepOf = (n: number) => (n % 2 ? 1 : 2);

/** Shift: the bend a straight leg from the bend at (ax, ay) toward the pointer's bend (bx, by) ends on (tiles; both are runPoint middles):
 *  along a grid axis when the leg is within about 22° of it, else on the 45° diagonal, as the road tool's Shift (engine legsTo) */
export function straightTo(ax: number, ay: number, bx: number, by: number, n: number): { x: number; y: number } {
  const sx = squareStart(ax, n), sy = squareStart(ay, n), dx = squareStart(bx, n) - sx, dy = squareStart(by, n) - sy, adx = Math.abs(dx), ady = Math.abs(dy);
  let ex = sx + dx, ey = sy + dy;
  if (adx >= 2.4 * ady) ey = sy;
  else if (ady >= 2.4 * adx) ex = sx;
  else { const st = stepOf(n), k = Math.round((adx + ady) / 2 / st) * st; ex = sx + Math.sign(dx) * k; ey = sy + Math.sign(dy) * k; }
  return { x: (ex + n / 2) * CELL_T, y: (ey + n / 2) * CELL_T };
}

/** the walk from square start (ax, ay) to (bx, by), one cell step at a time along one axis, keeping to the straight line between them (the
 *  axis whose next cell edge the line crosses first; a tie steps y first), the first square left out; calls lay for each square start */
export function walk(ax: number, ay: number, bx: number, by: number, lay: (ix: number, iy: number, dx: number, dy: number) => void): void {
  const nx = Math.abs(bx - ax), ny = Math.abs(by - ay), sx = Math.sign(bx - ax), sy = Math.sign(by - ay);
  let x = ax, y = ay;
  for (let i = 0, j = 0; i < nx || j < ny;) {
    if ((1 + 2 * i) * ny < (1 + 2 * j) * nx) { x += sx; i++; lay(x, y, sx, 0); } else { y += sy; j++; lay(x, y, 0, sy); }
  }
}

/** the run's length in metres: its line from bend to bend (path: the bends' middles, tiles, x y pairs) plus the square at its ends, so a
 *  straight run along a grid axis reads exactly the strip's length (40 m by 2 cells: 80 cells) */
export function runLength(path: readonly number[], n: number): number {
  if (path.length < 2) return 0;
  let m = 0;
  for (let k = 2; k + 1 < path.length; k += 2) m += Math.hypot(path[k]! - path[k - 2]!, path[k + 1]! - path[k - 1]!);
  return Math.round((m * 2 + n * CELL_T * 2) * 10) / 10;
}

/** a cell's key for sorting (world cells, each axis within ±32767): row-major, y then x */
const keyOf = (cx: number, cy: number) => (cy + 32768) * 65536 + (cx + 32768);

/** the world cells (cx, cy pairs; cell (cx, cy) spans tiles cx * CELL_T to (cx + 1) * CELL_T) the n x n square brush lays swept along the
 *  path (the bends' middles, tiles, x y pairs; one bend: its square alone), each cell once, sorted row-major (y, then x). Per cell step only
 *  the row or column of n cells the square moves into is new, so a run of L steps makes n² + L n candidates before the duplicates go */
export function runCells(path: readonly number[], n: number): Int32Array {
  if (path.length < 2 || n < 1) return new Int32Array(0);
  let keys = new Uint32Array(64), m = 0;
  const push = (cx: number, cy: number) => {
    if (m === keys.length) { const b = new Uint32Array(keys.length * 2); b.set(keys); keys = b; }
    keys[m++] = keyOf(cx, cy);
  };
  let px = squareStart(path[0]!, n), py = squareStart(path[1]!, n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) push(px + i, py + j);
  // the square moves one cell: the row or column it moves into is new (its far edge when it moves +, its own start when it moves -)
  const lay = (ix: number, iy: number, dx: number, dy: number) => {
    if (dx) { const cx = dx > 0 ? ix + n - 1 : ix; for (let j = 0; j < n; j++) push(cx, iy + j); }
    else { const cy = dy > 0 ? iy + n - 1 : iy; for (let i = 0; i < n; i++) push(ix + i, cy); }
  };
  for (let k = 2; k + 1 < path.length; k += 2) {
    const qx = squareStart(path[k]!, n), qy = squareStart(path[k + 1]!, n);
    walk(px, py, qx, qy, lay); px = qx; py = qy;
  }
  const sorted = keys.subarray(0, m).sort();
  let u = 0;
  for (let k = 0; k < m; k++) if (!k || sorted[k] !== sorted[k - 1]) sorted[u++] = sorted[k]!;
  const out = new Int32Array(2 * u);
  for (let k = 0; k < u; k++) { const v = sorted[k]!, cy = Math.floor(v / 65536); out[2 * k] = v - cy * 65536 - 32768; out[2 * k + 1] = cy - 32768; }
  return out;
}

// The lot lab's ground brush (T183, #461; the owner: "drawing a ground dirt or concrete isnt user friendly"): Draw paints a material with a round
// brush snapped to a half-tile grid of the lot (its frame, tiles), and every stroke is merged into the lot's one patch of that material: the
// material's patches (and the stroke) are laid on the grid, the cells traced into outlines (one per piece; a hole joined to its piece by a zero-width
// seam, so each piece stays one polygon the game fills as one), and those replace the material's patches. Shift erases the material under the brush.
// A patch with painted lines (parking bays, furrows) is never merged. Pure: the lab (lot-lab.ts) and the wizard (lot-wizard.ts) call it.
import type { PresetPatch } from '../lots/presets';

/** the grid's cell (tiles): the brush snaps to it */
export const CELL = 0.5;
/** the brush's radii (tiles), smallest to largest ([ and ] step through them) */
export const BRUSH_SIZES: readonly number[] = [0.5, 1, 1.5, 2, 3, 4];
export const BRUSH_DEFAULT = 1;
/** the next brush size up (dir 1) or down (dir -1) from r */
export function stepBrush(r: number, dir: 1 | -1): number {
  const i = BRUSH_SIZES.findIndex(s => s >= r - 1e-9), k = i < 0 ? BRUSH_SIZES.length - 1 : i;
  return BRUSH_SIZES[Math.max(0, Math.min(BRUSH_SIZES.length - 1, k + dir))]!;
}

/** a lot's grid: nx x ny cells of CELL tiles over [0, w] x [0, d] (frame tiles) */
export interface Grid { nx: number; ny: number; on: Uint8Array }
export function grid(w: number, d: number): Grid { const nx = Math.max(1, Math.ceil(w / CELL - 1e-9)), ny = Math.max(1, Math.ceil(d / CELL - 1e-9)); return { nx, ny, on: new Uint8Array(nx * ny) }; }

/** the cells (indices) a round brush of radius r (tiles) covers at (x, y): every cell whose centre lies within r (at least the cell under the point) */
export function brushCells(g: Grid, x: number, y: number, r: number): number[] {
  const out: number[] = [], rr = Math.max(r, CELL / 2);
  const i0 = Math.max(0, Math.floor((x - rr) / CELL)), i1 = Math.min(g.nx - 1, Math.floor((x + rr) / CELL)), j0 = Math.max(0, Math.floor((y - rr) / CELL)), j1 = Math.min(g.ny - 1, Math.floor((y + rr) / CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const cx = (i + 0.5) * CELL, cy = (j + 0.5) * CELL; if ((cx - x) ** 2 + (cy - y) ** 2 <= rr * rr + 1e-9) out.push(j * g.nx + i); }
  const ci = Math.floor(x / CELL), cj = Math.floor(y / CELL);
  if (!out.length && ci >= 0 && cj >= 0 && ci < g.nx && cj < g.ny) out.push(cj * g.nx + ci);
  return out;
}
/** the cells a stroke covers: the brush along the path (frame points x, y pairs), stamped every quarter cell so a fast drag leaves no gaps */
export function strokeCells(g: Grid, path: readonly number[], r: number): Set<number> {
  const out = new Set<number>(), step = CELL / 4;
  for (let k = 0; k + 1 < path.length; k += 2) {
    const x = path[k]!, y = path[k + 1]!, px = k >= 2 ? path[k - 2]! : x, py = k >= 2 ? path[k - 1]! : y, n = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / step));
    for (let s = k >= 2 ? 1 : 0; s <= n; s++) for (const c of brushCells(g, px + ((x - px) * s) / n, py + ((y - py) * s) / n, r)) out.add(c);
  }
  return out;
}
/** the cells of a rectangle (Shape: x0, y0 to x1, y1, frame tiles): every cell whose centre lies inside */
export function rectCells(g: Grid, x0: number, y0: number, x1: number, y1: number): Set<number> {
  const out = new Set<number>(), [a, b] = [Math.min(x0, x1), Math.max(x0, x1)], [c, d] = [Math.min(y0, y1), Math.max(y0, y1)];
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const cx = (i + 0.5) * CELL, cy = (j + 0.5) * CELL; if (cx >= a && cx <= b && cy >= c && cy <= d) out.add(j * g.nx + i); }
  return out;
}

/** whether a point lies inside a polygon (flat x, y pairs; even-odd) */
export function inside(pts: readonly number[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, n = pts.length >> 1, j = n - 1; i < n; j = i++) { const xi = pts[2 * i]!, yi = pts[2 * i + 1]!, xj = pts[2 * j]!, yj = pts[2 * j + 1]!; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; }
  return c;
}
/** a patch laid on the grid: the cells whose centre it holds */
export function rasterize(g: Grid, pts: readonly number[]): void {
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) if (inside(pts, (i + 0.5) * CELL, (j + 0.5) * CELL)) g.on[j * g.nx + i] = 1;
}

type P = [number, number];
/** the outlines of the grid's filled cells, in cells: one loop per piece's edge and per hole, walked with the filled cells on the left of the screen's
 *  y-down frame (a piece's loop has negative area, a hole's positive); at a corner where two cells touch only diagonally the walk turns left, so
 *  they stay two pieces */
export function traceLoops(g: Grid): P[][] {
  const { nx, ny, on } = g, at = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && on[j * nx + i] === 1;
  const out = new Map<string, P[]>(), add = (a: P, b: P) => { const k = `${a[0]},${a[1]}`; let l = out.get(k); if (!l) out.set(k, (l = [])); l.push(b); };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!at(i, j)) continue;
    if (!at(i - 1, j)) add([i, j], [i, j + 1]);
    if (!at(i, j + 1)) add([i, j + 1], [i + 1, j + 1]);
    if (!at(i + 1, j)) add([i + 1, j + 1], [i + 1, j]);
    if (!at(i, j - 1)) add([i + 1, j], [i, j]);
  }
  const loops: P[][] = [];
  for (const [k0, l0] of out) {
    while (l0.length) {
      const s = k0.split(',').map(Number) as P, loop: P[] = [s];
      let cur = s, nxt = l0.shift()!;
      for (let guard = 0; guard < 4 * nx * ny + 8; guard++) {
        const d: P = [nxt[0] - cur[0], nxt[1] - cur[1]];
        cur = nxt;
        if (cur[0] === s[0] && cur[1] === s[1]) break;
        loop.push(cur);
        const l = out.get(`${cur[0]},${cur[1]}`)!;
        let pick = 0;
        if (l.length > 1) { const left: P = [d[1], -d[0]]; const q = l.findIndex(b => b[0] - cur[0] === left[0] && b[1] - cur[1] === left[1]); pick = q < 0 ? 0 : q; }
        nxt = l.splice(pick, 1)[0]!;
      }
      loops.push(simplify(loop));
    }
  }
  return loops;
}
/** a loop without its straight-through corners */
function simplify(l: P[]): P[] {
  const out: P[] = [];
  for (let i = 0; i < l.length; i++) {
    const a = l[(i + l.length - 1) % l.length]!, b = l[i]!, c = l[(i + 1) % l.length]!;
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b);
  }
  return out;
}
/** a loop's signed area (shoelace; negative for a piece, positive for a hole) */
export function area(l: readonly P[]): number { let s = 0; for (let i = 0; i < l.length; i++) { const a = l[i]!, b = l[(i + 1) % l.length]!; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
const inLoop = (l: readonly P[], x: number, y: number) => inside(l.flat(), x, y);
/** a hole joined to its piece by a zero-width seam (each piece one polygon: the game fills it with the nonzero rule, the hole's reversed walk cut
 *  out): the seam runs left from the hole's top-left corner, half a cell down (through filled cells' centres), to the first edge of the piece */
function joinHole(ring: P[], hole: P[]): P[] {
  let v = 0;
  for (let i = 1; i < hole.length; i++) { const a = hole[i]!, b = hole[v]!; if (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) v = i; }
  const vx = hole[v]![0], yr = hole[v]![1] + 0.5;
  // the hole's own edge through (vx, yr): its left side, walked down from the corner
  let hk = -1;
  for (let i = 0; i < hole.length; i++) { const a = hole[i]!, b = hole[(i + 1) % hole.length]!; if (a[0] === vx && b[0] === vx && Math.min(a[1], b[1]) < yr && Math.max(a[1], b[1]) > yr) { hk = i; break; } }
  // the ring's nearest vertical edge to the left that crosses the seam's row
  let rk = -1, rx = -Infinity;
  for (let i = 0; i < ring.length; i++) { const a = ring[i]!, b = ring[(i + 1) % ring.length]!; if (a[0] === b[0] && a[0] < vx && a[0] > rx && Math.min(a[1], b[1]) < yr && Math.max(a[1], b[1]) > yr) { rk = i; rx = a[0]; } }
  if (hk < 0 || rk < 0) return ring;
  const hv: P = [vx, yr], rv: P = [rx, yr];
  const walk: P[] = []; for (let s = 1; s <= hole.length; s++) walk.push(hole[(hk + s) % hole.length]!);
  return [...ring.slice(0, rk + 1), rv, hv, ...walk, hv, rv, ...ring.slice(rk + 1)];
}
/** the grid's filled cells as polygons (frame tiles, flat x, y pairs): one per piece, its holes joined to it */
export function polygons(g: Grid): number[][] {
  const loops = traceLoops(g), pieces = loops.filter(l => area(l) < 0), holes = loops.filter(l => area(l) > 0);
  const own = pieces.map(() => [] as P[][]);
  for (const h of holes) {
    const c = h[0]!, x = c[0] + 0.25, y = c[1] + 0.25;
    // the smallest piece that holds the hole
    let best = -1, ba = Infinity;
    pieces.forEach((p, i) => { const a = -area(p); if (a < ba && inLoop(p, x, y)) { best = i; ba = a; } });
    if (best >= 0) own[best]!.push(h);
  }
  return pieces.map((p, i) => {
    let ring = p;
    for (const h of own[i]!.sort((a, b) => Math.min(...a.map(q => q[0])) - Math.min(...b.map(q => q[0])))) ring = joinHole(ring, h);
    return ring.flatMap(q => [q[0] * CELL, q[1] * CELL]);
  });
}

/** a material: the patches' kind and texture */
export interface Material { kind: PresetPatch['kind']; tex: string }
/** a stroke applied to a lot's patches: the material's patches (those without lines) and the stroke's cells merged (or, erase, the cells taken out),
 *  traced again; the other patches stay as they were, in their order (the material's go where its first one was, else last). A new array: the
 *  patches before are the stroke's undo */
export function applyStroke(patches: readonly PresetPatch[], m: Material, w: number, d: number, cells: Iterable<number>, erase: boolean): PresetPatch[] {
  const g = grid(w, d), mine = (p: PresetPatch) => p.tex === m.tex && !(p.lines && p.lines.length);
  for (const p of patches) if (mine(p)) rasterize(g, p.pts);
  for (const c of cells) if (c >= 0 && c < g.on.length) g.on[c] = erase ? 0 : 1;
  const first = patches.findIndex(mine), kind = first >= 0 ? patches[first]!.kind : m.kind;
  const made: PresetPatch[] = polygons(g).map(pts => ({ kind, tex: m.tex, pts }));
  const rest = patches.filter(p => !mine(p));
  const at = first < 0 ? rest.length : patches.slice(0, first).filter(p => !mine(p)).length;
  return [...rest.slice(0, at), ...made, ...rest.slice(at)];
}
/** the cells a material covers on a lot (its patches without lines), for tests and the live preview */
export function cellsOf(patches: readonly PresetPatch[], tex: string, w: number, d: number): Grid {
  const g = grid(w, d); for (const p of patches) if (p.tex === tex && !(p.lines && p.lines.length)) rasterize(g, p.pts); return g;
}

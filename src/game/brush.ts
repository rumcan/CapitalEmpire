// The Paint tool's round brush (docs/PAINT-TOOL.md): dabs and strokes fill a cell mask, and the mask is traced back into simple outlines that
// are valid Paint areas. Pure, no DOM, no canvas, importable from node tests.
import { MAP } from './iso';
import { MAX_PTS, MIN_AREA, checkArea, crossings, insidePoly, polyArea, polyBox, simplify } from './paint';

/** the mask's cell size in tiles (a cell is CELL x CELL tiles) */
export const CELL = 0.5;
/** a set of filled cells, key = cy * 8192 + cx (cx = floor(x / CELL), cy = floor(y / CELL), both in 0..MAP/CELL) */
export type Mask = Set<number>;

/** cells per side of the map */
const N = MAP / CELL;
/** the key stride of a cell row */
const W = 8192;
/** the key stride of a lattice vertex (vertices run 0..N) */
const VS = 4200;

/** fills (erase=false) or clears (erase=true) every cell whose centre is within r tiles of (x, y) */
export function dab(m: Mask, x: number, y: number, r: number, erase = false): void {
  const x0 = Math.max(0, Math.floor((x - r) / CELL)), x1 = Math.min(N - 1, Math.floor((x + r) / CELL));
  const y0 = Math.max(0, Math.floor((y - r) / CELL)), y1 = Math.min(N - 1, Math.floor((y + r) / CELL));
  const r2 = r * r;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const dx = (cx + 0.5) * CELL - x, dy = (cy + 0.5) * CELL - y;
    if (dx * dx + dy * dy > r2) continue;
    if (erase) m.delete(cy * W + cx); else m.add(cy * W + cx);
  }
}

/** dabs along the segment from (x0, y0) to (x1, y1), spaced r / 3 apart (the end points included) */
export function stroke(m: Mask, x0: number, y0: number, x1: number, y1: number, r: number, erase = false): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(r / 3, 0.05)));
  for (let i = 0; i <= n; i++) { const t = i / n; dab(m, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, erase); }
}

/** the cells inside polygon pts (cell centre insidePoly), added to m (rebuilds a mask from saved areas) */
export function fillPoly(m: Mask, pts: number[]): void {
  if (pts.length < 6) return;
  const b = polyBox(pts);
  const x0 = Math.max(0, Math.floor(b[0] / CELL)), x1 = Math.min(N - 1, Math.ceil(b[2] / CELL) - 1);
  const y0 = Math.max(0, Math.floor(b[1] / CELL)), y1 = Math.min(N - 1, Math.ceil(b[3] / CELL) - 1);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (insidePoly(pts, (cx + 0.5) * CELL, (cy + 0.5) * CELL)) m.add(cy * W + cx);
}

/** the mask's connected blobs (4-connected) traced to closed outer outlines (tiles, x0 y0 x1 y1 ...), each simplified to at most MAX_PTS corners
 *  and passing checkArea; inner holes are filled (an outline only); blobs under MIN_AREA are dropped; a blob wider than MAX_SIDE is returned
 *  anyway (the caller warns). Deterministic order: by each blob's lowest key. */
export function trace(m: Mask): number[][] {
  const keys = [...m].sort((a, b) => a - b);
  // 1. label the 4-connected blobs (ids in order of their lowest key) and count their cells
  const label = new Map<number, number>(), size: number[] = [], stack: number[] = [];
  const grow = (nk: number, id: number) => { if (m.has(nk) && !label.has(nk)) { label.set(nk, id); stack.push(nk); } };
  for (const k of keys) {
    if (label.has(k)) continue;
    const id = size.length; let cnt = 0;
    label.set(k, id); stack.push(k);
    while (stack.length) { const c = stack.pop()!; cnt++; grow(c - 1, id); grow(c + 1, id); grow(c - W, id); grow(c + W, id); }
    size.push(cnt);
  }
  // 2. the directed boundary edges (interior on the left) of every cell, each owned by its cell; a saddle vertex is always left-turned,
  // so diagonal-only neighbours trace as separate loops
  const eX: number[] = [], eY: number[] = [], eDx: number[] = [], eDy: number[] = [], eTo: number[] = [], eCell: number[] = [];
  const out = new Map<number, number[]>();
  const addE = (x: number, y: number, dx: number, dy: number, cell: number) => {
    const id = eX.length, from = y * VS + x;
    eX.push(x); eY.push(y); eDx.push(dx); eDy.push(dy); eCell.push(cell); eTo.push((y + dy) * VS + x + dx);
    let l = out.get(from); if (!l) out.set(from, l = []); l.push(id);
  };
  for (const c of keys) {
    const cx = c % W, cy = (c - cx) / W;
    if (!m.has(c - W)) addE(cx, cy, 1, 0, c);
    if (!m.has(c + 1)) addE(cx + 1, cy, 0, 1, c);
    if (!m.has(c + W)) addE(cx + 1, cy + 1, -1, 0, c);
    if (!m.has(c - 1)) addE(cx, cy + 1, 0, -1, c);
  }
  // the unused outgoing edge at vertex v that turns most to the left of (dx, dy) (any edge when dx = dy = 0)
  const used = new Uint8Array(eX.length);
  const pick = (v: number, dx: number, dy: number): number => {
    const l = out.get(v); if (!l) return -1;
    let best = -1, bs = 9;
    for (const f of l) {
      if (used[f]) continue;
      const ex = eDx[f]!, ey = eDy[f]!, cr = dx * ey - dy * ex, dt = dx * ex + dy * ey;
      const s = cr > 0 ? 0 : dt > 0 ? 1 : 2;
      if (s < bs) { bs = s; best = f; }
    }
    return best;
  };
  // 3. walk every loop; a loop with positive (counter-clockwise) area bounds filled cells from outside, a negative one is a hole
  const byBlob: number[][][] = size.map(() => []);
  for (let e0 = 0; e0 < eX.length; e0++) {
    if (used[e0]) continue;
    const sk = eY[e0]! * VS + eX[e0]!, lp: number[] = [];
    let cur = e0, ok = true;
    for (;;) {
      used[cur] = 1; lp.push(eX[cur]!, eY[cur]!);
      const to = eTo[cur]!;
      if (to === sk && pick(to, 0, 0) < 0) break;
      const nx = pick(to, eDx[cur]!, eDy[cur]!);
      if (nx < 0) { ok = false; break; }
      cur = nx;
    }
    if (!ok) continue;
    let a2 = 0;
    const n = lp.length >> 1;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; a2 += lp[2 * i]! * lp[2 * j + 1]! - lp[2 * j]! * lp[2 * i + 1]!; }
    if (a2 > 0) byBlob[label.get(eCell[e0]!)!]!.push(lp);
  }
  // 4. each outer loop: drop collinear corners, one Chaikin cut, simplify, and check
  const res: number[][] = [];
  for (let id = 0; id < size.length; id++) {
    if (size[id]! * CELL * CELL < MIN_AREA) continue;
    for (const lp of byBlob[id]!) { const o = outline(lp); if (o) res.push(o); }
  }
  return res;
}

/** one traced loop (lattice corners in cell units) as a valid outline in tiles, or null */
function outline(lp: number[]): number[] | null {
  const n = lp.length >> 1, c: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n, q = (i + 1) % n;
    const cr = (lp[2 * i]! - lp[2 * p]!) * (lp[2 * q + 1]! - lp[2 * i + 1]!) - (lp[2 * i + 1]! - lp[2 * p + 1]!) * (lp[2 * q]! - lp[2 * i]!);
    if (cr !== 0) c.push(lp[2 * i]! * CELL, lp[2 * i + 1]! * CELL);
  }
  const k = c.length >> 1; if (k < 3) return null;
  const sm: number[] = [];
  for (let i = 0; i < k; i++) {
    const j = (i + 1) % k, ax = c[2 * i]!, ay = c[2 * i + 1]!, bx = c[2 * j]!, by = c[2 * j + 1]!;
    sm.push(0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by, 0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by);
  }
  let tol = 0.3;
  for (let tries = 0; tries < 4; tries++, tol *= 2) {
    let t = tol, s = closed(sm, t);
    while ((s.length >> 1) > MAX_PTS && t < 1e3) s = closed(sm, t *= 1.5);
    if ((s.length >> 1) < 3 || (s.length >> 1) > MAX_PTS) continue;
    const e = checkArea(s);
    if (e === '' || (e.startsWith('Too big') && !crossings(s).length && Math.abs(polyArea(s)) >= MIN_AREA)) return s;
  }
  return null;
}

/** simplify a closed loop (the closing point is the first point again, dropped after) */
function closed(pts: number[], tol: number): number[] {
  const open = pts.slice(); open.push(pts[0]!, pts[1]!);
  const s = simplify(open, tol); const m = s.length;
  if (m >= 4 && s[m - 2] === s[0] && s[m - 1] === s[1]) s.length = m - 2;
  return s;
}

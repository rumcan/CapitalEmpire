// The practice facilities the player builds beside the range (T206: with Facilities ▸ Practice, golf/practicebuild.ts; painted before) (plan P24 Phase 2, T130): the practice area (the owned land across the drive from
// the range's car park, a short walk from the shop) and what the course grid holds there: a putting green (green plus its fringe, at least
// PUTT_MIN m²), and a chipping green with a practice bunker beside it. They are practice facilities, not holes: the engine keeps the cells there
// at hole 0, so no hole counts them. Pure TS, no DOM, deterministic; positions in tiles of 2 m, the grid's cells are 1 m.
import type { Pt } from '../network';
import type { Rect } from './mode';
import { plotPoint } from './range';
import { CELL_T, SURF, type Grid } from '../ext/course-grid';
import type { PracticeId } from './rangesave';

/** the practice area in the plot's frame (u along the road, v away from it; the plot is u 0..70, the drive at u 72): u 75..111, v 2..36, the
 *  land across the drive from the car park (72 x 68 m) */
export const PRACTICE_UV: readonly [number, number, number, number] = [75, 111, 2, 36];
/** T239: the practice area's name as Land for sale offers it (a guided range start's practice area is land to buy) */
export const PRACTICE_LOT_NAME = 'The practice area';
/** where the golfers walk in: behind the car park (frame u 70.5, v 19.5) and the area's edge beside it (u 76, v 19.5) */
const BEHIND_PARK = { u: 70.5, v: 19.5 }, ENTRY = { u: 76.5, v: 19.5 };
/** a putting green opens at this much green plus fringe (m²), a chipping green at this much with at least BUNKER_MIN m² of bunker within
 *  BUNKER_REACH m of its green */
export const PUTT_MIN = 300, CHIP_MIN = 200, BUNKER_MIN = 20, BUNKER_REACH = 6;
/** the fringe counted with a green: its automatic collar, cells (m) out from the green */
export const FRINGE_M = 2;

/** the practice area on the map: its world polygon (x y pairs), its box (x0 y0 x1 y1), where its label stands, and the walk in */
export interface PracticeArea { pts: number[]; box: [number, number, number, number]; label: Pt; entry: Pt; behind: Pt }
export function practiceArea(plot: Rect, facing: 0 | 1 | 2 | 3): PracticeArea {
  const P = (u: number, v: number) => plotPoint(plot, facing, u, v), [u0, u1, v0, v1] = PRACTICE_UV;
  const c = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
  const xs = c.map(p => p.x), ys = c.map(p => p.y);
  return { pts: c.flatMap(p => [p.x, p.y]), box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], label: P((u0 + u1) / 2, (v0 + v1) / 2), entry: P(ENTRY.u, ENTRY.v), behind: P(BEHIND_PARK.u, BEHIND_PARK.v) };
}
/** whether tile (x, y) lies in the practice area (its box: the area is a rectangle on the world axes) */
export const inPractice = (a: { box: readonly [number, number, number, number] }, x: number, y: number) => x >= a.box[0] && x < a.box[2] && y >= a.box[1] && y < a.box[3];

/** a practice facility's state: none painted; a green too small; (chipping) a green with no bunker beside it; open */
export type PracticeState = 'none' | 'small' | 'nobunker' | 'open';
/** what the grid holds for one facility: its state, its size (green + fringe, m²) and the size it needs, and once there is a green: its centre,
 *  the cups (the putting green's flags, the chipping green's one) and where golfers stand to play (tiles) */
export interface PracticeFacility { id: PracticeId; state: PracticeState; m2: number; need: number; centre: Pt | null; cups: Pt[]; stands: Pt[] }
export interface PracticeScan { putting: PracticeFacility; chipping: PracticeFacility; /** any green or bunker cell in the area (the outline goes) */ built: boolean }

/** a green blob in the area: its cells (grid indices), green + fringe m², and its bunker cells within reach */
interface Blob { cells: number[]; m2: number; bunker: number[] }

/** reads the practice area's cells (box: tiles x0 y0 x1 y1): the green blobs (4-connected) with their fringe, the bunkers beside them; the
 *  putting green is the biggest green with no bunker beside it, the chipping green the biggest with one (or, with no such green, the second
 *  bunker-free green, which then needs its bunker) */
export function scanPractice(g: Grid, box: readonly [number, number, number, number]): PracticeScan {
  const cx0 = Math.max(0, Math.floor((box[0] - g.x0) / CELL_T)), cy0 = Math.max(0, Math.floor((box[1] - g.y0) / CELL_T));
  const cx1 = Math.min(g.w, Math.ceil((box[2] - g.x0) / CELL_T)), cy1 = Math.min(g.h, Math.ceil((box[3] - g.y0) / CELL_T));
  const W = Math.max(0, cx1 - cx0), H = Math.max(0, cy1 - cy0), at = (x: number, y: number) => (cy0 + y) * g.w + cx0 + x;
  const surf = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : g.surf[at(x, y)]!);
  const seen = new Uint8Array(W * H), blobs: Blob[] = [];
  let built = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = surf(x, y); if (s === SURF.green || s === SURF.bunker) built = true;
    if (s !== SURF.green || seen[y * W + x]) continue;
    // the blob's cells by flood fill
    const cells: number[] = [], stack = [y * W + x]; seen[y * W + x] = 1;
    while (stack.length) {
      const k = stack.pop()!, kx = k % W, ky = (k - kx) / W; cells.push(k);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = kx + dx, ny = ky + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx; if (!seen[n] && surf(nx, ny) === SURF.green) { seen[n] = 1; stack.push(n); }
      }
    }
    // its fringe (the cells within FRINGE_M of it that are not green) and the bunker cells within BUNKER_REACH
    const ring = new Set<number>(), bunk = new Set<number>(), R = Math.max(FRINGE_M, BUNKER_REACH);
    for (const k of cells) {
      const kx = k % W, ky = (k - kx) / W;
      if (surf(kx + 1, ky) === SURF.green && surf(kx - 1, ky) === SURF.green && surf(kx, ky + 1) === SURF.green && surf(kx, ky - 1) === SURF.green) continue;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const nx = kx + dx, ny = ky + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const s = surf(nx, ny), d2 = dx * dx + dy * dy;
        if (s !== SURF.green && d2 <= FRINGE_M * FRINGE_M) ring.add(ny * W + nx);
        if (s === SURF.bunker && d2 <= BUNKER_REACH * BUNKER_REACH) bunk.add(ny * W + nx);
      }
    }
    blobs.push({ cells, m2: cells.length + ring.size, bunker: [...bunk] });
  }
  blobs.sort((a, b) => b.m2 - a.m2 || a.cells[0]! - b.cells[0]!);
  const sandy = (b: Blob) => b.bunker.length >= BUNKER_MIN;
  const free = blobs.filter(b => !sandy(b)), chipB = blobs.find(sandy) ?? free[1] ?? null, putB = free[0] ?? null;
  const tile = (k: number): Pt => { const kx = k % W, ky = (k - kx) / W; return { x: g.x0 + (cx0 + kx + 0.5) * CELL_T, y: g.y0 + (cy0 + ky + 0.5) * CELL_T }; };
  const centre = (b: Blob): Pt => { let x = 0, y = 0; for (const k of b.cells) { const p = tile(k); x += p.x; y += p.y; } return { x: x / b.cells.length, y: y / b.cells.length }; };
  /** the blob's cell nearest p */
  const nearest = (b: Blob, p: Pt): Pt => { let best = tile(b.cells[0]!), bd = Infinity; for (const k of b.cells) { const q = tile(k), d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2; if (d < bd) { bd = d; best = q; } } return best; };
  /** up to n cells of the blob, each at least gap tiles from the others and from avoid (a greedy spread from the centre outward, deterministic) */
  const spread = (b: Blob, n: number, gap: number, avoid: Pt[] = [], from = centre(b)): Pt[] => {
    const order = b.cells.map(tile).sort((p, q) => ((p.x - from.x) ** 2 + (p.y - from.y) ** 2) - ((q.x - from.x) ** 2 + (q.y - from.y) ** 2) || p.y - q.y || p.x - q.x), out: Pt[] = [];
    for (const p of order) { if (out.length >= n) break; if ([...out, ...avoid].every(q => Math.hypot(q.x - p.x, q.y - p.y) >= gap)) out.push(p); }
    return out;
  };
  const putting: PracticeFacility = { id: 'putting', state: 'none', m2: 0, need: PUTT_MIN, centre: null, cups: [], stands: [] };
  if (putB) {
    const c = centre(putB), cups = spread(putB, 3, 3.5, [], nearest(putB, c));
    Object.assign(putting, { state: putB.m2 >= PUTT_MIN ? 'open' : 'small', m2: putB.m2, centre: c, cups, stands: spread(putB, 6, 1.6, cups) });
  }
  const chipping: PracticeFacility = { id: 'chipping', state: 'none', m2: 0, need: CHIP_MIN, centre: null, cups: [], stands: [] };
  if (chipB) {
    const c = centre(chipB), cup = nearest(chipB, c);
    // the golfers chip from the bunker (its cells farthest from the cup first) and from the grass round the green, about 5 m out from its edge
    const stands: Pt[] = [];
    const sand = [...chipB.bunker].map(tile).sort((p, q) => Math.hypot(q.x - cup.x, q.y - cup.y) - Math.hypot(p.x - cup.x, p.y - cup.y) || p.y - q.y || p.x - q.x);
    for (const p of sand) { if (stands.length >= 2) break; if (stands.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= 1.5)) stands.push(p); }
    const r = Math.sqrt(chipB.cells.length / Math.PI) * CELL_T + 2.5;
    for (let k = 0; k < 8 && stands.length < 5; k++) {
      const a = k / 8 * Math.PI * 2 + 0.3, p = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
      if (!inPractice({ box }, p.x, p.y)) continue;
      const i = Math.floor((p.y - g.y0) / CELL_T) * g.w + Math.floor((p.x - g.x0) / CELL_T), s = g.surf[i] ?? 0;
      if (s !== SURF.green && s !== SURF.water && s !== SURF.bunker && stands.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= 1.5)) stands.push(p);
    }
    const state: PracticeState = chipB.m2 < CHIP_MIN ? 'small' : sandy(chipB) ? 'open' : 'nobunker';
    Object.assign(chipping, { state, m2: chipB.m2, centre: c, cups: [cup], stands });
  }
  return { putting, chipping, built };
}

/** the line the range card shows for a facility */
export function practiceWords(f: Pick<PracticeFacility, 'id' | 'state' | 'm2' | 'need'>): string {
  const name = f.id === 'putting' ? 'putting green' : 'chipping green';
  switch (f.state) {
    case 'none': return f.id === 'putting' ? 'Build a putting green' : 'Build a chipping green and bunker'; // T206: its own tool (Facilities ▸ Practice)
    case 'small': return `Too small: ${Math.round(f.m2)} of ${f.need} m²`;
    case 'nobunker': return 'Add a practice bunker beside it';
    default: return `Open: ${name}, ${Math.round(f.m2)} m²`;
  }
}

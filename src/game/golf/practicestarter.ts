// The practice area's starter set (#1281; the owner, 2026-11-14: "when you place the practice area it should place some dirt greens with flags and a crappy bunker
// etc ... and then if you click on the practice area label it takes you to the window to build the proper green"): the moment the area is placed it comes with a
// rough, home-made practice ground, free with the placement: three small greens of packed earth (a little darker and smoother than the ground round them, a
// gentle sun-lit mound) each with a short yellow flag, and one crude bunker (a shallow scrape of sand in a rim of turned earth, ragged all round), like the old
// range's junk-and-dirt start.
// It is ground paint (the range scene's patches, laid with the range's other pads and mats: golf/rangebiz.ts rangeScene) and a handful of flag sprites: nothing is
// drawn by code, nothing per frame, and the ground re-bakes itself like any edit. It lies over no cell of the course grid, so it is not a practice facility: no
// golfer uses it and it earns nothing (practice.ts scans the grid only). A proper facility built over a piece replaces it (the piece goes for good, with the
// build's undo step bringing it back); the others stay until built over.
// The layout is a pure function of the area's box and the save's seed (RangeBizSave.starter: the seed and the ids gone), so the save holds two small things.
// Pure TS, no DOM, deterministic. Units: tiles of 2 m.
import type { Pt } from '../network';
import { SURF, cellAt, type Grid } from '../ext/course-grid';
import { polyCells } from '../ext/course-grid/areas';
import { polyDist } from './practicebuild';
import type { ScenePatch, ScenePiece } from './rangebiz';

/** how many dirt greens the set has */
export const STARTER_GREENS = 3;
/** the flag's picture and its size (a short flag: the proper greens' flags are 0.2 to 0.32; a yellow one, so a home-made green is told from a proper one's red) */
export const STARTER_FLAG = 'business:golf-pin-yellow', STARTER_FLAG_SCALE = 0.22;
/** what a starter piece is: a green of packed earth with a flag, or a scrape of sand */
export type StarterKind = 'dirt' | 'bunker';
/** one piece: its id (its place in the set: what the save lists once it is replaced), kind, centre, outline (a ragged ring: world x y pairs), the earth rim round a
 *  bunker's sand (null: a dirt green's) and where a dirt green's flag stands (null: a bunker's) */
export interface StarterPiece { id: number; kind: StarterKind; centre: Pt; pts: number[]; rim: number[] | null; flag: Pt | null }
/** the save's part (RangeBizSave.starter): the seed the layout grows from and the ids of the pieces proper facilities have replaced */
export interface StarterSave { seed: number; gone: number[] }

/** the bunker scrape's sand a little duller than the course's own bunker sand (a home-made scrape: not raked and washed) */
const SAND_TONE = { t: 1 as const, ta: 0.07 };
/** the least room (tiles) the set asks of an area: kept clear of every edge, so a facility built beside it keeps its room */
const MARGIN = 6;
/** the seed a placed area's starter set grows from: the game's seed and where the area lies (two games differ, and so do two spots) */
export const starterSeed = (gameSeed: number, r: readonly number[]): number => (Math.imul(gameSeed | 0, 0x9e3779b1) ^ Math.imul(Math.round(r[0]! * 4) + 31 * Math.round(r[1]! * 4), 0x85ebca6b)) >>> 0;

/** a small seeded stream (0..1) */
function stream(seed: number): () => number {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** a ragged ring about c: an ellipse (rx, ry) turned by rot (radians) whose radius wanders by a few smooth waves and a little per-point jitter (rag: how much), n points */
function ragged(c: Pt, rx: number, ry: number, rot: number, rnd: () => number, rag: number, n = 40): number[] {
  const ks = [2, 3, 5, 8], am = [1, 0.62, 0.42, 0.3].map(a => a * rag), ph = ks.map(() => rnd() * Math.PI * 2), co = Math.cos(rot), si = Math.sin(rot), out: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    let f = 1 + (rnd() - 0.5) * rag * 0.3; for (let j = 0; j < ks.length; j++) f += am[j]! * Math.sin(ks[j]! * a + ph[j]!);
    const lx = Math.cos(a) * rx * f, ly = Math.sin(a) * ry * f;
    out.push(c.x + lx * co - ly * si, c.y + lx * si + ly * co);
  }
  return out;
}

/** the starter set for an area (its box x0 y0 x1 y1, tiles), the walk in at entry (kept clear) and the save's seed: three dirt greens spread over the area by best
 *  candidate (each as far from the others and the walk in as a handful of tries find), and a bunker a few tiles off the first. An area too small for it gets none */
export function starterSet(box: readonly [number, number, number, number], entry: Pt, seed: number): StarterPiece[] {
  const [x0, y0, x1, y1] = box, ix0 = x0 + MARGIN, iy0 = y0 + MARGIN, ix1 = x1 - MARGIN, iy1 = y1 - MARGIN;
  if (ix1 - ix0 < 8 || iy1 - iy0 < 8) return [];
  const rnd = stream(seed), out: StarterPiece[] = [], centres: { p: Pt; r: number }[] = [];
  const inner = (p: Pt) => p.x >= ix0 && p.x <= ix1 && p.y >= iy0 && p.y <= iy1;
  // the greens: each of 12 tries scores its room (the nearest centre, the walk in counting for more), the roomiest wins
  for (let i = 0; i < STARTER_GREENS; i++) {
    let best: Pt | null = null, bs = -1;
    for (let t = 0; t < 12; t++) {
      const p = { x: ix0 + rnd() * (ix1 - ix0), y: iy0 + rnd() * (iy1 - iy0) };
      let s = Math.hypot(p.x - entry.x, p.y - entry.y) * 0.8;
      for (const c of centres) s = Math.min(s, Math.hypot(p.x - c.p.x, p.y - c.p.y));
      if (s > bs) { bs = s; best = p; }
    }
    const r = 2.6 + rnd() * 0.6, c = best!, rot = rnd() * Math.PI;
    centres.push({ p: c, r });
    out.push({ id: i, kind: 'dirt', centre: c, pts: ragged(c, r * 1.05, r * 0.95, rot, rnd, 0.08, 36), rim: null, flag: { x: c.x, y: c.y } });
  }
  // the bunker: off the first green by its radius and a few tiles more, on the side with room (12 directions from a seeded one; the first inside the area's edge margin
  // and clear of the others), or at the best of them
  const a0 = out[0]!, rx = 2.3 + rnd() * 0.5, ry = 1.4 + rnd() * 0.4, dir0 = rnd() * Math.PI * 2, off = centres[0]!.r + rx + 1.4;
  let spot: Pt | null = null, spotRoom = -1;
  for (let k = 0; k < 12; k++) {
    const a = dir0 + (k / 12) * Math.PI * 2, p = { x: a0.centre.x + Math.cos(a) * off, y: a0.centre.y + Math.sin(a) * off };
    if (!inner(p)) continue;
    let room = Math.hypot(p.x - entry.x, p.y - entry.y) * 0.8; for (let j = 1; j < centres.length; j++) room = Math.min(room, Math.hypot(p.x - centres[j]!.p.x, p.y - centres[j]!.p.y) - centres[j]!.r);
    if (room > spotRoom) { spotRoom = room; spot = p; }
  }
  const c = spot ?? { x: a0.centre.x + off, y: a0.centre.y }, rot = rnd() * Math.PI;
  out.push({ id: STARTER_GREENS, kind: 'bunker', centre: c, pts: ragged(c, rx, ry, rot, rnd, 0.15, 40), rim: ragged(c, rx * 1.3, ry * 1.45, rot, rnd, 0.2, 40), flag: null });
  return out;
}

/** the scene's ground patches for the pieces still standing (ScenePatch: rangebiz.ts): a dirt green is packed earth with a raised, sun-lit edge; a bunker is its
 *  sand over a rim of turned earth. #1298: all of them under the course's cells (ScenePatch.under: what the player paints over a piece shows on top of it) */
export function starterPatches(set: readonly StarterPiece[], gone: readonly number[]): ScenePatch[] {
  const out: ScenePatch[] = [];
  for (const p of set) {
    if (gone.includes(p.id)) continue;
    if (p.kind === 'dirt') out.push({ pts: p.pts, surf: 'dirtGreen', edge: 'raised', under: true });
    else { if (p.rim) out.push({ pts: p.rim, surf: 'scrape', edge: 'flat', under: true }); out.push({ pts: p.pts, surf: 'sand', edge: 'turf', tone: SAND_TONE, under: true }); }
  }
  return out;
}
/** the scene's props for the pieces still standing: a short flag on each dirt green */
export function starterPieces(set: readonly StarterPiece[], gone: readonly number[]): ScenePiece[] {
  const out: ScenePiece[] = [];
  for (const p of set) if (p.kind === 'dirt' && p.flag && !gone.includes(p.id)) out.push({ key: `starter-flag${p.id}`, id: STARTER_FLAG, x: p.flag.x, y: p.flag.y, q: 0, scale: STARTER_FLAG_SCALE });
  return out;
}

/** the ids of the pieces still standing that the cells (indices of g) cover or touch: any cell of a piece's outline (a bunker's: its earth rim) grown by a seventh lies among them */
export function coveredBy(set: readonly StarterPiece[], gone: readonly number[], g: Grid, cells: ReadonlySet<number>): number[] {
  const out: number[] = [];
  for (const p of set) {
    if (gone.includes(p.id)) continue;
    const ring = p.rim ?? p.pts, grown: number[] = [];
    for (let i = 0; i + 1 < ring.length; i += 2) grown.push(p.centre.x + (ring[i]! - p.centre.x) * 1.15, p.centre.y + (ring[i + 1]! - p.centre.y) * 1.15);
    let hit = cells.has(cellAt(g, p.centre.x, p.centre.y));
    if (!hit) polyCells(g, grown, i => { if (cells.has(i)) hit = true; });
    if (hit) out.push(p.id);
  }
  return out;
}
/** cells' index set of the given lists */
export const cellSet = (...lists: readonly (readonly number[])[]): Set<number> => { const s = new Set<number>(); for (const l of lists) for (const i of l) s.add(i); return s; };

// ---- #1298 (the owner, 2026-11-14: "I painted fescue over the practice and pittingarea ... I can[not] bulldoze or remove the old sand pit and dirt green"): each piece goes three ways:
// built over (coveredBy: a proper facility), painted over (paintedOver: the Texture Painter's cells now cover it) and bulldozed on its own (starterAt: the Bulldoze tool)

/** a piece's name as the bulldozer says it */
export const starterName = (p: StarterPiece): string => (p.kind === 'dirt' ? 'dirt green' : 'sand scrape');
/** the piece still standing whose outline lies under tile (x, y) (a bunker's: its earth rim), within `tol` tiles of its edge (a flag on the green, a click on its rim); the one the
 *  point is nearest when two overlap; null: none */
export function starterAt(set: readonly StarterPiece[], gone: readonly number[], x: number, y: number, tol = 0.4): StarterPiece | null {
  let best: StarterPiece | null = null, bd = Infinity;
  for (const p of set) {
    if (gone.includes(p.id)) continue;
    const d = polyDist(p.rim ?? p.pts, x, y);
    if (d <= tol && (d < bd || (d === bd && Math.hypot(p.centre.x - x, p.centre.y - y) < Math.hypot(best!.centre.x - x, best!.centre.y - y)))) { best = p; bd = d; }
  }
  return best;
}
/** the share of a piece's cells (its outline's: a bunker's, its earth rim's) that lie under the course's cells for it to count as painted over: the cell at its middle
 *  (where a dirt green's flag stands, a bunker's sand lies) painted, or this share of its cells. A stroke brushing its edge leaves it standing */
export const PAINTED_SHARE = 0.4;
/** #1298: the ids of the pieces still standing that the course grid's painted cells (any surface but the land's own) now cover: the cell at a piece's middle holds one, or at least
 *  PAINTED_SHARE of the cells of its outline do. Only the pieces whose outline's box meets `box` (tiles x0 y0 x1 y1: the cells an edit changed) are looked at, when given */
export function paintedOver(set: readonly StarterPiece[], gone: readonly number[], g: Grid, box?: readonly [number, number, number, number]): number[] {
  const out: number[] = [];
  for (const p of set) {
    if (gone.includes(p.id)) continue;
    const ring = p.rim ?? p.pts;
    if (box) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i + 1 < ring.length; i += 2) { x0 = Math.min(x0, ring[i]!); x1 = Math.max(x1, ring[i]!); y0 = Math.min(y0, ring[i + 1]!); y1 = Math.max(y1, ring[i + 1]!); }
      if (x1 < box[0] || x0 > box[2] || y1 < box[1] || y0 > box[3]) continue;
    }
    const mid = cellAt(g, p.centre.x, p.centre.y);
    let n = 0, painted = 0;
    polyCells(g, ring as number[], i => { n++; if (g.surf[i] !== SURF.none) painted++; });
    if ((mid >= 0 && g.surf[mid] !== SURF.none) || (n > 0 && painted >= PAINTED_SHARE * n)) out.push(p.id);
  }
  return out;
}

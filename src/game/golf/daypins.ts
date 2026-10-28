// T269 (#810) part 1, the day's pin (the owner, 2026-10-29: "I want to start seeing maintanance people moving holes on greens after each day").
// The hole's placed pin (golf.pins) stays its marker: the length, the par, T218's stripes, the badges and the galleries read it, so nothing about
// the hole changes from day to day. Each morning the cup is cut in a new spot on the hole's green, and play reads that one: the golfers putt to it,
// the flag stands there and the hole card says where it is. The spot follows a pin sheet's rules:
//  - inside the green, off its edges: at least PIN_EDGE_T from the edge (a walk over the green's cells), the innermost cells on a small green;
//  - on fairly flat ground: at most PIN_SLOPE_MAX at the cup (T263's green tilts 1-2%, so most of a green passes), the flatter the likelier;
//  - away from yesterday's: at least PIN_MOVE_T from it;
//  - rotating through the green's front, middle and back thirds along the approach (the last leg of the hole's line), left and right of it, so a
//    hole sees each depth twice in six days and the course has a third of its pins in each depth on any day.
// Pure TS, no DOM; tiles are 2 m.
import type { Pt } from './holes';
import type { CourseView, PlayHole } from './play/types';
import { CELL_T, SURF, cellAt, type Grid } from '../ext/course-grid';
import { TILE_M } from './types';

/** a cup at least this far from the green's edge (tiles: 4 m, about five paces) */
export const PIN_EDGE_T = 2;
/** the steepest a cup may sit on (m per m) */
export const PIN_SLOPE_MAX = 0.03;
/** a new cup at least this far from yesterday's (tiles: 8 m) */
export const PIN_MOVE_T = 4;
/** the green's cells are looked for within this many tiles of the hole's placed pin (a green bigger than that is cut short) */
const GREEN_REACH_T = 40;
/** a pin within this many tiles of the approach's line is in the centre (the card's word) */
const CENTRE_T = 1.5;

/** the green's three depths along the approach, and the sides of it */
export type PinDepth = 'front' | 'middle' | 'back';
export type PinSide = 'left' | 'right';
const DEPTHS: readonly PinDepth[] = ['front', 'middle', 'back'];

/** a hole's cup for a day */
export interface DayPin { hole: number; x: number; y: number }
/** the day's pins as the save keeps them (GolfSave.dayPins): the town day they are for, today's cups and yesterday's (a hole with none: its placed pin) */
export interface DayPinsSave { day: number; today: DayPin[]; prev: DayPin[] }

/** where the rota puts hole n's cup on town day `day`: depth (day + hole) mod 3, so the course's pins are a third front, a third middle and a third
 *  back each day; the side alternates every three days, offset by hole, so each hole has each depth on both sides over six days */
export function pinSlot(day: number, hole: number): { depth: PinDepth; side: PinSide } {
  const d = ((day + hole) % 3 + 3) % 3, s = ((Math.floor((day + hole) / 3) + hole) % 2 + 2) % 2;
  return { depth: DEPTHS[d]!, side: s ? 'right' : 'left' };
}

/** a hole's green as the cup cutter sees it: its cells' centres (flat x y, tiles) and each one's walk to the edge (tiles: a cell next to a cell that is
 *  not this hole's green is CELL_T from it), and the approach (unit, the way play comes in) with the green's centre */
export interface GreenShape { pts: Float32Array; edge: Float32Array; ux: number; uy: number; cx: number; cy: number }

/** hole n's green round its placed pin (x, y): the connected cells of SURF.green and hole n found from the pin's cell (or the nearest such cell within
 *  2 tiles), with each cell's walk to the edge (4-neighbour steps out to a cell that is not this green, times CELL_T), and the approach from `from`
 *  (the line's point before the pin) to the pin. Null: no green cell there */
export function greenAt(g: Grid, n: number, x: number, y: number, from: Pt | null): GreenShape | null {
  const W = g.w, H = g.h, isG = (i: number) => g.surf[i] === SURF.green && g.hole[i] === n;
  let s = cellAt(g, x, y);
  if (s < 0 || !isG(s)) {
    s = -1; let best = Infinity; const R = Math.ceil(2 / CELL_T), c0 = cellAt(g, x, y);
    if (c0 < 0) return null;
    const ci = c0 % W, cj = (c0 - ci) / W;
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const k = j * W + i, d = di * di + dj * dj; if (d < best && isG(k)) { best = d; s = k; }
    }
    if (s < 0) return null;
  }
  // the green: a flood from the start cell, kept within GREEN_REACH_T of the pin
  const reach = Math.ceil(GREEN_REACH_T / CELL_T), si = s % W, sj = (s - si) / W;
  const seen = new Map<number, number>(), cells: number[] = [s]; seen.set(s, 0);
  for (let q = 0; q < cells.length; q++) {
    const c = cells[q]!, i = c % W, j = (c - i) / W;
    for (const [di, dj] of NB4) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= W || b >= H || Math.abs(a - si) > reach || Math.abs(b - sj) > reach) continue;
      const k = b * W + a; if (seen.has(k) || !isG(k)) continue;
      seen.set(k, cells.length); cells.push(k);
    }
  }
  // each cell's walk to the edge: a two-pass chamfer distance (1 and the square root of 2) over the green's box, a cell off this green as 0
  const N = cells.length; let i0 = W, j0 = H, i1 = -1, j1 = -1;
  for (const c of cells) { const i = c % W, j = (c - i) / W; i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
  const BW = i1 - i0 + 3, BH = j1 - j0 + 3, D = new Float32Array(BW * BH); // (padded by a cell all round: off the green)
  for (const c of cells) { const i = c % W, j = (c - i) / W; D[(j - j0 + 1) * BW + (i - i0 + 1)] = 1e9; }
  const R2 = Math.SQRT2;
  for (let y = 1; y < BH - 1; y++) for (let x = 1; x < BW - 1; x++) {
    const k = y * BW + x; if (!D[k]) continue;
    D[k] = Math.min(D[k]!, D[k - 1]! + 1, D[k - BW]! + 1, D[k - BW - 1]! + R2, D[k - BW + 1]! + R2);
  }
  for (let y = BH - 2; y >= 1; y--) for (let x = BW - 2; x >= 1; x--) {
    const k = y * BW + x; if (!D[k]) continue;
    D[k] = Math.min(D[k]!, D[k + 1]! + 1, D[k + BW]! + 1, D[k + BW + 1]! + R2, D[k + BW - 1]! + R2);
  }
  const pts = new Float32Array(N * 2), edge = new Float32Array(N); let cx = 0, cy = 0;
  for (let q = 0; q < N; q++) {
    const c = cells[q]!, i = c % W, j = (c - i) / W, px = g.x0 + (i + 0.5) * CELL_T, py = g.y0 + (j + 0.5) * CELL_T;
    pts[2 * q] = px; pts[2 * q + 1] = py; edge[q] = Math.max(0.5, D[(j - j0 + 1) * BW + (i - i0 + 1)]! - 0.5) * CELL_T; cx += px; cy += py;
  }
  cx /= N; cy /= N;
  let ux = from ? x - from.x : 0, uy = from ? y - from.y : 1; const L = Math.hypot(ux, uy);
  if (L > 1e-6) { ux /= L; uy /= L; } else { ux = 0; uy = 1; }
  return { pts, edge, ux, uy, cx, cy };
}
const NB4: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** a cell's depth along the approach and its offset to the left of it (tiles, from the green's centre; left: the golfer's left as he walks in) */
function frame(gr: GreenShape, x: number, y: number): { d: number; l: number } {
  const dx = x - gr.cx, dy = y - gr.cy;
  return { d: dx * gr.ux + dy * gr.uy, l: dx * gr.uy - dy * gr.ux };
}
/** a well-mixed number in 0..1 from integers (the cup's draw among the candidates) */
export function mix01(a: number, b: number, c: number, d: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) ^ Math.imul(c + 0x7f4a7c15, 0x297a2d39);
  h = Math.imul(h ^ (h >>> 12), 0x165667b1) ^ Math.imul(d + 0x1b873593, 0xcc9e2d51);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** the day's cup on green gr: the candidates are its cells PIN_EDGE_T or more from the edge (on a green too small for that: its innermost tenth),
 *  at most PIN_SLOPE_MAX steep (slopeAt, m per m; none that flat: the flattest quarter of them) and PIN_MOVE_T or more from yesterday's cup (prev;
 *  when that leaves none, the rule goes). Of those in the rota's third and side (pinSlot; the third alone, then any, when that has none), the cup
 *  is the one with the lowest score: a random draw (seed, day, hole) plus a little for steepness and the edge. Null: no green */
export function choosePin(gr: GreenShape | null, depth: PinDepth, side: PinSide, prev: Pt | null, slopeAt: ((x: number, y: number) => number) | null, seed: number, day: number, hole: number): Pt | null {
  if (!gr) return null;
  const N = gr.edge.length; if (!N) return null;
  let maxEdge = 0; for (let q = 0; q < N; q++) maxEdge = Math.max(maxEdge, gr.edge[q]!);
  const edgeMin = maxEdge >= PIN_EDGE_T ? PIN_EDGE_T : maxEdge * 0.9;
  let cand: number[] = [];
  for (let q = 0; q < N; q++) if (gr.edge[q]! >= edgeMin - 1e-6) cand.push(q);
  const slope = new Float32Array(N);
  if (slopeAt) {
    for (const q of cand) slope[q] = slopeAt(gr.pts[2 * q]!, gr.pts[2 * q + 1]!);
    const flat = cand.filter(q => slope[q]! <= PIN_SLOPE_MAX);
    if (flat.length) cand = flat;
    else { const s = [...cand].sort((a, b) => slope[a]! - slope[b]!); cand = s.slice(0, Math.max(1, Math.ceil(s.length / 4))); }
  }
  if (prev) { const far = cand.filter(q => Math.hypot(gr.pts[2 * q]! - prev.x, gr.pts[2 * q + 1]! - prev.y) >= PIN_MOVE_T); if (far.length) cand = far; }
  // the rota's third along the approach (of the candidates' own spread, so a lopsided green still has three) and its side
  let dMin = Infinity, dMax = -Infinity; const fr = cand.map(q => frame(gr, gr.pts[2 * q]!, gr.pts[2 * q + 1]!));
  for (const f of fr) { dMin = Math.min(dMin, f.d); dMax = Math.max(dMax, f.d); }
  const third = (d: number) => dMax - dMin < 1e-6 ? 1 : Math.min(2, Math.floor(3 * (d - dMin) / (dMax - dMin + 1e-9)));
  const want = DEPTHS.indexOf(depth), sgn = side === 'left' ? 1 : -1;
  const pick = (ok: (k: number) => boolean): number => {
    let best = -1, bs = Infinity;
    for (let k = 0; k < cand.length; k++) {
      if (!ok(k)) continue;
      const q = cand[k]!, s = mix01(seed, day, hole, q) + 0.35 * (slope[q]! / PIN_SLOPE_MAX) - 0.1 * Math.min(1, gr.edge[q]! / (2 * PIN_EDGE_T));
      if (s < bs) { bs = s; best = q; }
    }
    return best;
  };
  let q = pick(k => third(fr[k]!.d) === want && fr[k]!.l * sgn >= 0);
  if (q < 0) q = pick(k => third(fr[k]!.d) === want);
  if (q < 0) q = pick(() => true);
  return q < 0 ? null : { x: gr.pts[2 * q]!, y: gr.pts[2 * q + 1]! };
}

/** what the hole card says of a cup on green gr: its third and side, metres on from the green's front along the approach, and metres from the nearer
 *  side edge (the green's cells within a tile of the cup's depth), with that side; side 'centre' within CENTRE_T of the approach's line */
export interface PinReport { depth: PinDepth; side: PinSide | 'centre'; onM: number; edgeM: number; edgeSide: PinSide }
export function pinReport(gr: GreenShape, p: Pt): PinReport {
  const N = gr.edge.length, f = frame(gr, p.x, p.y);
  let dMin = Infinity, dMax = -Infinity, lMin = Infinity, lMax = -Infinity;
  for (let q = 0; q < N; q++) {
    const c = frame(gr, gr.pts[2 * q]!, gr.pts[2 * q + 1]!); dMin = Math.min(dMin, c.d); dMax = Math.max(dMax, c.d);
    if (Math.abs(c.d - f.d) <= 1) { lMin = Math.min(lMin, c.l); lMax = Math.max(lMax, c.l); }
  }
  if (!Number.isFinite(lMin)) { lMin = f.l; lMax = f.l; }
  const span = dMax - dMin, t = span > 1e-6 ? Math.min(2, Math.floor(3 * (f.d - dMin) / (span + 1e-9))) : 1;
  const toLeft = lMax - f.l + CELL_T / 2, toRight = f.l - lMin + CELL_T / 2, edgeSide: PinSide = toLeft <= toRight ? 'left' : 'right';
  return {
    depth: DEPTHS[Math.max(0, t)]!, side: Math.abs(f.l) < CENTRE_T ? 'centre' : f.l > 0 ? 'left' : 'right',
    onM: Math.max(0, Math.round((f.d - dMin + CELL_T / 2) * TILE_M)), edgeM: Math.max(0, Math.round(Math.min(toLeft, toRight) * TILE_M)), edgeSide,
  };
}
/** the card's line: "back left · 24 m on, 5 m from the left edge" */
export function pinLine(r: PinReport): string {
  const where = r.side === 'centre' ? `${r.depth} centre` : `${r.depth} ${r.side}`;
  return `${where} · ${r.onM} m on, ${r.edgeM} m from the ${r.edgeSide} edge`;
}

/** the course a round plays with the day's cups: each hole's pin, and the end of its line and of its tee sets' lines, at pinOf(n) (null: as placed).
 *  The par and the tees stay; the lie is the course's */
export function withDayPins(view: CourseView, pinOf: (n: number) => Pt | null): CourseView {
  let changed = false;
  const holes = view.holes.map((h): PlayHole => {
    const p = pinOf(h.n); if (!p || (Math.abs(p.x - h.pin.x) < 1e-9 && Math.abs(p.y - h.pin.y) < 1e-9)) return h;
    changed = true;
    const pin = { x: p.x, y: p.y }, end = (l: Pt[]) => [...l.slice(0, -1), pin];
    return { ...h, pin, line: end(h.line), ...(h.sets ? { sets: h.sets.map(s => ({ ...s, line: end(s.line) })) } : {}) };
  });
  return changed ? { holes, lieAt: view.lieAt } : view;
}

/** a finite number */
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** a list of well-formed cups (one per hole, the first kept) */
function pinsOf(v: unknown): DayPin[] {
  if (!Array.isArray(v)) return [];
  const out: DayPin[] = [], had = new Set<number>();
  for (const p of v) if (p && fin(p.hole) && fin(p.x) && fin(p.y) && p.hole > 0 && !had.has(p.hole)) { had.add(p.hole); out.push({ hole: p.hole, x: p.x, y: p.y }); }
  return out;
}
/** a saved day's pins, or null when it is not well formed */
export function normalizeDayPins(s: Partial<DayPinsSave> | null | undefined): DayPinsSave | null {
  if (!s || !fin(s.day)) return null;
  return { day: Math.floor(s.day), today: pinsOf(s.today), prev: pinsOf(s.prev) };
}

/** a hole's cup in a list (null: none) */
export const pinIn = (list: readonly DayPin[], hole: number): DayPin | null => list.find(p => p.hole === hole) ?? null;

/** the day's pins on town day `day` from the save (null: an old save, or a new game) and the placed pins: an old save's cups are its placed pins,
 *  today and yesterday; a day after the save's, yesterday's are the save's today and today's are made by next (the rota's new cup for a hole, from its
 *  yesterday; null: none, the cup stays); a day before the save's (a new clock) starts again from the placed pins. The save is not changed */
export function rollDayPins(s: DayPinsSave | null, day: number, placed: readonly DayPin[], next: (hole: number, prev: Pt) => Pt | null): DayPinsSave {
  const base = placed.map(p => ({ hole: p.hole, x: p.x, y: p.y }));
  if (!s || day < s.day) return { day, today: base, prev: base.map(p => ({ ...p })) };
  if (day === s.day) return s;
  const prev = placed.map(p => { const t = pinIn(s.today, p.hole); return t ? { ...t } : { hole: p.hole, x: p.x, y: p.y }; });
  const today = prev.map(p => { const q = next(p.hole, p); return q ? { hole: p.hole, x: q.x, y: q.y } : { ...p }; });
  return { day, today, prev };
}

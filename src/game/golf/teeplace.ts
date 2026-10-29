// T268 (#809; the owner, 2026-10-29: "should be able to place the diffrent tees white/red/blue/yellow yourself"): each tee set's box placed,
// moved and removed by hand. Here, pure: the box at the pointer (facing the line of play, turned and sized within the tee's limits), the cells it
// lays and why a spot is refused (land you do not own, the practice area, a road or cart path, another hole, water, the green), the level pad
// under it (the course height held at the box's mean and eased back to the ground round it: hole shaping's tee hold, T263), and the record a
// laid box keeps (GolfSave.teeBoxes: the cells and heights it changed, as they were) so a move or a removal puts the old ground back. An older
// box (New hole's, one painted by hand, an old save's) has no record: its tee cells go back to the grass round them. The engine
// (Engine.placeTee and its neighbours) and the Paint tool's undo step (PaintTool.teeStep) do the rest. No DOM.
import { CELL_T, SURF, applyDiff, cellAt, cellCentre, diffCost, paintCells, type Grid, type GridDiff } from '../ext/course-grid';
import { CH_SIZE, CH_STEP, COURSE_CELL_M2, clampCourseHeightM, type CourseHeightField, type CourseTileBox } from '../ext/course-height';
import { SHAPE_RATE_M3 } from './costs';
import { teeLengths } from './holecard';
import { BOX_LEN_M, BOX_WID_M, TEE_KINDS, isTeeKind, teeBox } from './teesets';
import { TILE_M, type AimPoint, type Pin, type TeeBoxRec, type TeeKind, type TeeMark } from './types';

type Pt = { x: number; y: number };

// ---------- the box in hand ----------
/** R turns the box this many degrees (Shift+R back) */
export const TEE_TURN_DEG = 15;
/** the tee's limits ([ ] size it): 0.7 (10 x 6 m) to 2 (28 x 16 m: New hole's tee is 28 m long), in steps of 0.1; Add tee lays 1 (14 x 8 m) */
export const TEE_SCALE_MIN = 0.7, TEE_SCALE_MAX = 2, TEE_SCALE_STEP = 0.1;
/** a size kept within the limits, to a tenth */
export const clampTeeScale = (s: number): number => Math.round(Math.min(TEE_SCALE_MAX, Math.max(TEE_SCALE_MIN, Number.isFinite(s) ? s : 1)) * 10) / 10;
/** a box's length and width at size s (m) */
export const teeBoxM = (s: number): { len: number; wid: number } => ({ len: Math.round(BOX_LEN_M * s * 10) / 10, wid: Math.round(BOX_WID_M * s * 10) / 10 });
/** a tee stands this far from the pin or more (New hole's own rule for the green) */
export const TEE_MIN_TO_PIN_M = 60;
/** the area of a 14 x 8 m box (m²: the stadium) */
const BOX_M2 = (BOX_LEN_M - BOX_WID_M) * BOX_WID_M + Math.PI * (BOX_WID_M / 2) ** 2;

/** where hole n's tees face: its first aim point (the line's first bend), else its pin; null without either */
export function teeAim(n: number, pins: readonly Pin[], aims: readonly AimPoint[]): Pt | null {
  const a = aims.filter(q => q.hole === n).sort((p, q) => p.order - q.order)[0], pin = pins.find(p => p.hole === n);
  const t = a ?? pin; return t ? { x: t.x, y: t.y } : null;
}
/** the heading (radians) of a box at p: toward aim (the line of play), turned turnDeg; east without an aim */
export function boxAngle(p: Pt, aim: Pt | null, turnDeg = 0): number {
  const base = aim && Math.hypot(aim.x - p.x, aim.y - p.y) > 1e-6 ? Math.atan2(aim.y - p.y, aim.x - p.x) : 0;
  return base + (turnDeg * Math.PI) / 180;
}
/** a turn (degrees) to the nearest R step, in -180..180 */
export function snapTurn(deg: number): number {
  const t = Math.round((Number.isFinite(deg) ? deg : 0) / TEE_TURN_DEG) * TEE_TURN_DEG;
  return ((((t + 180) % 360) + 360) % 360) - 180;
}
/** the box's outline (tiles x0 y0 ...): a teeBox at (x, y), heading a, size s */
export function boxOutline(x: number, y: number, a: number, s: number): number[] { return teeBox({ x, y }, { x: Math.cos(a), y: Math.sin(a) }, s); }

// ---------- geometry ----------
/** whether (x, y) lies inside the outline pts (even-odd) */
export function inPoly(pts: readonly number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i]!, yi = pts[i + 1]!, xj = pts[j]!, yj = pts[j + 1]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** the squared distance from (px, py) to the segment a-b */
function segD2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  const qx = ax + dx * t - px, qy = ay + dy * t - py; return qx * qx + qy * qy;
}
/** the distance from (x, y) to the outline pts (0 inside it) */
export function polyDist(pts: readonly number[], x: number, y: number): number {
  if (inPoly(pts, x, y)) return 0;
  let d = Infinity;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) d = Math.min(d, segD2(x, y, pts[j]!, pts[j + 1]!, pts[i]!, pts[i + 1]!));
  return Math.sqrt(d);
}
/** the outline's box [x0, y0, x1, y1] (tiles) */
function bbox(pts: readonly number[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k + 1 < pts.length; k += 2) { x0 = Math.min(x0, pts[k]!); x1 = Math.max(x1, pts[k]!); y0 = Math.min(y0, pts[k + 1]!); y1 = Math.max(y1, pts[k + 1]!); }
  return [x0, y0, x1, y1];
}
/** the cells of g whose middles lie inside the outline pts (the cells the box lays), row by row; whether the outline runs off the grid */
export function polyCells(g: Grid, pts: readonly number[]): { cells: number[]; off: boolean } {
  const [x0, y0, x1, y1] = bbox(pts), out: number[] = [];
  const off = x0 < g.x0 || y0 < g.y0 || x1 > g.x0 + g.w * CELL_T || y1 > g.y0 + g.h * CELL_T;
  const cx0 = Math.max(0, Math.floor((x0 - g.x0) / CELL_T)), cx1 = Math.min(g.w - 1, Math.floor((x1 - g.x0) / CELL_T));
  const cy0 = Math.max(0, Math.floor((y0 - g.y0) / CELL_T)), cy1 = Math.min(g.h - 1, Math.floor((y1 - g.y0) / CELL_T));
  for (let cy = cy0; cy <= cy1; cy++) {
    const yc = g.y0 + (cy + 0.5) * CELL_T;
    for (let cx = cx0; cx <= cx1; cx++) if (inPoly(pts, g.x0 + (cx + 0.5) * CELL_T, yc)) out.push(cy * g.w + cx);
  }
  return { cells: out, off };
}

// ---------- a spot's cells and its refusal ----------
/** a road near a box: a segment (tiles), its half width (the roadbed and its walks) and its class's name ('cart path', 'street', ...) */
export interface TeeRoad { ax: number; ay: number; bx: number; by: number; hw: number; name: string }
/** the distance from (x, y) to a road's centre line (tiles) */
export const roadDist = (x: number, y: number, r: TeeRoad): number => Math.sqrt(segD2(x, y, r.ax, r.ay, r.bx, r.by));
/** a set's box as it stands, for a move or a removal (Engine.teeOld): its middle, heading and size; its outline (a recorded box), its cells (an
 *  older box); whether it is recorded; the sets whose markers stand on it too (shared: it stays for them, only this set's marker goes); and what
 *  goes back: the cells (back) and the pad's heights (hb) */
export interface TeeOld {
  x: number; y: number; a: number; s: number; pts: number[] | null; cells?: number[]; rec: boolean; shared: TeeKind[];
  back: GridDiff | null; hb: { k: Int32Array; v: Float32Array; box: CourseTileBox } | null;
}
/** a box worked out at a spot (Engine.teePlan: the ghost, a click, Add tee): its middle, heading, size and outline, the cells it lays, why it
 *  cannot go ('' it can), the cells refused, those that become tee turf, the turf's and the pad's prices and the earth moved, the total, the set's
 *  length (m) and par from there, and the old box a move takes up */
export interface TeePlan {
  x: number; y: number; a: number; s: number; pts: number[]; cells: number[]; why: string; out: number; turf: number;
  turfCost: number; earth: number; m3: number; cost: number; m: number; par: number; old: TeeOld | null;
}
/** what a spot is checked against: the hole the box is for, your land (and why not), the practice area, the roads near it, and (a move) the
 *  surfaces the set's old box goes back to, by cell */
export interface TeeSpotCtx {
  hole: number;
  own?(x: number, y: number): boolean;
  landWhy?(x: number, y: number): string;
  practice?(x: number, y: number): boolean;
  roads?: readonly TeeRoad[];
  back?: ReadonlyMap<number, number>;
}
/** a spot: the cells the box lays (all its cells when it can go; the ones that may when Add tee leaves the others out), the cells that become tee
 *  turf (priced), the cells refused, and why ('' none): the first of land, the practice area, a road, another hole, water, the green */
export interface TeeSpot { cells: number[]; turf: number; out: number; why: string }
/** the refusals, in the order a spot reports them */
const WHY_ORDER = ['land', 'practice', 'road', 'hole', 'water', 'green'] as const;
export const TEE_WHY = { practice: 'The practice area is there', water: 'Water is there', green: 'The green is there', land: 'Not your land' } as const;
export function teeSpot(g: Grid, pts: readonly number[], c: TeeSpotCtx): TeeSpot {
  const { cells, off } = polyCells(g, pts), ok: number[] = [], why = new Map<string, string>();
  let turf = 0, out = 0;
  if (off) why.set('land', TEE_WHY.land);
  for (const i of cells) {
    const q = cellCentre(g, i), back = c.back?.get(i), s = back ?? g.surf[i]!, h = back !== undefined ? c.hole : g.hole[i]!;
    let k: (typeof WHY_ORDER)[number] | '' = '', text = '';
    if (c.own && !c.own(q.x, q.y)) { k = 'land'; text = c.landWhy?.(q.x, q.y) || TEE_WHY.land; }
    else if (c.practice?.(q.x, q.y)) { k = 'practice'; text = TEE_WHY.practice; }
    else if (c.roads?.length) { const r = c.roads.find(r => segD2(q.x, q.y, r.ax, r.ay, r.bx, r.by) < r.hw * r.hw); if (r) { k = 'road'; text = `${/^[aeiou]/i.test(r.name) ? 'An' : 'A'} ${r.name} is there`; } }
    if (!k && h && h !== c.hole) { k = 'hole'; text = `Hole ${h} is there`; }
    if (!k && s === SURF.water) { k = 'water'; text = TEE_WHY.water; }
    if (!k && s === SURF.green) { k = 'green'; text = TEE_WHY.green; }
    if (k) { out++; if (!why.has(k)) why.set(k, text); continue; }
    ok.push(i); if (s !== SURF.tee) turf++; // (priced as the grid prices a diff: a cell that only changes its hole or month is free)
  }
  const first = WHY_ORDER.find(k => why.has(k));
  return { cells: ok, turf, out, why: first ? why.get(first)! : cells.length ? '' : 'No room for a tee box there' };
}

// ---------- the record: the cells a box changed, as they were ----------
const b64 = (u: Uint8Array): string => { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]!); return btoa(s); };
const unb64 = (s: unknown): Uint8Array => {
  if (typeof s !== 'string' || !s) return new Uint8Array(0);
  try { const t = atob(s), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; } catch { return new Uint8Array(0); }
};
/** a cell a box changed, as it was: its middle (tiles), surface, hole, month and custom grass slot (T271: 0 its surface's own look) */
export interface UnderCell { x: number; y: number; s: number; h: number; m: number; k: number }
/** the bytes a cell takes in a record */
const UNDER_B = 7;
/** the cells diff d changed, as they were (d's before values), packed: the cells' own lattice spots (so a grid that grows later finds them), base64
 *  of a base cell (int32 x, y) and 7 bytes a cell (dx, dy, surface, hole, month u16, custom grass slot) */
export function packUnder(d: GridDiff): string {
  if (!d.n) return '';
  const ox = Math.round(d.x0 / CELL_T), oy = Math.round(d.y0 / CELL_T), ax: number[] = [], ay: number[] = [];
  let bx = Infinity, by = Infinity;
  for (let k = 0; k < d.n; k++) { const cx = d.idx[k]! % d.w, cy = (d.idx[k]! - cx) / d.w; ax.push(ox + cx); ay.push(oy + cy); bx = Math.min(bx, ox + cx); by = Math.min(by, oy + cy); }
  const keep: number[] = []; for (let k = 0; k < d.n; k++) if (ax[k]! - bx < 256 && ay[k]! - by < 256) keep.push(k);
  const buf = new ArrayBuffer(8 + keep.length * UNDER_B), v = new DataView(buf);
  v.setInt32(0, bx, true); v.setInt32(4, by, true);
  keep.forEach((k, j) => {
    const o = 8 + j * UNDER_B, lk = d.k0?.[k] ?? 0;
    v.setUint8(o, ax[k]! - bx); v.setUint8(o + 1, ay[k]! - by); v.setUint8(o + 2, d.s0[k]!); v.setUint8(o + 3, d.h0[k]!); v.setUint16(o + 4, d.m0[k]!, true); v.setUint8(o + 6, lk === 255 ? 0 : lk);
  });
  return b64(new Uint8Array(buf));
}
/** the cells packUnder kept (none for a bad record) */
export function unpackUnder(s: unknown): UnderCell[] {
  const u = unb64(s); if (u.length < 8 || (u.length - 8) % UNDER_B) return [];
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength), bx = v.getInt32(0, true), by = v.getInt32(4, true), out: UnderCell[] = [];
  for (let o = 8; o + UNDER_B <= u.length; o += UNDER_B) out.push({ x: (bx + v.getUint8(o) + 0.5) * CELL_T, y: (by + v.getUint8(o + 1) + 0.5) * CELL_T, s: v.getUint8(o + 2), h: v.getUint8(o + 3), m: v.getUint16(o + 4, true), k: v.getUint8(o + 6) });
  return out;
}
/** a diff on g from the cells now to the values given (surface, hole, month and custom grass slot; cells as they now are left out); g is not
 *  changed */
function toDiff(g: Grid, idx: readonly number[], s1: readonly number[], h1: readonly number[], m1: readonly number[], k1: readonly number[]): GridDiff {
  const I: number[] = [], S0: number[] = [], H0: number[] = [], M0: number[] = [], K0: number[] = [], S1: number[] = [], H1: number[] = [], M1: number[] = [], K1: number[] = [];
  idx.forEach((i, k) => {
    const lk = g.look?.[i] ?? 0, nk = s1[k] === SURF.none ? 0 : k1[k]!;
    if (g.surf[i] === s1[k] && g.hole[i] === h1[k] && g.month[i] === m1[k] && lk === nk) return;
    I.push(i); S0.push(g.surf[i]!); H0.push(g.hole[i]!); M0.push(g.month[i]!); K0.push(lk); S1.push(s1[k]!); H1.push(h1[k]!); M1.push(m1[k]!); K1.push(nk);
  });
  return { x0: g.x0, y0: g.y0, w: g.w, n: I.length, idx: Uint32Array.from(I), s0: Uint8Array.from(S0), h0: Uint8Array.from(H0), m0: Uint16Array.from(M0), s1: Uint8Array.from(S1), h1: Uint8Array.from(H1), m1: Uint16Array.from(M1), k0: Uint8Array.from(K0), k1: Uint8Array.from(K1) };
}
/** the diff that puts a recorded box's old ground back (hole: its hole now, which a renumber may have changed from rec.n): each recorded cell that
 *  is still the hole's tee, and not kept (keep: another set's box stands there), goes back to its surface, hole, month and custom grass (T271) as
 *  they were. g is not changed */
export function backDiff(g: Grid, rec: TeeBoxRec, hole: number, keep?: (i: number) => boolean): GridDiff {
  const idx: number[] = [], s: number[] = [], h: number[] = [], m: number[] = [], k: number[] = [];
  for (const c of unpackUnder(rec.u)) {
    const i = cellAt(g, c.x, c.y); if (i < 0 || g.surf[i] !== SURF.tee || g.hole[i] !== hole || keep?.(i)) continue;
    idx.push(i); s.push(c.s); h.push(c.h === rec.n ? hole : c.h); m.push(c.m); k.push(c.k);
  }
  return toDiff(g, idx, s, h, m, k);
}
/** whether a record still stands: the cell at its middle is the hole's tee */
export function recStands(g: Grid, rec: TeeBoxRec, hole: number): boolean { const i = cellAt(g, rec.x, rec.y); return i >= 0 && g.surf[i] === SURF.tee && g.hole[i] === hole; }

// ---------- an older box: its cells and the grass round it ----------
/** an older tee box (no record): the hole's tee cells joined (4-way) to cell i0, at most cap */
export function teeCells(g: Grid, hole: number, i0: number, cap = 8000): number[] {
  if (i0 < 0 || g.surf[i0] !== SURF.tee || g.hole[i0] !== hole) return [];
  const seen = new Set<number>([i0]), out: number[] = [i0];
  for (let q = 0; q < out.length && out.length < cap; q++) {
    const i = out[q]!, cx = i % g.w, cy = (i - cx) / g.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
      const j = y * g.w + x; if (seen.has(j) || g.surf[j] !== SURF.tee || g.hole[j] !== hole) continue;
      seen.add(j); out.push(j);
    }
  }
  return out;
}
/** the ground an older box goes back to: the commonest ground round it (the cells two out, this hole's or no hole's, not a tee: a surface and its
 *  custom grass, T271) with a month of such a cell; the hole's rough, grown in, when there is none */
export function groundRound(g: Grid, cells: readonly number[], hole: number): { s: number; h: number; m: number; k: number } {
  const mine = new Set(cells), count = new Map<string, { n: number; s: number; h: number; m: number; k: number }>();
  for (const i of cells) {
    const cx = i % g.w, cy = (i - cx) / g.w;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
      const j = y * g.w + x; if (mine.has(j)) continue;
      const s = g.surf[j]!, h = g.hole[j]!, lk = g.look?.[j] ?? 0; if (s === SURF.tee || (h && h !== hole)) continue;
      const key = `${s}:${h}:${lk}`, c = count.get(key); if (c) c.n++; else count.set(key, { n: 1, s, h, m: g.month[j]!, k: lk });
    }
  }
  let best: { n: number; s: number; h: number; m: number; k: number } | null = null;
  for (const c of count.values()) if (!best || c.n > best.n) best = c;
  return best ? { s: best.s, h: best.s === SURF.none ? 0 : best.h, m: best.m, k: best.k } : { s: SURF.rough, h: hole, m: 0, k: 0 };
}
/** the diff that sets cells to v (those kept, and those as they are, left out); g is not changed */
export function fillDiff(g: Grid, cells: readonly number[], v: { s: number; h: number; m: number; k?: number }, keep?: (i: number) => boolean): GridDiff {
  const idx = cells.filter(i => !keep?.(i));
  return toDiff(g, idx, idx.map(() => v.s), idx.map(() => v.h), idx.map(() => v.m), idx.map(() => v.k ?? 0));
}
/** an older box's middle (tiles) and the size of the same area (within the limits) */
export function cellsFit(g: Grid, cells: readonly number[]): { x: number; y: number; s: number } {
  if (!cells.length) return { x: 0, y: 0, s: 1 };
  let x = 0, y = 0; for (const i of cells) { const c = cellCentre(g, i); x += c.x; y += c.y; }
  const m2 = cells.length * (CELL_T * TILE_M) ** 2;
  return { x: x / cells.length, y: y / cells.length, s: clampTeeScale(Math.sqrt(m2 / BOX_M2)) };
}

// ---------- the level pad ----------
/** the pad's reach (tiles): held level within hold of the box (a height sample's bilinear reach is one step, so every sample under the box's
 *  turf is held), eased back to the ground over blend past it; a change under minDh (m) is left out */
export const PAD = { hold: CH_STEP, blend: 3 * CH_STEP, minDh: 0.002 } as const;
/** a pad: the samples it changes (CH_SIZE row-major), their heights before and after, its box (tiles, for the height journal and the re-bake),
 *  the level (m) and the earth cut and filled (m³; moved: max of the two, the cut carried to the fills) */
export interface TeePad { k: Int32Array; before: Float32Array; after: Float32Array; box: CourseTileBox | null; level: number; cut: number; fill: number; m3: number }
export const NO_PAD: TeePad = { k: new Int32Array(0), before: new Float32Array(0), after: new Float32Array(0), box: null, level: 0, cut: 0, fill: 0, m3: 0 };
const smooth = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
/** the level pad under the box pts (tiles): the samples within PAD.hold of it go to their mean height, those out to hold + blend ease back to
 *  the ground; a sample keep(X, Y) holds (another hole's, water, a road's corridor, off your land, another tee) does not move. read(k): sample
 *  k's height (the field's, or as a move will have put it back) */
export function levelPad(read: (k: number) => number, pts: readonly number[], keep?: (X: number, Y: number) => boolean): TeePad {
  if (pts.length < 6) return NO_PAD;
  const [x0, y0, x1, y1] = bbox(pts), R = PAD.hold + PAD.blend;
  const i0 = Math.max(0, Math.floor((x0 - R) / CH_STEP)), i1 = Math.min(CH_SIZE - 1, Math.ceil((x1 + R) / CH_STEP));
  const j0 = Math.max(0, Math.floor((y0 - R) / CH_STEP)), j1 = Math.min(CH_SIZE - 1, Math.ceil((y1 + R) / CH_STEP));
  const S: { k: number; d: number; X: number; Y: number }[] = [];
  let sum = 0, n = 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const X = (i + 0.5) * CH_STEP, Y = (j + 0.5) * CH_STEP, d = polyDist(pts, X, Y); if (d >= R || keep?.(X, Y)) continue;
    const k = j * CH_SIZE + i; S.push({ k, d, X, Y }); if (d <= PAD.hold) { sum += read(k); n++; }
  }
  if (!n) return NO_PAD;
  const level = sum / n, ks: number[] = [], before: number[] = [], after: number[] = [];
  let cut = 0, fill = 0, bi0 = Infinity, bj0 = Infinity, bi1 = -Infinity, bj1 = -Infinity;
  for (const q of S) {
    const w = q.d <= PAD.hold ? 1 : 1 - smooth((q.d - PAD.hold) / PAD.blend), old = read(q.k), nh = Math.fround(clampCourseHeightM(old + w * (level - old)));
    if (nh === old || (q.d > PAD.hold && Math.abs(nh - old) < PAD.minDh)) continue; // (under the box every sample takes the level, however near)
    ks.push(q.k); before.push(old); after.push(nh);
    if (nh > old) fill += (nh - old) * COURSE_CELL_M2; else cut += (old - nh) * COURSE_CELL_M2;
    const gi = q.k % CH_SIZE, gj = (q.k - gi) / CH_SIZE;
    bi0 = Math.min(bi0, gi); bi1 = Math.max(bi1, gi); bj0 = Math.min(bj0, gj); bj1 = Math.max(bj1, gj);
  }
  return {
    k: Int32Array.from(ks), before: Float32Array.from(before), after: Float32Array.from(after),
    box: ks.length ? [bi0 * CH_STEP, bj0 * CH_STEP, (bi1 + 1) * CH_STEP, (bj1 + 1) * CH_STEP] : null, level, cut, fill, m3: Math.max(cut, fill),
  };
}
/** a pad packed for the record: base64 of a base sample (u16 i, j) and 10 bytes a sample (di, dj, before f32, after f32) */
export function packPad(p: TeePad): string {
  if (!p.k.length) return '';
  let bi = Infinity, bj = Infinity; for (const k of p.k) { bi = Math.min(bi, k % CH_SIZE); bj = Math.min(bj, Math.floor(k / CH_SIZE)); }
  const keep: number[] = []; p.k.forEach((k, q) => { if ((k % CH_SIZE) - bi < 256 && Math.floor(k / CH_SIZE) - bj < 256) keep.push(q); });
  const buf = new ArrayBuffer(4 + keep.length * 10), v = new DataView(buf);
  v.setUint16(0, bi, true); v.setUint16(2, bj, true);
  keep.forEach((q, j) => { const o = 4 + j * 10, k = p.k[q]!; v.setUint8(o, (k % CH_SIZE) - bi); v.setUint8(o + 1, Math.floor(k / CH_SIZE) - bj); v.setFloat32(o + 2, p.before[q]!, true); v.setFloat32(o + 6, p.after[q]!, true); });
  return b64(new Uint8Array(buf));
}
/** the samples packPad kept (none for a bad record) */
export function unpackPad(s: unknown): { k: number; before: number; after: number }[] {
  const u = unb64(s); if (u.length < 4 || (u.length - 4) % 10) return [];
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength), bi = v.getUint16(0, true), bj = v.getUint16(2, true), out: { k: number; before: number; after: number }[] = [];
  for (let o = 4; o + 10 <= u.length; o += 10) out.push({ k: (bj + v.getUint8(o + 1)) * CH_SIZE + bi + v.getUint8(o), before: v.getFloat32(o + 2, true), after: v.getFloat32(o + 6, true) });
  return out;
}
/** the heights a recorded pad puts back: each sample still as the pad left it goes back to its height before (one the player has shaped since
 *  stays); null when none does */
export function padBack(read: (k: number) => number, z: unknown): { k: Int32Array; v: Float32Array; box: CourseTileBox } | null {
  const ks: number[] = [], vs: number[] = []; let bi0 = Infinity, bj0 = Infinity, bi1 = -Infinity, bj1 = -Infinity;
  for (const q of unpackPad(z)) {
    if (Math.abs(read(q.k) - q.after) > 1e-4) continue;
    ks.push(q.k); vs.push(q.before);
    const gi = q.k % CH_SIZE, gj = (q.k - gi) / CH_SIZE; bi0 = Math.min(bi0, gi); bi1 = Math.max(bi1, gi); bj0 = Math.min(bj0, gj); bj1 = Math.max(bj1, gj);
  }
  return ks.length ? { k: Int32Array.from(ks), v: Float32Array.from(vs), box: [bi0 * CH_STEP, bj0 * CH_STEP, (bi1 + 1) * CH_STEP, (bj1 + 1) * CH_STEP] } : null;
}

// ---------- a box on the course: worked out, laid and taken up ----------
/** the course a tee box is worked out on (the engine's, or a test's): the grid and height field, the markers and the boxes' records, your land
 *  (and why not), the practice area, the roads near a spot, and the prices (golf: a golf game pays; unit: a tee cell's turf, Seed or Sod) */
export interface TeeCourse {
  grid: Grid; field: CourseHeightField | null;
  pins: readonly Pin[]; tees: readonly TeeMark[]; aims: readonly AimPoint[]; boxes: Readonly<Record<string, TeeBoxRec>>;
  own?(x: number, y: number): boolean; landWhy?(x: number, y: number): string; practice?(x: number, y: number): boolean;
  roadsNear?(x: number, y: number, r: number): TeeRoad[];
  golf: boolean; unit: number;
}
/** the edits a tee set's undo step (PaintTool.teeStep) gives its work: the grid and height field, the planting month and kind (Seed or Sod), cells
 *  (a diff already applied to the grid: kept for undo and drawn), heights (box: the tiles it touches, journaled before set writes the field; the
 *  roads re-flatten and the ground re-bakes there) and spend (paid, and back on undo) */
export interface TeeStepEdit {
  grid: Grid; field: CourseHeightField | null; month: number; plant: 'seed' | 'sod';
  cells(d: GridDiff): void;
  heights(box: CourseTileBox, set: (f: CourseHeightField) => void): void;
  spend(n: number): void;
}
/** how far round a box at size s the roads matter (tiles: the box, its pad's reach and a margin) */
const roadReach = (s: number) => (BOX_LEN_M / TILE_M) * s + PAD.hold + PAD.blend + 4;
/** a height sample a tee's pad leaves alone: one whose reach (the tiles round its middle) holds another hole's cell, water, a green, another tee of
 *  the hole (not this box's cells, mine), land you do not own, or a road's or cart path's corridor. back: the surfaces a move puts back, by cell */
export function padKeep(c: TeeCourse, n: number, mine: ReadonlySet<number>, roads: readonly TeeRoad[], back?: ReadonlyMap<number, number>): (X: number, Y: number) => boolean {
  const g = c.grid, D = [-1.5, 0, 1.5];
  return (X, Y) => {
    for (const dy of D) for (const dx of D) {
      const x = X + dx, y = Y + dy, i = cellAt(g, x, y);
      if (i < 0 || (c.own && !c.own(x, y))) return true;
      const s = back?.get(i) ?? g.surf[i]!, h = back?.has(i) ? n : g.hole[i]!;
      if ((h && h !== n) || s === SURF.water || s === SURF.green || (s === SURF.tee && !mine.has(i))) return true;
    }
    return roads.some(r => roadDist(X, Y, r) < r.hw + 2);
  };
}
/** hole n's set `kind`'s box as it stands, and what a move or a removal puts back: a box Place or Add tee laid, its record's cells and pad heights as
 *  they were (backDiff, padBack); an older box (New hole's, painted by hand, an old save's), its tee cells back to the grass round them
 *  (groundRound). Another set's own box keeps its cells. Shared: the sets whose markers stand on it too (it stays for them: only this set's marker
 *  goes). Null: the hole has no such set */
export function oldBox(c: TeeCourse, n: number, kind: TeeKind): TeeOld | null {
  const g = c.grid, t = c.tees.find(q => q.hole === n && q.kind === kind); if (!t) return null;
  const others = c.tees.filter(q => q.hole === n && q.kind !== kind), aim = teeAim(n, c.pins, c.aims), f = c.field;
  const otherPts = others.flatMap(q => { const r = c.boxes[teeKey(n, q.kind)]; return r && recStands(g, r, n) ? [boxOutline(r.x, r.y, r.a, r.s)] : []; });
  const kept = (i: number) => { if (!otherPts.length) return false; const q = cellCentre(g, i); return otherPts.some(p => inPoly(p, q.x, q.y)); };
  const rec = c.boxes[teeKey(n, kind)];
  if (rec && recStands(g, rec, n)) {
    const pts = boxOutline(rec.x, rec.y, rec.a, rec.s), shared = others.filter(q => inPoly(pts, q.x, q.y)).map(q => q.kind);
    return { x: rec.x, y: rec.y, a: rec.a, s: rec.s, pts, rec: true, shared, back: shared.length ? null : backDiff(g, rec, n, kept), hb: shared.length || !f ? null : padBack(k => f.data[k]!, rec.z) };
  }
  const cells = teeCells(g, n, cellAt(g, t.x, t.y)).filter(i => !kept(i));
  if (!cells.length) return { x: t.x, y: t.y, a: boxAngle(t, aim), s: 1, pts: null, rec: false, shared: [], back: null, hb: null }; // its marker stands off any tee: nothing goes back
  const mine = new Set(cells), shared = others.filter(q => mine.has(cellAt(g, q.x, q.y))).map(q => q.kind), fit = cellsFit(g, cells);
  return { x: fit.x, y: fit.y, a: boxAngle(fit, aim), s: fit.s, pts: null, cells, rec: false, shared, back: shared.length ? null : fillDiff(g, cells, groundRound(g, cells, n)), hb: null };
}
/** hole n's set `kind` as a box at (x, y), heading a, size s: its cells, why it cannot go (land you do not own, the practice area, a road or cart path,
 *  another hole, water, the green; nearer the pin than TEE_MIN_TO_PIN_M), its price (the cells that become tee turf at c.unit, and its level pad's
 *  earthworks at the shaping rate) and the set's length and par from there. old (a move): the set's box as it stands (oldBox), which goes back
 *  first. strict false (Add tee): refused cells are left out, and only a box with no cell left is refused */
export function planTee(c: TeeCourse, n: number, kind: TeeKind, x: number, y: number, a: number, s: number, old: TeeOld | null, strict: boolean): TeePlan {
  const g = c.grid, pts = boxOutline(x, y, a, s), ob = old?.back;
  const back = ob?.n ? new Map<number, number>(Array.from(ob.idx, (i, k) => [i, ob.s1[k]!] as [number, number])) : undefined;
  const roads = c.roadsNear?.(x, y, roadReach(s)) ?? [];
  const spot = teeSpot(g, pts, { hole: n, ...(c.own ? { own: c.own } : {}), ...(c.landWhy ? { landWhy: c.landWhy } : {}), ...(c.practice ? { practice: c.practice } : {}), roads, ...(back ? { back } : {}) });
  const pin = c.pins.find(q => q.hole === n);
  let why = spot.why;
  if (strict && !why && pin && Math.hypot(pin.x - x, pin.y - y) * TILE_M < TEE_MIN_TO_PIN_M) why = `Too near the green: a tee stands ${TEE_MIN_TO_PIN_M} m or more from the pin`;
  if (!strict) why = spot.cells.length ? '' : spot.why || 'No room for a tee box there';
  // the pad on the ground as the move will have it (the old pad's heights back first)
  const f = c.field, hb = old?.hb ? new Map<number, number>(Array.from(old.hb.k, (k, q) => [k, old.hb!.v[q]!] as [number, number])) : null;
  const pad = f && spot.cells.length ? levelPad(k => hb?.get(k) ?? f.data[k]!, pts, padKeep(c, n, new Set(spot.cells), roads, back)) : NO_PAD;
  const turfCost = c.golf ? Math.round(spot.turf * c.unit) : 0, earth = c.golf ? Math.round(pad.m3 * SHAPE_RATE_M3) : 0;
  const len = teeLengths(n, c.pins, [{ hole: n, kind, x, y }], c.aims)[0];
  return { x, y, a, s, pts, cells: spot.cells, why, out: spot.out, turf: spot.turf, turfCost, earth, m3: pad.m3, cost: turfCost + earth, m: len?.m ?? 0, par: len?.par ?? 0, old };
}
/** puts a set's old box's ground back inside its undo step (its pad's heights, then its cells), as oldBox worked them out */
export function takeUp(old: TeeOld | null, e: TeeStepEdit): void {
  const hb = old?.hb; if (hb) e.heights(hb.box, f => { for (let q = 0; q < hb.k.length; q++) f.data[hb.k[q]!] = hb.v[q]!; });
  if (old?.back?.n) { applyDiff(e.grid, old.back, false); e.cells(old.back); }
}
/** lays plan p for hole n inside its undo step (PaintTool.teeStep): the old box taken up (takeUp), the box's cells laid as tee turf (the planting
 *  month), its pad levelled on the ground as it now is (the ghost's numbers: the old pad went back first), its price paid. Returns the box's record
 *  and what it cost */
export function layDown(c: TeeCourse, n: number, p: TeePlan, e: TeeStepEdit): { rec: TeeBoxRec; cost: number } {
  takeUp(p.old, e);
  const d = paintCells(e.grid, p.cells, p.cells.length, SURF.tee, n, e.month); e.cells(d);
  const f = e.field, pad = f && p.cells.length ? levelPad(k => f.data[k]!, p.pts, padKeep(c, n, new Set(p.cells), c.roadsNear?.(p.x, p.y, roadReach(p.s)) ?? [])) : NO_PAD;
  if (pad.box) e.heights(pad.box, fl => { for (let q = 0; q < pad.k.length; q++) fl.data[pad.k[q]!] = pad.after[q]!; });
  const cost = c.golf ? Math.round(diffCost(d, () => c.unit)) + Math.round(pad.m3 * SHAPE_RATE_M3) : 0;
  e.spend(cost);
  return { rec: { x: p.x, y: p.y, a: p.a, s: p.s, n, u: packUnder(d), ...(pad.k.length ? { z: packPad(pad) } : {}) }, cost };
}
/** the records after hole n's set `kind` left its old box (a move or a removal): a set left standing on a recorded box takes its record (that box
 *  is its own now); rec, the set's new box (none: removed) */
export function handOver(boxes: Record<string, TeeBoxRec>, n: number, kind: TeeKind, old: TeeOld | null, rec: TeeBoxRec | null): void {
  const key = teeKey(n, kind), was = boxes[key];
  if (old?.shared.length && old.rec && was) { const k = old.shared.find(q => !boxes[teeKey(n, q)]); if (k) boxes[teeKey(n, k)] = was; }
  if (rec) boxes[key] = rec; else delete boxes[key];
}

// ---------- the save ----------
/** a set's key in GolfSave.teeBoxes */
export const teeKey = (hole: number, kind: TeeKind): string => `${hole}:${kind}`;
/** a loaded save's box records, well formed only (null: none kept) */
export function normalizeTeeBoxes(v: unknown): Record<string, TeeBoxRec> | null {
  if (!v || typeof v !== 'object') return null;
  const out: Record<string, TeeBoxRec> = {};
  for (const [key, r] of Object.entries(v as Record<string, unknown>)) {
    const [h, k] = key.split(':'), q = r as Partial<TeeBoxRec> | null;
    if (!q || !isTeeKind(k) || !(Number(h) >= 1) || typeof q.u !== 'string') continue;
    if (![q.x, q.y, q.a, q.s, q.n].every(n => typeof n === 'number' && Number.isFinite(n))) continue;
    out[key] = { x: q.x!, y: q.y!, a: q.a!, s: clampTeeScale(q.s!), n: q.n!, u: q.u, ...(typeof q.z === 'string' && q.z ? { z: q.z } : {}) };
  }
  return Object.keys(out).length ? out : null;
}
/** the records after holes a and b traded numbers (the engine's renumber) */
export function swapTeeBoxes(r: Record<string, TeeBoxRec> | undefined, a: number, b: number): Record<string, TeeBoxRec> | undefined {
  if (!r) return r;
  const out: Record<string, TeeBoxRec> = {};
  for (const [key, v] of Object.entries(r)) { const [h, k] = key.split(':'), n = Number(h); out[`${n === a ? b : n === b ? a : n}:${k}`] = v; }
  return out;
}
/** the records without hole n's (it was deleted, or placed again from My holes) */
export function dropHoleBoxes(r: Record<string, TeeBoxRec> | undefined, n: number): void {
  if (r) for (const k of TEE_KINDS) delete r[teeKey(n, k)];
}

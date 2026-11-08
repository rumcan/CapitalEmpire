// T353 (#995; the owner, 2026-11-08: "Add a way to add house lots to my golf course people can buy and build on if its not there."): house lots on
// your course. The player lays estate plots on his own land along a street, beside the holes; the townsfolk buy them (the club is paid) and build houses
// on them over a few months; a finished house brings a resident member and pays a small monthly levy; a ball that lands on a lot is out of bounds.
// This file is the whole model, pure TS with no DOM (the tool that lays the lots is estatetool.ts, the engine draws them and keeps the books):
// - the lots' FRAME: a lot is the town's own lot (lots/lots.ts: frontage x depth of the street's class, on the global lattice along the street, its origin
//   o at the verge's edge, u along the street, n away from it), so the town's lot composer (lots/compose.ts) draws its building site and its house as it
//   draws a town lot's, with the saved game's lot model; frontageFrames / pickFrames work them out from a street piece;
// - the RULES (lotWhy): the player's own land, no playing surface under it (tee, fairway, green, bunker, water hazard, waste: the rough, the long grass and the
//   fescue are covered as a street covers them, T355), no water, no road, cart path or
//   drive, nothing built there, no other lot, and out of range of every hole (the hole card's "golfers there are in range", NEAR_M / 2 from the hole's line);
// - the VIEW and the PRICE: a lot on a fairway or a green, or by water, asks more; so does a course with a name (reputation);
// - the MARKET: buyers come at a rate set by the reputation and the town's growth, and take the best lot first; a sold lot waits, is built over a few
//   months (the building site, then the house) and finishes (stepEstate); a finished house pays a levy each month and brings a member (the engine);
// - the SAVE: GolfSave.estate as flat tuples (encodeEstate / normalizeEstate).
// placeLots(estate, along, env, now) is the one call that lays lots along streets, for the tool's drag and for T354's imported streets alike.
import type { Pt } from '../network';
import { CELL_T, SURF, cellAt, type Grid } from '../ext/course-grid';
import { SIZE as LOT_SIZE } from '../lots/lots';
import { NEAR_M } from '../ext/hole-wizard';
import { playWhy } from './parcels';
import { TILE_M } from './types';

// ---------------------------------------------------------------------------------------------------------------------------------------------
// the numbers (the owner's balance is one line each)
// ---------------------------------------------------------------------------------------------------------------------------------------------
/** how near a hole's line a lot may lie (tiles): half the distance at which two holes are "too close, golfers there are in range" (the hole card, NEAR_M m) */
export const RANGE_T = NEAR_M / 2 / TILE_M;
/** a lot's price ($) before the reputation and the view: the standard 10 x 15 tile lot (20 x 30 m = 600 m²) at $20 a m² */
export const M2_PRICE = 20;
/** the price's reputation term: 0.7 at reputation 0 to 1.5 at 100 (reputation is 0..100; a new club starts at 30) */
export const REP_PRICE: readonly [number, number] = [0.7, 0.8];
/** what a view adds to the price (a share): a fairway beside the lot, a green, water; the sum is held to VIEW_CAP */
export const VIEW_BONUS = { fairway: 0.25, green: 0.4, water: 0.2 } as const;
export const VIEW_CAP = 0.7;
/** laying a lot costs this much ($ a lot: the survey, the pegs and the services run to the lot line) */
export const LAY_COST = 1000;
/** the buyers: lots a month at SELL_PER_MONTH x (SELL_REP[0] + SELL_REP[1] x reputation / 100) x the town's demand; a month with no lot for sale keeps at most
 *  MARKET_CAP buyers waiting, and a new estate starts with START_MARKET of one */
export const SELL_PER_MONTH = 1.4;
export const SELL_REP: readonly [number, number] = [0.5, 1];
export const MARKET_CAP = 1.5, START_MARKET = 0.5;
/** the months a sold lot waits before its house starts, and the months the house takes (each lot's own within the range, by its seed) */
export const SOLD_MONTHS: readonly [number, number] = [0.5, 1.2];
export const BUILD_MONTHS: readonly [number, number] = [2, 3.5];
/** what a finished house pays the club each month ($: the estate levy for the grounds the estate looks onto); its owner joins the club besides */
export const LEVY = 20;
/** a lot whose street runs more than this many degrees off both map axes cannot take a house (lots/compose.ts isAngled: it draws a green) */
export const OFF_AXIS_DEG = 20;
/** the time step stepEstate works in (months): a long skip sells and builds as a run of short months would */
const STEP = 0.25;

// ---------------------------------------------------------------------------------------------------------------------------------------------
// the lots
// ---------------------------------------------------------------------------------------------------------------------------------------------
/** a lot's stage: for sale (a pegged plot with a For Sale post), sold (the buyer is arranging the build: the plot, no post), building (the building site),
 *  built (the house) */
export const ST = { SALE: 0, SOLD: 1, BUILDING: 2, BUILT: 3 } as const;
export type Stage = 0 | 1 | 2 | 3;
export const STAGE_NAME: readonly string[] = ['For sale', 'Sold', 'Being built', 'Built'];
/** the For Sale post a plot for sale shows (a stand-in sign: docs/GOLF-SPRITES.md asks for the real one) */
export const SALE_SIGN = 'newprop:shanty-signpost';

/** a laid lot: its id, its frame (the town lot's: origin o at the front-left corner at the verge's edge, u along the street, n away from it, w x d tiles),
 *  its stage and the game month (a fractional count, the engine's golfMonthAt) the stage began (at) and ends (after: Infinity for built), the seed its house
 *  is drawn from, the price it sold at ($; 0 while for sale) and whether its owner has joined the club */
export interface EstateLot { id: number; o: Pt; u: Pt; n: Pt; w: number; d: number; st: Stage; at: number; after: number; seed: number; price: number; member?: boolean }
/** the estate: the next lot id, the month it was last stepped to, the buyers waiting (a float: the market's accumulator) and the lots in id order; rev (not
 *  saved) counts the changes so the lookups rebuild */
export interface Estate { next: number; t: number; market: number; lots: EstateLot[]; rev: number }
export const newEstate = (t = 0): Estate => ({ next: 1, t, market: START_MARKET, lots: [], rev: 0 });

/** a lot's corners, from its front-left clockwise: o, o + u w, o + u w + n d, o + n d */
export function cornersOf(f: Pick<EstateLot, 'o' | 'u' | 'n' | 'w' | 'd'>): Pt[] {
  const a = { x: f.o.x + f.u.x * f.w, y: f.o.y + f.u.y * f.w }, c = { x: a.x + f.n.x * f.d, y: a.y + f.n.y * f.d }, b = { x: f.o.x + f.n.x * f.d, y: f.o.y + f.n.y * f.d };
  return [{ x: f.o.x, y: f.o.y }, a, c, b];
}
/** a lot's bounding box [x0, y0, x1, y1] (tiles) */
export function boxOf(f: Pick<EstateLot, 'o' | 'u' | 'n' | 'w' | 'd'>): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of cornersOf(f)) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return [x0, y0, x1, y1];
}
/** a lot's centre */
export const centreOf = (f: Pick<EstateLot, 'o' | 'u' | 'n' | 'w' | 'd'>): Pt => ({ x: f.o.x + f.u.x * f.w / 2 + f.n.x * f.d / 2, y: f.o.y + f.u.y * f.w / 2 + f.n.y * f.d / 2 });
/** the point (a, b) of a lot's frame in the world: a along the street, b away from it */
export const ptAt = (f: Pick<EstateLot, 'o' | 'u' | 'n'>, a: number, b: number): Pt => ({ x: f.o.x + f.u.x * a + f.n.x * b, y: f.o.y + f.u.y * a + f.n.y * b });
/** a lot's frame coordinates of a world point: a along the street, b away from it */
const local = (f: Pick<EstateLot, 'o' | 'u' | 'n'>, x: number, y: number): [number, number] => { const dx = x - f.o.x, dy = y - f.o.y; return [dx * f.u.x + dy * f.u.y, dx * f.n.x + dy * f.n.y]; };
/** whether a world point lies inside a lot (its edges included) */
export function inLot(f: Pick<EstateLot, 'o' | 'u' | 'n' | 'w' | 'd'>, x: number, y: number): boolean { const [a, b] = local(f, x, y); return a >= 0 && a <= f.w && b >= 0 && b <= f.d; }

/** the lot a world point lies in, or null: bounding boxes first (the ball's roll asks this often), kept per estate until it changes */
const INDEX = new WeakMap<Estate, { rev: number; boxes: [number, number, number, number][]; all: [number, number, number, number] | null }>();
export function lotAt(e: Estate, x: number, y: number): EstateLot | null {
  if (!e.lots.length) return null;
  let ix = INDEX.get(e);
  if (!ix || ix.rev !== e.rev || ix.boxes.length !== e.lots.length) {
    const boxes = e.lots.map(boxOf);
    ix = { rev: e.rev, boxes, all: [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])), Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))] };
    INDEX.set(e, ix);
  }
  const A = ix.all!; if (x < A[0] || x > A[2] || y < A[1] || y > A[3]) return null;
  for (let i = 0; i < e.lots.length; i++) { const b = ix.boxes[i]!; if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && inLot(e.lots[i]!, x, y)) return e.lots[i]!; }
  return null;
}

/** the houses finished, and the lots by stage */
export const housesOf = (e: Estate): number => e.lots.reduce((n, l) => n + (l.st === ST.BUILT ? 1 : 0), 0);
export function countsOf(e: Estate): { sale: number; sold: number; building: number; built: number; total: number; takings: number } {
  const c = { sale: 0, sold: 0, building: 0, built: 0, total: e.lots.length, takings: 0 };
  for (const l of e.lots) { if (l.st === ST.SALE) c.sale++; else if (l.st === ST.SOLD) c.sold++; else if (l.st === ST.BUILDING) c.building++; else c.built++; c.takings += l.price; }
  return c;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// a street's frontage, and the lots a drag picks
// ---------------------------------------------------------------------------------------------------------------------------------------------
/** a piece of street lots front (the engine makes it from a road seg): its ends, the road type (its lot size: lots/lots.ts SIZE), its half width and verge
 *  (tiles), and how far its usable span is cut back at each end (a junction's reach, a dead end's bulb: lots/lots.ts endReach) */
export interface StreetSeg { a: Pt; b: Pt; base: string; h: number; walk: number; ra: number; rb: number }
/** a candidate lot on a street: the town lot's frame, the side of the street it is on (+1 the left of a to b, -1 the right), its place k on the lattice and
 *  the index of the street piece in the list it came from */
export interface Frame { o: Pt; u: Pt; n: Pt; w: number; d: number; side: 1 | -1; k: number; seg: number }
/** the lot size (frontage, depth, tiles) a road type's lots have */
export const lotSizeOf = (base: string): [number, number] => LOT_SIZE[base] ?? LOT_SIZE.street!;

/** every lot of the town's lattice along a street piece on the given sides, as lots/lots.ts segLots lays them (without its blockers, which lotWhy judges):
 *  lot k spans [k W, (k + 1) W] along the street line, from the verge's edge out D, wholly inside the piece's usable span */
export function frontageFrames(s: StreetSeg, sides: readonly (1 | -1)[] = [1, -1], seg = 0): Frame[] {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L = Math.hypot(dx, dy); if (L < 1e-6) return [];
  const u = { x: dx / L, y: dy / L }, pu = { x: -u.y, y: u.x }, [W, D] = lotSizeOf(s.base), r0 = s.h + s.walk;
  const t0 = s.a.x * u.x + s.a.y * u.y, t1 = s.b.x * u.x + s.b.y * u.y;
  const kLo = Math.ceil((t0 + s.ra) / W - 1e-9), kHi = Math.floor((t1 - s.rb) / W + 1e-9) - 1;
  if (kHi < kLo) return [];
  const f = { x: s.a.x - u.x * t0, y: s.a.y - u.y * t0 }, out: Frame[] = [];
  for (const side of sides) {
    const n = { x: pu.x * side, y: pu.y * side };
    for (let k = kLo; k <= kHi; k++) out.push({ o: { x: f.x + u.x * k * W + n.x * r0, y: f.y + u.y * k * W + n.y * r0 }, u: { ...u }, n, w: W, d: D, side, k, seg });
  }
  return out;
}

/** how far (tiles) from a click the lot picked may be, and the length under which a drag is a click */
export const CLICK_REACH = 6, CLICK_T = 1.5;
/** the distance from a point to a segment */
function ptSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}
/** the distance from a point to a frame's rectangle (0 inside) */
function ptRect(f: Pick<Frame, 'o' | 'u' | 'n' | 'w' | 'd'>, x: number, y: number): number {
  const [a, b] = local(f, x, y), da = Math.max(-a, 0, a - f.w), db = Math.max(-b, 0, b - f.d);
  return Math.hypot(da, db);
}

/** the lots a pointer picks along streets: a click (a drag under CLICK_T tiles) picks the one lot nearest the point (within CLICK_REACH of its rectangle);
 *  a drag picks, along each street piece, the lots on the side of the street the drag lies on (both sides when it lies on the street itself) whose centres
 *  lie within the drag's extent (half a lot's frontage of slack either end) and within reach of its line. The same lot is never picked twice */
export function pickFrames(segs: readonly StreetSeg[], p0: Pt, p1: Pt, reach = CLICK_REACH): Frame[] {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy);
  if (len < CLICK_T) {
    let best: Frame | null = null, bd = Infinity;
    segs.forEach((s, i) => { for (const f of frontageFrames(s, [1, -1], i)) { const d = ptRect(f, p0.x, p0.y); if (d <= reach && d < bd - 1e-9) { best = f; bd = d; } } });
    return best ? [best] : [];
  }
  const ex = dx / len, ey = dy / len, mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }, out: Frame[] = [], seen = new Set<string>();
  segs.forEach((s, i) => {
    const sx = s.b.x - s.a.x, sy = s.b.y - s.a.y, sl = Math.hypot(sx, sy); if (sl < 1e-6) return;
    const r0 = s.h + s.walk, [, D] = lotSizeOf(s.base);
    // which side(s) the drag lies on: its midpoint's offset from the street's line (on the street itself: both)
    const off = ((mid.x - s.a.x) * -sy + (mid.y - s.a.y) * sx) / sl;
    const sides: (1 | -1)[] = Math.abs(off) <= r0 ? [1, -1] : [off > 0 ? 1 : -1];
    for (const f of frontageFrames(s, sides, i)) {
      const c = centreOf(f), t = (c.x - p0.x) * ex + (c.y - p0.y) * ey, q = Math.abs((c.x - p0.x) * -ey + (c.y - p0.y) * ex);
      if (t < -f.w / 2 + 1e-9 || t > len + f.w / 2 - 1e-9 || q > r0 + D + 1) continue;
      const key = `${f.o.x.toFixed(2)},${f.o.y.toFixed(2)}|${f.u.x.toFixed(3)},${f.u.y.toFixed(3)}|${f.side}`;
      if (!seen.has(key)) { seen.add(key); out.push(f); }
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// the rules
// ---------------------------------------------------------------------------------------------------------------------------------------------
/** a road near a lot for the rules: its centre line, the half width with its verge (tiles) and what it is (a cart path or a course drive is named in the
 *  refusal) */
export interface RoadBit { a: Pt; b: Pt; hw: number; kind: 'cart' | 'drive' | 'road' }
/** what the rules read of the game (the engine gives it; the tests give fakes) */
export interface EstateEnv {
  /** the map is [0, map) tiles square */ map: number;
  /** whether a tile point is the player's land */ owned(x: number, y: number): boolean;
  /** the course grid (null: no course yet) */ grid: Grid | null;
  /** whether a tile point is water in the map (a river, a creek, a lake, a bank); optional */ water?(x: number, y: number): boolean;
  /** each hole's line of play (tee, aim points, pin; tiles) */ lines: readonly { hole: number; line: readonly Pt[] }[];
  /** the roads near a box [x0, y0, x1, y1] */ roads(box: readonly [number, number, number, number]): readonly RoadBit[];
  /** T355's way with a street: the rough, the long grass and the fescue are ground a lot may cover (the lot replaces it, as a street does); only the playing surfaces and the
   *  hazards refuse one. false: every painted surface refuses a lot ({the rough} is in the way: rub it out first). Missing: true */ coverRough?: boolean;
  /** why something stands on a box ('' when the ground is free): a building, a prop of the player's, a car park ... */ blocked?(box: readonly [number, number, number, number]): string;
}
/** the surfaces of the course grid by id, as a refusal calls them */
const SURF_WORD: Readonly<Record<number, string>> = { [SURF.rough]: 'rough', [SURF.fescue]: 'fescue', [SURF.water]: 'water hazard', [SURF.fairway]: 'fairway', [SURF.tee]: 'tee', [SURF.bunker]: 'bunker', [SURF.waste]: 'waste area', [SURF.green]: 'green', [SURF.longGrass]: 'long grass' };
/** the playing surfaces and the hazards: the ones a lot is refused for by name; the rest of the painted ground (the rough, the long grass, the fescue) is
 *  refused with the way to clear it */
const PLAYING: Readonly<Record<number, number>> = { [SURF.green]: 6, [SURF.tee]: 5, [SURF.fairway]: 4, [SURF.bunker]: 3, [SURF.water]: 3, [SURF.waste]: 2 };

/** the sample points of a lot's rectangle every `step` tiles, its edges included */
function samplesOf(f: Pick<Frame, 'o' | 'u' | 'n' | 'w' | 'd'>, step: number): Pt[] {
  const na = Math.max(1, Math.ceil(f.w / step)), nb = Math.max(1, Math.ceil(f.d / step)), out: Pt[] = [];
  for (let j = 0; j <= nb; j++) for (let i = 0; i <= na; i++) out.push(ptAt(f, f.w * i / na, f.d * j / nb));
  return out;
}
/** the distance (tiles) from a lot's rectangle to a polyline: 0 where the line meets it */
export function rectLineDist(f: Pick<Frame, 'o' | 'u' | 'n' | 'w' | 'd'>, line: readonly Pt[]): number {
  if (!line.length) return Infinity;
  const c = cornersOf(f);
  const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) => {
    const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    return o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) < 0 && o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) < 0;
  };
  let best = Infinity;
  for (let i = 0; i < line.length; i++) {
    const p = line[i]!, q = line[Math.min(line.length - 1, i + 1)]!;
    if (inLot(f, p.x, p.y)) return 0;
    for (let k = 0; k < 4; k++) {
      const a = c[k]!, b = c[(k + 1) % 4]!;
      if (i + 1 < line.length && cross(p.x, p.y, q.x, q.y, a.x, a.y, b.x, b.y)) return 0;
      best = Math.min(best, ptSeg(a.x, a.y, p.x, p.y, q.x, q.y), ptSeg(p.x, p.y, a.x, a.y, b.x, b.y), ptSeg(q.x, q.y, a.x, a.y, b.x, b.y));
    }
  }
  return best;
}
/** the separating-axis test on two lots' rectangles: they overlap only by more than tol tiles on every axis (lots side by side on the lattice touch) */
export function lotsOverlap(p: Pick<Frame, 'o' | 'u' | 'n' | 'w' | 'd'>, q: Pick<Frame, 'o' | 'u' | 'n' | 'w' | 'd'>, tol = 0.05): boolean {
  const pc = centreOf(p), qc = centreOf(q), dx = qc.x - pc.x, dy = qc.y - pc.y;
  const apart = (ax: Pt): boolean => {
    const reach = Math.abs(p.u.x * ax.x + p.u.y * ax.y) * p.w / 2 + Math.abs(p.n.x * ax.x + p.n.y * ax.y) * p.d / 2 + Math.abs(q.u.x * ax.x + q.u.y * ax.y) * q.w / 2 + Math.abs(q.n.x * ax.x + q.n.y * ax.y) * q.d / 2;
    return Math.abs(dx * ax.x + dy * ax.y) >= reach - tol;
  };
  return !(apart(p.u) || apart(p.n) || apart(q.u) || apart(q.n));
}
/** whether a lot's frontage runs more than OFF_AXIS_DEG off both map axes (lots/compose.ts isAngled: a house faces the map's axes, so such a lot draws a green) */
export const offAxis = (u: Pt): boolean => Math.max(Math.abs(u.x), Math.abs(u.y)) < Math.cos(OFF_AXIS_DEG * Math.PI / 180);

/** the course grid's painted cells (indices) under a lot: the cells that are not the map's own grass whose centres lie in it. A lot replaces the rough, the long grass and
 *  the fescue under it (as a street does, T355): the engine clears these cells when the lot is laid, as a rub out does, so the lot's own ground (its dirt, its lawn, its drive)
 *  shows instead of the course's, which the ground draws over every lot's */
export function cellsUnder(f: Pick<Frame, 'o' | 'u' | 'n' | 'w' | 'd'>, g: Grid | null): number[] {
  const out: number[] = []; if (!g) return out;
  const box = boxOf(f);
  const cx0 = Math.max(0, Math.floor((box[0] - g.x0) / CELL_T)), cx1 = Math.min(g.w - 1, Math.floor((box[2] - g.x0) / CELL_T));
  const cy0 = Math.max(0, Math.floor((box[1] - g.y0) / CELL_T)), cy1 = Math.min(g.h - 1, Math.floor((box[3] - g.y0) / CELL_T));
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const i = cy * g.w + cx;
    if (g.surf[i] !== SURF.none && inLot(f, g.x0 + (cx + 0.5) * CELL_T, g.y0 + (cy + 0.5) * CELL_T)) out.push(i);
  }
  return out;
}

/** why a lot (a frame, or a laid lot) cannot be laid, '' when it can, in the order a player would fix it: off the map; not his land; a playing surface
 *  under it (by name and hole; the rough, the long grass and the fescue only when env.coverRough is false, with the way to clear it); water; a road, cart path or drive through it; in range of a
 *  hole; something built there; another lot; and a street too far off the map's axes for a house. others: the lots already laid (or accepted) */
export function lotWhy(f: Pick<Frame, 'o' | 'u' | 'n' | 'w' | 'd'>, env: EstateEnv, others: readonly Pick<EstateLot, 'o' | 'u' | 'n' | 'w' | 'd'>[] = []): string {
  const box = boxOf(f);
  if (box[0] < 0 || box[1] < 0 || box[2] > env.map || box[3] > env.map) return 'That is off the map';
  const pts = samplesOf(f, 1.5);
  if (pts.some(p => !env.owned(p.x, p.y))) return 'Not your land: buy the block beside it in Land for sale';
  // the course's painted surfaces under the lot (the grid's cells whose centres lie in it)
  const g = env.grid;
  if (g) {
    let playing = 0, playHole = 0, other = 0;
    const cx0 = Math.max(0, Math.floor((box[0] - g.x0) / CELL_T)), cx1 = Math.min(g.w - 1, Math.floor((box[2] - g.x0) / CELL_T));
    const cy0 = Math.max(0, Math.floor((box[1] - g.y0) / CELL_T)), cy1 = Math.min(g.h - 1, Math.floor((box[3] - g.y0) / CELL_T));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const i = cy * g.w + cx, s = g.surf[i]!; if (s === SURF.none) continue;
      if (!inLot(f, g.x0 + (cx + 0.5) * CELL_T, g.y0 + (cy + 0.5) * CELL_T)) continue;
      const rank = PLAYING[s]; if (rank) { if (rank > (PLAYING[playing] ?? 0)) { playing = s; playHole = g.hole[i]!; } } else if (env.coverRough === false) other = other || s;
    }
    if (playing) return playing === SURF.waste ? 'A waste area is in the way' : playWhy(playing, playHole);
    if (other) return `The ${SURF_WORD[other] ?? 'ground'} is in the way: rub it out first`;
  }
  if (env.water && samplesOf(f, 1).some(p => env.water!(p.x, p.y))) return 'Water is in the way';
  for (const r of env.roads(box)) {
    const bad = pts.some(p => ptSeg(p.x, p.y, r.a.x, r.a.y, r.b.x, r.b.y) < r.hw - 0.05);
    if (bad) return r.kind === 'cart' ? 'A cart path is in the way' : r.kind === 'drive' ? 'A course drive is in the way' : 'A road is in the way';
  }
  let near: { d: number; hole: number } | null = null;
  for (const l of env.lines) { const d = rectLineDist(f, l.line); if (d < RANGE_T - 1e-9 && (!near || d < near.d)) near = { d, hole: l.hole }; }
  if (near) return `Hole ${near.hole}'s line is ${Math.round(near.d * TILE_M)} m away: golfers there are in range`;
  const why = env.blocked?.(box); if (why) return why;
  for (const o of others) if (lotsOverlap(f, o)) return 'A lot is there already';
  if (offAxis(f.u)) return "Houses face the map's axes: lay the street along them (this one is too far off)";
  return '';
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// the view and the price
// ---------------------------------------------------------------------------------------------------------------------------------------------
/** what a lot looks onto: a fairway, a green, water (a pond or the map's water), and the hole whose fairway or green it is (0: none) */
export interface View { fairway: boolean; green: boolean; water: boolean; hole: number }
/** a lot's view: the ground behind it (the side away from the street) and beside it, sampled out to 12 tiles (24 m) in a fan; the course's cells give the
 *  fairway, the green and a pond, the map's water the rest */
export function viewOf(f: Pick<Frame, 'o' | 'u' | 'n' | 'w' | 'd'>, grid: Grid | null, water?: (x: number, y: number) => boolean): View {
  const v: View = { fairway: false, green: false, water: false, hole: 0 };
  const seen = (p: Pt) => {
    if (water?.(p.x, p.y)) v.water = true;
    if (!grid) return;
    const i = cellAt(grid, p.x, p.y); if (i < 0) return;
    const s = grid.surf[i]!;
    if (s === SURF.water) v.water = true;
    else if (s === SURF.green) { v.green = true; v.hole = grid.hole[i]! || v.hole; }
    else if (s === SURF.fairway) { v.fairway = true; if (!v.green) v.hole = grid.hole[i]! || v.hole; }
  };
  for (const r of [1, 3, 5, 8, 12]) {
    for (const a of [0.1, 0.3, 0.5, 0.7, 0.9]) seen(ptAt(f, f.w * a, f.d + r));
    for (const b of [0.4, 0.75]) { seen(ptAt(f, -r, f.d * b)); seen(ptAt(f, f.w + r, f.d * b)); }
  }
  return v;
}
/** the view's term: 1 plus what it adds, held to VIEW_CAP */
export const viewFactor = (v: View): number => 1 + Math.min(VIEW_CAP, (v.fairway ? VIEW_BONUS.fairway : 0) + (v.green ? VIEW_BONUS.green : 0) + (v.water ? VIEW_BONUS.water : 0));
/** the reputation's term (0..100) */
export const repFactor = (rep: number): number => REP_PRICE[0] + REP_PRICE[1] * Math.min(100, Math.max(0, rep)) / 100;
/** what a lot asks ($, to the nearest $100): its area at M2_PRICE, times the reputation's term and the view's */
export function priceOf(f: Pick<Frame, 'w' | 'd'>, v: View, rep: number): number {
  return Math.round(M2_PRICE * f.w * f.d * TILE_M * TILE_M * repFactor(rep) * viewFactor(v) / 100) * 100;
}
/** a short line for a view ("fairway and water views", "no view") */
export function viewWords(v: View): string {
  const w = [v.green ? 'green' : '', v.fairway ? 'fairway' : '', v.water ? 'water' : ''].filter(Boolean);
  return w.length ? `${w.join(' and ')} view` : 'no view';
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// the market and the clock
// ---------------------------------------------------------------------------------------------------------------------------------------------
/** the town's demand for houses (0.35..1.5): the room it has to grow (a range start's residents against the room its earnings make: none left, a third of
 *  the buyers; room for a fifth more, all of them) and its size (0.5 for a hamlet to 1.5 for 2,000 residents). room null: the town has no cap */
export function demandOf(pop: number, room: number | null): number {
  const grow = room === null ? 1 : Math.min(1, Math.max(0, (room - pop) / Math.max(60, 0.2 * room)));
  return (0.35 + 0.65 * grow) * Math.min(1.5, Math.max(0.5, 0.5 + pop / 2000));
}
/** the buyers a month (lots) at a reputation and a demand */
export const sellRate = (rep: number, demand: number): number => SELL_PER_MONTH * (SELL_REP[0] + SELL_REP[1] * Math.min(100, Math.max(0, rep)) / 100) * demand;
/** a number in 0..1 from a seed and a salt (a lot's own luck, the same after a reload) */
const luck = (seed: number, salt: number): number => (Math.imul((seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0, 2654435761) >>> 0) / 4294967296;
const within = (r: readonly [number, number], seed: number, salt: number): number => r[0] + (r[1] - r[0]) * luck(seed, salt);

/** what the game gives the clock: the reputation, the town's demand, and what a lot asks now (its view and the reputation) */
export interface StepEnv { rep: number; demand: number; ask(l: EstateLot): number }
/** what one step did: the lots sold (with their prices), the houses started and finished, and the levy the finished houses owe for the months crossed ($) */
export interface StepOut { sold: { lot: EstateLot; price: number }[]; started: EstateLot[]; built: EstateLot[]; levy: number; months: number }

/** puts the estate on to game month `now` (the engine's fractional month count): in steps of STEP months the buyers come (sellRate; the best-asking lot goes
 *  first, ties by id), sold lots start their houses when their wait is over, houses finish when their time is up, and each whole month crossed the finished
 *  houses owe LEVY. A clock a whole season or more behind the estate's is a new clock (the estate starts from it); a little behind holds. Changes e */
export function stepEstate(e: Estate, now: number, env: StepEnv): StepOut {
  const out: StepOut = { sold: [], started: [], built: [], levy: 0, months: 0 };
  if (!Number.isFinite(now)) return out;
  if (now < e.t) { if (now <= e.t - 12) e.t = now; return out; }
  let t = e.t;
  while (t < now - 1e-9) {
    const t2 = Math.min(now, t + STEP);
    for (const l of e.lots) {
      if (l.st === ST.SOLD && l.after <= t2) { l.st = ST.BUILDING; l.at = l.after; l.after = l.at + within(BUILD_MONTHS, l.seed, 2); out.started.push(l); e.rev++; }
      if (l.st === ST.BUILDING && l.after <= t2) { l.st = ST.BUILT; l.at = l.after; l.after = Infinity; out.built.push(l); e.rev++; }
    }
    const open = e.lots.filter(l => l.st === ST.SALE);
    if (open.length) e.market = Math.min(MARKET_CAP, e.market + sellRate(env.rep, env.demand) * (t2 - t)); else e.market = Math.min(e.market, 1);
    if (open.length && e.market >= 1) {
      const asks = new Map(open.map(l => [l, env.ask(l)])), order = open.slice().sort((p, q) => asks.get(q)! - asks.get(p)! || p.id - q.id);
      for (const l of order) {
        if (e.market < 1) break;
        e.market -= 1; const price = asks.get(l)!;
        l.st = ST.SOLD; l.at = t2; l.price = price; l.after = t2 + within(SOLD_MONTHS, l.seed, 1); e.rev++;
        out.sold.push({ lot: l, price });
      }
    }
    const crossed = Math.floor(t2 + 1e-9) - Math.floor(t + 1e-9);
    if (crossed > 0) { out.levy += housesOf(e) * LEVY * crossed; out.months += crossed; }
    t = t2;
  }
  e.t = now;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// laying lots
// ---------------------------------------------------------------------------------------------------------------------------------------------
/** where lots are laid: the street pieces, and either a drag (from, to: pickFrames) or the whole frontage of the pieces on `side` (+1 or -1; 0 or none:
 *  both sides) */
export interface Along { segs: readonly StreetSeg[]; from?: Pt; to?: Pt; side?: 1 | -1 | 0 }
/** the candidate frames of an Along */
export function framesOf(along: Along): Frame[] {
  if (along.from && along.to) return pickFrames(along.segs, along.from, along.to);
  const sides: (1 | -1)[] = along.side === 1 ? [1] : along.side === -1 ? [-1] : [1, -1];
  return along.segs.flatMap((s, i) => frontageFrames(s, sides, i));
}
/** the result of laying lots: the lots laid, the frames refused with why, and the cost ($) */
export interface PlaceResult { placed: EstateLot[]; refused: { frame: Frame; why: string }[]; cost: number }
/** the frames of an Along that can be laid now (lotWhy against the lots already laid and the ones accepted before them, in street order) and the refusals;
 *  nothing is changed */
export function planLots(e: Estate, along: Along, env: EstateEnv): { ok: Frame[]; refused: { frame: Frame; why: string }[] } {
  const ok: Frame[] = [], refused: { frame: Frame; why: string }[] = [], taken: Pick<EstateLot, 'o' | 'u' | 'n' | 'w' | 'd'>[] = [...e.lots];
  for (const f of framesOf(along)) {
    const why = lotWhy(f, env, taken);
    if (why) refused.push({ frame: f, why }); else { ok.push(f); taken.push(f); }
  }
  return { ok, refused };
}
/** lays the lots of an Along that the rules allow, for sale from game month `now`: each gets the next id and a seed from `seed` and its id. Returns what was
 *  laid, what was refused and why, and the cost (LAY_COST a lot; the caller charges it). This is the call T354's streets use, and the tool's drag and click */
export function placeLots(e: Estate, along: Along, env: EstateEnv, now: number, seed = 0): PlaceResult {
  const { ok, refused } = planLots(e, along, env), placed: EstateLot[] = [];
  // (an estate with no lots has no clock to speak of: its first lot starts it, so the buyers do not come for months that went before the lot was laid)
  if (ok.length && !e.lots.length) { e.t = now; e.market = START_MARKET; }
  for (const f of ok) {
    const id = e.next++;
    const l: EstateLot = { id, o: { x: +f.o.x.toFixed(4), y: +f.o.y.toFixed(4) }, u: { x: +f.u.x.toFixed(5), y: +f.u.y.toFixed(5) }, n: { x: +f.n.x.toFixed(5), y: +f.n.y.toFixed(5) }, w: f.w, d: f.d, st: ST.SALE, at: now, after: Infinity, seed: (Math.imul(seed ^ 0x811c9dc5, 16777619) ^ Math.imul(id, 0x9e3779b1)) >>> 0, price: 0 };
    e.lots.push(l); placed.push(l);
  }
  if (placed.length) e.rev++;
  return { placed, refused, cost: placed.length * LAY_COST };
}
/** takes a lot that is still for sale off the estate (the bulldozer): null when there is no such lot, or it is sold (private land now) */
export function removeLot(e: Estate, id: number): EstateLot | null {
  const i = e.lots.findIndex(l => l.id === id && l.st === ST.SALE); if (i < 0) return null;
  const [l] = e.lots.splice(i, 1); e.rev++; return l!;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// the save
// ---------------------------------------------------------------------------------------------------------------------------------------------
/** a lot as saved: id, the frame (ox, oy, ux, uy, nx, ny, w, d), the stage, the month it began and ends (-1: never), the seed, the price, the member flag */
export type LotTuple = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, 0 | 1];
/** the estate as saved (GolfSave.estate) */
export interface EstateSave { v: 1; next: number; t: number; market: number; lots: LotTuple[] }
const r4 = (v: number): number => +v.toFixed(4);
/** the estate as it is saved (undefined for none: no lots laid) */
export function encodeEstate(e: Estate | null | undefined): EstateSave | undefined {
  if (!e || !e.lots.length) return undefined;
  return {
    v: 1, next: e.next, t: r4(e.t), market: r4(e.market),
    lots: e.lots.map((l): LotTuple => [l.id, r4(l.o.x), r4(l.o.y), +l.u.x.toFixed(5), +l.u.y.toFixed(5), +l.n.x.toFixed(5), +l.n.y.toFixed(5), l.w, l.d, l.st, r4(l.at), Number.isFinite(l.after) ? r4(l.after) : -1, l.seed, l.price, l.member ? 1 : 0]),
  };
}
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** a saved estate, well formed (a bad lot is dropped, ids kept unique, the next id past them all), or null when none was saved */
export function normalizeEstate(raw: unknown): Estate | null {
  const s = raw as Partial<EstateSave> | null | undefined;
  if (!s || typeof s !== 'object' || !Array.isArray(s.lots)) return null;
  const lots: EstateLot[] = [], ids = new Set<number>();
  for (const t of s.lots as unknown[]) {
    if (!Array.isArray(t) || t.length < 14 || !t.slice(0, 14).every(fin)) continue;
    const [id, ox, oy, ux, uy, nx, ny, w, d, st, at0, after, seed, price, member] = t as number[];
    if (ids.has(id!) || id! < 1 || w! <= 0 || d! <= 0 || ![0, 1, 2, 3].includes(st!)) continue;
    // (a frame whose axes are not unit vectors at right angles is dropped: compose would draw nonsense)
    if (Math.abs(Math.hypot(ux!, uy!) - 1) > 0.01 || Math.abs(Math.hypot(nx!, ny!) - 1) > 0.01 || Math.abs(ux! * nx! + uy! * ny!) > 0.01) continue;
    ids.add(id!);
    lots.push({ id: id!, o: { x: ox!, y: oy! }, u: { x: ux!, y: uy! }, n: { x: nx!, y: ny! }, w: w!, d: d!, st: st as Stage, at: at0!, after: after! < 0 ? Infinity : after!, seed: seed! >>> 0, price: Math.max(0, price!), ...(member ? { member: true } : {}) });
  }
  if (!lots.length) return null;
  lots.sort((a, b) => a.id - b.id);
  // (a lot saved mid-stage with no end gets one from its seed, so it still finishes)
  for (const l of lots) {
    if (l.st === ST.SOLD && !Number.isFinite(l.after)) l.after = l.at + within(SOLD_MONTHS, l.seed, 1);
    if (l.st === ST.BUILDING && !Number.isFinite(l.after)) l.after = l.at + within(BUILD_MONTHS, l.seed, 2);
  }
  return { next: Math.max(fin(s.next) ? Math.floor(s.next) : 1, lots[lots.length - 1]!.id + 1), t: fin(s.t) ? s.t : 0, market: fin(s.market) ? Math.min(MARKET_CAP, Math.max(0, s.market)) : START_MARKET, lots, rev: 0 };
}

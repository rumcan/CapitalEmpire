// T269 (#810) part 2: the ground the grounds crew works, read from the course grid once per course (golf/crew.ts schedules the work on it):
//  - each hole's **fairway passes**: one pass along each of T218's stripe bands (course-stripes holeStripeLegs on the hole's line of play, the
//    fairway's look: across the line, so the ride-on mower crosses the fairway band by band), from one edge of the fairway's cells in that band to the
//    other; any cell that plays as fairway counts (T271: a custom grass that plays as fairway holds the fairway surface in the grid);
//  - its **rough lines**: one pass each side, just outside the fairway's edge (the passes' ends set out), tee to green;
//  - its **bunkers**: each sand's cells (a flood of the hole's bunker cells), its middle and its rake strokes across it;
//  - its green's **mowing passes** (the walk-behind, along the approach, a few across the green) and the cart's **parking spot** beside the green.
// Pure TS, no DOM; tiles are 2 m.
import { CELL_T, SURF, type Grid } from '../ext/course-grid';
import { holeStripeLegs, legAt, type StripeLook } from '../course-stripes';
import type { GreenShape } from './daypins';
import type { Pt } from './holes';

/** a pass: from (ax, ay) to (bx, by), tiles; band: its stripe band's index along the hole (the passes run in band order) and leg (its leg of the line) */
export interface Pass { ax: number; ay: number; bx: number; by: number; band: number; leg: number }
/** a sand: its middle and its rake strokes (a zigzag across it, as passes) */
export interface Sand { cx: number; cy: number; strokes: Pass[] }
/** a hole's ground for the crew */
export interface CrewGround { n: number; passes: Pass[]; rough: Pass[]; sands: Sand[]; greenPasses: Pass[]; park: Pt | null }

/** the most passes a green is mown in on screen (the walk-behind's passes stand for many) */
const GREEN_PASSES = 3;
/** a rough pass lies this far out from the fairway's edge (tiles) */
const ROUGH_OUT = 2.5;
/** the most rake strokes across a sand */
const RAKE_STROKES = 4;
/** the cart parks this far off the green's edge (tiles) */
const PARK_OUT = 2.5;

/** every hole's cells of the surfaces the crew works, in one pass over the grid: per hole its fairway cells and its bunker cells (indices) */
export function crewCells(g: Grid): Map<number, { fair: number[]; sand: number[] }> {
  const out = new Map<number, { fair: number[]; sand: number[] }>(), { surf, hole } = g;
  for (let i = 0; i < surf.length; i++) {
    const s = surf[i]!; if (s !== SURF.fairway && s !== SURF.bunker) continue;
    const h = hole[i]!; if (!h) continue;
    let e = out.get(h); if (!e) out.set(h, (e = { fair: [], sand: [] }));
    (s === SURF.fairway ? e.fair : e.sand).push(i);
  }
  return out;
}

/** the centre of cell i (tiles) into o */
function centre(g: Grid, i: number, o: { x: number; y: number }): { x: number; y: number } {
  const cx = i % g.w, cy = (i - cx) / g.w; o.x = g.x0 + (cx + 0.5) * CELL_T; o.y = g.y0 + (cy + 0.5) * CELL_T; return o;
}

/** a hole's fairway passes: its cells binned by stripe band (holeStripeLegs on the line, legAt), and in each band a pass across the band's cells at the
 *  band's middle, from the least to the most of them along the band (the band's own direction: across the line of play for the across look). In band
 *  order along the hole, each the other way from the one before (the mower turns at the edge). None without a line of two points */
export function fairwayPasses(g: Grid, cells: readonly number[], line: ArrayLike<number>, look: StripeLook): Pass[] {
  if (line.length < 4 || !cells.length) return [];
  const legs = holeStripeLegs(line, look), w = Math.max(0.25, look.w), bins = new Map<string, { leg: number; band: number; lo: number; hi: number }>(), c = { x: 0, y: 0 };
  for (const i of cells) {
    centre(g, i, c);
    const leg = legAt(legs, c.x, c.y), m = legs[leg]!.m, band = Math.floor(((c.x - m.ox) * m.ux + (c.y - m.oy) * m.uy) / w);
    const s = (c.x - m.ox) * -m.uy + (c.y - m.oy) * m.ux, k = `${leg}:${band}`, b = bins.get(k);
    if (b) { b.lo = Math.min(b.lo, s); b.hi = Math.max(b.hi, s); } else bins.set(k, { leg, band, lo: s, hi: s });
  }
  const out: Pass[] = [];
  for (const b of [...bins.values()].sort((p, q) => p.band - q.band || p.leg - q.leg)) {
    if (b.hi - b.lo < 1) continue; // (a sliver: no pass)
    const m = legs[b.leg]!.m, t = (b.band + 0.5) * w, ox = m.ox + m.ux * t, oy = m.oy + m.uy * t, nx = -m.uy, ny = m.ux;
    const a = { x: ox + nx * (b.lo + CELL_T / 2), y: oy + ny * (b.lo + CELL_T / 2) }, z = { x: ox + nx * (b.hi - CELL_T / 2), y: oy + ny * (b.hi - CELL_T / 2) };
    const flip = out.length % 2 === 1;
    out.push({ ax: flip ? z.x : a.x, ay: flip ? z.y : a.y, bx: flip ? a.x : z.x, by: flip ? a.y : z.y, band: b.band, leg: b.leg });
  }
  return out;
}

/** a hole's rough passes: down one side of the fairway just outside its edge (each pass's end set out ROUGH_OUT along the pass) from tee to green,
 *  and back up the other, as two polylines of passes (each a segment between two neighbouring passes' ends) */
export function roughPasses(passes: readonly Pass[]): Pass[] {
  if (passes.length < 2) return [];
  const side = (k: 0 | 1): Pt[] => passes.map((p, i) => {
    // (the passes alternate: the even ones run lo to hi, the odd ones hi to lo; side 0 is the lo end)
    const lo = i % 2 === 0 ? { x: p.ax, y: p.ay } : { x: p.bx, y: p.by }, hi = i % 2 === 0 ? { x: p.bx, y: p.by } : { x: p.ax, y: p.ay };
    const e = k === 0 ? lo : hi, o = k === 0 ? hi : lo, L = Math.hypot(e.x - o.x, e.y - o.y) || 1;
    return { x: e.x + (e.x - o.x) / L * ROUGH_OUT, y: e.y + (e.y - o.y) / L * ROUGH_OUT };
  });
  const seg = (pts: Pt[], band: number): Pass[] => pts.slice(1).map((b, i) => ({ ax: pts[i]!.x, ay: pts[i]!.y, bx: b.x, by: b.y, band: band + i, leg: 0 }));
  const a = side(0), b = side(1).reverse();
  return [...seg(a, 0), ...seg(b, a.length)];
}

/** a hole's sands: its bunker cells in floods (4-neighbour), each with its middle and up to RAKE_STROKES strokes across it, zigzagging along its long
 *  side (a sand under 2 tiles across gets one) */
export function sandsOf(g: Grid, cells: readonly number[]): Sand[] {
  const W = g.w, inSet = new Set(cells), seen = new Set<number>(), out: Sand[] = [], c = { x: 0, y: 0 };
  for (const s of cells) {
    if (seen.has(s)) continue;
    const blob: number[] = [s]; seen.add(s);
    for (let q = 0; q < blob.length; q++) {
      const i = blob[q]!, x = i % W;
      for (const k of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (k >= 0 && inSet.has(k) && !seen.has(k)) { seen.add(k); blob.push(k); }
    }
    if (blob.length < 4) continue;
    let mx = 0, my = 0; for (const i of blob) { centre(g, i, c); mx += c.x; my += c.y; }
    mx /= blob.length; my /= blob.length;
    // its long axis (the covariance's main direction)
    let sxx = 0, syy = 0, sxy = 0; for (const i of blob) { centre(g, i, c); const dx = c.x - mx, dy = c.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th), vx = -uy, vy = ux;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const i of blob) { centre(g, i, c); const a = (c.x - mx) * ux + (c.y - my) * uy, b = (c.x - mx) * vx + (c.y - my) * vy; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const n = Math.max(1, Math.min(RAKE_STROKES, Math.round((a1 - a0) / 1.5))), strokes: Pass[] = [];
    for (let k = 0; k < n; k++) {
      const a = n === 1 ? (a0 + a1) / 2 : a0 + 0.5 + (a1 - a0 - 1) * (k / (n - 1)), lo = b0 * 0.7, hi = b1 * 0.7, f = k % 2 === 1;
      strokes.push({ ax: mx + ux * a + vx * (f ? hi : lo), ay: my + uy * a + vy * (f ? hi : lo), bx: mx + ux * a + vx * (f ? lo : hi), by: my + uy * a + vy * (f ? lo : hi), band: k, leg: 0 });
    }
    out.push({ cx: mx, cy: my, strokes });
  }
  return out;
}

/** the green's walk-behind passes: GREEN_PASSES lines along the approach (gr.ux, gr.uy), spread across the green, each from the green's front to its
 *  back along that line (its cells within half a spacing of it), turning at the end */
export function greenPasses(gr: GreenShape | null): Pass[] {
  if (!gr || !gr.edge.length) return [];
  const N = gr.edge.length, lx = gr.uy, ly = -gr.ux; let l0 = Infinity, l1 = -Infinity;
  for (let q = 0; q < N; q++) { const l = (gr.pts[2 * q]! - gr.cx) * lx + (gr.pts[2 * q + 1]! - gr.cy) * ly; l0 = Math.min(l0, l); l1 = Math.max(l1, l); }
  const out: Pass[] = [], gap = (l1 - l0) / GREEN_PASSES;
  for (let k = 0; k < GREEN_PASSES; k++) {
    const l = l0 + gap * (k + 0.5); let d0 = Infinity, d1 = -Infinity;
    for (let q = 0; q < N; q++) {
      const dx = gr.pts[2 * q]! - gr.cx, dy = gr.pts[2 * q + 1]! - gr.cy; if (Math.abs(dx * lx + dy * ly - l) > gap / 2) continue;
      const d = dx * gr.ux + dy * gr.uy; d0 = Math.min(d0, d); d1 = Math.max(d1, d);
    }
    if (!(d1 - d0 > 1)) continue;
    const f = out.length % 2 === 1, at = (d: number) => ({ x: gr.cx + lx * l + gr.ux * d, y: gr.cy + ly * l + gr.uy * d });
    const a = at(f ? d1 - 0.5 : d0 + 0.5), b = at(f ? d0 + 0.5 : d1 - 0.5);
    out.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, band: k, leg: 0 });
  }
  return out;
}

/** where the greenkeeper's cart parks by green gr: PARK_OUT off its edge on the side toward `toward` (the next hole's tee; null: off its back) */
export function parkSpot(gr: GreenShape | null, toward: Pt | null): Pt | null {
  if (!gr || !gr.edge.length) return null;
  let ux = toward ? toward.x - gr.cx : gr.ux, uy = toward ? toward.y - gr.cy : gr.uy; const L = Math.hypot(ux, uy);
  if (L < 1e-6) { ux = gr.ux; uy = gr.uy; } else { ux /= L; uy /= L; }
  let r = 0; for (let q = 0; q < gr.edge.length; q++) r = Math.max(r, (gr.pts[2 * q]! - gr.cx) * ux + (gr.pts[2 * q + 1]! - gr.cy) * uy);
  return { x: gr.cx + ux * (r + PARK_OUT), y: gr.cy + uy * (r + PARK_OUT) };
}

/** hole n's crew ground from its cells (crewCells), its line of play (flat tiles: the placed pin's, so the passes follow T218's bands), the fairways'
 *  stripe look, its green and the next hole's tee */
export function crewGround(g: Grid, n: number, cells: { fair: number[]; sand: number[] } | undefined, line: ArrayLike<number> | undefined, look: StripeLook, green: GreenShape | null, nextTee: Pt | null): CrewGround {
  const passes = cells && line ? fairwayPasses(g, cells.fair, line, look) : [];
  return { n, passes, rough: roughPasses(passes), sands: cells ? sandsOf(g, cells.sand) : [], greenPasses: greenPasses(green), park: parkSpot(green, nextTee) };
}

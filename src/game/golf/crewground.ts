// T269 (#810) part 2: the ground the grounds crew works, read from the course grid once per course (golf/crew.ts schedules the work on it):
//  - each hole's **fairway passes**: one pass along each of the fairway's stripe bands (course-stripes holeStripeLegs on the hole's line of play in
//    the look the ground draws: T227's finish lays them along the line, so the ride-on mower runs the fairway's length band by band, side to side;
//    T218's own lie across it, crossed band by band along the hole), from one end of the fairway's cells in that band to the other, cut in segments
//    the mower can stop at; any cell that plays as fairway counts (T271: a custom grass that plays as fairway holds the fairway surface in the grid);
//  - its **rough lines**: one pass each side, just outside the fairway's edge, tee to green;
//  - its **bunkers**: each sand's cells (a flood of the hole's bunker cells), its middle and its rake strokes across it;
//  - its green's **mowing passes** (the walk-behind, along the approach, a few across the green) and the cart's **parking spot** beside the green.
// Pure TS, no DOM; tiles are 2 m.
import { CELL_T, SURF, type Grid } from '../ext/course-grid';
import { holeStripeLegs, legAt, type StripeLook } from '../course-stripes';
import type { GreenShape } from './daypins';
import type { Pt } from './holes';

/** a pass: from (ax, ay) to (bx, by), tiles; band: its stripe band's index (the passes run in band order) and leg (its leg of the line); a fairway pass's
 *  way off the fairway from its start (sx, sy: where the mower pulls off to let a group by; 0 0 for the others) and whether it ends its band (last:
 *  a long pass is cut in segments so the mower can stop at any of them) */
export interface Pass { ax: number; ay: number; bx: number; by: number; band: number; leg: number; sx?: number; sy?: number; last?: boolean }
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

/** a fairway pass is cut in segments of at most this many tiles (the mower can stop for a group at each) */
const SEG_T = 14;
/** a band's whole pass, before it is cut in segments: its pass, its band axis (unit) and how far its middle lies from the fairway's edges along it */
interface BandPass extends Pass { axx: number; axy: number; lo: number; hi: number }

/** a hole's fairway passes, whole: its cells binned by stripe band (holeStripeLegs on the line in the fairways' look, legAt), and in each band a pass
 *  at the band's middle along the band (across the band axis), from the least to the most of its cells that way. In the mower's order: across the
 *  line (T218's look) band by band along the hole; along it (T227's finish) leg by leg, side to side; each the other way from the one before (the
 *  mower turns at the edge). With each, how far the band's middle is from the leg's outermost bands (lo, hi; the way out to the rough). None without
 *  a line of two points */
export function bandPasses(g: Grid, cells: readonly number[], line: ArrayLike<number>, look: StripeLook): BandPass[] {
  if (line.length < 4 || !cells.length) return [];
  const legs = holeStripeLegs(line, look), w = Math.max(0.25, look.w), bins = new Map<string, { leg: number; band: number; lo: number; hi: number }>(), c = { x: 0, y: 0 };
  const range = new Map<number, [number, number]>(); // (each leg's lowest and highest band)
  for (const i of cells) {
    centre(g, i, c);
    const leg = legAt(legs, c.x, c.y), m = legs[leg]!.m, band = Math.floor(((c.x - m.ox) * m.ux + (c.y - m.oy) * m.uy) / w);
    const s = (c.x - m.ox) * -m.uy + (c.y - m.oy) * m.ux, k = `${leg}:${band}`, b = bins.get(k);
    if (b) { b.lo = Math.min(b.lo, s); b.hi = Math.max(b.hi, s); } else bins.set(k, { leg, band, lo: s, hi: s });
    const r = range.get(leg); if (!r) range.set(leg, [band, band]); else { r[0] = Math.min(r[0], band); r[1] = Math.max(r[1], band); }
  }
  const out: BandPass[] = [], order = look.across ? (p: { band: number; leg: number }, q: { band: number; leg: number }) => p.band - q.band || p.leg - q.leg : (p: { band: number; leg: number }, q: { band: number; leg: number }) => p.leg - q.leg || p.band - q.band;
  for (const b of [...bins.values()].sort(order)) {
    if (b.hi - b.lo < 1) continue; // (a sliver: no pass)
    const m = legs[b.leg]!.m, t = (b.band + 0.5) * w, ox = m.ox + m.ux * t, oy = m.oy + m.uy * t, nx = -m.uy, ny = m.ux, r = range.get(b.leg)!;
    const a = { x: ox + nx * (b.lo + CELL_T / 2), y: oy + ny * (b.lo + CELL_T / 2) }, z = { x: ox + nx * (b.hi - CELL_T / 2), y: oy + ny * (b.hi - CELL_T / 2) };
    const flip = out.length % 2 === 1;
    out.push({ ax: flip ? z.x : a.x, ay: flip ? z.y : a.y, bx: flip ? a.x : z.x, by: flip ? a.y : z.y, band: b.band, leg: b.leg, axx: m.ux, axy: m.uy, lo: (b.band - r[0] + 0.5) * w, hi: (r[1] - b.band + 0.5) * w });
  }
  return out;
}

/** the passes cut in segments of at most SEG_T, each with its way off the fairway from its start: a pass along the line (T227's bands, across: false)
 *  goes out along the band axis past the nearer outermost band and `aside` beyond (the mower pulls off sideways); a pass across the line (T218's)
 *  goes back along itself past its nearer end */
export function segmentPasses(full: readonly BandPass[], across: boolean, aside = 2): Pass[] {
  const out: Pass[] = [];
  for (const p of full) {
    const L = Math.hypot(p.bx - p.ax, p.by - p.ay), n = Math.max(1, Math.ceil(L / SEG_T)), ux = L > 0 ? (p.bx - p.ax) / L : 0, uy = L > 0 ? (p.by - p.ay) / L : 0;
    for (let k = 0; k < n; k++) {
      const s0 = L * k / n, s1 = L * (k + 1) / n, ax = p.ax + ux * s0, ay = p.ay + uy * s0;
      let sx: number, sy: number;
      if (!across) { const lo = p.lo <= p.hi, d = (lo ? p.lo : p.hi) + aside; sx = (lo ? -p.axx : p.axx) * d; sy = (lo ? -p.axy : p.axy) * d; }
      else { const back = s0 < L - s0, d = (back ? s0 : L - s0) + aside; sx = (back ? -ux : ux) * d; sy = (back ? -uy : uy) * d; }
      out.push({ ax, ay, bx: p.ax + ux * s1, by: p.ay + uy * s1, band: p.band, leg: p.leg, sx, sy, last: k === n - 1 });
    }
  }
  return out;
}

/** a hole's fairway passes in segments (bandPasses, segmentPasses) */
export function fairwayPasses(g: Grid, cells: readonly number[], line: ArrayLike<number>, look: StripeLook): Pass[] { return segmentPasses(bandPasses(g, cells, line, look), look.across); }

/** a hole's rough passes from its whole fairway passes: one pass down each side of the fairway just outside its edge, ROUGH_OUT out, from the tee's
 *  end to the green's, and back up the other side. Across the line (T218's bands) the sides are the passes' ends; along it (T227's) each leg's
 *  outermost passes set out along the band axis. In segments of at most SEG_T, waited in place (no way off: the rough is off the fairway) */
export function roughPasses(full: readonly BandPass[], across: boolean, tee: Pt | null): Pass[] {
  if (full.length < 2) return [];
  const sides: [Pt[], Pt[]] = [[], []];
  if (across) {
    full.forEach((p, i) => {
      // (the passes alternate: the even ones run lo to hi, the odd ones hi to lo; side 0 is the lo end)
      const lo = i % 2 === 0 ? { x: p.ax, y: p.ay } : { x: p.bx, y: p.by }, hi = i % 2 === 0 ? { x: p.bx, y: p.by } : { x: p.ax, y: p.ay };
      for (const k of [0, 1] as const) { const e = k === 0 ? lo : hi, o = k === 0 ? hi : lo, L = Math.hypot(e.x - o.x, e.y - o.y) || 1; sides[k].push({ x: e.x + (e.x - o.x) / L * ROUGH_OUT, y: e.y + (e.y - o.y) / L * ROUGH_OUT }); }
    });
  } else {
    const legs = [...new Set(full.map(p => p.leg))].sort((a, b) => a - b);
    for (const leg of legs) {
      const ps = full.filter(p => p.leg === leg); if (!ps.length) continue;
      const low = ps.reduce((a, b) => (b.band < a.band ? b : a)), high = ps.reduce((a, b) => (b.band > a.band ? b : a));
      for (const [k, p, sg, d] of [[0, low, -1, low.lo], [1, high, 1, high.hi]] as const) {
        const ox = p.axx * sg * (d + ROUGH_OUT), oy = p.axy * sg * (d + ROUGH_OUT), A = { x: p.ax + ox, y: p.ay + oy }, B = { x: p.bx + ox, y: p.by + oy };
        const tf = tee && Math.hypot(B.x - tee.x, B.y - tee.y) < Math.hypot(A.x - tee.x, A.y - tee.y); // (each side runs from the tee's end)
        sides[k].push(...(tf ? [B, A] : [A, B]));
      }
    }
  }
  // (down the one side, then up the other: the mower drives round the green's end between them, mowing nothing)
  const out: Pass[] = [];
  for (const pts of [sides[0], sides[1].reverse()]) for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / SEG_T));
    for (let k = 0; k < n; k++) out.push({ ax: a.x + (b.x - a.x) * k / n, ay: a.y + (b.y - a.y) * k / n, bx: a.x + (b.x - a.x) * (k + 1) / n, by: a.y + (b.y - a.y) * (k + 1) / n, band: out.length, leg: 0, sx: 0, sy: 0, last: k === n - 1 });
  }
  return out;
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
  const full = cells && line ? bandPasses(g, cells.fair, line, look) : [], tee = line && line.length >= 2 ? { x: line[0]!, y: line[1]! } : null;
  return { n, passes: segmentPasses(full, look.across), rough: roughPasses(full, look.across, tee), sands: cells ? sandsOf(g, cells.sand) : [], greenPasses: greenPasses(green), park: parkSpot(green, nextTee) };
}

/** T204 (issue #534, the owner 2026-10-27: "a rugged edge of grass that spills over to the shorter grass"): where tall grass meets a course
 * chunk's flat short turf (the fairway and its first cut, rugged-edges SPILL_SURFACES), the runs of that turf's edges along which the renderer
 * lays the tall grass's ragged spill. Each edge point is read as the walls read it (LayerStack, the droplet fields of the very cells the
 * outlines were contoured from): the turf (or its platform's own surface) on top just inside, the rough, the fescue or the map grass on top
 * just outside (TALL_CODES; a bunker's lip, a pond's bank, a tee's or green's collar or anything else stops a run). Every value depends only
 * on the point and the global grid, so two chunks read a shared border alike. Pure TypeScript, no DOM, deterministic. Units: tiles of 2 m. */
import { CELL_T, SURF, type Grid } from '../course-grid';
import { LayerStack, collarOnTop, layerCode } from './index';
import type { BlobStyle } from '../course-blobs';
import { BLOB_STYLE } from '../course-blobs';

/** how far from an edge point its inside and outside are read, tiles: the first reading on the right side counts (an edge the relax or the
 *  simplify moved a little off its droplet's iso-line still reads true), as the walls read them */
const PROBE = [0.07, 0.16, 0.3];

/** the surfaces whose outer edges take the spill: flat short turf, the fairway and its first cut (a raised tee or green keeps its bank and
 *  T196's soft joint; a bunker's lip and a pond's bank keep their own edges) */
export const SPILL_SURFACES: readonly number[] = [SURF.fairway];
/** the layer codes counted as tall grass outside them: the map grass (0), the rough's and the fescue's fills */
export const TALL_CODES: readonly number[] = [0, layerCode(SURF.rough, false), layerCode(SURF.longGrass, false), layerCode(SURF.fescue, false)];

/** one spill run: its points (flat x y, tiles) in order with the tall side on each piece's (dy, -dx) side, and o, the code of the tall layer on
 *  top outside it (0: the map grass) */
export interface SpillRun { p: number[]; o: number }

/** the spill runs of layer `code`'s edges (polylines as the renderer draws them; a closed one repeats its first point), each edge read every
 *  `step` tiles and cut halfway between two readings that differ (another tall layer, or none); tall: the layer codes that count as tall
 *  grass outside */
export function spillRuns(g: Grid, st: LayerStack, code: number, edges: readonly ArrayLike<number>[], tall: readonly number[], styles: readonly BlobStyle[] = BLOB_STYLE, step = 0.35): SpillRun[] {
  return edgeRuns(g, st, code, edges, lo => tall.includes(lo), styles, step);
}
/** the runs of layer `code`'s edges along which the layer on top just outside passes `outside` (spillRuns' walk, for any test), each with o, that
 *  layer's code */
export function edgeRuns(g: Grid, st: LayerStack, code: number, edges: readonly ArrayLike<number>[], outside: (lo: number) => boolean, styles: readonly BlobStyle[] = BLOB_STYLE, step = 0.35): SpillRun[] {
  const out: SpillRun[] = [];
  // a collar on its surface's platform (the first cut): its inside is the band and the surface alike
  const plat = (code & 1) === 1 && collarOnTop(styles[code >> 1]?.collar?.name ?? '');
  const within = (u: number, v: number) => (plat ? st.within(code, u, v) : st.covers(code, u, v));
  const own = (c: number) => c === code || (plat && c === code - 1);
  for (const e of edges) {
    const n = e.length >> 1; if (n < 2) continue;
    // the readings: x, y, the piece's normal (dy, -dx) and what lies there (-1 none; else the tall layer's code), and which way is out
    const xs: number[] = [], ys: number[] = [], os: number[] = [], sg: number[] = [];
    for (let i = 0; i + 1 < n; i++) {
      const ax = e[2 * i]!, ay = e[2 * i + 1]!, dx = e[2 * i + 2]! - ax, dy = e[2 * i + 3]! - ay, len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const nx = dy / len, ny = -dx / len, m = Math.max(1, Math.ceil(len / step)), last = i + 2 === n;
      for (let j = 0; j < m + (last ? 1 : 0); j++) {
        const x = ax + (dx * j) / m, y = ay + (dy * j) / m;
        xs.push(x); ys.push(y);
        const r = read(x, y, nx, ny);
        os.push(r.o); sg.push(r.s);
      }
    }
    /** what lies at (x, y) across a piece of normal (nx, ny): the tall code outside (or -1) and the side (1: out along the normal, -1: against it) */
    function read(x: number, y: number, nx: number, ny: number): { o: number; s: number } {
      const u = (x - g.x0) / CELL_T, v = (y - g.y0) / CELL_T, cx = nx / CELL_T, cy = ny / CELL_T;
      for (const s of [1, -1]) {
        // inside: the first reading against the normal (times s) that is within the layer's outline
        let iu = NaN, iv = NaN;
        for (const d of PROBE) { const a = u - s * d * cx, b = v - s * d * cy; if (within(a, b)) { iu = a; iv = b; break; } }
        if (Number.isNaN(iu)) continue;
        let ou = NaN, ov = NaN;
        for (const d of PROBE) { const a = u + s * d * cx, b = v + s * d * cy; if (!within(a, b)) { ou = a; ov = b; break; } }
        if (Number.isNaN(ou)) continue;
        if (!own(st.top(iu, iv))) return { o: -1, s };
        const lo = st.top(ou, ov);
        return { o: outside(lo) ? lo : -1, s };
      }
      return { o: -1, s: 1 };
    }
    // the runs: readings alike (the same tall layer, the same side out), cut halfway to the next reading that differs
    const N = xs.length;
    for (let i = 0; i < N;) {
      if (os[i]! < 0) { i++; continue; }
      let j = i; while (j + 1 < N && os[j + 1] === os[i] && sg[j + 1] === sg[i]) j++;
      const p: number[] = [];
      if (i > 0) p.push((xs[i - 1]! + xs[i]!) / 2, (ys[i - 1]! + ys[i]!) / 2);
      for (let k = i; k <= j; k++) p.push(xs[k]!, ys[k]!);
      if (j + 1 < N) p.push((xs[j]! + xs[j + 1]!) / 2, (ys[j]! + ys[j + 1]!) / 2);
      if (p.length >= 4) {
        // the tall side on (dy, -dx): a run read the other way round is turned
        if (sg[i]! < 0) { const q: number[] = []; for (let k = p.length - 2; k >= 0; k -= 2) q.push(p[k]!, p[k + 1]!); out.push({ p: q, o: os[i]! }); }
        else out.push({ p, o: os[i]! });
      }
      i = j + 1;
    }
  }
  return out;
}

// ---- T285 (#869; the owner, 2026-10-31: "a length setting on all grass and the longer the grass is the more shadow it spills from right to
// left onto the shorter grass next to it. if the grass is both the same length they dont cast any shadow. maybe a grass length 1 - 5 setting.
// where 1 is green grass and 5 is fescue") ----

/** each surface's grass length by surface id (1 the green's cut .. 5 the fescue), its Length slider's start; undefined: not grass (water,
 *  bunker, waste). The map grass round the course (id 0) stands as tall as the long grass */
export const DEFAULT_LENGTH: readonly (number | undefined)[] = [4, 3, 5, undefined, 2, 1, undefined, undefined, 1, 4];
/** a collar band's grass length by its name: the first cut a step above the fairway, the fringe a step above the green; the lip and the bank
 *  are no grass of their own */
export const BAND_LENGTH: Readonly<Record<string, number>> = { 'first-cut': 3, fringe: 2 };
/** the grass length of the layer drawn with `code` (a fill 2 s: the Length set for surface s, else its default; a collar 2 s + 1: its band's;
 *  0 the map grass), or undefined where it is not grass */
export function lengthOfCode(code: number, lengths: readonly (number | undefined)[] | undefined, styles: readonly BlobStyle[] = BLOB_STYLE, base?: readonly (number | undefined)[]): number | undefined {
  if (code === 0) return lengths?.[0] ?? DEFAULT_LENGTH[0];
  const s = code >> 1;
  if (code & 1) { const name = styles[s]?.collar?.name; return name ? BAND_LENGTH[name] : undefined; }
  return lengths?.[s] ?? DEFAULT_LENGTH[base?.[s] ?? s];
}
/** one shade run: its points (flat x y, tiles) with the longer grass on each piece's (dy, -dx) side, and d, how much longer it is (1..4) */
export interface ShadeRun { p: number[]; d: number }
/** the runs of a grass layer's edges where a longer grass lies just outside it (its shadow falls on this layer there, where that grass is on the
 *  sun's side: the renderer's part), each with the length difference */
export function shadeRuns(g: Grid, st: LayerStack, code: number, edges: readonly ArrayLike<number>[], lengthOf: (code: number) => number | undefined, styles: readonly BlobStyle[] = BLOB_STYLE): ShadeRun[] {
  const own = lengthOf(code); if (own === undefined) return [];
  return edgeRuns(g, st, code, edges, lo => (lengthOf(lo) ?? -1) > own, styles).map(r => ({ p: r.p, d: lengthOf(r.o)! - own }));
}

// A map-data course spec laid into the course grid (T340, #967): the spec's areas, in paint order, as surface and hole on the grid's 1 m cells, and its
// markers (tee sets, pins, aim points) moved to the land's place on the map. T362 (#1017): the boundary's land is natural fescue (or, in a desert game, the land's
// own desert ground, left unpainted), and a band of rough, from the spec's `roughBand` widths, goes round every fairway, green and tee. Pure TypeScript, no DOM,
// deterministic.
import { CELL_T, SURF, type Grid } from '../../ext/course-grid';
import { TILE_M, type AimPoint, type Pin, type TeeMark } from '../types';
import { OSM_ROUGH_BAND_M, type OsmCourseSpec, type RoughBand, type SpecSurface } from './types';

/** the grid surface id each spec surface paints ('wild' is the natural ground: fescue, or none in a desert game, see PaintOptions) */
const SURF_OF: Record<SpecSurface, number> = { wild: SURF.fescue, rough: SURF.rough, fairway: SURF.fairway, bunker: SURF.bunker, water: SURF.water, tee: SURF.tee, green: SURF.green };
/** a grid cell's side, m (a cell is half a tile: 1 m) */
const CELL_M = CELL_T * TILE_M;

/** how a spec is laid on a grid (T362) */
export interface PaintOptions {
  /** the game is a desert game (the engine's desertTheme): the course's wild land is not painted fescue but stays the land's own ground, which the theme draws as desert sand and
   *  dirt (the golf surfaces are never re-skinned by the theme). The rough band, fairways, tees and greens are painted as in any game */
  desert?: boolean;
  /** T340's look, for the dev switch's before and after (?rough=old on the dev server): the whole boundary painted rough, and no band of rough round the fairways, greens and tees */
  legacy?: boolean;
}

/** the cells of g whose centres lie in the spec's frame at (ox, oy): inclusive cell ranges [cx0, cx1] x [cy0, cy1], clipped to g (empty when the frame misses g) */
interface Win { cx0: number; cx1: number; cy0: number; cy1: number }
const frameWin = (g: Grid, spec: Pick<OsmCourseSpec, 'w' | 'h'>, ox: number, oy: number): Win => ({
  cx0: Math.max(0, Math.ceil((ox - g.x0) / CELL_T - 0.5)), cx1: Math.min(g.w - 1, Math.ceil((ox + spec.w - g.x0) / CELL_T - 0.5) - 1),
  cy0: Math.max(0, Math.ceil((oy - g.y0) / CELL_T - 0.5)), cy1: Math.min(g.h - 1, Math.ceil((oy + spec.h - g.y0) / CELL_T - 0.5) - 1),
});

/** fills every cell of g whose centre lies inside the rings (flat x, y lists in tiles of the spec's frame, offset by (ox, oy) onto the grid's; the
 *  even-odd rule over all the rings together, so an inner ring is a hole), calling put(i) for each cell. Returns how many cells it visited */
function fillRings(g: Grid, rings: readonly (readonly number[])[], ox: number, oy: number, put: (i: number) => void, win?: Win): number {
  let n = 0, minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  const ex0: number[] = [], ey0: number[] = [], ex1: number[] = [], ey1: number[] = [];
  for (const r of rings) {
    const m = r.length >> 1;
    if (m < 3) continue;
    for (let i = 0, j = m - 1; i < m; j = i++) {
      const x0 = r[2 * j]! + ox, y0 = r[2 * j + 1]! + oy, x1 = r[2 * i]! + ox, y1 = r[2 * i + 1]! + oy;
      ex0.push(x0); ey0.push(y0); ex1.push(x1); ey1.push(y1);
      if (y0 < minY) minY = y0; if (y0 > maxY) maxY = y0; if (x0 < minX) minX = x0; if (x0 > maxX) maxX = x0;
    }
  }
  if (!ex0.length || maxX < g.x0 || minX > g.x0 + g.w * CELL_T) return 0;
  const cy0 = Math.max(win?.cy0 ?? 0, Math.floor((minY - g.y0) / CELL_T) - 1), cy1 = Math.min(win?.cy1 ?? g.h - 1, Math.ceil((maxY - g.y0) / CELL_T) + 1);
  const xs: number[] = [];
  for (let cy = cy0; cy <= cy1; cy++) {
    const yc = g.y0 + (cy + 0.5) * CELL_T;
    xs.length = 0;
    for (let k = 0; k < ex0.length; k++) {
      const y0 = ey0[k]!, y1 = ey1[k]!;
      if ((y0 > yc) !== (y1 > yc)) xs.push(ex0[k]! + ((yc - y0) * (ex1[k]! - ex0[k]!)) / (y1 - y0));
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let e = 0; e + 1 < xs.length; e += 2) {
      // the cells whose centre x lies in [xs[e], xs[e+1])
      const a = Math.max(win?.cx0 ?? 0, Math.ceil((xs[e]! - g.x0) / CELL_T - 0.5)), b = Math.min(win?.cx1 ?? g.w - 1, Math.ceil((xs[e + 1]! - g.x0) / CELL_T - 0.5) - 1);
      for (let cx = a; cx <= b; cx++) { put(cy * g.w + cx); n++; }
    }
  }
  return n;
}

/** the cells within `r` cells of a cell, the cells taken as squares (the distance from the one to the other's nearest point is at most r): the half width of that disc of squares at each
 *  row offset 0..R (R the farthest row, floor(r + 0.5)). Along a straight edge the band is r cells wide, and round a corner it is the true offset arc of the corner, not a staircase */
function discHalf(r: number): Int32Array {
  const R = Math.floor(r + 0.5 + 1e-9), out = new Int32Array(R + 1);
  for (let dy = 0; dy <= R; dy++) { const ey = Math.max(0, dy - 0.5); out[dy] = ey > r ? -1 : Math.floor(Math.sqrt(r * r - ey * ey) + 0.5 + 1e-9); }
  return out;
}

/** T362: the band of rough round every fairway, tee and green: each cell of the natural ground (none, or the wild fescue) within the surface's width of a fairway, tee or green
 *  cell (the cells as squares, so the band is its width measured from the surface's edge, and round at the corners) becomes rough. Only the natural ground changes: a bunker, a pond, a
 *  mapped rough area or another surface keeps what it is. Done after every area is laid, on the surfaces as they stand, so a fairway a bunker cut into still has its band
 *  where it is open. Only the cells of the window (the spec's land). Returns the cells turned rough */
function layBand(g: Grid, band: Readonly<RoughBand>, win: Win): number {
  const { surf, w, h } = g, r: number[] = [];
  r[SURF.fairway] = band.fairway / CELL_M; r[SURF.tee] = band.tee / CELL_M; r[SURF.green] = band.green / CELL_M;
  if (!(r[SURF.fairway]! > 0 || r[SURF.tee]! > 0 || r[SURF.green]! > 0)) return 0;
  const discs = new Map<number, Int32Array>();
  let n = 0;
  for (let cy = win.cy0; cy <= win.cy1; cy++) for (let cx = win.cx0; cx <= win.cx1; cx++) {
    const i = cy * w + cx, s = surf[i]!, rs = r[s];
    if (!rs || rs <= 0) continue;
    // only the cells on the surface's edge (a neighbour of another surface, or off the grid) can be the nearest to a cell outside it
    if (cx > 0 && cy > 0 && cx < w - 1 && cy < h - 1 && surf[i - 1] === s && surf[i + 1] === s && surf[i - w] === s && surf[i + w] === s) continue;
    let half = discs.get(rs);
    if (!half) { half = discHalf(rs); discs.set(rs, half); }
    const R = half.length - 1;
    for (let dy = -R; dy <= R; dy++) {
      const y = cy + dy, hx = half[dy < 0 ? -dy : dy]!; if (y < win.cy0 || y > win.cy1 || hx < 0) continue;
      const x0 = Math.max(win.cx0, cx - hx), x1 = Math.min(win.cx1, cx + hx), row = y * w;
      for (let x = x0; x <= x1; x++) { const c = surf[row + x]!; if (c === SURF.none || c === SURF.fescue) { surf[row + x] = SURF.rough; n++; } }
    }
  }
  return n;
}

/** lays the spec's areas into grid g, in their order (wild land, mapped rough, fairway, bunker, water, tee, green: a later one over an earlier one). (ox, oy): where the
 *  spec's frame (its north-west corner) lies on the grid's frame, tiles. Cells outside g are skipped. A made-up fairway band (clip) only lays over the course's own
 *  land (the wild land and the mapped rough, whichever the game paints it as); water leaves greens and tees alone. The planting month stays 0 (established): the
 *  course is not growing in.
 *
 *  T362 (#1017): the wild land (the boundary) is the course's natural ground, kept inside the spec's frame: natural fescue (SURF.fescue), or, in a desert game
 *  (opt.desert), left unpainted so the land's own desert ground shows. Once every area is laid, the band of rough goes round each fairway, tee and green (layBand, from
 *  the spec's roughBand widths). opt.legacy paints the old look: the boundary rough, no band. Returns the cells laid per surface (the band's are in `rough`) */
export function paintSpec(g: Grid, spec: OsmCourseSpec, ox: number, oy: number, opt: PaintOptions = {}): Record<SpecSurface, number> {
  const out: Record<SpecSurface, number> = { wild: 0, rough: 0, fairway: 0, bunker: 0, water: 0, tee: 0, green: 0 };
  const { surf, hole } = g, win = frameWin(g, spec, ox, oy);
  const wild = opt.legacy ? SURF.rough : opt.desert ? SURF.none : SURF.fescue;
  // the cells of the course's own land (the wild land and the mapped rough), for the made-up fairway bands: in a desert game the wild land is not painted, so the surface alone does not say
  const inside = spec.areas.some(a => a.clip) ? new Uint8Array(g.w * g.h) : null;
  for (const a of spec.areas) {
    const s = SURF_OF[a.surf], h = a.hole & 255;
    const put = a.clip
      ? (i: number) => { const c = surf[i]!; if (inside![i] && (c === SURF.rough || c === SURF.fescue || c === SURF.none)) { surf[i] = s; hole[i] = h; out[a.surf]++; } }
      : a.surf === 'wild'
        ? (i: number) => { if (wild !== SURF.none) { surf[i] = wild; hole[i] = h; } if (inside) inside[i] = 1; out.wild++; }
        : a.surf === 'water'
          ? (i: number) => { const c = surf[i]; if (c !== SURF.green && c !== SURF.tee) { surf[i] = s; hole[i] = h; out.water++; } }
          : a.surf === 'rough' && inside
            ? (i: number) => { surf[i] = s; hole[i] = h; inside[i] = 1; out.rough++; }
            : (i: number) => { surf[i] = s; hole[i] = h; out[a.surf]++; };
    fillRings(g, a.rings, ox, oy, put, a.surf === 'wild' ? win : undefined);
  }
  if (!opt.legacy) out.rough += layBand(g, spec.roughBand ?? OSM_ROUGH_BAND_M, win);
  g.rev++;
  return out;
}

/** the spec's tee markers, pins and aim points on the map: its local tiles moved by (ox, oy) */
export function specMarkers(spec: OsmCourseSpec, ox: number, oy: number): { tees: TeeMark[]; pins: Pin[]; aims: AimPoint[] } {
  const tees: TeeMark[] = [], pins: Pin[] = [], aims: AimPoint[] = [];
  for (const h of spec.holes) {
    for (const t of h.tees) tees.push({ hole: h.n, kind: t.kind, x: t.x + ox, y: t.y + oy });
    pins.push({ hole: h.n, x: h.pin.x + ox, y: h.pin.y + oy });
    h.aims.forEach((a, k) => aims.push({ hole: h.n, x: a.x + ox, y: a.y + oy, order: k + 1 }));
  }
  return { tees, pins, aims };
}

/** the surface id of the cell under tile (x, y) of g (0, none, off the grid too) */
export function surfAtTile(g: Grid, x: number, y: number): number {
  const cx = Math.floor((x - g.x0) / CELL_T), cy = Math.floor((y - g.y0) / CELL_T);
  return cx >= 0 && cy >= 0 && cx < g.w && cy < g.h ? g.surf[cy * g.w + cx]! : 0;
}

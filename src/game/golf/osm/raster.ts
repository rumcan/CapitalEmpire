// A map-data course spec laid into the course grid (T340, #967): the spec's areas, in paint order, as surface and hole on the grid's 1 m cells, and its
// markers (tee sets, pins, aim points) moved to the land's place on the map. Pure TypeScript, no DOM, deterministic.
import { CELL_T, SURF, type Grid } from '../../ext/course-grid';
import type { AimPoint, Pin, TeeMark } from '../types';
import type { OsmCourseSpec, SpecSurface } from './types';
import { roughBand } from './band';

/** the grid surface id each spec surface paints */
const SURF_OF: Record<SpecSurface, number> = { rough: SURF.rough, fairway: SURF.fairway, bunker: SURF.bunker, water: SURF.water, tee: SURF.tee, green: SURF.green };

/** fills every cell of g whose centre lies inside the rings (flat x, y lists in tiles of the spec's frame, offset by (ox, oy) onto the grid's; the
 *  even-odd rule over all the rings together, so an inner ring is a hole), calling put(i) for each cell. Returns how many cells it visited */
function fillRings(g: Grid, rings: readonly (readonly number[])[], ox: number, oy: number, put: (i: number) => void): number {
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
  const cy0 = Math.max(0, Math.floor((minY - g.y0) / CELL_T) - 1), cy1 = Math.min(g.h - 1, Math.ceil((maxY - g.y0) / CELL_T) + 1);
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
      const a = Math.max(0, Math.ceil((xs[e]! - g.x0) / CELL_T - 0.5)), b = Math.min(g.w - 1, Math.ceil((xs[e + 1]! - g.x0) / CELL_T - 0.5) - 1);
      for (let cx = a; cx <= b; cx++) { put(cy * g.w + cx); n++; }
    }
  }
  return n;
}

/** lays the spec's areas into grid g, in their order (rough, fairway, bunker, water, tee, green: a later one over an earlier one). (ox, oy): where the
 *  spec's frame (its north-west corner) lies on the grid's frame, tiles. Cells outside g are skipped. A made-up fairway band (clip) only lays over
 *  rough; water leaves greens and tees alone. T445: then the rough is cut back to a band beside the fairways, tees, greens and hole lines (band.ts), long
 *  grass in its outer metres. The planting month stays 0 (established): the course is not growing in. Returns the cells laid per
 *  surface */
export function paintSpec(g: Grid, spec: OsmCourseSpec, ox: number, oy: number): Record<SpecSurface, number> {
  const out: Record<SpecSurface, number> = { rough: 0, fairway: 0, bunker: 0, water: 0, tee: 0, green: 0 };
  const { surf, hole } = g;
  for (const a of spec.areas) {
    const s = SURF_OF[a.surf], h = a.hole & 255;
    const put = a.clip
      ? (i: number) => { if (surf[i] === SURF.rough) { surf[i] = s; hole[i] = h; out[a.surf]++; } }
      : a.surf === 'water'
        ? (i: number) => { const c = surf[i]; if (c !== SURF.green && c !== SURF.tee) { surf[i] = s; hole[i] = h; out.water++; } }
        : (i: number) => { surf[i] = s; hole[i] = h; out[a.surf]++; };
    fillRings(g, a.rings, ox, oy, put);
  }
  // T445: the rough only as a band beside the play (band.ts): long grass in its outer metres, the land's own ground beyond
  const band = roughBand(g, spec, ox, oy); if (band.rough >= 0) out.rough = band.rough;
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

// T377 (#1033): the walk field of a course (golf/walkfield.ts) read from what the engine knows: the course grid's surfaces, the water that is the map's
// (rivers, creeks, ponds), the ways (cart paths, drives, streets), the tee markers and the holes' lines of play. Pure TS, no DOM, no engine: the engine hands
// in the lookups. One tile a cell.
import type { Pt } from '../network';
import { G, makeField, type Ground, type WalkField } from './walkfield';

/** the course grid's surface ids (ext/course-grid SURF), as the ground reads them */
const S = { none: 0, rough: 1, fescue: 2, water: 3, fairway: 4, tee: 5, bunker: 6, waste: 7, green: 8, longGrass: 9 } as const;
/** a way (a cart path, a drive, a street): its centre line (tiles), its half width and whether it is a cart's way (a cart path or a course drive) */
export interface Way { ax: number; ay: number; bx: number; by: number; hw: number; cart: boolean; /** a bridge: laid over water too */ bridge?: boolean }
/** a hole's tee and where it aims (tiles) */
export interface HoleLine { tee: Pt; aim: Pt }
/** what the field is read from */
export interface GroundSources {
  /** the course grid's surface id at a tile point (-1: off the grid) */
  surf(x: number, y: number): number;
  /** whether the map's own water (a river, a creek, a pond) lies at a tile point: water the course grid knows nothing of */
  wet(x: number, y: number): boolean;
  ways: readonly Way[];
  /** the tee markers' boxes: each marker's tile point and the half side of the box round it (tiles) */
  teeBoxes: readonly { x: number; y: number; r: number }[];
  holes: readonly HoleLine[];
}
/** the ground in front of a tee in the line of play: this far along it (tiles) and this wide each side of it */
export const FRONT_LEN = 70, FRONT_HALF = 18;

/** the ground of the tile point (x, y) from the grid and the water alone */
function surfGround(src: GroundSources, x: number, y: number): Ground {
  if (src.wet(x, y)) return G.water;
  switch (src.surf(x, y)) {
    case S.water: return G.water;
    case S.green: return G.green;
    case S.tee: return G.tee;
    case S.bunker: case S.waste: return G.bunker;
    case S.fairway: return G.fairway;
    default: return G.open;
  }
}

/** the field of the tile box x0 y0 x1 y1: the surfaces and the water first, the tee markers' boxes over them, the ground in front of each tee in the
 *  line of play (a fairway or open ground there becomes `front`: dear to cross), then the ways laid over open ground and fairway (a way across a fairway
 *  is where it is crossed; never over a tee, a green, a bunker or water) */
export function buildWalkField(x0: number, y0: number, x1: number, y1: number, src: GroundSources, cell = 1): WalkField {
  const f = makeField(x0, y0, x1, y1, cell), { w, h, g } = f;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g[j * w + i] = surfGround(src, x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell);
  const at = (x: number, y: number): number => { const i = Math.floor((x - x0) / cell), j = Math.floor((y - y0) / cell); return i < 0 || j < 0 || i >= w || j >= h ? -1 : j * w + i; };
  // the tee markers' boxes
  for (const t of src.teeBoxes) {
    const i0 = Math.floor((t.x - t.r - x0) / cell), i1 = Math.floor((t.x + t.r - x0) / cell), j0 = Math.floor((t.y - t.r - y0) / cell), j1 = Math.floor((t.y + t.r - y0) / cell);
    for (let j = Math.max(0, j0); j <= Math.min(h - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(w - 1, i1); i++) if (g[j * w + i] !== G.water) g[j * w + i] = G.tee;
  }
  // the line of play in front of each tee
  for (const hl of src.holes) {
    const dx = hl.aim.x - hl.tee.x, dy = hl.aim.y - hl.tee.y, L = Math.hypot(dx, dy); if (L < 1e-6) continue;
    const ux = dx / L, uy = dy / L, ext = Math.min(FRONT_LEN, L), R = FRONT_LEN + FRONT_HALF;
    const i0 = Math.floor((hl.tee.x - R - x0) / cell), i1 = Math.floor((hl.tee.x + R - x0) / cell), j0 = Math.floor((hl.tee.y - R - y0) / cell), j1 = Math.floor((hl.tee.y + R - y0) / cell);
    for (let j = Math.max(0, j0); j <= Math.min(h - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(w - 1, i1); i++) {
      const c = j * w + i, v = g[c]!; if (v !== G.open && v !== G.fairway) continue;
      const px = x0 + (i + 0.5) * cell - hl.tee.x, py = y0 + (j + 0.5) * cell - hl.tee.y, along = px * ux + py * uy, across = Math.abs(-px * uy + py * ux);
      if (along > 0 && along <= ext && across <= FRONT_HALF) g[c] = G.front;
    }
  }
  // the ways, laid over open ground and fairways
  for (const wy of src.ways) {
    const dx = wy.bx - wy.ax, dy = wy.by - wy.ay, L2 = dx * dx + dy * dy, R = wy.hw + cell;
    const i0 = Math.floor((Math.min(wy.ax, wy.bx) - R - x0) / cell), i1 = Math.floor((Math.max(wy.ax, wy.bx) + R - x0) / cell), j0 = Math.floor((Math.min(wy.ay, wy.by) - R - y0) / cell), j1 = Math.floor((Math.max(wy.ay, wy.by) + R - y0) / cell);
    for (let j = Math.max(0, j0); j <= Math.min(h - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(w - 1, i1); i++) {
      const c = j * w + i, v = g[c]!; if (v !== G.open && v !== G.fairway && v !== G.front && !(wy.bridge && v === G.water)) continue;
      const px = x0 + (i + 0.5) * cell, py = y0 + (j + 0.5) * cell, t = L2 > 0 ? Math.max(0, Math.min(1, ((px - wy.ax) * dx + (py - wy.ay) * dy) / L2)) : 0;
      if (Math.hypot(px - wy.ax - dx * t, py - wy.ay - dy * t) <= Math.max(wy.hw, cell * 0.5)) g[c] = G.path;
    }
  }
  void at;
  return f;
}

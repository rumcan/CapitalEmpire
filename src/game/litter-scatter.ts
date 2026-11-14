// The ground litter's scatter (renderer.ts drawLitter: "a sparse scatter and a few drifts on the grass, as the builder's regionDressing does": in the desert theme pebbles, clumps of sand,
// dry twigs and tumbleweed tufts, desert-litter.ts) and the ground that is its own (#1278; the owner, 2026-11-14: "can we remove the desert texture underneath the driving range tee box"):
// an area painted with PatchPaint.own, as the range's tee box, its slab and mats are (golf/rangebiz.ts rangeScene), is its own ground from edge to edge: the map's ground never spills over
// its edge (renderer.ts areaSpill, rugged-edges.ts ruggedKindOf), and no litter, scrub or fallen leaf is laid on it or on the margin round it (the raised tee's cut face and the apron).
// Pure TypeScript (no DOM): the ground workers lay it per chunk, the tests run it in node.
import { mulberry } from './iso';
import { inPoly } from './rugged-edges';

/** a litter spot: its place (tiles), turn (radians), size (metres) and the sprite the picker chose for it */
export interface LitterSpot { x: number; y: number; ang: number; s: number; idx: number }

/** the scatter's regions are this many tiles a side, each seeded by its own place (so chunks agree and a re-bake lays the same litter) */
export const LITTER_REGION = 8;

/** the scatter over the regions rx0..rx1, ry0..ry1 (tile box / LITTER_REGION, floored): 30 strays and up to two clumps a region, exactly as drawLitter laid them before #1278.
 *  `accept(x, y)`: the spot may hold litter at all (inside the map, off roads and buildings, off the water); `own(x, y)`: the spot is on ground of its own and holds none. `pick(r, sizeM)`
 *  chooses the sprite (the textures' pickLeaf). A spot on ground of its own is drawn for and dropped AFTER its random numbers are spent, so every other spot of the region keeps its
 *  place, turn and picture whatever lies on the ground of its own */
export function scatterLitter(rx0: number, ry0: number, rx1: number, ry1: number, accept: (x: number, y: number) => boolean, own: (x: number, y: number) => boolean, pick: (r: () => number, sizeM: number) => number): LitterSpot[] {
  const out: LitterSpot[] = [];
  for (let ry = ry0; ry <= ry1; ry++) for (let rx = rx0; rx <= rx1; rx++) {
    const r = mulberry(((rx * 7919) ^ (ry * 104729) ^ 0x51ed) >>> 0), g2 = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
    const add = (x: number, y: number, sizeM: number) => {
      if (!accept(x, y)) return;
      const ang = r() * Math.PI * 2, idx = pick(r, sizeM);
      if (own(x, y)) return;
      out.push({ x, y, ang, s: sizeM, idx });
    };
    const sizeOf = (k: string) => { const u = r(); return (k === 'stray' ? 0.96 : 1) * (u < 0.22 ? 0.11 + r() * 0.08 : u < 0.58 ? 0.2 + r() * 0.1 : u < 0.88 ? 0.32 + r() * 0.15 : 0.49 + r() * 0.16); };
    const S = LITTER_REGION;
    for (let i = 0; i < 30; i++) add(rx * S + r() * S, ry * S + r() * S, sizeOf('stray'));
    for (let c = 0; c < 2; c++) { if (r() > 0.6) continue; const X0 = rx * S + r() * S, Y0 = ry * S + r() * S, n = 4 + Math.floor(r() * r() * 22), sp = (0.35 + r() * 0.6) / 2; for (let i = 0; i < n; i++) add(X0 + g2() * sp, Y0 + g2() * sp, sizeOf('gutter')); }
  }
  return out;
}

/** one area of ground of its own: its outline (tiles, x y pairs), its tile box and its margin (tiles) */
export interface OwnGround { pts: readonly number[]; b: readonly [number, number, number, number]; grow: number }
/** what the scatter needs of a patch: its outline and its paint's `own` margin (the PatchPaint field of ground-protocol.ts) */
export interface OwnCandidate { pts: ArrayLike<number>; paint?: { own?: number } }
/** the areas of ground of their own among the patches (a painted area with an `own` margin, 0 or more tiles) */
export function ownGroundOf(patches: Iterable<OwnCandidate>): OwnGround[] {
  const out: OwnGround[] = [];
  for (const p of patches) {
    const own = p.paint?.own; if (own === undefined || !(own >= 0) || p.pts.length < 6) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k + 1 < p.pts.length; k += 2) { const x = p.pts[k]!, y = p.pts[k + 1]!; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    out.push({ pts: Array.from(p.pts), b: [x0, y0, x1, y1], grow: own });
  }
  return out;
}
/** the distance from a point to an outline's nearest edge (tiles) */
function edgeDistance(pts: readonly number[], x: number, y: number): number {
  const n = pts.length >> 1; let best = Infinity;
  for (let i = 0; i < n; i++) {
    const ax = pts[2 * i]!, ay = pts[2 * i + 1]!, j = (i + 1) % n, bx = pts[2 * j]!, by = pts[2 * j + 1]!, dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    const t = l > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0, d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
    if (d < best) best = d;
  }
  return best;
}
/** whether tile point (x, y) lies on ground of its own: inside one of the areas, or within its margin of it */
export function onOwnGround(list: readonly OwnGround[], x: number, y: number): boolean {
  for (const o of list) {
    const b = o.b, g = o.grow;
    if (x < b[0] - g || x > b[2] + g || y < b[1] - g || y > b[3] + g) continue;
    if (inPoly(o.pts, x, y) || (g > 0 && edgeDistance(o.pts, x, y) <= g)) return true;
  }
  return false;
}

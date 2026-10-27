// Fallen leaves baked into the ground (T220, #605; the owner, 2026-10-27: "add alot of leaves decals to the town and backyards without making
// the game slower", "we need a ton more leaves if you can manage it", "leaves on the backyards"). Every ground chunk lays them from what
// stands on and near it, after the rest of its ground, so they cost nothing a frame:
//   - trees (broadleaf, by canopy): a carpet of leaf piles under the canopy, heaviest downwind of the trunk, and a scatter round it; a near-bare
//     tree drops more than a full one, and each drops its own colour (a maple red, an oak brown, a birch gold);
//   - fences, hedges and walls: drifts along their foot, deeper on the lee side and near trees;
//   - buildings: drifts along the walls (the lee walls most) and piles in the corners, the door kept clear;
//   - yards (each house lot's own lawn): a light scatter over the open lawn, more in the back yard than the front, and a few on its drive;
//   - streets: what falls from a street tree onto the road lies along the kerb in the gutter, a scatter on the sidewalks, fewer on busy roads.
// The leaves are stamps of small pictures (piles, drifts, scatters, a few leaves) the renderer draws once per worker into an atlas from the
// game's leaf sprites (textures.ts leaves), in five colours (as painted, maple red, oak brown, gold and a few green). Each source is seeded by
// its own place in the world, so chunks meet at their borders and a re-bake lays the same leaves; the density (the gear menu's Fallen leaves)
// thins them as a subset. Pure TypeScript (no DOM): the ground workers lay it per chunk (renderer.ts drawLitter), the tests run it in node.
import { mulberry } from './iso';
import { CASTER_STRIDE, CK, type Box } from './living-ground';

/** the gear menu's Fallen leaves: 1 the amount T220 lays (the default), 0 none of them (the ground exactly as before T220), up to 2 */
export const LEAF_DENSITY_DEFAULT = 1;
export const LEAF_DENSITY_MAX = 2;
export const clampLeafDensity = (v: number): number => (Number.isFinite(v) ? Math.min(LEAF_DENSITY_MAX, Math.max(0, v)) : LEAF_DENSITY_DEFAULT);

/** the wind the leaves fell in (tile space, unit): toward the screen's right (a little down), so a tree's leaves lie out in the sun beside its
 *  trunk, not under its canopy or in its shadow (which falls to the lower left, 145 degrees), and settle in the lee of the walls that face the
 *  camera's lower right */
export const WIND: readonly [number, number] = [1 / Math.hypot(1, 0.25), -0.25 / Math.hypot(1, 0.25)];

/* ---- the pictures (the renderer's atlas) ---- */
/** the picture kinds: a heap (a couple of metres of leaves), a long drift (turned to ORIENTS directions over half a turn), a sparse scatter, a
 *  few leaves */
export const LK = { PILE: 0, DRIFT: 1, SCATTER: 2, SMALL: 3 } as const;
export type LeafKind = (typeof LK)[keyof typeof LK];
/** the shapes of each kind, and the directions a drift is drawn in (k * 180 / ORIENTS degrees in tile space) */
export const PILE_SHAPES = 8, DRIFT_SHAPES = 4, SCATTER_SHAPES = 8, SMALL_SHAPES = 6, ORIENTS = 8;
/** the last heap shapes are small ones (a shrub's) */
export const SMALL_HEAPS = 2;
/** the colour moods of a picture's leaves: a maple's reds, an oak's browns, a birch's golds, and a mix (a drift blown together from many trees) */
export const MOOD = { MAPLE: 0, OAK: 1, BIRCH: 2, MIXED: 3 } as const;
export const MOODS = 4;
/** the leaf colours (the renderer's tinted copies of the sprite sheet): as painted (orange and red), maple red, oak brown, gold, green */
export const LEAF_TINTS = ['', '#a8281a', '#6f4a2c', '#d6a12c', '#71882e'] as const;
/** each mood's share of the colours (in LEAF_TINTS order) */
const MOOD_MIX: readonly (readonly number[])[] = [
  [0.36, 0.5, 0.04, 0.07, 0.03],
  [0.22, 0.04, 0.52, 0.17, 0.05],
  [0.2, 0.03, 0.12, 0.6, 0.05],
  [0.36, 0.2, 0.15, 0.24, 0.05],
];
/** the moods a drift comes in (blown together from many trees: a mix, or mostly an oak's browns); a drift asked in another is drawn as a mix */
const DRIFT_MOODS: readonly number[] = [MOOD.MIXED, MOOD.OAK];
/** the pictures: the heaps, scatters and smalls of each mood, then the drifts of each drift mood (shape by shape, each in its directions) */
const ROUND_PER_MOOD = PILE_SHAPES + SCATTER_SHAPES + SMALL_SHAPES, DRIFT_BASE = ROUND_PER_MOOD * MOODS, DRIFTS_PER_MOOD = DRIFT_SHAPES * ORIENTS;
export const PIC_COUNT = DRIFT_BASE + DRIFTS_PER_MOOD * DRIFT_MOODS.length;
/** a picture's index: its kind, shape, direction (drifts only) and mood */
export const picOf = (kind: LeafKind, shape: number, orient: number, mood: number): number =>
  kind === LK.DRIFT ? DRIFT_BASE + Math.max(0, DRIFT_MOODS.indexOf(mood)) * DRIFTS_PER_MOOD + (shape % DRIFT_SHAPES) * ORIENTS + (orient % ORIENTS)
    : mood * ROUND_PER_MOOD + (kind === LK.PILE ? shape % PILE_SHAPES : kind === LK.SCATTER ? PILE_SHAPES + (shape % SCATTER_SHAPES) : PILE_SHAPES + SCATTER_SHAPES + (shape % SMALL_SHAPES));
/** a picture's kind, mood, shape and direction (picOf's inverse) */
export function picInfo(pic: number): { kind: LeafKind; mood: number; shape: number; orient: number } {
  if (pic >= DRIFT_BASE) { const q = pic - DRIFT_BASE, w = q % DRIFTS_PER_MOOD; return { kind: LK.DRIFT, mood: DRIFT_MOODS[Math.floor(q / DRIFTS_PER_MOOD)]!, shape: Math.floor(w / ORIENTS), orient: w % ORIENTS }; }
  const mood = Math.floor(pic / ROUND_PER_MOOD), q = pic % ROUND_PER_MOOD;
  return q < PILE_SHAPES ? { kind: LK.PILE, mood, shape: q, orient: 0 } : q < PILE_SHAPES + SCATTER_SHAPES ? { kind: LK.SCATTER, mood, shape: q - PILE_SHAPES, orient: 0 } : { kind: LK.SMALL, mood, shape: q - PILE_SHAPES - SCATTER_SHAPES, orient: 0 };
}
export const kindOfPic = (pic: number): LeafKind => picInfo(pic).kind;
/** floats per leaf of a picture: its centre's offset from the picture's (tiles, on the ground), its size (m), its turn on screen (radians), its
 *  colour (LEAF_TINTS index) and a number 0..1 that picks its sprite */
export const PIC_LEAF = 6;
/** the most a picture reaches from its centre (tiles): the margin a chunk lays its stamps in past its box */
export const PIC_REACH = 1;

const gauss = (r: () => number) => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
const pickColour = (mood: number, u: number) => { const m = MOOD_MIX[mood]!; let a = 0; for (let i = 0; i < m.length; i++) { a += m[i]!; if (u < a) return i; } return 0; };

/** every picture's leaves (PIC_LEAF floats each), by picture index; the same in every worker (fixed seeds), so the chunks they bake agree.
 *  Made once */
let pictures: Float32Array[] | null = null;
export function leafPictures(): Float32Array[] {
  if (pictures) return pictures;
  const out: Float32Array[] = [];
  for (let pic = 0; pic < PIC_COUNT; pic++) {
    const { kind, mood, orient } = picInfo(pic), r = mulberry(0x1eaf000 + pic * 131), v: number[] = [];
    const leaf = (dx: number, dy: number, size: number) => v.push(dx, dy, size, r() * Math.PI * 2, pickColour(mood, r()), r());
    // the sizes the game draws its leaves at (the litter's, network.ts leafSize: bigger than life, so a leaf reads at 30%), a little smaller in a heap
    const size = (k: number) => { const u = r(); return 1.2 * k * (u < 0.25 ? 0.13 + r() * 0.08 : u < 0.62 ? 0.21 + r() * 0.1 : u < 0.9 ? 0.31 + r() * 0.13 : 0.44 + r() * 0.14); };
    if (kind === LK.PILE) {
      // a heap a couple of metres across (the last SMALL_HEAPS shapes: a small one, under a shrub): dense at its heart, ragged at its rim, a
      // little long one way
      const small = picInfo(pic).shape >= PILE_SHAPES - SMALL_HEAPS, sd = small ? 0.1 : 0.18, cap = small ? 0.3 : 0.5;
      const n = small ? 18 + Math.floor(r() * 10) : 52 + Math.floor(r() * 20), a = r() * Math.PI, ca = Math.cos(a), sa = Math.sin(a), ex = 1.1 + r() * 0.3;
      for (let i = 0; i < n; i++) { let u = gauss(r) * sd * ex, w = gauss(r) * sd / ex; const l = Math.hypot(u, w); if (l > cap) { u *= cap / l; w *= cap / l; } leaf(u * ca - w * sa, u * sa + w * ca, size(0.95)); }
    } else if (kind === LK.DRIFT) {
      // a windrow along its direction: a tile long, thickest in the middle, tapering to its ends
      const a = (orient * Math.PI) / ORIENTS, ca = Math.cos(a), sa = Math.sin(a), n = 16 + Math.floor(r() * 10), bend = (r() - 0.5) * 0.08;
      for (let i = 0; i < n; i++) { const u = (r() + r() + r()) / 3 - 0.5, half = 0.14 * Math.sqrt(Math.max(0.05, 1 - 4 * u * u)), w = gauss(r) * half * 0.55 + bend * (1 - 4 * u * u); leaf(u * ca - w * sa, u * sa + w * ca, size(0.85)); }
    } else if (kind === LK.SCATTER) {
      // leaves strewn over a patch about three metres across, one or two touching
      const n = 9 + Math.floor(r() * 7);
      for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.78; leaf(Math.cos(a) * d, Math.sin(a) * d, size(1)); }
    } else {
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.2; leaf(Math.cos(a) * d, Math.sin(a) * d, size(1)); }
    }
    out.push(new Float32Array(v));
  }
  return (pictures = out);
}

/* ---- laying them ---- */
/** a road piece near the chunk: its centre line, its asphalt's half width and its sidewalk's (or verge's) width (tiles), and the share of the
 *  leaves that stay on it (1 a quiet street; a busy road's traffic blows most of them away) */
export interface LeafRoad { ax: number; ay: number; bx: number; by: number; h: number; walk: number; keep: number }
/** what a chunk's leaves come from: the casters near it (living-ground.ts records, the forest's left out), the yards (each house lot's own
 *  lawn: its four corners from the street side, o, o + u w, o + u w + n d, o + n d), its paved ground (drives, walks, car parks: few leaves),
 *  the roads, where none may lie (water, woods, the course, painted areas, off the map) and the road network's coarse cover (1 walk, 2 asphalt, 3
 *  median; tile cells) */
export interface LeafSources {
  casters: ArrayLike<number>;
  yards?: readonly ArrayLike<number>[];
  hard?: readonly ArrayLike<number>[];
  roads?: readonly LeafRoad[];
  blocked?: (x: number, y: number) => boolean;
  cover?: (x: number, y: number) => number;
  /** the stamps a chunk lays at all (its box's corners lie off its picture: an iso chunk covers half its tile box); none outside it */
  within?: (x: number, y: number) => boolean;
}
/** floats per stamp: its centre (tiles) and its picture (picOf) */
export const STAMP = 3;
/** the side of the yard scatter's cells (tiles), and the stamps a cell tries */
const YARD_CELL = 2, YARD_TRIES = 2;
/** how far a tree's leaves reach (canopy radii from its trunk); a fence or a wall counts the trees within NEAR_REACH tiles */
const TREE_FALL_REACH = 2.1, NEAR_REACH = 9;

/** a source's seed from its place (tiles, to a 64th) */
const seedOf = (x: number, y: number, salt: number) => { let h = Math.imul(Math.round(x * 64) | 0, 374761393) ^ Math.imul(Math.round(y * 64) | 0, 668265263) ^ Math.imul(salt | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
const polyBox = (p: ArrayLike<number>): Box => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let k = 0; k + 1 < p.length; k += 2) { const x = p[k]!, y = p[k + 1]!; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
function inPolygon(p: ArrayLike<number>, x: number, y: number): boolean {
  const n = p.length >> 1; let c = false;
  for (let i = 0, j = n - 1; i < n; j = i++) { const yi = p[2 * i + 1]!, yj = p[2 * j + 1]!; if ((yi > y) !== (yj > y) && x < ((p[2 * j]! - p[2 * i]!) * (y - yi)) / (yj - yi) + p[2 * i]!) c = !c; }
  return c;
}
/** a drift's direction index for a tile-space direction (half a turn: a drift has no front) */
export const orientOf = (ux: number, uy: number): number => { let a = Math.atan2(uy, ux); if (a < 0) a += Math.PI; return Math.round((a * ORIENTS) / Math.PI) % ORIENTS; };

/** The fallen leaves over tile box `box` (each stamp's centre within PIC_REACH of it, so a chunk lays every stamp that reaches it) at density
 *  (0: none), as STAMP floats each. Deterministic: every source draws from its own seed, so the stamps a box gets are the same whichever chunk
 *  asks, and a lower density lays a subset of a higher one's. */
export function layLeaves(box: Box, src: LeafSources, density: number): Float32Array {
  if (!(density > 0)) return new Float32Array(0);
  const out: number[] = [], m = PIC_REACH + 0.1, bx0 = box[0] - m, by0 = box[1] - m, bx1 = box[2] + m, by1 = box[3] + m;
  const c = src.casters, nc = Math.floor(c.length / CASTER_STRIDE), [wx, wy] = WIND;
  // ---- the casters by kind: broadleaf trees (x, y, canopy radius, mood, bareness), buildings and lines
  const trees: number[] = [], houses: number[] = [], lines: number[] = [], bushes: number[] = [];
  for (let k = 0; k < nc; k++) {
    const o = k * CASTER_STRIDE, kind = c[o]!;
    if (kind === CK.TREE) { if (c[o + 4]! >= 0.75) { const code = c[o + 5]!, bare = c[o + 6]!; trees.push(c[o + 1]!, c[o + 2]!, c[o + 3]!, code >= 1 && code <= MOODS ? code - 1 : MOOD.MIXED, bare > 0 ? bare : 0.5); } }
    else if (kind === CK.BUILDING) houses.push(c[o + 1]!, c[o + 2]!, c[o + 3]!, c[o + 4]!, c[o + 5]!, c[o + 6]!);
    else if (kind === CK.BUSH) bushes.push(c[o + 1]!, c[o + 2]!, c[o + 3]!);
    else if (kind === CK.FENCE || kind === CK.HEDGE || kind === CK.WALL) lines.push(kind, c[o + 1]!, c[o + 2]!, c[o + 3]!, c[o + 4]!, c[o + 5]!);
  }
  /** how much the trees round (x, y) shed there (0 far from any, 1 under a big one): the trees within NEAR_REACH, found by NEAR_REACH cells */
  const cellOf = (i: number, j: number) => (j + 512) * 1024 + i + 512, byCell = new Map<number, number[]>();
  for (let i = 0; i < trees.length; i += 5) { const k = cellOf(Math.floor(trees[i]! / NEAR_REACH), Math.floor(trees[i + 1]! / NEAR_REACH)); const l = byCell.get(k); if (l) l.push(i); else byCell.set(k, [i]); }
  const near = (x: number, y: number) => {
    const ci = Math.floor(x / NEAR_REACH), cj = Math.floor(y / NEAR_REACH); let s = 0;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const l = byCell.get(cellOf(i, j)); if (!l) continue;
      for (const t of l) { const dx = x - trees[t]!, dy = y - trees[t + 1]!, d2 = dx * dx + dy * dy; if (d2 > NEAR_REACH * NEAR_REACH) continue; const R = trees[t + 2]! * 1.7; s += Math.exp(-d2 / (2 * R * R)); }
    }
    return s > 1 ? 1 : s;
  };
  /** a draw u against a share base + k * near(x, y) (times the density), near asked only when u falls between the bounds */
  const under = (u: number, base: number, k: number, x: number, y: number) => u < base * density || (u < (base + k) * density && u < (base + k * near(x, y)) * density);
  const yards = (src.yards ?? []).map(p => ({ p, b: polyBox(p) })), hard = (src.hard ?? []).map(p => ({ p, b: polyBox(p) }));
  const roads = (src.roads ?? []).map(r => { const g = r.h + r.walk + 0.1; return { r, b: [Math.min(r.ax, r.bx) - g, Math.min(r.ay, r.by) - g, Math.max(r.ax, r.bx) + g, Math.max(r.ay, r.by) + g] as Box }; });
  const inBox = (b: Box, x: number, y: number) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
  /** the road a point is on (the nearest centre line whose asphalt or sidewalk holds it): where it is across it, or null */
  const roadAt = (x: number, y: number) => {
    let best: { r: LeafRoad; d: number; px: number; py: number; ux: number; uy: number; side: number } | null = null;
    for (const { r, b } of roads) {
      if (!inBox(b, x, y)) continue;
      const dx = r.bx - r.ax, dy = r.by - r.ay, l2 = dx * dx + dy * dy; if (!l2) continue;
      const t = Math.max(0, Math.min(1, ((x - r.ax) * dx + (y - r.ay) * dy) / l2)), px = r.ax + dx * t, py = r.ay + dy * t, d = Math.hypot(x - px, y - py);
      if (d >= r.h + r.walk || (best && d - r.h >= best.d - best.r.h)) continue;
      const l = Math.sqrt(l2), ux = dx / l, uy = dy / l;
      best = { r, d, px, py, ux, uy, side: (x - px) * -uy + (y - py) * ux >= 0 ? 1 : -1 };
    }
    return best;
  };
  const inside = (list: { p: ArrayLike<number>; b: Box }[], x: number, y: number) => { for (const e of list) if (inBox(e.b, x, y) && inPolygon(e.p, x, y)) return e; return null; };
  /** a stamp at (x, y) where it lands: none off the ground, in a building or where a busy road's traffic took it; a tree's leaves on the asphalt
   *  blown to the kerb (a drift along it, in the gutter); a scatter on a sidewalk; a few on the paving. keepU: the draw that decides */
  const put = (x: number, y: number, kind: LeafKind, shape: number, orient: number, mood: number, keepU: number, fromTree: boolean) => {
    if (x < bx0 || x > bx1 || y < by0 || y > by1 || (src.within && !src.within(x, y))) return;
    if (src.blocked?.(x, y)) return;
    for (let i = 0; i < houses.length; i += 6) if (x > houses[i]! - 0.05 && x < houses[i + 2]! + 0.05 && y > houses[i + 1]! - 0.05 && y < houses[i + 3]! + 0.05) return;
    const rd = roads.length ? roadAt(x, y) : null;
    if (rd) {
      const { r } = rd;
      if (rd.d < r.h) {
        // on the asphalt: only a tree's, and the traffic sweeps them to the kerb
        if (!fromTree || keepU > r.keep) return;
        const g = Math.max(0.1, r.h - 0.16 - keepU * 0.08); x = rd.px - rd.uy * rd.side * g; y = rd.py + rd.ux * rd.side * g;
        kind = LK.DRIFT; orient = orientOf(rd.ux, rd.uy);
      } else {
        // on the sidewalk (or the verge): trodden and swept, so a scatter, and fewer by a busy road
        if (keepU > 0.25 + 0.65 * r.keep) return;
        if (kind === LK.PILE) kind = LK.SCATTER;
      }
    } else {
      const cv = src.cover?.(x, y) ?? 0;
      if (cv >= 2 && !fromTree) return; // a junction's asphalt or a median past the pieces' capsules
      if (cv >= 2 && keepU > 0.3) return;
      if (hard.length && inside(hard, x, y)) { if (keepU > 0.42) return; if (kind === LK.PILE) kind = LK.SCATTER; }
    }
    out.push(x, y, picOf(kind, shape, orient, mood));
  };
  const shapeN = (kind: LeafKind) => [PILE_SHAPES, DRIFT_SHAPES, SCATTER_SHAPES, SMALL_SHAPES][kind]!;
  // ---- trees: a carpet of piles under the canopy, heaviest downwind of the trunk, then a scatter round it. Two streams per tree, so a lower
  //      density lays the first of the same piles and scatters
  for (let i = 0; i < trees.length; i += 5) {
    const x = trees[i]!, y = trees[i + 1]!, R = trees[i + 2]!, mood = trees[i + 3]!, bare = trees[i + 4]!, reach = R * TREE_FALL_REACH + m;
    if (x + reach < bx0 || x - reach > bx1 || y + reach < by0 || y - reach > by1) continue;
    const A = (0.55 + 0.9 * bare) * density, cx = x + wx * R * 0.55, cy = y + wy * R * 0.55;
    for (const [salt, kind, base, per, spread, push] of [[0x7ee5, LK.PILE, 2, 4.2, 0.55, 0], [0x5ca7, LK.SCATTER, 1.5, 2.4, 0.95, 0.25]] as const) {
      const r = mulberry(seedOf(x, y, salt)), want = A * (base + per * R * R), n = Math.floor(want) + (r() < want - Math.floor(want) ? 1 : 0);
      for (let k = 0; k < n; k++) {
        let gx = gauss(r) * R * spread + wx * R * push, gy = gauss(r) * R * spread + wy * R * push;
        const shape = Math.floor(r() * shapeN(kind)); r(); const mu = r(), keepU = r();
        const l = Math.hypot(gx + cx - x, gy + cy - y), cap = R * TREE_FALL_REACH; if (l > cap) { gx = (gx + cx - x) * cap / l + x - cx; gy = (gy + cy - y) * cap / l + y - cy; }
        put(cx + gx, cy + gy, kind, shape, 0, mu < 0.85 ? mood : MOOD.MIXED, keepU, true);
      }
    }
  }
  // ---- fences, hedges and walls: drifts along their foot, the lee side deeper, more where trees shed near them
  for (let i = 0; i < lines.length; i += 6) {
    const kind = lines[i]!, ax = lines[i + 1]!, ay = lines[i + 2]!, bx = lines[i + 3]!, by = lines[i + 4]!, t = lines[i + 5]!, len = Math.hypot(bx - ax, by - ay);
    if (len < 0.3 || Math.max(ax, bx) + 1.5 < bx0 || Math.min(ax, bx) - 1.5 > bx1 || Math.max(ay, by) + 1.5 < by0 || Math.min(ay, by) - 1.5 > by1) continue;
    const ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux, lee = nx * wx + ny * wy >= 0 ? 1 : -1, hedge = kind === CK.HEDGE, ori = orientOf(ux, uy);
    const r = mulberry(seedOf(ax + bx, ay + by, 0xfe9c + kind * 977 + Math.round(len * 31)));
    for (let s = r() * 0.6; s < len; s += 0.75 + r() * 0.5) {
      const px = ax + ux * s, py = ay + uy * s, a = r(), b = r(), shA = Math.floor(r() * DRIFT_SHAPES), shB = Math.floor(r() * DRIFT_SHAPES); r(); r();
      const j = r(), kA = r(), kB = r(), mood = r() < 0.6 ? MOOD.MIXED : MOOD.OAK;
      const off = t + 0.13 + j * 0.06;
      if (under(a, 0.38, 0.6, px, py)) put(px + nx * lee * off, py + ny * lee * off, LK.DRIFT, shA, ori, mood, kA, false);
      if (hedge ? under(b, 0.38, 0.6, px, py) : under(b, 0.12, 0.4, px, py)) put(px - nx * lee * off, py - ny * lee * off, LK.DRIFT, shB, ori, mood, kB, false);
    }
  }
  // ---- buildings: drifts along the walls (the lee walls most), piles in the corners; the door kept clear
  for (let i = 0; i < houses.length; i += 6) {
    const x0 = houses[i]!, y0 = houses[i + 1]!, x1 = houses[i + 2]!, y1 = houses[i + 3]!, dx = houses[i + 4]!, dy = houses[i + 5]!;
    if (x1 + 1.5 < bx0 || x0 - 1.5 > bx1 || y1 + 1.5 < by0 || y0 - 1.5 > by1) continue;
    const r = mulberry(seedOf(x0 + x1, y0 + y1, 0xb01d + Math.round((x1 - x0) * 37 + (y1 - y0) * 101)));
    // the sides: a start corner, the direction along it, its outward normal
    const sides: [number, number, number, number, number, number, number][] = [[x0, y0, 1, 0, 0, -1, x1 - x0], [x1, y0, 0, 1, 1, 0, y1 - y0], [x0, y1, 1, 0, 0, 1, x1 - x0], [x0, y0, 0, 1, -1, 0, y1 - y0]];
    for (const [sx, sy, ux, uy, nx, ny, len] of sides) {
      const lee = Math.max(0, nx * wx + ny * wy), ori = orientOf(ux, uy);
      for (let s = 0.3 + r() * 0.5; s < len - 0.2; s += 0.8 + r() * 0.5) {
        const px = sx + ux * s, py = sy + uy * s, a = r(), sh = Math.floor(r() * DRIFT_SHAPES); r(); const j = r(), kU = r(), mood = r() < 0.65 ? MOOD.MIXED : MOOD.OAK;
        if (Number.isFinite(dx) && Math.hypot(px - dx, py - dy) < 0.9) continue;
        if (under(a, 0.18 + 0.55 * lee, 0.35, px, py)) { const off = 0.16 + j * 0.08; put(px + nx * off, py + ny * off, LK.DRIFT, sh, ori, mood, kU, false); }
      }
    }
    for (const [cx, cy, nx, ny] of [[x0, y0, -1, -1], [x1, y0, 1, -1], [x1, y1, 1, 1], [x0, y1, -1, 1]] as const) {
      const a = r(), sh = Math.floor(r() * PILE_SHAPES); r(); const kU = r(), lee = Math.max(0, (nx * wx + ny * wy) / Math.SQRT2);
      if (under(a, 0.3 + 0.45 * lee, 0.3, cx, cy)) put(cx + nx * 0.26, cy + ny * 0.26, LK.PILE, sh, 0, MOOD.MIXED, kU, false);
    }
  }
  // ---- shrubs: a small heap caught at the foot of each, on its lee side
  for (let i = 0; i < bushes.length; i += 3) {
    const x = bushes[i]!, y = bushes[i + 1]!, R = bushes[i + 2]!;
    if (x + 2 < bx0 || x - 2 > bx1 || y + 2 < by0 || y - 2 > by1) continue;
    const r = mulberry(seedOf(x, y, 0xb054)), a = r(), sh = PILE_SHAPES - SMALL_HEAPS + Math.floor(r() * SMALL_HEAPS), j = r(), kU = r(), mu = r(), d = R * 0.7 + 0.12 + j * 0.15;
    if (under(a, 0.45, 0.4, x, y)) put(x + wx * d, y + wy * d, LK.PILE, sh, 0, mu < 0.75 ? MOOD.MIXED : MOOD.OAK, kU, false);
  }
  // ---- kerbs: drifts in the gutter along each road (on both sides), more under trees, fewer on a busy road; each road piece seeded by its ends
  for (const { r: rd, b } of roads) {
    if (b[2] < bx0 || b[0] > bx1 || b[3] < by0 || b[1] > by1) continue;
    const len = Math.hypot(rd.bx - rd.ax, rd.by - rd.ay); if (len < 0.5 || rd.h < 0.6) continue;
    const ux = (rd.bx - rd.ax) / len, uy = (rd.by - rd.ay) / len, ori = orientOf(ux, uy), r = mulberry(seedOf(rd.ax + rd.bx, rd.ay + rd.by, 0x6e77 + Math.round(len * 7)));
    for (let s = r() * 1.5; s < len; s += 1.1 + r() * 1.3) {
      for (const side of [1, -1]) {
        const a = r(), sh = Math.floor(r() * DRIFT_SHAPES), j = r(), kU = r(), g = rd.h - 0.14 - j * 0.1, px = rd.ax + ux * s - uy * side * g, py = rd.ay + uy * s + ux * side * g;
        if (a < 0.6 * density && kU < rd.keep && under(a, 0.08, 0.5, px, py)) put(px, py, LK.DRIFT, sh, ori, MOOD.MIXED, kU, true);
      }
    }
  }
  // ---- the yards and sidewalks, cell by cell over the world grid: a light scatter over each lot's lawn (the back yard more than the front, more
  //      under trees), a few on its drive, and a scatter on the sidewalks
  if (yards.length || roads.length) {
    const cx0 = Math.floor(bx0 / YARD_CELL), cx1 = Math.floor(bx1 / YARD_CELL), cy0 = Math.floor(by0 / YARD_CELL), cy1 = Math.floor(by1 / YARD_CELL);
    for (let gy = cy0; gy <= cy1; gy++) for (let gx = cx0; gx <= cx1; gx++) {
      const r = mulberry(seedOf(gx, gy, 0xa4d5));
      if (src.within && !src.within((gx + 0.5) * YARD_CELL, (gy + 0.5) * YARD_CELL)) continue;
      for (let k = 0; k < YARD_TRIES; k++) {
        const x = (gx + r()) * YARD_CELL, y = (gy + r()) * YARD_CELL, a = r(), small = r() < 0.22, sh = r(); r(); const kU = r(), mu = r();
        const kind = small ? LK.SMALL : LK.SCATTER, shape = Math.floor(sh * shapeN(kind)), mood = mu < 0.7 ? MOOD.MIXED : Math.floor(mu * 10) % 3;
        const yd = yards.length ? inside(yards, x, y) : null;
        if (yd) {
          // how deep into the lot (0 the street, 1 the back line): the back yard behind the house gets the most
          const p = yd.p, ox = p[0]!, oy = p[1]!, qx = p[6]!, qy = p[7]!, dl = Math.hypot(qx - ox, qy - oy) || 1, depth = ((x - ox) * (qx - ox) + (y - oy) * (qy - oy)) / (dl * dl);
          if (under(a, depth > 0.5 ? 0.78 : 0.6, 0.45, x, y)) put(x, y, kind, shape, 0, mood, kU, false);
        } else if (roads.length && a < 0.8 * density) {
          const rd = roadAt(x, y);
          if (rd && rd.d >= rd.r.h && under(a, 0.3, 0.5, x, y)) put(x, y, kind, shape, 0, mood, kU, false);
        }
      }
    }
  }
  return new Float32Array(out);
}

/** a hash of what a chunk's leaves come from beyond the patches (the casters, the roads and the density): with the patches' identities, the
 *  renderer's key for the stamps it keeps per chunk (T217's pattern: a re-bake lays them without placing them again) */
export function leafSignature(src: Pick<LeafSources, 'casters' | 'roads'>, density: number): number {
  let h = (2166136261 ^ Math.round(density * 1000)) | 0;
  const mix = (v: number) => { h = Math.imul(h ^ (Number.isFinite(v) ? Math.round(v * 1024) | 0 : 0x5bd1e995), 16777619); };
  const c = src.casters; mix(c.length); for (let i = 0; i < c.length; i++) mix(c[i]!);
  for (const r of src.roads ?? []) { mix(r.ax); mix(r.ay); mix(r.bx); mix(r.by); mix(r.h); mix(r.walk); mix(r.keep); }
  return h >>> 0;
}

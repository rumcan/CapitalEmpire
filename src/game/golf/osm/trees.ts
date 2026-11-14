// Trees on a real course (#1273; the owner, 2026-11-14: "I placed Magnolia national and there are no trees on the course"). The course's spec (convert.ts) carries the trees the map has
// inside its land, and how wooded the course is (the file's meta.trees: parkland, links or desert). This plans what the placed course is planted with, as a list of trees (point, the
// library's id, size) the engine plants as props (Engine.plantRealTrees): the game's own trees for the map's look, never new art.
//   1. the map's trees where it has them: each wood (natural=wood, landuse=forest, natural=scrub) filled with a jittered tree every woodS tiles on a lattice that does not depend on the
//      wood (two woods that overlap plant one tree), each tree row (natural=tree_row) with a tree every rowGap tiles, each single tree (natural=tree) as it stands. The species: the leaf
//      type the map says (needleleaved: the conifers), else the course's conifer share; the autumn broadleaves and conifers of the Frame with trees, or in a desert game (or on a
//      desert course) the desert plants (desert-planting.ts), never an autumn tree among them
//   2. where it has few or none (many courses are mapped without their woods): each hole framed the way the hole card's Frame with trees does (golf/holeframe.ts: clumps of 3 to 9 along
//      the outer edge of the rough, with gaps), for as much of it as the map's trees nearby leave bare (a hole with a wood beside it is not framed over it), and a backdrop of trees
//      behind each green. A links course has almost no frame and a desert course scattered desert plants (STYLES).
// Never on a surface of play (water, fairway, tee, bunker, green: the course's own clearing rule, ext/hole-wizard/extras.ts propTreeCleared), never within playClear of one, never in a
// hole's line of play, within endClear of a tee or a pin, outside the land, or on the map's own water (the engine checks that, canPlace). Pure TypeScript, no DOM, deterministic:
// the same spec, grid and seed give the same trees.
import { CELL_T, SURF, surfRank, type Grid } from '../../ext/course-grid';
import { desertHolePlant, desertHoleSize, desertPlantIds } from '../../desert-planting';
import { dealTree, ownerSize } from '../../forest';
import { mulberry } from '../../iso';
import { hash2 } from '../../terrain/noise';
import { FRAME_BROAD_DEAL, FRAME_CONIFER_DEAL, FRAME_RULES, cartLanes, frameHole, type FrameRules, type FrameSite, type Pt } from '../holeframe';
import { inConvex, outlineAt } from './rotate';
import type { OsmCourseSpec, SpecHole, TreeLeaf, TreeSetting, TreeStyle } from './types';

/** the rules (tiles unless named; a tile is 2 m) */
export const TREE_RULES = {
  /** a wood's lattice: a jittered tree each woodS tiles (one in about 70 m2); scrub's is closer and smaller; jitter: how far of the lattice's step a tree wanders (0.8: it can stand
   *  0.4 step either side of its point) */
  woodS: 4.4, scrubS: 3.2, jitter: 0.8,
  /** a tree of a wood stands at least this far from a surface of play (water, fairway, tee, bunker, waste, green), from any hole's line of play, and from a tee or a pin */
  playClear: 4.5, lineClear: 8, endClear: 9,
  /** a single mapped tree (the map says it stands there) and a tree row's trees may stand closer to the play, never on it (their line and end clearances are this share of a wood's) */
  singleClear: 2.5, rowClear: 3, nearShare: 0.6,
  /** a tree row's trees stand this far apart along it */
  rowGap: 3.4,
  /** two trees of the plan at least this far apart (the frame's treeMin) */
  treeMin: 2.4,
  /** the trees behind a green stand between these distances from the pin, within backArc of the way the hole runs on (radians either side) */
  backNear: 11, backFar: 22, backArc: 1.3,
  /** the map's trees within nearHole of a hole's line of play count against its frame: with bareAt of them (or more) the hole is not framed at all */
  nearHole: 22, bareAt: 70,
  /** the most trees a course plants from the map and the most the whole plan holds (the performance budget: past it the trees are thinned evenly) */
  maxMap: 4500, maxAll: 7000,
  /** a wood's trees stand at this share of the frame trees' size (a wood reads as woods, its canopy on the next), a green's backdrop at this much, scrub and a flowering understorey at theirs */
  woodSize: 0.85, backSize: 1.1, scrubSize: 0.5, understoreySize: 0.62,
} as const;

/** what each style of course is planted with: the share of conifers among its trees (the course's own setting wins), the share of the map's wood lattice kept (woods), the share of the frame's
 *  clumps kept (frame: 1 is Frame with trees as it is), the trees behind each green (backdrop) and the trees in a clump (clump: least and most) */
export const STYLES: Readonly<Record<TreeStyle, { conifers: number; woods: number; frame: number; backdrop: number; clump: readonly [number, number] }>> = {
  parkland: { conifers: 0.35, woods: 1, frame: 1, backdrop: 9, clump: [FRAME_RULES.min, FRAME_RULES.max] },
  links: { conifers: 0.1, woods: 0.55, frame: 0.05, backdrop: 0, clump: [FRAME_RULES.min, FRAME_RULES.max] },
  desert: { conifers: 0, woods: 0.6, frame: 0.45, backdrop: 3, clump: [1, 4] },
};
/** a course with more conifers than this share has stands of tall pines (the spruces left out) and a flowering understorey: Magnolia National's */
const PINE_ABOVE = 0.55;
/** the pines and firs among the Frame with trees' conifers, and the broadleaves that stand for a flowering understorey (the crimson, scarlet and ember maples and oaks: the game's tree set
 *  has no dogwood or azalea, its reds are the nearest) */
export const PINE_IDS: readonly string[] = FRAME_CONIFER_DEAL.ids.filter(id => /pine|fir/.test(id));
export const FLOWER_IDS: readonly string[] = FRAME_BROAD_DEAL.ids.filter(id => /scarlet|crimson|ember|red-maple|red_maple/.test(id));
/** the pines and firs as a deal: each pine's picture counted PINE_WEIGHT times (the firs have many more pictures than the pines: with equal turns a stand of "pines" was firs) */
const PINE_WEIGHT = 8;
const PINE_POOL: readonly string[] = PINE_IDS.flatMap(id => (/pine/.test(id) ? Array.from({ length: PINE_WEIGHT }, () => id) : [id]));

/** a planted tree: its point (tiles, the map's), the library id, its size, where it came from (the map's own trees, or the frame and the backdrop the course's holes were given) and the
 *  hole it frames (0: the map's) */
export interface CourseTree { x: number; y: number; id: string; scale: number; src: 'map' | 'frame'; hole: number }
/** the plan: its trees, how many came from the map (and how many the map had before the budget thinned them) and from the frame, and whether the plan was thinned to the budget */
export interface TreePlan { trees: CourseTree[]; mapped: number; mappedAll: number; framed: number; thinned: boolean }
export interface TreeOpts {
  /** the game's look is the desert: its trees are the desert's (a desert course plants them in any game) */ desert?: boolean;
  /** the seed (a course's own: the same course plants the same way wherever it stands) */ seed?: number;
  /** the most trees in all (TREE_RULES.maxAll) */ max?: number;
}

/** a 32-bit hash of a string (a course's id) */
export function seedOf(s: string): number { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return h >>> 0; }

/** the style and setting a spec is planted by (the file says nothing: parkland) */
export const settingOf = (spec: Pick<OsmCourseSpec, 'treeSetting'>): TreeSetting => spec.treeSetting ?? { style: 'parkland' };

/** whether a point is inside a polygon's rings (even-odd over all of them: an inner ring is a hole), flat x, y lists */
function inRings(rings: readonly (readonly number[])[], x: number, y: number): boolean {
  let inside = false;
  for (const r of rings) {
    const n = r.length >> 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = r[2 * i]!, ay = r[2 * i + 1]!, bx = r[2 * j]!, by = r[2 * j + 1]!;
      if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    }
  }
  return inside;
}
/** the distance from (x, y) to polyline `pts` (flat x, y) */
function distLine(pts: readonly number[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i]!, ay = pts[i + 1]!, dx = pts[i + 2]! - ax, dy = pts[i + 3]! - ay, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    const d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
    if (d < best) best = d;
  }
  return best;
}
const boxOfFlat = (a: readonly number[]): [number, number, number, number] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < a.length; i += 2) { const x = a[i]!, y = a[i + 1]!; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
};
/** every n-th of a list (evenly, at most n of them): the thinning to a budget */
function thin<T>(a: readonly T[], n: number): T[] {
  if (a.length <= n) return a.slice();
  const k = a.length / Math.max(1, n);
  return a.filter((_, i) => Math.floor(i / k) !== Math.floor((i - 1) / k)).slice(0, Math.max(0, n));
}

/** the hole's line of play in the map's tiles: its back tee marker, its aim points, its pin (the markers the game lays; the Frame with trees reads the same) */
function lineOfPlay(h: SpecHole, ox: number, oy: number): Pt[] {
  const t = h.tees[0], start = t ? { x: t.x + ox, y: t.y + oy } : h.line.length >= 2 ? { x: h.line[0]! + ox, y: h.line[1]! + oy } : null;
  return [...(start ? [start] : []), ...h.aims.map(a => ({ x: a.x + ox, y: a.y + oy })), { x: h.pin.x + ox, y: h.pin.y + oy }];
}

/** each cell's distance (tiles) to the nearest cell of play (water, fairway, tee, bunker, waste, green: a surface that draws at or above the water's), over the land's window of grid g: a two-pass
 *  chamfer (1, sqrt 2), as band.ts. Outside the window: 0 (no tree stands off the land) */
function playField(g: Grid, ox: number, oy: number, w: number, h: number): (x: number, y: number) => number {
  const cx0 = Math.max(0, Math.floor((ox - g.x0) / CELL_T)), cy0 = Math.max(0, Math.floor((oy - g.y0) / CELL_T));
  const cx1 = Math.min(g.w, Math.ceil((ox + w - g.x0) / CELL_T)), cy1 = Math.min(g.h, Math.ceil((oy + h - g.y0) / CELL_T));
  const W = cx1 - cx0, H = cy1 - cy0;
  if (W <= 0 || H <= 0) return () => 0;
  const INF = 1e9, d = new Float32Array(W * H).fill(INF), play = surfRank(SURF.water);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (surfRank(g.surf[(y + cy0) * g.w + x + cx0]!) >= play) d[y * W + x] = 0;
  const D = Math.SQRT2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let v = d[i]!;
    if (v === 0) continue;
    if (x > 0 && d[i - 1]! + 1 < v) v = d[i - 1]! + 1;
    if (y > 0) { const u = i - W; if (d[u]! + 1 < v) v = d[u]! + 1; if (x > 0 && d[u - 1]! + D < v) v = d[u - 1]! + D; if (x + 1 < W && d[u + 1]! + D < v) v = d[u + 1]! + D; }
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; let v = d[i]!;
    if (v === 0) continue;
    if (x + 1 < W && d[i + 1]! + 1 < v) v = d[i + 1]! + 1;
    if (y + 1 < H) { const u = i + W; if (d[u]! + 1 < v) v = d[u]! + 1; if (x + 1 < W && d[u + 1]! + D < v) v = d[u + 1]! + D; if (x > 0 && d[u - 1]! + D < v) v = d[u - 1]! + D; }
    d[i] = v;
  }
  return (x, y) => {
    const cx = Math.floor((x - g.x0) / CELL_T) - cx0, cy = Math.floor((y - g.y0) / CELL_T) - cy0;
    return cx >= 0 && cy >= 0 && cx < W && cy < H ? d[cy * W + cx]! * CELL_T : 0;
  };
}

/** the plan's trees on a coarse hash: whether one stands within r tiles of a point */
class Spread {
  private cells = new Map<number, number[]>();
  private key(x: number, y: number): number { return Math.floor(y / 4) * 65536 + Math.floor(x / 4); }
  add(x: number, y: number): void { const k = this.key(x, y), l = this.cells.get(k); if (l) l.push(x, y); else this.cells.set(k, [x, y]); }
  near(x: number, y: number, r: number): boolean {
    const r2 = r * r;
    for (let j = Math.floor((y - r) / 4); j <= Math.floor((y + r) / 4); j++) for (let i = Math.floor((x - r) / 4); i <= Math.floor((x + r) / 4); i++) {
      const l = this.cells.get(j * 65536 + i); if (!l) continue;
      for (let k = 0; k < l.length; k += 2) if ((l[k]! - x) ** 2 + (l[k + 1]! - y) ** 2 < r2) return true;
    }
    return false;
  }
}

/** the course's mix of species: the share of conifers (when more than half, tall pines) and of its broadleaves that are a flowering understorey */
interface Mix { conifers: number; understorey: number }
/** one tree's species and size: leaf is what the map says grows there (null: not said), scrub a low shrub, grow a size factor; r draws */
function species(leaf: TreeLeaf, scrub: boolean, desert: boolean, mix: Mix, r: () => number, grow: number): { id: string; scale: number } {
  if (desert) {
    const bushes = desertPlantIds('bushes'), id = scrub && bushes.length ? bushes[Math.floor(r() * bushes.length)]! : desertHolePlant(r());
    return { id, scale: Math.round((scrub ? ownerSize(id) * 1.2 : desertHoleSize(id)) * (0.9 + 0.25 * r()) * grow * 100) / 100 };
  }
  const conifer = leaf === 'needle' || (leaf === null && !scrub && r() < mix.conifers);
  let id: string, k = 1;
  if (conifer) id = mix.conifers > PINE_ABOVE && PINE_POOL.length ? PINE_POOL[Math.floor(r() * PINE_POOL.length)]! : dealTree(FRAME_CONIFER_DEAL, r());
  else if (FLOWER_IDS.length && r() < mix.understorey) { id = FLOWER_IDS[Math.floor(r() * FLOWER_IDS.length)]!; k = TREE_RULES.understoreySize; }
  else id = dealTree(FRAME_BROAD_DEAL, r());
  return { id, scale: Math.round(ownerSize(id) * k * (scrub ? TREE_RULES.scrubSize : 1) * (0.9 + 0.25 * r()) * grow * 100) / 100 };
}

/** plans the trees of a placed real course: `spec` as laid (turned), `g` its painted grid (golf/osm/placegrid.ts scratchOf, or the game's course grid), `at` where the spec's
 *  frame (its north-west corner) lies on that grid's frame, tiles */
export function planCourseTrees(spec: OsmCourseSpec, g: Grid, at: { x: number; y: number }, opt: TreeOpts = {}): TreePlan {
  const R = TREE_RULES, setting = settingOf(spec), style = STYLES[setting.style], density = setting.density ?? 1;
  const desert = !!opt.desert || setting.style === 'desert', seed = (opt.seed ?? seedOf(spec.id)) >>> 0, ox = at.x, oy = at.y;
  const mix: Mix = { conifers: setting.conifers ?? style.conifers, understorey: setting.style === 'parkland' && (setting.conifers ?? 0) > PINE_ABOVE ? 0.45 : 0.08 };
  const land = outlineAt(spec, ox, oy), inLand = (x: number, y: number): boolean => inConvex(land, x, y) && inConvex(land, x + 1.2, y) && inConvex(land, x - 1.2, y) && inConvex(land, x, y + 1.2) && inConvex(land, x, y - 1.2);
  const playAt = playField(g, ox, oy, spec.w, spec.h);
  const lines = spec.holes.map(h => ({ n: h.n, line: lineOfPlay(h, ox, oy), flat: h.line.map((v, i) => v + (i & 1 ? oy : ox)) }));
  const pad = R.lineClear + 2, boxes = lines.map(l => { const b = boxOfFlat(l.flat); return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad] as const; });
  const ends: Pt[] = [];
  for (const h of spec.holes) { for (const t of h.tees) ends.push({ x: t.x + ox, y: t.y + oy }); ends.push({ x: h.pin.x + ox, y: h.pin.y + oy }); }
  // a place a tree may stand: inside the land, `clear` off the play, `lineClear` off every line of play, `endClear` off every tee and pin
  const free = (x: number, y: number, clear: number, lineClear: number = R.lineClear, endClear: number = R.endClear): boolean => {
    if (!inLand(x, y) || !(playAt(x, y) >= clear)) return false;
    for (let k = 0; k < lines.length; k++) { const b = boxes[k]!; if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && distLine(lines[k]!.flat, x, y) < lineClear) return false; }
    for (const e of ends) if ((e.x - x) ** 2 + (e.y - y) ** 2 < endClear * endClear) return false;
    return true;
  };
  const woods = (spec.trees?.woods ?? []).map(w => ({ ...w, box: boxOfFlat(w.rings[0] ?? []) }));
  const inWood = (x: number, y: number): boolean => { for (const w of woods) if (x - ox >= w.box[0] && x - ox <= w.box[2] && y - oy >= w.box[1] && y - oy <= w.box[3] && inRings(w.rings, x - ox, y - oy)) return true; return false; };
  const waterNear = (x: number, y: number): boolean => {
    for (let k = 0; k < 9; k++) { const cx = Math.floor((x + (k % 3) - 1 - g.x0) / CELL_T), cy = Math.floor((y + Math.floor(k / 3) - 1 - g.y0) / CELL_T); if (cx >= 0 && cy >= 0 && cx < g.w && cy < g.h && g.surf[cy * g.w + cx] === SURF.water) return true; }
    return false;
  };

  // ---- 1. the map's trees ----
  const mapped: CourseTree[] = [], taken = new Set<string>(), r2 = (x: number): number => Math.round(x * 100) / 100;
  const lay = (x: number, y: number, leaf: TreeLeaf, scrub: boolean, r: () => number, grow: number): void => {
    const s = species(leaf, scrub, desert, mix, r, grow);
    mapped.push({ x: r2(x), y: r2(y), id: s.id, scale: s.scale, src: 'map', hole: 0 });
  };
  for (const w of woods) {
    const S = (w.scrub ? R.scrubS : R.woodS) / Math.sqrt(Math.max(0.05, density * style.woods)), kind = w.scrub ? 1 : 0;
    const gx0 = Math.floor(w.box[0] / S) - 1, gx1 = Math.ceil(w.box[2] / S) + 1, gy0 = Math.floor(w.box[1] / S) - 1, gy1 = Math.ceil(w.box[3] / S) + 1;
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
      const key = `${kind}|${S.toFixed(2)}|${gx}|${gy}`;
      if (taken.has(key)) continue;
      const r = mulberry(hash2(hash2(seed ^ 0x57d3, gx + kind * 7919), gy));
      const lx = (gx + 0.5 + (r() - 0.5) * R.jitter) * S, ly = (gy + 0.5 + (r() - 0.5) * R.jitter) * S;
      if (!inRings(w.rings, lx, ly)) continue;
      taken.add(key);
      const x = lx + ox, y = ly + oy;
      if (free(x, y, R.playClear)) lay(x, y, w.leaf, w.scrub, r, R.woodSize);
    }
  }
  for (const row of spec.trees?.rows ?? []) {
    const p = row.pts, r = mulberry(hash2(seed ^ 0x2b0, p.length * 31 + Math.round((p[0] ?? 0) * 7) + Math.round((p[1] ?? 0) * 13)));
    let acc = 0, next = 0;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i]!, ay = p[i + 1]!, dx = p[i + 2]! - ax, dy = p[i + 3]! - ay, L = Math.hypot(dx, dy);
      if (L < 1e-6) continue;
      const nx = -dy / L, ny = dx / L;
      for (; next <= acc + L; next += R.rowGap) {
        const t = (next - acc) / L, off = (r() - 0.5) * 0.9, x = ax + dx * t + nx * off + ox, y = ay + dy * t + ny * off + oy, keep = r() < density;
        if (keep && free(x, y, R.rowClear, R.lineClear * R.nearShare, R.endClear * R.nearShare)) lay(x, y, row.leaf, false, r, 1);
      }
      acc += L;
    }
  }
  for (const grp of spec.trees?.points ?? []) {
    for (let i = 0; i + 1 < grp.xy.length; i += 2) {
      const x = grp.xy[i]! + ox, y = grp.xy[i + 1]! + oy, r = mulberry(hash2(seed, Math.round(x * 50) * 7 + Math.round(y * 50)));
      if (r() < density && free(x, y, R.singleClear, R.lineClear * R.nearShare, R.endClear * R.nearShare)) lay(x, y, grp.leaf, false, r, 1);
    }
  }
  // spaced (two within treeMin keep the first), then thinned to the budget
  const spread = new Spread(), spaced: CourseTree[] = [];
  for (const t of mapped) { if (spread.near(t.x, t.y, R.treeMin)) continue; spread.add(t.x, t.y); spaced.push(t); }
  const mapOut = thin(spaced, R.maxMap), out: CourseTree[] = [...mapOut];
  let thinned = mapOut.length < spaced.length;
  const placed = new Spread(); for (const t of out) placed.add(t.x, t.y); // (the thinned-out trees leave their places free)

  // ---- 2. the frame: each hole framed where the map's trees leave it bare, and a backdrop behind its green ----
  const lanes = cartLanes(spec.holes.map(h => ({ hole: h.n, tee: lineOfPlay(h, ox, oy)[0]!, pin: { x: h.pin.x + ox, y: h.pin.y + oy } })));
  const grid = { x0: g.x0, y0: g.y0, w: g.w, h: g.h, surf: (i: number) => g.surf[i]!, hole: (i: number) => g.hole[i]! };
  const rules: FrameRules = { ...FRAME_RULES, min: style.clump[0], max: style.clump[1], ...(desert ? { skip: 0.1, clumpSpacing: 13 } : {}) };
  const nearMapped = (flat: readonly number[]): number => { let n = 0; for (const t of mapOut) if (distLine(flat, t.x, t.y) < R.nearHole) n++; return n; };
  let framed = 0;
  if (style.frame > 0) for (const h of spec.holes) {
    const line = lineOfPlay(h, ox, oy); if (line.length < 2) continue;
    const L = lines.find(q => q.n === h.n)!, bare = Math.max(0, Math.min(1, 1 - nearMapped(L.flat) / R.bareAt)), keepShare = style.frame * bare * density;
    if (keepShare <= 0) continue;
    const site: FrameSite = {
      hole: h.n, seed: hash2(seed, h.n * 977), line, others: lines.filter(q => q.n !== h.n).map(q => q.line), lanes, grid, desert,
      // (the frame keeps off its own and every other hole's line of play by its own rules (the markers' lines); the map's hole lines and every tee marker (the forward tees too) are held to as well)
      ok: (x, y) => free(x, y, R.singleClear) && !waterNear(x, y) && !inWood(x, y) && !placed.near(x, y, R.treeMin),
    };
    const plan = frameHole(site, [], rules), keep = new Map<number, boolean>(), share = new Map<number, number>(), rnd = mulberry(hash2(seed ^ 0x3f1e, h.n)), r = mulberry(hash2(seed ^ 0x77, h.n));
    for (const t of plan.trees) {
      // (each clump kept or left out as a whole, by the share this hole's frame is wanted at; each clump its own mix, as the Frame with trees': a stand of pines, a grove of maples)
      let k = keep.get(t.clump); if (k === undefined) { k = rnd() < keepShare; keep.set(t.clump, k); share.set(t.clump, Math.max(0, Math.min(1, mix.conifers + (rnd() - 0.5) * 0.7))); }
      if (!k || !inLand(t.x, t.y)) continue;
      const sp = species(null, false, desert, { ...mix, conifers: share.get(t.clump)! }, r, 1), grow = t.scale / Math.max(0.01, ownerSize(t.id));
      out.push({ x: t.x, y: t.y, id: sp.id, scale: r2(sp.scale * grow), src: 'frame', hole: h.n }); placed.add(t.x, t.y); framed++;
    }
  }
  // the backdrop: trees behind each green, in an arc round the way the hole runs on past its pin
  if (style.backdrop > 0 && style.frame > 0) for (const h of spec.holes) {
    const line = lineOfPlay(h, ox, oy), pin = line[line.length - 1]!, prev = line[line.length - 2] ?? pin;
    const dl = Math.hypot(pin.x - prev.x, pin.y - prev.y) || 1, a0 = Math.atan2((pin.y - prev.y) / dl, (pin.x - prev.x) / dl);
    const r = mulberry(hash2(seed ^ 0x6b4c, h.n)), want = Math.round(style.backdrop * density);
    let n = 0;
    for (let tries = 0; tries < want * 24 && n < want; tries++) {
      const a = a0 + (r() * 2 - 1) * R.backArc, d = R.backNear + r() * (R.backFar - R.backNear), x = pin.x + Math.cos(a) * d, y = pin.y + Math.sin(a) * d;
      if (!free(x, y, R.playClear * 0.8) || waterNear(x, y) || placed.near(x, y, R.treeMin)) continue;
      const sp = species(null, false, desert, mix, r, R.backSize);
      out.push({ x: r2(x), y: r2(y), id: sp.id, scale: sp.scale, src: 'frame', hole: h.n }); placed.add(x, y); n++; framed++;
    }
  }
  // the budget: past maxAll the frame's trees are thinned evenly (the map's stay)
  const max = opt.max ?? R.maxAll;
  let result = out;
  if (out.length > max) {
    const frame = out.filter(t => t.src === 'frame'), keepFrame = new Set(thin(frame, Math.max(0, max - mapOut.length)));
    result = out.filter(t => t.src === 'map' || keepFrame.has(t)); framed = keepFrame.size; thinned = true;
  }
  return { trees: result, mapped: mapOut.length, mappedAll: spaced.length, framed, thinned };
}

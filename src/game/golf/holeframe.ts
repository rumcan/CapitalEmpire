// Trees frame the holes (T229, #668; docs/art/CONCEPT-LOOK.md step 6, the owner's concept look, 2026-10-27: "every hole is framed by trees"):
// clumps of conifers and autumn broadleaves along the outer edge of a hole's rough, with gaps between them. Where they stand:
//   - the band: just past the edge of the hole's corridor (its cells within FRAME_RULES.corridor of its line of play: a New hole plan's whole
//     footprint, the near part of a hand-painted hole's big rough), on ground that is no playing surface (open land, rough or fescue);
//   - beside a landing zone (the drive's spot, the hole's widest fairway: hole-plan's width rules) the band steps back landingPush further;
//   - never within lineClear of any hole's line of play, nor endClear of a tee or a pin, nor laneClear of a cart lane (the straight drive between
//     a green and the next tee, the clubhouse and the first tee, the last green and the clubhouse: T213's carts drive it where there is no path);
//   - where the host allows a tree (your land; no water, path, road, car park, building, prop or planted tree near: FrameSite.ok).
// The clumps are 3 to 9 trees, each tree within `link` of one of its clump's trees and every tree at least `gap` from any tree of another
// clump, so a clump is a group and there is a gap between two. Deterministic from the hole's seed. Pure TS, no DOM; units are tiles (2 m).
import { mulberry } from '../iso';
import { CELL_T, SURF } from '../ext/course-grid';
import { FOREST_BROADLEAF, FOREST_CONIFERS, dealTree, ownerSize, treeDeal, type TreeSpecies } from '../forest';
import { TILE_M } from './types';

export interface Pt { x: number; y: number }

/** the frame's rules (tiles unless named): see the file's head */
export const FRAME_RULES = {
  /** a hole's corridor: its cells within this of its line of play (a planned hole's rough reaches at most 17.5) */
  corridor: 20,
  /** the band: the trunks stand this far past the corridor's last cell, and no farther than bandOut (deep enough for two or three rows: the
   *  woods the concept lines its fairways with, T229 tuning) */
  bandIn: 1.25, bandOut: 9,
  /** beside a landing zone the band steps back this much further; a landing zone runs landingHalfM metres either side of its spot */
  landingPush: 6, landingHalfM: 40,
  /** the least distance from any hole's line of play, from a tee or a pin, and from a cart lane's centre */
  lineClear: 14, endClear: 14, laneClear: 5,
  /** two trees at least treeMin apart; a clump's next tree within link of one of its trees; two clumps' trees at least gap apart */
  treeMin: 2.6, link: 4.2, gap: 6,
  /** clump seeds at least this far apart, and this share of them left out (the wider gaps: the views) */
  clumpSpacing: 11, skip: 0.06,
  /** a tree at the band's back stands up to this much bigger than one at its front (the woods behind the first row) */
  backGrow: 0.2,
  /** the trees in a clump */
  min: 3, max: 9,
} as const;
export type FrameRules = typeof FRAME_RULES;

/** what a frame tree costs ($): the plant brush is free and the Props tool's ornamental maple $300; the frame's young nursery trees come by the
 *  hundred at a fifth of that: a 340 m par 4's woods (about 150 trees) cost about half its seeded surfaces, an eighth of them sodded */
export const FRAME_TREE_PRICE = 60;
/** the Props tool's catalogue key a frame tree carries (golf/decor.ts: its name, its price, its appeal, half back when bulldozed) */
export const FRAME_TREE_KEY = 'tree-frame';
/** the price of n frame trees ($) */
export const framePrice = (n: number, unit = FRAME_TREE_PRICE): number => Math.max(0, n) * unit;

/** the frame's trees: the live conifers and the autumn broadleaves, in leaf (a patchy or near-bare tree reads as winter or sickly in a wood, not
 *  the concept's October) */
const inLeaf = (sp: readonly TreeSpecies[]): TreeSpecies[] => sp.filter(s => !s.dead).map(s => ({ ...s, ids: s.ids.filter(id => !/near-bare|patchy/.test(id)) })).filter(s => s.ids.length);
export const FRAME_CONIFER_DEAL = treeDeal(inLeaf(FOREST_CONIFERS)), FRAME_BROAD_DEAL = treeDeal(inLeaf(FOREST_BROADLEAF));
/** every library id a frame can plant (the tests hold it to the library's trees) */
export const FRAME_TREE_IDS: readonly string[] = [...FRAME_CONIFER_DEAL.ids, ...FRAME_BROAD_DEAL.ids];
/** the conifer ids among them */
export const FRAME_CONIFER_IDS: ReadonlySet<string> = new Set(FRAME_CONIFER_DEAL.ids);

/** the course grid as the frame reads it: its origin (tiles) and size (cells), and each cell's surface and hole (the New hole ghost passes the
 *  grid as its Build would leave it) */
export interface FrameGrid { x0: number; y0: number; w: number; h: number; surf(i: number): number; hole(i: number): number }
/** what the frame of one hole is worked out from */
export interface FrameSite {
  hole: number;
  /** the hole's seed (a plan's swell seed; the wizard's planSeed for a hole painted by hand) */
  seed: number;
  grid: FrameGrid;
  /** the hole's line of play: the back tee, the aim points, the pin */
  line: readonly Pt[];
  /** the other holes' lines of play */
  others: readonly (readonly Pt[])[];
  /** the cart lanes (see the file's head) */
  lanes: readonly (readonly [Pt, Pt])[];
  /** the landing spots, metres from the back tee along the line (missing: landingSpots of its length) */
  landings?: readonly number[];
  /** whether a tree may stand at (x, y) as the map has it now (the host's checks: see the file's head) */
  ok(x: number, y: number): boolean;
}
/** a frame tree: its point, the library id, its size and its clump */
export interface FrameTree { x: number; y: number; id: string; scale: number; clump: number }

/** the par of a hole of m metres (holes.ts parFromLength) */
const parOf = (m: number): 3 | 4 | 5 => (m <= 230 ? 3 : m <= 430 ? 4 : 5);
/** the landing spots of a hole of lengthM metres, metres from the back tee (hole-plan defaultPlan's stations): none on a par 3; the drive's on a
 *  par 4; the drive's and the second shot's on a par 5. widths (a plan's width handles): its widest stations between narrower ones instead */
export function landingSpots(lengthM: number, widths?: readonly { s: number; w: number }[]): number[] {
  if (widths && widths.length >= 3) {
    const out: number[] = [];
    for (let i = 1; i + 1 < widths.length; i++) if (widths[i]!.w > widths[i - 1]!.w && widths[i]!.w >= widths[i + 1]!.w) out.push(widths[i]!.s);
    if (out.length) return out;
  }
  const par = parOf(lengthM);
  if (par === 3) return [];
  if (par === 4) { const fw = Math.min(100, Math.max(30, lengthM - 90)); return [Math.min(210, Math.round(fw + (lengthM - 13 - fw) * 0.55))]; }
  return [210, Math.min(390, lengthM - 60)];
}

/** the nearest point of polyline `line` to (x, y): its distance and how far along the line it is (tiles) */
export function project(line: readonly Pt[], x: number, y: number): { d: number; s: number } {
  let best = Infinity, bs = 0, acc = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!, b = line[i + 1]!, dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, L = Math.sqrt(l2);
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
    const d = Math.hypot(x - a.x - dx * t, y - a.y - dy * t);
    if (d < best) { best = d; bs = acc + t * L; }
    acc += L;
  }
  if (line.length === 1) best = Math.hypot(x - line[0]!.x, y - line[0]!.y);
  return { d: best, s: bs };
}
/** the distance from (x, y) to segment a b */
function segDist(x: number, y: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
  return Math.hypot(x - a.x - dx * t, y - a.y - dy * t);
}
const lineLen = (l: readonly Pt[]) => { let L = 0; for (let i = 1; i < l.length; i++) L += Math.hypot(l[i]!.x - l[i - 1]!.x, l[i]!.y - l[i - 1]!.y); return L; };

/** the hole's corridor, worked out once: the window of the grid round it (cells), the corridor's cells (foot), each cell's distance from them
 *  (cells), whether it is outside the corridor (reached from the window's edge), and the landing zones (tiles along the line) */
interface Field { cx0: number; cy0: number; w: number; h: number; foot: Uint8Array; dist: Float32Array; outside: Uint8Array; landings: number[] }

/** a playing surface: no frame tree stands on one (open land, rough and fescue may hold one) */
const playing = (s: number) => s !== SURF.none && s !== SURF.rough && s !== SURF.fescue;

function field(site: FrameSite, R: FrameRules): Field | null {
  const { grid: g, line, hole: n } = site;
  if (line.length < 2 || g.w <= 0 || g.h <= 0) return null;
  const reach = R.corridor + R.bandOut + R.landingPush + 2;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of line) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const cx0 = Math.max(0, Math.floor((x0 - reach - g.x0) / CELL_T)), cx1 = Math.min(g.w - 1, Math.floor((x1 + reach - g.x0) / CELL_T));
  const cy0 = Math.max(0, Math.floor((y0 - reach - g.y0) / CELL_T)), cy1 = Math.min(g.h - 1, Math.floor((y1 + reach - g.y0) / CELL_T));
  const w = cx1 - cx0 + 1, h = cy1 - cy0 + 1; if (w <= 0 || h <= 0) return null;
  const foot = new Uint8Array(w * h), dist = new Float32Array(w * h).fill(1e9);
  let any = false;
  for (let j = 0; j < h; j++) {
    const y = g.y0 + (cy0 + j + 0.5) * CELL_T;
    for (let k = 0; k < w; k++) {
      const i = (cy0 + j) * g.w + cx0 + k;
      if (g.hole(i) !== n || g.surf(i) === SURF.none) continue;
      const x = g.x0 + (cx0 + k + 0.5) * CELL_T;
      if (project(line, x, y).d > R.corridor) continue;
      foot[j * w + k] = 1; dist[j * w + k] = 0; any = true;
    }
  }
  if (!any) return null;
  // the distance from the corridor (cells): a two-pass chamfer (1, √2)
  const D = Math.SQRT2;
  for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) {
    const q = j * w + k; let d = dist[q]!;
    if (k > 0) d = Math.min(d, dist[q - 1]! + 1);
    if (j > 0) { d = Math.min(d, dist[q - w]! + 1); if (k > 0) d = Math.min(d, dist[q - w - 1]! + D); if (k + 1 < w) d = Math.min(d, dist[q - w + 1]! + D); }
    dist[q] = d;
  }
  for (let j = h - 1; j >= 0; j--) for (let k = w - 1; k >= 0; k--) {
    const q = j * w + k; let d = dist[q]!;
    if (k + 1 < w) d = Math.min(d, dist[q + 1]! + 1);
    if (j + 1 < h) { d = Math.min(d, dist[q + w]! + 1); if (k + 1 < w) d = Math.min(d, dist[q + w + 1]! + D); if (k > 0) d = Math.min(d, dist[q + w - 1]! + D); }
    dist[q] = d;
  }
  // outside: reached from the window's edge without crossing the corridor (a gap inside it, a rubbed-out patch, is not its edge)
  const outside = new Uint8Array(w * h), queue = new Int32Array(w * h); let qh = 0, qt = 0;
  const seed = (q: number) => { if (!foot[q] && !outside[q]) { outside[q] = 1; queue[qt++] = q; } };
  for (let k = 0; k < w; k++) { seed(k); seed((h - 1) * w + k); }
  for (let j = 0; j < h; j++) { seed(j * w); seed(j * w + w - 1); }
  while (qh < qt) {
    const q = queue[qh++]!, k = q % w, j = (q - k) / w;
    if (k > 0) seed(q - 1); if (k + 1 < w) seed(q + 1); if (j > 0) seed(q - w); if (j + 1 < h) seed(q + w);
  }
  const L = lineLen(line), landings = (site.landings ?? landingSpots(L * TILE_M)).map(m => m / TILE_M);
  return { cx0, cy0, w, h, foot, dist, outside, landings };
}

/** the checks of a point against the field and the lines (not the host's): 0 fine, else why not (for the tests and the stale check) */
function spotWhy(site: FrameSite, f: Field, R: FrameRules, x: number, y: number, band: boolean): string {
  const g = site.grid, cx = Math.floor((x - g.x0) / CELL_T), cy = Math.floor((y - g.y0) / CELL_T), k = cx - f.cx0, j = cy - f.cy0;
  if (k < 0 || j < 0 || k >= f.w || j >= f.h) return 'off';
  const q = j * f.w + k, i = cy * g.w + cx;
  if (f.foot[q] || !f.outside[q]) return 'corridor';
  if (playing(g.surf(i))) return 'surface';
  const own = project(site.line, x, y);
  if (own.d < R.lineClear) return 'line';
  if (band) {
    const push = f.landings.some(s => Math.abs(own.s - s) <= R.landingHalfM / TILE_M) ? R.landingPush : 0, d = f.dist[q]! * CELL_T;
    if (d < R.bandIn + push) return 'near';
    if (d > R.bandOut + push) return 'far';
  }
  for (const l of site.others) if (l.length > 1 && project(l, x, y).d < R.lineClear) return 'line';
  for (const l of [site.line, ...site.others]) for (const e of l.length ? [l[0]!, l[l.length - 1]!] : []) if (Math.hypot(x - e.x, y - e.y) < R.endClear) return 'end';
  for (const [a, b] of site.lanes) if (segDist(x, y, a, b) < R.laneClear) return 'lane';
  return '';
}

/** why a frame tree may not stand at (x, y) on this site ('' when it may): the band, the lines, the ends and the lanes, then the host's ok. For
 *  the tests and the map's refusals */
export function frameWhy(site: FrameSite, x: number, y: number, rules: FrameRules = FRAME_RULES): string {
  const f = field(site, rules); if (!f) return 'no hole';
  return spotWhy(site, f, rules, x, y, true) || (site.ok(x, y) ? '' : 'host');
}

/** the frame of a hole (see the file's head): its trees, in clump order. keep: the hole's frame trees already planted (their points); the ones
 *  that still stand well (off the corridor and any playing surface, clear of the lines, the ends and the lanes) are kept and a new clump that
 *  would come within `gap` of one is left out, so framing a hole again never doubles its trees; stale lists the others (out of play now: the
 *  hole was edited). site.ok should not count keep's trees (they are the hole's own) */
export function frameHole(site: FrameSite, keep: readonly Pt[] = [], rules: FrameRules = FRAME_RULES): { trees: FrameTree[]; stale: number[] } {
  const R = rules, f = field(site, R);
  if (!f) return { trees: [], stale: keep.map((_, i) => i) };
  const stale: number[] = [], kept: Pt[] = [];
  keep.forEach((p, i) => { const w = spotWhy(site, f, R, p.x, p.y, false); if (w && w !== 'off') stale.push(i); else kept.push(p); }); // off the window: far from the hole, not in its play
  const g = site.grid, rnd = mulberry(Math.imul(site.seed | 0, 0x9e3779b1) ^ (site.hole * 0x85ebca6b) ^ 0x7f4a7c15);
  const ok = (x: number, y: number) => !spotWhy(site, f, R, x, y, true) && site.ok(x, y);
  // the band's cells (the cheap checks), in a seeded order
  const cand: number[] = [];
  for (let j = 0; j < f.h; j++) for (let k = 0; k < f.w; k++) {
    const q = j * f.w + k; if (!f.outside[q] || f.foot[q]) continue;
    const d = f.dist[q]! * CELL_T; if (d < R.bandIn || d > R.bandOut + R.landingPush) continue;
    if (playing(g.surf((f.cy0 + j) * g.w + f.cx0 + k))) continue;
    cand.push(q);
  }
  for (let i = cand.length - 1; i > 0; i--) { const r = Math.floor(rnd() * (i + 1)), t = cand[i]!; cand[i] = cand[r]!; cand[r] = t; }
  // the clump seeds: at least clumpSpacing apart; a share left out (the decision is drawn for every seed, so the stream stays put)
  const seeds: Pt[] = [], s2 = R.clumpSpacing * R.clumpSpacing;
  for (const q of cand) {
    const k = q % f.w, j = (q - k) / f.w, x = g.x0 + (f.cx0 + k + 0.5) * CELL_T, y = g.y0 + (f.cy0 + j + 0.5) * CELL_T;
    if (seeds.some(s => (s.x - x) ** 2 + (s.y - y) ** 2 < s2)) continue;
    if (!ok(x, y)) continue;
    seeds.push({ x, y });
  }
  const leave = seeds.map(() => rnd() < R.skip);
  // grow each clump from its seed: each tree within link of one of its clump's trees, treeMin from every tree, gap from every other clump's
  const trees: (Pt & { clump: number })[] = [], g2 = R.gap * R.gap, m2 = R.treeMin * R.treeMin;
  const farFrom = (x: number, y: number, pts: readonly Pt[], r2: number) => pts.every(p => (p.x - x) ** 2 + (p.y - y) ** 2 >= r2);
  let clumps = 0;
  seeds.forEach((s, c) => {
    const target = R.min + Math.floor(rnd() ** 1.1 * (R.max - R.min + 1)), tries = target * 16;
    if (leave[c]) return;
    if (!farFrom(s.x, s.y, trees, g2)) return;
    const mine: Pt[] = [s];
    for (let a = 0; a < tries && mine.length < Math.min(target, R.max); a++) {
      const b = mine[Math.floor(rnd() * mine.length)]!, ang = rnd() * Math.PI * 2, r = R.treeMin + rnd() * (R.link - R.treeMin);
      const x = Math.round((b.x + Math.cos(ang) * r) * 100) / 100, y = Math.round((b.y + Math.sin(ang) * r) * 100) / 100; // the points as the trees keep them
      if (!farFrom(x, y, mine, m2) || !farFrom(x, y, trees, g2) || !ok(x, y)) continue;
      mine.push({ x, y });
    }
    if (mine.length < R.min) return;
    for (const p of mine) trees.push({ x: p.x, y: p.y, clump: clumps });
    clumps++;
  });
  // the trees: each clump its own mix of conifers and autumn broadleaves (a stand of spruce, a maple grove), sized as the town's trees and
  // bigger towards the band's back (backGrow), so the first row reads against the woods behind it
  const depth = (x: number, y: number) => { const k = Math.floor((x - g.x0) / CELL_T) - f.cx0, j = Math.floor((y - g.y0) / CELL_T) - f.cy0; return k < 0 || j < 0 || k >= f.w || j >= f.h ? 0 : f.dist[j * f.w + k]! * CELL_T; };
  const back = (x: number, y: number) => Math.max(0, Math.min(1, (depth(x, y) - R.bandIn) / Math.max(1, R.bandOut - R.bandIn)));
  const pick = mulberry(Math.imul(site.seed | 0, 0x27d4eb2f) ^ (site.hole * 0x165667b1) ^ 0x3c6ef372);
  const share = Array.from({ length: clumps }, () => 0.2 + 0.6 * pick());
  const out: FrameTree[] = trees.map(t => {
    const id = pick() < share[t.clump]! ? dealTree(FRAME_CONIFER_DEAL, pick()) : dealTree(FRAME_BROAD_DEAL, pick());
    const scale = Math.round(ownerSize(id) * (0.9 + 0.25 * pick()) * (1 + R.backGrow * back(t.x, t.y)) * 100) / 100;
    return { x: Math.round(t.x * 100) / 100, y: Math.round(t.y * 100) / 100, id, scale, clump: t.clump };
  });
  // the frame as a fresh one would be (the kept trees play no part in it, so it is the same frame every time), less every clump that comes
  // within gap of a kept tree: an unchanged hole adds nothing, a bulldozed clump comes back, an edited hole fills only its new stretches
  if (!kept.length) return { trees: out, stale };
  const near = new Set<number>(); for (const t of out) if (!near.has(t.clump) && !farFrom(t.x, t.y, kept, g2)) near.add(t.clump);
  return { trees: out.filter(t => !near.has(t.clump)), stale };
}

/** the clumps of a set of trees as single-linkage groups: two trees within `link` share a group (the tests check that a frame's clumps are its
 *  groups at its gap: 3 to 9 trees, a gap between two) */
export function clumpsOf(pts: readonly Pt[], link: number): number[][] {
  const parent = pts.map((_, i) => i), find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y) < link) parent[find(i)] = find(j);
  const by = new Map<number, number[]>();
  pts.forEach((_, i) => { const r = find(i); let l = by.get(r); if (!l) by.set(r, l = []); l.push(i); });
  return [...by.values()];
}

/** the cart lanes of a course (see the file's head) from its holes' back tees and pins, by number, and the clubhouse: green n to tee n+1, the
 *  clubhouse to the first tee and the last green to the clubhouse */
export function cartLanes(holes: readonly { hole: number; tee: Pt; pin: Pt }[], home?: Pt | null): [Pt, Pt][] {
  const hs = [...holes].sort((a, b) => a.hole - b.hole), out: [Pt, Pt][] = [];
  for (let i = 0; i + 1 < hs.length; i++) out.push([hs[i]!.pin, hs[i + 1]!.tee]);
  if (home && hs.length) { out.push([home, hs[0]!.tee]); out.push([hs[hs.length - 1]!.pin, home]); }
  return out;
}

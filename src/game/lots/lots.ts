// Parcels: the frontage lots along every road. Pure TS, no DOM.
// A lot is an oriented rectangle fronting one side of a road seg (a Cities: Skylines zone cell, not a face of the road graph).
// Along-road positions sit on a global lattice, so a split road keeps its lots; the depth stops short of other roads, and
// lots on bad terrain are dropped. Overlaps are settled by priority (road order, then seg length, then key).
// A block (blocks.ts) that a grid of fences can cut is filled with its block lots (blocklots.ts) first; the frontage lots clash with them.
import { MAP } from '../iso';
import { Grid, SK, dot, mul, perp, sub, unionBox, vlen, type BBox, type Node, type Pt, type RoadClass, type RoadNetwork, type Seg } from '../network';
import { TC } from '../terrain/types';
import { BLOCK_MAX_AREA, enclosedBlocks, type Block } from '../blocks';
import { blockLots, inBlock, type BlockCut } from './blocklots';

export interface Lot {
  key: string; id: number;
  /** frontage seg, side of it, the lot's frame: origin (front-left corner at the verge edge, tiles), along u, away n */
  seg: Seg; side: 1 | -1; o: Pt; u: Pt; n: Pt; w: number; d: number;
  /** road class id of the frontage, the frontage midpoint (tiles, at the verge edge) and the lot centre */
  cls: string; front: Pt; c: Pt;
  /** a corner lot: within W of a junction reach */
  corner: boolean;
}

/** frontage width and depth by road class, tiles */
/** the town's street lattice (roads.ts BLOCK) and the half width kept free of lots around its points, tiles */
export const BRANCH = 40, RESERVE = 4;
const SIZE: Record<string, [number, number]> = { gravel: [8, 15], lane: [8, 15], street: [8, 15], road: [10, 16], avenue: [12, 18], arterial: [13, 19], boulevard: [16, 20], six: [13, 19], grand: [16, 20], divided: [10, 16] };
/** the shallowest lot kept; the clearance added to another road's h + walk; the share of bad terrain allowed; the overlap tolerance */
const MIN_D = 6, CLEAR = 0.5, TOL = 0.25;
/** the share of a lot's samples allowed on bad terrain (exported for the block lots) */
export const BAD_MAX = 0.1;
/** how far past a lot's half diagonal a ring's node can be and its circle still reach the lot (the biggest ring's clearance is about 22) */
const RING_NEAR = 26;
/** how far a lot can reach from its seg (its depth plus the verge), and how far an edit's recompute scope reaches past its box */
const REACH = 27, SCOPE = 2 * REACH;
/** the spatial grid's cell, tiles */
const CELL = 32;
/** how far past an edit's scope the block face walk reads segs: a block that touches the scope is at most ~70 tiles across with its sides, and 100 leaves the walk's faces exact there */
const BLOCK_REACH = 100;
/** the most block cuts kept at once (each is a few dozen cells); past it the cache starts again */
const CUT_CAP = 4000;

const hund = (v: number) => Math.round(v * 100);
const isBad = (c: number) => c === TC.HILL || c === TC.WATER || c === TC.CREEK || c === TC.BANK;
const isJunction = (n: Node) => n.arms.length >= 3 || (n.type === 'roundabout' && n.arms.length >= 2);
/** how far a seg's usable span is cut back at one end: a junction's reach, a dead end's bulb, else nothing */
function endReach(n: Node, cls: RoadClass): number {
  if (isJunction(n)) { let m = 0; for (const a of n.arms) m = Math.max(m, a.h + a.walk); return m + 2 + (n.type === 'roundabout' ? n.rb : 0); }
  return n.arms.length === 1 ? cls.h + cls.bulb + cls.walk : 0;
}
const segLen = (s: Seg) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
function segBox(s: Seg): BBox { return [Math.min(s.a.x, s.b.x), Math.min(s.a.y, s.b.y), Math.max(s.a.x, s.b.x), Math.max(s.a.y, s.b.y)]; }
const touches = (b: BBox, z: BBox) => b[0] <= z[2] && b[2] >= z[0] && b[1] <= z[3] && b[3] >= z[1];
/** the same tests without an array: does a seg's box (or a lot's rectangle) touch a box (the update scan runs them on every lot) */
const segTouches = (s: Seg, z: BBox) => Math.min(s.a.x, s.b.x) <= z[2] && Math.max(s.a.x, s.b.x) >= z[0] && Math.min(s.a.y, s.b.y) <= z[3] && Math.max(s.a.y, s.b.y) >= z[1];
const lotTouches = (l: Lot, z: BBox) => { const ax = l.o.x + l.u.x * l.w, ay = l.o.y + l.u.y * l.w, bx = l.o.x + l.n.x * l.d, by = l.o.y + l.n.y * l.d, cx = ax + l.n.x * l.d, cy = ay + l.n.y * l.d; return Math.min(l.o.x, ax, bx, cx) <= z[2] && Math.max(l.o.x, ax, bx, cx) >= z[0] && Math.min(l.o.y, ay, by, cy) <= z[3] && Math.max(l.o.y, ay, by, cy) >= z[1]; };
const pad = (b: BBox, p: number): BBox => [b[0] - p, b[1] - p, b[2] + p, b[3] + p];
/** the box of a lot's rectangle (origin o, along u, away n, w by d) */
function rectBox(o: Pt, u: Pt, n: Pt, w: number, d: number): BBox {
  const ax = o.x + u.x * w, ay = o.y + u.y * w, bx = o.x + n.x * d, by = o.y + n.y * d, cx = ax + n.x * d, cy = ay + n.y * d;
  return [Math.min(o.x, ax, bx, cx), Math.min(o.y, ay, by, cy), Math.max(o.x, ax, bx, cx), Math.max(o.y, ay, by, cy)];
}
const boxOf = (l: Lot) => rectBox(l.o, l.u, l.n, l.w, l.d);
/** the box of a block's outline (its corners) */
function blockBox(b: Block): BBox { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i < b.pts.length; i += 2) { x0 = Math.min(x0, b.pts[i]!); y0 = Math.min(y0, b.pts[i + 1]!); x1 = Math.max(x1, b.pts[i]!); y1 = Math.max(y1, b.pts[i + 1]!); } return [x0, y0, x1, y1]; }
/** the rectangle's three corners that define it (origin, far along, far away): equal rounded corners mean the same rectangle */
function sameRect(p: Lot, q: Lot): boolean {
  if (p.w !== q.w || p.d !== q.d) return false;
  const c = (l: Lot) => [l.o.x, l.o.y, l.o.x + l.u.x * l.w, l.o.y + l.u.y * l.w, l.o.x + l.n.x * l.d, l.o.y + l.n.y * l.d];
  const a = c(p), b = c(q);
  return a.every((v, i) => hund(v) === hund(b[i]));
}
/** the separating-axis test on the four axes of two oriented rectangles: overlap only if the penetration exceeds TOL on every axis */
function gapOn(ax: Pt, p: Lot, q: Lot, dx: number, dy: number): boolean {
  const reach = Math.abs(dot(p.u, ax)) * p.w / 2 + Math.abs(dot(p.n, ax)) * p.d / 2 + Math.abs(dot(q.u, ax)) * q.w / 2 + Math.abs(dot(q.n, ax)) * q.d / 2;
  return Math.abs(dx * ax.x + dy * ax.y) >= reach - TOL;
}
function overlaps(p: Lot, q: Lot): boolean {
  const dx = q.c.x - p.c.x, dy = q.c.y - p.c.y;
  return !(gapOn(p.u, p, q, dx, dy) || gapOn(p.n, p, q, dx, dy) || gapOn(q.u, p, q, dx, dy) || gapOn(q.n, p, q, dx, dy));
}
/** priority: higher road order first, then the longer seg, then the smaller key */
const prio = (p: Lot, q: Lot) => (q.seg.cls.order - p.seg.cls.order) || (segLen(q.seg) - segLen(p.seg)) || (p.key < q.key ? -1 : p.key > q.key ? 1 : 0);

// scratch for one candidate's blockers (the other segs near its box, with their clearance, and the rings near it)
const near: Seg[] = [], nearThr: number[] = [], rings: Node[] = [], ringR: number[] = [];
/** the clearance of a roundabout's (or a mini's) circle: its edge, the widest arm's walk, and CLEAR (0 for any other node) */
export const ringClear = (n: Node) => (n.rb > 0 ? n.rb + Math.max(0, ...n.arms.map(a => a.walk)) + CLEAR : 0);
/** collect the other segs whose clearance band reaches the lot's rectangle, and the rings (at the ends of those segs or of s) whose
 *  circle does (a ring grown to more lanes reached into the lots of the roads around it: the owner's 3-lane ring, 2026-10-19) */
function blockers(net: RoadNetwork, s: Seg, o: Pt, u: Pt, n: Pt, W: number, D: number) {
  near.length = 0; nearThr.length = 0; rings.length = 0; ringR.length = 0;
  const box = rectBox(o, u, n, W, D), cx = o.x + u.x * W / 2 + n.x * D / 2, cy = o.y + u.y * W / 2 + n.y * D / 2;
  const ring = (nd: Node) => { const r = ringClear(nd); if (r > 0 && !rings.includes(nd) && touches([nd.x, nd.y, nd.x, nd.y], pad(box, r))) { rings.push(nd); ringR.push(r); } };
  ring(s.a); ring(s.b);
  for (const s2 of net.segsNear({ x: cx, y: cy }, Math.hypot(W, D) / 2 + RING_NEAR)) { ring(s2.a); ring(s2.b); }
  for (const s2 of net.segsNear({ x: cx, y: cy }, Math.hypot(W, D) / 2 + 7)) {
    if (s2 === s) continue;
    const thr = s2.cls.h + s2.cls.walk + CLEAR;
    if (touches(segBox(s2), pad(box, thr))) { near.push(s2); nearThr.push(thr); }
  }
}
/** whether a lot's rectangle reaches into the circle (its clearance, ringClear) of a roundabout or a mini near it: the circle's centre
 *  clamped into the lot's own frame is within its radius */
function inRing(net: RoadNetwork, l: Lot): boolean {
  for (const s of net.segsNear(l.c, Math.hypot(l.w, l.d) / 2 + RING_NEAR)) for (const nd of [s.a, s.b]) {
    const r = ringClear(nd); if (!(r > 0)) continue;
    const v = sub(nd, l.o), a = Math.min(l.w, Math.max(0, dot(v, l.u))), b = Math.min(l.d, Math.max(0, dot(v, l.n)));
    const px = l.o.x + l.u.x * a + l.n.x * b - nd.x, py = l.o.y + l.u.y * a + l.n.y * b - nd.y;
    if (px * px + py * py < r * r) return true;
  }
  return false;
}
/** is (px, py) within a blocker's clearance (a seg's band or a ring's circle) */
function blocked(px: number, py: number): boolean {
  for (let m = 0; m < rings.length; m++) { const dx = px - rings[m]!.x, dy = py - rings[m]!.y, r = ringR[m]!; if (dx * dx + dy * dy <= r * r) return true; }
  for (let m = 0; m < near.length; m++) {
    const a = near[m].a, b = near[m].b, dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = a.x + dx * t - px, ey = a.y + dy * t - py, r = nearThr[m];
    if (ex * ex + ey * ey <= r * r) return true;
  }
  return false;
}
/** the lot's depth: D, cut to the row before the first sample row (1-tile grid, corners included) that a blocker reaches */
function depthOf(o: Pt, u: Pt, n: Pt, W: number, D: number): number {
  for (let j = 0; j <= D; j++) for (let i = 0; i <= W; i++) if (blocked(o.x + u.x * i + n.x * j, o.y + u.y * i + n.y * j)) return j - 1;
  return D;
}
/** the share of a lot's samples (depth d) on HILL, WATER, CREEK, BANK or off the map (exported for the block lots) */
export function badShare(terr: Uint8Array, o: Pt, u: Pt, n: Pt, W: number, d: number): number {
  let bad = 0;
  for (let j = 0; j <= d; j++) for (let i = 0; i <= W; i++) {
    const x = Math.floor(o.x + u.x * i + n.x * j), y = Math.floor(o.y + u.y * i + n.y * j);
    if (x < 0 || y < 0 || x >= MAP || y >= MAP || isBad(terr[y * MAP + x])) bad++;
  }
  return bad / ((W + 1) * (d + 1));
}
/** the first t >= 0 at which the ray p + n t reaches within R of the seg a-b (0 if p is already within; Infinity if never) */
function bandHit(px: number, py: number, nx: number, ny: number, a: Pt, b: Pt, R: number): number {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
  const ex = L > 1e-9 ? dx / L : 1, ey = L > 1e-9 ? dy / L : 0;
  const along = Math.max(0, Math.min(L, (px - a.x) * ex + (py - a.y) * ey));
  if (Math.hypot(a.x + ex * along - px, a.y + ey * along - py) <= R) return 0;
  let best = Infinity;
  // the two flat sides: the seg offset by +-R along its normal (-ey, ex), hit within the seg's span
  const mx = -ey * R, my = ex * R, det = ex * ny - nx * ey;
  if (Math.abs(det) > 1e-12) for (const sg of [1, -1]) {
    const qx = a.x + mx * sg - px, qy = a.y + my * sg - py;
    const t = (ex * qy - qx * ey) / det, s = (nx * qy - ny * qx) / det;
    if (t >= 0 && s >= 0 && s <= L && t < best) best = t;
  }
  // the two round ends, on the outer half of each
  for (const [c, sign] of [[a, -1], [b, 1]] as const) {
    const ddx = px - c.x, ddy = py - c.y, dn = ddx * nx + ddy * ny, disc = dn * dn - (ddx * ddx + ddy * ddy - R * R);
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    for (const t of [-dn - sq, -dn + sq]) {
      if (t < 0 || t >= best) continue;
      const qx = ddx + nx * t, qy = ddy + ny * t;
      if (sign * (qx * ex + qy * ey) >= 0) best = t;
    }
  }
  return best;
}
/** the clear distance from a verge point p along n to the nearest other seg's verge within reach (Infinity if none) */
/** no road behind a lot's frontage midpoint within OPEN_REACH tiles (wider than a 40-tile block): open land the town may branch into */
function openBehind(net: RoadNetwork, s: Seg, p: Pt, n: Pt): boolean {
  const list = [...net.segsNear({ x: p.x + n.x * OPEN_REACH / 2, y: p.y + n.y * OPEN_REACH / 2 }, OPEN_REACH / 2 + 8)];
  return clearAlong(list, s, p, n, OPEN_REACH) === Infinity;
}
const OPEN_REACH = 45;
function clearAlong(list: Seg[], s: Seg, p: Pt, n: Pt, reach: number): number {
  const x1 = p.x + n.x * reach, y1 = p.y + n.y * reach, x0min = Math.min(p.x, x1), x1max = Math.max(p.x, x1), y0min = Math.min(p.y, y1), y1max = Math.max(p.y, y1);
  let best = Infinity;
  for (const s2 of list) {
    if (s2 === s) continue;
    const R = s2.cls.h + s2.cls.walk;
    if (Math.max(s2.a.x, s2.b.x) < x0min - R || Math.min(s2.a.x, s2.b.x) > x1max + R || Math.max(s2.a.y, s2.b.y) < y0min - R || Math.min(s2.a.y, s2.b.y) > y1max + R) continue;
    const t = bandHit(p.x, p.y, n.x, n.y, s2.a, s2.b, R);
    if (t < best) best = t;
  }
  return best;
}
/** the candidate lots of one seg, both sides, on the global lattice that its usable span covers */
function segLots(net: RoadNetwork, s: Seg, terr: Uint8Array | null, out: Lot[], skip?: (x: number, y: number) => boolean) {
  if (s.kind !== SK.GROUND) return;
  const dv = sub(s.b, s.a), L = vlen(dv); if (L < 1e-6) return;
  const u = mul(dv, 1 / L), pu = perp(u), cls = s.cls, [W, D] = SIZE[cls.base], r0 = cls.h + cls.walk;
  const t0 = dot(s.a, u), t1 = dot(s.b, u), ra = endReach(s.a, cls), rb = endReach(s.b, cls);
  const kLo = Math.ceil((t0 + ra) / W - 1e-9), kHi = Math.floor((t1 - rb) / W + 1e-9) - 1;
  if (kHi < kLo) return;
  // the foot of the origin on the line: the same for every piece of the line, so it keys a lot across splits
  const f = sub(s.a, mul(u, t0)), kp = `${hund(f.x)},${hund(f.y)}|${Math.round(u.x * 1000)},${Math.round(u.y * 1000)}|`;
  const ja = isJunction(s.a), jb = isJunction(s.b);
  // the segs that can lie behind this seg's lots within the midline reach (2 D covers any cap that binds)
  const reach = 2 * D + r0 + 1, mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
  const list = [...net.segsNear(mid, L / 2 + reach + 8)];
  for (const side of [1, -1] as const) {
    const n = mul(pu, side);
    for (let k = kLo; k <= kHi; k++) {
      const lo = k * W, m0 = Math.floor((lo - RESERVE) / BRANCH) + 1, onLattice = m0 * BRANCH < lo + W + RESERVE;
      const o = { x: f.x + u.x * k * W + n.x * r0, y: f.y + u.y * k * W + n.y * r0 };
      // a candidate whose centre lies in a subdivided block is not built: the block's own lots fill it (checked before the costly searches)
      if (skip && skip(o.x + u.x * W / 2 + n.x * D / 2, o.y + u.y * W / 2 + n.y * D / 2)) continue;
      blockers(net, s, o, u, n, W, D);
      // the midline cap: half the clear distance to the verge of the road behind, from the front corners and the midpoint
      const fm = { x: o.x + u.x * W / 2, y: o.y + u.y * W / 2 }, fe = { x: o.x + u.x * W, y: o.y + u.y * W };
      const clear = Math.min(clearAlong(list, s, o, n, reach), clearAlong(list, s, fm, n, reach), clearAlong(list, s, fe, n, reach));
      // keep the side-street points of the town's growth lattice free (roads.ts branches every BRANCH tiles of t): no lot within
      // RESERVE of them where the town could still branch (gravel, or open land behind), so a future street never has to cut
      // through a house; lots of an enclosed block (a road behind) are not held back
      if (onLattice && (cls.id === 'gravel' || openBehind(net, s, fm, n))) continue;
      const d = Math.min(depthOf(o, u, n, W, D), Math.floor(clear / 2));
      if (d < MIN_D || (terr && badShare(terr, o, u, n, W, d) > BAD_MAX)) continue;
      const front = fm, c = { x: front.x + n.x * d / 2, y: front.y + n.y * d / 2 };
      const k0 = k * W, corner = (ja && k0 - t0 < ra + W) || (jb && t1 - (k0 + W) < rb + W);
      out.push({ key: `${kp}${side}|${k}`, id: 0, seg: s, side, o, u, n, w: W, d, cls: cls.id, front, c, corner });
    }
  }
}

/** The parcels of a road network. Call update() after every RoadNetwork.rebuild, with the terrain classes (null = no terrain check). */
export class LotMap {
  /** the lots by key */
  lots = new Map<string, Lot>();
  private grid = new Grid<Lot>(CELL); private hits = new Set<Lot>(); private nextId = 1; private terr: Uint8Array | null = null;
  /** the blocks that carry block lots, by block key: the block's box and its lots' keys (cleared when the scope touches the box) */
  private blocks = new Map<string, { box: BBox; keys: string[] }>();
  /** the cut of each block (blocklots.ts), by block key: cleared with the block, and reset when it grows past CUT_CAP */
  private cuts = new Map<string, BlockCut>();

  /** after net.rebuild: recompute the lots near the edit; returns the keys removed and the lots added (a lot whose key keeps its rectangle keeps its object) */
  update(net: RoadNetwork, terrainCls: Uint8Array | null): { added: Lot[]; removed: string[] } {
    this.terr = terrainCls;
    const added: Lot[] = [], removed: string[] = [];
    // the scope: the box of the edit (the touched nodes, their segs, the lots of the segs that are gone), padded
    let Z: BBox;
    if (net.lastFull || this.lots.size === 0) Z = [-Infinity, -Infinity, Infinity, Infinity];
    else {
      let B: BBox | null = null;
      for (const n of net.lastNodes) { B = unionBox(B, [n.x, n.y, n.x, n.y]); for (const s of n.segs) B = unionBox(B, segBox(s)); }
      for (const l of this.lots.values()) if (!net.segs.has(l.seg)) B = unionBox(B, boxOf(l));
      if (!B) return { added, removed };
      Z = pad(B, SCOPE);
    }
    const Zr = pad(Z, REACH);
    // 1. the lots to replace: those on a seg in scope or on a seg that is gone; lots outside whose box reaches the scope are re-tested as fixed
    const old = new Map<string, Lot>(), fixed: Lot[] = [];
    // the block lots of every recorded block the scope touches (by its old box, so a block that is gone or changed is cleared too)
    for (const [bk, e] of this.blocks) if (touches(e.box, Z)) { for (const k of e.keys) { const l = this.lots.get(k); if (l) old.set(k, l); } this.blocks.delete(bk); this.cuts.delete(bk); }
    for (const l of this.lots.values()) {
      if (old.has(l.key)) continue;
      if (!net.segs.has(l.seg) || segTouches(l.seg, Z)) old.set(l.key, l);
      else if (lotTouches(l, Zr)) { old.set(l.key, l); fixed.push(l); }
    }
    for (const l of old.values()) { this.lots.delete(l.key); this.grid.remove(l); }
    // 2. the block lots first (they win every overlap), then the candidates of the segs in scope and the fixed lots, in priority order
    const items: Lot[] = [], subs: number[][] = [], subBoxes: BBox[] = [];
    // a finite scope reads only the segs near it: a block that touches the scope is at most ~70 tiles across (BLOCK_REACH covers its sides and insets)
    for (const b of enclosedBlocks(net, BLOCK_MAX_AREA, Number.isFinite(Z[0]) ? pad(Z, BLOCK_REACH) : undefined)) {
      const box = blockBox(b); if (!touches(box, Z)) continue;
      const bl = blockLots(net, b, this.terr, this.cuts); if (!bl) continue;
      this.blocks.set(b.key, { box, keys: bl.map(l => l.key) });
      subs.push(b.pts); subBoxes.push(box);
      // a ring grown at a block corner (a junction made a roundabout) reaches into the corner cells: those lots go, as the frontage lots do
      for (const l of bl) if (!inRing(net, l)) items.push(l);
    }
    if (this.cuts.size > CUT_CAP) this.cuts.clear();
    // the frontage candidates and the old frontage lots whose centre lies in a subdivided block are skipped (they would clash with its lots)
    const inSub = (x: number, y: number) => { for (let i = 0; i < subs.length; i++) { const bx = subBoxes[i]!; if (x >= bx[0] && x <= bx[2] && y >= bx[1] && y <= bx[3] && inBlock(subs[i]!, x, y)) return true; } return false; };
    for (const l of fixed) if (l.key.startsWith('blk:') && !inRing(net, l)) items.push(l);
    const rest: Lot[] = [];
    for (const s of net.segs) if (segTouches(s, Z)) segLots(net, s, this.terr, rest, inSub);
    // (a lot kept from outside the scope is re-tested against the rings too: a junction made a roundabout grows a circle into the lots of the
    // roads around it, and a corner lot fronting a side road would otherwise stay standing in the ring)
    for (const l of fixed) if (!l.key.startsWith('blk:') && !inSub(l.c.x, l.c.y) && !inRing(net, l)) rest.push(l);
    rest.sort(prio);
    for (const l of rest) items.push(l);
    // 3. accept in priority order: a lot that overlaps an accepted one is dropped
    for (const c of items) {
      if (this.clashes(c)) continue;
      const prev = old.get(c.key);
      let lot: Lot;
      if (prev && sameRect(prev, c)) { lot = prev; lot.seg = c.seg; lot.corner = c.corner; lot.cls = c.cls; }
      else { lot = c; lot.id = this.nextId++; added.push(lot); }
      this.lots.set(lot.key, lot); this.grid.add(lot, boxOf(lot));
    }
    for (const [key, l] of old) if (this.lots.get(key) !== l) removed.push(key);
    return { added, removed };
  }

  /** does a lot overlap an accepted one */
  private clashes(c: Lot): boolean {
    this.hits.clear(); this.grid.query(boxOf(c), this.hits);
    for (const h of this.hits) if (overlaps(c, h)) return true;
    return false;
  }

  /** the lots whose rectangle touches a tile box (appended to out) */
  query(x0: number, y0: number, x1: number, y1: number, out: Lot[] = []): Lot[] {
    this.hits.clear(); this.grid.query([x0, y0, x1, y1], this.hits);
    for (const l of this.hits) if (touches(boxOf(l), [x0, y0, x1, y1])) out.push(l);
    return out;
  }
}

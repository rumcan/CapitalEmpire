// Parcels: the frontage lots along every road. Pure TS, no DOM.
// A lot is an oriented rectangle fronting one side of a road seg (a Cities: Skylines zone cell, not a face of the road graph).
// Along-road positions sit on a global lattice, so a split road keeps its lots; the depth stops short of other roads, and
// lots on bad terrain are dropped. Overlaps are settled by priority (road order, then seg length, then key).
import { MAP } from '../iso';
import { Grid, SK, dot, mul, perp, sub, unionBox, vlen, type BBox, type ClassId, type Node, type Pt, type RoadClass, type RoadNetwork, type Seg } from '../network';
import { TC } from '../terrain/types';

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
const SIZE: Record<ClassId, [number, number]> = { gravel: [8, 15], lane: [8, 15], street: [8, 15], road: [10, 16], avenue: [12, 18], boulevard: [16, 20] };
/** the shallowest lot kept; the clearance added to another road's h + walk; the share of bad terrain allowed; the overlap tolerance */
const MIN_D = 6, CLEAR = 0.5, BAD_MAX = 0.1, TOL = 0.25;
/** how far a lot can reach from its seg (its depth plus the verge), and how far an edit's recompute scope reaches past its box */
const REACH = 27, SCOPE = 2 * REACH;
/** the spatial grid's cell, tiles */
const CELL = 32;

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
const pad = (b: BBox, p: number): BBox => [b[0] - p, b[1] - p, b[2] + p, b[3] + p];
/** the box of a lot's rectangle (origin o, along u, away n, w by d) */
function rectBox(o: Pt, u: Pt, n: Pt, w: number, d: number): BBox {
  const ax = o.x + u.x * w, ay = o.y + u.y * w, bx = o.x + n.x * d, by = o.y + n.y * d, cx = ax + n.x * d, cy = ay + n.y * d;
  return [Math.min(o.x, ax, bx, cx), Math.min(o.y, ay, by, cy), Math.max(o.x, ax, bx, cx), Math.max(o.y, ay, by, cy)];
}
const boxOf = (l: Lot) => rectBox(l.o, l.u, l.n, l.w, l.d);
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

// scratch for one candidate's blockers (the other segs near its box, with their clearance)
const near: Seg[] = [], nearThr: number[] = [];
/** collect the other segs whose clearance band reaches the lot's rectangle */
function blockers(net: RoadNetwork, s: Seg, o: Pt, u: Pt, n: Pt, W: number, D: number) {
  near.length = 0; nearThr.length = 0;
  const box = rectBox(o, u, n, W, D), cx = o.x + u.x * W / 2 + n.x * D / 2, cy = o.y + u.y * W / 2 + n.y * D / 2;
  for (const s2 of net.segsNear({ x: cx, y: cy }, Math.hypot(W, D) / 2 + 7)) {
    if (s2 === s) continue;
    const thr = s2.cls.h + s2.cls.walk + CLEAR;
    if (touches(segBox(s2), pad(box, thr))) { near.push(s2); nearThr.push(thr); }
  }
}
/** is (px, py) within a blocker's clearance */
function blocked(px: number, py: number): boolean {
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
/** the share of a lot's samples (depth d) on HILL, WATER, CREEK, BANK or off the map */
function badShare(terr: Uint8Array, o: Pt, u: Pt, n: Pt, W: number, d: number): number {
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
function segLots(net: RoadNetwork, s: Seg, terr: Uint8Array | null, out: Lot[]) {
  if (s.kind !== SK.GROUND) return;
  const dv = sub(s.b, s.a), L = vlen(dv); if (L < 1e-6) return;
  const u = mul(dv, 1 / L), pu = perp(u), cls = s.cls, [W, D] = SIZE[cls.id], r0 = cls.h + cls.walk;
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
      // keep the side-street points of the town's growth lattice free (roads.ts branches every BRANCH tiles of t): no lot
      // within RESERVE of them, so a future street never has to cut through a house (in a full grid they are junctions anyway)
      const lo = k * W, m0 = Math.floor((lo - RESERVE) / BRANCH) + 1;
      if (m0 * BRANCH < lo + W + RESERVE) continue;
      const o = { x: f.x + u.x * k * W + n.x * r0, y: f.y + u.y * k * W + n.y * r0 };
      blockers(net, s, o, u, n, W, D);
      // the midline cap: half the clear distance to the verge of the road behind, from the front corners and the midpoint
      const fm = { x: o.x + u.x * W / 2, y: o.y + u.y * W / 2 }, fe = { x: o.x + u.x * W, y: o.y + u.y * W };
      const clear = Math.min(clearAlong(list, s, o, n, reach), clearAlong(list, s, fm, n, reach), clearAlong(list, s, fe, n, reach));
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
    for (const l of this.lots.values()) {
      if (!net.segs.has(l.seg) || touches(segBox(l.seg), Z)) old.set(l.key, l);
      else if (touches(boxOf(l), Zr)) { old.set(l.key, l); fixed.push(l); }
    }
    for (const l of old.values()) { this.lots.delete(l.key); this.grid.remove(l); }
    // 2. the candidates of the segs in scope and the fixed lots, in priority order
    const items: Lot[] = [];
    for (const s of net.segs) if (touches(segBox(s), Z)) segLots(net, s, this.terr, items);
    for (const l of fixed) items.push(l);
    items.sort(prio);
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

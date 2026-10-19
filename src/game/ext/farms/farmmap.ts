// Where the farms stand: the farm parcels of the network's country roads (farms.ts), kept in step with the network, the town's
// lots and the event's site and car parks. Pure TS, no DOM. The engine composes and places the parcels it is told about
// (props 'farm:' + key, ground via setLotGround); nothing here is saved, the parcels derive from the network, the terrain
// classes and the world seed.
import { Grid, SK, unionBox, type BBox, type Pt, type RoadNetwork, type Seg } from '../../network';
import { farmParcels, parcelCentre, parcelCorners, parcelsOverlap, seedForParcel, FARM_DEPTH_MAX, FARM_VERGE, type FarmParcel } from './farms';

/** a farm's seg midpoint is more than TOWN_CLEAR tiles from every town centre, and more than EVENT_CLEAR from the event's site and car parks */
export const TOWN_CLEAR = 300, EVENT_CLEAR = 150;
/** a rectangle in tiles (the event's site, a car park def) */
export interface Rect { x: number; y: number; w: number; h: number }
/** a town lot's frame as the sim sends it (origin, along u, away n, tiles), the same frame as a farm parcel */
export interface LotFrame { o: readonly number[]; u: readonly number[]; n: readonly number[]; w: number; d: number; /** the lot's level (LV: 0 empty); an empty lot does not claim its land */ level?: number }
/** the town lots that claim their land: those the town has started building on (level 1+; a lot without a level counts) */
export function claimedLots(lots: ReadonlyMap<string, LotFrame>): number { let k = 0; for (const l of lots.values()) if ((l.level ?? 1) >= 1) k++; return k; }
/** an accepted farm: its parcel, the seed composeFarm takes for it, and the seg it fronts */
export interface Farm { p: FarmParcel; seed: number; seg: Seg }
/** what the farms must keep clear of: the town centres, the event's site and the car parks */
export interface FarmEnv { towns: Pt[]; site: Rect | null; parks: Rect[] }

/** the spatial grid's cell, tiles; how far past a change a seg is re-derived (its parcels reach at most FARM_DEPTH_MAX + the verge
 *  and half a class width from its line); the margin a road's clearance band may reach into a parcel */
const CELL = 32, REACH = FARM_DEPTH_MAX + 20, RETEST = 16;

const touches = (b: BBox, z: BBox) => b[0] <= z[2] && b[2] >= z[0] && b[1] <= z[3] && b[3] >= z[1];
const pad = (b: BBox, p: number): BBox => [b[0] - p, b[1] - p, b[2] + p, b[3] + p];
const segBox = (s: Seg): BBox => [Math.min(s.a.x, s.b.x), Math.min(s.a.y, s.b.y), Math.max(s.a.x, s.b.x), Math.max(s.a.y, s.b.y)];
/** the box of a parcel's four corners */
function boxOf(p: FarmParcel): BBox {
  const c = parcelCorners(p);
  return [Math.min(c[0].x, c[1].x, c[2].x, c[3].x), Math.min(c[0].y, c[1].y, c[2].y, c[3].y), Math.max(c[0].x, c[1].x, c[2].x, c[3].x), Math.max(c[0].y, c[1].y, c[2].y, c[3].y)];
}
/** the distance from a point to a rectangle (0 inside) */
function rectDist(x: number, y: number, r: Rect): number { return Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h)); }
/** the distance from a point to the segment a-b */
function ptSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
}
/** the cross product of (b - a) and (c - a) */
const orient = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
/** the distance from segment a-b to the convex quad q (four corners in order): 0 if they touch or overlap */
function segQuadDist(a: Pt, b: Pt, q: Pt[]): number {
  let inside = true, sgn = 0;
  for (let k = 0; k < 4 && inside; k++) { const o = orient(q[k], q[(k + 1) % 4], a); if (o !== 0) { if (sgn && Math.sign(o) !== sgn) inside = false; sgn = Math.sign(o); } }
  if (inside) return 0;
  let best = Infinity;
  for (let k = 0; k < 4; k++) {
    const c = q[k], d = q[(k + 1) % 4];
    if (orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0) return 0;
    best = Math.min(best, ptSeg(c, a, b), ptSeg(d, a, b), ptSeg(a, c, d), ptSeg(b, c, d));
  }
  return best;
}
/** may this seg hold farms: a ground seg whose midpoint is far enough from the towns, the event's site and its car parks */
function segOk(s: Seg, env: FarmEnv): boolean {
  if (s.kind !== SK.GROUND) return false;
  const x = (s.a.x + s.b.x) / 2, y = (s.a.y + s.b.y) / 2;
  for (const t of env.towns) if (Math.hypot(x - t.x, y - t.y) <= TOWN_CLEAR) return false;
  if (env.site && rectDist(x, y, env.site) <= EVENT_CLEAR) return false;
  for (const r of env.parks) if (rectDist(x, y, r) <= EVENT_CLEAR) return false;
  return true;
}
/** does no other road's clearance band (its half width, walk and the verge) reach the parcel */
function roadsClear(net: RoadNetwork, p: FarmParcel, s: Seg): boolean {
  const c = parcelCentre(p), q = parcelCorners(p), R = Math.hypot(p.w, p.d) / 2 + RETEST;
  for (const s2 of net.segsNear(c, R)) if (s2 !== s && segQuadDist(s2.a, s2.b, q) <= s2.cls.h + s2.cls.walk + FARM_VERGE) return false;
  return true;
}
/** the same parcel (geometry and side), so a farm whose parcel did not change keeps its props */
const sameParcel = (p: FarmParcel, q: FarmParcel) => p.side === q.side && Math.abs(p.w - q.w) < 1e-9 && Math.abs(p.d - q.d) < 1e-9
  && [[p.o, q.o], [p.u, q.u], [p.n, q.n]].every(([a, b]) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9);

/** The farms of a network. Call update() after every RoadNetwork.rebuild (with full = true after a load or a new valley); the
 *  parcels that stop being farms come back in `removed` (drop their props and ground), the new ones in `added` (compose them). */
export class FarmMap {
  /** the accepted farms by parcel key */
  farms = new Map<string, Farm>();
  /** the town's lot frames by key, and their grid (kept in step with the sim's lots at each update) */
  private town = new Map<string, FarmParcel>(); private townG = new Grid<FarmParcel>(CELL);
  /** the parcels of each seg by the seg's geometry (a changed seg re-derives; a seg that stays keeps its parcels) */
  private cache = new WeakMap<Seg, { v: number[]; ps: FarmParcel[] }>();
  /** the terrain classes and world seed the parcels were derived from; a new valley starts again */
  private cls: Uint8Array = new Uint8Array(0); private world = -1;
  /** the sim's lot count, the site's corner and the car park count at the last update */
  private nLots = -1; private sx = -1e9; private sy = -1e9; private np = -1;

  /** has the town's lot count, the event's site or the car park count changed since the last update (the farms then need a full update) */
  stale(nLots: number, site: Rect | null, nParks: number): boolean {
    return nLots !== this.nLots || (site ? site.x : -1e9) !== this.sx || (site ? site.y : -1e9) !== this.sy || nParks !== this.np;
  }
  /** forget every farm (a reset, the farms switched off); the next update starts from scratch */
  clear() { this.farms = new Map(); this.nLots = -1; }
  /** the parcels of a seg, from the cache when the seg's geometry is unchanged */
  private parcelsOf(s: Seg, seed: number): FarmParcel[] {
    const a = s.a, b = s.b, h = s.cls.h, c = this.cache.get(s);
    if (c && c.v[0] === a.x && c.v[1] === a.y && c.v[2] === b.x && c.v[3] === b.y && c.v[4] === h) return c.ps;
    const ps = farmParcels({ a, b, h }, this.cls, seed);
    this.cache.set(s, { v: [a.x, a.y, b.x, b.y, h], ps }); return ps;
  }
  /** the town's lots: the grid follows the sim's lots (added, removed) */
  private syncTown(lots: ReadonlyMap<string, LotFrame>) {
    for (const [k, p] of this.town) { const l = lots.get(k); if (!l || (l.level ?? 1) < 1) { this.townG.remove(p); this.town.delete(k); } }
    for (const [k, l] of lots) if (!this.town.has(k) && (l.level ?? 1) >= 1) {
      const p: FarmParcel = { key: k, o: { x: l.o[0]!, y: l.o[1]! }, u: { x: l.u[0]!, y: l.u[1]! }, n: { x: l.n[0]!, y: l.n[1]! }, w: l.w, d: l.d, side: 1 };
      this.town.set(k, p); this.townG.add(p, boxOf(p));
    }
  }
  /** does a parcel overlap a town lot */
  private townClash(p: FarmParcel): boolean { for (const t of this.townG.query(boxOf(p))) if (parcelsOverlap(p, t)) return true; return false; }
  /** after a rebuild of the network (`full`: derive every farm again). Only the segs near the change are re-derived: the farms of
   *  the other segs stay as they are. Parcels are settled in key order: one that overlaps an accepted farm, a town lot, or lies
   *  within another road's clearance is dropped. */
  update(net: RoadNetwork, world: { cls: Uint8Array; seed: number }, env: FarmEnv, lots: ReadonlyMap<string, LotFrame>, full: boolean): { added: string[]; removed: string[] } {
    const added: string[] = [], removed: string[] = [];
    if (world.cls !== this.cls || world.seed !== this.world) { this.cls = world.cls; this.world = world.seed; this.cache = new WeakMap(); full = true; }
    if (this.stale(claimedLots(lots), env.site, env.parks.length)) full = true;
    this.syncTown(lots);
    // the scope: the box of the change (the rebuild's dirty box and the touched nodes and their segs), or everything
    let Z: BBox | null = full ? [-Infinity, -Infinity, Infinity, Infinity] : net.lastDirty ? [...net.lastDirty] as BBox : null;
    if (!full) {
      for (const n of net.lastNodes) { Z = unionBox(Z, [n.x, n.y, n.x, n.y]); for (const s of n.segs) Z = unionBox(Z, segBox(s)); }
      for (const f of this.farms.values()) if (!net.segs.has(f.seg)) Z = unionBox(Z, boxOf(f.p));
      if (!Z) return { added, removed };
    }
    const zr = pad(Z!, REACH), next = new Map<string, Farm>(), grid = new Grid<Farm>(CELL);
    // the farms outside the scope stay as they are
    for (const f of this.farms.values()) if (net.segs.has(f.seg) && !touches(segBox(f.seg), zr)) { next.set(f.p.key, f); grid.add(f, boxOf(f.p)); }
    // the candidates: the parcels of the segs in scope, in key order
    const cands: { p: FarmParcel; seg: Seg }[] = [];
    for (const s of net.segs) if (touches(segBox(s), zr) && segOk(s, env)) for (const p of this.parcelsOf(s, world.seed)) cands.push({ p, seg: s });
    cands.sort((a, b) => a.p.key < b.p.key ? -1 : a.p.key > b.p.key ? 1 : 0);
    for (const { p, seg } of cands) {
      if (next.has(p.key) || this.townClash(p) || !roadsClear(net, p, seg)) continue;
      let clash = false; for (const f of grid.query(boxOf(p))) if (parcelsOverlap(p, f.p)) { clash = true; break; }
      if (clash) continue;
      const f: Farm = { p, seed: seedForParcel(p, world.seed), seg };
      next.set(p.key, f); grid.add(f, boxOf(p));
    }
    for (const [k, f] of this.farms) { const g = next.get(k); if (!g || !sameParcel(f.p, g.p)) removed.push(k); }
    for (const [k, g] of next) { const f = this.farms.get(k); if (!f || !sameParcel(f.p, g.p)) added.push(k); }
    this.farms = next;
    this.nLots = claimedLots(lots); this.sx = env.site ? env.site.x : -1e9; this.sy = env.site ? env.site.y : -1e9; this.np = env.parks.length;
    return { added, removed };
  }
}

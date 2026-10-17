// The Town: land use and growth on the parcels (Phase 3 step 3). Pure TS, no DOM. Deterministic from the seed and the
// sequence of calls. Growth runs once per game hour (60 sim s); a game day is 1440 sim s.
import type { Lot, LotMap } from './lots';
import type { Pt } from '../network';
import { zoneOf } from '../sim/routing';

export const LU = { NONE: 0, RES: 1, COM: 2, IND: 3, TOUR: 4, GOV: 5 } as const;
export const LV = { EMPTY: 0, BUILDING: 1, BUILT: 2, UPGRADED: 3 } as const;
export interface LotState { key: string; use: number; level: number; decline: number /* 0 ok, 1 shabby, 2 boarded, 3 derelict */; since: number /* sim s of the last change */; seed: number; pop: number; jobs: number }
export interface TownEvent { key: string; kind: 'build' | 'complete' | 'upgrade' | 'decline' | 'recover' | 'clear' | 'gone'; use: number; level: number; decline: number }
export interface GrowthOption { id: string; name: string; w: [number, number, number, number, number] /* RES COM IND TOUR GOV multipliers */ }
/** the growth options: the multipliers shift the land use scores (and GOV's quota); the player picks one, nothing is placed */
export const GROWTH_OPTIONS: GrowthOption[] = [
  { id: 'balanced', name: 'Balanced', w: [1, 1, 1, 1, 1] },
  { id: 'suburb', name: 'Family suburb', w: [1.6, 0.8, 0.5, 1, 1] },
  { id: 'industry', name: 'Industrial boom', w: [0.9, 1, 2.2, 0.5, 1] },
  { id: 'tourist', name: 'Tourist town', w: [1, 1.3, 0.4, 2.5, 1] },
  { id: 'downtown', name: 'Downtown core', w: [0.8, 2, 1, 1, 1.2] },
];
export interface TownCtx { lots: LotMap; entry: Pt /* the highway entry point, tiles */; reachable: (lot: Lot) => boolean; water: (x: number, y: number) => number /* distance to WATER in tiles, capped at 200 */ }

/** a game hour and a game day, sim s */
const HOUR = 60, DAY = 1440;
/** residents and jobs by use (index = LU) and level (BUILT, UPGRADED) */
const POP: number[][] = [[0, 0], [3, 5], [0, 0], [0, 0], [0, 0], [0, 0]];
const JOBS: number[][] = [[0, 0], [0, 0], [3, 5], [6, 10], [3, 6], [8, 12]];
/** the seeded noise on land use scores (+-), the candidates kept for the weighted pick */
const NOISE = 0.15, PICK_TOP = 400;
/** the base target share of built+building lots by use (index = LU; GOV is a quota, not a share; the option scales these), and the lots before shares count */
const TARGET = [0, 0.65, 0.2, 0.1, 0.05], MIN_OCC = 10;

/** the zone growth factor from access: 1 below 1.3, linear to 0 at 1.8, 0 above */
export function zoneGrowth(a: number): number { return a < 1.3 ? 1 : a >= 1.8 ? 0 : (1.8 - a) / 0.5; }
/** residents (POP) or jobs (JOBS) of a lot: none while building, half at decline 2+, none when derelict */
function yieldOf(T: number[][], s: LotState): number {
  if (s.level < LV.BUILT || s.decline >= 3) return 0;
  const v = T[s.use][s.level - LV.BUILT];
  return s.decline >= 2 ? v >> 1 : v;
}
/** the value of a lot's frontage for growth: corner +0.3, +0.2 per paved class step above gravel */
const lotValue = (l: Lot) => 1 + (l.corner ? 0.3 : 0) + 0.2 * Math.max(0, l.seg.cls.order + 1);
const dist = (a: Pt, b: Pt) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
function hashStr(h: number, s: string): number { for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

/** The town of one city: the lot states, the growth of new buildings, upgrades and decline. Feed it the lots (onLots), the
 *  access per zone (access) and advance it (tick). */
export class Town {
  /** the state of every known lot by key */
  states = new Map<string, LotState>();
  option: GrowthOption = GROWTH_OPTIONS[0];
  /** residents and jobs of all lots; the lots built (BUILT or UPGRADED); the sim time reached */
  pop = 0; jobs = 0; built = 0; t = 0;
  /** access score per zone (256): actual / free-flow trip time; 1 = free flow. The sim fills it (step 6); default 1. */
  access = new Float32Array(256).fill(1);
  /** the geometry of the known lots by key */
  private geo = new Map<string, Lot>();
  /** the EMPTY lots (the candidates to grow into), their distance to the nearest lot not EMPTY (Infinity = none), by index */
  private cand: Lot[] = []; private candDn: number[] = []; private candAt = new Map<string, number>();
  /** the lots not EMPTY, the GOV lots, a rescan is due, the fraction of a lot per hour carried over, the game hours run */
  private nAct = 0; private govN = 0; private dirty = false; private acc = 0; private hour = 0;
  /** per zone: the sim s since its access went above 1.8 (-1 = not) */
  private bad = new Float64Array(256).fill(-1);
  private seed: number; private rs: number;
  private ev: TownEvent[] = [];
  private w = new Float64Array(0); private sel = new Int32Array(0); private sc = new Float64Array(4); private mul = new Float64Array(4);
  /** the built+building lots by use (index = LU) and in total */
  private cnt = new Int32Array(6); private occ = 0;
  private ax: number[] = []; private ay: number[] = [];

  constructor(seed: number) { this.seed = seed >>> 0; this.rs = this.seed; }

  /** lots changed (from LotMap.update): removed lots' states go ('gone' events); a key replaced by a new rectangle keeps its state; new lots start EMPTY */
  onLots(added: Lot[], removed: string[]): TownEvent[] {
    const ev: TownEvent[] = [], keep = new Set<string>();
    for (const l of added) keep.add(l.key);
    for (const key of removed) {
      const s = this.states.get(key); if (!s || keep.has(key)) continue;
      ev.push({ key, kind: 'gone', use: s.use, level: s.level, decline: s.decline });
      this.set(s, LU.NONE, LV.EMPTY, 0, this.t);
      this.candDel(key); this.states.delete(key); this.geo.delete(key);
    }
    for (const l of added) {
      if (this.states.has(l.key)) { this.geo.set(l.key, l); const i = this.candAt.get(l.key); if (i !== undefined) this.cand[i] = l; }
      else {
        this.states.set(l.key, { key: l.key, use: LU.NONE, level: LV.EMPTY, decline: 0, since: this.t, seed: hashStr(this.seed ^ 0x811c9dc5, l.key), pop: 0, jobs: 0 });
        this.geo.set(l.key, l); this.candAdd(l);
      }
    }
    if (added.length || removed.length) this.dirty = true;
    return ev;
  }

  /** advance to sim time t (seconds); runs whole game hours; returns the events (the array is reused: read it before the next call) */
  tick(t: number, ctx: TownCtx): TownEvent[] {
    const ev = this.ev; ev.length = 0;
    const h = Math.floor(t / HOUR);
    while (this.hour < h) { this.hour++; this.step(this.hour * HOUR, ctx, ev); }
    if (t > this.t) this.t = t;
    return ev;
  }

  /** one game hour at sim time T */
  private step(T: number, ctx: TownCtx, ev: TownEvent[]) {
    if (this.hour % 24 === 0) this.dirty = true;
    for (let z = 0; z < 256; z++) { if (this.access[z] > 1.8) { if (this.bad[z] < 0) this.bad[z] = T; } else this.bad[z] = -1; }
    if (this.dirty) this.rescan();
    // the lots: construction, then upgrade, decline, recovery and clearing of the built ones
    for (const s of this.states.values()) {
      if (s.level === LV.BUILDING) { if (T - s.since >= DAY / 2) { this.set(s, s.use, LV.BUILT, s.decline, T); ev.push(this.evt(s, 'complete')); } continue; }
      if (s.level < LV.BUILT) continue;
      const c = this.geo.get(s.key)!.c, z = zoneOf(c.x, c.y), a = this.access[z];
      if (s.decline === 3 && T - s.since >= 2 * DAY) { this.set(s, LU.NONE, LV.EMPTY, 0, T); ev.push(this.evt(s, 'clear')); continue; }
      if (s.decline > 0 && a < 1.5) {
        if (this.rnd() < 0.05) { this.set(s, s.use, s.level, s.decline - 1, T); ev.push(this.evt(s, 'recover')); }
      } else if (s.decline < 3 && this.bad[z] >= 0 && T - this.bad[z] >= 2 * DAY) {
        if (this.rnd() < 0.03) { this.set(s, s.use, s.level, s.decline + 1, T); ev.push(this.evt(s, 'decline')); }
      } else if (s.level === LV.BUILT && a < 1.3 && T - s.since >= 3 * DAY) {
        if (this.rnd() < 0.04) { this.set(s, s.use, LV.UPGRADED, s.decline, T); ev.push(this.evt(s, 'upgrade')); }
      }
    }
    // the growth: civic quota first, then the fraction of lots per hour
    if (this.govN < this.govTarget()) this.placeGov(ctx, T, ev);
    this.acc += (20 + 0.1 * this.built) / 24;
    let n = Math.floor(this.acc); this.acc -= n;
    for (; n > 0; n--) {
      const l = this.pick(ctx); if (!l) break;
      const use = this.useFor(l, ctx), s = this.states.get(l.key)!;
      this.set(s, use, LV.BUILDING, 0, T); ev.push(this.evt(s, 'build'));
    }
  }

  /** the zone growth of a lot's zone if the lot is reachable, else 0 */
  private openness(l: Lot, ctx: TownCtx): number { return ctx.reachable(l) ? zoneGrowth(this.access[zoneOf(l.c.x, l.c.y)]) : 0; }

  /** one weighted pick among the best PICK_TOP candidates; null if none can grow */
  private pick(ctx: TownCtx): Lot | null {
    const n = this.cand.length; if (!n) return null;
    if (this.w.length < n) { this.w = new Float64Array(2 * n); this.sel = new Int32Array(2 * n); }
    const w = this.w, sel = this.sel; let m = 0;
    for (let i = 0; i < n; i++) {
      const l = this.cand[i]; w[i] = 0;
      const zg = this.openness(l, ctx); if (zg <= 0) continue;
      const d = this.nAct ? this.candDn[i] : dist(l.c, ctx.entry);
      w[i] = zg * Math.exp(-d / 40) * lotValue(l); sel[m++] = i;
    }
    if (!m) return null;
    const idx = sel.subarray(0, m); idx.sort((a, b) => w[b] - w[a]);
    const K = Math.min(PICK_TOP, m); let tot = 0;
    for (let j = 0; j < K; j++) tot += w[idx[j]];
    let r = this.rnd() * tot;
    for (let j = 0; j < K; j++) { r -= w[idx[j]]; if (r < 0 || j === K - 1) return this.cand[idx[j]]; }
    return null;
  }

  /** the land use of a chosen lot: the scores times the share balance, the option and seeded noise; the highest wins */
  private useFor(l: Lot, ctx: TownCtx): number {
    const cid = l.seg.cls.id, w = this.option.w, sc = this.sc, mul = this.mul;
    // the targets: the base shares times the option, renormalised over RES, COM, IND, TOUR
    let tot = 0; for (let u = 0; u < 4; u++) tot += TARGET[u + 1] * w[u];
    // the share balance: a use below its target share scores up to 3x, above it down to 0.3x (raw until MIN_OCC lots)
    for (let u = 0; u < 4; u++) {
      const t = TARGET[u + 1] * w[u] / tot;
      mul[u] = this.occ < MIN_OCC ? 1 : Math.min(3, Math.max(0.3, 1 + 2 * (t - this.cnt[u + 1] / this.occ) / t));
    }
    let nr = 0;
    for (const s of this.states.values()) if (s.use === LU.RES && s.level !== LV.EMPTY && dist(this.geo.get(s.key)!.c, l.c) <= 30) nr++;
    const de = dist(l.c, ctx.entry), wat = ctx.water(l.c.x, l.c.y);
    sc[0] = (1 + (cid === 'gravel' || cid === 'lane' || cid === 'street' ? 0.5 : 0)) * mul[0];
    sc[1] = (0.5 + (cid === 'road' || cid === 'avenue' ? 0.6 : 0) + (cid === 'boulevard' ? 1 : 0) + (l.corner ? 0.4 : 0)) * mul[1];
    sc[2] = (0.2 + (de <= 120 ? 1.2 : 0)) * (nr > 4 ? 0.3 : 1) * mul[2];
    sc[3] = (0.1 + (wat <= 40 ? 1 : 0) + (cid === 'boulevard' ? 0.6 : 0)) * mul[3];
    let best = LU.RES, bv = -1;
    for (let u = 0; u < 4; u++) { const v = sc[u] * (1 + NOISE * (2 * this.rnd() - 1)); if (v > bv) { bv = v; best = u + 1; } }
    return best;
  }

  /** the civic lots wanted: one per 400 residents, the first at 200 (scaled by the option's GOV multiplier) */
  private govTarget(): number { return this.pop < 200 ? 0 : Math.round((1 + Math.floor((this.pop - 200) / 400)) * this.option.w[4]); }

  /** place one GOV lot on the best road class among the open candidates nearest the centre of the built area */
  private placeGov(ctx: TownCtx, T: number, ev: TownEvent[]) {
    let sx = 0, sy = 0, m = 0;
    for (const s of this.states.values()) if (s.use !== LU.NONE) { const c = this.geo.get(s.key)!.c; sx += c.x; sy += c.y; m++; }
    const cen = { x: m ? sx / m : ctx.entry.x, y: m ? sy / m : ctx.entry.y };
    const ok: number[] = [];
    for (let i = 0; i < this.cand.length; i++) if (this.openness(this.cand[i], ctx) > 0) ok.push(i);
    if (!ok.length) return;
    const dc = (i: number) => dist(this.cand[i].c, cen);
    ok.sort((i, j) => dc(i) - dc(j));
    let best = ok[0];
    for (const i of ok.slice(0, 40)) if (this.cand[i].seg.cls.order > this.cand[best].seg.cls.order) best = i;
    const s = this.states.get(this.cand[best].key)!;
    this.set(s, LU.GOV, LV.BUILDING, 0, T); ev.push(this.evt(s, 'build'));
  }

  /** a state change: keeps the totals, the candidates and the distances to the lots not EMPTY */
  private set(s: LotState, use: number, level: number, decline: number, T: number) {
    const was = s.use !== LU.NONE;
    if (s.level !== LV.EMPTY) { this.cnt[s.use]--; this.occ--; }
    this.pop -= s.pop; this.jobs -= s.jobs;
    if (was) this.nAct--; if (s.level >= LV.BUILT) this.built--; if (s.use === LU.GOV) this.govN--;
    s.use = use; s.level = level; s.decline = decline; s.since = T;
    s.pop = yieldOf(POP, s); s.jobs = yieldOf(JOBS, s);
    this.pop += s.pop; this.jobs += s.jobs;
    if (level !== LV.EMPTY) { this.cnt[use]++; this.occ++; }
    const is = use !== LU.NONE;
    if (is) this.nAct++; if (level >= LV.BUILT) this.built++; if (use === LU.GOV) this.govN++;
    const l = this.geo.get(s.key)!;
    if (!is && level === LV.EMPTY) this.candAdd(l); else this.candDel(s.key);
    if (is && !was) for (let i = 0; i < this.cand.length; i++) { const d = dist(this.cand[i].c, l.c); if (d < this.candDn[i]) this.candDn[i] = d; }
    if (was && !is) this.dirty = true;
  }

  /** the distance of every candidate to the nearest lot not EMPTY (none: Infinity) */
  private rescan() {
    this.dirty = false;
    const ax = this.ax, ay = this.ay; ax.length = 0; ay.length = 0;
    for (const s of this.states.values()) if (s.use !== LU.NONE) { const c = this.geo.get(s.key)!.c; ax.push(c.x); ay.push(c.y); }
    for (let i = 0; i < this.cand.length; i++) {
      const c = this.cand[i].c; let best = Infinity;
      for (let j = 0; j < ax.length; j++) { const dx = ax[j] - c.x, dy = ay[j] - c.y, d2 = dx * dx + dy * dy; if (d2 < best) best = d2; }
      this.candDn[i] = Math.sqrt(best);
    }
  }

  private candAdd(l: Lot) {
    const i = this.candAt.get(l.key);
    if (i !== undefined) { this.cand[i] = l; return; }
    this.candAt.set(l.key, this.cand.length); this.cand.push(l); this.candDn.push(Infinity);
  }
  private candDel(key: string) {
    const i = this.candAt.get(key); if (i === undefined) return;
    const last = this.cand.length - 1;
    if (i !== last) { this.cand[i] = this.cand[last]; this.candDn[i] = this.candDn[last]; this.candAt.set(this.cand[i].key, i); }
    this.cand.pop(); this.candDn.pop(); this.candAt.delete(key);
  }

  private evt(s: LotState, kind: TownEvent['kind']): TownEvent { return { key: s.key, kind, use: s.use, level: s.level, decline: s.decline }; }

  /** the seeded stream (mulberry32): [0, 1) */
  private rnd(): number {
    let t = (this.rs = (this.rs + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

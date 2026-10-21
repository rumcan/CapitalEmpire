// The Town: land use and growth on the parcels (Phase 3 step 3). Pure TS, no DOM. Deterministic from the seed and the
// sequence of calls. Growth runs once per game hour (60 sim s); a game day is 1440 sim s.
import type { Lot, LotMap } from './lots';
import type { Pt } from '../network';
import { zoneOf } from '../sim/routing';
import type { Built } from '../sim/trips';
import { PAVED_RATE, TOWN_RATE_BASE, TOWN_RATE_PER_BUILT } from '../event/config';
import { inCommercial, inIndustrial, industrialRect } from './districts';

export const LU = { NONE: 0, RES: 1, COM: 2, IND: 3, TOUR: 4, GOV: 5 } as const;
/** shops gather in rows: a lot's shop neighbours (within COM_ROW tiles, on the same side of the street) raise its shop score by COM_PULL each
 *  (up to two) and lower its house score to COM_PUSH times (see useFor) */
const COM_ROW = 14, COM_PULL = 0.9, COM_PUSH = 0.55;
export const LV = { EMPTY: 0, BUILDING: 1, BUILT: 2, UPGRADED: 3 } as const;
export interface LotState { key: string; use: number; level: number; decline: number /* 0 ok, 1 shabby, 2 boarded, 3 derelict */; since: number /* sim s of the last change */; seed: number; pop: number; jobs: number }
/** a saved lot: key, use, level, decline, seed, since (sim s of the last change) */
export type LotTuple = [string, number, number, number, number, number];
export interface TownEvent { key: string; kind: 'build' | 'complete' | 'upgrade' | 'decline' | 'recover' | 'clear' | 'gone'; use: number; level: number; decline: number; seed: number; since: number }
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
/** the lot sides of a pick: any lot, only those on gravel (the town's land with towns), only those on paved roads (the player's, with towns) */
const ANY = 0, GRAVEL = 1, PAVED = 2;
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
  /** the growth speed (dev sandbox, 1 = the game's): the construction takes DAY / 2 / speed, and growth is speed times as fast */
  speed = 1;
  /** residents and jobs of all lots; the lots built (BUILT or UPGRADED); the sim time reached */
  pop = 0; jobs = 0; built = 0; t = 0;
  /** access score per zone (256): actual / free-flow trip time; 1 = free flow. The sim fills it (step 6); default 1. */
  access = new Float32Array(256).fill(1);
  /** the geometry of the known lots by key */
  private geo = new Map<string, Lot>();
  /** the EMPTY lots (the candidates to grow into), their distance to the nearest lot not EMPTY (Infinity = none), by index */
  private cand: Lot[] = []; private candDn: number[] = []; private candAt = new Map<string, number>();
  /** the lots not EMPTY, the GOV lots, a rescan is due, the fraction of a lot per hour carried over, the game hours run */
  private nAct = 0; private govN = 0; private dirty = false; private acc = 0; private accP = 0; private hour = 0;
  /** per zone: the sim s since its access went above 1.8 (-1 = not) */
  private bad = new Float64Array(256).fill(-1);
  private seed: number; private rs: number;
  /** per lot bought out (see clear): the sim s the lot is held until (no town growth on it before then) */
  holdUntil = new Map<string, number>();
  private ev: TownEvent[] = [];
  private w = new Float64Array(0); private sel = new Int32Array(0); private sc = new Float64Array(4); private mul = new Float64Array(4);
  /** the built+building lots by use (index = LU) and in total */
  private cnt = new Int32Array(6); private occ = 0;
  private ax: number[] = []; private ay: number[] = [];
  /** the town centres (tiles); the town index of every known lot (the nearest centre, -1 with none); per town: the residents, the built lots and the GOV lots */
  centres: Pt[] = []; private townIdx = new Map<string, number>();
  popK: number[] = []; builtK: number[] = []; govK: number[] = [];

  constructor(seed: number) { this.seed = seed >>> 0; this.rs = this.seed; }

  /** lots changed (from LotMap.update): removed lots' states go ('gone' events); a key replaced by a new rectangle keeps its state; new lots start EMPTY */
  onLots(added: Lot[], removed: string[]): TownEvent[] {
    const ev: TownEvent[] = [], keep = new Set<string>();
    for (const l of added) keep.add(l.key);
    for (const key of removed) {
      const s = this.states.get(key); if (!s || keep.has(key)) continue;
      ev.push({ key, kind: 'gone', use: s.use, level: s.level, decline: s.decline, seed: s.seed, since: s.since });
      this.set(s, LU.NONE, LV.EMPTY, 0, this.t);
      this.candDel(key); this.states.delete(key); this.geo.delete(key); this.townIdx.delete(key);
    }
    for (const l of added) {
      if (this.states.has(l.key)) { this.geo.set(l.key, l); this.townSet(this.states.get(l.key)!, l.key, l.c); const i = this.candAt.get(l.key); if (i !== undefined) this.cand[i] = l; }
      else {
        this.states.set(l.key, { key: l.key, use: LU.NONE, level: LV.EMPTY, decline: 0, since: this.t, seed: hashStr(this.seed ^ 0x811c9dc5, l.key), pop: 0, jobs: 0 });
        this.geo.set(l.key, l); this.townSet(null, l.key, l.c); this.candAdd(l);
      }
    }
    if (added.length || removed.length) this.dirty = true;
    return ev;
  }

  /** a saved town on load (after the lots are known): the states of the saved keys that exist, the clock at t (the hour too, so
   *  no hours are replayed). Returns a 'complete' event per restored lot, so the main thread composes it. */
  restore(saved: LotTuple[], t: number): TownEvent[] {
    const ev: TownEvent[] = [];
    for (const [key, use, level, decline, seed, since] of saved) {
      const s = this.states.get(key); if (!s || level === LV.EMPTY) continue;
      s.seed = seed; this.set(s, use, level, decline, since);
      ev.push({ key, kind: 'complete', use, level, decline, seed, since });
    }
    this.t = t; this.hour = Math.floor(t / HOUR);
    return ev;
  }

  /** the town centres (tiles; copied): every known lot gets its town index and the per-town totals are recomputed */
  setCentres(c: Pt[]) {
    this.centres = c.map(p => ({ x: p.x, y: p.y }));
    this.popK = this.centres.map(() => 0); this.builtK = this.centres.map(() => 0); this.govK = this.centres.map(() => 0);
    for (const [key, l] of this.geo) this.townIdx.set(key, this.nearest(l.c));
    for (const s of this.states.values()) this.townAdd(this.townOf(s.key), s, 1);
  }

  /** the town (index into centres) of a known lot, -1 if none or no centres */
  townOf(key: string): number { return this.townIdx.get(key) ?? -1; }

  /** the towns built at once (a new valley, or a perfect round's growth): each town grows to perTown residents, or to its targets[k] when given
   *  (or its land runs out), lots BUILT (30% UPGRADED on paved roads) by the usual allocation; returns the 'complete' events */
  stamp(ctx: TownCtx, perTown: number, T: number, targets?: number[]): TownEvent[] {
    const out: TownEvent[] = [];
    for (let k = 0; k < this.centres.length; k++) {
      const goal = targets?.[k] ?? perTown;
      while (this.popK[k] < goal) {
        if (this.dirty) this.rescan();
        if (this.govN < this.govTarget()) this.placeGov(ctx, T, out, LV.BUILT);
        const l = this.pickTown(ctx, k); if (!l) break;
        const use = this.useFor(l, ctx), s = this.states.get(l.key)!;
        const level = l.seg.cls.id !== 'gravel' && this.rnd() < 0.3 ? LV.UPGRADED : LV.BUILT;
        this.set(s, use, level, 0, T); out.push(this.evt(s, 'complete'));
      }
    }
    return out;
  }

  /** jump to sim time t (seconds) without running the hours between (an event round moves the clock to the evening: the skipped
   *  hours grow nothing) */
  skipTo(t: number) { if (t > this.t) { this.t = t; this.hour = Math.floor(t / HOUR); } }

  /** a lot bought out (the player's bulldozer): a built lot (BUILDING or more) goes EMPTY now (a 'clear' event) and is held for 2 game days (see
   *  holdUntil: the town does not grow on it). Null, and nothing changes, for a lot that is not built */
  clear(key: string): TownEvent | null {
    const s = this.states.get(key);
    if (!s || s.level < LV.BUILDING) return null;
    this.set(s, LU.NONE, LV.EMPTY, 0, this.t);
    this.holdUntil.set(key, this.t + 2 * DAY);
    return this.evt(s, 'clear');
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
      if (s.level === LV.BUILDING) { if (T - s.since >= DAY / 2 / this.speed) { this.set(s, s.use, LV.BUILT, s.decline, T); ev.push(this.evt(s, 'complete')); } continue; }
      if (s.level < LV.BUILT) continue;
      const g = this.geo.get(s.key)!, c = g.c, z = zoneOf(c.x, c.y), a = this.access[z];
      if (s.decline === 3 && T - s.since >= 2 * DAY) { this.set(s, LU.NONE, LV.EMPTY, 0, T); ev.push(this.evt(s, 'clear')); continue; }
      if (s.decline > 0 && a < 1.5) {
        if (this.rnd() < 0.05) { this.set(s, s.use, s.level, s.decline - 1, T); ev.push(this.evt(s, 'recover')); }
      } else if (s.decline < 3 && this.bad[z] >= 0 && T - this.bad[z] >= 2 * DAY) {
        if (this.rnd() < 0.03) { this.set(s, s.use, s.level, s.decline + 1, T); ev.push(this.evt(s, 'decline')); }
      } else if (s.level === LV.BUILT && g.cls !== 'gravel' && a < 1.3 && T - s.since >= 3 * DAY) {
        if (this.rnd() < 0.04) { this.set(s, s.use, LV.UPGRADED, s.decline, T); ev.push(this.evt(s, 'upgrade')); }
      }
    }
    // the growth: civic quota first, then the fraction of lots per hour. With town centres the town grows on gravel only, and slower;
    // the player's paved roads grow PAVED_RATE lots a game hour on their own accumulator (the rates: config.ts)
    if (this.govN < this.govTarget()) this.placeGov(ctx, T, ev);
    const towns = this.centres.length > 0;
    this.acc += towns ? (TOWN_RATE_BASE + TOWN_RATE_PER_BUILT * this.built) / 24 * this.speed : (20 + 0.1 * this.built) / 24 * this.speed;
    let n = Math.floor(this.acc); this.acc -= n;
    for (; n > 0; n--) { const l = this.pick(ctx, towns ? GRAVEL : ANY); if (!l) break; this.startBuild(l, ctx, T, ev); }
    if (towns) {
      this.accP += PAVED_RATE * this.speed;
      let m = Math.floor(this.accP); this.accP -= m;
      for (; m > 0; m--) { const l = this.pick(ctx, PAVED); if (!l) break; this.startBuild(l, ctx, T, ev); }
    }
  }

  /** a lot starts building (EMPTY to BUILDING: a 'build' event) with a use drawn for it */
  private startBuild(l: Lot, ctx: TownCtx, T: number, ev: TownEvent[]) {
    const use = this.useFor(l, ctx), s = this.states.get(l.key)!;
    this.set(s, use, LV.BUILDING, 0, T); ev.push(this.evt(s, 'build'));
  }

  /** the zone growth of a lot's zone if the lot is reachable, else 0 */
  private openness(l: Lot, ctx: TownCtx): number {
    if ((this.holdUntil.get(l.key) ?? -Infinity) > this.t) return 0;
    return ctx.reachable(l) ? zoneGrowth(this.access[zoneOf(l.c.x, l.c.y)]) : 0;
  }

  /** one weighted pick among the best PICK_TOP candidates of the side (ANY, GRAVEL or PAVED: see the constants); null if none can grow */
  private pick(ctx: TownCtx, side: number): Lot | null {
    const n = this.cand.length; if (!n) return null;
    if (this.w.length < n) { this.w = new Float64Array(2 * n); this.sel = new Int32Array(2 * n); }
    const w = this.w, sel = this.sel; let m = 0;
    for (let i = 0; i < n; i++) {
      const l = this.cand[i]; w[i] = 0;
      if (side && (side === PAVED) === (l.cls === 'gravel')) continue;
      const zg = this.openness(l, ctx); if (zg <= 0) continue;
      const d = this.nAct ? this.candDn[i] : dist(l.c, ctx.entry);
      w[i] = zg * Math.exp(-d / 40) * lotValue(l); sel[m++] = i;
    }
    if (!m) return null;
    const q = this.drawTop(w, sel, m); return q < 0 ? null : this.cand[q];
  }

  /** one weighted pick among the best candidates of town k (the town's own lots, weighted by distance to its centre or the
   *  nearest lot not EMPTY); null if none can grow */
  private pickTown(ctx: TownCtx, k: number): Lot | null {
    const n = this.cand.length; if (!n) return null;
    if (this.w.length < n) { this.w = new Float64Array(2 * n); this.sel = new Int32Array(2 * n); }
    const w = this.w, sel = this.sel; let m = 0;
    let has = false;
    for (const s of this.states.values()) if (s.use !== LU.NONE && this.townOf(s.key) === k) { has = true; break; }
    const cen = this.centres[k];
    for (let i = 0; i < n; i++) {
      const l = this.cand[i]; w[i] = 0;
      if (this.townOf(l.key) !== k) continue;
      const zg = this.openness(l, ctx); if (zg <= 0) continue;
      const d = has ? this.candDn[i] : dist(l.c, cen);
      const wi = zg * Math.exp(-d / 40) * lotValue(l); if (wi <= 0) continue;
      w[i] = wi; sel[m++] = i;
    }
    if (!m) return null;
    const q = this.drawTop(w, sel, m); return q < 0 ? null : this.cand[q];
  }

  /** the seeded weighted draw among the best PICK_TOP of the m candidates sel[0..m) (weights w): one draw; the candidate index */
  private drawTop(w: Float64Array, sel: Int32Array, m: number): number {
    const idx = sel.subarray(0, m); idx.sort((a, b) => w[b] - w[a]);
    const K = Math.min(PICK_TOP, m); let tot = 0;
    for (let j = 0; j < K; j++) tot += w[idx[j]];
    let r = this.rnd() * tot;
    for (let j = 0; j < K; j++) { r -= w[idx[j]]; if (r < 0 || j === K - 1) return idx[j]; }
    return -1;
  }

  /** the land use of a chosen lot: the scores times the share balance, the option and seeded noise; the highest wins */
  private useFor(l: Lot, ctx: TownCtx): number {
    const cid = l.seg.cls.id, w = this.option.w, sc = this.sc, mul = this.mul;
    const k = this.townOf(l.key);
    const tc = k >= 0 && k < this.centres.length ? this.centres[k]! : (this.centres.length > 0 ? this.centres[0]! : null);
    if (tc !== null) {
      const indR = industrialRect(tc, ctx.entry);
      if (inIndustrial(l.c, indR)) return LU.IND;
      if (inCommercial(l.c, cid, tc)) return LU.COM;
    }
    // the targets: the base shares times the option, renormalised over RES, COM, IND, TOUR
    let tot = 0; for (let u = 0; u < 4; u++) tot += TARGET[u + 1] * w[u];
    // the share balance: a use below its target share scores up to 3x, above it down to 0.3x (raw until MIN_OCC lots)
    for (let u = 0; u < 4; u++) {
      const t = TARGET[u + 1] * w[u] / tot;
      mul[u] = this.occ < MIN_OCC ? 1 : Math.min(3, Math.max(0.3, 1 + 2 * (t - this.cnt[u + 1] / this.occ) / t));
    }
    // the residents near (industry keeps away from them), and the shops beside it on the same side of the same street
    let nr = 0, nc = 0;
    for (const s of this.states.values()) {
      if (s.level === LV.EMPTY) continue;
      const g = this.geo.get(s.key)!, d = dist(g.c, l.c);
      if (s.use === LU.RES && d <= 30) nr++;
      if (s.use === LU.COM && d <= COM_ROW && g.n.x * l.n.x + g.n.y * l.n.y > 0.9) nc++;
    }
    const de = dist(l.c, ctx.entry), wat = ctx.water(l.c.x, l.c.y);
    if (tc !== null) {
      // In a town outside commercial/industrial districts: IND scores 0, COM score * 0.35, mul[1] clamped <= 1, no COM_PULL
      sc[0] = (1 + (cid === 'gravel' || cid === 'lane' || cid === 'street' ? 0.5 : 0)) * mul[0];
      const comMul = Math.min(1, mul[1]);
      sc[1] = (0.5 + (cid === 'road' || cid === 'avenue' || cid === 'arterial' ? 0.6 : 0) + (cid === 'boulevard' ? 1 : 0) + (l.corner ? 0.4 : 0)) * comMul * 0.35;
      sc[2] = 0;
      sc[3] = (0.1 + (wat <= 40 ? 1 : 0) + (cid === 'boulevard' ? 0.6 : 0)) * mul[3];
    } else {
      // Legacy uncentred grid: original allocation
      sc[0] = (1 + (cid === 'gravel' || cid === 'lane' || cid === 'street' ? 0.5 : 0)) * mul[0];
      sc[1] = (0.5 + (cid === 'road' || cid === 'avenue' || cid === 'arterial' ? 0.6 : 0) + (cid === 'boulevard' ? 1 : 0) + (l.corner ? 0.4 : 0)) * mul[1] * (1 + COM_PULL * Math.min(2, nc));
      if (nc) sc[0] *= COM_PUSH;
      sc[2] = (0.2 + (de <= 120 ? 1.2 : 0)) * (nr > 4 ? 0.3 : 1) * mul[2];
      sc[3] = (0.1 + (wat <= 40 ? 1 : 0) + (cid === 'boulevard' ? 0.6 : 0)) * mul[3];
    }
    let best = LU.RES, bv = -1;
    for (let u = 0; u < 4; u++) { const v = sc[u] * (1 + NOISE * (2 * this.rnd() - 1)); if (v > bv) { bv = v; best = u + 1; } }
    return best;
  }

  /** the civic lots wanted: one per 400 residents, the first at 200 (scaled by the option's GOV multiplier) */
  private govTarget(): number { return this.pop < 200 ? 0 : Math.round((1 + Math.floor((this.pop - 200) / 400)) * this.option.w[4]); }

  /** the centre of town k: the mean of its lots not NONE (the centre while it has none) */
  private townCentre(k: number): Pt {
    let sx = 0, sy = 0, m = 0;
    for (const s of this.states.values()) if (s.use !== LU.NONE && this.townOf(s.key) === k) { const c = this.geo.get(s.key)!.c; sx += c.x; sy += c.y; m++; }
    return m ? { x: sx / m, y: sy / m } : this.centres[k];
  }

  /** place one GOV lot on the best road class among the open candidates nearest the centre of the built area (with centres: of
   *  the town with the most residents per civic lot, and its candidates only); level BUILDING, or BUILT for an instant one */
  private placeGov(ctx: TownCtx, T: number, ev: TownEvent[], level: number = LV.BUILDING) {
    let cen: Pt, k = -1;
    if (this.centres.length) {
      k = 0; for (let j = 1; j < this.centres.length; j++) if (this.popK[j] / (this.govK[j] + 1) > this.popK[k] / (this.govK[k] + 1)) k = j;
      cen = this.townCentre(k);
    } else {
      let sx = 0, sy = 0, m = 0;
      for (const s of this.states.values()) if (s.use !== LU.NONE) { const c = this.geo.get(s.key)!.c; sx += c.x; sy += c.y; m++; }
      cen = { x: m ? sx / m : ctx.entry.x, y: m ? sy / m : ctx.entry.y };
    }
    const ok: number[] = [];
    for (let i = 0; i < this.cand.length; i++) if (this.openness(this.cand[i], ctx) > 0 && (k < 0 || this.townOf(this.cand[i].key) === k)) ok.push(i);
    if (!ok.length) return;
    const dc = (i: number) => dist(this.cand[i].c, cen);
    ok.sort((i, j) => dc(i) - dc(j));
    let best = ok[0];
    for (const i of ok.slice(0, 40)) if (this.cand[i].seg.cls.order > this.cand[best].seg.cls.order) best = i;
    const s = this.states.get(this.cand[best].key)!;
    this.set(s, LU.GOV, level, 0, T); ev.push(this.evt(s, level >= LV.BUILT ? 'complete' : 'build'));
  }

  /** a lot's town index from its centre (-1 with no centres); its totals move when the town changes (s: its state, null if new) */
  private townSet(s: LotState | null, key: string, c: Pt) {
    const o = this.townOf(key), n = this.nearest(c);
    if (s && o !== n) { this.townAdd(o, s, -1); this.townAdd(n, s, 1); }
    this.townIdx.set(key, n);
  }
  /** the nearest centre to c (ties: the lowest index), -1 with no centres */
  private nearest(c: Pt): number {
    let best = -1, bd = Infinity;
    for (let k = 0; k < this.centres.length; k++) { const d = (c.x - this.centres[k].x) ** 2 + (c.y - this.centres[k].y) ** 2; if (d < bd) { bd = d; best = k; } }
    return best;
  }
  /** adds (sg = 1) or removes (sg = -1) a lot's residents, built and GOV counts to town k (none for k < 0) */
  private townAdd(k: number, s: LotState, sg: number) {
    if (k < 0) return;
    this.popK[k] += sg * s.pop; if (s.level >= LV.BUILT) this.builtK[k] += sg; if (s.use === LU.GOV) this.govK[k] += sg;
  }

  /** a state change: keeps the totals, the candidates and the distances to the lots not EMPTY */
  private set(s: LotState, use: number, level: number, decline: number, T: number) {
    const was = s.use !== LU.NONE, k = this.townOf(s.key);
    if (s.level !== LV.EMPTY) { this.cnt[s.use]--; this.occ--; }
    this.pop -= s.pop; this.jobs -= s.jobs;
    if (k >= 0) this.popK[k] -= s.pop;
    if (was) this.nAct--; if (s.level >= LV.BUILT) this.built--; if (s.use === LU.GOV) this.govN--;
    if (k >= 0) { if (s.level >= LV.BUILT) this.builtK[k]--; if (s.use === LU.GOV) this.govK[k]--; }
    s.use = use; s.level = level; s.decline = decline; s.since = T;
    s.pop = yieldOf(POP, s); s.jobs = yieldOf(JOBS, s);
    this.pop += s.pop; this.jobs += s.jobs;
    if (k >= 0) this.popK[k] += s.pop;
    if (level !== LV.EMPTY) { this.cnt[use]++; this.occ++; }
    const is = use !== LU.NONE;
    if (is) this.nAct++; if (level >= LV.BUILT) this.built++; if (use === LU.GOV) this.govN++;
    if (k >= 0) { if (level >= LV.BUILT) this.builtK[k]++; if (use === LU.GOV) this.govK[k]++; }
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

  private evt(s: LotState, kind: TownEvent['kind']): TownEvent { return { key: s.key, kind, use: s.use, level: s.level, decline: s.decline, seed: s.seed, since: s.since }; }

  /** the seeded stream (mulberry32): [0, 1) */
  private rnd(): number {
    let t = (this.rs = (this.rs + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

/** the built lots (BUILT or UPGRADED) of a town with their parcels, for the lot trips (sim.setBuilt) */
export function builtLots(town: Town, lm: LotMap): Built[] {
  const out: Built[] = [];
  for (const s of town.states.values()) if (s.level >= LV.BUILT && s.use !== LU.NONE) { const lot = lm.lots.get(s.key); if (lot) out.push({ lot, use: s.use, pop: s.pop, jobs: s.jobs }); }
  return out;
}

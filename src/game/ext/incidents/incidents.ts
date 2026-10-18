// Traffic incidents (T008): breakdowns and crashes, the rates that produce them, the lanes they block, the rubbernecking
// slow zones and how long they last. Pure TS, no DOM: once a step (or a second) the sim hands over what its traffic did
// (vehicle-metres per lane, junction passages with their conflicting flows) and takes the new incidents back; it does the
// blocking, the slow zones and the tow truck itself (calling clear(id) when the truck gets there).
// Units: metres and sim seconds (a game day is 1440 sim s: one sim s is one game minute), lane ids of the lane graph.
import { mulberry } from '../../iso';

/** sim seconds in a game day (as in sim/trips.ts: one sim s is one game minute, midnight at t = 0) */
export const DAY = 1440;
/** the clock's night runs from 22:00 to 06:00 (game hours of the day: (t / 60) % 24) */
export const NIGHT_FROM = 22, NIGHT_TO = 6;

/** base breakdown rate in free flow by day, breakdowns per million vehicle-km (about 3x the real roadside rate: a game
 *  day is 24 minutes, so about 7 incidents a game day keep a 3,000-car city alive) */
export const BREAK_PER_MKM = 150;
/** base mid-lane crash rate in free flow by day, crashes per million vehicle-km */
export const CRASH_PER_MKM = 4;
/** base junction crash rate with no conflicting flow, crashes per million junction passages */
export const JUNCTION_CRASH_PER_MPASS = 1;
/** the conflicting flow, veh/h, at which a junction's risk factor is 2 (the factor is 1 + (load / ref)^1.5) */
export const CONFLICT_REF = 600;
/** the factor on every rate at night */
export const NIGHT = 1.4;
/** the clearance of a breakdown with no tow truck, sim s: 10 to 20 min */
export const CLEAR_BREAKDOWN: readonly [number, number] = [600, 1200];
/** the clearance of a crash with no tow truck, sim s: 20 to 60 min */
export const CLEAR_CRASH: readonly [number, number] = [1200, 3600];
/** the rubbernecking zone either way from an incident, m: a 200 m stretch each side */
export const RUBBER_M = 200;
/** the rubbernecking speed factor's range: passing traffic drives at 0.6 to 0.8 of its limit */
export const SLOW: readonly [number, number] = [0.6, 0.8];
/** the share of crashes that block two lanes (the rest block one) */
export const CRASH_TWO = 0.35;

/** what the traffic did on one lane this step: the lane's id, the metres its vehicles drove (summed over the lane; 1000 m
 *  is one vehicle-km), its density (veh/km/lane) and its stop-go share (0..1). Optional s: metres along the lane to place
 *  an incident at (given by the caller); without it the model draws s along len (or uses 0 without len). Optional lanes:
 *  the lanes in this direction, which caps a crash's blocks (without it, up to 2) */
export interface Exposure {
  lane: number; metres: number; density: number; stopGo: number;
  s?: number; len?: number; lanes?: number;
}
/** the passages through one junction this step: the node's key (the caller's bookkeeping), the conflicting flow, veh/h,
 *  and the passages this entry stands for (count, default 1). Optional lane and s: where a junction crash struck (without
 *  a lane it falls back to a lane drawn from this step's exposure; without s, s = 0) */
export interface Passage {
  node: string; conflictLoad: number; count?: number;
  lane?: number; s?: number;
}
/** a rubbernecking zone: the lane, the stretch metres [from, to] along it and the speed factor there (0.6 to 0.8) */
export interface SlowZone { lane: number; from: number; to: number; factor: number }
/** one incident: its kind, the lane it is on and metres along it, the lanes it blocks (1, or 2 for a crash), its start and
 *  clearance times (sim s) and the slow zones it adds */
export interface Incident {
  id: number; kind: 'breakdown' | 'crash'; lane: number; s: number; blocks: number;
  start: number; clearAt: number; slowZone: SlowZone[];
}

/** the chance of one or more events in a step with mean l (1 - exp(-l)); linear for tiny l, where the error is under 0.05% */
const chance = (l: number) => (l < 1e-3 ? l : -Math.expm1(-l));
/** 0..1, NaN and negatives to 0 */
const clamp01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0);

/** the breakdown rate at a lane, breakdowns per vehicle-km: stop-and-go and dense traffic (heat, wear, stalls) and night
 *  each raise it; density in veh/km/lane, stopGo 0..1 */
export function breakdownRate(density: number, stopGo: number, night = false): number {
  const k = 1 + 1.2 * clamp01(stopGo) + 0.8 * clamp01(density / 60);
  return BREAK_PER_MKM * 1e-6 * k * (night ? NIGHT : 1);
}
/** the mid-lane crash rate at a lane, crashes per vehicle-km: stop-and-go and dense traffic raise it far more than a
 *  breakdown, and night raises it again; density in veh/km/lane, stopGo 0..1 */
export function crashRate(density: number, stopGo: number, night = false): number {
  const k = 1 + 4 * clamp01(stopGo) + 2.5 * clamp01(density / 50);
  return CRASH_PER_MKM * 1e-6 * k * (night ? NIGHT : 1);
}
/** the crash rate of one junction passage, crashes per passage: a heavy conflicting flow (veh/h, 600 = a factor of 2,
 *  1200 = 3.8) is what makes junction crashes concentrate at the busy nodes; night raises it */
export function junctionCrashRate(conflictLoad: number, night = false): number {
  const k = conflictLoad > 0 ? conflictLoad / CONFLICT_REF : 0;
  return JUNCTION_CRASH_PER_MPASS * 1e-6 * (1 + k * Math.sqrt(k)) * (night ? NIGHT : 1);
}
/** true in the clock's night: 22:00 to 06:00, t in sim s (a game hour is 60 sim s, midnight at 0) */
export function nightAt(t: number): boolean {
  const h = ((t / 60) % 24 + 24) % 24;
  return h >= NIGHT_FROM || h < NIGHT_TO;
}

/** the empty answer of a step with no new incidents (shared: do not mutate it) */
const NONE: Incident[] = [];

/**
 * The incident model of one city: seeded, stepped with what the traffic did. It keeps the active incidents (at most one
 * per lane at a time: a lane already held by an incident takes no new one), hands out new ones with increasing ids, and
 * expires them at their clearAt unless the caller clears them earlier (a tow truck).
 */
export class Incidents {
  private rnd: () => number;
  private next = 1;
  /** the active incidents by id, oldest first */
  private live = new Map<number, Incident>();
  /** the lanes those incidents hold */
  private lanes = new Set<number>();
  /** the earliest clearAt among the active incidents (Infinity when none): steps before it skip the expiry scan */
  private nextClear = Infinity;

  constructor(seed: number) { this.rnd = mulberry(seed); }

  /** the incidents the traffic's exposure and junction passages cause this step, to start at t: at most one per lane,
   *  only the new ones (start = t); an incident already on a lane holds it until clearAt or clear(id). metres is that
   *  lane's vehicle-metres this step (aggregate steps of any length: the rates are per vehicle-km); t is also the clock
   *  for night (see nightAt) and the timeline the clearances run on */
  step(t: number, exposure: Exposure[], passages: Passage[]): Incident[] {
    this.expire(t);
    const night = nightAt(t);
    let out: Incident[] | null = null;
    for (let k = 0; k < exposure.length; k++) {
      const e = exposure[k]!;
      if (!(e.metres > 0) || this.lanes.has(e.lane)) continue;
      const km = e.metres * 1e-3;
      const pc = chance(km * crashRate(e.density, e.stopGo, night));
      const pb = chance(km * breakdownRate(e.density, e.stopGo, night));
      // both draws every time (one per process), so the stream does not depend on which rate fired; a crash wins a tie
      const crash = this.rnd() < pc, breakdown = this.rnd() < pb;
      let a: Incident | null = null;
      if (crash) a = this.make(t, 'crash', e.lane, e.len, e.lanes, e.s);
      else if (breakdown) a = this.make(t, 'breakdown', e.lane, e.len, e.lanes, e.s);
      if (a) { if (out) out.push(a); else out = [a]; }
    }
    for (let k = 0; k < passages.length; k++) {
      const p = passages[k]!;
      const n = p.count ?? 1;
      if (!(n > 0) || (p.lane !== undefined && this.lanes.has(p.lane))) continue;
      if (this.rnd() >= chance(n * junctionCrashRate(p.conflictLoad, night))) continue;
      let lane = p.lane, len: number | undefined;
      if (lane === undefined) {
        const e = this.pick(exposure);
        if (!e) continue;
        lane = e.lane; len = e.len;
      }
      const a = this.make(t, 'crash', lane, len, undefined, p.s);
      if (out) out.push(a); else out = [a];
    }
    return out ?? NONE;
  }

  /** the incidents active at t (start <= t < clearAt), oldest first; the expired ones are dropped on the way */
  active(t: number): Incident[] {
    this.expire(t);
    const out: Incident[] = [];
    for (const a of this.live.values()) if (a.start <= t) out.push(a);
    return out;
  }

  /** clears an incident at once (a tow truck arrived, or the road was rebuilt): it leaves active() and frees its lane */
  clear(id: number): void {
    const a = this.live.get(id);
    if (!a) return;
    this.live.delete(id);
    this.lanes.delete(a.lane);
  }

  /** drops the incidents whose clearAt has come (and keeps nextClear the earliest of the rest) */
  private expire(t: number): void {
    if (t < this.nextClear) return;
    let min = Infinity;
    for (const [id, a] of this.live) {
      if (a.clearAt <= t) { this.live.delete(id); this.lanes.delete(a.lane); }
      else if (a.clearAt < min) min = a.clearAt;
    }
    this.nextClear = min;
  }

  /** a lane drawn from the exposure by vehicle-metres (not one already held), or null: the fallback place of a junction
   *  crash whose passage came without a lane */
  private pick(exposure: Exposure[]): Exposure | null {
    let tot = 0;
    for (let k = 0; k < exposure.length; k++) {
      const e = exposure[k]!;
      if (e.metres > 0 && !this.lanes.has(e.lane)) tot += e.metres;
    }
    if (!(tot > 0)) return null;
    let r = this.rnd() * tot, last: Exposure | null = null;
    for (let k = 0; k < exposure.length; k++) {
      const e = exposure[k]!;
      if (!(e.metres > 0) || this.lanes.has(e.lane)) continue;
      last = e;
      if ((r -= e.metres) < 0) return e;
    }
    return last;
  }

  /** a new incident at t on the lane, s metres along it (sAt, or drawn along len; 0 without len): its blocks (a crash
   *  blocks two lanes with chance CRASH_TWO, never more than lanes), slow zone and clearance, and it holds the lane */
  private make(t: number, kind: 'breakdown' | 'crash', lane: number, len?: number, lanes?: number, sAt?: number): Incident {
    const s = sAt ?? (len !== undefined && len > 0 ? Math.round(this.rnd() * len * 10) / 10 : 0);
    const [lo, hi] = kind === 'crash' ? CLEAR_CRASH : CLEAR_BREAKDOWN;
    const clearAt = t + Math.round((lo + (hi - lo) * this.rnd()) * 10) / 10;
    const blocks = Math.max(1, Math.min(kind === 'crash' && this.rnd() < CRASH_TWO ? 2 : 1, lanes ?? 2));
    const factor = Math.round((SLOW[0] + (SLOW[1] - SLOW[0]) * this.rnd()) * 1000) / 1000;
    const from = Math.max(0, s - RUBBER_M);
    const to = len !== undefined && len > 0 ? Math.min(len, s + RUBBER_M) : s + RUBBER_M;
    const a: Incident = { id: this.next++, kind, lane, s, blocks, start: t, clearAt, slowZone: [{ lane, from, to, factor }] };
    this.live.set(a.id, a);
    this.lanes.add(lane);
    if (clearAt < this.nextClear) this.nextClear = clearAt;
    return a;
  }
}

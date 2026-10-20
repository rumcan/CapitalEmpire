// The business visits (Phase B step 3, design in docs/BUSINESSES.md): each visit business's day as cars. At plan, the day's demand (dailyDemand) becomes
// departures from the towns' homes, in the business's opening hours; each car has a home (by town, then by population) and a door on the road.
// Step spawns the due ones from their home's driveway, bound for the door, as the surge does for its parties; the sim reports each car's exit
// (Sim.visitOut) and the counts follow. Pure TS, no DOM, its own random stream (given to plan).
import type { Lot } from '../lots/lots';
import type { Seg } from '../network';
import type { LaneGraph } from '../sim/lanes';
import type { Sim } from '../sim/sim';
import { driveway, type Drive } from '../sim/trips';
import { dailyDemand, type BusinessType } from './catalogue';

/** a visit car is on time when its trip takes at most this many times its ideal time (Sim.visitOut's ratio) */
export const ON_TIME_RATIO = 2;
/** the most departures spawned in one step (the rest wait for the next) */
const MAX_SPAWN = 30;
/** the outcomes of one spawn attempt: spawned (or lost at once: the sim logs it), wait for room, or missed (no door, no driveway, or past the door) */
const SPAWNED = 1, WAIT = 0, MISSED = -1;

/** a door on the road: the dseg (the direction whose traffic has the business on its right) and s (m) along its lane */
export interface Door { dseg: number; s: number }
/** a home a visit car leaves from: its lot, its town, its residents (the weight) */
export interface VisitHome { lot: Lot; town: number; pop: number }
/** a visit business as the day's plan reads it: id, type, level, satisfaction, its door (null: no road near it: no visitors), and per town the driving
 *  minutes to it (real minutes, see catalogue.ts) */
export interface VisitBiz { id: number; type: BusinessType; level: number; sat: number; door: Door | null; tripMin: number[] }
/** a business's counts for the day: cars planned, spawned, arrived on time, arrived late, and missed (never spawned, or lost on the road) */
export interface VisitCounts { planned: number; spawned: number; onTime: number; late: number; missed: number }
/** a planned departure: its clock time (s), its business's id, and its home lot */
interface Dep { t: number; id: number; lot: Lot }

/** the index of the first cumulative weight above x (cum ascending; x in [0, cum[last])) */
function pickCum(cum: number[], x: number): number {
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m]! > x) hi = m; else lo = m + 1; }
  return lo;
}

/** The visit businesses' cars of the day: the plans (departures by time), the counts per business, and the driveways */
export class Visits {
  /** the departures not yet due (sorted by time, from next on) and the due ones not yet spawned (in order) */
  private sched: Dep[] = []; private next = 0; private pend: Dep[] = [];
  /** per business: today's counts (a business with a plan has an entry), and its door (set by plan and onGraph) */
  private cnt = new Map<number, VisitCounts>(); private doors = new Map<number, Door | null>();
  /** the driveways by lot key and by seg (cleared on each graph update) */
  private drives = new Map<string, Drive | null>(); private bySeg: Map<Seg, number[]> | null = null;

  /** plans the departures of every business in list that has no plan yet for the day starting at dayStart (clock s), from clock `from` on (a business
   *  placed mid-day gets only the rest of its hours). Its cars: n = round(dailyDemand(type, level, catchment, sat, mul)) where the catchment of town k is
   *  { pop: pops[k], tripMin: tripMin[k] }; each car: a town by the weights pops[k] * exp(-tripMin[k] / tau) (only towns with homes), a home of that town
   *  by population, and a departure at dayStart + (open + u * (close - open)) * 60 with u uniform (a car before `from` is drawn but not kept, not counted).
   *  A business with no door or no homes plans none (and is not marked planned). The pending departures of the other businesses stay */
  plan(dayStart: number, from: number, list: VisitBiz[], homes: VisitHome[][], pops: number[], rnd: () => number, mul = 1): void {
    const keep = this.pend.concat(this.sched.slice(this.next)); this.pend = []; this.next = 0;
    for (const b of list) {
      this.doors.set(b.id, b.door);
      if (this.cnt.has(b.id)) continue;
      const K = pops.length, towns: number[] = [], cumT: number[] = [], cumH: number[][] = [];
      let tot = 0;
      for (let k = 0; k < K; k++) {
        const hs = homes[k] ?? [];
        let hp = 0; const ch: number[] = [];
        for (const h of hs) { hp += h.pop; ch.push(hp); }
        if (!(hp > 0) || !b.door) continue;
        const w = pops[k]! * Math.exp(-(b.tripMin[k] ?? Infinity) / b.type.tau);
        if (!(w > 0)) continue;
        tot += w; towns.push(k); cumT.push(tot); cumH.push(ch);
      }
      // no door or no homes yet: no plan (a later call the same day may plan it)
      if (!towns.length) continue;
      const c: VisitCounts = { planned: 0, spawned: 0, onTime: 0, late: 0, missed: 0 };
      this.cnt.set(b.id, c);
      const catchment = pops.map((p, k) => ({ pop: p, tripMin: b.tripMin[k] ?? Infinity }));
      const n = Math.round(dailyDemand(b.type, b.level, catchment, b.sat, mul));
      const open = b.type.hours[0], span = b.type.hours[1] - b.type.hours[0];
      for (let i = 0; i < n; i++) {
        const j = pickCum(cumT, rnd() * tot), k = towns[j]!, ch = cumH[j]!;
        const lot = homes[k]![pickCum(ch, rnd() * ch[ch.length - 1]!)]!.lot;
        const u = rnd(), t = dayStart + (open + u * span) * 60;
        if (t < from) continue;
        keep.push({ t, id: b.id, lot }); c.planned++;
      }
    }
    keep.sort((a, b) => a.t - b.t);
    this.sched = keep;
  }

  /** once per City step: the departures due by clock join the pending ones, and each pending car tries to spawn, in order, up to MAX_SPAWN a step.
   *  A car with no room on its driveway waits for the next step; one with no door, no driveway, or past its door on the door's dseg is missed. A car the
   *  sim refuses for no route is lost at once (the sim logs its exit, see event) */
  step(sim: Sim, g: LaneGraph, clock: number): void {
    while (this.next < this.sched.length && this.sched[this.next]!.t <= clock) this.pend.push(this.sched[this.next++]!);
    if (!this.pend.length) return;
    let n = 0, w = 0;
    for (let i = 0; i < this.pend.length; i++) {
      const d = this.pend[i]!, c = this.cnt.get(d.id);
      if (!c) continue;
      if (n >= MAX_SPAWN) { this.pend[w++] = d; continue; }
      const r = this.spawn(d, sim, g);
      if (r === WAIT) this.pend[w++] = d;
      else { n++; if (r === MISSED) c.missed++; else c.spawned++; }
    }
    this.pend.length = w;
  }

  /** one spawn attempt for departure d: SPAWNED, WAIT (no room on the driveway) or MISSED */
  private spawn(d: Dep, sim: Sim, g: LaneGraph): number {
    const door = this.doors.get(d.id);
    if (!door) return MISSED;
    const o = this.drive(d.lot, g);
    if (!o) return MISSED;
    if (g.lanes[o.lane]!.dseg === door.dseg && o.s >= door.s) return MISSED;
    return sim.spawnAt(o.lane, o.s, door.dseg, door.s, 0, -1, -1, d.id) === -1 ? WAIT : SPAWNED;
  }

  /** the driveway of a lot, cached until the next graph update */
  private drive(lot: Lot, g: LaneGraph): Drive | null {
    let d = this.drives.get(lot.key);
    if (d === undefined) {
      if (!this.bySeg) {
        this.bySeg = new Map();
        for (const ds of g.dsegs) if (ds) { const q = this.bySeg.get(ds.seg); if (q) q.push(ds.id); else this.bySeg.set(ds.seg, [ds.id]); }
      }
      d = driveway(lot, g, this.bySeg); this.drives.set(lot.key, d);
    }
    return d;
  }

  /** a visit car left the sim (from Sim.visitOut): kind 0 arrived (on time when its ratio is at most ON_TIME_RATIO, else late), kind 1 lost (missed) */
  event(id: number, kind: number, ratio: number): void {
    const c = this.cnt.get(id); if (!c) return;
    if (kind === 1) c.missed++; else if (ratio <= ON_TIME_RATIO) c.onTime++; else c.late++;
  }

  /** today's counts of business id (zeros if it has no plan) */
  counts(id: number): VisitCounts { return { ...(this.cnt.get(id) ?? { planned: 0, spawned: 0, onTime: 0, late: 0, missed: 0 }) }; }

  /** closes the day: each business's counts, the departures not yet spawned counted as missed; the plans and counts are cleared (the cars still on the
   *  road are counted when they arrive, in the new day) */
  endDay(): Map<number, VisitCounts> {
    for (const d of this.pend) { const c = this.cnt.get(d.id); if (c) c.missed++; }
    for (let i = this.next; i < this.sched.length; i++) { const c = this.cnt.get(this.sched[i]!.id); if (c) c.missed++; }
    const out = new Map<number, VisitCounts>();
    for (const [id, c] of this.cnt) out.set(id, { ...c });
    this.cnt = new Map(); this.sched = []; this.next = 0; this.pend = [];
    return out;
  }

  /** drops a business's plan and door (it was demolished): its departures go, its counts with them */
  drop(id: number): void {
    this.cnt.delete(id); this.doors.delete(id);
    const keep = this.pend.concat(this.sched.slice(this.next)).filter(d => d.id !== id);
    this.pend = []; this.next = 0; this.sched = keep;
  }

  /** after a graph update: the driveways are looked up again, and the doors are the City's new ones (doors: each visit business's door by id, null: none) */
  onGraph(doors: Map<number, Door | null>): void { this.drives.clear(); this.bySeg = null; this.doors = new Map(doors); }

  /** the departures not yet spawned (clock s, business id, home lot), in order: for the tests */
  schedule(): { t: number; id: number; lot: Lot }[] { return this.pend.concat(this.sched.slice(this.next)); }
}

// The surge (Phase 5 step 4): the crowd of an event round, sent as party cars from their homes to the car parks joined to their roads. At
// plan, each town's cars get a departure time in the first DEPART_END of the surge (a bell around its middle), an origin (a home of the
// town, by population) and a destination (a car park joined to the home's road, by bays, then its entrances round-robin). Step spawns the
// due ones from their driveways, bound for their sinks; the sim reports each party car's exit (Sim.partyOut) and the counts follow.
// Pure TS, no DOM, its own random stream (SURGE_SEED, given to plan).
import type { Lot } from '../lots/lots';
import type { Seg } from '../network';
import type { LaneGraph } from '../sim/lanes';
import type { Sim } from '../sim/sim';
import { driveway, type Drive } from '../sim/trips';
import { DEPART_END, SURGE_S } from './config';
import type { FanCounts } from './crowd';

/** a home the crowd leaves from: its lot, its town, its residents (the weight), and the component of its frontage road (see City) */
export interface SurgeHome { lot: Lot; town: number; pop: number; comp: number }
/** a car park as the surge sees it: the component of its frontage road, its bays (the weight), and its entrances (sink indices into Sim.sinks) */
export interface SurgePark { comp: number; bays: number; sinks: number[] }
/** a town's counts at kick-off: the cars sent, parked, turned away, lost, stranded (never spawned), and late (on the road or never left), and its fans
 *  (each parked car is PARTY fans): at the doors (fans), at a lot stop's queue (atStop), and on a bus (onBus) */
export interface TownResult { sent: number; parked: number; turned: number; lost: number; stranded: number; late: number; fans: number; atStop: number; onBus: number }
/** the surge as the UI sees it, per town: the cars sent, parked, on the road, turned away, lost and stranded, and the fans at the doors, at a lot stop and on a bus */
export interface SurgeView { sent: number[]; parked: number[]; onRoad: number[]; turned: number[]; lost: number[]; stranded: number[]; fans: number[]; atStop: number[]; onBus: number[] }

/** a departure: its sim time, its town, its origin lot, its car park (an index into the park list) and its entrance ordinal (round-robin) */
interface Dep { t: number; town: number; lot: Lot; park: number; e: number }
/** the most cars spawned in one step */
const MAX_SPAWN = 60;
/** the outcomes of one spawn attempt: spawned, wait for room, or stranded (cannot leave) */
const SPAWNED = 1, WAIT = 0, STRANDED = -1;

/** the index of the first cumulative weight above x (cum ascending; x in [0, cum[last])) */
function pickCum(cum: number[], x: number): number {
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m]! > x) hi = m; else lo = m + 1; }
  return lo;
}

/** The surge of one round: the schedule of the crowd's departures and the per-town counts of their cars */
export class Surge {
  /** per town: the cars sent, departed (spawned, or lost at once), parked, turned away, lost, and stranded */
  private sent: number[] = []; private departed: number[] = []; private parked: number[] = []; private turned: number[] = [];
  private lost: number[] = []; private stranded: number[] = [];
  /** the departures in time order, the next one to come due, and the due ones not yet spawned (in order) */
  private sched: Dep[] = []; private next = 0; private pend: Dep[] = [];
  /** the car parks (see SurgePark), the next entrance ordinal per park, and the driveways by lot key and by seg (cleared on each graph update) */
  private parks: SurgePark[] = []; private rr: number[] = [];
  private drives = new Map<string, Drive | null>(); private bySeg: Map<Seg, number[]> | null = null;

  /** plans the surge at t0 (sim s): crowd[k] cars from town k, homes[k] the homes of town k, parks the car parks, rnd the surge's own stream.
   *  A home counts only with a car park joined to its road (the same comp); a town with no such home sends its whole crowd stranded (no draws).
   *  Each car: a home by population, a park by bays, and a departure at t0 + SURGE_S * DEPART_END * u, u the mean of three draws (a bell at the middle). */
  plan(crowd: number[], homes: SurgeHome[][], parks: SurgePark[], rnd: () => number, t0: number): void {
    const K = crowd.length;
    this.parks = parks; this.rr = parks.map(() => 0);
    this.sent = crowd.slice(); this.departed = crowd.map(() => 0); this.parked = crowd.map(() => 0); this.turned = crowd.map(() => 0);
    this.lost = crowd.map(() => 0); this.stranded = crowd.map(() => 0);
    this.sched = []; this.next = 0; this.pend = []; this.drives.clear(); this.bySeg = null;
    // the car parks with bays and entrances, by component, with the cumulative bays of each component's list
    const byComp = new Map<number, { ids: number[]; cum: number[] }>();
    parks.forEach((p, i) => {
      if (!(p.bays > 0) || !p.sinks.length) return;
      let L = byComp.get(p.comp);
      if (!L) { L = { ids: [], cum: [] }; byComp.set(p.comp, L); }
      L.ids.push(i); L.cum.push((L.cum.length ? L.cum[L.cum.length - 1]! : 0) + p.bays);
    });
    for (let k = 0; k < K; k++) {
      const hs: SurgeHome[] = [], hc: number[] = []; let tot = 0;
      for (const h of homes[k] ?? []) if (h.pop > 0 && byComp.has(h.comp)) { hs.push(h); tot += h.pop; hc.push(tot); }
      if (!hs.length || !(tot > 0)) { this.stranded[k] = crowd[k]!; continue; }
      for (let c = 0; c < crowd[k]!; c++) {
        const h = hs[pickCum(hc, rnd() * tot)]!, L = byComp.get(h.comp)!;
        const park = L.ids[pickCum(L.cum, rnd() * L.cum[L.cum.length - 1]!)]!;
        const u = (rnd() + rnd() + rnd()) / 3;
        this.sched.push({ t: t0 + SURGE_S * DEPART_END * u, town: k, lot: h.lot, park, e: 0 });
      }
    }
    // the entrances round-robin in departure order (the sort is stable: equal times keep their draw order)
    this.sched.sort((a, b) => a.t - b.t);
    for (const d of this.sched) d.e = this.rr[d.park]!++;
  }

  /** the car parks' lists now (after a network edit: the sinks' indices may have moved, see City.surgeParks); the same park indices */
  relink(parks: SurgePark[]): void { this.parks = parks; }
  /** after a graph update: the driveways are looked up again */
  onGraph(): void { this.drives.clear(); this.bySeg = null; }

  /** once per City step while the surge runs: the departures due by sim.t join the pending ones, and each pending car tries to spawn, in order,
   *  up to MAX_SPAWN a step. A car with no room on its driveway waits for the next step; one that cannot leave (no driveway, no entrance, or past
   *  its entrance on the driveway's own dseg) is stranded. A spawn that the sim refuses for no route is lost at once (its exit comes via event). */
  step(sim: Sim, g: LaneGraph): void {
    while (this.next < this.sched.length && this.sched[this.next]!.t <= sim.t) this.pend.push(this.sched[this.next++]!);
    if (!this.pend.length) return;
    let n = 0, w = 0;
    for (let i = 0; i < this.pend.length; i++) {
      const d = this.pend[i]!;
      if (n >= MAX_SPAWN) { this.pend[w++] = d; continue; }
      const r = this.spawn(d, sim, g);
      if (r === WAIT) this.pend[w++] = d;
      else if (r === STRANDED) this.stranded[d.town]!++;
      else { n++; this.departed[d.town]!++; }
    }
    this.pend.length = w;
  }

  /** one spawn attempt for departure d: SPAWNED, WAIT (no room on the driveway) or STRANDED */
  private spawn(d: Dep, sim: Sim, g: LaneGraph): number {
    const o = this.drive(d.lot, g), P = this.parks[d.park], ps = P ? P.sinks : [];
    if (!o || !ps.length) return STRANDED;
    const j = ps[d.e % ps.length]!, K = sim.sinks[j];
    if (!K) return STRANDED;
    if (g.lanes[o.lane]!.dseg === K.dseg && o.s >= K.s) return STRANDED;
    return sim.spawnAt(o.lane, o.s, K.dseg, K.s, 0, j, d.town) === -1 ? WAIT : SPAWNED;
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

  /** a party car of town k left the sim: kind 0 parked, 1 turned away, 2 lost (from Sim.partyOut) */
  event(k: number, kind: number): void {
    if (kind === 0) this.parked[k] = (this.parked[k] ?? 0) + 1;
    else if (kind === 1) this.turned[k] = (this.turned[k] ?? 0) + 1;
    else this.lost[k] = (this.lost[k] ?? 0) + 1;
  }

  /** the departure times (sim s), in order: for the tests */
  times(): number[] { return this.sched.map(d => d.t); }

  /** the counts as the UI sees them: per town the cars sent, parked, on the road (departed, less those parked, turned away and lost), turned away, lost, stranded */
  view(c?: FanCounts): SurgeView {
    const onRoad = this.sent.map((_, k) => this.departed[k]! - this.parked[k]! - this.turned[k]! - this.lost[k]!);
    return { sent: this.sent.slice(), parked: this.parked.slice(), onRoad, turned: this.turned.slice(), lost: this.lost.slice(), stranded: this.stranded.slice(),
      fans: this.sent.map((_, k) => c?.fans[k] ?? 0), atStop: this.sent.map((_, k) => c?.atStop[k] ?? 0), onBus: this.sent.map((_, k) => c?.onBus[k] ?? 0) };
  }

  /** the counts per town at kick-off: late is what was still on the road or never left (sent less the others); the fans as the crowd counts them (c, see FanCounts; none: 0) */
  result(c?: FanCounts): TownResult[] {
    return this.sent.map((s, k) => {
      const parked = this.parked[k]!, turned = this.turned[k]!, lost = this.lost[k]!, stranded = this.stranded[k]!;
      return { sent: s, parked, turned, lost, stranded, late: s - parked - turned - lost - stranded, fans: c?.fans[k] ?? 0, atStop: c?.atStop[k] ?? 0, onBus: c?.onBus[k] ?? 0 };
    });
  }
}

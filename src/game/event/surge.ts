// The surge (Phase 5 step 4): the crowd of an event round, sent as party cars from their homes to the car parks joined to their roads. At
// plan, each town's cars get a departure time in the first DEPART_END of the surge (a bell around its middle), an origin (a home of the
// town, by population) and a destination (a car park joined to the home's road, by bays, then round-robin). Step spawns the due ones from
// their driveways, bound for the sink of the car park that points from the home toward its entrance (matchSink); the sim reports each party
// car's exit (Sim.partyOut) and the counts follow.
// A party whose home is within BUS_WALK of a town's bus stop (a stop on a road beside a town's car park lot) goes by that bus instead: it
// spawns no car, it walks from home to the stop (step hands the walk to the City), and the bus counts (byBus) follow.
// Pure TS, no DOM, its own random stream (SURGE_SEED, given to plan).
import type { Lot } from '../lots/lots';
import type { Pt, Seg } from '../network';
import type { LaneGraph } from '../sim/lanes';
import type { Sim } from '../sim/sim';
import { driveway, type Drive } from '../sim/trips';
import { BUS_WALK, DEPART_END, PARTY, SURGE_S } from './config';
import type { FanCounts } from './crowd';

/** a home the crowd leaves from: its lot, its town, its residents (the weight), and the component of its frontage road (see City) */
export interface SurgeHome { lot: Lot; town: number; pop: number; comp: number }
/** a car park as the surge sees it: the component of its frontage road, its bays (the weight), and its sinks (indices into Sim.sinks, one per
 *  entrance direction). pts and dirs, aligned with sinks: each sink's point (its entrance on its lane) and unit direction; none: every sink matches */
export interface SurgePark { comp: number; bays: number; sinks: number[]; pts?: Pt[]; dirs?: Pt[] }
/** a town's bus stop for the surge: the route (its index), the town, and the stop's point (tiles) */
export interface SurgeStop { route: number; town: number; x: number; y: number }

/** the ordinal (into P.sinks) of the sink a car at o is sent to, the e-th car for this park: the sinks whose direction points from o toward
 *  their entrance (dot(entrance - o, dir) > 0), round-robin by e; none match: all of them, round-robin. No draws, no allocation */
export function matchSink(P: SurgePark, o: Pt, e: number): number {
  const n = P.sinks.length, pts = P.pts, dirs = P.dirs;
  if (!pts || !dirs) return e % n;
  let m = 0;
  for (let i = 0; i < n; i++) if ((pts[i]!.x - o.x) * dirs[i]!.x + (pts[i]!.y - o.y) * dirs[i]!.y > 0) m++;
  if (!m) return e % n;
  let want = e % m;
  for (let i = 0; i < n; i++) {
    if ((pts[i]!.x - o.x) * dirs[i]!.x + (pts[i]!.y - o.y) * dirs[i]!.y <= 0) continue;
    if (want === 0) return i;
    want--;
  }
  return 0;
}
/** the route of town k's nearest bus stop within BUS_WALK tiles of lot l's centre (the lowest route on a tie), or -1: the party drives */
function busStop(stops: SurgeStop[], k: number, l: Lot): number {
  let best = -1, bd = Infinity;
  for (const q of stops) {
    if (q.town !== k) continue;
    const d = Math.hypot(q.x - l.c.x, q.y - l.c.y);
    if (d <= BUS_WALK && d < bd) { bd = d; best = q.route; }
  }
  return best;
}
/** a town's counts at kick-off: the cars sent, parked, turned away, lost, stranded (never spawned), and late (on the road or never left), and its fans
 *  (each parked car is PARTY fans): at the doors (fans), at a lot stop's queue (atStop), on a bus (onBus), and by a town's bus (byBus: the fans
 *  whose party took a town bus at its departure; they are not in late) */
export interface TownResult { sent: number; parked: number; turned: number; lost: number; stranded: number; late: number; fans: number; atStop: number; onBus: number; byBus: number }
/** the surge as the UI sees it, per town: the cars sent, parked, on the road, turned away, lost and stranded, and the fans at the doors, at a lot stop,
 *  on a bus and by a town's bus */
export interface SurgeView { sent: number[]; parked: number[]; onRoad: number[]; turned: number[]; lost: number[]; stranded: number[]; fans: number[]; atStop: number[]; onBus: number[]; byBus: number[] }

/** a departure: its sim time, its town, its origin lot, its car park (an index into the park list), its entrance ordinal (round-robin), and the
 *  route of the town bus it takes (-1: by car) */
interface Dep { t: number; town: number; lot: Lot; park: number; e: number; bus: number }
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
  /** per town: the cars sent, departed (spawned, or lost at once), parked, turned away, lost, and stranded; the parties that took a town bus */
  private sent: number[] = []; private departed: number[] = []; private parked: number[] = []; private turned: number[] = [];
  private lost: number[] = []; private stranded: number[] = []; private bus: number[] = [];
  /** the departures in time order, the next one to come due, and the due ones not yet spawned (in order) */
  private sched: Dep[] = []; private next = 0; private pend: Dep[] = [];
  /** the car parks (see SurgePark), the next entrance ordinal per park, and the driveways by lot key and by seg (cleared on each graph update) */
  private parks: SurgePark[] = []; private rr: number[] = [];
  private drives = new Map<string, Drive | null>(); private bySeg: Map<Seg, number[]> | null = null;

  /** plans the surge at t0 (sim s): crowd[k] cars from town k, homes[k] the homes of town k, parks the car parks, rnd the surge's own stream,
   *  stops the town bus stops (none: every party drives).
   *  A home counts with a car park joined to its road (the same comp) or within BUS_WALK of a stop of its town (a bus party needs no car park: decided
   *  first); a town with no such home sends its whole crowd stranded (no draws).
   *  Each car: a home by population, a park by bays, and a departure at t0 + SURGE_S * DEPART_END * u, u the mean of three draws (a bell at the middle).
   *  A car whose home is within BUS_WALK of a stop of its town (the nearest) is a bus party instead: the same draws, no entrance. */
  plan(crowd: number[], homes: SurgeHome[][], parks: SurgePark[], rnd: () => number, t0: number, stops: SurgeStop[] = []): void {
    const K = crowd.length;
    this.parks = parks; this.rr = parks.map(() => 0);
    this.sent = crowd.slice(); this.departed = crowd.map(() => 0); this.parked = crowd.map(() => 0); this.turned = crowd.map(() => 0);
    this.lost = crowd.map(() => 0); this.stranded = crowd.map(() => 0); this.bus = crowd.map(() => 0);
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
      for (const h of homes[k] ?? []) if (h.pop > 0 && (byComp.has(h.comp) || busStop(stops, k, h.lot) >= 0)) { hs.push(h); tot += h.pop; hc.push(tot); }
      if (!hs.length || !(tot > 0)) { this.stranded[k] = crowd[k]!; continue; }
      for (let c = 0; c < crowd[k]!; c++) {
        const h = hs[pickCum(hc, rnd() * tot)]!, L = byComp.get(h.comp);
        // a bus party walks to its stop and needs no car park (no park draw); a car party's park is one joined to its home
        const park = L ? L.ids[pickCum(L.cum, rnd() * L.cum[L.cum.length - 1]!)]! : -1;
        const u = (rnd() + rnd() + rnd()) / 3;
        this.sched.push({ t: t0 + SURGE_S * DEPART_END * u, town: k, lot: h.lot, park, e: 0, bus: busStop(stops, k, h.lot) });
      }
    }
    // the entrances round-robin in departure order (the sort is stable: equal times keep their draw order); a bus party takes no entrance
    this.sched.sort((a, b) => a.t - b.t);
    for (const d of this.sched) if (d.bus < 0) d.e = this.rr[d.park]!++;
  }

  /** the car parks' lists now (after a network edit: the sinks' indices may have moved, see City.surgeParks); the same park indices */
  relink(parks: SurgePark[]): void { this.parks = parks; }
  /** after a graph update: the driveways are looked up again */
  onGraph(): void { this.drives.clear(); this.bySeg = null; }

  /** once per City step while the surge runs: the departures due by sim.t join the pending ones, and each pending car tries to spawn, in order,
   *  up to MAX_SPAWN a step. A car with no room on its driveway waits for the next step; one that cannot leave (no driveway, no entrance, or past
   *  its entrance on the driveway's own dseg) is stranded. A spawn that the sim refuses for no route is lost at once (its exit comes via event).
   *  A bus party due is handed to walk(home, route, town) (true: it walks to its stop; false: the stop is gone, and the party is lost). */
  step(sim: Sim, g: LaneGraph, walk?: (home: Lot, route: number, town: number) => boolean): void {
    while (this.next < this.sched.length && this.sched[this.next]!.t <= sim.t) this.pend.push(this.sched[this.next++]!);
    if (!this.pend.length) return;
    let n = 0, w = 0;
    for (let i = 0; i < this.pend.length; i++) {
      const d = this.pend[i]!;
      if (d.bus >= 0) { if (walk && walk(d.lot, d.bus, d.town)) this.bus[d.town]!++; else this.lost[d.town]!++; continue; }
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
    const o = this.drive(d.lot, g), P = this.parks[d.park];
    if (!o || !P || !P.sinks.length) return STRANDED;
    // the sink is chosen here, not in plan: the sinks are rebuilt on each graph edit (see City.surgeParks), so the plan keeps only the car's round-robin ordinal
    const j = P.sinks[matchSink(P, d.lot.c, d.e)]!, K = sim.sinks[j];
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

  /** the counts as the UI sees them: per town the cars sent, parked, on the road (departed, less those parked, turned away and lost), turned away, lost, stranded,
   *  and the fans by a town bus (the parties that took it, PARTY each) */
  view(c?: FanCounts): SurgeView {
    const onRoad = this.sent.map((_, k) => this.departed[k]! - this.parked[k]! - this.turned[k]! - this.lost[k]!);
    return { sent: this.sent.slice(), parked: this.parked.slice(), onRoad, turned: this.turned.slice(), lost: this.lost.slice(), stranded: this.stranded.slice(),
      fans: this.sent.map((_, k) => c?.fans[k] ?? 0), atStop: this.sent.map((_, k) => c?.atStop[k] ?? 0), onBus: this.sent.map((_, k) => c?.onBus[k] ?? 0),
      byBus: this.bus.map(p => p * PARTY) };
  }

  /** the counts per town at kick-off: late is what was still on the road or never left (sent less the others, and less the parties by a town bus, which
   *  walk and ride and are not on the road); the fans as the crowd counts them (c, see FanCounts; none: 0) */
  result(c?: FanCounts): TownResult[] {
    return this.sent.map((s, k) => {
      const parked = this.parked[k]!, turned = this.turned[k]!, lost = this.lost[k]!, stranded = this.stranded[k]!, bus = this.bus[k]!;
      return { sent: s, parked, turned, lost, stranded, late: s - parked - turned - lost - stranded - bus, fans: c?.fans[k] ?? 0, atStop: c?.atStop[k] ?? 0, onBus: c?.onBus[k] ?? 0, byBus: bus * PARTY };
    });
  }
}

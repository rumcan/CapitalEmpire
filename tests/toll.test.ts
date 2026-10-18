// The Toll Gate's headless tests (Phase 5 step 5a): a plaza of six booths on a straight street (the booth lanes and their connectors; cars that
// stop SERVICE_S at their booth, one at a time, every booth used, no car changing booths), the plaza's throughput with the cars queued, a route
// that takes the free way over a toll of nearly the same length, and the price and the books.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, keyOf, type Leg, type RoadClass } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LaneGraph, LK, type DSeg } from '../src/game/sim/lanes';
import { DT, Sim } from '../src/game/sim/sim';
import { plazaKey, type TollDef } from '../src/game/event/toll';
import { SERVICE_S, START_BOOTHS, tollPrice } from '../src/game/event/config';
import { Budget, type Ledger } from '../src/game/budget';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** the street's centre line (tiles) */
const Y = 300;
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** the key of the directed seg from (ax, ay) to (bx, by), as lanes.ts keys it */
const dk = (ax: number, ay: number, bx: number, by: number) => `${keyOf({ x: ax, y: ay })}>${keyOf({ x: bx, y: by })}`;
/** the directed seg with key k */
const dseg = (g: LaneGraph, k: string): DSeg => g.dsegs.find((d): d is DSeg => !!d && d.key === k)!;
/** the street A (100) – P (120) – Q (150) – B (170): the plaza is P–Q, 30 tiles; inbound (P to Q) is the toll gate */
const PLAZA: Leg[] = [leg(100, Y, 120, Y), leg(120, Y, 150, Y), leg(150, Y, 170, Y)];
const GATE: TollDef = { id: 1, ax: 120, ay: Y, bx: 150, by: Y, booths: START_BOOTHS };
/** a lane graph of the legs (updated after the edits), with the toll defs set */
function graph(legs: Leg[], tolls: TollDef[]): LaneGraph {
  const net = netOf(legs), g = new LaneGraph();
  g.update(net); g.setTolls(tolls, net);
  return g;
}
/** the same, keeping the network (for setTolls); the legs are of road class cls */
function netOf(legs: Leg[], cls: RoadClass = CLASS.street): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs(legs, cls, 0); e.commit();
  return e.net;
}

/** what the sim's booths did, read after each step: the cars served at each booth lane, the shortest time a car stood on a booth lane
 *  before it left it, and the cars that moved from one booth lane to another (none: the booths are fixed) */
class BoothLog {
  served = new Map<number, number>(); minStand = Infinity; switches = 0;
  private prevPaid: Uint8Array; private prevLane: Int32Array; private since: Float64Array;
  constructor(private sim: Sim, private booths: Set<number>) {
    this.prevPaid = new Uint8Array(sim.cap); this.prevLane = new Int32Array(sim.cap).fill(-1); this.since = new Float64Array(sim.cap);
  }
  observe() {
    const S = this.sim;
    for (let i = 0; i < S.cap; i++) {
      const on = S.alive[i] && this.booths.has(S.lane[i]!) ? S.lane[i]! : -1, was = this.prevLane[i]!;
      if (was >= 0 && on !== was) { this.minStand = Math.min(this.minStand, S.t - this.since[i]!); if (on >= 0) this.switches++; }
      if (on >= 0 && on !== was) this.since[i] = S.t;
      if (S.alive[i] && S.paid[i] && !this.prevPaid[i]) this.served.set(on, (this.served.get(on) ?? 0) + 1);
      this.prevPaid[i] = S.alive[i] ? S.paid[i]! : 0; this.prevLane[i] = on;
    }
  }
}

test('toll gate: the inbound plaza has one booth lane per booth (LINK, with a booth line at its middle); the in lane meets every booth, every booth leads to the out lane', () => {
  const net = netOf(PLAZA), g = new LaneGraph();
  g.update(net); g.setTolls([GATE], net);
  const plain = graph(PLAZA, []), inD = dseg(g, plazaKey(GATE)), outD = dseg(g, dk(150, Y, 170, Y)), inA = dseg(g, dk(100, Y, 120, Y));
  assert.equal(inD.toll, START_BOOTHS, 'the dseg is a toll with its booths');
  assert.equal(inD.lanes.length, START_BOOTHS, 'one lane per booth');
  const booths = inD.lanes.map(id => g.lanes[id]!);
  booths.forEach((l, k) => {
    assert.equal(l.kind, LK.LINK, 'a link lane');
    assert.match(l.key, /#b\d+$/, 'a booth lane key');
    assert.ok(Math.abs(l.booth! - l.len / 2) < 2, `booth ${k} line ${l.booth!.toFixed(2)} m at the middle of ${l.len.toFixed(2)} m`);
    if (k) assert.equal(l.left, booths[k - 1]!.id, 'left neighbour');
  });
  // booth 0 starts and ends where the plain plaza's lane 0 does
  const p0 = plain.lanes[dseg(plain, plazaKey(GATE)).lanes[0]!]!, b0 = booths[0]!;
  assert.deepEqual([b0.pts[0], b0.pts[1], b0.pts[b0.pts.length - 2], b0.pts[b0.pts.length - 1]], [p0.pts[0], p0.pts[1], p0.pts[p0.pts.length - 2], p0.pts[p0.pts.length - 1]], 'lane 0 ends');
  assert.equal(outD.toll, undefined, 'the out dseg is not a toll');
  assert.equal(outD.lanes.length, 1, 'the out dseg keeps its class lanes');
  assert.equal(g.lanes[outD.lanes[0]!]!.booth, undefined, 'and they are not booth lanes');
  const inL = g.lanes[inA.lanes[0]!]!;
  assert.equal(inL.next.length, START_BOOTHS, 'the in lane has a connector to each booth');
  for (const b of booths) {
    assert.equal(b.next.length, 1, 'a booth lane has one connector');
    assert.deepEqual(g.lanes[b.next[0]!]!.next, [outD.lanes[0]], 'and it leads to the out lane');
  }
  assert.equal(g.tolls.get(plazaKey(GATE)), START_BOOTHS);
  assert.equal(g.setTolls([GATE], net), false, 'the same defs change nothing');
});

test('toll gate: 60 cars from A to B all arrive, each pays once at a booth (every booth serves some), and no car leaves its booth before SERVICE_S', t => {
  const g = graph(PLAZA, [GATE]), sim = new Sim(g, 200, 5);
  const from = dseg(g, dk(100, Y, 120, Y)), dest = dseg(g, dk(150, Y, 170, Y));
  const log = new BoothLog(sim, new Set(dseg(g, plazaKey(GATE)).lanes));
  let sent = 0;
  for (let k = 0; k < 6000 && sim.stats.arrived < 60; k++) {
    if (sent < 60 && sim.spawnAt(from.lanes[0]!, 1, dest.id, dest.len - 2) !== -1) sent++;
    sim.step(); log.observe();
  }
  assert.equal(sent, 60, 'all 60 cars sent');
  assert.equal(sim.stats.arrived, 60, 'all 60 arrive');
  assert.equal(sim.tolls, 60, 'each car paid once');
  assert.equal(log.served.size, START_BOOTHS, `every booth served cars: ${[...log.served.values()].join(', ')}`);
  assert.ok(log.minStand >= SERVICE_S - DT, `the shortest stand at a booth ${log.minStand.toFixed(2)} s`);
  t.diagnostic(`cars served per booth: ${[...log.served.values()].join(', ')}`);
  assert.equal(log.switches, 0, 'no car moved from one booth lane to another');
});

/** the cars a second the plaza passes with `booths` booths on road class cls and its approach full (a car on every approach lane whenever
 *  there is room), read from 120 s to 400 s, when the queue stands */
function plazaRate(cls: RoadClass, booths: number): number {
  const net = netOf(PLAZA, cls), g = new LaneGraph();
  g.update(net); g.setTolls([{ ...GATE, booths }], net);
  const sim = new Sim(g, 600, 9);
  const from = dseg(g, dk(100, Y, 120, Y)), dest = dseg(g, dk(150, Y, 170, Y));
  let t1 = -1, n1 = 0;
  for (let k = 0; k < 4000; k++) {
    for (const id of from.lanes) sim.spawnAt(id, 1, dest.id, dest.len - 2);
    sim.step();
    if (t1 < 0 && sim.t >= 120) { t1 = sim.t; n1 = sim.tolls; }
  }
  return (sim.tolls - n1) / (sim.t - t1);
}

test('toll gate, a boulevard (2 lanes each way): six booths over the two out lanes pass at least 0.5 cars a second (about 11 s per car per booth: 4 s paying and the move-up) with the approach full', t => {
  const r = [1, 2, 3, 6].map(b => plazaRate(CLASS.boulevard, b));
  t.diagnostic(`boulevard, 1 / 2 / 3 / 6 booths: ${r.map(x => x.toFixed(3)).join(' / ')} cars/s`);
  assert.ok(r[3]! >= 0.5, `${r[3]!.toFixed(3)} cars/s against at least 0.5`);
});

test('toll gate, a street (1 lane): six booths pass at least 0.28 cars a second with the approach full, and one booth passes fewer than three', t => {
  const r = [1, 2, 3, 6].map(b => plazaRate(CLASS.street, b));
  t.diagnostic(`street, 1 / 2 / 3 / 6 booths: ${r.map(x => x.toFixed(3)).join(' / ')} cars/s`);
  assert.ok(r[3]! >= 0.28, `${r[3]!.toFixed(3)} cars/s against at least 0.28`);
  assert.ok(r[0]! < r[2]!, `one booth ${r[0]!.toFixed(3)} against three ${r[2]!.toFixed(3)} cars/s: the booths are the bottleneck with one`);
});

test('toll gate: a burst of 12 cars planned in the same step spreads over at least 4 of the 6 booths', () => {
  const net = netOf([leg(20, Y, 120, Y), leg(120, Y, 150, Y), leg(150, Y, 170, Y)]), g = new LaneGraph();
  g.update(net); g.setTolls([GATE], net);
  const sim = new Sim(g, 200, 4), from = dseg(g, dk(20, Y, 120, Y)), dest = dseg(g, dk(150, Y, 170, Y));
  const booths = new Set<number>();
  let n = 0;
  // the cars are placed on the approach 14 m apart, all within one step: each is planned onto a booth as it is placed
  for (let k = 0; k < 12; k++) {
    const i = sim.spawnAt(from.lanes[0]!, 2 + 14 * k, dest.id, dest.len - 2);
    if (i >= 0) { n++; booths.add(sim.plan[i]![2]!); }
  }
  assert.equal(n, 12, 'all 12 placed');
  assert.ok(booths.size >= 4, `the burst is planned onto ${booths.size} booths`);
});

/** the two-way street with a free way round the plaza: W (60) – A (100), A – P – Q – B (the toll) and A – F (125, 312) – B (the free way, 5% longer), B – D (190) */
const ROUTE: Leg[] = [leg(60, Y, 100, Y), leg(100, Y, 120, Y), leg(120, Y, 150, Y), leg(150, Y, 170, Y), leg(170, Y, 190, Y), leg(100, Y, 125, 312), leg(125, 312, 170, Y)];
/** the cars sent from W to D (n of them) on the network: how many arrived, and how many paid at the toll */
function drive(legs: Leg[], n: number): { arrived: number; tolls: number } {
  const g = graph(legs, [GATE]), sim = new Sim(g, 200, 3);
  const from = dseg(g, dk(60, Y, 100, Y)), dest = dseg(g, dk(170, Y, 190, Y));
  let sent = 0;
  for (let k = 0; k < 6000 && sim.stats.arrived < n; k++) {
    if (sent < n && sim.spawnAt(from.lanes[0]!, 1, dest.id, dest.len - 2) !== -1) sent++;
    sim.step();
  }
  return { arrived: sim.stats.arrived, tolls: sim.tolls };
}

test('routing: with a free way of nearly the same length, most cars take it; with none, all pay the toll', t => {
  const free = drive(ROUTE, 30), only = drive(ROUTE.slice(0, 5), 30);
  t.diagnostic(`free way open: ${free.tolls} of 30 paid the toll; toll only: ${only.tolls} of 30`);
  assert.equal(free.arrived, 30, 'all arrive by the free way or the toll');
  assert.ok(free.tolls <= 6, `${free.tolls} of 30 cars paid the toll with the free way open`);
  assert.equal(only.arrived, 30, 'all arrive by the toll alone');
  assert.equal(only.tolls, 30, 'every car paid the toll with no other way');
});

test('tolls: the price by level (8 $ at level 1, a quarter more each level), and the takings are income at once, booked in the next ledger', () => {
  assert.deepEqual([1, 2, 3, 5].map(tollPrice), [8, 10, 12, 16]);
  const b = new Budget(), m0 = b.money;
  b.toll(40);
  assert.equal(b.money, m0 + 40, 'in the treasury at once');
  const L = b.endDay(1, { lots: [], segs: [], nodes: [], trade: { arrived: 0, punctual: 0 }, pop: 0 });
  assert.equal(L.toll, 40, 'the ledger shows the toll');
  assert.equal(L.net, 40, 'and it is in the net');
  assert.equal(b.today.toll ?? 0, 0, 'and the day starts again at 0');
  const old = Budget.from({ base: 0, money: 5, loans: 0, debtDays: 0, bankrupt: false, history: [{ day: 1, property: 0, business: 0, grants: 0, upkeep: 0, signals: 0, interest: 0, construction: 0, compensation: 0, net: 0, money: 5 } as Ledger] });
  assert.equal(old.history[0]!.toll ?? 0, 0, 'an old ledger reads no toll');
});

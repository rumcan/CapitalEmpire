import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Subway, buildCost, STATION_COST, TUNNEL_COST_PER_TILE, TRAIN_COST } from '../src/game/ext/subway/subway';
import type { Arrival, LineDef, StationDef } from '../src/game/ext/subway/subway';

const twoStations: StationDef[] = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 1000, y: 0 }];
const line = (trains = 1): LineDef[] => [{ id: 10, stations: [1, 2], trains }];
function runUntil(subway: Subway, target: number, maxSeconds: number): { time: number; arrivals: Arrival[] } {
  const out: Arrival[] = [];
  for (let t = 0; t < maxSeconds; t++) { subway.step(1); subway.takeArrivals(out); if (out.reduce((n, a) => n + a.fans, 0) >= target) return { time: t + 1, arrivals: out.slice() }; }
  return { time: maxSeconds, arrivals: out.slice() };
}

test('2 km open line accelerates, brakes and delivers all fans at the destination', () => {
  const s = new Subway(7); s.setNetwork(twoStations, line()); assert.equal(s.board(1, 2, 100, 4), 100);
  const result = runUntil(s, 100, 500); const delivered = result.arrivals.reduce((n, a) => n + a.fans, 0);
  console.log(`subway travel: ${result.time} sim s for 2,000 m`);
  assert.equal(delivered, 100); assert.ok(result.time >= 100 && result.time <= 180);
});

test('train capacity is 600 and two trains deliver a sustained hourly service', () => {
  const s = new Subway(); s.setNetwork(twoStations, line(2)); s.board(1, 2, 5000, 8);
  let delivered = 0, completion = 3600, out: Arrival[] = [];
  for (let t = 0; t < 3600; t++) { s.step(1); s.takeArrivals(out); for (const a of out) delivered += a.fans; for (const tr of s.view().trains) assert.ok(tr.load <= 600); if (delivered >= 5000) { completion = t + 1; break; } }
  const hourly = Math.round(delivered * 3600 / completion);
  console.log(`subway capacity: ${hourly} fans/hour sustained equivalent; 5,000 fans delivered in ${completion} s; max load 600`);
  assert.equal(delivered, 5000); assert.ok(hourly > 8_000 && hourly < 17_000);
});

test('a one-tunnel line with four trains keeps delivering in both directions', () => {
  const s = new Subway(); s.setNetwork(twoStations, line(4));
  s.board(1, 2, 2400, 1); s.board(2, 1, 2400, 2);
  const delivered = new Map<number, number>(), out: Arrival[] = [];
  for (let t = 0; t < 1500; t++) {
    s.step(1); s.takeArrivals(out);
    for (const a of out) delivered.set(a.tag, (delivered.get(a.tag) ?? 0) + a.fans);
  }
  assert.equal(delivered.get(1), 2400); assert.equal(delivered.get(2), 2400);
});

test('three-station six-train loop continues carrying fans around its circle', () => {
  const stations: StationDef[] = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 20, y: 0 }, { id: 3, x: 20, y: 20 }];
  const s = new Subway(); s.setNetwork(stations, [{ id: 1, stations: [1, 2, 3], trains: 6, loop: true }]);
  s.board(1, 3, 100, 3); s.board(3, 1, 100, 4);
  const delivered = new Map<number, number>(), out: Arrival[] = [];
  for (let t = 0; t < 200; t++) { s.step(1); s.takeArrivals(out); for (const a of out) delivered.set(a.tag, (delivered.get(a.tag) ?? 0) + a.fans); }
  assert.equal(delivered.get(3), 100); assert.equal(delivered.get(4), 100);
});

test('three-station open line with six trains does not strand terminal passengers', () => {
  const stations: StationDef[] = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 20, y: 0 }, { id: 3, x: 20, y: 20 }];
  const s = new Subway(); s.setNetwork(stations, [{ id: 1, stations: [1, 2, 3], trains: 6 }]);
  s.board(1, 3, 100, 5); s.board(3, 1, 100, 6);
  const delivered = new Map<number, number>(), out: Arrival[] = [];
  for (let t = 0; t < 400; t++) { s.step(1); s.takeArrivals(out); for (const a of out) delivered.set(a.tag, (delivered.get(a.tag) ?? 0) + a.fans); }
  assert.equal(delivered.get(5), 100); assert.equal(delivered.get(6), 100);
});

test('four open-line trains stay direction-separated on the same tunnel', () => {
  const stations: StationDef[] = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 100, y: 0 }, { id: 3, x: 200, y: 0 }];
  const s = new Subway(); s.setNetwork(stations, [{ id: 1, stations: [1, 2, 3], trains: 4 }]);
  for (let t = 0; t < 1000; t++) {
    s.step(1);
    const views = s.view().trains;
    for (let i = 0; i < views.length; i++) for (let j = i + 1; j < views.length; j++) {
      const a = views[i]!, b = views[j]!;
      const segment = (x: number): number => Math.abs(x - Math.round(x / 100) * 100) < 1e-8 ? -1 : x < 100 ? 0 : 1;
      const aseg = segment(a.x), bseg = segment(b.x);
      if (aseg >= 0 && aseg === bseg && Math.sign(Math.cos(a.dir)) === Math.sign(Math.cos(b.dir))) assert.fail(`same-direction occupancy on tunnel ${aseg}: ${a.x} and ${b.x}`);
    }
  }
  assert.equal(s.view().trains.length, 4);
});

test('shared station transfers passengers and applies the 60 second walk', () => {
  const stations: StationDef[] = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 100, y: 0 }, { id: 3, x: 100, y: 100 }, { id: 4, x: 100, y: 200 }];
  const s = new Subway(); s.setNetwork(stations, [{ id: 1, stations: [1, 2], trains: 1 }, { id: 2, stations: [2, 3, 4], trains: 1 }]);
  assert.equal(s.board(1, 4, 20, 12), 20);
  const result = runUntil(s, 20, 1000); assert.equal(result.arrivals.reduce((n, a) => n + a.fans, 0), 20);
  console.log(`subway transfer: 20 fans arrived in ${result.time} s including the 60 s interchange walk`);
  assert.ok(result.time >= 200);
});

test('loop follows the ordered wrap; an open line reverses at its ends', () => {
  const stations: StationDef[] = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 20, y: 0 }, { id: 3, x: 20, y: 20 }];
  const loop = new Subway(); loop.setNetwork(stations, [{ id: 1, stations: [1, 2, 3], trains: 1, loop: true }]); loop.board(3, 1, 10, 1);
  const loopResult = runUntil(loop, 10, 100); assert.equal(loopResult.arrivals.reduce((n, a) => n + a.fans, 0), 10);
  const open = new Subway(); open.setNetwork(stations, [{ id: 1, stations: [1, 2, 3], trains: 1 }]); open.board(3, 1, 10, 1);
  const openResult = runUntil(open, 10, 200); assert.equal(openResult.arrivals.reduce((n, a) => n + a.fans, 0), 10);
});

test('removing a destination drops only its waiting fans', () => {
  const s = new Subway(); s.setNetwork([{ id: 1, x: 0, y: 0 }, { id: 2, x: 100, y: 0 }, { id: 3, x: 200, y: 0 }], [{ id: 1, stations: [1, 2, 3], trains: 0 }]);
  s.board(1, 2, 25, 4); s.board(1, 3, 40, 5);
  s.setNetwork([{ id: 1, x: 0, y: 0 }, { id: 2, x: 100, y: 0 }], [{ id: 1, stations: [1, 2], trains: 1 }]);
  assert.equal(s.stats().dropped, 40); assert.equal(s.view().queues.find(q => q.station === 1)?.fans, 25);
  const result = runUntil(s, 25, 400); assert.equal(result.arrivals.reduce((n, a) => n + a.fans, 0), 25);
});

test('mean wait includes the first fans who board immediately with zero wait', () => {
  const s = new Subway(); s.setNetwork([{ id: 1, x: 0, y: 0 }, { id: 2, x: 100, y: 0 }], line());
  s.board(1, 2, 100, 1);
  for (let t = 0; t < 25; t++) s.step(1);
  s.board(1, 2, 100, 2);
  const out: Arrival[] = [];
  for (let t = 0; t < 200 && s.stats().carried < 200; t++) { s.step(1); s.takeArrivals(out); }
  assert.equal(s.stats().carried, 200);
  assert.ok(s.stats().meanWait >= 25 && s.stats().meanWait < 40, `mean wait ${s.stats().meanWait} should include the 100 zero-wait fans`);
});

test('identical seeded runs produce identical arrivals', () => {
  const simulate = () => { const s = new Subway(55); s.setNetwork(twoStations, line(2)); s.board(1, 2, 1500, 7); const out: Arrival[] = [], all: Arrival[] = []; for (let i = 0; i < 500; i++) { s.step(1); s.takeArrivals(out); all.push(...out); } return all; };
  assert.deepEqual(simulate(), simulate());
});

test('build cost is stations plus line tunnels and trains; 40-train step benchmark', () => {
  const knownCost = buildCost(twoStations, line(2));
  assert.equal(knownCost, 2 * STATION_COST + 1000 * TUNNEL_COST_PER_TILE + 2 * TRAIN_COST);
  console.log(`subway build cost: $${knownCost.toLocaleString()}`);
  const stations: StationDef[] = Array.from({ length: 50 }, (_, i) => ({ id: i, x: i * 10, y: (i % 3) * 10 }));
  const lines: LineDef[] = Array.from({ length: 10 }, (_, i) => ({ id: i, stations: Array.from({ length: 5 }, (_, j) => i * 5 + j), trains: 4 }));
  const s = new Subway(); s.setNetwork(stations, lines);
  for (let i = 0; i < 100; i++) s.step(0.1);
  const start = performance.now(); for (let i = 0; i < 10_000; i++) s.step(0.1); const ms = (performance.now() - start) / 10_000;
  console.log(`subway step: ${(ms * 1000).toFixed(2)} μs for 10 lines, 40 trains, 50 stations`);
  assert.ok(ms < 0.05, `step took ${ms} ms`);
});

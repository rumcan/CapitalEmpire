// Traffic incidents (T008), headless: the rates by density and at night, crashes concentrating at busy junctions, the
// clearance ranges and slow zones, determinism, and the lifecycle (one incident per lane, clear(), expiry).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Incidents, DAY, BREAK_PER_MKM, JUNCTION_CRASH_PER_MPASS, CLEAR_BREAKDOWN, CLEAR_CRASH, RUBBER_M, SLOW,
  breakdownRate, crashRate, junctionCrashRate, nightAt, type Exposure, type Incident, type Passage,
} from '../src/game/ext/incidents';

/** n lanes with the same exposure (lane ids 0..n-1) */
function lanes(n: number, metres: number, density = 4, stopGo = 0, len?: number): Exposure[] {
  const out: Exposure[] = [];
  for (let i = 0; i < n; i++) out.push({ lane: i, metres, density, stopGo, len });
  return out;
}

/** steps the model once a sim second for `seconds`, t0 first; returns the new incidents and the vehicle-km the module
 *  accepted (the lanes no incident held at the start of the step, which is exactly the exposure its rates see) */
function run(
  exp: Exposure[],
  o: { seconds: number; t0?: number; seed?: number; passages?: (s: number) => Passage[] },
): { list: Incident[]; vehKm: number } {
  const m = new Incidents(o.seed ?? 1), list: Incident[] = [];
  let vehKm = 0;
  for (let s = 0; s < o.seconds; s++) {
    const t = (o.t0 ?? 0) + s, held = new Set<number>();
    for (const a of m.active(t)) held.add(a.lane);
    for (const e of exp) if (!held.has(e.lane)) vehKm += e.metres / 1000;
    for (const a of m.step(t, exp, o.passages ? o.passages(s) : [])) list.push(a);
  }
  return { list, vehKm };
}

/** incidents of one kind per million vehicle-km of a run */
const perMkm = (r: { list: Incident[]; vehKm: number }, kind: 'breakdown' | 'crash') =>
  r.list.filter(a => a.kind === kind).length / (r.vehKm / 1e6);

/** the seeds the rate runs pool over (one run is a few dozen breakdowns: a poor sample of a rate on its own) */
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** the same run on each seed, summed: the vehicle-km, breakdowns and crashes it saw in all */
function pooled(exp: Exposure[], seeds: number[], o: { seconds: number; t0: number }): { km: number; breakdown: number; crash: number } {
  let km = 0, breakdown = 0, crash = 0;
  for (const seed of seeds) {
    const r = run(exp, { ...o, seed });
    km += r.vehKm;
    for (const a of r.list) if (a.kind === 'crash') crash++; else breakdown++;
  }
  return { km, breakdown, crash };
}

test('rates: stop-and-go dense traffic breaks down 2-3x as often per vehicle-km as free flow, and crashes far more', () => {
  // 420 s of midday each seed (no night factor), 500 lanes and 8 seeds: about 990,000 vehicle-km and 160 breakdowns
  // free, 415 stop-and-go; the rate functions' own values are exact, so the run is checked within a wide band
  const free = pooled(lanes(500, 600, 4, 0), SEEDS, { seconds: 420, t0: 12 * 60 });
  const jam = pooled(lanes(500, 600, 60, 0.8), SEEDS, { seconds: 420, t0: 12 * 60 });
  const freeRate = free.breakdown / (free.km / 1e6), jamRate = jam.breakdown / (jam.km / 1e6);
  console.log(`rates: free flow ${freeRate.toFixed(0)} breakdowns/M-km (${(free.crash / free.km * 1e6).toFixed(1)} crashes/M-km), ` +
    `stop-and-go dense ${jamRate.toFixed(0)}/M-km (${(jam.crash / jam.km * 1e6).toFixed(1)}), ${(jamRate / freeRate).toFixed(2)}x; ` +
    `the analytic crash rates are ${(crashRate(60, 0.8) / crashRate(4, 0)).toFixed(1)}x apart, over ${(free.km / 1000).toFixed(0)}k veh-km`);
  assert.ok(freeRate > 130 && freeRate < 195, `free-flow breakdowns ${freeRate.toFixed(0)}/M-km`);
  assert.ok(jamRate > 340 && jamRate < 490, `stop-and-go breakdowns ${jamRate.toFixed(0)}/M-km`);
  assert.ok(jamRate > freeRate * 2, `stop-and-go ${(jamRate / freeRate).toFixed(2)}x free flow`);
  assert.ok(jam.crash > free.crash * 3, `crashes ${jam.crash} vs ${free.crash}`);
  assert.ok(crashRate(60, 0.8) > 5 * crashRate(4, 0), 'dense stop-and-go crashes over five times as often');
});

test('night: the same traffic breaks down and crashes more between 22:00 and 06:00 than at midday', () => {
  // 8 h at noon and 8 h from 22:00, 3,000 lanes: about 185 and 260 breakdowns
  const day = run(lanes(3000, 600, 20, 0.2), { seconds: 480, t0: 12 * 60, seed: 5 });
  const night = run(lanes(3000, 600, 20, 0.2), { seconds: 480, t0: 22 * 60, seed: 5 });
  const ratio = perMkm(night, 'breakdown') / perMkm(day, 'breakdown');
  console.log(`night: ${perMkm(day, 'breakdown').toFixed(0)} breakdowns/M-km by day, ${perMkm(night, 'breakdown').toFixed(0)} at night (${ratio.toFixed(2)}x); crashes ${perMkm(day, 'crash').toFixed(1)} vs ${perMkm(night, 'crash').toFixed(1)}`);
  assert.ok(ratio > 1.2 && ratio < 1.65, `night ${ratio.toFixed(2)}x day`);
  assert.ok(perMkm(night, 'crash') > perMkm(day, 'crash'), 'night crashes more often');
  assert.equal(nightAt(0), true); assert.equal(nightAt(5 * 60 + 59), true); assert.equal(nightAt(6 * 60), false);
  assert.equal(nightAt(12 * 60), false); assert.equal(nightAt(21 * 60 + 59), false); assert.equal(nightAt(22 * 60), true);
  assert.equal(nightAt(24 * 60), true); assert.equal(nightAt(-60), true);
  assert.ok(Math.abs(breakdownRate(4, 0, true) / breakdownRate(4, 0) - 1.4) < 1e-9, 'the night factor');
});

test('junctions: crashes concentrate at the busy node, where the conflicting flow is heavy', () => {
  const N = 5000;
  // ten passage entries each way, spread over N lanes a side, 30,000 passages a second each way
  const passages = (s: number): Passage[] => {
    const out: Passage[] = [];
    for (let j = 0; j < 10; j++) {
      const lane = (base: number) => base + (s * 13 + j * 500) % N;
      out.push({ node: 'calm', conflictLoad: 60, count: 3000, lane: lane(1000), s: 10 });
      out.push({ node: 'busy', conflictLoad: 1200, count: 3000, lane: lane(10000), s: 10 });
    }
    return out;
  };
  // no vehicle-metres: every incident here is a junction crash
  const j = run(lanes(N, 0, 10, 0), { seconds: DAY, seed: 3, passages });
  const calm = j.list.filter(a => a.lane >= 1000 && a.lane < 1000 + N).length;
  const busy = j.list.filter(a => a.lane >= 10000 && a.lane < 10000 + N).length;
  console.log(`junctions: 43.2M passages each: ${calm} crashes at 60 veh/h (${(calm / 43.2).toFixed(2)}/M), ` +
    `${busy} at 1,200 veh/h (${(busy / 43.2).toFixed(2)}/M), ${(busy / Math.max(1, calm)).toFixed(2)}x`);
  assert.ok(calm > 20, `calm junction crashes ${calm}`);
  assert.ok(busy > 120, `busy junction crashes ${busy}`);
  assert.ok(busy > calm * 2.5, `busy ${(busy / Math.max(1, calm)).toFixed(2)}x calm`);
  assert.ok(j.list.every(a => a.kind === 'crash'), 'a junction incident is a crash');
  assert.equal(junctionCrashRate(0), JUNCTION_CRASH_PER_MPASS * 1e-6, 'no conflicting flow: the base rate');
  assert.ok(junctionCrashRate(1200) > 3 * junctionCrashRate(0), '1,200 veh/h is over three times the risk');
});

test('clearance and zones: every incident clears in its range, blocks 1 or 2 lanes and slows traffic 200 m either way', () => {
  const r = run(lanes(200, 600, 60, 0.8, 700), { seconds: DAY, seed: 21, passages: () => [{ node: 'x', conflictLoad: 900, count: 2e5, lane: 9000, s: 50 }] });
  let breakdowns = 0, crashes = 0;
  for (let k = 0; k < r.list.length; k++) {
    const a = r.list[k]!, dt = a.clearAt - a.start, z = a.slowZone[0]!;
    assert.equal(a.slowZone.length, 1);
    assert.ok(a.s >= 0 && a.s <= 700, `s ${a.s} in the lane`);
    assert.equal(z.lane, a.lane);
    assert.ok(Math.abs(z.from - Math.max(0, a.s - RUBBER_M)) < 1e-9, `from ${z.from}`);
    assert.ok(Math.abs(z.to - Math.min(700, a.s + RUBBER_M)) < 1e-9, `to ${z.to}`);
    assert.ok(z.factor >= SLOW[0] && z.factor <= SLOW[1], `factor ${z.factor}`);
    if (a.kind === 'breakdown') {
      breakdowns++;
      assert.equal(a.blocks, 1, 'a breakdown blocks one lane');
      assert.ok(dt >= CLEAR_BREAKDOWN[0] && dt <= CLEAR_BREAKDOWN[1], `breakdown clears in ${dt} s`);
    } else {
      crashes++;
      assert.ok(a.blocks === 1 || a.blocks === 2, `crash blocks ${a.blocks} lanes`);
      assert.ok(dt >= CLEAR_CRASH[0] && dt <= CLEAR_CRASH[1], `crash clears in ${dt} s`);
    }
    if (k) assert.ok(a.id > r.list[k - 1]!.id, 'ids increase');
  }
  console.log(`clearance: ${breakdowns} breakdowns clear in ${CLEAR_BREAKDOWN[0]}-${CLEAR_BREAKDOWN[1]} s, ` +
    `${crashes} crashes in ${CLEAR_CRASH[0]}-${CLEAR_CRASH[1]} s; slow zones ${SLOW[0]}-${SLOW[1]}x over ${2 * RUBBER_M} m`);
  assert.ok(breakdowns > 50, `breakdowns ${breakdowns}`);
  assert.ok(crashes > 0, `crashes ${crashes}`);
});

test('blocks: a crash blocks two lanes now and then, and never more lanes than the road has', () => {
  const heavy = (n: number, cap?: number): Exposure[] => {
    const out: Exposure[] = [];
    for (let i = 0; i < n; i++) out.push({ lane: i, metres: 1e9, density: 60, stopGo: 1, len: 400, lanes: cap });
    return out;
  };
  const open = new Incidents(31).step(0, heavy(200), []);
  const one = new Incidents(31).step(0, heavy(50, 1), []);
  assert.equal(open.length, 200); assert.equal(one.length, 50);
  assert.ok(open.some(a => a.blocks === 2) && open.some(a => a.blocks === 1), 'both one and two lanes blocked');
  assert.ok(one.every(a => a.blocks === 1), 'a one-lane road blocks one lane');
  assert.ok(open.every(a => a.kind === 'crash'), 'the heavy exposure makes crashes');
  console.log(`blocks: ${open.filter(a => a.blocks === 2).length}/200 crashes block two lanes; a one-lane road caps at one`);
});

test('determinism: the same seed and the same steps give the same incidents, another seed gives others', () => {
  const trace = (seed: number): number[] => {
    const m = new Incidents(seed), out: number[] = [], exp = lanes(300, 600, 12, 0.2, 500);
    const ps = (s: number): Passage[] => [{ node: 'n', conflictLoad: 400 + (s % 500), count: 200, lane: 5000 + (s * 7) % 100, s: 25 }];
    for (let s = 0; s < 2 * DAY; s++) {
      for (const a of m.step(s, exp, ps(s))) {
        out.push(a.id, a.kind === 'crash' ? 1 : 0, a.lane, Math.round(a.s * 10), a.blocks, a.start, a.clearAt, Math.round(a.slowZone[0]!.factor * 1000));
      }
    }
    return out;
  };
  const a = trace(42), b = trace(42), c = trace(43);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.length > 100, `incidents in the trace (${a.length / 8})`);
  console.log(`determinism: ${a.length / 8} incidents over 2 game days from seed 42, identical on a rerun and different on seed 43`);
});

test('lifecycle: an incident starts at t, is active until clearAt, holds its lane, and clear() frees it at once', () => {
  const m = new Incidents(7), heavy: Exposure[] = [{ lane: 42, metres: 1e9, density: 80, stopGo: 1, len: 500 }];
  const first = m.step(1000, heavy, []);
  assert.equal(first.length, 1);
  const a = first[0]!;
  assert.equal(a.kind, 'crash', 'both rates are certain: the crash wins');
  assert.equal(a.start, 1000);
  assert.deepEqual(m.active(999), [], 'not before its start');
  assert.deepEqual(m.active(1000), [a], 'active at its start');
  assert.deepEqual(m.active(a.clearAt - 0.1), [a], 'active just before its clearance');
  assert.deepEqual(m.step(1000, heavy, []), [], 'the lane is held: no second incident');
  assert.deepEqual(m.active(a.clearAt), [], 'the clearance expires it');
  const next = m.step(a.clearAt, heavy, []);
  assert.equal(next.length, 1, 'the lane is free after the clearance');
  assert.ok(next[0]!.id > a.id);
  m.clear(next[0]!.id);
  assert.deepEqual(m.active(a.clearAt), [], 'clear() drops it at once');
  const again = m.step(a.clearAt, heavy, []);
  assert.equal(again.length, 1, 'clear() frees the lane');
  assert.ok(again[0]!.id > next[0]!.id);
  m.clear(999999);
  assert.equal(m.active(a.clearAt).length, 1, 'an unknown id is ignored');
  assert.equal(again[0]!.start, a.clearAt);
  console.log(`lifecycle: incident ${a.id} clears at ${a.clearAt.toFixed(1)} s (${(a.clearAt - a.start).toFixed(0)} s); ids ${a.id}, ${next[0]!.id}, ${again[0]!.id}`);
});

test('placement: s is drawn along the lane when len is given and 0 without it; a junction crash without a lane lands on a driven lane', () => {
  const withLen = new Incidents(8).step(0, lanes(50, 1e9, 60, 1, 300), []);
  assert.ok(withLen.every(a => a.s >= 0 && a.s < 300), 's in [0, len)');
  const noLen = new Incidents(8).step(0, [{ lane: 1, metres: 1e9, density: 60, stopGo: 1 }], []);
  assert.equal(noLen[0]!.s, 0);
  const given = new Incidents(8).step(0, [{ lane: 2, metres: 1e9, density: 60, stopGo: 1, s: 123.4, len: 300 }], []);
  assert.equal(given[0]!.s, 123.4, 'the caller can place the incident');
  assert.equal(given[0]!.slowZone[0]!.to, 300, 'the zone is clamped to the lane');
  assert.equal(noLen[0]!.slowZone[0]!.to, RUBBER_M, 'the zone runs 200 m from s = 0');
  // a passage with no lane falls back to a lane the traffic drove on; with no exposure at all there is no place for it
  const exp: Exposure[] = [{ lane: 10, metres: 5000, density: 10, stopGo: 0, len: 800 }, { lane: 11, metres: 5000, density: 10, stopGo: 0, len: 800 }];
  const fallback = new Incidents(9).step(0, exp, [{ node: 'x', conflictLoad: 5000, count: 1e9 }]);
  assert.equal(fallback.length, 1);
  assert.ok(fallback[0]!.lane === 10 || fallback[0]!.lane === 11, `lane ${fallback[0]!.lane} came from the exposure`);
  assert.ok(fallback[0]!.s >= 0 && fallback[0]!.s < 800);
  assert.deepEqual(new Incidents(9).step(0, [], [{ node: 'x', conflictLoad: 5000, count: 1e9 }]), []);
  const fixed = new Incidents(9).step(0, [], [{ node: 'x', conflictLoad: 5000, count: 1e9, lane: 77, s: 123 }]);
  assert.equal(fixed[0]!.lane, 77); assert.equal(fixed[0]!.s, 123);
  console.log(`placement: lane s ${withLen[0]!.s} of 300 m; junction fallback lane ${fallback[0]!.lane} at ${fallback[0]!.s} m`);
});

test('a 3,000-car city: the expected incidents per game day', () => {
  // measured on the benchmark network at 3,000 cars for one game day (see the PR): 29,631 vehicle-km, 377,867 junction
  // passages, mean lane density 26.7 veh/km/lane, 0.6% of vehicle-km in stop-and-go; an assumed mean conflicting flow of
  // 300 veh/h, and 8 night hours of the 24
  const vehKm = 29_631, passages = 377_867, density = 26.7, stopGo = 0.006, load = 300;
  const avg = (f: (night: boolean) => number) => (f(false) * 16 + f(true) * 8) / 24;
  const breakdowns = vehKm * avg(n => breakdownRate(density, stopGo, n));
  const midLane = vehKm * avg(n => crashRate(density, stopGo, n));
  const junction = passages * avg(n => junctionCrashRate(load, n));
  console.log(`3,000 cars: ${breakdowns.toFixed(1)} breakdowns + ${midLane.toFixed(2)} mid-lane crashes + ${junction.toFixed(2)} ` +
    `junction crashes = ${(breakdowns + midLane + junction).toFixed(1)} incidents a game day (base ${BREAK_PER_MKM}/M-km; ` +
    `a game day is ${DAY} s)`);
  assert.ok(breakdowns > 4 && breakdowns < 10, `breakdowns a day ${breakdowns.toFixed(1)}`);
  assert.ok(midLane > 0.15 && midLane < 0.5, `mid-lane crashes a day ${midLane.toFixed(2)}`);
  assert.ok(junction > 0.3 && junction < 1, `junction crashes a day ${junction.toFixed(2)}`);
});

test('performance: a step over 2,000 lanes and a junction costs well under a millisecond', () => {
  const m = new Incidents(9), exp = lanes(2000, 50, 15, 0.2, 300);
  for (let s = 0; s < 20; s++) m.step(s, exp, []);
  const t0 = performance.now();
  for (let s = 0; s < 200; s++) m.step(s, exp, [{ node: 'a', conflictLoad: 500, count: 100 }]);
  const ms = (performance.now() - t0) / 200;
  console.log(`step: ${(ms * 1000).toFixed(0)} µs for 2,000 lanes + 1 junction`);
  assert.ok(ms < 2, `${ms.toFixed(2)} ms a step`);
});

// The surge's timeline (P02/T050): on the tournament day each car departs at its wanted arrival less its travel (golf/daytimeline.ts), the arrivals
// dealt to the cars in a seeded random order; without a timeline the old rule holds. Plans from plain data (no City). npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry } from '../src/game/iso';
import { DAY_START_MIN, simAt, wantedArrivals } from '../src/game/golf/daytimeline';
import { DEPART_END, SURGE_S, SURGE_SEED } from '../src/game/event/config';
import { Surge, type SurgeHome, type SurgePark, type SurgeTimeline } from '../src/game/event/surge';
import type { Lot } from '../src/game/lots/lots';

/** the cars of the plan, and the tournament day's start (sim s) */
const N = 20, T0 = 1000;
/** a copy of a list, in time order */
const sorted = (v: number[]): number[] => [...v].sort((a, b) => a - b);

/** N cars from one town: 20 homes (pop 1, component 0) and one car park (40 bays, one sink with a point and a direction) */
const fleet = (): { homes: SurgeHome[][]; parks: SurgePark[] } => ({
  homes: [Array.from({ length: N }, (_, i) => ({ lot: { key: `h${i}` } as unknown as Lot, town: 0, pop: 1, comp: 0 }))],
  parks: [{ comp: 0, bays: 40, sinks: [0], pts: [{ x: 0, y: 0 }], dirs: [{ x: 1, y: 0 }] }],
});
/** the plan on the timeline (seed), each car's travel from travel(home, park, bus) */
function timed(travel: SurgeTimeline['travel'], seed = SURGE_SEED): Surge {
  const { homes, parks } = fleet(), s = new Surge();
  s.plan([N], homes, parks, mulberry(3), T0, [], { t0: T0, seed, travel });
  return s;
}

test('timeline, no travel: the departures are the wanted arrivals on the day from t0 (within 1e-9)', () => {
  const got = sorted(timed(() => 0).departTimes()), want = sorted(wantedArrivals(N, SURGE_SEED).map(m => simAt(m, T0)));
  assert.equal(got.length, N, 'every car is scheduled');
  got.forEach((t, i) => assert.ok(Math.abs(t - want[i]!) <= 1e-9, `departure ${t} vs arrival ${want[i]}`));
});

test('timeline, travel 90 s: each car departs at a wanted arrival less 90 (never before t0); every arrival is dealt to a car', () => {
  const got = sorted(timed(() => 90).departTimes());
  const want = sorted(wantedArrivals(N, SURGE_SEED).map(a => simAt(Math.max(DAY_START_MIN, a - 90), T0)));
  got.forEach((t, i) => assert.ok(Math.abs(t - want[i]!) <= 1e-9, `departure ${t} vs ${want[i]}`));
  assert.ok(got.every(t => t >= T0), 'none before the day starts');
});

test('timeline: the same inputs give the same departures', () => {
  const travel = (h: SurgeHome) => 30 + 10 * Number(h.lot.key.slice(1));
  assert.deepEqual(timed(travel).departTimes(), timed(travel).departTimes());
});

test('no timeline: every departure lies in [t0, t0 + SURGE_S * DEPART_END] (the old rule)', () => {
  const { homes, parks } = fleet(), s = new Surge();
  s.plan([N], homes, parks, mulberry(3), T0);
  const ts = s.departTimes();
  assert.equal(ts.length, N, 'every car is scheduled');
  for (const t of ts) assert.ok(t >= T0 && t <= T0 + SURGE_S * DEPART_END, `departure at ${t}`);
});

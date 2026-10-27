// The range gate (T098, issue #168; P22 section 2.7): a fresh range start, the game's default new game, headless. The valley of the seed with its
// range start as the engine lays it (harness.ts setupRange: the county road, the drive, the range and its car park, the town's seed across the
// road), the city stepped one sim second at a time (harness stepSecond: City.step(10), the town's grow legs) on the golf town day (10 minutes,
// from 06:30), and the range's golfers (golf/rangebiz.ts RangeSim) stepped every 0.1 sim s on the town clock with the engine's demand (tier 1,
// the exits, the town's residents, no props, the practice greens), as golf/rangehost.ts steps them. The player does nothing: no upgrade, no hole.
//   npm run range:gate -- [seed = 1] [days = 20]
// Writes output/sim/range-gate.json (every town day) and prints the daily lines and the summary. Exit code 1 when a check fails.
//
// The checks (the bounds from main's numbers below, with a margin; THRESHOLDS):
//   (a) golfers served a day (the range's own count, golfers you see) in [GOLFERS_DAY]: the range is open and busy, not flooded;
//   (b) takings a day ($, the buckets as booked) in [TAKINGS_DAY]: the golfers' band at the starting price ($6) times the 10-minute day's scale (40);
//   (c) lost golfers (lost / (served + lost), all days) in [LOST_SHARE]: the fresh range's 4 bays turn about 40% away (none for a full car park);
//   (d) no car left on the road at day end: at 05:00 every day (shut since 18:00), no visit on the plot or the road and no range car drawn;
//   (e) range cars overlapping (T152's measure, tests/range-car-gap.test.ts closest: two moving cars one way in one lane, within 0.8 tiles across,
//       closer than a car's length of 2.75 tiles): at most OVERLAP_SHARE of the open-hours samples (one a sim second) with any;
//   (f) the step times: City.step (one sim second) mean under CITY_MEAN and p99 under CITY_P99 ms; RangeSim.step (0.1 sim s) mean under RANGE_MEAN
//       and p99 under RANGE_P99 ms.
//
// Main's numbers (d197e74, 2026-10-27, this PC; 20 town days, day 1 from 06:30; the town grows to about 730 residents):
//   seed  golfers a day  takings a day   lost    cleared  overlaps (where)                                  City.step mean/p99/max  RangeSim.step mean/p99/max
//   1     31-40          $7,440-$9,600   39.1%   19/19    1.12% (entrance 38, car park 24, turn 4, road 1)  0.56 / 0.71 / 8.9 ms    0.001 / 0.006 / 0.89 ms
//   2     30-40          $7,200-$9,600   42.9%   19/19    1.15% (entrance 40, car park 22, turn 4, road 3)  0.59 / 0.75 / 9.4 ms    0.001 / 0.008 / 1.06 ms
//   3     31-39          $7,440-$9,360   41.5%   19/19    1.03% (entrance 38, car park 21, turn 2, road 1)  0.56 / 0.73 / 8.9 ms    0.001 / 0.007 / 0.92 ms
// The bounds: golfers a day 20-60 (about half again either way: a busier town or a slower day stays in, an empty or flooded range does not);
// takings a day $4,800-$14,400 (that band at $240 a golfer); lost 25-55% (a queue that never turns anyone away, or one that loses most, fails);
// cleared on every day; overlaps at most 2% of the samples (main has about 1.1%, at the car park's entrance and in its aisles: T152 left them
// there; a regression that stacks cars on the road doubles it); City.step mean under 2 ms and p99 under 5 ms, RangeSim.step mean under 0.05 ms
// and p99 under 0.25 ms (several times main's, for a slower machine; the worker's own budget is 25 ms a step).
import fs from 'node:fs';
import path from 'node:path';
import { RANGE_DAY, rangeClock, rangeDemand, setupRange, stepSecond, type RangeHarness } from './harness';

const seed = Number(process.argv[2] ?? 1), days = Math.max(1, Math.round(Number(process.argv[3] ?? 20)));

/** the pass bounds (see the header) */
const THRESHOLDS = {
  GOLFERS_DAY: [20, 60] as [number, number], TAKINGS_DAY: [4800, 14400] as [number, number], LOST_SHARE: [0.25, 0.55] as [number, number], OVERLAP_SHARE: 0.02,
  CITY_MEAN: 2, CITY_P99: 5, RANGE_MEAN: 0.05, RANGE_P99: 0.25,
};
/** a car's length (tiles): the longest car, 5.5 m (T152) */
const CAR_LEN = 2.75;

type RangeCar = { out: boolean; inside: boolean; c: number; x: number; y: number; ang: number };
/** the sim's private parts the gate reads (as tests/range-car-gap.test.ts does) */
type Inside = { visits: { id: number; stage: number; slot: number; rc?: RangeCar }[] };
const inside = (h: RangeHarness) => h.range.sim as unknown as Inside;

/** the closest two moving range cars going one way in one lane (headings within 60 degrees, within 0.8 tiles across): their distance along
 *  (tiles; Infinity when none) */
function closest(cars: RangeCar[], at?: { x: number; y: number }): number {
  let m = Infinity;
  for (const a of cars) for (const b of cars) {
    if (a === b) continue;
    const hx = Math.cos(a.ang), hy = Math.sin(a.ang);
    if (hx * Math.cos(b.ang) + hy * Math.sin(b.ang) < 0.5) continue;
    const dx = b.x - a.x, dy = b.y - a.y, along = dx * hx + dy * hy;
    if (along >= 0 && Math.abs(dx * hy - dy * hx) < 0.8 && along < m) { m = along; if (at) { at.x = (a.x + b.x) / 2; at.y = (a.y + b.y) / 2; } }
  }
  return m;
}
/** where an overlap was (the pair's midpoint): at the turn off the county road (within 6 tiles of the drive's junction), at the car park's entrance
 *  (within 6 tiles), in the car park, on the drive or the plot, else on the county road */
function placeOf(h: RangeHarness, p: { x: number; y: number }): string {
  const sc = h.range.scene, J = sc.J, e = h.range.entrance, [px, py, pw, ph] = h.range.start.site.carpark, [rx, ry, rw, rh] = h.range.start.site.parcel;
  if (Math.hypot(p.x - J.x, p.y - J.y) < 6) return 'turn';
  if (e && Math.hypot(p.x - e.x, p.y - e.y) < 6) return 'entrance';
  if (p.x >= px && p.x <= px + pw && p.y >= py && p.y <= py + ph) return 'car park';
  if (p.x >= rx && p.x <= rx + rw && p.y >= ry && p.y <= ry + rh) return 'drive';
  return 'county road';
}
const q = (a: number[], f: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * s.length))]!; };
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (v: number) => Math.round(v * 10) / 10, r2 = (v: number) => Math.round(v * 100) / 100;

interface Day { day: number; golfers: number; lost: number; noPark: number; takings: number; pop: number; built: number; carsAt5: number | null; visitsAt5: number | null; samples: number; overlaps: number; minGap: number | null; maxCars: number }
/** the overlaps by place (placeOf) */
const where: Record<string, number> = {};
const mid = { x: 0, y: 0 };

const t0 = performance.now(), h = setupRange(seed), R = h.range, setupMs = performance.now() - t0;
const st = R.start.site;
console.log(`[range] seed ${seed}: range plot (${st.rangePlot.map(v => Math.round(v)).join(', ')}) facing ${st.dir}, car park ${R.slots.length} bays, entrance ${R.entrance ? `(${R.entrance.x.toFixed(0)}, ${R.entrance.y.toFixed(0)})` : 'none'}, town seed (${st.centre.x.toFixed(0)}, ${st.centre.y.toFixed(0)}); setup ${setupMs.toFixed(0)} ms`);

const cityMs: number[] = [], rangeMs: number[] = [], out: Day[] = [];
let cur: Day | null = null, lastDay = -1, takingsAt = 0, owed = 0;
const newDay = (day: number): Day => ({ day, golfers: 0, lost: 0, noPark: 0, takings: 0, pop: 0, built: 0, carsAt5: null, visitsAt5: null, samples: 0, overlaps: 0, minGap: null, maxCars: 0 });
const total = days * RANGE_DAY;
for (let s = 1; s <= total; s++) {
  stepSecond(h, s); cityMs.push(h.stepMs);
  const clock = rangeClock(h), sim = R.sim;
  // a new town day: the day before's counts (the range resets its own at its next step)
  if (clock.day !== lastDay) {
    if (cur) {
      cur.golfers = sim.today.golfers; cur.lost = sim.today.lost; cur.noPark = sim.today.noPark; cur.takings = R.save.season.takings - takingsAt;
      cur.pop = h.city.town.pop; cur.built = h.city.town.built; out.push(cur);
      console.log(`day ${String(cur.day).padStart(2)}: golfers ${String(cur.golfers).padStart(4)}, lost ${String(cur.lost).padStart(3)} (car park full ${cur.noPark}), takings $${Math.round(cur.takings)}, pop ${cur.pop}, built ${cur.built}; at 05:00 cars ${cur.carsAt5 ?? '-'} visits ${cur.visitsAt5 ?? '-'}; overlaps ${cur.overlaps}/${cur.samples} (closest ${cur.minGap === null ? '-' : cur.minGap.toFixed(2)} tiles), most cars ${cur.maxCars}`);
    }
    takingsAt = R.save.season.takings; lastDay = clock.day; cur = newDay(clock.day);
  }
  // the golfers, 0.1 sim s at a time
  for (let k = 0; k < 10; k++) { const a = performance.now(); owed += sim.step(0.1, clock, R.save, rangeDemand(h), RANGE_DAY); rangeMs.push(performance.now() - a); }
  const d = cur!, V = inside(h).visits;
  // (d) at 05:00, long after closing: nothing left
  if (d.carsAt5 === null && clock.hour >= 5 && clock.hour < 6) { d.carsAt5 = V.filter(v => v.rc || v.stage === 0 || v.stage === 10).length; d.visitsAt5 = V.length; }
  // (e) the moving cars while the range is open (07:00-18:00 and the drive-off after)
  if (clock.hour >= 7 && clock.hour < 19) {
    const cars = V.flatMap(v => (v.rc ? [v.rc] : [])), gap = closest(cars, mid);
    d.samples++; d.maxCars = Math.max(d.maxCars, cars.length);
    if (gap < CAR_LEN - 1e-6) { d.overlaps++; const w = placeOf(h, mid); where[w] = (where[w] ?? 0) + 1; }
    if (gap < Infinity) d.minGap = d.minGap === null ? gap : Math.min(d.minGap, gap);
  }
}

// the summary and the checks
const full = out.filter(d => d.carsAt5 !== null);
const golfers = out.reduce((a, d) => a + d.golfers, 0), lost = out.reduce((a, d) => a + d.lost, 0), takings = out.reduce((a, d) => a + d.takings, 0);
const samples = out.reduce((a, d) => a + d.samples, 0), overlaps = out.reduce((a, d) => a + d.overlaps, 0);
const T = THRESHOLDS, gd = out.map(d => d.golfers), td = out.map(d => d.takings);
const stats = {
  cityMean: r2(mean(cityMs)), cityP99: r2(q(cityMs, 0.99)), cityMax: r2(Math.max(...cityMs)),
  rangeMean: Math.round(mean(rangeMs) * 1000) / 1000, rangeP99: Math.round(q(rangeMs, 0.99) * 1000) / 1000, rangeMax: r2(Math.max(...rangeMs)),
};
const checks = {
  a_golfers: gd.every(v => v >= T.GOLFERS_DAY[0] && v <= T.GOLFERS_DAY[1]),
  b_takings: td.every(v => v >= T.TAKINGS_DAY[0] && v <= T.TAKINGS_DAY[1]),
  c_lost: ((v: number) => v >= T.LOST_SHARE[0] && v <= T.LOST_SHARE[1])(golfers + lost ? lost / (golfers + lost) : 0),
  d_cleared: full.every(d => d.carsAt5 === 0 && d.visitsAt5 === 0),
  e_overlap: (samples ? overlaps / samples : 0) <= T.OVERLAP_SHARE,
  f_steps: stats.cityMean < T.CITY_MEAN && stats.cityP99 < T.CITY_P99 && stats.rangeMean < T.RANGE_MEAN && stats.rangeP99 < T.RANGE_P99,
};
const pass = Object.values(checks).every(Boolean);
console.log(`[range] seed ${seed}, ${out.length} town days: golfers ${golfers} (a day ${Math.min(...gd)}-${Math.max(...gd)}), lost ${lost} (${r1(100 * lost / Math.max(1, golfers + lost))}%), takings $${Math.round(takings)} (a day $${Math.round(Math.min(...td))}-$${Math.round(Math.max(...td))}); `
  + `cleared by 05:00 on ${full.filter(d => d.carsAt5 === 0 && d.visitsAt5 === 0).length}/${full.length} days; overlaps ${overlaps}/${samples} samples (${r2(100 * overlaps / Math.max(1, samples))}%; ${Object.entries(where).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}), closest ${r2(Math.min(...out.map(d => d.minGap ?? Infinity)))} tiles; `
  + `pop ${out.at(-1)?.pop ?? 0}; City.step mean ${stats.cityMean} ms p99 ${stats.cityP99} max ${stats.cityMax}; RangeSim.step mean ${stats.rangeMean} ms p99 ${stats.rangeP99} max ${stats.rangeMax}`);
console.log(`[range] checks: ${Object.entries(checks).map(([k, v]) => `${k} ${v ? 'ok' : 'FAIL'}`).join(', ')} => ${pass ? 'PASS' : 'FAIL'}`);
fs.mkdirSync('output/sim', { recursive: true });
fs.writeFileSync(path.join('output/sim', `range-gate-${seed}.json`), JSON.stringify({ seed, days, setupMs: Math.round(setupMs), out, golfers, lost, takings, samples, overlaps, where, stats, checks, pass, owed: Math.round(owed), thresholds: T }, null, 1));
process.exit(pass ? 0 : 1);

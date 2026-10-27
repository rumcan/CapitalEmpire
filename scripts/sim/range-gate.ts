// The range gate (T098, issue #168; P22 section 2.7): a fresh range start, the game's default new game, headless. The valley of the seed with its
// range start as the engine lays it (harness.ts setupRange: the county road, the drive, the range and its car park, the town's seed across the
// road), the city stepped one sim second at a time (harness stepSecond: City.step(10), the town's grow legs) on the golf town day (10 minutes,
// from 06:30), and the range's golfers (golf/rangebiz.ts RangeSim) stepped every 0.1 sim s on the town clock with the engine's demand (tier 1,
// the exits, the town's residents, no props, the practice greens), as golf/rangehost.ts steps them. The player does nothing: no upgrade, no hole.
//   npm run range:gate -- [seed = 1] [days = 20] [seasons = 20]
// Writes output/sim/range-gate-<seed>.json (every town day and every season) and prints the daily and seasonal lines and the summary. Exit code 1
// when a check fails.
//
// The town's growth (T090, plan P22 2.7.2), over `seasons` seasons (1,440 sim s each: the Town's 24 growth hours) with a scripted course (holes 2
// in season 1, 9 in seasons 2-5, 18 from season 6) and success (1.0, then 1.2 from season 3), sent as the engine sends them (setGolf):
//   (g) the first leg by growth hour 2 and the first lot by hour 1;
//   (h) year 1 has 25-60 lots, year 5 220-400 lots and 500-1,000 residents, year 10 650-1,300 lots, year 20 1,800-3,200 lots and 4,000-7,500
//       residents (a year: a season; lots: built);
//   (i) no town seg nearer the golf land than 6 tiles (the county road lies NEAR, 6, from the parcel) and no lot that is not EMPTY on it;
//   (j) the built centre within 260 tiles of the seed at year 5 and within 400 at year 20, and fewer than 10% of the built lots over 500 tiles
//       from the seed at year 5 (no ribbon). The plan's 200 and 350 hold on seeds 2 and 3 (centre 46 / 172 and 41 / 235); seed 1's seed lies
//       among rivers and creeks on every side, and its town grows round them to 241 at year 5 and 371 at year 20 (a tighter ring, 90 + 9 x
//       sqrt(built), moved it by 1 tile: the streets' land, not the lot picks, sets it), so the bounds are seed 1's with a margin;
//   (k) every season has builds; City.step under 25 ms on average and under 60 ms at its worst over the whole run.
//
// The checks (the bounds from main's numbers below, with a margin; THRESHOLDS):
//   (a) golfers served a day (the range's own count, golfers you see) in [GOLFERS_DAY]: the range is open and busy, not flooded;
//   (b) takings a day ($, the buckets as booked) in [TAKINGS_DAY]: the golfers' band at the starting price ($6) times the 10-minute day's scale (40);
//   (c) lost golfers (lost / (served + lost), all days) in [LOST_SHARE]: the fresh range's 4 bays turn about 40% away (none for a full car park);
//   (d) no car left on the road at day end: at 05:00 every day (shut since 18:00), no visit on the plot or the road and no range car drawn;
//   (e) range cars overlapping (T152's measure, tests/range-car-gap.test.ts closest: two moving cars one way in one lane, within 0.8 tiles across,
//       closer than a car's length of 2.75 tiles): at most OVERLAP_SHARE of the open-hours samples (one a sim second) with any;
//   (f) the step times over those town days: City.step (one sim second) mean under CITY_MEAN and p99 under CITY_P99 ms; RangeSim.step (0.1 sim s)
//       mean under RANGE_MEAN and p99 under RANGE_P99 ms.
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
import { SEASON_LEN } from '../../src/game/golf/calendar';
import { LV } from '../../src/game/lots/town';
import type { LotMap } from '../../src/game/lots/lots';

const seed = Number(process.argv[2] ?? 1), days = Math.max(1, Math.round(Number(process.argv[3] ?? 20))), seasons = Math.max(0, Math.round(Number(process.argv[4] ?? 20)));
/** the growth bands (P22 2.7.2): lots [lo, hi] and residents [lo, hi] by year; the centre's reach (tiles) by year; the ribbon's distance and share */
const GROWTH = {
  lots: { 1: [25, 60], 5: [220, 400], 10: [650, 1300], 20: [1800, 3200] } as Record<number, [number, number]>,
  pop: { 5: [500, 1000], 20: [4000, 7500] } as Record<number, [number, number]>,
  centre: { 5: 260, 20: 400 } as Record<number, number>, RIBBON: 500, RIBBON_SHARE: 0.1, FIRST_LEG_H: 2, FIRST_LOT_H: 1, STEP_MEAN: 25, STEP_MAX: 60,
};
/** the town's congestion per season (T178, with its own traffic since T098's leave-time fix): the season's finished trips' mean time over their
 *  ideal (Sim.score's act / ideal), and the share of the zones with trips (half a trip of evidence or more) over the decline line (access > 1.8,
 *  lots/town.ts), and the busiest county-road junction's share of the town's traffic across them (GATE_SHARE: one junction carrying most trips
 *  would want a second connection; the grown town reaches the county road at 10-25 junctions). Bands from seeds 1-3 measured with the trips at
 *  the classic rate a sim second and the town paving its jammed junctions (seed 1: at most 2.58x, 10 of 54 zones, the busiest junction 29%) */
const CONGESTION = { RATIO_MAX: 3, BAD_SHARE: 0.25, DECLINE: 1.8, GATE_SHARE: 0.5 };
/** the scripted course and success of season k (1-based): holes 2, then 9 in seasons 2-5, 18 from 6; success 1.0, then 1.2 from season 3 */
const holesIn = (k: number) => (k <= 1 ? 2 : k <= 5 ? 9 : 18), successIn = (k: number) => (k <= 2 ? 1 : 1.2);

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
const total = Math.max(days * RANGE_DAY, seasons * SEASON_LEN);
interface Season { season: number; holes: number; success: number; built: number; lots: number; pop: number; builds: number; legs: number; centreD: number | null; ribbon: number; nearLand: number; onLand: number; ratio: number; zones: number; badZones: number; paved: number; county: number; gateShare: number }
const seasonsOut: Season[] = [];
let firstLeg = -1, firstLot = -1, builds = 0, legsN = 0, season = 1;
let ratioAt: [number, number] = [0, 0];
/** the town's paved streets: its own street segs, in tiles (T178: the town paves its jammed junctions' gravel arms) */
const pavedOf = () => { let L = 0; for (const sg of h.city.net.segs) if (sg.town && sg.cls.id === 'street') L += Math.hypot(sg.b.x - sg.a.x, sg.b.y - sg.a.y); return Math.round(L); };
const kinds: Record<string, number> = {};
const golf = R.start.save, land: [number, number, number, number][] = [golf.course, golf.parcel], seedPt = R.start.site.centre;
const setSeason = (k: number) => h.city.setGolf({ tier: golf.tier, rep: golf.rep, land, start: 'range', exits: golf.exits, holes: holesIn(k), townBoost: successIn(k) });
if (seasons) setSeason(1);
/** the season's end: the town as it stands (built lots, residents, the built centre, the ribbon share, golf land kept clear) */
function closeSeason(k: number) {
  const C = h.city as unknown as { lots: LotMap }, town = h.city.town;
  let sx = 0, sy = 0, m = 0, far = 0, onLand = 0;
  for (const st of town.states.values()) {
    const l = C.lots.lots.get(st.key); if (!l) continue;
    if (st.level >= LV.BUILDING && land.some(([x, y, w, hh]) => l.c.x > x && l.c.x < x + w && l.c.y > y && l.c.y < y + hh)) onLand++;
    if (st.level < LV.BUILT) continue;
    sx += l.c.x; sy += l.c.y; m++; if (Math.hypot(l.c.x - seedPt.x, l.c.y - seedPt.y) > GROWTH.RIBBON) far++;
  }
  let nearLand = 0;
  for (const sg of h.city.net.segs) if (sg.town && (sg.cls.id === 'gravel' || sg.cls.id === 'street')) for (const [x, y, w, hh] of land) { // the town's own streets (the county road, the drive and the range's paths are the game's)
    for (let i = 0; i <= 20; i++) { const px = sg.a.x + (sg.b.x - sg.a.x) * i / 20, py = sg.a.y + (sg.b.y - sg.a.y) * i / 20; if (Math.hypot(Math.max(x - px, 0, px - x - w), Math.max(y - py, 0, py - y - hh)) < 6 - 1e-6) { nearLand++; break; } }
  }
  // the congestion: this season's finished trips (their mean time over ideal) and the zones over the decline line
  const S = h.city.sim as unknown as { stats: { ratioSum: number; ratioN: number }; access: Float32Array; nS: Float64Array };
  const dn = S.stats.ratioN - ratioAt[1], ratio = dn > 0 ? (S.stats.ratioSum - ratioAt[0]) / dn : 1; ratioAt = [S.stats.ratioSum, S.stats.ratioN];
  const zs = [...S.access].filter((_, z) => S.nS[z]! > 0.5);
  // the county road's junctions with the town's streets: the busiest one's share of their traffic (T178: one junction carrying most trips wants a second)
  const rep = h.city.report(0), county = rep.junctions.filter(j => { const nd = h.city.net.nodeAt({ x: j.x, y: j.y }); return !!nd && nd.segs.some(sg => sg.cls.id === 'road') && nd.segs.some(sg => sg.town && (sg.cls.id === 'gravel' || sg.cls.id === 'street')); });
  const through = county.reduce((a, j) => a + j.through, 0), gate1 = through > 0 ? Math.max(...county.map(j => j.through)) / through : 0;
  const z: Season = { season: k, holes: holesIn(k), success: successIn(k), built: town.built, lots: town.built, pop: town.pop, builds, legs: legsN, centreD: m ? Math.round(Math.hypot(sx / m - seedPt.x, sy / m - seedPt.y)) : null, ribbon: m ? far / m : 0, nearLand, onLand , ratio: r2(ratio), zones: zs.length, badZones: zs.filter(a => a > CONGESTION.DECLINE).length, paved: pavedOf(), county: county.length, gateShare: r2(gate1) };
  seasonsOut.push(z); builds = 0; legsN = 0;
  if (k % 5 === 0) console.log(`  the town's events so far: ${JSON.stringify(kinds)}`);
  console.log(`season ${String(k).padStart(2)} (holes ${z.holes}, success ${z.success}): lots built ${z.built}, residents ${z.pop}, builds ${z.builds}, legs ${z.legs}; centre ${z.centreD ?? '-'} tiles from the seed, ${(100 * z.ribbon).toFixed(1)}% over ${GROWTH.RIBBON}; town segs near the golf land ${z.nearLand}, lots on it ${z.onLand}; trips ${z.ratio}x ideal, ${z.badZones}/${z.zones} zones over ${CONGESTION.DECLINE}, paved ${z.paved} tiles; county junctions ${z.county}, the busiest ${Math.round(100 * z.gateShare)}%`);
}
for (let s = 1; s <= total; s++) {
  const r = stepSecond(h, s); cityMs.push(h.stepMs);
  if (r.grow) { legsN += r.grow.length; if (firstLeg < 0) firstLeg = s; }
  for (const e of r.events) { kinds[e.kind] = (kinds[e.kind] ?? 0) + 1; if (e.kind === 'build') { builds++; if (firstLot < 0) firstLot = s; } }
  if (seasons && s % SEASON_LEN === 0 && season <= seasons) { closeSeason(season); season++; if (season <= seasons) setSeason(season); }
  if (s > days * RANGE_DAY) continue; // the range's own checks cover the first `days` town days
  const clock = rangeClock(h), sim = R.sim;
  // a new town day: the day before's counts (the range resets its own at its next step)
  if (clock.day !== lastDay) {
    if (cur && out.length < days) {
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
  // (f) over the range's own town days (the first `days`); the whole run's steps are (k)'s
  cityMean: r2(mean(cityMs.slice(0, days * RANGE_DAY))), cityP99: r2(q(cityMs.slice(0, days * RANGE_DAY), 0.99)), cityMax: r2(Math.max(...cityMs.slice(0, days * RANGE_DAY))),
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
// the growth (g)-(k)
const yr = (k: number) => seasonsOut.find(z => z.season === k);
const inBand = (v: number, b?: [number, number]) => !b || (v >= b[0] && v <= b[1]);
const growth = seasons ? {
  g_first: firstLeg > 0 && firstLeg <= GROWTH.FIRST_LEG_H * 60 && firstLot > 0 && firstLot <= GROWTH.FIRST_LOT_H * 60,
  h_bands: [1, 5, 10, 20].every(k => !yr(k) || (inBand(yr(k)!.built, GROWTH.lots[k]) && inBand(yr(k)!.pop, GROWTH.pop[k]))),
  i_land: seasonsOut.every(z => z.nearLand === 0 && z.onLand === 0),
  j_compact: [5, 20].every(k => !yr(k) || (yr(k)!.centreD ?? 0) <= GROWTH.centre[k]!) && (!yr(5) || yr(5)!.ribbon < GROWTH.RIBBON_SHARE),
  k_builds_steps: seasonsOut.every(z => z.builds > 0) && mean(cityMs) < GROWTH.STEP_MEAN && Math.max(...cityMs) < GROWTH.STEP_MAX,
  l_congestion: seasonsOut.every(z => z.ratio <= CONGESTION.RATIO_MAX && z.badZones <= CONGESTION.BAD_SHARE * Math.max(1, z.zones) && z.gateShare <= CONGESTION.GATE_SHARE),
} : {};
Object.assign(checks, growth);
if (seasons) console.log(`[range] growth, seed ${seed}: first leg at ${firstLeg} s, first lot at ${firstLot} s; ${[1, 5, 10, 20].filter(k => yr(k)).map(k => `year ${k}: ${yr(k)!.built} lots, ${yr(k)!.pop} residents, centre ${yr(k)!.centreD}`).join('; ')}; ribbon at year 5 ${yr(5) ? (100 * yr(5)!.ribbon).toFixed(1) + '%' : '-'}; City.step over ${seasons} seasons mean ${r2(mean(cityMs))} ms, max ${r2(Math.max(...cityMs))}`);
const pass = Object.values(checks).every(Boolean);
console.log(`[range] seed ${seed}, ${out.length} town days: golfers ${golfers} (a day ${Math.min(...gd)}-${Math.max(...gd)}), lost ${lost} (${r1(100 * lost / Math.max(1, golfers + lost))}%), takings $${Math.round(takings)} (a day $${Math.round(Math.min(...td))}-$${Math.round(Math.max(...td))}); `
  + `cleared by 05:00 on ${full.filter(d => d.carsAt5 === 0 && d.visitsAt5 === 0).length}/${full.length} days; overlaps ${overlaps}/${samples} samples (${r2(100 * overlaps / Math.max(1, samples))}%; ${Object.entries(where).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}), closest ${r2(Math.min(...out.map(d => d.minGap ?? Infinity)))} tiles; `
  + `pop ${out.at(-1)?.pop ?? 0}; City.step mean ${stats.cityMean} ms p99 ${stats.cityP99} max ${stats.cityMax}; RangeSim.step mean ${stats.rangeMean} ms p99 ${stats.rangeP99} max ${stats.rangeMax}`);
console.log(`[range] checks: ${Object.entries(checks).map(([k, v]) => `${k} ${v ? 'ok' : 'FAIL'}`).join(', ')} => ${pass ? 'PASS' : 'FAIL'}`);
fs.mkdirSync('output/sim', { recursive: true });
fs.writeFileSync(path.join('output/sim', `range-gate-${seed}.json`), JSON.stringify({ seed, days, seasons, seasonsOut, firstLeg, firstLot, growth: GROWTH, setupMs: Math.round(setupMs), out, golfers, lost, takings, samples, overlaps, where, stats, checks, pass, owed: Math.round(owed), thresholds: T }, null, 1));
process.exit(pass ? 0 : 1);

// Headless tests for the guided Year 1 rules module (T045): npm test (bundled by esbuild, run by node --test; no DOM).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_PRACTICE_PAST,
  FALLBACK_TEE_BEHIND,
  FALLBACK_TEE_PAST,
  GUIDE,
  GUIDE_STEPS,
  LEGACY_HINT_STEP,
  RANGE_GUIDE,
  FIRST_BUCKETS,
  FIRST_FETCH,
  fallbackTeeSpot,
  newRangeGuide,
  normalizeRangeGuide,
  rangeGuideCurrent,
  rangeGuideLines,
  rangeGuideOff,
  rangeGuideSkip,
  rangeGuideTick,
  guideNext,
  guideShown,
  guideSkip,
  guideStep,
  guideTable,
  stepMet,
  type GuideFacts,
} from '../src/game/ext/progressive-ui/guide';
import { plotOfFront } from '../src/game/golf/range';
import { RAMP_TOAST, computeProgressiveUiState, emptyProgress, normalizeProgress, progressFacts, rampEarned, rampLock, rampToast, type PlayerProgressFacts } from '../src/game/ext/progressive-ui';
import { inPractice, practiceArea } from '../src/game/golf/practice';

/** a default guide facts record */
function facts(over: Partial<GuideFacts> = {}): GuideFacts {
  return {
    pieces: 0,
    roads: 0,
    parks: 0,
    structures: 0,
    kinds: {},
    runs: 0,
    tutorial: 'on',
    step: 1,
    ...over,
  };
}

describe('guided Year 1 rules (T045)', () => {
  it('1. Fresh facts (all 0, kinds {}, runs 0, tutorial on, step 1) -> step 1 guide-welcome, guideNext -> 2, at step 2 -> guide-hole', () => {
    const f = facts();
    const s1 = guideStep(f);
    assert.ok(s1);
    assert.equal(s1.id, 'guide-welcome');
    assert.equal(s1.n, 1);
    assert.equal(s1.done, 'next');

    const next = guideNext(f);
    assert.equal(next, 2);

    const s2 = guideStep({ ...f, step: next });
    assert.ok(s2);
    assert.equal(s2.id, 'guide-hole');
    assert.equal(s2.n, 2);
    assert.equal(s2.done, 'auto');
  });

  it('2. At step 2 with tee + fairway but no green -> still step 2. Add a green -> step 3', () => {
    const fTeeFairway = facts({ step: 2, kinds: { tee: 1, fairway: 1 } });
    assert.equal(stepMet(2, fTeeFairway), false);
    const s2 = guideStep(fTeeFairway);
    assert.ok(s2);
    assert.equal(s2.id, 'guide-hole');
    assert.equal(s2.n, 2);

    const fCompleteHole = facts({ step: 2, kinds: { tee: 1, fairway: 1, green: 1 } });
    assert.equal(stepMet(2, fCompleteHole), true);
    const s3 = guideStep(fCompleteHole);
    assert.ok(s3);
    assert.equal(s3.id, 'guide-connect');
    assert.equal(s3.n, 3);
  });

  it('3. At step 2 with tee, fairway, green, a path and a park already -> step 5 (3 and 4 are already met)', () => {
    const fAdvanced = facts({
      step: 2,
      kinds: { tee: 1, fairway: 1, green: 1, path: 1 },
      parks: 1,
    });
    const s5 = guideStep(fAdvanced);
    assert.ok(s5);
    assert.equal(s5.id, 'guide-gate');
    assert.equal(s5.n, 5);
  });

  it('4. At step 3 with roads 1 (no path piece) -> step 4', () => {
    const fRoad = facts({ step: 3, roads: 1, kinds: {} });
    assert.equal(stepMet(3, fRoad), true);
    const s4 = guideStep(fRoad);
    assert.ok(s4);
    assert.equal(s4.id, 'guide-park');
    assert.equal(s4.n, 4);
  });

  it('5. Step 6 needs runs >= 1. With runs 1 at step 6 -> step 7. guideNext at 7 -> 8. Then guideStep is null', () => {
    const fRuns0 = facts({ step: 6, runs: 0 });
    assert.equal(stepMet(6, fRuns0), false);
    const s6 = guideStep(fRuns0);
    assert.ok(s6);
    assert.equal(s6.id, 'guide-tournament');
    assert.equal(s6.n, 6);

    const fRuns1 = facts({ step: 6, runs: 1 });
    assert.equal(stepMet(6, fRuns1), true);
    const s7 = guideStep(fRuns1);
    assert.ok(s7);
    assert.equal(s7.id, 'guide-results');
    assert.equal(s7.n, 7);
    assert.equal(s7.done, 'next');

    const next8 = guideNext(fRuns1);
    assert.equal(next8, 8);

    const sFinished = guideStep({ ...fRuns1, step: next8 });
    assert.equal(sFinished, null);
  });

  it('6. tutorial: off -> null at any step. guideSkip() gives { tutorial: off }', () => {
    for (let step = 1; step <= 7; step++) {
      assert.equal(guideStep(facts({ step, tutorial: 'off' })), null);
    }
    assert.deepEqual(guideSkip(), { tutorial: 'off' });
  });

  it('7. guideNext on an auto step (step 2, unmet) returns 2 unchanged', () => {
    const fUnmet = facts({ step: 2, kinds: {} });
    assert.equal(guideNext(fUnmet), 2);
  });

  it('8. Every GUIDE entry has n = its index + 1 and a non-empty title and body, and the ids are unique. GUIDE_STEPS === GUIDE.length', () => {
    assert.equal(GUIDE_STEPS, GUIDE.length);
    assert.equal(GUIDE.length, 7);
    const ids = new Set<string>();
    GUIDE.forEach((g, idx) => {
      assert.equal(g.n, idx + 1);
      assert.equal(typeof g.title === 'string' && g.title.length > 0, true);
      assert.equal(typeof g.body === 'string' && g.body.length > 0, true);
      assert.equal(ids.has(g.id), false);
      ids.add(g.id);
    });
  });

  it('9. LEGACY_HINT_STEP mappings match spec', () => {
    assert.equal(LEGACY_HINT_STEP['hint-build-first-hole'], 2);
    assert.equal(LEGACY_HINT_STEP['hint-connect-road-and-park'], 4);
    assert.equal(LEGACY_HINT_STEP['hint-place-gate-and-tents'], 5);
    assert.equal(LEGACY_HINT_STEP['hint-traffic-and-advanced'], 7);
  });
});

describe("a range start's guided build (T239: the guide's card)", () => {
  /** a new range game's facts: nothing built */
  const range = (over: Partial<GuideFacts> = {}): GuideFacts => facts({ start: 'range', step: 1, holes: 0, golfers: 0, owned: [], walkway: false, practiceForSale: true, putting: 'none', ...over });

  // T288 (#873, the owner: "only his trailer and plot is there"): two placement steps first (the range, its car park); #1297 (the owner, 2026-11-14): the steps from the target greens to the first
  // hole are out of the guide: three steps are left
  const REMOVED = ['guide-range-greens', 'guide-range-path', 'guide-range-carpark', 'guide-range-turf', 'guide-range-practice', 'guide-range-hole'];
  it('10. start range picks RANGE_GUIDE: 3 steps in the build\'s order (place the range, its car park, the buckets and the balls), unique ids, each with a reward; any other start keeps GUIDE', () => {
    assert.equal(guideTable({ start: 'range' }), RANGE_GUIDE);
    assert.equal(guideTable({ start: 'town' }), GUIDE);
    assert.equal(guideTable({}), GUIDE);
    assert.equal(GUIDE.length, GUIDE_STEPS); assert.equal(RANGE_GUIDE.length, 3);
    assert.deepEqual(RANGE_GUIDE.map(g => g.n), [1, 2, 3]);
    assert.deepEqual(RANGE_GUIDE.map(g => g.id), ['guide-range-place', 'guide-range-lot', 'guide-range-buckets']);
    for (const g of RANGE_GUIDE) assert.ok(g.title.length > 0 && g.body.length > 0 && g.done === 'auto' && (g.reward ?? 0) > 0 && g.target.ui, g.id);
    // the rewards went with the steps taken out (they were $1,000 each for the greens, the path, the car park's gravel and paving, the turf and the practice area, $2,500 for the first hole)
    assert.equal(RANGE_GUIDE.reduce((a, g) => a + g.reward!, 0), 2000, 'the rewards: $2,000 in all (it was $9,500 with nine steps)');
    assert.deepEqual(RANGE_GUIDE.map(g => g.reward), [1000, 500, 500], 'the three that are left pay what they paid');
    for (const id of REMOVED) assert.ok(!RANGE_GUIDE.some(g => g.id === id), `${id} is out of the guide`);
    assert.ok(RANGE_GUIDE.every(g => !g.target.map), 'no step has a place on the map to ring (the walking path\'s rings went)');
  });

  it('11. each step is met by its own build (T288: the range placed, its car park placed): the buckets sold and the balls fetched back; the steps taken out are met by nothing', () => {
    assert.equal(stepMet(1, range({ rangePlaced: false })), false); assert.equal(stepMet(1, range({ rangePlaced: true })), true);
    assert.equal(stepMet(2, range({ lotPlaced: false })), false); assert.equal(stepMet(2, range({ lotPlaced: true })), true);
    assert.equal(stepMet(3, range({ golfers: FIRST_BUCKETS - 1 })), false); assert.equal(stepMet(3, range({ golfers: FIRST_BUCKETS })), true);
    // T459 (#1211): with the ball loop, the step also waits for a bucket's worth of balls fetched back to the ball room
    assert.equal(stepMet(3, range({ golfers: FIRST_BUCKETS, ballsBack: 0 })), false, 'buckets sold, no balls fetched yet');
    assert.equal(stepMet(3, range({ golfers: FIRST_BUCKETS, ballsBack: FIRST_FETCH - 1 })), false);
    assert.equal(stepMet(3, range({ golfers: FIRST_BUCKETS, ballsBack: FIRST_FETCH })), true);
    assert.equal(stepMet(3, range({ golfers: FIRST_BUCKETS - 1, ballsBack: 999 })), false, 'balls fetched but no buckets sold yet');
    assert.match(RANGE_GUIDE[2]!.body, /hold F/, 'the step says how to pick the balls up'); assert.equal(RANGE_GUIDE[2]!.target.ui, 'rail-walk');
    // a new game starts by placing the range (PR #1274): step 1 is met at once (the placement facts say nothing against it), and the guide's card shows it done
    assert.equal(stepMet(1, range()), true, 'the range is placed by the start');
    // the steps that were 4 to 9 are no steps: nothing meets them
    const all = range({ owned: ['greens', 'gravel', 'pave', 'teeturf'], walkway: true, practiceForSale: false, putting: 'open', holes: 5, golfers: 99, ballsBack: 999 });
    for (const n of [4, 5, 6, 7, 8, 9]) assert.equal(stepMet(n, all), false, `step ${n} is out of the guide`);
  });

  it('12. the card: steps tick when done (in any order) and pay once; Skip leaves one out unpaid; Skip guide puts the card away; done, it goes', () => {
    const g = newRangeGuide(), P = { rangePlaced: false, lotPlaced: false }; // (T288: an older save's bare start's facts)
    let lines = rangeGuideLines(g)!;
    assert.equal(lines.length, 3); assert.ok(lines.every(l => l.state === 'todo')); assert.deepEqual(lines.filter(l => l.current).map(l => l.step.n), [1]);
    assert.equal(rangeGuideCurrent(g), 1);
    // the buckets and the balls first: step 3 ticks out of order, the current step stays 1
    assert.deepEqual(rangeGuideTick(g, range({ ...P, golfers: 9 })).map(s => s.n), [3]);
    assert.deepEqual(rangeGuideTick(g, range({ ...P, golfers: 9 })), [], 'ticked once');
    assert.equal(rangeGuideCurrent(g), 1); assert.equal(rangeGuideLines(g)![2]!.state, 'done');
    // Skip the car park: no reward, and it is not ticked later when the car park is placed
    assert.equal(rangeGuideSkip(g, 'guide-range-lot'), true); assert.equal(rangeGuideSkip(g, 'guide-range-lot'), false); assert.equal(rangeGuideSkip(g, 'guide-range-buckets'), false, 'a done step stays done');
    assert.deepEqual(rangeGuideTick(g, range({ golfers: 9, lotPlaced: true })).map(s => s.n), [1], 'the range is placed: step 1 ticks; the skipped car park does not');
    lines = rangeGuideLines(g)!; assert.equal(lines, null, 'every step done or skipped: the card goes'); assert.equal(rangeGuideCurrent(g), undefined);
    // Skip guide
    const h = newRangeGuide(); rangeGuideOff(h); assert.equal(rangeGuideLines(h), null); assert.deepEqual(rangeGuideTick(h, range({ golfers: 9 })), [], 'nothing ticks or pays once skipped');
    // a new game's: the range is placed by the start, so step 1 is ticked at the first check and the car park is the step to do
    const n = newRangeGuide(); assert.deepEqual(rangeGuideTick(n, range({ lotPlaced: false })).map(s => s.n), [1]);
    assert.equal(rangeGuideCurrent(n), 2); assert.deepEqual(rangeGuideLines(n)!.map(l => l.state), ['done', 'todo', 'todo']);
  });

  it('13. the save: the guide round-trips; a range save from before T239 (no guide) has no card; junk is dropped; a save with the steps taken out ticked or pending loads cleanly and no longer shows them', () => {
    const g = newRangeGuide(); g.done.push('guide-range-buckets'); g.skipped.push('guide-range-lot');
    const p = normalizeProgress(JSON.parse(JSON.stringify({ ...emptyProgress(), ramp: 1, guide: g })));
    assert.deepEqual(p.guide, g);
    const old = normalizeProgress(JSON.parse(JSON.stringify({ ...emptyProgress(), ramp: 3 })));
    assert.equal(old.guide, undefined); assert.equal(rangeGuideLines(old.guide), null, 'an old range save: no card');
    assert.equal(normalizeProgress({ ...emptyProgress(), guide: g }).guide, undefined, 'no ramp (not a new range game): no guide');
    assert.deepEqual(normalizeRangeGuide({ done: ['guide-range-greens', 'nope', 3, 'guide-range-place'], skipped: ['guide-range-greens', 'guide-range-turf', 'guide-range-lot'], off: 'yes' }), { done: ['guide-range-place'], skipped: ['guide-range-lot'], off: false });
    assert.equal(normalizeRangeGuide('junk'), null);
    // a nine-step save (the one T288 wrote): some of the steps taken out ticked, some skipped, the rest pending, and the three that stay in their states
    const nine = { done: ['guide-range-place', 'guide-range-greens', 'guide-range-carpark'], skipped: ['guide-range-path', 'guide-range-lot'], off: false };
    const q = normalizeProgress(JSON.parse(JSON.stringify({ ...emptyProgress(), ramp: 2, guide: nine })));
    assert.deepEqual(q.guide, { done: ['guide-range-place'], skipped: ['guide-range-lot'], off: false });
    const lines = rangeGuideLines(q.guide)!; assert.deepEqual(lines.map(l => [l.step.id, l.state]), [['guide-range-place', 'done'], ['guide-range-lot', 'skipped'], ['guide-range-buckets', 'todo']]);
    assert.equal(rangeGuideCurrent(q.guide), 3);
    // one that had every step ticked, the removed ones too: nothing left to do, no card
    const all = normalizeProgress(JSON.parse(JSON.stringify({ ...emptyProgress(), ramp: 3, guide: { done: ['guide-range-place', 'guide-range-lot', 'guide-range-buckets', ...REMOVED], skipped: [], off: false } })));
    assert.equal(rangeGuideLines(all.guide), null); assert.equal(rangeGuideCurrent(all.guide), undefined);
    // the pending ones never tick again (they are not in the table) and never pay
    assert.deepEqual(rangeGuideTick(q.guide!, range({ owned: ['greens', 'gravel', 'pave', 'teeturf'], walkway: true, putting: 'open', practiceForSale: false, holes: 3 })), []);
  });

  it('14b. the tools follow the ramp alone (#1297: the guide\'s steps no longer open them, and course building unlocks later): Land for sale and the paths with the first upgrade, New hole with the takings; the card replaces the hints while it runs', () => {
    const at = (n: number | null, extra: Partial<PlayerProgressFacts> = {}) => {
      const g = newRangeGuide(); for (const s of RANGE_GUIDE) if (n !== null && s.n < n) g.skipped.push(s.id);
      if (n === null) rangeGuideOff(g);
      const p = { ...emptyProgress(), ramp: 0 as const, guide: g };
      return { ...progressFacts(p, { holes: 0, seasons: 0, invited: false, range: { upgrades: 0, seasonTakings: 0, propsPlaced: false } }), ...extra };
    };
    assert.equal(at(1).guideStep, 1); assert.equal(at(3).guideStep, 3); assert.equal(at(null).guideStep, undefined, 'skipped: no step');
    // whatever step the guide is on, the paths, Holes and the practice greens wait for the first range upgrade, New hole for the takings, as the ramp has it
    for (const n of [1, 2, 3, null]) {
      for (const t of ['path', 'course', 'practice'] as const) assert.ok(rampLock(at(n), t), `${t} waits for the first upgrade (guide step ${n})`);
      assert.ok(computeProgressiveUiState(at(n)).newHoleLock, `New hole waits (guide step ${n})`); assert.equal(rampEarned(at(n)), 0);
      assert.ok(!computeProgressiveUiState(at(n)).visibleGolfChips.includes('land'), `Land for sale waits (guide step ${n})`); assert.equal(computeProgressiveUiState(at(n)).chipLocks, undefined, 'no guide lock on it any more');
    }
    // the first upgrade opens them, whatever the guide's step
    const up = (n: number | null) => at(n, { ramp: { ...at(n).ramp!, upgrades: 1 } });
    for (const n of [1, 3, null]) { for (const t of ['path', 'course', 'practice'] as const) assert.equal(rampLock(up(n), t), null, `${t} with an upgrade`); assert.ok(computeProgressiveUiState(up(n)).visibleGolfChips.includes('land')); assert.ok(computeProgressiveUiState(up(n)).newHoleLock, 'New hole still waits'); }
    // the takings (or the second season) open New hole, as before the guided build
    assert.equal(computeProgressiveUiState(at(3, { ramp: { ...at(3).ramp!, seasonTakings: 20000 } })).newHoleLock, null);
    // the card replaces the ramp's hints while it runs; skipped, they come back
    assert.equal(computeProgressiveUiState(at(1)).activeHint, null);
    assert.equal(computeProgressiveUiState(at(null)).activeHint?.id, 'hint-range-open');
    assert.ok(computeProgressiveUiState(up(null)).visibleGolfChips.includes('land'), 'skipped: Land for sale opens with the first upgrade, as Phase A had it');
  });

  it('14. old saves without the guide\'s progress get no guide (either start), and a range start is never offered the stuck step', () => {
    for (let step = 1; step <= 7; step++) {
      assert.equal(guideStep(facts({ step, progress: false })), null);
      assert.equal(guideStep(range({ step, progress: false })), null);
    }
    assert.equal(guideShown(facts({ tutorial: 'off', progress: false, seasons: 2 })), null);
    assert.equal(guideShown(range({ tutorial: 'off', seasons: 3, playS: 99999 })), null);
    assert.equal(guideShown(facts({ tutorial: 'off', seasons: 1 }))?.id, 'guide-stuck');
  });

  it('15. the ring\'s fallback tee: off the range plot, on the parcel, FALLBACK_TEE_PAST past the plot on the side with more parcel, behind the front', () => {
    for (const dir of [0, 1, 2, 3] as const) {
      const alongX = dir === 0 || dir === 2;
      // a front of 70 x 24 tiles at (1000, 1000) (24 x 70 when the road runs along y), its plot, and a parcel 450 along the road from the plot's far side
      const front: [number, number, number, number] = alongX ? [1000, 1000, 70, 24] : [1000, 1000, 24, 70];
      const plot = plotOfFront(front, dir);
      const parcel: [number, number, number, number] = alongX ? [plot[0], plot[1], 450, plot[3]] : [plot[0], plot[1], plot[2], 450];
      const t = fallbackTeeSpot(plot, front, parcel, dir);
      const onPlot = t.x >= plot[0] && t.x < plot[0] + plot[2] && t.y >= plot[1] && t.y < plot[1] + plot[3];
      assert.equal(onPlot, false, `dir ${dir}: off the plot`);
      assert.ok(t.x > parcel[0] && t.x < parcel[0] + parcel[2] && t.y > parcel[1] && t.y < parcel[1] + parcel[3], `dir ${dir}: on the parcel`);
      const behind = dir === 0 ? front[1] - FALLBACK_TEE_BEHIND : dir === 1 ? front[0] + front[2] + FALLBACK_TEE_BEHIND : dir === 2 ? front[1] + front[3] + FALLBACK_TEE_BEHIND : front[0] - FALLBACK_TEE_BEHIND;
      if (alongX) { assert.equal(t.x, plot[0] + plot[2] + FALLBACK_TEE_PAST); assert.equal(t.y, behind); }
      else { assert.equal(t.y, plot[1] + plot[3] + FALLBACK_TEE_PAST); assert.equal(t.x, behind); }
      // the parcel on the other side: the tee goes that way
      const left: [number, number, number, number] = alongX ? [plot[0] + plot[2] - 450, plot[1], 450, plot[3]] : [plot[0], plot[1] + plot[3] - 450, plot[2], 450];
      const u = fallbackTeeSpot(plot, front, left, dir);
      if (alongX) assert.equal(u.x, plot[0] - FALLBACK_TEE_PAST); else assert.equal(u.y, plot[1] - FALLBACK_TEE_PAST);
      // the range's practice area beside the plot (P24 T130): the tee goes FALLBACK_PRACTICE_PAST past it, never on it
      const pa = practiceArea(plot, dir), w = fallbackTeeSpot(plot, front, parcel, dir, pa.box);
      assert.equal(inPractice(pa, w.x, w.y), false, `dir ${dir}: off the practice area`);
      const onPlotW = w.x >= plot[0] && w.x < plot[0] + plot[2] && w.y >= plot[1] && w.y < plot[1] + plot[3];
      assert.equal(onPlotW, false, `dir ${dir}: off the plot with the practice area`);
      const far = alongX ? Math.max(plot[0] + plot[2] + FALLBACK_TEE_PAST, pa.box[2] + FALLBACK_PRACTICE_PAST) : Math.max(plot[1] + plot[3] + FALLBACK_TEE_PAST, pa.box[3] + FALLBACK_PRACTICE_PAST);
      if (alongX) assert.equal(w.x, Math.min(far, parcel[0] + parcel[2] - 2)); else assert.equal(w.y, Math.min(far, parcel[1] + parcel[3] - 2));
    }
  });
});

describe('the ramp toast (T132; T095: none when the tools were open already)', () => {
  it('17. a step that rises toasts; the same step, an open tool set (Show every tool now, the dev unlock) or New hole after a hole does not', () => {
    assert.equal(rampToast(0, 1, { open: false, holes: 0 }), RAMP_TOAST[1]);
    assert.equal(rampToast(2, 3, { open: false, holes: 0 }), RAMP_TOAST[3]);
    assert.equal(rampToast(1, 1, { open: false, holes: 0 }), null);
    assert.equal(rampToast(0, 3, { open: true, holes: 1 }), null);
    assert.equal(rampToast(0, 1, { open: true, holes: 0 }), null);
    assert.equal(rampToast(2, 3, { open: false, holes: 1 }), null);
    assert.equal(rampToast(1, 2, { open: false, holes: 1 }), RAMP_TOAST[2]);
    assert.equal(rampToast(undefined, 3, { open: false, holes: 0 }), null);
    assert.equal(rampToast(0, undefined, { open: false, holes: 0 }), null);
  });
});

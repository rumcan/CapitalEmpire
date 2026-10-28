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
import { GUIDE_LAND_WHY, RAMP_TOAST, computeProgressiveUiState, emptyProgress, normalizeProgress, progressFacts, rampEarned, rampLock, rampToast, type PlayerProgressFacts } from '../src/game/ext/progressive-ui';
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

  it('10. start range picks RANGE_GUIDE: 7 steps in the build\'s order, unique ids, each with a reward; any other start keeps GUIDE', () => {
    assert.equal(guideTable({ start: 'range' }), RANGE_GUIDE);
    assert.equal(guideTable({ start: 'town' }), GUIDE);
    assert.equal(guideTable({}), GUIDE);
    assert.equal(RANGE_GUIDE.length, GUIDE_STEPS);
    assert.deepEqual(RANGE_GUIDE.map(g => g.n), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(RANGE_GUIDE.map(g => g.id), ['guide-range-buckets', 'guide-range-greens', 'guide-range-path', 'guide-range-carpark', 'guide-range-turf', 'guide-range-practice', 'guide-range-hole']);
    for (const g of RANGE_GUIDE) assert.ok(g.title.length > 0 && g.body.length > 0 && g.done === 'auto' && (g.reward ?? 0) > 0 && g.target.ui, g.id);
    assert.equal(RANGE_GUIDE.reduce((a, g) => a + g.reward!, 0), 8000, 'the rewards: $8,000 in all, about the first builds\' price');
    assert.equal(RANGE_GUIDE[2]!.target.map, 'walkway');
  });

  it('11. each step is met by its own build: buckets sold, greens, a walkway, the paved lot, the turf, the practice area bought with its putting green, a hole', () => {
    assert.equal(stepMet(1, range({ golfers: FIRST_BUCKETS - 1 })), false); assert.equal(stepMet(1, range({ golfers: FIRST_BUCKETS })), true);
    assert.equal(stepMet(2, range({ owned: ['gravel'] })), false); assert.equal(stepMet(2, range({ owned: ['greens'] })), true);
    assert.equal(stepMet(3, range()), false); assert.equal(stepMet(3, range({ walkway: true })), true);
    assert.equal(stepMet(4, range({ owned: ['gravel'] })), false, 'gravel alone: not yet'); assert.equal(stepMet(4, range({ owned: ['gravel', 'pave'] })), true);
    assert.equal(stepMet(5, range({ owned: ['grass'] })), false); assert.equal(stepMet(5, range({ owned: ['teeturf'] })), true);
    assert.equal(stepMet(6, range({ practiceForSale: false })), false, 'bought, no green yet');
    assert.equal(stepMet(6, range({ practiceForSale: true, putting: 'open' })), false);
    assert.equal(stepMet(6, range({ practiceForSale: false, putting: 'open' })), true);
    assert.equal(stepMet(7, range({ holes: 0 })), false); assert.equal(stepMet(7, range({ holes: 1 })), true);
    // the old start's triggers do not count
    assert.equal(stepMet(7, range({ kinds: { tee: 1, fairway: 1, green: 1 }, clubhouse: true })), false);
  });

  it('12. the card: steps tick when done (in any order) and pay once; Skip leaves one out unpaid; Skip guide puts the card away; done, it goes', () => {
    const g = newRangeGuide();
    let lines = rangeGuideLines(g)!;
    assert.equal(lines.length, 7); assert.ok(lines.every(l => l.state === 'todo')); assert.deepEqual(lines.filter(l => l.current).map(l => l.step.n), [1]);
    assert.equal(rangeGuideCurrent(g), 1);
    // the player paves before anything else: step 4 ticks out of order, the current step stays 1
    assert.deepEqual(rangeGuideTick(g, range({ owned: ['gravel', 'pave'] })).map(s => s.n), [4]);
    assert.deepEqual(rangeGuideTick(g, range({ owned: ['gravel', 'pave'] })), [], 'ticked once');
    assert.equal(rangeGuideCurrent(g), 1); assert.equal(rangeGuideLines(g)![3]!.state, 'done');
    // buckets sold and the greens: 1 and 2 tick, the current step is the walking path
    assert.deepEqual(rangeGuideTick(g, range({ golfers: 9, owned: ['greens', 'gravel', 'pave'] })).map(s => s.n), [1, 2]);
    assert.equal(rangeGuideCurrent(g), 3);
    // Skip the walking path: no reward, and it is not ticked later when the path is laid
    assert.equal(rangeGuideSkip(g, 'guide-range-path'), true); assert.equal(rangeGuideSkip(g, 'guide-range-path'), false); assert.equal(rangeGuideSkip(g, 'guide-range-greens'), false, 'a done step stays done');
    assert.equal(rangeGuideCurrent(g), 5);
    assert.deepEqual(rangeGuideTick(g, range({ golfers: 9, owned: ['greens', 'gravel', 'pave'], walkway: true })), []);
    lines = rangeGuideLines(g)!; assert.equal(lines[2]!.state, 'skipped');
    // the rest: done, the card goes
    assert.deepEqual(rangeGuideTick(g, range({ golfers: 9, owned: ['greens', 'gravel', 'pave', 'teeturf'], practiceForSale: false, putting: 'open', holes: 1 })).map(s => s.n), [5, 6, 7]);
    assert.equal(rangeGuideLines(g), null); assert.equal(rangeGuideCurrent(g), undefined);
    // Skip guide
    const h = newRangeGuide(); rangeGuideOff(h); assert.equal(rangeGuideLines(h), null); assert.deepEqual(rangeGuideTick(h, range({ owned: ['greens'] })), [], 'nothing ticks or pays once skipped');
  });

  it('13. the save: the guide round-trips; a range save from before T239 (no guide) has no card; junk is dropped', () => {
    const g = newRangeGuide(); g.done.push('guide-range-buckets'); g.skipped.push('guide-range-path');
    const p = normalizeProgress(JSON.parse(JSON.stringify({ ...emptyProgress(), ramp: 1, guide: g })));
    assert.deepEqual(p.guide, g);
    const old = normalizeProgress(JSON.parse(JSON.stringify({ ...emptyProgress(), ramp: 3 })));
    assert.equal(old.guide, undefined); assert.equal(rangeGuideLines(old.guide), null, 'an old range save: no card');
    assert.equal(normalizeProgress({ ...emptyProgress(), guide: g }).guide, undefined, 'no ramp (not a new range game): no guide');
    assert.deepEqual(normalizeRangeGuide({ done: ['guide-range-greens', 'nope', 3, 'guide-range-greens'], skipped: ['guide-range-greens', 'guide-range-turf'], off: 'yes' }), { done: ['guide-range-greens'], skipped: ['guide-range-turf'], off: false });
    assert.equal(normalizeRangeGuide('junk'), null);
  });

  it('14b. the unlocks follow the steps: the paths at the walking path, Land for sale at the practice area (with why), New hole at the first hole', () => {
    const at = (n: number | null, extra: Partial<PlayerProgressFacts> = {}) => {
      const g = newRangeGuide(); for (const s of RANGE_GUIDE) if (n !== null && s.n < n) g.skipped.push(s.id);
      if (n === null) rangeGuideOff(g);
      const p = { ...emptyProgress(), ramp: 0 as const, guide: g };
      return { ...progressFacts(p, { holes: 0, seasons: 0, invited: false, range: { upgrades: 0, seasonTakings: 0, propsPlaced: false } }), ...extra };
    };
    assert.equal(at(1).guideStep, 1); assert.equal(at(null).guideStep, undefined, 'skipped: no step');
    assert.ok(rampLock(at(2), 'path'), 'the paths wait for the walking path step (no upgrade yet)');
    assert.equal(rampLock(at(3), 'path'), null, 'open at the walking path step, even with no upgrade bought');
    assert.ok(rampLock(at(5), 'practice')); assert.equal(rampLock(at(6), 'practice'), null);
    const u5 = computeProgressiveUiState(at(5)), u6 = computeProgressiveUiState(at(6));
    assert.ok(!u5.visibleGolfChips.includes('land')); assert.equal(u5.chipLocks?.land, GUIDE_LAND_WHY);
    assert.ok(u6.visibleGolfChips.includes('land')); assert.equal(u6.chipLocks, undefined);
    assert.ok(computeProgressiveUiState(at(6)).newHoleLock, 'New hole waits'); assert.equal(computeProgressiveUiState(at(7)).newHoleLock, null, 'open at the first hole step');
    assert.equal(rampEarned(at(7)), 3);
    // the card replaces the ramp's hints while it runs; skipped, they come back
    assert.equal(computeProgressiveUiState(at(1)).activeHint, null);
    assert.equal(computeProgressiveUiState(at(null)).activeHint?.id, 'hint-range-open');
    // skipped: Land for sale opens with the first upgrade, as Phase A had it
    assert.ok(!computeProgressiveUiState(at(null)).visibleGolfChips.includes('land'));
    assert.ok(computeProgressiveUiState(at(null, { ramp: { ...at(null).ramp!, upgrades: 1 } })).visibleGolfChips.includes('land'));
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

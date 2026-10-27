// Headless tests for the guided Year 1 rules module (T045): npm test (bundled by esbuild, run by node --test; no DOM).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_PRACTICE_PAST,
  FALLBACK_TEE_BEHIND,
  FALLBACK_TEE_PAST,
  GUIDE,
  INVITE_HOLD_S,
  GUIDE_STEPS,
  LEGACY_HINT_STEP,
  RANGE_GUIDE,
  fallbackTeeSpot,
  guideNext,
  guideShown,
  guideSkip,
  guideStep,
  guideTable,
  stepMet,
  type GuideFacts,
} from '../src/game/ext/progressive-ui/guide';
import { plotOfFront } from '../src/game/golf/range';
import { RAMP_TOAST, rampToast } from '../src/game/ext/progressive-ui';
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

describe("a range start's guide steps (P22 2.8, T095)", () => {
  /** a new range game's facts: the welcome seen (step 2), nothing built */
  const range = (over: Partial<GuideFacts> = {}): GuideFacts => facts({ start: 'range', step: 2, holes: 0, ...over });

  it('10. start range picks RANGE_GUIDE (7 steps, unique ids, n = index + 1); any other start keeps GUIDE', () => {
    assert.equal(guideTable({ start: 'range' }), RANGE_GUIDE);
    assert.equal(guideTable({ start: 'town' }), GUIDE);
    assert.equal(guideTable({}), GUIDE);
    assert.equal(RANGE_GUIDE.length, GUIDE_STEPS);
    assert.deepEqual(RANGE_GUIDE.map(g => g.n), [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(new Set(RANGE_GUIDE.map(g => g.id)).size, 7);
    for (const g of RANGE_GUIDE) assert.ok(g.title.length > 0 && g.body.length > 0 && !/^Step \d/.test(g.title), g.id);
    const s1 = guideStep(facts({ start: 'range' }));
    assert.equal(s1?.id, 'guide-range-welcome');
    assert.equal(guideNext(facts({ start: 'range' })), 2);
  });

  it('11. the triggers in order: hole 1 built, the clubhouse placed, holes >= 9, invited, runs >= 1, then the results (Next)', () => {
    assert.equal(guideStep(range())?.id, 'guide-range-hole');
    assert.equal(guideStep(range({ holes: 1 }))?.id, 'guide-range-clubhouse');
    assert.equal(guideStep(range({ holes: 1, clubhouse: true }))?.id, 'guide-range-nine');
    assert.equal(guideStep(range({ holes: 8, clubhouse: true }))?.id, 'guide-range-nine');
    assert.equal(guideStep(range({ holes: 9, clubhouse: true }))?.id, 'guide-range-invite');
    assert.equal(guideStep(range({ holes: 9, clubhouse: true, invited: true }))?.id, 'guide-range-tournament');
    const done = range({ holes: 9, clubhouse: true, invited: true, runs: 1 });
    assert.equal(guideStep(done)?.id, 'guide-range-results');
    assert.equal(guideNext(done), 8);
    assert.equal(guideStep({ ...done, step: 8 }), null);
  });

  it('12. each trigger is its own fact: stepMet reads only its step (pieces, roads, parks and structures, the old start triggers, do not count)', () => {
    assert.equal(stepMet(2, range({ kinds: { tee: 1, fairway: 1, green: 1 } })), false);
    assert.equal(stepMet(2, range({ holes: 1 })), true);
    assert.equal(stepMet(3, range({ structures: 3, parks: 2 })), false);
    assert.equal(stepMet(3, range({ clubhouse: true })), true);
    assert.equal(stepMet(4, range({ holes: 8 })), false);
    assert.equal(stepMet(4, range({ holes: 9 })), true);
    assert.equal(stepMet(5, range({ invited: false })), false);
    assert.equal(stepMet(5, range({ invited: true })), true);
    assert.equal(stepMet(6, range({ runs: 0 })), false);
    assert.equal(stepMet(6, range({ runs: 1 })), true);
    assert.equal(stepMet(1, range()), false);
    assert.equal(stepMet(7, range({ runs: 3 })), false);
  });

  it('13. a clubhouse placed before hole 1 holds step 2; with hole 1 the guide moves past both to Finish the nine', () => {
    assert.equal(guideStep(range({ clubhouse: true }))?.id, 'guide-range-hole');
    assert.equal(guideStep(range({ clubhouse: true, holes: 1 }))?.id, 'guide-range-nine');
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

  it('16. the invitation step holds INVITE_HOLD_S after the invitation came this session, then Play the tournament; an older one goes straight on', () => {
    const nine = range({ holes: 9, clubhouse: true, invited: true });
    assert.equal(guideStep({ ...nine, invitedAgoS: 0 })?.id, 'guide-range-invite');
    assert.equal(guideStep({ ...nine, invitedAgoS: INVITE_HOLD_S - 0.5 })?.id, 'guide-range-invite');
    assert.equal(guideStep({ ...nine, invitedAgoS: INVITE_HOLD_S })?.id, 'guide-range-tournament');
    assert.equal(guideStep(nine)?.id, 'guide-range-tournament');
    // not invited: the step stays whatever the clock says
    assert.equal(guideStep({ ...nine, invited: false, invitedAgoS: 99 })?.id, 'guide-range-invite');
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

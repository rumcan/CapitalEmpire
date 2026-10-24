// Headless tests for the guided Year 1 rules module (T045): npm test (bundled by esbuild, run by node --test; no DOM).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GUIDE,
  GUIDE_STEPS,
  LEGACY_HINT_STEP,
  guideNext,
  guideSkip,
  guideStep,
  stepMet,
  type GuideFacts,
} from '../src/game/ext/progressive-ui/guide';

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

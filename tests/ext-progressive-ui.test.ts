import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_3_TIME_SEC,
  computeProgressiveUiState,
  nextFirstRunHint,
  resolveOnboardingStage,
  type PlayerProgressFacts,
} from '../src/game/ext/progressive-ui';

const baseFacts: PlayerProgressFacts = {
  advancedMode: false,
  year: 1,
  elapsedSeconds: 30,
  playableHoles: 0,
  roadsBuilt: 0,
  carParksBuilt: 0,
  eventStructuresPlaced: 0,
};

describe('ext/progressive-ui (T032)', () => {
  it('starts new Year 1 players in Stage 1 with core starter tools and no fine-control clutter', () => {
    const st = computeProgressiveUiState(baseFacts);
    assert.equal(st.stage, 1);
    assert.deepEqual(st.visibleGroups, ['select', 'roads', 'course', 'transport']);
    assert.deepEqual(st.visibleTools, ['select', 'road', 'course', 'path', 'park']);
    assert.deepEqual(st.visibleCourseBrushes, ['tee', 'fairway', 'green']);
    assert.deepEqual(st.visibleFineControls, []);
    assert.equal(st.activeHint?.id, 'hint-build-first-hole');
  });

  it('unlocks Stage 2 (hazards, paint, bulldoze, event structures) once the first hole or road is built', () => {
    const st = computeProgressiveUiState({ ...baseFacts, playableHoles: 1 });
    assert.equal(st.stage, 2);
    assert.ok(st.visibleTools.includes('paint') && st.visibleTools.includes('bulldoze'));
    assert.ok(st.visibleCourseBrushes.includes('bunker') && st.visibleCourseBrushes.includes('path'));
    assert.ok(st.visibleGolfChips.includes('event'));
    assert.equal(st.activeHint?.id, 'hint-connect-road-and-park');
  });

  it('unlocks Stage 3 after first hole + car park + event gate or after 10 minutes elapsed', () => {
    const byActions = computeProgressiveUiState({
      ...baseFacts,
      playableHoles: 1,
      carParksBuilt: 1,
      eventStructuresPlaced: 1,
    });
    assert.equal(byActions.stage, 3);
    assert.ok(byActions.visibleTools.includes('junction') && byActions.visibleTools.includes('bus') && byActions.visibleTools.includes('toll'));
    assert.ok(byActions.visibleGolfChips.includes('land') && byActions.visibleGolfChips.includes('grass'));

    const byTime = resolveOnboardingStage({ ...baseFacts, elapsedSeconds: STAGE_3_TIME_SEC });
    assert.equal(byTime, 3);
  });

  it('exposes every tool and all fine controls immediately when advancedMode is toggled on', () => {
    const adv = computeProgressiveUiState({ ...baseFacts, advancedMode: true });
    assert.equal(adv.stage, 3);
    assert.equal(adv.visibleTools.length, 13);
    assert.equal(adv.visibleCourseBrushes.length, 7);
    assert.deepEqual(adv.visibleFineControls, [
      'snapToggle',
      'pieceAngle',
      'pieceScale',
      'heightBrush',
      'surfaceTone',
      'customStyle',
    ]);
  });

  it('steps through first-run hints and respects dismissedHints', () => {
    const h1 = nextFirstRunHint(baseFacts);
    assert.equal(h1?.id, 'hint-build-first-hole');

    const h2 = nextFirstRunHint({ ...baseFacts, playableHoles: 1 });
    assert.equal(h2?.id, 'hint-connect-road-and-park');

    const h3 = nextFirstRunHint({ ...baseFacts, playableHoles: 1, carParksBuilt: 1 });
    assert.equal(h3?.id, 'hint-place-gate-and-tents');

    const none = nextFirstRunHint({
      ...baseFacts,
      playableHoles: 1,
      carParksBuilt: 1,
      eventStructuresPlaced: 1,
      dismissedHints: ['hint-traffic-and-advanced'],
    });
    assert.equal(none, null);
  });
});

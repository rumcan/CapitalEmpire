// Headless tests for the progressive unlocks (T032; unlocks from the course, plan P23 4.2, T117): npm test (bundled by esbuild, run by node --test).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHIP_STAGE,
  FIRST_RUN_HINTS,
  GROUP_STAGE,
  GUIDE_STUCK,
  STUCK_HINT,
  STUCK_PLAY_SEC,
  JAM_HINT,
  TOOL_GROUP,
  TOOL_STAGE,
  computeProgressiveUiState,
  courseStage,
  guideShown,
  nextFirstRunHint,
  resolveOnboardingStage,
  stepMet,
  type GuideFacts,
  type OnboardingStage,
  type PlayerProgressFacts,
} from '../src/game/ext/progressive-ui';

/** a new range game's facts: no hole, no season, not invited, half a minute of play */
const base: PlayerProgressFacts = {
  advancedMode: false,
  playableHoles: 0,
  seasonsDone: 0,
  invited: false,
  elapsedSeconds: 30,
  roadsBuilt: 0,
  carParksBuilt: 0,
  eventStructuresPlaced: 0,
};
const f = (over: Partial<PlayerProgressFacts> = {}): PlayerProgressFacts => ({ ...base, ...over });

/** every golf rail group and tool (the Business tool is the town's: golf games never list it) */
const GOLF_GROUPS = ['select', 'course', 'roads', 'junction', 'transport', 'paint', 'bulldoze'];
const GOLF_TOOLS = ['select', 'course', 'path', 'buildings', 'props', 'greenkeeping', 'practice', 'road', 'lane', 'downgrade', 'junction', 'bus', 'park', 'toll', 'paint', 'bulldoze'];
const SHAPE_BY_HAND = ['fairway', 'green', 'tee', 'rough', 'bunker', 'water'];

describe('the stage table (P23 4.2, T117): every "when" row', () => {
  const rows: [string, Partial<PlayerProgressFacts>, OnboardingStage][] = [
    ['a new range game', {}, 1],
    ['a hole with par 0 (no tee or pin) is not a hole', { playableHoles: 0, roadsBuilt: 3 }, 1],
    ['a hole with a par', { playableHoles: 1 }, 2],
    ['two holes', { playableHoles: 2 }, 2],
    ['one founding season with no hole (the stuck fallback)', { seasonsDone: 1 }, 2],
    ['20 minutes of play with no hole (the stuck fallback)', { elapsedSeconds: STUCK_PLAY_SEC }, 2],
    ['19 minutes 59 of play with no hole', { elapsedSeconds: STUCK_PLAY_SEC - 1 }, 1],
    ['a hole and one season', { playableHoles: 1, seasonsDone: 1 }, 2],
    ["the tour's invitation", { playableHoles: 2, invited: true }, 3],
    ['3 holes', { playableHoles: 3 }, 3],
    ['two seasons including founding ones, no hole', { seasonsDone: 2 }, 3],
    ['the stage reached before (2) never falls', { stageReached: 2 }, 2],
    ['the stage reached before (3) never falls', { stageReached: 3, playableHoles: 1 }, 3],
  ];
  for (const [name, over, stage] of rows) {
    it(`${name} -> stage ${stage}`, () => {
      assert.equal(resolveOnboardingStage(f(over)), stage);
      assert.equal(computeProgressiveUiState(f(over)).stage, stage);
    });
  }

  it('the 10-minute rule is gone, and time alone never reaches stage 3', () => {
    assert.equal(resolveOnboardingStage(f({ elapsedSeconds: 600 })), 1);
    assert.equal(resolveOnboardingStage(f({ elapsedSeconds: 10 * 3600 })), 2);
    assert.equal(resolveOnboardingStage(f({ elapsedSeconds: 10 * 3600, playableHoles: 2 })), 2);
  });

  it('no stroke counts: roads, car parks and event structures built unlock nothing', () => {
    assert.equal(resolveOnboardingStage(f({ roadsBuilt: 50, carParksBuilt: 10, eventStructuresPlaced: 10 })), 1);
  });

  it('courseStage reads the course alone; resolveOnboardingStage keeps the stage reached', () => {
    assert.equal(courseStage(f({ stageReached: 3 })), 1);
    assert.equal(resolveOnboardingStage(f({ stageReached: 3 })), 3);
  });
});

describe('the stage table (P23 4.2, T117): every "open" row', () => {
  it('stage 1: Select, Holes (New hole only), Paths (walking, dirt, gravel drive), Buildings, Practice, Bulldoze; the rest locked in place', () => {
    const s = computeProgressiveUiState(f());
    assert.deepEqual(s.visibleGroups, ['select', 'course', 'bulldoze']);
    assert.deepEqual(s.visibleTools, ['select', 'course', 'path', 'buildings', 'props', 'practice', 'bulldoze']);
    assert.deepEqual(s.visibleCourseBrushes, []);
    assert.equal(s.shapeByHand, false);
    assert.deepEqual(s.lockedCourseClasses.map(c => c.id), ['cart-slab']);
    assert.deepEqual(s.visibleGolfChips, ['courseStats']);
    assert.deepEqual(s.visibleFineControls, []);
    assert.deepEqual(s.lockedGroups, [
      { id: 'roads', stage: 3, why: "Unlocks with your third hole or the tour's invitation" },
      { id: 'junction', stage: 3, why: "Unlocks with your third hole or the tour's invitation" },
      { id: 'transport', stage: 3, why: "Unlocks with your third hole or the tour's invitation" },
      { id: 'paint', stage: 2, why: 'Unlocks with your first hole' },
    ]);
    assert.deepEqual(s.lockedTools.find(t => t.id === 'paint'), { id: 'paint', stage: 2, why: 'Unlocks with your first hole' });
    assert.equal(s.stageLabel, 'Stage 1: Your first hole');
  });

  it('stage 2: Shape by hand (six surfaces), Paint, the cement slab path and the rest of the options open; the town tools stay locked', () => {
    const s = computeProgressiveUiState(f({ playableHoles: 1 }));
    assert.deepEqual(s.visibleGroups, ['select', 'course', 'paint', 'bulldoze']);
    assert.ok(s.visibleTools.includes('paint'));
    assert.deepEqual([...s.visibleCourseBrushes].sort(), [...SHAPE_BY_HAND].sort());
    assert.equal(s.shapeByHand, true);
    assert.deepEqual(s.lockedCourseClasses, []);
    assert.deepEqual(s.visibleGolfChips, ['courseStats', 'skipTournament', 'grass']);
    assert.deepEqual(s.lockedGroups.map(g => g.id), ['roads', 'junction', 'transport']);
    assert.deepEqual(s.lockedTools.map(t => t.id), ['road', 'lane', 'downgrade', 'junction', 'bus', 'park', 'toll']);
    assert.ok(s.lockedTools.every(t => t.stage === 3));
    assert.equal(s.stageLabel, 'Stage 2: Founding the club');
  });

  it('stage 3: Roads, Junctions, Transport, the Event catalogue and Land open; nothing is locked', () => {
    const s = computeProgressiveUiState(f({ playableHoles: 3 }));
    assert.deepEqual(s.visibleGroups, GOLF_GROUPS);
    assert.deepEqual(s.visibleTools, GOLF_TOOLS);
    assert.deepEqual(s.lockedGroups, []);
    assert.deepEqual(s.lockedTools, []);
    assert.ok(s.visibleGolfChips.includes('event') && s.visibleGolfChips.includes('land') && s.visibleGolfChips.includes('holes'));
    assert.deepEqual(s.visibleCourseBrushes.length, 7);
    assert.equal(s.stageLabel, 'Stage 3: The town');
  });

  it('every stage lists each golf group and tool once, visible or locked, never the Business tool', () => {
    for (const over of [{}, { playableHoles: 1 }, { playableHoles: 3 }, { advancedMode: true }]) {
      const s = computeProgressiveUiState(f(over));
      assert.deepEqual([...s.visibleGroups, ...s.lockedGroups.map(g => g.id)].sort(), [...GOLF_GROUPS].sort());
      assert.deepEqual([...s.visibleTools, ...s.lockedTools.map(t => t.id)].sort(), [...GOLF_TOOLS].sort());
      assert.ok(!(s.visibleGroups as string[]).includes('business') && !(s.visibleTools as string[]).includes('business'));
    }
    // and every tool opens no later than its rail group
    for (const [t, s] of Object.entries(TOOL_STAGE)) assert.ok(s! >= GROUP_STAGE[TOOL_GROUP[t as keyof typeof TOOL_GROUP]!]!, t);
  });

  it('Settings > Show every tool now: every tool and fine control, nothing locked, no NEW badge; the stage stays the course\'s', () => {
    const s = computeProgressiveUiState(f({ advancedMode: true }));
    assert.equal(s.stage, 1);
    assert.deepEqual(s.visibleTools, GOLF_TOOLS);
    assert.deepEqual(s.lockedTools, []);
    assert.deepEqual(s.lockedCourseClasses, []);
    assert.equal(s.shapeByHand, true);
    assert.equal(s.visibleCourseBrushes.length, 7);
    assert.equal(s.visibleGolfChips.length, Object.keys(CHIP_STAGE).length);
    assert.deepEqual(s.visibleFineControls, ['snapToggle', 'pieceAngle', 'pieceScale', 'heightBrush', 'surfaceTone', 'customStyle']);
    assert.deepEqual(s.newGroups, []);
    assert.deepEqual(s.newTools, []);
    assert.equal(s.stageLabel, 'Every tool shown (Settings)');
  });
});

describe('NEW badges (T117)', () => {
  it('stage 1 has none: its tools are there from the start', () => {
    const s = computeProgressiveUiState(f());
    assert.deepEqual(s.newGroups, []);
    assert.deepEqual(s.newTools, []);
  });

  it('a tool opened past stage 1 carries NEW until its id is seen', () => {
    const s2 = computeProgressiveUiState(f({ playableHoles: 1 }));
    assert.deepEqual(s2.newGroups, ['paint']);
    // Greenkeeping (T175) opens with the first grown hole (a game that does not say counts its holes grown) and is NEW until opened
    assert.deepEqual(s2.newTools, ['greenkeeping', 'paint']);
    assert.deepEqual(computeProgressiveUiState(f({ playableHoles: 1, seen: ['paint', 'greenkeeping'] })).newTools, []);
    const s3 = computeProgressiveUiState(f({ playableHoles: 3, seen: ['paint', 'road', 'roads', 'greenkeeping'] }));
    assert.deepEqual(s3.newGroups, ['junction', 'transport']);
    assert.deepEqual(s3.newTools, ['lane', 'downgrade', 'junction', 'bus', 'park', 'toll']);
  });
});

describe('first-run hints and the stuck player (T117)', () => {
  it('a new game shows Step 1 (New hole)', () => {
    assert.equal(nextFirstRunHint(f())?.id, 'hint-build-first-hole');
  });

  it('a founding-season player with no hole reaches stage 2 and is offered New hole, even with Step 1 dismissed', () => {
    const stuck = f({ seasonsDone: 1, dismissedHints: ['hint-build-first-hole'] });
    const s = computeProgressiveUiState(stuck);
    assert.equal(s.stage, 2);
    assert.equal(s.shapeByHand, true);
    assert.equal(s.activeHint?.id, STUCK_HINT.id);
    assert.equal(STUCK_HINT.targetTool, 'course');
    assert.equal(nextFirstRunHint(f({ elapsedSeconds: STUCK_PLAY_SEC }))?.id, STUCK_HINT.id);
    // dismissed, the hint goes; with a hole the player is no longer stuck
    assert.equal(nextFirstRunHint({ ...stuck, dismissedHints: ['hint-build-first-hole', STUCK_HINT.id] }), null);
    assert.notEqual(nextFirstRunHint(f({ seasonsDone: 1, playableHoles: 1 }))?.id, STUCK_HINT.id);
  });

  it('a jammed town (T178) shows the jam hint, pointing at the Junction tool (T184), once it is open; Got it dismisses it', () => {
    assert.equal(nextFirstRunHint(f({ playableHoles: 3, townJammed: true }))?.id, JAM_HINT.id);
    assert.equal(JAM_HINT.targetTool, 'junction', 'the Junction tool first (T184)');
    assert.ok(JAM_HINT.body.indexOf('Junctions') < JAM_HINT.body.indexOf('Roads: Upgrade'), 'junction tools before road upgrades');
    assert.notEqual(nextFirstRunHint(f({ playableHoles: 1, townJammed: true }))?.id, JAM_HINT.id, 'Junctions still locked at stage 2');
    assert.equal(nextFirstRunHint(f({ playableHoles: 1, townJammed: true, advancedMode: true }))?.id, JAM_HINT.id, 'every tool shown');
    assert.notEqual(nextFirstRunHint(f({ playableHoles: 3, townJammed: true, dismissedHints: [JAM_HINT.id] }))?.id, JAM_HINT.id);
    assert.equal(nextFirstRunHint(f({ playableHoles: 3 }))?.id, 'hint-connect-road-and-park', 'no jam, no hint');
  });

  it('no hint points at a locked tool: stage 2 has none after the first hole, stage 3 walks the town tools', () => {
    assert.equal(nextFirstRunHint(f({ playableHoles: 1 })), null);
    assert.equal(nextFirstRunHint(f({ playableHoles: 3 }))?.id, 'hint-connect-road-and-park');
    assert.equal(nextFirstRunHint(f({ playableHoles: 3, carParksBuilt: 1 }))?.id, 'hint-place-gate-and-tents');
    assert.equal(nextFirstRunHint(f({ playableHoles: 3, carParksBuilt: 1, eventStructuresPlaced: 1 }))?.id, 'hint-traffic-and-advanced');
    assert.equal(nextFirstRunHint(f({ playableHoles: 3, carParksBuilt: 1, eventStructuresPlaced: 1, dismissedHints: ['hint-traffic-and-advanced'] })), null);
    for (const h of [...FIRST_RUN_HINTS, STUCK_HINT]) {
      const s = computeProgressiveUiState(f({ stageReached: h.stage }));
      assert.ok((s.visibleTools as string[]).includes(h.targetTool) || (s.visibleGolfChips as string[]).includes(h.targetTool), h.id);
    }
  });
});

describe('the guide offers New hole to a stuck player (T117)', () => {
  const g = (over: Partial<GuideFacts> = {}): GuideFacts => ({ pieces: 0, roads: 0, parks: 0, structures: 0, kinds: {}, runs: 0, tutorial: 'off', step: 8, ...over });

  it('a hole with a par meets step 2 (New hole builds no pieces)', () => {
    assert.equal(stepMet(2, g({ holes: 1 })), true);
    assert.equal(stepMet(2, g()), false);
  });

  it('with the guide off, no hole after one season or 20 minutes brings back New hole; a hole, or neither mark, does not', () => {
    assert.equal(guideShown(g({ seasons: 1 }))?.id, GUIDE_STUCK.id);
    assert.equal(guideShown(g({ playS: STUCK_PLAY_SEC }))?.id, GUIDE_STUCK.id);
    assert.deepEqual(GUIDE_STUCK.target, { ui: 'new-hole', map: 'newHoleSpot' }); // T188: the New hole button's anchor (it falls back to the Course group's)
    assert.equal(guideShown(g()), null);
    assert.equal(guideShown(g({ seasons: 1, holes: 1 })), null);
    // while the guide runs, it shows its own step
    assert.equal(guideShown(g({ tutorial: 'on', step: 1, seasons: 1 }))?.id, 'guide-welcome');
  });
});

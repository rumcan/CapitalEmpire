// Headless tests for the player's progress counters (T033) that feed the progressive tool unlocks (T032): npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeProgressiveUiState, emptyProgress, normalizeProgress, progressFacts, STAGE_3_TIME_SEC, type GolfProgress } from '../src/game/ext/progressive-ui';
import { PaintTool } from '../src/game/paint-tool';

/** a progress record with the given counts (the rest nothing done) */
function prog(over: Partial<GolfProgress>): GolfProgress { return { ...emptyProgress(), ...over }; }

describe('player progress (T033)', () => {
  it('a new game shows Stage 1 with the first-hole hint', () => {
    const ui = computeProgressiveUiState(progressFacts(emptyProgress(), 0));
    assert.equal(ui.stage, 1);
    assert.equal(ui.activeHint?.id, 'hint-build-first-hole');
  });

  it('a missing (pre-T033) progress counts as an experienced player; a partial object is not legacy', () => {
    assert.equal(normalizeProgress(undefined).playS, STAGE_3_TIME_SEC);
    assert.equal(computeProgressiveUiState(progressFacts(normalizeProgress(undefined), 0)).stage, 3);
    assert.equal(normalizeProgress(null).playS, STAGE_3_TIME_SEC);
    const bad = normalizeProgress({ pieces: -1 as any, roads: NaN as any, dismissed: [1, 'x'] as any });
    assert.equal(bad.pieces, 0); assert.equal(bad.roads, 0); assert.deepEqual(bad.dismissed, ['x']); assert.equal(bad.playS, 0);
  });

  it('a playable hole is every 3 pieces: 3 pieces Stage 2, 9 pieces Stage 3, 60 pieces capped at 18 holes', () => {
    const f3 = progressFacts(prog({ pieces: 3 }), 0);
    assert.equal(f3.playableHoles, 1);
    assert.equal(computeProgressiveUiState(f3).stage, 2);
    assert.equal(computeProgressiveUiState(progressFacts(prog({ pieces: 9 }), 0)).stage, 3);
    assert.equal(progressFacts(prog({ pieces: 60 }), 0).playableHoles, 18);
  });

  it('a second year (one tournament run) is Stage 3; Advanced is Stage 3 with every fine control', () => {
    const y2 = progressFacts(emptyProgress(), 1);
    assert.equal(y2.year, 2);
    assert.equal(computeProgressiveUiState(y2).stage, 3);
    const adv = computeProgressiveUiState(progressFacts(prog({ advanced: true }), 0));
    assert.equal(adv.stage, 3);
    assert.equal(adv.visibleFineControls.length, 6);
  });

  it('PaintTool reports one piece per placed piece, and nothing for a refused placement', () => {
    let n = 0;
    const toasts: string[] = [];
    const host = (money: number) => ({ setLotGround() {}, emit() {}, save() {}, toast: (t: string) => { toasts.push(t); }, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
      golfMode: () => true, money: () => money, spend() {}, progress: () => { n++; } });
    const ok = new PaintTool(host(1e9));
    ok.enterCourse();
    ok.setPiece('green-kidney');
    ok.pointerMove({ x: 100, y: 100 }, 0, 0);
    ok.pointerDown({ x: 100, y: 100 }, 0, 0);
    assert.equal(ok.areas.length > 0, true);
    assert.equal(n, 1);
    n = 0;
    const broke = new PaintTool(host(0));
    broke.enterCourse();
    broke.setPiece('green-kidney');
    broke.pointerMove({ x: 100, y: 100 }, 0, 0);
    broke.pointerDown({ x: 100, y: 100 }, 0, 0);
    assert.equal(broke.areas.length, 0);
    assert.equal(toasts.length > 0, true);
    assert.equal(n, 0);
  });
});

/** the rail group ids of App.tsx GROUPS (T033b): mirrored here, the headless test cannot read App.tsx */
const APP_GROUP_IDS = ['select', 'roads', 'paint', 'course', 'junction', 'bulldoze', 'transport', 'business'];
/** every Tool id in src/game/types.ts */
const TOOL_IDS = ['select', 'road', 'junction', 'bulldoze', 'park', 'toll', 'bus', 'lane', 'downgrade', 'business', 'paint', 'course', 'path'];

describe('progressive tool unlocks (T033b)', () => {
  it('stage 1 hides Junctions and Bus routes; stage 3 shows every tool', () => {
    const s1 = computeProgressiveUiState(progressFacts(prog({}), 0));
    assert.equal(s1.stage, 1);
    assert.ok(!(s1.visibleTools as string[]).includes('junction'));
    assert.ok(!(s1.visibleTools as string[]).includes('bus'));
    const s3 = computeProgressiveUiState(progressFacts(prog({ pieces: 9 }), 0));
    assert.equal(s3.stage, 3);
    for (const id of TOOL_IDS) assert.ok((s3.visibleTools as string[]).includes(id), id);
  });

  it('stage 1 rail shows Select, Roads, Course and Transport; every stage lists only known tools and rail groups', () => {
    const s1 = computeProgressiveUiState(progressFacts(prog({}), 0));
    assert.deepEqual(s1.visibleGroups, ['select', 'roads', 'course', 'transport']);
    for (const p of [prog({}), prog({ pieces: 3 }), prog({ pieces: 9 })]) {
      const ui = computeProgressiveUiState(progressFacts(p, 0));
      for (const t of ui.visibleTools) assert.ok(TOOL_IDS.includes(t), t);
      for (const g of ui.visibleGroups) assert.ok(APP_GROUP_IDS.includes(g), g);
    }
  });
});

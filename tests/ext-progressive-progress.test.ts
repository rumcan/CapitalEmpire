// Headless tests for the player's saved progress (T033; the stage reached and the NEW badges' seen ids since T117) that feeds the progressive tool
// unlocks (T032): npm test (bundled by esbuild, run by node --test; no DOM, no canvas).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NEW_BADGE_IDS, advanceProgress, computeProgressiveUiState, emptyProgress, normalizeProgress, progressFacts, type CourseProgress, type GolfProgress } from '../src/game/ext/progressive-ui';
import { PaintTool } from '../src/game/paint-tool';

/** a progress record with the given fields (the rest nothing done) */
function prog(over: Partial<GolfProgress>): GolfProgress { return { ...emptyProgress(), ...over }; }
/** a course with the given holes with a par, seasons played and invitation (default: a new range start) */
function course(over: Partial<CourseProgress> = {}): CourseProgress { return { holes: 0, seasons: 0, invited: false, ...over }; }
/** the unlocks a progress record and a course show */
const ui = (p: GolfProgress, c: CourseProgress = course()) => computeProgressiveUiState(progressFacts(p, c));

describe('player progress (T033, T117)', () => {
  it('a new game is stage 1 with nothing seen and the first-hole hint', () => {
    const p = emptyProgress();
    assert.equal(p.stage, 1);
    assert.deepEqual(p.seen, []);
    const s = ui(p);
    assert.equal(s.stage, 1);
    assert.equal(s.activeHint?.id, 'hint-build-first-hole');
  });

  it('old saves keep every tool: a missing progress or one saved before T117 opens at stage 3 with every NEW badge seen', () => {
    for (const old of [undefined, null, { pieces: 4, roads: 2, parks: 1, structures: 1, playS: 600, dismissed: ['hint-build-first-hole'], advanced: false },
      // a brand-new game saved under the old rules (old stage 1 had Roads and the car park, which now wait for stage 3)
      { pieces: 0, roads: 0, parks: 0, structures: 0, playS: 30, dismissed: [], advanced: false }]) {
      const p = normalizeProgress(old as Partial<GolfProgress> | null | undefined);
      assert.equal(p.stage, 3);
      assert.deepEqual(p.seen, NEW_BADGE_IDS.slice());
      const s = ui(p);
      assert.deepEqual(s.lockedTools, []);
      assert.deepEqual(s.lockedGroups, []);
      assert.deepEqual(s.newTools, []);
      assert.deepEqual(s.newGroups, []);
      for (const t of ['select', 'road', 'lane', 'downgrade', 'paint', 'course', 'path', 'junction', 'bulldoze', 'bus', 'park', 'toll']) assert.ok((s.visibleTools as string[]).includes(t), t);
    }
    const kept = normalizeProgress({ pieces: 4, roads: 2, parks: 1, structures: 1, playS: 600, dismissed: ['x', 1 as unknown as string], advanced: true });
    assert.deepEqual([kept.pieces, kept.roads, kept.parks, kept.structures, kept.playS, kept.advanced], [4, 2, 1, 1, 600, true]);
    assert.deepEqual(kept.dismissed, ['x']);
  });

  it('a T117 save keeps its stage and seen ids; bad values are cleaned', () => {
    const p = normalizeProgress({ ...emptyProgress(), stage: 2, seen: ['paint', 7 as unknown as string] });
    assert.equal(p.stage, 2);
    assert.deepEqual(p.seen, ['paint']);
    assert.equal(normalizeProgress({ ...emptyProgress(), stage: 9 as 3 }).stage, 3);
    assert.equal(normalizeProgress({ ...emptyProgress(), stage: -1 as 1 }).stage, 1);
    const bad = normalizeProgress({ stage: 1, pieces: -1, roads: NaN, dismissed: [1, 'x'] as unknown as string[] });
    assert.equal(bad.pieces, 0); assert.equal(bad.roads, 0); assert.deepEqual(bad.dismissed, ['x']); assert.equal(bad.playS, 0);
  });

  it('the unlocks read the course, not the pieces placed: 60 pieces and no hole is stage 1, one hole with a par is stage 2', () => {
    const f = progressFacts(prog({ pieces: 60 }), course());
    assert.equal(f.playableHoles, 0);
    assert.equal(computeProgressiveUiState(f).stage, 1);
    assert.equal(ui(emptyProgress(), course({ holes: 1 })).stage, 2);
    assert.equal(ui(emptyProgress(), course({ holes: 3 })).stage, 3);
    assert.equal(ui(emptyProgress(), course({ holes: 2, invited: true })).stage, 3);
    assert.equal(ui(emptyProgress(), course({ seasons: 2 })).stage, 3);
  });

  it('a founding-season player with no hole reaches stage 2 by the fallback, and the save keeps it', () => {
    const p = emptyProgress(), c = course({ seasons: 1 }), f = progressFacts(p, c);
    assert.equal(computeProgressiveUiState(f).stage, 2);
    assert.equal(computeProgressiveUiState(f).activeHint?.id, 'hint-stuck-new-hole');
    assert.equal(advanceProgress(p, f, 'course'), true);
    assert.equal(p.stage, 2);
    assert.equal(advanceProgress(p, progressFacts(p, c), 'course'), false, 'nothing more to save');
  });

  it('the stage reached never falls: a hole built then bulldozed keeps stage 2', () => {
    const p = emptyProgress();
    advanceProgress(p, progressFacts(p, course({ holes: 1 })), 'course');
    assert.equal(p.stage, 2);
    assert.equal(ui(p, course({ holes: 0 })).stage, 2);
  });

  it('opening a tool marks it and its rail group seen once it is open; a locked or stage-1 tool adds nothing', () => {
    const p = emptyProgress();
    assert.equal(advanceProgress(p, progressFacts(p, course()), 'paint'), false, 'Paint is locked at stage 1');
    assert.deepEqual(p.seen, []);
    assert.equal(advanceProgress(p, progressFacts(p, course()), 'course'), false, 'Holes never carries NEW');
    const c3 = course({ holes: 3 });
    assert.equal(advanceProgress(p, progressFacts(p, c3), 'road'), true);
    assert.equal(p.stage, 3);
    assert.deepEqual(p.seen, ['road', 'roads']);
    assert.ok(!ui(p, c3).newGroups.includes('roads'));
    assert.ok(ui(p, c3).newTools.includes('lane'));
    assert.equal(advanceProgress(p, progressFacts(p, c3), 'road'), false);
    // with every tool shown, a tool opened early counts as seen
    const q = prog({ advanced: true });
    assert.equal(advanceProgress(q, progressFacts(q, course()), 'junction'), true);
    assert.deepEqual(q.seen, ['junction']);
    assert.equal(q.stage, 1);
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
/** every Tool id in src/game/types.ts, and the Course tool's Buildings tab (a rail item from P23 P1-E) */
const TOOL_IDS = ['select', 'road', 'junction', 'bulldoze', 'park', 'toll', 'bus', 'lane', 'downgrade', 'business', 'paint', 'course', 'path', 'buildings', 'props', 'greenkeeping'];

describe('progressive tool unlocks (T033b, T117)', () => {
  it('every stage lists only known tools and rail groups', () => {
    for (const c of [course(), course({ holes: 1 }), course({ holes: 3 })]) {
      const s = ui(emptyProgress(), c);
      for (const t of [...s.visibleTools, ...s.lockedTools.map(x => x.id)]) assert.ok(TOOL_IDS.includes(t), t);
      for (const g of [...s.visibleGroups, ...s.lockedGroups.map(x => x.id)]) assert.ok(APP_GROUP_IDS.includes(g), g);
    }
  });
});

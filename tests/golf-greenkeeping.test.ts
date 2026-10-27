// Greenkeeping on the rail and the clubhouse's "Draw a drive" stopgap (plan P23-UX 6.2 P2-5 and P2-9, T175): Greenkeeping's unlock (the
// first grown hole, with its why in the ramp's words), its place on the rail, the care's names, and the stopgap's rules (the refusal a drive
// mends, where the drive starts, and the clubhouse back armed at the same spot once a drive is built).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeProgressiveUiState, greenkeepingLock, type PlayerProgressFacts } from '../src/game/ext/progressive-ui';
import { RAIL, railEntries } from '../src/ui/rail-items';
import { GRASS_COST } from '../src/game/ext/grass-management';
import { GRASS_ACTION_NAME } from '../src/ui/GrassManagementPanel';
import { afterRoute, driveOffer, driveStart, wantsDrive } from '../src/game/golf/drivestopgap';
import { clubhouseSpotWhy } from '../src/game/golf/range';

/** a golf game's facts: one hole with a par, still growing */
const f = (over: Partial<PlayerProgressFacts> = {}): PlayerProgressFacts => ({ advancedMode: false, playableHoles: 1, seasonsDone: 0, invited: false, elapsedSeconds: 600, stageReached: 2, seen: [], roadsBuilt: 0, carParksBuilt: 0, eventStructuresPlaced: 0, grownHoles: 0, firstReady: 'hole 1 ready Mar 1985', ...over });

test('Greenkeeping opens with the first grown hole: locked in place with its why (and when) until then, NEW once open, open with every tool shown', () => {
  assert.equal(greenkeepingLock(f()), 'Unlocks when your first hole is grown in (hole 1 ready Mar 1985)');
  const locked = computeProgressiveUiState(f());
  assert.ok(!locked.visibleTools.includes('greenkeeping'));
  assert.deepEqual(locked.lockedTools.find(t => t.id === 'greenkeeping'), { id: 'greenkeeping', stage: 1, why: 'Unlocks when your first hole is grown in (hole 1 ready Mar 1985)' });
  assert.equal(greenkeepingLock(f({ firstReady: undefined })), 'Unlocks when your first hole is grown in');
  const open = computeProgressiveUiState(f({ grownHoles: 1 }));
  assert.ok(open.visibleTools.includes('greenkeeping') && !open.lockedTools.some(t => t.id === 'greenkeeping'));
  assert.ok(open.newTools.includes('greenkeeping'), 'NEW until first opened');
  assert.ok(!computeProgressiveUiState(f({ grownHoles: 1, seen: ['greenkeeping'] })).newTools.includes('greenkeeping'));
  assert.equal(greenkeepingLock(f({ grownHoles: 0, seen: ['greenkeeping'] })), null, 'once opened it never closes again (a hole deleted, or an old save that sees every tool)');
  assert.equal(greenkeepingLock(f({ advancedMode: true })), null, 'Show every tool now opens it');
  // a game that does not say how many holes are grown in keeps it open once it has a hole (an old course is grown in)
  assert.equal(greenkeepingLock(f({ grownHoles: undefined, firstReady: undefined })), null);
  assert.ok(greenkeepingLock(f({ grownHoles: undefined, playableHoles: 0 })));
});

test('on the rail: under COURSE after Props, golf games only; the rail draws it locked with its why, then open', () => {
  const i = RAIL.findIndex(r => r.id === 'greenkeeping'), props = RAIL.findIndex(r => r.id === 'props');
  assert.equal(i, props + 1);
  assert.equal(RAIL[i]!.section, 'course'); assert.equal(RAIL[i]!.only, 'golf'); assert.equal(RAIL[i]!.tools[0]!.id, 'greenkeeping');
  const lockedRow = railEntries(computeProgressiveUiState(f()), true, 'select').find(e => e.item.id === 'greenkeeping')!;
  assert.match(lockedRow.locked ?? '', /^Unlocks when your first hole is grown in/);
  const openRow = railEntries(computeProgressiveUiState(f({ grownHoles: 2 })), true, 'greenkeeping').find(e => e.item.id === 'greenkeeping')!;
  assert.equal(openRow.locked, null); assert.equal(openRow.on, true);
  assert.equal(railEntries(null, false, 'select').some(e => e.item.id === 'greenkeeping'), false, 'not in the classic game (its Grass panel stays)');
});

test("the care keeps its actions and takes the plan's names: Overseed for seed, Re-turf for sod", () => {
  assert.deepEqual(Object.keys(GRASS_ACTION_NAME).sort(), Object.keys(GRASS_COST).sort(), 'every action named, none added');
  assert.equal(GRASS_ACTION_NAME.seed, 'Overseed'); assert.equal(GRASS_ACTION_NAME.sod, 'Re-turf');
  assert.equal(GRASS_ACTION_NAME.mow, 'Mow');
});

test('the stopgap: only the refusal a drive mends offers one; the drive starts at the nearest road; a built drive brings the clubhouse back at the same spot', () => {
  // the game's own refusal for want of a drive (golf/range.ts), and the others that a drive does not mend
  const ctx = { clubs: 0, owned: () => true, plot: null, course: () => false };
  const noDrive = clubhouseSpotWhy([100, 100, 20, 12], { ...ctx, roadGap: 40 });
  assert.ok(wantsDrive(noDrive), noDrive);
  for (const why of [clubhouseSpotWhy([100, 100, 20, 12], { ...ctx, roadGap: -1 }), clubhouseSpotWhy([100, 100, 20, 12], { ...ctx, clubs: 1, roadGap: 40 }), 'Off your land: place it on your parcel']) {
    assert.equal(wantsDrive(why), false, why);
    assert.equal(driveOffer(why, [100, 100, 20, 12], { x: 110, y: 106 }), null);
  }
  const offer = driveOffer(noDrive, [100, 100, 20, 12], { x: 110, y: 106 });
  assert.deepEqual(offer, { at: [100, 100, 20, 12], spot: { x: 110, y: 106 } });
  // the nearest road or drive, never a cart path; none within reach
  const segs = [
    { a: { x: 0, y: 150 }, b: { x: 300, y: 150 }, base: 'road' },
    { a: { x: 110, y: 120 }, b: { x: 130, y: 120 }, family: 'course', base: 'cart-slab' },
    { a: { x: 80, y: 90 }, b: { x: 80, y: 130 }, family: 'course', base: 'drive-gravel' },
  ];
  const r = (p: { x: number; y: number } | null) => p && { x: Math.round(p.x), y: Math.round(p.y) };
  assert.deepEqual(r(driveStart(segs, { x: 110, y: 106 })), { x: 80, y: 106 }, 'the drive 30 tiles away, not the cart path 14 away (a cart path is no drive) nor the road 44 away');
  assert.deepEqual(r(driveStart(segs.slice(0, 2), { x: 110, y: 106 })), { x: 110, y: 150 }, 'without the drive: the road');
  assert.equal(driveStart(segs.slice(0, 2), { x: 110, y: 106 }, 20), null, 'nothing within reach');
  // a built route: a drive brings the offer back (the same rect and spot); a cart path or a town road leaves it waiting
  assert.deepEqual(afterRoute(offer, { family: 'course', base: 'drive-gravel' }), offer);
  assert.deepEqual(afterRoute(offer, { family: 'course', base: 'drive' })?.spot, { x: 110, y: 106 });
  assert.equal(afterRoute(offer, { family: 'course', base: 'cart-slab' }), null);
  assert.equal(afterRoute(offer, { base: 'street' }), null);
  assert.equal(afterRoute(null, { family: 'course', base: 'drive-gravel' }), null, 'no stopgap in flight: nothing comes back');
});

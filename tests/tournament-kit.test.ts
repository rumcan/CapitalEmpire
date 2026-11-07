// The tournament kit (2026-11-07): the ten event roles in budget and upgraded condition, the 60-seat bleacher, the practice net and bag
// trolley and the twelve course props, imported as reviewed eight-view sets (art/tournament-kit-20261107). Headless.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OBJECT_EIGHT_SETS } from '../src/game/object-eight-library';
import { eventArtSet } from '../src/game/object-eight-core';
import { OBJECT_FACING_KEYS } from '../src/game/object-eight-types';
import { objectFacings } from '../src/game/object-eight';
import { facilityArtReadiness } from '../src/game/golf/facility-art';
import { hasUpgradedArt } from '../src/game/golf/facility-models';
import { structurePicture } from '../src/game/golf/structure-facing';
import { DECOR } from '../src/game/golf/decor';
import { LIBRARY } from '../src/game/library';

const LIB = new Set(LIBRARY.map(i => i.id));
const ROLES = ['foodTruck', 'tvTower', 'broadcast', 'firstAid', 'info', 'gate', 'media', 'holeBoard', 'leaderboard', 'kiosk', 'compactBleacher60'];
const PROPS = ['ball-washer', 'ball-bucket-stand', 'ball-dispenser', 'park-bench', 'water-tank-stall', 'rope-barrier', 'rope-barrier-corner', 'rope-walkway', 'direction-signpost', 'gold-tee-markers', 'hole-12-sign', 'course-map-board'];

test('every event role has a budget and an upgraded set of eight distinct pictures in the library, drawn by the Event tool', () => {
  for (const t of ROLES) for (const tier of ['budget', 'upgraded']) {
    const set = eventArtSet(OBJECT_EIGHT_SETS, t, tier);
    assert.ok(set && set.visualTier === tier, `${t} ${tier}`);
    const ids = OBJECT_FACING_KEYS.map(k => set.views[k].id);
    assert.equal(new Set(ids).size, 8, `${t} ${tier}: eight pictures`);
    for (const id of ids) assert.ok(LIB.has(id), `${id} in the library`);
    assert.ok(structurePicture({ typeId: t, visualTier: tier, facing: 'yaw8E' }).id === set.views.yaw8E.id, `${t} ${tier}: the Event tool draws the set`);
    assert.ok(hasUpgradedArt(t), `${t}: two conditions`);
  }
});

test('the compact bleacher is placeable in both conditions (eight pictures, its 60 measured seats and an entry)', () => {
  for (const tier of ['budget', 'upgraded']) assert.deepEqual(facilityArtReadiness({ typeId: 'compactBleacher60', visualTier: tier }), { ready: true, reason: '' });
});

test('the twelve course props turn through eight facings as their old ids (placed props keep their saves), the range props as their own', () => {
  for (const k of PROPS) assert.equal(objectFacings(`newprop:${k}`).mode, 'eight', k);
  for (const s of ['golf:range-practice-net', 'golf:range-bag-trolley']) assert.equal(objectFacings(s).mode, 'eight', s);
});

test('the event structures stay in the Event tool: none is a loose Props card, and no course prop has a second card', () => {
  const event = new Set(OBJECT_EIGHT_SETS.filter(s => s.eventTypes?.length).flatMap(s => Object.values(s.views).map(v => v.id)));
  assert.ok(!DECOR.some(d => event.has(d.id)), 'no event structure in the Props panel');
  const aliased = new Set(OBJECT_EIGHT_SETS.filter(s => s.aliases?.length).flatMap(s => Object.values(s.views).map(v => v.id)));
  assert.ok(!DECOR.some(d => aliased.has(d.id)), 'a course prop keeps its one card');
  for (const k of ['rope-barrier', 'rope-walkway', 'direction-signpost', 'course-map-board']) assert.equal(DECOR.find(d => d.key === `newprop-${k}`)?.group, 'tournament', k);
});

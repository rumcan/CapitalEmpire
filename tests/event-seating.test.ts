import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventAnchor, placeSeating, proposedSeating, seatLiftWorldPixels, seatingProblems, type AuthoredSeating } from '../src/game/golf/event-seating';
import { SEATING_FACILITIES, SEATING_PROPOSALS, facilityCondition, facilityImprovement } from '../src/game/golf/facility-models';
import { facilityArtReadiness, structureSeating } from '../src/game/golf/facility-art';
import { OBJECT_FACING_KEYS, objectFootprint, type ObjectEightSet } from '../src/game/object-eight-types';
import { createObjectFacings } from '../src/game/object-eight-core';
import { structureArtReadiness, structurePicture } from '../src/game/golf/structure-facing';
import { checkStructurePlacement } from '../src/game/golf/eventtool';
import { STRUCTURE } from '../src/game/golf/tents';
import { gallerySpots } from '../src/game/golf/galleries';
import { galleryPeople, queuePeople, rowToward, walkerPeople, type CrowdPerson } from '../src/game/crowdview';

const EPS = 1e-8, close = (a: number, b: number) => assert.ok(Math.abs(a - b) < EPS, `${a} != ${b}`);
const approved = (layout: AuthoredSeating): AuthoredSeating => ({ ...layout, review: 'approved' });
const HEADINGS = [0, 37, 90, 127, 180, 217, 270, 307];
const setFor = (typeId = 'seatedPavilion24', visualTier = 'budget', version = 1): ObjectEightSet => {
  const def = STRUCTURE[typeId]!, footprintMetres = { width: def.footprint.w * 2, depth: def.footprint.h * 2 };
  return { subject: `test:${typeId}:${visualTier}`, name: def.name, version, visualTier, review: 'approved', projection: 'normal+yaw8', eventTypes: [typeId], capacity: def.capacity,
    footprintMetres, baselineScale: 1, seating: approved(SEATING_PROPOSALS[typeId]!),
    views: Object.fromEntries(OBJECT_FACING_KEYS.map((key, i) => [key, { id: `test:${typeId}:${visualTier}:${key}`, headingDegrees: HEADINGS[i]!, boxes: [objectFootprint(footprintMetres.width, footprintMetres.depth, HEADINGS[i]!)] }])) as ObjectEightSet['views'] };
};

test('seat rows, their facing and the usable entry rotate together through all eight authored headings', () => {
  const layout = approved(proposedSeating(8, 3)), centre = { x: 40, y: 70 }, first = layout.rows[0]!.start, seen = new Set<string>();
  for (const degrees of HEADINGS) {
    const placed = placeSeating(layout, degrees, centre), expected = eventAnchor(first, degrees, centre), entry = eventAnchor(layout.entries[0]!, degrees, centre);
    assert.equal(placed.count, 24); close(placed.seats[0]!, expected.x); close(placed.seats[1]!, expected.y);
    close(placed.seats[2]!, 0.45); close(placed.entries[0]!.x, entry.x); close(placed.entries[0]!.y, entry.y);
    close(placed.seats[3]!, -Math.sin(degrees * Math.PI / 180)); close(placed.seats[4]!, Math.cos(degrees * Math.PI / 180));
    seen.add(`${placed.seats[0]!.toFixed(5)},${placed.seats[1]!.toFixed(5)}`);
  }
  assert.equal(seen.size, 8, 'eight real physical layouts, not mirrored copies');
});

test('separate seat banks preserve aisle gaps and face their own direction around a horseshoe', () => {
  const layout: AuthoredSeating = { review: 'approved', front: { x: 0, y: 1 }, entries: [{ x: 0, y: -2 }], rows: [
    { start: { x: -3, y: 0 }, step: { x: 0.6, y: 0 }, seats: 3, seatHeightMetres: 1 },
    { start: { x: 1.8, y: 0 }, step: { x: 0.6, y: 0 }, seats: 3, seatHeightMetres: 1, front: { x: -1, y: 0 } },
  ] };
  assert.deepEqual(seatingProblems(layout, 6, { width: 8, depth: 4 }), []);
  const seats = placeSeating(layout, 90, { x: 10, y: 10 }).seats;
  assert.equal(seats.length, 30); close(seats[3]!, -1); close(seats[4]!, 0); close(seats[18]!, 0); close(seats[19]!, -1);
  assert.ok(Math.hypot(seats[15]! - seats[10]!, seats[16]! - seats[11]!) > 1, 'an aisle is not filled by a regular grid');
});

test('seated hips align with bench height for both adult and child animation looks', () => {
  for (const hip of [0.34, 0.64, 0.69]) {
    const hipPixels = hip * (80 / 160) * 128 * Math.cos(Math.PI / 6);
    close(hipPixels + seatLiftWorldPixels(1.25, hip), 1.25 * 32);
    close(hipPixels + seatLiftWorldPixels(1.25, hip, 80, 40), 1.25 * 40);
  }
  assert.equal(placeSeating({ ...approved(proposedSeating(8, 3)), verticalPixelsPerMetre: 40 }, 0, { x: 0, y: 0 }).verticalPixelsPerMetre, 40);
});

test('new models have exact seating counts, sensible dimensions, two conditions and provisional prices', () => {
  assert.deepEqual(SEATING_FACILITIES.map(d => [d.id, d.capacity, d.rent, d.upgradeCost]), [
    ['seatedPavilion24', 24, 600, 300], ['seatedPavilion60', 60, 1200, 600], ['seatedPavilion120', 120, 2400, 1200], ['compactBleacher60', 60, 900, 450],
  ]);
  for (const def of SEATING_FACILITIES) {
    assert.deepEqual(seatingProblems(approved(SEATING_PROPOSALS[def.id]!), def.capacity, { width: def.footprint.w * 2, depth: def.footprint.h * 2 }), []);
    assert.equal(def.requiresEightArt, true);
  }
  assert.equal(facilityCondition('budget'), 'budget'); assert.equal(facilityCondition('worn'), 'budget'); assert.equal(facilityCondition('rundown'), 'budget'); assert.equal(facilityCondition('upgraded'), 'upgraded');
  assert.deepEqual(['standS', 'standM', 'standL', 'rangeStand'].map(id => [STRUCTURE[id]!.capacity, STRUCTURE[id]!.rent, STRUCTURE[id]!.buy]), [[200, 3000, 0], [1000, 12000, 0], [4000, 40000, 0], [600, 5000, 30000]], 'existing balance stays unchanged');
});

test('new facilities cannot use a legacy scaled stand or be placed before all eight reviewed pictures and rows exist', () => {
  const s = { typeId: 'seatedPavilion24', x: 20, y: 20, mode: 'rent' as const };
  assert.equal(facilityArtReadiness(s, []).ready, false);
  assert.equal(checkStructurePlacement(s, { tier: 5, existing: [], holes: [], artSets: [] }).ok, false);
  assert.equal(structurePicture(s, []).id, '', 'no scaled small-grandstand fallback for a new pavilion');
  const set = setFor(), sets = [set], lookup = createObjectFacings(sets, () => true, () => null);
  assert.equal(structureArtReadiness(s, sets, lookup).ready, true);
  assert.equal(checkStructurePlacement(s, { tier: 5, existing: [], holes: [], artSets: sets }).ok, true);
  const missing = { ...set, views: { ...set.views, yaw8W: { ...set.views.normalNE } } };
  assert.equal(facilityArtReadiness(s, [missing]).ready, false, 'duplicating one heading does not make eight');
  const badRows = { ...set, seating: { ...set.seating!, review: 'draft' as const } };
  assert.equal(facilityArtReadiness(s, [badRows]).ready, false);
  assert.equal(facilityArtReadiness(s, [{ ...set, footprintMetres: { width: 16, depth: 6 } }]).ready, false, 'a different size cannot be relabelled as this pavilion');
  assert.equal(structureArtReadiness(s, sets, createObjectFacings(sets, id => !id.endsWith('yaw8W'), () => null)).ready, false, 'metadata alone does not make a removed runtime image available');
});

test('upgraded art is independently gated and worn/rundown are aliases of the same budget level', () => {
  const budget = setFor('seatedPavilion24', 'worn'), upgraded = setFor('seatedPavilion24', 'upgraded');
  assert.equal(facilityArtReadiness({ typeId: 'seatedPavilion24', visualTier: 'budget' }, [budget]).ready, true);
  assert.equal(facilityArtReadiness({ typeId: 'seatedPavilion24', visualTier: 'rundown' }, [budget]).ready, true);
  assert.equal(facilityArtReadiness({ typeId: 'seatedPavilion24', visualTier: 'upgraded' }, [budget]).ready, false);
  assert.equal(facilityArtReadiness({ typeId: 'seatedPavilion24', visualTier: 'upgraded' }, [budget, upgraded]).ready, true);
});

test('an improvement is paid once, requires actual upgraded art and funds, and never charges an existing facility type', () => {
  const ready = { ready: true, reason: '' }, missing = { ready: false, reason: 'Upgraded art is being prepared' }, def = STRUCTURE.seatedPavilion24;
  assert.deepEqual(facilityImprovement(def, 'budget', 300, ready), { cost: 300, available: true, reason: '' });
  assert.equal(facilityImprovement(def, 'upgraded', 5000, ready), null);
  assert.equal(facilityImprovement(STRUCTURE.standS, undefined, 5000, ready), null);
  assert.equal(facilityImprovement(def, 'budget', 299, ready)?.available, false);
  assert.equal(facilityImprovement(def, 'budget', 5000, missing)?.reason, missing.reason);
});

test('row count, accessible entry and footprint checks reject malformed reviewed metadata', () => {
  const layout = approved(proposedSeating(8, 3)), footprint = { width: 8, depth: 6 };
  assert.match(seatingProblems({ ...layout, entries: [] }, 24, footprint).join(), /entry/);
  assert.match(seatingProblems(layout, 25, footprint).join(), /exactly 25/);
  assert.match(seatingProblems({ ...layout, rows: [{ ...layout.rows[0]!, start: { x: 5, y: 0 } }] }, 8, footprint).join(), /outside/);
});

test('a per-view measured layout overrides shared rows while physical heading still turns its entry', () => {
  const set = setFor(), override = { ...set.seating!, entries: [{ x: 3, y: -2 }] };
  set.views.yaw8N.seating = override;
  const actual = structureSeating({ typeId: 'seatedPavilion24', facing: 'yaw8N' }, [set]);
  assert.equal(actual.layout, override); assert.equal(actual.headingDegrees, 37);
});

test('gallery occupancy follows actual row count, skips aisle space and clears seat lift for walking/queued people', () => {
  const placed = placeSeating(approved(proposedSeating(8, 3)), 127, { x: 20, y: 20 }), out: CrowdPerson[] = [];
  const G = Float32Array.of(20, 20, 100, 2, 20, 21, 20, 21), n = galleryPeople(G, 0, 3, 5, 15, out, -1, placed);
  assert.equal(n, 24);
  for (let i = 0; i < n; i++) {
    close(out[i]!.x, placed.seats[i * 5]!); close(out[i]!.y, placed.seats[i * 5 + 1]!);
    assert.equal(out[i]!.seatHeightMetres, 0.45); assert.equal(out[i]!.row, rowToward(placed.seats[i * 5 + 3]!, placed.seats[i * 5 + 4]!));
  }
  queuePeople(0, 0, 0, 1, 3, 1, 0, 15, out); assert.equal(out[0]!.seatHeightMetres, undefined);
  galleryPeople(G, 0, 3, 5, 15, out, -1, placed);
  walkerPeople(Float32Array.of(0, 0, 3, 3, 0, 1), 0, 1, 0, 15, out); assert.equal(out[0]!.seatHeightMetres, undefined);
});

test('legacy galleries rotate focus and entry together instead of always facing screen bottom', () => {
  const facings = ['normalNE', 'normalSE', 'normalSW', 'normalNW'] as const;
  const seen = new Set<string>();
  for (const facing of facings) {
    const s = { id: 1, typeId: 'standS', x: 20, y: 20, mode: 'rent' as const, facing }, spot = gallerySpots([], [], [s], [])[0]!;
    const degrees = structureSeating(s, []).headingDegrees, focus = eventAnchor({ x: 0, y: 2 }, degrees, spot);
    close(spot.fx, focus.x); close(spot.fy, focus.y); assert.equal(spot.structureId, 1); assert.ok(spot.entry);
    seen.add(`${(spot.fx - spot.x).toFixed(3)},${(spot.fy - spot.y).toFixed(3)}`);
  }
  assert.equal(seen.size, 4);
});

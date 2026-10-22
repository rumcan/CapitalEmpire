// Save compatibility tests (SaveV5 & GolfSave): classic saves without golf, full golf saves with all optional fields, pre-parcels golf saves, and normalizeGolfSave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { SAVE_VERSION, upgradeSave, type SaveV5 } from '../src/game/save';
import { normalizeGolfSave, type GolfSave } from '../src/game/golf/mode';

function makeClassicSaveV5(): SaveV5 {
  return {
    version: SAVE_VERSION,
    map: MAP,
    seed: 42,
    segs: [[100, 100, 140, 100, 'street', 0, 0, 1]],
    nodes: [[100, 100, 'plain'], [140, 100, 'signal', 0, [], [1, 18, 18]]],
    props: [['world:tree_oak_0', 110, 110, 0, 1]],
    money: 750000,
    day: 3,
    cam: { X: 0, Y: 1024, z: 0.2 },
    lots: [['100,100:0', 1, 2, 0, 12345, 600]],
    simT: 4320,
    shift: 0,
    parks: [[120, 120, 20, 20]],
    tolls: [[100, 100, 130, 100, 6]],
    buses: [[1, 122, 122, 180, 180, 8, 60, 0]],
    cardsApplied: 1,
    biz: [['stadium', 200, 200, 100, 80]],
    paints: [['asphalt', 1, 0, 0, '', [10, 10, 20, 10, 20, 20]]],
    rows: [[150, 150, 170, 150, 1, 90, 'white']],
    curbs: [[150, 160, 170, 160]],
    parkFee: 5,
    speed: 1,
  };
}

test('classic SaveV5 fixture without any golf field goes through upgradeSave unchanged and still has no golf field', () => {
  const classic = makeClassicSaveV5();
  assert.equal('golf' in classic, false);
  assert.equal(classic.golf, undefined);

  const roundTripped = JSON.parse(JSON.stringify(classic)) as SaveV5;
  const upgraded = upgradeSave(roundTripped);
  assert.ok(upgraded, 'expected upgradeSave to accept classic SaveV5');
  assert.deepEqual(upgraded, classic);
  assert.equal('golf' in upgraded, false);
  assert.equal(upgraded.golf, undefined);
  assert.equal(normalizeGolfSave(upgraded.golf), null);
});

test('classic v4 and v3 saves upgrade to SaveV5 without acquiring a golf field', () => {
  const v4 = { ...makeClassicSaveV5(), version: 4 };
  const up4 = upgradeSave(v4);
  assert.ok(up4);
  assert.equal(up4.version, SAVE_VERSION);
  assert.equal(up4.golf, undefined);

  const v3 = {
    version: 3,
    map: MAP,
    seed: 7,
    segs: makeClassicSaveV5().segs,
    nodes: makeClassicSaveV5().nodes,
    props: makeClassicSaveV5().props,
    money: 500000,
    day: 2,
  };
  const up3 = upgradeSave(v3);
  assert.ok(up3);
  assert.equal(up3.version, SAVE_VERSION);
  assert.equal(up3.golf, undefined);
});

test('golf save with every optional field (parcel, parcels, structures, cards, poorYears, tees, pins, aims) survives JSON.stringify, JSON.parse and upgradeSave unchanged', () => {
  const fullGolf: GolfSave = {
    v: 1,
    tier: 3,
    rep: 68,
    poorYears: 1,
    town: { x: 640, y: 640 },
    course: [720, 560, 300, 450],
    parcel: [700, 540, 380, 510],
    parcels: [
      [700, 540, 320, 470],
      [1020, 540, 60, 40],
    ],
    dir: 1,
    tees: [
      { hole: 1, x: 740, y: 580, kind: 'back' },
      { hole: 1, x: 744, y: 584, kind: 'middle' },
      { hole: 1, x: 748, y: 588, kind: 'forward' },
    ],
    pins: [
      { hole: 1, x: 860, y: 620 },
      { hole: 9, x: 780, y: 700 },
    ],
    aims: [
      { hole: 1, x: 800, y: 600, order: 1 },
    ],
    clubhouse: { x: 715, y: 555 },
    structures: [
      { id: 1, typeId: 'gate', x: 710, y: 550, mode: 'buy' },
      { id: 2, typeId: 'foodTent', x: 730, y: 560, mode: 'rent', rotated: true },
    ],
    cards: ['expressGates', 'courseConsultant', 'sponsorDeal'],
  };

  const saveWithFullGolf: SaveV5 = {
    ...makeClassicSaveV5(),
    biz: [['clubhouse', 710, 550, 16, 12]],
    golf: fullGolf,
  };

  const json = JSON.stringify(saveWithFullGolf);
  const parsed = JSON.parse(json) as SaveV5;
  const upgraded = upgradeSave(parsed);

  assert.ok(upgraded, 'expected upgradeSave to return full golf save');
  assert.deepEqual(upgraded, saveWithFullGolf);
  assert.deepEqual(upgraded.golf, fullGolf);
  assert.deepEqual(normalizeGolfSave(upgraded.golf), fullGolf);
});

test('golf save from before parcels, structures, cards and poorYears existed (only v, tier, rep, town, course, parcel, dir, tees, pins, aims, clubhouse) is valid', () => {
  const preParcelsGolf: GolfSave = {
    v: 1,
    tier: 1,
    rep: 30,
    town: { x: 520, y: 520 },
    course: [600, 440, 300, 450],
    parcel: [580, 420, 340, 490],
    dir: 0,
    tees: [{ hole: 1, x: 620, y: 460, kind: 'middle' }],
    pins: [{ hole: 1, x: 700, y: 500 }],
    aims: [],
    clubhouse: { x: 595, y: 435 },
  };

  const preParcelsSave: SaveV5 = {
    ...makeClassicSaveV5(),
    biz: [['clubhouse', 590, 430, 16, 12]],
    golf: preParcelsGolf,
  };

  const parsed = JSON.parse(JSON.stringify(preParcelsSave)) as SaveV5;
  const upgraded = upgradeSave(parsed);

  assert.ok(upgraded);
  assert.deepEqual(upgraded, preParcelsSave);
  assert.equal(upgraded.golf?.parcels, undefined);
  assert.equal(upgraded.golf?.structures, undefined);
  assert.equal(upgraded.golf?.cards, undefined);
  assert.equal(upgraded.golf?.poorYears, undefined);

  const normalized = normalizeGolfSave(upgraded.golf);
  assert.ok(normalized);
  assert.deepEqual(normalized, preParcelsGolf);
});

test('normalizeGolfSave safely defaults missing tees, pins, aims, parcel, tier, and rep on partial golf saves and rejects incomplete saves missing town/course/clubhouse', () => {
  const partial = {
    v: 1 as const,
    town: { x: 500, y: 500 },
    course: [600, 500, 300, 450] as [number, number, number, number],
    dir: 2 as const,
    clubhouse: { x: 590, y: 495 },
  };
  const normalized = normalizeGolfSave(partial);
  assert.ok(normalized);
  assert.equal(normalized.tier, 1);
  assert.equal(normalized.rep, 0);
  assert.deepEqual(normalized.parcel, [600, 500, 300, 450]);
  assert.deepEqual(normalized.tees, []);
  assert.deepEqual(normalized.pins, []);
  assert.deepEqual(normalized.aims, []);

  // Rejects missing town, course, or clubhouse
  assert.equal(normalizeGolfSave(null), null);
  assert.equal(normalizeGolfSave(undefined), null);
  assert.equal(normalizeGolfSave({ v: 1, course: [0, 0, 10, 10], clubhouse: { x: 1, y: 1 } }), null);
});

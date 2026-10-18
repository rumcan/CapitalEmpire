// Save versions (headless: npm test). upgradeSave is the pure part of readSave; the IndexedDB part is not run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { SAVE_VERSION, upgradeSave } from '../src/game/save';

type Arg = Parameters<typeof upgradeSave>[0];
const v4: Arg = { version: 4, map: MAP, seed: 7, segs: [[1, 2, 3, 4, 'street', 0]], nodes: [], props: [['world:house_1', 5, 6, 0, 1]], money: 900, day: 3, cam: { X: 1, Y: 2, z: 0.2 } };

test('save version 5, and a v4 save migrates with no lots and no sim clock', () => {
  assert.equal(SAVE_VERSION, 5);
  const d = upgradeSave({ ...v4 })!;
  assert.equal(d.version, 5);
  assert.equal(d.lots, undefined);
  assert.equal(d.simT, undefined);
  assert.equal(d.seed, 7);
  assert.deepEqual(d.props, v4.props);
  assert.equal(d.money, 900);
});

test('a v5 save keeps its lots and clock', () => {
  const lots: [string, number, number, number, number, number][] = [['lot:1', 1, 2, 0, 99, 1500]];
  const d = upgradeSave({ ...v4, version: 5, lots, simT: 1234.5 })!;
  assert.equal(d.version, 5);
  assert.deepEqual(d.lots, lots);
  assert.equal(d.simT, 1234.5);
});

test('a save of another map size, or an unknown version, is not read', () => {
  assert.equal(upgradeSave({ ...v4, map: MAP + 2 }), null);
  assert.equal(upgradeSave({ ...v4, version: 9 }), null);
});

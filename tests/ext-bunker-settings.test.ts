import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUNKER_SETTING_FIELDS, DEFAULT_BUNKER_SETTINGS, bunkerAppearance, clampBunkerSettings,
  readBunkerSettings, resolveBunkerSettings,
} from '../src/game/ext/bunker-look/settings';
import { APPROVED_APPEARANCE } from '../src/game/ext/bunker-look/package/approved-preset.js';

test('approved defaults and JSON round trips preserve every exact appearance value', () => {
  const defaults = clampBunkerSettings(JSON.parse(JSON.stringify(DEFAULT_BUNKER_SETTINGS)));
  assert.deepEqual(defaults, DEFAULT_BUNKER_SETTINGS);
  assert.deepEqual(bunkerAppearance(defaults), APPROVED_APPEARANCE);
  assert.equal(defaults.version, 1);
  assert.equal(defaults.depth, 1.5);
  assert.equal(defaults.collar, 2.647123893805);
  assert.equal(defaults.wall, 1.93929756637);
  assert.deepEqual(BUNKER_SETTING_FIELDS.filter(field => field.hidden).map(field => field.key).sort(), ['fairwayScale', 'roundness']);
  for (const key of ['slope', 'collar', 'firstCut']) assert.equal(BUNKER_SETTING_FIELDS.find(field => field.key === key)?.displayScale, 2);
});

test('normalization rejects nonfinite values, clamps renderer limits and ignores unknown fields', () => {
  const base = clampBunkerSettings({ depth: 2, wall: 0.5 });
  const normalized = clampBunkerSettings({ depth: NaN, wall: Infinity, rim: -10, slope: 0, collar: 999, firstCut: 999, textureScale: '2', sandScale: 99, garbage: 12 }, base);
  assert.equal(normalized.depth, 2);
  assert.equal(normalized.wall, 0.5);
  assert.equal(normalized.rim, 0);
  assert.equal(normalized.slope, 0.05);
  assert.equal(normalized.collar + normalized.firstCut, 7.5, 'the SDK supports at most 15 m combined grass bands');
  assert.equal(normalized.textureScale, base.textureScale);
  assert.equal(normalized.sandScale, 6);
  assert.equal('garbage' in normalized, false);
  for (const field of BUNKER_SETTING_FIELDS) assert.ok(normalized[field.key] >= field.min && normalized[field.key] <= field.max);
  assert.equal(clampBunkerSettings({ depth: 0, wall: 0, rim: 0 }).depth, 0);
});

test('legacy absent settings inherit defaults; corrupt or future save data does not create a custom override', () => {
  for (const value of [undefined, null, false, 12, 'settings', [], {}, { ignored: 3 }, { depth: NaN }, { version: 2, depth: 4 }, { version: '1', depth: 4 }]) {
    assert.equal(readBunkerSettings(value), undefined);
  }
  assert.deepEqual(clampBunkerSettings({ version: 2, depth: 4 }), DEFAULT_BUNKER_SETTINGS);
  const migrated = readBunkerSettings({ wall: 0.35 });
  assert.equal(migrated?.wall, 0.35);
  assert.equal(migrated?.version, 1);
  assert.deepEqual(readBunkerSettings({ version: 1 }), DEFAULT_BUNKER_SETTINGS);
});

test('inherited groups track global changes while full custom snapshots remain independent', () => {
  const before = clampBunkerSettings({ depth: 1, wall: 0.4 });
  const custom = clampBunkerSettings({ wall: 0.75 }, before);
  const after = clampBunkerSettings({ depth: 3, wall: 2 }, before);
  assert.equal(resolveBunkerSettings(before).depth, 1);
  assert.equal(resolveBunkerSettings(after).depth, 3);
  assert.deepEqual(resolveBunkerSettings(after, custom), custom);
  const resolved = resolveBunkerSettings(after, custom);
  resolved.wall = 1.5;
  assert.equal(custom.wall, 0.75);
  assert.equal(after.wall, 2);
  const appearance = bunkerAppearance(custom);
  appearance.settings.wall = 3;
  assert.equal(custom.wall, 0.75);
  assert.equal(APPROVED_APPEARANCE.settings.wall, DEFAULT_BUNKER_SETTINGS.wall);
});

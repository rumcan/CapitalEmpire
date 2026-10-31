import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUNKER_SETTING_FIELDS, BUNKER_TEXTURE_SLOTS, DEFAULT_BUNKER_SETTINGS, DEFAULT_BUNKER_TEXTURES, bunkerAppearance, clampBunkerSettings,
  readBunkerSettings, resolveBunkerSettings,
} from '../src/game/ext/bunker-look/settings';
import { APPROVED_APPEARANCE } from '../src/game/ext/bunker-look/package/approved-preset.js';
import { BUNKER_TEXTURE_LIBRARY, bunkerMaterials, bunkerTexture } from '../src/game/ext/bunker-look/texture-library';

test('approved defaults and JSON round trips preserve every exact appearance value', () => {
  const defaults = clampBunkerSettings(JSON.parse(JSON.stringify(DEFAULT_BUNKER_SETTINGS)));
  assert.deepEqual(defaults, DEFAULT_BUNKER_SETTINGS);
  // the approved look, but the course draws the grass round a bunker: no own grass bands, no rim mound; the edge soil starts at the earth scale
  assert.deepEqual(bunkerAppearance(defaults), { ...APPROVED_APPEARANCE, settings: { ...APPROVED_APPEARANCE.settings, collar: 0.05, firstCut: 0.05, rim: 0, soilScale: APPROVED_APPEARANCE.settings.earthScale } });
  assert.equal(defaults.version, 1);
  assert.equal(defaults.depth, 1.5);
  assert.equal(defaults.collar, 0.05);
  assert.equal(defaults.rim, 0);
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

test('texture ids per slot round-trip, partial edits keep the rest, and bad values fall back', () => {
  const defaults = clampBunkerSettings(undefined);
  for (const slot of BUNKER_TEXTURE_SLOTS) assert.equal(defaults[slot.key], DEFAULT_BUNKER_TEXTURES[slot.slot]);
  const swapped = clampBunkerSettings({ sandTex: 'photo:wasteSand', wallScale: 3 }, defaults);
  assert.equal(swapped.sandTex, 'photo:wasteSand');
  assert.equal(swapped.wallTex, DEFAULT_BUNKER_TEXTURES.wall);
  assert.deepEqual(clampBunkerSettings(JSON.parse(JSON.stringify(swapped))), swapped);
  const kept = clampBunkerSettings({ roughTex: 'file:My grass' }, swapped);
  assert.equal(kept.sandTex, 'photo:wasteSand', 'a later edit keeps the earlier swap');
  assert.equal(kept.roughTex, 'file:My grass');
  assert.equal(clampBunkerSettings({ sandTex: 12 }, swapped).sandTex, 'photo:wasteSand');
  assert.equal(clampBunkerSettings({ sandTex: '' }).sandTex, DEFAULT_BUNKER_TEXTURES.sand);
  assert.equal(readBunkerSettings({ soilTex: 'photo:dirt' })?.soilTex, 'photo:dirt', 'a texture-only custom snapshot is a custom override');
});

test('the edge soil gets its own scale; older saves keep it on the wall earth scale', () => {
  const old = { ...DEFAULT_BUNKER_SETTINGS, earthScale: 2 } as Record<string, unknown>;
  delete old.soilScale;
  assert.equal(clampBunkerSettings(old).soilScale, 2);
  const base = clampBunkerSettings({ soilScale: 1.5 });
  const wallOnly = clampBunkerSettings({ earthScale: 4 }, base);
  assert.equal(wallOnly.earthScale, 4);
  assert.equal(wallOnly.soilScale, 1.5, 'moving the wall slider leaves the soil alone');
  assert.equal(bunkerAppearance(wallOnly).settings.soilScale, 1.5);
});

test('the library resolves every slot; unknown ids draw the slot default', () => {
  const ids = new Set(BUNKER_TEXTURE_LIBRARY.map(entry => entry.id));
  assert.equal(ids.size, BUNKER_TEXTURE_LIBRARY.length, 'texture ids are unique');
  for (const id of Object.values(DEFAULT_BUNKER_TEXTURES)) assert.ok(ids.has(id), id);
  assert.equal(bunkerTexture('sand', 'file:missing').id, DEFAULT_BUNKER_TEXTURES.sand);
  assert.equal(bunkerTexture('wall', 'bunker:sand').id, 'bunker:sand', 'any texture fits any slot');
  const materials = bunkerMaterials(clampBunkerSettings({ wallTex: 'bunker:sand', soilTex: 'nope' }));
  assert.equal(materials.wall.id, 'bunker:sand');
  assert.deepEqual(materials.wall.crop, [0.5, 0, 0.5, 0.5]);
  assert.equal(materials.soil.id, DEFAULT_BUNKER_TEXTURES.soil);
  assert.deepEqual(Object.keys(materials).sort(), ['firstCut', 'rough', 'sand', 'soil', 'wall']);
});

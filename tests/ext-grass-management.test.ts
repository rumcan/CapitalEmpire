import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GrassManagement, GROUND_MATERIALS, GRASS_DECALS, grassSurface, type GrassCellView, type GrassAction } from '../src/game/ext/grass-management';

const square = (x = 0, y = 0, size = 16) => [x, y, x + size, y, x + size, y + size, x, y + size];
const scope = { x: 2, y: 2, radius: 0 };
const weather = { rain: 0, evaporation: 0, temperature: 20 };
function grass() { const g = new GrassManagement(64); g.register('course', square(), 'golf-fairway'); g.register('town', square(32, 32), 'residential-lawn'); return g; }
const snap = (g: GrassManagement, x = 2, y = 2) => ({ ...g.at(x, y)! });

test('catalogue has precisely 80 grass and 20 soil ids matching the generation contract', () => {
  assert.equal(GROUND_MATERIALS.length, 100); assert.equal(new Set(GROUND_MATERIALS.map(m => m.id)).size, 100);
  assert.equal(GROUND_MATERIALS.filter(m => m.kind === 'grass').length, 80); assert.equal(GRASS_DECALS.length, 12);
  assert.ok(GROUND_MATERIALS.some(m => m.id === 'loam-churned')); assert.ok(GROUND_MATERIALS.some(m => m.id === 'gravel-soil-prepared'));
  assert.equal(grassSurface('preset:water', false, 'water'), null); assert.equal(grassSurface('preset:putting', false, 'green'), 'golf-green');
  assert.equal(grassSurface('asphalt'), null); assert.equal(grassSurface('preset:town', true), 'residential-lawn');
});

test('starting grass needs attention; non-turf, malformed and off-map areas do not create cells', () => {
  const g = grass(); assert.equal(g.activeCells, 32); assert.ok(g.at(2, 2)!.health < 0.7); assert.ok(g.at(2, 2)!.coverage < 0.7);
  assert.equal(g.at(24, 24), null); assert.equal(g.at(-1, 2), null); assert.equal(g.at(NaN, 2), null);
  g.register('bad', [0, 0, Infinity, 3, 3, 0], 'golf-green'); g.register('outside', square(100, 100), 'golf-green'); assert.equal(g.activeCells, 32);
});

test('foot traffic is local, preserves untouched town cells and gets worse under repeated wet traffic', () => {
  const g = grass(), town = snap(g, 34, 34), before = snap(g); g.traffic(1, 2, 14, 2, 100, 'foot');
  assert.ok(g.at(2, 2)!.coverage < before.coverage); assert.ok(g.at(2, 2)!.foot > 0); assert.equal(g.at(2, 14)!.foot, 0); assert.deepEqual(snap(g, 34, 34), town);
  const dry = grass(), wet = grass(); wet.apply('water', scope); wet.apply('water', scope); dry.traffic(2, 2, 2, 2, 20); wet.traffic(2, 2, 2, 2, 20); assert.ok(wet.at(2, 2)!.foot > dry.at(2, 2)!.foot);
});

test('cart wear and a golf divot remain separate from base materials and foot wear', () => {
  const g = grass(); g.traffic(2, 2, 2, 2, 3, 'cart'); g.traffic(10, 10, 10, 10, 1, 'divot');
  assert.ok(g.at(2, 2)!.carts > 0); assert.equal(g.at(2, 2)!.foot, 0); assert.ok(g.at(10, 10)!.divots > 0); assert.equal(g.at(10, 10)!.carts, 0);
  assert.match(g.at(10, 10)!.material, /^golf-fairway-/);
});

test('local care operations change their intended quantities and charge only affected area', () => {
  const g = grass(), before = snap(g), town = snap(g, 34, 34);
  const actions: GrassAction[] = ['water', 'fertilise', 'aerate', 'mow', 'seed', 'sod', 'repair'];
  for (const a of actions) { assert.ok(g.quote(a, scope) > 0); assert.equal(g.apply(a, scope, 1, 45), 1); }
  const after = snap(g); assert.ok(after.moisture > before.moisture); assert.ok(after.nutrients > before.nutrients); assert.ok(after.compaction < before.compaction); assert.ok(after.growth < before.growth); assert.ok(after.coverage > before.coverage); assert.equal(after.angle, 45); assert.equal(after.repair, 1);
  assert.deepEqual(snap(g, 34, 34), town); assert.equal(g.quote('water', { ...scope, zone: 'missing' }), 0);
  assert.equal(g.quote('water', { ...scope, zone: 'course' }), 16);
});

test('healthy care recovers cover and heals wear, while drought degrades neglected turf', () => {
  const g = grass(); g.traffic(2, 2, 2, 2, 5, 'cart'); g.traffic(2, 2, 2, 2, 1, 'divot');
  g.apply('water', scope, 0.4); g.apply('fertilise', scope); g.apply('aerate', scope); g.apply('seed', scope); const before = snap(g);
  g.step(20, weather); const after = snap(g); assert.ok(after.health > before.health); assert.ok(after.coverage > before.coverage); assert.ok(after.carts < before.carts); assert.ok(after.divots < before.divots);
  const drought = grass(), start = snap(drought); drought.step(30, { rain: 0, evaporation: 0.2, temperature: 36 }); assert.ok(drought.at(2, 2)!.health < start.health); assert.ok(drought.at(2, 2)!.moisture < 0.1);
});

test('continued appropriate care can reach immaculate condition, without removing all small player damage', () => {
  const g = grass(); g.apply('sod', scope); g.apply('water', scope, 0.4); g.apply('fertilise', scope); g.apply('aerate', scope);
  for (let day = 0; day < 25; day++) { g.apply('mow', scope); if (day % 10 === 0) g.apply('fertilise', scope, 0.1); g.step(1, weather); }
  assert.equal(g.at(2, 2)!.condition, 'pristine'); g.traffic(2, 2, 2, 2, 1, 'divot'); assert.ok(g.at(2, 2)!.divots > 0); assert.ok(g.at(2, 2)!.coverage > 0.95);
});

test('identical weather, wear and operations give deterministic results with no random stream', () => {
  const a = grass(), b = grass(); for (const g of [a, b]) { g.traffic(1, 1, 14, 10, 20); g.apply('aerate', scope); g.step(2.5, weather); g.apply('seed', scope); g.step(5, weather); }
  assert.deepEqual(a.serialize(), b.serialize());
});

test('changed regions contain only affected cells, descriptors are reusable and cloneable for workers', () => {
  const g = grass(), out: GrassCellView[] = []; assert.equal(g.drain(out), 32); const first = out[0]; assert.equal(g.drain(out), 0);
  g.apply('mow', scope); assert.equal(g.drain(out), 1); assert.equal(out[0], first); assert.deepEqual([out[0].x, out[0].y, out[0].size], [0, 0, 4]);
  assert.deepEqual(structuredClone(out), out); assert.equal(g.drain(out), 0);
  g.remove('course'); g.drain(out); assert.equal(out.length, 16); assert.ok(out.every(c => !c.active && c.x < 16)); assert.equal(g.activeCells, 16);
});

test('polygon edits and overlap preserve existing condition and restore remaining surface identity', () => {
  const g = grass(); g.apply('water', scope); const water = g.at(2, 2)!.moisture;
  g.register('top', square(0, 0, 8), 'golf-green'); assert.equal(g.at(2, 2)!.surface, 'golf-green'); assert.equal(g.at(2, 2)!.moisture, water);
  g.remove('top'); assert.equal(g.at(2, 2)!.surface, 'golf-fairway'); g.register('course', square(0, 0, 20), 'golf-fairway'); assert.equal(g.at(2, 2)!.moisture, water);
  assert.equal(g.zoneAt(2, 2), 'course'); assert.equal(g.zoneAt(24, 24), undefined);
});

test('versioned save/load round trips edited turf and tuning while legacy saves retain defaults', () => {
  const g = grass(); g.apply('sod', scope); g.traffic(3, 3, 6, 3, 5, 'cart'); g.configure({ strength: 0.8, recovery: 2, material: 'loam-damp' }); g.step(3, weather);
  const save = JSON.parse(JSON.stringify(g.serialize())), loaded = grass(); loaded.load(save); assert.deepEqual(loaded.serialize(), g.serialize()); assert.equal(loaded.at(2, 2)!.material, 'loam-damp');
  const legacy = grass(), before = legacy.serialize(); legacy.load(undefined); legacy.load({ v: 999, cells: [] }); assert.deepEqual(legacy.serialize(), before);
  const reloadedBeforeRegistration = new GrassManagement(64); reloadedBeforeRegistration.load(save); reloadedBeforeRegistration.register('course', square(), 'golf-fairway'); assert.equal(reloadedBeforeRegistration.at(2, 2)!.health, g.at(2, 2)!.health);
});

test('untrusted values are clamped, invalid operations do nothing, and paused grass does not advance', () => {
  const g = grass(), before = g.serialize(); g.step(NaN); g.step(-1); g.traffic(NaN, 0, 1, 1); g.apply('water', { x: Infinity, y: 2, radius: 2 }); g.apply('toString' as GrassAction, scope); assert.deepEqual(g.serialize(), before);
  g.configure({ strength: 9, wear: -5, temperature: Infinity }); assert.equal(g.settings.strength, 1); assert.equal(g.settings.wear, 0); assert.ok(Number.isFinite(g.settings.temperature));
  const saved = g.serialize(); saved.cells[0][2] = Infinity; saved.cells.push([-1, 0, ...new Array(11).fill(1)]); g.load(saved); assert.equal(g.at(2, 2)!.health, 0);
  g.configure({ enabled: false }); const paused = g.serialize(); g.step(100, weather); assert.deepEqual(g.serialize(), paused);
});

test('new valley clears previous condition, damage and settings', () => {
  const g = grass(); g.traffic(2, 2, 2, 2, 100, 'cart'); g.configure({ wear: 3 }); g.clear(); assert.equal(g.activeCells, 0); g.register('new', square(), 'meadow'); assert.equal(g.at(2, 2)!.carts, 0); assert.equal(g.settings.wear, 1);
  console.log('grass grid: 4 tile / 8 m cells; catalogue 100 materials + 12 four-variant decal sheets; localized state, versioned saves');
});

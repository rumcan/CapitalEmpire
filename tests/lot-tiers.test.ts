// T295 (#880): the building tiers (lots/tiers.ts): the tier of a building by its library id, a preset's tier, the town's tier from the range's takings and
// its home, and a lot's composition held to its tier (compose.ts planOf: a tier-0 lot draws no tier-2 building; an old save's lot composes as before).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose, setGeneratedLots, setLotPresets, type ComposeState, type LotGeom } from '../src/game/lots/compose';
import { LU, LV } from '../src/game/lots/town';
import { TIER_RULES, incomeTier, presetTier, tierOf, townTier } from '../src/game/lots/tiers';
import { TIER_TAKINGS } from '../src/game/event/config';
import { LIBRARY } from '../src/game/library';
import { isBuilding } from '../src/game/mirror';
import { parsePresets } from '../src/game/lots/presets';
import PRESET_FIXTURE from './fixtures/lot-presets.json';
import { setCleanYards } from '../src/game/lots/clean-yards';
// T385 (#1042): this file pins the old yards (the learned generator's house yards, the kit, the starter homes): the clean base is the game's house lot now (tests/clean-lots.test.ts)
setCleanYards(false);

// the same frozen presets and composer as tests/compose.test.ts: the fixture's copy of lot-presets.json, no generated house lots
setGeneratedLots(false);
{ const f = parsePresets(PRESET_FIXTURE); setLotPresets(f.presets, f.meta); }
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const byId = new Map(LIBRARY.map(i => [i.id, i]));
const buildingOf = (id: string) => { const it = byId.get(id); return !!it && isBuilding(it); };
/** a 12 x 16 tile lot on the street along x (its frontage on -y), at the origin */
const lot: LotGeom = { o: { x: 100, y: 100 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 12, d: 16 };
/** the building ids a composition draws (a prop whose library item is a building) */
const buildingsIn = (st: ComposeState, seeds: number) => {
  const out = new Set<string>();
  for (let s = 1; s <= seeds; s++) for (const p of compose(lot, { ...st, seed: s }).props) if (buildingOf(p.id)) out.add(p.id);
  return out;
};

test('a building id has its tier: starter, modest, town, fine', () => {
  assert.equal(tierOf('expansion:rundown-house'), 0);       // boarded-up timber house
  assert.equal(tierOf('expansion:boarded-store-rear'), 0);  // the abandoned brick store
  assert.equal(tierOf('variation:expansion-abandoned-workshop-26852883:1'), 0);
  assert.equal(tierOf('world:barn'), 0);
  assert.equal(tierOf('variation:expansion-mobile-home-c191731d-plain-corner:1'), 0);
  assert.equal(tierOf('expansion:junk-car'), 0);
  assert.equal(tierOf('world:house_1'), 1);                 // a small house
  assert.equal(tierOf('gen:house-ranch-long'), 1);
  assert.equal(tierOf('variation:industrial-foundry-606f1084:1'), 1);
  assert.equal(tierOf('variation:expansion-garage-rear-91bcbe45:1'), 1);
  assert.equal(tierOf('world:house_4'), 2);                 // the other houses
  assert.equal(tierOf('world:video'), 2);                   // the shops, the school, the church
  assert.equal(tierOf('world:school'), 2);
  assert.equal(tierOf('variation:ref-building-church-1df07e15-plain:1'), 2);
  assert.equal(tierOf('gen:house-farmhouse-wrap'), 3);      // large houses are fine, even though they say farm
  assert.equal(tierOf('variation:ref-building-house-large-20cb9f9e-plain:1'), 3);
  assert.equal(tierOf('expansion:boat-trailer'), 2);        // a boat trailer is no caravan
  assert.ok(TIER_RULES.length >= 6);
});

test('a preset takes the highest tier of its building props, and 0 when it has none', () => {
  const p = (...ids: string[]) => ({ props: ids.map(id => ({ id })) });
  assert.equal(presetTier(p('world:house_0', 'world:video'), buildingOf), 2);
  assert.equal(presetTier(p('world:house_0', 'expansion:junk-car'), buildingOf), 1, 'the junk car is decor, not a building');
  assert.equal(presetTier(p('expansion:camper'), buildingOf), 0, 'a preset with no building counts as the starter tier');
});

test('the town tier is the lower of the income tier and the home tier', () => {
  assert.equal(incomeTier(0, TIER_TAKINGS), 0);
  assert.equal(incomeTier(4000, TIER_TAKINGS), 1);
  assert.equal(incomeTier(39999, TIER_TAKINGS), 2);
  assert.equal(incomeTier(40000, TIER_TAKINGS), 3);
  assert.equal(townTier(50000, 0, TIER_TAKINGS), 1, 'a caravan home allows the modest tier');
  assert.equal(townTier(0, 2, TIER_TAKINGS), 0, 'no takings: the starter tier, whatever the home');
  assert.equal(townTier(5000, 2, TIER_TAKINGS), 1, 'the range has not earned the house its town');
  assert.equal(townTier(50000, 1, TIER_TAKINGS), 2, 'a cottage allows the town tier');
  assert.equal(townTier(50000, 2, TIER_TAKINGS), 3, 'a house allows the fine tier once the range earns it (the large houses, the casino)');
});

test('a starter-tier lot never composes a tier-2 building', () => {
  const found = buildingsIn({ use: LU.RES, level: LV.BUILT, decline: 0, seed: 0, tier: 0 }, 40);
  for (const id of found) assert.ok(tierOf(id) <= 1, `${id} is tier ${tierOf(id)} on a tier-0 lot`);
});

test('a lot with no tier (an old save) composes as a top-tier lot, as before', () => {
  for (const use of [LU.RES, LU.COM, LU.IND, LU.GOV]) for (let s = 1; s <= 12; s++) {
    const old = compose(lot, { use, level: LV.BUILT, decline: 0, seed: s });
    const top = compose(lot, { use, level: LV.BUILT, decline: 0, seed: s, tier: 3 });
    assert.deepEqual(old, top, `use ${use} seed ${s}`);
  }
});

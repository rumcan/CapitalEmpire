// T295 #2 (#880; the owner, 2026-11-02: "never reuse a commercial building with a name more than twice"): a town's commercial lots show named businesses
// at most twice each, and a second copy only once every allowed business has one (lots/town.ts pickBiz); a lot shows the business it was given (compose.ts
// shopPlan, LotState.biz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap, type Lot } from '../src/game/lots/lots';
import { LU, LV, Town, type LotState } from '../src/game/lots/town';
import { SHOP_PALETTE } from '../src/game/lots/variety';
import { compose, setGeneratedLots, setLotPresets, type ComposeState } from '../src/game/lots/compose';
import { parsePresets } from '../src/game/lots/presets';
import PRESET_FIXTURE from './fixtures/lot-presets.json';

setGeneratedLots(false);
{ const f = parsePresets(PRESET_FIXTURE); setLotPresets(f.presets, f.meta); }
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const O = 40, STEP = 40, N = 10, at = (k: number) => O + k * STEP, last = at(N - 1);
const ENTRY = { x: O, y: O };
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

/** the lots of a 10 x 10 grid of streets (a LotMap over the network) */
function gridLots(): { lm: LotMap; lots: Lot[] } {
  const e = new NetEditor(new RoadNetwork());
  for (let k = 0; k < N; k++) {
    e.addLegs([leg(O, at(k), last, at(k))], CLASS.street, 0);
    e.addLegs([leg(at(k), O, at(k), last)], CLASS.street, 0);
  }
  e.commit();
  const lm = new LotMap(); const r = lm.update(e.net, null);
  return { lm, lots: r.added };
}
/** the town's business counts over its standing lots (the commercial ones with a business) */
const counts = (town: Town) => { const m = new Map<string, number>(); for (const s of town.states.values()) if (s.biz !== undefined && s.level !== LV.EMPTY) m.set(s.biz, (m.get(s.biz) ?? 0) + 1); return m; };
/** the internals a test drives: a lot's state change, as the game makes it (Town.set) */
const driver = (town: Town) => town as unknown as { set(s: LotState, use: number, level: number, decline: number, T: number): void };

test('the commercial lots of a town show each named business at most twice, and a third only after the others have two', () => {
  const { lots } = gridLots();
  const town = new Town(7); town.onLots(lots, []);
  const pool = SHOP_PALETTE.length;
  // (the 8 businesses of the palette, two each: the first 16 commercial lots)
  const coms = lots.slice(0, 30).map(l => town.states.get(l.key)!);
  assert.ok(coms.length === 30, 'the grid has 30 lots');
  for (let i = 0; i < 2 * pool; i++) {
    driver(town).set(coms[i]!, LU.COM, LV.BUILDING, 0, 0);
    for (const [, n] of counts(town)) assert.ok(n <= 2, 'no business has more than two lots');
    // the first eight lots show eight businesses: no second copy while one is still unused
    if (i < pool) assert.equal(counts(town).size, i + 1, `lot ${i + 1} shows a new business`);
  }
  const c16 = counts(town);
  assert.equal(c16.size, pool, 'every business shows');
  for (const id of SHOP_PALETTE) assert.equal(c16.get(id), 2, `${id} has its two lots`);
  // the 17th to the 30th: the businesses go on in turn, the fewest first, so no business passes the others by more than one
  for (let i = 2 * pool; i < coms.length; i++) {
    driver(town).set(coms[i]!, LU.COM, LV.BUILDING, 0, 0);
    const c = counts(town); const max = Math.max(...c.values()), min = Math.min(...c.values());
    assert.ok(max - min <= 1, 'the businesses stay within one of each other');
  }
  assert.equal(counts(town).size, pool);
});

test('clearing a commercial lot frees its business for the next one', () => {
  const { lots } = gridLots();
  const town = new Town(9); town.onLots(lots, []);
  const k = lots[0]!.key, s = town.states.get(k)!;
  driver(town).set(s, LU.COM, LV.BUILDING, 0, 0);
  const first = s.biz;
  assert.ok(first !== undefined && SHOP_PALETTE.includes(first), 'a new commercial lot shows a palette business');
  town.clear(k);
  assert.equal(s.biz, undefined, 'a cleared lot shows none');
  assert.equal(counts(town).get(first!) ?? 0, 0, 'its business is free again');
});

test('a tier-0 town zones no commercial or tourist lots; a tier-3 town does', () => {
  const run = (tier: number) => {
    const { lm, lots } = gridLots();
    const town = new Town(21); town.onLots(lots, []); town.tier = tier;
    const ctx = { lots: lm, entry: ENTRY, reachable: () => true, water: () => 200 };
    for (let h = 1; h <= 24 * 6; h++) town.tick(h * 60, ctx);
    const uses = new Set<number>(); for (const s of town.states.values()) if (s.level !== LV.EMPTY) uses.add(s.use);
    return uses;
  };
  const starter = run(0);
  assert.ok(!starter.has(LU.COM) && !starter.has(LU.TOUR), 'no shop or tourist lot at tier 0');
  assert.ok(starter.has(LU.RES), 'the houses still grow');
  assert.ok(run(3).has(LU.COM), 'a tier-3 town builds shops');
});

test('a residential lot shows no business; a restored lot with a business keeps it', () => {
  const { lots } = gridLots();
  const town = new Town(11); town.onLots(lots, []);
  const r = town.states.get(lots[0]!.key)!, c = town.states.get(lots[1]!.key)!;
  driver(town).set(r, LU.RES, LV.BUILDING, 0, 0);
  assert.equal(r.biz, undefined);
  const back = new Town(11); back.onLots(lots, []);
  back.restore([[lots[1]!.key, LU.COM, LV.BUILT, 0, c.seed, 0, 3, 'world:video']], 0);
  assert.equal(back.states.get(lots[1]!.key)!.biz, 'world:video');
  assert.equal(counts(back).get('world:video'), 1, 'the restored business is counted');
});

test('a commercial lot shows the business it is given', () => {
  const { lots } = gridLots();
  const lot = lots[0]!;
  const st: ComposeState = { use: LU.COM, level: LV.BUILT, decline: 0, seed: 50, tier: 3, biz: 'town:bakery' }; // (a seed of 15 or more: a seed under 15 of 100 is a car park, compose.ts isCarPark)
  const props = compose(lot, st).props.map(p => p.id);
  assert.ok(props.some(id => id.includes('town:bakery')), `the bakery is drawn: ${props.join(', ')}`);
});

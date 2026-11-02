// T295 #3 (#880; the owner, 2026-11-02: "I also hardly ever see the school and points of interest like the fire station"): the civic places a town gets by its
// population (config.ts CIVIC, lots/town.ts civicNext, placeGov), one each, and drawn as their building on a GOV lot (compose.ts civicPlan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap, type Lot } from '../src/game/lots/lots';
import { LU, LV, Town, type LotState, type TownCtx } from '../src/game/lots/town';
import { CIVIC } from '../src/game/event/config';
import { lotPreset, setGeneratedLots, setLotPresets } from '../src/game/lots/compose';
import { parsePresets } from '../src/game/lots/presets';
import PRESET_FIXTURE from './fixtures/lot-presets.json';

setGeneratedLots(false);
{ const f = parsePresets(PRESET_FIXTURE); setLotPresets(f.presets, f.meta); }
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const HOUR = 60;
/** the fire station: its id has no library picture (it is drawn as the post office, as the game has always drawn it): the presets hold it */
const FIRE = 'town:firestation';
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
const ctxOf = (lm: LotMap): TownCtx => ({ lots: lm, entry: ENTRY, reachable: () => true, water: () => 200 });
const driver = (town: Town) => town as unknown as { set(s: LotState, use: number, level: number, decline: number, T: number): void };

test('a town grown past 600 has the fire station and both schools, one each', () => {
  const { lm, lots } = gridLots();
  const town = new Town(13); town.onLots(lots, []);
  // 130 upgraded houses (5 residents each): 650 residents, past the fire station (150), the primary school (300) and the school (600), not the post office (900)
  for (let i = 0; i < 130; i++) driver(town).set(town.states.get(lots[i]!.key)!, LU.RES, LV.UPGRADED, 0, 0);
  assert.ok(town.pop >= 600 && town.pop < 900, `the town has ${town.pop} residents`);
  const ctx = ctxOf(lm);
  for (let h = 1; h <= 6; h++) town.tick(h * HOUR, ctx);
  for (let h = 7; h <= 40; h++) town.tick(h * HOUR, ctx); // and they stay one each
  const placed = (id: string) => [...town.states.values()].filter(s => s.biz === id && s.level !== LV.EMPTY);
  for (const c of CIVIC.filter(c => c.pop <= 600)) {
    assert.equal(placed(c.id).length, 1, `${c.id} stands once`);
    assert.equal(placed(c.id)[0]!.use, LU.GOV, `${c.id} is a civic lot`);
  }
  assert.equal(placed(FIRE).length, 1);
  assert.equal(placed('world:school').length, 1);
  assert.equal(placed('world:primary_school').length, 1);
  assert.equal(placed(CIVIC.find(c => c.pop > 600)!.id).length, 0, 'a place past the population is not yet placed');
});

test('a civic lot shows its place: the preset it draws holds the fire station, the school or the primary school', () => {
  const { lots } = gridLots();
  const lot = { ...lots[0]!, w: 14, d: 18 }; // (a lot the civic places fit: CIVIC_AREA)
  for (const id of [FIRE, 'world:school', 'world:primary_school']) {
    let hit = 0;
    for (let seed = 1; seed <= 30; seed++) if (lotPreset(lot, { use: LU.GOV, level: LV.BUILT, decline: 0, seed, biz: id })?.preset.props.some(p => p.id === id)) hit++;
    assert.ok(hit > 0, `${id} is on some civic lots`);
  }
});

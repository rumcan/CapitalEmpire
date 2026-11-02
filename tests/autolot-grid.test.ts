// T305 (#890, stage 2): a grid of streets on the map's diagonals (screen-straight: vertical and horizontal on screen) fills with generated lots. Every
// lot of the grid composes with a whole preset (lotPreset: none null, none green), its main house faces its street on the screen-axis view, the
// temporary rule is gone (a house is laid on a screen-straight street), and the big lots of the grid are generated (isBigLot), not preset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap, type Lot } from '../src/game/lots/lots';
import { lotPreset, setGeneratedLots, setLotPresets, type ComposeState } from '../src/game/lots/compose';
import { isBigLot } from '../src/game/lots/autolot';
import { roleOf } from '../src/game/lots/groups';
import { roadOf, screenStraight } from '../src/game/lots/preset-frame';
import { roadView } from '../src/game/lots/preset-art';
import { LU, LV } from '../src/game/lots/town';
import { isBuilding } from '../src/game/mirror';
import { LIBRARY } from '../src/game/library';
import { parsePresets } from '../src/game/lots/presets';
import PRESET_FIXTURE from './fixtures/lot-presets.json';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough (lots.test.ts)
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

setGeneratedLots(false);
setLotPresets(parsePresets(PRESET_FIXTURE).presets);
const byId = new Map(LIBRARY.map(it => [it.id, it] as const));

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** streets on the map's diagonals: lines of constant x - y (every D0 tiles, running along (1, 1)) and of constant x + y (running along (1, -1)),
 *  over a square of the map; the blocks between them are the screen-straight lots */
function diagonalGrid(e: NetEditor, D0 = 40, n = 4) {
  const C = 600, span = 150;
  for (let k = -n; k <= n; k++) {
    const c = k * D0;   // x - y = c: points (c + t, t)
    e.addLegs([leg(c + C - span, C - span, c + C + span, C + span)], CLASS.street, 0);
  }
  for (let m = -n; m <= n; m++) {
    const s = 2 * C + m * D0;   // x + y = s: points (s - t, t)
    e.addLegs([leg(s - (C - span), C - span, s - (C + span), C + span)], CLASS.street, 0);
  }
  e.commit();
}

test('a grid of diagonal streets: every lot composes with a whole preset (none null), the big ones are generated, the houses face their streets', () => {
  const e = new NetEditor(new RoadNetwork()); diagonalGrid(e);
  const lm = new LotMap(); lm.update(e.net, null);
  const lots: Lot[] = [...lm.lots.values()];
  assert.ok(lots.length >= 20, `only ${lots.length} lots on the grid`);
  let screen = 0, generated = 0, big = 0, houses = 0, faced = 0;
  lots.forEach((lot, i) => {
    const st: ComposeState = { use: LU.RES, level: LV.BUILT, decline: 0, seed: 4000 + i * 17, tier: 3 };
    const r = lotPreset(lot, st);
    assert.ok(r, `lot ${lot.key} (${lot.w.toFixed(1)} x ${lot.d.toFixed(1)}) has no preset: none for it on a screen-straight road`);
    const road = roadOf(lot.n);
    if (!screenStraight(road)) return;
    screen++;
    assert.ok(r.preset.whole, `${lot.key} on road ${road} is not a generated lot`);
    if (isBigLot(lot)) { big++; generated++; }
    // the main house: the widest building of the lot; it faces the street on its screen-axis view (view 0 turned to the street)
    const bs = r.fit.props.filter(q => { const it = byId.get(q.id); return it && isBuilding(it) && roleOf(q.id) === 'house'; });
    if (bs.length) { houses++; if (roadView(bs[0]!.id, road, 0) !== null || roadView(bs[0]!.id, road, bs[0]!.view) !== null) faced++; }
  });
  console.log(`diagonal grid: ${lots.length} lots, ${screen} screen-straight, ${big} big (generated), ${houses} with a house, ${faced} faced`);
  assert.ok(screen > 0, 'the grid has no screen-straight lots');
  assert.equal(generated, big);
  assert.ok(houses >= Math.floor(screen * 0.6), `only ${houses} of ${screen} screen-straight lots show a house`);
  assert.equal(faced, houses, 'a house does not face its street');
});

test('the same grid twice: the same lots, the same props (a second compose is identical)', () => {
  const build = () => { const e = new NetEditor(new RoadNetwork()); diagonalGrid(e); const lm = new LotMap(); lm.update(e.net, null); return [...lm.lots.values()]; };
  const a = build(), b = build();
  assert.equal(a.length, b.length);
  a.forEach((lot, i) => {
    const st: ComposeState = { use: LU.RES, level: LV.BUILT, decline: 0, seed: 4000 + i * 17, tier: 3 };
    assert.equal(JSON.stringify(lotPreset(lot, st)!.fit.props), JSON.stringify(lotPreset(b[i]!, st)!.fit.props));
  });
});

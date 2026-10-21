// Headless tests of town commercial and industrial districts (lots/districts.ts, G6R.7): npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoadNetwork, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { CLASS } from '../src/game/network';
import { LotMap } from '../src/game/lots/lots';
import { LU, LV, Town, type TownCtx } from '../src/game/lots/town';
import { townGrid, TOWN_BLOCKS } from '../src/game/lots/seedtowns';
import { inCommercial, inIndustrial, industrialRect } from '../src/game/lots/districts';
import { TC } from '../src/game/terrain/types';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

function buildSeededTown(centre?: Pt) {
  const c = centre ?? { x: 1000, y: 1000 };
  const e = new NetEditor(new RoadNetwork()); e.net.paintData = false;
  const g = townGrid(c, TOWN_BLOCKS, () => TC.GROUND);
  e.addLegs(g.legs.filter((_, k) => g.cls[k] === 'street'), CLASS.street, 0);
  e.addLegs(g.legs.filter((_, k) => g.cls[k] === 'avenue'), CLASS.avenue, 0);
  e.commit();
  const lm = new LotMap(); const r = lm.update(e.net, null);
  return { net: e.net, lm, lots: r.added, centre: c };
}

test('districts: pure geometry functions inCommercial and industrialRect', () => {
  const c = { x: 1000, y: 1000 }, entry = { x: 500, y: 500 };
  const indR = industrialRect(c, entry, TOWN_BLOCKS);
  // corner nearest (500, 500) must be the top-left corner
  assert.equal(indR[0] < c.x, true);
  assert.equal(indR[1] < c.y, true);
  assert.equal(indR[2], 80);
  assert.equal(indR[3], 80);
  assert.equal(inIndustrial({ x: indR[0] + 10, y: indR[1] + 10 }, indR), true);
  assert.equal(inIndustrial({ x: c.x, y: c.y }, indR), false);

  assert.equal(inCommercial({ x: c.x + 20, y: c.y + 20 }, 'avenue', c), true);
  assert.equal(inCommercial({ x: c.x + 20, y: c.y + 20 }, 'gravel', c), false);
  assert.equal(inCommercial({ x: c.x + 150, y: c.y + 150 }, 'avenue', c), false);
});

test('districts: after growing a test town, commercial district is COM or GOV, industrial rect is IND, 0 IND outside, and outside COM <= 25% of all COM', () => {
  const { lm, lots, centre } = buildSeededTown({ x: 1000, y: 1000 });
  const entry = { x: 800, y: 800 };
  const ctx: TownCtx = { lots: lm, entry, reachable: () => true, water: () => 200 };
  const town = new Town(42);
  town.setCentres([centre]);
  town.onLots(lots, []);

  // Stamp town to 1000 residents as done in a new game / test
  town.stamp(ctx, 1000, 0);

  const indR = industrialRect(centre, entry, TOWN_BLOCKS);
  const occupied = [...town.states.values()].filter(s => s.level !== LV.EMPTY);
  assert.ok(occupied.length >= 40, `expected >= 40 occupied lots, got ${occupied.length}`);

  let comTotal = 0, comOutside = 0, indTotal = 0, indInside = 0;
  for (const s of occupied) {
    const l = lm.lots.get(s.key)!;
    const inCom = inCommercial(l.c, l.seg.cls.id, centre);
    const inInd = inIndustrial(l.c, indR);

    if (inCom) {
      assert.ok(s.use === LU.COM || s.use === LU.GOV, `lot ${s.key} in COM district has use ${s.use}`);
    }
    if (inInd) {
      assert.ok(s.use === LU.IND || s.use === LU.GOV, `lot ${s.key} in IND rect has use ${s.use}`);
      if (s.use === LU.IND) indInside++;
    }
    if (s.use === LU.IND) {
      indTotal++;
      assert.ok(inInd, `lot ${s.key} is IND but outside industrial rect`);
    }
    if (s.use === LU.COM) {
      comTotal++;
      if (!inCom) comOutside++;
    }
  }

  assert.ok(indTotal > 0, `expected IND lots, got ${indTotal}`);
  assert.equal(indInside, indTotal, 'every IND lot is inside the industrial rect');
  assert.ok(comTotal > 0, `expected COM lots, got ${comTotal}`);
  const outsideRatio = comOutside / comTotal;
  console.log(`[districts] occupied: ${occupied.length}, IND total: ${indTotal} (all inside), COM total: ${comTotal}, COM outside: ${comOutside} (${(outsideRatio * 100).toFixed(1)}%)`);
  assert.ok(outsideRatio <= 0.25, `COM outside district ${outsideRatio.toFixed(3)} exceeds 25%`);
});

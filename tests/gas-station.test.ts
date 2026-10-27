// T198 (#510; the owner: "gas station preset is broken"): a gas station composes as one (the canopy over its pumps on a clear forecourt at the
// street, the gas shop as the main building, its bays with their wheel stops and cars, the bins and freezer by its door, the service items at its
// back or side), and every generated lot keeps the rules: a canopy, carport or shelter is never the main building, no generated prop or car on
// open paving but along its edges or by a building, wheel stops only with their bays. Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compose, groupBase, lotLayout, lotPreset, lotPresets, PAVING_NEAR, setGeneratedLots, setLotModel, type ComposeState, type LotGeom } from '../src/game/lots/compose';
import { BAY_W, DOOR_ITEMS, GAS_SHOP, SERVICE_ITEMS, WHEEL_STOP, baysOf, gasPlan, isCanopy, isOpenStructure, matchBays } from '../src/game/lots/gas-station';
import { frameHalf } from '../src/game/lots/house-class';
import { LATEST } from '../src/game/lots/lot-models';
import { LIBRARY } from '../src/game/library';
import { isBuilding } from '../src/game/mirror';
import { LU, LV } from '../src/game/lots/town';
import type { LotPreset } from '../src/game/lots/presets';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const BY = new Map(LIBRARY.map(i => [i.id, i]));
const LUOF: Record<string, number> = { com: LU.COM, park: LU.COM, ind: LU.IND, tour: LU.TOUR, civic: LU.GOV };
const frozen = (p: LotPreset) => p.use !== 'res' && p.use !== 'farm' && !p.curated && !p.approved && !p.whole && !p.derived && p.road === undefined;
/** the frozen gas stations: a tour preset whose only building is the canopy */
const GAS = lotPresets().filter(p => frozen(p) && p.use === 'tour' && p.props.some(q => isCanopy(q.id)));
/** a lot drawing preset p (forced), facing n */
const lotOf = (p: LotPreset, i: number, n = { x: 0, y: 1 }): { g: LotGeom; st: ComposeState } => ({
  g: { o: { x: 300 + 60 * (i % 20), y: 300 + 60 * Math.floor(i / 20) }, u: { x: -n.y, y: n.x }, n, w: p.w, d: p.d },
  st: { use: LUOF[p.use]!, level: p.state === 'upgraded' ? LV.UPGRADED : LV.BUILT, decline: p.state === 'declined' ? 2 : 0, seed: i, preset: p.id },
});
const box = (pts: readonly number[]) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i + 1 < pts.length; i += 2) { x0 = Math.min(x0, pts[i]!); x1 = Math.max(x1, pts[i]!); y0 = Math.min(y0, pts[i + 1]!); y1 = Math.max(y1, pts[i + 1]!); } return [x0, y0, x1, y1] as const; };

describe('T198: the gas station and the generated lots\' rules', () => {
  it('1. the frozen gas stations: 39 tour presets whose only building is the canopy (the old composer\'s), every one laid by a plan', () => {
    assert.equal(GAS.length, 39);
    for (const p of GAS) assert.deepEqual(p.props.filter(q => BY.get(q.id) && isBuilding(BY.get(q.id)!)).map(q => q.id), ['ref:building-gas-canopy'], p.id);
    const half = frameHalf({ q: 0, u: { x: 1, y: 0 }, n: { x: 0, y: 1 } });
    for (const p of GAS) {
      const plan = gasPlan(p.w, p.d, p.props.find(q => isCanopy(q.id))!, [GAS_SHOP], half, { fill: 0.5, seed: 1 });
      assert.ok(plan, `${p.id} (${p.w} x ${p.d}) has a plan`);
      assert.equal(plan!.props[plan!.main]!.id, GAS_SHOP, 'the shop is the main building');
      assert.ok(plan!.bays.length >= 2, `${p.id}: two bays at least`);
    }
  });

  it('2. a gas station composes with a shop, its forecourt clear, its wheel stops in their bays, its cars inside them, the service and door items by the shop', () => {
    setGeneratedLots(true); setLotModel(LATEST);
    let n = 0;
    GAS.forEach((p, i) => {
      for (const nn of [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }]) {
        const l = lotOf(p, i, nn), lp = lotPreset(l.g, l.st)!, gb = groupBase(lp), c = compose(l.g, l.st);
        assert.equal(gb.gas, true, `${p.id}: laid as a gas station`);
        assert.equal(gb.base.fit.props[gb.main]!.id, GAS_SHOP, `${p.id}: the shop is the main building`);
        assert.ok(!isOpenStructure(gb.base.fit.props[gb.main]!.id));
        assert.deepEqual(lotLayout(l.g, l.st), [], 'the generator lays nothing on a gas station');
        const ids = c.props.map(q => q.id);
        assert.ok(ids.some(id => /gas-shop/.test(id)), `${p.id}: the shop is drawn`);
        assert.ok(ids.some(id => isCanopy(id)), `${p.id}: the canopy is drawn`);
        for (const id of [...SERVICE_ITEMS, ...DOOR_ITEMS]) assert.ok(ids.includes(id), `${p.id}: ${id} drawn`);
        // in the preset frame: the forecourt (the drive) holds the canopy and nothing else; the stops and cars sit in the bays
        const f = lp.frame, fit = gb.base.fit, drive = fit.patches.find(a => a.kind === 'drive')!, fc = box(drive.pts), bays = baysOf(fit.patches);
        assert.ok(bays.length >= 2);
        const plan = fit.props;
        for (const q of plan) {
          const inFore = q.x > fc[0] + 0.2 && q.x < fc[2] - 0.2 && q.y > fc[1] + 1.4 && q.y < fc[3] - 0.2;
          if (inFore) assert.ok(isCanopy(q.id), `${p.id}: only the canopy stands on the forecourt, not ${q.id}`);
          if (q.id === WHEEL_STOP || /^cars:/.test(q.id)) {
            const bay = bays.find(b => q.x > b.box[0] && q.x < b.box[2] && q.y > b.box[1] - 0.01 && q.y < b.box[3] + 0.01);
            assert.ok(bay, `${p.id}: ${q.id} at (${q.x}, ${q.y}) in a bay`);
            assert.ok(Math.abs(q.x - (bay!.box[0] + bay!.box[2]) / 2) < 1e-6, `${p.id}: ${q.id} centred in its bay`);
            assert.ok(Math.abs(bay!.box[2] - bay!.box[0] - BAY_W) < 1e-6);
          }
        }
        // each bay has its wheel stop; the shop's door items stand before its face, the service items behind or beside it
        for (const b of bays) assert.equal(plan.filter(q => q.id === WHEEL_STOP && q.x > b.box[0] && q.x < b.box[2]).length, 1, `${p.id}: a wheel stop in each bay`);
        const shop = plan[gb.main]!, sh = frameHalf(f)(shop);
        for (const id of DOOR_ITEMS) { const q = plan.find(x => x.id === id)!; assert.ok(q.y < shop.y - sh.hb && q.y > shop.y - sh.hb - 1.2 && Math.abs(q.x - shop.x) < sh.ha + 0.6, `${p.id}: ${id} by the door`); }
        for (const id of SERVICE_ITEMS) { const q = plan.find(x => x.id === id)!; assert.ok(q.y > shop.y + sh.hb - 0.01 || Math.abs(q.x - shop.x) > sh.ha - 0.01, `${p.id}: ${id} at the back or side`); }
        n++;
      }
    });
    assert.equal(n, 39 * 4);
  });

  it('3. a canopy, carport or shelter is never a main building', () => {
    for (const id of ['ref:building-gas-canopy', 'east:ref:building-gas-canopy', 'view:ref:building-gas-canopy:sw', 'world:gazebo', 'town:bus_stop', 'town:phone_booth', 'town:produce_stand', 'ce:parking-kiosk', 'golf:food-tent', 'expansion:backyard-tent']) assert.ok(isOpenStructure(id), id);
    for (const id of [GAS_SHOP, 'town:grocery', 'world:diner', 'world:arcade', 'town:postoffice', 'gen:house-ranch-long', 'expansion:lean-to-shed']) assert.ok(!isOpenStructure(id), id);
    setGeneratedLots(true); setLotModel(LATEST);
    let k = 0;
    for (const p of lotPresets().filter(frozen)) {
      const l = lotOf(p, k++), lp = lotPreset(l.g, l.st); if (!lp) continue;
      const gb = groupBase(lp);
      if (gb.main >= 0) assert.ok(!isOpenStructure(gb.base.fit.props[gb.main]!.id), `${p.id}: ${gb.base.fit.props[gb.main]!.id} is no main building`);
    }
  });

  it('4. no generated prop or car on open paving but along its edges or by a building; no generated wheel stop; no generated car on the bays', () => {
    setGeneratedLots(true); setLotModel(LATEST);
    let laid = 0, k = 0;
    for (const p of lotPresets().filter(frozen)) {
      const l = lotOf(p, k++), L = lotLayout(l.g, l.st); if (!L) continue;
      const lp = lotPreset(l.g, l.st)!, gb = groupBase(lp), half = frameHalf(lp.frame);
      const yards = lp.fit.patches.filter(a => a.kind === 'yard' && ['asphalt', 'concrete', 'slabs', 'paving'].includes(a.tex)).map(a => box(a.pts));
      const builds = gb.base.fit.props.filter(q => BY.get(q.id) && isBuilding(BY.get(q.id)!)).map(q => { const h = half(q); return [q.x - h.ha, q.y - h.hb, q.x + h.ha, q.y + h.hb]; });
      const parks = lp.fit.patches.filter(a => a.kind === 'lot').map(a => box(a.pts)), N = PAVING_NEAR;
      for (const it of L) {
        laid++;
        assert.notEqual(it.id, WHEEL_STOP, `${p.id}: a generated wheel stop`);
        if (it.kind !== 'prop' && it.kind !== 'car') continue;
        const open = yards.some(b => it.x > b[0] + N && it.x < b[2] - N && it.y > b[1] + N && it.y < b[3] - N) && !builds.some(b => it.x >= b[0]! - N && it.x <= b[2]! + N && it.y >= b[1]! - N && it.y <= b[3]! + N);
        assert.ok(!open, `${p.id}: ${it.id} at (${it.x.toFixed(1)}, ${it.y.toFixed(1)}) on open paving`);
        if (it.kind === 'car') { const h = half({ id: it.id, x: 0, y: 0, scale: 1, view: 0 }); assert.ok(!parks.some(b => it.x + h.ha > b[0] && it.x - h.ha < b[2] && it.y + h.hb > b[1] && it.y - h.hb < b[3]), `${p.id}: a generated car on the bays`); }
      }
    }
    assert.ok(laid > 5000, `${laid} items laid`);
  });

  it('5. wheel stops only with their bays: a stop past the bays, or a car across their lines, leaves the base; one in a bay is centred in it', () => {
    const patches = [{ kind: 'lot' as const, tex: 'asphalt', pts: [0, 10, 6, 10, 6, 13, 0, 13], lines: [0, 13, 0, 10.25, 2, 13, 2, 10.25, 4, 13, 4, 10.25, 6, 13, 6, 10.25] }];
    assert.deepEqual(baysOf(patches).map(b => b.box), [[0, 10.25, 2, 13], [2, 10.25, 4, 13], [4, 10.25, 6, 13]]);
    const props = [
      { id: WHEEL_STOP, x: 1.2, y: 12.6, scale: 1, view: 0 as const },        // in bay 0, off its middle: centred
      { id: WHEEL_STOP, x: 8, y: 12.6, scale: 1, view: 0 as const },          // past the bays: dropped
      { id: 'cars:burgundy-wagon:NE', x: 3, y: 11.5, scale: 1, view: 0 as const }, // in bay 1: kept
      { id: 'cars:burgundy-wagon:NE', x: 4.05, y: 11.5, scale: 1, view: 0 as const }, // across the line at x 4: dropped
      { id: 'cars:burgundy-wagon:NE', x: 9, y: 3, scale: 1, view: 0 as const },  // off the car park: kept as it is
      { id: 'town:dumpster', x: 1, y: 5, scale: 1, view: 0 as const },
    ];
    const m = matchBays(props, patches, id => id.startsWith('cars:'));
    assert.deepEqual(m.keep, [0, 2, 4, 5]);
    assert.equal(m.props[0]!.x, 1); assert.equal(m.props[1]!.x, 3); assert.equal(m.props[2]!.x, 9);
  });
});

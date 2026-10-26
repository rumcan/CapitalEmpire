// Unit tests for the lot lab's farm presets (use 'farm'): their file, the approved match to a farm parcel, a preset made from a composed farm
// (preset-from.ts) and its draw back on the parcel (compose.ts), and farmPreset. Headless: npm test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LU, LV } from '../src/game/lots/town';
import { approvedFor, formatPresets, parsePresets, type LotPreset, type Road } from '../src/game/lots/presets';
import { frameOf } from '../src/game/lots/preset-frame';
import { presetFromComposition } from '../src/game/lots/preset-from';
import { compose, farmPreset, setLotPresets, type Placed } from '../src/game/lots/compose';
import { footprintOf } from '../src/game/lots/preset-art';
import { composeFarm, type FarmParcel } from '../src/game/ext/farms/farms';
import { LIBRARY } from '../src/game/library';
import { isBuilding } from '../src/game/mirror';
import PRESET_FIXTURE from './fixtures/lot-presets.json';

// the presets the lots draw from in these tests: the fixture (as lot-presets-lab.test.ts reads it), restored at the end of each test that changes them
const FIXTURE = parsePresets(PRESET_FIXTURE);
setLotPresets(FIXTURE.presets, FIXTURE.meta);

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const BY = new Map(LIBRARY.map(i => [i.id, i]));
const S = Math.SQRT1_2;
/** a farm preset of a road at w x d tiles (approved unless approved is false), with no props */
function farm(id: string, w: number, d: number, road: Road, approved = true): LotPreset {
  return { id, use: 'farm', state: 'built', w, d, props: [], patches: [], road, ...(approved ? { approved: true } : {}) };
}
/** the test parcel: a 50 x 90 farm fronting a road on its -y side (road 0), the lot frame the world's (x along the road, y away from it) */
const PARCEL: FarmParcel = { key: 'test', o: { x: 500, y: 500 }, u: { x: 1, y: 0 }, n: { x: 0, y: -1 }, w: 50, d: 90, side: 1 };
const LOT = { o: PARCEL.o, u: PARCEL.u, n: PARCEL.n, w: PARCEL.w, d: PARCEL.d };

describe('the lot farm presets (use farm)', () => {
  it('1. the file: a farm preset is read and written (use farm), round trips, and an unknown use is still invalid', () => {
    const f: LotPreset = { ...farm('farm-file', 50, 90, 0), props: [{ id: 'world:barn', x: 10, y: 20, scale: 1, view: 0 }], patches: [{ kind: 'yard', tex: 'gravel', pts: [0, 0, 50, 0, 50, 10, 0, 10] }] };
    const text = formatPresets([f]);
    assert.ok(text.includes('"use":"farm"'), text);
    assert.deepEqual(parsePresets(JSON.parse(text)).presets, [f]);
    assert.equal(parsePresets([{ ...f, use: 'farmer' }]).invalid, 1);
  });

  it('2. approvedFor farm: the nearest approved farm preset at the smallest summed gap, however far in size; drafts never; the road tiers as for lots', () => {
    const a = farm('a', 50, 90, 0), b = farm('b', 30, 60, 0), draft = farm('d', 50, 90, 0, false);
    // 20 x 90: a is 30 tiles off in width, b 10 + 30 off; the far one still draws
    assert.deepEqual(approvedFor([a, b, draft], 'farm', 'built', 20, 90, 0), [a]);
    // 40 x 90: a is 10 off, b 40 off
    assert.deepEqual(approvedFor([a, b], 'farm', 'built', 40, 90, 0), [a]);
    // an exact size is its own
    assert.deepEqual(approvedFor([a, b], 'farm', 'built', 30, 60, 0), [b]);
    // a draft is never returned
    assert.deepEqual(approvedFor([draft], 'farm', 'built', 50, 90, 0), []);
    // an even road takes another axis road's farm, an odd road none
    const r2 = farm('r2', 50, 90, 2);
    assert.deepEqual(approvedFor([r2], 'farm', 'built', 50, 90, 0), [r2]);
    assert.deepEqual(approvedFor([r2], 'farm', 'built', 50, 90, 4), [r2]);
    assert.deepEqual(approvedFor([r2], 'farm', 'built', 50, 90, 1), []);
    assert.deepEqual(approvedFor([farm('r1', 50, 90, 1)], 'farm', 'built', 50, 90, 3), []);
    // the one-step cap stays for lots: a residential preset 20 tiles off in width is not a match
    const res: LotPreset = { ...farm('res-far', 30, 60, 0), use: 'res' };
    assert.deepEqual(approvedFor([res], 'res', 'built', 50, 90, 0), []);
  });

  it('3. a composed farm (composeFarm) made into a preset (presetFromComposition) and drawn back on its parcel (compose): inside the lot, library sprites, the same buildings where they stood', () => {
    const seed = 7, c = composeFarm(PARCEL, seed), { props, patches } = presetFromComposition(c, frameOf(LOT), PARCEL.w, PARCEL.d);
    for (const q of props) {
      assert.ok(q.x >= 0 && q.x <= PARCEL.w && q.y >= 0 && q.y <= PARCEL.d, `${q.id} at ${q.x}, ${q.y}`);
      assert.ok(BY.has(q.id), `${q.id} is in the library`);
    }
    for (const a of patches) for (let i = 0; i < a.pts.length; i += 2) assert.ok(a.pts[i]! >= 0 && a.pts[i]! <= PARCEL.w && a.pts[i + 1]! >= 0 && a.pts[i + 1]! <= PARCEL.d, 'a patch point in the lot');
    // a draft (no approved): drawn only because the lot is forced to it
    const id = 'farm-test-7', preset: LotPreset = { id, use: 'farm', state: 'built', w: PARCEL.w, d: PARCEL.d, road: 0, props, patches };
    try {
      setLotPresets([...FIXTURE.presets, preset], FIXTURE.meta);
      const back = compose(LOT, { use: LU.NONE, level: LV.BUILT, decline: 0, seed, preset: id });
      assert.ok(back.props.length >= 0.8 * c.props.length, `${back.props.length} of ${c.props.length} props`);
      const centre = (q: Placed) => { const fp = footprintOf(q.id, q.scale, q.flip); return { x: q.x + (fp[0] + fp[2]) / 2, y: q.y + (fp[1] + fp[3]) / 2 }; };
      const bld = (list: Placed[]) => list.filter(q => { const it = BY.get(q.id)!; return it.cat !== 'Vehicles' && (it.kind === 'house' || isBuilding(it)); }).map(centre);
      const want = bld(c.props), got = bld(back.props);
      assert.ok(want.length >= 2, `a farmhouse and a barn, got ${want.length} buildings`);
      for (const p of want) {
        const near = Math.min(...got.map(g => Math.hypot(g.x - p.x, g.y - p.y)));
        assert.ok(near <= 1.5, `a building at ${p.x}, ${p.y} is ${near} tiles from its composed place`);
      }
    } finally {
      setLotPresets(FIXTURE.presets, FIXTURE.meta);
    }
  });

  it('4. farmPreset: the approved farm preset of a matching parcel, none without one or for a draft; a diagonal parcel takes its own road only; an angled parcel on an even road takes none', () => {
    const ok = farm('farm-ok', PARCEL.w, PARCEL.d, 0), draft = farm('farm-draft', PARCEL.w, PARCEL.d, 0, false);
    try {
      setLotPresets([...FIXTURE.presets, ok], FIXTURE.meta);
      assert.equal(farmPreset(PARCEL)?.id, ok.id);
      setLotPresets([...FIXTURE.presets, draft], FIXTURE.meta);
      assert.equal(farmPreset(PARCEL), null, 'a draft is not drawn');
      setLotPresets(FIXTURE.presets, FIXTURE.meta);
      assert.equal(farmPreset(PARCEL), null, 'none without one');
      // a diagonal parcel (road 1): an approved road-0 farm does not reach it, its own road's does
      const diag: FarmParcel = { ...PARCEL, u: { x: S, y: -S }, n: { x: -S, y: -S } };
      const d1 = farm('farm-diag', PARCEL.w, PARCEL.d, 1);
      setLotPresets([...FIXTURE.presets, ok], FIXTURE.meta);
      assert.equal(farmPreset(diag), null, 'an axis road farm is not turned to a diagonal');
      setLotPresets([...FIXTURE.presets, ok, d1], FIXTURE.meta);
      assert.equal(farmPreset(diag)?.id, d1.id);
      // a parcel 21 degrees off the axis is angled, and on road 0 (even): it takes no preset, though ok is approved for road 0
      const a21 = 21 * Math.PI / 180;
      const tilt: FarmParcel = { ...PARCEL, u: { x: Math.cos(a21), y: Math.sin(a21) }, n: { x: Math.sin(a21), y: -Math.cos(a21) } };
      assert.equal(farmPreset(tilt), null, 'an angled parcel on an even road');
    } finally {
      setLotPresets(FIXTURE.presets, FIXTURE.meta);
    }
  });
});

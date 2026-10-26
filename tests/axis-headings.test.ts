// T154 Phase 2 (#330): the eight-heading contract in the game. On a road at 45 degrees (an odd road) a building with a screen-axis set (a house,
// a shop, an industrial, a parking garage) is drawn in the view whose front faces its street (N on road 1, E on 3, S on 5, W on 7), turned on by
// its own view, never mirrored, its footprint inside the lot; a building without a set, and every lot on an axis road, is drawn as before; a
// stand-in on a 45-degree road prefers a house with a set. Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compose, lotPreset, lotPresets, setLotPresets, type ComposeState, type LotGeom } from '../src/game/lots/compose';
import { axisSetOf, drawnView, footprintOf, ownerScaleOf, roadView, setRoadHeadings, turned } from '../src/game/lots/preset-art';
import { AXIS_HEADING, AXIS_SETS } from '../src/game/axis-library';
import { LIBRARY } from '../src/game/library';
import { isBuilding } from '../src/game/mirror';
import { REACH } from '../src/game/lots/compose-core';
import { frameOf, quarterOfRoad, toFrame } from '../src/game/lots/preset-frame';
import fs from 'node:fs';
import { houseFamily } from '../src/game/lots/house-class';
import { LU, LV } from '../src/game/lots/town';
import type { LotPreset, Road, View } from '../src/game/lots/presets';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const BY = new Map(LIBRARY.map(i => [i.id, i]));
/** the buildings with a screen-axis set */
const SET_BUILDINGS = Object.keys(AXIS_SETS).filter(k => { const it = BY.get(k) ?? BY.get(AXIS_SETS[k]![0]); return !!it && isBuilding(it) && !!axisSetOf(k); });
/** a lot on road r (its front, -n, at r eighth turns from +y toward +x), w x d tiles, the k-th along */
const lotOn = (r: number, w: number, d: number, k = 0): LotGeom => { const a = (r * Math.PI) / 4, n = { x: -Math.sin(a), y: -Math.cos(a) }; return { o: { x: 500 + 60 * k, y: 500 + 60 * r }, u: { x: -n.y, y: n.x }, n, w, d }; };
const BUILT: ComposeState = { use: LU.RES, level: LV.BUILT, decline: 0, seed: 3 };
/** a lot sized for a building: its set's world box, turned, and room round it */
const sizeFor = (id: string) => { const n = AXIS_SETS[id]![0], fp = footprintOf(n, ownerScaleOf(id), false); return Math.ceil((fp[2] - fp[0]) / Math.SQRT2) + 4; };
/** an in-memory preset of one building, front to the street, on road r (never saved) */
const presetOf = (id: string, r: number, view: View = 0): LotPreset => { const s = sizeFor(id); return { id: `t154-${id}-r${r}-v${view}`, use: BY.get(id)?.kind === 'house' ? 'res' : 'com', state: 'built', w: s, d: s, road: r as Road, props: [{ id, x: s / 2, y: s / 2, scale: 1, view }], patches: [] }; };
/** composes a lot drawing a preset (forced, as the lab draws it) */
const drawn = (p: LotPreset, g: LotGeom) => { const was = lotPresets(); setLotPresets([...was, p]); try { return compose(g, { ...BUILT, preset: p.id }); } finally { setLotPresets([...was]); } };

describe('the eight-heading contract: buildings on roads at 45 degrees (T154 Phase 2)', () => {
  it('1. the view per road angle: N on road 1, E on 3, S on 5, W on 7, turned on by the prop\'s view; none on an axis road, a prop or a building with no set', () => {
    assert.ok(SET_BUILDINGS.length >= 14, `${SET_BUILDINGS.length} buildings with a set`);
    for (const id of SET_BUILDINGS) for (const r of [1, 3, 5, 7]) for (const v of [0, 1, 2, 3] as const) {
      const got = roadView(id, r, v)!;
      assert.equal(got, AXIS_SETS[id]![((r - 1) / 2 + v) % 4], `${id} road ${r} view ${v}`);
      assert.equal(AXIS_HEADING[got], 'NESW'[((r - 1) / 2 + v) % 4]);
    }
    for (const r of [0, 2, 4, 6]) assert.equal(roadView('town:bakery', r, 0), null, `axis road ${r}`);
    assert.equal(roadView('world:bench', 1, 0), null, 'a prop keeps its picture');
    assert.equal(roadView('world:house_5', 1, 0), null, 'a building with no set keeps its views');
    // any picture of the subject finds its set: a four-view building's other views, the set's own
    assert.equal(roadView('view:town:bakery:sw', 3, 0), 'view:town:bakery:e');
    assert.equal(roadView('view:world:house_3:w', 1, 0), 'view:world:house_3:n');
  });
  it('2. compose: on every 45-degree road each building with a set is drawn in the view facing its street; with the rule off, as before', () => {
    for (const id of SET_BUILDINGS) for (const r of [1, 3, 5, 7]) {
      const p = presetOf(id, r), g = lotOn(r, p.w, p.d), c = drawn(p, g), want = roadView(id, r, 0)!;
      const b = c.props.find(q => q.from?.preset === p.id);
      assert.ok(b, `${id} on road ${r} is drawn`);
      assert.equal(b!.id, want, `${id} on road ${r}`);
      assert.equal(b!.flip, false, 'never mirrored');
      setRoadHeadings(false);
      const old = drawn(p, g).props.find(q => q.from?.preset === p.id);
      setRoadHeadings(true);
      const t = turned(id, quarterOfRoad(r as Road));
      if (old) assert.equal(old.id, t.id, `${id} on road ${r} without the rule: its turned view`);
    }
  });
  it('3. nothing is mirrored and every footprint stays inside its lot: the turned square of each building facing a 45-degree road', () => {
    for (const id of SET_BUILDINGS) for (const r of [1, 3, 5, 7]) for (const v of [0, 1, 2, 3] as const) {
      const p = presetOf(id, r, v), g = lotOn(r, p.w, p.d, v), b = drawn(p, g).props.find(q => q.from?.preset === p.id)!;
      assert.equal(b.flip, false);
      assert.equal(b.id, roadView(id, r, v));
      const fp = footprintOf(b.id, b.scale, false), mx = b.x + (fp[0] + fp[2]) / 2, my = b.y + (fp[1] + fp[3]) / 2, f = frameOf(g);
      for (const [x, y] of [[mx, b.y + fp[1]], [b.x + fp[2], my], [mx, b.y + fp[3]], [b.x + fp[0], my]] as const) {
        const q = toFrame(f, x, y);
        assert.ok(q.x >= -REACH - 1e-6 && q.x <= g.w + REACH + 1e-6 && q.y >= -REACH - 1e-6 && q.y <= g.d + REACH + 1e-6, `${id} road ${r} view ${v}: corner ${q.x.toFixed(2)}, ${q.y.toFixed(2)} in ${g.w} x ${g.d}`);
      }
    }
  });
  it('4. the owner\'s presets: on a 45-degree road a building with a set faces it (world:house_3 on road 1), one with none is drawn as before; an axis road changes nothing', () => {
    let faced = 0, same = 0, axis = 0;
    for (const p of lotPresets().filter(q => q.road !== undefined && q.approved && q.use !== 'farm')) {
      const g = lotOn(p.road!, p.w, p.d), st: ComposeState = { use: p.use === 'res' ? LU.RES : LU.COM, level: p.state === 'upgraded' ? LV.UPGRADED : LV.BUILT, decline: p.state === 'declined' ? 2 : 0, seed: 5, preset: p.id };
      const now = compose(g, st); setRoadHeadings(false); const old = compose(g, st); setRoadHeadings(true);
      const lp = lotPreset(g, st)!, sets = lp.fit.props.some(q => roadView(q.id, p.road!, q.view));
      if (p.road! % 2 === 0) { assert.deepEqual(now, old, `${p.id}: an axis road draws as before`); axis++; continue; }
      if (!sets) { assert.deepEqual(now, old, `${p.id}: no building with a set, drawn as before`); same++; continue; }
      for (const q of lp.fit.props) { const rv = roadView(q.id, p.road!, q.view); if (rv) { assert.ok(now.props.some(x => x.id === rv && !x.flip), `${p.id}: ${q.id} faces road ${p.road} as ${rv}`); faced++; } }
    }
    assert.ok(faced >= 1 && same > 5 && axis > 5, `faced ${faced}, unchanged ${same}, axis ${axis}`);
  });
  it('5. drawnView and the frame: a building facing a 45-degree road takes the square inside its world box as its half extents; otherwise turned', () => {
    const g = lotOn(1, 12, 12), f = frameOf(g), t = drawnView('town:bakery', f, 0);
    assert.deepEqual(t, { id: 'view:town:bakery:n', flip: false, diag: true });
    const a = lotOn(0, 12, 12), fa = frameOf(a);
    assert.deepEqual(drawnView('town:bakery', fa, 0), { ...turned('town:bakery', fa.q), diag: false });
  });
  it('6. a stand-in on a 45-degree road prefers a house with a set (it faces the road), within the frontage fit; on an axis road any dwelling', (t) => {
    // a preset placing the rundown house the owner removed (T167: a stand-in takes its place)
    const gone = 'variation:expansion-rundown-house-a7c17683-plain-corner:1', removed = JSON.parse(fs.readFileSync('scripts/assets/removed.json', 'utf8')) as Record<string, unknown>;
    if (!(gone in removed)) { t.skip('the rundown house is no longer removed'); return; }
    for (const r of [0, 1, 2, 3, 5, 7]) {
      const p: LotPreset = { id: `t154-standin-r${r}`, use: 'res', state: 'built', w: 12, d: 16, road: r as Road, props: [{ id: gone, x: 6, y: 7, scale: 1, view: 0 }], patches: [] };
      const was = lotPresets(); setLotPresets([...was, p]);
      try {
        const g = lotOn(r, p.w, p.d), st: ComposeState = { ...BUILT, preset: p.id }, lp = lotPreset(g, st)!, i = lp.fit.standIn?.findIndex(Boolean) ?? -1;
        assert.ok(i >= 0, `road ${r}: a stand-in`);
        const id = lp.fit.props[i]!.id;
        assert.equal(houseFamily(id), 'dwelling');
        if (r % 2) {
          assert.ok(roadView(id, r, 0), `road ${r}: ${id} has a set`);
          assert.equal(compose(g, st).props.find(q => q.standIn)?.id, roadView(id, r, 0), `road ${r}: it faces the road`);
        }
      } finally { setLotPresets([...was]); }
    }
  });
});

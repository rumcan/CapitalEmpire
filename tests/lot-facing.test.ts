// T308 (#893): every building on a lot faces its road (compose.ts faceStreet), and a car on a lot is drawn at the road cars' size (atRoadSize, the
// fit of a car in autolot and the remix). Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lotPreset, lotPresets, setLotRemix, type ComposeState, type LotGeom } from '../src/game/lots/compose';
import { LU, LV } from '../src/game/lots/town';
import { axisSetOf, drawnView, eightRingOf, faces, fourViews, isVehicle, ownerScaleOf } from '../src/game/lots/preset-art';
import { roadOf } from '../src/game/lots/preset-frame';
import { CAR_SCALE, carModel, carOwnerScale } from '../src/game/ext/car-art';
import { LIBRARY } from '../src/game/library';
import { roleOf } from '../src/game/lots/groups';
import { isBuilding } from '../src/game/mirror';
import type { Road } from '../src/game/lots/presets';

// the remix has its own tests (lot-remix.test.ts): these pin the facing and the car sizes of the composed preset
setLotRemix(false);
const BY = new Map(LIBRARY.map(i => [i.id, i] as const));
const ALL: Road[] = [0, 1, 2, 3, 4, 5, 6, 7];

/** a lot whose street lies along -n on road r (presets.ts Road: roadOf reads r back from n) */
function lotOn(road: number, w: number, d: number): LotGeom {
  const a = road * Math.PI / 4, n = { x: -Math.sin(a), y: -Math.cos(a) };
  return { o: { x: 0, y: 0 }, u: { x: -n.y, y: n.x }, n, w, d };
}
/** the four-view index (NE, SE, SW, NW: the front facing +y, +x, -y, -x) of the street on an angled road: the lot's -n by its larger axis */
const streetQuarter = (lot: LotGeom): number => { const x = -lot.n.x, y = -lot.n.y; return Math.abs(y) >= Math.abs(x) ? (y > 0 ? 0 : 2) : (x > 0 ? 1 : 3); };
/** a main building (house, building, venue) or a garage or shed: the buildings that face the street */
const streetBuilding = (id: string): boolean => { const it = BY.get(id); return !!it && isBuilding(it) && (it.kind === 'house' || it.kind === 'building' || it.kind === 'venue' || roleOf(id) === 'garage' || roleOf(id) === 'shed'); };
/** the presets the game draws on a lot of their use: the frozen ones (on every heading) and the approved lab ones (on their own road) */
const drawnPresets = () => lotPresets().filter(p => (p.use === 'res' || p.use === 'com') && (p.road === undefined || p.approved === true));

test('every building of a res or com preset faces its street on each road heading (T308)', () => {
  let main = 0, kept = 0;
  for (const p of drawnPresets()) {
    const roads = p.road !== undefined ? [p.road] : ALL;
    for (const road of roads) {
      const lot = lotOn(road, p.w, p.d), st: ComposeState = { use: p.use === 'res' ? LU.RES : LU.COM, level: LV.BUILT, decline: 0, seed: 7, preset: p.id };
      const lp = lotPreset(lot, st);
      assert.ok(lp, `${p.id} on road ${road} draws`);
      const { fit, frame } = lp;
      assert.equal(roadOf(lot.n), road, 'the lot is on its road');
      let keptHere = 0;
      for (const q of fit.props) {
        if (!streetBuilding(q.id) || !faces(q.id, road)) continue;
        main++;
        if (q.view !== 0) { keptHere++; continue; }
        const drawn = drawnView(q.id, frame, q.view).id, where = `${p.id} road ${road} ${q.id} at (${q.x.toFixed(1)}, ${q.y.toFixed(1)})`;
        if (road % 2) {
          // a screen-straight road: the screen-axis set, its member facing the street is (road - 1) / 2 (roadView: road 1 faces screen down);
          // T375: a building with no old set but eight approved views (the Video Vault, the Arcade): the ring's place of the road
          const set = axisSetOf(q.id);
          if (set) assert.equal(set.indexOf(drawn), (road - 1) / 2, `${where}: the straight-on view faces the street`);
          else assert.equal(eightRingOf(q.id)?.indexOf(drawn), road, `${where}: the 8-degree view faces the street`);
        } else {
          // an angled road: the corner view whose front faces the lot's street
          assert.equal(fourViews(q.id)?.views.indexOf(drawn), streetQuarter(lot), `${where}: the corner view faces the street`);
        }
      }
      // a building kept on its preset's view is counted once (Fitted.facing, the lot lab's "kept facing")
      assert.equal(keptHere, fit.facing ?? 0, `${p.id} road ${road}: the kept count`);
      kept += keptHere;
    }
  }
  assert.ok(main > 0, 'the presets have buildings that face a street');
  console.log(`T308 facing: ${main} street-facing buildings on road headings, kept for overlap or the lot's edge: ${kept} (${(100 * kept / main).toFixed(1)}%)`);
});

test('a car on a lot is drawn at the road cars\' size (T308)', () => {
  let cars = 0;
  for (const p of drawnPresets()) {
    for (const road of p.road !== undefined ? [p.road] : ALL) {
      const lp = lotPreset(lotOn(road, p.w, p.d), { use: p.use === 'res' ? LU.RES : LU.COM, level: LV.BUILT, decline: 0, seed: 7, preset: p.id });
      for (const q of lp?.fit.props ?? []) {
        if (!isVehicle(q.id) || !q.id.startsWith('cars:')) continue;
        const roadCar = `${carModel(q.id)}:N`;
        if (!BY.has(roadCar)) continue;
        cars++;
        const drawn = CAR_SCALE * q.scale * ownerScaleOf(q.id), road = CAR_SCALE * carOwnerScale(roadCar);
        assert.equal(q.scale, 1, `${p.id} ${q.id} is at its road size`);
        assert.ok(Math.abs(drawn - road) <= 0.02 * road, `${p.id} ${q.id}: drawn ${drawn.toFixed(3)} against the road car ${road.toFixed(3)}`);
      }
    }
  }
  assert.ok(cars > 0, 'the presets have parked cars of a road model');
  console.log(`T308 cars: ${cars}`);
});

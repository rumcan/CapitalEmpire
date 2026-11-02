// T305 (#890): the generated lots (src/game/lots/autolot.ts). Every template on the four screen-straight headings (odd roads) and the two diagonal
// ones (even roads): the props lie inside the lot, no two pieces overlap beyond the composer's OVERLAP, the main building is there and faces the street
// (its screen-axis view on a screen-straight road, its four views turned on the others), and the same inputs give the same lot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLot, templateOf, AUTO_TEMPLATES, type AutoTemplate } from '../src/game/lots/autolot';
import { frameHalf } from '../src/game/lots/house-class';
import { frameOf, type PresetFrame } from '../src/game/lots/preset-frame';
import { OVERLAP, share, type Box4, type LotGeom } from '../src/game/lots/compose-core';
import { roadView, turned } from '../src/game/lots/preset-art';
import { isBuilding } from '../src/game/mirror';
import { LIBRARY } from '../src/game/library';
import { roadOf } from '../src/game/lots/preset-frame';
import type { Road } from '../src/game/lots/presets';
import { buildGroups } from '../src/game/lots/groups';
import { parsePresets } from '../src/game/lots/presets';
import PRESET_FIXTURE from './fixtures/lot-presets.json';

// the groups are learned from the presets (compose.ts does this on load in the game; the test loads the fixture the same way)
buildGroups(parsePresets(PRESET_FIXTURE).presets);

const byId = new Map(LIBRARY.map(it => [it.id, it] as const));
/** a lot of w x d tiles on road r: its away vector n points at the angle r eighths (roadOf reads it back) */
function lotOn(r: number, w: number, d: number): LotGeom {
  const t = r * Math.PI / 4, n = { x: -Math.sin(t), y: -Math.cos(t) }, u = { x: Math.cos(t), y: -Math.sin(t) };
  return { o: { x: 300, y: 300 }, u, n, w, d };
}
/** the headings under test: the four screen-straight roads (1, 3, 5, 7) and two diagonals (0, 2) */
const ROADS: Road[] = [1, 3, 5, 7, 0, 2];
/** each template's lot size (tiles): a house and a shop a 16-tile frontage, the yards 20 to 30 deep */
const SIZE: Record<AutoTemplate, [number, number]> = { house: [16, 20], corner: [16, 20], trailer: [20, 30], junk: [20, 20], shop: [20, 16] };
const FENCE = /fence|chainlink/;
/** a piece's box in the preset frame (x along the street, y away from it) */
const boxes = (f: PresetFrame, props: { id: string; x: number; y: number; scale: number; view: number }[]): (Box4 & { id: string })[] => props.map(q => {
  const h = frameHalf(f)(q as never); return Object.assign([q.x - h.ha, q.y - h.hb, q.x + h.ha, q.y + h.hb] as Box4, { id: q.id });
});

test('every template on the four screen-straight headings and two diagonals: inside the lot, no overlap beyond OVERLAP, the main building faces the street', () => {
  let made = 0;
  for (const t of AUTO_TEMPLATES) for (const r of ROADS) {
    const [w, d] = SIZE[t], lot = lotOn(r, w, d), p = autoLot(lot, t === 'shop' ? 'com' : t === 'junk' ? 'ind' : 'res', t === 'trailer' ? 0 : 2, 7 + r, 'built', t);
    assert.ok(p, `${t} on road ${r} is null`);
    made++;
    assert.equal(roadOf(lot.n), r, 'the test lot is on its road');
    const f = frameOf(lot), bx = boxes(f, p.props);
    bx.forEach((b, k) => {
      if (FENCE.test(b.id)) return;
      assert.ok(b[0] >= -1e-6 && b[2] <= w + 1e-6 && b[1] >= -1.5 - 1e-6 && b[3] <= d + 1e-6, `${t} r${r}: ${b.id} leaves the lot ${b.map(v => v.toFixed(2))}`);
      for (let j = k + 1; j < bx.length; j++) {
        const o = bx[j]!;
        if (FENCE.test(o.id)) continue;
        assert.ok(share(b, o) <= OVERLAP + 1e-9, `${t} r${r}: ${b.id} overlaps ${o.id} (${share(b, o).toFixed(2)})`);
      }
    });
    const buildings = p.props.filter(q => isBuilding(byId.get(q.id)!));
    if (t === 'house' || t === 'corner') assert.ok(buildings.length >= 1, `${t} r${r} has no main building`);
    // every building faces the street: screen-straight roads take the screen-axis view (view 0 turned to the street), the others four views turned
    for (const q of buildings) {
      if (r % 2) assert.ok(roadView(q.id, r, 0) !== null, `${q.id} on screen-straight road ${r} has no axis view`);
      else assert.notEqual(turned(q.id, 1).id, q.id, `${q.id} on road ${r} is not turned to the street`);
    }
    // the same inputs give the same lot (the cache aside, the generator is seeded from the lot's own draws)
    assert.deepEqual(autoLot(lot, t === 'shop' ? 'com' : t === 'junk' ? 'ind' : 'res', t === 'trailer' ? 0 : 2, 7 + r, 'built', t), p);
  }
  assert.equal(made, AUTO_TEMPLATES.length * ROADS.length);
});

test('the templates by use and tier: a starter res lot sometimes gets a trailer park; a park or a tour lot gets none', () => {
  let trailers = 0;
  for (let s = 0; s < 40; s++) if (templateOf('res', 0, s) === 'trailer') trailers++;
  assert.ok(trailers > 0 && trailers < 40, 'the starter res lots show trailer parks and houses');
  assert.equal(templateOf('res', 2, 0) === 'trailer', false, 'no trailer park above the starter tier');
  assert.equal(templateOf('park', 0, 1), null);
  assert.equal(templateOf('tour', 1, 1), null);
  assert.equal(templateOf('civic', 1, 1), null);
  assert.equal(templateOf('ind', 1, 1), 'junk');
  assert.equal(templateOf('com', 0, 1), 'shop');
});

test('a lot too small for its template is a plot (fence and planting), never a lot off its ground; no template is no lot', () => {
  const p = autoLot(lotOn(1, 6, 6), 'res', 2, 5, 'built', 'junk');
  assert.ok(p && p.props.length > 0, 'a 6-tile lot is left bare');
  assert.ok(p.props.every(q => q.x >= -1e-6 && q.x <= 6 + 1e-6 && q.y <= 6 + 1e-6), 'a junk yard in a 6-tile lot leaves its lot');
  assert.equal(autoLot(lotOn(1, 16, 20), 'res', 2, 5, 'built', null), null, 'no template, no lot');
});

test('the lot is the same for the same seed and differs for another (the house and its garage change)', () => {
  const lot = lotOn(3, 16, 22), a = autoLot(lot, 'res', 2, 11, 'built', 'house'), b = autoLot(lot, 'res', 2, 11 + 1000, 'built', 'house');
  assert.ok(a && b);
  assert.equal(JSON.stringify(autoLot(lot, 'res', 2, 11, 'built', 'house')), JSON.stringify(a));
  assert.notEqual(JSON.stringify(a.props), JSON.stringify(b.props), 'two seeds laid the same house');
});

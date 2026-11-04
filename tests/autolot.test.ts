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
const SIZE: Record<AutoTemplate, [number, number]> = { house: [16, 20], corner: [16, 20], trailer: [20, 30], junk: [20, 20], shop: [20, 16], centre: [36, 20] };
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

// T305 (#881, #890): the shop's car park: each bay 1.1 to 1.5 times the length and width of the car in it, the car centred in its bay and pointing along the
// bay's axis (its heading within 22.5 degrees of the lot's away vector, nose out or in), the painted bay lines on the car park patch only.
test('the car park: every bay 1.1 to 1.5 times its car, each car centred in its bay and along the bay axis (within 22.5 degrees)', async () => {
  const { turned } = await import('../src/game/lots/preset-art');
  const { CAR_DIRECTIONS, carHeading } = await import('../src/game/ext/car-art');
  let bays = 0;
  for (const r of ROADS) for (let s = 0; s < 6; s++) {
    const lot = lotOn(r, 20, 16), p = autoLot(lot, 'com', 2, 31 + s * 7 + r, 'built', 'shop');
    assert.ok(p, `shop on road ${r} seed ${s} is null`);
    const f = frameOf(lot), lot2 = p.patches.find(a => a.kind === 'lot' && a.lines);
    if (!lot2) continue;   // no car park here (the shop front alone)
    const ln = lot2.lines!, bw = ln[4]! - ln[0]!, ye = ln[3]!;
    for (const q of p.props.filter(x => x.id.startsWith('cars:'))) {
      bays++;
      const h = frameHalf(f)(q), bl = ye - 3;
      assert.ok(bw / (2 * h.ha) >= 1.1 - 1e-6 && bw / (2 * h.ha) <= 1.5 + 1e-6, `r${r}: bay ${bw.toFixed(2)} vs car ${(2 * h.ha).toFixed(2)} wide`);
      assert.ok(bl / (2 * h.hb) >= 1.1 - 1e-6 && bl / (2 * h.hb) <= 1.5 + 1e-6, `r${r}: bay ${bl.toFixed(2)} vs car ${(2 * h.hb).toFixed(2)} long`);
      // centred: its centre lies on the bay's middle line (a bay of ln[0] + k * bw), at the bay's middle depth
      const k = Math.round((q.x - ln[0]!) / bw - 0.5);
      assert.ok(Math.abs(q.x - (ln[0]! + (k + 0.5) * bw)) < 0.15 && Math.abs(q.y - (3 + bl / 2)) < 0.15, `r${r}: car at ${q.x.toFixed(2)},${q.y.toFixed(2)} not centred in its bay`);
      // along the bay's axis: its world heading is the away vector's heading or the opposite (within a heading's half-step, 22.5 degrees)
      const world = turned(q.id, f.q).id, m = /:(SE|S|SW|W|NW|N|NE|E)$/.exec(world);
      assert.ok(m, `${q.id} is not a car picture`);
      const wi = CAR_DIRECTIONS.indexOf(m![1] as never), ni = carHeading(Math.atan2(lot.n.y, lot.n.x));
      const d = Math.min((wi - ni + 8) % 8, (ni - wi + 8) % 8, (wi - ni - 4 + 16) % 8, (ni + 4 - wi + 16) % 8);
      assert.ok(d === 0, `r${r}: car heading ${CAR_DIRECTIONS[wi]} is ${d} steps off the bay axis`);
    }
  }
  assert.ok(bays >= 20, `only ${bays} cars checked`);
});

// T305 (owner's list): each template's props are spread over the lot, not bunched in one strip: on every heading, a template's pieces (not its fences)
// stand in at least two of the three zones (front: y < 0.3 d; back: y > 0.65 d; side: x < 0.2 w or x > 0.8 w)
test('spread: each template puts its pieces in at least two of the front, side and back zones, on every heading', () => {
  for (const t of AUTO_TEMPLATES) for (const r of ROADS) {
    const [w, d] = SIZE[t], lot = lotOn(r, w, d), p = autoLot(lot, t === 'shop' ? 'com' : t === 'junk' ? 'ind' : 'res', t === 'trailer' ? 0 : 2, 13 + r, 'built', t)!;
    const zones = new Set<string>();
    for (const q of p.props) {
      if (FENCE.test(q.id)) continue;
      if (q.y < 0.3 * d) zones.add('front'); else if (q.y > 0.65 * d) zones.add('back');
      if (q.x < 0.2 * w || q.x > 0.8 * w) zones.add('side');
    }
    assert.ok(zones.size >= 2, `${t} on road ${r}: pieces in ${[...zones].join(', ') || 'no zone'} only`);
  }
});

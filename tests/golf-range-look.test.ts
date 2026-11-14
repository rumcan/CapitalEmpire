// J6b (#1226; the owner: "The driving range in the 'golf gameplay' does not look enough like the actual driving range you placed in the isometric one"): the
// practice view gets the range as built. The props that are no plants inside the things box go to the view as still things (their pictures, never swaying), and
// the range's slabs, yards and car park as ground pads (path features laid whole). Without a things box nothing changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportFeatures3p, gatherFeatures3p, type PathFeature } from '../src/game/golf/play/features3p';

const centre = { x: 1000, y: 1000 };
const shop = { kind: 'building', id: 'golf-clubhouse-shanty', name: 'shop', w: 600, h: 500, ax: 300, ay: 480, tex: [0, 0, 0, 0.5, 0.5], quad: [20, 60, 580, 480] };
const oak = { kind: 'tree', id: 'capital:tree-oak-open', name: 'oak', w: 400, h: 520, ax: 200, ay: 512, tex: [1, 0.1, 0.2, 0.3, 0.4], quad: [40, 32, 360, 512] };
const bare = { kind: 'bench', h: 40, name: 'a bench with no picture' };
const src = (things?: [number, number, number, number]) => gatherFeatures3p({
  course: 'c', segs: [], bizDefs: [], structures: [], lots: [], library: [shop, oak, bare], pages: [['p0.webp'], ['p1.webp']], courseBox: [990, 990, 1010, 1010],
  props: [{ item: 0, x: 1000, y: 1002, scale: 1 }, { item: 1, x: 1001, y: 1001, scale: 1 }, { item: 2, x: 1000, y: 1004, scale: 1 }, { item: 0, x: 1300, y: 1300, scale: 1 }],
  ...(things ? { things } : {}),
});

test('J6b: the props in the things box go as still things with their pictures; plants stay plants; a thing with no picture or outside the box does not go', () => {
  const g = src([990, 990, 1010, 1010]);
  const still = g.trees.filter(t => t.still), plants = g.trees.filter(t => !t.still);
  assert.equal(still.length, 1, 'the shop (the bench has no picture, the far shop is outside the box)');
  assert.equal(still[0]!.sp, 'golf-clubhouse-shanty'); assert.equal(plants.length, 1);
  assert.ok(g.pics!['golf-clubhouse-shanty']);
  const T = exportFeatures3p(g, centre).trees!;
  assert.deepEqual(T.st, T.sp.map(s => (s === 'golf-clubhouse-shanty' ? 1 : 0)));
  // without the things box: as before (no still things, no st)
  const n = src();
  assert.equal(n.trees.filter(t => t.still).length, 0);
  assert.equal(exportFeatures3p(n, centre).trees!.st, undefined);
});
test('J6b: pads go to the view as rings laid whole, sorted by key; a pad of fewer than three points is left out', () => {
  const g = src();
  const F = exportFeatures3p({ ...g, pads: [{ key: 'lot', pts: [{ x: 1000, y: 1000 }, { x: 1010, y: 1000 }, { x: 1010, y: 1005 }, { x: 1000, y: 1005 }], surface: 'gravel', name: 'Car park' },
    { key: 'a-slab', pts: [{ x: 990, y: 990 }, { x: 995, y: 990 }, { x: 995, y: 992 }], surface: 'concrete', name: 'concrete' }, { key: 'bad', pts: [{ x: 0, y: 0 }], surface: 'dirt', name: 'x' }] }, centre);
  const pads = F.features.filter((f): f is PathFeature => f.kind === 'path' && !!f.ring);
  assert.deepEqual(pads.map(p => p.id), ['pad:a-slab', 'pad:lot']);
  assert.equal(pads[1]!.surface, 'gravel'); assert.equal(pads[1]!.width, 0);
  assert.deepEqual(pads[1]!.pts[0], [0, 0]); assert.deepEqual(pads[1]!.pts[2], [20, 10], 'metres in the view frame (2 m tiles, y south)');
});

import { practiceCourse } from '../src/game/golf/play/practice3p';
test('J6b: a bare outfield is dry long grass to the model but course ground (fairway) in the file; the greens are painted only once built', () => {
  const sq = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
  const c = practiceCourse({ outfield: sq(0, -3, 70, 130), teeBox: sq(4, -3, 67, 1), bays: [{ x: 30, y: 0 }], greens: [{ x: 35, y: 50, r: 4, m: 100 }], area: null, areas: [], chip: null,
    outfieldSurface: 'fescue', greensBuilt: false });
  assert.equal(c.view.kindAt!(35, 30), 'fescue'); assert.notEqual(c.view.lieAt(35, 50), 'green', 'no green painted where none is built');
  assert.equal(c.input.areas[0]!.surface, 'fairway', 'the file keeps the outfield as the course\'s ground');
  assert.ok(!c.input.areas.some(a => a.surface === 'green'));
  assert.equal(c.greens.length, 1, 'the drills still have the 100 m spot');
});
test('J6b: the range ground lies under everything: rough to the model off the outfield, course ground (fairway) in the file', () => {
  const sq = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
  const c = practiceCourse({ outfield: sq(0, -3, 70, 130), teeBox: sq(4, -3, 67, 1), bays: [{ x: 30, y: 0 }], greens: [], area: null, areas: [], chip: null,
    outfieldSurface: 'fescue', ground: [-30, -60, 100, 160] });
  assert.equal(c.view.lieAt(35, -40), 'rough', 'by the shop: rough, not out of bounds');
  assert.equal(c.view.kindAt!(35, 60), 'fescue');
  assert.deepEqual(c.input.areas.slice(0, 2).map(a => a.surface), ['fairway', 'fairway']);
  assert.equal(c.input.areas[2]!.surface, 'tee');
});

import { DRILLS, judgeDrill, junkHit, junkReach, recordDrill } from '../src/game/golf/play/drills';
import { PracticeDriver, practiceFlags } from '../src/game/golf/play/practice3p';
import { TILE_M } from '../src/game/golf/types';
test('J6b: junk piles (J7) are targets: a ball that lands on one or stops by it hits it; the junk drill counts three; labels carry name and distance', () => {
  const m = (v: number) => v / TILE_M, car = { x: 35, y: m(140), r: junkReach('expansion:junk-car'), name: 'Old car', distM: 140 }, tyres = { x: 10, y: m(80), r: junkReach('expansion:tyre-stack'), name: 'Tyres', distM: 80 };
  assert.equal(car.r, 4); assert.equal(tyres.r, 2.5);
  assert.equal(junkHit([car, tyres], { x: 35 + m(4.8), y: m(140) }, { x: 35, y: m(160) })?.name, 'Old car', 'landed within its reach + 1 m');
  assert.equal(junkHit([car, tyres], { x: 35, y: m(120) }, { x: 10 + m(2), y: m(80) })?.name, 'Tyres', 'stopped by it');
  assert.equal(junkHit([car, tyres], { x: 35, y: m(100) }, { x: 35, y: m(110) }), null);
  const base = { spot: 'range' as const, club: 'iron7' as const, shape: null, landLie: null, restLie: 'fairway' as const, holed: false, pin: { x: 35, y: m(100) }, greens: [], from: 'tee' as const, junk: [car, tyres] };
  const hit = judgeDrill('junk', { ...base, landing: { x: 35, y: m(140) }, rest: { x: 35, y: m(150) } });
  assert.deepEqual(hit, { hit: true, note: 'Hit the old car!' });
  assert.match(judgeDrill('junk', { ...base, landing: { x: 35, y: m(100) }, rest: { x: 35, y: m(105) } }).note, /from the tyres|from the old car/);
  let sv = recordDrill(undefined, 'junk', hit).save; sv = recordDrill(sv, 'junk', hit).save; const r = recordDrill(sv, 'junk', hit);
  assert.equal(r.paid, 'junk'); assert.equal(DRILLS.junk.need, 3);
  // the course: junk only where J7 lays it; labels only (no flags)
  const sq = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
  const inp = { outfield: sq(0, -3, 70, 130), teeBox: sq(4, -3, 67, 1), bays: [{ x: 35, y: 0 }], greens: [{ x: 35, y: m(100), r: 4, m: 100 }], area: null, areas: [], chip: null };
  const none = practiceCourse(inp), withJ = practiceCourse({ ...inp, junk: [{ id: 'expansion:junk-car', name: 'Old car', x: 35, y: m(140), m: 140 }] });
  assert.equal(none.junk.length, 0); assert.equal(new PracticeDriver(none, 'range', 0.5, 1, { drills: () => null, judged: () => {} }).canPlay('junk'), false, 'no junk: no junk drill');
  assert.equal(new PracticeDriver(withJ, 'range', 0.5, 1, { drills: () => null, judged: () => {} }).canPlay('junk'), true);
  // J6c: no labels and no flags of the view's own: the range's distances are its own pictures
  assert.deepEqual(practiceFlags(withJ, 'range', { x: 0, y: 0 }), []);
});

test('J6c: earth and turf pads travel as rings with their surfaces', () => {
  const F = exportFeatures3p({ course: 'c', paths: [], buildings: [], trees: [], pads: [
    { key: 'patch001', pts: [{ x: 1000, y: 1000 }, { x: 1070, y: 1000 }, { x: 1070, y: 1130 }, { x: 1000, y: 1130 }], surface: 'earth', name: 'desert' },
    { key: 'zmat00', pts: [{ x: 1030, y: 999 }, { x: 1031.8, y: 999 }, { x: 1031.8, y: 1000.5 }, { x: 1030, y: 1000.5 }], surface: 'turf', name: 'Hitting mat' }] }, centre);
  const pads = F.features.filter((f): f is PathFeature => f.kind === 'path' && !!f.ring);
  assert.deepEqual(pads.map(p => [p.id, p.surface]), [['pad:patch001', 'earth'], ['pad:zmat00', 'turf']], 'the mat comes last, so it lies on the slab and the earth');
});

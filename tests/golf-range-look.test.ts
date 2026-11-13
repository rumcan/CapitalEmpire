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

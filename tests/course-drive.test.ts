// The golf course's drives (P19): a miniature of the road catalogue with its own ladder and tiers, garden medians, and no town lots along
// them. Headless: npm test (no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, CLASSES, NARROWER, type Route, RoadNetwork, VARIANTS, WIDER, classOf, courseClassOpen, courseTierNeeded, type ClassId, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap } from '../src/game/lots/lots';
import { blockLots } from '../src/game/lots/blocklots';
import { enclosedBlocks } from '../src/game/blocks';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** a course road: a drive or (T084) a cart path */
const isCourse = (id: ClassId) => classOf(id).family === 'course' || classOf(id).family === 'cart';

test('the course drives: three plain classes and their variants, with their median and lane rules', () => {
  for (const id of ['drive-gravel', 'drive', 'drive-avenue']) {
    const c = CLASS[id]!;
    assert.equal(c.family, 'course', id); assert.equal(c.noLots, true, id); assert.equal(c.base, id, id); assert.deepEqual(c.flags, [], id);
  }
  assert.deepEqual(CLASS['drive-gravel']!.laneCentres, [0]);
  assert.deepEqual(CLASS.drive!.laneCentres, [0]);
  const av = CLASS['drive-avenue']!;
  assert.ok(av.median > 0); assert.equal(av.medianTrees, true); assert.ok(!av.medianGarden);
  const gd = CLASS['drive-avenue.gd']!, gr = CLASS['drive-avenue.gr']!, tr = CLASS['drive.tr']!;
  assert.equal(gd.family, 'course'); assert.equal(gd.noLots, true); assert.equal(gd.medianGarden, true); assert.equal(gd.medianTrees, false);
  assert.ok(!gr.medianGarden); assert.equal(gr.medianTrees, false); assert.equal(gr.family, 'course');
  assert.equal(tr.streetTrees, true); assert.equal(tr.base, 'drive'); assert.equal(tr.family, 'course');
  assert.deepEqual(VARIANTS['drive-gravel'], ['drive-gravel']);
  assert.deepEqual(VARIANTS.drive, ['drive', 'drive.tr']);
  assert.deepEqual(VARIANTS['drive-avenue'], ['drive-avenue', 'drive-avenue.gr', 'drive-avenue.gd']);
  // the town's classes keep their rules: no course flag, no lot ban
  for (const c of CLASSES) if (!isCourse(c.id)) { assert.ok(!c.noLots && !c.medianGarden, c.id); }
});

test('the course ladder: gravel up to paved and avenue, and back down, never into a town class', () => {
  assert.equal(WIDER['drive-gravel'], 'drive'); assert.equal(WIDER.drive, 'drive-avenue'); assert.equal(WIDER['drive.tr'], 'drive-avenue');
  assert.equal(NARROWER['drive-avenue'], 'drive'); assert.equal(NARROWER['drive-avenue.gr'], 'drive'); assert.equal(NARROWER['drive-avenue.gd'], 'drive');
  assert.equal(NARROWER.drive, 'drive-gravel'); assert.equal(NARROWER['drive.tr'], 'drive-gravel');
  assert.equal(WIDER['drive-avenue'], undefined); assert.equal(NARROWER['drive-gravel'], undefined);
  for (const [from, to] of [...Object.entries(WIDER), ...Object.entries(NARROWER)]) assert.equal(isCourse(from), isCourse(to!), `${from} -> ${to}`);
});

test('courseClassOpen: gravel always, paved from tier 2, the avenue drives from tier 3, town classes always', () => {
  assert.equal(courseClassOpen('drive-gravel', 1), true);
  assert.equal(courseClassOpen('drive', 1), false); assert.equal(courseClassOpen('drive', 2), true);
  assert.equal(courseClassOpen('drive.tr', 1), false); assert.equal(courseClassOpen('drive.tr', 2), true);
  assert.equal(courseClassOpen('drive-avenue', 2), false);
  assert.equal(courseClassOpen('drive-avenue.gd', 2), false); assert.equal(courseClassOpen('drive-avenue.gd', 3), true);
  assert.equal(courseClassOpen('drive-avenue.gr', 3), true);
  assert.equal(courseClassOpen('street', 1), true); assert.equal(courseClassOpen('divided', 1), true);
});

test('a course drive grows no town lots, and the street beside it still does', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(40, 40, 240, 40)], CLASS.street!, 0);
  e.addLegs([leg(40, 120, 240, 120)], CLASS['drive-gravel']!, 0);
  e.commit();
  const lm = new LotMap(); lm.update(e.net, null);
  const lots = [...lm.lots.values()];
  assert.ok(lots.some(l => l.cls === 'street'), 'the street has lots');
  assert.ok(lots.every(l => l.cls !== 'drive-gravel'), 'no lot fronts the drive');
});

test('a drive on its own grows no lots, of any course class', () => {
  for (const id of ['drive-gravel', 'drive', 'drive-avenue.gd']) {
    const e = new NetEditor(new RoadNetwork());
    e.addLegs([leg(40, 40, 240, 40)], CLASS[id]!, 0);
    e.commit();
    const lm = new LotMap(); lm.update(e.net, null);
    assert.equal(lm.lots.size, 0, id);
  }
});

test('a garden median plants shrubs and flowers (not trees); an avenue drive plants its trees', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(40, 40, 240, 40)], CLASS['drive-avenue.gd']!, 0);
  e.addLegs([leg(40, 120, 240, 120)], CLASS['drive-avenue']!, 0);
  e.commit();
  const props = e.net.autoProps;
  const gardens = props.filter(a => a.kind === 'garden'), trees = props.filter(a => a.kind === 'tree');
  assert.ok(gardens.length > 10, `garden props: ${gardens.length}`);
  assert.ok(gardens.every(a => a.y === 40), 'garden props stand on the garden median (y 40)');
  assert.ok(trees.length > 10, `tree props: ${trees.length}`);
  assert.ok(trees.every(a => a.y === 120), 'trees stand on the tree-lined median (y 120)');
  assert.equal(props.filter(a => a.kind === 'tree' && a.y === 40).length, 0, 'no tree on the garden median');
  assert.equal(props.filter(a => a.kind === 'garden' && a.y === 120).length, 0, 'no garden prop on the tree-lined median');
});

test('courseTierNeeded: gravel 1, paved 2, the avenue drives 3; town classes none; courseClassOpen follows it', () => {
  assert.equal(courseTierNeeded('drive-gravel'), 1);
  assert.equal(courseTierNeeded('drive'), 2); assert.equal(courseTierNeeded('drive.tr'), 2);
  assert.equal(courseTierNeeded('drive-avenue'), 3); assert.equal(courseTierNeeded('drive-avenue.gr'), 3); assert.equal(courseTierNeeded('drive-avenue.gd'), 3);
  assert.equal(courseTierNeeded('street'), null); assert.equal(courseTierNeeded('divided'), null); assert.equal(courseTierNeeded('no-such-class'), null);
  for (const id of ['drive-gravel', 'drive', 'drive-avenue.gd', 'street']) for (let t = 1; t <= 5; t++) assert.equal(courseClassOpen(id, t), (courseTierNeeded(id) ?? 0) <= t, `${id} at tier ${t}`);
});

test('a gravel drive gets no manhole or drain decals; a paved drive and a street of the same length do', () => {
  const decals = (id: ClassId): string[] => {
    const e = new NetEditor(new RoadNetwork());
    e.addLegs([leg(0, 0, 200, 0)], CLASS[id]!, 0); e.commit();
    const r: Route = [...e.net.routes][0]!;
    return (e.net as unknown as { routeFeatures(r: Route): { decals: { t: string }[] } }).routeFeatures(r).decals.map(d => d.t);
  };
  const gravel = decals('drive-gravel');
  assert.equal(gravel.filter(t => t === 'manhole' || t === 'drain').length, 0, 'no manholes or drains on the gravel drive');
  assert.equal(gravel.length, 0, 'the gravel drive gets no decals at all');
  assert.ok(decals('drive').includes('manhole'), 'a paved drive gets manholes');
  assert.ok(decals('street').includes('manhole'), 'a street gets manholes');
});

/** a closed square of four legs on the corners (0,0), (60,0), (60,60) and (0,60): one block of 60 x 60 tiles inside */
const SQUARE = [leg(0, 0, 60, 0), leg(60, 0, 60, 60), leg(60, 60, 0, 60), leg(0, 60, 0, 0)];
function ringOf(id: ClassId): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs(SQUARE, CLASS[id]!, 0); e.commit(true);
  return e.net;
}

test('a block bounded by a course drive gets no block lots; the same ring of streets does', () => {
  for (const id of ['drive-gravel', 'drive', 'drive-avenue']) {
    const net = ringOf(id), blocks = enclosedBlocks(net);
    assert.equal(blocks.length, 1, `${id}: one block inside the ring`);
    assert.equal(blockLots(net, blocks[0]!, null), null, `${id}: no block lots`);
    const lm = new LotMap(); lm.update(net, null);
    assert.equal(lm.lots.size, 0, `${id}: no lots at all`);
  }
  const streets = ringOf('street'), blocks = enclosedBlocks(streets), lots = blockLots(streets, blocks[0]!, null);
  assert.ok(lots && lots.length >= 6, `the street ring's block is subdivided: ${lots?.length}`);
});

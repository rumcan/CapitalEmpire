// #1302 (the owner, 2026-11-15, a green painted on the desert outfield: "drew a green on the range but the rocks stayed and i cant bulldoze them, I should be able to place
// props on the range ... I cant place a flag at all atm. it says the flag prop needs to be placed on a green, remove that rule ... the flags on the range are still not in
// their holes"): the Texture Painter's stroke clears the range's own desert plants and rocks under it (every surface it lays; undo brings them back; the save keeps them
// gone), the bulldozer's key for them, the Props tool's rules on the range and for a flag, and every pin's foot standing in its cup on its green's middle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultRangeBiz, normalizeRangeBiz, rangeScene, withUpgrade, type RangeBizSave } from '../src/game/golf/rangebiz';
import { CLEARABLE_KEY, normalizeCleared } from '../src/game/golf/rangesave';
import { RangeHost, type RangeHostCtx } from '../src/game/golf/rangehost';
import { joinAside, laidAt, laidCells, scatterUnder } from '../src/game/golf/rangeclear';
import { SURF, makeGrid, paintDisc, type Grid } from '../src/game/ext/course-grid';
import { DECOR_BY_KEY, decorSpotWhy, isFlag, type Box, type DecorSpot } from '../src/game/golf/decor';
import { LIBRARY } from '../src/game/library';
import { VECTOR_SHADOWS } from '../src/game/shadow-vector';
import type { Rect } from '../src/game/golf/mode';
import type { Prop } from '../src/game/types';

const plots: Record<0 | 1 | 2 | 3, Rect> = { 0: [500, 600, 70, 150], 1: [900, 300, 150, 70], 2: [200, 200, 70, 150], 3: [1200, 1300, 150, 70] };
const FACINGS = [0, 1, 2, 3] as const;
/** a grid round the facing-2 plot (x 190..340, y 190..400 tiles) */
const grid = (): Grid => makeGrid(190, 190, 300, 420);
const natural = (s: RangeBizSave) => rangeScene(plots[2], 2, s).pieces.filter(p => CLEARABLE_KEY.test(p.key));
/** a range host on the facing-2 plot whose pieces are stand-in props (so the host knows which pieces stand) */
function host(biz: RangeBizSave) {
  let saves = 0;
  const ctx: RangeHostCtx = {
    biz: () => biz, plot: () => ({ rect: plots[2], facing: 2 }), carPark: () => null,
    addPiece: (_p, key) => ({ auto: key } as unknown as Prop), removeProp: () => {}, setGround: () => {}, layPaths: () => {}, clearTrees: () => {},
    money: () => 1e6, spend: () => {}, book: () => {}, demand: () => ({ tier: 1, exits: 2, residents: 0 }), dayLen: () => 600, simT: () => 0, clock: () => ({ hour: 12, day: 1 }),
    save: () => { saves++; }, toast: () => {}, emit: () => {},
  };
  const h = new RangeHost(ctx, 1); h.sync();
  return { h, saves: () => saves };
}

test('a desert start\'s outfield has its natural pieces, keyed the same on every lay (the seed is fixed), and the range\'s own pieces are never clearable', () => {
  const s = defaultRangeBiz(), a = natural(s), b = natural(defaultRangeBiz());
  assert.ok(a.length > 50, `the desert's plants and rocks stand (${a.length})`);
  assert.deepEqual(a.map(p => [p.key, p.id, p.x, p.y]), b.map(p => [p.key, p.id, p.x, p.y]));
  for (const k of ['flag0', 'board1', 'mark1-0', 'junk0', 'shop', 'roof0', 'starter-flag0']) assert.ok(!CLEARABLE_KEY.test(k), `${k} is the range's, not the desert's`);
  assert.deepEqual(normalizeCleared(['desert3', 'flag0', 'desert3', 7, 'oasis1', 'nope']), ['desert3', 'oasis1']);
});

test('painting clears the desert scatter under the stroke, for every surface it lays; undo brings it back, redo takes it again; the save keeps it gone', () => {
  for (const [name, surf] of Object.entries(SURF)) {
    if (surf === SURF.none) continue;
    const biz = defaultRangeBiz(), { h } = host(biz), g = grid(), before = natural(biz), p = before[Math.floor(before.length / 2)]!;
    const d = paintDisc(g, p.x, p.y, 2.5, surf, 0, 0);
    const under = before.filter(q => Math.hypot(q.x - p.x, q.y - p.y) < 2.4).map(q => q.key);
    const aside = h.scatterPaintedOver(d);
    assert.ok(aside, `${name}: the stroke cleared something`);
    for (const k of under) assert.ok(biz.cleared!.includes(k), `${name}: ${k} under the paint went`);
    const after = natural(biz);
    assert.ok(!after.some(q => q.key === p.key), `${name}: the scene lays it no more`);
    assert.equal(after.length, before.length - biz.cleared!.length, `${name}: only the pieces under it went`);
    for (const q of after) assert.ok(Math.hypot(q.x - p.x, q.y - p.y) > 2.4, `${name}: ${q.key} is not under the stroke`);
    // the save keeps them gone (a reload lays the scene from the save: never back)
    const loaded = normalizeRangeBiz(JSON.parse(JSON.stringify(biz)));
    assert.deepEqual(loaded.cleared, biz.cleared); assert.equal(natural(loaded).length, after.length);
    aside!.undo(); assert.equal(biz.cleared, undefined, `${name}: undo brings them all back`); assert.equal(natural(biz).length, before.length);
    aside!.redo(); assert.ok(under.every(k => biz.cleared!.includes(k)), `${name}: redo takes them again`);
  }
});

test('a rub out lays nothing and clears nothing; a stroke far from every piece clears nothing', () => {
  const biz = defaultRangeBiz(), { h } = host(biz), g = grid(), p = natural(biz)[10]!;
  paintDisc(g, p.x, p.y, 3, SURF.rough, 0, 0);
  const rub = paintDisc(g, p.x, p.y, 3, 0, 0, 0, { rub: true });
  assert.equal(laidCells(rub), null); assert.deepEqual(scatterUnder(rangeScene(plots[2], 2, biz).pieces, rub), []);
  assert.equal(h.scatterPaintedOver(rub), null); assert.equal(biz.cleared, undefined);
  const far = paintDisc(g, 330, 395, 1, SURF.green, 0, 0); assert.equal(h.scatterPaintedOver(far), null);
});

test('a piece half on the paint goes (its foot\'s spread), one a tile off stays', () => {
  const g = grid(), d = paintDisc(g, 260, 300, 2, SURF.green, 0, 0), laid = laidCells(d)!;
  assert.ok(laidAt(d, laid, 260, 300)); assert.ok(laidAt(d, laid, 262.2, 300), 'its foot 0.4 tiles reaches the paint'); assert.ok(!laidAt(d, laid, 263.5, 300));
});

test('the bulldozer: a standing natural piece is taken on its own (free, one step: undo brings it back); the range\'s own pieces and one gone already are not', () => {
  const biz = defaultRangeBiz(), { h } = host(biz), k = natural(biz)[5]!.key;
  assert.equal(h.scatterKeyOf('range:' + k), k);
  assert.equal(h.scatterKeyOf('range:shop'), null); assert.equal(h.scatterKeyOf('range:flag0'), null); assert.equal(h.scatterKeyOf(undefined), null); assert.equal(h.scatterKeyOf(k), null);
  const aside = h.dropScatter([k])!; assert.deepEqual(biz.cleared, [k]);
  h.sync(); assert.equal(h.scatterKeyOf('range:' + k), null, 'gone: the bulldozer no longer finds it');
  assert.equal(h.dropScatter([k]), null, 'taken already: no second step');
  aside.undo(); assert.equal(biz.cleared, undefined); h.sync(); assert.equal(h.scatterKeyOf('range:' + k), k);
  const two = joinAside([aside, null, { undo: () => {}, redo: () => {} }])!; two.redo(); assert.deepEqual(biz.cleared, [k]);
});

/** a map for the spot check: owned x 0..100; a course green disc at (20, 20) and a bunker at (30, 20); the range's plot x 50..100 with its mats at (60, 10) */
const spot = (over: Partial<DecorSpot> = {}): DecorSpot => ({
  owned: x => x >= 0 && x < 100, water: () => false, road: () => false,
  course: (x, y) => (Math.hypot(x - 20, y - 20) < 3 || Math.hypot(x - 70, y - 40) < 3 ? 'green' : Math.hypot(x - 30, y - 20) < 2 || Math.hypot(x - 80, y - 40) < 2 ? 'bunker' : ''),
  range: (x, y) => (Math.hypot(x - 60, y - 10) < 2 ? 'mats' : Math.hypot(x - 90, y - 60) < 3 ? 'target' : ''),
  rangePlot: x => x >= 50, overlaps: () => '', ...over,
});
const box = (x: number, y: number, h = 0.5): Box => [x - h, y - h, x + h, y + h];

test('props on the range: any ground of its plot takes one (a painted green, a bunker, a target green), the mats never; elsewhere the course rules hold', () => {
  assert.equal(decorSpotWhy(box(70, 40), spot()), '', 'a boulder on a green painted on the outfield');
  assert.equal(decorSpotWhy(box(80, 40), spot()), '', 'in a bunker painted on the outfield');
  assert.equal(decorSpotWhy(box(90, 60), spot()), '', 'on a target green');
  assert.equal(decorSpotWhy(box(60, 10), spot()), 'Not on the hitting mats');
  assert.equal(decorSpotWhy(box(20, 20), spot()), 'Not on a green', 'a course green keeps its rule for a boulder');
  assert.equal(decorSpotWhy(box(30, 20), spot()), 'Not in a bunker');
  assert.match(decorSpotWhy(box(70, 40), spot({ overlaps: () => 'the pro shop' })), /Overlaps the pro shop/, 'the range\'s buildings still refuse it');
  assert.equal(decorSpotWhy(box(70, 40), spot({ rangePlot: undefined })), 'Not on a green', 'without the range\'s plot: as before');
});

test('the flag: no "on a green" rule: a flag stands on any green, wherever else a prop may', () => {
  const pole = DECOR_BY_KEY.get('flagpole')!; assert.ok(isFlag(pole), 'the flag pole is a flag');
  const pin = DECOR_BY_KEY.get('newprop-flag-pin'); if (pin) assert.ok(isFlag(pin), 'the flag pin is a flag');
  assert.ok(!isFlag(DECOR_BY_KEY.get('kit-boulder-m')!));
  assert.equal(decorSpotWhy(box(20, 20), spot(), 'course', false, true), '', 'a flag on a course green');
  assert.equal(decorSpotWhy(box(10, 10), spot(), 'course', false, true), '', 'and off a green');
  assert.equal(decorSpotWhy(box(90, 60), spot({ rangePlot: undefined }), 'course', false, true), '', 'on a target green');
  assert.equal(decorSpotWhy(box(60, 10), spot(), 'course', false, true), 'Not on the hitting mats', 'the mats refuse a flag as every prop');
  assert.match(decorSpotWhy(box(-5, 10), spot(), 'course', false, true), /Only on your land/);
});

test('#1302: every range pin stands on its green\'s middle at every facing, and the pin pictures\' anchor is the pole\'s foot in its cup', () => {
  // the pins' pictures: the anchor on the pole (x 29..43 of 206) at the cup ring's middle (rows 442..470 of 476), not the picture's middle (103, 424.5)
  for (const id of ['business:golf-pin-red', 'business:golf-pin-yellow']) {
    const it = LIBRARY.find(q => q.id === id)!;
    assert.ok(it.ax >= 29 && it.ax <= 43, `${id}: the anchor on the pole (${it.ax})`); assert.ok(it.ay >= 442 && it.ay <= 470, `${id}: in the cup ring (${it.ay})`);
    // the shadow's contact (display px about the anchor) moved with it: round the foot, not 67 px off
    const c = VECTOR_SHADOWS[id]!.c![0]!, xs = c.filter((_, i) => i % 2 === 0), ys = c.filter((_, i) => i % 2 === 1);
    const mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2;
    assert.ok(Math.abs(mx) < 4 && Math.abs(my) < 22, `${id}: the contact shadow round the foot (${mx}, ${my})`);
  }
  const fp = LIBRARY.find(q => q.id === 'newprop:flag-pin');
  if (fp) assert.ok(Math.abs(fp.ax - 32.5) < 2 && Math.abs(fp.ay - 240) < 3, `the flag pin's anchor at its pole's foot (${fp.ax}, ${fp.ay})`);
  // every target green's flag on its middle, where its picture's cup is (the picture laid centred there), at every facing
  const s = withUpgrade(withUpgrade(defaultRangeBiz(), 'greens'), 'targets');
  for (const f of FACINGS) {
    const sc = rangeScene(plots[f], f, s);
    assert.equal(sc.targets.length, 5);
    for (const [i, t] of sc.targets.entries()) {
      const flag = sc.pieces.find(p => p.key === `flag${i}`)!;
      assert.ok(Math.hypot(flag.x - t.x, flag.y - t.y) < 1e-9, `facing ${f}: flag ${i} on its green's middle`);
      const green = sc.patches.filter(p => p.surf === 'targetGreen' || p.surf === 'target' || p.surf === 'bullseye').find(p => { const xs = p.pts.filter((_, k) => k % 2 === 0), ys = p.pts.filter((_, k) => k % 2 === 1); return Math.hypot((Math.min(...xs) + Math.max(...xs)) / 2 - t.x, (Math.min(...ys) + Math.max(...ys)) / 2 - t.y) < 1; });
      assert.ok(green, `facing ${f}: green ${i}'s ground is drawn round its middle`);
    }
  }
});

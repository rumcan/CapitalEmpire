// The Props tool (plan P24 Phase 3, T131: golf/decor.ts and golf/propstool.ts): the catalogue, where a prop may stand, placing, turning,
// moving and selling (each one undo step), the appeal near the range's shop and mats and its cap, what it does to the range, and the save.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPEAL, DECOR, DECOR_BY_KEY, DECOR_GROUPS, PROPS_APPEAL_RADIUS, appealText, decorAppeal, decorKeyOf, decorSpotWhy, inPoly, propTuple, sellBack, tupleMarks, type Box, type DecorSpot } from '../src/game/golf/decor';
import { PropsTool, rangeAnchors, type PropsHostCtx } from '../src/game/golf/propstool';
import { PROPS_APPEAL_CAP, dayDemand, defaultRangeBiz, rangeScene, rangeStats, skippedVisits, type RangeScene } from '../src/game/golf/rangebiz';
import { LIBRARY } from '../src/game/library';
import { turned } from '../src/game/lots/preset-art';
import { RAIL } from '../src/ui/rail-items';
import type { Prop } from '../src/game/types';

const LIB = new Map(LIBRARY.map((it, i) => [it.id, i]));

test('the catalogue: four groups of real library pictures, a price of $50 to $15,000 and an appeal each; stand-ins are named', () => {
  assert.deepEqual(DECOR_GROUPS.map(g => g.id), ['plants', 'water', 'stone', 'furniture']);
  for (const g of DECOR_GROUPS) assert.ok(DECOR.some(d => d.group === g.id), g.id);
  assert.equal(new Set(DECOR.map(d => d.key)).size, DECOR.length, 'the keys are unique (they are saved)');
  for (const d of DECOR) {
    assert.ok(LIB.has(d.id), `${d.key}: ${d.id} is in the library`);
    assert.ok(d.price >= 50 && d.price <= 15000, `${d.key} price`);
    assert.ok(d.appeal > 0 && d.appeal <= 0.05, `${d.key} appeal`);
    assert.ok(d.name && !/stand in/i.test(d.name) && d.desc, `${d.key}: a plain name`);
    assert.equal(sellBack(d), Math.round(d.price / 2));
  }
  // the owner's list: pot plants, shrubs, grasses, flower beds, fountains, statues, pillars, benches, bins, lamp posts, flag poles
  for (const k of ['pot-terracotta', 'shrub-hydrangea', 'grass-ornamental', 'flower-bed', 'fountain', 'statue', 'pillar', 'bench', 'bin', 'lamp', 'flagpole']) assert.ok(DECOR_BY_KEY.has(k), k);
  assert.equal(DECOR_BY_KEY.get('pot-terracotta')!.appeal, APPEAL.plant);
  assert.equal(DECOR_BY_KEY.get('fountain')!.appeal, 0.05); assert.equal(DECOR_BY_KEY.get('statue')!.appeal, 0.03);
  assert.equal(DECOR_BY_KEY.get('pillar')!.appeal, 0.01); assert.equal(DECOR_BY_KEY.get('bench')!.appeal, 0.005);
  for (const k of ['statue', 'pillar', 'flagpole']) assert.ok(DECOR_BY_KEY.get(k)!.standIn, `${k} is a labelled stand-in`);
  assert.ok(!DECOR_BY_KEY.get('fountain')!.standIn, 'the fountain is real art');
  // the fountain has four views, and turning never mirrors anything
  const f = DECOR_BY_KEY.get('fountain')!, views = [0, 1, 2, 3].map(q => turned(f.id, q));
  assert.equal(new Set(views.map(v => v.id)).size, 4); assert.ok(DECOR.every(d => [0, 1, 2, 3].every(q => !turned(d.id, q).flip)), 'never mirrored');
  assert.equal(appealText(0.12), '+12%'); assert.equal(appealText(0.005), '+0.5%');
});

test('the rail: Props sits in the Course group of golf games, after Buildings, on Z', () => {
  const i = RAIL.findIndex(r => r.id === 'props'), r = RAIL[i]!;
  assert.equal(RAIL[i - 1]!.id, 'buildings'); assert.equal(r.section, 'course'); assert.equal(r.only, 'golf'); assert.equal(r.key, 'Z');
  assert.ok(!RAIL.some(q => q !== r && q.tools.some(t => t.key === 'Z')), 'Z is no other tool\'s key');
});

/** a map for the spot check: owned x 0..100, a road at y 50..52, water at x 80..90, a green disc at (20, 20), a bunker at (30, 20) */
const spot = (over: Partial<DecorSpot> = {}): DecorSpot => ({
  owned: (x, _y) => x >= 0 && x < 100, water: b => b[2] > 80 && b[0] < 90, road: b => b[3] > 50 && b[1] < 52,
  course: (x, y) => (Math.hypot(x - 20, y - 20) < 3 ? 'green' : Math.hypot(x - 30, y - 20) < 2 ? 'bunker' : ''), range: () => '', overlaps: () => '', ...over,
});
const box = (x: number, y: number, h = 0.5): Box => [x - h, y - h, x + h, y + h];

test('where a prop may stand: the player\'s land only, never on a road, water, a green, a bunker, the mats, a target green or another prop', () => {
  assert.equal(decorSpotWhy(box(10, 10), spot()), '');
  assert.match(decorSpotWhy(box(-3, 10), spot()), /Only on your land/);
  assert.match(decorSpotWhy(box(0.2, 10), spot()), /Only on your land/, 'a footprint half off the land');
  assert.equal(decorSpotWhy(box(85, 10), spot()), 'Not on water');
  assert.equal(decorSpotWhy(box(10, 51), spot()), 'Not on a road, path or car park');
  assert.equal(decorSpotWhy(box(20, 20), spot()), 'Not on a green');
  assert.equal(decorSpotWhy(box(22.8, 20), spot()), 'Not on a green', 'an edge on the green');
  assert.equal(decorSpotWhy(box(30, 20), spot()), 'Not in a bunker');
  assert.equal(decorSpotWhy(box(10, 10), spot({ range: () => 'mats' })), 'Not on the hitting mats');
  assert.equal(decorSpotWhy(box(10, 10), spot({ range: () => 'target' })), 'Not on a target green');
  assert.equal(decorSpotWhy(box(10, 10), spot({ overlaps: () => 'the shop' })), 'Overlaps the shop');
  assert.ok(inPoly([0, 0, 4, 0, 4, 4, 0, 4], 2, 2) && !inPoly([0, 0, 4, 0, 4, 4, 0, 4], 5, 2));
});

test('appeal: each prop within 15 tiles of the shop or a mat counts once, capped at +40%', () => {
  const a = [{ x: 0, y: 0 }, { x: 30, y: 0 }];
  assert.equal(decorAppeal([], a), 0);
  assert.equal(decorAppeal([{ key: 'pot-terracotta', x: 3, y: 4 }], a), 0.01);
  assert.equal(decorAppeal([{ key: 'fountain', x: 15, y: 0 }], a), 0.05, 'in reach of both anchors, counted once');
  assert.equal(decorAppeal([{ key: 'fountain', x: 0, y: PROPS_APPEAL_RADIUS + 0.1 }], a), 0, 'out of reach');
  assert.equal(decorAppeal([{ key: 'nope', x: 0, y: 0 }, { key: 'bench', x: 1, y: 1 }], a), 0.005);
  assert.equal(decorAppeal([{ key: 'fountain', x: 0, y: 0 }], []), 0, 'no range, no appeal');
  const lots = Array.from({ length: 12 }, (_, i) => ({ key: 'fountain', x: i, y: 0 }));
  assert.equal(decorAppeal(lots, a), PROPS_APPEAL_CAP, 'twelve fountains are capped at +40%');
  assert.equal(PROPS_APPEAL_CAP, 0.4);
});

test('the props\' appeal raises the range\'s visitors and its fair price; nothing without props, capped beyond', () => {
  const s = defaultRangeBiz(), c = { tier: 1, exits: 2, residents: 0 };
  const st0 = rangeStats(s), st1 = rangeStats(s, { propsAppeal: 0.12 }), stMax = rangeStats(s, { propsAppeal: 9 });
  assert.equal(st0.propsAppeal, 0); assert.equal(st0.appeal, 1); assert.equal(st0.ref, 6);
  assert.equal(st1.propsAppeal, 0.12); assert.ok(Math.abs(st1.appeal - 1.12) < 1e-9); assert.ok(Math.abs(st1.ref - 6.72) < 1e-9);
  assert.equal(stMax.propsAppeal, PROPS_APPEAL_CAP); assert.equal(rangeStats(s, { propsAppeal: -1 }).propsAppeal, 0); assert.equal(rangeStats(s, { propsAppeal: NaN }).propsAppeal, 0);
  // the demand reads the term from its context: more golfers at the same price (more appeal, and the price is cheaper against the fair price)
  const d0 = dayDemand(s, c), d1 = dayDemand(s, { ...c, propsAppeal: 0.12 });
  assert.ok(d1 > d0 * 1.12, `${d1} > ${d0} x 1.12`);
  assert.ok(skippedVisits(s, { ...c, propsAppeal: 0.4 }, 7, 600, 600).served + skippedVisits(s, { ...c, propsAppeal: 0.4 }, 7, 600, 600).lost > skippedVisits(s, c, 7, 600, 600).served + skippedVisits(s, c, 7, 600, 600).lost);
});

test('the range\'s anchors: its shop and every open mat', () => {
  const sc = rangeScene([200, 200, 70, 150], 2, defaultRangeBiz()), a = rangeAnchors(sc), shop = sc.pieces.find(p => p.key === 'shop')!;
  assert.equal(a.length, 1 + sc.bays.length); assert.deepEqual(a[0], { x: shop.x, y: shop.y });
});

// ---------------------------------------------------------------- the tool on a fake map

/** a fake host: the land is x 0..200, a range scene from the real layout, props in a list; the undo steps are recorded */
function host(scene: RangeScene | null = null) {
  const props = new Set<Prop>(); let uid = 1, money = 100000, sel: Prop | null = null;
  const steps: { label: string; spent: number; added: Prop[]; removed: Prop[] }[] = []; let cur: { added: Prop[]; removed: Prop[] } | null = null;
  const ctx: PropsHostCtx = {
    golf: () => true, item: id => LIB.get(id), idOf: p => LIBRARY[p.item]!.id,
    scaleOf: (_i, want) => want ?? 1, footprint: (_i, x, y, k) => [x - 0.4 * k, y - 0.4 * k, x + 0.4 * k, y + 0.4 * k],
    spot: { owned: x => x >= 0 && x < 2000, water: () => false, road: () => false, course: () => '' },
    propsIn: b => [...props].filter(p => p.x1 > b[0] && p.x0 < b[2] && p.y1 > b[1] && p.y0 < b[3]), props: () => props, propName: p => LIBRARY[p.item]!.name,
    scene: () => scene,
    addProp: (item, x, y, k) => { const p: Prop = { uid: uid++, item, x, y, flip: false, scale: k, x0: x - 0.4 * k, y0: y - 0.4 * k, x1: x + 0.4 * k, y1: y + 0.4 * k }; props.add(p); cur?.added.push(p); return p; },
    removeProp: p => { props.delete(p); cur?.removed.push(p); },
    propAt: () => null, tileAt: (mx, my) => ({ x: mx, y: my }),
    selected: () => sel, select: p => { sel = p; }, hover: () => {},
    money: () => money, spend: n => { money -= n; },
    step: (label, run) => { cur = { added: [], removed: [] }; const spent = run(); steps.push({ label, spent, ...cur }); cur = null; },
    undo: () => {}, redo: () => {}, save: () => {}, toast: () => {}, emit: () => {},
  };
  return { ctx, props, steps, money: () => money, setMoney: (m: number) => { money = m; }, sel: () => sel };
}

test('place: the item in hand is bought and placed on the ghost as one undo step; a refused spot or an empty purse places nothing', () => {
  const h = host(), t = new PropsTool(h.ctx);
  t.pick('pot-terracotta'); assert.equal(t.hand, 'pot-terracotta');
  t.down(10.1, 10.1);
  assert.equal(h.props.size, 1); const p = [...h.props][0]!;
  assert.equal(p.decor, 'pot-terracotta'); assert.deepEqual([p.x, p.y], [10, 10], 'snapped to the quarter tile');
  assert.equal(h.money(), 100000 - 120); assert.deepEqual(h.steps.map(s => [s.label, s.spent]), [['Place terracotta pot plant', 120]]);
  t.down(10, 10); assert.equal(h.props.size, 1, 'not on another prop'); assert.match(t.ghost!.why, /Overlaps/);
  t.down(-5, 10); assert.equal(h.props.size, 1, 'not off the land');
  h.setMoney(100); t.down(40, 40); assert.equal(h.props.size, 1, 'not without the money'); assert.match(t.ghost!.why, /Not enough money/);
  t.pick('pot-terracotta'); assert.equal(t.hand, null, 'picked again, put down'); assert.ok(t.esc() === false);
  t.pick('bench'); assert.ok(t.esc()); assert.equal(t.hand, null, 'Esc puts it down');
});

test('turn: R turns the item in hand through four views (four-view art), and a placed fountain where it stands; never mirrored', () => {
  const h = host(), t = new PropsTool(h.ctx), f = DECOR_BY_KEY.get('fountain')!;
  t.pick('fountain'); t.move(50, 50); const v0 = t.ghost!.item;
  t.turn(); assert.equal(t.view, 1); assert.notEqual(t.ghost!.item, v0); assert.equal(t.ghost!.item, LIB.get(turned(f.id, 1).id));
  t.turn(); t.turn(); t.turn(); assert.equal(t.view, 0); assert.equal(t.ghost!.item, v0);
  t.down(50, 50); const p = [...h.props][0]!; t.pick(null);
  h.ctx.select(p); t.turn();
  const q = [...h.props][0]!; assert.notEqual(q, p, 'made again (the undo journal sees it)'); assert.equal(q.decor, 'fountain'); assert.equal(q.item, LIB.get(turned(f.id, 1).id));
  assert.deepEqual([q.x, q.y, q.flip], [50, 50, false]); assert.equal(h.sel(), q);
  assert.deepEqual(h.steps.map(s => [s.label, s.spent, s.added.length, s.removed.length]), [['Place plaza fountain', 12000, 1, 0], ['Turn plaza fountain', 0, 1, 1]]);
  assert.ok(!t.turns(DECOR_BY_KEY.get('pot-terracotta')!), 'a pot has one picture');
});

test('move and sell: a drag moves a placed prop (one step), a refused spot keeps it; Sell gives half back (one step)', () => {
  const h = host(), t = new PropsTool(h.ctx);
  t.pick('statue'); t.down(20, 20); t.pick('bench'); t.down(30, 20); t.pick(null);
  const [statue, bench] = [...h.props];
  h.ctx.propAt = () => statue!;
  t.down(20, 20); assert.equal(h.sel(), statue); t.move(20, 20); t.up(); assert.equal(h.steps.length, 2, 'a click without a drag only selects');
  t.down(20, 20); t.move(25, 22); assert.equal(t.ghost!.why, ''); t.up();
  const moved = [...h.props].find(p => p.decor === 'statue')!;
  assert.deepEqual([moved.x, moved.y], [25, 22]); assert.equal(h.steps.at(-1)!.label, 'Move golfer statue'); assert.equal(h.steps.at(-1)!.spent, 0);
  h.ctx.propAt = () => moved;
  t.down(25, 22); t.move(30, 20); assert.match(t.ghost!.why, /Overlaps/); t.up();
  assert.deepEqual([moved.x, moved.y], [25, 22], 'onto the bench: refused, it stays'); assert.ok(h.props.has(bench!));
  const before = h.money(); h.ctx.select(moved); t.sell();
  assert.ok(!h.props.has(moved)); assert.equal(h.money(), before + 3000); assert.deepEqual([h.steps.at(-1)!.label, h.steps.at(-1)!.spent], ['Sell golfer statue', -3000]);
  assert.equal(h.sel(), null);
  // the keys: R turns, Delete sells, Ctrl+Z undoes
  const k = (key: string, ctrlKey = false) => ({ key, ctrlKey, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} }) as unknown as KeyboardEvent;
  h.ctx.select(bench!); assert.ok(t.key(k('Delete'))); assert.ok(!h.props.has(bench!));
  let undone = 0; h.ctx.undo = () => { undone++; }; assert.ok(t.key(k('z', true))); assert.equal(undone, 1);
});

test('appeal on the map: the props near a range\'s front count, the labels name each stand-in kind once', () => {
  const sc = rangeScene([200, 200, 70, 150], 2, defaultRangeBiz()), h = host(sc), t = new PropsTool(h.ctx), shop = sc.pieces.find(p => p.key === 'shop')!;
  assert.equal(t.appeal(), 0);
  t.pick('fountain'); t.down(shop.x + 8, shop.y); t.pick('statue'); t.down(shop.x - 6, shop.y); t.down(shop.x - 8, shop.y);
  t.pick('pot-terracotta'); t.down(shop.x + 300, shop.y + 300);
  assert.ok(Math.abs(t.appeal() - 0.11) < 1e-9, `${t.appeal()}`); assert.equal(t.placed, 4);
  assert.deepEqual(t.labels.map(l => l.text), ['Stand In for Bronze golfer statue']);
  assert.equal(new PropsTool(host(null).ctx).appeal(), 0, 'no range: no appeal');
  // the mats refuse a prop
  const bay = sc.bays[0]!.stand; t.pick('bench'); t.move(bay.x, bay.y); assert.equal(t.ghost!.why, 'Not on the hitting mats');
  const tg = sc.targets[0]!; t.move(tg.x, tg.y); assert.equal(t.ghost!.why, 'Not on a target green');
});

test('the save: a Props tool prop keeps its kind (the 7th element), its view (its picture) and its spot; old tuples read as before', () => {
  const view = turned('ref:landmark-fountain-v2', 2).id;
  const t = propTuple(view, { x: 10.12345, y: 3, flip: false, scale: 1.1, decor: 'fountain' });
  assert.deepEqual(t, [view, 10.123, 3, 0, 1.1, 0, 'fountain']);
  assert.deepEqual(tupleMarks(JSON.parse(JSON.stringify(t))), { decor: 'fountain' });
  assert.deepEqual(propTuple('world:bush_0', { x: 1, y: 2, flip: true, scale: 1, plant: 1 }), ['world:bush_0', 1, 2, 1, 1, 1]);
  assert.deepEqual(propTuple('world:bench', { x: 1, y: 2, flip: false, scale: 1 }), ['world:bench', 1, 2, 0, 1]);
  assert.deepEqual(tupleMarks(['world:bush_0', 1, 2, 1, 1, 1]), { plant: 1 });
  assert.deepEqual(tupleMarks(['world:bench', 1, 2, 0, 1]), {}, 'an old save\'s tuple');
  assert.deepEqual(tupleMarks(['world:bench', 1, 2, 0, 1, 0, 'gone-kind']), {}, 'an unknown kind loads as a plain prop');
  assert.equal(decorKeyOf('fountain'), 'fountain'); assert.equal(decorKeyOf(3), null);
});

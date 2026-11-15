// #1284 (the owner, 2026-11-14): "separate man made and natural props. natural props are paintable and man made you place one by one and make sure we dont show any
// maple leave icon but that we generate a proper icon for every leaf"; later: "Move the 'New course props' props into the appropriate places. that section was so i could
// see all the new art generated. remove it"; and of the flyout (#1300): "these icons are too small ... make it a side menu and make them larger".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECOR, DECOR_BY_KEY, DECOR_GROUPS, PROP_SIDES, isBrushed, newGroupOf, propMenuLists, propsShown, sideOfGroup } from '../src/game/golf/decor';
import { PropsTool, type PropsHostCtx } from '../src/game/golf/propstool';
import { RAIL } from '../src/ui/rail-items';
import { leavesOf, menuOf, type MenuCtx, type MenuRow } from '../src/ui/flyout-menu';
import { isBigGrid } from '../src/ui/Flyouts';
import { LIBRARY } from '../src/game/library';
import type { Prop } from '../src/game/types';
const LIB = new Map(LIBRARY.map((it, i) => [it.id, i]));
import { isPerson } from '../src/game/person';

const ctx = (): MenuCtx => ({ golf: true, ui: null, roads: [], paths: [], junctions: [], surfaces: [], cares: [], practice: [{ id: 'putting', name: 'Putting green', why: null }], materials: [], plants: [], newHoleWhy: null, range: [], ...propMenuLists() });
const facilities = () => menuOf(RAIL.find(r => r.id === 'course')!, ctx()).find(r => r.key === 'facilities')!.children!;
const townDecor = () => menuOf(RAIL.find(r => r.id === 'towndecor')!, ctx());
/** every row of a menu, deep */
const allRows = (rows: readonly MenuRow[]): MenuRow[] => rows.flatMap(r => [r, ...allRows(r.children ?? [])]);

test('no "New" section is left: every picture of a review section is in exactly one ordinary group', () => {
  assert.ok(!DECOR_GROUPS.some(g => /^new\b/i.test(g.name)), `no group named New: ${DECOR_GROUPS.map(g => g.name).join(', ')}`);
  for (const cat of ['Course props', 'Trees', 'Lake props', 'Buildings', 'Eight-view objects']) assert.ok(!DECOR_GROUPS.some(g => g.id === `new:${cat}`), `${cat} is no group of its own`);
  const review = LIBRARY.filter(i => /^New: (Course props|Trees|Lake props|Buildings|Eight-view objects)$/.test(i.cat) && !isPerson(i));
  const cards = new Map<string, string[]>();
  for (const d of DECOR) (cards.get(d.id) ?? cards.set(d.id, []).get(d.id)!).push(d.group);
  let n = 0;
  for (const it of review) {
    const gs = cards.get(it.id); if (!gs) continue; n++;
    assert.equal(gs.length, 1, `${it.id}: one card`);
    assert.ok(!gs[0]!.startsWith('new:') && DECOR_GROUPS.some(g => g.id === gs[0]), `${it.id} (${it.cat}) is in an ordinary group: ${gs[0]}`);
    assert.equal(gs[0], newGroupOf(it));
  }
  assert.ok(n > 40, `the review sections' cards were checked (${n})`);
  // where some went (the issue asked for the list)
  assert.equal(DECOR_BY_KEY.get('newprop-park-bench')!.group, 'furniture'); assert.equal(DECOR_BY_KEY.get('newprop-yardage-posts')!.group, 'signs');
  assert.equal(DECOR_BY_KEY.get('newprop-stone-bridge')!.group, 'lake'); assert.equal(DECOR_BY_KEY.get('newprop-rowboat')!.group, 'lake');
  assert.equal(DECOR_BY_KEY.get('newprop-flowering-tree')!.group, 'trees'); assert.equal(DECOR_BY_KEY.get('newprop-golf-cart')!.group, 'new:Vehicles');
  assert.equal(DECOR_BY_KEY.get('newprop-clubhouse-manor')!.group, 'clubhouses'); assert.equal(DECOR_BY_KEY.get('newprop-brick-storefront')!.group, 'buildings');
});

test('every prop is natural (painted) or man-made (placed): trees, shrubs, flowers, rocks and the desert are natural; furniture, signs and structures man-made', () => {
  for (const g of DECOR_GROUPS) assert.ok(PROP_SIDES.some(s => s.id === g.side), g.id);
  assert.deepEqual(DECOR_GROUPS.filter(g => g.side === 'natural').map(g => g.id), ['trees', 'plants', 'stone', 'desert']);
  for (const d of DECOR) {
    if (sideOfGroup(d.group) === 'natural') assert.ok(d.natural || d.mix, `${d.key}: a natural group's card is a natural thing`);
    else assert.ok(!isBrushed(d), `${d.key}: man-made, placed one by one`);
  }
  for (const k of ['bench', 'bin', 'lamp', 'board', 'fountain', 'statue', 'pot-terracotta', 'hedge', 'kit-hedge']) assert.equal(sideOfGroup(DECOR_BY_KEY.get(k)!.group), 'manmade', k);
  for (const k of ['kit-shrub', 'fern', 'kit-boulder-s', 'kit-palm-fan', 'tree-maple', 'desert-cactus']) assert.ok(isBrushed(DECOR_BY_KEY.get(k)!), `${k} is painted`);
  // a side is a focus of its own: the panel lists that side's groups
  const nat = propsShown({ where: 'course', group: null, all: false, focus: 'natural' });
  assert.ok(nat.length >= 3 && nat.every(g => sideOfGroup(g.id) === 'natural'), nat.map(g => g.id).join());
});

test('the Props flyout: All props, Natural ▸ and Man-made ▸, each a level to the side, large tiles, no maple leaf anywhere', () => {
  const props = allRows(facilities()).find(r => r.key === 'props')!;
  assert.deepEqual(props.children!.map(r => r.label), ['All props', 'Natural', 'Man-made']);
  for (const side of props.children!.slice(1)) {
    assert.ok(side.children && side.tile, `${side.label}: a level of its own with its tile`);
    assert.match(side.children![0]!.label, /^All /);
    assert.ok(isBigGrid(side.children!), `${side.label}'s level is drawn with large tiles`);
  }
  assert.ok(isBigGrid(props.children!), 'the Props level too');
  assert.ok(!isBigGrid(facilities()), 'the Facilities level keeps its own tiles');
  for (const rows of [facilities(), townDecor()]) for (const r of allRows(rows)) {
    if (r.caption) continue;
    assert.notEqual(r.icon, 'leaf', `${r.label}: no maple leaf`);
    if (r.leaf?.act?.k === 'props' && r.leaf.act.group !== 'buildings') assert.ok(r.tile || r.thumb, `${r.label}: a picture of its own (a tile, or its first card's)`);
  }
  for (const r of allRows(facilities())) if (r.thumb) assert.ok(LIBRARY.some(i => i.id === r.thumb), `${r.label}: ${r.thumb} is a library picture`);
  // every group is reachable from a side
  const leaves = new Set(leavesOf(facilities()).map(l => (l.row.leaf?.act as { group?: string } | undefined)?.group));
  for (const g of propMenuLists().propGroups) assert.ok(leaves.has(g.id), `${g.name} is a leaf`);
});

// ---- the brush
/** a fake host (props-variety.test.ts's) */
function host() {
  const props = new Set<Prop>(); let uid = 1, money = 1e6, steps = 0;
  const ctx: PropsHostCtx = {
    golf: () => true, item: id => LIB.get(id), idOf: p => LIBRARY[p.item]!.id,
    scaleOf: (_i, want) => want ?? 1, footprint: (_i, x, y, k) => [x - 0.4 * k, y - 0.4 * k, x + 0.4 * k, y + 0.4 * k],
    spot: { owned: x => x >= 0 && x < 2000, water: () => false, road: () => false, course: () => '' },
    propsIn: b => [...props].filter(p => p.x1 > b[0] && p.x0 < b[2] && p.y1 > b[1] && p.y0 < b[3]), props: () => props, propName: p => LIBRARY[p.item]!.name,
    scene: () => null,
    addProp: (item, x, y, k, flip = false) => { const p: Prop = { uid: uid++, item, x, y, flip, scale: k, x0: x - 0.4 * k, y0: y - 0.4 * k, x1: x + 0.4 * k, y1: y + 0.4 * k }; props.add(p); return p; },
    removeProp: p => { props.delete(p); },
    propAt: () => null, tileAt: (mx, my) => ({ x: mx, y: my }),
    selected: () => null, select: () => {}, hover: () => {},
    money: () => money, spend: n => { money -= n; },
    step: (_label, run) => { steps++; run(); },
    undo: () => {}, redo: () => {}, save: () => {}, toast: () => {}, emit: () => {},
  };
  return { ctx, props: { get length() { return props.size; }, map: <T>(f: (p: Prop) => T) => [...props].map(f) }, steps: () => steps };
}

test('a natural prop is painted: a click lays one, a drag lays a scatter as one step; density spreads or packs it; a man-made one is placed one by one', () => {
  const run = (key: string, density: 0 | 1 | 2) => {
    const h = host(), t = new PropsTool(h.ctx); t.pick(key); t.setDensity(density);
    t.down(100, 100); for (let i = 1; i <= 60; i++) t.move(100 + i * 0.5, 100); t.up();
    return { n: h.props.length, steps: h.steps(), keys: new Set(h.props.map(p => p.decor)) };
  };
  const sparse = run('kit-shrub', 0), normal = run('kit-shrub', 1), dense = run('kit-shrub', 2);
  assert.ok(normal.n > 3, `a drag lays a scatter (${normal.n})`); assert.equal(normal.steps, 1, 'one undo step');
  assert.ok(sparse.n < normal.n && normal.n < dense.n, `density: ${sparse.n} < ${normal.n} < ${dense.n}`);
  const click = (() => { const h = host(), t = new PropsTool(h.ctx); t.pick('kit-shrub'); t.down(100, 100); t.up(); return h.props.length; })();
  assert.equal(click, 1, 'a click lays one');
  const bench = run('bench', 1);
  assert.equal(bench.n, 1, 'a man-made prop: a drag still places one');
});

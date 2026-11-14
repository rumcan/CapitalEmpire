// T400 (#1078; the owner, 2026-11-09: "why are the golf shit in the town decoration menu and not in the facilities menu?"): the golf props (the owner's new
// tournament and course pictures: stalls, event structures, seating, media, the course props, the range's props, the vehicles, the clubhouses) were listed in
// the bottom bar's Town decoration, because their library categories were not in decor.ts's CAT_PLACE table and a category not listed reads as both's.
// They are the course's: Facilities lists them, by the kinds the tournament kit meant (Tournament structures, Course furniture, Range props, Course
// vehicles); Town decoration lists the town's props alone. Pure: the catalogue, the flyout rows as App.tsx builds them (propMenuLists) and the Props
// panel rendered for a stand-in tool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { CAT_PLACE, DECOR, DECOR_BY_KEY, DECOR_GROUPS, PROP_KINDS, isGolfItem, kindOfGroup, placeOf, propMenuLists, propsShown, shownIn, standsIn, type DecorItem, type PropsView } from '../src/game/golf/decor';
import { PropsTool, type PropsHostCtx } from '../src/game/golf/propstool';
import { PropsPanel } from '../src/ui/course/PropsPanel';
import { RAIL } from '../src/ui/rail-items';
import { leavesOf, menuOf, type MenuCtx, type MenuRow } from '../src/ui/flyout-menu';
import { LIBRARY } from '../src/game/library';
import type { Game } from '../src/game/engine';

const LIB = new Map(LIBRARY.map((it, i) => [it.id, i]));
const by = (key: string) => DECOR_BY_KEY.get(key)!;
/** the menu context App.tsx builds, as far as these two menus read it */
const ctx = (): MenuCtx => ({ golf: true, ui: null, roads: [], paths: [], junctions: [], surfaces: [], cares: [], practice: [{ id: 'putting', name: 'Putting green', why: null }, { id: 'chipping', name: 'Chipping green and bunker', why: null }], materials: [{ id: 'dirt', name: 'Dirt' }], plants: [{ id: 'trees', name: 'Trees' }], newHoleWhy: null, range: [], ...propMenuLists() });
// (#1272: Facilities is the sixth tile of the Course flyout: its rows are that tile's children)
const fac = () => menuOf(RAIL.find(r => r.id === 'course')!, ctx()).find(r => r.key === 'facilities')!.children!, town = () => menuOf(RAIL.find(r => r.id === 'towndecor')!, ctx());
/** the props leaves of a menu: each one's label and group (null: All props; a kind's id: its groups) */
const propLeaves = (rows: MenuRow[]) => leavesOf(rows).filter(l => l.row.leaf?.act?.k === 'props').map(l => ({ label: l.row.label, group: (l.row.leaf!.act as { k: 'props'; group: string | null }).group, path: l.path }));
/** the cards a props leaf shows in a view, as the panel lists them (a flyout's group or kind a focus; the town's Buildings their own view) */
const cardsOf = (where: 'course' | 'town', group: string | null): DecorItem[] =>
  propsShown({ where, group: group === 'buildings' ? 'buildings' : null, all: false, focus: group === 'buildings' ? null : (group as PropsView['focus']) }).flatMap(g => g.items);
const golf = () => DECOR.filter(d => !d.hidden && isGolfItem(d));
/** a tool with nothing behind it but the library's picture lookup (the panel reads no more of it), and the panel's markup for it */
const tool = () => new PropsTool({ golf: () => true, item: (id: string) => LIB.get(id), selected: () => null, emit: () => {} } as unknown as PropsHostCtx);
const html = (t: PropsTool) => renderToStaticMarkup(createElement(PropsPanel, { game: { decor: t, golf: { start: 'course' }, money: 1e9, emit: () => {} } as unknown as Game }));

test('the golf props are the course\'s: the owner\'s new golf categories are in the place table, the town\'s own pictures are not', () => {
  for (const cat of ['New: Course props', 'New: Event structures', 'New: Event structures (shabby)', 'New: Stalls', 'New: Stalls (shabby)', 'New: Seating', 'New: Media', 'New: Range', 'New: Vehicles'])
    assert.equal(CAT_PLACE[cat], 'course', cat);
  assert.equal(CAT_PLACE['New: Eight-view objects'], 'town'); assert.equal(CAT_PLACE['New: Buildings'], 'town');
  // a few of each kind, by their cards
  for (const k of ['newprop-green-food-kiosk', 'newprop-pro-shop-kiosk', 'newprop-tarp-seating', 'newprop-camera-tower', 'newprop-rope-barrier', 'newprop-ride-mower', 'newprop-shuttle-bus', 'newprop-practice-net', 'object8-golf:range-practice-net', 'newprop-clubhouse-manor', 'newprop-gate-pillars'])
    assert.equal(placeOf(by(k)), 'course', k), assert.ok(isGolfItem(by(k)), `${k} is a golf prop`), assert.equal(standsIn(by(k), 'town'), 'course', `${k} placed from the town stands on the course's land`);
  // the town's own: the storefronts and the street and park things
  for (const k of ['newprop-neon-storefront-row', 'newprop-brick-storefront']) assert.equal(placeOf(by(k)), 'town', k);
  for (const k of ['bench', 'lamp', 'bin', 'flower-bed', 'fountain', 'pot-terracotta', 'newprop-wooden-dock']) assert.ok(!isGolfItem(by(k)), `${k} is not a golf prop`);
  // every item of every golf category is golf (the catalogue's picture categories, not a hand list)
  const cat = new Map(LIBRARY.map(i => [i.id, i.cat]));
  for (const d of DECOR) if (CAT_PLACE[cat.get(d.id) ?? ''] === 'course' && d.group !== 'buildings') assert.ok(isGolfItem(d), `${d.key} (${cat.get(d.id)})`);
  assert.ok(golf().length > 150, `${golf().length} golf props`);
});

test('Facilities lists the golf props by kind: a row each after Decoration, every golf prop reachable by a group row, none listed under two kinds or two groups', () => {
  const kinds = propMenuLists().propKinds;
  assert.deepEqual(kinds.map(k => k.id), PROP_KINDS.map(k => k.id), 'every kind has a card');
  for (const k of PROP_KINDS) assert.ok(!DECOR_GROUPS.some(g => (g.id as string) === k.id), `${k.id}: a kind's id is no group's (a flyout's focus is one or the other)`);
  assert.deepEqual(kinds.find(k => k.id === 'structures')!.groups.map(g => g.id).slice(0, 2), ['new:Event structures', 'new:Event structures (shabby)'], 'the structures, the event ones first');
  assert.deepEqual(fac().map(r => r.label), ['Practice', 'Plants', 'Decoration', ...PROP_KINDS.map(k => k.name), 'Build on your property'], 'a row a kind, after Decoration');
  const rows = fac();
  for (const k of kinds) {
    const row = rows.find(r => r.label === k.name)!;
    // a kind of several groups is a flyout of them under All <kind>; a kind of one group is that group's leaf
    if (k.groups.length === 1) assert.ok(row.leaf, `${k.name} is a leaf`);
    else { assert.ok(!row.leaf && row.children, `${k.name} opens a flyout`); assert.deepEqual(row.children!.map(c => c.label), [`All ${k.name.toLowerCase()}`, ...k.groups.map(g => g.name)]); }
  }
  // every golf prop is reachable from Facilities by a group row (not only by an All row)
  const groupLeaves = propLeaves(rows).filter(l => DECOR_GROUPS.some(g => g.id === l.group));
  const reach = new Set(groupLeaves.flatMap(l => cardsOf('course', l.group).map(d => d.key)));
  const lost = golf().filter(d => !reach.has(d.key)).map(d => d.key);
  assert.deepEqual(lost, [], 'every golf prop is reachable from Facilities');
  // ...and from the kind rows: the kind's All row shows the groups of the kind
  for (const k of kinds) {
    const all = new Set(cardsOf('course', k.id).map(d => d.key));
    for (const g of k.groups) for (const d of cardsOf('course', g.id)) assert.ok(all.has(d.key), `${d.key} is in ${k.name}`);
    assert.ok([...all].every(key => kindOfGroup(by(key).group) === k.id), `${k.name} lists its own groups' cards alone`);
  }
  // nothing is listed twice: a group is one row (an everyday group or a kind's), a golf prop is in one group and so under one kind
  const ids = groupLeaves.map(l => l.group), unique = new Set(ids);
  assert.equal(unique.size, ids.length, `a group is one row: ${ids.join(', ')}`);
  const general = new Set(propMenuLists().propGroups.map(g => g.id)), inKinds = new Set(kinds.flatMap(k => k.groups.map(g => g.id)));
  for (const g of general) assert.ok(!inKinds.has(g), `${g} is an everyday group and a kind's`);
  // the town's props the course has no use for (the storefronts, the eight-view houses) are not in Facilities' groups' cards
  const facilityCards = new Set(groupLeaves.flatMap(l => cardsOf('course', l.group).map(d => d.key)));
  for (const k of ['newprop-neon-storefront-row', 'newprop-brick-storefront']) assert.ok(!facilityCards.has(k), `${k} is the town's`);
});

test('Town decoration lists no golf prop: not in any group row, not in All props, no golf group, no All props box', () => {
  const leaves = propLeaves(town());
  assert.ok(leaves.length >= 6, 'the town has its groups');
  for (const l of leaves) for (const d of cardsOf('town', l.group)) assert.ok(!isGolfItem(d), `${l.label}: ${d.key} is a golf prop`);
  for (const l of leaves) if (l.group && l.group !== 'buildings') assert.ok(cardsOf('town', l.group).length > 0, `${l.label} has cards for the town`);
  // no row is a group made of golf props alone, and none is a golf kind
  const golfGroups = DECOR_GROUPS.filter(g => DECOR.filter(d => d.group === g.id && !d.hidden).every(isGolfItem)).map(g => g.id);
  assert.ok(golfGroups.length >= 5, `the golf groups: ${golfGroups.join(', ')}`);
  for (const l of leaves) assert.ok(!golfGroups.includes(l.group as never), `${l.label} is a golf group`);
  const labels = town().map(r => r.label), props = town().find(r => r.label === 'Props')!;
  for (const k of PROP_KINDS) assert.ok(!labels.includes(k.name) && !props.children!.some(c => c.label === k.name), `${k.name} is Facilities'`);
  // the catalogue as the town's view lists it
  const cards = DECOR.filter(d => !d.hidden && shownIn(d, 'town'));
  assert.ok(cards.length > 100 && cards.every(d => !isGolfItem(d)), 'the town view has no golf tag');
  // Town decoration has no All props: ticking the box (it is not drawn) leaves the town's props alone
  const all = propsShown({ where: 'town', group: null, all: true, focus: null }).flatMap(g => g.items), plain = propsShown({ where: 'town', group: null, all: false, focus: null }).flatMap(g => g.items);
  assert.deepEqual(all.map(d => d.key), plain.map(d => d.key));
  assert.ok(all.every(d => !isGolfItem(d)));
});

test('the panels: the town\'s lists no golf card and draws no All props box; the course\'s has the box and each kind its own heading', () => {
  const t = tool(); t.setView('town');
  let h = html(t);
  assert.doesNotMatch(h, /data-testid="props-all"/, 'no All props box in the town');
  for (const d of golf()) assert.ok(!h.includes(`data-card="prop-${d.key}"`), `${d.key} in the town's panel`);
  t.setAll(true); assert.equal(t.all, false); h = html(t);
  for (const d of golf()) assert.ok(!h.includes(`data-card="prop-${d.key}"`), `${d.key} in the town's panel, the box ticked`);
  assert.match(h, /Showing (\d+) of \1 props/, 'the town counts against the town');
  assert.doesNotMatch(h, /overflow-x-(auto|scroll)/, 'no sideways scroll');
  // the course's panel: the box, and a kind opened from Facilities shows its groups alone under its own name
  t.setView('course'); h = html(t);
  assert.match(h, /data-testid="props-all"/);
  for (const k of PROP_KINDS) {
    t.setFocus(k.id); h = html(t);
    const shown = propsShown({ where: 'course', group: null, all: false, focus: k.id });
    assert.ok(shown.length > 0 && shown.every(g => kindOfGroup(g.id) === k.id), k.name);
    assert.match(h, new RegExp(`${k.name}`)); assert.match(h, new RegExp(`\\(${k.name} only\\)`));
    for (const g of shown) for (const d of g.items) assert.ok(h.includes(`data-card="prop-${d.key}"`), `${d.key} in ${k.name}`);
    assert.doesNotMatch(h, /overflow-x-(auto|scroll)/);
  }
});

test('the tool: the town\'s view never takes All props, and opening it clears one ticked in the course\'s', () => {
  const t = tool(); t.setView('course'); t.setAll(true); assert.equal(t.all, true);
  t.setView('town'); assert.equal(t.all, false, 'opening the town clears the box');
  t.setAll(true); assert.equal(t.all, false, 'and the town keeps it off');
  t.setView('course'); t.setAll(true); assert.equal(t.all, true, 'the course keeps it');
  // a kind in the flyout focuses its groups and takes the box off, as a group does
  t.setFocus('structures'); assert.equal(t.focus, 'structures'); assert.equal(t.all, false);
});

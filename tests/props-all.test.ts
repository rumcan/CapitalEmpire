// T369 (#1024; the owner, 2026-11-08: "I also can't see all props when I click the checkbox"): the Props panel's "All props" box shows every
// prop the tool can place, in its groups. It once only widened the place (the course's props, the town's), so with a group opened from the
// toolbar's flyout (Props ▸ Plants) the box left the panel on that group alone. Now the box lets go of the group; picking a group takes the box off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { DECOR, DECOR_GROUPS, placeableProps, propsCount, propsShown, shownIn, type DecorGroup, type PropsView } from '../src/game/golf/decor';
import { PropsTool, type PropsHostCtx } from '../src/game/golf/propstool';
import { PropsPanel } from '../src/ui/course/PropsPanel';
import { LIBRARY } from '../src/game/library';
import { isPerson } from '../src/game/person';
import type { Game } from '../src/game/engine';

const LIB = new Map(LIBRARY.map((it, i) => [it.id, i]));
const view = (over: Partial<PropsView> = {}): PropsView => ({ where: 'course', group: null, all: false, focus: null, ...over });
/** a tool with nothing behind it but the library's picture lookup (the panel reads no more of it) */
const tool = () => new PropsTool({ golf: () => true, item: (id: string) => LIB.get(id), selected: () => null, emit: () => {} } as unknown as PropsHostCtx);
/** the panel's markup for a tool: the game it reads is the tool, the money and no range */
const html = (t: PropsTool) => renderToStaticMarkup(createElement(PropsPanel, { game: { decor: t, golf: { start: 'course' }, money: 1e9, emit: () => {} } as unknown as Game }));
const cardsIn = (h: string) => (h.match(/data-card="prop-/g) ?? []).length;
const groupsIn = (h: string) => [...h.matchAll(/data-group="([^"]+)"/g)].map(m => m[1]!);

test('the placeable props: every prop of the owner\'s new categories has its card, and the catalogue\'s count is the panel\'s every-prop count', () => {
  const placeable = placeableProps();
  assert.ok(placeable.length > 300, `${placeable.length} placeable props`);
  assert.equal(new Set(placeable.map(d => d.key)).size, placeable.length, 'one card each');
  // the library's own list of the new props (every "New: " category: one card a prop, a tree one card for its four views): none is left out
  // (T375: the eight-view art's rows, category "New: Eight-view objects", are the views the lots draw a building with, not props: no card)
  // (T401: the People props are no card: people are never placed)
  const fresh = LIBRARY.filter(i => i.cat.startsWith('New: ') && !isPerson(i) && !i.id.startsWith('object8:') && (i.kind !== 'tree' || i.id.endsWith(':ne')));
  const cards = new Set(placeable.map(d => d.id));
  for (const it of fresh) assert.ok(cards.has(it.id), `${it.id} (${it.cat}) has a card`);
  // ...and no more: a card in a new group is a library New: item (the tournament kit moves seven of them to its own group, and the eight-view sets get one card each, their first view)
  const freshIds = new Set(fresh.map(i => i.id));
  for (const d of placeable) if (d.group.startsWith('new:') && !d.id.startsWith('object8:')) assert.ok(freshIds.has(d.id), `${d.key} is a library New: item`);
  // every new category is a group of its own, in the groups' order
  for (const cat of new Set(fresh.map(i => i.cat))) assert.ok(DECOR_GROUPS.some(g => g.id === `new:${cat.slice(5)}`), `${cat} is a group`);
  // the kit's, the desert's and the catalogue's own items are all there: every picture a card, a variant or a mixed brush places
  const placed = new Set<string>(); for (const d of placeable) { placed.add(d.id); for (const v of d.variants ?? []) placed.add(v); for (const m of d.mix ?? []) placed.add(m.id); }
  for (const it of LIBRARY.filter(i => /^kit:(boulder|shrub|flowers|palm|lamp|granite|water-edge)/.test(i.id))) assert.ok(placed.has(it.id), `${it.id} can be placed`);
  // (the desert's removed pictures stay out of its cards on purpose: desert-props.ts)
  for (const d of placeable.filter(x => x.group === 'desert')) for (const id of [d.id, ...(d.variants ?? [])]) assert.ok(LIB.has(id), `${d.key}: ${id} is in the library`);
  // every prop of every view: All props shows the whole catalogue, the course's and the town's alike (the frame tree is not sold in the panel)
  // (T400: the town has no All props box: its panel lists the town's props alone, so the whole catalogue is the course's)
  assert.equal(propsCount(view({ where: 'course', all: true })), placeable.length, 'course: All props');
  assert.ok(propsCount(view({ where: 'town', all: true })) < placeable.length, "town: the town's props alone");
  assert.equal(DECOR.filter(d => d.hidden).length, 1, 'only the hole frame\'s tree is kept out');
});

test('All props lists every group, whichever group the flyout opened and wherever the panel was opened from', () => {
  const all = placeableProps().length;
  for (const where of ['course', 'town'] as const) {
    // no group opened, a group opened: All props is the same whole catalogue
    for (const focus of [null, ...DECOR_GROUPS.map(g => g.id)] as (DecorGroup | null)[]) {
      const shown = propsShown(view({ where, all: true, focus }));
      // (T400: the town has no All props: the box changes nothing there, the golf props are Facilities')
      if (where === 'town') { assert.deepEqual(shown, propsShown(view({ where, all: false, focus })), `town / ${focus}: the box changes nothing`); continue; }
      assert.equal(shown.reduce((n, g) => n + g.items.length, 0), all, `${where} / ${focus}: every prop`);
      assert.deepEqual(shown.map(g => g.id), DECOR_GROUPS.map(g => g.id), `${where} / ${focus}: every group, in its order`);
    }
    // not ticked: the place's props; a group opened shows alone
    const place = propsCount(view({ where }));
    assert.ok(place < all, `${where}: fewer without the box (the town's buildings, the course's own)`);
    assert.equal(place, DECOR.filter(d => !d.hidden && d.group !== 'buildings' && shownIn(d, where, false)).length, `${where}: the place's props`);
    for (const g of DECOR_GROUPS) if (g.id !== 'buildings') {
      const one = propsShown(view({ where, focus: g.id }));
      assert.ok(one.length <= 1 && one.every(x => x.id === g.id), `${where}: ${g.id} alone`);
    }
  }
  // the town's Buildings are their own view: their group alone, all of it, whatever the box
  const b = propsShown(view({ where: 'town', group: 'buildings' }));
  assert.deepEqual(b.map(g => g.id), ['buildings']); assert.equal(b[0]!.items.length, DECOR.filter(d => d.group === 'buildings').length);
});

test('the tool: ticking All props lets go of the flyout\'s group; picking a group takes the box off', () => {
  const t = tool(), all = placeableProps().length;
  t.setView('course'); t.setFocus('plants');
  const plants = propsCount(t), only = DECOR.filter(d => d.group === 'plants' && !d.hidden).length;
  assert.equal(plants, only, 'the group alone'); assert.ok(plants < all);
  t.setAll(true);
  assert.equal(t.focus, null, 'the box let go of the group'); assert.equal(t.all, true);
  assert.equal(propsCount(t), all, 'every prop');
  t.setAll(false);
  assert.equal(t.all, false); assert.equal(propsCount(t), propsCount(view()), 'back to the place\'s props, every group');
  // a box ticked earlier does not hide the group picked next
  t.setAll(true); t.setFocus('water');
  assert.equal(t.all, false, 'the group took the box off'); assert.deepEqual(propsShown(t).map(g => g.id), ['water']);
  // the flyout's All props row (no group) leaves the box as it is; opening a view clears the group
  t.setFocus(null); assert.equal(t.all, false); assert.equal(propsCount(t), propsCount(view()));
  t.setFocus('stone'); t.setView('town'); assert.equal(t.focus, null);
});

test('the panel: the cards on screen are the count it says, in their groups, and it never asks for a sideways scroll', () => {
  const t = tool(), all = placeableProps().length;
  // Props ▸ Plants, then the box: the panel lists every prop in every group (it listed the Plants alone)
  t.setView('course'); t.setFocus('plants');
  let h = html(t);
  assert.equal(cardsIn(h), DECOR.filter(d => d.group === 'plants' && !d.hidden).length); assert.deepEqual(groupsIn(h), ['plants']);
  assert.match(h, /Showing \d+ of \d+ props \(Plants only\)/);
  t.setAll(true); h = html(t);
  assert.equal(cardsIn(h), all, 'the cards shown equal the placeable count');
  assert.deepEqual(groupsIn(h), DECOR_GROUPS.map(g => g.id), 'in their groups');
  assert.match(h, new RegExp(`Showing ${all} of ${all} props`)); assert.match(h, new RegExp(`data-shown="${all}" data-placeable="${all}"`));
  assert.doesNotMatch(h, /overflow-x-(auto|scroll)/, 'no sideways scroll');
  // the town's panel (T400): the town's props alone, with no All props box: ticking it does nothing, and the golf props are Facilities'
  t.setAll(false); t.setView('town'); h = html(t); assert.equal(cardsIn(h), propsCount(view({ where: 'town' }))); assert.doesNotMatch(h, /data-testid="props-all"/, 'no All props box in the town');
  t.setAll(true); assert.equal(t.all, false, 'the town keeps the box off'); assert.equal(cardsIn(html(t)), propsCount(view({ where: 'town' }))); assert.ok(cardsIn(html(t)) < all);
  // the town's Buildings carry no box (their own view)
  t.setAll(false); t.setView('town', 'buildings'); h = html(t); assert.doesNotMatch(h, /data-testid="props-all"/); assert.deepEqual(groupsIn(h), ['buildings']);
});

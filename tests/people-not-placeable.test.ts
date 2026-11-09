// T401 (#1079; the owner, 2026-11-09: "why can I place a golfer swinging outside town on a random piece of desert only. the people should not be placeable."):
// the owner's new People props (a golfer swinging or putting, a caddie, a marshal) were cards of the Props tool's catalogue, so a player could drop a
// person anywhere. People are the game's to draw (golfers, crowds, staff, townsfolk: walkers), never the player's to place. One predicate (src/game/person.ts
// isPerson: the picture's tag, category or id) keeps them out of the Props catalogue (Town decoration, Facilities), the studio's palettes (the lot lab's, the
// Lot review's quick pick) and the save loader, and the library and the object registry carry the tag at their source so they cannot come back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECOR, DECOR_GROUPS, placeableProps, propsShown } from '../src/game/golf/decor';
import { PEOPLE_CATS, dropPeople, isPerson, isPersonId } from '../src/game/person';
import { GOLFER_PEOPLE, LIBRARY, SPECTATOR_PEOPLE, WALKER_PEOPLE } from '../src/game/library';
import { groupCats, paletteSprites, placeable } from '../src/game/dev/lot-lab-palette';
import { QUICK_PROPS } from '../src/game/lots/item-kinds';
import { propTuple, tupleMarks } from '../src/game/golf/decor';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const LIB = new Map(LIBRARY.map(i => [i.id, i]));
/** a person by its words, broader than the predicate (the sweep's net: an id or a category that reads as a person, whatever the predicate says) */
const PERSONISH = /(^|[:_\-/])(golfers?|caddies|caddie|marshals?|spectators?|crowd|persons?|people|townsfolk|townspeople|staff|workers?)([:_\-/\d]|$)/i;

test('no card of the Props catalogue is a person: by kind, category, tag or id, in any group of Town decoration or Facilities', () => {
  const cards = placeableProps();
  assert.ok(cards.length > 250, `${cards.length} placeable props`);
  const ids = new Set<string>();
  for (const d of cards) { ids.add(d.id); for (const v of d.variants ?? []) ids.add(v); for (const m of d.mix ?? []) ids.add(m.id); }
  for (const id of ids) {
    const it = LIB.get(id); assert.ok(it, `${id} is in the library`);
    assert.ok(!isPerson(it!), `${id}: a person`);
    assert.notEqual(it!.kind, 'walker', `${id}: a walker`); assert.ok(!PEOPLE_CATS.has(it!.cat), `${id}: a people category (${it!.cat})`); assert.ok(it!.person !== true, `${id}: tagged a person`);
    assert.ok(!isPersonId(id), `${id}: named as a person`); assert.ok(!PERSONISH.test(id) && !PERSONISH.test(it!.cat), `${id} (${it!.cat}) reads as a person`);
  }
  // (a golfer statue is stone, not a person: its picture is a coin-operated horse ride, kind decor)
  assert.ok(DECOR.some(d => d.key === 'statue'), 'the golfer statue stays');
  // the menus: no People group (an empty one would be a row with nothing in it), whichever view and whether All props is ticked
  assert.ok(!DECOR_GROUPS.some(g => /people/i.test(g.id) || /people/i.test(g.name)), 'no People group');
  for (const g of DECOR_GROUPS) assert.ok(DECOR.some(d => d.group === g.id), `${g.id} has cards`);
  for (const where of ['course', 'town'] as const) for (const all of [false, true]) {
    const shown = propsShown({ where, group: null, all, focus: null }).flatMap(g => g.items);
    assert.ok(shown.length > 100 && shown.every(d => !isPerson(LIB.get(d.id)!)), `${where}${all ? ' (All props)' : ''}`);
  }
  assert.ok(!DECOR.some(d => /golfer (swinging|putting)|caddie|marshal/i.test(d.name) && d.key !== 'statue'), 'none of the People props by name');
});

test('the studio\'s palettes offer no person: the lot lab\'s strip, the Lot review\'s quick pick and its category lists', () => {
  const all = paletteSprites('all', '', '');
  assert.ok(all.length > 300, `${all.length} sprites`);
  for (const it of all) assert.ok(!isPerson(it) && it.kind !== 'walker', `${it.id} (${it.cat}) is offered`);
  for (const g of ['all', 'plants', 'props', 'buildings', 'vehicles'] as const) for (const [cat] of groupCats(g)) assert.ok(!PEOPLE_CATS.has(cat), `${g}: the category ${cat}`);
  // the Lot review's category chips and lists are `placeable` over the library, the same net
  const review = LIBRARY.filter((it, i) => placeable(it, i));
  assert.equal(review.length, all.length);
  assert.ok(QUICK_PROPS.length > 15, 'the quick picks stand');
  for (const id of QUICK_PROPS) assert.ok(LIB.has(id) && !isPerson(LIB.get(id)!), `${id}: the quick pick`);
  // the sweep: nothing that reads as a person is offered, and every person the library holds is refused
  assert.deepEqual(review.filter(it => PERSONISH.test(it.id) || PERSONISH.test(it.cat)).map(it => it.id), [], 'nothing that reads as a person is placeable');
  const people = LIBRARY.filter(isPerson);
  assert.ok(people.length > 6000, `${people.length} people in the library (the game draws them)`);
  LIBRARY.forEach((it, i) => { if (isPerson(it)) assert.equal(placeable(it, i), false, `${it.id} is placeable`); });
});

test('people are tagged at their source: the library\'s walkers and the People props carry the tag, a new person is caught by its category or its id', () => {
  const props = LIBRARY.filter(i => i.cat === 'New: People');
  assert.equal(props.length, 8, 'the eight People props'); assert.ok(props.every(i => i.person === true && isPerson(i)));
  // ...and the figures among the other sheets' props: the marshal, the course worker, the catering staff
  for (const id of ['newprop:marshal', 'newprop:course-worker', 'newprop:catering-staff']) assert.ok(LIB.get(id)!.person === true && isPerson(LIB.get(id)!), id);
  for (const cat of ['Townspeople', 'Spectators', 'Golfers']) { const l = LIBRARY.filter(i => i.cat === cat); assert.ok(l.length > 500 && l.every(i => i.person === true && isPerson(i)), cat); }
  // the animals are walkers but no people (the farms' cows stay)
  const cow = LIBRARY.find(i => i.cat === 'Animals' && i.kind === 'walker')!; assert.ok(cow && !isPerson(cow) && cow.person !== true);
  // a person that comes back untagged is still a person: by its category, by its id, by the object registry's tag
  assert.ok(isPerson({ id: 'x:y', cat: 'New: People', kind: 'decor' })); assert.ok(isPerson({ id: 'newprop:golfer-chipping', cat: 'New: Anything', kind: 'decor' }));
  assert.ok(isPerson({ id: 'newprop:caddie-with-bag-3', cat: 'New: Range' })); assert.ok(isPerson({ id: 'spectator:spec_w_cap:3', cat: 'Spectators', kind: 'walker' }));
  assert.ok(isPerson({ id: 'x:y', cat: 'Z', kind: 'decor', person: true }));
  assert.ok(!isPerson({ id: 'business:golf-bag-trolley', cat: 'Business artwork', kind: 'business' }) && !isPerson({ id: 'world:bench', cat: 'Street furniture', kind: 'decor' }));
  // the game still draws its people: the cast is there (golfers, spectators and staff, townsfolk)
  assert.ok(GOLFER_PEOPLE.length > 5 && SPECTATOR_PEOPLE.length > 10 && WALKER_PEOPLE.length > 5);
});

test('an old save with a placed person drops it on load (nothing refunded or charged); the rest of its props stay', () => {
  const swing = LIB.get('newprop:golfer-swinging')!, bench = LIB.get('world:bench')!;
  assert.ok(swing && bench);
  // the tuples an old save holds: a swinging golfer from the Props tool (its catalogue key saved with it), a caddie, a townsperson's frame, a bench, a boulder
  const saved = [
    propTuple('newprop:golfer-swinging', { x: 812.5, y: 1300.25, flip: false, scale: 1, decor: 'newprop-golfer-swinging' }),
    propTuple('newprop:caddie-with-bag-2', { x: 10, y: 20, flip: true, scale: 1.1, decor: 'newprop-caddie-with-bag-2' }),
    propTuple('person:3d:base_kid:0', { x: 5, y: 5, flip: false, scale: 1 }),
    propTuple('world:bench', { x: 40, y: 41, flip: false, scale: 1, decor: 'bench' }),
    propTuple('kit:boulder-medium-a', { x: 50, y: 51, flip: false, scale: 1 }),
    propTuple('gone:from-the-library', { x: 1, y: 1, flip: false, scale: 1 }),
  ];
  const kept = dropPeople(saved, id => LIB.get(id));
  assert.deepEqual(kept.map(t => t[0]), ['world:bench', 'kit:boulder-medium-a', 'gone:from-the-library'], 'the people go, a bench, a boulder and an id the library lost stay for the loader as before');
  // what stays is untouched (same tuples: the loader's own marks read them as before)
  assert.deepEqual(kept[0], saved[3]); assert.equal(tupleMarks(kept[0]!).decor, 'bench');
  // a catalogue key of a removed person is no key any more (the loader reads the prop as a plain one, and dropPeople has taken it out by its picture)
  assert.equal(tupleMarks(saved[0]!).decor, undefined, 'newprop-golfer-swinging is no catalogue key');
  // nothing in it charges or pays: the tuples hold no money, and dropPeople returns only the tuples
  assert.ok(saved.every(t => t.length <= 8));
  // a save with no people loads whole
  assert.deepEqual(dropPeople([saved[3]!, saved[4]!], id => LIB.get(id)), [saved[3], saved[4]]);
});

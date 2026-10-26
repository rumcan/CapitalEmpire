// The stand-in labels (T114, the owner 2026-10-25: "if stand ins are required add a little text above it that says 'Stand In for Church'"): every
// building newart.ts lookOf draws as a stand-in gets "Stand In for <its plain name>"; real art, props, cars and trees get none. Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { lookOf, plainName, standInLabel } from '../src/game/newart';

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** whether lookOf draws item i as another picture (a stand-in), as the renderer does */
const standsIn = (i: number) => {
  const look = lookOf({ item: i, flip: false, scale: 1, x: 120.5, y: 240.5, x0: 119, y0: 239, x1: 122, y1: 242 });
  return !look.hidden && look.item !== i;
};

test('every stand-in gets "Stand In for <its plain name>", and nothing drawn as itself gets a label', () => {
  let labelled = 0, plain = 0;
  LIBRARY.forEach((it, i) => {
    const label = standInLabel(i);
    if (standsIn(i) && it.kind !== 'tree') { labelled++; assert.equal(label, `Stand In for ${plainName(it)}`, `${it.id} is labelled`); }
    else { plain++; assert.equal(label, null, `${it.id} is drawn as itself (or not at all): no label`); }
  });
  assert.ok(labelled > 20, `${labelled} stand-ins labelled`);
  assert.ok(plain > 1000, `${plain} pictures with no label`);
});

test('the labels name the building plainly', () => {
  const label = (id: string) => standInLabel(INDEX.get(id)!);
  // the owner's example, the church: its four views landed on 2026-10-26 (world-church-44e76535-plain-1-4views-v2), so it is drawn as itself now
  assert.equal(label('variation:world-church-44e76535-plain:1'), null);
  assert.equal(label('golf:clubhouse-shanty'), 'Stand In for Starter clubhouse');
  // (the fire house, the earlier example here, was removed in the studio: removed.json; the next Rebuild left it out of the library, T154)
  assert.equal(label('world:watertower'), 'Stand In for Watertower');
  assert.equal(label('world:gazebo'), 'Stand In for Gazebo');
  assert.equal(label('variation:expansion-garage-rear-91bcbe45:1'), 'Stand In for Timber garage');
  // real art and props: none
  for (const id of ['town:bakery', 'golf:grandstand-s', 'business:golf-clubhouse', 'business:golf-pin-red', 'business:golf-bench-course-map', 'world:streetlamp'])
    assert.equal(label(id), null, `${id} has no label`);
});

test('plainName: the display name less its variation, view or bracketed note; else the id tidied', () => {
  assert.equal(plainName({ id: 'x:a', name: 'Church — variation 1' }), 'Church');
  assert.equal(plainName({ id: 'x:a', name: 'Abandoned brick store — rear — variation 1' }), 'Abandoned brick store — rear');
  assert.equal(plainName({ id: 'x:a', name: 'Old compost bin — A south view' }), 'Old compost bin');
  assert.equal(plainName({ id: 'x:a', name: 'Starter clubhouse (a tin and tarp shack)' }), 'Starter clubhouse');
  assert.equal(plainName({ id: 'town:fire_station', name: '' }), 'Fire station');
  assert.equal(plainName({ id: 'variation:world-church-44e76535-plain:1', name: '' }), 'World church');
});

test('the label strings are cached: the same string each time, so the map overlay allocates nothing for them', () => {
  const i = INDEX.get('variation:world-church-44e76535-plain:1')!;
  assert.ok(standInLabel(i) === standInLabel(i));
});

// T155 (#333): the lot lab's palette strip is data-driven (src/game/dev/lot-lab-palette.ts): every placeable library sprite falls in one group
// (plants, props, buildings, vehicles) by its kind and category, so new plants and props (T154's) show up with no change; the categories of a group
// list exactly its sprites; the search finds by id or name; the people are never offered. Headless.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupCats, paletteSprites, placeable, spriteGroup, SKIP_CAT } from '../src/game/dev/lot-lab-palette';
import { LIBRARY } from '../src/game/library';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

test('a sprite\'s group from what it is (a new plant or prop lands in its group by its kind and category)', () => {
  const it = (kind: string, cat: string, big = false, id = 'new:x') => ({ id, kind, cat, big });
  assert.equal(spriteGroup(it('tree', 'Anything')), 'plants'); assert.equal(spriteGroup(it('decor', 'Trees & plants')), 'plants');
  assert.equal(spriteGroup(it('decor', 'Capital vegetation')), 'plants'); assert.equal(spriteGroup(it('decor', 'Garden flowers')), 'plants');
  assert.equal(spriteGroup(it('car', 'Vehicles')), 'vehicles'); assert.equal(spriteGroup(it('decor', 'x', false, 'cars:sedan')), 'vehicles');
  assert.equal(spriteGroup(it('house', 'Houses', true)), 'buildings'); assert.equal(spriteGroup(it('decor', 'Industry', true)), 'buildings');
  assert.equal(spriteGroup(it('decor', 'Odds & ends')), 'props'); assert.equal(spriteGroup(it('decor', 'Yard')), 'props');
});

test('the strip: the groups split the placeable sprites, the categories list them, the search finds them, no people', () => {
  const all = paletteSprites('all', '', '');
  assert.ok(all.length > 300, `${all.length} sprites`);
  assert.ok(all.every(it => !SKIP_CAT.has(it.cat) && it.kind !== 'walker'), 'no people');
  const groups = ['plants', 'props', 'buildings', 'vehicles'] as const, n = groups.map(g => paletteSprites(g, '', '').length);
  assert.equal(n.reduce((a, b) => a + b, 0), all.length, 'every sprite in exactly one group');
  assert.ok(n.every(k => k > 0), `each group has sprites: ${n.join(', ')}`);
  for (const g of groups) assert.equal(groupCats(g).reduce((s, [, k]) => s + k, 0), paletteSprites(g, '', '').length, `${g}: its categories count its sprites`);
  const [cat, k] = groupCats('plants')[0]!;
  assert.equal(paletteSprites('plants', cat, '').length, k);
  const one = all[Math.floor(all.length / 2)]!;
  assert.ok(paletteSprites('all', '', one.id.toUpperCase()).some(it => it.id === one.id), 'search by id, any case');
  assert.ok(paletteSprites('all', '', one.name).some(it => it.id === one.id), 'search by name');
  assert.equal(LIBRARY.filter((it, i) => placeable(it, i)).length, all.length);
});

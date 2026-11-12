// T437 (docs/CINDERLINKS-PORT.md, one look): the view's biome and course type from the manager game, one list of their names, the golfer's look from the
// player card (src/game/golf/play/look3p.ts). The view's own lists (packages/cinderlinks parts 07-play BIOME_ORDER and CTYPE_ORDER, 05-ground's names) are
// the shared list's, in its order; the map's biome follows the season; the course type follows the crew's condition and the tournament day; every golfer
// art has its clothes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BIOMES_3P, COURSE_TYPES_3P, KEPT_CONDITION, biomeOf, courseTypeOf, playerDress, ART_DRESS } from '../src/game/golf/play/look3p';
import { GOLFER_PEOPLE } from '../src/game/library';

const part = (f: string) => fs.readFileSync(`${process.cwd()}/packages/cinderlinks/parts/${f}`, 'utf8');   // (npm test runs from the repo's root)

test('one list: the view\'s biomes and course types are the shared list\'s, in its order, with its names', () => {
  const play = part('07-play.md'), ground = part('05-ground.md');
  const order = (name: string): string[] => { const i = play.indexOf(`${name} = [`), j = play.indexOf(']', i); return JSON.parse(play.slice(i + name.length + 3, j + 1).replace(/'/g, '"')) as string[]; };
  assert.deepEqual(order('BIOME_ORDER'), BIOMES_3P.map(b => b[0]));
  assert.deepEqual(order('CTYPE_ORDER'), COURSE_TYPES_3P.map(t => t[0]));
  for (const [id, name] of [...BIOMES_3P, ...COURSE_TYPES_3P]) assert.ok(new RegExp(`${id}:\\s*\\{ name: '${name}'`).test(ground), `the view names ${id} ${name}`);
});

test('the biome follows the map\'s season; the course type how it is kept', () => {
  assert.equal(biomeOf(0), 'snow', 'January under snow'); assert.equal(biomeOf(6), 'parkland', 'July'); assert.equal(biomeOf(10), 'parkland'); assert.equal(biomeOf(11), 'snow');
  assert.equal(courseTypeOf({ condition: 95, tournament: true }), 'tour');
  assert.equal(courseTypeOf({ condition: KEPT_CONDITION, tournament: false }), 'private');
  assert.equal(courseTypeOf({ condition: KEPT_CONDITION - 1, tournament: false }), 'public');
});

test('the golfer\'s look: every golfer art has its clothes; an unknown one wears the view\'s own', () => {
  for (const p of GOLFER_PEOPLE) { assert.ok(ART_DRESS[p.id], `${p.id} has clothes`); const d = playerDress(p.id, 'm'); assert.equal(d.shirt, ART_DRESS[p.id]!.shirt); assert.match(d.trousers, /^#[0-9a-f]{6}$/); }
  assert.equal(playerDress(undefined, 'w').shirt, '#c8323a'); assert.equal(playerDress(undefined, 'w').sex, 'w');
});

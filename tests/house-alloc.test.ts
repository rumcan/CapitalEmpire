// T155 (#333): the house allocations (src/game/lots/house-alloc.ts): each house suits some road angles and look states; a house never set suits
// everything; the file merges per house (two helpers' saves keep both); and the lot lab's house dealing (src/game/dev/lot-houses.ts) honours them:
// Change house (nextHouse), Generate's new building (otherHouse) and New lot's building (allowedHouse) deal only houses that suit the lot's road
// and state, and the inspector's counts (suitCounts). Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ROADS, ALL_STATES, allocOf, allows, clampAlloc, formatAllocations, mergeAllocations, parseAllocations, toggled, withAlloc, type AllocFile } from '../src/game/lots/house-alloc';
import { mergeAllocations as devMerge, ALLOC_PATH } from '../src/game/dev/dev-save';
import { allowedHouse, baseOf, housePool, nextHouse, otherHouse, suitCounts } from '../src/game/dev/lot-houses';
import { LIBRARY } from '../src/game/library';
import { mulberry } from '../src/game/iso';
import FILE from '../src/game/lots/house-allocations.json';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const EMPTY: AllocFile = { v: 1, houses: {} };
/** a dwelling with at least four others of its size class (the tests' pool) */
const HOUSE = (() => { const h = LIBRARY.find(it => it.id === 'world:house_5') ? 'world:house_5' : LIBRARY.map(it => it.id).find(id => housePool(id).length >= 5)!; return baseOf(h); })();
const POOL = housePool(HOUSE);

describe('house allocations (T155)', () => {
  it('1. a house never set suits every road and state; a set house only its own; the file reads back as written', () => {
    assert.ok(ALL_ROADS.every(r => ALL_STATES.every(s => allows(EMPTY, 'world:any', r, s))), 'unset: everywhere');
    const f = withAlloc(EMPTY, 'a', { roads: [0, 2], states: ['built', 'declined'] });
    assert.equal(allows(f, 'a', 0, 'built'), true); assert.equal(allows(f, 'a', 2, 'declined'), true);
    assert.equal(allows(f, 'a', 1, 'built'), false, 'another road'); assert.equal(allows(f, 'a', 0, 'upgraded'), false, 'another state');
    assert.equal(allows(f, 'b', 5, 'upgraded'), true, 'another house is still unset');
    assert.deepEqual(parseAllocations(JSON.parse(formatAllocations(f))), f);
    // bad entries are dropped, lists sorted and cleaned
    assert.deepEqual(clampAlloc({ roads: [3, 1, 1, 9, 'x'], states: ['upgraded', 'built', 'no'] }), { roads: [1, 3], states: ['built', 'upgraded'] });
    assert.equal(clampAlloc({ roads: [1] }), null);
    assert.deepEqual(parseAllocations({ houses: { 'ok': { roads: [], states: [] }, 'bad id': { roads: [], states: [] }, 'x': 3 } }).houses, { ok: { roads: [], states: [] } });
    // the shipped file is empty: every house suits everything until the owner sets one (never commit test allocations)
    assert.deepEqual(parseAllocations(FILE), EMPTY);
  });
  it('2. a toggle starts from "everything" for an unset house and flips one road or state; null unsets it', () => {
    const a = toggled(null, { road: 3 });
    assert.deepEqual(a.roads, [0, 1, 2, 4, 5, 6, 7]); assert.deepEqual(a.states, [...ALL_STATES]);
    assert.deepEqual(toggled(a, { road: 3 }).roads, [...ALL_ROADS], 'toggled back on');
    assert.deepEqual(toggled(a, { state: 'declined' }).states, ['built', 'upgraded']);
    assert.equal(allocOf(withAlloc(withAlloc(EMPTY, 'h', a), 'h', null), 'h'), null);
  });
  it('3. the merge is per house: two helpers\' saves keep both, null removes one, a bad request is refused (the dev server\'s route)', () => {
    let text = formatAllocations(EMPTY);
    const m1 = mergeAllocations(text, { 'world:a': { roads: [0], states: ['built'] } }); assert.ok(m1.ok); text = m1.ok ? m1.text : '';
    const m2 = devMerge(text, { 'world:b': { roads: [4, 5], states: ['upgraded'] } }); assert.ok(m2.ok); text = m2.ok ? m2.text : '';
    const f = parseAllocations(JSON.parse(text));
    assert.deepEqual(Object.keys(f.houses).sort(), ['world:a', 'world:b'], 'the second save kept the first');
    const m3 = mergeAllocations(text, { 'world:a': null }); assert.ok(m3.ok && m3.count === 1);
    assert.equal(mergeAllocations(text, [1, 2]).ok, false); assert.equal(mergeAllocations(text, { 'world:a': { roads: 'all' } }).ok, false);
    assert.equal(mergeAllocations('{ not json', {}).ok, false);
    assert.ok(mergeAllocations('', { 'world:c': { roads: [], states: [] } }).ok, 'a missing file starts empty');
    assert.equal(ALLOC_PATH, 'src/game/lots/house-allocations.json');
  });
  it('4. Change house deals only houses that suit the lot (H and Shift+H skip the others; none left: null)', () => {
    assert.ok(POOL.length >= 4, `the test house has a pool: ${POOL.length}`);
    // half the pool (every other one) does not suit road 2 when built
    const banned = new Set(POOL.filter((_, i) => i % 2 === 1).filter(h => h !== HOUSE));
    let f = EMPTY;
    for (const h of banned) f = withAlloc(f, h, { roads: [0, 1, 3, 4, 5, 6, 7], states: [...ALL_STATES] });
    const ok = (id: string) => allows(f, baseOf(id), 2, 'built');
    let h = HOUSE;
    for (let i = 0; i < POOL.length * 2; i++) { const n = nextHouse(h, 1, ok)!; assert.ok(n && !banned.has(n), `${n} suits road 2`); h = n; }
    for (let i = 0; i < POOL.length; i++) { const n = nextHouse(h, -1, ok)!; assert.ok(n && !banned.has(n), `${n} suits road 2 (back)`); h = n; }
    // on road 0 every house suits again: the banned ones come back
    const all = new Set<string>(); h = HOUSE;
    for (let i = 0; i < POOL.length; i++) { h = nextHouse(h, 1, id => allows(f, baseOf(id), 0, 'built'))!; all.add(h); }
    assert.ok([...banned].every(b => all.has(b)), 'road 0 deals them all');
    // a house that does not suit itself still steps to the next one that does
    const first = [...banned][0]!, n = nextHouse(first, 1, ok);
    assert.ok(n && !banned.has(n));
    // nothing suits: no house to change to
    assert.equal(nextHouse(HOUSE, 1, () => false), null);
  });
  it('5. Generate\'s new building and New lot\'s building suit the lot; the inspector counts them', () => {
    const r = mulberry(7), f = POOL.filter(h => h !== HOUSE).slice(0, 2).reduce((acc, h) => withAlloc(acc, h, { roads: [...ALL_ROADS], states: ['upgraded'] }), EMPTY);
    const okBuilt = (id: string) => allows(f, baseOf(id), 0, 'built'), banned = POOL.filter(h => h !== HOUSE).slice(0, 2);
    for (let i = 0; i < 60; i++) { const o = otherHouse(HOUSE, r, okBuilt); assert.ok(o && o !== HOUSE && !banned.includes(o), `Generate dealt ${o}`); }
    // New lot keeps a house that suits, swaps one that does not for one that does, and finds none when its pool has none
    assert.equal(allowedHouse(HOUSE, r, okBuilt), HOUSE);
    for (let i = 0; i < 20; i++) { const a = allowedHouse(banned[0]!, r, okBuilt); assert.ok(a && !banned.includes(a), `New lot dealt ${a}`); }
    assert.equal(allowedHouse(HOUSE, r, () => false), null);
    // the upgraded lots take the two (and every unset house)
    assert.ok(allows(f, banned[0]!, 5, 'upgraded'));
    const c = suitCounts(HOUSE, okBuilt);
    assert.equal(c.poolAll, POOL.length); assert.equal(c.pool, POOL.length - 2); assert.ok(c.familyAll >= c.poolAll && c.family === c.familyAll - 2);
  });
});

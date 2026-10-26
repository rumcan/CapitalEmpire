// The lot presets' merge (POST /__dev/presets, dev-save.ts mergePresets): each preset replaces its own entry on disk, so two saves made from the same old
// copy keep both changes, a removal drops only its id, and a refused merge never reaches the disk. Headless: npm test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergePresets } from '../src/game/dev/dev-save';
import { formatPresets, parsePresets, type LotPreset } from '../src/game/lots/presets';

type Merge = ReturnType<typeof mergePresets>;

/** a house preset of w x d tiles with one bench at x (the x tells two copies of the same preset apart) */
function preset(id: string, x = 1, w = 10, d = 15): LotPreset {
  return { id, use: 'res', state: 'built', w, d, props: [{ id: 'world:bench', x, y: 2, scale: 1, view: 0 }], patches: [] };
}
/** the file's text holding these presets, with a header of these notes when given */
const file = (list: LotPreset[], notes?: string[]) => formatPresets(list, notes ? { notes } : undefined);
/** a merge that must be ok (its failure is the test's failure) */
function good(r: Merge): Extract<Merge, { ok: true }> { if (!r.ok) throw new Error(r.error); return r; }
/** a merge's result read back: its presets, which must all be valid and match the count */
function merged(text: string, upsert: unknown, remove: unknown = []) {
  const r = good(mergePresets(text, upsert, remove));
  const back = parsePresets(JSON.parse(r.text));
  assert.equal(back.invalid, 0);
  assert.equal(r.count, back.presets.length);
  return back;
}
/** the ids of a file's presets, in file order */
const ids = (list: { presets: LotPreset[] }) => list.presets.map(p => p.id);

describe('the lot presets merge per preset (the dev save endpoint)', () => {
  it('1. an upserted preset replaces its own entry in place, the others keep their place in the file', () => {
    const back = merged(file([preset('a'), preset('b'), preset('c')]), [preset('b', 7)]);
    assert.deepEqual(ids(back), ['a', 'b', 'c']);
    assert.equal(back.presets[1]!.props[0]!.x, 7);
    assert.equal(back.presets[0]!.props[0]!.x, 1);
  });

  it('2. an upserted id that is not in the file is appended', () => {
    const back = merged(file([preset('a'), preset('b')]), [preset('d', 3)]);
    assert.deepEqual(ids(back), ['a', 'b', 'd']);
    assert.equal(back.presets[2]!.props[0]!.x, 3);
  });

  it('3. a removed id is dropped and the rest keep their order', () => {
    const back = merged(file([preset('a'), preset('b'), preset('c')]), [], ['b']);
    assert.deepEqual(ids(back), ['a', 'c']);
  });

  it('4. a removal wins over an upsert of the same id', () => {
    assert.deepEqual(ids(merged(file([preset('a'), preset('b')]), [preset('a', 9)], ['a'])), ['b']);
  });

  it('5. the header (meta notes) is kept and written first; a file without one stays without one', () => {
    const r = good(mergePresets(file([preset('a'), preset('b')], ['made 2026-10-01', 'edited']), [preset('a', 4)], []));
    assert.ok(r.text.startsWith('[\n{"meta":{"notes":['), r.text.slice(0, 40));
    assert.deepEqual(parsePresets(JSON.parse(r.text)).meta, { notes: ['made 2026-10-01', 'edited'] });
    const plain = good(mergePresets(file([preset('a')]), [preset('a', 4)], []));
    assert.ok(plain.text.startsWith('[\n{"id"'), plain.text.slice(0, 20));
    assert.equal(parsePresets(JSON.parse(plain.text)).meta, undefined);
  });

  it('6. an invalid upsert, or a remove that is not a list of ids, is refused (the file is not written)', () => {
    const text = file([preset('a')]);
    for (const bad of [[{ id: 'x' }], 'x', null, { id: 'a' }, [preset('a'), { id: 'x' }], [{ meta: { notes: [] } }], [{ ...preset('x'), props: [{ id: 'world:bench', x: 1, y: 2, scale: 1, view: 7 }] }]])
      assert.equal(mergePresets(text, bad, []).ok, false, JSON.stringify(bad).slice(0, 80));
    for (const bad of ['a', null, [1], [null], { 0: 'a' }]) assert.equal(mergePresets(text, [], bad).ok, false, JSON.stringify(bad));
    assert.equal(mergePresets('[', [], []).ok, false, 'a file that does not parse');
  });

  it('7. a merge that would leave no preset is refused (every lot would turn vacant)', () => {
    assert.equal(mergePresets(file([preset('a')]), [], ['a']).ok, false);
    assert.equal(mergePresets(file([preset('a'), preset('b')]), [], ['a', 'b']).ok, false);
    assert.deepEqual(ids(merged(file([preset('a'), preset('b')]), [], ['a'])), ['b'], 'one left is fine');
  });

  it('8. two merges from the same old copy keep both changes (A saves a, then B saves b from the copy it had before)', () => {
    const old = file([preset('a'), preset('b')]);
    const first = good(mergePresets(old, [preset('a', 5)], []));
    const second = parsePresets(JSON.parse(good(mergePresets(first.text, [preset('b', 6)], [])).text));
    assert.equal(second.presets.find(p => p.id === 'a')!.props[0]!.x, 5, "A's change kept");
    assert.equal(second.presets.find(p => p.id === 'b')!.props[0]!.x, 6, "B's change kept");
    assert.deepEqual(ids(second), ['a', 'b']);
  });

  it('9. a removal by one person stays removed when another saves a different preset from an older copy', () => {
    const old = file([preset('a'), preset('b')]);
    const first = good(mergePresets(old, [], ['b']));
    assert.deepEqual(ids(merged(first.text, [preset('a', 8)], [])), ['a'], "B's removal of b is not undone by A's save of a");
  });
});

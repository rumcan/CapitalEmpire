// Unit tests for the lot lab's presets (road set, approved): the road angle, the match of approved presets to a lot, their file format, and their draw
// on a lot (compose.ts). Headless: npm test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LU, LV } from '../src/game/lots/town';
import { approvedFor, formatPresets, parsePresets, type LotPreset, type Road } from '../src/game/lots/presets';
import { facingOf, quarterOfRoad, roadOf, type Pt } from '../src/game/lots/preset-frame';
import { compose, lotPreset, pickedPreset, setLotPresets, type ComposeState } from '../src/game/lots/compose';
import PRESET_FIXTURE from './fixtures/lot-presets.json';

// the presets the lots draw from in these tests: the fixture (the same as compose.test.ts reads), restored at the end of each test that changes them
const FIXTURE = parsePresets(PRESET_FIXTURE);
setLotPresets(FIXTURE.presets, FIXTURE.meta);

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const S = Math.SQRT1_2;
/** a lab preset of a use and state at w x d tiles for a road (approved unless approved is false), with no props */
function lab(id: string, use: LotPreset['use'], state: LotPreset['state'], w: number, d: number, road: Road, approved = true): LotPreset {
  return { id, use, state, w, d, props: [], patches: [], road, ...(approved ? { approved: true } : {}) };
}
/** the away vector of a street at deg (0 the street on +y, 90 on +x, counted as the road angles are) */
const away = (deg: number): Pt => ({ x: -Math.sin(deg * Math.PI / 180), y: -Math.cos(deg * Math.PI / 180) });
/** a built house lot's state, and two lots: one on an axis street (road 0), one on a diagonal (road 1, 45 degrees) */
const RES: ComposeState = { use: LU.RES, level: LV.BUILT, decline: 0, seed: 1 };
const LOT_AXIS = { o: { x: 100, y: 100 }, u: { x: 1, y: 0 }, n: { x: 0, y: -1 }, w: 10, d: 16 };
const LOT_DIAG = { o: { x: 100, y: 100 }, u: { x: S, y: -S }, n: { x: -S, y: -S }, w: 10, d: 16 };
/** the fixture's first house prop: the one prop the lab presets of these tests carry */
const HOUSE = FIXTURE.presets.find(p => p.use === 'res' && p.state === 'built')!.props[0]!;

describe('the lot lab presets (road set, approved)', () => {
  it('1. roadOf: the street lies along -n, so the eight road angles of the brief, and a lot 10 degrees off an axis keeps the axis', () => {
    assert.equal(roadOf({ x: 0, y: -1 }), 0);
    assert.equal(roadOf({ x: -1, y: 0 }), 2);
    assert.equal(roadOf({ x: 0, y: 1 }), 4);
    assert.equal(roadOf({ x: 1, y: 0 }), 6);
    assert.equal(roadOf({ x: -S, y: -S }), 1);
    assert.equal(roadOf({ x: -S, y: S }), 3);
    assert.equal(roadOf({ x: S, y: S }), 5);
    assert.equal(roadOf({ x: S, y: -S }), 7);
    for (let k = 0; k < 8; k++) for (const off of [0, 10, -10]) assert.equal(roadOf(away(45 * k + off)), k, `road ${k} at ${off} degrees`);
  });

  it('2. quarterOfRoad: an axis road is its quarter, a diagonal the quarter of the axis its tie goes to, the same as facingOf of the exact diagonal', () => {
    assert.deepEqual([0, 2, 4, 6].map(r => quarterOfRoad(r as Road)), [0, 1, 2, 3]);
    assert.deepEqual([1, 3, 5, 7].map(r => quarterOfRoad(r as Road)), [0, 2, 2, 0]);
    const diag: Record<number, Pt> = { 1: { x: -S, y: -S }, 3: { x: -S, y: S }, 5: { x: S, y: S }, 7: { x: S, y: -S } };
    for (const r of [1, 3, 5, 7] as Road[]) assert.equal(quarterOfRoad(r), facingOf(diag[r]!), `road ${r}`);
  });

  it('3. approvedFor: the road\'s own presets at the lot\'s size (else the nearest one step); an axis road takes another axis road\'s, a diagonal none', () => {
    const a = lab('a', 'res', 'built', 10, 16, 0), b = lab('b', 'res', 'built', 10, 16, 0), c = lab('c', 'res', 'built', 14, 16, 0);
    const e = lab('e', 'res', 'built', 10, 16, 2), f = lab('f', 'res', 'built', 10, 16, 1);
    const all = [a, b, c, e, f];
    // the road's own bucket, in file order; the other road's presets of the same bucket do not come into it
    assert.deepEqual(approvedFor(all, 'res', 'built', 9, 15, 0), [a, b]);
    assert.deepEqual(approvedFor(all, 'res', 'built', 13, 16, 0), [c]);
    assert.deepEqual(approvedFor(all, 'res', 'built', 10, 16, 2), [e]);
    // drafts (no approved) and frozen presets (no road, even with approved) are never returned
    const draft = lab('d', 'res', 'built', 10, 16, 0, false);
    const frozen: LotPreset = { id: 'frozen', use: 'res', state: 'built', w: 10, d: 16, props: [], patches: [], approved: true };
    assert.deepEqual(approvedFor([draft, frozen], 'res', 'built', 10, 16, 0), []);
    // another use or state is not returned
    assert.deepEqual(approvedFor([lab('x', 'com', 'built', 10, 16, 0), lab('y', 'res', 'upgraded', 10, 16, 0)], 'res', 'built', 10, 16, 0), []);
    // no exact bucket: the presets one step away on each side, the smallest summed gap, all ties in file order
    const n10 = lab('n10', 'res', 'built', 10, 16, 0), n14 = lab('n14', 'res', 'built', 14, 16, 0), n14d = lab('n14d', 'res', 'built', 14, 18, 0);
    assert.deepEqual(approvedFor([n14, n14d, n10], 'res', 'built', 12, 16, 0), [n14, n10]);
    assert.deepEqual(approvedFor([n14d], 'res', 'built', 12, 16, 0), [n14d], 'one step on each side');
    assert.deepEqual(approvedFor([lab('far', 'res', 'built', 16, 16, 0)], 'res', 'built', 12, 16, 0), [], 'two steps away');
    assert.deepEqual(approvedFor([lab('far2', 'res', 'built', 10, 20, 0)], 'res', 'built', 10, 16, 0), [], 'two steps away in depth');
    // an axis road with none of its own takes another axis road's, turned; a diagonal takes no other diagonal's, nor an axis road's
    assert.deepEqual(approvedFor([c, e], 'res', 'built', 10, 16, 0), [e]);
    assert.deepEqual(approvedFor([e], 'res', 'built', 10, 16, 6), [e]);
    assert.deepEqual(approvedFor([f], 'res', 'built', 10, 16, 3), []);
    assert.deepEqual(approvedFor([a], 'res', 'built', 10, 16, 1), []);
  });

  it('4. the file: a lab preset\'s road and approved round trip; a road that is not an integer 0..7 makes the entry invalid; approved: false is absent and not written', () => {
    const lab1: LotPreset = { id: 'lab-res-built-10x16-r3-test', use: 'res', state: 'built', w: 10, d: 16, props: [{ id: 'world:house_2', x: 4, y: 6, scale: 1, view: 1 }], patches: [], road: 3, approved: true };
    const text = formatPresets([lab1]);
    assert.ok(text.includes('"w":10,"d":16,"road":3,"approved":true,"props":['), text);
    assert.deepEqual(parsePresets(JSON.parse(text)).presets, [lab1]);
    const base = { id: 'bad', use: 'res', state: 'built', w: 10, d: 16, props: [], patches: [] };
    for (const road of [8, 1.5, -1, '1', null]) assert.equal(parsePresets([{ ...base, road }]).invalid, 1, JSON.stringify(road));
    const off = parsePresets([{ ...base, id: 'off', road: 0, approved: false }]);
    assert.deepEqual(off.presets, [{ ...base, id: 'off', road: 0 }]);
    assert.equal(off.presets[0]!.approved, undefined);
    assert.ok(!formatPresets(off.presets).includes('approved'), 'approved: false is not written');
  });

  it('5. compose: an approved lab preset on its road is drawn, a draft is not (only forced); a diagonal lot is a green until an approved preset of its road exists', () => {
    try {
      const labAxis: LotPreset = { id: 'lab-res-built-10x16-r0-test', use: 'res', state: 'built', w: 10, d: 16, props: [HOUSE], patches: [], road: 0, approved: true };
      const draft: LotPreset = { id: labAxis.id, use: 'res', state: 'built', w: 10, d: 16, props: [HOUSE], patches: [], road: 0 };
      setLotPresets([...FIXTURE.presets, labAxis], FIXTURE.meta);
      assert.equal(pickedPreset(LOT_AXIS, RES)?.id, labAxis.id);
      assert.equal(lotPreset(LOT_AXIS, RES)?.frame.q, 0);
      assert.ok(compose(LOT_AXIS, RES).props.some(q => q.from?.preset === labAxis.id), 'the approved preset is drawn');
      // the draft: never picked on its own road, and the frozen pool never sees it (the picks match the list without it, slot by slot)
      const slots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => ({ ...LOT_AXIS, o: { x: 100 + 10 * k, y: 100 } }));
      const picks = (list: LotPreset[]) => { setLotPresets(list, FIXTURE.meta); return slots.map(l => pickedPreset(l, RES)?.id); };
      const without = picks(FIXTURE.presets), withDraft = picks([...FIXTURE.presets, draft]);
      assert.deepEqual(withDraft, without, 'a draft changes no pick');
      assert.ok(withDraft.every(id => id !== draft.id));
      assert.equal(pickedPreset(LOT_AXIS, { ...RES, preset: 'no-such-preset' })?.id, pickedPreset(LOT_AXIS, RES)?.id, 'an unknown forced id picks as unforced');
      setLotPresets([...FIXTURE.presets, draft], FIXTURE.meta);
      assert.equal(pickedPreset(LOT_AXIS, { ...RES, preset: draft.id })?.id, draft.id, 'forced: the draft is drawn');
      assert.equal(pickedPreset(LOT_DIAG, { ...RES, preset: draft.id })?.id, draft.id, 'forced: on any lot, a diagonal one too');

      // a diagonal lot: no preset and no props until an approved preset of road 1 is made; an axis preset does not reach it
      const diag: LotPreset = { id: 'lab-res-built-10x16-r1-test', use: 'res', state: 'built', w: 10, d: 16, props: [HOUSE], patches: [], road: 1, approved: true };
      const near = { o: { x: 100, y: 100 }, u: { x: Math.cos(47 * Math.PI / 180), y: -Math.sin(47 * Math.PI / 180) }, n: away(47), w: 10, d: 16 };
      setLotPresets(FIXTURE.presets, FIXTURE.meta);
      assert.equal(pickedPreset(LOT_DIAG, RES), null);
      assert.ok(!compose(LOT_DIAG, RES).props.some(q => q.from), 'a green: no preset prop');
      setLotPresets([...FIXTURE.presets, labAxis], FIXTURE.meta);
      assert.equal(pickedPreset(LOT_DIAG, RES), null, 'an axis preset is not turned to a diagonal');
      setLotPresets([...FIXTURE.presets, diag], FIXTURE.meta);
      assert.equal(pickedPreset(LOT_DIAG, RES)?.id, diag.id);
      assert.equal(lotPreset(LOT_DIAG, RES)?.frame.q, 0);
      assert.ok(compose(LOT_DIAG, RES).props.some(q => q.from?.preset === diag.id), 'the diagonal preset is drawn');
      // 2 degrees more than the diagonal's: the lot's own facing is +x (1), the preset's views keep the diagonal's quarter (0)
      assert.equal(facingOf(near.n), 1);
      assert.equal(pickedPreset(near, RES)?.id, diag.id);
      assert.equal(lotPreset(near, RES)?.frame.q, 0);
      assert.ok(compose(near, RES).props.some(q => q.from?.preset === diag.id), 'a lot a few degrees off the diagonal is drawn');
    } finally {
      setLotPresets(FIXTURE.presets, FIXTURE.meta);
    }
  });
});

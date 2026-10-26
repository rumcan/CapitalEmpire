// The lot lab's T148 tools: the multi-selection (box pick, Shift add and remove), the edits on a selection, copy and paste (the relative layout
// kept, on this lot or another), Change house (cycling within a building's family and size class, never the same one twice running, on its
// spot), Generate in place (the lot's type, size and road angle kept) and New lot (the locks), and the neighbours' geometry. Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LotPreset, PresetProp } from '../src/game/lots/presets';
import { copySel, count, cycle, deleteSel, inBox, mainBuilding, moveSel, pasteClip, scaleSel, selOf, swapHouse, toggle, turnSel, union, type Half } from '../src/game/dev/lot-select';
import { classWords, houseFamily, housePool, isHouseLike, nextHouse, otherHouse, sizeClassOf } from '../src/game/dev/lot-houses';
import { neighbourLots, planInPlace, planNewLot } from '../src/game/dev/lot-lab-plan';
import { LIBRARY } from '../src/game/library';
import { mulberry } from '../src/game/iso';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** a prop of id at (x, y) */
const P = (id: string, x: number, y: number, scale = 1, view: 0 | 1 | 2 | 3 = 0): PresetProp => ({ id, x, y, scale, view });
/** a whole lab preset of w x d with these props and decals */
const preset = (w: number, d: number, props: PresetProp[], decals: LotPreset['decals'] = []): LotPreset => ({ id: 'lab-t', use: 'res', state: 'built', w, d, props, patches: [], road: 0, whole: true, decals });
/** every prop half a tile each way (the tests' footprint) */
const HALF: (q: PresetProp) => Half = () => ({ ha: 0.5, hb: 0.5 });
/** the points of the selected items, relative to the first one (the layout a move or a paste must keep) */
const layout = (p: LotPreset, props: number[], decals: number[] = []) => {
  const pts = [...props.map(i => p.props[i]!), ...decals.map(i => p.decals![i]!)];
  return pts.map(q => [+(q.x - pts[0]!.x).toFixed(3), +(q.y - pts[0]!.y).toFixed(3)]);
};
const LOT = preset(12, 16, [P('a', 2, 3), P('b', 4, 3), P('c', 3, 6, 1, 1), P('d', 10, 14)], [{ id: 'leaf', x: 3, y: 4, scale: -1.2, alpha: 1 }]);

describe('the lot lab: multi-select, copy and paste, change house, generate in place, neighbours (T148)', () => {
  it('1. Shift+click adds and removes; the box picks every sprite and decal inside it, any corner order, Shift+box adds to the selection', () => {
    let s = selOf([0]);
    s = toggle(s, 'props', 2); assert.deepEqual(s, { props: [0, 2], decals: [] });
    s = toggle(s, 'decals', 0); assert.equal(count(s), 3);
    s = toggle(s, 'props', 0); assert.deepEqual(s, { props: [2], decals: [0] }, 'a second Shift+click takes it out');
    const pts = [{ kind: 'props' as const, i: 0, x: 10, y: 10 }, { kind: 'props' as const, i: 1, x: 50, y: 12 }, { kind: 'decals' as const, i: 0, x: 30, y: 30 }, { kind: 'props' as const, i: 3, x: 200, y: 200 }];
    assert.deepEqual(inBox(pts, 60, 40, 0, 0), { props: [0, 1], decals: [0] }, 'the box from its far corner');
    assert.deepEqual(inBox(pts, 100, 100, 300, 300), { props: [3], decals: [] });
    assert.deepEqual(union(inBox(pts, 0, 0, 20, 20), inBox(pts, 190, 190, 210, 210)), { props: [0, 3], decals: [] }, 'Shift+box adds');
  });

  it('2. a selection moves as one (its layout kept), the lot edge stops the whole selection, and Delete, Turn and Bigger apply to each item', () => {
    const s = selOf([0, 1, 2], [0]), before = layout(LOT, s.props, s.decals);
    const m = moveSel(LOT, s, 1.5, 2, HALF);
    assert.deepEqual(layout(m.preset, s.props, s.decals), before, 'the relative layout is kept');
    assert.equal(m.preset.props[0]!.x, 3.5); assert.equal(m.preset.props[0]!.y, 5); assert.equal(m.preset.props[3]!.x, 10, 'the others stay');
    assert.equal(m.preset.curated, true);
    // far left: a (x 2, half 0.5) stops at 0.5, so the whole selection moves 1.5 only
    const e = moveSel(LOT, s, -5, 0, HALF);
    assert.equal(e.clamped, true); assert.equal(e.dx, -1.5); assert.deepEqual(layout(e.preset, s.props, s.decals), before);
    const del = deleteSel(LOT, s);
    assert.deepEqual(del.props.map(q => q.id), ['d']); assert.equal(del.decals!.length, 0);
    const t = turnSel(LOT, s, q => q.id !== 'b');
    assert.deepEqual(t.preset.props.map(q => q.view), [1, 0, 2, 0], 'each turnable sprite a quarter in place'); assert.equal(t.turned, 2);
    assert.equal(t.preset.decals![0]!.scale, 1.2, 'a decal mirrors'); assert.equal(t.mirrored, 1);
    const g = scaleSel(LOT, s, 1.05, q => (q.id === 'a' ? 1 : 3));
    assert.equal(g.preset.props[0]!.scale, 1, 'a prop at its picture\'s limit is refused'); assert.equal(g.refused, 1);
    assert.equal(g.preset.props[1]!.scale, 1.05); assert.equal(g.preset.decals![0]!.scale, -1.26, 'a decal grows, its mirror kept');
    assert.deepEqual(LOT.props[0], P('a', 2, 3), 'the preset itself is not changed');
  });

  it('3. copy and paste round trip: the relative layout, sizes, turns and mirrors kept; pasted at the pointer, on another lot, the paste selected', () => {
    const s = selOf([0, 1, 2], [0]), c = copySel(LOT, s)!;
    assert.equal(c.props.length, 3); assert.equal(c.decals.length, 1);
    // the clip is centred on its box: a 2 .. 4 along, 3 .. 6 away -> middle (3, 4.5)
    assert.deepEqual(c.props.map(q => [q.x, q.y]), [[-1, -1.5], [1, -1.5], [0, 1.5]]);
    const other = preset(20, 30, [P('house', 10, 8)]), r = pasteClip(other, c, 12, 20, HALF);
    assert.deepEqual(r.sel, { props: [1, 2, 3], decals: [0] }, 'the pasted items are selected');
    assert.deepEqual(layout(r.preset, r.sel.props, r.sel.decals), layout(LOT, s.props, s.decals), 'the layout is kept');
    assert.deepEqual(r.preset.props.slice(1).map(q => [q.x, q.y, q.view, q.scale]), [[11, 18.5, 0, 1], [13, 18.5, 0, 1], [12, 21.5, 1, 1]], 'at the pointer, turns and sizes kept');
    assert.equal(r.preset.decals![0]!.scale, -1.2, 'the mirror kept'); assert.equal(r.clamped, false);
    // pasted against the far corner: the whole paste shifts in, its layout kept
    const edge = pasteClip(other, c, 19.8, 29.8, HALF);
    assert.equal(edge.clamped, true);
    assert.deepEqual(layout(edge.preset, edge.sel.props, edge.sel.decals), layout(LOT, s.props, s.decals));
    for (const i of edge.sel.props) { const q = edge.preset.props[i]!; assert.ok(q.x <= 19.5 && q.y <= 29.5, 'every footprint inside the lot'); }
    // pasted twice on its own lot: the copies go after the lot's own items
    const again = pasteClip(LOT, c, 6, 8, HALF);
    assert.equal(again.preset.props.length, 7); assert.deepEqual(again.sel.props, [4, 5, 6]);
  });

  it('4. Change house: a house cycles through its family and size class (H forward, Shift+H back), never the same one twice running', () => {
    const house = LIBRARY.find(it => it.id === 'world:house_5') ? 'world:house_5' : housePool(LIBRARY.find(it => houseFamily(it.id) === 'dwelling')!.id)[0]!;
    assert.equal(houseFamily(house), 'dwelling'); assert.ok(isHouseLike(house));
    const pool = housePool(house), k = sizeClassOf(house);
    assert.ok(pool.length >= 3, `a house has others of its size: ${pool.length} (${classWords(house)})`);
    for (const h of pool) { assert.equal(houseFamily(h), 'dwelling', `${h} is a dwelling`); assert.equal(sizeClassOf(h), k, `${h} is of the same size class`); assert.ok(!/-north-|gen[:-]back-|[-_]rear/.test(h), `${h} is a front view`); }
    // the three classes split the family; a large house's pool holds no small one
    const all = new Set(LIBRARY.map(it => it.id).filter(id => houseFamily(id) === 'dwelling').flatMap(id => housePool(id)));
    assert.ok([0, 1, 2].every(c => [...all].some(id => sizeClassOf(id) === c)), 'small, medium and large dwellings');
    // H walks the whole pool and comes back; never the same one twice in a row; Shift+H walks it back
    const seen: string[] = [house];
    let h = house;
    for (let i = 0; i < pool.length; i++) { const n = nextHouse(h, 1)!; assert.notEqual(n, h); seen.push(n); h = n; }
    assert.equal(h, house, 'round the pool and back'); assert.equal(new Set(seen).size, pool.length);
    for (let i = 0; i < 5; i++) { const n = nextHouse(h, 1)!; assert.equal(nextHouse(n, -1), h, 'Shift+H goes back'); h = n; }
    // a pool of one has nothing else; the cycle never answers the current one
    assert.equal(cycle(['only'], 'only', 1), null);
    assert.equal(cycle(['a', 'b', 'c'], 'x', 1, id => ({ a: 1, b: 2, c: 3, x: 2.5 })[id]!), 'c', 'one not in the pool: the next by size');
    assert.equal(cycle(['a', 'b', 'c'], 'x', -1, id => ({ a: 1, b: 2, c: 3, x: 2.5 })[id]!), 'b');
    const r = mulberry(148);
    for (let i = 0; i < 20; i++) { const o = otherHouse(house, r); assert.ok(o && o !== house && pool.includes(o), 'Generate\'s new building: another of the pool'); }
    // a tree or a bin is no house
    assert.equal(isHouseLike(LIBRARY.find(it => it.kind === 'tree')!.id), false);
  });

  it('5. the swapped house keeps its spot (its centre along the street and its street side), its turn and its size rule', () => {
    const p = preset(12, 16, [P('tree', 1, 14), P('old', 6, 5, 1.1, 2)]);
    const s = swapHouse(p, 1, 'new', { ha: 3, hb: 2 }, { ha: 3.5, hb: 3 }, 0.9)!;
    const q = s.props[1]!;
    assert.equal(q.id, 'new'); assert.equal(q.view, 2, 'the turn kept'); assert.equal(q.x, 6, 'the centre along the street kept');
    assert.equal(q.y - 3, 5 - 2, 'the street side kept: a deeper house reaches further back'); assert.equal(q.scale, 0.9, 'never past the new picture\'s limit');
    assert.deepEqual(s.props[0], p.props[0]);
    // near the lot's side: kept in the lot
    const e = swapHouse(preset(12, 16, [P('old', 2, 5)]), 0, 'wide', { ha: 1.5, hb: 2 }, { ha: 4, hb: 2 }, 5)!;
    assert.equal(e.props[0]!.x, 4);
    assert.equal(mainBuilding(p, q2 => q2.id !== 'tree', q2 => (q2.id === 'old' ? { ha: 3, hb: 2 } : { ha: 9, hb: 9 })), 1, 'the main building: the biggest building, not the biggest prop');
  });

  it('6. Generate keeps the lot (type, state, size, road angle) and rolls another variant and a new seed; New lot keeps the locks', () => {
    const lot = { use: 'res', state: 'built', w: 11, d: 17, road: 3 as const }, r = mulberry(7);
    let v = 0, seed = 5;
    for (let i = 0; i < 30; i++) {
      const g = planInPlace(lot, 4, v, seed, r);
      assert.deepEqual(g.lot, lot, 'the same lot'); assert.notEqual(g.variant, v, 'another variant'); assert.ok(g.variant >= 0 && g.variant < 4); assert.notEqual(g.seed, seed, 'a new seed');
      v = g.variant; seed = g.seed;
    }
    const one = planInPlace(lot, 1, 0, 9, r); assert.equal(one.variant, 0, 'one candidate: the same variant, a new seed'); assert.notEqual(one.seed, 9);
    const sizes = [{ key: '10x16', w: 10, d: 15 }, { key: '12x16', w: 12, d: 16 }, { key: '14x20', w: 14, d: 20 }];
    for (let i = 0; i < 20; i++) {
      const a = planNewLot(sizes, '12x16', 2, true, false, r); assert.equal(a.size, '12x16', 'size locked'); assert.ok(a.fresh && a.road !== 2);
      const b = planNewLot(sizes, '12x16', 2, false, true, r); assert.equal(b.road, 2, 'angle locked'); assert.ok(b.fresh && b.size !== '12x16');
    }
    assert.deepEqual(planNewLot(sizes, '12x16', 2, true, true, r), { size: '12x16', road: 2, fresh: false }, 'both locked: the same cell (the next variant)');
  });

  it('7. the neighbours: two each way along the street, side by side with the lab lot, and three across it facing back', () => {
    const g = { o: { x: 100, y: 100 }, u: { x: 1, y: 0 }, n: { x: 0, y: -1 }, w: 12, d: 16 };
    const nb = neighbourLots(g, 6, k => 10 + k);
    assert.equal(nb.length, 7);
    const along = nb.filter(n => n.side === 'along'), across = nb.filter(n => n.side === 'across');
    assert.equal(along.length, 4); assert.equal(across.length, 3);
    assert.deepEqual(along.map(n => [n.g.o.x, n.g.w]), [[90, 10], [79, 11], [112, 12], [124, 13]], 'abutting the lab lot (100 .. 112) and each other');
    for (const n of along) { assert.equal(n.g.o.y, 100); assert.deepEqual(n.g.n, g.n); assert.equal(n.g.d, 16); }
    for (const n of across) { assert.deepEqual(n.g.n, { x: -0, y: 1 }); assert.equal(n.g.o.y, 106, 'the far side of the street (the street lies along -n), 6 tiles off'); }
    // the one opposite is centred on the lab lot: front edge from x = o.x (u' = -u) back to o.x - w
    const opp = across[0]!; assert.equal(opp.g.o.x - opp.g.w / 2, 106);
  });
});

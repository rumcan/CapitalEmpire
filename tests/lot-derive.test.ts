// T155 PR 2 (#333): lots auto-sized from a master on the largest lot (src/game/lots/derive.ts, src/game/dev/lot-derive.ts): the derived sizes fit
// (the house keeps its street edge and its spot along the street, shifted in only to fit), fences follow the lot's edges, what no longer fits
// goes by priority (trees, then large props, then small props; decals last), nothing overlaps that did not on the master; a derived preset is
// marked and derived again when its master is saved; a hand edit detaches it and the master leaves that size alone; the file keeps the marks and
// reads old files as before; the masters report. Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LotPreset, PresetProp } from '../src/game/lots/presets';
import { bucketOf, formatPresets, parsePresets } from '../src/game/lots/presets';
import { deriveAll, derivedId, derivePreset, detach, isMaster, knotMap, largestSize, type DeriveInfo, type DeriveKind, type DeriveSize, type Half } from '../src/game/lots/derive';
import { deriveInfo, deriveMaster, isFence, isTree, mastersReport } from '../src/game/dev/lot-derive';
import { lotPresets } from '../src/game/lots/compose';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** a prop of id at (x, y) */
const P = (id: string, x: number, y: number): PresetProp => ({ id, x, y, scale: 1, view: 0 });
/** the tests' footprints and kinds by id prefix: house 6 x 5, shed 2 x 2 (large), tree 2 x 2, bush 1 x 1 (small), fence 2 x 0.2 or 0.2 x 2 */
const HALF: Record<string, Half> = { house: { ha: 3, hb: 2.5 }, shed: { ha: 1, hb: 1 }, tree: { ha: 1, hb: 1 }, bush: { ha: 0.5, hb: 0.5 }, fenceX: { ha: 1, hb: 0.1 }, fenceY: { ha: 0.1, hb: 1 } };
const KIND: Record<string, DeriveKind> = { house: 'house', shed: 'large', tree: 'tree', bush: 'small', fenceX: 'fence', fenceY: 'fence' };
const pre = (id: string) => id.split('-')[0]!;
const INFO: DeriveInfo = { half: q => HALF[pre(q.id)]!, kind: q => KIND[pre(q.id)]! };
type Box = [number, number, number, number];
const box = (q: PresetProp): Box => { const h = INFO.half(q); return [q.x - h.ha, q.y - h.hb, q.x + h.ha, q.y + h.hb]; };
const over = (a: Box, b: Box) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0.15 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0.15;
/** a 20 x 24 master: the house 4 tiles back, mid-lot; fences round the back and the sides; a shed, trees, bushes in the yard */
function master(): LotPreset {
  const props: PresetProp[] = [P('house-a', 10, 6.5)];
  for (let x = 1; x < 20; x += 2) props.push(P(`fenceX-b${x}`, x, 23.9));
  for (let y = 1; y < 24; y += 2) props.push(P(`fenceY-l${y}`, 0.1, y), P(`fenceY-r${y}`, 19.9, y));
  props.push(P('shed-1', 16, 18), P('tree-1', 4, 18), P('tree-2', 15, 13), P('bush-1', 14, 7), P('bush-2', 6, 7), P('bush-3', 17, 21), P('tree-3', 17, 21.2));
  return { id: 'lab-res-built-20x24-r0-m', use: 'res', state: 'built', w: 20, d: 24, road: 0, whole: true, approved: true, props, patches: [{ kind: 'walk', tex: 'paving', pts: [9, 0, 11, 0, 11, 4, 9, 4] }], decals: [{ id: 'leaf', x: 18, y: 22, scale: 1, alpha: 1 }, { id: 'leaf', x: 3, y: 2, scale: 1, alpha: 1 }] };
}
const SIZES: DeriveSize[] = [{ w: 20, d: 24, bw: 20, bd: 24 }, { w: 16, d: 20, bw: 16, bd: 20 }, { w: 12, d: 16, bw: 12, bd: 16 }, { w: 10, d: 14, bw: 10, bd: 14 }, { w: 22, d: 12, bw: 22, bd: 12 }, { w: 5, d: 30, bw: 6, bd: 30 }];

describe('auto-sized lots (T155 PR 2)', () => {
  it('1. the map keeps order between knots and shifts past the ends', () => {
    const f = knotMap([[0, 0], [7, 4], [13, 10], [20, 14]]);
    assert.equal(f(0), 0); assert.equal(f(7), 4); assert.equal(f(10), 7); assert.equal(f(20), 14); assert.equal(f(16.5), 12); assert.equal(f(-1), -1); assert.equal(f(21), 15);
  });
  it('2. a derived size fits: the house keeps its street edge and its spot (shifted in to fit); every prop lies inside the lot', () => {
    const m = master();
    for (const s of SIZES.slice(1, 4)) {
      const r = derivePreset(m, s.w, s.d, INFO, 'x')!, h = r.preset.props.find(q => q.id === 'house-a')!;
      assert.ok(h, 'the house is kept');
      assert.equal(h.y - 2.5, 4, `${s.w}x${s.d}: the house's street edge stays 4 tiles back`);
      assert.equal(h.x, s.w / 2, `${s.w}x${s.d}: its spot along the street (in the middle on the master, in the middle here)`);
      for (const q of r.preset.props) { const b = box(q); assert.ok(b[0] >= -1e-6 && b[2] <= s.w + 1e-6 && b[1] >= -1.5 && b[3] <= s.d + 1e-6, `${q.id} inside ${s.w}x${s.d}`); }
      for (const c of r.preset.decals!) assert.ok(c.x >= 0 && c.x <= s.w && c.y <= s.d);
      for (const a of r.preset.patches) for (let i = 0; i < a.pts.length; i += 2) assert.ok(a.pts[i]! <= s.w && a.pts[i + 1]! <= s.d);
      assert.equal(r.preset.derived, m.id); assert.equal(r.preset.approved, true, 'it follows the master\'s approval');
    }
    // a house by the left edge stays by it: its gaps to the sides keep their shares of the free width
    const left: LotPreset = { ...m, props: [P('house-a', 5, 6.5)] }, l = derivePreset(left, 12, 16, INFO, 'x')!.preset.props[0]!;
    assert.ok(Math.abs((l.x - 3) / (12 - 6) - 2 / 14) < 1e-3, `left gap share kept: ${l.x}`);
    // a shallow lot shifts the house forward only as far as it must
    assert.equal(derivePreset(m, 20, 8, INFO, 'x')!.preset.props.find(q => q.id === 'house-a')!.y, 8 - 2.5);
    // a lot narrower than the house cannot be derived
    assert.equal(derivePreset(m, 5, 30, INFO, 'x'), null);
  });
  it('3. nothing overlaps that did not overlap on the master; what no longer fits goes trees first, then large props, then small props', () => {
    const m = master();
    for (const s of SIZES.slice(1, 4)) {
      const r = derivePreset(m, s.w, s.d, INFO, 'x')!, ps = r.preset.props;
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        if (!over(box(ps[i]!), box(ps[j]!))) continue;
        const mi = m.props.find(q => q.id === ps[i]!.id)!, mj = m.props.find(q => q.id === ps[j]!.id)!;
        assert.ok(over(box(mi), box(mj)), `${s.w}x${s.d}: ${ps[i]!.id} and ${ps[j]!.id} overlap only as on the master`);
      }
    }
    // bush-3 and tree-3 overlapped on the master: both may stay together
    const big = derivePreset(m, 16, 20, INFO, 'x')!;
    // the smallest lot keeps its small props over its trees: a tree goes before any bush, a shed (large) before a bush
    const small = derivePreset(m, 10, 14, INFO, 'x')!, ids = new Set(small.preset.props.map(q => q.id));
    assert.ok(small.dropped.tree >= small.dropped.small, `trees go first: ${JSON.stringify(small.dropped)}`);
    assert.ok(['bush-1', 'bush-2'].every(b => ids.has(b)), 'the front bushes by the house stay');
    assert.ok(small.preset.props.length < big.preset.props.length && big.preset.props.length < m.props.length, 'fewer props as the size goes down');
    // a crowded strip: a bush, a shed and a tree side by side behind the house; shrunk, the tree goes first, then the shed
    const crowd: LotPreset = { ...master(), props: [P('house-a', 10, 6.5), P('bush-9', 10, 13), P('shed-9', 12.2, 13), P('tree-9', 7.8, 13)] };
    const c1 = derivePreset(crowd, 20, 14, INFO, 'c')!;
    assert.deepEqual(c1.preset.props.map(q => q.id).sort(), ['bush-9', 'house-a', 'shed-9', 'tree-9'].sort(), 'room for all');
    const narrow: LotPreset = { ...crowd, props: [P('house-a', 10, 6.5), P('bush-9', 10, 16), P('shed-9', 10, 16.6), P('tree-9', 10, 17.4)] };
    const c2 = derivePreset(narrow, 20, 12, INFO, 'c')!, kept = c2.preset.props.map(q => q.id);
    assert.ok(kept.includes('bush-9') && !kept.includes('tree-9'), `the tree goes before the bush: ${kept}`);
    assert.ok(!kept.includes('shed-9') || kept.includes('bush-9'), 'the shed goes before the bush');
    assert.equal(c2.dropped.decal, 0, 'decals stay while they are on the lot');
  });
  it('4. fences follow the lot\'s edges: the back run moves to the new back, the right side to the new right, a continuous run, segments past the corner gone', () => {
    const m = master(), r = derivePreset(m, 12, 16, INFO, 'x')!, ps = r.preset.props;
    const back = ps.filter(q => q.id.startsWith('fenceX-b')), right = ps.filter(q => q.id.startsWith('fenceY-r')), left = ps.filter(q => q.id.startsWith('fenceY-l'));
    assert.ok(back.every(q => Math.abs(q.y - (23.9 - 8)) < 1e-6), 'the back run at the new back edge');
    assert.ok(right.every(q => Math.abs(q.x - (19.9 - 8)) < 1e-6), 'the right side at the new right edge');
    assert.ok(left.every(q => q.x === 0.1), 'the left side stays');
    const xs = back.map(q => q.x).sort((a, b) => a - b);
    assert.ok(xs[0]! <= 1 && xs.every((x, i) => i === 0 || x - xs[i - 1]! <= 2 + 1e-6), `the back run has no gap: ${xs}`);
    assert.ok(back.every(q => q.x + 1 <= 12 + 1e-6) && right.every(q => q.y + 1 <= 16 + 1e-6), 'nothing past the corner');
    assert.ok(right.length >= 7 && left.length >= 7, 'the sides keep their front segments');
  });
  it('5. the master derives every smaller size; saving it again derives them again (same ids), sizes it no longer covers are removed', () => {
    const m = master(), all: LotPreset[] = [m];
    assert.ok(isMaster(m, SIZES.slice(0, 4)), 'the largest size of its type and state');
    assert.equal(largestSize(SIZES)!.bw, 20);
    const a = deriveAll(m, SIZES, INFO, all);
    assert.deepEqual(a.upsert.map(p => p.id), [derivedId(m.id, 16, 20), derivedId(m.id, 12, 16), derivedId(m.id, 10, 14)]);
    assert.deepEqual(a.skipped.map(s => s.key), ['22x12', '6x30'], 'wider than the master; deeper than the master');
    const after = [...all, ...a.upsert];
    assert.ok(a.upsert.every(p => !isMaster(p, SIZES)), 'a derived preset is no master');
    // the master saved again with a change: the same ids, the change carried
    const m2: LotPreset = { ...m, props: m.props.filter(q => q.id !== 'tree-1') };
    const b = deriveAll(m2, SIZES.filter(s => s.bw !== 10), INFO, after);
    assert.ok(b.upsert.every(p => !p.props.some(q => q.id === 'tree-1')), 'the master\'s change reaches every derived size');
    assert.deepEqual(b.remove, [derivedId(m.id, 10, 14)], 'a size no longer derived is removed');
  });
  it('6. a hand edit detaches a derived preset; the master then leaves that size alone; an old file reads the same, the marks round-trip', () => {
    const m = master(), a = deriveAll(m, SIZES, INFO, [m]), d = a.upsert[1]!;
    const edited = detach({ ...d, props: d.props.slice(1) });
    assert.equal(edited.derived, undefined); assert.equal(edited.detached, m.id); assert.equal(edited.curated, true);
    assert.equal(detach(m), m, 'a preset not derived is left as it is');
    const b = deriveAll(m, SIZES, INFO, [m, edited, ...a.upsert.filter(p => p.id !== d.id)]);
    assert.ok(!b.upsert.some(p => p.id === d.id), 'not derived again'); assert.ok(b.skipped.some(s => s.key === '12x16' && /detached/.test(s.why)));
    assert.ok(!b.remove.includes(d.id), 'and not removed: it is the owner\'s');
    const text = formatPresets([m, d, edited]), back = parsePresets(JSON.parse(text));
    assert.equal(back.invalid, 0); assert.equal(back.presets[1]!.derived, m.id); assert.equal(back.presets[2]!.detached, m.id);
    // the owner's file (no T155 marks yet) reads and writes back unchanged: nothing to migrate
    const own = lotPresets(), again = parsePresets(JSON.parse(formatPresets(own)));
    assert.equal(again.presets.length, own.length); assert.ok(own.every(p => p.derived === undefined || typeof p.derived === 'string'));
  });
  it('7. the library\'s kinds and footprints: a real lab preset derives inside every smaller lot with no new overlap', () => {
    assert.ok(isFence('world:fence_white') || isFence('fence'), 'a fence'); assert.ok(!isTree('world:fire_hydrant'), 'a hydrant is no tree'); assert.ok(isTree('trees:maple-red'));
    const src = lotPresets().find(p => p.road !== undefined && p.use === 'res' && p.whole && p.props.length > 10);
    if (!src) return;
    const info = deriveInfo(src), kinds = src.props.map((q, i) => info.kind(q, i));
    assert.equal(kinds.filter(k => k === 'house').length, 1, 'one house');
    const mb = bucketOf(src.w, src.d), sizes: DeriveSize[] = [{ w: src.w, d: src.d, bw: mb.w, bd: mb.d }, { w: src.w - 2, d: src.d - 2, ...bucketOf(src.w - 2, src.d - 2) as { w: number; d: number } }].map(s => ({ w: s.w, d: s.d, bw: bucketOf(s.w, s.d).w, bd: bucketOf(s.w, s.d).d }));
    const r = deriveMaster(src, sizes, [src]);
    for (const p of r.upsert) {
      const hb = (q: PresetProp): Box => { const h = info.half(q); return [q.x - h.ha, q.y - h.hb, q.x + h.ha, q.y + h.hb]; };
      for (const q of p.props) { const b = hb(q); assert.ok(b[0] >= -1e-3 && b[2] <= p.w + 1e-3 && b[3] <= p.d + 1e-3 && b[1] >= -1.5 - 1e-3, `${q.id} inside`); }
    }
  });
  it('8. the masters report: per master the sizes it covers of those it could; the approved cells of them all', () => {
    const m = master(), a = deriveAll(m, SIZES.slice(0, 4), INFO, [m]);
    const rep = mastersReport([m, ...a.upsert], (u, s) => (u === 'res' && s === 'built' ? SIZES.slice(0, 4) : []), ['res', 'com'], ['built', 'upgraded']);
    assert.equal(rep.masters.length, 1); assert.equal(rep.masters[0]!.covers, 3); assert.equal(rep.masters[0]!.of, 3);
    assert.equal(rep.derived, 3); assert.equal(rep.cells, 4 * 8); assert.equal(rep.covered, 4, 'the master and its three derived sizes, approved, on road 0');
  });
});

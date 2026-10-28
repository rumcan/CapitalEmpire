// T257 (#747; the owner, 2026-10-29: "terrible shadows on these rocks and bad ui thumbnails. the thumbs pixelate and where is the variety? Also I
// should be able rotate props and scale them a little"): the kit's and the site kit's shadows stand at their foot (their own vector shadows,
// not T141's silhouette hinged below the picture), the thumbnails are drawn from the masters, the mixed brushes are the same at the same spot,
// R mirrors only natural things (never a front), [ and ] size a prop 80% to 120%, and both are saved and loaded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { LIBRARY } from '../src/game/library';
import { KIT_BOULDERS, KIT_FLOWERS, KIT_PALM_IDS, KIT_SHRUBS } from '../src/game/kit';
import { DECOR, DECOR_BY_KEY, SIZE_MAX, SIZE_MIN, clampSize, familyKey, mixPick, propTuple, sellBack, sizedPrice, tupleMarks } from '../src/game/golf/decor';
import { PropsTool, type PropsHostCtx } from '../src/game/golf/propstool';
import { VECTOR_SHADOWS, vectorFallback } from '../src/game/shadow-vector';
import { VECTOR, vecOf } from '../src/game/sprites';
import { NATURAL_KINDS, drawnAs } from '../src/game/mirror';
import { hasLettering } from '../src/game/lots/lettering';
import { masterPath, thumbBox, thumbSource } from '../src/ui/thumb-source';
import type { Prop } from '../src/game/types';

const LIB = new Map(LIBRARY.map((it, i) => [it.id, i]));
const KIT = LIBRARY.filter(it => /^kit:|^construction:(site-|timber-frame)/.test(it.id));

test('the shadows: every kit and site-kit picture has its own vector shadow at its foot (no silhouette hinged below the picture)', () => {
  assert.ok(KIT.length >= 55, `${KIT.length} pictures`);
  assert.ok(VECTOR.on, 'the vector shadows are on');
  for (const it of KIT) {
    const i = LIB.get(it.id)!, e0 = VECTOR_SHADOWS[it.id];
    // the open stud frames keep the silhouette on purpose (their studs), and say why
    if (vectorFallback(it.id, it.kind)) { assert.ok(/timber-frame/.test(it.id), `${it.id} on the fallback list`); continue; }
    assert.ok(e0, `${it.id} has a vector shadow entry`); assert.ok(vecOf(i), `${it.id} draws it (no T141 silhouette)`);
    const e = e0!.same ? VECTOR_SHADOWS[e0!.same]! : e0!;
    if (it.kind === 'fountain' || it.kind === 'decal') { assert.ok(!e.c && !e.s, `${it.id}: water and flat pads cast nothing`); continue; }
    assert.ok(e.c?.length && e.s?.length, `${it.id}: a contact under its foot and a cast`);
    // the picture's foot (display px below the anchor) and its height
    const foot = it.quad[3] - it.ay, H = it.quad[3] - it.quad[1], s = e.s!.flat();
    let lowest = -Infinity, minH = Infinity, maxH = 0;
    for (let k = 0; k < s.length; k += 3) { lowest = Math.max(lowest, s[k + 1]!); minH = Math.min(minH, s[k + 2]!); maxH = Math.max(maxH, s[k + 2]!); }
    // the cast stands on the picture's foot: its ground points no lower than the foot (a few px of soft rim), and it starts at the base
    assert.ok(lowest <= foot + 4 + 0.02 * H, `${it.id}: the cast's foot ${lowest} px, the picture's ${foot.toFixed(1)}`);
    // (a pond edge's run of stones: its cast's near edge lies hidden behind the stones)
    if (!/pond-edge/.test(it.id)) assert.ok(minH <= Math.max(6, 0.1 * H), `${it.id}: the cast starts at the base (lowest point ${minH} px up)`);
    // the contact lies under the foot: it covers the picture's foot line, within the picture's width about the anchor (a pool under a trunk or
    // a post, a band along a box's base)
    const c = e.c!.flat(), cx: number[] = [], cy: number[] = []; for (let k = 0; k + 1 < c.length; k += 2) { cx.push(c[k]!); cy.push(c[k + 1]!); }
    assert.ok(Math.min(...cy) <= foot + 2 && Math.max(...cy) >= foot - 2, `${it.id}: the contact ${Math.min(...cy)}..${Math.max(...cy)} px covers the foot ${foot.toFixed(1)}`);
    assert.ok(Math.min(...cx) >= -it.ax - 8 && Math.max(...cx) <= it.w - it.ax + 8, `${it.id}: the contact within the picture's width`);
    // a boulder's cast is its height, not its picture's (the top face seen from above is depth): at most 0.8 of the picture
    if (/^kit:boulder-/.test(it.id)) assert.ok(maxH <= 0.8 * H, `${it.id}: casts ${maxH} px of its ${H.toFixed(0)} px picture`);
  }
  // why they detached (T141's silhouette): it hinged on the footprint's near corner, 32 x box px below the anchor, below the picture's foot
  for (const id of [...KIT_BOULDERS.small, ...KIT_BOULDERS.medium, ...KIT_BOULDERS.large]) {
    const it = LIBRARY[LIB.get(id)!]!; assert.ok(32 * it.boxes[0]!.hx > it.quad[3] - it.ay + 2, `${id}: the old hinge lay below the picture`);
  }
});

test('the thumbnails: a kit or site-kit picture is drawn from its master in the repo, anything else from its atlas page\'s mip 0', () => {
  for (const it of KIT) {
    const s = thumbSource(it), path = masterPath(it.id)!;
    assert.equal(s.kind, 'master', it.id); assert.ok(existsSync(path), `${path} is in the repo`);
    if (s.kind === 'master') assert.equal(s.path, path);
    // with the build's URLs: the master's
    const u = thumbSource(it, { [path]: 'blob:master' }); assert.equal(u.url, 'blob:master', it.id);
  }
  // not a kit picture: its atlas cell at mip 0 (never a smaller mip), the cell's rect in that page
  const it = LIBRARY[LIB.get('town:hydrangea')!]!, s = thumbSource(it);
  assert.equal(s.kind, 'atlas'); if (s.kind === 'atlas') { assert.equal(s.level, 0); assert.equal(s.page, it.tex[0]); assert.ok(s.rect[2] > 0 && s.rect[3] > 0); }
  // a kit picture whose master the build lacks falls back to its atlas cell
  assert.equal(thumbSource(LIBRARY[LIB.get('kit:boulder-small-a')!]!, { 'art/x.webp': 'blob:x' }).kind, 'atlas');
  // the box keeps the picture's aspect inside the square
  const b = thumbBox(LIBRARY[LIB.get('kit:palm-canary-10m')!]!, 50); assert.equal(b.h, 50); assert.ok(b.w < 50 && b.w > 30);
});

/** a fake host (golf-props-tool.test.ts's) that keeps a prop's flip */
function host() {
  const props = new Set<Prop>(); let uid = 1, money = 1e6, sel: Prop | null = null;
  const steps: { label: string; spent: number; added: number; removed: number }[] = []; let cur: { added: number; removed: number } | null = null;
  const ctx: PropsHostCtx = {
    golf: () => true, item: id => LIB.get(id), idOf: p => LIBRARY[p.item]!.id,
    scaleOf: (_i, want) => want ?? 1, footprint: (_i, x, y, k) => [x - 0.4 * k, y - 0.4 * k, x + 0.4 * k, y + 0.4 * k],
    spot: { owned: x => x >= 0 && x < 2000, water: () => false, road: () => false, course: () => '' },
    propsIn: b => [...props].filter(p => p.x1 > b[0] && p.x0 < b[2] && p.y1 > b[1] && p.y0 < b[3]), props: () => props, propName: p => LIBRARY[p.item]!.name,
    scene: () => null,
    addProp: (item, x, y, k, flip = false) => { const [, f] = drawnAs(LIBRARY[item]!, flip); const p: Prop = { uid: uid++, item, x, y, flip: f, scale: k, x0: x - 0.4 * k, y0: y - 0.4 * k, x1: x + 0.4 * k, y1: y + 0.4 * k }; props.add(p); if (cur) cur.added++; return p; },
    removeProp: p => { props.delete(p); if (cur) cur.removed++; },
    propAt: () => null, tileAt: (mx, my) => ({ x: mx, y: my }),
    selected: () => sel, select: p => { sel = p; }, hover: () => {},
    money: () => money, spend: n => { money -= n; },
    step: (label, run) => { cur = { added: 0, removed: 0 }; const spent = run(); steps.push({ label, spent, ...cur }); cur = null; },
    undo: () => {}, redo: () => {}, save: () => {}, toast: () => {}, emit: () => {},
  };
  return { ctx, props, steps, money: () => money, sel: () => sel };
}
const key = (k: string) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} }) as unknown as KeyboardEvent;

test('the variety: each boulder shape is its own card (three shapes at each size), and the mixed brushes', () => {
  for (const [s, ids] of [['s', KIT_BOULDERS.small], ['m', KIT_BOULDERS.medium], ['l', KIT_BOULDERS.large]] as const) {
    const cards = DECOR.filter(d => d.family === `kit-boulder-${s}` && !d.hidden);
    assert.deepEqual(cards.map(d => d.id), [...ids], `the ${s} boulders: three cards`); assert.equal(new Set(cards.map(d => d.name)).size, 3, 'each named for its shape');
    assert.ok(cards.every(d => d.group === 'stone' && d.natural && d.price === cards[0]!.price), 'one price a size');
    // the first keeps T231's key, so a saved prop keeps its card; a picture takes the card of its shape
    assert.equal(cards[0]!.key, `kit-boulder-${s}`); for (const d of cards) assert.equal(familyKey(cards[0]!, d.id), d.key);
  }
  for (const [k, n] of [['kit-rocks-mixed', 9], ['kit-shrubs-mixed', KIT_SHRUBS.length], ['kit-mums-mixed', KIT_FLOWERS.length], ['kit-palms-mixed', KIT_PALM_IDS.length]] as const) {
    const d = DECOR_BY_KEY.get(k)!; assert.ok(d && !d.hidden, k); assert.equal(d.mix!.length, n, `${k} picks`);
    for (const m of d.mix!) { assert.ok(LIB.has(m.id), m.id); assert.ok(DECOR_BY_KEY.has(m.key) && !DECOR_BY_KEY.get(m.key)!.mix, `${m.key} is a card`); }
  }
  assert.equal(DECOR_BY_KEY.get('kit-rocks-mixed')!.group, 'stone'); for (const k of ['kit-shrubs-mixed', 'kit-mums-mixed', 'kit-palms-mixed']) assert.equal(DECOR_BY_KEY.get(k)!.group, 'plants');
});

test('a mixed brush is deterministic per spot: the same pick at the same spot, every boulder over a field, never mirrored (the owner, 2026-10-28)', () => {
  const d = DECOR_BY_KEY.get('kit-rocks-mixed')!, seen = new Set<string>(), flips = new Set<boolean>();
  for (let y = 0; y < 20; y += 0.25) for (let x = 0; x < 20; x += 0.25) {
    const a = mixPick(d, x, y)!, b = mixPick(d, x, y)!; assert.deepEqual(a, b); seen.add(a.id); flips.add(a.flip);
  }
  assert.equal(seen.size, 9, 'all nine boulders'); assert.deepEqual([...flips], [false], 'never mirrored');
  assert.notDeepEqual([0, 1, 2, 3, 4, 5].map(k => mixPick(d, k, 0)!.id), [0, 1, 2, 3, 4, 5].map(k => mixPick(DECOR_BY_KEY.get('kit-shrubs-mixed')!, k, 0)!.id));
  // the tool: two players dragging the same line lay the same stones, as one undo step, none overlapping; a click drops one
  const lay = () => {
    const h = host(), t = new PropsTool(h.ctx); t.pick('kit-rocks-mixed');
    t.down(10, 10); for (let k = 1; k <= 40; k++) t.move(10 + k * 0.25, 10); t.up();
    return { h, list: [...h.props].map(p => [LIBRARY[p.item]!.id, p.x, p.y, p.flip, p.decor] as const) };
  };
  const a = lay(), b = lay();
  assert.deepEqual(a.list, b.list); assert.ok(a.list.length >= 3, `${a.list.length} rocks`);
  assert.equal(a.h.steps.length, 1); assert.equal(a.h.steps[0]!.added, a.list.length);
  const ps = [...a.h.props]; for (const p of ps) for (const q of ps) if (p !== q) assert.ok(p.x1 <= q.x0 || q.x1 <= p.x0 || p.y1 <= q.y0 || q.y1 <= p.y0, 'no two overlap');
  // each rock is its own card at its own price
  let cost = 0; for (const [id, , , , k] of a.list) { const c = DECOR_BY_KEY.get(k!)!; assert.equal(c.id, id, `${k} shows its own shape`); cost += c.price; }
  assert.equal(a.h.steps[0]!.spent, cost); assert.equal(1e6 - a.h.money(), cost);
  // a long drag (footprints of their real sizes): every pick about as often as the others, a small one no likelier than a big one
  for (const k of ['kit-rocks-mixed', 'kit-palms-mixed', 'kit-shrubs-mixed']) {
    const e = host(); e.ctx.footprint = (i, x, y, s) => { const b = LIBRARY[i]!.boxes[0]!, hx = b.hx / 2 * s, hy = b.hy / 2 * s; return [x - hx, y - hy, x + hx, y + hy]; };
    const tt = new PropsTool(e.ctx), d = DECOR_BY_KEY.get(k)!; tt.pick(k); tt.down(10, 10); for (let i = 1; i <= 4000; i++) tt.move(10 + i * 0.25, 10); tt.up();
    const n = new Map<string, number>(); for (const p of e.props) n.set(LIBRARY[p.item]!.id, (n.get(LIBRARY[p.item]!.id) ?? 0) + 1);
    const all = e.props.size, want = all / d.mix!.length;
    for (const m of d.mix!) assert.ok((n.get(m.id) ?? 0) > 0.5 * want && (n.get(m.id) ?? 0) < 1.6 * want, `${k}: ${m.id} ${n.get(m.id) ?? 0} of ${all}`);
  }
  const c = host(), t = new PropsTool(c.ctx); t.pick('kit-palms-mixed'); t.down(50, 50); t.up();
  const p = [...c.props][0]!, m = mixPick(DECOR_BY_KEY.get('kit-palms-mixed')!, 50, 50)!;
  assert.equal(c.props.size, 1); assert.equal(LIBRARY[p.item]!.id, m.id); assert.equal(p.decor, m.key); assert.equal(p.flip, m.flip);
});

test('R and [ ]: a rock in hand steps its shapes (never mirrored) and sizes 80% to 120% (the price follows); the same on a placed one; saved and loaded', () => {
  const h = host(), t = new PropsTool(h.ctx);
  t.pick('kit-boulder-m'); t.move(10, 10);
  assert.ok(t.key(key('r'))); assert.equal(t.ghost!.flip, false); assert.doesNotMatch(t.ghost!.label, /mirrored/);
  assert.equal(LIBRARY[t.ghost!.item]!.id, KIT_BOULDERS.medium[1], 'the next shape');
  for (let k = 0; k < 6; k++) t.key(key('['));
  assert.equal(t.size, SIZE_MIN, 'held at 80%'); assert.match(t.ghost!.label, /80%/); assert.equal(t.ghost!.price, 280); assert.equal(t.ghost!.scale, 0.8);
  t.down(10, 10);
  const p = [...h.props][0]!;
  assert.equal(LIBRARY[p.item]!.id, KIT_BOULDERS.medium[1]); assert.equal(p.flip, false); assert.equal(p.scale, 0.8);
  assert.equal(p.decor, 'kit-boulder-m-b', 'the card of the shape placed'); assert.equal(1e6 - h.money(), 280); assert.equal(sellBack(DECOR_BY_KEY.get('kit-boulder-m-b')!, 0.8), 140);
  // the placed one: ] twice (it pays the difference), R (the next shape)
  t.pick(null); h.ctx.select(p);
  t.key(key(']')); t.key(key(']'));
  let q = h.sel()!; assert.ok(Math.abs(q.scale - 0.9) < 1e-9); assert.equal(q.flip, false, 'never mirrored'); assert.deepEqual(h.steps.slice(-2).map(s => s.spent), [sizedPrice(350, 0.85) - 280, sizedPrice(350, 0.9) - sizedPrice(350, 0.85)]);
  t.key(key('r')); q = h.sel()!;
  assert.equal(LIBRARY[q.item]!.id, KIT_BOULDERS.medium[2]); assert.equal(q.flip, false); assert.equal(q.decor, 'kit-boulder-m-c'); assert.ok(Math.abs(q.scale - 0.9) < 1e-9, 'keeps its size');
  t.key(key('r')); q = h.sel()!; assert.equal(q.flip, false); assert.equal(LIBRARY[q.item]!.id, KIT_BOULDERS.medium[0], 'round to the first shape');
  for (let k = 0; k < 9; k++) t.key(key(']'));
  q = h.sel()!; assert.ok(Math.abs(q.scale - SIZE_MAX) < 1e-9, 'held at 120%'); assert.equal(t.sizeOf(q, DECOR_BY_KEY.get(q.decor!)!), 1.2);
  // shrinking gives half the difference back
  const before = h.money(); t.key(key('[')); assert.equal(h.money() - before, Math.round((sizedPrice(350, 1.2) - sizedPrice(350, 1.15)) / 2));
  // the save: the flip and the scale ride in the tuple (fields 4 and 5), with its card; a T257 save's mirrored rock loads unmirrored
  q = h.sel()!; const tup = propTuple(LIBRARY[q.item]!.id, q), back = JSON.parse(JSON.stringify(tup));
  assert.deepEqual(back.slice(3, 7), [0, q.scale, 0, q.decor]); assert.deepEqual(tupleMarks(back), { decor: q.decor });
  assert.deepEqual(drawnAs(LIBRARY[LIB.get(back[0])!]!, true), [back[0], false], 'a mirrored save loads unmirrored');
  // an old save's rock (T231: unmirrored, its size, the size's key) loads as it was, at 100%
  const old = ['kit:boulder-small-b', 5, 5, 0, 1, 0, 'kit-boulder-s'];
  assert.deepEqual(tupleMarks(old), { decor: 'kit-boulder-s' }); assert.deepEqual(drawnAs(LIBRARY[LIB.get('kit:boulder-small-b')!]!, false), ['kit:boulder-small-b', false]);
  assert.equal(clampSize(1), 1); assert.equal(sizedPrice(350), 350); assert.equal(sizedPrice(50, 0.85), 45);
});

test('nothing mirrors (the owner, 2026-10-28: "make sure we never mirror a bush or tree or plant. always sun from top right"): R turns views or steps pictures', () => {
  for (const d of DECOR) {
    // natural things are plants and stones only: never furniture, a sign, a building, a statue, a stand-in, anything lettered or laid as a run
    if (d.natural) {
      assert.ok(d.group === 'plants' || d.group === 'stone', `${d.key} ${d.group}`); assert.ok(d.kind === 'plant' || d.kind === 'stone', `${d.key} ${d.kind}`);
      assert.ok(!d.standIn && !d.run && !d.pond && !hasLettering(d.id, LIBRARY[LIB.get(d.id)!]!.name), d.key);
    }
    const h = host(), t = new PropsTool(h.ctx); if (d.run || d.pond) continue;
    t.pick(d.key); t.move(20, 20); let mirrored = false;
    for (let k = 0; k < 8; k++) { t.turn(); mirrored ||= !!t.ghost?.flip; }
    assert.ok(!mirrored, `${d.key} never mirrors`);
    // placed, R on it never mirrors it either; and the engine draws no natural thing mirrored whatever it is asked (mirror.ts)
    t.pick(d.key); t.down(20, 20); t.pick(null); const p = [...h.props][0]; if (!p) continue;
    assert.ok(!p.flip, `${d.key} placed unmirrored`);
    h.ctx.select(p); for (let k = 0; k < 4; k++) { t.turn(); assert.ok(!(h.sel() ?? p).flip, `${d.key} turned`); }
    const it = LIBRARY[LIB.get(d.id)!]!; if (NATURAL_KINDS.has(it.kind)) assert.equal(drawnAs(it, true)[1], false, `${d.id} drawn unmirrored`);
  }
  for (const k of ['bench', 'board', 'flagpole', 'statue', 'lamp', 'kit-lamp', 'chapel', 'bus-shelter', 'pot-terracotta']) assert.ok(!DECOR_BY_KEY.get(k)!.natural, k);
});

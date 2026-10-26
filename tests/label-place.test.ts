// World labels never overlap (T151, #322; the lead, 2026-10-26: "one placement pass each frame: by priority ..., each label takes its anchor if
// free, else the nearest free slot just above or below within a small radius, else it is hidden at that zoom (and shown again when there is
// room). Stable: a label does not jump between slots frame to frame"): the pure placement pass (src/game/label-place.ts) and the money floats'
// columns placed after it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ColumnPlacer, LabelPlacer, PRI, type PlaceLabel } from '../src/game/label-place';
import { LABEL_OUTLINE, WorldLabels } from '../src/game/world-labels';
import { MoneyFloats, drawMoneyFloats } from '../src/game/moneyfloats';

const W = 1600, H = 1000;
const lab = (key: unknown, pri: number, x: number, y: number, w = 120, h = 16): PlaceLabel => ({ key, pri, x, y, w, h, px: 0, py: 0, shown: false });
const place = (P: LabelPlacer, L: PlaceLabel[]) => P.place(L, L.length, 0, 0, W, H);
const overlap = (a: PlaceLabel, b: PlaceLabel, gap: number) =>
  Math.abs(a.px - b.px) < (a.w + b.w) / 2 + gap && Math.abs(a.py - b.py) < (a.h + b.h) / 2 + gap;
const noOverlap = (L: PlaceLabel[], gap: number) => {
  const S = L.filter(l => l.shown);
  for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) assert.ok(!overlap(S[i]!, S[j]!, gap - 1e-9), `${String(S[i]!.key)} and ${String(S[j]!.key)} overlap`);
};
/** a seeded random (the same crowd each run) */
const rnd = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
/** a crowd of n labels round a few spots (a town centre's shop fronts), mixed priorities and sizes */
function crowd(n: number, seed = 7): PlaceLabel[] {
  const r = rnd(seed), spots = [[400, 300], [800, 500], [820, 520], [1200, 700], [300, 800]] as const;
  return Array.from({ length: n }, (_, i) => {
    const [sx, sy] = spots[i % spots.length]!, pri = [PRI.name, PRI.count, PRI.standIn, PRI.standIn, PRI.marker][i % 5]!;
    return lab(i, pri, sx + (r() - 0.5) * 300, sy + (r() - 0.5) * 120, 60 + r() * 140, 14 + r() * 6);
  });
}

test('no two placed labels overlap (a crowd of 300 round five shop fronts), and the ones that fit stay on their anchors', () => {
  const P = new LabelPlacer(), L = crowd(300);
  const shown = place(P, L);
  noOverlap(L, P.gap);
  assert.equal(shown, L.filter(l => l.shown).length);
  // the names first: a larger share of them shown than of the stand-ins
  const share = (pri: number) => L.filter(l => l.pri === pri && l.shown).length / L.filter(l => l.pri === pri).length;
  assert.ok(shown >= 60 && share(PRI.name) > share(PRI.standIn), `${shown} of 300 shown; names ${share(PRI.name).toFixed(2)}, stand-ins ${share(PRI.standIn).toFixed(2)}`);
  for (const l of L) if (l.shown) { assert.equal(l.px, l.x, 'only moved up or down'); assert.ok(Math.abs(l.py - l.y) <= P.reach * l.h + 1e-9, 'within the radius'); }
  // still none overlap a few frames on (the kept slots and the labels coming home)
  for (let f = 0; f < 30; f++) place(P, L);
  noOverlap(L, P.gap);
});

test('priority: the business\'s own name keeps its anchor and the stand-in moves just above it; a stand-in never pushes a real name', () => {
  const P = new LabelPlacer();
  // the stand-in comes first (as drawn before), the name second: the name still takes the anchor
  const si = lab('si', PRI.standIn, 500, 400, 160, 17), name = lab('name', PRI.name, 500, 404, 180, 18);
  place(P, [si, name]);
  assert.ok(name.shown && name.px === 500 && name.py === 404, 'the name on its anchor');
  assert.ok(si.shown && si.py < name.py, 'the stand-in above it');
  assert.equal(si.py + si.h / 2, name.py - name.h / 2 - P.gap, 'just above, the gap between');
  // a count beats a stand-in too, and a hint at the cursor beats a name
  const hint = lab('hint', PRI.hint, 500, 404, 100, 16); place(P, [si, name, hint]);
  assert.ok(hint.shown && hint.py === 404 && name.py !== 404, 'the hint on the anchor, the name moved');
  noOverlap([si, name, hint], P.gap);
});

test('the nearest free slot: above first, below when above is taken, the nearer of the two otherwise', () => {
  const P = new LabelPlacer();
  const a = lab('a', PRI.name, 500, 400), above = lab('above', PRI.name, 500, 382), b = lab('b', PRI.standIn, 500, 400);
  place(P, [a, above, b]);
  assert.ok(b.shown && b.py > a.py, 'below: the slot above is taken');
  assert.equal(b.py - b.h / 2, a.py + a.h / 2 + P.gap);
  // a blocker hanging low under the anchor: above is nearer
  const P2 = new LabelPlacer(), c = lab('c', PRI.name, 500, 410), d = lab('d', PRI.standIn, 500, 400);
  place(P2, [c, d]);
  assert.ok(d.shown && d.py < 400 && d.py === c.py - c.h / 2 - P2.gap - d.h / 2);
});

test('hidden when crowded (no free slot within the radius), shown again when there is room', () => {
  const P = new LabelPlacer();
  // seven labels on one spot: the anchor, three above and three below at most within 3 heights; the radius leaves room for fewer
  const L = Array.from({ length: 7 }, (_, i) => lab(`s${i}`, PRI.standIn, 500, 400));
  place(P, L);
  const hidden = L.filter(l => !l.shown);
  assert.ok(hidden.length >= 1 && hidden.length <= 4, `${hidden.length} hidden`);
  noOverlap(L, P.gap);
  // zoomed in: the spots spread apart; every label is shown again
  L.forEach((l, i) => { l.x = 100 + i * 200; });
  place(P, L);
  assert.ok(L.every(l => l.shown), 'all back');
  // the ones that were moved keep their slot a moment (no jump), then go home
  for (let f = 0; f < P.homeFrames; f++) place(P, L);
  assert.ok(L.every(l => l.py === l.y), 'each on its anchor');
});

test('stable: a small camera move keeps every label in its slot and the same ones shown (in any input order)', () => {
  const P = new LabelPlacer(), L = crowd(150, 3);
  place(P, L);
  const before = new Map(L.map(l => [l.key, { dy: l.py - l.y, shown: l.shown }]));
  // the camera pans 7 px right and 4 up; the props' query comes back in another order
  const M = L.map(l => ({ ...l, x: l.x + 7, y: l.y - 4 })).reverse();
  place(P, M);
  for (const l of M) {
    const b = before.get(l.key)!;
    assert.equal(l.shown, b.shown, `label ${String(l.key)} shown the same`);
    if (l.shown) assert.ok(Math.abs(l.py - l.y - b.dy) < 1e-9, `label ${String(l.key)} kept its slot`);
  }
});

test('two equals on one spot never swap: the one shown keeps it whatever order they come in', () => {
  const P = new LabelPlacer(), a = lab('a', PRI.standIn, 500, 400, 200, 16), b = lab('b', PRI.standIn, 500, 400, 200, 16);
  P.reach = 0.5; // no room above or below: one of them shows
  place(P, [a, b]); assert.ok(a.shown && !b.shown);
  for (let f = 0; f < 5; f++) { place(P, f % 2 ? [a, b] : [b, a]); assert.ok(a.shown && !b.shown, `frame ${f}`); }
});

test('a label keeps its moved slot while it stays free, and goes home once its anchor has been free a while', () => {
  const P = new LabelPlacer(), name = lab('name', PRI.name, 500, 400), si = lab('si', PRI.standIn, 500, 400);
  place(P, [name, si]);
  const slot = si.py; assert.ok(slot < 400);
  // the name goes (hidden by its own zoom tier): the stand-in stays where it was for a while, then comes home
  for (let f = 1; f < P.homeFrames; f++) { place(P, [si]); assert.equal(si.py, slot, `frame ${f}: kept`); }
  place(P, [si]); assert.equal(si.py, 400, 'home');
  // the slot taken by a new higher label: it moves at once (never overlapping)
  place(P, [name, si]); const s2 = si.py; assert.ok(s2 !== 400);
  const blocker = lab('blocker', PRI.name, 500, s2); place(P, [name, blocker, si]);
  assert.ok(!si.shown || Math.abs(si.py - s2) > 1, 'moved off the taken slot'); noOverlap([name, blocker, si], P.gap);
});

test('a label wholly outside the view is not placed and takes no room', () => {
  const P = new LabelPlacer(), off = lab('off', PRI.name, -500, 400), on = lab('on', PRI.standIn, 10, 400);
  place(P, [off, on]);
  assert.ok(!off.shown && on.shown && on.py === 400);
});

test('cheap: 100 labels on screen are placed in well under a tenth of a millisecond a frame', () => {
  const P = new LabelPlacer(), L = crowd(100, 11), N = 2000;
  for (let f = 0; f < 200; f++) place(P, L); // warm
  const t0 = performance.now();
  for (let f = 0; f < N; f++) { const d = (f % 20) - 10; for (const l of L) l.x += d * 0.05; place(P, L); }
  const ms = (performance.now() - t0) / N;
  console.log(`label-place: 100 labels in ${(ms * 1000).toFixed(1)} µs a frame (${L.filter(l => l.shown).length} shown)`);
  assert.ok(ms < 0.1, `${ms.toFixed(4)} ms a frame`);
  noOverlap(L, P.gap);
});

test('the money columns: clear of the labels, a column climbs just above the label in its way and keeps that lift; forgotten when gone', () => {
  const P = new LabelPlacer(), C = new ColumnPlacer(), name = lab('name', PRI.name, 500, 300, 200, 18);
  place(P, [name]); C.begin();
  // a column over (10, 20) whose whole rise is x 470..530, y 200..380: the name plate is in its way
  const d = C.lift(P, 10, 20, 470, 200, 530, 380, 400);
  assert.equal(380 + d, name.py - name.h / 2 - P.gap, 'its foot just above the plate');
  // a column with nothing in its way stays at its point
  assert.equal(C.lift(P, 50, 60, 900, 200, 960, 380, 400), 0);
  // the next frame, the same column: the same lift (even if the plate moved away, it does not jump)
  place(P, []); C.begin();
  assert.equal(C.lift(P, 10, 20, 470, 200, 530, 380, 400), d);
  // gone a frame: forgotten, so a new column at the point starts at its point
  C.begin(); C.begin();
  assert.equal(C.lift(P, 10, 20, 470, 200, 530, 380, 400), 0);
  // past the max lift: it stays at its point
  place(P, [name]); C.begin();
  assert.equal(C.lift(P, 70, 80, 470, 200, 530, 380, 50), 0);
});

// ---- the engine's side: the frame's labels (world-labels.ts) and the money floats after them (moneyfloats.ts) ----
/** a 2D context stand-in that records the writes (text, x, y) and the font changes; text is 7 px a character */
function recCtx() {
  const fills: { t: string; x: number; y: number }[] = [], plates: number[][] = []; let fonts = 0;
  const ctx = {
    save() {}, restore() {}, setTransform() {}, beginPath() {}, fill() {}, strokeText() {},
    roundRect: (x: number, y: number, w: number, h: number) => plates.push([x, y, w, h]),
    fillText: (t: string, x: number, y: number) => fills.push({ t, x, y }),
    measureText: (t: string) => ({ width: t.length * 7 }),
    set font(_: string) { fonts++; }, get font() { return ''; },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fills, plates, fonts: () => fonts };
}

test('the frame\'s labels: the range\'s name plate keeps its anchor, the stand-in pills give way, every word written once where it was placed', () => {
  const r = recCtx(), L = new WorldLabels(), font = 'bold 11px x', pf = '600 11px x';
  for (let frame = 0; frame < 3; frame++) {
    L.begin(r.ctx, 1);
    // the stand-ins come first (as the overlay collects them), the name and the count after
    L.pill('si-dispenser', PRI.standIn, 'Stand In for Ball dispenser', 500, 400, pf, 180, 17, '#000', 8, '#fff');
    L.pill('si-kiosk', PRI.standIn, 'Stand In for Coffee kiosk', 520, 396, pf, 170, 17, '#000', 8, '#fff');
    const name = L.text('range', PRI.name, 'DRIVING RANGE · 36 BAYS', 505, 402, font, 11, '#fff', LABEL_OUTLINE, 3);
    name.bg = '#000'; name.w = name.w1 + 12; name.h = 18;
    L.text('park', PRI.count, 'P · 70/180', 560, 404, font, 12, '#fff', LABEL_OUTLINE, 3);
    assert.equal(L.n, 4);
    L.place(1600, 1000); r.fills.length = 0; L.draw(r.ctx);
    const at = (t: string) => r.fills.find(f => f.t === t);
    assert.deepEqual(at('DRIVING RANGE · 36 BAYS'), { t: 'DRIVING RANGE · 36 BAYS', x: 505, y: 402 }, 'the name on its anchor');
    noOverlap(L.list.slice(0, L.n), L.placer.gap);
    for (const l of L.list.slice(0, L.n)) assert.equal(r.fills.filter(f => f.t === l.text).length, l.shown ? 1 : 0, `${l.text} written once if shown`);
  }
  // the pool: the same objects next frame, nothing left over from the last
  const first = L.list[0]; L.begin(r.ctx, 1); const a = L.add('k', 1, 0, 0, 10, 10);
  assert.ok(a === first && a.text === '' && a.bg === '' && a.alpha === 1);
});

test('the money floats over a placed label: their column climbs above it as one; with nothing in the way they stay where T147 put them', () => {
  const now = 0.5, zoom = 0.3, ze = zoom, dpr = 1;
  const fl = new MoneyFloats(); fl.frame(0);
  fl.add({ x: 100, y: 100, amount: 8, kind: 'in' }, 0, zoom); fl.add({ x: 100, y: 100, amount: 30, kind: 'in' }, 0, zoom);
  assert.equal(fl.live.length, 2); assert.ok(fl.live[1]!.x === 100 && fl.live[1]!.lift > 0, 'one column, two lines');
  const screen = (x: number, y: number) => ({ x: x * 5, y: y * 5 });
  const ys = (avoid?: Parameters<typeof drawMoneyFloats>[8]) => {
    const r = recCtx(); drawMoneyFloats(r.ctx, fl.live, now, screen, ze, dpr, 1600, 1000, avoid); return r.fills.map(f => f.y);
  };
  const plain = ys();
  // no label: the same as without avoid
  const P = new LabelPlacer(), C = new ColumnPlacer(); P.place([], 0, 0, 0, 1600, 1000); C.begin();
  assert.deepEqual(ys({ placer: P, cols: C }), plain);
  // a name plate 40 px over the point: both floats above it, a line apart as before
  const plate = lab('name', PRI.name, 500, 460, 200, 18); P.place([plate], 1, 0, 0, 1600, 1000); C.begin();
  const lifted = ys({ placer: P, cols: C });
  assert.ok(lifted.every(y => y < plate.py - plate.h / 2), `${lifted} above the plate's top ${plate.py - plate.h / 2}`);
  assert.ok(Math.abs((lifted[0]! - lifted[1]!) - (plain[0]! - plain[1]!)) < 1e-9, 'the column kept its lines');
});

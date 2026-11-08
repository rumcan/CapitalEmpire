// T359 (#1006), part 3 (the owner, 2026-11-08: "I see no way to edit the mowing lines over the fairway. they used to be editable."): a look's own
// mowing lines (src/game/mow-lines.ts): on or off, the pattern (along the hole, straight, checkerboard, diamond), the band width, how light and
// dark, the angle. Held to their ranges, saved with the look (the Course default's in the browser, each hole's in the game save) and loaded again;
// laid over the course finish's own lines (course-finish.ts mowSpec) with the texture made lighter or darker, never a wash; carried to the chunks
// per hole; a look with none lays the course exactly as before. Pure, Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOW_KINDS, MOW_PATTERNS, clampMow, mowAnyOn, mowOfHole, mowRecOf, patternOf, sameMow, type MowTable } from '../src/game/mow-lines';
import { BAND_DARK, BAND_LIGHT, DEFAULT_COURSE_FINISH, GREEN_DARK, GREEN_LIGHT, finishStripeLook, greenStripeLook, mowShown, mowSpec } from '../src/game/course-finish';
import { fairwayStripeLook, holeStripeLegs, turnStripeLegs } from '../src/game/course-stripes';
import { clampStyle, DEFAULT_STYLE, BRUSH_PRESETS } from '../src/game/paint';
import { lookChanged } from '../src/game/course-look';
import { normalizeBook } from '../src/game/golf/looks';
import { SURF, fillPolygon, makeGrid, type Grid } from '../src/game/ext/course-grid';
import { coursePatch, stripeAreas, type CourseLooks } from '../src/game/ext/course-grid/patch';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';
import type { LookBook } from '../src/game/golf/looks';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import type { Game } from '../src/game/engine';
import { SurfaceSwatches } from '../src/ui/course/BrushControls';

const FIN = DEFAULT_COURSE_FINISH, BASE = fairwayStripeLook();
const fw = (book: LookBook, o: string) => book[o]?.fairway; // (read through a function: assert.equal narrows an indexed read to its asserted type)
const box = (g: Grid, x0: number, y0: number, x1: number, y1: number, s: number, h: number) => fillPolygon(g, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], s, h, 0);

test('mowing lines are held to their ranges; a bad or empty setting is left out (the finish\'s own)', () => {
  assert.equal(clampMow(undefined), undefined); assert.equal(clampMow({}), undefined); assert.equal(clampMow([]), undefined); assert.equal(clampMow('x'), undefined);
  assert.equal(clampMow({ pattern: 'wavy', width: NaN, light: 'a' }), undefined, 'nothing valid in it');
  assert.deepEqual(clampMow({ on: false }), { on: false });
  assert.deepEqual(clampMow({ on: true, pattern: 'check', width: 99, light: 2, dark: -1, angle: 200, extra: 5 }), { on: true, pattern: 'check', width: 16, light: 1, dark: 0, angle: 90 });
  assert.deepEqual(clampMow({ width: 0.1, angle: -200 }), { width: 0.5, angle: -90 });
  assert.deepEqual(clampMow({ width: 3.1, light: 0.123, angle: 12.4 }), { width: 3, light: 0.12, angle: 12 }, 'rounded to a quarter tile, a percent, a degree');
  assert.deepEqual(MOW_PATTERNS.map(p => p.id), ['along', 'straight', 'check', 'diamond']);
  assert.deepEqual([...MOW_KINDS], ['fairway', 'green', 'tee', 'rough']);
});

test('the worker\'s form: every field that is set, none that is not; a pattern by index', () => {
  assert.equal(mowRecOf(undefined), undefined);
  assert.deepEqual(mowRecOf({ on: false }), { on: 0 });
  assert.deepEqual(mowRecOf({ on: true, pattern: 'diamond', width: 2, light: 0.4, dark: 0.9, angle: -30 }), { on: 1, p: 3, w: 2, l: 0.4, k: 0.9, a: -30 });
  assert.deepEqual(mowRecOf({ pattern: 'along' }), undefined, 'along the hole is the default: nothing to carry');
  assert.equal(patternOf({ p: 2 }), 'check'); assert.equal(patternOf(undefined), 'along'); assert.equal(patternOf({ p: 9 }), 'along');
  const t: MowTable = { base: { w: 2 }, hole: [undefined, { on: 0 }, {}] };
  assert.deepEqual(mowOfHole(t, 1), { on: 0 }); assert.deepEqual(mowOfHole(t, 2), {}); assert.deepEqual(mowOfHole(t, 5), { w: 2 }, 'a hole with no entry wears the base'); assert.equal(mowOfHole(undefined, 1), undefined);
  assert.equal(mowAnyOn(t), false); assert.equal(mowAnyOn({ hole: [undefined, { on: 1 }] }), true); assert.equal(mowAnyOn({ base: { on: 1 } }), true);
});

test('the course finish\'s own lines: a look with none changes nothing; the fairway\'s bands and the green\'s stripes are on, the tee\'s and the rough\'s off', () => {
  const fl = finishStripeLook(FIN, BASE)!, gl = greenStripeLook(FIN, BASE)!;
  const fair = mowSpec('fairway', undefined, FIN, BASE)!;
  assert.deepEqual(fair.look, fl); assert.equal(fair.textured, true); assert.equal(fair.pattern, 'along'); assert.equal(fair.angle, 0);
  const green = mowSpec('green', undefined, FIN, BASE)!;
  assert.deepEqual(green.look, gl); assert.equal(green.textured, true);
  assert.equal(mowSpec('tee', undefined, FIN, BASE), null, 'the tee wears the fairway\'s grass with no lines (2026-10-29)');
  assert.equal(mowSpec('rough', undefined, FIN, BASE), null);
  // the finish off (T218's look): the fairway still has its lines, untextured; the green none
  const off = { ...FIN, on: false };
  const t218 = mowSpec('fairway', undefined, off, BASE)!; assert.deepEqual(t218.look, BASE); assert.equal(t218.textured, false);
  assert.equal(mowSpec('green', undefined, off, BASE), null);
  // only on / off set: the look stays the finish's
  assert.equal(mowSpec('fairway', { on: 0 }, FIN, BASE), null); assert.deepEqual(mowSpec('fairway', { on: 1 }, FIN, BASE)!.look, fl);
  assert.equal(mowSpec('green', { on: 0 }, FIN, BASE), null);
  assert.deepEqual(mowSpec('tee', { on: 1 }, FIN, BASE)!.look, fl, 'a tee turned on lays the fairway\'s bands');
  assert.deepEqual(mowSpec('rough', { on: 1 }, FIN, BASE)!.look, fl);
  assert.deepEqual(mowSpec('green', { on: 1 }, { ...FIN, greenStrength: 0 }, BASE)!.look, greenStripeLook(FIN, BASE), 'a green turned on with the finish\'s strength 0: the tuned stripes');
});

test('the numbers: the band width, and the light and dark strengths in the finish\'s terms (the texture lighter or darker: a lift and a multiply, no tint)', () => {
  const s = mowSpec('fairway', { w: 5, l: 0.5, k: 1 }, FIN, BASE)!;
  assert.equal(s.look.w, 5); assert.equal(s.look.l, BAND_LIGHT * 0.5); assert.equal(s.look.k, BAND_DARK * 1);
  assert.equal(s.look.t, 0, 'no flat tint over the texture'); assert.equal(s.textured, true);
  const g = mowSpec('green', { l: 1, k: 0.5, w: 1 }, FIN, BASE)!;
  assert.equal(g.look.l, GREEN_LIGHT); assert.equal(g.look.k, GREEN_DARK * 0.5); assert.equal(g.look.w, 1);
  // numbers set with the Studio's finish off lay the finish's tuned look, textured (T218's numbers are alphas, not these)
  const off = mowSpec('fairway', { w: 5 }, { ...FIN, on: false }, BASE)!; assert.equal(off.textured, true); assert.equal(off.look.w, 5);
  // a strength of 0 is no lift, no multiply: the layer lays nothing
  const none = mowSpec('fairway', { l: 0, k: 0 }, FIN, BASE)!; assert.equal(none.look.l, 0); assert.equal(none.look.k, 0);
});

test('the patterns: along the hole follows its line; straight is one direction at the angle; a checkerboard crosses a second family; a diamond is turned a quarter', () => {
  assert.equal(mowSpec('fairway', { p: 1, a: 30 }, FIN, BASE)!.angle, 30);
  const c = mowSpec('fairway', { p: 2, a: 10 }, FIN, BASE)!; assert.equal(c.look.check, true); assert.equal(c.angle, 10);
  const d = mowSpec('fairway', { p: 3, a: 10 }, FIN, BASE)!; assert.equal(d.look.check, true); assert.equal(d.angle, 55, 'a quarter turn on the angle');
  assert.equal(mowSpec('fairway', { p: 1 }, FIN, BASE)!.look.check, undefined);
  // the legs: along follows a dogleg (two legs); the others are one direction over the whole hole, from the tee
  const line = [0, 0, 100, 0, 100, 80];
  assert.equal(holeStripeLegs(line, mowSpec('fairway', undefined, FIN, BASE)!.look).length, 2);
  const straight = mowSpec('fairway', { p: 1, a: 20 }, FIN, BASE)!, legs = holeStripeLegs(line, straight.look, straight.angle);
  assert.equal(legs.length, 1); assert.ok(Math.abs(legs[0]!.m.ux + Math.sin(20 * Math.PI / 180)) < 1e-9);
  assert.equal(holeStripeLegs(line, straight.look, straight.angle)[0]!.m.c, undefined, 'plain bands carry no second family');
  // a checkerboard follows the hole's line (its squares across it, a leg of its own each side of a bend), turned by the angle; a diamond a quarter more
  const follow = (sp: NonNullable<ReturnType<typeof mowSpec>>) => turnStripeLegs(holeStripeLegs(line, { ...sp.look, across: true }), sp.angle);
  const cl = follow(c), dl = follow(d), r = (deg: number) => (deg * Math.PI) / 180;
  assert.equal(cl.length, 2); assert.equal(cl[0]!.m.c, 1, 'the second family rides on the stripe set'); assert.equal(dl[1]!.m.c, 1);
  assert.ok(Math.abs(cl[0]!.m.ux - Math.cos(r(10))) < 1e-9 && Math.abs(cl[0]!.m.uy - Math.sin(r(10))) < 1e-9, 'leg 1 runs east: turned 10 degrees');
  assert.ok(Math.abs(dl[0]!.m.ux - Math.cos(r(55))) < 1e-9 && Math.abs(dl[0]!.m.uy - Math.sin(r(55))) < 1e-9, 'a diamond: 55');
  assert.ok(Math.abs(cl[1]!.m.ux - Math.cos(r(90 + 10))) < 1e-9, 'leg 2 runs south: its own turn');
  assert.deepEqual(cl[1]!.cut, holeStripeLegs(line, { ...c.look, across: true })[1]!.cut, "the bend's cut stays where the bend puts it");
  assert.equal(turnStripeLegs(holeStripeLegs(line, { ...c.look, across: true }), 0)[0]!.m.ux, 1, 'no turn: the legs as they are');
});

test('what the panel reads: every field with the value it lays, the finish\'s where the look sets none', () => {
  const v = mowShown('fairway', undefined, FIN);
  assert.deepEqual(v, { on: true, pattern: 'along', width: FIN.bandWidth, light: FIN.bandStrength, dark: FIN.bandStrength, angle: 0 });
  const g = mowShown('green', undefined, FIN); assert.deepEqual([g.on, g.width, g.light], [true, FIN.greenWidth, FIN.greenStrength]);
  assert.equal(mowShown('tee', undefined, FIN).on, false); assert.equal(mowShown('rough', undefined, FIN).on, false);
  assert.deepEqual(mowShown('fairway', { on: false, pattern: 'check', width: 2, light: 0.1, dark: 0.2, angle: 15 }, FIN), { on: false, pattern: 'check', width: 2, light: 0.1, dark: 0.2, angle: 15 });
  assert.equal(mowShown('green', undefined, { ...FIN, greenStrength: 0 }).on, false, 'a finish with no green stripes: the green is plain');
});

test('saved and loaded: a look keeps its mowing lines through clampStyle, the game save\'s looks book and the browser\'s brush presets', () => {
  const st = clampStyle({ ...DEFAULT_STYLE, mow: { on: true, pattern: 'diamond', width: 2.5, light: 0.3, dark: 0.7, angle: 20 } });
  assert.deepEqual(st.mow, { on: true, pattern: 'diamond', width: 2.5, light: 0.3, dark: 0.7, angle: 20 });
  assert.equal(clampStyle({ ...DEFAULT_STYLE, mow: { pattern: 'zigzag' } as never }).mow, undefined, 'a bad pattern is dropped');
  assert.ok(!('mow' in clampStyle({ ...DEFAULT_STYLE })), 'a look with none carries none: exactly as before');
  // the game save's book (JSON through the save, normalizeBook on load)
  const book: LookBook = { h3: { fairway: { ...BRUSH_PRESETS.find(b => b.kind === 'fairway')!.style, mow: { pattern: 'check', width: 4 } } } };
  const back = normalizeBook(JSON.parse(JSON.stringify(book)))!;
  assert.deepEqual(back['h3']?.fairway?.mow, { pattern: 'check', width: 4 });
  // a change of mowing lines alone is a change of look (the course is drawn again), by value
  const a = BRUSH_PRESETS.find(b => b.kind === 'fairway')!.style;
  assert.equal(lookChanged({ ...a, mow: { width: 3 } }, { ...a, mow: { width: 3 } }), false); assert.equal(lookChanged({ ...a, mow: { width: 3 } }, { ...a, mow: { width: 4 } }), true); assert.equal(lookChanged(a, { ...a, mow: { on: false } }), true);
  assert.equal(sameMow({ width: 3 }, { width: 3 }), true); assert.equal(sameMow(undefined, { on: true }), false);
});

test('the Paint tool: the Course default\'s mowing lines are written to the browser and read back; a hole\'s are in the book; Apply to all holes copies them', () => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); }, clear: () => store.clear(), key: () => null, length: 0 };
  try {
    const g = makeGrid(0, 0, 160, 160), book: LookBook = {};
    const host: PaintHost = { setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [], golfMode: () => true, grid: () => g, lookBook: () => book, courseLook() {}, lookChanged() {} };
    const p = new PaintTool(host); p.enterCourse();
    p.setLookDefault(true); p.setStyle({ mow: { pattern: 'straight', angle: 40, width: 2 } });
    assert.deepEqual(p.brush.fairway.style.mow, { pattern: 'straight', angle: 40, width: 2 });
    const again = new PaintTool(host); // a new session in the same browser
    assert.deepEqual(again.brush.fairway.style.mow, { pattern: 'straight', angle: 40, width: 2 }, 'read back from the browser');
    again.enterCourse(); again.setLookDefault(false); again.setHole(2); again.setStyle({ mow: { on: false } });
    assert.deepEqual(book['h2']?.fairway?.mow, { on: false }, 'this hole\'s own');
    assert.deepEqual(again.brush.fairway.style.mow, { pattern: 'straight', angle: 40, width: 2 }, 'the Course default untouched');
    book['h1'] = { fairway: { ...again.lookOf('default', 'fairway') } };
    const holes = again.applyLookToAll('fairway');
    assert.deepEqual(holes, [1, 2]); assert.deepEqual(fw(book, 'h1')?.mow, { on: false }, 'the look in hand, mowing lines and all, goes to every hole');
    again.undoTop();
    assert.equal(fw(book, 'h2')?.mow?.on, false);
    assert.deepEqual(fw(book, 'h1')?.mow, { pattern: 'straight', angle: 40, width: 2 }, 'one undo takes Apply to all holes back: hole 1 wears its own look again');
    assert.deepEqual(again.brush.fairway.style.mow, { pattern: 'straight', angle: 40, width: 2 }, 'and the Course default its');
    // a new hole starts from the Course default's lines (its looks are seeded from the default at its first paint)
    again.setLookDefault(true, false); again.seedLooks('h7');
    assert.deepEqual(fw(book, 'h7')?.mow, { pattern: 'straight', angle: 40, width: 2 }, "a new hole wears the Course default's mowing lines");
    again.setLookDefault(false, false);
    // Reset: none again
    again.setStyle({ mow: undefined }); assert.ok(!('mow' in again.style), 'back to the finish\'s own');
  } finally { delete (globalThis as unknown as { localStorage?: Storage }).localStorage; }
});

const LOOKS: CourseLooks = {
  surf: [undefined, { tex: 'golfRough', sc: 1, a: 0 }, { tex: 'golfFescue', sc: 1, a: 0 }, { tex: 'waterDark', sc: 1, a: 0 }, { tex: 'golfFairway', sc: 1, a: 0 }, { tex: 'golfTee', sc: 1, a: 0 }, { tex: 'bunkerSand', sc: 1, a: 0 }, { tex: 'wasteSand', sc: 1, a: 0 }, { tex: 'golfGreen', sc: 1, a: 0 }, { tex: 'golfLongGrass', sc: 1, a: 0 }],
  collar: { 'first-cut': { tex: 'golfFirstCut', sc: 1, a: 0 }, fringe: { tex: 'golfFringe', sc: 1, a: 0 }, lip: { tex: 'golfRough', sc: 1, a: 0 }, bank: { tex: 'rockyDirt', sc: 1, a: 0 } },
};

test('the chunks carry each hole\'s own lines: its record on its entry; none where no look sets any (the patch is as before)', () => {
  const g = makeGrid(0, 0, 300, 300);
  box(g, 5, 5, 30, 20, SURF.fairway, 3); box(g, 34, 5, 60, 20, SURF.fairway, 5);
  const lines = new Map([[3, [5, 12, 30, 12]], [5, [34, 12, 60, 12]]]);
  const mow: MowTable = { base: { w: 2 }, hole: [undefined, undefined, undefined, { on: 0 }] };
  const st = stripeAreas(g, 0, 0, lines, SURF.fairway, undefined, mow)!;
  assert.deepEqual(st.map(e => [e.hole, e.m]), [[3, { on: 0 }], [5, { w: 2 }]], 'hole 3 its own, hole 5 the Course default\'s');
  // none set: no record on any entry, exactly the entries before
  assert.deepEqual(stripeAreas(g, 0, 0, lines)!.map(e => 'm' in e), [false, false]);
  // through coursePatch: the table by surface id, the fairway's entries carry it
  const p = coursePatch(g, 0, 0, { ...LOOKS, mow: [] }, 0, lines)!;
  assert.deepEqual(p.course!.layers.find(l => l.s === SURF.fairway)!.stripes!.map(e => 'm' in e), [false, false]);
  const mows: (MowTable | undefined)[] = []; mows[SURF.fairway] = mow;
  const q = coursePatch(g, 0, 0, { ...LOOKS, mow: mows }, 0, lines)!;
  assert.deepEqual(q.course!.layers.find(l => l.s === SURF.fairway)!.stripes!.map(e => e.m), [{ on: 0 }, { w: 2 }]);
});

test('a tee and a rough lay lines only where a look turns them on', () => {
  const g = makeGrid(0, 0, 300, 300);
  box(g, 5, 5, 30, 20, SURF.fairway, 3); box(g, 5, 22, 12, 28, SURF.tee, 3); box(g, 40, 30, 60, 45, SURF.rough, 0);
  const lines = new Map([[3, [5, 12, 30, 12]]]);
  const layer = (looks: CourseLooks, s: number) => coursePatch(g, 0, 0, looks, 0, lines)!.course!.layers.find(l => l.s === s);
  assert.equal(layer(LOOKS, SURF.tee)?.stripes, undefined, 'no look sets them: a tee has none'); assert.equal(layer(LOOKS, SURF.rough)?.stripes, undefined);
  const mow: (MowTable | undefined)[] = []; mow[SURF.tee] = { hole: [undefined, undefined, undefined, { on: 1 }] }; mow[SURF.rough] = { base: { on: 1, w: 2 } };
  const looks = { ...LOOKS, mow };
  assert.deepEqual(layer(looks, SURF.tee)?.stripes?.map(e => [e.hole, e.m]), [[3, { on: 1 }]], 'hole 3\'s tee turned on');
  assert.deepEqual(layer(looks, SURF.rough)?.stripes?.map(e => [e.hole, e.m]), [[0, { on: 1, w: 2 }]], 'the rough turned on by the Course default');
  const off: (MowTable | undefined)[] = []; off[SURF.tee] = { base: { on: 0 } };
  assert.equal(layer({ ...LOOKS, mow: off }, SURF.tee)?.stripes, undefined, 'turned off: still none');
});

test('the Mowing lines section is in the panel of the fairway, the green, the tee and the rough; not the bunker, the water or the waste area', () => {
  const g = makeGrid(0, 0, 160, 160), book: LookBook = {};
  const host: PaintHost = { setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [], golfMode: () => true, grid: () => g, lookBook: () => book, grasses: () => [], setGrasses() {}, courseLook() {}, lookChanged() {} };
  const p = new PaintTool(host); p.enterCourse();
  const game = { paint: p, golfMode: true, courseGrid: g, toolUi: () => null, emit() {} } as unknown as Game;
  const panel = () => renderToStaticMarkup(createElement(SurfaceSwatches, { game, on: p.brushKind, pick: () => {} }));
  for (const kind of MOW_KINDS) {
    p.openSurface(kind);
    // (the tee and the rough are mown plain by default: On and Off only, the rest once a look turns them on)
    if (kind === 'tee' || kind === 'rough') p.setStyle({ mow: { on: true } });
    const html = panel();
    assert.match(html, new RegExp(`data-mowing="${kind}"`), `${kind}: Mowing lines`);
    for (const w of ['Mowing lines', 'Along the hole', 'Straight', 'Checkerboard', 'Diamond', 'Band width', 'Contrast', 'Light', 'Dark', 'Angle']) assert.ok(html.includes(w), `${kind}: ${w}`);
    if (kind === 'tee' || kind === 'rough') p.undoTop(); // (and off again)
  }
  p.openSurface('fairway');
  assert.match(panel(), /data-mow-on="on"[^>]*data-mow-pattern="along"/, 'the fairway: on, along the hole');
  p.openSurface('tee'); assert.match(panel(), /data-mow-on="off"/, 'the tee: off, mown plain');
  assert.doesNotMatch(panel(), /aria-label="Light bands"/, 'and no sliders while it is off');
  p.openSurface('fairway'); p.setStyle({ mow: { pattern: 'check', width: 2 } });
  const html = panel(); assert.match(html, /data-mow-pattern="check"/); assert.match(html, /data-testid="mow-width"[^>]*>4 m</, 'the band width in metres (2 tiles of 2 m)'); assert.match(html, /data-mow="reset"/);
  for (const kind of ['bunker', 'water', 'waste', 'longGrass'] as const) { p.openSurface(kind); assert.doesNotMatch(panel(), /data-mowing=/, `${kind}: no Mowing lines`); }
});

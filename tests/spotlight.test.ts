// J10 (#1269; the owner, 2026-11-14: "the show me button should show you whatever you need to see an cover the reset with a blur mast or somthing so it is CLEAR
// what you are showing"): the Show me spotlight's pure parts (src/ui/spotlight): the cut-out's box from a target's box, the clip path, where the caption stands
// (flipping at an edge, never covering a cut-out, never off the screen), the caption's line, the store, and that every step and tip that has a Show me names a
// target that resolves. Pure, Node (the built page's own look: docs/jam-shots/j10-*.jpg; its clicks: npm run jam:smoke).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARROW_EDGE, CAP_GAP, CAP_MARGIN, HOLE_MIN_H, HOLE_MIN_W, HOLE_PAD, SCREEN_INSET, firstLine, framePoints, holeOf, holePath, mergeHoles, near, placeCaption,
  spotHide, spotNow, spotShow, spotSubscribe, tilesAround, type Hole, type SpotRequest, type TileRect,
} from '../src/ui/spotlight/spot';
import { checkSpot, guideSpot, hintSpot, prepSpot, showCheck, showGuide, showHint, showMe, showPrep, showTip, showTour, tipSpot, tourSpot, type SpotGame, type SpotHost } from '../src/ui/spotlight/shows';
import { JAM_TOUR, TOWN_TOUR, tourShowOf } from '../src/game/ext/progressive-ui/tour';
import { RANGE_GUIDE } from '../src/game/ext/progressive-ui/guide';
import { JAM_TIPS } from '../src/ui/jam/tips';
import { RAIL, jamRail } from '../src/ui/rail-items';
import { RANGE_UPGRADES } from '../src/game/golf/rangesave';

const S = { w: 1920, h: 1080 };
const hole = (x: number, y: number, w: number, h: number, r = 10): Hole => ({ x, y, w, h, r });

test('holeOf: padded on every side, rounded like the target, never smaller than the least', () => {
  const h = holeOf({ x: 100, y: 200, w: 80, h: 60 }, { screen: S, radius: 12 })!;
  assert.deepEqual([h.x, h.y, h.w, h.h], [100 - HOLE_PAD, 200 - HOLE_PAD, 80 + 2 * HOLE_PAD, 60 + 2 * HOLE_PAD]);
  assert.equal(h.r, 12 + HOLE_PAD);
  // a round target gets a round hole: the radius is capped at half the shorter side
  const c = holeOf({ x: 500, y: 500, w: 40, h: 40 }, { screen: S, radius: 9999 })!;
  assert.equal(c.r, c.w / 2); assert.equal(c.w, c.h);
  // a tiny target still shows, centred on itself
  const t = holeOf({ x: 800, y: 600, w: 4, h: 4 }, { screen: S })!;
  assert.ok(t.w >= HOLE_MIN_W && t.h >= HOLE_MIN_H);
  assert.ok(Math.abs(t.x + t.w / 2 - 802) < 0.01 && Math.abs(t.y + t.h / 2 - 602) < 0.01);
});

test('holeOf: held inside the window, null when the target is not on it', () => {
  const edge = holeOf({ x: 0, y: 90, w: 90, h: 60 }, { screen: S })!;
  assert.equal(edge.x, SCREEN_INSET);
  const right = holeOf({ x: S.w - 60, y: 400, w: 60, h: 60 }, { screen: S })!;
  assert.equal(right.x + right.w, S.w - SCREEN_INSET);
  const half = holeOf({ x: S.w - 20, y: 400, w: 200, h: 60 }, { screen: S })!; // half off the window: the part that is on it
  assert.ok(half.x + half.w <= S.w - SCREEN_INSET && half.w > 4);
  for (const t of [{ x: S.w + 50, y: 10, w: 40, h: 40 }, { x: -200, y: 10, w: 40, h: 40 }, { x: 10, y: S.h + 5, w: 10, h: 10 }]) assert.equal(holeOf(t, { screen: S }), null);
  for (const t of [{ x: 10, y: 10, w: 0, h: 20 }, { x: NaN, y: 10, w: 10, h: 10 }, { x: 10, y: 10, w: -5, h: 10 }]) assert.equal(holeOf(t, { screen: S }), null);
  assert.equal(holeOf({ x: 1, y: 1, w: 10, h: 10 }, { screen: { w: 0, h: 0 } }), null);
});

test('mergeHoles: holes that touch become one, the first stays first, far ones stay apart', () => {
  const a = hole(100, 100, 100, 60), b = hole(150, 120, 100, 60), far = hole(900, 700, 80, 50), near3 = hole(205, 100, 50, 60);
  const m = mergeHoles([a, b]);
  assert.equal(m.length, 1); assert.deepEqual([m[0]!.x, m[0]!.y, m[0]!.w, m[0]!.h], [100, 100, 150, 80]);
  assert.equal(mergeHoles([a, far]).length, 2); assert.equal(mergeHoles([far, a])[0]!.x, 900, 'the first hole stays first');
  assert.equal(mergeHoles([a, near3]).length, 1, 'a seam under 6 px would show as a line: one hole');
  assert.equal(mergeHoles([a, far, b]).length, 2, 'a chain through a third merges all it touches');
  assert.equal(mergeHoles([]).length, 0);
  assert.ok(m[0]!.r <= Math.min(m[0]!.w, m[0]!.h) / 2);
});

test('holePath: the window with one rounded cut-out per hole (even-odd)', () => {
  const p = holePath([hole(10, 20, 100, 50, 12), hole(300, 300, 60, 60, 30)], { w: 800, h: 600 });
  assert.match(p, /^path\(evenodd, "M0 0H800V600H0Z/);
  assert.equal((p.match(/M/g) ?? []).length, 3, 'the window and two holes');
  assert.equal((p.match(/A/g) ?? []).length, 8, 'four rounded corners each');
  assert.equal((p.match(/Z/g) ?? []).length, 3);
  assert.ok(p.endsWith('")'));
  assert.equal(holePath([], { w: 10, h: 10 }), 'path(evenodd, "M0 0H10V10H0Z")');
  // a square hole of radius half its side is a circle: its arcs meet
  assert.ok(holePath([hole(0, 0, 40, 40, 20)], { w: 100, h: 100 }).includes('A20 20 0 0 1'));
});

test('placeCaption: beside a tall target at the left edge it stands to the right, level with it, its arrow at the hole\'s middle', () => {
  const rail = holeOf({ x: 12, y: 230, w: 91, h: 64 }, { screen: S })!, cap = { w: 310, h: 120 };
  const p = placeCaption([rail], cap, S);
  assert.equal(p.side, 'right'); assert.equal(p.clear, true);
  assert.equal(p.x, rail.x + rail.w + CAP_GAP);
  assert.ok(Math.abs(p.y + cap.h / 2 - (rail.y + rail.h / 2)) < 0.01, 'level with the hole');
  assert.ok(Math.abs(p.arrow - cap.h / 2) < 0.01, 'the arrow at the middle of the edge');
});

test('placeCaption: near an edge it flips to the side that has room', () => {
  const cap = { w: 310, h: 120 };
  const right = holeOf({ x: S.w - 380, y: 90, w: 360, h: 700 }, { screen: S })!; // the Bank's panel against the right edge
  assert.equal(placeCaption([right], cap, S).side, 'left');
  const chip = holeOf({ x: 300, y: 18, w: 120, h: 50 }, { screen: S })!; // a wide, flat chip in the top bar: below it
  assert.equal(placeCaption([chip], cap, S).side, 'below');
  const bottom = holeOf({ x: 600, y: S.h - 70, w: 220, h: 50 }, { screen: S })!; // the same at the bottom: above it
  assert.equal(placeCaption([bottom], cap, S).side, 'above');
  const top = holeOf({ x: 12, y: 18, w: 70, h: 60 }, { screen: S })!; // a square target at the top left: to its right
  assert.equal(placeCaption([top], cap, S).side, 'right');
  // a caption that does not fit above (a tall one near the top) goes below
  assert.equal(placeCaption([holeOf({ x: 800, y: 120, w: 200, h: 50 }, { screen: S })!], { w: 310, h: 200 }, S).side, 'below');
});

test('placeCaption: never off the window, never over the first hole or any other, at any place and size (1920 x 1080 and 1366 x 768, the largest text)', () => {
  for (const scr of [S, { w: 1366, h: 768 }]) {
    for (const k of [1, 1.25]) { // Text size 100% and 125%
      const cap = { w: Math.round(310 * k), h: Math.round(130 * k) };
      for (let x = 0; x <= scr.w - 40; x += 97) for (let y = 0; y <= scr.h - 40; y += 83) for (const [w, h] of [[56, 40], [91, 64], [330, 90], [360, 600], [260, 260]] as const) {
        const hl = holeOf({ x, y, w, h }, { screen: scr }); if (!hl) continue;
        const p = placeCaption([hl], cap, scr), b = { x: p.x, y: p.y, w: cap.w, h: cap.h };
        const at = `${scr.w}x${scr.h} k${k} hole ${x},${y} ${w}x${h}`;
        assert.ok(b.x >= CAP_MARGIN - 0.01 && b.y >= CAP_MARGIN - 0.01 && b.x + b.w <= scr.w - CAP_MARGIN + 0.01 && b.y + b.h <= scr.h - CAP_MARGIN + 0.01, `off the window: ${at}`);
        if (p.clear) assert.ok(!near(b, hl), `covers the target: ${at}`);
        const len = p.side === 'right' || p.side === 'left' ? cap.h : cap.w;
        assert.ok(p.arrow >= Math.min(ARROW_EDGE, len / 2) - 0.01 && p.arrow <= len - Math.min(ARROW_EDGE, len / 2) + 0.01, `arrow off its edge: ${at}`);
      }
    }
  }
});

test('placeCaption: stays clear of a second cut-out; with no room anywhere it is held on the window', () => {
  const cap = { w: 310, h: 120 };
  const first = holeOf({ x: 100, y: 400, w: 90, h: 60 }, { screen: S })!, second = holeOf({ x: 300, y: 410, w: 200, h: 40 }, { screen: S })!;
  const alone = placeCaption([first], cap, S), p = placeCaption([first, second], cap, S);
  assert.equal(alone.side, 'right', 'on its own the caption would stand right of the first cut-out, on the second');
  assert.ok(p.clear && p.side !== 'right' && !near({ x: p.x, y: p.y, w: cap.w, h: cap.h }, second, 6), 'with a second cut-out there it stands where it covers neither');
  const all = holeOf({ x: 0, y: 0, w: S.w, h: S.h }, { screen: S })!; // a hole that is the whole window: no room, still on the window
  const q = placeCaption([all], cap, S);
  assert.equal(q.clear, false); assert.ok(q.x >= CAP_MARGIN && q.y >= CAP_MARGIN && q.x + cap.w <= S.w - CAP_MARGIN && q.y + cap.h <= S.h - CAP_MARGIN);
  assert.deepEqual(placeCaption([], cap, S).clear, true);
});

test('firstLine: the first sentence of a body, cut at a word when it runs long', () => {
  assert.equal(firstLine('Click your cash to open the Bank: borrow (see the total interest first) or save. Each month ends with a short statement.'), 'Click your cash to open the Bank: borrow (see the total interest first) or save.');
  assert.equal(firstLine('You have $75,000, a plot with plenty of room, and an old driving range on it for sale (junk and all). A range earns your first income.'), 'You have $75,000, a plot with plenty of room, and an old driving range on it for sale (junk and all).');
  assert.equal(firstLine('Hit balls stay out on the range. The range comes with a push picker.'), 'Hit balls stay out on the range.');
  assert.equal(firstLine('No full stop here'), 'No full stop here');
  assert.equal(firstLine('  spaced \n out   words.  '), 'spaced out words.');
  const long = firstLine('Range › Place the driving range puts it in your hand: move it along the county road and click to build it, then see what the golfers think of the view from the car park today.', 100);
  assert.ok(long.length <= 100 && long.endsWith('…') && !/\s…$/.test(long), long);
  for (const t of [...JAM_TOUR, ...TOWN_TOUR, ...RANGE_GUIDE]) assert.ok(firstLine(t.body).length <= 120 && firstLine(t.body).length > 10, t.id);
  for (const t of JAM_TIPS) assert.ok(firstLine(t.body).length <= 120 && firstLine(t.body).length > 10, t.id);
});

test('framePoints and tilesAround: a map target is framed with room round it', () => {
  const r: TileRect = [100, 200, 140, 230], pts = framePoints(r);
  assert.equal(pts.length, 4);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  assert.ok(Math.min(...xs) < 100 && Math.max(...xs) > 140 && Math.min(...ys) < 200 && Math.max(...ys) > 230, 'grown round the rect');
  assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 120) < 0.01, 'about its middle');
  const dot = framePoints([50, 50, 50, 50]);
  assert.ok(Math.max(...dot.map(p => p.x)) - Math.min(...dot.map(p => p.x)) >= 12, 'a point still gets a frame');
  assert.deepEqual(tilesAround([{ x: 10, y: 20 }, { x: 14, y: 30 }], 5), [5, 15, 19, 35]);
  assert.equal(tilesAround([]), null); assert.equal(tilesAround([{ x: NaN, y: 1 }]), null);
});

test('the store: show replaces, hide clears, subscribers hear each change once', () => {
  spotHide();
  const heard: (number | null)[] = [], off = spotSubscribe(() => heard.push(spotNow()?.id ?? null));
  const req: SpotRequest = { title: 'T', line: 'L', targets: [{ ui: 'rail-build' }] }, anchor = { id: 'x', until: 1 };
  spotShow(req, anchor); const first = spotNow()!;
  assert.equal(first.req, req); assert.equal(first.base, anchor);
  spotShow({ ...req, title: 'T2' }); const second = spotNow()!;
  assert.ok(second.id > first.id && second.req.title === 'T2');
  spotHide(); assert.equal(spotNow(), null);
  spotHide(); // nothing up: nobody is told
  off(); spotShow(req); spotHide();
  assert.equal(heard.length, 3);
  assert.equal(heard[2], null);
});

// ---- every Show me names a target that resolves
/** every data-guide anchor the UI draws: the literal ones in the components, the rail's items, the two cursors, the range card's upgrades */
function anchors(): Set<string> {
  const out = new Set<string>();
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.tsx')) for (const m of readFileSync(p, 'utf8').matchAll(/data-guide="([^"]+)"/g)) out.add(m[1]!); } };
  walk('src');
  for (const r of [...RAIL, ...jamRail(RAIL)]) out.add(`rail-${r.id}`); // (the full rail, and the jam's: its Build)
  out.add('rail-walk'); out.add('rail-select');
  assert.match(readFileSync('src/ui/golf/RangeCard.tsx', 'utf8'), /data-guide=\{`range-buy-\$\{u\.id\}`\}/);
  for (const u of RANGE_UPGRADES) out.add(`range-buy-${u.id}`);
  return out;
}
const anchorsOf = (r: SpotRequest): string[] => r.targets.flatMap(t => ('ui' in t ? [t.ui] : 'pulse' in t && t.pulse ? [t.pulse] : []));

/** a host with a range, balls out and rings on the map */
const host = (o: { range?: boolean; balls?: boolean; rings?: boolean } = {}): SpotHost => ({
  spotRangeBox: () => (o.range === false ? null : [100, 100, 160, 140]), spotBallsBox: () => (o.balls === false ? null : [120, 110, 150, 135]), spotRingsBox: () => (o.rings === false ? null : [40, 40, 60, 60]),
});

test('every tutorial step\'s Show me (the jam\'s and the town\'s) names a target that resolves, and says the step\'s own words', () => {
  const have = anchors();
  for (const [name, table, jam] of [['jam', JAM_TOUR, true], ['town', TOWN_TOUR, false]] as const) {
    for (const st of table) {
      const r = tourSpot(st, host(), jam);
      assert.ok(r && r.targets.length > 0, `${name} ${st.id}: its Show me lights nothing`);
      assert.equal(r.title, st.title); assert.equal(r.line, firstLine(st.body));
      for (const a of anchorsOf(r)) assert.ok(have.has(a), `${name} ${st.id}: lights data-guide="${a}", which no control draws`);
      // what the engine does is tour.ts's tourShowOf: the spotlight lights the same things
      for (const a of tourShowOf(st, jam)) if (a.k === 'pulse') assert.ok(anchorsOf(r).includes(a.ui), `${name} ${st.id}: the control its Show me pulses is lit`);
    }
  }
  // the owner's dead button: the Bank's Show me lights the Bank's panel
  assert.deepEqual(tourSpot(JAM_TOUR.find(s => s.id === 'tour-room')!, host(), true)!.targets, [{ ui: 'bank-panel' }]);
  // the range for sale: the range on the map and the card's Buy; the town: its first houses
  const range = tourSpot(JAM_TOUR[0]!, host(), true)!.targets;
  assert.deepEqual(range, [{ tiles: [100, 100, 160, 140] }, { ui: 'range-sale' }]);
  assert.deepEqual(tourSpot(TOWN_TOUR[0]!, host(), false)!.targets, [{ tiles: [40, 40, 60, 60] }]);
  // with nothing on the map the step still lights what it can; with nothing at all there is no spotlight
  assert.deepEqual(tourSpot(JAM_TOUR[0]!, host({ range: false }), true)!.targets, [{ ui: 'range-sale' }]);
  assert.equal(tourSpot(TOWN_TOUR[0]!, host({ rings: false }), false), null);
});

test('every guided-build step\'s Show me names a target that resolves', () => {
  const have = anchors();
  for (const st of RANGE_GUIDE) {
    const r = guideSpot(st, host())!;
    assert.ok(r.targets.length > 0 && r.title === st.title, st.id);
    const names = anchorsOf(r); assert.ok(names.length > 0, `${st.id}: no control to light`);
    for (const a of names) assert.ok(have.has(a), `${st.id}: lights data-guide="${a}", which no control draws`);
  }
  const walk = RANGE_GUIDE.find(s => s.target.map === 'walkway')!;
  assert.deepEqual(guideSpot(walk, host())!.targets[0], { tiles: [40, 40, 60, 60] });
  assert.equal(guideSpot(RANGE_GUIDE[0]!, host())!.targets.some(t => 'tiles' in t), false);
});

test('every tip with a Show me names a target that resolves', () => {
  const have = anchors(), shows = JAM_TIPS.filter(t => t.show);
  assert.ok(shows.length >= 3);
  for (const t of shows) {
    const r = tipSpot(t, host())!;
    assert.ok(r && r.targets.length > 0, `${t.id}: lights nothing`);
    assert.equal(r.title, t.title);
    for (const a of anchorsOf(r)) assert.ok(have.has(a), `${t.id}: lights data-guide="${a}", which no control draws`);
  }
  assert.deepEqual(tipSpot(JAM_TIPS.find(t => t.show === 'build')!, host())!.targets, [{ ui: 'build-menu' }]);
  assert.deepEqual(tipSpot(JAM_TIPS.find(t => t.show === 'bank')!, host())!.targets, [{ ui: 'bank-panel' }]);
  // the balls: out on the map with the Walk control; before any ball is out, the range card's ball room (the engine's own pulse there is the takings, which is not the balls)
  assert.deepEqual(tipSpot(JAM_TIPS.find(t => t.show === 'balls')!, host())!.targets, [{ tiles: [120, 110, 150, 135] }, { pulse: 'rail-walk' }]);
  assert.deepEqual(tipSpot(JAM_TIPS.find(t => t.show === 'balls')!, host({ balls: false }))!.targets, [{ ui: 'range-balls' }]);
  assert.equal(tipSpot(JAM_TIPS.find(t => !t.show)!, host()), null);
});

test('a hole check\'s and a hint\'s Show me', () => {
  const c = checkSpot({ kind: 'block', text: 'The green is on the road. Move it.' }, [{ x: 100, y: 100 }, { x: 110, y: 104 }])!;
  assert.equal(c.title, 'This blocks Build'); assert.equal(c.line, 'The green is on the road.');
  assert.deepEqual(c.targets, [{ tiles: [90, 90, 120, 114] }]);
  assert.equal(checkSpot({ kind: 'warn', text: 'x' }, [{ x: 1, y: 1 }])!.title, 'Worth a look');
  assert.equal(checkSpot({ kind: 'warn', text: 'x' }, []), null);
  assert.deepEqual(hintSpot({ title: 'Open the range', body: 'Click it. Then go.' }), { title: 'Open the range', line: 'Click it.', targets: [{ pulse: null }] });
});

// ---- showMe: the act first, then the framing, then the spotlight
function game(over: Partial<SpotGame> = {}): SpotGame & { log: string[] } {
  const log: string[] = [];
  return { log, guideAnchor: null, spotFrame: r => log.push(`frame ${r.join(',')}`), ...host(), ...over };
}
test('showMe: runs the act, frames a map target, then lights it; a pulse older than the act is not the spotlight\'s', () => {
  spotHide();
  const old = { id: 'rail-old', until: 1 }, g = game({ guideAnchor: old });
  showMe(g, () => g.log.push('act'), () => ({ title: 'A', line: 'a', targets: [{ pulse: null }, { tiles: [1, 2, 3, 4] }] }));
  assert.deepEqual(g.log, ['act', 'frame 1,2,3,4']);
  assert.equal(spotNow()!.base, old, 'the pulse before the act is what a pulse target must differ from');
  spotHide();
  // no request: the act still ran, no spotlight
  const h = game(); showMe(h, () => h.log.push('act'), () => null);
  assert.deepEqual(h.log, ['act']); assert.equal(spotNow(), null);
  // a UI-only request needs no framing
  const k = game(); showMe(k, () => {}, () => ({ title: 'A', line: 'a', targets: [{ ui: 'rail-build' }] }));
  assert.deepEqual(k.log, []); assert.ok(spotNow()); spotHide();
});

test('showMe: with a frame to wait for, the map target is framed after the render, and not for a spotlight that is over by then', () => {
  const g0 = globalThis as { requestAnimationFrame?: (f: () => void) => number };
  const had = g0.requestAnimationFrame, queued: (() => void)[] = [];
  g0.requestAnimationFrame = f => { queued.push(f); return queued.length; };
  try {
    spotHide();
    const g = game(), req = (): SpotRequest => ({ title: 'A', line: 'a', targets: [{ ui: 'rail-build' }, { tiles: [1, 2, 3, 4] }] });
    showMe(g, () => g.log.push('act'), req);
    assert.deepEqual(g.log, ['act'], 'the cards the act opened are not drawn yet: the camera waits for them');
    assert.equal(queued.length, 1); queued.shift()!();
    assert.deepEqual(g.log, ['act', 'frame 1,2,3,4']);
    // Esc (or a click) before the frame came: nothing to frame for
    const h = game(); showMe(h, () => {}, req); spotHide(); queued.shift()!();
    assert.deepEqual(h.log, [], 'a spotlight that is over does not move the camera');
    // another Show me before the frame came: only the newer one frames
    const k = game(); showMe(k, () => {}, req); showMe(k, () => {}, () => ({ title: 'B', line: 'b', targets: [{ tiles: [9, 9, 12, 12] }] }));
    while (queued.length) queued.shift()!();
    assert.deepEqual(k.log, ['frame 9,9,12,12']);
    // a request with no map target asks for no frame at all
    const u = game(); showMe(u, () => {}, () => ({ title: 'A', line: 'a', targets: [{ ui: 'rail-build' }] })); assert.equal(queued.length, 0);
  } finally { if (had) g0.requestAnimationFrame = had; else delete g0.requestAnimationFrame; spotHide(); }
});

test('the prep checklist\'s Show me lights the spot the engine suggested, with the step\'s own words', () => {
  const step = { title: 'Build an entrance gate (1/2)', body: 'Fans pay at the gate: 600 an hour a lane. Put it between the car park and the course.' };
  assert.deepEqual(prepSpot(step, [10, 20, 26, 36]), { title: 'Build an entrance gate', line: 'Fans pay at the gate: 600 an hour a lane.', targets: [{ tiles: [10, 20, 26, 36] }] });
  assert.equal(prepSpot({ title: 'Hang a hole scoreboard · optional', body: 'A board.' }, [1, 1, 2, 2])!.title, 'Hang a hole scoreboard');
  assert.equal(prepSpot({ title: 'Open an info booth (2/3) · optional', body: 'A booth.' }, [1, 1, 2, 2])!.title, 'Open an info booth');
  assert.equal(prepSpot(step, null), null, 'no spot suggested (place it where you like): nothing to light');
  spotHide();
  const calls: string[] = [], g = Object.assign(game(), { prepShowMe: (id: string) => calls.push(`prep ${id}`), spotSuggestBox: (): TileRect | null => [5, 5, 9, 9] });
  showPrep(g, 'prep-gate', step); assert.deepEqual(calls, ['prep prep-gate']); assert.deepEqual(spotNow()!.req.targets, [{ tiles: [5, 5, 9, 9] }]); assert.deepEqual(g.log, ['frame 5,5,9,9']);
  spotHide(); showPrep(g, 'prep-x', undefined); assert.equal(spotNow(), null, 'a line the card no longer has lights nothing'); assert.equal(calls[1], 'prep prep-x', 'but the engine still ran its act');
  spotHide();
});

test('the Show me entry points run the engine\'s act and then light their target', () => {
  spotHide();
  const calls: string[] = [];
  const step = JAM_TOUR[2]!, g = Object.assign(game(), {
    tourShowMe: (id: string) => calls.push(`tour ${id}`), tourView: () => ({ lines: JAM_TOUR.map(s => ({ step: s })) }),
    guideShowMe: (id: string) => calls.push(`guide ${id}`), showHint: (id: string) => calls.push(`hint ${id}`),
  });
  showTour(g, step.id, true); assert.deepEqual(calls, [`tour ${step.id}`]); assert.deepEqual(spotNow()!.req.targets, [{ ui: 'rail-build' }]); assert.equal(spotNow()!.req.title, step.title);
  showGuide(g, RANGE_GUIDE[3]!.id); assert.equal(calls[1], `guide ${RANGE_GUIDE[3]!.id}`); assert.equal(spotNow()!.req.title, RANGE_GUIDE[3]!.title);
  showTip(g, 'bank', () => calls.push('tip')); assert.equal(calls[2], 'tip'); assert.deepEqual(spotNow()!.req.targets, [{ ui: 'bank-panel' }]);
  showHint(g, { id: 'hint-x', title: 'H', body: 'b.' }); assert.equal(calls[3], 'hint hint-x'); assert.equal(spotNow()!.req.title, 'H');
  showCheck(g, () => calls.push('check'), { kind: 'warn', text: 'close.' }, [{ x: 5, y: 5 }]); assert.equal(calls[4], 'check');
  assert.deepEqual(g.log, ['frame -5,-5,15,15'], 'only the map target was framed');
  // a step the game does not show (the tutorial is off) still runs the engine's act and lights nothing
  spotHide(); const none = Object.assign(game(), { tourShowMe: (id: string) => calls.push(`tour ${id}`), tourView: () => null });
  showTour(none, 'tour-golf', true); assert.equal(spotNow(), null);
  spotHide();
});

test('every Show me button in the UI goes through the spotlight', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /onShow=\{id => \{ showTour\(game, id\)/); assert.match(app, /onShow=\{id => \{ showGuide\(game, id\)/);
  assert.match(app, /onShow=\{s => \{ showTip\(game, s, \(\) => runTipShow\(game, s, actUi\)\)/); assert.match(app, /showHint\(game, hint\)/);
  assert.match(app, /onShow=\{id => \{ showPrep\(game, id, /);
  assert.match(app, /game\.closeWelcome\(false\); showGuide\(game, id\);/, 'the welcome card: Show me the first step');
  assert.match(app, /<Spotlight game=\{game\} \/>/);
  assert.match(readFileSync('src/ui/course/HoleWizard.tsx', 'utf8'), /showCheck\(game, \(\) => p\.showMe\(r\.show!\)/);
  // and nothing calls the engine's Show me directly from a button any more (the engine's own auto-pointing at a new step stays a pulse)
  assert.ok(!/onShow=\{id => \{ game\.(tourShowMe|guideShowMe|prepShowMe)/.test(app));
});

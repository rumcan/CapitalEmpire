// The practice facilities (plan P24 Phase 2, T130: golf/practice.ts, the practice parts of golf/rangesave.ts, golf/rangebiz.ts and
// golf/rangehost.ts, the practice hints of ext/progressive-ui): the practice area beside the range, a putting green that counts only once it is
// big enough and lies there, the chipping green with its bunker, the appeal and the fees, the golfers who walk over and putt or chip, the save,
// the cells there kept out of the holes, and the hints that teach the brush.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICE_UV, PUTT_MIN, CHIP_MIN, practiceArea, practiceWords, scanPractice } from '../src/game/golf/practice';
import {
  PRACTICE_FEE, RangeSim, defaultRangeBiz, normalizeRangeBiz, practiceAppeal, practiceUsers, rangeNewSeason, rangeScene, rangeStats, type CarSlot, type RangeBizSave,
} from '../src/game/golf/rangebiz';
import { RangeHost, type RangeHostCtx } from '../src/game/golf/rangehost';
import { SURF, cellAt, makeGrid, paintDisc, type Grid } from '../src/game/ext/course-grid';
import { plotPoint } from '../src/game/golf/range';
import type { Rect } from '../src/game/golf/mode';
import { computeProgressiveUiState, nextFirstRunHint, type PlayerProgressFacts } from '../src/game/ext/progressive-ui';

const plots: Record<0 | 1 | 2 | 3, Rect> = { 0: [500, 600, 70, 150], 1: [900, 300, 150, 70], 2: [200, 200, 70, 150], 3: [1200, 1300, 150, 70] };
const FACINGS = [0, 1, 2, 3] as const;
const start = { tier: 1, exits: 2, residents: 0 };
/** a grid round the facing-2 plot and its practice area (x 190..340, y 190..400 tiles) */
const grid = (): Grid => makeGrid(190, 190, 300, 420);
const AREA = practiceArea(plots[2], 2);
/** a putting green of radius r tiles at the area's (u, v), a chipping green with a bunker beside it */
const P = (u: number, v: number) => plotPoint(plots[2], 2, u, v);
function green(g: Grid, u: number, v: number, r: number) { const p = P(u, v); paintDisc(g, p.x, p.y, r, SURF.green, 0, 0); }
function bunker(g: Grid, u: number, v: number, r: number) { const p = P(u, v); paintDisc(g, p.x, p.y, r, SURF.bunker, 0, 0); }

test('the practice area: the land across the drive from the car park, the same shape for every facing, off the plot and the drive', () => {
  for (const f of FACINGS) {
    const plot = plots[f], a = practiceArea(plot, f), [bx0, by0, bx1, by1] = a.box, w = bx1 - bx0, h = by1 - by0;
    const along = PRACTICE_UV[1] - PRACTICE_UV[0], deep = PRACTICE_UV[3] - PRACTICE_UV[2];
    assert.deepEqual([w, h].sort(), [along, deep].sort(), `facing ${f}: ${along} x ${deep} tiles`);
    // off the plot (and its drive, two tiles past its side)
    const [px, py, pw, ph] = plot, overlap = bx0 < px + pw && bx1 > px && by0 < py + ph && by1 > py;
    assert.ok(!overlap, `facing ${f}: the area keeps off the range plot`);
    const drive = plotPoint(plot, f, 72, 10);
    assert.ok(drive.x < bx0 - 2 || drive.x > bx1 + 2 || drive.y < by0 - 2 || drive.y > by1 + 2, `facing ${f}: and off the drive`);
    // the label in the middle, the walk in at its edge near the car park
    assert.ok(a.label.x > bx0 && a.label.x < bx1 && a.label.y > by0 && a.label.y < by1);
    assert.ok(a.entry.x >= bx0 - 1e-9 && a.entry.x <= bx1 + 1e-9 && a.entry.y >= by0 - 1e-9 && a.entry.y <= by1 + 1e-9, `facing ${f}: the walk in is on the area`);
    const sc = rangeScene(plot, f, defaultRangeBiz());
    assert.deepEqual(sc.practice, a, 'the scene carries it');
    // the tee box is the course grid's now (T127's banks raise it): no tee patch; the deck and mats lie over it
    assert.equal(sc.patches.filter(q => q.surf === 'tee').length, 0); assert.equal(sc.teeBox.length, 8);
    for (let i = 0; i < 8; i += 2) assert.ok(sc.teeBox[i]! >= px && sc.teeBox[i]! <= px + pw && sc.teeBox[i + 1]! >= py && sc.teeBox[i + 1]! <= py + ph, `facing ${f}: the tee box on the plot`);
    // painted areas draw over the course: no outfield patch covers the tee box's middle, the deck and pads lie on it
    const t = sc.teeBox, mid = { x: (t[0]! + t[4]!) / 2, y: (t[1]! + t[5]!) / 2 }, off = plotPoint(plot, f, 10, 21);
    const covers = (q: { pts: number[] }, p: { x: number; y: number }) => { const xs = q.pts.filter((_, i) => i % 2 === 0), ys = q.pts.filter((_, i) => i % 2 === 1); return p.x > Math.min(...xs) && p.x < Math.max(...xs) && p.y > Math.min(...ys) && p.y < Math.max(...ys); };
    assert.ok(!sc.patches.some(q => (q.surf === 'firstCut' || q.surf === 'fairway') && (covers(q, mid) || covers(q, off))), `facing ${f}: the outfield leaves the tee box open`);
  }
});

test('a putting green counts once it is big enough (green plus fringe) and lies in the practice area', () => {
  const g = grid();
  let s = scanPractice(g, AREA.box);
  assert.equal(s.putting.state, 'none'); assert.equal(s.chipping.state, 'none'); assert.equal(s.built, false);
  assert.equal(practiceWords(s.putting), 'Build a putting green');
  // a green outside the area does not count
  green(g, 40, 80, 6); s = scanPractice(g, AREA.box); assert.equal(s.putting.state, 'none'); assert.equal(s.built, false);
  // a small one in it: too small, with its size
  green(g, 88, 14, 3); s = scanPractice(g, AREA.box);
  assert.equal(s.putting.state, 'small'); assert.equal(s.built, true);
  assert.ok(s.putting.m2 > 120 && s.putting.m2 < PUTT_MIN, `green plus fringe ${s.putting.m2} m²`);
  assert.match(practiceWords(s.putting), new RegExp(`^Too small: ${Math.round(s.putting.m2)} of 300 m²$`));
  // grown: open, with three cups on it and spots to putt from
  green(g, 88, 14, 5); s = scanPractice(g, AREA.box);
  assert.equal(s.putting.state, 'open'); assert.ok(s.putting.m2 >= PUTT_MIN);
  assert.equal(s.putting.cups.length, 3); assert.ok(s.putting.stands.length >= 3);
  for (const p of [...s.putting.cups, ...s.putting.stands]) { const i = cellAt(g, p.x, p.y); assert.equal(g.surf[i], SURF.green, 'cups and spots lie on the green'); }
  assert.equal(s.chipping.state, 'none', 'one green is the putting green');
});

test('the chipping green needs its bunker beside it; the putting green is the green without one', () => {
  const g = grid();
  green(g, 88, 14, 5); green(g, 100, 28, 4);
  let s = scanPractice(g, AREA.box);
  assert.equal(s.putting.state, 'open'); assert.equal(s.chipping.state, 'nobunker'); assert.equal(practiceWords(s.chipping), 'Add a practice bunker beside it');
  bunker(g, 100, 33.5, 1.6); s = scanPractice(g, AREA.box);
  assert.equal(s.chipping.state, 'open', 'a bunker beside the second green opens the chipping green'); assert.ok(s.chipping.m2 >= CHIP_MIN);
  assert.equal(s.putting.state, 'open', 'and the putting green stays');
  assert.equal(s.chipping.cups.length, 1); assert.ok(s.chipping.stands.length >= 2);
  assert.ok(s.chipping.stands.some(p => g.surf[cellAt(g, p.x, p.y)] === SURF.bunker), 'golfers chip from the sand');
  // a chipping green too small
  const h = grid(); green(h, 88, 14, 5); green(h, 100, 28, 2); bunker(h, 100, 31.5, 1.6);
  assert.equal(scanPractice(h, AREA.box).chipping.state, 'small');
  // the same scan for the same cells
  assert.deepEqual(scanPractice(g, AREA.box), s);
});

test('appeal and fees: +10% visitors for each open facility, $2 a golfer who uses it', () => {
  const d = defaultRangeBiz(), base = rangeStats(d).appeal;
  assert.equal(practiceAppeal(d), 0);
  d.practice.putting.open = true; assert.ok(Math.abs(practiceAppeal(d) - 0.1) < 1e-9); assert.ok(Math.abs(rangeStats(d, { practiceAppeal: practiceAppeal(d) }).appeal - base * 1.1) < 1e-9);
  d.practice.chipping.open = true; assert.ok(Math.abs(rangeStats(d, { practiceAppeal: practiceAppeal(d) }).appeal - base * 1.21) < 1e-9);
  // beside the props' term (T131) in the same RangeExtras: both multiply in; only the props raise the fair price
  const st = rangeStats(d, { propsAppeal: 0.2, practiceAppeal: practiceAppeal(d) });
  assert.ok(Math.abs(st.appeal - base * 1.2 * 1.21) < 1e-9); assert.ok(Math.abs(st.ref - rangeStats(d, { propsAppeal: 0.2 }).ref) < 1e-9);
  assert.equal(PRACTICE_FEE, 2);
  const u = practiceUsers(d, 100); assert.ok(u.putting > 0 && u.chipping > 0 && u.putting + u.chipping < 100);
  assert.deepEqual(practiceUsers(defaultRangeBiz(), 100), { putting: 0, chipping: 0 });
});

/** a facing-2 range with a car park, its practice facilities painted (putting, and with chip the chipping green and bunker), run for secs */
function run(s: RangeBizSave, secs: number, chip: boolean) {
  const plot = plots[2], sc = rangeScene(plot, 2, s), g = grid();
  green(g, 88, 14, 5); if (chip) { green(g, 100, 28, 4); bunker(g, 100, 33.5, 1.6); }
  const scan = scanPractice(g, sc.practice.box);
  s.practice.putting.open = scan.putting.state === 'open'; s.practice.chipping.open = scan.chipping.state === 'open';
  const slots: CarSlot[] = Array.from({ length: 12 }, (_, i) => ({ x: plot[0] + 52 + (i % 6) * 2.6, y: plot[1] + 6 + Math.floor(i / 6) * 6, hx: 0, hy: 1 }));
  const r = new RangeSim(11, 10); r.setScene(sc, slots, { x: plot[0] + 69, y: plot[1] + 10 }); r.setPractice(scan);
  const busy = { tier: 3, exits: 2, residents: 3000 }, fl = new Float32Array(300), box = sc.practice.box;
  let booked = 0, onGreen = 0, rolling = 0;
  for (let t = 0; t < secs; t += 0.1) {
    booked += r.step(0.1, { hour: 12, day: 1 }, s, busy, 600);
    const v = r.view();
    for (let k = 0; k < v.nPeople; k++) { const p = v.people[k]!; if (p.x >= box[0] && p.x < box[2] && p.y >= box[1] && p.y < box[3]) onGreen++; }
    const n = r.flying(fl); for (let k = 0; k < n; k++) if (fl[3 * k + 2] === 0 && fl[3 * k]! >= box[0] && fl[3 * k]! < box[2]) rolling++;
  }
  return { r, booked, onGreen, rolling, scan };
}

test('a share of the golfers walk over after their bucket and putt, visibly; each pays the fee into the business takings', () => {
  const s = defaultRangeBiz(), o = run(s, 700, false);
  const used = s.practice.putting.season.golfers, scale = 40;
  assert.ok(used >= 2, `golfers putted (${used} of ${s.season.golfers})`);
  assert.ok(used < s.season.golfers, 'only a share of them');
  assert.equal(s.practice.putting.season.takings, used * PRACTICE_FEE * scale);
  assert.equal(s.practice.chipping.season.golfers, 0, 'no chipping green: nobody chips');
  // the fees are booked with the buckets: the range's takings are the buckets plus the fees
  assert.ok(Math.abs(o.booked - s.season.takings) < 1e-6);
  assert.ok(Math.abs(s.season.takings - (s.season.golfers * 6 * scale + used * PRACTICE_FEE * scale)) < 1e-6);
  assert.ok(o.onGreen > 0, 'golfers stand in the practice area'); assert.ok(o.rolling > 0, 'balls roll on the green');
  assert.equal(o.r.practiceToday.putting, used);
});

test('with the chipping green and bunker open some golfers chip too; a facility that closes sends its golfers home', () => {
  const s = defaultRangeBiz(), o = run(s, 900, true);
  assert.ok(s.practice.chipping.season.golfers >= 1, `golfers chipped (${s.practice.chipping.season.golfers})`);
  assert.ok(s.practice.putting.season.golfers >= 1);
  // the grid loses its greens: whoever was practising walks back to the car
  o.r.setPractice(scanPractice(grid(), AREA.box));
  for (let t = 0; t < 200; t += 0.5) o.r.step(0.5, { hour: 19, day: 1 }, s, start, 600);
  assert.equal(o.r.onFoot, 0, 'everyone has gone home');
});

test('a skip books the practice fees the skipped golfers would have paid', () => {
  const s = defaultRangeBiz(); s.practice.putting.open = true; s.practice.chipping.open = true;
  const sim = new RangeSim(3, 10), sc = rangeScene(plots[2], 2, s);
  sim.setScene(sc, [{ x: 260, y: 210, hx: 0, hy: 1 }], { x: 269, y: 210 });
  const booked = sim.step(600, { hour: 0, day: 1 }, s, start, 600), u = practiceUsers(s, s.season.golfers);
  assert.ok(Math.abs(s.practice.putting.season.golfers - u.putting) < 1e-9 && Math.abs(s.practice.chipping.season.golfers - u.chipping) < 1e-9);
  assert.ok(Math.abs(booked - (s.season.golfers * 6 + (u.putting + u.chipping) * PRACTICE_FEE) * 40) < 1e-6);
});

test('the save: the facilities and the tee box in golf.range, an old save loads with none built, a new season starts their counts again', () => {
  const d = defaultRangeBiz();
  assert.deepEqual(d.practice.putting, { open: false, season: { golfers: 0, takings: 0 }, total: { golfers: 0, takings: 0 } });
  assert.equal(d.tee, undefined);
  // a Phase 1 save (no practice, no tee): none built, the tee box still to lay
  const old = normalizeRangeBiz({ v: 1, owned: ['bays8'], price: 7, season: {}, total: {}, paths: true });
  assert.deepEqual(old.practice, d.practice); assert.equal(old.tee, undefined); assert.deepEqual(old.owned, ['bays8']);
  // a round trip
  const s = defaultRangeBiz(); s.tee = true; s.practice.putting = { open: true, season: { golfers: 4, takings: 320 }, total: { golfers: 9, takings: 720 } };
  const back = normalizeRangeBiz(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back, s);
  assert.equal(normalizeRangeBiz({ practice: { putting: { open: 'yes', season: { golfers: -3 } } } }).practice.putting.open, false, 'bad values are dropped');
  rangeNewSeason(back);
  assert.equal(back.practice.putting.season.golfers, 0); assert.equal(back.practice.putting.total.golfers, 9); assert.equal(back.season.takings, 0);
});

test('the host: the tee box laid once into the grid as tee cells of no hole; the cells painted in the practice area hold no hole', () => {
  const g = grid(), biz = defaultRangeBiz(), toasts: string[] = [];
  let laid = 0;
  const ctx: RangeHostCtx = {
    biz: () => biz, plot: () => ({ rect: plots[2], facing: 2 }), carPark: () => null,
    addPiece: () => null, removeProp: () => {}, setGround: () => {}, layPaths: () => {}, clearTrees: () => {},
    money: () => 1e6, spend: () => {}, book: () => {}, demand: () => start, dayLen: () => 600, simT: () => 0, clock: () => ({ hour: 12, day: 1 }),
    save: () => {}, toast: t => { toasts.push(t); }, emit: () => {},
    grid: () => g, layTee: pts => { laid++; const q = []; for (let i = 0; i < pts.length; i += 2) q.push({ x: pts[i]!, y: pts[i + 1]! }); return q.length === 4; },
  };
  const h = new RangeHost(ctx, 1);
  h.sync(); h.step(); h.step();
  assert.equal(laid, 1, 'laid once'); assert.equal(biz.tee, true);
  assert.equal(h.practiceFacts()!.putting, 'none');
  // a stroke of hole 3 in the practice area: its cells keep no hole (in the grid and in the diff, for redo); one outside keeps its hole
  const a = P(88, 14), d = paintDisc(g, a.x, a.y, 5, SURF.green, 3, 0); h.practiceCells(g, d);
  assert.ok(d.n > 0 && Array.from(d.h1).every(v => v === 0)); assert.equal(g.hole[cellAt(g, a.x, a.y)], 0);
  const b = P(40, 80), e = paintDisc(g, b.x, b.y, 2, SURF.green, 3, 0); h.practiceCells(g, e);
  assert.equal(g.hole[cellAt(g, b.x, b.y)], 3);
  // read again: the putting green opens (toasted, saved in the range's state, the appeal up), the hint moves on
  for (let i = 0; i < 8; i++) h.step();
  assert.equal(h.practiceFacts()!.putting, 'open'); assert.equal(biz.practice.putting.open, true); assert.ok(toasts.some(t => /Putting green open/.test(t)));
  const v = h.view()!;
  assert.deepEqual(v.practice.map(f => f.state), ['open', 'none']); assert.match(v.practice[1]!.words, /Build a chipping green and bunker/);
  assert.equal(h.zoneAt(a.x, a.y), 'practice area (no hole)'); assert.equal(h.zoneAt(b.x, b.y), '');
});

test('the hints teach the brush: the putting green first, then the chipping green and bunker, before the first hole; the brushes are open', () => {
  const base: PlayerProgressFacts = { advancedMode: false, playableHoles: 0, seasonsDone: 0, invited: false, elapsedSeconds: 0, roadsBuilt: 0, carParksBuilt: 0, eventStructuresPlaced: 0, dismissedHints: [] };
  assert.equal(nextFirstRunHint(base)?.id, 'hint-build-first-hole', 'outside range starts: as before');
  const ui0 = computeProgressiveUiState(base); assert.equal(ui0.shapeByHand, false); assert.deepEqual(ui0.visibleCourseBrushes, []);
  const p = (putting: 'none' | 'small' | 'open', chipping: 'none' | 'nobunker' | 'open'): PlayerProgressFacts => ({ ...base, practice: { putting, chipping } });
  assert.equal(nextFirstRunHint(p('none', 'none'))?.id, 'hint-practice-putting');
  assert.match(nextFirstRunHint(p('small', 'none'))!.body, /Facilities ▸ Practice ▸ Putting green/); // T206: its own tool, not the brush
  assert.equal(nextFirstRunHint(p('open', 'none'))?.id, 'hint-practice-chipping');
  assert.equal(nextFirstRunHint(p('open', 'nobunker'))?.id, 'hint-practice-chipping');
  assert.equal(nextFirstRunHint(p('open', 'open'))?.id, 'hint-build-first-hole', 'both built: on to the first hole');
  assert.equal(nextFirstRunHint({ ...p('none', 'none'), dismissedHints: ['hint-practice-putting'] })?.id, 'hint-build-first-hole', 'Got it skips it');
  const ui = computeProgressiveUiState(p('none', 'none'));
  assert.equal(ui.stage, 1); assert.equal(ui.shapeByHand, true); assert.deepEqual([...ui.visibleCourseBrushes].sort(), ['bunker', 'green']);
});

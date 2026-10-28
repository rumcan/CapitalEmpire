// T269 (#810) part 2, the grounds crew (src/game/golf/crew.ts, crewground.ts, crewview.ts): the fairway's passes follow the stripe bands (T227's along
// the line, T218's across it) and cover the fairway; the greenkeepers cut every cup before the first group can reach its green; nobody works a hole
// while a group is on it; the mowers keep to the caps; the day is the same from the same inputs; the stripes' cut; the save; the playback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL_T, SURF, makeGrid, type Grid } from '../src/game/ext/course-grid';
import { bandAt, cutPieces, fairwayStripeLook, holeStripeLegs, legArea, type StripeLook } from '../src/game/course-stripes';
import { finishStripeLook, DEFAULT_COURSE_FINISH } from '../src/game/course-finish';
import { bandPasses, crewCells, crewGround, greenPasses, parkSpot, roughPasses, sandsOf, segmentPasses, type CrewGround } from '../src/game/golf/crewground';
import { CREW_OUT, CUP_LEAD, GK_HOME, MO_HOME, crewDay, crewFlips, crewFor, firstFree, fullyCut, holeWindows, legAt, normalizeCrewSave, rotaJobs, runs, type CrewHole, type CrewInputs } from '../src/game/golf/crew';
import { CrewView, cupSetAt } from '../src/game/golf/crewview';
import { greenAt } from '../src/game/golf/daypins';
import { normalizeGolfSave } from '../src/game/golf/mode';

/** a straight hole running north: tee at (x, 200), green round (x, 60), a fairway strip 24 tiles wide from y 80 to 180, a bunker beside the green */
function holeGrid(n = 1, x = 60): Grid {
  const g = makeGrid(0, 0, 240, 440);
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    const px = (i + 0.5) * CELL_T, py = (j + 0.5) * CELL_T, k = j * g.w + i;
    let s: number = SURF.rough;
    if (((px - x) / 10) ** 2 + ((py - 60) / 8) ** 2 <= 1) s = SURF.green;
    else if (Math.abs(px - x) <= 12 && py >= 80 && py <= 180) s = SURF.fairway;
    else if (((px - x - 15) / 3) ** 2 + ((py - 62) / 2) ** 2 <= 1) s = SURF.bunker;
    g.surf[k] = s; g.hole[k] = n;
  }
  return g;
}
const LINE = [60, 200, 60, 60];
const ALONG = finishStripeLook(DEFAULT_COURSE_FINISH, fairwayStripeLook())!, ACROSS = fairwayStripeLook();

test('the fairway\'s passes run along each stripe band, one per band, covering the fairway, turning at its ends (T227\'s look, along the line)', () => {
  const g = holeGrid(), cells = crewCells(g).get(1)!, full = bandPasses(g, cells.fair, LINE, ALONG);
  assert.ok(!ALONG.across, 'the finish lays its bands along the line');
  const legs = holeStripeLegs(LINE, ALONG);
  // one pass per band of fairway cells, in band order, each inside its band
  const bands = new Set<number>(); for (const i of cells.fair) { const cx = (i % g.w + 0.5) * CELL_T, cy = (Math.floor(i / g.w) + 0.5) * CELL_T; bands.add(bandAt(legs, cx, cy).band); }
  assert.equal(full.length, bands.size, 'a pass per band');
  for (let k = 0; k < full.length; k++) {
    const p = full[k]!, mid = { x: (p.ax + p.bx) / 2, y: (p.ay + p.by) / 2 };
    assert.equal(bandAt(legs, mid.x, mid.y).band, p.band, 'the pass lies in its band');
    assert.ok(Math.abs(p.ax - p.bx) < 1e-6, 'along the line (north-south)');
    assert.ok(Math.min(p.ay, p.by) < 81 && Math.max(p.ay, p.by) > 179, `end to end of the fairway (${p.ay} .. ${p.by})`);
    if (k) assert.ok(p.band > full[k - 1]!.band, 'side to side, band after band');
    if (k) assert.ok(Math.hypot(p.ax - full[k - 1]!.bx, p.ay - full[k - 1]!.by) < 4, 'each starts where the last ended: the mower turns');
  }
  // the segments: none longer than 14 tiles, the band's last flagged, the way off to the nearer side
  const seg = segmentPasses(full, false);
  assert.ok(seg.every(p => Math.hypot(p.bx - p.ax, p.by - p.ay) <= 14 + 1e-6));
  assert.equal(seg.filter(p => p.last).length, full.length);
  for (const p of seg) { const off = p.ax + (p.sx ?? 0); assert.ok(off < 48 || off > 72, `off the fairway sideways (${off})`); assert.ok(Math.abs(p.sy ?? 0) < 1e-6); }
});

test('T218\'s own bands lie across the line: the passes cross the fairway band by band along the hole', () => {
  const g = holeGrid(), cells = crewCells(g).get(1)!, full = bandPasses(g, cells.fair, LINE, ACROSS);
  assert.ok(ACROSS.across);
  for (const p of full) { assert.ok(Math.abs(p.ay - p.by) < 1e-6, 'across (east-west)'); assert.ok(Math.min(p.ax, p.bx) < 49 && Math.max(p.ax, p.bx) > 71, 'side to side'); }
  const ys = full.map(p => p.ay); assert.ok(ys.every((y, k) => !k || y < ys[k - 1]!), 'from the tee up the hole');
  const seg = segmentPasses(full, true);
  for (const p of seg) { const off = p.ax + (p.sx ?? 0); assert.ok(off < 49 || off > 71, `back off the fairway past its nearer end (${off})`); }
});

test('the rough passes run outside the fairway down one side and back up the other; sands, green passes and the cart\'s spot', () => {
  const g = holeGrid(), cells = crewCells(g).get(1)!;
  for (const look of [ALONG, ACROSS]) {
    const r = roughPasses(bandPasses(g, cells.fair, LINE, look), look.across, { x: 60, y: 200 });
    assert.ok(r.length > 4);
    for (const p of r) for (const x of [p.ax, p.bx]) assert.ok(x < 49 || x > 71, `outside the fairway (${x})`);
    assert.ok(r[0]!.ay > r[0]!.by - 1e-6 || r[0]!.ay > 150, 'from the tee\'s end');
  }
  const sands = sandsOf(g, cells.sand);
  assert.equal(sands.length, 1); assert.ok(Math.hypot(sands[0]!.cx - 75, sands[0]!.cy - 62) < 1);
  assert.ok(sands[0]!.strokes.length >= 2 && sands[0]!.strokes.every(s => Math.hypot(s.ax - 75, s.ay - 62) < 3.5));
  const gr = greenAt(g, 1, 60, 60, { x: 60, y: 200 })!, gp = greenPasses(gr);
  assert.equal(gp.length, 3); for (const p of gp) assert.ok(Math.abs(p.ax - p.bx) < 1e-6 && Math.abs(p.ay - p.by) > 8, 'along the approach');
  const park = parkSpot(gr, { x: 200, y: 60 })!;
  assert.ok(park.x > 70 && park.x < 74 && Math.abs(park.y - 60) < 1, `beside the green toward the next tee (${park.x}, ${park.y})`);
});

/** a nine-hole course of the test hole side by side, the crew's ground and cups for each */
function course(N = 9): { holes: CrewHole[]; grounds: CrewGround[] } {
  const holes: CrewHole[] = [], grounds: CrewGround[] = [];
  const g = makeGrid(0, 0, 2 * (40 * N + 80), 440);
  for (let h = 1; h <= N; h++) {
    const x = 40 * h; // (each hole's own column of the grid)
    for (let j = 0; j < g.h; j++) for (let i = Math.floor((x - 20) / CELL_T); i < Math.floor((x + 20) / CELL_T); i++) {
      const px = (i + 0.5) * CELL_T, py = (j + 0.5) * CELL_T, k = j * g.w + i;
      let s: number = SURF.rough;
      if (((px - x) / 10) ** 2 + ((py - 60) / 8) ** 2 <= 1) s = SURF.green;
      else if (Math.abs(px - x) <= 8 && py >= 80 && py <= 180) s = SURF.fairway;
      else if (((px - x - 13) / 3) ** 2 + ((py - 62) / 2) ** 2 <= 1) s = SURF.bunker;
      g.surf[k] = s; g.hole[k] = h;
    }
  }
  const cells = crewCells(g);
  for (let h = 1; h <= N; h++) {
    const x = 40 * h, gr = greenAt(g, h, x, 60, { x, y: 200 }), ground = crewGround(g, h, cells.get(h), [x, 200, x, 60], ALONG, gr, { x: x + 40, y: 200 });
    grounds.push(ground); holes.push({ ground, oldCup: { x: x - 3, y: 57 }, newCup: { x: x + 3, y: 64 }, moved: true });
  }
  return { holes, grounds };
}
/** groups teeing off every `gap` minutes from 07:00, 14 minutes a hole */
function play(N: number, groups: number, gap: number) {
  const arrive = Array.from({ length: groups }, (_, g) => Array.from({ length: N }, (_, h) => 420 + g * gap + h * 14)), done = arrive.map(a => a[N - 1]! + 14);
  return holeWindows(arrive, done, N);
}
const pace = { walk: 1.4 / 1.5, cart: 2.8 / 1.5 }; // (the caps on the 10-minute day: 1.5 game minutes a sim second)

function inputs(N = 9, gk = 1, mo = 1, groups = 20, gap = 12): CrewInputs {
  const { holes } = course(N), w = play(N, groups, gap), ns = holes.map(h => h.ground.n);
  return { holes, yard: { x: 0, y: 220 }, gk, mo, greens: new Set(ns), sands: new Set(ns), fairways: new Set([ns[2]!, ns[6]!]), rough: new Set([ns[4]!]), ...w, pace };
}

test('the greenkeepers cut every cup before the first group can reach its green, and the flag moves as he sets it', () => {
  for (const gk of [1, 2]) {
    const inp = inputs(9, gk), day = crewDay(inp);
    assert.equal(day.cups.length, 9, 'every cup changed');
    for (const c of day.cups) { const i = inp.holes.findIndex(h => h.ground.n === c.hole); assert.ok(c.t <= inp.firstOn[i]! + CUP_LEAD + 1e-6, `hole ${c.hole}'s cup at ${c.t.toFixed(1)} by ${inp.firstOn[i]! + CUP_LEAD}`); assert.ok(c.t >= CREW_OUT); }
    // each worker's legs run end to end in time, out at 06:00 and home by his shift's end
    for (const w of day.workers) {
      assert.equal(w.legs[0]!.t0, CREW_OUT);
      for (let k = 1; k < w.legs.length; k++) { assert.ok(Math.abs(w.legs[k]!.t0 - w.legs[k - 1]!.t1) < 1e-6); assert.ok(Math.hypot(w.legs[k]!.ax - w.legs[k - 1]!.bx, w.legs[k]!.ay - w.legs[k - 1]!.by) < 1e-6, 'no jumps'); }
      const last = w.legs.filter(l => l.act !== 'away').at(-1)!; assert.ok(last.t1 <= (w.role === 'gk' ? GK_HOME : MO_HOME) + 30);
    }
    // he kneels at the new cup just before the flag moves, and at the old cup after
    const g0 = day.workers.find(w => w.role === 'gk')!, c0 = day.cups[0]!, h0 = inp.holes.find(h => h.ground.n === c0.hole)!;
    const kneel = legAt(g0, c0.t - 0.1)!; assert.equal(kneel.act, 'kneel'); assert.ok(Math.hypot(kneel.ax - h0.newCup.x, kneel.ay - h0.newCup.y) < 1e-6);
    assert.ok(g0.legs.some(l => l.act === 'kneel' && l.t0 > c0.t && Math.hypot(l.ax - h0.oldCup.x, l.ay - h0.oldCup.y) < 1e-6), 'then fills the old one');
    assert.equal(cupSetAt(day, c0.hole), c0.t); assert.equal(cupSetAt(day, 99), null); assert.equal(cupSetAt(null, 1), null);
  }
  // a hole whose cup is not moved today has no cup event
  const inp = inputs(); inp.holes[3]!.moved = false;
  assert.ok(!crewDay(inp).cups.some(c => c.hole === inp.holes[3]!.ground.n));
});

test('nobody works a hole while a group is on it: the greens, sands, fairway and rough wait for the groups', () => {
  const inp = inputs(9, 1, 1, 30, 8), day = crewDay(inp);
  for (const w of day.workers) for (const l of w.legs) {
    if (l.act !== 'mow' && l.act !== 'push' && l.act !== 'rake') continue;
    const i = Math.round(l.ax / 40) - 1; // (hole h lies on its own column, x = 40 h)
    assert.ok(i >= 0 && i < 9);
    for (const [a, b] of inp.windows[i]!) assert.ok(l.t1 <= a + 1e-6 || l.t0 >= b - 1e-6, `${w.role} ${l.act} at ${l.t0.toFixed(1)}..${l.t1.toFixed(1)} clear of the group on hole ${i + 1} (${a}..${b})`);
  }
  // (a busy day: the holes are never clear for an hour, so the greenkeeper goes back to the yard until play has passed, and comes out again)
  assert.ok(day.workers.some(w => w.legs.some((l, k) => (l.act === 'wait' || l.act === 'away') && k < w.legs.length - 1)), 'someone waited, or went in, for the groups');
  const quiet = crewDay(inputs(9, 1, 1, 4, 70));
  assert.ok(quiet.workers.some(w => w.legs.some(l => l.act === 'wait')), 'on a quiet day someone waits by the hole for a group to pass');
  assert.ok(day.mown.length > 0, 'bands cut');
});

test('the mowers and the walks keep to the caps; the long drives between holes are the cart\'s real speed (the pacer fades them)', () => {
  const day = crewDay(inputs(9, 2, 2, 6, 40));
  for (const w of day.workers) for (const l of w.legs) {
    const d = Math.hypot(l.bx - l.ax, l.by - l.ay), dt = l.t1 - l.t0; if (d < 1e-6 || dt <= 0) continue;
    if (l.act === 'mow' || l.act === 'push' || l.act === 'rake') assert.ok(d / dt <= (l.act === 'mow' ? pace.cart : pace.walk) + 1e-6, `${l.act} at ${(d / dt).toFixed(2)} tiles a minute`);
  }
  // uncapped: the real speeds, a shorter day's work
  const fast = crewDay({ ...inputs(9, 2, 2, 6, 40), pace: null });
  assert.ok(fast.mown.length >= day.mown.length);
});

test('the crew\'s day is the same from the same inputs; more crew, more done', () => {
  assert.deepEqual(crewDay(inputs()), crewDay(inputs()));
  const one = crewDay(inputs(9, 1, 1)), two = crewDay(inputs(9, 2, 2));
  assert.equal(two.workers.length, 4);
  assert.ok(Math.max(...two.cups.map(c => c.t)) < Math.max(...one.cups.map(c => c.t)), 'two greenkeepers finish the cups sooner');
  assert.ok(two.mown.length >= one.mown.length);
  assert.deepEqual(crewDay({ ...inputs(), gk: 0, mo: 0 }), { workers: [], cups: [], mown: [] }, 'no crew: no work');
  assert.deepEqual(runs(9, 2), [[0, 1, 2, 3], [4, 5, 6, 7, 8]]); assert.deepEqual(runs(3, 0), []);
  assert.deepEqual(crewFor(9), { gk: 1, mo: 1 }); assert.deepEqual(crewFor(18), { gk: 2, mo: 2 }); assert.deepEqual(crewFor(0), { gk: 0, mo: 0 });
});

test('holeWindows and firstFree: the groups\' times on each hole', () => {
  const w = holeWindows([[420, 434, 448], [430, 444, 458]], [462, 472], 3);
  assert.deepEqual(w.windows, [[[420, 444]], [[434, 458]], [[448, 472]]]);
  assert.deepEqual(w.firstOn, [420, 434, 448]);
  assert.equal(firstFree([[10, 20], [25, 30]], 0, 5), 0); assert.equal(firstFree([[10, 20], [25, 30]], 8, 5), 20); assert.equal(firstFree([[10, 20], [25, 30]], 8, 6), 30); assert.equal(firstFree([[10, 20], [25, 30]], 19, 4), 20);
  const r = rotaJobs(4, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(r.sands.size, 7); assert.ok(r.greens.size >= 3 && r.greens.size <= 4); assert.ok(r.fairways.size >= 2 && r.fairways.size <= 3); assert.equal(r.rough.size, 1);
});

test('the stripes\' cut: today\'s fresh stripes behind the mower, the phase, a fairway cut whole', () => {
  const inp = inputs(9, 1, 1, 4, 60), day = crewDay(inp), e = day.mown[2]!;
  const at = crewFlips({ phase: [], mown: [] }, day, 5, e.t);
  assert.deepEqual(at.get(e.hole), [0, e.leg, e.band + 1], 'the bands up to the last cut');
  assert.equal(crewFlips({ phase: [], mown: [] }, day, 5, CREW_OUT).size, 0, 'nothing before the first band');
  assert.deepEqual(crewFlips({ phase: [e.hole], mown: [[e.hole, 5]] }, day, 5, e.t).get(e.hole), [1, -1, 0], 'cut whole today: its phase, no cut again');
  assert.deepEqual(crewFlips({ phase: [7], mown: [] }, null, 5, 600).get(7), [1, -1, 0]);
  const passes = new Map(inp.holes.map(h => [h.ground.n, h.ground.passes]));
  const whole = fullyCut(day, passes, Infinity);
  for (const h of whole) { const all = new Set(passes.get(h)!.map(p => p.band)); assert.equal(new Set(day.mown.filter(m => m.hole === h).map(m => m.band)).size, all.size); }
  assert.deepEqual(fullyCut(day, passes, CREW_OUT), []);
  // the renderer's pieces: along the line, the legs before the cut flipped, its leg split at the band
  const legs = holeStripeLegs([0, 0, 0, 100, 50, 150], ALONG), box = [-40, -10, 90, 190];
  const p0 = cutPieces(legs, 0, legArea(legs, 0, box), [0, 1, 2], false), p1 = cutPieces(legs, 1, legArea(legs, 1, box), [0, 1, 2], false);
  assert.deepEqual(p0.map(p => p.flip), [true]); assert.equal(p1.length, 2); assert.deepEqual(p1.map(p => p.flip), [true, false]);
  assert.deepEqual(cutPieces(legs, 1, legArea(legs, 1, box), [1, -1, 0], false).map(p => p.flip), [true]);
  assert.deepEqual(cutPieces(legs, 0, legArea(legs, 0, box), undefined, false).map(p => p.flip), [false]);
});

test('the crew save: well formed, round trip; an old save has none', () => {
  assert.deepEqual(normalizeCrewSave({ phase: [3, 1, 3, -1, NaN], mown: [[1, 4.6], [1, 9], [2, NaN] as never, 'x' as never] }), { phase: [1, 3], mown: [[1, 4]] });
  assert.deepEqual(normalizeCrewSave(undefined), { phase: [], mown: [] });
  const base = { town: { x: 0, y: 0 }, course: [0, 0, 10, 10] as [number, number, number, number], clubhouse: { x: 1, y: 1 } };
  assert.equal(normalizeGolfSave(base)!.crew, undefined);
  const s = normalizeGolfSave({ ...base, crew: { phase: [2], mown: [[2, 7]] } })!;
  assert.deepEqual(s.crew, { phase: [2], mown: [[2, 7]] });
  assert.deepEqual(normalizeGolfSave(JSON.parse(JSON.stringify(s)))!.crew, s.crew);
});

test('the playback: the workers on their legs, riding or on foot, with their carts parked; none before 06:00; the pacers keep to the caps', () => {
  const day = crewDay(inputs(9, 1, 1)), v = new CrewView(day, null);
  v.update(CREW_OUT - 1, 0, -1e4, -1e4, 1e4, 1e4); assert.equal(v.people.length, 0, 'not out yet');
  const c = day.cups[0]!; v.update(c.t - 0.5, 0, -1e4, -1e4, 1e4, 1e4);
  const gk = v.people.find(p => p.role === 'gk')!; assert.ok(gk); assert.equal(gk.frame, 19, 'kneeling (the stand-in\'s sit)'); assert.equal(gk.lift, 0);
  assert.ok(v.things.some(t => t.veh === 'cart'), 'his cart parked by the green');
  const ml = day.workers.find(w => w.role === 'mo')!.legs.find(l => l.act === 'mow')!; v.update((ml.t0 + ml.t1) / 2, 0, -1e4, -1e4, 1e4, 1e4);
  const mo = v.people.find(p => p.role === 'mo')!; assert.ok(mo.lift > 0, 'on his seat'); assert.ok(v.things.some(t => t.veh === 'reel'), 'on the ride-on');
  // the box: none outside it
  v.update((ml.t0 + ml.t1) / 2, 0, -1e4, -1e4, -9e3, -9e3); assert.equal(v.people.length, 0); assert.equal(v.things.length, 0);
  // with the caps (tiles a sim second, 1.5 game minutes a sim second): a mover never runs faster than its cap on screen
  const pv = new CrewView(day, { walk: 1.4, cart: 2.8 }); let last: { x: number; y: number } | null = null, fast = 0;
  for (let s = 0; s < 60; s += 0.05) {
    const m = ml.t0 + s * 1.5; pv.update(m, s, -1e4, -1e4, 1e4, 1e4, s, 1.5);
    const p = pv.people.find(q => q.role === 'mo'); if (p && last && p.alpha > 0.99) fast = Math.max(fast, Math.hypot(p.x - last.x, p.y - last.y) / 0.05);
    last = p ? { x: p.x, y: p.y } : null;
  }
  assert.ok(fast <= 2.8 + 1e-3, `the mower at most the cart cap (${fast.toFixed(2)})`);
});

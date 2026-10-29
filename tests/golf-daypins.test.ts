// T269 (#810) part 1, the day's pin (src/game/golf/daypins.ts): a new cup each day inside the hole's green, off its edges, on flat ground, away from
// yesterday's, rotating front, middle and back; the course view's pins and line ends follow it (the par stays); the save round-trips and an old
// save's cups are its placed pins; the hole card's words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL_T, SURF, cellAt, makeGrid, type Grid } from '../src/game/ext/course-grid';
import { PIN_EDGE_T, PIN_MOVE_T, PIN_SLOPE_MAX, choosePin, greenAt, normalizeDayPins, pinIn, pinLine, pinReport, pinSlot, rollDayPins, withDayPins, type DayPin, type GreenShape } from '../src/game/golf/daypins';
import { normalizeGolfSave, type GolfSave } from '../src/game/golf/mode';
import type { CourseView, PlayHole } from '../src/game/golf/play';
import { dayCourse } from '../src/game/golf/everyday';

/** a grid with hole n's green as an ellipse round (cx, cy) of radii (rx, ry) tiles, rough round it, and a fairway strip coming in from the south */
function greenGrid(n = 1, cx = 40, cy = 40, rx = 9, ry = 7): Grid {
  const g = makeGrid(0, 0, 160, 160);
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    const x = (i + 0.5) * CELL_T, y = (j + 0.5) * CELL_T, k = j * g.w + i;
    const inG = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    g.surf[k] = inG ? SURF.green : Math.abs(x - cx) < 6 && y > cy ? SURF.fairway : SURF.rough; g.hole[k] = n;
  }
  return g;
}
/** the green of greenGrid, approached from the south (play comes in heading north) */
const greenOf = (g: Grid, n = 1): GreenShape => greenAt(g, n, 40, 40, { x: 40, y: 75 })!;
/** a cell's walk to the green's edge, worked out directly (the distance to the nearest cell that is not green), tiles */
function edgeDist(g: Grid, x: number, y: number): number {
  let best = Infinity;
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    const k = j * g.w + i; if (g.surf[k] === SURF.green) continue;
    const px = (i + 0.5) * CELL_T, py = (j + 0.5) * CELL_T; best = Math.min(best, Math.hypot(px - x, py - y));
  }
  return best;
}

test('pinSlot rotates each hole through front, middle and back, left and right, and balances the course each day', () => {
  for (let h = 1; h <= 18; h++) {
    const seen = new Set<string>();
    for (let d = 0; d < 6; d++) { const s = pinSlot(d, h); seen.add(`${s.depth}-${s.side}`); }
    assert.equal(seen.size, 6, `hole ${h} has every depth on both sides over six days`);
    assert.notEqual(pinSlot(7, h).depth, pinSlot(8, h).depth, 'the depth changes day to day');
  }
  for (let d = 0; d < 10; d++) {
    const n = { front: 0, middle: 0, back: 0 };
    for (let h = 1; h <= 18; h++) n[pinSlot(d, h).depth]++;
    assert.deepEqual(n, { front: 6, middle: 6, back: 6 }, `day ${d}: a third of the pins in each depth`);
  }
});

test('greenAt finds the hole\'s green round its pin, with each cell\'s walk to the edge and the approach', () => {
  const g = greenGrid(), gr = greenOf(g);
  const cells = gr.edge.length; let expect = 0;
  for (let k = 0; k < g.surf.length; k++) if (g.surf[k] === SURF.green) expect++;
  assert.equal(cells, expect, 'every green cell of the hole');
  assert.ok(Math.abs(gr.uy + 1) < 1e-9 && Math.abs(gr.ux) < 1e-9, 'play comes in heading north');
  // the walk to the edge is close to the true distance
  for (let q = 0; q < cells; q += 37) {
    const x = gr.pts[2 * q]!, y = gr.pts[2 * q + 1]!, e = gr.edge[q]!, d = edgeDist(g, x, y);
    assert.ok(e <= d + 0.5 && e >= d / 1.5 - 0.5, `cell (${x}, ${y}): walk ${e} against ${d.toFixed(2)}`);
  }
  // another hole's green, or none near the pin
  assert.equal(greenAt(g, 2, 40, 40, null), null, 'not hole 2\'s');
  assert.equal(greenAt(g, 1, 120, 120, null), null, 'no green there');
  // a pin just off the green still finds it
  assert.ok(greenAt(g, 1, 40, 40 - 7.6, null), 'a pin a little off its green');
});

test('choosePin: on the green, off its edges, flat, away from yesterday\'s, in the rota\'s third and side', () => {
  const g = greenGrid(), gr = greenOf(g), front = 47, back = 33; // play comes in from the south: the front is the south side (y large)
  for (let day = 0; day < 30; day++) {
    for (const depth of ['front', 'middle', 'back'] as const) for (const side of ['left', 'right'] as const) {
      const prev = { x: 40, y: 40 }, p = choosePin(gr, depth, side, prev, null, 1234, day, 1)!;
      assert.ok(p, 'a cup');
      const i = cellAt(g, p.x, p.y); assert.equal(g.surf[i], SURF.green, 'on the green');
      assert.ok(edgeDist(g, p.x, p.y) >= PIN_EDGE_T - CELL_T, `off the edge (${edgeDist(g, p.x, p.y).toFixed(2)})`);
      assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y) >= PIN_MOVE_T, 'away from yesterday\'s');
      if (depth === 'front') assert.ok(p.y > 40 && p.y <= front, `front: south of the middle (${p.y})`);
      if (depth === 'back') assert.ok(p.y < 40 && p.y >= back, `back: north of the middle (${p.y})`);
      // heading north the golfer's left is west
      if (depth !== 'middle') assert.ok(side === 'left' ? p.x <= 40 : p.x >= 40, `${side}: x ${p.x}`);
      assert.equal(pinReport(gr, p).depth, depth, 'the card reads the third the rota asked for');
    }
  }
  // the same day and hole give the same cup; another day another
  const a = choosePin(gr, 'back', 'left', null, null, 7, 3, 1), b = choosePin(gr, 'back', 'left', null, null, 7, 3, 1), c = choosePin(gr, 'back', 'left', null, null, 7, 4, 1);
  assert.deepEqual(a, b); assert.notDeepEqual(a, c);
  assert.equal(choosePin(null, 'front', 'left', null, null, 1, 1, 1), null, 'no green: no cup');
});

test('choosePin keeps off steep ground, and takes the flattest when none is flat', () => {
  const g = greenGrid(), gr = greenOf(g);
  // the green's east half is steep
  const steep = (x: number) => (x > 40 ? 0.06 : 0.01);
  for (let day = 0; day < 12; day++) {
    const p = choosePin(gr, 'middle', 'right', null, (x, _y) => steep(x), 99, day, 1)!;
    assert.ok(steep(p.x) <= PIN_SLOPE_MAX, `flat ground (x ${p.x})`);
  }
  const all = choosePin(gr, 'middle', 'right', null, (x, _y) => 0.05 + x * 1e-3, 99, 1, 1)!;
  assert.ok(all.x < 40, 'none flat enough: the flattest quarter (the west side)');
});

test('a small green puts the cup on its innermost cells', () => {
  const g = greenGrid(1, 40, 40, 2.6, 2.2), gr = greenAt(g, 1, 40, 40, { x: 40, y: 75 })!;
  let maxE = 0; for (const e of gr.edge) maxE = Math.max(maxE, e);
  assert.ok(maxE < PIN_EDGE_T, 'smaller than the edge rule');
  const p = choosePin(gr, 'front', 'left', null, null, 5, 2, 1)!;
  assert.ok(Math.hypot(p.x - 40, p.y - 40) < 1.5, `near the middle (${p.x}, ${p.y})`);
});

test('rollDayPins: an old save\'s cups are its placed pins; each new day moves every cup; a day before the save starts again', () => {
  const placed: DayPin[] = [{ hole: 1, x: 10, y: 10 }, { hole: 2, x: 50, y: 50 }];
  const s0 = rollDayPins(null, 5, placed, () => ({ x: 0, y: 0 }));
  assert.deepEqual(s0, { day: 5, today: placed, prev: placed });
  assert.equal(rollDayPins(s0, 5, placed, () => null), s0, 'the same day: as it is');
  let k = 0;
  const s1 = rollDayPins(s0, 6, placed, (h, prev) => ({ x: prev.x + 5 + k++, y: prev.y + h }));
  assert.equal(s1.day, 6);
  assert.deepEqual(s1.prev, placed, 'yesterday\'s are the save\'s today');
  assert.deepEqual(s1.today, [{ hole: 1, x: 15, y: 11 }, { hole: 2, x: 56, y: 52 }]);
  // a hole whose cup cannot be cut keeps yesterday's; a new hole starts from its placed pin; a hole gone is dropped
  const s2 = rollDayPins(s1, 8, [...placed.slice(1), { hole: 3, x: 90, y: 90 }], h => (h === 2 ? null : { x: 1, y: 1 }));
  assert.deepEqual(s2.today, [{ hole: 2, x: 56, y: 52 }, { hole: 3, x: 1, y: 1 }]);
  assert.deepEqual(s2.prev, [{ hole: 2, x: 56, y: 52 }, { hole: 3, x: 90, y: 90 }]);
  assert.deepEqual(rollDayPins(s2, 2, placed, () => ({ x: 0, y: 0 })).today, placed, 'a new clock: the placed pins');
});

test('withDayPins plays the day\'s cup: the pin and every line\'s end move, the par and the tees stay', () => {
  const h: PlayHole = { n: 1, par: 4, tee: { x: 0, y: 0 }, pin: { x: 0, y: 100 }, line: [{ x: 0, y: 0 }, { x: 5, y: 50 }, { x: 0, y: 100 }],
    sets: [{ kind: 'back', tee: { x: 0, y: 0 }, line: [{ x: 0, y: 0 }, { x: 5, y: 50 }, { x: 0, y: 100 }] }, { kind: 'forward', tee: { x: 0, y: 20 }, line: [{ x: 0, y: 20 }, { x: 0, y: 100 }] }] };
  const h2: PlayHole = { n: 2, par: 3, tee: { x: 50, y: 0 }, pin: { x: 50, y: 60 }, line: [{ x: 50, y: 0 }, { x: 50, y: 60 }] };
  const view: CourseView = { holes: [h, h2, { ...h }], lieAt: () => 'fairway' }; // (makeCourseView's repeat: a new object on the same line)
  const out = withDayPins(view, n => (n === 1 ? { x: 3, y: 96 } : null));
  assert.notEqual(out, view);
  const o = out.holes[0]!;
  assert.deepEqual(o.pin, { x: 3, y: 96 }); assert.deepEqual(o.line[2], { x: 3, y: 96 }); assert.deepEqual(o.line[1], { x: 5, y: 50 });
  assert.equal(o.par, 4); assert.deepEqual(o.tee, { x: 0, y: 0 });
  assert.deepEqual(o.sets!.map(s => s.line[s.line.length - 1]), [{ x: 3, y: 96 }, { x: 3, y: 96 }]);
  assert.deepEqual(out.holes[2]!.pin, { x: 3, y: 96 }, 'a 9-hole course\'s second nine too');
  assert.equal(out.holes[2]!.line, out.holes[0]!.line, 'a hole listed twice keeps one line for its repeats');
  assert.equal(dayCourse(out).holes.length, 2, 'so the everyday round still plays each hole once');
  assert.equal(out.holes[1], h2, 'a hole with no day cup is as placed');
  assert.deepEqual(h.pin, { x: 0, y: 100 }, 'the course view given is not changed');
  assert.equal(withDayPins(view, () => null), view, 'no day cups: the same view');
  assert.equal(out.lieAt(1, 1), 'fairway');
});

test('pinReport: the card says the third, the side and the paces on and from the side', () => {
  const g = greenGrid(), gr = greenOf(g);
  const r = pinReport(gr, { x: 37.25, y: 35.25 });
  assert.equal(r.depth, 'back'); assert.equal(r.side, 'left'); assert.equal(r.edgeSide, 'left');
  assert.ok(r.onM >= 20 && r.onM <= 24, `${r.onM} m on`);
  assert.ok(r.edgeM >= 8 && r.edgeM <= 14, `${r.edgeM} m from the edge`);
  assert.match(pinLine(r), /^back left · \d+ m on, \d+ m from the left edge$/);
  const m = pinReport(gr, { x: 40.25, y: 40.25 });
  assert.equal(m.depth, 'middle'); assert.equal(m.side, 'centre');
  assert.match(pinLine(m), /^middle centre · /);
  const f = pinReport(gr, { x: 44.25, y: 45.25 });
  assert.equal(f.depth, 'front'); assert.equal(f.side, 'right');
});

test('the day\'s pins save and load; an old save has none; a bad one is dropped', () => {
  const s = normalizeDayPins({ day: 4.7, today: [{ hole: 1, x: 2, y: 3 }, { hole: 1, x: 9, y: 9 }, { hole: 'x' as unknown as number, x: 1, y: 1 }, { hole: 2, x: NaN, y: 1 }], prev: undefined });
  assert.deepEqual(s, { day: 4, today: [{ hole: 1, x: 2, y: 3 }], prev: [] });
  assert.equal(normalizeDayPins(null), null); assert.equal(normalizeDayPins({ today: [] }), null);
  assert.deepEqual(pinIn(s!.today, 1), { hole: 1, x: 2, y: 3 }); assert.equal(pinIn(s!.today, 2), null);
  const base: Partial<GolfSave> = { town: { x: 0, y: 0 }, course: [0, 0, 10, 10], clubhouse: { x: 1, y: 1 }, pins: [{ hole: 1, x: 2, y: 2 }] };
  assert.equal(normalizeGolfSave(base)!.dayPins, undefined, 'an old save: none (its placed pins are today\'s)');
  const saved = normalizeGolfSave({ ...base, dayPins: { day: 3, today: [{ hole: 1, x: 2.5, y: 2 }], prev: [{ hole: 1, x: 2, y: 2 }] } })!;
  assert.deepEqual(saved.dayPins, { day: 3, today: [{ hole: 1, x: 2.5, y: 2 }], prev: [{ hole: 1, x: 2, y: 2 }] });
  assert.deepEqual(normalizeGolfSave(JSON.parse(JSON.stringify(saved)))!.dayPins, saved.dayPins, 'a round trip');
  assert.equal(normalizeGolfSave({ ...base, dayPins: { today: [] } as never })!.dayPins, undefined, 'a bad one is dropped');
});

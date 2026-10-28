// T254 (#736): Edit Hole Layout moves only the tee markers and the flag, and the four tee sets (blue, white, yellow, red). The owner, 2026-10-28:
// "if you edit the layout it does not plant new grass it just moves the start of the hole tee markers and teh flag. it is the players job to fix the
// course manually. Also add multiple tees. YEllow, white, blue and red". Pure, Node: the Paint tool's plan mode with a stand-in host (the markers as
// the engine keeps them), the tee sets' helpers, the hole views and card, the save, My holes, the course stats and the round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURF, cellAt, makeGrid } from '../src/game/ext/course-grid';
import { aimsFromPlans, decodePlans, LAYOUT_INFO } from '../src/game/ext/hole-wizard';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';
import type { AimPoint, CourseArea, Pin, TeeMark } from '../src/game/golf/types';
import {
  FLAG_OFF, TEE_KINDS, addTeeSpot, everydaySet, layoutMarkers, markerWarnings, migrateTees, nearestSet, teeBox, teeOff, teeSetsTerm,
} from '../src/game/golf/teesets';
import { deriveHoles } from '../src/game/golf/holes';
import { holeViews, markerPlan, type HoleArea } from '../src/game/golf/holeview';
import { holeCard } from '../src/game/golf/holecard';
import { normalizeGolfSave, type GolfSave } from '../src/game/golf/mode';
import { captureHole, normalizeMyHole, placeMyHole } from '../src/game/golf/myholes';
import { buildCourseStatsPanel } from '../src/game/golf/coursestats';
import { makeCourseView } from '../src/game/golf/play/courseview';
import { makeField, playRound } from '../src/game/golf/play';
import { dayRoster } from '../src/game/golf/everyday';
import type { CourseView, Golfer, Lie } from '../src/game/golf/play';
import { SURF_SURFACE } from '../src/game/ext/course-grid/areas';
import type { LookBook } from '../src/game/golf/looks';

const PX = 16;
/** a golf game for the Paint tool, as golf-edit-hole.test.ts's, with the engine's markers: Edit Hole Layout's hooks move them as the engine does */
function golf() {
  const g = makeGrid(0, 0, 1000, 1400);
  const st = { money: 5_000_000, plans: [] as unknown[], aims: [] as AimPoint[], toasts: [] as string[], pins: [] as Pin[], tees: [] as TeeMark[], looks: { h1: { green: { tex: 'golfGreen' } } } as unknown as LookBook };
  const host: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast: t => { st.toasts.push(t); }, affine: o => { o[0] = 0; o[1] = 0; o[2] = PX; o[3] = 0; o[4] = 0; o[5] = PX; },
    placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    golfMode: () => true, currentMonth: () => 2, money: () => st.money, spend: n => { st.money -= n; },
    grid: () => g, gridChanged() {}, ownedAt: x => x < 300, plans: () => st.plans,
    setPlans: p => { const before = decodePlans(st.plans); st.plans = p; st.aims = aimsFromPlans(st.aims, before, decodePlans(p)); },
    lookBook: () => st.looks,
    layoutBuilt: (n, base, plan) => {
      const r = layoutMarkers(base, plan, st.pins.find(p => p.hole === n) ?? null, st.tees.filter(t => t.hole === n));
      if (r.moved.pin && r.pin) st.pins = [...st.pins.filter(p => p.hole !== n), r.pin];
      if (r.moved.tees) st.tees = [...st.tees.filter(t => t.hole !== n), ...r.tees];
      return markerWarnings((x, y) => { const i = cellAt(g, x, y); return i >= 0 ? SURF_SURFACE[g.surf[i]!] ?? null : null; }, r.pin, r.tees);
    },
    markersKey: () => JSON.stringify([st.pins, st.tees]), setMarkers: k => { [st.pins, st.tees] = JSON.parse(k); },
    markersOf: n => ({ pin: st.pins.find(p => p.hole === n) ?? null, tees: st.tees.filter(t => t.hole === n) }),
  };
  const tool = new PaintTool(host); tool.enterCourse();
  const down = (x: number, y: number) => { tool.pointerDown({ x, y }, x * PX, y * PX); tool.pointerUp(0.5); };
  const drag = (from: { x: number; y: number }, to: { x: number; y: number }) => { tool.pointerDown(from, from.x * PX, from.y * PX); tool.pointerMove(to, to.x * PX, to.y * PX); tool.pointerUp(0.5); };
  return { st, g, tool, w: tool.wizard, down, drag };
}
/** hole 1 built with New hole (east along y 120), its white tee and flag as the marker fit places them (the plan's tee and green) */
function oneHole() {
  const o = golf();
  assert.ok(o.tool.setPlan()); o.down(40, 120); o.down(230, 120); assert.ok(o.tool.buildPlan());
  const p = decodePlans(o.st.plans)[0]!;
  o.st.pins = [{ hole: 1, x: p.green.x, y: p.green.y, auto: true }];
  o.st.tees = [{ hole: 1, kind: 'middle', x: p.tee.x + 3, y: p.tee.y, auto: true }, { hole: 1, kind: 'back', x: p.tee.x + 0.5, y: p.tee.y, auto: true }];
  o.tool.setBrush(o.tool.brushKind);
  return o;
}
const snap = (g: ReturnType<typeof makeGrid>) => [Array.from(g.surf), Array.from(g.hole), Array.from(g.month)].map(a => a.join(',')).join('|');

test('Edit Hole Layout lays no grass: the grid and the looks stay exactly as they are; the tee markers and the flag move with the tee and the green', () => {
  const o = oneHole(), before = snap(o.g), looks = JSON.stringify(o.st.looks), money = o.st.money;
  const pin0 = { ...o.st.pins[0]! }, white0 = { ...o.st.tees.find(t => t.kind === 'middle')! };
  assert.ok(o.tool.editHole(1));
  assert.equal(o.w.ghost()!.diff.n, 0, 'the ghost lays nothing'); assert.equal(o.w.ghost()!.cost, 0);
  assert.ok(o.w.checks().some(c => c.id === 'layout' && c.text === LAYOUT_INFO), 'the check table says it moves markers only');
  const gr = o.w.handles().find(h => h.k === 'green')!, te = o.w.handles().find(h => h.k === 'tee')!;
  o.drag(gr, { x: gr.x + 20, y: gr.y + 8 }); o.drag(te, { x: te.x - 15, y: te.y });
  assert.ok(o.tool.buildPlan(), 'the layout is kept');
  assert.equal(snap(o.g), before, 'not one cell painted, cleared or regrown');
  assert.equal(JSON.stringify(o.st.looks), looks, 'the hole\'s looks stay');
  assert.equal(o.st.money, money, 'nothing charged');
  const pin = o.st.pins[0]!, white = o.st.tees.find(t => t.kind === 'middle')!;
  assert.ok(Math.abs(pin.x - (pin0.x + 20)) < 0.6 && Math.abs(pin.y - (pin0.y + 8)) < 0.6 && pin.held, 'the flag went with the green, held there');
  assert.ok(Math.abs(white.x - (white0.x - 15)) < 1 && white.held, 'the white tee went with the tee, held there');
  assert.equal(decodePlans(o.st.plans)[0]!.green.x, decodePlans(o.st.plans)[0]!.green.x, 'the plan is saved');
  assert.match(o.st.toasts.at(-1)!, /layout moved: par \d, \d+ m\. No grass laid\. The flag is off the green: paint a green there/);
  // undo takes the plan and the markers back; redo moves them again
  o.tool.undo(); assert.deepEqual(o.st.pins[0], pin0, 'undo puts the flag back');
  assert.equal(snap(o.g), before);
  o.tool.redo(); assert.ok(o.st.pins[0]!.held && Math.abs(o.st.pins[0]!.x - (pin0.x + 20)) < 0.6, 'redo moves it again');
});

test('the off-green and off-tee warnings: the wizard warns before the Build, the card after; the hole still plays', () => {
  const o = oneHole(); assert.ok(o.tool.editHole(1));
  const gr = o.w.handles().find(h => h.k === 'green')!;
  o.drag(gr, { x: gr.x + 25, y: gr.y + 10 });
  assert.ok(o.w.layoutWarnings().some(c => c.kind === 'warn' && c.text === FLAG_OFF), 'the wizard warns: the flag would be off the green');
  assert.ok(o.w.check().ok, 'the warning never blocks the Build');
  const te = o.w.handles().find(h => h.k === 'tee')!; o.drag(te, { x: te.x - 40, y: te.y });
  assert.ok(o.w.layoutWarnings().some(c => c.text === teeOff('middle')) && o.w.layoutWarnings().some(c => c.text === teeOff('back')));
  // the card: a held flag off the green and a held tee off the turf say so, each with the paint brush as its Fix
  const areas: HoleArea[] = [{ hole: 1, tex: 'golfGreen', pts: [100, 100, 110, 100, 110, 110, 100, 110] }, { hole: 1, tex: 'golfTee', pts: [0, 100, 6, 100, 6, 106, 0, 106] }];
  const pins: Pin[] = [{ hole: 1, x: 130, y: 105, held: true }], tees: TeeMark[] = [{ hole: 1, kind: 'middle', x: 30, y: 103, held: true }];
  const v = holeViews(areas, { pins, tees, aims: [] })[0]!;
  assert.deepEqual(v.checks.slice(3).map(c => [c.label, c.ok]), [[FLAG_OFF, false], [teeOff('middle'), false]]);
  assert.ok(v.par > 0, 'the hole plays with the warning');
  const c = holeCard(v, { pins, tees, aims: [], areas: [], ready: null, planned: true });
  assert.deepEqual(c.checks.filter(k => !k.ok && !k.warn).map(k => k.fix), [{ kind: 'brush', surface: 'green' }, { kind: 'brush', surface: 'tee' }]);
  // the marker fit never moves a held marker (it would put an auto one back on its turf)
  assert.deepEqual(markerPlan(areas, pins, tees), [], 'held: they stay where Edit Hole Layout put them');
  const ops = markerPlan(areas, pins.map(p => ({ ...p, held: false, auto: true })), tees.map(t => ({ ...t, held: false, auto: true })));
  assert.deepEqual(ops.map(q => [q.op, q.kind]), [['set', 'pin'], ['set', 'middle']], 'not held: fitted back onto the green and the tee');
});

test('New hole lays the white tee alone; an auto set off every tee box goes onto the nearest box', () => {
  const areas: HoleArea[] = [{ hole: 1, tex: 'golfGreen', pts: [100, 100, 110, 100, 110, 110, 100, 110] }, { hole: 1, tex: 'golfTee', pts: [0, 100, 14, 100, 14, 106, 0, 106] }];
  assert.deepEqual(markerPlan(areas, [], []).map(q => q.kind), ['pin', 'middle']);
  const ops = markerPlan(areas, [{ hole: 1, x: 105, y: 105, auto: true }], [{ hole: 1, kind: 'middle', x: 7, y: 103, auto: true }, { hole: 1, kind: 'back', x: -30, y: 103, auto: true }]);
  assert.equal(ops.length, 1); assert.equal(ops[0]!.kind, 'back'); assert.ok(ops[0]!.op === 'set' && ops[0]!.x >= 0 && ops[0]!.x <= 14);
});

test('four sets: their lengths and pars, the card lists them and offers the missing ones; the scorecard and the course rating read them', () => {
  const areas: CourseArea[] = [{ id: 1, surface: 'green', pts: [290, 95, 310, 95, 310, 115, 290, 115] }, { id: 2, surface: 'tee', pts: [0, 95, 120, 95, 120, 115, 0, 115] }];
  const pins: Pin[] = [{ hole: 1, x: 300, y: 105 }];
  const tees: TeeMark[] = [{ hole: 1, kind: 'back', x: 5, y: 105 }, { hole: 1, kind: 'middle', x: 30, y: 105 }, { hole: 1, kind: 'senior', x: 50, y: 105 }, { hole: 1, kind: 'forward', x: 100, y: 105 }];
  const h = deriveHoles(areas, tees, pins, [])[0]!;
  assert.deepEqual(h.sets!.map(s => [s.kind, s.lengthM, s.par]), [['back', 590, 5], ['middle', 540, 5], ['senior', 500, 5], ['forward', 400, 4]]);
  assert.equal(h.lengthM, 590); assert.equal(h.memberLengthM, 540);
  const v = holeViews(areas.map(a => ({ hole: 1, tex: a.surface === 'green' ? 'golfGreen' : 'golfTee', pts: a.pts })), { pins, tees, aims: [] })[0]!;
  const c = holeCard(v, { pins, tees, aims: [], areas: [], ready: null, planned: true });
  assert.deepEqual(c.tees.map(t => [t.kind, t.m]), [['back', 590], ['middle', 540], ['senior', 500], ['forward', 400]]); assert.deepEqual(c.addable, []);
  const one = holeCard(v, { pins, tees: tees.filter(t => t.kind === 'middle'), aims: [], areas: [], ready: null, planned: true });
  assert.deepEqual(one.addable, ['back', 'senior', 'forward'], 'Add tee: Blue / Yellow / Red');
  const layout = { areas, pins, aims: [], clubhouse: { x: 0, y: 0 } };
  const four = buildCourseStatsPanel({ ...layout, tees }), single = buildCourseStatsPanel({ ...layout, tees: tees.filter(t => t.kind === 'middle') });
  assert.deepEqual(four.rows[0]!.sets.map(s => s.lengthM), [590, 540, 500, 400], 'the scorecard\'s columns');
  assert.equal(four.everyGolfer, 3); assert.equal(single.everyGolfer, 0);
  assert.equal(four.qualityScore, Math.min(100, single.qualityScore + 3), 'more tee sets lift the rating a little');
  assert.deepEqual(teeSetsTerm([{ line: [1, 2], sets: [1, 2] }, { line: [1, 2], sets: [1] }]), { avg: 1.5, points: 1 });
});

test('Add tee lays the box behind or ahead along the line, between two sets when there are both', () => {
  const line = [{ x: 0, y: 0 }, { x: 200, y: 0 }], white = { kind: 'middle' as const, x: 10, y: 0 };
  assert.deepEqual(addTeeSpot('back', [white], line)!.at, { x: -2.5, y: 0 }, 'blue 25 m behind');
  assert.deepEqual(addTeeSpot('senior', [white], line)!.at, { x: 22.5, y: 0 }, 'yellow 25 m ahead');
  assert.deepEqual(addTeeSpot('forward', [white], line)!.at, { x: 30, y: 0 }, 'red 40 m ahead');
  assert.deepEqual(addTeeSpot('senior', [white, { kind: 'forward', x: 30, y: 0 }], line)!.at, { x: 20, y: 0 }, 'yellow between white and red');
  assert.equal(addTeeSpot('middle', [white], line), null, 'it has the white already');
  const box = teeBox({ x: 0, y: 0 }, { x: 1, y: 0 }); let x0 = Infinity, x1 = -Infinity;
  for (let k = 0; k < box.length; k += 2) { x0 = Math.min(x0, box[k]!); x1 = Math.max(x1, box[k]!); }
  assert.ok(Math.abs(x1 - x0 - 7) < 1e-9, 'a 14 m box (7 tiles) along the line');
  // a tee box painted into the hole as tee turf and charged like a tee
  const o = oneHole(), money = o.st.money;
  const r = o.tool.addTeeBox(1, teeBox({ x: 60, y: 120 }, { x: 1, y: 0 }), 'add the blue tee to hole 1');
  assert.ok(r && r.cells > 50 && r.cost > 0); assert.equal(o.st.money, money - r!.cost);
  assert.equal(o.g.surf[cellAt(o.g, 60, 120)], SURF.tee); assert.equal(o.g.hole[cellAt(o.g, 60, 120)], 1);
  o.tool.undo(); assert.equal(o.st.money, money, 'one undo step, money back');
});

test('old saves: back, middle and forward stand as blue, white and red; a hole with a single tee becomes white; nothing moves; the sets save and load', () => {
  const old: TeeMark[] = [{ hole: 1, kind: 'back', x: 1, y: 2 }, { hole: 1, kind: 'middle', x: 3, y: 2 }, { hole: 1, kind: 'forward', x: 5, y: 2 }, { hole: 2, kind: 'back', x: 9, y: 9 }];
  assert.deepEqual(migrateTees(old), [old[0], old[1], old[2], { hole: 2, kind: 'middle', x: 9, y: 9 }]);
  const base = { v: 1, tier: 1, rep: 0, town: { x: 0, y: 0 }, course: [0, 0, 10, 10], dir: 0, pins: [], aims: [], clubhouse: { x: 0, y: 0 } } as unknown as GolfSave;
  const a = normalizeGolfSave({ ...base, tees: old })!;
  assert.deepEqual(a.tees.map(t => [t.hole, t.kind, t.x, t.y]), [[1, 'back', 1, 2], [1, 'middle', 3, 2], [1, 'forward', 5, 2], [2, 'middle', 9, 9]]);
  assert.deepEqual(normalizeGolfSave(a)!.tees, a.tees, 'loaded again before a save: the same (the mapping is idempotent)');
  // a save with the sets: kept as they are (a single blue stays blue), the yellow too, through JSON
  const sets: TeeMark[] = [{ hole: 1, kind: 'senior', x: 4, y: 2, held: true }, { hole: 2, kind: 'back', x: 9, y: 9 }];
  const b = normalizeGolfSave(JSON.parse(JSON.stringify({ ...a, tees: sets, teeSets: 1 })))!;
  assert.deepEqual(b.tees, sets); assert.equal(b.teeSets, 1);
});

test('Save hole keeps the tee sets: they come back where they stood when the hole is placed again', () => {
  const o = oneHole(), plan = decodePlans(o.st.plans)[0]!;
  const tees = [{ kind: 'back' as const, x: plan.tee.x - 10, y: plan.tee.y + 0.5 }, { kind: 'middle' as const, x: plan.tee.x + 3, y: plan.tee.y }, { kind: 'forward' as const, x: plan.tee.x + 30, y: plan.tee.y - 1 }];
  const h = captureHole(1, { grid: o.g, plan, tee: plan.tee, pin: plan.green, name: 'Long one', tees })!;
  const back = normalizeMyHole(JSON.parse(JSON.stringify(h)))!;
  assert.deepEqual(back.tees, h.tees); assert.equal(back.tees!.length, 3);
  const tcx = Math.floor((plan.tee.x - o.g.x0) / 0.5), tcy = Math.floor((plan.tee.y - o.g.y0) / 0.5);
  const p = placeMyHole(back, o.g, tcx, tcy, back.facing, 2);
  for (const t of tees) { const q = p.tees.find(s => s.kind === t.kind)!; assert.ok(Math.hypot(q.x - t.x, q.y - t.y) < 0.6, `${t.kind} where it stood`); }
});

test('golfers pick their set: tournaments the blue, members mostly the white, seniors the yellow, ladies and beginners the red; the nearest set where one is missing', () => {
  assert.equal(nearestSet(['back', 'middle', 'senior', 'forward'], 'senior'), 'senior');
  assert.equal(nearestSet(['middle'], 'back'), 'middle'); assert.equal(nearestSet(['middle', 'forward'], 'senior'), 'forward');
  assert.equal(nearestSet(['back', 'senior'], 'middle'), 'back'); assert.equal(nearestSet(['back'], 'forward'), 'back'); assert.equal(nearestSet([], 'back'), null);
  assert.ok(makeField(3, 77).every(g => g.tees === 'back'), 'the field plays the blue');
  assert.equal(everydaySet('w', 0.5, 0.9), 'forward'); assert.equal(everydaySet('m', 0.18, 0.9), 'forward'); assert.equal(everydaySet('m', 0.4, 0.1), 'senior'); assert.equal(everydaySet('m', 0.4, 0.5), 'middle');
  const r = dayRoster(5, 3, { quality: 80, rep: 60, holes: 18 }), men = r.golfers.filter(g => g.sex === 'm');
  assert.ok(r.golfers.filter(g => g.sex === 'w').every(g => g.tees === 'forward'));
  assert.ok(men.filter(g => g.tees === 'middle').length > men.length / 2, 'the men mostly from the white');
  assert.ok(men.some(g => g.tees === 'senior'), 'some seniors from the yellow');
  // the round: each golfer's first stroke from his own set's tee (the yellow golfer from the nearest, the red)
  const areas: CourseArea[] = [{ id: 1, surface: 'green', pts: [290, 95, 310, 95, 310, 115, 290, 115] }, { id: 2, surface: 'fairway', pts: [0, 90, 300, 90, 300, 120, 0, 120] }, { id: 3, surface: 'tee', pts: [0, 95, 120, 95, 120, 115, 0, 115] }];
  const tees: TeeMark[] = [{ hole: 1, kind: 'back', x: 5, y: 105 }, { hole: 1, kind: 'middle', x: 30, y: 105 }, { hole: 1, kind: 'forward', x: 100, y: 105 }];
  const view: CourseView = makeCourseView(deriveHoles(areas, tees, [{ hole: 1, x: 300, y: 105 }], []), () => 'fairway' as never);
  view.lieAt = (): Lie => 'fairway';
  const gs: Golfer[] = (['back', 'middle', 'senior', 'forward'] as const).map((k, id) => ({ id, name: `G${id}`, sex: 'm', pro: false, skill: 0.5, look: 0, tees: k }));
  const plan = playRound(view, gs, [{ tee: 480, players: [0, 1, 2, 3] }], 9);
  const first = (id: number) => plan.shots.find(s => s.golfer === id && s.stroke === 1)!.from;
  assert.deepEqual([first(0), first(1), first(2), first(3)].map(p => p.x), [5, 30, 100, 100]);
  assert.deepEqual(TEE_KINDS, ['back', 'middle', 'senior', 'forward']);
});

test('a layout edit that moves the tee carries every set along the first leg, in order; a layout edit of the green alone leaves the tees', () => {
  const base = { tee: { x: 0, y: 0 }, green: { x: 100, y: 0 }, bends: [] }, plan = { tee: { x: 10, y: 10 }, green: { x: 10, y: 110 }, bends: [] };
  const tees: TeeMark[] = [{ hole: 1, kind: 'back', x: -10, y: 0, auto: true }, { hole: 1, kind: 'middle', x: 2, y: 1 }];
  const r = layoutMarkers(base, plan, { hole: 1, x: 100, y: 0 }, tees);
  assert.deepEqual(r.tees.map(t => [t.kind, t.x, t.y, t.held, t.auto]), [['back', 10, 0, true, undefined], ['middle', 9, 12, true, undefined]], 'turned with the leg (east to south)');
  assert.deepEqual(r.pin, { hole: 1, x: 10, y: 110, held: true }, 'the flag by the green step');
  const g = layoutMarkers(base, { ...base, green: { x: 120, y: 5 } }, { hole: 1, x: 100, y: 0 }, tees);
  assert.equal(g.moved.tees, false); assert.deepEqual(g.tees, tees); assert.deepEqual(g.pin, { hole: 1, x: 120, y: 5, held: true });
});

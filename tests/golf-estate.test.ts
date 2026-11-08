// T353 (#995): house lots on your course (golf/estate.ts): the lots' frames are the town's lot lattice, the rules that keep a lot off the course, the view and
// the price, the market and the building stages, a ball on a lot is out of bounds, and the save.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap } from '../src/game/lots/lots';
import { isAngled } from '../src/game/lots/compose';
import { NEAR_M } from '../src/game/ext/hole-wizard';
import { CELL_T, SURF, cellAt, makeGrid, paintCells, paintDisc, fillPolygon, type Grid } from '../src/game/ext/course-grid';
import { makeCourseView } from '../src/game/golf/play/courseview';
import { normalizeGolfSave } from '../src/game/golf/mode';
import { deriveHoles } from '../src/game/golf/holes';
import {
  BUILD_MONTHS, LAY_COST, LEVY, MARKET_CAP, OFF_AXIS_DEG, RANGE_T, SOLD_MONTHS, START_MARKET, ST,
  cellsUnder, countsOf, demandOf, encodeEstate, inLot, frontageFrames, housesOf, lotAt, lotWhy, newEstate, normalizeEstate, offAxis, pickFrames, placeLots, planLots, priceOf, removeLot, repFactor,
  sellRate, stepEstate, viewFactor, viewOf, type EstateEnv, type Estate, type Frame, type RoadBit, type StepEnv, type StreetSeg,
} from '../src/game/golf/estate';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const P = (x: number, y: number) => ({ x, y });
/** an estate street: a Street along y = 100 from x = 100 to x = 200 (half width 1.625 and verge 1.025: lots start 2.65 tiles off its line, 10 x 15 tiles) */
const STREET: StreetSeg = { a: P(100, 100), b: P(200, 100), base: 'street', h: 1.625, walk: 1.025, ra: 0, rb: 0 };
const STREET_BIT: RoadBit = { a: P(100, 100), b: P(200, 100), hw: 1.625 + 1.025, kind: 'road' };
/** the player's land: x 90..210, y 60..140 */
const owned = (x: number, y: number) => x >= 90 && x <= 210 && y >= 60 && y <= 140;
/** a stand-in game: the owned land, the street, no course; o overrides */
const env = (o: Partial<EstateEnv> = {}): EstateEnv => ({ map: 2048, owned, grid: null, lines: [], roads: () => [STREET_BIT], ...o });
/** a course grid covering the land (cells of 0.5 tiles) */
const grid = (): Grid => makeGrid(90, 60, 240, 160);
/** the lot on the +y side of the street at lattice place k (x = 10 k): the frame pickFrames gives */
const lotK = (k: number, side: 1 | -1 = 1): Frame => frontageFrames(STREET, [side]).find(f => f.k === k)!;
const rep = 30;

test('frontage frames are the town\'s own lot lattice: every town lot of a street is one of them', () => {
  (globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };
  const e = new NetEditor(new RoadNetwork()), leg: Leg = { a: P(100, 100), b: P(200, 100) };
  e.addLegs([leg], CLASS.street, 0); e.commit();
  const lm = new LotMap(); lm.update(e.net, null);
  const town = [...lm.lots.values()];
  assert.ok(town.length >= 6, `the town lays lots along the street (${town.length})`);
  const mine = frontageFrames(STREET);
  assert.equal(mine.length, 20, 'ten lots a side from x = 100 to 200');
  for (const l of town) {
    const f = mine.find(q => q.side === l.side && Math.abs(q.o.x - l.o.x) < 1e-6 && Math.abs(q.o.y - l.o.y) < 1e-6);
    assert.ok(f, `the town's lot ${l.key} is one of the frames`);
    assert.equal(f!.w, l.w); assert.equal(f!.d, l.d);
    assert.ok(Math.abs(f!.u.x - l.u.x) < 1e-9 && Math.abs(f!.u.y - l.u.y) < 1e-9 && Math.abs(f!.n.x - l.n.x) < 1e-9 && Math.abs(f!.n.y - l.n.y) < 1e-9, 'the same frame');
  }
  // the first lot on the +y side: its front-left corner at the verge's edge (2.65 tiles off the street's line), running 10 along it and 15 away
  const f0 = lotK(10);
  assert.deepEqual([f0.o.x, +f0.o.y.toFixed(3), f0.u.x, f0.n.y, f0.w, f0.d], [100, 102.65, 1, 1, 10, 15]);
  const g0 = lotK(10, -1);
  assert.deepEqual([g0.o.x, +g0.o.y.toFixed(3), g0.n.y], [100, 97.35, -1]);
});

test('a street cut back at its ends loses the lots there; a short piece has none', () => {
  const cut = frontageFrames({ ...STREET, ra: 12, rb: 12 }, [1]);
  assert.deepEqual(cut.map(f => f.k), [12, 13, 14, 15, 16, 17], 'lots k = 12..17 sit wholly inside x = 112..188');
  assert.equal(frontageFrames({ ...STREET, b: P(105, 100) }).length, 0, 'a street shorter than a lot');
});

test('a click picks the lot under it, a drag a row on the side it lies on, a drag along the street itself both sides', () => {
  const one = pickFrames([STREET], P(125, 110), P(125.2, 110));
  assert.equal(one.length, 1); assert.equal(one[0]!.k, 12); assert.equal(one[0]!.side, 1);
  assert.equal(pickFrames([STREET], P(125, 60), P(125, 60)).length, 0, 'a click 22 tiles from any lot picks none');
  // a drag along the lots' row on the +y side, from the middle of the lot at x 120..130 to the middle of the one at 150..160
  const row = pickFrames([STREET], P(125, 110), P(155, 110));
  assert.deepEqual(row.map(f => f.k), [12, 13, 14, 15]);
  assert.ok(row.every(f => f.side === 1));
  // the same on the other side of the street
  const rowL = pickFrames([STREET], P(125, 90), P(155, 90));
  assert.deepEqual(rowL.map(f => f.k), [12, 13, 14, 15]);
  assert.ok(rowL.every(f => f.side === -1));
  // a drag on the street's own line lays both sides
  const both = pickFrames([STREET], P(125, 100), P(155, 100));
  assert.equal(both.length, 8); assert.deepEqual([...new Set(both.map(f => f.side))].sort(), [-1, 1]);
});

test('lots are laid on the player\'s own land only, and need every corner and edge in it', () => {
  const e = env();
  assert.equal(lotWhy(lotK(12), e), '');
  assert.match(lotWhy(lotK(12), env({ owned: (x, y) => owned(x, y) && x < 125 })), /Not your land/, 'half of it is another\'s');
  assert.match(lotWhy({ ...lotK(10), o: P(80, 102.65) }, e), /Not your land/, 'x = 80..90 is off the land');
  assert.match(lotWhy(lotK(12), env({ map: 100 })), /off the map/);
});

test('no lot on a playing surface, by name and hole; the rough, long grass and fescue are covered (or refused with the way to clear them)', () => {
  const g = grid();
  const f = lotK(12), cx = 125, cy = 110;
  assert.equal(lotWhy(f, env({ grid: g })), '', 'bare ground');
  paintDisc(g, cx, cy, 1.5, SURF.fairway, 4, 0);
  assert.equal(lotWhy(f, env({ grid: g })), "Hole 4's fairway is in the way");
  const g2 = grid(); paintDisc(g2, cx, cy, 1.5, SURF.green, 7, 0); paintDisc(g2, cx + 3, cy, 1.5, SURF.fairway, 7, 0);
  assert.equal(lotWhy(f, env({ grid: g2 })), "Hole 7's green is in the way", 'the green is named before the fairway');
  const g3 = grid(); paintDisc(g3, cx, cy, 1.5, SURF.rough, 1, 0);
  assert.equal(lotWhy(f, env({ grid: g3 })), '', 'the rough is ground a lot covers, as a street does (T355)');
  assert.equal(lotWhy(f, env({ grid: g3, coverRough: false })), 'The rough is in the way: rub it out first');
  const g3b = grid(); paintDisc(g3b, cx, cy, 1.5, SURF.longGrass, 1, 0); paintDisc(g3b, cx + 2, cy, 1, SURF.fescue, 1, 0);
  assert.equal(lotWhy(f, env({ grid: g3b })), ''); assert.equal(lotWhy(f, env({ grid: g3b, coverRough: false })), 'The long grass is in the way: rub it out first');
  const g3c = grid(); paintDisc(g3c, cx, cy, 1.5, SURF.waste, 1, 0);
  assert.equal(lotWhy(f, env({ grid: g3c })), 'A waste area is in the way', 'a waste area is a hazard: never covered');
  const g4 = grid(); paintDisc(g4, cx, cy, 1.5, SURF.water, 0, 0);
  assert.equal(lotWhy(f, env({ grid: g4 })), 'A water hazard is in the way');
  const g5 = grid(); paintDisc(g5, cx, cy, 1.5, SURF.bunker, 2, 0);
  assert.equal(lotWhy(f, env({ grid: g5 })), "Hole 2's bunker is in the way");
  // a painted cell just outside the lot does not count (the lot at k = 12 spans x 120..130, y 102.65..117.65)
  const g6 = grid(); paintDisc(g6, 135, 110, 1.5, SURF.fairway, 4, 0);
  assert.equal(lotWhy(f, env({ grid: g6 })), '', 'a fairway beside the lot is not under it');
  // a fairway polygon crossing a corner
  const g7 = grid(); fillPolygon(g7, [P(128, 115), P(140, 115), P(140, 125), P(128, 125)], SURF.fairway, 3, 0);
  assert.match(lotWhy(f, env({ grid: g7 })), /fairway/);
});

test('no lot in the water, over a road, a cart path or a course drive, or on something built', () => {
  const f = lotK(12);
  assert.equal(lotWhy(f, env({ water: (x, y) => x >= 124 && x < 126 && y >= 108 && y < 110 })), 'Water is in the way');
  const cross: RoadBit = { a: P(125, 100), b: P(125, 140), hw: 1.2, kind: 'road' };
  assert.equal(lotWhy(f, env({ roads: () => [STREET_BIT, cross] })), 'A road is in the way');
  assert.equal(lotWhy(f, env({ roads: () => [STREET_BIT, { ...cross, kind: 'cart' }] })), 'A cart path is in the way');
  assert.equal(lotWhy(f, env({ roads: () => [STREET_BIT, { ...cross, kind: 'drive' }] })), 'A course drive is in the way');
  // a path just beside the lot is no obstacle
  assert.equal(lotWhy(f, env({ roads: () => [STREET_BIT, { a: P(133, 100), b: P(133, 140), hw: 1.2, kind: 'cart' }] })), '');
  assert.equal(lotWhy(f, env({ blocked: () => 'The clubhouse stands there: find a free spot' })), 'The clubhouse stands there: find a free spot');
});

test('no lot within range of a hole: the hole card\'s "golfers there are in range", half of NEAR_M from the line', () => {
  assert.equal(RANGE_T, NEAR_M / 2 / 2, 'NEAR_M metres between two lines, half of it from one line, in tiles');
  assert.equal(RANGE_T, 15);
  const f = lotK(12); // y 102.65..117.65
  // a hole's line along y = 140: 22.35 tiles from the lot's back edge, out of range
  assert.equal(lotWhy(f, env({ lines: [{ hole: 3, line: [P(100, 140), P(200, 140)] }] })), '');
  // along y = 130: 12.35 tiles (25 m) from the lot: in range
  assert.equal(lotWhy(f, env({ lines: [{ hole: 3, line: [P(100, 130), P(200, 130)] }] })), "Hole 3's line is 25 m away: golfers there are in range");
  // just out of range: 15 tiles from the back edge (y = 132.65)
  assert.equal(lotWhy(f, env({ lines: [{ hole: 3, line: [P(100, 132.65), P(200, 132.65)] }] })), '');
  // the line's end counts (a green behind the lot) and a dogleg's bend (the polyline)
  assert.match(lotWhy(f, env({ lines: [{ hole: 5, line: [P(150, 150), P(130, 125)] }] })), /Hole 5/);
  assert.match(lotWhy(f, env({ lines: [{ hole: 6, line: [P(110, 125), P(125, 112)] }] })), /Hole 6's line is 0 m away/, 'a line through the lot is 0 m away');
  assert.equal(lotWhy(f, env({ lines: [{ hole: 2, line: [P(125, 112), P(125, 112)] }, { hole: 4, line: [] }] })), "Hole 2's line is 0 m away: golfers there are in range");
  // the nearest hole is the one named
  assert.match(lotWhy(f, env({ lines: [{ hole: 8, line: [P(100, 125), P(200, 125)] }, { hole: 9, line: [P(100, 130), P(200, 130)] }] })), /Hole 8/);
});

test('no lot over another lot (touching on the lattice is fine); a street too far off the axes cannot take a house', () => {
  const a = lotK(12), b = lotK(13);
  assert.equal(lotWhy(b, env(), [a]), '', 'neighbours touch');
  assert.equal(lotWhy(a, env(), [a]), 'A lot is there already');
  assert.equal(lotWhy({ ...a, o: P(a.o.x + 4, a.o.y) }, env(), [a]), 'A lot is there already', 'overlapping by 6 tiles');
  // a street at 30 degrees: more than OFF_AXIS_DEG off both axes (a lot the town would draw as a green)
  const u = P(Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)), n = P(-u.y, u.x);
  assert.match(lotWhy({ o: P(120, 90), u, n, w: 10, d: 15 }, env({ roads: () => [] })), /Houses face the map's axes/);
  assert.equal(offAxis(u), true); assert.equal(offAxis(P(1, 0)), false); assert.equal(offAxis(P(Math.cos(0.3), Math.sin(0.3))), false, '17 degrees is still on an axis');
  // the same rule as the town's composer
  for (let deg = 0; deg <= 90; deg += 3) {
    const v = P(Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180));
    assert.equal(offAxis(v), isAngled({ o: P(0, 0), u: v, n: P(-v.y, v.x), w: 10, d: 15 }), `${deg} degrees`);
  }
  assert.equal(OFF_AXIS_DEG, 20);
});

test('placeLots lays the lots a drag picks, refuses the rest with their reasons, and charges LAY_COST a lot', () => {
  const e = newEstate(5), g = grid();
  paintDisc(g, 145, 110, 2, SURF.fairway, 4, 0); // under the lot at x 140..150
  const r = placeLots(e, { segs: [STREET], from: P(125, 110), to: P(185, 110) }, env({ grid: g }), 5, 7);
  assert.deepEqual(r.placed.map(l => l.id), [1, 2, 3, 4, 5, 6], 'seven lots picked (x 120..190), one refused');
  assert.equal(r.refused.length, 1); assert.equal(r.refused[0]!.why, "Hole 4's fairway is in the way"); assert.equal(r.refused[0]!.frame.k, 14);
  assert.equal(r.cost, 6 * LAY_COST);
  assert.equal(e.lots.length, 6); assert.equal(e.next, 7);
  assert.ok(e.lots.every(l => l.st === ST.SALE && l.price === 0 && l.at === 5 && l.after === Infinity));
  assert.equal(new Set(e.lots.map(l => l.seed)).size, 6, 'each lot has a seed of its own');
  // laying the same row again: every lot is there already
  const again = placeLots(e, { segs: [STREET], from: P(125, 110), to: P(185, 110) }, env({ grid: g }), 5, 7);
  assert.equal(again.placed.length, 0); assert.ok(again.refused.some(x => x.why === 'A lot is there already'));
  // planLots changes nothing
  const before = e.lots.length; planLots(e, { segs: [STREET], side: -1 }, env());
  assert.equal(e.lots.length, before);
  // T354's call: the whole frontage of the street, both sides (each lot judged by the same rules)
  const e2 = newEstate(0);
  const all = placeLots(e2, { segs: [STREET] }, env(), 0, 1);
  assert.equal(all.placed.length, 20, 'ten lots a side, all on the land');
});

test('removeLot takes back a lot still for sale; a sold lot is private land', () => {
  const e = newEstate(0); placeLots(e, { segs: [STREET], from: P(125, 110), to: P(145, 110) }, env(), 0);
  const id = e.lots[0]!.id, id2 = e.lots[1]!.id; e.lots[1]!.st = ST.SOLD;
  assert.equal(removeLot(e, id2), null);
  assert.equal(removeLot(e, id)!.id, id); assert.equal(removeLot(e, id), null);
  assert.equal(e.lots.length, 2);
});

test('a lot\'s view: the fairway, the green or water behind or beside it; the price rises with them and with the reputation', () => {
  const f = lotK(12), g = grid();
  assert.deepEqual(viewOf(f, g), { fairway: false, green: false, water: false, hole: 0 });
  paintDisc(g, 125, 125, 2, SURF.fairway, 6, 0); // behind the lot (its back edge is y = 117.65)
  assert.deepEqual(viewOf(f, g), { fairway: true, green: false, water: false, hole: 6 });
  paintDisc(g, 138, 112, 2, SURF.green, 6, 0); // beside it
  const v = viewOf(f, g);
  assert.equal(v.green, true); assert.equal(v.fairway, true); assert.equal(v.hole, 6);
  // water: the map's water, or a pond in the course
  assert.equal(viewOf(f, grid(), (x, y) => y > 120 && y < 124 && x > 120 && x < 130).water, true);
  const gp = grid(); paintDisc(gp, 125, 122, 2, SURF.water, 0, 0);
  assert.equal(viewOf(f, gp).water, true);
  // the lot's own ground is never its view, and a fairway out of sight (30 tiles off) is not one
  const far = grid(); paintDisc(far, 125, 150, 3, SURF.fairway, 1, 0);
  assert.equal(viewOf(f, far).fairway, false);

  const none = { fairway: false, green: false, water: false, hole: 0 };
  assert.equal(priceOf(f, none, 30), 11300, 'the standard lot at reputation 30: $20 a m² x 600 m² x 0.94, to the nearest $100');
  assert.equal(priceOf(f, { ...none, fairway: true }, 30), 14100, 'a fairway adds a quarter');
  assert.equal(priceOf(f, { ...none, green: true }, 30), 15800, 'a green two fifths');
  assert.equal(priceOf(f, { ...none, water: true }, 30), 13500);
  assert.ok(priceOf(f, { fairway: true, green: true, water: true, hole: 1 }, 30) <= Math.round(priceOf(f, none, 30) * 1.7 / 100) * 100 + 100, 'the views are held to +70%');
  assert.equal(viewFactor({ fairway: true, green: true, water: true, hole: 1 }), 1.7);
  assert.ok(repFactor(0) < repFactor(30) && repFactor(30) < repFactor(100));
  assert.equal(repFactor(0), 0.7); assert.equal(repFactor(100), 1.5);
  assert.ok(priceOf(f, none, 80) > priceOf(f, none, 30) && priceOf(f, none, 30) > priceOf(f, none, 0), 'the price rises with the reputation');
  assert.equal(priceOf({ w: 10, d: 30 }, none, 30), 2 * priceOf({ w: 10, d: 15 }, none, 30), 'with the lot\'s area');
});

/** an estate of three lots for sale at x 120.., with the clock at month 0 */
function estate3(): Estate {
  const e = newEstate(0); placeLots(e, { segs: [STREET], from: P(125, 110), to: P(145, 110) }, env(), 0, 11); return e;
}
const stepEnv = (o: Partial<StepEnv> = {}): StepEnv => ({ rep, demand: 1, ask: l => 10000 + l.id * 1000, ...o });

test('the market: buyers come at a rate set by the reputation and the town, take the dearest lot first, and the lot goes through its stages to a house', () => {
  assert.ok(sellRate(60, 1) > sellRate(30, 1) && sellRate(30, 1) > sellRate(0, 1));
  assert.ok(sellRate(30, 1) > sellRate(30, 0.5));
  assert.ok(demandOf(600, 900) > demandOf(600, 600), 'a town with room to grow has more buyers');
  assert.ok(demandOf(600, null) === demandOf(600, 1e9));
  assert.ok(demandOf(1500, null) > demandOf(300, null));
  assert.equal(sellRate(30, 1), 1.4 * (0.5 + 0.3));

  const e = estate3(), out: ReturnType<typeof stepEstate>[] = [];
  // 0.5 of a buyer waits at the start (START_MARKET): the first sale comes within the first month
  out.push(stepEstate(e, 0.25, stepEnv()));
  assert.equal(out[0]!.sold.length, 0, 'not yet');
  out.push(stepEstate(e, 1.0, stepEnv()));
  const sold1 = out.flatMap(o => o.sold);
  assert.equal(sold1.length, 1); assert.equal(sold1[0]!.lot.id, 3, 'the dearest lot (id 3 asks most) sells first');
  assert.equal(sold1[0]!.price, 13000); assert.equal(e.lots.find(l => l.id === 3)!.price, 13000);
  assert.equal(e.lots.find(l => l.id === 3)!.st, ST.SOLD);
  // the sold lot waits SOLD_MONTHS, then is a building site for BUILD_MONTHS, then a house
  const l3 = e.lots.find(l => l.id === 3)!;
  assert.ok(l3.after - l3.at >= SOLD_MONTHS[0] - 1e-9 && l3.after - l3.at <= SOLD_MONTHS[1] + 1e-9);
  stepEstate(e, l3.after + 0.01, stepEnv({ demand: 0 }));
  assert.equal(l3.st, ST.BUILDING);
  assert.ok(l3.after - l3.at >= BUILD_MONTHS[0] - 1e-9 && l3.after - l3.at <= BUILD_MONTHS[1] + 1e-9);
  const done = stepEstate(e, l3.after + 0.01, stepEnv({ demand: 0 }));
  assert.equal(l3.st, ST.BUILT); assert.deepEqual(done.built.map(l => l.id), [3]);
  assert.equal(l3.after, Infinity);
  assert.equal(housesOf(e), 1);
  const c = countsOf(e); assert.equal(c.total, 3); assert.equal(c.built, 1); assert.equal(c.takings, 13000);
});

test('the clock is the same whether it runs in one jump or in many steps; a finished house owes a levy each month crossed', () => {
  const run = (marks: number[]) => {
    const e = estate3(), seen = { sold: 0, levy: 0, built: 0 };
    for (const m of marks) { const o = stepEstate(e, m, stepEnv()); seen.sold += o.sold.length; seen.levy += o.levy; seen.built += o.built.length; }
    return { e, seen };
  };
  const one = run([30]), many = run(Array.from({ length: 120 }, (_, i) => (i + 1) * 0.25));
  assert.deepEqual(encodeEstate(one.e), encodeEstate(many.e), 'the same lots, stages and times');
  assert.deepEqual(one.seen, many.seen);
  assert.equal(one.seen.sold, 3); assert.equal(one.seen.built, 3);
  assert.ok(one.seen.levy > 0 && one.seen.levy % LEVY === 0, `the levy ${one.seen.levy} is whole houses x months x $${LEVY}`);
  // all three houses stand well before month 30: from then on each month crossed owes 3 x LEVY
  const e = one.e, o = stepEstate(e, 33, stepEnv());
  assert.equal(o.months, 3); assert.equal(o.levy, 3 * 3 * LEVY);
  // a little behind holds, a whole season behind starts a new clock
  assert.equal(stepEstate(e, 32.5, stepEnv()).levy, 0); assert.equal(e.t, 33);
  stepEstate(e, 10, stepEnv()); assert.equal(e.t, 10);
});

test('buyers do not pile up with nothing for sale, and a lot sells only to a buyer who is there', () => {
  const e = newEstate(0);
  stepEstate(e, 24, stepEnv());
  assert.ok(e.market <= 1, 'no lots, no queue of buyers');
  const e2 = estate3(); stepEstate(e2, 0.5, stepEnv({ demand: 0 }));
  assert.equal(countsOf(e2).sale, 3, 'no demand, no sale');
  stepEstate(e2, 1.2, stepEnv({ ask: () => 9000 }));
  assert.ok(e2.market <= MARKET_CAP);
  assert.deepEqual(e2.lots.filter(l => l.st !== ST.SALE).map(l => l.id), [1], 'equal asks sell the lowest id first');
});

test('lots by id, lotAt finds the lot a point lies in, and only that', () => {
  const e = estate3();
  assert.equal(lotAt(e, 125, 110)!.id, 1); assert.equal(lotAt(e, 145, 112)!.id, 3);
  assert.equal(lotAt(e, 125, 125), null, 'behind the lot'); assert.equal(lotAt(e, 125, 101), null, 'on the street side of the verge');
  assert.equal(lotAt(e, 165, 110), null); assert.equal(lotAt(newEstate(0), 125, 110), null);
  removeLot(e, 1); assert.equal(lotAt(e, 125, 110), null, 'the lookup follows the estate\'s changes');
});

test('save and load: every lot comes back as it was; a bad record is dropped', () => {
  const e = estate3(); stepEstate(e, 2.2, stepEnv()); stepEstate(e, 3.1, stepEnv({ demand: 3 }));
  e.lots[0]!.member = true;
  const saved = JSON.parse(JSON.stringify(encodeEstate(e)));
  const back = normalizeEstate(saved)!;
  assert.deepEqual(encodeEstate(back), encodeEstate(e));
  assert.equal(back.next, e.next); assert.equal(back.t, e.t); assert.equal(back.lots.length, 3);
  for (const [i, l] of e.lots.entries()) {
    const b = back.lots[i]!;
    assert.deepEqual([b.id, b.st, b.w, b.d, b.price, b.member ?? false], [l.id, l.st, l.w, l.d, l.price, l.member ?? false]);
    assert.ok(Math.abs(b.o.x - l.o.x) < 1e-3 && Math.abs(b.o.y - l.o.y) < 1e-3 && Math.abs(b.u.x - l.u.x) < 1e-4 && Math.abs(b.n.y - l.n.y) < 1e-4);
    assert.equal(b.seed, l.seed); assert.ok(Math.abs(b.at - l.at) < 1e-3);
    assert.equal(Number.isFinite(b.after), Number.isFinite(l.after));
  }
  // the stages carry on after a load: the same clock gives the same houses
  const e2 = normalizeEstate(JSON.parse(JSON.stringify(encodeEstate(e))))!;
  stepEstate(e, 40, stepEnv()); stepEstate(e2, 40, stepEnv());
  assert.deepEqual(e2.lots.map(l => l.st), e.lots.map(l => l.st));
  assert.deepEqual(encodeEstate(e2)!.lots.map(t => t[9]), [3, 3, 3]);
  // nothing laid: nothing saved; junk: null
  assert.equal(encodeEstate(newEstate(3)), undefined); assert.equal(encodeEstate(null), undefined);
  assert.equal(normalizeEstate(undefined), null); assert.equal(normalizeEstate({}), null); assert.equal(normalizeEstate({ lots: [] }), null); assert.equal(normalizeEstate('x'), null);
  const bad = JSON.parse(JSON.stringify(encodeEstate(estate3())));
  bad.lots[0][0] = 2; // a duplicate id with the second lot
  bad.lots[2][3] = 3; // a frame that is not a unit vector
  bad.lots.push([9, 1, 2]); // short
  bad.lots.push([9, 1, 2, 1, 0, 0, 1, 10, 15, 7, 0, 0, 1, 1, 0]); // a stage that does not exist
  const fixed = normalizeEstate(bad)!;
  assert.deepEqual(fixed.lots.map(l => l.id), [2], 'only the second lot is whole');
  assert.equal(fixed.next, 4, 'the next id stays past every id ever given');
  // a sold lot saved with no end time gets one, so it still finishes
  const mid = estate3(); stepEstate(mid, 1.2, stepEnv({ ask: () => 12000 }));
  const sv = JSON.parse(JSON.stringify(encodeEstate(mid))); for (const t of sv.lots) if (t[9] === ST.SOLD) t[11] = -1;
  const m2 = normalizeEstate(sv)!;
  for (const l of m2.lots) if (l.st === ST.SOLD) assert.ok(Number.isFinite(l.after));
});

test('a ball that lands on a lot is out of bounds: the played course reads the lots', () => {
  const e = estate3(), onLot = (x: number, y: number) => !!lotAt(e, x, y);
  // one hole with a line well away from the lots, its fairway painted
  const areas = [{ id: 1, surface: 'fairway' as const, pts: [100, 130, 200, 130, 200, 140, 100, 140] }, { id: 2, surface: 'tee' as const, pts: [96, 130, 100, 130, 100, 140, 96, 140] }, { id: 3, surface: 'green' as const, pts: [200, 130, 206, 130, 206, 140, 200, 140] }];
  const tees = [{ hole: 1, x: 98, y: 135, kind: 'back' as const }], pins = [{ hole: 1, x: 203, y: 135 }];
  const holes = deriveHoles(areas, tees, pins, []);
  const surfAt = (x: number, y: number) => (y >= 130 && y <= 140 && x >= 96 && x <= 206 ? ('fairway' as const) : null);
  const plain = makeCourseView(holes, surfAt), withLots = makeCourseView(holes, surfAt, onLot);
  // a point on a lot: unpainted ground within 40 tiles of the played line is rough, and with the lots it is out of bounds
  assert.equal(plain.lieAt(125, 110), 'rough');
  assert.equal(withLots.lieAt(125, 110), 'out'); assert.equal(withLots.kindAt!(125, 110), 'out');
  // everywhere else the lie is as it was
  assert.equal(withLots.lieAt(125, 125), 'rough'); assert.equal(withLots.lieAt(125, 135), 'fairway'); assert.equal(withLots.kindAt!(125, 135), plain.kindAt!(125, 135));
  assert.equal(withLots.lieAt(125, 108), 'out', 'a lot for sale is out of bounds too');
  // a lot laid over painted ground still reads out (the check comes first)
  assert.equal(makeCourseView(holes, () => 'fairway', () => true).lieAt(1, 1), 'out');
  assert.equal(makeCourseView(holes, surfAt, undefined).lieAt(125, 110), 'rough', 'no lots given: as before');
});

test('the golf save carries the estate: well-formed lots stay in it, a save with none or with junk has none', () => {
  const e = estate3(); stepEstate(e, 2.2, stepEnv());
  const base = { v: 1 as const, tier: 1, rep: 30, town: P(500, 500), course: [400, 400, 100, 100] as [number, number, number, number], parcel: [400, 400, 100, 100] as [number, number, number, number], dir: 0 as const, tees: [], pins: [], aims: [], clubhouse: P(450, 450) };
  const g = normalizeGolfSave({ ...base, estate: JSON.parse(JSON.stringify(encodeEstate(e))) })!;
  assert.ok(g.estate, 'the lots stay in the golf save');
  assert.deepEqual(normalizeEstate(g.estate)!.lots.map(l => [l.id, l.st]), e.lots.map(l => [l.id, l.st]));
  assert.equal(normalizeGolfSave({ ...base })!.estate, undefined, 'a save from before has none');
  assert.equal(normalizeGolfSave({ ...base, estate: { v: 1, next: 1, t: 0, market: 0, lots: [[1, 2]] } as never })!.estate, undefined, 'junk lots: none');
});

test('an estate with no lots has no clock to speak of: its first lot starts it, so no buyers come for the months before it was laid', () => {
  const e = newEstate(2); e.market = 1.4;
  placeLots(e, { segs: [STREET], from: P(125, 110), to: P(125.2, 110) }, env(), 7);
  assert.equal(e.lots.length, 1); assert.equal(e.t, 7); assert.equal(e.market, START_MARKET);
  assert.equal(stepEstate(e, 7.1, stepEnv()).sold.length, 0, 'a tenth of a month after it was laid, the lot is still for sale');
  // a second row laid later keeps the clock the first started
  placeLots(e, { segs: [STREET], from: P(145, 110), to: P(145.2, 110) }, env(), 7.3);
  assert.equal(e.t, 7.1);
});

test('cellsUnder: the painted cells whose centres lie in a lot (the engine clears them when the lot is laid, so its own ground shows)', () => {
  const g = grid(), f = lotK(12); // x 120..130, y 102.65..117.65
  assert.deepEqual(cellsUnder(f, g), [], 'bare ground has none');
  paintDisc(g, 125, 110, 2, SURF.rough, 1, 0); // inside the lot
  paintDisc(g, 140, 110, 2, SURF.rough, 1, 0); // beside it
  const under = cellsUnder(f, g);
  assert.ok(under.length > 20, `${under.length} cells under the lot`);
  for (const i of under) { const cx = i % g.w, cy = (i - cx) / g.w; assert.ok(inLot(f, g.x0 + (cx + 0.5) * CELL_T, g.y0 + (cy + 0.5) * CELL_T)); assert.equal(g.surf[i], SURF.rough); }
  assert.equal(cellsUnder(f, null).length, 0, 'no course, no cells');
  const d = paintCells(g, under, under.length, SURF.none, 0, 0, { carve: true });
  assert.equal(d.n, under.length);
  assert.deepEqual(cellsUnder(f, g), [], 'nothing painted is left under the lot');
  assert.equal(g.surf[cellAt(g, 140, 110)], SURF.rough, 'the rough beside it is as it was');
});

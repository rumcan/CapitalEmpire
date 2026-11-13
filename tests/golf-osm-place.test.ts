// T356 (#998): placing a real course into a game under way: the turn of a spec (hole order, lengths and pars unchanged, the bounds turn), the cover that
// is the land bought, and the plan of a pose (the cost sum, the demolish list, the lots left with no road, can't afford, the refusals). Pure: no DOM.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import rondeboschJson from '../src/game/golf/osm/data/rondebosch.json';
import magnoliaJson from '../src/game/golf/osm/data/magnolia-national.json';
import { osmCourseToSpec } from '../src/game/golf/osm';
import type { OsmCourseJson, OsmCourseSpec } from '../src/game/golf/osm/types';
import { ROT_STEP, boundsOf, coverStrips, inConvex, inRects, measuredLengthM, normDeg, outlineAt, originFor, rectsArea, rotateSpec, snapDeg, turnedSize } from '../src/game/golf/osm/rotate';
import { NOTE, PLACE_EDGE, RIVER_RULE, TOWN_KEEP, cutSpan, goesPhrase, money, placeLabel, planPlace, popupText, priceLines, unionArea, type PlaceLot, type PlaceSeg, type PlaceSpec, type PlaceWorld } from '../src/game/golf/osm/place';
import { compensation } from '../src/game/budget';
import { LAND_PRICE_SQM } from '../src/game/golf/parcels';
import { paintSpec } from '../src/game/golf/osm/raster';
import { makeGrid } from '../src/game/ext/course-grid';
import type { Rect } from '../src/game/golf/mode';

const ronde = osmCourseToSpec(rondeboschJson as unknown as OsmCourseJson, { id: 'rondebosch', name: 'Rondebosch Golf Course' });
const magnolia = osmCourseToSpec(magnoliaJson as unknown as OsmCourseJson, { id: 'magnolia-national', name: 'Magnolia National' });

/** the signed area of a flat ring (shoelace): the sign says its winding, which a mirror would flip */
function ringArea(r: readonly number[]): number { let a = 0; for (let i = 0, n = r.length >> 1; i < n; i++) { const j = (i + 1) % n; a += r[2 * i]! * r[2 * j + 1]! - r[2 * j]! * r[2 * i + 1]!; } return a / 2; }
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

describe('turning a spec (T356)', () => {
  it('keeps the holes: their order, numbers, pars, lengths, handicaps and what was made up; only the tiles turn', () => {
    for (const spec of [ronde, magnolia]) for (const deg of [15, 30, 45, 90, 135, 180, 270, 345]) {
      const r = rotateSpec(spec, deg);
      assert.equal(r.holes.length, spec.holes.length);
      r.holes.forEach((h, i) => {
        const o = spec.holes[i]!;
        assert.equal(h.n, o.n, `${spec.id} ${deg}: hole order`);
        assert.deepEqual([h.ref, h.par, h.tagPar, h.gamePar, h.lengthM, h.handicap], [o.ref, o.par, o.tagPar, o.gamePar, o.lengthM, o.handicap], `${spec.id} ${deg}: hole ${h.n}'s numbers`);
        assert.deepEqual(h.tees.map(t => t.kind), o.tees.map(t => t.kind));
        assert.deepEqual(h.made, o.made);
        assert.equal(h.aims.length, o.aims.length);
      });
      assert.equal(r.lengthM, spec.lengthM);
      assert.equal(r.parTotal, spec.parTotal);
      assert.equal(r.gameParTotal, spec.gameParTotal);
      assert.equal(r.id, spec.id);
      assert.equal(r.rot, deg);
    }
  });

  it('keeps the lengths in the tiles too: tee to pin along the aim points measures the same after a turn (to the rounding of the tiles)', () => {
    const base = measuredLengthM(ronde);
    for (const deg of [15, 45, 100, 200]) assert.ok(near(measuredLengthM(rotateSpec(ronde, deg)), base, base * 1e-4), `${deg}°`);
    // a pin stays as far from its tee as it was
    for (const h of rotateSpec(ronde, 60).holes) {
      const o = ronde.holes[h.n - 1]!, t = h.tees[0]!, t0 = o.tees[0]!;
      assert.ok(near(Math.hypot(h.pin.x - t.x, h.pin.y - t.y), Math.hypot(o.pin.x - t0.x, o.pin.y - t0.y), 1e-2), `hole ${h.n}`);
    }
  });

  it('turns the bounds: the frame becomes the box round the turned land, a quarter turn swaps its sides, a half turn keeps them', () => {
    const q = rotateSpec(ronde, 90), h = rotateSpec(ronde, 180), t = rotateSpec(ronde, 45);
    assert.deepEqual([q.w, q.h], [ronde.h, ronde.w], 'a quarter turn');
    assert.deepEqual([h.w, h.h], [ronde.w, ronde.h], 'a half turn');
    const sz = turnedSize(ronde.w, ronde.h, 45);
    assert.deepEqual([t.w, t.h], [sz.w, sz.h]);
    assert.ok(t.w > ronde.w && t.w > ronde.h, 'the box round a land turned 45 degrees is wider than either of its sides');
    // the turned land is an oriented rectangle of the same area, inside the frame
    assert.equal(t.outline!.length, 8);
    assert.ok(near(Math.abs(ringArea(t.outline!)), ronde.w * ronde.h, 1), 'the same area');
    for (let i = 0; i < 8; i += 2) assert.ok(t.outline![i]! >= -1e-6 && t.outline![i]! <= t.w + 1e-6 && t.outline![i + 1]! >= -1e-6 && t.outline![i + 1]! <= t.h + 1e-6, 'the outline is inside the frame');
    // every pin and every ring point of the course lies inside the turned land
    for (const hole of t.holes) assert.ok(inConvex(t.outline!, hole.pin.x, hole.pin.y), `hole ${hole.n}'s pin is on the land`);
    for (const a of t.areas) if (a.surf === 'green') for (const ring of a.rings) for (let i = 0; i < ring.length; i += 2) assert.ok(inConvex(t.outline!, ring[i]!, ring[i + 1]!), 'a green is on the land');
  });

  it('is never a mirror: every ring winds the way it did', () => {
    const t = rotateSpec(magnolia, 75);
    magnolia.areas.forEach((a, i) => a.rings.forEach((ring, k) => {
      const was = ringArea(ring), now = ringArea(t.areas[i]!.rings[k]!);
      assert.ok(Math.sign(was) === Math.sign(now) || Math.abs(was) < 1e-6, 'winding');
      assert.ok(near(Math.abs(now), Math.abs(was), Math.max(1e-3, Math.abs(was) * 1e-3)), 'area');
    }));
    // a point east of another stays on its left when facing north: turn a hole line by 90 and the cross product's sign is the same
    const l0 = magnolia.holes[0]!.line, l1 = rotateSpec(magnolia, 90).holes[0]!.line;
    const cross = (l: number[]) => (l[2]! - l[0]!) * (l[5]! - l[3]!) - (l[3]! - l[1]!) * (l[4]! - l[2]!);
    if (l0.length >= 6) assert.equal(Math.sign(cross(l1)), Math.sign(cross(l0)));
  });

  it('gives the spec itself for no turn and for a full one, and turns on from a turned spec (15 and 15 is 30)', () => {
    assert.equal(rotateSpec(ronde, 0), ronde);
    assert.equal(rotateSpec(ronde, 360), ronde);
    const a = rotateSpec(rotateSpec(ronde, 15), 15), b = rotateSpec(ronde, 30);
    assert.deepEqual([a.w, a.h, a.rot], [b.w, b.h, 30]);
    a.holes.forEach((h, i) => { assert.ok(near(h.pin.x, b.holes[i]!.pin.x, 2e-3) && near(h.pin.y, b.holes[i]!.pin.y, 2e-3), `hole ${h.n}`); });
  });

  it('is deterministic and leaves the spec it was given alone', () => {
    const before = JSON.stringify(ronde);
    const a = rotateSpec(ronde, 15), b = rotateSpec(ronde, 15);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(ronde), before);
  });

  it('lays the same course on the grid: the surfaces painted turned cover the same ground to within the rim of the rasteriser', () => {
    const count = (spec: OsmCourseSpec) => {
      const g = makeGrid(0, 0, (spec.w + 8) * 2, (spec.h + 8) * 2);
      return paintSpec(g, spec, 4, 4);
    };
    const was = count(ronde), now = count(rotateSpec(ronde, 90));
    for (const k of ['fairway', 'green', 'bunker', 'water', 'tee', 'rough'] as const) assert.ok(near(now[k], was[k], Math.max(40, was[k] * 0.01)), `${k}: ${was[k]} cells, turned ${now[k]}`);
  });

  it('snaps angles to the step, whole turn to zero', () => {
    assert.equal(snapDeg(7), 0); assert.equal(snapDeg(8), ROT_STEP); assert.equal(snapDeg(359), 0); assert.equal(snapDeg(-14), 345);
    assert.equal(normDeg(375), 15); assert.equal(normDeg(-90), 270); assert.equal(normDeg(360), 0);
  });
});

describe('the cover of the turned land (T356)', () => {
  it('is one rectangle, exactly the land, when its sides run along the axes', () => {
    const o = outlineAt({ w: 100, h: 50 }, 30, 40);
    assert.deepEqual(coverStrips(o), [[30, 40, 100, 50]]);
    const q = outlineAt(rotateSpec(ronde, 90), 100, 200);
    assert.deepEqual(coverStrips(q), [[100, 200, ronde.h, ronde.w]]);
  });

  it('is a few strips for a turned land: at most the limit, disjoint, covering all of it, and not much more', () => {
    for (const deg of [15, 30, 45, 60, 75, 100, 200]) {
      const r = rotateSpec(ronde, deg), o = outlineAt(r, 50, 60), cover = coverStrips(o);
      assert.ok(cover.length >= 1 && cover.length <= 18, `${deg}°: ${cover.length} rects`);
      assert.ok(unionArea(cover) === rectsArea(cover), 'the strips do not overlap');
      // every point of the land (a lattice through the oriented rectangle) is in the cover
      const b = boundsOf(cover)!;
      for (let y = b[1]; y < b[1] + b[3]; y += 7) for (let x = b[0]; x < b[0] + b[2]; x += 7) if (inConvex(o, x, y)) assert.ok(inRects(cover, x, y), `${deg}°: (${x}, ${y}) is land but not covered`);
      assert.ok(rectsArea(cover) >= ronde.w * ronde.h - 2, 'it covers at least the land');
      assert.ok(rectsArea(cover) <= b[2] * b[3] + 1, 'and no more than the box round it');
    }
  });
});

// ---- the plan of a pose ----
const STREET = { id: 'street', h: 2, walk: 2 }, CART = { id: 'cart-slab', h: 1, walk: 0.5 };
const lot = (key: string, x: number, y: number, over: Partial<PlaceLot> = {}): PlaceLot => ({ key, o: [x, y], u: [1, 0], n: [0, 1], w: 10, d: 15, use: 1, level: 2, decline: 0, ...over });
const seg = (ax: number, ay: number, bx: number, by: number, cls = STREET, kind = 0): PlaceSeg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, cls, kind });
function world(over: Partial<PlaceWorld> & { lots?: PlaceLot[]; segs?: PlaceSeg[] } = {}): PlaceWorld {
  const lots = over.lots ?? [], segs = over.segs ?? [];
  return {
    map: 1024, owned: [], river: () => false, lots, farms: [], segs, pop: 0, townCentre: null, entries: [], targets: [], keep: [], money: 1e12, roundLive: false,
    segsNear: (x, y, r) => segs.filter(s => Math.min(s.a.x, s.b.x) - r <= x && x <= Math.max(s.a.x, s.b.x) + r && Math.min(s.a.y, s.b.y) - r <= y && y <= Math.max(s.a.y, s.b.y) + r),
    isCourseRoad: s => s.cls.id.startsWith('cart'), valuePerTile: () => 10, compensation: l => compensation(l),
    ...over,
  } as PlaceWorld;
}
/** a 100 x 50 tile land, unturned, with its middle at (500, 500): it covers [450, 475, 100, 50] */
const LAND = { w: 100, h: 50 };
const AT = { x: 500, y: 500, deg: 0 };
const COVER: Rect = [450, 475, 100, 50];

describe('the cost of a pose (T356)', () => {
  it('is the land at the open rate, the demolition and the build, summed: an empty plain costs its area times the rate', () => {
    const p = planPlace(world(), LAND, AT, 12345);
    assert.deepEqual(p.cover, [COVER]);
    assert.equal(p.land.tiles, 5000);
    assert.equal(p.land.price, Math.round(5000 * 4 * LAND_PRICE_SQM.open), 'tiles x 4 m2 x $1.25');
    assert.equal(p.land.price, 25000);
    assert.equal(p.land.ha, 2);
    assert.equal(p.demolish, 0);
    assert.equal(p.build, 12345);
    assert.equal(p.total, 25000 + 12345);
    assert.equal(p.why, '');
    assert.ok(p.ok && p.affordable);
    assert.equal(p.short, 0);
  });

  it('charges only the land that is not yours: owned land inside the cover is not bought again', () => {
    const p = planPlace(world({ owned: [[450, 475, 100, 25]] }), LAND, AT, 0);
    assert.equal(p.land.tiles, 2500);
    assert.equal(p.land.mine, 2500);
    assert.equal(p.land.price, 12500);
    // two overlapping rects of yours are not counted twice
    const q = planPlace(world({ owned: [[450, 475, 100, 25], [480, 480, 40, 40]] }), LAND, AT, 0);
    assert.equal(q.land.mine, 2500 + 40 * 20, 'the union of what you own inside the cover');
    assert.equal(q.land.price, Math.round((5000 - q.land.mine) * 4 * 1.25));
    assert.equal(unionArea([[0, 0, 10, 10], [5, 5, 10, 10]]), 175);
  });

  it('prices each 40-tile block by its class: a block with houses is town land, with a shop commercial, with works industrial, a farm farm land', () => {
    // the cover lies in blocks x 440..560 (11 to 13), y 440..520 (11 to 13): put a shop in one, works in another, homes in a third, a farm in a fourth
    const lots = [lot('s', 455, 480, { use: 2 }), lot('w', 495, 480, { use: 3 }), lot('h', 535, 480, { use: 1 })];
    const p = planPlace(world({ lots, farms: [{ x: 470, y: 520 }] }), LAND, AT, 0);
    const rate = (r: Rect, c: keyof typeof LAND_PRICE_SQM) => r[2] * r[3] * 4 * LAND_PRICE_SQM[c];
    // blocks: x 440-480 (cover from 450), 480-520, 520-560 (to 550); y 440-480 (cover from 475), 480-520 (to 520 ... the cover ends at 525), 520-560
    const expect = rate([450, 475, 30, 5], 'open') + rate([450, 480, 30, 40], 'commercial') + rate([450, 520, 30, 5], 'farm')
      + rate([480, 475, 40, 5], 'open') + rate([480, 480, 40, 40], 'industrial') + rate([480, 520, 40, 5], 'open')
      + rate([520, 475, 30, 5], 'open') + rate([520, 480, 30, 40], 'town') + rate([520, 520, 30, 5], 'open');
    assert.equal(p.land.price, Math.round(expect));
    assert.equal(p.land.tiles, 5000);
  });

  it('adds the town’s growth: 5% for each thousand people above the first thousand', () => {
    const p = planPlace(world({ pop: 3000 }), LAND, AT, 0);
    assert.equal(p.land.price, Math.round(25000 * 1.1));
    assert.equal(planPlace(world({ pop: 800 }), LAND, AT, 0).land.price, 25000);
  });

  it('puts the compensation of the buildings it takes, the roads’ value and the build price into the total', () => {
    const lots = [lot('a', 460, 480), lot('b', 480, 480, { level: 3 }), lot('c', 500, 480, { use: 2 }), lot('d', 520, 480, { level: 1 })];
    const segs = [seg(440, 490, 560, 490)]; // a road across the cover: 100 tiles inside
    const w = world({ lots, segs, valuePerTile: () => 12 });
    const p = planPlace(w, LAND, AT, 1000);
    const comp = lots.reduce((s, l) => s + compensation(l), 0);
    assert.equal(p.lots.comp, comp);
    assert.equal(p.roads.value, 1200);
    assert.equal(p.roads.m, 200, '100 tiles of 2 m');
    assert.equal(p.demolish, comp + 1200);
    assert.equal(p.total, p.land.price + comp + 1200 + 1000);
  });
});

describe('what goes (T356)', () => {
  it('lists the built lots under the cover by use, and leaves empty lots and lots outside alone', () => {
    const lots = [lot('h1', 460, 480), lot('h2', 470, 480), lot('shop', 480, 480, { use: 2 }), lot('works', 490, 480, { use: 3 }), lot('hall', 500, 480, { use: 5 }),
      lot('empty', 510, 480, { level: 0 }), lot('far', 700, 480), lot('edge', 549, 480)];
    const p = planPlace(world({ lots }), LAND, AT, 0);
    assert.deepEqual([p.lots.houses, p.lots.shops, p.lots.works, p.lots.others], [3, 1, 1, 1], 'the lot on the cover’s edge, sticking out by 9 tiles, goes with it');
    assert.ok(!p.lots.keys.includes('empty') && !p.lots.keys.includes('far'));
    assert.equal(goesPhrase(p), '3 houses, 1 shop, 1 works and 1 other building');
  });

  it('counts the road across it in metres and splits what it cuts: the club’s own paths are free', () => {
    const segs = [seg(400, 500, 600, 500), seg(460, 400, 460, 600), seg(460, 480, 540, 480, CART), seg(600, 400, 600, 600)];
    const p = planPlace(world({ segs, valuePerTile: () => 5 }), LAND, AT, 0);
    assert.equal(p.roads.segs, 2);
    assert.equal(p.roads.m, Math.round((100 + 50) * 2), 'the two public roads');
    assert.equal(p.roads.value, (100 + 50) * 5);
    assert.deepEqual([p.roads.ownSegs, p.roads.ownM], [1, 160], 'the cart path is the club’s own');
    assert.match(goesPhrase(p), /300 m of road/);
    // a tunnel runs under the land
    const t = planPlace(world({ segs: [seg(400, 500, 600, 500, STREET, 2)] }), LAND, AT, 0);
    assert.equal(t.roads.segs, 0);
  });

  it('cuts a road back from the cover’s edge by the dead end’s turning circle and verge, so the end it leaves keeps off the course', () => {
    const w = world({ segs: [seg(400, 500, 600, 500), seg(500, 400, 500, 478)], endMargin: () => 3, valuePerTile: () => 10 });
    const p = planPlace(w, LAND, AT, 0);
    // the first road: 100 tiles inside the cover (x 450..550) and 3 more at each end; the second ends 3 tiles inside the cover’s top (y 475): 3 + 3 tiles of it go
    assert.equal(p.roads.m, (106 + 6) * 2, 'metres of road taken: 106 and 6 tiles');
    assert.equal(p.roads.value, (106 + 6) * 10);
    const sp = cutSpan([COVER], seg(400, 500, 600, 500), 3)!;
    assert.ok(Math.abs(sp[0] - 47 / 200) < 1e-9 && Math.abs(sp[1] - 153 / 200) < 1e-9, `${sp}`);
    assert.deepEqual(cutSpan([COVER], seg(445, 500, 452, 500), 10), [0, 1], 'never past the piece’s own ends');
    assert.equal(cutSpan([COVER], seg(300, 300, 400, 300), 3), null, 'a road far from the cover is not cut');
    assert.equal(cutSpan([COVER], seg(450, 450, 450, 474), 3), null, 'nor one that stops short of it, its margin or not');
  });

  it('clears a lot whose road the course takes (it stands outside the cover, its street does not), and counts it with its compensation', () => {
    // a lane runs north-south at x 452, wholly inside the cover (x 450..550, y 475..525); a lot west of the cover fronts it: its front is on the lane’s verge
    const lane = [seg(452, 480, 452, 520)];
    const lone = lot('lone', 439, 490, { o: [448, 490], u: [0, 1], n: [-1, 0], w: 10, d: 9 });
    const p = planPlace(world({ lots: [lone], segs: lane }), LAND, AT, 0);
    assert.deepEqual(p.lots.keys, [], 'the lot stands outside the cover');
    assert.deepEqual(p.orphans.keys, ['lone'], 'but the lane it fronts is gone');
    assert.equal(p.orphans.houses, 1);
    assert.equal(p.orphans.comp, compensation(lone));
    assert.equal(p.demolish, compensation(lone) + p.roads.value);
    assert.match(popupText(p), /1 building left with no road or no way out is cleared too/);
    assert.match(goesPhrase(p), /1 house/);
    assert.equal(p.total, p.land.price + compensation(lone) + p.roads.value);
  });

  it('keeps a lot the road beyond the cover still serves: the pieces of a cut street on either side of the cover stay', () => {
    // the lane runs on past the cover, north to y 400 and south to y 600: only y 475..525 goes
    const lane = [seg(452, 400, 452, 600)];
    const north = lot('north', 439, 450, { o: [448, 450], u: [0, 1], n: [-1, 0], w: 10, d: 9 }); // front at (448, 455): the north stub, 20 tiles of it, passes
    const south = lot('south', 439, 540, { o: [448, 540], u: [0, 1], n: [-1, 0], w: 10, d: 9 });
    const middle = lot('middle', 439, 495, { o: [448, 495], u: [0, 1], n: [-1, 0], w: 10, d: 9 }); // front at (448, 500): in the cut stretch
    const p = planPlace(world({ lots: [north, south, middle], segs: lane }), LAND, AT, 0);
    assert.deepEqual(p.orphans.keys, ['middle'], 'only the lot in front of the cut stretch loses its road');
    assert.equal(p.roads.m, 100, '50 tiles of 2 m');
  });

  it('clears the lots a cut leaves with no way to the county road, and keeps those that still have one', () => {
    // the county road from the west edge (0, 500) east through the cover (x 450..550) to the town at (800, 500): R1 (0..300), R2 (300..700) cut, R3 (700..800)
    const segs = [seg(0, 500, 300, 500), seg(300, 500, 700, 500), seg(700, 500, 800, 500)];
    const west = lot('west', 100, 505, { o: [100, 504], u: [1, 0], n: [0, 1], w: 10, d: 15 }); // beside R1
    const east = lot('east', 740, 505, { o: [740, 504], u: [1, 0], n: [0, 1], w: 10, d: 15 }); // beside R3: cut off by the cover
    const p = planPlace(world({ lots: [west, east], segs, entries: [{ x: 0, y: 500 }] }), LAND, AT, 0);
    assert.deepEqual(p.orphans.keys, ['east']);
    assert.equal(p.why, '', 'no target is named: nothing is refused');
  });

  it('allows a cut that leaves the town’s centre or the clubhouse with no way to the county road, warning of it in the bar, and says nothing when another road joins them (T444)', () => {
    const segs = [seg(0, 500, 300, 500), seg(300, 500, 700, 500), seg(700, 500, 800, 500), seg(700, 500, 700, 600)];
    const targets = [{ name: 'the town', x: 800, y: 500 }];
    const p = planPlace(world({ segs, entries: [{ x: 0, y: 500 }], targets }), LAND, AT, 0);
    assert.equal(p.why, '');
    assert.ok(p.ok);
    assert.deepEqual(p.over.cutOff, ['the town']);
    assert.deepEqual(p.over.warn, ['The town loses its road link to the county road']);
    assert.match(placeLabel(p, 'Rondebosch').text, /click to place · ⚠ The town loses its road link to the county road$/);
    assert.match(popupText(p), /The town loses its road link to the county road\.$/);
    // a way round: from the entry south and east to the town’s branch
    const around = [...segs, seg(0, 500, 0, 700), seg(0, 700, 700, 700), seg(700, 700, 700, 600)];
    const q = planPlace(world({ segs: around, entries: [{ x: 0, y: 500 }], targets }), LAND, AT, 0);
    assert.deepEqual(q.over.warn, []);
    assert.ok(!placeLabel(q, 'x').text.includes('⚠'));
    // a target nothing reached before is not the course’s doing
    const lonely = planPlace(world({ segs, entries: [{ x: 0, y: 500 }], targets: [{ name: 'the farm', x: 500, y: 900 }] }), LAND, AT, 0);
    assert.deepEqual(lonely.over.cutOff, []);
  });

  it('says what it does in the pop-up: the hectares, the buildings, the road and the price', () => {
    const lots = [lot('a', 460, 480), lot('b', 470, 480), lot('c', 480, 480, { use: 2 })];
    const p = planPlace(world({ lots, segs: [seg(400, 500, 600, 500)] }), LAND, AT, 40000);
    const t = popupText(p);
    assert.match(t, /^This will buy 2 ha, demolish 2 houses, 1 shop and 200 m of road \(\$/);
    assert.match(t, /end at its boundary/);
    assert.ok(t.includes(money(p.total)));
    const lines = priceLines(p);
    assert.equal(lines.reduce((s, l) => s + l.amount, 0), p.total, 'the lines add up to the total');
    assert.deepEqual(lines.map(l => l.label.split(' ·')[0]), ['Land', 'Buildings bought out', 'Roads taken', 'The course laid']);
  });
});

describe('red: can’t afford it, or can’t go there (T356)', () => {
  it('is red when the money is short, with the shortfall, and green when it holds', () => {
    const base = planPlace(world(), LAND, AT, 10000), cost = base.total;
    const short = planPlace(world({ money: cost - 1 }), LAND, AT, 10000);
    assert.equal(short.affordable, false);
    assert.equal(short.ok, false);
    assert.equal(short.short, 1);
    assert.equal(short.why, '', 'nothing is wrong with the place: only the money');
    const l = placeLabel(short, 'Rondebosch');
    assert.ok(l.bad);
    assert.match(l.text, /^Not enough money: \$35,000 \(short \$1\)$/);
    const ok = planPlace(world({ money: cost }), LAND, AT, 10000);
    assert.ok(ok.ok);
    const g = placeLabel(ok, 'Rondebosch');
    assert.ok(!g.bad);
    assert.equal(g.text, 'Rondebosch · $35,000 · click to place');
  });

  it('is red off the map, and when the land lies within a few tiles of the edge', () => {
    for (const at of [{ x: 40, y: 500 }, { x: 1000, y: 500 }, { x: 500, y: 10 }, { x: 500, y: 1010 }]) {
      const p = planPlace(world(), LAND, { ...at, deg: 0 }, 0);
      assert.equal(p.fits, false, JSON.stringify(at));
      assert.equal(p.whyKind, 'map');
      assert.equal(p.ok, false);
    }
    const edge = planPlace(world(), LAND, { x: 50 + PLACE_EDGE, y: 500, deg: 0 }, 0);
    assert.equal(edge.fits, true, 'a land that just touches the margin fits');
    assert.equal(planPlace(world(), LAND, { x: 50 + PLACE_EDGE - 1, y: 500, deg: 0 }, 0).fits, false);
    // a turned land: the box round it must fit
    const t = rotateSpec(ronde, 45);
    assert.equal(planPlace(world(), t, { x: 512, y: 512, deg: 45 }, 0).fits, true);
    assert.equal(planPlace(world(), t, { x: 300, y: 512, deg: 45 }, 0).fits, false);
  });

  it('is red only off the map and during a tournament: over the river, the club’s own buildings and the town’s centre it goes, and says so (T444)', () => {
    const river = planPlace(world({ river: (x, y) => x >= 519 && x <= 525 && y >= 490 && y <= 510 }), LAND, AT, 0);
    assert.equal(river.whyKind, ''); assert.ok(river.ok);
    assert.equal(river.over.river, NOTE.river);
    assert.equal(planPlace(world({ river: (x) => x > 560 }), LAND, AT, 0).over.river, '', 'a river beside it is no matter');
    const ref = { id: 7 };
    const club = planPlace(world({ keep: [{ name: 'clubhouse', rect: [540, 480, 20, 20], refund: 60000, ref }, { name: 'car park', rect: [700, 480, 20, 20], refund: 5000 }] }), LAND, AT, 0);
    assert.equal(club.whyKind, ''); assert.ok(club.ok);
    assert.deepEqual(club.over.club, [{ name: 'clubhouse', refund: 60000, ref }], 'only the one under the land, with the game’s handle on it');
    assert.equal(club.over.refund, 60000);
    assert.ok(club.over.notes.includes('Your clubhouse is cleared ($60,000 back)'));
    const bare = planPlace(world(), LAND, AT, 0);
    assert.equal(club.total, bare.total - 60000, 'its value comes off the price');
    assert.equal(priceLines(club).reduce((s, l) => s + l.amount, 0), club.total, 'the lines still add up, the refund as a minus line');
    assert.deepEqual(planPlace(world({ keep: [{ name: 'clubhouse', rect: [550, 480, 20, 20] }] }), LAND, AT, 0).over.club, [], 'a clubhouse that touches the edge is not under it');
    const town = planPlace(world({ townCentre: { x: 550 + TOWN_KEEP - 1, y: 500 } }), LAND, AT, 0);
    assert.equal(town.whyKind, ''); assert.ok(town.over.town);
    assert.ok(town.over.notes.includes(NOTE.town));
    assert.equal(planPlace(world({ townCentre: { x: 550 + TOWN_KEEP + 1, y: 500 } }), LAND, AT, 0).over.town, false);
    assert.equal(planPlace(world({ roundLive: true }), LAND, AT, 0).whyKind, 'round');
  });

  it('lets a river cross the course, refusing only where it lies on a tee, a green or a pin or along a hole (the river rule), and the whole cover when the spec has no holes to read', () => {
    assert.equal(RIVER_RULE, 'features');
    // a hole: the tee at spec (10..14, 20..24), the green at (80..90, 20..30), the line between (12, 22) and (85, 25); the land is 100 x 50 at (450, 475)
    const spec = {
      w: 100, h: 50,
      areas: [{ surf: 'tee', hole: 1, rings: [[10, 20, 14, 20, 14, 24, 10, 24]] }, { surf: 'green', hole: 1, rings: [[80, 20, 90, 20, 90, 30, 80, 30]] }, { surf: 'fairway', hole: 1, rings: [[15, 15, 75, 15, 75, 35, 15, 35]] }],
      holes: [{ n: 1, tees: [{ kind: 'middle', x: 12, y: 22 }], pin: { x: 85, y: 25 }, aims: [], line: [12, 22, 85, 25] }],
    } as unknown as PlaceSpec;
    const at = (river: (x: number, y: number) => boolean) => planPlace(world({ river }), spec, AT, 0);
    // a stream across the middle of the fairway, between the tee and the green: allowed (the course is laid round it)
    const across = at(x => x >= 520 && x < 523);
    assert.equal(across.whyKind, '', across.why); assert.ok(across.ok);
    assert.equal(across.over.river, NOTE.river, 'a stream across the fairway is said once');
    // the river over the green, over the tee: allowed (T444), naming the hole
    assert.equal(at(x => x >= 534 && x < 537).over.river, "The river runs over hole 1's green: it stays, as water on the hole");
    assert.ok(at(x => x >= 534 && x < 537).ok);
    assert.equal(at(x => x >= 460 && x < 463).over.river, "The river runs over hole 1's tee: it stays, as water on the hole");
    // the river only clipping a tee box (a corner of it, not its marker): a bitten box, allowed (one tile the cover's 4-tile sampling may not see)
    assert.ok(at((x, y) => x >= 460 && x < 461 && y >= 495 && y < 496).ok);
    // a practice green on the river is no hole's
    const withPractice = { ...spec, areas: [...spec.areas!, { surf: 'green', hole: 0, rings: [[60, 5, 66, 5, 66, 11, 60, 11]] }] } as PlaceSpec;
    assert.equal(planPlace(world({ river: (x, y) => x >= 510 && x < 517 && y >= 480 && y < 487 }), withPractice, AT, 0).whyKind, '');
    // a river that runs along the hole (most of its line on the water, tee and green dry): allowed, said
    const along = at(x => x >= 470 && x < 520);
    assert.equal(along.whyKind, ''); assert.ok(along.ok);
    assert.equal(along.over.river, 'The river runs along hole 1: it stays, as a water hazard');
    // no river near: nothing said; a river beside the land: nothing
    assert.equal(at(() => false).over.river, ''); assert.equal(at(x => x >= 600).over.river, '');
    // a spec without areas and holes (a made-up land) is told by its cover
    assert.equal(planPlace(world({ river: x => x >= 520 && x < 523 }), LAND, AT, 0).over.river, NOTE.river);
  });

  it('says every thing it is laid over in the pop-up, the warnings first (T444)', () => {
    const segs = [seg(0, 500, 300, 500), seg(300, 500, 700, 500), seg(700, 500, 800, 500)];
    const p = planPlace(world({ segs, entries: [{ x: 0, y: 500 }], targets: [{ name: 'the clubhouse', x: 800, y: 500 }], townCentre: { x: 500, y: 500 },
      keep: [{ name: 'halfway house', rect: [500, 490, 10, 10], refund: 1000 }], river: x => x >= 520 && x < 523 }), LAND, AT, 0);
    assert.ok(p.ok, p.why);
    assert.deepEqual(p.over.notes, ['The clubhouse loses its road link to the county road', 'Your halfway house is cleared ($1,000 back)', NOTE.town, NOTE.river]);
  });

  it('is still red for the money: an unaffordable pose over the town’s centre is told as short', () => {
    const p = planPlace(world({ townCentre: { x: 500, y: 500 }, money: 0 }), LAND, AT, 100);
    assert.equal(p.whyKind, '');
    assert.match(placeLabel(p, 'x').text, /^Not enough money/);
  });
});

describe('Cancel leaves everything untouched (T356)', () => {
  it('planning reads the world and changes none of it', () => {
    const lots = [lot('a', 460, 480), lot('b', 700, 480)], segs = [seg(400, 500, 600, 500), seg(300, 100, 300, 300)];
    const owned: Rect[] = [[0, 0, 100, 100]];
    const w = world({ lots, segs, owned });
    const snap = JSON.stringify([w.lots, w.segs, w.owned]);
    const a = planPlace(w, LAND, AT, 5), b = planPlace(w, LAND, AT, 5);
    assert.deepEqual(a, b, 'the same plan twice');
    assert.equal(JSON.stringify([w.lots, w.segs, w.owned]), snap);
    for (const deg of [15, 45, 90]) planPlace(w, rotateSpec(ronde, deg), { x: 512, y: 512, deg }, 0);
    assert.equal(JSON.stringify([w.lots, w.segs, w.owned]), snap);
  });

  it('the origin of a pose is the land’s middle on the tile', () => {
    assert.deepEqual(originFor({ w: 100, h: 50 }, 500, 500), { ox: 450, oy: 475 });
    assert.deepEqual(originFor({ w: 101, h: 51 }, 500, 500), { ox: 450, oy: 475 }, 'a half tile rounds');
  });
});

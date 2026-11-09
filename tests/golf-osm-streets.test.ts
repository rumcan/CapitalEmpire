// T354 (#996): the estate of a real course (src/game/golf/osm/streets.ts): the streets cut at the land and snapped into one network, a street over a hole left out, the houses'
// anchors, the link to the entry road, and the lots at the houses. Pure: no network, no DOM.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEstate, clipLine, crossesBlocks, framesAtBuildings, houseAnchors, joinEstate, STREET_REACH, type Blocks, type StreetWay } from '../src/game/golf/osm/streets';
import type { P, Poly } from '../src/game/golf/osm/geom';
import { frontageFrames, centreOf } from '../src/game/golf/estate';
import { SURF, makeGrid } from '../src/game/ext/course-grid';

const sq = (x: number, y: number, w: number, h: number): Poly => ({ outer: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], inner: [] });
const way = (hw: string, ...pts: [number, number][]): StreetWay => ({ hw, pts });
const NONE: Blocks = { polys: [], lines: [] };
const BOX: [number, number, number, number] = [-100, -100, 100, 100];

describe('clipping a street to the land (T354)', () => {
  it('keeps what lies inside the box and cuts a segment where it crosses the edge', () => {
    assert.deepEqual(clipLine([[-10, 0], [30, 0]], [0, -5, 20, 5]), [[[0, 0], [20, 0]]]);
    const inside: P[] = [[1, 1], [5, 2], [9, 3]];
    assert.deepEqual(clipLine(inside, [0, 0, 10, 10]), [inside]);
    assert.deepEqual(clipLine([[20, 20], [30, 30]], [0, 0, 10, 10]), []);
  });
  it('makes a run for each time the street is inside: out and back in is two pieces', () => {
    const runs = clipLine([[-5, 5], [5, 5], [5, 15], [-5, 15], [-5, 25]], [0, 0, 10, 10]);
    assert.equal(runs.length, 1, 'it leaves through the top and never comes back in a point of the box');
    const zig = clipLine([[2, 2], [8, 2], [8, 12], [2, 12], [2, 8], [8, 8]], [0, 0, 10, 10]);
    assert.equal(zig.length, 2);
    assert.deepEqual(zig[0]![0], [2, 2]); assert.deepEqual(zig[1]!.at(-1), [8, 8]);
  });
});

describe('what a street may not cross (T354)', () => {
  const blocks: Blocks = { polys: [sq(10, 10, 10, 10)], lines: [[[40, 0], [40, 30]]] };
  it('a street over a polygon, in it, or over a hole’s line of play crosses; one that misses them does not', () => {
    assert.equal(crossesBlocks([[0, 15], [30, 15]], blocks), true, 'through a fairway');
    assert.equal(crossesBlocks([[12, 12], [18, 18]], blocks), true, 'wholly inside it');
    assert.equal(crossesBlocks([[30, 20], [50, 20]], blocks), true, 'over a line of play');
    assert.equal(crossesBlocks([[0, 25], [30, 25]], blocks), false);
    assert.equal(crossesBlocks([[0, 5], [30, 5], [30, 40]], blocks), false, 'beside the polygon, and the line is not reached');
  });
  it('a hole in a polygon is not the polygon: a street through an island’s middle does not cross it', () => {
    const ring: Poly = { outer: [[0, 0], [30, 0], [30, 30], [0, 30]], inner: [[[10, 10], [20, 10], [20, 20], [10, 20]]] };
    assert.equal(crossesBlocks([[12, 15], [18, 15]], { polys: [ring], lines: [] }), false);
    assert.equal(crossesBlocks([[2, 15], [8, 15]], { polys: [ring], lines: [] }), true);
  });
});

describe('the network of the streets (T354)', () => {
  it('lets the streets run a little way past the land’s edge (the perimeter road lies outside it) and cuts them there', () => {
    const e = buildEstate([way('residential', [-150, 0], [150, 0])], BOX, NONE);
    assert.equal(e.streets.length, 1);
    const p = e.streets[0]!.pts;
    assert.deepEqual([p[0]![0], p.at(-1)![0]], [-100 - STREET_REACH, 100 + STREET_REACH]);
    assert.equal(e.stats.lengthM, 240);
    assert.equal(buildEstate([way('residential', [-150, 0], [150, 0])], BOX, NONE, 2, 0).stats.lengthM, 200, 'a reach of 0 cuts them at the edge');
  });

  it('keeps a network whole that the edge alone would cut: a ring road just outside the land joins the streets inside it', () => {
    const inside = [way('residential', [-80, -30], [-80, 30]), way('residential', [80, -30], [80, 30])];
    const ring = way('residential', [-80, 30], [-80, 110], [80, 110], [80, 30]); // its far side is 10 m outside the land
    assert.equal(buildEstate([...inside, ring], BOX, NONE).stats.unconnected, 0);
    assert.ok(buildEstate([...inside, ring], BOX, NONE, 2, 0).stats.unconnected >= 1, 'cut at the edge, the pieces inside are separate networks');
  });

  it('joins a street that ends beside another: its end moves onto it and the other gets a vertex there (a T), and a gap between two ends closes', () => {
    const a = way('residential', [-90, 0], [90, 0]);
    const b = way('residential', [0.5, 60], [0.5, 1.2]); // 1.2 m short of A, over a segment with no vertex
    const c = way('residential', [-60, -40], [-60, -1]); // 1 m short of A at x = -60
    const e = buildEstate([a, b, c], BOX, NONE);
    assert.equal(e.stats.kept, 3, 'all three are one network');
    assert.equal(e.stats.unconnected, 0);
    const A = e.streets[0]!.pts, B = e.streets[1]!.pts;
    assert.ok(A.some(p => p[0] === 0.5 && p[1] === 0), 'the host has the T’s node');
    assert.deepEqual(B.at(-1), [0.5, 0]);
    assert.equal(e.stats.junctions, 2);
    // two dead ends 1.5 m apart are one road
    const d = buildEstate([way('residential', [-80, 50], [-10, 50]), way('residential', [-8.5, 50], [60, 50])], BOX, NONE);
    assert.equal(d.stats.kept, 2); assert.equal(d.stats.unconnected, 0);
    assert.deepEqual(d.streets[1]!.pts[0], d.streets[0]!.pts.at(-1), 'the second begins where the first ends');
  });

  it('uses a vertex that is about as near as the foot instead of adding a sliver beside it', () => {
    const a = way('residential', [-90, 0], [0, 0], [90, 0]);
    const e = buildEstate([a, way('residential', [0.3, 50], [0.3, 0.4])], BOX, NONE);
    assert.equal(e.streets[0]!.pts.length, 3, 'the host got no new vertex');
    assert.deepEqual(e.streets[1]!.pts.at(-1), [0, 0]);
  });

  it('leaves out a street that crosses a hole, whole, and counts it', () => {
    const blocks: Blocks = { polys: [sq(40, -10, 20, 20)], lines: [] };
    const e = buildEstate([way('residential', [-90, 0], [90, 0]), way('residential', [-50, 60], [-50, -60]), way('service', [50, 80], [50, -80])], BOX, blocks);
    assert.equal(e.stats.crossing, 2, 'the main street runs through the fairway and so does the third');
    assert.equal(e.stats.kept, 1);
    assert.equal(e.streets[0]!.hw, 'residential');
  });

  it('keeps only the biggest network: a piece the rest does not reach is left out, with its length', () => {
    const e = buildEstate([way('residential', [-90, 0], [90, 0]), way('residential', [0, 0], [0, 70]), way('residential', [40, 60], [80, 60])], BOX, NONE);
    assert.equal(e.stats.kept, 2);
    assert.equal(e.stats.unconnected, 1);
    assert.equal(e.stats.unconnectedM, 40);
    assert.equal(e.stats.lengthM, 180 + 70);
  });

  it('counts junctions and dead ends of what is kept, and is the same every time', () => {
    const ways = [way('residential', [-90, 0], [90, 0]), way('residential', [0, 0], [0, 70]), way('residential', [-45, 0], [-45, -70])];
    const e = buildEstate(ways, BOX, NONE);
    assert.deepEqual([e.stats.junctions, e.stats.ends], [2, 4], 'two T junctions; the dead ends are the main street’s two and the side streets’ far ends');
    assert.deepEqual(buildEstate(ways, BOX, NONE), e);
  });
});

describe('the houses of the estate (T354)', () => {
  it('keeps a building inside the land that is off the course and off the street’s line, and drops the rest', () => {
    const streets = [way('residential', [-90, 0], [90, 0])];
    const blocks = [sq(30, 20, 20, 20)];
    const centres: P[] = [[10, 12], [40, 30], [20, 1.5], [150, 10], [-95, 10], [-30, -12]];
    assert.deepEqual(houseAnchors(centres, BOX, blocks, streets), [[10, 12], [-95, 10], [-30, -12]], 'the one on the course, the one on the street and the one outside the land go');
    assert.deepEqual(houseAnchors([[-96, 10]], BOX, [], []), [[-96, 10]]);
    assert.deepEqual(houseAnchors([[-96.5, 10]], BOX, [], []), [], 'a house needs 4 m of the land’s own ground inside its edge');
  });
});

describe('the link to the entry road (T354)', () => {
  // a 400-tile map; the land [100, 100, 200, 150], the entry road coming in from the north edge at column 250 down to row 40; the clubhouse parcel and car park beside its end
  const road = { a: { x: 250, y: 0 }, b: { x: 250, y: 40 } };
  const keepOut: [number, number, number, number][] = [[230, 62, 40, 24], [207, 72, 20, 16]];
  const input = { at: { x: 100, y: 100 }, road, side: 'N' as const, keepOut, map: 400 };
  const streets = [{ pts: [10, 20, 150, 20, 190, 20] }, { pts: [10, 20, 10, 140] }];

  it('lays the streets as legs on the map and one link from the vertex with the shortest clear way out, along the way out and then to the road (a T)', () => {
    const j = joinEstate({ ...input, streets, grid: null });
    assert.equal(j.why, undefined);
    assert.equal(j.legs.length, 3);
    assert.deepEqual(j.legs[0], { a: { x: 110, y: 120 }, b: { x: 250, y: 120 } });
    // the node under the parcel (250, 120) would cross it; the one at (290, 120) goes out at its own column, clear of the parcel
    assert.equal(j.link.length, 2);
    assert.deepEqual(j.link[0], { a: { x: 290, y: 120 }, b: { x: 290, y: 32 } });
    assert.deepEqual(j.link[1], { a: { x: 290, y: 32 }, b: { x: 250, y: 32 } });
    assert.equal(j.linkTiles, 88 + 40);
  });

  it('keeps clear of the playing surfaces: a fairway across the way out sends the link to another vertex', () => {
    const g = makeGrid(0, 0, 800, 800);
    for (let y = 80; y < 110; y += 0.5) for (let x = 285; x < 295; x += 0.5) { const i = Math.floor(y / 0.5) * g.w + Math.floor(x / 0.5); g.surf[i] = SURF.fairway; }
    const j = joinEstate({ ...input, streets, grid: g });
    assert.equal(j.link[0]!.a.x, 110, 'out from the west end instead');
    // (the rough and the fescue are no obstacle)
    const g2 = makeGrid(0, 0, 800, 800); g2.surf.fill(SURF.fescue);
    assert.deepEqual(joinEstate({ ...input, streets, grid: g2 }).link[0]!.a, { x: 290, y: 120 });
  });

  it('says why when no street can be joined: none, none on the land’s side of the road’s end, the parcel in every way, a road too short', () => {
    assert.equal(joinEstate({ ...input, streets: [], grid: null }).why, 'no streets');
    const out = joinEstate({ ...input, streets: [{ pts: [-60, -100, -20, -100] }], grid: null }); // a street north of the junction row (y = 32): nearer the map’s edge than the road’s end
    assert.match(out.why!, /no street lies on the land.s side/);
    assert.deepEqual([out.legs.length, out.link.length], [0, 0]);
    const blocked = joinEstate({ ...input, keepOut: [[0, 40, 400, 30]], streets, grid: null });
    assert.match(blocked.why!, /clear of the course/);
    assert.match(joinEstate({ ...input, road: { a: { x: 250, y: 0 }, b: { x: 250, y: 2 } }, streets, grid: null }).why!, /too short/);
  });

  it('starts the link from a street vertex outside the land when that is the way out (the perimeter road lies past the edge)', () => {
    const j = joinEstate({ ...input, streets: [{ pts: [150, -8, 190, -8] }, { pts: [150, 20, 150, 140] }], grid: null });
    assert.equal(j.why, undefined);
    assert.equal(j.link[0]!.a.y, 92, 'the vertex 8 tiles past the land’s north edge, which is nearer the road than any inside it');
  });

  it('works for the other sides: east, the road along the row and the link out along x', () => {
    const e = joinEstate({ streets: [{ pts: [180, 30, 180, 100] }], at: { x: 100, y: 100 }, road: { a: { x: 399, y: 175 }, b: { x: 360, y: 175 } }, side: 'E', keepOut: [[330, 160, 24, 40]], grid: null, map: 400 });
    assert.equal(e.why, undefined);
    assert.deepEqual(e.link.at(-1)!.b, { x: 368, y: 175 }, 'the T on the road, 8 tiles from its inner end');
  });
});

describe('the lots at the houses (T354)', () => {
  const seg = { a: { x: 0, y: 0 }, b: { x: 60, y: 0 }, base: 'street', h: 1.625, walk: 1.025, ra: 0, rb: 0 };
  const frames = frontageFrames(seg, [1, -1]);

  it('takes the frame that holds each house, one frame for each, and its own side of the street', () => {
    assert.ok(frames.length >= 8, `${frames.length} frames`);
    const a = centreOf(frames[2]!), b = centreOf(frames.find(f => f.side === -1 && f.k === frames[2]!.k + 2)!);
    const got = framesAtBuildings(frames, [a, b]);
    assert.equal(got.length, 2);
    assert.ok(got.includes(frames[2]!));
    assert.deepEqual(got.map(f => f.side).sort(), [-1, 1], 'a house on each side of the street');
    // the frames come back in their own order
    assert.deepEqual(got, frames.filter(f => got.includes(f)));
  });

  it('gives a building with no street beside it no lot, and two buildings in one lot two lots (the next nearest)', () => {
    assert.deepEqual(framesAtBuildings(frames, [{ x: 30, y: 90 }]), []);
    const c = centreOf(frames[3]!), two = framesAtBuildings(frames, [c, { x: c.x + 0.5, y: c.y }]);
    assert.equal(two.length, 2);
    assert.ok(two.includes(frames[3]!));
  });
});

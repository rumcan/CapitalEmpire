// T354 (#996; the owner, 2026-11-08: "Add a way to add the estate streets if your golf course you are importing is also a golf estate"): the converter reads the map's streets and houses
// (golf/osm/convert.ts, streets.ts), a new game lays them joined to the entry road (start.ts planOsmGame), and the lots stand at the houses. Woodhill, the shipped estate, is the example:
// its fixture carries the estate's streets and the buildings' centres. Pure: no network, no DOM.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import woodhillJson from '../src/game/golf/osm/data/woodhill.json';
import rondeboschJson from '../src/game/golf/osm/data/rondebosch.json';
import { osmCourseToSpec, specOf } from '../src/game/golf/osm';
import { paintSpec } from '../src/game/golf/osm/raster';
import { rotateSpec } from '../src/game/golf/osm/rotate';
import { OSM_EDGE, planOsmGame } from '../src/game/golf/osm/start';
import { scaleJson } from '../src/game/golf/osm/convert';
import { OSM_CREDIT, type OsmCourseJson, type OsmCourseSpec } from '../src/game/golf/osm/types';
import { SURF, makeGrid } from '../src/game/ext/course-grid';
import { MAP } from '../src/game/iso';
import { framesOf, frontageFrames, lotWhy, newEstate, planLots, type EstateEnv, type Frame, type StreetSeg } from '../src/game/golf/estate';
import { STREET_REACH, framesAtBuildings, rectDist } from '../src/game/golf/osm/streets';

const woodhill = woodhillJson as unknown as OsmCourseJson, ronde = rondeboschJson as unknown as OsmCourseJson;
const NAMES = { place: '' };
const specWh = specOf(woodhill, { id: 'woodhill', name: 'Woodhill Country Club', ...NAMES });
const count = (a: Uint8Array, v: number): number => { let c = 0; for (const x of a) if (x === v) c++; return c; };
/** how far past the land's edge a street may run, tiles */
const REACH_T = STREET_REACH / 2;

describe('Woodhill’s estate (T354)', () => {
  const est = specWh.estate!;

  it('has the estate’s streets and houses in its spec, a residential estate, one network of some 14 km of street at the scale the course is built at', () => {
    assert.ok(est, 'the fixture has streets, so the spec has an estate');
    assert.equal(est.residential, true, 'the boundary is landuse=residential');
    assert.ok(est.streets.length >= 80 && est.streets.length <= 110, `${est.streets.length} street pieces`);
    // (the scale is 90%: the 14.6 km of the map is 13.2 km, 12.3 km of it inside the land; the streets run 20 m past its edge, so the perimeter road keeps the network whole)
    assert.ok(est.lengthM > 10500 && est.lengthM < 13500, `${est.lengthM} m of street`);
    assert.ok(est.junctions >= 60, `${est.junctions} junctions`);
    assert.ok(est.houses.length >= 2 * 60 && est.houses.length <= 2 * 134, `${est.houses.length / 2} houses`);
    assert.equal(specWh.counts.street, est.streets.length); assert.equal(specWh.counts.house, est.houses.length / 2);
    assert.ok(specWh.estate!.streets.every(s => s.hw === 'residential' || s.hw === 'service' || s.hw === 'living_street'));
  });

  it('keeps every street at the land (at most STREET_REACH past its edge) and off every hole: no point along any of them is on a fairway, a tee, a green, a bunker or water once the course is painted', () => {
    const g = makeGrid(0, 0, (specWh.w + 20) * 2, (specWh.h + 20) * 2);
    paintSpec(g, specWh, 10, 10);
    let samples = 0, bad = 0, outside = 0;
    for (const s of est.streets) for (let i = 0; i + 3 < s.pts.length; i += 2) {
      const x0 = s.pts[i]!, y0 = s.pts[i + 1]!, x1 = s.pts[i + 2]!, y1 = s.pts[i + 3]!, n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.5));
      for (let k = 0; k <= n; k++) {
        const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
        if (x < -REACH_T - 0.01 || y < -REACH_T - 0.01 || x > specWh.w + REACH_T + 0.01 || y > specWh.h + REACH_T + 0.01) outside++;
        if (x < -10 || y < -10 || x > specWh.w + 10 || y > specWh.h + 10) continue; // (the test's grid reaches 10 tiles past the land)
        const c = g.surf[Math.floor((y + 10) / 0.5) * g.w + Math.floor((x + 10) / 0.5)]!;
        samples++; if (c === SURF.fairway || c === SURF.tee || c === SURF.green || c === SURF.bunker || c === SURF.water) bad++;
      }
    }
    assert.ok(samples > 5000, `${samples} points sampled`);
    assert.equal(outside, 0, 'every street lies within the reach of the land');
    assert.equal(bad, 0, 'no street crosses a hole');
  });

  it('is told, not refused: what was left out is a warning with its count, and the spec adds the counts up', () => {
    const n = (code: string): number => Number(specWh.warnings.find(x => x.code === code)?.text.match(/^\d+/)?.[0] ?? 0);
    for (const x of specWh.warnings.filter(w => w.code.startsWith('street-'))) assert.match(x.text, /left out/);
    assert.equal(est.leftOut, n('street-over-hole') + n('street-unconnected'));
  });

  it('lays on the map with a new game: the streets are legs, one link joins the network to the entry road, and every leg is one network with the road', () => {
    const p = planOsmGame(specWh, MAP, {}, true)!;
    assert.ok(p.estate, `joined: ${p.estateWhy}`);
    const e = p.estate!;
    const segments = est.streets.reduce((n, s) => n + s.pts.length / 2 - 1, 0);
    assert.ok(e.legs.length <= segments && e.legs.length >= segments * 0.98, `${e.legs.length} legs for ${segments} segments (a sliver under 5 cm is no leg)`);
    assert.ok(e.link.length >= 1 && e.link.length <= 2);
    // the link ends on the entry road (a T): on its segment, not at an end
    const road = p.road[0]!, end = e.link.at(-1)!.b;
    const onRoad = Math.abs((end.x - road.a.x) * (road.b.y - road.a.y) - (end.y - road.a.y) * (road.b.x - road.a.x)) / Math.hypot(road.b.x - road.a.x, road.b.y - road.a.y) < 0.01;
    assert.ok(onRoad && Math.min(road.a.x, road.b.x) - 0.01 <= end.x && end.x <= Math.max(road.a.x, road.b.x) + 0.01 && Math.min(road.a.y, road.b.y) - 0.01 <= end.y && end.y <= Math.max(road.a.y, road.b.y) + 0.01, 'the link ends on the road');
    // one network: union the legs' end points (to 1 cm); the road's two ends and the link join it
    const parent = new Map<string, string>(), key = (q: { x: number; y: number }) => `${Math.round(q.x * 100)},${Math.round(q.y * 100)}`;
    const find = (k: string): string => { let r = k; while (parent.get(r) !== r) r = parent.get(r)!; return r; };
    const add = (k: string) => { if (!parent.has(k)) parent.set(k, k); };
    const join = (a: { x: number; y: number }, b: { x: number; y: number }) => { add(key(a)); add(key(b)); parent.set(find(key(a)), find(key(b))); };
    for (const l of [...e.legs, ...e.link]) join(l.a, l.b);
    join(road.a, { x: end.x, y: end.y }); // (the link's T on the road: the road's own node there)
    const roots = new Set([...parent.keys()].map(find));
    assert.equal(roots.size, 1, `the estate's streets are ${roots.size} networks`);
    // the link keeps off the land's playing ground and out of the clubhouse parcel
    const [vx, vy, vw, vh] = p.venue;
    for (const l of e.link) for (const q of [l.a, l.b]) assert.ok(!(q.x > vx - 2 && q.x < vx + vw + 2 && q.y > vy - 2 && q.y < vy + vh + 2), 'clear of the clubhouse');
    assert.ok(e.legs.every(l => l.a.x >= p.land[0] - REACH_T - 0.01 && l.a.x <= p.land[0] + p.land[2] + REACH_T + 0.01 && l.a.y >= p.land[1] - REACH_T - 0.01 && l.a.y <= p.land[1] + p.land[3] + REACH_T + 0.01), 'the streets are at the land');
  });

  it('leaves the estate out when it is not asked for, and says why when it cannot be joined', () => {
    const p = planOsmGame(specWh, MAP, {}, false)!;
    assert.equal(p.estate, undefined); assert.equal(p.estateWhy, undefined);
    const none = planOsmGame({ ...specWh, estate: undefined }, MAP, {}, true)!;
    assert.equal(none.estate, undefined);
    // a land whose every street is far from the venue side's way out: the streets give no joinable vertex
    const lost = planOsmGame({ ...specWh, estate: { ...est, streets: [{ pts: [-60, -60, -50, -60], hw: 'residential' }] } }, MAP, {}, true)!;
    assert.equal(lost.estate, undefined); assert.match(lost.estateWhy!, /no way out of the land|no street lies/);
  });

  it('has the same estate every time, and a course with no streets has none (Rondebosch)', () => {
    assert.deepEqual(osmCourseToSpec(woodhill, { id: 'woodhill', scale: specWh.scale }), osmCourseToSpec(woodhill, { id: 'woodhill', scale: specWh.scale }));
    assert.equal(osmCourseToSpec(ronde, { id: 'r' }).estate, undefined);
  });

  it('turns with the rest when the course is turned (the placing mode): the streets keep their length and stay inside the turned land’s frame', () => {
    const t = rotateSpec(specWh, 90), a = specWh.estate!.streets, b = t.estate!.streets;
    assert.equal(b.length, a.length);
    const len = (s: { pts: number[] }) => { let L = 0; for (let i = 0; i + 3 < s.pts.length; i += 2) L += Math.hypot(s.pts[i + 2]! - s.pts[i]!, s.pts[i + 3]! - s.pts[i + 1]!); return L; };
    assert.ok(Math.abs(a.reduce((n, s) => n + len(s), 0) - b.reduce((n, s) => n + len(s), 0)) < 5, 'the same length of street');
    assert.ok(b.every(s => s.pts.every((v, i) => (i % 2 ? v <= t.h + 1.5 * REACH_T : v <= t.w + 1.5 * REACH_T) && v >= -1.5 * REACH_T)), 'within the reach of the turned land');
  });

  it('puts a lot at each house: T353’s frames along the streets, one at each house that has a street beside it, on its side of the street and square to it (the house faces its street)', () => {
    // a street piece and houses beside it on both sides, as the map has them (a street from (0, 0) to (80, 0): its left, side +1, is y > 0)
    const seg: StreetSeg = { a: { x: 0, y: 0 }, b: { x: 80, y: 0 }, base: 'street', h: 1.625, walk: 1.025, ra: 0, rb: 0 };
    const frames = frontageFrames(seg, [1, -1]);
    const houses = [{ x: 12, y: 6 }, { x: 31, y: -7 }, { x: 55, y: 5 }, { x: 40, y: 60 }];
    const got = framesAtBuildings(frames, houses);
    assert.equal(got.length, 3, 'the house 60 tiles from the street gets no lot');
    for (const h of houses.slice(0, 3)) {
      const best = got.map(f => ({ f, d: rectDist(f, h.x, h.y) })).sort((p, q) => p.d - q.d)[0]!;
      assert.ok(best.d <= 6, 'a lot within reach of its house');
      assert.equal(best.f.side, h.y > 0 ? 1 : -1, 'on the house’s own side of the street');
      assert.ok(Math.abs(best.f.n.x) < 1e-9 && Math.abs(Math.abs(best.f.n.y) - 1) < 1e-9, 'the lot is turned square to the street');
    }
    // the filter T353's framesOf takes keeps exactly these frames
    const keep = new Set(got.map(f => `${f.seg}:${f.k}:${f.side}`));
    assert.equal(framesOf({ segs: [seg], only: f => keep.has(`${f.seg}:${f.k}:${f.side}`) }).length, got.length);
  });

  it('lays the lots on streets at any heading: T353 axis rule is the model default (a lot square to a street at 30 degrees is refused), the engine turns it off (the composer draws a house on every heading)', () => {
    const a = (30 * Math.PI) / 180, u = { x: Math.cos(a), y: Math.sin(a) }, n = { x: -u.y, y: u.x };
    const env: EstateEnv = { map: 1024, owned: () => true, grid: null, lines: [], roads: () => [] };
    const f = { o: { x: 120, y: 90 }, u, n, w: 10, d: 15 };
    assert.match(lotWhy(f, env), /Houses face the map/);
    assert.equal(lotWhy(f, { ...env, anyHeading: true }), '');
  });

  it('can lay a lot at most of the houses that have a street beside them (the frames at Woodhill houses lie 20 to 60 degrees off the axes: the axis rule alone would refuse every one)', () => {
    const p = planOsmGame(specWh, MAP, {}, true)!, e = p.estate!, [lx, ly, lw, lh] = p.land;
    // (the pieces the engine makes of the legs: the street class half width and verge, each end cut back at a junction or a dead end as the town own lots are)
    const deg = new Map<string, number>(), key = (q: { x: number; y: number }) => `${q.x.toFixed(2)},${q.y.toFixed(2)}`;
    for (const l of [...e.legs, ...e.link]) for (const q of [l.a, l.b]) deg.set(key(q), (deg.get(key(q)) ?? 0) + 1);
    const reach = (q: { x: number; y: number }) => { const d = deg.get(key(q)) ?? 1; return d >= 3 ? 1.625 + 1.025 + 2 : d === 1 ? 1.625 + 1 + 1.025 : 0; };
    const segs: StreetSeg[] = [...e.legs, ...e.link].map(l => ({ a: l.a, b: l.b, base: 'street', h: 1.625, walk: 1.025, ra: reach(l.a), rb: reach(l.b) }));
    const at = new Set(framesAtBuildings(framesOf({ segs }), e.houses).map(f => `${f.seg}:${f.k}:${f.side}`));
    const lines = specWh.holes.map(h => ({ hole: h.n, line: Array.from({ length: h.line.length / 2 }, (_, i) => ({ x: lx + h.line[2 * i]!, y: ly + h.line[2 * i + 1]! })) }));
    const roads = [...e.legs, ...e.link, ...p.road, ...p.drive];
    const env: EstateEnv = {
      map: MAP, owned: (x, y) => x >= lx && x <= lx + lw && y >= ly && y <= ly + lh, grid: p.grid, lines,
      roads: b => roads.filter(l => Math.max(l.a.x, l.b.x) >= b[0] - 6 && Math.min(l.a.x, l.b.x) <= b[2] + 6 && Math.max(l.a.y, l.b.y) >= b[1] - 6 && Math.min(l.a.y, l.b.y) <= b[3] + 6).map(l => ({ a: l.a, b: l.b, hw: 1.625 + 1.025, kind: 'road' as const })),
    };
    const along = { segs, only: (f: Frame) => at.has(`${f.seg}:${f.k}:${f.side}`) };
    const strict = planLots(newEstate(0), along, env), any = planLots(newEstate(0), along, { ...env, anyHeading: true });
    assert.ok(at.size >= 30, `${at.size} frames at the map houses`);
    assert.ok(any.ok.length >= 30 && any.ok.length >= at.size * 0.8, `${any.ok.length} of ${at.size} can be laid`);
    assert.ok(strict.ok.length <= 4, `${strict.ok.length} can be laid under the axis rule`);
    // what is left is the ground: land that is not the club, a hole range or a lot already there, never a street angle
    assert.ok(any.refused.every(r => !/Houses face/.test(r.why)));
    assert.ok(any.refused.every(r => /Not your land|golfers there are in range|is in the way|already/.test(r.why)), any.refused.map(r => r.why).join(' | '));
  });
});

// ---- the converter's rules, on a made-up course with an estate (metres, x east, y north) ----
const sq = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const area = (outer: [number, number][], tags: Record<string, string> = {}) => ({ tags, polys: [{ outer, inner: [] as [number, number][][] }] });
const street = (hw: string, line: [number, number][], tags: Record<string, string> = {}) => ({ tags: { highway: hw, ...tags }, line });
/** a hole running north from (0, 0) to (0, 350) with a fairway, a tee and a green, in a boundary; the estate's streets and houses as the caller gives them */
function estateCourse(streets: ReturnType<typeof street>[], buildings: { pos: [number, number]; tags?: Record<string, string> }[] = [], meta: OsmCourseJson['meta'] = {}): OsmCourseJson {
  return {
    meta: { credit: OSM_CREDIT, ...meta }, boundary: area(sq(-150, -60, 300, 480)),
    features: {
      hole: [{ tags: { golf: 'hole', ref: '1', par: '4' }, ref: 1, par: 4, line: [[0, 0], [0, 350]] }], tee: [area(sq(-5, -6, 10, 12))], fairway: [area(sq(-15, 40, 30, 280), { golf: 'fairway' })], green: [area(sq(-10, 340, 20, 20), { golf: 'green' })],
      // (two bunkers far out to the sides, 80 m from the line, still the hole's: they make the land 250 m wide, as an estate's is)
      bunker: [area(sq(-84, 100, 4, 4), { golf: 'bunker' }), area(sq(80, 100, 4, 4), { golf: 'bunker' })],
      street: streets, ...(buildings.length ? { building: buildings } : {}),
    },
  };
}
const MAIN = street('residential', [[-140, 200], [-60, 200], [-60, 300]]);

describe('the converter’s estate (T354)', () => {
  it('lays the streets inside the land, the houses’ centres, and flags a residential estate by the fixture’s flag or the boundary’s tag', () => {
    const j = estateCourse([MAIN, street('residential', [[-60, 250], [-100, 250]])], [{ pos: [-90, 240] }, { pos: [-70, 270], tags: { building: 'house' } }, { pos: [-80, 230], tags: { building: 'garage' } }], { estate: true });
    const s = osmCourseToSpec(j, { id: 't' });
    assert.ok(s.estate); assert.equal(s.estate!.residential, true);
    assert.equal(s.estate!.streets.length, 2);
    assert.equal(s.estate!.houses.length / 2, 2, 'the garage is no house');
    const tagged = osmCourseToSpec(estateCourse([MAIN], [], { course: { tags: { landuse: 'residential' } } }), { id: 't' });
    assert.equal(tagged.estate!.residential, true);
    assert.equal(osmCourseToSpec(estateCourse([MAIN]), { id: 't' }).estate!.residential, false, 'a course that is no estate: the box is off by default');
    // no streets: no estate
    assert.equal(osmCourseToSpec(estateCourse([]), { id: 't' }).estate, undefined);
  });

  it('leaves out a street that crosses a hole (the fairway), one not joined to the network, and one on a bridge, each with a warning', () => {
    const over = street('residential', [[-100, 150], [100, 150]]);                    // through the fairway
    const island = street('residential', [[60, 380], [100, 380]]);                    // a street the network does not reach
    const bridge = street('residential', [[-140, 100], [-60, 100]], { bridge: 'yes' });
    const s = osmCourseToSpec(estateCourse([MAIN, over, island, bridge]), { id: 't' });
    assert.equal(s.estate!.streets.length, 1);
    for (const code of ['street-over-hole', 'street-unconnected', 'street-bridge']) assert.ok(s.warnings.some(w => w.code === code), code);
    assert.equal(s.estate!.leftOut, 2);
  });

  it('keeps a house off the course and off the street, and drops what stands outside the land', () => {
    const j = estateCourse([MAIN], [{ pos: [0, 150] }, { pos: [-100, 201] }, { pos: [-130, 240] }, { pos: [400, 240] }, { pos: [-100, 100] }, { pos: [-90, 240] }]);
    const s = osmCourseToSpec(j, { id: 't' });
    assert.equal(s.estate!.houses.length / 2, 2, 'the one on the fairway, the one on the street and the two outside the land are no houses of the estate');
  });

  it('moves with the scale: at 50% the streets are half as long, and the estate is still one network', () => {
    const j = estateCourse([MAIN, street('residential', [[-60, 250], [-100, 250]])]);
    const full = osmCourseToSpec(j, { id: 't' }), half = osmCourseToSpec(j, { id: 't', scale: 0.5 });
    assert.ok(half.estate!.lengthM > full.estate!.lengthM * 0.4 && half.estate!.lengthM < full.estate!.lengthM * 0.6, `${half.estate!.lengthM} against ${full.estate!.lengthM}`);
    assert.equal(half.estate!.streets.length, 2);
    assert.deepEqual(scaleJson(j, 0.5).features.street![0]!.line, [[-70, 100], [-30, 100], [-30, 150]]);
  });

  it('counts what it made, for the card: streets, houses, junctions and the length', () => {
    const s = osmCourseToSpec(estateCourse([MAIN, street('residential', [[-60, 250], [-100, 250]])], [{ pos: [-90, 240] }]), { id: 't' });
    assert.equal(s.counts.street, 2); assert.equal(s.counts.house, 1);
    assert.equal(s.estate!.junctions, 1);
    assert.ok(s.estate!.lengthM > 150 && s.estate!.lengthM < 250, `${s.estate!.lengthM} m`);
  });

  it('is the same spec every time, whatever order the streets come in the data', () => {
    const a = osmCourseToSpec(estateCourse([MAIN, street('residential', [[-60, 250], [-100, 250]])]), { id: 't' });
    assert.deepEqual(osmCourseToSpec(estateCourse([MAIN, street('residential', [[-60, 250], [-100, 250]])]), { id: 't' }), a);
    const b = osmCourseToSpec(estateCourse([street('residential', [[-60, 250], [-100, 250]]), MAIN]), { id: 't' });
    assert.equal(b.estate!.streets.length, 2); assert.equal(b.estate!.lengthM, a.estate!.lengthM);
  });
});

describe('the estate on the map (T354)', () => {
  it('is not laid on a land the map has no room for beside the entry road: nothing is half laid', () => {
    const s: OsmCourseSpec = osmCourseToSpec(estateCourse([MAIN]), { id: 't' });
    const p = planOsmGame(s, MAP, {}, true)!;
    assert.ok(p.estate || p.estateWhy, 'a joined estate, or the reason');
    assert.ok(p.land[0] >= OSM_EDGE);
  });
  it('is the land’s own business: the grid, the markers and the spec’s surfaces are the same with the estate asked for or not', () => {
    const s = osmCourseToSpec(estateCourse([MAIN, street('residential', [[-60, 250], [-100, 250]])]), { id: 't' });
    const a = planOsmGame(s, MAP, {}, false)!, b = planOsmGame(s, MAP, {}, true)!;
    assert.deepEqual(a.grid.surf, b.grid.surf); assert.deepEqual(a.land, b.land); assert.deepEqual(a.save.tees, b.save.tees);
    assert.ok(count(a.grid.surf, SURF.fairway) > 1000);
  });
});

// T412 and T417 (docs/CINDERLINKS-PORT.md): the course exporter for the view from behind the golfer (src/game/golf/play/export3p.ts) and the playability check
// (src/game/golf/play/playable3p.ts). A painted 3-hole course goes out as the map importer's JSON and is checked against what was painted: every green's
// centre inside an exported green, the hole lines' ends on the tees and pins, the heights within 15 cm, the packed grid read back as packed. The Woodhill
// fixture, imported as the game imports it, exports back onto its source within 1 m. A hole with its pin off the green cannot be opened, and says why.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import woodhillJson from '../src/game/golf/osm/data/woodhill.json';
import { osmCourseToSpec } from '../src/game/golf/osm/convert';
import { specMarkers } from '../src/game/golf/osm/raster';
import { interiorPoint, inPoly, ringArea, type P } from '../src/game/golf/osm/geom';
import { heightAtM, packGrid, unpackGrid, type HeightPack } from '../src/game/golf/osm/terrarium';
import type { JPoly, OsmCourseJson } from '../src/game/golf/osm/types';
import { deriveHoles, PIN_OFF_GREEN } from '../src/game/golf/holes';
import type { AimPoint, CourseArea, GolfSurface, Pin, TeeMark } from '../src/game/golf/types';
import type { Game } from '../src/game/engine';
import { chaikin, exportCourse3p, export3pInputOf, type Export3pGame, frame3p, marchLoops, sampleHeights, toMetres, toTiles, type Export3pInput } from '../src/game/golf/play/export3p';
import { playable3p, PIN_IN_WATER, TEE_IN_WATER, TOO_SHORT } from '../src/game/golf/play/playable3p';

// ------------------------------------------------------------------------------------------------------------------------ a painted course
let nextId = 1;
const rect = (surface: GolfSurface, x0: number, y0: number, x1: number, y1: number): CourseArea => ({ id: nextId++, surface, pts: [x0, y0, x1, y0, x1, y1, x0, y1] });
const disc = (surface: GolfSurface, cx: number, cy: number, r: number, n = 24): CourseArea => ({
  id: nextId++, surface, pts: Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)]).flat(),
});
/** a smooth ground (tiles in, metres out): rolling, a few metres of relief */
const ground = (x: number, y: number) => 3 * Math.sin(x / 37) + 2 * Math.cos(y / 53) + 0.01 * x;

/** three holes side by side, running north (y falls): each a tee, a fairway, a green with a bunker beside it; hole 2 has a pond in its fairway (a hole in the
 *  fairway polygon) and a dogleg aim point; the whole course sits on rough */
function course(): Export3pInput & { greens: { hole: number; x: number; y: number }[] } {
  const areas: CourseArea[] = [rect('rough', 80, 40, 420, 420)], tees: TeeMark[] = [], pins: Pin[] = [], aims: AimPoint[] = [], greens: { hole: number; x: number; y: number }[] = [];
  const holes = [{ n: 1, x: 120, len: 150 }, { n: 2, x: 230, len: 200 }, { n: 3, x: 340, len: 90 }];
  for (const h of holes) {
    const teeY = 400, greenY = teeY - h.len;
    areas.push(rect('fairway', h.x - 15, greenY + 8, h.x + 15, teeY - 20));
    if (h.n === 2) areas.push(disc('water', h.x, greenY + 80, 7));
    areas.push(rect('tee', h.x - 5, teeY - 6, h.x + 5, teeY + 6));
    areas.push(disc('green', h.x, greenY, 12));
    areas.push(disc('bunker', h.x + 17, greenY + 4, 4));
    tees.push({ hole: h.n, kind: 'back', x: h.x, y: teeY + 3 }, { hole: h.n, kind: 'middle', x: h.x, y: teeY - 3 });
    pins.push({ hole: h.n, x: h.x + 2, y: greenY - 1 });
    if (h.n === 2) aims.push({ hole: 2, x: h.x - 8, y: teeY - 110, order: 1 });
    greens.push({ hole: h.n, x: h.x, y: greenY });
  }
  return { areas, tees, pins, aims, heightAt: ground, name: 'Test links', date: '2026-11-12', greens };
}

const polysOf = (f: OsmCourseJson, kind: string): JPoly[] => (f.features[kind] ?? []).flatMap(q => q.polys ?? []);
const inAny = (ps: JPoly[], x: number, y: number) => ps.some(p => inPoly({ outer: p.outer, inner: p.inner }, x, y));

describe('T412 the course exporter', () => {
  it('a painted 3-hole course round-trips: greens, hole lines, pins and heights', async () => {
    const inp = course(), f = frame3p(inp), file = await exportCourse3p(inp);
    // every kind painted is there, as polygons
    for (const k of ['rough', 'fairway', 'green', 'tee', 'bunker', 'water']) assert.ok(polysOf(file, k).length > 0, `${k} exported`);
    assert.equal(polysOf(file, 'green').length, 3);
    // every painted green's centre lies inside an exported green
    const greens = polysOf(file, 'green');
    for (const g of inp.greens) { const [X, Y] = toMetres(f, g.x, g.y); assert.ok(inAny(greens, X, Y), `green ${g.hole} centre inside`); }
    // the outlines are smoothed: a green of radius 12 tiles (24 m) keeps its size within a metre or so, and has many more corners than the paint
    for (const g of greens) {
      const a = Math.abs(ringArea(g.outer)), r = Math.sqrt(a / Math.PI);
      assert.ok(Math.abs(r - 24) < 1.5, `green radius ${r.toFixed(2)} m`);
      assert.ok(g.outer.length > 24);
      assert.ok(ringArea(g.outer) > 0, 'outer ring counter-clockwise');
    }
    // the pond on hole 2 is a hole in that fairway, and water of its own
    const fw2 = polysOf(file, 'fairway').find(p => inPoly(p, ...toMetres(f, 230, 330)));
    assert.ok(fw2 && fw2.inner.length === 1, 'the pond is an inner ring of the fairway');
    assert.ok(inAny(polysOf(file, 'water'), ...toMetres(f, 230, 280)));
    assert.ok(!inAny(polysOf(file, 'fairway'), ...toMetres(f, 230, 280)), 'the pond is not fairway');
    // each hole: number, par, a line whose ends are within 1 m of the back tee and the pin, a pin point, and every tee set as a marker
    const holes = file.features.hole ?? [];
    assert.deepEqual(holes.map(h => h.ref), [1, 2, 3]);
    const derived = deriveHoles(inp.areas, inp.tees, inp.pins, inp.aims);
    for (const h of holes) {
      const d = derived.find(q => q.n === h.ref)!, tee = inp.tees.find(t => t.hole === h.ref && t.kind === 'back')!, pin = inp.pins.find(p => p.hole === h.ref)!;
      assert.equal(h.par, d.par); assert.equal(h.length, d.lengthM);
      const a = h.line![0]!, b = h.line![h.line!.length - 1]!, [tx, ty] = toMetres(f, tee.x, tee.y), [px, py] = toMetres(f, pin.x, pin.y);
      assert.ok(Math.hypot(a[0] - tx, a[1] - ty) <= 1 && Math.hypot(b[0] - px, b[1] - py) <= 1, `hole ${h.ref} line ends`);
    }
    assert.equal(holes.find(h => h.ref === 2)!.line!.length, 3, 'the dogleg aim point is in the line');
    assert.equal(file.features.pin?.length, 3);
    assert.equal(file.features.tee_marker?.length, 6);
    // y points north: hole 1's green (north of its tee in the file, as y falls going north in the game) has the larger y
    assert.ok(holes[0]!.line![1]![1] > holes[0]!.line![0]![1]);
    // the heights at 20 points within 15 cm of the ground the game reads
    const grid = await unpackGrid(file.height!);
    assert.ok(Math.abs(grid.step - 1.5) < 1e-9);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 20; k++) {
      const x = 90 + rnd() * 320, y = 50 + rnd() * 360, [X, Y] = toMetres(f, x, y), got = heightAtM(grid, X, Y), want = ground(x, y);
      assert.ok(Math.abs(got - want) <= 0.15, `height at (${x.toFixed(1)}, ${y.toFixed(1)}): ${got.toFixed(3)} vs ${want.toFixed(3)}`);
    }
    assert.equal(file.meta?.course?.name, 'Test links');
    assert.ok(file.boundary?.polys?.[0]?.outer.length === 4);
  });

  it('the unpacked height grid equals what was packed (to the 1 cm unit)', async () => {
    const inp = course(), f = frame3p(inp), g = sampleHeights(ground, f, [-200, -150, 180, 210], 1.5), pack: HeightPack = await packGrid(g), back = await unpackGrid(pack);
    assert.equal(back.w, g.w); assert.equal(back.h, g.h); assert.equal(back.x0, g.x0); assert.equal(back.y0, g.y0); assert.equal(back.step, g.step);
    let worst = 0;
    for (let k = 0; k < g.m.length; k++) worst = Math.max(worst, Math.abs(back.m[k]! - g.m[k]!));
    assert.ok(worst <= pack.q / 2 + 1e-4, `worst ${worst}`);
    // and the frame: metres and tiles go there and back
    const t = toTiles(f, ...toMetres(f, 123.5, 77.25));
    assert.ok(Math.abs(t.x - 123.5) < 1e-9 && Math.abs(t.y - 77.25) < 1e-9);
  });

  it('marching squares closes every loop, keeps a saddle apart, and Chaikin doubles the corners', () => {
    // two cells touching only at a corner: two loops, not one
    const on = new Set(['0,0', '1,1']), loops = marchLoops(2, 2, (i, j) => on.has(`${i},${j}`));
    assert.equal(loops.length, 2);
    // a ring of cells round an empty middle: an outer loop and an inner one
    const ring = marchLoops(3, 3, (i, j) => !(i === 1 && j === 1));
    assert.equal(ring.length, 2);
    const sq: P[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    assert.equal(chaikin(chaikin(sq)).length, 16);
  });

  it('the adapter reads the game where the play modules do (the engine fits it: a type check)', () => {
    const fits = (g: Game): Export3pGame => g; // fails to compile if the engine stops offering courseAreaList, golf or groundHeightAt
    assert.equal(typeof fits, 'function');
    const inp = course(), got = export3pInputOf({ courseAreaList: () => inp.areas, golf: { tees: inp.tees, pins: inp.pins, aims: inp.aims }, groundHeightAt: ground }, 'Mine')!;
    assert.equal(got.areas, inp.areas); assert.equal(got.name, 'Mine'); assert.equal(got.heightAt!(10, 20), ground(10, 20));
    assert.equal(export3pInputOf({ courseAreaList: () => [], golf: null, groundHeightAt: () => 0 }), null);
  });

  it('an empty course exports an empty file', async () => {
    const file = await exportCourse3p({ areas: [], tees: [], pins: [], aims: [] });
    assert.deepEqual(file.features, {});
    assert.equal(file.height, undefined);
  });

  it('the Woodhill fixture, imported as the game imports it, exports back within 1 m of its source', async () => {
    const src = woodhillJson as unknown as OsmCourseJson, spec = osmCourseToSpec(src, { id: 'woodhill' });
    assert.equal(spec.scale, 1);
    const areas: CourseArea[] = spec.areas.filter(a => !a.clip).map((a, k) => ({ id: k + 1, surface: a.surf, pts: a.rings[0]! }));
    const mk = specMarkers(spec, 0, 0), inp: Export3pInput = { areas, ...mk }, f = frame3p(inp), file = await exportCourse3p(inp);
    // the file's metres back in the source's: tile (x, y) is at (originM[0] + 2x, originM[1] - 2y)
    const back = (X: number, Y: number): [number, number] => { const t = toTiles(f, X, Y); return [spec.originM[0] + 2 * t.x, spec.originM[1] - 2 * t.y]; };
    // every pin of the source within 1 m of the exported one
    const srcHoles = src.features.hole ?? [], outPins = file.features.pin ?? [];
    let matched = 0;
    for (const h of spec.holes) {
      const s = srcHoles.find(q => q.ref === h.ref), o = outPins.find(q => q.ref === h.n);
      if (!s?.line || !o?.pos) continue;
      const want = s.line[s.line.length - 1]!, got = back(o.pos[0], o.pos[1]);
      assert.ok(Math.hypot(got[0] - want[0], got[1] - want[1]) <= 1, `hole ${h.n} pin ${got} vs ${want}`);
      matched++;
    }
    assert.equal(matched, 18);
    // every green of the source has a point inside it that lies in an exported green
    const outGreens = polysOf(file, 'green').map(p => ({ outer: p.outer.map(([x, y]) => back(x, y)), inner: p.inner.map(r => r.map(([x, y]) => back(x, y))) }));
    for (const g of (src.features.green ?? []).flatMap(q => q.polys ?? [])) {
      const [x, y] = interiorPoint({ outer: g.outer, inner: g.inner });
      assert.ok(outGreens.some(p => inPoly(p, x, y)), `a source green at (${x.toFixed(0)}, ${y.toFixed(0)})`);
    }
  });
});

describe('T417 the playability check', () => {
  const inp = course(), holes = deriveHoles(inp.areas, inp.tees, inp.pins, inp.aims);
  it('a painted hole with a tee, a pin on its green and some length is playable', () => {
    for (const h of holes) assert.deepEqual(playable3p(h, inp.areas), { ok: true, reasons: [] });
  });
  it('a hole with its pin off the green cannot be opened, and says why in the hole card\'s words', () => {
    const pins = inp.pins.map(p => (p.hole === 1 ? { ...p, y: p.y + 40 } : p)), h1 = deriveHoles(inp.areas, inp.tees, pins, inp.aims).find(h => h.n === 1)!;
    const v = playable3p(h1, inp.areas);
    assert.equal(v.ok, false);
    assert.deepEqual(v.reasons, [PIN_OFF_GREEN]);
  });
  it('no pin, no tee, a pin or tee in the water and a hole too short each say so', () => {
    const noPin = deriveHoles(inp.areas, inp.tees, inp.pins.filter(p => p.hole !== 2), inp.aims).find(h => h.n === 2)!;
    assert.deepEqual(playable3p(noPin, inp.areas).reasons, ['No pin']);
    const noTee = deriveHoles(inp.areas, inp.tees.filter(t => t.hole !== 3), inp.pins, inp.aims).find(h => h.n === 3)!;
    assert.deepEqual(playable3p(noTee, inp.areas).reasons, ['No tee markers']);
    const wet = [...inp.areas, disc('water', 120, 403, 3), disc('water', 340, 309, 3)];
    const hs = deriveHoles(wet, inp.tees, inp.pins, inp.aims);
    assert.ok(playable3p(hs.find(h => h.n === 1)!, wet).reasons.includes(TEE_IN_WATER));
    assert.ok(playable3p(hs.find(h => h.n === 3)!, wet).reasons.includes(PIN_IN_WATER));
    const short = { ...holes[0]!, line: [{ x: 0, y: 0 }, { x: 15, y: 0 }], warnings: [] };
    assert.deepEqual(playable3p(short, inp.areas).reasons, [TOO_SHORT]);
  });
});

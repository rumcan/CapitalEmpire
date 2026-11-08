// T340 stage 2 (#967): the map-data course converter (src/game/golf/osm): the two shipped courses (Rondebosch, Magnolia National) and the fill-in rules
// on small made-up courses. Pure: no network, no DOM.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import rondeboschJson from '../src/game/golf/osm/data/rondebosch.json';
import magnoliaJson from '../src/game/golf/osm/data/magnolia-national.json';
import { OSM_COURSES, loadOsmSpec, osmCourseInfo, osmCourseToSpec, osmDisplayName } from '../src/game/golf/osm';
import { OSM_CREDIT, type OsmCourseJson, type OsmCourseSpec } from '../src/game/golf/osm/types';
import { paintSpec, specMarkers, surfAtTile } from '../src/game/golf/osm/raster';
import { SURF, makeGrid } from '../src/game/ext/course-grid';
import { gridAreas } from '../src/game/ext/course-grid/areas';
import { markerPlan } from '../src/game/golf/holeview';
import { OSM_EDGE, osmFits, planOsmGame } from '../src/game/golf/osm/start';
import { normalizeGolfSave } from '../src/game/golf/mode';
import { MAP } from '../src/game/iso';
import { deriveHoles, parFromLength } from '../src/game/golf/holes';

const ronde = rondeboschJson as unknown as OsmCourseJson, magnolia = magnoliaJson as unknown as OsmCourseJson;
const specR = osmCourseToSpec(ronde, { id: 'rondebosch', name: 'Rondebosch Golf Course' });
const specM = osmCourseToSpec(magnolia, { id: 'magnolia-national', name: 'Magnolia National' });

/** the spec's land as a grid (the land's corner at tile (10, 10) of the map) with the spec painted in */
function gridOf(spec: OsmCourseSpec) {
  const g = makeGrid(0, 0, (spec.w + 20) * 2, (spec.h + 20) * 2);
  const laid = paintSpec(g, spec, 10, 10);
  return { g, laid };
}
const count = (a: Uint8Array, v: number): number => { let c = 0; for (const x of a) if (x === v) c++; return c; };

describe('the shipped fixtures (T340)', () => {
  it('carry the ODbL credit in their header and no real brand names', () => {
    for (const j of [ronde, magnolia]) {
      assert.equal(j.meta?.credit, OSM_CREDIT);
      assert.match(j.meta?.licence ?? '', /ODbL/);
    }
    assert.ok(!/augusta|masters|rae's/i.test(JSON.stringify(magnolia)), 'the fixture names no real club');
    assert.equal(OSM_CREDIT, '© OpenStreetMap contributors');
  });
  it('are registered with the holes and par the converter finds', () => {
    const by = Object.fromEntries(OSM_COURSES.map(c => [c.id, c]));
    assert.equal(by.rondebosch!.holes, specR.holes.length);
    assert.equal(by.rondebosch!.par, specR.gameParTotal);
    assert.equal(by.rondebosch!.mappedPar, specR.parTotal);
    assert.equal(by['magnolia-national']!.holes, specM.holes.length);
    assert.equal(by['magnolia-national']!.par, specM.gameParTotal);
    assert.equal(by['magnolia-national']!.mappedPar, specM.parTotal);
    assert.ok(by['magnolia-national']!.name.startsWith('Magnolia'), 'a made-up name, not the club');
  });
});

describe('the loader (T340)', () => {
  it('loads a shipped course by its id (the same spec the converter makes), and null for any other', async () => {
    const r = await loadOsmSpec('rondebosch');
    assert.deepEqual(r, specR);
    assert.equal((await loadOsmSpec('magnolia-national'))?.holes.length, 18);
    assert.equal(await loadOsmSpec('augusta-national'), null, 'the real club is not a course the game ships');
    assert.equal(osmCourseInfo('nope'), undefined);
    assert.equal(osmCourseInfo(null), undefined);
    assert.equal(osmDisplayName('Magnolia National'), 'Magnolia National (from map data)');
  });
});

describe('Rondebosch (T340)', () => {
  it('has 18 holes in order, par 72 as mapped, each with a tee marker, a pin, a length and a par', () => {
    assert.equal(specR.holes.length, 18);
    specR.holes.forEach((h, i) => {
      assert.equal(h.n, i + 1);
      assert.equal(h.ref, i + 1);
      assert.ok(h.tees.length >= 1, `hole ${h.n} has a tee marker`);
      assert.ok(h.lengthM > 80 && h.lengthM < 600, `hole ${h.n} is ${h.lengthM} m`);
      assert.ok([3, 4, 5].includes(h.par));
      assert.ok(h.tagPar === h.par, `hole ${h.n}'s par is the mapped one`);
    });
    assert.equal(specR.parTotal, 72);
    assert.equal(specR.course, null);
    assert.equal(specR.otherCourses.length, 0);
  });
  it("keeps the mapped par where the game's own rule (golf/holes.ts parFromLength) would give another, by placing the tee marker within its tee", () => {
    for (const h of specR.holes) assert.equal(h.gamePar, h.par, `hole ${h.n}: the game works par ${h.gamePar}, the map says ${h.par} (${h.lengthM} m)`);
    assert.equal(specR.gameParTotal, 72);
  });
  it('lays tees, pins and greens on the right surface, hole by hole, once rasterised', () => {
    const { g, laid } = gridOf(specR), mk = specMarkers(specR, 10, 10);
    for (const p of mk.pins) {
      assert.equal(surfAtTile(g, p.x, p.y), SURF.green, `hole ${p.hole}'s pin is on a green cell`);
      const i = Math.floor((p.y - g.y0) / 0.5) * g.w + Math.floor((p.x - g.x0) / 0.5);
      assert.equal(g.hole[i], p.hole, `hole ${p.hole}'s pin is on its own green`);
    }
    for (const t of mk.tees) {
      assert.equal(surfAtTile(g, t.x, t.y), SURF.tee, `hole ${t.hole}'s ${t.kind} tee marker is on a tee cell`);
      const i = Math.floor((t.y - g.y0) / 0.5) * g.w + Math.floor((t.x - g.x0) / 0.5);
      assert.equal(g.hole[i], t.hole);
    }
    assert.equal(mk.pins.length, 18);
    assert.ok(laid.rough > 100000 && laid.fairway > 20000 && laid.green > 3000 && laid.bunker > 500 && laid.water > 500 && laid.tee > 1000, JSON.stringify(laid));
  });
  it("gives every par 4 and 5 fairway under most of its line (the middle 70%), and the game's holes have a playing line, a pin and a tee", () => {
    const { g } = gridOf(specR);
    for (const h of specR.holes) {
      if (h.par < 4) continue;
      let on = 0, n = 0;
      for (let k = 0; k + 3 < h.line.length; k += 2) for (let t = 0.15; t < 0.85; t += 0.05) {
        n++; if (surfAtTile(g, h.line[k]! + (h.line[k + 2]! - h.line[k]!) * t + 10, h.line[k + 1]! + (h.line[k + 3]! - h.line[k + 1]!) * t + 10) === SURF.fairway) on++;
      }
      assert.ok(on / n >= 0.6, `hole ${h.n} (par ${h.par}) runs over fairway for ${Math.round((100 * on) / n)}% of its line`);
    }
    const mk = specMarkers(specR, 10, 10), derived = deriveHoles([], mk.tees, mk.pins, mk.aims);
    assert.equal(derived.length, 18);
    for (const d of derived) { assert.ok(d.line.length >= 2, `hole ${d.n} has a playing line`); assert.ok(!d.warnings.includes('No pin') && !d.warnings.includes('No tee markers')); }
  });
  it('warns, never refuses, for the holes that run closer than the 60 m corridor guideline', () => {
    const close = specR.warnings.filter(w => w.code === 'hole-close');
    assert.ok(close.length >= 1 && close.length <= 30, `${close.length} close pairs`);
    for (const w of close) assert.match(w.text, /60 m corridor/);
  });
  it('is the same spec every time', () => {
    assert.deepEqual(osmCourseToSpec(ronde, { id: 'rondebosch', name: 'Rondebosch Golf Course' }), specR);
  });
  it('paints the stream and the ponds as water, and leaves the land inside the margin', () => {
    const { g } = gridOf(specR);
    assert.ok(count(g.surf, SURF.water) > 500);
    assert.ok(specR.w > 600 && specR.w < 800 && specR.h > 500 && specR.h < 700, `${specR.w} x ${specR.h} tiles`);
  });
});

describe('Magnolia National (T340): the 18 of a boundary that holds two courses', () => {
  it('builds the 18 holes (par 72), names the Par 3 Course as the other, and paints none of it', () => {
    assert.equal(specM.holes.length, 18);
    assert.equal(specM.parTotal, 72);
    assert.equal(specM.course, 'Magnolia National');
    assert.deepEqual(specM.otherCourses, [{ name: 'Par 3 Course', holes: 5 }]);
    assert.ok(specM.warnings.some(w => w.code === 'other-courses'));
    specM.holes.forEach((h, i) => assert.equal(h.n, i + 1));
  });
  it('lays pins on greens and tee markers on tees, and the creek and ponds as water', () => {
    const { g, laid } = gridOf(specM), mk = specMarkers(specM, 10, 10);
    for (const p of mk.pins) assert.equal(surfAtTile(g, p.x, p.y), SURF.green, `hole ${p.hole}`);
    for (const t of mk.tees) assert.equal(surfAtTile(g, t.x, t.y), SURF.tee, `hole ${t.hole} ${t.kind}`);
    assert.ok(laid.water > 1000 && laid.bunker > 2000 && laid.fairway > 50000, JSON.stringify(laid));
  });
});

// ---- the fill-in rules, on made-up courses (metres, x east, y north) ----
const sq = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const area = (outer: [number, number][], tags: Record<string, string> = {}) => ({ tags, polys: [{ outer, inner: [] as [number, number][][] }] });
/** one hole running north from (0, 0) to (0, len): a tee at its start, and what the caller adds */
function mini(extra: Partial<OsmCourseJson['features']> = {}, hole: { par?: string; ref?: string; course?: string; len?: number } = {}): OsmCourseJson {
  const len = hole.len ?? 350, tags: Record<string, string> = { golf: 'hole', ref: hole.ref ?? '1' };
  if (hole.par !== undefined) tags.par = hole.par; if (hole.course) tags['golf:course:name'] = hole.course;
  return { meta: { credit: OSM_CREDIT }, features: { hole: [{ tags, ref: Number(hole.ref ?? 1), line: [[0, 0], [0, len]] }], tee: [area(sq(-5, -6, 10, 12))], ...extra } };
}

describe('the fill-in rules (T340)', () => {
  it('makes a green of about 400 m2 where a line ends on none, a pin at its middle, and says so', () => {
    const s = osmCourseToSpec(mini(), { id: 't' });
    const g = s.areas.filter(a => a.surf === 'green');
    assert.equal(g.length, 1);
    assert.ok(g[0]!.made);
    assert.equal(s.holes[0]!.made.includes('green'), true);
    assert.ok(s.fills.some(f => f.code === 'green' && f.hole === 1));
    const r = g[0]!.rings[0]!; let a2 = 0;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) a2 += r[j]! * r[i + 1]! - r[i]! * r[j + 1]!;
    assert.ok(Math.abs(a2 / 2) * 4 > 330 && Math.abs(a2 / 2) * 4 < 420, `area ${Math.abs(a2 / 2) * 4} m2`); // tiles2 -> m2
    assert.equal(s.holes[0]!.pin.y > 0, true);
  });
  it('puts a pin at the green middle when none is mapped, and moves one that lies off its green', () => {
    const green = area(sq(-10, 340, 20, 20), { golf: 'green' });
    const none = osmCourseToSpec(mini({ green: [green] }), { id: 't' });
    assert.ok(none.fills.some(f => f.code === 'pin'));
    assert.ok(Math.abs(none.holes[0]!.pin.x - none.holes[0]!.line[none.holes[0]!.line.length - 2]!) < 6);
    const off = osmCourseToSpec(mini({ green: [green], pin: [{ pos: [0, 372] }] }), { id: 't' });
    assert.ok(off.fills.some(f => f.code === 'pin-moved'));
    const on = osmCourseToSpec(mini({ green: [green], pin: [{ pos: [3, 346] }] }), { id: 't' });
    assert.ok(!on.fills.some(f => f.code.startsWith('pin')), 'a pin on the green stays');
  });
  it('gets par from length when the line has none: up to 230 m par 3, up to 430 par 4, beyond par 5', () => {
    for (const [len, par] of [[150, 3], [350, 4], [500, 5]] as const) {
      const s = osmCourseToSpec(mini({}, { len }), { id: 't' });
      assert.equal(s.holes[0]!.tagPar, null);
      assert.equal(s.holes[0]!.par, par);
      assert.equal(parFromLength(s.holes[0]!.lengthM), par);
      assert.ok(s.fills.some(f => f.code === 'par'));
    }
  });
  it('makes a fairway band along a par 4 or 5 with none, not along a par 3, and none when the map has one', () => {
    const four = osmCourseToSpec(mini({}, { par: '4' }), { id: 't' });
    const band = four.areas.filter(a => a.surf === 'fairway');
    assert.ok(band.length >= 1 && band.every(a => a.made && a.clip));
    assert.ok(four.fills.some(f => f.code === 'fairway'));
    assert.equal(osmCourseToSpec(mini({}, { par: '3', len: 150 }), { id: 't' }).areas.filter(a => a.surf === 'fairway').length, 0);
    const mapped = osmCourseToSpec(mini({ fairway: [area(sq(-15, 40, 30, 280), { golf: 'fairway' })] }, { par: '4' }), { id: 't' });
    assert.ok(!mapped.fills.some(f => f.code === 'fairway'));
    assert.equal(mapped.areas.filter(a => a.surf === 'fairway').length, 1);
  });
  it('makes a tee where the line starts on none', () => {
    const j = mini({}, { par: '4' }); j.features.tee = [];
    const s = osmCourseToSpec(j, { id: 't' });
    assert.ok(s.areas.some(a => a.surf === 'tee' && a.made));
    assert.equal(s.holes[0]!.tees.length, 1);
    assert.ok(s.fills.some(f => f.code === 'tee'));
  });
  it('turns round a line drawn green to tee', () => {
    const j = mini({ green: [area(sq(-10, 340, 20, 20), { golf: 'green' })] }, { par: '4' });
    j.features.hole![0]!.line = [[0, 350], [0, 0]];
    const s = osmCourseToSpec(j, { id: 't' });
    assert.ok(s.warnings.some(w => w.code === 'reversed'));
    assert.ok(s.holes[0]!.tees[0]!.y > s.holes[0]!.pin.y, 'the tee is south of the pin');
  });
  it('turns bends into aim points (more than 10 degrees)', () => {
    const j = mini({}, { par: '4' });
    j.features.hole![0]!.line = [[0, 0], [0, 150], [60, 260], [60, 380]];
    const s = osmCourseToSpec(j, { id: 't' });
    assert.equal(s.holes[0]!.aims.length, 2);
  });
  it('warns of a double green and of holes too close, without refusing', () => {
    const g = area(sq(-10, 340, 20, 20), { golf: 'green' });
    const j = mini({ green: [g] }, { par: '4' });
    j.features.hole!.push({ tags: { golf: 'hole', ref: '2', par: '4' }, ref: 2, line: [[40, 0], [0, 350]] });
    j.features.tee!.push(area(sq(35, -6, 10, 12)));
    const s = osmCourseToSpec(j, { id: 't' });
    assert.equal(s.holes.length, 2);
    assert.ok(s.warnings.some(w => w.code === 'double-green'));
  });
  it('picks the course by its name tag, or the one with holes 1..18, and counts the others', () => {
    const j = mini({}, { par: '4', course: 'Main' });
    j.features.hole!.push({ tags: { golf: 'hole', ref: '1', par: '3', 'golf:course:name': 'Little' }, ref: 1, line: [[200, 0], [200, 120]] });
    j.features.hole!.push({ tags: { golf: 'hole', ref: '2', par: '3', 'golf:course:name': 'Little' }, ref: 2, line: [[300, 0], [300, 120]] });
    const auto = osmCourseToSpec(j, { id: 't' });
    assert.equal(auto.holes.length, 2); // (the group with the most numbered holes: Little has 1 and 2)
    const main = osmCourseToSpec(j, { id: 't', course: 'Main' });
    assert.equal(main.holes.length, 1);
    assert.deepEqual(main.otherCourses, [{ name: 'Little', holes: 2 }]);
  });
  it('builds no holes for a course with only a boundary, and says so', () => {
    const s = osmCourseToSpec({ features: {}, boundary: area(sq(-100, -100, 200, 200)) } as OsmCourseJson, { id: 't' });
    assert.equal(s.holes.length, 0);
    assert.ok(s.warnings.some(w => w.code === 'no-holes'));
    assert.ok(s.areas.some(a => a.surf === 'rough'));
  });
  it('keeps to 18 holes and numbers odd refs in order', () => {
    const j = mini({}, { par: '4' });
    for (let k = 2; k <= 20; k++) j.features.hole!.push({ tags: { golf: 'hole', ref: String(k), par: '4' }, ref: k, line: [[k * 30, 0], [k * 30, 300]] });
    const s = osmCourseToSpec(j, { id: 't' });
    assert.equal(s.holes.length, 18);
    assert.ok(s.warnings.some(w => w.code === 'hole-over-18'));
    const odd = mini({}, { par: '4', ref: '10' });
    assert.equal(osmCourseToSpec(odd, { id: 't' }).holes[0]!.n, 1);
    assert.ok(osmCourseToSpec(odd, { id: 't' }).warnings.some(w => w.code === 'renumbered'));
  });
});

describe('the rasterisation (T340)', () => {
  const spec = (areas: OsmCourseSpec['areas']): OsmCourseSpec => ({ ...specR, w: 40, h: 40, holes: [], areas });
  it('fills exactly the cells whose centre lies inside: a 10 m square is 100 cells; an inner ring is a hole', () => {
    const g = makeGrid(0, 0, 80, 80);
    // tiles: a square from (5, 5) to (10, 10) is 10 m x 10 m
    paintSpec(g, spec([{ surf: 'fairway', hole: 3, rings: [[5, 5, 10, 5, 10, 10, 5, 10]] }]), 0, 0);
    assert.equal(count(g.surf, SURF.fairway), 100);
    assert.equal(count(g.hole, 3), 100);
    const h = makeGrid(0, 0, 80, 80);
    paintSpec(h, spec([{ surf: 'rough', hole: 0, rings: [[5, 5, 15, 5, 15, 15, 5, 15], [8, 8, 12, 8, 12, 12, 8, 12]] }]), 0, 0);
    assert.equal(count(h.surf, SURF.rough), 400 - 64);
  });
  it('paints in order: water leaves a green and a tee alone, a clipped band lays only over rough, a later surface covers an earlier', () => {
    const g = makeGrid(0, 0, 80, 80);
    const sqr = (x: number, y: number, s: number) => [x, y, x + s, y, x + s, y + s, x, y + s];
    paintSpec(g, spec([
      { surf: 'rough', hole: 0, rings: [sqr(0, 0, 20)] },
      { surf: 'green', hole: 1, rings: [sqr(2, 2, 4)] },
      { surf: 'water', hole: 0, rings: [sqr(0, 0, 10)] },
      { surf: 'fairway', hole: 1, rings: [sqr(0, 0, 30)], made: true, clip: true },
    ]), 0, 0);
    assert.equal(surfAtTile(g, 3, 3), SURF.green); // the green survives the water
    assert.equal(surfAtTile(g, 8, 8), SURF.water); // water over rough
    assert.equal(surfAtTile(g, 15, 15), SURF.fairway); // the band over rough
    assert.equal(surfAtTile(g, 25, 25), SURF.none); // and not outside the rough
  });
});

describe("the game's own course checks on the imported courses (T340)", () => {
  for (const [name, spec] of [['Rondebosch', specR], ['Magnolia National', specM]] as const) {
    it(`${name}: markerPlan (golf/holeview.ts) leaves every pin and tee marker where the import put it, and no hole is short a green, a tee or a pin`, () => {
      const { g } = gridOf(spec), mk = specMarkers(spec, 10, 10);
      const areas = gridAreas(g, Array.from({ length: 18 }, (_, i) => i + 1));
      const ops = markerPlan(areas, mk.pins, mk.tees);
      assert.deepEqual(ops, [], `markerPlan moved or removed: ${JSON.stringify(ops.slice(0, 3))}`);
      for (let n = 1; n <= 18; n++) {
        assert.ok(areas.some(a => a.hole === n && a.surface === 'green'), `hole ${n} has a green`);
        assert.ok(areas.some(a => a.hole === n && a.surface === 'tee'), `hole ${n} has a tee`);
      }
    });
  }
});

describe("a game on a map-data course: where everything goes (T340)", () => {
  const rectsMeet = (a: number[], b: number[]) => a[0]! < b[0]! + b[2]! && b[0]! < a[0]! + a[2]! && a[1]! < b[1]! + b[3]! && b[1]! < a[1]! + a[3]!;
  for (const [name, spec] of [['Rondebosch', specR], ['Magnolia National', specM]] as const) {
    it(`${name}: the land is centred and clear of the map's edge, the clubhouse parcel, car park and road keep off it, the grid holds it all with its markers right`, () => {
      const p = planOsmGame(spec)!;
      assert.ok(p, 'it fits the 1024-tile map');
      const [lx, ly, lw, lh] = p.land;
      assert.ok(lx >= OSM_EDGE && ly >= OSM_EDGE && lx + lw <= MAP - OSM_EDGE && ly + lh <= MAP - OSM_EDGE, 'away from the map edge');
      assert.ok(!rectsMeet(p.land, p.venue) && !rectsMeet(p.land, p.carpark) && !rectsMeet(p.venue, p.carpark), 'land, venue and car park apart');
      const leg = p.road[0]!;
      assert.equal(leg.a.x, 0, 'the road enters at the west edge');
      assert.ok(leg.b.x < p.venue[0], 'and ends before the clubhouse parcel');
      assert.ok(p.drive[0]!.b.x < p.venue[0] + 1 && p.drive[0]!.b.x > p.venue[0] - 8, 'the drive ends at the clubhouse door');
      const g = p.grid, [px, py, pw, ph] = p.save.parcel;
      assert.ok(g.x0 <= px && g.y0 <= py && g.x0 + g.w * 0.5 >= px + pw && g.y0 + g.h * 0.5 >= py + ph, 'the grid holds the parcel');
      const mk = specMarkers(spec, p.at.x, p.at.y);
      for (const q of mk.pins) assert.equal(surfAtTile(g, q.x, q.y), SURF.green, `hole ${q.hole}'s pin`);
      for (const t of mk.tees) assert.equal(surfAtTile(g, t.x, t.y), SURF.tee, `hole ${t.hole}'s ${t.kind}`);
      // the golf state reads back whole, with the credit
      const n = normalizeGolfSave(JSON.parse(JSON.stringify(p.save)))!;
      assert.equal(n.osm?.id, spec.id);
      assert.equal(n.osm?.credit, '© OpenStreetMap contributors');
      assert.equal(n.osm?.holes, 18);
      assert.equal(n.start, undefined, "the old start's rules");
    });
  }
  it('says no when the land does not fit the map', () => {
    assert.equal(osmFits({ ...specR, w: 1000, h: 400 }), false);
    assert.equal(osmFits({ ...specR, w: 400, h: 1000 }), false);
    assert.equal(planOsmGame({ ...specR, w: 1000, h: 400 }), null);
    assert.equal(osmFits(specR), true);
  });
});

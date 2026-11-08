// T340 stage 2 (#967): the map-data course converter (src/game/golf/osm): the two shipped courses (Rondebosch, Magnolia National) and the fill-in rules
// on small made-up courses. Pure: no network, no DOM.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import rondeboschJson from '../src/game/golf/osm/data/rondebosch.json';
import magnoliaJson from '../src/game/golf/osm/data/magnolia-national.json';
import woodhillJson from '../src/game/golf/osm/data/woodhill.json';
import wingateJson from '../src/game/golf/osm/data/wingatepark.json';
import { OSM_COURSES, loadOsmSpec, osmCourseInfo, osmCourseToSpec, osmDisplayName, specOf } from '../src/game/golf/osm';
import { deriveHoleLines, longAxis, type DArea } from '../src/game/golf/osm/derive';
import { OSM_CREDIT, type OsmCourseJson, type OsmCourseSpec } from '../src/game/golf/osm/types';
import { paintSpec, specMarkers, surfAtTile } from '../src/game/golf/osm/raster';
import { SURF, makeGrid } from '../src/game/ext/course-grid';
import { gridAreas } from '../src/game/ext/course-grid/areas';
import { markerPlan } from '../src/game/golf/holeview';
import { OSM_EDGE, osmFits, osmLandX, osmScaleFor, planOsmGame } from '../src/game/golf/osm/start';
import { normalizeGolfSave } from '../src/game/golf/mode';
import { MAP } from '../src/game/iso';
import { deriveHoles, parFromLength } from '../src/game/golf/holes';

const ronde = rondeboschJson as unknown as OsmCourseJson, magnolia = magnoliaJson as unknown as OsmCourseJson;
const specR = osmCourseToSpec(ronde, { id: 'rondebosch', name: 'Rondebosch Golf Course' });
const specM = osmCourseToSpec(magnolia, { id: 'magnolia-national', name: 'Magnolia National' });
const woodhill = woodhillJson as unknown as OsmCourseJson, wingate = wingateJson as unknown as OsmCourseJson;
const NAMES = { id: 'x', name: 'x', place: '' };
/** Woodhill as the game builds it (scaled to fit the map) and at true size */
const specWh = specOf(woodhill, { ...NAMES, id: 'woodhill' }), specWh1 = osmCourseToSpec(woodhill, { id: 'woodhill' });
const specWg = specOf(wingate, { ...NAMES, id: 'wingatepark' });

/** the spec's land as a grid (the land's corner at tile (10, 10) of the map) with the spec painted in */
function gridOf(spec: OsmCourseSpec) {
  const g = makeGrid(0, 0, (spec.w + 20) * 2, (spec.h + 20) * 2);
  const laid = paintSpec(g, spec, 10, 10);
  return { g, laid };
}
const count = (a: Uint8Array, v: number): number => { let c = 0; for (const x of a) if (x === v) c++; return c; };

describe('the shipped fixtures (T340)', () => {
  it('carry the ODbL credit in their header and no real brand names', () => {
    for (const j of [ronde, magnolia, woodhill, wingate]) {
      assert.equal(j.meta?.credit, OSM_CREDIT);
      assert.match(j.meta?.licence ?? '', /ODbL/);
    }
    assert.ok(!/augusta|masters|rae's/i.test(JSON.stringify(magnolia)), 'the fixture names no real club');
    assert.equal(OSM_CREDIT, '© OpenStreetMap contributors');
  });
  it('are registered with the holes, par, scale and derivation the game builds them with', async () => {
    assert.deepEqual(OSM_COURSES.map(c => c.id), ['rondebosch', 'magnolia-national', 'woodhill', 'wingatepark']);
    for (const c of OSM_COURSES) {
      const spec = (await loadOsmSpec(c.id))!;
      assert.equal(c.holes, spec.holes.length, `${c.id}: holes`);
      assert.equal(c.par, spec.gameParTotal, `${c.id}: par as the game works it out`);
      assert.equal(c.mappedPar, spec.parTotal, `${c.id}: par as mapped`);
      assert.equal(c.scale ?? 1, spec.scale, `${c.id}: scale`);
      assert.equal(!!c.derived, spec.derived, `${c.id}: holes derived`);
    }
    assert.ok(osmCourseInfo('magnolia-national')!.name.startsWith('Magnolia'), 'a made-up name, not the club');
    assert.equal(osmCourseInfo('wingatepark')!.name, 'Wingate Park Country Club');
    assert.equal(osmCourseInfo('woodhill')!.name, 'Woodhill Country Club');
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

describe('Woodhill (T340): fully mapped, too big for the 2 km map at true size', () => {
  it('has 18 holes in order, par 73 as mapped, every tee marker and pin on its surface and its hole once rasterised', () => {
    assert.equal(specWh1.holes.length, 18);
    specWh1.holes.forEach((h, i) => { assert.equal(h.n, i + 1); assert.equal(h.ref, i + 1); assert.ok(h.tees.length >= 1 && h.tagPar !== null); });
    assert.equal(specWh1.parTotal, 73);
    assert.equal(specWh.holes.length, 18);
    assert.equal(specWh.parTotal, 73, 'the mapped par is kept whatever the scale');
    const { g } = gridOf(specWh), mk = specMarkers(specWh, 10, 10);
    for (const p of mk.pins) assert.equal(surfAtTile(g, p.x, p.y), SURF.green, `hole ${p.hole}'s pin`);
    for (const t of mk.tees) assert.equal(surfAtTile(g, t.x, t.y), SURF.tee, `hole ${t.hole}'s ${t.kind} tee marker`);
    assert.equal(mk.pins.length, 18);
  });
  it("keeps the mapped par 4 of hole 2 (189 m) and lets the game's par from length show: a warning, not a refusal", () => {
    const h2 = specWh1.holes[1]!;
    assert.equal(h2.tagPar, 4);
    assert.equal(h2.par, 4, "the mapped par is the hole's par in the spec");
    assert.equal(h2.gamePar, 3, 'the game works par 3 out from 192 m');
    assert.ok(h2.lengthM > 185 && h2.lengthM < 200, `${h2.lengthM} m`);
    assert.ok(specWh1.warnings.some(w => w.code === 'par-differs' && w.hole === 2));
    assert.equal(specWh1.gameParTotal, 72);
  });
  it('is bigger than the map at true size (1079 tiles wide), so the game scales it to 84% and says so; the scaled land fits', () => {
    assert.ok(specWh1.w > 1024 - OSM_EDGE - 78, `${specWh1.w} tiles wide at true size`);
    assert.equal(osmFits(specWh1), false);
    assert.equal(osmScaleFor(specWh1.w, specWh1.h), 0.84);
    assert.equal(specWh.scale, 0.84);
    assert.equal(osmFits(specWh), true);
    assert.ok(specWh.warnings.some(w => w.code === 'scaled' && /84%/.test(w.text)));
    assert.ok(specWh.lengthM > specWh1.lengthM * 0.8 && specWh.lengthM < specWh1.lengthM * 0.88, `${specWh.lengthM} against ${specWh1.lengthM} m`);
    const p = planOsmGame(specWh)!;
    assert.ok(p, 'a game can be planned on it');
    assert.ok(p.land[0] >= 78 && p.land[0] + p.land[2] <= 1024 - OSM_EDGE, 'off centre: room on the west for the clubhouse parcel and road, the east edge kept');
    assert.ok(p.venue[0] + p.venue[2] < p.land[0], 'the clubhouse parcel stays west of the land');
    assert.equal(planOsmGame(specWh1), null, 'at true size the plan says no');
  });
  it('keeps the estate boundary as course land (the housing inside it is not cut out), and the rest of the data as for any course', () => {
    assert.ok(specWh1.counts.boundary! >= 1 && specWh1.counts.rough! >= 10);
    assert.ok(specWh1.fills.some(f => f.code === 'stream-hidden'), 'a tunnelled waterway is not drawn');
    for (const h of specWh1.holes) assert.ok(h.made.length === 0, `hole ${h.n} needed nothing made up`);
    assert.deepEqual(osmCourseToSpec(woodhill, { id: 'woodhill' }), specWh1);
  });
});

describe('Wingate Park (T340): holes worked out from the fairways (the map has no hole lines)', () => {
  it("derives 3 holes, marked as a guess, with their par from length and a pin at each green's middle", () => {
    assert.equal(specWg.holes.length, 3);
    assert.equal(specWg.derived, true);
    assert.ok(specWg.warnings.some(w => w.code === 'holes-derived' && /guess/.test(w.text)));
    assert.equal(specWg.warnings.filter(w => w.code === 'derive-skipped').length, 0, 'every fairway made a hole');
    for (const h of specWg.holes) {
      assert.equal(h.tagPar, null);
      assert.equal(h.par, h.gamePar);
      assert.ok(h.made.includes('pin') && h.made.includes('par'));
      assert.ok(h.lengthM > 300 && h.lengthM < 520, `hole ${h.n} is ${h.lengthM} m`);
      assert.ok(h.tees.length >= 1);
    }
    assert.deepEqual(specWg.holes.map(h => h.par), [4, 5, 4]);
    assert.equal(specWg.parTotal, 13);
    assert.equal(specWg.fills.filter(f => f.code === 'pin').length, 3);
  });
  it('orders them by walking: the north hole first, each green beside the next tee, the south hole last', () => {
    type H = (typeof specWg.holes)[number];
    const [a, b, c] = specWg.holes as [H, H, H];
    const m = (h: H) => h.tees.find(t => t.kind === 'middle') ?? h.tees[0]!, d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) * 2;
    assert.ok(m(a).y < m(b).y && m(b).y < m(c).y, 'the tees run from the north (a smaller y: tiles count south) to the south');
    assert.ok(d(a.pin, m(b)) < 130, `the first green is ${Math.round(d(a.pin, m(b)))} m from the second tee`);
    assert.ok(d(b.pin, m(c)) < 130, `the second green is ${Math.round(d(b.pin, m(c)))} m from the third tee`);
    assert.ok(d(m(a), c.pin) > 500 && d(m(a), b.pin) > 500, 'the first tee is far from every green: nobody walked to it');
    assert.ok(c.pin.x > a.pin.x && c.pin.x > b.pin.x, 'the third green is the east tip');
    assert.ok(b.lengthM > a.lengthM && b.lengthM > c.lengthM, 'the middle hole is the long one');
  });
  it("lays tee markers and pins on their surfaces, keeps the leftover tees as tee ground with no hole, and the game's markerPlan leaves every marker", () => {
    const { g, laid } = gridOf(specWg), mk = specMarkers(specWg, 10, 10);
    for (const p of mk.pins) assert.equal(surfAtTile(g, p.x, p.y), SURF.green, `hole ${p.hole}'s pin`);
    for (const t of mk.tees) assert.equal(surfAtTile(g, t.x, t.y), SURF.tee, `hole ${t.hole}'s ${t.kind}`);
    assert.ok(specWg.areas.filter(a => a.surf === 'tee' && a.hole === 0).length >= 3, 'the three tees no fairway leads to stay as features');
    assert.ok(laid.rough > 10000 && laid.fairway > 3000 && laid.green > 500 && laid.bunker > 100 && laid.tee > 100 && laid.water > 50, JSON.stringify(laid));
    const areas = gridAreas(g, [1, 2, 3]);
    assert.deepEqual(markerPlan(areas, mk.pins, mk.tees), []);
    for (let n = 1; n <= 3; n++) { assert.ok(areas.some(a => a.hole === n && a.surface === 'green')); assert.ok(areas.some(a => a.hole === n && a.surface === 'tee')); }
    const derived = deriveHoles([], mk.tees, mk.pins, mk.aims);
    assert.equal(derived.length, 3);
    assert.ok(derived.every(d => d.line.length >= 2));
  });
  it('is the same every time, and has no holes at all with derive off', () => {
    assert.deepEqual(osmCourseToSpec(wingate, { id: 'wingatepark' }), osmCourseToSpec(wingate, { id: 'wingatepark' }));
    const off = osmCourseToSpec(wingate, { id: 'wingatepark', derive: false });
    assert.equal(off.holes.length, 0);
    assert.ok(off.warnings.some(w => w.code === 'no-holes') && !off.warnings.some(w => w.code === 'holes-derived'));
  });
  it('fits the map at true size and a game plans on it', () => {
    assert.equal(specWg.scale, 1);
    assert.equal(osmFits(specWg), true);
    const p = planOsmGame(specWg)!;
    assert.ok(p);
    assert.equal(p.save.osm?.derived, true);
    assert.equal(p.save.osm?.holes, 3);
    assert.equal(osmLandX(specWg.w), Math.round((1024 - specWg.w) / 2), 'centred');
  });
});

/** a rectangle polygon (metres) as the derivation reads it */
const rect = (x: number, y: number, w: number, h: number): DArea => ({ poly: { outer: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], inner: [] }, c: [x + w / 2, y + h / 2] });

describe('the derivation of holes from fairways (T340)', () => {
  it('finds the long axis: a 20 x 300 m fairway has its ends a corner to corner apart', () => {
    const [a, b] = longAxis(rect(0, 0, 20, 300).poly);
    assert.ok(Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1]) - Math.hypot(20, 300)) < 1);
    assert.ok(Math.abs(a[1] - b[1]) > 290);
  });
  it('takes the green within 40 m of an end (either end), the tees beyond the other end, and walks the holes in order', () => {
    // two holes going south: tees at y 380, a fairway 70..330, a green at 30; the next tee 60 m from that green, its fairway -90..200, its green at -125
    const fw = [rect(0, 70, 30, 260), rect(80, -90, 30, 290)], gr = [rect(5, 30, 20, 25), rect(85, -125, 20, 25)];
    const tees = [rect(8, 380, 14, 10), rect(10, 350, 8, 6), rect(60, 215, 14, 10)];
    const d = deriveHoleLines(fw, gr, tees);
    assert.equal(d.holes.length, 2);
    assert.deepEqual(d.skipped, []);
    assert.ok(d.holes[0]!.pts[0]![1] > 300, 'the first hole starts at the tee in the north');
    assert.equal(d.holes[0]!.tees.length, 2, "both tee boxes at the first hole's start are its tees");
    assert.equal(d.holes[0]!.tees[0], tees[0], 'the largest first');
    assert.ok(d.holes[1]!.pts[0]![1] < 250, 'the second hole follows');
    // the input in another order gives the same holes
    const d2 = deriveHoleLines([fw[1]!, fw[0]!], [gr[1]!, gr[0]!], [tees[2]!, tees[1]!, tees[0]!]);
    assert.deepEqual(d2.holes.map(h => h.pts[0]), d.holes.map(h => h.pts[0]));
  });
  it('leaves a fairway out, and says why, when no green is near an end or no tee lies within 300 m beyond the other', () => {
    const noGreen = deriveHoleLines([rect(0, 0, 30, 200)], [rect(200, 0, 20, 20)], [rect(5, 230, 14, 10)]);
    assert.equal(noGreen.holes.length, 0);
    assert.match(noGreen.skipped[0]!, /no green within 40 m/);
    const farTee = deriveHoleLines([rect(0, 0, 30, 200)], [rect(5, -30, 20, 20)], [rect(5, 700, 14, 10)]);
    assert.equal(farTee.holes.length, 0);
    assert.match(farTee.skipped[0]!, /no tee within 300 m/);
    const sideTee = deriveHoleLines([rect(0, 0, 30, 200)], [rect(5, -30, 20, 20)], [rect(300, 230, 14, 10)]);
    assert.equal(sideTee.holes.length, 0, "a tee far off the axis is not this fairway's");
    const short = deriveHoleLines([rect(0, 0, 20, 30)], [rect(5, -30, 20, 20)], [rect(5, 60, 14, 10)]);
    assert.match(short.skipped[0]!, /under 60 m/);
  });
  it('gives a green to one hole only', () => {
    const d = deriveHoleLines([rect(0, 0, 30, 200), rect(60, 0, 30, 200)], [rect(35, -30, 20, 20)], [rect(5, 230, 14, 10), rect(65, 230, 14, 10)]);
    assert.equal(d.holes.length, 1);
    assert.match(d.skipped[0]!, /shares its/);
  });
  it('in the converter: a course with fairways, greens and tees and no hole lines gets holes, marked as derived; one with hole lines does not', () => {
    const fwp = (f: DArea) => ({ polys: [{ outer: f.poly.outer.map(p => [p[0], p[1]] as [number, number]), inner: [] as [number, number][][] }] });
    const j: OsmCourseJson = { features: { fairway: [fwp(rect(0, 70, 30, 260))], green: [fwp(rect(5, 30, 20, 25))], tee: [fwp(rect(8, 380, 14, 10))] } };
    const s = osmCourseToSpec(j, { id: 'd' });
    assert.equal(s.holes.length, 1);
    assert.equal(s.derived, true);
    assert.ok(s.warnings.some(w => w.code === 'holes-derived'));
    assert.equal(osmCourseToSpec(mini({ green: [area(sq(-10, 340, 20, 20), { golf: 'green' })] }, { par: '4' }), { id: 't' }).derived, false);
  });
  it('scaling: every coordinate times k; the land and the lengths shrink with it', () => {
    const half = osmCourseToSpec(ronde, { id: 'r', scale: 0.5 });
    assert.equal(half.scale, 0.5);
    assert.ok(half.warnings.some(w => w.code === 'scaled'));
    assert.ok(half.lengthM > specR.lengthM * 0.45 && half.lengthM < specR.lengthM * 0.55, `${half.lengthM} against ${specR.lengthM}`);
    assert.ok(half.w < specR.w * 0.6 && half.w > specR.w * 0.45);
    assert.equal(osmCourseToSpec(ronde, { id: 'r', scale: 1 }).scale, 1);
    assert.equal(osmScaleFor(500, 500), 1);
  });
});

// T219 (#594, P27): the iconic places. Each place is in the place file as a whole preset the game can draw; it is due only once its town has
// its residents, and once per map; its site is a free frontage of its own size on an axis street, facing that street (the street on the
// footprint's front edge, the preset frame turned to it), the same for the same seed; it draws every prop of its preset, never mirrored, on
// its footprint at each of the four facings; and the save keeps it. Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PLACE_DEFS, duePlaces, findSite, placeBox, placeDef, placeDefsFrom, placeGeom, placeName, placeTuples, placesFromTuples, SITE_GAP, type Box4, type PlacedPlace, type SiteSeg } from '../src/game/lots/iconic';
import { composeWhole } from '../src/game/lots/compose';
import { frameOf } from '../src/game/lots/preset-frame';
import { hasSprite } from '../src/game/lots/preset-art';
import { ART_FIXES, FRONT_DIR, fixedArt } from '../src/game/lots/art-fix';
import { LIBRARY } from '../src/game/library';
import { vehicleHeading } from '../src/game/vehicles';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const drive = placeDef('drive-in')!, school = placeDef('high-school')!;

/** a town of streets on a 40-tile grid (x and y from lo to hi), a long main road along y = main beyond it, as site segs; off: street h + walk */
function town(lo = 0, hi = 160, main = 200): SiteSeg[] {
  const out: SiteSeg[] = [];
  for (let v = lo; v <= hi; v += 40) for (let a = lo; a < hi; a += 40) {
    out.push({ key: `h${v},${a}`, ax: a, ay: v, bx: a + 40, by: v, off: 2.65, order: 1 });
    out.push({ key: `v${v},${a}`, ax: v, ay: a, bx: v, by: a + 40, off: 2.65, order: 1 });
  }
  out.push({ key: 'main', ax: -200, ay: main, bx: 400, by: main, off: 4.5, order: 3 });
  return out;
}
const overlap = (a: Box4, b: Box4, m = 0) => a[0] < b[2] + m && a[2] > b[0] - m && a[1] < b[3] + m && a[3] > b[1] - m;
/** the roads' own rectangles (the verge included): a footprint touching one is not free */
const roadBoxes = (segs: readonly SiteSeg[]): Box4[] => segs.map(s => [Math.min(s.ax, s.bx) - s.off, Math.min(s.ay, s.by) - s.off, Math.max(s.ax, s.bx) + s.off, Math.max(s.ay, s.by) + s.off]);
const freeOf = (segs: readonly SiteSeg[], built: Box4[] = []) => { const rb = roadBoxes(segs); return (b: Box4) => !rb.some(r => overlap(r, b, -0.1)) && !built.some(r => overlap(r, b)); };

describe('the place file', () => {
  it('holds the drive-in and the high school as whole presets of their sizes, every picture known, every stand-in in use', () => {
    assert.ok(drive && school);
    assert.deepEqual([drive.preset.w, drive.preset.d, drive.pop], [30, 20, 1500]);
    assert.deepEqual([school.preset.w, school.preset.d, school.pop], [50, 35, 3000]);
    for (const d of PLACE_DEFS) {
      assert.equal(d.preset.whole, true, d.id);
      assert.notEqual(d.preset.approved, true, `${d.id} is never an ordinary lot's preset`);
      for (const q of d.preset.props) assert.ok(hasSprite(q.id), `${d.id}: ${q.id} is in the library`);
      for (const id of Object.keys(d.standIns)) assert.ok(d.preset.props.some(q => q.id === id), `${d.id}: stand-in ${id} is used`);
      for (const q of d.preset.props) assert.ok(q.x >= 0 && q.x <= d.preset.w && q.y >= -1.5 && q.y <= d.preset.d, `${d.id}: ${q.id} inside its footprint`);
    }
  });
  it('names a place after its town, or alone before the town has a name', () => {
    assert.equal(placeName(drive, 'Maple Falls'), 'Maple Falls Drive-In');
    assert.equal(placeName(school, 'Maple Falls'), 'Maple Falls High');
    assert.equal(placeName(drive, null), 'The Drive-In');
  });
  it('drops a bad place and keeps the rest', () => {
    const good = { id: 'x', name: '{town} X', kind: 'X', pop: 10, preset: { ...drive.preset } };
    const defs = placeDefsFrom({ places: [good, { ...good, id: 'y', pop: 'lots' }, { ...good, id: 'z', preset: { ...drive.preset, whole: false } }, { ...good }] });
    assert.deepEqual(defs.map(d => d.id), ['x']);
  });
});

describe('when a place is due', () => {
  it('is never placed before its size, and once per map', () => {
    assert.deepEqual(duePlaces(0, new Set()), []);
    assert.deepEqual(duePlaces(1499, new Set()), []);
    assert.deepEqual(duePlaces(1500, new Set()).map(d => d.id), ['drive-in']);
    assert.deepEqual(duePlaces(2999, new Set()).map(d => d.id), ['drive-in']);
    assert.deepEqual(duePlaces(5000, new Set()).map(d => d.id), ['drive-in', 'high-school']);
    assert.deepEqual(duePlaces(5000, new Set(['drive-in'])).map(d => d.id), ['high-school']);
    assert.deepEqual(duePlaces(1e9, new Set(['drive-in', 'high-school'])), []);
  });
});

describe('where a place goes', () => {
  const segs = town(), centre = { x: 80, y: 80 };
  for (const def of [drive, school]) {
    it(`${def.id}: a free footprint of its size on an axis street, facing it`, () => {
      const free = freeOf(segs), p = findSite(def, { segs, centre, seed: 7, free });
      assert.ok(p, 'a site');
      const b = placeBox(p, def), g = placeGeom(p, def);
      assert.ok(free(b), 'its land is free');
      assert.ok(Math.abs((b[2] - b[0]) * (b[3] - b[1]) - def.preset.w * def.preset.d) < 1e-6, 'its own size');
      // the street runs along its front edge (the frame's origin side, -n), at the verge: some seg lies off + SITE_GAP in front of the origin
      const st = segs.find(s => (g.n.x !== 0
        ? s.ax === s.bx && Math.abs(s.ax - (g.o.x - g.n.x * (s.off + SITE_GAP))) < 1e-6 && Math.max(s.ay, s.by) > b[1] && Math.min(s.ay, s.by) < b[3]
        : s.ay === s.by && Math.abs(s.ay - (g.o.y - g.n.y * (s.off + SITE_GAP))) < 1e-6 && Math.max(s.ax, s.bx) > b[0] && Math.min(s.ax, s.bx) < b[2]));
      assert.ok(st, `a street along its front edge (${JSON.stringify(p)})`);
      // the preset frame turns with the street (never mirrored): frameOf keeps the origin and its quarter is the place's
      const f = frameOf(g);
      assert.deepEqual([f.o.x, f.o.y, f.q], [p.x, p.y, p.q]);
      assert.equal(g.u.x * g.n.y - g.u.y * g.n.x, -1, 'u is n turned a quarter (a turn, not a mirror)');
    });
  }
  it('is the same for the same seed, and varies with the seed', () => {
    const free = freeOf(segs), at = (seed: number) => JSON.stringify(findSite(drive, { segs, centre, seed, free }));
    assert.equal(at(11), at(11));
    assert.ok(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(at)).size > 1, 'another map, another spot');
  });
  it('the main road first, and never on built land or another place', () => {
    const free = freeOf(segs), p = findSite(school, { segs, centre, seed: 3, free })!, b = placeBox(p, school);
    assert.ok(Math.abs(b[1] - (200 + 4.5 + SITE_GAP)) < 1e-6 || Math.abs(b[3] - (200 - 4.5 - SITE_GAP)) < 1e-6, `on the main road (${JSON.stringify(b)})`);
    const q = findSite(school, { segs, centre, seed: 3, free: freeOf(segs, [b]) })!;
    assert.ok(!overlap(placeBox(q, school), b), 'not on the first one');
  });
  it('finds none when no land is free', () => {
    assert.equal(findSite(drive, { segs, centre, seed: 1, free: () => false }), null);
    assert.equal(findSite(drive, { segs, centre: { x: 5000, y: 5000 }, seed: 1, free: () => true }), null, 'none within reach');
  });
});

describe('how a place draws', () => {
  for (const def of [drive, school]) for (const q of [0, 1, 2, 3] as const) {
    it(`${def.id} facing ${q}: every prop of its preset, none mirrored, on its footprint`, () => {
      const p: PlacedPlace = { id: def.id, x: 100, y: 100, q }, g = placeGeom(p, def), b = placeBox(p, def), c = composeWhole(g, def.preset, 5);
      assert.equal(c.props.length, def.preset.props.length);
      for (const r of c.props) {
        const from = def.preset.props[r.from!.prop]!;
        if (!/fence|chainlink/.test(r.id)) assert.equal(r.flip, false, `${r.id} mirrored`);
        assert.ok(from, 'from its preset');
      }
      assert.ok(c.ground.length >= def.preset.patches.length);
      for (const a of c.ground) for (let i = 0; i < a.pts.length; i += 2) assert.ok(a.pts[i]! >= b[0] - 2.01 && a.pts[i]! <= b[2] + 2.01 && a.pts[i + 1]! >= b[1] - 2.01 && a.pts[i + 1]! <= b[3] + 2.01, 'its ground on its land');
    });
  }
});

describe('the save', () => {
  it('keeps each place once, and drops what it does not know', () => {
    const list: PlacedPlace[] = [{ id: 'drive-in', x: 10.5, y: 20, q: 3 }, { id: 'high-school', x: 1, y: 2, q: 0 }];
    assert.deepEqual(placesFromTuples(placeTuples(list)), list);
    assert.deepEqual(placesFromTuples([['drive-in', 1, 2, 1], ['drive-in', 3, 4, 2], ['mall', 1, 1, 0], ['high-school', 1, 2, 7], 'x']), [{ id: 'drive-in', x: 1, y: 2, q: 1 }]);
    assert.deepEqual(placesFromTuples(undefined), []);
  });
});

// the drive-in's screen is the library's own picture (T219 follow-up, #594): its footprint lies along its picture and its picture on the lot, at every facing
const SCREEN = 'variation:ref-building-drive-in-screen-b0bccc2a-plain:1', fix = ART_FIXES[SCREEN]!;
/** the pictures whose long side runs along the world x (read off the sheets: NE and SW; SE and NW run along y) */
const LONG_X = new Set([SCREEN, `view:${SCREEN}:sw`]);
const lib = new Map(LIBRARY.map(i => [i.id, i]));
/** the world direction a car picture's heading looks (preset-art.ts CAR8: the heading's index times an eighth turn, atan2 over the world x, y) */
// (T236: a wagon or a vehicle of the mix the parked wagons take, vehicles.ts parkedAs)
const carDir = (id: string) => {
  const h = vehicleHeading(id); if (h < 0) return null;
  const a = h * Math.PI / 4;
  return { x: Math.round(Math.cos(a)) + 0, y: Math.round(Math.sin(a)) + 0 };
};

describe('the drive-in screen', () => {
  it('is the library picture, once, not a stand-in', () => {
    assert.equal(drive.preset.props.filter(q => q.id === SCREEN).length, 1);
    assert.ok(!drive.preset.props.some(q => q.id === 'golf:leaderboard'), 'the golf leaderboard no longer stands in');
    assert.ok(!Object.keys(drive.standIns).includes('golf:leaderboard') && !Object.values(drive.standIns).includes('Drive-in screen'));
    assert.equal(new Set(fix.front).size, 4, 'four pictures');
    for (const id of fix.front) assert.ok(hasSprite(id) && fix.foot[id], `${id} is in the library with a footprint`);
  });
  it('fixes only its own picture, from any of its pictures', () => {
    assert.equal(fixedArt('world:snack_bar', 0, 1), null);
    assert.equal(fixedArt('golf:leaderboard', 1, 1), null);
    assert.ok(fixedArt(SCREEN, 0, 2));
    assert.equal(fixedArt(fix.front[2]!, 2, 2)?.id, fix.front[0], 'two quarters on from its back view is its base view');
  });
  for (const q of [0, 1, 2, 3] as const) {
    it(`facing ${q}: its front faces the street, its footprint lies along its picture and on the lot, every car faces it`, () => {
      const p: PlacedPlace = { id: drive.id, x: 100, y: 100, q }, g = placeGeom(p, drive), b = placeBox(p, drive), c = composeWhole(g, drive.preset, 5);
      const scr = c.props.filter(r => r.from && drive.preset.props[r.from.prop]!.id === SCREEN);
      assert.equal(scr.length, 1, 'the screen is drawn');
      const r = scr[0]!, fp = r.foot!, it = lib.get(r.id)!, sp = drive.preset.props[r.from!.prop]!;
      // the picture whose front faces the street: the street lies along -n, and that is the way the picture's front looks
      assert.equal(r.id, fix.front[q], 'the picture for this facing');
      assert.deepEqual([FRONT_DIR[q]!.x, FRONT_DIR[q]!.y], [0 - g.n.x, 0 - g.n.y], 'its front looks at the street');
      assert.equal(r.flip, false, 'never mirrored');
      // its footprint: inside the place, centred where the preset puts it, its long side along its picture, at its own size
      assert.ok(fp[0] >= b[0] - 1e-6 && fp[1] >= b[1] - 1e-6 && fp[2] <= b[2] + 1e-6 && fp[3] <= b[3] + 1e-6, `inside the lot ${JSON.stringify([fp, b])}`);
      const at = { x: (fp[0] + fp[2]) / 2, y: (fp[1] + fp[3]) / 2 };
      const want = { x: g.o.x + g.u.x * sp.x + g.n.x * sp.y, y: g.o.y + g.u.y * sp.x + g.n.y * sp.y };
      assert.ok(Math.hypot(at.x - want.x, at.y - want.y) < 1e-6, 'its footprint stands where the preset puts the screen');
      const wide = fp[2] - fp[0], deep = fp[3] - fp[1];
      assert.ok(LONG_X.has(r.id) ? wide > 3 * deep : deep > 3 * wide, `its long side along its picture (${wide.toFixed(2)} x ${deep.toFixed(2)})`);
      assert.ok(Math.abs(Math.max(wide, deep) - 5.5 * r.scale) < 1e-6 && Math.abs(Math.min(wide, deep) - 1.2 * r.scale) < 1e-6, "the picture's own size");
      // its picture sits on that footprint: the picture's lowest point (the generator's near corner) lands on the footprint's near corner
      const b0 = it.boxes[0]!, nx = it.ax + 32 * (b0.hx - b0.hy), ny = it.ay + 16 * (b0.hx + b0.hy), k = r.scale;
      const X = (r.x - r.y) * 64 + k * (nx - it.ax), Y = (r.x + r.y) * 32 + k * (ny - it.ay);
      assert.ok(Math.abs(X / 128 + Y / 64 - fp[2]) < 1e-6 && Math.abs(Y / 64 - X / 128 - fp[3]) < 1e-6, 'its lowest point on the near corner');
      // and the drawn picture lies inside the lot's own span across the screen
      const left = (r.x - r.y) * 64 - it.ax * k, right = left + it.w * k, xs = [b[0] - b[3], b[2] - b[3], b[0] - b[1], b[2] - b[1]].map(v => v * 64);
      assert.ok(left >= Math.min(...xs) && right <= Math.max(...xs), 'its picture inside the lot across the screen');
      // every car looks the way the rows run, toward the screen at their end (the away vector), and the screen is ahead of it
      let cars = 0;
      for (const z of c.props) {
        const d = carDir(z.id); if (!d) continue;
        cars++;
        assert.deepEqual([d.x, d.y], [g.n.x, g.n.y], `${z.id} faces the screen`);
        assert.ok((at.x - z.x) * g.n.x + (at.y - z.y) * g.n.y > 0, 'the screen is ahead of the car');
      }
      assert.equal(cars, 28, 'the rows');
    });
  }
});

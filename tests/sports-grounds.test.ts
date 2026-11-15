// #1369: the town's sports grounds (the owner, 2026-11-15: a baseball field and an American football field, "a dirt one, a grass one and a
// stadium, so it upgrades as the town grows bigger"). Each sport is a family of iconic places (lots/sports-grounds.json): its highest tier the
// town's residents call for is due, never a lower one once a higher stands; a one-view picture whose footprint never turns (its L along X); a
// higher tier takes the lower one's site when it fits (upgradeSpots), else a new one; the save keeps the tier and site. On a grown town (the
// range start's, headless) the sites keep off the roads, the built lots and the golf land (the course and the range's parcel), and no lot builds
// on them afterwards. npm test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PLACE_DEFS, duePlaces, familyPlaced, findSite, frameSize, placeBox, placeDef, placeGeom, placeTuples, placesFromTuples, upgradeSpots, type Box4, type PlaceDef, type PlacedPlace, type SiteSeg } from '../src/game/lots/iconic';
import { LIBRARY } from '../src/game/library';
import { SPORTS_ART, sportsArtId } from '../src/game/sports-library';
import { earnedTarget } from '../src/game/golf/towngrowth';
import { TOWN_POP } from '../src/game/lots/seedtowns';
import { City } from '../src/game/city';
import { CLASS, RoadNetwork, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { MAP } from '../src/game/iso';
import { NEAR } from '../src/game/golf/rangestart';
import { LV, type Town } from '../src/game/lots/town';
import type { LotMap } from '../src/game/lots/lots';
import type { Budget } from '../src/game/budget';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const SPORTS = PLACE_DEFS.filter(d => d.group);
const fam = (g: string) => SPORTS.filter(d => d.group === g).sort((a, b) => a.tier! - b.tier!);
const BASE = fam('baseball'), FOOT = fam('football');
const ids = (ds: readonly PlaceDef[]) => ds.map(d => d.id);
const sportsDue = (pop: number, placed: string[] = []) => ids(duePlaces(pop, new Set(placed), SPORTS));
const overlap = (a: Box4, b: Box4, m = 0) => a[0] < b[2] + m && a[2] > b[0] - m && a[1] < b[3] + m && a[3] > b[1] - m;
/** the real metres of each picture (the guides', iso-guide-box.mjs) */
const METRES: Record<string, [number, number]> = {
  'baseball-sandlot': [90, 90], 'baseball-field': [110, 110], 'baseball-stadium': [150, 150],
  'football-dirt': [120, 65], 'football-field': [130, 80], 'football-stadium': [160, 115],
};

describe('the sports grounds file and pictures', () => {
  it('holds two families of three tiers, dirt, grass and stadium, each drawn as its own picture at its real metres', () => {
    assert.deepEqual(ids(BASE), ['baseball-sandlot', 'baseball-field', 'baseball-stadium']);
    assert.deepEqual(ids(FOOT), ['football-dirt', 'football-field', 'football-stadium']);
    for (const f of [BASE, FOOT]) {
      assert.deepEqual(f.map(d => d.tier), [0, 1, 2]);
      assert.ok(f[0]!.pop < f[1]!.pop && f[1]!.pop < f[2]!.pop, 'a higher tier needs more residents');
    }
    for (const d of SPORTS) {
      const [L, D] = METRES[d.id]!, it = LIBRARY.find(i => i.id === d.art);
      assert.equal(d.art, sportsArtId(d.id)); assert.equal(d.fixed, true);
      assert.ok(it, `${d.art} is in the library`);
      // the footprint: the preset's tiles (2 m) and the picture's box (half extents in metres) are the real metres
      assert.deepEqual([d.preset.w * 2, d.preset.d * 2], [L, D], d.id);
      assert.deepEqual([it!.boxes[0]!.hx * 2, it!.boxes[0]!.hy * 2], [L, D], d.id);
      // its ground diamond spans 32 display px a metre of L + D (64 px a tile at zoom 1), its ground point the diamond's centre
      assert.equal(it!.w, 32 * (L + D)); assert.equal(it!.ax, it!.w / 2);
      assert.ok(it!.ay > 0 && it!.ay <= it!.h, `${d.id}: ground point inside the picture`);
      // flat ground with painted shading: no silhouette shadow, no building block
      assert.equal(it!.kind, 'decal'); assert.equal(it!.big, false);
    }
  });
  it('ships no placeholder picture', () => {
    for (const a of SPORTS_ART) assert.equal(a.placeholder, false, `${a.name} is still a placeholder: run scripts/assets/prep-sports-art.mjs when its picture lands`);
    assert.equal(SPORTS_ART.length, 6);
  });
});

describe('when a sports ground is due', () => {
  it('lays the dirt fields first, then the grass fields, then the stadiums, the highest tier the town calls for', () => {
    assert.deepEqual(sportsDue(0), []);
    assert.deepEqual(sportsDue(BASE[0]!.pop - 1), []);
    assert.deepEqual(sportsDue(BASE[0]!.pop), ['baseball-sandlot']);
    assert.deepEqual(sportsDue(FOOT[0]!.pop), ['baseball-sandlot', 'football-dirt']);
    assert.deepEqual(sportsDue(FOOT[0]!.pop, ['baseball-sandlot', 'football-dirt']), []);
    assert.deepEqual(sportsDue(BASE[1]!.pop, ['baseball-sandlot', 'football-dirt']), ['baseball-field']);
    assert.deepEqual(sportsDue(FOOT[1]!.pop, ['baseball-field', 'football-dirt']), ['football-field']);
    assert.deepEqual(sportsDue(FOOT[2]!.pop, ['baseball-field', 'football-field']), ['baseball-stadium', 'football-stadium']);
    // a town that jumps (a stamped one, an old save) gets its highest tier straight away
    assert.deepEqual(sportsDue(1e9), ['baseball-stadium', 'football-stadium']);
    // never a step down, never twice
    assert.deepEqual(sportsDue(1e9, ['baseball-stadium', 'football-stadium']), []);
    assert.deepEqual(sportsDue(FOOT[0]!.pop, ['baseball-stadium', 'football-field']), []);
  });
  it('gives a jam town both dirt fields and no more, a stamped town both grass fields, and a long game the stadiums', () => {
    // the jam's town tops out near 146 residents; its room starts at earnedTarget(0) (60)
    const JAM_TOP = 146;
    assert.ok(earnedTarget(0) >= BASE[0]!.pop, 'the sandlot comes with the first town');
    assert.ok(FOOT[0]!.pop <= JAM_TOP - 30, 'the football field comes well before the jam town tops out');
    assert.ok(BASE[1]!.pop > JAM_TOP && FOOT[1]!.pop > JAM_TOP);
    assert.ok(BASE[1]!.pop <= TOWN_POP && FOOT[1]!.pop <= TOWN_POP && BASE[2]!.pop > TOWN_POP);
    // the stadiums: a town of a million dollars made has room for the baseball stadium at success 1.5, the football one by about $2.5M at 1
    assert.ok(earnedTarget(1e6, 1.5) >= BASE[2]!.pop && earnedTarget(2.6e6) >= FOOT[2]!.pop && earnedTarget(1e6) < FOOT[2]!.pop);
  });
  it('replaces the family member that stands', () => {
    const placed: PlacedPlace[] = [{ id: 'baseball-sandlot', x: 0, y: 0, q: 0 }, { id: 'drive-in', x: 100, y: 100, q: 0 }];
    assert.equal(familyPlaced(placeDef('baseball-field')!, placed)?.id, 'baseball-sandlot');
    assert.equal(familyPlaced(placeDef('football-field')!, placed), undefined);
    assert.equal(familyPlaced(placeDef('high-school')!, placed), undefined);
  });
});

/** streets on a 100-tile grid and a main road, as site segs */
function grid(lo = 0, hi = 400): SiteSeg[] {
  const out: SiteSeg[] = [];
  for (let v = lo; v <= hi; v += 100) for (let a = lo; a < hi; a += 100) {
    out.push({ key: `h${v},${a}`, ax: a, ay: v, bx: a + 100, by: v, off: 2.65, order: 1 });
    out.push({ key: `v${v},${a}`, ax: v, ay: a, bx: v, by: a + 100, off: 2.65, order: 1 });
  }
  return out;
}
const roadBoxes = (segs: readonly SiteSeg[]): Box4[] => segs.map(s => [Math.min(s.ax, s.bx) - s.off, Math.min(s.ay, s.by) - s.off, Math.max(s.ax, s.bx) + s.off, Math.max(s.ay, s.by) + s.off]);

describe('a sports ground\'s footprint', () => {
  it('never turns: its L runs along X whichever side of whichever street it takes', () => {
    const d = placeDef('football-dirt')!, [W, D] = [d.preset.w, d.preset.d];
    for (const q of [0, 1, 2, 3] as const) {
      const b = placeBox({ id: d.id, x: 50, y: 50, q }, d), g = placeGeom({ id: d.id, x: 50, y: 50, q }, d);
      assert.deepEqual([b[2] - b[0], b[3] - b[1]], [W, D], `q ${q}`);
      assert.deepEqual([g.w, g.d], frameSize(d, q));
    }
    // only north-south streets: still L along X
    const segs = grid().filter(s => s.ax === s.bx), rb = roadBoxes(segs);
    const site = findSite(d, { segs, centre: { x: 200, y: 200 }, seed: 7, free: b => !rb.some(r => overlap(r, b, -0.1)) })!;
    assert.ok(site && site.q % 2 === 1, 'fronts a north-south street');
    const b = placeBox(site, d);
    assert.deepEqual([b[2] - b[0], b[3] - b[1]], [W, D]);
    assert.ok(rb.some(r => Math.abs(r[2] + 0.25 - b[0]) < 1e-9 || Math.abs(r[0] - 0.25 - b[2]) < 1e-9), 'on the verge of its street (road access)');
  });
  it('grows in place: the bigger tier on the same street edge, centred on the old one first', () => {
    for (const [lo, hi] of [['baseball-sandlot', 'baseball-field'], ['football-dirt', 'football-field'], ['football-field', 'football-stadium']] as const) {
      for (const q of [0, 1, 2, 3] as const) {
        const a = placeDef(lo)!, b = placeDef(hi)!, old: PlacedPlace = { id: lo, x: 300, y: 300, q }, spots = upgradeSpots(old, a, b);
        assert.equal(spots.length, 3);
        const ob = placeBox(old, a), front = (bx: Box4) => [bx[3], bx[2], bx[1], bx[0]][q]!; // the street-side edge (the place runs away from it): q 0 its y1, 1 x1, 2 y0, 3 x0
        for (const s of spots) { assert.equal(s.id, hi); assert.equal(s.q, q); assert.equal(front(placeBox(s, b)), front(ob), `${hi} q ${q}: the same street edge`); }
        const c = placeBox(spots[0]!, b), mid = (bx: Box4) => (q % 2 ? (bx[1] + bx[3]) / 2 : (bx[0] + bx[2]) / 2);
        assert.ok(Math.abs(mid(c) - mid(ob)) < 1e-9, 'centred along the street');
        assert.ok(overlap(c, ob) && c[2] - c[0] >= ob[2] - ob[0] && c[3] - c[1] >= ob[3] - ob[1]);
      }
    }
  });
});

describe('the save', () => {
  it('keeps each family\'s tier and site, and drops what it does not know', () => {
    const list: PlacedPlace[] = [{ id: 'baseball-field', x: 12.5, y: 300.25, q: 1 }, { id: 'football-stadium', x: 400, y: 80, q: 2 }, { id: 'drive-in', x: 1, y: 2, q: 0 }];
    const back = placesFromTuples(JSON.parse(JSON.stringify(placeTuples(list))));
    assert.deepEqual(back, list);
    // reloaded, nothing is due again (no second sandlot, no repeated placement)
    assert.deepEqual(sportsDue(800, back.map(p => p.id)), []);
    assert.deepEqual(placesFromTuples([['baseball-dugout', 1, 2, 0], ['football-field', 1, 2, 5]]), []);
  });
});

// ---- on a grown town (tests/town-grown.test.ts's range start: the county road at y 500, the town's seed north of it, the club's parcel south)
type Inside = { town: Town; lots: LotMap; budget: Budget };
const Y = 500, A: Pt = { x: 0, y: Y }, B: Pt = { x: MAP - 1, y: Y }, SEED: Pt = { x: 500, y: Y - 40 };
const PARCEL: [number, number, number, number] = [430, Y + NEAR, 300, 450];
function grownTown(pop: number) {
  const city = new City(3);
  city.autoStadium = false;
  city.terrain(new Uint8Array(MAP * MAP), A, 3, [SEED], undefined, true);
  city.setBudget(null, null, true);
  const editor = new NetEditor(new RoadNetwork());
  editor.net.paintData = false;
  editor.addLegs([{ a: A, b: B }], CLASS.road, 0, undefined, true);
  city.netOps(editor.commit(true));
  city.setGolf({ tier: 1, rep: 0, land: [PARCEL], start: 'range', exits: [A, B], holes: 9, townBoost: 1 });
  (city as unknown as Inside).budget.earned = 1e9;
  grow(city, editor, pop);
  return { city, editor };
}
/** steps the town until it has pop residents (or 30 growth days) */
function grow(city: City, editor: NetEditor, pop: number) {
  const I = city as unknown as Inside;
  for (let s = 0; s < 30 * 24 * 6 && I.town.pop < pop; s++) {
    const r = city.step(10);
    if (r.grow) { editor.addLegs(r.grow, CLASS.gravel, 2, undefined, true); city.netOps(editor.commit()); }
  }
}
/** the engine's site search on the city's real streets (engine.ts placesCheck) and a free check of its land: in the map, off every road and its
 *  verge, off every lot that is not empty, off the golf land, 2 tiles from the other places */
function siteOn(city: City, def: PlaceDef, places: PlacedPlace[], except?: PlacedPlace) {
  const I = city as unknown as Inside, segs: SiteSeg[] = [], roads: Box4[] = [];
  for (const s of city.net.segs) {
    if (s.kind !== 0) continue;
    const off = s.cls.h + s.cls.walk;
    segs.push({ key: `${s.a.x},${s.a.y}|${s.b.x},${s.b.y}`, ax: s.a.x, ay: s.a.y, bx: s.b.x, by: s.b.y, off, order: s.cls.order });
    roads.push([Math.min(s.a.x, s.b.x) - off, Math.min(s.a.y, s.b.y) - off, Math.max(s.a.x, s.b.x) + off, Math.max(s.a.y, s.b.y) + off]);
  }
  const built = [...I.town.states.values()].filter(st => st.level !== LV.EMPTY).map(st => lotBoxOf(I.lots.lots.get(st.key)!));
  const golf: Box4 = [PARCEL[0], PARCEL[1], PARCEL[0] + PARCEL[2], PARCEL[1] + PARCEL[3]];
  const others = places.filter(p => p !== except).map(p => placeBox(p, placeDef(p.id)!));
  const free = (b: Box4) => b[0] >= 4 && b[1] >= 4 && b[2] <= MAP - 4 && b[3] <= MAP - 4 && !roads.some(r => overlap(r, b, -0.5)) && !built.some(r => overlap(r, b, -0.6))
    && !overlap(golf, b) && !others.some(o => overlap(o, b, 2));
  const old = except ? placeDef(except.id) : undefined;
  const site = (except && old ? upgradeSpots(except, old, def).find(p => free(placeBox(p, def))) : undefined) ?? findSite(def, { segs, centre: SEED, seed: 3, free });
  return { site, roads, built, golf };
}
const lotBoxOf = (l: { o: Pt; u: Pt; n: Pt; w: number; d: number }): Box4 => {
  const ax = l.o.x + l.u.x * l.w, ay = l.o.y + l.u.y * l.w, bx = l.o.x + l.n.x * l.d, by = l.o.y + l.n.y * l.d, cx = ax + l.n.x * l.d, cy = ay + l.n.y * l.d;
  return [Math.min(l.o.x, ax, bx, cx), Math.min(l.o.y, ay, by, cy), Math.max(l.o.x, ax, bx, cx), Math.max(l.o.y, ay, by, cy)];
};

describe('on a grown town', () => {
  it('lays both dirt fields off the roads, the lots, the course and the range, grows them into grass fields, and no lot builds on them', () => {
    const { city, editor } = grownTown(FOOT[0]!.pop), I = city as unknown as Inside, places: PlacedPlace[] = [];
    assert.ok(I.town.pop >= FOOT[0]!.pop, `the town grew to ${I.town.pop}`);
    const check = (def: PlaceDef, except?: PlacedPlace) => {
      const { site, roads, built, golf } = siteOn(city, def, places, except);
      assert.ok(site, `${def.id} found a site`);
      const b = placeBox(site!, def);
      assert.ok(!roads.some(r => overlap(r, b, -0.5)), `${def.id} is off the roads`);
      assert.ok(!built.some(r => overlap(r, b, -0.6)), `${def.id} is off the built lots`);
      assert.ok(!overlap(golf, b), `${def.id} is off the golf land (the course and the range)`);
      const i = except ? places.indexOf(except) : -1; if (i >= 0) places.splice(i, 1);
      places.push(site!);
      city.setPlaces(places.map(p => { const q = placeBox(p, placeDef(p.id)!); return [q[0], q[1], q[2] - q[0], q[3] - q[1]]; }));
      return site!;
    };
    // deterministic: the same town and seed give the same site
    const first = siteOn(city, BASE[0]!, []).site;
    assert.deepEqual(siteOn(city, BASE[0]!, []).site, first);
    for (const id of sportsDue(I.town.pop, places.map(p => p.id))) check(placeDef(id)!);
    assert.deepEqual(places.map(p => p.id).sort(), ['baseball-sandlot', 'football-dirt']);
    // the town grows on; nothing is built on the grounds' land
    grow(city, editor, Math.max(BASE[1]!.pop, FOOT[1]!.pop));
    const land = places.map(p => placeBox(p, placeDef(p.id)!));
    for (const st of I.town.states.values()) if (st.level !== LV.EMPTY) {
      const lb = lotBoxOf(I.lots.lots.get(st.key)!);
      assert.ok(!land.some(b => Math.min(lb[2], b[2]) - Math.max(lb[0], b[0]) > 0.5 && Math.min(lb[3], b[3]) - Math.max(lb[1], b[1]) > 0.5), `lot ${st.key} is not on a sports ground`);
    }
    // the grass tiers and the stadiums, on this town's land (the headless range start stops near 130 residents: its county road runs out of
    // frontage, so the tiers are asked for as the residents would): in place when they fit, else elsewhere; the lower tier goes
    for (const t of [1, 2]) for (const f of [BASE, FOOT]) {
      const def = f[t]!, old = familyPlaced(def, places)!;
      assert.equal(old.id, f[t - 1]!.id);
      check(def, old);
      assert.ok(places.some(p => p.id === def.id) && !places.some(p => p.id === old.id), `${old.id} grew into ${def.id}`);
    }
    assert.equal(places.length, 2);
  });
});

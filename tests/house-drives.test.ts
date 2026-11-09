// T398 (#1070, PR 2; the owner, 2026-11-09, with screenshots: the garage door faces sideways, away from the street; the driveway leads to nothing: the path meets the side wall and a drive pad has no garage;
// tiled pavers on a run-down house; a cottage on a map-axis road drawn with a picture that does not follow the lot's diamond): the doors of a house lot. A house has a drive only where it has a garage
// door facing the street, and the drive goes to that door; the path goes to the front door; the surfaces follow the lot's condition; the garage door and the front face the street on every road; a
// map-axis road draws corner views only and a screen-straight road the turned straight-on views; a picture the owner marked (angles-wrong, more-angles, redo-style) is never drawn on a house lot.
// Headless: npm test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compose, housePalette, type ComposeState, type LotGeom } from '../src/game/lots/compose';
import { LU, LV } from '../src/game/lots/town';
import { SIDE_GAP, SURFACES, conditionOf, setCleanYards } from '../src/game/lots/clean-yards';
import { auditLot } from '../src/game/lots/lot-audit';
import { facingView, lotAnchors, pictureHeading } from '../src/game/lots/house-facing';
import { HOUSE_DOORS, doorsOf, garageOf } from '../src/game/lots/house-doors';
import { cleanGround } from '../src/game/lots/clean-lot';
import { FLAGGED_VIEWS, markOf } from '../src/game/lots/flagged-views';
import { fourViews } from '../src/game/lots/preset-art';
import { frameOf, roadOf } from '../src/game/lots/preset-frame';
import { stateOf } from '../src/game/lots/presets';
import { roleOf } from '../src/game/lots/groups';
import { mulberry } from '../src/game/iso';
import { LIBRARY } from '../src/game/library';
import { isBuilding } from '../src/game/mirror';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };
const BY = new Map(LIBRARY.map(i => [i.id, i]));
const H = Math.SQRT1_2;
/** the lot's away vector n by road (presets.ts Road: the street lies along -n): 0 the street on +y ... 7 */
const NS = [{ x: 0, y: -1 }, { x: -H, y: -H }, { x: -1, y: 0 }, { x: -H, y: H }, { x: 0, y: 1 }, { x: H, y: H }, { x: 1, y: 0 }, { x: H, y: -H }];
const geom = (road: number, w: number, d: number, o = { x: 300, y: 300 }): LotGeom => { const n = NS[road]!, u = { x: -n.y, y: n.x }; return { o, u, n, w, d }; };
const ROADS = [0, 1, 2, 3, 4, 5, 6, 7];

/** a seeded sample of lots of a use: every road, size, level, decline, tier and seed the town deals */
function sample(count: number, seed: number, uses: readonly number[] = [LU.RES]): { g: LotGeom; st: ComposeState; road: number }[] {
  const r = mulberry(seed);
  return Array.from({ length: count }, () => {
    const road = Math.floor(r() * 8), w = [8, 10, 12, 12.5, 14, 15, 16.5, 20][Math.floor(r() * 8)]!, d = [14, 15, 16, 18, 19, 20][Math.floor(r() * 6)]!;
    const tier = [undefined, 0, 1, 2, 3][Math.floor(r() * 5)], o = { x: 200 + Math.floor(r() * 400), y: 200 + Math.floor(r() * 400) };
    const st: ComposeState = { use: uses[Math.floor(r() * uses.length)]!, level: r() < 0.7 ? LV.BUILT : LV.UPGRADED, decline: [0, 0, 0, 1, 2, 3][Math.floor(r() * 6)]!, seed: Math.floor(r() * 100000), ...(tier !== undefined ? { tier } : {}) };
    return { g: geom(road, w, d, o), st, road };
  });
}
const LOTS = sample(900, 0x398a);

describe('the doors of a house lot (T398)', () => {
  it('1. a drive only where a garage door faces the street, and it ends at that door; the path ends at the front door, on every road', () => {
    setCleanYards(true);
    let houses = 0, garages = 0, drives = 0, empty = 0; const bad: string[] = [];
    for (const { g, st, road } of LOTS) {
      const c = compose(g, st), a = auditLot(g, c);
      if (!a.house) { empty++; continue; }
      houses++; if (a.garage) garages++; if (a.drive) drives++;
      if (a.drive && !a.garage) bad.push(`road ${road} seed ${st.seed}: a drive and no garage door`);
      if (!a.driveOk || !a.pathAtDoor) bad.push(`road ${road} seed ${st.seed}: garage ${a.garage} drive ${a.drive} ok ${a.driveOk} path at the door ${a.pathAtDoor}`);
    }
    assert.ok(houses > 800, `${houses} house lots, ${empty} empty`);
    assert.equal(drives, garages, 'a drive on every lot with a garage door facing the street and on no other');
    assert.ok(garages > 100, `${garages} lots with a garage door facing the street`);
    assert.deepEqual(bad.slice(0, 5), [], `${bad.length} lots whose drive or path misses its door`);
    assert.ok(empty <= 0.02 * LOTS.length, `${empty} of ${LOTS.length} lots had no house that could stand there`);
  });

  it('2. every house type, on every road: the picture drawn, its front door and its garage door: the drive and the path are laid to the anchors', () => {
    const f12 = (road: number) => frameOf(geom(road, 12, 16));
    let ok = 0, facing = 0; const reasons: string[] = [];
    for (const id of housePalette()) for (const road of ROADS) {
      const f = f12(road), hf = facingView(id, f);
      assert.equal(roadOf(f.n), road);
      if (!hf.ok) { reasons.push(`${id} road ${road}: ${!hf.exact ? 'its front does not meet the street' : hf.mark ? 'marked ' + hf.mark : hf.garage === 'side' ? 'its garage door is on a side wall' : 'not a corner view on a map-axis road'}`); continue; }
      ok++;
      // the house on a nominal spot of the lot: its front wall at y = 5 (tiles), 6 tiles wide
      const hb: [number, number, number, number] = [3, 5, 9, 9], an = lotAnchors(id, hf, hb, []);
      assert.equal(an.frontY, 5); assert.equal(an.garages.length, hf.garage === 'front' ? 1 : 0, `${id} road ${road}: a garage door exactly where the picture draws one on its front`);
      assert.ok(an.doorX >= hb[0] && an.doorX <= hb[2], `${id} road ${road}: the front door lies on the front wall`);
      const gr = cleanGround([], 12, 16, hb, { drive: 'paving', walk: 'paving' }, { doorX: an.doorX, frontY: an.frontY, garages: an.garages });
      if (an.garages.length) {
        assert.ok(gr.drive, `${id} road ${road}: a drive to the garage`);
        const d = gr.drive!.pts, x0 = Math.min(d[0]!, d[2]!, d[4]!, d[6]!), x1 = Math.max(d[0]!, d[2]!, d[4]!, d[6]!), y0 = Math.min(d[1]!, d[3]!, d[5]!, d[7]!), y1 = Math.max(d[1]!, d[3]!, d[5]!, d[7]!);
        const gd = an.garages[0]!;
        assert.ok(y0 <= 0.001 && Math.abs(y1 - gd.y) < 1e-9, `${id} road ${road}: the drive runs from the street to the garage door's wall (${y0}..${y1}, wall ${gd.y})`);
        assert.ok(x0 < gd.x1 && x1 > gd.x0, `${id} road ${road}: the drive is over the garage door's span`);
        facing++;
      } else assert.equal(gr.drive, null, `${id} road ${road}: no garage, no drive`);
      assert.ok(gr.walk, `${id} road ${road}: a path`);
      const w = gr.walk!.pts, wx0 = Math.min(w[0]!, w[2]!, w[4]!, w[6]!), wx1 = Math.max(w[0]!, w[2]!, w[4]!, w[6]!), wy1 = Math.max(w[1]!, w[3]!, w[5]!, w[7]!);
      assert.ok(wx0 <= an.doorX + 0.9 && wx1 >= an.doorX - 0.9 && Math.abs(wy1 - (an.frontY + 0.1)) < 1e-9, `${id} road ${road}: the path ends at the front door (${wx0}..${wx1}, door ${an.doorX})`);
      if (an.garages.length) { const d = gr.drive!.pts, dx0 = Math.min(d[0]!, d[2]!, d[4]!, d[6]!), dx1 = Math.max(d[0]!, d[2]!, d[4]!, d[6]!); assert.ok(wx0 >= dx1 - 1e-9 || wx1 <= dx0 + 1e-9, `${id} road ${road}: the path does not run across the drive`); }
    }
    console.log(`T398 doors: ${ok} of ${housePalette().length * 8} (house type, road) pairs have a picture that faces the street with its doors (${facing} with a garage), ${reasons.length} do not`);
    // every road has houses that face it; the map-axis roads have the most
    for (const road of ROADS) { const n = housePalette().filter(id => facingView(id, f12(road)).ok).length; assert.ok(n >= (road % 2 ? 5 : 8), `${n} house types face road ${road} with their doors`); }
    // the pairs that cannot (the next art, and what swaps them): printed, and pinned to the reasons that exist
    assert.ok(reasons.every(r => /does not meet|marked|side wall|not a corner/.test(r)));
  });

  it('3. the garage door and the front face the street of every house lot on all eight roads; the owner\'s marked pictures are never drawn; a house that cannot is swapped', () => {
    setCleanYards(true);
    let seen = 0, attached = 0, buildings = 0;
    for (const { g, st, road } of LOTS) {
      const c = compose(g, st), a = auditLot(g, c); if (!a.house) continue;
      seen++;
      assert.equal(a.garageSideways, false, `road ${road}: the house's garage door is not on a side wall`);
      assert.equal(a.marked, false, `road ${road}: the house's picture is not one the owner marked`);
      // every building on the lot: a corner picture on a map-axis road (never a straight-on or ring picture), its front toward the street; the owner has not marked it
      for (const p of c.props) {
        const it = BY.get(p.id); if (!it || !isBuilding(it)) continue;
        if (road % 2 === 0) {
          assert.ok(fourViews(p.id), `road ${road}: ${p.id} is a corner view of the four-view art`);
          assert.ok(!p.id.startsWith('object8:'), `road ${road}: no eight-view picture on a map-axis road: ${p.id}`);
        }
        assert.equal(markOf(p.id), null, `${p.id} is marked by the owner: never drawn on a house lot`);
        if (roleOf(p.id) === 'garage' && road % 2 === 0) { buildings++; assert.equal(pictureHeading(p.id), road, `road ${road}: the garage building ${p.id} faces the street`); }
      }
      if (a.garage && c.anchors?.garages.some(gd => gd.y === c.anchors!.frontY)) attached++;
      // the house's own garage door faces the street exactly when its picture is the house type's front-garage picture on this road
      const base = fourViews(c.anchors!.house.id)?.views[0] ?? c.anchors!.house.id;
      if (doorsOf(base)?.garage && c.anchors!.house.exact) assert.equal(c.anchors!.house.garage, 'front', `road ${road}: ${base}'s garage door faces the street`);
    }
    assert.ok(seen > 800 && attached > 0 && buildings > 0, `${seen} house lots, ${attached} with the house's own garage door, ${buildings} with a garage building`);
  });

  it('4. the surface follows the lot\'s condition: never pavers or concrete on a run-down lot', () => {
    setCleanYards(true);
    // the rule
    assert.equal(conditionOf('declined', 3, 'world:house_0'), 'run-down'); assert.equal(conditionOf('built', 0, 'world:house_0'), 'run-down');
    assert.equal(conditionOf('built', 2, 'variation:expansion-rundown-house-a7c17683-plain-corner:1'), 'run-down');
    assert.equal(conditionOf('built', 2, 'world:house_0'), 'ordinary'); assert.equal(conditionOf('built', undefined, 'world:house_0'), 'well-off'); assert.equal(conditionOf('upgraded', 1, 'world:house_0'), 'well-off');
    for (const bad of ['paving', 'concrete', 'slabs', 'asphalt', 'pad']) { assert.notEqual(SURFACES['run-down'].drive, bad); assert.notEqual(SURFACES['run-down'].walk, bad); }
    assert.ok(['gravel', 'dirt', 'rockyDirt'].includes(SURFACES['run-down'].drive) && ['dirt', 'gravel'].includes(SURFACES['run-down'].walk));
    assert.equal(SURFACES.ordinary.drive, 'concrete'); assert.equal(SURFACES['well-off'].drive, 'paving');
    // the lots
    const seen = { 'run-down': 0, ordinary: 0, 'well-off': 0 }; const wrong: string[] = [];
    for (const { g, st, road } of LOTS) {
      const c = compose(g, st), a = auditLot(g, c); if (!a.house || !c.anchors) continue;
      const state = stateOf(st.level, st.decline)!, cond = conditionOf(state, st.tier, c.anchors.house.id), want = SURFACES[cond];
      seen[cond]++;
      if ((a.driveTex !== null && a.driveTex !== want.drive) || (a.pathTex !== null && a.pathTex !== want.walk)) wrong.push(`road ${road} ${cond}: drive ${a.driveTex} path ${a.pathTex}`);
      if (cond === 'run-down') assert.ok(!['paving', 'concrete', 'slabs', 'asphalt', 'pad'].includes(a.driveTex ?? '') && !['paving', 'concrete', 'slabs', 'asphalt', 'pad'].includes(a.pathTex ?? ''), `road ${road}: a run-down lot has no paver or concrete drive or path: ${a.driveTex} ${a.pathTex}`);
    }
    assert.deepEqual(wrong.slice(0, 4), []); assert.ok(seen['run-down'] > 100 && seen.ordinary > 50 && seen['well-off'] > 50, JSON.stringify(seen));
  });

  it('5. a map-axis road draws corner views only, a screen-straight road only the turned straight-on views, in every kind of lot', () => {
    setCleanYards(true);
    let n = 0, ring = 0;
    for (const { g, st, road } of sample(1200, 0x398b, [LU.RES, LU.COM, LU.IND, LU.TOUR, LU.GOV])) {
      const c = compose(g, st); n++;
      for (const p of c.props) if (p.id.startsWith('object8:')) {
        if (road % 2 === 0) assert.fail(`road ${road}: an eight-view picture ${p.id} on a map-axis road`);
        assert.match(p.id, /:yaw8[NESW]$/, `road ${road}: only a turned straight-on view on a screen-straight road: ${p.id}`); ring++;
      }
    }
    assert.ok(n === 1200 && ring > 10, `${ring} turned straight-on pictures drawn on screen-straight roads`);
  });

  it('6. the owner\'s marks: every marked picture of the house palette is listed, a house whose four corners are all marked never faces a road, and the data is the owner\'s file', () => {
    assert.ok(Object.keys(FLAGGED_VIEWS).length > 150, `${Object.keys(FLAGGED_VIEWS).length} marked pictures`);
    // the duplex variation has all four corner pictures marked: it can face no road
    const dup = 'variation:gen-house-duplex-c39d1a23-plain-corner:1';
    for (const road of ROADS) assert.equal(facingView(dup, frameOf(geom(road, 12, 16))).ok, false, `${dup} road ${road}`);
    // a marked corner is skipped, the unmarked ones are used: gen:house-splitlevel's SE (road 2) is angles-wrong, its NE (road 0) is fine
    assert.equal(markOf('view:gen:house-splitlevel:se'), 'angles-wrong');
    assert.equal(facingView('gen:house-splitlevel', frameOf(geom(2, 12, 16))).ok, false); assert.equal(facingView('gen:house-splitlevel', frameOf(geom(0, 12, 16))).ok, true);
    // the garage: the L-shaped colonial's garage door is on its front wall in its NE picture only (SE and NW draw it on a side wall)
    assert.equal(HOUSE_DOORS['gen:house-l-shape']!.garage!.side.length, 2);
    assert.equal(garageOf('gen:house-l-shape', 0), 'front'); assert.equal(garageOf('gen:house-l-shape', 1), 'side'); assert.equal(garageOf('gen:house-l-shape', 3), 'side'); assert.equal(garageOf('world:house_0', 0), 'none');
    assert.equal(facingView('gen:house-l-shape', frameOf(geom(2, 12, 16))).ok, false, 'the L-shape on road 2: its SE picture has the garage door sideways');
    assert.equal(facingView('gen:house-l-shape', frameOf(geom(0, 12, 16))).ok, true, 'the L-shape on road 0: its NE picture has the garage door on the front');
  });

  it('7. the side gap: every wall of the buildings keeps about 3 m from each side lot line, so neighbouring buildings are at least about 6 m apart', () => {
    setCleanYards(true);
    const TOL = 0.05;   // (tiles: the swap's size rounding)
    let lots = 0, garages = 0; const near: string[] = [];
    for (const { g, st, road } of LOTS) {
      const c = compose(g, st); if (!c.anchors) continue; lots++; if (c.anchors.garages.length) garages++;
      let lo = Infinity, hi = -Infinity; for (const b of c.anchors.boxes) { lo = Math.min(lo, b[0]); hi = Math.max(hi, b[2]); }
      if (lo < SIDE_GAP - TOL || hi > g.w - SIDE_GAP + TOL) near.push(`road ${road} ${g.w}x${g.d}: buildings from ${lo.toFixed(2)} to ${hi.toFixed(2)} of ${g.w}`);
    }
    assert.deepEqual(near.slice(0, 4), [], `${near.length} of ${lots} lots keep a building closer than 3 m to a side line`);
    assert.ok(lots > 800 && garages > 80, `${lots} lots, ${garages} with a garage door: the gap leaves room for garages on the wider lots`);
    // two neighbours (the second lot starts where the first ends, along the street): the distance between their buildings
    const r = mulberry(0x398c); let pairs = 0, minGap = Infinity;
    for (let k = 0; k < 120; k++) {
      const road = [0, 2, 4, 6][Math.floor(r() * 4)]!, wA = [8, 10, 12, 14, 16.5][Math.floor(r() * 5)]!, wB = [8, 10, 12, 14, 16.5][Math.floor(r() * 5)]!, d = 16;
      const a = compose(geom(road, wA, d), { use: LU.RES, level: LV.BUILT, decline: 0, seed: 1000 + k }), b = compose(geom(road, wB, d), { use: LU.RES, level: LV.BUILT, decline: 0, seed: 2000 + k });
      if (!a.anchors || !b.anchors) continue;
      let aHi = -Infinity, bLo = Infinity; for (const x of a.anchors.boxes) aHi = Math.max(aHi, x[2]); for (const x of b.anchors.boxes) bLo = Math.min(bLo, x[0]);
      pairs++; minGap = Math.min(minGap, wA - aHi + bLo);
    }
    assert.ok(pairs > 100, `${pairs} neighbouring pairs`);
    assert.ok(minGap >= 2 * SIDE_GAP - 2 * TOL, `the nearest two neighbouring buildings are ${(minGap * 2).toFixed(1)} m apart (at least ${(4 * SIDE_GAP).toFixed(0)} m)`);
  });
});

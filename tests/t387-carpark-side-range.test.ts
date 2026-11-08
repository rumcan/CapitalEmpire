// T387 (#1045, the owner, 2026-11-08, desert start, the driving range built to one side of the county road: "bug. can't place the car park near
// the driving range if you build the driving range to the side."): the Car park ghost beside the range, its drive and its pro shop read "not on
// buildable ground" over open land. The cause: the car park's tile test (event/carpark.ts parkValid) took only GROUND and PATCH, so the woodland
// (TC.HILL) a range built away from its start spot stands on or beside refused it with a generic reason, where the range's own plot, the practice area,
// the clubhouse and every other placement in a golf game refuse only water. Now a golf game's car park (and bay row) takes woodland, water, a creek and
// the river bank are named, and the whole chain of the range's first car park (golf/parkplace.ts carParkWhy) is tested for the range straight ahead
// of its start spot, slid to the right along the county road and slid to the left, at all four facings: open owned land beside the range, its drive and
// its pro shop is allowed (woodland under it or not), and the outfield, land that is not the player's, water and a missing road each refuse with their own
// reason. The in-game run is scripts/dev/t387-carpark-side-shots.mjs.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAP } from '../src/game/iso';
import { BLOCK } from '../src/game/lots/roads';
import { CLASS, RoadNetwork, classOf, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { TC, type Edge, type Terrain } from '../src/game/terrain';
import { parkClassWhy, parkValid } from '../src/game/event/carpark';
import { rowCheck, type BayRowDef } from '../src/game/event/rows';
import { NEAR, planRangeStart, type RangeStart } from '../src/game/golf/rangestart';
import { RANGE_PLOT, plotPoint, rangeLayout } from '../src/game/golf/range';
import { homeYardBox, rangeKeepOut } from '../src/game/golf/rangebiz';
import { rangeSpotAt, type LandCheck, type RangeSpot } from '../src/game/golf/placing';
import { carParkSpotAt, carParkWhy, type CarParkCtx } from '../src/game/golf/parkplace';
import type { Rect } from '../src/game/golf/mode';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const MID = Math.round(MAP / 2 / BLOCK) * BLOCK;
/** a flat terrain of GROUND with these mountain edges and one town site, centred on tile j (the range start's junction goes to the town site nearest the map's
 *  middle that has room for the parcel: golf-rangestart.test.ts's flat map, its town site moved) */
function flat(mountainEdges: Edge[], j: Pt): Terrain {
  const cls = new Uint8Array(MAP * MAP).fill(TC.GROUND);
  return { seed: 1, attempt: 0, height: new Float32Array(256 * 256), cls, waters: [], mountainEdges, highway: { x: 0, y: MAP / 2, edge: 'W' }, start: { x: j.x - 32, y: j.y - 32, size: 64 },
    towns: [{ x: j.x - 32, y: j.y - 32, size: 64 }], chokepoints: [] };
}
/** the range start plan of each of the four facings (0 north .. 3 west): a road along x (the mountain edges N and S) or along y (W and E), and the town site 120 tiles
 *  off the map's middle toward the side the parcel does not fit on, so the parcel goes on the other (the first site that fits wins: findStart) */
const starts = new Map<0 | 1 | 2 | 3, RangeStart>();
for (const [edges, j, dir] of [[['N', 'S'], { x: MID, y: MID - 120 }, 2], [['N', 'S'], { x: MID, y: MID + 120 }, 0], [['W', 'E'], { x: MID - 120, y: MID }, 1], [['W', 'E'], { x: MID + 120, y: MID }, 3]] as [Edge[], Pt, 0 | 1 | 2 | 3][]) {
  const p = planRangeStart(flat(edges, j), 1); if (p && p.site.dir === dir) starts.set(dir, p);
}
const FACINGS = [0, 1, 2, 3] as const;
/** the three layouts: the range on its start spot (straight ahead), slid along the county road to one side and to the other (du tiles) */
const LAYOUTS = [{ name: 'straight ahead', du: 0 }, { name: 'to the right', du: 90 }, { name: 'to the left', du: -90 }] as const;
const WOODLAND_MSG = /woodland/, NAMED = /^(Place your driving range first|Your range has its car park|The driving range is there|Hidden behind |on water|on a creek|on the river bank|on woodland|on terrain class|a road runs over it|too small|too close to the edge|overlaps the stadium|overlaps another car park|no road along|buildings stand there|Off your land|Not on water|The course is there|Your home is there|The practice area is there|Place it beside a road)/;

/** the world rect (x y w h) of a plot-frame rect u0..u1 by v0..v1 */
function frameRect(plot: Rect, f: 0 | 1 | 2 | 3, u0: number, u1: number, v0: number, v1: number): Rect {
  const a = plotPoint(plot, f, u0, v0), b = plotPoint(plot, f, u1, v1);
  return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)];
}
function fill(cls: Uint8Array, r: Rect, c: number) { for (let y = r[1]; y < r[1] + r[3]; y++) for (let x = r[0]; x < r[0] + r[2]; x++) cls[y * MAP + x] = c; }

/** a range start's world with the range placed at du along the county road (the ghost's rangeSpotAt), its drive laid, the strip along the road in front
 *  of the range woodland (the owner's trees), a pond further along it, and the player's land the start's parcel grown 150 tiles each way along the road
 *  (blocks he bought): everything the car park's chain reads (CarParkCtx), the frame vectors and where the drive stands along the road */
function world(f: 0 | 1 | 2 | 3, du: number) {
  const rs = starts.get(f)!, site = rs.site, home = site.rangePlot;
  const [px, py, pw, ph] = site.parcel, owned: Rect = site.axis === 'x' ? [px - 150, py, pw + 300, ph] : [px, py - 150, pw, ph + 300];
  const p0 = plotPoint(home, f, RANGE_PLOT[0] / 2 + du, 12), spot: RangeSpot = rangeSpotAt(home, f, p0.x, p0.y);
  assert.equal(spot.du, du, `${f}: the range slid ${du}`);
  const e = new NetEditor(new RoadNetwork());
  e.addLegs(rs.road.legs, CLASS.road!, 0, rs.road.kinds, true);
  e.addLegs([{ a: spot.J, b: spot.end }], classOf('drive-gravel'), 0, undefined, true);
  e.commit();
  const plot = spot.plot, cls = new Uint8Array(MAP * MAP).fill(TC.GROUND);
  fill(cls, frameRect(plot, f, -40, 150, -spot.setback - 4, 0), TC.HILL); // the strip in front of the range, and its sides: woodland
  const pond = frameRect(plot, f, RANGE_PLOT[0] + 40, RANGE_PLOT[0] + 70, -spot.setback - 4, 0); fill(cls, pond, TC.WATER);
  const land: LandCheck = {
    owned: (x, y) => x >= owned[0] && x < owned[0] + owned[2] && y >= owned[1] && y < owned[1] + owned[3],
    wet: (x, y) => { const c = cls[Math.floor(y) * MAP + Math.floor(x)]; return c === TC.WATER || c === TC.CREEK || c === TC.BANK; },
    course: () => false,
  };
  const yb = homeYardBox(home, f), ctx: CarParkCtx = {
    built: true, lot: false, keepOut: rangeKeepOut(plot, f, spot.setback), buildings: [{ rect: rangeLayout(plot, f).hut.rect, name: 'the pro shop' }],
    cls, net: e.net, site: null, parks: [], lotsUnder: () => false, land, yard: [yb[0], yb[1], yb[2] - yb[0], yb[3] - yb[1]], practice: null,
  };
  // the road's frame: U along it (the plot frame's u), V across it toward the course (v), J's place along it
  const o = plotPoint(plot, f, 0, 0), U: Pt = { x: plotPoint(plot, f, 1, 0).x - o.x, y: plotPoint(plot, f, 1, 0).y - o.y }, V: Pt = { x: plotPoint(plot, f, 0, 1).x - o.x, y: plotPoint(plot, f, 0, 1).y - o.y };
  const J = site.J, sOf = (p: Pt) => (p.x - J.x) * U.x + (p.y - J.y) * U.y;
  /** the point s along the road from J and t across it (toward the course) */
  const at = (s: number, t: number): Pt => ({ x: J.x + U.x * s + V.x * t, y: J.y + U.y * s + V.y * t });
  return { rs, site, spot, plot, cls, ctx, net: e.net, owned, at, sDrive: sOf(spot.J), pond };
}
/** the car park the pointer at p offers, and the chain's verdict */
const verdict = (w: ReturnType<typeof world>, f: 0 | 1 | 2 | 3, p: Pt) => { const d = carParkSpotAt(w.net, f, p.x, p.y); return { d, why: carParkWhy(d, w.ctx) }; };

describe('T387: every facing has a range start to test', () => {
  it('the four facings, each on a county road with a parcel', () => {
    assert.deepEqual([...starts.keys()].sort(), [0, 1, 2, 3]);
    for (const f of FACINGS) assert.ok(starts.get(f)!.road.legs.length > 0 && starts.get(f)!.site.parcel[2] > RANGE_PLOT[0], `${f}`);
  });
});

describe('T387: the terrain a car park stands on is named, never "not on buildable ground"', () => {
  it('parkClassWhy: open ground passes, water, a creek and the river bank are named, woodland passes only where it is allowed', () => {
    assert.equal(parkClassWhy(TC.GROUND), ''); assert.equal(parkClassWhy(TC.PATCH), '');
    assert.match(parkClassWhy(TC.WATER), /^on water/); assert.match(parkClassWhy(TC.CREEK), /^on a creek/); assert.match(parkClassWhy(TC.BANK), /^on the river bank/);
    assert.match(parkClassWhy(TC.HILL), WOODLAND_MSG); assert.equal(parkClassWhy(TC.HILL, true), '', 'a golf game takes woodland');
    for (const c of [TC.WATER, TC.CREEK, TC.BANK]) assert.notEqual(parkClassWhy(c, true), '', 'water is refused in a golf game too');
    for (let c = 0; c < 8; c++) assert.doesNotMatch(parkClassWhy(c, c % 2 === 0), /buildable/, `class ${c}`);
    assert.match(parkClassWhy(9), /terrain class 9/, 'an unknown class is named by its number');
  });
  it('parkValid names the class under the park and lets a golf game build on woodland', () => {
    const w = world(2, 0), d = w.rs.site.carpark;
    const park = { id: 0, x: d[0], y: d[1], w: d[2], h: d[3] }, cls = new Uint8Array(MAP * MAP);
    assert.equal(parkValid(park, cls, w.net, null, []), '', 'open ground');
    for (const [c, re] of [[TC.WATER, /^on water/], [TC.CREEK, /^on a creek/], [TC.BANK, /^on the river bank/], [TC.HILL, WOODLAND_MSG]] as const) {
      const wet = cls.slice(); wet[(park.y + 3) * MAP + park.x + 5] = c;
      assert.match(parkValid(park, wet, w.net, null, []), re, `class ${c}`);
      assert.doesNotMatch(parkValid(park, wet, w.net, null, []), /buildable/);
    }
    const wood = cls.slice(); wood[(park.y + 3) * MAP + park.x + 5] = TC.HILL;
    assert.equal(parkValid(park, wood, w.net, null, [], true), '', 'woodland under a golf game\'s car park');
    const pond = cls.slice(); pond[(park.y + 3) * MAP + park.x + 5] = TC.WATER;
    assert.match(parkValid(park, pond, w.net, null, [], true), /^on water/, 'water still refused in a golf game');
  });
  it('rowCheck (the bay rows) names the class too, and takes woodland when it is told to', () => {
    const row: BayRowDef = { id: 1, ax: 300, ay: 300, bx: 330, by: 300, side: 1, bay: 90, col: 'white' };
    const open = new Uint8Array(MAP * MAP);
    assert.equal(rowCheck(row, open, [], [], MAP), '');
    for (const [c, re] of [[TC.WATER, /^on water/], [TC.CREEK, /^on a creek/], [TC.BANK, /^on the river bank/], [TC.HILL, WOODLAND_MSG]] as const) {
      const cls = open.slice(); fill(cls, [300, 300, 30, 6], c);
      assert.match(rowCheck(row, cls, [], [], MAP), re, `class ${c}`);
    }
    const wood = open.slice(); fill(wood, [300, 300, 30, 6], TC.HILL);
    assert.equal(rowCheck(row, wood, [], [], MAP, true), '', 'woodland under a golf game\'s bay row');
  });
});

describe('T387: the range\'s first car park beside the range, at every facing and in all three layouts', () => {
  for (const f of FACINGS) for (const L of LAYOUTS) describe(`facing ${f}, the range ${L.name} (du ${L.du})`, () => {
    it('open owned land beside the drive is allowed, with woodland under it (the owner\'s refusal), where the old rule said "not on buildable ground"', () => {
      const w = world(f, L.du), away = w.at(w.sDrive + 13, NEAR + 6), { d, why } = verdict(w, f, away);
      assert.equal(why, '', `the far side of the drive: ${why}`);
      assert.match(parkValid(d, w.cls, w.net, null, []), WOODLAND_MSG, 'the old rule refused it for the woodland under it');
      let n = 0; for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) if (w.cls[y * MAP + x] === TC.HILL) n++;
      assert.ok(n > 0, 'woodland under the ghost');
      // joined to the drive: its frontage is the road beside it (the county road at its edge), the entrance on it
      assert.ok(d.cross, 'the golf layout');
    });
    it('the strip in front of the range on either side of its drive: allowed, or refused by the pro shop that hides it, with that reason', () => {
      const w = world(f, L.du);
      for (const ds of [13, 24, -13, -24, -36, 36]) {
        const { why } = verdict(w, f, w.at(w.sDrive + ds, NEAR + 6));
        // (the far side of the drive is open; in front of the range the pro shop may hide a spot, and the pond starts 38 tiles out)
        if (ds === 13 || ds === 24) assert.equal(why, '', `${ds} along from the drive: ${why}`);
        else assert.ok(why === '' || /^Hidden behind the pro shop|^on water/.test(why), `${ds} along from the drive: ${why}`);
      }
    });
    it('on the outfield, the tee box or the plot it is refused: the driving range is there', () => {
      const w = world(f, L.du);
      for (const [u, v] of [[35, 75], [20, 25], [60, 120], [5, 40]] as const) {
        const p = plotPoint(w.plot, f, u, v), { why } = verdict(w, f, p);
        assert.match(why, /^The driving range is there/, `plot (${u}, ${v}): ${why}`);
      }
    });
    it('off the player\'s land (along the road beyond his blocks, across the road) it is refused: off your land', () => {
      const w = world(f, L.du);
      // (his land runs 150 tiles past the start's parcel each way along the road: s -222 to 378 from J; the town's side of the road is nobody's)
      for (const [s, t] of [[420, NEAR + 6], [-262, NEAR + 6], [w.sDrive + 13, -(NEAR + 6)], [w.sDrive - 13, -(NEAR + 6)]] as const) {
        const { why } = verdict(w, f, w.at(s, t));
        assert.match(why, /^Off your land/, `s ${s}, t ${t}: ${why}`);
      }
    });
    it('on the pond it is refused: on water, by name', () => {
      const w = world(f, L.du), { why } = verdict(w, f, w.at(w.sDrive + 55, NEAR + 6));
      assert.match(why, /^on water/, why);
    });
    it('every refusal around the range has a named reason, none is "not on buildable ground", and open ground exists on both sides of the drive', () => {
      const w = world(f, L.du); let ok = 0; const seen = new Set<string>();
      for (let s = w.sDrive - 80; s <= w.sDrive + 100; s += 6) for (let t = -30; t <= NEAR + 80; t += 6) {
        const { why } = verdict(w, f, w.at(s, t));
        if (!why) { ok++; continue; }
        seen.add(why.replace(/\d+/g, '#'));
        assert.match(why, NAMED, `s ${s} t ${t}: ${why}`); assert.doesNotMatch(why, /buildable/);
      }
      assert.ok(ok >= 6, `${ok} open spots around the range`);
      assert.ok(seen.size >= 3, `several named reasons: ${[...seen].join(' | ')}`);
    });
  });
});

describe('T387: the game uses the chain, and no generic reason is left', () => {
  const src = (p: string) => readFileSync(p, 'utf8');
  it('the placeable asks carParkWhy and the spot helper; the drag tool and the bay rows take woodland in a golf game', () => {
    const eng = src('src/game/engine.ts');
    assert.match(eng, /why: d => carParkWhy\(d, this\.carParkCtx\(b, land\)\)/);
    assert.match(eng, /spot: \(x, y\) => carParkSpotAt\(this\.net, g\.dir, x, y\)/);
    assert.match(eng, /parkValid\(def, this\.terrain\.cls, this\.net, this\.site, this\.parkDefs, !!this\.golf\)/);
    assert.match(eng, /woodland: \(\) => !!this\.golf/);
  });
  it('"not on buildable ground" is nowhere in the source', () => {
    for (const p of ['src/game/event/carpark.ts', 'src/game/event/rows.ts', 'src/game/engine.ts', 'src/game/golf/parkplace.ts', 'src/game/parking-tool.ts']) assert.doesNotMatch(src(p), /not on buildable ground/, p);
  });
});

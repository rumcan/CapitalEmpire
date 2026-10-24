// The range start in the City (plan P22, T087): T085's seed-1 network (the county road edge to edge and the range's drive) with the driving
// range, its car park, the golf land and the range start's exits, as a new game's city worker has it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { City } from '../src/game/city';
import { CLASS, RoadNetwork } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { generateTerrain } from '../src/game/terrain';
import { GOLF_REP_START } from '../src/game/golf/start';
import { planRangeStart } from '../src/game/golf/rangestart';
import type { BizDef } from '../src/game/business/state';
import type { Door } from '../src/game/business/visits';
import type { Lot } from '../src/game/lots/lots';
import type { Rect } from '../src/game/golf/mode';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const T = generateTerrain(1), P = planRangeStart(T, 1)!;
/** the city's private parts these tests look at */
type Inside = { bizDoor(b: BizDef): Door | null; reserved(l: Lot): boolean };
const inRect = (p: { x: number; y: number }, r: Rect) => p.x >= r[0] && p.y >= r[1] && p.x < r[0] + r[2] && p.y < r[1] + r[3];

/** the new game's city: the county road and the drive as town roads, the terrain with the town seed and golf on (the entry: the exit nearer the
 *  seed, as Engine.sendTerrain), the golf state, the range's car park and the range */
function build(): { city: City; range: BizDef; editor: NetEditor } {
  const city = new City(1); city.autoStadium = false;
  const editor = new NetEditor(new RoadNetwork()); editor.net.paintData = false;
  editor.addLegs(P.road.legs, CLASS.road!, 0, P.road.kinds, true);
  editor.addLegs(P.site.drive, CLASS['drive-gravel']!, 0, undefined, true);
  const c = P.site.centre, entry = [...P.road.exits].sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0]!;
  city.terrain(T.cls, entry, 1, [c], T.height, true);
  city.netOps(editor.commit(true));
  city.setGolf({ tier: 1, rep: GOLF_REP_START, land: [P.save.course, P.save.parcel], start: 'range', exits: P.save.exits });
  const [px, py, pw, ph] = P.site.carpark, [fx, fy, fw, fh] = P.site.rangeFront;
  city.setParks([{ id: 1, x: px, y: py, w: pw, h: ph }]);
  const range: BizDef = { id: 1, type: 'range', x: fx, y: fy, w: fw, h: fh };
  city.setBusinesses([range]);
  return { city, range, editor };
}

test('seed 1 has a range start, and the city keeps its start and exits', () => {
  assert.ok(P, 'seed 1 fits');
  const { city } = build();
  assert.equal(city.golf?.start, 'range');
  assert.deepEqual(city.golf?.exits, P.save.exits);
});

test("the range's door is found on its drive, not on the county road", () => {
  const { city, range } = build();
  const door = (city as unknown as Inside).bizDoor(range);
  assert.ok(door, 'a door');
  assert.equal(city.g.dsegs[door.dseg]!.seg.cls.id, 'drive-gravel');
});

test('reserved refuses a lot on the parcel and leaves the lots across the road free', () => {
  const { city } = build();
  const lots = [...city.lots.lots.values()];
  assert.ok(lots.length > 0, 'the county road has frontage lots');
  const on = lots.filter(l => inRect(l.c, P.site.parcel)), off = lots.filter(l => !inRect(l.c, P.site.parcel) && Math.hypot(l.c.x - P.site.centre.x, l.c.y - P.site.centre.y) < 120);
  assert.ok(on.length > 0 && off.length > 0, `lots on the parcel (${on.length}) and across the road near the seed (${off.length})`);
  for (const l of on) assert.equal((city as unknown as Inside).reserved(l), true, `lot ${l.key} on the parcel is reserved`);
  for (const l of off) assert.equal((city as unknown as Inside).reserved(l), false, `lot ${l.key} across the road is free`);
});

for (const grow of [1, 20]) test(`a season (one game day) at growth x${grow} passes without errors: the books close, the town lays streets off the golf land, nothing rises on the parcel, no tournament`, () => {
  const { city, editor } = build();
  city.setGrowth(grow); // x20: the dev server's sandbox growth, where the town reaches the parcel within the season
  let ledgers = 0, onParcel = 0, legs = 0;
  const p = P.site.parcel, pad: Rect = [p[0] - 6, p[1] - 6, p[2] + 12, p[3] + 12];
  for (let s = 0; s < 1440 + 60; s++) {
    const r = city.step(10);
    if (r.ledger) ledgers++;
    for (const e of r.events) { const l = city.lots.lots.get(e.key); if (l && e.kind === 'build' && inRect(l.c, P.site.parcel)) onParcel++; }
    // the town's legs go down as the engine lays them (Engine.townGrow): free gravel town roads
    if (r.grow) { legs += r.grow.length; editor.addLegs(r.grow, CLASS.gravel!, 2, undefined, true); city.netOps(editor.commit()); }
  }
  assert.equal(ledgers, 1, 'the season closed once');
  assert.ok(legs >= 1, 'the town laid its first street');
  for (const sg of editor.net.segs) if (sg.cls.id === 'gravel') for (let k = 0; k <= 10; k++) {
    const q = { x: sg.a.x + (sg.b.x - sg.a.x) * k / 10, y: sg.a.y + (sg.b.y - sg.a.y) * k / 10 };
    assert.ok(!(q.x > pad[0] && q.x < pad[0] + pad[2] && q.y > pad[1] && q.y < pad[1] + pad[3]), `the street ${sg.a.x},${sg.a.y} - ${sg.b.x},${sg.b.y} keeps 6 tiles off the golf land`);
  }
  assert.equal(onParcel, 0, 'nothing built on the parcel');
  assert.equal(city.round.stage, 'free', 'no tournament without a clubhouse (the venue is the range until T088/T089)');
});

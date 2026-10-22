import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { TC } from '../src/game/terrain/types';
import { Disasters, type Disaster, type DisasterKind, type RoadInfo } from '../src/game/ext/disasters';

const DAY = 1440;
function world(): { cls: Uint8Array; roads: RoadInfo[]; height: (x: number, y: number) => number } {
  const cls = new Uint8Array(MAP * MAP);
  for (let y = 90; y <= 270; y++) for (let x = 100; x <= 104; x++) cls[y * MAP + x] = TC.WATER;
  for (let y = 300; y < 330; y++) for (let x = 300; x < 335; x++) {
    if (x !== 318 && x !== 319) cls[y * MAP + x] = TC.PATCH;
  }
  const road = (key: string, x: number, y: number, xx: number, yy: number, kind: RoadInfo['kind'], nearWater: number, slope = 0): RoadInfo =>
    ({ key, a: { x, y }, b: { x: xx, y: yy }, kind, nearWater, slope });
  const roads = [
    road('river bridge', 94, 130, 113, 130, 'bridge', 0),
    road('low bank', 110, 160, 137, 160, 'ground', 5),
    road('high bank', 110, 220, 137, 220, 'ground', 5),
    road('remote', 460, 670, 490, 670, 'ground', 350),
    road('hill edge', 560, 400, 590, 400, 'ground', 180, 0.5),
    road('gentle hill', 561, 409, 590, 409, 'ground', 180, 0.03),
    road('forest', 307, 315, 316, 315, 'ground', 200),
    road('tunnel', 820, 610, 850, 610, 'tunnel', 200),
    road('overpass', 824, 618, 852, 618, 'bridge', 200),
  ];
  return { cls, roads, height: (x, y) => x > 105 && y > 195 && y < 275 ? 30 : 0 };
}
function setup(seed = 1) { const { cls, roads, height } = world(); return { sim: new Disasters(seed, cls, height), roads }; }

// Scan successive days, releasing quakes so they cannot permanently block subsequent rolls.
function find(kind: DisasterKind, seed = 1): { sim: Disasters; event: Disaster; roads: RoadInfo[] } {
  const { sim, roads } = setup(seed);
  for (let day = 1; day <= 1600; day++) {
    const { warned, started } = sim.step(day * DAY, roads);
    const event = [...warned, ...started].find(d => d.kind === kind);
    if (event) { sim.step(event.start, roads); return { sim, event, roads }; }
    for (const d of started) if (d.kind === 'quake') {
      for (const c of [...d.closures]) sim.repair(d.id, c.key);
      sim.step(day * DAY, roads);
    }
  }
  throw new Error(`no ${kind} in 1600 days`);
}

test('same seed, roads and clock yield the same transitions, including after skipped days', () => {
  const a = setup(284), b = setup(284);
  const trace = (sim: Disasters, roads: RoadInfo[], chunks: number[]) => {
    const results: { warned: Disaster[]; started: Disaster[]; ended: Disaster[] }[] = [];
    for (const day of chunks) results.push(sim.step(day * DAY, roads));
    return {
      warned: results.flatMap(r => r.warned.map(d => [d.id, d.kind, d.warnAt, d.start, d.end, d.closures.map(c => c.key)])),
      started: results.flatMap(r => r.started.map(d => [d.id, d.kind, d.start])),
      ended: results.flatMap(r => r.ended.map(d => [d.id, d.kind, d.end])),
    };
  };
  // Both clocks preserve the same quake damage.
  assert.deepEqual(trace(a.sim, a.roads, Array.from({ length: 200 }, (_, i) => i + 1)), trace(b.sim, b.roads, [200]));
  assert.throws(() => a.sim.step(0, a.roads), RangeError);
  assert.throws(() => a.sim.step(Infinity, a.roads), RangeError);
});

test('flood warns ahead of time, closes only nearby low roads/river crossings, then reopens', () => {
  const { sim, event, roads } = find('flood');
  assert.equal(event.warnAt + 90, event.start);
  assert.equal(event.end, event.start + 360);
  assert.ok(event.area.length >= 3);
  assert.ok(event.closures.length > 0);
  assert.ok(event.closures.every(c => ['river bridge', 'low bank'].includes(c.key)));
  assert.ok(event.closures.every(c => c.until === event.end && c.repairCost === 0));
  assert.deepEqual(sim.active().map(d => d.id), [event.id]);
  assert.deepEqual(sim.step(event.end - 0.01, roads).ended, []);
  assert.deepEqual(sim.step(event.end, roads).ended.map(d => d.id), [event.id]);
  assert.deepEqual(sim.active(), []);
});

test('landslides close steep ground roads only; storms warn before blocking area roads', () => {
  const land = find('landslide');
  assert.deepEqual(land.event.closures.map(c => c.key), ['hill edge']);
  assert.equal(land.event.start, land.event.warnAt);
  const storm = find('storm');
  assert.equal(storm.event.start - storm.event.warnAt, 45);
  assert.ok(storm.event.closures.length > 0);
  assert.ok(storm.event.closures.every(c => c.until === storm.event.end));
});

test('quake damage persists until every bridge/tunnel is repaired (idempotent and scoped by id)', () => {
  const { sim, event, roads } = find('quake');
  assert.equal(event.end, Infinity);
  assert.ok(event.closures.length > 0);
  assert.ok(event.closures.every(c => ['river bridge', 'tunnel', 'overpass'].includes(c.key) && c.until === 'repair' && c.repairCost > 0));
  const keys = event.closures.map(c => c.key);
  sim.step(event.start + 10000, roads);
  assert.deepEqual(sim.active().map(d => d.id), [event.id]);
  sim.repair(event.id + 1, keys[0]);
  assert.equal(event.closures.length, keys.length);
  for (const key of keys.slice(0, -1)) sim.repair(event.id, key);
  assert.equal(event.closures.length, 1);
  sim.repair(event.id, keys[keys.length - 1]);
  assert.deepEqual(sim.active(), []);
  assert.deepEqual(sim.step(event.start + 10000, roads).ended.map(d => d.id), [event.id]);
  assert.deepEqual(sim.step(event.start + 10000, roads).ended, []);
});

test('wildfire spreads over connected PATCH cells only, with a polygon overlay and road closures', () => {
  const { sim, event, roads } = find('wildfire');
  assert.ok(event.burned && event.burned.length > 0);
  assert.ok(event.area.length >= 3);
  const { cls } = world();
  const cells = new Set(event.burned!.map(p => `${p.x},${p.y}`));
  for (const p of event.burned!) {
    assert.equal(cls[Math.floor(p.y) * MAP + Math.floor(p.x)], TC.PATCH);
    assert.ok(p.x < 318, 'fire crossed the nonburnable firebreak');
  }
  const visited = new Set<string>();
  const queue = [event.burned![0]];
  while (queue.length) {
    const p = queue.pop()!, key = `${p.x},${p.y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (cells.has(`${q.x},${q.y}`) && !visited.has(`${q.x},${q.y}`)) queue.push(q);
    }
  }
  assert.equal(visited.size, cells.size);
  assert.deepEqual(event.closures.map(c => c.key), ['forest']);
  assert.deepEqual(sim.step(event.end, roads).ended.map(d => d.id), [event.id]);
});

test('daily exposure grows with river length and steep road length; empty maps have no risk', () => {
  const { cls, roads, height } = world();
  const sim = new Disasters(4, cls, height);
  const risk = sim.riskPerDay(roads);
  // the paranormal nights are retired: no risk; every natural kind has some
  assert.equal(risk.paranormal, 0);
  assert.ok(Object.entries(risk).every(([k, v]) => k === 'paranormal' || (v > 0 && v < 1)));
  const longerRiver = cls.slice();
  for (let y = 271; y < 480; y++) for (let x = 100; x <= 104; x++) longerRiver[y * MAP + x] = TC.WATER;
  assert.ok(new Disasters(4, longerRiver, height).riskPerDay(roads).flood > risk.flood);
  const longerHill = [...roads, { ...roads.find(r => r.key === 'hill edge')!, key: 'long hill', b: { x: 850, y: 400 } }];
  assert.ok(sim.riskPerDay(longerHill).landslide > risk.landslide);
  assert.ok(Object.values(sim.riskPerDay([])).every(v => v === 0));
  const { sim: quiet, roads: empty } = { sim: new Disasters(4, new Uint8Array(MAP * MAP), height), roads: [] };
  assert.equal(quiet.step(0.1, empty), quiet.step(0.2, empty), 'ordinary sim ticks reuse the quiet result');
});

test('hill forest cells are also burnable fuel, but fire cannot spread through ground', () => {
  const cls = new Uint8Array(MAP * MAP);
  for (let y = 402; y < 420; y++) for (let x = 612; x < 635; x++) cls[y * MAP + x] = TC.HILL;
  const roads: RoadInfo[] = [{ key: 'forest edge', a: { x: 609, y: 410 }, b: { x: 616, y: 410 }, kind: 'ground', nearWater: 300, slope: 0 }];
  const sim = new Disasters(41, cls, () => 0);
  let fire: Disaster | undefined;
  for (let day = 1; day <= 1600 && !fire; day++) fire = sim.step(day * DAY, roads).started.find(d => d.kind === 'wildfire');
  assert.ok(fire);
  assert.deepEqual(fire.closures.map(c => c.key), ['forest edge']);
  assert.ok(fire.burned!.every(p => cls[Math.floor(p.y) * MAP + Math.floor(p.x)] === TC.HILL));
});

test('1000 simulated days: risk produces each kind, never overlaps, and reports mean days between events', () => {
  const { sim, roads } = setup(77);
  const counts: Record<DisasterKind, number> = { flood: 0, storm: 0, landslide: 0, wildfire: 0, quake: 0, paranormal: 0 };
  let lastId = 0;
  for (let day = 1; day <= 1000; day++) {
    const { warned, started } = sim.step(day * DAY, roads);
    const discovered = [...warned, ...started.filter(d => d.warnAt === d.start)];
    assert.ok(discovered.length <= 1, `more than one new event on day ${day}`);
    for (const d of discovered) {
      assert.ok(d.id > lastId);
      lastId = d.id;
      counts[d.kind]++;
    }
    assert.ok(sim.active().length <= 1);
    for (const d of started) if (d.kind === 'quake') {
      for (const c of [...d.closures]) sim.repair(d.id, c.key);
      sim.step(day * DAY, roads);
    }
  }
  assert.equal(counts.paranormal, 0, 'the paranormal nights are retired');
  for (const kind of (Object.keys(counts) as DisasterKind[]).filter(k => k !== 'paranormal')) {
    assert.ok(counts[kind] > 0, `${kind} never fired`);
    console.log(`${kind}: ${counts[kind]} in 1000 days, mean ${Math.round(1000 / counts[kind])} days between`);
  }
});

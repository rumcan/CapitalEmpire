import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { Disasters, type Disaster, type RoadInfo } from '../src/game/ext/disasters';
import { sampleParanormalBattle, PARANORMAL_MONSTERS } from '../src/game/ext/paranormal';

const DAY = 1440;
const terrain = new Uint8Array(MAP * MAP);
const roads: RoadInfo[] = Array.from({ length: 9 }, (_, i) => ({ key: `town-${i}`,
  a: { x: 400 + i % 3 * 10, y: 400 + Math.floor(i / 3) * 10 },
  b: { x: 410 + i % 3 * 10, y: 400 + Math.floor(i / 3) * 10 },
  kind: 'ground', nearWater: 999, slope: 0 }));
const setup = (seed = 12) => new Disasters(seed, terrain, () => 0);
function forcedNight(): { sim: Disasters; event: Disaster } {
  const sim = setup(); sim.force('paranormal');
  const event = sim.step(DAY, roads).warned[0];
  assert.equal(event.kind, 'paranormal'); return { sim, event };
}

test('paranormal nights recur every 3-5 days independently of low natural disaster risk', () => {
  const sim = setup(), nights: Disaster[] = [];
  for (let day = 1; day <= 100; day++) {
    const changes = sim.step(day * DAY, roads);
    nights.push(...changes.warned.filter(d => d.kind === 'paranormal'));
    assert.ok(sim.active().length <= 1);
  }
  assert.ok(nights.length >= 20);
  assert.ok(nights[0].warnAt >= 3 * DAY && nights[0].warnAt <= 5 * DAY);
  for (let i = 1; i < nights.length; i++) {
    const days = (nights[i].warnAt - nights[i - 1].warnAt) / DAY;
    assert.ok(days >= 3 && days <= 5, `recurrence ${days} days`);
  }
});

test('forced night warns, blocks several neighbourhood roads, then releases every closure at dawn', () => {
  const { sim, event } = forcedNight();
  assert.equal(event.start - event.warnAt, 45);
  assert.equal(event.end - event.start, 240);
  assert.equal(sim.active().length, 0);
  assert.deepEqual(sim.step(event.start - 0.1, roads).started, []);
  assert.equal(sim.step(event.start, roads).started[0], event);
  assert.ok(event.closures.length >= 4);
  assert.ok(event.closures.every(c => c.until === event.end && c.repairCost === 0));
  assert.deepEqual(sim.step(event.end, roads).ended.map(d => d.id), [event.id]);
  assert.deepEqual(sim.active(), []);
  assert.deepEqual(sim.step(event.end + 0.1, roads).ended, []);
});

test('no roads and tunnel-only maps cannot schedule paranormal battles', () => {
  const empty = setup(); empty.force('paranormal');
  const results = empty.step(30 * DAY, []);
  assert.deepEqual(results, { warned: [], started: [], ended: [] });
  const tunnels = setup(); tunnels.force('paranormal');
  const tunnelRoads = roads.map(r => ({ ...r, kind: 'tunnel' as const }));
  const changes = tunnels.step(30 * DAY, tunnelRoads);
  assert.ok([...changes.warned, ...changes.started].every(d => d.kind !== 'paranormal'));
});

test('a connected town is selected over an isolated remote road', () => {
  const sim = setup(); sim.force('paranormal');
  const remote = { ...roads[0], key: 'remote', a: { x: 1400, y: 1400 }, b: { x: 1430, y: 1400 } };
  const event = sim.step(DAY, [remote, ...roads]).warned[0];
  assert.ok(event.closures.length >= 4);
  assert.ok(event.closures.every(c => c.key !== 'remote'));
});

test('unrepaired quake damage remains repairable without starving periodic paranormal nights', () => {
  const sim = setup(), bridges = roads.map(r => ({ ...r, kind: 'bridge' as const }));
  sim.force('quake'); const quake = sim.step(DAY, bridges).started[0];
  assert.equal(quake.kind, 'quake');
  let night: Disaster | undefined;
  for (let day = 2; day <= 5 && !night; day++) night = sim.step(day * DAY, bridges).warned.find(d => d.kind === 'paranormal');
  assert.ok(night);
  assert.equal(quake.end, Infinity);
  assert.ok(quake.closures.every(c => c.until === 'repair'));
  sim.step(night.start, bridges);
  assert.deepEqual(sim.active().map(d => d.kind), ['paranormal']);
  const keys = quake.closures.map(c => c.key);
  for (const key of keys) sim.repair(quake.id, key);
  const changes = sim.step(night.start, bridges);
  assert.deepEqual(changes.ended.map(d => d.id), [quake.id]);
  assert.deepEqual(sim.active().map(d => d.id), [night.id]);
  sim.step(night.end, bridges); assert.deepEqual(sim.active(), []);
});

test('unrepaired quake becomes visible again after the night without being started twice', () => {
  const sim = setup(), bridges = roads.map(r => ({ ...r, kind: 'bridge' as const }));
  sim.force('quake'); const quake = sim.step(DAY, bridges).started[0];
  const night = sim.step(5 * DAY, bridges).warned.find(d => d.kind === 'paranormal')!;
  assert.ok(night);
  const changes = sim.step(night.end, bridges);
  assert.deepEqual(changes.started.map(d => d.id), [night.id]);
  assert.deepEqual(changes.ended.map(d => d.id), [night.id]);
  assert.ok(sim.active().some(d => d.id === quake.id));
});

test('battles are deterministic, contain seven monster types, approach, fight, defeat and disappear', () => {
  const { event } = forcedNight();
  assert.deepEqual(sampleParanormalBattle(event, event.warnAt), []);
  assert.deepEqual(sampleParanormalBattle(event, event.end), []);
  const walking = sampleParanormalBattle(event, event.start + 3);
  const fighting = sampleParanormalBattle(event, event.start + 20);
  const defeated = sampleParanormalBattle(event, event.start + 35);
  assert.equal(walking.length, 14);
  assert.deepEqual(fighting, sampleParanormalBattle(event, event.start + 20));
  assert.deepEqual(new Set(walking.filter(a => a.kind !== 'kid').map(a => a.kind)), new Set(PARANORMAL_MONSTERS));
  assert.ok(walking.every(a => a.action === 'walk'));
  assert.ok(fighting.every(a => a.action === 'fight'));
  assert.ok(defeated.filter(a => a.kind !== 'kid').every(a => a.action === 'defeated' && a.alpha > 0 && a.alpha < 1));
  assert.notDeepEqual(walking.map(a => [a.x, a.y]), fighting.map(a => [a.x, a.y]));
  assert.ok(fighting.filter(a => a.kind === 'kid').every(a => a.light.color === '#ffd38a' && a.light.radius > 0));
  assert.ok(fighting.every(a => Number.isFinite(a.x + a.y + a.facing)));
  assert.notDeepEqual(sampleParanormalBattle(event, event.start + 20), sampleParanormalBattle(event, event.start + 60));
  assert.deepEqual(sampleParanormalBattle({ ...event, kind: 'storm' }, event.start + 20), []);
});


test('a queued natural disaster force cannot starve periodic nights behind an unrepaired quake', () => {
  const sim = setup(), bridges = roads.map(r => ({ ...r, kind: 'bridge' as const }));
  sim.force('quake'); const quake = sim.step(DAY, bridges).started[0];
  sim.force('storm');
  const changes = sim.step(20 * DAY, bridges);
  assert.ok(changes.warned.filter(d => d.kind === 'paranormal').length >= 3);
  assert.ok(changes.warned.every(d => d.kind !== 'storm'), 'the queued storm still waits for quake repair');
  assert.equal(quake.end, Infinity);
});

// Road ownership (B.7): a seg the towns laid (Seg.town) costs the player no upkeep; a split keeps the flag; a player's rebuild takes it; netToOps and
// applyOps replay it; a town lot that completes beside a player's road pays its connection fee once per lot key (not beside a town's road); the
// books' save keeps the fee keys and the saved segs keep the flag. npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { City } from '../src/game/city';
import { CLASS, RoadNetwork, classOf, type Leg, type Seg, type SegKind } from '../src/game/network';
import { NetEditor, applyOps, netToOps } from '../src/game/netops';
import { MAP } from '../src/game/iso';
import { LU, LV, type TownEvent } from '../src/game/lots/town';
import { CONNECT_FEE, segUpkeep } from '../src/game/budget';
import { segRec, type SaveV5 } from '../src/game/save';
import type { LineStyle } from '../src/game/types';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** a sorted list of the net's segs as ends and owner, for comparing two networks */
const owners = (segs: Iterable<Seg>) => [...segs].map(s => `${s.a.x},${s.a.y}-${s.b.x},${s.b.y}:${s.cls.id}:${s.town ? 'town' : 'player'}`).sort();
/** a town completion event for a lot (the City's tick passes these to connect) */
const done = (key: string, use: number): TownEvent => ({ key, kind: 'complete', use, level: LV.BUILT, decline: 0, seed: 1, since: 0 });
/** the City's private connect, for the tests */
type Connects = { connect(e: TownEvent): void; feeKeys: Set<string> };

test('a town leg split by a player road: both town pieces keep the flag, the player road has none', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 50, 100, 50)], CLASS.street, 0, undefined, true);
  e.addLegs([leg(50, 0, 50, 100)], CLASS.street, 0);
  e.commit();
  const segs = [...e.net.segs];
  const town = segs.filter(s => s.a.y === 50 && s.b.y === 50), mine = segs.filter(s => s.a.x === 50 && s.b.x === 50);
  assert.equal(town.length, 2, 'the town leg is split at the crossing');
  assert.ok(town.every(s => s.town === true), 'both pieces stay the towns\'');
  assert.equal(mine.length, 2, 'the player road is split too');
  assert.ok(mine.every(s => s.town === undefined), 'the player road has no flag');
});

test('a player road laid over a town street takes it: the upgrade is the player\'s', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 50, 100, 50)], CLASS.street, 0, undefined, true);
  e.commit();
  e.addLegs([leg(0, 50, 100, 50)], CLASS.avenue, 0);
  e.commit();
  assert.ok([...e.net.segs].length > 0);
  assert.ok([...e.net.segs].every(s => s.town === undefined && s.cls.id === 'avenue'), 'the rebuilt seg is the player\'s');
});

test('upkeep counts only the player\'s segs: a town street and a player street of one length pay half the all-segs total', () => {
  const city = new City(7);
  city.terrain(new Uint8Array(MAP * MAP), { x: 40, y: 40 }, 7);
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(100, 100, 200, 100)], CLASS.street, 0, undefined, true);
  e.addLegs([leg(100, 300, 200, 300)], CLASS.street, 0);
  city.netOps(e.commit(true));
  const one = segUpkeep({ cls: 'street', len: 100, kind: 0 });
  assert.equal(city.upkeepRate(), one, 'only the player\'s street');
  assert.equal([...city.dayIn().segs].length, 1, 'the day\'s segs are the player\'s too');
  const all = [...city.net.segs].reduce((a, s) => a + segUpkeep({ cls: s.cls.id, len: Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), kind: s.kind }), 0);
  assert.equal(all, one * 2, 'the all-segs total is two streets');
  assert.equal(city.upkeepRate() * 2, all, 'half of it');
});

test('netToOps of a mixed network replays to the same owners; the town legs are their own op', () => {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(0, 50, 100, 50)], CLASS.street, 0, undefined, true);
  e.addLegs([leg(50, 0, 50, 100)], CLASS.street, 0);
  e.addLegs([leg(300, 0, 300, 100)], CLASS.street, 0, undefined, true);
  e.addLegs([leg(400, 0, 400, 100)], CLASS.street, 0);
  e.commit();
  const ops = netToOps(e.net);
  assert.equal(ops.filter(o => o.k === 'legs' && o.town).length, 1, 'one op for the towns\' legs of this class and style');
  const back = new RoadNetwork();
  applyOps(back, ops);
  back.rebuild(true);
  assert.deepEqual(owners(back.segs), owners(e.net.segs));
});

test('the connection fee: a lot completing beside a player road pays once per key; a lot beside a town street pays nothing', () => {
  const city = new City(7);
  city.autoStadium = false;
  city.terrain(new Uint8Array(MAP * MAP), { x: 40, y: 40 }, 7);
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(160, 160, 440, 160)], CLASS.street, 0, undefined, true);
  e.addLegs([leg(160, 600, 440, 600)], CLASS.street, 0);
  e.addLegs([leg(160, 900, 440, 900)], CLASS.street, 0);
  city.netOps(e.commit(true));
  const lots = [...city.lots.lots.values()];
  const mine = lots.filter(l => !l.seg.town), town = lots.filter(l => l.seg.town);
  assert.ok(mine.length >= 2 && town.length >= 1, 'lots on both kinds of road');
  const c = city as unknown as Connects;
  const first = mine[0]!, other = mine[1]!;
  const m0 = city.budget.money;
  c.connect(done(first.key, LU.RES));
  assert.equal(city.budget.money - m0, CONNECT_FEE[LU.RES], 'a home beside a player road: $250');
  assert.equal(city.budget.today.fees, CONNECT_FEE[LU.RES]);
  c.connect(done(first.key, LU.RES));
  assert.equal(city.budget.today.fees, CONNECT_FEE[LU.RES], 'built again (after clearing): nothing');
  c.connect(done(other.key, LU.COM));
  assert.equal(city.budget.today.fees, CONNECT_FEE[LU.RES] + CONNECT_FEE[LU.COM], 'a shop beside a player road: $500');
  c.connect(done(town[0]!.key, LU.COM));
  assert.equal(city.budget.today.fees, CONNECT_FEE[LU.RES] + CONNECT_FEE[LU.COM], 'a lot beside a town street: nothing');
  assert.ok(!c.feeKeys.has(town[0]!.key), 'and its key is not paid');
});

test('the save keeps the fee keys (books) and the seg flags (segRec through JSON)', () => {
  const city = new City(7);
  city.autoStadium = false;
  city.terrain(new Uint8Array(MAP * MAP), { x: 40, y: 40 }, 7);
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(160, 160, 440, 160)], CLASS.street, 0, undefined, true);
  e.addLegs([leg(160, 600, 440, 600)], CLASS.street, 0);
  city.netOps(e.commit(true));
  const key = [...city.lots.lots.values()].find(l => !l.seg.town)!.key;
  (city as unknown as Connects).connect(done(key, LU.RES));
  const books = JSON.parse(JSON.stringify(city.booksSave())) as { feeKeys?: string[] };
  assert.deepEqual(books.feeKeys, [key]);
  const back = new City(7);
  back.setBudget(JSON.parse(JSON.stringify(city.booksSave())));
  assert.ok((back as unknown as Connects).feeKeys.has(key), 'a loaded city has the key paid');
  const old = new City(7);
  old.setBudget(JSON.parse(JSON.stringify(city.budget.toJSON())));
  assert.equal((old as unknown as Connects).feeKeys.size, 0, 'an old save (no feeKeys) has none paid');

  const segs = [...e.net.segs].map(segRec);
  const saved = JSON.parse(JSON.stringify(segs)) as SaveV5['segs'];
  const n2 = new NetEditor(new RoadNetwork());
  for (const [ax, ay, bx, by, cls, style, kind, town] of saved) n2.addLegs([{ a: { x: ax, y: ay }, b: { x: bx, y: by } }], classOf(cls), style as LineStyle, [(kind ?? 0) as SegKind], town ? true : undefined);
  n2.commit(true);
  assert.deepEqual(owners(n2.net.segs), owners(e.net.segs), 'the loaded network has the same owners');
  assert.ok(saved.some(r => r[7] === 1) && saved.some(r => r.length === 7), 'an old-style record (no flag) and a town one');
});

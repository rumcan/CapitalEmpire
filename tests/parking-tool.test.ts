// The Parking tool's headless tests (docs/PARKING.md sections 1 and 2): a row dragged beside a street, a drag over the road refused, a click removing the row,
// Tab flipping the side, a curb on an arterial added and removed, the fee's clamp, and the save and load round trip; with a fake host that records the
// ground, the worker sends, the spending, the toasts and the saves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg, type Seg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { MAP } from '../src/game/iso';
import { TC } from '../src/game/terrain/types';
import type { LotPatch } from '../src/game/ground-protocol';
import { ParkingTool, type ParkingHost } from '../src/game/parking-tool';
import { LOT_ID0, ROW_BAY_COST, rowBays, rowLines, rowQuad, type BayRowDef } from '../src/game/event/rows';
import { curbLines, curbQuad, resolveCurb, type CurbDef } from '../src/game/event/curb';
import { CURB_BAY_COST } from '../src/game/event/config';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** the main road's centre line (tiles) for the curb tests */
const ROAD_Y = 300;
/** every tile buildable ground */
const TERRAIN = new Uint8Array(MAP * MAP).fill(TC.GROUND);
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

/** a network of one straight street along y = 300, from x 200 to 800 */
function street(): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, ROAD_Y, 800, ROAD_Y)], CLASS.street, 0);
  e.commit();
  return e.net;
}
/** a network of an arterial along y = 300 from x 200 to 800, with a street across it at each x in xs */
function arterial(xs: number[] = [400, 600]): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, ROAD_Y, 800, ROAD_Y)], CLASS.arterial, 0);
  e.addLegs(xs.map(x => leg(x, ROAD_Y - 100, x, ROAD_Y + 100)), CLASS.street, 0);
  e.commit();
  return e.net;
}
/** the main road's seg holding x */
const segAt = (n: RoadNetwork, x: number): Seg => [...n.segs].find(s => s.a.y === ROAD_Y && s.b.y === ROAD_Y && Math.min(s.a.x, s.b.x) <= x && x <= Math.max(s.a.x, s.b.x))!;

/** what the fake host recorded */
interface Rec {
  ground: [string, LotPatch[] | null][];
  sent: { rows: BayRowDef[]; curbs: CurbDef[]; fee: number }[];
  spent: number[];
  toasts: [string, string | undefined][];
  saves: number;
  emits: number;
}

/** a host on net with money, recording every call */
function fake(net: RoadNetwork, money = 1e6): { host: ParkingHost; rec: Rec } {
  const rec: Rec = { ground: [], sent: [], spent: [], toasts: [], saves: 0, emits: 0 };
  const host: ParkingHost = {
    setLotGround: (key, patches) => { rec.ground.push([key, patches]); },
    emit: () => { rec.emits++; },
    save: () => { rec.saves++; },
    toast: (text, kind) => { rec.toasts.push([text, kind]); },
    money: () => money,
    spend: n => { rec.spent.push(n); },
    sendParking: (rows, curbs, fee) => { rec.sent.push({ rows: rows.map(r => ({ ...r })), curbs: curbs.map(c => ({ ...c })), fee }); },
    net: () => net,
    terrain: () => TERRAIN,
    mapSize: MAP,
    tollKeys: () => new Set<string>(),
  };
  return { host, rec };
}

/** the last patch list sent for key (null if it was last dropped, undefined if never sent) */
function lastGround(rec: Rec, key: string): LotPatch[] | null | undefined {
  let out: LotPatch[] | null | undefined = undefined;
  for (const [k, p] of rec.ground) if (k === key) out = p;
  return out;
}
/** a key event for the tool (no DOM in Node) */
const keyEv = (key: string, log?: { prevented: boolean }): KeyboardEvent =>
  ({ key, preventDefault() { if (log) log.prevented = true; } }) as unknown as KeyboardEvent;
/** the last toast */
const lastToast = (rec: Rec) => rec.toasts[rec.toasts.length - 1];

/** a 12.5 tile row beside the street: from (400, 306) to (412.5, 306), bays on the +y side (id 1) */
function layRow(t: ParkingTool) {
  t.down({ x: 400, y: 306 });
  t.move({ x: 412.5, y: 306 }, 400, 306);
  t.up();
}

test('a 12.5 tile drag beside a street lays a row: 10 bays at $400, the row:1 ground in yellow, one row sent', () => {
  const { host, rec } = fake(street());
  const t = new ParkingTool(host);
  t.mode = 'rows';
  layRow(t);
  assert.equal(t.rows.length, 1);
  const r = t.rows[0]!;
  assert.deepEqual(r, { id: 1, ax: 400, ay: 306, bx: 412.5, by: 306, side: 1, bay: 90, col: 'yellow' });
  assert.equal(rowBays(r).length, 10);
  assert.deepEqual(rec.spent, [10 * ROW_BAY_COST]);
  assert.deepEqual(lastGround(rec, 'row:1'), [{ pts: rowQuad(r), tex: 'asphalt', lines: rowLines(r), lineCol: 'yellow' }]);
  const s = rec.sent[rec.sent.length - 1]!;
  assert.equal(s.rows.length, 1);
  assert.equal(s.fee, 5);
  assert.deepEqual(lastToast(rec), ['10 bays ($400)', 'good']);
  assert.equal(rec.saves, 1);
});

test('a drag over the street is refused with "a road runs over it"; nothing is spent or sent as a row', () => {
  const { host, rec } = fake(street());
  const t = new ParkingTool(host);
  t.mode = 'rows';
  t.down({ x: 400, y: 302 });
  t.move({ x: 412.5, y: 302 }, 400, 302);
  assert.equal(t.why, 'a road runs over it');
  t.up();
  assert.equal(t.rows.length, 0);
  assert.deepEqual(lastToast(rec), ['a road runs over it', 'warn']);
  assert.deepEqual(rec.spent, []);
  assert.equal(lastGround(rec, 'row:1'), undefined);
});

test('a click on a row removes it (no refund) and drops row:1', () => {
  const { host, rec } = fake(street());
  const t = new ParkingTool(host);
  t.mode = 'rows';
  layRow(t);
  t.down({ x: 405, y: 308 });
  t.up();
  assert.equal(t.rows.length, 0);
  assert.equal(lastGround(rec, 'row:1'), null);
  assert.deepEqual(rec.spent, [10 * ROW_BAY_COST], 'the removal spends nothing');
  assert.deepEqual(lastToast(rec), ['Row removed', undefined]);
  assert.equal(rec.sent[rec.sent.length - 1]!.rows.length, 0);
});

test('Tab flips the side in rows mode (preventing the default), and other keys pass', () => {
  const { host } = fake(street());
  const t = new ParkingTool(host);
  t.mode = 'rows';
  const log = { prevented: false };
  assert.equal(t.key(keyEv('Tab', log)), true);
  assert.equal(t.side, -1);
  assert.equal(log.prevented, true);
  assert.equal(t.key(keyEv('Tab')), true);
  assert.equal(t.side, 1);
  assert.equal(t.key(keyEv('a')), false);
});

test('curb mode on an arterial: hover and click add a curb (curb:1, top); clicking it again removes it', () => {
  const net = arterial(), seg = segAt(net, 500);
  const { host, rec } = fake(net);
  const t = new ParkingTool(host);
  t.mode = 'curb';
  t.hover(seg, { x: 500, y: ROAD_Y + 1 }, 500, 300);
  assert.equal(t.hoverExisting, 0);
  assert.equal(t.why, '');
  assert.deepEqual(t.hoverCurb, { id: 0, ax: 400, ay: ROAD_Y, bx: 600, by: ROAD_Y });
  t.click();
  assert.equal(t.curbs.length, 1);
  assert.deepEqual(t.curbs[0], { id: 1, ax: 400, ay: ROAD_Y, bx: 600, by: ROAD_Y });
  const c = resolveCurb(net, t.curbs[0]!)!;
  assert.ok(c.bays.length > 0);
  assert.deepEqual(lastGround(rec, 'curb:1'), [{ pts: curbQuad(c), tex: 'asphalt', top: true, lines: curbLines(c) }]);
  assert.deepEqual(rec.spent, [c.bays.length * CURB_BAY_COST]);
  assert.deepEqual(lastToast(rec), [`${c.bays.length} on-street bays ($${c.bays.length * CURB_BAY_COST})`, 'good']);
  assert.equal(rec.sent[rec.sent.length - 1]!.curbs.length, 1);

  t.hover(seg, { x: 500, y: ROAD_Y + 1 }, 500, 301);
  assert.equal(t.hoverExisting, 1, 'the run overlaps curb 1');
  t.click();
  assert.equal(t.curbs.length, 0);
  assert.equal(lastGround(rec, 'curb:1'), null);
  assert.deepEqual(lastToast(rec), ['On-street parking removed', undefined]);
  assert.equal(rec.sent[rec.sent.length - 1]!.curbs.length, 0);
});

test('curb mode on a street: the curb is a lay-by (curb:1 with layby, no top), its bays on the sidewalk', () => {
  const net = street(), seg = segAt(net, 500);
  const { host, rec } = fake(net);
  const t = new ParkingTool(host);
  t.mode = 'curb';
  t.hover(seg, { x: 500, y: ROAD_Y + 1 }, 500, 300);
  assert.equal(t.why, '', 'a street takes a lay-by');
  t.click();
  assert.equal(t.curbs.length, 1);
  const c = resolveCurb(net, t.curbs[0]!)!;
  assert.equal(c.layby, true);
  assert.deepEqual(lastGround(rec, 'curb:1'), [{ pts: curbQuad(c), tex: 'asphalt', layby: true, lines: curbLines(c) }]);
  assert.equal(lastGround(rec, 'curb:1')![0]!.top, undefined, 'no top: the lay-by is drawn over the sidewalk, not the road');
});

test('setFee clamps to 0..50, rounds to whole dollars, and syncs the fee to the worker', () => {
  const { host, rec } = fake(street());
  const t = new ParkingTool(host);
  t.setFee(99);
  assert.equal(t.fee, 50);
  t.setFee(-3);
  assert.equal(t.fee, 0);
  t.setFee(7.6);
  assert.equal(t.fee, 8);
  assert.deepEqual(rec.sent.map(s => s.fee), [50, 0, 8]);
  assert.equal(rec.saves, 3);
});

test('the lots and curb parks for the city: a row 6 tiles from the street is a lot with its id; a curb is a park with a negative id', () => {
  const { host } = fake(arterial());
  const t = new ParkingTool(host);
  t.mode = 'rows';
  t.rows.push({ id: 1, ax: 400, ay: 306, bx: 412.5, by: 306, side: 1, bay: 90, col: 'white' });
  const lots = t.lots();
  assert.equal(lots.length, 1);
  assert.equal(lots[0]!.id, LOT_ID0 + 1);
  t.curbs.push({ id: 1, ax: 400, ay: ROAD_Y, bx: 600, by: ROAD_Y });
  const parks = t.curbParks();
  assert.equal(parks.length, 1);
  assert.equal(parks[0]!.id, -1);
  assert.equal(parks[0]!.curb, true);
  assert.ok(parks[0]!.bays.length > 0);
});

test('save and load round trip: the lists and fee come back as copies, their ground is sent, and clear drops it', () => {
  const net = street();
  const { host, rec } = fake(net);
  const t = new ParkingTool(host);
  t.mode = 'rows';
  layRow(t);
  t.setFee(12);
  const saved = t.save();
  assert.deepEqual(saved.fee, 12);
  assert.equal(saved.rows.length, 1);
  assert.notEqual(saved.rows[0], t.rows[0], 'a copy');

  const { host: host2, rec: rec2 } = fake(net);
  const u = new ParkingTool(host2);
  u.load(saved.rows, saved.curbs, saved.fee);
  assert.equal(u.fee, 12);
  assert.equal(u.rows.length, 1);
  assert.deepEqual(lastGround(rec2, 'row:1'), [{ pts: rowQuad(u.rows[0]!), tex: 'asphalt', lines: rowLines(u.rows[0]!), lineCol: 'yellow' }]);
  assert.equal(rec2.saves, 0, 'load does not save');

  u.clear();
  assert.equal(u.rows.length, 0);
  assert.equal(u.fee, 12, 'clear keeps the fee');
  assert.equal(lastGround(rec2, 'row:1'), null);
  assert.equal(rec.saves, 2, 'the row and the fee were saved');
});

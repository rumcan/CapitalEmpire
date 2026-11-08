// T353 (#995): the House lots tool (golf/estatetool.ts) against a stand-in game: a click lays the lot under the pointer, a drag lays the row it covers, the ghost says what would
// happen (green with the price tag, red with the reason), nothing is laid or charged on a refusal, no street in reach is said and offered, and Esc drops a drag first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAY_COST, ST, newEstate, type EstateEnv, type EstateLot, type RoadBit, type StreetSeg } from '../src/game/golf/estate';
import { EstateTool, NO_STREET, type EstateToolCtx } from '../src/game/golf/estatetool';

const P = (x: number, y: number) => ({ x, y });
/** an estate street along y = 100 from x = 100 to 200 (the lots of a Street: 10 x 15 tiles, 2.65 off its line) */
const STREET: StreetSeg = { a: P(100, 100), b: P(200, 100), base: 'street', h: 1.625, walk: 1.025, ra: 0, rb: 0 };
const STREET_BIT: RoadBit = { a: P(100, 100), b: P(200, 100), hw: 2.65, kind: 'road' };
const owned = (x: number, y: number) => x >= 90 && x <= 210 && y >= 60 && y <= 140;
const env = (o: Partial<EstateEnv> = {}): EstateEnv => ({ map: 2048, owned, grid: null, lines: [], roads: () => [STREET_BIT], ...o });

/** a tool on a stand-in game: the pointer's pixels are tiles, the street is the one above; the log keeps what the tool did */
function make(o: { money?: number; streets?: StreetSeg[]; env?: EstateEnv } = {}) {
  const e = newEstate(0), log = { charged: [] as number[], laid: [] as EstateLot[][], toasts: [] as string[], noStreet: [] as { x: number; y: number }[], emits: 0 };
  const ctx: EstateToolCtx = {
    tileAt: (mx, my) => P(mx, my), streets: () => o.streets ?? [STREET], env: () => o.env ?? env(),
    estate: () => e, now: () => 3, seed: () => 9, money: () => o.money ?? 1e6, quote: () => ({ price: 11300, view: 'no view' }),
    charge: c => { log.charged.push(c); }, laid: p => { log.laid.push([...p]); }, noStreet: p => { log.noStreet.push(p); },
    toast: t => { log.toasts.push(t); }, emit: () => { log.emits++; },
  };
  return { tool: new EstateTool(ctx), e, log };
}

test('a click: the ghost is the one lot under the pointer with its price tag; the click lays it for LAY_COST and the lot is for sale', () => {
  const { tool, e, log } = make();
  tool.arm(true); assert.equal(tool.on, true); assert.equal(tool.ghost, null, 'nothing under a pointer that has not moved');
  tool.move(125, 110);
  assert.equal(tool.ghost!.frames.length, 1); assert.equal(tool.ghost!.ok, 1); assert.equal(tool.ghost!.bad, false);
  assert.equal(tool.ghost!.label, 'House lot · $1,000 to lay · asks about $11,300 (no view)');
  tool.down(125, 110); assert.equal(tool.dragging, true); tool.up(125, 110); assert.equal(tool.dragging, false);
  assert.equal(e.lots.length, 1); assert.equal(e.lots[0]!.st, ST.SALE); assert.equal(e.lots[0]!.at, 3, 'laid at the game month now');
  assert.deepEqual(log.charged, [LAY_COST]); assert.equal(log.laid.length, 1); assert.equal(log.laid[0]!.length, 1);
  assert.match(log.toasts.at(-1)!, /^1 house lot laid for sale \(-\$1,000\)$/);
  // the ghost over it now says it is taken
  tool.move(125, 110); assert.equal(tool.ghost!.bad, true); assert.equal(tool.ghost!.label, 'A lot is there already');
});

test('a drag: the ghost is the row it covers; releasing lays the row and charges once; the tool goes on with the next drag', () => {
  const { tool, e, log } = make();
  tool.arm(true); tool.move(125, 110); tool.down(125, 110); tool.move(155, 110);
  assert.equal(tool.ghost!.frames.length, 4); assert.equal(tool.ghost!.label, '4 house lots · $4,000 to lay');
  tool.up(155, 110);
  assert.equal(e.lots.length, 4); assert.deepEqual(log.charged, [4000]); assert.match(log.toasts.at(-1)!, /^4 house lots laid for sale \(-\$4,000\)$/);
  assert.deepEqual(e.lots.map(l => l.id), [1, 2, 3, 4]);
  // a second drag lays the next row (the lots laid are not laid twice)
  tool.down(165, 110); tool.move(185, 110); tool.up(185, 110);
  assert.equal(e.lots.length, 7); assert.deepEqual(log.charged, [4000, 3000]);
  // on the other side of the street
  tool.down(125, 90); tool.move(135, 90); tool.up(135, 90);
  assert.equal(e.lots.length, 9); assert.ok(e.lots.slice(7).every(l => l.n.y === -1), 'the lots on the far side face away from the street');
});

test('a refusal says why in the ghost and in the toast, lays nothing and charges nothing; the lots that can be laid in a mixed drag are', () => {
  const lines = [{ hole: 3, line: [P(100, 130), P(200, 130)] }]; // 12 tiles behind the lots: in range
  const hit = make({ env: env({ lines }) });
  hit.tool.arm(true); hit.tool.move(125, 110);
  assert.equal(hit.tool.ghost!.bad, true); assert.equal(hit.tool.ghost!.label, "Hole 3's line is 25 m away: golfers there are in range");
  hit.tool.down(125, 110); hit.tool.up(125, 110);
  assert.equal(hit.e.lots.length, 0); assert.deepEqual(hit.log.charged, []); assert.equal(hit.log.laid.length, 0); assert.match(hit.log.toasts.at(-1)!, /golfers there are in range/);
  // a hole's line crossing only the middle of the row: its lots are red, the others green and laid
  const mid = make({ env: env({ lines: [{ hole: 2, line: [P(150, 118), P(150, 140)] }] }) });
  mid.tool.arm(true); mid.tool.move(125, 110); mid.tool.down(125, 110); mid.tool.move(185, 110);
  assert.equal(mid.tool.ghost!.frames.length, 7); assert.ok(mid.tool.ghost!.refused >= 1 && mid.tool.ghost!.ok >= 3);
  assert.match(mid.tool.ghost!.label, /lots · \$\d,000 to lay · \d refused: Hole 2's line is/);
  const green = mid.tool.ghost!.ok;
  mid.tool.up(185, 110);
  assert.equal(mid.e.lots.length, green, 'the lots laid are the green ones'); assert.deepEqual(mid.log.charged, [green * LAY_COST]); assert.match(mid.log.toasts.at(-1)!, /refused: Hole 2's line/);
});

test('too little money: the ghost says so and nothing is laid', () => {
  const { tool, e, log } = make({ money: 2500 });
  tool.arm(true); tool.move(125, 110); tool.down(125, 110); tool.move(155, 110);
  assert.equal(tool.ghost!.bad, true); assert.equal(tool.ghost!.label, 'Not enough money: 4 lots cost $4,000 to lay');
  tool.up(155, 110);
  assert.equal(e.lots.length, 0); assert.deepEqual(log.charged, []); assert.match(log.toasts.at(-1)!, /^Not enough money: 4 lots cost \$4,000 to lay$/);
  // a shorter row the treasury covers
  tool.down(125, 110); tool.move(135, 110); tool.up(135, 110);
  assert.equal(e.lots.length, 2); assert.deepEqual(log.charged, [2000]);
});

test('no street in reach: the ghost and the click say so and the engine is told to offer an estate street', () => {
  const { tool, e, log } = make({ streets: [] });
  tool.arm(true); tool.move(125, 110);
  assert.equal(tool.ghost!.label, NO_STREET); assert.equal(tool.ghost!.bad, true);
  tool.down(125, 110); tool.up(125, 110);
  assert.equal(e.lots.length, 0); assert.deepEqual(log.noStreet, [P(125, 110)]); assert.equal(log.toasts.at(-1), NO_STREET);
  // a street too far from the pointer to pick a lot
  const far = make();
  far.tool.arm(true); far.tool.move(125, 60);
  assert.equal(far.tool.ghost!.label, 'Point at a lot beside a street');
});

test('Esc drops a drag first; the pointer leaving takes the ghost; arming off puts the tool down', () => {
  const { tool, e } = make();
  tool.arm(true); tool.move(125, 110); tool.down(125, 110); tool.move(165, 110);
  assert.equal(tool.cancel(), true, 'a drag was dropped'); assert.equal(tool.dragging, false); assert.equal(e.lots.length, 0);
  assert.equal(tool.cancel(), false, 'nothing in hand: the engine puts the tool down');
  tool.leave(); assert.equal(tool.ghost, null);
  tool.up(165, 110); assert.equal(e.lots.length, 0, 'a release with no press lays nothing');
  tool.arm(false); assert.equal(tool.on, false); tool.move(125, 110); assert.equal(tool.ghost, null, 'a tool that is down shows no ghost');
});

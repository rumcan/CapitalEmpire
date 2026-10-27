// T221 (#610): a range start's town grows with the money the club has made. The room (golf/towngrowth.ts earnedTarget of Budget.earned, the
// tournaments' success a bonus on it) rises with the money made, eased; the books count the club's own income only; the grown town grows
// toward the room at its pace and stops there, starts again when the money comes, and never shrinks for it. On the synthetic range start of
// town-grown.test.ts (a straight county road, the town's seed across it, the parcel on the other side).
// npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { City } from '../src/game/city';
import { CLASS, RoadNetwork, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { MAP } from '../src/game/iso';
import { NEAR } from '../src/game/golf/rangestart';
import { GROWN_EARN_P0 } from '../src/game/event/config';
import { earnedFor, earnedTarget, roomLine } from '../src/game/golf/towngrowth';
import { Budget } from '../src/game/budget';
import type { Town, TownEvent } from '../src/game/lots/town';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const Y = 1000, A: Pt = { x: 0, y: Y }, B: Pt = { x: MAP - 1, y: Y }, J: Pt = { x: 1000, y: Y }, SEED: Pt = { x: 1000, y: Y - 40 };
const PARCEL: [number, number, number, number] = [J.x - 70, Y + NEAR, 300, 450];
const HOUR = 60;
type Inside = { town: Town; budget: Budget };

/** a range start (9 holes: a quick pace) with the books' money made set to earned */
function grownCity(earned: number, kind: 'range' | 'old' = 'range') {
  const city = new City(3);
  city.autoStadium = false;
  city.terrain(new Uint8Array(MAP * MAP), A, 3, [SEED], undefined, true);
  city.setBudget(null, null, true);
  const editor = new NetEditor(new RoadNetwork());
  editor.net.paintData = false;
  editor.addLegs([{ a: A, b: B }], CLASS.road, 0, undefined, true);
  city.netOps(editor.commit(true));
  if (kind === 'range') city.setGolf({ tier: 1, rep: 0, land: [PARCEL], start: 'range', exits: [A, B], holes: 9, townBoost: 1 });
  else city.setGolf({ tier: 1, rep: 0, land: [PARCEL] });
  (city as unknown as Inside).budget.earned = earned;
  return { city, editor };
}
function run(city: City, editor: NetEditor, n: number, events: TownEvent[] = []): TownEvent[] {
  for (let s = 1; s <= n; s++) {
    const r = city.step(10); events.push(...r.events.map(e => ({ ...e })));
    if (r.grow) { editor.addLegs(r.grow, CLASS.gravel, 2, undefined, true); city.netOps(editor.commit()); }
  }
  return events;
}
const builds = (ev: TownEvent[]) => ev.filter(e => e.kind === 'build').length;

test('the room rises with the money made, eased: the first $50k give the most residents a dollar; a good tournament adds room, a poor one takes none', () => {
  assert.equal(earnedTarget(0), GROWN_EARN_P0);
  let last = -1;
  for (let e = 0; e <= 10_000_000; e += 25_000) { const t = earnedTarget(e); assert.ok(t >= last, `room ${t} at $${e} under ${last}`); last = t; }
  const first = earnedTarget(50_000) - earnedTarget(0), next = earnedTarget(100_000) - earnedTarget(50_000), later = earnedTarget(1_050_000) - earnedTarget(1_000_000);
  assert.ok(first > next && next > later, `the residents of $50k: the first ${first}, the next ${next}, at $1M ${later}`);
  assert.equal(earnedTarget(200_000, 0.7), earnedTarget(200_000), 'a poor tournament (success 0.7) keeps the room');
  assert.ok(earnedTarget(200_000, 1.5) > earnedTarget(200_000), 'a good one adds to it');
  for (const pop of [100, 500, 3000]) assert.ok(Math.abs(earnedTarget(earnedFor(pop, 1.2), 1.2) - pop) <= 1, `earnedFor is the inverse at ${pop}`);
  assert.equal(earnedFor(10), 0);
  assert.equal(roomLine(120, 300), 'Grows with your club: 120 residents now, room for 300 with your earnings');
});

test("the money made counts the club's income only: not the town's taxes, sales and fees, nor grants; spending never lowers it; it is saved", () => {
  const b = new Budget();
  b.bizIncome(1000); b.toll(200); b.parking(100); b.payout(50); b.payout(-500); b.bizIncome(-300);
  b.sale(4000); b.fee(800); b.grant(10000); b.spend('construction', 5000);
  b.endDay(1, { lots: [{ use: 1, level: 2, decline: 0, cls: 'street', access: 1 }], segs: [], nodes: [], trade: { punctual: 0 } } as never);
  assert.equal(b.earned, 1350);
  const u = new Budget(); u.unlimited = true; u.spend('construction', 1e6); u.bizIncome(10); assert.equal(u.earned, 10, "the sandbox's money is not money made");
  const r = Budget.from(b.toJSON()); assert.equal(r.earned, 1350); assert.equal(r.earnedUnknown, false);
  const old = { ...b.toJSON() }; delete old.earned;
  assert.equal(Budget.from(old).earnedUnknown, true, 'a save from before T221 is marked for seeding');
});

test('with no money made the grown town stops at its floor and starts nothing more; money made starts it again, and it never shrinks', () => {
  const { city, editor } = grownCity(0), I = city as unknown as Inside;
  run(city, editor, 24 * HOUR);
  const room0 = city.townRoom()!;
  assert.equal(room0, GROWN_EARN_P0);
  assert.ok(I.town.pop + I.town.pending <= room0 + 3, `residents ${I.town.pop} + ${I.town.pending} coming, room ${room0}`);
  const pop0 = I.town.pop, still = builds(run(city, editor, 12 * HOUR));
  assert.equal(still, 0, 'no lot starts while the earnings stall');
  assert.ok(I.town.pop >= pop0, 'the town never shrinks for it');
  I.budget.bizIncome(100_000);
  const again = builds(run(city, editor, 12 * HOUR));
  assert.ok(again > 0 && city.townRoom()! > room0, `${again} lots start once the club makes $100k (room ${city.townRoom()})`);
});

test('growth is monotone in the money made: more earnings, at least as many residents, up to the pace', () => {
  const pops = [0, 20_000, 60_000, 1e9].map(e => { const { city, editor } = grownCity(e); run(city, editor, 36 * HOUR); return (city as unknown as Inside).town.pop; });
  for (let i = 1; i < pops.length; i++) assert.ok(pops[i]! >= pops[i - 1]!, `residents by money made: ${pops.join(', ')}`);
  assert.ok(pops[3]! > pops[0]! * 2, `the pace, unlimited, far above the floor: ${pops.join(', ')}`);
});

test('an old save (no money made kept) starts from what its town stands for; other games have no room', () => {
  const { city, editor } = grownCity(1e9), I = city as unknown as Inside;
  run(city, editor, 36 * HOUR);
  const pop = I.town.pop, save = I.budget.toJSON(); delete save.earned;
  city.setBudget(save, null, true);
  assert.ok(city.townRoom()! >= pop, `room ${city.townRoom()} for an old town of ${pop}`);
  assert.equal(grownCity(0, 'old').city.townRoom(), null);
});

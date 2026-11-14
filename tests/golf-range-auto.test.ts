// The range's staff and machines (T386 part 2, #1043: golf/rangeauto.ts as pure data, and RangeSim/RangeHost with a ball book): the trip model, the attendants' shifts, the robots, the
// washer and dirty balls, the nets, the bucket counter, and the flow panel's bottleneck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRTY_VALUE, HAND, fieldCount, newBalls, perHour, pickKit, pickNear, poolOf, skipBalls, stockOf, visitBalls, type BallSave } from '../src/game/golf/rangeballs';
import {
  ATTENDANT_SKILL, BUCKET_CUT, COUNTER_SHARE, HAND_WASH, NET_SHARE, PLAYER_CART, PLAYER_RUN, ROBOTS_A_NODE, ROBOT_BAT, ROBOT_BPS, ROBOT_CHARGE, ROBOT_HOURS, ROBOT_SPEED, SHIFT_HOURS, SHIFT_STARTS, WASHER_BPS,
  attendantBps, autoKit, bucketBalls, bucketValue, flowOf, onShift, robotBps, sellBps, staffBps, tripBps, washBps,
} from '../src/game/golf/rangeauto';
import { AGENT_PICK_S, AGENT_SPEED, RANGE_UPGRADES, RangeSim, defaultRangeBiz, rangeScene, upgradeWhy, walkAgent, withUpgrade, type AgentWalk, type CarSlot, type RangeUpgradeId } from '../src/game/golf/rangebiz';
import { RangeHost, type RangeHostCtx } from '../src/game/golf/rangehost';
import { YOU_RUN } from '../src/game/golf/you';
import { CART_TILES } from '../src/game/golf/play/yours';
import type { Rect } from '../src/game/golf/mode';

const kit = (...ids: string[]) => pickKit(ids);

test('the player model matches the game: the run and the cart are the ones you walk and drive at', () => {
  assert.equal(PLAYER_RUN, YOU_RUN); assert.equal(PLAYER_CART, CART_TILES);
});

test('the trip model: each tool brings in more than the last; the cart most; the attendant, on foot, a share of what you bring', () => {
  const t = (...ids: string[]) => tripBps(kit(...ids), { run: PLAYER_RUN, cart: PLAYER_CART });
  const hand = t(), tube = t('tube'), both = t('tube', 'basket'), push = t('tube', 'pushpick'), cart = t('tube', 'pushpick', 'picker'), gang = t('tube', 'pushpick', 'picker', 'gang');
  assert.ok(hand > 0.3 && hand < 0.6, `by hand about half a ball a second (${hand.toFixed(2)})`);
  assert.ok(hand < tube && tube < both && both < push && push < cart && cart < gang, 'each tool is worth having');
  assert.ok(cart > 4 * push, 'the cart is the big step');
  assert.equal(attendantBps(kit('tube', 'pushpick', 'picker')), attendantBps(kit('tube', 'pushpick')), 'the attendant never drives the cart');
  assert.ok(Math.abs(attendantBps(kit('tube', 'pushpick')) - ATTENDANT_SKILL * tripBps(kit('tube', 'pushpick'), { run: 1.5 })) < 1e-9);
  assert.ok(attendantBps(kit()) < t(), 'a slower pace and the skill: less than you');
});

test('the attendants: a shift of eight town hours you set, the second takes the next eight, the counter takes a share of it unless a dispenser stands', () => {
  const k = kit('tube', 'pushpick'), one = autoKit(['attendant']), two = autoKit(['attendant', 'attendant2']), disp = autoKit(['attendant', 'dispenser']);
  assert.deepEqual(SHIFT_STARTS, [7, 11, 15]);
  assert.ok(onShift(0, 7, 7) && onShift(0, 14.9, 7) && !onShift(0, 15, 7) && !onShift(0, 6.9, 7), 'the first works 07:00 to 15:00');
  assert.ok(onShift(1, 15, 7) && onShift(1, 22.9, 7) && !onShift(1, 23, 7), 'the second 15:00 to 23:00');
  assert.ok(onShift(0, 22.9, 15) && !onShift(0, 23, 15) && onShift(1, 23, 15) && onShift(1, 2, 15) && onShift(1, 6.9, 15) && !onShift(1, 7, 15), 'a shift may run past midnight (15:00 to 23:00, then 23:00 to 07:00)');
  let hours = 0; for (let h = 0; h < 24; h += 0.5) if (onShift(0, h, 7)) hours += 0.5; assert.equal(hours, SHIFT_HOURS);
  const a = staffBps(one, k, 9, 7), b = staffBps(one, k, 20, 7); assert.ok(a > 0 && b === 0, 'on his shift he picks, off it he does not');
  assert.ok(Math.abs(a - attendantBps(k) * (1 - COUNTER_SHARE)) < 1e-9, 'with the counter to tend');
  assert.ok(Math.abs(staffBps(disp, k, 9, 7) - attendantBps(k)) < 1e-9, 'with a dispenser he picks all his shift');
  assert.ok(Math.abs(staffBps(two, k, 9, 7) - a) < 1e-9 && Math.abs(staffBps(two, k, 20, 7) - a) < 1e-9, 'the second covers the evening');
  assert.equal(staffBps(autoKit([]), k, 9, 7), 0);
});

test('the robots: a node gives ROBOTS_A_NODE of them, each runs three hours of four, a bigger battery runs longer, a faster motor picks faster', () => {
  assert.equal(autoKit([]).robots, 0); assert.equal(autoKit(['robot']).robots, ROBOTS_A_NODE); assert.equal(autoKit(['robot', 'robot2', 'robot3']).robots, 3 * ROBOTS_A_NODE);
  const duty = ROBOT_HOURS / (ROBOT_HOURS + ROBOT_CHARGE);
  assert.ok(Math.abs(robotBps(autoKit(['robot'])) - ROBOTS_A_NODE * ROBOT_BPS * duty) < 1e-9);
  const bat = robotBps(autoKit(['robot', 'robotbat'])), spd = robotBps(autoKit(['robot', 'robotspd'])), base = robotBps(autoKit(['robot']));
  assert.ok(Math.abs(bat - ROBOTS_A_NODE * ROBOT_BPS * (ROBOT_HOURS * ROBOT_BAT) / (ROBOT_HOURS * ROBOT_BAT + ROBOT_CHARGE)) < 1e-9 && bat > base);
  assert.ok(Math.abs(spd - base * ROBOT_SPEED) < 1e-9); assert.equal(robotBps(autoKit([])), 0);
});

test('washing, buckets and the nets: the tap washes a little, the washer a lot; a dirty bucket earns less; the counter cuts the scoop', () => {
  assert.equal(washBps(autoKit([])), HAND_WASH); assert.equal(washBps(autoKit(['washer'])), HAND_WASH + WASHER_BPS);
  assert.equal(bucketValue(40, 0), 1); assert.equal(bucketValue(0, 40), DIRTY_VALUE); assert.ok(Math.abs(bucketValue(20, 20) - (1 + DIRTY_VALUE) / 2) < 1e-9); assert.equal(bucketValue(0, 0), 1);
  assert.equal(bucketBalls(40, autoKit([])), 40); assert.equal(bucketBalls(40, autoKit(['counter'])), Math.round(40 * BUCKET_CUT)); assert.ok(bucketBalls(8, autoKit(['counter'])) >= 8);
  const a = autoKit(['dispenser', 'nets', 'counter', 'washer']); assert.ok(a.dispenser && a.nets && a.counter && a.washer); const z = autoKit([]); assert.ok(!z.dispenser && !z.nets && !z.counter && !z.washer);
  assert.ok(NET_SHARE > 0 && NET_SHARE < 1);
});

test('the flow panel: the stage that can take the fewest balls an hour is the bottleneck; the start is picking, then washing once the cart picks, then the bays', () => {
  const day = 600, sell = sellBps(4, 40, 1, day);
  const at = (pick: number, wash: number, s = sell) => flowOf({ outfield: 900, dirty: 30, clean: 12, pickBps: pick, washBps: wash, sellBps: s, doing: { pick: 5, wash: 5, sell: 5 }, dayLen: day });
  const start = at(tripBps(kit(), { run: PLAYER_RUN }), HAND_WASH); assert.equal(start.bottleneck, 'pick'); assert.equal(start.sustains, start.stages[0]!.perHour);
  const cart = at(tripBps(kit('tube', 'pushpick', 'picker'), { run: PLAYER_RUN, cart: PLAYER_CART }), HAND_WASH); assert.equal(cart.bottleneck, 'wash', 'the cart brings in more than the tap washes');
  const washed = at(tripBps(kit('tube', 'pushpick', 'picker'), { run: PLAYER_RUN, cart: PLAYER_CART }), HAND_WASH + WASHER_BPS); assert.equal(washed.bottleneck, 'sell', 'then the four bays are what the loop can keep up with');
  assert.equal(washed.stages[2]!.perHour, Math.round(perHour(sell, day))); assert.equal(sellBps(8, 40, 1, day), 2 * sell);
  assert.deepEqual(washed.stages.map(s => s.id), ['pick', 'wash', 'sell']); assert.equal(washed.outfield, 900); assert.equal(washed.dirty, 30); assert.equal(washed.clean, 12);
});

test('the staff and machines are range upgrades bought with the till, each needing the one before it', () => {
  const by = new Map(RANGE_UPGRADES.map(u => [u.id, u])), ids: RangeUpgradeId[] = ['attendant', 'attendant2', 'washer', 'robot', 'robot2', 'robot3', 'robotbat', 'robotspd', 'nets', 'counter'];
  for (const id of ids) { const u = by.get(id)!; assert.ok(u && u.till && (u.branch === 'staff' || u.branch === 'machines') && u.cost > 0 && u.upkeep > 0, id); }
  const s = defaultRangeBiz(); s.balls!.till = 1e6;
  assert.equal(upgradeWhy(s, 'attendant', 1e9), 'Build Push picker first'); assert.equal(upgradeWhy(s, 'washer', 1e9), 'Build Push picker first'); assert.equal(upgradeWhy(s, 'robot', 1e9), 'Build Ball washer first');
  assert.equal(upgradeWhy(s, 'nets', 1e9), 'Build Target greens first'); assert.equal(upgradeWhy(s, 'robot2', 1e9), 'Build Robot pickers first'); assert.equal(upgradeWhy(s, 'attendant2', 1e9), 'Build Range attendant first');
  const t = ['tube', 'pushpick', 'washer', 'robot', 'greens'].reduce((q, id) => withUpgrade(q, id as RangeUpgradeId), s);
  for (const id of ['attendant', 'robot2', 'robotbat', 'robotspd', 'nets', 'counter'] as const) assert.equal(upgradeWhy(t, id, 1e9), '', id);
  assert.match(by.get('dispenser')!.effect, /no attendant/);
});

test('pickNear takes the nearest balls wherever they lie, in one pass: cheap with a full outfield', () => {
  const b = newBalls(); b.field.push(10, 0, 1, 0, 5, 0, 2, 0, 100, 0, 3, 0); // (x y pairs: the distances to the origin are 10, 1, 5, 2, 100, 3)
  assert.equal(pickNear(b, 0, 0, 3), 3); assert.deepEqual(b.field.filter((_, i) => i % 2 === 0).sort((p, q) => p - q), [5, 10, 100], 'the three nearest (1, 2 and 3) are gone');
  assert.equal(pickNear(b, 0, 0, 10), 3, 'no more than there are'); assert.equal(b.field.length, 0); assert.equal(pickNear(b, 0, 0, 5), 0); assert.equal(pickNear(b, 0, 0, 0), 0);
  const big = newBalls(); for (let i = 0; i < 8000; i++) big.field.push(245 + (i % 80) * 0.5, 215 + Math.floor(i / 80) * 0.5);
  const t0 = performance.now(); for (let i = 0; i < 200; i++) pickNear(big, 200, 200, 3); const ms = (performance.now() - t0) / 200;
  assert.equal(fieldCount(big), 8000 - 600); assert.ok(ms < 1, `a pick near costs ${ms.toFixed(3)} ms with 8,000 balls out`);
});

// ---------------------------------------------------------------- the sim and the host

const plot: Rect = [200, 200, 70, 150];
const lot = (sc: ReturnType<typeof rangeScene>, n = 20): CarSlot[] => Array.from({ length: n }, (_, i) => ({ x: sc.carEdge.x + sc.roadDir.x * (1 + i * 1.5), y: sc.carEdge.y + sc.roadDir.y * (1 + i * 1.5), hx: sc.rangeSide.x, hy: sc.rangeSide.y }));
const busy = { tier: 5, exits: 2, residents: 20000 };
/** the sim for `seconds` from town hour h0 (steps of half a second), a book attached; golfers come as the demand says */
function run(owned: RangeUpgradeId[], book: BallSave, seconds: number, h0 = 7.2, sim?: RangeSim, s0?: ReturnType<typeof defaultRangeBiz>) {
  const s = s0 ?? owned.reduce((q, id) => withUpgrade(q, id), defaultRangeBiz()); s.balls = book;
  const sc = rangeScene(plot, 2, s), r = sim ?? new RangeSim(11, 10); if (!sim) { r.setScene(sc, lot(sc), sc.carEdge); r.setBalls(book); }
  let booked = 0;
  for (let t = 0; t < seconds; t += 0.5) booked += r.step(0.5, { hour: h0 + t / 25, day: 1 }, s, busy, 600);
  return { r, s, sc, booked };
}
const field = (b: BallSave, n: number, x = 245, y = 215) => { for (let i = 0; i < n; i++) b.field.push(x + (i % 20) * 0.3, y + Math.floor(i / 20) * 0.3); };

test('dirty balls: picked balls are dirty, the tap washes them, the washer washes faster; a bucket of dirty balls earns three quarters', () => {
  const tap = newBalls(); tap.clean = 0; tap.dirty = 600; const a = run([], tap, 100, 1); // (closed: nobody buys; 100 s of the tap)
  assert.ok(Math.abs(tap.day.washed - HAND_WASH * 100) <= 2, `the tap washed ${tap.day.washed}`); assert.equal(tap.clean + tap.dirty, 600); assert.ok(a.r.today.golfers === 0);
  const wm = newBalls(); wm.clean = 0; wm.dirty = 2000; run(['tube', 'pushpick', 'washer'], wm, 100, 1); assert.ok(wm.day.washed > 10 * HAND_WASH * 100 / 2, `the washer washed ${wm.day.washed}`); assert.ok(wm.day.washed <= (HAND_WASH + WASHER_BPS) * 100 + 2);
  // the same visits, clean balls and dirty balls: the dirty start earns less (the clean balls sell first, and the tap washes only so fast), but never less than DIRTY_VALUE of it
  const c = newBalls(); c.clean = 6 * visitBalls(600); c.dirty = 0; const d = newBalls(); d.clean = 0; d.dirty = 6 * visitBalls(600);
  const rc = run([], c, 285), rd = run([], d, 285), ratio = rd.booked / rc.booked;
  assert.equal(c.total.sold, 6 * visitBalls(600)); assert.equal(d.total.sold, 6 * visitBalls(600), 'the dirty balls sell too');
  assert.ok(ratio < 0.97 && ratio > DIRTY_VALUE - 0.02, `less than clean, more than three quarters (${ratio.toFixed(3)})`);
  assert.equal(poolOf(c), 6 * visitBalls(600)); assert.equal(poolOf(d), 6 * visitBalls(600));
  // a skip with no washing: every ball is dirty, a bucket earns exactly DIRTY_VALUE of a clean one's price; clean balls earn the full price
  const z = newBalls(); z.clean = 0; z.dirty = 400; const at = () => ({ x: 245, y: 215 }), o = skipBalls(z, 5, 40, 600, 600, 0, 0, false, at, () => 0.5, null);
  assert.equal(o.served, 5); assert.ok(Math.abs(o.value - DIRTY_VALUE) < 1e-9, `three quarters (${o.value})`);
  const y = newBalls(); y.clean = 400; assert.equal(skipBalls(y, 5, 40, 600, 600, 0, 0, false, at, () => 0.5, null).value, 1);
});

test('the attendants pick on their shift only, with your tools, the nearest piles to the ball room first; the balls come in dirty', () => {
  const b = newBalls(); b.shift = 7; field(b, 400); field(b, 400, 262, 290); const owned: RangeUpgradeId[] = ['tube', 'pushpick', 'attendant'];
  const o = run(owned, b, 120, 9); // 09:00 on: on shift
  const got = b.total.picked.staff; assert.ok(got > 20 && got <= 800, `the attendant picked ${got}`); assert.equal(b.total.picked.robot, 0);
  const near = (x: number, y: number) => Math.hypot(x - o.sc.ballRoom.x, y - o.sc.ballRoom.y);
  const far = b.field.filter((_, i) => i % 2 === 0).reduce((n, x, k) => n + (near(x, b.field[2 * k + 1]!) > 60 ? 1 : 0), 0); assert.ok(far >= 390, 'the far pile is left alone while the near one is picked');
  const off = newBalls(); off.shift = 7; field(off, 400); run(owned, off, 120, 20); assert.equal(off.total.picked.staff, 0, 'off his shift nobody picks');
  const shifted = newBalls(); shifted.shift = 15; field(shifted, 400); run(owned, shifted, 120, 9); assert.equal(shifted.total.picked.staff, 0, 'the shift you set: 15:00 to 23:00');
  assert.equal(poolOf(b), 400 + 400 + 200, 'the pool is the start\'s (200) and the balls laid');
});

test('the robots pick all day on their battery, the nets catch a share of the balls that land by a target green, the counter fills a bucket with fewer balls', () => {
  const r = newBalls(); field(r, 600); run(['tube', 'pushpick', 'washer', 'robot'], r, 200, 20); const per = r.total.picked.robot / 200;
  assert.ok(per > 0.5 * ROBOTS_A_NODE * ROBOT_BPS * ROBOT_HOURS / (ROBOT_HOURS + ROBOT_CHARGE) && per <= ROBOTS_A_NODE * ROBOT_BPS, `${per.toFixed(2)} balls a second`);
  // the nets: balls that land at a target are caught with NET_SHARE; with none built (or none owned) none are
  const without = newBalls(); without.clean = 20 * visitBalls(600); const sc0 = run(['greens'], without, 288);
  const nets = newBalls(); nets.clean = 20 * visitBalls(600); run(['greens', 'tube', 'pushpick', 'washer', 'nets'], nets, 288);
  assert.equal(without.total.picked.net, 0); assert.ok(nets.total.picked.net > 0, `the nets caught ${nets.total.picked.net}`);
  assert.ok(nets.total.picked.net < nets.total.hit * NET_SHARE * 1.1, 'no more than their share of the balls hit'); assert.ok(fieldCount(nets) < fieldCount(without), 'fewer balls to pick up'); assert.ok(sc0.sc.targets.length === 3);
  // the counter: each bucket holds BUCKET_CUT of the balls
  const c = newBalls(); c.clean = 6 * visitBalls(600); run(['tube', 'pushpick', 'washer', 'counter'], c, 288);
  assert.equal(c.total.sold % Math.round(visitBalls(600) * BUCKET_CUT), 0, 'sold in the counter\'s buckets'); assert.ok(c.total.sold > 6 * visitBalls(600) * 0.99 - 2 * visitBalls(600), 'and the same balls sell more buckets');
  assert.ok(c.total.sold / Math.round(visitBalls(600) * BUCKET_CUT) >= 6, 'more than six buckets from six buckets\' balls');
});

test('a skip: the staff, the robots and the washer keep the balls coming; the dirty balls earn their price', () => {
  const none = newBalls(); none.clean = 8 * visitBalls(600); const a = run(['bays8'], none, 1); a.r.step(1000, { hour: 7, day: 1 }, a.s, busy, 600);
  const rich = newBalls(); rich.clean = 8 * visitBalls(600); const owned: RangeUpgradeId[] = ['bays8', 'tube', 'pushpick', 'washer', 'robot', 'robot2', 'attendant'];
  const b = run(owned, rich, 1); b.r.step(1000, { hour: 7, day: 1 }, b.s, busy, 600);
  assert.ok(rich.total.sold > none.total.sold, `with robots and an attendant the shop sells more in a skip (${rich.total.sold} against ${none.total.sold})`);
  assert.ok(Math.abs(poolOf(rich) - 8 * visitBalls(600)) <= 2 && Math.abs(poolOf(none) - 8 * visitBalls(600)) <= 2, 'the pool is kept');
});

function makeHost(owned: RangeUpgradeId[] = [], till = 0) {
  const biz = owned.reduce((q, id) => withUpgrade(q, id), defaultRangeBiz()); biz.balls!.till = till; let hour = 9; const log = { saved: 0 };
  const sc0 = rangeScene(plot, 2, biz), ctx: RangeHostCtx = {
    biz: () => biz, plot: () => ({ rect: plot, facing: 2 }), carPark: () => ({ bays: lot(sc0), entrance: sc0.carEdge, key: 'lot' }), addPiece: () => null, removeProp: () => {}, setGround: () => {}, layPaths: () => {}, clearTrees: () => {},
    money: () => 1e6, spend: () => {}, book: () => {}, demand: () => busy, dayLen: () => 600, simT: () => 0, clock: () => ({ hour, day: 1 }), save: () => { log.saved++; }, toast: () => {}, emit: () => {}, grid: () => null, layTee: () => false,
  };
  const h = new RangeHost(ctx, 3); h.sync(); h.step();
  return { h, biz, bs: biz.balls!, log, at: (x: number) => { hour = x; } };
}

test('the host: the flow panel reads the stages and the bottleneck; the shift is set from the card; the attendants and the robots are agents on the map', () => {
  const m = makeHost(['tube', 'pushpick', 'attendant', 'washer', 'robot'], 1e6); field(m.bs, 200);
  const v = m.h.view()!.balls!; assert.ok(v.flow && v.flow.stages.length === 3 && ['pick', 'wash', 'sell'].includes(v.flow.bottleneck)); assert.equal(v.flow.outfield, 200);
  assert.deepEqual([v.staff.attendants, v.staff.shift, v.staff.hours, v.staff.onNow], [1, 7, SHIFT_HOURS, 1], 'one attendant, on shift at 09:00');
  m.at(20); assert.equal(m.h.view()!.balls!.staff.onNow, 0, 'off at 20:00');
  m.h.setShift(15); assert.equal(m.bs.shift, 15); assert.ok(m.log.saved > 0); m.h.setShift(9); assert.equal(m.bs.shift, 15, 'only the shifts the card offers');
  // the agents: a stand-in for each attendant on shift and each robot (two to a node), walking between the ball room and the pile
  const b = makeHost(['tube', 'pushpick', 'attendant', 'washer', 'robot'], 0); field(b.bs, 300, 245, 230);
  for (let i = 0; i < 4; i++) b.h.step(); b.h.sim.step(1, { hour: 9, day: 1 }, b.biz, busy, 600); const d = b.h.sim.view();
  assert.equal(d.nAgents, 1 + ROBOTS_A_NODE, 'an attendant and two robots'); assert.deepEqual(d.agents.slice(0, d.nAgents).map(g => g.kind).sort(), ['attendant', 'robot', 'robot']);
  for (let i = 0; i < d.nAgents; i++) assert.ok(Number.isFinite(d.agents[i]!.x) && Number.isFinite(d.agents[i]!.y));
  const plain = makeHost([], 0); plain.h.sim.step(1, { hour: 9, day: 1 }, plain.biz, busy, 600); assert.equal(plain.h.sim.view().nAgents, 0, 'nobody without staff or robots');
  const dirt = makeHost([], 0); dirt.bs.clean = 0; dirt.bs.dirty = 200; assert.equal(dirt.h.view()!.balls!.out, false, 'dirty balls sell: the ball room is not out'); dirt.bs.dirty = 10; assert.equal(dirt.h.view()!.balls!.out, true, 'less than a bucket of both: out');
  assert.ok(HAND.rate > 0 && stockOf(newBalls()) === 200);
});

test('T459 (the owner: "walks to pick up balls and teleports all over"): the attendant and the robots walk their rounds, never faster than a walker, while the pile they pick moves', () => {
  // the range as it runs: an attendant and two robots picking a spread-out field (the pile, the ball nearest the room, moves as they pick), stepped
  // a frame at a time (1x and 20x: 1/60 s and 1/3 s of sim time a frame); every agent's move a frame is at most its walking speed times the frame
  for (const dt of [1 / 60, 1 / 3]) {
    const m = makeHost(['tube', 'pushpick', 'attendant', 'washer', 'robot'], 0);
    for (let k = 0; k < 6; k++) field(m.bs, 60, 230 + k * 9, 200 + (k % 3) * 12);
    for (let i = 0; i < 4; i++) m.h.step();
    const last: ({ x: number; y: number } | undefined)[] = [];
    let worst = 0, moved = 0, picks = 0;
    const frames = Math.round(240 / dt);
    for (let f = 0; f < frames; f++) {
      m.h.sim.step(dt, { hour: 9 + f * dt / 3600, day: 1 }, m.biz, busy, 600);
      const d = m.h.sim.view();
      for (let i = 0; i < d.nAgents; i++) {
        const g = d.agents[i]!, p = last[i], v = AGENT_SPEED[g.kind];
        if (p) { const s = Math.hypot(g.x - p.x, g.y - p.y); worst = Math.max(worst, s / (v * dt)); moved += s; assert.ok(s <= v * dt + 1e-6, `${g.kind} ${i} moved ${s.toFixed(3)} tiles in a ${dt.toFixed(3)} s frame (at most ${(v * dt).toFixed(3)})`); }
        last[i] = { x: g.x, y: g.y }; if (g.pick) picks++;
      }
    }
    assert.ok(moved > 20, `they walked (${moved.toFixed(1)} tiles)`); assert.ok(picks > 0, 'and the attendant picked at the pile');
    assert.ok(worst <= 1 + 1e-6, `the fastest frame ${worst.toFixed(3)} of a walker's pace`);
  }
});

test('T459: walkAgent: out to the pile, picks, back to the room, drops, out again; a pile that jumps is walked to; no step faster than its speed', () => {
  const room = { x: 0, y: 0 }, a: AgentWalk = { x: 0, y: 0, leg: 'out', left: 0, ang: 0 }, legs = new Set<string>();
  let pile: { x: number; y: number } | null = { x: 20, y: 0 };
  for (let f = 0; f < 4000; f++) {
    if (f === 300) pile = { x: -15, y: 25 };      // the pile jumps (the nearest ball picked up): he turns and walks to it
    if (f === 900) pile = null;                    // the field is clear: home
    if (f === 1500) pile = { x: 8, y: -8 };
    const x0 = a.x, y0 = a.y, dt = f % 7 === 0 ? 0.5 : 0.05;
    walkAgent(a, room, pile, dt, 1.4);
    assert.ok(Math.hypot(a.x - x0, a.y - y0) <= 1.4 * dt + 1e-9, `frame ${f}: a jump`);
    legs.add(a.leg);
  }
  assert.deepEqual([...legs].sort(), ['back', 'drop', 'out', 'pick']);
  // a pick lasts AGENT_PICK_S; nonsense times move nobody
  const b: AgentWalk = { x: 5, y: 5, leg: 'pick', left: AGENT_PICK_S, ang: 0 };
  walkAgent(b, room, { x: 5, y: 5 }, AGENT_PICK_S - 0.1, 1.4); assert.equal(b.leg, 'pick');
  walkAgent(b, room, { x: 5, y: 5 }, 0.2, 1.4); assert.equal(b.leg, 'back');
  const c: AgentWalk = { x: 1, y: 1, leg: 'out', left: 0, ang: 0 };
  for (const bad of [NaN, -5, Infinity]) { walkAgent(c, room, { x: 9, y: 9 }, bad, 1.4); assert.ok(Number.isFinite(c.x) && Math.hypot(c.x - 1, c.y - 1) <= 1e-9, `dt ${bad}`); }
});

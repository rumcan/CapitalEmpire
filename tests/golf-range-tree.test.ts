// The ball room's upgrade tree as a whole (T386 part 3, #1043): 25 to 40 nodes in five branches, all bought with the range's till, each with a price, a prerequisite chain that can be bought in the
// order it is listed, a name and an effect; the rest of the nodes: the supply (the trade price, the pallets, the standing order, the stamped balls), the picking and staff nodes (the bigger hopper,
// training, the night attendant, the staff cart), the machines (the polisher, the fast chargers) and the golf side (the range's gear for your practice).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALL_COST, BULK_PRICE, CASES_A_DAY, CASES_PALLET, CASE_BALLS, HOPPER_BIG, STAMP_KEEP, STANDING_LOW, caseCost, newBalls, orderBalls, overnight, perHour, pickKit, skipBalls, supplyKit, visitBalls } from '../src/game/golf/rangeballs';
import {
  ATTENDANT_CART, ATTENDANT_SKILL, ATTENDANT_TRAINED, COUNTER_SHARE, POLISH_VALUE, ROBOTS_A_NODE, ROBOT_BPS, ROBOT_CHARGE, ROBOT_CHARGE_FAST, ROBOT_HOURS, SHIFT_HOURS, WASHER_BPS, attendantBps, autoKit, bucketValue, nodeRates, onShift, robotBps, staffBps,
} from '../src/game/golf/rangeauto';
import { BRANCH_NAME, RANGE_UPGRADES, defaultRangeBiz, needsOf, rangeUpkeep, upgradeWhy, withUpgrade, type RangeUpgradeId, type TreeBranch } from '../src/game/golf/rangesave';
import { RangeHost, type RangeHostCtx } from '../src/game/golf/rangehost';
import { rangeScene, type CarSlot } from '../src/game/golf/rangebiz';
import { FATIGUE, NO_GEAR, PRACTICE, gainOf, practicePreview, practise, startProfile, type SkillId } from '../src/game/golf/player';
import { FANS_FATIGUE, LMON_SWING, PUTTLAB_GAIN, RADAR_ACCURACY, VIDEO_GAIN, WEIGHTED_POWER, practiceGear } from '../src/game/golf/rangegear';
import type { Rect } from '../src/game/golf/mode';

const TREE = RANGE_UPGRADES.filter(u => u.branch), BRANCHES: TreeBranch[] = ['picking', 'staff', 'machines', 'supply', 'golf'];
const kit = (...ids: string[]) => pickKit(ids);

test('the tree: 25 to 40 nodes in five branches, every one bought with the till, with a price, an upkeep, a name and an effect; each prerequisite is listed before it', () => {
  assert.ok(TREE.length >= 25 && TREE.length <= 40, `${TREE.length} nodes`);
  for (const b of BRANCHES) { assert.ok(BRANCH_NAME[b]); assert.ok(TREE.filter(u => u.branch === b).length >= 4, `${b}: at least four nodes`); }
  assert.deepEqual([...new Set(TREE.map(u => u.branch))].sort(), [...BRANCHES].sort());
  const ids = RANGE_UPGRADES.map(u => u.id), names = new Set<string>();
  for (const u of TREE) {
    assert.equal(u.till, true, `${u.id} is bought with the till`); assert.ok(u.cost > 0 && u.upkeep > 0, u.id); assert.ok(u.effect.length >= 25, `${u.id}: an effect that says what it does`);
    assert.ok(!names.has(u.name), `${u.id}: a name of its own (${u.name})`); names.add(u.name);
    for (const n of needsOf(u)) assert.ok(ids.indexOf(n) >= 0 && ids.indexOf(n) < ids.indexOf(u.id), `${u.id} needs ${n}, listed before it`);
  }
  assert.equal(new Set(ids).size, ids.length, 'no id twice');
});

test('every node can be bought: in the order listed, with the till full, each one is ready when its turn comes (and not before its prerequisites)', () => {
  let s = withUpgrade(defaultRangeBiz(), 'greens'); s.balls!.till = 1e7; let total = 0, upkeep = 0;
  for (const u of TREE) {
    for (const n of needsOf(u)) if (!s.owned.includes(n)) assert.match(upgradeWhy(s, u.id, 1e9), /first$/, `${u.id} waits for ${n}`);
    for (const n of needsOf(u)) if (!s.owned.includes(n)) s = withUpgrade(s, n);
    assert.equal(upgradeWhy(s, u.id, 1e9), '', u.id); s = withUpgrade(s, u.id); total += u.cost; upkeep += u.upkeep;
  }
  assert.ok(total > 100000 && total < 400000, `the whole tree costs $${total.toLocaleString()}`);
  assert.equal(TREE.every(u => s.owned.includes(u.id)), true);
  if (process.env.PACING) console.log('tree', TREE.length, 'nodes, $' + total.toLocaleString(), 'upkeep a month $' + upkeep.toLocaleString(), TREE.map(u => `${u.id} $${u.cost}`).join(', '));
  assert.ok(rangeUpkeep(s) >= upkeep, 'the upkeep is charged');
});

test('supply: the trade price, the pallets, the stamped balls and the bigger hopper', () => {
  assert.deepEqual(supplyKit([]), { ball: BALL_COST, perDay: CASES_A_DAY, caseBalls: CASE_BALLS });
  const bulk = supplyKit(['bulk']), pal = supplyKit(['bulk', 'pallet']);
  assert.ok(Math.abs(bulk.ball - BALL_COST * BULK_PRICE) < 1e-9 && bulk.perDay === CASES_A_DAY && caseCost(bulk) < caseCost(supplyKit([])), 'a cheaper ball'); assert.equal(pal.perDay, CASES_PALLET);
  assert.equal(caseCost(supplyKit([])), Math.round(CASE_BALLS * BALL_COST)); assert.equal(caseCost(bulk), 867);
  const b = newBalls(), o = orderBalls(b, 10, 0, 1e6, pal); assert.equal(o.cases, CASES_PALLET); assert.equal(o.cost, Math.round(CASES_PALLET * CASE_BALLS * BALL_COST * BULK_PRICE)); assert.equal(b.day.bought, CASES_PALLET * CASE_BALLS);
  assert.equal(orderBalls(newBalls(), 10, 0, 1e6).cases, CASES_A_DAY, 'three a day without the pallets'); assert.equal(orderBalls(newBalls(), 10, CASES_A_DAY, 1e6).cases, 0);
  assert.equal(orderBalls(newBalls(), 10, 0, caseCost(bulk) * 2 + 5, bulk).cases, 2, 'the till pays at the trade price');
  // stamped balls: the overnight loss is halved
  const lost = (keep: number) => { const f = newBalls(); for (let i = 0; i < 1000; i++) f.field.push(240 + (i % 40) * 0.3, 210 + Math.floor(i / 40) * 0.3); f.clean = 0; return overnight(f, 1, () => 0, keep); };
  assert.equal(lost(1), Math.floor(1000 * 0.02)); assert.equal(lost(STAMP_KEEP), Math.floor(1000 * 0.02 * STAMP_KEEP)); assert.ok(lost(STAMP_KEEP) < lost(1));
  // the bigger hopper: 60% more of a load, on the cart and on the gang picker
  assert.equal(kit('picker').hopper, 450); assert.equal(kit('picker', 'hopper2').hopper, Math.round(450 * HOPPER_BIG)); assert.equal(kit('picker', 'gang', 'hopper2').hopper, Math.round(900 * HOPPER_BIG)); assert.equal(kit('hopper2').hopper, 0, 'no cart, no hopper');
});

test('staff and machines: training, the night attendant, the staff cart, the polisher, the fast chargers', () => {
  const k = kit('tube', 'pushpick'), cart = kit('tube', 'pushpick', 'picker');
  const plain = attendantBps(k, autoKit(['attendant'])), trained = attendantBps(k, autoKit(['attendant', 'training']));
  assert.ok(Math.abs(trained / plain - ATTENDANT_TRAINED / ATTENDANT_SKILL) < 1e-9 && trained > plain, 'trained: a quarter faster');
  assert.equal(attendantBps(k), attendantBps(k, { skill: ATTENDANT_SKILL, cart: false }), 'the default is the untrained attendant on foot');
  const afoot = attendantBps(cart, autoKit(['attendant'])), driving = attendantBps(cart, autoKit(['attendant', 'staffcart']));
  assert.equal(afoot, attendantBps(k, autoKit(['attendant'])), 'on foot the cart is not his'); assert.ok(driving > 3 * afoot, `with the staff cart he tows the picker (${driving.toFixed(2)} against ${afoot.toFixed(2)})`); assert.ok(ATTENDANT_CART > 0);
  // three attendants cover the day: somebody is on shift at every hour, whichever shift you set
  const three = autoKit(['attendant', 'attendant2', 'attendant3']); assert.equal(three.attendants, 3);
  for (const start of [7, 11, 15]) for (let h = 0; h < 24; h += 0.5) { let on = 0; for (let i = 0; i < 3; i++) if (onShift(i, h, start)) on++; assert.equal(on, 1, `one on shift at ${h} (start ${start})`); }
  assert.equal(SHIFT_HOURS * 3, 24);
  assert.ok(staffBps(three, k, 3, 7) > 0 && staffBps(autoKit(['attendant', 'attendant2']), k, 3, 7) === 0, 'at three in the morning only the night attendant picks');
  // the fast chargers: the robots run more of the time
  const slow = robotBps(autoKit(['robot'])), fast = robotBps(autoKit(['robot', 'chargers']));
  assert.ok(Math.abs(slow - ROBOTS_A_NODE * ROBOT_BPS * ROBOT_HOURS / (ROBOT_HOURS + ROBOT_CHARGE)) < 1e-9 && Math.abs(fast - ROBOTS_A_NODE * ROBOT_BPS * ROBOT_HOURS / (ROBOT_HOURS + ROBOT_CHARGE_FAST)) < 1e-9 && fast > slow);
  // the polisher: clean balls earn more; dirty ones the same
  assert.ok(Math.abs(bucketValue(40, 0, true) - POLISH_VALUE) < 1e-12); assert.equal(bucketValue(0, 40, true), bucketValue(0, 40)); assert.ok(Math.abs(bucketValue(20, 20, true) - (POLISH_VALUE + 0.75) / 2) < 1e-9); assert.equal(bucketValue(40, 0), 1);
  assert.equal(autoKit(['washer', 'polisher']).polish, true); assert.equal(autoKit(['washer']).polish, false);
  const b = newBalls(); b.clean = 400; b.dirty = 0; const at = () => ({ x: 245, y: 215 });
  assert.ok(Math.abs(skipBalls(b, 5, 40, 600, 600, 0, 0, false, at, () => 0.5, null, POLISH_VALUE).value - POLISH_VALUE) < 1e-12, 'a skip sells polished balls at their price');
});

test('the golf side: the range gear raises the gains of your practice sessions, the right ones, and nothing without it', () => {
  const none = practiceGear([]); assert.equal(none.bucket, NO_GEAR); assert.equal(none.putting, NO_GEAR); assert.equal(none.chipping, NO_GEAR);
  const p0 = startProfile(), base = practicePreview(p0, 'bucket', 3).gains, same = practicePreview(p0, 'bucket', 3, null, none.bucket).gains; assert.deepEqual(same, base, 'no gear: the session gives what it always did');
  const gain = (g: ReturnType<typeof practicePreview>['gains'], id: SkillId) => g.find(x => x.id === id)!.gain;
  /** the gain the model gives a session of `kind` for a skill with the gear's factor f (the first session of the day, no lesson, no cards): the preview rounds it to hundredths */
  const want = (kind: 'bucket' | 'putting', id: SkillId, f: number) => gainOf(p0.skills[id], PRACTICE[kind].gains[id]!, 0, 0) * f, near = (a: number, b: number) => Math.abs(a - b) <= 0.011;
  const cam = practicePreview(p0, 'bucket', 3, null, practiceGear(['swingcam']).bucket).gains;
  for (const g of base) assert.ok(near(gain(cam, g.id), want('bucket', g.id, VIDEO_GAIN)), `the video room: ${g.id} ${g.gain} to ${gain(cam, g.id)}`);
  const kitAll = practiceGear(['swingcam', 'fans', 'weighted', 'lmon', 'radar']), all = practicePreview(p0, 'bucket', 3, null, kitAll.bucket).gains;
  assert.ok(near(gain(all, 'power'), want('bucket', 'power', VIDEO_GAIN * WEIGHTED_POWER)), 'power: the video room and the weighted clubs');
  assert.ok(near(gain(all, 'driving'), want('bucket', 'driving', VIDEO_GAIN * LMON_SWING)) && near(gain(all, 'irons'), want('bucket', 'irons', VIDEO_GAIN * LMON_SWING)), 'driving and irons: the launch monitor');
  assert.ok(near(gain(all, 'accuracy'), want('bucket', 'accuracy', VIDEO_GAIN * RADAR_ACCURACY)), 'accuracy: the radar');
  const lmonOnly = practicePreview(p0, 'bucket', 3, null, practiceGear(['lmon']).bucket).gains; assert.equal(gain(lmonOnly, 'power'), gain(base, 'power'), 'the launch monitor leaves the power alone'); assert.ok(gain(lmonOnly, 'driving') > gain(base, 'driving'));
  // the fatigue of the day's later sessions
  assert.equal(practiceGear(['fans']).bucket.fatigue, FANS_FATIGUE); assert.equal(practiceGear([]).bucket.fatigue, FATIGUE); assert.ok(FANS_FATIGUE > FATIGUE);
  assert.ok(Math.abs(gainOf(20, 2, 2, 0, FANS_FATIGUE) / gainOf(20, 2, 0, 0, FANS_FATIGUE) - FANS_FATIGUE ** 2) < 1e-12); assert.equal(gainOf(20, 2, 2), gainOf(20, 2, 2, 0, FATIGUE), 'the default is the old fatigue');
  // the putting trainer: putting and chipping sessions only
  const lab = practiceGear(['puttlab']); assert.equal(lab.bucket, NO_GEAR); assert.equal(lab.putting.all, PUTTLAB_GAIN); assert.equal(lab.chipping.all, PUTTLAB_GAIN);
  const put1 = practicePreview(p0, 'putting', 3, null, lab.putting).gains;
  for (const g of put1) assert.ok(near(g.gain, want('putting', g.id, PUTTLAB_GAIN)), `putting practice: ${g.id}`);
  // a session in the game: the gear is in the gains it gives and the log it writes
  const s0 = practise(p0, 'bucket', { day: 3, minute: 480, price: 6 }), s1 = practise(p0, 'bucket', { day: 3, minute: 480, price: 6, gear: kitAll.bucket });
  assert.ok((s1.entry.gains.power ?? 0) > (s0.entry.gains.power ?? 0) * 1.5, 'the same session, more power'); assert.ok(s1.profile.skills.power > s0.profile.skills.power);
  // the tree's golf nodes are the ones that give it
  assert.deepEqual(TREE.filter(u => u.branch === 'golf').map(u => u.id).sort(), ['fans', 'lmon', 'puttlab', 'radar', 'swingcam', 'weighted']);
});

// ---------------------------------------------------------------- the host: the standing order

const plot: Rect = [200, 200, 70, 150];
const lot = (sc: ReturnType<typeof rangeScene>, n = 20): CarSlot[] => Array.from({ length: n }, (_, i) => ({ x: sc.carEdge.x + sc.roadDir.x * (1 + i * 1.5), y: sc.carEdge.y + sc.roadDir.y * (1 + i * 1.5), hx: sc.rangeSide.x, hy: sc.rangeSide.y }));
const busy = { tier: 5, exits: 2, residents: 20000 };
function makeHost(owned: RangeUpgradeId[], till: number) {
  const biz = owned.reduce((q, id) => withUpgrade(q, id), defaultRangeBiz()); biz.balls!.till = till; let t = 0; const toasts: string[] = [], spent: number[] = [];
  const sc0 = rangeScene(plot, 2, biz), ctx: RangeHostCtx = {
    biz: () => biz, plot: () => ({ rect: plot, facing: 2 }), carPark: () => ({ bays: lot(sc0), entrance: sc0.carEdge, key: 'lot' }), addPiece: () => null, removeProp: () => {}, setGround: () => {}, layPaths: () => {}, clearTrees: () => {},
    money: () => 1e6, spend: () => {}, book: () => {}, balls: n => { spent.push(n); }, demand: () => busy, dayLen: () => 600, simT: () => t, clock: () => ({ hour: 3, day: 1 }), save: () => {}, toast: m => { toasts.push(m); }, emit: () => {}, grid: () => null, layTee: () => false,
  };
  const h = new RangeHost(ctx, 3); h.sync(); h.step();
  return { h, biz, bs: biz.balls!, toasts, spent, run: (s: number) => { t += s; h.step(); } };
}

test('the standing order: with the ball room down to two buckets the supplier brings a case on his own, from the till, within the day\'s cases; without the node nothing comes by itself', () => {
  const vb = visitBalls(600), m = makeHost(['supplier', 'autoorder'], 5000); m.bs.clean = 10; m.bs.dirty = 0;
  m.run(1); assert.equal(m.bs.clean, 10 + CASE_BALLS, 'a case came'); assert.equal(m.bs.day.bought, CASE_BALLS); assert.equal(Math.round(m.bs.till), 5000 - caseCost(supplyKit([]))); assert.deepEqual(m.spent, [caseCost(supplyKit([]))], 'booked as the books\' Range balls line');
  assert.ok(m.toasts.some(t => t.startsWith('Standing order: ')), 'and said so');
  m.run(1); assert.equal(m.bs.day.bought, CASE_BALLS, 'not again: the ball room holds the buckets now'); assert.ok(m.bs.clean >= STANDING_LOW * vb);
  m.bs.clean = 0; m.run(6); assert.equal(m.bs.day.bought, 2 * CASE_BALLS); m.bs.clean = 0; m.run(6); assert.equal(m.bs.day.bought, 3 * CASE_BALLS); m.bs.clean = 0; m.run(6); assert.equal(m.bs.day.bought, CASES_A_DAY * CASE_BALLS, 'the day\'s cases are delivered');
  const poor = makeHost(['supplier', 'autoorder'], 100); poor.bs.clean = 0; poor.run(6); assert.equal(poor.bs.day.bought, 0, 'the till cannot pay: nothing comes'); assert.equal(poor.toasts.filter(t => /costs|delivered/.test(t)).length, 0, 'and no nagging');
  const no = makeHost(['supplier'], 5000); no.bs.clean = 0; no.run(6); assert.equal(no.bs.day.bought, 0, 'no standing order, no delivery');
  const pal = makeHost(['supplier', 'autoorder', 'bulk', 'pallet'], 100000); for (let i = 0; i < 8; i++) { pal.bs.clean = 0; pal.run(6); } assert.equal(pal.bs.day.bought, CASES_PALLET * CASE_BALLS, 'six cases a day with the pallets'); assert.equal(Math.round(pal.spent.reduce((a, n) => a + n, 0)), Math.round(CASES_PALLET * CASE_BALLS * BALL_COST * BULK_PRICE), 'at the trade price');
});

test('each staff and machine node says its balls an hour: the washer\'s drum, an attendant on his shift, a pair of robots; the host\'s view carries them to the tree', () => {
  const k = kit('tube', 'pushpick'), a = autoKit(['attendant', 'washer', 'robot']), r = nodeRates(k, a, 600);
  assert.equal(r.washer, Math.round(perHour(WASHER_BPS, 600))); assert.equal(r.washer, 350, 'fourteen balls a second, 25 sim seconds to a town hour');
  assert.equal(r.attendant, Math.round(perHour(attendantBps(k, a) * (1 - COUNTER_SHARE), 600))); assert.equal(r.attendant2, r.attendant); assert.ok(r.attendant! > 0 && r.attendant! < r.washer!);
  const duty = ROBOT_HOURS / (ROBOT_HOURS + ROBOT_CHARGE); assert.equal(r.robot, Math.round(perHour(ROBOTS_A_NODE * ROBOT_BPS * duty, 600))); assert.equal(r.robot3, r.robot);
  assert.ok(nodeRates(k, autoKit(['attendant', 'dispenser']), 600).attendant! > r.attendant!, 'with a dispenser he picks all his shift');
  assert.ok(nodeRates(k, autoKit(['attendant', 'training']), 600).attendant! > r.attendant!, 'trained, faster');
  assert.ok(nodeRates(k, autoKit(['robot', 'robotspd']), 600).robot! > r.robot!);
  assert.ok(nodeRates(k, a, 1200).washer! > r.washer!, 'a longer day has more sim seconds to a town hour');
  const m = makeHost(['tube', 'pushpick', 'attendant', 'washer'], 0), v = m.h.view()!.balls!; assert.equal(v.rates.washer, 350); assert.ok(v.rates.attendant! > 0);
});

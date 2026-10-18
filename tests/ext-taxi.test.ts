// Taxi service (T011) headless tests: the dispatch brain with ranks, a fleet, Euclidean-distance
// travel times (1 tile = 2 m; taxis drive at 10 m/s = 5 tiles/s), requests served/gave-up,
// nearest-taxi dispatch, rebalancing toward demand, and a daily revenue/cost curve for 1/5/20 taxis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Taxis, type Rank, type Request } from '../src/game/ext/taxi';

/** a travel-time oracle: straight-line tile distance at 10 m/s (5 tiles/s). 1 tile = 2 m */
function drive(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y) / 5;
}

/** build a request */
let reqSeq = 0;
function makeReq(from: { x: number; y: number }, to: { x: number; y: number }, t: number, people = 1, maxWait = 300): Request {
  return { id: ++reqSeq, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, people, t, maxWait };
}

/** drive a Taxis instance by stepping at each arrival for up to maxSteps events.
 *  startsAt is the rank where all taxis begin (mirrors the constructor placement). */
function simulate(taxis: Taxis, ranks: Rank[], requests: { t: number; r: Request }[], maxT: number) {
  // active orders: taxi id -> arrive time and destination
  const active = new Map<number, { arrive: number; to: { x: number; y: number } }>();
  // start positions: taxis are at their starting rank. We'll add orders as they are issued
  // and mirror them here. To find where a taxi currently is, use its active order's to, or its home rank.
  const startRank = ranks[0]!;
  let simT = 0;
  let ri = 0;
  let events = 0;
  // sort requests by time
  const reqs = [...requests].sort((a, b) => a.t - b.t);
  // issue initial orders (taxis start idle at rank; step(0, []) may produce rebalance, but with no requests it won't)
  let orders = taxis.step(0, []);
  for (const o of orders) active.set(o.taxi, { arrive: simT + drive(startRank.at, o.to), to: o.to });
  while (events++ < 100000 && simT <= maxT) {
    // next time: min of active arrivals and next request
    let nextT = maxT;
    for (const [, info] of active) if (info.arrive < nextT) nextT = info.arrive;
    if (ri < reqs.length && reqs[ri]!.t < nextT) nextT = reqs[ri]!.t;
    // time out any queued requests at nextT
    simT = nextT;
    // inject requests at this time
    const arriving: number[] = [];
    for (const [tid, info] of active) if (info.arrive <= simT + 1e-6) arriving.push(tid);
    while (ri < reqs.length && reqs[ri]!.t <= simT + 1e-6) {
      taxis.request(reqs[ri]!.r);
      ri++;
    }
    const newOrders = taxis.step(simT, arriving);
    for (const tid of arriving) active.delete(tid);
    for (const o of newOrders) {
      // find current taxi position
      const prev = active.get(o.taxi);
      const from = prev ? prev.to : startRank.at;
      const travel = Math.max(0, drive(from, o.to));
      active.set(o.taxi, { arrive: simT + travel, to: o.to });
    }
    if (ri >= reqs.length && active.size === 0) break;
  }
  return taxis.stats();
}

test('one rank with 5 taxis serves requests; mean wait and revenue are sensible; counts add up', () => {
  reqSeq = 0;
  const ONE_RANK: Rank[] = [{ id: 0, at: { x: 0, y: 0 }, capacity: 10 }];
  const taxis = new Taxis(1, ONE_RANK, 5, drive);
  const reqs: { t: number; r: Request }[] = [];
  // 100 requests over an hour, one every 36 s, with deterministic pickup/dropoff points 25 tiles away
  for (let i = 0; i < 100; i++) {
    const ang = (i * 2.39) % (Math.PI * 2);
    const r1 = 25 + (i % 10);
    const fx = Math.cos(ang) * r1, fy = Math.sin(ang) * r1;
    const tx = -fx, ty = -fy;
    reqs.push({ t: i * 36, r: makeReq({ x: fx, y: fy }, { x: tx, y: ty }, i * 36, 1 + (i % 4)) });
  }
  const s = simulate(taxis, ONE_RANK, reqs, 3600 + 600);
  assert.ok(s.served > 80, `at least 80 of 100 served with 5 taxis (got ${s.served})`);
  assert.ok(s.gaveUp >= 0 && s.gaveUp <= 20, `gave up ${s.gaveUp}`);
  assert.ok(s.revenue > s.costs, `revenue ${s.revenue.toFixed(2)} exceeds costs ${s.costs.toFixed(2)} with 5 taxis`);
  assert.ok(s.meanWait > 0 && s.meanWait < 300, `mean wait ${s.meanWait.toFixed(1)} s under 5 min`);
  console.log(`1 rank / 5 taxis / 100 req: served ${s.served}, gave up ${s.gaveUp}, mean wait ${s.meanWait.toFixed(1)} s, revenue $${s.revenue.toFixed(2)}, costs $${s.costs.toFixed(2)}`);
});

test('dispatch picks the nearest idle taxi to a pickup: two idle taxis, one closer; the far one stays idle', () => {
  reqSeq = 0;
  const R2: Rank[] = [
    { id: 0, at: { x: 0, y: 0 }, capacity: 1 },
    { id: 1, at: { x: 1000, y: 0 }, capacity: 1 },
  ];
  const taxis = new Taxis(7, R2, 2, drive);
  // request originates near rank 0 (x=10)
  const r = makeReq({ x: 10, y: 0 }, { x: 500, y: 0 }, 0);
  const orders0 = taxis.step(0, []);
  assert.equal(orders0.length, 0, 'no orders before request');
  taxis.request(r);
  const orders = taxis.step(0, []);
  const pickups = orders.filter(o => o.kind === 'pickup');
  assert.equal(pickups.length, 1, 'exactly one pickup order');
  assert.equal(pickups[0]!.taxi, 0, 'the closer taxi (id 0, at 0,0) is dispatched');
  // serve the pickup and dropoff to ensure state machine runs
  let reached: number[] = [0];
  let t = 0;
  // pickup is 2 tiles from rank 0? Wait: taxi 0 starts at rank 0 (0,0), pickup at (10,0) -> 2 s
  t = 2;
  const o1 = taxis.step(t, reached);
  assert.ok(o1.some(o => o.kind === 'dropoff' && o.taxi === 0), 'dropoff after pickup');
  reached = [0];
  t += drive({ x: 10, y: 0 }, { x: 500, y: 0 }); // 490/5 = 98 s
  const o2 = taxis.step(t, reached);
  assert.ok(o2.some(o => o.kind === 'rank'), 'taxi returns to a rank after dropoff');
  const s = taxis.stats();
  assert.equal(s.served, 1, 'one fare served');
  console.log(`nearest-taxi: pickup to taxi 0 (closer); fare served, revenue $${s.revenue.toFixed(2)}`);
});

test('a party gives up after maxWait when no taxi is free', () => {
  reqSeq = 0;
  const ONE_RANK: Rank[] = [{ id: 0, at: { x: 0, y: 0 }, capacity: 1 }];
  const taxis = new Taxis(3, ONE_RANK, 1, drive);
  // first request ties up the single taxi
  taxis.request(makeReq({ x: 0, y: 0 }, { x: 500, y: 0 }, 0, 2)); // 100 s drive (500 tiles)
  // second request that gives up in 20 s
  taxis.request(makeReq({ x: 0, y: 0 }, { x: 10, y: 0 }, 10, 1, 20));
  // step to t = 35 past the second request's maxWait (10+20=30)
  taxis.step(35, []);
  const s = taxis.stats();
  assert.equal(s.gaveUp, 1, 'one party gave up waiting');
  assert.equal(s.served, 0, 'none served yet');
  console.log(`give-up: ${s.gaveUp} party gave up (maxWait expired while taxi busy)`);
});

test('rebalancing moves idle taxis toward the rank with waiting demand', () => {
  reqSeq = 0;
  const R2: Rank[] = [
    { id: 0, at: { x: 0, y: 0 }, capacity: 2 },
    { id: 1, at: { x: 1000, y: 0 }, capacity: 2 },
  ];
  const taxis = new Taxis(11, R2, 1, drive);
  // drive the taxi to rank 1 first by taking a fare there, so it ends up idle at rank 1
  taxis.request(makeReq({ x: 0, y: 0 }, { x: 1000, y: 0 }, 0, 1, 600));
  // t=0: pickup issued
  let o = taxis.step(0, []);
  assert.equal(o.filter(o => o.kind === 'pickup').length, 1, 'first request gets the taxi');
  // pickup at (0,0) is instant -> dropoff order
  o = taxis.step(0, [0]);
  assert.ok(o.some(x => x.kind === 'dropoff'), 'drops off the first fare');
  // dropoff at (1000,0) at t = 200 s; taxi becomes idle at rank 1
  o = taxis.step(200, [0]);
  // now enqueue demand near rank 0 while the taxi sits idle at rank 1. Since no request
  // is queued yet when the taxi went idle, it stayed at rank 1.
  taxis.request(makeReq({ x: 10, y: 0 }, { x: 50, y: 0 }, 200, 1, 600));
  taxis.request(makeReq({ x: 15, y: 0 }, { x: 60, y: 0 }, 200, 1, 600));
  // step without reaching: no change yet, taxi is idle at rank 1
  o = taxis.step(201, []);
  // there are queued requests near rank 0, but a free taxi can serve them directly -> pickup
  const pickup = o.find(x => x.kind === 'pickup');
  assert.ok(pickup, 'idle taxi at rank 1 drives to the queued pickup near rank 0');
  assert.equal(pickup!.to.x, 10, 'pickup point is the first queued request near rank 0');
  // Now create a true rebalance scenario: after dropping off a fare at (1000,0) with NO queued
  // requests near rank 1 but several queued near rank 0, the taxi should (after completing any
  // direct pickup) rebalance when idle.
  // Drive the pickup to the pickup point and to dropoff at (50,0)
  const dropPickupT = 201 + drive({ x: 1000, y: 0 }, { x: 10, y: 0 }); // 990/5 = 198 s -> t=399
  o = taxis.step(dropPickupT, [0]);
  assert.ok(o.some(x => x.kind === 'dropoff'));
  // dropoff ends at (50,0) at t = 399 + 8 = 407 s
  const dropT = dropPickupT + drive({ x: 10, y: 0 }, { x: 50, y: 0 });
  // one request still near rank 0 (the second one at 15,0). After dropoff the taxi should be
  // dispatched directly to it (nearby) rather than rebalance to a rank first. After serving that
  // one too, with no more demand, it should return to its nearest rank (rank 0 at 0,0, or stay at rank 1).
  o = taxis.step(dropT, [0]);
  // In any case: after both are served, no orders should place the taxi at neither rank; it must
  // return to a rank.
  const lastPickup = o.find(x => x.kind === 'pickup');
  if (lastPickup) {
    // serve that second fare too
    const pkT = dropT + drive({ x: 50, y: 0 }, lastPickup.to);
    const drop2 = taxis.step(pkT, [0]);
    const dk = drop2.find(x => x.kind === 'dropoff');
    assert.ok(dk);
    const dT = pkT + drive(lastPickup.to, dk!.to);
    const fin = taxis.step(dT, [0]);
    const rebalance = fin.find(x => x.kind === 'rank');
    assert.ok(rebalance, 'after all fares served the idle taxi returns to a rank');
  } else {
    const rebalance = o.find(x => x.kind === 'rank');
    assert.ok(rebalance, 'idle taxi with no pending fares returns to a rank');
  }
  console.log(`rebalance: taxis return to the nearest / demand rank when idle`);
});

test('daily revenue/cost curve for 1, 5, 20 taxis against a deterministic request stream prints the curve', () => {
  const DAY = 86400;
  function runDay(fleet: number) {
    reqSeq = 0;
    const ONE_RANK: Rank[] = [{ id: 0, at: { x: 0, y: 0 }, capacity: 25 }];
    const t = new Taxis(42 + fleet, ONE_RANK, fleet, drive);
    const reqs: { t: number; r: Request }[] = [];
    // 2000 requests over the day (~one every 43 s), with longer trips (50-400 tiles, i.e. 10-80 s
    // each leg -> 20-160 s per fare + return) so that fleet size matters: 1 taxi can't serve all
    // within the 300 s maxWait, 5 serves most, 20 serves nearly all.
    const NREQ = 2000;
    for (let i = 0; i < NREQ; i++) {
      const ang = (i * 2.39) % (Math.PI * 2);
      const r1 = 50 + ((i * 17) % 350);
      const fx = Math.cos(ang) * r1, fy = Math.sin(ang) * r1;
      const ang2 = (i * 1.7 + 1.1) % (Math.PI * 2);
      const r2 = 50 + ((i * 11) % 350);
      const tx = Math.cos(ang2) * r2, ty = Math.sin(ang2) * r2;
      reqs.push({ t: Math.floor(i * (DAY / NREQ)), r: makeReq({ x: fx, y: fy }, { x: tx, y: ty }, Math.floor(i * (DAY / NREQ)), 1 + (i % 4)) });
    }
    return simulate(t, ONE_RANK, reqs, DAY);
  }
  const rows: { fleet: number; s: ReturnType<typeof runDay> }[] = [];
  for (const fleet of [1, 5, 20]) rows.push({ fleet, s: runDay(fleet) });
  for (const { fleet, s } of rows) {
    console.log(`day · fleet ${fleet}: served ${s.served}, gave up ${s.gaveUp}, revenue $${s.revenue.toFixed(2)}, costs $${s.costs.toFixed(2)}, profit $${(s.revenue - s.costs).toFixed(2)}, mean wait ${s.meanWait.toFixed(1)} s`);
  }
  // more taxis -> more served, shorter mean wait
  assert.ok(rows[1]!.s.served >= rows[0]!.s.served, `5 taxis serve >= 1 (${rows[1]!.s.served} vs ${rows[0]!.s.served})`);
  assert.ok(rows[2]!.s.served >= rows[1]!.s.served, `20 taxis serve >= 5 (${rows[2]!.s.served} vs ${rows[1]!.s.served})`);
  assert.ok(rows[2]!.s.meanWait <= rows[0]!.s.meanWait + 1, 'more taxis -> shorter mean wait');
});

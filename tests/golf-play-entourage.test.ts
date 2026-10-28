// T213 caddies, carts and celebrations (src/game/golf/play/entourage.ts, carts.ts, celebrate.ts, view.ts): on the synthetic 18-hole course of
// golf-play.test.ts with a cart path beside every hole. Caddies only at the pro tiers; carts two to a cart for the small events' amateurs and the
// everyday visitors; the carts' stops on the paths and off the greens, their routes on the paths (else the rough's edge); a cart group a little faster
// with the same strokes; never two groups on a green; a celebration only after a birdie or better (and the gallery's cheer); all of it from the seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import {
  CADDIE_TIER, CART_PACE, CART_TIER, CartPlay, FLIGHT_TIME, PUTT_FLIGHT, PlayView, RIDE, STATE, WALK, cartLie, cartPaths, celebrations, dayRound, edgeRoute,
  fieldEntourage, makeField, nearestOnPaths, pathRoute, playRound, teeTimes,
} from '../src/game/golf/play';
import { dayCourse, dayPlan, dayRoster } from '../src/game/golf/everyday';
import type { CartPaths, CourseView, Golfer, Group, Lie, PlayHole, Pt, RoundPlan, Shot } from '../src/game/golf/play';

const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5];
/** the path runs this many tiles beside each hole's line (inside the rough: the fairway is 7.5 wide each side) */
const PATH_OFF = 15;

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
/** the synthetic course: each hole on its own row 60 tiles apart, greens of 6 tiles round each pin, a fairway strip, rough, out of bounds beyond */
function course(): CourseView {
  const holes: PlayHole[] = PARS.map((par, h) => {
    const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y };
    return { n: h + 1, par, tee, pin, line: [tee, pin] };
  });
  const lieAt = (x: number, y: number): Lie => {
    for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green';
    for (const h of holes) if (Math.hypot(x - h.tee.x, y - h.tee.y) <= 2) return 'tee';
    let d = Infinity;
    for (const h of holes) d = Math.min(d, segDist({ x, y }, h.tee, h.pin));
    return d <= 7.5 ? 'fairway' : d <= 40 ? 'rough' : 'out';
  };
  return { holes, lieAt };
}
/** the cart path: along each hole PATH_OFF tiles to its side, from behind the tee to past the green, joined behind the tees (a comb) */
function paths(view: CourseView): CartPaths {
  const lines: { a: Pt; b: Pt }[] = [];
  view.holes.forEach((h, i) => {
    const a = { x: h.tee.x - 15, y: h.tee.y + PATH_OFF }, b = { x: h.pin.x + 10, y: h.pin.y + PATH_OFF };
    lines.push({ a, b });
    const nx = view.holes[i + 1]; if (nx) lines.push({ a, b: { x: nx.tee.x - 15, y: nx.tee.y + PATH_OFF } });
  });
  return cartPaths(lines);
}
/** on the path: within this of one of its segments */
function onPaths(P: CartPaths, p: Pt): boolean { const o = nearestOnPaths(P, p.x, p.y); return !!o && o.d < 1e-6; }

/** a tournament's field at a tier, its tee times and the entourage (as dayRound has it) */
function field(tier: number, seed: number): { f: Golfer[]; gs: Group[] } {
  const f = makeField(tier, seed), gs = teeTimes(f, seed); fieldEntourage(f, gs, tier); return { f, gs };
}
/** the same golfers walking (no carts) */
const walking = (f: Golfer[]): Golfer[] => f.map(g => { const w = { ...g }; delete w.cart; return w; });
const dur = (s: Shot) => s.club === 'putter' ? PUTT_FLIGHT : FLIGHT_TIME;
/** asserts that no two groups are ever on one green at once (from their first ball at rest on it to their last ball's end) */
function noGreenOverlap(p: RoundPlan, view: CourseView, label: string): void {
  for (let h = 0; h < view.holes.length; h++) {
    const sp: { g: number; a: number; b: number }[] = [];
    p.groups.forEach((gr, g) => {
      const ss = p.shots.filter(s => s.hole === h && gr.players.includes(s.golfer)); if (!ss.length) return;
      const on = ss.filter(s => s.lie === 'green' || s.holed);
      if (on.length) sp.push({ g, a: Math.min(...on.map(s => s.t + dur(s))), b: Math.max(...ss.map(s => s.t + dur(s))) });
    });
    for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) {
      const x = sp[i]!, y = sp[j]!;
      assert.ok(x.b <= y.a + 1e-9 || y.b <= x.a + 1e-9, `${label}: groups ${x.g} and ${y.g} on the green of hole ${h} at once`);
    }
  }
}

test('entourage: caddies only for the pros at the pro tiers; carts for the amateurs at the small events, two to a cart in one group', () => {
  for (let tier = 1; tier <= 5; tier++) for (const seed of [3, 41]) {
    const { f, gs } = field(tier, seed);
    for (const g of f) {
      assert.equal(!!g.caddie, g.pro && tier >= CADDIE_TIER, `tier ${tier}: ${g.name} (${g.pro ? 'pro' : 'amateur'}) caddie`);
      assert.equal(g.cart !== undefined, !g.pro && tier <= CART_TIER, `tier ${tier}: ${g.name} cart`);
    }
    // two to a cart, never across groups, at most one lone rider per group
    const carts = new Map<number, number[]>();
    for (const g of f) if (g.cart !== undefined) carts.set(g.cart, [...(carts.get(g.cart) ?? []), g.id]);
    for (const [c, ids] of carts) {
      assert.ok(ids.length >= 1 && ids.length <= 2, `cart ${c} has ${ids.length}`);
      assert.equal(new Set(ids.map(id => gs.findIndex(gr => gr.players.includes(id)))).size, 1, `cart ${c} in one group`);
    }
    for (const gr of gs) assert.ok(gr.players.filter(id => { const c = f[id]!.cart; return c !== undefined && carts.get(c)!.length === 1; }).length <= 1);
  }
  // the day's round as the engine builds it has them too, the owner walking and without a caddie
  const view = course(), d = dayRound(view, 1, 7, { owner: 'm', inputs: [], caddie: null });
  const owner = d.golfers.find(g => g.owner)!;
  assert.equal(owner.cart, undefined); assert.equal(owner.caddie, undefined);
  assert.ok(d.golfers.some(g => g.cart !== undefined));
  assert.ok(dayRound(view, 4, 7, null).golfers.filter(g => g.pro).every(g => g.caddie));
});

test('entourage: everyday visitors ride, members walk about half the time; the roster is otherwise the same as before', () => {
  const inp = { quality: 60, rep: 50, holes: 18, busy: 120 };
  let memberGroups = 0, memberWalk = 0;
  for (let day = 1; day <= 6; day++) {
    const r = dayRoster(11, day, inp);
    r.groups.forEach((gr, k) => {
      const rides = gr.players.map(id => r.golfers[id]!.cart !== undefined);
      assert.ok(rides.every(x => x === rides[0]), 'a group rides or walks together');
      if (!r.info[k]!.member) assert.ok(rides[0], 'visitors ride');
      else { memberGroups++; if (!rides[0]) memberWalk++; }
    });
    assert.ok(r.golfers.every(g => !g.caddie));
  }
  assert.ok(memberGroups > 10 && memberWalk > 0.2 * memberGroups && memberWalk < 0.8 * memberGroups, `members walk ${memberWalk} of ${memberGroups}`);
});

test('carts: parked by the tee and beside the green on the path, never on a green; without paths at the rough’s edge, off the green', () => {
  const view = course(), P = paths(view), { f, gs } = field(1, 5), plan = playRound(view, f, gs, 5);
  for (const [label, cp] of [['paths', new CartPlay(plan, view, P, { x: 0, y: 0 })], ['no paths', new CartPlay(plan, view, null, { x: 0, y: 0 })]] as const) {
    view.holes.forEach((_, h) => {
      const t = cp.teeStop(h), g = cp.greenStop(h);
      assert.notEqual(view.lieAt(g.x, g.y), 'green', `${label}: hole ${h}'s green stop is off the green`);
      assert.ok(cartLie(view.lieAt(t.x, t.y)) && cartLie(view.lieAt(g.x, g.y)), `${label}: hole ${h}'s stops are in the rough`);
      if (label === 'paths') assert.ok(onPaths(P, t) && onPaths(P, g), `hole ${h}'s stops are on the path`);
    });
    // every stop of every cart on every hole: off the greens (and on the path, with paths: it runs within reach of every ball in play)
    let stops = 0;
    for (let c = 0; c < cp.size; c++) for (let h = 0; h < view.holes.length; h++) for (const v of cp.stops(c, h)) {
      stops++;
      assert.notEqual(view.lieAt(v.stop.x, v.stop.y), 'green', `${label}: cart ${c} parks on hole ${h}'s green`);
      assert.ok(v.dep >= v.arr, 'it leaves after it arrives');
      for (const l of v.legs) assert.ok(l.out <= l.at && l.at <= l.end && l.end <= l.back, `${label}: cart ${c} hole ${h}: the walk out, the strokes, the walk back in order`);
    }
    assert.ok(stops > 18 * cp.size);
  }
});

test('carts: the routes run along the paths, else around the played surfaces at the rough’s edge', () => {
  const view = course(), P = paths(view), cp = new CartPlay(playRound(view, [], [], 1), view, P, { x: 0, y: 0 });
  // from the green of hole 2 to the tee of hole 3, on the path all the way
  const a = cp.greenStop(2), b = cp.teeStop(3), r = pathRoute(P, a, b)!;
  assert.ok(r && r.length >= 3);
  for (const p of r) assert.ok(onPaths(P, p), `route point (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) on the path`);
  // off the paths: along a fairway, every point of the route (but the ends) in the rough beside it; across one, never on a green or a tee
  const y4 = 20 + 60 * 4, e = edgeRoute(view, { x: 14, y: y4 + 1 }, { x: 80, y: y4 + 1 });
  assert.ok(e.length > 5);
  for (const p of e.slice(1, -1)) assert.ok(cartLie(view.lieAt(p.x, p.y)), `edge point (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) off the fairway`);
  for (const p of edgeRoute(view, { x: 60, y: y4 + 20 }, { x: 60, y: y4 - 20 })) assert.ok(view.lieAt(p.x, p.y) !== 'green' && view.lieAt(p.x, p.y) !== 'tee');
  for (const p of edgeRoute(view, { x: 80, y: y4 + 20 }, { x: 100, y: y4 - 20 }).slice(1, -1)) assert.notEqual(view.lieAt(p.x, p.y), 'green', 'around the green');
  // a far detour is not taken: from past the 5th green to past the 6th, the comb's way round is over DETOUR times the straight line
  const g4 = view.holes[4]!.pin, g5 = view.holes[5]!.pin;
  assert.equal(pathRoute(P, { x: g4.x + 10, y: g4.y + PATH_OFF }, { x: g5.x + 10, y: g5.y + PATH_OFF }), null);
});

test('carts: a cart group is a little faster between shots, with the same strokes; a rider walks from the cart to his ball and rides between', () => {
  const view = course();
  for (const seed of [2, 9]) {
    const { f, gs } = field(1, seed), ride = playRound(view, f, gs, seed), walk = playRound(view, walking(f), gs, seed);
    assert.deepEqual(ride.strokes, walk.strokes, 'the same strokes');
    const key = (s: Shot) => `${s.golfer}:${s.hole}:${s.stroke}:${s.club}:${s.to.x.toFixed(6)},${s.to.y.toFixed(6)}`;
    assert.deepEqual(ride.shots.map(key).sort(), walk.shots.map(key).sort(), 'the same shots');
    // the first group plays unhindered: an all-cart first group is quicker, but by less than the whole walking share
    const g0 = gs[0]!, roundOf = (p: RoundPlan) => Math.max(...g0.players.map(id => p.done[id]!)) - g0.tee;
    if (g0.players.every(id => f[id]!.cart !== undefined)) {
      const k = roundOf(ride) / roundOf(walk);
      assert.ok(k < 0.97 && k > CART_PACE, `the cart group takes ${k.toFixed(3)} of its walking time`);
    }
    const sum = (p: RoundPlan) => gs.reduce((a, gr) => a + Math.max(...gr.players.map(id => p.done[id]!)) - gr.tee, 0);
    assert.ok(sum(ride) < sum(walk), 'the field with carts is round sooner');
  }
  // a rider's day: on the first tee as the round has him, then walks between the cart and his ball and rides between
  const { f, gs } = field(2, 4), plan = playRound(view, f, gs, 4), cp = new CartPlay(plan, view, paths(view), { x: 0, y: 0 });
  const id = f.find(g => g.cart !== undefined)!.id, gr = gs.find(g => g.players.includes(id))!, seen = new Set<number>();
  let walkFromStop = false;
  for (let m = gr.tee; m < plan.done[id]! + 5; m += 0.05) {
    const k = cp.rider(id, m); seen.add(k);
    if (k === WALK && !walkFromStop) { const c = f[id]!.cart!; walkFromStop = view.holes.some((_, h) => cp.stops(c, h).some(v => Math.hypot(v.stop.x - cp.walk.x, v.stop.y - cp.walk.y) < 3)); }
  }
  assert.ok(seen.has(STATE) && seen.has(WALK) && seen.has(RIDE), 'state, walks and rides');
  assert.ok(walkFromStop, 'a walk starts at the cart');
});

test('carts: never two groups on a green, a tournament field in carts and a busy everyday day', () => {
  const view = course();
  for (const tier of [1, 2]) for (const seed of [6, 13]) { const { f, gs } = field(tier, seed); noGreenOverlap(playRound(view, f, gs, seed), view, `tier ${tier} seed ${seed}`); }
  const dv = dayCourse(view), r = dayRoster(21, 3, { quality: 70, rep: 60, holes: 18, busy: 150 });
  noGreenOverlap(dayPlan(dv, r), dv, 'everyday');
});

test('celebrations: only after a birdie or better; the golfer’s pose and the gallery’s cheer at the cup, once the ball drops', () => {
  const view = course(), { plan } = dayRound(view, 5, 17, null), cel = celebrations(plan, view);
  assert.ok(cel.length > 0, 'a tour field makes birdies');
  for (const c of cel) {
    assert.ok(c.shot.holed && c.toPar <= -1 && c.shot.stroke + c.shot.penalty === view.holes[c.hole]!.par + c.toPar);
    assert.equal(plan.strokes[c.golfer]![c.hole], view.holes[c.hole]!.par + c.toPar);
  }
  // every birdie or better is there, and no par or worse
  let birdies = 0;
  plan.strokes.forEach(row => row.forEach((k, h) => { if (k > 0 && k <= view.holes[h]!.par - 1) birdies++; }));
  assert.equal(cel.length, birdies);
  // the playback: through the first celebration, the cheer is at its cup and only there; through a par's hole-out, none
  const c = cel[0]!, pv = new PlayView(plan, view);
  const par = plan.shots.find(s => s.holed && s.stroke + s.penalty >= view.holes[s.hole]!.par && Math.abs(s.t - c.shot.t) > 3)!;
  for (const [s, celebrates] of [[c.shot, true], [par, false]] as const) {
    let cheered = false, now = 100 + s.t;
    pv.update(s.t - 0.5, now);
    for (let m = s.t - 0.5; m < s.t + 0.5; m += 0.01) {
      now += 0.05; pv.update(m, now);
      for (const ch of pv.cheers) {
        const at = cel.find(q => Math.hypot(q.shot.to.x - ch.x, q.shot.to.y - ch.y) < 1e-9);
        assert.ok(at, 'a cheer is at a celebrated cup');
        if (Math.hypot(s.to.x - ch.x, s.to.y - ch.y) < 1e-9) cheered = true;
      }
    }
    assert.equal(cheered, celebrates, celebrates ? 'the birdie is celebrated' : 'the par is not');
  }
});

test('caddies: one beside each pro drawn at the pro tiers, off the green while he putts; none at tier 1', () => {
  const view = course();
  for (const [tier, want] of [[1, false], [4, true]] as const) {
    const { plan } = dayRound(view, tier, 8, null), pv = new PlayView(plan, view), pros = new Set(plan.golfers.filter(g => g.pro).map(g => g.id));
    let putting = 0, offGreen = 0, any = 0;
    for (let m = 450; m < 900; m += 0.5) {
      pv.update(m, m);
      const shown = pv.people.filter(p => pros.has(p.golfer)).length;
      assert.equal(pv.caddies.length, want ? shown : 0, `tier ${tier} at ${m}: a caddie for each pro drawn`);
      any += pv.caddies.length;
      for (const k of pv.caddies) {
        const next = plan.shots.find(s => s.golfer === k.golfer && s.t > m);
        if (next && next.club === 'putter' && m > next.t - 0.25 && m < next.t) { putting++; if (view.lieAt(k.x, k.y) !== 'green') offGreen++; }
      }
    }
    if (want) { assert.ok(any > 0 && putting > 0); assert.ok(offGreen / putting > 0.9, `off the green ${offGreen} of ${putting}`); }
  }
});

test('determinism: the same seed gives the same entourage, the same cart stops and the same celebrations', () => {
  const view = course(), P = paths(view);
  const run = () => {
    const { plan } = dayRound(view, 2, 33, null), cp = new CartPlay(plan, view, P, { x: 0, y: 0 });
    const stops = [];
    for (let c = 0; c < cp.size; c++) for (let h = 0; h < view.holes.length; h++) stops.push(cp.stops(c, h).map(v => [v.stop.x, v.stop.y, v.arr, v.dep]));
    return { who: plan.golfers.map(g => [g.cart ?? -1, !!g.caddie]), stops, cel: celebrations(plan, view).map(c => [c.golfer, c.hole, c.toPar]), done: plan.done };
  };
  assert.deepEqual(run(), run());
});

test('performance: a full tour field with caddies and a cart field play back cheaply; carts off the screen work out no routes', () => {
  const view = course(), P = paths(view);
  for (const tier of [2, 5]) {
    const { plan } = dayRound(view, tier, 3, null), pv = new PlayView(plan, view, { paths: P });
    for (let m = 450; m < 470; m += 1) pv.update(m, m); // warm
    const t0 = performance.now(); let n = 0;
    for (let m = 600; m < 700; m += 0.25) { pv.update(m, m); n++; }
    const ms = (performance.now() - t0) / n;
    assert.ok(ms < 3, `tier ${tier}: ${ms.toFixed(3)} ms an update`);
  }
  // a box far from the course: no cart drawn, no drive's route worked out
  const { plan } = dayRound(view, 1, 3, null), pv = new PlayView(plan, view, { paths: P });
  pv.box = [5000, 5000, 5100, 5100];
  for (let m = 450; m < 800; m += 0.5) pv.update(m, m);
  assert.equal(pv.carts.length, 0);
  const cp = pv.cartPlay!;
  for (let c = 0; c < cp.size; c++) for (let h = 0; h < view.holes.length; h++) for (const v of cp.stops(c, h)) assert.equal(v.route, null);
});

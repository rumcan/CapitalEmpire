// T251 (#728): golf balls bounce and roll on the ground. The shot model's end points are unchanged against main for a fixed set of shots (and the
// rounds' scores with them); the bounce and the roll (golf/play/roll.ts) are deterministic, follow the landing's surface (a higher bounce on the
// fairway, a dead stop in a bunker, a splash in water), end at the model's end point and bend with the ground's slope without moving that end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { BEND, BallRoll, FX_NONE, FX_SAND, FX_SPLASH, PUFF_S, PlayView, ROLL_DONE_S, SPLASH_S, ballRoll, chooseShot, crossSlope, hitShot, makeField, playRound, rng, teeTimes } from '../src/game/golf/play';
import { FADE_OUT_S } from '../src/game/golf/play/pacer';
import { RangeSim, defaultRangeBiz, rangeScene, rollOut, withUpgrade, type CarSlot, type RangeBizSave, type RangeUpgradeId } from '../src/game/golf/rangebiz';
import type { CourseView, HeightAt, Lie, PlayHole, Pt } from '../src/game/golf/play';

/** the distance (tiles) from p to the segment a-b */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/** a four-hole course with every surface: each hole on its own row (y = 20 + 70 h) from x = 10; a green of 7 tiles round the pin with a bunker short
 *  right of it, a creek across the par 4s and 5s 120 tiles out, a fairway strip of 8 tiles along the line, rough within 30, fescue to 40, out beyond */
function rollCourse(): CourseView {
  const PARS: (3 | 4 | 5)[] = [4, 3, 5, 4];
  const holes: PlayHole[] = PARS.map((par, h) => {
    const y = 20 + 70 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 170 : par === 4 ? 390 : 510) / TILE_M, y };
    return { n: h + 1, par, tee, pin, line: [tee, pin] };
  });
  const lieAt = (x: number, y: number): Lie => {
    let d = Infinity, near: PlayHole = holes[0]!;
    for (const h of holes) { const e = segDist({ x, y }, h.tee, h.pin); if (e < d) { d = e; near = h; } }
    if (Math.hypot(x - near.pin.x, y - near.pin.y) <= 7) return 'green';
    if (Math.hypot(x - (near.pin.x - 11), y - (near.pin.y + 6)) <= 3.5) return 'bunker';
    if (near.par > 3 && x >= near.tee.x + 120 && x <= near.tee.x + 126 && d <= 40) return 'water';
    if (Math.hypot(x - near.tee.x, y - near.tee.y) <= 3) return 'tee';
    return d <= 8 ? 'fairway' : d <= 30 ? 'rough' : d <= 40 ? 'fescue' : 'out';
  };
  return { holes, lieAt };
}

/** a 32-bit FNV-1a digest of a string, hex */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** the fixed set of shots: every hole, from the tee and from points along and off its line, three skills, eight streams each; the model's club and aim
 *  (chooseShot), then where the ball ends, its lie and the penalty (hitShot), as one line per shot */
function fixedShots(view: CourseView): string[] {
  const lines: string[] = [];
  const LIES: Lie[] = ['tee', 'fairway', 'rough', 'fescue', 'bunker'];
  view.holes.forEach((h, hi) => {
    const L = Math.hypot(h.pin.x - h.tee.x, h.pin.y - h.tee.y);
    for (const share of [0, 0.35, 0.6, 0.85, 0.95]) for (const off of share ? [0, 12, -25] : [0]) {
      const from = { x: h.tee.x + (h.pin.x - h.tee.x) * share, y: h.tee.y + off + (h.pin.y - h.tee.y) * share }, lie = share ? LIES[1 + ((hi + Math.abs(off)) % 4)]! : 'tee';
      for (const skill of [0.25, 0.6, 0.95]) for (let k = 0; k < 8; k++) {
        const r = rng(4242 + k, hi * 7 + Math.round(share * 100), Math.round(skill * 100) + off), c = chooseShot(lie, from, h, skill, share === 0);
        if (c.club === 'putter') continue;
        const o = hitShot(r, skill, lie, from, c.aim, c.club, view);
        lines.push(`${hi} ${share} ${off} ${skill} ${k} ${c.club} ${o.to.x} ${o.to.y} ${o.lie} ${o.penalty}`);
      }
      void L;
    }
  });
  return lines;
}

/** the rounds' scores: a tier's field over three seeds on the course, every golfer's strokes by hole */
function fixedRounds(view: CourseView): string {
  const out: string[] = [];
  for (const [tier, seed] of [[1, 11], [3, 23], [5, 37]] as const) {
    const f = makeField(tier, seed), plan = playRound(view, f, teeTimes(f, seed), seed);
    out.push(plan.strokes.map(s => s.join(',')).join(';'), plan.shots.map(s => `${s.to.x},${s.to.y},${s.t}`).join(';'));
  }
  return out.join('|');
}

test('the shot model: the end points of a fixed set of shots and the rounds\' scores are the same as on main (T251 changes only what is drawn)', () => {
  const view = rollCourse(), shots = fixedShots(view);
  assert.ok(shots.length > 300, `a few hundred shots (${shots.length})`);
  const seen = new Set(shots.map(s => s.split(' ')[8])); // (the fixed set reaches every surface the roll knows)
  for (const l of ['fairway', 'rough', 'green', 'bunker']) assert.ok(seen.has(l), `some shot ends on ${l} (${[...seen]})`);
  // (pinned on main at b2fab6e, before T251)
  assert.equal(shots.length, 1248, 'the same set of shots');
  assert.equal(fnv(shots.join('\n')), '4b84a59f', 'the end points, their lies and penalties as on main');
  assert.equal(fnv(fixedRounds(view)), 'ba0e470c', 'the rounds: every stroke, end point and minute as on main');
});

// ---------------------------------------------------------------- the landing the model records, and the roll drawn from it

test('the landing: every full shot and chip records where it landed and where its roll stopped, with their lies; a dry shot\'s roll stops at its end', () => {
  const view = rollCourse(), f = makeField(3, 23), plan = playRound(view, f, teeTimes(f, 23), 23);
  let full = 0, dry = 0;
  for (const s of plan.shots) {
    if (s.club === 'putter') { assert.equal(s.landing, undefined, 'a putt has no landing'); continue; }
    full++; const lg = s.landing; assert.ok(lg, 'a full shot has its landing');
    assert.equal(lg.lie, view.lieAt(lg.at.x, lg.at.y)); assert.equal(lg.restLie, view.lieAt(lg.rest.x, lg.rest.y));
    if (!s.penalty) { dry++; assert.deepEqual(lg.rest, s.to, 'a dry shot rests at its end'); assert.equal(lg.restLie, s.lie); }
    // (the roll runs on along the flight's line)
    const fx = lg.at.x - s.from.x, fy = lg.at.y - s.from.y, rx = lg.rest.x - lg.at.x, ry = lg.rest.y - lg.at.y;
    assert.ok(Math.abs(fx * ry - fy * rx) < 1e-6 * Math.hypot(fx, fy) * (1 + Math.hypot(rx, ry)) && fx * rx + fy * ry >= -1e-9, 'the roll goes on along the line');
  }
  assert.ok(full > 200 && dry > 0.8 * full, `${full} full shots, ${dry} dry`);
});

/** the way of a roll sampled every 10 ms from its landing to its end: points (x y h) and effects */
function sample(r: BallRoll): { pts: { x: number; y: number; h: number }[]; fx: number[] } {
  const pts: { x: number; y: number; h: number }[] = [], fx: number[] = [], o = { x: 0, y: 0, h: 0 };
  for (let k = 0; k * 0.01 <= r.end + 0.05; k++) { fx.push(r.at(k * 0.01, o)); pts.push({ ...o }); }
  return { pts, fx };
}
const LAND = { x: 100, y: 50 }, REST = { x: 112, y: 50 };

test('the bounce by surface: higher on the fairway than on the green, low in the rough and the fescue, a dead stop in a bunker (a puff), a splash in water', () => {
  const top = (lie: Lie, carry = 220) => Math.max(...sample(new BallRoll().set(LAND, REST, lie, lie, carry, 0.8, null)).pts.map(p => p.h));
  const fw = top('fairway'), gr = top('green'), ro = top('rough'), fe = top('fescue');
  assert.ok(fw > 1 && fw > gr && gr > ro && ro > fe && fe > 0, `fairway ${fw.toFixed(2)} > green ${gr.toFixed(2)} > rough ${ro.toFixed(2)} > fescue ${fe.toFixed(2)} m`);
  assert.ok(top('fairway', 90) < fw, 'a shorter carry bounces lower');
  // two bounces on the fairway (a top between each landing), one in the rough
  const tops = (lie: Lie) => { const p = sample(new BallRoll().set(LAND, REST, lie, lie, 220, 0.8, null)).pts; let n = 0; for (let i = 1; i + 1 < p.length; i++) if (p[i]!.h > 0 && p[i]!.h > p[i - 1]!.h && p[i]!.h >= p[i + 1]!.h) n++; return n; };
  assert.equal(tops('fairway'), 2, 'two bounces on the fairway'); assert.equal(tops('rough'), 1, 'one in the rough');
  // a bunker: plugged where it lands (no bounce, no roll), a puff of sand; water: a splash where it lands
  const sand = new BallRoll().set(LAND, LAND, 'bunker', 'bunker', 150, 0.8, null), s = sample(sand);
  assert.ok(s.pts.every(p => p.x === LAND.x && p.y === LAND.y && p.h === 0), 'a dead stop in the bunker');
  assert.ok(s.fx.every(f => f === FX_SAND) && sand.rest === 0 && sand.end === PUFF_S, 'a puff of sand');
  const wet = new BallRoll().set(LAND, LAND, 'water', 'water', 150, 0.8, null);
  assert.ok(sample(wet).fx.every(f => f === FX_SPLASH) && wet.end === SPLASH_S, 'a splash where it lands in water');
  // rolled into water: the bounces and the roll, then the splash where it stops
  const into = new BallRoll().set(LAND, REST, 'fairway', 'water', 220, 0.8, null), w = sample(into), first = w.fx.indexOf(FX_SPLASH);
  assert.ok(first > 0 && w.fx.slice(0, first).every(f => f === FX_NONE) && Math.abs(first * 0.01 - into.rest) < 0.011, 'the splash once it has rolled in');
});

test('the roll: ends exactly at the model\'s end point, at rest, within its time budget; slows to a stop; deterministic', () => {
  for (const lie of ['tee', 'fairway', 'green', 'rough', 'fescue', 'out'] as Lie[]) for (const budget of [0.8, 1.3, 0.3]) {
    const r = new BallRoll().set(LAND, REST, lie, lie, 230, budget, null), o = { x: 0, y: 0, h: 0 };
    assert.ok(r.rest <= budget + 1e-9, `${lie}: done in ${r.rest.toFixed(3)} s of ${budget}`);
    r.at(r.rest, o); assert.deepEqual(o, { x: REST.x, y: REST.y, h: 0 }, `${lie}: at the end point at rest`);
    r.at(r.rest + 5, o); assert.deepEqual(o, { x: REST.x, y: REST.y, h: 0 }, `${lie}: and stays there`);
    r.at(0, o); assert.deepEqual(o, { x: LAND.x, y: LAND.y, h: 0 }, `${lie}: from the landing`);
    // never past the end, never back toward the landing (on flat ground)
    const p = sample(r).pts; for (let i = 1; i < p.length; i++) assert.ok(p[i]!.x >= p[i - 1]!.x - 1e-9 && p[i]!.x <= REST.x + 1e-9, `${lie}: on toward the end`);
    // slowing: the last tenth of the roll's time covers less ground than the tenth before it
    const at = (t: number) => { r.at(t, o); return o.x; }, T = r.rest;
    assert.ok(at(T) - at(0.9 * T) < at(0.9 * T) - at(0.8 * T) + 1e-9, `${lie}: slows to a stop`);
  }
  const hill: HeightAt = (x, y) => 0.03 * x - 0.02 * y;
  assert.deepEqual(sample(new BallRoll().set(LAND, REST, 'fairway', 'fairway', 230, 0.8, hill)), sample(new BallRoll().set(LAND, REST, 'fairway', 'fairway', 230, 0.8, hill)), 'the same landing gives the same way');
});

test('the slope: a cross slope bends the roll (uphill of the line, breaking down to the end) without moving the end; flat ground keeps it straight', () => {
  // the ground falls 3% toward +y: the line's left (-dy, dx) as the roll runs along +x
  const tilt: HeightAt = (_x, y) => -0.03 * y * TILE_M, flat: HeightAt = () => 0.7;
  const r = new BallRoll().set(LAND, REST, 'fairway', 'fairway', 230, 0.8, tilt), s = sample(r).pts, o = { x: 0, y: 0, h: 0 };
  const off = s.map(p => p.y - LAND.y), most = Math.min(...off);
  assert.ok(Math.abs(crossSlope(tilt, LAND.x, LAND.y, REST.x - LAND.x, 0, 12) - 0.03) < 1e-9, 'the ground falls to the line\'s left by 3%');
  assert.ok(most < -0.3, `the way bulges uphill of the line (${most.toFixed(2)} tiles)`);
  assert.ok(off.every(d => d <= 1e-9), 'never downhill of the line: it breaks down to the end');
  assert.ok(Math.abs(most) <= BEND * 0.03 * 12 / 4 + 1e-9, 'by at most BEND * c * L / 4');
  r.at(r.rest, o); assert.deepEqual(o, { x: REST.x, y: REST.y, h: 0 }, 'the end is the model\'s');
  // a slope the other way bends it the other way
  assert.ok(Math.max(...sample(new BallRoll().set(LAND, REST, 'fairway', 'fairway', 230, 0.8, (_x, y) => 0.03 * y * TILE_M)).pts.map(p => p.y - LAND.y)) > 0.3, 'the other way');
  // a slope along the line (no cross slope), level ground and no field: straight
  for (const h of [flat, null, ((x: number) => 0.05 * x * TILE_M) as HeightAt]) assert.ok(sample(new BallRoll().set(LAND, REST, 'fairway', 'fairway', 230, 0.8, h)).pts.every(p => Math.abs(p.y - LAND.y) < 1e-12), 'straight with no cross slope');
  // a putt's line breaks on the green the same way and drops at its end; on flat ground it rolls straight, as before
  const q = { x: 0, y: 0, h: 0 }, pt = new BallRoll().line(LAND, { x: 104, y: 50 }, tilt);
  pt.along(0.5, q); assert.ok(q.y < LAND.y - 0.05 && q.h === 0, `a putt breaks (${(q.y - LAND.y).toFixed(3)} tiles at its middle)`);
  pt.along(1, q); assert.deepEqual(q, { x: 104, y: 50, h: 0 }, 'and drops at its end');
  new BallRoll().line(LAND, { x: 104, y: 50 }, null).along(0.5, q); assert.deepEqual(q, { x: 102, y: 50, h: 0 }, 'straight on flat ground');
});

test('the playback: a round\'s full shots land, bounce and roll to their ends by the swing\'s end, before a faded golfer comes back at the ball', () => {
  assert.ok(ROLL_DONE_S <= 2.2 && FADE_OUT_S > 0, 'over by the swing\'s end (2.2 s); the pacer fades a golfer out only after it');
  const view = rollCourse(), f = makeField(2, 5), plan = playRound(view, f, teeTimes(f, 5), 5), tilt: HeightAt = (x, y) => 0.02 * x * TILE_M + 0.015 * y * TILE_M;
  const shots = plan.shots.filter(s => s.landing && s.landing.lie !== 'water' && s.landing.restLie !== 'water').slice(0, 80);
  assert.ok(shots.length >= 60);
  for (const s of shots) {
    const pv = new PlayView(plan, view, { height: tilt }), lg = s.landing!, at = s.penalty ? s.to : lg.rest;
    pv.update(s.t - 0.02, 50); pv.update(s.t, 51);
    pv.update(s.t, 51.5); assert.ok(pv.balls.some(b => b.h > 0), 'a ball in the air in its flight');
    pv.update(s.t, 51 + ROLL_DONE_S);
    assert.ok(pv.balls.some(b => b.h === 0 && Math.abs(b.x - at.x) < 1e-9 && Math.abs(b.y - at.y) < 1e-9 && !b.fx), `at rest at its end by ${ROLL_DONE_S} s (${s.club}, ${lg.lie} to ${lg.restLie})`);
  }
});

// ---------------------------------------------------------------- the driving range

test('the range: a ball runs out along its flight on the outfield; near a target green it gathers in the hollow round it; short of the far fence; deterministic', () => {
  const G = { x: 100, y: 200, r: 4, m: 100 }, sc = { targets: [G], fence: { o: { x: 0, y: 0 }, u: { x: 1, y: 0 }, v: { x: 0, y: 1 }, u0: 1.4, u1: 300, v1: 290 } };
  const end = (r: BallRoll) => { const o = { x: 0, y: 0, h: 0 }; r.at(r.rest, o); return o; };
  // the outfield: on along the flight by 0.6 to 1.4 times RUN (8%) of the carry, the end on the line (a wobble only bends the way)
  for (let k = 0; k < 40; k++) {
    const x = 20 + 3.7 * k, y = 120 + (k % 5), r = rollOut(x, y, 0, 1, 100, sc), e = end(r);
    assert.ok(Math.abs(e.x - x) < 1e-9 && e.y - y >= 0.6 * 8 - 1e-9 && e.y - y <= 1.4 * 8 + 1e-9, `on along the flight (${(e.y - y).toFixed(2)} tiles)`);
    assert.ok(r.rest > 0 && r.rest <= 1.1 + 1e-9, 'within the roll\'s time');
  }
  // round the green: every ball landing within the catch gathers in the hollow (r + 1.4 from the middle), but some held on the raised green
  let ring = 0, held = 0, onGreen = 0;
  for (let i = 0; i < 400; i++) {
    const a = i * 2.39996, d = (i % 37) / 37 * (G.r + 1.4 + 3 - 0.01), x = G.x + Math.cos(a) * d, y = G.y + Math.sin(a) * d, e = end(rollOut(x, y, 0, 1, 90, sc)), de = Math.hypot(e.x - G.x, e.y - G.y);
    if (d < G.r) onGreen++;
    if (Math.abs(de - (G.r + 1.4)) < 1e-9) ring++; else { assert.ok(d < G.r && de < G.r + 0.5, `held on the green (landed ${d.toFixed(2)}, rests ${de.toFixed(2)} from the middle)`); held++; }
  }
  assert.ok(ring > 250 && held > 0.25 * onGreen && held < 0.55 * onGreen, `${ring} in the hollow, ${held} of ${onGreen} held on the green`);
  // the far fence: a ball rolling at it stops short of it; one landing past it does not roll
  const atFence = end(rollOut(20, 286, 0, 1, 120, sc)); assert.ok(atFence.y <= 290 + 1e-9 && atFence.y > 286, `short of the fence (${atFence.y.toFixed(2)})`);
  const past = end(rollOut(20, 292, 0, 1, 120, sc)); assert.deepEqual([past.x, past.y], [20, 292], 'past the fence already: it stays');
  // the same landing, the same roll
  const a = rollOut(55.5, 140.25, 0.6, 0.8, 80, sc), b = rollOut(55.5, 140.25, 0.6, 0.8, 80, sc), oa = { x: 0, y: 0, h: 0 }, ob = { x: 0, y: 0, h: 0 };
  for (let t = 0; t <= 1.2; t += 0.05) { a.at(t, oa); b.at(t, ob); assert.deepEqual(oa, ob); }
});

test('the range in play: balls bounce and roll out, then lie where they stop (in the hollows round the greens too); the business is unchanged by it', () => {
  const plot: [number, number, number, number] = [200, 200, 70, 150], s0 = ['greens', 'bays8', 'bays12', 'targets'].reduce((s, id) => withUpgrade(s, id as RangeUpgradeId), defaultRangeBiz());
  const play = (on: boolean) => {
    ballRoll.on = on;
    const s = JSON.parse(JSON.stringify(s0)) as RangeBizSave, sc = rangeScene(plot, 2, s), r = new RangeSim(7, 10), fl = new Float32Array(3 * 400);
    const slots: CarSlot[] = Array.from({ length: 12 }, (_, i) => ({ x: plot[0] + 52 + (i % 6) * 2.6, y: plot[1] + 6 + Math.floor(i / 6) * 6, hx: 0, hy: 1 }));
    r.setScene(sc, slots, { x: plot[0] + 69, y: plot[1] + 10 });
    let rolling = 0;
    for (let t = 0; t < 500; t += 0.1) { r.step(0.1, { hour: 12, day: 1 }, s, { tier: 3, exits: 2, residents: 3000 }, 600); const n = r.flying(fl); for (let k = 0; k < n; k++) if (fl[3 * k + 2]! < 0.5) rolling++; }
    return { s, sc, r, rolling };
  };
  try {
    const off = play(false), on = play(true);
    assert.deepEqual(on.s.season, off.s.season, 'the same golfers, buckets and takings with the roll as without it');
    assert.ok(on.rolling > off.rolling, `balls rolling low on the ground (${on.rolling} ball-frames, ${off.rolling} without)`);
    const L = on.r.lying, n = on.r.nLying, G = on.sc.targets;
    assert.ok(n > 50 && G.length >= 3, `balls lie (${n})`);
    let inHollow = 0;
    for (let i = 0; i < n; i++) if (G.some(g => Math.abs(Math.hypot(L[2 * i]! - g.x, L[2 * i + 1]! - g.y) - g.r - 1.4) < 1e-3)) inHollow++;
    assert.ok(inHollow > 0.1 * n, `${inHollow} of ${n} lie in the hollows round the greens`);
  } finally { ballRoll.on = true; }
});

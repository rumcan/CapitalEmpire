// T346 (#988): a ball's roll depends on the club (src/game/golf/play/shot.ts CLUB_RUN, hitShot): the whole bag ranked by its launch and its spin (a driver runs on, a wedge checks), applied in a shot with conditions
// (hitShot's env) and nowhere else, so a shot without them (T334's golden values), an input saved before the club's run (a tournament saved between T334 and T346: OwnerInput.v below 3) and a field's day from
// before it (Conditions.run false: GolfSave.runFrom) play exactly as they did (golden values captured from the unchanged model).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import {
  CLUB_BASE, CLUB_ORDER, CLUB_RUN, LOFT, LiveGroup, MODEL_V, SPIN_BACK_CAP, bagView, hitShot, makeField, playRound, rng, teeTimes,
} from '../src/game/golf/play';
import type { Club, CourseView, GameSkills, Lie, OwnerInput, PlayHole, Pt, ShotEnv } from '../src/game/golf/play';
import { normalizeGolfSave, runOn, stampRun } from '../src/game/golf/mode';

const flat = (lie: Lie): CourseView => ({ holes: [], lieAt: () => lie });
const O: Pt = { x: 0, y: 0 };
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const FULL: Club[] = CLUB_ORDER.filter(c => c !== 'putter');
const fnv = (s: string): string => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** a full shot of `club` from O along +x at its full carry, over `lie`: the share of the flight that rolls on (the roll over the carry the ball flew: exactly the surface's share times the club's run and the rest) */
function ratio(club: Club, lie: Lie, sk: number | GameSkills, mod?: Parameters<typeof hitShot>[7], seed = 1): number {
  const o = hitShot(rng(seed, 7, 3), sk, lie, O, { x: 1000, y: 0 }, club, flat(lie), mod);
  return dist(o.landing.at, o.landing.rest) / dist(O, o.landing.at);
}

test('the run is ranked by launch and spin across the whole bag: it falls with the loft and the backspin the club can take, the original seven are the issue’s numbers, a driver runs on and a wedge checks', () => {
  const issue: Partial<Record<Club, number>> = { driver: 1.3, wood3: 1.2, iron4: 1, iron6: 0.85, iron8: 0.65, pw: 0.45, sw: 0.3 };
  for (const [c, v] of Object.entries(issue)) assert.equal(CLUB_RUN[c as Club], v, c);
  // the clubs in bag order (longest first, the loft rising): the run falls, strictly
  for (let i = 1; i < FULL.length; i++) assert.ok(CLUB_RUN[FULL[i]!] < CLUB_RUN[FULL[i - 1]!], `${FULL[i]} runs less than ${FULL[i - 1]}`);
  // by loft and by spin, for every pair
  for (const a of FULL) for (const b of FULL) {
    if (LOFT[a] < LOFT[b]) assert.ok(CLUB_RUN[a] > CLUB_RUN[b], `${a} (${LOFT[a]} deg) runs more than ${b} (${LOFT[b]} deg)`);
    if (SPIN_BACK_CAP[a] < SPIN_BACK_CAP[b]) assert.ok(CLUB_RUN[a] >= CLUB_RUN[b], `${a} spins less than ${b}`);
  }
  // the low-launch clubs run on, the wedges check up, the clubs T335 added sit between their neighbours
  for (const c of ['driver', 'wood3', 'wood5', 'hybrid'] as Club[]) assert.ok(CLUB_RUN[c] > 1, `${c} runs on`);
  for (const c of ['pw', 'gw', 'sw', 'lw'] as Club[]) assert.ok(CLUB_RUN[c] <= 0.45, `${c} checks`);
  assert.ok(CLUB_RUN.wood5 < CLUB_RUN.wood3 && CLUB_RUN.wood5 > CLUB_RUN.hybrid && CLUB_RUN.hybrid > CLUB_RUN.iron4 && CLUB_RUN.gw < CLUB_RUN.pw && CLUB_RUN.gw > CLUB_RUN.sw && CLUB_RUN.lw < CLUB_RUN.sw);
  assert.equal(CLUB_RUN.putter, 1);
  // real balls: a driver runs 8 to 12% of its carry on a fairway (8% x 1.3 = 10.4%), a sand wedge a couple of percent (2.4%)
  assert.ok(0.08 * CLUB_RUN.driver > 0.08 && 0.08 * CLUB_RUN.driver < 0.12 && 0.08 * CLUB_RUN.sw < 0.03);
});

test('hitShot: with conditions the roll after landing is the surface’s share of the flight times the club’s run; without them, or without the club’s run, it is the surface’s share alone, as before', () => {
  const env: ShotEnv = { lie: 'fairway' };
  for (const sk of [0.3, 0.8]) for (const c of FULL) {
    const none = ratio(c, 'fairway', sk), withEnv = ratio(c, 'fairway', sk, { env }), off = ratio(c, 'fairway', sk, { env, run: false });
    assert.ok(Math.abs(none - 0.08) < 1e-9, `${c}: no conditions, the fairway's 8%: ${none}`);
    assert.ok(Math.abs(withEnv - 0.08 * CLUB_RUN[c]) < 1e-9, `${c} at ${sk}: ${withEnv} against ${0.08 * CLUB_RUN[c]}`);
    assert.ok(Math.abs(off - 0.08) < 1e-9, `${c}: conditions without the club’s run (an input saved before it)`);
  }
  // on a green the surface rolls 3%: a wedge onto it checks, a long iron runs
  assert.ok(Math.abs(ratio('sw', 'green', 0.6, { env: { lie: 'green' } }) - 0.03 * 0.3) < 1e-9 && Math.abs(ratio('iron4', 'green', 0.6, { env: { lie: 'green' } }) - 0.03) < 1e-9);
  // the sand keeps none whatever the club (the club's run is a factor on the surface's share)
  assert.equal(ratio('driver', 'bunker', 0.6, { env: { lie: 'bunker' } }), 0);
  // an 80 m wedge rolled 6 m on a fairway before (8%) and 250 m of driver 20 m: now about 2 m and 26 m
  const wedge = ratio('sw', 'fairway', 1, { env }) * 80, drive = ratio('driver', 'fairway', 1, { env }) * 250;
  assert.ok(wedge > 1.8 && wedge < 2.1 && drive > 25 && drive < 27, `the wedge rolls ${wedge.toFixed(1)} m, the drive ${drive.toFixed(1)} m`);
});

test('the bag carries its own run: the clubs T335 added sit in the ranking (their own base character is replaced by it under conditions only), cards’ run factors multiply on top, and the bag card says it in words', () => {
  const sk = (mods?: GameSkills['mods']): GameSkills => ({ driving: 0.6, irons: 0.6, short: 0.6, putting: 0.6, ...(mods ? { mods } : {}) });
  for (const c of ['wood5', 'hybrid', 'gw', 'lw'] as Club[]) {
    const base = CLUB_BASE[c]!.roll!;
    assert.ok(Math.abs(ratio(c, 'fairway', sk()) - 0.08 * base) < 1e-9, `${c}: without conditions its T335 character, as before`);
    assert.ok(Math.abs(ratio(c, 'fairway', sk(), { env: { lie: 'fairway' } }) - 0.08 * CLUB_RUN[c]) < 1e-9, `${c}: with conditions the ranking's`);
    assert.ok(Math.abs(ratio(c, 'fairway', sk(), { env: { lie: 'fairway' }, run: false }) - 0.08 * base) < 1e-9, `${c}: conditions without the club’s run: its T335 character`);
  }
  // a card's factor multiplies the club's run, in or out of conditions
  const persimmon = sk([{ id: 'p', clubs: ['wood'], roll: 1.2 }]);
  assert.ok(Math.abs(ratio('driver', 'fairway', persimmon, { env: { lie: 'fairway' } }) - 0.08 * CLUB_RUN.driver * 1.2) < 1e-9 && Math.abs(ratio('driver', 'fairway', persimmon) - 0.08 * 1.2) < 1e-9);
  // the bag card: the run in words from the ranking (the woods run on, the 9-iron and the wedges land soft, the mid irons say nothing), and the number
  const v = bagView(null, { driving: 0.5, irons: 0.5, short: 0.5, putting: 0.5 }, { shop: true, money: 0 }), row = (c: Club) => v.rows.find(r => r.club === c)!;
  for (const c of ['driver', 'wood3', 'wood5'] as Club[]) assert.equal(row(c).runs, 'runs on', c);
  for (const c of ['iron4', 'iron6', 'iron8'] as Club[]) assert.equal(row(c).runs, null, c);
  for (const c of ['iron9', 'pw', 'gw', 'sw', 'lw'] as Club[]) assert.equal(row(c).runs, 'lands soft', c);
  assert.equal(row('driver').run, CLUB_RUN.driver); assert.equal(row('sw').run, CLUB_RUN.sw); assert.equal(row('putter').runs, null);
});

// ---- back-compat: conditions without the club's run play as they did ----
const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5], POND = [5, 12];
function segDist(p: Pt, a: Pt, b: Pt): number { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0; return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t); }
function course(): CourseView {
  const holes: PlayHole[] = PARS.map((par, h) => { const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y }; return { n: h + 1, par, tee, pin, line: [tee, pin] }; });
  const ponds = POND.map(h => ({ x: holes[h]!.tee.x + 100, y: holes[h]!.tee.y + 12.5 }));
  const lieAt = (x: number, y: number): Lie => {
    for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green';
    for (const q of ponds) if (Math.hypot(x - q.x, y - q.y) <= 7.5) return 'water';
    let d = Infinity; for (const h of holes) d = Math.min(d, segDist({ x, y }, h.tee, h.pin));
    return d <= 7.5 ? 'fairway' : d <= 40 ? 'rough' : 'out';
  };
  return { holes, lieAt };
}

test('back-compat: a shot with conditions but not the club’s run (an input saved before T346, a field’s day from before it) is the shot of T334: hitShot, a live group, a field round (golden values captured from the unchanged code)', () => {
  // hitShot with conditions and no club run: the clubs, lies and skills of T334's golden, a wind, the lie's kind and a slope (70 shots)
  const clubs: Club[] = ['driver', 'wood3', 'iron4', 'iron6', 'iron8', 'pw', 'sw'], lies: Lie[] = ['tee', 'fairway', 'rough', 'fescue', 'bunker'], g1: unknown[] = [];
  let n = 0;
  for (const club of clubs) for (const lie of lies) for (const sk of [0.3, 0.8]) {
    n++;
    const env: ShotEnv = { lie: lie === 'tee' ? 'tee' : lie === 'rough' && n % 4 === 0 ? 'firstcut' : lie, wind: { mph: 4 + (n % 9), from: (n * 47) % 360 }, slope: { up: ((n % 5) - 2) * 0.01, across: ((n % 7) - 3) * 0.01 } };
    const o = hitShot(rng(7, n, 11), sk, lie, { x: 0, y: 0 }, { x: 90, y: 4 }, club, flat('fairway'), { env, run: false });
    g1.push([club, lie, sk, r6(o.to.x), r6(o.to.y), o.lie, o.penalty, r6(o.landing.at.x), r6(o.landing.at.y), o.landing.lie]);
  }
  assert.equal(g1.length, 70); assert.equal(fnv(JSON.stringify(g1)), '659338f6', 'hitShot with conditions, no club run: T455 retuned the lies’ carries (the golden before: 24733958)');
  // a live group (the owner's, 18 holes) played with conditions in every input and no version: a tournament saved between T334 and T346
  const view = course(), field = makeField(3, 5), owner = field.find(g => !g.pro)!; owner.owner = true; owner.skill = 0.4;
  const groups = teeTimes(field, 5), gi = groups.findIndex(g => g.players.includes(owner.id));
  const play = (v?: number) => {
    const pl = playRound(view, field, groups, 5, { live: gi }), lg = new LiveGroup(pl, view, gi, 5);
    for (let k = 0; k < 200; k++) {
      const t = lg.advance(); if (!t) break;
      const sg = t.suggested, env: ShotEnv = { lie: k % 2 ? 'rough' : 'fairway', wind: { mph: 4 + k % 9, from: (k * 47) % 360 }, slope: { up: ((k % 5) - 2) * 0.01, across: ((k % 7) - 3) * 0.01 } };
      lg.play({ holeIdx: t.holeIdx, stroke: t.stroke, club: sg.club, aim: sg.aim, power: sg.power, ...(sg.club === 'putter' ? {} : { env }), ...(k % 3 === 0 ? { swing: { power: sg.power, acc: 0.03, boost: 0 } } : {}), ...(v ? { v } : {}) });
    }
    return { pl, lg };
  };
  const old = play(), old2 = play(2), now = play(MODEL_V);
  assert.equal(fnv(JSON.stringify(old.pl.shots)), '1a8e4b80', 'the live group with conditions and no version: the same shots'); assert.equal(old.lg.inputs.length, 90);
  assert.equal(fnv(JSON.stringify(old2.pl.shots)), '54037f2f', 'version 2 (the putting): the same shots, the club’s run came with 3');
  assert.notEqual(JSON.stringify(now.pl.shots), JSON.stringify(old.pl.shots), 'version 3 runs by club'); assert.equal(MODEL_V, 3);
  assert.deepEqual(old.lg.inputs.map(i => i.v), old.lg.inputs.map(() => undefined)); assert.deepEqual(old2.lg.inputs.map(i => i.v), old2.lg.inputs.map(() => 2)); assert.deepEqual(now.lg.inputs.map(i => i.v), now.lg.inputs.map(() => MODEL_V), 'each input keeps the version it was played under');
  // and the saved inputs replay to the same round, whatever the model's version is now (through JSON: what a save does)
  for (const a of [old, old2, now]) {
    const pb = playRound(view, field, groups, 5, { live: gi }), b = new LiveGroup(pb, view, gi, 5);
    b.replay(JSON.parse(JSON.stringify(a.lg.inputs)) as OwnerInput[]);
    assert.deepEqual(b.inputs, a.lg.inputs); assert.equal(JSON.stringify(pb.shots.filter(s => s.golfer === owner.id)), JSON.stringify(a.pl.shots.filter(s => s.golfer === owner.id)));
  }
  // the field's round with the day's conditions and no club run is the day of T334; with it the field's balls run by club
  const f = makeField(3, 3), gs = teeTimes(f, 3), cond = { wind: { mph: 9, from: 250, gusty: 0, seed: 2 } };
  const t334 = playRound(view, f, gs, 3, { cond: { ...cond, run: false } }), t346 = playRound(view, f, gs, 3, { cond }), t346b = playRound(view, f, gs, 3, { cond });
  assert.equal(t334.shots.length, 3857); assert.equal(fnv(JSON.stringify(t334.shots)), '38cac12e', 'the field’s day in conditions without the club’s run: the same shots');
  assert.equal(JSON.stringify(t346.shots), JSON.stringify(t346b.shots), 'deterministic'); assert.notEqual(JSON.stringify(t346.shots), JSON.stringify(t334.shots));
  assert.equal(fnv(JSON.stringify(playRound(view, f, gs, 3).shots)), '419b9662', 'and with no conditions at all, as before');
  // what it does to a field: the fairway drives roll 10% of their carry (8% x 1.3) where they rolled 8%, a short iron or wedge onto the green a good deal less
  const rollShare = (p: typeof t346, cs: Club[], pick: (s: typeof t346.shots[number]) => boolean): number => mean(p.shots.filter(s => cs.includes(s.club) && !s.penalty && s.landing && pick(s)).map(s => dist(s.landing!.at, s.landing!.rest) / Math.max(1e-9, dist(s.from, s.landing!.at))));
  const fw = (s: typeof t346.shots[number]) => s.landing!.lie === 'fairway' && s.landing!.restLie === 'fairway', gr = (s: typeof t346.shots[number]) => s.landing!.lie === 'green' && s.landing!.restLie === 'green';
  const dNew = rollShare(t346, ['driver'], fw), dOld = rollShare(t334, ['driver'], fw), wNew = rollShare(t346, ['sw', 'pw'], gr), wOld = rollShare(t334, ['sw', 'pw'], gr);
  assert.ok(Math.abs(dOld - 0.08) < 0.004 && Math.abs(dNew - 0.104) < 0.005, `the fairway drive rolled ${(100 * dOld).toFixed(1)}%, now ${(100 * dNew).toFixed(1)}%`);
  assert.ok(wNew < wOld * 0.55 && wOld > 0.025, `a wedge onto the green rolled ${(100 * wOld).toFixed(1)}%, now ${(100 * wNew).toFixed(1)}%`);
});

test('the version of an input is kept on a replay (a v2 input stays v2, one with none stays none, v3 stays v3) and read for the club’s run: below 3 the shot has conditions and no run by club', () => {
  const view = course(), seed = 12, field = makeField(3, seed), owner = field.find(g => !g.pro)!; owner.owner = true; owner.skill = 0.4;
  const groups = teeTimes(field, seed), gi = groups.findIndex(g => g.players.includes(owner.id)), mk = () => { const pl = playRound(view, field, groups, seed, { live: gi }); return { pl, lg: new LiveGroup(pl, view, gi, seed) }; };
  const a = mk(), t = a.lg.advance()!, env: ShotEnv = { lie: 'tee' }, base = { holeIdx: t.holeIdx, stroke: t.stroke, club: 'driver' as Club, aim: t.suggested.aim, power: 1, env };
  const s0 = a.lg.play({ ...base }), b = mk(); b.lg.advance(); const s2 = b.lg.play({ ...base, v: 2 }), c = mk(); c.lg.advance(); const s3 = c.lg.play({ ...base, v: 3 }), d = mk(); d.lg.advance(); const s99 = d.lg.play({ ...base, v: 99 });
  assert.equal(a.lg.inputs[0]!.v, undefined); assert.equal(b.lg.inputs[0]!.v, 2); assert.equal(c.lg.inputs[0]!.v, 3); assert.equal(d.lg.inputs[0]!.v, MODEL_V, 'a version from the future is held to this model’s');
  assert.deepEqual(s2.landing, s0.landing, 'v2: the same ball as no version (T334)'); assert.ok(dist(s3.landing!.at, s3.landing!.rest) > dist(s0.landing!.at, s0.landing!.rest) * 1.2, 'v3: the driver runs 30% more');
  assert.deepEqual(s99.landing, s3.landing);
});

test('the club run gate: a new game has it from its first tournament; a save from before it gets it from the next tournament (a day in progress and every day before play as they did); a save that has it keeps it', () => {
  const fresh: { runFrom?: number } = {};
  assert.equal(runOn(fresh, 0), true); assert.equal(fresh.runFrom, 0, 'a new game is stamped by its first look: it keeps the club run through every save');
  // an old save with the tournament day under way (three rounds done): the day in progress is key 3 and plays as it did; the next is key 4
  const mid: { runFrom?: number } = {}; stampRun(mid, 3, true);
  assert.equal(mid.runFrom, 4); assert.equal(runOn(mid, 3), false, 'the day in progress plays as it did'); assert.equal(runOn(mid, 2), false); assert.equal(runOn(mid, 4), true);
  // an old save between tournaments: the next tournament is key 3 and has it
  const idle: { runFrom?: number } = {}; stampRun(idle, 3, false);
  assert.equal(idle.runFrom, 3); assert.equal(runOn(idle, 2), false); assert.equal(runOn(idle, 3), true);
  // a save that has it keeps it
  const kept = { runFrom: 9 }; stampRun(kept, 1, false); assert.equal(kept.runFrom, 9);
  // a save from T334 (it has the weather and no club run) is stamped on load as one from before the weather was: the weather's own gate is not touched
  const t334: { weather?: { from: number }; runFrom?: number } = { weather: { from: 2 } }; stampRun(t334, 5, true);
  assert.equal(t334.runFrom, 6); assert.deepEqual(t334.weather, { from: 2 });
  // it goes through a save and a load (normalizeGolfSave keeps it, whole and not negative)
  const base = { town: { x: 1, y: 1 }, course: [0, 0, 9, 9], clubhouse: { x: 1, y: 1 } };
  assert.equal(normalizeGolfSave({ ...base, runFrom: 5.7 } as never)!.runFrom, 5); assert.equal(normalizeGolfSave({ ...base, runFrom: 0 } as never)!.runFrom, 0);
  assert.equal(normalizeGolfSave({ ...base, runFrom: -1 } as never)!.runFrom, undefined); assert.equal(normalizeGolfSave({ ...base, runFrom: 'x' } as never)!.runFrom, undefined); assert.equal(normalizeGolfSave(base as never)!.runFrom, undefined);
});

// The owner's play (docs/GOLF-PLAY.md decision 7, P4b; src/game/golf/play/owner.ts, mode.ts): the clubs he may take from a lie (allowedClubs), the power a club
// starts at (powerFor, the engine's reset when he picks a club), the join's tee times (he is in the first group, at the first tee), the save round-trip (his
// inputs and the caddie replayed from a fresh plan give the same round), the caddie's play as the full round's, and the save's shape (normalizeGolfSave keeps
// a well-formed play and drops a bad one). On the synthetic 18-hole course of golf-play-live.test.ts. Pure TS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_TEE } from '../src/game/golf/calendar';
import { normalizeGolfSave } from '../src/game/golf/mode';
import type { GolfPlaySave } from '../src/game/golf/mode';
import { TILE_M } from '../src/game/golf/types';
import { LiveGroup, POWER, PUTT_POWER, allowedClubs, carryM, makeField, ownerGolfer, playRound, powerFor, startOwner, teeTimes } from '../src/game/golf/play';
import type { Club, CourseView, Lie, OwnerInput, OwnerTurn, PlayHole, Pt } from '../src/game/golf/play';

/** the pars of the 18 holes, in play order: three 3s, eleven 4s, four 5s */
const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5];
/** the holes (0-based) with a pond beside the line */
const POND = [5, 12];

/** the distance (tiles) from p to the segment a-b */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/** the synthetic course: each hole on its own row 120 m apart, the tee at x = 10 tiles, the pin straight along the row; greens, a fairway strip along each
 *  line, a pond beside two holes, rough within 40 tiles of a line, and out of bounds beyond */
function course(): CourseView {
  const holes: PlayHole[] = PARS.map((par, h) => {
    const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y };
    return { n: h + 1, par, tee, pin, line: [tee, pin] };
  });
  const ponds = POND.map(h => ({ x: holes[h]!.tee.x + 100, y: holes[h]!.tee.y + 12.5 }));
  const lieAt = (x: number, y: number): Lie => {
    for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green';
    for (const q of ponds) if (Math.hypot(x - q.x, y - q.y) <= 7.5) return 'water';
    let d = Infinity;
    for (const h of holes) d = Math.min(d, segDist({ x, y }, h.tee, h.pin));
    return d <= 7.5 ? 'fairway' : d <= 40 ? 'rough' : 'out';
  };
  return { holes, lieAt };
}

/** the owner's world, as the engine builds his play: a tier-3 field with the owner added as the next id (his sex m), its tee times and his group's index */
function ownerWorld(seed: number) {
  const view = course(), field = makeField(3, seed), id = field.length, golfers = [...field, ownerGolfer(id, 'm')];
  const groups = teeTimes(golfers, seed), li = groups.findIndex(g => g.players.includes(id));
  return { view, seed, golfers, groups, li, id };
}
type World = ReturnType<typeof ownerWorld>;

/** the input that plays a turn as the model suggests it */
const suggest = (t: OwnerTurn): OwnerInput => ({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: { x: t.suggested.aim.x, y: t.suggested.aim.y }, power: t.suggested.power });

/** a varied input for the k-th turn: the suggested club and aim moved a little, the power moved within its range, and a 3-wood instead on every third turn
 *  where the lie allows one (never a putt) */
function varied(t: OwnerTurn, k: number): OwnerInput {
  const s = suggest(t), putting = s.club === 'putter', r = putting ? PUTT_POWER : POWER;
  const club: Club = k % 3 === 1 && !putting && allowedClubs(t.lie, t.lie === 'tee').includes('wood3') ? 'wood3' : s.club;
  const power = Math.min(r[1]!, Math.max(r[0]!, s.power * (k % 2 ? 0.9 : 1.1)));
  return { ...s, club, power, aim: { x: s.aim.x + (k % 4) * 0.7, y: s.aim.y - (k % 2) * 0.5 } };
}

/** plays the owner's group on a fresh plan: pick(turn, k) gives each turn's input, or 'caddie' to hand the rest of the round to the model. Returns the plan,
 *  the inputs as the save keeps them (JSON), the caddie count (null: he played on) and the turn after the last (null when the group is done) */
function playAs(w: World, pick: (t: OwnerTurn, k: number) => OwnerInput | 'caddie') {
  const plan = playRound(w.view, w.golfers, w.groups, w.seed, { live: w.li });
  const live = new LiveGroup(plan, w.view, w.li, w.seed);
  let t = live.advance(), k = 0, caddie: number | null = null;
  while (t) {
    const c = pick(t, k++);
    if (c === 'caddie') { caddie = live.inputs.length; live.caddie(); t = live.advance(); break; }
    live.play(c); t = live.advance();
  }
  return { plan, inputs: JSON.parse(JSON.stringify(live.inputs)) as OwnerInput[], caddie, last: t };
}

/** the same owner's group from the save: a fresh plan of the same seed, the inputs replayed and the caddie applied (startOwner, as the engine rebuilds it) */
function replayOf(w: World, inputs: OwnerInput[], caddie: number | null) {
  const plan = playRound(w.view, w.golfers, w.groups, w.seed, { live: w.li });
  const { turn } = startOwner(plan, w.view, w.li, w.seed, inputs, caddie);
  return { plan, turn };
}

test('allowedClubs: the driver only from the tee, the putter only on the green, the other clubs any time', () => {
  assert.ok(allowedClubs('tee', true).includes('driver'));
  assert.ok(!allowedClubs('tee', false).includes('driver'), 'no driver off the tee shot');
  assert.ok(!allowedClubs('fairway', false).includes('driver'));
  assert.ok(!allowedClubs('tee', true).includes('putter'), 'no putter from the tee');
  assert.ok(!allowedClubs('fairway', false).includes('putter'), 'no putter off the green');
  assert.ok(allowedClubs('green', false).includes('putter'));
  assert.ok(!allowedClubs('green', false).includes('driver'));
  for (const lie of ['tee', 'fairway', 'rough', 'fescue', 'bunker', 'green'] as Lie[]) {
    const c = allowedClubs(lie, lie === 'tee');
    for (const k of ['wood3', 'iron4', 'iron6', 'iron8', 'pw', 'sw'] as Club[]) assert.ok(c.includes(k), `${k} from ${lie}`);
  }
  assert.deepEqual(allowedClubs('fairway', false), ['wood3', 'iron4', 'iron6', 'iron8', 'pw', 'sw']);
});

test('powerFor: the power that carries a club to the distance, 30% to 100% of its carry; the putter starts at 100%', () => {
  assert.ok(Math.abs(powerFor('driver', 100, 0.4) - 100 / carryM('driver', 0.4)) < 1e-9);
  assert.equal(powerFor('driver', 1000, 0.4), POWER[1]);
  assert.equal(powerFor('sw', 1, 0.4), POWER[0]);
  assert.equal(powerFor('putter', 20, 0.4), 1);
  const p = powerFor('iron8', 90, 0.6);
  assert.ok(p > POWER[0]! && p < POWER[1]!, `iron8 at 90 m: ${p}`);
  assert.ok(Math.abs(carryM('iron8', 0.6) * p - 90) < 1e-9, 'the club carries the distance at that power');
});

test('joining: with the owner added, he is in the first group, which tees off at the first tee, for every tier and several seeds', () => {
  for (const tier of [1, 2, 3, 4, 5]) for (const seed of [1, 7, 42]) {
    const field = makeField(tier, seed), id = field.length, golfers = [...field, ownerGolfer(id, 'w')];
    const gs = teeTimes(golfers, seed);
    assert.equal(gs[0]!.tee, FIRST_TEE, `tier ${tier} seed ${seed}: the first tee`);
    assert.ok(gs[0]!.players.includes(id), `tier ${tier} seed ${seed}: the owner in the first group`);
    assert.deepEqual(gs.flatMap(g => g.players).sort((a, b) => a - b), golfers.map(g => g.id).sort((a, b) => a - b), 'every golfer in one group');
  }
});

test('a fresh owner play: his first turn is the first hole\'s tee shot at the first tee, with the model\'s suggestion', () => {
  const w = ownerWorld(3), plan = playRound(w.view, w.golfers, w.groups, w.seed, { live: w.li });
  const { turn } = startOwner(plan, w.view, w.li, w.seed, [], null);
  assert.ok(turn, 'a first turn');
  assert.equal(turn.golfer, w.id);
  assert.equal(turn.holeIdx, 0);
  assert.equal(turn.stroke, 1);
  assert.equal(turn.t, FIRST_TEE);
  assert.equal(turn.lie, 'tee');
  assert.ok(allowedClubs(turn.lie, true).includes(turn.suggested.club));
});

test('the save round-trip: his inputs and the caddie, replayed from a fresh plan, give the same round as the play they came from', () => {
  for (const seed of [3, 11]) {
    const w = ownerWorld(seed);
    const played = playAs(w, (t, k) => (k === 6 ? 'caddie' : varied(t, k)));
    assert.equal(played.caddie, 6, 'six inputs before the caddie');
    assert.equal(played.inputs.length, 6);
    assert.equal(played.last, null, 'the group is done once the caddie finishes it');
    const again = replayOf(w, played.inputs, played.caddie);
    assert.equal(again.turn, null);
    assert.deepEqual(again.plan.shots, played.plan.shots, `seed ${seed}: the shots`);
    assert.deepEqual(again.plan.strokes, played.plan.strokes, `seed ${seed}: the strokes`);
    assert.deepEqual(again.plan.done, played.plan.done, `seed ${seed}: the done minutes`);
  }
});

test('the save round-trip with no caddie: every turn played by his inputs replays to the same round, shot for shot', () => {
  const w = ownerWorld(5);
  const played = playAs(w, (t, k) => varied(t, k));
  assert.equal(played.caddie, null);
  assert.equal(played.last, null);
  const owner = played.plan.shots.filter(s => s.golfer === w.id);
  assert.equal(owner.length, played.inputs.length, 'one shot per input');
  owner.forEach((s, k) => { assert.equal(s.club, played.inputs[k]!.club, `shot ${k + 1} club`); assert.equal(s.stroke, played.inputs[k]!.stroke, `shot ${k + 1} stroke`); });
  const again = replayOf(w, played.inputs, null);
  assert.deepEqual(again.plan.shots, played.plan.shots);
  assert.deepEqual(again.plan.strokes, played.plan.strokes);
});

test('every suggestion is a club his lie allows, and its power is the reset powerFor gives for its aim (the engine\'s reset agrees with the model)', () => {
  const w = ownerWorld(9);
  let n = 0;
  playAs(w, t => {
    n++;
    assert.ok(allowedClubs(t.lie, t.lie === 'tee').includes(t.suggested.club), `turn ${n}: ${t.suggested.club} from ${t.lie}`);
    const d = Math.hypot(t.suggested.aim.x - t.ball.x, t.suggested.aim.y - t.ball.y) * TILE_M;
    assert.ok(Math.abs(powerFor(t.suggested.club, d, 0.4) - t.suggested.power) < 1e-9, `turn ${n}: power ${t.suggested.power} for ${t.suggested.club} at ${d.toFixed(1)} m`);
    return suggest(t);
  });
  assert.ok(n > 18, `a round of turns (${n})`);
});

test('a caddie from the first turn plays the owner\'s group as the full round does (the same shots and strokes for its golfers)', () => {
  const w = ownerWorld(9);
  const full = playRound(w.view, w.golfers, w.groups, w.seed);
  const plan = playRound(w.view, w.golfers, w.groups, w.seed, { live: w.li });
  const { turn } = startOwner(plan, w.view, w.li, w.seed, [], 0);
  assert.equal(turn, null, 'the caddie finishes the group at once');
  const ids = new Set(w.groups[w.li]!.players);
  assert.deepEqual(plan.shots.filter(s => ids.has(s.golfer)), full.shots.filter(s => ids.has(s.golfer)));
  for (const id of ids) assert.deepEqual(plan.strokes[id], full.strokes[id], `golfer ${id}`);
});

test('the save: a well-formed owner play is kept, a malformed one is dropped, a missing caddie count is null', () => {
  const base = { town: { x: 1, y: 1 }, course: [0, 0, 10, 10] as [number, number, number, number], clubhouse: { x: 2, y: 2 } };
  const inputs: OwnerInput[] = [{ holeIdx: 0, stroke: 1, club: 'driver', aim: { x: 1, y: 2 }, power: 0.8 }];
  const ok = normalizeGolfSave({ ...base, play: { key: 2, owner: 'w', inputs, caddie: 3 } });
  assert.deepEqual(ok?.play, { key: 2, owner: 'w', inputs, caddie: 3 });
  const noCaddie = normalizeGolfSave({ ...base, play: { key: 2, owner: 'm', inputs } as unknown as GolfPlaySave });
  assert.equal(noCaddie?.play?.caddie, null);
  assert.equal(normalizeGolfSave({ ...base, play: { key: 2, owner: 'x', inputs, caddie: null } as unknown as GolfPlaySave })?.play, undefined, 'a bad sex');
  assert.equal(normalizeGolfSave({ ...base, play: { key: NaN, owner: 'm', inputs, caddie: null } })?.play, undefined, 'a bad key');
  assert.equal(normalizeGolfSave({ ...base, play: { key: 2, owner: 'm', inputs: 'x', caddie: null } as unknown as GolfPlaySave })?.play, undefined, 'bad inputs');
  assert.equal(normalizeGolfSave({ ...base })?.play, undefined, 'no play');
});

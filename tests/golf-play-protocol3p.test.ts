// T439 (docs/CINDERLINKS-PORT.md, tests): the messages between the game and the view, encoded and decoded, and the shot sampler.
// - Every message a real session sends (the course of an exported course, turns, strokes, holes' ends, actors and the board of a three-ball, a match's
//   messages) survives JSON as postMessage carries it, is known for a host message of this version, and reads back the same; a view message likewise;
//   another version or an unknown type is refused.
// - The view's frame: tile points round-trip through toView and fromView.
// - The sampler: each stroke's flight starts at the ball and ends on its landing, its times rise; the roll starts at the landing, its times carry on from
//   the flight's and its last point is the rest; a putt rolls from the ball to its rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GameSkills, Golfer, Group } from '../src/game/golf/play';
import { fieldEntourage, makeField } from '../src/game/golf/play';
import { PROTOCOL_V, fromView, isHostMsg, isViewMsg, toView, type HostMsg, type ShotMsg, type TurnMsg, type ViewInput, type ViewMsg } from '../src/game/golf/play/protocol3p';
import { Play3p } from '../src/game/golf/play/play3p';
import { scriptCourse, scriptedHost } from '../src/game/golf/play/hostscript3p';
import { shareOf, shareView } from '../src/game/golf/play/share3p';
import { exportCourse3p } from '../src/game/golf/play/export3p';

const sk: GameSkills = { driving: 0.7, irons: 0.7, short: 0.7, putting: 0.7 };
const answer = (t: TurnMsg): ViewInput => ({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power });
const wire = <T>(m: T): T => JSON.parse(JSON.stringify(m)) as T;   // (postMessage's structured clone keeps no more than JSON does here)

/** a real session's messages: the scripted host's course and three holes, by the model's suggested shots */
async function session(): Promise<HostMsg[]> {
  const h = await scriptedHost(sk, 77), all: HostMsg[] = [h.courseMsg]; let ms = h.start();
  for (let k = 0; k < 80; k++) { all.push(...ms); const t = ms.filter((m): m is TurnMsg => m.t === 'turn').pop(); if (!t) break; ms = h.input(answer(t)); }
  return all;
}

test('every message of a real session survives the wire and reads back the same', async () => {
  const all = await session(), kinds = new Set<string>();
  for (const m of all) { const w = wire(m); assert.ok(isHostMsg(w), `${m.t} is a host message`); assert.ok(!isViewMsg(w), `${m.t} is not a view message`); assert.deepEqual(w, m, `${m.t} reads back the same`); kinds.add(m.t); }
  for (const k of ['course', 'turn', 'shot', 'holeEnd']) assert.ok(kinds.has(k), `the session sent a ${k}`);
  // a three-ball with the field: actors and the board too
  const owner: Golfer = { id: 0, name: 'You', sex: 'm', pro: false, skill: 0.6, look: 0, owner: true };
  const f = makeField(1, 3).slice(0, 5).map((g, i) => ({ ...g, id: i + 1 })), groups: Group[] = [{ tee: 480, players: [0, 1, 2] }, { tee: 488, players: [3, 4, 5] }];
  fieldEntourage([owner, ...f], groups, 1);
  const sv = await shareView(shareOf(await exportCourse3p(scriptCourse()), null, { name: 'x', biome: 'parkland', type: 'private', seed: 1 }));
  const p = new Play3p({ view: sv.view, holes: [0], skills: sk, sex: 'm', seed: 3, frame: sv.frame, company: { golfers: f, groups } });
  const ms = p.start(), more = new Set(ms.map(m => m.t));
  assert.ok(more.has('actors') && more.has('board'));
  for (const m of ms) assert.deepEqual(wire(m), m);
});

test('a view message survives the wire; another version or an unknown type is refused', () => {
  const vm: ViewMsg[] = [{ v: 1, t: 'ready' }, { v: 1, t: 'loaded', holes: 3 }, { v: 1, t: 'input', input: { holeIdx: 0, stroke: 1, club: 'driver', aim: [10.5, -3.25], power: 0.8 } },
    { v: 1, t: 'gimme', holeIdx: 0, stroke: 3 }, { v: 1, t: 'exit', why: 'esc' }, { v: 1, t: 'sound', k: 'strike', club: 'driver', p: 0.8 }, { v: 1, t: 'sound', k: 'cup', drop: false }];
  for (const m of vm) { const w = wire(m); assert.ok(isViewMsg(w)); assert.ok(!isHostMsg(w)); assert.deepEqual(w, m); }
  assert.ok(!isHostMsg({ v: PROTOCOL_V + 1, t: 'turn' }), 'another version');
  assert.ok(!isHostMsg({ v: PROTOCOL_V, t: 'teleport' }), 'an unknown type');
  assert.ok(!isViewMsg(null) && !isViewMsg('ready') && !isViewMsg({ t: 'ready' }), 'not a message');
});

test('the view\'s frame: tile points round-trip', () => {
  const c = { x: 1024, y: 990 };
  for (let k = 0; k < 200; k++) { const p = { x: 400 + ((k * 37) % 900) + k / 7, y: 300 + ((k * 53) % 800) - k / 3 }, b = fromView(toView(p, c), c); assert.ok(Math.hypot(b.x - p.x, b.y - p.y) < 1e-9); }
});

test('the sampler: flights start at the ball and land, times rise; rolls carry on to the rest', async () => {
  const all = await session(), shots = all.filter((m): m is ShotMsg => m.t === 'shot');
  assert.ok(shots.length >= 9);
  const near = (a: readonly number[], b: readonly number[], e: number) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!) < e;
  for (const s of shots) {
    if (s.flight.length) {
      assert.ok(near(s.flight[0]!, s.from, 0.05), 'the flight starts at the ball'); assert.ok(s.flight[0]![2] < 0.05, 'from the ground');
      assert.equal(s.flightT!.length, s.flight.length);
      for (let i = 1; i < s.flightT!.length; i++) assert.ok(s.flightT![i]! > s.flightT![i - 1]!, 'the flight\'s times rise');
      assert.ok(s.flight.every(p => p[2] >= 0), 'never below the ground');
      if (s.roll.length) {
        assert.equal(s.rollT!.length, s.roll.length);
        assert.ok(s.rollT![0]! >= s.flightT![s.flightT!.length - 1]!, 'the roll comes after the flight');
        for (let i = 1; i < s.rollT!.length; i++) assert.ok(s.rollT![i]! >= s.rollT![i - 1]!, 'the roll\'s times rise');
      }
    } else assert.equal(s.club, 'putter', 'only a putt has no flight');
    const end = s.roll.length ? s.roll[s.roll.length - 1]! : s.flight.length ? s.flight[s.flight.length - 1]! : s.from;
    if (!s.penalty) assert.ok(near(end, s.rest, 0.05), `stroke ${s.stroke} of hole ${s.hole} ends at its rest`);
  }
});

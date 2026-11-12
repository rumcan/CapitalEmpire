// T425 to T427 (docs/CINDERLINKS-PORT.md): the owner's group and the field in the view from behind the golfer, as the host sends them
// (src/game/golf/play/play3p.ts with company, actors3p.ts, round.ts' honour). On two synthetic par 4s with a cart path beside each:
// - the order of play is the model's: the farthest from the pin first, and on the second tee the honour (the lowest score on the first);
// - a three-ball plays the hole through Play3p: only his group's strokes are played back, each after an actors list of just before it, and every
//   batch ends with who is where and the board before his turn;
// - his partners ride a cart that keeps to the path while it drives and parks by the green; a long putt has the flag tended;
// - the rest of the field travels as actors, and the board lists the leaders with his row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { CartPlay, cartPaths, fieldEntourage, makeField, nearestOnPaths, playRound } from '../src/game/golf/play';
import type { CartPaths, CourseView, GameSkills, Golfer, Group, Lie, PlayHole, Pt, Shot } from '../src/game/golf/play';
import { fromView, type ActorsMsg, type BoardMsg, type HostMsg, type ShotMsg, type TurnMsg, type ViewInput } from '../src/game/golf/play/protocol3p';
import { OWNER_3P, Play3p } from '../src/game/golf/play/play3p';
import { CART_ID, TEND_TILES, actorsMsg } from '../src/game/golf/play/actors3p';

const centre: Pt = { x: 200, y: 160 };
const holes: PlayHole[] = [100, 220].map((y, i) => ({ n: i + 1, par: 4 as const, tee: { x: 100, y }, pin: { x: 300, y }, line: [{ x: 100, y }, { x: 300, y }] }));
const view: CourseView = {
  holes,
  lieAt: (x, y): Lie => {
    for (const h of holes) {
      if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 8) return 'green';
      if (Math.abs(y - h.tee.y) <= 10 && x >= 98 && x <= 310) return x <= 102 && Math.abs(y - h.tee.y) < 2 ? 'tee' : 'fairway';
    }
    return 'rough';
  },
};
/** a cart path 16 tiles beside each hole, from behind the tee to past the green, the two joined behind the tees */
const paths: CartPaths = cartPaths([
  { a: { x: 85, y: 116 }, b: { x: 315, y: 116 } }, { a: { x: 85, y: 236 }, b: { x: 315, y: 236 } }, { a: { x: 85, y: 116 }, b: { x: 85, y: 236 } },
]);
const sk: GameSkills = { driving: 0.7, irons: 0.7, short: 0.7, putting: 0.7 };

/** his partners and a field: tier 1 amateurs (who ride, two to a cart), renumbered from 1 (0 is the owner); his group first (him and two), then groups of three */
function company(n: number, seed: number): { golfers: Golfer[]; groups: Group[] } {
  const golfers = makeField(1, seed).slice(0, n).map((g, i) => ({ ...g, id: i + 1, pro: false }));
  const groups: Group[] = [{ tee: 480, players: [OWNER_3P, 1, 2] }];
  for (let k = 3, t = 488; k <= n; k += 3, t += 8) groups.push({ tee: t, players: [k, k + 1, k + 2].filter(id => id <= n) });
  const owner: Golfer = { id: OWNER_3P, name: 'You', sex: 'm', pro: false, skill: 0.6, look: 0, owner: true };
  fieldEntourage([owner, ...golfers], groups, 1);
  return { golfers, groups };
}
const answer = (t: TurnMsg): ViewInput => ({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power });
/** a whole session played by the suggested shots: every message in order */
function playAll(p: Play3p): HostMsg[] {
  const all: HostMsg[] = [];
  let ms = p.start();
  for (let k = 0; k < 40; k++) {
    all.push(...ms);
    const t = ms.filter((m): m is TurnMsg => m.t === 'turn').pop(); if (!t) break;
    ms = p.input(answer(t));
  }
  return all;
}

test('the order of play: the farthest from the pin first; on the next tee the honour', () => {
  const co = company(8, 21), owner: Golfer = { id: 0, name: 'You', sex: 'm', pro: false, skill: 0.6, look: 0 }, plan = playRound(view, [owner, ...co.golfers], co.groups, 21, { honour: true });
  let honours = 0;
  for (const gr of co.groups) {
    for (let h = 0; h < holes.length; h++) {
      const pin = holes[h]!.pin, shots = plan.shots.filter(s => s.hole === h && gr.players.includes(s.golfer)).sort((a, b) => a.t - b.t);
      const ball = new Map<number, Pt>(), done = new Set<number>();
      for (const s of shots) {
        if (s.stroke > 1) {   // he is the farthest out of those whose balls are down
          const d = Math.hypot(s.from.x - pin.x, s.from.y - pin.y);
          for (const [id, b] of ball) if (id !== s.golfer && !done.has(id)) assert.ok(Math.hypot(b.x - pin.x, b.y - pin.y) <= d + 1e-9, `hole ${h + 1}: ${s.golfer} plays before the farther ${id}`);
        }
        ball.set(s.golfer, s.to); if (s.holed) done.add(s.golfer);
      }
      if (h > 0) {   // the tee: the order of the scores on the hole before (ties: that hole's order)
        const tee = shots.filter(s => s.stroke === 1).map(s => s.golfer), prev = (id: number) => plan.strokes[id]![h - 1]!;
        for (let i = 1; i < tee.length; i++) assert.ok(prev(tee[i - 1]!) <= prev(tee[i]!), `hole ${h + 1}: ${tee.join(',')} tee off in the order of their scores`);
        if (new Set(tee.map(prev)).size > 1) honours++;
      }
    }
  }
  assert.ok(honours > 0, 'some group had an honour to give');
});

test('a three-ball plays a hole through Play3p: his group\'s strokes in order, each after who is where; then the board and his turn', () => {
  const co = company(8, 5), p = new Play3p({ view, holes: [0], skills: sk, sex: 'm', seed: 5, frame: centre, company: co, paths, home: { x: 90, y: 100 } });
  const all = playAll(p), group = new Set(co.groups[0]!.players);
  const shots = all.filter((m): m is ShotMsg => m.t === 'shot');
  assert.ok(shots.length >= 9, 'three golfers hole out');
  for (const s of shots) assert.ok(group.has(s.golfer), 'only his group\'s strokes are played back');
  for (let i = 1; i < shots.length; i++) assert.ok(shots[i]!.at >= shots[i - 1]!.at, 'in time order');
  assert.ok(new Set(shots.map(s => s.golfer)).size === 3, 'all three play');
  all.forEach((m, i) => { if (m.t === 'shot') { const a = all[i - 1] as ActorsMsg; assert.equal(a.t, 'actors'); assert.ok(a.at <= m.at && m.at - a.at < 0.01, 'the list of just before the stroke'); } });
  all.forEach((m, i) => { if (m.t === 'turn') { assert.equal(all[i - 1]!.t, 'board'); assert.equal(all[i - 2]!.t, 'actors'); } });
  // the field (the other groups) travels as actors: someone of another group is on the course in the lists
  const others = new Set<number>(); for (const m of all) if (m.t === 'actors') for (const a of m.actors) if (a.role === 'golfer' && !group.has(a.id)) others.add(a.id);
  assert.ok(others.size >= 3, 'the groups behind are in the lists');
  // the board: the leaders, and his row
  const b = all.filter((m): m is BoardMsg => m.t === 'board').pop()!;
  assert.ok(b.rows.length >= 3 && b.rows.some(r => r.owner && r.name === 'You'), 'the board has his row');
});

test('his partners\' cart keeps to the path while it drives and parks by the green; a long putt has the flag tended', () => {
  const co = company(8, 9), p = new Play3p({ view, holes: [0], skills: sk, sex: 'm', seed: 9, frame: centre, company: co, paths, home: { x: 90, y: 100 } });
  const all = playAll(p), cartId = CART_ID + co.golfers.find(g => g.id === 1)!.cart!;
  assert.ok(p.carts, 'his partners ride');
  // the cart over the hole, at many minutes (actors3p reads the same CartPlay the view's lists come from)
  const end = Math.max(...p.plan.shots.filter(s => s.golfer === 1 || s.golfer === 2).map(s => s.t)), pin = holes[0]!.pin;
  let onPath = 0, moved = 0, parkedNear = Infinity, prev: Pt | null = null;
  for (let m = 480; m <= end; m += 0.25) {
    const a = p.actors(m).actors.find(x => x.id === cartId); if (!a) continue;
    const q = fromView(a.at, centre);
    if (prev && Math.hypot(q.x - prev.x, q.y - prev.y) > 0.5) { moved++; const o = nearestOnPaths(paths, q.x, q.y); if (o && o.d < 3) onPath++; }
    if (a.riders!.length === 0) parkedNear = Math.min(parkedNear, Math.hypot(q.x - pin.x, q.y - pin.y));
    prev = q;
  }
  assert.ok(moved > 3, `the cart drives (${moved})`);
  assert.ok(onPath / moved > 0.8, `on the path while it drives (${onPath} of ${moved})`);
  assert.ok(parkedNear * TILE_M < 60, `parked by the green while they putt (${(parkedNear * TILE_M).toFixed(0)} m from the pin)`);
  // the flag: some putt from beyond TEND_TILES has a tender at the pin
  let tended = 0;
  for (const s of p.plan.shots.filter(s => s.club === 'putter' && Math.hypot(s.from.x - pin.x, s.from.y - pin.y) > TEND_TILES && s.golfer !== OWNER_3P)) {
    const t = actorsMsg({ plan: p.plan, view: p.view, minute: s.t - 0.05, carts: p.carts }, centre).actors.find(a => a.tend);
    if (!t) continue;
    const q = fromView(t.at, centre); assert.ok(Math.hypot(q.x - pin.x, q.y - pin.y) < 1, 'the tender stands at the pin'); tended++;
  }
  assert.ok(tended > 0 || !p.plan.shots.some(s => s.club === 'putter' && Math.hypot(s.from.x - pin.x, s.from.y - pin.y) > TEND_TILES && s.golfer !== OWNER_3P), 'a long putt has the flag tended');
  void all; void (null as unknown as Shot); void CartPlay;
});

test('alone, a session sends what it sent before: no actors and no board', () => {
  const p = new Play3p({ view, holes: [0], skills: sk, sex: 'm', seed: 3, frame: centre });
  const all = playAll(p);
  assert.ok(!all.some(m => m.t === 'actors' || m.t === 'board'));
});

// T240 (#704; the owner, 2026-11-03: "walk around the world like in a point and click adventure game", "the player must walk with the keys"):
// your character (src/game/golf/you.ts): the route round what blocks and along the paths, the walk at a person's pace and the run, Skip, the keys
// (camera-relative, sliding along a wall), the verbs a click resolves to, the door of a building, and the save (golf/player.ts PlayerProfile.you).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKIP_TILES, YOU_RUN, YOU_WALK, doorOf, hoverText, keyDir, keyStep, lookSex, makeYou, normalizeYou, remaining, routeOf, skipAhead, standInText, startWalk, stepYou, talkSpot, verbOf, youFrame } from '../src/game/golf/you';
import { normalizePlayer, startProfile } from '../src/game/golf/player';

/** a wall at x 10..12 from y 0 to 30 (a building, a fence) with open ground elsewhere; a path (cheap) along y 40 */
const wall = (x: number, y: number) => (x >= 10 && x < 12 && y < 30 ? Infinity : y >= 39.5 && y < 40.5 ? 0.6 : 1);
const blocked = (pts: { x: number; y: number }[], cost: (x: number, y: number) => number) => {
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1]!, b = pts[i]!, n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4); for (let k = 0; k <= n; k++) if (!Number.isFinite(cost(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n))) return true; }
  return false;
};

test('the route goes round a wall, never through it, and ends on the target', () => {
  const r = routeOf({ x: 4, y: 10 }, { x: 18, y: 10 }, wall);
  assert.deepEqual(r[0], { x: 4, y: 10 }); assert.deepEqual(r[r.length - 1], { x: 18, y: 10 });
  assert.ok(!blocked(r, wall), 'the route crosses the wall');
  assert.ok(Math.max(...r.map(p => p.y)) >= 30, 'it goes round the wall\'s end');
});

test('the route keeps to a cheap path where it costs little more distance', () => {
  const pathy = (x: number, y: number) => (y >= 19 && y <= 21 ? 0.4 : 1);
  const r = routeOf({ x: 0, y: 18 }, { x: 60, y: 18 }, pathy);
  const mid = r.filter(p => p.x > 10 && p.x < 50);
  assert.ok(mid.length === 0 || mid.every(p => p.y >= 18.5), 'the route walks the path rather than the grass beside it');
});

test('you walk a route at a person\'s pace (real seconds), face the way you go, and arrive', () => {
  const y = makeYou(0, 0); startWalk(y, [{ x: 0, y: 0 }, { x: 7, y: 0 }], false);
  assert.ok(y.moving); assert.equal(y.tx, 7);
  let t = 0, arrived = false; while (!arrived && t < 30) { arrived = stepYou(y, 0.05); t += 0.05; }
  assert.ok(arrived); assert.ok(Math.abs(t - 7 / YOU_WALK) < 0.1, `took ${t}s`);
  assert.equal(y.x, 7); assert.ok(!y.moving);
  // running is quicker
  const z = makeYou(0, 0); startWalk(z, [{ x: 0, y: 0 }, { x: 7, y: 0 }], true); let u = 0; while (!stepYou(z, 0.05) && u < 30) u += 0.05;
  assert.ok(Math.abs(u - 7 / YOU_RUN) < 0.15);
});

test('a long trip offers Skip, and Skip puts you just short of the end', () => {
  const y = makeYou(0, 0); startWalk(y, [{ x: 0, y: 0 }, { x: SKIP_TILES + 40, y: 0 }], false);
  assert.ok(y.skip); assert.ok(remaining(y) > SKIP_TILES);
  skipAhead(y, 2); assert.ok(!y.skip); assert.ok(Math.abs(y.x - (SKIP_TILES + 38)) < 1e-6);
  const short = makeYou(0, 0); startWalk(short, [{ x: 0, y: 0 }, { x: 5, y: 0 }], false); assert.ok(!short.skip);
});

test('the keys walk you camera-relative: up the screen is -x -y on the iso map, right is +x -y', () => {
  const d: [number, number] = [0, 0];
  keyDir(0, -1, d); assert.ok(d[0] < 0 && d[1] < 0 && Math.abs(d[0] - d[1]) < 1e-9);
  keyDir(1, 0, d); assert.ok(d[0] > 0 && d[1] < 0 && Math.abs(d[0] + d[1]) < 1e-9);
  const y = makeYou(5, 5), ok = () => true;
  assert.ok(keyStep(y, 1, 0, false, 1, ok)); assert.ok(Math.abs(Math.hypot(y.x - 5, y.y - 5) - YOU_WALK) < 1e-9);
  assert.ok(y.keys);
  // the keys stop a route
  const z = makeYou(0, 0); startWalk(z, [{ x: 0, y: 0 }, { x: 9, y: 0 }], false); keyStep(z, 0, 1, false, 0.1, ok); assert.ok(!z.moving);
});

test('the keys slide you along a wall instead of stopping you dead', () => {
  const y = makeYou(9.9, 5), ok = (x: number) => x < 10;
  // down-right on the screen is +x: the wall at x 10 stops the x part, the y part still moves
  const moved = keyStep(y, 1, 1, false, 0.5, ok);
  assert.ok(moved); assert.ok(y.x < 10); assert.ok(y.y !== 5);
});

test('a click resolves to the adventure verbs, with a label naming the thing', () => {
  assert.equal(verbOf('ground'), 'walk'); assert.equal(verbOf('person'), 'talk'); assert.equal(verbOf('building'), 'look');
  assert.equal(verbOf('range'), 'use'); assert.equal(verbOf('practice'), 'use'); assert.equal(verbOf('tee'), 'use'); assert.equal(verbOf(null), null);
  assert.equal(hoverText('person', 'Kirk Hall'), 'Talk to Kirk Hall');
  assert.equal(hoverText('building', 'the diner'), 'Look at the diner');
  assert.equal(hoverText(null), 'You cannot walk there');
  assert.equal(standInText('Jack Burns'), 'Stand In for Jack Burns');
});

test('a building\'s door is on the side toward the road, one you can stand on; you stop short of a person to talk', () => {
  // a road runs along y 20 below a building at 0..10, 0..10: the door is on its south side
  const road = (x: number, y: number, ux: number, uy: number) => { for (let k = 0; k < 40; k++) if (Math.abs(y + uy * k - 20) < 0.5) return k; return Infinity; };
  const d = doorOf([0, 0, 10, 10], { x: -20, y: 5 }, () => true, road)!;
  assert.ok(d.y > 10 && Math.abs(d.x - 5) < 1e-9);
  // that side blocked: another
  const e = doorOf([0, 0, 10, 10], { x: -20, y: 5 }, (_x, y) => y < 10, road)!;
  assert.ok(e.y <= 10);
  const t = talkSpot({ x: 10, y: 0 }, { x: 0, y: 0 }); assert.ok(Math.abs(t.x - 8.8) < 1e-9);
});

test('the walk clip while walking, the drive while swinging at a mat, else idle', () => {
  const walk = { start: 1, n: 8 }, drive = { start: 9, n: 3, times: [0, 0.5, 1] };
  const y = makeYou(0, 0); assert.equal(youFrame(y, walk, 0, drive), 0);
  startWalk(y, [{ x: 0, y: 0 }, { x: 4, y: 0 }], false); stepYou(y, 0.5); const f = youFrame(y, walk, 0, drive); assert.ok(f >= 1 && f <= 8);
  const z = makeYou(0, 0); z.swing = 0.6; assert.equal(youFrame(z, walk, 0, drive), 10);
});

test('saved with the game: your place, facing and look come back; an old save has none (a default character)', () => {
  assert.equal(normalizeYou(null), undefined); assert.equal(normalizeYou({ x: 'a', y: 1 }), undefined);
  assert.deepEqual(normalizeYou({ x: 10.5, y: 20, f: 11, look: 2.2 }), { x: 10.5, y: 20, f: 3, look: 2 });
  const p = { ...startProfile('w'), name: 'Jane Doe', you: { x: 300.25, y: 512, f: 4, look: 3 } };
  const back = normalizePlayer(JSON.parse(JSON.stringify(p)))!;
  assert.equal(back.name, 'Jane Doe'); assert.equal(back.sex, 'w'); assert.deepEqual(back.you, { x: 300.25, y: 512, f: 4, look: 3 });
  assert.equal(normalizePlayer(JSON.parse(JSON.stringify(startProfile())))!.you, undefined);
  assert.equal(lookSex('golfer:golf_am_w1'), 'w'); assert.equal(lookSex('golfer:golf_pro_m3'), 'm');
});

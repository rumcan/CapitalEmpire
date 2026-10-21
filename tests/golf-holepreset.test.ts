// The golf hole preset (golf/holepreset.ts): eight painted areas that pass checkArea, the flag on the green, the props' counts and clearances, determinism per seed, and the quarter turns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holePreset, placeHole } from '../src/game/golf/holepreset';
import { MAX_SIDE, MIN_AREA, checkArea, insidePoly, polyArea, polyBox } from '../src/game/paint';

test('eight areas, each a valid painted area (placed on the map: the local frame has negative corners)', () => {
  const p = placeHole(holePreset(1), 300, 300, 0);
  assert.equal(p.areas.length, 8);
  for (const a of p.areas) {
    assert.equal(checkArea(a.pts), '');
    assert.ok(Math.abs(polyArea(a.pts)) >= MIN_AREA);
    const b = polyBox(a.pts);
    assert.ok(b[2] - b[0] < MAX_SIDE && b[3] - b[1] < MAX_SIDE);
  }
});

test('the flag is on the green', () => {
  const p = holePreset(1), green = p.areas[7]!, flag = p.props.find(q => q.kind === 'flag');
  assert.ok(flag);
  assert.ok(insidePoly(green.pts, flag.x, flag.y));
});

test('props: enough trees, bushes and flowers, and no tree or bush on the fairway or green', () => {
  const p = holePreset(1), fairway = p.areas[2]!, green = p.areas[7]!;
  const count = (k: string) => p.props.filter(q => q.kind === k).length;
  assert.ok(count('tree') >= 40, `trees ${count('tree')}`);
  assert.ok(count('bush') >= 40, `bushes ${count('bush')}`);
  assert.ok(count('flower') >= 10, `flowers ${count('flower')}`);
  for (const q of p.props) {
    if (q.kind !== 'tree' && q.kind !== 'bush') continue;
    assert.ok(!insidePoly(fairway.pts, q.x, q.y), `${q.kind} on the fairway at ${q.x}, ${q.y}`);
    assert.ok(!insidePoly(green.pts, q.x, q.y), `${q.kind} on the green at ${q.x}, ${q.y}`);
  }
});

test('deterministic per seed, different for another seed', () => {
  const a = JSON.stringify(holePreset(7)), b = JSON.stringify(holePreset(7)), c = JSON.stringify(holePreset(8));
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(JSON.stringify(holePreset(7).props), JSON.stringify(holePreset(8).props));
});

test('placeHole turns and moves every point', () => {
  const p = holePreset(3), q = placeHole(p, 300, 200, 1);
  assert.equal(q.areas.length, p.areas.length);
  const src = p.props[0]!, dst = q.props[0]!;
  assert.equal(dst.x, -src.y + 300);
  assert.equal(dst.y, src.x + 200);
  const pts = p.areas[0]!.pts, out = q.areas[0]!.pts;
  assert.equal(out[0], -pts[1]! + 300);
  assert.equal(out[1], Math.round((pts[0]! + 200) * 4) / 4);
});

test('placed holes stay valid in every quarter turn', () => {
  const p = holePreset(2);
  for (const dir of [0, 1, 2, 3] as const) for (const a of placeHole(p, 500, 500, dir).areas) assert.equal(checkArea(a.pts), '');
});

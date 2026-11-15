// The owner, 2026-11-15: "two flags at the practice chipping green". The game stands a cup flag picture on the chipping green (golf/rangehost.ts, keyed
// 'range:practice-chipping<i>') and the view from behind the golfer stands its own pin in the cup he plays, the same cup: the picture stays out of the practice view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { PracticeId } from '../src/game/golf/rangesave';

test("the practice view leaves the chipping green's cup flag pictures out (its own pin stands there); the putting green keeps its flags", () => {
  const eng = readFileSync('src/game/engine.ts', 'utf8'), host = readFileSync('src/game/golf/rangehost.ts', 'utf8');
  const ids: PracticeId[] = ['putting', 'chipping']; assert.equal(ids.length, 2); // (the facilities' ids: the chipping green's flags are the ones left out)
  assert.ok(host.includes("want.push({ key: `practice-${id}${i}`, id: 'business:golf-pin-red'") && host.includes("this.ctx.addPiece(w, 'range:' + w.key)"), 'the flags are keyed range:practice-<id><i>');
  assert.ok(eng.includes("export const CHIP_FLAG_AUTO = 'range:practice-chipping';"));
  assert.ok(eng.includes('props: [...this.props].filter(p => !(pr && p.auto?.startsWith(CHIP_FLAG_AUTO))).map('), 'only in practice (pr), only the chipping green\'s');
});

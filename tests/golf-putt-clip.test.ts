// T212 (#557): the golfers' putt clip (render-person-3d.mjs --putt: the drive clip held at its address, a hand-keyed pendulum, a putter drawn): every
// golfer packed has its sheet in all 8 headings, the packed clip follows the drive in each row, and its impact is the one the game times the ball by.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GOLFER_CLIPS, GOLFER_FRAMES, GOLFER_PEOPLE, WALK_DIRS } from '../src/game/library';
import { PUTT_IMPACT_S } from '../src/game/crowdview';

test('the putt clip is packed after the drive, a one-shot with a frame at its impact', () => {
  const d = GOLFER_CLIPS.golf_drive, p = GOLFER_CLIPS.golf_putt;
  assert.equal(p.start, d.start + d.n, 'the putt follows the drive in each row');
  assert.equal(GOLFER_FRAMES, p.start + p.n, 'and ends the row');
  assert.equal(p.loop, false);
  assert.equal(p.times.length, p.n);
  assert.ok(p.times.includes(PUTT_IMPACT_S), 'a frame at the impact');
  assert.ok(p.times.every((t, i) => i === 0 || t > p.times[i - 1]!), 'times rise');
});

test('every packed golfer has a putt sheet in all 8 headings, with the impact the game uses', () => {
  for (const g of GOLFER_PEOPLE) {
    const name = g.id.replace(/^golfer:/, ''), j = JSON.parse(fs.readFileSync(`art/golfers/${name}/golf_putt.json`, 'utf8'));
    assert.deepEqual(j.directions, [...WALK_DIRS], `${name}: 8 headings`);
    assert.equal(j.frames.length, GOLFER_CLIPS.golf_putt.n, `${name}: frames`);
    assert.deepEqual(j.times, [...GOLFER_CLIPS.golf_putt.times], `${name}: times`);
    assert.equal(j.impactSecs, PUTT_IMPACT_S, `${name}: impact`);
    assert.equal(j.prop, 'putter', `${name}: a putter`);
    assert.ok(fs.existsSync(`art/golfers/${name}/golf_putt.webp`), `${name}: the sheet`);
  }
});

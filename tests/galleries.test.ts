// The galleries (LEAD.md M2.2): src/game/golf/galleries.ts spots from the course and the structures, and the spot a party picks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GALLERY, gallerySpots, pickSpot } from '../src/game/golf/galleries';

const tees = [{ hole: 1, x: 0, y: 0 }, { hole: 2, x: 100, y: 0 }];
const pins = [{ hole: 1, x: 0, y: 50 }, { hole: 2, x: 100, y: 60 }];

test('galleries: a green spot beside each green, off the line of play; a tee spot behind and beside each tee; the last green pulls most', () => {
  const s = gallerySpots(tees, pins);
  const g1 = s.find(q => q.kind === 'green' && q.hole === 1)!, t1 = s.find(q => q.kind === 'tee' && q.hole === 1)!, g2 = s.find(q => q.kind === 'green' && q.hole === 2)!;
  // hole 1 plays +y: the left side is -x
  assert.ok(Math.abs(g1.x + GALLERY.green.off) < 1e-9 && Math.abs(g1.y - 50) < 1e-9, JSON.stringify(g1));
  assert.ok(t1.y < 0 && t1.x < 0, JSON.stringify(t1));
  assert.ok(g2.weight > g1.weight && g2.cap > g1.cap, 'the last hole');
  assert.equal(s.length, 4);
});

test('galleries: grandstands by their seats, tents in front of them; other structures are not spots', () => {
  const s = gallerySpots([], [], [{ id: 1, typeId: 'standS', x: 10, y: 10, mode: 'rent' }, { id: 2, typeId: 'foodTent', x: 30, y: 30, mode: 'rent' }, { id: 3, typeId: 'gate', x: 50, y: 50, mode: 'rent' }] as never);
  assert.deepEqual(s.map(q => q.kind), ['stand', 'tent']);
  assert.equal(s[0]!.cap, 200); assert.ok(s[1]!.y > 34, 'in front of the tent');
});

test('galleries: a party picks by weight, a full spot pulls nothing, all full: the least full', () => {
  const s = gallerySpots(tees, pins), n = s.length, fill = new Array(n).fill(0), got = new Array(n).fill(0);
  for (let k = 0; k < 1000; k++) got[pickSpot(s, fill, (k + 0.5) / 1000)]++;
  const gi = s.findIndex(q => q.kind === 'green' && q.hole === 2), ti = s.findIndex(q => q.kind === 'tee');
  assert.ok(got[gi] > got[ti], `the last green draws more than a tee: ${got}`);
  const full = s.map(q => q.cap); full[gi] = 0;
  for (let k = 0; k < 50; k++) assert.equal(pickSpot(s, full, k / 50), gi);
  const over = s.map(q => q.cap * 2); over[ti] = s[ti]!.cap;
  assert.equal(pickSpot(s, over, 0.3), ti);
  assert.equal(pickSpot([], [], 0.5), -1);
});

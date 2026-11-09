// T375 (#1031; the owner, 2026-11-08: buildings face the wrong way: the Video Vault, the fishing/tackle store, houses whose door or garage does not point
// at their road): a building with eight approved views (object-eight-library.ts) is drawn on a lot in the view whose front faces its road, on all eight road
// headings; a building with four views falls back to the nearest corner, as before; a building with the old screen-axis set keeps it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { OBJECT_EIGHT_SETS } from '../src/game/object-eight-library';
import { OBJECT_FACING_KEYS } from '../src/game/object-eight-types';
import { AXIS_SETS } from '../src/game/axis-library';
import { drawnAs } from '../src/game/mirror';
import { axisSetOf, drawnView, eightRingOf, faces, roadView } from '../src/game/lots/preset-art';
import { roadOf } from '../src/game/lots/preset-frame';
import { objectFacings } from '../src/game/object-eight';

const LIB = new Map(LIBRARY.map((it, i) => [it.id, i]));
/** a lot's away vector for a road angle (preset-frame.ts roadOf: the street lies along -n) */
const awayOf = (road: number) => ({ x: -Math.sin(road * Math.PI / 4), y: -Math.cos(road * Math.PI / 4) });
const frameOf = (road: number) => ({ q: (road % 2 ? (road === 1 || road === 7 ? 0 : 2) : road / 2) as 0 | 1 | 2 | 3, n: awayOf(road) });
/** the lots' buildings the owner's 8-view art covers (native-resume-20261106: Video Vault and Arcade, daylight corners and 8-degree straight-on views) */
const OWNER_SUBJECTS = ['world:video_rental', 'world:arcade'];

test('the owner\'s eight-view buildings are approved sets of eight distinct pictures in the library, each with the four corners and the four 8-degree views', () => {
  for (const subject of OWNER_SUBJECTS) {
    const set = OBJECT_EIGHT_SETS.find(s => s.subject === subject);
    assert.ok(set, `${subject} is an eight-view set`);
    assert.equal(set!.review, 'approved'); assert.equal(set!.projection, 'normal+yaw8');
    const ids = OBJECT_FACING_KEYS.map(k => set!.views[k].id);
    assert.equal(new Set(ids).size, 8, `${subject}: eight different pictures`);
    for (const id of ids) assert.ok(LIB.has(id), `${id} is in the library`);
    // the ring's order is the road's: NE, N, SE, E, SW, S, NW, W
    assert.deepEqual([...OBJECT_FACING_KEYS], ['normalNE', 'yaw8N', 'normalSE', 'yaw8E', 'normalSW', 'yaw8S', 'normalNW', 'yaw8W']);
    // each is a building picture, drawn as itself (never mirrored), with a footprint and an anchor inside its picture
    for (const id of ids) {
      const it = LIBRARY[LIB.get(id)!]!;
      assert.equal(it.kind, 'building'); assert.deepEqual(drawnAs(it, true), [id, false]); assert.deepEqual(drawnAs(it, false), [id, false]);
      assert.ok(it.boxes.length > 0 && it.ax > 0 && it.ax < it.w && it.ay > 0 && it.ay < it.h, `${id}: an anchor inside its picture`);
    }
    // the resolver (the Props tool's R) sees the same eight
    const f = objectFacings(subject); assert.equal(f.mode, 'eight'); assert.deepEqual([...f.ids], ids);
  }
});

test('on a road at 45 degrees the lot draws the straight-on view that faces it; the ring\'s place is the road, a quarter turn of the prop is two places on', () => {
  for (const subject of OWNER_SUBJECTS) {
    const ring = eightRingOf(subject)!; assert.equal(ring.length, 8);
    assert.equal(axisSetOf(subject), null, `${subject} has no old screen-axis set`);
    for (let road = 1; road < 8; road += 2) for (let view = 0; view < 4; view++) {
      const want = ring[(road + 2 * view) % 8]!;
      assert.equal(roadView(subject, road, view), want, `${subject} road ${road} view ${view}`);
      assert.ok(want.includes(':yaw8'), `${want} is a straight-on view`);
    }
    // view 0 faces the street: road 1 N (screen down), 3 E, 5 S, 7 W
    assert.deepEqual([1, 3, 5, 7].map(r => roadView(subject, r, 0)!.split(':').pop()), ['yaw8N', 'yaw8E', 'yaw8S', 'yaw8W']);
    // any of its four old corner pictures, or its own eight, finds the ring
    for (const id of [subject, `view:${subject}:sw`, `view:${subject}:nw`, ...ring]) assert.deepEqual(eightRingOf(id), ring, `${id} names the set`);
    // the lot draws it that way, unmirrored, on the turned footprint (diag)
    for (let road = 1; road < 8; road += 2) {
      const f = frameOf(road); assert.equal(roadOf(f.n), road);
      const v = drawnView(subject, f, 0); assert.equal(v.id, ring[road]); assert.equal(v.flip, false); assert.equal(v.diag, true);
      assert.ok(faces(subject, road), `${subject} faces road ${road}`);
    }
  }
});

test('on a road along a map axis the old corner logic stands (the new corners replace the old pictures at draw time, mirror.ts)', () => {
  for (const subject of OWNER_SUBJECTS) for (let road = 0; road < 8; road += 2) {
    assert.equal(roadView(subject, road, 0), null, `${subject} road ${road}`);
    assert.ok(faces(subject, road), `${subject} turns to face road ${road}`);
    const f = frameOf(road), v = drawnView(subject, f, 0); assert.equal(v.diag, false);
    // the corner it takes is the new set's, whatever old picture the lot named
    const it = LIBRARY[LIB.get(v.id)!]!, [drawn] = drawnAs(it, v.flip);
    assert.ok(drawn.startsWith('object8:') && drawn.endsWith(`:${OBJECT_FACING_KEYS[road]}`), `${v.id} is drawn as ${drawn}: the corner facing road ${road}`);
  }
});

test('a building with four views only falls back to the nearest corner on a screen-straight road, as before; one with the old screen-axis set keeps it', () => {
  for (const subject of ['town:fish_tackle', 'town:barber', 'town:laundromat', 'world:house_2']) {
    assert.equal(eightRingOf(subject), null, `${subject} has no eight views yet`);
    for (let road = 1; road < 8; road += 2) { assert.equal(roadView(subject, road, 0), null, `${subject} road ${road}`); assert.equal(faces(subject, road), false); }
    for (let road = 0; road < 8; road += 2) assert.equal(faces(subject, road), true, `${subject} turns to road ${road}`);
  }
  for (const subject of ['town:grocery', 'town:bakery', 'town:pharmacy', 'world:house_0']) {
    const set = AXIS_SETS[subject]!; assert.ok(set, `${subject} has the old screen-axis set`);
    for (let road = 1; road < 8; road += 2) assert.equal(roadView(subject, road, 0), set[(road - 1) / 2], `${subject} road ${road}: the old set`);
  }
});

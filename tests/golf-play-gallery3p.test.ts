// T429 (docs/CINDERLINKS-PORT.md): the galleries as the view is sent them (src/game/golf/play/gallery3p.ts). Three spots in the City's gallery buffer (a green
// with its ring of places, a tee without places, a grandstand with its seats) and an empty one: each with spectators is one gallery actor whose fans are where
// the manager view draws them (crowdview.ts galleryPeople), in the view's frame; the stand's fans sit at their seats' heights; the empty spot is left out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { galleryPeople, type CrowdPerson } from '../src/game/crowdview';
import { placeSeating, proposedSeating } from '../src/game/golf/event-seating';
import { fromView, type ActorsMsg } from '../src/game/golf/play/protocol3p';
import { GALLERY_ID, galleryActors, withGalleries } from '../src/game/golf/play/gallery3p';

const centre = { x: 200, y: 200 };
const ring: number[] = []; for (let k = 0; k < 60; k++) { const a = k / 60 * Math.PI * 2; ring.push(300 + Math.cos(a) * 12, 120 + Math.sin(a) * 12); }
//            x    y   count kind fx   fy   (two unused)
const G = [300, 132, 40, 0, 300, 120, 0, 0,     // a green: 40 fans on its ring
           150, 180, 12, 0, 150, 170, 0, 0,     // a tee: 12 fans in a block
           260, 140, 30, 2, 260, 130, 0, 0,     // a grandstand: 30 seated
           100, 100, 0, 0, 100, 90, 0, 0];      // nobody
const seating = placeSeating(proposedSeating(10, 4, true), 0, { x: 260, y: 140 });
const st = { G, places: new Map([[0, ring]]), seating: new Map([[2, seating]]) };

test('galleries: one actor a spot with spectators, its fans where the manager view draws them', () => {
  const g = galleryActors(st, centre);
  assert.deepEqual(g.map(a => a.id), [GALLERY_ID, GALLERY_ID + 1, GALLERY_ID + 2], 'the three spots with people, the empty one left out');
  for (const a of g) {
    const o = (a.id - GALLERY_ID) * 8, P: CrowdPerson[] = [], n = galleryPeople(G, o, a.id - GALLERY_ID, 0, 1, P, -1, st.seating.get(a.id - GALLERY_ID), st.places.get(a.id - GALLERY_ID));
    assert.equal(a.role, 'gallery'); assert.equal(a.count, n); assert.equal(a.fans!.length, n);
    a.fans!.forEach((f, k) => { const b = fromView([f[0], f[1]], centre); assert.ok(Math.hypot(b.x - P[k]!.x, b.y - P[k]!.y) < 0.06, `fan ${k} of ${a.id} stands where the manager view has him`); });
    const fo = fromView(a.focus!, centre); assert.ok(Math.hypot(fo.x - G[o + 4]!, fo.y - G[o + 5]!) < 0.06, 'they face the spot\'s focus');
  }
  const stand = g[2]!; assert.equal(stand.seated, true); assert.ok(stand.fans!.every(f => f[2] > 0.3), 'the stand\'s fans sit up on its seats');
  assert.ok(new Set(stand.fans!.map(f => f[2])).size > 1, 'on rising rows');
  assert.ok(g[0]!.fans!.every(f => f[2] === 0) && !g[0]!.seated, 'the green\'s stand on the ground');
});

test('galleries go into the actors list with the people (an old gallery replaced)', () => {
  const msg: ActorsMsg = { v: 1, t: 'actors', at: 600, actors: [{ id: 1, role: 'golfer', at: [0, 0], hole: 1 }, { id: GALLERY_ID + 9, role: 'gallery', at: [0, 0], hole: 0, count: 5 }] };
  const m = withGalleries(msg, st, centre);
  assert.deepEqual(m.actors.map(a => a.id), [1, GALLERY_ID, GALLERY_ID + 1, GALLERY_ID + 2]);
});

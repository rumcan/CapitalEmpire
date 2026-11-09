// T398 (#1070): the straight-on (8-degree) views of the corners-only buildings (art/object-eight-20261109: the runner's axisturn sheets, reviewed against each building's
// corner views, imported as object-eight sets whose four normal views are the building's own existing corner pictures). A building with them is drawn on a screen-straight
// road in the view whose front faces its street; its corners draw exactly as before. Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import type { LibItem } from '../src/game/types';
import { OBJECT_EIGHT_SETS } from '../src/game/object-eight-library';
import { OBJECT_FACING_KEYS, objectFootprint } from '../src/game/object-eight-types';
import { drawnAs } from '../src/game/mirror';
import { axisSetOf, drawnView, eightRingOf, faces, fourViews, ownerScaleOf, roadView } from '../src/game/lots/preset-art';
import { frameOf as presetFrameOf, roadOf } from '../src/game/lots/preset-frame';
import { lotDrawLimit } from '../src/game/newart';
import { PIXEL_LIMIT } from '../src/game/sizes';
import { HOUSE_SWAP_RULES, backPalette, compose, housePalette, swapScale } from '../src/game/lots/compose';
import { cat } from '../src/game/lots/compose-core';
import { LU, LV } from '../src/game/lots/town';
import { facingView } from '../src/game/lots/house-facing';
import { objectFacings } from '../src/game/object-eight';
import REVIEW from '../art/object-eight-20261109/review.json';

const BY = new Map<string, LibItem>(LIBRARY.map(i => [i.id, i] as const));
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };
const awayOf = (road: number) => ({ x: -Math.sin(road * Math.PI / 4), y: -Math.cos(road * Math.PI / 4) });
const frameOf = (road: number) => ({ q: (road % 2 ? (road === 1 || road === 7 ? 0 : 2) : road / 2) as 0 | 1 | 2 | 3, n: awayOf(road) });
/** the reviewed buildings (art/object-eight-20261109/review.json: accepted sheets): their library subjects */
const SUBJECTS = Object.entries(REVIEW.buildings).filter(([, b]) => b.accept).map(([disk]) => disk.replace(/~/g, ':'));
const setOf = (subject: string) => OBJECT_EIGHT_SETS.find(s => s.subject === subject);
const HEADINGS = { normalNE: 0, yaw8N: 37, normalSE: 90, yaw8E: 127, normalSW: 180, yaw8S: 217, normalNW: 270, yaw8W: 307 } as const;

test('every reviewed building is an approved eight-view set: its four corner views are its own existing pictures, its four straight-on views new ones', () => {
  assert.ok(SUBJECTS.length >= 30, `${SUBJECTS.length} reviewed buildings`);
  for (const subject of SUBJECTS) {
    const set = setOf(subject); assert.ok(set, `${subject} has a set`);
    assert.equal(set!.review, 'approved'); assert.equal(set!.projection, 'normal+yaw8'); assert.equal(set!.runtimeReuse, true);
    const ids = OBJECT_FACING_KEYS.map(k => set!.views[k].id);
    assert.equal(new Set(ids).size, 8, `${subject}: eight different pictures`);
    for (const id of ids) assert.ok(BY.has(id), `${id} is in the library`);
    // the normal views alias the building's four corner pictures (NE, SE, SW, NW) pixel for pixel: same atlas cell, size and anchor
    const corners = fourViews(subject)!.views;
    ([['normalNE', 0], ['normalSE', 1], ['normalSW', 2], ['normalNW', 3]] as const).forEach(([key, i]) => {
      assert.equal(set!.sourceIds![key], corners[i], `${subject} ${key} reuses ${corners[i]}`);
      const alias: LibItem = BY.get(set!.views[key].id)!, old: LibItem = BY.get(corners[i]!)!;
      assert.deepEqual([alias.tex, alias.w, alias.h, alias.ax, alias.ay, alias.quad], [old.tex, old.w, old.h, old.ax, old.ay, old.quad], `${subject} ${key} draws as ${corners[i]}`);
      assert.deepEqual(alias.boxes, set!.views[key].boxes);
      // the physical footprint at the corner's heading is the old picture's own box (the set's footprint is twice its half extents)
      assert.ok(Math.abs(alias.boxes[0]!.hx - old.boxes[0]!.hx) < 1e-6 && Math.abs(alias.boxes[0]!.hy - old.boxes[0]!.hy) < 1e-6, `${subject} ${key}: the old box`);
    });
    // the straight-on views are new atlas cells (no reuse), with an anchor inside their picture, drawn within a sane scale of the corner
    const ne: LibItem = BY.get(set!.views.normalNE.id)!;
    for (const key of ['yaw8N', 'yaw8E', 'yaw8S', 'yaw8W'] as const) {
      assert.equal(set!.sourceIds![key], undefined, `${subject} ${key} is a new picture`);
      const pic: LibItem = BY.get(set!.views[key].id)!;
      assert.ok(pic.id.startsWith('object8:') && pic.ax > 0 && pic.ax < pic.w && pic.ay > 0 && pic.ay < pic.h, `${pic.id}: an anchor inside its picture`);
      assert.ok(pic.w / ne.w > 0.35 && pic.w / ne.w < 1.25, `${pic.id}: ${(pic.w / ne.w).toFixed(2)} of the NE corner's width`);
      assert.equal(pic.kind, 'building'); assert.deepEqual(drawnAs(pic, true), [pic.id, false]);
      // the footprint of the physical rectangle turned by the view's heading (the legacy mapping: the straight-on views are 37, 127, 217 and 307 degrees)
      const want = objectFootprint(set!.footprintMetres.width, set!.footprintMetres.depth, HEADINGS[key]), got = set!.views[key].boxes[0]!;
      assert.ok(Math.abs(got.hx - want.hx) < 1e-6 && Math.abs(got.hy - want.hy) < 1e-6, `${pic.id}: the footprint turned ${HEADINGS[key]} degrees`);
    }
    // the Props tool's resolver sees the eight
    const f = objectFacings(subject); assert.equal(f.mode, 'eight'); assert.deepEqual([...f.ids], ids);
  }
});

test('the old corner pictures draw exactly as before: a reused set never replaces them', () => {
  for (const subject of SUBJECTS) for (const id of fourViews(subject)!.views) {
    const pic: LibItem = BY.get(id)!;
    for (const flip of [false, true]) assert.ok(!drawnAs(pic, flip)[0].startsWith('object8:'), `${id} (flip ${flip}) is not swapped for an eight-view picture`);
  }
});

test('on a screen-straight road the lot draws the straight-on view that faces its street (a quarter turn of the prop is two places on the ring); the old square set still wins where there is one', () => {
  let ringDrawn = 0, axisKept = 0;
  for (const subject of SUBJECTS) {
    const ring = eightRingOf(subject)!; assert.equal(ring.length, 8);
    const axis = axisSetOf(subject);
    for (let road = 1; road < 8; road += 2) for (let view = 0; view < 4; view++) {
      const got = roadView(subject, road, view);
      if (axis) { assert.equal(got, axis[(((road - 1) / 2 + view) % 4 + 4) % 4], `${subject} road ${road} view ${view}: the old set`); axisKept++; continue; }
      assert.equal(got, ring[(road + 2 * view) % 8], `${subject} road ${road} view ${view}`); assert.ok(got!.includes(':yaw8'), `${got} is a straight-on view`); ringDrawn++;
    }
    // road 1 faces screen down: view 0 is N, road 3 E, road 5 S, road 7 W
    if (!axis) assert.deepEqual([1, 3, 5, 7].map(r => roadView(subject, r, 0)!.split(':').pop()), ['yaw8N', 'yaw8E', 'yaw8S', 'yaw8W']);
    for (const road of [1, 3, 5, 7]) assert.ok(faces(subject, road), `${subject} faces road ${road}`);
    // the corners on the map-axis roads stay the four-view art
    for (const road of [0, 2, 4, 6]) assert.equal(roadView(subject, road, 0), null, `${subject} road ${road}: the four-view art draws`);
  }
  assert.ok(ringDrawn > 100 && axisKept > 0, `${ringDrawn} ring draws, ${axisKept} old-set draws`);
});

test('every house the town draws faces its street on all eight roads, except the house types still waiting for straight-on art (the list the next art batch starts from)', () => {
  // (T385's facingView: exact when the picture's front meets the lot's street. A house type with no straight-on view is 45 degrees off on the four screen-straight roads: the
  // composer prefers the types that face, bestFacing; the types below need the art, so the next batch is these. When their views land this list shrinks: edit it.)
  const WAITING = [
    'gen:house-duplex', 'gen:house-farmhouse-wrap', 'gen:house-l-shape', 'gen:house-ranch-long', 'gen:house-splitlevel',
    'variation:gen-house-duplex-c39d1a23-plain-corner:1', 'variation:gen-house-farmhouse-wrap-2b0eea83-plain-corner:1', 'variation:gen-house-l-shape-e0e3b328-plain-corner:1',
    'variation:gen-house-l-shape-e0e3b328-plain:1', 'variation:gen-house-ranch-long-a4ddd58c-plain-corner:1', 'variation:gen-house-splitlevel-8b6b4aa4-plain:1', 'world:house_5',
  ];
  const off: string[] = [];
  for (const id of housePalette()) {
    const bad: number[] = [];
    for (let road = 0; road < 8; road++) { const f = facingView(id, frameOf(road), 0); assert.equal(roadOf(frameOf(road).n), road); if (!f.exact) bad.push(road); }
    if (bad.length) { off.push(id); assert.deepEqual(bad, [1, 3, 5, 7], `${id}: only the screen-straight roads are off (the corners face on the map-axis roads)`); }
  }
  assert.deepEqual(off.sort(), [...WAITING].sort());
  // the five world houses with views face exactly on every road
  for (const id of ['world:house_0', 'world:house_1', 'world:house_2', 'world:house_3', 'world:house_4']) for (let road = 0; road < 8; road++) {
    const f = facingView(id, frameOf(road), 0); assert.ok(f.exact && f.off === 0, `${id} on road ${road}`);
    assert.equal(drawnView(id, frameOf(road), 0).id, f.id);
  }
});

test('the composer\'s pools hand out no object-eight picture, and no lot on a road along a map axis draws one of the batch: the straight-on views are placed by a lot\'s facing, never picked as buildings of their own', () => {
  for (const id of [...cat(() => true), ...backPalette(), ...housePalette()]) assert.ok(!id.startsWith('object8:'), `${id} is in a pool`);
  const mine = new Set(OBJECT_EIGHT_SETS.filter(s => SUBJECTS.includes(s.subject)).flatMap(s => OBJECT_FACING_KEYS.map(k => s.views[k].id)));
  assert.ok(mine.size >= 240, `${mine.size} pictures of the batch`);
  // (a lot of each kind and state on the four roads along an axis: the corner views draw there, as before)
  const lotOn = (road: number) => { const n = awayOf(road), u = { x: n.y, y: -n.x }; return { o: { x: 300, y: 300 }, u, n, w: 14, d: 14 }; };
  const found = new Set<string>(); let lots = 0;
  for (const road of [0, 2, 4, 6]) for (const tier of [0, 3]) for (const decline of [0, 2]) for (const use of [LU.RES, LU.COM, LU.TOUR]) for (let seed = 1; seed <= 4; seed++) {
    lots++; for (const p of compose(lotOn(road), { use, level: LV.BUILT, decline, seed, tier }).props) if (mine.has(p.id)) found.add(p.id);
  }
  assert.ok(lots >= 190);
  assert.deepEqual([...found], [], 'no picture of the batch on a road along an axis');
});

test('a swap can place a house of the batch on a road at 45 degrees: measured against the size the game draws it at, not against its pixels (the straight-on views of a house of owner size 2.1 hold a limit of 1, and no swap could place one)', () => {
  const AT = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
  for (const subject of SUBJECTS) {
    const set = setOf(subject)!, owner = ownerScaleOf(subject);
    for (const key of ['yaw8N', 'yaw8E', 'yaw8S', 'yaw8W'] as const) {
      const i = AT.get(set.views[key].id)!;
      assert.ok(lotDrawLimit(i) >= owner, `${subject} ${key}: a lot may draw it at the building's own size (${lotDrawLimit(i).toFixed(2)} of ${owner.toFixed(2)})`);
    }
  }
  // (every other picture is measured against its pixels as before)
  for (const id of ['world:house_5', 'view:world:house_5:se', 'world:video_rental', 'object8:world-video-rental-cc8c504f-v1:yaw8N']) { const i = AT.get(id)!; assert.equal(lotDrawLimit(i), PIXEL_LIMIT[i]!, id); }
  // (a house of the batch swapped into another's place on each road at 45 degrees)
  for (const road of [1, 3, 5, 7]) {
    const n = awayOf(road), f = presetFrameOf({ o: { x: 300, y: 300 }, u: { x: n.y, y: -n.x }, n, w: 14, d: 14 }), spot = { id: 'world:house_2', x: 7, y: 7, scale: 1, view: 0 } as unknown as Parameters<typeof swapScale>[0];
    // (the batch's houses are of one size class: a swap among them fills the spot, the house rules' area share; before the fix their pictures' limit of 1 against an owner size of 2 failed it)
    for (const type of ['world:house_0', 'world:house_3', 'world:house_4']) assert.ok(swapScale(spot, type, f, HOUSE_SWAP_RULES) > 0, `${type} takes a house's place on road ${road}`);
  }
});

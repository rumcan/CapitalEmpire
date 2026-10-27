// New hole's ghost extras (plan P23-UX 6.2 P2-10, T176; ext/hole-wizard/extras.ts): the trees a Build clears, by the rules the game clears them
// by (the engine now calls these very predicates); the collar ring's cells in the footprint; the labels' fade near the pointer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOREST_CLEAR, LABEL_FADE_ALPHA, LABEL_FADE_PX, TOWN_CLEAR, clearancePoints, collarCells, labelFade, plantedTreeCleared, propTreeCleared, treesCleared, type NearTree } from '../src/game/ext/hole-wizard/extras';
import { SURF } from '../src/game/ext/course-grid';

/** a fixture course, tiles: a rough corridor x 10..40, y 10..20 with a fairway x 15..35, y 13..17 down its middle (as a Build would lay it) */
const after = (x: number, y: number) => (x >= 15 && x < 35 && y >= 13 && y < 17 ? SURF.fairway : x >= 10 && x < 40 && y >= 10 && y < 20 ? SURF.rough : 0);

test('the clearance points are the engine\'s: eight round the trunk at its radius, then the trunk', () => {
  const p = clearancePoints(5, 7, 2);
  assert.equal(p.length, 18);
  assert.deepEqual([p[0], p[1]], [7, 7]); assert.ok(Math.abs(p[4]! - 5) < 1e-9 && Math.abs(p[5]! - 9) < 1e-9, 'a quarter turn round');
  assert.deepEqual([p[16], p[17]], [5, 7], 'the trunk last');
  assert.equal(FOREST_CLEAR, 1); assert.equal(TOWN_CLEAR, 1.6);
});

test('the trees a Build clears: planted ones with a course cell (rough too) in their clearance, placed ones only on a playing surface', () => {
  const near: NearTree[] = [
    { x: 25, y: 15, planted: true, r: FOREST_CLEAR },   // 0: in the fairway: goes
    { x: 12, y: 11, planted: true, r: FOREST_CLEAR },   // 1: in the rough: goes (no planted tree stands on course cells)
    { x: 9.5, y: 15, planted: true, r: FOREST_CLEAR },  // 2: half a tile outside the corridor, its clearance reaches in: goes
    { x: 8.5, y: 15, planted: true, r: FOREST_CLEAR },  // 3: a forest tree 1.5 tiles out: stays
    { x: 8.5, y: 15, planted: true, r: TOWN_CLEAR },    // 4: a town tree there: its wider clearance reaches in: goes
    { x: 25, y: 15, planted: false, r: 0 },             // 5: a placed tree on the fairway: goes
    { x: 12, y: 11, planted: false, r: 0 },             // 6: a placed tree in the rough: stays (rough keeps placed trees)
    { x: 60, y: 60, planted: true, r: TOWN_CLEAR },     // 7: far away: stays
  ];
  assert.deepEqual(treesCleared(near, after), [0, 1, 2, 4, 5]);
  // the predicates the engine's clearing calls give the same answers one by one
  near.forEach((t, i) => assert.equal(t.planted ? plantedTreeCleared(after, t.x, t.y, t.r) : propTreeCleared(after, t.x, t.y), [0, 1, 2, 4, 5].includes(i), `tree ${i}`));
  // a placed tree on water, a bunker or a green goes as well; on fescue it stays
  for (const s of [SURF.water, SURF.bunker, SURF.green, SURF.tee]) assert.equal(propTreeCleared(() => s, 0, 0), true, `surface ${s}`);
  assert.equal(propTreeCleared(() => SURF.fescue, 0, 0), false);
});

test("the footprint's collar ring: a band round each laid surface, its width, only over the cells it may cover, never on its own surface", () => {
  const W = 20, H = 20, rough = () => new Uint8Array(W * H).fill(SURF.rough);
  // a 3 x 3 green laid in rough: the fringe (1 cell, a disc) is the 12 cells beside its sides
  let a = rough(); const laid = new Map<number, number>();
  for (let y = 8; y <= 10; y++) for (let x = 8; x <= 10; x++) { a[y * W + x] = SURF.green; laid.set(y * W + x, SURF.green); }
  let ring = collarCells(a, W, H, laid);
  assert.equal(ring.size, 12);
  assert.ok([...ring.values()].every(s => s === SURF.green));
  assert.ok(ring.has(7 * W + 9) && ring.has(11 * W + 9) && ring.has(9 * W + 7) && ring.has(9 * W + 11), 'beside each side');
  assert.ok(!ring.has(7 * W + 7), 'not the corner (a disc of 1)');
  assert.ok(![...ring.keys()].some(j => a[j] === SURF.green), 'never on the green itself');
  // a fairway's first cut is 2 cells wide, and never lies on another fairway; the green's fringe may lie on the fairway
  a = rough(); laid.clear();
  for (let x = 2; x <= 17; x++) { a[10 * W + x] = SURF.fairway; laid.set(10 * W + x, SURF.fairway); }
  ring = collarCells(a, W, H, laid);
  assert.ok(ring.has(8 * W + 10) && ring.has(12 * W + 10) && !ring.has(7 * W + 10), 'two cells each side');
  a[11 * W + 5] = SURF.fairway; // an existing fairway cell beside it
  assert.ok(!collarCells(a, W, H, laid).has(11 * W + 5), 'the first cut never covers fairway');
  a = rough(); laid.clear(); a[10 * W + 9] = SURF.fairway; a[10 * W + 10] = SURF.green; laid.set(10 * W + 10, SURF.green);
  assert.equal(collarCells(a, W, H, laid).get(10 * W + 9), SURF.green, "the green's fringe lies over the fairway beside it");
  // nothing laid: no ring
  assert.equal(collarCells(rough(), W, H, new Map()).size, 0);
});

test('labels fade to 30% within 60 px of the pointer (measured to the label box), and stay whole beyond', () => {
  assert.equal(LABEL_FADE_PX, 60); assert.equal(LABEL_FADE_ALPHA, 0.3);
  assert.equal(labelFade(100, 100, 40, 12, 120, 106), 0.3, 'the pointer on the label');
  assert.equal(labelFade(100, 100, 40, 12, 199, 106), 0.3, '59 px to its right edge');
  assert.equal(labelFade(100, 100, 40, 12, 201, 106), 1, '61 px away');
  assert.equal(labelFade(100, 100, 40, 12, 140 + 42, 112 + 42), 0.3, '42 px each way from a corner: 59 px');
  assert.equal(labelFade(100, 100, 40, 12, 140 + 43, 112 + 43), 1, 'past 60 px from the corner');
  assert.equal(labelFade(0, 0, 10, 10, 5, 5, 20, 0.5), 0.5, 'a reach and alpha of its own');
});

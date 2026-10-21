// The lay-by's street props (PARKING.md section 2): inQuad, the convex quad test that keeps a street prop out of a lay-by's bays (grown by 0.3 tiles),
// and the Lot Composer's marks: a shop front's street lamp and parking meter are street items, and nothing else is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inQuad } from '../src/game/event/curb';
import { compose, isCarPark, type ComposeState } from '../src/game/lots/compose';
import { LU, LV } from '../src/game/lots/town';

// the lot composer's imports reach the network's painters, which build Path2D outlines: in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** a 2 x 2 square, counter-clockwise from the origin */
const SQ = [0, 0, 2, 0, 2, 2, 0, 2];
/** the same square, clockwise */
const SQ_CW = [0, 0, 0, 2, 2, 2, 2, 0];
/** a diamond (a square turned 45 degrees): its edges are |x| + |y| = 2 */
const DIA = [2, 0, 0, 2, -2, 0, 0, -2];
/** the ids compose places on the sidewalk in front of a lot (with street: true) */
const STREET = new Set(['gen:trash-cans-row', 'world:mailbox', 'expansion:leaf-bags', 'world:hydrant', 'expansion:parking-meter', 'world:streetlamp', 'town:phone_booth', 'town:street_sign']);

test('inQuad: a point inside the quad is in, one outside by more than the pad is out, either winding', () => {
  assert.equal(inQuad(SQ, 1, 1, 0), true);
  assert.equal(inQuad(SQ_CW, 1, 1, 0), true);
  assert.equal(inQuad(SQ, 3, 1, 0.3), false);
  assert.equal(inQuad(SQ_CW, 3, 1, 0.3), false);
  assert.equal(inQuad(SQ, -0.5, -0.5, 0), false);
});

test('inQuad: on the edge is in; a point just past the edge is in only within the pad (the padded edge is exact)', () => {
  assert.equal(inQuad(SQ, 2, 1, 0), true);
  assert.equal(inQuad(SQ, 2.25, 1, 0.25), true);
  assert.equal(inQuad(SQ, 2.26, 1, 0.25), false);
  assert.equal(inQuad(SQ_CW, 2.25, 1, 0.25), true);
  assert.equal(inQuad(SQ_CW, 2.26, 1, 0.25), false);
});

test('inQuad: a rotated quad (a diamond) tests its slanted edges, not its box', () => {
  assert.equal(inQuad(DIA, 0, 0, 0), true);
  assert.equal(inQuad(DIA, 1, 0, 0), true);
  // (1.2, 1.2) is 0.4 / sqrt(2) = 0.283 past the edge x + y = 2: in with a pad of 0.3, out with 0.2
  assert.equal(inQuad(DIA, 1.2, 1.2, 0.3), true);
  assert.equal(inQuad(DIA, 1.2, 1.2, 0.2), false);
  // (1.5, 1.5) is 0.707 past it: out even though it is inside the diamond's bounding box
  assert.equal(inQuad(DIA, 1.5, 1.5, 0.3), false);
});

test('compose: a shop front\'s street lamp and parking meter are marked street; no other prop is', () => {
  // a 14 x 12 tile commercial lot on the street at b = 0 (the road at b < 0), the lot's frame on the map axes
  const lot = { o: { x: 100, y: 100 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 14, d: 12 };
  let lamps = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const st: ComposeState = { use: LU.COM, level: LV.BUILT, decline: 0, seed };
    if (isCarPark(st)) continue;
    for (const p of compose(lot, st).props) {
      if (p.id === 'world:streetlamp') lamps++;
      if (p.id === 'world:streetlamp' || p.id === 'expansion:parking-meter') assert.equal(p.street, true, `seed ${seed}: ${p.id} is not marked street`);
      if (!STREET.has(p.id)) assert.ok(!('street' in p), `seed ${seed}: ${p.id} carries a street key`);
      else assert.equal(p.street, true, `seed ${seed}: ${p.id} is a street item not marked street`);
    }
  }
  assert.ok(lamps > 0, 'no shop front got a street lamp over 30 seeds');
});

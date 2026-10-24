/** The edge field of a course layer (T077, ext/course-grid/field.ts): inside from the fill rings, distance and sun facing from the edge
 * polylines (surface on the left: outward normal (dy, -dx), holes included), and the same values on both sides of a chunk seam when the
 * neighbour's edges are passed too (pure, Node). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineField } from '../src/game/ext/course-grid/field';
import { SUN_TILE_DIR } from '../src/game/ext/course-height';
import { edgeImages, EDGE_LOOKS } from '../src/game/paint-edges';
import type { EdgeField } from '../src/game/paint-edges';

/** the field's value at tile (x, y): its signed distance and sun facing */
const at = (f: EdgeField, x: number, y: number) => { const k = Math.floor((y - f.y0) * f.res) * f.W + Math.floor((x - f.x0) * f.res); return { d: f.d[k]!, sun: f.sun[k]! }; };

// a 10-tile square (counter-clockwise on the map's axes: positive shoelace area) with a 4-tile hole (clockwise), as course-blobs gives them
const OUTER = [0, 0, 10, 0, 10, 10, 0, 10], HOLE = [3, 3, 3, 7, 7, 7, 7, 3];
const closed = (r: number[]) => [...r, r[0]!, r[1]!];

test('1. inside, outside and the hole', () => {
  const f = lineField([OUTER, HOLE], [closed(OUTER), closed(HOLE)], -3, -3, 16, 16, 4, 2);
  assert.ok(f.any);
  assert.ok(Math.abs(at(f, 5.1, 0.35).d - 0.35) < 0.15, 'just inside the north edge');
  assert.ok(Math.abs(at(f, 5.1, -0.65).d + 0.65) < 0.15, 'just outside it');
  assert.ok(at(f, 5.1, 5.1).d < 0, 'the hole is outside the surface');
  assert.ok(at(f, 2.6, 5.1).d > 0, 'the surface beside the hole');
  assert.equal(at(f, 12.9, 12.9).d, -2, 'clamped to -reach far outside');
});

test('2. the sun faces the outward normal (dy, -dx), for outer rings and holes', () => {
  const f = lineField([OUTER, HOLE], [closed(OUTER), closed(HOLE)], -3, -3, 16, 16, 4, 2);
  const S = SUN_TILE_DIR;
  assert.ok(Math.abs(at(f, 5.1, 0.35).sun - -S.y) < 1e-6, 'north edge: outward (0, -1)');
  assert.ok(Math.abs(at(f, 5.1, 9.65).sun - S.y) < 1e-6, 'south edge: outward (0, 1)');
  assert.ok(Math.abs(at(f, 2.6, 5.1).sun - S.x) < 1e-6, "the hole's west edge: out of the surface is east, into the hole");
  assert.ok(Math.abs(at(f, 5.1, 2.6).sun - S.y) < 1e-6, "the hole's north edge: out of the surface is south");
  // the sun sits at the screen's upper right, which is tile north: a raised surface is lit on its north edge and shaded on the south
  const im = edgeImages(f, EDGE_LOOKS.raised!, 0.55);
  const px = (x: number, y: number) => 4 * (Math.floor((y + 3) * 4) * f.W + Math.floor((x + 3) * 4));
  assert.ok(im.light!.data[px(5.1, 0.2) + 3]! > 20 && im.dark!.data[px(5.1, 0.2) + 3]! < 5, 'light rim on the north edge');
  assert.ok(im.dark!.data[px(5.1, 9.8) + 3]! > 20 && im.light!.data[px(5.1, 9.8) + 3]! < 5, 'shade on the south edge');
  // a sunken bunker the other way round
  const sk = edgeImages(f, EDGE_LOOKS.sunken!, 0.25);
  assert.ok(sk.dark!.data[px(5.1, 0.2) + 3]! > 20, 'a sunken surface is shaded inside its sunward edge');
});

test('3. a seam: the neighbour chunk edges give the same field as the uncut boundary', () => {
  // a slanted boundary from (0, 0) to (20, 4), the surface below it (on the left of travel), cut at the seam x = 10
  const A = [0, 0, 10, 2], B = [10, 2, 20, 4], ring = [0, 0, 10.1, 2.02, 10.1, 9, 0, 9];
  const whole = lineField([ring], [[0, 0, 20, 4]], 6, 0, 4, 6, 5, 2);
  const split = lineField([ring], [A, B], 6, 0, 4, 6, 5, 2);
  const alone = lineField([ring], [A], 6, 0, 4, 6, 5, 2);
  let maxSplit = 0, maxAlone = 0;
  for (let k = 0; k < whole.d.length; k++) { maxSplit = Math.max(maxSplit, Math.abs(whole.d[k]! - split.d[k]!), Math.abs(whole.sun[k]! - split.sun[k]!)); maxAlone = Math.max(maxAlone, Math.abs(whole.d[k]! - alone.d[k]!)); }
  assert.ok(maxSplit < 1e-5, `with the neighbour's edge: ${maxSplit}`);
  assert.ok(maxAlone > 0.01, `its own edge alone differs near the seam (${maxAlone.toFixed(3)}), hence the neighbours' edges`);
});

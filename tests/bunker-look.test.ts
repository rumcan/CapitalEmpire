/** Tests for T253 (#735) part 2, the bunkers as the owner's reference (bunker-look.ts): the bowl's shade under the far rim and light on the
 * near face, the rolled lip and the mounds round the sand, the rake lines fading at far zooms, world-anchored (seams agree), and the course
 * finish's bowl knob (0: the look before). Pure, Node. Units: tiles. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUNKER_IN, BUNKER_OUT, BUNKER_LOOK, GREEN_ROLL_REACH, bunkerImages, greenRollImages } from '../src/game/bunker-look.js';
import { lineField } from '../src/game/ext/course-grid/field.js';
import { DEFAULT_COURSE_FINISH, FINISH_RANGES, clampCourseFinish } from '../src/game/course-finish.js';
import { SUN_TILE_DIR } from '../src/game/ext/course-height/index.js';

/** an ellipse bunker centred at (cx, cy), radii a, b tiles: its ring (the sand on the left of travel, x east, y south) and the closed edge */
function bunker(cx: number, cy: number, a: number, b: number) {
  const ring: number[] = []; for (let k = 0; k < 96; k++) { const t = (k / 96) * Math.PI * 2; ring.push(cx + a * Math.cos(t), cy + b * Math.sin(t)); }
  return { ring, edge: [...ring, ring[0]!, ring[1]!] };
}
const REACH = Math.max(BUNKER_IN, BUNKER_OUT);
/** the images over a box, and a reader of a px's alphas (0..1) at a tile point */
function look(x0: number, y0: number, w: number, h: number, res = 12, px = 43) {
  const B = bunker(20, 20, 4, 3), F = lineField([B.ring], [B.edge], x0, y0, w, h, res, REACH, true), im = bunkerImages(F, 1, px);
  const at = (x: number, y: number) => {
    const u = Math.floor((x - x0) * res), v = Math.floor((y - y0) * res), k = 4 * (v * F.W + u) + 3;
    return { dark: (im.dark?.data[k] ?? 0) / 255, light: (im.light?.data[k] ?? 0) / 255, lift: (im.lift?.data[k] ?? 0) / 255, d: F.d[v * F.W + u]! };
  };
  return { F, im, at };
}
/** a point at distance r from (20, 20) toward the sun (far) or away from it (near), on the ellipse's axes scaled */
const toward = (s: number, r: number) => [20 + s * SUN_TILE_DIR.x * r, 20 + s * SUN_TILE_DIR.y * r] as const;

test('the bowl: shaded under the far rim (toward the sun), lit on the near face, the floor between calmer', () => {
  const { at } = look(10, 10, 20, 20);
  // 1 tile in from the rim on each side (the rim lies about 3 tiles out along the sun's mostly-y direction)
  const far = at(...toward(1, 1.9)), near = at(...toward(-1, 1.9)), mid = at(20, 20);
  console.log(`  far ${JSON.stringify(far)} near ${JSON.stringify(near)} middle ${JSON.stringify(mid)}`);
  assert.ok(far.d > 0 && near.d > 0, 'both inside the sand');
  assert.ok(far.dark > 0.3, `far shade ${far.dark}`);
  assert.ok(far.dark > near.dark + 0.25, 'darker under the far rim');
  assert.ok(near.light > far.light, 'the near face lit');
});

test('the rolled lip and the mounds: the far side\'s outer slope lit, the near side\'s shaded; nothing past the mounds\' foot', () => {
  const { at } = look(5, 5, 30, 30);
  const farOut = at(...toward(1, 3 + 1.0)), nearOut = at(...toward(-1, 3 + 1.0));
  assert.ok(farOut.d < 0 && nearOut.d < 0, 'outside the sand');
  assert.ok(farOut.lift > 0.05 && farOut.lift > nearOut.lift, `far lift ${farOut.lift} near ${nearOut.lift}`);
  assert.ok(nearOut.dark > farOut.dark, `near shade ${nearOut.dark} far ${farOut.dark}`);
  const gone = at(...toward(1, 3 + BUNKER_OUT + 0.6));
  assert.equal(gone.dark + gone.lift, 0, 'no light or shade past the mounds');
});

test('world-anchored: two boxes overlapping give the same light and shade at the same points (a chunk seam lights as one)', () => {
  const a = look(10, 10, 12, 20), b = look(16, 10, 14, 20);
  let worst = 0;
  for (let y = 12; y < 28; y += 0.37) for (let x = 17; x < 21.5; x += 0.41) {
    const p = a.at(x, y), q = b.at(x, y);
    worst = Math.max(worst, Math.abs(p.dark - q.dark), Math.abs(p.light - q.light), Math.abs(p.lift - q.lift));
  }
  // the rims' facing is blurred over its box (FACING_BLUR): a hair apart within that of a box's border, never more
  assert.ok(worst < 0.06, `worst ${worst}`);
  assert.deepEqual(look(10, 10, 20, 20).im, look(10, 10, 20, 20).im, 'deterministic');
});

test('the rake lines fade out where they would alias (a far zoom), the bowl stays', () => {
  const near = look(10, 10, 20, 20, 12, 43), far = look(10, 10, 20, 20, 12, BUNKER_LOOK.rakeMinPx / BUNKER_LOOK.rake);
  // the floor's shade wavers with the lines close up, and not at the far zoom
  const spread = (L: ReturnType<typeof look>) => { const v: number[] = []; for (let x = 18; x < 22; x += 0.05) v.push(L.at(x, 20.2).dark); return Math.max(...v) - Math.min(...v); };
  assert.ok(spread(near) > 0.05, `close up ${spread(near)}`);
  assert.ok(spread(far) < spread(near) / 3, `far ${spread(far)}`);
  assert.ok(far.at(...toward(1, 1.9)).dark > 0.3, 'the bowl stays');
});

test('the course finish carries the bowl: 1 the tuned look, 0 the bunkers before T253 part 2, held to 0..2', () => {
  assert.equal(DEFAULT_COURSE_FINISH.bowl, 1);
  assert.deepEqual(FINISH_RANGES.bowl, [0, 2]);
  assert.equal(clampCourseFinish({}).bowl, 1, 'a surfaces file from before keeps the tuned look');
  assert.equal(clampCourseFinish({ bowl: 0 }).bowl, 0);
  assert.equal(clampCourseFinish({ bowl: 9 }).bowl, 2);
});

test('part 3, the green\'s edge roll: lit inside its far (sun-facing) edge, shaded at its near one, flat in the middle and far off', () => {
  const B = bunker(20, 20, 6, 4), F = lineField([B.ring], [B.edge], 8, 8, 24, 24, 12, GREEN_ROLL_REACH), im = greenRollImages(F, 1);
  const at = (x: number, y: number) => { const u = Math.floor((x - 8) * 12), v = Math.floor((y - 8) * 12), k = 4 * (v * F.W + u) + 3; return { light: (im.light?.data[k] ?? 0) / 255, dark: (im.dark?.data[k] ?? 0) / 255 }; };
  // 0.3 tiles in from the rim toward and away from the sun (the rim lies about 4 tiles out along the sun's mostly-y direction)
  const far = at(...toward(1, 3.65)), near = at(...toward(-1, 3.65)), mid = at(20, 20), off = at(...toward(1, 4 + GREEN_ROLL_REACH + 0.5));
  assert.ok(far.light > 0.1 && far.dark === 0, `far ${JSON.stringify(far)}`);
  assert.ok(near.dark > 0.08 && near.light === 0, `near ${JSON.stringify(near)}`);
  assert.equal(mid.light + mid.dark, 0, 'the middle of the green is left as it is');
  assert.equal(off.light + off.dark, 0, 'nothing past the roll');
  assert.equal(DEFAULT_COURSE_FINISH.roll, 1); assert.equal(clampCourseFinish({ roll: 0 }).roll, 0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARRIVE, CROSS, FACINGS, FACING_ROW, Pedestrians, WALK_SPEED, facing, sidewalks, type Door, type WalkRoad } from '../src/game/ext/pedestrians/pedestrians';

const STREET = { h: 1.625, walk: 1.025 }, KERB = STREET.h + STREET.walk / 2;
/** a grid of streets n x n blocks, `gap` tiles apart, as straight open roads between the crossings */
function grid(n: number, gap: number): WalkRoad[] {
  const out: WalkRoad[] = [];
  for (let k = 0; k <= n; k++) for (let j = 0; j < n; j++) {
    out.push({ pts: [{ x: j * gap, y: k * gap }, { x: (j + 1) * gap, y: k * gap }], ...STREET, closed: false });
    out.push({ pts: [{ x: k * gap, y: j * gap }, { x: k * gap, y: (j + 1) * gap }], ...STREET, closed: false });
  }
  return out;
}
/** doors along every block face, 2 tiles in from the sidewalk: homes, with every fourth a place (a shop, work) */
function doorsOf(n: number, gap: number): Door[] {
  const out: Door[] = []; let k = 0;
  for (let by = 0; by < n; by++) for (let bx = 0; bx < n; bx++) for (let t = 8; t < gap - 6; t += 8) {
    const x0 = bx * gap, y0 = by * gap, d = KERB + 2;
    for (const [x, y] of [[x0 + t, y0 + d], [x0 + t, y0 + gap - d], [x0 + d, y0 + t], [x0 + gap - d, y0 + t]]) out.push({ x, y, kind: k++ % 4 === 3 ? 1 : 0 });
  }
  return out;
}
/** the distance from a point to the nearest road centreline */
function toRoad(roads: WalkRoad[], x: number, y: number) {
  let best = Infinity;
  for (const r of roads) for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1], b = r.pts[i], ux = b.x - a.x, uy = b.y - a.y, L2 = ux * ux + uy * uy, t = Math.max(0, Math.min(1, ((x - a.x) * ux + (y - a.y) * uy) / L2));
    best = Math.min(best, Math.hypot(x - a.x - ux * t, y - a.y - uy * t));
  }
  return best;
}
const town = (n = 4, gap = 40, walkers = 2000, seed = 7) => { const roads = grid(n, gap), P = new Pedestrians(seed, 40, walkers); P.setDoors(doorsOf(n, gap)); P.setSidewalks(sidewalks(roads)); P.populate(walkers); return { roads, P }; };

test('facing: the iso screen directions of moves along the tile axes and diagonals', () => {
  const name = (dx: number, dy: number) => FACINGS[facing(dx, dy)];
  assert.equal(name(1, 1), 'S'); assert.equal(name(-1, -1), 'N');
  assert.equal(name(1, -1), 'E'); assert.equal(name(-1, 1), 'W');
  assert.equal(name(1, 0), 'SE'); assert.equal(name(0, 1), 'SW');
  assert.equal(name(-1, 0), 'NW'); assert.equal(name(0, -1), 'NE');
  // the west side is drawn as the east mirrored
  assert.deepEqual(FACING_ROW[facing(0, 1)], [1, true]); assert.deepEqual(FACING_ROW[facing(1, 0)], [1, false]);
});

test('sidewalks: both sides of a street at the kerb plus half the walk, cut back clear of the junctions', () => {
  const s = sidewalks([{ pts: [{ x: 0, y: 0 }, { x: 40, y: 0 }], ...STREET, closed: false }]);
  assert.equal(s.length, 2);
  for (const w of s) {
    assert.ok(Math.abs(Math.abs(w.xy[1]) - KERB) < 1e-9, `offset ${w.xy[1]}`);
    assert.ok(Math.abs(w.len - (40 - 2 * (KERB + 0.5))) < 1e-9, `length ${w.len}`);
  }
  assert.equal(sidewalks([{ pts: [{ x: 0, y: 0 }, { x: 40, y: 0 }], h: 1.25, walk: 0.2, closed: false }]).length, 0, 'no sidewalk, no walkers');
});

test('2,000 walkers for 5 sim minutes: out on the sidewalks (or crossing at a junction), always appearing at a door, and arriving', () => {
  const { roads, P } = town(), out0 = new Uint8Array(P.n), t0 = performance.now();
  let off = 0, crossings = 0, appeared = 0, farFromDoor = 0, arrived = 0, maxOut = 0;
  const doors = doorsOf(4, 40);
  for (let k = 0; k < 3000; k++) {
    for (let i = 0; i < P.n; i++) out0[i] = P.isOut(i) ? 1 : 0;
    P.step(0.1);
    for (let i = 0; i < P.n; i++) {
      const now = P.isOut(i);
      if (now && !out0[i]) { appeared++; if (!doors.some(d => Math.hypot(d.x - P.x[i], d.y - P.y[i]) < 13)) farFromDoor++; }
      if (!now && out0[i]) arrived++;
    }
    if (k % 100) continue;
    maxOut = Math.max(maxOut, P.out);
    for (let i = 0; i < P.n; i++) {
      if (!P.isOut(i)) continue;
      const r = toRoad(roads, P.x[i], P.y[i]);
      if (Math.abs(r - KERB) > 0.35) { const jx = Math.abs(P.x[i] - Math.round(P.x[i] / 40) * 40), jy = Math.abs(P.y[i] - Math.round(P.y[i] / 40) * 40); if (jx > KERB + CROSS && jy > KERB + CROSS) off++; else crossings++; }
    }
  }
  console.log(`2000 walkers, 3000 steps: ${(performance.now() - t0).toFixed(0)} ms; ${appeared} came out of doors, ${arrived} went in; at most ${maxOut} out at once; ${crossings} samples crossing`);
  assert.equal(off, 0, `${off} samples off the sidewalks and away from the junctions`);
  assert.equal(farFromDoor, 0, `${farFromDoor} walkers appeared away from any door`);
  assert.ok(crossings > 0, 'nobody crossed a road');
  assert.ok(appeared > 1500 && arrived > 300, `${appeared} out, ${arrived} in`);
  assert.ok(maxOut > 300, `only ${maxOut} out at once`);
});

test('speed and walk cycle: about 1.4 m/s; frames 1-4 cycle while walking', () => {
  const road: WalkRoad = { pts: [{ x: 0, y: 0 }, { x: 4000, y: 0 }], ...STREET, closed: false };
  const P = new Pedestrians(3, 10, 200);
  P.setDoors([{ x: 20, y: KERB + 2, kind: 0 }, { x: 3900, y: KERB + 2, kind: 1 }]); P.setSidewalks(sidewalks([road])); P.populate(200);
  for (let k = 0; k < 100; k++) P.step(0.1);   // everyone out of the door
  const xs = Float32Array.from(P.x), seen = new Set<number>();
  for (let k = 0; k < 100; k++) { P.step(0.1); for (let i = 0; i < P.n; i++) if (P.isOut(i)) seen.add(P.frame(i)); }
  let sum = 0, n = 0; for (let i = 0; i < P.n; i++) { if (!P.isOut(i)) continue; const dx = Math.abs(P.x[i] - xs[i]); if (dx > 0.5) { sum += dx / 10; n++; } }
  const v = sum / n;
  assert.ok(n > 50, `${n} walkers measured`);
  assert.ok(v > WALK_SPEED * 0.75 && v < WALK_SPEED * 1.25, `mean speed ${v.toFixed(3)} tiles/s`);
  for (const f of [1, 2, 3, 4]) assert.ok(seen.has(f), `frame ${f} never shown`);
});

test('determinism, and a road edit leaves the walkers on unchanged sidewalks exactly where they were', () => {
  const run = () => { const { P } = town(3, 30, 500, 99); for (let k = 0; k < 300; k++) P.step(0.1); return Array.from(P.x.subarray(0, P.n)).join(','); };
  assert.equal(run(), run());
  const { roads, P } = town(3, 30, 500, 5);
  for (let k = 0; k < 400; k++) P.step(0.1);
  const xs = Float32Array.from(P.x), ys = Float32Array.from(P.y), wasOut = Array.from({ length: P.n }, (_, i) => P.isOut(i));
  P.setSidewalks(sidewalks(roads));   // the same roads again (an edit elsewhere)
  for (let i = 0; i < P.n; i++) if (wasOut[i]) { assert.ok(P.isOut(i), `walker ${i} went in`); assert.equal(P.x[i], xs[i]); assert.equal(P.y[i], ys[i]); }
  // a road removed: only the walkers on its sidewalks go (back indoors), nobody else moves
  P.setSidewalks(sidewalks(roads.slice(1)));
  let kept = 0; for (let i = 0; i < P.n; i++) if (wasOut[i] && P.isOut(i)) { kept++; assert.equal(P.x[i], xs[i]); }
  assert.ok(kept > 0);
  assert.equal(P.n, 500);
  const out: { x: number; y: number; face: number; frame: number; person: number }[] = [];
  assert.equal(P.inBox(-5, -5, 95, 95, out), P.out);
  assert.ok(ARRIVE > 0);
});

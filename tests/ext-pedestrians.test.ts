import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CROSS, FACINGS, FACING_ROW, Pedestrians, WALK_SPEED, facing, sidewalks, type WalkRoad } from '../src/game/ext/pedestrians/pedestrians';

const STREET = { h: 1.625, walk: 1.025 };
/** a grid of streets n x n blocks, `gap` tiles apart, as straight open roads between the crossings */
function grid(n: number, gap: number): WalkRoad[] {
  const out: WalkRoad[] = [];
  for (let k = 0; k <= n; k++) for (let j = 0; j < n; j++) {
    out.push({ pts: [{ x: j * gap, y: k * gap }, { x: (j + 1) * gap, y: k * gap }], ...STREET, closed: false });
    out.push({ pts: [{ x: k * gap, y: j * gap }, { x: k * gap, y: (j + 1) * gap }], ...STREET, closed: false });
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
  const d = STREET.h + STREET.walk / 2;
  for (const w of s) {
    assert.ok(Math.abs(Math.abs(w.xy[1]) - d) < 1e-9, `offset ${w.xy[1]}`);
    assert.ok(Math.abs(w.len - (40 - 2 * (d + 0.5))) < 1e-9, `length ${w.len}`);
  }
  assert.equal(sidewalks([{ pts: [{ x: 0, y: 0 }, { x: 40, y: 0 }], h: 1.25, walk: 0.2, closed: false }]).length, 0, 'no sidewalk, no walkers');
});

test('walkers stay on the sidewalks, cross at the corners, and keep walking (2,000 walkers, 3 sim minutes)', () => {
  const roads = grid(4, 40), P = new Pedestrians(7, 40, 2000);
  P.setSidewalks(sidewalks(roads)); P.populate(2000);
  const d = STREET.h + STREET.walk / 2, x0 = Float32Array.from(P.x), y0 = Float32Array.from(P.y), t0 = performance.now();
  let off = 0, crossings = 0;
  for (let k = 0; k < 1800; k++) {
    P.step(0.1);
    if (k % 60) continue;
    for (let i = 0; i < P.n; i++) {
      const r = toRoad(roads, P.x[i], P.y[i]);
      // on a sidewalk: the kerb distance plus or minus the lateral offset; on a crossing: anywhere, but near a junction
      if (Math.abs(r - d) > 0.35) { const jx = Math.abs(P.x[i] - Math.round(P.x[i] / 40) * 40), jy = Math.abs(P.y[i] - Math.round(P.y[i] / 40) * 40); if (jx > d + CROSS && jy > d + CROSS) off++; else crossings++; }
    }
  }
  const ms = performance.now() - t0;
  let moved = 0; for (let i = 0; i < P.n; i++) if (Math.hypot(P.x[i] - x0[i], P.y[i] - y0[i]) > 0.5) moved++;
  console.log(`2000 walkers, 1800 steps: ${ms.toFixed(0)} ms in all (with the checks); ${crossings} samples on crossings`);
  assert.equal(off, 0, `${off} samples off the sidewalks and away from the junctions`);
  assert.ok(crossings > 0, 'nobody crossed a road');
  assert.ok(moved > 1900);
});

test('speed and walk cycle: about 1.4 m/s; frames 1-4 cycle while walking, 0 while standing', () => {
  const P = new Pedestrians(3, 10, 200);
  P.setSidewalks(sidewalks([{ pts: [{ x: 0, y: 0 }, { x: 4000, y: 0 }], ...STREET, closed: false }])); P.populate(200);
  const xs = Float32Array.from(P.x), seen = new Set<number>();
  for (let k = 0; k < 100; k++) { P.step(0.1); for (let i = 0; i < P.n; i++) seen.add(P.frame(i)); }
  let sum = 0, n = 0; for (let i = 0; i < P.n; i++) { const dx = Math.abs(P.x[i] - xs[i]); if (dx > 0.5) { sum += dx / 10; n++; } }
  const v = sum / n;
  assert.ok(v > WALK_SPEED * 0.75 && v < WALK_SPEED * 1.25, `mean speed ${v.toFixed(3)} tiles/s`);
  for (const f of [1, 2, 3, 4]) assert.ok(seen.has(f), `frame ${f} never shown`);
});

test('determinism, and a road edit keeps the count with everyone on the new sidewalks', () => {
  const run = () => { const P = new Pedestrians(99, 40, 500); P.setSidewalks(sidewalks(grid(3, 30))); P.populate(500); for (let k = 0; k < 300; k++) P.step(0.1); return Array.from(P.x.subarray(0, P.n)).join(','); };
  assert.equal(run(), run());
  const P = new Pedestrians(5, 40, 500); P.setSidewalks(sidewalks(grid(3, 30))); P.populate(300);
  const roads = grid(1, 30); P.setSidewalks(sidewalks(roads));
  assert.equal(P.n, 300);
  for (let i = 0; i < P.n; i++) assert.ok(Math.abs(toRoad(roads, P.x[i], P.y[i]) - (STREET.h + STREET.walk / 2)) < 0.3, `walker ${i} not on the new sidewalks`);
  const out: { x: number; y: number; face: number; frame: number; person: number }[] = [];
  const m = P.inBox(-5, -5, 35, 35, out);
  assert.equal(m, 300); assert.ok(out.every(o => o.person >= 0 && o.person < 40 && o.face >= 0 && o.face < 8));
});

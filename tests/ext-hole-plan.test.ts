import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultPlan,
  centreLine,
  widthAt,
  edgeOffset,
  rasterPlan,
  planDiff,
  planAims,
  planInfo,
  planHandles,
  gridAreas,
  encodePlan,
  decodePlan,
  type HolePlan,
} from '../src/game/ext/hole-plan';
import { makeGrid, paintDisc, SURF, cellAt, cellCentre } from '../src/game/ext/course-grid';
import { deriveHoles } from '../src/game/golf/holes';

test('1. A straight 380 m line with seed 0 gives par 4; fairway width at s=210 is 40 ±1 m; fairway starts within 2 m of 100 m; green is 550 m² ±5%', () => {
  // 380 m straight line along X: 190 tiles (1 tile = 2 m)
  const tee = { x: 0, y: 0 };
  const green = { x: 190, y: 0 };
  const plan = defaultPlan(1, tee, green);
  plan.seed = 0; // seed 0 means no swell

  const info = planInfo(plan);
  assert.equal(info.par, 4, `expected par 4, got par ${info.par}`);
  assert.ok(Math.abs(info.lengthM - 380) <= 2, `expected length 380 m, got ${info.lengthM}`);

  // Grid for rasterisation: big enough to cover 0..190 tiles + margins
  const g = makeGrid(-20, -40, 500, 160); // 500x160 cells (250x80 tiles)
  const map = rasterPlan(plan, g);

  // Measure fairway width across cells at s = 210 m (x = 105 tiles)
  // Check column cx where x ≈ 105 tiles: count cells with SURF.fairway along Y
  const targetX = 105; // 210 m / 2
  let fwCellsAt210 = 0;
  for (let cy = 0; cy < g.h; cy++) {
    const pt = cellCentre(g, cy * g.w);
    const idx = cellAt(g, targetX, pt.y);
    if (idx >= 0 && map.get(idx) === SURF.fairway) {
      fwCellsAt210++;
    }
  }
  // Each cell is 1 m, so count equals width in metres
  assert.ok(
    Math.abs(fwCellsAt210 - 40) <= 1,
    `expected fairway width 40 ±1 m at s = 210, got ${fwCellsAt210} m`,
  );

  // Fairway starts within 2 m of 100 m (x = 50 tiles)
  let firstFwX: number | null = null;
  for (let cx = 0; cx < g.w; cx++) {
    const pt = cellCentre(g, cx);
    const idx = cellAt(g, pt.x, 0); // along line y = 0
    if (idx >= 0 && map.get(idx) === SURF.fairway) {
      firstFwX = pt.x * 2; // tiles to metres
      break;
    }
  }
  assert.ok(firstFwX !== null, 'fairway cells must exist');
  assert.ok(
    Math.abs(firstFwX! - 100) <= 2,
    `expected fairway start within 2 m of 100 m, got ${firstFwX} m`,
  );

  // Green is 550 m² ±5%
  let greenCells = 0;
  for (const s of map.values()) {
    if (s === SURF.green) greenCells++;
  }
  // Each cell is 1 m², so greenCells is green area in m²
  assert.ok(
    greenCells >= 550 * 0.95 && greenCells <= 550 * 1.05,
    `expected green area 550 m² ±5% (522..578), got ${greenCells} m²`,
  );
});

test('2. A 200 m line gives par 3 with no fairway and an 18 m apron', () => {
  // 200 m line: 100 tiles
  const tee = { x: 0, y: 0 };
  const green = { x: 100, y: 0 };
  const plan = defaultPlan(1, tee, green);

  const info = planInfo(plan);
  assert.equal(info.par, 3, `expected par 3, got par ${info.par}`);

  // No fairway before apron
  assert.equal(widthAt(plan, 50), 0, 'no fairway at 50 m');
  assert.equal(widthAt(plan, 100), 0, 'no fairway at 100 m');
  assert.equal(widthAt(plan, 150), 0, 'no fairway at 150 m');

  // 18 m apron over the last 25 m before green (200 - 25 = 175 m)
  assert.equal(widthAt(plan, 180), 18, '18 m apron near green');
  assert.equal(widthAt(plan, 190), 18, '18 m apron at green entrance');
});

test('3. A dogleg: the line passes through the bend; planAims returns it; deriveHoles on gridAreas of the raster gives no "off the course" warning', () => {
  const tee = { x: 0, y: 0 };
  const bend = { x: 60, y: 30 }; // dogleg bend in tiles
  const green = { x: 100, y: 100 };
  const plan = defaultPlan(1, tee, green, [bend]);

  // Centre line passes through the bend
  const line = centreLine(plan);
  let closestDist = Infinity;
  for (const p of line) {
    closestDist = Math.min(closestDist, Math.hypot(p.x - bend.x, p.y - bend.y));
  }
  assert.ok(
    closestDist < 0.5, // within 0.5 tile (1 m) of sample resolution
    `expected centre line to pass through bend, closest was ${closestDist} tiles`,
  );

  // planAims returns the bend
  const aims = planAims(plan);
  assert.equal(aims.length, 1);
  assert.equal(aims[0]!.x, bend.x);
  assert.equal(aims[0]!.y, bend.y);
  assert.equal(aims[0]!.order, 0);
  assert.equal(aims[0]!.hole, 1);

  // deriveHoles on gridAreas gives no "off the course" warning
  const areas = gridAreas(plan);
  const tees = [{ hole: 1, x: tee.x, y: tee.y, kind: 'back' as const }];
  const pins = [{ hole: 1, x: green.x, y: green.y }];
  const holes = deriveHoles(areas, tees, pins, aims);

  assert.equal(holes.length, 1);
  const offCourseWarning = holes[0]!.warnings.find((w) => w.toLowerCase().includes('off the course'));
  assert.equal(offCourseWarning, undefined, `unexpected warning: ${offCourseWarning}`);
});

test('4. Moving the green 20 m changes only cells in the symmetric difference', () => {
  const g = makeGrid(0, 0, 400, 200);
  const tee = { x: 20, y: 50 };
  const green1 = { x: 120, y: 50 }; // 200 m hole
  const plan1 = defaultPlan(1, tee, green1);

  // Initial planDiff
  planDiff(g, null, plan1, 1, 0);

  // Move green 20 m (10 tiles)
  const green2 = { x: 130, y: 50 };
  const plan2 = defaultPlan(1, tee, green2);

  const diff = planDiff(g, plan1, plan2, 1, 0);

  // Footprint maps
  const map1 = rasterPlan(plan1, g);
  const map2 = rasterPlan(plan2, g);

  // Changed cells in diff should strictly be where map1 and map2 differ
  for (let k = 0; k < diff.n; k++) {
    const idx = diff.idx[k]!;
    const s1 = map1.get(idx);
    const s2 = map2.get(idx);
    assert.notEqual(
      s1,
      s2,
      `cell ${idx} in diff should have differed between plan1 (${s1}) and plan2 (${s2})`,
    );
  }
});

test("5. A player bunker inside the fairway survives a plan edit; hole 5's cells never change while editing hole 4", () => {
  const g = makeGrid(0, 0, 400, 300);
  const planHole4 = defaultPlan(4, { x: 20, y: 50 }, { x: 150, y: 50 });
  planDiff(g, null, planHole4, 4, 0);

  // Player paints a bunker inside hole 4's fairway (at x = 80, y = 50)
  paintDisc(g, 80, 50, 3, SURF.bunker, 4, 0);
  const bunkerIdx = cellAt(g, 80, 50);
  assert.equal(g.surf[bunkerIdx], SURF.bunker, 'bunker placed');

  // Another hole (hole 5) exists on the grid
  const planHole5 = defaultPlan(5, { x: 20, y: 100 }, { x: 150, y: 100 });
  planDiff(g, null, planHole5, 5, 0);
  const hole5CellIdx = cellAt(g, 80, 100);
  assert.ok(hole5CellIdx >= 0, 'hole 5 cell index must be valid');
  assert.equal(g.hole[hole5CellIdx], 5, 'hole 5 cell set');
  const h5SurfBefore = g.surf[hole5CellIdx];

  // Edit hole 4 (e.g. widen fairway)
  const nextHole4: HolePlan = {
    ...planHole4,
    widths: planHole4.widths.map((w) => ({ s: w.s, w: w.w + 10 })),
  };
  planDiff(g, planHole4, nextHole4, 4, 1);

  // The player bunker MUST survive
  assert.equal(g.surf[bunkerIdx], SURF.bunker, 'player bunker must survive plan edit');

  // Hole 5 cell MUST be completely unchanged
  assert.equal(g.hole[hole5CellIdx], 5, 'hole 5 cell hole must remain 5');
  assert.equal(g.surf[hole5CellIdx], h5SurfBefore, 'hole 5 surface must remain unchanged');
});

test('6. The swell never exceeds 2.5 m, and two seeds differ', () => {
  const planA = defaultPlan(1, { x: 0, y: 0 }, { x: 150, y: 0 });
  planA.seed = 42;
  const planB = { ...planA, seed: 99 };

  let maxSwell = 0;
  let differences = 0;

  for (let s = planA.fwStart; s < 250; s += 2) {
    const swellA = edgeOffset(planA, s, 'left');
    const swellB = edgeOffset(planB, s, 'left');

    maxSwell = Math.max(maxSwell, Math.abs(swellA), Math.abs(swellB));
    if (Math.abs(swellA - swellB) > 0.01) {
      differences++;
    }
  }

  assert.ok(maxSwell <= 2.5001, `max swell (${maxSwell}) must not exceed 2.5 m`);
  assert.ok(differences > 10, 'two different seeds must produce different swells');
});

test('7. Deterministic and serializable (encodePlan / decodePlan)', () => {
  const plan = defaultPlan(3, { x: 15.5, y: 22.25 }, { x: 145.5, y: 88.75 }, [{ x: 80, y: 40 }]);
  plan.seed = 7;

  // encode and decode
  const encoded = encodePlan(plan);
  const decoded = decodePlan(encoded);
  assert.ok(decoded !== null, 'decoded plan must not be null');
  assert.deepEqual(decoded, plan, 'decoded plan must match original plan');

  // repeated calls to centreLine and rasterPlan are deterministic
  const line1 = centreLine(plan);
  const line2 = centreLine(plan);
  assert.deepEqual(line1, line2, 'centreLine must be deterministic');

  const handles = planHandles(plan);
  assert.equal(handles.tee.x, plan.tee.x);
  assert.equal(handles.green.x, plan.green.x);
  assert.equal(handles.bends.length, plan.bends.length);
  assert.ok(handles.widths.length > 0, 'must have width handles');
  assert.ok(handles.insertPoints.length > 0, 'must have insert points');

  const g1 = makeGrid(0, 0, 100, 100);
  const g2 = makeGrid(0, 0, 100, 100);
  const map1 = rasterPlan(plan, g1);
  const map2 = rasterPlan(plan, g2);
  assert.deepEqual(Array.from(map1.entries()), Array.from(map2.entries()), 'rasterPlan must be deterministic');
});

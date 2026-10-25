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
  planAreas,
  planGeom,
  planChanges,
  encodePlan,
  decodePlan,
  type HolePlan,
} from '../src/game/ext/hole-plan';
import { makeGrid, paintDisc, SURF, cellAt, cellCentre, applyDiff } from '../src/game/ext/course-grid';
import { gridAreas } from '../src/game/ext/course-grid/areas';
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

test('3. A dogleg through the real raster: the line passes through the bend; planAims returns it; planDiff, gridAreas(g) and deriveHoles give no warning', () => {
  const tee = { x: 10, y: 10 };
  const bend = { x: 70, y: 40 }; // dogleg bend in tiles
  const green = { x: 110, y: 110 };
  const plan = defaultPlan(1, tee, green, [bend]);

  // Centre line passes through the bend
  const line = centreLine(plan);
  let closestDist = Infinity;
  for (const p of line) closestDist = Math.min(closestDist, Math.hypot(p.x - bend.x, p.y - bend.y));
  assert.ok(closestDist < 0.5, `expected centre line to pass through bend, closest was ${closestDist} tiles`);

  // planAims returns the bend
  const aims = planAims(plan);
  assert.equal(aims.length, 1);
  assert.deepEqual([aims[0]!.x, aims[0]!.y, aims[0]!.order, aims[0]!.hole], [bend.x, bend.y, 0, 1]);

  // the real path: paint the plan into a grid, read the grid back as course areas (T078), derive the hole
  const g = makeGrid(-30, -30, 340, 340);
  const d = planDiff(g, null, plan, 1, 0);
  assert.ok(d.n > 0, 'planDiff paints cells');
  const holes = deriveHoles(gridAreas(g), [{ hole: 1, x: tee.x, y: tee.y, kind: 'back' as const }], [{ hole: 1, x: green.x, y: green.y }], aims);
  assert.equal(holes.length, 1);
  assert.deepEqual(holes[0]!.warnings, [], `unexpected warnings: ${holes[0]!.warnings.join('; ')}`);
  assert.equal(holes[0]!.par, planInfo(plan).par);
});

test('3b. The tee is one rounded 28 x 10 m strip that holds the back tee', () => {
  const cases: [{ x: number; y: number }, { x: number; y: number }][] = [
    [{ x: 0, y: 0 }, { x: 190, y: 0 }],
    [{ x: 0, y: 0 }, { x: 120, y: 140 }],
    [{ x: 50, y: 50 }, { x: -60, y: -40 }],
  ];
  for (const [tee, green] of cases) {
    const plan = defaultPlan(2, tee, green);
    const g = makeGrid(Math.min(tee.x, green.x) - 40, Math.min(tee.y, green.y) - 40, 600, 600);
    planDiff(g, null, plan, 2, 0);
    const teeCells: number[] = [];
    for (let i = 0; i < g.surf.length; i++) if (g.surf[i] === SURF.tee) teeCells.push(i);
    // the stadium: an 18 x 10 m body plus a 10 m disc = 258 m²
    assert.ok(teeCells.length >= 240 && teeCells.length <= 275, `tee area ${teeCells.length} m², expected about 258`);
    const at = cellAt(g, tee.x, tee.y);
    assert.equal(g.surf[at], SURF.tee, 'the back tee point is on the tee');
    // one blob: a flood from the back tee reaches every tee cell
    const seen = new Set<number>([at]);
    const stack = [at];
    while (stack.length) {
      const i = stack.pop()!;
      for (const j of [i - 1, i + 1, i - g.w, i + g.w]) if (g.surf[j] === SURF.tee && !seen.has(j)) { seen.add(j); stack.push(j); }
    }
    assert.equal(seen.size, teeCells.length, 'the tee is one piece');
  }
});

test('3c. A hairpin (about 130 degrees) leaves no hole in the rough corridor', () => {
  const plan = defaultPlan(1, { x: 0, y: 0 }, { x: 30, y: 60 }, [{ x: 100, y: 20 }]);
  const geom = planGeom(plan);
  assert.ok(geom.bends[0]!.turn > 120, `turn ${geom.bends[0]!.turn}`);
  const g = makeGrid(-60, -60, 440, 300);
  const map = rasterPlan(plan, g);
  let missing = 0;
  for (let i = 0; i < g.surf.length; i++) {
    const c = cellCentre(g, i);
    let best = Infinity;
    for (const p of geom.line) best = Math.min(best, (p.x - c.x) ** 2 + (p.y - c.y) ** 2);
    if (Math.sqrt(best) * 2 <= 27 && !map.has(i)) missing++;
  }
  assert.equal(missing, 0, `${missing} cells within 27 m of the line are missing`);
});

test('4. Moving the green 20 m changes only cells in the symmetric difference, and diff is applied and undoable', () => {
  const g = makeGrid(0, 0, 400, 200);
  const tee = { x: 20, y: 50 };
  const green1 = { x: 120, y: 50 }; // 200 m hole
  const plan1 = defaultPlan(1, tee, green1);

  // Initial planDiff
  planDiff(g, null, plan1, 1, 0);
  const oldGreenIdx = cellAt(g, 120, 50);
  assert.equal(g.surf[oldGreenIdx], SURF.green, 'initial green must be green');

  // Move green 20 m (10 tiles)
  const green2 = { x: 130, y: 50 };
  const plan2 = defaultPlan(1, tee, green2);

  const diff = planDiff(g, plan1, plan2, 1, 0);
  assert.ok(diff.n > 0, 'diff should contain changes');

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

  // Assert diff was applied to grid: new green cell is green, old green cell is no longer green
  const newGreenIdx = cellAt(g, 130, 50);
  assert.equal(g.surf[newGreenIdx], SURF.green, 'new green must be applied to grid');
  assert.notEqual(g.surf[oldGreenIdx], SURF.green, 'old green cell should no longer be green');

  // Assert undo works cleanly
  applyDiff(g, diff, true);
  assert.equal(g.surf[oldGreenIdx], SURF.green, 'undo should restore old green');
});

test("5. Plan diff narrows widths, moves green cleanly without orphaned green, survives player bunker, and preserves planted months", () => {
  const g = makeGrid(0, 0, 400, 300);
  const planHole4 = defaultPlan(4, { x: 20, y: 50 }, { x: 150, y: 50 });
  planDiff(g, null, planHole4, 4, 0);

  let initialFwCount = 0;
  for (let i = 0; i < g.surf.length; i++) {
    if (g.surf[i] === SURF.fairway && g.hole[i] === 4) initialFwCount++;
  }
  assert.ok(initialFwCount > 0, 'initial fairway cells exist');

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

  // A. Narrow hole 4 by 10 m
  const narrowHole4: HolePlan = {
    ...planHole4,
    widths: planHole4.widths.map((w) => ({ s: w.s, w: Math.max(10, w.w - 10) })),
  };
  planDiff(g, planHole4, narrowHole4, 4, 1);

  let narrowFwCount = 0;
  for (let i = 0; i < g.surf.length; i++) {
    if (g.surf[i] === SURF.fairway && g.hole[i] === 4) narrowFwCount++;
  }
  assert.ok(narrowFwCount < initialFwCount, `narrowing widths must reduce fairway cells (from ${initialFwCount} to ${narrowFwCount})`);

  // B. Move green 30 m (15 tiles) farther
  const moveGreenHole4: HolePlan = {
    ...narrowHole4,
    green: { x: narrowHole4.green.x + 15, y: narrowHole4.green.y },
  };
  planDiff(g, narrowHole4, moveGreenHole4, 4, 2);

  let greenCells = 0;
  for (let i = 0; i < g.surf.length; i++) {
    if (g.surf[i] === SURF.green && g.hole[i] === 4) greenCells++;
  }
  // Green area is ~550 m², so greenCells should remain around 550 without doubling
  assert.ok(greenCells >= 520 && greenCells <= 580, `moving green must not leave old green behind, got ${greenCells}`);

  // C. Re-planning the identical plan 6 months later must not re-seed unchanged cells
  const reseedDiff = planDiff(g, moveGreenHole4, moveGreenHole4, 4, 8);
  assert.equal(reseedDiff.n, 0, 're-planning identical plan should not re-seed unchanged cells');

  // The player bunker MUST survive
  assert.equal(g.surf[bunkerIdx], SURF.bunker, 'player bunker must survive plan edit');

  // Hole 5 cell MUST be completely unchanged
  assert.equal(g.hole[hole5CellIdx], 5, 'hole 5 cell hole must remain 5');
  assert.equal(g.surf[hole5CellIdx], h5SurfBefore, 'hole 5 surface must remain unchanged');
});

test('6. The swell never exceeds 2.5 m, two seeds differ, and 15% outside dogleg applies with seed 0', () => {
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

  // Tee (0, 0) -> bend (80, 0) -> green (80, 80): heading east, then south (+y). The left normal (-dy, dx) of an
  // eastward line is +y, the side the hole turns to: the inside. The outside is the right (north-east).
  const dog = defaultPlan(1, { x: 0, y: 0 }, { x: 80, y: 80 }, [{ x: 80, y: 0 }]);
  const geom = planGeom(dog);
  const sb = geom.bends[0]!.s;
  assert.equal(geom.bends[0]!.out, 1, 'the outside is the right');
  const w = widthAt(dog, sb);
  const right = edgeOffset(dog, sb, 'right');
  const left = edgeOffset(dog, sb, 'left');
  assert.ok(Math.abs(right - 0.15 * w) < 0.01, `outside (right) gets 15% of ${w} m at a 90 degree turn, got ${right}`);
  assert.equal(left, 0, `inside (left) gets nothing, got ${left}`);

  // in cells: from the bend point the fairway reaches farther to the outside (north-east) than to the inside (south-west)
  const g = makeGrid(-40, -60, 300, 300);
  planDiff(g, null, dog, 1, 0);
  const reach = (dx: number, dy: number) => {
    let k = 0;
    while (g.surf[cellAt(g, 80 + dx * (k + 1) * 0.5, dy * (k + 1) * 0.5)] === SURF.fairway) k++;
    return k; // metres (steps of 0.5 tile)
  };
  const outM = reach(Math.SQRT1_2, -Math.SQRT1_2), inM = reach(-Math.SQRT1_2, Math.SQRT1_2);
  assert.ok(outM > inM + 2, `outside reach ${outM} m must exceed inside reach ${inM} m`);

  // a gentle bend of about 7 degrees gets a proportional share only
  const gentle = defaultPlan(1, { x: 0, y: 0 }, { x: 160, y: 10 }, [{ x: 80, y: 0 }]);
  const gg = planGeom(gentle);
  const turn = gg.bends[0]!.turn, sg = gg.bends[0]!.s;
  const boost = Math.max(edgeOffset(gentle, sg, 'left'), edgeOffset(gentle, sg, 'right'));
  const wg = widthAt(gentle, sg);
  assert.ok(turn > 5 && turn < 10, `turn ${turn}`);
  assert.ok(Math.abs(boost - 0.15 * wg * (turn / 45)) < 0.05, `a ${turn.toFixed(1)} degree turn gets ${boost} m`);
});

test('7. Deterministic and serializable (encodePlan / decodePlan tuple)', () => {
  const plan = defaultPlan(3, { x: 15.5, y: 22.25 }, { x: 145.5, y: 88.75 }, [{ x: 80, y: 40 }]);
  plan.seed = 7;

  // encode returns tuple
  const encoded = encodePlan(plan);
  assert.ok(Array.isArray(encoded), 'encodePlan must return tuple');
  assert.equal(encoded.length, 10);

  const decoded = decodePlan(encoded);
  assert.ok(decoded !== null, 'decoded plan must not be null');
  assert.deepEqual(decoded, plan, 'decoded plan must match original plan');

  // decodePlan rejects invalid input
  assert.equal(decodePlan([1, [0, 0], [10, 10], 'invalid_shape', 550, 0, [], [], 100, 0]), null);
  assert.equal(
    decodePlan([
      1,
      [0, 0],
      [10, 10],
      'round',
      550,
      0,
      [
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
      ], // > 3 bends
      [],
      100,
      0,
    ]),
    null,
  );

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

  assert.ok(planAreas(plan).some((a) => a.surface === 'tee'), 'planAreas gives the tee');

  // the archetype greens load; holes outside 1..18 do not
  assert.equal(decodePlan(encodePlan({ ...plan, greenShape: 'green-peanut' }))?.greenShape, 'green-peanut');
  assert.equal(decodePlan(encodePlan({ ...plan, greenShape: 'green-kidney' }))?.greenShape, 'green-kidney');
  assert.equal(decodePlan(encodePlan({ ...plan, hole: 19 })), null);
  assert.equal(decodePlan(encodePlan({ ...plan, hole: 0 })), null);
  assert.equal(decodePlan(JSON.stringify(encodePlan(plan)))?.hole, 3, 'the JSON form decodes');

  const g1 = makeGrid(0, 0, 100, 100);
  const g2 = makeGrid(0, 0, 100, 100);
  const map1 = rasterPlan(plan, g1);
  const map2 = rasterPlan(plan, g2);
  assert.deepEqual(Array.from(map1.entries()), Array.from(map2.entries()), 'rasterPlan must be deterministic');
});

test('8. Speed: a 3-bend hole rasters and plans in a few milliseconds', () => {
  const plan = defaultPlan(1, { x: 0, y: 0 }, { x: 200, y: 160 }, [{ x: 60, y: 10 }, { x: 110, y: 70 }, { x: 170, y: 90 }]);
  const moved = { ...plan, green: { x: 205, y: 170 } };
  const g = makeGrid(-40, -40, 600, 520);
  planDiff(g, null, plan, 1, 0); // warm up
  const time = (f: () => void, k = 10) => { const t0 = performance.now(); for (let i = 0; i < k; i++) f(); return (performance.now() - t0) / k; };
  const raster = time(() => rasterPlan(plan, g));
  const changes = time(() => planChanges(g, plan, moved, 1, 0));
  const one = time(() => edgeOffset(plan, 200, 'left'), 200);
  console.log(`hole-plan speed: rasterPlan ${raster.toFixed(2)} ms, planChanges ${changes.toFixed(2)} ms, edgeOffset ${(one * 1000).toFixed(1)} us (3 bends, ${planInfo(plan).lengthM} m)`);
  assert.ok(raster < 40, `rasterPlan ${raster} ms`);
  assert.ok(changes < 80, `planChanges ${changes} ms`);
});

test('9. Cells both plans agree on keep a hand touch-up; planChanges does not touch the grid', () => {
  const g = makeGrid(0, 0, 500, 200);
  const plan = defaultPlan(4, { x: 10, y: 50 }, { x: 190, y: 50 });
  planDiff(g, null, plan, 4, 0);
  // the player rubs a fairway cell back to rough by hand
  const i = cellAt(g, 110, 50);
  assert.equal(g.surf[i], SURF.fairway);
  g.surf[i] = SURF.rough;
  const rev = g.rev;
  const edited = { ...plan, green: { x: 195, y: 52 } };
  const dry = planChanges(g, plan, edited, 4, 1);
  assert.equal(g.rev, rev, 'planChanges is a dry run');
  assert.ok(dry.n > 0);
  planDiff(g, plan, edited, 4, 1);
  assert.equal(g.surf[i], SURF.rough, 'the hand touch-up stays');
});

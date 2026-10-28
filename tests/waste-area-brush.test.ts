// T222 (#618; the owner, 2026-10-27: "also add desert as a waste bunker in the course"): Holes ▸ Shape by hand gains the Waste area, a Course brush that
// lays the course grid's waste surface (the desert: Painted › Waste area sand wears desert-run), priced like a bunker and played as sand. Headless.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRUSH_PRESETS } from '../src/game/paint';
import { GRID_KINDS, PaintTool } from '../src/game/paint-tool';
import { SURF, CELL_T, cellAt, makeGrid } from '../src/game/ext/course-grid';
import { SURF_SURFACE, gridAreas } from '../src/game/ext/course-grid/areas';
import { SURFACE_COST, unitBuildCost, surfaceOfTex } from '../src/game/golf/costs';
import { makeCourseView } from '../src/game/golf/play';
import type { Hole } from '../src/game/golf/holes';
import { BRUSH_STAGE } from '../src/game/ext/progressive-ui';
import { clampSurfaces, lookOfTex } from '../src/game/painted-surfaces';
import FILE from '../src/game/painted-surfaces.json';

const HOST = { setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [] };
/** a golf game's Paint tool on a fresh course grid (all the land yours, 1,000,000 $) */
function golfTool() {
  const g = makeGrid(80, 180, 80, 80), money = { cash: 1e6 };
  const tool = new PaintTool({ ...HOST, golfMode: () => true, grid: () => g, gridChanged() {}, gridAreas: () => gridAreas(g), ownedAt: () => true, landWhy: () => '', money: () => money.cash, spend: (n: number) => { money.cash -= n; } });
  tool.course = true;
  return { g, tool, money };
}
/** a press and release at the tool's cursor: the cells it changed */
function click(g: ReturnType<typeof makeGrid>, tool: PaintTool): number[] {
  const before = g.surf.slice(), out: number[] = [];
  tool.pointerDown(tool.cursor!, 0, 0); tool.pointerUp(0.5);
  for (let i = 0; i < g.surf.length; i++) if (g.surf[i] !== before[i]) out.push(i);
  return out;
}

test('Shape by hand lists the Waste area: key 7 (keys 1-6 keep their surfaces; the cart path moves to 8), a grid brush, open from stage 2 with the bunker', () => {
  const last = BRUSH_PRESETS[6]!;
  assert.equal(last.kind, 'waste'); assert.equal(last.name, 'Waste area');
  assert.deepEqual(BRUSH_PRESETS.map(b => b.kind), ['fairway', 'green', 'tee', 'rough', 'bunker', 'water', 'waste', 'path', 'longGrass'], 'keys 1-6 as before, the Waste area 7, the cart path (stage 3) 8, T238: Long grass 9');
  assert.ok(GRID_KINDS.includes('waste'), 'it paints the course grid');
  assert.equal(BRUSH_STAGE.waste, BRUSH_STAGE.bunker);
  assert.equal(surfaceOfTex(last.style.tex), 'waste', 'its texture is the waste surface\'s (the owner\'s preset for it, else the waste sand)');
  assert.equal(SURF_SURFACE[SURF.waste], 'waste');
});

test('the Waste area brush lays the waste surface on the course grid (key 7 arms it), and only that', () => {
  const { g, tool } = golfTool();
  tool.setBrush('fairway'); tool.setBrushCells(2); tool.cursor = { x: 90.3, y: 200.6 };
  assert.equal(tool.key({ key: '7', preventDefault() {} } as KeyboardEvent), true, 'key 7 is taken');
  assert.equal(tool.brushKind, 'waste');
  const changed = click(g, tool);
  assert.ok(changed.length >= 4, `a 2 m square brush lays its cells (${changed.length})`);
  for (const i of changed) assert.equal(g.surf[i], SURF.waste, 'every cell it changed is waste');
  assert.equal(g.surf.filter(s => s === SURF.waste).length, changed.length);
  // a stroke of it slides under a green (the brush rules: a higher surface stays on top), and a bunker below it is taken over
  tool.setBrush('green'); tool.cursor = { x: 90.3, y: 200.6 }; tool.setBrushCells(1); click(g, tool);
  assert.ok(g.surf.some(s => s === SURF.green));
  const i0 = cellAt(g, 90.3, 200.6); assert.equal(g.surf[i0], SURF.green);
  tool.setBrush('waste'); tool.cursor = { x: 90.3, y: 200.6 }; click(g, tool); assert.equal(g.surf[i0], SURF.green, 'the green stays on top of the waste');
});

test('it is priced like a bunker: the same per cell, and the brush\'s live price agrees', () => {
  assert.deepEqual(SURFACE_COST.waste, SURFACE_COST.bunker, 'the same seed price, grow-in and upkeep');
  assert.equal(unitBuildCost('waste'), unitBuildCost('bunker'));
  const spend = (kind: 'waste' | 'bunker') => {
    const { g, tool, money } = golfTool();
    tool.setBrush(kind); tool.setBrushCells(2); tool.cursor = { x: 90.3, y: 200.6 };
    const price = tool.brushCellCost()!, quoted = (() => { let n = 0; for (let i = 0; i < g.surf.length; i++) { const c = { x: g.x0 + (i % g.w + 0.5) * CELL_T, y: g.y0 + (Math.floor(i / g.w) + 0.5) * CELL_T }; n += price(c.x, c.y) > 0 ? 1 : 0; } return n; })();
    const cells = click(g, tool).length; assert.ok(quoted >= cells && cells > 0);
    return { cells, spent: 1e6 - money.cash, unit: price(g.x0 + 0.5, g.y0 + 0.5) };
  };
  const w = spend('waste'), b = spend('bunker');
  assert.equal(w.cells, b.cells, 'the same footprint'); assert.equal(w.spent, b.spent, 'the same bill'); assert.equal(w.unit, b.unit);
  assert.ok(w.spent > 0, 'it is not free');
});

test('a ball on waste plays as sand: its lie is the bunker lie', () => {
  const hole: Hole = { n: 1, par: 4, lengthM: 300, memberLengthM: 280, line: [{ x: 84, y: 190 }, { x: 110, y: 210 }], warnings: [] };
  /** the lie of the first cell a 2 m brush of `kind` lays, on a played course read off the grid as the engine reads it (buildPlay's surfAt) */
  const lieOf = (kind: 'waste' | 'bunker') => {
    const { g, tool } = golfTool(); tool.setBrush(kind); tool.setBrushCells(2); tool.cursor = { x: 90.3, y: 200.6 };
    const i = click(g, tool)[0]!, cx = g.x0 + (i % g.w + 0.5) * CELL_T, cy = g.y0 + (Math.floor(i / g.w) + 0.5) * CELL_T;
    return makeCourseView([hole], (x, y) => { const k = cellAt(g, x, y); return k >= 0 ? SURF_SURFACE[g.surf[k]!] ?? null : null; }).lieAt(cx, cy);
  };
  assert.equal(lieOf('waste'), 'bunker', 'waste plays as sand');
  assert.equal(lieOf('waste'), lieOf('bunker'), 'the same lie as a bunker cell');
});

test('Painted › Waste area sand wears the desert (the painted-surfaces file), so the brush lays the desert', () => {
  assert.equal(lookOfTex('wasteSand', clampSurfaces(FILE))!.family, 'desert-run');
});

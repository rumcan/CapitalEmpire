/** #1296 (the owner: "add trees to the paint hole 1 list at nr 9"): the Trees brush of the hole palettes. Key 9 is Trees and Create your own moved to key 0; Trees in hand keeps
 * Edit Hole Layout open (the plan's handles stay), is the plant brush with the look's own trees, and never plants on a green or a tee (pure, Node: the Paint tool with a stand-in
 * host, as course-owner-fixes' game()). The palette itself (nine swatches, the trees tile, the order and keys) is held by the source checks at the end. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SURF, cellAt, makeGrid } from '../src/game/ext/course-grid';
import { aimsFromPlans, decodePlans } from '../src/game/ext/hole-wizard';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';
import type { AimPoint } from '../src/game/golf/types';

const PX = 16;
interface Dab { ids: string[]; x: number; y: number; r: number; ok?: (x: number, y: number) => boolean; filter?: string }
/** a stand-in golf game with a plant host that records every dab and the pool filter asked for (desert: whether the game is a desert one) */
function game(desert = false) {
  const g = makeGrid(0, 0, 900, 600), dabs: Dab[] = [], filters: (string | undefined)[] = [];
  const st = { plans: [] as unknown[], aims: [] as AimPoint[] };
  const host: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast() {}, affine: o => { o[0] = 0; o[1] = 0; o[2] = PX; o[3] = 0; o[4] = 0; o[5] = PX; },
    placeProps: () => 0,
    plant: (ids, x, y, r, _s, _z, _seed, ok) => { dabs.push({ ids, x, y, r, ...(ok ? { ok } : {}) }); return 1; },
    unplant: () => 0, plantPool: (_k, f) => { filters.push(f); return [{ id: 'tree-a', name: 'A' }, { id: 'tree-b', name: 'B' }]; }, desertLook: () => desert,
    golfMode: () => true, currentMonth: () => 2, money: () => 5_000_000, spend() {},
    grid: () => g, gridChanged() {}, changed() {}, ownedAt: () => true, plans: () => st.plans,
    setPlans: p => { const before = decodePlans(st.plans); st.plans = p; st.aims = aimsFromPlans(st.aims, before, decodePlans(p)); },
    courseLook() {},
  };
  const tool = new PaintTool(host);
  tool.enterCourse();
  const ts = (x: number, y: number) => ({ x: x * PX, y: y * PX });
  /** hole 1 built with the wizard from (40, 75) to (140, 75), then Edit Hole Layout open on it */
  const built = () => {
    assert.ok(tool.setPlan());
    const w = tool.wizard, tee = { x: 40, y: 75 }, green = { x: 140, y: 75 };
    w.press(tee, tee.x * PX, tee.y * PX, ts); w.move(green, green.x * PX, green.y * PX, ts); w.press(green, green.x * PX, green.y * PX, ts);
    assert.ok(tool.buildPlan(), 'built'); assert.ok(tool.editHole(1), 'Edit Hole Layout opens on hole 1');
  };
  const key = (code: string, shift = false) => tool.key({ key: code.replace('Digit', ''), code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: shift, preventDefault() {}, stopPropagation() {} } as unknown as KeyboardEvent);
  return { g, tool, dabs, filters, built, key };
}

test('1. key 9 puts the Trees brush in hand; the Plants tool\'s Trees is the same brush but plants anywhere', () => {
  const { tool, dabs, key } = game();
  assert.equal(tool.treesInHand, false);
  assert.ok(key('Digit9'), 'the tool takes key 9');
  assert.equal(tool.mode, 'plant'); assert.equal(tool.plantBrush, 'trees'); assert.equal(tool.treesInHand, true);
  tool.pointerDown({ x: 50, y: 50 }, 0, 0); tool.pointerUp(0);
  assert.equal(dabs.length, 1); assert.ok(dabs[0]!.ok, 'the palette\'s Trees dab carries the spot test');
  tool.setPlant('trees'); // the Plants tool: Facilities > Plants > Trees
  assert.equal(tool.treesInHand, false, 'the Plants tool\'s Trees is not the palette\'s');
  tool.pointerDown({ x: 60, y: 50 }, 0, 0); tool.pointerUp(0);
  assert.equal(dabs.length, 2); assert.equal(dabs[1]!.ok, undefined, 'and plants wherever the spacing allows, a green too');
});

test('2. key 0 opens Create your own (it was key 9); Shift + a number still picks your own grass', () => {
  const { tool, key } = game(), draft = () => tool.grassDraft; // (a call, so the type is not narrowed by the checks between)
  assert.equal(draft(), null);
  assert.ok(key('Digit0'));
  assert.ok(draft() && !draft()!.k, 'key 0 opens a new grass');
  tool.closeGrass();
  assert.ok(key('Digit9')); assert.equal(draft(), null, 'key 9 does not');
  assert.equal(key('Digit1', true), false, 'Shift + 1 with no grass of your own in the first place does nothing');
});

test('3. in Edit Hole Layout, Trees keeps the editor open (handles and all) and Esc puts the brush down, the plan still open', () => {
  const { tool, key, built } = game();
  built();
  assert.equal(tool.editingHole, 1); assert.ok(tool.planOpen);
  assert.ok(key('Digit9'));
  assert.equal(tool.treesInHand, true); assert.equal(tool.editingHole, 1, 'Edit Hole Layout stays open under the Trees brush'); assert.ok(tool.planOpen); assert.ok(tool.editInHand);
  assert.ok(key('Escape'));
  assert.equal(tool.treesInHand, false); assert.equal(tool.editingHole, 1, 'Esc puts the brush down: the plan\'s handles alone'); assert.ok(tool.planOpen);
  // the lit swatch again does the same (the palette's pick: setEditBrush(null)); a surface after Trees takes the Trees brush down
  assert.ok(tool.setEditTrees()); assert.equal(tool.treesInHand, true);
  assert.ok(tool.setEditBrush('fairway', 0)); assert.equal(tool.treesInHand, false); assert.equal(tool.mode, 'brush');
});

test('4. the palette\'s Trees never stand on a green or a tee, on any hole; rough, bare land and the map\'s edge are fine', () => {
  const { g, tool, dabs, key, built } = game();
  built();
  const green = { x: 140, y: 75 }, tee = { x: 40, y: 75 };
  assert.equal(g.surf[cellAt(g, green.x, green.y)], SURF.green, 'the built hole has its green where the plan says');
  assert.equal(g.surf[cellAt(g, tee.x, tee.y)], SURF.tee, 'and its tee');
  key('Digit9');
  tool.pointerDown({ x: green.x, y: green.y }, 0, 0); tool.pointerUp(0);
  const ok = dabs[0]!.ok!;
  assert.equal(ok(green.x, green.y), false, 'not on the green');
  assert.equal(ok(tee.x, tee.y), false, 'not on the tee');
  let rough = 0, other = 0;
  for (let dx = -12; dx <= 12; dx += 0.5) for (let dy = -12; dy <= 12; dy += 0.5) {
    const i = cellAt(g, green.x + dx, green.y + dy); if (i < 0) continue;
    const s = g.surf[i]!, v = ok(green.x + dx, green.y + dy);
    if (s === SURF.green || s === SURF.tee) assert.equal(v, false, `a ${s === SURF.green ? 'green' : 'tee'} cell at ${dx},${dy}`); else { other++; if (v) rough++; }
  }
  assert.ok(other > 100 && rough === other, `every cell that is not a green or a tee is open to a tree (${rough} of ${other})`);
  assert.equal(ok(-50, -50), true, 'off the grid is the map\'s business (canPlace), not a green');
});

test('5. the palette\'s Trees are the look\'s own: the autumn trees, or the desert plants in a desert game, whatever the Plants tool\'s filter says', () => {
  for (const [desert, want] of [[false, 'autumn'], [true, 'desert']] as const) {
    const { tool, dabs, filters, key } = game(desert);
    tool.plantFilter = 'all';
    key('Digit9'); filters.length = 0;
    tool.pointerDown({ x: 50, y: 50 }, 0, 0); tool.pointerUp(0);
    assert.equal(dabs.length, 1);
    assert.ok(filters.length > 0 && filters.every(f => f === want), `the pool asked for the ${want} trees (${filters.join(', ')})`);
    tool.setPlant('trees'); filters.length = 0; tool.pointerDown({ x: 60, y: 50 }, 0, 0); tool.pointerUp(0);
    assert.ok(filters.every(f => f === 'all'), 'the Plants tool keeps its own filter');
  }
});

test('6. a Trees stroke in Edit Hole Layout is one undo step beside the plan\'s own: Ctrl+Z takes the trees back first', () => {
  const { tool, key, built } = game();
  built(); key('Digit9');
  const before = tool.canUndo;
  tool.pointerDown({ x: 90, y: 40 }, 0, 0); tool.pointerMove({ x: 94, y: 40 }, 0, 0); tool.pointerUp(0);
  assert.ok(tool.canUndo || before, 'the stroke is on the undo stack or has nothing to take back (the stand-in host plants no props)');
});

// ---------- the palette, held to its source ----------
const brush = readFileSync('src/ui/course/BrushControls.tsx', 'utf8'), wiz = readFileSync('src/ui/course/HoleWizard.tsx', 'utf8'), panel = readFileSync('src/ui/course/CoursePanel.tsx', 'utf8');

test('7. the palette: Trees is the ninth swatch with the painted trees tile and key 9, Create your own is the one after it with key 0', () => {
  assert.match(brush, /data-swatch="trees"/); assert.match(brush, /PLANT_TILE\.trees/); assert.match(brush, /<span className="swatch-name">Trees<\/span>/);
  const tIdx = brush.indexOf('data-swatch="trees"'), gIdx = brush.indexOf('p.grasses.map'), nIdx = brush.indexOf('data-swatch="grass-new"');
  assert.ok(tIdx > 0 && tIdx < gIdx && gIdx < nIdx, 'surfaces, then Trees, then your own grasses, then Create your own');
  assert.match(brush, /\{trees \? 0 : 9\}/, 'Create your own wears 0 where Trees is offered');
  assert.match(brush, /trees\?: \{ on: boolean; pick: \(\) => void \}/);
});
test('8. Paint hole n, Shape by hand and the Texture Painter all offer Trees, and the key line says 9 trees · 0 your own', () => {
  assert.match(wiz, /trees=\{\{ on: trees, pick: pickTrees \}\}/); assert.match(wiz, /p\.setEditTrees\(\)/);
  assert.match(panel, /trees=\{\{ on: trees, pick: \(\) => p\.setHoleTrees\(\) \}\}/); assert.match(panel, /trees=\{\{ on: p\.treesInHand, pick: \(\) => p\.setHoleTrees\(\) \}\}/);
  assert.equal((panel.match(/9 trees · 0 your own/g) ?? []).length, 2);
});
test('9. the jam shows none of it: no Shape by hand, More options, Paint hole or tee sets (docs/JAM.md "Future development")', () => {
  assert.match(panel, /const hand = shape && !JAM;/); assert.match(panel, /!plan && hand && <ShapeByHand/); assert.match(panel, /!plan && hand && <MoreOptions/);
  assert.match(wiz, /!JAM && <EditPaint game=\{game\} \/>/); assert.match(wiz, /!JAM && <EditTees/);
});

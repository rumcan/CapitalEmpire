/** Modes never steal a click; Esc closes menus first (T116, P23 P1-A; docs/plans/P23-UX.md 4.10): picking a build tool closes the Grass
 * panel and the Land, Holes and Event switches, opening one closes the others, and Esc walks its ladder in order: the topmost menu or card,
 * the tool's own step (the brush drops the stroke in hand, never flipping Brush and Shape), then Select (pure, Node: tool-modes.ts and a
 * PaintTool with a stand-in host). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESC_CARDS, SIDE_MODES, escapeLadder, pickTool, switchSideMode, topCard, type EscCard, type SideModes } from '../src/game/tool-modes';
import type { Tool } from '../src/game/types';
import { makeGrid } from '../src/game/ext/course-grid';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';

const ALL_TOOLS: Tool[] = ['select', 'road', 'junction', 'bulldoze', 'park', 'toll', 'bus', 'lane', 'downgrade', 'business', 'paint', 'course', 'path'];
const allOn = (): SideModes => ({ grassPanel: true, landMode: true, holesTool: true, eventTool: true });
const allOff = (): SideModes => ({ grassPanel: false, landMode: false, holesTool: false, eventTool: false });
const ESC = { key: 'Escape', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} } as unknown as KeyboardEvent;

/** a course brush on a stand-in host: a 200 x 200 tile grid, all of it the player's land */
function courseBrush() {
  const g = makeGrid(0, 0, 200, 200), plans: { v: unknown[] } = { v: [] };
  const host: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast() {}, affine: o => { o[0] = 0; o[1] = 0; o[2] = 16; o[3] = 0; o[4] = 0; o[5] = 16; },
    placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [], golfMode: () => true, currentMonth: () => 0, money: () => 1e9, spend() {},
    grid: () => g, gridChanged() {}, plans: () => plans.v, setPlans: p => { plans.v = p; },
    ownedAt: () => true, landWhy: () => '',
  };
  const tool = new PaintTool(host); tool.enterCourse(); tool.setBrush('fairway');
  return tool;
}

test('1. setTool: every build tool closes the Grass panel, Land, Holes and Event; Select keeps them', () => {
  for (const t of ALL_TOOLS) {
    const m = allOn(), was = pickTool(m, t);
    if (t === 'select') { assert.equal(was, false); assert.deepEqual(m, allOn(), 'Select is where the side modes live'); continue; }
    assert.equal(was, true, t);
    assert.deepEqual(m, allOff(), `${t} closes grassPanel, landMode, holesTool and eventTool`);
  }
  // 'course' in particular, one mode at a time
  for (const k of SIDE_MODES) { const m = allOff(); m[k] = true; assert.equal(pickTool(m, 'course'), true, k); assert.deepEqual(m, allOff(), k); }
  // nothing open: nothing to close
  const m = allOff(); assert.equal(pickTool(m, 'course'), false); assert.deepEqual(m, allOff());
});

test('2. opening a side mode closes the others (the caller switches to Select); opening it again closes it', () => {
  const m = allOff();
  assert.equal(switchSideMode(m, 'grassPanel'), true); assert.deepEqual(m, { ...allOff(), grassPanel: true });
  assert.equal(switchSideMode(m, 'landMode'), true); assert.deepEqual(m, { ...allOff(), landMode: true }, 'Land closes the Grass panel');
  assert.equal(switchSideMode(m, 'eventTool'), true); assert.deepEqual(m, { ...allOff(), eventTool: true });
  assert.equal(switchSideMode(m, 'holesTool'), true); assert.deepEqual(m, { ...allOff(), holesTool: true });
  assert.equal(switchSideMode(m, 'holesTool'), false); assert.deepEqual(m, allOff(), 'a second press closes it');
});

test('3. Esc closes the topmost menu or card first: Help, the gear menu, Event, Grass, Course stats, Budget or Bottlenecks', () => {
  assert.deepEqual(ESC_CARDS, ['help', 'menu', 'event', 'grass', 'stats', 'panel']);
  assert.equal(topCard({}), null);
  const open: Partial<Record<EscCard, boolean>> = { help: true, menu: true, event: true, grass: true, stats: true, panel: true };
  const order: EscCard[] = [];
  for (let c = topCard(open); c; c = topCard(open)) { order.push(c); open[c] = false; }
  assert.deepEqual(order, ['help', 'menu', 'event', 'grass', 'stats', 'panel']);
  assert.equal(topCard({ stats: true, grass: true }), 'grass');
  assert.equal(topCard({ stats: true, menu: true }), 'menu');
});

test('4. the Esc ladder in order: the gear menu, the Grass panel, Course stats, the stroke in hand, then Select, then nothing', () => {
  const paint = courseBrush();
  const world = { cards: { menu: true, grass: true, stats: true } as Partial<Record<EscCard, boolean>>, tool: 'course' as Tool };
  const ladder = {
    open: () => world.cards,
    close: (c: EscCard) => { world.cards = { ...world.cards, [c]: false }; },
    // the engine's tool rung: the brush when a course tool is in hand
    hand: () => (world.tool === 'course' ? paint.key(ESC) : false),
    tool: () => world.tool,
    select: () => { world.tool = 'select'; },
  };
  // a stroke in hand (the press, no release yet)
  paint.pointerDown({ x: 50.25, y: 50.25 }, 0, 0);
  assert.deepEqual(escapeLadder(ladder), { card: 'menu' });
  assert.deepEqual(escapeLadder(ladder), { card: 'grass' });
  assert.deepEqual(escapeLadder(ladder), { card: 'stats' });
  assert.equal(world.tool, 'course', 'the cards closed first: the tool is still in hand');
  assert.equal(escapeLadder(ladder), 'hand', 'the brush drops the stroke');
  assert.equal(paint.mode, 'brush', 'and stays the brush (no flip to Shape)');
  assert.equal(escapeLadder(ladder), 'select', 'a second Esc leaves to Select');
  assert.equal(world.tool, 'select');
  assert.equal(escapeLadder(ladder), null, 'Select with nothing in hand: nothing');
});

test('5. the brush: Esc never flips Brush and Shape; what is in hand goes first, then the engine takes it to Select', () => {
  const paint = courseBrush();
  // the brush, nothing in hand: not the tool's (the engine puts it down for Select)
  assert.equal(paint.key(ESC), false); assert.equal(paint.mode, 'brush');
  // Shape, no corners: not the tool's either (it used to flip back to the brush)
  paint.setShape('fairway');
  assert.equal(paint.key(ESC), false); assert.equal(paint.mode, 'draw');
  // Shape with corners: the outline goes first, then Esc is the engine's
  for (const [x, y] of [[20, 20], [40, 20]] as const) { paint.pointerDown({ x, y }, x * 16, y * 16); paint.pointerUp(0.5); }
  assert.ok(paint.outline().length >= 4, 'two corners placed');
  assert.equal(paint.key(ESC), true); assert.equal(paint.mode, 'draw');
  assert.equal(paint.key(ESC), false, 'the outline is gone: the next Esc leaves to Select');
  // an alternate in hand (the plants, the height brush, a piece) goes back to the brush, then Esc is the engine's
  paint.setPlant('trees'); assert.equal(paint.key(ESC), true); assert.equal(paint.mode, 'brush'); assert.equal(paint.key(ESC), false);
  paint.setHeight({ mode: 'raise' }); assert.equal(paint.key(ESC), true); assert.equal(paint.mode, 'brush'); assert.equal(paint.key(ESC), false);
  paint.setPiece('fairway-pear'); assert.equal(paint.key(ESC), true); assert.equal(paint.mode, 'brush'); assert.equal(paint.key(ESC), false);
  // New hole at its tee step: out of New hole to the brush, then Select
  assert.ok(paint.setPlan()); assert.equal(paint.mode, 'plan'); assert.equal(paint.key(ESC), true); assert.equal(paint.mode, 'brush'); assert.equal(paint.key(ESC), false);
});

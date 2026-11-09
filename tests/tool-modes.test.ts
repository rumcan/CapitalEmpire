/** Modes never steal a click; Esc closes menus first (T116, P23 P1-A; docs/plans/P23-UX.md 4.10): picking a build tool closes the Grass
 * panel and the Land, Holes and Event switches, opening one closes the others, and Esc walks its ladder in order: the topmost menu or card,
 * the tool's own step (the brush drops the stroke in hand, never flipping Brush and Shape), then Select (pure, Node: tool-modes.ts and a
 * PaintTool with a stand-in host). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESC_CARDS, ESC_KEY, SIDE_MODES, escapeLadder, pickTool, rightClickLadder, switchSideMode, topCard, type EscCard, type EscLadder, type SideModes } from '../src/game/tool-modes';
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

test('3. Esc closes the topmost menu or card first: the picture, a conversation, Help, the gear menu, My looks, Event, Grass, Course stats, Budget or Bottlenecks, then the side cards outermost first', () => {
  const all: EscCard[] = ['scene', 'talk', 'help', 'menu', 'looks', 'bunkers', 'event', 'grass', 'stats', 'panel', 'bag', 'cards', 'player', 'staff', 'club', 'range', 'eventCard'];
  assert.deepEqual(ESC_CARDS, all);
  assert.equal(topCard({}), null);
  const open: Partial<Record<EscCard, boolean>> = Object.fromEntries(all.map(c => [c, true]));
  const order: EscCard[] = [];
  for (let c = topCard(open); c; c = topCard(open)) { order.push(c); open[c] = false; }
  assert.deepEqual(order, all);
  assert.equal(topCard({ looks: true, grass: true }), 'looks', 'Holes > My looks closes before the Grass panel');
  assert.equal(topCard({ bunkers: true, grass: true }), 'bunkers', 'the bunker card closes before the Grass panel');
  assert.equal(topCard({ stats: true, grass: true }), 'grass');
  assert.equal(topCard({ stats: true, menu: true }), 'menu');
  assert.equal(topCard({ scene: true, help: true }), 'scene', 'the picture card is over everything (T242)');
  assert.equal(topCard({ talk: true, help: true }), 'talk', 'a conversation or the first tee card before the menus (T240)');
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

// ---- T392 (#1057), T393 (#1060), T394 (#1061): the side cards are on the ladder, and a right click on the map takes Esc's step ----

/** a stand-in world for the ladder: the cards open, the tool, what is in hand (each step takes one off: a mode with a stage, a route, a stamp) and a
 *  route's points (the road tool's right click takes one back, as the engine's route does) */
interface World { cards: Partial<Record<EscCard, boolean>>; tool: Tool; hand: string[]; route: number }
const ladderOf = (w: World): EscLadder => ({
  open: () => w.cards,
  close: c => { w.cards = { ...w.cards, [c]: false }; },
  hand: () => (w.hand.length ? (w.hand.shift(), true) : false),
  tool: () => w.tool,
  select: () => { w.tool = 'select'; },
  back: () => { if (w.tool !== 'road' || !w.route) return false; w.route--; return true; },
});
const world = (o: Partial<World> = {}): World => ({ cards: {}, tool: 'select', hand: [], route: 0, ...o });
const SIDE_CARDS = ['player', 'bag', 'cards', 'staff', 'club', 'range', 'eventCard'] as const;
/** the steps of n presses on world w (Esc's by default, or a right click's) */
const presses = (w: World, n: number, step: (l: EscLadder) => unknown = escapeLadder) => Array.from({ length: n }, () => step(ladderOf(w)));

test('6. Esc closes every side card the Keys sheet promises: Player, Bag, Cards, Staff, Clubhouse (and the Range card and the event announcement) (T394)', () => {
  for (const card of SIDE_CARDS) {
    assert.ok(ESC_CARDS.includes(card), `${card} is on the ladder`);
    assert.equal(topCard({ [card]: true }), card, card);
    const w = world({ cards: { [card]: true }, tool: 'bulldoze' });
    assert.deepEqual(escapeLadder(ladderOf(w)), { card }, `${card}: Esc closes the card first`);
    assert.equal(w.cards[card], false); assert.equal(w.tool, 'bulldoze', 'the tool in hand stays for the next Esc');
    assert.equal(escapeLadder(ladderOf(w)), 'select');
  }
  // the Keys sheet's order: the top card or menu first (a menu over the cards), then what is in hand, then Select
  const w = world({ cards: { player: true, help: true }, tool: 'road', hand: ['route'] });
  assert.deepEqual(presses(w, 5), [{ card: 'help' }, { card: 'player' }, 'hand', 'select', null]);
});

test('7. the stacked cards peel outermost first: bag or cards, profile, Staff, Clubhouse, then what is in hand, then Select, then nothing (T394)', () => {
  for (const outer of ['bag', 'cards'] as const) {
    const w = world({ cards: { [outer]: true, player: true, staff: true, club: true }, tool: 'road', hand: ['route'] });
    assert.deepEqual(presses(w, 8), [{ card: outer }, { card: 'player' }, { card: 'staff' }, { card: 'club' }, 'hand', 'select', null, null], outer);
  }
  // the playtest's stack (m12): the profile, your cards, Staff, Clubhouse and the event announcement together: five presses empty the screen of cards
  const all = world({ cards: { player: true, cards: true, staff: true, club: true, eventCard: true } });
  assert.deepEqual(presses(all, 6), [{ card: 'cards' }, { card: 'player' }, { card: 'staff' }, { card: 'club' }, { card: 'eventCard' }, null]);
  assert.deepEqual(all.cards, { player: false, cards: false, staff: false, club: false, eventCard: false });
});

/** each tool and mode a right click on the map must put down, as Esc does (the playtest's list, T392 and T393, and the others the engine's Esc ladder knows):
 *  how the stand-in world holds it, and how to tell it is still held */
const MODES: { name: string; w: () => World; held: (w: World) => boolean }[] = [
  { name: 'Bulldoze', w: () => world({ tool: 'bulldoze' }), held: w => w.tool === 'bulldoze' },
  { name: 'Land for sale (a side mode of Select)', w: () => world({ hand: ['landMode'] }), held: w => w.hand.includes('landMode') },
  { name: "Land for sale with a block's card open: the card first, then the mode", w: () => world({ hand: ['landCard', 'landMode'] }), held: w => w.hand.length > 0 },
  { name: 'Tournament (the Event catalogue)', w: () => world({ cards: { event: true } }), held: w => !!w.cards.event },
  { name: 'the Grass panel', w: () => world({ cards: { grass: true } }), held: w => !!w.cards.grass },
  { name: 'House lots', w: () => world({ tool: 'course', hand: ['estatePlacing'] }), held: w => w.tool === 'course' || w.hand.length > 0 },
  { name: 'Place a real course', w: () => world({ hand: ['real'] }), held: w => w.hand.includes('real') },
  { name: 'a real course with its pop-up open: the pop-up first, then the course', w: () => world({ hand: ['popup', 'real'] }), held: w => w.hand.length > 0 },
  { name: 'a tee set in hand', w: () => world({ hand: ['teePlace'] }), held: w => w.hand.length > 0 },
  { name: "a build in hand (the range's parts, a car park)", w: () => world({ hand: ['placing'] }), held: w => w.hand.length > 0 },
  { name: "Buildings: the clubhouse, the halfway house or the pro's office in hand", w: () => world({ tool: 'course', hand: ['clubPlacing'] }), held: w => w.tool === 'course' || w.hand.length > 0 },
  { name: 'Holes (the course brush) with a stroke in hand', w: () => world({ tool: 'course', hand: ['stroke'] }), held: w => w.tool === 'course' || w.hand.length > 0 },
  { name: 'the hole card open in Select', w: () => world({ hand: ['holeCard'] }), held: w => w.hand.length > 0 },
  { name: 'Greenkeeping with a care in hand', w: () => world({ tool: 'greenkeeping', hand: ['care'] }), held: w => w.tool === 'greenkeeping' || w.hand.length > 0 },
  { name: 'Select with a prop picked', w: () => world({ hand: ['selected'] }), held: w => w.hand.length > 0 },
  { name: 'the Staff card', w: () => world({ cards: { staff: true } }), held: w => !!w.cards.staff },
];
const TOOLS_TO_PUT_DOWN: Tool[] = ['road', 'junction', 'bulldoze', 'park', 'toll', 'bus', 'lane', 'downgrade', 'business', 'paint', 'course', 'path', 'props', 'practice', 'greenkeeping'];

test('8. a right click on the map puts down every tool and mode Esc puts down, by the very same step, and a right drag cancels nothing (T392, T393)', () => {
  for (const m of MODES) {
    const w = m.w(), twin = m.w();
    assert.ok(m.held(w), `${m.name}: held`);
    // a right drag is the pan: nothing happens
    assert.equal(rightClickLadder(ladderOf(w), { moved: true }), null, `${m.name}: a drag cancels nothing`); assert.deepEqual(w, twin, `${m.name}: nothing changed`);
    // each right click is the step the Esc key takes on its twin, until nothing is held and the tool is Select
    let n = 0;
    for (; m.held(w) || w.tool !== 'select'; n++) {
      assert.ok(n < 6, `${m.name}: it ends`);
      const click = rightClickLadder(ladderOf(w)), key = escapeLadder(ladderOf(twin));
      assert.notEqual(click, null, `${m.name}: a right click is never swallowed as a pan (step ${n + 1})`);
      assert.deepEqual(click, key, `${m.name}: the same step as Esc (step ${n + 1})`); assert.deepEqual(w, twin, `${m.name}: the same world after it`);
    }
    assert.ok(n >= 1 && !m.held(w) && w.tool === 'select', `${m.name}: put down for Select`);
    assert.equal(rightClickLadder(ladderOf(w)), null, `${m.name}: Select with nothing in hand: nothing`);
  }
  for (const t of TOOLS_TO_PUT_DOWN) {
    const w = world({ tool: t });
    assert.equal(rightClickLadder(ladderOf(w)), 'select', `${t}: a right click puts it down for Select`); assert.equal(w.tool, 'select');
  }
});

test("9. a right click mid-route takes back the last point, as it always did (T207); with no route, or in any other tool, it takes Esc's step (T392)", () => {
  const w = world({ tool: 'road', route: 3 });
  assert.deepEqual(presses(w, 5, rightClickLadder), ['back', 'back', 'back', 'select', null], 'a point each, then the tool goes down');
  // the route's own meaning comes before a card (Esc would close the card first): the owner's right click in the road tool is unchanged
  const c = world({ tool: 'road', route: 2, cards: { player: true } });
  assert.deepEqual(presses(c, 4, rightClickLadder), ['back', 'back', { card: 'player' }, 'select']);
  // Esc itself drops the whole route at once (the tool's own rung), never a point
  const e = world({ tool: 'road', route: 3, hand: ['route'] });
  assert.deepEqual(presses(e, 3), ['hand', 'select', null]);
  // another tool with a stray route count (the junction tool has none): the road's take-back is not its meaning
  const j = world({ tool: 'junction', route: 2 });
  assert.deepEqual(presses(j, 2, rightClickLadder), ['select', null]); assert.equal(j.route, 2);
});

test('10. the Holes brush on the real tool: a right click takes the card first, then the stroke in hand, then puts the brush down; a drag cancels nothing (T392, T393)', () => {
  const paint = courseBrush();
  const w = { cards: { player: true } as Partial<Record<EscCard, boolean>>, tool: 'course' as Tool };
  const ladder: EscLadder = {
    open: () => w.cards, close: c => { w.cards = { ...w.cards, [c]: false }; },
    hand: () => (w.tool === 'course' ? paint.key(ESC_KEY) : false), tool: () => w.tool, select: () => { w.tool = 'select'; },
  };
  assert.equal(ESC_KEY.key, 'Escape');
  paint.pointerDown({ x: 50.25, y: 50.25 }, 0, 0); // a stroke in hand
  assert.equal(rightClickLadder(ladder, { moved: true }), null, 'a right drag is the pan'); assert.equal(w.cards.player, true); assert.equal(w.tool, 'course');
  assert.deepEqual(rightClickLadder(ladder), { card: 'player' });
  assert.equal(rightClickLadder(ladder), 'hand', 'the stroke drops, the brush stays the brush'); assert.equal(paint.mode, 'brush');
  assert.equal(rightClickLadder(ladder), 'select'); assert.equal(w.tool, 'select');
  assert.equal(rightClickLadder(ladder), null);
});

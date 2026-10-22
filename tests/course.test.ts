// Headless tests for the Course tool's logic in the Paint tool (C1): undo / redo, the Shape method's tags, placed holes as numbered holes, the hole strip helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PaintTool, type PropJournal } from '../src/game/paint-tool';
import { kindOfTex, placeHole, storedHolePreset } from '../src/game/golf/holepreset';
import { drawZ, fromTuples, type PaintTuple } from '../src/game/paint';

/** a host with a fake prop list and journal (props are plain objects), the money spent and the toasts */
function host() {
  const props = new Set<object>(), toasts: string[] = [];
  let log: PropJournal | null = null, money = 0;
  const add = () => { const p = {}; props.add(p); log?.added.push(p); return p; };
  const h = {
    props, toasts, spent: () => money,
    setLotGround() {}, emit() {}, save() {}, toast: (t: string) => { toasts.push(t); }, affine() {},
    placeProps: (ps: unknown[]) => { for (const _ of ps) add(); return ps.length; },
    plant: () => { add(); return 1; }, unplant: () => 0, plantPool: () => [{ id: 'x', name: 'x' }],
    spend: (n: number) => { money += n; },
    journal: {
      begin: () => { log = { added: [], removed: [] }; },
      end: () => { const j = log; log = null; return j && (j.added.length || j.removed.length) ? j : null; },
      undo: (j: PropJournal) => { for (const p of j.added) props.delete(p as object); const back = j.removed.map(() => { const p = {}; props.add(p); return p; }); return { added: j.added, removed: back }; },
      redo: (j: PropJournal) => { for (const p of j.removed) props.delete(p as object); const back = j.added.map(() => { const p = {}; props.add(p); return p; }); return { added: back, removed: j.removed }; },
    },
  };
  return h;
}
function drag(tool: PaintTool, x0: number, y0: number, x1: number, y1: number, alt = false) {
  tool.pointerDown({ x: x0, y: y0 }, 0, 0, alt);
  for (let i = 1; i <= 10; i++) tool.pointerMove({ x: x0 + (x1 - x0) * i / 10, y: y0 + (y1 - y0) * i / 10 }, 0, 0);
  tool.pointerUp(0.5);
}
const key = (tool: PaintTool, k: string, mod: Partial<KeyboardEvent> = {}) => tool.key({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {}, ...mod } as KeyboardEvent);

test('undo takes a brush stroke away and redo brings it back; a second stroke is undone to the first', () => {
  const tool = new PaintTool(host()); tool.enterCourse(); tool.setBrush('fairway');
  drag(tool, 50, 50, 90, 50);
  const first = JSON.stringify(tool.save());
  drag(tool, 80, 50, 120, 50);
  assert.equal(tool.areas.length, 1);
  tool.undo(); assert.equal(JSON.stringify(tool.save()), first);
  tool.undo(); assert.equal(tool.areas.length, 0); assert.equal(tool.canUndo, false);
  tool.redo(); assert.equal(JSON.stringify(tool.save()), first);
  key(tool, 'y', { ctrlKey: true }); assert.equal(tool.canRedo, false); assert.equal(tool.areas.length, 1);
  key(tool, 'z', { ctrlKey: true }); assert.equal(JSON.stringify(tool.save()), first);
});

test('a new action after an undo drops the redo steps; an action that changes nothing is not a step', () => {
  const tool = new PaintTool(host()); tool.enterCourse(); tool.setBrush('green');
  drag(tool, 50, 50, 60, 50);
  tool.undo(); assert.equal(tool.canRedo, true);
  drag(tool, 200, 200, 210, 200); assert.equal(tool.canRedo, false);
  tool.rubOut = true; drag(tool, 500, 500, 510, 500); // rubbing out where nothing is
  tool.undo(); assert.equal(tool.areas.length, 0);
  assert.equal(tool.canUndo, false);
});

test('the Shape method lays the surface in its preset style, tagged with the current hole and kind', () => {
  const tool = new PaintTool(host()); tool.enterCourse(); tool.setHole(3); tool.setShape('bunker');
  for (const [x, y] of [[10, 10], [20, 10], [20, 20], [10, 20]]) { tool.pointerDown({ x: x!, y: y! }, 0, 0); tool.pointerUp(0.5); }
  tool.doubleClick();
  assert.equal(tool.areas.length, 1);
  const a = tool.areas[0]!;
  assert.equal(a.hole, 3); assert.equal(a.kind, 'bunker'); assert.equal(a.tex, 'bunkerSand');
  tool.undo(); assert.equal(tool.areas.length, 0);
});

test('a placed hole becomes the current hole, or the next free one; undo removes its areas and props', () => {
  const h = host(), tool = new PaintTool(h); tool.enterCourse(); tool.setMode('hole');
  tool.pointerDown({ x: 500, y: 500 }, 0, 0); tool.pointerUp(0.5);
  assert.deepEqual([...tool.usedHoles()], [1]); assert.equal(tool.brushHole, 1);
  assert.ok(tool.areas.every(a => a.hole === 1));
  assert.ok(tool.areas.some(a => a.kind === 'green') && tool.areas.some(a => a.kind === 'fairway'));
  const props = h.props.size; assert.ok(props > 0);
  tool.pointerDown({ x: 800, y: 500 }, 0, 0); tool.pointerUp(0.5);
  assert.deepEqual([...tool.usedHoles()].sort(), [1, 2]); assert.equal(tool.brushHole, 2); assert.equal(tool.nextFreeHole(), 3);
  tool.undo();
  assert.deepEqual([...tool.usedHoles()], [1]); assert.equal(h.props.size, props);
  tool.redo(); assert.ok(h.props.size > props);
  const b = tool.holeBox(1)!; assert.ok(b[0] < 500 && b[2] > 500);
  assert.equal(tool.holeBox(7), null);
});

test('planting is one undo step; undo takes the planted props away', () => {
  const h = host(), tool = new PaintTool(h); tool.enterCourse(); tool.setPlant('trees');
  drag(tool, 50, 50, 90, 50);
  assert.ok(h.props.size > 0);
  tool.undo(); assert.equal(h.props.size, 0);
});

test('undo refunds the money a shape cost, redo charges it again', () => {
  const h = host(), tool = new PaintTool({ ...h, golfMode: () => true, money: () => 1e9, ownedLand: () => true });
  tool.enterCourse(); tool.setShape('fairway');
  for (const [x, y] of [[10, 10], [30, 10], [30, 30], [10, 30]]) { tool.pointerDown({ x: x!, y: y! }, 0, 0); tool.pointerUp(0.5); }
  tool.doubleClick();
  const cost = h.spent(); assert.ok(cost > 0);
  tool.undo(); assert.equal(h.spent(), 0);
  tool.redo(); assert.equal(h.spent(), cost);
});

test('Paint drops the Course-only modes; the Course tool starts on the brush', () => {
  const tool = new PaintTool(host());
  tool.enterCourse(); assert.equal(tool.mode, 'brush');
  tool.setMode('hole'); tool.enterPaint(); assert.equal(tool.mode, 'draw'); assert.equal(tool.course, false);
  tool.setPlant('bushes'); tool.enterCourse(); assert.equal(tool.mode, 'brush');
});

test('a stored studio hole: kinds from the textures, exact sprites for the props, turned with the hole', () => {
  assert.equal(kindOfTex('golfGreen'), 'green'); assert.equal(kindOfTex('waterClear'), 'water'); assert.equal(kindOfTex('pad'), undefined);
  const p = storedHolePreset({ name: 'H', areas: [{ tex: 'golfTee', border: 1, btex: 'golfFirstCut', radius: 1, pts: [0, 0, 4, 0, 4, 4, 0, 4] }, { tex: 'golfGreen', border: 2, btex: 'golfFringe', radius: 0, kind: 'green', pts: [50, 0, 60, 0, 60, 10] }],
    props: [{ id: 'golf:flagstick', x: 55, y: 3, flip: false, scale: 1.2 }, { id: 'town:fern', x: 2, y: 8, flip: true, scale: 0.7 }] });
  assert.equal(p.areas[0]!.kind, undefined); assert.equal(p.areas[1]!.kind, 'green');
  assert.deepEqual(p.props.map(q => [q.kind, q.id, q.flip, q.scale]), [['flag', 'golf:flagstick', false, 1.2], ['tree', 'town:fern', true, 0.7]]);
  const q = placeHole(p, 100, 100, 1).props[1]!;
  assert.deepEqual([q.x, q.y, q.id, q.flip, q.scale], [92, 102, 'town:fern', true, 0.7]);
});

test('a golf game: a placed preset hands its flag to the engine as the pin spot (no flag prop); every change, undo and redo tells the engine', () => {
  const h = host(), calls: (Map<number, { x: number; y: number }> | undefined)[] = [];
  let placed: { kind: string }[] = [];
  const tool = new PaintTool({ ...h, golfMode: () => true, money: () => 1e9, ownedLand: () => true, placeProps: (ps: { kind: string }[]) => { placed = ps; return ps.length; }, changed: (m?: Map<number, { x: number; y: number }>) => { calls.push(m); } });
  tool.enterCourse(); tool.setMode('hole');
  tool.pointerDown({ x: 500, y: 500 }, 0, 0); tool.pointerUp(0.5);
  assert.ok(placed.length > 0 && placed.every(q => q.kind !== 'flag'));
  assert.equal(calls.length, 1); assert.ok(calls[0]!.has(1));
  tool.undo(); tool.redo(); assert.equal(calls.length, 3); assert.equal(calls[2], undefined);
});

test('layers: the selected area moves over or under the areas it overlaps (one step, or to the front / back), saved, undoable', () => {
  const tool = new PaintTool(host());
  const sq = (x: number) => { tool.setMode('draw'); for (const [a, b] of [[x, 0], [x + 20, 0], [x + 20, 20], [x, 20]]) { tool.pointerDown({ x: a!, y: b! }, 0, 0); tool.pointerUp(0.5); } tool.doubleClick(); return tool.selected; };
  const a = sq(0), b = sq(5), c = sq(10), far = sq(500);
  const z = (id: number) => drawZ(tool.areas.find(q => q.id === id)!), sel = (id: number) => { tool.selected = id; };
  sel(a); tool.moveLayer(1); assert.ok(z(a) > z(b) && z(a) < z(c), 'a one step forward: over b, under c');
  key(tool, 'PageUp'); assert.ok(z(a) > z(c), 'Page Up: over c too');
  key(tool, 'PageDown', { shiftKey: true }); assert.ok(z(a) < z(b) && z(a) < z(c), 'Shift+Page Down: to the back');
  key(tool, ']', { ctrlKey: true, shiftKey: true, code: 'BracketRight' } as Partial<KeyboardEvent>); assert.ok(z(a) > z(c), 'Ctrl+Shift+]: to the front');
  sel(far); const before = z(far); tool.moveLayer('front'); assert.equal(z(far), before, 'nothing overlaps: unchanged');
  sel(a); const front = z(a); tool.undo(); assert.ok(z(a) < z(b), 'undo puts it back under'); tool.redo(); assert.equal(z(a), front);
  const saved = fromTuples(JSON.parse(JSON.stringify(tool.save())) as PaintTuple[]);
  assert.deepEqual(saved.map(drawZ), tool.areas.map(drawZ), 'the order survives a save');
});

// Edit hole always visibly works (T205, issue #538). The owner: the hole card's Edit hole "does nothing". Its cause: with that hole's editor
// already open in the Holes panel (Edit hole 1), the card's Edit hole re-opened the same plan (Game.editHole -> PaintTool.editPlan ->
// HoleWizard.open): the panel looked the same, nothing was framed or said, and any unsaved drag was thrown away. Now Edit hole (the card, the
// Holes panel's status line) opens the editor on that hole, frames it with the camera and says what to do; with that editor already open it
// keeps it as it is; a hole painted by hand says why it cannot. The card's button reads "Editing hole 1" (disabled) while that editor is open,
// and the badges read "Hole 1" with their status icon; the status line ends in "✎ Edit hole 1". Pure, Node: the Paint tool's plan mode with a
// stand-in host, the card and the Holes panel's strip rendered with react-dom/server against a stand-in game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { makeGrid } from '../src/game/ext/course-grid';
import { aimsFromPlans, decodePlans } from '../src/game/ext/hole-wizard';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';
import type { AimPoint } from '../src/game/golf/types';
import type { Game } from '../src/game/engine';
import type { HoleView } from '../src/game/golf/holeview';
import type { HoleCardView } from '../src/game/golf/holecard';
import { HoleCard } from '../src/ui/golf/HoleCard';
import { HoleStrip } from '../src/ui/course/HoleStrip';

/** 16 css px a tile, origin at 0 (the stand-in projection) */
const PX = 16;
/** a golf game for the Paint tool (a 1000 x 1400 tile grid, your land x < 300): money, the plans as the engine keeps them, each toast and
 *  each camera framing recorded */
function golf() {
  const g = makeGrid(0, 0, 1000, 1400);
  const st = { money: 5_000_000, plans: [] as unknown[], aims: [] as AimPoint[], toasts: [] as string[], fits: [] as { pts: { x: number; y: number }[]; zoomIn: boolean }[] };
  const host: PaintHost = {
    setLotGround() {}, emit() {}, save() {}, toast: t => { st.toasts.push(t); }, affine: o => { o[0] = 0; o[1] = 0; o[2] = PX; o[3] = 0; o[4] = 0; o[5] = PX; },
    placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [],
    golfMode: () => true, currentMonth: () => 2, money: () => st.money, spend: n => { st.money -= n; },
    grid: () => g, gridChanged() {}, ownedAt: x => x < 300, plans: () => st.plans,
    setPlans: p => { const before = decodePlans(st.plans); st.plans = p; st.aims = aimsFromPlans(st.aims, before, decodePlans(p)); },
    fitView: (pts, zoomIn) => { st.fits.push({ pts, zoomIn }); },
  };
  const tool = new PaintTool(host); tool.enterCourse();
  const down = (x: number, y: number) => { tool.pointerDown({ x, y }, x * PX, y * PX); tool.pointerUp(0.5); };
  const drag = (from: { x: number; y: number }, to: { x: number; y: number }) => { tool.pointerDown(from, from.x * PX, from.y * PX); tool.pointerMove(to, to.x * PX, to.y * PX); tool.pointerUp(0.5); };
  /** New hole: a tee click, a green click, Build */
  const build = (a: [number, number], b: [number, number]) => { assert.ok(tool.setPlan()); down(...a); down(...b); assert.equal(tool.wizard.step, 'shape'); assert.ok(tool.buildPlan()); };
  return { st, tool, w: tool.wizard, drag, build };
}
/** two holes built (1 runs east at y 120, 2 at y 260), then back to the brush: the Holes panel as the owner had it */
function twoHoles() {
  const o = golf();
  o.build([40, 120], [230, 120]); o.build([40, 260], [230, 260]);
  o.tool.setBrush(o.tool.brushKind);
  assert.equal(o.tool.mode, 'brush'); assert.equal(o.tool.editingHole, 0, 'no editor open');
  return o;
}
const EDITING = (n: number) => `Editing hole ${n}: drag the tee, the green or the line; Build to save`;

test('Edit hole opens the editor on that hole (plan mode, the wizard on its plan), frames the hole and says what to do', () => {
  const { st, tool, w } = twoHoles(), fits = st.fits.length;
  assert.ok(tool.editHole(1));
  assert.equal(tool.mode, 'plan'); assert.equal(w.step, 'shape'); assert.equal(w.base?.hole, 1, 'the wizard on hole 1\'s built plan');
  assert.equal(tool.editingHole, 1); assert.equal(tool.brushHole, 1);
  assert.equal(st.fits.length, fits + 1, 'the camera frames the hole'); assert.ok(st.fits.at(-1)!.zoomIn && st.fits.at(-1)!.pts.length > 4);
  assert.equal(st.toasts.at(-1), EDITING(1));
});

test('with the editor already open on another hole, Edit hole moves it to this hole', () => {
  const { st, tool, w } = twoHoles();
  assert.ok(tool.editHole(1)); assert.ok(tool.editHole(2));
  assert.equal(tool.mode, 'plan'); assert.equal(w.base?.hole, 2); assert.equal(tool.editingHole, 2); assert.equal(tool.brushHole, 2);
  assert.equal(st.toasts.at(-1), EDITING(2));
});

test("the owner's dead Edit hole: with that hole's editor already open, Edit hole keeps it (its unsaved drag stays) and still frames and says it", () => {
  const { st, tool, w, drag } = twoHoles();
  assert.ok(tool.editHole(1));
  const gr = w.handles().find(h => h.k === 'green')!, g0 = { ...w.plan!.green };
  drag(gr, { x: gr.x + 10, y: gr.y + 6 });
  const moved = { ...w.plan!.green };
  assert.notDeepEqual(moved, g0, 'the green was dragged'); assert.ok(w.dirty, 'an unsaved change');
  const fits = st.fits.length, toasts = st.toasts.length;
  assert.ok(tool.editHole(1), 'Edit hole 1 again');
  assert.deepEqual(w.plan!.green, moved, 'the drag is kept: the editor was not re-opened');
  assert.ok(w.dirty); assert.equal(tool.editingHole, 1);
  assert.equal(st.fits.length, fits + 1, 'framed again'); assert.equal(st.toasts.length, toasts + 1); assert.equal(st.toasts.at(-1), EDITING(1));
});

test('a hole painted by hand (no plan): no editor, the reason as a toast', () => {
  const { st, tool } = twoHoles();
  assert.equal(tool.editHole(3), false);
  assert.equal(tool.mode, 'brush'); assert.equal(tool.editingHole, 0);
  assert.equal(st.toasts.at(-1), 'Hole 3 was painted by hand: shape it with the brush');
});

// ---------- the card and the Holes panel's strip ----------
const view = (n: number): HoleView => ({ n, started: true, par: 4, lengthM: 342, memberLengthM: 330, checks: [{ label: 'Green painted', ok: true }], warnings: [], ok: true, virtual: false });
const emptyView = (n: number): HoleView => ({ n, started: false, par: 0, lengthM: 0, memberLengthM: 0, checks: [], warnings: [], ok: false, virtual: false });
const card = (n: number, planned = true): HoleCardView => ({ n, par: 4, tees: [{ kind: 'back', m: 342 }], ready: null, areas: [], checks: [{ id: 'green', text: 'Green painted', ok: true, warn: false, fix: null }], planned });
/** a stand-in game: holes 1 and 2 built (planned unless `hand`), hole `cur` the current one, hole `open`'s card open, hole `editing`'s editor
 *  open (0: none) */
function fakeGame(o: { cur?: number; open?: number; editing?: number; hand?: number[] } = {}) {
  const hand = o.hand ?? [];
  const views = Array.from({ length: 18 }, (_, i) => (i < 2 ? view(i + 1) : emptyView(i + 1)));
  const game = {
    golfMode: true, holeCardHole: o.open ?? null, courseHoleViews: () => views, holeGrowLabel: () => '',
    holeCardView: () => (o.open ? card(o.open, !hand.includes(o.open)) : null),
    paint: { brushHole: o.cur ?? 1, brushKind: 'fairway', editingHole: o.editing ?? 0, hasPlan: (n: number) => n <= 2 && !hand.includes(n), nextFreeHole: () => 3 },
    editHole: () => true,
  } as unknown as Game;
  return { game };
}
const cardHtml = (g: Game) => renderToStaticMarkup(createElement(HoleCard, { game: g }));
const stripHtml = (g: Game) => renderToStaticMarkup(createElement(HoleStrip, { game: g }));
/** the card's Edit hole button: its attributes and its words */
const editButton = (h: string) => { const m = /<button([^>]*data-testid="hole-edit"[^>]*)>([\s\S]*?)<\/button>/.exec(h); assert.ok(m, 'the card has Edit hole'); return { attrs: m[1]!, text: m[2]!.replace(/<[^>]+>/g, '') }; };

test("the card's Edit hole: enabled for a planned hole; \"Editing hole 1\" (disabled) while that hole's editor is open; disabled with its reason for a hole painted by hand", () => {
  let b = editButton(cardHtml(fakeGame({ open: 1 }).game));
  assert.equal(b.text, 'Edit hole'); assert.doesNotMatch(b.attrs, / disabled=""/);
  b = editButton(cardHtml(fakeGame({ open: 1, editing: 2 }).game));
  assert.equal(b.text, 'Edit hole', 'another hole\'s editor open: this one can still be edited'); assert.doesNotMatch(b.attrs, / disabled=""/);
  b = editButton(cardHtml(fakeGame({ open: 1, editing: 1 }).game));
  assert.equal(b.text, 'Editing hole 1'); assert.match(b.attrs, / disabled=""/); assert.match(b.attrs, /title="[^"]*editor is open/);
  const h = cardHtml(fakeGame({ open: 2, hand: [2] }).game);
  b = editButton(h);
  assert.equal(b.text, 'Edit hole'); assert.match(b.attrs, / disabled=""/);
  assert.match(h, /data-testid="hole-edit-why"[^>]*>Painted by hand: shape it with the brush/, 'the reason is on the card, not only in a tooltip');
});

test('the badges read "Hole 1" with their status icon; the status line ends in ✎ Edit hole 1 (straight into the editor), "Editing hole 1" while it is open', () => {
  let h = stripHtml(fakeGame({ cur: 1 }).game);
  assert.match(h, /<button data-hole="1"[^>]*><span class="hole-icon" aria-hidden="true">✓<\/span>Hole 1<\/button>/);
  assert.match(h, /<button data-hole="2"[^>]*><span class="hole-icon" aria-hidden="true">✓<\/span>Hole 2<\/button>/);
  const status = /<div class="status-line[^"]*" data-status="true">([\s\S]*?)<\/div>/.exec(h)?.[1] ?? '';
  assert.match(status, /^<span[^>]*>Hole 1 · par 4 · 342 m · ready<\/span><button[^>]*data-testid="status-edit"[^>]*>✎ Edit hole 1<\/button>$/, 'the status line ends in the button');
  h = stripHtml(fakeGame({ cur: 1, editing: 1 }).game);
  assert.match(h, /<button[^>]*disabled=""[^>]*data-testid="status-edit"[^>]*>Editing hole 1<\/button>/);
  h = stripHtml(fakeGame({ cur: 2, hand: [2] }).game);
  assert.doesNotMatch(h, /data-testid="status-edit"/, 'a hole painted by hand has no editor to open');
});

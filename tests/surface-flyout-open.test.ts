// T359 (#1006), part 2 (the owner, 2026-11-08: "going via the menu to shape by hand and clicking fairway should take you to editing the course
// default and the look of fairway already selected. same for the other buttons"): Course › Holes › Shape by hand › <surface> arms that
// surface's brush and opens its panel in focus, on the Course default, the look selected (the main and border textures show the course
// default's); the panel's ‹ All surfaces back link still goes back to the swatches. Pure, Node: the Paint tool with a stand-in host and the
// panel rendered to markup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { SURF, makeGrid, fillPolygon, type Grid } from '../src/game/ext/course-grid';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';
import { SURFACE_BRUSHES } from '../src/game/paint';
import type { LookBook } from '../src/game/golf/looks';
import type { Game } from '../src/game/engine';
import { SurfaceSwatches } from '../src/ui/course/BrushControls';

function rig() {
  const g: Grid = makeGrid(0, 0, 160, 160);
  fillPolygon(g, [{ x: 10, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 34 }, { x: 10, y: 34 }], SURF.fairway, 1, 0);
  const book: LookBook = {};
  const host: PaintHost = { setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [], golfMode: () => true,
    money: () => 1e9, spend() {}, grid: () => g, gridChanged() {}, lookBook: () => book, grasses: () => [], setGrasses() {}, courseLook() {}, lookChanged() {} };
  const p = new PaintTool(host); p.enterCourse();
  const game = { paint: p, golfMode: true, courseGrid: g, toolUi: () => null, emit() {} } as unknown as Game;
  return { p, book, game };
}
const panel = (game: Game, p: PaintTool) => renderToStaticMarkup(createElement(SurfaceSwatches, { game, on: p.brushKind, pick: () => {} }));

test('Shape by hand › Fairway: the brush armed, the Course default the owner of the look, the panel asked to open in focus', () => {
  const { p } = rig();
  // as the player left it: the green in hand, a hole's own look being edited
  p.setBrush('green', 0); p.setHole(3);
  assert.equal(p.lookOwner, 'h3');
  p.openSurface('fairway');
  assert.equal(p.mode, 'brush'); assert.equal(p.brushKind, 'fairway', 'the fairway brush is armed'); assert.equal(p.grassInHand, 0);
  assert.equal(p.lookOwner, 'default', 'the Course default is what the panel edits');
  assert.deepEqual(p.style, p.brush.fairway.style, 'the panel\'s look is the course default fairway look: its main and border textures');
  assert.equal(p.focusWanted, true);
});

test('every surface of the flyout opens its own panel on the Course default', () => {
  for (const b of SURFACE_BRUSHES) {
    const { p, game } = rig();
    p.setHole(2);
    p.openSurface(b.kind);
    assert.equal(p.brushKind, b.kind, `${b.name}: its brush`); assert.equal(p.lookOwner, 'default', `${b.name}: the Course default`);
    const html = panel(game, p);
    assert.match(html, new RegExp(`data-surface-focus="${b.kind}"`), `${b.name}: its panel in focus, not the swatches`);
    assert.doesNotMatch(html, /data-swatch=/, `${b.name}: not on All surfaces`);
    assert.match(html, /aria-pressed="true"[^>]*>Course default</, `${b.name}: Course default lit`);
    assert.match(html, /aria-pressed="false"[^>]*>This hole</, `${b.name}: This hole not lit`);
  }
});

test("the panel opened by the flyout shows the course default's textures, and ‹ All surfaces is still there", () => {
  const { p, game, book } = rig();
  // hole 1 wears its own fairway look; the course default is another
  p.setHole(1); p.setStyle({ tex: 'dirt' });
  assert.equal(book['h1']?.fairway?.tex, 'dirt', 'hole 1 has its own look');
  p.setLookDefault(true); p.setStyle({ tex: 'gravel' });
  assert.equal(book['h1']?.fairway?.tex, 'dirt', 'hole 1 keeps it');
  p.setLookDefault(false);
  p.openSurface('fairway');
  assert.equal(p.style.tex, 'gravel', "the main texture is the course default's, not hole 1's");
  const html = panel(game, p);
  assert.match(html, /data-focus-back/, 'the back link');
  assert.match(html, /Course default \(new holes\)/, 'the head says whose look it is');
});

test('the flyout opening is taken once: a swatch click or the back link is the player\'s after it', () => {
  const { p } = rig();
  p.openSurface('green');
  assert.equal(p.focusWanted, true);
  const rev = p.focusRev;
  p.openSurface('tee');
  assert.equal(p.focusRev, rev + 1, 'each opening counts, so a panel already on screen takes it');
  assert.equal(p.brushKind, 'tee');
});

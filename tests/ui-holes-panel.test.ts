// Headless tests for the Holes panel (plan P23 4.3, P1-E, T120): stage 1 renders New hole only; from the first hole, your holes as badges
// with icons and the current hole's status line, Shape by hand with seven marked swatches, and More options collapsed; the wizard's card takes
// New hole's place on top. The panel renders with react-dom/server against a stand-in game (only what the panel reads). npm test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { computeProgressiveUiState, type PlayerProgressFacts } from '../src/game/ext/progressive-ui';
import type { Game } from '../src/game/engine';
import type { HoleView } from '../src/game/golf/holeview';
import { CoursePanel } from '../src/ui/course/CoursePanel';
import { holeState } from '../src/ui/course/HoleStrip';
import { plainName } from '../src/PaintPanel';
import { growReadyLabel } from '../src/game/golf/growlabel';

const facts = (over: Partial<PlayerProgressFacts> = {}): PlayerProgressFacts => ({
  advancedMode: false, playableHoles: 0, seasonsDone: 0, invited: false, elapsedSeconds: 30, roadsBuilt: 0, carParksBuilt: 0, eventStructuresPlaced: 0, ...over,
});
const emptyView = (n: number): HoleView => ({ n, started: false, par: 0, lengthM: 0, memberLengthM: 0, checks: [], warnings: [], ok: false, virtual: false });
const ready = (n: number, par: 3 | 4 | 5, lengthM: number): HoleView => ({ n, started: true, par, lengthM, memberLengthM: lengthM, checks: [{ label: 'Green painted', ok: true }], warnings: [], ok: true, virtual: false });

/** a stand-in golf game at the stage these facts give, with these holes (views by number) and grow-ins */
function fakeGame(o: { facts?: Partial<PlayerProgressFacts>; holes?: HoleView[]; growing?: Record<number, number>; mode?: string; current?: number; cells?: number } = {}): Game {
  const views = Array.from({ length: 18 }, (_, i) => o.holes?.find(h => h.n === i + 1) ?? emptyView(i + 1));
  const ui = computeProgressiveUiState(facts(o.facts));
  const paint = {
    mode: o.mode ?? 'brush', planOpen: (o.mode ?? 'brush') === 'plan', brushHole: o.current ?? 1, brushKind: 'fairway', brushCells: o.cells ?? 2, rubOut: false, plantKind: 'seed',
    canUndo: true, canRedo: false, undoLabel: 'build hole 1', redoLabel: '', topUndo: 'build hole 1', topRedo: '', planNumbers: () => [{ n: 2, label: 'Hole 2' }],
    brush: { fairway: { r: 5, style: { tex: 'preset:fairway' } } }, heightMode: 'raise', pieceArch: 'tee-box',
    hasPlan: () => false, nextFreeHole: () => 2,
    wizard: { step: 'tee', base: null, hole: 2, plan: null },
  };
  return {
    golfMode: true, paint, toolUi: () => ui, courseHoleViews: () => views,
    holeGrowLabel: (n: number) => growReadyLabel(o.growing?.[n]),
  } as unknown as Game;
}
const render = (g: Game) => renderToStaticMarkup(createElement(CoursePanel, { game: g }));

describe('the Holes panel at stage 1 renders New hole only (P23 4.3)', () => {
  it('a new range game: the header, the gold New hole pill and its line; no hole badges, no swatches, no More options', () => {
    const h = render(fakeGame());
    assert.match(h, /data-panel="holes"/);
    assert.match(h, />Holes</);
    assert.match(h, /data-primary="new-hole"[^>]*>[\s\S]*New hole[\s\S]*Click a tee, then a green/);
    assert.equal((h.match(/data-primary=/g) ?? []).length, 1, 'one primary action');
    assert.doesNotMatch(h, /data-section=/, 'no other section');
    assert.doesNotMatch(h, /data-swatch=/);
    assert.doesNotMatch(h, /data-hole=/);
    assert.doesNotMatch(h, /More options|Your holes/);
    assert.match(h, /opens after your first hole/);
  });

  it('while New hole is open, its card takes the pill\'s place on top', () => {
    const h = render(fakeGame({ mode: 'plan' }));
    assert.match(h, /data-primary="wizard"/);
    assert.doesNotMatch(h, /data-primary="new-hole"/);
    assert.match(h, /New hole 2/);
    assert.doesNotMatch(h, /data-section=/);
  });

  it('the header names what ↶ takes back', () => {
    assert.match(render(fakeGame()), /title="Undo: build hole 1 \(Ctrl\+Z\)"/);
  });
});

describe('the Holes panel after hole 1 (stage 2)', () => {
  const holes = [ready(1, 4, 342), ready(2, 3, 150), { ...ready(3, 5, 480), ok: false, checks: [{ label: 'Pin on the green', ok: false }] }];
  it('New hole stays on top; your holes as badges with icons; the current hole\'s status line; Shape by hand; More options collapsed', () => {
    const h = render(fakeGame({ facts: { playableHoles: 2, stageReached: 2 }, holes, growing: { 2: 6 } }));
    assert.ok(h.indexOf('data-primary="new-hole"') < h.indexOf('data-section="holes"'), 'New hole is on top');
    assert.match(h, /<button data-hole="1"[^>]*class="hole-badge hole-ready hole-badge-on ?"[^>]*><span class="hole-icon" aria-hidden="true">✓<\/span>Hole 1</);
    assert.match(h, /<button data-hole="2"[^>]*class="hole-badge hole-growing[^"]*"[^>]*><span class="hole-icon" aria-hidden="true">◔<\/span>Hole 2</);
    assert.match(h, /<button data-hole="3"[^>]*class="hole-badge hole-attn[^"]*"[^>]*><span class="hole-icon" aria-hidden="true">!<\/span>Hole 3</);
    assert.match(h, /Hole 1 · par 4 · 342 m · ready/);
    assert.match(h, /3 holes · par 12 · 972 m/);
    assert.match(h, /data-section="shape"/);
    assert.equal((h.match(/data-swatch=/g) ?? []).length, 8, 'eight surfaces at stage 2 (T222: the Waste area with them, T238 Long grass; the cart path waits for stage 3)');
    assert.match(h, /data-swatch="longGrass"[^>]*title="Long grass \(key 9\)"/);
    assert.match(h, /keys 1–9/);
    assert.match(h, /data-section="more"[\s\S]*aria-expanded="false"[\s\S]*More options[\s\S]*shapes · my looks · planting · more/);
    assert.doesNotMatch(h, /Saved holes|My looks<\/span>/, 'More options is collapsed');
  });

  it('a growing hole\'s status says when it is ready; a hole that needs attention says what it misses', () => {
    let h = render(fakeGame({ facts: { playableHoles: 2, stageReached: 2 }, holes, growing: { 2: 6 }, current: 2 }));
    assert.match(h, /Hole 2 · par 3 · 150 m · growing · ready Mar 1985/);
    h = render(fakeGame({ facts: { playableHoles: 2, stageReached: 2 }, holes, current: 3 }));
    assert.match(h, /Hole 3 · par 5 · 480 m · needs attention/);
    assert.match(h, /✗<\/span>Pin on the green/);
  });

  it('Shape by hand: Brush | Run (T122, P23 4.5) and Erase as its own toggle', () => {
    const stage2 = { facts: { playableHoles: 2, stageReached: 2 as const }, holes };
    let h = render(fakeGame(stage2));
    assert.match(h, /role="group" aria-label="Brush or Run" data-method="brush"><button class="chip chip-on" aria-pressed="true"[^>]*>Brush<\/button><button class="chip " aria-pressed="false" title="Run: lay a strip of Fairway as wide as the size, like a road[^"]*"[^>]*>Run<\/button><\/div>/);
    assert.match(h, /aria-pressed="false" title="Erase takes the top surface under the brush[^"]*"[^>]*>Erase</);
    const g = fakeGame(stage2); (g.paint as unknown as { brushRun: boolean }).brushRun = true;
    h = render(g);
    assert.match(h, /data-method="run"><button class="chip " aria-pressed="false"[^>]*>Brush<\/button><button class="chip chip-on" aria-pressed="true"[^>]*>Run<\/button>/);
    assert.match(h, /title="Erase takes the top surface under the run/);
  });

  it('holeState: ✓ ready, ◔ growing with its month, ! needs attention first', () => {
    assert.deepEqual(holeState(ready(1, 4, 300), ''), { kind: 'ready', icon: '✓', word: 'ready' });
    assert.deepEqual(holeState(ready(1, 4, 300), 'growing · ready Mar 1985'), { kind: 'growing', icon: '◔', word: 'growing · ready Mar 1985' });
    assert.equal(holeState({ ...ready(1, 4, 300), ok: false }, 'growing · ready Mar 1985').kind, 'attn');
  });
});

// T238 (#697): the brush's shape (Square or Round, every surface brush) in Shape by hand, and Edit hole's own paint section
describe('T238: the brush shape and Edit hole\'s paint', () => {
  const stage2 = { facts: { playableHoles: 2, stageReached: 2 as const }, holes: [ready(1, 4, 342), ready(2, 3, 150)] };
  it('Shape by hand: Square (its size pills) or Round (its size slider, in metres across); Round left More options', () => {
    let h = render(fakeGame(stage2));
    assert.match(h, /role="group" aria-label="Brush shape" data-shape="square"><button class="chip chip-on" aria-pressed="true"[^>]*>[\s\S]*?Square<\/button><button class="chip " aria-pressed="false"[^>]*>[\s\S]*?Round<\/button><\/div>/);
    assert.match(h, /aria-label="Brush size"/); assert.doesNotMatch(h, /Round brush size/);
    h = render(fakeGame({ ...stage2, cells: 0 }));
    assert.match(h, /data-shape="round"><button class="chip " aria-pressed="false"[^>]*>[\s\S]*?Square<\/button><button class="chip chip-on" aria-pressed="true"/);
    assert.match(h, /aria-label="Round brush size"[^>]*value="5"/, 'the fairway brush\'s radius, 5 tiles');
    assert.match(h, />20 m</, 'shown as 20 m across');
    assert.doesNotMatch(h, /aria-label="Brush size"/, 'the square\'s pills step aside');
    assert.match(h, /data-section="more"[\s\S]*aria-expanded="false"/, 'More options stays shut with Round in hand');
  });
  it('Edit hole: the card paints the hole, its surfaces with their keys, the brush shape and Erase; with a surface in hand it is lit', () => {
    const g = fakeGame({ ...stage2, mode: 'plan' }), p = g.paint as unknown as Record<string, unknown>;
    p.wizard = { step: 'shape', base: { hole: 1 }, hole: 1, plan: null, ghost: () => null, check: () => ({ ok: true, why: '' }), checks: () => [] };
    p.editingHole = 1;
    let h = render(g);
    assert.match(h, /data-primary="wizard"[\s\S]*Edit hole 1/);
    assert.match(h, /data-section="edit-paint"[\s\S]*Paint hole 1/);
    assert.equal((h.match(/data-swatch=/g) ?? []).length, 8, 'the stage\'s surfaces, Long grass with them');
    assert.doesNotMatch(h, /swatch-on/, 'none in hand yet: the plan\'s handles alone');
    assert.match(h, /aria-label="Brush shape"/); assert.match(h, />Erase</);
    assert.match(h, /Pick a surface to paint into hole 1 \(keys 1–9\)/);
    assert.match(h, /undoes a drag or a stroke/);
    assert.doesNotMatch(h, /data-section="shape"/, 'Shape by hand stays hidden under the card');
    p.mode = 'brush'; p.planOpen = true; p.brushKind = 'longGrass';
    h = render(g);
    assert.match(h, /data-swatch="longGrass" aria-pressed="true"[^>]*class="swatch swatch-on"/);
    assert.match(h, />Handles only</);
    assert.match(h, /Drag on the map to paint long grass into hole 1/);
  });
});

describe('plain texture names in the style editor (P23 P1-E)', () => {
  it('the owner\'s preset names read as words', () => {
    assert.equal(plainName('Golf - Green'), 'Green');
    assert.equal(plainName('Path_worn'), 'Worn path');
    assert.equal(plainName('sand'), 'Sand');
    assert.equal(plainName('First Cut'), 'First cut');
    assert.equal(plainName('Fairway'), 'Fairway');
  });
});

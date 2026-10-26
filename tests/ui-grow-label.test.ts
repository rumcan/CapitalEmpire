// "growing · ready Mar 1985" in every place P23 4.6 names (T135, issue #259), from one source (golf/growlabel.ts, Game.holeGrowLabel): the
// hole's badge (◔, its tooltip), the Holes panel's status line and the course hint pill (Game.courseHint: hintWithGrow after the hole's
// name), the same words in each; none of them says it once the hole has grown in. The panel renders with react-dom/server against a stand-in
// game (only what it reads). npm test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import type { Game } from '../src/game/engine';
import type { HoleView } from '../src/game/golf/holeview';
import { HoleStrip } from '../src/ui/course/HoleStrip';
import { growReadyLabel, hintWithGrow } from '../src/game/golf/growlabel';

const ready = (n: number, par: 3 | 4 | 5, lengthM: number): HoleView => ({ n, started: true, par, lengthM, memberLengthM: lengthM, checks: [{ label: 'Green painted', ok: true }], warnings: [], ok: true, virtual: false });
const emptyView = (n: number): HoleView => ({ n, started: false, par: 0, lengthM: 0, memberLengthM: 0, checks: [], warnings: [], ok: false, virtual: false });

/** a stand-in golf game with holes 1 and 2, hole `current` the brush's, and these holes growing in (the month index each is grown in) */
function fakeGame(growing: Record<number, number>, current = 2): Game {
  const holes = [ready(1, 4, 342), ready(2, 3, 150)];
  const views = Array.from({ length: 18 }, (_, i) => holes.find(h => h.n === i + 1) ?? emptyView(i + 1));
  return { golfMode: true, paint: { brushHole: current, brushKind: 'fairway', nextFreeHole: () => 3 }, courseHoleViews: () => views, holeGrowLabel: (n: number) => growReadyLabel(growing[n]) } as unknown as Game;
}
/** the badge's tooltip for hole n, and the status line */
function places(g: Game, n: number): { badge: string; status: string } {
  const h = renderToStaticMarkup(createElement(HoleStrip, { game: g }));
  const badge = new RegExp(`<button data-hole="${n}"[^>]*title="([^"]*)"`).exec(h)?.[1] ?? '';
  const status = /<div class="status-line[^"]*" data-status="true">([^<]*)<\/div>/.exec(h)?.[1] ?? '';
  return { badge, status };
}
/** the course cursor's pill for a brush on hole 2 (CourseCursor.hint's words) */
const CURSOR = 'Painting Fairway · Hole 2 · $2 a cell';

describe('the grow-in words (P23 4.6)', () => {
  it('growReadyLabel: "growing · ready Mar 1985" for month 6 of the first season; nothing once grown in', () => {
    assert.equal(growReadyLabel(6), 'growing · ready Mar 1985');
    assert.equal(growReadyLabel(13), 'growing · ready Oct 1985');
    assert.equal(growReadyLabel(undefined), '');
  });

  it('the badge, the status line and the hint pill say the same words for a growing hole', () => {
    const g = fakeGame({ 2: 6 }), label = g.holeGrowLabel(2), at = places(g, 2);
    assert.equal(label, 'growing · ready Mar 1985');
    assert.equal(at.badge, `Hole 2 · par 3 · 150 m · ${label}`, 'the badge');
    assert.equal(at.status, `Hole 2 · par 3 · 150 m · ${label}`, 'the status line');
    assert.equal(hintWithGrow(CURSOR, 2, label), `Painting Fairway · Hole 2 · ${label} · $2 a cell`, 'the hint pill, after the hole\'s name');
    assert.match(renderToStaticMarkup(createElement(HoleStrip, { game: g })), /<button data-hole="2"[^>]*class="hole-badge hole-growing[^"]*"[^>]*><span class="hole-icon" aria-hidden="true">◔<\/span>2/, 'the ◔ badge');
  });

  it('once the hole has grown in, none of them says growing', () => {
    const g = fakeGame({}), at = places(g, 2);
    assert.equal(g.holeGrowLabel(2), '');
    assert.equal(at.badge, 'Hole 2 · par 3 · 150 m · ready');
    assert.equal(at.status, 'Hole 2 · par 3 · 150 m · ready');
    assert.equal(hintWithGrow(CURSOR, 2, g.holeGrowLabel(2)), CURSOR);
  });

  it('another hole growing leaves the current hole\'s status and pill alone; its own badge says it', () => {
    const g = fakeGame({ 1: 13 }), at = places(g, 2);
    assert.equal(at.status, 'Hole 2 · par 3 · 150 m · ready');
    assert.equal(places(g, 1).badge, 'Hole 1 · par 4 · 342 m · growing · ready Oct 1985');
    assert.equal(hintWithGrow(CURSOR, 2, g.holeGrowLabel(2)), CURSOR);
  });

  it('hintWithGrow: only after "Hole n" itself (not Hole 12), and a hint naming no hole is left as it is', () => {
    const grow = growReadyLabel(6);
    assert.equal(hintWithGrow('Painting Green · Hole 12 · $9 a cell', 1, grow), 'Painting Green · Hole 12 · $9 a cell');
    assert.equal(hintWithGrow('Painting Green · Hole 1 · $9 a cell', 1, grow), `Painting Green · Hole 1 · ${grow} · $9 a cell`);
    assert.equal(hintWithGrow('Erasing fairway · Hole 1 · 6 cells back to rough · no refund', 1, grow), `Erasing fairway · Hole 1 · ${grow} · 6 cells back to rough · no refund`);
    assert.equal(hintWithGrow('Painting Cart path · $4 a cell', 1, grow), 'Painting Cart path · $4 a cell');
    assert.equal(hintWithGrow('Rub out · 16 cells back to rough', 1, grow), 'Rub out · 16 cells back to rough');
  });
});

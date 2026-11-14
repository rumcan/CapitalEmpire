// T293 (#878): the start tutorial (the town grows only along the roads you build). Its four steps in order, the done-checks (Next on the
// 'next' steps; a town road built on step 2, or Next while the road tool is locked), Skip and Skip tutorial, the save, and the card (the guide's
// card with the tutorial's heading, Next and Skip tutorial). The engine's wiring is read from the source: a new game starts it, the Who card and
// the ground go first, the welcome card and the guided build wait for it, a town road counts, Help replays it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { RangeGuideCard } from '../src/ui/golf/RangeGuideCard';
import { JAM_TOUR, TOWN_TOUR, newTour, normalizeTour, tourCurrent, tourLines, tourNext, tourOff, tourRunning, tourSkip, tourStepFor, tourTick, type TourFacts } from '../src/game/ext/progressive-ui/tour';
import { normalizeProgress } from '../src/game/ext/progressive-ui/progress';

const OPEN: TourFacts = { roadLock: null, start: 'range' };
const LOCKED: TourFacts = { roadLock: "Unlocks with your third hole or the tour's invitation", start: 'range' };

test('four steps in order: your town, roads are your job, out of room, then the golf start', () => {
  assert.deepEqual(TOWN_TOUR.map(s => s.id), ['tour-town', 'tour-roads', 'tour-room', 'tour-golf']);
  assert.deepEqual(TOWN_TOUR.map(s => s.n), [1, 2, 3, 4]);
  assert.deepEqual(TOWN_TOUR.map(s => s.done), ['next', 'auto', 'next', 'next']);
  assert.equal(TOWN_TOUR[1]!.target.ui, 'rail-traffic'); // the ring on the road tool's group
  assert.match(TOWN_TOUR[0]!.body, /only on land that has a road/); assert.match(TOWN_TOUR[0]!.body, /county road/);
  assert.match(TOWN_TOUR[1]!.body, /never lays a road/);
});

test('the done-checks: Next moves the next steps on, step 2 waits for a town road, then the tutorial ends', () => {
  const g = newTour();
  assert.ok(tourRunning(g)); assert.equal(tourCurrent(g, OPEN)!.id, 'tour-town');
  assert.equal(tourTick(g, OPEN), null, 'step 1 never ticks by itself');
  assert.ok(tourNext(g, OPEN)); assert.equal(tourCurrent(g, OPEN)!.id, 'tour-roads');
  assert.equal(tourNext(g, OPEN), false, 'step 2 waits for a road: no Next');
  assert.equal(tourTick(g, OPEN), null, 'no road yet');
  g.roads = 1; assert.equal(tourTick(g, OPEN)!.id, 'tour-roads'); assert.equal(tourCurrent(g, OPEN)!.id, 'tour-room');
  assert.ok(tourNext(g, OPEN)); assert.equal(tourCurrent(g, OPEN)!.id, 'tour-golf');
  assert.ok(tourNext(g, OPEN)); assert.equal(tourRunning(g), false); assert.equal(tourLines(g, OPEN), null);
  assert.deepEqual(g.done, ['tour-town', 'tour-roads', 'tour-room', 'tour-golf']);
});

test('only the current step ticks: a road built on step 1 ticks step 2 once the player gets there', () => {
  const g = newTour(); g.roads = 2;
  assert.equal(tourTick(g, OPEN), null); assert.deepEqual(g.done, []);
  tourNext(g, OPEN); assert.equal(tourTick(g, OPEN)!.id, 'tour-roads');
});

test('the road tool still locked: step 2 says when it opens and goes on with Next', () => {
  const g = newTour(); tourNext(g, LOCKED);
  const s = tourCurrent(g, LOCKED)!; assert.equal(s.id, 'tour-roads'); assert.equal(s.done, 'next');
  assert.match(s.body, /locked for now: it opens with your third hole/);
  assert.ok(tourNext(g, LOCKED)); assert.equal(tourCurrent(g, LOCKED)!.id, 'tour-room');
});

test('the old town start: step 4 points at the course, not a range', () => {
  const g = newTour(); g.done.push('tour-town', 'tour-roads', 'tour-room');
  const s = tourCurrent(g, { roadLock: null, start: 'town' })!; assert.equal(s.target.ui, 'rail-course'); assert.match(s.body, /Course drawer/);
  assert.equal(tourCurrent(g, OPEN)!.target.ui, 'rail-range');
});

test('every step can be skipped; Skip tutorial ends it for good; a done step stays done', () => {
  const g = newTour();
  for (const s of TOWN_TOUR) assert.ok(tourSkip(g, s.id), s.id);
  assert.equal(tourRunning(g), false); assert.equal(tourSkip(g, 'tour-town'), false); assert.equal(tourSkip(g, 'nope'), false);
  const h = newTour(); tourNext(h, OPEN); assert.equal(tourSkip(h, 'tour-town'), false, 'done stays done');
  tourOff(h); assert.equal(tourRunning(h), false); assert.equal(tourCurrent(h, OPEN), null);
});

test('the save: normalised, kept in the progress; an old save has none (it never shows), a replay is a new one', () => {
  assert.equal(normalizeTour(null), null);
  assert.deepEqual(normalizeTour({ done: ['tour-town', 'x', 'tour-town'], skipped: ['tour-town', 'tour-room'], off: 1, roads: -3 }), { done: ['tour-town'], skipped: ['tour-room'], off: false, roads: 0 });
  const p = normalizeProgress({ stage: 1, seen: [], tour: { done: ['tour-town'], skipped: [], off: false, roads: 1 } });
  assert.deepEqual(p.tour, { done: ['tour-town'], skipped: [], off: false, roads: 1 });
  assert.equal(normalizeProgress({ stage: 1, seen: [] }).tour, undefined);
});

test('the card: the guide card with the tutorial heading, Next on a next step, Skip and Skip tutorial', () => {
  const g = newTour();
  const html = renderToStaticMarkup(createElement(RangeGuideCard, { view: { lines: tourLines(g, OPEN)!, folded: false }, heading: 'Tutorial · your town', tid: 'tour', foot: 'Do each step, or skip it', offLabel: 'Skip tutorial', onShow: () => {}, onSkip: () => {}, onFold: () => {}, onNext: () => {} }));
  assert.match(html, /Tutorial · your town/); assert.match(html, /data-testid="tour"/);
  for (const s of TOWN_TOUR) assert.ok(html.includes(`data-testid="tour-${s.id}"`), s.id);
  assert.match(html, /data-testid="tour-next"[^>]*>Next/); assert.match(html, /data-testid="tour-skip"/); assert.match(html, /data-testid="tour-off"[^>]*>Skip tutorial/);
  g.done.push('tour-town');
  const two = renderToStaticMarkup(createElement(RangeGuideCard, { view: { lines: tourLines(g, OPEN)!, folded: true }, tid: 'tour', onShow: () => {}, onSkip: () => {}, onFold: () => {}, onNext: () => {} }));
  assert.doesNotMatch(two, /data-testid="tour-next"/, 'step 2 waits for a road: no Next'); assert.match(two, /data-testid="tour-show"/);
  g.done.push('tour-roads', 'tour-room');
  const last = renderToStaticMarkup(createElement(RangeGuideCard, { view: { lines: tourLines(g, OPEN)!, folded: true }, tid: 'tour', onShow: () => {}, onSkip: () => {}, onFold: () => {}, onNext: () => {} }));
  assert.match(last, /data-testid="tour-next"[^>]*>Done/);
  // the range guide's card is unchanged without onNext: no Next button
  assert.doesNotMatch(renderToStaticMarkup(createElement(RangeGuideCard, { view: { lines: tourLines(newTour(), OPEN)!, folded: false }, onShow: () => {}, onSkip: () => {}, onFold: () => {} })), /-next"/);
});

test('the engine: a new game starts it, it waits for the Who card, the welcome card and guided build wait for it, a town road counts, Help replays it', () => {
  const src = readFileSync('src/game/engine.ts', 'utf8'), app = readFileSync('src/App.tsx', 'utf8');
  assert.equal((src.match(/tour: newTour\(\)/g) ?? []).length, 3, 'the range start (laid, and while it is chosen: J9) and the town start');
  assert.match(src, /if \(tourRunning\(p\.tour\)\) return null; \/\/ T293: then the start tutorial/);
  assert.match(src, /rangeGuideView\(\)[^\n]*\{\n\s*if \(tourRunning\(this\.golf\?\.progress\?\.tour\)\) return null;/);
  assert.match(src, /!p\.seen\.includes\('who'\)\) return null; \/\/ T240: "Who are you\?" first/);
  assert.match(src, /!isCourseClass\(cls\.id\) && tourRunning\(t\)\) \{ t\.roads\+\+/);
  assert.match(src, /this\.tourCheck\(\); \/\/ T293/);
  assert.match(app, /game\.tourView\(\)/); assert.match(app, /game\.replayTour\(\)/); assert.match(app, /Replay the start tutorial/);
});

test("J9 (#1268): the jam tutorial's first step says the old range was bought with the land, and a game from before (its range still for sale) says so", () => {
  const f: TourFacts = { roadLock: null, start: 'range' };
  assert.match(tourStepFor(JAM_TOUR[0]!, f).body, /You started with \$75,000\. The land, your house and this old driving range .* took \$15,000/);
  assert.match(tourStepFor(JAM_TOUR[0]!, { ...f, rangeForSale: true }).body, /old driving range on it for sale/);
  assert.doesNotMatch(JAM_TOUR[2]!.body, /buying the old range/, 'the menu step no longer tells to buy it');
  // the normal game's last step: the range stands where the player chose; a bare start (an older save) still says to place it
  assert.match(tourStepFor(TOWN_TOUR[3]!, { ...f, rangePlaced: true }).body, /you chose where/);
  assert.match(tourStepFor(TOWN_TOUR[3]!, { ...f, rangePlaced: false }).body, /Place your driving range next/);
});

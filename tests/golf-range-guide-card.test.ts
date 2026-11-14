// T239 (#699), Phase B: the range start's guided build on its card. The card lists the steps (T288: two placement steps first; #1297, the owner, 2026-11-14: three steps in all, the placing
// of the range and of its car park and the buckets and the balls: the greens, the walking path, the car park's gravel and paving, the turf, the practice area and the first hole are out
// of the guide), ticks the done ones with their reward, the current one says what to do with Show me and Skip, every other step still to do has Show me; Skip guide; folded, only the
// current step. The engine's wiring: a new range game starts the guide, the progress check ticks it and pays, Show me for every step, the welcome card's button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { RangeGuideCard } from '../src/ui/golf/RangeGuideCard';
import { RANGE_GUIDE, newRangeGuide, rangeGuideLines, rangeGuideSkip } from '../src/game/ext/progressive-ui/guide';

const card = (g = newRangeGuide(), folded = false) => renderToStaticMarkup(createElement(RangeGuideCard, { view: { lines: rangeGuideLines(g)!, folded }, onShow: () => {}, onSkip: () => {}, onFold: () => {} }));
const render = (folded: boolean) => {
  // (the range placed by the start (PR #1274), its car park skipped: the buckets and the balls are the step to do)
  const g = newRangeGuide(); g.done.push('guide-range-place'); rangeGuideSkip(g, 'guide-range-lot');
  return card(g, folded);
};

test('the card: every step a line; done ones ticked with their reward, a skipped one struck; the current one with its words, Show me and Skip', () => {
  const html = render(false);
  assert.equal(RANGE_GUIDE.length, 3);
  for (const s of RANGE_GUIDE) assert.ok(html.includes(`data-testid="range-guide-${s.id}"`), s.id);
  for (const gone of ['greens', 'path', 'carpark', 'turf', 'practice', 'hole']) assert.ok(!html.includes(`range-guide-guide-range-${gone}"`), `the ${gone} step is out of the card`);
  assert.match(html, /data-testid="range-guide-guide-range-place" data-state="done"/); assert.match(html, /\+\$1,000/);
  assert.match(html, /data-testid="range-guide-guide-range-lot" data-state="skipped"/);
  assert.match(html, /2 of 3 done/);
  // the current step: the buckets and the balls (3): its body, Show me and Skip; no other step is still to do
  assert.ok(html.includes(RANGE_GUIDE[2]!.body.replace(/&/g, '&amp;')), 'the current step says what to do');
  assert.equal((html.match(/data-testid="range-guide-show"/g) ?? []).length, 1); assert.equal((html.match(/data-testid="range-guide-skip"/g) ?? []).length, 1);
  assert.deepEqual([...html.matchAll(/data-testid="range-guide-show-(\d)"/g)].map(m => +m[1]!), []);
  assert.match(html, /data-testid="range-guide-off"[^>]*>Skip guide/);
  // a new game's card: the step to do first, a Show on each step after it
  const fresh = card(newRangeGuide());
  assert.match(fresh, /0 of 3 done/); assert.deepEqual([...fresh.matchAll(/data-testid="range-guide-show-(\d)"/g)].map(m => +m[1]!), [2, 3]);
  // the rewards the guide pays in all are the three steps' (the others went with their steps)
  assert.equal(RANGE_GUIDE.reduce((a, s) => a + (s.reward ?? 0), 0), 2000);
});

test('folded: the current step alone', () => {
  const html = render(true);
  assert.equal((html.match(/data-testid="range-guide-guide-range-/g) ?? []).length, 1);
  assert.match(html, /range-guide-guide-range-buckets/); assert.match(html, /Step 3 of 3/);
});

test('the engine: a new range game starts the guide; its check ticks and pays; Show me for every step; the welcome card shows its first step', () => {
  const eng = readFileSync('src/game/engine.ts', 'utf8'), app = readFileSync('src/App.tsx', 'utf8');
  assert.match(eng, /this\.golf\.progress = \{ \.\.\.emptyProgress\(\), ramp: 0, guide: newRangeGuide\(\), tour: newTour\(\) \}/); // (T293: and the start tutorial)
  assert.match(eng, /this\.rangeGuideCheck\(\); \/\/ T239/);
  assert.match(eng, /const r = s\.reward \?\? 0; if \(r > 0\) this\.traffic\.spend\('construction', -r\)/);
  const show = eng.slice(eng.indexOf('  guideShowMe(id: string)'), eng.indexOf('  // ---------- the tournament prep quests'));
  // (T288: the two placement steps take the range and its car park in hand; the buckets step opens the card, then Walk. #1297: nothing else is a step of the guide)
  assert.match(show, /this\.placeRangePart\('range'\)/); assert.match(show, /this\.placeRangePart\('carpark'\)/); assert.ok(!/placeRangePart\('practice'\)/.test(show), 'the practice area is no step of the guide');
  for (const id of ['guide-range-place', 'guide-range-lot', 'guide-range-buckets']) assert.ok(show.includes(`'${id}'`), id);
  // (#1297: each Show me pulses the entry at the end of its menu path: the placements; the takings, then the Walk button)
  for (const a of ['place-range', 'place-carpark', 'range-takings', 'rail-walk']) assert.ok(show.includes(`'${a}'`), a);
  for (const gone of ['range-buy-greens', 'class-cart-walk', 'range-buy-gravel', 'practice-putting', "pulseAnchor('new-hole')"]) assert.ok(!show.includes(gone), `${gone} is no Show me of the guide now`);
  assert.match(eng, /if \(id\.startsWith\('guide-range-'\)\) \{ this\.guideShowMe\(id\); return; \}/);
  assert.match(eng, /if \(cur !== undefined\) this\.guideShowMe\(RANGE_GUIDE\[cur - 1\]!\.id\)/);
  assert.match(app, /<RangeGuideCard view=\{gv\}/); assert.match(app, /guide=\{!!game\.rangeGuideView\(\)\}/);
});

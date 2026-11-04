// T239 (#699), Phase B: the range start's guided build on its card. The card lists the steps (T288: nine, two placement steps first), ticks the done ones with their reward, the
// current one says what to do with Show me and Skip, every other step still to do has Show me; Skip guide; folded, only the current step. The
// engine's wiring: a new range game starts the guide, the progress check ticks it and pays, Show me for every step, the welcome card's button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { RangeGuideCard } from '../src/ui/golf/RangeGuideCard';
import { RANGE_GUIDE, newRangeGuide, rangeGuideLines, rangeGuideSkip } from '../src/game/ext/progressive-ui/guide';

const render = (folded: boolean) => {
  // (T288: the range and its car park placed: the two placement steps done)
  const g = newRangeGuide(); g.done.push('guide-range-place', 'guide-range-lot', 'guide-range-buckets', 'guide-range-carpark'); rangeGuideSkip(g, 'guide-range-greens');
  return renderToStaticMarkup(createElement(RangeGuideCard, { view: { lines: rangeGuideLines(g)!, folded }, onShow: () => {}, onSkip: () => {}, onFold: () => {} }));
};

test('the card: every step a line; done ones ticked with their reward, a skipped one struck; the current one with its words, Show me and Skip', () => {
  const html = render(false);
  for (const s of RANGE_GUIDE) assert.ok(html.includes(`data-testid="range-guide-${s.id}"`), s.id);
  assert.match(html, /data-testid="range-guide-guide-range-buckets" data-state="done"/); assert.match(html, /\+\$500/);
  assert.match(html, /data-testid="range-guide-guide-range-greens" data-state="skipped"/);
  assert.match(html, /data-testid="range-guide-guide-range-carpark" data-state="done"/);
  assert.match(html, /4 of 9 done|5 of 9 done/);
  // the current step: the walking path (5, T288: after the two placement steps): its body, Show me and Skip; the other steps still to do have Show
  assert.ok(html.includes(RANGE_GUIDE[4]!.body.replace(/&/g, '&amp;')), 'the current step says what to do');
  assert.equal((html.match(/data-testid="range-guide-show"/g) ?? []).length, 1); assert.equal((html.match(/data-testid="range-guide-skip"/g) ?? []).length, 1);
  assert.deepEqual([...html.matchAll(/data-testid="range-guide-show-(\d)"/g)].map(m => +m[1]!), [7, 8, 9]);
  assert.match(html, /data-testid="range-guide-off"[^>]*>Skip guide/);
});

test('folded: the current step alone', () => {
  const html = render(true);
  assert.equal((html.match(/data-testid="range-guide-guide-range-/g) ?? []).length, 1);
  assert.match(html, /range-guide-guide-range-path/); assert.match(html, /Step 5 of 9/);
});

test('the engine: a new range game starts the guide; its check ticks and pays; Show me for every step; the welcome card shows its first step', () => {
  const eng = readFileSync('src/game/engine.ts', 'utf8'), app = readFileSync('src/App.tsx', 'utf8');
  assert.match(eng, /this\.golf\.progress = \{ \.\.\.emptyProgress\(\), ramp: 0, guide: newRangeGuide\(\), tour: newTour\(\) \}/); // (T293: and the start tutorial)
  assert.match(eng, /this\.rangeGuideCheck\(\); \/\/ T239/);
  assert.match(eng, /const r = s\.reward \?\? 0; if \(r > 0\) this\.traffic\.spend\('construction', -r\)/);
  const show = eng.slice(eng.indexOf('  guideShowMe(id: string)'), eng.indexOf('  guideShowMe(id: string)') + 4200);
  // (T288: the two placement steps take the range, its car park and the practice area in hand before the switch; the rest are steps 3 to 9)
  assert.match(show, /this\.placeRangePart\('range'\)/); assert.match(show, /this\.placeRangePart\('carpark'\)/); assert.match(show, /this\.placeRangePart\('practice'\)/);
  for (const k of ['case 3', 'case 4', 'case 5', 'case 6', 'case 7', 'case 8', 'default']) assert.ok(show.includes(k), k);
  for (const a of ['range-takings', 'range-buy-greens', 'rail-paths', 'range-buy-pave', 'range-buy-gravel', 'range-buy-teeturf', 'land-buy', 'new-hole']) assert.ok(show.includes(`'${a}'`), a);
  assert.match(show, /this\.roadClass = 'cart-walk'/, 'the walking path step hands the Walking path');
  assert.match(eng, /if \(id\.startsWith\('guide-range-'\)\) \{ this\.guideShowMe\(id\); return; \}/);
  assert.match(eng, /if \(cur !== undefined\) this\.guideShowMe\(RANGE_GUIDE\[cur - 1\]!\.id\)/);
  assert.match(app, /<RangeGuideCard view=\{gv\}/); assert.match(app, /guide=\{!!game\.rangeGuideView\(\)\}/);
});

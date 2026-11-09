// T354 (#996): the new-game card's tick box "Build the estate streets and lots" (Who are you? > Your course), as markup (react-dom/server: no effects, no network): there when the
// card is given the box's state, checked or not as the state says, with its words and its tip, and the card without the prop as it was.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { WhoCard } from '../src/ui/golf/YouCards';
import type { Featured } from '../src/ui/golf/CoursePicker';

const FEATURED: Featured[] = [{ id: 'woodhill', name: 'Woodhill Country Club (from map data)', place: 'Pretoria, South Africa', holes: 18, par: 72, mappedPar: 73, scale: 0.9 }];
const noop = () => undefined;
/** the tick box's own tag in a card's markup ('' when there is none) */
const box = (h: string): string => /<input[^>]*data-testid="who-estate-box"[^>]*>/.exec(h)?.[0] ?? '';
const who = (estate?: { on: boolean; set: (on: boolean) => void }) => renderToStaticMarkup(createElement(WhoCard, {
  name: '', look: 0, looks: [], hcp: '18.5', onDone: noop, course: { featured: FEATURED, current: null, currentName: null, onOwn: noop, onFeatured: noop, onBuild: noop, ...(estate ? { estate } : {}) },
}));

describe('the estate tick box on the new-game card (T354)', () => {
  it('is under the Your course row, with its words, checked when the estate is on', () => {
    const h = who({ on: true, set: noop });
    assert.ok(h.includes('data-testid="who-estate"') && h.includes('data-testid="who-estate-box"'));
    assert.match(box(h), /type="checkbox"/); assert.match(box(h), / checked=""/, 'checked');
    assert.ok(h.includes('Build the estate streets and lots'), 'the words of the ticket');
    assert.ok(h.indexOf('data-testid="who-course-open"') < h.indexOf('data-testid="who-estate"'), 'under the course row');
    assert.match(h, /data-tip="[^"]*golf estate[^"]*residential estate[^"]*Woodhill/, 'the tip says what it builds and when it is on by default');
  });
  it('is not checked when the estate is off, and the card has no box when it is given none', () => {
    const off = who({ on: false, set: noop });
    assert.ok(box(off).length > 0 && !/ checked/.test(box(off)), 'there, and not checked');
    const none = who();
    assert.ok(!none.includes('who-estate') && none.includes('data-testid="who-course-open"'), 'the card as it was');
  });
});

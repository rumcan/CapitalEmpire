// T358 (#1003): the new-game card's course picker, as markup (react-dom/server: effects do not run, so the picker shows its home before its library is read): Build your
// own first, Featured, Downloaded courses, the Find a real course search box with its credit; the Who-are-you card's Your course row opens it and says which course the
// game is on; the grade chip names the three grades. No network, no IndexedDB.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { CoursePicker, GradeChip, type Featured } from '../src/ui/golf/CoursePicker';
import { WhoCard } from '../src/ui/golf/YouCards';

const FEATURED: Featured[] = [
  { id: 'rondebosch', name: 'Rondebosch Golf Course (from map data)', place: 'Cape Town, South Africa', holes: 18, par: 72, mappedPar: 72 },
  { id: 'magnolia-national', name: 'Magnolia National (from map data)', place: 'Georgia, United States', holes: 18, par: 75, mappedPar: 72 },
  { id: 'woodhill', name: 'Woodhill Country Club (from map data)', place: 'Pretoria, South Africa', holes: 18, par: 72, mappedPar: 73, scale: 0.9 },
];
const noop = () => undefined;
const picker = (current: string | null = null) => renderToStaticMarkup(createElement(CoursePicker, { featured: FEATURED, current, onOwn: noop, onFeatured: noop, onBuild: noop, onClose: noop }));
const who = (over: { current?: string | null; currentName?: string | null } = {}) => renderToStaticMarkup(createElement(WhoCard, {
  name: '', look: 0, looks: [], hcp: '18.5', onDone: noop,
  course: { featured: FEATURED, current: over.current ?? null, currentName: over.currentName ?? null, onOwn: noop, onFeatured: noop, onBuild: noop },
}));

describe('the course picker (T358)', () => {
  it('shows Build your own first, then Featured with the shipped courses, then Downloaded courses, then the search box', () => {
    const h = picker();
    const at = (s: string) => { const i = h.indexOf(s); assert.ok(i >= 0, `${s} is in the picker`); return i; };
    assert.ok(at('Build your own') < at('Featured') && at('Featured') < at('Downloaded courses') && at('Downloaded courses') < at('Find a real course'));
    for (const f of FEATURED) assert.ok(h.includes(f.name) && h.includes(`data-testid="who-course-${f.id}"`), f.id);
    assert.ok(h.includes('scaled to 90%') && h.includes('(73 on the map)') && h.includes('(72 on the map)'), 'the scale and the mapped par are said');
    assert.ok(h.includes('data-testid="find-input"') && h.includes('data-testid="find-go"'), 'the search box and its button');
    assert.ok(h.includes('None yet') && h.includes('data-testid="find-downloaded-empty"'), 'the library is empty before it is read');
    assert.ok(h.includes('© OpenStreetMap contributors'), 'the credit is on the card');
    assert.ok(/only when you press Search/.test(h), 'the card says a search is one request, on Search only');
  });
  it('marks the course the game is on (Build your own, or a featured one)', () => {
    const on = (h: string, id: string) => new RegExp(`border-amber-300[^"]*"[^>]*data-testid="${id}"`).test(h);
    assert.ok(on(picker(null), 'who-course-own') && !on(picker(null), 'who-course-woodhill'));
    assert.ok(on(picker('woodhill'), 'who-course-woodhill') && !on(picker('woodhill'), 'who-course-own'));
  });
  it('disables the search until the library is open (it is read in an effect)', () => {
    assert.match(picker(), /<input[^>]*disabled=""[^>]*data-testid="find-input"|<input[^>]*data-testid="find-input"[^>]*disabled=""/);
  });
  it('the grade chip names the three grades', () => {
    assert.match(renderToStaticMarkup(createElement(GradeChip, { grade: 'full' })), /data-grade="full"[^>]*>Full</);
    assert.match(renderToStaticMarkup(createElement(GradeChip, { grade: 'partial' })), /data-grade="partial"[^>]*>Partial</);
    assert.match(renderToStaticMarkup(createElement(GradeChip, { grade: 'outline' })), /data-grade="outline"[^>]*>Outline only</);
  });
});

describe('the Who-are-you card\'s Your course row (T358)', () => {
  it('is a button that opens the picker, and says Build your own while no real course is chosen', () => {
    const h = who();
    assert.ok(h.includes('data-testid="who-course-open"') && h.includes('aria-expanded="false"') && h.includes('Change or find a course'));
    assert.ok(/Build your own<\/span>[^<]*<span[^>]*>· a driving range and an empty plot/.test(h));
    assert.ok(!h.includes('data-testid="find-card"'), 'the picker is closed until the row is pressed');
  });
  it('names the real course the game is on, with where it comes from', () => {
    const h = who({ current: 'way/4261725', currentName: 'Wingatepark Country Club' });
    assert.ok(h.includes('Wingatepark Country Club') && h.includes('(from map data)'));
    assert.ok(!h.includes('a driving range and an empty plot'));
  });
});

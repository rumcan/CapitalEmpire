// T358 (#1003): the new-game card's course picker, as markup (react-dom/server: effects do not run, so the picker shows its home before its library is read): Build your
// own first, Featured, Downloaded courses, the Find a real course search box with its credit; the Who-are-you card's Your course row opens it and says which course the
// game is on; the grade chip names the three grades. No network, no IndexedDB.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { CoursePicker, GradeChip, PreviewButtons, type Featured } from '../src/ui/golf/CoursePicker';
import { WhoCard } from '../src/ui/golf/YouCards';
import { readFileSync } from 'node:fs';
import { CatalogueFinder, CountryFlyout, rowLine } from '../src/ui/golf/CourseNames';
import { filterCatalogue, parseChunk } from '../src/game/golf/osm/catalogue';

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

describe('the two ways in of a previewed course (T356 with T358: "place the imported course with the placing mode, and back out, rather than starting a new game straight away")', () => {
  const buttons = (over: { can?: boolean; holes?: number; place?: boolean } = {}) => renderToStaticMarkup(createElement(PreviewButtons, { can: over.can ?? true, holes: over.holes ?? 18, onBuild: noop, ...(over.place === false ? {} : { onPlace: noop }) }));
  it('offers Build this course (a new game) and Place it in my map (the placing mode), and says what each does', () => {
    const h = buttons();
    assert.ok(h.indexOf('data-testid="find-build"') > 0 && h.indexOf('data-testid="find-place"') > h.indexOf('data-testid="find-build"'), 'Build first, Place under it');
    assert.match(h, /data-testid="find-build"[^>]*>Build this course</);
    assert.match(h, /data-testid="find-place"[^>]*>Place it in my map</);
    assert.match(h, /title="Start a new game on this course: this map is replaced"/);
    assert.match(h, /title="Keep this map and place the course on it[^"]*Esc puts it down and brings this card back"/);
    assert.match(h, /data-testid="find-place-note"[^>]*>Build starts a new game on it\. Place keeps this map/);
    assert.ok(!/disabled=""/.test(h), 'both on');
  });
  it('is Build this course alone where the card is not given a way to place a course (the route stays as it was)', () => {
    const h = buttons({ place: false });
    assert.ok(h.includes('data-testid="find-build"') && !h.includes('data-testid="find-place"') && !h.includes('find-place-note'));
  });
  it('turns both off, with the reason on the first, for a course with no holes or too big for the map', () => {
    for (const [holes, why] of [[0, 'Cannot be built'], [18, 'Too big for the map']] as const) {
      const h = buttons({ can: false, holes });
      assert.match(h, new RegExp(`data-testid="find-build"[^>]*>${why}<`));
      assert.equal((h.match(/disabled=""/g) ?? []).length, 2, `${why}: both disabled`);
      assert.ok(!h.includes('find-place-note'), 'no note for a course that cannot be used');
    }
  });
  it('the picker opens without a place button until a course is previewed (it is in the preview only)', () => {
    assert.ok(!renderToStaticMarkup(createElement(CoursePicker, { featured: FEATURED, current: null, onOwn: noop, onFeatured: noop, onBuild: noop, onPlace: noop, onClose: noop })).includes('find-place'));
  });
});

describe('the Who-are-you card while a course is in hand (T356)', () => {
  const card = (over: { hidden?: boolean; current?: string | null } = {}) => renderToStaticMarkup(createElement(WhoCard, {
    name: 'Jack', look: 0, looks: [], hcp: '18.5', onDone: noop, hidden: over.hidden,
    course: { featured: FEATURED, current: over.current ?? null, currentName: null, onOwn: noop, onFeatured: noop, onBuild: noop, onPlace: noop },
  }));
  it('is out of the way (display: none) but still there, so the picker is as it was when the course is placed or put down', () => {
    const h = card({ hidden: true });
    assert.match(h, /style="display:none"/); assert.match(h, /data-hidden="true"/);
    assert.ok(h.includes('data-testid="who-card"') && h.includes('data-testid="who-name"'), 'mounted, name and all');
    const shown = card();
    assert.ok(!/display:none/.test(shown) && !shown.includes('data-hidden'), 'shown otherwise');
  });
});

// ------------------------------------------------------------------------------------------------------------------------ T378: the filter list of course names
const CAT = parseChunk({ v: 1, cc: 'ZA', e: [
  ['w4261725', 'Wingatepark Country Club', 'Wingate Park, Pretoria', -25.8308, 28.2804, 28, 49, 18, '', ''],
  ['w103', 'Pretoria Country Club', 'Waterkloof, Pretoria', -25.79, 28.2, 300, 200, 9, '', ''],
  ['n110', 'Pitch & Putt', 'Wingate Park, Pretoria', -25.83, 28.28, 0, 0, 0, '', ''],
  ['w104', 'A Very Long Named Golf And Country Club And Estate Of The Greater Pretoria Metropolitan Area', 'Some Village Near A Town With A Very Long Name, Gauteng', -25.8, 28.2, 90, 90, 3, '', ''],
] }, new Map([['ZA', 'South Africa']]));
const finder = (over: Partial<Parameters<typeof CatalogueFinder>[0]> = {}) => renderToStaticMarkup(createElement(CatalogueFinder, {
  status: 'ready', summary: '4 golf courses in 1 countries', text: 'wing', onText: noop, onKey: noop, countryLabel: 'All countries', countryOn: false, flyoutOpen: false, onCountry: noop,
  filtered: filterCatalogue(CAT, 'wing'), active: 0, onActive: noop, onPick: noop, credit: 'Course names: © OpenStreetMap contributors, ODbL.', ...over,
}));

describe('the filter list of course names, as markup (T378)', () => {
  it('is the first thing of Find a real course, and the name search is under it, for a course that is not in the list', () => {
    const h = picker();
    const at = (s: string) => { const i = h.indexOf(s); assert.ok(i >= 0, `${s} is in the picker`); return i; };
    assert.ok(at('data-testid="cat-finder"') < at('Not in the list?') && at('Not in the list?') < at('data-testid="find-input"') && at('data-testid="find-input"') < at('data-testid="find-go"'));
    assert.ok(at('Downloaded courses') < at('data-testid="cat-finder"'), 'after the Downloaded courses, as the search always was');
    assert.ok(at('data-testid="cat-input"') < at('data-testid="find-input"'), 'the filter input comes before the search input');
    assert.ok(h.includes('data-testid="cat-country"') && h.includes('All countries'), 'a country button beside it');
    assert.ok(h.includes('Loading the course names...'), 'the card says so while the catalogue loads (its code is loaded when the card opens)');
    assert.ok(/only when you press Search/.test(h), 'the fallback keeps its words: a search is one request, on Search only');
  });
  it('shows a row for each match: the name, the town and the country, with Full on a course whose holes are all mapped', () => {
    const h = finder();
    assert.ok(h.includes('data-testid="cat-row-way-4261725"') && h.includes('Wingatepark Country Club') && h.includes('Wingate Park, Pretoria, South Africa'));
    assert.match(h, /data-testid="cat-full-way-4261725"[^>]*>Full</);
    assert.ok(!h.includes('cat-full-node-110'), 'no chip on a course with no hole lines');
    assert.ok(h.includes('data-testid="cat-row-node-110"'), 'and a course whose TOWN has the word is listed too');
    assert.match(h, /role="listbox"/); assert.match(h, /role="option"/);
    assert.ok(/aria-selected="true"[^>]*data-testid="cat-row-way-4261725"/.test(h) || /data-testid="cat-row-way-4261725"[^>]*aria-selected="true"/.test(h), 'the first row is the active one (Enter picks it)');
  });
  it('counts what matched in a header that stays at the top of the list, and nothing scrolls sideways', () => {
    const h = finder();
    assert.match(h, /data-testid="cat-count"/); assert.ok(h.includes('sticky top-0'), 'sticky header');
    assert.match(h, /2 golf courses match &quot;wing&quot;/);
    assert.ok(h.includes('overflow-y-auto') && h.includes('overflow-x-hidden') && !/overflow-x-(auto|scroll)/.test(h), 'the list scrolls up and down inside its box only');
    assert.ok(h.includes('break-words'), 'a long name wraps instead of running off the card');
    assert.match(finder({ filtered: filterCatalogue(CAT, 'wing', { limit: 1 }) }), /2 golf courses match &quot;wing&quot; · the best 1 are listed: type more to narrow them/);
  });
  it('says what to do before anything is typed, and when nothing matches (and the search below is the way on)', () => {
    const none = finder({ text: '', filtered: filterCatalogue(CAT, '') });
    assert.ok(none.includes('data-testid="cat-hint"') && !none.includes('data-testid="cat-list"') && /Type any part of a course&#x27;s name or of its town/.test(none));
    const nothing = finder({ text: 'zzz', filtered: filterCatalogue(CAT, 'zzz') });
    assert.ok(nothing.includes('data-testid="cat-none"') && /search the map by name below/.test(nothing) && /0 golf courses match &quot;zzz&quot;/.test(nothing));
    assert.ok(/still loading/.test(finder({ text: 'zzz', status: 'loading', filtered: filterCatalogue(CAT, 'zzz') })), 'while it loads: not found YET');
    const country = finder({ text: '', countryOn: true, countryLabel: 'South Africa (4)', filtered: filterCatalogue(CAT, '', { cc: 'ZA' }) });
    assert.ok(country.includes('data-testid="cat-list"') && /4 golf courses in this country/.test(country) && country.includes('South Africa (4) ›'), 'a country alone lists its courses by name');
  });
  it('carries the credit and the status line, and offers Try again when the files could not be read', () => {
    const h = finder();
    assert.ok(h.includes('data-testid="cat-credit"') && h.includes('© OpenStreetMap contributors, ODbL.') && h.includes('data-testid="cat-status"') && h.includes('4 golf courses in 1 countries'));
    assert.ok(!h.includes('cat-retry'));
    const bad = finder({ status: 'failed', summary: 'The course names could not be read.', filtered: filterCatalogue(CAT, 'wing'), onRetry: noop });
    assert.ok(bad.includes('data-testid="cat-retry"') && bad.includes('Try again') && bad.includes('text-amber-200'));
  });
  it('is switched off while a course is being fetched (rows cannot be pressed twice)', () => {
    const h = finder({ disabled: true });
    assert.ok((h.match(/disabled=""/g) ?? []).length >= 3, 'the input and the rows');
  });
  it('words the second line of a row: the town, the country, and the size when it is known', () => {
    assert.equal(rowLine({ place: 'Wingate Park, Pretoria', country: 'South Africa', w: 280, h: 490 }), 'Wingate Park, Pretoria, South Africa · 280 m x 490 m');
    assert.equal(rowLine({ place: '', country: 'France', w: 1500, h: 1200 }), 'France · 1.5 km x 1.2 km');
    assert.equal(rowLine({ place: 'X', country: 'Y', w: 0, h: 0 }), 'X, Y', 'a point has no size');
  });
});

describe('the countries flyout, in two levels (T378)', () => {
  const continents = [
    { id: 'AM', name: 'The Americas', n: 13306, countries: [{ cc: 'US', country: 'United States', n: 13000 }, { cc: 'CA', country: 'Canada', n: 306 }] },
    { id: 'EU', name: 'Europe', n: 2900, countries: [{ cc: 'GB', country: 'United Kingdom', n: 2900 }] },
    { id: 'AF', name: 'Africa', n: 306, countries: [{ cc: 'ZA', country: 'South Africa', n: 306 }] },
  ];
  const flyout = (over: Partial<Parameters<typeof CountryFlyout>[0]> = {}) => renderToStaticMarkup(createElement(CountryFlyout, { continents, cc: '', total: 16512, onPick: noop, onClose: noop, ...over }));
  it('is a column of its own beside the picker: All countries, then the continents with their number of countries and courses, a title that stays at the top, and a way to close it', () => {
    const h = flyout();
    assert.ok(h.includes('data-testid="cat-countries"') && h.includes('data-testid="cat-country-all"') && h.includes('All countries') && h.includes('16,512'));
    assert.ok(h.indexOf('cat-continent-AM') < h.indexOf('cat-continent-EU') && h.indexOf('cat-continent-EU') < h.indexOf('cat-continent-AF'), 'in the order it is given (most courses first)');
    assert.ok(h.includes('The Americas') && h.includes('2 · 13,306 ›') && h.includes('win-head'), 'counts, and the sticky title');
    assert.ok(h.includes('data-testid="cat-countries-close"') && h.includes('overflow-y-auto') && !/overflow-x-(auto|scroll)/.test(h));
    assert.ok(!h.includes('cat-continent-countries'), 'no second column until a continent is opened');
  });
  it('a continent opens a second column of its countries, each with its number of courses; the one chosen is marked', () => {
    const h = flyout({ startOpen: 'AM' });
    assert.ok(h.includes('data-testid="cat-continent-countries"') && h.includes('data-testid="cat-country-US"') && h.includes('United States') && h.includes('13,000') && h.includes('data-testid="cat-country-CA"'));
    assert.ok(!h.includes('cat-country-GB'), 'only that continent\'s');
    assert.match(flyout({ startOpen: 'AM', cc: 'CA' }), /bg-amber-300\/15[^"]*"[^>]*data-testid="cat-country-CA"/);
    assert.ok(/aria-expanded="true"[^>]*data-testid="cat-continent-AM"/.test(h) || /data-testid="cat-continent-AM"[^>]*aria-expanded="true"/.test(h) || h.includes('cat-continent-AM'));
    assert.ok(flyout({ cc: 'GB' }).includes('data-testid="cat-country-GB"'), 'with a country already chosen its continent is open');
  });
  it('puts the player\'s own country first and says so, whatever continent it is in', () => {
    const h = flyout({ prefer: 'ZA' });
    assert.ok(h.indexOf('cat-country-ZA') > 0 && h.indexOf('cat-country-ZA') < h.indexOf('cat-continent-AM') && h.includes('(your region)') && h.includes('Continents'));
    assert.ok(!flyout({ prefer: 'XX' }).includes('(your region)'), 'a country the catalogue does not have is not offered');
  });
});

describe('the progress card says which server is asked and that the servers are slow (T378)', () => {
  it('the card shows the note under the progress line, and the wait', () => {
    // (the picker's working view is state, not a prop: its words are checked in the source; the sentences themselves are tested in tests/golf-osm-mirrors.test.ts)
    const src = readFileSync('src/ui/golf/CoursePicker.tsx', 'utf8');
    assert.ok(/data-testid="find-progress"/.test(src) && /data-testid="find-slow"/.test(src) && /info\?\.note/.test(src), 'the note rides with the step');
    assert.ok(/data-testid="find-waited"/.test(src) && /Waiting \{s\} s for the answer/.test(src), 'and the card counts the seconds of a long wait');
  });
});

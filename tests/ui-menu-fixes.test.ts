// T366 (#1021; the owner, 2026-11-08): the menu fixes. "Any menu button that opens a new menu window to the side like the Bunker Look button should be full width and
// look different so the user can clearly tell there's more menus if he clicks it." (one shared row, SideMenuRow); "make headers for windows sticky with the window close
// button also sticky." (.win-head); "fix main menu. we can't have text going in 2 lines." (the left rail's labels on one line); "move the skipping to tournament forward
// arrow button to the season window." (the Season card's Skip row). Rendered to static markup; the layout itself (one line at 100% and 125%, a header that stays put while
// the content scrolls) is measured in the real game by scripts/dev/menu-fixes-shots.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { SideMenuRow, sideArrow } from '../src/ui/SideMenuRow';
import { BunkerPickEntry } from '../src/ui/BunkerSettings';
import { BagCard } from '../src/ui/golf/BagCard';
import { SeasonCard } from '../src/ui/golf/SeasonCard';
import { Rail } from '../src/ui/Rail';
import { RAIL, drawerOf, railLabel, type RailEntry } from '../src/ui/rail-items';
import { ANCHOR_FALLBACK, anchorElement } from '../src/ui/GuidePulse';
import { bagGear, bagView } from '../src/game/golf/play';
import { START_SKILLS, gameSkills } from '../src/game/golf/player';
import type { Game } from '../src/game/engine';

const src = (f: string) => readFileSync(f, 'utf8'), css = src('src/index.css');
const noop = () => { /* none */ };
/** a CSS rule's body by its selector (the first rule that starts with it) */
const rule = (sel: string): string => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';

test('one row for every button that opens a menu to the side: full width, a clear arrow, its own look; the arrow points the way it opens', () => {
  assert.equal(sideArrow('right', false), '▸'); assert.equal(sideArrow('right', true), '▸'); assert.equal(sideArrow('left', true), '◂');
  assert.equal(sideArrow('down', false), '▸'); assert.equal(sideArrow('down', true), '▾', 'an editor folding out below turns its arrow down');
  const h = renderToStaticMarkup(createElement(SideMenuRow, { label: 'Bunker look', sub: 'Sand and walls', value: 'Fairway: Mown', onClick: noop, 'data-looks': true, 'aria-pressed': false, title: 'T' }));
  assert.match(h, /^<button type="button" class="side-row"/); assert.match(h, /data-side-menu/); assert.match(h, /data-looks="true"/); assert.match(h, /aria-pressed="false"/); assert.ok(!/aria-expanded/.test(h), 'its own aria state is kept, none is added');
  assert.match(h, />Bunker look</); assert.match(h, />Sand and walls</); assert.match(h, />Fairway: Mown</); assert.match(h, /<span class="side-row-arrow" aria-hidden="true">▸<\/span>/);
  const open = renderToStaticMarkup(createElement(SideMenuRow, { label: 'Shaft', side: 'left', open: true, onClick: noop }));
  assert.match(open, /side-row side-row-open/); assert.match(open, /aria-expanded="true"/); assert.match(open, /data-side="left"/); assert.match(open, />◂</);
  // the look: the panel's whole width, apart from a chip's pill; lit while open; the arrow in a pocket; a long name wraps inside it, it never makes a sideways scroll
  const r = rule('.side-row'); assert.match(r, /width: 100%/); assert.match(r, /display: flex/); assert.match(r, /min-width: 0/); assert.match(r, /border-left-width: 3px/);
  assert.ok(rule('.side-row-open').length > 0 && rule('.side-row-arrow').length > 0 && /overflow-wrap: anywhere/.test(rule('.side-row-label')));
  assert.ok(!/border-radius: 999px/.test(r), 'not a pill like the chips');
});

test('the openers are that row: Bunker look, the grass and look entries, the fairway look editor, the facilities\' looks and the Bag\'s putter slots', () => {
  const game = { golfMode: true, courseGrid: {}, bunkers: {}, paint: { closeGrass: noop }, armBunkerPick: noop } as unknown as Game;
  const b = renderToStaticMarkup(createElement(BunkerPickEntry, { game, looks: false, onLooks: noop }));
  assert.match(b, /<button type="button" class="side-row"[^>]*data-bunker-look/); assert.match(b, />Bunker look</); assert.match(b, /aria-pressed="false"/);
  assert.match(b, /<button type="button" class="chip"[^>]*>Pick bunker</, 'Pick bunker does something: it stays a chip');
  assert.match(renderToStaticMarkup(createElement(BunkerPickEntry, { game, looks: true, onLooks: noop })), /side-row side-row-open/);
  // the Bag: the putter's Shaft and Head open their parts to the left
  const bag = renderToStaticMarkup(createElement(BagCard, { view: { ...bagView(null, gameSkills(START_SKILLS, 0, bagGear(null)), { shop: true, money: 5000 }), busy: null }, onClose: noop, onUpgrade: noop, onFit: noop, onThird: noop, initial: 'putter' }));
  for (const k of ['shaft', 'head']) assert.match(bag, new RegExp(`<button type="button" class="side-row"[^>]*data-side="left"[^>]*data-testid="bag-slot-${k}"`), k);
  // no chip with an arrow in its text is left in the panels (the inline More options and the mode toggles are headers and toggles, not menus)
  for (const f of ['src/ui/BunkerSettings.tsx', 'src/ui/course/BrushControls.tsx', 'src/ui/course/SurfaceFocus.tsx', 'src/ui/course/PracticePanel.tsx', 'src/ui/golf/BagCard.tsx']) {
    const text = src(f); assert.ok(/<SideMenuRow/.test(text), f); assert.ok(!/<button[^>]*className=\{?[`"]chip[^>]*>[^<]*(?:<span aria-hidden>)?[▸◂]/.test(text), `${f}: no chip with an arrow`);
  }
  assert.equal((src('src/ui/course/BrushControls.tsx').match(/<SideMenuRow/g) ?? []).length, 4, 'Edit in <grass>, Edit, Your grass and My looks');
  for (const id of ['grass-edit', 'practice-looks', 'data-looks', 'data-focus-edit', 'data-bunker-look']) assert.ok(['BunkerSettings', 'course/BrushControls', 'course/SurfaceFocus', 'course/PracticePanel'].some(f => src(`src/ui/${f}.tsx`).includes(id)), `${id} is still where the tests and shot scripts find it`);
});

test('every scrolling window\'s header is pinned: its title and its close button stay while the content scrolls', () => {
  const r = rule('.win-head'); assert.match(r, /position: sticky/); assert.match(r, /top: 0/); assert.match(r, /z-index: \d+/); assert.match(r, /background: rgb\(/, 'an opaque colour: the content never shows through');
  assert.match(r, /margin: calc\(var\(--win-pad, 0\.75rem\) \* -1\)/, 'flush in the window\'s padding');
  assert.ok(rule('.win-head-slate').length > 0 && /--win-pad: 1\.25rem/.test(rule('.win-head-pad5')));
  // every window that scrolls and has a title row with a close button wears it (the cards' rows were `border-b border-white/10 pb-2`: the plain row is gone from them)
  const windows: [string, number][] = [['src/ui/golf/BagCard.tsx', 3], ['src/ui/golf/CardsCard.tsx', 1], ['src/ui/golf/ClubhouseCard.tsx', 1], ['src/ui/golf/StaffCard.tsx', 1], ['src/ui/golf/RangeCard.tsx', 1], ['src/ui/golf/PlayerCard.tsx', 1],
    ['src/ui/golf/HoleCard.tsx', 1], ['src/ui/golf/CoursePicker.tsx', 1], ['src/ui/golf/SeasonCard.tsx', 1], ['src/ui/CourseStatsPanel.tsx', 1], ['src/ui/course/MyLooks.tsx', 1], ['src/ui/course/GrassEditor.tsx', 1], ['src/App.tsx', 1]];
  for (const [f, n] of windows) assert.ok((src(f).match(/["']win-head[ "']/g) ?? []).length >= n, `${f}: ${n} header(s)`);
  // Event Structures and the Season card put the close button inside the header row (the Season card's was absolute in its scroller: it scrolled away)
  const app = src('src/App.tsx'), ev = app.slice(app.indexOf('Event Structures') - 400, app.indexOf('Event Structures') + 400); assert.match(ev, /win-head[^"]*"/); assert.ok(ev.indexOf('win-head') < ev.indexOf('Event Structures') && ev.indexOf('Event Structures') < ev.indexOf('toggleEventTool'), 'title and close in the row');
  assert.ok(!/className="btn-icon absolute right-2 top-2"/.test(src('src/ui/golf/SeasonCard.tsx')), 'no close button stuck to the scroller');
});

test('the left rail: every label is one line (the long one is shortened, its tip and name keep the full words)', () => {
  const paths = RAIL.find(r => r.id === 'paths')!;
  assert.equal(railLabel(paths), 'Paths & roads'); assert.equal(paths.label, 'Cart paths & roads', 'the tip and the name keep it');
  for (const r of RAIL.filter(x => drawerOf(x) === 'side')) assert.ok(railLabel(r).length <= 13, `${r.id}: "${railLabel(r)}" fits a rail button (the footer's buttons are as wide as their words)`);
  const entry = (item: (typeof RAIL)[number]): RailEntry => ({ item, on: false, locked: null, isNew: false, heading: item.section });
  const h = renderToStaticMarkup(createElement(Rail, { entries: ['select', 'range', 'course', 'paths', 'facilities', 'bulldoze'].map(id => entry(RAIL.find(r => r.id === id)!)), onPick: noop, onLocked: noop }));
  assert.match(h, /aria-label="Cart paths &amp; roads"/); assert.match(h, /<span>Paths &amp; roads<\/span>/); assert.ok(!/<span>Cart paths/.test(h));
  assert.match(rule('.rail-tab span') + (css.match(/\.rail-tab span \{[^}]*\}/)?.[0] ?? ''), /white-space: nowrap/, 'a label never wraps');
});

test('the skip-to-tournament button is in the Season card (not the top bar), and the guide still points at it', () => {
  const view = (o: { due?: boolean; live?: boolean; skipping?: boolean } = {}) => ({
    golfView: () => ({ tier: 1, tierName: 'Club', month: 'Jun', monthsLeft: 2, live: !!o.live, year: 1 }),
    foundingView: () => ({ invited: true, due: o.due ?? true, check: { text: 'x', holesNeeded: 9 } }),
    traffic: { round: { runs: 1 }, skipping: !!o.skipping }, courseStatsView: () => null, panel: null, skipToTournament: noop,
  } as unknown as Game);
  const html = (g: Game, canSkip?: boolean) => renderToStaticMarkup(createElement(SeasonCard, { game: g, onClose: noop, ...(canSkip === undefined ? {} : { canSkip }) }));
  const on = html(view(), true);
  const skipTag = (h: string) => h.match(/<button[^>]*data-testid="season-skip"[^>]*>/)?.[0] ?? '';
  assert.match(on, /data-guide="chip-skip"/); assert.match(on, /data-testid="season-skip"/); assert.match(on, /Skip to tournament/); assert.ok(skipTag(on) && !/ disabled=""/.test(skipTag(on)), 'on offer');
  assert.ok(!/chip-skip/.test(html(view(), false)) && !/chip-skip/.test(html(view())), 'the unlocks still gate it: no button until the stage shows it');
  assert.match(html(view({ due: false }), true), /Skip to season end/);
  assert.match(skipTag(html(view({ live: true }), true)), / disabled=""/, 'not on tournament day'); assert.match(skipTag(html(view({ skipping: true }), true)), / disabled=""/, 'not while it skips');
  // the top bar has none now, the card is given the unlock, and the guide falls back to the Season chip while the card is shut
  const app = src('src/App.tsx'); assert.ok(!/data-guide="chip-skip"/.test(app), 'gone from the top bar'); assert.match(app, /<SeasonCard[^>]*canSkip=\{chip\('skipTournament'\)\}/);
  assert.deepEqual(ANCHOR_FALLBACK['chip-skip'], ['season-chip']);
  const el = (w: number) => ({ getBoundingClientRect: () => ({ width: w, height: w }) }) as unknown as HTMLElement, chip = el(20), skip = el(30);
  const doc = (open: boolean) => ({ querySelectorAll: (q: string) => (q === '[data-guide="chip-skip"]' ? (open ? [skip] : []) : q === '[data-guide="season-chip"]' ? [chip] : []) }) as unknown as Document;
  assert.equal(anchorElement('chip-skip', doc(false)), chip, 'the Season chip while the card is shut'); assert.equal(anchorElement('chip-skip', doc(true)), skip, 'the Skip row once it is open');
  assert.match(src('src/game/ext/progressive-ui/index.ts'), /skipTournament: 2/, 'its stage is the same');
});

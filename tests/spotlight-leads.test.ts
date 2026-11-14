// #1297 (the owner, 2026-11-14: the guide's Show me lit the Course button, "clicking there does not open", and the step said Range while the spotlight showed Course):
// the Show me's lead down a menu, level by level (src/ui/spotlight/leads.ts), and that every text that names a menu path names the real one. Pure, Node (the built game's
// clicks, level by level, in both builds: scripts/dev/spotlight-click-shots.mjs).
//  - the chain of a target (the control, its menu's levels from the nearest, the rail button) and what the spotlight lights of it, the breadcrumb, the rows to open;
//  - every lead walks the real menu (flyout-menu.ts menuOf, the same rows the flyouts draw): each level a row of that anchor and name, the entry at its end;
//  - every guide step, tutorial step, tip and hint that writes a menu path (Range › Place the practice area, Course › Facilities › Practice › Putting green) writes one the
//    menus have, and every Show me that has a lead lights the very path its words name;
//  - every quoted text in the game's source that writes such a path writes a real one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ANCHOR_FALLBACK, LEADS, RAIL_NAME, chainOf, crumbsOf, deepestOn, keysToReveal, type Lead } from '../src/ui/spotlight/leads';
import { RAIL } from '../src/ui/rail-items';
import { menuOf, type MenuCtx, type MenuRow } from '../src/ui/flyout-menu';
import { GUIDE, GUIDE_STUCK, RANGE_GUIDE, type GuideStep } from '../src/game/ext/progressive-ui/guide';
import { JAM_TOUR, TOWN_TOUR, tourStepFor } from '../src/game/ext/progressive-ui/tour';
import { FIRST_RUN_HINTS, JAM_HINT, PRACTICE_BUY_HINT, PRACTICE_HINTS, RAMP_TOAST, RANGE_HINTS, STUCK_HINT } from '../src/game/ext/progressive-ui';
import { JAM_TIPS } from '../src/ui/jam/tips';
import { BUILD_GROUPS } from '../src/ui/jam/build-menu';
import { guideSpot, tipSpot, tourSpot, type SpotHost } from '../src/ui/spotlight/shows';
import { practicePath } from '../src/game/golf/menu-path';

/** the game's lists as App.tsx's menuCtx fills them (a few of each; the range's rows as the engine's places and App name them) */
const CTX: MenuCtx = {
  golf: true, ui: null,
  roads: [{ id: 'gravel', name: 'Gravel', family: 'Small', why: null }, { id: 'street', name: 'Street', family: 'Small', why: null }],
  paths: [{ id: 'cart-walk', name: 'Walking path', family: 'Cart paths', why: null }, { id: 'drive-gravel', name: 'Gravel drive', family: 'Course drives', why: null }],
  junctions: [{ id: 'plain', name: 'Plain', why: null }], surfaces: [{ id: 'fairway', name: 'Fairway' }], cares: [{ id: 'mow', name: 'Mow' }],
  propGroups: [{ id: 'plants', name: 'Plants' }], materials: [{ id: 'preset:golf-green', name: 'Golf - Green', col: '#3a550b' }],
  plants: [{ id: 'trees', name: 'Trees', col: '#2a4' }],
  practice: [{ id: 'putting', name: 'Putting green', why: null }, { id: 'chipping', name: 'Chipping green and bunker', why: null }],
  newHoleWhy: null,
  range: [
    { id: 'range', name: 'Place the driving range', place: true, why: null }, { id: 'carpark', name: 'Place the car park', place: true, why: null }, { id: 'practice', name: 'Place the practice area', place: true, why: null },
    { id: 'card', name: 'Range card' }, { id: 'range-practice', name: 'Practice facilities' }, { id: 'range-upgrades', name: 'Upgrades' },
  ],
};
const menu = (item: string): MenuRow[] => menuOf(RAIL.find(r => r.id === item)!, CTX);
/** the anchor a flyout row carries (Flyouts.tsx: its own guide, else its tool's) */
const anchorOf = (r: MenuRow): string | undefined => r.guide ?? (r.leaf ? `tool-${r.leaf.entry.view?.group ?? r.leaf.entry.id}` : undefined);

test('the chain of a target: the control, the levels of its menu from the nearest, the rail button; a fallback chain where there is no lead', () => {
  assert.deepEqual(chainOf('practice-putting'), ['practice-putting', 'facilities-practice', 'rail-facilities', 'rail-course']);
  assert.deepEqual(chainOf('place-practice'), ['place-practice', 'rail-range']);
  assert.deepEqual(chainOf('new-hole'), ['new-hole', 'course-holes', 'rail-course']);
  assert.deepEqual(chainOf('tool-park'), ['tool-park', 'traffic-transport', 'rail-traffic']);
  assert.deepEqual(chainOf('traffic-build'), ['traffic-build', 'traffic-roads', 'rail-traffic']);
  assert.deepEqual(chainOf('land-buy'), ['land-buy', 'course-land', 'rail-course']);
  assert.deepEqual(chainOf('range-card'), ['range-card', 'rail-range']);
  assert.deepEqual(chainOf('rail-facilities'), ['rail-facilities', 'rail-course'], 'Facilities is a tile of the Course flyout: shut, Course');
  assert.deepEqual(chainOf('chip-skip'), ['chip-skip', 'season-chip'], 'no lead: its fallback, the control that opens its card');
  assert.deepEqual(chainOf('month'), ['month']);
  assert.deepEqual(chainOf('build-menu'), ['build-menu', 'rail-build'], "the jam's Build menu opens from the rail's Build button");
  // every anchor of every chain is its own control's: no chain lists the same anchor twice
  for (const id of [...Object.keys(LEADS), ...Object.keys(ANCHOR_FALLBACK)]) { const c = chainOf(id); assert.equal(new Set(c).size, c.length, id); assert.equal(c[0], id); }
  assert.equal(chainOf('practice-putting'), chainOf('practice-putting'), 'worked out once');
});

test('what the spotlight lights of a chain: the deepest level on screen, the target\'s own while grace lasts, none when nothing is on', () => {
  const chain = chainOf('practice-putting');
  const on = (...ids: string[]) => (a: string) => ids.includes(a);
  assert.equal(deepestOn(chain, on('rail-course'), true), 3, 'only the rail button: it is lit');
  assert.equal(deepestOn(chain, on('rail-course', 'rail-facilities'), true), 2, 'the Course flyout open: its Facilities tile');
  assert.equal(deepestOn(chain, on('rail-course', 'rail-facilities', 'facilities-practice'), true), 1, 'Facilities open: its Practice row');
  assert.equal(deepestOn(chain, on('rail-course', 'rail-facilities', 'facilities-practice', 'practice-putting'), true), 0, 'the Practice group open: the putting green itself');
  assert.equal(deepestOn(chain, on('practice-putting', 'rail-course'), true), 0, 'the entry on screen with the rail button: the entry');
  assert.equal(deepestOn(chain, on('rail-course'), false), -1, 'before grace only the target\'s own counts: the card or menu may be opening');
  assert.equal(deepestOn(chain, on('practice-putting'), false), 0);
  assert.equal(deepestOn(chain, on(), true), -1, 'nothing on screen');
  // the flyout closing again takes the lead back up a level
  assert.equal(deepestOn(chain, on('rail-course', 'rail-facilities'), true), 2);
  assert.equal(deepestOn(chainOf('month'), on('month'), false), 0);
});

test('the breadcrumb and the rows to open: the names along the way; one level opens the next', () => {
  assert.deepEqual(crumbsOf('practice-putting'), ['Course', 'Facilities', 'Practice', 'Putting green']);
  assert.deepEqual(crumbsOf('place-practice'), ['Range', 'Place the practice area']);
  assert.deepEqual(crumbsOf('traffic-build'), ['Traffic', 'Roads', 'Build']);
  assert.deepEqual(crumbsOf('land-buy'), ['Course', 'Land for sale', 'Buy']);
  assert.equal(crumbsOf('month'), null); assert.equal(crumbsOf('chip-skip'), null);
  // chain level k: 0 the entry, 1.. the levels from the nearest, n + 1 the rail button
  assert.deepEqual(keysToReveal('practice-putting', 3), [], 'the rail button lit: open the Course flyout');
  assert.deepEqual(keysToReveal('practice-putting', 2), ['facilities'], 'its Facilities tile lit: open it');
  assert.deepEqual(keysToReveal('practice-putting', 1), ['facilities', 'practice'], 'its Practice row lit: open it, the putting green shows');
  assert.equal(keysToReveal('practice-putting', 0), null, 'the entry itself is never pressed for the player');
  assert.deepEqual(keysToReveal('place-practice', 1), [], 'a flyout row of the first column: the flyout is all there is to open');
  assert.equal(keysToReveal('land-buy', 1), null, 'the Land for sale tile is a leaf that opens the land overlay, not a group: not pressed for the player');
  assert.deepEqual(keysToReveal('land-buy', 2), [], 'the rail button lit: open the flyout');
  assert.equal(keysToReveal('land-buy', 1), null); assert.equal(keysToReveal('month', 1), null);
});

test('every lead walks the real menu: each level a row of that anchor and name, the entry at its end, the rail button\'s name the rail\'s', () => {
  for (const [id, lead] of Object.entries(LEADS) as [string, Lead][]) {
    const item = RAIL.find(r => r.id === lead.item); assert.ok(item, `${id}: no rail item ${lead.item}`);
    assert.equal(RAIL_NAME[lead.item], item!.label, `${id}: the rail button's name`);
    let col = menu(lead.item);
    for (const st of lead.steps) {
      const row = st.key ? col.find(r => r.key === st.key) : col.find(r => anchorOf(r) === st.guide);
      assert.ok(row, `${id}: no row ${st.key ?? st.guide} (${st.label}) in ${col.map(r => r.label).join(', ')}`);
      assert.equal(anchorOf(row!), st.guide, `${id}: the row ${st.label} carries ${st.guide}`);
      assert.equal(row!.label, st.label, `${id}: the row's name`);
      if (st.key) { assert.ok(row!.children?.length, `${id}: ${st.label} opens a column`); col = row!.children!; } // (a leaf with no key is no group: nothing below it in the menu)
    }
    // the entry: a row of the last column that carries the anchor, with the lead's name (the card buttons and the Land panel's Buy are no menu rows: they are in leads.ts's
    // chain for the way back to them)
    const end = col.find(r => anchorOf(r) === id);
    if (end) assert.equal(end.label, lead.label, `${id}: the entry's name`);
    else assert.ok(/^land-buy$/.test(id), `${id}: not a row of ${col.map(r => r.label).join(', ')}`);
  }
});

test('every anchor the menus carry for the spotlight is in a lead (no row anchored for nothing), and the Range\'s placements are rows of the Range flyout', () => {
  const mine = new Set<string>();
  for (const l of Object.values(LEADS)) for (const s of l.steps) mine.add(s.guide);
  for (const id of Object.keys(LEADS)) mine.add(id);
  const seen = new Set<string>();
  const visit = (rows: readonly MenuRow[]) => { for (const r of rows) { if (r.guide) seen.add(r.guide); if (r.children) visit(r.children); } };
  for (const r of RAIL) visit(menu(r.id));
  for (const g of seen) assert.ok(mine.has(g) || /^class-/.test(g), `a row carries data-guide="${g}", which no lead uses`);
  assert.deepEqual(menu('range').filter(r => r.guide?.startsWith('place-')).map(r => [r.guide, r.label]), [['place-range', 'Place the driving range'], ['place-carpark', 'Place the car park'], ['place-practice', 'Place the practice area']]);
  // App.tsx and the engine name the placements as the fixture does
  assert.match(readFileSync('src/App.tsx', 'utf8'), /name: `Place \$\{q\.name\.replace\(\/\^The \/, 'the '\)\}`/);
  const eng = readFileSync('src/game/engine.ts', 'utf8');
  for (const n of ['The driving range', 'The car park', 'The practice area']) assert.ok(eng.includes(`name: '${n}'`), n);
});

// ---- the words: every menu path a text writes is a path the menus have
const RAIL_LABELS = ['Cart paths & roads', 'Town decoration', 'Traffic', 'Course', 'Range'];
const ARROW = /^ [›▸] /;
const labelsOf = (rows: readonly MenuRow[]) => rows.filter(r => !r.caption).map(r => ({ label: r.label, kids: r.children ?? [] }));
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const JAM_BUILD = [...BUILD_GROUPS.map(g => g.label), 'Tips'];
/** the menu paths a text writes (from a rail button's name, or the jam's Build, with an arrow after it) and where each stops being a real one (bad: the words after the last good name) */
function pathsIn(text: string): { segs: string[]; bad: string | null }[] {
  const out: { segs: string[]; bad: string | null }[] = [];
  const starts: { name: string; rows: () => { label: string; kids: readonly MenuRow[] }[] }[] = [
    ...RAIL_LABELS.map(name => ({ name, rows: () => labelsOf(menu(RAIL.find(r => r.label === name)!.id)) })),
    { name: 'Build', rows: () => JAM_BUILD.map(label => ({ label, kids: [] })) },
  ];
  for (const s of starts) {
    for (const m of text.matchAll(new RegExp(`(?<![›▸] )(?<![A-Za-z&])${escapeRe(s.name)}(?= [›▸] )`, 'g'))) {
      let rest = text.slice(m.index! + s.name.length), rows = s.rows(); const segs = [s.name]; let bad: string | null = null;
      while (ARROW.test(rest)) {
        rest = rest.replace(ARROW, '');
        const hit = rows.filter(r => rest.startsWith(r.label) && !/^[A-Za-z0-9]/.test(rest.slice(r.label.length))).sort((a, b) => b.label.length - a.label.length)[0];
        if (!hit) { bad = rest.slice(0, 36); break; }
        segs.push(hit.label); rest = rest.slice(hit.label.length); rows = labelsOf(hit.kids);
      }
      out.push({ segs, bad });
    }
  }
  return out;
}

test('pathsIn reads a path off a text, and finds where a wrong one goes wrong', () => {
  assert.deepEqual(pathsIn('Range › Place the driving range puts it in your hand'), [{ segs: ['Range', 'Place the driving range'], bad: null }]);
  assert.deepEqual(pathsIn(`Then build a putting green on it: ${practicePath('›')} › Putting green.`), [{ segs: ['Course', 'Facilities', 'Practice', 'Putting green'], bad: null }]);
  assert.deepEqual(pathsIn('(Cart paths & roads › Roads, or Traffic › Roads › Build) to give it new lots').map(p => p.segs.join(' › ')), ['Cart paths & roads › Roads', 'Traffic › Roads › Build'], 'two ways in one sentence');
  // the old texts' wrong paths are caught: Roads is a level of Traffic, Cart paths & drives of Cart paths & roads, and no rail button is called Range for the practice area's greens
  assert.equal(pathsIn('upgrading them (Traffic › Upgrade) is your job too')[0]!.bad, 'Upgrade) is your job too');
  assert.equal(pathsIn('Cart paths & roads › Walking path: from the car park')[0]!.bad, 'Walking path: from the car park');
  assert.deepEqual(pathsIn('Build ▸ Tips has hints'), [{ segs: ['Build', 'Tips'], bad: null }]);
  assert.deepEqual(pathsIn('Build one with the road tool to go on'), [], 'a sentence that starts with Build is no path');
});

/** every text a guide step says: its body, and the line of each half */
const stepTexts = (st: GuideStep): string[] => [st.body];
const host = (): SpotHost => ({ spotRangeBox: () => [1, 1, 5, 5], spotBallsBox: () => [1, 1, 5, 5], spotRingsBox: () => [1, 1, 5, 5] });

test('every guide step, tutorial step, tip and hint that writes a menu path writes one the menus have', () => {
  const texts: [string, string][] = [];
  for (const st of [...GUIDE, ...RANGE_GUIDE, GUIDE_STUCK, ...TOWN_TOUR, ...JAM_TOUR]) for (const t of stepTexts(st)) texts.push([st.id, t]);
  // the tutorial's steps as the game shows them: the road tool locked, an older save's bare start, the old town start
  for (const st of TOWN_TOUR) for (const f of [{ roadLock: 'Unlocks later', start: 'range' as const }, { roadLock: null, start: 'range' as const, rangePlaced: false }, { roadLock: null, start: 'town' as const }]) texts.push([`${st.id} as ${JSON.stringify(f)}`, tourStepFor(st, f).body]);
  for (const t of JAM_TIPS) texts.push([t.id, t.body]);
  for (const h of [...FIRST_RUN_HINTS, ...PRACTICE_HINTS, PRACTICE_BUY_HINT, STUCK_HINT, JAM_HINT, ...Object.values(RANGE_HINTS)]) texts.push([h.id, h.body]);
  for (const [k, t] of Object.entries(RAMP_TOAST)) texts.push([`toast ${k}`, t]);
  let n = 0;
  for (const [id, text] of texts) for (const p of pathsIn(text)) { n++; assert.equal(p.bad, null, `${id}: "${p.segs.join(' › ')}" goes wrong at "${p.bad}"`); }
  assert.ok(n >= 12, `only ${n} paths found: the reader is broken`);
});

test('every Show me that has a lead lights the very path its words name', () => {
  // (a step's words may name more paths than the one lit: the tutorial's road step names two ways; the lit one is one of them, or the way to the card the words name)
  const check = (id: string, text: string, target: string | null | undefined) => {
    const crumbs = target ? crumbsOf(target) : null; if (!crumbs) return;
    const paths = pathsIn(text).map(p => p.segs);
    assert.ok(paths.some(p => p.every((s, i) => s === crumbs[i])), `${id}: its Show me lights ${crumbs.join(' › ')}, its words name ${paths.map(p => p.join(' › ')).join(' | ') || 'no path'}`);
  };
  for (const st of RANGE_GUIDE) check(st.id, st.body, st.target.ui);
  for (const st of TOWN_TOUR) check(st.id, st.body, st.target.ui);
  // the bare start's step 4 lights the Range placement its words name
  const bare = tourStepFor(TOWN_TOUR[3]!, { roadLock: null, start: 'range', rangePlaced: false }); check('tour-golf (bare)', bare.body, bare.target.ui);
  // the steps of the guide: the entry at the end of the menu path its words name, and its first sentence
  assert.deepEqual(guideSpot(RANGE_GUIDE[1]!, host())!.targets, [{ pulse: 'place-carpark' }]); assert.match(guideSpot(RANGE_GUIDE[1]!, host())!.line, /^Range › Place the car park/);
  assert.deepEqual(guideSpot(RANGE_GUIDE[2]!, host())!.targets, [{ pulse: 'rail-walk' }]);
  assert.equal(guideSpot(RANGE_GUIDE[0]!, host())!.line, 'Your land is bare: only your trailer.');
  assert.deepEqual(guideSpot(RANGE_GUIDE[0]!, host())!.targets, [{ pulse: 'place-range' }]);
  // the jam's tutorial and tips light what their words say (no flyouts there: the Build menu opens from the rail's Build button)
  assert.deepEqual(tourSpot(JAM_TOUR[2]!, host(), true)!.targets, [{ ui: 'rail-build' }]);
  assert.deepEqual(tipSpot(JAM_TIPS.find(t => t.show === 'build')!, host())!.targets, [{ ui: 'build-menu' }]);
});

// ---- every quoted text in the game's source that writes a menu path
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) sourceFiles(p, out); else if (/\.(ts|tsx)$/.test(p)) out.push(p); }
  return out;
}
/** the quoted strings of a source line, outside comments (a // or a block comment's line is skipped): the text of each, a template's ${...} left as it is */
function literals(src: string): string[] {
  const line = src.replace(/\/\*.*?\*\//g, ''), t = line.trim(); if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return []; // (a block comment on the line, as JSX has them, is no text)
  const out: string[] = []; let i = 0;
  while (i < line.length) {
    const c = line[i]!;
    if (c === '/' && line[i + 1] === '/') break;
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1; while (j < line.length && line[j] !== c) { if (line[j] === '\\') j++; j++; }
      out.push(line.slice(i + 1, j)); i = j + 1; continue;
    }
    i++;
  }
  return out;
}
test('every quoted text in the game that writes a menu path writes a real one', () => {
  let n = 0; const bad: string[] = [];
  for (const f of sourceFiles('src')) {
    if (/spotlight[\\/]|dev[\\/]/.test(f)) continue;
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      for (const lit of literals(line)) {
        if (!/[›▸]/.test(lit)) continue;
        // (a template's practicePath() as the normal game writes it)
        const text = lit.replace(/\$\{practicePath\(\)\}/g, practicePath()).replace(/\$\{practicePath\('›'\)\}/g, practicePath('›')).replace(/\$\{practicePath\('▸'\)\}/g, practicePath('▸'));
        for (const p of pathsIn(text)) { n++; if (p.bad !== null) bad.push(`${f}:${i + 1}: "${p.segs.join(' › ')}" goes wrong at "${p.bad}"`); }
      }
    });
  }
  assert.deepEqual(bad, []);
  assert.ok(n >= 5, `only ${n} paths found in the source: the scan is broken`);
});

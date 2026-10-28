// T193 (#502; the owner: "i want sub menus. the menus can open all more to the side with more levels. stop putthing everythig in one col"): the
// toolbar's flyouts. Every tool is reachable by a flyout path (Traffic ▸ Roads ▸ Build ▸ Street ...); locked rows stay in place with their
// reason; the keyboard walks the flyouts and Esc closes them; old saves' unlocks (the tools' ids) and NEW badges hold; the rows render as menus
// whose columns never scroll sideways. Headless (react-dom/server for the markup). The sizes and UI scales are checked in the browser by
// scripts/dev/ui-overflow.mjs (npm run ui:overflow).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { advanceProgress, computeProgressiveUiState, emptyProgress, progressFacts, type CourseProgress, type GolfProgress } from '../src/game/ext/progressive-ui';
import { RAIL, entryKey, toolLock, toolsIn } from '../src/ui/rail-items';
import { columnsOf, indicesOf, leavesOf, menuOf, navKey, type MenuCtx, type MenuRow, type NavState } from '../src/ui/flyout-menu';
import { Flyouts, columnWidths, isTileGrid } from '../src/ui/Flyouts';
import { TOOL_TILES, type ToolTile } from '../src/ui/tool-tiles';
import { GREENKEEPING } from '../src/game/features';

const course = (holes: number): CourseProgress => ({ holes, seasons: 0, invited: false });
const uiOf = (p: GolfProgress, holes: number) => computeProgressiveUiState(progressFacts(p, course(holes)));
function played(holes: number, opened: string[] = []): GolfProgress {
  const p = emptyProgress();
  advanceProgress(p, progressFacts(p, course(holes)), null);
  for (const t of opened) advanceProgress(p, progressFacts(p, course(holes)), t);
  return p;
}
/** the game's lists, as App.tsx's menuCtx fills them (a few of each) */
const ctx = (golf: boolean, ui: MenuCtx['ui'], o: Partial<MenuCtx> = {}): MenuCtx => ({
  golf, ui,
  roads: [{ id: 'gravel', name: 'Gravel', family: 'Small', why: null }, { id: 'street', name: 'Street', family: 'Small', why: null }, { id: 'avenue', name: 'Avenue', family: 'Medium', why: 'Avenue: unlocks at 2,000 residents' }],
  paths: [{ id: 'cart-walk', name: 'Walking path', family: 'Cart paths', why: null }, { id: 'drive-gravel', name: 'Gravel drive', family: 'Course drives', why: null }],
  junctions: [{ id: 'plain', name: 'Plain', why: null }, { id: 'stop', name: 'All-way stop', why: null }, { id: 'roundabout', name: 'Roundabout', why: 'Unlocks at 5,000 residents' }],
  surfaces: [{ id: 'fairway', name: 'Fairway' }, { id: 'green', name: 'Green' }, { id: 'waste', name: 'Waste area' }],
  cares: [{ id: 'mow', name: 'Mow' }, { id: 'water', name: 'Water' }],
  propGroups: [{ id: 'plants', name: 'Plants' }, { id: 'water', name: 'Water' }],
  materials: [{ id: 'preset:golf-green', name: 'Golf - Green', col: '#3a550b' }],
  plants: [{ id: 'trees', name: 'Trees', col: '#2a4' }, { id: 'bushes', name: 'Bushes', col: '#3b5' }, { id: 'flowers', name: 'Flowers', col: '#c5a' }],
  practice: [{ id: 'putting', name: 'Putting green', why: null }, { id: 'chipping', name: 'Chipping green and bunker', why: null }],
  newHoleWhy: null,
  range: [{ id: 'card', name: 'Range card' }, { id: 'range-practice', name: 'Practice facilities' }],
  ...o,
});
const labels = (rows: readonly MenuRow[]) => rows.map(r => r.label);
const find = (rows: readonly MenuRow[], ...path: string[]): MenuRow => { let col: readonly MenuRow[] = rows, r: MenuRow | undefined; for (const l of path) { r = col.find(x => x.label === l); assert.ok(r, `${path.join(' ▸ ')}: ${l}`); col = r!.children ?? []; } return r!; };
const ALL = ctx(true, null);

describe('the flyouts: sub-menus to the side, as many levels as the tools have (T193)', () => {
  it('Traffic ▸ Roads ▸ Build ▸ the road classes · Upgrade · Downgrade; Junctions ▸ the junctions; Transport ▸ Bus route · Car park · Toll gate', () => {
    const t = menuOf(RAIL.find(r => r.id === 'traffic')!, ALL);
    assert.deepEqual(labels(t), ['Roads', 'Junctions', 'Transport']);
    assert.deepEqual(labels(find(t, 'Roads').children!), ['Build', 'Upgrade', 'Downgrade']);
    const build = find(t, 'Roads', 'Build').children!;
    assert.deepEqual(build.map(r => (r.caption ? `[${r.label}]` : r.label)), ['[Small]', 'Gravel', 'Street', '[Medium]', 'Avenue'], 'the classes under their families');
    const street = find(t, 'Roads', 'Build', 'Street');
    assert.deepEqual(street.leaf, { item: 'traffic', entry: RAIL.find(r => r.id === 'traffic')!.tools[0], act: { k: 'road', id: 'street' } });
    assert.deepEqual(labels(find(t, 'Junctions').children!), ['Select a junction', 'Plain', 'All-way stop', 'Roundabout']);
    assert.deepEqual(labels(find(t, 'Transport').children!), ['Bus route', 'Car park', 'Toll gate']);
  });
  it('Course ▸ Holes ▸ New hole · Your holes · Shape by hand ▸ the surfaces; Buildings ▸ Clubhouse · Halfway house; Cart paths & roads ▸ the paths and drives; Greenkeeping ▸ the cares (while GREENKEEPING is on); Tournament', () => {
    const c = menuOf(RAIL.find(r => r.id === 'course')!, ALL);
    assert.deepEqual(labels(c), GREENKEEPING ? ['Holes', 'Buildings', 'Cart paths & roads', 'Greenkeeping', 'Tournament', 'Land for sale'] : ['Holes', 'Buildings', 'Cart paths & roads', 'Tournament', 'Land for sale'], 'T206: Cart paths & roads directly below Buildings; no Greenkeeping group while it is hidden (features.ts)');
    assert.deepEqual(find(c, 'Cart paths & roads').children!.map(r => (r.caption ? `[${r.label}]` : r.label)), ['[Cart paths]', 'Walking path', '[Course drives]', 'Gravel drive']);
    assert.equal(find(c, 'Cart paths & roads').note, 'Roads and cart paths on your property', 'its tooltip (the owner: "these are roads for on you property")');
    assert.deepEqual(find(c, 'Cart paths & roads', 'Walking path').leaf?.act, { k: 'road', id: 'cart-walk' });
    assert.deepEqual(find(c, 'Land for sale').leaf?.act, { k: 'land' }, 'T200: the land for sale');
    assert.deepEqual(labels(find(c, 'Holes').children!), ['New hole', 'Your holes', 'Shape by hand']);
    assert.deepEqual(labels(find(c, 'Holes', 'Shape by hand').children!), ['Fairway', 'Green', 'Waste area']);
    assert.deepEqual(find(c, 'Holes', 'Shape by hand', 'Green').leaf?.act, { k: 'surface', id: 'green' });
    assert.deepEqual(find(c, 'Holes', 'Shape by hand', 'Waste area').leaf?.act, { k: 'surface', id: 'waste' }, 'T222: the Waste area brush');
    assert.equal(find(c, 'Holes', 'Shape by hand', 'Waste area').mark, 'waste', 'its pebbles mark');
    assert.deepEqual(labels(find(c, 'Buildings').children!), ['Clubhouse', 'Halfway house']);
    if (GREENKEEPING) assert.deepEqual(labels(find(c, 'Greenkeeping').children!), ['Grass care', 'Mow', 'Water']);
    assert.deepEqual(find(c, 'Tournament').leaf?.act, { k: 'event' });
  });
  it('Facilities ▸ Practice ▸ the facilities · Plants ▸ Trees, Bushes, Flowers · Decoration ▸ Props ▸ by group (T206); Town decoration ▸ Paint ▸ Areas ▸ the materials, Plants ▸ ... · Props ▸ · Buildings', () => {
    const d = menuOf(RAIL.find(r => r.id === 'facilities')!, ALL), td = menuOf(RAIL.find(r => r.id === 'towndecor')!, ALL);
    assert.deepEqual(labels(d), ['Practice', 'Plants', 'Decoration']);
    assert.deepEqual(labels(find(d, 'Practice').children!), ['Putting green', 'Chipping green and bunker']);
    assert.deepEqual(find(d, 'Practice', 'Putting green').leaf?.act, { k: 'practice', id: 'putting' });
    assert.equal(find(d, 'Practice', 'Putting green').leaf?.entry.id, 'practice', 'its own building tool, not the hole brushes');
    assert.deepEqual(labels(find(d, 'Plants').children!), ['Trees', 'Bushes', 'Flowers'], 'the plant brush, reachable from the course side');
    assert.deepEqual(find(d, 'Plants', 'Trees').leaf, { item: 'facilities', entry: RAIL.find(r => r.id === 'facilities')!.tools[1], act: { k: 'plant', id: 'trees' } });
    assert.deepEqual(labels(find(d, 'Decoration').children!), ['Props']);
    assert.deepEqual(labels(find(d, 'Decoration', 'Props').children!), ['All props', 'Plants', 'Water']);
    assert.deepEqual(find(d, 'Decoration', 'Props', 'Plants').leaf?.entry.view, { where: 'course' });
    assert.ok(!leavesOf(d).some(l => l.row.leaf!.entry.id === 'path'), 'Decoration keeps no Paths');
    // not a range start: Practice locked in place with why
    const nr = menuOf(RAIL.find(r => r.id === 'facilities')!, ctx(true, null, { practice: [{ id: 'putting', name: 'Putting green', why: 'Comes with a driving range' }, { id: 'chipping', name: 'Chipping green and bunker', why: 'Comes with a driving range' }] }));
    assert.equal(find(nr, 'Practice').why, 'Comes with a driving range');
    assert.deepEqual(labels(td), ['Paint', 'Props', 'Buildings']);
    assert.deepEqual(labels(find(td, 'Paint').children!), ['Areas', 'Plants', 'Pick an area', 'Erase areas']);
    assert.equal(find(td, 'Paint', 'Areas', 'Golf - Green').swatch, '#3a550b');
    assert.deepEqual(find(td, 'Props', 'Water').leaf?.entry.view, { where: 'town' });
    assert.deepEqual(find(td, 'Buildings').leaf?.entry.view, { where: 'town', group: 'buildings' });
    // the classic town game: no golf props; its Business tool under Town decoration
    assert.deepEqual(labels(menuOf(RAIL.find(r => r.id === 'towndecor')!, ctx(false, null))), ['Paint', 'Buildings']);
  });
  it('the Driving range ▸ the range card and its sections; Select and Bulldoze have no flyout (a click picks them)', () => {
    assert.deepEqual(labels(menuOf(RAIL.find(r => r.id === 'range')!, ALL)), ['Range card', 'Practice facilities']);
    assert.deepEqual(menuOf(RAIL.find(r => r.id === 'range')!, ALL).map(r => r.leaf?.act), [{ k: 'range', section: null }, { k: 'range', section: 'range-practice' }]);
    for (const id of ['select', 'bulldoze']) assert.deepEqual(menuOf(RAIL.find(r => r.id === id)!, ALL), [], id);
  });
  it('every tool of every group is reachable by a flyout path, golf and classic (the Props tool from both decorations, by its view)', () => {
    for (const golf of [true, false]) for (const r of RAIL) {
      if (r.only && r.only !== (golf ? 'golf' : 'classic')) continue;
      const rows = menuOf(r, ctx(golf, null)), leaves = leavesOf(rows);
      if (!rows.length) { assert.ok(['select', 'bulldoze'].includes(r.id), `${r.id} has a flyout`); continue; }
      if (r.action) continue;
      for (const t of toolsIn(r, golf)) assert.ok(leaves.some(l => entryKey(l.row.leaf!.entry) === entryKey(t)), `${golf ? 'golf' : 'classic'} ${r.id}: ${entryKey(t)} reachable`);
      // a leaf's path opens again from its keys (the tool panel's back arrow)
      for (const l of leaves) { const ix = indicesOf(rows, l.path); assert.equal(ix.length, l.path.length); assert.equal(columnsOf(rows, ix.slice(0, -1)).length, l.path.length); }
    }
  });
});

describe('locks and NEW inside the flyouts; old saves (T193)', () => {
  it('stage 1: a locked tool\'s rows stay in place, dimmed, with its lock\'s reason; a group whose rows are all locked carries it too', () => {
    const ui = uiOf(played(0), 0);
    let locked = 0;
    for (const r of RAIL) {
      const rows = menuOf(r, ctx(true, ui));
      for (const l of leavesOf(rows)) {
        const why = toolLock(ui, l.row.leaf!.entry.id);
        if (why) { assert.equal(l.row.why, why, `${r.id} ${l.row.label}: its lock's reason`); locked++; }
      }
      for (const g of rows.filter(x => x.children)) { const kids = g.children!.filter(k => !k.caption); if (kids.every(k => k.why)) assert.ok(g.why, `${r.id} ${g.label}: locked with its rows`); }
    }
    assert.ok(locked > 0, 'stage 1 has locked tools');
    // a class or a junction not open yet carries its own reason
    const t = menuOf(RAIL.find(r => r.id === 'traffic')!, ALL);
    assert.equal(find(t, 'Roads', 'Build', 'Avenue').why, 'Avenue: unlocks at 2,000 residents');
    assert.equal(find(t, 'Junctions', 'Roundabout').why, 'Unlocks at 5,000 residents');
    assert.equal(find(t, 'Junctions', 'Plain').why, null);
  });
  it('NEW rows keep their badge; an old save\'s seen ids (the tools\') open what they opened: the leaves pick the same tool ids', () => {
    const ui = uiOf(played(1), 1), news = (ui.newTools as string[]);
    for (const r of RAIL) for (const l of leavesOf(menuOf(r, ctx(true, ui)))) assert.equal(!!l.row.isNew, news.includes(l.row.leaf!.entry.id), `${r.id} ${l.row.label}`);
    const ids = new Set(RAIL.flatMap(r => r.tools.map(t => t.id)));
    for (const r of RAIL) for (const l of leavesOf(menuOf(r, ALL))) assert.ok(ids.has(l.row.leaf!.entry.id), l.row.label);
  });
});

describe('the keyboard walks the flyouts; Esc closes them (T193)', () => {
  const rows = menuOf(RAIL.find(r => r.id === 'traffic')!, ALL);
  const go = (s: NavState, ...keys: string[]) => { let o = { state: s } as ReturnType<typeof navKey>; for (const k of keys) { o = navKey(rows, o.state, k); if (o.pick || o.close) break; } return o; };
  it('Down moves in a column, Right or Enter opens a row and goes in, Left goes back, Enter on a leaf picks it, Esc closes', () => {
    const s0: NavState = { path: [], focus: { level: 0, index: 0 } };
    assert.deepEqual(go(s0, 'ArrowDown').state.focus, { level: 0, index: 1 });
    assert.deepEqual(go(s0, 'ArrowUp').state.focus, { level: 0, index: 2 }, 'Up from the first wraps to the last');
    const inRoads = go(s0, 'ArrowRight');
    assert.deepEqual(inRoads.state, { path: [0], focus: { level: 1, index: 0 } });
    const inBuild = go(s0, 'Enter', 'Enter');
    assert.deepEqual(inBuild.state, { path: [0, 0], focus: { level: 2, index: 1 } }, 'past the Small caption to Gravel');
    const street = go(s0, 'Enter', 'Enter', 'ArrowDown', 'Enter');
    assert.equal(street.pick?.label, 'Street'); assert.equal(street.close, true);
    assert.deepEqual(go(s0, 'Enter', 'Enter', 'ArrowLeft').state, { path: [0], focus: { level: 1, index: 0 } }, 'Left: back to Build in Roads');
    assert.equal(go(s0, 'ArrowLeft').close, true, 'Left on the first column closes');
    assert.equal(go(s0, 'Enter', 'Escape').close, true, 'Esc closes');
    // a locked leaf tells why and picks nothing
    const toRound = go(s0, 'ArrowDown', 'Enter', 'End', 'Enter');
    assert.equal(toRound.locked?.label, 'Roundabout'); assert.equal(toRound.pick, undefined);
    assert.equal(navKey(rows, s0, 'x').handled, false, 'other keys go on to the game');
  });
});

describe('the flyouts as drawn (T193)', () => {
  it('menus of menu items: a row with children says so, a locked row shows its reason, its columns never scroll sideways', () => {
    const rows = menuOf(RAIL.find(r => r.id === 'traffic')!, ALL);
    const html = renderToStaticMarkup(createElement(Flyouts, { rows, top: 100, left: 110, startPath: [1], onLeaf: () => {}, onLocked: () => {}, onClose: () => {} }));
    assert.equal((html.match(/role="menu"/g) ?? []).length, 2, 'Traffic and Junctions open');
    assert.match(html, /aria-haspopup="menu"[^>]*aria-expanded="true"/);
    assert.match(html, /flyout-row-locked[\s\S]*?Roundabout[\s\S]*?flyout-why">Unlocks at 5,000 residents/);
    assert.match(html, /data-guide="tool-junction"/);
    const css = readFileSync('src/index.css', 'utf8');
    assert.match(css, /\.flyout \{[^}]*overflow-y: auto; overflow-x: hidden;/);
    assert.match(css, /\.flyout-row \{[^}]*white-space: normal; overflow-wrap: anywhere;/);
    assert.match(readFileSync('src/App.tsx', 'utf8'), /tool-panel[^"]*overflow-y-auto overflow-x-hidden/);
  });
});

// T233 (#674, the owner 2026-10-27 showing the concept: "this is the look and feel we need to get to"): the Course flyout's and the Facilities
// tools as the concept's illustrated tiles (art 174), a grid of tiles per level; a tool with no tile keeps its icon
describe('the tool tiles (T233)', () => {
  const tiles = (rows: readonly MenuRow[]) => rows.filter(r => !r.caption).map(r => `${r.label}${r.tile ? `=${r.tile}` : ''}`);
  const C = ctx(true, null, { surfaces: [{ id: 'fairway', name: 'Fairway' }, { id: 'green', name: 'Green' }, { id: 'tee', name: 'Tee' }, { id: 'rough', name: 'Rough' }, { id: 'bunker', name: 'Bunker' }, { id: 'water', name: 'Water' }, { id: 'waste', name: 'Waste area' }, { id: 'path', name: 'Cart path' }, { id: 'longGrass', name: 'Long grass' }], propGroups: [{ id: 'plants', name: 'Plants' }, { id: 'water', name: 'Water' }, { id: 'stone', name: 'Stone' }, { id: 'furniture', name: 'Furniture' }] });
  const courseRows = menuOf(RAIL.find(r => r.id === 'course')!, C), fac = menuOf(RAIL.find(r => r.id === 'facilities')!, C);
  it('Course: Holes, Buildings, Cart paths & roads; New hole and Shape by hand; the surfaces (the Waste area keeps its mark); the Clubhouse', () => {
    assert.deepEqual(tiles(courseRows), ['Holes=green', 'Buildings=clubhouse', 'Cart paths & roads=cart-path', 'Tournament', 'Land for sale']);
    assert.deepEqual(tiles(find(courseRows, 'Holes').children!), ['New hole=tee', 'Your holes', 'Shape by hand=fairway']);
    assert.deepEqual(tiles(find(courseRows, 'Holes', 'Shape by hand').children!), ['Fairway=fairway', 'Green=green', 'Tee=tee', 'Rough=rough', 'Bunker=bunker', 'Water=pond', 'Waste area', 'Cart path=cart-path', 'Long grass=rough']); // T238: Long grass wears the rough's tile
    assert.equal(find(courseRows, 'Holes', 'Shape by hand', 'Waste area').mark, 'waste', 'no tile: its pebbles mark');
    assert.deepEqual(tiles(find(courseRows, 'Buildings').children!), ['Clubhouse=clubhouse', 'Halfway house']);
    assert.deepEqual(tiles(find(courseRows, 'Cart paths & roads').children!), ['Walking path', 'Gravel drive'], 'the classes stay a list under their families');
    assert.equal(find(courseRows, 'Cart paths & roads').note, 'Roads and cart paths on your property', 'its tooltip kept');
  });
  it("Facilities: Practice and its greens, Plants and its Trees and Flowers, Decoration and its Props' Stone (the rocks), Water and Plants", () => {
    assert.deepEqual(tiles(fac), ['Practice=range-bays', 'Plants=trees', 'Decoration=rocks']);
    assert.deepEqual(tiles(find(fac, 'Practice').children!), ['Putting green=green', 'Chipping green and bunker=bunker']);
    assert.deepEqual(tiles(find(fac, 'Plants').children!), ['Trees=trees', 'Bushes', 'Flowers=flower-bed']);
    assert.equal(find(fac, 'Plants', 'Bushes').swatch, '#3b5', 'no tile: its swatch');
    assert.deepEqual(tiles(find(fac, 'Decoration').children!), ['Props']);
    assert.deepEqual(tiles(find(fac, 'Decoration', 'Props').children!), ['All props', 'Plants=flower-bed', 'Water=pond', 'Stone=rocks', 'Furniture']);
  });
  it("the town's menus and the range card stay lists; the tiles change no leaf, lock or path", () => {
    const all = (rs: readonly MenuRow[]): MenuRow[] => rs.flatMap(r => [r, ...all(r.children ?? [])]);
    for (const id of ['select', 'range', 'traffic', 'towndecor', 'bulldoze']) assert.ok(!all(menuOf(RAIL.find(r => r.id === id)!, C)).some(r => r.tile), `${id}: no tiles`);
    const ui = uiOf(played(0), 0);
    for (const id of ['course', 'facilities']) {
      const rows = menuOf(RAIL.find(r => r.id === id)!, ctx(true, ui));
      for (const l of leavesOf(rows)) {
        const why = toolLock(ui, l.row.leaf!.entry.id); if (why) assert.equal(l.row.why, why, `${id} ${l.row.label}: its lock`);
        assert.equal(indicesOf(rows, l.path).length, l.path.length, `${id} ${l.row.label}: its path opens`);
      }
    }
  });
  it('all twelve tiles of art 174 are used, each a small WebP in src/assets/ui/tiles', () => {
    const used = new Set<ToolTile>(), walk = (rs: readonly MenuRow[]) => { for (const r of rs) { if (r.tile) used.add(r.tile); walk(r.children ?? []); } };
    walk(courseRows); walk(fac);
    assert.deepEqual([...TOOL_TILES].sort(), [...used].sort(), 'every tile on a tool, and no tile that is not one');
    for (const t of TOOL_TILES) { const f = `src/assets/ui/tiles/${t}.webp`; assert.ok(existsSync(f), f); assert.ok(statSync(f).size < 12_000, `${f}: small`); }
  });
  it('drawn: a level with a tile is a grid of tiles (the picture above the name, the more and lock marks on it); a level without stays a list', () => {
    const draw = (rows: MenuRow[], startPath: number[]) => renderToStaticMarkup(createElement(Flyouts, { rows, top: 100, left: 110, startPath, onLeaf: () => {}, onLocked: () => {}, onClose: () => {} }));
    const html = draw(courseRows, indicesOf(courseRows, ['holes', 'shape']));
    assert.equal((html.match(/class="flyout glass flyout-grid"/g) ?? []).length, 3, 'Course, Holes and Shape by hand: three grids');
    assert.match(html, /data-tile="clubhouse"[^>]*class="flyout-row flyout-tile[^"]*"[^>]*>[\s\S]*?<span class="flyout-pic[^"]*">[\s\S]*?flyout-pic-more[\s\S]*?<span class="flyout-label">Buildings<\/span>/, 'Buildings: its tile, its more mark, its name under it');
    assert.match(html, /flyout-pic flyout-pic-icon"><svg[^>]*>[\s\S]*?<\/svg><\/span><span class="flyout-label">Waste area</, 'the Waste area: its mark on the navy square');
    assert.match(html, /flyout-pic flyout-pic-icon"><img[^>]*><\/span><span class="flyout-label">Tournament</, 'an untiled row in a grid: its icon on the square');
    // locked: dimmed, its lock on the picture and its reason under the name (and whole in the tooltip)
    const locked = menuOf(RAIL.find(r => r.id === 'facilities')!, ctx(true, null, { practice: [{ id: 'putting', name: 'Putting green', why: 'Comes with a driving range' }] }));
    assert.match(draw(locked, []), /data-tip="Practice: Comes with a driving range"[^>]*aria-disabled="true" class="flyout-row flyout-tile[^"]*flyout-row-locked"[\s\S]*?flyout-pic-lock[\s\S]*?flyout-why">Comes with a driving range</);
    // the path classes: a list beside the Course grid
    const paths = draw(courseRows, indicesOf(courseRows, ['paths']));
    assert.equal((paths.match(/flyout-grid/g) ?? []).length, 1, 'the Course level is a grid, Cart paths & roads a list');
    assert.match(paths, /class="flyout glass "[^>]*>[\s\S]*?flyout-caption" role="presentation">Cart paths</);
  });
  it('never sideways: a grid column is wider than a list, all narrow alike to fit the room, never under the narrowest; the grid shrinks its cells', () => {
    const grid: MenuRow[] = [{ key: 'a', label: 'A', tile: 'tee' }], list: MenuRow[] = [{ key: 'b', label: 'B' }];
    assert.equal(isTileGrid(grid), true); assert.equal(isTileGrid(list), false);
    assert.deepEqual(columnWidths([list, list], 2000), [232, 232]);
    assert.deepEqual(columnWidths([grid, grid, list], 2000), [280, 280, 232]);
    const w = columnWidths([grid, grid, grid], 700);
    assert.ok(w.every(x => x >= 184 && x < 280), `narrowed: ${w}`); assert.ok(w.reduce((a, b) => a + b, 0) + 18 <= 700, 'they fit');
    assert.deepEqual(columnWidths([grid, grid, grid, grid], 300), [184, 184, 184, 184], 'never under the narrowest (a grid of two)');
    assert.match(readFileSync('src/index.css', 'utf8'), /\.flyout-grid \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(78px, 1fr\)\);/);
    assert.ok(2 * 78 + 6 + 12 + 2 <= 184, 'two tiles fit the narrowest column');
  });
});

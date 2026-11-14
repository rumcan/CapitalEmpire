// J8 (#1261; the owner, 2026-11-14: "add ALOT more images to the UI. especially on stuff you can do"): the action tiles. Every tile id the UI names
// has its picture in src/assets/ui/tiles (a typo, or a tile the cutter never made, would ship a broken image), every table of tiles names only tiles
// that exist, and each picture is a small 144 px WebP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as T from '../src/ui/tool-tiles';
import { ACTION_TILES, PROP_TILES, SOUND_TILES, TOOL_TILES } from '../src/ui/tool-tiles';
import { GUIDE, GUIDE_STUCK, RANGE_GUIDE } from '../src/game/ext/progressive-ui/guide';
import { JAM_TOUR, TOWN_TOUR } from '../src/game/ext/progressive-ui/tour';
import { BRANCH_NAME, RANGE_UPGRADES } from '../src/game/golf/rangesave';
import { RAIL } from '../src/ui/rail-items';
import { menuOf, type MenuCtx, type MenuRow } from '../src/ui/flyout-menu';
import { propMenuLists } from '../src/game/golf/decor';

const DIR = 'src/assets/ui/tiles', ALL = new Set<string>([...TOOL_TILES, ...ACTION_TILES, ...PROP_TILES]);

/** the tiles cut but worn by nothing yet: each commit that places one takes it off this list (J13, #1277). the props tiles that no menu row wears wait for #1284's natural / man-made restructure of the Props menu (another coder's) and the Texture
 *  Painter's button (#1282's rename) */
const NOT_YET: readonly string[] = [
  'natural-props', 'fences', 'signs', 'fountain', 'texture-painter', 'clear-plants', 'nursery-plants',
  'walking-path', // (#1297, the owner, 2026-11-14: the guide's Lay a walking path step went: its tile, the step's only wearer, waits for another use)
];

test('every tile id has its WebP, a small 144 px picture, and no picture lacks an id', async () => {
  assert.equal(ACTION_TILES.length, 120);
  assert.equal(PROP_TILES.length, 12);
  const sharp = (await import(['sharp'][0]!)).default;
  for (const id of ALL) {
    const f = `${DIR}/${id}.webp`; assert.ok(existsSync(f), `${f}: missing`);
    assert.ok(statSync(f).size < 12_000, `${f}: small`);
    const m = await sharp(f).metadata();
    assert.deepEqual([m.format, m.width, m.height], ['webp', 144, 144], f);
  }
  assert.deepEqual(readdirSync(DIR).filter(f => f.endsWith('.webp')).map(f => f.replace(/\.webp$/, '')).sort(), [...ALL].sort(), 'a picture for every id and an id for every picture');
});

test('every table of tiles names only tiles that exist', () => {
  const tables = Object.entries(T).filter(([k, v]) => /_TILE$/.test(k) && v && typeof v === 'object' && !Array.isArray(v));
  assert.ok(tables.length >= 8, 'the scan finds the tables');
  for (const [name, table] of tables) for (const [key, id] of Object.entries(table as Record<string, string>)) assert.ok(ALL.has(id), `${name}.${key}: no tile "${id}"`);
});

test('every range upgrade has a tile that exists, and so has each branch of the ball room tree (J13, #1277)', () => {
  assert.ok(RANGE_UPGRADES.length >= 50, `the upgrade list (${RANGE_UPGRADES.length})`);
  for (const u of RANGE_UPGRADES) {
    const id = T.RANGE_UPGRADE_TILE[u.id];
    assert.ok(id && ALL.has(id), `${u.id} (${u.name}): no tile (a new upgrade needs one in RANGE_UPGRADE_TILE, tool-tiles.ts)`);
    assert.ok(existsSync(`${DIR}/${id}.webp`), `${u.id}: ${id}.webp is missing`);
  }
  // (the table names no upgrade that does not exist)
  const ids = new Set<string>(RANGE_UPGRADES.map(u => u.id));
  for (const k of Object.keys(T.RANGE_UPGRADE_TILE)) assert.ok(ids.has(k), `RANGE_UPGRADE_TILE.${k}: there is no such upgrade`);
  for (const b of Object.keys(BRANCH_NAME)) assert.ok(T.BRANCH_TILE[b] && ALL.has(T.BRANCH_TILE[b]!), `branch ${b}: no tile`);
  assert.equal(T.BRANCH_TILE.supply, 'supplier', 'Supply wears the supplier, not the bucket price');
  // the picture is on the tree's rows and open card, the Range card's rows, its till line and its home
  const tree = readFileSync('src/ui/golf/BallTree.tsx', 'utf8'), card = readFileSync('src/ui/golf/RangeCard.tsx', 'utf8');
  assert.match(tree, /tile=\{nodeTile\(n\.id, branch\)\} size=\{TILE_ROW\}/, 'a tile on every node row of the tree');
  assert.match(tree, /tile=\{nodeTile\(node\.id, branch\)\} size=\{TILE_BIG\}/, "a bigger tile beside the open node's name");
  assert.match(tree, /tile="range-till"/, "the tree's till line");
  assert.match(card, /tile=\{RANGE_UPGRADE_TILE\[u\.id\]\}/, "the Range card's upgrade rows");
  assert.match(card, /tile="range-till"/, "the Range card's till line");
  assert.match(card, /tile="home-caravan"/, 'Your home');
});

test('no row of the golf Course flyout shows the maple leaf where a tile fits: the Props menu wears its tiles (J13, #1277)', () => {
  const ctx = { golf: true, ui: null, roads: [], paths: [], junctions: [], surfaces: [], cares: [], materials: [], plants: [{ id: 'trees', name: 'Trees' }], practice: [], newHoleWhy: null, range: [], ...propMenuLists() } as unknown as MenuCtx;
  const bare: string[] = [], tiles = new Map<string, string | undefined>();
  const walk = (rows: readonly MenuRow[], path: string[]) => {
    for (const r of rows) { const p = [...path, r.label]; if (!r.caption && !r.tile && r.icon === 'leaf') bare.push(p.join(' > ')); tiles.set(p.join(' > '), r.tile); if (r.children) walk(r.children, p); }
  };
  walk(menuOf(RAIL.find(r => r.id === 'course')!, ctx), ['course']);
  assert.deepEqual(bare, [], 'a Props row with the leaf and no tile: pick one in tool-tiles.ts (PROP_GROUP_TILE)');
  // (the classic town's Decoration > Props stays a list with icons: T233, ui-flyouts.test.ts; its New: Buildings and New: Eight-view objects have no tile painted at all)
  const at = (path: string) => tiles.get(path), root = 'course > Facilities > Decoration > Props';
  assert.equal(at(root), 'all-props', root);
  assert.equal(at(`${root} > All props`), 'all-props', `${root} > All props`);
  assert.equal(at(`${root} > Desert & oasis`), 'desert-oasis', `${root} > Desert & oasis`);
  assert.equal(at(`${root} > New: Trees`), 'trees-mixed', `${root} > New: Trees`);
  assert.equal(at(`${root} > New: Lake props`), 'lake-props', `${root} > New: Lake props`);
  // the golf kind that showed the leaf (Course furniture) wears a tile on every row of it
  for (const row of ['All course furniture', 'Tournament dressing', 'New: Course props']) assert.ok(at(`course > Facilities > Course furniture > ${row}`), row);
});

/** the files of the UI (and of the guide's step lists, whose steps carry their own tile) that may name a tile */
function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) sources(p, out); else if (/\.tsx?$/.test(e.name)) out.push(p); }
  return out;
}
/** the quoted ids inside the expression of every `tile=` (JSX) and `tile:` (a field) of a source: a literal, or a conditional of literals */
export function tileIdsIn(text: string): string[] {
  const out: string[] = [], src = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1'); // (comments say "a tile: the picture ..." and have apostrophes)
  for (const m of src.matchAll(/(?<![\w.-])tile(?:=|:)\s*/g)) {
    let i = m.index! + m[0].length, d = 0, q = '';
    const from = i, jsx = src[i] === '{', lit = src[i] === '"' || src[i] === "'";
    for (; i < src.length; i++) {
      const ch = src[i]!;
      if (q) { if (ch === q) { q = ''; if (lit && d === 0) { i++; break; } } continue; } // (a literal ends the value)
      if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
      if (ch === '{' || ch === '(' || ch === '[') d++;
      else if (ch === '}' || ch === ')' || ch === ']') { if (d === 0) break; d--; if (jsx && d === 0) { i++; break; } } // (a JSX value ends at its brace)
      else if (d === 0 && (ch === ',' || ch === ';' || ch === '\n' || (ch === '/' && src[i + 1] === '>') || ch === '>')) break; // (a field's value ends at the comma)
    }
    for (const s of src.slice(from, i).matchAll(/'([a-z][a-z0-9-]*)'|"([a-z][a-z0-9-]*)"/g)) out.push((s[1] ?? s[2])!);
  }
  return out;
}

test('every tile id the UI source names exists (a typo cannot ship a broken picture)', () => {
  const files = [...sources('src/ui'), ...sources('src/game/ext/progressive-ui'), 'src/App.tsx'];
  let seen = 0;
  for (const f of files) {
    if (f.endsWith('tool-tiles.ts')) continue;
    for (const id of tileIdsIn(readFileSync(f, 'utf8'))) { seen++; assert.ok(ALL.has(id), `${f}: tile "${id}" is not a tile`); }
  }
  assert.ok(seen >= 15, `the scan finds the UI's tiles (${seen})`);
});

test('the scan reads literals, conditionals and tables', () => {
  assert.deepEqual(tileIdsIn('<ActionTile tile="bank" size={1} />'), ['bank']);
  assert.deepEqual(tileIdsIn("<ActionTile tile={/a/i.test(x) ? 'hire-attendant' : 'pick-balls'} />"), ['hire-attendant', 'pick-balls']);
  assert.deepEqual(tileIdsIn('<ActionTile tile={PLACE_TILE[p.id]} />'), []);
  assert.deepEqual(tileIdsIn("pic: { tile: 'clear-junk' }, other: 1"), ['clear-junk']);
  assert.deepEqual(tileIdsIn("x = { tile: s.first ? 'a-b' : 'c-d', y: 1 }"), ['a-b', 'c-d']);
});

/** the tile ids the golf view (packages/cinderlinks/parts) names: the markup's tiles/<id>.webp and the practice drills' table */
function viewTileIds(): string[] {
  const out: string[] = [], dir = 'packages/cinderlinks/parts';
  for (const f of readdirSync(dir).filter(n => n.endsWith('.md'))) {
    const s = readFileSync(join(dir, f), 'utf8');
    for (const m of s.matchAll(/tiles\/([a-z][a-z0-9-]*)\.webp/g)) out.push(m[1]!);
    for (const m of s.matchAll(/'((?:drill|shot|club)-[a-z0-9-]+)'/g)) out.push(m[1]!);
  }
  return out;
}

test('every one of the 120 action tiles and 12 props tiles is on an action (the UI, or the golf view), and the golf view names only tiles that exist', () => {
  const used = new Set<string>(), view = viewTileIds();
  for (const f of [...sources('src/ui'), ...sources('src/game/ext/progressive-ui'), 'src/App.tsx']) if (!f.endsWith('tool-tiles.ts')) for (const id of tileIdsIn(readFileSync(f, 'utf8'))) used.add(id);
  for (const [k, v] of Object.entries(T)) if (/_TILE$/.test(k) && v && typeof v === 'object' && !Array.isArray(v)) for (const id of Object.values(v as Record<string, string>)) used.add(id);
  for (const id of view) { assert.ok(ALL.has(id), `the golf view names "${id}": not a tile`); used.add(id); }
  assert.ok(view.length >= 21, 'the golf view names its drills, shots, clubs and buttons');
  assert.deepEqual([...ACTION_TILES, ...PROP_TILES].filter(id => !used.has(id) && !NOT_YET.includes(id) && !SOUND_TILES.includes(id)), [], 'a tile no action wears (the six sound tiles wait for J11, #1270)');
  assert.deepEqual(NOT_YET.filter(id => used.has(id)), [], 'a tile an action now wears: take it off NOT_YET');
  // the build copies the golf view's tiles (drill-* and shot-*) next to its page
  const build = readFileSync('packages/cinderlinks/build.mjs', 'utf8');
  assert.match(build, /\(drill\|shot\|club\)-/, 'build.mjs copies the drill, shot and club tiles');
  assert.match(build, /jump-to-ball\|gimme\|go-for-it/, 'build.mjs copies Jump to ball, Gimme and Go for it');
});

test('no step of the tutorial or the guide is text only: each of the 3 + 7 + 3 + 4 steps wears an existing tile', () => { // (#1297: the range guide has three steps now)
  const lists: [string, readonly { id: string; tile?: string }[]][] = [['RANGE_GUIDE', RANGE_GUIDE], ['GUIDE', GUIDE], ['JAM_TOUR', JAM_TOUR], ['TOWN_TOUR', TOWN_TOUR], ['GUIDE_STUCK', [GUIDE_STUCK]]];
  assert.deepEqual(lists.map(([, l]) => l.length), [3, 7, 3, 4, 1]);
  for (const [name, list] of lists) for (const st of list) assert.ok(st.tile && ALL.has(st.tile), `${name} ${st.id}: no tile (a new step needs one: tile: '<id>' from ui/tool-tiles.ts)`);
  // the guide's own picks (the coordinator's list for the range start)
  // (the tiles of the steps taken out, target-green, walking-path, paved-car-park, turf-tee, putting-green and golf-hole, are the guide's no more; the range card, the Build menu and the tips still wear them)
  assert.deepEqual(RANGE_GUIDE.map(st => st.tile), ['place-range', 'gravel-car-park', 'sell-buckets']);
});

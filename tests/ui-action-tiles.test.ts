// J8 (#1261; the owner, 2026-11-14: "add ALOT more images to the UI. especially on stuff you can do"): the action tiles. Every tile id the UI names
// has its picture in src/assets/ui/tiles (a typo, or a tile the cutter never made, would ship a broken image), every table of tiles names only tiles
// that exist, and each picture is a small 144 px WebP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as T from '../src/ui/tool-tiles';
import { ACTION_TILES, TOOL_TILES } from '../src/ui/tool-tiles';

const DIR = 'src/assets/ui/tiles', ALL = new Set<string>([...TOOL_TILES, ...ACTION_TILES]);

test('every tile id has its WebP, a small 144 px picture, and no picture lacks an id', async () => {
  assert.equal(ACTION_TILES.length, 48);
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

/** the files of the UI that may name a tile */
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
  const files = [...sources('src/ui'), 'src/App.tsx'];
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
    for (const m of s.matchAll(/'((?:drill|shot)-[a-z0-9-]+)'/g)) out.push(m[1]!);
  }
  return out;
}

test('every one of the 48 action tiles is on an action (the UI, or the golf view), and the golf view names only tiles that exist', () => {
  const used = new Set<string>(), view = viewTileIds();
  for (const f of [...sources('src/ui'), 'src/App.tsx']) if (!f.endsWith('tool-tiles.ts')) for (const id of tileIdsIn(readFileSync(f, 'utf8'))) used.add(id);
  for (const [k, v] of Object.entries(T)) if (/_TILE$/.test(k) && v && typeof v === 'object' && !Array.isArray(v)) for (const id of Object.values(v as Record<string, string>)) used.add(id);
  for (const id of view) { assert.ok(ALL.has(id), `the golf view names "${id}": not a tile`); used.add(id); }
  assert.ok(view.length >= 12, 'the golf view names its drills and shot tiles');
  assert.deepEqual(ACTION_TILES.filter(id => !used.has(id)), [], 'a tile no action wears');
  // the build copies the golf view's tiles (drill-* and shot-*) next to its page
  const build = readFileSync('packages/cinderlinks/build.mjs', 'utf8');
  assert.match(build, /\(drill\|shot\)-/, 'build.mjs copies the drill and shot tiles');
});

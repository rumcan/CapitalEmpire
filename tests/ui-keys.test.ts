// Help › Keys and the number keys (T202, #529; plan P23-UX 6.2 P2-8 the keymap). The Keys sheet is built from the rail's own table (rail-items.ts
// RAIL, which the rail and the flyouts read): every tool's key appears on it exactly once, a locked tool dimmed with its lock's reason, laid
// out as the menus are (the rail, Course, Town, then the camera, speed, views and the keys that work anywhere), and in the lot lab the lab's
// own keys under their heading. The number keys open the rail's groups in order, except where a tool already uses them (the Holes brush's
// surfaces 1-7, the town's Build its road classes 1-6). npm test (bundled by esbuild, run by node --test; the sheet renders with react-dom/server).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { advanceProgress, computeProgressiveUiState, emptyProgress, progressFacts, type CourseProgress } from '../src/game/ext/progressive-ui';
import { RAIL, railEntries, toolLock, toolsIn } from '../src/ui/rail-items';
import { KEY_PARTS, keySheet, numberedGroups, type KeySection } from '../src/ui/keymap';
import { KeysSheet } from '../src/ui/KeysSheet';
import { numberKeyUse } from '../src/game/tool-modes';
import { BRUSH_PRESETS } from '../src/game/paint';
import { KEY_CLASSES } from '../src/game/network';
import { KEYS as LAB_KEYS } from '../src/game/dev/lot-lab-ui';
import type { Tool } from '../src/game/types';

const course = (holes: number): CourseProgress => ({ holes, seasons: 0, invited: false });
/** the unlocks of a golf game at its start (no hole yet): most tools locked */
const startUi = () => { const p = emptyProgress(); advanceProgress(p, progressFacts(p, course(0)), null); return computeProgressiveUiState(progressFacts(p, course(0))); };
/** the games the sheet is checked in: golf with and without a driving range, the classic town game */
const GAMES = [{ golf: true, range: true }, { golf: true, range: false }, { golf: false, range: false }] as const;
/** the tools with a key a game shows (the rail's table), by tool */
function keyedTools(golf: boolean, range: boolean): Map<Tool, string> {
  const out = new Map<Tool, string>();
  for (const r of RAIL) {
    if ((r.only && r.only !== (golf ? 'golf' : 'classic')) || (r.action === 'range' && !range)) continue;
    for (const t of toolsIn(r, golf)) if (t.key) out.set(t.id, t.key);
  }
  return out;
}
const toolRows = (s: KeySection[]) => s.flatMap(x => x.rows.filter(r => r.tool));
const html = (s: KeySection[]) => renderToStaticMarkup(createElement(KeysSheet, { sections: s }));

describe('Help › Keys (T202)', () => {
  it('1. every tool key of the rail\'s table appears on the sheet exactly once, with its tool, in every game', () => {
    for (const g of GAMES) {
      const want = keyedTools(g.golf, g.range), rows = toolRows(keySheet({ ...g, ui: null }));
      assert.ok(want.size >= 12, 'the table has its keys');
      for (const [t, k] of want) {
        const mine = rows.filter(r => r.tool === t);
        assert.equal(mine.length, 1, `${t} (${k}) listed once in ${JSON.stringify(g)}`);
        assert.equal(mine[0]!.keys, k, `${t}'s key`);
      }
      assert.deepEqual(new Set(rows.map(r => r.tool)), new Set(want.keys()), 'no tool row the table does not have');
      // and no letter picks two tools
      assert.equal(new Set(rows.map(r => r.keys)).size, rows.length, 'a key for one tool');
    }
  });
  it('2. laid out as the menus: the rail, Course, Town, then the camera, speed, views and the keys that work anywhere; each group\'s tools in its part', () => {
    const s = keySheet({ golf: true, range: true, ui: null });
    const parts = s.map(x => x.part).filter((p, i, a) => a.indexOf(p) === i);
    assert.deepEqual(parts, ['rail', 'course', 'town', 'general']);
    assert.deepEqual(KEY_PARTS.map(p => p.part), ['rail', 'course', 'town', 'general', 'lab']);
    for (const r of RAIL) for (const t of toolsIn(r, true)) {
      const row = toolRows(s).find(x => x.tool === t.id); if (!t.key || !row || !r.section || t.id === 'props') continue;
      assert.equal(s.find(x => x.rows.includes(row))!.part, r.section, `${t.id} under ${r.section}`);
    }
    // the general keys the issue names: the camera, the speed, Esc, Undo / Redo, Delete, this sheet
    const all = s.flatMap(x => x.rows.map(r => r.keys)).join(' | ');
    for (const k of ['W A S D', '+ / −', 'Space (tap)', ', / .', 'Esc', 'Ctrl+Z / Ctrl+Y', 'Delete', '? / F1']) assert.ok(all.includes(k), `${k} on the sheet`);
    for (const id of ['camera', 'speed', 'views', 'anywhere']) assert.ok(s.some(x => x.id === id), id);
    // a tool's keys in hand sit with it, from the lists they pick from
    const holes = s.find(x => x.id === 'in:course')!, roads = s.find(x => x.id === 'in:road')!;
    assert.equal(holes.part, 'course'); assert.equal(roads.part, 'town');
    assert.equal(holes.rows[0]!.keys, `1 – ${BRUSH_PRESETS.length}`); assert.equal(roads.rows[0]!.keys, `1 – ${KEY_CLASSES.length}`);
    assert.equal(s.filter(x => x.id === 'in:props').length, 1, 'the Props tool\'s keys in hand once (it sits in both decorations)');
  });
  it('3. every letter the engine\'s keyDown handles is on the sheet', () => {
    const src = readFileSync('src/game/engine.ts', 'utf8'), body = src.slice(src.indexOf('  keyDown(e: KeyboardEvent) {'), src.indexOf('  keyUp(e: KeyboardEvent) {'));
    const letters = new Set([...body.matchAll(/case '([a-z])':/g)].map(m => m[1]!.toUpperCase()));
    assert.ok(letters.size >= 20, `the engine's letters (${[...letters].join('')})`);
    const keys = [...keySheet({ golf: true, range: true, ui: null }), ...keySheet({ golf: false, range: false, ui: null })].flatMap(x => x.rows.map(r => r.keys));
    const tokens = new Set(keys.flatMap(k => k.split(/[\s/,+]+/)));
    for (const l of letters) assert.ok(tokens.has(l), `${l} on the sheet`);
  });
  it('4. a locked tool or group is dimmed with its lock\'s reason (the unlocks in force); open, nothing is dimmed', () => {
    const ui = startUi(), s = keySheet({ golf: true, range: false, ui }), rows = toolRows(s);
    for (const r of rows) assert.equal(r.why ?? null, toolLock(ui, r.tool!), `${r.tool}'s lock`);
    const locked = rows.filter(r => r.why);
    assert.ok(locked.length > 0 && locked.length < rows.length, 'some tools locked at the start, some open');
    const h = html(s);
    for (const r of locked) {
      const row = h.match(new RegExp(`<div class="keys-row keys-row-locked" data-key-row="${r.keys.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" data-key-tool="${r.tool}"[^>]*>[\\s\\S]*?</div>`))?.[0] ?? '';
      assert.ok(row.includes('aria-disabled="true"') && row.includes(r.why!.replace(/'/g, '&#x27;')), `${r.tool}: dimmed with its reason`);
    }
    // the numbered groups carry the rail's group lock
    const rail = s.find(x => x.id === 'rail')!, entries = railEntries(ui, true, 'select', {});
    for (const r of rail.rows.filter(x => /^\d$/.test(x.keys))) {
      const g = numberedGroups(true, false)[+r.keys - 1]!;
      assert.equal(r.why ?? null, entries.find(e => e.item.id === g.id)!.locked, `${g.id}'s lock`);
    }
    assert.ok(keySheet({ golf: true, range: false, ui: null }).every(x => x.rows.every(r => !r.why)), 'every tool open: nothing dimmed');
    assert.ok(keySheet({ golf: false, range: false, ui }).every(x => x.rows.every(r => !r.why)), 'the classic game has no unlocks');
  });
  it('5. in the lot lab, the lab\'s own keys under their heading (its table, lot-lab-ui.ts KEYS)', () => {
    const s = keySheet({ golf: true, range: false, ui: null, lab: LAB_KEYS });
    assert.deepEqual(s.map(x => x.title), LAB_KEYS.map(([t]) => t));
    assert.ok(s.every(x => x.part === 'lab'));
    assert.deepEqual(s.flatMap(x => x.rows.map(r => [r.keys, r.what])), LAB_KEYS.flatMap(([, rows]) => rows));
    const h = html(s);
    assert.ok(h.includes('>Lot lab</h3>') && !h.includes('>Course</h3>'), 'the lab heading alone');
  });
  it('6. no sideways scroll: the cards wrap in columns, the card scrolls only vertically', () => {
    const css = readFileSync('src/index.css', 'utf8'), rule = (sel: string) => css.match(new RegExp(`\\${sel} \\{([^}]*)\\}`))?.[1] ?? '';
    assert.match(rule('.help-card'), /overflow-x: hidden/);
    assert.match(rule('.keys-grid'), /repeat\(auto-fill, minmax\(/);
    for (const sel of ['.keys-sheet', '.keys-grid', '.keys-card', '.keys-row', '.help-card-wide']) assert.doesNotMatch(rule(sel), /overflow-x: (auto|scroll)|white-space: nowrap/, sel);
    assert.match(rule('.help-card-wide'), /calc\(100vw - 2rem\)/, 'never wider than the screen');
  });
});

describe('the number keys (T202)', () => {
  it('1. 1-6 open the rail\'s groups after Select, in the rail\'s order (the six with a driving range)', () => {
    const order = (golf: boolean, range: boolean) => railEntries(null, golf, 'select', { range }).map(e => e.item.id).filter(id => id !== 'select');
    assert.deepEqual(numberedGroups(true, true).map(r => r.id), ['range', 'course', 'decor', 'traffic', 'towndecor', 'bulldoze']);
    for (const g of GAMES) assert.deepEqual(numberedGroups(g.golf, g.range).map(r => r.id), order(g.golf, g.range).slice(0, 6), JSON.stringify(g));
    // the sheet's rail card names them by number
    const rail = keySheet({ golf: true, range: true, ui: null }).find(x => x.id === 'rail')!;
    assert.deepEqual(rail.rows.filter(r => /^\d$/.test(r.keys)).map(r => r.keys), ['1', '2', '3', '4', '5', '6']);
    assert.equal(rail.rows.find(r => r.keys === '6')!.what, 'Bulldoze', 'Bulldoze has no flyout: its number picks it');
    assert.equal(rail.rows.find(r => r.keys === '3')!.what, 'the Decoration menu');
  });
  it('2. a tool that uses them keeps them: Holes its surfaces (1-7), the town\'s Build its road classes (1-6); elsewhere they open the groups', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      for (const t of ['select', 'bulldoze', 'junction', 'lane', 'paint', 'props', 'path', 'buildings', 'greenkeeping', 'park', 'bus', 'toll'] as Tool[]) assert.deepEqual(numberKeyUse(t, n), { k: 'group', i: n - 1 }, `${t} ${n}`);
      assert.deepEqual(numberKeyUse('road', n), { k: 'class', i: n - 1 });
      assert.deepEqual(numberKeyUse('course', n), { k: 'surface', i: n - 1 });
    }
    assert.deepEqual(numberKeyUse('course', 7), { k: 'surface', i: 6 }, 'the seventh surface');
    assert.equal(BRUSH_PRESETS.length, 7, 'seven surfaces');
    assert.equal(numberKeyUse('select', 7), null, 'no seventh group');
    assert.equal(numberKeyUse('road', 7), null);
    assert.equal(numberKeyUse('select', 0), null);
    // the engine asks the rule (a group opens through the App's railKey)
    const src = readFileSync('src/game/engine.ts', 'utf8');
    assert.match(src, /const u = numberKeyUse\(this\.uiTool, \+e\.key\);/);
    assert.match(src, /if \(u\?\.k === 'group'\) this\.railKey\?\.\(u\.i \+ 1\);/);
  });
});

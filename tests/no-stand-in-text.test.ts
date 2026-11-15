// The owner, 2026-11-15: "we have labels that say stand in for push picker. make sure we dont push that for the game. rather say nothing than say stand in anywhere".
// No screen text says "stand in": the menus and cards (src/ui, App.tsx) carry none outside comments, the stand-in labels' switch is gone and never on,
// and the pick-up label over your golfer (drawn straight on the canvas) only shows with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : []; });
/** a line with its comment taken out (a line comment, a block comment's line, a JSX comment) */
const uncomment = (l: string): string => /^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l.replace(/\{\s*\/\*.*?\*\/\s*\}/g, '').replace(/\s\/\/\s.*$/, '');

test('no menu or card writes "stand in" (src/ui and App.tsx, outside comments)', () => {
  const bad: string[] = [];
  for (const f of [...files('src/ui'), 'src/App.tsx']) {
    readFileSync(f, 'utf8').split('\n').forEach((l0, n) => { const l = uncomment(l0); if (/stand[ -]in/i.test(l)) bad.push(`${f}:${n + 1}: ${l.trim().slice(0, 120)}`); });
  }
  assert.deepEqual(bad, []);
});

test("the stand-in labels' switch is gone and never on; your golfer's pick-up label waits on it", () => {
  const eng = readFileSync('src/game/engine.ts', 'utf8'), app = readFileSync('src/App.tsx', 'utf8');
  assert.ok(!/setShowStandIns\(/.test(app) && !/Show stand-in labels/.test(app));
  assert.ok(eng.includes('this.showStandIns = false; // (the owner, 2026-11-15'));
  assert.ok(!eng.includes("localStorage.getItem('capitalempire.standins')"));
  assert.ok(eng.includes("const t = !this.showStandIns ? '' : this.youInCart ? (kit.cart > 0 ? 'Stand In for pull-behind picker'"));
});

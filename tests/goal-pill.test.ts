// #1297 (the owner, 2026-11-14: "goals cover menu ui. cant be closed either"): the Goal pill is part of the top bar, never a layer over the panels: a small chip in the bar that
// shows and folds the full pill (a row of the bar), the choice remembered in this browser, and no goal at all in the jam build. Pure, Node (the pill in the built game, at the
// largest Text size on 1280 and 1366 px, with a panel open: scripts/dev/goal-pill-shots.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { GOAL_PILL_KEY, goalChipView, loadGoalOpen, saveGoalOpen } from '../src/ui/golf/goal-pill';
import { GoalChip, GoalToggle } from '../src/ui/golf/ReportCard';
import { GoalChipInBar, GoalRowInBar, type FinHost } from '../src/ui/golf/FinLitHud';
import type { Live, Report } from '../src/game/golf/reports';

const mem = (v?: string) => { let x = v; return { getItem: (k: string) => (k === GOAL_PILL_KEY ? x ?? null : null), setItem: (k: string, s: string) => { if (k === GOAL_PILL_KEY) x = s; }, get: () => x }; };
const throwing = { getItem: () => { throw new Error('no storage'); }, setItem: () => { throw new Error('no storage'); } };
const live = (o: Partial<Live> = {}): Live => ({ holes: 0, cash: 681_202, netWorth: 681_202, debt: 0, ...o });
const none: readonly Report[] = [];

test('the choice: folded by default, remembered once made, folded again where the storage cannot be read or written', () => {
  assert.equal(loadGoalOpen(mem()), false, 'folded when nothing is stored');
  const s = mem(); assert.equal(saveGoalOpen(true, s), true); assert.equal(s.get(), 'open'); assert.equal(loadGoalOpen(s), true);
  saveGoalOpen(false, s); assert.equal(s.get(), 'closed'); assert.equal(loadGoalOpen(s), false);
  assert.equal(loadGoalOpen(mem('garbage')), false);
  assert.equal(loadGoalOpen(throwing), false, 'a private window: folded');
  assert.equal(saveGoalOpen(true, throwing), true, 'storage that throws still gives the state back, and never throws');
  assert.equal(loadGoalOpen(null), false);
});

test('the chip says the holes and the months left; its name and tooltip say the whole goal and what a click does', () => {
  const g = { holes: 3, holesNeed: 9, monthsLeft: 21, overdraft: false };
  const a = goalChipView(g, false), b = goalChipView(g, true);
  assert.equal(a.short, '3/9'); assert.equal(a.months, '21 mo');
  assert.match(a.label, /Goal: 3 of 9 holes, 21 months left\. Show the goal/); assert.match(b.label, /Fold the goal/);
  assert.match(a.tip, /nine holes and \$250,000 net worth/); assert.match(a.tip, /Click to show it under the bar/); assert.match(b.tip, /Click to fold it/);
  assert.match(goalChipView({ ...g, monthsLeft: 0 }, false).label, /time is up/); assert.equal(goalChipView({ ...g, monthsLeft: 0 }, false).months, 'time is up');
  assert.match(goalChipView({ ...g, overdraft: true }, false).label, /overdrawn/);
});

test('the chip and the row are in the bar\'s flow: no layer of their own, no fixed place; a screen reader hears the state', () => {
  const chip = renderToStaticMarkup(createElement(GoalToggle, { history: none, live: live(), open: false, onToggle: () => {} }));
  assert.match(chip, /data-testid="goal-toggle"/); assert.match(chip, /aria-expanded="false"/); assert.match(chip, /0\/9/);
  assert.match(renderToStaticMarkup(createElement(GoalToggle, { history: none, live: live(), open: true, onToggle: () => {} })), /aria-expanded="true"/);
  const host = { finance: { history: [] }, finLive: () => live() } as unknown as FinHost;
  const row = renderToStaticMarkup(createElement(GoalRowInBar, { game: host, onFold: () => {} }));
  assert.match(row, /data-testid="goal-chip"/, 'the full pill'); assert.match(row, /data-testid="goal-fold"/, 'and a Fold button beside it'); assert.match(row, /Fold/);
  // (the pill's own progress bars lay a bar over a bar: it is its outer boxes that must stand in the flow, so the first two tags are read)
  const outer = (html: string) => html.match(/^(?:<[^>]*>){1,2}/)![0];
  for (const html of [chip, row, renderToStaticMarkup(createElement(GoalChip, { history: none, live: live() }))]) assert.ok(!/\b(absolute|fixed)\b/.test(outer(html)), 'a pill in the flow, not over the page: ' + outer(html).slice(0, 120));
});

test('the jam build has no goal: neither the chip nor the row draws', () => {
  const src = readFileSync('src/ui/golf/FinLitHud.tsx', 'utf8');
  assert.match(src, /export function GoalChipInBar[^\n]*\n\s*if \(JAM\) return null;/); assert.match(src, /export function GoalRowInBar[^\n]*\n\s*if \(JAM\) return null;/);
  assert.match(src, /if \(JAM\) return <StatementCard history=\{history\} \/>;/, 'the layer keeps the jam to the statement alone');
  const app = readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /\{!JAM && <GoalChipInBar /); assert.match(app, /\{!JAM && gv && goalOpen && /);
  // (the build's own flag is off in the tests: the normal build draws the chip)
  assert.ok(GoalChipInBar({ game: { finance: { history: [] }, finLive: () => live() } as unknown as FinHost, open: false, onToggle: () => {} }));
});

test('the pill is wired into the top bar, and nothing else draws it over the panels', () => {
  const app = readFileSync('src/App.tsx', 'utf8'), hud = readFileSync('src/ui/golf/FinLitHud.tsx', 'utf8');
  // the chip is inside the top bar's first group, the row a child of the bar itself (the element --hud-top follows), after the right-hand group
  const bar = app.slice(app.indexOf('ref={topBar}'), app.indexOf('T174: the box round the rail'));
  assert.ok(bar.includes('<GoalChipInBar') && bar.includes('<GoalRowInBar'), 'the chip and the row are in the bar');
  assert.ok(bar.indexOf('<GoalChipInBar') < bar.indexOf('ml-auto flex items-center gap-2') && bar.indexOf('ml-auto flex items-center gap-2') < bar.indexOf('<GoalRowInBar'), 'the chip with the chips, the row after the speed bar');
  assert.match(bar, /order-last basis-full/, 'its own row of the bar');
  assert.ok(!/left-28|top-\[calc\(var\(--hud-top/.test(hud), 'the layer no longer holds the pill at a fixed place under the bar');
  assert.ok(!/finlit-goal/.test(app.replace(/data-testid="goal-row"/, '')), 'one place draws it');
  assert.match(app, /loadGoalOpen\(\)/); assert.match(app, /saveGoalOpen\(/);
});

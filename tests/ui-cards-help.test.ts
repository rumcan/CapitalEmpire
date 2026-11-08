// T337 (#963): the Cards page of Help (src/ui/golf/CardsHelp.tsx: every card by rarity with what it does, its flavour and its inspiration, the ones you have won marked, never a sideways scrollbar) and the shot panel's
// tools (the laser's lines, the slope and the green read, the caddie, the second ball's toggle, the pace window on the meter). Rendered to static markup from the views (the numbers are tested in golf-card-catalogue.test.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { CardsHelp } from '../src/ui/golf/CardsHelp';
import { ShotPanel } from '../src/ui/ShotPanel';
import type { Game, ShotState, ShotTools } from '../src/game/engine';
import { CARDS, RARITIES, cardLines } from '../src/game/golf/cards';
import { allowedClubs, carryFor, kitOf, type Club, type OwnerTurn } from '../src/game/golf/play';

const help = (owned?: string[]) => renderToStaticMarkup(createElement(CardsHelp, owned ? { owned } : {}));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

test('help: the Cards page lists every card by rarity (legendary first) with its words, its effect lines, its flavour and its inspiration; the ones you won are marked; no sideways scroll', () => {
  const h = help(['deck-driver', 'clutch-gene']);
  assert.ok(h.includes('data-testid="cards-help"') && h.includes(`The cards (${CARDS.length})`));
  assert.equal((h.match(/data-testid="cards-help-card-/g) ?? []).length, CARDS.length, 'one article per card'); assert.equal((h.match(/Inspired by:/g) ?? []).length, CARDS.length, 'every card says where it comes from');
  for (const c of CARDS) {
    assert.ok(h.includes(`data-testid="cards-help-card-${c.id}"`), c.id); assert.ok(h.includes(esc(c.name)) && h.includes(esc(c.text)) && h.includes(esc(c.flavour)) && h.includes(esc(c.inspiration)), `${c.id}: its words`);
    assert.ok(h.includes(esc(cardLines(c).join(' · '))), `${c.id}: its effect lines`);
  }
  const order = RARITIES.map(r => h.indexOf(`data-testid="cards-help-${r.id}"`)); assert.ok(order.every(i => i >= 0), 'every rarity has its group'); assert.deepEqual([...order].sort((a, b) => b - a), order, 'legendary first, common last');
  assert.equal((h.match(/>won</g) ?? []).length, 2, 'the two cards won are marked'); assert.equal((help().match(/>won</g) ?? []).length, 0, 'none owned: none marked');
  assert.ok(!/overflow-x-auto|overflow-x-scroll/.test(h) && /overflow-x-hidden/.test(h), 'a vertical list: never a sideways scrollbar');
  assert.ok(h.includes('Banned in competition') && /Banned in competition/.test(cardLines(CARDS.find(c => c.banned)!).join()), 'the ones banned in competition say so');
});

const turn = (lie: OwnerTurn['lie']): OwnerTurn => ({ golfer: -1, holeIdx: 0, hole: 1, par: 4, stroke: 1, t: 0, lie, ball: { x: 10, y: 10 }, pin: { x: 90, y: 10 }, distM: 160, suggested: { club: 'iron6', aim: { x: 80, y: 10 }, power: 1 } });
const state = (club: Club, lie: OwnerTurn['lie'] = 'fairway', extra: Partial<ShotState> = {}): ShotState => ({ turn: turn(lie), input: { club, aim: { x: 80, y: 10 }, power: 1 }, mine: true, ...extra });
function panelGame(s: ShotState, extra: Record<string, unknown>): Game {
  return { shotState: () => s, shotSkill: () => 0.3, shotKit: () => kitOf(0.3, s.input.club), shotCarry: () => carryFor(0.3, s.input.club), setShotShape() { /* none */ }, shotConditions: () => null, lastShotReport: () => null, setShotClub() { /* none */ }, ownerCaddie() { /* none */ }, ownerSwing() { /* none */ },
    shotClubs: () => allowedClubs('fairway', false), clubLevel: () => 0, ...extra } as unknown as Game;
}
const panel = (club: Club, tools: ShotTools | null, lie: OwnerTurn['lie'] = 'fairway', extra: Partial<ShotState> = {}) => renderToStaticMarkup(createElement(ShotPanel, { game: panelGame(state(club, lie, extra), { shotTools: () => tools, setShotScramble() { /* none */ } }) }));

test('shot panel: the tools block shows the laser’s lines, the slope, the caddie and the green read; the second ball’s toggle says how many are left and whether it is on; none without a tool', () => {
  const lines = ['Pin 143.6 m · aim 138.2 m', 'Water: carry 112 m, clear at 131 m', 'Slope Mode: the pin is 1.4 m above you', 'Caddie: 6 iron at the line: play his club on his line for +5 on every skill'];
  const h = panel('iron6', { lines, scramble: null, paceHalf: null });
  assert.ok(h.includes('data-testid="shot-tools"')); for (const l of lines) assert.ok(h.includes(esc(l)), l); assert.ok(!h.includes('scramble-toggle'), 'no toggle without the second ball');
  const t = panel('driver', { lines: [], scramble: { left: 1, on: false }, paceHalf: null }, 'tee'); assert.ok(t.includes('data-testid="scramble-toggle"') && /Scramble: a second ball \(1 left this nine\)/.test(t) && !/· on/.test(t), 'offered off');
  const on = panel('driver', { lines: [], scramble: { left: 1, on: true }, paceHalf: null }, 'tee', { scr: true }); assert.ok(/Scramble: a second ball \(1 left this nine\) · on/.test(on) && /chip-on/.test(on), 'switched on');
  const none = panel('iron6', null); assert.ok(!none.includes('data-testid="shot-tools"'), 'no tool: no block'); assert.ok(!panel('iron6', { lines: [], scramble: null, paceHalf: 0.2 }).includes('data-testid="shot-tools"'), 'the pace window is on the meter, not a line');
  const read = panel('putter', { lines: ['Green read: breaks left to right (2.1%), downhill (1.2%): quick'], scramble: null, paceHalf: 0.15 }, 'green'); assert.ok(read.includes('Green read: breaks left to right'), 'the green read on a putt');
  assert.ok(!/overflow-x-auto|overflow-x-scroll/.test(h), 'never a sideways scrollbar');
});

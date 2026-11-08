// T334 (#960): the shot panel's conditions (src/ui/ShotPanel.tsx): the wind dial and its words, the lie's box with the effect lines, the slope's lines, the aim that "plays like", the caddie's
// ring, and no conditions for a tournament that began before the weather. Rendered to static markup from a stand-in game (the panel reads the game only through shotState, shotConditions, shotSkill and
// lastShotReport); the game's own numbers are tested in golf-play-conditions.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { ShotPanel } from '../src/ui/ShotPanel';
import type { Game, ShotConditions, ShotState } from '../src/game/engine';
import { lieView, previewShot, slopeLines, windView } from '../src/game/golf/play';
import type { Club, OwnerTurn } from '../src/game/golf/play';

const turn = (lie: OwnerTurn['lie']): OwnerTurn => ({ golfer: -1, holeIdx: 0, hole: 1, par: 4, stroke: 1, t: 0, lie, ball: { x: 10, y: 10 }, pin: { x: 90, y: 10 }, distM: 160, suggested: { club: 'iron6', aim: { x: 80, y: 10 }, power: 1 } });
const state = (club: Club, lie: OwnerTurn['lie'] = 'rough'): ShotState => ({ turn: turn(lie), input: { club, aim: { x: 80, y: 10 }, power: 1 }, mine: true });
/** the stand-in game: a shot open, its conditions */
function game(s: ShotState | null, c: Partial<ShotConditions> | null): Game {
  const wind = windView({ mph: 13, from: 46 }, { mph: 11, from: 46, gusty: 0.4, seed: 1 }, 1, 0), lie = lieView('rough', s?.input.club ?? 'iron6');
  const cond: ShotConditions | null = c === null ? null : { on: true, putting: false, wind, day: null, lie, slope: { up: 0, across: 0 }, slopeLines: [], preview: previewShot('iron6', 140, 1, 0, { lie: 'rough' }), aimedM: 140, playsLikeM: 159, suggest: 'wood3', ...c };
  return { shotState: () => s, shotSkill: () => 0.3, shotConditions: () => cond, lastShotReport: () => null, setShotClub() { /* none */ }, ownerCaddie() { /* none */ }, ownerSwing() { /* none */ } } as unknown as Game;
}
const html = (g: Game) => renderToStaticMarkup(createElement(ShotPanel, { game: g }));

test('shot panel: the wind dial (mph, the words, the day’s gusts), the lie’s box (name, effect lines, flier risk), and the aim that plays like', () => {
  const h = html(game(state('iron6'), {}));
  assert.ok(h.includes('data-testid="shot-conditions"') && h.includes('aria-label="Wind dial"'), 'the box and the dial');
  assert.ok(/13 mph/.test(h) && /from the NE/.test(h) && /gusts to 14/.test(h), 'the speed, the bearing and the gust peak');
  assert.ok(/Left to right|Into the wind|Helping|Right to left/.test(h), 'the wind against the shot in words');
  assert.ok(/Rough/.test(h) && /flier risk/.test(h) && /carry -12%/.test(h) && /scatter x1\.3/.test(h) && /45% of the spin/.test(h), 'the lie and what it does');
  assert.ok(/the aim plays like 159 m/.test(h), 'the club line says what the aim plays like');
  assert.ok(/<g transform="rotate\(/.test(h), 'an arrow in a wind');
});

test('shot panel: a calm has no arrow and says so; the slope’s lines and the wind’s effect on the shot are shown', () => {
  const calm = html(game(state('iron6', 'fairway'), { wind: windView({ mph: 1, from: 90 }, null, 1, 0), lie: lieView('fairway', 'iron6'), playsLikeM: 140 }));
  assert.ok(/Calm/.test(calm) && !/<g transform="rotate\(/.test(calm), 'calm: the word, no arrow'); assert.ok(/A clean lie: full spin/.test(calm) && !/plays like/.test(calm), 'a fairway in a calm plays like it is');
  const slope = { up: 0.03, across: 0.03 }, sl = html(game(state('iron6', 'fairway'), { lie: lieView('fairway', 'iron6'), slope, slopeLines: slopeLines(slope) }));
  assert.ok(/Ball above your feet: pulls left 2°/.test(sl) && /Uphill lie: 3% shorter, higher/.test(sl), 'the slope’s lines');
  const fx = html(game(state('iron6'), { preview: { ...previewShot('iron6', 140, 1, 0, { lie: 'rough', wind: { mph: 13, from: 46 } }), windCarryM: -9, windDriftM: 5 } }));
  assert.ok(/-9 m, 5 m right/.test(fx), 'what the wind adds to this shot');
});

test('shot panel: a putt shows the green and no wind; the caddie’s ring follows the conditions’ club; no conditions (a day from before the weather, or no game state) show nothing new', () => {
  const putt = html(game({ ...state('putter', 'green'), input: { club: 'putter', aim: { x: 90, y: 10 }, power: 1 } }, { putting: true, lie: lieView('green', 'putter') }));
  assert.ok(/On the green/.test(putt) && !/aria-label="Wind dial"/.test(putt), 'a putt: no wind');
  const ring = html(game(state('iron6'), { suggest: 'wood3' }));
  assert.ok(/ring-amber-300\/70[^>]*>3-wood|3-wood<\/button>/.test(ring) || /3-wood/.test(ring), 'the 3-wood is among the chips');
  const i6 = (ring.match(/<button[^>]*ring-1 ring-amber-300\/70[^>]*>([^<]*)<\/button>/) ?? [])[1];
  assert.equal(i6, '3-wood', 'the ring is on the conditions’ club');
  const none = html(game(state('iron6'), null)), off = html(game(state('iron6'), { on: false }));
  assert.ok(!/data-testid="shot-conditions"/.test(none) && !/data-testid="shot-conditions"/.test(off), 'no box without conditions or with the weather off');
  assert.equal(html(game(null, null)), '', 'no shot, no panel');
});

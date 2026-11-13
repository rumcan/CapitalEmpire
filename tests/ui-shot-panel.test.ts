// T334 (#960): the shot panel's conditions (src/ui/ShotPanel.tsx): the wind dial and its words, the lie's box with the effect lines, the slope's lines, the aim that "plays like", the caddie's
// ring, and no conditions for a tournament that began before the weather. Rendered to static markup from a stand-in game (the panel reads the game only through shotState, shotConditions, shotSkill and
// lastShotReport); the game's own numbers are tested in golf-play-conditions.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { ShotPanel } from '../src/ui/ShotPanel';
import type { Game, ShotConditions, ShotState } from '../src/game/engine';
import { allowedClubs, carryFor, clubsOf, kitOf, lieView, previewShot, shapeEffect, shapeLines, slopeLines, windView } from '../src/game/golf/play';
import type { Club, OwnerTurn } from '../src/game/golf/play';

const turn = (lie: OwnerTurn['lie']): OwnerTurn => ({ golfer: -1, holeIdx: 0, hole: 1, par: 4, stroke: 1, t: 0, lie, ball: { x: 10, y: 10 }, pin: { x: 90, y: 10 }, distM: 160, suggested: { club: 'iron6', aim: { x: 80, y: 10 }, power: 1 } });
const state = (club: Club, lie: OwnerTurn['lie'] = 'rough'): ShotState => ({ turn: turn(lie), input: { club, aim: { x: 80, y: 10 }, power: 1 }, mine: true });
/** the stand-in game: a shot open, its conditions */
function game(s: ShotState | null, c: Partial<ShotConditions> | null): Game {
  const wind = windView({ mph: 13, from: 46 }, { mph: 11, from: 46, gusty: 0.4, seed: 1 }, 1, 0), lie = lieView('rough', s?.input.club ?? 'iron6');
  const cond: ShotConditions | null = c === null ? null : { on: true, putting: false, wind, day: null, lie, slope: { up: 0, across: 0 }, slopeLines: [], preview: previewShot('iron6', 140, 1, 0, { lie: 'rough' }), aimedM: 140, playsLikeM: 159, suggest: 'wood3', shape: { pick: s?.shape ?? { curve: 0, flight: 0 }, fx: shapeEffect(s?.shape ?? null, s?.input.club ?? 'iron6', 140, 0.3), lines: s?.shape ? shapeLines(s.shape, shapeEffect(s.shape, s.input.club, 140, 0.3)) : [] }, ...c };
  return { shotState: () => s, shotSkill: () => 0.3, shotKit: () => kitOf(0.3, s?.input.club ?? 'iron6'), shotCarry: () => carryFor(0.3, s?.input.club ?? 'iron6'), setShotShape() { /* none */ }, shotConditions: () => cond, lastShotReport: () => null, setShotClub() { /* none */ }, ownerCaddie() { /* none */ }, ownerSwing() { /* none */ } } as unknown as Game;
}
const html = (g: Game) => renderToStaticMarkup(createElement(ShotPanel, { game: g }));

test('shot panel: the wind dial (mph, the words, the day’s gusts), the lie’s box (name, effect lines, flier risk), and the aim that plays like', () => {
  const h = html(game(state('iron6'), {}));
  assert.ok(h.includes('data-testid="shot-conditions"') && h.includes('aria-label="Wind dial"'), 'the box and the dial');
  assert.ok(/13 mph/.test(h) && /from the NE/.test(h) && /gusts to 14/.test(h), 'the speed, the bearing and the gust peak');
  assert.ok(/Left to right|Into the wind|Helping|Right to left/.test(h), 'the wind against the shot in words');
  assert.ok(/Rough/.test(h) && /flier risk/.test(h) && /carry -13%/.test(h) && /scatter x1\.3/.test(h) && /45% of the spin/.test(h), 'the lie and what it does');
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
  assert.ok(/aria-label="3-wood"/.test(ring), 'the 3-wood is among the chips');
  const i6 = (ring.match(/<button[^>]*ring-1 ring-amber-300\/70[^>]*>([^<]*)<\/button>/) ?? [])[1];
  assert.equal(i6, '3W', 'the ring is on the conditions’ club');
  const none = html(game(state('iron6'), null)), off = html(game(state('iron6'), { on: false }));
  assert.ok(!/data-testid="shot-conditions"/.test(none) && !/data-testid="shot-conditions"/.test(off), 'no box without conditions or with the weather off');
  assert.equal(html(game(null, null)), '', 'no shot, no panel');
});

test('shot panel (part 2): the shaping row (curve and flight, the pick marked) for a full shot, none for a putt, and the pick’s effect and cost in words', () => {
  const plain = html(game(state('iron6'), {}));
  assert.ok(plain.includes('data-testid="shot-shape"') && /Draw/.test(plain) && /Straight/.test(plain) && /Fade/.test(plain) && /Low/.test(plain) && /Normal/.test(plain) && /High/.test(plain), 'the six buttons');
  assert.ok(!plain.includes('data-testid="shape-lines"'), 'straight and normal: no lines');
  const picked = html(game({ ...state('iron6'), shape: { curve: -1, flight: 1 } }, {}));
  assert.ok(/data-testid="shape-lines"/.test(picked) && /Draw, high/.test(picked) && /curves left/.test(picked) && /pulled off/.test(picked) && /miss x1.55/.test(picked) && /lands soft/.test(picked), 'a draw and a high flight: curve, flight and the cost');
  assert.equal((picked.match(/chip chip-on/g) ?? []).length, 3, 'the club and the two picks are marked on');
  const putt = html(game({ ...state('putter', 'green'), input: { club: 'putter', aim: { x: 90, y: 10 }, power: 1 } }, { putting: true, lie: lieView('green', 'putter') }));
  assert.ok(!putt.includes('data-testid="shot-shape"'), 'a putt has no shape');
});

test('shot panel (T335): the club strip is your bag: the woods, irons, wedges and putter in groups with short names, the upgraded clubs marked, only what the lie allows; a stand-in game without a bag shows the original seven', () => {
  const clubs = (lie: OwnerTurn['lie'], tee: boolean, third: Club = 'wood5'): Club[] => allowedClubs(lie, tee, clubsOf(third === 'hybrid' ? { v: 1, third: 'hybrid' } : null));
  const bag = (s: ShotState, list: Club[], lv: Partial<Record<Club, number>> = {}): Game => ({ ...game(s, {}), shotClubs: () => list, clubLevel: (c: Club) => lv[c] ?? 0 }) as unknown as Game;
  const fair = html(bag(state('iron7', 'fairway'), clubs('fairway', false), { iron7: 2, driver: 3 }));
  assert.ok(fair.includes('data-testid="club-strip"') && fair.includes('data-testid="club-group-woods"') && fair.includes('data-testid="club-group-irons"') && fair.includes('data-testid="club-group-wedges"'), 'the groups');
  assert.ok(!fair.includes('data-testid="club-group-putter"'), 'no putter off the green');
  const labels = [...fair.matchAll(/<button[^>]*aria-label="([^"]+)"[^>]*>([^<]*)/g)].map(m => `${m[1]}=${m[2]}`);
  assert.deepEqual(labels.slice(0, 12), ['3-wood=3W', '5-wood=5W', '4-iron=4', '5-iron=5', '6-iron=6', '7-iron=7', '8-iron=8', '9-iron=9', 'Pitching wedge=PW', 'Gap wedge=GW', 'Sand wedge=SW', 'Lob wedge=LW'], 'the bag off the deck, longest first, 12 clubs (the driver is for the tee)');
  assert.ok(/aria-label="7-iron"[^>]*title="Tour 7-iron"/.test(fair), 'an upgraded club says its level'); assert.ok(/Tour 7-iron: full carry/.test(fair), 'and the line under the strip names it with its level');
  const tee = html(bag(state('driver', 'tee'), clubs('tee', true), { driver: 3 }));
  assert.ok(/aria-label="Driver"[^>]*title="Prototype driver"/.test(tee) && tee.includes('background:#fbbf24'), 'the Prototype driver’s dot is gold');
  const hy = html(bag(state('hybrid', 'fairway'), clubs('fairway', false, 'hybrid')));
  assert.ok(/aria-label="Hybrid"[^>]*>Hy/.test(hy) && !/aria-label="5-wood"/.test(hy), 'the hybrid in the third wood’s slot');
  const green = html(bag({ ...state('putter', 'green'), input: { club: 'putter', aim: { x: 90, y: 10 }, power: 1 } }, clubs('green', false)));
  assert.ok(green.includes('data-testid="club-group-putter"') && /aria-label="Putter"[^>]*>Putter/.test(green), 'the putter on the green');
  const old = html(game(state('iron6'), {}));
  assert.ok(/aria-label="Sand wedge"/.test(old) && !/aria-label="7-iron"/.test(old), 'no bag in the stand-in game: the original seven');
});

test('shot panel (T348): the hint is what a first-time player needs, two lines at most, and the club keys, the aim and the boost are in the "?" tip', () => {
  const h = html(game(state('iron6'), {}));
  const hint = (/data-testid="shot-hint-text"[^>]*>([^<]*)</.exec(h) ?? [])[1] ?? '';
  assert.ok(hint.length > 20 && hint.length <= 80, `the hint is one short sentence pair: "${hint}" (${hint.length} characters: two lines of the panel's text column at most)`);
  assert.ok(/meter/.test(hint) && /power/.test(hint) && /snap line/.test(hint), 'the swing: the meter, the power, the snap line');
  assert.ok(!/Q \/ E|wheel|aim|Space/.test(hint), 'the rest is not in the line');
  const tip = (/data-testid="shot-help" title="([^"]*)"/.exec(h) ?? [])[1] ?? '';
  assert.ok(/Q \/ E/.test(tip) && /wheel/.test(tip) && /aim/.test(tip) && /Space during the swing/.test(tip), `the "?" tip holds the club keys, the aim and the boost: "${tip}"`);
  assert.ok(/aria-label="More controls"/.test(h) && />\?<\/button>/.test(h), 'a "?" button');
  assert.ok(!/min-h-\[4\.5em\]/.test(h), 'the four-line box is gone'); assert.ok(h.includes('data-testid="shot-hint"') && /min-h-\[2\.4em\]/.test(h), 'two lines of room');
  // a locked mechanic says nothing of Space in the tip either
  const locked = html({ ...game(state('iron6'), {}), shotCan: () => ({ boost: false, airspin: false }) } as unknown as Game);
  assert.ok(!/Space/.test(locked), 'no Space without Power Mash');
});

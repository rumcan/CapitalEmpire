// T350 (#993): the cards of Start round, rendered to static markup: the first-tee card (a booking is a tee time to play yourself: Start round and Let the game play it; the words when the tee time has passed or
// the game plays it; the tournament's Start round), the tee-time card ("play now or let the game play it?") and the event card's Start round with its tee time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { TeeAskCard, TeeCard } from '../src/ui/golf/YouCards';
import { EventCard } from '../src/ui/golf/EventCard';
import type { EventCardView } from '../src/game/engine';
import type { RoundState } from '../src/game/golf/player';

const none = () => { /* none */ };
const tee = (round: RoundState, start: number | null = null): string => renderToStaticMarkup(createElement(TeeCard, { view: { join: false, round, name: 'Pat', start }, right: 'right-3', onJoin: none, onBook: none, onStart: none, onAuto: none, onTourney: none, onClose: none }));
const evView = (over: Partial<EventCardView> = {}): EventCardView => ({ id: 'mayor', name: 'Mayor’s Cup', when: 'in May', phase: 'today', hcp: 18, hcpText: '18.0', maxHcp: null, why: null, entered: true, field: 14, holes: 18, playWhy: null, playing: false, result: null, line: null, you: 'Pat', tee: 680, ...over });
const event = (v: EventCardView): string => renderToStaticMarkup(createElement(EventCard, { view: v, right: 'right-3', onClose: none, onEnter: none, onPlay: none }));

test('first tee: a booking is a tee time to play yourself: Start round and Let the game play it, in words that do not say the day plays it for you', () => {
  const h = tee({ k: 'booked', tee: 680 });
  assert.ok(h.includes('data-testid="tee-start"') && /Start round/.test(h), 'Start round');
  assert.ok(h.includes('data-testid="tee-auto"') && /Let the game play it/.test(h), 'the stand-in is a choice');
  assert.ok(/Your tee time: 11:20/.test(h), 'the tee time');
  assert.ok(/A booking holds a tee time/.test(h) && !/the day plays your round for you/.test(h), 'the note');
  const late = tee({ k: 'booked', tee: 680, late: true });
  assert.ok(/Your tee time has passed: 11:20/.test(late) && late.includes('data-testid="tee-start"'), 'passed: still yours to play');
});

test('first tee: a round the game plays has no Start round; Book is still there when nothing is booked; the tournament has its own Start round', () => {
  const auto = tee({ k: 'booked', tee: 680, auto: true });
  assert.ok(/The game plays your round: 11:20/.test(auto) && !auto.includes('data-testid="tee-start"') && !auto.includes('data-testid="tee-auto"'), 'the game’s round');
  const free = tee({ k: 'none', next: 700, why: null });
  assert.ok(free.includes('data-testid="tee-book"') && /Book 11:40/.test(free) && !free.includes('data-testid="tee-start"'), 'Book a tee time');
  const t = tee({ k: 'none', next: 700, why: null }, 480);
  assert.ok(t.includes('data-testid="tee-tourney-start"') && /tee time 08:00/.test(t), 'the tournament’s Start round');
  assert.ok(!tee({ k: 'none', next: 700, why: null }).includes('tee-tourney-start'), 'none without a tournament');
});

test('tee-time card: asks to play now or let the game play it, nothing else', () => {
  const h = renderToStaticMarkup(createElement(TeeAskCard, { tee: 680, right: 'right-3', onPlay: none, onAuto: none, onClose: none }));
  assert.ok(h.includes('data-testid="tee-ask"') && /Your tee time: 11:20/.test(h), 'the card');
  assert.ok(h.includes('data-testid="tee-ask-play"') && />Play now</.test(h), 'play now');
  assert.ok(h.includes('data-testid="tee-ask-auto"') && />Let the game play it</.test(h), 'let the game play it');
});

test('event card: Start round with the tee time it runs the clock to; none while the event is not on or cannot be played', () => {
  assert.ok(/Start round · tee time 11:20/.test(event(evView())) && !/disabled=""/.test(event(evView())), 'today: Start round and the tee time, on');
  assert.ok(/>Start round</.test(event(evView({ tee: null }))), 'no tee time known: just Start round');
  const blocked = event(evView({ playWhy: 'Finish the round you are playing first' }));
  assert.ok(/disabled=""/.test(blocked) && /Finish the round you are playing first/.test(blocked), 'disabled with the reason');
  assert.ok(!/Start round/.test(event(evView({ phase: 'soon', tee: null }))), 'not today: no Start round');
});

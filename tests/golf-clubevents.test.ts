// T246 (#708): your Club Championship and the Mayor's Cup (golf/clubevents.ts): the dates in the season, the announcement, qualifying by handicap, entry,
// the field from the day's sheet, the board, the result and the prize, the title kept in your profile, the round's competition mode (no mulligans, no
// gimmies) and the saves (round trip; an older save unchanged).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLUB_MAX_HCP, announceDue, enter, entryWhy, eventBoard, eventDay, eventDue, eventOfMode, eventResult, eventYear, fieldIds, freshEvents, isEntered,
  normalizeEvents, resultLine, seasonMonthOf, withTitle, MODE_OF, type EventDay,
} from '../src/game/golf/clubevents';
import { handicapOf, normalizePlayer, playerCardView, startProfile, START_SKILLS } from '../src/game/golf/player';
import { COMPETITION_RULES, canGimme, isCompetition, mulligansLeft, normalizeYourRound, startRound, type YourRound } from '../src/game/golf/play/yours';
import { normalizeGolfSave } from '../src/game/golf/mode';
import type { CourseView, Lie, PlayHole } from '../src/game/golf/play/types';

test('the dates: the Mayor\'s Cup in October, the Club Championship in May, in the season\'s order', () => {
  assert.equal(seasonMonthOf('mayor'), 1); // (the season starts in September)
  assert.equal(seasonMonthOf('club'), 8);
  assert.equal(eventYear('mayor', 0), 1984); // season 0 runs Sep 1984 - Aug 1985
  assert.equal(eventYear('club', 0), 1985);
  const s = freshEvents();
  assert.equal(eventDue(s, 0, 0.5), null);
  assert.equal(eventDue(s, 0, 1), 'mayor');
  assert.equal(eventDue(s, 0, 8.2), 'mayor'); // (not held yet: it comes first)
  s.held.mayor = 0;
  assert.equal(eventDue(s, 0, 7.9), null);
  assert.equal(eventDue(s, 0, 8), 'club');
  s.held.club = 0;
  assert.equal(eventDue(s, 0, 11.9), null);
  assert.equal(eventDue(s, 1, 1.2), 'mayor'); // next season again
});

test('the announcement: a month before, once a season', () => {
  const s = freshEvents();
  assert.equal(announceDue(s, 0, 0), 'mayor');
  s.announced.mayor = 0;
  assert.equal(announceDue(s, 0, 0.5), null);
  assert.equal(announceDue(s, 0, 7), 'club');
  s.announced.club = 0;
  assert.equal(announceDue(s, 0, 7.5), null);
});

test('qualifying: the Club Championship takes a handicap of 18.0 or less, the Mayor\'s Cup is open; entry', () => {
  assert.equal(CLUB_MAX_HCP, 18);
  const start = handicapOf(START_SKILLS);
  assert.ok(start > CLUB_MAX_HCP, `you start just outside (${start})`);
  assert.match(entryWhy('club', start)!, /18\.0 or less/);
  assert.equal(entryWhy('club', 18), null);
  assert.equal(entryWhy('club', 12.4), null);
  assert.equal(entryWhy('mayor', 36), null);
  const s = freshEvents();
  assert.equal(enter(s, 'club', 2, start), s); // refused: unchanged
  const e = enter(s, 'club', 2, 17.9);
  assert.ok(isEntered(e, 'club', 2));
  assert.ok(!isEntered(e, 'club', 3));
  assert.ok(!isEntered(s, 'club', 2)); // (the save passed in is not changed)
});

const roster = { groups: [{ tee: 420, players: [0, 1] }, { tee: 430, players: [2, 3, 4] }, { tee: 440, players: [5] }], info: [{ member: true }, { member: false }, { member: true }] } as never;
const plan = {
  golfers: ['Ann Lee', 'Bob Day', 'Cy Fox', 'Di Ray', 'Ed Moss', 'Flo Kent'].map((name, id) => ({ id, name })),
  strokes: [[4, 5], [4, 4], [3, 4], [6, 6], [5, 5], [4, 5]],
} as never;
const view2 = { holes: [{ par: 4 }, { par: 4 }] } as never;

test('the field: the members on the sheet (the Club Championship), everyone (the Mayor\'s Cup); the day keeps their totals', () => {
  assert.deepEqual(fieldIds(roster, 'club'), [0, 1, 5]);
  assert.deepEqual(fieldIds(roster, 'mayor'), [0, 1, 2, 3, 4, 5]);
  const d = eventDay('club', 3, 40, plan, view2, roster);
  assert.equal(d.par, 8); assert.equal(d.holes, 2);
  assert.deepEqual(d.field, [{ name: 'Ann Lee', strokes: 9 }, { name: 'Bob Day', strokes: 8 }, { name: 'Flo Kent', strokes: 9 }]);
});

test('the result: your place, the champion, ties shared, no return short of every hole, the prize to a winner only', () => {
  const d: EventDay = eventDay('club', 3, 40, plan, view2, roster);
  const none = eventResult(d, null);
  assert.equal(none.pos, null); assert.equal(none.champion, 'Bob Day'); assert.equal(none.champToPar, 0); assert.equal(none.won, false); assert.equal(none.money, 0);
  const third = eventResult(d, { name: 'Pat', strokes: 10, thru: 2 });
  assert.equal(third.pos, 4); assert.equal(third.of, 4); assert.equal(third.toPar, 2); assert.equal(third.won, false);
  assert.match(resultLine(third), /You finished 4th of 4 at \+2 · Bob Day wins at E/);
  const win = eventResult(d, { name: 'Pat', strokes: 7, thru: 2 });
  assert.equal(win.pos, 1); assert.ok(win.won); assert.equal(win.rep, 1); assert.equal(win.money, 500); assert.equal(win.champion, 'Pat');
  assert.match(resultLine(win), /You win the Club Championship at −1/);
  const tie = eventResult(d, { name: 'Pat', strokes: 8, thru: 2 });
  assert.ok(tie.won); assert.equal(tie.champion, 'Bob Day and Pat');
  const quit = eventResult(d, { name: 'Pat', strokes: 3, thru: 1 });
  assert.equal(quit.pos, null); assert.equal(quit.won, false);
  const cup = eventResult(eventDay('mayor', 3, 41, plan, view2, roster), { name: 'Pat', strokes: 6, thru: 2 });
  assert.ok(cup.won); assert.equal(cup.money, 1000); assert.equal(cup.rep, 2); assert.equal(cup.year, eventYear('mayor', 3));
});

test('the board: by to par, shared places, your row below the top, F when done', () => {
  const rows = eventBoard([
    { key: 0, name: 'Ann Lee', toPar: 1, thru: 9, you: false },
    { key: 1, name: 'Bob Day', toPar: -1, thru: 5, you: false },
    { key: 2, name: 'Cy Fox', toPar: 1, thru: 4, you: false },
    { key: 3, name: 'Di Ray', toPar: 0, thru: 0, you: false }, // (not started: left off)
    { key: -1, name: 'Pat Moon', toPar: 4, thru: 3, you: true },
  ], 9, 2);
  assert.deepEqual(rows.map(r => [r.pos, r.name, r.toPar, r.thru, r.owner]), [['1', 'B. Day', '−1', '5', false], ['T2', 'A. Lee', '+1', 'F', false], ['4', 'Pat Moon', '+4', '3', true]]);
});

test('the title: kept in your profile, shown on your card, saved', () => {
  const d = eventDay('mayor', 2, 30, plan, view2, roster), r = eventResult(d, { name: 'Pat', strokes: 7, thru: 2 });
  const p0 = startProfile();
  assert.equal(withTitle(p0, eventResult(d, null), 2), p0); // (no win: nothing)
  const p = withTitle(p0, r, 2);
  assert.equal(p0.titles, undefined);
  assert.equal(p.titles!.length, 1);
  assert.deepEqual(p.titles![0], { id: 'mayor', name: "Mayor's Cup", year: eventYear('mayor', 2), strokes: 7, toPar: -1, holes: 2 });
  const back = normalizePlayer(JSON.parse(JSON.stringify(p)))!;
  assert.deepEqual(back.titles, p.titles);
  assert.match(playerCardView(back, { k: 'none', next: null, why: null }).titles[0]!, /^Mayor's Cup 1986 · 7 \(−1\) over 2$/);
  assert.equal(normalizePlayer(JSON.parse(JSON.stringify(p0)))!.titles, undefined); // (an older profile: none)
});

const holes: PlayHole[] = Array.from({ length: 9 }, (_, h) => { const tee = { x: 0, y: 10 + 30 * h }, pin = { x: 150, y: tee.y }; return { n: h + 1, par: 4, tee, pin, line: [tee, pin] }; });
const view: CourseView = { holes, lieAt: (): Lie => 'fairway' };

test('your round in an event: the shared mode flag, competition rules (no mulligans, no gimmies), saved', () => {
  const r0 = startRound(view, holes.map((_, i) => i), 5, { ...COMPETITION_RULES })!;
  const r: YourRound = { ...r0, mode: MODE_OF.club, rules: { ...COMPETITION_RULES } };
  assert.ok(isCompetition(r)); assert.ok(!isCompetition(r0)); assert.ok(!isCompetition({ mode: 'casual' }));
  assert.equal(eventOfMode(r.mode), 'club'); assert.equal(eventOfMode('mayors-cup'), 'mayor'); assert.equal(eventOfMode('match'), null);
  assert.equal(mulligansLeft({ ...r, undo: r0 }), 0);
  assert.equal(canGimme(view, { ...r, ball: { x: holes[0]!.pin.x + 0.1, y: holes[0]!.pin.y }, lie: 'green' }), false);
  const back = normalizeYourRound(JSON.parse(JSON.stringify(r)))!;
  assert.equal(back.mode, 'championship'); assert.deepEqual(back.rules, COMPETITION_RULES);
  // a competition saved with other settings still plays under the competition's
  const hacked = normalizeYourRound(JSON.parse(JSON.stringify({ ...r, rules: { mull: 'any', gimme: 'm2' } })))!;
  assert.deepEqual(hacked.rules, COMPETITION_RULES);
  assert.equal(normalizeYourRound(JSON.parse(JSON.stringify(r0)))!.mode, undefined);
});

test('the save: the events round trip; an older save has none', () => {
  const d = eventDay('club', 1, 12, plan, view2, roster);
  const s = { ...freshEvents(), held: { club: 1, mayor: 1 }, entered: { club: 1 }, announced: { mayor: 1, club: 1 }, today: { ...d, done: true }, last: eventResult(d, { name: 'Pat', strokes: 9, thru: 2 }) };
  assert.deepEqual(normalizeEvents(JSON.parse(JSON.stringify(s))), s);
  assert.deepEqual(normalizeEvents(undefined), freshEvents());
  assert.deepEqual(normalizeEvents({ held: { club: 'x' }, today: { id: 'nope' } }), freshEvents());
  const g = { v: 1, tier: 1, rep: 10, town: { x: 0, y: 0 }, course: [0, 0, 1, 1], clubhouse: { x: 0, y: 0 } } as never;
  assert.equal(normalizeGolfSave(g)!.clubEvents, undefined);
  assert.deepEqual(normalizeGolfSave({ ...(g as object), clubEvents: s } as never)!.clubEvents, s);
});

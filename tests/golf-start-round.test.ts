// T350 (#993): starting your own round (golf/startround.ts): the clock runs to the tee time and then begins the round, the pace of play on the course, a booking is a tee time to play yourself
// (the model plays it only with `auto`), the game asks when the tee time has passed with no round under way, and a booking's `auto` survives the save and a practice session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FF_SPEED, bookingLine, bookingStep, ffSpeed, planStep, roundSpeed } from '../src/game/golf/startround';
import { SPEEDS, WATCH_SPEED } from '../src/game/golf/watch';
import { bookRound, clock, normalizePlayer, rebook, startProfile } from '../src/game/golf/player';

test('start round: the clock runs on to the tee time, begins the round when it has come, and drops the plan when its day is over', () => {
  const plan = { day: 4, min: 680 };
  assert.equal(planStep(plan, 4, 600), 'forward', 'early: keep running');
  assert.equal(planStep(plan, 4, 679.9), 'forward');
  assert.equal(planStep(plan, 4, 680), 'start', 'at the tee time');
  assert.equal(planStep(plan, 4, 700), 'start', 'past it (a Start pressed late): start now');
  assert.equal(planStep(plan, 5, 10), 'drop', 'the next day: the plan is over');
  assert.equal(planStep(plan, 3, 900), 'forward', 'an earlier day (the clock never goes back, but never start early)');
  assert.ok(SPEEDS.includes(FF_SPEED) && FF_SPEED === Math.max(...SPEEDS), 'the fast-forward is the speed bar’s fastest');
});

test('pace of play: on the course the clock runs no faster than the watching speed; a pause and slower speeds go through; off the course as asked', () => {
  for (const k of SPEEDS) {
    assert.equal(roundSpeed(k, false), k, `off the course ${k}`);
    assert.equal(roundSpeed(k, true), Math.min(k, WATCH_SPEED), `on the course ${k}`);
  }
  assert.equal(roundSpeed(0, true), 0, 'a pause');
  assert.equal(roundSpeed(WATCH_SPEED / 2, true), WATCH_SPEED / 2, 'slower than the pace of play');
  assert.equal(roundSpeed(20, true), WATCH_SPEED);
});

test('booking: a tee time ahead waits, one that has come is due (the game asks), the game’s own plays, and a day gone lapses', () => {
  const b = { day: 3, tee: 700 };
  assert.equal(bookingStep(null, 3, 600), 'none');
  assert.equal(bookingStep(b, 3, 699), 'wait');
  assert.equal(bookingStep(b, 3, 700), 'due');
  assert.equal(bookingStep(b, 3, 1300), 'due', 'late in the day: still due, never played for you');
  assert.equal(bookingStep(b, 4, 20), 'over', 'the day is over');
  assert.equal(bookingStep(b, 2, 900), 'wait', 'booked for a later day');
  assert.equal(bookingStep({ ...b, auto: true }, 3, 700), 'auto', 'the game plays it, because you said so');
  assert.equal(bookingStep({ ...b, auto: true }, 3, 100), 'auto');
  assert.equal(bookingStep({ ...b, auto: true }, 5, 100), 'over');
});

test('the first-tee card’s words for a booking', () => {
  assert.equal(bookingLine({ tee: 680 }, clock), 'Your tee time: 11:20');
  assert.equal(bookingLine({ tee: 680, late: true }, clock), 'Your tee time has passed: 11:20');
  assert.equal(bookingLine({ tee: 680, auto: true }, clock), 'The game plays your round: 11:20');
});

test('the profile: a new booking is a tee time to play yourself (no auto); auto is saved and read back, junk is not; a practice session keeps it', () => {
  const p = startProfile('m'), booked = bookRound(p, 7, 700);
  assert.equal(booked.booked!.auto, undefined, 'booking does not ask the game to play it');
  const auto = { ...booked, booked: { ...booked.booked!, auto: true as const } };
  const back = normalizePlayer(JSON.parse(JSON.stringify(auto)))!;
  assert.equal(back.booked?.auto, true, 'saved and read back');
  const junk = normalizePlayer(JSON.parse(JSON.stringify({ ...booked, booked: { ...booked.booked!, auto: 'yes' } })))!;
  assert.equal(junk.booked?.auto, undefined, 'only true counts');
  const old = normalizePlayer(JSON.parse(JSON.stringify(booked)))!;
  assert.equal(old.booked?.auto, undefined, 'a save from before: a tee time to play yourself');
  assert.equal(rebook(auto, 7, 300).booked?.auto, true, 'after a session the game’s round stays the game’s');
  assert.equal(rebook(booked, 7, 300).booked?.auto, undefined, 'and a tee time of yours stays yours');
});

test('start round: the fast-forward slows as it nears the tee time (it arrives at 1x), every step a speed the bar has', () => {
  assert.equal(ffSpeed(Infinity), FF_SPEED); assert.equal(ffSpeed(300), FF_SPEED); assert.equal(ffSpeed(81), FF_SPEED);
  assert.equal(ffSpeed(80), 8); assert.equal(ffSpeed(26), 8); assert.equal(ffSpeed(25), 4); assert.equal(ffSpeed(9), 4);
  assert.equal(ffSpeed(8), 1); assert.equal(ffSpeed(0), 1); assert.equal(ffSpeed(-5), 1);
  let last = Infinity;
  for (const left of [500, 100, 79, 40, 24, 9, 7, 1, 0]) { const k = ffSpeed(left); assert.ok(SPEEDS.includes(k), `${left}: ${k} is a speed of the bar`); assert.ok(k <= last, 'never faster as it nears'); last = k; }
});

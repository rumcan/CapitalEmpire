import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMultiDayTournament } from '../src/game/golf/multiday';

test('tier 1 tournament resolves single live day with 0 resolved days', () => {
  const res = resolveMultiDayTournament({
    tier: 1,
    liveArrived: 450,
    liveTents: 1200,
    ticketPrice: 0,
    sponsorIncome: 0,
    purse: 2000,
  });
  assert.equal(res.totalDays, 1);
  assert.equal(res.liveDays, 1);
  assert.equal(res.resolvedDays, 0);
  assert.equal(res.statusLine, '1 day live');
  assert.equal(res.totalSpectators, 450);
  assert.equal(res.totalTickets, 0);
  assert.equal(res.totalTents, 1200);
  assert.equal(res.days.length, 1);
  assert.equal(res.days[0]!.isLive, true);
});

test('tier 2 tournament resolves Day 1 live and Day 2 resolved with dayShare ratio', () => {
  const res = resolveMultiDayTournament({
    tier: 2,
    liveArrived: 2000,
    liveTents: 5000,
    ticketPrice: 5,
    sponsorIncome: 10000,
    purse: 10000,
  });
  assert.equal(res.totalDays, 2);
  assert.equal(res.liveDays, 1);
  assert.equal(res.resolvedDays, 1);
  assert.equal(res.statusLine, 'Day 1 live, 1 resolved');
  assert.equal(res.days.length, 2);

  assert.equal(res.days[0]!.spectators, 2000);
  assert.equal(res.days[0]!.tickets, 10000);
  assert.equal(res.days[1]!.spectators, Math.round(2000 * (1.0 / 0.85)));
  assert.equal(res.totalTickets, res.days[0]!.tickets + res.days[1]!.tickets);
  assert.equal(res.totalSponsors, 10000);
});

test('tier 3 tournament produces Day 1 live, 2 resolved status and scales attendance', () => {
  const res = resolveMultiDayTournament({
    tier: 3,
    liveArrived: 5000,
    liveTents: 15000,
    ticketPrice: 10,
    sponsorIncome: 50000,
    purse: 60000,
  });
  assert.equal(res.totalDays, 3);
  assert.equal(res.liveDays, 1);
  assert.equal(res.resolvedDays, 2);
  assert.equal(res.statusLine, 'Day 1 live, 2 resolved');
  assert.equal(res.days.length, 3);

  assert.equal(res.days[0]!.spectators, 5000);
  assert.equal(res.days[1]!.spectators, Math.round(5000 * 0.85 / 0.7));
  assert.equal(res.days[2]!.spectators, Math.round(5000 * 1.0 / 0.7));
  assert.equal(res.totalSpectators, 5000 + Math.round(5000 * 0.85 / 0.7) + Math.round(5000 * 1.0 / 0.7));
});

test('evaluates daily tent revenue for each resolved day via eventtool structures', () => {
  const structures = [
    { id: 1, typeId: 'foodTent', x: 0, y: 0, mode: 'rent' as const },
    { id: 2, typeId: 'merchTent', x: 10, y: 10, mode: 'buy' as const },
  ];
  const res = resolveMultiDayTournament({
    tier: 3,
    liveArrived: 4000,
    ticketPrice: 10,
    sponsorIncome: 40000,
    purse: 60000,
    structures,
    holes: [],
  });
  assert.ok(res.days[0]!.tents > 0, 'day 1 has tent takings');
  assert.ok(res.days[1]!.tents >= res.days[0]!.tents, 'day 2 takings scale with larger crowd');
  assert.ok(res.totalTents > res.days[0]!.tents * 2, 'total tents sums across all days');
});

test('aggregates total tickets, tents, sponsors and net commercial profit', () => {
  const res = resolveMultiDayTournament({
    tier: 4,
    liveArrived: 15000,
    liveTents: 60000,
    ticketPrice: 20,
    sponsorIncome: 200000,
    tvIncome: 300000,
    purse: 400000,
  });
  assert.equal(res.totalDays, 4);
  assert.equal(res.resolvedDays, 3);
  assert.equal(res.statusLine, 'Day 1 live, 3 resolved');
  assert.equal(res.tvIncome, 300000);
  assert.equal(res.purse, 400000);
  assert.equal(res.totalRevenue, res.totalTickets + res.totalTents + res.totalSponsors + res.tvIncome);
  assert.equal(res.netCommercial, res.totalRevenue - res.purse);
});

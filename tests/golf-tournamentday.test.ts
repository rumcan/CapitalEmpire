// Tests for the tournament day scorer (golf/tournamentday.ts): gate queues, onTime/late/missed, exit P95, daySatisfaction, money lines, and reputationAfter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daySatisfaction, reputationAfter } from '../src/game/golf/tour';
import { percentile95, scoreGateFlow, scoreTournamentDay } from '../src/game/golf/tournamentday';

test('percentile95 and scoreGateFlow classify on-time vs late arrivals from lane capacity and traffic delay', () => {
  assert.equal(percentile95([]), 30);
  assert.equal(percentile95([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]), 100);
  // 4 lanes admit 40/min; 30 arrivals/min wait < 1 min -> all on time
  const smooth = scoreGateFlow({ lanes: 4, arrivalsPerMinute: [30, 30, 30], trafficDelayMin: 15 }, false);
  assert.equal(smooth.onTime, 90);
  assert.equal(smooth.late, 0);
  // 1 lane admits 10/min; 200 arrivals in minute 0 with 30m traffic delay wait 20 min (30+20 = 50 > 45) -> late
  const jammed = scoreGateFlow({ lanes: 1, arrivalsPerMinute: [200], trafficDelayMin: 30 }, false);
  assert.equal(jammed.onTime, 0);
  assert.equal(jammed.late, 200);
  // Express gates (+50% = 15/min) reduces wait to 13.33m (30+13.33 = 43.33 <= 45) -> on time!
  const express = scoreGateFlow({ lanes: 1, arrivalsPerMinute: [200], trafficDelayMin: 30 }, true);
  assert.equal(express.onTime, 200);
});

test('scoreTournamentDay computes DayFacts, daySatisfaction, reputationAfter, and itemized money lines', () => {
  const res = scoreTournamentDay({
    tier: 2,
    reputation: 50,
    gates: [{ lanes: 4, arrivalsPerMinute: Array(60).fill(25), trafficDelayMin: 12 }], // 1,500 admitted on time
    carparks: [
      { carsParked: 400, carsTurnedAway: 10, feePerCar: 5, exitTimesMin: [20, 25, 28, 30] },
      { carsParked: 200, carsTurnedAway: 0, feePerCar: 5, exitTimesMin: [22, 24, 29, 32] },
    ],
    trafficMissed: 25,
    grandstandSeats: 400,
    ropeMetres: 300,
    tents: 8500,
    rent: 2000,
    upkeep: 500,
  });
  assert.equal(res.admitted, 1500);
  assert.equal(res.facts.onTime, 1500);
  assert.equal(res.facts.late, 0);
  assert.equal(res.facts.missed, 50); // 25 traffic + 10 * 2.5 carpark turned away
  assert.equal(res.facts.exitP95Min, 32);
  assert.equal(res.satisfaction, daySatisfaction(res.facts));
  assert.equal(res.reputationAfter, reputationAfter(50, res.satisfaction));
  assert.ok(res.reputationAfter > 50);
  // Tier 2 ticket is $5 -> 1500 * 5 = $7500; parking = 600 * 5 = $3000; refunds = 50 * 5 = $250; purse = $10000
  assert.equal(res.money.tickets, 7500);
  assert.equal(res.money.parking, 3000);
  assert.equal(res.money.tents, 8500);
  assert.equal(res.money.refunds, 250);
  assert.equal(res.money.purse, 10000);
  assert.equal(res.money.net, 7500 + 3000 + 8500 - 250 - 10000 - 2000 - res.money.staff - 500);
});

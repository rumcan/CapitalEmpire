// Unit tests for the late and missed reasons and the Traffic line (P03 / T060a): npm test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  lateReasons,
  trafficSatisfaction,
  tentSpendFactor,
  TRAFFIC_FULL,
  TRAFFIC_ZERO,
  TENT_SPEND_FLOOR,
} from '../src/game/golf/latereasons';
import type { LateFacts } from '../src/game/golf/latereasons';

/** facts with no fans late or missed and no junctions */
const NONE: LateFacts = { onRoadAtFirstTee: 0, turnedAway: 0, stranded: 0, lost: 0, lateAtGate: 0, worstJunctions: [] };

describe('late reasons and the Traffic line (T060a)', () => {
  it('1. all counts 0 gives no rows', () => {
    assert.deepEqual(lateReasons(NONE), []);
  });

  it('2. rows sort by fans, most first, ties in key order; the onRoad fix names the first three junctions', () => {
    const rows = lateReasons({ onRoadAtFirstTee: 40, turnedAway: 90, stranded: 0, lost: 3, lateAtGate: 40, worstJunctions: ['Main & 3rd', 'Oak & Hill', 'Bridge Rd', 'Elm & 1st'] });
    assert.deepEqual(rows.map(r => r.key), ['turnedAway', 'onRoad', 'lateAtGate', 'lost']);
    assert.deepEqual(rows.map(r => r.fans), [90, 40, 40, 3]);
    assert.equal(rows[0].label, 'Turned away (car parks full)');
    assert.equal(rows[0].fix, 'Add bays or park and ride');
    assert.equal(rows[1].label, 'Still on the road at first tee');
    assert.equal(rows[1].fix, 'Upgrade or police these junctions: Main & 3rd, Oak & Hill, Bridge Rd');
    assert.equal(rows[2].fix, 'More gate lanes');
    assert.equal(rows[3].fix, 'Check for dead ends and missing turns');
  });

  it('3. the onRoad fix with no junctions is the generic one', () => {
    const rows = lateReasons({ ...NONE, onRoadAtFirstTee: 5 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].fix, 'Upgrade or police the busiest junctions');
  });

  it('4. fractional, negative and NaN counts: 2.9 gives 2 fans; -5 and NaN drop their rows', () => {
    const rows = lateReasons({ onRoadAtFirstTee: 2.9, turnedAway: -5, stranded: NaN, lost: 0, lateAtGate: 0.5, worstJunctions: [] });
    assert.deepEqual(rows.map(r => [r.key, r.fans]), [['onRoad', 2]]);
    assert.equal(rows[0].fix, 'Upgrade or police the busiest junctions');
    const stranded = lateReasons({ ...NONE, stranded: 7 });
    assert.equal(stranded[0].label, 'Stranded (no road to the course)');
    assert.equal(stranded[0].fix, 'Connect their homes to the course roads');
  });

  it('5. trafficSatisfaction: full marks to TRAFFIC_FULL, none from TRAFFIC_ZERO, linear between, 100 for bad inputs', () => {
    assert.equal(trafficSatisfaction(100, 100), 100);
    assert.equal(trafficSatisfaction(120, 100), 100);
    assert.equal(trafficSatisfaction(300, 100), 0);
    assert.equal(trafficSatisfaction(400, 100), 0);
    assert.equal(trafficSatisfaction(210, 100), 50);
    assert.equal(trafficSatisfaction(100, 0), 100);
    assert.equal(trafficSatisfaction(NaN, 100), 100);
    // the boundaries are the constants themselves
    assert.equal(trafficSatisfaction(TRAFFIC_FULL * 100, 100), 100);
    assert.equal(trafficSatisfaction(TRAFFIC_ZERO * 100, 100), 0);
  });

  it('6. tentSpendFactor: 1 at full Traffic marks, TENT_SPEND_FLOOR at none, clamped, NaN counts as full', () => {
    assert.equal(tentSpendFactor(100), 1);
    assert.equal(tentSpendFactor(0), 0.5);
    assert.equal(tentSpendFactor(0), TENT_SPEND_FLOOR);
    assert.equal(tentSpendFactor(50), 0.75);
    assert.equal(tentSpendFactor(150), 1);
    assert.equal(tentSpendFactor(-20), 0.5);
    assert.equal(tentSpendFactor(NaN), 1);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { structureGhost, markerGhost, tollGhostLabel, busGhostLabel, costLabel } from '../src/game/ext/event-ghost';

describe('event ghost previews (T019)', () => {
  const rect: [number, number, number, number] = [10, 20, 6, 4];

  it('a structure that passes the check and is affordable is a valid ghost with its name, mode and price', () => {
    const g = structureGhost(rect, { ok: true, cost: 1200 }, 5000, 'Gate', 'rent');
    assert.equal(g.status, 'valid');
    assert.equal(g.bad, false);
    assert.equal(g.label, `Gate (rent) · $${(1200).toLocaleString()}`);
    assert.deepEqual(g.rects?.[0].rect, { x: 10, y: 20, w: 6, h: 4 });
  });

  it('a refused structure is invalid with the check reason', () => {
    const g = structureGhost(rect, { ok: false, cost: 1200, reason: 'Must be on owned land' }, 5000, 'Gate', 'rent');
    assert.equal(g.status, 'invalid');
    assert.equal(g.bad, true);
    assert.equal(g.label, 'Must be on owned land');
  });

  it('an unaffordable structure is invalid with the money label', () => {
    const g = structureGhost(rect, { ok: true, cost: 6000 }, 5000, 'Grandstand', 'buy');
    assert.equal(g.status, 'invalid');
    assert.equal(g.label, `Not enough money: $${(6000).toLocaleString()}`);
  });

  it('a refused structure with no reason falls back to the generic refusal', () => {
    const g = structureGhost(rect, { ok: false, cost: 0 }, 5000, 'Tent', 'rent');
    assert.equal(g.label, 'Cannot place structure here');
  });

  it('a valid pin marker is a valid 1.2-tile ring labelled with its hole', () => {
    const g = markerGhost(100, 200, 3, 'pin', { ok: true });
    assert.equal(g.status, 'valid');
    assert.equal(g.label, 'Hole 3 pin');
    assert.deepEqual(g.rings, [{ cx: 100, cy: 200, outerR: 1.2 }]);
  });

  it('a refused tee marker is an invalid 1.6-tile ring with the reason', () => {
    const g = markerGhost(100, 200, 3, 'back', { ok: false, reason: 'Tee markers must be on a tee' });
    assert.equal(g.status, 'invalid');
    assert.equal(g.bad, true);
    assert.equal(g.label, 'Tee markers must be on a tee');
    assert.equal(g.rings?.[0].outerR, 1.6);
  });

  it('a valid middle tee is labelled as a middle tee', () => {
    const g = markerGhost(100, 200, 3, 'middle', { ok: true });
    assert.equal(g.label, 'Hole 3 middle tee');
  });
});

describe('toll and bus ghost labels (T021)', () => {
  it('a toll plaza that is affordable is valid with its booths and cost', () => {
    const g = tollGhostLabel('', 3, 4500, 10000);
    assert.equal(g.status, 'valid');
    assert.equal(g.label, `3 booths · $${(4500).toLocaleString()}`);
  });

  it('a toll plaza short of the money is invalid with the money label', () => {
    const g = tollGhostLabel('', 3, 4500, 1000);
    assert.equal(g.status, 'invalid');
    assert.equal(g.label, `Not enough money: $${(4500).toLocaleString()}`);
  });

  it('a refused toll plaza is invalid with the reason', () => {
    const g = tollGhostLabel('Too close to a junction', 3, 4500, 10000);
    assert.equal(g.label, 'Too close to a junction');
    assert.equal(g.bad, true);
  });

  it('before the first stop, a lot stop on the town car park is labelled as such', () => {
    const g = busGhostLabel('', false, 0, 0, true, 0);
    assert.equal(g.label, 'Lot stop · town car park');
    assert.equal(g.status, 'valid');
  });

  it('before the first stop, a lot stop on a car park is labelled with its number', () => {
    const g = busGhostLabel('', false, 0, 0, false, 7);
    assert.equal(g.label, 'Lot stop · car park #7');
  });

  it('after the first stop, a free route with the starting kit is labelled as free', () => {
    const g = busGhostLabel('', true, 0, 0, false, 7);
    assert.equal(g.label, 'Bus route · free (the starting kit)');
  });

  it('after the first stop, a paid route shows its cost, and is invalid when short of the money', () => {
    const ok = busGhostLabel('', true, 2000, 5000, false, 7);
    assert.equal(ok.label, `Bus route · $${(2000).toLocaleString()}`);
    assert.equal(ok.status, 'valid');
    const short = busGhostLabel('', true, 2000, 100, false, 7);
    assert.equal(short.status, 'invalid');
  });
});

describe('cost labels (T022)', () => {
  it('a route that costs and is affordable is valid with its length, class and price', () => {
    const g = costLabel('', 1500, 5000, '120 m of street');
    assert.equal(g.status, 'valid');
    assert.equal(g.label, `120 m of street · $${(1500).toLocaleString()}`);
  });

  it('a run that refunds is valid with its refund, not invalid', () => {
    const g = costLabel('', -800, 0, 'Downgrade to gravel');
    assert.equal(g.status, 'valid');
    assert.equal(g.bad, false);
    assert.equal(g.label, `Downgrade to gravel · refund $${(800).toLocaleString()}`);
  });

  it('a cost short of the money is invalid with the money label', () => {
    const g = costLabel('', 9000, 100, 'Upgrade to road');
    assert.equal(g.status, 'invalid');
    assert.equal(g.label, `Not enough money: $${(9000).toLocaleString()}`);
  });

  it('a refused run shows its reason in red, whatever the price', () => {
    const g = costLabel('No room to widen: another road is too close', 900, 5000, 'Upgrade to road');
    assert.equal(g.label, 'No room to widen: another road is too close');
    assert.equal(g.bad, true);
  });

  it('a zero-cost run is labelled with its summary alone', () => {
    const g = costLabel('', 0, 0, 'x');
    assert.equal(g.label, 'x');
    assert.equal(g.status, 'valid');
  });
});

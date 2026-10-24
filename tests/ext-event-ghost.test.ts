import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { structureGhost, markerGhost } from '../src/game/ext/event-ghost';

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

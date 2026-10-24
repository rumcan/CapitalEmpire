// Unit tests for the gallery draw and the fans' moves (P02 / T051a): npm test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURED_BUMP,
  LAST_GREEN_FROM,
  LAST_GREEN_PM,
  RELOCATE_EVERY,
  RELOCATE_SHARE,
  spotDraw,
  fairShares,
  relocate,
} from '../src/game/golf/gallerydraw';
import type { GallerySpot, GalleryKind } from '../src/game/golf/galleries';
import { featuredHole } from '../src/game/golf/daytimeline';
import { FIRST_TEE, PLAY_END } from '../src/game/golf/calendar';
import { mulberry } from '../src/game/iso';

/** a test spot at the origin */
function spot(kind: GalleryKind, hole: number, weight: number, cap = 200): GallerySpot {
  return { x: 0, y: 0, kind, weight, cap, hole };
}

describe('gallery draw and moves (T051a)', () => {
  it('1. a stand and a tent draw exactly their weight at every minute', () => {
    for (const m of [300, 600, 1000, 1200]) {
      assert.equal(spotDraw(spot('stand', 0, 4), m, 9), 4, `stand at ${m}`);
      assert.equal(spotDraw(spot('tent', 0, 1), m, 9), 1, `tent at ${m}`);
    }
    // a stand is never featured, even on the featured hole's number
    assert.equal(spotDraw(spot('stand', 1, 4), 480, 9), 4);
  });

  it('2. the featured group at 9 holes (minute 450, hole 1) multiplies hole 1 tee and green by 1 + FEATURED_BUMP', () => {
    assert.equal(featuredHole(450, 9), 1);
    assert.equal(spotDraw(spot('tee', 1, 1.5), 450, 9), 1.5 * (1 + FEATURED_BUMP));
    assert.equal(spotDraw(spot('green', 1, 3), 450, 9), 3 * (1 + FEATURED_BUMP));
    assert.equal(spotDraw(spot('tee', 2, 1.5), 450, 9), 1.5);
    assert.equal(spotDraw(spot('green', 2, 3), 450, 9), 3);
  });

  it('3. the last green (hole 9, weight 5) draws LAST_GREEN_PM times more from 14:30 to PLAY_END, stacking with the featured bump', () => {
    const g = spot('green', 9, 5);
    const featured = (m: number) => (featuredHole(m, 9) === 9 ? 1 + FEATURED_BUMP : 1);
    assert.equal(spotDraw(g, 900, 9), 5 * LAST_GREEN_PM * featured(900));
    // the boundary: doubled from LAST_GREEN_FROM, not a minute before
    assert.equal(spotDraw(g, LAST_GREEN_FROM, 9), 5 * LAST_GREEN_PM * featured(LAST_GREEN_FROM));
    assert.equal(spotDraw(g, LAST_GREEN_FROM - 1, 9), 5 * featured(LAST_GREEN_FROM - 1));
    assert.equal(spotDraw(g, 860, 9), 5 * featured(860));
    assert.equal(spotDraw(g, PLAY_END, 9), 5 * featured(PLAY_END));
    // the featured group is on hole 9 at minute 1080, so both rules apply: 5 x LAST_GREEN_PM x (1 + FEATURED_BUMP)
    assert.equal(featuredHole(1080, 9), 9);
    assert.equal(spotDraw(g, 1080, 9), 5 * LAST_GREEN_PM * (1 + FEATURED_BUMP));
  });

  it('4. fair shares sum to the total, are all zero with no draw, and [] with no spots', () => {
    const spots = [spot('tee', 1, 1.5, 150), spot('green', 1, 3, 400), spot('stand', 0, 2, 160)];
    const shares = fairShares(spots, 480, 9, 100);
    const sum = shares.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 100) <= 1e-9, `sum ${sum}`);
    assert.deepEqual(fairShares(spots.map(s => ({ ...s, weight: 0 })), 480, 9, 100), [0, 0, 0]);
    assert.deepEqual(fairShares([], 480, 9, 100), []);
  });

  it('5. relocate does nothing off the 30-minute cycle, before the first tee, or from PLAY_END', () => {
    assert.notEqual(455 % RELOCATE_EVERY, 0);
    assert.ok(420 < FIRST_TEE);
    const spots = [spot('tee', 1, 1.5, 150), spot('green', 1, 3, 400), spot('stand', 0, 2, 160)];
    const fill = [100, 0, 0];
    assert.deepEqual(relocate(spots, fill, 455, 9), []);
    assert.deepEqual(relocate(spots, fill, 420, 9), []);
    assert.deepEqual(relocate(spots, fill, PLAY_END, 9), []);
  });

  it('6. one move at minute 480: 25 fans leave spot 0 for the spot with the most room', () => {
    const spots = [spot('tee', 1, 1.5, 150), spot('green', 1, 3, 400), spot('stand', 0, 2, 160)];
    const fill = [100, 0, 0];
    const want = fairShares(spots, 480, 9, 100);
    // the room at each other spot: the lower of its cap and its fair share, less what it holds (here 0)
    const room1 = Math.min(spots[1].cap, want[1]) - fill[1];
    const room2 = Math.min(spots[2].cap, want[2]) - fill[2];
    const to = room1 >= room2 ? 1 : 2;
    const moves = relocate(spots, fill, 480, 9);
    assert.equal(moves.length, 1);
    assert.deepEqual(moves[0], { from: 0, to, n: Math.floor(100 * RELOCATE_SHARE) });
    assert.equal(moves[0].n, 25);
    const cur = [...fill];
    cur[0] -= moves[0].n;
    cur[moves[0].to] += moves[0].n;
    assert.equal(cur[0] + cur[1] + cur[2], 100);
  });

  it('7. invariants over 50 seeded cases: moves are valid, no fill goes negative, the total is kept', () => {
    const rng = mulberry(7);
    const KINDS: GalleryKind[] = ['green', 'tee', 'stand', 'tent'];
    let moved = 0;
    for (let c = 0; c < 50; c++) {
      const holes = 1 + Math.floor(rng() * 9);
      const minute = 450 + 30 * Math.floor(rng() * 22);
      const spots: GallerySpot[] = [];
      const fill: number[] = [];
      for (let k = 0; k < 6; k++) {
        const kind = KINDS[Math.floor(rng() * 4)];
        // a tee or green sits on one of the course's holes; a stand or tent has no hole (0)
        const hole = kind === 'stand' || kind === 'tent' ? 0 : 1 + Math.floor(rng() * holes);
        const weight = rng() * 5;
        const cap = 50 + Math.floor(rng() * 451);
        spots.push({ x: 0, y: 0, kind, weight, cap, hole });
        fill.push(Math.floor(rng() * 301));
      }
      const before = fill.reduce((a, b) => a + b, 0);
      const cur = [...fill];
      for (const mv of relocate(spots, fill, minute, holes)) {
        const where = `case ${c} minute ${minute}`;
        assert.ok(mv.n >= 1, `${where}: n ${mv.n}`);
        assert.notEqual(mv.from, mv.to, where);
        assert.ok(mv.from >= 0 && mv.from < spots.length, `${where}: from ${mv.from}`);
        assert.ok(mv.to >= 0 && mv.to < spots.length, `${where}: to ${mv.to}`);
        cur[mv.from] -= mv.n;
        cur[mv.to] += mv.n;
        moved++;
        for (const v of cur) assert.ok(v >= 0, `${where}: negative fill ${v}`);
        assert.equal(cur.reduce((a, b) => a + b, 0), before, `${where}: total changed`);
      }
    }
    assert.ok(moved > 0, 'the seeded cases should produce at least one move');
  });
});

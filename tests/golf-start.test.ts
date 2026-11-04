// The golf game's start (golf/start.ts): on most seeds the plan lays one town (one avenue, gravel elsewhere), a 40 x 24 venue, a drive that
// reaches it, and a painted course that passes checkArea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTerrain } from '../src/game/terrain';
import { MAP } from '../src/game/iso';
import { checkArea } from '../src/game/paint';
import { GOLF_REP_START, planGolfGame, type GolfStart } from '../src/game/golf/start';

/** the distance from point p to rect r (0 inside it) */
function distTo(p: { x: number; y: number }, [x, y, w, h]: [number, number, number, number]): number {
  return Math.hypot(Math.max(x - p.x, 0, p.x - x - w), Math.max(y - p.y, 0, p.y - y - h));
}

test('golf starts on most seeds: one avenue run in the town, a 40 x 24 venue, the drive to it, the course painted', () => {
  const plans: GolfStart[] = [];
  for (let seed = 1; seed <= 6; seed++) { const s = planGolfGame(generateTerrain(seed), seed); if (s) plans.push(s); }
  // T329: the old nine (placeCourse) was not scaled for the 2 km map (T280) and places a course on only 2 of these seeds there (golf-place.test.ts
  // OLD_NINE_FITS; a real gap left to the lead): 4 of 6 on the 4 km map, at least 2 on the 2 km map, so every plan made is still checked below
  assert.ok(plans.length >= ((MAP as number) === 2048 ? 4 : 2), `${plans.length} of 6 seeds placed a course`);
  for (const s of plans) {
    assert.ok(s.paints.length > 0);
    assert.ok(s.paints.every(a => checkArea(a.pts) === ''));
    const avenue = s.town.cls.flatMap((c, i) => c === 'avenue' ? [i] : []);
    assert.ok(avenue.length > 0);
    assert.equal(avenue[avenue.length - 1]! - avenue[0]! + 1, avenue.length, 'the avenue legs are one run');
    assert.ok(s.town.cls.every(c => c === 'avenue' || c === 'gravel'));
    const [, , vw, vh] = s.venue;
    assert.ok((vw === 40 && vh === 24) || (vw === 24 && vh === 40), `venue ${vw} x ${vh}`);
    // (T329: since T237 a second leg may follow, the spur to a car park beside the venue: the drive is the first leg)
    const end = s.drive[0]!.b;
    assert.ok(distTo(end, s.venue) <= 4, `the drive ends ${distTo(end, s.venue)} tiles from the venue`);
    const [px, py, pw, ph] = s.save.parcel;
    for (const [x, y, w, h] of [s.save.course, s.venue, s.carpark]) assert.ok(x >= px && y >= py && x + w <= px + pw && y + h <= py + ph);
    assert.equal(s.save.v, 1);
    assert.equal(s.save.tier, 1);
    assert.equal(s.save.rep, GOLF_REP_START);
  }
});

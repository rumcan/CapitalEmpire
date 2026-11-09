// T391 (#1055): on some maps the driving range of a new range start could not be placed where its ghost first stands (its start spot), nor anywhere along the county road: "Not on water", a creek
// through the range's plot (the start's site checked its front, car park and drive corridor buildable, and the parcel 98 % playable, but not the 140 x 300 m plot behind the front: a creek
// in the outfield refused the whole range). Seeds 2, 3, 4 and 13 of the playtest (and 3 in 10 maps: 32 of the first 100 had a creek in the start's plot). The site now takes a plot with no
// creek, bank or open water in it (the placement's own test, golf/placing.ts landWhy) wherever the map has one, so every range start can place its range at its start spot. This runs the real
// terrain of seeds 1 to 100 with the game's own placement check: at the start spot, then everywhere the ghost can stand along the county road (its set-back from the road) and back from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { TC, generateTerrain } from '../src/game/terrain';
import { planRangeStart, type RangeStart } from '../src/game/golf/rangestart';
import { RANGE_PLOT, plotPoint } from '../src/game/golf/range';
import { landWhy, rangeSpotAt, type LandCheck } from '../src/game/golf/placing';

/** the game's land check on a start's parcel: the player's land is the parcel, water is a lake, a creek or its bank, there is no course yet */
function landOf(cls: Uint8Array, parcel: readonly number[]): LandCheck {
  return {
    owned: (x, y) => x >= parcel[0]! && x < parcel[0]! + parcel[2]! && y >= parcel[1]! && y < parcel[1]! + parcel[3]!,
    wet: (x, y) => { const tx = Math.floor(x), ty = Math.floor(y); if (tx < 0 || ty < 0 || tx >= MAP || ty >= MAP) return true; const c = cls[ty * MAP + tx]; return c === TC.WATER || c === TC.CREEK || c === TC.BANK; },
    course: () => false,
  };
}
/** the ghost's verdicts over a start: at its start spot, and at every spot the plot can slide to (along the road du, back from it dv) in steps of `step` tiles */
function verdicts(cls: Uint8Array, rs: RangeStart, step = 10) {
  const home = rs.site.rangePlot, f = rs.site.dir, parcel = rs.site.parcel, land = landOf(cls, parcel);
  const at = (x: number, y: number) => { const spot = rangeSpotAt(home, f, x, y); return { spot, why: landWhy(spot.plot, land) }; };
  // the start spot: the ghost's pointer at the plot's own (u, v) = (RANGE_PLOT[0] / 2, RANGE_FRONT / 2): no slide along the road, none back from it (du 0, dv 0)
  const sp = plotPoint(home, f, RANGE_PLOT[0] / 2, 12), start = at(sp.x, sp.y);
  const along = rs.site.axis === 'x' ? parcel[2] : parcel[3], deep = rs.site.axis === 'x' ? parcel[3] : parcel[2];
  let ok = 0, ok0 = 0, total = 0;
  for (let dv = 0; dv <= deep - RANGE_PLOT[1] - 18; dv += step) for (let du = 0; du <= along - RANGE_PLOT[0]; du += step) {
    const p = plotPoint(home, f, RANGE_PLOT[0] / 2 + du, 12 + dv), v = at(p.x, p.y); total++;
    if (!v.why) { ok++; if (v.spot.dv === 0) ok0++; }
  }
  return { start, ok, ok0, total };
}

test('every seed from 1 to 100 that has a range start can place its driving range along the county road, and almost every one at its start spot (T391)', { timeout: 900_000 }, () => {
  const refusedAtStart: string[] = [], noRoadSpot: number[] = [], noStart: number[] = [];
  for (let seed = 1; seed <= 100; seed++) {
    const t = generateTerrain(seed), rs = planRangeStart(t, seed);
    if (!rs) { noStart.push(seed); continue; }
    const v = verdicts(t.cls, rs);
    if (v.start.why) refusedAtStart.push(`${seed} (${v.start.why})`);
    if (v.ok0 === 0) noRoadSpot.push(seed);
    if (v.ok === 0) assert.fail(`seed ${seed}: the range can be placed nowhere in its parcel`);
  }
  // before the fix: 32 maps refused it at the start spot, and seeds 3, 4, 39, 45 and 94 at every position along the road
  assert.deepEqual(noRoadSpot, [], 'no position along the county road takes the range on these seeds');
  // a map with no site whose plot is dry (seeds 50 and 66: a creek through every candidate) keeps the old rule: its start spot is wet, the road's other positions are not
  assert.ok(refusedAtStart.length <= 3, `${refusedAtStart.length} seeds refuse the range at its start spot: ${refusedAtStart.join(', ')}`);
  // the fix must not lose range starts: a map with none is rolled again (newRangeGame tries 8), but it must stay the rare one (seeds 30 and 58 had none before)
  assert.ok(noStart.length <= 4, `${noStart.length} of 100 seeds have no range start: ${noStart.join(', ')}`);
});

test('the playtest\'s seeds 2, 3, 4 and 13 (a creek in every plot, "Not on water") place the range at the start spot', { timeout: 300_000 }, () => {
  for (const seed of [2, 3, 4, 13]) {
    const t = generateTerrain(seed), rs = planRangeStart(t, seed);
    assert.ok(rs, `seed ${seed} has a range start`);
    const v = verdicts(t.cls, rs!, 6);
    assert.equal(v.start.why, '', `seed ${seed}: the start spot`); assert.ok(v.ok0 > 0, `seed ${seed}: along the road`);
    // no wet tile anywhere on the plot the start gives
    const home = rs!.site.rangePlot; let wet = 0; for (let y = home[1]; y < home[1] + home[3]; y++) for (let x = home[0]; x < home[0] + home[2]; x++) { const c = t.cls[y * MAP + x]; if (c === TC.WATER || c === TC.CREEK || c === TC.BANK) wet++; }
    assert.equal(wet, 0, `seed ${seed}: no water, creek or bank under the plot`);
  }
});

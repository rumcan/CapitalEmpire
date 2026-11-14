// J9 (#1268): the start's placement words and ghost shapes (golf/startpick.ts), and the Placeable helper's new optional fields (golf/placing.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateTerrain } from '../src/game/terrain';
import { RANGE_PLACE_COST, placeVerdict, type Placeable } from '../src/game/golf/placing';
import { WELCOME_WAIT_MS, welcomeReady } from '../src/game/golf/firstview';
import { START_CARD_TITLE, START_FIRST_VIEW_WAIT_MS, START_PICK_ZOOM, START_REST_MS, FACING_WORDS, spotPolys, startCardText, startOkText, startPolys, turnedFacing } from '../src/game/golf/startpick';
import { ZOOM_MAX, ZOOM_MIN } from '../src/game/iso';
import { planRangeStart, settleSpot, startProbe, startSpotAt } from '../src/game/golf/rangestart';

const cost = RANGE_PLACE_COST.toLocaleString();

test('the card says what a click does, in plain words: the land, the old range and the house for $15,000 (the jam), or the land, the house and the range', () => {
  assert.equal(RANGE_PLACE_COST, 15000);
  assert.equal(START_CARD_TITLE, 'Choose where to start');
  assert.equal(startCardText(true), `Click to place your driving range. This buys the land and the old range for $${cost} and builds your house.`);
  assert.equal(startCardText(false), `Click to place your driving range. This buys the land around it and builds your house; the range itself costs $${cost}.`);
  assert.ok(startOkText().includes(`$${cost}`));
});

test('a turn is a quarter of the compass, either way round, and the facings have words', () => {
  assert.deepEqual([0, 1, 2, 3].map(f => turnedFacing(f as 0 | 1 | 2 | 3)), [1, 2, 3, 0]);
  assert.deepEqual([0, 1, 2, 3].map(f => turnedFacing(f as 0 | 1 | 2 | 3, true)), [3, 0, 1, 2]);
  assert.deepEqual([...FACING_WORDS], ['north', 'east', 'south', 'west']);
  assert.ok(START_PICK_ZOOM >= ZOOM_MIN && START_PICK_ZOOM <= ZOOM_MAX);
});

test('the ghost: the plot first, then the front, the car park, the drive and the parcel, and the county road where a start fits', () => {
  const seed = 1, t = generateTerrain(seed), p = startProbe(t, seed), auto = planRangeStart(t, seed, p)!;
  const f = auto.site.rangeFront, spot = startSpotAt(p, f[0] + f[2] / 2, f[1] + f[3] / 2);
  assert.equal(spot.why, '', 'the automatic start fits');
  const bare = startPolys(spot.site), withRoad = startPolys(spot.site, spot.road);
  assert.equal(bare.length, 5); assert.equal(withRoad.length, 5 + spot.road!.legs.length);
  for (const poly of withRoad) { assert.ok(poly.length >= 8 && poly.length % 2 === 0); assert.ok(poly.every(Number.isFinite)); }
  const [px, py, pw, ph] = spot.site.rangePlot;
  assert.deepEqual(bare[0], [px, py, px + pw, py, px + pw, py + ph, px, py + ph], 'the first outline is the range plot');
  // the parcel holds the plot (the land the start buys is the ghost's biggest shape)
  const [qx, qy, qw, qh] = spot.site.parcel; assert.deepEqual(bare[4], [qx, qy, qx + qw, qy, qx + qw, qy + qh, qx, qy + qh]);
});

test('placeVerdict: a refused spot says why, a spot that fits says what the placement says (ok), else its name, price and "click to build here"', () => {
  const base: Placeable<number> = { id: 'x', name: 'Thing', cost: 100, spot: x => x, why: s => (s < 0 ? 'Nope' : ''), polys: () => [], build: () => true };
  assert.deepEqual(placeVerdict(base, -1, 1e9), { bad: true, label: 'Nope' });
  assert.equal(placeVerdict(base, 1, 1e9).label, 'Thing · $100 · click to build here');
  assert.equal(placeVerdict({ ...base, ok: () => 'Fits here' }, 1, 1e9).label, 'Fits here');
  assert.equal(placeVerdict({ ...base, ok: () => 'Fits here' }, 1, 50).bad, true);
});

test("the ghost's shapes are made once for a spot (a frame allocates none), and made again when its county road is settled", () => {
  const seed = 1, t = generateTerrain(seed), p = startProbe(t, seed), auto = planRangeStart(t, seed, p)!, f = auto.site.rangeFront;
  const sp = startSpotAt(p, f[0] + f[2] / 2, f[1] + f[3] / 2, null, null, true);
  assert.ok(sp.pending, 'a lazy spot has no road yet');
  const a = spotPolys(sp); assert.equal(spotPolys(sp), a, 'the same shapes the next frame'); assert.equal(a.length, 5, 'the plot, front, car park, drive and parcel: no road yet');
  settleSpot(p, sp);
  const b = spotPolys(sp); assert.notEqual(b, a, 'the road settled: the shapes are made again'); assert.equal(b.length, 5 + sp.road!.legs.length); assert.equal(spotPolys(sp), b);
  assert.ok(START_REST_MS >= 50 && START_REST_MS <= 500, 'the pointer rests a moment, not a long while, before its road is worked out');
});

test('the engine wires the choice: a new range game chooses (but not a bench, a dev seed or ?pick=0), nothing is saved while it is chosen, the click pays what Buy paid, reset drops it, the HUD waits', () => {
  const eng = readFileSync('src/game/engine.ts', 'utf8'), app = readFileSync('src/App.tsx', 'utf8');
  assert.match(eng, /private picksStart\(\): boolean \{ return START_PICK && !this\.benchMode && !this\.devSeed && new URLSearchParams\(location\.search\)\.get\('pick'\) !== '0'; \}/);
  assert.match(eng, /scheduleSave\(\) \{ if \(this\.benchMode \|\| this\.startPick\) return;/);
  assert.match(eng, /async save\(\) \{\n\s+if \(this\.benchMode \|\| this\.startPick\) return 0;/);
  assert.match(eng, /this\.startPick = null; this\.placing = null; this\.jamOffered = false;/);
  // the jam's click: the old range laid for sale with its junk, built free, then bought in the same call ($15,000, its kit, its balls: buyRange)
  assert.match(eng, /if \(JAM\) \{ b\.forSale = true; b\.junk = newRangeJunk\(this\.seed \^ 0x4a37\); \}/);
  assert.match(eng, /if \(p && at && p\.build\(at\)\) \{ if \(JAM && !this\.buyRange\(\)\)/);
  assert.match(eng, /const p = this\.rangePlaceable\(JAM\)/);
  // the pointer asks the geometry only (lazy), its road settles at rest and at the click; the planner view counts as the first baked view
  assert.match(eng, /startSpotAt\(pk\.probe, x, y, pk\.turn, pk\.last, true\)/);
  assert.match(eng, /settleSpot\(pk\.probe, sp\); \/\/ \(a click on a spot the pointer had not rested on/);
  assert.match(eng, /if \(drawPlan\(\) && !this\.firstViewBaked && this\.ready\)/);
  // after the click the tutorial's card waits for the new view's ground, but START_FIRST_VIEW_WAIT_MS at most (not the 10 s a game's first view may wait)
  assert.match(eng, /this\.firstViewBaked = false; this\.readyAt = performance\.now\(\) - \(WELCOME_WAIT_MS - START_FIRST_VIEW_WAIT_MS\);/);
  assert.ok(START_FIRST_VIEW_WAIT_MS > 0 && START_FIRST_VIEW_WAIT_MS < WELCOME_WAIT_MS);
  const shift = WELCOME_WAIT_MS - START_FIRST_VIEW_WAIT_MS; // (readyAt is set this far back at the click)
  assert.equal(welcomeReady(false, shift + START_FIRST_VIEW_WAIT_MS - 1), false); assert.equal(welcomeReady(false, shift + START_FIRST_VIEW_WAIT_MS), true); assert.equal(welcomeReady(true, 0), true);
  assert.match(readFileSync('src/game/features.ts', 'utf8'), /export const START_PICK = true;/);
  assert.match(app, /const picking = !!game\?\.startPick;/); assert.match(app, /\{picking && <StartPickCard game=\{game\} \/>\}/); assert.match(app, /\{!picking && <Minimap game=\{game\} \/>\}/);
});

// T155 (#333; the owner: "lets use green grass for upgraded house lawns, fairway for the built ones and rough for the decrepit ones"): a lot's lawn
// carries its look state, and the painted art lays that state's lawn surface (painted-surfaces.ts lawnTexFor): built the fairway, upgraded the
// putting green, declined (decrepit) the rough's painting; a lot of no state keeps one of the town lawns. The game's lots (engine placeLot) pass
// stateOf(level, decline). Headless.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lotLawn } from '../src/game/lawns';
import { clampSurfaces, knownFamily, lawnSlot, lawnTex, lawnTexFor, lookOfTex, STATE_LAWN, SURFACES } from '../src/game/painted-surfaces';
import { stateOf } from '../src/game/lots/presets';
import { LV } from '../src/game/lots/town';
import FILE from '../src/game/painted-surfaces.json';

const g = { o: { x: 10, y: 20 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: 8, d: 12 };
const file = clampSurfaces(FILE);

test('a lot\'s lawn carries its look state (none: as before)', () => {
  assert.equal(lotLawn('lot-1', g, ['a'], 'upgraded')!.lawn!.st, 'upgraded');
  assert.equal(lotLawn('lot-1', g, ['a'], 'declined')!.lawn!.st, 'declined');
  assert.equal('st' in lotLawn('lot-1', g, ['a'])!.lawn!, false);
  // the game's states: decline 2 or more is declined (decrepit), else the level's
  assert.equal(stateOf(LV.BUILT, 0), 'built'); assert.equal(stateOf(LV.UPGRADED, 0), 'upgraded'); assert.equal(stateOf(LV.BUILT, 2), 'declined'); assert.equal(stateOf(LV.UPGRADED, 3), 'declined');
});

test('the state lawns: built the fairway, upgraded the putting green, decrepit the rough\'s painting; owner-tunable surfaces of the studio', () => {
  // which painting each state wears is the owner's (Studio › Painted: built fringe and upgraded fringe a touch brighter since #516, decrepit the
  // rough): the test holds that each state lawn wears a known painted family, not which one (the owner tunes them)
  for (const k of Object.values(STATE_LAWN)) assert.ok(knownFamily(file.surfaces[k]!.family), `${k} wears a known family (${file.surfaces[k]!.family})`);
  for (const k of Object.values(STATE_LAWN)) assert.ok(SURFACES.some(s => s.key === k && s.group === 'Town'), `${k} is a studio surface`);
  // the texture each lawn patch wears, by its state; a lot of no state (and a road block) one of the town lawns by where it lies
  const pts = lotLawn('lot-1', g, ['a'])!.pts;
  for (const s of ['built', 'upgraded', 'declined'] as const) {
    const t = lawnTexFor(lotLawn('lot-1', g, ['a'], s)!.lawn, pts, file);
    assert.equal(t, STATE_LAWN[s]); assert.equal(lookOfTex(t, file)!.family, file.surfaces[STATE_LAWN[s]]!.family);
  }
  assert.equal(lawnTexFor(lotLawn('lot-1', g, ['a'])!.lawn, pts, file), lawnTex(lawnSlot(pts, file.lawns)));
  // a file with no state lawn (an old one) keeps the town lawns for every lot
  const old = { ...file, surfaces: { ...file.surfaces } }; delete old.surfaces.lawnUpgraded;
  assert.equal(lawnTexFor({ st: 'upgraded' }, pts, old), lawnTex(lawnSlot(pts, file.lawns)));
  assert.equal(lawnTexFor({ st: 'upgraded' }, pts, { surfaces: {}, lawns: [] }), '');
});

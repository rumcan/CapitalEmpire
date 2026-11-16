// The owner, 2026-11-16 ("where are the new streets??"): the jam build has no road tool, so its town lays its own gravel streets as it grows
// (engine.ts applySandbox passes townRoads in the jam, as a sandbox-town game does). On the headless range start (tests/sports-grounds.test.ts's
// town), with the club's earnings a jam game reaches, the town with townRoads lays new streets and outgrows the one without.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { City } from '../src/game/city';
import { CLASS, RoadNetwork, type Pt } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { MAP } from '../src/game/iso';
import { NEAR } from '../src/game/golf/rangestart';
import type { Town } from '../src/game/lots/town';
import type { Budget } from '../src/game/budget';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

type Inside = { town: Town; budget: Budget };
const Y = 500, A: Pt = { x: 0, y: Y }, B: Pt = { x: MAP - 1, y: Y }, SEED: Pt = { x: 500, y: Y - 40 };
const PARCEL: [number, number, number, number] = [430, Y + NEAR, 300, 450];

function run(townRoads: boolean, earned: number, days: number) {
  const city = new City(3);
  city.autoStadium = false;
  city.terrain(new Uint8Array(MAP * MAP), A, 3, [SEED], undefined, true);
  city.setBudget(null, null, true);
  const editor = new NetEditor(new RoadNetwork());
  editor.net.paintData = false;
  editor.addLegs([{ a: A, b: B }], CLASS.road, 0, undefined, true);
  city.netOps(editor.commit(true));
  city.setGolf({ tier: 1, rep: 0, land: [PARCEL], start: 'range', exits: [A, B], holes: 9, townBoost: 1 });
  city.townRoads = townRoads;
  const I = city as unknown as Inside;
  I.budget.earned = earned;
  let legs = 0;
  for (let s = 0; s < days * 24 * 6; s++) {
    const r = city.step(10);
    if (r.grow) { legs += r.grow.length; editor.addLegs(r.grow, CLASS.gravel, 2, undefined, true); city.netOps(editor.commit()); }
  }
  return { pop: I.town.pop, legs };
}

describe('the jam town lays its own streets', () => {
  it('with a jam game\'s earnings it lays new streets and outgrows the town without them', () => {
    const on = run(true, 250_000, 60), off = run(false, 250_000, 60);
    console.log('townRoads on', on, 'off', off);
    assert.ok(on.legs > 0, 'the town laid street legs');
    assert.ok(on.pop > off.pop, `it outgrew the town without streets (${on.pop} vs ${off.pop})`);
  });
});

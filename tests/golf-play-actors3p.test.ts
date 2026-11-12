// T424 (docs/CINDERLINKS-PORT.md): who is on the course as the view from behind the golfer is sent it (src/game/golf/play/actors3p.ts). On a synthetic
// 3-hole course: a field of three groups gives each golfer once, with ids and dress that do not change from one minute to the next; each golfer's place
// round-trips the view's frame to where the round has him; a swing's phase runs 0..1 from the strike; caddies stand beside the pros; a cart group's
// riders are in their cart and the cart lists them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { CartPlay, SWING_TIME, fieldEntourage, makeField, playRound, stateAt } from '../src/game/golf/play';
import type { CourseView, Golfer, Group, Lie, PlayHole } from '../src/game/golf/play';
import { fromView } from '../src/game/golf/play/protocol3p';
import { CADDIE_ID, CART_ID, actorsMsg, caddieDress, dressOf } from '../src/game/golf/play/actors3p';

const centre = { x: 300, y: 100 };
function course(): CourseView {
  const holes: PlayHole[] = ([4, 3, 4] as const).map((par, h) => {
    const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : 380) / TILE_M, y };
    return { n: h + 1, par, tee, pin, line: [tee, pin] };
  });
  const lieAt = (x: number, y: number): Lie => {
    for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green';
    for (const h of holes) if (Math.hypot(x - h.tee.x, y - h.tee.y) <= 2) return 'tee';
    for (const h of holes) if (Math.abs(y - h.tee.y) <= 7.5 && x >= h.tee.x - 2 && x <= h.pin.x + 8) return 'fairway';
    return Math.abs(((y - 20) % 60 + 60) % 60 - 30) > 20 ? 'rough' : 'out';
  };
  return { holes, lieAt };
}
/** nine golfers in three groups, eight minutes apart */
function field(tier: number, seed: number): { f: Golfer[]; gs: Group[] } {
  const f = makeField(tier, seed).slice(0, 9).map((g, i) => ({ ...g, id: i }));
  const gs: Group[] = [0, 1, 2].map(k => ({ tee: 480 + 8 * k, players: [3 * k, 3 * k + 1, 3 * k + 2] }));
  fieldEntourage(f, gs, tier);
  return { f, gs };
}

test('actors: three groups, each golfer once, stable ids and dress, places round-trip', () => {
  const view = course(), { f, gs } = field(4, 11), plan = playRound(view, f, gs, 11);
  const m1 = 500, m2 = 503, a = actorsMsg({ plan, view, minute: m1 }, centre), b = actorsMsg({ plan, view, minute: m2 }, centre);
  assert.equal(a.t, 'actors'); assert.equal(a.v, 1); assert.equal(a.at, m1);
  for (const msg of [a, b]) {
    const golfers = msg.actors.filter(x => x.role === 'golfer'), ids = golfers.map(x => x.id).sort((p, q) => p - q);
    assert.deepEqual(ids, [0, 1, 2, 3, 4, 5, 6, 7, 8], 'every golfer of the three groups, once');
    const states = stateAt(plan, view, msg.at);
    for (const g of golfers) {
      const s = states.find(x => x.golfer === g.id)!, back = fromView(g.at, centre);
      assert.ok(Math.hypot(back.x - s.x, back.y - s.y) < 0.01, `golfer ${g.id}: his place round-trips (${back.x},${back.y} vs ${s.x},${s.y})`);
      assert.equal(g.hole, s.hole + 1);
      assert.ok(g.doing, 'a pose'); assert.ok(g.phase! >= 0 && g.phase! <= 1, 'a phase 0..1');
      assert.ok(g.heading === undefined || (g.heading >= -180 && g.heading <= 180));
    }
  }
  for (const x of a.actors) { const y = b.actors.find(o => o.id === x.id); if (y) { assert.equal(y.role, x.role); assert.deepEqual(y.dress, x.dress, `actor ${x.id}: the same dress a minute later`); } }
  // the dress is the golfer's own: the same from his id, look and sex alone, and the nine are not all dressed alike
  for (const g of f) assert.deepEqual(a.actors.find(x => x.id === g.id)!.dress, dressOf(g));
  assert.ok(new Set(a.actors.filter(x => x.role === 'golfer').map(x => x.dress!.shirt + x.dress!.trousers + x.dress!.cap)).size >= 5, 'varied clothes');
  // tier 4: the pros have caddies, beside them, in the bib
  const pros = f.filter(g => g.caddie);
  assert.ok(pros.length > 0, 'the field has pros with caddies');
  for (const g of pros) {
    const cd = a.actors.find(x => x.id === CADDIE_ID + g.id), me = a.actors.find(x => x.id === g.id)!;
    assert.ok(cd, `golfer ${g.id}'s caddie`); assert.equal(cd!.role, 'caddie'); assert.deepEqual(cd!.dress, caddieDress(g.id));
    assert.ok(Math.hypot(cd!.at[0] - me.at[0], cd!.at[1] - me.at[1]) < 3.5 * TILE_M, 'beside his golfer');
  }
  // nobody shows long before his group's tee time, nor once he is done
  assert.equal(actorsMsg({ plan, view, minute: 400 }, centre).actors.length, 0);
  const end = Math.max(...plan.done) + 1;
  assert.equal(actorsMsg({ plan, view, minute: end }, centre).actors.filter(x => x.role === 'golfer').length, 0);
});

test('actors: a swing runs 0..1 from the strike and faces the shot', () => {
  const view = course(), { f, gs } = field(4, 5), plan = playRound(view, f, gs, 5), s = plan.shots.find(x => x.club !== 'putter' && x.golfer === 4 && x.stroke > 1)!, tee = plan.shots.find(x => x.golfer === 4 && x.stroke === 1)!;
  for (const [dt, want] of [[0.0001, 0], [SWING_TIME / 2, 0.5]] as const) {
    const g = actorsMsg({ plan, view, minute: s.t + dt }, centre).actors.find(x => x.id === 4)!;
    assert.equal(g.doing, 'swing'); assert.ok(Math.abs(g.phase! - want) < 0.02, `phase ${g.phase} at ${dt}`);
    const hd = Math.atan2(s.to.y - s.from.y, s.to.x - s.from.x) * 180 / Math.PI;
    assert.ok(Math.abs(g.heading! - hd) <= 1, 'faces the shot');
  }
  const ad = actorsMsg({ plan, view, minute: s.t - 0.01 }, centre).actors.find(x => x.id === 4)!;
  assert.equal(ad.doing, 'address'); assert.ok(ad.phase! > 0.9, 'just before the strike: near the end of the address');
  const at = actorsMsg({ plan, view, minute: tee.t - 0.05 }, centre).actors.find(x => x.id === 4)!;
  assert.equal(at.doing, 'address', 'on the first tee too'); assert.ok(at.phase! > 0.7 && at.phase! < 0.9);
});

test('actors: carts carry their riders', () => {
  const view = course(), { f, gs } = field(1, 3), plan = playRound(view, f, gs, 3), carts = new CartPlay(plan, view, null, { x: 0, y: 0 });
  assert.ok(f.some(g => g.cart !== undefined), 'tier 1 amateurs ride');
  let rode = 0, seen = 0;
  for (let m = 480; m < 560; m += 2) {
    const msg = actorsMsg({ plan, view, minute: m, carts }, centre);
    for (const c of msg.actors.filter(x => x.role === 'cart')) {
      seen++;
      assert.ok(c.id >= CART_ID && c.id < CADDIE_ID);
      for (const id of c.riders!) {
        const r = msg.actors.find(x => x.id === id)!; rode++;
        assert.equal(r.doing, 'ride'); assert.equal(r.cart, c.id); assert.deepEqual(r.at, c.at, 'a rider is where his cart is');
      }
    }
    const ids = msg.actors.map(x => x.id); assert.equal(new Set(ids).size, ids.length, 'no id twice');
  }
  assert.ok(seen > 0 && rode > 0, `carts out (${seen}) with riders (${rode})`);
});

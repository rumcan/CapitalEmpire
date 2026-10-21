// Lettering: art with readable signs is never mirrored (docs/GAME-PLAN.md 2.2, the facing rule). Headless: npm test (no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap, type Lot } from '../src/game/lots/lots';
import { compose, type ComposeState } from '../src/game/lots/compose';
import { hasLettering, LETTERING_IDS, EAST_FACING } from '../src/game/lots/lettering';
import { LU, LV } from '../src/game/lots/town';
import { LIBRARY } from '../src/game/library';
import { BUSINESSES } from '../src/game/business/catalogue';
import { businessArt } from '../src/game/business/art';
import { mulberry } from '../src/game/iso';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
/** a 4x4 grid of streets, 40 tiles apart, and one boulevard line across it (as compose.test.ts) */
const O = 40, STEP = 40, LINES = 4, at = (k: number) => O + k * STEP, last = at(LINES - 1);
/** the lots of that grid, in key order */
function lotsOfGrid(): Lot[] {
  const e = new NetEditor(new RoadNetwork());
  for (let k = 0; k < LINES; k++) {
    e.addLegs([leg(O, at(k), last, at(k))], CLASS.street, 0);
    e.addLegs([leg(at(k), O, at(k), last)], CLASS.street, 0);
  }
  e.commit();
  e.addLegs([leg(at(1) + 20, O, at(1) + 20, last)], CLASS.boulevard, 0);
  e.commit();
  const lm = new LotMap(); lm.update(e.net, null);
  return [...lm.lots.values()].sort((p, q) => (p.key < q.key ? -1 : p.key > q.key ? 1 : 0));
}
const LOTS = lotsOfGrid();
const index = new Map(LIBRARY.map((it, i) => [it.id, i]));
const byId = new Map(LIBRARY.map(i => [i.id, i]));
/** the library's own verdict on a sprite (id and name), as the composer and the business art ask it */
const lettered = (id: string) => hasLettering(id, byId.get(id)?.name);

test('shop signs carry lettering; houses, yards and natural sprites do not', () => {
  for (const id of ['town:grocery', 'town:bakery', 'world:diner', 'town:fish_tackle', 'ref:building-corner-shop', 'business:sportsbar', 'business:golf-cart-garage'])
    assert.ok(hasLettering(id), `${id} carries lettering`);
  assert.ok(hasLettering('variation:town-grocery-46d5dc39-plain:1'), 'a shop variation carries lettering');
  assert.ok(hasLettering('gen:unknown-sprite', 'Maple Family Market'), 'the library name counts as well as the id');
  for (const id of ['variation:world-house_0-51fa4b80-plain:1', 'gen:house-l-shape', 'static:garage_brick', 'expansion:washing-line', 'expansion:kiddie-car', 'ref:landmark-windmill', 'ref:building-farm-shed', 'world:barn',
    'static:shop_brick_rear', 'static:shop_market_rear-v2', 'variation:static-shop_brick_rear-04db4dfa-plain:1', 'expansion:boarded-store-rear', 'variation:expansion-boarded-store-rear-d09a309a:1',
    'variation:industrial-auto-body-shop-63875699:1', 'variation:industrial-brick-machine-shop-34206b23:1'])
    assert.ok(!hasLettering(id), `${id} carries no lettering`);
  // whole residential and natural categories are plain
  const plain = new Set(['Houses', 'More houses', 'Trees & plants', 'Fences', 'Townspeople', 'Vehicles', 'Lots', 'Yard']);
  for (const it of LIBRARY) if (plain.has(it.cat)) assert.ok(!LETTERING_IDS.has(it.id), `${it.id} (${it.cat}) carries no lettering`);
  assert.ok(LETTERING_IDS.size >= 20, `${LETTERING_IDS.size} lettering sprites`);
});

test('a lettering sprite is never drawn flipped: commercial and tour lots facing +X, across seeds', () => {
  // a lot faces +X when its road is on the +/-X side (the composer flips its sprites then)
  const east = LOTS.filter(l => Math.abs(l.n.x) > Math.abs(l.n.y));
  assert.ok(east.length >= 10, `${east.length} lots face +X`);
  const rnd = mulberry(20261021);
  let flipped = 0;
  for (const lot of east) for (let k = 0; k < 40; k++) {
    const st: ComposeState = { use: k % 3 === 2 ? LU.TOUR : LU.COM, level: k % 2 ? LV.BUILT : LV.UPGRADED, decline: k % 4, seed: Math.floor(rnd() * 4294967296) >>> 0 };
    for (const p of compose(lot, st).props) {
      if (!p.flip) continue;
      flipped++;
      assert.ok(!lettered(p.id), `${lot.key} ${JSON.stringify(st)}: ${p.id} is drawn flipped`);
    }
  }
  assert.ok(flipped > 0, 'the composer drew some flipped sprites');
});

test('the east-facing hook: a flipped front with east-facing art draws that art unflipped, never the front flipped', () => {
  // a stand-in: the grocery's east art is the diner sprite (any library sprite will do; the hook is what is tested)
  EAST_FACING['town:grocery'] = 'world:diner';
  try {
    const east = LOTS.filter(l => Math.abs(l.n.x) > Math.abs(l.n.y));
    const rnd = mulberry(20261022);
    let stand = 0;
    for (const lot of east) for (let k = 0; k < 40; k++) {
      const st: ComposeState = { use: LU.COM, level: LV.BUILT, decline: 0, seed: Math.floor(rnd() * 4294967296) >>> 0 };
      for (const p of compose(lot, st).props) {
        if (p.id === 'town:grocery') assert.fail(`${lot.key}: the grocery drawn with its front art on a flipped lot`);
        if (p.id === 'world:diner') { stand++; assert.equal(p.flip, false, `${lot.key}: the east art is drawn flipped`); }
      }
    }
    assert.ok(stand > 0, 'the east art was placed on a flipped lot');
  } finally {
    delete EAST_FACING['town:grocery'];
  }
});

test('a rotated business never mirrors a lettering sprite; its plain sprites still turn', () => {
  let nLettered = 0, turnedPlain = 0;
  for (const b of BUSINESSES) {
    const turned = businessArt({ id: 3, type: b.id, x: 20, y: 30, w: b.footprint.h, h: b.footprint.w }, LIBRARY, index);
    for (const p of turned) {
      const id = LIBRARY[p.item]!.id;
      if (lettered(id)) { nLettered++; assert.equal(p.flip, false, `${id} on a rotated ${b.id}`); }
      else if (p.flip) turnedPlain++;
    }
  }
  assert.ok(nLettered > 0, 'a rotated business has lettering art');
  assert.ok(turnedPlain > 0, 'a rotated business still turns its plain art');
});

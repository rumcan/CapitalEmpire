// Lettering: art with readable signs is never mirrored (docs/GAME-PLAN.md 2.2, the facing rule). Headless: npm test (no DOM, no canvas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { LotMap, type Lot } from '../src/game/lots/lots';
import { compose, type ComposeState } from '../src/game/lots/compose';
import { hasLettering, LETTERING_IDS, EAST_FACING } from '../src/game/lots/lettering';
import { EAST_PAIRS } from '../src/game/east-library';
import { VIEW_ART, unmirror } from '../src/game/views-library';
import { REMOVED_IDS } from '../src/game/lots/scales';
/** the fronts of the 14 east pictures in art/east-facing */
const EAST_FRONTS = ['ref:building-corner-shop', 'ref:building-corner-store', 'ref:building-gas-canopy', 'ref:building-grocery', 'town:bakery', 'town:barber', 'town:fish_tackle', 'town:grocery', 'town:laundromat', 'town:pharmacy', 'town:postoffice', 'world:diner', 'world:snack_bar', 'world:video'];
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
    ])
    assert.ok(!hasLettering(id), `${id} carries no lettering`);
  // the works buildings and the water tower have signs painted on their walls (PAINTED_SIGNS)
  for (const id of ['variation:industrial-auto-body-shop-63875699:1', 'variation:industrial-bottling-plant-13e91e4e:1', 'world:watertower']) assert.ok(hasLettering(id), `${id} carries a painted sign`);
  // whole residential and natural categories are plain
  const plain = new Set(['Houses', 'More houses', 'Trees & plants', 'Fences', 'Townspeople', 'Vehicles', 'Lots', 'Yard']);
  // (the turned views, view:*, are kept from mirroring like lettering: a mirrored view puts the sun on the wrong side)
  for (const it of LIBRARY) if (plain.has(it.cat) && !it.id.startsWith('view:')) assert.ok(!LETTERING_IDS.has(it.id), `${it.id} (${it.cat}) carries no lettering`);
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

test('east-facing art: each pair is a library sprite of its front\'s kind and category, the front mirrored (ax, boxes, quad), with lettering', () => {
  // the 14 east pictures, less those whose front the owner removed in the studio (prep-east leaves them out)
  assert.equal(EAST_PAIRS.length, 14 - EAST_FRONTS.filter(id => REMOVED_IDS.includes(id)).length, `${EAST_PAIRS.length} east-facing shops`);
  assert.equal(new Set(EAST_PAIRS.map(p => p[1])).size, EAST_PAIRS.length, 'each east sprite once');
  const near = (a: number, b: number) => Math.abs(a - b) < 0.011;
  // a front the owner removed in the studio takes its east view with it (REMOVED_IDS): neither is in the library
  for (const [front, east] of EAST_PAIRS.filter(([fr]) => !REMOVED_IDS.includes(fr))) {
    const f = byId.get(front), e = byId.get(east);
    assert.ok(f, `${front} is in the library`);
    assert.ok(e, `${east} is in the library`);
    assert.equal(EAST_FACING[front], east, `${front} maps to ${east}`);
    assert.equal(east, `east:${front}`, `${east} is named for its front`);
    assert.equal(e.kind, f.kind, `${east} kind`);
    assert.equal(e.cat, f.cat, `${east} category`);
    assert.equal(e.name, `${f.name} (east)`, `${east} name`);
    // four-view art (views-library.ts): the east sprite is the SE view, the building turned, not mirrored: its footprint is the front's turned
    if (VIEW_ART.has(east)) { assert.deepEqual(e.boxes, f.boxes.map(b => ({ hx: b.hy, hy: b.hx, dx: 0, dy: 0 })), `${east} boxes turned`); continue; }
    assert.equal(e.w, f.w, `${east} width`);
    assert.equal(e.h, f.h, `${east} height`);
    assert.ok(near(e.ax, f.w - f.ax), `${east} anchor ${e.ax} is the front's ${f.ax} mirrored`);
    assert.equal(e.ay, f.ay, `${east} anchor height`);
    assert.deepEqual(e.boxes, f.boxes.map(b => ({ hx: b.hy, hy: b.hx, dx: b.dy, dy: b.dx })), `${east} boxes swapped`);
    // (the trims are re-cut on every atlas pack: half a pixel either way)
    const px = (a: number, b: number) => Math.abs(a - b) < 0.5;
    assert.ok(px(e.quad[0], f.w - f.quad[2]) && px(e.quad[2], f.w - f.quad[0]) && px(e.quad[1], f.quad[1]) && px(e.quad[3], f.quad[3]), `${east} quad mirrored`);
    assert.ok(near(e.tex[3] - e.tex[1], f.tex[3] - f.tex[1]) && near(e.tex[4] - e.tex[2], f.tex[4] - f.tex[2]), `${east} is drawn at the front's mip-0 size`);
    assert.ok(hasLettering(east, e.name) && lettered(east), `${east} carries lettering: never flipped`);
  }
});

test('east-facing art is drawn only in place of a flipped front, unflipped; no pool and no unflipped lot draws it', () => {
  const plusX = LOTS.filter(l => Math.abs(l.n.x) > Math.abs(l.n.y)), plusY = LOTS.filter(l => Math.abs(l.n.y) > Math.abs(l.n.x));
  assert.ok(plusY.length >= 10, `${plusY.length} lots face +Y`);
  const rnd = mulberry(20261023);
  let drawn = 0;
  const used = new Set<string>();
  for (const lot of plusX) for (let k = 0; k < 40; k++) {
    const st: ComposeState = { use: k % 3 === 2 ? LU.TOUR : LU.COM, level: k % 2 ? LV.BUILT : LV.UPGRADED, decline: k % 4, seed: Math.floor(rnd() * 4294967296) >>> 0 };
    for (const p of compose(lot, st).props) {
      if (!p.id.startsWith('east:')) continue;
      drawn++; used.add(p.id);
      assert.equal(p.flip, false, `${lot.key} ${JSON.stringify(st)}: ${p.id} is drawn flipped`);
    }
  }
  assert.ok(drawn > 0, 'the east-facing art is drawn on +X lots');
  assert.ok(used.size >= 5, `${used.size} east-facing shops drawn on +X lots`);
  for (const lot of plusY) for (let k = 0; k < 20; k++) {
    const st: ComposeState = { use: k % 2 ? LU.COM : LU.TOUR, level: LV.BUILT, decline: k % 4, seed: Math.floor(rnd() * 4294967296) >>> 0 };
    for (const p of compose(lot, st).props) assert.ok(!p.id.startsWith('east:'), `${lot.key} (facing +Y): ${p.id} drawn from a pool`);
  }
});

test('the east-facing hook: a flipped front with east-facing art draws that art unflipped, never the front flipped', () => {
  // a stand-in: the grocery's east art is the diner sprite (any library sprite will do; the hook is what is tested)
  const real = EAST_FACING['town:grocery'];
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
    EAST_FACING['town:grocery'] = real;
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

test('the four-view buildings are never mirrored: a flip is the partner view (NE <-> SE, SW <-> NW), unflipped, on the same footprint', () => {
  const four = LIBRARY.filter(it => VIEW_ART.has(it.id) || it.id.startsWith('view:'));
  assert.ok(four.length >= 40, `${four.length} four-view sprites`);
  const box = (id: string) => byId.get(id)!.boxes[0]!;
  for (const it of four) {
    const [id, flip] = unmirror(it.id, true);
    assert.equal(flip, false, `${it.id} flipped is drawn unflipped`);
    assert.ok(byId.has(id) && id !== it.id, `${it.id} turns to ${id}`);
    assert.deepEqual(unmirror(id, true), [it.id, false], `${id} turns back to ${it.id}`);
    const a = box(it.id), b = box(id);
    assert.ok(Math.abs(a.hx - b.hy) < 0.011 && Math.abs(a.hy - b.hx) < 0.011, `${it.id} and ${id}: the footprint turned`);
    assert.deepEqual(unmirror(it.id, false), [it.id, false], `${it.id} unflipped is itself`);
  }
  // a rotated business parcel draws its four-view art turned, never mirrored
  let turned = 0;
  for (const b of BUSINESSES) for (const p of businessArt({ id: 3, type: b.id, x: 20, y: 30, w: b.footprint.h, h: b.footprint.w }, LIBRARY, index)) {
    const id = LIBRARY[p.item]!.id;
    if (VIEW_ART.has(id) || id.startsWith('view:')) { assert.equal(p.flip, false, `${id} on a rotated ${b.id}`); if (id.startsWith('view:')) turned++; }
  }
  assert.ok(turned > 0, 'a rotated business draws turned views');
});

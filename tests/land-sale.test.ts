// T200 (#524; plan P23-UX P2-6, D2.4): Land for sale. The overlay's blocks (for sale next to your land, priced and banded; refused with why: a
// public road, water, not next to your land yet); a click opens a block's card and never buys; Buy buys exactly the card's block at the card's
// price (refused when it moved); the course brush's and New hole's "not your land" refusals offer it; Course › Land for sale opens it. Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BAND_LABEL, LAND_REFUSE, LandSale, bandOf, landOffers, offerFacts, type LandHost } from '../src/game/golf/land-sale';
import { adjacentBlockPrice, isAdjacentBlock, rectsOverlap, type ParcelLandClass } from '../src/game/golf/parcels';
import type { Rect } from '../src/game/golf/mode';
import { RAIL } from '../src/ui/rail-items';
import { leavesOf, menuOf, type MenuCtx } from '../src/ui/flyout-menu';

/** a host: your land at (100, 100) 80 x 80; a road along x = 70 (the blocks west of the land take it); water in the block at (180, 140); a town
 *  block south at (100, 180) with 2 houses, a shop block at (140, 180) */
function host(o: { pop?: number; parcels?: Rect[] } = {}): LandHost & { pop_: number } {
  const h = {
    pop_: o.pop ?? 1000, map: 2048,
    parcels: () => o.parcels ?? [[100, 100, 80, 80] as Rect],
    classOf: (r: Rect): { landClass: ParcelLandClass; houses: number; buildings: number } =>
      r[0] === 180 && r[1] === 140 ? { landClass: 'unbuildable', houses: 0, buildings: 0 }
        : r[0] === 100 && r[1] === 180 ? { landClass: 'town', houses: 2, buildings: 0 }
          : r[0] === 140 && r[1] === 180 ? { landClass: 'commercial', houses: 0, buildings: 1 } : { landClass: 'open', houses: 0, buildings: 0 },
    onRoad: (r: Rect) => r[0] <= 70 && r[0] + r[2] > 70,
    pop() { return h.pop_; },
    version: () => 'v',
  };
  return h;
}

describe('the overlay: the blocks for sale next to your land, and the ones you cannot buy with why (T200)', () => {
  it('every block for sale touches your land along an edge, overlaps none of it and no other block; each priced and banded', () => {
    const h = host(), offers = landOffers(h), buy = offers.filter(o => !o.why);
    assert.equal(buy.length, 5, 'two a side, less the two over the road and the one on the water');
    for (const o of offers) for (const q of offers) if (o !== q) assert.ok(!rectsOverlap(o.rect, q.rect), 'no two blocks overlap');
    for (const o of buy) {
      assert.ok(isAdjacentBlock(h.parcels(), o.rect), `${o.rect} next to your land`);
      assert.equal(o.price, adjacentBlockPrice({ rect: o.rect, landClass: o.landClass, houses: o.houses, buildings: o.buildings, townPop: 1000 }));
      assert.equal(o.band, bandOf(o.price, o.rect)); assert.ok(o.band);
    }
    // the bands: open land cheap ($), town land fair ($$), a shop block dear ($$$): a label with every colour
    const at = (x: number, y: number) => offers.find(o => o.rect[0] === x && o.rect[1] === y)!;
    assert.equal(at(120, 180)?.band ?? at(100, 180).band, 'fair');
    assert.deepEqual([bandOf(6400 * 1.25, [0, 0, 40, 40]), bandOf(6400 * 2, [0, 0, 40, 40]), bandOf(6400 * 4, [0, 0, 40, 40])], ['cheap', 'fair', 'dear']);
    assert.deepEqual(BAND_LABEL, { cheap: '$', fair: '$$', dear: '$$$' });
  });
  it('refused with why: a public road, water; the ring beyond: not next to your land yet', () => {
    const offers = landOffers(host()), whys = new Set(offers.map(o => o.why));
    assert.ok(whys.has(LAND_REFUSE.road) && whys.has(LAND_REFUSE.water) && whys.has(LAND_REFUSE.apart), [...whys].join(' | '));
    for (const o of offers.filter(o => o.why)) { assert.equal(o.price, Infinity); assert.equal(o.band, null); }
    for (const o of offers.filter(o => o.why === LAND_REFUSE.apart)) assert.ok(!isAdjacentBlock(host().parcels(), o.rect), 'the ring is not next to your land');
    assert.ok(offers.filter(o => o.why === LAND_REFUSE.road).every(o => o.rect[0] <= 70 && o.rect[0] + o.rect[2] > 70), 'the road blocks are the ones over it');
  });
});

describe('a click opens the card and never buys; Buy buys exactly the card\'s block at its price (T200)', () => {
  it('a click opens the block\'s card (a refused one too, with why); a click off the blocks closes it; nothing is bought', () => {
    const h = host(), s = new LandSale(h), o = s.offers().find(x => !x.why)!, cx = o.rect[0] + 5, cy = o.rect[1] + 5;
    s.move(cx, cy); assert.equal(s.hover, o);
    assert.equal(s.click(cx, cy), o); assert.equal(s.card, o);
    assert.deepEqual(h.parcels(), [[100, 100, 80, 80]], 'your land is as it was');
    const r = s.offers().find(x => x.why === LAND_REFUSE.road)!;
    s.click(r.rect[0] + 5, r.rect[1] + 5); assert.equal(s.card?.why, LAND_REFUSE.road);
    assert.deepEqual(s.buy(1e9), { ok: false, why: LAND_REFUSE.road }, 'a refused block has no Buy');
    s.click(140, 140); assert.equal(s.card, null, 'your own land: no card');
  });
  it('Buy: the card\'s block at the card\'s price; refused when the price moved (the card shows the new one) or the money is short', () => {
    const h = host(), s = new LandSale(h), o = s.offers().find(x => !x.why)!;
    s.click(o.rect[0] + 1, o.rect[1] + 1);
    assert.deepEqual(s.buy(1e9), { ok: true, rect: o.rect, price: o.price });
    assert.deepEqual(s.buy(o.price - 1), { ok: false, why: `Not enough money: $${o.price.toLocaleString()} (you have $${(o.price - 1).toLocaleString()})` });
    h.pop_ = 9000; // the town grew: the price rose
    const b = s.buy(1e9);
    assert.equal(b.ok, false); assert.match((b as { why: string }).why, /The price changed: now \$/);
    assert.ok(s.card!.price > o.price, 'the card shows the new price');
    assert.deepEqual(s.buy(1e9), { ok: true, rect: o.rect, price: s.card!.price }, 'Buy again at the new price');
  });
  it('the card\'s words: its size, what stands on it, what it adds', () => {
    const f = offerFacts({ rect: [100, 180, 40, 40], landClass: 'town', houses: 2, buildings: 0, price: 12800, band: 'fair', why: null }, [[100, 100, 80, 80]], 7);
    assert.equal(f.size, '6,400 m² · 40 × 40 tiles (80 × 80 m)');
    assert.equal(f.on, '2 houses (bought out at the land price), 7 trees (cleared as you build there)');
    assert.equal(f.adds, '6,400 m² more course land (+25% of yours)');
    assert.equal(offerFacts({ rect: [0, 0, 40, 40], landClass: 'open', houses: 0, buildings: 0, price: 8000, band: 'cheap', why: null }, [[100, 100, 80, 80]]).on, 'Open ground: nothing built');
  });
  it('the engine: a click on the overlay opens the card (on release, after no drag) and only the card\'s Buy buys', () => {
    const src = readFileSync('src/game/engine.ts', 'utf8');
    assert.match(src, /if \(d\?\.kind === 'pan' && d\.land && !d\.moved && this\.landMode\) \{ this\.land\.click\(d\.land\.x, d\.land\.y\);/);
    const calls = [...src.matchAll(/this\.buyLandBlock\(/g)].length;
    assert.equal(calls, 1, 'buyLandBlock is called from buyLandCard alone');
    assert.match(src, /buyLandCard\(\): boolean \{\s*const r = this\.land\.buy\(this\.money\);[\s\S]*?this\.buyLandBlock\(r\.rect, r\.price\)/);
    assert.match(src, /if \(price !== undefined && res\.price !== price\)/, 'the purchase refuses a moved price');
    // Esc closes the card, then the overlay; another tool closes it (a side mode: tool-modes.ts)
    assert.match(src, /if \(this\.landMode && this\.land\.card\) \{ this\.land\.cancel\(\);/);
  });
});

describe('where Land for sale opens: Course › Land for sale, the refusals (T200)', () => {
  it('Course › Land for sale is a leaf of the Course flyout (its lock: the Land chip\'s)', () => {
    const ctx: MenuCtx = { golf: true, ui: null, roads: [], paths: [], junctions: [], surfaces: [], cares: [], propGroups: [], materials: [], plants: [], newHoleWhy: null, range: [] };
    const land = leavesOf(menuOf(RAIL.find(r => r.id === 'course')!, ctx)).find(l => l.row.label === 'Land for sale');
    assert.ok(land); assert.deepEqual(land!.row.leaf?.act, { k: 'land' });
  });
  it('the course brush\'s "not your land" refusal and New hole\'s offer a Land for sale button that opens it at the spot', () => {
    const app = readFileSync('src/App.tsx', 'utf8'), wiz = readFileSync('src/ui/course/HoleWizard.tsx', 'utf8'), eng = readFileSync('src/game/engine.ts', 'utf8');
    assert.match(app, /landAt && <button[^>]*data-testid="refusal-land" onClick=\{\(\) => game\.openLandSale\(landAt\)\}>Land for sale<\/button>/);
    assert.match(wiz, /r\.id === 'land' \|\| \(r\.id === 'left' && \/not your land\/\.test\(r\.text\)\)[\s\S]*?game\.openLandSale\(r\.show\?\.\[0\] \?\? null\)/);
    assert.match(eng, /landRefusalAt\(\): Pt \| null \{[\s\S]*?courseCursor\.state\.kind === 'refused' && \/not your land\/i\.test\(this\.courseCursor\.hint\)/);
    assert.match(eng, /openLandSale\(at\?: Pt \| null\) \{[\s\S]*?if \(at\) \{ this\.camEase = null; this\.cam\.X = at\.x; this\.cam\.Y = at\.y;/);
  });
});

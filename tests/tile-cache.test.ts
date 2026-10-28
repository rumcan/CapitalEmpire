// T272 (#825): the ground workers' tile cache (src/game/tile-cache.ts). On main the cache counted decoded tile set pictures (24) and dropped
// and decoded the course's tiles again and again (741 decodes in 54 bakes over the grown town at 30%). Here a tile is kept as the mips the bakes
// draw, under a byte budget (the worker's share of GAME-PLAN 2.3's 192 MB), least recently used first. The checks: a tile a visible chunk uses
// is never decoded twice in a tour; eviction keeps the cache under its budget; the decodes go once their mip is made; a bake draws the very
// mip main drew (the chain stays each picture the halving of the one before); the bake in hand's pictures are never dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUND_GPU_BYTES, TILE_CACHE_BYTES, TILE_CACHE_MIN, TileCache, halfOf, picBytes, tileCacheBudget, type Pic } from '../src/game/tile-cache';
import { TILE_BANDS, TILED_FAMILIES, snappedCell, tilePermutation, tileIndex, tilePx, tileSize, tileSpec, type TileBand } from '../src/game/painted-tiles';
import { grassZoomLevels } from '../src/game/painted-grass-lod';

const MB = 1e6; // (as boot.ts counts the chunk budget: 32e6 px of RGBA8 is "128 MB")
/** a fake picture: a size, a name (which tile, which level), and whether it was closed */
interface FakePic extends Pic { readonly width: number; readonly height: number; name: string; closed?: boolean }
/** a cache over fake pictures: each URL's native size from the manifest, its decodes counted */
function fakeCache(native: (url: string) => [number, number]) {
  const decodes = new Map<string, number>(), closed: FakePic[] = [];
  const cache = new TileCache<FakePic>({
    decode: async url => { decodes.set(url, (decodes.get(url) ?? 0) + 1); const [w, h] = native(url); return { width: w, height: h, name: `${url}@${w}` }; },
    halve: p => ({ width: halfOf(p.width), height: halfOf(p.height), name: `${p.name.split('@')[0]}@${halfOf(p.width)}` }),
    close: p => { p.closed = true; closed.push(p); },
  });
  return { cache, decodes, closed };
}
/** the mip main's chain (Textures.tileImage before T272) drew for a cell px wide: halvings of the native width while they stay at least px and
 *  above 96, the smallest at least px (the source when none is) */
function mainMipWidth(native: number, px: number): number {
  const chain = [native]; while (chain[chain.length - 1]! > 96 && chain[chain.length - 1]! / 2 >= px) chain.push(halfOf(chain[chain.length - 1]!));
  let w = chain[0]!; for (const c of chain) { if (c >= px) w = c; else break; } return w;
}
/** each family level's tile URLs (fake: `${family}:${band}:${i}`) and their native sizes */
const URLS = new Map<string, [number, number]>();
for (const f of TILED_FAMILIES) for (const b of TILE_BANDS) f.levels[b].tiles.forEach((_, i) => URLS.set(`${f.id}:${b}:${i}`, f.levels[b].native));
const urlsOf = (fam: string, band: TileBand) => [...URLS.keys()].filter(u => u.startsWith(`${fam}:${band}:`));
const nativeOf = (u: string) => URLS.get(u)!;

test('the tile cache budget: the ground\'s 192 MB less the chunk pictures\' budget, shared by the workers', () => {
  // the game: 32e6 px of chunk pictures (128 MB, boot.ts GAME_BOOT.groundPx) and one worker leave 64 MB
  assert.equal(tileCacheBudget(32e6, 1), 64 * MB); assert.equal(TILE_CACHE_BYTES, 64 * MB);
  assert.equal(tileCacheBudget(32e6, 2), 32 * MB, 'two workers keep their own caches: half each');
  // with the chunk budget at most 176 MB, the chunks and every worker's tiles stay inside the 192 MB
  for (const px of [16e6, 24e6, 32e6, 44e6]) for (const w of [1, 2, 3]) assert.ok(px * 4 + tileCacheBudget(px, w) * w <= GROUND_GPU_BYTES + w, `${px} px, ${w} workers`);
  assert.equal(tileCacheBudget(48e6, 1), TILE_CACHE_MIN, 'a boot whose chunks take it all keeps the least');
});

test('tilePx is the widest cell a level\'s tiles take in a chunk raster (the mip a bake draws must be that wide)', () => {
  for (const f of TILED_FAMILIES.slice(0, 8)) for (const b of [0, 1, 2]) for (const dpr of [1, 2]) for (const L of [0.6, 0.3, 0.2, 0.15, 0.1, 0.07, 0.05, 0.035]) {
    const lv = f.levels[TILE_BANDS[b]!], ts = tileSpec(b, dpr), [w, h] = tileSize(lv, ts);
    let widest = 0; for (let ix = -100; ix < 100; ix++) { const [a, , a2] = snappedCell(ix, 0, w, h, L); widest = Math.max(widest, a2 - a); }
    assert.equal(tilePx(lv, ts, L), widest, `${f.id} band ${b} dpr ${dpr} L ${L}`);
  }
});

/** a camera tour: at each zoom, chunks along a pan, each laying a few of the course's families (they come and go chunk by chunk, as the
 *  grown town's lots do: on main a count of 24 decoded sources dropped them in turn), every bake's tiles prepared, drawn and the cache trimmed */
async function tour(cache: TileCache<FakePic>, fams: string[], zooms: number[], rounds = 3) {
  const drawn: { url: string; px: number; pic: FakePic }[] = [];
  for (const z of zooms) {
    const lv = grassZoomLevels(z, 1), b = z <= 0.1 ? 1 : 0, ts = tileSpec(b, 1), band = TILE_BANDS[b]!, L = lv.rasterL;
    for (let r = 0; r < rounds; r++) for (let c = 0; c < 12; c++) {
      // this chunk's families: always the first (the map's grass), then two of the others by turns
      const mine = [fams[0]!, fams[1 + (c % (fams.length - 1))]!, fams[1 + ((c + 2) % (fams.length - 1))]!];
      const want = new Map<string, number>();
      for (const fam of mine) { const f = TILED_FAMILIES.find(x => x.id === fam)!; for (const u of urlsOf(fam, band)) want.set(u, tilePx(f.levels[band], ts, L)); }
      await cache.prepare(want);
      // the paint: each cell of a 600 x 300 chunk draws its tile's mip (as tilesInto: tileImage(url, cell width))
      for (const fam of mine) {
        const f = TILED_FAMILIES.find(x => x.id === fam)!, [w, h] = tileSize(f.levels[band], ts), urls = urlsOf(fam, band), perm = tilePermutation(fam, band, urls.length);
        for (let iy = 0; iy < 3; iy++) for (let ix = c * 2; ix < c * 2 + 3; ix++) {
          const [a, , a2] = snappedCell(ix, iy, w, h, L), url = urls[tileIndex(perm, ix, iy)]!, pic = cache.image(url, a2 - a);
          assert.ok(pic && !pic.closed, `${url} drawn at ${a2 - a} px`); drawn.push({ url, px: a2 - a, pic });
        }
      }
      cache.afterBake();
      assert.ok(cache.bytes <= cache.budget, `after a bake: ${(cache.bytes / MB).toFixed(1)} MB within ${(cache.budget / MB).toFixed(0)} MB`);
    }
  }
  return drawn;
}

test('a tile a visible chunk uses is never decoded twice in a tour (30%, 15%, 8%), at the game\'s budget', async () => {
  const { cache, decodes } = fakeCache(nativeOf); cache.budget = tileCacheBudget(32e6, 1);
  const fams = ['golden-fescue', 'fairway-concept-run', 'green-concept-run', 'lawn-concept-run', 'desert-run'];
  const drawn = await tour(cache, fams, [0.3, 0.15, 0.08]);
  const used = new Set(drawn.map(d => d.url));
  assert.ok(used.size >= 30, `${used.size} tiles used`);
  for (const u of used) assert.equal(decodes.get(u), 1, `${u} decoded once`);
  // and each cell drew the very mip main's chain drew (the same halving of the same picture, at the same width)
  for (const d of drawn) assert.equal(d.pic.width, mainMipWidth(nativeOf(d.url)[0], d.px), `${d.url} at ${d.px} px`);
  // the decodes went once their mips were made: none is held (each 1742 px tile's half-size mip serves 30%)
  assert.ok(cache.bytes < 64 * MB && cache.peak <= cache.budget + 2 * picBytes({ width: 1744, height: 903 }) * 8, `peak ${(cache.peak / MB).toFixed(1)} MB`);
});

test('eviction keeps the cache under its budget, the least recently used tile going first', async () => {
  const { cache, decodes } = fakeCache(nativeOf); cache.budget = 12 * MB;
  const fams = ['golden-fescue', 'fairway-concept-run', 'green-concept-run', 'lawn-concept-run', 'desert-run', 'swamp-run', 'lake', 'dirt-run'];
  await tour(cache, fams, [0.3, 0.15, 0.08, 0.3], 2); // (tour checks the budget after every bake)
  assert.ok([...decodes.values()].some(n => n > 1), 'a budget smaller than the tour\'s tiles decodes some again');
  // least recently used first: a, b, c each at one mip of ~1.57 MB; using a again keeps it when the budget forces one out
  const t = fakeCache(nativeOf), c = t.cache, [a, b, d] = urlsOf('fairway-concept-run', 'near'), px = 688;
  c.budget = 3.5 * picBytes({ width: 688, height: 384 });
  for (const u of [a!, b!, d!]) await c.prepare(new Map([[u, px]]));
  c.afterBake(); assert.deepEqual([c.has(a!), c.has(b!), c.has(d!)], [true, true, true]);
  c.image(a!, px); // a drawn again: b is now the least recently used
  const e = urlsOf('fairway-concept-run', 'near')[3]!; await c.prepare(new Map([[e, px]])); c.afterBake();
  assert.deepEqual([c.has(a!), c.has(b!), c.has(d!), c.has(e)], [true, false, true, true]);
  assert.ok(c.bytes <= c.budget);
});

test('the bake in hand\'s tiles are never dropped (pinned), however small the budget', async () => {
  const { cache } = fakeCache(nativeOf); cache.budget = 1 * MB;
  const want = new Map(urlsOf('lake', 'near').map(u => [u, 871]));
  await cache.prepare(want); // (pinned through its own trim: 4 mips of 1.57 MB, past the budget)
  for (const u of want.keys()) assert.ok(cache.image(u, 871), `${u} there for the bake`);
  cache.afterBake(); assert.ok(cache.bytes <= cache.budget, 'the trim after the bake brings it back');
  // a decode finishing meanwhile (a look-ahead, a prewarm) never trims a pinned tile away (T194)
  const pinned = urlsOf('dirt-run', 'near'), other = urlsOf('desert-run', 'near');
  cache.budget = 4 * MB;
  await cache.prepare(new Map(pinned.map(u => [u, 871])));
  await cache.prepare(new Map(other.map(u => [u, 871])), pinned);
  for (const u of pinned) assert.ok(cache.has(u), `${u} kept for the bake in hand`);
});

test('a decode goes once its mip is made, and comes back joined to the mips kept (the same pictures main drew)', async () => {
  const { cache, decodes, closed } = fakeCache(nativeOf), [u] = urlsOf('golden-fescue', 'near'), [w] = nativeOf(u!);
  await cache.prepare(new Map([[u!, 400]])); // (the quarter-size mip, made through the half-size one)
  assert.equal(decodes.get(u!), 1); assert.ok(closed.some(p => p.width === w), 'the full-size decode closed');
  const quarter = cache.image(u!, 400)!; assert.equal(quarter.width, mainMipWidth(w, 400)); assert.equal(quarter.width, halfOf(halfOf(w)));
  assert.ok(cache.ready(u!, 871), 'the half-size mip kept: 30% needs no decode');
  assert.ok(!cache.ready(u!, w), 'a full-size cell (dpr 2 at 30%) needs the decode again');
  await cache.prepare(new Map([[u!, w]])); assert.equal(decodes.get(u!), 2);
  assert.equal(cache.image(u!, 400), quarter, 'the kept mips stay in the chain behind the new decode');
  assert.equal(cache.image(u!, w)!.width, w, 'the decode is drawn itself');
  cache.afterBake(); assert.ok(cache.ready(u!, w), 'a decode a bake drew is a used picture: kept');
  // a tile whose cells need its full size (1743 px wide at 872 px: no half is that wide) keeps its decode as the picture it draws
  const odd = [...URLS].find(([, n]) => n[0] === 1743)?.[0];
  if (odd) { await cache.prepare(new Map([[odd, 872]])); assert.equal(cache.image(odd, 872)!.width, 1743); cache.afterBake(); assert.ok(cache.ready(odd, 872)); }
});

test('one decode however many bakes wait for it, and a failed decode leaves the tile not decoded', async () => {
  const errors: string[] = [];
  let calls = 0;
  const cache = new TileCache<FakePic>({
    decode: url => { calls++; return url.endsWith('bad') ? Promise.reject(new Error('404')) : new Promise(r => setTimeout(() => r({ width: 1742, height: 902, name: url }), 5)); },
    halve: p => ({ width: halfOf(p.width), height: halfOf(p.height), name: p.name }), close: () => {},
  });
  cache.on.error = u => errors.push(u);
  await Promise.all([cache.prepare(new Map([['t', 871]])), cache.prepare(new Map([['t', 436]]))]);
  assert.equal(calls, 1); assert.ok(cache.image('t', 871) && cache.image('t', 436));
  await cache.prepare(new Map([['bad', 871]])); assert.deepEqual(errors, ['bad']); assert.equal(cache.image('bad', 871), null);
});

test('the swamp\'s gloss asks for a dropped decode: kept by the next preparation until it is read, then it goes', async () => {
  const { cache, decodes } = fakeCache(nativeOf), [u] = urlsOf('swamp-run', 'near');
  await cache.prepare(new Map([[u!, 688]])); cache.afterBake();
  assert.equal(cache.source(u!), null, 'dropped once its mip was made');
  assert.ok(!cache.ready(u!, 688), 'asked for: the next preparation decodes it again');
  await cache.prepare(new Map([[u!, 688]])); cache.trim(); assert.equal(decodes.get(u!), 2);
  assert.ok(cache.source(u!), 'kept until read'); cache.afterBake(); assert.equal(cache.peek(u!, 2000), null, 'then it goes');
  assert.ok(cache.ready(u!, 688));
});

test('the swamp\'s pre-scaled copies live in the same budget, with their tile', async () => {
  const { cache } = fakeCache(nativeOf), [u] = urlsOf('swamp-run', 'near');
  await cache.prepare(new Map([[u!, 688]]));
  let made = 0; const make = (from: FakePic) => { made++; assert.equal(from.width, 688); return { width: 688, height: 385, name: 'copy' }; };
  const a = cache.exact(u!, 688, 385, make), b = cache.exact(u!, 688, 385, make);
  assert.ok(a && a === b && made === 1, 'made once, kept');
  const before = cache.bytes; cache.exact(u!, 687, 384, make); assert.equal(cache.bytes - before, picBytes({ width: 688, height: 385 }), 'counted');
  cache.budget = 0; cache.trim(); assert.equal(cache.size, 0, 'dropped with the tile'); assert.equal(cache.bytes, 0);
});

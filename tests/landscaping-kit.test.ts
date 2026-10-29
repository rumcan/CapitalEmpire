import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { LIBRARY, ATLAS_PAGES } from '../src/game/library';
import { DECOR } from '../src/game/golf/decor';
import { KIT_GREY_GRANITE, KIT_WATER_EDGE_PLANTS } from '../src/game/kit';
import { drawnAs } from '../src/game/mirror';

test('component-aware native exports preserve overlapping foliage bounds and faint edge pixels', async () => {
  const { partitionSheet } = await import(pathToFileURL(path.resolve('scripts/assets/prep-landscaping-kit.mjs')).href);
  const W = 90, H = 60, rgba = Buffer.alloc(W * H * 4);
  const pixel = (x: number, y: number, alpha = 255) => { const p = (y * W + x) * 4; rgba[p] = x; rgba[p + 1] = y; rgba[p + 2] = 125; rgba[p + 3] = alpha; };
  const rect = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pixel(x, y); };
  for (const x of [4, 31, 60]) rect(x, 5, x + 14, 20);
  rect(4, 38, 18, 50); rect(28, 37, 45, 50); rect(60, 38, 78, 55);
  for (let y = 51; y <= 55; y++) pixel(18, y);
  for (let x = 19; x <= 34; x++) pixel(x, 55); // crosses the naive 30px cell boundary, but passes below the next plant
  for (let x = 19; x < 28; x++) pixel(x, 44, 1); // faint edge pixels connect two otherwise distinct plants
  const pieces = partitionSheet(rgba, W, H);
  assert.equal(pieces.length, 6); assert.ok(pieces[3].coreBounds.width > W / 3);
  const rebuilt = Buffer.alloc(rgba.length), seen = new Set<number>();
  for (const p of pieces) for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    const from = (y * p.width + x) * 4; if (!p.rgba[from + 3]) continue;
    const to = ((p.sourceRect.top + y) * W + p.sourceRect.left + x) * 4;
    assert.ok(!seen.has(to), 'a visible source pixel belongs to only one exported object'); seen.add(to); p.rgba.copy(rebuilt, to, from, from + 4);
  }
  assert.deepEqual(rebuilt, rgba, 'every visible RGBA pixel preserved without clipping or repainting');
});

test('twelve accepted native crops have exact source hashes and reconstruct every visible source pixel', async () => {
  const sharp = (await import(['sharp'][0]!)).default;
  for (const slug of ['golf-stone-boulders-grey-v1', 'golf-water-edge-plants-v1']) {
    const base = `art/theme-consistency/generated/landscaping/${slug}`, r = JSON.parse(await fs.readFile(`${base}/native-export.json`, 'utf8'));
    const bytes = await fs.readFile(r.source.file); assert.equal(createHash('sha256').update(bytes).digest('hex'), r.source.sha256);
    const source = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), seen = new Uint8Array(source.info.width * source.info.height); let total = 0;
    assert.equal(r.subjects.length, 6);
    for (const s of r.subjects) {
      const png = await fs.readFile(s.file); assert.equal(createHash('sha256').update(png).digest('hex'), s.sha256);
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        const from = (y * info.width + x) * 4; if (!data[from + 3]) continue;
        const to = (s.sourceRect.top + y) * source.info.width + s.sourceRect.left + x;
        assert.equal(seen[to], 0); seen[to] = 1; total++;
        assert.equal(data.readUInt32LE(from), source.data.readUInt32LE(to * 4), 'native source RGBA is unchanged');
      }
    }
    let sourceCount = 0; for (let p = 0; p < seen.length; p++) if (source.data[p * 4 + 3]) { sourceCount++; assert.equal(seen[p], 1); }
    assert.equal(total, sourceCount); assert.equal(total, r.pixelCoverage.preservedNonzero);
  }
});

test('organic art is twelve unique tail records on the existing golf page and twelve placeable, unmirrored cards', async () => {
  const masters = JSON.parse(await fs.readFile('art/landscaping-kit/items.json', 'utf8')).items;
  const ids = masters.map((x: { id: string }) => x.id), expected = [...KIT_GREY_GRANITE, ...KIT_WATER_EDGE_PLANTS].map(p => p.id);
  assert.deepEqual(ids, expected); assert.equal(new Set(ids).size, 12);
  assert.deepEqual(LIBRARY.slice(-12).map(p => p.id), ids, 'new records append after every previous library, including supplemental views');
  const golfPage = LIBRARY.find(p => p.id === 'kit:shrub-burning-bush')!.tex[0]; // tournament building pictures may be replaced by their views page
  assert.equal(new Set(LIBRARY.slice(-12).map(p => p.tex[0])).size, 1);
  for (const id of ids) {
    const matches = LIBRARY.filter(p => p.id === id); assert.equal(matches.length, 1);
    assert.equal(matches[0].tex[0], golfPage); assert.ok(matches[0].tex.slice(1).every(v => v >= 0 && v <= 1));
    assert.deepEqual(drawnAs(matches[0], true), [id, false]); assert.deepEqual(drawnAs(matches[0], false), [id, false]);
    const cards = DECOR.filter(d => d.id === id); assert.equal(cards.length, 1); assert.equal(cards[0].natural, true); assert.equal(cards[0].standIn, undefined);
  }
  const golfSource = await fs.readFile('src/game/golf-library.ts', 'utf8');
  assert.match(golfSource, /appendLandscapeArt/); assert.ok(ATLAS_PAGES[golfPage].length >= 5);
  const generator = await fs.readFile('scripts/assets/prep-sprites.mjs', 'utf8');
  assert.ok(generator.indexOf("'appendRangeArt(LIBRARY);") < generator.indexOf("'appendLandscapeArt(LIBRARY);"), 'a normal rebuild retains the old range then new tail');
});

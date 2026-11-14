import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ACTION_TILES, TOOL_TILES, TOOL_TILES_V1, TOOL_TILES_V2, TOOL_TILES_V3, TOOL_TILES_V4, TOOL_TILES_V5, TOOL_TILES_V6, TOOL_TILES_V7, TOOL_TILES_V8, TOOL_TILES_V9 } from '../src/ui/tool-tiles';

test('each sheet keeps its subject identity; unknown or contradictory versions fail before writing', async () => {
  const prep = await import(pathToFileURL(path.resolve('scripts/assets/prep-ui-tool-tiles.mjs')).href);
  assert.deepEqual(prep.SHEET_NAMES.v1.flat(), [...TOOL_TILES_V1]);
  assert.deepEqual(prep.SHEET_NAMES.v2.flat(), [...TOOL_TILES_V2]);
  assert.equal(new Set([...TOOL_TILES_V1, ...TOOL_TILES_V2]).size, 24);
  // J8 (#1261): the action tiles of sheets v3 to v6, 48 more, none named like an older tile
  assert.deepEqual(prep.SHEET_NAMES.v3.flat(), [...TOOL_TILES_V3]);
  assert.deepEqual(prep.SHEET_NAMES.v4.flat(), [...TOOL_TILES_V4]);
  assert.deepEqual(prep.SHEET_NAMES.v5.flat(), [...TOOL_TILES_V5]);
  assert.deepEqual(prep.SHEET_NAMES.v6.flat(), [...TOOL_TILES_V6]);
  assert.deepEqual(prep.SHEET_NAMES.v7.flat(), [...TOOL_TILES_V7]);
  assert.deepEqual(prep.SHEET_NAMES.v8.flat(), [...TOOL_TILES_V8]);
  assert.deepEqual(prep.SHEET_NAMES.v9.flat(), [...TOOL_TILES_V9]);
  assert.equal(ACTION_TILES.length, 84);
  assert.equal(new Set([...TOOL_TILES, ...ACTION_TILES]).size, 108, 'one hundred and eight different names');
  for (const v of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9']) assert.equal(prep.sheetVersion(`golf-build-tool-tiles-sheet-${v}.png`), v);
  assert.throws(() => prep.sheetVersion('golf-build-tool-tiles-sheet-v10.png'), /specify --version/);
  assert.throws(() => prep.sheetVersion('unknown.png'), /specify --version/);
  assert.throws(() => prep.sheetVersion('golf-build-tool-tiles-sheet-v2.png', 'v1'), /not v1/);
  assert.throws(() => prep.sheetVersion('golf-build-tool-tiles-sheet-v5.png', 'v3'), /not v3/);
  assert.equal(prep.sheetVersion('an-explicit-copy.png', 'v2'), 'v2');
  assert.equal(prep.sheetVersion('an-explicit-copy.png', 'v6'), 'v6');
});

test('preparing the second grid writes new subjects and preserves an existing tee icon', async () => {
  const prep = await import(pathToFileURL(path.resolve('scripts/assets/prep-ui-tool-tiles.mjs')).href);
  const sharp = (await import(['sharp'][0]!)).default;
  const folder = path.resolve('output/t272-fixtures'); await fs.mkdir(folder, { recursive: true });
  const tmp = await fs.mkdtemp(path.join(folder, 'sheet-'));
  try {
    const source = path.join(tmp, 'golf-build-tool-tiles-sheet-v2.png'), outputDir = path.join(tmp, 'tiles');
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="560" height="420"><rect width="560" height="420" fill="#1c1f26"/>';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) svg += `<rect x="${20 + c * 135}" y="${20 + r * 135}" width="115" height="115" rx="12" fill="#1e2a44"/>`;
    svg += '</svg>'; await sharp(Buffer.from(svg)).png().toFile(source);
    await fs.mkdir(outputDir); const old = Buffer.from('existing original tee bytes'); await fs.writeFile(path.join(outputDir, 'tee.webp'), old);
    const report = await prep.prepUiToolTiles({ source, outputDir });
    assert.equal(report.version, 'v2'); assert.equal(report.tiles.length, 12);
    assert.deepEqual(await fs.readFile(path.join(outputDir, 'tee.webp')), old);
    assert.deepEqual(report.tiles.map((t: { name: string }) => t.name), [...TOOL_TILES_V2]);
    for (const tile of report.tiles) assert.deepEqual((await sharp(await fs.readFile(tile.file)).metadata()).width, 144);
  } finally {
    assert.ok(path.resolve(tmp).startsWith(folder + path.sep)); await fs.rm(tmp, { recursive: true, force: true });
  }
});

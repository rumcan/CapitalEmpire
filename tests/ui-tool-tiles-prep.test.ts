import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TOOL_TILES_V1, TOOL_TILES_V2 } from '../src/ui/tool-tiles';

test('each sheet keeps its subject identity; unknown or contradictory versions fail before writing', async () => {
  const prep = await import(pathToFileURL(path.resolve('scripts/assets/prep-ui-tool-tiles.mjs')).href);
  assert.deepEqual(prep.SHEET_NAMES.v1.flat(), [...TOOL_TILES_V1]);
  assert.deepEqual(prep.SHEET_NAMES.v2.flat(), [...TOOL_TILES_V2]);
  assert.equal(new Set([...TOOL_TILES_V1, ...TOOL_TILES_V2]).size, 24);
  assert.throws(() => prep.sheetVersion('unknown.png'), /specify --version/);
  assert.throws(() => prep.sheetVersion('golf-build-tool-tiles-sheet-v2.png', 'v1'), /not v1/);
  assert.equal(prep.sheetVersion('an-explicit-copy.png', 'v2'), 'v2');
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

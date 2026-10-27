import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LIBRARY } from '../src/game/library';
import { AXIS_HEADING, AXIS_SETS } from '../src/game/axis-library';
import { EXTRA_VIEW_SETS } from '../src/game/extra-views-library';
import { drawnAs } from '../src/game/mirror';
import { axisViews, drawnView, fourViews, roadView, setRoadHeadings, sizeKey, sizeViews, turned } from '../src/game/lots/preset-art';
import { placeable } from '../src/game/lots/item-kinds';
import { OWNER_SCALE } from '../src/game/lots/scales';

const BY = new Map(LIBRARY.map((it, i) => [it.id, i]));

test('accepted garages select separate authored pictures for all eight road headings', () => {
  assert.ok(Object.keys(EXTRA_VIEW_SETS).length > 0, 'real accepted artwork is packed');
  for (const [base, diagonal] of Object.entries(EXTRA_VIEW_SETS)) for (let road = 0; road < 8; road++) for (let view = 0; view < 4; view++) {
    const expected = road % 2 ? AXIS_SETS[base]![((road - 1) / 2 + view) % 4]! : diagonal[(road / 2 + view) % 4]!;
    assert.equal(roadView(base, road, view), expected);
    const angle = road * Math.PI / 4, result = drawnView(base, { q: Math.floor(road / 2), n: { x: -Math.sin(angle), y: -Math.cos(angle) } }, view);
    assert.deepEqual(result, { id: expected, flip: false, diag: road % 2 === 1 });
  }
  setRoadHeadings(false);
  try { for (const base of Object.keys(EXTRA_VIEW_SETS)) assert.equal(roadView(base, 0, 0), null); }
  finally { setRoadHeadings(true); }
});

test('garage diagonals append after all old art without reinterpreting N or its turns', () => {
  const diagonal = new Set(Object.values(EXTRA_VIEW_SETS).flat()), old = LIBRARY.filter(it => !diagonal.has(it.id));
  assert.deepEqual(LIBRARY.slice(0, old.length).map(it => it.id), old.map(it => it.id));
  for (const [base, views] of Object.entries(EXTRA_VIEW_SETS)) {
    assert.match(base, /^(?:ce:parking-garage-[2-6]storey|landscape:)/);
    assert.deepEqual(views, ['ne', 'se', 'sw', 'nw'].map(dir => `view:${base}:${dir}`));
    assert.equal(AXIS_SETS[base]?.[0], base);
    assert.equal(AXIS_HEADING[base], 'N');
    assert.equal(axisViews(base)?.at, 0);
    assert.equal(fourViews(base), null, 'base is still axis N');
    assert.equal(turned(base, 1).id, `view:${base}:e`);
    for (const [at, id] of views.entries()) {
      const index = BY.get(id); assert.notEqual(index, undefined);
      const it = LIBRARY[index!]!;
      assert.deepEqual(fourViews(id), { views: [...views], at });
      assert.equal(sizeKey(id), base);
      assert.equal(OWNER_SCALE[id], OWNER_SCALE[base]);
      assert.ok(sizeViews(base).includes(id));
      assert.deepEqual(turned(id, 1), { id: views[(at + 1) % 4], flip: false });
      assert.deepEqual(drawnAs(it, true), [views[[1, 0, 3, 2][at]!], false]);
      assert.deepEqual(drawnAs(it, false), [id, false]);
      assert.equal(placeable(it, index!), at === 0, 'NE offered once; R turns to other diagonal views');
      if (base.startsWith('ce:')) assert.deepEqual([it.boxes[0]!.hx, it.boxes[0]!.hy], at % 2 ? [9, 13] : [13, 9]);
      else assert.equal(it.w, LIBRARY[BY.get(base)!]!.w, 'bush width keeps its existing Studio size');
    }
    assert.equal(sizeViews(base).length, 8);
  }
});

type Prep = { prepExtraViews: (folders: string[], options: { root: string }) => Promise<{ subjects: number; views: number; pages: number }> };

test('garage importer requires review, all crops, exact id and hashes; native copies are byte-identical', async () => {
  const url = pathToFileURL(path.resolve('scripts/assets/prep-extra-views.mjs')).href;
  const { prepExtraViews } = await import(url) as Prep;
  const sharp = (await import(['sharp'][0]!)).default;
  const fixtureFolder = path.resolve('output/garage-tests-fixtures'); fs.mkdirSync(fixtureFolder, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureFolder, 'garage-views-test-'));
  const write = (name: string, content: string | Buffer) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };
  const generated = path.join(root, 'generated'), version = 'parking-garage-2storey-4views-v2', source = `generated/${version}.provenance.json`;
  const provenance = { id: 'ce:parking-garage-2storey', storeys: 2, integrationStatus: 'blocked' };
  const png = await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: await sharp({ create: { width: 20, height: 20, channels: 4, background: '#876341' } }).png().toBuffer(), left: 10, top: 10 }]).png().toBuffer();
  try {
    const base = LIBRARY[BY.get(provenance.id)!]!;
    write('src/game/axis-library.ts', `const ITEMS = [\n${JSON.stringify(base)}\n];\n`);
    write('src/game/extra-views-library.ts', fs.readFileSync(path.resolve('src/game/extra-views-library.ts')));
    write(source, JSON.stringify(provenance)); write(`generated/${version}.png`, png);
    for (const dir of ['NE', 'SE', 'SW']) write(`generated/${version}/${dir}.native.png`, png);
    assert.equal((await prepExtraViews([generated], { root })).views, 0, 'blocked art never enters');
    write(source, JSON.stringify({ ...provenance, integrationStatus: 'ready' }));
    assert.equal((await prepExtraViews([generated], { root })).views, 0, 'incomplete sheet never enters');
    write(`generated/${version}/NW.native.png`, png);
    write(source, JSON.stringify({ ...provenance, id: 'ce:parking-garage-3storey', integrationStatus: 'ready' }));
    await assert.rejects(prepExtraViews([generated], { root }), /game id must be/);
    write(source, JSON.stringify({ ...provenance, integrationStatus: 'ready', sheetSha256: 'bad' }));
    await assert.rejects(prepExtraViews([generated], { root }), /source sheet hash mismatch/);
    write(source, JSON.stringify({ ...provenance, integrationStatus: 'ready' }));
    assert.deepEqual(await prepExtraViews([generated], { root }), { subjects: 1, views: 4, pages: 1 });
    for (const dir of ['NE', 'SE', 'SW', 'NW']) assert.deepEqual(fs.readFileSync(path.join(root, 'art/extra-views/parking-garage-2storey', `${dir}.png`)), png);
    const module = fs.readFileSync(path.join(root, 'src/game/extra-views-library.ts'), 'utf8');
    assert.match(module, /view:ce:parking-garage-2storey:ne/);
    assert.match(module, /view:ce:parking-garage-2storey:nw/);
    assert.equal(module.match(/\{"id":"ce:parking-garage-2storey"/), null, 'base/N is never replaced');
    write('src/game/lots/scales.ts', "export const OWNER_SCALE: Record<string, number> = { 'ce:parking-garage-2storey': 1.4 }; export const REMOVED_IDS: string[] = [];\n");
    const esbuild = await import(['esbuild'][0]!);
    const outfile = path.join(root, 'packed-garage.mjs');
    await esbuild.build({ entryPoints: [path.join(root, 'src/game/extra-views-library.ts')], bundle: true, platform: 'node', format: 'esm', outfile, loader: { '.webp': 'empty' }, logLevel: 'silent' });
    type Packed = { appendExtraViews: (library: typeof LIBRARY, pages: string[][]) => void; EXTRA_VIEW_SETS: Record<string, string[]> };
    const packed = await import(pathToFileURL(outfile).href) as Packed;
    const prior = [base], pages: string[][] = [['old-mip.webp']];
    packed.appendExtraViews(prior, pages);
    assert.equal(prior[0], base, 'base object and its index remain exactly unchanged');
    assert.equal(prior.length, 5, 'four real diagonal records appended');
    assert.equal(pages.length, 2, 'new atlas pages follow existing pages');
    assert.deepEqual(new Set(prior.slice(1).map(it => it.id)), new Set(packed.EXTRA_VIEW_SETS[provenance.id]));
    for (const it of prior.slice(1)) assert.equal(it.tex[0], 1, 'atlas page offset applied');
    packed.appendExtraViews(prior, pages);
    assert.equal(prior.length, 5, 'no duplicate sprite IDs on repeated append');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

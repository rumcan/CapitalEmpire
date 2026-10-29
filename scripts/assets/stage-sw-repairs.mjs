// Stage explicitly approved individual SW-facing fronts from four-subject sheets.
// Never interprets the four cells as four directions of one building.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { calibratedViewScale, calibratedFootprintScale } from './view-calibration.mjs';
import { readScales } from './overrides.mjs';
import { partitionSheet } from './prep-landscaping-kit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceRoot = path.resolve(process.argv[3] ?? root);
const selection = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const authorityBytes = fs.readFileSync(path.resolve(sourceRoot, selection.authority.file));
if (sha(authorityBytes) !== selection.authority.sha256) throw Error('Canonical approval changed');
const authority = JSON.parse(authorityBytes);
const dirs = ['NE', 'SE', 'SW', 'NW'];
const store = path.join(root, 'art/building-views');
const measuresFile = path.join(store, 'measures.json'), measures = read(measuresFile);
const scales = readScales(), scaleText = fs.readFileSync(path.join(root, 'src/game/lots/scales.ts'), 'utf8');
const items = new Map();
for (const lib of ['library','east-library','business-library','construction-library','golf-library','cars-library']) {
  const text = fs.readFileSync(path.join(root, `src/game/${lib}.ts`), 'utf8');
  for (let i = text.indexOf('{"id":"'); i >= 0; i = text.indexOf('{"id":"', i + 1)) {
    let depth = 0, quote = false, j = i;
    for (; j < text.length; j++) {
      const c = text[j];
      if (quote) { if (c === '\\') j++; else if (c === '"') quote = false; }
      else if (c === '"') quote = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) break;
    }
    const it = JSON.parse(text.slice(i, j + 1)); if (!items.has(it.id)) items.set(it.id, it); i = j;
  }
}
const output = path.join(root, 'art/theme-consistency/generated/buildings/sw-road-fixes/ready');
fs.mkdirSync(output, { recursive: true });
const audit = [];
const partitions = new Map();
for (const pick of selection.repairs) {
  if (pick.status !== 'ready' || pick.canonicalView !== 'NE' || pick.streetFacing !== 'SW') throw Error(`Unapproved/mislabelled repair ${pick.id}`);
  const sheetFile = path.resolve(sourceRoot, pick.sheet), sheet = fs.readFileSync(sheetFile);
  if (sha(sheet) !== pick.sheetSha256) throw Error(`Sheet changed: ${pick.sheet}`);
  if (!authority.selected.some(s => s.id === pick.id && s.cell === pick.cell && s.sheetSha256 === pick.sheetSha256)) throw Error(`Subject/cell not canonically approved: ${pick.id}`);
  const reviewBytes = fs.readFileSync(path.resolve(sourceRoot, pick.geometryReview.file)), review = JSON.parse(reviewBytes);
  if (sha(reviewBytes) !== pick.geometryReview.sha256 || review.source.sha256 !== pick.sheetSha256 || !review.cells.some(c => c.cell === pick.cell && c.status === 'ready-for-integration-review')) throw Error(`Missing exact geometry approval: ${pick.id}`);
  const original = path.join(store, pick.slug), source = read(path.join(original, 'source.json'));
  if (source.id !== pick.id || source.version !== pick.originalVersion) throw Error(`Current source differs for ${pick.id}`);
  const base = items.get(pick.id); if (!base) throw Error(`Unknown library ID ${pick.id}`);
  const old = measures.subjects[pick.id]; if (old?.pin) throw Error(`Pinned subject needs explicit review: ${pick.id}`);
  const owner = scales[pick.id] ?? +(new RegExp(`"${pick.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}": ([0-9.]+)`).exec(scaleText)?.[1] ?? 1);
  const kg = old?.gaugeScale ?? owner;
  const existing = [];
  for (const dir of dirs) {
    const bytes = fs.readFileSync(path.join(original, dir + '.png'));
    if (sha(bytes) !== source.files[dir]) throw Error(`Original PNG changed: ${pick.id} ${dir}`);
    const meta = await sharp(bytes).metadata();
    existing.push({ dir, bytes, W: meta.width, s: calibratedViewScale(old?.views?.[dir], source.files[dir], measures.standardDoor, kg) });
  }
  const measured = base.kind === 'business' ? [] : existing.filter(v => v.s);
  const fallback = measured.length ? measured.reduce((n, v) => n + v.s, 0) / measured.length : (base.quad[2] - base.quad[0]) / existing[0].W;
  for (const v of existing) if (!v.s || base.kind === 'business') v.s = fallback;
  if (base.kind !== 'business') {
    const cap = 3 / (0.6 * owner);
    if (Math.max(...existing.map(v => v.s / cap)) > 1.001) for (const v of existing) v.s = Math.min(v.s, cap);
  }
  const f = calibratedFootprintScale(old, source.version, base.kind === 'business' ? 1 : existing[0].W * existing[0].s / (base.quad[2] - base.quad[0]));
  const version = pick.version;
  if (!new RegExp(`^${pick.slug}-4views-v[0-9]+$`).test(version)) throw Error(`Invalid repair version ${version}`);
  const dest = path.join(output, version); fs.mkdirSync(dest, { recursive: true });
  let front, crop = { sourceRect: pick.rect, processing: 'Literal native rectangle, no resample' };
  if (pick.partition === 'nearest-alpha-core') {
    if (!partitions.has(pick.sheetSha256)) {
      const { data, info } = await sharp(sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      partitions.set(pick.sheetSha256, partitionSheet(data, info.width, info.height, 4));
    }
    const piece = partitions.get(pick.sheetSha256)[pick.cell - 1];
    if (!piece) throw Error(`Invalid cell ${pick.cell}`);
    front = await sharp(piece.rgba, { raw: { width: piece.width, height: piece.height, channels: 4 } }).png().toBuffer();
    crop = { sourceRect: piece.sourceRect, coreBounds: piece.coreBounds, nonzeroPixels: piece.nonzeroPixels,
      processing: 'Existing lossless nearest-alpha-core partition; native RGBA copied once, neighboring subjects excluded; no resample/repaint/warp' };
  } else front = await sharp(sheet).extract(pick.rect).png().toBuffer();
  const files = {};
  for (const v of existing) {
    const bytes = v.dir === 'NE' ? front : v.bytes;
    files[v.dir] = sha(bytes); fs.writeFileSync(path.join(dest, `${v.dir}.native.png`), bytes);
  }
  const retained = Object.fromEntries(existing.slice(1).map(v => [v.dir, { sha256: files[v.dir], nativeScale: v.s, note: `Retain exact pre-repair game scale from ${source.version}` }]));
  if (!(pick.door > 0 || (Number.isFinite(pick.nativeScale) && pick.nativeScale > 0))) throw Error(`Missing explicit native calibration for ${pick.id}`);
  const frontMeasure = { sha256: files.NE, ...(pick.nativeScale > 0 ? { nativeScale: pick.nativeScale } : { door: pick.door }), note: pick.doorNote ?? pick.scaleNote };
  measures.subjects[pick.id] = { ...old, version, gaugeScale: kg, footprintScale: f,
    views: { NE: frontMeasure, ...retained } };
  const provenance = { id: pick.id, generator: 'image_gen', integrationStatus: 'ready',
    repair: { physicalStreetFacing: 'SW', canonicalView: 'NE', sheet: pick.sheet, sheetSha256: pick.sheetSha256, cell: pick.cell, ...crop, geometryReview: pick.geometryReview },
    authority: selection.authority, original: source, retainedDirections: dirs.slice(1), files };
  fs.writeFileSync(path.join(output, `${version}.provenance.json`), JSON.stringify(provenance, null, 2) + '\n');
  audit.push({ id: pick.id, version, files, original: source, footprintScale: f, gaugeScale: kg, retainedNativeScales: Object.fromEntries(existing.slice(1).map(v => [v.dir, v.s])) });
}
fs.writeFileSync(measuresFile, JSON.stringify(measures, null, 1) + '\n');
fs.writeFileSync(path.join(output, 'staging-audit.json'), JSON.stringify(audit, null, 2) + '\n');
console.log(JSON.stringify({ subjects: audit.length, scopedImport: 'node scripts/assets/prep-views.mjs art/theme-consistency/generated/buildings/sw-road-fixes/ready' }));

// The hand-painted ground families (T128, #147): the art model's new paintings with real spatial coverage
// (art/theme-consistency/generated/ground/new-painted-spatial-scales-20261025.json: near 40 m, mid 320 m, far 4096 m per 1024 px tile) as WebP in
// src/assets/ground/painted/fam/<family>-<level>-<version>.webp, and the registry the game, the tests and the studio read:
// src/game/painted-families.json (each family's levels by version, its coverage, the default pick per level and each picture's mean colour).
// Every version that has a processed 1024 px PNG is kept (the studio lets the owner pick any); the default picks are below (by looking at the
// art and its seam diagnostics: the repaired v2 near paintings and the exposure-matched v3 macro win). The paintings are not regraded: the
// owner tints and tones them per surface in the studio. A grass length with no macro paintings of its own borrows its palette's mid and far
// (the spatial-scales JSON's grassMacroReuse: blade length is below a pixel at 320 m and 4096 m).
//   node scripts/assets/prep-painted-families.mjs [--src <art dir>]
// The art is read from this checkout's art/ folder, else from the main checkout's (a .claude/worktrees/<name> worktree), never written.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from './source.mjs';

const REL = 'art/theme-consistency/generated/ground';
const argSrc = process.argv.indexOf('--src') >= 0 ? process.argv[process.argv.indexOf('--src') + 1] : null;
const SRC = path.resolve(argSrc ?? [path.join(ROOT, REL), path.join(ROOT, '../../..', REL)].find(p => fs.existsSync(path.join(p, 'painted-scaled'))) ?? path.join(ROOT, REL));
const OUT = path.join(ROOT, 'src/assets/ground/painted/fam'), REG = path.join(ROOT, 'src/game/painted-families.json');
const LEVELS = ['near', 'mid', 'far'];
const QUALITY = { near: 86, mid: 84, far: 84, side: 86 };
fs.mkdirSync(OUT, { recursive: true });

/** the families: id, plain name, kind (grass, sand, water, cut: a wall's cut face), palette and length (grass), the art folder prefix under
 *  painted-scaled/ (versions are its -v<n> folders), the coverage per level (metres one tile covers), the default version per level, and the
 *  family whose mid and far it borrows when it has none */
const SCALED = { near: 40, mid: 320, far: 4096 };
const FAMILIES = [
  { id: 'emerald-short', name: 'Emerald, short', kind: 'grass', palette: 'emerald', length: 'short', dir: 'grass-emerald-short', pick: { near: 'v2', mid: 'v3', far: 'v2' } },
  { id: 'emerald-medium', name: 'Emerald, medium', kind: 'grass', palette: 'emerald', length: 'medium', dir: 'grass-emerald-medium', pick: { near: 'v2' }, borrow: 'emerald-short' },
  { id: 'emerald-long', name: 'Emerald, long', kind: 'grass', palette: 'emerald', length: 'long', dir: 'grass-emerald-long', pick: { near: 'v1' }, borrow: 'emerald-short' },
  { id: 'sage-short', name: 'Sage, short', kind: 'grass', palette: 'sage', length: 'short', dir: 'grass-sage-short', pick: { near: 'v2' }, borrow: 'sage-medium' },
  { id: 'sage-medium', name: 'Sage, medium', kind: 'grass', palette: 'sage', length: 'medium', dir: 'grass-sage-medium', pick: { near: 'v1', mid: 'v2', far: 'v3' } },
  { id: 'sage-long', name: 'Sage, long', kind: 'grass', palette: 'sage', length: 'long', dir: 'grass-sage-long', pick: { near: 'v1' }, borrow: 'sage-medium' },
  { id: 'straw-short', name: 'Straw, short', kind: 'grass', palette: 'straw', length: 'short', dir: 'grass-straw-short', pick: { near: 'v2' }, borrow: 'straw-long' },
  { id: 'straw-medium', name: 'Straw, medium', kind: 'grass', palette: 'straw', length: 'medium', dir: 'grass-straw-medium', pick: { near: 'v1' }, borrow: 'straw-long' },
  { id: 'straw-long', name: 'Straw, long', kind: 'grass', palette: 'straw', length: 'long', dir: 'grass-straw-long', pick: { near: 'v1', mid: 'v2', far: 'v2' } },
  { id: 'olive-short', name: 'Olive, short', kind: 'grass', palette: 'olive', length: 'short', dir: 'grass-olive-short', pick: { near: 'v1', mid: 'v1', far: 'v1' } },
  { id: 'sand-raked', name: 'Sand, raked', kind: 'sand', dir: 'sand-raked', pick: { near: 'v1', mid: 'v1', far: 'v1' } },
  { id: 'sand-ripples', name: 'Sand, ripples', kind: 'sand', dir: 'sand-ripples', pick: { near: 'v1', mid: 'v1', far: 'v1' } },
  { id: 'water-pond', name: 'Pond water', kind: 'water', dir: 'water-pond', pick: { near: 'v2', mid: 'v1', far: 'v1' } },
  { id: 'underground-earth', name: 'Cut face, earth', kind: 'cut', dir: 'underground-earth', pick: { near: 'v2', mid: 'v1', far: 'v1' } },
  { id: 'underground-sand', name: 'Cut face, sand', kind: 'cut', dir: 'underground-sand', pick: { near: 'v1', mid: 'v1', far: 'v1' } },
];
/** the earlier cut faces (painted-terrain-selection-20261025.json: 48 px a metre, 21.333 m a tile, one level) */
const CUTAWAYS = [
  { id: 'cutaway-earth', name: 'Cut face, earth (48 px/m)', kind: 'cut', dir: 'underground-earth', version: 'v3' },
  { id: 'cutaway-sand', name: 'Cut face, sand (48 px/m)', kind: 'cut', dir: 'underground-sand', version: 'v3' },
];

const hex = m => '#' + m.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
async function convert(src, out, quality) {
  const pic = sharp(src).removeAlpha();
  const { width, height } = await pic.metadata();
  if (width !== height) throw new Error(`${src}: not square (${width}x${height})`);
  await sharp(src).removeAlpha().webp({ quality, effort: 6 }).toFile(out);
  const { channels } = await sharp(src).removeAlpha().stats();
  return { px: width, mean: hex(channels.slice(0, 3).map(c => c.mean)), kb: Math.round(fs.statSync(out).size / 1024) };
}
const sha = f => { try { return JSON.parse(fs.readFileSync(f.replace(/\.png$/, '.provenance.json'), 'utf8')).final?.sha256 ?? null; } catch { return null; } };

const registry = { v: 1, note: 'Generated by scripts/assets/prep-painted-families.mjs from ' + REL + ' (new-painted-spatial-scales-20261025.json). Do not edit by hand.', families: [] };
let total = 0;
const byId = new Map();
for (const f of FAMILIES) {
  const versions = fs.readdirSync(path.join(SRC, 'painted-scaled')).filter(d => d.startsWith(f.dir + '-v')).map(d => d.slice(f.dir.length + 1)).sort();
  const levels = { near: {}, mid: {}, far: {} };
  for (const v of versions) for (const level of LEVELS) {
    const src = path.join(SRC, 'painted-scaled', `${f.dir}-${v}`, `${level}.png`); if (!fs.existsSync(src)) continue;
    const file = `fam/${f.id}-${level}-${v}.webp`, r = await convert(src, path.join(ROOT, 'src/assets/ground/painted', file), QUALITY[level]);
    levels[level][v] = { file, mean: r.mean, px: r.px, sha256: sha(src) }; total += r.kb;
    console.log(file.padEnd(40), `${r.px}px`, r.mean, `${r.kb} KB`);
  }
  const fam = { id: f.id, name: f.name, kind: f.kind, ...(f.palette ? { palette: f.palette, length: f.length } : {}), coverage: { ...SCALED }, levels, pick: { ...f.pick } };
  byId.set(f.id, fam); registry.families.push(fam);
}
// a length with no macro paintings borrows its palette's (the same entries, so the studio can still pick their versions)
for (const f of FAMILIES) if (f.borrow) {
  const fam = byId.get(f.id), from = byId.get(f.borrow);
  for (const level of ['mid', 'far']) if (!Object.keys(fam.levels[level]).length) { fam.levels[level] = from.levels[level]; fam.pick[level] = from.pick[level]; fam.borrowed = { ...(fam.borrowed ?? {}), [level]: from.id }; }
}
for (const c of CUTAWAYS) {
  const src = path.join(SRC, 'painted-cutaways', `${c.dir}-${c.version}`, 'side.png'); if (!fs.existsSync(src)) continue;
  const file = `fam/${c.id}-near-${c.version}.webp`, r = await convert(src, path.join(ROOT, 'src/assets/ground/painted', file), QUALITY.side);
  total += r.kb; console.log(file.padEnd(40), `${r.px}px`, r.mean, `${r.kb} KB`);
  const m = 1024 / 48; // 48 px a metre
  registry.families.push({ id: c.id, name: c.name, kind: c.kind, coverage: { near: m, mid: m, far: m }, levels: { near: { [c.version]: { file, mean: r.mean, px: r.px, sha256: sha(src) } }, mid: {}, far: {} }, pick: { near: c.version } });
}
// the first painted grass (T082, painted-lod/grass-lod-v1 made by prep-painted-grass.mjs): 8 m paintings laid as a 48, 96 and 192 m composite
{
  const lv = {}; let ok = true;
  for (const [level, m] of [['near', 48], ['mid', 96], ['far', 192]]) {
    const file = `grass-${level}-v1.webp`, abs = path.join(ROOT, 'src/assets/ground/painted', file); if (!fs.existsSync(abs)) { ok = false; break; }
    const { channels } = await sharp(abs).stats(); lv[level] = { v1: { file, mean: hex(channels.slice(0, 3).map(c => c.mean)), px: (await sharp(abs).metadata()).width, sha256: null } };
  }
  if (ok) registry.families.push({ id: 'first-painted', name: 'First painted grass (8 m)', kind: 'grass', coverage: { near: 48, mid: 96, far: 192 }, levels: lv, pick: { near: 'v1', mid: 'v1', far: 'v1' }, legacy: true });
}
fs.writeFileSync(REG, JSON.stringify(registry, null, 1) + '\n');
console.log(`${registry.families.length} families, ${total} KB of WebP; wrote ${path.relative(ROOT, REG)}`);

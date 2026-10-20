// Sprite audit: which sprites the game stretches past the pixels it has at the closest zoom, and which TrickOrTreat
// sprites the game does not have yet.
//   node scripts/assets/audit-sprites.mjs [--json output/audit/sprites.json]
// At ZOOM_MAX (0.3) on a dpr-2 screen one display px is 0.6 device px, and the atlas holds each sprite at exactly 0.6x
// (mip 0), so a sprite drawn at scale s is stretched s times. Scales come from the owner's lot table (OWNER_SCALE, plus
// the composer's +-5% jitter), the forest (up to 1.5) and the player's resize (up to 1.6, reported separately). Each
// sprite is also checked against its painted source: if even the source has fewer pixels than the game draws, only new
// art fixes it. TrickOrTreat is read only.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT, TOT } from './source.mjs';

const MIP0 = 0.6, PAGE = 2048, JITTER = 1.05, FOREST_MAX = 1.5, PLAYER_MAX = 1.6, SLACK = 1.05;
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const LIB = [...read('src/game/library.ts').matchAll(/^ {2}(\{"id".*\}),$/gm)].map(m => JSON.parse(m[1]));
const OWNER = Object.fromEntries([...read('src/game/lots/scales.ts').matchAll(/"([^"]+)":\s*([0-9.]+)/g)].map(m => [m[1], +m[2]]));
const forestSrc = read('src/game/forest.ts'), FOREST = new Set([...forestSrc.matchAll(/'([a-z]+:[^']+)'/g)].map(m => m[1]));
const totLibFile = path.join(TOT, 'output/town-builder/library/library.json');
const totLib = fs.existsSync(totLibFile) ? JSON.parse(fs.readFileSync(totLibFile, 'utf8')) : null;
const totItems = new Map((totLib?.items ?? []).map(i => [i.id, i]));
const exportItems = JSON.parse(fs.readFileSync(path.join(TOT, 'public/assets/town-built/town.json'), 'utf8')).items;

/** the largest scale the game draws an item at (without the player's resize) and where it comes from */
const maxScale = id => {
  const c = [[1, 'base']];
  if (OWNER[id]) c.push([OWNER[id] * JITTER, 'lot table']);
  if (FOREST.has(id)) c.push([FOREST_MAX, 'forest']);
  return c.reduce((a, b) => (b[0] > a[0] ? b : a));
};
/** the painted source's pixel width per display px (the TrickOrTreat library file, else the export's hd file) */
async function sourceDensity(id, w) {
  const t = totItems.get(id);
  const files = [t && path.join(TOT, 'output/town-builder/library', t.file), exportItems[id] && path.join(TOT, 'public/assets/town-built', exportItems[id].file.replace(/^sprites\//, 'sprites-hd/'))].filter(Boolean);
  for (const f of files) if (fs.existsSync(f)) return { density: (await sharp(f).metadata()).width / w, file: path.relative(TOT, f).replaceAll('\\', '/') };
  return { density: 0, file: null };
}

const rows = [];
for (const it of LIB) {
  const [scale, why] = maxScale(it.id), qw = it.quad[2] - it.quad[0];
  const stored = (it.tex[3] - it.tex[1]) * PAGE;               // atlas mip-0 px across the trimmed picture
  const drawn = qw * MIP0 * scale, player = qw * MIP0 * Math.max(scale, PLAYER_MAX);
  const src = await sourceDensity(it.id, it.w), sourcePx = qw * src.density;
  rows.push({ id: it.id, cat: it.cat, scale: +scale.toFixed(2), why, stored: Math.round(stored), drawn: Math.round(drawn), stretch: +(drawn / stored).toFixed(2),
    playerStretch: +(player / stored).toFixed(2), sourcePx: Math.round(sourcePx), sourceShort: sourcePx > 0 && drawn > sourcePx * SLACK, source: src.file });
}
const stretched = rows.filter(r => r.stretch > SLACK).sort((a, b) => b.stretch - a.stretch);
const needArt = rows.filter(r => r.sourceShort).sort((a, b) => b.drawn / b.sourcePx - a.drawn / a.sourcePx);
const have = new Set(LIB.map(i => i.id));
const missing = totLib ? totLib.items.filter(i => !have.has(i.id) && !i.flat && !i.hidden && !/^(Kids \(for scale\)|Shadows)$/.test(i.category)) : [];
const byCat = missing.reduce((m, i) => ((m[i.category] = (m[i.category] || 0) + 1), m), {});

console.log(`game sprites ${rows.length}: ${stretched.length} stretched at the closest zoom (worst ${stretched[0]?.stretch ?? 1}x), ${needArt.length} past their painted source too`);
console.log(`with the player's ${PLAYER_MAX}x resize: ${rows.filter(r => r.playerStretch > SLACK).length} stretched`);
for (const r of stretched.slice(0, 25)) console.log(`  ${r.stretch.toFixed(2)}x  ${r.id}  (${r.why} ${r.scale}, atlas ${r.stored}px, drawn ${r.drawn}px, source ${r.sourcePx}px${r.sourceShort ? ' - SOURCE TOO SMALL' : ''})`);
if (stretched.length > 25) console.log(`  ... ${stretched.length - 25} more`);
console.log(totLib ? `TrickOrTreat upright sprites the game does not have: ${missing.length} ${JSON.stringify(byCat)}` : `no local TrickOrTreat library (${totLibFile}): missing-sprite check skipped`);
const jsonAt = process.argv.indexOf('--json');
if (jsonAt > 0) { const f = path.resolve(process.argv[jsonAt + 1]); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ rows, stretched: stretched.map(r => r.id), needArt: needArt.map(r => r.id), missing: missing.map(i => i.id) }, null, 1)); console.log('report:', f); }

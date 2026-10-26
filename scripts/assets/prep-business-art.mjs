// Add the delivered business pack without rebuilding the existing town atlas.
// Optional argument: path to the delivered capital-v1 directory (read only).
// In this worktree the default falls back to the main checkout's delivered masters.
// Each picture is packed from its master, the only real source: the sheets it was cut from are its native generated resolution (the
// theme-consistency max exports are resamples of an older atlas crop, so they add no detail). Its size is the larger of two floors: the size it
// was always packed at (the old 512 px cap, the stadium at its master), and 0.6 x its largest owner scale (the lot table, then the studio's
// overrides, +5% jitter) x its display width, as prep-sprites packs; never above the master. So it stays sharp at every size the studio allows
// (review/size-report.ts reads the master's width as `native`).
// Exception: the ids with four-view art (art/building-views/business-<id>) are drawn with that art instead (views-library.ts REPLACE swaps the
// library entry), so this picture is never drawn for them. They are packed at the size they held (HELD, else the floor), without growth. Growing
// those buildings needs higher-res four-view art, not a bigger pack.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { readScales } from './overrides.mjs';
const root = process.cwd();
const source = process.argv[2] || [path.join(root, 'src/assets/businesses/capital-v1'), path.resolve(root, '../../../src/assets/businesses/capital-v1')].find(dir => fs.existsSync(path.join(dir, 'manifest.json')));
if (!source) throw new Error('Provide the read-only capital-v1 art delivery directory as the first argument.');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
const out = path.join(root, 'src/assets/businesses/integrated');
fs.mkdirSync(out, { recursive: true });
// the owner's scale per business id: the lot table (src/game/lots/scales.ts, OWNER_SCALE, written by prep-scales.mjs) then the studio's overrides
const table = Object.fromEntries([...fs.readFileSync(path.join(root, 'src/game/lots/scales.ts'), 'utf8').matchAll(/"(business:[^"]+)": ([\d.]+)/g)].map(m => [m[1], +m[2]]));
const OWNER = { ...table, ...readScales() };
const pageFiles = () => fs.readdirSync(out).filter(f => /^business-\d+-\d\.webp$/.test(f));
const webpBytes = () => pageFiles().reduce((s, f) => s + fs.statSync(path.join(out, f)).size, 0);
const before = { pages: pageFiles().filter(f => f.endsWith('-0.webp')).length, bytes: webpBytes() };
const size = 2048, pad = 16, pages = [[]]; let x = pad, y = pad, row = 0;
const items = [], imports = [], thumbs = [], report = [];
/** the width (px) a four-view id held in the atlas before this rule: no growth for them (the stadium's 900 px) */
const HELD = { stadium: 900 };
for (const m of manifest.items) {
  const id = 'business:' + m.id;
  const small = /(?:golf-(?!clubhouse|pro-shop|cart-garage|halfway)|dock-|bass-boat)/.test(m.id);
  // floor: the size the picture was always packed at (so nothing shrinks); need: 0.6 x its largest owner scale x its display width (= the master's width)
  const limit = m.id === 'stadium' ? Math.max(m.width, m.height) : small ? 384 : 512;
  const floor = Math.min(1, limit / Math.max(m.width, m.height)), need = 0.6 * Math.max(1, (OWNER[id] ?? 0) * 1.05);
  // a four-view id is drawn with its four-view art (views-library.ts REPLACE), so its picture here keeps the size it held
  const views = fs.existsSync(path.join(root, 'art/building-views', 'business-' + m.id, 'source.json')), held = views ? HELD[m.id] : undefined;
  const file = path.join(source, m.file), factor = views ? floor : Math.min(1, Math.max(floor, need));
  const w = held ?? Math.ceil(m.width * factor), h = held ? Math.ceil(m.height * held / m.width) : Math.ceil(m.height * factor);
  if (x + w + pad > size) { x = pad; y += row + pad; row = 0; }
  if (y + h + pad > size) { pages.push([]); x = y = pad; row = 0; }
  pages.at(-1).push({ input: await sharp(file).resize(w, h).png().toBuffer(), left: x, top: y });
  items.push({ id, name: m.id.replaceAll('-', ' '), cat: 'Business artwork', kind: 'business', w: m.width, h: m.height,
    ax: m.width / 2, ay: Math.max(m.height * 0.55, m.height - m.width / 4), boxes: [{ hx: 1, hy: 1, dx: 0, dy: 0 }],
    solid: 0, big: true, door: false, cost: 0, tex: [pages.length - 1, x / size, y / size, (x + w) / size, (y + h) / size], quad: [0, 0, m.width, m.height] });
  report.push({ id, w, h, owner: OWNER[id] ?? 0, holds: Math.min(w / m.width, h / m.height) / 0.6 });
  await sharp(file).resize({ width: 320, height: 210, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toFile(path.join(out, m.id + '.webp'));
  const variable = 'thumb' + thumbs.length; imports.push(`import ${variable} from '../assets/businesses/integrated/${m.id}.webp';`); thumbs.push(`'${m.id}': ${variable}`);
  x += w + pad; row = Math.max(row, h);
}
const rows = [];
for (let p = 0; p < pages.length; p++) {
  const png = await sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } }).composite(pages[p]).png().toBuffer(), names = [];
  for (let mip = 0; mip < 5; mip++) {
    const name = `business-${p}-${mip}.webp`, variable = `p${p}m${mip}`;
    await sharp(png).resize(size >> mip, size >> mip).webp({ quality: 88, alphaQuality: 100 }).toFile(path.join(out, name));
    imports.push(`import ${variable} from '../assets/businesses/integrated/${name}';`); names.push(variable);
  }
  rows.push('[' + names.join(',') + ']');
}
// pages the new pack no longer has
for (const f of pageFiles()) if (+/^business-(\d+)-/.exec(f)[1] >= pages.length) fs.rmSync(path.join(out, f));
fs.writeFileSync(path.join(out, 'provenance.json'), JSON.stringify({ source: 'TrickOrTreat/output/capital-empire-art-2026-10-20/sliced/builtin', masters: 'CapitalEmpire/src/assets/businesses/capital-v1/png', delivery: 'capital-v1', items: manifest.items.map(m => ({ id: m.id, sourceSheet: m.sourceSheet, sourceCrop: m.sourceCrop })) }, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'src/game/business-library.ts'), `// Generated by scripts/assets/prep-business-art.mjs. Append after existing frames to preserve save indices.\nimport type { LibItem } from './types';\nimport { REMOVED_IDS } from './lots/scales';\nconst removed = new Set(REMOVED_IDS);\n${imports.join('\n')}\nexport const BUSINESS_THUMBS: Record<string, string> = {${thumbs.join(',')}};\nconst items: LibItem[] = ${JSON.stringify(items)};\n/** Register the delivered art in the shared atlas and sprite library. */\nexport function appendBusinesses(library: LibItem[], pages: string[][]) { const base = pages.length; pages.push(${rows.join(',')}); for (const item of items) if (!removed.has(item.id)) library.push({ ...item, tex: [base + item.tex[0], ...item.tex.slice(1)] as LibItem['tex'] }); }\n`);
const after = { pages: pages.length, bytes: webpBytes() };
console.log(`Business art: ${items.length} sprites, ${pages.length} supplemental atlas pages (was ${before.pages}); page webp bytes ${before.bytes} -> ${after.bytes}.`);
for (const r of report.filter(r => ['business:stadium', 'business:sportsbar', 'business:diner'].includes(r.id))) console.log(`  ${r.id}: packed ${r.w}x${r.h}, owner x${r.owner}, holds up to x${r.holds.toFixed(3)} (source x${(1 / 0.6).toFixed(3)})`);

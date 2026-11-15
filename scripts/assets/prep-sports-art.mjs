// #1369: the town's sports grounds (the owner, 2026-11-15: "add a Baseball field and (American) football field to the town. 3 different ones: a
// dirt one, a grass one and a stadium, so it upgrades as the town grows bigger. One large png sprite for each"). Six one-view pictures painted in
// ChatGPT, each to fill a 2:1 guide box at its real size (scripts/assets/iso-guide-box.mjs L D H 1: the front, the L side, facing the screen's
// lower left, so it runs along the map's X), transparent, in the bridge's inbox as <name>-1view-vN.png (the highest N).
//
// For each picture:
//   - trimmed to its alpha (prep-range-art.mjs cutOne: its largest piece and every piece of 200+ px);
//   - sized to the real metres: its ground diamond spans 32 display px a metre of L + D (the range kit's rule, T232: 64 px a tile of width plus
//     depth at zoom 1). The guide's own px a metre is only a cross-check: ChatGPT does not keep the guide's scale (the baseball stadium came 27%
//     bigger than its box), so the picture's own diamond is what is fitted. Its ground point is the footprint's centre: the middle of its left and
//     right ground corners (prep-range-art.mjs corners);
//   - packed at its own pixels (never enlarged; at most PAGE - 2 GUT a side) on the sports pages, the library's last pages
//     (src/assets/sports/sports-<page>-<mip>.webp, five mips), so no saved library index moves; listed in src/game/sports-library.ts (generated)
//     with its footprint box, anchor and source (file, version, sha256, the fit and the guide's px a metre);
//   - kept as a master (art/sports-grounds/<name>.webp, webp q95) so a clone rebuilds without the inbox.
// The sprites are kind 'decal': flat grounds whose shading is painted in throw no silhouette or contact shadow (shadow-shape.ts castsShadow), and
// they are not 'big' (no building block on the planner map, no building caster over the whole footprint).
//
//   node scripts/assets/prep-sports-art.mjs [--in D:/AI/chatgpt-bridge/in] [--quality 86] [--dry] [--placeholders]
//   (--placeholders: a picture not found yet is drawn as a flat grey guide diamond, for building and testing before the art lands; the
//    library lists it as a placeholder and the test suite refuses one on the branch's last commit)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { alphaOrKey } from './key-magenta.mjs';
import { cutOne, corners } from './prep-range-art.mjs';
import { guideBoxSvg } from './iso-guide-box.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; }, flag = k => args.includes(`--${k}`);
const IN = path.resolve(opt('in', 'D:/AI/chatgpt-bridge/in')), DRY = flag('dry'), PLACEHOLDERS = flag('placeholders'), QUALITY = +opt('quality', '86');
const MASTERS = path.join(root, 'art/sports-grounds'), OUT = path.join(root, 'src/assets/sports'), LIB = path.join(root, 'src/game/sports-library.ts');
const PAGE = 2048, MIPS = 5, GUT = 16, PX_PER_M = 32;
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

/** the six pictures: name, footprint L (along X, the front) x D (metres), the most height (m), the guide's px a metre (iso-guide-box.mjs) */
export const SPORTS = [
  { name: 'baseball-sandlot', title: 'Baseball sandlot', L: 90, D: 90, H: 4, guide: 7.8 },
  { name: 'baseball-field', title: 'Baseball field', L: 110, D: 110, H: 5, guide: 6.4 },
  { name: 'baseball-stadium', title: 'Baseball stadium', L: 150, D: 150, H: 18, guide: 4.3 },
  { name: 'football-dirt', title: 'Football field (dirt)', L: 120, D: 65, H: 4, guide: 7.6 },
  { name: 'football-field', title: 'Football field', L: 130, D: 80, H: 6, guide: 6.6 },
  { name: 'football-stadium', title: 'Football stadium', L: 160, D: 115, H: 18, guide: 4.6 },
];

/** the newest <name>-1view-vN.png in the inbox: { file, v } or null */
function newest(name) {
  const names = fs.existsSync(IN) ? fs.readdirSync(IN) : [], re = new RegExp(`^${name}-1view-v(\\d+)\\.png$`);
  let best = null;
  for (const n of names) { const m = re.exec(n); if (m && (!best || +m[1] > best.v)) best = { v: +m[1], file: path.join(IN, n) }; }
  return best;
}
/** a flat grey diamond at the guide's scale, the footprint's (a placeholder) */
async function placeholder(s) {
  const g = guideBoxSvg({ L: s.L, D: s.D, H: 0.4, view: 1, margin: 0 });
  return sharp(Buffer.from(g.svg.replace(/<rect[^>]*fill="#fff"\/>/, ''))).png().toBuffer();
}
/** a picture's display size and ground point (native px at scale 1) from its trimmed piece */
export function sportsGeometry(s, p) {
  const r3 = v => +v.toFixed(3), w = PX_PER_M * (s.L + s.D), k = w / p.w, c = corners(p, 0);
  const ay = Math.min(p.h * k, ((c.yL + c.yR) / 2 + 0.5) * k);
  // the diamond's near (lowest) corner is (L + D) / 4 metres of screen below its centre: how far the picture's own bottom is from it (display px)
  const nearErr = p.h * k - (ay + (PX_PER_M * (s.L + s.D)) / 4);
  return { w: r3(w), h: r3(p.h * k), ax: r3(w / 2), ay: r3(ay), k, nearErr: r3(nearErr), fit: r3(p.w / (s.L + s.D)) };
}

const found = [], lines = [];
for (const s of SPORTS) {
  const src = newest(s.name), master = path.join(MASTERS, `${s.name}.webp`), oldMeta = readMeta()[s.name];
  let buf, file, v, isPlaceholder = false;
  if (src) { buf = fs.readFileSync(src.file); file = path.basename(src.file); v = src.v; }
  else if (fs.existsSync(master) && oldMeta && !oldMeta.placeholder) { buf = fs.readFileSync(master); file = oldMeta.file; v = oldMeta.v; lines.push(`  ${s.name}: no picture in the inbox, rebuilt from its master (${file})`); }
  else if (PLACEHOLDERS) { buf = await placeholder(s); file = 'placeholder'; v = 0; isPlaceholder = true; }
  else { lines.push(`  ${s.name}: no picture yet (${s.name}-1view-vN.png): run again when it lands, or with --placeholders`); continue; }
  const h = src ? sha(buf) : oldMeta?.sha256 ?? sha(buf);
  const raw = src || isPlaceholder ? await alphaOrKey(buf) : { png: await sharp(buf).png().toBuffer(), keyed: false };
  const p = src || isPlaceholder ? await cutOne(raw.png) : await (async () => { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { w: info.width, h: info.height, rgba: data, rect: oldMeta.rect }; })();
  // packed at its own pixels, at most a page less its gutters
  const room = PAGE - 2 * GUT, f = Math.min(1, room / p.w, room / p.h), pw = Math.round(p.w * f), ph = Math.round(p.h * f);
  const crop = f === 1 ? Buffer.from(p.rgba) : await sharp(p.rgba, { raw: { width: p.w, height: p.h, channels: 4 } }).resize(pw, ph, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
  const g = sportsGeometry(s, p);
  found.push({ s, p, crop, pw, ph, g, isPlaceholder, src: { file, v, sha256: h, rect: p.rect, keyed: raw.keyed } });
  lines.push(`  ${s.name}: ${isPlaceholder ? 'PLACEHOLDER' : `${file}${raw.keyed ? ' (keyed)' : ''}`} trimmed ${p.w}x${p.h} px -> ${g.w}x${g.h} display px (${s.L} x ${s.D} m), `
    + `${g.fit} px/m fitted vs the guide's ${s.guide} (${((g.fit / s.guide - 1) * 100).toFixed(0)}%), ground point ${g.ax},${g.ay}, near corner off by ${g.nearErr} display px; packed ${pw}x${ph}`);
}
function readMeta() { try { const t = fs.readFileSync(LIB, 'utf8'), m = /\/\*META\*\/(.*)\/\*META\*\//.exec(t); return m ? Object.fromEntries(JSON.parse(m[1]).map(e => [e.name, e])) : {}; } catch { return {}; } }

console.log(`prep-sports-art${DRY ? ' (dry run)' : ''}: ${IN}\n${lines.join('\n')}`);
if (!found.length) { console.log('nothing to pack'); process.exit(0); }

// shelf packing, tallest first, onto as few pages as hold them
const order = [...found].sort((a, b) => b.ph - a.ph), pages = [];
for (const it of order) {
  let placed = false;
  for (const pg of pages) {
    const sh = pg.shelves.find(q => q.h >= it.ph && q.x + it.pw + GUT <= PAGE);
    if (sh) { it.page = pages.indexOf(pg); it.px = sh.x; it.py = sh.y; sh.x += it.pw + 2 * GUT; pg.items.push(it); placed = true; break; }
    const y = pg.shelves.reduce((m, q) => Math.max(m, q.y + q.h + 2 * GUT), GUT);
    if (y + it.ph + GUT <= PAGE) { pg.shelves.push({ x: GUT + it.pw + 2 * GUT, y, h: it.ph }); it.page = pages.indexOf(pg); it.px = GUT; it.py = y; pg.items.push(it); placed = true; break; }
  }
  if (!placed) { pages.push({ shelves: [{ x: GUT + it.pw + 2 * GUT, y: GUT, h: it.ph }], items: [it] }); it.page = pages.length - 1; it.px = GUT; it.py = GUT; }
}
if (DRY) { console.log(`would pack ${found.length} on ${pages.length} page(s)`); process.exit(0); }

fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(MASTERS, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^sports-\d+-\d+\.webp$/.test(f)) fs.rmSync(path.join(OUT, f));
let bytes = 0;
for (let pi = 0; pi < pages.length; pi++) {
  const comp = pages[pi].items.map(it => ({ input: it.crop, raw: { width: it.pw, height: it.ph, channels: 4 }, left: it.px, top: it.py }));
  const full = await sharp({ create: { width: PAGE, height: PAGE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comp).png().toBuffer();
  for (let m = 0; m < MIPS; m++) {
    let img = sharp(full); if (m) img = img.resize(PAGE >> m, PAGE >> m, { kernel: 'lanczos3' });
    const f = path.join(OUT, `sports-${pi}-${m}.webp`); await img.webp({ quality: QUALITY, alphaQuality: 100, effort: 6 }).toFile(f); bytes += fs.statSync(f).size;
  }
}
for (const it of found) if (!it.isPlaceholder) {
  const out = path.join(MASTERS, `${it.s.name}.webp`);
  if (it.src.file !== readMeta()[it.s.name]?.file || !fs.existsSync(out)) await sharp(it.p.rgba, { raw: { width: it.p.w, height: it.p.h, channels: 4 } }).webp({ quality: 95, alphaQuality: 100, effort: 6 }).toFile(out);
}

// the generated library: pages, then one item per picture in SPORTS order
const r6 = v => +v.toFixed(6), byName = Object.fromEntries(found.map(it => [it.s.name, it]));
const art = SPORTS.filter(s => byName[s.name]).map(s => {
  const it = byName[s.name];
  return { name: s.name, title: s.title, L: s.L, D: s.D, H: s.H, w: it.g.w, h: it.g.h, ax: it.g.ax, ay: it.g.ay, page: it.page,
    tex: [r6(it.px / PAGE), r6(it.py / PAGE), r6((it.px + it.pw) / PAGE), r6((it.py + it.ph) / PAGE)], placeholder: it.isPlaceholder };
});
const meta = SPORTS.filter(s => byName[s.name]).map(s => { const it = byName[s.name]; return { name: s.name, ...it.src, placeholder: it.isPlaceholder, fitPxPerM: it.g.fit, guidePxPerM: s.guide, packed: [it.pw, it.ph] }; });
const imports = [], mips = [];
for (let pi = 0; pi < pages.length; pi++) { const row = []; for (let m = 0; m < MIPS; m++) { imports.push(`import s${pi}m${m} from '../assets/sports/sports-${pi}-${m}.webp';`); row.push(`s${pi}m${m}`); } mips.push(`[${row.join(', ')}]`); }
const ts = `// Generated by scripts/assets/prep-sports-art.mjs (#1369) from the owner's ChatGPT pictures. Do not edit.
import type { LibItem } from './types';
${imports.join('\n')}
const PAGE_MIPS: string[][] = [${mips.join(', ')}];
/** the sports grounds' pictures: footprint L (along X) x D and most height H (metres), display size and ground point (the footprint's centre) at
 *  scale 1, their page and rect, and whether it is a placeholder (never shipped) */
export interface SportsArt { name: string; title: string; L: number; D: number; H: number; w: number; h: number; ax: number; ay: number; page: number; tex: number[]; placeholder: boolean }
export const SPORTS_ART: SportsArt[] = ${JSON.stringify(art)};
/** each picture's source: the inbox file and its version, sha256, trim rect, the px a metre fitted and the guide's */
export const SPORTS_SOURCES = /*META*/${JSON.stringify(meta)}/*META*/;
/** the library id of a sports ground's picture */
export const sportsArtId = (name: string) => \`sports:\${name}\`;
/** the sports grounds' pages and pictures, at the tail of the library (no saved index moves) */
export function appendSports(library: LibItem[], pages: string[][]) {
  const base = pages.length; pages.push(...PAGE_MIPS);
  for (const a of SPORTS_ART) library.push({ id: sportsArtId(a.name), name: a.title, cat: 'Sports grounds', kind: 'decal', w: a.w, h: a.h, ax: a.ax, ay: a.ay, boxes: [{ hx: a.L / 2, hy: a.D / 2, dx: 0, dy: 0 }], solid: 0, big: false, door: false, cost: 0, tex: [base + a.page, a.tex[0]!, a.tex[1]!, a.tex[2]!, a.tex[3]!], quad: [0, 0, a.w, a.h] });
}
`;
fs.writeFileSync(LIB, ts);
console.log(`packed ${found.length} picture(s) on ${pages.length} page(s): ${(bytes / 1048576).toFixed(2)} MB of webp (${bytes} bytes, ${MIPS} mips, q${QUALITY}); ${path.relative(root, LIB)} written`);

// The screen-axis pictures into the game (T154): every set sync-axis-views.mjs keeps in art/axis-views (run first, here), packed onto their own
// atlas pages (src/assets/axis/axis-<page>-<mip>.webp) and listed in src/game/axis-library.ts (appendAxisViews, the last library the game appends).
//   node scripts/assets/prep-axis-views.mjs [generated-folder ...]   (the folders are passed to the sync; the studio's Rebuild runs it after prep-views)
// Each set is four genuine quarter turns, N, E, S, W: the front (a car's nose) facing screen down, right, up and left (sync-axis-views.mjs). Never
// mirrored, rotated or repainted: each picture is its sheet's own pixels, trimmed to its subject (axis-cells.mjs) and scaled.
// 1. Ids. A subject the library has keeps its picture (its four diagonal views for a four-view building, the old picture for a prop) and gains
//    the four as extra headings, view:<id>:n|e|s|w (the eight-heading contract wires them to the roads at 45 degrees: T154 Phase 2). A subject
//    the library lacks (the car parks, the plants) is new: drawn from these views until its diagonal views exist, one per quarter turn, its id the
//    N view and view:<id>:e|s|w the others (lots/preset-art.ts turns them). The eight-way cars (art/cars/<model>) are not packed here:
//    prep-cars.mjs takes their four cardinal headings from these sets.
// 2. Size. A screen-axis view of a box W x D tiles (its front W wide) is 90.5 W px wide (a tile's diagonal: 128 px over sqrt 2) and its ground
//    45.25 D px deep; a diagonal view of it is 64 (W + D) px wide. So a four-view building's set is sized by its NE view as the game draws it
//    (the same building: the four widths add up to 2 sqrt 2 x the NE view's), a prop with an old picture by that picture's height, a car by its
//    4.5 x 1.8 m body (the eight-way cars' rule, prep-cars.mjs), a new subject by its size in SIZE below. The studio's size multiplies it.
// 3. Ground point: the footprint's centre, half its depth above the subject's lowest row, at the mean x of that row's strong pixels. Footprint:
//    the world box round the turned rectangle, (W + D) / sqrt 2 tiles a side.
// 4. Pack: every view at 0.6 x display size times its studio size (at least 1), up to 3x its picture's pixels, like prep-views.mjs; five mips.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { findGlows } from './find-glows.mjs';
import { readScales } from './overrides.mjs';
import { measure, trimmed } from './axis-cells.mjs';
import { AXIS_DIRS, AXIS_HEADING, AXIS_STORE, axisSources, syncAxisViews } from './sync-axis-views.mjs';
import { carModel, carModelSize } from '../../src/game/ext/car-art/model.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(root, 'src/assets/axis'), REVIEW = path.join(root, 'output/axis-review');
const PAGE = 2048, GUT = 16, MIP0 = 0.6, K = 128 / Math.SQRT2, R2 = Math.SQRT2;
await syncAxisViews(process.argv.slice(2));

// the library as the game has it (every {"id": ...} literal of the generated libraries; the first of an id wins) and the four-view buildings'
// NE views as prep-views drew them (views-library.ts: the NE view in place of the sprite)
const parse = file => {
  const text = fs.readFileSync(path.join(root, file), 'utf8'), out = [];
  for (let i = text.indexOf('{"id":"'); i >= 0; i = text.indexOf('{"id":"', i + 1)) {
    let depth = 0, quote = false, j = i;
    for (; j < text.length; j++) { const c = text[j]; if (quote) { if (c === '\\') j++; else if (c === '"') quote = false; } else if (c === '"') quote = true; else if (c === '{') depth++; else if (c === '}' && --depth === 0) break; }
    out.push(JSON.parse(text.slice(i, j + 1))); i = j;
  }
  return out;
};
const items = new Map();
for (const f of ['library', 'east-library', 'business-library', 'construction-library', 'golf-library', 'cars-library', 'trees-library']) for (const it of parse(`src/game/${f}.ts`)) if (!items.has(it.id)) items.set(it.id, it);
const NE = new Map(parse('src/game/views-library.ts').filter(it => !it.id.startsWith('view:') && !it.id.startsWith('east:')).map(it => [it.id, it]));
const NE_PNG = new Map();
for (const d of fs.readdirSync(path.join(root, 'art/building-views'))) { const s = path.join(root, 'art/building-views', d, 'source.json'); if (fs.existsSync(s)) NE_PNG.set(JSON.parse(fs.readFileSync(s, 'utf8')).id, path.join(root, 'art/building-views', d, 'NE.png')); }
const scales = fs.readFileSync(path.join(root, 'src/game/lots/scales.ts'), 'utf8'), studio = readScales();
const removed = new Set([.../export const REMOVED_IDS[^=]*= \[([^\]]*)\]/.exec(scales)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]));
/** the scale a picture is drawn at: the studio's size now, else the table's, else 1 */
const owner = id => studio[id] ?? +(new RegExp(`"${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}": ([0-9.]+)`).exec(scales)?.[1] ?? 1);
const CAR_SCALE = +(/export const CAR_SCALE = ([\d.]+)/.exec(fs.readFileSync(path.join(root, 'src/game/ext/car-art/index.ts'), 'utf8'))?.[1] ?? 1);

/** the new subjects (none in the library): name, category, kind, rules and their size: front: the N view's width (tiles: the front's), round: the
 *  mean of the four (a shrub). The car parks: the art request's 18 x 26 m building (docs/GOLF-SPRITES.md golf:range-carpark), its long front 13
 *  tiles; the shrubs and beds at a garden's sizes (the studio sizes them from there) */
const SIZE = [
  { re: /^ce:parking-garage-(\d)storey$/, name: m => `Parking garage, ${m[1]} storeys`, cat: 'Parking', kind: 'building', solid: 2, big: true, cost: 36000, front: 13, glows: true },
  { re: /^landscape:flowerbed-(.+)$/, name: m => `Flower bed, ${m[1]}`, cat: 'Landscaping', kind: 'bush', solid: 1, big: false, cost: 150, front: 2 },
  { re: /^landscape:hydrangea-(.+)$/, name: m => `Hydrangea, ${m[1]}`, cat: 'Landscaping', kind: 'bush', solid: 1, big: false, cost: 120, round: 0.8 },
  { re: /^landscape:bush-(.+)$/, name: m => `Bush, ${m[1].replace(/-/g, ' ')}`, cat: 'Landscaping', kind: 'bush', solid: 1, big: false, cost: 100, round: 0.9 },
];
const CAR_W = 0.9, CAR_L = 2.25;
const NOSE = { N: 'down', E: 'right', S: 'up', W: 'left' };

const subjects = [], skipped = [];
for (const src of axisSources()) {
  const { id, slug, dir } = src;
  // an eight-way car (art/cars/<model>): its cardinal headings are prep-cars.mjs's
  if (src.category === 'cars' && /^cars:/.test(id) && fs.existsSync(path.join(root, 'art/cars', id.slice(5)))) { skipped.push(`${id} (prep-cars.mjs takes its N, E, S, W headings)`); continue; }
  const base = items.get(id), rule = base ? null : SIZE.map(r => ({ r, m: r.re.exec(id) })).find(x => x.m);
  if (removed.has(id)) { skipped.push(`${id} (removed in the studio)`); continue; }
  if (!base && !rule) { skipped.push(`${id} (not in the library and no size rule for a new subject: add one to SIZE)`); continue; }
  const car = base?.kind === 'car' || src.category === 'cars';
  const views = [];
  for (const v of AXIS_DIRS) { const t = await trimmed(fs.readFileSync(path.join(dir, `${v}.png`))); views.push({ dir: v, png: t.png, trim: t.rect, ...(await measure(t.png)) }); }
  const at = Object.fromEntries(views.map(x => [x.dir, x])), wide = (at.N.bw + at.S.bw) / 2, deep = (at.E.bw + at.W.bw) / 2;
  let how, W, D;
  if (car) { W = CAR_W; D = CAR_L; for (const x of views) x.s = K * (x.dir === 'N' || x.dir === 'S' ? W : D) / x.bw; how = 'a car: its 4.5 x 1.8 m body'; }
  else {
    let s;
    if (base && NE.has(id) && NE_PNG.has(id) && fs.existsSync(NE_PNG.get(id))) {
      // the same building as its NE view as the game draws it: the four widths add up to 2 sqrt 2 x the NE view's
      const ne = NE.get(id), png = fs.readFileSync(NE_PNG.get(id)), m = await measure(png), meta = await sharp(png).metadata();
      s = 2 * R2 * (m.bw * ne.w / meta.width) / views.reduce((a, x) => a + x.bw, 0); how = `by its NE view (${(m.bw * ne.w / meta.width).toFixed(0)} px wide)`;
    } else if (base) { const h = base.quad[3] - base.quad[1]; s = h / (views.reduce((a, x) => a + x.bh, 0) / 4); how = `by its old picture's height (${h.toFixed(0)} px)`; }
    else if (rule.r.front) { s = K * rule.r.front / wide; how = `its front ${rule.r.front * 2} m`; }
    else { s = K * rule.r.round / ((wide + deep) / 2); how = `${rule.r.round * 2} m across`; }
    for (const x of views) x.s = s;
    W = s * wide / K; D = s * deep / K;
  }
  const side = +((W + D) / R2).toFixed(2), name = base ? (car ? `${base.name.replace(/\s+[NESW]$/, '')}` : base.name) : rule.r.name(rule.m);
  const cat = base?.cat ?? rule.r.cat, kind = base?.kind ?? rule.r.kind;
  for (const x of views) {
    const depth = x.dir === 'N' || x.dir === 'S' ? D : W;
    x.id = base ? `view:${id}:${x.dir.toLowerCase()}` : x.dir === 'N' ? id : `view:${id}:${x.dir.toLowerCase()}`;
    x.name = car ? `${name} (${x.dir} view, nose ${NOSE[x.dir]})` : base || x.dir !== 'N' ? `${name} (${x.dir} view)` : name;
    x.w = x.W * x.s; x.h = x.H * x.s; x.ax = x.bx * x.s; x.ay = x.by * x.s - K / 4 * depth;
    x.glows = (base?.glows?.length || rule?.r.glows || kind === 'lamp') ? (await findGlows(x.png, { id, w: x.w, cat })).map(g => ({ x: +g.x.toFixed(1), y: +g.y.toFixed(1), r: +g.r.toFixed(1) })) : undefined;
    if (x.glows && !x.glows.length) x.glows = undefined;
  }
  // the size it is packed for: its studio size (a car's model's, x the road cars' CAR_SCALE), at least 1
  const sizeId = base ? id : id, k = car ? (carModelSize(studio, carModel(id)) ?? 1) * CAR_SCALE * 1.05 : owner(sizeId);
  subjects.push({ id, slug, src, base, car, how, W, D, side, name, cat, kind, k, views,
    solid: base?.solid ?? rule.r.solid, big: base?.big ?? rule.r.big, door: base?.door ?? false, cost: base?.cost ?? rule.r.cost });
  console.log(`${id} (${src.version}, ${src.crops}): ${base ? 'extra headings' : 'new'} ${views.map(x => x.id).join(' ')}; scale ${views.map(x => x.s.toFixed(3)).join('/')} ${how}; ${(W * 2).toFixed(1)} x ${(D * 2).toFixed(1)} m`);
}

// pack: shelf-pack every view onto as many 2048 pages as it takes, each at 0.6 x its drawn size (at least its display size), up to 3x its pixels
const packAt = (sub, x) => Math.min(3 * x.W / x.w, MIP0 * Math.max(1, sub.k));
const all = subjects.flatMap(sub => sub.views.map(x => ({ sub, x, width: Math.max(1, Math.round(x.w * packAt(sub, x))), height: Math.max(1, Math.round(x.h * packAt(sub, x))) }))).sort((a, b) => b.height - a.height);
const pages = [[]];
let px = GUT, py = GUT, rowH = 0;
for (const p of all) {
  if (p.width + 2 * GUT > PAGE || p.height + 2 * GUT > PAGE) throw new Error(`${p.x.id} is larger than an atlas page`);
  if (px + p.width + GUT > PAGE) { px = GUT; py += rowH + GUT; rowH = 0; }
  if (py + p.height + GUT > PAGE) { pages.push([]); px = GUT; py = GUT; rowH = 0; }
  p.page = pages.length - 1; p.left = px; p.top = py; pages.at(-1).push(p);
  px += p.width + GUT; rowH = Math.max(rowH, p.height);
}
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(REVIEW, { recursive: true });
for (const [i, page] of pages.entries()) {
  if (!page.length) continue;
  const composite = await Promise.all(page.map(async p => ({ input: await sharp(p.x.png).resize(p.width, p.height, { kernel: 'lanczos3' }).png().toBuffer(), left: p.left, top: p.top })));
  const full = await sharp({ create: { width: PAGE, height: PAGE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composite).png().toBuffer();
  for (let mip = 0; mip < 5; mip++) await sharp(full).resize(PAGE >> mip, PAGE >> mip).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(OUT, `axis-${i}-${mip}.webp`));
}
const n = pages.filter(p => p.length).length;

// the library module
const order = all.slice().sort((a, b) => a.sub.id.localeCompare(b.sub.id) || AXIS_DIRS.indexOf(a.x.dir) - AXIS_DIRS.indexOf(b.x.dir));
const entry = p => {
  const { sub, x } = p, box = sub.car ? +((CAR_W + CAR_L) / R2).toFixed(2) : sub.side;
  return { id: x.id, name: x.name, cat: sub.cat, kind: sub.kind, w: +x.w.toFixed(2), h: +x.h.toFixed(2), ax: +x.ax.toFixed(2), ay: +x.ay.toFixed(2), boxes: [{ hx: box, hy: box, dx: 0, dy: 0 }],
    solid: sub.solid, big: sub.big, door: sub.door, cost: sub.cost, ...(x.glows ? { glows: x.glows } : {}),
    tex: [p.page, p.left / PAGE, p.top / PAGE, (p.left + p.width) / PAGE, (p.top + p.height) / PAGE], quad: [0, 0, +x.w.toFixed(2), +x.h.toFixed(2)] };
};
const sets = Object.fromEntries(subjects.map(sub => [sub.id, sub.views.map(x => x.id)]));
const heading = Object.fromEntries(subjects.flatMap(sub => sub.views.map(x => [x.id, x.dir])));
const turn = Object.fromEntries(subjects.flatMap(sub => { const [nn, e, s, w] = sub.views.map(x => x.id); return [[nn, nn], [e, w], [s, s], [w, e]]; }));
fs.writeFileSync(path.join(root, 'src/game/axis-library.ts'), [
  '// Generated by scripts/assets/prep-axis-views.mjs (T154). Sources, hashes and provenance are in art/axis-views (from art/theme-consistency).',
  '// The screen-axis pictures: four genuine quarter turns of each subject, N, E, S, W (its front, a car\'s nose, facing screen down, right, up, left).',
  "import type { LibItem } from './types';",
  "import { OWNER_SCALE, REMOVED_IDS } from './lots/scales';",
  'const removed = new Set(REMOVED_IDS);',
  ...pages.flatMap((pg, i) => pg.length ? Array.from({ length: 5 }, (_, m) => `import a${i}m${m} from '../assets/axis/axis-${i}-${m}.webp';`) : []),
  `const PAGES: string[][] = [${pages.map((pg, i) => pg.length ? `[${Array.from({ length: 5 }, (_, m) => `a${i}m${m}`).join(', ')}]` : '[]').join(', ')}];`,
  `const ITEMS: LibItem[] = [\n${order.map(p => '  ' + JSON.stringify(entry(p))).join(',\n')}\n];`,
  '/** each subject\'s four pictures [N, E, S, W], by its id: a new subject\'s N view is its own id, a subject the library had gains view:<id>:n|e|s|w */',
  `export const AXIS_SETS: Readonly<Record<string, readonly [string, string, string, string]>> = ${JSON.stringify(sets)};`,
  '/** the heading of every screen-axis picture (its front facing screen down N, right E, up S, left W) */',
  `export const AXIS_HEADING: Readonly<Record<string, 'N' | 'E' | 'S' | 'W'>> = ${JSON.stringify(heading)};`,
  '/** a flip (the world axes swapped: the screen mirrored left to right) is drawn turned, never mirrored: E <-> W; N and S face the same way */',
  `export const AXIS_TURN: Readonly<Record<string, string>> = ${JSON.stringify(turn)};`,
  '/** the subjects new with the screen-axis art (drawn from these views until their diagonal views exist): their ids */',
  `export const AXIS_NEW: ReadonlySet<string> = new Set(${JSON.stringify(subjects.filter(s => !s.base).map(s => s.id))});`,
  '/** Appended last: the screen-axis pictures on their own pages; a view takes its subject\'s studio size (a removed subject is left out) */',
  'export function appendAxisViews(library: LibItem[], pages: string[][]) {',
  '  const first = pages.length; pages.push(...PAGES.filter(p => p.length));',
  '  const page = new Map<number, number>(); PAGES.forEach((p, i) => { if (p.length) page.set(i, first + page.size); });',
  '  const have = new Set(library.map(o => o.id));',
  '  for (const it of ITEMS) {',
  '    const base = it.id.startsWith("view:") ? it.id.slice(5, it.id.lastIndexOf(":")) : it.id;',
  '    if (removed.has(base) || removed.has(it.id) || have.has(it.id)) continue;',
  '    library.push({ ...it, tex: [page.get(it.tex[0])!, ...it.tex.slice(1)] as LibItem["tex"] });',
  '    if (it.id !== base && OWNER_SCALE[base] !== undefined && OWNER_SCALE[it.id] === undefined) OWNER_SCALE[it.id] = OWNER_SCALE[base]!;',
  '  }',
  '}', ''].join('\n'));

// the record: every subject, its version, crops, ids, size and hashes (art/axis-views/INDEX.md)
const short = h => (h ? h.slice(0, 12) : '-');
fs.writeFileSync(path.join(AXIS_STORE, 'INDEX.md'), [
  '# Screen-axis sets in the game', '',
  'Generated by `node scripts/assets/prep-axis-views.mjs` (T154; the studio\'s Rebuild runs it). Each subject\'s four screen-axis views (N, E, S, W:',
  `the front, a car's nose, facing screen ${Object.values(NOSE).join(', ')}), synced from the art model's \`art/theme-consistency/generated\` by`,
  '`sync-axis-views.mjs` and never mirrored, rotated or repainted. **extra**: the library had the subject (its diagonal views or old picture stay; these',
  'are extra headings for the roads at 45 degrees); **new**: drawn from these views, one per quarter turn, until its diagonal views exist. The eight-way',
  'cars take their four cardinal headings from their sets in `prep-cars.mjs`.', '',
  '| subject | version (crops) | in the game | sized | footprint | N / E / S / W sha256 |', '| --- | --- | --- | --- | --- | --- |',
  ...subjects.map(s => `| \`${s.id}\` | ${s.src.version} (${s.src.crops}) | ${s.base ? 'extra' : 'new'}: ${s.views.map(x => `\`${x.id}\``).join(', ')} | ${s.how} | ${(s.W * 2).toFixed(1)} x ${(s.D * 2).toFixed(1)} m | ${AXIS_DIRS.map(v => short(s.src.views[v].sha256)).join(' / ')} |`),
  ...skipped.map(s => `| ${s.replace(/ \(/, ' | not here (').replace(/\)$/, ')')} | | | | |`),
  '', ...axisSources().filter(s => s.why).map(s => `- \`${s.id}\`: ${s.why}.`), ''].join('\n'));

// review: each subject's views at their game size at 0.3 zoom, beside its old picture or NE view, on a grey ground
const tiles = [];
for (const sub of subjects) {
  const k = 0.3 * (sub.car ? 1 : Math.max(0.2, owner(sub.id))), ims = [];
  const ref = NE.has(sub.id) && NE_PNG.has(sub.id) ? { png: fs.readFileSync(NE_PNG.get(sub.id)), w: NE.get(sub.id).w, h: NE.get(sub.id).h, tag: 'NE' } : null;
  for (const x of [...(ref ? [ref] : []), ...sub.views]) { const w = Math.max(1, Math.round(x.w * k)), h = Math.max(1, Math.round(x.h * k)); ims.push({ input: await sharp(x.png).resize(w, h).png().toBuffer(), w, h }); }
  const W = ims.reduce((a, x) => a + x.w + 6, 6), H = Math.max(...ims.map(x => x.h)) + 22;
  let cx = 6; const comp = ims.map(x => { const c = { input: x.input, left: cx, top: H - x.h }; cx += x.w + 6; return c; });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="20"><text x="4" y="14" font-size="12" fill="#172a32" font-family="sans-serif">${sub.id}</text></svg>`;
  tiles.push({ input: await sharp({ create: { width: W, height: H, channels: 4, background: '#c9d1c4' } }).composite([...comp, { input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer(), w: W, h: H });
}
let cx = 0, cy = 0, ch = 0; const placed = [];
for (const t of tiles) { if (cx + t.w > 1800 && cx) { cx = 0; cy += ch + 8; ch = 0; } placed.push({ input: t.input, left: cx, top: cy }); cx += t.w + 8; ch = Math.max(ch, t.h); }
if (placed.length) await sharp({ create: { width: Math.max(...tiles.map(t => t.w), 1800), height: cy + ch, channels: 4, background: '#c9d1c4' } }).composite(placed).png().toFile(path.join(REVIEW, 'contact.png'));
console.log(`Prepared ${all.length} screen-axis views of ${subjects.length} subjects on ${n} page(s); review: ${path.relative(root, REVIEW)}/contact.png`);
if (skipped.length) console.log(`Not packed here: ${skipped.join('; ')}`);

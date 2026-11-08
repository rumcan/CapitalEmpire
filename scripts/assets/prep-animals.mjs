// T309 (#894): pack the farm animals (art/animals/<id>/sheet.webp + sheet.json, made by the T309 pipeline: Idol models posed and rendered at
// the 8 headings, see sheet.json) into their own atlas page(s), and draft their vector shadows.
//   node scripts/assets/prep-animals.mjs
// A sheet: rows = the headings in world-angle order (CAR_DIRECTIONS: SE S SW W NW N NE E, the nose on screen; never mirrored), columns = the
// frames (graze 0-3, lookup 4-6, walk 7-14: sheet.json clips), every cell frameWidth x frameHeight with the anchor (the animal's middle on the
// ground) at one point, at the people's art scale (a 1.78 m person = 190 px; the game draws at k = 0.5, like the people, so the display size
// is half the art). Each frame is packed trimmed at MIP0 (0.6) of its display size, on a 4 px gutter and grid like the walker pages (the street
// tier only draws them), with five mips (src/assets/animals/animals-<page>-<mip>.webp).
// Shadows (src/game/animal-shadows.json, merged into shadow-vector.ts's VECTOR_SHADOWS): each heading's standing frame (lookup 6, head up)
// and grazing frame (graze 0) drafted by the vector shadow draft (src/game/dev/shadow-draft.ts, as a vehicle: a body on legs, its ground line
// through the touching hooves); every other frame of the heading shares one of the two (`same`): the walk and the head up the standing one,
// the graze and the head coming up the grazing one.
// Writes src/game/animals-library.ts: ANIMALS (the table), ANIMAL_FRAMES, ANIMAL_CLIPS, appendAnimals (pages and items at the tail of LIBRARY,
// after the new props, so no saved index moves) and animalItem(art, row, frame).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ART = path.join(ROOT, 'art/animals'), OUT = path.join(ROOT, 'src/assets/animals'), GAME = path.join(ROOT, 'src/game/animals-library.ts');
const SHADOWS = path.join(ROOT, 'src/game/animal-shadows.json');
const MIP0 = 0.6, K = 0.5, MIPS = 5, PAGE = 2048, GUT = 4, ALIGN = 4;
const DIRS = ['SE', 'S', 'SW', 'W', 'NW', 'N', 'NE', 'E'];

const trim = (data, W, H) => {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, crop = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) data.copy(crop, y * cw * 4, ((y0 + y) * W + x0) * 4, ((y0 + y) * W + x1 + 1) * 4);
  return { crop, cw, ch, x0, y0, x1, y1 };
};

// ---- 1. the sheets, cut into trimmed frames at the packed scale
const animals = [], frames = [];
let clips = null, nFrames = 0;
for (const id of fs.readdirSync(ART).sort()) {
  const js = path.join(ART, id, 'sheet.json'), wp = path.join(ART, id, 'sheet.webp');
  if (!fs.existsSync(js) || !fs.existsSync(wp)) { console.warn(`${id}: no sheet, skipped`); continue; }
  const j = JSON.parse(fs.readFileSync(js, 'utf8'));
  if (j.directions.join(' ') !== DIRS.join(' ')) throw new Error(`${id}: rows ${j.directions}, expected ${DIRS}`);
  if (!clips) { clips = j.clips; nFrames = j.frames.length; }
  // (the clips' frame ranges must agree; the walk's frame times differ by kind: a sheep's short legs step quicker, WALK_FRAME_S in ext/farms/animals.ts)
  const shape = c => JSON.stringify(Object.entries(c).map(([k, v]) => [k, v.start, v.n, v.loop]));
  if (j.frames.length !== nFrames || shape(j.clips) !== shape(clips)) throw new Error(`${id}: its frames or clips differ from the first animal's`);
  const fw = j.frameWidth, fh = j.frameHeight, W = Math.round(fw * K * MIP0), H = Math.round(fh * K * MIP0), sx = fw * K / W, sy = fh * K / H;
  const a = animals.length;
  animals.push({ id, w: +(fw * K).toFixed(2), h: +(fh * K).toFixed(2), ax: +(j.anchor.x * K).toFixed(2), ay: +(j.anchor.y * K).toFixed(2), m: j.heightMetres, len: j.lengthMetres, repainted: j.repainted ?? [] });
  for (let d = 0; d < 8; d++) for (let f = 0; f < nFrames; f++) {
    const data = await sharp(wp).extract({ left: f * fw, top: d * fh, width: fw, height: fh }).resize(W, H, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();
    const t = trim(data, W, H);
    frames.push({ id: `animal:${id}:${d}:${f}`, a, d, f, crop: t.crop, cw: t.cw, ch: t.ch, qx0: t.x0 * sx, qy0: t.y0 * sy, qx1: (t.x1 + 1) * sx, qy1: (t.y1 + 1) * sy, rx: sx, ry: sy });
  }
}
if (!animals.length) throw new Error('no animal sheets in art/animals');

// ---- 2. shelf packing (tallest first), 4 px gutter on a 4 px grid
const pages = [];
{
  const al = v => Math.ceil(v / ALIGN) * ALIGN, order = frames.map((_, i) => i).sort((a, b) => frames[b].ch - frames[a].ch);
  let page = null; const newPage = () => { page = { shelves: [], sprites: [] }; pages.push(page); }; newPage();
  for (const i of order) {
    const s = frames[i], w = al(s.cw + 2 * GUT), h = al(s.ch + 2 * GUT);
    const place = pg => {
      for (const sh of pg.shelves) if (h <= sh.h && sh.x + w <= PAGE) { const at = [sh.x, sh.y]; sh.x += w; return at; }
      const y = pg.shelves.reduce((m, sh) => Math.max(m, sh.y + sh.h), 0); if (y + h > PAGE) return null;
      pg.shelves.push({ y, h, x: w }); return [0, y];
    };
    let at = place(page); if (!at) { newPage(); at = place(page); }
    s.page = pages.length - 1; s.px = at[0] + GUT; s.py = at[1] + GUT; page.sprites.push(s);
  }
}
const fill = pages.map(pg => Math.round(100 * pg.shelves.reduce((m, sh) => Math.max(m, sh.y + sh.h), 0) / PAGE));

// ---- 3. the pages and their mips
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f), { force: true });
let bytes = 0;
for (let p = 0; p < pages.length; p++) {
  const comp = pages[p].sprites.map(s => ({ input: s.crop, raw: { width: s.cw, height: s.ch, channels: 4 }, left: s.px, top: s.py }));
  const full = await sharp({ create: { width: PAGE, height: PAGE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comp).png().toBuffer();
  for (let m = 0; m < MIPS; m++) {
    let img = sharp(full); if (m) img = img.resize(PAGE >> m, PAGE >> m, { kernel: 'lanczos3' }).sharpen({ sigma: 0.45 + 0.1 * m });
    const f = path.join(OUT, `animals-${p}-${m}.webp`); await img.webp({ quality: m ? 90 : 88, alphaQuality: 100, effort: 6 }).toFile(f); bytes += fs.statSync(f).size;
  }
}

// ---- 4. the vector shadows: drafted from the standing (lookup 6) and grazing (graze 0) frame of every heading
const tmp = path.join(ROOT, 'output/prep-animals'); fs.mkdirSync(tmp, { recursive: true });
await build({ entryPoints: [path.join(ROOT, 'src/game/dev/shadow-draft.ts')], bundle: true, format: 'esm', platform: 'node', outfile: path.join(tmp, 'shadow-draft.mjs'), logLevel: 'warning' });
await build({ entryPoints: [path.join(ROOT, 'src/game/cast-shadow.ts')], bundle: true, format: 'esm', platform: 'node', outfile: path.join(tmp, 'cast-shadow.mjs'), logLevel: 'warning' });
const { draftShadow } = await import(pathToFileURL(path.join(tmp, 'shadow-draft.mjs')).href);
const { CAST_DEFAULT, castShear } = await import(pathToFileURL(path.join(tmp, 'cast-shadow.mjs')).href);
const shear = castShear(CAST_DEFAULT), STAND = clips.lookup.start + clips.lookup.n - 1, GRAZE = clips.graze.start;
const shapes = {}, byId = new Map(frames.map(s => [s.id, s]));
for (const an of animals) for (let d = 0; d < 8; d++) {
  for (const f of [STAND, GRAZE]) {
    const s = byId.get(`animal:${an.id}:${d}:${f}`);
    const e = draftShadow({ rgba: s.crop, w: s.cw, h: s.ch, x0: s.qx0 + 0.5 * s.rx - an.ax, y0: s.qy0 + 0.5 * s.ry - an.ay, rx: s.rx, ry: s.ry }, 'vehicle', shear, { n: 'T309 animal (prep-animals.mjs)' });
    shapes[s.id] = e ?? { n: 'T309 animal: no opaque pixels' };
  }
  for (let f = 0; f < nFrames; f++) {
    if (f === STAND || f === GRAZE) continue;
    const grazing = f >= clips.graze.start && f < clips.graze.start + clips.graze.n || f < STAND && f >= clips.lookup.start;
    shapes[`animal:${an.id}:${d}:${f}`] = { same: `animal:${an.id}:${d}:${grazing ? GRAZE : STAND}` };
  }
}
fs.writeFileSync(SHADOWS, `{\n${Object.entries(shapes).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`);

// ---- 5. animals-library.ts
const r6 = v => +v.toFixed(6), r2 = v => +v.toFixed(2);
const flat = frames.slice().sort((a, b) => a.a - b.a || a.d - b.d || a.f - b.f)
  .map(s => [s.page, r6(s.px / PAGE), r6(s.py / PAGE), r6((s.px + s.cw) / PAGE), r6((s.py + s.ch) / PAGE), r2(s.qx0), r2(s.qy0), r2(s.qx1), r2(s.qy1)].join(',')).join(',');
const imports = [], rows = [];
for (let p = 0; p < pages.length; p++) { const v = []; for (let m = 0; m < MIPS; m++) { imports.push(`import a${p}m${m} from '../assets/animals/animals-${p}-${m}.webp';`); v.push(`a${p}m${m}`); } rows.push(`[${v.join(', ')}]`); }
fs.writeFileSync(GAME, [
  '// Generated by scripts/assets/prep-animals.mjs (T309) from art/animals/<id>/sheet.webp + sheet.json. Do not edit.',
  "import type { LibItem } from './types';",
  "import type { PeopleClip } from './library';",
  ...imports,
  `const PAGE_MIPS: string[][] = [${rows.join(', ')}];`,
  '/** the farm animals: display size and anchor (the middle of the animal on the ground) at the native scale (k = 0.5 of the art), height and',
  ' *  length in metres, the headings whose colours are the repaint (the rest: the Idol stand-in) */',
  `export const ANIMALS: { id: string; w: number; h: number; ax: number; ay: number; m: number; len: number; repainted: number[] }[] = ${JSON.stringify(animals)};`,
  '/** the headings (rows) in world-angle order, as CAR_DIRECTIONS (the nose on screen), and the frames a heading */',
  `export const ANIMAL_DIRS = ${JSON.stringify(DIRS)} as const;`,
  `export const ANIMAL_FRAMES = ${nFrames};`,
  `export const ANIMAL_CLIPS: Record<'graze' | 'lookup' | 'walk', PeopleClip> = ${JSON.stringify(clips)};`,
  '/** every frame (animal, heading, frame in order): page, u0, v0, u1, v1, then the quad x0, y0, x1, y1 */',
  `const WF: number[] = [${flat}];`,
  '/** the index of the first animal frame in LIBRARY (-1 before appendAnimals) */',
  'export let ANIMAL_BASE = -1;',
  '/** the library item of animal a, heading row d (0..7), frame f */',
  'export const animalItem = (a: number, d: number, f: number) => ANIMAL_BASE + (a * ANIMAL_DIRS.length + d) * ANIMAL_FRAMES + f;',
  '/** the animals\' pages and frames, at the tail of the library (no saved index moves) */',
  'export function appendAnimals(library: LibItem[], pages: string[][]) {',
  '  const base = pages.length; pages.push(...PAGE_MIPS); ANIMAL_BASE = library.length;',
  '  const per = ANIMAL_DIRS.length * ANIMAL_FRAMES;',
  '  for (let i = 0; i < WF.length / 9; i++) {',
  '    const a = ANIMALS[Math.floor(i / per)]!, r = i % per, o = i * 9;',
  "    library.push({ id: `animal:${a.id}:${Math.floor(r / ANIMAL_FRAMES)}:${r % ANIMAL_FRAMES}`, name: a.id, cat: 'Animals', kind: 'walker', w: a.w, h: a.h, ax: a.ax, ay: a.ay, boxes: [{ hx: 0.6, hy: 0.6, dx: 0, dy: 0 }], solid: 0, big: false, door: false, cost: 0, tex: [base + WF[o]!, WF[o + 1]!, WF[o + 2]!, WF[o + 3]!, WF[o + 4]!], quad: [WF[o + 5]!, WF[o + 6]!, WF[o + 7]!, WF[o + 8]!] });",
  '  }',
  '}', ''].join('\n'));
console.log(`animals ${animals.length}, frames ${frames.length}, pages ${pages.length} (shelf fill ${fill.join(', ')}%), ${(bytes / 1048576).toFixed(2)} MB, shadows ${Object.keys(shapes).length}`);

// T313 (#898): measure every car picture's body length, so every car of a class is drawn at one real-world length (ext/car-art model.mjs
// CLASS_LENGTH). Writes src/game/ext/car-art/car-lengths.json; with --sizes it also sets each car model's studio size (scale-overrides.json) to
// its class length over CAR_SCALE x its reference length.
//   npx esbuild scripts/assets/car-lengths.ts --bundle --platform=node --format=esm --loader:.webp=file --loader:.png=file --external:sharp \
//     --outdir=output/car-lengths --log-level=warning && node output/car-lengths/car-lengths.js [--sizes]
// The measure: a picture's car pixels (alpha > 128) in its atlas rect, as display px (64 px a tile of 2 m along a screen axis, 64 sqrt 2 along a
// world axis). Each picture is one of three kinds by where its nose points on screen:
//   side  nose left or right: the body's width on screen is its length alone (64 sqrt 2 px a tile)
//   end   nose up or down: its width on screen is the car's width; its length is its set's side length times its width over the set's end width
//   diag  nose along a world axis (the iso corners): its width on screen is length + width (64 px a tile); the length is that times the set's
//         side length over side length + end width (the set's own proportions, not the class's: a stylised bus is wider than a real one)
// A set is the pictures of one render: an eight-way car's eight headings, a town car's facing and its four views, a screen-axis set (view:<id>:n|e|s|w).
// Each picture's length at scale 1 is kept; a model's reference length is the median of its pictures'. A picture is drawn at its model's size times
// reference / its own length (carPictureFactor), so a model's pictures all show one body length, and the model's size sets it.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { LIBRARY, ATLAS_PAGES } from '../../src/game/library';
import { CAR_SCALE, carModel } from '../../src/game/ext/car-art';
import { CAR_CLASS, CLASS_LENGTH } from '../../src/game/ext/car-art/model.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(here, '../..');
const sharp = createRequire(path.join(ROOT, 'package.json'))('sharp') as typeof import('sharp');
const R2 = 64 * Math.SQRT2;
type Kind = 'side' | 'end' | 'diag';
const kindOf = (id: string): Kind => {
  let m: RegExpExecArray | null;
  if (id.startsWith('cars:')) return ({ SE: 'diag', SW: 'diag', NW: 'diag', NE: 'diag', S: 'end', N: 'end', E: 'side', W: 'side' } as const)[id.split(':').at(-1) as 'S']!;
  if ((m = /^view:.+:([nesw])$/.exec(id))) return ({ n: 'end', s: 'end', e: 'side', w: 'side' } as const)[m[1] as 'n'];
  // a variation's views: 1 the side, 2 and 3 the ends, 4 the corner (prep-views.mjs)
  if ((m = /^variation:.+:(\d)$/.exec(id))) return ({ 1: 'side', 2: 'end', 3: 'end', 4: 'diag' } as Record<string, Kind>)[m[1]!]!;
  return 'diag';
};
const setOf = (id: string): string => {
  let m: RegExpExecArray | null;
  if (id.startsWith('cars:')) return id.replace(/:[A-Z]+$/, '');
  if ((m = /^view:(.+):[nesw]$/.exec(id))) return `view:${m[1]}`;
  if ((m = /^variation:([a-z]+)-(.+)-[0-9a-f]{8}:\d$/.exec(id))) return `${m[1]}:${m[2]}`;
  return id;
};

/** a picture's car pixels across, in display px */
async function across(i: number): Promise<number> {
  const it = LIBRARY[i]!, f = path.join(ROOT, 'output/car-lengths', ATLAS_PAGES[it.tex[0]]![0]!);
  const S = (await sharp(f).metadata()).width!, [, u0, v0, u1, v1] = it.tex;
  const left = Math.round(u0 * S), top = Math.round(v0 * S), width = Math.round((u1 - u0) * S), height = Math.round((v1 - v0) * S);
  const { data, info } = await sharp(f).extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
  let x0 = Infinity, x1 = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * info.channels + 3]! > 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  return (x1 - x0 + 1) / info.width * (it.quad[2] - it.quad[0]);
}

const cars = LIBRARY.map((it, i) => ({ it, i })).filter(c => c.it.kind === 'car');
const px = new Map<string, number>();
for (const c of cars) px.set(c.it.id, await across(c.i));
const sets = new Map<string, string[]>();
for (const c of cars) { const s = setOf(c.it.id); sets.set(s, [...(sets.get(s) ?? []), c.it.id]); }
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const len: Record<string, number> = {};
for (const [s, ids] of sets) {
  const L = mean(ids.filter(id => kindOf(id) === 'side').map(id => px.get(id)! / R2 * 2)), W = mean(ids.filter(id => kindOf(id) === 'end').map(id => px.get(id)! / R2 * 2));
  if (!(L > 0) || !(W > 0)) throw new Error(`${s}: a set needs a side and an end view to be measured`);
  for (const id of ids) { const k = kindOf(id), p = px.get(id)!; len[id] = +(k === 'side' ? p / R2 * 2 : k === 'end' ? L * (p / R2 * 2) / W : p / 32 * L / (L + W)).toFixed(3); }
}
const models: Record<string, number> = {};
for (const m of new Set(cars.map(c => carModel(c.it.id)))) {
  const ls = cars.filter(c => carModel(c.it.id) === m).map(c => len[c.it.id]!).sort((a, b) => a - b);
  models[m] = ls[Math.floor(ls.length / 2)]!;
}
const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort());  // overrides.mjs's order
fs.writeFileSync(path.join(ROOT, 'src/game/ext/car-art/car-lengths.json'), JSON.stringify({ models: sorted(models), pictures: sorted(len) }, null, 1) + '\n');
const sizes: Record<string, number> = {};
for (const [m, ref] of Object.entries(models)) {
  const cls = (CAR_CLASS as Record<string, keyof typeof CLASS_LENGTH>)[m];
  if (!cls) { console.warn(`${m}: no class (model.mjs CAR_CLASS)`); continue; }
  sizes[m] = +(CLASS_LENGTH[cls] / (CAR_SCALE * ref)).toFixed(3);
  console.log(`${m.padEnd(28)} ${cls.padEnd(8)} reference ${ref.toFixed(2)} m at 1, size ${sizes[m]}`);
}
if (process.argv.includes('--sizes')) {
  const f = path.join(ROOT, 'scripts/assets/scale-overrides.json'), cur = JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, number>;
  fs.writeFileSync(f, JSON.stringify(sorted({ ...cur, ...sizes }), null, 1) + '\n');
  console.log('scale-overrides.json: the car models\' sizes set');
}

// Bundle the town builder's ground art (TrickOrTreat branch town/builder-in-repo, art/town-ground/) for the game:
// asphalt paintings (flattened like scripts/lib/town-scene.mjs does), curb strips, sidewalk slabs, the lamp pool stamp,
// a leaf-sprite atlas and the two grass bases. Writes src/assets/ground/ and src/game/ground-art.ts.
//   node scripts/assets/prep-ground.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT, TOT, fromBranch } from './source.mjs';

const OUT = path.join(ROOT, 'src/assets/ground');
const BRANCH = 'town/builder-in-repo', BASE = 'art/town-ground/';
fs.mkdirSync(OUT, { recursive: true });
// The owner's two seamless dirt paintings are vendored so future rebuilds also work without local output files.
for (const [source, dest] of [['soil-mud-v2-base.png', 'rocky-dirt.webp'], ['soil-mud-base.png', 'rocky-dirt-alt.webp']]) {
  const input = path.join(TOT, 'output/terrain-materials', source), output = path.join(OUT, dest);
  if (fs.existsSync(input)) await sharp(input).webp({ quality: 92, effort: 6 }).toFile(output);
  else if (!fs.existsSync(output)) throw new Error('Missing vendored dirt painting: ' + output);
}
const get = rel => fromBranch(BRANCH, BASE + rel);
const rgba = async buf => { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { w: info.width, h: info.height, px: data }; };

// ---------------------------------------------------------------- asphalt: flatten(img, 22) + shared mean (town-scene.mjs loadSources)
function boxBlur(a, w, h, r) {
  const t = new Float64Array(w * h);
  for (let it = 0; it < 3; it++) {
    for (let y = 0; y < h; y++) {
      let s = 0; for (let x = -r; x <= r; x++) s += a[y * w + Math.min(Math.max(x, 0), w - 1)];
      for (let x = 0; x < w; x++) { t[y * w + x] = s / (2 * r + 1); s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]; }
    }
    for (let x = 0; x < w; x++) {
      let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(Math.max(y, 0), h - 1) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = s / (2 * r + 1); s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; }
    }
  }
  return a;
}
const asph = [];
for (const name of ['asphalt-a.png', 'asphalt-b.png']) {
  const { w, h, px } = await rgba(await get('roads/' + name));
  const ch = [0, 1, 2].map(k => { const a = new Float64Array(w * h); for (let i = 0; i < w * h; i++) a[i] = px[i * 4 + k]; return a; });
  const mean = ch.map(a => a.reduce((s, v) => s + v, 0) / a.length);
  for (let k = 0; k < 3; k++) { const lo = boxBlur(Float64Array.from(ch[k]), w, h, 22); for (let i = 0; i < w * h; i++) ch[k][i] = ch[k][i] - lo[i] + mean[k]; }
  asph.push({ name, w, h, ch, mean });
}
const tw = asph.reduce((s, a) => s + a.w, 0);
const shared = [0, 1, 2].map(k => asph.reduce((s, a) => s + a.mean[k] * a.w, 0) / tw);
for (const { name, w, h, ch, mean } of asph) {
  const out = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) for (let k = 0; k < 3; k++) out[i * 3 + k] = Math.max(0, Math.min(255, Math.round(ch[k][i] - mean[k] + shared[k])));
  await sharp(out, { raw: { width: w, height: h, channels: 3 } }).webp({ quality: 93, effort: 6 }).toFile(path.join(OUT, name.replace('.png', '.webp')));
}
console.log('asphalt mean', shared.map(v => v.toFixed(1)).join(' '));

// ---------------------------------------------------------------- curbs, pool stamp: copied as they are
for (const rel of ['roads/curb-visible.png', 'roads/curb-hidden.png', 'roads/pool-straight-intensity.png']) fs.writeFileSync(path.join(OUT, path.basename(rel)), await get(rel));
// ---------------------------------------------------------------- slabs: one strip, every slab stretched to 144 x 100
const slabNames = [...[0, 1, 2, 3].map(i => `top-${i}`), ...[0, 1, 2, 3, 4, 5, 6].map(i => `bottom-${i}`)];
const slabTiles = await Promise.all(slabNames.map(async (s, i) => ({ input: await sharp(await get(`roads/slabs/${s}.png`)).resize(144, 100, { fit: 'fill' }).png().toBuffer(), left: i * 144, top: 0 })));
await sharp({ create: { width: 144 * slabNames.length, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(slabTiles).webp({ quality: 92, effort: 6 }).toFile(path.join(OUT, 'slabs.webp'));
// ---------------------------------------------------------------- grass bases at the approved 256 px screen repeat
for (const name of ['grass-base.png', 'grass-v2-base.png']) await sharp(await get('terrain/' + name)).resize(256, 256, { fit: 'fill', kernel: 'lanczos3' }).webp({ quality: 92 }).toFile(path.join(OUT, name.replace('.png', '.webp')));

// New generated materials at the existing 256 px repeat (masters stay untouched).
for (const [name, source] of [['backyard', 'backyard-lush'], ['meadow', 'meadow-lush']]) await sharp(path.join(OUT, 'grass-v1/png/grass-' + source + '.png')).resize(256, 256).webp({ quality: 92 }).toFile(path.join(OUT, 'grass-capital-' + name + '.webp'));

// ---------------------------------------------------------------- the builder's grass dressing (town-scene.mjs loadSources): the bare-soil
// base at the same 256 px repeat, and the grass/leaf decals and tufts at their base widths in world px, packed in one strip
await sharp(await get('terrain/soil-mud-v2-base.png')).resize(256, 256, { fit: 'fill', kernel: 'lanczos3' }).webp({ quality: 92 }).toFile(path.join(OUT, 'soil.webp'));
const DECAL_SRC = [['decal-01-lush-grass', 'grass', 230], ['decal-02-dry-golden-grass', 'grass', 230], ['decal-03-moss-groundcover', 'grass', 250], ['decal-04-low-weeds', 'grass', 190], ['decal-05-thin-grass', 'grass', 210], ['decal-06-orange-leaf-scatter', 'leaves', 170], ['decal-07-red-leaf-cluster', 'leaves', 150], ['decal-08-yellow-leaf-scatter', 'leaves', 150], ['scatter-grass-tufts', 'tufts', 260]];
const decals = []; let dx = 0, dh = 0;
for (const [file, kind, base] of DECAL_SRC) {
  const buf = await get(`terrain/${file}.png`), m = await sharp(buf).metadata(), h = Math.round(base * m.height / m.width);
  decals.push({ input: await sharp(buf).resize(base, h, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer(), left: dx + 1, top: 1, meta: { kind, x: dx + 1, y: 1, w: base, h } });
  dx += base + 2; dh = Math.max(dh, h + 2);
}
await sharp({ create: { width: dx, height: dh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(decals.map(({ input, left, top }) => ({ input, left, top }))).webp({ quality: 92, alphaQuality: 100, effort: 6 }).toFile(path.join(OUT, 'decals.webp'));
// ---------------------------------------------------------------- car-park asphalt: the ~28 m painting, its mean moved a touch lighter and greyer than the road's
{
  const { w, h, px } = await rgba(await get('paving/lot-asphalt-3.png'));
  const m = [0, 0, 0]; for (let i = 0; i < w * h; i++) for (let k = 0; k < 3; k++) m[k] += px[i * 4 + k] / (w * h);
  const target = [shared[0] * 1.06 + 2, shared[1] * 1.06 + 2, shared[2] * 1.02], out = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) for (let k = 0; k < 3; k++) out[i * 3 + k] = Math.max(0, Math.min(255, Math.round(px[i * 4 + k] - m[k] + target[k])));
  await sharp(out, { raw: { width: w, height: h, channels: 3 } }).webp({ quality: 92, effort: 6 }).toFile(path.join(OUT, 'lot-asphalt.webp'));
}

// ---------------------------------------------------------------- leaves: the builder's sprites, filtered like loadSources, packed into an atlas
const meta = JSON.parse((await get('roads/leaves.json')).toString());
const by = { tiny: [], orange: [], yellow: [] };
for (const l of meta) if (Math.max(l.width, l.height) >= 14 && by[l.source]) by[l.source].push(l);
let seed = 7; const rnd = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
const pick = [];
for (const [src, n] of [['tiny', 26], ['orange', 22], ['yellow', 24]]) {
  const lst = by[src].sort((a, b) => Math.max(a.width, a.height) - Math.max(b.width, b.height)), step = Math.max(1, Math.floor(lst.length / n));
  for (let i = 0; i < n; i++) pick.push(lst[Math.min(lst.length - 1, i * step + rnd(step))]);
}
const CELL = 40, kept = [];
for (const l of pick) {
  const buf = await get('roads/leaves/' + l.file), { w, h, px } = await rgba(buf);
  let n = 0, green = 0, r = 0, g = 0;
  for (let i = 0; i < w * h; i++) { if (px[i * 4 + 3] < 150) continue; n++; r += px[i * 4]; g += px[i * 4 + 1]; if (px[i * 4 + 1] > px[i * 4] * 0.95) green++; }
  if (!n || green / n >= 0.12 || (r - g) / n < 58) continue;
  kept.push({ l, buf });
}
const cols = 12, rows = Math.ceil(kept.length / cols);
const leafTiles = await Promise.all(kept.map(async ({ buf }, i) => ({ input: await sharp(buf).resize(CELL - 2, CELL - 2, { fit: 'inside' }).png().toBuffer(), left: (i % cols) * CELL + 1, top: Math.floor(i / cols) * CELL + 1 })));
await sharp({ create: { width: cols * CELL, height: rows * CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(leafTiles).webp({ quality: 92, effort: 6 }).toFile(path.join(OUT, 'leaves.webp'));
const leafMeta = kept.map(({ l }, i) => ({ i, dim: Math.max(l.width, l.height), round: l.source === 'tiny' }));

fs.writeFileSync(path.join(ROOT, 'src/game/ground-art.ts'), `// Generated by scripts/assets/prep-ground.mjs from the town builder's art (TrickOrTreat@${BRANCH}, art/town-ground).
import asphaltA from '../assets/ground/asphalt-a.webp';
import asphaltB from '../assets/ground/asphalt-b.webp';
import curbVisible from '../assets/ground/curb-visible.png';
import curbHidden from '../assets/ground/curb-hidden.png';
import pool from '../assets/ground/pool-straight-intensity.png';
import slabs from '../assets/ground/slabs.webp';
import grassA from '../assets/ground/grass-capital-backyard.webp';
import grassB from '../assets/ground/grass-capital-meadow.webp';
import leaves from '../assets/ground/leaves.webp';
import soil from '../assets/ground/soil.webp';
import rockyDirt from '../assets/ground/rocky-dirt.webp';
import rockyDirtAlt from '../assets/ground/rocky-dirt-alt.webp';
import decals from '../assets/ground/decals.webp';
import lotAsphalt from '../assets/ground/lot-asphalt.webp';
import lotDecals from '../assets/ground/lot-decals.webp';
import nature from '../assets/ground/nature.webp';

export const GROUND_ART = { asphaltA, asphaltB, curbVisible, curbHidden, pool, slabs, grassA, grassB, leaves, soil, rockyDirt, rockyDirtAlt, decals, lotAsphalt, lotDecals, nature };
export type GroundArt = typeof GROUND_ART;
/** painted px per metre of the road kit (manifest.json pxPerM) */
export const PPM = 55.2;
export const ASPHALT_MEAN: [number, number, number] = [${shared.map(v => v.toFixed(2)).join(', ')}];
export const SLAB_COUNT = ${slabNames.length};
export const SLAB_TOP = 4;
export const SLAB_CELL: [number, number] = [144, 100];
export const LEAF_CELL = ${CELL};
export const LEAF_COLS = ${cols};
/** dim = the sprite's native size in px at 55.2 px/m; round = the small round 'tiny' pool */
export const LEAVES: { i: number; dim: number; round: boolean }[] = ${JSON.stringify(leafMeta)};
/** the manifest's pool stamp anchor: lampU (px along), curbRow (px across) */
export const POOL_ANCHOR: [number, number] = [190, 20.5];
/** the builder's grass decals in decals.webp (x, y, w, h in px = world px at scale 1): grass patches, leaf scatters, tufts */
export const DECALS: { kind: 'grass' | 'leaves' | 'tufts'; x: number; y: number; w: number; h: number }[] = ${JSON.stringify(decals.map(d => d.meta))};
/** the car-park asphalt painting spans this many metres */
export const LOT_ASPHALT_M = 28;
`);
console.log('leaves kept', kept.length, 'atlas', cols, 'x', rows);

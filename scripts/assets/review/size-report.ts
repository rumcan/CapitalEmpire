// The sizes of every library sprite as the game draws them, for the sprite studio's Library tab (server.mjs bundles this with esbuild, the atlas
// pictures as their file paths, and runs it in a child process): the game's own LIBRARY (every library appended, the four-view art in place),
// OWNER_SCALE (the studio's sizes read at runtime) and newart.ts lookOf (stand-ins, the pixel cap). Prints one JSON object: id -> entry.
//   scale   the scale the game places the sprite at (its studio size, else the owner's table, else 1); base: what a studio reset falls back to
//   sizeId  the id whose studio size it takes (a four-view picture and an east view take their building's: one size for the four views; a car takes its model's)
//   drawn   what is drawn at that scale: the picture (a stand-in for an old building), its quad and its scale (capped at its pixels); fill: its
//           drawn scale per scale of the sprite below the cap (a stand-in fills the old footprint), cap: the drawn scale it never exceeds
//   sharp   the largest scale it is drawn at without stretching its atlas pixels at the closest zoom (null: drawn as nothing)
//   native  the largest scale its source picture's own pixels allow: the four-view art (art/building-views, the smallest of its views); a car's eight
//           views (art/cars, the smallest of its model's, over CAR_SCALE); a sprite the game draws as itself and prep-sprites.mjs packs, from its painted
//           source's width (the same lookup prep-sprites uses); a business picture (prep-business-art.mjs) from its capital-v1 master's width. Above it
//           the studio warns (soft, a Rebuild upscales the picture) and never refuses. A stand-in (an old building drawn as new art: its own
//           picture is never drawn) takes the smallest of its stand-ins' (newart.ts standInCandidates) as a scale of itself: what a Rebuild
//           (prep-views.mjs) packs them for. null: unknown
import fs from 'node:fs';
import path from 'node:path';
import { ATLAS_MIP0, ATLAS_PAGES, LIBRARY } from '../../../src/game/library';
import { OWNER_SCALE, TABLE_SCALE } from '../../../src/game/lots/scales';
import { lookOf, standInCandidates } from '../../../src/game/newart';
import { PIXEL_LIMIT, PIXEL_SLACK, atlasRes } from '../../../src/game/sizes';
import { VIEW_ART } from '../../../src/game/views-library';
import { CAR_SCALE, carSizeId } from '../../../src/game/ext/car-art';
import type { LibItem } from '../../../src/game/types';
import { TOT, libraryItems } from '../source.mjs';
import { capitalItems } from '../capital-art.mjs';

const ROOT = process.cwd(), INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
const span = (it: LibItem) => { const b = it.boxes[0]; return b ? b.hx + b.hy : 1; };
const sizeIdOf = (id: string) => { const v = /^view:(.+):(se|sw|nw)$/.exec(id); return v ? v[1]! : id.startsWith('east:') && INDEX.has(id.slice(5)) ? id.slice(5) : carSizeId(id); };
const scaleOf = (id: string) => OWNER_SCALE[sizeIdOf(id)] ?? OWNER_SCALE[id] ?? 1;
/** the four-view sources' native widths (art/building-views/<slug>/<DIR>.png) by the library id each view is drawn as */
const NATIVE_W = new Map<string, number>(), STORE = path.join(ROOT, 'art/building-views');
if (fs.existsSync(STORE)) for (const slug of fs.readdirSync(STORE)) {
  const src = path.join(STORE, slug, 'source.json'); if (!fs.existsSync(src)) continue;
  const { id } = JSON.parse(fs.readFileSync(src, 'utf8')) as { id: string };
  const se = INDEX.has(`east:${id}`) && VIEW_ART.has(`east:${id}`) ? `east:${id}` : `view:${id}:se`;
  for (const [dir, lid] of [['NE', id], ['SE', se], ['SW', `view:${id}:sw`], ['NW', `view:${id}:nw`]] as const) {
    const f = path.join(STORE, slug, `${dir}.png`); if (fs.existsSync(f)) NATIVE_W.set(lid, fs.readFileSync(f).readUInt32BE(16));
  }
}
/** the car pictures' native widths (art/cars/<model>/manifest.json, prep-cars.mjs): each heading is the library id cars:<model>:<key>, and the eight share one size */
const CARS = path.join(ROOT, 'art/cars');
if (fs.existsSync(CARS)) for (const model of fs.readdirSync(CARS)) {
  const man = path.join(CARS, model, 'manifest.json'); if (!fs.existsSync(man)) continue;
  for (const v of (JSON.parse(fs.readFileSync(man, 'utf8')) as { views: { key: string; file: string }[] }).views) {
    const id = `cars:${model}:${v.key}`, f = path.join(CARS, model, v.file); if (INDEX.has(id) && fs.existsSync(f)) NATIVE_W.set(id, fs.readFileSync(f).readUInt32BE(16));
  }
}
/** prep-sprites.mjs packs a town sprite at 0.6 x its largest drawn scale (the owner's scale +5%, the forest's 1.5), up to 3x its source (upscaled past it) */
const FOREST = new Set([...fs.readFileSync(path.join(ROOT, 'src/game/forest.ts'), 'utf8').matchAll(/'([a-z]+:[^']+)'/g)].map(m => m[1]!));
const packedFor = (id: string) => Math.max(1, (OWNER_SCALE[id] ?? 0) * 1.05, FOREST.has(id) ? 1.5 : 0);

/** a picture's width in its own pixels, from its PNG or WebP header (cached by file; null for any other format or a missing file) */
const WIDTH = new Map<string, number | null>();
function pixelWidth(file: string): number | null {
  if (WIDTH.has(file)) return WIDTH.get(file)!;
  let w: number | null = null;
  try {
    const b = Buffer.alloc(32), fd = fs.openSync(file, 'r');
    try { fs.readSync(fd, b, 0, 32, 0); } finally { fs.closeSync(fd); }
    const tag = b.toString('latin1', 12, 16);
    if (b.toString('latin1', 1, 4) === 'PNG') w = b.readUInt32BE(16);
    else if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') w = tag === 'VP8X' ? 1 + b.readUIntLE(24, 3) : tag === 'VP8L' ? (b.readUInt32LE(21) & 0x3fff) + 1 : tag === 'VP8 ' ? b.readUInt16LE(26) & 0x3fff : null;
  } catch { w = null; }
  WIDTH.set(file, w); return w;
}
/** a business picture's capital-v1 master (manifest.json), the largest real source of the business pack (prep-business-art.mjs) */
const BUSINESS_MASTER = new Map<string, string>();
for (const m of (JSON.parse(fs.readFileSync(path.join(ROOT, 'src/assets/businesses/capital-v1/manifest.json'), 'utf8')) as { items: { id: string; file: string }[] }).items)
  BUSINESS_MASTER.set('business:' + m.id, path.join(ROOT, 'src/assets/businesses/capital-v1', m.file));
/** the painted source of each sprite prep-sprites.mjs packs, found as it finds it (later wins, as there): the TrickOrTreat library's file, the
 *  TrickOrTreat export's hd picture, the Capital art, the repo's own art/<set>/items.json local entries. Local checkouts only (no network) */
async function sourceFiles(): Promise<Map<string, string>> {
  const exp = path.join(TOT, 'public/assets/town-built'), files = new Map<string, string>();
  const town: Record<string, { file: string }> = fs.existsSync(path.join(exp, 'town.json')) ? JSON.parse(fs.readFileSync(path.join(exp, 'town.json'), 'utf8')).items : {};
  const cap = capitalItems() as Record<string, { src: string }>;
  for (const [id, it] of Object.entries(await libraryItems(new Set([...Object.keys(town), ...Object.keys(cap)]))) as [string, { src: string }][]) files.set(id, it.src);
  for (const [id, it] of Object.entries(town)) { const f = path.basename(it.file), p = [path.join(exp, 'sprites-hd', f), path.join(exp, 'sprites', f)].find(x => fs.existsSync(x)); if (p) files.set(id, p); }
  for (const [id, it] of Object.entries(cap)) files.set(id, it.src);
  for (const set of fs.readdirSync(path.join(ROOT, 'art'), { withFileTypes: true })) {
    const f = path.join(ROOT, 'art', set.name, 'items.json');
    if (set.isDirectory() && fs.existsSync(f)) for (const [id, it] of Object.entries(JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, { local?: boolean; file: string }>)) if (it?.local) files.set(id, path.join(ROOT, it.file));
  }
  return files;
}
const SOURCE = await sourceFiles();
/** the pixel width of a sprite's painted source, null when none is found */
const sourcePx = (id: string) => { const f = SOURCE.get(id); return f ? pixelWidth(f) : null; };

/** the four views of one building (by its size id) as a scale of it: the smallest of their sources' pixels over their display width at mip 0 (the
 *  largest the building is sharp to from its own art, whatever it is packed at); null for a sprite without views */
const viewsNative = (sizeId: string): number | null => {
  const views = [...NATIVE_W.keys()].filter(v => sizeIdOf(v) === sizeId);
  return views.length ? Math.min(...views.map(v => { const x = LIBRARY[INDEX.get(v)!]!; return NATIVE_W.get(v)! / (ATLAS_MIP0 * (x.quad[2] - x.quad[0])); })) : null;
};
const at = (i: number, scale: number) => {
  const it = LIBRARY[i]!; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of it.boxes) { const hx = b.hx * scale / 2, hy = b.hy * scale / 2, dx = b.dx * scale / 2, dy = b.dy * scale / 2; x0 = Math.min(x0, dx - hx); x1 = Math.max(x1, dx + hx); y0 = Math.min(y0, dy - hy); y1 = Math.max(y1, dy + hy); }
  return { item: i, x: 0, y: 0, flip: false, scale, x0, y0, x1, y1 };
};
/** is a drawable drawn smaller than asked (its picture capped at its pixels) */
const capped = (i: number, scale: number) => {
  const d = at(i, scale), l = lookOf(d); if (l.hidden) return true;
  const want = l.item === i ? scale : scale * span(LIBRARY[i]!) / span(LIBRARY[l.item]!);
  return l.scale < want * (1 - 1e-6);
};

const out: Record<string, unknown> = {};
LIBRARY.forEach((it, i) => {
  if (it.kind === 'walker' || out[it.id]) return;
  const scale = scaleOf(it.id), d = at(i, scale), l = lookOf(d), n = LIBRARY[l.item]!, self = lookOf(at(i, 1e-3)).item === i;
  let sharp: number | null;
  if (l.hidden) sharp = null;
  else if (self) sharp = PIXEL_LIMIT[i]! * PIXEL_SLACK / (it.kind === 'car' ? CAR_SCALE : 1);
  else { let s = 0.2; while (s < 8 && !capped(i, s * 1.02)) s *= 1.02; sharp = s; }
  // the source's limit: the four views of one building share the smallest; a sprite prep-sprites.mjs packs is as big as its painted source is
  // (its width over its display width at mip 0: prep-sprites packs it at min(0.6 x its largest scale, source px per display px)); a car is drawn CAR_SCALE smaller
  let native: number | null = null;
  const views = viewsNative(sizeIdOf(it.id)), atlasSprite = /assets\/atlas\/sprites-/.test(String(ATLAS_PAGES[it.tex[0]]?.[0] ?? '').replaceAll('\\', '/'));
  if (self && views !== null) native = views / (it.kind === 'car' ? CAR_SCALE : 1);
  else if (self && BUSINESS_MASTER.has(it.id)) { const px = pixelWidth(BUSINESS_MASTER.get(it.id)!); native = px ? px / (ATLAS_MIP0 * it.w) : null; }
  else if (self && atlasSprite) {
    const px = sourcePx(it.id);
    // no source found: a town sprite packed short of its largest drawn scale is short of its atlas (the old limit)
    native = px ? px / (ATLAS_MIP0 * it.w) / (it.kind === 'car' ? CAR_SCALE : 1) : atlasRes(it) < ATLAS_MIP0 * packedFor(it.id) * 0.995 ? PIXEL_LIMIT[i]! : null;
  }
  else if (!self) {
    // drawn as a stand-in: the smallest of its stand-ins' own pixels, as a scale of this building (a stand-in fills its footprint, span for span);
    // prep-views packs each stand-in for what the buildings drawn as it need, so past this a Rebuild upscales (soft). Its sharp when unknown
    const limits = standInCandidates(i, scale).map(s => { const n = LIBRARY[s]!, v = viewsNative(sizeIdOf(n.id)); return v === null ? null : v * span(n) / span(it); });
    native = limits.length && limits.every(v => v !== null) ? Math.min(...(limits as number[])) : sharp;
  }
  out[it.id] = {
    id: it.id, name: it.name, cat: it.cat, kind: it.kind, w: it.w, h: it.h, ax: it.ax, ay: it.ay, quad: it.quad, tex: it.tex, page: ATLAS_PAGES[it.tex[0]]?.[0] ?? null,
    scale, base: TABLE_SCALE[sizeIdOf(it.id)] ?? 1, sizeId: sizeIdOf(it.id),
    drawn: l.hidden ? null : { id: n.id, name: n.name, quad: n.quad, scale: l.scale, fill: l.item === i ? 1 : span(it) / span(n), cap: PIXEL_LIMIT[l.item]! * PIXEL_SLACK },
    sharp: sharp === null ? null : +sharp.toFixed(3), native: native === null ? null : +native.toFixed(3),
  };
});
process.stdout.write(JSON.stringify(out));

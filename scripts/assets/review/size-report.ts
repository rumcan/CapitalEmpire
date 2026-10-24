// The sizes of every library sprite as the game draws them, for the sprite studio's Library tab (server.mjs bundles this with esbuild, the atlas
// pictures as their file paths, and runs it in a child process): the game's own LIBRARY (every library appended, the four-view art in place),
// OWNER_SCALE (the studio's sizes read at runtime) and newart.ts lookOf (stand-ins, the pixel cap). Prints one JSON object: id -> entry.
//   scale   the scale the game places the sprite at (its studio size, else the owner's table, else 1); base: what a studio reset falls back to
//   sizeId  the id whose studio size it takes (a four-view picture and an east view take their building's: one size for the four views)
//   drawn   what is drawn at that scale: the picture (a stand-in for an old building), its quad and its scale (capped at its pixels); fill: its
//           drawn scale per scale of the sprite below the cap (a stand-in fills the old footprint), cap: the drawn scale it never exceeds
//   sharp   the largest scale it is drawn at without stretching its atlas pixels at the closest zoom (null: drawn as nothing)
//   native  the largest scale its source picture's own pixels allow (the four-view art: art/building-views; a town sprite whose atlas rect
//           already holds all its source has): above it the studio refuses a size. null: unknown (a Rebuild packs it bigger, as far as its source goes)
import fs from 'node:fs';
import path from 'node:path';
import { ATLAS_MIP0, ATLAS_PAGES, LIBRARY } from '../../../src/game/library';
import { OWNER_SCALE, TABLE_SCALE } from '../../../src/game/lots/scales';
import { lookOf } from '../../../src/game/newart';
import { PIXEL_LIMIT, PIXEL_SLACK, atlasRes } from '../../../src/game/sizes';
import { VIEW_ART } from '../../../src/game/views-library';
import { CAR_SCALE } from '../../../src/game/ext/car-art';
import type { LibItem } from '../../../src/game/types';

const ROOT = process.cwd(), INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
const span = (it: LibItem) => { const b = it.boxes[0]; return b ? b.hx + b.hy : 1; };
const sizeIdOf = (id: string) => { const v = /^view:(.+):(se|sw|nw)$/.exec(id); return v ? v[1]! : id.startsWith('east:') && INDEX.has(id.slice(5)) ? id.slice(5) : id; };
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
/** prep-sprites.mjs packs a town sprite at 0.6 x its largest drawn scale (the owner's scale +5%, the forest's 1.5), as far as its source goes */
const FOREST = new Set([...fs.readFileSync(path.join(ROOT, 'src/game/forest.ts'), 'utf8').matchAll(/'([a-z]+:[^']+)'/g)].map(m => m[1]!));
const packedFor = (id: string) => Math.max(1, (OWNER_SCALE[id] ?? 0) * 1.05, FOREST.has(id) ? 1.5 : 0);

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
  // the source's limit: the four views of one building share the smallest; a town sprite packed short of its largest drawn scale is short of source
  let native: number | null = null;
  const views = [...NATIVE_W.keys()].filter(v => sizeIdOf(v) === sizeIdOf(it.id));
  if (self && views.length) native = Math.min(...views.map(v => { const x = LIBRARY[INDEX.get(v)!]!; return NATIVE_W.get(v)! / (ATLAS_MIP0 * (x.quad[2] - x.quad[0])); }));
  else if (self && /assets\/atlas\/sprites-/.test(String(ATLAS_PAGES[it.tex[0]]?.[0] ?? '').replaceAll('\\', '/')) && atlasRes(it) < ATLAS_MIP0 * packedFor(it.id) * 0.995) native = PIXEL_LIMIT[i]!;
  else if (!self) native = sharp;
  out[it.id] = {
    id: it.id, name: it.name, cat: it.cat, kind: it.kind, w: it.w, h: it.h, ax: it.ax, ay: it.ay, quad: it.quad, tex: it.tex, page: ATLAS_PAGES[it.tex[0]]?.[0] ?? null,
    scale, base: TABLE_SCALE[sizeIdOf(it.id)] ?? 1, sizeId: sizeIdOf(it.id),
    drawn: l.hidden ? null : { id: n.id, name: n.name, quad: n.quad, scale: l.scale, fill: l.item === i ? 1 : span(it) / span(n), cap: PIXEL_LIMIT[l.item]! * PIXEL_SLACK },
    sharp: sharp === null ? null : +sharp.toFixed(3), native: native === null ? null : +native.toFixed(3),
  };
});
process.stdout.write(JSON.stringify(out));

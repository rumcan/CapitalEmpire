// Size audit: every library sprite the game draws, at its largest on-screen size at the closest zoom, against the pixels its atlas rect holds.
//   npx esbuild scripts/assets/size-audit.ts --bundle --platform=node --format=esm --loader:.webp=empty --loader:.png=empty \
//     --outfile=output/size-audit/size-audit.mjs --log-level=warning && node output/size-audit/size-audit.mjs [--json output/size-audit/audit.json]
// The closest zoom is ZOOM_MAX (0.3 CSS px per world px); on a dpr-2 screen that is 0.6 device px per display px, exactly what mip 0 holds for a
// sprite packed at scale 1 (ATLAS_MIP0). A sprite drawn at scale s needs 0.6 s atlas px per display px; its atlas rect holds R (its tex size in
// atlas px over its quad in display px), so it is stretched 0.6 s / R times: above 1 it pixelates. The draws are the game's own: the Lot
// Composer over a street grid (every use, level and decline, many seeds), every sprite at its owner scale with the generators' +10% (the golf
// dressing, the plant brush, the farms, the forest), the business parcels' art, and the player's resize (up to 1.6, listed apart). Each draw goes
// through newart.ts lookOf (an old building is drawn as a new-art stand-in) exactly as sprites.ts draws it.
import fs from 'node:fs';
import path from 'node:path';
import { CLASS, RoadNetwork, type Leg } from '../../src/game/network';
import { NetEditor } from '../../src/game/netops';
import { LotMap } from '../../src/game/lots/lots';
import { compose } from '../../src/game/lots/compose';
import { LIBRARY, ATLAS_SIZE, ATLAS_MIP0 } from '../../src/game/library';
import { OWNER_SCALE } from '../../src/game/lots/scales';
import { lookOf } from '../../src/game/newart';
import { VIEW_ART } from '../../src/game/views-library';
import { businessArt } from '../../src/game/business/art';
import { BUSINESS, type BusinessId } from '../../src/game/business/catalogue';
import { mulberry } from '../../src/game/iso';
import type { LibItem } from '../../src/game/types';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** atlas px per display px the item's rect holds (the smaller of its two axes) */
const res = (it: LibItem) => Math.min((it.tex[3] - it.tex[1]) * ATLAS_SIZE / Math.max(1e-6, it.quad[2] - it.quad[0]), (it.tex[4] - it.tex[2]) * ATLAS_SIZE / Math.max(1e-6, it.quad[3] - it.quad[1]));
/** the largest scale the item is drawn at without stretching its atlas pixels at the closest zoom */
const limit = (it: LibItem) => res(it) / ATLAS_MIP0;
const isView = (id: string) => VIEW_ART.has(id) || id.startsWith('view:');

// the four-view sources (art/building-views/<slug>/<DIR>.png): their native width, to tell an atlas stretch from a picture with too few pixels
const ROOT = process.cwd(), STORE = path.join(ROOT, 'art/building-views');
const pngWidth = (f: string) => { const b = fs.readFileSync(f); return b.readUInt32BE(16); };
const NATIVE = new Map<string, number>();
if (fs.existsSync(STORE)) for (const slug of fs.readdirSync(STORE)) {
  const src = path.join(STORE, slug, 'source.json'); if (!fs.existsSync(src)) continue;
  const { id } = JSON.parse(fs.readFileSync(src, 'utf8')) as { id: string };
  const se = INDEX.has(`east:${id}`) ? `east:${id}` : `view:${id}:se`;
  for (const [dir, lid] of [['NE', id], ['SE', se], ['SW', `view:${id}:sw`], ['NW', `view:${id}:nw`]] as const) { const f = path.join(STORE, slug, `${dir}.png`); if (fs.existsSync(f)) NATIVE.set(lid, pngWidth(f)); }
}

interface Draw { placed: string; drawn: string; scale: number; drawnScale: number; stretch: number; source: string; standIn: boolean; nativeStretch?: number }
const worst = new Map<string, Draw>(), worstPlaced = new Map<string, Draw>(), player = new Map<string, Draw>(), bySource = new Map<string, Map<string, Draw>>();
let draws = 0;
function footprint(it: LibItem, x: number, y: number, flip: boolean, k: number) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of it.boxes) {
    const hx = (flip ? b.hy : b.hx) * k / 2, hy = (flip ? b.hx : b.hy) * k / 2, dx = (flip ? b.dy : b.dx) * k / 2, dy = (flip ? b.dx : b.dy) * k / 2;
    x0 = Math.min(x0, x + dx - hx); x1 = Math.max(x1, x + dx + hx); y0 = Math.min(y0, y + dy - hy); y1 = Math.max(y1, y + dy + hy);
  }
  return { x0, y0, x1, y1 };
}
function draw(id: string, x: number, y: number, flip: boolean, scale: number, source: string, into = worst) {
  const item = INDEX.get(id); if (item === undefined) return;
  const it = LIBRARY[item]!; if (it.kind === 'walker') return;
  const d = { item, x, y, flip, scale, ...footprint(it, x, y, flip, scale) }, l = lookOf(d);
  if (l.hidden) return;
  const n = LIBRARY[l.item]!, f = n.kind === 'car' ? 0.8 : 1, s = l.scale * f, stretch = s / limit(n);
  const w = NATIVE.get(n.id), nativeStretch = w ? (n.quad[2] - n.quad[0]) * s * ATLAS_MIP0 / w : undefined;
  const r: Draw = { placed: id, drawn: n.id, scale, drawnScale: s, stretch, source, standIn: l.item !== item, nativeStretch };
  draws++;
  const o = into.get(n.id); if (!o || o.stretch < stretch) into.set(n.id, r);
  if (into === worst) {
    const p = worstPlaced.get(id); if (!p || p.stretch < stretch) worstPlaced.set(id, r);
    const cat = source.split(' ')[0]!; let m = bySource.get(cat); if (!m) bySource.set(cat, m = new Map());
    const q = m.get(n.id); if (!q || q.stretch < stretch) m.set(n.id, r);
  }
}

// 1. the Lot Composer over a 4 x 4 street grid with a boulevard (tests/compose.test.ts), every use, level and decline, several seeds
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const O = 40, STEP = 40, LINES = 4, at = (k: number) => O + k * STEP, last = at(LINES - 1);
const e = new NetEditor(new RoadNetwork());
for (let k = 0; k < LINES; k++) { e.addLegs([leg(O, at(k), last, at(k))], CLASS.street, 0); e.addLegs([leg(at(k), O, at(k), last)], CLASS.street, 0); }
e.commit(); e.addLegs([leg(at(1) + 20, O, at(1) + 20, last)], CLASS.boulevard, 0); e.commit();
const lm = new LotMap(); lm.update(e.net, null);
const LOTS = [...lm.lots.values()].sort((p, q) => (p.key < q.key ? -1 : 1));
const SEEDS = Number(process.env.SEEDS ?? 4), rnd = mulberry(20261024);
for (const lot of LOTS) for (let use = 0; use < 6; use++) for (let level = 0; level < 4; level++) for (let decline = 0; decline < 4; decline++) for (let s = 0; s < SEEDS; s++) {
  const c = compose(lot, { use, level, decline, seed: Math.floor(rnd() * 4294967296) >>> 0 });
  for (const p of c.props) draw(p.id, p.x, p.y, p.flip, p.scale, 'composer');
}
// 2. every sprite at its owner scale with the generators' spread (+10%: golf dressing 0.9-1.1, plant brush, farms +5%, forest 0.9-1.1)
LIBRARY.forEach((it, i) => { for (const flip of [false, true]) draw(it.id, 100 + i % 50, 100 + Math.floor(i / 50), flip, (OWNER_SCALE[it.id] ?? (it.kind === 'tree' ? 1.5 : 1)) * 1.1, 'owner scale +10%'); });
// 3. the business parcels' art at their canonical footprints and turned
for (const [type, b] of Object.entries(BUSINESS) as [BusinessId, (typeof BUSINESS)[BusinessId]][]) for (const turned of [false, true]) {
  const w = turned ? b.footprint.h : b.footprint.w, h = turned ? b.footprint.w : b.footprint.h;
  for (const p of businessArt({ id: 1, type, x: 200, y: 200, w, h }, LIBRARY, INDEX)) { const it = LIBRARY[p.item]!; draw(it.id, p.x, p.y, p.flip, p.scale, `business ${type}`); }
}
// 4. the player's resize (engine.scaleSelected: up to 1.6), apart
LIBRARY.forEach((it, i) => { if (it.kind !== 'lot') draw(it.id, 100 + i % 50, 100 + Math.floor(i / 50), false, Math.max(1.6, OWNER_SCALE[it.id] ?? 1), 'player resize 1.6', player); });

const rows = [...worst.values()].sort((a, b) => b.stretch - a.stretch), over = rows.filter(r => r.stretch > 1.005);
const fmt = (r: Draw) => `${r.stretch.toFixed(2)}x  ${r.drawn}${r.standIn ? ` (stand-in for ${r.placed} at ${r.scale.toFixed(2)})` : ` at ${r.scale.toFixed(2)}`}  drawn x${r.drawnScale.toFixed(2)}, ` +
  `sharp to x${limit(LIBRARY[INDEX.get(r.drawn)!]!).toFixed(2)}${r.nativeStretch ? `, vs its source ${r.nativeStretch.toFixed(2)}x` : ''}; ${r.source}`;
console.log(`${draws} draws of ${worst.size} pictures: ${over.length} drawn above their atlas pixels at the closest zoom (worst ${rows[0]?.stretch.toFixed(2)}x); ` +
  `${over.filter(r => r.standIn).length} of them as stand-ins, ${over.filter(r => isView(r.drawn) && !r.standIn).length} four-view pictures as themselves`);
for (const r of over.slice(0, Number(process.env.TOP ?? 40))) console.log('  ' + fmt(r));
for (const [cat, m] of bySource) {
  const o = [...m.values()].filter(r => r.stretch > 1.005).sort((a, b) => b.stretch - a.stretch);
  console.log(`${cat}: ${o.length} pictures above their pixels (worst ${o[0]?.stretch.toFixed(2) ?? '-'}x)`);
  for (const r of o.slice(0, Number(process.env.TOPCAT ?? 15))) console.log('    ' + fmt(r));
}
const pl = [...player.values()].filter(r => r.stretch > 1.005).sort((a, b) => b.stretch - a.stretch);
console.log(`player resize to 1.6: ${pl.length} pictures above their pixels (worst ${pl[0]?.stretch.toFixed(2) ?? '-'}x)`);
const ja = process.argv.indexOf('--json');
if (ja > 0) { const f = path.resolve(process.argv[ja + 1]!); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ draws, over, placed: [...worstPlaced.values()].filter(r => r.stretch > 1.005).sort((a, b) => b.stretch - a.stretch), player: pl,
  all: Object.fromEntries(rows.map(r => [r.drawn, r])),
  bySource: Object.fromEntries([...bySource].map(([k, m]) => [k, [...m.values()].filter(r => r.stretch > 1.005).sort((a, b) => b.stretch - a.stretch)])) }, null, 1)); }

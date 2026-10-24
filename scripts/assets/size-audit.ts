// Size audit: every sprite the game draws, on every draw path, at its largest on-screen size at the closest zoom, against the pixels its atlas
// rect holds.
//   npx esbuild scripts/assets/size-audit.ts --bundle --platform=node --format=esm --loader:.webp=empty --loader:.png=empty \
//     --outfile=output/size-audit/size-audit.mjs --log-level=warning && node output/size-audit/size-audit.mjs [--json output/size-audit/audit.json]
// The closest zoom is ZOOM_MAX (0.3 CSS px per world px): a screen of device pixel ratio dpr needs 0.3 dpr device px per display px of a sprite
// drawn at scale 1. The atlas holds R atlas px per display px in mip 0 (its tex size over its quad) and R/2 in mip 1, which a screen at 1x uses
// alone (gl.ts loadAtlas; engine.ts loads mip 0 on every screen above 1x). A sprite drawn at scale s is stretched 0.3 dpr s / held: above 1 (plus
// the 2% rounding slack) it pixelates. Checked at dpr 1, 1.25, 1.5 and 2.
// The draw paths (each with its own size rule, as the game has it), every one through newart.ts lookOf as sprites.ts draws it:
//   composer   the Lot Composer over a street grid (every use, level and decline, several seeds)
//   owner      every sprite at its owner scale with the generators' spread: golf dressing 0.9-1.1, farms +-5%, structures (at most their own)
//   brush      the plant brush (plant.ts PLANT_SIZE: up to 2.5 x the owner scale) on every tree, bush and flower
//   forest     the forest (forest.ts: owner x 0.55 x 0.82-1.18) and the town trees (towntrees.ts: owner x 0.9-1.1)
//   road       the road furniture (engine.ts autoProps: trees 0.85, roundabout trees 1.2, lamps 0.9) and the golf props (tees, pins, gates at 1)
//   cars       traffic (moving, at CAR_SCALE) and parked cars (props at 1, drawn CAR_SCALE smaller)
//   people     the townspeople, galleries and spectators (pedestrian movers at 1)
//   business   the business parcels' art at their canonical footprints, unturned and turned
//   player     the player's resize up to 1.6 (engine.scaleSelected), listed apart
// The 2D overlays (not sprites.ts): the bus-stop queue walkers (32 px sheet cells, engine.ts walkerSprite) and the business ghost (from mip 0).
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
import { FOREST_SIZE, TREE_POOL_IDS, ownerSize } from '../../src/game/forest';
import { PLANT_SIZE } from '../../src/game/plant';
import { CAR_SCALE } from '../../src/game/ext/car-art';
import { HH, mulberry } from '../../src/game/iso';
import type { LibItem } from '../../src/game/types';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** atlas px per display px the item's mip-0 rect holds (the smaller of its two axes) */
const res = (it: LibItem) => Math.min((it.tex[3] - it.tex[1]) * ATLAS_SIZE / Math.max(1e-6, it.quad[2] - it.quad[0]), (it.tex[4] - it.tex[2]) * ATLAS_SIZE / Math.max(1e-6, it.quad[3] - it.quad[1]));
/** the largest scale the item is drawn at without stretching its atlas pixels at the closest zoom on a dpr-2 screen */
const limit = (it: LibItem) => res(it) / ATLAS_MIP0;
const DPRS = [1, 1.25, 1.5, 2], SLACK = 1.02, ZOOM_MAX = 0.3;
/** mip 0 on every screen above 1x (engine.ts loadAtlas); MAIN_MIP0 is the rule before (dpr >= 1.5), for comparison */
const usesMip0 = (dpr: number) => dpr > 1, MAIN_MIP0 = (dpr: number) => dpr >= 1.5;
const stretchAt = (it: LibItem, s: number, dpr: number, mip0 = usesMip0) => ZOOM_MAX * dpr * s / (res(it) / (mip0(dpr) ? 1 : 2));
const isView = (id: string) => VIEW_ART.has(id) || id.startsWith('view:');

// the four-view sources (art/building-views/<slug>/<DIR>.png): their native width, to tell an atlas stretch from a picture with too few pixels
const ROOT = process.cwd(), STORE = path.join(ROOT, 'art/building-views');
const NATIVE = new Map<string, number>();
if (fs.existsSync(STORE)) for (const slug of fs.readdirSync(STORE)) {
  const src = path.join(STORE, slug, 'source.json'); if (!fs.existsSync(src)) continue;
  const { id } = JSON.parse(fs.readFileSync(src, 'utf8')) as { id: string };
  const se = INDEX.has(`east:${id}`) ? `east:${id}` : `view:${id}:se`;
  for (const [dir, lid] of [['NE', id], ['SE', se], ['SW', `view:${id}:sw`], ['NW', `view:${id}:nw`]] as const) { const f = path.join(STORE, slug, `${dir}.png`); if (fs.existsSync(f)) NATIVE.set(lid, fs.readFileSync(f).readUInt32BE(16)); }
}

interface Draw { placed: string; drawn: string; scale: number; asked: number; drawnScale: number; stretch: number; worst: number; worstDpr: number; mainWorst: number; source: string; standIn: boolean; nativeStretch?: number }
const worst = new Map<string, Draw>(), worstPlaced = new Map<string, Draw>(), player = new Map<string, Draw>(), bySource = new Map<string, Map<string, Draw>>();
let draws = 0, capped = 0;
const cappedBy = new Map<string, number>();
function footprint(it: LibItem, x: number, y: number, flip: boolean, k: number) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of it.boxes) {
    const hx = (flip ? b.hy : b.hx) * k / 2, hy = (flip ? b.hx : b.hy) * k / 2, dx = (flip ? b.dy : b.dx) * k / 2, dy = (flip ? b.dx : b.dy) * k / 2;
    x0 = Math.min(x0, x + dx - hx); x1 = Math.max(x1, x + dx + hx); y0 = Math.min(y0, y + dy - hy); y1 = Math.max(y1, y + dy + hy);
  }
  return { x0, y0, x1, y1 };
}
const span = (it: LibItem) => { const b = it.boxes[0]; return b ? b.hx + b.hy : 1; };
function draw(id: string, x: number, y: number, flip: boolean, scale: number, source: string, opts: { moving?: boolean; into?: Map<string, Draw> } = {}) {
  const item = INDEX.get(id); if (item === undefined) return;
  const into = opts.into ?? worst, it = LIBRARY[item]!;
  const d = { item, x, y, flip, scale, moving: opts.moving, ...footprint(it, x, y, flip, scale) }, l = lookOf(d);
  if (l.hidden) return;
  const n = LIBRARY[l.item]!, f = n.kind === 'car' && !opts.moving ? CAR_SCALE : 1, s = l.scale * f;
  // what was asked for: the prop's scale (a stand-in: the scale that fills its building's footprint)
  const asked = (l.item === item ? scale : scale * span(it) / span(n)) * f;
  const per = DPRS.map(dpr => stretchAt(n, s, dpr)), w = Math.max(...per), mainW = Math.max(...DPRS.map(dpr => stretchAt(n, asked, dpr, MAIN_MIP0)));
  const nw = NATIVE.get(n.id), nativeStretch = nw ? (n.quad[2] - n.quad[0]) * s * ATLAS_MIP0 / nw : undefined;
  const r: Draw = { placed: id, drawn: n.id, scale, asked, drawnScale: s, stretch: per[3]!, worst: w, worstDpr: DPRS[per.indexOf(w)]!, mainWorst: mainW, source, standIn: l.item !== item, nativeStretch };
  draws++;
  if (asked > limit(n) * SLACK) { capped++; const c = source.split(' ')[0]!; cappedBy.set(c, (cappedBy.get(c) ?? 0) + 1); }
  const o = into.get(n.id); if (!o || o.worst < w) into.set(n.id, r);
  if (into === worst) {
    const p = worstPlaced.get(id); if (!p || p.worst < w) worstPlaced.set(id, r);
    const cat = source.split(' ')[0]!; let m = bySource.get(cat); if (!m) bySource.set(cat, m = new Map());
    const q = m.get(n.id); if (!q || q.worst < w) m.set(n.id, r);
  }
}
const own = (it: LibItem) => OWNER_SCALE[it.id] ?? 1;

// composer: the Lot Composer over a 4 x 4 street grid with a boulevard (tests/compose.test.ts), every use, level and decline, several seeds
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
const where = (i: number) => [100 + i % 50, 100 + Math.floor(i / 50)] as const;
LIBRARY.forEach((it, i) => {
  if (it.kind === 'walker') return;
  const [x, y] = where(i);
  // owner: every sprite at its owner scale with the generators' +10% (golf dressing, farms, structures at most their own)
  for (const flip of [false, true]) draw(it.id, x, y, flip, own(it) * 1.1, 'owner scale +10%');
  // brush: the plant brush on every plant (trees, bushes, flowers) up to PLANT_SIZE's top
  if (it.kind === 'tree' || it.kind === 'bush' || /flower|fern|grass|hydrangea|plant/.test(it.id)) draw(it.id, x, y, false, own(it) * PLANT_SIZE[1], 'brush x2.5');
  // road: the autoProps' absolute scales (trees 0.85, roundabout trees 1.2, lamps 0.9) and the golf props at 1
  if (it.kind === 'tree') draw(it.id, x, y, false, 1.2, 'road tree 1.2');
  draw(it.id, x, y, false, 1, 'road/golf props at 1');
  // cars: parked (a prop at 1, drawn CAR_SCALE smaller) and moving (at CAR_SCALE)
  if (it.kind === 'car') { draw(it.id, x, y, false, 1, 'cars parked'); draw(it.id, x, y, false, CAR_SCALE, 'cars moving', { moving: true }); }
  // player: the resize up to 1.6, apart
  if (it.kind !== 'lot') draw(it.id, x, y, false, Math.max(1.6, own(it)), 'player resize 1.6', { into: player });
});
// forest and town trees (forest.ts, towntrees.ts)
for (const id of new Set(TREE_POOL_IDS)) { const [x, y] = where(INDEX.get(id) ?? 0); draw(id, x, y, false, ownerSize(id) * FOREST_SIZE * 1.18, 'forest'); draw(id, x, y, true, ownerSize(id) * 1.1, 'forest town trees'); }
// people: every townsperson frame (pedestrians, galleries, spectators: movers at 1)
LIBRARY.forEach((it, i) => { if (it.kind === 'walker' && i % 7 === 0) draw(it.id, 10, 10, false, 1, 'people', { moving: true }); });
// business: the parcels' art at their canonical footprints and turned
for (const [type, b] of Object.entries(BUSINESS) as [BusinessId, (typeof BUSINESS)[BusinessId]][]) for (const turned of [false, true]) {
  const w = turned ? b.footprint.h : b.footprint.w, h = turned ? b.footprint.w : b.footprint.h;
  for (const p of businessArt({ id: 1, type, x: 200, y: 200, w, h }, LIBRARY, INDEX)) draw(LIBRARY[p.item]!.id, p.x, p.y, p.flip, p.scale, `business ${type}`);
}

const rows = [...worst.values()].sort((a, b) => b.worst - a.worst), over = rows.filter(r => r.worst > SLACK);
const fmt = (r: Draw) => `${r.worst.toFixed(2)}x (dpr ${r.worstDpr})  ${r.drawn}${r.standIn ? ` (stand-in for ${r.placed} at ${r.scale.toFixed(2)})` : ` at ${r.scale.toFixed(2)}`}  drawn x${r.drawnScale.toFixed(2)} of x${r.asked.toFixed(2)} asked, ` +
  `sharp to x${limit(LIBRARY[INDEX.get(r.drawn)!]!).toFixed(2)}${r.nativeStretch ? `, vs its source ${r.nativeStretch.toFixed(2)}x` : ''}; ${r.source}`;
const mainOver = rows.filter(r => r.mainWorst > SLACK).length;
console.log(`${draws} draws of ${worst.size} pictures: ${over.length} drawn past their pixels at the closest zoom on some screen (dpr ${DPRS.join(', ')}; worst ${rows[0]?.worst.toFixed(2)}x); ` +
  `${capped} draws asked for more than their pixels and were drawn at them (${[...cappedBy].map(([k, n]) => `${k} ${n}`).join(', ')}); without the cap and with mip 0 only at dpr >= 1.5: ${mainOver} pictures past their pixels`);
for (const r of over.slice(0, Number(process.env.TOP ?? 40))) console.log('  ' + fmt(r));
for (const [cat, m] of bySource) {
  const o = [...m.values()].filter(r => r.worst > SLACK).sort((a, b) => b.worst - a.worst);
  console.log(`${cat}: ${m.size} pictures, ${o.length} past their pixels (worst ${[...m.values()].reduce((a, r) => Math.max(a, r.worst), 0).toFixed(2)}x)`);
  for (const r of o.slice(0, Number(process.env.TOPCAT ?? 5))) console.log('    ' + fmt(r));
}
const pl = [...player.values()].filter(r => r.worst > SLACK).sort((a, b) => b.worst - a.worst);
console.log(`player resize to 1.6: ${pl.length} pictures past their pixels (worst ${[...player.values()].reduce((a, r) => Math.max(a, r.worst), 0).toFixed(2)}x)`);
// the 2D overlays: the bus-stop queue walkers' 32 px cells (engine.ts walkerSprite: never taller than 32 device px) and the business ghost (mip 0)
const walkerH = (dpr: number) => Math.min(32, 0.9 * HH * 2 * ZOOM_MAX * dpr);
console.log(`2D overlays: bus-stop walkers ${DPRS.map(d => `${(walkerH(d) / 32).toFixed(2)}x at dpr ${d}`).join(', ')}; the business ghost is cut from mip 0 at the placed business's (capped) rect`);
const ja = process.argv.indexOf('--json');
if (ja > 0) { const f = path.resolve(process.argv[ja + 1]!); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ draws, capped, over, placed: [...worstPlaced.values()].filter(r => r.worst > SLACK).sort((a, b) => b.worst - a.worst), player: pl,
  all: Object.fromEntries(rows.map(r => [r.drawn, r])),
  bySource: Object.fromEntries([...bySource].map(([k, m]) => [k, [...m.values()].sort((a, b) => b.worst - a.worst)])) }, null, 1)); }
void isView;

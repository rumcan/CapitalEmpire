// Pack the curated town-builder sprites (TrickOrTreat public export, public/assets/town-built) into GPU atlas pages.
//   node scripts/assets/prep-sprites.mjs
// Scale contract: the export's w,h,ax,ay are display px at the builder's native 128 px per tile. The game never zooms
// closer than 30%, which on a dpr-2 screen is 0.6 device px per native px, so mip 0 is 0.6x native for a sprite drawn
// at scale 1. A sprite the game draws bigger (the owner's lot scales, the forest) is packed at 0.6x its largest scale,
// up to 3x its painted source: past the source's own pixels it is upscaled (lanczos3, softer) when the owner's size asks for it, so it is
// stretched at the closest zoom only where the owner sized it past its pixels (scripts/assets/audit-sprites.mjs).
// Besides the export (the sprites the owner's painted town uses), every upright sprite of a local TrickOrTreat town
// builder library is packed too (source.mjs libraryItems), so the whole art set is available. Every page also
// ships 0.3x, 0.15x, 0.075x and 0.0375x mips (the whole page downsampled, so one set of UVs serves every level).
// Sprites are trimmed to their alpha and padded with a gutter wide enough to survive the smallest mip.
// Writes src/assets/atlas/sprites-<page>-<mip>.webp and src/game/library.ts.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT, TOT, fromBranch, fromExport, libraryItems } from './source.mjs';
import { capitalItems } from './capital-art.mjs';
import { bakeVariant, lotVariants } from './lot-variants.mjs';
import { findGlows, shines } from './find-glows.mjs';
import { REMOVED } from './removed.mjs';
import { SCALE_OVERRIDES } from './overrides.mjs';
import { carModel, carModelSize } from '../../src/game/ext/car-art/model.mjs';
import { describe, newFramePath, parseFix } from './walker-fix.mjs';

export const MIP0 = 0.6, MIPS = 5, PAGE = 2048, GUT = 16, ALIGN = 16;
const ATLAS_OUT = path.join(ROOT, 'src/assets/atlas'), OUT = path.join(ROOT, 'output/atlas-next');
// the pages are written to output/atlas-next and published to src/assets/atlas at the end, so a failed rebuild keeps the old atlas
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

const town = JSON.parse((await fromExport('town.json')).toString());
const items = { ...town.items, ...capitalItems() }, fromLib = await libraryItems(new Set(Object.keys(items)));
for (const [id, it] of Object.entries(fromLib)) items[id] = it;
// CapitalEmpire's own sprites (art/<set>/items.json, the export's item format plus local: true; e.g. the car park gates, art/parking)
const LOCAL = {};
for (const set of fs.readdirSync(path.join(ROOT, 'art'), { withFileTypes: true })) {
  const f = path.join(ROOT, 'art', set.name, 'items.json');
  // only entries marked local (art/golf/items.json is the golf prompts, packed by prep-golf.mjs, not a sprite set)
  if (set.isDirectory() && fs.existsSync(f)) for (const [id, it] of Object.entries(JSON.parse(fs.readFileSync(f, 'utf8')))) { if (!it?.local) continue; items[id] = it; (LOCAL[it.cat] ??= []).push(id); }
}

// the largest scale the game draws each id at: the owner's lot table (+5% composer jitter) and the forest (up to 1.5). The table is
// read from its source (prep-scales.mjs then writes it into scales.ts for the ids packed here), so the run order does not matter
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SCALES = JSON.parse((await fromBranch('town/builder-in-repo', 'scripts/town-builder/places-v5/scales.json')).toString('utf8'));
const OWNER = { ...Object.fromEntries(Object.entries(SCALES).filter(([, v]) => typeof v?.scale === 'number').map(([k, v]) => [k, v.scale])), ...SCALE_OVERRIDES };
const FOREST = new Set([...read('src/game/forest.ts').matchAll(/'([a-z]+:[^']+)'/g)].map(m => m[1]));
// a car (Vehicles) is sized by its model in the studio (model.mjs: every facing and view of one car shares the model's size, T143): packed for it
const maxScale = id => Math.max(1, ((items[id]?.cat === 'Vehicles' ? carModelSize(SCALE_OVERRIDES, carModel(id)) : undefined) ?? OWNER[id] ?? 0) * 1.05, FOREST.has(id) ? 1.5 : 0);
// every item of one export category (the Lot Composer kit takes whole categories)
const all = c => Object.keys(items).filter(id => items[id].cat === c);
// an id may sit in several lists: the first list that names it wins (see `seen` in step 1)
const SEL = {
  'Capital vegetation': all('Capital vegetation'),
  'Grass materials': all('Grass materials'),
  'Houses': ['world:house_1', 'world:house_3', 'world:house_4', 'gen:house-duplex', 'gen:house-l-ranch', 'gen:house-ranch-long', 'gen:house-splitlevel', 'gen:house-l-shape', 'gen:house-farmhouse-wrap', 'static:garage_timber', 'static:garage_brick', ...all('Houses'), 'expansion:ranch-rear', 'expansion:garage-rear', ...all('House backs')],
  'Shops & services': ['town:bakery', 'town:grocery', 'town:pharmacy', 'town:laundromat', 'town:postoffice', 'town:firestation', 'town:fish_tackle', 'world:diner', 'world:arcade', 'world:video_rental', 'ref:building-gas-canopy', ...all('Shops & services')],
  'Landmarks': ['world:church', 'world:gazebo', 'world:watertower', 'ref:landmark-windmill', 'world:barn', 'world:primary_school', ...all('Landmarks & venues'), ...all('Park & sports')],
  'Trees & plants': ['world:tree_oak_0', 'world:tree_oak_1', 'world:tree_oak_2', 'world:tree_pine_0', 'world:tree_pine_1', 'ref:tree-maple-crimson', 'ref:tree-birch-gold', 'ref:tree-spruce-blue', 'world:bush_0', 'world:bush_1', 'world:hedge', 'town:hydrangea', ...all('Trees & plants')],
  'Vehicles': Object.keys(items).filter(id => items[id].cat === 'Vehicles'),
  'Street furniture': ['world:streetlamp', 'world:hydrant', 'world:mailbox', 'world:bench', 'world:trashcan', 'town:stop_sign', 'town:street_sign', 'town:traffic_light', 'town:bus_stop', 'town:phone_booth', 'town:utility_pole', 'town:bike_rack', 'town:picnic_table', 'town:planter_square', ...all('City utility details'), 'town:dumpster', 'town:delivery_crates', ...all('Street furniture')],
  'Halloween': ['world:pumpkin_0', 'world:pumpkin_1', 'world:scarecrow', 'ref:halloween-hay-bales', 'ref:halloween-pumpkin-cluster', 'world:candy_stand', 'gen:inflatable-pumpkin', 'ref:halloween-sheet-ghost', ...all('Halloween')],
  'Fences': ['world:fence_picket_x', 'world:fence_picket_y', 'world:fence_iron_x', 'world:fence_iron_y', 'gen:fence-privacy-wood', ...all('Correct-angle fences'), ...all('Fences & walls')],
  'Yard': ['gen:trash-cans-row', 'gen:kids-bikes', 'expansion:trampoline', 'expansion:doghouse', 'expansion:basketball-hoop', 'expansion:washing-line', ...all('Backyard structures'), ...all('Backyard furniture'), ...all('Backyard stories'), ...all('POI dressing')],
  'Industry': [...all('Scrapyard clutter'), ...all('Derelict town'), ...all('New industrial buildings')],
  // from the full TrickOrTreat library (after the export's lists, so existing sprites keep their order)
  'More houses': [...all('House rear & side views')],
  'Road signs': [...all('Road signs')],
  'Arcade': [...all('Arcade furniture'), ...all('Arcade decor')],
  'Odds & ends': [...all('Town odds & ends'), ...all('Halloween yard details')],
  ...LOCAL,
};
const COST = { 'Capital vegetation': 250, 'Grass materials': 0, 'More houses': 9000, 'Road signs': 150, 'Arcade': 600, 'Odds & ends': 200, 'Houses': 9000, 'Shops & services': 24000, 'Landmarks': 40000, 'Trees & plants': 250, 'Vehicles': 3500, 'Street furniture': 300, 'Halloween': 120, 'Fences': 90, 'Yard': 400, 'Industry': 300, 'Parking': 300 };
// export categories whose kind the engine needs to see differently (derelict houses are not occupied houses)
const KIND_OF_CAT = { 'Derelict town': 'building', 'Scrapyard clutter': 'decor' };

// ---- 1. every sprite at mip-0 size, trimmed to its alpha
const sprites = [], seen = new Set();
for (const [cat, ids] of Object.entries(SEL)) for (const id of ids) {
  if (seen.has(id) || REMOVED.has(id)) continue; seen.add(id);
  const it = items[id]; if (!it) { console.warn('missing', id); continue; }
  let buf;
  if (it.src) buf = fs.readFileSync(it.src);
  else if (it.local) buf = fs.readFileSync(path.join(ROOT, it.file));
  else { const file = it.file.split('/').pop(); try { buf = await fromExport('sprites-hd/' + file); } catch { buf = await fromExport('sprites/' + file); } }
  // packed at its largest drawn scale, upscaled past the painted source's own pixels when the owner's size asks (lanczos3), at most 3x its source
  const res = Math.min(MIP0 * maxScale(id), 3 * (await sharp(buf).metadata()).width / it.w);
  const W = Math.max(1, Math.round(it.w * res)), H = Math.max(1, Math.round(it.h * res));
  const { data } = await sharp(buf).ensureAlpha().resize(W, H, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { console.warn('empty', id); continue; }
  const cw = x1 - x0 + 1, chh = y1 - y0 + 1, crop = Buffer.alloc(cw * chh * 4);
  for (let y = 0; y < chh; y++) data.copy(crop, y * cw * 4, ((y0 + y) * W + x0) * 4, ((y0 + y) * W + x1 + 1) * 4);
  const area = it.boxes.reduce((s, b) => s + b.hx * b.hy * 4, 0) || 1, base = COST[cat];
  const cost = Math.round(base * (0.6 + 0.4 * Math.min(3, area / (base > 5000 ? 30 : 1))) / 10) * 10;
  // the night's lit windows: the builder's glows, else found in the picture (find-glows.mjs) for a sprite that shines
  const glows = it.glows?.length ? it.glows : shines(id, it.cat ?? it.category ?? cat) ? await findGlows(buf, { id, w: it.w, cat: it.cat ?? it.category ?? cat }) : [];
  sprites.push({ id, cat, it: glows.length && !it.glows?.length ? { ...it, glows } : it, cost, crop, cw, ch: chh, qx0: x0 / res, qy0: y0 / res, qx1: (x1 + 1) / res, qy1: (y1 + 1) / res });
}

// ---- 1b. the townspeople: the 3D renders (scripts/assets/people3d/render-person-3d.mjs -> art/people3d/<id>/sheet.webp + sheet.json).
// Every facing is drawn for real (no mirroring): one row per facing in the sheet's order, and per person the columns idle, walk1..walkN.
// The art is 128 px per metre; the game draws people at 64 (k = 0.5 of the art), so a frame is packed at 0.6 x half its size
const WALK_DIRS = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'], people = [], walkers = [], flipped = [], needed = [];
let WALK_FRAMES = 0;
/** person id -> facing -> frame -> fix code (scripts/assets/walker-fixes.json, the studio's People tab; see walker-fix.mjs) */
const WALKER_FIXES = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/assets/walker-fixes.json'), 'utf8')); } catch { return {}; } })();
/** a frame mirrored left to right (RGBA, W x H) */
const mirror = (d, W, H) => { const o = Buffer.alloc(d.length); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d.copy(o, (y * W + W - 1 - x) * 4, (y * W + x) * 4, (y * W + x) * 4 + 4); return o; };
const trim = (data, W, H) => {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, crop = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) data.copy(crop, y * cw * 4, ((y0 + y) * W + x0) * 4, ((y0 + y) * W + x1 + 1) * 4);
  return { crop, cw, ch, x0, y0, x1, y1 };
};
const PEOPLE3D = path.join(ROOT, 'art/people3d');
for (const dirName of fs.existsSync(PEOPLE3D) ? fs.readdirSync(PEOPLE3D).sort() : []) {
  const json = path.join(PEOPLE3D, dirName, 'sheet.json'), sheet = path.join(PEOPLE3D, dirName, 'sheet.webp');
  if (!fs.existsSync(json) || !fs.existsSync(sheet)) continue;
  const m = JSON.parse(fs.readFileSync(json, 'utf8'));
  if (REMOVED.has(m.id)) continue;
  if (m.directions.join(' ') !== WALK_DIRS.join(' ')) throw new Error(`${m.id}: rows ${m.directions.join(' ')}, expected ${WALK_DIRS.join(' ')}`);
  if (WALK_FRAMES && m.frames.length !== WALK_FRAMES) throw new Error(`${m.id}: ${m.frames.length} frames, the other people have ${WALK_FRAMES}`);
  WALK_FRAMES = m.frames.length;
  const k = 0.5, fw = m.frameWidth, fh = m.frameHeight, W = Math.round(fw * k * MIP0), H = Math.round(fh * k * MIP0), pi = people.length;
  people.push({ id: m.id, size: m.size, w: fw * k, h: fh * k, ax: m.anchor.x * k, ay: m.anchor.y * k, m: m.heightMetres, fps: m.walkFps || 8 });
  // the owner's fixes from the sprite studio (People tab, walker-fix.mjs): every row is read first, as the sheet has it, so a fix can take a frame from any row
  const orig = {}, rows = {};
  for (const d of WALK_DIRS) {
    const row = m.directions.indexOf(d); orig[d] = [];
    for (let fr = 0; fr < WALK_FRAMES; fr++) orig[d].push(await sharp(sheet).extract({ left: fr * fw, top: row * fh, width: fw, height: fh }).resize(W, H, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer());
  }
  for (const d of WALK_DIRS) {
    rows[d] = [...orig[d]];
    for (const [k2, code] of Object.entries(WALKER_FIXES[m.id]?.[d] ?? {})) {
      const i = +k2, op = parseFix(code); if (!op) continue;
      if (op.kind === 'mirror') rows[d][i] = mirror(orig[d][i], W, H);
      else if (op.kind === 'use') { const src = orig[op.dir ?? d][op.frame]; rows[d][i] = op.mirror ? mirror(src, W, H) : src; }
      else if (op.kind === 'new') {
        const np = newFramePath(ROOT, m.id, d, i);
        if (fs.existsSync(np)) rows[d][i] = await sharp(np).resize(W, H, { fit: 'contain', position: 'bottom', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer();
        else needed.push(`${m.id} ${d} ${i}`);
      }
      flipped.push(`${m.id} ${d} ${i} ${describe(code)}`);
    }
  }
  for (const d of WALK_DIRS) {
    rows[d].forEach((data, fr) => {
      const t = trim(data, W, H);   // display px = packed px / MIP0
      walkers.push({ id: `${m.id}:${d}:${fr}`, person: pi, crop: t.crop, cw: t.cw, ch: t.ch, qx0: t.x0 / MIP0, qy0: t.y0 / MIP0, qx1: (t.x1 + 1) / MIP0, qy1: (t.y1 + 1) / MIP0 });
    });
  }
}
if (!WALK_FRAMES) { console.warn('no 3D people in art/people3d (run render-person-3d.mjs)'); WALK_FRAMES = 9; }

// ---- 1b (continued). the spectators and the golfers (art/spectators, art/golfers: the same 3D rig; a folder is a template sheet plus clip
// sheets). They pack onto the walker pages with the townspeople, at the same scale. A person's frames per facing: the template's 9 (idle,
// walk1..8), then its clips in the order given. Each clip sheet has its own frame size and anchor: a frame is cut at its own size and moved
// so its feet land on the template's feet (the anchors differ by (template - own) x k), so every clip of a person stands on one point.
const TEMPLATE_FRAMES = 9, SPEC_CLIPS = [['clap', 4], ['cheer', 6], ['sit', 2], ['sit_clap', 4]], GOLF_CLIPS = [['golf_drive', 12]];
/** a sheet cut into trimmed frames: for each facing (WALK_DIRS) its frames in order; tmpl is the template json (the reference feet) */
async function cutSheet(sheet, json, tmpl) {
  const k = 0.5, fw = json.frameWidth, fh = json.frameHeight, W = Math.round(fw * k * MIP0), H = Math.round(fh * k * MIP0);
  const sx = fw * k / W, sy = fh * k / H, dx = (tmpl.anchor.x - json.anchor.x) * k, dy = (tmpl.anchor.y - json.anchor.y) * k;   // display px per packed px, and the feet shift
  const out = {};
  for (const d of WALK_DIRS) {
    const row = json.directions.indexOf(d); out[d] = [];
    for (let fr = 0; fr < json.frames.length; fr++) {
      const data = await sharp(sheet).extract({ left: fr * fw, top: row * fh, width: fw, height: fh }).resize(W, H, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();
      const t = trim(data, W, H);
      out[d].push({ crop: t.crop, cw: t.cw, ch: t.ch, qx0: t.x0 * sx + dx, qy0: t.y0 * sy + dy, qx1: (t.x1 + 1) * sx + dx, qy1: (t.y1 + 1) * sy + dy });
    }
  }
  return out;
}
/** the people of one crowd group: each `prefix*` folder of art/<dir> with its template sheet and every clip sheet ([name, frames]). A folder
 *  missing a sheet is logged and skipped. Returns the people ({ id, row: the table row, tmpl, cj: the clip jsons by name }), the walker frames in
 *  order (person, facing, frame) and the clips (idle, walk, then the sheets: first frame in the row, frame count, times, loop, from the first person) */
async function crowd(dir, prefix, label, sheets) {
  const root = path.join(ROOT, 'art', dir), people = [], frames = [], k = 0.5;
  const sig = j => JSON.stringify([j.frames.length, j.times, j.loop]);
  for (const name of fs.existsSync(root) ? fs.readdirSync(root).sort() : []) {
    if (!name.startsWith(prefix)) continue;
    const id = `${label}:${name}`, base = path.join(root, name);
    if (REMOVED.has(id)) continue;
    const missing = [];
    if (!fs.existsSync(path.join(base, 'sheet.json')) || !fs.existsSync(path.join(base, 'sheet.webp'))) missing.push('template');
    for (const [c] of sheets) if (!fs.existsSync(path.join(base, c + '.json')) || !fs.existsSync(path.join(base, c + '.webp'))) missing.push(c);
    if (missing.length) { console.warn(`${label} ${name}: no ${missing.join(', ')} sheet yet, skipped`); continue; }
    const tmpl = JSON.parse(fs.readFileSync(path.join(base, 'sheet.json'), 'utf8'));
    if (tmpl.directions.join(' ') !== WALK_DIRS.join(' ')) throw new Error(`${id}: rows ${tmpl.directions.join(' ')}, expected ${WALK_DIRS.join(' ')}`);
    if (tmpl.frames.length !== TEMPLATE_FRAMES) throw new Error(`${id}: ${tmpl.frames.length} frames, expected ${TEMPLATE_FRAMES} (idle, walk1..8)`);
    const cj = {};
    for (const [c, n] of sheets) {
      const j = JSON.parse(fs.readFileSync(path.join(base, c + '.json'), 'utf8'));
      if (j.directions.join(' ') !== WALK_DIRS.join(' ')) throw new Error(`${id} ${c}: rows ${j.directions.join(' ')}, expected ${WALK_DIRS.join(' ')}`);
      if (j.frames.length !== n) throw new Error(`${id} ${c}: ${j.frames.length} frames, expected ${n}`);
      if (!Array.isArray(j.times) || j.times.length !== n || typeof j.loop !== 'boolean') throw new Error(`${id} ${c}: needs ${n} times and a loop flag`);
      cj[c] = j;
    }
    const first = people[0];
    if (first) {
      for (const [c] of sheets) if (sig(cj[c]) !== sig(first.cj[c])) console.warn(`${id}: the ${c} clip differs from ${first.id} (frames, times or loop); the group uses ${first.id}'s`);
      if (tmpl.walkFps !== first.tmpl.walkFps) console.warn(`${id}: walkFps ${tmpl.walkFps} differs from ${first.id} (${first.tmpl.walkFps}); the walk times use ${first.id}'s`);
    }
    const parts = [await cutSheet(path.join(base, 'sheet.webp'), tmpl, tmpl)];
    for (const [c] of sheets) parts.push(await cutSheet(path.join(base, c + '.webp'), cj[c], tmpl));
    const pi = people.length;
    for (const d of WALK_DIRS) for (const part of parts) for (const f of part[d]) frames.push({ id: `${id}:${d}:${frames.length}`, person: pi, crop: f.crop, cw: f.cw, ch: f.ch, qx0: f.qx0, qy0: f.qy0, qx1: f.qx1, qy1: f.qy1 });
    people.push({ id, tmpl, cj, row: { id, w: +(tmpl.frameWidth * k).toFixed(2), h: +(tmpl.frameHeight * k).toFixed(2), ax: +(tmpl.anchor.x * k).toFixed(2), ay: +(tmpl.anchor.y * k).toFixed(2), m: tmpl.heightMetres } });
  }
  // the clips: idle and walk are the template's frames, the sheets follow in order; their values are the first person's (the same for all)
  const first = people[0], walkN = TEMPLATE_FRAMES - 1;
  const clips = { idle: { start: 0, n: 1, times: [0], loop: true }, walk: { start: 1, n: walkN, times: first ? Array.from({ length: walkN }, (_, i) => +(i / (first.tmpl.walkFps || 8)).toFixed(4)) : [0], loop: true } };
  let start = TEMPLATE_FRAMES;
  for (const [c, n] of sheets) { clips[c] = { start, n, times: first ? first.cj[c].times : [0], loop: first ? first.cj[c].loop : true }; start += n; }
  return { people, frames, clips, frameCount: start };
}
const spec = await crowd('spectators', 'spec_', 'spectator', SPEC_CLIPS), golf = await crowd('golfers', 'golf_', 'golfer', GOLF_CLIPS);

// ---- 1c. the baked house lots (lot-variants.mjs): one picture per variant, rendered straight at mip-0 resolution, the whole lot
// as its footprint and the house as its planner block
for (const v of lotVariants().filter(v => !REMOVED.has(v.id))) {
  const b = await bakeVariant(v, MIP0), { data, info } = await sharp(b.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const t = trim(data, info.width, info.height);
  const it = { name: v.name, cat: 'Lots', kind: 'lot', w: b.w, h: b.h, ax: b.ax, ay: b.ay, boxes: b.boxes, block: b.block, solid: 0, big: true, door: false, ...(b.glows.length ? { glows: b.glows } : {}), ...(b.lights.length ? { lights: b.lights } : {}) };
  sprites.push({ id: v.id, cat: 'Lots', it, cost: 0, crop: t.crop, cw: t.cw, ch: t.ch, qx0: t.x0 / MIP0, qy0: t.y0 / MIP0, qx1: (t.x1 + 1) / MIP0, qy1: (t.y1 + 1) / MIP0 });
}

// ---- 2. shelf packing into PAGE x PAGE pages (positions aligned so every mip lands on whole pixels). The walkers get their own
// pages with a 4 px gutter on a 4 px grid: they are drawn at the street tier only, so the far mips never sample them
const pages = [];
function pack(list, gut, align) {
  const al = v => Math.ceil(v / align) * align;
  const order = list.map((_, i) => i).sort((a, b) => list[b].ch - list[a].ch);
  let page = null;
  const newPage = () => { page = { shelves: [], sprites: [] }; pages.push(page); };
  newPage();
  for (const i of order) {
    const s = list[i], w = al(s.cw + 2 * gut), h = al(s.ch + 2 * gut);
    if (w > PAGE || h > PAGE) throw new Error(`${s.id} is too big for a ${PAGE} page`);
    const place = pg => {
      for (const sh of pg.shelves) if (h <= sh.h && sh.x + w <= PAGE) { const at = [sh.x, sh.y]; sh.x += w; return at; }
      const y = pg.shelves.reduce((m, sh) => Math.max(m, sh.y + sh.h), 0); if (y + h > PAGE) return null;
      pg.shelves.push({ y, h, x: w }); return [0, y];
    };
    let at = place(page); if (!at) { newPage(); at = place(page); }
    s.page = pages.length - 1; s.px = at[0] + gut; s.py = at[1] + gut; page.sprites.push(s);
  }
}
pack(sprites, GUT, ALIGN);
// the walker pages hold the townspeople, the spectators and the golfers together
const walkerList = [...walkers, ...spec.frames, ...golf.frames];
if (walkerList.length) pack(walkerList, 4, 4);

// ---- 3. pages and their mips
const files = [];
for (let p = 0; p < pages.length; p++) {
  const comp = pages[p].sprites.map(s => ({ input: s.crop, raw: { width: s.cw, height: s.ch, channels: 4 }, left: s.px, top: s.py }));
  const full = await sharp({ create: { width: PAGE, height: PAGE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comp).png().toBuffer();
  const row = [];
  for (let m = 0; m < MIPS; m++) {
    const size = PAGE >> m, name = `sprites-${p}-${m}.webp`;
    let img = sharp(full); if (m) img = img.resize(size, size, { kernel: 'lanczos3' }).sharpen({ sigma: 0.45 + 0.1 * m });
    await img.webp({ quality: m ? 90 : 88, alphaQuality: 100, effort: 6 }).toFile(path.join(OUT, name));
    row.push(name);
  }
  files.push(row);
}

// Publish completed pages together; a failed rebuild keeps the previous atlas available.
// empty the atlas folder file by file (retrying a file held for a moment by the indexer or a scanner) and keep the folder itself: on Windows
// removing the folder fails while anything has it open (an Explorer window, a dev server's watcher)
fs.mkdirSync(ATLAS_OUT, { recursive: true });
for (const f of fs.readdirSync(ATLAS_OUT)) fs.rmSync(path.join(ATLAS_OUT, f), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
fs.cpSync(OUT, ATLAS_OUT, { recursive: true });

// ---- 4. library.ts
const imports = [], pageRows = [];
files.forEach((row, p) => { const vars = row.map((f, m) => { const v = `p${p}m${m}`; imports.push(`import ${v} from '../assets/atlas/${f}';`); return v; }); pageRows.push(`[${vars.join(', ')}]`); });
const lib = sprites.map(s => {
  const it = s.it, e = { id: s.id, name: it.name, cat: s.cat, kind: KIND_OF_CAT[it.cat] ?? it.kind, w: it.w, h: it.h, ax: it.ax, ay: it.ay, boxes: it.boxes, solid: it.solid, big: it.big, door: !!it.door, cost: s.cost };
  if (it.glows) e.glows = it.glows; if (it.lights) e.lights = it.lights; if (it.doorAt) e.doorAt = it.doorAt; if (it.block) e.block = it.block;
  e.tex = [s.page, +(s.px / PAGE).toFixed(6), +(s.py / PAGE).toFixed(6), +((s.px + s.cw) / PAGE).toFixed(6), +((s.py + s.ch) / PAGE).toFixed(6)];
  e.quad = [+s.qx0.toFixed(2), +s.qy0.toFixed(2), +s.qx1.toFixed(2), +s.qy1.toFixed(2)];
  return e;
});
/** walker frames as numbers (nine per frame): page, u0, v0, u1, v1, then the quad x0, y0, x1, y1 */
const flatFrames = list => list.map(w => [w.page, ...[w.px / PAGE, w.py / PAGE, (w.px + w.cw) / PAGE, (w.py + w.ch) / PAGE].map(v => +v.toFixed(6)), ...[w.qx0, w.qy0, w.qx1, w.qy1].map(v => +v.toFixed(2))].join(',')).join(',');
/** the generated lines of one crowd group (P: its constant prefix, cat: its LIBRARY category, keys: its clip names, seat: the spectators' seat height):
 *  the table, the frame count, the clips, the frames, and the LIBRARY items pushed after the townspeople's (the base is the group's first frame) */
function crowdLines(P, cat, group, keys, seat) {
  const rows = group.people.map(p => { if (!seat) return p.row; const s = p.cj.sit.seatHeightMetres; if (typeof s !== 'number') throw new Error(`${p.id}: sit.json has no seatHeightMetres`); return { ...p.row, seat: s }; });
  const T = seat ? '; seat: number' : '';
  return [
    `/** the ${cat.toLowerCase()} (3D renders): display size, anchor (feet) at the native scale, height in metres${seat ? ', seat height in metres (sit)' : ''} */`,
    `export const @P_PEOPLE: { id: string; w: number; h: number; ax: number; ay: number; m: number${T} }[] = ${JSON.stringify(rows)};`,
    '/** frames per facing: the template (idle, walk1..8), then the clips in the order of @P_CLIPS */',
    `export const @P_FRAMES = ${group.frameCount};`,
    `export const @P_CLIPS: Record<${keys}, PeopleClip> = ${JSON.stringify(group.clips)};`,
    '/** every @P frame (person, facing, frame in order), in the walker encoding */',
    `const @P_WF: number[] = [${flatFrames(group.frames)}];`,
    '/** the index of the first @P frame in LIBRARY: frame (person p, facing d, frame f) is @P_BASE + (p * WALK_DIRS.length + d) * @P_FRAMES + f */',
    'export const @P_BASE = LIBRARY.length;',
    'for (let i = 0; i < @P_WF.length / 9; i++) {',
    '  const p = @P_PEOPLE[Math.floor(i / (WALK_DIRS.length * @P_FRAMES))], o = i * 9;',
    "  LIBRARY.push({ id: `${p.id}:${i % (WALK_DIRS.length * @P_FRAMES)}`, name: p.id, cat: '@CAT', kind: 'walker', w: p.w, h: p.h, ax: p.ax, ay: p.ay, boxes: [{ hx: 0.25, hy: 0.25, dx: 0, dy: 0 }], solid: 0, big: false, door: false, cost: 0, tex: [@P_WF[o], @P_WF[o + 1], @P_WF[o + 2], @P_WF[o + 3], @P_WF[o + 4]], quad: [@P_WF[o + 5], @P_WF[o + 6], @P_WF[o + 7], @P_WF[o + 8]] });",
    '}',
  ].map(s => s.replaceAll('@P', P).replaceAll('@CAT', cat));
}
fs.writeFileSync(path.join(ROOT, 'src/game/library.ts'), [
  '// Generated by scripts/assets/prep-sprites.mjs from the Maple Falls town export (TrickOrTreat public/assets/town-built/town.json).',
  '// w,h,ax,ay are display px at the native 128 px-per-tile scale; boxes are footprints in metres (2 m per tile).',
  '// tex = [page, u0, v0, u1, v1] in the atlas; quad = the trimmed picture inside the w x h display rectangle.',
  "import type { LibItem } from './types';",
  "import { appendCars } from './cars-library';",
  "import { appendEast } from './east-library';",
  "import { appendBusinesses } from './business-library';",
  "import { appendConstruction } from './construction-library';",
  "import { appendGolf } from './golf-library';",
  "import { appendViews } from './views-library';",
  "import { appendTrees } from './trees-library';",
  "import { appendAxisViews } from './axis-library';",
  "import { appendGarageViews } from './garage-views-library';",
  ...imports, '',
  `/** atlas pages: one row per page, one url per mip (scale ${MIP0} x 2^-mip of native) */`,
  `export const ATLAS_PAGES: string[][] = [${pageRows.join(', ')}];`,
  `export const ATLAS_SIZE = ${PAGE};`,
  `export const ATLAS_MIP0 = ${MIP0};`,
  'export const LIBRARY: LibItem[] = [',
  ...lib.map(e => '  ' + JSON.stringify(e) + ','),
  '];',
  '/** the townspeople (art/people3d, 3D renders): display size and anchor (feet) at the native scale, height in metres, walk frames per second */',
  `export const WALKER_PEOPLE: { id: string; size: string; w: number; h: number; ax: number; ay: number; m: number; fps: number }[] = ${JSON.stringify(people.map(p => ({ ...p, w: +p.w.toFixed(2), h: +p.h.toFixed(2), ax: +p.ax.toFixed(2), ay: +p.ay.toFixed(2) })))};`,
  '/** the facings of every person (each drawn for real, none mirrored) and frames per facing (0 idle, 1 .. WALK_FRAMES-1 the walk) */',
  `export const WALK_DIRS = ${JSON.stringify(WALK_DIRS)}, WALK_FRAMES = ${WALK_FRAMES};`,
  '/** every walker frame (person, facing, frame in order): page, u0, v0, u1, v1, then the quad x0, y0, x1, y1 */',
  `const WF = [${flatFrames(walkers)}];`,
  '/** the index of the first walker frame in LIBRARY: frame (person p, facing d, frame f) is WALKER_BASE + (p * WALK_DIRS.length + d) * WALK_FRAMES + f */',
  'export const WALKER_BASE = LIBRARY.length;',
  'for (let i = 0; i < WF.length / 9; i++) {',
  '  const p = WALKER_PEOPLE[Math.floor(i / (WALK_DIRS.length * WALK_FRAMES))], o = i * 9;',
  "  LIBRARY.push({ id: `${p.id}:${i % (WALK_DIRS.length * WALK_FRAMES)}`, name: p.id, cat: 'Townspeople', kind: 'walker', w: p.w, h: p.h, ax: p.ax, ay: p.ay, boxes: [{ hx: 0.25, hy: 0.25, dx: 0, dy: 0 }], solid: 0, big: false, door: false, cost: 0, tex: [WF[o], WF[o + 1], WF[o + 2], WF[o + 3], WF[o + 4]], quad: [WF[o + 5], WF[o + 6], WF[o + 7], WF[o + 8]] });",
  '}',
  '/** a clip: its first frame in the row of its person, its frame count, the seconds of each frame in the source clip, and whether it loops */',
  'export interface PeopleClip { start: number; n: number; times: number[]; loop: boolean }',
  ...crowdLines('SPECTATOR', 'Spectators', spec, "'idle' | 'walk' | 'clap' | 'cheer' | 'sit' | 'sit_clap'", true),
  ...crowdLines('GOLFER', 'Golfers', golf, "'idle' | 'walk' | 'golf_drive'", false),
  'appendCars(LIBRARY, ATLAS_PAGES);',
  'appendEast(LIBRARY, ATLAS_PAGES);',
  'appendBusinesses(LIBRARY, ATLAS_PAGES);',
  'appendConstruction(LIBRARY, ATLAS_PAGES);',
  'appendGolf(LIBRARY, ATLAS_PAGES);',
  'appendViews(LIBRARY, ATLAS_PAGES);',
  'appendTrees(LIBRARY, ATLAS_PAGES);',
  'appendAxisViews(LIBRARY, ATLAS_PAGES);',
  'appendGarageViews(LIBRARY, ATLAS_PAGES);', ''].join('\n'));
console.log(`walkers: ${people.length} people, ${walkers.length} frames; frame fixes: ${flipped.length ? flipped.join(', ') : 'none'}`);
console.log(`spectators: ${spec.people.length} people, ${spec.frames.length} frames; golfers: ${golf.people.length} people, ${golf.frames.length} frames`);
console.log(`walk frames still needed: ${needed.length}${needed.length ? ` (${needed.join(', ')})` : ''}`);
const used = sprites.reduce((s, x) => s + (x.cw + 2 * GUT) * (x.ch + 2 * GUT), 0);
console.log(`sprites ${sprites.length}, pages ${pages.length}, fill ${(used / (pages.length * PAGE * PAGE) * 100).toFixed(0)}%`);

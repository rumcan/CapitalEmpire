// T398 (#1070): what the importer needs for each building's four new straight-on (8-degree) views and nobody can eyeball: their display scale against the building's
// existing corner views, and where the footprint's centre lies on each picture.
//   node scripts/assets/straight-views/measure.mjs --crops DIR --out art/object-eight-20261109/measurements.json [--only disk-id ...]
// --crops: the cut crops, DIR/<disk id>/turned/{N,E,S,W}.native.png (import-native.py --kind axisturn: the cells of the sheet in the guide's order). Reads the real library
// (bundled with esbuild) for each subject: its footprint (twice the half extents of its NE box, metres), kind, owner scale, and the display scale of each of its four corner
// pictures (library width over the picture's width: the corners were sized by their doorways, so this is the game's own scale for the building).
// The scale of the straight views is read the way T375 read the Arcade's: the footprint box is fitted to every silhouette (fit-box-silhouette.mjs: scale, anchor, wall
// height, eave), the corners' fit gives the fit's bias against the library (a corner's true camera scale is NATIVE / its library scale), and the straight views, which one
// generator pass drew at one scale, take the median of their four fits with that bias removed. Their anchors are then refitted with that scale held.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { build } from 'esbuild';
import { fitSubject } from '../fit-box-silhouette.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../../..');
const NATIVE = Math.SQRT2 * 32, PAD = 8;
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const crops = path.resolve(opt('crops') ?? 'art/theme-consistency/native-resume-20261106'), outFile = path.resolve(opt('out') ?? 'art/object-eight-20261109/measurements.json');
const only = args.includes('--only') ? args.slice(args.indexOf('--only') + 1).filter(a => !a.startsWith('--')) : null;
const review = JSON.parse(fs.readFileSync(path.join(ROOT, 'art/object-eight-20261109/review.json'), 'utf8'));
const scratch = opt('scratch') ?? path.join(ROOT, 'output/t398/measure'); fs.mkdirSync(scratch, { recursive: true });
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

// the library, as the game builds it: the subjects' four corner pictures, boxes, kind, owner scale
const ids = Object.keys(review.buildings).filter(d => review.buildings[d].accept && (!only || only.includes(d))).map(d => d.replace(/~/g, ':'));
const bundled = await build({
  stdin: {
    contents: `import { LIBRARY } from './src/game/library'; import { fourViews } from './src/game/lots/preset-art'; import { OWNER_SCALE } from './src/game/lots/scales';
const by = new Map(LIBRARY.map(i => [i.id, i])); export const read = (ids) => Object.fromEntries(ids.map(id => { const it = by.get(id), fv = fourViews(id); return [id, it && fv ? { item: it, views: fv.views.map(v => by.get(v)), ids: fv.views, owner: OWNER_SCALE[id] ?? 1 } : null]; }));`,
    resolveDir: ROOT, loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, loader: { '.webp': 'empty', '.png': 'empty' }, logLevel: 'error',
});
const libMod = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const lib = libMod.read(ids);

const result = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : { schema: 1, subjects: {} };
for (const id of ids) {
  const disk = id.replace(/:/g, '~'), L = lib[id], slug = id.replace(/:/g, '-'), dec = review.buildings[disk];
  if (!L) { console.log(`${id}: not in the library, skipped`); continue; }
  if (L.item.kind === 'business' && L.item.boxes[0].hx === 1 && L.item.boxes[0].hy === 1) { console.log(`${id}: business artwork with a placeholder footprint, skipped`); continue; }
  const dir = path.join(ROOT, 'art/building-views', slug), cellsDir = path.join(crops, disk, 'turned');
  const names = ['NE', 'SE', 'SW', 'NW'], ckeys = ['normalNE', 'normalSE', 'normalSW', 'normalNW'], heads = [0, 90, 180, 270];
  const wide = { ppmLo: 30, ppmHi: 160, ppmStarts: [45, 65, 90, 120] };
  const kLib = {}, views = [];
  for (let i = 0; i < 4; i++) { const f = path.join(dir, names[i] + '.png'), meta = await sharp(f).metadata(); kLib[ckeys[i]] = L.views[i].w / meta.width; views.push({ key: ckeys[i], heading: heads[i], file: f, ...wide }); }
  const skeys = ['yaw8N', 'yaw8E', 'yaw8S', 'yaw8W'], sheads = [37, 127, 217, 307], cells = dec.cells ?? ['N', 'E', 'S', 'W'], pads = {};
  for (let i = 0; i < 4; i++) {
    pads[skeys[i]] = path.join(scratch, `${disk}.${skeys[i]}.pad.png`);
    await sharp(path.join(cellsDir, cells[i] + '.native.png')).extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(pads[skeys[i]]);
    views.push({ key: skeys[i], heading: sheads[i], file: pads[skeys[i]], ...wide });
  }
  const b = L.item.boxes[0], w = 2 * b.hx, d = 2 * b.hy;
  const free = await fitSubject({ w, d, views });                                                    // pass 1: every scale free
  const c = med(ckeys.map(k => NATIVE / (kLib[k] * free[k].ppm)));                                  // the fit's bias against the library
  const kS = skeys.map(k => NATIVE / (free[k].ppm * c)), kStraight = med(kS), ppmS = NATIVE / (kStraight * c);
  const H = free.normalNE.H, e = free.normalNE.e;
  const held = await fitSubject({ w, d, out: path.join(scratch, disk + '.fit'), fixed: { ppm: ppmS, H, e }, views: skeys.map((k, i) => ({ key: k, heading: sheads[i], file: pads[k] })) });   // pass 2: one scale
  result.subjects[id] = {
    disk, name: L.item.name.replace(/\s*\(.*$/, ''), kind: L.item.kind, solid: L.item.solid, footprint: [w, d], owner: L.owner, cornerIds: L.ids,
    kCorner: +med(Object.values(kLib)).toFixed(4), kStraight: +kStraight.toFixed(4), kStraightCells: kS.map(x => +x.toFixed(4)), cornerBias: +c.toFixed(4),
    iouCorners: ckeys.map(k => free[k].iou), iouStraight: skeys.map(k => held[k].iou),
    // the footprint's centre on each straight picture, in its native crop (the fit ran on the padded copy)
    anchors: Object.fromEntries(skeys.map(k => [k, { x: +(held[k].anchor.x - PAD).toFixed(2), y: +(held[k].anchor.y - PAD).toFixed(2) }])),
  };
  const r = result.subjects[id];
  console.log(`${disk.slice(0, 56).padEnd(58)} box ${w}x${d} kCorner ${r.kCorner} kStraight ${r.kStraight} (${r.kStraightCells.join(' ')}) iou ${r.iouCorners.join(' ')} | ${r.iouStraight.join(' ')}`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify(result, null, 1) + '\n');
}

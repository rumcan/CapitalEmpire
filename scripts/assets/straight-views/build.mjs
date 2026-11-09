// T398 (#1070): the reviewed straight-on views of the corners-only buildings into the game as object-eight sets (the T375 format: the Video Vault, the Arcade).
//   node scripts/assets/straight-views/build.mjs --prepare [--crops DIR] [disk-id ...]   per building: art/object-eight-20261109/<slug>/{src,input.json,cut}
//   node scripts/assets/straight-views/build.mjs --integrate [disk-id ...]                approves their cut manifests and writes the shared atlas pages + library
// A set is eight views: the four normal ones are the building's own existing corner pictures (reused: aliases of their atlas cells, so the corners draw exactly as before and
// no pixel is stored twice), the four yaw8 ones are the new straight-on views (N, E, S, W: the building turned 37, 127, 217, 307 degrees, i.e. 8 degrees off square) as new
// atlas cells at the scale and anchors measure.mjs read. review.json holds the review (which sheet cell is which view, and the reason for every reject), measurements.json
// the numbers. The crops are the runner's sheets after prep_sheet.py (clean, repacked) and import-native.py --kind axisturn: DIR/<disk id>/turned/{N,E,S,W}.native.png.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { cutObject, integrateObjects } from '../import-object-eight.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../../..');
const DIR = path.join(ROOT, 'art/object-eight-20261109'), TAG = 'straight-views-20261109', NATIVE = Math.SQRT2 * 32, PAD = 8;
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const review = JSON.parse(fs.readFileSync(path.join(DIR, 'review.json'), 'utf8')), meas = JSON.parse(fs.readFileSync(path.join(DIR, 'measurements.json'), 'utf8'));
const named = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--crops');
const subjects = Object.entries(meas.subjects).filter(([, m]) => review.buildings[m.disk]?.accept && (!named.length || named.includes(m.disk)));
const slugOf = id => id.replace(/:/g, '-');
/** the eight views in the ring's order [NE, N, SE, E, SW, S, NW, W]: key, the corner it reuses (index in the four-view order) or the cell, its heading (the legacy mapping of the
 *  24 historical sets and the Video Vault: corners 0/90/180/270, the 8-degree views 37/127/217/307; the boxes are the footprint turned by it) */
const VIEWS = [['normalNE', 0, 0], ['yaw8N', 'N', 37], ['normalSE', 1, 90], ['yaw8E', 'E', 127], ['normalSW', 2, 180], ['yaw8S', 'S', 217], ['normalNW', 3, 270], ['yaw8W', 'W', 307]];

if (args.includes('--prepare')) {
  const crops = path.resolve(opt('crops') ?? 'F:/ClaudeTemp/T398/proj/art/theme-consistency/native-resume-20261106');
  for (const [id, m] of subjects) {
    const dir = path.join(DIR, slugOf(id)); if (fs.existsSync(dir)) throw new Error(`${dir} exists: a new version goes in a new folder`);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    const cells = review.buildings[m.disk].cells, source = {}, views = {};
    for (const [key, what, heading] of VIEWS) {
      if (typeof what === 'number') { source[key] = { reuse: m.cornerIds[what] }; views[key] = { headingDegrees: heading }; continue; }
      const cell = cells['NESW'.indexOf(what)];
      await sharp(path.join(crops, m.disk, 'turned', `${cell}.native.png`)).extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(dir, 'src', `${key}.png`));
      source[key] = `src/${key}.png`;
      views[key] = { anchor: { x: +(m.anchors[key].x + PAD).toFixed(2), y: +(m.anchors[key].y + PAD).toFixed(2) }, headingDegrees: heading };
    }
    const ppm = NATIVE / m.kStraight;
    const input = {
      schema: 1, projection: 'normal+yaw8', subject: id, name: m.name, version: 1, review: 'candidate', source: { views: source },
      footprintMetres: { width: m.footprint[0], depth: m.footprint[1] }, pixelsPerMetre: +ppm.toFixed(10), pixelCalibrationSpace: 'orthographic-camera', baselineScale: m.owner,
      kind: 'building', solid: m.solid, category: 'Eight-view buildings', aliases: [], views,
      calibrationNotes: `The four corner views are the building's existing pictures (${m.cornerIds.join(', ')}), reused, not repacked. The four straight-on views: scale ${m.kStraight} game px per native px (${ppm.toFixed(2)} px/m), read with scripts/assets/straight-views/measure.mjs: the T375 footprint-box fit (${m.footprint[0]} x ${m.footprint[1]} m, the library's box) on the four corners and the four straight views, the corners' fit bias against their library scale removed (${m.cornerBias}), the median of the four straight views (${m.kStraightCells.join(' ')}); anchors refitted with that scale held (IoU ${m.iouStraight.join(' ')}). Not owner-measured. Sheet: ${m.disk} axisturn, cells ${cells.join('')} are N E S W. ${review.buildings[m.disk].notes}.`,
    };
    fs.writeFileSync(path.join(dir, 'input.json'), JSON.stringify(input, null, 2) + '\n');
    await cutObject(path.join(dir, 'input.json'), path.join(dir, 'cut'));
    console.log(`${id}: cut into ${path.relative(ROOT, path.join(dir, 'cut'))}`);
  }
}
if (args.includes('--integrate')) {
  const files = [];
  for (const [id] of subjects) {
    const file = path.join(DIR, slugOf(id), 'cut/manifest.json'), m = JSON.parse(fs.readFileSync(file, 'utf8'));
    m.review = 'approved'; fs.writeFileSync(file, JSON.stringify(m, null, 2) + '\n'); files.push(file);
  }
  const sets = await integrateObjects(files, { tag: TAG });
  const pages = fs.readdirSync(path.join(ROOT, 'src/assets/object-eight', `${TAG}-v1`)).filter(f => /^page-\d+-0\.webp$/.test(f)).length;
  console.log(`Imported ${sets.length} sets into ${TAG}: ${pages} shared pages`);
}

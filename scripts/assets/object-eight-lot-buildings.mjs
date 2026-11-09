// T375: the eight-view art of the town's buildings (art/theme-consistency/native-resume-20261106: the owner's Video Vault and Arcade, four daylight corners
// and four 8-degree straight-on views each) as reviewed object-eight sets for the lot runtime (lots/preset-art.ts roadView: the straight-on view whose front
// faces the street). Prepares each subject's input for import-object-eight.mjs in art/object-eight-20261108/<slug>/:
//   src/<key>.png   the eight native crops, each with an 8 px transparent margin (the importer wants the subject clear of its cell's edge)
//   input.json      the import input: the subject's footprint (the library's own, in metres), the game's native camera scale, the anchors, the headings
//   fit/<key>.png   the box fit as an overlay (the base in red, the roof in cyan, the anchor a cross) for review
// then cuts them (import-object-eight.mjs cutObject) into cut/. After the review: set cut/manifest.json's "review" to "approved" and run
//   node scripts/assets/import-object-eight.mjs --integrate-batch lot-buildings-20261108 art/object-eight-20261108/<slug>/cut/manifest.json ...
// The scale is the game's native camera scale (45.2548 px/m: the sheets were painted from the game's native exports, and the silhouette check below holds
// it within a few per cent on every view); the anchors are the footprint's centre on the picture, fitted by scripts/assets/fit-box-silhouette.mjs with the
// scale, the wall height and the eave margin fixed. Fitted, not owner-measured: the check sheet shows each on a lot.
//   node scripts/assets/object-eight-lot-buildings.mjs [world~video_rental world~arcade]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { fitSubject } from './fit-box-silhouette.mjs';
import { cutObject, KEYS } from './import-object-eight.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'art/theme-consistency/native-resume-20261106'), OUT = path.join(ROOT, 'art/object-eight-20261108');
/** the game's native camera scale: 32 sqrt 2 world px a metre (import-object-eight.mjs objectDisplayScale: the display factor is exactly 1) */
const NATIVE_PPM = Math.SQRT2 * 32;
/** the subjects: the catalogue id the lots draw (its four old corners are replaced by the new ones, mirror.ts OBJECT_REPLACE), its name, its footprint in
 *  metres (twice the library's box half-extents on its NE view: world:video_rental 5.37 x 2.87, world:arcade 4.08 x 2.71) and the scale the lots draw
 *  it at (lots/scales.ts OWNER_SCALE: the studio size the owner gave it) */
const SUBJECTS = {
  'world~video_rental': { subject: 'world:video_rental', name: 'Video Vault', width: 10.74, depth: 5.74, owner: 1.239, ppm: NATIVE_PPM, H: 4.6, eave: 0.45 },
  'world~arcade': { subject: 'world:arcade', name: 'Arcade', width: 8.16, depth: 5.42, owner: 1.696, ppm: 48, H: 4.49, eave: 0.56 },
};
/** the eight views in the ring's order, the crop each is cut from, and its heading (the legacy mapping of the 24 historical sets: corners 0/90/180/270,
 *  the 8-degree views 37/127/217/307; the boxes are symmetric in it) */
const VIEWS = [['normalNE', 'NE.native.png', 0], ['yaw8N', 'turned/N.native.png', 37], ['normalSE', 'SE.native.png', 90], ['yaw8E', 'turned/E.native.png', 127],
  ['normalSW', 'SW.native.png', 180], ['yaw8S', 'turned/S.native.png', 217], ['normalNW', 'NW.native.png', 270], ['yaw8W', 'turned/W.native.png', 307]];
const PAD = 8;

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SUBJECTS);
for (const id of ids) {
  const s = SUBJECTS[id]; if (!s) throw new Error(`unknown subject ${id}`);
  const dir = path.join(OUT, id.replace('~', '-')); if (fs.existsSync(dir)) throw new Error(`${dir} exists: new versions go in a new folder`);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  const sel = JSON.parse(fs.readFileSync(path.join(SRC, id, 'selection.json'), 'utf8'));
  // the fit, on the native crops
  const fit = await fitSubject({ w: s.width, d: s.depth, out: path.join(dir, 'fit'), views: VIEWS.map(([key, file, heading]) => ({ key, heading, file: path.join(SRC, id, file) })), fixed: { ppm: s.ppm, H: s.H, e: s.eave } });
  const views = {}, source = {};
  for (const [key, file, heading] of VIEWS) {
    await sharp(path.join(SRC, id, file)).extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(dir, 'src', `${key}.png`));
    source[key] = `src/${key}.png`;
    views[key] = { anchor: { x: +(fit[key].anchor.x + PAD).toFixed(2), y: +(fit[key].anchor.y + PAD).toFixed(2) }, headingDegrees: heading };
  }
  const input = {
    schema: 1, projection: 'normal+yaw8', subject: s.subject, name: s.name, version: 1, review: 'candidate', source: { views: source },
    footprintMetres: { width: s.width, depth: s.depth }, pixelsPerMetre: +s.ppm.toFixed(10), pixelCalibrationSpace: 'orthographic-camera', baselineScale: s.owner,
    kind: 'building', category: 'Eight-view buildings', aliases: [], views,
    calibrationNotes: `Scale: ${s.ppm.toFixed(4)} px/m (${s.ppm === NATIVE_PPM ? "the game's native camera scale: the sheets were painted from the game's native exports" : 'the median of a free fit of the four corner views, the game native scale being ' + NATIVE_PPM.toFixed(4)}); the same on every view of the subject, as one sheet's cells are. Anchors: the ${s.width} x ${s.depth} m footprint's centre fitted to each silhouette (scripts/assets/fit-box-silhouette.mjs, wall ${s.H} m, eave ${s.eave} m, IoU ${Object.values(fit).map(f => f.iou).join(' ')}), not owner-measured. Art: ${id} selection.json (${sel.selection.corners}, ${sel.selection.axisturn}), owner_approved ${sel.owner_approved}.`,
  };
  fs.writeFileSync(path.join(dir, 'input.json'), JSON.stringify(input, null, 2) + '\n');
  await cutObject(path.join(dir, 'input.json'), path.join(dir, 'cut'));
  console.log(`${id}: cut into ${path.relative(ROOT, path.join(dir, 'cut'))}; IoU ${KEYS.map(k => `${k} ${fit[k].iou}`).join(', ')}`);
}

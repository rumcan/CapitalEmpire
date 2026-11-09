// T351 (#994): the hire golf cart's eight pictures into the game as an object-eight set (the T375 format; the way T398 brought in the straight-on views of the buildings).
//   python scripts/assets/golf-cart/prep_cart.py && python scripts/assets/golf-cart/measure.py       the cut pictures (art/golf-cart-20261109/src) and measurements.json
//   node scripts/assets/golf-cart/build.mjs --prepare      writes art/golf-cart-20261109/input.json and cuts the six new pictures into art/golf-cart-20261109/cut
//   node scripts/assets/golf-cart/build.mjs --integrate    approves the cut manifest and writes the atlas page + the library (a new batch: golf-cart-20261109-v1)
// The ring is [NE, N, SE, E, SW, S, NW, W], the way the cart's front faces (preset-art.ts: the NE view's front to +y, the screen's lower left; the N view's to the screen's bottom,
// and so on round): SW heading (normalNE) and SE heading (normalSE) are the game's own golf-cart-sw and golf-cart-se, reused (aliases of their atlas cells: nothing stored twice);
// NE heading (normalSW) and NW heading (normalNW) are the corners sheet's top row; S, E, N, W (yaw8N, yaw8E, yaw8S, yaw8W) are the axisturn sheet's front, right side, back and left side.
import fs from 'node:fs';
import path from 'node:path';
import { cutObject, integrateObjects } from '../import-object-eight.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../../..');
const DIR = path.join(ROOT, 'art/golf-cart-20261109'), NATIVE = Math.SQRT2 * 32, TAG = 'golf-cart-20261109', SUBJECT = 'business:golf-cart', DENSITY = 0.3;
const args = process.argv.slice(2);
const meas = JSON.parse(fs.readFileSync(path.join(DIR, 'measurements.json'), 'utf8'));
// the legacy headings of the eight-view sets (corners 0/90/180/270, the 8-degree views 37/127/217/307): the boxes are the footprint turned by them
const VIEWS = [['normalNE', { reuse: 'business:golf-cart-sw' }, 0], ['yaw8N', 'src/yaw8N.png', 37], ['normalSE', { reuse: 'business:golf-cart-se' }, 90], ['yaw8E', 'src/yaw8E.png', 127],
  ['normalSW', 'src/normalSW.png', 180], ['yaw8S', 'src/yaw8S.png', 217], ['normalNW', 'src/normalNW.png', 270], ['yaw8W', 'src/yaw8W.png', 307]];

if (args.includes('--prepare')) {
  if (fs.existsSync(path.join(DIR, 'cut'))) throw new Error('art/golf-cart-20261109/cut exists: a new version goes in a new folder');
  const source = {}, views = {}, ppm = NATIVE / meas.k;
  for (const [key, what, heading] of VIEWS) {
    source[key] = what;
    views[key] = typeof what === 'string' ? { anchor: meas.new[key].anchor, headingDegrees: heading } : { headingDegrees: heading };
  }
  const input = {
    schema: 1, projection: 'normal+yaw8', subject: SUBJECT, name: 'Hire golf cart', version: 1, review: 'candidate', source: { views: source },
    footprintMetres: { width: 1.2, depth: 2.4 }, pixelsPerMetre: +ppm.toFixed(10), pixelCalibrationSpace: 'orthographic-camera', baselineScale: 0.294,
    kind: 'decor', solid: 0, category: 'Eight-view carts', aliases: [], views,
    calibrationNotes: `The hire cart (GOLF-ART-LIST item 173: 1.2 x 2.4 m). SE and SW headings: the game's own golf-cart-se and golf-cart-sw, reused (their atlas cells). The other six: the lead's two sheets ` +
      `(F:/Art/newArt/animations/buildings/business~golf-cart/{corners,axisturn}.png) keyed and cleaned (scripts/assets/golf-cart/prep_cart.py), at ${meas.k} library px per native px = the existing pictures' ` +
      `${meas.kLibOld} x ${meas.ratioOldToNew} (the roof's horizontal width, which does not depend on the camera's pitch: measure.py), drawn at the existing cart's owner size 0.294. Anchors: the roof's centroid and the ` +
      `old pictures' roof-to-floor drop at that scale (measure.py). The corners sheet's bottom row is not used (drawn from a camera 9 degrees higher than every other picture).`,
  };
  fs.writeFileSync(path.join(DIR, 'input.json'), JSON.stringify(input, null, 2) + '\n');
  await cutObject(path.join(DIR, 'input.json'), path.join(DIR, 'cut'));
  console.log(`${SUBJECT}: cut into ${path.relative(ROOT, path.join(DIR, 'cut'))} (ppm ${ppm.toFixed(4)})`);
}
if (args.includes('--integrate')) {
  const file = path.join(DIR, 'cut/manifest.json'), m = JSON.parse(fs.readFileSync(file, 'utf8'));
  m.review = 'approved'; fs.writeFileSync(file, JSON.stringify(m, null, 2) + '\n');
  const sets = await integrateObjects([file], { tag: TAG, density: DENSITY });
  const pages = fs.readdirSync(path.join(ROOT, 'src/assets/object-eight', `${TAG}-v1`)).filter(f => /^page-\d+-0\.webp$/.test(f)).length;
  console.log(`Imported ${sets.length} set into ${TAG}: ${pages} shared page(s) at density ${DENSITY}`);
}

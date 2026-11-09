// T351 (#994): the before / after comparison of two shots.mjs runs (main's game and this branch's): for each strip (the octagon through all eight headings, the square's and the
// hairpin's bends) the before's strip above the after's, each under its label.
//   node scripts/assets/golf-cart/compare.mjs --dir output/t351/shots --zoom 0.3 [--out art/golf-cart-20261109/shots]
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const dir = path.resolve(opt('dir', 'output/t351/shots')), zoom = opt('zoom', '0.3'), out = path.resolve(opt('out', dir));
fs.mkdirSync(out, { recursive: true });
const label = (w, text) => Buffer.from(`<svg width="${w}" height="26" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="26" fill="#0f172a"/><text x="8" y="18" font-family="sans-serif" font-size="15" font-weight="bold" fill="#fde68a">${text}</text></svg>`);
for (const kind of ['octagon', 'bends', 'keys']) {
  const parts = [['before', 'BEFORE: main (two pictures, a steady pace, the heading snaps at every bend)'], ['after', 'AFTER: T351 (eight pictures, the heading turns through its neighbours, a soft pace)']];
  const files = parts.map(([tag]) => path.join(dir, `${tag}-z${zoom}-${kind}.png`));
  if (!files.every(f => fs.existsSync(f))) { console.log(`skipped ${kind}: ${files.filter(f => !fs.existsSync(f)).join(', ')} missing`); continue; }
  const metas = await Promise.all(files.map(f => sharp(f).metadata())), w = Math.max(...metas.map(m => m.width)), h = metas.reduce((a, m) => a + m.height + 26, 0);
  let top = 0; const layers = [];
  for (let i = 0; i < parts.length; i++) { layers.push({ input: label(w, parts[i][1]), top, left: 0 }); top += 26; layers.push({ input: files[i], top, left: 0 }); top += metas[i].height; }
  const file = path.join(out, `compare-z${zoom}-${kind}.jpg`);
  await sharp({ create: { width: w, height: h, channels: 3, background: '#0f172a' } }).composite(layers).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
  console.log('written', file);
}

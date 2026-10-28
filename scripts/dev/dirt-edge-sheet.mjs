// T247 (#717): before/after sheets from dirt-edge-shots.mjs's shots (off = the look before T247, on = after), one row a zoom, labelled.
//   node scripts/dev/dirt-edge-sheet.mjs --dir E:/ClaudeTemp/T247/final --view range20-patch [--zooms 30,15,8,4] [--crop x,y,w,h] [--width 600]
import sharp from 'sharp';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const dir = opt('dir', 'output/dirt-edge'), view = opt('view', 'range20-patch'), zooms = opt('zooms', '30,15,8,4').split(','), width = +opt('width', '600');
const crop = opt('crop', '') ? opt('crop', '').split(',').map(Number) : null, gap = 8, lab = 26;
const cell = async f => { let s = sharp(join(dir, f)); if (crop) s = s.extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] }); return s.resize({ width }).png().toBuffer({ resolveWithObject: true }); };
const rows = [];
for (const z of zooms) {
  const a = await cell(`${view}-${z}pct-off.jpg`), b = await cell(`${view}-${z}pct-on.jpg`), h = a.info.height;
  const label = Buffer.from(`<svg width="${2 * width + gap}" height="${lab}" xmlns="http://www.w3.org/2000/svg"><text x="${width / 2}" y="18" font-family="Arial" font-size="16" text-anchor="middle" fill="#fff">${z}%, before (soft dirt off)</text><text x="${width + gap + width / 2}" y="18" font-family="Arial" font-size="16" text-anchor="middle" fill="#fff">${z}%, after</text></svg>`);
  rows.push({ h: h + lab, comp: [{ input: label, left: 0, top: 0 }, { input: a.data, left: 0, top: lab }, { input: b.data, left: width + gap, top: lab }] });
}
const H = rows.reduce((s, r) => s + r.h + gap, -gap), comp = []; let y = 0;
for (const r of rows) { for (const c of r.comp) comp.push({ ...c, top: c.top + y }); y += r.h + gap; }
const file = join(dir, `sheet-${view}${crop ? '-crop' : ''}.jpg`);
await sharp({ create: { width: 2 * width + gap, height: H, channels: 3, background: '#111' } }).composite(comp).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
console.log(file);

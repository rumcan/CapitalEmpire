// Before / after sheets for the magenta keyer (key-magenta.mjs): each raw magenta picture keyed the old way (despill 'cut', no speck
// clean-up, no haze limit) and with the new settings (and the new settings in linear light), each over grass green and over a checker,
// with a 3x close-up of the busiest edge. Writes output/key-compare/<name>.png and output/key-compare/sheet.png.
//   node scripts/assets/key-compare.mjs <folder or files of *.raw.png> [--set k=v ...]   (--set overrides the new settings)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { KEY_DEFAULTS, keyMagenta } from './key-magenta.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '../..');
const args = process.argv.slice(2), sets = {};
for (let i = 0; i < args.length; i++) if (args[i] === '--set') { const [k, v] = args.splice(i, 2)[1].split('='); sets[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v; i--; }
const files = args.flatMap(a => fs.statSync(a).isDirectory() ? fs.readdirSync(a).filter(f => /\.raw\.png$/.test(f)).map(f => path.join(a, f)) : [a]);
const OUT = path.join(ROOT, 'output/key-compare'); fs.mkdirSync(OUT, { recursive: true });
const OLD = { despill: 'cut', despillStrength: 1, despeckle: 0, haze: 0, linear: false }, NEW = { ...KEY_DEFAULTS, ...sets }, LIN = { ...NEW, linear: true };
const COLS = [['old keyer', OLD], ['new', NEW], ['new, linear light', LIN]], T = 420, Z = 220, PAD = 10, LABEL = 26;

const label = (t, w) => Buffer.from(`<svg width="${w}" height="${LABEL}"><text x="6" y="18" font-size="15" fill="#fff" font-family="sans-serif">${t}</text></svg>`);
const checker = async (w, h) => { const c = 16, rects = []; for (let y = 0; y < h; y += c) for (let x = 0; x < w; x += c) if (((x + y) / c) % 2 === 0) rects.push(`<rect x="${x}" y="${y}" width="${c}" height="${c}" fill="#bbb"/>`); return sharp(Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#888"/>${rects.join('')}</svg>`)).png().toBuffer(); };
/** the busiest edge: the 64 px window with the most partly see-through pixels (of the old key) */
async function edgeBox(png) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true }), S = 64; let best = [0, 0], bn = -1;
  for (let y = 0; y + S <= info.height; y += 16) for (let x = 0; x + S <= info.width; x += 16) { let n = 0; for (let j = 0; j < S; j += 2) for (let i = 0; i < S; i += 2) { const a = data[((y + j) * info.width + x + i) * 4 + 3]; if (a > 10 && a < 245) n++; } if (n > bn) { bn = n; best = [x, y]; } }
  return { left: best[0], top: best[1], width: S, height: S };
}
const tiles = [];
for (const f of files) {
  const name = path.basename(f).replace(/\.raw\.png$/, ''), keyed = await Promise.all(COLS.map(([, o]) => keyMagenta(f, o)));
  const meta = await sharp(keyed[0]).metadata(), k = Math.min(T / meta.width, T / meta.height), w = Math.round(meta.width * k), h = Math.round(meta.height * k), box = await edgeBox(keyed[0]);
  const row = [], W = COLS.length * (T + PAD) + PAD, Hh = LABEL + 2 * (T + PAD) + Z + PAD;
  for (let c = 0; c < COLS.length; c++) {
    const x0 = PAD + c * (T + PAD), small = await sharp(keyed[c]).resize(w, h).png().toBuffer();
    row.push({ input: label(COLS[c][0], T), left: x0, top: 0 });
    row.push({ input: await sharp({ create: { width: T, height: T, channels: 4, background: '#4f6a2a' } }).composite([{ input: small, left: (T - w) >> 1, top: (T - h) >> 1 }]).png().toBuffer(), left: x0, top: LABEL });
    row.push({ input: await sharp(await checker(T, T)).composite([{ input: small, left: (T - w) >> 1, top: (T - h) >> 1 }]).png().toBuffer(), left: x0, top: LABEL + T + PAD });
    // the close-up of the busiest edge, 3x, over white (light fringes show dark, dark ones show on white)
    const zoom = await sharp(keyed[c]).extract(box).resize(Z, Z, { kernel: 'nearest' }).png().toBuffer();
    row.push({ input: await sharp({ create: { width: Z, height: Z, channels: 4, background: '#ffffff' } }).composite([{ input: zoom }]).png().toBuffer(), left: x0, top: LABEL + 2 * (T + PAD) });
  }
  const png = await sharp({ create: { width: W, height: Hh, channels: 4, background: '#1b1f16' } }).composite(row).png().toBuffer();
  fs.writeFileSync(path.join(OUT, name + '.png'), png); tiles.push({ name, png, W, Hh });
  console.log(name, `${meta.width}x${meta.height}`, 'edge close-up at', box.left, box.top);
}
if (tiles.length) {
  const W = tiles[0].W, Hh = tiles[0].Hh, sheet = await sharp({ create: { width: W, height: tiles.length * (Hh + LABEL), channels: 4, background: '#111' } })
    .composite(tiles.flatMap((t, i) => [{ input: label(t.name, W), left: 0, top: i * (Hh + LABEL) }, { input: t.png, left: 0, top: i * (Hh + LABEL) + LABEL }])).png().toBuffer();
  fs.writeFileSync(path.join(OUT, 'sheet.png'), sheet); console.log('sheet:', path.join(OUT, 'sheet.png'));
}

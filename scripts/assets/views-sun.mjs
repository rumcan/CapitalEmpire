// Which side the four-view building art is lit from: the game's sun is fixed at the screen's upper right, so every view must be lit from the
// right. The measure is the brightness slope across the opaque picture (left to right, in % of its mean brightness), as tree-sun.mjs does for
// the crowns, leaving out the warm lamp and window light: positive is lit from the right. A view lit from the left can't be mirrored (that would swap its geometry), so it is reported to be
// regenerated, never fixed in code.
//   node scripts/assets/views-sun.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), STORE = path.join(root, 'art/building-views');
const rows = [];
for (const slug of fs.readdirSync(STORE).filter(d => fs.existsSync(path.join(STORE, d, 'source.json'))).sort()) {
  const scores = [];
  for (const v of ['NE', 'SE', 'SW', 'NW']) {
    const { data, info } = await sharp(path.join(STORE, slug, `${v}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let n = 0, sx = 0, sl = 0; const px = [];
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4; if (data[i + 3] < 200) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2], l = 0.3 * r + 0.59 * g + 0.11 * b;
      // lamp and window light is not sunlight: warm, bright pixels (find-glows' amber test, a little wider) are left out
      if (l > 140 && r > 190 && b < g * 0.85 && r - b > 60) continue;
      px.push(x, l); n++; sx += x; sl += l;
    }
    const cx = sx / n, ml = sl / n; let cov = 0, vx = 0;
    for (let k = 0; k < px.length; k += 2) { cov += (px[k] - cx) * (px[k + 1] - ml); vx += (px[k] - cx) ** 2; }
    scores.push(cov / Math.sqrt(vx * n) / ml * 100);
  }
  rows.push({ slug, scores });
}
const left = rows.flatMap(r => r.scores.map((s, i) => [r.slug, ['NE', 'SE', 'SW', 'NW'][i], s])).filter(([, , s]) => s < 0);
for (const r of rows) console.log(r.slug.padEnd(34), r.scores.map(s => s.toFixed(1).padStart(6)).join(' '));
console.log(`${rows.length} buildings, ${rows.length * 4} views; lit from the left: ${left.length ? left.map(([s, v, x]) => `${s} ${v} (${x.toFixed(1)})`).join(', ') : 'none'}`);

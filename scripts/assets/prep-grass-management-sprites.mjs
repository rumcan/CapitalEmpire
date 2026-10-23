// Preserve generated sheets; extract individual views using alpha bounds without recolouring or resampling.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const art = path.join(root, 'art/grass-management');
const queuePath = path.join(art, 'scene-sprite-queue.json');
const queue = JSON.parse(await fs.readFile(queuePath, 'utf8'));
const angles = ['NE', 'SE', 'SW', 'NW'];
const ids = ['white-popup-gazebo-4views', ...queue.assets.map(a => a.id)];
const out = path.join(art, 'budget-props/individual');
await fs.mkdir(out, { recursive: true });
const manifest = { version: 1, reference: queue.reference, angles, policy: 'Source PNGs unchanged. Native crops around alpha >= 8 with four pixel padding; faint alpha noise is excluded only from crop bounds. No pixel alpha alteration, resampling, recolouring or generated content. Ground anchors are estimates pending game placement.', assets: [] };
for (const id of ids) {
  const selected = queue.assets.find(a => a.id === id);
  const sourceRel = selected?.source ?? 'budget-props/' + id + '.png';
  const source = path.join(art, sourceRel);
  try { await fs.access(source); } catch { continue; }
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width % 2 || info.height % 2) throw new Error(id + ': sheet must have even dimensions');
  const cw = info.width / 2, ch = info.height / 2;
  const asset = { id, source: sourceRel, width: info.width, height: info.height, alphaReview: 'four nonempty cells checked', rotationReview: 'visual review only; not a geometric 3D guarantee', gameReview: 'pending', views: [] };
  for (let n = 0; n < 4; n++) {
    const ox = n % 2 * cw, oy = Math.floor(n / 2) * ch;
    let minX = cw, minY = ch, maxX = -1, maxY = -1, clear = 0, partial = 0;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const a = data[((oy + y) * info.width + ox + x) * 4 + 3];
      if (!a) clear++; else { if (a < 255) partial++; if (a >= 8) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); } }
    }
    if (maxX < 0 || clear === 0) throw new Error(id + ': empty cell or missing transparency');
    const left = Math.max(0, minX - 4), top = Math.max(0, minY - 4), right = Math.min(cw - 1, maxX + 4), bottom = Math.min(ch - 1, maxY + 4);
    const crop = { left: ox + left, top: oy + top, width: right - left + 1, height: bottom - top + 1 };
    const file = id.replace('-4views', '') + '-' + angles[n] + '.png';
    await sharp(source).extract(crop).png().toFile(path.join(out, file));
    asset.views.push({ direction: angles[n], file: 'budget-props/individual/' + file, sourceRect: crop, alpha: { clear, partial }, estimatedAnchor: { x: crop.width / 2, y: crop.height - 1 }, touchesCellEdge: minX === 0 || minY === 0 || maxX === cw - 1 || maxY === ch - 1 });
  }
  manifest.assets.push(asset);
  const item = queue.assets.find(a => a.id === id);
  if (item) { item.status = 'generated'; item.alphaReview = asset.alphaReview; item.gameReview = 'pending'; }
}
await fs.writeFile(path.join(art, 'budget-props/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile(queuePath, JSON.stringify(queue, null, 2) + '\n');
// Review contact sheet only; these thumbnails are not runtime sprites or placement-scale references.
const overlays = [], cell = 192, rowHeight = 190;
for (let row = 0; row < manifest.assets.length; row++) for (let n = 0; n < 4; n++) {
  const asset = manifest.assets[row], view = asset.views[n], left = n * cell, top = row * rowHeight;
  const thumbnail = await sharp(path.join(art, view.file)).resize(180, 155, { fit: 'contain', background: '#354336' }).flatten({ background: '#354336' }).png().toBuffer();
  const label = `<svg width="192" height="32"><text x="4" y="12" fill="#e2f1dd" font-family="sans-serif" font-size="9">${asset.id.replace('-4views', '')}</text><text x="4" y="26" fill="#b9cbb0" font-family="sans-serif" font-size="10">${view.direction} / placement review pending</text></svg>`;
  overlays.push({ input: thumbnail, left: left + 6, top: top + 2 }, { input: Buffer.from(label), left, top: top + 157 });
}
await sharp({ create: { width: cell * 4, height: rowHeight * manifest.assets.length, channels: 3, background: '#354336' } }).composite(overlays).png().toFile(path.join(art, 'budget-props/contact.png'));
console.log(JSON.stringify({ sheets: manifest.assets.length, individualViews: manifest.assets.length * 4, clippedCells: manifest.assets.flatMap(a => a.views).filter(v => v.touchesCellEdge).length }));

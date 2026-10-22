// Prepare only genuine generated sources; never synthesize or alter texture content/edges.
// node scripts/assets/prep-grass-management.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const art = path.join(root, 'art/grass-management'), runtime = path.join(root, 'src/assets/ground/grass-management');
const queue = JSON.parse(await fs.readFile(path.join(art, 'generation-queue.json'), 'utf8'));
const previous = JSON.parse(await fs.readFile(path.join(art, 'manifest.json'), 'utf8').catch(() => '{}'));
const oldEntries = new Map([...(previous.materials ?? []), ...(previous.decals ?? [])].map(e => [e.id, e]));
const hash = data => createHash('sha256').update(data).digest('hex');
const exists = file => fs.stat(file).then(s => s.size > 0, () => false);
const rel = file => path.relative(root, file).replaceAll('\\', '/');
await fs.mkdir(path.join(runtime, 'decals'), { recursive: true });
const counts = entries => ({ requested: entries.length, generated: entries.filter(e => e.status !== 'pending').length, validated: entries.filter(e => e.status === 'validated').length, pending: entries.filter(e => e.status === 'pending').length });

async function prepare(entry, decal) {
  const source = path.join(art, entry.source), output = path.join(runtime, decal ? 'decals' : '', entry.id + '.webp');
  const base = { ...entry, status: 'pending', runtime: rel(output), provenance: { tool: 'built-in imagegen', source: rel(source), exactPrompt: entry.prompt } };
  if (!await exists(source)) return base;
  base.status = 'generated';
  try {
    const bytes = await fs.readFile(source), sourceSha256 = hash(bytes), prior = oldEntries.get(entry.id);
    base.provenance.sourceSha256 = sourceSha256;
    if (prior?.status === 'validated' && prior.provenance?.sourceSha256 === sourceSha256 && await exists(output) && prior.runtimeSha256 === hash(await fs.readFile(output))) return { ...prior, ...base, status: 'validated' };
    const meta = await sharp(bytes).metadata();
    if (meta.format !== 'png' || !meta.width || !meta.height) throw new Error('source must be a nonempty PNG');
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let clear = 0, opaque = 0, partial = 0;
    for (let i = 3; i < data.length; i += 4) { if (data[i] === 0) clear++; else if (data[i] === 255) opaque++; else partial++; }
    const width = info.width, height = info.height;
    Object.assign(base, { width, height, mode: 'RGBA', alpha: { clear, partial, opaque, valid: decal ? clear > 0 && clear < width * height : opaque === width * height }, sourceBytes: bytes.length });
    if (!base.alpha.valid) throw new Error(decal ? 'decal requires clear alpha and visible marks' : 'material requires every source pixel opaque');
    // Mean endpoint RGB difference is a diagnostic, not a guarantee of seamless tiling.
    let horizontal = 0, vertical = 0;
    for (let y = 0; y < height; y++) for (let c = 0; c < 3; c++) horizontal += Math.abs(data[(y * width) * 4 + c] - data[(y * width + width - 1) * 4 + c]);
    for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) vertical += Math.abs(data[x * 4 + c] - data[((height - 1) * width + x) * 4 + c]);
    base.oppositeEdgeError = { horizontalMeanRgb255: +(horizontal / (height * 3)).toFixed(3), verticalMeanRgb255: +(vertical / (width * 3)).toFixed(3), diagnosticOnly: true };
    await sharp(bytes).webp(decal ? { lossless: true, alphaQuality: 100, effort: 6 } : { quality: 94, effort: 6 }).toFile(output);
    const packed = await sharp(output).metadata();
    if (packed.width !== width || packed.height !== height) throw new Error('runtime dimensions changed');
    Object.assign(base, { status: 'validated', runtimeSha256: hash(await fs.readFile(output)), runtimeBytes: (await fs.stat(output)).size, nativeDimensionsPreserved: true });
    if (decal) base.layout = { rows: 2, columns: 2, order: ['TL', 'TR', 'BL', 'BR'], alphaGuttersRequireVisualReview: true };
  } catch (error) { base.error = error.message; }
  return base;
}

const materials = [], decals = [];
// Sequential conversion keeps native-image memory bounded on the owner's PC.
for (const entry of queue.materials) materials.push(await prepare(entry, false));
for (const entry of queue.decals) decals.push(await prepare(entry, true));
const manifest = { v: 1, task: 'T016', requested: { materials: queue.materials.length, grass: queue.materials.filter(m => m.kind === 'grass').length, soil: queue.materials.filter(m => m.kind === 'soil').length, decalSheets: queue.decals.length, decalVariants: queue.decals.length * 4 }, actual: { materials: counts(materials), decalSheets: counts(decals) }, sourcePreservation: 'Original generated PNGs preserved; opaque WebP quality94, alpha decal WebP lossless; no procedural artwork, recolouring or edge alteration.', seamPolicy: 'Opposite-edge RGB error recorded as diagnostic only; seamlessness is not asserted.', materials, decals };
await fs.writeFile(path.join(art, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const escape = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
async function contact(entries, name, columns) {
  const cell = 160, label = 44, rows = Math.ceil(entries.length / columns), overlays = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i], left = i % columns * cell, top = Math.floor(i / columns) * (cell + label);
    if (e.status !== 'pending') {
      try { const img = await sharp(path.join(art, e.source)).resize(cell - 8, cell - 8, { fit: 'contain', background: '#354336' }).png().toBuffer(); overlays.push({ input: img, left: left + 4, top: top + 4 }); } catch { /* Partially written source remains labelled generated. */ }
    }
    const lines = [e.id, e.status + (e.width ? ` ${e.width}x${e.height}` : '')];
    const svg = `<svg width="${cell}" height="${label}"><rect width="100%" height="100%" fill="#17221a"/>${lines.map((s, k) => `<text x="4" y="${15 + k * 16}" fill="${e.status === 'validated' ? '#c8f2c7' : '#dfc780'}" font-family="sans-serif" font-size="10">${escape(s)}</text>`).join('')}</svg>`;
    overlays.push({ input: Buffer.from(svg), left, top: top + cell });
  }
  await sharp({ create: { width: columns * cell, height: rows * (cell + label), channels: 4, background: '#354336' } }).composite(overlays).png().toFile(path.join(art, name));
}
await contact(materials, 'materials-contact.png', 10);
await contact(decals, 'decals-contact.png', 4);
console.log(JSON.stringify({ ...manifest.actual, errors: [...materials, ...decals].filter(e => e.error).map(e => ({ id: e.id, error: e.error })) }));

/** Prepare genuine four-view sheets; cropping/size calibration is not visual or game-placement approval. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import sharp from 'sharp';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), OUT = 'art/theme-consistency';
const full = p => path.join(ROOT, p), hash = b => crypto.createHash('sha256').update(b).digest('hex');
const exists = async p => !!await fs.stat(full(p)).catch(() => null), read = async p => JSON.parse(await fs.readFile(full(p), 'utf8'));
const write = async (p, b) => { if (!await exists(p) || hash(await fs.readFile(full(p))) !== hash(b)) await fs.writeFile(full(p), b); };
const json = (p, v) => write(p, JSON.stringify(v, null, 2) + '\n'), slug = s => s.replace(/[^a-zA-Z0-9_-]/g, '-');
const queue = await read(`${OUT}/queue.json`), inventory = await read(`${OUT}/inventory.json`);
const old = await exists(`${OUT}/generated-manifest.json`) ? await read(`${OUT}/generated-manifest.json`) : { assets: [] };
const assets = new Map((old.assets ?? []).map(a => [a.id, a])), patches = new Map();
const arg = process.argv.indexOf('--id'), only = arg < 0 ? null : process.argv[arg + 1];
if (arg >= 0 && (!only || !queue.subjects.some(s => s.id === only))) throw Error('--id must name a queued subject');
const sheetPath = s => typeof s.sheet === 'string' ? s.sheet : `${OUT}/generated/${s.category}/${slug(s.id)}-4views-v1.png`;
const angles = ['NE', 'SE', 'SW', 'NW'], THRESHOLD = 8, PADDING = 4, MIN_COMPONENT = 8;

function cellBounds(data, width, cell) {
  const { left, top, width: w, height: h } = cell, mask = new Uint8Array(w * h), stack = new Int32Array(w * h);
  let clear = 0, partial = 0, opaque = 0, visible = 0, edge = 0, maxAlpha = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = data[((top + y) * width + left + x) * 4 + 3], p = y * w + x;
    if (!a) clear++; else if (a === 255) opaque++; else partial++;
    maxAlpha = Math.max(maxAlpha, a);
    if (a >= THRESHOLD) { mask[p] = 1; visible++; if (!x || !y || x === w - 1 || y === h - 1) edge++; }
  }
  let x0 = w, y0 = h, x1 = -1, y1 = -1, kept = 0, discardedPixels = 0, components = 0;
  for (let p = 0; p < mask.length; p++) if (mask[p]) {
    let n = 0, area = 0, bx0 = w, by0 = h, bx1 = -1, by1 = -1; stack[n++] = p; mask[p] = 0;
    while (n) {
      const q = stack[--n], x = q % w, y = Math.floor(q / w); area++;
      bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y);
      const push = v => { if (mask[v]) { mask[v] = 0; stack[n++] = v; } };
      if (x) push(q - 1); if (x + 1 < w) push(q + 1); if (y) push(q - w); if (y + 1 < h) push(q + w);
    }
    components++;
    if (area < MIN_COMPONENT) { discardedPixels += area; continue; }
    kept++; x0 = Math.min(x0, bx0); y0 = Math.min(y0, by0); x1 = Math.max(x1, bx1); y1 = Math.max(y1, by1);
  }
  if (!kept) throw Error('empty cell after alpha/component bounds check');
  const margin = Math.min(x0, y0, w - 1 - x1, h - 1 - y1), warnings = [];
  if (edge) warnings.push('visible alpha reaches cell boundary: possible clipping or backdrop');
  if (margin < PADDING) warnings.push('insufficient clear margin for four-pixel padding');
  if (visible / (w * h) > .8) warnings.push('broad alpha coverage: inspect for haze/background');
  if (clear / (w * h) < .1) warnings.push('less than ten percent fully clear pixels: inspect transparency');
  const l = Math.max(0, x0 - PADDING), t = Math.max(0, y0 - PADDING), r = Math.min(w, x1 + 1 + PADDING), b = Math.min(h, y1 + 1 + PADDING);
  return { rect: { left: left + l, top: top + t, width: r - l, height: b - t }, alpha: { clear, partial, opaque, maxAlpha, visibleAtThreshold: visible, edgePixelsAtThreshold: edge }, components: { total: components, retained: kept, discardedIsolatedPixelsForBoundsOnly: discardedPixels }, clearMargin: margin, touchesCellEdge: edge > 0, warnings };
}

async function recordPNG(bytes, file) {
  await write(file, bytes); const meta = await sharp(bytes).metadata();
  return { file, width: meta.width, height: meta.height, sha256: hash(bytes), hasAlpha: meta.hasAlpha };
}
for (const subject of queue.subjects) {
  if (only && subject.id !== only) continue;
  const sheet = sheetPath(subject); if (!await exists(sheet)) continue;
  const bytes = await fs.readFile(full(sheet)), sha256 = hash(bytes), meta = await sharp(bytes).metadata();
  const previous = assets.get(subject.id), base = { id: subject.id, category: subject.category, sheet, sheetSha256: sha256, width: meta.width, height: meta.height, angles, visualReview: previous?.sheetSha256 === sha256 ? previous.visualReview : 'pending', gameRegistration: 'pending' };
  try {
    if (meta.format !== 'png' || !meta.hasAlpha || !meta.width || !meta.height || meta.width < 2 || meta.height < 2) throw Error('sheet must be a nonempty PNG with alpha, large enough for four independent cells');
    const { data } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let clear = 0; for (let p = 3; p < data.length; p += 4) if (!data[p]) clear++;
    if (!clear) throw Error('no fully transparent pixels: backdrop cannot be removed by this crop-only tool');
    const cw = Math.floor(meta.width / 2), ch = Math.floor(meta.height / 2);
    const cells = angles.map((direction, k) => {
      const col = k % 2, row = Math.floor(k / 2), cell = { left: col * cw, top: row * ch, width: col ? meta.width - cw : cw, height: row ? meta.height - ch : ch };
      return { direction, cell, ...cellBounds(data, meta.width, cell) };
    });
    const packingReview = { columnSplit: cw, rowSplit: ch, oddDimensionsHandled: !!(meta.width % 2 || meta.height % 2), alphaThreshold: THRESHOLD, rowAboveVisible: 0, rowBelowVisible: 0, rowBothSidesVisible: 0, columnLeftVisible: 0, columnRightVisible: 0, columnBothSidesVisible: 0 };
    for (let x = 0; x < meta.width; x++) { const a = data[((ch - 1) * meta.width + x) * 4 + 3] >= THRESHOLD, b = data[(ch * meta.width + x) * 4 + 3] >= THRESHOLD; packingReview.rowAboveVisible += +a; packingReview.rowBelowVisible += +b; packingReview.rowBothSidesVisible += +(a && b); }
    for (let y = 0; y < meta.height; y++) { const a = data[(y * meta.width + cw - 1) * 4 + 3] >= THRESHOLD, b = data[(y * meta.width + cw) * 4 + 3] >= THRESHOLD; packingReview.columnLeftVisible += +a; packingReview.columnRightVisible += +b; packingReview.columnBothSidesVisible += +(a && b); }
    const originals = inventory.items.filter(it => subject.sourceIds.includes(it.id));
    const first = originals.find(it => it.direction === angles[0]) ?? originals[0];
    const configured = first?.display.configuredCSS, normal = first?.display.normalMaxCSS;
    const calibration = { status: first ? 'estimated-unregistered' : 'no-runtime-scale', referenceId: first?.id ?? null, firstGeneratedDirection: angles[0], originalReferenceDirection: first?.direction ?? 'unknown', originalConfiguredCSS: configured ?? null, originalNormalMaxCSS: normal ?? null, originalFacingSizes: originals.map(it => ({ id: it.id, direction: it.direction, configuredCSS: it.display.configuredCSS, normalMaxCSS: it.display.normalMaxCSS })), firstNativeWidth: cells[0].rect.width, configuredCSSPerNativePixel: configured ? configured.width / cells[0].rect.width : null, normalMaxCSSPerNativePixel: normal ? normal.width / cells[0].rect.width : null, policy: 'One shared scale per mode for all four rotations, calibrated to the first original reference width. Other widths vary naturally. No independent width/height stretching. Actual game scale and orientation need registration/placement review.' };
    const dir = `${OUT}/generated/${subject.category}/${path.posix.basename(sheet, '.png')}`; await fs.mkdir(full(dir), { recursive: true });
    const views = [];
    for (const cell of cells) {
      const nativeBytes = await sharp(bytes).extract(cell.rect).png().toBuffer(), native = await recordPNG(nativeBytes, `${dir}/${cell.direction}.native.png`), sizes = [];
      const decoded = await sharp(nativeBytes).ensureAlpha().raw().toBuffer(), expected = await sharp(bytes).extract(cell.rect).ensureAlpha().raw().toBuffer();
      if (!decoded.equals(expected)) throw Error('native crop pixel conservation failed');
      for (const [mode, factor] of [['configured', calibration.configuredCSSPerNativePixel], ['max', calibration.normalMaxCSSPerNativePixel]]) if (factor) for (const dpr of [1, 2]) {
        const targetCSS = { width: cell.rect.width * factor, height: cell.rect.height * factor };
        const image = await sharp(nativeBytes).resize({ width: Math.max(1, Math.round(targetCSS.width * dpr)) }).png().toBuffer();
        sizes.push({ mode, dpr, targetCSS, estimated: true, ...await recordPNG(image, `${dir}/${cell.direction}.${mode}${dpr === 2 ? '@2x' : ''}.png`) });
      }
      views.push({ direction: cell.direction, cell: cell.cell, sourceRect: cell.rect, alpha: cell.alpha, components: cell.components, clearMargin: cell.clearMargin, touchesCellEdge: cell.touchesCellEdge, warnings: cell.warnings, native, nativePixelConservation: true, sizes });
    }
    if (hash(await fs.readFile(full(sheet))) !== sha256) throw Error('source sheet changed during preparation');
    const warnings = cells.flatMap(c => c.warnings.map(w => `${c.direction}: ${w}`));
    if (packingReview.rowBothSidesVisible) warnings.push('visible alpha on both sides of row split: inspect for cross-row artwork');
    if (packingReview.columnBothSidesVisible) warnings.push('visible alpha on both sides of column split: inspect for cross-column artwork');
    const asset = { ...base, status: 'generated-awaiting-visual-review', fileValidation: 'passed', alphaReview: warnings.length ? 'flags-require-review' : 'bounds-checked-visual-review-pending', warnings, packingReview, calibration, views, policy: { alphaThreshold: THRESHOLD, padding: PADDING, minComponentPixelsForBounds: MIN_COMPONENT, pixelEdits: 'none; native crop and aspect-preserving resize only', cellPacking: 'split at floor(width/2), floor(height/2); right/bottom cells retain any remainder pixels, without changing the source sheet', sourceSheetConserved: true, rasterRounding: 'width rounded to nearest pixel, height derived from native aspect ratio; target CSS bounds retained separately' } };
    assets.set(subject.id, asset); patches.set(subject.id, { status: asset.status, sheet, sheetSha256: sha256, angles, alphaReview: asset.alphaReview, visualReview: base.visualReview ?? 'pending', preparedManifest: `${OUT}/generated-manifest.json` });
  } catch (error) {
    const asset = { ...base, status: 'generated-file-validation-failed', fileValidation: 'failed', error: String(error.message), views: [] };
    assets.set(subject.id, asset); patches.set(subject.id, { status: asset.status, sheet, sheetSha256: sha256, angles, alphaReview: 'failed', preparedManifest: `${OUT}/generated-manifest.json` });
  }
}
// Re-read the queue so concurrent generation prompts and authoritative theme metadata survive.
const latest = await read(`${OUT}/queue.json`); latest.subjects = latest.subjects.map(s => ({ ...s, ...patches.get(s.id) }));
let generated = 0; for (const s of latest.subjects) if (await exists(sheetPath(s))) generated++;
const entries = [...assets.values()], counts = { requested: latest.subjects.length, generated, fileValidated: entries.filter(a => a.fileValidation === 'passed').length, fileValidationFailed: entries.filter(a => a.fileValidation === 'failed').length, alphaFlagged: entries.filter(a => a.alphaReview === 'flags-require-review').length, visuallyReviewed: entries.filter(a => a.visualReview === 'passed').length, nativeViewsExported: entries.reduce((n, a) => n + a.views.length, 0), pendingGeneration: latest.subjects.length - generated };
const manifest = { schemaVersion: 1, task: 'T017', counts, themeReference: latest.themeReference, policy: 'File validation and crop exports do not establish visual consistency, true geometric rotation, correct sunlight, or registered game scale. Original sheets and source exports remain unchanged.', assets: entries };
await json(`${OUT}/generated-manifest.json`, manifest);
await json(`${OUT}/prepared-verification.json`, { task: 'T017', sourceManifest: `${OUT}/generated-manifest.json`, scope: 'Current selected sheets: PNG/alpha checks and pixel-conserving crops only. Boundary warnings, rigid rotation geometry and game registration require review.', counts, activeSheets: entries.map(({ id, sheet, sheetSha256, fileValidation, alphaReview, warnings, packingReview }) => ({ id, sheet, sheetSha256, fileValidation, alphaReview, warnings, packingReview })), themeReferencePreserved: latest.themeReference, checkedNativeViews: counts.nativeViewsExported, checkedScaledVariants: entries.reduce((n, a) => n + a.views.reduce((s, v) => s + v.sizes.length, 0), 0), sourceSheetsConserved: true, visualApproval: false, gameScaleRegistered: false, failures: entries.filter(a => a.fileValidation === 'failed').map(({ id, error }) => ({ id, error })) });
latest.counts = { ...latest.counts, generated, reviewed: counts.visuallyReviewed, pending: counts.pendingGeneration, fileValidated: counts.fileValidated, alphaFlagged: counts.alphaFlagged, nativeViewsExported: counts.nativeViewsExported }; await json(`${OUT}/queue.json`, latest);
const previews = [];
for (let k = 0; k < entries.length; k++) {
  const a = entries[k], tile = await sharp(full(a.sheet)).resize({ width: 300, height: 210, fit: 'contain', background: '#27313c' }).png().toBuffer();
  const label = a.id.replace(/[<>&"']/g, ''), text = Buffer.from(`<svg width="300" height="30"><rect width="300" height="30" fill="#18212b"/><text x="8" y="20" fill="white" font-size="12">${label}</text></svg>`);
  previews.push({ input: tile, left: (k % 4) * 300, top: Math.floor(k / 4) * 240 }, { input: text, left: (k % 4) * 300, top: Math.floor(k / 4) * 240 + 210 });
}
if (entries.length) await write(`${OUT}/generated/contact.png`, await sharp({ create: { width: 1200, height: Math.ceil(entries.length / 4) * 240, channels: 4, background: '#18212b' } }).composite(previews).png().toBuffer());
console.log(JSON.stringify({ counts, processed: [...patches.keys()], contact: entries.length ? `${OUT}/generated/contact.png` : null }, null, 2));

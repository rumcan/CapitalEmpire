/** The four-view cell rules of the art model's tool (scripts/assets/prep-theme-consistency.mjs), kept in step with it. prep-views uses this to cut the NE/SE/SW/NW native crops of a reviewed ('ready') sheet that has no crops yet. Pixel-conserving crops only: nothing is edited, nothing is saved. */
import sharp from 'sharp';
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

/** Cut a four-view sheet (PNG with alpha) into its NE, SE, SW, NW native crops (PNG Buffers) by the art model's cell rules. Throws when a cell is empty or a crop is not pixel-exact. */
export async function cropFourViews(sheetBytes) {
  const meta = await sharp(sheetBytes).metadata();
  if (meta.format !== 'png' || !meta.hasAlpha || !meta.width || !meta.height || meta.width < 2 || meta.height < 2) throw Error('sheet must be a nonempty PNG with alpha, large enough for four independent cells');
  const { data } = await sharp(sheetBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let clear = 0; for (let p = 3; p < data.length; p += 4) if (!data[p]) clear++;
  if (!clear) throw Error('no fully transparent pixels: backdrop cannot be removed by this crop-only tool');
  const cw = Math.floor(meta.width / 2), ch = Math.floor(meta.height / 2);
  const cells = angles.map((direction, k) => {
    const col = k % 2, row = Math.floor(k / 2), cell = { left: col * cw, top: row * ch, width: col ? meta.width - cw : cw, height: row ? meta.height - ch : ch };
    return { direction, cell, ...cellBounds(data, meta.width, cell) };
  });
  const warnings = cells.flatMap(c => c.warnings.map(w => `${c.direction}: ${w}`));
  let rowBoth = 0, columnBoth = 0;
  for (let x = 0; x < meta.width; x++) { const a = data[((ch - 1) * meta.width + x) * 4 + 3] >= THRESHOLD, b = data[(ch * meta.width + x) * 4 + 3] >= THRESHOLD; rowBoth += +(a && b); }
  for (let y = 0; y < meta.height; y++) { const a = data[(y * meta.width + cw - 1) * 4 + 3] >= THRESHOLD, b = data[(y * meta.width + cw) * 4 + 3] >= THRESHOLD; columnBoth += +(a && b); }
  if (rowBoth) warnings.push('visible alpha on both sides of row split: inspect for cross-row artwork');
  if (columnBoth) warnings.push('visible alpha on both sides of column split: inspect for cross-column artwork');
  const views = {};
  for (const cell of cells) {
    const nativeBytes = await sharp(sheetBytes).extract(cell.rect).png().toBuffer();
    const decoded = await sharp(nativeBytes).ensureAlpha().raw().toBuffer(), expected = await sharp(sheetBytes).extract(cell.rect).ensureAlpha().raw().toBuffer();
    if (!decoded.equals(expected)) throw Error('native crop pixel conservation failed');
    views[cell.direction] = nativeBytes;
  }
  return { views, warnings };
}

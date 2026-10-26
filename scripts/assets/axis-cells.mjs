// The pixel side of the screen-axis sets (sync-axis-views.mjs, prep-axis-views.mjs, prep-cars.mjs): where a picture's subject is (its strong-alpha
// components, the faint residue round them left out), a sheet cut into its four views by those components, and a view trimmed to its subject.
// Pixel-conserving crops only: nothing is resized, recoloured, mirrored or edited, and every cut is checked against the sheet's decoded pixels.
import sharp from 'sharp';

/** alpha at or above this is the subject (the generator's faint residue, alpha 1..15 and some to 31, is not) */
export const STRONG = 32;
/** a component smaller than this (px) is a speck of residue, not part of a subject */
export const SPECK = 200;
/** a component this near (px) to a view's main body belongs to it (a lamp's head, a detached step) */
const NEAR = 40;
/** clear pixels kept round a trimmed or cut picture */
export const PAD = 4;

/** the strong-alpha components of an RGBA image (raw, width x height): each { area, x0, y0, x1, y1 (inclusive), cx, cy }, specks left out */
export function components(data, width, height, threshold = STRONG, speck = SPECK) {
  const mask = new Uint8Array(width * height), stack = new Int32Array(width * height), out = [];
  for (let p = 0; p < mask.length; p++) if (data[p * 4 + 3] >= threshold) mask[p] = 1;
  for (let p = 0; p < mask.length; p++) if (mask[p]) {
    let n = 0, area = 0, x0 = width, y0 = height, x1 = -1, y1 = -1, sx = 0, sy = 0; stack[n++] = p; mask[p] = 0;
    while (n) {
      const q = stack[--n], x = q % width, y = (q - x) / width; area++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x && mask[q - 1]) { mask[q - 1] = 0; stack[n++] = q - 1; }
      if (x + 1 < width && mask[q + 1]) { mask[q + 1] = 0; stack[n++] = q + 1; }
      if (y && mask[q - width]) { mask[q - width] = 0; stack[n++] = q - width; }
      if (y + 1 < height && mask[q + width]) { mask[q + width] = 0; stack[n++] = q + width; }
    }
    if (area >= speck) out.push({ area, x0, y0, x1, y1, cx: sx / area, cy: sy / area });
  }
  return out;
}

/** the subject of a set of components: the largest and every component within NEAR px of it (grown until none is added); its bounds (inclusive) */
export function subjectOf(comps) {
  if (!comps.length) return null;
  const main = comps.reduce((a, c) => (c.area > a.area ? c : a)), b = { x0: main.x0, y0: main.y0, x1: main.x1, y1: main.y1, area: main.area }, used = new Set([main]);
  for (let grew = true; grew;) {
    grew = false;
    for (const c of comps) if (!used.has(c) && c.x1 >= b.x0 - NEAR && c.x0 <= b.x1 + NEAR && c.y1 >= b.y0 - NEAR && c.y0 <= b.y1 + NEAR) {
      used.add(c); b.x0 = Math.min(b.x0, c.x0); b.y0 = Math.min(b.y0, c.y0); b.x1 = Math.max(b.x1, c.x1); b.y1 = Math.max(b.y1, c.y1); b.area += c.area; grew = true;
    }
  }
  return b;
}

/** a picture's subject bounds (PNG bytes): { x0, y0, x1, y1 } inclusive, in its own pixels, and its size; throws when it has no subject */
export async function subjectBounds(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = subjectOf(components(data, info.width, info.height));
  if (!b) throw Error('no subject: the picture has no strong-alpha component');
  return { ...b, width: info.width, height: info.height, data };
}

/** a picture trimmed to its subject plus pad clear pixels (clamped to the picture): { png, rect: [left, top, width, height] } in its pixels */
export async function trimmed(png, pad = PAD) {
  const b = await subjectBounds(png);
  const left = Math.max(0, b.x0 - pad), top = Math.max(0, b.y0 - pad), right = Math.min(b.width, b.x1 + 1 + pad), bottom = Math.min(b.height, b.y1 + 1 + pad);
  const rect = { left, top, width: right - left, height: bottom - top };
  return { png: await exact(png, rect), rect: [left, top, rect.width, rect.height] };
}

/** a pixel-exact crop of a PNG (checked against the source's decoded pixels) */
export async function exact(png, rect) {
  const out = await sharp(png).extract(rect).png().toBuffer();
  const a = await sharp(out).ensureAlpha().raw().toBuffer(), b = await sharp(png).extract(rect).ensureAlpha().raw().toBuffer();
  if (!a.equals(b)) throw Error('crop pixel conservation failed');
  return out;
}

/** the four views of a 2 x 2 sheet (PNG bytes, row-major order: the names in order), cut by their subjects: each view's subject is the largest
 *  strong-alpha component whose centre lies in its quarter, with the components near it; its rect that subject's bounds plus PAD (less where the
 *  next view is nearer). A subject may cross the sheet's middle (the art's half-cell crops clip it there): the cut follows the subject, not the
 *  cells. Returns { views: { name: PNG }, rects: { name: { left, top, width, height } }, crossed: [names whose subject crosses its half cell] } */
export async function cutSheet(png, names = ['N', 'E', 'S', 'W']) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), W = info.width, H = info.height;
  const comps = components(data, W, H), quarters = names.map(() => []);
  for (const c of comps) quarters[(c.cy >= H / 2 ? 2 : 0) + (c.cx >= W / 2 ? 1 : 0)].push(c);
  const subjects = quarters.map((q, i) => { const s = subjectOf(q); if (!s) throw Error(`${names[i]}: no subject in its quarter`); return s; });
  const views = {}, rects = {}, crossed = [];
  for (const [i, s] of subjects.entries()) {
    // the padding, less where another subject is nearer than 2 x PAD
    let l = Math.max(0, s.x0 - PAD), t = Math.max(0, s.y0 - PAD), r = Math.min(W, s.x1 + 1 + PAD), b = Math.min(H, s.y1 + 1 + PAD);
    for (const [j, o] of subjects.entries()) if (j !== i && o.y1 >= t && o.y0 < b && o.x1 >= l && o.x0 < r) {
      if (o.x0 > s.x1) r = Math.min(r, Math.max(s.x1 + 1, Math.floor((s.x1 + o.x0 + 1) / 2)));
      else if (o.x1 < s.x0) l = Math.max(l, Math.min(s.x0, Math.ceil((s.x0 + o.x1) / 2)));
      else if (o.y0 > s.y1) b = Math.min(b, Math.max(s.y1 + 1, Math.floor((s.y1 + o.y0 + 1) / 2)));
      else if (o.y1 < s.y0) t = Math.max(t, Math.min(s.y0, Math.ceil((s.y0 + o.y1) / 2)));
      else throw Error(`${names[i]} and ${names[j]} overlap: the sheet cannot be cut by its subjects`);
    }
    const col = i % 2, row = Math.floor(i / 2), cw = Math.floor(W / 2), ch = Math.floor(H / 2);
    if (s.x0 < col * cw || s.x1 >= (col ? W : cw) || s.y0 < row * ch || s.y1 >= (row ? H : ch)) crossed.push(names[i]);
    rects[names[i]] = { left: l, top: t, width: r - l, height: b - t };
    views[names[i]] = await exact(png, rects[names[i]]);
  }
  return { views, rects, crossed };
}

/** the measures of a trimmed view (PNG bytes) its sizing and ground point need: its size, the subject's width and height (px), and the ground's
 *  near edge: the subject's lowest row (by: the row below it) and the mean x of the strong pixels of its lowest rows (bx) */
export async function measure(png) {
  const b = await subjectBounds(png), { data, width } = b;
  let n = 0, sx = 0;
  for (let y = b.y1; y >= Math.max(b.y0, b.y1 - 3); y--) for (let x = b.x0; x <= b.x1; x++) if (data[(y * width + x) * 4 + 3] >= 128) { sx += x; n++; }
  return { W: b.width, H: b.height, bw: b.x1 + 1 - b.x0, bh: b.y1 + 1 - b.y0, x0: b.x0, x1: b.x1, bx: n ? sx / n : (b.x0 + b.x1 + 1) / 2, by: b.y1 + 1 };
}

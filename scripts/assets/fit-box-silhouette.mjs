// T375: fits a physical box (the building's footprint w x d metres, a wall height and a small eave margin) to the silhouette of each native crop, in the
// game's projection, to read what the importer needs and nobody can eyeball: each view's camera pixelsPerMetre and the ground anchor (the footprint's
// centre on the picture). The silhouette is the picture's alpha; the box's is the hull of its eight corners; the fit maximises their overlap (IoU) over the
// scale, the anchor, and (shared by the views of a subject) the wall height and eave margin. A hedge, a sign or a vent standing off the box costs a
// little overlap and moves nothing: the fit is the box that explains most of the picture. Overlays (the fitted base in red, the roof in cyan, the anchor
// as a cross) are written for review: an overlay that does not sit on the building's base is a fit not to trust.
//   node scripts/assets/fit-box-silhouette.mjs --subject 10.74x5.74 --out DIR --view NE:0:ne.png --view yaw8N:37:n.png ... [--heights 4]
// --view key:headingDegrees:file. The legacy headings are NE 0, N 37, SE 90, E 127, SW 180, S 217, NW 270, W 307. Prints JSON; no file but the overlays is written.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const C30 = Math.cos(Math.PI / 6);
const DS = 4;
/** the alpha of a picture as a bit mask at 1/DS of its size (a cell is set when any pixel in it is opaque) */
export async function loadMask(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, w = Math.ceil(W / DS), h = Math.ceil(H / DS), m = new Uint8Array(w * h);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 60) m[Math.floor(y / DS) * w + Math.floor(x / DS)] = 1;
  return { m, w, h, W, H };
}
/** the box's corners on the screen (full-resolution picture px) */
export function boxCorners(p, view) {
  const { ppm, tx, ty } = p, c = ppm / Math.SQRT2, a = (view.sign * view.heading * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const hw = (view.swap ? view.d : view.w) / 2, hd = (view.swap ? view.w : view.d) / 2;
  const out = [];
  for (const z of [0, p.H]) for (const [u, v] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
    const uu = u + Math.sign(u) * p.e, vv = v + Math.sign(v) * p.e, mx = uu * ca - vv * sa, my = uu * sa + vv * ca;
    out.push([tx + (mx - my) * c, ty + ((mx + my) * c) / 2 - z * ppm * C30]);
  }
  return out;
}
function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}
/** IoU of a convex polygon (full-resolution px) against a mask */
function iou(poly, mk) {
  const { m, w, h } = mk, P = poly.map(([x, y]) => [x / DS, y / DS]);
  let inter = 0, onlyPoly = 0, maskTotal = mk.total;
  let y0 = Math.max(0, Math.floor(Math.min(...P.map(q => q[1])))), y1 = Math.min(h - 1, Math.ceil(Math.max(...P.map(q => q[1]))));
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5; let xa = Infinity, xb = -Infinity;
    for (let i = 0; i < P.length; i++) {
      const [x1, y1_] = P[i], [x2, y2] = P[(i + 1) % P.length];
      if ((y1_ <= yc && y2 > yc) || (y2 <= yc && y1_ > yc)) { const x = x1 + ((yc - y1_) / (y2 - y1_)) * (x2 - x1); if (x < xa) xa = x; if (x > xb) xb = x; }
    }
    if (xa > xb) continue;
    const ia = Math.max(0, Math.ceil(xa - 0.5)), ib = Math.min(w - 1, Math.floor(xb - 0.5));
    for (let x = ia; x <= ib; x++) { if (m[y * w + x]) inter++; else onlyPoly++; }
  }
  return inter / (maskTotal + onlyPoly);
}
function score(p, view, mk) { return iou(hull(boxCorners(p, view)), mk); }
/** pattern search from a start: scale, anchor (and the shared height and margin when free) */
function climb(p0, view, mk, free) {
  let p = { ...p0 }, best = score(p, view, mk), step = { ppm: 6, t: 24, H: 0.6, e: 0.15 };
  for (let it = 0; it < 90; it++) {
    let moved = false;
    for (const [k, d] of [['ppm', step.ppm], ['tx', step.t], ['ty', step.t], ['H', step.H], ['e', step.e]]) {
      if ((k === 'H' || k === 'e') && !free) continue;
      for (const sgn of [1, -1]) {
        const q = { ...p, [k]: p[k] + sgn * d };
        if (q.ppm < (view.ppmLo ?? 20) || q.ppm > (view.ppmHi ?? 140) || q.H < 0.5 || q.H > 12 || q.e < 0 || q.e > 1.2) continue;
        const s = score(q, view, mk); if (s > best + 1e-6) { best = s; p = q; moved = true; }
      }
    }
    if (!moved) { step = { ppm: step.ppm / 2, t: step.t / 2, H: step.H / 2, e: step.e / 2 }; if (step.t < 0.6) break; }
  }
  return { p, s: best };
}
/** the best of the orientations (heading sign, width and depth swapped) and a few starts, for one view */
export function fitView(view, mk, shared) {
  let best = null;
  for (const sign of [1, -1]) for (const swap of [false, true]) {
    const v = { ...view, sign, swap, ppmLo: shared?.ppm ?? 38, ppmHi: shared?.ppm ?? 62 };
    for (const ppm0 of shared?.ppm ? [shared.ppm] : [42, 48, 54]) {
      const cx = mk.W / 2, cy = mk.H * 0.62;
      const start = { ppm: ppm0, tx: cx, ty: cy, H: shared?.H ?? 4, e: shared?.e ?? 0.3 };
      const r = climb(start, v, mk, !shared);
      if (!best || r.s > best.s) best = { ...r, view: v };
    }
  }
  return best;
}
export async function fitSubject({ w, d, views, out, fixed }) {
  const masks = {}; for (const v of views) { const mk = await loadMask(v.file); mk.total = mk.m.reduce((a, b) => a + b, 0); masks[v.key] = mk; }
  const corners = views.filter(v => v.key.startsWith('normal')), straight = views.filter(v => v.key.startsWith('yaw8'));
  const fits = {};
  if (fixed) { for (const v of views) fits[v.key] = fitView({ ...v, w, d }, masks[v.key], fixed); }
  else {
  for (const v of corners) fits[v.key] = fitView({ ...v, w, d }, masks[v.key], null);
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const shared = corners.length ? { H: med(corners.map(v => fits[v.key].p.H)), e: med(corners.map(v => fits[v.key].p.e)) } : { H: 4, e: 0.3 };
  for (const v of corners) fits[v.key] = { ...fitView({ ...v, w, d }, masks[v.key], shared) };
  for (const v of straight) fits[v.key] = fitView({ ...v, w, d }, masks[v.key], shared);
  }
  const res = {};
  for (const v of views) {
    const f = fits[v.key], mk = masks[v.key];
    res[v.key] = { heading: v.heading, ppm: +f.p.ppm.toFixed(3), anchor: { x: +f.p.tx.toFixed(2), y: +f.p.ty.toFixed(2) }, iou: +f.s.toFixed(4), orientation: { sign: f.view.sign, swap: f.view.swap }, size: [mk.W, mk.H], H: +f.p.H.toFixed(2), e: +f.p.e.toFixed(2) };
    if (out) {
      fs.mkdirSync(out, { recursive: true });
      const ptsB = hull(boxCorners({ ...f.p, H: 0 }, f.view).slice(0, 4)), ptsR = hull(boxCorners({ ...f.p }, f.view).slice(4));
      const poly = (pts, col) => `<polygon points="${pts.map(q => q.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${col}" stroke-width="3"/>`;
      const svg = Buffer.from(`<svg width="${mk.W}" height="${mk.H}" xmlns="http://www.w3.org/2000/svg">${poly(ptsB, '#ff2d2d')}${poly(ptsR, '#27e0ff')}<path d="M${f.p.tx - 12},${f.p.ty} h24 M${f.p.tx},${f.p.ty - 12} v24" stroke="#ffe600" stroke-width="3"/></svg>`);
      await sharp({ create: { width: mk.W, height: mk.H, channels: 4, background: '#39424f' } }).composite([{ input: v.file }, { input: svg }]).png().toFile(path.join(out, `fit-${v.key}.png`));
    }
  }
  return res;
}
if (process.argv[1] && process.argv[1].endsWith('fit-box-silhouette.mjs')) {
  const args = process.argv.slice(2), opt = k => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
  const [w, d] = opt('subject').split('x').map(Number), views = [];
  args.forEach((a, i) => { if (a === '--view') { const [key, h, ...f] = args[i + 1].split(':'); views.push({ key, heading: +h, file: f.join(':') }); } });
  const res = await fitSubject({ w, d, views, out: opt('out') });
  console.log(JSON.stringify(res, null, 1));
}

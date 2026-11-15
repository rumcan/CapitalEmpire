// A plain grey 2:1 isometric guide box for ChatGPT building pictures (the owner's rule, 2026-11-14: attach only the style picture and a guide box at
// the building's real size). The game's camera: every horizontal edge at 26.565 degrees (2:1), verticals vertical, no perspective; a metre of
// height is 1.22 x a metre's horizontal ground step (D:/AI/chatgpt-bridge/guides/standin/shop-iso-guide-view1.png: 85 px a metre along the
// ground, 104 px a metre up). The box's FRONT face carries a dark mark (where the door or hatch goes): view 1 faces the screen's lower left,
// view 2 the lower right. A tan patch under it shows the footprint. White canvas, 1774 x 887 like the earlier guides; the box is scaled to fill it.
// node scripts/assets/iso-guide-box.mjs <L> <D> <H> <view 1|2> <out.png>
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** height per metre over the ground step per metre (the game's view) */
export const RISE = 1.22;

/** the guide's SVG and its scale: L the front's length, D the depth, H the height (metres); view 1 front lower left, view 2 lower right */
export function guideBoxSvg({ L, D, H, view = 1, W = 1774, Hc = 887, margin = 0.6, fill = 0.84 }) {
  const a = view === 1 ? L : D, b = view === 1 ? D : L; // a: the face toward the lower left, b: toward the lower right
  const A = a + 2 * margin, B = b + 2 * margin;
  const s = Math.min(fill * W / (A + B), fill * Hc / ((A + B) / 2 + RISE * H)), h = RISE * H * s;
  // the bottom (nearest) corner of the ground patch at P; everything placed so the drawing is centred
  const totalW = (A + B) * s, totalH = (A + B) * s / 2 + h;
  const left = (W - totalW) / 2, top = (Hc - totalH) / 2;
  const P = [left + A * s, top + totalH];
  const at = (u, v, z = 0) => [P[0] - u * s + v * s, P[1] - u * s / 2 - v * s / 2 - z * RISE * s]; // u up-left along a, v up-right along b
  const poly = (pts, col) => `<polygon points="${pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="${col}" stroke="#222" stroke-width="0.8"/>`;
  const m = margin;
  const ground = [at(0, 0), at(A, 0), at(A, B), at(0, B)];
  const c0 = at(m, m), cl = at(m + a, m), cr = at(m, m + b), cb = at(m + a, m + b); // the box's footprint corners (c0 nearest)
  const up = p => [p[0], p[1] - h];
  const leftFace = [cl, c0, up(c0), up(cl)], rightFace = [c0, cr, up(cr), up(c0)], topFace = [up(c0), up(cl), up(cb), up(cr)];
  // the front's dark mark: 15% to 55% along the front, 25% to 65% up
  const mark = view === 1
    ? [at(m + a * 0.85, m, H * 0.25), at(m + a * 0.45, m, H * 0.25), at(m + a * 0.45, m, H * 0.65), at(m + a * 0.85, m, H * 0.65)]
    : [at(m, m + b * 0.15, H * 0.25), at(m, m + b * 0.55, H * 0.25), at(m, m + b * 0.55, H * 0.65), at(m, m + b * 0.15, H * 0.65)];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hc}"><rect width="${W}" height="${Hc}" fill="#fff"/>`
    + `<polygon points="${ground.map(p => p.join(',')).join(' ')}" fill="#D6B68A"/>`
    + poly(leftFace, '#B0B0B0') + poly(rightFace, '#CCCCCC') + poly(topFace, '#E0E0E0') + poly(mark, '#5A5A5A') + '</svg>';
  return { svg, pxPerMetre: s, size: [W, Hc] };
}

/** writes the guide PNG; returns its px a metre */
export async function writeGuideBox(opts, out) {
  const { svg, pxPerMetre } = guideBoxSvg(opts);
  await sharp(Buffer.from(svg)).png().toFile(out);
  return pxPerMetre;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [L, D, H, view, out] = process.argv.slice(2);
  const s = await writeGuideBox({ L: +L, D: +D, H: +H, view: +view }, out);
  console.log(`${out}: ${s.toFixed(1)} px a metre`);
}

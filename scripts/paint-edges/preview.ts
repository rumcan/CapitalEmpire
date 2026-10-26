// Painted edges preview (node only): renders course pieces (a fairway, a kidney green snapped to it, a crescent bunker, a pond) as the
// ground painter lays them, in the iso view, to a PNG. The worker painter itself needs OffscreenCanvas 2D, which node lacks, so this is a
// small software compositor that runs the same data path (computeSnapPiecePlacement -> pieceAreas -> PaintTool.patch) and the same
// edge images (src/game/paint-edges.ts) with the same compositing as renderer.ts drawPaints: shadow under the area, light in screen,
// dark in multiply, the feather cut (destination-out), then the area over the ground. 'before' draws every area crisp (hard clip edges).
// The course height's shade (T028b) and the hex-mixing of the photos are left out.
// Run: npx esbuild scripts/paint-edges/preview.ts --bundle --platform=node --format=esm --external:sharp --outfile=output/paint-edges/preview.mjs
//      node output/paint-edges/preview.mjs <before|after> <out.png> [cache level, default 0.3]
import sharp from 'sharp';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { HH, HW } from '../../src/game/iso';
import { computeSnapPiecePlacement } from '../../src/game/ext/course-snap';
import { pieceAreas } from '../../src/game/ext/course-pieces';
import { PaintTool } from '../../src/game/paint-tool';
import { PAINT_TEXES, type PaintArea } from '../../src/game/paint';
import { readFileSync } from 'node:fs';
import { CELL } from '../../src/game/golf/paintcourse';
import type { LotPatch } from '../../src/game/ground-protocol';
import { EDGE_LOOKS, DARK_RGB, LIGHT_RGB, bandRamp, edgeBox, edgeField, edgeImages, edgeReach, edgeRes, featherTiles, type EdgeImage } from '../../src/game/paint-edges';

const mode = process.argv[2] === 'before' ? 'before' : 'after', out = resolve(process.argv[3] ?? `output/paint-edges/${mode}.png`), L = Number(process.argv[4] ?? 0.3);

// ---- the scene: real pieces, laid as the Course tool lays them
const fair = computeSnapPiecePlacement({ kind: 'fairway', archetype: 'fairway-pear', cursor: { x: 100, y: 100 }, angleDeg: 0, snapEnabled: false });
const green = computeSnapPiecePlacement({ kind: 'green', archetype: 'green-kidney', cursor: { x: 113.5, y: 101 }, areas: [{ id: 1, kind: 'fairway', pts: fair.pts }] });
const bunker = computeSnapPiecePlacement({ kind: 'bunker', archetype: 'bunker-crescent', cursor: { x: 121, y: 111 }, angleDeg: 20, snapEnabled: false });
const pond = computeSnapPiecePlacement({ kind: 'water', archetype: 'water-pond', cursor: { x: 96, y: 116 }, angleDeg: 10, snapEnabled: false });
let id = 1;
const areas: PaintArea[] = [];
for (const pl of [fair, green, bunker, pond]) for (const a of pieceAreas(pl)) areas.push({ ...a, id: id++ } as PaintArea);
const patches: LotPatch[] = areas.map(a => PaintTool.patch(a)).sort((a, b) => a.paint!.z - b.paint!.z);

// ---- the view: tiles -> world px -> image px at cache level L
let tx0 = Infinity, ty0 = Infinity, tx1 = -Infinity, ty1 = -Infinity;
for (const p of patches) for (let k = 0; k < p.pts.length; k += 2) { tx0 = Math.min(tx0, p.pts[k]!); tx1 = Math.max(tx1, p.pts[k]!); ty0 = Math.min(ty0, p.pts[k + 1]!); ty1 = Math.max(ty1, p.pts[k + 1]!); }
tx0 -= 3; ty0 -= 3; tx1 += 3; ty1 += 3;
const X0 = (tx0 - ty1) * HW, X1 = (tx1 - ty0) * HW, Y0 = (tx0 + ty0) * HH, Y1 = (tx1 + ty1) * HH;
const W = Math.ceil((X1 - X0) * L), H = Math.ceil((Y1 - Y0) * L), tilePx = Math.hypot(HW, HH) * L;
const tileAt = (px: number, py: number) => { const X = (px + 0.5) / L + X0, Y = (py + 0.5) / L + Y0; return { x: (X / HW + Y / HH) / 2, y: (Y / HH - X / HW) / 2 }; };

// ---- the textures: the photos (tile space, wrapped, bilinear) or the Paint swatch with a little noise
/** the photo textures' files and sizes, read from grass-art.ts (the bundle loads no images) */
const PHOTOS = (() => {
  const src = readFileSync(resolve('src/game/grass-art.ts'), 'utf8'), files = new Map<string, string>(), out = new Map<string, { file: string; mix: number; tiles?: number }>();
  for (const m of src.matchAll(/import (\w+) from '\.\.\/assets\/ground\/([^']+)'/g)) files.set(m[1]!, m[2]!);
  for (const m of src.matchAll(/\{ tex: '(\w+)', src: (\w+), mix: ([\d.]+)(?:, px: \d+)?(?:, tiles: (\d+))? \}/g)) { const file = files.get(m[2]!); if (file) out.set(m[1]!, { file, mix: Number(m[3]), ...(m[4] ? { tiles: Number(m[4]) } : {}) }); }
  return out;
})();
type Tex = { data: Buffer; w: number; h: number; period: number } | { col: [number, number, number] };
const texes = new Map<string, Tex>();
const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
async function loadTex(name: string): Promise<Tex> {
  const e = PHOTOS.get(name);
  if (e) {
    const file = resolve('src/assets/ground', e.file);
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, w: info.width, h: info.height, period: e.mix ? (e.mix * 1.25) / 2 : e.tiles ?? 12 };
  }
  return { col: hex(PAINT_TEXES.find(t => t.id === name)?.col ?? '#808080') };
}
const hash = (x: number, y: number) => { let h = (Math.floor(x * 8) * 73856093) ^ (Math.floor(y * 8) * 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function sample(t: Tex, x: number, y: number, ang: number, s: number): [number, number, number] {
  if ('col' in t) { const n = 0.88 + 0.24 * hash(x, y); return [t.col[0] * n, t.col[1] * n, t.col[2] * n]; }
  const r = (-ang * Math.PI) / 180, u = (x * Math.cos(r) - y * Math.sin(r)) / s, v = (x * Math.sin(r) + y * Math.cos(r)) / s;
  const fu = ((((u / t.period) % 1) + 1) % 1) * t.w - 0.5, fv = ((((v / t.period) % 1) + 1) % 1) * t.h - 0.5;
  const i0 = Math.floor(fu), j0 = Math.floor(fv), a = fu - i0, b = fv - j0, px = (i: number, j: number) => (((j % t.h) + t.h) % t.h * t.w + (((i % t.w) + t.w) % t.w)) * 4;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const p00 = t.data[px(i0, j0) + c]!, p10 = t.data[px(i0 + 1, j0) + c]!, p01 = t.data[px(i0, j0 + 1) + c]!, p11 = t.data[px(i0 + 1, j0 + 1) + c]!;
    out[c] = (p00 * (1 - a) + p10 * a) * (1 - b) + (p01 * (1 - a) + p11 * a) * b;
  }
  return out;
}
/** an edge image sampled as drawImage stretches it (bilinear between px centres, clamped at its border): RGBA 0..1 */
function sampleImg(img: EdgeImage | null, bx: number, by: number, res: number, x: number, y: number): [number, number, number, number] {
  if (!img) return [0, 0, 0, 0];
  const fu = (x - bx) * res - 0.5, fv = (y - by) * res - 0.5;
  if (fu < -1 || fv < -1 || fu > img.W || fv > img.H) return [0, 0, 0, 0];
  const cl = (v: number, n: number) => Math.max(0, Math.min(n - 1, v)), i0 = Math.floor(fu), j0 = Math.floor(fv), a = fu - i0, b = fv - j0;
  const o: [number, number, number, number] = [0, 0, 0, 0];
  // premultiplied, as the canvas filters
  const P = (i: number, j: number) => { const q = (cl(j, img.H) * img.W + cl(i, img.W)) * 4, al = img.data[q + 3]! / 255; return [img.data[q]! / 255 * al, img.data[q + 1]! / 255 * al, img.data[q + 2]! / 255 * al, al]; };
  const p00 = P(i0, j0), p10 = P(i0 + 1, j0), p01 = P(i0, j0 + 1), p11 = P(i0 + 1, j0 + 1);
  for (let c = 0; c < 4; c++) o[c] = (p00[c]! * (1 - a) + p10[c]! * a) * (1 - b) + (p01[c]! * (1 - a) + p11[c]! * a) * b;
  if (o[3] > 1e-6) { o[0] /= o[3]; o[1] /= o[3]; o[2] /= o[3]; }
  return o;
}

async function main() {
  const names = new Set<string>(['grass']);
  for (const p of patches) { names.add(p.tex); if (p.paint!.b > 0) names.add(p.paint!.bt); }
  for (const n of names) texes.set(n, await loadTex(n));
  // the ground: the base grass
  const img = new Float32Array(W * H * 3);
  const pos: { x: number; y: number }[] = [];
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const t = tileAt(px, py), c = sample(texes.get('grass')!, t.x, t.y, 0, 1), k = (py * W + px) * 3;
    img[k] = c[0]; img[k + 1] = c[1]; img[k + 2] = c[2]; pos.push(t);
  }
  const res = edgeRes(L);
  for (const p of patches) {
    const st = p.paint!, look = mode === 'after' && st.e ? EDGE_LOOKS[st.e] : null;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (let k = 0; k < p.pts.length; k += 2) { bx0 = Math.min(bx0, p.pts[k]!); bx1 = Math.max(bx1, p.pts[k]!); by0 = Math.min(by0, p.pts[k + 1]!); by1 = Math.max(by1, p.pts[k + 1]!); }
    // the outline's distance, finely, for the hard clip edge (anti-aliased) and the border band
    const fine = 12, reachB = st.b + 1, fb = [Math.floor(bx0) - 2, Math.floor(by0) - 2, Math.ceil(bx1) + 2, Math.ceil(by1) + 2];
    const ff = edgeField(p.pts, fb[0]!, fb[1]!, fb[2]! - fb[0]!, fb[3]! - fb[1]!, fine, reachB);
    const dAt = (x: number, y: number) => { const u = Math.max(0, Math.min(ff.W - 1, Math.round((x - fb[0]!) * fine - 0.5))), v = Math.max(0, Math.min(ff.H - 1, Math.round((y - fb[1]!) * fine - 0.5))); return ff.d[v * ff.W + u]!; };
    let eb: [number, number, number, number] | null = null, im = null as ReturnType<typeof edgeImages> | null;
    if (look) {
      const feather = featherTiles(look, L), reach = edgeReach(look, feather);
      eb = edgeBox([bx0, by0, bx1, by1], [tx0, ty0, tx1, ty1].map(Math.round), reach);
      if (eb) im = edgeImages(edgeField(p.pts, eb[0], eb[1], eb[2] - eb[0], eb[3] - eb[1], res, reach, CELL), look, feather);
    }
    const fill = texes.get(p.tex)!, border = st.b > 0 ? texes.get(st.bt) : undefined, tone = st.t ? hex(st.tc ?? '#000000') : null;
    const ramp = look && st.b > 0 ? bandRamp(st.b, featherTiles(look, L)) : [];
    // EDGES_DEBUG=1: each area's texture, edge profile, border and which edge images it has
    if (process.env.EDGES_DEBUG) console.log(p.tex, st.e ?? 'crisp', `border ${st.b} ${st.bt}`, im ? Object.entries(im).map(([k, v]) => `${k}:${v ? 'yes' : '-'}`).join(' ') : '');
    for (let k = 0; k < W * H; k++) {
      const { x, y } = pos[k]!;
      if (x < fb[0]! || y < fb[1]! || x > fb[2]! || y > fb[3]!) continue;
      const q = k * 3, d = dAt(x, y), cover = Math.max(0, Math.min(1, d * tilePx + 0.5));
      // 1. the cast shadow on the ground under the area
      if (im?.shadow) { const s = sampleImg(im.shadow, eb![0], eb![1], res, x, y); for (let c = 0; c < 3; c++) img[q + c] = img[q + c]! * (1 - s[3]) + s[c]! * 255 * s[3]; }
      if (cover <= 0) continue;
      // 2. the area: fill, tone, border band (with its dark hairline when crisp)
      let col = sample(fill, x, y, st.a, st.s);
      if (tone) { const ta = st.ta ?? 0; col = col.map((v, c) => st.t === 1 ? v * (1 - ta) + (v * tone[c]!) / 255 * ta : v * (1 - ta) + (255 - ((255 - v) * (255 - tone[c]!)) / 255) * ta) as [number, number, number]; }
      if (border && st.bt !== 'kerb') {
        // soft: the band's inner edge in bandRamp's steps (coverage = the share of its strokes reaching this deep); crisp: a hard band and its dark hairline
        if (look) { const cov = ramp.filter(s => s.half >= d).length / ramp.length; if (cov > 0) { const bc = sample(border, x, y, st.ba ?? st.a, st.bs ?? st.s); col = col.map((v, c) => v * (1 - cov) + bc[c]! * cov) as [number, number, number]; } }
        else if (d < st.b + 0.04) col = d < st.b ? sample(border, x, y, st.ba ?? st.a, st.bs ?? st.s) : col.map(v => v * 0.72) as [number, number, number];
      }
      let a = cover;
      if (im) {
        const l = sampleImg(im.light, eb![0], eb![1], res, x, y), dk = sampleImg(im.dark, eb![0], eb![1], res, x, y), cut = sampleImg(im.cut, eb![0], eb![1], res, x, y);
        col = col.map((v, c) => { const s = 255 - ((255 - v) * (255 - LIGHT_RGB[c]!)) / 255; return v * (1 - l[3]) + s * l[3]; }) as [number, number, number];
        col = col.map((v, c) => v * (1 - dk[3]) + (v * DARK_RGB[c]!) / 255 * dk[3]) as [number, number, number];
        a *= 1 - cut[3];
      }
      for (let c = 0; c < 3; c++) img[q + c] = img[q + c]! * (1 - a) + col[c]! * a;
    }
  }
  const rgb = Buffer.alloc(W * H * 3);
  for (let k = 0; k < rgb.length; k++) rgb[k] = Math.max(0, Math.min(255, Math.round(img[k]!)));
  mkdirSync(dirname(out), { recursive: true });
  await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(out);
  console.log(`${mode}: ${out} (${W} x ${H} px, cache level ${L}, edge res ${res} px/tile, ${patches.length} areas)`);
}
main().catch(e => { console.error(e); process.exit(1); });

// T376 (#1032): how far each shop's and venue's picture reaches in front of its footprint, for the lot composer's setback (lots/base-pad.ts).
// The owner (2026-11-08): the commercial buildings stand on the pavement. A building's walls are its footprint, but the pictures of the shops also
// draw steps, door mats, planters, kerbs and bushes in front of the walls, and the composer let a footprint reach 0.3 tiles past the lot line, so
// the picture's base came out 0.5 to 1.5 m over the sidewalk. This measures the picture itself: the lowest opaque pixel of every column is a point on the
// ground (an awning or a sign above head height is drawn higher than its own ground point, so it never counts: the owner lets those cross), and
// the pad is how far those points go past the footprint polygon toward the camera, in three directions (the street on +y: road 0; on +x+y: road 1;
// on +x: road 2: only a street on the camera's side can have a picture's base drawn over it; the walls of the other roads are the footprint's).
// A straight-on picture (a screen-axis set member, an eight-view building's 8-degree view) stands on the turned square inside its world box (the
// composer's diag footprint), any other on its box.
//   node scripts/assets/base-pads.mjs [--write]        prints the table's summary; --write replaces src/game/lots/base-pad-data.ts
//   node scripts/assets/base-pads.mjs --check          exits 1 when the file differs from what the pictures measure now
// Needs the atlas pages (src/assets) and sharp. The metres are those of the library's boxes (a picture at scale 1).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'src/game/lots/base-pad-data.ts');
const write = process.argv.includes('--write'), check = process.argv.includes('--check');
const entry = `
import sharp from 'sharp';
import { LIBRARY, ATLAS_PAGES, ATLAS_SIZE } from './src/game/library';
import { axisViews, eightRingOf, sizeViews, sizeKey } from './src/game/lots/preset-art';
import { SHOP_PALETTE, VENUE_PALETTE } from './src/game/lots/variety';
import { lotPresets } from './src/game/lots/compose';
import { isBuilding } from './src/game/mirror';

const BY = new Map(LIBRARY.map(i => [i.id, i]));
const pages = new Map();
async function page(n) {
  let P = pages.get(n); if (P) return P;
  const { data, info } = await sharp(ATLAS_PAGES[n][0]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  P = { data, w: info.width }; pages.set(n, P); return P;
}
/** the ground points (metres from the anchor, at scale 1) of the lowest opaque pixel of each column of a picture */
async function groundPoints(it) {
  const [pg, u0, v0, u1, v1] = it.tex, P = await page(pg);
  const x0 = Math.round(Math.min(u0, u1) * ATLAS_SIZE), y0 = Math.round(v0 * ATLAS_SIZE), w = Math.round(Math.abs(u1 - u0) * ATLAS_SIZE), h = Math.round((v1 - v0) * ATLAS_SIZE), flip = u0 > u1;
  const rs = w / it.w, pts = [];
  for (let cx = 0; cx < w; cx++) {
    const x = flip ? w - 1 - cx : cx; let low = -1;
    for (let cy = h - 1; cy >= 0; cy--) if (P.data[((y0 + cy) * P.w + x0 + x) * 4 + 3] > 40) { low = cy; break; }
    if (low < 0) continue;
    const dx = cx / rs - it.ax, dy = (low + 1) / rs - it.ay;
    pts.push([(dx / 32 + dy / 16) / 2, (dy / 16 - dx / 32) / 2]);
  }
  return pts;
}
const STRAIGHT = /:yaw8[NESW]$/;
const S2 = Math.SQRT2;
async function pads(id) {
  const it = BY.get(id), pts = await groundPoints(it);
  const bx = it.boxes.map(b => [b.dx - b.hx, b.dx + b.hx, b.dy - b.hy, b.dy + b.hy]);
  const x0 = Math.min(...bx.map(b => b[0])), x1 = Math.max(...bx.map(b => b[1])), y0 = Math.min(...bx.map(b => b[2])), y1 = Math.max(...bx.map(b => b[3]));
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, diag = !!axisViews(id) || STRAIGHT.test(id);
  // the footprint polygon the composer stands the picture on, and its support in the three directions
  // (a straight-on picture's: the square the composer turns 45 degrees, its half diagonal the longer half side of the box: house-class.ts frameHalf)
  const D = Math.max(x1 - x0, y1 - y0) / 2;
  const poly = diag ? [[mx - D, my], [mx + D, my], [mx, my - D], [mx, my + D]] : [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const sup = d => Math.max(...poly.map(p => p[0] * d[0] + p[1] * d[1]));
  const dirs = [[0, 1], [1 / S2, 1 / S2], [1, 0]];
  const up = x => Math.ceil(Math.max(0, x) * 100 - 1e-9) / 100;
  return { diag, pads: dirs.map(d => up(Math.max(...pts.map(p => p[0] * d[0] + p[1] * d[1])) - sup(d))) };
}
// every picture a shop or venue lot can draw: the palettes' subjects and the buildings of the com and tour presets, each with its four views, its screen-axis set and its eight-view ring
const subjects = new Set([...SHOP_PALETTE, ...VENUE_PALETTE]);
for (const p of lotPresets()) if (p.use === 'com' || p.use === 'tour') for (const q of p.props) { const it = BY.get(q.id); if (it && isBuilding(it)) subjects.add(q.id); }
const ids = new Set();
for (const s of subjects) { for (const v of sizeViews(sizeKey(s))) ids.add(v); const ring = eightRingOf(s); if (ring) for (const v of ring) ids.add(v); ids.add(s); }
const rows = {};
for (const id of [...ids].filter(i => BY.has(i)).sort()) rows[id] = await pads(id);
const lines = Object.entries(rows).map(([id, r]) => '  ' + JSON.stringify(id) + ': [' + r.pads.map(v => v.toFixed(2)).join(', ') + '],' + (r.diag ? ' // straight-on' : ''));
export default { lines, count: Object.keys(rows).length, rows };
`;
const webpPaths = { name: 'webp-paths', setup(b) { b.onLoad({ filter: /\.webp$/ }, a => ({ contents: `export default ${JSON.stringify(a.path.split(String.fromCharCode(92)).join('/'))};`, loader: 'js' })); } };
const bundle = path.join(root, 'output/base-pads.bundle.mjs');
await build({ stdin: { contents: entry, resolveDir: root, loader: 'ts', sourcefile: 'base-pads-entry.ts' }, bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'error', external: ['sharp'], loader: { '.png': 'empty', '.jpg': 'empty', '.json': 'json' }, plugins: [webpPaths] });
const { default: res } = await import(pathToFileURL(bundle).href + '?t=' + Date.now());
const head = `// T376 (#1032): how far each shop's and venue's picture reaches past its footprint toward the camera, by picture id: [street on +y (road 0), on +x+y (road 1), on +x (road 2)],
// metres of the library's boxes (a picture at scale 1). GENERATED by scripts/assets/base-pads.mjs from the pictures' ground contact: do not edit by hand, run it
// again when a shop's art changes (\`node scripts/assets/base-pads.mjs --write\`; tests/street-base.test.ts fails when a shop picture has no row).
export const BASE_PAD: Readonly<Record<string, readonly [number, number, number]>> = {
`;
const text = head + res.lines.join('\n') + '\n};\n';
console.log(`${res.count} pictures measured`);
if (check) { const cur = existsSync(out) ? readFileSync(out, 'utf8') : ''; if (cur !== text) { console.log('base-pad-data.ts is out of date: run node scripts/assets/base-pads.mjs --write'); process.exit(1); } console.log('base-pad-data.ts is current'); }
else if (write) { writeFileSync(out, text); console.log('wrote ' + path.relative(root, out)); }
else {
  const big = Object.entries(res.rows).filter(([, r]) => Math.max(...r.pads) > 0.3).sort((a, b) => Math.max(...b[1].pads) - Math.max(...a[1].pads));
  console.log('pictures with a pad over 0.3 m:', big.length);
  for (const [id, r] of big.slice(0, 60)) console.log(id.padEnd(62), r.diag ? 'S' : 'C', r.pads.map(v => v.toFixed(2)).join(' '));
}

// Prepares the v2 mockup inputs from the capture-v2 PNGs (OUT of capture-v2.mjs, default E:/ClaudeTemp/ux/v2): the clean backgrounds as
// WebP in bg/ (they sit under overlays, so a lower quality), the "today" screens as WebP in docs/plans/P23-ux/ (t*.webp), and
// bg/cameras-v2.json (the cameras the mockups project their overlays with).
//   node docs/plans/P23-ux/mockups/prep-v2.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url)), IN = process.env.OUT || 'E:/ClaudeTemp/ux/v2', PLAN = path.resolve(HERE, '..');
const bg = [
  ['1600-start-bg', 'v2-start-1600'], ['1366-start-bg', 'v2-start-1366'],
  ['1600-wizard-shape-bg', 'v2-wizard-1600'], ['1366-wizard-shape-bg', 'v2-wizard-1366'],
  ['1600-built-17-bg', 'v2-built-17-1600'], ['1600-grown-17-bg', 'v2-grown-17-1600'],
  ['1600-grown-30-bg', 'v2-grown-30-1600'], ['1366-grown-30-bg', 'v2-grown-30-1366'], ['1600-green-30-bg', 'v2-green-30-1600'],
  ['1600-grown-10-bg', 'v2-grown-10-1600'],
];
for (const [from, to] of bg) {
  const f = path.join(IN, from + '.png'); if (!fs.existsSync(f)) { console.log('missing', from); continue; }
  await sharp(f).webp({ quality: 55, effort: 6 }).toFile(path.join(HERE, 'bg', to + '.webp'));
  console.log('bg', to, Math.round(fs.statSync(path.join(HERE, 'bg', to + '.webp')).size / 1024), 'KB');
}
const today = [
  ['1600-start-ui', 't01-start-today', 0], ['1600-wizard-shape-ui', 't02-wizard-today', 0], ['first/1600-wizard-shape-ui', 't03-range-plot-refused-today', 0],
  ['1366-wizard-shape-ui', 't04-wizard-1366-today', 0], ['1600-built-17-bg', 't05-growin-today', 0], ['1600-brush-30-ui', 't06-brush-today', 0],
  ['1600-wizard-next-30-ui', 't07-wizard-next-today', 0],
];
for (const [from, to] of today) {
  const f = path.join(IN, from + '.png'); if (!fs.existsSync(f)) { console.log('missing', from); continue; }
  await sharp(f).resize({ width: 1200 }).webp({ quality: 62, effort: 6 }).toFile(path.join(PLAN, to + '.webp'));
  console.log('today', to, Math.round(fs.statSync(path.join(PLAN, to + '.webp')).size / 1024), 'KB');
}
const cams = {};
for (const w of [1600, 1366]) { const f = path.join(HERE, 'bg', `v2-${w}.json`); if (fs.existsSync(f)) cams[w] = JSON.parse(fs.readFileSync(f, 'utf8')); }
fs.writeFileSync(path.join(HERE, 'bg', 'cameras-v2.json'), JSON.stringify(cams, null, 1));
console.log('cameras-v2.json written');

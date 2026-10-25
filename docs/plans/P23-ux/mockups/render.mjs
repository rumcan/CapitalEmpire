// Renders the P23 mockups beside this file to WebP in docs/plans/P23-ux/, in headless Chrome at dpr 1.
//   node docs/plans/P23-ux/mockups/render.mjs                 every v2-m*.html at 1600 x 900, and m1-m3 also at 1366 x 768
//   node docs/plans/P23-ux/mockups/render.mjs v2-m2-new-hole  one page (both sizes when it has a 1366 version)
//   node docs/plans/P23-ux/mockups/render.mjs --v1            v1's pages (v1-m*.html) into docs/plans/P23-ux/v1/
// The backgrounds in bg/ are the real game with its UI hidden (capture-v2.mjs; cameras in cameras-v2.js), so the overlays sit on the
// real iso grid. Icons and building art come from src/assets.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url)), OUT = path.resolve(HERE, '..');
const args = process.argv.slice(2), v1 = args.includes('--v1'), names0 = args.filter(a => !a.startsWith('--'));
const LAPTOP = new Set(['v2-m1-start', 'v2-m2-new-hole', 'v2-m3-brush']);
const names = names0.length ? names0 : fs.readdirSync(HERE).filter(f => (v1 ? /^v1-m\d.*\.html$/ : /^v2-m\d.*\.html$/).test(f)).map(f => f.replace('.html', ''));
const browser = await chromium.launch({ channel: process.env.CH || 'chrome', headless: true });
const errs = [];
for (const n of names) {
  for (const [w, h] of (LAPTOP.has(n) ? [[1600, 900], [1366, 768]] : [[1600, 900]])) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
    page.on('pageerror', e => errs.push(`${n}@${w}: ${e}`));
    page.on('console', m => { if (m.type() === 'error') errs.push(`${n}@${w}: ${m.text()}`); });
    await page.goto(pathToFileURL(path.join(HERE, n + '.html')).href + (w === 1366 ? '?w=1366' : ''));
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
    const png = await page.screenshot();
    const out = v1 ? path.join(OUT, 'v1', n.replace(/^v1-/, '') + '.webp') : path.join(OUT, n + (w === 1366 ? '-1366' : '') + '.webp');
    await sharp(png).webp({ quality: 66, effort: 6 }).toFile(out);
    console.log(path.basename(out), Math.round(fs.statSync(out).size / 1024), 'KB');
    if (process.env.PNG) fs.writeFileSync(path.join(process.env.PNG, path.basename(out).replace('.webp', '.png')), png);
    await page.close();
  }
}
if (errs.length) { console.log('ERRORS\n' + errs.join('\n')); process.exitCode = 1; }
await browser.close();

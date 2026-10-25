// Renders the P23 mockups (m*.html beside this file) to WebP in docs/plans/P23-ux/, 1600 x 900 at dpr 1, in headless Chrome.
//   node docs/plans/P23-ux/mockups/render.mjs [m1-start ...]   (no names: every m*.html)
// The backgrounds in bg/ are the real game with its UI hidden (a new range game, a generated hole grown in; cameras in bg/cameras.json),
// so the overlays sit on the real iso grid. Icons and building art come from src/assets.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url)), OUT = path.resolve(HERE, '..');
const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(HERE).filter(f => /^m\d.*\.html$/.test(f)).map(f => f.replace('.html', ''));
const browser = await chromium.launch({ channel: process.env.CH || 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
for (const n of names) {
  await page.goto(pathToFileURL(path.join(HERE, n + '.html')).href);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  const png = await page.screenshot();
  await sharp(png).webp({ quality: 66, effort: 6 }).toFile(path.join(OUT, n + '.webp'));
  console.log(n, Math.round(fs.statSync(path.join(OUT, n + '.webp')).size / 1024), 'KB');
}
if (errs.length) { console.log('ERRORS\n' + errs.join('\n')); process.exitCode = 1; }
await browser.close();

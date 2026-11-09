// T384 (#1040): the desert litter's sheets as pictures (desert-litter.ts draws them with the canvas; they are stand-ins, listed in docs/GOLF-SPRITES.md): the leaf sprite sheet (48 cells), the lots' leaf decals, the map decals and
// the nature patches, each on a grass-coloured ground with its autumn original beside it (the real assets, drawn from the dev server), and the same litter laid as the ground bake lays it at 30% (a pile, a drift and a scatter).
//   node scripts/dev/desert-litter-sheets.mjs --base http://localhost:5187/ --out E:/ClaudeTemp/T384
// Needs a dev server (vite) on --base. A blank page on its origin imports the game's modules; one headless Edge, closed when done. Exit 1 on a page error.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5187/'), out = opt('out', 'output/desert-litter');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let bad = 0;
try {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 800 } })).newPage();
  page.on('pageerror', e => { bad++; console.log('[pageerror]', e.message); });
  page.on('console', m => { if (m.type() === 'error') { bad++; console.log('[console]', m.text().slice(0, 300)); } });
  await page.route(`${base}blank.html`, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"></body></html>' }));
  await page.goto(`${base}blank.html`);
  const sheets = await page.evaluate(async () => {
    const [lit, art, lots, nat, tex] = await Promise.all([import('/src/game/desert-litter.ts'), import('/src/game/ground-art.ts'), import('/src/game/lot-decals.ts'), import('/src/game/nature-patches.ts'), import('/src/game/canvas2d.ts')]);
    const load = async url => { const b = await (await fetch(url)).blob(); return createImageBitmap(b); };
    const urls = { leaves: '/src/assets/ground/leaves.webp', lot: '/src/assets/ground/lot-decals.webp', decals: '/src/assets/ground/decals.webp', nature: '/src/assets/ground/nature.webp' };
    const autumn = Object.fromEntries(await Promise.all(Object.entries(urls).map(async ([k, u]) => [k, await load(u)])));
    const desert = { leaves: lit.desertLeafSheet(), lot: lit.desertLotDecals(), decals: lit.desertMapDecals(), nature: lit.desertNature() };
    /** a picture of the sheet on a grass-coloured backdrop, scaled k times, the autumn one above and the desert one below */
    const sheet = (a, d, k, w = a.width, h = Math.max(a.height, d.height)) => {
      const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round((h * 2 + 8) * k); const g = c.getContext('2d'); g.imageSmoothingEnabled = k < 1;
      g.fillStyle = '#5a6a3c'; g.fillRect(0, 0, c.width, c.height); g.drawImage(a, 0, 0, a.width * k, a.height * k); g.drawImage(d, 0, (h + 8) * k, d.width * k, d.height * k); return c.toDataURL('image/png');
    };
    // the litter as the lots' decals and the leaf pictures are laid: a few of each over a sandy ground at a close zoom, the desert's pictures drawn at their own size
    const lay = (() => {
      const c = document.createElement('canvas'); c.width = 1400; c.height = 520; const g = c.getContext('2d'); g.fillStyle = '#c7a06a'; g.fillRect(0, 0, c.width, c.height);
      const leafDecals = lots.LOT_DECALS.filter(d => d.group === 'leaves'); let x = 10, y = 10, rowH = 0;
      for (const d of leafDecals) { if (x + d.w > 1390) { x = 10; y += rowH + 8; rowH = 0; } g.drawImage(desert.lot, d.x, d.y, d.w, d.h, x, y, d.w, d.h); x += d.w + 8; rowH = Math.max(rowH, d.h); }
      return c.toDataURL('image/png');
    })();
    const tiny = (() => { // each leaf sprite cell at the sizes the ground bake draws it (0.11 to 0.65 m, 45 px a metre, at the closest zoom 0.3: 1.5 to 9 px), rotated, over sand and over road
      const c = document.createElement('canvas'); c.width = 1400; c.height = 330; const g = c.getContext('2d'); g.imageSmoothingEnabled = true;
      for (const [row, bg] of [[0, '#c7a06a'], [1, '#4a4a52']]) { g.fillStyle = bg; g.fillRect(0, row * 165, 1400, 165); }
      let k = 0;
      for (let row = 0; row < 2; row++) for (let size = 1; size <= 9; size += 1) for (let i = 0; i < art.LEAVES.length; i += 3) {
        const l = art.LEAVES[i], sz = size * 4; const x = 20 + (k++ % 62) * 22, y = 20 + row * 165 + ((size - 1) * 15);
        g.save(); g.translate(x, y); g.rotate(i); g.drawImage(desert.leaves, (l.i % art.LEAF_COLS) * art.LEAF_CELL, Math.floor(l.i / art.LEAF_COLS) * art.LEAF_CELL, art.LEAF_CELL, art.LEAF_CELL, -sz / 2, -sz / 2, sz, sz); g.restore();
      }
      return c.toDataURL('image/png');
    })();
    void tex; void nat;
    return { leaves: sheet(autumn.leaves, desert.leaves, 3), lot: sheet(autumn.lot, desert.lot, 0.6, autumn.lot.width, 460), decals: sheet(autumn.decals, desert.decals, 0.7), nature: sheet(autumn.nature, desert.nature, 0.34), laid: lay, tiny };
  });
  for (const [k, v] of Object.entries(sheets)) { const f = join(out, `sheet-${k}.png`); writeFileSync(f, Buffer.from(v.split(',')[1], 'base64')); console.log(f); }
} finally { await browser.close(); }
console.log(bad ? `${bad} problem(s)` : 'ok');
process.exit(bad ? 1 : 0);

// Capture the car paint audit sheets (T236): the dev page ?carpaint=audit (src/game/dev/car-paint-audit.ts) for each set (a car model's eight
// headings in every paint, or the other vehicles' views) at each zoom, as JPGs; --x2 also captures at 2x (the same zoom on a 2x screen).
//   node scripts/dev/car-paint-audit.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T236 [--sets burgundy-wagon,navy-wood-panel-wagon,views]
//     [--zooms 0.3,0.15] [--q "&all=1"] [--tag -before] [--x2]
// Needs a dev server (vite) on --base. One headless Edge, closed when done.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/car-paint-audit'), extra = opt('q', ''), tag = opt('tag', '');
const sets = opt('sets', 'burgundy-wagon,navy-wood-panel-wagon').split(','), zooms = opt('zooms', '0.3,0.15').split(',').map(Number);
const dprs = args.includes('--x2') ? [1, 2] : [1];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
try {
  for (const dpr of dprs) {
    const ctx = await browser.newContext({ viewport: { width: 1800, height: 1400 }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('[pageerror]', e.message));
    for (const set of sets) for (const z of zooms) {
      await page.goto(`${base}?carpaint=audit&set=${set}&z=${z}${extra}`);
      await page.waitForFunction(() => window.__carAudit?.ready || window.__carAudit?.error, null, { timeout: 120000 });
      const st = await page.evaluate(() => window.__carAudit);
      if (st.error) { console.log(set, z, 'error', st.error); continue; }
      const png = await page.locator('#root > div').screenshot({ type: 'png' });
      const file = join(out, `audit-${set}-${Math.round(z * 100)}pct${dpr === 2 ? '-2x' : ''}${tag}.png`);
      await sharp(png).png().toFile(file);
      console.log(file, `${st.rows.length} rows`);
    }
    await ctx.close();
  }
} finally { await browser.close(); }

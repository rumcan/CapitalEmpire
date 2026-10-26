// Capture the shadow audit sheets (T141): every page of every category of the dev page ?shadows=audit (src/game/dev/shadow-audit.ts), at the
// closest zoom (30%) on a 1x screen and at 2x (the same zoom on a 2x screen: every sprite at twice the pixels), as JPGs about 1600 px wide.
//   node scripts/dev/shadow-audit.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T141/before [--cats trees,poles] [--scales 1,2] [--measure]
// Needs a dev server (vite) on --base. One headless Edge at a time, closed when done.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/shadow-audit');
const cats = opt('cats', 'trees,poles,props,golf,range,vehicles,walkers,buildings,fences').split(','), scales = opt('scales', '1,2').split(',').map(Number);
const only = opt('pages', ''), measure = args.includes('--measure');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
try {
  for (const dpr of scales) {
    const ctx = await browser.newContext({ viewport: { width: 1600 / dpr, height: Math.ceil(3700 / dpr) }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('[pageerror]', e.message));
    for (const cat of cats) {
      let pages = 1;
      for (let n = 0; n < pages; n++) {
        if (only && !only.split(',').includes(String(n))) { if (n === 0) { /* still learn the page count */ } else continue; }
        const url = `${base}?shadows=audit&cat=${cat}&page=${n}&w=${1600 / dpr}${measure && n === 0 && dpr === 1 ? '&measure=1' : ''}`;
        await page.goto(url);
        await page.waitForFunction(() => window.__shadowAudit?.ready || window.__shadowAudit?.error, null, { timeout: 120000 });
        const st = await page.evaluate(() => window.__shadowAudit);
        if (st.error) { console.log(cat, n, 'error', st.error); break; }
        pages = st.pages;
        if (measure && st.measure) writeFileSync(join(out, `measure-${cat}.json`), JSON.stringify(st.measure));
        if (dpr === 1) writeFileSync(join(out, `items-${cat}-${n}.json`), JSON.stringify(st.items));
        if (only && !only.split(',').includes(String(n))) continue;
        const png = await page.locator('#root > div').screenshot({ type: 'png' });
        const file = join(out, `${cat}-${String(n).padStart(2, '0')}-${dpr === 1 ? '30pct' : '2x'}.jpg`);
        await sharp(png).jpeg({ quality: 80, mozjpeg: true }).toFile(file);
        console.log(file, `${st.items.length} items`, st.soft ? `(${st.soft} cells soft)` : '');
      }
    }
    await ctx.close();
  }
} finally { await browser.close(); }

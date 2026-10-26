// In-game shots of the shadows before and after T142 (the gear menu's "Drawn shadows" off and on): the range start (its bays, shop,
// leaderboard and caravan), a course hole and a town street (the old start), at the closest zoom (30%) and at 15%, on a 1x and a 2x screen.
//   node scripts/dev/shadow-shots.mjs --base http://127.0.0.1:5188/ --out E:/ClaudeTemp/T142/game [--dpr 1,2]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5188/'), out = opt('out', 'output/shadow-shots'), dprs = opt('dpr', '1,2').split(',').map(Number);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const settle = async (page, ms = 2500) => {
  await page.waitForTimeout(ms);
  // the ground bakes and the atlas streams: wait until no chunk is pending, at most 20 s
  await page.waitForFunction(() => { const g = window.__game; return !g || !g.ground?.pending || g.ground.pending() === 0; }, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
};
try {
  for (const dpr of dprs) {
    for (const start of ['range', 'town']) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
      const page = await ctx.newPage();
      page.on('pageerror', e => console.log('[pageerror]', e.message));
      await page.goto(`${base}?start=${start}&stamp=0`);
      await page.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
      // the views: [name, how to put the camera there]
      const views = start === 'range'
        ? [['range', () => { const g = window.__game, d = g.bizDefs.find(b => b.type === 'range'); if (d) g.lookAt(d.x + d.w / 2, d.y + d.h / 2, 0.3); }]]
        : [['street', () => { const g = window.__game; g.cam.z = 0.3; g.emit?.(); }], ['hole', () => { const g = window.__game; g.goToHole(1); g.cam.z = 0.3; }]];
      for (const [name, place] of views) {
        await page.evaluate(place);
        for (const z of [0.3, 0.15]) {
          await page.evaluate(z => { const g = window.__game; g.cam.z = z; g.clampCam(); g.emit?.(); }, z);
          for (const on of [false, true]) {
            await page.evaluate(on => window.__game.setVectorShadows(on), on);
            await settle(page);
            const png = await page.screenshot({ type: 'png' });
            const file = join(out, `${name}-${Math.round(z * 100)}pct-${dpr}x-${on ? 'after' : 'before'}.jpg`);
            await sharp(png).jpeg({ quality: 82, mozjpeg: true }).toFile(file);
            console.log(file);
          }
        }
      }
      await ctx.close();
    }
  }
} finally { await browser.close(); }

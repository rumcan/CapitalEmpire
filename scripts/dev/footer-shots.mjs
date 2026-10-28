// T250 (#721): in-game shots of the rail split in two: the course drawer on the left and the town footer along the bottom, golf (a range start,
// its guide card at the lower right) and the classic town game, at 1366 and 1920 px (and 2560); a footer flyout opening upward with its side
// levels (Traffic ▸ Roads ▸ Build); the footer beside the range card and the guide card (compact at 1366); 125% UI on 1366 with the range card.
// Each shot prints where the footer stands and whether it overlaps the minimap or a bottom card.
//   node scripts/dev/footer-shots.mjs --base http://127.0.0.1:5187/ --out E:/ClaudeTemp/T250
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/footer-shots');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save = async (buf, name) => { const file = join(out, `${name}.jpg`); await sharp(buf).jpeg({ quality: 86, mozjpeg: true }).toFile(file); console.log(file); return file; };
/** the footer's box, its form, and what it overlaps (the minimap, the bottom cards, the hint bar) */
const report = page => page.evaluate(() => {
  const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? b : null; };
  const f = r('[data-testid="rail-footer"]'); if (!f) return { footer: null };
  const hit = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const others = { minimap: r('[data-testid="minimap"]'), guide: r('[data-testid="range-guide"]'), leaderboard: r('[data-testid="leaderboard"]'), rangeCard: r('[data-testid="range-card"]'), toolPanel: r('[data-testid="tool-panel"]') };
  return { footer: { x: Math.round(f.left), y: Math.round(f.top), w: Math.round(f.width), h: Math.round(f.height), compact: document.querySelector('[data-testid="rail-footer"]').dataset.compact }, overlaps: Object.entries(others).filter(([, b]) => hit(f, b)).map(([k]) => k), lifted: [...document.querySelectorAll('[data-foot-lift]')].map(e => e.dataset.testid) };
});
async function open(url, W, H, scale = 1) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(s => { try { localStorage.clear(); localStorage.setItem('capitalempire.uiScale', String(s)); } catch { /* none */ } }, scale);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.setSpeed(0); g.closeWelcome?.(false); g.emit(); });
  await page.waitForFunction(() => window.__game.ground?.busy === 0, null, { timeout: 60000, polling: 250 }).catch(() => console.log('  (ground busy)'));
  await sleep(1500);
  return { ctx, page };
}
const shot = async (page, name) => { await page.mouse.move(5, 300); await sleep(300); await save(await page.screenshot({ type: 'png' }), name); console.log('  ', JSON.stringify(await report(page))); };

try {
  for (const [W, H] of [[1366, 768], [1920, 1080]]) {
    // golf: a range start (its guide card at the lower right), every tool open (the dev sandbox)
    {
      const { ctx, page } = await open('?start=range', W, H);
      await shot(page, `golf-${W}`);
      // a footer flyout upward with its side levels: Traffic ▸ Roads ▸ Build ▸ the classes
      await page.click('[data-rail="traffic"]'); await sleep(300);
      await page.click('[data-flyout-col="0"] [data-key="roads"]'); await sleep(250);
      await page.click('[data-flyout-col="1"] [data-key="build"]'); await sleep(350);
      await page.mouse.move(5, 300); await sleep(200);
      await save(await page.screenshot({ type: 'png' }), `footer-flyout-${W}`);
      await page.keyboard.press('Escape'); await sleep(200);
      // the footer beside the range card and the guide card (the guide card moves left of the range card)
      await page.evaluate(() => { const g = window.__game; g.openRangeCard(true); g.emit(); }); await sleep(600);
      await shot(page, `footer-range-guide-${W}`);
      await ctx.close();
    }
    // the classic town game
    {
      const { ctx, page } = await open('?start=valley', W, H);
      await shot(page, `classic-${W}`);
      await page.click('[data-rail="towndecor"]'); await sleep(300);
      await page.click('[data-flyout-col="0"] [data-key="paint"]'); await sleep(250);
      await page.click('[data-flyout-col="1"] [data-key="materials"]'); await sleep(350);
      await page.mouse.move(5, 300); await sleep(200);
      await save(await page.screenshot({ type: 'png' }), `classic-flyout-${W}`);
      await ctx.close();
    }
  }
  // 2560 golf, and 125% UI on a 1366 screen with the range card open (the footer moves aside, or the cards move up)
  { const { ctx, page } = await open('?start=range', 2560, 1440); await shot(page, 'golf-2560'); await ctx.close(); }
  {
    const { ctx, page } = await open('?start=range', 1366, 768, 1.25);
    await shot(page, 'golf-1366-ui125');
    await page.evaluate(() => { const g = window.__game; g.openRangeCard(true); g.emit(); }); await sleep(600);
    await shot(page, 'footer-range-guide-1366-ui125');
    await ctx.close();
  }
} finally {
  await browser.close();
}

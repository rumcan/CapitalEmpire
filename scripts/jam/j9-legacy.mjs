// J9 (#1268): the Buy path of a game from before J9. ?pick=0 starts the automatic start (the old range for sale), the save is made, the page reloads into it
// (no ?pick=0: a save loads as it was) and Buy ($15,000) opens the range. Needs a jam dev server (--base) or a jam build (dist-jam, served here).
//   node scripts/jam/j9-legacy.mjs [--base http://127.0.0.1:5392/]
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
let server = null, base = opt('base', '');
if (!base) {
  const port = await new Promise(res => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
  server = await preview({ root: resolve('.'), logLevel: 'error', build: { outDir: 'dist-jam' }, preview: { port, strictPort: true, host: '127.0.0.1' } });
  base = `http://127.0.0.1:${port}/`;
}
const errors = []; let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('__j9')) { localStorage.clear(); indexedDB.deleteDatabase?.('ce'); sessionStorage.setItem('__j9', '1'); } } catch { /* none */ } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/favicon|404/.test(t)) errors.push(`console: ${t.slice(0, 300)}`); });
const st = () => page.evaluate(() => { const g = window.__game, b = g.golf?.range; return { picking: !!g.startPick, money: Math.round(g.money), built: b?.built !== false, forSale: !!b?.forSale, owned: b?.owned ?? [], junk: b?.junk?.length ?? 0, balls: b?.balls?.clean ?? null, scene: !!g.range?.scene, tour: !!g.tourView(), step1: g.tourView()?.lines?.[0]?.step?.body?.slice(0, 60) ?? null }; });
try {
  await page.goto(base + '?pick=0', { waitUntil: 'domcontentloaded', timeout: 240000 });
  if (await page.locator('[data-testid="title-card"]').waitFor({ timeout: 20000 }).then(() => true, () => false)) await page.locator('[data-testid="title-new"]').click();
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 });
  const who = page.locator('button', { hasText: "That's me" }); await who.waitFor({ timeout: 60000 }); await who.click();
  await page.waitForFunction(() => window.__game.golf?.range?.forSale === true, null, { timeout: 60000 });
  let s = await st(); console.log('?pick=0 start', JSON.stringify(s));
  check(!s.picking && s.built && s.forSale && s.money === 75000 && s.junk === 9, 'a ?pick=0 game starts as before: the old range laid and for sale, $75,000, nine piles of junk');
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__game?.ready, null, { timeout: 240000 }); await page.waitForTimeout(3000);
  s = await st(); console.log('after reload', JSON.stringify(s));
  check(!s.picking && s.built && s.forSale && s.money === 75000, 'the save loads as it was: no pick, the range still for sale, $75,000');
  const tourText = await page.evaluate(() => { const g = window.__game, t = g.tourView(); return t ? t.lines.find(l => l.current)?.step.body ?? null : null; });
  console.log('tutorial step 1:', tourText?.slice(0, 90));
  check(!tourText || /for sale/.test(tourText), "the tutorial's first step says the range is for sale (a game from before)");
  const bought = await page.evaluate(() => window.__game.buyRange()); await page.waitForTimeout(800);
  s = await st(); console.log('after Buy', JSON.stringify(s));
  check(bought && !s.forSale && s.money === 60000 && s.owned.includes('attendant') && s.balls === 800, 'Buy: $15,000, the kit, 800 balls, no longer for sale (as the start now does at its click)');
} finally { await browser.close().catch(() => {}); if (server) { await server.close?.().catch?.(() => {}); server.httpServer?.close?.(); } }
console.log(`${errors.length} console errors`); for (const e of errors) console.log('  ' + e);
process.exit(bad || errors.length ? 1 : 0);

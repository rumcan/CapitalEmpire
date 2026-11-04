// T326 (#926): your cart, as the game draws it: brought to the first tee at the round's start (its "Your cart" label), the edge marker pointing
// to it once you are at your ball down the fairway (and the round bar's Cart button), then called (key C) and arriving beside you.
//   node scripts/dev/cart-shots.mjs --base http://127.0.0.1:5186/ --out F:/ClaudeTemp/T326 --headed
// Needs a dev server (vite) on --base. One Edge (--headed opens it off-screen, never over the owner's game), closed when done; saves are not written.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/cart-shots'), W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: !args.includes('--headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', ...(args.includes('--headed') ? ['--window-position=-32000,-32000', '--window-size=1366,860', '--no-startup-window-focus'] : [])] });
const log = (...a) => console.log(...a);
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); g.setSpeed(1); });
  await settle(page, 1500);
  await page.waitForFunction(() => !!window.__game?.you && !!window.__game?.youCart, null, { timeout: 90000 }).catch(() => log('no character or cart'));
  const cart = () => page.evaluate(() => { const g = window.__game, c = g.youCart, y = g.you; return { cart: { x: +c.x.toFixed(1), y: +c.y.toFixed(1), moving: c.moving }, you: { x: +y.x.toFixed(1), y: +y.y.toFixed(1) }, d: +Math.hypot(c.x - y.x, c.y - y.y).toFixed(1), far: g.youCartFar() }; });
  log('start', JSON.stringify(await cart()));

  // 1. the round starts: the cart is brought to the first tee (parked off the tee box), "Your cart" over it
  await page.waitForFunction(() => !!window.__game.yrView(), null, { timeout: 60000 }).catch(() => log('no course view'));
  await page.evaluate(() => window.__game.yourRoundStart('all'));
  await page.evaluate(() => window.__game.yourJump());
  await page.evaluate(() => { const g = window.__game, c = g.youCart, y = g.you; g.lookAt((c.x + y.x) / 2, (c.y + y.y) / 2, 0.3); });
  await settle(page, 800);
  log('at the tee', JSON.stringify(await cart()));
  await page.screenshot({ path: join(out, '1-cart-by-first-tee.png') });

  // 2. the drive, then Jump to ball: the cart is left at the tee, off screen: the edge marker and the Cart button
  await page.evaluate(() => window.__game.ownerSwing({ power: 0.95, acc: 0.5, boost: 0 }));
  await page.waitForFunction(() => !window.__game.yourRoundView()?.flying, null, { timeout: 15000 }).catch(() => log('still flying'));
  await page.evaluate(() => window.__game.yourJump());
  await page.evaluate(() => { const g = window.__game, y = g.you; g.lookAt(y.x, y.y, 0.3); });
  await settle(page, 800);
  log('at the ball', JSON.stringify(await cart()));
  await page.screenshot({ path: join(out, '2-edge-marker-and-cart-button.png') });

  // 3. C: the cart drives itself to you (a frame on the way, one when it is here)
  await page.keyboard.press('c');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const g = window.__game, c = g.youCart, y = g.you; g.lookAt((c.x + y.x) / 2, (c.y + y.y) / 2, 0.22); });
  await page.waitForTimeout(400);
  log('called', JSON.stringify(await cart()));
  await page.screenshot({ path: join(out, '3-cart-coming.png') });
  await page.waitForFunction(() => !window.__game.youCart.moving, null, { timeout: 40000 }).catch(() => log('cart still driving'));
  await page.evaluate(() => { const g = window.__game, y = g.you; g.lookAt(y.x, y.y, 0.3); });
  await settle(page, 600);
  log('arrived', JSON.stringify(await cart()), 'near', await page.evaluate(() => window.__game.youNearCart()));
  await page.screenshot({ path: join(out, '4-cart-arrived.png') });
} finally { await browser.close(); }

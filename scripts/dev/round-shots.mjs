// T317 (#903): your own round, as the game draws it (a headless Edge on the dev server, the old start's course, ?start=town): in your golf cart, the
// first tee's hole choice, the address (the snap) with the shot panel, the ball in flight, walking to your ball (a frame strip), Jump to ball, and the
// scorecard between holes.
//   node scripts/dev/round-shots.mjs --base http://127.0.0.1:5187/ --out F:/ClaudeTemp/T317
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/round-shots'), W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: !args.includes('--headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
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
  await page.waitForFunction(() => !!window.__game?.you && !!window.__game?.youCart, null, { timeout: 60000 }).catch(() => log('no character or cart'));
  await page.evaluate(() => { const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); g.setSpeed(1); });
  await settle(page, 1500);
  const state = () => page.evaluate(() => {
    const g = window.__game, y = g.you, c = g.youCart, r = g.yourRound(), f = (v) => +v.toFixed(2);
    return { you: y && { x: f(y.x), y: f(y.y), moving: y.moving }, cart: c && { x: f(c.x), y: f(c.y), in: g.youInCart, moving: c.moving }, choices: g.yourChoices().why ?? g.yourChoices().options.map(o => o.label).join('|'),
      round: r && { at: r.at, ball: { x: f(r.ball.x), y: f(r.ball.y) }, lie: r.lie, holed: r.holed, over: r.over, card: r.card.map(c => c.done ? c.strokes : '-').join(' ') }, shot: !!g.shotState(), card: g.yrCard };
  });
  log('start', JSON.stringify(await state()));
  const scr = (x, y) => page.evaluate(([x, y]) => { const g = window.__game, s = g.screen(x, y); return { x: s.x / g.dpr, y: s.y / g.dpr }; }, [x, y]);
  const click = async (x, y) => { const p = await scr(x, y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(120); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(120); };
  const tee1 = await page.evaluate(() => { const t = window.__game.golf.tees.find(t => t.hole === 1); return t && { x: t.x, y: t.y }; });
  log('tee 1', JSON.stringify(tee1));

  // 1. the cart: walk to it, get in (E), drive toward the first tee with the keys, a frame or two on the way
  await page.evaluate(() => { const g = window.__game, c = g.youCart; g.you.x = c.x - 1.5; g.you.y = c.y; g.youMe(); g.cam.z = 0.3; g.emit(); });
  await settle(page, 800);
  await page.screenshot({ path: join(out, '1-cart-parked.png') });
  await page.keyboard.press('e'); await page.waitForTimeout(300);
  log('in cart', JSON.stringify(await state()));
  const drive = [];
  if (tee1) {
    await click(tee1.x + 6, tee1.y + 6); // a click drives the cart there (a route on the paths, kept off the greens)
    for (let k = 0; k < 4; k++) { await page.waitForTimeout(1500); const f = join(out, `2-drive-${k}.png`); await page.screenshot({ path: f }); drive.push(f); }
    log('driving', JSON.stringify(await state()));
    await page.evaluate(() => { window.__game.youSkip(); });
    await page.waitForTimeout(2500);
  }
  // a frame strip of the drive
  if (drive.length) {
    const tiles = await Promise.all(drive.map(f => sharp(f).extract({ left: W / 2 - 300, top: H / 2 - 190, width: 600, height: 380 }).toBuffer()));
    await sharp({ create: { width: 600 * tiles.length, height: 380, channels: 3, background: '#000' } }).composite(tiles.map((b, i) => ({ input: b, left: i * 600, top: 0 }))).png().toFile(join(out, 'strip-drive.png'));
  }
  // 2. out of the cart at the first tee, its card: the hole choice
  await page.keyboard.press('e'); await page.waitForTimeout(300);
  if (tee1) await click(tee1.x, tee1.y);
  await page.waitForTimeout(6000);
  await page.evaluate(() => { const g = window.__game; if (!g.youTeeOpen) { g.youTeeOpen = true; g.emit(); } });
  await page.waitForSelector('[data-testid=tee-play]', { timeout: 10000 }).catch(() => log('no tee choice'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, '3-first-tee-choice.png') });
  await page.click('[data-testid=tee-play-pick]').catch(() => log('no pick'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, '3b-pick-holes.png') });
  await page.click('text=Back').catch(() => {});
  await page.click('[data-testid=tee-play-all]').catch(() => log('no play all'));
  await page.waitForTimeout(800);
  log('round', JSON.stringify(await state()));
  // 3. the snap: walk up to the tee (or Jump to ball)
  await page.waitForFunction(() => !!window.__game.shotState(), null, { timeout: 15000 }).catch(async () => { log('no snap by walking: jump'); await page.click('[data-testid=you-jump]').catch(() => log('no jump')); });
  await page.waitForTimeout(800);
  await settle(page, 500);
  await page.screenshot({ path: join(out, '4-address-tee.png') });
  // 4. the swing (the meter's outcome straight in) and the ball in flight
  await page.evaluate(() => window.__game.ownerSwing({ power: 0.97, acc: 0.01, boost: 0.02 }));
  await page.waitForTimeout(1300);
  await page.screenshot({ path: join(out, '5-ball-flight.png') });
  await page.waitForFunction(() => !window.__game.yourRoundView()?.flying, null, { timeout: 15000 }).catch(() => log('still flying'));
  await page.waitForTimeout(500);
  log('after drive', JSON.stringify(await state()));
  // 5. walking to the ball: a click on it, frames on the way
  const ball = await page.evaluate(() => window.__game.yourRound().ball);
  await page.evaluate(() => { const g = window.__game; g.cam.z = 0.24; g.emit(); });
  await click(ball.x, ball.y);
  const walk = [];
  for (let k = 0; k < 4; k++) { await page.waitForTimeout(1600); const f = join(out, `6-walk-${k}.png`); await page.screenshot({ path: f }); walk.push(f); }
  const tiles = await Promise.all(walk.map(f => sharp(f).extract({ left: W / 2 - 300, top: H / 2 - 190, width: 600, height: 380 }).toBuffer()));
  await sharp({ create: { width: 600 * tiles.length, height: 380, channels: 3, background: '#000' } }).composite(tiles.map((b, i) => ({ input: b, left: i * 600, top: 0 }))).png().toFile(join(out, 'strip-walk-to-ball.png'));
  log('walking', JSON.stringify(await state()));
  // 6. Jump to ball: the address there
  if (!(await page.evaluate(() => !!window.__game.shotState()))) await page.click('[data-testid=you-jump]').catch(() => log('no jump'));
  await page.waitForTimeout(600); await settle(page, 400);
  await page.screenshot({ path: join(out, '7-address-jump.png') });
  // 7. the caddie finishes the hole: the scorecard
  await page.evaluate(() => window.__game.ownerCaddie());
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, '8-scorecard.png') });
  log('holed', JSON.stringify(await state()));
  await page.click('[data-testid=round-next]').catch(() => log('no next'));
  await page.waitForTimeout(600);
  log('next hole', JSON.stringify(await state()));
  await page.screenshot({ path: join(out, '9-next-hole.png') });
} finally { await browser.close(); }

// T325 (#925) and T327 (#927): the first tee's settings row (mulligans, gimmies), the round bar's Mulligan button after a shot, the shot again after
// M, and the scorecard with the mulligan's mark; with --gimme, a ball left inside the gimme ring (the faint ring round the cup, the Gimme button)
// and the gimme's drop into the cup.
//   node scripts/dev/mull-shots.mjs --base http://127.0.0.1:5186/ --out F:/ClaudeTemp/T325 --headed [--gimme]
// Needs a dev server (vite) on --base. One Edge (--headed opens it off-screen, never over the owner's game), closed when done; saves are not written.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/mull-shots'), W = 1366, H = 860, gimme = args.includes('--gimme');
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
  await page.waitForFunction(() => !!window.__game?.you && !!window.__game.yrView(), null, { timeout: 90000 }).catch(() => log('no character or course'));
  const state = () => page.evaluate(() => { const g = window.__game, r = g.yourRound(); return r && { at: r.at, ball: r.ball, lie: r.lie, holed: r.holed, row: r.card[r.at], mk: r.mk ?? 0, undo: !!r.undo, rules: r.rules }; });

  // 1. the first tee's card: the settings row
  await page.evaluate(() => { const g = window.__game, t = g.golf.tees.find(q => q.hole === 1); g.lookAt(t.x, t.y, 0.25); g.youTeeOpen = true; g.emit(); });
  await settle(page, 600);
  await page.screenshot({ path: join(out, '1-first-tee-settings.png') });
  const testids = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="tee-mull-"],[data-testid^="tee-gimme-"]')].map(e => `${e.getAttribute('data-testid')}${e.className.includes('chip-on') ? '*' : ''}`));
  log('settings', testids.join(' '));

  if (!gimme) {
    // 2. the round (1 per nine), the drive: the round bar's Mulligan button
    await page.click('[data-testid="tee-play-all"]');
    await page.evaluate(() => window.__game.yourJump());
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__game.ownerSwing({ power: 0.95, acc: 0.9, boost: 0 }));
    await page.waitForFunction(() => !window.__game.yourRoundView()?.flying, null, { timeout: 15000 }).catch(() => log('still flying'));
    log('after the drive', JSON.stringify(await state()), await page.evaluate(() => window.__game.lastShot?.text));
    await page.evaluate(() => { const g = window.__game, r = g.yourRound(); g.lookAt(r.ball.x, r.ball.y, 0.14); });
    await settle(page, 500);
    await page.screenshot({ path: join(out, '2-mulligan-button.png') });
    // 3. M: the ball back on the tee, the shot open again
    await page.keyboard.press('m');
    await settle(page, 600);
    log('after M', JSON.stringify(await state()), 'bar', await page.evaluate(() => document.querySelector('[data-testid="round-bar"]')?.textContent));
    await page.screenshot({ path: join(out, '3-after-mulligan.png') });
    // 4. the drive again, the caddie finishes the hole: the scorecard with the mark
    await page.evaluate(() => window.__game.ownerSwing({ power: 0.95, acc: 0.5, boost: 0 }));
    await page.waitForFunction(() => !window.__game.yourRoundView()?.flying, null, { timeout: 15000 }).catch(() => log('still flying'));
    await page.evaluate(() => { const g = window.__game; g.yourJump(); g.ownerCaddie(); g.toggleYourCard(true); });
    await settle(page, 500);
    log('hole done', JSON.stringify(await state()));
    await page.screenshot({ path: join(out, '4-scorecard-mark.png') });
  } else {
    // 2. gimmies: the round (inside the leather), the ball put on the green near the cup: the ring and the Gimme button
    await page.click('[data-testid="tee-play-all"]');
    const pin = await page.evaluate(() => { const g = window.__game, r = g.yourRound(), v = g.yrView(), h = v.holes[r.card[r.at].i]; return { x: h.pin.x, y: h.pin.y }; });
    await page.evaluate(({ x, y }) => {
      const g = window.__game, r = g.yourRound();
      // two strokes played (the test sets the ball 0.5 m from the cup: inside the leather, about 0.6 m)
      g.setYourRound({ ...r, card: r.card.map((c, k) => k === r.at ? { ...c, strokes: 2, putts: 0 } : c), ball: { x: x - 0.25, y: y + 0.05 }, lie: 'green' });
      g.yourJump(); g.lookAt(x, y, 0.3);
    }, pin);
    await settle(page, 800);
    log('on the green', JSON.stringify(await state()), 'bar', await page.evaluate(() => document.querySelector('[data-testid="round-bar"]')?.textContent));
    await page.screenshot({ path: join(out, '2-gimme-ring-and-button.png') });
    // 3. G: the ball drops into the cup (a frame in the drop), the hole done with a stroke
    await page.keyboard.press('g');
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(out, '3-gimme-drop.png') });
    await page.waitForFunction(() => window.__game.yrCard, null, { timeout: 8000 }).catch(() => log('no card'));
    await settle(page, 400);
    log('after G', JSON.stringify(await state()));
    await page.screenshot({ path: join(out, '4-scorecard-gimme.png') });
  }
} finally { await browser.close(); }

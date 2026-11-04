// T319 (#905): the greens and the ball, as the game draws them: a hooked drive's tracer (in flight and after it lands), the break grid on a sloped
// green at the putt's address (the script tilts the green round the pin 2.5% so the arrows show: the old start's course is flat), a putt rolling
// with the break, and the ball dropping into the cup.
//   node scripts/dev/green-shots.mjs --base http://127.0.0.1:5186/ --out F:/ClaudeTemp/T319 --headed
// Needs a dev server (vite) on --base. One Edge (use --headed: a headless Edge's GPU often fails here; the headed window opens off-screen, never over
// the owner's game), closed when done; saves are not written.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/green-shots'), W = 1366, H = 860;
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
  await page.waitForFunction(() => !!window.__game?.you, null, { timeout: 60000 }).catch(() => log('no character'));
  await page.evaluate(() => { const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); g.setSpeed(1); });
  await settle(page, 1500);
  const state = () => page.evaluate(() => { const g = window.__game, r = g.yourRound(); return r && { at: r.at, ball: r.ball, lie: r.lie, holed: r.holed, shot: g.shotState()?.input?.club ?? null }; });

  // 1. a round on hole 1; at the tee, a hooked drive (click 3 early: misses left) with its tracer
  await page.waitForFunction(() => !!window.__game.yrView(), null, { timeout: 60000 }).catch(() => log('no course view'));
  await page.evaluate(() => window.__game.yourRoundStart('all'));
  await page.evaluate(() => window.__game.yourJump());
  await page.waitForTimeout(500);
  log('tee', JSON.stringify(await state()));
  await page.evaluate(() => { const g = window.__game; g.cam.z = 0.12; g.emit(); });
  await settle(page, 500);
  await page.evaluate(() => {
    const g = window.__game; g.ownerSwing({ power: 0.97, acc: 0.14, boost: 0 });
    // the camera holds still over the whole flight (it follows the ball in play)
    const f = g.yrFlight; g.youFollow = false; if (f?.land) g.lookAt((f.from.x + f.land.x) / 2, (f.from.y + f.land.y) / 2, 0.17);
  });
  await page.waitForTimeout(1900);
  await page.screenshot({ path: join(out, '1-tracer-hook-flight.png') });
  await page.waitForFunction(() => !window.__game.yourRoundView()?.flying, null, { timeout: 15000 }).catch(() => log('still flying'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, '2-tracer-hook-landed.png') });
  log('after drive', JSON.stringify(await state()), await page.evaluate(() => window.__game.lastShot?.text));
  log('tracer', await page.evaluate(() => { const t = window.__game.yrTracers[0]; return t ? JSON.stringify({ from: t.f.from, aim: t.f.aim, land: t.f.land }) : 'none'; }));

  // 2. the green: tilted round the pin (2.5% falling toward the lower left of the screen, +y in tiles, plus a cross fall), the ball 5 m from the pin
  await page.waitForFunction(() => !!window.__game.yrView(), null, { timeout: 30000 }).catch(() => log('no course view'));
  const pin = await page.evaluate(() => { const g = window.__game, r = g.yourRound(), v = g.yrView(), h = v?.holes[r.card[r.at].i]; const p = h ? h.pin : g.golf.pins.find(q => q.hole === r.card[r.at].n); return { x: p.x, y: p.y }; });
  log('pin', JSON.stringify(pin));
  await page.evaluate(({ x, y }) => {
    const g = window.__game, f = g.courseHeight, N = Math.round(Math.sqrt(f.data.length)), S = 2;
    for (let j = Math.floor(y / S) - 14; j <= Math.floor(y / S) + 14; j++) for (let i = Math.floor(x / S) - 14; i <= Math.floor(x / S) + 14; i++) {
      const tx = i * S, ty = j * S, d = Math.hypot(tx - x, ty - y), w = d < 14 ? 1 : d > 26 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (d - 14) / 12);
      f.data[j * N + i] = w * (-0.025 * (ty - y) * 2 - 0.012 * (tx - x) * 2 + 0.03 * Math.sin((tx - x) / 6) * 2);
    }
    f.rev++; g.courseHeightChanged([x - 60, y - 60, x + 60, y + 60]);
    // the ball on the green 2.5 tiles (5 m) across the slope from the pin
    const r = g.yourRound(); g.yrFlight = null; g.shot = null;
    g.setYourRound({ ...r, ball: { x: x - 2.5, y: y + 0.2 }, lie: 'green' }); g.yourJump();
    g.cam.z = 0.3; g.lookAt(x - 1, y, 0.3); g.emit();
  }, pin);
  await settle(page, 1200);
  log('address', JSON.stringify(await state()));
  await page.screenshot({ path: join(out, '3-break-grid-address.png') });
  await page.evaluate(() => { const g = window.__game; g.cam.z = 0.18; g.emit(); });
  await settle(page, 400);
  await page.screenshot({ path: join(out, '3b-break-grid-wide.png') });
  await page.evaluate(() => { const g = window.__game; g.cam.z = 0.3; g.emit(); });

  // 3. putts until one drops (the model decides): a frame while it rolls with the break, one in the cup
  for (let k = 0; k < 8; k++) {
    const s = await state(); if (!s || s.holed || !s.shot) { log('no putt open', JSON.stringify(s)); break; }
    await page.evaluate(() => { const g = window.__game, p = g.shotState().input.power; g.ownerSwing({ power: p, acc: 0, boost: 0 }); });
    // (holed: the hold in the cup is stretched by 5 s for the screenshots, which are slow; the roll and the drop are as played)
    const holed = await page.evaluate(() => { const g = window.__game, f = g.yrFlight, h = g.yourRound().holed; if (h && f) { f.hold += 5; f.dur += 5; } return h; });
    // a frame half way through the roll, then (holed) one with the ball in the cup, before the hole's card
    await page.waitForFunction(() => { const f = window.__game.yrFlight; return !f || f.t > f.air + 0.5 * (f.dur - f.air - f.hold); }, null, { timeout: 8000, polling: 16 }).catch(() => {});
    await page.screenshot({ path: join(out, `4-putt-rolling-${k}.png`) });
    if (holed) {
      await page.waitForFunction(() => { const f = window.__game.yrFlight; return !f || f.t > f.dur - f.hold + 0.3; }, null, { timeout: 8000, polling: 16 }).catch(() => {});
      await page.screenshot({ path: join(out, '5-ball-in-cup.png') });
      log('holed on putt', k + 1);
      break;
    }
    log('missed', await page.evaluate(() => window.__game.lastShot?.text));
    await page.waitForFunction(() => !window.__game.yourRoundView()?.flying, null, { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => window.__game.yourJump());
    await page.waitForTimeout(400);
  }
  const ms = await page.evaluate(async () => {
    // the break grid's draw cost: the overlay's time with it and without it (the same frame, 60 draws each)
    const g = window.__game, c = g.overlay.getContext('2d'), t0 = performance.now();
    for (let k = 0; k < 60; k++) { g.breakFade = 1; g.breakShown = g.breakShown.length ? g.breakShown : g.breakPins(); g.drawBreakGrid(c, performance.now()); }
    return (performance.now() - t0) / 60;
  });
  log('break grid draw ms/frame', ms.toFixed(3));
} finally { await browser.close(); }

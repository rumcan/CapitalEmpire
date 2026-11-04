// T318 (#904): the spin ball, as the game draws it (Edge on the dev server, the old start's course, ?start=town): your round's address with the spin ball
// in the bottom right (the dot set by a drag on it), then a sand wedge into the first green with full backspin: clicks on the ball in the air, and a
// frame strip of the ball landing, checking and spinning back.
//   node scripts/dev/spin-shots.mjs --base http://127.0.0.1:5187/ --out F:/ClaudeTemp/T318 [--headed: a GPU window, kept off-screen]
// Needs a dev server (vite) on --base. One Edge, closed when done; saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/spin-shots'), W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: !args.includes('--headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', ...(args.includes('--headed') ? ['--window-position=-32000,-32000', `--window-size=${W},${H}`] : [])] }); // (headed: off-screen, never over the owner's game)
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
  page.on('console', m => { if (m.type() === 'error' || m.text().startsWith('[T318]')) log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.waitForFunction(() => !!window.__game?.you, null, { timeout: 60000 }).catch(() => log('no character'));
  await page.evaluate(() => { const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); g.setSpeed(1); });
  await settle(page, 1500);
  // the round, the ball put 70 m short of the first pin on the hole's line (a full sand wedge), and Jump to ball: the address
  const at = await page.evaluate(() => {
    const g = window.__game; g.yourRoundStart('all');
    const r = g.yourRound(); if (!r) return null;
    const pin = g.golf.pins.find(p => p.hole === r.card[0].n), tee = r.ball, L = Math.hypot(tee.x - pin.x, tee.y - pin.y), d = 35; // (35 tiles: 70 m)
    const ball = { x: pin.x + (tee.x - pin.x) / L * d, y: pin.y + (tee.y - pin.y) / L * d };
    g.setYourRound({ ...r, ball, lie: 'fairway' }); g.yourJump();
    return { pin: { x: pin.x, y: pin.y }, ball };
  });
  log('setup', JSON.stringify(at));
  await page.waitForFunction(() => !!window.__game.shotState(), null, { timeout: 20000 }).catch(() => log('no address'));
  await page.evaluate(() => { const g = window.__game, s = g.shotState(); g.setShotClub('sw'); });
  await page.evaluate(([px, py]) => { const g = window.__game, s = g.shotState(); g.shot = { ...s, input: { ...s.input, aim: { x: px, y: py }, power: 1 } }; g.emit(); }, [at.pin.x, at.pin.y]);
  await page.evaluate(() => { const g = window.__game; g.cam.z = 0.3; g.emit(); });
  await settle(page, 600);
  // the dot: a drag on the ball from its centre down to the bottom (backspin)
  const ball = await page.locator('[data-testid=spin-ball] canvas').boundingBox();
  if (ball) {
    const cx = ball.x + 68, cy = ball.y + 66;
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 4, cy + 22, { steps: 4 }); await page.mouse.move(cx + 2, cy + 44, { steps: 4 }); await page.mouse.up();
  }
  await page.waitForTimeout(300);
  log('spin before', JSON.stringify(await page.evaluate(() => window.__game.spinView())));
  await page.screenshot({ path: join(out, '1-address-spin-ball.png') });
  if (ball) await sharp(join(out, '1-address-spin-ball.png')).extract({ left: Math.min(W - 220, Math.max(0, Math.round(ball.x) - 20)), top: Math.min(H - 250, Math.max(0, Math.round(ball.y) - 40)), width: 220, height: 250 }).png().toFile(join(out, '1b-spin-ball-close.png'));
  // the swing (straight, full), then clicks on the ball in the air
  await page.evaluate(() => window.__game.ownerSwing({ power: 1, acc: 0, boost: 0 }));
  await page.waitForFunction(() => window.__game.spinView()?.air && window.__game.yrFlight?.t > 0, null, { timeout: 10000 }).catch(() => log('no air'));
  const frames = [];
  for (let k = 0; k < 6; k++) { if (ball) await page.mouse.click(ball.x + 68, ball.y + 66); await page.waitForTimeout(90); }
  await page.screenshot({ path: join(out, '2-in-air-clicks.png') });
  log('spin in the air', JSON.stringify(await page.evaluate(() => window.__game.spinView())));
  // the strip: from the landing to the rest, the camera held on the green
  await page.evaluate(([px, py]) => { const g = window.__game; g.youFollow = false; g.lookAt(px, py, 0.3); }, [at.pin.x, at.pin.y]);
  await page.waitForFunction(() => { const f = window.__game.yrFlight; return !f || f.t >= f.air - 0.05; }, null, { timeout: 10000, polling: 10 });
  for (let k = 0; k < 6; k++) { const f = join(out, `3-spin-back-${k}.png`); await page.screenshot({ path: f }); frames.push(f); await page.waitForTimeout(170); }
  log('flight', JSON.stringify(await page.evaluate(() => { const f = window.__game.yrFlight, r = window.__game.yourRound(); return { f: f && { land: f.land, to: f.to, check: f.check }, ball: r.ball, last: window.__game.lastShotReport()?.text }; })));
  const tiles = await Promise.all(frames.map(f => sharp(f).extract({ left: W / 2 - 220, top: H / 2 - 150, width: 440, height: 300 }).toBuffer()));
  await sharp({ create: { width: 440 * tiles.length, height: 300, channels: 3, background: '#000' } }).composite(tiles.map((b, i) => ({ input: b, left: i * 440, top: 0 }))).png().toFile(join(out, 'strip-wedge-spin-back.png'));
} finally { await browser.close(); }

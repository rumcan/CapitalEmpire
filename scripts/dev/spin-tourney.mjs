// T318 (#904): the tournament owner's spin, end to end (a headless Edge on the dev server, a tournament day): join, the first shot with backspin, F
// presses while the ball is in the air, then the day rebuilt with the clicks at the landing (the console's "[T318] spin rebuild n ms": the perf check).
//   node scripts/dev/spin-tourney.mjs --base http://127.0.0.1:5187/ --out F:/ClaudeTemp/T318
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/spin-shots'), seed = 7;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error' || m.text().startsWith('[T318]')) console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&tourney=1&everyday=0&seed=${seed}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWelcome?.(false); g.emit(); });
  const jump = m => page.evaluate(async m => { const g = window.__game, T = g.traffic, c = await import('/src/game/sim/townclock.ts'); T.setTownClock(c.jumpTo(T.town, T.simTime(performance.now()), m, T.town.rate)); }, m);
  await jump(7 * 60); await page.evaluate(() => window.__game.setSpeed(1)); await page.waitForFunction(() => window.__game.play, null, { timeout: 60000 });
  await page.evaluate(() => window.__game.joinTournament('m'));
  await jump(7 * 60 + 28); await page.evaluate(() => window.__game.setSpeed(2));
  for (let shot = 0; shot < 2; shot++) {
    await page.waitForFunction(() => window.__game.shotState(), null, { timeout: 240000, polling: 100 });
    for (let k = 0; k < 3; k++) await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    const before = await page.evaluate(() => { const g = window.__game; g.setShotSpin(0, g.shotState().input.club === 'driver' ? 0.4 : -0.3); return { club: g.shotState().input.club, spin: g.spinView() }; });
    console.log('shot', shot + 1, JSON.stringify(before));
    if (shot === 0) await page.screenshot({ path: join(out, '4-tourney-spin-ball.png') });
    await page.evaluate(() => window.__game.ownerSwing({ power: 1, acc: 0, boost: 0 }));
    await page.waitForFunction(() => window.__game.spinView()?.air && window.__game.spinAir?.seen, null, { timeout: 20000, polling: 20 }).catch(() => console.log('  never seen in the air'));
    for (let k = 0; k < 4; k++) { await page.keyboard.press('f'); await page.waitForTimeout(60); }
    console.log('  in the air', JSON.stringify(await page.evaluate(() => window.__game.spinView())));
    await page.waitForFunction(() => !window.__game.spinView()?.air, null, { timeout: 20000, polling: 50 }).catch(() => console.log('  still in the air'));
    console.log('  landed:', await page.evaluate(() => window.__game.lastShotReport()?.text), JSON.stringify(await page.evaluate(() => window.__game.golf.play.inputs.at(-1).spin)));
  }
} finally { await browser.close(); }

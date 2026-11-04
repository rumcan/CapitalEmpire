// T320 (#908): the owner's own shot at the watching speed, as a frame strip (a headless Edge on the dev server): the owner joins the dev tournament
// (?tourney=1), his round goes to the watching speed, and at his first shot the 3-click meter is swung (timed Enter presses); from the last click a
// frame is taken every STEP ms (the address, the backswing, impact, the follow-through, the ball in flight and at rest) and each frame's state is
// logged (the speed, the owner's clip frame and facing row, his ball's place and height, the camera hold):
//   owner-strip.png   (and -2: his second shot) the frames, left to right and top to bottom (each the middle of the screen, labelled with its ms after the last click)
//   owner-ready.png   the whole screen as his first shot opens; owner-after.png the whole screen once the hold is over
//   node scripts/dev/watch-shots.mjs --base http://127.0.0.1:5186/ --out F:/ClaudeTemp/T320 [--seed 7]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/watch-shots'), seed = opt('seed', '7'), W = 1366, H = 900;
const STEP = 250, N = 16, CW = 520, CH = 360;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&tourney=1&everyday=0&seed=${seed}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(async () => { window.__stateAt = (await import('/src/game/golf/play/index.ts')).stateAt; });
  await page.evaluate(() => { const g = window.__game; g.closeWelcome?.(false); g.nightAmount = () => 0; g.emit(); });
  const jump = m => page.evaluate(async m => { const g = window.__game, T = g.traffic, c = await import('/src/game/sim/townclock.ts'); T.setTownClock(c.jumpTo(T.town, T.simTime(performance.now()), m, T.town.rate)); }, m);
  await jump(7 * 60); await page.evaluate(() => window.__game.setSpeed(1)); await page.waitForFunction(() => window.__game.play, null, { timeout: 60000 });
  await page.evaluate(() => window.__game.joinTournament('m'));
  const tee = await page.evaluate(() => window.__game.play?.own?.tee);
  console.log('joined, tee', tee);
  await jump(tee - 3); await page.evaluate(() => window.__game.setSpeed(2));
  await page.waitForFunction(() => window.__game.watchSpeed.on, null, { timeout: 120000, polling: 100 });
  console.log('watching (own):', await page.evaluate(() => ({ speed: window.__game.speed, before: window.__game.watchSpeed.before })));
  for (const sfx of ['', '-2']) {
  await page.waitForFunction(() => window.__game.shotState(), null, { timeout: 600000, polling: 200 });
  for (let k = 0; k < 3; k++) await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  console.log('shot open:', await page.evaluate(() => { const g = window.__game, s = g.shotState(); return { hole: s.turn.hole, stroke: s.turn.stroke, club: s.input.club, shotSpeed: g.shotSpeed, speed: g.speed }; }));
  await page.screenshot({ path: join(out, `owner-ready${sfx}.png`) });
  // the swing: Enter, Enter at full power, Enter on the way back at the middle; T from the club's skill (swing.ts swingTime)
  const T = await page.evaluate(async () => {
    const sw = await import('/src/game/golf/play/swing.ts'), T = sw.swingTime(window.__game.shotSkill());
    const key = k => { for (const type of ['keydown', 'keyup']) document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true })); };
    key('Enter'); await new Promise(r => setTimeout(r, T * 1000)); key('Enter'); await new Promise(r => setTimeout(r, T * 1000)); key('Enter');
    return T;
  });
  const t0 = Date.now(), shots = [], log = [];
  for (let i = 0; i < N; i++) {
    await page.waitForTimeout(Math.max(0, t0 + i * STEP - Date.now()));
    const st = await page.evaluate(() => {
      const g = window.__game, pl = g.play, id = pl.own.id, T = g.traffic, mm = g.playMinute(pl, g.townNow().dayMin), sc = (window.__stateAt ? window.__stateAt(pl.plan, pl.view, mm) : []).find(q => q.golfer === id), p = pl.pv.people.find(q => q.golfer === id), b = pl.pv.ballOf(id);
      return { m: +mm.toFixed(3), sched: sc && { a: sc.action, x: +sc.x.toFixed(1), by: sc.by && +sc.by.toFixed(2) }, speed: g.speed, skipping: g.traffic.skipping, frame: p?.frame, row: p?.row, x: p && +p.x.toFixed(2), y: p && +p.y.toFixed(2), ball: b && { x: +b.ball.x.toFixed(1), y: +b.ball.y.toFixed(1), h: +b.ball.h.toFixed(1), moving: b.moving }, hold: !!g.ownHold, shot: !!g.shotState() };
    });
    const ms = Date.now() - t0;
    log.push({ ms, ...st });
    shots.push({ ms, buf: await page.screenshot({ clip: { x: (W - CW) / 2, y: (H - CH) / 2, width: CW, height: CH } }) });
  }
  writeFileSync(join(out, `owner-strip${sfx}.json`), JSON.stringify({ T, log }, null, 1));
  for (const l of log) console.log(JSON.stringify(l));
  const cols = 4, rows = Math.ceil(N / cols);
  const label = ms => Buffer.from(`<svg width="${CW}" height="28"><rect width="140" height="28" fill="black" opacity="0.6"/><text x="8" y="20" font-size="18" fill="white" font-family="sans-serif">+${ms} ms</text></svg>`);
  await sharp({ create: { width: CW * cols, height: CH * rows, channels: 4, background: { r: 15, g: 23, b: 42, alpha: 1 } } })
    .composite(shots.flatMap((x, i) => [{ input: x.buf, left: (i % cols) * CW, top: Math.floor(i / cols) * CH }, { input: label(x.ms), left: (i % cols) * CW, top: Math.floor(i / cols) * CH }]))
    .png().toFile(join(out, `owner-strip${sfx}.png`));
  await page.waitForFunction(() => !window.__game.ownHold, null, { timeout: 20000 }).catch(() => console.log('hold still on'));
  await page.screenshot({ path: join(out, `owner-after${sfx}.png`) });
  console.log('after:', await page.evaluate(() => ({ speed: window.__game.speed, last: window.__game.lastShotReport()?.text })));
  }
  await ctx.close();
} finally { await browser.close(); }

// T316 (#902): captures of the 3-click swing meter in the game (a headless Edge on the dev server): the owner joins the dev tournament (?tourney=1, the
// old start's course), and at his shots the meter is swung by timed key events (Enter: the clicks, Space: the boost) for a straight shot, a hook and a
// slice, with a frame strip of one swing:
//   meter-mid.png      the shot panel mid-swing (the marker climbing, the boost counted)
//   <kind>-meter.png   the panel as the swing ends (the result line on the meter), kind straight / hook / slice
//   ready-full.png     the whole screen at the first shot, the meter ready
//   <kind>-after.png   the game just after the shot (the toast with the carry and total; the ball in flight)
//   meter-strip.png    six frames of one swing (the meter alone), left to right
//   node scripts/dev/swing-shots.mjs --base http://127.0.0.1:5186/ --out F:/ClaudeTemp/T316 [--seed 7]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/swing-shots'), seed = opt('seed', '7'), W = 1366, H = 900;
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
  await page.evaluate(() => { const g = window.__game; g.closeWelcome?.(false); g.nightAmount = () => 0; g.emit(); });
  const jump = m => page.evaluate(async m => { const g = window.__game, T = g.traffic, c = await import('/src/game/sim/townclock.ts'); T.setTownClock(c.jumpTo(T.town, T.simTime(performance.now()), m, T.town.rate)); }, m);
  // before the first tee: join as a man, then on to his first shot
  await jump(7 * 60); await page.evaluate(() => window.__game.setSpeed(1)); await page.waitForFunction(() => window.__game.play, null, { timeout: 60000 });
  await page.evaluate(() => window.__game.joinTournament('m'));
  console.log('joined:', await page.evaluate(() => !!window.__game.play?.own));
  await jump(7 * 60 + 28); await page.evaluate(() => window.__game.setSpeed(2));
  const nextShot = () => page.waitForFunction(() => window.__game.shotState(), null, { timeout: 240000, polling: 100 });
  const panel = () => page.locator('[data-testid=shot-panel]');
  /** swings in the page: Enter at 0, Space taps (fractions of T), Enter at power*T, Enter when the marker is at acc on the way back; T from the club's
   *  skill (swing.ts swingTime). Resolves with T (s) */
  const swing = (power, acc, taps = []) => page.evaluate(async ({ power, acc, taps }) => {
    const sw = await import('/src/game/golf/play/swing.ts'), T = sw.swingTime(window.__game.shotSkill());
    const key = k => { for (const type of ['keydown', 'keyup']) document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true })); };
    const t0 = performance.now(), at = (s, f) => new Promise(r => setTimeout(() => { f(); r(); }, Math.max(0, t0 + s * 1000 - performance.now())));
    key('Enter');
    for (const f of taps) at(f * T, () => key(' '));
    at(power * T, () => key('Enter'));
    at((power + (power - acc)) * T, () => key('Enter'));
    return T;
  }, { power, acc, taps });
  for (const [kind, acc] of [['straight', 0], ['hook', 0.16], ['slice', -0.16]]) {
    await nextShot();
    // the footer's open tool flyout (the town start opens one) closed, so the panel sits at the bottom as in play
    for (let k = 0; k < 3; k++) await page.keyboard.press('Escape');
    await page.waitForTimeout(1200);
    const s = await page.evaluate(() => { const s = window.__game.shotState(); return { hole: s.turn.hole, stroke: s.turn.stroke, club: s.input.club, skill: window.__game.shotSkill() }; });
    console.log(kind, s);
    if (kind === 'straight') await page.screenshot({ path: join(out, 'ready-full.png') });
    const t0 = Date.now(), T = await swing(1, acc, kind === 'straight' ? [0.15, 0.25, 0.35, 0.45] : []);
    if (kind === 'straight') {
      // the strip: six frames from the climb to the way back; the mid-swing shot among them
      const shots = [];
      // (t0: about when the page's first click went; the swing's own clock runs in the page)
      const can = page.locator('canvas[aria-label="Swing meter"]');
      for (const f of [0.35, 0.7, 0.98, 1.3, 1.65, 2.1]) {
        await page.waitForTimeout(Math.max(0, t0 + f * T * 1000 - Date.now()));
        shots.push({ buf: await can.screenshot() });
        if (shots.length === 2) await panel().screenshot({ path: join(out, 'meter-mid.png') });
        if (shots.length === 6) await panel().screenshot({ path: join(out, 'straight-meter.png') });
      }
      const metas = await Promise.all(shots.map(x => sharp(x.buf).metadata())), w = metas[0].width, h = metas[0].height;
      await sharp({ create: { width: w * 6, height: h, channels: 4, background: { r: 15, g: 23, b: 42, alpha: 1 } } })
        .composite(shots.map((x, i) => ({ input: x.buf, left: i * w, top: 0 }))).png().toFile(join(out, 'meter-strip.png'));
    } else {
      await page.waitForTimeout(Math.max(0, t0 + ((2 - acc) * T + 0.12) * 1000 - Date.now()));
      await panel().screenshot({ path: join(out, `${kind}-meter.png`) }).catch(e => console.log('  meter shot missed:', e.message.slice(0, 80)));
    }
    await page.waitForFunction(st => { const x = window.__game.shotState(); return !x || x.turn.stroke !== st.stroke || x.turn.hole !== st.hole; }, s, { timeout: 5000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(out, `${kind}-after.png`) });
    console.log('  last shot:', await page.evaluate(() => window.__game.lastShotReport()?.text));
    await page.evaluate(() => window.__game.setSpeed(3));
  }
  await ctx.close();
} finally { await browser.close(); }

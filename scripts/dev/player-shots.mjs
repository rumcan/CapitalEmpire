// T241 (#705): in-game shots of your golf at 1366 x 768:
// - practice: a new range start (?start=range), the putting and chipping greens open (the save's state set); at 09:00 a real click on the range card's
//   "Hit a bucket": the card with the session's result (range-practice-card, range-practice); the bucket's 45 minutes later the putting green, then the
//   chipping green; the profile card beside the range card (player-card, player-and-range).
// - round: the old start's course and clubhouse (?start=town): at 08:00 the profile card's Book (a real click), the card booked (player-booked), the
//   playback with you on the course (player-on-course: the camera on your golfer), then the clock past your round: the card with your score and the toast
//   (player-round-done).
//   node scripts/dev/player-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T241 [--only practice,round]
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/player-shots'), only = opt('only', ''), W = 1366, H = 768;
const want = k => !only || only.split(',').includes(k);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const save = async (buf, name) => { const file = join(out, `${name}.png`); await sharp(buf).png().toFile(file); console.log(file); return file; };
const settle = async (page, ms = 1200) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.lotsPending === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
/** the town clock to minute m of the day (the next day's if it is past) */
const jump = (page, m) => page.evaluate(async m => { const g = window.__game, T = g.traffic, c = await import('/src/game/sim/townclock.ts'); T.setTownClock(c.jumpTo(T.town, T.simTime(performance.now()), m, T.town.rate)); g.emit(); }, m);
const when = page => page.evaluate(async () => { const g = window.__game, T = g.traffic, c = await import('/src/game/sim/townclock.ts'), t = c.townTimeOf(T.town, T.simTime(performance.now())); return `day ${t.day} ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`; });
const shot = async (page, sel, name) => { await page.waitForTimeout(300); const el = page.locator(sel); if (!(await el.count())) { console.log(`  no ${sel} for ${name}`); return; } await save(await el.screenshot({ type: 'png' }), name); };
const whole = async (page, name) => { await page.waitForTimeout(300); await save(await page.screenshot({ type: 'png' }), name); };
const toasts = page => page.evaluate(() => [...document.querySelectorAll('[role="status"], [data-testid^="toast"]')].map(e => e.textContent).filter(Boolean).slice(-3));
const profile = page => page.evaluate(() => { const p = window.__game.golf?.player; return p && { hcp: p.log.at(-1)?.hcp, skills: p.skills, busy: p.busy, booked: p.booked, rounds: p.rounds }; });
const open = async (page, url) => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWelcome?.(false); g.setSpeed?.(0); g.emit(); });
  await settle(page, 2000);
};
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  return { ctx, page };
};

try {
  if (want('practice')) {
    const { ctx, page } = await newPage();
    await open(page, `${base}?start=range&seed=7`);
    // the practice greens built and open (the save's state and the range's scan), the guide folded away, the camera on the shack
    await page.evaluate(() => {
      const g = window.__game, b = g.golf.range, r = g.range;
      b.practice.putting.open = true; b.practice.chipping.open = true; g.guideFolded = true;
      for (const id of ['putting', 'chipping']) if (r.practice?.[id]) r.practice[id] = { ...r.practice[id], state: 'open', m2: 400, need: 0 };
      const sc = r.scene; g.setTool('select'); g.camEase = null; g.lookAt(sc.counter.x, sc.counter.y, 0.3); g.openRangeCard(true); g.emit();
    });
    await jump(page, 540); await settle(page, 1500);
    console.log('at', await when(page));
    await page.locator('[data-testid="range-you"]').scrollIntoViewIfNeeded();
    await shot(page, '[data-testid="range-card"]', 'range-before-practice');
    // a real click: Hit a bucket
    await page.locator('[data-testid="practise-bucket-go"]').click();
    await page.waitForTimeout(500);
    console.log('  after the bucket:', JSON.stringify(await profile(page)), JSON.stringify(await toasts(page)));
    await page.locator('[data-testid="range-you"]').scrollIntoViewIfNeeded();
    await shot(page, '[data-testid="range-card"]', 'range-practice-card');
    await whole(page, 'range-practice');
    // the bucket's minutes later: the putting green, then the chipping green
    await jump(page, 590); await page.waitForTimeout(300);
    const pg = page.locator('[data-testid="practise-putting-go"]');
    if (await pg.count()) { await pg.scrollIntoViewIfNeeded(); await pg.click(); await page.waitForTimeout(400); }
    await jump(page, 625); await page.waitForTimeout(300);
    const cg = page.locator('[data-testid="practise-chipping-go"]');
    if (await cg.count()) { await cg.scrollIntoViewIfNeeded(); await cg.click(); await page.waitForTimeout(400); }
    console.log('  after the greens:', JSON.stringify(await profile(page)));
    await page.locator('[data-testid="range-practice"]').scrollIntoViewIfNeeded();
    await shot(page, '[data-testid="range-card"]', 'range-greens-card');
    // the profile card, beside the range card (a real click on Profile)
    await page.locator('[data-testid="range-you"]').scrollIntoViewIfNeeded();
    await page.locator('[data-testid="range-you-profile"]').click(); await page.waitForTimeout(400);
    await page.evaluate(() => { const g = window.__game; g.toasts.length = 0; g.emit(); }); await page.waitForTimeout(300); // (the session toasts, gone)
    await shot(page, '[data-testid="player-card"]', 'player-card');
    await whole(page, 'player-and-range');
    await ctx.close();
  }
  if (want('round')) {
    const { ctx, page } = await newPage();
    await open(page, `${base}?start=town&seed=7`);
    await jump(page, 480); await settle(page, 1500);
    await page.evaluate(() => { const g = window.__game; g.speed = 0; g.openPlayerCard(true); g.emit(); });
    await page.waitForTimeout(800);
    console.log('at', await when(page), 'clubhouse', await page.evaluate(() => window.__game.hasClubhouse));
    await shot(page, '[data-testid="player-card"]', 'player-before-book');
    const bk = page.locator('[data-testid="player-book"]');
    if (await bk.count() && await bk.isEnabled()) { await bk.click(); await page.waitForTimeout(600); } else console.log('  (Book is not enabled)');
    console.log('  booked:', JSON.stringify(await profile(page)), JSON.stringify(await toasts(page)));
    await page.evaluate(() => window.__game.emit()); await page.waitForTimeout(1200);
    await page.evaluate(() => { const g = window.__game; g.toasts.length = 0; g.emit(); }); await page.waitForTimeout(300);
    await shot(page, '[data-testid="player-card"]', 'player-booked');
    // out on the course: the camera on your golfer (the day's playback), at your fourth hole or so
    const b = await page.evaluate(() => window.__game.golf.player.booked);
    if (b?.result) {
      await jump(page, Math.round(b.tee + (b.result.done - b.tee) * 0.25)); await page.waitForTimeout(1500);
      const at = await page.evaluate(() => { const g = window.__game, dp = g.dayPlay; if (!dp) return null; const id = dp.youId, P = dp.view.pv?.people ?? []; const st = dp.view.plan.shots.filter(s => s.golfer === id && s.t <= g.dayMinute).at(-1); return st ? { x: st.to.x, y: st.to.y, n: P.length, hole: st.hole + 1 } : null; });
      console.log('  you at', JSON.stringify(at));
      if (at) { await page.evaluate(a => { const g = window.__game; g.openPlayerCard(true); g.camEase = null; g.lookAt(a.x, a.y, 0.3); g.emit(); }, at); await settle(page, 1500); await whole(page, 'player-on-course'); }
      await jump(page, Math.ceil(b.result.done) + 2); await page.waitForTimeout(1500);
      await page.evaluate(() => window.__game.emit()); await page.waitForTimeout(500);
      console.log('  done:', JSON.stringify(await profile(page)), JSON.stringify(await toasts(page)));
      await shot(page, '[data-testid="player-card"]', 'player-round-done');
      await whole(page, 'player-round-done-screen');
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

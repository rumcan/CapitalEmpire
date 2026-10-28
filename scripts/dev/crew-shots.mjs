// T269 (#810): in-game shots of the grounds crew and the day's pin (the old start's course, ?start=town):
// - pin: the hole card with today's pin (hole-card-today-pin), and the green at the closest zoom on two mornings (day-pin-<n>), the flag on each
//   day's cup; the console reports the cups against the placed pins;
//   node scripts/dev/crew-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T269 [--only pin]
// Needs a dev server (vite) on --base. One headless Edge, closed when done. Saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/crew-shots'), only = opt('only', ''), W = 1366, H = 900;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save = async (buf, name) => { const file = join(out, `${name}.png`); await sharp(buf).png().toFile(file); console.log(file); return file; };
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
/** the town clock to minute m of the day (the next one: a minute past today's moves to tomorrow's) */
const jump = (page, m) => page.evaluate(async m => { const g = window.__game, T = g.traffic, c = await import('/src/game/sim/townclock.ts'); T.setTownClock(c.jumpTo(T.town, T.simTime(performance.now()), m, T.town.rate)); }, m);
const want = k => !only || only.split(',').includes(k);

try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWelcome?.(false); g.emit(); });
  await settle(page, 1500);

  if (want('pin')) {
    // ---- the day's pins: two mornings, the flag on each day's cup; the hole card's line
    const report = () => page.evaluate(() => {
      const g = window.__game, gs = g.golf, dp = gs.dayPins, flags = gs.pins.map(p => { const f = g.golfProps.get('pin:' + p.hole); return f ? { hole: p.hole, x: f.x, y: f.y } : null; });
      return { day: dp?.day, holes: gs.pins.map(p => { const t = dp?.today.find(q => q.hole === p.hole), f = flags.find(q => q?.hole === p.hole); return { h: p.hole, placed: [p.x, p.y], today: t ? [t.x, t.y] : null, flag: f ? [f.x, f.y] : null, text: g.todayPinText(p.hole) }; }) };
    });
    await jump(page, 6 * 60 + 30); await page.evaluate(() => window.__game.setSpeed(1)); await sleep(1500); await page.evaluate(() => window.__game.setSpeed(0));
    const r1 = await report(); console.log('day', r1.day, JSON.stringify(r1.holes.slice(0, 4)));
    const h = r1.holes.find(q => q.today && q.text) ?? r1.holes[0];
    await page.evaluate(([x, y]) => { window.__game.lookAt(x, y, 0.3); }, h.today ?? h.placed); await settle(page, 1200);
    await page.addStyleTag({ content: 'html.noui * { visibility: hidden !important } html.noui canvas { visibility: visible !important }' });
    await page.evaluate(() => document.documentElement.classList.add('noui'));
    await save(await page.screenshot({ type: 'png', clip: { x: W / 2 - 260, y: H / 2 - 200, width: 520, height: 360 } }), `day-pin-${r1.day}`);
    await page.evaluate(() => document.documentElement.classList.remove('noui'));
    // the next morning
    await jump(page, 6 * 60 + 30); await page.evaluate(() => window.__game.setSpeed(1)); await sleep(1500); await page.evaluate(() => window.__game.setSpeed(0));
    const r2 = await report(); console.log('day', r2.day, JSON.stringify(r2.holes.slice(0, 4)));
    const moved = r2.holes.filter(q => { const a = r1.holes.find(o => o.h === q.h); return a?.today && q.today && Math.hypot(a.today[0] - q.today[0], a.today[1] - q.today[1]) > 1; }).length;
    const onCup = r2.holes.filter(q => q.today && q.flag && Math.hypot(q.today[0] - q.flag[0], q.today[1] - q.flag[1]) < 1e-3).length;
    console.log(`cups moved overnight: ${moved}/${r2.holes.length}; flags on today's cup: ${onCup}/${r2.holes.length}`);
    await page.evaluate(() => document.documentElement.classList.add('noui'));
    await settle(page, 1200);
    await save(await page.screenshot({ type: 'png', clip: { x: W / 2 - 260, y: H / 2 - 200, width: 520, height: 360 } }), `day-pin-${r2.day}`);
    await page.evaluate(() => document.documentElement.classList.remove('noui'));
    // the hole card
    await page.evaluate(n => { const g = window.__game; g.setTool('course'); g.openHoleCard(n); g.emit(); }, h.h); await sleep(1200);
    const card = page.locator('[data-testid="hole-today-pin"]').first();
    console.log('card line:', await card.textContent().catch(() => '(none)'));
    const sec = card.locator('xpath=ancestor::section[1]');
    await save(await sec.screenshot({ type: 'png' }), 'hole-card-today-pin');
    await page.evaluate(() => { const g = window.__game; g.closeHoleCard(); g.setTool('select'); g.emit(); });
  }
} finally {
  await browser.close();
}

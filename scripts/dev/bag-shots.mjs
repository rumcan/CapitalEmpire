// T335 (#961): the bag's captures, in the real game (a headless Edge on the dev server, the old nine, ?start=town):
//   1-bag-card.png            the bag card at the start: 14 clubs in woods, irons, wedges and putter, all Garage-sale
//   2-upgrade-driver.png      a real click on the driver tile, then Upgrade (a real click) twice: the Tour driver's flyout (carry, launch, spin, forgiveness, the Prototype offer and its price)
//   3-bag-upgraded.png        the bag after a few upgrades (the driver, a 7-iron, the wedges): the tiles tinted by level
//   4-putter-shaft.png        the putter's flyout: the shafts and heads, a real click on Buy for the whippy graphite shaft, its feel, line and luck bars
//   5-third-wood.png          the hybrid in the third wood's slot (the swap)
//   6-shot-panel-bag.png      the shot panel from the fairway with the whole bag in its strip (the upgraded clubs dotted), and the shot panel on the green with the putter
//   7-shot-new-clubs.png      the new clubs played: a real swing with the 7-iron, the gap wedge and the hybrid (the report line of each)
//   shots.json                the numbers (the clubs' carries and the reports)
// Run (through the heavy-step lock, with a dev server on --base):
//   node scripts/dev/bag-shots.mjs --base http://localhost:5187/ --out E:/ClaudeTemp/T335 [--seed 2]
// One headless Edge, closed when done; saves are not written (non-GET requests are answered locally). Exit 1 on a page error.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5187/'), out = opt('out', 'output/bag-shots'), seed = opt('seed', '2'), W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const log = (...a) => console.log(...a);
let bad = 0;
const rep = { notes: [], reports: [] };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { bad++; log('[pageerror]', e.message); });
  page.on('console', m => { if (m.type() === 'error') { bad++; log('[console]', m.text().slice(0, 200)); } });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&seed=${seed}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); g.setSpeed(1); g.nightAmount = () => 0; });
  await page.waitForFunction(() => !!window.__game?.you && !!window.__game.yrView(), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const sleep = ms => page.waitForTimeout(ms);
  const toasts = () => page.evaluate(() => [...document.querySelectorAll('[role="status"], [data-testid^="toast"]')].map(e => e.textContent).filter(Boolean).slice(-3));
  const card = async name => { await sleep(500); await page.locator('[data-testid=bag-root]').screenshot({ path: join(out, name) }); log(name); };

  // ---- 1. the bag card at the start
  await page.evaluate(() => { const g = window.__game; g.eventCardOpen = null; g.openPlayerCard(false); g.openBagCard(true); });
  await page.waitForSelector('[data-testid=bag-card]', { timeout: 20000 });
  rep.start = await page.evaluate(() => { const v = window.__game.bagCard(); return { clubs: v.rows.length, shop: v.shop, shopWhy: v.shopWhy, money: v.money, carries: Object.fromEntries(v.rows.map(r => [r.club, Math.round(r.carryM)])) }; });
  log('start', JSON.stringify(rep.start));
  if (!rep.start.shop) { rep.notes.push('no shop at this start: the real flow cannot buy, so the page asks the engine to count a pro\'s office'); }
  await card('1-bag-card.png');

  // ---- 2. a real click on the driver, then Upgrade twice (Club, then Tour)
  await page.click('[data-testid=bag-club-driver]');
  await page.waitForSelector('[data-testid=bag-detail]');
  await sleep(300);
  await page.screenshot({ path: join(out, '2a-driver-before.png'), clip: { x: W - 720, y: 60, width: 720, height: 560 } });
  for (let k = 0; k < 2; k++) { await page.click('[data-testid=bag-upgrade]'); await sleep(400); }
  rep.driver = await page.evaluate(() => { const r = window.__game.bagCard().rows.find(x => x.club === 'driver'); return { level: r.levelName, carry: Math.round(r.carryM), next: r.next && { name: r.next.name, price: r.next.price, lines: r.next.lines } }; });
  log('driver', JSON.stringify(rep.driver)); rep.toasts = await toasts();
  await card('2-upgrade-driver.png');

  // ---- 3. a few more upgrades through the same click (the 7-iron to Club, the sand and lob wedges to Tour and Club, the gap wedge a voucher-free Club)
  for (const [club, n] of [['iron7', 1], ['iron6', 2], ['sw', 2], ['lw', 1], ['wood3', 3]]) {
    await page.click(`[data-testid=bag-club-${club}]`); await page.waitForSelector('[data-testid=bag-detail]');
    for (let k = 0; k < n; k++) { await page.click('[data-testid=bag-upgrade]'); await sleep(250); }
  }
  await page.click('[data-testid=bag-club-iron7]'); await sleep(300);
  await card('3-bag-upgraded.png');
  rep.afterUpgrades = await page.evaluate(() => { const v = window.__game.bagCard(); return { points: v.points, money: v.money, mods: window.__game.playerNow().bag }; });
  log('after', JSON.stringify(rep.afterUpgrades));

  // ---- 4. the putter: the fitting; a real click on Buy for the whippy graphite shaft
  await page.click('[data-testid=bag-club-putter]'); await page.waitForSelector('[data-testid=bag-fitting]');
  await sleep(300);
  await page.locator('[data-testid=bag-detail]').screenshot({ path: join(out, '4a-putter-before.png') });
  await page.click('[data-testid=bag-fit-whip]'); await sleep(400);
  await page.click('[data-testid=bag-fit-mallet]'); await sleep(400);
  rep.putter = await page.evaluate(() => { const v = window.__game.bagCard(); return { shaft: v.putter.shaft, head: v.putter.head, feel: v.putter.feel, line: v.putter.line, luck: v.putter.luck }; });
  log('putter', JSON.stringify(rep.putter));
  await page.evaluate(() => { const d = document.querySelector('[data-testid=bag-detail]'); if (d) d.scrollTop = 0; });
  await card('4-putter-shaft.png');

  // ---- 5. the hybrid in the third wood's slot
  await page.click('[data-testid=bag-club-wood5]'); await page.waitForSelector('[data-testid=bag-third]');
  await page.click('[data-testid=bag-third-hybrid]'); await sleep(400);
  await page.click('[data-testid=bag-club-hybrid]'); await sleep(300);
  await card('5-third-wood.png');

  // ---- 6. the shot panel with the bag: your round started, the shot open on the fairway; the strip has the whole bag
  await page.evaluate(() => { window.__game.openBagCard(false); window.__game.yourRoundStart('all'); });
  await sleep(500);
  await page.evaluate(() => window.__game.yourJump()); // (to the ball at the first tee: the shot opens there)
  await page.waitForFunction(() => !!window.__game.shotState()?.mine, null, { timeout: 90000 });
  for (let k = 0; k < 2; k++) await page.keyboard.press('Escape');
  await sleep(800);
  rep.tee = await page.evaluate(() => { const g = window.__game; return { clubs: g.shotClubs(), club: g.shotState().input.club, levels: Object.fromEntries(g.shotClubs().map(c => [c, g.clubLevel(c)])) }; });
  log('tee clubs', JSON.stringify(rep.tee));
  await page.locator('[data-testid=shot-panel]').screenshot({ path: join(out, '6a-shot-panel-tee.png') });
  /** the ball has landed and rolled: you jump to it ("Jump to ball") and the next shot opens (false when the hole is done) */
  const toBall = async () => {
    await page.waitForFunction(() => !window.__game.yourRoundView()?.flying, null, { timeout: 60000 });
    await sleep(500);
    if (await page.evaluate(() => { const r = window.__game.yourRound(); return !r || r.holed || r.over; })) return false;
    await page.evaluate(() => window.__game.yourJump());
    await page.waitForFunction(() => !!window.__game.shotState()?.mine, null, { timeout: 60000 });
    await sleep(600);
    return true;
  };
  // a drive, then an approach with a club the old bag did not have
  await page.evaluate(() => window.__game.ownerSwing({ power: 1, acc: 0, boost: 0 }));
  await toBall();
  rep.reports.push(await page.evaluate(() => window.__game.lastShotReport()?.text));
  const approach = await page.evaluate(() => { const g = window.__game, s = g.shotState(); return { clubs: g.shotClubs(), suggested: s.turn.suggested.club, distM: Math.round(s.turn.distM), lie: s.turn.lie }; });
  log('approach', JSON.stringify(approach)); rep.approach = approach;
  await page.evaluate(() => { const g = window.__game; g.setShotClub('iron7'); });
  await sleep(500);
  await page.locator('[data-testid=shot-panel]').screenshot({ path: join(out, '6-shot-panel-bag.png') });
  await page.screenshot({ path: join(out, '6-screen-shot-panel-bag.png') });

  // ---- 7. the new clubs played with a real swing: the 7-iron, then (the ball where it lies) the gap wedge and the hybrid
  const play = async club => {
    await page.evaluate(c => window.__game.setShotClub(c), club); await sleep(300);
    await page.evaluate(() => window.__game.ownerSwing({ power: 1, acc: 0, boost: 0 }));
    await sleep(300);
    const more = await toBall();
    const t = await page.evaluate(() => window.__game.lastShotReport()?.text); rep.reports.push(t); log(club, t);
    return more;
  };
  let more = await play('iron7');
  if (more) more = await play('gw');
  if (more && await page.evaluate(() => window.__game.shotClubs().includes('hybrid'))) await play('hybrid');
  await sleep(600);
  await page.screenshot({ path: join(out, '7-shot-new-clubs.png') });
  rep.toasts2 = await toasts();
  writeFileSync(join(out, 'shots.json'), JSON.stringify(rep, null, 1));
} finally {
  await browser.close();
}
log(bad ? `FAILED: ${bad} page error(s)` : 'done');
process.exit(bad ? 1 : 0);

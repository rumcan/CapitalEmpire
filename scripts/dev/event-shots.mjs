// T246 (#708): your Club Championship and the Mayor's Cup as the game draws them (a headless Edge on the dev server, the old start's course,
// ?start=town&clubevent=club|mayor makes the first day of play the event's): the entry card (out by the handicap, then in), your round on the event's
// leaderboard, and the result (the Club Champion; the Mayor's Cup's presentation by the mayor's stand-in).
//   node scripts/dev/event-shots.mjs --base http://127.0.0.1:5186/ --out F:/ClaudeTemp/T246
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saves are not written (non-GET requests are answered locally).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/event-shots'), W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: !args.includes('--headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--window-position=-32000,-32000'] });
const log = (...a) => console.log(...a);

async function open(ev) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&clubevent=${ev}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); g.setSpeed(1); });
  await page.waitForFunction(() => !!window.__game?.golf?.clubEvents?.today, null, { timeout: 120000 }).catch(async () => log('no event day', await page.evaluate(() => { const g = window.__game; return JSON.stringify({ golf: !!g.golf, day: g.dayMinute, stage: g.traffic?.round?.stage }); })));
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const card = page => page.evaluate(() => JSON.stringify(window.__game.eventCard()));
/** plays n holes of your round by the caddie (Jump to ball, the caddie finishes the hole, Next hole) */
const holes = (page, n) => page.evaluate(n => { const g = window.__game; for (let k = 0; k < n; k++) { const r = g.yourRound(); if (!r || r.over) break; g.yourJump(); g.ownerCaddie(); g.yourNextHole(); } }, n);

const only = opt('only', '');
try {
  // 1. the Club Championship: the entry card (out at 18.5), then in after some practice, then playing on the board
  if (only !== 'mayor') {
    const { ctx, page } = await open('club');
    await page.evaluate(() => { const g = window.__game; g.youMe?.(); g.openEventCard('club'); });
    await page.waitForTimeout(600);
    log('club card', await card(page));
    await page.screenshot({ path: join(out, '1-entry-out.png') });
    await page.evaluate(() => { const g = window.__game, p = g.golf.player; g.golf.player = { ...p, skills: { ...p.skills, driving: p.skills.driving + 12, irons: p.skills.irons + 6 } }; g.emit(); });
    await page.waitForTimeout(600);
    log('club card (qualified)', await card(page));
    await page.screenshot({ path: join(out, '2-entry-in.png') });
    await page.evaluate(() => window.__game.playEvent('club'));
    await page.evaluate(() => window.__game.setSpeed(4));
    await page.waitForFunction(() => window.__game.playBoard()?.rows.length >= 3 || window.__game.dayMinute > 930, null, { timeout: 180000 }).catch(() => log('board thin'));
    await page.evaluate(() => window.__game.setSpeed(1));
    await holes(page, 4);
    await page.waitForTimeout(1200);
    log('board', JSON.stringify(await page.evaluate(() => window.__game.playBoard())));
    await page.screenshot({ path: join(out, '3-round-on-board.png') });
    await holes(page, 20);
    await page.evaluate(() => { const g = window.__game; if (g.yourRound()) g.yourRoundEnd(); });
    await page.waitForTimeout(1000);
    log('club result', await card(page));
    await page.screenshot({ path: join(out, '4-club-result.png') });
    await ctx.close();
  }
  // 2. the Mayor's Cup: play it with a strong game; the presentation
  if (only !== 'club') {
    const { ctx, page } = await open('mayor');
    log('mayor card', await card(page));
    await page.screenshot({ path: join(out, '5-mayor-today.png') });
    await page.evaluate(() => { const g = window.__game, p = g.golf.player; g.golf.player = { ...p, skills: { driving: 95, irons: 95, short: 95, putting: 95, nerve: 95 } }; g.playEvent('mayor'); });
    await holes(page, 20);
    await page.evaluate(() => { const g = window.__game; if (g.yourRound()) g.yourRoundEnd(); });
    await page.waitForTimeout(1000);
    log('mayor result', await card(page));
    log('titles', JSON.stringify(await page.evaluate(() => window.__game.golf.player.titles)));
    await page.screenshot({ path: join(out, '6-mayor-presentation.png') });
    await page.evaluate(() => { const g = window.__game; g.openEventCard(null); g.openPlayerCard(true); });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(out, '7-titles.png') });
    await ctx.close();
  }
} finally { await browser.close(); }

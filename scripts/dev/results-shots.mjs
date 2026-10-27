// T210 (#555): in-game shots of the tournament day's end on the old nine (?start=town): the live leaderboard after the 15:00 kick-off with golf still
// going (the results wait), the "last group on the 18th" moment (the toast and the board's banner, the camera on the group by Watch), and the results
// screen after the last putt (the champion, the final leaderboard, the takings).
//   node scripts/dev/results-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T210
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile, so each start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'output/results-shots');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const shot = async (page, name) => {
  const file = join(out, `${name}.jpg`);
  await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
  console.log(file); return file;
};
/** the day as the page sees it: the round's stage, the board's minute, the moment's names, waiting, done, the results open */
const state = page => page.evaluate(() => {
  const g = window.__game, b = g.playBoard();
  return { stage: g.traffic.round.stage, minute: b?.minute ?? null, last: b?.last ?? null, waiting: b?.waiting ?? null, champion: b?.champion ?? null, open: g.resultsOpen(), toasts: g.toasts.map(t => t.text).slice(-2) };
});
const hhmm = m => m === null ? '--' : `${Math.floor(m / 60)}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}?start=town`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__game.skipToTournament());
  await page.waitForFunction(() => { const g = window.__game; return g.traffic.round.stage === 'surge' && !!g.playBoard(); }, null, { timeout: 240000, polling: 500 });
  console.log('the tournament day', JSON.stringify(await state(page)));
  await page.evaluate(() => window.__game.setSpeed(20));
  // 1. after the kick-off, golf going on: the live board, the results waiting
  await page.waitForFunction(() => { const g = window.__game, b = g.playBoard(); return g.traffic.round.stage === 'eval' && b && b.minute >= 15 * 60 + 20; }, null, { timeout: 300000, polling: 200 });
  await page.evaluate(() => window.__game.setSpeed(0));
  await page.waitForTimeout(800);
  let s = await state(page); console.log('after kick-off', hhmm(s.minute), JSON.stringify(s));
  if (s.open) console.log('!! the results are open while golf goes on');
  await shot(page, '1-live-board-after-kickoff');
  // 2. the last group on the 18th: the toast, the banner, the camera on the group (Watch)
  await page.evaluate(() => window.__game.setSpeed(8));
  await page.waitForFunction(() => !!window.__game.playBoard()?.last, null, { timeout: 300000, polling: 100 });
  await page.evaluate(() => { const g = window.__game; g.setSpeed(0); g.watchLastGroup(); });
  await page.waitForTimeout(700);
  s = await state(page); console.log('the moment', hhmm(s.minute), JSON.stringify(s));
  await shot(page, '2-last-group-on-the-18th');
  // 3. after the last putt: the results
  await page.evaluate(() => window.__game.setSpeed(4));
  await page.waitForFunction(() => window.__game.resultsOpen(), null, { timeout: 300000, polling: 100 });
  await page.evaluate(() => window.__game.setSpeed(0));
  await page.waitForTimeout(800);
  s = await state(page); console.log('the results', hhmm(s.minute), JSON.stringify(s));
  await shot(page, '3-results-after-last-putt');
} finally {
  await browser.close();
}

// T389 (#1049): the welcome pull, in the real game (a headless Edge on the dev server, the old nine, ?start=town; a new game: empty cards, so the Space power-spam and the spin in the air are locked until a card is won):
//   1-welcome-toast.png     the top bar and the toast after the first click on the Bag chip: the Cards chip's badge says 1 pull waiting
//   2-cards-welcome.png     the Cards card with the one silver pull waiting and the machine's button
//   welcome.json            the numbers: what each step left in the player's cards
// The checks: a new game has no pull; the first visit to the pro shop (the Bag chip) deals ONE silver pull and the saved mark; more visits (the Bag, the Cards card, the machine) and a round deal nothing; the pull is spent at the
// machine and nothing comes back; the first round deals it for a game that has not been to the shop; a save from before the cards (no cards) and a save that has already opened a pull get none.
// Run (through the heavy-step lock, with a dev server on --base):
//   node scripts/dev/welcome-pull-check.mjs --base http://localhost:5187/ --out E:/ClaudeTemp/T389 [--seed 2]
// One headless Edge, closed when done; saves are not written (non-GET requests are answered locally). Exit 1 on a page error or a failed check.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5187/'), out = opt('out', 'output/welcome-pull'), seed = opt('seed', '2'), W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const log = (...a) => console.log(...a);
let bad = 0;
const expect = (ok, what) => { if (!ok) { bad++; log(`[FAIL] ${what}`); } else log(`[ok] ${what}`); };
const rep = {};
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
  const cards = () => page.evaluate(() => { const g = window.__game, c = g.golf.player.cards; return c ? { pulls: { ...c.pulls }, own: c.own.length, opened: c.opened, welcome: c.welcome ?? null, legacy: c.legacy ?? null, total: g.cardsPulls() } : null; });
  const toasts = () => page.evaluate(() => window.__game.toasts.map(t => t.text));
  const FRESH = { v: 1, own: [], slots: [null, null, null, null, null, null, null, null], pulls: { bronze: 0, silver: 0, gold: 0 }, opened: 0, junk: 0 };

  // ---- 0. a new game: empty cards, nothing waiting, no mark
  rep.start = await cards();
  expect(rep.start && rep.start.total === 0 && rep.start.own === 0 && rep.start.welcome === null && rep.start.legacy === null, 'a new game starts with empty cards (not legacy), no pull and no welcome mark');
  expect(await page.evaluate(() => !window.__game.yourRound() && window.__game.bagCard() === null && window.__game.cardsCard() === null), 'the shop is not open and no round is under way');

  // ---- 1. the first visit to the pro shop: a real click on the Bag chip
  await page.click('[data-testid=bag-chip]'); await page.waitForSelector('[data-testid=bag-card]', { timeout: 20000 }).catch(() => { /* the card's test id may differ: the engine's state is what is checked */ });
  await sleep(500);
  rep.visit = await cards();
  expect(rep.visit.pulls.silver === 1 && rep.visit.total === 1 && rep.visit.welcome === true, `the first visit to the pro shop dealt one silver pull and the mark: ${JSON.stringify(rep.visit.pulls)}`);
  rep.toast = (await toasts()).filter(t => /Welcome/.test(t));
  expect(rep.toast.length === 1 && /silver card pull/.test(rep.toast[0]) && /vending machine/.test(rep.toast[0]), `a toast says it once: "${rep.toast[0] ?? ''}"`);
  expect(await page.locator('[data-testid=cards-badge]').textContent() === '1', 'the Cards chip’s badge counts one pull waiting');
  await page.screenshot({ path: join(out, '1-welcome-toast.png'), clip: { x: 0, y: 0, width: 1100, height: 190 } });

  // ---- 2. more visits deal nothing: the Bag again, the Cards card, the machine
  await page.evaluate(() => { const g = window.__game; g.openBagCard(false); g.openBagCard(true); g.openBagCard(false); });
  await page.click('[data-testid=cards-chip]'); await page.waitForSelector('[data-testid=cards-card]', { timeout: 20000 }); await sleep(400);
  await page.evaluate(() => { document.querySelectorAll('div.absolute.top-20.z-30.flex-col.items-center').forEach(e => { e.style.visibility = 'hidden'; }); });
  await page.locator('[data-testid=cards-root]').screenshot({ path: join(out, '2-cards-welcome.png') });
  await page.click('[data-testid=cards-machine]'); await page.waitForSelector('[data-testid=vending-machine]', { timeout: 20000 }); await sleep(300);
  rep.again = await cards();
  expect(rep.again.pulls.silver === 1 && rep.again.total === 1 && (await toasts()).filter(t => /Welcome/.test(t)).length === 1, 'the Bag, the Cards card and the machine again: still one pull, one toast');

  // ---- 3. spend it at the machine (a real click on Spin): nothing comes back, not on the next visit, not at the first round
  await page.click('[data-testid=vending-spin]'); await page.waitForSelector('[data-testid=vending-result]', { timeout: 20000 }); await sleep(500);
  rep.spent = await cards();
  expect(rep.spent.total === 0 && rep.spent.opened === 1 && rep.spent.welcome === true, `the pull is spent (${JSON.stringify(rep.spent)})`);
  await page.keyboard.press('Escape'); await sleep(300);
  await page.evaluate(() => { const g = window.__game; g.openCardsCard(false); g.openCardsCard(true); g.openBagCard(true); g.openBagCard(false); g.openVending(true); g.openVending(false); g.openCardsCard(false); });
  await page.evaluate(() => window.__game.yourRoundStart('all')); await sleep(600);
  rep.round1 = await cards();
  expect(await page.evaluate(() => !!window.__game.yourRound()) && rep.round1.total === 0 && rep.round1.opened === 1, 'after the pull is spent a new visit and a first round deal nothing more');

  // ---- 4. a game that goes to the first round before the shop: the round deals it (the same one function, once)
  await page.evaluate((fresh) => { const g = window.__game; g.golf.player.cards = fresh; g.golf.player.round = undefined; g.yrCard = false; g.openBagCard(false); g.openCardsCard(false); g.openVending(false); g.toasts.length = 0; }, FRESH);
  rep.fresh2 = await cards();
  expect(rep.fresh2.total === 0 && rep.fresh2.welcome === null, 'a game with fresh cards again (no visit, no round yet)');
  await page.evaluate(() => window.__game.yourRoundStart('all')); await sleep(600);
  rep.round2 = await cards();
  expect(rep.round2.pulls.silver === 1 && rep.round2.welcome === true, `the first round dealt one silver pull: ${JSON.stringify(rep.round2.pulls)}`);
  const t2 = (await toasts()).filter(t => /Welcome/.test(t)); expect(t2.length === 1 && /first round/.test(t2[0]), `its toast: "${t2[0] ?? ''}"`);
  await page.evaluate(() => { const g = window.__game; g.openBagCard(true); g.openBagCard(false); g.openCardsCard(true); g.openCardsCard(false); });
  rep.round3 = await cards(); expect(rep.round3.pulls.silver === 1, 'the shop after the round deals no second pull');

  // ---- 5. a save from before the cards (no cards at all) and a save that already opened a pull: none dealt
  await page.evaluate(() => { const g = window.__game; g.golf.player.round = undefined; g.openBagCard(false); g.openCardsCard(false); delete g.golf.player.cards; g.toasts.length = 0; });
  await page.evaluate(() => { const g = window.__game; g.openBagCard(true); g.openBagCard(false); g.openCardsCard(true); g.openCardsCard(false); });
  rep.old = await cards();
  expect(rep.old === null && !(await toasts()).some(t => /Welcome/.test(t)), 'a save from before the cards (no cards) gets no pull: it keeps both mechanics');
  await page.evaluate((fresh) => { const g = window.__game; g.golf.player.cards = { ...fresh, opened: 2, junk: 1 }; g.toasts.length = 0; }, FRESH);
  await page.evaluate(() => { const g = window.__game; g.openBagCard(true); g.openBagCard(false); g.openCardsCard(true); g.openCardsCard(false); });
  rep.met = await cards();
  expect(rep.met.total === 0 && rep.met.welcome === null && !(await toasts()).some(t => /Welcome/.test(t)), 'a save that already opened pulls gets none');
  // the json the profile saves: the mark and the pull are plain data
  rep.json = await page.evaluate((fresh) => { const g = window.__game; g.golf.player.cards = fresh; g.openBagCard(true); g.openBagCard(false); return JSON.parse(JSON.stringify(g.golf.player.cards)); }, FRESH);
  expect(rep.json.welcome === true && rep.json.pulls.silver === 1, 'the cards the game would save carry the mark and the pull');
} finally {
  await browser.close();
}
writeFileSync(join(out, 'welcome.json'), JSON.stringify(rep, null, 1));
log(bad ? `${bad} problem(s)` : 'all checks passed');
process.exit(bad ? 1 : 0);

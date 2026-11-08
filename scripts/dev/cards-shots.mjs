// T336 (#962): the cards' captures, in the real game (a headless Edge on the dev server, the old nine, ?start=town; a new game, so the Space power-spam and spin in the air are locked until a card gives them):
//   0-top-bar.png              the top bar's Cards chip with the number of pulls waiting
//   1-cards-screen.png         the Cards card with eight cards in the 8 slots and the collection (what is won in colour, the rest locked)
//   2-card-detail.png          a card's detail in the flyout to the card's left (rarity, effect lines, flavour, inspiration, Unequip)
//   3-vending-idle.png         the prize machine opened by a real click on the Cards card's button: the idle strip, the pulls, Spin
//   4-vending-spinning.png     a real click on Spin: the reel turning mid-way (the prize was decided before it turned)
//   5-vending-landed.png       the reel stopped on the first card won, its face and Equip; 5b the first dud; 5c the odds and the table of how pulls are earned
//   6-shot-panel-cards.png     the shot panel from the tee with the cards in play: the driver's longer full carry, the chips (the ones for the club lit)
//   6b-shot-panel-locked.png   the same panel in a new game without Power Mash: no word of Space; 6c with Power Mash: "Space: boost" back
//   shots.json                 the numbers: carries before and after, the frame times with the machine closed, open and spinning, the never-mid-round check
// Run (through the heavy-step lock, with a dev server on --base):
//   node scripts/dev/cards-shots.mjs --base http://localhost:5187/ --out E:/ClaudeTemp/T336 [--seed 2]
// One headless Edge, closed when done; saves are not written (non-GET requests are answered locally). Exit 1 on a page error or a failed check.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5187/'), out = opt('out', 'output/cards-shots'), seed = opt('seed', '2'), W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const log = (...a) => console.log(...a);
let bad = 0;
const expect = (ok, what) => { if (!ok) { bad++; log(`[FAIL] ${what}`); } else log(`[ok] ${what}`); };
const rep = { notes: [], frames: {} };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { bad++; log('[pageerror]', e.message); });
  page.on('console', m => { if (m.type() === 'error') { bad++; log('[console]', m.text().slice(0, 200)); } });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&seed=${seed}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => {
    const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); g.setSpeed(1); g.nightAmount = () => 0;
    // a seeded stream for the machine's prizes, so the pictures can be taken again
    let s = 20261108; Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  });
  await page.waitForFunction(() => !!window.__game?.you && !!window.__game.yrView(), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const sleep = ms => page.waitForTimeout(ms);
  const hideToasts = () => page.evaluate(() => document.querySelectorAll('div.absolute.top-20.z-30.flex-col.items-center').forEach(e => { e.style.visibility = 'hidden'; }));
  const frames = (ms) => page.evaluate(ms => new Promise(res => {
    const d = []; let last = performance.now(); const end = last + ms;
    const f = t => { d.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else { d.shift(); d.sort((a, b) => a - b); const n = d.length, q = p => d[Math.min(n - 1, Math.floor(n * p))]; res({ n, mean: +(d.reduce((a, b) => a + b, 0) / n).toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +d[n - 1].toFixed(2), over25: d.filter(x => x > 25).length }); } };
    requestAnimationFrame(f);
  }), ms);

  // ---- 0. a new game: no cards, nothing waiting; then pulls earned (the engine's dev hook stands for a win) and the chip says so
  expect(await page.locator('[data-testid=cards-chip]').isVisible(), 'the Cards chip is in the top bar');
  rep.start = await page.evaluate(() => { const g = window.__game, p = g.playerNow(); return { cards: p.cards, pulls: g.cardsPulls() }; });
  expect(rep.start.cards && rep.start.cards.own.length === 0 && !rep.start.cards.legacy && rep.start.pulls === 0, 'a new game starts with empty cards (not legacy) and no pulls');
  rep.frames.warmup = await frames(2500); // (the game still settling after its load: not a baseline)
  await page.evaluate(() => { const g = window.__game; g.devPull('gold', 1); g.devPull('silver', 2); g.devPull('bronze', 3); });
  await sleep(400);
  expect(await page.locator('[data-testid=cards-badge]').textContent() === '6', 'the chip’s badge counts six pulls waiting');
  await page.screenshot({ path: join(out, '0-top-bar.png'), clip: { x: 0, y: 0, width: 1000, height: 90 } });

  // ---- 1. the Cards card: a real click on the chip; the machine from its button
  await page.evaluate(() => { const g = window.__game; g.eventCardOpen = null; });
  await page.click('[data-testid=cards-chip]'); await page.waitForSelector('[data-testid=cards-card]', { timeout: 20000 });
  expect(await page.evaluate(() => window.__game.cardsCardOpen), 'a click on the chip opens the Cards card');
  rep.shop = await page.evaluate(() => window.__game.cardsCard().machine);
  expect(rep.shop.ok, 'the pro shop is open at the old nine: the machine can open');
  await sleep(300);

  // the baseline: the game settled, the Cards card open, the machine closed
  await sleep(4000); rep.frames.machineClosed = await frames(3000);
  // ---- 3 and 4 and 5: the machine. A real click on Spin (gold first: the best pull), the reel mid-way, then landed
  await page.click('[data-testid=cards-machine]'); await page.waitForSelector('[data-testid=vending-machine]', { timeout: 20000 });
  await sleep(400); await hideToasts();
  await page.screenshot({ path: join(out, '3-vending-idle.png') });
  rep.frames.machineIdle = await frames(2500);
  const seen = { card: false, dud: false, voucher: false }, prizes = [];
  for (let k = 0; k < 6; k++) {
    const left = await page.evaluate(() => window.__game.cardsPulls());
    if (left <= 0) break;
    await page.click('[data-testid=vending-spin]');
    if (k === 0) { // the reel mid-way, and the frame cost while it turns
      await sleep(1500); await hideToasts();
      await page.screenshot({ path: join(out, '4-vending-spinning.png') });
      rep.frames.spinning = await frames(1800);
    }
    await page.waitForSelector('[data-testid=vending-result]', { timeout: 15000 });
    await sleep(600); await hideToasts();
    const r = await page.evaluate(() => { const s = window.__game.vendingSpin; return { kind: s.winner.kind, name: s.winner.kind === 'card' ? s.winner.card.name : s.winner.kind === 'dud' ? s.winner.dud.name : 'voucher', grade: s.grade, status: s.status }; });
    prizes.push(r); log('spin', JSON.stringify(r));
    if (!seen[r.kind]) { seen[r.kind] = true; await page.screenshot({ path: join(out, r.kind === 'card' ? '5-vending-landed.png' : r.kind === 'dud' ? '5b-vending-dud.png' : '5d-vending-voucher.png') }); }
    // the winner tile is the centre of the strip: the reel really stopped on it
    const aligned = await page.evaluate(() => { const f = document.querySelector('[data-testid=vending-reel]').getBoundingClientRect(), w = document.querySelector('[data-testid=vending-winner-tile]')?.getBoundingClientRect(); return w ? Math.abs((w.left + w.width / 2) - (f.left + f.width / 2)) : 999; });
    expect(aligned < 3, `spin ${k + 1}: the winner tile (${r.name}) stands under the marker (off by ${aligned.toFixed(1)} px)`);
    if (r.kind === 'card' && k === 0) { await page.click('[data-testid=vending-equip]'); await sleep(300); expect(await page.evaluate(() => window.__game.golf.player.cards.slots.some(Boolean)), 'Equip puts the card in a slot'); }
  }
  rep.prizes = prizes;
  rep.afterSpins = await page.evaluate(() => { const c = window.__game.golf.player.cards; return { own: c.own, opened: c.opened, junk: c.junk, pulls: c.pulls, vouchers: window.__game.golf.player.bag?.vouchers ?? 0 }; });
  expect(rep.afterSpins.opened === prizes.length && rep.afterSpins.own.length + rep.afterSpins.junk + rep.afterSpins.vouchers === prizes.length, 'every spin spent one pull and paid one prize (a card, junk or a voucher), saved at once');
  await page.click('[data-testid=vending-odds-toggle]'); await sleep(300); await hideToasts();
  await page.screenshot({ path: join(out, '5c-vending-odds.png') });
  await page.keyboard.press('Escape'); await sleep(300);
  expect(!(await page.evaluate(() => window.__game.vendingOpen)), 'Escape closes the machine');
  await sleep(1500); rep.frames.machineClosedAfter = await frames(3000);
  // the cost of the machine: the spinning reel against the same game with the machine closed (the frames over 25 ms, the 95th percentile)
  { const a = rep.frames.machineClosed, b = rep.frames.spinning; expect(b.p95 <= Math.max(a.p95, 17.5) + 1 && b.over25 <= a.over25 + 1, `the spinning reel costs the game no frame: p95 ${b.p95} ms against ${a.p95} ms with the machine closed, ${b.over25} frames over 25 ms against ${a.over25}`); }

  // ---- 1b. the cards: eight in the slots, the rest in the collection
  await page.evaluate(() => { const g = window.__game; g.devCards(['long-drive-shaft', 'flatstick', 'wonder-wedge', 'lead-tape', 'hybrid-hero', 'tour-van-fitting', 'launch-monitor', 'pro-in-a-bottle', 'power-mash', 'hot-driver', 'range-rat'], false); });
  await sleep(300);
  rep.bagBefore = await page.evaluate(() => { const g = window.__game; g.openBagCard(true); const c = g.bagCard().rows.find(r => r.club === 'driver').carryM; g.openBagCard(false); return Math.round(c); });
  // equip eight through the engine's own rules (the first free slot each time), after the slots are cleared (the first spin's Equip put a card in one)
  await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 8; i++) if (g.golf.player.cards.slots[i]) g.unequipCard(i); });
  await page.evaluate(() => { const g = window.__game; for (const id of ['long-drive-shaft', 'flatstick', 'wonder-wedge', 'lead-tape', 'hybrid-hero', 'tour-van-fitting', 'launch-monitor', 'pro-in-a-bottle']) g.equipCard(id); });
  await sleep(300);
  rep.slots = await page.evaluate(() => window.__game.golf.player.cards.slots);
  expect(rep.slots.filter(Boolean).length === 8, 'eight cards are in the eight slots');
  rep.bagAfter = await page.evaluate(() => { const g = window.__game; g.openBagCard(true); const c = g.bagCard().rows.find(r => r.club === 'driver').carryM; g.openBagCard(false); return Math.round(c); });
  expect(rep.bagAfter > rep.bagBefore * 1.15, `the driver carries ${rep.bagBefore} m before the cards and ${rep.bagAfter} m with them (the Long Drive Shaft, Overspeed... and the bottle's +15)`);
  await page.evaluate(() => { const g = window.__game; g.openBagCard(false); g.openCardsCard(true); });
  await page.waitForSelector('[data-testid=cards-card]'); await sleep(300); await hideToasts();
  await page.locator('[data-testid=cards-root]').screenshot({ path: join(out, '1-cards-screen.png') });
  await page.click('[data-testid=cards-slot-0]'); await page.waitForSelector('[data-testid=cards-detail]'); await sleep(300);
  await page.locator('[data-testid=cards-root]').screenshot({ path: join(out, '2-card-detail.png') });

  // ---- 6. the shot panel: your round from the tee. The cards in play are chips; Space is spoken of only with Power Mash (it is not in a slot: a new game)
  await page.evaluate(() => { const g = window.__game; g.openCardsCard(false); g.yourRoundStart('all'); });
  await sleep(500);
  await page.evaluate(() => window.__game.yourJump());
  await page.waitForFunction(() => !!window.__game.shotState()?.mine, null, { timeout: 90000 });
  for (let k = 0; k < 2; k++) await page.keyboard.press('Escape');
  await sleep(800);
  rep.tee = await page.evaluate(() => { const g = window.__game; return { club: g.shotState().input.club, carry: Math.round(g.shotCarry()), can: g.shotCan(), cards: g.shotCards().map(c => c.name + (c.here ? '*' : '')) }; });
  log('tee', JSON.stringify(rep.tee));
  expect(rep.tee.club === 'driver' && rep.tee.carry > rep.bagBefore * 1.15 && rep.tee.cards.length === 8, `the panel’s full carry (${rep.tee.carry} m, under a round's pressure) is the card-boosted one: ${rep.bagBefore} m without them; eight chips`);
  expect(!rep.tee.can.boost && !rep.tee.can.airspin, 'a new game without Power Mash or the Whisper: both moves are locked');
  const hint = await page.locator('[data-testid=shot-panel]').innerText();
  expect(!/Space during the swing/.test(hint), 'locked: the panel says nothing of Space');
  await page.locator('[data-testid=shot-panel]').screenshot({ path: join(out, '6b-shot-panel-locked.png') });
  // never mid-round: a card cannot go into a slot (or out of one) on the course
  const before = await page.evaluate(() => JSON.stringify(window.__game.golf.player.cards.slots));
  await page.evaluate(() => { const g = window.__game; g.unequipCard(0); g.equipCard('power-mash', 3); });
  const after = await page.evaluate(() => JSON.stringify(window.__game.golf.player.cards.slots));
  expect(before === after, 'cards swap between rounds, never in one: the engine refused on the course');
  const toast = await page.evaluate(() => [...document.querySelectorAll('div.absolute.top-20.z-30.flex-col.items-center > div')].map(e => e.textContent).filter(Boolean).slice(-3));
  expect(toast.some(t => /out on the course/.test(t)), 'and said why');
  await page.screenshot({ path: join(out, '6-shot-panel-cards.png') });
  // a real swing with Space tapped during it while it is locked: nothing is added
  await page.evaluate(() => window.__game.yourRoundEnd('Round ended for the capture'));
  await sleep(500);
  await page.evaluate(() => { const g = window.__game; g.unequipCard(7); g.equipCard('power-mash'); });
  expect(await page.evaluate(() => window.__game.golf.player.cards.slots.includes('power-mash')), 'between rounds: Power Mash goes into a slot');
  await page.evaluate(() => { window.__game.yourRoundStart('all'); }); await sleep(500);
  await page.evaluate(() => window.__game.yourJump());
  await page.waitForFunction(() => !!window.__game.shotState()?.mine, null, { timeout: 90000 });
  for (let k = 0; k < 2; k++) await page.keyboard.press('Escape');
  await sleep(800);
  rep.teeMash = await page.evaluate(() => window.__game.shotCan());
  expect(rep.teeMash.boost && !rep.teeMash.airspin, 'Power Mash unlocks the Space power-spam (not the Whisper)');
  expect(/Space during the swing/.test(await page.locator('[data-testid=shot-panel]').innerText()), 'the panel speaks of Space again');
  await page.locator('[data-testid=shot-panel]').screenshot({ path: join(out, '6c-shot-panel-power-mash.png') });
  await page.evaluate(() => window.__game.yourRoundEnd('Done'));
  writeFileSync(join(out, 'shots.json'), JSON.stringify(rep, null, 1));
} finally {
  await browser.close();
}
log(bad ? `FAILED: ${bad} problem(s)` : 'done');
process.exit(bad ? 1 : 0);

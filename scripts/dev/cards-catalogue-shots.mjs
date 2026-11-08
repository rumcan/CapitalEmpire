// T337 (#963): the card catalogue's captures, in the real game (a headless Edge on the dev server, the old nine, ?start=town; a new game):
//   10-help-cards.png            Help's Cards tab (a real click on the Help button, then the tab): every card by rarity (legendary first) with what it does, its flavour and its inspiration
//   10b-help-cards-rare.png      the same list scrolled to the rares
//   10c-vending-spinning.png / 10d-vending-landed.png  the prize machine with the 50-card catalogue: a gold pull spinning and landing
//   11-cards-eight-slots.png     the Cards card with eight of the new cards in the 8 slots and 22 of the 50 in the collection
//   12-tee-tools.png             the shot panel from the tee: the laser's lines, Slope Mode's rise, the caddie's club, the second ball's toggle, the cards in play as chips
//   13-deck-driver.png           the shot panel from the fairway: the driver is on the club strip (Driver Off the Deck), flatter and straighter; the same lie without the card has no driver (13b)
//   14-putt-read-pace.png        the putt panel: Read the Feet's green read and the Pace Putting Robot's band round 100% on the meter
//   15-tee-no-cards.png          the same tee shot with no cards: none of those lines (the golden: a game with no cards plays as before)
//   shots.json                   the numbers: the lines, the clubs on each lie, the cost of shotTools() per call, the frames with the panel open
// Run (through the heavy-step lock, with a dev server on --base):
//   node scripts/dev/cards-catalogue-shots.mjs --base http://localhost:5187/ --out E:/ClaudeTemp/T337 [--seed 2]
// One headless Edge, closed when done; saves are not written (non-GET requests are answered locally). Exit 1 on a page error or a failed check.
// (The old nine has no ground height field: the capture gives the game a gentle one for the putt so Read the Feet has a slope to read; Slope Mode on the tee says what the field says.)
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5187/'), out = opt('out', 'output/cards-catalogue-shots'), seed = opt('seed', '2'), W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const SLOTS = ['laser-rangefinder', 'slope-mode', 'mic-caddie', 'scramble-captain', 'deck-driver', 'wind-whisperer', 'pace-robot', 'read-the-feet'];
const OTHERS = ['wonder-wedge', 'range-rat', 'lucky-marker', 'power-mash', 'broomstick', 'hybrid-hero', 'tour-van-fitting', 'long-drive-shaft', 'flatstick', 'launch-monitor', 'pro-in-a-bottle', 'snowman-eraser', 'clutch-gene', 'cold-beer'];
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
  await page.evaluate(() => { const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); g.setSpeed(1); g.nightAmount = () => 0; });
  await page.waitForFunction(() => !!window.__game?.you && !!window.__game.yrView(), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const sleep = ms => page.waitForTimeout(ms);
  const hideToasts = () => page.evaluate(() => document.querySelectorAll('div.absolute.top-20.z-30.flex-col.items-center').forEach(e => { e.style.visibility = 'hidden'; }));
  const frames = (ms) => page.evaluate(ms => new Promise(res => {
    const d = []; let last = performance.now(); const end = last + ms;
    const f = t => { d.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else { d.shift(); d.sort((a, b) => a - b); const n = d.length, q = p => d[Math.min(n - 1, Math.floor(n * p))]; res({ n, mean: +(d.reduce((a, b) => a + b, 0) / n).toFixed(2), p95: +q(0.95).toFixed(2), max: +d[n - 1].toFixed(2), over25: d.filter(x => x > 25).length }); } };
    requestAnimationFrame(f);
  }), ms);
  const openShot = async () => { await page.evaluate(() => window.__game.yourJump()); await page.waitForFunction(() => !!window.__game.shotState()?.mine, null, { timeout: 90000 }); for (let k = 0; k < 2; k++) await page.keyboard.press('Escape'); await sleep(900); await hideToasts(); };
  const closeShot = async () => { await page.evaluate(() => window.__game.closeShot()); await sleep(300); };
  // the open shot closed, your ball put on the fairway (the middle of the hole's line) or on the green (9 m from the pin, with a gentle slope the game is given), and the shot opened again: ONE synchronous step (the engine opens a shot of its own when you stand at your ball)
  const reopenAt = async (where) => {
    await page.evaluate(where => {
      const g = window.__game; g.closeShot(); const r = g.yourRound(), v = g.yrView(), h = v.holes[r.card[r.at].i];
      if (where === 'fairway') { const p = h.line[Math.max(1, Math.floor(h.line.length / 2))]; r.ball = { x: p.x, y: p.y }; r.lie = 'fairway'; }
      else { const a = h.line[h.line.length - 2] ?? h.tee, dx = h.pin.x - a.x, dy = h.pin.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, ball = { x: h.pin.x - ux * 9 / 2, y: h.pin.y - uy * 9 / 2 };
        r.ball = ball; r.lie = 'green'; g.ballHeight = (x, y) => { const rx = x - ball.x, ry = y - ball.y, along = rx * ux + ry * uy, cross = -rx * uy + ry * ux; return 0.03 * along + 0.05 * cross; }; }
      g.yourJump();
    }, where);
    await page.waitForFunction(() => !!window.__game.shotState()?.mine, null, { timeout: 30000 }); await sleep(900); await hideToasts();
  };

  // ---- 10. Help's Cards tab: a real click on the Help button, then on the tab (the owned ones are marked)
  await page.evaluate(() => { const g = window.__game; g.devCards(['deck-driver', 'clutch-gene', 'snowman-eraser'], false); });
  await page.click('button[aria-label=Help]'); await page.waitForSelector('[data-testid=help-cards-tab]', { timeout: 20000 });
  await page.click('[data-testid=help-cards-tab]'); await page.waitForSelector('[data-testid=cards-help]', { timeout: 20000 }); await sleep(500);
  rep.help = await page.evaluate(() => ({ articles: document.querySelectorAll('[data-testid^=cards-help-card-]').length, inspired: (document.querySelector('[data-testid=cards-help]').innerText.match(/Inspired by:/g) ?? []).length, won: [...document.querySelectorAll('[data-testid^=cards-help-card-] span')].filter(e => e.textContent === 'won').length,
    sideways: (() => { const el = document.querySelector('[data-testid=cards-help] .overflow-y-auto'); return el ? el.scrollWidth > el.clientWidth + 1 : false; })() }));
  expect(rep.help.articles === 50 && rep.help.inspired === 50, `Help’s Cards page lists ${rep.help.articles} cards, each with its inspiration`); expect(rep.help.won === 3, 'the three cards won are marked');
  expect(!rep.help.sideways, 'the list has no sideways scrollbar');
  await hideToasts(); await page.locator('[data-testid=help]').screenshot({ path: join(out, '10-help-cards.png') });
  await page.evaluate(() => { const el = document.querySelector('[data-testid=cards-help-rare]'); el?.scrollIntoView({ block: 'start' }); }); await sleep(300);
  await page.locator('[data-testid=help]').screenshot({ path: join(out, '10b-help-cards-rare.png') });
  await page.keyboard.press('Escape'); await sleep(300);
  if (await page.locator('[data-testid=help]').count()) { await page.evaluate(() => window.__game.keysSheet?.show(false)); await sleep(300); }
  expect((await page.locator('[data-testid=help]').count()) === 0, 'Help closes');

  // ---- 10c. the machine with the whole catalogue in it: a gold pull spinning (the reel's faces are the 50 cards now) and landing; a seeded stream so the picture can be taken again
  await page.evaluate(() => { let s = 20261108; Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; const g = window.__game; g.devPull('gold', 3); g.openVending(true); });
  await sleep(500);
  if (await page.locator('[data-testid=vending-machine]').count()) {
    await hideToasts();
    await page.click('[data-testid=vending-spin]'); await sleep(1500); await hideToasts();
    await page.screenshot({ path: join(out, '10c-vending-spinning.png') });
    await page.waitForSelector('[data-testid=vending-result]', { timeout: 15000 }); await sleep(600); await hideToasts();
    rep.pull = await page.evaluate(() => { const s = window.__game.vendingSpin; return { kind: s.winner.kind, name: s.winner.kind === 'card' ? s.winner.card.name : s.winner.kind === 'dud' ? s.winner.dud.name : 'voucher', grade: s.grade, status: s.status }; });
    log('pull', JSON.stringify(rep.pull));
    await page.screenshot({ path: join(out, '10d-vending-landed.png') });
    expect(rep.pull.status === 'won' || rep.pull.kind !== undefined, `the reel stopped on ${rep.pull.name} (${rep.pull.kind}, a ${rep.pull.grade} pull)`);
    await page.evaluate(() => window.__game.openVending(false)); await sleep(300);
  } else expect(false, 'the prize machine opens (the pro shop of the old nine)');

  // ---- 11. the Cards card: eight of the new cards in the slots, 22 of the 50 owned
  await page.evaluate(([slots, others]) => { const g = window.__game; g.devCards([...slots, ...others], false); for (let i = 0; i < 8; i++) if (g.golf.player.cards.slots[i]) g.unequipCard(i); for (const id of slots) g.equipCard(id); }, [SLOTS, OTHERS]);
  await sleep(300);
  rep.slots = await page.evaluate(() => window.__game.golf.player.cards.slots);
  expect(rep.slots.filter(Boolean).length === 8 && SLOTS.every(id => rep.slots.includes(id)), 'eight of the new cards are in the eight slots');
  await page.evaluate(() => { window.__game.openCardsCard(true); }); await page.waitForSelector('[data-testid=cards-card]'); await sleep(400); await hideToasts();
  await page.locator('[data-testid=cards-root]').screenshot({ path: join(out, '11-cards-eight-slots.png') });
  await page.evaluate(() => window.__game.openCardsCard(false)); await sleep(300);

  // ---- 12. the shot panel from the tee: the tools and the cards in play
  await page.evaluate(() => { window.__game.yourRoundStart('all'); }); await sleep(600);
  await openShot();
  rep.tee = await page.evaluate(() => { const g = window.__game, t = g.shotTools(); return { club: g.shotState().input.club, lie: g.shotState().turn.lie, carry: Math.round(g.shotCarry()), can: g.shotCan(), tools: t, cards: g.shotCards().map(c => c.name + (c.here ? '*' : '')), clubs: g.shotClubs() }; });
  log('tee', JSON.stringify(rep.tee));
  expect(rep.tee.lie === 'tee' && rep.tee.can.laser && rep.tee.can.slope && rep.tee.can.caddie && rep.tee.can.scramble && rep.tee.can.deck && rep.tee.can.pace && rep.tee.can.read, 'the eight cards unlock the laser, Slope Mode, the caddie, the second ball, the deck driver, the pace window and the green read');
  expect(rep.tee.tools && rep.tee.tools.lines.some(l => /^Pin \d+\.\d m · aim \d+\.\d m$/.test(l)), 'the laser gives the distance to the pin to a tenth of a metre');
  expect(rep.tee.tools.lines.some(l => /^Slope Mode: /.test(l)) && rep.tee.tools.lines.some(l => /^Caddie: /.test(l)), 'Slope Mode and the caddie speak');
  expect(rep.tee.tools.scramble && rep.tee.tools.scramble.left === 1, 'the second ball: one left on this nine');
  expect(rep.tee.cards.length === 8, 'eight chips for the cards in play');
  // the frames in the SAME open shot: the tools on, then shotTools() answering null (no block, no band), then on again (before any screenshot: those leave the compositor busy)
  await sleep(2000); rep.frames.toolsOn = await frames(3000);
  await page.evaluate(() => { const g = window.__game; g.shotTools = () => null; g.emit(); }); await sleep(1000); rep.frames.toolsOff = await frames(3000);
  await page.evaluate(() => { const g = window.__game; delete g.shotTools; g.emit(); }); await sleep(1000); rep.frames.toolsOn2 = await frames(3000);
  { const on = [rep.frames.toolsOn, rep.frames.toolsOn2], off = rep.frames.toolsOff, worst = on.reduce((a, b) => (b.p95 > a.p95 ? b : a));
    expect(worst.p95 <= Math.max(off.p95, 17.5) + 1 && worst.over25 <= off.over25 + 2, `the tools cost the game no frame: p95 ${on.map(f => f.p95).join(' / ')} ms with them (two runs), ${off.p95} ms without; frames over 25 ms ${on.map(f => f.over25).join(' / ')} against ${off.over25}`); }
  await page.screenshot({ path: join(out, '12-tee-tools-full.png') });
  await page.locator('[data-testid=shot-panel]').screenshot({ path: join(out, '12-tee-tools.png') });
  // the cost of the tools: shotTools() is read when the panel renders (never per frame); 200 calls
  rep.toolsMs = await page.evaluate(() => { const g = window.__game; g.shotTools(); const t0 = performance.now(); for (let i = 0; i < 200; i++) { g.laserMemo = null; g.shotTools(); } const cold = (performance.now() - t0) / 200, t1 = performance.now(); for (let i = 0; i < 200; i++) g.shotTools(); return { cold: +cold.toFixed(3), memo: +((performance.now() - t1) / 200).toFixed(3) }; });
  expect(rep.toolsMs.cold < 1.5, `shotTools() costs ${rep.toolsMs.cold} ms a call when the laser reads the line afresh and ${rep.toolsMs.memo} ms when nothing moved (only when the panel renders, never per frame)`);
  // the toggle: a real click
  if (await page.locator('[data-testid=scramble-toggle]').count()) {
    await page.click('[data-testid=scramble-toggle]'); await sleep(300);
    expect(await page.evaluate(() => !!window.__game.shotState().scr), 'a click on the toggle puts the second ball on'); await hideToasts();
    await page.locator('[data-testid=shot-panel]').screenshot({ path: join(out, '12b-tee-scramble-on.png') });
    await page.click('[data-testid=scramble-toggle]'); await sleep(200);
  } else expect(false, 'the scramble toggle is on the panel');

  // ---- 13. the shot panel from the fairway: Driver Off the Deck puts the driver on the strip
  await reopenAt('fairway');
  rep.deck = await page.evaluate(() => { const g = window.__game; return { lie: g.shotState().turn.lie, clubs: g.shotClubs(), club: g.shotState().input.club, tools: g.shotTools() }; });
  log('deck', JSON.stringify(rep.deck));
  expect(rep.deck.lie === 'fairway' && rep.deck.clubs.includes('driver'), 'with the card the driver is on the strip from the fairway');
  await page.evaluate(() => window.__game.setShotClub('driver')); await sleep(500); await hideToasts();
  rep.deck.driverCarry = await page.evaluate(() => Math.round(window.__game.shotCarry()));
  await page.locator('[data-testid=shot-panel]').screenshot({ path: join(out, '13-deck-driver.png') });
  // the same fairway lie without the card: no driver
  await closeShot();
  await page.evaluate(() => { const g = window.__game; g.yourRoundEnd('capture'); }); await sleep(500);
  await page.evaluate(() => { const g = window.__game; const i = g.golf.player.cards.slots.indexOf('deck-driver'); g.unequipCard(i); }); await sleep(300);
  await page.evaluate(() => { window.__game.yourRoundStart('all'); }); await sleep(600);
  await reopenAt('fairway');
  rep.noDeck = await page.evaluate(() => ({ clubs: window.__game.shotClubs(), can: window.__game.shotCan().deck }));
  expect(!rep.noDeck.clubs.includes('driver') && !rep.noDeck.can, 'without the card the fairway has no driver');
  await page.locator('[data-testid=shot-panel]').screenshot({ path: join(out, '13b-no-deck-driver.png') });

  // ---- 14. a putt: Read the Feet's line and the Pace Putting Robot's band on the meter (the game is given a gentle slope for the putt); both cards are still in their slots
  await closeShot(); await page.evaluate(() => window.__game.yourRoundEnd('capture')); await sleep(500);
  await page.evaluate(() => { window.__game.yourRoundStart('all'); }); await sleep(600);
  await reopenAt('green');
  rep.putt = await page.evaluate(() => { const g = window.__game, t = g.shotTools(); return { club: g.shotState().input.club, lie: g.shotState().turn.lie, distM: g.shotState().turn.distM, tools: t }; });
  log('putt', JSON.stringify(rep.putt));
  expect(rep.putt.club === 'putter' && rep.putt.tools && rep.putt.tools.lines.some(l => /^Green read: /.test(l) && !/flat/.test(l)), 'Read the Feet reads the green (not flat)');
  expect(rep.putt.tools.paceHalf !== null && rep.putt.tools.paceHalf > 0, `the Pace Putting Robot's band is ${rep.putt.tools.paceHalf} either side of 100%`);
  await page.locator('[data-testid=shot-panel]').screenshot({ path: join(out, '14-putt-read-pace.png') });

  // ---- 15. the same tee shot with no cards: no tools, no chips
  await page.evaluate(() => { const g = window.__game; g.yourRoundEnd('capture'); }); await sleep(500);
  await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 8; i++) if (g.golf.player.cards.slots[i]) g.unequipCard(i); }); await sleep(300);
  await page.evaluate(() => { window.__game.yourRoundStart('all'); }); await sleep(600);
  await openShot();
  rep.none = await page.evaluate(() => { const g = window.__game; return { tools: g.shotTools(), cards: g.shotCards().length, can: g.shotCan(), carry: Math.round(g.shotCarry()) }; });
  expect(rep.none.tools === null && rep.none.cards === 0 && !rep.none.can.laser && !rep.none.can.deck, 'no cards: no tools block, no chips');
  await sleep(1500); rep.frames.panelNone = await frames(3000);
  await page.locator('[data-testid=shot-panel]').screenshot({ path: join(out, '15-tee-no-cards.png') });
  await page.evaluate(() => window.__game.yourRoundEnd('Done'));
  writeFileSync(join(out, 'shots.json'), JSON.stringify(rep, null, 1));
} finally {
  await browser.close();
}
log(bad ? `FAILED: ${bad} problem(s)` : 'done');
process.exit(bad ? 1 : 0);

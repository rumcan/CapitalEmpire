// T349 (#992): the hole card's Play, in the real game (a headless Edge on the dev server):
//   1-hole-card-choice.png   the hole card with Play pressed: Just hole N / All N / Cancel
//   2-practice-hole-mid.png  mid-hole after Just hole N: you at the tee, the shot panel open, the bar tagged Practice
//   3-practice-result.png    the hole's score card (the score in words, Back to the course)
// and checks: the round is a one-hole practice round on that hole, the caddie finishes it, Back to the course records nothing and puts back the camera, the tool, the side modes and the hole card;
// All N plays every real hole once.
//   node scripts/dev/practice-hole-shots.mjs --base http://localhost:5187/ --out E:/ClaudeTemp/T334/t349shots [--seed 2]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saves are not written. Exit 1 on a fault.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5187/'), out = opt('out', 'output/practice-hole-shots'), seed = opt('seed', '2'), W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const log = (...a) => console.log(...a);
let bad = 0;
const check = (ok, what) => { if (!ok) { bad++; log('  FAIL:', what); } else log('  ok:', what); };
const rep = {};
const waitFor = (page, fn, arg, ms = 60000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 });
const snap = page => page.evaluate(() => {
  const g = window.__game, p = g.golf.player, r = g.yourRound(), c = g.cam;
  return { cam: { X: c.X, Y: c.Y, z: c.z }, tool: g.tool, holes: !!g.holesTool, card: g.holeCardHole, rounds: p.rounds.length, hcp: p.rounds.at(-1)?.hcp ?? null, round: r ? { practice: !!r.practice, holes: r.card.map(x => x.n), over: r.over, holed: r.holed } : null, shot: !!g.shotState(), yrCard: !!g.yrCard, toasts: window.__toasts.slice(-4) };
});

try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { bad++; log('[pageerror]', e.message); });
  page.on('console', m => { if (m.type() === 'error') { bad++; log('[console]', m.text().slice(0, 200)); } });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&everyday=1&seed=${seed}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await waitFor(page, () => window.__game?.ready, null, 300000);
  await page.evaluate(() => {
    const g = window.__game; g.closeWelcome?.(false); g.nightAmount = () => 0; window.__toasts = [];
    const t = g.toast.bind(g); g.toast = (m, k) => { window.__toasts.push(String(m)); return t(m, k); }; g.emit();
  });
  await page.evaluate(() => window.__game.tourSkipStep?.(null)); // (the tutorial's own Show me moves the camera when a step completes: it is not what is under test)
  await waitFor(page, () => window.__game.dayPlay && !window.__game.youBookWhy?.(window.__game.townNow().day), null, 120000);

  // ---- the card with the Holes panel open, a hole's card open
  await page.evaluate(() => { const g = window.__game; try { if (!g.holesTool) g.toggleSideMode('holesTool'); } catch { /* none */ } g.openHoleCard(1); g.emit(); });
  await page.waitForSelector('[data-testid=hole-play]', { timeout: 30000 });
  const before = await snap(page); log('before', JSON.stringify(before));
  check(before.card === 1, 'hole 1’s card is open');
  const playBtn = page.locator('[data-testid=hole-play]');
  check(!(await playBtn.isDisabled()), 'Play is on for a hole with a tee, a pin and a green');
  check(/Play hole 1 yourself/.test((await playBtn.getAttribute('title')) ?? ''), 'its tooltip says what it does');
  const fit = await page.evaluate(() => { const card = document.querySelector('[data-testid=hole-play]')?.closest('section'), x = card?.querySelector('button[aria-label="Close the hole card"]'), c = card?.getBoundingClientRect(), r = x?.getBoundingClientRect(); return c && r ? { cardL: Math.round(c.left), cardR: Math.round(c.right), closeL: Math.round(r.left), closeR: Math.round(r.right), scroll: card.scrollLeft } : null; });
  log('header fit', JSON.stringify(fit));
  check(!!fit && fit.closeL >= fit.cardL && fit.closeR <= fit.cardR && fit.scroll === 0, 'the close button still fits in the card beside Build and Play');
  const count = await page.evaluate(() => window.__game.practiceHoleCount());
  await playBtn.click();
  await page.waitForSelector('[data-testid=hole-play-choice]', { timeout: 10000 });
  check(/Just hole 1/.test(await page.locator('[data-testid=hole-play-hole]').innerText()), 'Just hole 1');
  check((await page.locator('[data-testid=hole-play-all]').innerText()).trim() === `All ${count}`, `All ${count} (the course’s real hole count)`);
  check(await page.locator('[data-testid=hole-play-cancel]').count() === 1, 'and Cancel');
  await page.screenshot({ path: join(out, '1-hole-card-choice.png') });
  await page.locator('section', { has: page.locator('[data-testid=hole-play-choice]') }).screenshot({ path: join(out, '1b-hole-card-choice-crop.png') }).catch(() => { /* none */ });

  // the camera settles first (the game opens with an intro ease): the camera to come back to is the one at the click
  { let prev = null; for (let k = 0; k < 40; k++) { const c = await page.evaluate(() => ({ ...window.__game.cam })); if (prev && Math.abs(c.X - prev.X) < 1e-6 && Math.abs(c.Y - prev.Y) < 1e-6 && Math.abs(c.z - prev.z) < 1e-9) break; prev = c; await page.waitForTimeout(500); } }
  const before2 = await snap(page); log('before the click', JSON.stringify(before2));

  // ---- Just hole 1
  await page.locator('[data-testid=hole-play-hole]').click();
  log('what Back to the course will restore', JSON.stringify(await page.evaluate(() => window.__game.practiceBack)));
  await waitFor(page, () => !!window.__game.yourRound(), null, 30000);
  await waitFor(page, () => window.__game.shotState()?.mine === true, null, 30000);
  await page.waitForTimeout(1200);
  const mid = await snap(page); log('mid', JSON.stringify(mid));
  check(mid.round?.practice === true && mid.round.holes.length === 1 && mid.round.holes[0] === 1, 'a one-hole practice round on hole 1');
  check(mid.shot && mid.card === null, 'you are at the tee with the shot open, the hole card out of the way');
  check(await page.locator('[data-testid=round-practice]').count() === 1, 'the bar is tagged Practice');
  await page.screenshot({ path: join(out, '2-practice-hole-mid.png') });
  await page.evaluate(() => window.__game.ownerCaddie());
  await waitFor(page, () => window.__game.yrCard === true, null, 30000);
  await page.waitForTimeout(500);
  const res = await snap(page); log('result', JSON.stringify(res));
  check(res.round?.over === true && res.rounds === before.rounds, 'the round is over after the hole and nothing is recorded yet');
  const btn = await page.locator('[data-testid=round-done]').innerText();
  check(/Back to the course/.test(btn), `the card ends with “${btn.trim()}”`);
  check(await page.locator('[data-testid=card-practice]').count() === 1, 'and says it is a practice round');
  await page.screenshot({ path: join(out, '3-practice-result.png') });
  await page.locator('[data-testid=round-done]').click();
  await page.waitForTimeout(2200);
  const back = await snap(page); log('back', JSON.stringify(back));
  check(back.round === null && back.rounds === before.rounds && back.hcp === before.hcp, 'Back to the course: no round, no handicap change, nothing recorded');
  check(back.card === 1 && back.tool === before.tool && back.holes === before.holes, 'the hole card, the tool and the side modes are back');
  check(Math.abs(back.cam.X - before2.cam.X) < 2 && Math.abs(back.cam.Y - before2.cam.Y) < 2 && Math.abs(back.cam.z - before2.cam.z) < 0.01, `and the camera (${JSON.stringify(before2.cam)} -> ${JSON.stringify(back.cam)})`);
  rep.hole = { before, mid, res, back };

  // ---- All N
  await page.evaluate(() => window.__game.practiceStart(1, 'all'));
  await waitFor(page, () => !!window.__game.yourRound(), null, 30000);
  const all = await snap(page); log('all', JSON.stringify(all));
  check(all.round?.practice === true && all.round.holes.length === count, `All ${count}: every real hole once`);
  await page.evaluate(() => window.__game.yourRoundEnd());
  await page.waitForTimeout(800);
  const end = await snap(page);
  check(end.round === null && end.rounds === before.rounds, 'quitting it records nothing');
  rep.all = { all, end };

  writeFileSync(join(out, 'practice-hole.json'), JSON.stringify(rep, null, 1));
  await ctx.close();
} finally { await browser.close(); }
process.exitCode = bad ? 1 : 0;

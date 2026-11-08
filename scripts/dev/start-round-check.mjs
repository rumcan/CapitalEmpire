// T350 (#993): Start round, in the real game (a headless Edge on the dev server): your booked tee time, the tee-time question, and today's club event. Each scenario has its own browser context (no saved game
// is carried from one to the next).
//   1. Book a tee time, open the first-tee card (Start round / Let the game play it), press Start round: the clock runs to the tee time, your round begins with the first shot open, the clock is at the
//      pace of play (a faster speed is held to it), no score is shown or recorded before the last putt, and the speed comes back when the round ends.
//   2. Book, let the tee time pass without starting: the game pauses and asks (play now / let the game play it), nothing is played or recorded; "Let the game play it" then plays it (and only then).
//   3. Today's Mayor's Cup (?clubevent=mayor): the event card's Start round runs the clock to the tee time and begins the round in it.
//   node scripts/dev/start-round-check.mjs --base http://localhost:5187/ --out E:/ClaudeTemp/T334/t350shots [--seed 2]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saves are not written. Exit 1 on a fault.
// (The clock the page reads is the sim client's: at 20x it runs ahead of the sim worker's last frame and steps back when the speed drops, so the check reads the minute the round began at, not the one after.)
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5187/'), out = opt('out', 'output/start-round-check'), seed = opt('seed', '2'), W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const log = (...a) => console.log(...a);
let bad = 0;
const check = (ok, what) => { if (!ok) { bad++; log('  FAIL:', what); } else log('  ok:', what); };
const SCORE = /Your round: \d+ \(|You shot/; // a score toast (not "Your round: 9 holes ..." or "Your round: tee time ...")
const rep = {};

async function newCtx() {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  return ctx;
}
/** a fresh page on the town start (the old start's course), welcome closed, toasts recorded, the minute each round began at noted */
async function open(ctx, extra = '') {
  const page = await ctx.newPage();
  page.on('pageerror', e => { bad++; log('[pageerror]', e.message); });
  page.on('console', m => { if (m.type() === 'error') { bad++; log('[console]', m.text().slice(0, 200)); } });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&everyday=1&seed=${seed}${extra}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => {
    const g = window.__game; g.closeWelcome?.(false); g.nightAmount = () => 0;
    window.__toasts = []; const t = g.toast.bind(g); g.toast = (m, k) => { window.__toasts.push(String(m)); return t(m, k); };
    const ys = g.yourRoundStart.bind(g); g.yourRoundStart = (...a) => { window.__startedAt = g.townNow().dayMin; return ys(...a); };
    g.emit();
  });
  return page;
}
const jump = (page, m) => page.evaluate(async m => { const g = window.__game, T = g.traffic, c = await import('/src/game/sim/townclock.ts'); T.setTownClock(c.jumpTo(T.town, T.simTime(performance.now()), m, T.town.rate)); }, m);
const state = page => page.evaluate(() => {
  const g = window.__game, p = g.golf.player, at = g.townNow(), r = g.yourRound();
  return { day: at.day, min: Math.round(at.dayMin * 10) / 10, speed: g.speed, lock: g.paceLock, plan: g.startPlan ? { kind: g.startPlan.kind, min: g.startPlan.min } : null, ask: g.teeAsk, booked: p.booked ? { day: p.booked.day, tee: p.booked.tee, auto: !!p.booked.auto, result: !!p.booked.result } : null,
    rounds: p.rounds.length, round: r ? { mode: r.mode ?? 'casual', holes: r.holes.length, done: r.card.filter(c => c.done).length, holed: r.holed, over: r.over } : null, shot: !!g.shotState(), card: !!g.yrCard, startedAt: window.__startedAt ?? null, toasts: window.__toasts.slice(-5) };
});
const waitFor = async (page, fn, arg, ms = 60000, what = 'a condition') => { try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); } catch (e) { log('  (waiting for ' + what + ' failed; state:', JSON.stringify(await state(page)).slice(0, 700) + ')'); throw e; } };
/** the day's sheet is open (a clubhouse, the course, the day's play built) and the clock at `m` (the jump has landed) */
async function morning(page, m) {
  await jump(page, m); await page.evaluate(() => window.__game.setSpeed(1));
  await waitFor(page, m => { const d = window.__game.townNow().dayMin; return d >= m && d < m + 120; }, m, 60000, 'the clock jump');
  await waitFor(page, () => window.__game.dayPlay && !window.__game.youBookWhy?.(window.__game.townNow().day), null, 120000, 'the day sheet');
}

// ---- 1. a booked tee time: Start round
log('== 1. book, Start round');
{
  const ctx = await newCtx();
  try {
    const page = await open(ctx);
    await morning(page, 6 * 60);
    await page.evaluate(() => window.__game.bookYourRound());
    const s0 = await state(page); log('booked', JSON.stringify(s0));
    check(!!s0.booked && !s0.booked.auto && !s0.ask, 'the booking is a tee time to play yourself (no auto)');
    await page.evaluate(() => { const g = window.__game; g.youTeeOpen = true; g.emit(); });
    await page.waitForSelector('[data-testid=tee-start]', { timeout: 15000 });
    check(await page.locator('[data-testid=tee-auto]').count() === 1, 'the card offers Start round and Let the game play it');
    await page.locator('[data-testid=tee-card]').screenshot({ path: join(out, '1-tee-card-booked.png') });
    const tee = s0.booked.tee, rounds0 = s0.rounds;
    await page.locator('[data-testid=tee-start]').click();
    await page.waitForTimeout(400);
    const s1 = await state(page); log('after Start round', JSON.stringify(s1));
    check((!!s1.plan && s1.plan.min === tee && s1.speed > 1) || !!s1.round, 'the clock runs to the tee time fast, slower as it nears (or has got there)');
    await waitFor(page, () => !!window.__game.yourRound(), null, 90000, 'the round to begin');
    await waitFor(page, () => window.__game.shotState()?.mine === true, null, 30000, 'the first shot');
    const s2 = await state(page); log('on the tee', JSON.stringify(s2));
    check(s2.startedAt !== null && s2.startedAt >= tee && s2.startedAt < tee + 60, `the round began at the tee time (${tee}: it began at ${s2.startedAt === null ? '?' : Math.round(s2.startedAt * 10) / 10})`);
    check(s2.round?.mode === 'casual' && s2.shot, 'your round has begun and the first shot is open');
    check(s2.lock && s2.speed > 0 && s2.speed <= 1 / 40 + 1e-9, 'the clock is at the pace of play on the course');
    check(s2.booked === null && s2.rounds === rounds0, 'the booking ended and no round is recorded');
    await page.evaluate(() => window.__game.setSpeed(20)); await page.waitForTimeout(200);
    const s3 = await state(page);
    check(s3.speed <= 1 / 40 + 1e-9 && s3.toasts.some(t => /pace of play/.test(t)), 'a faster speed is held to the pace of play');
    check(await page.locator('[data-testid=speed-20]').isDisabled(), 'the speed bar’s fast buttons are off');
    check(!s3.toasts.some(t => SCORE.test(t)) && !s3.card, 'no score is shown before the last putt');
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(out, '2-first-tee-shot.png') });
    await page.evaluate(() => window.__game.ownerCaddie());
    await waitFor(page, () => window.__game.yrCard === true, null, 30000, 'the hole’s card');
    const s4 = await state(page); log('hole done', JSON.stringify(s4));
    check(s4.round?.done === 1 && s4.card && s4.rounds === rounds0, 'the hole’s card comes after the putt, and nothing is recorded before the round ends');
    await page.evaluate(() => window.__game.yourRoundEnd());
    await page.waitForTimeout(500);
    const s5 = await state(page); log('round ended', JSON.stringify(s5));
    check(s5.rounds === rounds0 + 1 && !s5.lock && s5.round === null, 'ending the round records it once and frees the clock');
    check(s5.speed > 1 / 40 + 1e-9, 'the speed before comes back');
    rep.start = { s0, s1, s2, s3, s4, s5 };
  } catch (e) { bad++; log('  FAIL: scenario 1 threw:', String(e.message).slice(0, 300)); } finally { await ctx.close(); }
}

// ---- 2. the tee time passes while you are away: the game asks, and plays only if you say so
log('== 2. the tee time passes');
{
  const ctx = await newCtx();
  try {
    const page = await open(ctx);
    await morning(page, 6 * 60);
    await page.evaluate(() => window.__game.bookYourRound());
    const s0 = await state(page), b = s0.booked; check(!!b, 'booked'); log('booked', JSON.stringify(s0));
    const rounds0 = s0.rounds;
    await jump(page, b.tee + 5); await page.evaluate(() => window.__game.setSpeed(1));
    await waitFor(page, () => window.__game.teeAsk === true, null, 60000, 'the tee-time question');
    const a = await state(page); log('asked', JSON.stringify(a));
    check(a.ask && a.speed === 0, 'the game asks, and the clock waits');
    check(a.rounds === rounds0 && a.round === null && !a.toasts.some(t => SCORE.test(t)), 'nothing was played or recorded for you');
    await page.waitForSelector('[data-testid=tee-ask]', { timeout: 15000 });
    await page.locator('[data-testid=tee-ask]').screenshot({ path: join(out, '3-tee-ask.png') });
    await page.locator('[data-testid=tee-ask-auto]').click();
    await page.waitForTimeout(300);
    const c = await state(page); check(c.booked?.auto === true && !c.ask, '“Let the game play it” is the explicit stand-in');
    await page.evaluate(() => window.__game.setSpeed(20));
    await waitFor(page, () => window.__toasts.some(t => /Your round: \d+ \(/.test(t)), null, 120000, 'the game’s round to finish');
    const d = await state(page); log('played by the game', JSON.stringify(d));
    check(d.rounds === rounds0 + 1, 'and only then is the game’s round recorded');
    rep.ask = { a, c, d };
  } catch (e) { bad++; log('  FAIL: scenario 2 threw:', String(e.message).slice(0, 300)); } finally { await ctx.close(); }
}

// ---- 3. today's club event: Start round on its card
log('== 3. the Mayor’s Cup');
{
  const ctx = await newCtx();
  try {
    const page = await open(ctx, '&clubevent=mayor');
    await morning(page, 6 * 60);
    await waitFor(page, () => window.__game.eventCard?.() !== null || window.__game.golf?.clubEvents?.today, null, 60000, 'today’s event');
    await page.evaluate(() => { const g = window.__game; g.openEventCard('mayor'); g.emit(); });
    await page.waitForSelector('[data-testid=event-play]', { timeout: 30000 });
    const label = await page.locator('[data-testid=event-play]').innerText();
    log('event button:', label); check(/Start round/.test(label), 'the event card says Start round');
    const ev = await page.evaluate(() => { const c = window.__game.eventCard(); return { phase: c.phase, tee: c.tee, playWhy: c.playWhy }; });
    log('event card', JSON.stringify(ev), JSON.stringify(await state(page)));
    check(ev.phase === 'today' && ev.playWhy === null, 'today’s event can be played');
    await page.locator('[data-testid=event-card]').screenshot({ path: join(out, '4-event-card.png') });
    const rounds0 = (await state(page)).rounds;
    await page.locator('[data-testid=event-play]').click({ timeout: 10000 });
    await waitFor(page, () => window.__game.yourRound()?.mode === 'mayors-cup', null, 120000, 'the event round to begin');
    await waitFor(page, () => window.__game.shotState()?.mine === true, null, 30000, 'the first shot');
    const e2 = await state(page); log('event on the tee', JSON.stringify(e2));
    check(ev.tee === null || (e2.startedAt !== null && e2.startedAt >= ev.tee), `the event round began at its tee time (${ev.tee}: it began at ${e2.startedAt === null ? '?' : Math.round(e2.startedAt * 10) / 10})`);
    check(e2.lock && e2.speed <= 1 / 40 + 1e-9 && e2.rounds === rounds0 && !e2.toasts.some(t => SCORE.test(t)), 'the event round is at the pace of play, nothing recorded yet');
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(out, '5-event-first-tee.png') });
    rep.event = { ev, e2 };
  } catch (e) { bad++; log('  FAIL: scenario 3 threw:', String(e.message).slice(0, 300)); } finally { await ctx.close(); }
}

writeFileSync(join(out, 'start-round.json'), JSON.stringify(rep, null, 1));
await browser.close();
process.exitCode = bad ? 1 : 0;

// T244 (#706): money matches in the game: the challenge on a golfer's card, the answer, the match bar mid-round with the opponent's ball on the course,
// the scorecard's match rows, "Skip to result" and the result card, and a rival's return challenge.
//   node scripts/dev/match-shots.mjs --base http://127.0.0.1:5187/ --out F:/ClaudeTemp/T244 --headed
// Needs a dev server (vite) on --base. One Edge (--headed opens it off-screen, never over the owner's game), closed when done; saves are not written.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5187/'), out = opt('out', 'output/match-shots'), W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: !args.includes('--headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', ...(args.includes('--headed') ? ['--window-position=-32000,-32000', '--window-size=1366,860', '--no-startup-window-focus'] : [])] });
const log = (...a) => console.log(...a);
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 60000, polling: 50 }).catch(() => log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); g.setSpeed(1); g.panel = null; g.setTool('select'); });
  await settle(page, 1500);
  await page.waitForFunction(() => !!window.__game?.you && !!window.__game.yrView(), null, { timeout: 90000 }).catch(() => log('no character or course'));
  const state = () => page.evaluate(() => { const g = window.__game, r = g.yourRound(), m = r?.match; return r && { at: r.at, holed: r.holed, over: r.over, you: r.card[r.at]?.strokes, opp: m?.strokes, res: m?.res, money: Math.round(g.money) }; });

  // 1. a golfer's card (the talk card, a stand-in until T243): the challenge box
  const who = await page.evaluate(() => {
    const g = window.__game, t = g.golf.tees.find(q => q.hole === 1), y = g.you; y.x = t.x + 3; y.y = t.y + 2; g.lookAt(y.x, y.y, 0.25);
    for (const n of ['Mia Lopez', 'Ray Kowalski', 'Donna Pruitt', 'Earl Haskins', 'Gail Dorsey', 'Walt Brennan', 'Lou Ferraro', 'Patty Nolan']) {
      g.youTalkTo(n, 'a golfer at your range', { x: y.x + 1.5, y: y.y }, 14 + n.length % 9);
      const o = g.matchOffer(); if (o && !o.why && o.max >= 100) return { n, o };
    }
    return null;
  });
  log('offer', JSON.stringify(who));
  await settle(page, 500);
  await page.screenshot({ path: join(out, '1-challenge-card.png') });
  // the challenge: lower the stake until they say yes (a no shows their line)
  let yes = false;
  for (const st of [400, 200, 100, 60, 30, 20, 10]) {
    const a = await page.evaluate(s => { const g = window.__game; g.challengeMatch(s, 9); return g.youTalk?.answer; }, st);
    log('stake', st, JSON.stringify(a));
    if (a && !a.yes && st === 400) { await settle(page, 300); await page.screenshot({ path: join(out, '1b-declined.png') }); }
    if (a?.yes) { yes = true; break; }
  }
  if (!yes) throw new Error('no one accepted');
  await settle(page, 400);
  await page.screenshot({ path: join(out, '2-accepted.png') });
  await page.evaluate(() => window.__game.closeYouTalk());

  // 2. play: your shots by the 3-click meter (scripted swings), theirs by the model, until the 3rd hole is under way
  const t0 = Date.now(); let shotAt = null;
  while (Date.now() - t0 < 240000) {
    const s = await page.evaluate(() => { const g = window.__game, v = g.yourRoundView(); return { shot: !!g.shot?.mine, card: v?.card, at: v?.round.at, flying: v?.flying, jump: v?.canJump, over: v?.round.over, turn: v?.match?.turn, holed: v?.round.holed }; });
    if (!s.at && s.at !== 0) break;
    if (s.over) break;
    if (s.card) { if (s.at >= 2) break; await page.evaluate(() => window.__game.yourNextHole()); continue; }
    if (s.shot) {
      if (s.at === 2 && !shotAt) shotAt = true;
      await page.evaluate(() => (() => { const g = window.__game, i = g.shot.input; g.ownerSwing({ power: i.club === 'putter' ? 1 : Math.min(1, i.power), acc: 0.004, boost: 0 }); })());
      await page.waitForTimeout(400); continue;
    }
    if (s.jump && s.turn === 'you') { await page.evaluate(() => window.__game.yourJump()); await page.waitForTimeout(200); continue; }
    await page.waitForTimeout(250);
  }
  log('after two holes', JSON.stringify(await state()));
  await page.evaluate(() => window.__game.toggleYourCard(true));
  await settle(page, 400);
  await page.screenshot({ path: join(out, '4-scorecard-match-rows.png') });
  await page.evaluate(() => { const g = window.__game; g.yourNextHole(); });
  // mid-hole: wait for both to have hit off the 3rd tee, then frame both balls
  for (let k = 0; k < 120; k++) {
    const s = await page.evaluate(() => { const g = window.__game, r = g.yourRound(); return { shot: !!g.shot?.mine, opp: r?.match?.strokes ?? 0, you: r?.card[r.at]?.strokes ?? 0, jump: g.yourRoundView()?.canJump, flying: g.yourRoundView()?.flying }; });
    if (s.opp >= 1 && s.you >= 1 && !s.flying) break;
    if (s.shot) await page.evaluate(() => (() => { const g = window.__game, i = g.shot.input; g.ownerSwing({ power: i.club === 'putter' ? 1 : Math.min(1, i.power), acc: 0.004, boost: 0 }); })());
    else if (s.jump && s.you === 0) await page.evaluate(() => window.__game.yourJump());
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const g = window.__game, r = g.yourRound(), m = r.match; g.lookAt(m.ball.x, m.ball.y, 0.3); });
  await settle(page, 700);
  log('mid-round', JSON.stringify(await state()), await page.evaluate(() => document.querySelector('[data-testid="match-bar"]')?.textContent));
  await page.screenshot({ path: join(out, '3-match-bar-mid-round.png') });

  // 3. Skip to result: the result card
  const m0 = await page.evaluate(() => Math.round(window.__game.money));
  await page.click('[data-testid="match-skip"]');
  await settle(page, 600);
  const res = await page.evaluate(() => { const g = window.__game; return { r: g.matchResult && { text: g.matchResult.text, money: g.matchResult.money, rival: g.matchResult.rival }, money: Math.round(g.money), rivals: g.golf.player.rivals, rounds: g.golf.player.rounds.slice(-1), round: !!g.yourRound() }; });
  log('result', JSON.stringify(res), 'money before', m0);
  await page.screenshot({ path: join(out, '5-match-result.png') });
  await page.evaluate(() => window.__game.closeMatchResult());

  // 4. a rival's return challenge (forced for the shot: the day's draw is golf/play/match.ts returnChallenge, tested there)
  await page.evaluate(() => { const g = window.__game, p = g.golf.player, rv = p.rivals[p.rivals.length - 1]; g.openEventCard?.(null); g.setPlayer({ ...p, challenge: { name: rv.name, stake: Math.max(10, Math.round(rv.stake * 1.5 / 10) * 10), holes: 18, day: g.townNow().day }, chDay: g.townNow().day }); g.emit(); });
  await settle(page, 500);
  await page.screenshot({ path: join(out, '6-return-challenge.png') });
  await page.click('[data-testid="return-accept"]');
  await settle(page, 500);
  log('rematch', JSON.stringify(await page.evaluate(() => { const r = window.__game.yourRound(); return r && { mode: r.mode, holes: r.holes.length, stake: r.match?.stake, back: r.match?.back }; })));
  await page.screenshot({ path: join(out, '7-rematch-on.png') });
} finally {
  await browser.close();
}

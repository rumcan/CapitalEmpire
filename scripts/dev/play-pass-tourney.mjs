// T334 (#960): the tournament owner's shot in the weather, end to end in the game (a headless Edge on the dev server, the dev tournament day): the owner joins, his first shot's panel shows the
// wind and the lie (Game.shotConditions), the swing plays it, the saved input carries its conditions and the model version (env, v 2), the report ends with the wind's note when there is
// one, and the day rebuilt from the saved inputs (what a reload does) gives the owner the same ball. Also the field: the day's play has conditions (the field's shots differ with a wind).
//   node scripts/dev/play-pass-tourney.mjs --base http://localhost:5187/ --out E:/ClaudeTemp/T334/tourney [--seed 7]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saves are not written. Exit 1 on a fault.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5187/'), out = opt('out', 'output/play-pass-tourney'), seed = opt('seed', '7'), W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const log = (...a) => console.log(...a);
let bad = 0;
const check = (ok, what) => { if (!ok) { bad++; log('  FAIL:', what); } else log('  ok:', what); };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { bad++; log('[pageerror]', e.message); });
  page.on('console', m => { if (m.type() === 'error') { bad++; log('[console]', m.text().slice(0, 200)); } });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&tourney=1&everyday=0&seed=${seed}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWelcome?.(false); g.nightAmount = () => 0; g.emit(); });
  const jump = m => page.evaluate(async m => { const g = window.__game, T = g.traffic, c = await import('/src/game/sim/townclock.ts'); T.setTownClock(c.jumpTo(T.town, T.simTime(performance.now()), m, T.town.rate)); }, m);
  await jump(7 * 60); await page.evaluate(() => window.__game.setSpeed(1)); await page.waitForFunction(() => window.__game.play, null, { timeout: 60000 });
  // the day's play is built with conditions (the weather is on for a new game: GolfSave.weather is unset, so from the first tournament)
  const wx = await page.evaluate(() => { const g = window.__game; return { on: g.weatherOn(g.play.key), wind: g.worldWind(), stamped: g.golf.weather ?? null }; });
  log('weather', JSON.stringify(wx)); check(wx.on && !!wx.wind, 'the tournament day has its weather');
  await page.evaluate(() => { window.__game.devWind = { mph: 14, from: 270, gusty: 0, seed: 3 }; });
  await page.evaluate(() => window.__game.joinTournament('m'));
  check(await page.evaluate(() => !!window.__game.play?.own), 'the owner joined');
  await jump(7 * 60 + 28); await page.evaluate(() => window.__game.setSpeed(2));
  await page.waitForFunction(() => window.__game.shotState(), null, { timeout: 240000, polling: 100 });
  for (let k = 0; k < 3; k++) await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  const c = await page.evaluate(() => { const g = window.__game, c = g.shotConditions(); return { on: c.on, putting: c.putting, wind: c.wind, lie: c.lie.name, lines: c.lie.lines, plays: c.playsLikeM, aimed: c.aimedM, suggest: c.suggest }; });
  log('panel', JSON.stringify(c));
  check(c.on && c.wind.mph >= 13 && !c.wind.calm, 'the panel has the wind');
  check(await page.locator('[data-testid=shot-conditions]').count() === 1, 'the conditions box is on the panel');
  await page.locator('[data-testid=shot-panel]').screenshot({ path: join(out, 'tourney-panel.png') });
  await page.screenshot({ path: join(out, 'tourney-screen.png') });
  await page.evaluate(() => window.__game.ownerSwing({ power: 1, acc: 0, boost: 0 }));
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => { const g = window.__game, inp = g.golf.play.inputs.at(-1); return { env: inp.env ?? null, v: inp.v ?? null, text: g.lastShotReport()?.text, n: g.golf.play.inputs.length }; });
  log('after', JSON.stringify(after));
  check(!!after.env && after.env.wind && after.env.wind.mph >= 13 && typeof after.env.lie === 'string', 'the saved input carries its conditions');
  check(after.v === 2, 'and the model version');
  check(/wind /.test(after.text ?? ''), 'the report ends with what the wind did');
  // a reload: the day rebuilt from the saved inputs puts the owner's next turn where it was
  const same = await page.evaluate(async () => {
    const g = window.__game, pl = g.play, sv = g.golf.play, turn = pl.own.turn;
    const built = g.buildPlay(pl.key, { ...sv, inputs: JSON.parse(JSON.stringify(sv.inputs)) });
    const t2 = built?.own?.turn; return { a: turn ? { ball: turn.ball, lie: turn.lie, stroke: turn.stroke } : null, b: t2 ? { ball: t2.ball, lie: t2.lie, stroke: t2.stroke } : null };
  });
  check(JSON.stringify(same.a) === JSON.stringify(same.b) && !!same.a, 'a rebuilt day puts him at the same ball');
  writeFileSync(join(out, 'tourney.json'), JSON.stringify({ wx, c, after, same }, null, 1));
  await ctx.close();
} finally { await browser.close(); }
process.exitCode = bad ? 1 : 0;

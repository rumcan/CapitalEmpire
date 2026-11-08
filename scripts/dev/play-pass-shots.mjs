// T334 (#960): the play pass's captures, in the real game (a headless Edge on the dev server): the shot panel with the wind and the lie, the same shot from the fairway
// and from the rough as a frame strip, the wind bending a high shot (a driver in a crosswind: the tracer, the expected-landing ellipse, the wind mark by the ball), and
// the slope's lines (the ground raised by hand under the ball). Part 2 adds the shaping's strips and the player card (--part 2).
//   node scripts/dev/play-pass-shots.mjs --base http://localhost:5187/ --out E:/ClaudeTemp/T334/shots [--seed 2] [--part 1|2]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saves are not written. Exit 1 on a page error.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5187/'), out = opt('out', 'output/play-pass-shots'), seed = opt('seed', '2'), part = +opt('part', '1'), W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const log = (...a) => console.log(...a);
let bad = 0;
const rep = { shots: [] };
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
  await page.evaluate(async () => { window.__play = await import('/src/game/golf/play/index.ts'); window.__yours = await import('/src/game/golf/play/yours.ts'); });
  await page.evaluate(() => window.__game.yourRoundStart('all'));
  await page.waitForTimeout(400);

  // a spot on hole 1's line `d` tiles from the tee, and the unit direction of the line there
  const spot = await page.evaluate(d => {
    const g = window.__game, v = g.yrView(), h = window.__yours.holeOf(v, g.yourRound().card[0].i); let acc = 0;
    for (let i = 0; i + 1 < h.line.length; i++) { const a = h.line[i], b = h.line[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y); if (acc + L >= d) { const u = (d - acc) / L; return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, ux: (b.x - a.x) / L, uy: (b.y - a.y) / L, pin: h.pin }; } acc += L; }
    const a = h.line[h.line.length - 2], b = h.line[h.line.length - 1], L = Math.hypot(b.x - a.x, b.y - a.y); return { x: b.x, y: b.y, ux: (b.x - a.x) / L, uy: (b.y - a.y) / L, pin: h.pin };
  }, 55);
  log('spot', JSON.stringify(spot));
  // the wind for the captures: a crosswind from the left of the shot (the bearing the shot flies toward is b; from b - 90 blows to its right), `mph`, nearly steady
  const bearing = Math.atan2((spot.ux - spot.uy) * Math.SQRT1_2, -(spot.ux + spot.uy) * Math.SQRT1_2) * 180 / Math.PI;
  const fromLeft = ((bearing - 90) % 360 + 360) % 360;
  const setWind = (mph, from, gusty = 0.15) => page.evaluate(w => { window.__game.devWind = { mph: w.mph, from: w.from, gusty: w.gusty, seed: 7 }; }, { mph, from, gusty });

  /** the ball on the spot with the lie `lie`, the round's stroke count back to 0 (the same stream each time), the shot open on `club` aimed down the line */
  const address = async (lie, club, aimTiles = 70) => {
    await page.evaluate(async ({ spot, lie, club, aimTiles }) => {
      const g = window.__game, r = g.yourRound(), card = r.card.slice(); card[r.at] = { ...card[r.at], strokes: 0, putts: 0, pen: 0, done: false };
      g.shot = null; g.yrFlight = null; g.setYourRound({ ...r, card, ball: { x: spot.x, y: spot.y }, lie, holed: false, over: false, undo: undefined, mk: undefined });
      const y = g.you; y.x = spot.x - spot.ux * 4; y.y = spot.y - spot.uy * 4; g.lookAt(spot.x, spot.y, 0.3); g.youJumpAt = performance.now();
      g.yourJump(); await new Promise(r => setTimeout(r, 250));
      g.setShotClub(club); g.aimAt({ x: spot.x + spot.ux * aimTiles, y: spot.y + spot.uy * aimTiles });
    }, { spot, lie, club, aimTiles });
    await page.waitForFunction(() => !!window.__game.shotState()?.mine, null, { timeout: 20000 });
    for (let k = 0; k < 2; k++) await page.keyboard.press('Escape');
    await page.waitForTimeout(900);
  };
  const ballXY = () => page.evaluate(() => { const g = window.__game, b = g.yourRound().ball, s = g.screen(b.x, b.y); return { x: s.x / g.dpr, y: s.y / g.dpr }; });
  const frameClip = b => ({ x: Math.max(0, Math.min(W - 600, b.x - 300)), y: Math.max(0, Math.min(H - 400, b.y - 250)), width: 600, height: 400 });
  /** swings with the meter's outcome and collects frames round the strike until the ball is at rest */
  const swingAndWatch = async (sw, every = 70, max = 60) => {
    const b0 = await ballXY(), frames = [];
    await page.evaluate(sw => window.__game.ownerSwing(sw), sw);
    for (let k = 0; k < max; k++) {
      frames.push(await page.screenshot({ clip: frameClip(b0) }));
      const flying = await page.evaluate(() => !!window.__game.yourRoundView()?.flying);
      if (!flying) break;
      await page.waitForTimeout(every);
    }
    await page.waitForTimeout(600);
    frames.push(await page.screenshot({ clip: frameClip(b0) }));
    const text = await page.evaluate(() => window.__game.lastShotReport()?.text);
    const end = await page.evaluate(() => { const g = window.__game, r = g.yourRound(); return { ball: r.ball, lie: r.lie }; });
    return { frames, text, end };
  };
  const labelled = async (buf, text) => {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect x="6" y="6" width="${12 + text.length * 7.2}" height="22" rx="4" fill="rgba(15,23,42,0.8)"/><text x="12" y="22" font-family="sans-serif" font-size="13" fill="#fde68a">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);
    return sharp(buf).composite([{ input: svg }]).png().toBuffer();
  };
  /** frames sampled evenly to n, with the last kept */
  const pick = (fr, n) => { if (fr.length <= n) return fr; const o = []; for (let k = 0; k < n - 1; k++) o.push(fr[Math.round(k * (fr.length - 2) / (n - 2))]); o.push(fr[fr.length - 1]); return o; };
  const sheetRows = async (rows, name, cols) => {
    const w = 600, h = 400, tiles = [];
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) tiles.push({ input: rows[r][c], left: c * w, top: r * h });
    await sharp({ create: { width: w * cols, height: h * rows.length, channels: 4, background: { r: 15, g: 23, b: 42, alpha: 1 } } }).composite(tiles).png().toFile(join(out, name));
  };

  // 1. the shot panel with the wind and the lie: a 7-iron from the rough in a crosswind
  await setWind(14, fromLeft, 0.2);
  await address('rough', 'iron6');
  await page.screenshot({ path: join(out, '1-screen-rough-wind.png') });
  await page.locator('[data-testid=shot-panel]').screenshot({ path: join(out, '1-panel-rough-wind.png') });
  rep.panel = await page.evaluate(() => { const c = window.__game.shotConditions(); return { on: c.on, wind: c.wind, lie: c.lie.name + ': ' + c.lie.lines.join(' / '), plays: c.playsLikeM, aimed: c.aimedM, suggest: c.suggest, slope: c.slopeLines }; });
  log('panel', JSON.stringify(rep.panel));

  // 2. the same shot from the fairway and from the rough (a calm day: only the lie differs), as a frame strip each
  await setWind(0, 0, 0);
  const sw = { power: 0.97, acc: 0, boost: 0 }, rowsA = [];
  for (const lie of ['fairway', 'rough']) {
    await address(lie, 'iron6');
    const res = await swingAndWatch(sw, 90);
    rep.shots.push({ lie, text: res.text, end: res.end });
    log(lie, res.text);
    rowsA.push(await Promise.all(pick(res.frames, 5).map((f, k) => k === 0 ? labelled(f, `${lie}: ${res.text}`) : f)));
  }
  await sheetRows(rowsA, '2-fairway-vs-rough-strip.png', 5);

  // 3. the wind bending a high shot: a driver from the tee spot in a 18 mph crosswind from the left, against the same shot in a calm
  await setWind(18, fromLeft, 0.1);
  await address('tee', 'driver', 110);
  await page.screenshot({ path: join(out, '3-driver-wind-address.png') });
  const wres = await swingAndWatch({ power: 1, acc: 0, boost: 0 }, 110);
  rep.shots.push({ lie: 'tee', wind: 18, text: wres.text, end: wres.end }); log('driver in wind:', wres.text);
  await setWind(0, 0, 0);
  await address('tee', 'driver', 110);
  const cres = await swingAndWatch({ power: 1, acc: 0, boost: 0 }, 110);
  rep.shots.push({ lie: 'tee', wind: 0, text: cres.text, end: cres.end }); log('driver in calm:', cres.text);
  await sheetRows([await Promise.all(pick(wres.frames, 6).map((f, k) => k === 0 ? labelled(f, `18 mph crosswind: ${wres.text}`) : f)), await Promise.all(pick(cres.frames, 6).map((f, k) => k === 0 ? labelled(f, `calm: ${cres.text}`) : f))], '3-wind-bends-a-high-shot.png', 6);

  // 4. the slope: the height brush dabbed beside the ball (the owner's flow, as break-grid-shots.mjs does: the land made yours, Ground height raise), then the panel's lines
  const raised = await page.evaluate(({ spot }) => {
    const g = window.__game, gs = g.golf; g.money = 1e9; g.eventCardOpen = null;
    gs.parcels = [...(gs.parcels ?? [gs.parcel]), [spot.x - 60, spot.y - 60, 120, 120]];
    const p = g.paint; p.heightMode = 'raise'; p.heightR = 14; p.heightLevel = 3;
    // the ground rises to the right of the line (its right is (-uy, ux)) and ahead of the ball: the ball below the feet and the lie uphill
    const at = { x: spot.x - spot.uy * 7 + spot.ux * 6, y: spot.y + spot.ux * 7 + spot.uy * 6 };
    p.begin?.('raise ground'); p.heighting = { last: at, broke: false };
    for (let k = 0; k < 3; k++) p.heightDabAt({ x: at.x + k * 0.5, y: at.y }); p.heighting = null;
    return { rev: g.courseHeight.rev, spot };
  }, { spot });
  log('raised', JSON.stringify(raised));
  await setWind(10, fromLeft, 0.2);
  await page.waitForTimeout(1500);
  await address('fairway', 'iron6');
  await page.locator('[data-testid=shot-panel]').screenshot({ path: join(out, '4-panel-slope.png') });
  rep.slope = await page.evaluate(() => { const c = window.__game.shotConditions(); return { slope: c.slope, lines: c.slopeLines, plays: c.playsLikeM, aimed: c.aimedM }; });
  log('slope', JSON.stringify(rep.slope));
  writeFileSync(join(out, 'shots.json'), JSON.stringify(rep, null, 1));
} finally { await browser.close(); }
process.exitCode = bad ? 1 : 0;

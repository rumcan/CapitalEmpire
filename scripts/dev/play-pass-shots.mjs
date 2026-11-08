// T334 (#960): the play pass's captures, in the real game (a headless Edge on the dev server):
//   1-panel-rough-wind.png / 1-screen-rough-wind.png   the shot panel with the wind and the lie (a 6-iron from the rough in a crosswind), and the whole screen
//   2-fairway-vs-rough-strip.png                        the same shot (the same stream) from the fairway and from the rough: before, two frames in the air, after (one framing)
//   3-wind-bends-a-high-shot.png                        a driver in an 18 mph crosswind against the same drive in a calm: the aim line and the expected-landing ellipse, the flight, the bent tracer
//   4-panel-slope.png                                   the slope's lines (the ground raised by hand beside the ball: the Ground height tool's own dab)
//   5-sway.png                                          a tree and the pin flag in the wind against a calm (two frames each, 0.45 s apart); shots.json has the pixel counts that moved
// Part 2 (--part 2) adds the shaping's strips and the player card. Run:
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

  /** a spot on hole 1's line `d` tiles from the tee, and the unit direction of the line there */
  const spotAt = d => page.evaluate(d => {
    const g = window.__game, v = g.yrView(), h = window.__yours.holeOf(v, g.yourRound().card[0].i); let acc = 0;
    for (let i = 0; i + 1 < h.line.length; i++) { const a = h.line[i], b = h.line[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y); if (acc + L >= d) { const u = (d - acc) / L; return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, ux: (b.x - a.x) / L, uy: (b.y - a.y) / L, pin: h.pin }; } acc += L; }
    const a = h.line[h.line.length - 2], b = h.line[h.line.length - 1], L = Math.hypot(b.x - a.x, b.y - a.y); return { x: b.x, y: b.y, ux: (b.x - a.x) / L, uy: (b.y - a.y) / L, pin: h.pin };
  }, d);
  const bearingOf = s => Math.atan2((s.ux - s.uy) * Math.SQRT1_2, -(s.ux + s.uy) * Math.SQRT1_2) * 180 / Math.PI;
  const setWind = (mph, from, gusty = 0.15) => page.evaluate(w => { window.__game.devWind = { mph: w.mph, from: w.from, gusty: w.gusty, seed: 7 }; }, { mph, from, gusty });
  const sleep = ms => page.waitForTimeout(ms);

  /** the ball on `spot` with the lie `lie`, the stroke count back to 0 and the stream key `mk` (the same stream each time), the shot open on `club` aimed `aimTiles` down the line, the
   *  camera held on the framing (the ball and the aim's middle at the top of the screen, above the panel) at zoom z */
  const address = async (spot, lie, club, aimTiles, mk = 0, z = 0.13) => {
    await page.evaluate(async ({ spot, lie, club, aimTiles, mk, z }) => {
      const g = window.__game, r = g.yourRound(), card = r.card.slice(); card[r.at] = { ...card[r.at], strokes: 0, putts: 0, pen: 0, done: false };
      g.shot = null; g.yrFlight = null; g.setYourRound({ ...r, card, ball: { x: spot.x, y: spot.y }, lie, holed: false, over: false, undo: undefined, ...(mk ? { mk } : { mk: undefined }) });
      const y = g.you; y.x = spot.x - spot.ux * 4; y.y = spot.y - spot.uy * 4; g.lookAt(spot.x, spot.y, 0.3); g.youJumpAt = performance.now();
      g.yourJump(); await new Promise(res => setTimeout(res, 300));
      g.setShotClub(club); g.aimAt({ x: spot.x + spot.ux * aimTiles, y: spot.y + spot.uy * aimTiles });
      await new Promise(res => setTimeout(res, 200));
      // the framing: the middle of the shot at 150 px above the screen's centre (the panel is at the bottom), held (no chase, no ease)
      const mx = spot.x + spot.ux * aimTiles * 0.5, my = spot.y + spot.uy * aimTiles * 0.5, X = (mx - my) * 64, Y = (mx + my) * 32;
      g.camEase = null; g.cam.z = z; g.cam.X = X; g.cam.Y = Y + 150 / z;
    }, { spot, lie, club, aimTiles, mk, z });
    await page.waitForFunction(() => !!window.__game.shotState()?.mine, null, { timeout: 20000 });
    for (let k = 0; k < 2; k++) await page.keyboard.press('Escape');
    await sleep(700);
    await page.evaluate(({ spot, aimTiles, z }) => { const g = window.__game, mx = spot.x + spot.ux * aimTiles * 0.5, my = spot.y + spot.uy * aimTiles * 0.5; g.camEase = null; g.cam.z = z; g.cam.X = (mx - my) * 64; g.cam.Y = (mx + my) * 32 + 150 / z; }, { spot, aimTiles, z });
    await sleep(500);
  };
  const crop = { left: 60, top: 70, width: 1000, height: 440 };
  const frame = async () => sharp(await page.screenshot({ clip: { x: crop.left, y: crop.top, width: crop.width, height: crop.height } })).resize(560, 246).png().toBuffer();
  /** swings with the meter's outcome and collects frames of the framing until the ball is at rest and a little more (the camera stays where the address put it) */
  const swingAndWatch = async (sw, every = 110) => {
    const frames = [];
    await page.evaluate(sw => { const g = window.__game; g.ownerSwing(sw); g.youFollow = false; g.camEase = null; }, sw);
    for (let k = 0; k < 70; k++) {
      frames.push(await frame());
      const st = await page.evaluate(() => { const g = window.__game, f = g.yrFlight; return { flying: !!g.yourRoundView()?.flying, t: f ? f.t : null, air: f ? f.air : null }; });
      if (!st.flying) break;
      await sleep(every);
    }
    await sleep(500); frames.push(await frame());
    const text = await page.evaluate(() => window.__game.lastShotReport()?.text);
    return { frames, text };
  };
  const labelled = async (buf, text) => {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="560" height="246"><rect x="4" y="4" width="${14 + text.length * 6.6}" height="20" rx="4" fill="rgba(15,23,42,0.85)"/><text x="10" y="18" font-family="sans-serif" font-size="12" fill="#fde68a">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);
    return sharp(buf).composite([{ input: svg }]).png().toBuffer();
  };
  /** n frames of a flight: the first (before), then evenly through the air, the last (after) */
  const pick = (fr, n) => { if (fr.length <= n) return fr; const o = [fr[0]]; for (let k = 1; k < n - 1; k++) o.push(fr[Math.round(k * (fr.length - 2) / (n - 1))]); o.push(fr[fr.length - 1]); return o; };
  const sheetRows = async (rows, name, w = 560, h = 246) => {
    const cols = Math.max(...rows.map(r => r.length)), tiles = [];
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) tiles.push({ input: rows[r][c], left: c * w, top: r * h });
    await sharp({ create: { width: w * cols, height: h * rows.length, channels: 4, background: { r: 15, g: 23, b: 42, alpha: 1 } } }).composite(tiles).png().toFile(join(out, name));
  };

  // ---- 1. the shot panel with the wind and the lie: a 6-iron from the rough in a crosswind (the wind from the left of the line)
  const s55 = await spotAt(55), fromLeft = ((bearingOf(s55) - 90) % 360 + 360) % 360;
  await setWind(14, fromLeft, 0.2);
  await address(s55, 'rough', 'iron6', 70, 0, 0.3);
  await page.evaluate(({ s55 }) => { const g = window.__game; g.lookAt(s55.x, s55.y, 0.3); }, { s55 });
  await sleep(800);
  await page.screenshot({ path: join(out, '1-screen-rough-wind.png') });
  await page.locator('[data-testid=shot-panel]').screenshot({ path: join(out, '1-panel-rough-wind.png') });
  rep.panel = await page.evaluate(() => { const c = window.__game.shotConditions(); return { on: c.on, wind: c.wind, lie: c.lie.name + ': ' + c.lie.lines.join(' / '), plays: c.playsLikeM, aimed: c.aimedM, suggest: c.suggest, slope: c.slopeLines }; });
  log('panel', JSON.stringify(rep.panel));

  // ---- 2. the same shot (the same stream key, a calm day) from the fairway and from the rough: a key where both are typical (the rough about 12% shorter, no flier)
  await setWind(0, 0, 0);
  const sw = { power: 0.97, acc: 0, boost: 0 };
  const key = await page.evaluate(async ({ s55, sw }) => {
    const g = window.__game, v = g.yrView(), r0 = g.yourRound(), P = window.__play, Y = window.__yours, sk = g.yourSkills();
    const shot = (lie, k) => { const r = { ...r0, ball: { x: s55.x, y: s55.y }, lie, holed: false, over: false, undo: undefined, mk: k }, aim = { x: s55.x + s55.ux * 70, y: s55.y + s55.uy * 70 };
      const env = P.envOf(null, v.kindAt, g.ballHeight, r.ball, lie, aim), o = Y.playYours(v, r, sk, { club: 'iron6', aim, power: 1, swing: sw, env, v: P.MODEL_V }, g.seed);
      return Math.hypot(o.shot.landing.at.x - r.ball.x, o.shot.landing.at.y - r.ball.y) * 2; };
    const mean = (lie) => { let a = 0; for (let k = 1; k <= 60; k++) a += shot(lie, k); return a / 60; };
    const mf = mean('fairway'), mr = mean('rough'); let best = 1, bs = 1e9;
    for (let k = 1; k <= 60; k++) { const cf = shot('fairway', k), cr = shot('rough', k), sc = Math.abs(cf / mf - 1) + Math.abs(cr / mr - 1) + (cr / cf > 0.95 ? 1 : 0); if (sc < bs) { bs = sc; best = k; } }
    return { k: best, mf, mr, cf: shot('fairway', best), cr: shot('rough', best) };
  }, { s55, sw });
  log('key', JSON.stringify(key)); rep.key = key;
  const rowsA = [];
  for (const lie of ['fairway', 'rough']) {
    await address(s55, lie, 'iron6', 70, key.k);
    const res = await swingAndWatch(sw, 100);
    rep.shots.push({ lie, text: res.text }); log(lie, res.text);
    const fr = pick(res.frames, 4);
    rowsA.push(await Promise.all(fr.map((f, k) => k === 0 ? labelled(f, `${lie === 'fairway' ? 'Fairway' : 'Rough'}: ${res.text}`) : f)));
  }
  await sheetRows(rowsA, '2-fairway-vs-rough-strip.png');

  // ---- 3. the wind bending a high shot: a driver from the tee in an 18 mph crosswind from the left, against the same drive in a calm
  const s3 = await spotAt(2);
  const rowsB = [];
  for (const [mph, name] of [[18, '18 mph crosswind'], [0, 'calm']]) {
    await setWind(mph, fromLeft, 0.1);
    await address(s3, 'tee', 'driver', 92, 3, 0.115);
    const res = await swingAndWatch({ power: 1, acc: 0, boost: 0 }, 110);
    rep.shots.push({ wind: mph, text: res.text }); log(name, res.text);
    const fr = pick(res.frames, 4);
    rowsB.push(await Promise.all(fr.map((f, k) => k === 0 ? labelled(f, `${name}: ${res.text}`) : f)));
  }
  await sheetRows(rowsB, '3-wind-bends-a-high-shot.png');

  // ---- 4. the slope: the height brush dabbed beside the ball (the owner's flow, as break-grid-shots.mjs does: the land made yours, Ground height raise), then the panel's lines
  const raised = await page.evaluate(({ spot }) => {
    const g = window.__game, gs = g.golf; g.money = 1e9; g.eventCardOpen = null;
    gs.parcels = [...(gs.parcels ?? [gs.parcel]), [spot.x - 60, spot.y - 60, 120, 120]];
    const p = g.paint; p.heightMode = 'raise'; p.heightR = 14; p.heightLevel = 3;
    // the ground rises to the right of the line (its right is (-uy, ux)) and ahead of the ball: the ball below the feet and the lie uphill
    const at = { x: spot.x - spot.uy * 7 + spot.ux * 6, y: spot.y + spot.ux * 7 + spot.uy * 6 };
    p.begin?.('raise ground'); p.heighting = { last: at, broke: false };
    for (let k = 0; k < 3; k++) p.heightDabAt({ x: at.x + k * 0.5, y: at.y }); p.heighting = null;
    return { rev: g.courseHeight.rev };
  }, { spot: s55 });
  log('raised', JSON.stringify(raised));
  await setWind(10, fromLeft, 0.2);
  await sleep(1500);
  await address(s55, 'fairway', 'iron6', 70, 0, 0.3);
  await page.locator('[data-testid=shot-panel]').screenshot({ path: join(out, '4-panel-slope.png') });
  rep.slope = await page.evaluate(() => { const c = window.__game.shotConditions(); return { slope: c.slope, lines: c.slopeLines, plays: c.playsLikeM, aimed: c.aimedM }; });
  log('slope', JSON.stringify(rep.slope));
  await page.evaluate(() => { const g = window.__game; g.shot = null; });

  // ---- 5. the sway: the pin's flag and the trees, two frames 0.45 s apart in an 18 mph wind and in a calm: the pixels that moved
  const pin = s55.pin, sceneShot = async () => sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const look = async () => { await page.evaluate(({ pin }) => { const g = window.__game; g.shot = null; g.yrFlight = null; g.lookAt(pin.x - 6, pin.y + 4, 0.3); }, { pin }); await sleep(2500); await page.evaluate(({ pin }) => window.__game.lookAt(pin.x - 6, pin.y + 4, 0.3), { pin }); await sleep(700); };
  await look();
  const pair = async mph => { await setWind(mph, 270, 0.5); await sleep(300); const a = await sceneShot(); await sleep(450); const b = await sceneShot(); return { a, b }; };
  const moved = (a, b) => { let n = 0; const cells = new Map(); for (let y = 90; y < 760; y++) for (let x = 330; x < 1000; x++) { const i = (y * W + x) * 3; if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 45) { n++; const k = `${x >> 6},${y >> 6}`; cells.set(k, (cells.get(k) ?? 0) + 1); } } let best = null; for (const [k, v] of cells) if (!best || v > best.v) best = { k, v }; return { n, best }; };
  const windy = await pair(18), calm = await pair(0);
  const mw = moved(windy.a.data, windy.b.data), mc = moved(calm.a.data, calm.b.data);
  rep.sway = { windyMoved: mw.n, calmMoved: mc.n }; log('sway: pixels that moved in 0.45 s: wind 18 mph', mw.n, ', calm', mc.n);
  const flagBox = await page.evaluate(({ pin }) => { const g = window.__game, s = g.screen(pin.x, pin.y); return { x: s.x / g.dpr, y: s.y / g.dpr }; }, { pin });
  const cropOf = (img, cx, cy, w = 200, h = 200) => sharp(img.data, { raw: { width: W, height: H, channels: 3 } }).extract({ left: Math.max(0, Math.min(W - w, Math.round(cx - w / 2))), top: Math.max(0, Math.min(H - h, Math.round(cy - h / 2))), width: w, height: h }).resize(280, 280).png().toBuffer();
  const [tx, ty] = mw.best ? mw.best.k.split(',').map(Number).map(v => v * 64 + 32) : [flagBox.x, flagBox.y];
  const lab2 = async (buf, text) => { const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280"><rect x="4" y="4" width="${12 + text.length * 6.6}" height="20" rx="4" fill="rgba(15,23,42,0.85)"/><text x="10" y="18" font-family="sans-serif" font-size="12" fill="#fde68a">${text}</text></svg>`); return sharp(buf).composite([{ input: svg }]).png().toBuffer(); };
  const rowFlag = [await lab2(await cropOf(windy.a, flagBox.x, flagBox.y - 40), 'flag, 18 mph, t'), await lab2(await cropOf(windy.b, flagBox.x, flagBox.y - 40), 'flag, 18 mph, t + 0.45 s'), await lab2(await cropOf(calm.a, flagBox.x, flagBox.y - 40), 'flag, calm'), await lab2(await cropOf(calm.b, flagBox.x, flagBox.y - 40), 'flag, calm, t + 0.45 s')];
  const rowTree = [await lab2(await cropOf(windy.a, tx, ty), 'most moving, 18 mph, t'), await lab2(await cropOf(windy.b, tx, ty), 'same, t + 0.45 s'), await lab2(await cropOf(calm.a, tx, ty), 'same place, calm'), await lab2(await cropOf(calm.b, tx, ty), 'calm, t + 0.45 s')];
  await sheetRows([rowFlag, rowTree], '5-sway.png', 280, 280);
  await page.screenshot({ path: join(out, '5-sway-scene.png') });

  writeFileSync(join(out, 'shots.json'), JSON.stringify(rep, null, 1));
} finally { await browser.close(); }
process.exitCode = bad ? 1 : 0;

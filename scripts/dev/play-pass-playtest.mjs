// T334 (#960): the golf play pass's playtest on the town course, in the real game (a headless Edge on the dev server).
//  1. dumps the town course (the holes, the lie of every tile near them, the course height field) to <out>/town-course.json, for scripts/dev/play-pass-sim.ts
//     (the pure-model rounds the sim plays offline, with the same 3-click meter the game has);
//  2. plays the first holes of your round in real time with the scripted swinger (tests/helpers/swing-bot.ts, a club golfer's clicks): every shot's club, lie,
//     the meter's outcome, the carry and total, the real seconds from the swing to the ball's rest and to the next address, the camera's moves; a frame strip of
//     each flight (cropped round the ball, every ~140 ms) and the shot panel at each address, and the camera's fastest frames during each flight;
//  3. writes <out>/playtest.json with all of it. The findings are read from these and the strips (see the issue's playtest comment).
//   node scripts/dev/play-pass-playtest.mjs --base http://localhost:5187/ --out E:/ClaudeTemp/T334/playtest [--seed 2] [--holes 3] [--skill 0.3]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; saves are not written. Exit 1 on a page error.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5187/'), out = opt('out', 'output/play-pass'), seed = opt('seed', '2'), nHoles = +opt('holes', '3'), W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const log = (...a) => console.log(...a);
let bad = 0;
const rep = { seed, shots: [], dump: null, errors: [] };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { bad++; rep.errors.push(e.message); log('[pageerror]', e.message); });
  page.on('console', m => { if (m.type() === 'error') { rep.errors.push(m.text().slice(0, 200)); log('[console]', m.text().slice(0, 200)); } });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&seed=${seed}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); g.setSpeed(1); g.nightAmount = () => 0; });
  await page.waitForFunction(() => !!window.__game?.you && !!window.__game.yrView(), null, { timeout: 120000 });
  await page.waitForTimeout(1500);

  // ---- 1. the course dump ----
  rep.dump = await page.evaluate(() => {
    const g = window.__game, v = g.yrView(), MAP = 1024;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const h of v.holes) for (const p of [...h.line, h.tee, h.pin]) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    x0 = Math.max(0, Math.floor(x0 - 60)); y0 = Math.max(0, Math.floor(y0 - 60)); x1 = Math.min(MAP - 1, Math.ceil(x1 + 60)); y1 = Math.min(MAP - 1, Math.ceil(y1 + 60));
    const w = x1 - x0 + 1, h = y1 - y0 + 1, ch = { tee: 't', fairway: 'f', rough: 'r', fescue: 'e', bunker: 'b', green: 'g', water: 'w', out: 'o' };
    let lies = ''; const hs = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { lies += ch[v.lieAt(x0 + i + 0.5, y0 + j + 0.5)]; hs[j * w + i] = g.ballHeight(x0 + i + 0.5, y0 + j + 0.5); }
    let mn = 1e9, mx = -1e9; for (const q of hs) { mn = Math.min(mn, q); mx = Math.max(mx, q); }
    const u8 = new Uint8Array(hs.buffer); let bin = ''; for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode(...u8.subarray(i, i + 8192));
    return { seed: g.seed, holes: v.holes.map(q => ({ n: q.n, par: q.par, tee: q.tee, pin: q.pin, line: q.line, sets: q.sets })), box: { x0, y0, w, h }, lies, heights: btoa(bin), hMin: mn, hMax: mx };
  });
  writeFileSync(join(out, 'town-course.json'), JSON.stringify(rep.dump));
  log(`course: ${rep.dump.holes.length} holes, box ${JSON.stringify(rep.dump.box)}, heights ${rep.dump.hMin.toFixed(2)}..${rep.dump.hMax.toFixed(2)} m`);

  // ---- 2. real-time play ----
  await page.evaluate(async () => { // the bot and the model, once, on the page
    window.__bot = await import('/tests/helpers/swing-bot.ts'); window.__play = await import('/src/game/golf/play/index.ts'); window.__yours = await import('/src/game/golf/play/yours.ts');
    window.__rng = window.__play.rng(11, 22, 33);
    // the camera's moves, every frame
    const g = window.__game, T = window.__cam = [];
    const tick = () => { T.push({ t: performance.now(), z: g.cam.z, X: g.cam.X, Y: g.cam.Y, ft: g.yrFlight ? +g.yrFlight.t.toFixed(3) : null, air: g.yrFlight ? +g.yrFlight.air.toFixed(2) : null }); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const skill = +opt('skill', '0.3');
  await page.evaluate(() => window.__game.yourRoundStart('all'));
  await page.waitForTimeout(500);
  const tee = await page.evaluate(() => window.__game.yourRound().ball);
  await page.evaluate(({ x, y }) => { const g = window.__game, c = g.youCart, y0 = g.you; g.lookAt(x, y, 0.3); y0.x = x - 3; y0.y = y - 1; g.youJumpAt = performance.now(); }, tee);
  await page.evaluate(() => window.__game.yourJump());
  const crop = async (name, cx, cy, w = 560, h = 380) => page.screenshot({ path: join(out, name), clip: { x: Math.max(0, Math.min(W - w, cx - w / 2)), y: Math.max(0, Math.min(H - h, cy - h / 2)), width: w, height: h } });
  const ballXY = () => page.evaluate(() => { const g = window.__game, b = g.yourRound().ball, s = g.screen(b.x, b.y); return { x: s.x / g.dpr, y: s.y / g.dpr }; });
  const sheet = async (frames, name, cols = 5) => {
    if (!frames.length) return;
    const meta = await sharp(frames[0]).metadata(), w = meta.width, h = meta.height, rows = Math.ceil(frames.length / cols);
    await sharp({ create: { width: w * cols, height: h * rows, channels: 4, background: { r: 15, g: 23, b: 42, alpha: 1 } } }).composite(frames.map((b, i) => ({ input: b, left: (i % cols) * w, top: Math.floor(i / cols) * h }))).png().toFile(join(out, name));
  };
  const nextShot = (timeout = 60000) => page.waitForFunction(() => !!window.__game.shotState()?.mine, null, { timeout, polling: 50 });
  let holesDone = 0, shotNo = 0, guard = 0;
  while (holesDone < nHoles && guard++ < 60) {
    await nextShot().catch(() => { log('  no shot open'); });
    await page.waitForTimeout(500);
    for (let k = 0; k < 2; k++) await page.keyboard.press('Escape');
    const st = await page.evaluate(skill => {
      const g = window.__game, s = g.shotState(), r = g.yourRound(), v = g.yrView(), putting = s.input.club === 'putter', bot = window.__bot;
      const sk = g.yourSkills(), sk1 = window.__play.skillFor(sk, s.input.club);
      const want = putting ? 1 : s.input.power;
      const sw = bot.botSwing(window.__rng, bot.HUMANS.club, sk1, want, putting);
      // the tracks: the lie raster under the ball and the slope across the aim (what the model does not read yet)
      const h = g.ballHeight, b = s.turn.ball, a = s.input.aim, dx = a.x - b.x, dy = a.y - b.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      const up = (h(b.x + ux * 1.5, b.y + uy * 1.5) - h(b.x - ux * 1.5, b.y - uy * 1.5)) / 6, across = (h(b.x - uy * 1.5, b.y + ux * 1.5) - h(b.x + uy * 1.5, b.y - ux * 1.5)) / 6;
      return { hole: s.turn.hole, par: s.turn.par, stroke: s.turn.stroke, club: s.input.club, lie: s.turn.lie, distM: s.turn.distM, power: s.input.power, skill: sk1, sw, up, across, sweet: window.__play.sweetSpot(sk1), speed: 1 / window.__play.swingTime(sk1), cam: { z: g.cam.z } };
    }, skill);
    const shotName = `h${st.hole}s${st.stroke}`;
    // the panel at the address (a crop of the panel only), and the whole screen once per hole
    const panel = page.locator('[data-testid=shot-panel]');
    await panel.screenshot({ path: join(out, `${shotName}-panel.png`) }).catch(() => log('  no panel shot'));
    if (st.stroke === 1) await page.screenshot({ path: join(out, `${shotName}-address.png`) });
    // swing, and watch the flight: frames round the ball, the seconds to its rest
    const b0 = await ballXY(), t0 = Date.now();
    await page.evaluate(sw => window.__game.ownerSwing(sw), st.sw);
    const frames = [], camT0 = await page.evaluate(() => window.__cam.length);
    let t1 = null;
    for (let k = 0; k < 45; k++) {
      frames.push(await page.screenshot({ clip: { x: Math.max(0, Math.min(W - 520, b0.x - 260)), y: Math.max(0, Math.min(H - 340, b0.y - 210)), width: 520, height: 340 } }));
      const flying = await page.evaluate(() => !!window.__game.yourRoundView()?.flying);
      if (!flying) { t1 = Date.now(); break; }
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(500);
    const cam = await page.evaluate(n => { const a = window.__cam.slice(n); let maxV = 0, maxZ = 0; const sp = []; for (let k = 1; k < a.length; k++) { const dt = Math.max(1e-3, (a[k].t - a[k - 1].t) / 1000), v = Math.hypot(a[k].X - a[k - 1].X, a[k].Y - a[k - 1].Y) * a[k].z / dt; sp.push({ k, v: Math.round(v), dtMs: Math.round(dt * 1000), ft: a[k].ft, z: +a[k].z.toFixed(3) }); maxV = Math.max(maxV, v); maxZ = Math.max(maxZ, Math.abs(a[k].z - a[k - 1].z) / dt); } sp.sort((p, q) => q.v - p.v); return { frames: a.length, maxPxPerS: Math.round(maxV), maxZPerS: +maxZ.toFixed(3), z: a[a.length - 1]?.z, top: sp.slice(0, 4), medianDtMs: a.length > 2 ? Math.round(a.map((q, i) => i ? q.t - a[i - 1].t : 0).slice(1).sort((p, q) => p - q)[Math.floor(a.length / 2)]) : null }; }, camT0);
    const after = await page.evaluate(() => { const g = window.__game, r = g.yourRound(), v = g.yourRoundView(); return { lie: r.lie, holed: r.holed, over: r.over, text: g.lastShotReport()?.text, strokes: r.card[r.at].strokes }; });
    rep.shots.push({ ...st, sw: st.sw, flightS: t1 ? (t1 - t0) / 1000 : null, cam, after });
    if (st.stroke <= 2 || st.club === 'putter') await sheet(frames.filter((_, i) => i % 2 === 0).slice(0, 15), `${shotName}-flight.png`);
    log(`h${st.hole} s${st.stroke} ${st.club.padEnd(7)} ${st.lie.padEnd(8)} dist ${st.distM.toFixed(0)} m, power ${(st.power * 100).toFixed(0)}% -> ${after.text}`);
    // on: the card closes itself at a hole out; Jump to the next ball
    if (after.holed) { holesDone++; await page.evaluate(() => { const g = window.__game; g.toggleYourCard?.(false); g.yourNextHole(); }); await page.waitForTimeout(400); }
    if (after.over) break;
    const t2 = Date.now();
    await page.evaluate(() => window.__game.yourJump());
    await nextShot(15000).catch(() => {});
    rep.shots[rep.shots.length - 1].toNextS = (Date.now() - t2) / 1000;
    shotNo++;
  }

  writeFileSync(join(out, 'playtest.json'), JSON.stringify(rep, null, 1));
} finally { await browser.close(); }
process.exitCode = bad ? 1 : 0;

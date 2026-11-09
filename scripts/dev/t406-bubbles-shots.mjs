// T406 (#1090, the owner, 2026-11-09: "add speech bubbles to the game for all of the people walking around. both random thoughts, happiness and game related, and fun
// ones, like if you hit a spectator he will hold his knee for 2 mins and just go 'Aaarggg ...... aaarrgghh...' over and over."): the game's own code on the game's own course
// (the dev tournament town), shots and checks:
//   A. a walking crowd with a few bubbles: a green's gallery of 90 fans and the townspeople, the machine on High, the shot when four or more bubbles are up
//   B. a golfer's reaction: the tournament's golfers on the course, a birdie and a ball in the water said by the golfer and the fans round him
//   C. the knee gag: a ball comes down on a fan: he crouches (the stand-in labelled), the bubble moans on its beat, the toast, and (the loop's timing, checked in the page) two game
//      minutes at the watching speed; then limping off
//   D. the settings: Speech bubbles off (no bubble, none ever made), the frequency (Low, Normal, High) and the cap; the cost of a frame (perf.bubbleMs) with 90 fans, with and without
//   node scripts/dev/t406-bubbles-shots.mjs --base http://127.0.0.1:5203/ --out E:/ClaudeTemp/T406 [--seed 7]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; nothing is saved.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5203/'), out = opt('out', 'E:/ClaudeTemp/T406'), seed = opt('seed', '7');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let bad = 0;
const metrics = {};
const log = (...a) => console.log(...a);
const check = (ok, what) => { log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.perf.chunksPending === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => log('  (settle timed out)'));
  await page.waitForTimeout(400);
};
/** the shots show the map: the HUD is hidden (the canvases only) except in the ones named -hud; clip crops round the middle of the screen */
const CLEAN = '.t406-clean * { visibility: hidden !important } .t406-clean canvas { visibility: visible !important }';
const clean = (page, on) => page.evaluate(on => document.documentElement.classList.toggle('t406-clean', on), on);
const MID = { x: 303, y: 150, width: 760, height: 520 };
const shot = async (page, name, clip = name.endsWith('-hud') ? undefined : MID) => { const f = join(out, `${name}.jpg`); await clean(page, !name.endsWith('-hud')); await page.waitForTimeout(80); await sharp(await page.screenshot({ type: 'png', ...(clip ? { clip } : {}) })).jpeg({ quality: 90, mozjpeg: true }).toFile(f); await clean(page, false); log('  ' + f); return f; };
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [x, y, z]);
let section = 0;
async function run(name, fn) { section++; log(`\n== ${section}. ${name}`); try { await fn(); } catch (e) { bad++; log(`FAIL (threw) ${String(e.stack ?? e.message).split('\n').slice(0, 4).join(' | ')}`); } }

try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 2 }), page = await ctx.newPage();
  page.on('pageerror', e => { log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error') log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&tourney=1&everyday=0&seed=${seed}`, { waitUntil: 'commit', timeout: 600000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 1200000, polling: 500 });
  await page.addStyleTag({ content: CLEAN });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.closeWelcome?.(false); g.nightAmount = () => 0; g.setSpeed(1); g.emit(); });
  const jump = m => page.evaluate(async m => { const g = window.__game, T = g.traffic, c = await import('/src/game/sim/townclock.ts'); T.setTownClock(c.jumpTo(T.town, T.simTime(performance.now()), m, T.town.rate)); }, m);
  await page.evaluate(async () => {
    const g = window.__game;
    window.__M = { gal: await import('/src/game/golf/galleries.ts'), view: await import('/src/game/crowdview.ts'), lib: await import('/src/game/library.ts'), bub: await import('/src/game/bubbles.ts'), lines: await import('/src/game/bubble-lines.ts') };
    // the galleries as the City would send them: every spot of the course in the engine's order, 90 fans at the hole's tee and green, none elsewhere
    window.__gallery = hole => {
      const M = window.__M, spots = M.gal.gallerySpots(g.golf.tees, g.golf.pins, g.golf.structures ?? [], undefined, g.spectatorField ? g.spectatorField() : null);
      const buf = new Float32Array(8 * spots.length);
      spots.forEach((s, i) => buf.set([s.x, s.y, s.hole === hole || (hole === 0 && (s.kind === 'tee' || s.kind === 'green')) ? 90 : 0, s.kind === 'stand' ? 2 : 0, s.fx, s.fy, s.ax, s.ay], 8 * i));
      window.__galBuf = buf; Object.defineProperty(g.traffic, 'gallery', { configurable: true, get: () => window.__galBuf, set: () => {} });
      return spots.map(s => ({ hole: s.hole, kind: s.kind, x: s.x, y: s.y }));
    };
  });
  const course = await page.evaluate(() => { const g = window.__game; return { holes: g.golf.pins.length, tees: g.golf.tees.map(t => ({ hole: t.hole, x: t.x, y: t.y })), pins: g.golf.pins.map(p => ({ hole: p.hole, x: p.x, y: p.y })), clubhouse: g.golf.clubhouse }; });
  log('course', course.holes, 'holes');

  // ---------------------------------------------------------------- A. a walking crowd with a few bubbles
  await run('A. A gallery of 90 fans at a green with the machine on High: a few bubbles up', async () => {
    const hole = 3, pin = course.pins.find(p => p.hole === hole) ?? course.pins[0];
    const spots = await page.evaluate(h => window.__gallery(h), pin.hole);
    metrics.spots = spots.length;
    await page.evaluate(() => { const g = window.__game; g.setBubbleRate('high'); g.setShowBubbles(true); g.bubbles.clear(); });
    // (the first frames load the people's art, and the first look can be taken before the game has settled: look again until the fans are on screen, then wait for four bubbles)
    for (let k = 0; k < 40; k++) {
      await look(page, pin.x, pin.y, 0.3); await settle(page, 1500);
      if (await page.evaluate(() => window.__game.bubbles.host.count('spectator') > 0)) break;
    }
    const got = await page.waitForFunction(() => window.__game.bubbles.live.length >= 4, null, { timeout: 60000, polling: 100 }).then(() => true).catch(() => false);
    const st = await page.evaluate(() => { const g = window.__game, B = g.bubbles; return { live: B.live.map(b => ({ kind: b.kind, text: b.text, rule: b.rule, life: +b.life.toFixed(2) })), stats: { ...B.stats }, people: { spectator: B.host.count('spectator'), town: B.host.count('town'), golfer: B.host.count('golfer'), staff: B.host.count('staff') }, perf: { ms: +g.perf.bubbleMs.toFixed(3), drawn: g.perf.bubbles } }; });
    log('bubbles up:', JSON.stringify(st.live)); log('people on screen:', JSON.stringify(st.people), 'perf', JSON.stringify(st.perf));
    check(got && st.live.length >= 4, `four or more bubbles on screen at once (${st.live.length})`);
    check(st.live.length <= 8, 'never more than the High cap (8)');
    check(st.live.every(b => b.life >= 2 && b.life <= 4), 'each lives 2 to 4 s');
    metrics.crowd = st;
    await shot(page, 'A-crowd-bubbles');
    await page.waitForTimeout(1500); await shot(page, 'A-crowd-bubbles-2'); await shot(page, 'A-crowd-bubbles-hud');
  });

  // ---------------------------------------------------------------- B. a golfer's reaction
  await run('B. A golfer on the course: a birdie and a ball in the water, said by the golfer and the fans round him', async () => {
    await jump(560); await page.waitForTimeout(1500);
    // the golfers in view (the camera over them), one not in his swing, and the fans of the gallery nearest him round him (the same classes the worker uses)
    let q = null;
    for (let k = 0; k < 30 && !q; k++) {
      const focus = await page.evaluate(() => window.__game.playFocus?.() ?? null); if (!focus) { await page.waitForTimeout(1000); continue; }
      await look(page, focus.x, focus.y, 0.3); await settle(page, 1500);
      q = await page.evaluate(() => { const g = window.__game; for (let i = 0; i < g.bGolfN; i++) { const p = g.bGolf[i]; if (!p.busy && p.alpha > 0.9) return { id: p.id, x: p.d.x, y: p.d.y }; } return null; });
    }
    log('a golfer', JSON.stringify(q));
    if (!q) { check(false, 'the tournament has a golfer in view at 09:20'); return; }
    await page.evaluate(([q]) => {
      const g = window.__game, M = window.__M, spots = M.gal.gallerySpots(g.golf.tees, g.golf.pins, g.golf.structures ?? [], undefined, g.spectatorField ? g.spectatorField() : null);
      let best = 0, bd = 1e9; spots.forEach((s, i) => { if (s.kind === 'stand') return; const d = Math.hypot(s.x - q.x, s.y - q.y); if (d < bd) { bd = d; best = i; } });
      const buf = new Float32Array(8 * spots.length); spots.forEach((s, i) => buf.set([s.x, s.y, i === best ? 90 : 0, 0, s.fx, s.fy, s.ax, s.ay], 8 * i));
      window.__galBuf = buf; g.bubbles.clear(); g.setBubbleRate('normal');
    }, [q]);
    // say it in the frame he is in (he moves and swings): his own point now, the camera on him, until his bubble is up
    const say = async (event, tag) => {
      for (let k = 0; k < 40; k++) {
        const r = await page.evaluate(([id, event]) => {
          const g = window.__game, now = performance.now() / 1000, p = { kind: 'golfer', id, x: 0, y: 0, lift: 0, moving: false, busy: false, alpha: 1 };
          if (!g.bubbleFind('golfer', id, p) || p.busy) return null;
          g.bubbles.clear(); const made = g.bubbles.event(event, p.x, p.y, now, { kind: 'golfer', id });
          return { made, x: p.x, y: p.y, live: g.bubbles.live.map(b => ({ kind: b.kind, text: b.text, rule: b.rule })) };
        }, [q.id, event]);
        if (r && r.live.some(b => b.kind === 'golfer')) {
          await look(page, r.x, r.y, 0.3); await page.waitForTimeout(250); await shot(page, tag); log(event + ':', JSON.stringify(r.live)); return r;
        }
        await page.waitForTimeout(500);
      }
      return null;
    };
    const r1 = await say('birdie', 'B-golfer-reaction-birdie');
    check(!!r1, 'the golfer says it himself (Birdie!), with his fans round him'); check(!!r1 && r1.live.some(b => b.kind === 'spectator'), 'and the fans round him');
    await page.waitForTimeout(3500);
    const r2 = await say('ball-water', 'B-golfer-reaction-water');
    check(!!r2, 'and a ball in the water: "Not again!" and the like');
  });

  // ---------------------------------------------------------------- C. the knee gag
  await run('C. A ball comes down on a fan: he crouches, moans on a beat, then limps off; two game minutes', async () => {
    const hole = 3, pin = course.pins.find(p => p.hole === hole) ?? course.pins[0];
    await page.evaluate(h => { window.__gallery(h); const g = window.__game; g.bubbles.clear(); g.setSpeed(0); g.emit(); }, pin.hole);
    await look(page, pin.x, pin.y, 0.3); await settle(page, 2500);
    const r = await page.evaluate(() => {
      const g = window.__game, M = window.__M, G = g.traffic.gallery, now = performance.now() / 1000;
      // the first spot with fans, and a fan of it: the ball lands on him
      let spot = -1; for (let i = 0; i + 7 < G.length; i += 8) if (G[i + 2] > 0 && G[i + 3] !== 2) { spot = i / 8; break; }
      const out = [], k = M.view.galleryPeople(G, spot * 8, spot, 0, 1, out, -1, undefined, g.galleryPlaces.get(spot)), fan = out[Math.floor(k / 2)];
      const land = { golfer: 0, hole: 2, x: fan.x + 0.05, y: fan.y, rx: fan.x + 0.05, ry: fan.y, landLie: 'rough', lie: 'rough', club: 'driver', stroke: 2, penalty: 0, holed: false, par: 4, px: fan.x + 20, py: fan.y };
      g.bubbleLanded(land, 0, now);
      return { spot, fan: { x: fan.x, y: fan.y }, hurts: g.bubbles.hurts.map(h => ({ spot: h.spot, slot: h.slot, pose: h.pose, simDur: +h.simDur.toFixed(3) })), toasts: g.toasts.map(t => t.text), live: g.bubbles.live.map(b => ({ kind: b.kind, text: b.text })) };
    });
    log('the knee gag:', JSON.stringify(r));
    check(r.hurts.length === 1 && r.hurts[0].pose === 'clutch', 'the fan clutches his knee');
    check(r.toasts.some(t => /Ouch/.test(t)), 'a toast says so');
    await look(page, r.fan.x, r.fan.y, 0.3); await page.waitForTimeout(900);
    const t1 = await page.evaluate(() => { const g = window.__game, now = performance.now() / 1000, o = []; g.bubbles.drawable(now, o); return o.map(b => ({ text: b.text, hurt: !!b.hurt })); });
    log('at 1 s:', JSON.stringify(t1)); check(t1.some(b => b.hurt && /Aaarrgh/.test(b.text)), 'the groan is up on the first beat');
    await shot(page, 'C-knee-gag-groan');
    await page.waitForTimeout(3300);
    const t2 = await page.evaluate(() => { const g = window.__game, now = performance.now() / 1000, o = []; g.bubbles.drawable(now, o); return o.map(b => ({ text: b.text, hurt: !!b.hurt })); });
    log('at 4.2 s:', JSON.stringify(t2)); check(t2.some(b => b.hurt && /aaarrgghh/.test(b.text)), 'then its echo on the second beat');
    await shot(page, 'C-knee-gag-echo');
    // the timing: at the watching speed (1/40x) two game minutes last about 50 real seconds; asked in the page without waiting (the clock is the game's: simDur and the rate)
    const tm = await page.evaluate(async () => {
      const g = window.__game, c = await import('/src/game/sim/townclock.ts'), T = g.traffic, sim = T.simTime(performance.now()), rate = c.localRate(T.town, sim), h = g.bubbles.hurts[0];
      return { rate: +rate.toFixed(3), simDur: +h.simDur.toFixed(3), realAtWatching: +(h.simDur * 40).toFixed(1), floor: 8 };
    });
    log('the loop:', JSON.stringify(tm)); metrics.loop = tm;
    check(Math.abs(tm.simDur - 2 / tm.rate) < 0.01, 'the gag is two game minutes long');
    // the limp-off: bring the clock on (the pose is read from the engine's clocks): force the limp
    await page.evaluate(() => { const g = window.__game, h = g.bubbles.hurts[0], now = performance.now() / 1000; h.pose = 'limp'; h.since = now - 2; });
    await page.waitForTimeout(500); await shot(page, 'C-knee-gag-limp');
    const lm = await page.evaluate(() => window.__game.bubbles.hurts.map(h => h.pose)); check(lm[0] === 'limp', 'he limps off');
    await page.evaluate(() => { const g = window.__game; g.bubbles.clear(); g.setSpeed(1); });
  });

  // ---------------------------------------------------------------- D. the settings and the cost
  await run('D. Speech bubbles off, the frequency, and the cost of a frame', async () => {
    const hole = 3, pin = course.pins.find(p => p.hole === hole) ?? course.pins[0];
    await page.evaluate(h => { window.__gallery(h); window.__game.bubbles.clear(); }, pin.hole);
    await look(page, pin.x, pin.y, 0.3); await settle(page, 2500);
    const made = async (rate, on, secs) => page.evaluate(async ([rate, on, secs]) => {
      const g = window.__game, B = g.bubbles; B.clear(); B.stats.spawned = 0; g.setShowBubbles(on); g.setBubbleRate(rate);
      let max = 0, samples = [], t0 = performance.now();
      await new Promise(res => { g.onFrame = () => { max = Math.max(max, B.live.length + B.hurts.length); samples.push(g.perf.bubbleMs); if (performance.now() - t0 > secs * 1000) { g.onFrame = null; res(); } }; });
      samples.sort((a, b) => a - b);
      return { spawned: B.stats.spawned, max, msAvg: +(samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length)).toFixed(4), msP95: +(samples[Math.floor(samples.length * 0.95)] ?? 0).toFixed(4), frames: samples.length };
    }, [rate, on, secs]);
    const off = await made('normal', false, 8), lo = await made('low', true, 20), mid = await made('normal', true, 20), hi = await made('high', true, 20);
    log('off', JSON.stringify(off)); log('low', JSON.stringify(lo)); log('normal', JSON.stringify(mid)); log('high', JSON.stringify(hi));
    metrics.settings = { off, lo, mid, hi };
    check(off.spawned === 0 && off.max === 0, 'Speech bubbles off: none are made');
    check(lo.max <= 4 && mid.max <= 6 && hi.max <= 8, `the caps hold: low ${lo.max} <= 4, normal ${mid.max} <= 6, high ${hi.max} <= 8`);
    check(lo.spawned < mid.spawned && mid.spawned < hi.spawned, `Low (${lo.spawned}) < Normal (${mid.spawned}) < High (${hi.spawned})`);
    check(hi.msP95 < 0.3, `a frame's bubbles cost under 0.3 ms at the 95th percentile on High (${hi.msP95} ms)`);
    await page.evaluate(() => { const g = window.__game; g.setShowBubbles(true); g.setBubbleRate('normal'); });
    // the gear menu: the Speech bubbles row with its frequency chips, no sideways scrollbar
    await page.click('button[data-tip="Settings"]'); await page.waitForTimeout(500);
    const row = await page.$('[data-testid=bubbles-setting]');
    if (row) await row.scrollIntoViewIfNeeded();
    const m = await page.evaluate(() => { const r = document.querySelector('[data-testid=bubbles-setting]'), menu = r?.closest('.overflow-y-auto'); return r && menu ? { menuW: menu.clientWidth, menuScrollW: menu.scrollWidth, chips: [...r.querySelectorAll('button')].map(b => b.textContent), rowW: r.scrollWidth, rowClientW: r.clientWidth } : null; });
    log('the gear menu row', JSON.stringify(m));
    check(!!m && m.menuScrollW <= m.menuW + 1 && m.chips.join() === 'Low,Normal,High', 'the row is in the menu with Low, Normal and High and no sideways scrollbar');
    await shot(page, 'D-gear-menu-hud');
    await page.click('button[data-tip="Settings"]');
  });

  writeFileSync(join(out, 'metrics.json'), JSON.stringify(metrics, null, 1));
  log(`\n${bad ? `${bad} FAILED` : 'all ok'}`);
} finally { await browser.close(); }
process.exit(bad ? 1 : 0);

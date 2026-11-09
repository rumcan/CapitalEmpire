// T406 / T408: the cost of a crowded tournament scene (the owner's rule: "dont screw performance": main against the branch, a ms ceiling per addition).
// A tournament town (?start=town&tourney=1) with SPECTATORS fans (default 5,000) put in the frame the way the City would send them: every gallery spot's fans (by the course's
// own spots and the fair shares of the day, golf/gallerydraw.ts fairShares), 90 fans drawn a spot at most, and walking parties heading for them; the camera over the busiest
// spots at 30% and 15%. The frames' cpu ms (average, p95), the frame ms, the sim worker's tick (average, max ms) and, on the branch, the speech bubbles' own ms
// (perf.bubbleMs) and the bubbles drawn; on the branch the run is made with the bubbles on and off (the A/B on one build); on main the same scene runs as it is.
//   node scripts/perf/crowd-bench.mjs --base http://127.0.0.1:5203/ --out E:/ClaudeTemp/T406/bench-branch.json [--spectators 5000] [--seed 7] [--secs 8] [--crowdcard 1]
// One headless Edge on the real GPU (msedge channel), closed when done. Run the same command against main's dev server for the baseline.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5203/'), out = opt('out', 'E:/ClaudeTemp/T406/bench.json'), seed = opt('seed', '7'), spectators = +opt('spectators', '5000'), secs = +opt('secs', '8'), runs = +opt('runs', '3');
mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const log = (...a) => console.log(...a);
const result = { base, spectators, seed, runs: [] };
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
  page.on('pageerror', e => log('[pageerror]', e.message));
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&tourney=1&everyday=0&seed=${seed}`, { waitUntil: 'commit', timeout: 600000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 1200000, polling: 500 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.closeWelcome?.(false); g.nightAmount = () => 0; g.setSpeed(1); g.emit(); });
  // the day: 10:30, golfers out, the playback on
  await page.evaluate(async () => { const g = window.__game, T = g.traffic, c = await import('/src/game/sim/townclock.ts'); T.setTownClock(c.jumpTo(T.town, T.simTime(performance.now()), 630, T.town.rate)); });
  // the crowd: fair shares of SPECTATORS over the spots by the afternoon's draw, capped by each spot's room; parties of three walking to the busiest
  const setup = await page.evaluate(async n => {
    const g = window.__game, G = await import('/src/game/golf/galleries.ts'), D = await import('/src/game/golf/gallerydraw.ts'), CV = await import('/src/game/crowdview.ts'), WS = (await import('/src/game/event/crowd.ts')).WALK_STRIDE;
    const spots = G.gallerySpots(g.golf.tees, g.golf.pins, g.golf.structures ?? [], undefined, g.spectatorField ? g.spectatorField() : null), holes = g.golf.pins.length;
    let shares = D.fairShares(spots, 14 * 60, holes, n); const fill = shares.map((v, i) => Math.min(spots[i].cap, Math.round(v)));
    const buf = new Float32Array(8 * spots.length); spots.forEach((s, i) => buf.set([s.x, s.y, fill[i], s.kind === 'stand' ? 2 : 0, s.fx, s.fy, s.ax, s.ay], 8 * i));
    window.__galBuf = buf; Object.defineProperty(g.traffic, 'gallery', { configurable: true, get: () => window.__galBuf, set: () => {} });
    // parties walking: 400 groups of three in a ring round the six fullest spots
    const order = fill.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 6).map(p => p[1]), W = new Float32Array(WS * 400);
    for (let k = 0; k < 400; k++) { const s = spots[order[k % order.length]], a = CV.hash(k, 1) * Math.PI * 2, r = 8 + CV.hash(k, 2) * 30; W.set([s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, 3, 3, s.x, s.y, k + 1], WS * k); }
    window.__walkBuf = W; Object.defineProperty(g.traffic, 'walkers', { configurable: true, get: () => window.__walkBuf, set: () => {} });
    return { spots: spots.length, fans: fill.reduce((a, b) => a + b, 0), top: order.map(i => ({ hole: spots[i].hole, kind: spots[i].kind, fans: fill[i], x: spots[i].x, y: spots[i].y })), walkers: 400, hasBubbles: !!g.bubbles };
  }, spectators);
  log('the scene', JSON.stringify(setup)); result.setup = setup;
  const measure = async (zoom, spot, bubbles) => page.evaluate(async ([zoom, spot, bubbles, secs]) => {
    const g = window.__game; if (g.bubbles) { g.setShowBubbles(bubbles); g.setBubbleRate('high'); g.bubbles.clear(); }
    g.camEase = null; g.lookAt(spot.x, spot.y, zoom);
    const cpu = [], frame = [], tick = [], bub = [], drawn = []; let t0 = performance.now(), warm = 2500, max = 0;
    await new Promise(res => { g.onFrame = () => { const t = performance.now() - t0; if (t < warm) return; cpu.push(g.perf.cpuMs); frame.push(g.perf.frameMs); tick.push(g.perf.simTickMs); bub.push(g.perf.bubbleMs ?? 0); drawn.push(g.perf.bubbles ?? 0); if (g.bubbles) max = Math.max(max, g.bubbles.live.length + g.bubbles.hurts.length); if (t > warm + secs * 1000) { g.onFrame = null; res(); } }; });
    const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length), q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
    return { frames: cpu.length, cpuAvg: +avg(cpu).toFixed(3), cpuP95: +q(cpu, 0.95).toFixed(3), frameAvg: +avg(frame).toFixed(3), frameP95: +q(frame, 0.95).toFixed(3), tickAvg: +avg(tick).toFixed(3), tickMax: +Math.max(0, ...tick).toFixed(3), bubbleAvg: +avg(bub).toFixed(4), bubbleP95: +q(bub, 0.95).toFixed(4), bubbleMax: +Math.max(0, ...bub).toFixed(4), bubblesMax: max, bubblesDrawnAvg: +avg(drawn).toFixed(2), spectators: g.spectatorSeenN, people: g.perf.spaced };
  }, [zoom, spot, bubbles, secs]);
  const spot = setup.top[0];
  for (let r = 0; r < runs; r++) {
    for (const zoom of [0.3, 0.15]) for (const on of setup.hasBubbles ? (r % 2 ? [true, false] : [false, true]) : [false]) {
      const m = await measure(zoom, spot, on); m.zoom = zoom; m.bubbles = setup.hasBubbles ? on : null; m.run = r; result.runs.push(m);
      log(`run ${r} zoom ${zoom} bubbles ${setup.hasBubbles ? (on ? 'on ' : 'off') : 'n/a'}: cpu ${m.cpuAvg} ms (p95 ${m.cpuP95}), frame ${m.frameAvg} ms, tick ${m.tickAvg}/${m.tickMax} ms, bubbles ${m.bubbleAvg} ms (p95 ${m.bubbleP95}, max ${m.bubbleMax}), up to ${m.bubblesMax} up, ${m.spectators} fans drawn`);
    }
  }
  // pooled: per zoom and switch
  const pool = {}; for (const m of result.runs) { const k = `${Math.round(m.zoom * 100)}% ${m.bubbles === null ? 'main' : m.bubbles ? 'on' : 'off'}`; (pool[k] ??= []).push(m); }
  result.pooled = Object.fromEntries(Object.entries(pool).map(([k, v]) => [k, { runs: v.length, cpuAvg: +(v.reduce((a, m) => a + m.cpuAvg, 0) / v.length).toFixed(3), cpuP95: +(v.reduce((a, m) => a + m.cpuP95, 0) / v.length).toFixed(3), frameAvg: +(v.reduce((a, m) => a + m.frameAvg, 0) / v.length).toFixed(3), tickAvg: +(v.reduce((a, m) => a + m.tickAvg, 0) / v.length).toFixed(3), tickMax: Math.max(...v.map(m => m.tickMax)), bubbleAvg: +(v.reduce((a, m) => a + m.bubbleAvg, 0) / v.length).toFixed(4), bubbleP95: +(v.reduce((a, m) => a + m.bubbleP95, 0) / v.length).toFixed(4), bubbleMax: Math.max(...v.map(m => m.bubbleMax)) }]));
  log('\npooled', JSON.stringify(result.pooled, null, 1));
  writeFileSync(out, JSON.stringify(result, null, 1));
} finally { await browser.close(); }

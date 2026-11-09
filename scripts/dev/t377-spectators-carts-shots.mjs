// T377 (#1033, the owner, 2026-11-08: "fix spectators walking in step 3 at a time and over water, greens, fairways or tee boxes, that includes where carts can drive. they
// should not be driving on tee boxes or greens and follow the cart paths. fix people standing watching next to a tee box. they need to be around it not on it."):
// the game's own code on the game's own course (the dev tournament town), before the fix and after, with the same pictures and the same counts:
//   A. a tee with its gallery and a green with its gallery: the fans as the engine draws them (galleryPeople), counted on a tee box, a green, a fairway, water, in
//      front of the tee; the shots are of the hole whose tee gallery stood most on its tee box in the old code
//   B. a walking crowd: groups of three from the clubhouse to the galleries by the game's Crowd (with its router when the game has one), every place of every group and
//      every person drawn (walkerPeople) counted on a tee box, a green, a bunker, water; the shots are of the walk whose straight line crosses the most of them
//   C. carts: the field's carts of the tournament day (the play view's CartPlay of the day: the engine's own, with its field when it has one), sampled over the whole day,
//      counted on a tee box, a green, a bunker, water, at their stops and on a drive, and on a cart path; the shots follow one cart on a drive
// Both runs print the same lines, so the old code's numbers are the proof of what was wrong. The crowd and the galleries are put in the frame (the engine draws
// traffic.walkers and traffic.gallery as the city worker last sent them: here they are the page's own, from the same classes the worker uses).
//   node scripts/dev/t377-spectators-carts-shots.mjs --base http://localhost:5188/ --out E:/ClaudeTemp/T377 --tag after [--seed 7]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; nothing is saved.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5188/'), out = opt('out', 'output/t377-shots'), tag = opt('tag', 'after'), seed = opt('seed', '7');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let bad = 0;
const metrics = { tag, seed };
const log = (...a) => console.log(...a);
const check = (ok, what) => { log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.perf.chunksPending === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => log('  (settle timed out)'));
  await page.waitForTimeout(400);
};
const shot = async (page, name) => { const f = join(out, `${tag}-${name}.jpg`); await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 86, mozjpeg: true }).toFile(f); log('  ' + f); };
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [x, y, z]);
let section = 0;
async function run(name, fn) { section++; log(`\n== ${section}. ${name}`); try { await fn(); } catch (e) { bad++; log(`FAIL (threw) ${String(e.stack ?? e.message).split('\n').slice(0, 4).join(' | ')}`); } }

try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
  page.on('pageerror', e => { log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error') log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&tourney=1&everyday=0&seed=${seed}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.closeWelcome?.(false); g.nightAmount = () => 0; g.setSpeed(0); g.emit(); });
  const jump = m => page.evaluate(async m => { const g = window.__game, T = g.traffic, c = await import('/src/game/sim/townclock.ts'); T.setTownClock(c.jumpTo(T.town, T.simTime(performance.now()), m, T.town.rate)); }, m);
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });

  // the page's helpers: the game's modules (the code under test), the ground of a point as the course grid and the map's water have it, and the crowd's pieces
  await page.evaluate(async () => {
    const g = window.__game, M = {
      gal: await import('/src/game/golf/galleries.ts'), crowd: await import('/src/game/event/crowd.ts'), view: await import('/src/game/crowdview.ts'),
      grid: await import('/src/game/ext/course-grid/index.ts'), lib: await import('/src/game/library.ts'),
      wf: await import('/src/game/golf/walkfield.ts').catch(() => null),
    };
    const SURF = M.grid.SURF, grid = g.courseGrid, cls = g.terrain.cls, MAP = Math.round(Math.sqrt(cls.length)), tees = g.golf.tees, pins = g.golf.pins, NP = M.lib.SPECTATOR_PEOPLE.length;
    /** what a point is: water (the map's river, creek and the course's), green, tee (the surface and the marker's box), bunker, fairway, else rough */
    const groundOf = (x, y) => {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (tx >= 0 && ty >= 0 && tx < MAP && ty < MAP) { const c = cls[ty * MAP + tx]; if (c === 3 || c === 4) return 'water'; }
      for (const t of tees) if (Math.abs(x - t.x) <= 1.5 && Math.abs(y - t.y) <= 1.5) return 'tee';
      const k = grid ? M.grid.cellAt(grid, x, y) : -1;
      if (k >= 0) { const s = grid.surf[k]; if (s === SURF.water) return 'water'; if (s === SURF.green) return 'green'; if (s === SURF.tee) return 'tee'; if (s === SURF.bunker || s === SURF.waste) return 'bunker'; if (s === SURF.fairway) return 'fairway'; }
      return 'rough';
    };
    const BLOCKED = new Set(['water', 'green', 'tee', 'bunker']);
    const field = () => (g.spectatorField ? g.spectatorField() : null);
    window.__t377 = { M, g, groundOf, BLOCKED, NP, field, tees, pins };
  });
  const T0 = await page.evaluate(() => { const T = window.__t377, g = T.g; return { holes: T.pins.length, tees: T.tees.length, hasField: !!g.walkFieldNow, clubhouse: g.golf.clubhouse }; });
  log('course', JSON.stringify(T0)); metrics.course = T0;
  if (T0.hasField) {
    const b = await page.evaluate(() => { const g = window.__game; g.walkFieldMemo = null; const a = performance.now(); const f = g.walkFieldNow(); const ms = performance.now() - a; return { ms: +ms.toFixed(1), w: f?.w, h: f?.h, cells: f ? f.w * f.h : 0 }; });
    log('the walk field, built from nothing:', JSON.stringify(b)); metrics.fieldBuild = b;
    const b2 = await page.evaluate(() => { const g = window.__game; const a = performance.now(); g.walkFieldNow(); return +(performance.now() - a).toFixed(3); });
    log('and asked again (kept):', b2, 'ms'); metrics.fieldKept = b2;
  }

  // ---------------------------------------------------------------- A. galleries
  await run('The galleries of a tee and a green: where their fans stand', async () => {
    const r = await page.evaluate(() => {
      const { M, g, groundOf, BLOCKED, NP, field, tees, pins } = window.__t377;
      const unit = (dx, dy) => { const L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
      const fansOf = (s, i) => { const o = [], buf = Float32Array.of(s.x, s.y, 60, s.kind === 'stand' ? 2 : 0, s.fx, s.fy, s.ax, s.ay), n = M.view.galleryPeople(buf, 0, i, 100, NP, o); return o.slice(0, n).map(p => ({ x: p.x, y: p.y })); };
      const spots = M.gal.gallerySpots(tees, pins, g.golf.structures ?? [], field());
      const tally = (kind) => {
        const t = { spots: 0, fans: 0, onTee: 0, onGreen: 0, onFairway: 0, onWater: 0, onBunker: 0, ahead: 0 };
        spots.forEach((s, i) => {
          if (s.kind !== kind) return; t.spots++;
          const tee = tees.find(q => q.hole === s.hole), pin = pins.find(q => q.hole === s.hole), [ux, uy] = tee && pin ? unit(pin.x - tee.x, pin.y - tee.y) : [0, 0];
          for (const p of fansOf(s, i)) {
            t.fans++; const gr = groundOf(p.x, p.y);
            if (gr === 'tee') t.onTee++; if (gr === 'green') t.onGreen++; if (gr === 'fairway') t.onFairway++; if (gr === 'water') t.onWater++; if (gr === 'bunker') t.onBunker++;
            if (kind === 'tee' && tee && ((p.x - tee.x) * ux + (p.y - tee.y) * uy) > 1.2) t.ahead++;
          }
        });
        return t;
      };
      // the hole to shoot: the one whose tee gallery stood most on its tee box with the old rule (a place behind and beside the tee), the same for both runs
      let best = null;
      for (const tee of tees) {
        const pin = pins.find(q => q.hole === tee.hole); if (!pin) continue;
        const [ux, uy] = unit(pin.x - tee.x, pin.y - tee.y), nx = -uy, ny = ux, s = { x: tee.x - ux * 3 + nx * 4, y: tee.y - uy * 3 + ny * 4, kind: 'tee', fx: tee.x, fy: tee.y, ax: pin.x, ay: pin.y };
        const n = fansOf(s, 0).filter(p => groundOf(p.x, p.y) === 'tee').length; if (!best || n > best.n) best = { hole: tee.hole, n };
      }
      return { tee: tally('tee'), green: tally('green'), shoot: best, spots: spots.map(s => ({ hole: s.hole, kind: s.kind, x: +s.x.toFixed(1), y: +s.y.toFixed(1) })).slice(0, 6) };
    });
    log('tee galleries  ', JSON.stringify(r.tee)); log('green galleries', JSON.stringify(r.green)); log('the hole to shoot', JSON.stringify(r.shoot));
    metrics.galleries = r;
    // the shots: that hole's tee gallery and green gallery in the frame
    const pos = await page.evaluate(() => ({ tees: window.__t377.tees.map(t => ({ hole: t.hole, x: t.x, y: t.y })), pins: window.__t377.pins.map(p => ({ hole: p.hole, x: p.x, y: p.y })) }));
    const hole = r.shoot.hole, tee = pos.tees.find(t => t.hole === hole), pin = pos.pins.find(p => p.hole === hole);
    for (const [kind, at, zoom] of [['tee', tee, 0.5], ['green', pin, 0.5]]) {
      await page.evaluate(([hole]) => {
        const { M, g, field, tees, pins } = window.__t377, spots = M.gal.gallerySpots(tees, pins, g.golf.structures ?? [], field());
        const buf = new Float32Array(8 * 2); let n = 0;
        for (const s of spots) if (s.hole === hole && (s.kind === 'tee' || s.kind === 'green')) { buf.set([s.x, s.y, 60, 0, s.fx, s.fy, s.ax, s.ay], 8 * n); n++; }
        window.__galBuf = buf.slice(0, 8 * n); Object.defineProperty(g.traffic, 'gallery', { configurable: true, get: () => window.__galBuf, set: () => {} });
      }, [hole]);
      await look(page, at.x, at.y, zoom); await settle(page, 1500);
      await shot(page, `gallery-${kind}-hole${hole}`);
    }
    await page.evaluate(() => Object.defineProperty(window.__game.traffic, 'gallery', { configurable: true, writable: true, value: new Float32Array(0) }));
  });

  // ---------------------------------------------------------------- B. the walking crowd
  await run('A walking crowd from the clubhouse to the galleries', async () => {
    const info = await page.evaluate(() => {
      const { M, g, groundOf, BLOCKED, NP, field, tees, pins } = window.__t377;
      const f = field(), spots = M.gal.gallerySpots(tees, pins, g.golf.structures ?? [], f).filter(s => s.kind === 'green');
      const start = g.golf.clubhouse, line = (a, b) => { let bad = 0, n = 0, mid = null; const L = Math.hypot(b.x - a.x, b.y - a.y), k = Math.max(2, Math.ceil(L / 0.5)); for (let i = 0; i <= k; i++) { const x = a.x + (b.x - a.x) * i / k, y = a.y + (b.y - a.y) * i / k; n++; if (BLOCKED.has(groundOf(x, y))) { bad++; mid = { x, y }; } } return { bad, n, mid }; };
      // the walk to shoot: the one whose straight line crosses the most tee boxes, greens, bunkers and water, the same for both runs
      let best = null; spots.forEach((s, i) => { const l = line(start, s); if (!best || l.bad > best.bad) best = { i, hole: s.hole, ...l }; });
      return { start, spots: spots.length, best, holes: spots.map(s => s.hole) };
    });
    log('walks from', JSON.stringify(info.start), 'to', info.spots, 'green galleries; the one to shoot', JSON.stringify(info.best)); metrics.walkInfo = info;
    // the crowd: groups of three to each green gallery, stepped as the City steps its crowd; sampled each step
    const res = await page.evaluate(([bestI]) => {
      const { M, g, groundOf, BLOCKED, NP, field, tees, pins } = window.__t377, f = field();
      const Crowd = M.crowd.Crowd, STRIDE = M.crowd.WALK_STRIDE ?? 6, spots = M.gal.gallerySpots(tees, pins, g.golf.structures ?? [], f).filter(s => s.kind === 'green');
      const C = new Crowd(1, 0); C.setSpots(spots.length);
      let rc = null; if (f && M.wf) { C.varied = true; rc = new M.wf.RouteCache(f, M.wf.SPECTATOR); C.router = (x, y, tx, ty) => rc.route({ x, y }, { x: tx, y: ty }); }
      const stand = (x, y) => f && M.wf ? M.wf.nearestStand(f, M.wf.SPECTATOR, x, y) ?? { x, y } : { x, y };
      const start = g.golf.clubhouse, add = (k, i) => { const s = spots[i], q = stand(s.x + ((k * 7) % 5 - 2) * 0.6, s.y + ((k * 3) % 5 - 2) * 0.6); C.add({ x: start.x + (k % 3) * 0.3, y: start.y + (k % 2) * 0.3, tx: q.x, ty: q.y, n: 3, town: 0, stage: 3, route: i }); };
      const people = [], buf = (only) => {
        const W = only === undefined ? C.walkers : C.walkers.filter(w => w.route === only), b = new Float32Array(STRIDE * W.length);
        W.forEach((w, j) => { const o = STRIDE * j, v = w.via ? w.via[w.vi ?? 0] : undefined; b[o] = w.x; b[o + 1] = w.y; b[o + 2] = w.n; b[o + 3] = w.stage; b[o + 4] = v ? v.x : w.tx; b[o + 5] = v ? v.y : w.ty; if (STRIDE > 6) b[o + 6] = w.id ?? 0; });
        return b;
      };
      let steps = 0, places = 0, badPlaces = 0, fairway = 0, drawn = 0, badDrawn = 0, drawnFairway = 0; const byGround = {};
      const frames = [], snap = new Map(); const out = [];
      // 40 groups of three to each green gallery, one more to each every 4 steps; the picture frames are taken of the chosen walk's groups at three moments
      const want = new Set([150, 300, 450]); let added = 0;
      while ((C.walkers.length || added < 40) && steps < 6000) {
        if (steps % 4 === 0 && added < 40) { for (let i = 0; i < spots.length; i++) add(added, i); added++; }
        C.step(0.35); steps++;
        const b = buf();
        for (let i = 0; i + STRIDE - 1 < b.length; i += STRIDE) {
          const gr = groundOf(b[i], b[i + 1]); places++; byGround[gr] = (byGround[gr] ?? 0) + 1; if (BLOCKED.has(gr)) badPlaces++; if (gr === 'fairway') fairway++;
          if (steps % 5 === 0) { const k = M.view.walkerPeople(b, i, i / STRIDE, steps * 0.1, NP, out); for (let j = 0; j < k; j++) { drawn++; const gp = groundOf(out[j].x, out[j].y); if (BLOCKED.has(gp)) badDrawn++; if (gp === 'fairway') drawnFairway++; } }
        }
        if (want.has(steps)) frames.push({ step: steps, buf: Array.from(buf(bestI)) });
      }
      window.__walkFrames = frames.map(f => ({ step: f.step, buf: Float32Array.from(f.buf) }));
      return { steps, places, badPlaces, fairway, drawn, badDrawn, drawnFairway, byGround, left: C.walkers.length, gallery: C.gallery.reduce((a, b) => a + b, 0), stride: STRIDE, routes: rc ? rc.size : 0, frames: frames.map(f => f.step), router: !!rc };
    }, [info.best.i]);
    log('walking crowd', JSON.stringify(res)); metrics.walkers = res;
    check(res.left === 0, `every group arrives (${res.left} left after ${res.steps} steps)`);
    // the shots: the walk's groups at three moments, the camera over the blocked ground its straight line crosses
    const cam = info.best.mid ?? info.start;
    for (let k = 0; k < 3; k++) {
      const has = await page.evaluate(k => { const f = window.__walkFrames?.[k]; if (!f) return false; window.__walkBuf = f.buf; Object.defineProperty(window.__game.traffic, 'walkers', { configurable: true, get: () => window.__walkBuf, set: () => {} }); return f.buf.length; }, k);
      if (!has) { log(`  (no frame ${k + 1}: the walk ended first)`); continue; }
      await look(page, cam.x, cam.y, 0.3); await settle(page, 1200); await shot(page, `walkers-${k + 1}`);
    }
    await page.evaluate(() => { const T = window.__game.traffic; for (const k of ['walkers', 'gallery']) Object.defineProperty(T, k, { configurable: true, writable: true, value: new Float32Array(0) }); });
  });

  // ---------------------------------------------------------------- C. the field's carts
  await run('The field\'s carts over the tournament day', async () => {
    await jump(7 * 60); await page.evaluate(() => window.__game.setSpeed(1));
    await page.waitForFunction(() => window.__game.play?.pv, null, { timeout: 120000 });
    const r = await page.evaluate(() => {
      const { M, g, groundOf, BLOCKED } = window.__t377, pl = g.play, cp = pl.pv.cartPlay;
      if (!cp) return { error: 'no carts in the tournament day' };
      const gs = pl.plan.groups, t0 = Math.min(...gs.map(q => q.tee)) - 12, t1 = Math.max(...gs.map(q => q.tee)) + 330;
      // the cart paths (the network's cart paths and course drives): distance of a point to the nearest
      const paths = g.cartPathsNow(), S = paths ? paths.segs : new Float64Array(0);
      const toPath = (x, y) => { let d = Infinity; for (let i = 0; i + 3 < S.length; i += 4) { const ax = S[i], ay = S[i + 1], bx = S[i + 2], by = S[i + 3], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0; d = Math.min(d, Math.hypot(x - ax - dx * t, y - ay - dy * t)); } return d; };
      const out = [], prev = new Map(); let n = 0, bad = 0, moving = 0, onPath = 0, stops = 0, stopsBad = 0; const byGround = {};
      const N = pl.view.holes.length;
      for (let c = 0; c < cp.size; c++) for (let h = 0; h < N; h++) for (const v of cp.stops(c, h)) { stops++; if (BLOCKED.has(groundOf(v.stop.x, v.stop.y))) stopsBad++; }
      for (let m = t0; m <= t1; m += 0.25) {
        const k = cp.update(m, out);
        for (let i = 0; i < k; i++) {
          const q = out[i]; n++; const gr = groundOf(q.x, q.y); byGround[gr] = (byGround[gr] ?? 0) + 1; if (BLOCKED.has(gr)) bad++;
          const p = prev.get(q.cart); if (p && Math.hypot(q.x - p.x, q.y - p.y) > 0.05) { moving++; if (toPath(q.x, q.y) <= 1.6) onPath++; }
          prev.set(q.cart, { x: q.x, y: q.y });
        }
      }
      // the cart and drive to follow: the longest drive between two stops on one hole of the first cart that drives, the minutes of a quarter, half and three quarters of it
      let pick = null;
      for (let c = 0; c < cp.size && !pick; c++) for (let h = 1; h < N; h++) { const vs = cp.stops(c, h); for (let v = 0; v + 1 < vs.length; v++) { const d = Math.hypot(vs[v + 1].stop.x - vs[v].stop.x, vs[v + 1].stop.y - vs[v].stop.y); if (d > 25 && (!pick || d > pick.d)) pick = { c, h, d, t0: vs[v].dep, t1: vs[v + 1].arr }; } }
      return { carts: cp.size, samples: n, bad, byGround, moving, onPath, stops, stopsBad, minutes: [t0, t1], pick, paths: S.length / 4 };
    });
    log('carts', JSON.stringify(r)); metrics.carts = r;
    if (r.error || !r.pick) return;
    // the shots: that cart on that drive at a quarter, half and three quarters of it, the camera on it (the clock held: a minute at a time)
    await page.evaluate(() => window.__game.setSpeed(0));
    for (const [k, u] of [[1, 0.25], [2, 0.5], [3, 0.75]]) {
      const m = r.pick.t0 + (r.pick.t1 - r.pick.t0) * u;
      await jump(m); await page.waitForTimeout(600);
      const at = await page.evaluate(([c, m]) => { const g = window.__game, cp = g.play.pv.cartPlay, o = []; const n = cp.update(m, o); for (let i = 0; i < n; i++) if (o[i].cart === c) return { x: o[i].x, y: o[i].y }; return null; }, [r.pick.c, m]);
      if (!at) { log(`  (cart ${r.pick.c} not drawn at minute ${m.toFixed(1)})`); continue; }
      await look(page, at.x, at.y, 0.35); await settle(page, 1200); await shot(page, `carts-${k}`);
    }
  });

  // ---------------------------------------------------------------- D. the real crowd (the city worker's own walkers)
  await run('The real crowd: the event started in the game, its walkers as the city worker sends them', async () => {
    await page.evaluate(() => { const g = window.__game; g.setSpeed(0); });
    const stage = await page.evaluate(async () => { const g = window.__game; g.startRound(); await new Promise(r => setTimeout(r, 800)); g.startNow(); await new Promise(r => setTimeout(r, 800)); return g.traffic.round?.stage ?? null; });
    log('round stage after startRound and startNow:', stage);
    await page.evaluate(() => window.__game.setSpeed(4));
    const samples = []; const t0 = Date.now(); let taken = 0, lastShot = 0;
    while (Date.now() - t0 < 75000) {
      const s = await page.evaluate(() => {
        const { M, g, groundOf, BLOCKED } = window.__t377, W = g.traffic.walkers, G = g.traffic.gallery, st = M.crowd.WALK_STRIDE ?? 6; let n = 0, bad = 0, fair = 0, cx = 0, cy = 0; const by = {};
        for (let i = 0; i + st - 1 < W.length; i += st) { n++; const gr = groundOf(W[i], W[i + 1]); by[gr] = (by[gr] ?? 0) + 1; if (BLOCKED.has(gr)) bad++; if (gr === 'fairway') fair++; cx += W[i]; cy += W[i + 1]; }
        let fans = 0; for (let i = 2; i < G.length; i += 8) fans += G[i];
        return { n, bad, fair, fans: Math.round(fans), stage: g.traffic.round?.stage ?? null, stride: st, cx: n ? cx / n : 0, cy: n ? cy / n : 0, by };
      });
      samples.push(s);
      if (s.n >= 12 && taken < 2 && Date.now() - lastShot > 12000) { await look(page, s.cx, s.cy, 0.22); await page.waitForTimeout(500); await shot(page, `crowd-real-${taken + 1}`); taken++; lastShot = Date.now(); }
      await page.waitForTimeout(600);
    }
    const places = samples.reduce((a, s) => a + s.n, 0), bad = samples.reduce((a, s) => a + s.bad, 0), fair = samples.reduce((a, s) => a + s.fair, 0), peak = Math.max(0, ...samples.map(s => s.n)), fans = Math.max(0, ...samples.map(s => s.fans));
    const r = { samples: samples.length, places, onBlocked: bad, onFairway: fair, peakWalkers: peak, peakFansAtGalleries: fans, stages: [...new Set(samples.map(s => s.stage))], stride: samples[0]?.stride };
    log('the real crowd', JSON.stringify(r)); metrics.realCrowd = r;
    if (!places) log('  (no walkers formed in this town in 75 s: the event has no crowd here; the City-level test covers the worker path)');
  });

  writeFileSync(join(out, `${tag}-metrics.json`), JSON.stringify(metrics, null, 1));
  await ctx.close();
} finally { await browser.close(); }
log(bad ? `\n${bad} check(s) failed` : '\nall checks passed');
process.exit(bad ? 1 : 0);

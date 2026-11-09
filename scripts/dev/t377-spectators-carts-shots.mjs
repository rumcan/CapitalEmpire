// T377 (#1033, the owner, 2026-11-08: "fix spectators walking in step 3 at a time and over water, greens, fairways or tee boxes, that includes where carts can drive. they
// should not be driving on tee boxes or greens and follow the cart paths. fix people standing watching next to a tee box. they need to be around it not on it."):
// the game's own code on the game's own course (the dev tournament town), before the fix and after, with the same pictures and the same counts:
//   A. a tee with its gallery and a green with its gallery: the fans as the engine draws them (galleryPeople), counted on a tee box, a green, a fairway, water, in
//      front of the tee; the shots are of the hole whose tee gallery stood most on its tee box in the old code
//   B. a walking crowd: groups of three from the clubhouse to the galleries by the game's Crowd (with its router when the game has one), every place of every group and
//      every person drawn (walkerPeople) counted on a tee box, a green, a bunker, water; the shots are of the walk whose straight line crosses the most of them
//   C. carts: the field's carts of the tournament day (the play view's CartPlay of the day: the engine's own, with its field when it has one), sampled over the whole day,
//      counted on a tee box, a green, a bunker, water, at their stops and on a drive, and on a cart path; the shots follow one cart on a drive (the game's own frames)
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
    /** what a point is by the ground: water (the map's river, creek and the course's), green, tee (the painted surface), bunker, fairway, else rough */
    const surfOf = (x, y) => {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (tx >= 0 && ty >= 0 && tx < MAP && ty < MAP) { const c = cls[ty * MAP + tx]; if (c === 3 || c === 4) return 'water'; }
      const k = grid ? M.grid.cellAt(grid, x, y) : -1;
      if (k >= 0) { const s = grid.surf[k]; if (s === SURF.water) return 'water'; if (s === SURF.green) return 'green'; if (s === SURF.tee) return 'tee'; if (s === SURF.bunker || s === SURF.waste) return 'bunker'; if (s === SURF.fairway) return 'fairway'; }
      return 'rough';
    };
    /** surfOf, and a tee marker's box (3 x 3 tiles) is a tee box too */
    const groundOf = (x, y) => { const s = surfOf(x, y); if (s === 'water') return s; for (const t of tees) if (Math.abs(x - t.x) <= 1.5 && Math.abs(y - t.y) <= 1.5) return 'tee'; return s; };
    const BLOCKED = new Set(['water', 'green', 'tee', 'bunker']);
    const field = () => (g.spectatorField ? g.spectatorField() : null);
    window.__t377 = { M, g, groundOf, surfOf, BLOCKED, NP, field, tees, pins };
  });
  const T0 = await page.evaluate(() => { const T = window.__t377, g = T.g; return { holes: T.pins.length, tees: T.tees.length, hasField: !!g.walkFieldNow, clubhouse: g.golf.clubhouse }; });
  log('course', JSON.stringify(T0)); metrics.course = T0;
  if (T0.hasField) {
    const b = await page.evaluate(() => { const g = window.__game; g.walkFieldMemo = null; const a = performance.now(); const f = g.walkFieldNow(); const ms = performance.now() - a; return { ms: +ms.toFixed(1), w: f?.w, h: f?.h, cells: f ? f.w * f.h : 0 }; });
    log('the walk field, built from nothing:', JSON.stringify(b)); metrics.fieldBuild = b;
    const b2 = await page.evaluate(() => { const g = window.__game; const a = performance.now(); g.walkFieldNow(); return +(performance.now() - a).toFixed(3); });
    log('and asked again (kept):', b2, 'ms'); metrics.fieldKept = b2;
    // the game itself (nothing here has touched the course) sends the City the field and makes the galleries' places once the course is there (watchWalkField)
    await page.waitForTimeout(3000);
    const st = await page.evaluate(() => { const g = window.__game; return { places: g.galleryPlaces.size, sent: g.walkFieldSent === undefined ? 'undefined' : g.walkFieldSent === null ? 'null' : 'field' }; });
    log('the game sent the City its walk field and made the places of its galleries:', JSON.stringify(st)); metrics.engineState = st;
    check(st.sent === 'field' && st.places >= 18, 'the City has the walk field and the tee and green galleries have places, with nothing in the game touched');
  }

  // ---------------------------------------------------------------- A. galleries
  await run('The galleries of a tee and a green: where their fans stand', async () => {
    const r = await page.evaluate(() => {
      const { M, g, groundOf, surfOf, BLOCKED, NP, field, tees, pins } = window.__t377;
      const unit = (dx, dy) => { const L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
      // (the fans as the engine draws them: on the spot's places when it has them (the new code's arc and ring), else the block)
      const fansOf = (s, i) => { const o = [], buf = Float32Array.of(s.x, s.y, 60, s.kind === 'stand' ? 2 : 0, s.fx, s.fy, s.ax, s.ay), n = M.view.galleryPeople(buf, 0, i, 100, NP, o, -1, undefined, s.places); return o.slice(0, n).map(p => ({ x: p.x, y: p.y })); };
      const spots = M.gal.gallerySpots(tees, pins, g.golf.structures ?? [], undefined, field());
      const tally = (kind) => {
        const t = { spots: 0, fans: 0, onTee: 0, onGreen: 0, onFairway: 0, onWater: 0, onBunker: 0, ahead: 0, spread: 0, spreadMax: 0, withPlaces: 0 }; // (spread: the mean over the spots of the width of the 60 fans across the line of play for a tee, the angle they cover round the pin for a green, in degrees)
        spots.forEach((s, i) => {
          if (s.kind !== kind) return; t.spots++;
          const tee = tees.find(q => q.hole === s.hole), pin = pins.find(q => q.hole === s.hole), [ux, uy] = tee && pin ? unit(pin.x - tee.x, pin.y - tee.y) : [0, 0];
          const ps = fansOf(s, i); if (s.places) t.withPlaces++;
          if (ps.length && tee && pin) {
            let lo = Infinity, hi = -Infinity;
            for (const p of ps) { const w = kind === 'tee' ? (p.x - tee.x) * -uy + (p.y - tee.y) * ux : Math.atan2(ux * (p.y - pin.y) - uy * (p.x - pin.x), ux * (p.x - pin.x) + uy * (p.y - pin.y)) * 180 / Math.PI; lo = Math.min(lo, w); hi = Math.max(hi, w); }
            t.spread += (hi - lo) / 1; t.spreadMax = Math.max(t.spreadMax, hi - lo);
          }
          for (const p of ps) {
            t.fans++; const gr = groundOf(p.x, p.y);
            if (gr === 'tee') t.onTee++; if (gr === 'green') t.onGreen++; if (gr === 'fairway') t.onFairway++; if (gr === 'water') t.onWater++; if (gr === 'bunker') t.onBunker++;
            if (kind === 'tee' && tee && ((p.x - tee.x) * ux + (p.y - tee.y) * uy) > 1.2) t.ahead++;
          }
        });
        if (t.spots) t.spread = +(t.spread / t.spots).toFixed(1); t.spreadMax = +t.spreadMax.toFixed(1);
        return t;
      };
      // the holes to shoot: the tee whose gallery stood most on the painted tee box, in water, on a green, a bunker or a fairway with the old rule (a place behind and beside
      // the tee), and the green whose gallery stood most so (a place beside the pin): the same for both runs
      const ill = (x, y) => surfOf(x, y) !== 'rough', best = { tee: null, green: null };
      for (const tee of tees) {
        const pin = pins.find(q => q.hole === tee.hole); if (!pin) continue;
        const [ux, uy] = unit(pin.x - tee.x, pin.y - tee.y), nx = -uy, ny = ux;
        const st = { x: tee.x - ux * 3 + nx * 4, y: tee.y - uy * 3 + ny * 4, kind: 'tee', fx: tee.x, fy: tee.y, ax: pin.x, ay: pin.y }, sg = { x: pin.x + nx * 7, y: pin.y + ny * 7, kind: 'green', fx: pin.x, fy: pin.y, ax: pin.x, ay: pin.y };
        const nt = fansOf(st, 0).filter(p => ill(p.x, p.y)).length, ng = fansOf(sg, 0).filter(p => ill(p.x, p.y)).length;
        if (!best.tee || nt > best.tee.n) best.tee = { hole: tee.hole, n: nt }; if (!best.green || ng > best.green.n) best.green = { hole: pin.hole, n: ng };
      }
      return { tee: tally('tee'), green: tally('green'), shoot: best, spots: spots.map(s => ({ hole: s.hole, kind: s.kind, x: +s.x.toFixed(1), y: +s.y.toFixed(1) })).slice(0, 6) };
    });
    log('tee galleries  ', JSON.stringify(r.tee)); log('green galleries', JSON.stringify(r.green)); log('the holes to shoot', JSON.stringify(r.shoot));
    metrics.galleries = r;
    // the shots: that hole's tee gallery and green gallery in the frame
    const pos = await page.evaluate(() => ({ tees: window.__t377.tees.map(t => ({ hole: t.hole, x: t.x, y: t.y })), pins: window.__t377.pins.map(p => ({ hole: p.hole, x: p.x, y: p.y })) }));
    // (the first frame loads the people's art: the green's shot first is a warm-up, taken again)
    for (const [kind, hole, which, zoom, warm] of [['green', r.shoot.green.hole, 'green', 0.5, true], ['tee', r.shoot.tee.hole, 'tee', 0.5, false], ['green', r.shoot.green.hole, 'green', 0.5, false]]) {
      const at = which === 'tee' ? pos.tees.find(t => t.hole === hole) : pos.pins.find(p => p.hole === hole);
      await page.evaluate(([hole]) => {
        const { M, g, field, tees, pins } = window.__t377, spots = M.gal.gallerySpots(tees, pins, g.golf.structures ?? [], undefined, field());
        // every spot, in the engine's order (the engine's places are by the spot's index): 60 fans at that hole's tee and green, none elsewhere
        const buf = new Float32Array(8 * spots.length);
        spots.forEach((s, i) => buf.set([s.x, s.y, s.hole === hole && (s.kind === 'tee' || s.kind === 'green') ? 60 : 0, 0, s.fx, s.fy, s.ax, s.ay], 8 * i));
        window.__galBuf = buf; Object.defineProperty(g.traffic, 'gallery', { configurable: true, get: () => window.__galBuf, set: () => {} });
      }, [hole]);
      await look(page, at.x, at.y, zoom); await settle(page, warm ? 3500 : 1800);
      if (!warm) await shot(page, `gallery-${kind}-hole${hole}`);
    }
    await page.evaluate(() => Object.defineProperty(window.__game.traffic, 'gallery', { configurable: true, writable: true, value: new Float32Array(0) }));
  });

  // ---------------------------------------------------------------- B. the walking crowd
  await run('A walking crowd from the clubhouse to the galleries', async () => {
    const info = await page.evaluate(() => {
      const { M, g, groundOf, BLOCKED, NP, field, tees, pins } = window.__t377;
      const f = field(), spots = M.gal.gallerySpots(tees, pins, g.golf.structures ?? [], undefined, f).filter(s => s.kind === 'green');
      const start = g.golf.clubhouse, line = (a, b) => { let water = 0, other = 0, n = 0, mid = null; const L = Math.hypot(b.x - a.x, b.y - a.y), k = Math.max(2, Math.ceil(L / 0.5)); for (let i = 0; i <= k; i++) { const x = a.x + (b.x - a.x) * i / k, y = a.y + (b.y - a.y) * i / k, gr = groundOf(x, y); n++; if (gr === 'water') water++; else if (BLOCKED.has(gr)) { other++; mid = { x, y }; } } return { water, other, n, mid }; };
      // the walk to shoot: the one whose straight line crosses the most tee boxes, greens and bunkers and no water (a river is crossed by a bridge or not at all: a way round
      // the rest is always there), the same for both runs
      // (to the place the old rule gave the gallery, a place beside the pin: the same whatever the code puts the gallery)
      const oldPlace = s => { const t = tees.find(q => q.hole === s.hole), p = pins.find(q => q.hole === s.hole), L = Math.hypot(p.x - t.x, p.y - t.y) || 1; return { x: p.x + (-(p.y - t.y) / L) * 7, y: p.y + ((p.x - t.x) / L) * 7 }; };
      let best = null, any = null; spots.forEach((s, i) => { const l = line(start, oldPlace(s)); if (!any || l.water + l.other > any.water + any.other) any = { i, hole: s.hole, ...l }; if (!l.water && (!best || l.other > best.other)) best = { i, hole: s.hole, ...l }; });
      best = best && best.other > 0 ? best : any;
      return { start, spots: spots.length, best, holes: spots.map(s => s.hole) };
    });
    log('walks from', JSON.stringify(info.start), 'to', info.spots, 'green galleries; the one to shoot', JSON.stringify(info.best)); metrics.walkInfo = info;
    // the crowd: groups of three to each green gallery, stepped as the City steps its crowd; sampled each step
    const cam = info.best.mid ?? info.start;
    const res = await page.evaluate(([bestI, cam]) => {
      const { M, g, groundOf, BLOCKED, NP, field, tees, pins } = window.__t377, f = field();
      const Crowd = M.crowd.Crowd, STRIDE = M.crowd.WALK_STRIDE ?? 6, spots = M.gal.gallerySpots(tees, pins, g.golf.structures ?? [], undefined, f).filter(s => s.kind === 'green');
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
      // 40 groups of three to each green gallery, one more to each every 4 steps; the picture frames are taken of the chosen walk's groups when 5 or more of them are within
      // 40 tiles of the place the camera will be over (where its straight line crosses the most), at most three, 60 steps apart
      let added = 0, lastFrame = -1000;
      while ((C.walkers.length || added < 40) && steps < 6000) {
        if (steps % 4 === 0 && added < 40) { for (let i = 0; i < spots.length; i++) add(added, i); added++; }
        C.step(0.35); steps++;
        const b = buf();
        for (let i = 0; i + STRIDE - 1 < b.length; i += STRIDE) {
          const gr = groundOf(b[i], b[i + 1]); places++; byGround[gr] = (byGround[gr] ?? 0) + 1; if (BLOCKED.has(gr)) badPlaces++; if (gr === 'fairway') fairway++;
          if (steps % 5 === 0) { const k = M.view.walkerPeople(b, i, i / STRIDE, steps * 0.1, NP, out); for (let j = 0; j < k; j++) { drawn++; const gp = groundOf(out[j].x, out[j].y); if (BLOCKED.has(gp)) badDrawn++; if (gp === 'fairway') drawnFairway++; } }
        }
        if (frames.length < 3 && steps - lastFrame >= 60 && C.walkers.filter(w => w.route === bestI && Math.hypot(w.x - cam.x, w.y - cam.y) < 40).length >= 5) { frames.push({ step: steps, buf: Array.from(buf(bestI)) }); lastFrame = steps; }
      }
      window.__walkFrames = frames.map(f => ({ step: f.step, buf: Float32Array.from(f.buf) }));
      return { steps, places, badPlaces, fairway, drawn, badDrawn, drawnFairway, byGround, left: C.walkers.length, gallery: C.gallery.reduce((a, b) => a + b, 0), stride: STRIDE, routes: rc ? rc.size : 0, frames: frames.map(f => f.step), router: !!rc };
    }, [info.best.i, cam]);
    log('walking crowd', JSON.stringify(res)); metrics.walkers = res;
    check(res.left === 0, `every group arrives (${res.left} left after ${res.steps} steps)`);
    // the shots: the walk's groups at three moments, the camera over the blocked ground its straight line crosses
    for (let k = 0; k < 3; k++) {
      const has = await page.evaluate(k => { const f = window.__walkFrames?.[k]; if (!f) return false; window.__walkBuf = f.buf; Object.defineProperty(window.__game.traffic, 'walkers', { configurable: true, get: () => window.__walkBuf, set: () => {} }); return f.buf.length; }, k);
      if (!has) { log(`  (no frame ${k + 1}: the groups were not near the place)`); continue; }
      await look(page, cam.x, cam.y, 0.3); await settle(page, 1200); await shot(page, `walkers-${k + 1}`);
    }
    await page.evaluate(() => { const T = window.__game.traffic; for (const k of ['walkers', 'gallery']) Object.defineProperty(T, k, { configurable: true, writable: true, value: new Float32Array(0) }); });
  });

  // ---------------------------------------------------------------- C. the field's carts
  await run('The field\'s carts over the tournament day', async () => {
    // the dev course has little cart path (three pieces by the clubhouse): lay a dirt cart path along its longest hole, 14 tiles to the side of the line of play, as the road
    // tool does (the editor's legs, then the commit), before the day's play is built: the carts of that hole have a path to follow, the same for both runs
    const lay = await page.evaluate(async () => {
      const { g, tees, pins } = window.__t377, N = await import('/src/game/network.ts');
      let best = null; for (const t of tees) { const p = pins.find(q => q.hole === t.hole); if (!p) continue; const d = Math.hypot(p.x - t.x, p.y - t.y); if (!best || d > best.d) best = { t, p, d }; }
      if (!best) return null;
      const ux = (best.p.x - best.t.x) / best.d, uy = (best.p.y - best.t.y) / best.d, nx = -uy, ny = ux, off = 14;
      const a = { x: best.t.x - ux * 6 + nx * off, y: best.t.y - uy * 6 + ny * off }, b = { x: best.p.x + ux * 6 + nx * off, y: best.p.y + uy * 6 + ny * off };
      g.edit.addLegs([{ a, b }], N.CLASSES.find(c => c.id === 'cart-dirt'), 0); g.commitNetwork();
      window.__oldPlay = g.play; g.playTried = -1; // (the day's play was built when the town loaded: built again, with the path, at the next frame)
      return { hole: best.t.hole, a, b, d: Math.round(best.d) };
    });
    log('a cart path laid along the longest hole:', JSON.stringify(lay)); metrics.pathLaid = lay;
    await jump(7 * 60); await page.evaluate(() => window.__game.setSpeed(1));
    await page.waitForFunction(() => { const g = window.__game; return g.play && g.play !== window.__oldPlay && g.play.pv; }, null, { timeout: 120000 });
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
      // the cart and drive to follow: the longest drive between two stops that stand on a cart path (within 3 tiles of it); else, among the drives of over 15 tiles between two
      // stops of a hole, the one whose straight line crosses the most tee boxes, greens and bunkers and no water (a drive over water has no way but a bridge), else the longest
      let pick = null, onPathPick = null;
      for (let c = 0; c < cp.size; c++) for (let h = 0; h < N; h++) {
        const vs = cp.stops(c, h);
        for (let v = 0; v + 1 < vs.length; v++) {
          const A = vs[v].stop, B = vs[v + 1].stop, d = Math.hypot(B.x - A.x, B.y - A.y); if (d <= 15) continue;
          let water = 0, other = 0; const k = Math.ceil(d / 0.5);
          for (let i = 0; i <= k; i++) { const gr = groundOf(A.x + (B.x - A.x) * i / k, A.y + (B.y - A.y) * i / k); if (gr === 'water') water++; else if (BLOCKED.has(gr)) other++; }
          const score = water ? -1 : other, cand = { c, h, d, score, t0: vs[v].dep, t1: vs[v + 1].arr, ax: A.x, ay: A.y, bx: B.x, by: B.y };
          if (!pick || cand.score > pick.score || (cand.score === pick.score && cand.d > pick.d)) pick = cand;
          if (toPath(A.x, A.y) <= 3 && toPath(B.x, B.y) <= 3 && d > 10 && (!onPathPick || d > onPathPick.d)) onPathPick = cand;
        }
      }
      pick = onPathPick ?? pick;
      return { carts: cp.size, samples: n, bad, byGround, moving, onPath, stops, stopsBad, minutes: [t0, t1], pick, onPathPick: !!onPathPick, paths: S.length / 4 };
    });
    log('carts', JSON.stringify(r)); metrics.carts = r;
    if (r.error || !r.pick) return;
    // the shots: the game's own frames of that cart on that drive (the clock at the drive's start, running at 1x, the camera on the live cart): three shots 800 ms apart
    // once it has moved (a cart carried over water with no way is not drawn: nothing to shoot then)
    await look(page, r.pick.ax, r.pick.ay, 0.3); await jump(r.pick.t0 - 0.3); await page.waitForTimeout(400); await page.evaluate(() => window.__game.setSpeed(0.25));
    let k = 0, last = null;
    for (let tries = 0; tries < 120 && k < 3; tries++) {
      await page.waitForTimeout(150);
      const c = await page.evaluate(n => { const o = window.__game.play?.pv.carts.find(q => q.cart === n); return o ? { x: o.x, y: o.y } : null; }, r.pick.c);
      if (!c) continue;
      if (last && Math.hypot(c.x - last.x, c.y - last.y) < 3) { await look(page, c.x, c.y, 0.3); continue; }
      await look(page, c.x, c.y, 0.3); await page.waitForTimeout(250); k++; last = c; await shot(page, `carts-${k}`);
    }
    if (k < 3) log(`  (${k} of 3 shots: the cart was not drawn or did not move far enough)`);
    await page.evaluate(() => window.__game.setSpeed(0));
  });

  writeFileSync(join(out, `${tag}-metrics.json`), JSON.stringify(metrics, null, 1));
  await ctx.close();
} finally { await browser.close(); }
log(bad ? `\n${bad} check(s) failed` : '\nall checks passed');
process.exit(bad ? 1 : 0);

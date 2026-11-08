// T355 (#997): streets on the course land. In-game checks and shots on the old start (?start=town: a seeded town, the old nine, the clubhouse):
// the road tool with Cart paths & roads > Roads > Street in hand draws a street from a town road to the clubhouse across the rough (the game's own
// ghost, real mouse clicks, Enter to build), then the refusals are read and shot: a street across a hole's fairway ("Hole N's fairway is in the way",
// red ghost, the outlined stretch, the tooltip at the cursor), a first click on a fairway, an avenue on the land (the T124 message), and a cart path
// across the same fairway (still allowed). Every verdict is read from the engine too (routeBlock, the toasts) and printed.
//   node scripts/dev/streets-on-course-shots.mjs --base http://127.0.0.1:5186/ --out E:/ClaudeTemp/T355 [--seed 7] [--tag after] [--explore]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; fresh profile, no saves written. --explore prints the layout only.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5186/'), out = opt('out', 'E:/ClaudeTemp/T355'), seed = opt('seed', '7'), tag = opt('tag', 'after'), explore = args.includes('--explore');
const W = 1366, H = 860;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const shot = async (page, name, clip) => { const f = join(out, `${name}.png`); await page.screenshot({ path: f, ...(clip ? { clip } : {}) }); console.log('  shot ' + f); return f; };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  await page.goto(`${base}?start=town&seed=${seed}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => {
    const g = window.__game; g.closeWho?.('Pat Owner', 2); g.closeWelcome?.(false); g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night;
    g.traffic.budget.money = Math.max(g.traffic.budget.money, 1e8);
    const p = g.golf?.progress; if (p) { for (const k of ['who', 'welcome']) if (p.seen && !p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; }
    g.emit();
  });
  await sleep(1500);

  // ---- the layout: the land, the clubhouse, the course grid's playing surfaces, the town roads
  const facts = await page.evaluate(() => {
    const g = window.__game, G = g.golf, grid = g.courseGrid, land = g.golfLand();
    const club = g.bizDefs.find(b => b.type === 'clubhouse');
    let n = 0, play = 0; const kinds = {};
    if (grid) for (let i = 0; i < grid.surf.length; i++) { const s = grid.surf[i]; if (s) { n++; kinds[s] = (kinds[s] ?? 0) + 1; } if (s === 3 || s === 4 || s === 5 || s === 6 || s === 8) play++; }
    const roads = [...g.net.segs].map(s => ({ id: s.cls.id, fam: s.cls.family, a: [s.a.x, s.a.y], b: [s.b.x, s.b.y] }));
    return { land, club, parks: g.parkDefs, start: G.start, tier: G.tier, grid: grid ? { x0: grid.x0, y0: grid.y0, w: grid.w, h: grid.h, painted: n, play, kinds } : null, roads: roads.length, money: g.money, cls: g.roadClass };
  });
  console.log('facts', JSON.stringify(facts));
  check(!!facts.grid && facts.grid.play > 0, 'the course grid holds playing surfaces');
  if (explore) {
    const c = facts.club, cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    await page.evaluate(([x, y]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, 0.12); g.emit(); }, [cx, cy]);
    await settle(page, 1500); await shot(page, `explore-${tag}`);
    await ctx.close(); await browser.close(); process.exit(0);
  }

  // ---- 1. plan a street from a town road to the clubhouse over the rough: candidate routes judged by the engine's own routeBlock
  await page.evaluate(() => { const g = window.__game; g.setTool('road'); g.pickType('street'); g.emit(); });
  const plan = await page.evaluate(() => {
    const g = window.__game, land = g.golfLand(), club = g.bizDefs.find(b => b.type === 'clubhouse');
    const inLand = (x, y) => land.some(([rx, ry, rw, rh]) => x > rx && x < rx + rw && y > ry && y < ry + rh);
    const cx = club.x + club.w / 2, cy = club.y + club.h / 2;
    // the starts: nodes of town roads (not the course's), outside the land, nearest the clubhouse
    const nodes = []; for (const n of g.net.nodes.values()) { if (n.segs.some(s => s.cls.family === 'cart' || s.cls.family === 'course')) continue; if (inLand(n.x, n.y)) continue; nodes.push({ x: n.x, y: n.y, d: Math.hypot(n.x - cx, n.y - cy) }); }
    nodes.sort((p, q) => p.d - q.d);
    // the ends: a point a few tiles off each side of the clubhouse
    const ends = []; for (const d of [3, 4, 6]) for (const o of [-8, -4, 0, 4, 8]) {
      ends.push({ x: Math.round(club.x - d), y: Math.round(cy + o) }, { x: Math.round(club.x + club.w + d), y: Math.round(cy + o) }, { x: Math.round(cx + o), y: Math.round(club.y - d) }, { x: Math.round(cx + o), y: Math.round(club.y + club.h + d) });
    }
    const lenOn = legs => { let on = 0; for (const l of legs) { const L = Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y), k = Math.max(1, Math.ceil(L)); for (let i = 0; i < k; i++) { const t = (i + 0.5) / k; if (inLand(l.a.x + (l.b.x - l.a.x) * t, l.a.y + (l.b.y - l.a.y) * t)) on += L / k; } } return on; };
    const mk = pts => { const legs = []; for (let i = 1; i < pts.length; i++) if (pts[i].x !== pts[i - 1].x || pts[i].y !== pts[i - 1].y) legs.push({ a: pts[i - 1], b: pts[i] }); return legs; };
    let best = null; const whys = {}; let tried = 0;
    for (const s of nodes.slice(0, 8)) for (const e of ends) {
      const cands = [[s, { x: e.x, y: s.y }, e], [s, { x: s.x, y: e.y }, e]];
      for (let k = 1; k < 12; k++) { const mx = Math.round(s.x + (e.x - s.x) * k / 12), my = Math.round(s.y + (e.y - s.y) * k / 12); cands.push([s, { x: mx, y: s.y }, { x: mx, y: e.y }, e], [s, { x: s.x, y: my }, { x: e.x, y: my }, e]); }
      for (const pts of cands) {
        const legs = mk(pts); if (!legs.length || legs.some(l => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) < 3)) continue;
        tried++; const why = g.routeBlock(legs); const on = lenOn(legs);
        if (why) { if (on > 0) whys[why] = (whys[why] ?? 0) + 1; continue; }
        const len = legs.reduce((q, l) => q + Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y), 0), score = on * 3 - len;
        if (on > 8 && (!best || score > best.score)) best = { pts, on, len, score };
      }
    }
    return { best, tried, whys, nodes: nodes.slice(0, 3), club };
  });
  console.log('plan', JSON.stringify({ ...plan, whys: plan.whys }));
  check(!!plan.best, 'a street from a town road to the clubhouse over the rough is accepted by the engine (routeBlock empty)');
  if (!plan.best) { console.log('reasons met on the land:', JSON.stringify(plan.whys)); await ctx.close(); await browser.close(); process.exit(1); }
  const pts = plan.best.pts;

  // the camera: the whole route in the free part of the screen (the panels left, the bar at the top)
  const fit = async (ps, zs = [0.3, 0.26, 0.22, 0.2, 0.18, 0.16, 0.14, 0.12, 0.1, 0.08]) => {
    const cx = ps.reduce((q, p) => q + p.x, 0) / ps.length, cy = ps.reduce((q, p) => q + p.y, 0) / ps.length;
    for (const z of zs) {
      const r = await page.evaluate(([cx, cy, z, ps]) => { const g = window.__game; g.camEase = null; g.lookAt(cx, cy, z); return ps.map(p => { const s = g.screen(p.x, p.y); return { x: s.x / g.dpr, y: s.y / g.dpr }; }); }, [cx, cy, z, ps]);
      if (r.every(p => p.x > 420 && p.x < W - 60 && p.y > 130 && p.y < H - 110)) return { z, px: r };
    }
    return null;
  };
  const camera = async ps => { const f = await fit(ps); if (!f) throw new Error('route does not fit on screen'); await settle(page, 1200); return f; };
  const toPx = ps => page.evaluate(ps => { const g = window.__game; return ps.map(p => { const s = g.screen(p.x, p.y); return { x: s.x / g.dpr, y: s.y / g.dpr }; }); }, ps);

  // ---- 2. draw it with the mouse: a click per point, the ghost before the last one, Enter to build
  await camera(pts);
  let px = await toPx(pts);
  const segsOnLand = () => page.evaluate(() => { const g = window.__game, land = g.golfLand(); return [...g.net.segs].filter(s => !['cart', 'course'].includes(s.cls.family) && land.some(([rx, ry, rw, rh]) => { const x = (s.a.x + s.b.x) / 2, y = (s.a.y + s.b.y) / 2; return x > rx && x < rx + rw && y > ry && y < ry + rh; })).map(s => s.cls.id); });
  const before = await segsOnLand();
  const money0 = await page.evaluate(() => window.__game.money);
  for (let i = 0; i < pts.length; i++) {
    await page.mouse.move(px[i].x, px[i].y, { steps: 6 }); await sleep(120);
    if (i === pts.length - 1) {
      await sleep(250);
      const info = await page.evaluate(() => { const g = window.__game; return { block: g.routeBlock(), cost: g.routeCost(), legs: g.previewLegs().length }; });
      console.log('ghost before the last click', JSON.stringify(info));
      check(info.block === '', 'the street ghost is not refused over the rough');
      await shot(page, `1-street-ghost-${tag}`);
    }
    await page.mouse.click(px[i].x, px[i].y); await sleep(150);
  }
  const routeLen = await page.evaluate(() => window.__game.route.length);
  console.log('route points', routeLen, 'of', pts.length);
  await page.keyboard.press('Enter'); await sleep(400);
  let built = await segsOnLand();
  if (built.length === before.length) { console.log('(Enter did not build; finishRoute called)'); await page.evaluate(() => window.__game.finishRoute()); await sleep(400); built = await segsOnLand(); }
  const toast = await page.evaluate(() => window.__game.toasts.slice(-3).map(t => t.text));
  console.log('toasts', JSON.stringify(toast));
  check(built.length > before.length, `the street is built on the course land (${before.length} -> ${built.length} town road pieces on it: ${[...new Set(built)].join(', ')})`);
  check(toast.some(t => /^Built .* of street/.test(t)), 'the game says "Built ... of street"');
  const money1 = await page.evaluate(() => window.__game.money);
  console.log('paid', Math.round(money0 - money1));
  await settle(page, 2500);
  await camera(pts);
  await settle(page, 2500);
  await shot(page, `2-street-built-${tag}`);
  // the ground under it re-baked itself (no manual step): the canvas was settled, nothing stale
  check(await page.evaluate(() => window.__game.ground.busy === 0), 'the ground re-baked by itself (no pending work)');

  // ---- 3. across a hole's fairway: refused with the hole number
  const cross = await page.evaluate(() => {
    const g = window.__game, grid = g.courseGrid, land = g.golfLand(); const inLand = (x, y) => land.some(([rx, ry, rw, rh]) => x > rx && x < rx + rw && y > ry && y < ry + rh);
    const found = [];
    for (let cy = 0; cy < grid.h; cy += 2) for (let cx = 0; cx < grid.w; cx += 2) {
      const i = cy * grid.w + cx; if (grid.surf[i] !== 4 || !grid.hole[i]) continue;
      const x = Math.round(grid.x0 + (cx + 0.5) * 0.5), y = Math.round(grid.y0 + (cy + 0.5) * 0.5);
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const a = { x: x - dx * 14, y: y - dy * 14 }, b = { x: x + dx * 14, y: y + dy * 14 };
        if (!inLand(a.x, a.y) || !inLand(b.x, b.y)) continue;
        const why = g.routeBlock([{ a, b }]); if (/fairway is in the way/.test(why) && g.routeBlock([{ a, b: { x: a.x + dx * 4, y: a.y + dy * 4 } }]) === '') found.push({ a, b, why, hole: grid.hole[i] });
      }
      if (found.length > 12) break;
    }
    return found;
  });
  console.log('fairway crossings found', cross.length, JSON.stringify(cross[0] ?? null));
  check(cross.length > 0, 'a street across a fairway is refused by the engine, with the hole number');
  if (cross.length) {
    const c = cross[Math.floor(cross.length / 2)];
    check(/^Hole \d+'s fairway is in the way$/.test(c.why), `the refusal reads "${c.why}"`);
    const ps = [c.a, c.b];
    await page.evaluate(() => { const g = window.__game; g.cancelRoute(); g.setTool('road'); g.pickType('street'); g.emit(); });
    await camera(ps); px = await toPx(ps);
    await page.mouse.move(px[0].x, px[0].y, { steps: 4 }); await sleep(150); await page.mouse.click(px[0].x, px[0].y); await sleep(150);
    await page.mouse.move(px[1].x, px[1].y, { steps: 8 }); await sleep(500);
    const info = await page.evaluate(() => { const g = window.__game; return { block: g.routeBlock(), way: g.routeInWay(g.previewLegs())?.why ?? null, route: g.route.length }; });
    console.log('hovering across the fairway', JSON.stringify(info));
    check(/^Hole \d+'s fairway is in the way$/.test(info.block) && info.block === c.why, 'the ghost across the fairway is refused with the hole\'s name');
    await shot(page, `3-refused-over-fairway-${tag}`);
    // a click there builds nothing and says why
    const n0 = (await segsOnLand()).length;
    await page.mouse.click(px[1].x, px[1].y); await sleep(300);
    const t = await page.evaluate(() => window.__game.toasts.slice(-1)[0]?.text);
    check(t === c.why && (await segsOnLand()).length === n0, `a click on it builds nothing and the toast says "${t}"`);
    await shot(page, `3b-refused-click-${tag}`);
    // Enter does the same
    await page.keyboard.press('Enter'); await sleep(300);
    check((await segsOnLand()).length === n0, 'Enter builds nothing either');
    // the first click on a fairway
    await page.evaluate(() => window.__game.cancelRoute());
    const mid = { x: (c.a.x + c.b.x) / 2, y: (c.a.y + c.b.y) / 2 }; const pm = (await toPx([mid]))[0];
    await page.mouse.move(pm.x, pm.y, { steps: 4 }); await sleep(400);
    const first = await page.evaluate(() => window.__game.routeBlock());
    check(/^Hole \d+'s fairway is in the way$/.test(first), `the first point on a fairway is refused ("${first}")`);
    await shot(page, `4-start-on-fairway-${tag}`);
    await page.mouse.click(pm.x, pm.y); await sleep(200);
    check((await page.evaluate(() => window.__game.route.length)) === 0, 'a first click on a fairway starts no route');

    // ---- 4. a cart path across the same fairway: allowed as before
    await page.evaluate(() => { const g = window.__game; g.cancelRoute(); g.setTool('path'); g.roadClass = 'cart-dirt'; g.emit(); });
    await camera(ps); px = await toPx(ps);
    await page.mouse.move(px[0].x, px[0].y, { steps: 4 }); await sleep(150); await page.mouse.click(px[0].x, px[0].y); await sleep(150);
    await page.mouse.move(px[1].x, px[1].y, { steps: 8 }); await sleep(500);
    const cp = await page.evaluate(() => { const g = window.__game; return { block: g.routeBlock(), cls: g.cls.id }; });
    console.log('a cart path across the fairway', JSON.stringify(cp));
    check(cp.cls === 'cart-dirt' && cp.block === '', 'a cart path across the same fairway is allowed (unchanged)');
    await shot(page, `5-cart-path-across-fairway-${tag}`);
    await page.evaluate(() => window.__game.cancelRoute());
  }

  // ---- 5. an avenue on the land: the T124 message
  const av = await page.evaluate(([a, b]) => {
    const g = window.__game; g.cancelRoute(); g.setTool('road'); g.pickType('avenue'); g.emit();
    const land = g.golfLand()[0]; const y = land[1] + land[3] - 12; // a line near the course's south side, in the rough
    const legs = [{ a: { x: land[0] + 10, y }, b: { x: land[0] + 40, y } }];
    return { block: g.routeBlock(legs), start: g.routeBlock([]), cls: g.cls.id, land };
  }, [0, 0]);
  console.log('an avenue on the land', JSON.stringify(av));
  check(av.block === 'Course land: build cart paths and drives with Course › Paths & drives', 'an avenue on the land is refused with the T124 message');
  {
    const land = av.land, p0 = { x: land[0] + 10, y: land[1] + land[3] - 12 }, p1 = { x: land[0] + 40, y: p0.y };
    await camera([p0, p1]); px = await toPx([p0, p1]);
    await page.mouse.move(px[0].x, px[0].y, { steps: 4 }); await sleep(500);
    await shot(page, `6-avenue-refused-${tag}`);
    await page.mouse.click(px[0].x, px[0].y); await sleep(300);
    const t = await page.evaluate(() => ({ toast: window.__game.toasts.slice(-1)[0]?.text, route: window.__game.route.length }));
    check(t.route === 0 && /^Course land: build cart paths and drives/.test(t.toast ?? ''), `an avenue's first click on the land is refused ("${t.toast}")`);
    await page.evaluate(() => { const g = window.__game; g.cancelRoute(); g.pickType('street'); g.emit(); });
  }

  // ---- 6. what the per-frame verdict costs: routeBlock on a long diagonal route over the whole course, repeated
  const cost = await page.evaluate(() => {
    const g = window.__game, L = g.golfLand()[0], legs = [{ a: { x: L[0] - 20, y: L[1] - 20 }, b: { x: L[0] + L[2] + 20, y: L[1] + L[3] + 20 } }];
    g.setTool('road'); g.pickType('street');
    const time = f => { const t0 = performance.now(); let r; for (let i = 0; i < 400; i++) r = f(); return { ms: +((performance.now() - t0) / 400).toFixed(4), r }; };
    const a = time(() => g.routeInWay(legs)), b = time(() => g.routeBlock(legs));
    return { routeInWayMsPerCall: a.ms, routeBlockMsPerCall: b.ms, why: b.r };
  });
  console.log('cost of the verdict on a diagonal across the whole course', JSON.stringify(cost));
  writeFileSync(join(out, `report-${tag}.json`), JSON.stringify({ facts, plan: { ...plan, best: plan.best }, cost, bad }, null, 1));
  await ctx.close();
} finally { await browser.close(); }
console.log(bad ? `${bad} FAILED` : 'all ok');
process.exit(bad ? 1 : 0);

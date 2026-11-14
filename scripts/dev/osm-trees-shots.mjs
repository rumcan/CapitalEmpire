// #1273: a real course placed into a town game (Course > Place a real course), with its trees (golf/osm/trees.ts) or without (--trees 0), as the game draws it: a headless Chrome on a dev
// server (the shots' own port: never the owner's 5174/5175/5191/5270/5280). It places the course where it takes the fewest buildings, settles the ground, and shoots the whole land and
// the closest zoom over some holes; prints the trees the game planted (props by source) and the main-thread ms a frame over each view.
//   node scripts/dev/osm-trees-shots.mjs --base http://localhost:5391/ --out F:/ClaudeTemp/osm-courses/shots [--course magnolia-national] [--trees 1|0] [--holes 3,12] [--tag after]
//        [--new 1 (a new game on the course instead: ?osmcourse=)] [--desert 1] [--seed 7] [--w 1440 --h 900] [--list 1 (also shoot the course flyout's list)]
// Needs a dev server (vite) on --base. One headless Chrome, closed when done; saving is off (every non-GET request is answered with an empty 200).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5391/'), out = opt('out', 'F:/ClaudeTemp/osm-courses/shots'), course = opt('course', 'magnolia-national'), trees = opt('trees', '1') !== '0', tag = opt('tag', trees ? 'trees' : 'bare');
const holes = opt('holes', '').split(',').filter(Boolean).map(Number), newGame = opt('new', '0') === '1', desert = opt('desert', '0') === '1', seed = opt('seed', '7'), W = +opt('w', '1440'), H = +opt('h', '900');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
let bad = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
  const q = newGame ? `?osmcourse=${course}` : `?start=town&seed=${seed}&stamp=1`;
  await page.goto(`${base}${q}${trees ? '' : '&ctrees=0'}${desert ? '&desert=on' : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 400000 });
  const settle = async (ms = 900) => {
    await page.waitForTimeout(ms);
    await page.evaluate(() => { window.__calm = 0; });
    await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 30; }, null, { timeout: 240000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
    await page.waitForTimeout(600);
  };
  const shot = async name => { const f = join(out, `${course}-${tag}-${name}.png`); await page.screenshot({ path: f }); console.log('  ' + f); return f; };
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; g.closeWho?.('Jack Burns', 2); g.closeWelcome?.(false); const p = g.golf?.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; } g.emit(); });
  if (!newGame) {
    // the pose that takes the fewest buildings and may go (every 24 tiles over the valid range; turned on 15 degrees until one may)
    const placed = await page.evaluate(async ([id, at]) => {
      const g = window.__game; g.traffic.sandbox(1, true);
      if (!(await g.startRealPlace(id))) return { error: 'not in hand' };
      let best = null, t0 = performance.now();
      if (at) { g.real.at = { x: at[0], y: at[1] }; const p = g.real.plan(); if (p?.ok) best = { x: at[0], y: at[1], n: p.lots.keys.length + p.orphans.keys.length, total: p.total, deg: g.real.deg }; }
      for (let turn = 0; turn < 24 && !best; turn++) {
        const sp = g.real.turned(), map = 1024, step = 24;
        for (let x = Math.ceil(24 + sp.w / 2); x <= map - 24 - sp.w / 2; x += step) for (let y = Math.ceil(24 + sp.h / 2); y <= map - 24 - sp.h / 2; y += step) {
          g.real.at = { x, y };
          const p = g.real.plan(); if (!p?.ok) continue;
          const n = p.lots.keys.length + p.orphans.keys.length;
          if (!best || n < best.n || (n === best.n && p.total < best.total)) best = { x, y, n, total: p.total, deg: g.real.deg };
        }
        if (!best) g.real.turn(1);
      }
      if (!best) { g.real.cancel(); return { error: 'no pose' }; }
      g.real.deg = best.deg; g.real.at = { x: best.x, y: best.y }; g.real.click();
      const before = g.props.size, t1 = performance.now(), ok = g.real.confirm(), ms = Math.round(performance.now() - t1);
      return { ...best, ok, layMs: ms, search: Math.round(t1 - t0), propsBefore: before, propsAfter: g.props.size };
    }, [course, opt('at', '') ? opt('at', '').split(',').map(Number) : null]);
    console.log('placed', JSON.stringify(placed));
    if (placed.error || !placed.ok) throw new Error('not placed: ' + JSON.stringify(placed));
  }
  const info = await page.evaluate(() => {
    const g = window.__game, G = g.golf, plantTrees = [...g.props].filter(p => p.plant && window.__lib?.[p.item]?.kind !== undefined).length;
    return { osm: G.osm, course: G.course, tees: G.tees.length, pins: G.pins.length, props: g.props.size, plant: [...g.props].filter(p => p.plant).length, theme: g.desertTheme ? 'desert' : 'autumn' };
  });
  console.log('game', JSON.stringify(info));
  await settle(1500);
  const frames = await page.evaluate(() => new Promise(res => { const g = window.__game, v = []; g.onFrame = () => { v.push(g.perf.cpuMs); if (v.length >= 90) { g.onFrame = null; res({ avg: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2), max: +Math.max(...v).toFixed(2) }); } }; }));
  console.log('frames (overview)', JSON.stringify(frames));
  const pts = await page.evaluate(() => { const g = window.__game, G = g.golf, rs = G.courseRects?.length ? G.courseRects : [G.course], x0 = Math.min(...rs.map(r => r[0])), y0 = Math.min(...rs.map(r => r[1])), x1 = Math.max(...rs.map(r => r[0] + r[2])), y1 = Math.max(...rs.map(r => r[1] + r[3])); return { land: [x0, y0, x1 - x0, y1 - y0], tees: G.tees.filter(t => t.kind === 'back' || t.kind === 'middle').map(t => ({ h: t.hole, x: t.x, y: t.y })), pins: G.pins.map(p => ({ h: p.hole, x: p.x, y: p.y })) }; });
  /** the camera on the tile points, at the closest zoom that keeps them all on the screen (a margin round them) */
  const frameOn = (pp, maxZ = 0.3) => page.evaluate(([pp, maxZ, W, H]) => {
    const g = window.__game, cx = pp.reduce((s, p) => s + p.x, 0) / pp.length, cy = pp.reduce((s, p) => s + p.y, 0) / pp.length;
    const fits = z => { g.camEase = null; g.lookAt(cx, cy, z); return pp.every(p => { const s = g.screen(p.x, p.y), x = s.x / g.dpr, y = s.y / g.dpr; return x > 50 && x < W - 50 && y > 80 && y < H - 50; }); };
    let lo = 0.004, hi = maxZ; if (fits(hi)) { g.emit(); return hi; }
    for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
    fits(lo); g.emit(); return lo;
  }, [pp, maxZ, W, H]);
  const land = pts.land, corners = [{ x: land[0], y: land[1] }, { x: land[0] + land[2], y: land[1] }, { x: land[0], y: land[1] + land[3] }, { x: land[0] + land[2], y: land[1] + land[3] }];
  const zOver = await frameOn(corners, 0.3); console.log('  overview zoom', zOver.toFixed(4));
  await settle(1500); await shot('1-overview');
  for (const n of holes) {
    const t = pts.tees.find(p => p.h === n), pin = pts.pins.find(p => p.h === n);
    if (!t || !pin) { console.log(`  hole ${n}: no tee or pin`); continue; }
    // the hole with room round it: its tee, pin and the points either side
    const mx = (t.x + pin.x) / 2, my = (t.y + pin.y) / 2, L = Math.hypot(pin.x - t.x, pin.y - t.y) || 1, nx = -(pin.y - t.y) / L * 14, ny = (pin.x - t.x) / L * 14;
    const z = await frameOn([t, pin, { x: mx + nx, y: my + ny }, { x: mx - nx, y: my - ny }], 0.3); console.log(`  hole ${n} zoom`, z.toFixed(4));
    await settle(1200); await shot(`2-hole-${n}`);
  }
  if (bad) console.log(`${bad} page errors`);
} finally { await browser.close(); }
process.exit(bad ? 1 : 0);

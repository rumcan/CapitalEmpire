// #1298 (the owner's play-test, 2026-11-14, the normal game on the dev server, desert look): "I painted fescue over the practice and pittingarea and this is how it went. see screenshot where
// some box around the practice greens are not letting it paint there and I can[not] bulldoze or remove the old sand pit and dirt green"; and "the range texture painter is specifically there so you
// can also paint on the driving range and add bunkers and water etc etc but when i paint there it doesnt show above the fairway grass". The play-through that checks both, pixels and all, on a
// new bare range start (non-jam, the dev start with real money: ?money=0):
//   practice  the practice area is placed (a real click); its starter set (three dirt greens with flags and a crude bunker) stands; the Bulldoze tool takes the sand scrape and a dirt green
//             on its own (hover outline and words, free, one undo step), the Texture Painter's stroke over a dirt green takes it (the paint wins), a putting green built over the third replaces
//             it; the chipping green is built; then the Texture Painter, in the property's own look (fescue), sweeps the whole area: the ring just outside each facility's rough band is sampled
//             in the picture (it must be the painted fescue, as the field far from the greens is), the grid is painted wherever no green or sand lies, the facility's looks zone is its own cells;
//             the plant brush plants right up to the facilities; the proper greens are bulldozed for half their price (the hover's words, the refund, the undo)
//   range     the driving range's outfield: a bunker, a pond, waste and rough painted on it show on top of the bare desert (pixels against the picture before), still show once the outfield is
//             grassed (the tee turfed and the outfield grassed after the painting), more painted on the grassed outfield shows, all of it survives a save and a load; the golf practice view's
//             course holds them; the fixed pieces (the tee box, the mats, the target greens) stay on top of the paint
//   perf      a brush stroke over the practice area costs what it did: the stroke's main-thread time with the new steps on and with them off (the old code's path)
//   node scripts/dev/practice-paint-shots.mjs --base http://127.0.0.1:5483/ --out docs/jam-shots --prefix practice-paint- --look desert [--legacy] [--steps practice,range,perf] [--seed 1]
//   --legacy  switches the three fixes off in the page (the facility's looks zone as the box round its cells, the range's ground over the course, the starter pieces neither bulldozable nor covered
//             by paint): the owner's play-test as it went; the checks are then expected to fail and the exit code stays 0 (the pictures are the evidence)
// One headless Chrome on a scratch port of your own (vite --port <n> --strictPort, NEVER 5174/5175/5191/5270/5280), closed when done; a fresh profile, so the start is a new game.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; }, has = k => args.includes(`--${k}`);
const base = opt('base', 'http://127.0.0.1:5483/'), out = opt('out', 'output/practice-paint'), look = opt('look', 'desert'), seed = opt('seed', '1'), legacy = has('legacy');
const prefix = opt('prefix', legacy ? 'practice-paint-before-' : 'practice-paint-'), rprefix = opt('rprefix', legacy ? 'range-paint-before-' : 'range-paint-');
const steps = new Set(opt('steps', 'practice,range,perf').split(','));
const W = 1800, H = 1000;
mkdirSync(out, { recursive: true });
const t0 = Date.now(), lap = s => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed'), args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : legacy ? 'XFAIL' : 'FAIL'} ${what}`); if (!ok && !legacy) bad++; };

/** waits for the ground bakes (chunks, the range's patches) and the bunker bakes to finish */
const settle = async (page, ms = 700) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(500);
  await page.waitForFunction(() => { const b = window.__game.ground.bunkers, s = b.stats; return !s.suspended && s.ready >= b.states.size; }, null, { timeout: 40000, polling: 100 }).catch(() => console.log('  (bunker bake wait timed out)'));
  await page.waitForTimeout(400);
};
const shot = async (page, name, clip, pfx = prefix) => {
  const file = join(out, `${pfx}${name}.jpg`), png = await page.screenshot({ type: 'png', ...(clip ? { clip } : {}) });
  await sharp(png).jpeg({ quality: 84, mozjpeg: true }).toFile(file);
  console.log('  ' + file);
};
/** the viewport's pixels as raw RGB */
const grab = async page => { const { data, info } = await sharp(await page.screenshot({ type: 'png' })).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
/** the mean colour of the (2r+1)^2 pixels round (x, y) in a grab */
const meanAt = (px, x, y, r = 2) => {
  let R = 0, G = 0, B = 0, n = 0;
  for (let j = Math.round(y) - r; j <= Math.round(y) + r; j++) for (let i = Math.round(x) - r; i <= Math.round(x) + r; i++) { if (i < 0 || j < 0 || i >= px.w || j >= px.h) continue; const k = (j * px.w + i) * 3; R += px.data[k]; G += px.data[k + 1]; B += px.data[k + 2]; n++; }
  return n ? [R / n, G / n, B / n] : [0, 0, 0];
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mean = list => [0, 1, 2].map(c => list.reduce((s, v) => s + v[c], 0) / Math.max(1, list.length));
const lookAt = (page, p, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [p.x, p.y, z]);
/** css px of world tile p (the camera already there) */
const screenOf = (page, p) => page.evaluate(([x, y]) => { const g = window.__game, q = g.screen(x, y); return { x: q.x / g.dpr, y: q.y / g.dpr }; }, [p.x, p.y]);
const homePt = (page, u, v) => page.evaluate(([u, v]) => {
  const g = window.__game, [px, py] = g.golf.range.home, f = g.golf.dir, Wp = 70, D = 150;
  return f === 2 ? { x: px + u, y: py + v } : f === 0 ? { x: px + Wp - u, y: py + D - v } : f === 1 ? { x: px + v, y: py + Wp - u } : { x: px + D - v, y: py + u };
}, [u, v]);
/** a point of the placed range's frame (u along the road, v away from it) in world tiles */
const plotPt = (page, u, v) => page.evaluate(([u, v]) => {
  const g = window.__game, sc = g.range.scene, px = sc.box[0], py = sc.box[1], f = sc.facing, Wp = 70, D = 150;
  return f === 2 ? { x: px + u, y: py + v } : f === 0 ? { x: px + Wp - u, y: py + D - v } : f === 1 ? { x: px + v, y: py + Wp - u } : { x: px + D - v, y: py + u };
}, [u, v]);
const hover = async (page, p) => { const s = await screenOf(page, p); await page.mouse.move(s.x, s.y); await page.waitForTimeout(250); return s; };
/** a real stroke of the pointer from world point a to b: down, 24 moves, up */
const stroke = async (page, a, b) => {
  const s = await screenOf(page, a), e = await screenOf(page, b);
  // (a stroke must start on the map: whatever else is under the pointer, a bar, a panel, takes the press)
  const over = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}` : 'nothing'; }, [s.x, s.y]);
  if (!/^canvas/.test(over)) console.log(`  (a stroke at ${Math.round(s.x)},${Math.round(s.y)} starts over ${over}, not the map)`);
  await page.mouse.move(s.x, s.y); await page.mouse.down();
  for (let i = 1; i <= 24; i++) await page.mouse.move(s.x + (e.x - s.x) * i / 24, s.y + (e.y - s.y) * i / 24);
  await page.mouse.up(); await page.waitForTimeout(120);
};
const toast = page => page.evaluate(() => { const t = window.__game.toasts; return t.length ? t[t.length - 1].text : ''; });
/** whether one of the last few toasts reads like re (other notes, a facility closing, may follow the one asked for) */
const hasToast = (page, re) => page.evaluate(src => window.__game.toasts.slice(-5).some(t => new RegExp(src).test(t.text)), re.source);
const toasts = page => page.evaluate(() => window.__game.toasts.slice(-5).map(t => t.text).join(' | '));
/** the starter set as the page holds it */
const starterState = page => page.evaluate(() => {
  const g = window.__game, sc = g.range.scene, b = g.golf.range;
  return { gone: b.starter ? [...b.starter.gone] : null, flags: sc.pieces.filter(p => p.key.startsWith('starter-flag')).length, patches: sc.patches.filter(p => ['dirtGreen', 'scrape', 'sand'].includes(p.surf)).length, money: g.money,
    pieces: sc.starter.map(p => ({ id: p.id, kind: p.kind, c: p.centre, pts: p.pts, rim: p.rim })) };
});
/** the surface id of the course grid's cell under tile p */
const surfAt = (page, p) => page.evaluate(([x, y]) => { const g = window.__game, grid = g.courseGrid; return grid.surf[Math.floor((y - grid.y0) / 0.5) * grid.w + Math.floor((x - grid.x0) / 0.5)]; }, [p.x, p.y]);
/** the practice area's cells by surface id (the box, tiles) */
const areaCells = page => page.evaluate(() => {
  const g = window.__game, grid = g.courseGrid, box = g.range.scene.practice.box, cnt = {};
  const x0 = Math.floor((box[0] - grid.x0) / 0.5), y0 = Math.floor((box[1] - grid.y0) / 0.5), x1 = Math.ceil((box[2] - grid.x0) / 0.5), y1 = Math.ceil((box[3] - grid.y0) / 0.5);
  for (let cy = y0; cy < y1; cy++) for (let cx = x0; cx < x1; cx++) { const s = grid.surf[cy * grid.w + cx]; cnt[s] = (cnt[s] ?? 0) + 1; }
  return cnt;
});
/** the paint tool in hand: the Texture Painter, a brush kind, the round brush of radius r, the property's own look for the long grass (fescue) when asked */
const arm = (page, kind, r, tex) => page.evaluate(([kind, r, tex]) => { const g = window.__game; g.openPropertyPaint(kind); g.paint.setBrushCells(0); g.paint.setBrushR(r); if (tex) g.paint.setStyle({ tex }); }, [kind, r, tex ?? null]);

/** what the page does for --legacy: the old behaviour back, by switching the fixes off (the zone as the box of the facility's cells grown by 2.5 tiles with every cell of it, the range's
 *  ground drawn over the course, no starter piece bulldozable or covered by paint) */
const installLegacy = page => page.evaluate(() => {
  const g = window.__game, sl = g.setLotGround.bind(g);
  g.setLotGround = (key, patches) => sl(key, key === 'range:ground' && patches ? patches.map(p => { if (!p.paint || !p.paint.u) return p; const { u, ...rest } = p.paint; return { ...p, paint: rest }; }) : patches);
  g.facilityMask = f => {
    const b = g.facilityBox(f); if (!b) return null;
    const x0 = Math.floor(b[0] / 0.5) * 0.5, y0 = Math.floor(b[1] / 0.5) * 0.5, x1 = Math.ceil(b[2] / 0.5) * 0.5, y1 = Math.ceil(b[3] / 0.5) * 0.5;
    return { x0, y0, x1, y1, mask: new Uint8Array(Math.round((x1 - x0) / 0.5) * Math.round((y1 - y0) / 0.5)).fill(1) };
  };
  g.paint.host.paintedOver = undefined; g.practice.ctx.starterAt = undefined;
  g.range.sync(true); g.resendCourse();
});

try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }), page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) console.log('[console]', m.text().slice(0, 300)); });
  page.on('dialog', d => d.dismiss().catch(() => {}));
  // ---- a new bare range start: real money (?money=0), the look asked for
  const url = `${base}?start=range&seed=${seed}&desert=${look === 'desert' ? 'on' : 'off'}&money=0`;
  await page.goto(url, { timeout: 240000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.ready && window.__game.range?.bareGate, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; g.traffic.spend('construction', -600000); });
  await page.evaluate(() => { const g = window.__game, p = g.golf.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; } g.emit(); });
  check(await page.evaluate(() => window.__game.desertTheme) === (look === 'desert'), `the world's look is ${look}`);
  check(Number.isFinite(await page.evaluate(() => window.__game.money)), 'real money (not the sandbox\'s unlimited)');
  lap('ready');
  // the range, its car park and the practice area, each a real click on its ghost
  await page.evaluate(() => window.__game.placeRangePart('range'));
  await lookAt(page, await homePt(page, 35, 60), 0.08); await settle(page, 600);
  await hover(page, await homePt(page, 35, 12)); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(500);
  await page.evaluate(() => window.__game.placeRangePart('carpark'));
  await lookAt(page, await homePt(page, 59, -10), 0.2); await settle(page, 600);
  await hover(page, await homePt(page, 59, -10)); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(500);
  await page.evaluate(() => window.__game.placeRangePart('practice'));
  await lookAt(page, await homePt(page, 93, 19), 0.12); await settle(page, 600);
  await hover(page, await homePt(page, 93, 19)); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(700);
  const area = await page.evaluate(() => { const a = window.__game.range.scene.practice; return { box: a.box, label: a.label }; });
  check(!!(await page.evaluate(() => window.__game.golf.range.practiceAt)), `the practice area is placed ${JSON.stringify(area.box)}`);
  await page.evaluate(() => { window.__game.armPractice(null); window.__game.setTool('select'); window.__game.openRangeCard(false); });
  if (legacy) await installLegacy(page);
  const centre = { x: (area.box[0] + area.box[2]) / 2, y: (area.box[1] + area.box[3]) / 2 };
  let st = await starterState(page);
  check(st.pieces.length === 4 && st.gone.length === 0 && st.flags === 3, 'the starter set stands: three dirt greens with flags and the sand scrape');
  lap('setup done');

  if (steps.has('practice')) {
    // ---- the starter set, close up
    await lookAt(page, centre, 0.3); await settle(page, 900); await page.mouse.move(8, 8);
    await shot(page, `1-starter-set-${look}`, { x: 250, y: 100, width: 1300, height: 800 });
    const [d0, d1, d2] = st.pieces.filter(p => p.kind === 'dirt'), sand = st.pieces.find(p => p.kind === 'bunker');
    // ---- the Bulldoze tool on its own: the sand scrape, then a dirt green (hover outline and words, free, one undo step)
    const bulldoze = async (piece, name) => {
      await page.evaluate(() => window.__game.setTool('bulldoze'));
      const ps = await screenOf(page, piece.c); await page.mouse.move(ps.x - 3, ps.y - 3); await page.mouse.move(ps.x, ps.y); await page.waitForTimeout(500);
      const h = await page.evaluate(() => { const p = window.__game.pracHover; return p ? { f: p.f ? p.f.name : null, s: p.s ? p.s.name : null } : null; });
      check(h?.s === name, `Bulldoze over the ${name}: the hover says so ${JSON.stringify(h)}`);
      if (name === 'sand scrape') { const s = await screenOf(page, piece.c); await shot(page, `2-bulldoze-hover-${look}`, { x: Math.max(0, s.x - 420), y: Math.max(0, s.y - 280), width: 840, height: 560 }); }
      const m0 = (await starterState(page)).money, before = await starterState(page);
      await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(500);
      const after = await starterState(page);
      check(after.gone.includes(piece.id) && after.gone.length === before.gone.length + 1, `a click removes the ${name}: gone ${JSON.stringify(after.gone)}`);
      check(after.money === m0, `free: the money is ${after.money}`);
      check(await hasToast(page, /^Removed the/), `the toast: ${await toasts(page)}`);
      check(after.patches < before.patches && (piece.kind !== 'dirt' || after.flags === before.flags - 1), `its ground paint${piece.kind === 'dirt' ? ' and its flag' : ''} left the scene (${before.patches} to ${after.patches} patches)`);
      return { before, after };
    };
    let r = await bulldoze(sand, 'sand scrape');
    await settle(page, 900); await page.mouse.move(8, 8);
    await page.evaluate(() => window.__game.paint.undo()); await page.waitForTimeout(400);
    check((await starterState(page)).gone.length === 0, 'Ctrl+Z brings the sand scrape back');
    await page.evaluate(() => window.__game.paint.redo()); await page.waitForTimeout(400);
    check((await starterState(page)).gone.join() === String(sand.id), 'and Ctrl+Y takes it away again');
    r = await bulldoze(d0, 'dirt green');
    await settle(page, 900); await page.mouse.move(8, 8);
    await shot(page, `3-bulldozed-two-${look}`, { x: 250, y: 100, width: 1300, height: 800 });
    await page.evaluate(() => window.__game.setTool('select'));

    // ---- painted over: the Texture Painter's stroke over a dirt green takes it (the paint wins), and shows over it
    await arm(page, 'longGrass', 3, 'golfFescue');
    const pre = await grab(page), pc = await screenOf(page, { x: d1.c.x + 1.2, y: d1.c.y + 0.5 }), before1 = meanAt(pre, pc.x, pc.y);   // (off the flag's pole)
    await stroke(page, { x: d1.c.x - 3.2, y: d1.c.y }, { x: d1.c.x + 3.2, y: d1.c.y });
    await page.evaluate(() => window.__game.setTool('select')); await page.mouse.move(8, 8);
    await settle(page, 1200);
    const painted = await starterState(page), post = await grab(page), after1 = meanAt(post, pc.x, pc.y);
    check(legacy ? true : painted.gone.includes(d1.id), `painted over, the second dirt green is gone ${JSON.stringify(painted.gone)}`);
    check(dist(before1, after1) > 30, `and the picture over it changed: ${before1.map(Math.round)} to ${after1.map(Math.round)}`);
    await shot(page, `4-painted-over-${look}`, { x: 250, y: 100, width: 1300, height: 800 });
    await page.evaluate(() => window.__game.paint.undo()); await page.waitForTimeout(500);
    check(!(await starterState(page)).gone.includes(d1.id), 'Ctrl+Z puts the dirt green back with the cells it was painted over with taken away');
    await page.evaluate(() => window.__game.paint.redo()); await page.waitForTimeout(500);
    check(legacy ? true : (await starterState(page)).gone.includes(d1.id), 'and Ctrl+Y paints it over again');

    // ---- built over: the putting green, its ghost on the third dirt green (moved toward the area's middle while the ghost is refused for the edge), a real click
    await page.evaluate(() => { window.__game.armPractice('putting'); });
    let built = false;
    for (let k = 0; k <= 6 && !built; k++) {
      const q = { x: d2.c.x + (centre.x - d2.c.x) * k / 6, y: d2.c.y + (centre.y - d2.c.y) * k / 6 };
      await hover(page, q);
      const gh = await page.evaluate(() => { const p = window.__game.practice.ghost; return p ? { why: p.why, cells: p.cells.green.length } : null; });
      if (!gh || gh.why) continue;
      const cover = await page.evaluate(([id, qx, qy]) => { const g = window.__game, pc = g.range.scene.starter.find(p => p.id === id), gh = g.practice.ghost, grid = g.courseGrid; const inside = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) { const ax = pts[j], ay = pts[j + 1], bx = pts[i], by = pts[i + 1]; if ((by > y) !== (ay > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) c = !c; } return c; }; for (const k of [...gh.cells.green, ...gh.cells.rough]) { const cx = k % grid.w, cy = (k - cx) / grid.w; if (inside(pc.pts, grid.x0 + (cx + 0.5) * 0.5, grid.y0 + (cy + 0.5) * 0.5)) return true; } return false; }, [d2.id, q.x, q.y]);
      if (!cover) continue;
      const m0 = await page.evaluate(() => window.__game.money);
      await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(700);
      built = await page.evaluate(() => window.__game.range.practice?.putting.state === 'open');
      st = await starterState(page);
      check(built && st.gone.includes(d2.id), `the putting green built over the third dirt green opens and replaces it ${JSON.stringify(st.gone)} (-$${Math.round(m0 - st.money)})`);
    }
    if (!built) { check(false, 'no spot for the putting green over the third dirt green'); await page.evaluate(() => window.__game.quickPractice('putting')); }
    await page.evaluate(() => window.__game.armPractice(null));
    await page.evaluate(() => window.__game.setTool('select'));
    const qc = await page.evaluate(() => window.__game.quickPractice('chipping')); check(qc === null, `the chipping green and bunker are built (${qc ?? 'ok'})`);
    await settle(page, 1200);
    const fac = await page.evaluate(() => { const g = window.__game, p = g.range.practice, f = k => { const q = p?.[k]; return q?.centre ? { state: q.state, centre: q.centre, cells: g.practice.facilityAt(q.centre.x, q.centre.y)?.cells ?? [] } : null; }; return { putting: f('putting'), chipping: f('chipping') }; });
    check(fac.putting?.state === 'open' && fac.chipping?.state === 'open', `both facilities are open (${fac.putting?.cells.length} and ${fac.chipping?.cells.length} cells with their rough bands)`);
    // the camera for the sweep: the whole area on screen, clear of the guide panel
    await lookAt(page, centre, 0.2); await settle(page, 1000); await page.mouse.move(8, 8);
    const picBefore = await grab(page);
    await shot(page, `5-before-the-sweep-${look}`, { x: 300, y: 120, width: 1200, height: 760 });

    // ---- the sweep: the Texture Painter in the property's own look (fescue), the round brush, rows of real strokes over the whole area
    await arm(page, 'longGrass', 6, 'golfFescue');
    const scan = () => page.evaluate(() => { const p = window.__game.range.practice; return ['putting', 'chipping'].map(k => ({ id: k, state: p[k].state, m2: p[k].m2, cups: p[k].cups.length, stands: p[k].stands.length })); });
    const scan0 = await scan();
    const m0 = await page.evaluate(() => window.__game.money);
    const rows = []; for (let y = area.box[1] + 1.5; y < area.box[3]; y += 5) rows.push(y);
    for (const y of rows) await stroke(page, { x: area.box[0] + 0.5, y }, { x: area.box[2] - 0.5, y });
    await page.evaluate(() => window.__game.setTool('select')); await page.mouse.move(8, 8);
    await settle(page, 1800);
    const cost = Math.round(m0 - await page.evaluate(() => window.__game.money));
    const cnt = await areaCells(page);
    { await page.waitForTimeout(600); const scan1 = await scan(); console.log('  the practice scan before', JSON.stringify(scan0), 'after', JSON.stringify(scan1));
      check(scan1.every((q, i) => q.state === scan0[i].state && q.m2 === scan0[i].m2 && q.cups === scan0[i].cups && q.stands >= scan0[i].stands), 'the facilities read as before once painted round: their state, size, cups and standing places (so the golfers and the takings are the same)'); }
    console.log('  cells in the area by surface', JSON.stringify(cnt), `cost $${cost}`);
    check((cnt[0] ?? 0) === 0, `the whole area is painted but the greens and sand: ${cnt[0] ?? 0} cells left bare (laid: long grass ${cnt[9] ?? 0}, green ${cnt[8] ?? 0}, sand ${cnt[6] ?? 0}, rough ${cnt[1] ?? 0})`);
    await shot(page, `6-after-the-sweep-${look}`, { x: 300, y: 120, width: 1200, height: 760 });
    // the facility's looks zone: its own cells (a mask), never a box round them
    const zones = await page.evaluate(() => { const z = window.__game.courseLooks().own?.zones ?? []; return z.map(q => ({ box: [q.x0, q.y0, q.x1, q.y1], ones: q.mask.reduce((a, v) => a + v, 0), all: q.mask.length })); });
    console.log('  zones', JSON.stringify(zones));
    const own = zones.reduce((a, z) => a + z.ones, 0);
    check(legacy ? true : own === (cnt[8] ?? 0) + (cnt[6] ?? 0), `the facilities' looks zones are their own cells (the green and the sand, the band being painted over), not the boxes round them: ${zones.map(z => `${z.ones} of ${z.all} in the bounds`).join(', ') || 'none'}; ${cnt[8] ?? 0} green and ${cnt[6] ?? 0} sand cells`);
    // the ring just outside each facility's rough band, and a control far from both: cells, then pixels
    const ring = await page.evaluate(([put, chip]) => {
      const g = window.__game, grid = g.courseGrid, box = g.range.scene.practice.box, Wd = grid.w;
      const x0 = Math.floor((box[0] - grid.x0) / 0.5), y0 = Math.floor((box[1] - grid.y0) / 0.5), x1 = Math.ceil((box[2] - grid.x0) / 0.5), y1 = Math.ceil((box[3] - grid.y0) / 0.5);
      const sets = [new Set(put), new Set(chip)], dist = sets.map(() => new Map()), out = { ring: [[], []], far: [] };
      // distance (cells, 8 neighbours) from each facility's cells, out to 16
      sets.forEach((s, k) => { let cur = [...s]; for (const i of cur) dist[k].set(i, 0); for (let d = 1; d <= 16 && cur.length; d++) { const next = []; for (const i of cur) { const cx = i % Wd, cy = (i - cx) / Wd; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = cx + dx, ny = cy + dy; if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue; const j = ny * Wd + nx; if (!dist[k].has(j)) { dist[k].set(j, d); next.push(j); } } } cur = next; } });
      const pt = i => { const cx = i % Wd, cy = (i - cx) / Wd; return { x: grid.x0 + (cx + 0.5) * 0.5, y: grid.y0 + (cy + 0.5) * 0.5 }; };
      for (let cy = y0; cy < y1; cy++) for (let cx = x0; cx < x1; cx++) {
        const i = cy * Wd + cx; if (sets[0].has(i) || sets[1].has(i)) continue;
        const d0 = dist[0].get(i) ?? 99, d1 = dist[1].get(i) ?? 99, m = Math.min(d0, d1);
        if (m >= 2 && m <= 4) out.ring[d0 <= d1 ? 0 : 1].push(i); else if (m > 14 && (cx + cy) % 7 === 0) out.far.push(i);
      }
      const sub = (list, n) => { const st = Math.max(1, Math.floor(list.length / n)); return list.filter((_, k) => k % st === 0).slice(0, n); };
      return { ring: out.ring.map(l => sub(l, 60).map(pt)), far: sub(out.far, 40).map(pt), counts: out.ring.map(l => l.length) };
    }, [fac.putting.cells, fac.chipping.cells]);
    const picAfter = await grab(page);
    const sp = async list => { const o = []; for (const p of list) { const s = await screenOf(page, p); if (s.x > 60 && s.x < W - 60 && s.y > 60 && s.y < H - 60) o.push(s); } return o; };
    const farPts = await sp(ring.far), farCols = farPts.map(s => meanAt(picAfter, s.x, s.y)), ctrl = mean(farCols), sd = Math.sqrt(farCols.reduce((a, c) => a + dist(c, ctrl) ** 2, 0) / Math.max(1, farCols.length));
    console.log(`  control: ${farCols.length} points, mean ${ctrl.map(Math.round)}, spread ${sd.toFixed(1)}`);
    const green = c => c[1] - c[0];   // (the fescue is golden: red over green; the facilities' own long grass look is a dark green)
    for (const [k, name] of [[0, 'putting'], [1, 'chipping']]) {
      const pts = await sp(ring.ring[k]), cols = pts.map(s => meanAt(picAfter, s.x, s.y)), rm = mean(cols);
      const dGreen = mean(cols.map(green).map(v => [v, 0, 0]))[0] - green(ctrl), dMean = dist(rm, ctrl), se = sd / Math.sqrt(Math.max(1, cols.length));
      console.log(`  ${name}: ${pts.length} ring points, mean ${rm.map(Math.round)} against the field's ${ctrl.map(Math.round)}: ${dMean.toFixed(1)} apart (the spread's error ${se.toFixed(1)}), greener by ${dGreen.toFixed(1)}`);
      check(pts.length >= 25 && dMean <= Math.max(30, 3 * se) && Math.abs(dGreen) <= 22, `the ring round the ${name} green's rough band is the painted fescue like the field far from it: ${dMean.toFixed(1)} apart, greener by ${dGreen.toFixed(1)}`);
    }
    // the plant brush plants right up to the facilities (no box round them keeps it off): bushes over the area, then how close the nearest planted prop lies to each facility's cells
    const plantInfo = await page.evaluate(([put, chip]) => {
      const g = window.__game, grid = g.courseGrid, box = g.range.scene.practice.box, Wd = grid.w;
      for (let y = box[1] + 2; y < box[3]; y += 3) for (let x = box[0] + 2; x < box[2]; x += 3) g.plantProps(g.plantPool('bushes').map(q => q.id), x, y, 3, 1.5, [0.9, 1.1], Math.floor(x * 31 + y * 17));
      const sets = [put, chip].map(l => l.map(i => { const cx = i % Wd, cy = (i - cx) / Wd; return { x: grid.x0 + (cx + 0.5) * 0.5, y: grid.y0 + (cy + 0.5) * 0.5 }; }));
      const plants = [...g.props].filter(p => p.plant && p.x > box[0] && p.x < box[2] && p.y > box[1] && p.y < box[3]);
      // the plants in the ring just outside each facility's cells (1 to 3 tiles from the nearest of them)
      const ringN = sets.map(cells => { let n = 0; for (const p of plants) { let best = Infinity; for (const c of cells) { const d = Math.hypot(p.x - c.x, p.y - c.y); if (d < best) best = d; } if (best >= 1 && best <= 3) n++; } return n; });
      return { n: plants.length, ringN };
    }, [fac.putting.cells, fac.chipping.cells]);
    console.log('  plants', JSON.stringify(plantInfo));
    check(plantInfo.n > 80 && plantInfo.ringN.every(n => n >= 4), `the plant brush plants right up to the facilities: ${plantInfo.n} plants, ${plantInfo.ringN.join(' and ')} of them in the ring 1 to 3 tiles outside the putting and the chipping green's cells`);
    await page.evaluate(() => { const g = window.__game; for (const p of [...g.props]) if (p.plant) g.removeProp(p); });

    // ---- the proper greens: Bulldoze says what it takes and gives back (half the price), takes the green whole, and the step comes back with Ctrl+Z
    await page.evaluate(() => window.__game.setTool('bulldoze'));
    const gp = fac.putting.centre, gm = await page.evaluate(() => window.__game.money);
    await hover(page, gp);
    const hh = await page.evaluate(() => { const p = window.__game.pracHover; return p?.f ? { name: p.f.name, refund: p.f.refund, n: p.f.cells.length } : null; });
    check(!!hh && hh.refund > 0 && /green/.test(hh.name), `Bulldoze over the putting green says what a click removes and gives back: ${JSON.stringify(hh)}`);
    await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(600);
    const gm2 = await page.evaluate(() => window.__game.money), sPut = await page.evaluate(() => window.__game.range.practice?.putting.state);
    check(Math.round(gm2 - gm) === hh?.refund && sPut !== 'open', `removed for half its price back: +$${Math.round(gm2 - gm)} (the hover said $${hh?.refund}), the putting green is ${sPut}`);
    check(await hasToast(page, /^Removed the/), `the toast: ${await toasts(page)}`);
    await page.evaluate(() => window.__game.paint.undo()); await page.waitForTimeout(500);
    check(Math.round(await page.evaluate(() => window.__game.money) - gm) === 0 && (await page.evaluate(() => window.__game.range.practice?.putting.state)) === 'open', 'Ctrl+Z gives it back, and the money');
    await page.evaluate(() => window.__game.setTool('select'));
    // the golf practice view still finds the chipping green (Chip and putt)
    const why = await page.evaluate(() => window.__game.practice3pWhy('short'));
    check(why === null, `Chip and putt can still open: ${why}`);
    if (why === null) {
      await page.evaluate(() => window.__game.openPractice3p('short')); await page.waitForTimeout(11000);
      const open = await page.evaluate(() => ({ hole: window.__game.view3pHole, place: window.__game.practice3pPlace }));
      check(open.hole === 2 && open.place === 'short', `the view is open on the chipping green: ${JSON.stringify(open)}`);
      await shot(page, `7-chip-and-putt-view-${look}`);
      await page.evaluate(() => window.__game.close3p()); await page.waitForTimeout(800);
    }
    lap('practice done');
  }

  if (steps.has('range')) {
    // ---- the driving range's outfield: paint on it, bare, then grassed
    const sc = await page.evaluate(() => { const s = window.__game.range.scene; return { box: s.box, facing: s.facing, junk: s.junk?.length ?? 0 }; });
    const spots = { bunker: [18, 76], pond: [44, 92], waste: [30, 112], rough: [12, 96], bunker2: [48, 72], pond2: [18, 120], fescue: [52, 98], green: [50, 118] };
    const P = {}; for (const [k, [u, v]] of Object.entries(spots)) P[k] = await plotPt(page, u, v);
    // (the camera fits the spots into the part of the screen clear of the bars: the guide's panel on the right, the buttons along the bottom, the top bar)
    const mid = { x: Object.values(P).reduce((a, p) => a + p.x, 0) / 8, y: Object.values(P).reduce((a, p) => a + p.y, 0) / 8 };
    const focus = async z => {
      await lookAt(page, mid, z);
      await page.evaluate(([W, H, spots]) => { const g = window.__game, pts = spots.map(p => g.screen(p.x, p.y)); const x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x)), y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y)); g.cam.X += ((x0 + x1) / 2 - (W - 260) / 2) / (g.cam.z * g.dpr); g.cam.Y += ((y0 + y1) / 2 - (H - 40) / 2) / (g.cam.z * g.dpr); g.emit(); }, [W, H, Object.values(P)]);
      await settle(page, 900); await page.mouse.move(8, 8);
    };
    await focus(0.18);
    const onScreen = [];
    for (const k of Object.keys(P)) { const s = await screenOf(page, P[k]); onScreen.push(s.x > 150 && s.x < W - 500 && s.y > 150 && s.y < H - 160); }
    check(onScreen.every(Boolean), 'the spots are on screen at 18%, clear of the bars');
    const kinds = { bunker: ['bunker', 3.5], pond: ['water', 5], waste: ['waste', 4], rough: ['rough', 3.5] };
    const sample = async (pic, names) => { const o = {}; for (const k of names) { const s = await screenOf(page, P[k]); o[k] = meanAt(pic, s.x, s.y, 3); } return o; };
    const pic0 = await grab(page);
    await shot(page, `1-outfield-bare-${look}`, { x: 200, y: 100, width: 1400, height: 820 }, rprefix);
    const base0 = await sample(pic0, ['bunker', 'pond', 'waste', 'rough']);
    for (const k of ['bunker', 'pond', 'waste', 'rough']) {
      const [kind, r] = kinds[k]; await arm(page, kind, r);
      const m1 = await page.evaluate(() => window.__game.money);
      await stroke(page, { x: P[k].x - 1.5, y: P[k].y }, { x: P[k].x + 1.5, y: P[k].y });
      check((await page.evaluate(() => window.__game.money)) < m1, `${k} painted on the outfield (${Math.round(m1 - await page.evaluate(() => window.__game.money))} dollars)`);
    }
    await page.evaluate(() => window.__game.setTool('select')); await page.mouse.move(8, 8);
    await settle(page, 2200);
    const pic1 = await grab(page), now1 = await sample(pic1, ['bunker', 'pond', 'waste', 'rough']);
    await shot(page, `2-painted-on-the-bare-outfield-${look}`, { x: 200, y: 100, width: 1400, height: 820 }, rprefix);
    // (the waste is the desert's own sand: on the bare desert outfield it cannot tell; it is checked on the grass below)
    for (const k of ['bunker', 'pond', 'rough']) check(dist(base0[k], now1[k]) > 45, `${k} shows on the bare outfield: ${base0[k].map(Math.round)} before, ${now1[k].map(Math.round)} after`);
    const pond1 = now1.pond; check(pond1[2] >= pond1[0] - 10 || pond1[0] < 120, `the pond reads as water (${pond1.map(Math.round)})`);
    // the range's fixed pieces stay on top of the paint: paint a bunker across the mats' strip and a target-green-less spot of the tee box
    // ---- the tee turfed and the outfield grassed after the painting: the paint must not go
    const bought = await page.evaluate(() => { const g = window.__game; const a = g.range.buy('teeturf'), b = g.range.buy('grass'); return [a, b]; });
    check(bought[0] && bought[1], `the tee is turfed and the outfield grassed (${bought})`);
    await settle(page, 2600);
    const pic2 = await grab(page), now2 = await sample(pic2, ['bunker', 'pond', 'waste', 'rough']);
    await shot(page, `3-outfield-grassed-after-${look}`, { x: 200, y: 100, width: 1400, height: 820 }, rprefix);
    for (const k of ['bunker', 'pond', 'waste', 'rough']) check(dist(now1[k], now2[k]) < 40, `${k} survives the grassing of the outfield: ${now1[k].map(Math.round)} then ${now2[k].map(Math.round)}`);
    // (the grass round the waste is what it differs from now: its centre is the sand of the desert still, against the grass at its side)
    { const ws = await screenOf(page, P.waste), side = await screenOf(page, { x: P.waste.x + 8, y: P.waste.y - 8 }); check(dist(meanAt(pic2, ws.x, ws.y, 3), meanAt(pic2, side.x, side.y, 3)) > 45, `the waste shows on the grassed outfield against the grass beside it: ${meanAt(pic2, ws.x, ws.y, 3).map(Math.round)} against ${meanAt(pic2, side.x, side.y, 3).map(Math.round)}`); }
    const bare = await plotPt(page, 40, 60), bs = await screenOf(page, bare);
    check(dist(meanAt(pic1, bs.x, bs.y, 3), meanAt(pic2, bs.x, bs.y, 3)) > 40, 'while the unpainted outfield itself did change (it is grass now)');
    // ---- more on the grassed outfield
    for (const k of ['bunker2', 'pond2', 'fescue', 'green']) {
      const [kind, r] = { bunker2: ['bunker', 3.5], pond2: ['water', 5], fescue: ['longGrass', 4], green: ['green', 3.5] }[k]; await arm(page, kind, r);
      await stroke(page, { x: P[k].x - 1.5, y: P[k].y }, { x: P[k].x + 1.5, y: P[k].y });
      check((await surfAt(page, P[k])) === { bunker2: 6, pond2: 3, fescue: 9, green: 8 }[k], `${k} laid its cells on the grassed outfield (surface ${await surfAt(page, P[k])})`);
    }
    await page.evaluate(() => window.__game.setTool('select')); await page.mouse.move(8, 8);
    await settle(page, 2200);
    const pic3 = await grab(page), now3 = await sample(pic3, Object.keys(spots));
    const under = await sample(pic2, ['bunker2', 'pond2', 'fescue', 'green']);
    for (const k of ['bunker2', 'pond2', 'fescue', 'green']) check(dist(under[k], now3[k]) > (k === 'green' ? 25 : 45), `${k} shows on the grassed outfield: ${under[k].map(Math.round)} before, ${now3[k].map(Math.round)} after`);
    await shot(page, `4-painted-on-the-grassed-outfield-${look}`, { x: 200, y: 100, width: 1400, height: 820 }, rprefix);
    // the range's fixed pieces stay on top of what is painted over them, by their own outline: a pond across the first target green (the greens bought now)
    const tg = await page.evaluate(() => { const g = window.__game; g.range.buy('greens'); const t = g.range.scene.targets[0]; return t ? { x: t.x, y: t.y, r: t.r } : null; });
    check(!!tg, `a target green stands (${JSON.stringify(tg)})`);
    if (tg) {
      await settle(page, 1800); await lookAt(page, tg, 0.3); await settle(page, 1200); await page.mouse.move(8, 8);
      const pa = await grab(page), gs = await screenOf(page, tg), os = await screenOf(page, { x: tg.x + 10, y: tg.y }), gBefore = meanAt(pa, gs.x, gs.y, 4), oBefore = meanAt(pa, os.x, os.y, 4);
      await arm(page, 'water', 6); await stroke(page, { x: tg.x - 3, y: tg.y + 1 }, { x: tg.x + 9, y: tg.y + 1 });
      await page.evaluate(() => window.__game.setTool('select')); await page.mouse.move(8, 8); await settle(page, 2000);
      const pb = await grab(page), gAfter = meanAt(pb, gs.x, gs.y, 4), oAfter = meanAt(pb, os.x, os.y, 4);
      check(dist(gBefore, gAfter) < 25, `the target green stays on top of the pond painted over it: ${gBefore.map(Math.round)} then ${gAfter.map(Math.round)}`);
      check(dist(oBefore, oAfter) > 45, `while the pond shows round it: ${oBefore.map(Math.round)} then ${oAfter.map(Math.round)}`);
      await shot(page, `5-target-green-stays-on-top-${look}`, { x: 300, y: 150, width: 1200, height: 700 }, rprefix);
    }
    // a close look at a bunker's lip and a pond's bank against the range's grass, with your character standing in the sand (a person is a sprite over the ground: the paint is under him)
    await page.evaluate(([x, y]) => { const g = window.__game; if (g.you) { g.you.x = x; g.you.y = y; g.you.moving = false; g.you.path.length = 0; g.emit(); } }, [P.bunker2.x + 0.6, P.bunker2.y + 0.3]);
    await lookAt(page, P.bunker2, 0.5); await settle(page, 1200); await page.mouse.move(8, 8); await shot(page, `6-bunker-lip-closeup-${look}`, { x: 300, y: 150, width: 1200, height: 700 }, rprefix);
    await lookAt(page, P.pond2, 0.5); await settle(page, 1200); await page.mouse.move(8, 8); await shot(page, `7-pond-bank-closeup-${look}`, { x: 300, y: 150, width: 1200, height: 700 }, rprefix);
    // the grid holds them: cells of each surface on the outfield
    const grid1 = await page.evaluate(() => { const g = window.__game, grid = g.courseGrid, cnt = {}; for (let i = 0; i < grid.surf.length; i++) cnt[grid.surf[i]] = (cnt[grid.surf[i]] ?? 0) + 1; return cnt; });
    // ---- save, load, and the same again
    await focus(0.18);
    const picS = await grab(page), nowS = await sample(picS, Object.keys(spots));
    await page.evaluate(() => window.__game.save()); await page.waitForTimeout(1500);
    await page.reload({ timeout: 240000, waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game?.ready && window.__game.range?.scene, null, { timeout: 240000 });
    await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; });
    if (legacy) await installLegacy(page);
    const grid2 = await page.evaluate(() => { const g = window.__game, grid = g.courseGrid, cnt = {}; for (let i = 0; i < grid.surf.length; i++) cnt[grid.surf[i]] = (cnt[grid.surf[i]] ?? 0) + 1; return cnt; });
    check(JSON.stringify(grid1) === JSON.stringify(grid2), `the saved game loads the same cells (${JSON.stringify(grid2)})`);
    await focus(0.18); await settle(page, 2200);
    const picL = await grab(page), nowL = await sample(picL, Object.keys(spots));
    await shot(page, `8-after-save-and-load-${look}`, { x: 200, y: 100, width: 1400, height: 820 }, rprefix);
    for (const k of Object.keys(nowS)) check(dist(nowS[k], nowL[k]) < 40, `${k} after a save and a load: ${nowS[k].map(Math.round)} then ${nowL[k].map(Math.round)}`);
    // ---- the district tier (far out) lays the same order: the pond still reads as water at 8%
    await focus(0.08); await settle(page, 1800);
    { const pf = await grab(page), ps = await screenOf(page, P.pond), c = meanAt(pf, ps.x, ps.y, 3); check(c[2] - c[0] > 25, `at 8% the painted pond still reads as water over the grassed outfield: ${c.map(Math.round)}`); await shot(page, `8b-far-out-8pct-${look}`, { x: 200, y: 100, width: 1400, height: 820 }, rprefix); }
    // ---- the golf practice view's course holds them
    const view = await page.evaluate(() => { const g = window.__game, why = g.practice3pWhy('range'); if (why) return { why }; const c = g.practiceCourse3p(); const s = c.input.areas.map(a => a.surface); return { why: null, surfaces: s, lies: ['bunker', 'water'].map(k => 0) }; });
    check(view.why === null && view.surfaces.includes('bunker') && view.surfaces.includes('water') && view.surfaces.includes('waste'), `the practice view's course holds what was painted on the outfield: ${view.why ?? view.surfaces.join(',')}`);
    if (view.why === null) {
      await page.evaluate(() => window.__game.openPractice3p('range')); await page.waitForTimeout(12000);
      const open = await page.evaluate(() => ({ hole: window.__game.view3pHole, place: window.__game.practice3pPlace }));
      check(open.hole === 1 && open.place === 'range', `the view is open on the range's mats: ${JSON.stringify(open)}`);
      await shot(page, `9-practice-view-${look}`, undefined, rprefix);
      await page.evaluate(() => window.__game.close3p()); await page.waitForTimeout(800);
    }
    lap('range done');
  }

  if (steps.has('perf')) {
    // ---- a brush stroke over the practice area: what the engine spends on it on the main thread (its pointer handlers, the looks it works out for each chunk job, the course send, and this ticket's
    //      starter step), by a real mouse sweep, with this ticket's steps on and with them off (the old code's path: the facility's looks zone as the box, no starter step)
    const box = area.box;
    await page.evaluate(() => {
      const g = window.__game; if (g.__t) return; g.__t = { h: 0, looks: 0, flush: 0, over: 0, masks: 0 };
      const wrap = (obj, name, key) => { const o = obj[name].bind(obj); obj[name] = (...a) => { const t = performance.now(); try { return o(...a); } finally { g.__t[key] += performance.now() - t; } }; };
      for (const m of ['pointerDown', 'pointerMove', 'pointerUp']) wrap(g, m, 'h');
      wrap(g, 'courseLooks', 'looks'); wrap(g, 'flushCourse', 'flush'); wrap(g, 'facilityMask', 'masks');
      const ph = g.paint.host, po = ph.paintedOver; if (po) { ph.paintedOver = d => { const t = performance.now(); try { return po(d); } finally { g.__t.over += performance.now() - t; } }; window.__perfPO = ph.paintedOver; }
      window.__perfMask = g.facilityMask;
    });
    await page.evaluate(() => { window.__game.setTool('select'); });
    // the facilities built (when the practice step has not) and the area unpainted: a sweep over painted ground changes no cell and costs nothing worth timing
    for (const k of ['putting', 'chipping']) if ((await page.evaluate(k => window.__game.range.practice?.[k].state, k)) !== 'open') await page.evaluate(k => window.__game.quickPractice(k), k);
    await settle(page, 1200);
    const bare = (await areaCells(page))[0] ?? 0;
    check(bare > 1500, `the practice area is unpainted for the stroke timing (${bare} bare cells): run --steps perf by itself`);
    await lookAt(page, centre, 0.2); await settle(page, 1000);
    // the property's own look (fescue): the facilities' zones are live
    await arm(page, 'longGrass', 6, 'golfFescue'); await page.evaluate(() => window.__game.setTool('select')); await settle(page, 800);
    const sweep = async label => {
      await arm(page, 'longGrass', 6);
      await page.evaluate(() => { const t = window.__game.__t; for (const k of Object.keys(t)) t[k] = 0; });
      const rows = []; for (let y = box[1] + 1.5; y < box[3]; y += 5) rows.push(y);
      for (const y of rows) await stroke(page, { x: box[0] + 0.5, y }, { x: box[2] - 0.5, y });
      const t = await page.evaluate(() => ({ ...window.__game.__t }));
      await page.evaluate(() => window.__game.setTool('select')); await page.waitForTimeout(1200);
      for (let i = 0; i < rows.length; i++) await page.evaluate(() => window.__game.paint.undo());
      await settle(page, 900);
      const total = t.h + t.looks + t.flush;
      console.log(`  ${label}: ${rows.length} strokes: pointer handlers ${t.h.toFixed(1)} ms, looks for the chunk jobs ${t.looks.toFixed(1)} ms (the facility zones ${t.masks.toFixed(1)}), course sends ${t.flush.toFixed(1)} ms, the starter step ${t.over.toFixed(2)} ms: ${total.toFixed(1)} ms in all`);
      return total;
    };
    const best = async label => { const a = []; for (let k = 0; k < 3; k++) a.push(await sweep(label)); return Math.min(...a); };
    const withIt = await best('this ticket (the steps on)');
    await page.evaluate(() => { const g = window.__game; g.paint.host.paintedOver = undefined; g.facilityMask = f => { const b = g.facilityBox(f); if (!b) return null; const x0 = Math.floor(b[0] / 0.5) * 0.5, y0 = Math.floor(b[1] / 0.5) * 0.5, x1 = Math.ceil(b[2] / 0.5) * 0.5, y1 = Math.ceil(b[3] / 0.5) * 0.5; return { x0, y0, x1, y1, mask: new Uint8Array(Math.round((x1 - x0) / 0.5) * Math.round((y1 - y0) / 0.5)).fill(1) }; }; });
    const before = await best('before this ticket (the box zones, no starter step)');
    await page.evaluate(() => { const g = window.__game; g.paint.host.paintedOver = window.__perfPO; g.facilityMask = window.__perfMask; });
    console.log(`  a stroke sweep over the practice area costs ${withIt.toFixed(1)} ms now against ${before.toFixed(1)} ms before (the best of three each)`);
    check(withIt <= before * 1.25 + 3, `the stroke costs what it cost: ${withIt.toFixed(1)} ms against ${before.toFixed(1)} ms`);
    lap('perf done');
  }
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
}
console.log(bad ? `${bad} check(s) FAILED` : legacy ? 'legacy run done (the checks that failed are the bug)' : 'all checks ok');
process.exit(bad ? 1 : 0);

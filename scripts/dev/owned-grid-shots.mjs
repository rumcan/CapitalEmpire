// T339 (#966): no build grid on land you have already bought. In-game check and shots. On a golf game with two blocks bought (one built on:
// grass, a green and a bunker, as in the owner's picture; one still bare), every tool that turns the faint grid on (the Course paint brush,
// Paths & drives, the town Paint tool, the Car park tool, the clubhouse ghost) is set in hand and the game's own grid call is read (what it passed
// the layer: the map grid, the half grid, the owned land); the layer's draw is then repeated into an empty off-screen target with those very
// arguments, so what is read back is the grid alone (no ground, no animation), and each lit pixel is classed by the tile under it: land the player
// owns (must be none) or land for sale (must be some). The 2D overlay is read for the gold property outline: the seam between two owned blocks
// must carry none of it, the outer boundary must. The grid is faint (10% white), so each view is also shot with the grid's strength raised
// --boost times (a debug amplification of ext/map-grid's LOOK, so the lines read in a picture).
//   node scripts/dev/owned-grid-shots.mjs --base http://localhost:5186/ --out E:/ClaudeTemp/T339 --tag after [--expect clean] [--seed 1] [--seed-town 7] [--boost 5] [--bench]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; fresh profiles and no saves written. Without --expect it prints the
// numbers only (the "before" run); with --expect clean a failed check exits 1. --bench times the grid pass with and without the owned land.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5186/'), out = opt('out', 'E:/ClaudeTemp/T339'), tag = opt('tag', 'after'), seedTown = opt('seed-town', '7'), seedRange = opt('seed', '1');
const expectClean = opt('expect', '') === 'clean', ZOOM = +opt('zoom', '0.25'), BOOST = +opt('boost', '5'), bench = args.includes('--bench');
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : expectClean ? 'FAIL' : 'note'} ${what}`); if (!ok && expectClean) bad++; };
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(300);
};
const jpg = async (png, name) => { const f = join(out, `${name}-${tag}.jpg`); await sharp(png).jpeg({ quality: 90, mozjpeg: true }).toFile(f); console.log('  ' + f); return f; };
const shot = async (page, name) => jpg(await page.screenshot({ type: 'png' }), name);
const look = (page, x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [x, y, z]);
const prep = async page => {
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(() => {
    const g = window.__game; g.prebake = () => {}; g.sandboxUnlock = true; g.setSpeed(0); window.__night = 0; g.nightAmount = () => window.__night; g.waterClock = 0;
    g.traffic.budget.money = Math.max(g.traffic.budget.money, 1e8);
    const p = g.golf.progress; if (p) { for (const k of ['who', 'welcome']) if (!p.seen.includes(k)) p.seen.push(k); if (p.tour) p.tour.off = true; }
    g.setShowGrid(true); g.emit();
  });
  await spy(page);
};
/** the golf land as the engine reads it (course + parcels, less the practice area for sale), and a point-in-it test for node */
const landOf = page => page.evaluate(() => { const G = window.__game.golf; return { course: G.course, parcel: G.parcel, parcels: G.parcels ?? null, practiceLot: G.practiceLot ?? null }; });
const ownedFn = L => {
  const rs = [L.course, ...(L.parcels ?? [L.parcel])], q = L.practiceLot, inR = (r, x, y) => x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3];
  return (x, y) => !(q && inR(q, x, y)) && rs.some(r => inR(r, x, y));
};
/** buys blocks next to the land (the second next to the first), returns their rects */
const buyBlocks = (page, n) => page.evaluate(n => {
  const g = window.__game, got = [], touch = (a, b) => (a[0] + a[2] === b[0] || b[0] + b[2] === a[0]) && Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]) > 0 || (a[1] + a[3] === b[1] || b[1] + b[3] === a[1]) && Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]) > 0;
  for (let k = 0; k < n; k++) {
    const offers = g.land.offers().filter(o => !o.why), pick = (k ? offers.find(o => touch(o.rect, got[got.length - 1])) : null) ?? offers[0];
    if (!pick) break;
    if (g.buyLandBlock([...pick.rect], pick.price)) got.push([...pick.rect]);
  }
  return got;
}, n);
/** builds on a bought block as the owner's picture has it: mown rough all over, a green and a bunker beside it (course cells; no brush rules) */
const buildOn = (page, r) => page.evaluate(async r => {
  const g = window.__game, m = await import('/src/game/ext/course-grid/index.ts'), S = m.SURF, grid = g.courseGrid; if (!grid) return false;
  const P = (pts, s) => g.courseGridChanged(m.fillPolygon(grid, pts.map(([x, y]) => ({ x, y })), s, 1, 0), true);
  const [x, y, w, h] = r;
  P([[x + 1, y + 1], [x + w - 1, y + 1], [x + w - 1, y + h - 1], [x + 1, y + h - 1]], S.rough);
  g.courseGridChanged(m.paintDisc(grid, x + w * 0.42, y + h * 0.5, 6.5, S.green, 1, 0), true);
  g.courseGridChanged(m.paintDisc(grid, x + w * 0.42 + 9.5, y + h * 0.5 - 2, 3.5, S.bunker, 1, 0), true);
  return true;
}, r);
/** puts a spy on the layer's draw: the arguments of the game's own last call are kept (window.__gridArgs), the layer's draw itself is window.__gridDraw */
const spy = page => page.evaluate(() => {
  const L = window.__game.gridLayer, draw = L.draw; window.__gridDraw = draw;
  L.draw = function (...a) { window.__gridArgs = a; return draw.apply(this, a); };
});
/** the grid alone, as the game's last call drew it: the layer's draw repeated into an empty off-screen target with the same arguments, read back,
 *  each lit pixel classed by the tile under it (deep inside the land the player owns, or deep outside it); land is the golf land data */
const coverage = (page, land) => page.evaluate(land => {
  const g = window.__game, a = window.__gridArgs, L = g.gridLayer; if (!a) return null;
  const gl = a[0], view = a[1], W = g.cw, H = g.ch;
  const rs = [land.course, ...(land.parcels ?? [land.parcel])], q = land.practiceLot, inR = (r, x, y) => x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3];
  const owned = (x, y) => !(q && inR(q, x, y)) && rs.some(r => inR(r, x, y));
  const deep = (x, y, v) => [[.75, .75], [-.75, .75], [.75, -.75], [-.75, -.75]].every(([dx, dy]) => owned(x + dx, y + dy) === v);
  const prevFb = gl.getParameter(gl.FRAMEBUFFER_BINDING), prevVp = gl.getParameter(gl.VIEWPORT), prevTex = gl.getParameter(gl.TEXTURE_BINDING_2D), prevClear = gl.getParameter(gl.COLOR_CLEAR_VALUE);
  const tex = gl.createTexture(), fb = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  const drew = window.__gridDraw.apply(L, a), px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, prevFb); gl.viewport(prevVp[0], prevVp[1], prevVp[2], prevVp[3]); gl.clearColor(prevClear[0], prevClear[1], prevClear[2], prevClear[3]); gl.bindTexture(gl.TEXTURE_2D, prevTex); gl.deleteFramebuffer(fb); gl.deleteTexture(tex);
  let own = 0, sale = 0, lit = 0;
  for (let r = 0; r < H; r++) for (let x = 0; x < W; x++) {
    if (px[(r * W + x) * 4 + 3] < 3) continue; lit++;
    const sy = H - 1 - r, X = (x + 0.5 - view.cw / 2) / view.ze + view.X, Y = (sy + 0.5 - view.ch / 2) / view.ze + view.Y, A = X / 64, B = Y / 32, tx = (A + B) / 2, ty = (B - A) / 2;
    if (deep(tx, ty, true)) own++; else if (deep(tx, ty, false)) sale++;
  }
  const own8 = a[8]; // (after the fix: the owned land the game passed)
  return { drew, lit, own, sale, map: a[4], half: a[5], ownedRects: own8 ? own8.rects.length : null };
}, land);
/** the tool in hand, a shot as drawn, the grid alone counted, a shot with the grid's strength raised */
async function gridPair(page, name, land, pointer = [2, 2]) {
  await page.mouse.move(pointer[0], pointer[1]); await page.waitForTimeout(400); await settle(page, 400);
  await boost(page, 1); await jpg(await page.screenshot({ type: 'png' }), name);
  const r = await coverage(page, land);
  console.log(`  ${name}: map grid ${r?.map}, half grid ${r?.half}, owned rects passed ${r?.ownedRects}; grid pixels on owned land ${r?.own}, on land for sale ${r?.sale} (${r?.lit} lit)`);
  await boost(page, BOOST); await page.waitForTimeout(300); await jpg(await page.screenshot({ type: 'png' }), `${name}-x${BOOST}`); await boost(page, 1);
  return r ?? { own: -1, sale: -1, lit: -1, ownedRects: null, half: null };
}
/** the grid's strength raised (or put back): the module the engine draws with, its LOOK table */
const boost = (page, k) => page.evaluate(async k => {
  const m = await import('/src/game/ext/map-grid/index.ts'); window.__look0 ??= { ...m.LOOK };
  for (const key of Object.keys(window.__look0)) m.LOOK[key] = Math.min(0.9, window.__look0[key] * k);
}, k);
/** gold pixels (the property outline) on the 2D overlay within r css px of a tile point */
const goldAt = (page, x, y, r = 14) => page.evaluate(([x, y, r]) => {
  const g = window.__game, s = g.screen(x, y), d = g.ov.getImageData(Math.max(0, Math.round(s.x - r * g.dpr)), Math.max(0, Math.round(s.y - r * g.dpr)), Math.round(2 * r * g.dpr), Math.round(2 * r * g.dpr)).data;
  let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40 && d[i] > 190 && d[i + 1] > 140 && d[i + 2] < 90) n++;
  return n;
}, [x, y, r]);
const gridTools = [
  ['course-brush', g => { g.setTool('course'); g.paint.setHole?.(1); g.paint.setBrush?.('fairway', 0); }],
  ['paths-drives', g => { g.setTool('path'); }],
  ['town-paint', g => { g.setTool('paint'); }],
  ['car-park', g => { g.setTool('park'); }],
];
/** the camera spot for block b: the middle of its centre and its corner farthest from the old land, so land for sale fills the other half of the view */
const pickView = (b, owned) => {
  const c = { x: b[0] + b[2] / 2, y: b[1] + b[3] / 2 };
  const away = [[b[0], b[1]], [b[0] + b[2], b[1]], [b[0], b[1] + b[3]], [b[0] + b[2], b[1] + b[3]]]
    .map(([x, y]) => ({ x, y, free: [[6, 6], [-6, 6], [6, -6], [-6, -6]].filter(([dx, dy]) => !owned(x + dx, y + dy)).length })).sort((p, q) => q.free - p.free)[0];
  return { c, view: { x: (c.x + away.x) / 2, y: (c.y + away.y) / 2 } };
};
const toScreen = (page, x, y) => page.evaluate(([x, y]) => { const q = window.__game.screen(x, y), g = window.__game; return { x: q.x / g.dpr, y: q.y / g.dpr }; }, [x, y]);

try {
  /** a fresh browser profile (its own storage: a game saved by one page is not loaded by the next) with no saves written */
  const fresh = async () => {
    const c = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await c.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });
    await c.route('**/*', r => { const x = r.request(); return x.method() !== 'GET' && x.method() !== 'HEAD' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue(); });
    return c;
  };
  const ctx = await fresh();

  // ---- the old nine's start: a big course, parcels, a town round it
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}?start=town&seed=${seedTown}`, { timeout: 300000, waitUntil: 'commit' });
  await page.waitForFunction(() => window.__game?.ready && window.__game.golf, null, { timeout: 300000 });
  await prep(page);
  const bought = await buyBlocks(page, 2);
  check(bought.length === 2, 'two blocks bought next to the land');
  // the second block is built on (grass, a green, a bunker): the owner's picture; the first stays bare (pegged out)
  const b2 = bought[bought.length - 1];
  check(await buildOn(page, b2), 'the second block is built on: rough, a green and a bunker');
  let L = await landOf(page), owned = ownedFn(L);
  console.log('golf land', JSON.stringify(L), 'bought', JSON.stringify(bought));
  const { c: c2, view } = pickView(b2, owned);
  await look(page, view.x, view.y, ZOOM); await settle(page, 3000);

  // normal play: Select (no grid in it), the property outline
  await page.evaluate(() => { window.__game.setTool('select'); window.__game.emit(); });
  await page.mouse.move(2, 2); await settle(page, 600);
  await shot(page, '01-select-normal-play');
  // the outline: the seam between two owned blocks must carry none, the outer boundary must
  const seam = (() => { // a point on a shared edge of two owned rects, well inside the shared stretch
    const rs = [...(L.parcels ?? [L.parcel])];
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (a[0] + a[2] === b[0] || b[0] + b[2] === a[0]) { const y0 = Math.max(a[1], b[1]), y1 = Math.min(a[1] + a[3], b[1] + b[3]); if (y1 - y0 >= 12) return { x: a[0] + a[2] === b[0] ? b[0] : a[0], y: (y0 + y1) / 2, a, b }; }
      if (a[1] + a[3] === b[1] || b[1] + b[3] === a[1]) { const x0 = Math.max(a[0], b[0]), x1 = Math.min(a[0] + a[2], b[0] + b[2]); if (x1 - x0 >= 12) return { x: (x0 + x1) / 2, y: a[1] + a[3] === b[1] ? b[1] : a[1], a, b }; }
    }
    return null;
  })();
  const edgeOut = (() => { // a point on the outer boundary: the middle of a side of the second block that has land for sale beyond it
    const r = b2, sides = [[r[0], r[1] + r[3] / 2, -3, 0], [r[0] + r[2], r[1] + r[3] / 2, 3, 0], [r[0] + r[2] / 2, r[1], 0, -3], [r[0] + r[2] / 2, r[1] + r[3], 0, 3]];
    const s = sides.find(([x, y, dx, dy]) => !owned(x + dx, y + dy)); return s ? { x: s[0], y: s[1] } : null;
  })();
  console.log('seam', JSON.stringify(seam), 'outer edge', JSON.stringify(edgeOut));
  if (seam) { await look(page, seam.x, seam.y, 0.2); await settle(page, 1500); const n = await goldAt(page, seam.x, seam.y); check(n === 0, `the seam between two owned blocks carries no gold outline (${n} px)`); }
  if (edgeOut) { await look(page, edgeOut.x, edgeOut.y, 0.2); await settle(page, 1500); const n = await goldAt(page, edgeOut.x, edgeOut.y); check(n > 0, `the property's outer boundary carries the gold outline (${n} px)`); }
  await look(page, view.x, view.y, ZOOM); await settle(page, 1500);

  // every tool that turns the grid on
  for (const [name, set] of gridTools) {
    await page.evaluate(`(${set.toString()})(window.__game); window.__game.emit();`); await settle(page, 700);
    const r = await gridPair(page, `02-${name}`, L);
    check(r.own === 0, `${name}: no grid on land the player owns (${r.own} px)`);
    check(r.sale > 200, `${name}: land for sale still shows the grid (${r.sale} px)`);
    check(r.ownedRects > 0, `${name}: the game gives the grid layer the land the player owns (${r.ownedRects} rectangles)`);
    check(r.half === false, `${name}: a golf game has no 1 m half grid (${r.half})`);
  }
  // a placement in hand in a tool that shows the grid: the clubhouse ghost (Course > Buildings) on the built-on block
  await page.evaluate(() => { const g = window.__game; g.placeClubhouse(true); g.emit(); });
  { const s = await toScreen(page, c2.x, c2.y); await page.mouse.move(s.x, s.y); await page.waitForTimeout(500);
    const armed = await page.evaluate(() => ({ tool: window.__game.tool, clubPlacing: window.__game.clubPlacing })); console.log('clubhouse ghost', JSON.stringify(armed));
    const r = await gridPair(page, '03-clubhouse-ghost', L, [s.x, s.y]);
    check(r.own === 0, `the clubhouse ghost in hand: no grid on land the player owns (${r.own} px)`); check(r.sale > 200, `the clubhouse ghost in hand: land for sale still shows the grid (${r.sale} px)`); }
  await page.evaluate(() => { const g = window.__game; g.placeClubhouse(false); g.setTool('select'); g.emit(); });
  // Land for sale open (a side mode in Select): the overlay, the property outlined clearly
  await page.evaluate(() => { const g = window.__game; g.setTool('select'); g.openLandSale(); g.emit(); }); await settle(page, 800);
  await page.mouse.move(2, 2); await page.waitForTimeout(300);
  await shot(page, '04-land-for-sale-open');
  await page.evaluate(() => window.__game.closeLandSale());
  // the overview: the whole property at the district zoom, outline only
  await page.evaluate(() => { window.__game.setTool('select'); });
  await look(page, L.parcel[0] + L.parcel[2] / 2 - 20, L.parcel[1] + L.parcel[3] / 2, 0.04); await settle(page, 2500); await shot(page, '05-overview-outline-4pct');
  if (bench) {
    // the cost of the grid pass at this size: the same pass with the owned land and with none, timed over many passes with a 1 px read-back
    // to wait for the GPU (the view straddles the edge, so the pass is not skipped)
    await page.evaluate(() => { window.__game.setTool('paint'); }); await look(page, view.x, view.y, ZOOM); await settle(page, 2500);
    const cost = await page.evaluate(async () => {
      const g = window.__game, m = await import('/src/game/ext/map-grid/index.ts'), L = g.gridLayer, glc = g.gl.gl, view = g.gl.view, z = g.cam.z, dpr = g.dpr, px = new Uint8Array(4);
      const own = m.propertyOf(g.golf), none = m.NO_LAND, many = m.ownedLand(Array.from({ length: m.MAX_OWNED }, (_, i) => [i * 3, i * 3, 2, 2]));
      const run = (o, N = 150) => { glc.readPixels(0, 0, 1, 1, glc.RGBA, glc.UNSIGNED_BYTE, px); const t0 = performance.now(); for (let i = 0; i < N; i++) window.__gridDraw.call(L, glc, view, z, dpr, true, false, [], g.net, o); glc.readPixels(0, 0, 1, 1, glc.RGBA, glc.UNSIGNED_BYTE, px); return (performance.now() - t0) / N; };
      const res = { none: [], own: [], many: [] }; run(none, 20);
      for (let k = 0; k < 5; k++) { res.none.push(run(none)); res.own.push(run(own)); res.many.push(run(many)); }
      const med = a => a.slice().sort((p, q) => p - q)[a.length >> 1];
      return { none: med(res.none), own: med(res.own), many: med(res.many), rects: own.rects.length, canvas: [g.cw, g.ch] };
    });
    console.log(`  grid pass, ms: no owned land ${cost.none.toFixed(3)}, this property (${cost.rects} rects) ${cost.own.toFixed(3)}, 32 rects ${cost.many.toFixed(3)} at ${cost.canvas.join('x')}`);
  }
  await ctx.close();

  // ---- the new range start: a bare plot, a block bought, the build in hand (T288) and the clubhouse ghost
  const ctx2 = await fresh(), p2 = await ctx2.newPage();
  p2.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  p2.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await p2.goto(`${base}?start=range&seed=${seedRange}`, { timeout: 300000, waitUntil: 'commit' });
  await p2.waitForFunction(() => window.__game?.ready && window.__game.golf && window.__game.range?.bareGate, null, { timeout: 300000 });
  await prep(p2);
  const got2 = await buyBlocks(p2, 1);
  check(got2.length === 1, 'a block bought next to the home plot');
  await buildOn(p2, got2[0]);
  L = await landOf(p2); owned = ownedFn(L);
  console.log('range land', JSON.stringify(L), 'bought', JSON.stringify(got2));
  /** the home plot's point (u along the road, v away from it) in tiles (as scripts/dev/bare-start-shots.mjs) */
  const homePt = (u, v) => p2.evaluate(([u, v]) => {
    const g = window.__game, [px, py] = g.golf.range.home, f = g.golf.dir, W = 70, D = 150;
    return f === 2 ? { x: px + u, y: py + v } : f === 0 ? { x: px + W - u, y: py + D - v } : f === 1 ? { x: px + v, y: py + W - u } : { x: px + D - v, y: py + u };
  }, [u, v]);
  // T288: the driving range in hand (Select): its ghost on the plot, the property outlined round it
  await p2.evaluate(() => { const g = window.__game; g.setTool('select'); g.placeRangePart('range'); });
  { const m = await homePt(35, 60), h = await homePt(35, 12); await look(p2, m.x, m.y, 0.12); await settle(p2, 2500);
    const s = await toScreen(p2, h.x, h.y); await p2.mouse.move(s.x, s.y); await p2.waitForTimeout(500); }
  const ph = await p2.evaluate(() => !!window.__game.placing); check(ph, 'the driving range is in hand (T288)');
  await shot(p2, '06-range-ghost-in-hand');
  // the clubhouse ghost under the Course tool (Buildings): the grid is on in this tool; on the bought block's built-on grass
  await p2.evaluate(() => { const g = window.__game; g.cancelPlacing(); g.placeClubhouse(true); g.emit(); });
  const { c: c3, view: v3 } = pickView(got2[0], owned);
  await look(p2, v3.x, v3.y, ZOOM); await settle(p2, 3000);
  const s2 = await toScreen(p2, c3.x, c3.y); await p2.mouse.move(s2.x, s2.y); await p2.waitForTimeout(500);
  console.log('buildings', JSON.stringify(await p2.evaluate(() => ({ tool: window.__game.tool, clubPlacing: window.__game.clubPlacing }))));
  const r2 = await gridPair(p2, '07-range-clubhouse-ghost', L, [s2.x, s2.y]);
  check(r2.own === 0, `the range start, clubhouse ghost in hand: no grid on land the player owns (${r2.own} px)`);
  check(r2.sale > 200, `the range start, clubhouse ghost in hand: land for sale still shows the grid (${r2.sale} px)`);
  await ctx2.close();
} finally { await browser.close(); }
console.log(bad ? `${bad} check(s) failed` : 'done');
process.exit(bad ? 1 : 0);
